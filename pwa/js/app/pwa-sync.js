(function() {
    // =========================================================================
    // STUFE 1: Notfall-USB-Sync (.wlsync)
    
    // =========================================================================
    async function exportEmergencyUsbBundle() {
        const pwd = document.getElementById('usb-sync-password')?.value;
        if (!pwd || pwd.length < 4) {
            alert('Bitte ein sicheres Baustellen-Passwort mit mindestens 4 Zeichen eingeben.');
            return;
        }
    
        try {
            const bundleJson = await CryptoSyncBundle.exportToBundle(window.mobileDb, pwd);
            const fname = `wlink_notfall_sync_${new Date().toISOString().split('T')[0]}.wlsync`;
            CryptoSyncBundle.downloadBundle(bundleJson, fname);
            alert(`✓ Notfall-Bundle "${fname}" erfolgreich erstellt und heruntergeladen!\nKopieren Sie die Datei auf Ihren USB-Stick.`);
        } catch (e) {
            alert('Fehler beim Export: ' + e.message);
        }
    }
    
    async function importEmergencyUsbBundle(fileInput) {
        const file = fileInput?.files?.[0] || (fileInput instanceof File ? fileInput : null);
        if (!file) return;
    
        const pwd = prompt('Bitte Baustellen-Passwort für die Entschlüsselung des Bundles eingeben:');
        if (!pwd) {
            if (fileInput && fileInput.value) fileInput.value = '';
            return;
        }
    
        try {
            await importSyncBundle(file, pwd);
        } catch (_e) {
            // Fehler wird bereits in importSyncBundle behandelt
        } finally {
            if (fileInput && fileInput.value) fileInput.value = '';
        }
    }
    
    async function importSyncBundle(fileOrText, pwd) {
        try {
            let text;
            if (typeof fileOrText === 'string') {
                text = fileOrText;
            } else if (fileOrText instanceof File || fileOrText instanceof Blob) {
                text = await new Promise((resolve, reject) => {
                    const r = new FileReader();
                    r.onload = e => resolve(e.target.result);
                    r.onerror = reject;
                    r.readAsText(fileOrText);
                });
            } else if (fileOrText?.files?.[0]) {
                text = await new Promise((resolve, reject) => {
                    const r = new FileReader();
                    r.onload = e => resolve(e.target.result);
                    r.onerror = reject;
                    r.readAsText(fileOrText.files[0]);
                });
            } else {
                throw new Error('Keine gültige Datei oder Bundle-Text angegeben.');
            }
    
            const decrypted = await CryptoSyncBundle.importFromBundle(text, pwd);
    
            // [K-1] Atomares Speichern in window.mobileDb
            if (window.mobileDb) {
                await window.mobileDb.transaction('rw', [window.mobileDb.sync_outbox, window.mobileDb.local_fotos], async () => {
                    if (Array.isArray(decrypted.mutations) && decrypted.mutations.length > 0) {
                        await window.mobileDb.sync_outbox.bulkPut(decrypted.mutations);
                    }
                    if (Array.isArray(decrypted.photos) && decrypted.photos.length > 0) {
                        await window.mobileDb.local_fotos.bulkPut(decrypted.photos);
                    }
                });
            }
    
            if (typeof updateOutboxCount === 'function') await updateOutboxCount();
            if (typeof loadCachedMasterData === 'function') await loadCachedMasterData();
            if (typeof renderTodayPunches === 'function') await renderTodayPunches();
    
            alert(`✓ Notfall-Bundle erfolgreich importiert!\n${decrypted.mutations?.length || 0} Mutationen und ${decrypted.photos?.length || 0} Fotos von Gerät "${decrypted.export_meta?.deviceId || 'unbekannt'}" übernommen.`);
            return decrypted;
        } catch (e) {
            // [H-5] OperationError abfangen & verständlich als "Falsches Passwort" anzeigen
            if (e.name === 'OperationError' || (e.message && e.message.toLowerCase().includes('operationerror'))) {
                alert('Falsches Passwort: Das Baustellen-Passwort zur Entschlüsselung des Bundles ist ungültig.');
            } else {
                alert('Fehler beim Import: ' + e.message);
            }
            throw e;
        }
    }
    
    if (typeof window !== 'undefined') {
        window.importSyncBundle = importSyncBundle;
        window.importEmergencyUsbBundle = importEmergencyUsbBundle;
    }
    
    
    // =========================================================================
    // Sync & Server-Pairing
    
    // =========================================================================
    async function loadServerConfig() {
        if (!window.mobileDb) return;
        const cfg = await window.mobileDb.app_settings.get('server_config');
        if (cfg && cfg.server_url) {
            const urlInput = document.getElementById('sync-server-url');
            if (urlInput) urlInput.value = cfg.server_url;
            updateSyncStatusUI({
                status: MobileSyncWorker.hasValidSession(cfg) ? 'READY' : 'UNPAIRED',
                serverUrl: cfg.server_url
            });
        }
    }
    
    window.pairingInProgress = false;
    
    async function connectAndPairServer() {
        if (pairingInProgress || (syncWorker && syncWorker.isSyncing)) return;
        const url = document.getElementById('sync-server-url')?.value;
        const token = document.getElementById('sync-pairing-token')?.value;
    
        if (!url || !token?.trim()) {
            alert('Bitte Server-URL und einmaligen Pairing-Token vom Desktop angeben.');
            return;
        }
    
        const button = document.getElementById('sync-pair-button');
        pairingInProgress = true;
        if (button) button.disabled = true;
        try {
            const cleanUrl = MobileSyncWorker.normalizeServerUrl(url);
            const previous = await window.mobileDb.app_settings.get('server_config');
            // Keine ausstehenden Buchungen versehentlich in eine andere Firma senden.
            if (!MobileSyncWorker.canReconnectServer(previous?.server_url, cleanUrl)) {
                alert('Ein Wechsel von Adresse, Port oder HTTP zu HTTPS benötigt eine gesonderte Datenübernahme. Die bisherige Offline-Datenbank bleibt erhalten. Vorher alle ausstehenden Daten sichern; für andere Firmen getrennte Browserprofile verwenden.');
                return;
            }
            const deviceId = previous?.device_id || 'MOBILE_PWA_' + crypto.randomUUID();
            const res = await fetch(`${cleanUrl}/api/v1/sync/pair`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                redirect: 'error',
                credentials: 'omit',
                cache: 'no-store',
                body: JSON.stringify({
                    pairing_token: token.trim(),
                    device_id: deviceId
                })
            });
    
            if (res.ok) {
                const pairing = await res.json();
                if (pairing.device_id !== deviceId || !MobileSyncWorker.hasValidSession(pairing)) {
                    throw new Error('Der Hub unterstützt die sichere Kopplung noch nicht. Bitte Desktop aktualisieren.');
                }
                await window.mobileDb.app_settings.put({
                    key: 'server_config',
                    server_url: cleanUrl,
                    device_id: pairing.device_id,
                    access_token: pairing.access_token,
                    expires_at: pairing.expires_at,
                    paired_at: new Date().toISOString()
                });
                document.getElementById('sync-pairing-token').value = '';
                alert('Erfolgreich mit Desktop ERP gekoppelt!');
                await triggerManualSync();
            } else {
                alert('Kopplung fehlgeschlagen (HTTP ' + res.status + ')');
            }
        } catch (e) {
            alert('Verbindungsfehler: ' + e.message);
        } finally {
            pairingInProgress = false;
            if (button) button.disabled = false;
        }
    }
    
    async function disconnectSyncServer() {
        if (!window.mobileDb || (syncWorker && syncWorker.isSyncing) || pairingInProgress) return;
        if (!confirm('Dieses Gerät entkoppeln? Offline-Daten und ausstehende Änderungen bleiben auf diesem Gerät gespeichert.')) return;
        const cfg = await window.mobileDb.app_settings.get('server_config');
        let revoked = !cfg?.access_token;
        if (cfg?.access_token && syncWorker) {
            try {
                await syncWorker.request(MobileSyncWorker.normalizeServerUrl(cfg.server_url), 'unpair', cfg, { method: 'POST' });
                revoked = true;
            } catch (error) {
                revoked = error.code === 'AUTH_REQUIRED';
            }
        }
        if (cfg) {
            const { access_token, expires_at, ...unpaired } = cfg;
            await window.mobileDb.app_settings.put(unpaired);
        }
        updateSyncStatusUI({ status: 'UNPAIRED' });
        alert(revoked ? 'Gerät entkoppelt. Offline-Daten bleiben erhalten.' :
            'Lokal entkoppelt. Der Hub war nicht erreichbar: Dort den Sync Hub stoppen, um alle Sitzungen sofort zu widerrufen.');
    }
    
    async function triggerManualSync() {
        if (!syncWorker) return;
        updateSyncStatusUI({ status: 'SYNCING' });
        const res = await syncWorker.runFullSync();
        updateSyncStatusUI(res);
        await loadCachedMasterData();
        await updateOutboxCount();
        alert(res.status === 'SUCCESS' ? `Synchronisation abgeschlossen! (${res.pushCount} gesendet, Stammdaten aktualisiert)` :
            (res.message || res.error || `Sync-Status: ${res.status}`));
    }
    
    async function updateOutboxCount() {
        if (!window.mobileDb) return;
        const count = await window.mobileDb.sync_outbox.where('status').equals('PENDING').toArray();
        const countLabel = document.getElementById('outbox-count-label');
        if (countLabel) countLabel.textContent = count.length;
    }
    
    function updateSyncStatusUI(info) {
        const dot = document.getElementById('sync-dot');
        const text = document.getElementById('sync-text');
    
        if (info && info.status === 'SUCCESS') {
            if (dot) { dot.className = 'status-dot'; }
            if (text) { text.textContent = 'Verbunden'; }
        } else if (info && info.status === 'ERROR') {
            if (dot) { dot.className = 'status-dot error'; }
            if (text) { text.textContent = 'Fehler'; }
        } else if (info && info.status === 'UNPAIRED') {
            if (dot) dot.className = 'status-dot error';
            if (text) text.textContent = 'Neu koppeln';
        } else if (info && info.status === 'CONFLICT') {
            if (dot) dot.className = 'status-dot error';
            if (text) text.textContent = 'Konflikte prüfen';
        } else if (info && info.status === 'SYNCING') {
            if (text) text.textContent = 'Synchronisiert …';
        } else if (info && info.status === 'READY') {
            if (text) text.textContent = 'Gekoppelt, ungeprüft';
        }
    }
    

    
    // Expose to window for browser
    window.exportEmergencyUsbBundle = exportEmergencyUsbBundle;
    window.importEmergencyUsbBundle = importEmergencyUsbBundle;
    window.importSyncBundle = importSyncBundle;
    window.loadServerConfig = loadServerConfig;
    window.connectAndPairServer = connectAndPairServer;
    window.disconnectSyncServer = disconnectSyncServer;
    window.triggerManualSync = triggerManualSync;
    window.updateOutboxCount = updateOutboxCount;
    window.updateSyncStatusUI = updateSyncStatusUI;
    
    // Export for Node.js tests
    if (typeof module !== 'undefined' && module.exports) {
        module.exports.exportEmergencyUsbBundle = exportEmergencyUsbBundle;
        module.exports.importEmergencyUsbBundle = importEmergencyUsbBundle;
        module.exports.importSyncBundle = importSyncBundle;
        module.exports.loadServerConfig = loadServerConfig;
        module.exports.connectAndPairServer = connectAndPairServer;
        module.exports.disconnectSyncServer = disconnectSyncServer;
        module.exports.triggerManualSync = triggerManualSync;
        module.exports.updateOutboxCount = updateOutboxCount;
        module.exports.updateSyncStatusUI = updateSyncStatusUI;
    }
    
})();
