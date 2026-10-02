/**
 * scripts/test_renderer_ui.js
 *
 * Testet den vollständigen UI-Workflow im laufenden Electron-Paket (EBENE 4 gemäß liesen.txt):
 * 1. Startet das gebaute Electron-Binary (dist/win-unpacked/W-Link ERP.exe) mit Main-Inspector und Renderer-DevTools.
 * 2. Bereitet Testdaten für GAEB 3.3 und GAEB 3.2 über die produktiven Backend-APIs vor.
 * 3. Öffnet das Tender-Modal in der UI (window.openGaebTenderModal):
 *    - Prüft Modal sichtbar
 *    - Prüft Entwurf ausgewählt
 *    - Prüft Export-Button vorhanden und aktiv
 * 4. Führt den Export über den tatsächlichen UI-Button (#gt-btn-export-x84) und TenderController aus:
 *    - Simulierter Dialog-Handler im Testprozess (kontrollierter Hook) stellt Zielpfad bereit
 *    - Prüft Dateierstellung auf Dateisystem
 *    - Re-validiert die geschriebene Datei mit dem produktiven XSD-Service (3.3 & 3.2)
 * 5. Prüft den Dialog-Abbruch über den tatsächlichen UI-Button:
 *    - Simulierter Dialog-Handler liefert { canceled: true }
 *    - Prüft, dass keine Datei erzeugt wird und bestehende Dateien unverändert bleiben
 *    - Prüft, dass die UI keinen Erfolgsstatus meldet
 * 6. Stellt alle Hooks in finally sauber wieder her.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const EXE_PATH = path.resolve(ROOT_DIR, 'dist', 'win-unpacked', 'W-Link ERP.exe');
const FIXTURES_DIR = path.resolve(ROOT_DIR, 'tests', 'fixtures', 'gaeb_x83');
const GAEBEngine = require('../js/gaeb');

async function testRendererUI() {
    console.log('================================================================');
    console.log('EBENE 4: UI-EXPORT-ABLAUF IM ECHTEN ELECTRON-PAKET (liesen.txt)');
    console.log('================================================================');
    console.log(`Executable: ${EXE_PATH}`);

    const testRunId = `ui_run_${Date.now()}`;
    const tempOutputDir = path.resolve(ROOT_DIR, 'dist', 'win-unpacked', `ui_test_out_${testRunId}`);
    fs.mkdirSync(tempOutputDir, { recursive: true });

    const tempProfile = path.resolve(process.env.TEMP || 'C:\\temp', `wlink-profile-${testRunId}`);
    fs.mkdirSync(tempProfile, { recursive: true });

    // Fixtures einlesen und vorbereiten
    const fixture32Path = path.resolve(FIXTURES_DIR, 'independent_pygaeb_da32.x83');
    const fixture33Path = path.resolve(FIXTURES_DIR, 'valid_schema_reference.x83');
    const xmlFixture32 = fs.readFileSync(fixture32Path, 'utf-8');
    const xmlFixture33 = fs.readFileSync(fixture33Path, 'utf-8');
    const parsed32 = GAEBEngine.parseGAEBXML(xmlFixture32);
    const parsed33 = GAEBEngine.parseGAEBXML(xmlFixture33);

    console.log('\n[1/5] Starte W-Link ERP.exe mit Main-Inspector (Port 9223) und DevTools (Port 9222)...');
    const child = spawn(EXE_PATH, [
        '--inspect=9223',
        '--remote-debugging-port=9222',
        `--user-data-dir=${tempProfile}`
    ], { stdio: 'ignore' });

    let wsMain = null;
    let wsRenderer = null;

    try {
        // 1. Verbinde mit Main-Inspector (Port 9223)
        let mainWsUrl = null;
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 500));
            try {
                const res = await fetch('http://127.0.0.1:9223/json');
                const list = await res.json();
                if (list && list[0] && list[0].webSocketDebuggerUrl) {
                    mainWsUrl = list[0].webSocketDebuggerUrl;
                    break;
                }
            } catch (_) {}
        }
        if (!mainWsUrl) throw new Error('Verbindung zum Main-Inspector (Port 9223) fehlgeschlagen.');

        wsMain = new WebSocket(mainWsUrl);
        await new Promise((resolve, reject) => {
            const to = setTimeout(() => reject(new Error('Timeout wsMain')), 10000);
            wsMain.onopen = () => { clearTimeout(to); resolve(); };
            wsMain.onerror = reject;
        });

        // 2. Verbinde mit Renderer DevTools (Port 9222)
        let renWsUrl = null;
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 500));
            try {
                const res = await fetch('http://127.0.0.1:9222/json');
                const list = await res.json();
                const page = list.find(t => t.type === 'page' && t.url.includes('code.html'));
                if (page && page.webSocketDebuggerUrl) {
                    renWsUrl = page.webSocketDebuggerUrl;
                    break;
                }
            } catch (_) {}
        }
        if (!renWsUrl) throw new Error('Verbindung zu Renderer DevTools (Port 9222) fehlgeschlagen.');

        wsRenderer = new WebSocket(renWsUrl);
        await new Promise((resolve, reject) => {
            const to = setTimeout(() => reject(new Error('Timeout wsRenderer')), 10000);
            wsRenderer.onopen = () => { clearTimeout(to); resolve(); };
            wsRenderer.onerror = reject;
        });

        // Warte bis das Fenster und die Skripte stabil initialisiert sind
        await new Promise(r => setTimeout(r, 2500));

        function evaluateMain(expression) {
            return new Promise((resolve, reject) => {
                const id = Math.floor(Math.random() * 1000000);
                const timeout = setTimeout(() => reject(new Error('Timeout in evaluateMain (10s)')), 10000);
                const handler = (event) => {
                    const data = JSON.parse(event.data);
                    if (data.id === id) {
                        clearTimeout(timeout);
                        wsMain.removeEventListener('message', handler);
                        if (data.error) reject(new Error(JSON.stringify(data.error)));
                        else if (data.result && data.result.result) {
                            if (data.result.result.subtype === 'error') {
                                reject(new Error(data.result.result.description));
                            } else {
                                resolve(data.result.result.value !== undefined ? data.result.result.value : data.result.result);
                            }
                        } else resolve(data);
                    }
                };
                wsMain.addEventListener('message', handler);
                wsMain.send(JSON.stringify({
                    id,
                    method: 'Runtime.evaluate',
                    params: { expression, returnByValue: true, awaitPromise: true }
                }));
            });
        }

        function evaluateRenderer(expression) {
            return new Promise((resolve, reject) => {
                const id = Math.floor(Math.random() * 1000000);
                const timeout = setTimeout(() => reject(new Error('Timeout in evaluateRenderer (10s)')), 10000);
                const handler = (event) => {
                    const data = JSON.parse(event.data);
                    if (data.id === id) {
                        clearTimeout(timeout);
                        wsRenderer.removeEventListener('message', handler);
                        if (data.error) reject(new Error(JSON.stringify(data.error)));
                        else if (data.result && data.result.result) {
                            if (data.result.result.subtype === 'error') {
                                reject(new Error(data.result.result.description));
                            } else {
                                resolve(data.result.result.value !== undefined ? data.result.result.value : data.result.result);
                            }
                        } else resolve(data);
                    }
                };
                wsRenderer.addEventListener('message', handler);
                wsRenderer.send(JSON.stringify({
                    id,
                    method: 'Runtime.evaluate',
                    params: { expression, returnByValue: true, awaitPromise: true }
                }));
            });
        }

        // Warte bis openGaebTenderModal im Renderer verfügbar ist
        await evaluateRenderer(`new Promise(resolve => {
            if (typeof window.openGaebTenderModal === 'function') return resolve();
            const interval = setInterval(() => {
                if (typeof window.openGaebTenderModal === 'function') {
                    clearInterval(interval);
                    resolve();
                }
            }, 100);
        })`);

        // Installiere im Renderer einen Hook auf window.alert, damit Alert-Dialoge nicht blockieren
        await evaluateRenderer(`(() => {
            window.__alerts = [];
            window.alert = (msg) => { window.__alerts.push(String(msg)); };
        })()`);

        // Bereite im Main-Prozess den konfigurierbaren Dialog-Hook vor
        await evaluateMain(`(() => {
            const { dialog } = process.mainModule.require('electron');
            global.__origShowSaveDialog = dialog.showSaveDialog;
            global.__nextDialogResult = null;
            dialog.showSaveDialog = async () => {
                if (global.__nextDialogResult) return global.__nextDialogResult;
                return { canceled: true };
            };
        })()`);

        const results = {
            meta: {
                testRunId,
                exePath: EXE_PATH,
                timestamp: new Date().toISOString()
            },
            case_33_ui_export: {},
            case_dialog_cancel: {},
            case_32_ui_export: {}
        };

        // =============================================================
        // TESTFALL 1: GAEB 3.3 Export über echten UI-Button
        // =============================================================
        console.log('\n[2/5] Teste GAEB 3.3 Export über echten UI-Button (#gt-btn-export-x84)...');

        // Testdaten vorbereiten über window.api
        const prep33 = await evaluateRenderer(`(async () => {
            const parsed = ${JSON.stringify(parsed33)};
            const rawXml = ${JSON.stringify(xmlFixture33)};
            const saveRes = await window.api.invoke('gaeb:save-import', {
                parsedData: parsed,
                options: {
                    fileName: 'ui_test_33.x83',
                    gaebVersion: '3.3',
                    rawXml
                }
            });
            const draft = await window.api.createTenderDraft(saveRes.importId, { name: 'UI Test 3.3 Draft' });
            const loaded = await window.api.loadTenderDraft(draft.id);
            const prices = loaded.items.map(it => ({
                gaeb_item_id: it._dbId,
                unit_price: 49.90,
                in_total: 1
            }));
            await window.api.saveTenderDraft(draft.id, { name: 'UI Test 3.3 Bepreist', prices });
            return { importId: saveRes.importId, draftId: draft.id };
        })()`);

        // Tender-Modal öffnen
        await evaluateRenderer(`(async () => {
            await window.openGaebTenderModal(${prep33.importId}, ${prep33.draftId});
        })()`);
        await new Promise(r => setTimeout(r, 800));

        // Verbindliche Prüfungen: Modal sichtbar, Draft ausgewählt, Button aktiv
        const modalState33 = await evaluateRenderer(`(() => {
            const modal = document.getElementById('gaeb-tender-modal');
            const exportBtn = document.getElementById('gt-btn-export-x84');
            const draftSelect = document.getElementById('gt-draft-select');
            return {
                modalExists: !!modal,
                modalVisible: modal ? !modal.classList.contains('hidden') : false,
                draftSelected: draftSelect ? draftSelect.value === String(${prep33.draftId}) : false,
                exportBtnExists: !!exportBtn,
                exportBtnActive: exportBtn ? !exportBtn.disabled : false,
                exportBtnText: exportBtn ? exportBtn.innerText.trim() : ''
            };
        })()`);

        console.log('  Modal-Zustand 3.3:', modalState33);
        if (!modalState33.modalVisible || !modalState33.draftSelected || !modalState33.exportBtnActive) {
            throw new Error(`Modal-Voraussetzung nicht erfüllt: ${JSON.stringify(modalState33)}`);
        }

        // Zieldatei definieren und Main-Dialog-Hook konfigurieren
        const targetFile33 = path.resolve(tempOutputDir, 'ui_export_gaeb33.x84');
        if (fs.existsSync(targetFile33)) fs.unlinkSync(targetFile33);

        await evaluateMain(`(() => {
            global.__nextDialogResult = { canceled: false, filePath: ${JSON.stringify(targetFile33)} };
        })()`);

        // Klicke den echten UI-Button
        console.log('  Klicke #gt-btn-export-x84 über UI-Event...');
        await evaluateRenderer(`(() => {
            window.__alerts = [];
            document.getElementById('gt-btn-export-x84').click();
        })()`);

        // Warte bis der Export abgeschlossen ist (max 8s)
        let exportDone33 = false;
        for (let i = 0; i < 16; i++) {
            await new Promise(r => setTimeout(r, 500));
            const check = await evaluateRenderer(`(() => ({
                alertsCount: window.__alerts.length,
                lastAlert: window.__alerts[window.__alerts.length - 1] || null,
                buttonText: document.getElementById('gt-btn-export-x84')?.innerText.trim()
            }))()`);
            if (check.alertsCount > 0) {
                exportDone33 = true;
                break;
            }
        }

        if (!exportDone33) {
            throw new Error('Timeout beim Warten auf Abschluss des UI-Exports 3.3.');
        }

        // Prüfe Dateierstellung und re-validiere mit XSD
        const fileExists33 = fs.existsSync(targetFile33);
        const fileSize33 = fileExists33 ? fs.statSync(targetFile33).size : 0;
        let xsdValidation33 = null;
        if (fileExists33) {
            const writtenXml = fs.readFileSync(targetFile33, 'utf-8');
            const valRes = await evaluateMain(`(() => {
                const req = process.mainModule.require;
                const path = req('path');
                const asarPath = path.join(process.resourcesPath, 'app.asar');
                const { validateXML } = req(path.join(asarPath, 'main', 'services', 'gaeb-x84-schema-validator'));
                return validateXML(${JSON.stringify(writtenXml)}, '3.3');
            })()`);
            xsdValidation33 = valRes;
        }

        results.case_33_ui_export = {
            targetFile: targetFile33,
            fileExists: fileExists33,
            fileSize: fileSize33,
            xsdValid: xsdValidation33?.valid === true,
            xsdErrors: xsdValidation33?.errors || []
        };

        console.log(`  Datei erzeugt:       ${fileExists33} (${fileSize33} Bytes)`);
        console.log(`  XSD-Re-Validierung:  ${xsdValidation33?.valid ? 'BESTANDEN (0 Fehler)' : 'FEHLER'}`);

        if (!fileExists33 || !xsdValidation33?.valid) {
            throw new Error('Fall 1 fehlgeschlagen: UI-Export 3.3 erzeugte keine valide Datei.');
        }

        // =============================================================
        // TESTFALL 2: Dialog-Abbruch über den UI-Export-Ablauf
        // =============================================================
        console.log('\n[3/5] Teste Dialog-Abbruch über echten UI-Button (#gt-btn-export-x84)...');

        // Vorab bestehende Datei mit bekanntem Inhalt anlegen
        const canaryFile = path.resolve(tempOutputDir, 'canary_untouched.txt');
        const canaryContent = 'UNVERAENDERT_' + Date.now();
        fs.writeFileSync(canaryFile, canaryContent, 'utf-8');
        const canaryMtimeBefore = fs.statSync(canaryFile).mtimeMs;

        // Nicht-existente Zieldatei
        const nonExistentFile = path.resolve(tempOutputDir, 'should_never_exist.x84');
        if (fs.existsSync(nonExistentFile)) fs.unlinkSync(nonExistentFile);

        // Dialog liefert Abbruch
        await evaluateMain(`(() => {
            global.__nextDialogResult = { canceled: true, filePath: undefined };
        })()`);

        // Klicke den echten UI-Button
        await evaluateRenderer(`(() => {
            window.__alerts = [];
            document.getElementById('gt-btn-export-x84').click();
        })()`);

        // Warte kurz
        await new Promise(r => setTimeout(r, 1200));

        // Prüfe Zustand
        const cancelCheck = await evaluateRenderer(`(() => ({
            alertsCount: window.__alerts.length,
            alerts: window.__alerts,
            buttonText: document.getElementById('gt-btn-export-x84')?.innerText.trim()
        }))()`);

        const canaryContentAfter = fs.readFileSync(canaryFile, 'utf-8');
        const canaryMtimeAfter = fs.statSync(canaryFile).mtimeMs;
        const noNewFileCreated = !fs.existsSync(nonExistentFile);
        const canaryUntouched = canaryContentAfter === canaryContent && canaryMtimeBefore === canaryMtimeAfter;
        const noSuccessAlert = cancelCheck.alertsCount === 0;

        results.case_dialog_cancel = {
            noNewFileCreated,
            canaryUntouched,
            noSuccessAlert,
            rendererAlerts: cancelCheck.alerts
        };

        console.log(`  Keine neue Datei erzeugt:      ${noNewFileCreated}`);
        console.log(`  Bestehende Datei unverändert:  ${canaryUntouched}`);
        console.log(`  Keine Erfolgsmeldung in UI:    ${noSuccessAlert}`);

        if (!noNewFileCreated || !canaryUntouched || !noSuccessAlert) {
            throw new Error('Fall 2 fehlgeschlagen: Dialog-Abbruch hinterließ Spuren oder meldete Erfolg.');
        }

        // =============================================================
        // TESTFALL 3: GAEB 3.2 Export über echten UI-Button
        // =============================================================
        console.log('\n[4/5] Teste GAEB 3.2 Export über echten UI-Button (#gt-btn-export-x84)...');

        // Testdaten vorbereiten für 3.2
        const prep32 = await evaluateRenderer(`(async () => {
            const parsed = ${JSON.stringify(parsed32)};
            const rawXml = ${JSON.stringify(xmlFixture32)};
            const saveRes = await window.api.invoke('gaeb:save-import', {
                parsedData: parsed,
                options: {
                    fileName: 'ui_test_32.x83',
                    gaebVersion: '3.2',
                    rawXml
                }
            });
            const draft = await window.api.createTenderDraft(saveRes.importId, { name: 'UI Test 3.2 Draft' });
            const loaded = await window.api.loadTenderDraft(draft.id);
            const prices = loaded.items.map(it => {
                if (it.isHinweistext) return null;
                const isTbd = Boolean(it.isQtyTBD || it.menge === null);
                return {
                    gaeb_item_id: it._dbId,
                    unit_price: 32.50,
                    in_total: isTbd ? 0 : 1
                };
            }).filter(Boolean);
            await window.api.saveTenderDraft(draft.id, { name: 'UI Test 3.2 Bepreist', prices });
            return { importId: saveRes.importId, draftId: draft.id };
        })()`);

        // Tender-Modal für 3.2 öffnen und sicherstellen, dass Entwurf aktiv ist
        await evaluateRenderer(`(async () => {
            await window.openGaebTenderModal(${prep32.importId}, ${prep32.draftId});
        })()`);
        await new Promise(r => setTimeout(r, 800));

        const modalState32 = await evaluateRenderer(`(() => {
            const modal = document.getElementById('gaeb-tender-modal');
            const exportBtn = document.getElementById('gt-btn-export-x84');
            const draftSelect = document.getElementById('gt-draft-select');
            return {
                modalExists: !!modal,
                modalVisible: modal ? !modal.classList.contains('hidden') : false,
                draftSelected: draftSelect ? draftSelect.value === String(${prep32.draftId}) : false,
                exportBtnExists: !!exportBtn,
                exportBtnActive: exportBtn ? !exportBtn.disabled : false,
                exportBtnText: exportBtn ? exportBtn.innerText.trim() : ''
            };
        })()`);

        console.log('  Modal-Zustand 3.2:', modalState32);
        if (!modalState32.modalVisible || !modalState32.draftSelected || !modalState32.exportBtnActive) {
            throw new Error(`Modal-Voraussetzung für 3.2 nicht erfüllt: ${JSON.stringify(modalState32)}`);
        }

        const targetFile32 = path.resolve(tempOutputDir, 'ui_export_gaeb32.x84');
        if (fs.existsSync(targetFile32)) fs.unlinkSync(targetFile32);

        await evaluateMain(`(() => {
            global.__nextDialogResult = { canceled: false, filePath: ${JSON.stringify(targetFile32)} };
        })()`);

        // Klicke den echten UI-Button
        await evaluateRenderer(`(() => {
            window.__alerts = [];
            document.getElementById('gt-btn-export-x84').click();
        })()`);

        // Warte bis der Export abgeschlossen ist
        let exportDone32 = false;
        for (let i = 0; i < 16; i++) {
            await new Promise(r => setTimeout(r, 500));
            const check = await evaluateRenderer(`(() => ({
                alertsCount: window.__alerts.length
            }))()`);
            if (check.alertsCount > 0) {
                exportDone32 = true;
                break;
            }
        }

        if (!exportDone32) {
            throw new Error('Timeout beim Warten auf Abschluss des UI-Exports 3.2.');
        }

        const fileExists32 = fs.existsSync(targetFile32);
        const fileSize32 = fileExists32 ? fs.statSync(targetFile32).size : 0;
        let xsdValidation32 = null;
        if (fileExists32) {
            const writtenXml = fs.readFileSync(targetFile32, 'utf-8');
            const valRes = await evaluateMain(`(() => {
                const req = process.mainModule.require;
                const path = req('path');
                const asarPath = path.join(process.resourcesPath, 'app.asar');
                const { validateXML } = req(path.join(asarPath, 'main', 'services', 'gaeb-x84-schema-validator'));
                return validateXML(${JSON.stringify(writtenXml)}, '3.2');
            })()`);
            xsdValidation32 = valRes;
        }

        results.case_32_ui_export = {
            targetFile: targetFile32,
            fileExists: fileExists32,
            fileSize: fileSize32,
            xsdValid: xsdValidation32?.valid === true,
            xsdErrors: xsdValidation32?.errors || []
        };

        console.log(`  Datei erzeugt:       ${fileExists32} (${fileSize32} Bytes)`);
        console.log(`  XSD-Re-Validierung:  ${xsdValidation32?.valid ? 'BESTANDEN (0 Fehler)' : 'FEHLER: ' + (xsdValidation32?.errors || []).join(', ')}`);

        if (!fileExists32 || !xsdValidation32?.valid) {
            throw new Error(`Fall 3 fehlgeschlagen: UI-Export 3.2 erzeugte keine valide Datei. Fehler: ${(xsdValidation32?.errors || []).join(', ')}`);
        }

        console.log('\n[5/5] UI-EXPORT-PRÜFUNG VOLLSTÄNDIG BESTANDEN!');

        const reportPath = path.resolve(ROOT_DIR, 'dist', 'win-unpacked', 'ui_verification_report.json');
        fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf-8');
        console.log(`Bericht geschrieben nach: ${reportPath}`);

        return results;
    } finally {
        try {
            if (wsMain) {
                await evaluateMain(`(() => {
                    const { dialog } = process.mainModule.require('electron');
                    if (global.__origShowSaveDialog) dialog.showSaveDialog = global.__origShowSaveDialog;
                })()`);
                wsMain.close();
            }
        } catch (_) {}
        if (wsRenderer) wsRenderer.close();

        child.kill();
        await new Promise(r => setTimeout(r, 1000));
        try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (_) {}
        try { fs.rmSync(tempOutputDir, { recursive: true, force: true }); } catch (_) {}
    }
}

testRendererUI().catch(err => {
    console.error('\nFATALER UI-TESTFEHLER in testRendererUI:', err);
    process.exit(1);
});
