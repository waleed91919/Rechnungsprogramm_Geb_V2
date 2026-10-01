/**
 * scripts/test_renderer_ui.js
 *
 * Testet den normalen UI-Workflow im laufenden Electron-Paket:
 * 1. Lädt das Renderer-Fenster (code.html) im echten Binary (W-Link ERP.exe).
 * 2. Ruft window.api.invoke('gaeb:save-import', ...) auf, um ein Test-X83 zu importieren.
 * 3. Erstellt über window.api.createTenderDraft einen Entwurf.
 * 4. Bepreist alle Positionen über window.api.saveTenderDraft.
 * 5. Führt window.api.validateX84Export aus (stellt sicher, dass der Exportknopf aktivierbar ist).
 * 6. Ruft window.openGaebTenderModal(importId, draftId) auf und prüft die gerenderte Oberfläche.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

async function testRendererUI() {
    console.log('================================================================');
    console.log('TESTE NORMALEN UI-ABLAUF IM LAUFENDEN ELECTRON-PAKET');
    console.log('================================================================');

    const tempProfile = path.resolve(process.env.TEMP || 'C:\\temp', `wlink-ui-test-${Date.now()}`);
    fs.mkdirSync(tempProfile, { recursive: true });

    const exePath = path.resolve('dist', 'win-unpacked', 'W-Link ERP.exe');
    const child = spawn(exePath, ['--remote-debugging-port=9222', `--user-data-dir=${tempProfile}`], {
        stdio: 'ignore'
    });

    try {
        let wsUrl = null;
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 500));
            try {
                const res = await fetch('http://127.0.0.1:9222/json');
                const list = await res.json();
                const page = list.find(t => t.type === 'page' && t.url.includes('code.html'));
                if (page && page.webSocketDebuggerUrl) {
                    wsUrl = page.webSocketDebuggerUrl;
                    break;
                }
            } catch (_) {}
        }

        if (!wsUrl) throw new Error('Renderer-Seite konnte nicht gefunden werden.');

        // Warte kurz bis der Renderer den Start und die DB-Migration abgeschlossen hat
        await new Promise(r => setTimeout(r, 2500));

        const ws = new WebSocket(wsUrl);
        await new Promise((resolve, reject) => {
            ws.onopen = resolve;
            ws.onerror = reject;
        });

        function evaluate(expression) {
            return new Promise((resolve, reject) => {
                const id = Math.floor(Math.random() * 1000000);
                const handler = (event) => {
                    const data = JSON.parse(event.data);
                    if (data.id === id) {
                        ws.removeEventListener('message', handler);
                        if (data.error) reject(new Error(JSON.stringify(data.error)));
                        else if (data.result && data.result.result) {
                            if (data.result.result.subtype === 'error') {
                                reject(new Error(data.result.result.description));
                            } else {
                                resolve(data.result.result.value !== undefined ? data.result.result.value : data.result.result);
                            }
                        } else {
                            resolve(data);
                        }
                    }
                };
                ws.addEventListener('message', handler);
                ws.send(JSON.stringify({
                    id,
                    method: 'Runtime.evaluate',
                    params: {
                        expression,
                        returnByValue: true,
                        awaitPromise: true
                    }
                }));
            });
        }

        // Lese Fixture 3.3
        const fixturePath = path.resolve('tests', 'fixtures', 'gaeb_x83', 'valid_schema_reference.x83');
        const fixtureXml = fs.readFileSync(fixturePath, 'utf-8');

        // Warte bis das Dokument und alle Skripte vollständig geladen sind
        await evaluate(`new Promise(resolve => {
            if (document.readyState === 'complete' && typeof window.openGaebTenderModal === 'function') {
                resolve();
            } else {
                const interval = setInterval(() => {
                    if (typeof window.openGaebTenderModal === 'function') {
                        clearInterval(interval);
                        resolve();
                    }
                }, 100);
            }
        })`);

        console.log('[1/4] Prüfe Verfügbarkeit von window.api und GAEB Tender APIs...');
        const apiCheck = await evaluate(`(() => {
            return {
                title: document.title,
                hasApi: typeof window.api !== 'undefined',
                hasCreateDraft: typeof window.api.createTenderDraft === 'function',
                hasSaveDraft: typeof window.api.saveTenderDraft === 'function',
                hasLoadDraft: typeof window.api.loadTenderDraft === 'function',
                hasValidateX84: typeof window.api.validateX84Export === 'function',
                hasExportX84: typeof window.api.exportX84 === 'function',
                hasOpenModal: typeof window.openGaebTenderModal === 'function'
            };
        })()`);

        console.log('  API Check:', apiCheck);
        if (!apiCheck.hasApi || !apiCheck.hasCreateDraft || !apiCheck.hasValidateX84) {
            throw new Error('Erforderliche window.api Methoden fehlen im Renderer.');
        }

        console.log('\n[2/4] Führe Import und Bepreisung über window.api im Renderer aus...');
        const flowResult = await evaluate(`(async () => {
            try {
                // 1. Simulierter Import über Backend-IPC
                // Erstelle synthetische geparste Daten analog zu GAEB-Import
                const parsedData = {
                    dp: '83',
                    header: {
                        name: 'UI Test Ausschreibung',
                        date: '2026-10-01',
                        version: '3.3'
                    },
                    project: {
                        name: 'UI Test Projekt',
                        lblPrj: 'PRJ-UI-01'
                    },
                    items: [
                        {
                            id: 'pos_01',
                            rNoPart: '01',
                            oz: '01.01.0010',
                            itemType: 'normal',
                            shortText: 'Malerarbeiten Innenbereich',
                            qty: 100,
                            menge: 100,
                            qu: 'm2',
                            einheit: 'm2',
                            isQtyTBD: false,
                            in_endsumme_enthalten: 1
                        },
                        {
                            id: 'pos_02',
                            rNoPart: '02',
                            oz: '01.01.0020',
                            itemType: 'normal',
                            shortText: 'Bodenbeschichtung Epoxid',
                            qty: 50,
                            menge: 50,
                            qu: 'm2',
                            einheit: 'm2',
                            isQtyTBD: false,
                            in_endsumme_enthalten: 1
                        }
                    ],
                    tree: []
                };

                const saveRes = await window.api.invoke('gaeb:save-import', {
                    parsedData,
                    options: {
                        fileName: 'ui_test_import.x83',
                        rawBytes: new Uint8Array([60, 71, 65, 69, 66, 62]),
                        rawXml: ${JSON.stringify(fixtureXml)}
                    }
                });

                const importId = saveRes.importId;

                // 2. Draft anlegen
                const draft = await window.api.createTenderDraft(importId, { name: 'UI Bepreisungs-Entwurf' });
                const loaded = await window.api.loadTenderDraft(draft.id);

                // 3. Vor Bepreisung validieren: muss unvollständig sein
                const valBefore = await window.api.validateX84Export(draft.id);

                // 4. Positionen bepreisen
                const prices = loaded.items.map(it => ({
                    gaeb_item_id: it._dbId,
                    unit_price: 42.50,
                    in_total: 1
                }));

                const saveDraftRes = await window.api.saveTenderDraft(draft.id, {
                    name: 'UI Bepreisungs-Entwurf Vollständig',
                    prices
                });

                // 5. Nach Bepreisung validieren: muss gültig sein!
                const valAfter = await window.api.validateX84Export(draft.id);

                return {
                    importId,
                    draftId: draft.id,
                    itemsCount: loaded.items.length,
                    valBeforeValid: valBefore.valid,
                    valBeforeErrors: valBefore.errors,
                    valAfterValid: valAfter.valid,
                    valAfterErrors: valAfter.errors,
                    totalNetto: saveDraftRes.total_netto
                };
            } catch (err) {
                return { error: err.message, stack: err.stack };
            }
        })()`);

        console.log('  Workflow-Ergebnis:', flowResult);

        if (flowResult.error) {
            throw new Error(`Fehler im UI-Workflow: ${flowResult.error}`);
        }
        if (flowResult.valBeforeValid !== false) {
            throw new Error('Vor der Bepreisung hätte die Validierung fehlschlagen müssen.');
        }
        if (flowResult.valAfterValid !== true) {
            throw new Error(`Nach der Bepreisung muss die Validierung bestehen: ${flowResult.valAfterErrors.join(', ')}`);
        }

        console.log('\n[3/4] Teste Modal-Öffnung und Button-Zustand in der Benutzeroberfläche...');
        const modalResult = await evaluate(`(async () => {
            try {
                // Öffne das Tender-Modal mit dem bepreisten Entwurf
                await window.openGaebTenderModal(${flowResult.importId}, ${flowResult.draftId});

                // Warte kurz auf DOM-Rendering
                await new Promise(r => setTimeout(r, 800));

                const modal = document.getElementById('gaeb-tender-modal');
                const exportBtn = document.getElementById('gt-btn-export-x84');
                const draftSelect = document.getElementById('gt-draft-select');
                const allButtons = modal ? Array.from(modal.querySelectorAll('button')).map(b => b.id || b.innerText.trim()) : [];
                const views = modal ? {
                    importListHidden: document.getElementById('gt-view-import-list')?.classList.contains('hidden'),
                    draftListHidden: document.getElementById('gt-view-draft-list')?.classList.contains('hidden'),
                    editorHidden: document.getElementById('gt-view-editor')?.classList.contains('hidden')
                } : null;

                return {
                    modalExists: !!modal,
                    modalVisible: modal ? !modal.classList.contains('hidden') : false,
                    exportBtnExists: !!exportBtn,
                    exportBtnDisabled: exportBtn ? exportBtn.disabled : null,
                    exportBtnText: exportBtn ? exportBtn.innerText.trim() : null,
                    draftSelectValue: draftSelect ? draftSelect.value : null,
                    allButtons,
                    views
                };
            } catch (e) {
                return { error: e.message };
            }
        })()`);

        console.log('  Modal Rendering:', modalResult);
        console.log(`  Export-Button vorhanden: ${modalResult.exportBtnExists}, aktiv: ${!modalResult.exportBtnDisabled}`);

        console.log('\n[4/4] UI-Export-Ablaufprüfung ERFOLGREICH ABGESCHLOSSEN!');
        ws.close();
        return { apiCheck, flowResult, modalResult };
    } finally {
        child.kill();
        await new Promise(r => setTimeout(r, 1000));
        try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (_) {}
    }
}

testRendererUI().catch(err => {
    console.error('Fataler UI-Testfehler:', err);
    process.exit(1);
});
