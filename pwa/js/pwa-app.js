if (typeof window === 'undefined') {
    global.window = global;
}

/**
 * pwa/js/pwa-app.js - PWA App-Orchestrator & Touch-UI Controller
 * Erweiterung Phase 5: Kolonnen-Stempelung (ArbZG & BRTV), Notfall-USB-Sync,
 * REB 23.003 Aufmaß mit Web Bluetooth Laser, Offline Plan-Viewer & Barcode Scanner.
 */

window.syncWorker = null;
window.currentActivePunch = null;
window.liveTimerInterval = null;
window.signaturePadCtx = null;
window.isDrawingSignature = false;
window.currentPhotoBlob = null;
window.markupActions = [];
window.markupMode = 'circle';
window.currentPlanViewer = null;
window.currentStempelModus = 'EINZEL';

// Initialisierung bei DOMContentLoaded (im Browser)
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', async () => {
        // 1. Service Worker registrieren mit Version-Handshake & Auto-Update
        if ('serviceWorker' in navigator) {
            try {
                const reg = await navigator.serviceWorker.register('./sw.js');
                console.log('[PWA] ServiceWorker erfolgreich registriert.');

                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    window.location.reload();
                });

                if (navigator.onLine) {
                    try {
                        const vRes = await fetch('./api/v1/sync/version');
                        if (vRes.ok) {
                            const vData = await vRes.json();
                            const curVer = localStorage.getItem('wlink_pwa_ver');
                            if (curVer && curVer !== vData.appVersion) {
                                await reg.update();
                                if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                            }
                            localStorage.setItem('wlink_pwa_ver', vData.appVersion);
                        }
                    } catch (_err) { /* offline */ }
                }
            } catch (e) {
                console.warn('[PWA] ServiceWorker Registrierung fehlgeschlagen:', e.message);
            }
        }

        // 2. Sync Worker initialisieren
        if (typeof window !== 'undefined' && window.mobileDb) {
            syncWorker = new MobileSyncWorker(window.mobileDb);
            syncWorker.onSyncProgress = (res) => updateSyncStatusUI(res);
            syncWorker.startAutoSync(25);
        }

        // 3. Stammdaten in Dropdowns laden
        await loadCachedMasterData();

        // 4. Heutige Stempelungen laden
        await renderTodayPunches();

        // 5. Timer & Datum starten
        startLiveClock();

        // 6. Signatur- & Markup-Canvas einrichten
        setupSignatureCanvas();
        setupMarkupCanvas();

        // 7. Form-Defaults setzen
        const todayStr = new Date().toISOString().split('T')[0];
        const btDate = document.getElementById('bt-datum-input');
        if (btDate) btDate.value = todayStr;
        const vobDate = document.getElementById('vob-beginn-date');
        if (vobDate) vobDate.value = todayStr;

        // 8. Server-Konfiguration laden
        loadServerConfig();

        // 9. Laser-Engine Status-Callback
        if (typeof window !== 'undefined' && window.bluetoothLaserEngine) {
            window.bluetoothLaserEngine.onStatusChangeCallback = (info) => {
                const badge = document.getElementById('laser-status-badge');
                const txt = document.getElementById('laser-status-text');
                if (badge && txt) {
                    if (info.isConnected) {
                        badge.className = 'laser-active-badge';
                        txt.textContent = 'Laser Verbunden';
                    } else {
                        badge.className = 'laser-active-badge disconnected';
                        txt.textContent = info.message || 'Laser getrennt';
                    }
                }
            };

            window.bluetoothLaserEngine.onMeasurementCallback = (_m) => {
                calculateLiveAufmass();
            };
        }
    });
}

// =========================================================================
// Exports für automatisierte Tests (Node.js & Browser)
// =========================================================================
if (typeof module !== 'undefined' && module.exports) {
    const timeModule = require('./app/pwa-time.js');
    const syncModule = require('./app/pwa-sync.js');
    
    module.exports = {
        ...timeModule,
        ...syncModule,
        // specifically requested in original file:
        calculateBRTVWegezeitStaffel: timeModule.calculateBRTVWegezeitStaffel,
        validateArbzgForWorker: timeModule.validateArbzgForWorker,
        handleKolonnenPunch: timeModule.handleKolonnenPunch,
        connectAndPairServer: syncModule.connectAndPairServer,
        disconnectSyncServer: syncModule.disconnectSyncServer,
        loadServerConfig: syncModule.loadServerConfig,
        updateSyncStatusUI: syncModule.updateSyncStatusUI
    };
}
