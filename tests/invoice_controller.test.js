const test = require('node:test');
const assert = require('assert');
const InvoiceController = require('../controllers/InvoiceController');

console.log('=== TEST SUITE: INVOICE-CONTROLLER ===\n');

test('InvoiceController is loaded', () => {
    assert.strictEqual(typeof InvoiceController.calculateTotals, 'function');
});

test('calculateTotals - netto mode, simple calculation', () => {
    const params = {
        mode: 'netto',
        positionen: [
            { menge: 2, preis: 50, rabatt: 0, mwst: 19 },
            { menge: 1, preis: 100, rabatt: 0, mwst: 7 }
        ]
    };
    const result = InvoiceController.calculateTotals(params);

    assert.strictEqual(result.positionenNetto, 200, 'Netto positionen should be 200');
    assert.strictEqual(result.positionenBrutto, 226, 'Brutto positionen should be 226');
    assert.strictEqual(result.nettoNachRabatt, 200, 'Netto after discount should be 200');
    assert.strictEqual(result.bruttoNachRabatt, 226, 'Brutto after discount should be 226');
    assert.strictEqual(result.totalTax, 26, 'Total tax should be 26');
    assert.strictEqual(result.taxBreakdown.length, 2, 'Should have 2 tax rates');

    const tax19 = result.taxBreakdown.find(t => t.rate === 19);
    assert.strictEqual(tax19.amount, 19, 'Tax 19% amount should be 19');

    const tax7 = result.taxBreakdown.find(t => t.rate === 7);
    assert.strictEqual(Math.round(tax7.amount * 100) / 100, 7, 'Tax 7% amount should be 7');
});

test('calculateTotals - brutto mode, simple calculation', () => {
    const params = {
        mode: 'brutto',
        positionen: [
            { menge: 2, preis: 59.5, rabatt: 0, mwst: 19 }, // 100 netto
            { menge: 1, preis: 107, rabatt: 0, mwst: 7 }    // 100 netto
        ]
    };
    const result = InvoiceController.calculateTotals(params);

    assert.strictEqual(Math.round(result.positionenNetto * 100) / 100, 200, 'Netto positionen should be 200');
    assert.strictEqual(result.positionenBrutto, 226, 'Brutto positionen should be 226');
    assert.strictEqual(Math.round(result.nettoNachRabatt * 100) / 100, 200, 'Netto after discount should be 200');
    assert.strictEqual(result.bruttoNachRabatt, 226, 'Brutto after discount should be 226');
    assert.strictEqual(Math.round(result.totalTax * 100) / 100, 26, 'Total tax should be 26');
    assert.strictEqual(result.zahlbetrag, 226, 'Zahlbetrag should be 226');
});

test('calculateTotals - global discount percentage in netto mode', () => {
    const params = {
        mode: 'netto',
        globalRabatt: { value: 10, type: '%' },
        positionen: [
            { menge: 1, preis: 100, rabatt: 0, mwst: 19 } // 100 netto, 119 brutto
        ]
    };
    const result = InvoiceController.calculateTotals(params);

    assert.strictEqual(result.positionenNetto, 100);
    assert.strictEqual(result.abzug, 10);
    assert.strictEqual(result.nettoNachRabatt, 90);
    assert.strictEqual(result.totalTax, 17.1); // 19% of 90
    assert.strictEqual(result.bruttoNachRabatt, 107.1);
});

test('calculateTotals - global discount absolute in brutto mode', () => {
    const params = {
        mode: 'brutto',
        globalRabatt: { value: 11.9, type: '€' },
        positionen: [
            { menge: 1, preis: 119, rabatt: 0, mwst: 19 } // 100 netto
        ]
    };
    const result = InvoiceController.calculateTotals(params);

    assert.strictEqual(result.positionenBrutto, 119);
    assert.strictEqual(result.abzug, 11.9);
    assert.strictEqual(result.bruttoNachRabatt, 107.1);

    // Reverse calculation from bruttoNachRabatt (107.1). Tax should be proportional.
    // Base tax was 19. Rabattfaktor = 107.1 / 119 = 0.9. New tax = 19 * 0.9 = 17.1.
    // New netto = 107.1 - 17.1 = 90
    assert.strictEqual(Math.round(result.nettoNachRabatt * 100) / 100, 90);
    assert.strictEqual(Math.round(result.totalTax * 100) / 100, 17.1);
});

test('calculateTotals - §13b reverse charge', () => {
    const params = {
        mode: 'netto',
        isGlobal13b: true,
        positionen: [
            { menge: 1, preis: 100, rabatt: 0, mwst: 19, is13b: true },
            { menge: 1, preis: 200, rabatt: 0, mwst: 7, is13b: false }
        ]
    };
    const result = InvoiceController.calculateTotals(params);

    // 1st pos: 100 netto, 0 tax (13b)
    // 2nd pos: 200 netto, 14 tax (normal)
    assert.strictEqual(result.positionenNetto, 300);
    assert.strictEqual(result.totals13bNetto, 100);
    assert.strictEqual(result.totalsNormalNetto, 200);
    assert.strictEqual(Math.round(result.totalTax * 100) / 100, 14);
    assert.strictEqual(Math.round(result.bruttoNachRabatt * 100) / 100, 314); // 300 + 14 tax

    // Tax breakdown should only contain 7% (19% might be present but with amount 0)
    const tax7 = result.taxBreakdown.find(t => t.rate === 7);
    assert.strictEqual(Math.round(tax7.amount * 100) / 100, 14);
    const tax19 = result.taxBreakdown.find(t => t.rate === 19);
    if (tax19) {
        assert.strictEqual(tax19.amount, 0, 'Tax 19% should be 0 as it is 13b');
    }
});

test('calculateTotals - Sicherungseinbehalt (Security Retention)', () => {
    const params = {
        mode: 'netto',
        sicherheitseinbehaltProzent: 5,
        positionen: [
            { menge: 1, preis: 1000, rabatt: 0, mwst: 19 }
        ]
    };
    const result = InvoiceController.calculateTotals(params);

    assert.strictEqual(result.positionenNetto, 1000);
    assert.strictEqual(result.sicherheitseinbehaltNetto, 50); // 5% of 1000

    // Steuerpflichtiges Netto = 1000 - 50 = 950.
    // Tax = 19% of 950 = 180.5
    assert.strictEqual(result.totalTax, 180.5);
    // BruttoNachRabatt = 950 + 180.5 = 1130.5
    assert.strictEqual(result.bruttoNachRabatt, 1130.5);
});

test('calculateTotals - Verrechnungen and Anzahlung', () => {
    const params = {
        mode: 'netto',
        verrechnungen: [
            { abzugsbetrag_netto: 200 },
            { abzugsbetrag_netto: 100 }
        ],
        anzahlung: 500,
        positionen: [
            { menge: 1, preis: 1000, rabatt: 0, mwst: 19 }
        ]
    };
    const result = InvoiceController.calculateTotals(params);

    assert.strictEqual(result.verrechnungenSummeNetto, 300);

    // Steuerpflichtiges Netto = 1000 - 300 = 700
    // Tax = 19% of 700 = 133
    // BruttoNachRabatt = 700 + 133 = 833
    assert.strictEqual(result.bruttoNachRabatt, 833);

    // Zahlbetrag = BruttoNachRabatt - Anzahlung = 833 - 500 = 333
    assert.strictEqual(result.zahlbetrag, 333);
});

test('calculateTotals - everything combined', () => {
    const params = {
        mode: 'netto',
        globalRabatt: { value: 10, type: '%' },
        sicherheitseinbehaltProzent: 5,
        isGlobal13b: true,
        verrechnungen: [{ abzugsbetrag_netto: 100 }],
        anzahlung: 50,
        positionen: [
            { menge: 1, preis: 1000, rabatt: 0, mwst: 19, is13b: true }, // 13b
            { menge: 2, preis: 500, rabatt: 0, mwst: 19, is13b: false } // normal
        ]
    };
    const result = InvoiceController.calculateTotals(params);

    assert.strictEqual(result.positionenNetto, 2000); // 1000 + 1000
    assert.strictEqual(result.abzug, 200); // 10% of 2000
    assert.strictEqual(result.nettoNachRabatt, 1800); // 2000 - 200

    // Sicherungseinbehalt: 5% of 1800 = 90
    assert.strictEqual(result.sicherheitseinbehaltNetto, 90);

    // Verrechnung: 100
    // Steuerpflichtiges Netto = 1800 - 90 - 100 = 1610

    // Now tax breakdown.
    // Rabattfaktor = 1800 / 2000 = 0.9.
    // Taxable Ratio = 1610 / 1800 = 0.894444...
    // Base taxes before any global stuff:
    // Pos 1 (13b): 0
    // Pos 2: 19% of 1000 = 190.
    // Adjusted tax = 190 * 0.9 * (1610 / 1800) = 152.95
    assert.strictEqual(Math.round(result.totalTax * 100) / 100, 152.95);

    // BruttoNachRabatt = Steuerpflichtiges Netto (1610) + Tax (152.95) = 1762.95
    assert.strictEqual(Math.round(result.bruttoNachRabatt * 100) / 100, 1762.95);

    // Zahlbetrag = BruttoNachRabatt - Anzahlung(50) = 1712.95
    assert.strictEqual(Math.round(result.zahlbetrag * 100) / 100, 1712.95);
});

test('validateSaveDocument - valid document', () => {
    const doc = {
        kundeId: 123,
        positionen: [
            { artikelId: 456 }
        ]
    };
    const result = InvoiceController.validateSaveDocument(doc);
    assert.strictEqual(result.valid, true);
});

test('validateSaveDocument - missing kundeId', () => {
    const doc = {
        positionen: [
            { artikelId: 456 }
        ]
    };
    const result = InvoiceController.validateSaveDocument(doc);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.message, 'Bitte wählen Sie einen Kunden aus.');
});

test('validateSaveDocument - missing positionen', () => {
    const doc = {
        kundeId: 123,
        positionen: []
    };
    const result = InvoiceController.validateSaveDocument(doc);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.message, 'Bitte fügen Sie mindestens eine Position hinzu.');
});

test('validateSaveDocument - position without artikelId and name', () => {
    const doc = {
        kundeId: 123,
        positionen: [
            { preis: 100 }
        ]
    };
    const result = InvoiceController.validateSaveDocument(doc);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.message, 'Bitte wählen Sie für alle Positionen einen Artikel aus oder geben Sie eine Beschreibung ein.');
});

test('createStornoData - null input', () => {
    const result = InvoiceController.createStornoData(null);
    assert.strictEqual(result, null);
});

test('createStornoData - valid original invoice', () => {
    const originalInvoice = {
        nr: 'RE-2023-001',
        kundeId: 10,
        projektId: 20,
        positionen: [
            { menge: 5, preis: 100 }
        ],
        netto: 500,
        steuer: 95,
        brutto: 595,
        globalRabattAbzug: 0,
        zahlbetrag: 595
    };

    const result = InvoiceController.createStornoData(originalInvoice);

    assert.ok(result);
    assert.strictEqual(result.stornoNr, 'STORNO - RE-2023-001');

    // Check updated original
    assert.strictEqual(result.updatedOriginal.status, 'Storniert');
    assert.strictEqual(result.updatedOriginal.isLocked, true);

    // Check storno doc
    const storno = result.stornoDoc;
    assert.strictEqual(storno.nr, 'STORNO - RE-2023-001');
    assert.strictEqual(storno.type, 'rechnung');
    assert.strictEqual(storno.kundeId, 10);
    assert.strictEqual(storno.projektId, 20);
    assert.strictEqual(storno.netto, -500);
    assert.strictEqual(storno.steuer, -95);
    assert.strictEqual(storno.brutto, -595);
    assert.strictEqual(storno.zahlbetrag, -595);
    assert.strictEqual(storno.status, 'Bezahlt');
    assert.strictEqual(storno.isLocked, true);

    // Check positions in storno doc
    assert.strictEqual(storno.positionen.length, 1);
    assert.strictEqual(storno.positionen[0].menge, -5);
    assert.strictEqual(storno.positionen[0].preis, 100);
});
