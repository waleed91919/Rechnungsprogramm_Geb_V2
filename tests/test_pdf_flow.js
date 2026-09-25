const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <div id="print-template"></div>
    <div id="pdf-preview-modal" class="hidden"></div>
    <div id="pdf-preview-container"></div>
    <div id="pdf-preview-scroll-wrapper"></div>
</body></html>`, { runScripts: "dangerously" });
const window = dom.window;

// Setup mock state
window.state = {
    einstellungen: {
        firmenname: 'W-LINK ERP',
        adresse: 'Musterstraße 1\n12345 Musterstadt',
        logo: '',
        bankname: 'Volksbank Musterstadt',
        steuer: 'DE999888777',
        iban: 'DE89 3704 0044 0532 0130 00',
        bic: 'COBADEFFXXX',
        rechnungsvorlage: 'klassisch'
    },
    artikel: [],
    projekte: [],
    rechnungen: [],
    angebote: [],
    kunden: [{ id: 1, name: 'Jassam abbas' }]
};

window.api = {
    generateQrCode: async (txt) => 'data:image/png;base64,mockQr',
    saveDocument: async (doc) => ({ success: true })
};

// Global DOM functions needed by utils & einstellungen
window.document = dom.window.document;

// Load utils.js
const utilsCode = fs.readFileSync(path.join(__dirname, '../js/utils.js'), 'utf-8');
window.eval(utilsCode);
window.eval(`
    var formatCurrency = (val) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val);
    window.formatCurrency = formatCurrency;
`);

// Load InvoiceView.js
const invoiceViewCode = fs.readFileSync(path.join(__dirname, '../views/InvoiceView.js'), 'utf-8');
window.eval(invoiceViewCode);
window.invoiceView = new window.InvoiceView(window.formatCurrency);

// Load einstellungen.js
const einstellungenCode = fs.readFileSync(path.join(__dirname, '../js/einstellungen.js'), 'utf-8');
window.eval(einstellungenCode);

// Test invoice 8 (INV-2026-006)
const testRech = {
    id: 8,
    nr: "INV-2026-006",
    kundeId: 1,
    status: "Entwurf",
    isLocked: false,
    datum: "2026-09-01",
    faellig: "2026-09-15",
    netto: 2200,
    steuer: 418,
    brutto: 2618,
    rechnungsart: "REGULAER",
    positionen: [
        {
            id: 14,
            dokumentId: 8,
            artikelId: null,
            menge: 1,
            preis: 2200,
            ek: 0,
            mwst: 19,
            rabatt: 0,
            name: "Reingung",
            is13b: 0,
            einheit: "pauschal"
        }
    ]
};

window.state.rechnungen = [testRech];

(async () => {
    try {
        console.log('Testing generatePdf(8)...');
        await window.generatePdf(8);
        await new Promise(r => setTimeout(r, 100));
        console.log('After timeout:');
        const modal = window.document.getElementById('pdf-preview-modal');
        console.log('Modal classes:', modal.className, 'style.display:', modal.style.display);
        const container = window.document.getElementById('pdf-preview-container');
        console.log('Container HTML length:', container.innerHTML.length);
        console.log('SUCCESS: PDF preview generated!');
    } catch (e) {
        console.error('CRASH IN TEST:', e);
    }
})();
