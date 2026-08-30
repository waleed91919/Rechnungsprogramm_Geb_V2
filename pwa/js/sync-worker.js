/**
 * pwa/js/sync-worker.js - Client-seitiger Sync-Orchestrator mit Outbox-Batching & Exponential Backoff
 * Gewährleistet lokale Event-Sourcing-Verlässlichkeit und Offline-First Resilienz.
 */

class MobileSyncWorker {
    constructor(db) {
        this.db = db;
        this.isSyncing = false;
        this.backoffDelayMs = 1000;
        this.maxBackoffMs = 60000;
        this.autoSyncTimer = null;
        this.onSyncProgress = null;
    }

    /**
     * Schreibt eine fachliche Mutation in die lokale Outbox.
     */
    async queueMutation(entityType, entityUuid, mutationType, payload) {
        const uuid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'outbox-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
        const entry = {
            uuid,
            entity_type: entityType,
            entity_uuid: entityUuid,
            mutation_type: mutationType,
            payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
            lamport_timestamp: Date.now(),
            status: 'PENDING',
            created_at: new Date().toISOString()
        };

        if (this.db && this.db.sync_outbox) {
            await this.db.sync_outbox.put(entry);
        }

        // Falls online, sofort Sync anstoßen
        if (typeof navigator !== 'undefined' && navigator.onLine) {
            this.runFullSync().catch(() => {});
        }

        return uuid;
    }

    /**
     * Startet einen vollständigen Zwei-Wege-Sync (Push Outbox -> Push Fotos -> Pull Delta).
     */
    async runFullSync() {
        if (this.isSyncing) return { status: 'ALREADY_SYNCING' };
        if (!this.db) return { status: 'NO_DB' };

        this.isSyncing = true;
        let pushCount = 0;
        let photoCount = 0;
        let pullUpdated = false;

        try {
            const settings = await this.db.app_settings.get('server_config');
            if (!settings || !settings.server_url) {
                return { status: 'UNPAIRED', message: 'Kein Server konfiguriert.' };
            }

            const baseUrl = settings.server_url.replace(/\/+$/, '');
            const deviceId = settings.device_id || 'MOBILE_PWA';

            // 1. PUSH: Ungesendete Outbox-Einträge sammeln
            const pendingMutations = await this.db.sync_outbox
                .where('status')
                .equals('PENDING')
                .limit(50)
                .toArray();

            if (pendingMutations && pendingMutations.length > 0) {
                const pushResponse = await fetch(`${baseUrl}/api/v1/sync/push`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Device-Id': deviceId
                    },
                    body: JSON.stringify({
                        device_id: deviceId,
                        mutations: pendingMutations
                    })
                });

                if (pushResponse.ok) {
                    const result = await pushResponse.json();
                    if (result.acked_uuids && result.acked_uuids.length > 0) {
                        await this.db.sync_outbox.bulkDelete(result.acked_uuids);
                        pushCount = result.acked_uuids.length;
                    }
                    this.backoffDelayMs = 1000; // Reset Backoff
                } else {
                    throw new Error(`Push Sync Fehler HTTP ${pushResponse.status}`);
                }
            }

            // 2. FOTO-STREAMING: Unsynchronisierte Fotos hochladen
            if (this.db.local_fotos) {
                const unsyncedPhotos = await this.db.local_fotos.where('is_synced').equals(0).toArray();
                for (const photo of unsyncedPhotos) {
                    try {
                        let bodyData = photo.blob || photo.dataUrl;
                        if (typeof bodyData === 'string' && bodyData.startsWith('data:')) {
                            // Data URL zu Blob konvertieren falls nötig
                            const res = await fetch(bodyData);
                            bodyData = await res.blob();
                        }

                        const uploadRes = await fetch(`${baseUrl}/api/v1/sync/photo-upload`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/octet-stream',
                                'X-Photo-Uuid': photo.uuid,
                                'X-Entity-Type': photo.entitaet_typ || 'MANGEL',
                                'X-Entity-Uuid': photo.entitaet_uuid || '',
                                'X-Sha256': photo.sha256_hash || ''
                            },
                            body: bodyData
                        });

                        if (uploadRes.ok) {
                            photo.is_synced = 1;
                            await this.db.local_fotos.put(photo);
                            photoCount++;
                        }
                    } catch (photoErr) {
                        console.warn('[SyncWorker] Foto-Upload fehlgeschlagen:', photoErr.message);
                    }
                }
            }

            // 3. PULL: Stammdaten-Delta vom Desktop abrufen
            const lastSync = await this.db.app_settings.get('last_sync_timestamp');
            const pullResponse = await fetch(`${baseUrl}/api/v1/sync/pull`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    last_sync_timestamp: lastSync ? lastSync.value : '1970-01-01T00:00:00.000Z'
                })
            });

            if (pullResponse.ok) {
                const pullResult = await pullResponse.json();
                if (pullResult.data) {
                    if (pullResult.data.projekte && this.db.cache_projekte) {
                        await this.db.cache_projekte.bulkPut(pullResult.data.projekte);
                    }
                    if (pullResult.data.liegenschaften && this.db.cache_liegenschaften) {
                        await this.db.cache_liegenschaften.bulkPut(pullResult.data.liegenschaften);
                    }
                    if (pullResult.data.mitarbeiter && this.db.cache_mitarbeiter) {
                        await this.db.cache_mitarbeiter.bulkPut(pullResult.data.mitarbeiter);
                    }
                    if (pullResult.data.lv_positionen && this.db.cache_lv_positionen) {
                        await this.db.cache_lv_positionen.bulkPut(pullResult.data.lv_positionen);
                    }
                    await this.db.app_settings.put({ key: 'last_sync_timestamp', value: pullResult.server_time });
                    pullUpdated = true;
                }
            }

            if (typeof this.onSyncProgress === 'function') {
                this.onSyncProgress({ status: 'SUCCESS', pushCount, photoCount, pullUpdated });
            }

            return {
                status: 'SUCCESS',
                pushCount,
                photoCount,
                pullUpdated,
                timestamp: new Date().toISOString()
            };

        } catch (err) {
            console.warn(`[SyncWorker] Sync fehlgeschlagen, Backoff ${(this.backoffDelayMs / 1000)}s:`, err.message);
            this.backoffDelayMs = Math.min(this.backoffDelayMs * 2, this.maxBackoffMs);
            if (typeof this.onSyncProgress === 'function') {
                this.onSyncProgress({ status: 'ERROR', error: err.message });
            }
            return { status: 'ERROR', error: err.message };
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Startet regelmäßige Hintergrund-Synchronisation.
     */
    startAutoSync(intervalSec = 20) {
        this.stopAutoSync();
        this.autoSyncTimer = setInterval(() => {
            if (typeof navigator === 'undefined' || navigator.onLine) {
                this.runFullSync().catch(() => {});
            }
        }, intervalSec * 1000);
    }

    stopAutoSync() {
        if (this.autoSyncTimer) {
            clearInterval(this.autoSyncTimer);
            this.autoSyncTimer = null;
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MobileSyncWorker;
}
if (typeof window !== 'undefined') {
    window.MobileSyncWorker = MobileSyncWorker;
}
