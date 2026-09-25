const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

describe('Invoice Save Workflow & Validation (saveRechnung)', () => {
    let dom;
    let window;
    let document;
    let toastMessages = [];
    let savedDocs = [];

    beforeEach(() => {
        toastMessages = [];
        savedDocs = [];

        dom = new JSDOM(`
            <!DOCTYPE html>
            <html>
            <body>
                <div id="rechnung-modal"></div>
                <input id="rechnung-id" type="hidden" value="" />
                <select id="rechnung-kunde">
                    <option value="">Bitte wählen...</option>
                    <option value="1">Musterkunde GmbH</option>
                </select>
                <select id="rechnung-projekt">
                    <option value="">Kein Projekt</option>
                </select>
                <select id="rechnung-objekt">
                    <option value="">Kein Objekt</option>
                </select>
                <input id="rechnung-datum" value="2026-09-25" />
                <input id="rechnung-faellig" value="2026-10-15" />
                <input id="rechnung-status" value="Entwurf" />
                <input id="rechnung-nr" value="INV-2026-007" />
                <input id="rechnung-customer-type" value="B2B" />
                <input id="rechnung-art" value="Standard" />
                <input id="rechnung-leitweg-id" value="" />
                <input id="rechnung-buyer-reference" value="" />
                <input id="rechnung-leistungszeitraum-von" value="" />
                <input id="rechnung-leistungszeitraum-bis" value="" />
                <input id="rechnung-baustellen-adresse" value="" />
                <input id="rechnung-vob-vereinbart" type="checkbox" />
                <input id="rechnung-ist-privatkunde" type="checkbox" />
                <input id="rechnung-unterliegt-bauabzugsteuer" type="checkbox" />
                <input id="rechnung-13b-ustg" type="checkbox" />
                <input id="rechnung-vortext" value="" />
                <input id="rechnung-fusstext" value="" />
                <input id="rechnung-eingabemodus" value="netto" />
                <input id="rechnung-global-rabatt" value="0" />
                <select id="rechnung-global-rabatt-type"><option value="%">%</option></select>
                <input id="rechnung-sicherheitseinbehalt-prozent" value="" />
                <input id="rechnung-skonto-tage" value="" />
                <input id="rechnung-skonto-prozent" value="" />

                <button id="rechnung-modal-submit">
                    <span id="rechnung-modal-submit-text">Rechnung Speichern</span>
                </button>
            </body>
            </html>
        `, { runScripts: 'dangerously' });

        window = dom.window;
        document = window.document;

        // Mock state
        window.state = {
            isAngebotMode: false,
            angebote: [],
            rechnungen: [],
            artikel: [],
            kunden: [{ id: 1, name: 'Musterkunde GmbH' }],
            einstellungen: {
                unternehmensart: 'handwerk',
                eingabemodus: 'netto'
            },
            currentRechnungPositionen: [],
            currentRechnungTotals: {
                netto: 0,
                steuer: 0,
                brutto: 0,
                rabattAbzug: 0,
                anzahlung: 0,
                zahlbetrag: 0,
                sicherheitseinbehalt: 0
            },
            currentRechnungVerrechnungen: []
        };

        // Mock showToast
        window.showToast = (msg, type) => {
            toastMessages.push({ msg, type });
        };

        // Mock api
        window.api = {
            saveDocument: async (doc) => {
                savedDocs.push(doc);
                return 42;
            },
            getFullState: async () => ({
                angebote: [],
                rechnungen: savedDocs,
                artikel: []
            })
        };

        // Load InvoiceModel
        const invoiceModelCode = fs.readFileSync(path.join(__dirname, '../models/InvoiceModel.js'), 'utf-8');
        window.eval(invoiceModelCode);

        // Load InvoiceController
        const invoiceControllerCode = fs.readFileSync(path.join(__dirname, '../controllers/InvoiceController.js'), 'utf-8');
        window.eval(invoiceControllerCode);

        // Load editor.js saveRechnung
        const editorCode = fs.readFileSync(path.join(__dirname, '../js/editor.js'), 'utf-8');
        window.eval(editorCode);
    });

    test('saveRechnung without selecting a customer prompts user to select a customer instead of DB error', async () => {
        document.getElementById('rechnung-kunde').value = '';
        
        await window.saveRechnung();

        assert.strictEqual(savedDocs.length, 0, 'No document should be saved without customer');
        const lastToast = toastMessages[toastMessages.length - 1];
        assert.ok(lastToast, 'A toast should be shown');
        assert.strictEqual(lastToast.msg, 'Bitte wählen Sie einen Kunden aus.');
        assert.strictEqual(lastToast.type, 'error');
    });

    test('saveRechnung with customer but empty positions prompts user to add positions', async () => {
        document.getElementById('rechnung-kunde').value = '1';
        window.state.currentRechnungPositionen = [];

        await window.saveRechnung();

        assert.strictEqual(savedDocs.length, 0, 'No document should be saved without positions');
        const lastToast = toastMessages[toastMessages.length - 1];
        assert.ok(lastToast, 'A toast should be shown');
        assert.strictEqual(lastToast.msg, 'Bitte fügen Sie mindestens eine Position hinzu.');
        assert.strictEqual(lastToast.type, 'error');
    });

    test('saveRechnung with customer and valid position successfully saves document', async () => {
        document.getElementById('rechnung-kunde').value = '1';
        window.state.currentRechnungPositionen = [
            { artikelId: 10, name: 'Trockenbauwand stellen', menge: 5, preis: 50, mwst: 19 }
        ];
        window.state.currentRechnungTotals = {
            netto: 250,
            steuer: 47.5,
            brutto: 297.5,
            rabattAbzug: 0,
            anzahlung: 0,
            zahlbetrag: 297.5,
            sicherheitseinbehalt: 0
        };

        await window.saveRechnung();

        assert.strictEqual(savedDocs.length, 1, 'Document should be saved');
        assert.strictEqual(savedDocs[0].kundeId, 1);
        assert.strictEqual(savedDocs[0].nr, 'INV-2026-007');
        assert.strictEqual(savedDocs[0].customer_type, 'B2B');
        assert.strictEqual(savedDocs[0].netto, 250);

        const successToast = toastMessages.find(t => t.type === 'success');
        assert.ok(successToast, 'Success toast should be shown');
        assert.strictEqual(successToast.msg, 'Dokument erfolgreich gespeichert.');
    });

    test('saveRechnung properly handles B2C customer_type without ReferenceError', async () => {
        document.getElementById('rechnung-kunde').value = '1';
        document.getElementById('rechnung-customer-type').value = 'B2C';
        document.getElementById('rechnung-ist-privatkunde').checked = true;
        window.state.currentRechnungPositionen = [
            { artikelId: 10, name: 'Malerarbeiten', menge: 1, preis: 100, mwst: 19 }
        ];

        await window.saveRechnung();

        assert.strictEqual(savedDocs.length, 1);
        assert.strictEqual(savedDocs[0].customer_type, 'B2C');
        assert.strictEqual(savedDocs[0].ist_privatkunde, 1);
    });
});
