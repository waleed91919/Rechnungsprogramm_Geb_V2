/**
 * views/SyncView.js - Desktop Synchronisations- & PWA-Hub-Center
 */

class SyncView {
    constructor() {
        this.status = null;
        this.conflicts = [];
        this.pairing = null;
    }

    static escape(value) {
        return String(value ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);
    }

    async render() {
        this.status = await window.api.getSyncStatus();
        this.conflicts = await window.api.getSyncConflicts();
        // Navigation ist rein lesend: kein Listener und kein Token entstehen.
        if (!this.status.isRunning) this.pairing = null;
        const pairing = this.pairing;
        const config = this.status.config || {};
        const esc = SyncView.escape;

        let conflictRows = '';
        if (!this.conflicts || this.conflicts.length === 0) {
            conflictRows = `<tr><td colspan="6" style="text-align: center; color: #166534; padding: 20px;">Keine offenen Konflikte im Desktop-Hub.</td></tr>`;
        } else {
            this.conflicts.forEach(c => {
                conflictRows += `
                    <tr>
                        <td><strong>#${Number(c.id)}</strong></td>
                        <td><span class="badge" style="background:#fee2e2; color:#b91c1c;">${esc(c.entity_type)}</span></td>
                        <td>${esc(c.client_device_id)}</td>
                        <td>${esc(c.conflict_reason)}</td>
                        <td>${new Date(c.created_at).toLocaleString('de-DE')}</td>
                        <td>
                            <button class="btn btn-secondary" onclick="SyncView.resolveConflict(${Number(c.id)}, 'RESOLVED_SERVER')" style="padding: 4px 8px; font-size: 12px;">Desktop-Vorrang</button>
                            <button class="btn btn-primary" onclick="SyncView.resolveConflict(${Number(c.id)}, 'RESOLVED_CLIENT')" style="padding: 4px 8px; font-size: 12px;">Mobil übernehmen</button>
                        </td>
                    </tr>
                `;
            });
        }

        const isRunning = this.status && this.status.isRunning;
        const serverUrl = isRunning ? this.status.serverUrl || '' : '';
        const pairingJson = pairing ? esc(JSON.stringify(pairing, null, 2)) : 'Noch kein Token erzeugt.';

        return `
            <section class="sync-hub">
            <style>
                .sync-hub { color: #1e293b; }
                .sync-hub .card { background: #fff; }
                .sync-hub label { display: block; min-width: 0; font-size: 13px; }
                .sync-hub .form-input, .sync-hub .form-select {
                    display: block; width: 100%; box-sizing: border-box; min-width: 0;
                    margin-top: 6px; padding: 9px 10px; border: 1px solid #94a3b8;
                    border-radius: 6px; background: #fff; color: #0f172a; font-size: 13px;
                }
                .sync-hub .btn {
                    display: inline-block; padding: 10px 14px; border: 1px solid #cbd5e1;
                    border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;
                    background: #fff; color: #334155; line-height: 1.4;
                }
                .sync-hub .btn-primary { background: #1366ec; color: #fff; border-color: #1366ec; }
                .sync-hub .btn-danger { background: #fff1f2; color: #9f1239; border-color: #fda4af; }
                .sync-hub .btn:disabled { opacity: .5; cursor: not-allowed; }
                .sync-hub :is(button,input,select):focus-visible { outline: 2px solid #1366ec; outline-offset: 3px; }
                .sync-hub .view-header { flex-wrap: wrap; gap: 16px; }
            </style>
            <div class="view-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <div>
                    <h1 style="font-size: 24px; font-weight: bold; color: var(--text-color, #1e293b);">
                        📡 Local-First P2P Sync & Mobile PWA Hub
                    </h1>
                    <p style="color: #64748b; font-size: 13px; margin-top: 4px;">
                        Verbindet Baustellen-Smartphones direkt im lokalen WLAN/LAN ohne Cloud-Zwang
                    </p>
                </div>
                <div>
                    ${isRunning 
                        ? `<button class="btn btn-danger" onclick="SyncView.toggleServer(false)">Sync Hub stoppen & alle Sitzungen widerrufen</button>`
                        : `<button class="btn btn-primary" onclick="SyncView.toggleServer(true)">▶ Sync Hub starten</button>`
                    }
                </div>
            </div>

            <div class="card" style="padding: 20px; margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <h3 style="font-size: 16px; margin-bottom: 12px;">Verbindung bewusst freigeben</h3>
                <p style="font-size: 13px; margin-bottom: 16px; color: #475569;">
                    Standard: gestoppt und nur auf diesem Computer erreichbar. Für Smartphones im LAN ist HTTPS
                    mit einem auf den Geräten vertrauenswürdigen Zertifikat erforderlich. Nicht ins Internet freigeben.
                </p>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px;">
                    <label>Erreichbarkeit
                        <select id="hub-host" class="form-select">
                            <option value="127.0.0.1" ${config.host !== '0.0.0.0' ? 'selected' : ''}>Nur dieser Computer</option>
                            <option value="0.0.0.0" ${config.host === '0.0.0.0' ? 'selected' : ''}>LAN / Smartphones (HTTPS erforderlich)</option>
                        </select>
                    </label>
                    <label>Port <input id="hub-port" class="form-input" type="number" min="1024" max="65535" value="${Number(config.port) || 38400}"></label>
                    <label>Zertifikat: absoluter PEM-Dateipfad <input id="hub-cert" class="form-input" value="${esc(config.sslCertPath)}" placeholder="C:\\Zertifikate\\hub-cert.pem"></label>
                    <label>Privater Schlüssel: absoluter PEM-Dateipfad <input id="hub-key" class="form-input" value="${esc(config.sslKeyPath)}" placeholder="C:\\Zertifikate\\hub-key.pem"></label>
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 16px; margin: 16px 0;">
                    <label><input id="hub-tls" type="checkbox" ${config.useTls ? 'checked' : ''}> HTTPS aktivieren</label>
                    <label><input id="hub-autostart" type="checkbox" ${config.autoStart ? 'checked' : ''}> Bei Programmstart automatisch starten (Opt-in)</label>
                </div>
                <button class="btn btn-secondary" onclick="SyncView.saveConfig()">Einstellungen speichern & Hub stoppen</button>
            </div>

            <!-- Server Status Card -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 24px;">
                <div class="card" style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                        <h3 style="font-size: 16px; font-weight: bold;">Server-Status</h3>
                        <span class="badge" style="background:${isRunning ? '#dcfce7; color:#15803d;' : '#fee2e2; color:#b91c1c;'}">
                            ${isRunning ? '● ONLINE (Port ' + this.status.port + ')' : '○ GESTOPPT'}
                        </span>
                    </div>
                    <div style="font-size: 13px; color: #475569; line-height: 1.6;">
                        <div><strong>PWA-Adresse:</strong> <span id="hub-server-url" style="overflow-wrap:anywhere;">${esc(serverUrl) || 'Hub ist gestoppt'}</span></div>
                        <div><strong>Modus:</strong> ${config.host === '0.0.0.0' ? 'LAN, nur mit HTTPS' : 'Nur dieser Computer, nicht vom Smartphone erreichbar'}</div>
                        <div><strong>Einmaliger Pairing-Token:</strong> <code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; overflow-wrap:anywhere;">${pairing ? esc(pairing.pairing_token) : '-'}</code></div>
                    </div>
                    <div style="margin-top: 16px;">
                        <button class="btn btn-secondary" onclick="SyncView.copyPairingUrl()" style="width: 100%;" ${!isRunning ? 'disabled' : ''}>PWA-Link kopieren</button>
                    </div>
                </div>

                <div class="card" style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; text-align: center;">
                    <h3 style="font-size: 16px; font-weight: bold; margin-bottom: 12px;">Gerät mit Einmal-Token koppeln</h3>
                    <button class="btn btn-primary" onclick="SyncView.createPairing()" style="margin-bottom: 12px;" ${!isRunning ? 'disabled' : ''}>Neuen Pairing-Token erzeugen</button>
                    <div style="display: flex; justify-content: center; align-items: center; margin-bottom: 10px;">
                        <div id="sync-qr-container" style="background: #f8fafc; padding: 14px; border: 1px dashed #cbd5e1; border-radius: 8px; font-family: monospace; font-size: 11px; max-width: 320px; word-break: break-all; text-align: left;">
                            <div style="font-weight: bold; margin-bottom: 4px; color: #0f172a;">Pairing-Payload für Mobile App:</div>
                            ${pairingJson}
                        </div>
                    </div>
                    <p style="font-size: 12px; color: #64748b;">PWA öffnen und Adresse sowie Token eintragen. Token: 5 Minuten, einmalig. Sitzung: bis zu 8 Stunden, spätestens bis zum Hub-Neustart. Token nur dem gewünschten Gerät geben.</p>
                </div>
            </div>

            <!-- Konflikt-Schlichtung & Quarantäne -->
            <div class="card" style="background: white; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden;">
                <div style="padding: 16px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="font-size: 16px; font-weight: bold;">⚠️ Quarantäne & Konflikt-Schlichtung</h3>
                    <span style="font-size: 12px; color: #64748b;">${this.conflicts.length} offene Konflikte</span>
                </div>
                <table class="table" style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                    <thead>
                        <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #475569;">
                            <th style="padding: 12px;">ID</th>
                            <th style="padding: 12px;">Entität</th>
                            <th style="padding: 12px;">Gerät</th>
                            <th style="padding: 12px;">Konfliktgrund</th>
                            <th style="padding: 12px;">Zeitpunkt</th>
                            <th style="padding: 12px;">Schlichtungsaktion</th>
                        </tr>
                    </thead>
                    <tbody>${conflictRows}</tbody>
                </table>
            </div>
            </section>
        `;
    }

    static async toggleServer(start) {
        try {
            if (start) await window.api.startSyncServer();
            else await window.api.stopSyncServer();
            if (window.syncViewInstance) window.syncViewInstance.pairing = null;
            if (typeof switchView === 'function') await switchView('sync');
        } catch (error) {
            alert('Sync Hub konnte nicht umgeschaltet werden: ' + error.message);
        }
    }

    static async saveConfig() {
        try {
            await window.api.configureSyncServer({
                host: document.getElementById('hub-host').value,
                port: Number(document.getElementById('hub-port').value),
                useTls: document.getElementById('hub-tls').checked,
                sslCertPath: document.getElementById('hub-cert').value,
                sslKeyPath: document.getElementById('hub-key').value,
                autoStart: document.getElementById('hub-autostart').checked
            });
            if (window.syncViewInstance) window.syncViewInstance.pairing = null;
            if (typeof switchView === 'function') await switchView('sync');
        } catch (error) {
            alert('Einstellungen nicht gespeichert: ' + error.message);
        }
    }

    static async createPairing() {
        try {
            if (!window.syncViewInstance) return;
            window.syncViewInstance.pairing = await window.api.getSyncPairingPayload();
            if (typeof switchView === 'function') await switchView('sync');
        } catch (error) {
            alert('Kopplung nicht möglich: ' + error.message);
        }
    }

    static async resolveConflict(conflictId, strategy) {
        await window.api.resolveSyncConflict(conflictId, strategy);
        alert(`Konflikt #${conflictId} gelöst mit Strategie: ${strategy}`);
        if (typeof switchView === 'function') {
            switchView('sync');
        }
    }

    static copyPairingUrl() {
        const url = document.getElementById('hub-server-url')?.textContent;
        if (!url || !/^https?:\/\//.test(url)) return;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(url);
            alert('URL in Zwischenablage kopiert: ' + url);
        } else {
            prompt('PWA-Adresse:', url);
        }
    }
}

if (typeof window !== 'undefined') {
    window.SyncView = SyncView;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SyncView;
}
