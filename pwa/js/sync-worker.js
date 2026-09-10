/**
 * pwa/js/sync-worker.js - Client-seitiger Sync-Orchestrator mit Outbox-Batching & Exponential Backoff
 * Gewährleistet lokale Event-Sourcing-Verlässlichkeit und Offline-First Resilienz.
 */

class MobileSyncWorker {
    static normalizeServerUrl(value) {
        const url = new URL(String(value || '').trim());
        const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
            url.username || url.password || url.search || url.hash || url.pathname !== '/') {
            throw new Error('Bitte eine HTTPS-Serveradresse ohne Pfad angeben. HTTP ist nur auf diesem Gerät (localhost) erlaubt.');
        }
        return url.origin;
    }

    static hasValidSession(settings) {
        return Boolean(settings && settings.device_id && settings.access_token &&
            Number.isFinite(Date.parse(settings.expires_at)) && Date.parse(settings.expires_at) > Date.now());
    }

    static canReconnectServer(previousUrl, nextUrl) {
        if (!previousUrl || previousUrl === nextUrl) return true;
        try {
            const previous = new URL(previousUrl);
            const next = new URL(nextUrl);
            // IndexedDB belongs to an origin, including scheme and port.
            // Do not imply a safe migration by sending credentials from an old
            // HTTP app into HTTPS: its old code/context is not trustworthy.
            return previous.origin === next.origin;
        } catch (_error) { return false; }
    }

    constructor(db) {
        this.db = db;
        this.isSyncing = false;
        this.backoffDelayMs = 1000;
        this.maxBackoffMs = 60000;
        this.autoSyncTimer = null;
        this.onSyncProgress = null;
    }

    async request(baseUrl, route, settings, options = {}) {
        const response = await fetch(`${baseUrl}/api/v1/sync/${route}`, {
            ...options,
            headers: {
                ...options.headers,
                'Authorization': `Bearer ${settings.access_token}`,
                'X-Device-Id': settings.device_id
            },
            redirect: 'error',
            credentials: 'omit',
            cache: 'no-store'
        });
        if (response.status === 401 || response.status === 403) {
            // Nur die betroffene Sitzung löschen, nie Offline-Arbeit/Outbox.
            const current = await this.db.app_settings.get('server_config');
            if (current && current.access_token === settings.access_token) {
                const { access_token, expires_at, ...unpaired } = current;
                await this.db.app_settings.put(unpaired);
            }
            const error = new Error('Kopplung abgelaufen oder abgewiesen. Bitte am Desktop einen neuen Token erzeugen und erneut koppeln. Offline-Daten bleiben erhalten.');
            error.code = 'AUTH_REQUIRED';
            throw error;
        }
        if (!response.ok) throw new Error(`${route}: HTTP ${response.status}`);
        return response;
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
        let conflictCount = 0;

        try {
            const settings = await this.db.app_settings.get('server_config');
            if (!settings || !settings.server_url || !MobileSyncWorker.hasValidSession(settings)) {
                const result = { status: 'UNPAIRED', message: 'Bitte erneut koppeln. Offline-Daten bleiben erhalten.' };
                if (typeof this.onSyncProgress === 'function') this.onSyncProgress(result);
                return result;
            }

            const baseUrl = MobileSyncWorker.normalizeServerUrl(settings.server_url);
            const deviceId = settings.device_id;

            // 1. PUSH: Ungesendete Outbox-Einträge sammeln
            const pendingMutations = await this.db.sync_outbox
                .where('status')
                .equals('PENDING')
                .limit(50)
                .toArray();

            if (pendingMutations && pendingMutations.length > 0) {
                const pushResponse = await this.request(baseUrl, 'push', settings, {
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
                        const submitted = new Set(pendingMutations.map(m => m.uuid));
                        const acked = [...new Set(result.acked_uuids)].filter(uuid => submitted.has(uuid));
                        await this.db.sync_outbox.bulkDelete(acked);
                        pushCount = acked.length;
                    }
                    if (pushCount !== pendingMutations.length) {
                        throw new Error('Nicht alle Änderungen wurden bestätigt. Unbestätigte Einträge bleiben in der Offline-Warteschlange.');
                    }
                    conflictCount = Array.isArray(result.conflicts) ? result.conflicts.length : 0;
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

                        const uploadRes = await this.request(baseUrl, 'photo-upload', settings, {
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
                        // Kein SUCCESS, wenn Dateien fehlen oder die Anmeldung abgewiesen wurde.
                        throw photoErr;
                    }
                }
            }

            // 3. PULL: Stammdaten-Delta vom Desktop abrufen
            const lastSync = await this.db.app_settings.get('last_sync_timestamp');
            const pullResponse = await this.request(baseUrl, 'pull', settings, {
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
                        // Der Server liefert einen Vollbestand. Alte Lohndaten aus
                        // früheren Versionen dürfen nicht in diesem Cache bleiben.
                        await this.db.cache_mitarbeiter.clear();
                        await this.db.cache_mitarbeiter.bulkPut(pullResult.data.mitarbeiter);
                    }
                    if (pullResult.data.lv_positionen && this.db.cache_lv_positionen) {
                        await this.db.cache_lv_positionen.bulkPut(pullResult.data.lv_positionen);
                    }
                    await this.db.app_settings.put({ key: 'last_sync_timestamp', value: pullResult.server_time });
                    pullUpdated = true;
                } else {
                    throw new Error('Ungültige Stammdaten-Antwort vom Sync Hub.');
                }
            }

            const result = {
                status: conflictCount ? 'CONFLICT' : 'SUCCESS',
                pushCount,
                photoCount,
                pullUpdated,
                conflictCount,
                ...(conflictCount ? { message: `${conflictCount} Konflikt(e) im Desktop-Hub prüfen. Die übertragenen Daten liegen dort zur Schlichtung vor.` } : {}),
                timestamp: new Date().toISOString()
            };
            if (typeof this.onSyncProgress === 'function') this.onSyncProgress(result);
            return result;

        } catch (err) {
            console.warn(`[SyncWorker] Sync fehlgeschlagen, Backoff ${(this.backoffDelayMs / 1000)}s:`, err.message);
            this.backoffDelayMs = Math.min(this.backoffDelayMs * 2, this.maxBackoffMs);
            const result = { status: err.code === 'AUTH_REQUIRED' ? 'UNPAIRED' : 'ERROR', error: err.message };
            if (typeof this.onSyncProgress === 'function') this.onSyncProgress(result);
            return result;
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
