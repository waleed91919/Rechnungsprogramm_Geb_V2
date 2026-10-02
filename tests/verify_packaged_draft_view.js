/**
 * tests/verify_packaged_draft_view.js
 * 
 * Verifiziert die GAEB-Entwurfsübersicht und Navigation im tatsächlich gebauten
 * Electron-Paket (dist/win-unpacked/W-Link ERP.exe).
 * 
 * Testet:
 * 1. Start der echten Binärdatei mit isoliertem Benutzerprofil
 * 2. Ausführung im echten BrowserWindow (Chromium DOM)
 * 3. GAEB Ausschreibungen -> Importliste -> Klick "Auswählen"
 * 4. Prüfung, dass KEIN "updatedAt is not defined" Alert/Fehler auftritt
 * 5. Prüfung der Entwurfszeilen und Datums-Fallbacks
 * 6. Klick auf "Öffnen" bei Entwurf v2 -> Verifikation der ID im Editor
 * 7. Rücknavigation zur Entwurfsübersicht
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const EXE_PATH = path.resolve(ROOT_DIR, 'dist', 'win-unpacked', 'W-Link ERP.exe');

async function runPackagedDraftVerification() {
    console.log('================================================================');
    console.log('VERIFIKATION IM ECHTEN ELECTRON-PAKET (dist/win-unpacked/W-Link ERP.exe)');
    console.log('================================================================');

    if (!fs.existsSync(EXE_PATH)) {
        throw new Error(`Executable nicht gefunden: ${EXE_PATH}`);
    }

    const testRunId = `draft_run_${Date.now()}`;
    const tempProfile = path.resolve(process.env.TEMP || 'C:\\temp', `wlink-profile-${testRunId}`);
    fs.mkdirSync(tempProfile, { recursive: true });

    const inspectPort = 9235;
    console.log(`Starte ${EXE_PATH} auf Port ${inspectPort}...`);

    const child = spawn(EXE_PATH, [`--inspect=${inspectPort}`, `--user-data-dir=${tempProfile}`], {
        stdio: 'ignore'
    });

    try {
        let wsUrl = null;
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 500));
            try {
                const res = await fetch(`http://127.0.0.1:${inspectPort}/json`);
                const list = await res.json();
                if (list && list[0] && list[0].webSocketDebuggerUrl) {
                    wsUrl = list[0].webSocketDebuggerUrl;
                    break;
                }
            } catch (_) {}
        }

        if (!wsUrl) {
            throw new Error(`Konnte keine V8-Inspector-Verbindung zu Port ${inspectPort} herstellen.`);
        }

        console.log(`Inspector verbunden: ${wsUrl}`);
        const ws = new WebSocket(wsUrl);
        await new Promise((resolve, reject) => {
            ws.onopen = resolve;
            ws.onerror = reject;
        });

        // Warte kurz bis Electron das Hauptfenster geladen hat und der Ausführungskontext stabil ist
        console.log('Warte auf Fenster-Initialisierung (3000ms)...');
        await new Promise(r => setTimeout(r, 3000));

        function evaluate(expression) {
            return new Promise((resolve, reject) => {
                const id = Math.floor(Math.random() * 1000000);
                const timeout = setTimeout(() => {
                    reject(new Error('Timeout bei evaluate (20s)'));
                }, 20000);

                const handler = (event) => {
                    const data = JSON.parse(event.data);
                    if (data.id === id) {
                        clearTimeout(timeout);
                        ws.removeEventListener('message', handler);
                        if (data.error) {
                            reject(new Error(JSON.stringify(data.error)));
                        } else if (data.result && data.result.result) {
                            if (data.result.result.subtype === 'error') {
                                reject(new Error(data.result.result.description || 'Evaluation error'));
                            } else {
                                resolve(data.result.result.value !== undefined ? data.result.result.value : data.result.result);
                            }
                        } else {
                            resolve(data);
                        }
                    }
                };
                ws.addEventListener('message', handler);
                ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
            });
        }

        console.log('\n[1/3] Bereite Testdatenbank im Paket vor...');
        const prepResult = await evaluate(`(async () => {
            const req = process.mainModule.require;
            const path = req('path');
            const asarPath = path.join(process.resourcesPath, 'app.asar');
            const db = req(path.join(asarPath, 'db')).db;
            const gaebRepo = req(path.join(asarPath, 'db', 'repositories', 'gaeb_repository'));
            const tenderRepo = req(path.join(asarPath, 'db', 'repositories', 'gaeb_tender_repo'));

            // Minimaler X83 Import
            const parsedX83 = {
                projectInfo: { name: 'E2E Packaged Testprojekt', gaebVersion: '3.3', exchangePhase: 'X83' },
                hierarchy: [{ id: 'cat1', name: 'Abschnitt 1', items: [{ id: 'i1', kurztext: 'Position A', menge: 10, einheit: 'm' }] }],
                categories: [{ id: 'cat1', name: 'Abschnitt 1' }],
                items: [{ id: 'i1', categoryId: 'cat1', kurztext: 'Position A', menge: 10, einheit: 'm' }]
            };

            const saved = gaebRepo.saveX83Import(db, parsedX83, { fileName: 'e2e_packaged.x83', rawXml: '<GAEB/>' });
            const importId = saved.importId;

            // 2 Entwürfe mit unterschiedlichen Daten
            const d1 = tenderRepo.createTenderDraft(db, importId, { name: 'Entwurf Alpha v1' });
            const d2 = tenderRepo.createTenderDraft(db, importId, { name: 'Entwurf Beta v2' });

            // Datumswerte gezielt setzen
            db.prepare("UPDATE gaeb_tender_drafts SET updated_at = '2026-10-01 10:30:00' WHERE id = ?").run(d1.id);
            db.prepare("UPDATE gaeb_tender_drafts SET updated_at = '2026-10-02 16:45:00' WHERE id = ?").run(d2.id);

            return {
                importId,
                draft1Id: d1.id,
                draft2Id: d2.id
            };
        })()`);

        console.log('  Vorbereiteter Import ID:', prepResult.importId);
        console.log('  Draft 1 ID:', prepResult.draft1Id);
        console.log('  Draft 2 ID:', prepResult.draft2Id);

        console.log('\n[2/3] Führe vollständigen UI-Navigationsweg im Chromium BrowserWindow aus...');
        const uiResult = await evaluate(`(async () => {
            const { BrowserWindow } = process.mainModule.require('electron');
            const allWins = BrowserWindow.getAllWindows();
            if (allWins.length === 0) throw new Error('Kein BrowserWindow im Paket gefunden!');
            const win = allWins[0];

            return await win.webContents.executeJavaScript(\`
                (async () => {
                    const testLog = { steps: [], errors: [], alerts: [] };
                    window.alert = (msg) => { testLog.alerts.push(msg); };

                    // 1. GAEB-Menü öffnen
                    testLog.steps.push('openGaebTenderModal');
                    await window.openGaebTenderModal();

                    const modal = document.getElementById('gaeb-tender-modal');
                    if (!modal || modal.classList.contains('hidden')) {
                        throw new Error('GAEB-Modal ist nicht sichtbar');
                    }

                    // 2. Klick "Auswählen" beim vorbereiteten Import
                    testLog.steps.push('selectImport');
                    await window.GaebTenderController.selectImport(\${${prepResult.importId}});

                    if (testLog.alerts.length > 0) {
                        throw new Error('Alert aufgetreten nach selectImport: ' + testLog.alerts.join('; '));
                    }

                    const draftList = document.getElementById('gt-view-draft-list');
                    if (!draftList || draftList.classList.contains('hidden')) {
                        throw new Error('Entwurfsübersicht nicht sichtbar nach selectImport');
                    }

                    // 3. Tabellenzeilen prüfen
                    const tbody = document.getElementById('gt-draft-list-tbody');
                    const rows = tbody.querySelectorAll('tr');
                    testLog.rowCount = rows ? rows.length : 0;
                    if (testLog.rowCount < 2) {
                        throw new Error('Zu wenige Entwurfszeilen gerendert: ' + testLog.rowCount);
                    }

                    const date1 = rows[0].querySelectorAll('td')[6].textContent.trim();
                    const date2 = rows[1].querySelectorAll('td')[6].textContent.trim();
                    testLog.dates = [date1, date2];

                    if (!date1.includes('2026-10-01') || !date2.includes('2026-10-02')) {
                        throw new Error('Unerwartete Datumsanzeige: ' + JSON.stringify(testLog.dates));
                    }

                    // 4. Klick auf "Öffnen" bei Entwurf 2
                    testLog.steps.push('openDraft_2');
                    await window.GaebTenderController.openDraft(\${${prepResult.draft2Id}}, \${${prepResult.importId}});

                    const editor = document.getElementById('gt-view-editor');
                    if (!editor || editor.classList.contains('hidden')) {
                        throw new Error('Editor-Ansicht nicht sichtbar nach openDraft');
                    }
                    testLog.openedDraftId = window.GaebTenderState.currentDraftId;
                    if (testLog.openedDraftId !== \${${prepResult.draft2Id}}) {
                        throw new Error('Falscher Entwurf im Editor geladen: ' + testLog.openedDraftId);
                    }

                    // 5. Zurück zur Entwurfsübersicht
                    testLog.steps.push('backToDraftList');
                    await window.GaebTenderController.backToDraftList();

                    if (!draftList || draftList.classList.contains('hidden')) {
                        throw new Error('Entwurfsübersicht nach backToDraftList() nicht sichtbar');
                    }

                    testLog.success = true;
                    return testLog;
                })()
            \`);
        })()`);

        console.log('  UI Ergebnis:', JSON.stringify(uiResult, null, 2));

        if (!uiResult || !uiResult.success) {
            throw new Error(`UI-Verifikation im Paket fehlgeschlagen: ${JSON.stringify(uiResult)}`);
        }

        console.log('\n[3/3] Erfolgreich verifiziert:');
        console.log('  - GAEB Ausschreibungen -> Auswählen öffnet Entwürfe ohne "updatedAt is not defined" Fehler');
        console.log(`  - Entwurfszeilen gerendert: ${uiResult.rowCount}`);
        console.log(`  - Datumsanzeigen formatiert: ${uiResult.dates.join(', ')}`);
        console.log(`  - Entwurf #${uiResult.openedDraftId} im Editor geöffnet`);
        console.log('  - Rücknavigation zur Entwurfsübersicht erfolgreich');
        console.log('\n================================================================');
        console.log('PAKET-VERIFIKATION ERFOLGREICH BESTANDEN!');
        console.log('================================================================');

        ws.close();
    } finally {
        child.kill();
        try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (_) {}
    }
}

runPackagedDraftVerification().catch(err => {
    console.error('\nFEHLER BEI DER PAKET-VERIFIKATION:', err);
    process.exit(1);
});
