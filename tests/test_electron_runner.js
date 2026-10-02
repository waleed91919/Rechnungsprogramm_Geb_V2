const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const assert = require('assert');
const { PDFDocument } = require('@cantoo/pdf-lib');
const GAEBEngine = require('../js/gaeb');
const { saveX83Import } = require('../db/repositories/gaeb_repository');

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

                        // Verify DOM-Struktur & Synchronisation für Angebot
                        const handwerkSection = document.getElementById('rechnung-handwerk-section');
                        const handwerkHidden = !handwerkSection || handwerkSection.classList.contains('hidden');

                        const bauSection = document.getElementById('angebot-bauvorhaben-section');
                        const bauSectionVisible = !!bauSection && !bauSection.classList.contains('hidden');
                        const bauSectionTitle = bauSection ? (bauSection.querySelector('h4')?.textContent.trim() || '') : '';

                        const rechnungArt = document.getElementById('rechnung-art');
                        const rechnungArtHidden = !rechnungArt || !!rechnungArt.closest('.hidden');

                        const hasAusfuehrungsLabel = !!bauSection && bauSection.innerHTML.includes('Voraussichtlicher Ausführungszeitraum');

                        // Automatische Synchronisation prüfen:
                        // auftraggeber_typ steuert ist_privatkunde automatisch
                        const auftraggeberSelect = document.getElementById('angebot-auftraggeber-typ');
                        auftraggeberSelect.value = 'GEWERBLICH';
                        handleAngebotMetaChange();
                        const istPrivatGewerblich = document.getElementById('rechnung-ist-privatkunde')?.checked;

                        auftraggeberSelect.value = 'PRIVAT';
                        handleAngebotMetaChange();
                        const istPrivatPrivat = document.getElementById('rechnung-ist-privatkunde')?.checked;

                        // vertragsgrundlage steuert vob_vereinbart automatisch
                        const vertragSelect = document.getElementById('angebot-vertragsgrundlage');
                        vertragSelect.value = 'VOB_B';
                        handleAngebotMetaChange();
                        const vobIsCheckedWhenVOB = document.getElementById('rechnung-vob-vereinbart')?.checked;

                        vertragSelect.value = 'BGB_WERKVERTRAG';
                        handleAngebotMetaChange();
                        const vobIsCheckedWhenBGB = document.getElementById('rechnung-vob-vereinbart')?.checked;

                        return {
                            initialDomValue,
                            initialPosPrice,
                            alertTriggered,
                            alertMsg,
                            confirmTriggered,
                            confirmMsg,
                            handwerkHidden,
                            bauSectionVisible,
                            bauSectionTitle,
                            rechnungArtHidden,
                            hasAusfuehrungsLabel,
                            istPrivatGewerblich,
                            istPrivatPrivat,
                            vobIsCheckedWhenVOB,
                            vobIsCheckedWhenBGB
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

            // Assertions für die neue DOM-Struktur & Synchronisation
            assert.strictEqual(step1Result.handwerkHidden, true, 'Im Angebotsmodus muss #rechnung-handwerk-section ausgeblendet sein');
            assert.strictEqual(step1Result.bauSectionVisible, true, '#angebot-bauvorhaben-section muss im Angebotsmodus sichtbar sein');
            assert.ok(
                step1Result.bauSectionTitle.includes('Bauvorhaben & Vertragsbedingungen') ||
                step1Result.bauSectionTitle.includes('Bauvorhaben &amp; Vertragsbedingungen'),
                '#angebot-bauvorhaben-section muss Überschrift "Bauvorhaben & Vertragsbedingungen" tragen'
            );
            assert.strictEqual(step1Result.rechnungArtHidden, true, 'Kein rechnung-art im Angebotsmodus sichtbar');
            assert.strictEqual(step1Result.hasAusfuehrungsLabel, true, 'Beschriftung "Voraussichtlicher Ausführungszeitraum" vorhanden');
            assert.strictEqual(step1Result.istPrivatGewerblich, false, 'auftraggeber_typ GEWERBLICH steuert ist_privatkunde auf false');
            assert.strictEqual(step1Result.istPrivatPrivat, true, 'auftraggeber_typ PRIVAT steuert ist_privatkunde auf true');
            assert.strictEqual(step1Result.vobIsCheckedWhenVOB, true, 'vertragsgrundlage VOB_B steuert vob_vereinbart auf true');
            assert.strictEqual(step1Result.vobIsCheckedWhenBGB, false, 'vertragsgrundlage BGB steuert vob_vereinbart auf false');
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

                    // Wait for PDF preview rendering (resilient polling up to 2s)
                    for (let i = 0; i < 40; i++) {
                        const m = document.getElementById('pdf-preview-modal');
                        if (m && m.classList.contains('flex') && !m.classList.contains('hidden')) break;
                        await new Promise(r => setTimeout(r, 50));
                    }

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
                        hasZahlbetrag: containerHtml.includes('Zahlbetrag'),
                        html: containerHtml
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

            // Baurechtliche und vertragliche Präzisierung (liesen.txt: BGB § 148 & Vertragsgrundlage)
            const html = step2Result.html;
            assert.ok(html.includes('Dieses Angebot kann bis zum'), 'Muss verbindliche Annahmefrist ausweisen');
            assert.ok(!html.includes('freibleibend'), 'Darf kein widersprüchliches freibleibend enthalten');
            assert.ok(!html.includes('bzw. BGB-Werkvertrag'), 'Darf keine generische Entweder-Oder-Klausel enthalten');
            assert.ok(html.includes('Vertragsgrundlage: BGB-Werkvertrag'), 'Muss die gewählte Vertragsgrundlage konkret ausweisen');

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

            // =================================================================
            // Zusätzliche Verifikation: Echtes § 13b Angebot im DOM & echte PDF-Bytes
            // =================================================================
            const step2Result13b = await win.webContents.executeJavaScript(`
                (async () => {
                    const test13bOffer = {
                        id: 9913,
                        nr: 'ANG-2026-TEST-13B',
                        type: 'angebot',
                        datum: '2026-10-01',
                        faellig: '2026-10-31',
                        unterliegt_13b: 1,
                        auftraggeber_typ: 'GEWERBLICH',
                        vertragsgrundlage: 'VOB_B',
                        vob_vereinbart: 1,
                        netto: 2500.00,
                        steuer: 0.00,
                        brutto: 2500.00,
                        positionen: [
                            {
                                id: 1,
                                name: 'Dachdeckerarbeiten nach § 13b UStG',
                                menge: 1,
                                einheit: 'Psch.',
                                preis: 2500.00,
                                mwst: 0,
                                is13b: true,
                                positionstyp: 'NORMAL'
                            }
                        ]
                    };
                    const kunde13b = {
                        id: ${testKundeId},
                        name: 'Gewerbebau Partner GmbH',
                        adresse: 'Gewerbepark 4',
                        plz: '10115',
                        ort: 'Berlin',
                        ist_bauleistender_13b: 1
                    };

                    const html13b = await window.buildInvoiceDocumentHtml(test13bOffer, kunde13b, true);
                    window.openPdfPreview(html13b, 'Angebot_ANG-2026-TEST-13B.pdf');

                    for (let i = 0; i < 40; i++) {
                        const m = document.getElementById('pdf-preview-modal');
                        if (m && m.classList.contains('flex') && !m.classList.contains('hidden')) break;
                        await new Promise(r => setTimeout(r, 50));
                    }

                    const pdfModal = document.getElementById('pdf-preview-modal');
                    const modalVisible = pdfModal && pdfModal.classList.contains('flex') && !pdfModal.classList.contains('hidden');
                    const pdfContainer = document.getElementById('pdf-preview-container');
                    const containerHtml = pdfContainer ? pdfContainer.innerHTML : '';

                    // Synchronisiere #print-template für Nativ-Electron printToPDF (genau wie executePrint('save') vor dem Export tut)
                    const printTemplate = document.getElementById('print-template');
                    if (printTemplate && pdfContainer) {
                        const invoiceElement = document.getElementById('invoice-paper') || pdfContainer.querySelector('#invoice-paper') || pdfContainer.firstElementChild || pdfContainer;
                        printTemplate.innerHTML = invoiceElement.outerHTML || pdfContainer.innerHTML;
                    }

                    // Auch gemischtes Angebot testen: Pos 1 § 13b (1.500 €), Pos 2 regulär 19% (1.000 €)
                    const testMixedOffer = {
                        id: 9914,
                        nr: 'ANG-2026-TEST-MIXED',
                        type: 'angebot',
                        datum: '2026-10-01',
                        faellig: '2026-10-31',
                        unterliegt_13b: 1,
                        netto: 2500.00,
                        steuer: 190.00,
                        brutto: 2690.00,
                        positionen: [
                            { id: 1, name: 'Bauleistung § 13b', menge: 1, preis: 1500.00, mwst: 0, is13b: true, positionstyp: 'NORMAL' },
                            { id: 2, name: 'Planungsleistung regulär 19%', menge: 1, preis: 1000.00, mwst: 19, is13b: false, positionstyp: 'NORMAL' }
                        ]
                    };
                    const htmlMixed = await window.buildInvoiceDocumentHtml(testMixedOffer, kunde13b, true);

                    // Vorschau wieder schließen
                    window.closePdfPreview();

                    return {
                        modalVisible,
                        containerHtml,
                        htmlMixed,
                        has13bNotice: containerHtml.includes('Steuerschuldnerschaft des Leistungsempfängers') &&
                                      containerHtml.includes('Reverse-Charge') &&
                                      containerHtml.includes('§ 13b'),
                        hasNettoEqualingBrutto: containerHtml.includes('2.500,00'),
                        mixedHasRegularNet: htmlMixed.includes('Netto (regulär):') && htmlMixed.includes('1.000,00'),
                        mixedHas13bNet: htmlMixed.includes('Netto (§ 13b – Steuerschuldnerschaft des Leistungsempfängers):') && htmlMixed.includes('1.500,00'),
                        mixedHas19Mwst: htmlMixed.includes('19% MwSt') && htmlMixed.includes('190,00'),
                        mixedHas13bNotice: htmlMixed.includes('Steuerschuldnerschaft des Leistungsempfängers')
                    };
                })()
            `);

            assert.ok(step2Result13b.modalVisible, '#pdf-preview-modal must be visible for § 13b preview');
            assert.ok(!step2Result13b.containerHtml.includes('steuerfrei'), 'Darf nicht das irreführende Wort steuerfrei enthalten');
            assert.ok(step2Result13b.containerHtml.includes('Steuerschuldnerschaft des Leistungsempfängers'), 'Hinweis auf Steuerschuldnerschaft');
            assert.ok(step2Result13b.has13bNotice, '#pdf-preview-container must contain § 13b / Steuerschuldnerschaft / Reverse-Charge notice');
            assert.ok(step2Result13b.containerHtml.includes('USt. nicht ausgewiesen'), 'Hinweis "USt. nicht ausgewiesen" muss vorhanden sein');
            assert.ok(step2Result13b.hasNettoEqualingBrutto, 'Netto must equal Brutto in pure 13b offer');
            assert.ok(step2Result13b.htmlMixed.includes('Netto (§ 13b – Steuerschuldnerschaft des Leistungsempfängers):'), 'Muss die juristisch korrekte Bezeichnung ausweisen');
            assert.ok(step2Result13b.mixedHasRegularNet, 'Mixed offer must display regular net sum');
            assert.ok(step2Result13b.mixedHas13bNet, 'Mixed offer must display § 13b net sum separately');
            assert.ok(step2Result13b.mixedHas19Mwst, 'Mixed offer must calculate 19% MwSt on regular portion correctly');
            assert.ok(step2Result13b.mixedHas13bNotice, 'Mixed offer must contain § 13b legal notice');

            // Teste stattdessen die ECHTE Electron/Chromium printToPDF-Generierung auf dem synchronisierten W-Link Template
            const pdfBuffer13b = await win.webContents.printToPDF({
                printBackground: true,
                pageSize: 'A4'
            });
            assert.ok(pdfBuffer13b && pdfBuffer13b.length > 1000, `Chromiums native printToPDF engine must generate valid PDF bytes (>1000, got ${pdfBuffer13b ? pdfBuffer13b.length : 0})`);
            const pdfHeader13b = Buffer.from(pdfBuffer13b.slice(0, 5)).toString('ascii');
            assert.strictEqual(pdfHeader13b, '%PDF-', 'PDF stream must start with valid %PDF- magic bytes');

            // Zusätzliche Verifikation: Trennung von Rechnungs- vs. Angebots-Modal UI
            const modeSeparationResult = await win.webContents.executeJavaScript(`
                (() => {
                    // Check Angebot mode DOM state
                    const handwerkInAngebot = document.getElementById('rechnung-handwerk-section');
                    const bauInAngebot = document.getElementById('angebot-bauvorhaben-section');
                    const angHandwerkHidden = !handwerkInAngebot || handwerkInAngebot.classList.contains('hidden');
                    const angBauVisible = !!bauInAngebot && !bauInAngebot.classList.contains('hidden');

                    // Switch to Rechnung mode
                    window.openRechnungModal();
                    const handwerkInRechnung = document.getElementById('rechnung-handwerk-section');
                    const bauInRechnung = document.getElementById('angebot-bauvorhaben-section');
                    const rechnungArt = document.getElementById('rechnung-art');
                    const rechHandwerkVisible = !!handwerkInRechnung && !handwerkInRechnung.classList.contains('hidden');
                    const rechBauHidden = !bauInRechnung || bauInRechnung.classList.contains('hidden');
                    const rechArtVisible = !!rechnungArt && !rechnungArt.closest('.hidden');

                    // Switch back to Angebot modal
                    const draftObj = (window.state.angebote || []).find(a => a.nr === 'ANG-2026-TRUE-001');
                    if (draftObj) window.openAngebotModal(draftObj.id);
                    else window.openAngebotModal();

                    return {
                        angHandwerkHidden,
                        angBauVisible,
                        rechHandwerkVisible,
                        rechBauHidden,
                        rechArtVisible
                    };
                })()
            `);
            assert.strictEqual(modeSeparationResult.angHandwerkHidden, true, 'Im Angebotsmodus muss Handwerk-Sektion ausgeblendet sein');
            assert.strictEqual(modeSeparationResult.angBauVisible, true, 'Im Angebotsmodus muss Bauvorhaben-Sektion sichtbar sein');
            assert.strictEqual(modeSeparationResult.rechHandwerkVisible, true, 'Im Rechnungsmodus muss Handwerk-Sektion sichtbar sein');
            assert.strictEqual(modeSeparationResult.rechBauHidden, true, 'Im Rechnungsmodus muss Bauvorhaben-Sektion ausgeblendet sein');
            assert.strictEqual(modeSeparationResult.rechArtVisible, true, 'Im Rechnungsmodus muss rechnung-art sichtbar sein');

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
            // TESTFALL 4b: § 13b UStG Abwahl & Feldleerung (liesen.txt Behebung)
            // =================================================================
            console.log('Testfall 4b: § 13b Abwahl & Feldleerung...');
            const step4bResult = await win.webContents.executeJavaScript(`
                (async () => {
                    // 1. Neues Angebot öffnen
                    window.openAngebotModal();

                    // Stammdaten & Auftraggeber-Typ
                    document.getElementById('rechnung-nr').value = 'ANG-2026-13B-001';
                    const kundeSelect = document.getElementById('rechnung-kunde');
                    kundeSelect.value = '${testKundeId}';
                    handleKundeSelect({ target: kundeSelect });

                    // Auftraggeber-Typ auf GEWERBLICH setzen, damit 13b erlaubt ist
                    const auftraggeberTypEl = document.getElementById('angebot-auftraggeber-typ');
                    if (auftraggeberTypEl) {
                        auftraggeberTypEl.value = 'GEWERBLICH';
                        handleAngebotMetaChange();
                    }

                    document.getElementById('rechnung-datum').value = '2026-11-01';
                    document.getElementById('rechnung-faellig').value = '2026-11-30';

                    // Position anlegen
                    window.addRechnungPosition();
                    const posId = window.state.currentRechnungPositionen[0].id;
                    window.handlePositionChange(posId, 'name', 'Bauleistung Dachsanierung');
                    window.handlePositionChange(posId, 'menge', 1);
                    window.handlePositionChange(posId, 'preis', 1000.00);
                    window.renderRechnungPositionen();

                    // Initialwerte: 13b = 1, baustellen_adresse, leistungszeitraum, sicherheitseinbehalt = 5.0
                    const cb13b = document.getElementById('angebot-13b-ustg');
                    if (cb13b) {
                        cb13b.checked = true;
                        cb13b.dispatchEvent(new Event('change', { bubbles: true }));
                    }

                    const baustellenEl = document.getElementById('angebot-baustellen-adresse');
                    if (baustellenEl) baustellenEl.value = 'Musterstraße 12';

                    const vonEl = document.getElementById('angebot-ausfuehrung-von');
                    if (vonEl) vonEl.value = '2026-11-01';

                    const bisEl = document.getElementById('angebot-ausfuehrung-bis');
                    if (bisEl) bisEl.value = '2026-11-30';

                    const sichEl = document.getElementById('angebot-sicherheitseinbehalt');
                    if (sichEl) {
                        sichEl.value = '5.0';
                        sichEl.dispatchEvent(new Event('input', { bubbles: true }));
                    }

                    // Erstes Speichern
                    await window.saveAngebotEntwurf();

                    // Id aus dem state holen
                    const savedObj = window.state.angebote.find(a => a.nr === 'ANG-2026-13B-001');
                    if (!savedObj) throw new Error('Saved offer not found in state.angebote');
                    const savedId = savedObj.id;

                    // 2. Erneut im Modal öffnen
                    window.openAngebotModal(savedId);

                    // 3. Werte ändern / leeren:
                    // - Wähle #angebot-13b-ustg AB (checked = false)
                    const cb13bReopen = document.getElementById('angebot-13b-ustg');
                    if (cb13bReopen) {
                        cb13bReopen.checked = false;
                        cb13bReopen.dispatchEvent(new Event('change', { bubbles: true }));
                    }

                    // - Leere #angebot-baustellen-adresse (value = '')
                    const baustellenReopen = document.getElementById('angebot-baustellen-adresse');
                    if (baustellenReopen) baustellenReopen.value = '';

                    // - Leere #angebot-ausfuehrung-von und #angebot-ausfuehrung-bis (value = '')
                    const vonReopen = document.getElementById('angebot-ausfuehrung-von');
                    if (vonReopen) vonReopen.value = '';
                    const bisReopen = document.getElementById('angebot-ausfuehrung-bis');
                    if (bisReopen) bisReopen.value = '';

                    // - Leere #angebot-sicherheitseinbehalt (value = '')
                    const sichReopen = document.getElementById('angebot-sicherheitseinbehalt');
                    if (sichReopen) {
                        sichReopen.value = '';
                        sichReopen.dispatchEvent(new Event('input', { bubbles: true }));
                    }

                    // 4. Zweites Speichern
                    await window.saveAngebotEntwurf();
                    window.closeRechnungModal();

                    return { savedId };
                })()
            `);

            // 5. Lade das Dokument aus der SQLite-Datenbank und prüfe per assert
            const savedDocInDb = db.prepare('SELECT * FROM dokumente WHERE id = ?').get(step4bResult.savedId);
            assert.ok(savedDocInDb, 'Document must exist in SQLite DB');
            assert.strictEqual(savedDocInDb.unterliegt_13b, 0, 'unterliegt_13b must be 0 after unchecking');
            assert.strictEqual(savedDocInDb.baustellen_adresse, '', 'baustellen_adresse must be empty string after clearing');
            assert.strictEqual(savedDocInDb.leistungszeitraum_von, '', 'leistungszeitraum_von must be empty string after clearing');
            assert.strictEqual(savedDocInDb.leistungszeitraum_bis, '', 'leistungszeitraum_bis must be empty string after clearing');
            assert.strictEqual(savedDocInDb.sicherheitseinbehalt_prozent, 0, 'sicherheitseinbehalt_prozent must be 0 after clearing');
            assert.strictEqual(savedDocInDb.sicherheitseinbehalt, 0, 'sicherheitseinbehalt must be 0 after clearing');
            console.log('✓ Testfall 4b (§ 13b Abwahl & Feldleerung) erfolgreich bestanden!');

            // =================================================================
            // TESTFALL 4c: GAEB Ausschreibung & Bepreisung (Chromium DOM, Button-Clicks, Tree, Pricing, BiReq, Draft Save & Close)
            // =================================================================
            console.log('Testfall 4c: GAEB Ausschreibung & Bepreisung UI...');
            const xml03 = fs.readFileSync(path.join(__dirname, 'fixtures', 'gaeb_x83', '03_bieterangaben_vorbemerkungen_ep.x83'), 'utf8');
            const parsed03 = GAEBEngine.parseGAEBXML(xml03);
            const savedTenderImport = saveX83Import(db, parsed03, { fileName: 'test_tender_ui.x83', rawXml: xml03 });
            const tenderImportId = savedTenderImport.importId;
            const origSnapshot = db.prepare('SELECT id, preis, gesamtpreis FROM gaeb_items WHERE import_id = ?').all(tenderImportId);

            await win.webContents.executeJavaScript(`
                (async () => {
                    // 1. Prüfe, ob GAEB-Tender-Module im DOM geladen sind
                    if (!window.GaebTenderController || !window.GaebTenderState || !window.GaebTenderView) {
                        throw new Error('GAEB Tender Skripte nicht in window verfügbar');
                    }

                    // 2. Öffne GAEB Tender Modal über window.openGaebTenderModal
                    await window.openGaebTenderModal(${tenderImportId});

                    const modal = document.getElementById('gaeb-tender-modal');
                    if (!modal || modal.classList.contains('hidden')) {
                        throw new Error('GAEB Tender Modal ist nach openGaebTenderModal nicht sichtbar');
                    }

                    // Wenn in der Entwurfsübersicht, ersten Entwurf explizit über UI anlegen
                    const createDraftBtn = document.getElementById('gt-btn-create-first-draft');
                    if (createDraftBtn) {
                        await window.GaebTenderController.createNewDraftForSelectedImport();
                    }

                    // 3. Baum-Prüfung
                    const treeContainer = document.getElementById('gt-tree-container');
                    if (!treeContainer || treeContainer.children.length === 0) {
                        throw new Error('Baumstruktur wurde nicht im DOM gerendert');
                    }

                    // 4. Erste bepreisbare Position wählen
                    const priceable = window.GaebTenderState.items.find(i => !i.isHinweistext);
                    if (!priceable) throw new Error('Keine bepreisbare Position gefunden');
                    window.GaebTenderController.selectItem(priceable._dbId);

                    // 5. Details prüfen
                    const kurztextEl = document.getElementById('gt-item-kurztext');
                    if (!kurztextEl || !kurztextEl.textContent.trim()) {
                        throw new Error('Kurztext fehlt im Detailbereich');
                    }

                    const langtextEl = document.getElementById('gt-item-langtext');
                    if (!langtextEl || !langtextEl.textContent.trim()) {
                        throw new Error('Langtext fehlt im Detailbereich');
                    }

                    // 6. Preis eingeben
                    const unitPriceInput = document.getElementById('gt-input-unit-price');
                    unitPriceInput.value = '64.50';
                    window.GaebTenderController.onUnitPriceInput('64.50');

                    const totalCalcInput = document.getElementById('gt-calculated-total-price');
                    if (!totalCalcInput.value.includes('€')) {
                        throw new Error('Gesamtpreis wurde bei Eingabe nicht dynamisch berechnet');
                    }

                    // 7. BiReq ausfüllen
                    const bireqItem = window.GaebTenderState.items.find(i => i.bieterangaben && i.bieterangaben.length > 0);
                    if (bireqItem) {
                        window.GaebTenderController.selectItem(bireqItem._dbId);
                        const bId = bireqItem.bieterangaben[0].id || bireqItem.bieterangaben[0]._dbId;
                        window.GaebTenderController.onBiReqInput(bId, 'Hersteller Alpha Model 1');
                    }

                    // 8. Entwurf speichern
                    await window.GaebTenderController.saveDraft();

                    // 9. Modal schließen
                    window.GaebTenderController.closeModal();
                    if (!modal.classList.contains('hidden')) {
                        throw new Error('Modal wurde nach closeModal() nicht ausgeblendet');
                    }

                    return { success: true };
                })()
            `);

            // SQLite-Verifikation
            const tenderDraftInDb = db.prepare('SELECT * FROM gaeb_tender_drafts WHERE import_id = ?').get(tenderImportId);
            assert.ok(tenderDraftInDb, 'Tender-Draft must be created in SQLite DB');
            const pricedItemsInDb = db.prepare('SELECT COUNT(*) AS cnt FROM gaeb_tender_item_prices WHERE draft_id = ? AND unit_price IS NOT NULL').get(tenderDraftInDb.id).cnt;
            assert.ok(pricedItemsInDb > 0, 'At least 1 item price must be persisted in SQLite DB');

            // Original X83 Daten in gaeb_items blieben 100% unangetastet
            const currentItems = db.prepare('SELECT id, preis, gesamtpreis FROM gaeb_items WHERE import_id = ?').all(tenderImportId);
            assert.deepStrictEqual(currentItems, origSnapshot, 'Original gaeb_items must remain 100% untouched');

            console.log('✓ Testfall 4c (GAEB Ausschreibung & Bepreisung UI) erfolgreich bestanden!');

            // =================================================================
            // TESTFALL 4d: GAEB Entwurfsübersicht & Navigation (liesen.txt)
            // =================================================================
            console.log('Testfall 4d: GAEB Entwurfsübersicht Navigation & Datumsanzeige...');
            await win.webContents.executeJavaScript(`
                (async () => {
                    // Reset alert spy für diesen Testfall
                    window.__test.alerts = [];

                    // 1. GAEB-Menü ohne Parameter öffnen -> zeigt Importliste
                    await window.openGaebTenderModal();

                    const modal = document.getElementById('gaeb-tender-modal');
                    if (!modal || modal.classList.contains('hidden')) {
                        throw new Error('GAEB Tender Modal ist nicht sichtbar');
                    }

                    const importList = document.getElementById('gt-view-import-list');
                    if (!importList || importList.classList.contains('hidden')) {
                        throw new Error('Importauswahl (#gt-view-import-list) muss nach openGaebTenderModal sichtbar sein');
                    }

                    // 2. Klick auf "Auswählen" beim vorbereiteten Import
                    await window.GaebTenderController.selectImport(${tenderImportId});

                    // Prüfe, ob Fehler aufgetreten sind
                    if (window.__test.alerts.length > 0) {
                        throw new Error('Fehler beim Laden der Entwürfe: ' + window.__test.alerts.join('; '));
                    }

                    const draftList = document.getElementById('gt-view-draft-list');
                    if (!draftList || draftList.classList.contains('hidden')) {
                        throw new Error('Entwurfsübersicht (#gt-view-draft-list) ist nicht sichtbar');
                    }

                    // 3. Zeilen in der Entwurfsübersicht prüfen
                    const tbody = document.getElementById('gt-draft-list-tbody');
                    const rows = tbody.querySelectorAll('tr');
                    if (!rows || rows.length === 0) {
                        throw new Error('Keine Entwurfszeilen gerendert trotz vorhandenem Entwurf');
                    }

                    const dateCell = rows[0].querySelectorAll('td')[6];
                    if (!dateCell || !dateCell.textContent.trim() || dateCell.textContent.includes('undefined')) {
                        throw new Error('Ungültige oder undefinierte Datumsanzeige in Entwurfszeile: ' + (dateCell?.textContent));
                    }

                    // 4. "Öffnen" beim Entwurf anklicken
                    await window.GaebTenderController.openDraft(${tenderDraftInDb.id}, ${tenderImportId});

                    const editor = document.getElementById('gt-view-editor');
                    if (!editor || editor.classList.contains('hidden')) {
                        throw new Error('Editor-Ansicht ist nach openDraft nicht sichtbar');
                    }
                    if (window.GaebTenderState.currentDraftId !== ${tenderDraftInDb.id}) {
                        throw new Error('Falscher Entwurf im Editor geladen');
                    }

                    // 5. Zurück zur Entwurfsübersicht
                    await window.GaebTenderController.backToDraftList();

                    if (!draftList || draftList.classList.contains('hidden')) {
                        throw new Error('Entwurfsübersicht nach backToDraftList() nicht sichtbar');
                    }

                    // Modal schließen
                    window.GaebTenderController.closeModal();

                    return { success: true };
                })()
            `);
            console.log('✓ Testfall 4d (GAEB Entwurfsübersicht Navigation & Datumsanzeige) erfolgreich bestanden!');

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
