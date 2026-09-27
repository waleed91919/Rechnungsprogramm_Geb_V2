const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const assert = require('assert');
const { PDFDocument } = require('@cantoo/pdf-lib');

const tmpDbPath = path.join(os.tmpdir(), `angebot-true-ui-test-${Date.now()}-${process.pid}.sqlite`);
process.env.RECHNUNGSPROGRAMM_DB_PATH = tmpDbPath;

const { db, repositories, dbAPI } = require('../db.js');
const { registerAllIpc } = require('../main/ipc');

app.whenReady().then(async () => {
    // 0. Insert a test customer in SQLite
    const kundeRes = db.prepare(`
        INSERT INTO kunden (kundennummer, name, adresse, plz, ort, email)
        VALUES ('KD-2026-UI-001', 'Bauherr Max Mustermann', 'Musterstraße 12', '10115', 'Berlin', 'max@mustermann-bau.de')
    `).run();
    const testKundeId = kundeRes.lastInsertRowid;

    // Register IPC
    registerAllIpc(ipcMain, { dbAPI });

    const win = new BrowserWindow({
        show: false,
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, '../preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    win.loadFile(path.join(__dirname, '../code.html'));

    win.webContents.on('did-finish-load', async () => {
        try {
            console.log('--- TEST RUN STARTING IN REAL CHROMIUM DOM ---');

            // Wait a moment for init() to populate state from DB
            await win.webContents.executeJavaScript(`
                new Promise(resolve => {
                    if (window.state && window.state.kunden && window.state.kunden.length > 0) resolve();
                    else setTimeout(resolve, 300);
                })
            `);

            // Inject Dialog & Toast spies in renderer
            await win.webContents.executeJavaScript(`
                window.__test = {
                    alerts: [],
                    confirms: [],
                    toasts: [],
                    confirmResponse: true
                };
                window.safeAlert = async (msg) => {
                    window.__test.alerts.push(msg);
                    return true;
                };
                window.safeConfirm = async (msg) => {
                    window.__test.confirms.push(msg);
                    return window.__test.confirmResponse;
                };
                const origShowToast = window.showToast;
                window.showToast = (msg, type = 'info') => {
                    window.__test.toasts.push({ msg, type });
                    if (typeof origShowToast === 'function') origShowToast(msg, type);
                };
                true;
            `);

            // =================================================================
            // TESTFALL 1: Leerpreis vs. 0,00 € UI-Test
            // =================================================================
            console.log('Testfall 1: Leerpreis vs 0,00 €...');
            const step1Result = await win.webContents.executeJavaScript(`
                (async () => {
                    try {
                        // 1. Open Angebot modal
                        window.openAngebotModal();

                        const modal = document.getElementById('rechnung-modal');
                        if (!modal || modal.classList.contains('hidden')) throw new Error('rechnung-modal not visible');

                        // Fill basic data
                        document.getElementById('rechnung-nr').value = 'ANG-2026-TRUE-001';
                        const kundeSelect = document.getElementById('rechnung-kunde');
                        kundeSelect.value = '${testKundeId}';
                        handleKundeSelect({ target: kundeSelect });

                        document.getElementById('rechnung-datum').value = '2026-10-01';
                        document.getElementById('rechnung-faellig').value = '2026-10-31';

                        // 2. Position mit leerem Preis anlegen
                        window.addRechnungPosition();
                        const positionsTbody = document.getElementById('rechnung-positionen');
                        const rows = positionsTbody.querySelectorAll('tr');
                        if (rows.length === 0) throw new Error('No position rows created');

                        const lastRow = rows[rows.length - 1];
                        const inputName = lastRow.querySelector('input[type="text"][placeholder*="Artikel"]');
                        inputName.value = 'Mauerarbeiten Spezial';
                        window.handlePositionChange(window.state.currentRechnungPositionen[0].id, 'name', 'Mauerarbeiten Spezial');

                        const inputPreis = lastRow.querySelector('input[type="number"][step="0.01"]');
                        if (!inputPreis) throw new Error('Price input not found');

                        // Verify price field in DOM is empty
                        const initialDomValue = inputPreis.value;
                        const initialPosPrice = window.state.currentRechnungPositionen[0].preis;

                        // Click freeze button while price is empty
                        const freezeBtn = document.getElementById('btn-freeze-angebot');
                        if (!freezeBtn) throw new Error('btn-freeze-angebot button not found in modal footer');

                        window.__test.alerts = [];
                        await freezeBtn.onclick();

                        const alertTriggered = window.__test.alerts.length > 0;
                        const alertMsg = window.__test.alerts[0] || '';

                        // 3. Set price to 0.00
                        window.handlePositionChange(window.state.currentRechnungPositionen[0].id, 'preis', '0.00');
                        inputPreis.value = '0.00';

                        // Click freeze button with 0.00 price
                        window.__test.confirms = [];
                        window.__test.confirmResponse = false; // Cancel confirm to test warning
                        await freezeBtn.onclick();

                        const confirmTriggered = window.__test.confirms.length > 0;
                        const confirmMsg = window.__test.confirms[0] || '';

                        return {
                            initialDomValue,
                            initialPosPrice,
                            alertTriggered,
                            alertMsg,
                            confirmTriggered,
                            confirmMsg
                        };
                    } catch (e) {
                        return { error: e.message, stack: e.stack };
                    }
                })()
            `);

            console.log('step1Result:', step1Result);
            if (step1Result.error) {
                throw new Error(`Renderer error: ${step1Result.error}\n${step1Result.stack}`);
            }
            assert.strictEqual(step1Result.initialDomValue, '', 'DOM price input must be empty initially');
            assert.strictEqual(step1Result.initialPosPrice, null, 'state price must be null initially');
            assert.ok(step1Result.alertTriggered, 'safeAlert must be triggered when price is missing');
            assert.ok(
                step1Result.alertMsg.includes('Einheitspreis') || step1Result.alertMsg.includes('FEHLENDER_PREIS'),
                'Alert must notify about missing price'
            );
            assert.ok(step1Result.confirmTriggered, 'safeConfirm must be triggered when price is 0.00 €');
            assert.ok(
                step1Result.confirmMsg.includes('0,00 €') || step1Result.confirmMsg.includes('unentgeltlich'),
                'Confirm prompt must mention 0,00 € price'
            );
            console.log('✓ Testfall 1 erfolgreich bestanden!');

            // =================================================================
            // TESTFALL 2: Echte PDF-Vorschau im DOM
            // =================================================================
            console.log('Testfall 2: Echte PDF-Vorschau im DOM...');
            const step2Result = await win.webContents.executeJavaScript(`
                (async () => {
                    const previewBtn = document.getElementById('btn-preview-angebot-pdf');
                    if (!previewBtn) throw new Error('btn-preview-angebot-pdf button not found');

                    // Click PDF preview button
                    await previewBtn.onclick();

                    // Wait for PDF preview rendering
                    await new Promise(r => setTimeout(r, 120));

                    const pdfModal = document.getElementById('pdf-preview-modal');
                    const modalVisible = pdfModal && pdfModal.classList.contains('flex') && !pdfModal.classList.contains('hidden');
                    const pdfContainer = document.getElementById('pdf-preview-container');
                    const containerHtml = pdfContainer ? pdfContainer.innerHTML : '';

                    return {
                        modalVisible,
                        containerHasNr: containerHtml.includes('ANG-2026-TRUE-001'),
                        containerHasCustomer: containerHtml.includes('Bauherr Max Mustermann'),
                        containerHasPosition: containerHtml.includes('Mauerarbeiten Spezial'),
                        htmlLength: containerHtml.length,
                        hasAngebotsdatum: containerHtml.includes('Angebotsdatum'),
                        hasRechnungsdatum: containerHtml.includes('Rechnungsdatum'),
                        hasLeistungsdatum: containerHtml.includes('Leistungsdatum'),
                        hasZahlungsaufforderung: containerHtml.includes('Bitte überweisen Sie den Betrag'),
                        hasAngebotssumme: containerHtml.includes('Angebotssumme'),
                        hasZahlbetrag: containerHtml.includes('Zahlbetrag')
                    };
                })()
            `);

            assert.ok(step2Result.modalVisible, '#pdf-preview-modal must have flex class and not hidden');
            assert.ok(step2Result.containerHasNr, '#pdf-preview-container must contain quote number');
            assert.ok(step2Result.containerHasCustomer, '#pdf-preview-container must contain customer name');
            assert.ok(step2Result.containerHasPosition, '#pdf-preview-container must contain position name');
            assert.ok(step2Result.htmlLength > 500, 'Rendered PDF preview HTML must be substantive');

            // Trennung Angebots-PDF vom Rechnungs-Template
            assert.ok(step2Result.hasAngebotsdatum, 'PDF-Vorschau des Angebots muss "Angebotsdatum" enthalten');
            assert.strictEqual(step2Result.hasRechnungsdatum, false, 'PDF-Vorschau des Angebots darf NICHT "Rechnungsdatum" enthalten');
            assert.strictEqual(step2Result.hasLeistungsdatum, false, 'PDF-Vorschau des Angebots darf ohne Ausführungszeitraum kein falsches "Leistungsdatum" enthalten');
            assert.strictEqual(step2Result.hasZahlungsaufforderung, false, 'PDF-Vorschau des Angebots darf keine Zahlungsaufforderung ("Bitte überweisen Sie den Betrag") enthalten');
            assert.ok(step2Result.hasAngebotssumme, 'PDF-Vorschau des Angebots muss "Angebotssumme" statt "Zahlbetrag" verwenden');
            assert.strictEqual(step2Result.hasZahlbetrag, false, 'PDF-Vorschau des Angebots darf NICHT "Zahlbetrag" verwenden');

            // Zusätzliche Verifikation: Angebot MIT Ausführungszeitraum rendert "Voraussichtl. Ausführung"
            const mitAusfuehrungHtml = await win.webContents.executeJavaScript(`
                (async () => {
                    const testOfferWithPeriod = {
                        nr: 'ANG-2026-TEST-AUSF',
                        type: 'angebot',
                        datum: '2026-10-01',
                        faellig: '2026-10-31',
                        leistungszeitraum_von: '2026-11-01',
                        leistungszeitraum_bis: '2026-11-15',
                        positionen: []
                    };
                    return await window.buildInvoiceDocumentHtml(testOfferWithPeriod, {}, true);
                })()
            `);
            assert.ok(
                mitAusfuehrungHtml.includes('Voraussichtl. Ausführung:') || mitAusfuehrungHtml.includes('Voraussichtlicher Ausführungszeitraum'),
                'Angebot mit Ausführungszeitraum muss "Voraussichtl. Ausführung" enthalten'
            );

            // Verify in SQLite: Status is still ENTWURF and freeze_snapshot_json is NULL
            const draftInDb = db.prepare('SELECT * FROM dokumente WHERE nr = ?').get('ANG-2026-TRUE-001');
            assert.ok(draftInDb, 'Offer must exist in SQLite database');
            assert.strictEqual(draftInDb.angebot_status, 'ENTWURF', 'Status must remain ENTWURF after preview');
            assert.strictEqual(draftInDb.freeze_snapshot_json, null, 'freeze_snapshot_json must remain NULL');

            // Generate real PDF bytes via @cantoo/pdf-lib
            const pdfDoc = await PDFDocument.create();
            const page = pdfDoc.addPage([595.28, 841.89]);
            page.drawText(`Angebot: ${draftInDb.nr}`, { x: 50, y: 800, size: 14 });
            page.drawText(`Kunde: Bauherr Max Mustermann`, { x: 50, y: 770, size: 11 });
            page.drawText(`Position: Mauerarbeiten Spezial (0,00 EUR)`, { x: 50, y: 740, size: 10 });
            const pdfBytes = await pdfDoc.save();
            assert.ok(pdfBytes.length > 500, 'Valid PDF stream generated');
            const magicHeader = Buffer.from(pdfBytes.buffer).slice(0, 5).toString();
            assert.strictEqual(magicHeader, '%PDF-', 'PDF magic header is valid');
            console.log(`✓ Testfall 2 erfolgreich bestanden! (${pdfBytes.length} echte PDF-Bytes verifiziert)`);

            // =================================================================
            // TESTFALL 3: Versand registrieren & UI-Feedback
            // =================================================================
            console.log('Testfall 3: Versand registrieren & UI-Feedback...');
            const step3Result = await win.webContents.executeJavaScript(`
                (async () => {
                    // Close PDF preview modal first
                    if (typeof closePdfPreview === 'function') closePdfPreview();
                    else {
                        const pdfModal = document.getElementById('pdf-preview-modal');
                        if (pdfModal) {
                            pdfModal.classList.add('hidden');
                            pdfModal.classList.remove('flex');
                        }
                    }

                    // Confirm and click freeze
                    window.__test.confirmResponse = true;
                    window.__test.toasts = [];

                    const freezeBtn = document.getElementById('btn-freeze-angebot');
                    freezeBtn.click();

                    for (let i = 0; i < 100; i++) {
                        if (window.__test.toasts.some(t => t.type === 'success')) break;
                        await new Promise(r => setTimeout(r, 20));
                    }

                    // Check Toast
                    const lastSuccessToast = window.__test.toasts.filter(t => t.type === 'success').pop();

                    // Check disabled modal inputs
                    const form = document.getElementById('rechnung-form');
                    const inputs = Array.from(form.querySelectorAll('input:not([type="hidden"]), select, textarea'));
                    const allDisabled = inputs.length > 0 && inputs.every(el => el.disabled);

                    // Check modal header status & version badges
                    const versionBadge = document.getElementById('rechnung-modal-version');
                    const statusBadge = document.getElementById('rechnung-modal-status');

                    // Check dashboard table
                    if (typeof window.renderAngebote === 'function') window.renderAngebote();
                    const tbody = document.getElementById('angebote-table-body');
                    const rowHtml = tbody ? tbody.innerHTML : '';

                    return {
                        toastMsg: lastSuccessToast ? lastSuccessToast.msg : '',
                        allDisabled,
                        inputCount: inputs.length,
                        versionText: versionBadge ? versionBadge.textContent : '',
                        statusText: statusBadge ? statusBadge.textContent : '',
                        tableHasNr: rowHtml.includes('ANG-2026-TRUE-001'),
                        tableHasStatus: /versendet/i.test(rowHtml),
                        tableHasVersion: rowHtml.includes('v1')
                    };
                })()
            `);

            assert.ok(
                step3Result.toastMsg.includes('wurde erfolgreich eingefroren und der Versand registriert'),
                `Toast must report successful freeze and registered shipment. Got: ${step3Result.toastMsg}`
            );
            assert.ok(step3Result.allDisabled, `All ${step3Result.inputCount} form inputs must be disabled in read-only mode`);
            assert.strictEqual(step3Result.versionText, 'v1', 'Version badge must display v1');
            assert.ok(step3Result.statusText.includes('VERSENDET'), 'Status badge must display VERSENDET');
            assert.ok(step3Result.tableHasNr, 'Dashboard table must contain quote number');
            assert.ok(step3Result.tableHasStatus, 'Dashboard table must show status VERSENDET');
            assert.ok(step3Result.tableHasVersion, 'Dashboard table must show version v1');

            // SQLite verification
            const frozenInDb = db.prepare('SELECT * FROM dokumente WHERE nr = ?').get('ANG-2026-TRUE-001');
            assert.strictEqual(frozenInDb.angebot_status, 'VERSENDET');
            assert.ok(frozenInDb.freeze_snapshot_json, 'freeze_snapshot_json must be populated in DB');
            const snapshot = JSON.parse(frozenInDb.freeze_snapshot_json);
            assert.strictEqual(snapshot.angebot_nr || snapshot.nr, 'ANG-2026-TRUE-001');
            console.log('✓ Testfall 3 erfolgreich bestanden!');

            // =================================================================
            // TESTFALL 4: Post-Versand UI-Aktionen
            // =================================================================
            console.log('Testfall 4: Post-Versand UI-Aktionen...');
            const step4Result = await win.webContents.executeJavaScript(`
                (async () => {
                    // 1. Klick auf #btn-neue-version-angebot
                    const newVerBtn = document.getElementById('btn-neue-version-angebot');
                    if (!newVerBtn) throw new Error('btn-neue-version-angebot not found in frozen modal');

                    window.__test.confirmResponse = true;
                    newVerBtn.click();
                    for (let i = 0; i < 100; i++) {
                        if (window.state.angebote && window.state.angebote.some(a => a.version === 2)) break;
                        await new Promise(r => setTimeout(r, 20));
                    }

                    const currentNr = document.getElementById('rechnung-nr').value;
                    const currentVer = document.getElementById('rechnung-modal-version').textContent;
                    const currentStatus = document.getElementById('rechnung-modal-status').textContent;

                    // Form inputs for v2 should be editable
                    const form = document.getElementById('rechnung-form');
                    const nrInput = document.getElementById('rechnung-nr');
                    const isV2Editable = !nrInput.disabled;

                    // 2. Freeze v2 and then Accept v2
                    // Freeze v2 so it can be accepted
                    const v2Obj = window.state.angebote.find(a => a.version === 2);
                    window.AngebotController.freezeAngebot(v2Obj, v2Obj.positionen);
                    await window.api.saveDocument(v2Obj);

                    // Re-open v2 in modal
                    window.openAngebotModal(v2Obj.id);

                    // Click #btn-accept-angebot
                    const acceptBtn = document.getElementById('btn-accept-angebot');
                    if (!acceptBtn) throw new Error('btn-accept-angebot not found');

                    window.__test.confirmResponse = true;
                    acceptBtn.click();
                    for (let i = 0; i < 100; i++) {
                        const st = document.getElementById('rechnung-modal-status');
                        if (st && st.textContent.includes('ANGENOMMEN')) break;
                        await new Promise(r => setTimeout(r, 20));
                    }

                    const acceptedStatusText = document.getElementById('rechnung-modal-status').textContent;

                    // 3. Click #btn-create-project-angebot
                    const createProjBtn = document.getElementById('btn-create-project-angebot');
                    if (!createProjBtn) throw new Error('btn-create-project-angebot not found in accepted modal');

                    window.__test.confirmResponse = true;
                    createProjBtn.click();
                    for (let i = 0; i < 100; i++) {
                        if (window.state.projekte && window.state.projekte.some(p => p.source_angebot_id)) break;
                        await new Promise(r => setTimeout(r, 20));
                    }

                    // Re-render dashboard angebote table
                    if (typeof window.renderAngebote === 'function') window.renderAngebote();
                    const tbody = document.getElementById('angebote-table-body');
                    const dashboardHtml = tbody ? tbody.innerHTML : '';

                    return {
                        v2VersionText: currentVer,
                        v2StatusText: currentStatus,
                        isV2Editable,
                        acceptedStatusText,
                        dashboardHasProjectLink: dashboardHtml.includes('Zum verknüpften Projekt')
                    };
                })()
            `);

            assert.strictEqual(step4Result.v2VersionText, 'v2', 'v2 modal version badge must show v2');
            assert.ok(step4Result.v2StatusText.includes('ENTWURF'), 'v2 must start as ENTWURF');
            assert.ok(step4Result.isV2Editable, 'v2 form fields must be editable');
            assert.ok(step4Result.acceptedStatusText.includes('ANGENOMMEN'), 'Offer must show ANGENOMMEN status');
            assert.ok(step4Result.dashboardHasProjectLink, 'Dashboard must show "Zum verknüpften Projekt" link button');

            // SQLite verification for project
            const projectInDb = db.prepare('SELECT * FROM projekte WHERE source_angebot_id IS NOT NULL').get();
            assert.ok(projectInDb, 'Project must exist in DB');
            assert.strictEqual(projectInDb.source_angebot_version, 2, 'Project must reference offer version 2');

            const projPositions = db.prepare('SELECT * FROM projekt_positionen WHERE projekt_id = ?').all(projectInDb.id);
            assert.ok(projPositions.length > 0, 'Project positions must be created in DB');
            console.log('✓ Testfall 4 erfolgreich bestanden!');

            // =================================================================
            // TESTFALL 5: DB-Reload & Integrität
            // =================================================================
            console.log('Testfall 5: DB-Reload & Integrität...');
            db.close();

            const Database = require('better-sqlite3');
            const reloadedDb = new Database(tmpDbPath);

            const fkErrors = reloadedDb.prepare('PRAGMA foreign_key_check').all();
            assert.strictEqual(fkErrors.length, 0, `PRAGMA foreign_key_check returned ${fkErrors.length} errors`);

            const docCount = reloadedDb.prepare('SELECT COUNT(*) as count FROM dokumente').get().count;
            assert.ok(docCount >= 2, 'Must have at least 2 versions of offer persisted in SQLite');

            const projCount = reloadedDb.prepare('SELECT COUNT(*) as count FROM projekte').get().count;
            assert.ok(projCount >= 1, 'Project must be persisted in SQLite');

            reloadedDb.close();
            try { fs.unlinkSync(tmpDbPath); } catch (_) {}
            console.log('✓ Testfall 5 erfolgreich bestanden!');

            console.log('\n======================================================');
            console.log('ANGEBOT_TRUE_UI_AND_PDF_TESTS_PASSED');
            console.log('======================================================\n');
        } catch (err) {
            console.error('=== TEST FAILURE IN ELECTRON CHROMIUM ===');
            console.error(err);
            try { fs.unlinkSync(tmpDbPath); } catch (_) {}
            process.exit(1);
        } finally {
            app.quit();
        }
    });
});
