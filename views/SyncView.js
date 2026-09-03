/**
 * views/SyncView.js - Desktop Synchronisations- & PWA-Hub-Center
 */

class SyncView {
    constructor() {
        this.status = null;
        this.conflicts = [];
    }

    async render() {
        this.status = await window.api.getSyncStatus();
        this.conflicts = await window.api.getSyncConflicts();
        const pairing = await window.api.getSyncPairingPayload();

        let conflictRows = '';
        if (!this.conflicts || this.conflicts.length === 0) {
            conflictRows = `<tr><td colspan="6" style="text-align: center; color: #16a34a; padding: 20px;">✅ Keine offenen Synchronisationskonflikte. Alle Daten sind synchron.</td></tr>`;
        } else {
            this.conflicts.forEach(c => {
                conflictRows += `
                    <tr>
                        <td><strong>#${c.id}</strong></td>
                        <td><span class="badge" style="background:#fee2e2; color:#b91c1c;">${c.entity_type}</span></td>
                        <td>${c.client_device_id}</td>
                        <td>${c.conflict_reason}</td>
                        <td>${new Date(c.created_at).toLocaleString('de-DE')}</td>
                        <td>
                            <button class="btn btn-secondary" onclick="SyncView.resolveConflict(${c.id}, 'RESOLVED_SERVER')" style="padding: 4px 8px; font-size: 11px;">Desktop-Vorrang</button>
                            <button class="btn btn-primary" onclick="SyncView.resolveConflict(${c.id}, 'RESOLVED_CLIENT')" style="padding: 4px 8px; font-size: 11px;">Mobil übernehmen</button>
                        </td>
                    </tr>
                `;
            });
        }

        const isRunning = this.status && this.status.isRunning;
        const serverUrl = pairing ? pairing.server_url : 'http://localhost:38400';
        const pairingJson = pairing ? JSON.stringify(pairing, null, 2) : '{}';

        return `
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
                        ? `<button class="btn btn-danger" onclick="SyncView.toggleServer(false)">⏹ Sync Hub stoppen</button>`
                        : `<button class="btn btn-primary" onclick="SyncView.toggleServer(true)">▶ Sync Hub starten</button>`
                    }
                </div>
            </div>

            <!-- Server Status Card -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
                <div class="card" style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                        <h3 style="font-size: 16px; font-weight: bold;">Server-Status</h3>
                        <span class="badge" style="background:${isRunning ? '#dcfce7; color:#15803d;' : '#fee2e2; color:#b91c1c;'}">
                            ${isRunning ? '● ONLINE (Port ' + this.status.port + ')' : '○ GESTOPPT'}
                        </span>
                    </div>
                    <div style="font-size: 13px; color: #475569; line-height: 1.6;">
                        <div><strong>Lokale PWA-Adresse:</strong> <a href="${serverUrl}" target="_blank" style="color: #2563eb;">${serverUrl}</a></div>
                        <div><strong>WebSocket Hub:</strong> ${pairing ? pairing.ws_url : '-'}</div>
                        <div><strong>Gültiger Pairing-Token:</strong> <code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${pairing ? pairing.pairing_token : '-'}</code></div>
                    </div>
                    <div style="margin-top: 16px;">
                        <button class="btn btn-secondary" onclick="SyncView.copyPairingUrl('${serverUrl}')" style="width: 100%;">📋 PWA-Link kopieren</button>
                    </div>
                </div>

                <div class="card" style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; text-align: center;">
                    <h3 style="font-size: 16px; font-weight: bold; margin-bottom: 12px;">Mobile Geräte-Kopplung (QR-Code)</h3>
                    <div style="display: flex; justify-content: center; align-items: center; margin-bottom: 10px;">
                        <div id="sync-qr-container" style="background: #f8fafc; padding: 14px; border: 1px dashed #cbd5e1; border-radius: 8px; font-family: monospace; font-size: 11px; max-width: 320px; word-break: break-all; text-align: left;">
                            <div style="font-weight: bold; margin-bottom: 4px; color: #0f172a;">Pairing-Payload für Mobile App:</div>
                            ${pairingJson}
                        </div>
                    </div>
                    <p style="font-size: 12px; color: #64748b;">Öffnen Sie die PWA auf dem Smartphone und scannen Sie den Code zur Kopplung.</p>
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
        `;
    }

    static async toggleServer(start) {
        if (start) {
            await window.api.startSyncServer();
        } else {
            await window.api.stopSyncServer();
        }
        if (typeof switchView === 'function') {
            switchView('sync');
        }
    }

    static async resolveConflict(conflictId, strategy) {
        await window.api.resolveSyncConflict(conflictId, strategy);
        alert(`Konflikt #${conflictId} gelöst mit Strategie: ${strategy}`);
        if (typeof switchView === 'function') {
            switchView('sync');
        }
    }

    static copyPairingUrl(url) {
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
