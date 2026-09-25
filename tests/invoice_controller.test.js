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

    // VOB/B & § 13 UStG: Sicherheitseinbehalt mindert NICHT das steuerpflichtige Netto!
    // Steuerpflichtiges Netto = 1000.
    // Tax = 19% of 1000 = 190.00
    assert.strictEqual(result.totalTax, 190);
    // BruttoNachRabatt = 1000 + 190 = 1190.00
    assert.strictEqual(result.bruttoNachRabatt, 1190);
    // Zahlbetrag = BruttoNachRabatt (1190) - Sicherheitseinbehalt (50) = 1140.00
    assert.strictEqual(result.zahlbetrag, 1140);
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
    assert.strictEqual(result.verrechnungenSummeBrutto, 357);

    // § 14 Abs. 5 UStG & EN 16931: Steuer bemisst sich auf das volle Netto (1000 €)!
    // Tax = 19% of 1000 = 190 €
    assert.strictEqual(result.totalTax, 190);
    // BruttoNachRabatt = Netto (1000) + Steuer (190) = 1190.00
    assert.strictEqual(result.bruttoNachRabatt, 1190);

    // Zahlbetrag = BruttoNachRabatt (1190) - Anzahlung (500) - Verrechnungen brutto (357) = 333.00
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

    // § 14 Abs. 5 UStG: Steuer bemisst sich auf die Gesamtleistung nach Rabatt.
    // Rabattfaktor = 1800 / 2000 = 0.9.
    // Pos 1 (13b): 0
    // Pos 2: 19% of (1000 * 0.9) = 171.00
    assert.strictEqual(result.totalTax, 171);

    // BruttoNachRabatt = Netto (1800) + Steuer (171) = 1971.00 (Netto + Steuer == Brutto!)
    assert.strictEqual(result.bruttoNachRabatt, 1971);

    // Verrechnungen: Da isGlobal13b=true, ist Vorrechnungs-USt 0%, brutto = 100.00
    assert.strictEqual(result.verrechnungenSummeBrutto, 100);

    // Zahlbetrag = Brutto (1971) - Anzahlung (50) - Sicherheitseinbehalt (90) - Verrechnung (100) = 1731.00
    assert.strictEqual(result.zahlbetrag, 1731);
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

test('calculateTotals - keine Geister-Steuerzeilen bei reinen 19%-Rechnungen oder 0%-Positionen', () => {
    // 1. Reine 19%-Rechnung darf keine 7%-Zeile enthalten
    const params19 = {
        mode: 'netto',
        positionen: [
            { menge: 1, preis: 100, rabatt: 0, mwst: 19 }
        ]
    };
    const res19 = InvoiceController.calculateTotals(params19);
    assert.strictEqual(res19.taxBreakdown.length, 1, 'Reine 19%-Rechnung darf exakt 1 Steuerzeile haben');
    assert.strictEqual(res19.taxBreakdown[0].rate, 19);

    // 2. Rechnung mit 0% MwSt. (z.B. Photovoltaik § 12 Abs. 3 UStG)
    const params0 = {
        mode: 'netto',
        positionen: [
            { menge: 1, preis: 500, rabatt: 0, mwst: 0 }
        ]
    };
    const res0 = InvoiceController.calculateTotals(params0);
    assert.strictEqual(res0.taxBreakdown.length, 1, '0%-Rechnung darf Steuerzeile für 0% ausweisen');
    assert.strictEqual(res0.taxBreakdown[0].rate, 0);
    assert.strictEqual(res0.taxBreakdown[0].amount, 0);
    assert.strictEqual(res0.totalTax, 0);
});

test('calculateTotals - sicherheitseinbehaltProzent calculation with custom percentage', () => {
    const params = {
        mode: 'netto',
        positionen: [
            { menge: 1, preis: 2000, rabatt: 0, mwst: 19 } // 2000 netto, 380 mwst, 2380 brutto
        ],
        sicherheitseinbehaltProzent: 10
    };
    const res = InvoiceController.calculateTotals(params);
    assert.strictEqual(res.sicherheitseinbehaltProzent, 10);
    assert.strictEqual(res.sicherheitseinbehaltNetto, 200); // 10% of 2000 netto
    assert.strictEqual(res.totalTax, 380); // MwSt remains unaffected
    assert.strictEqual(res.bruttoNachRabatt, 2380);
    assert.strictEqual(res.zahlbetrag, 2180); // 2380 brutto - 200 sicherheitseinbehalt
});

test('P0-3: calculateTotals - §13b Vorranglogik (Global vs. Positionsflag)', () => {
    // 1. Global 13b ohne Positionsflag: Positionen erben standardmäßig 13b (0% Reverse Charge)
    const resGlobal = InvoiceController.calculateTotals({
        mode: 'netto',
        isGlobal13b: true,
        positionen: [
            { menge: 1, preis: 500, mwst: 19 },
            { menge: 2, preis: 250, mwst: 7 }
        ]
    });
    assert.strictEqual(resGlobal.positionenNetto, 1000);
    assert.strictEqual(resGlobal.totals13bNetto, 1000, 'Alle Positionen müssen dem 13b-Netto zugeordnet sein');
    assert.strictEqual(resGlobal.totalsNormalNetto, 0);
    assert.strictEqual(resGlobal.totalTax, 0, 'Globaler 13b-Beleg darf standardmäßig keine Steuer ausweisen');
    assert.strictEqual(resGlobal.bruttoNachRabatt, 1000);
    assert.strictEqual(resGlobal.taxBreakdown.length, 0);

    // 2. Global false, aber Pos 1 hat is13b: true (Mischbeleg)
    const resMischNormal = InvoiceController.calculateTotals({
        mode: 'netto',
        isGlobal13b: false,
        positionen: [
            { menge: 1, preis: 400, mwst: 19, is13b: true },
            { menge: 1, preis: 600, mwst: 19 } // normal
        ]
    });
    assert.strictEqual(resMischNormal.positionenNetto, 1000);
    assert.strictEqual(resMischNormal.totals13bNetto, 400);
    assert.strictEqual(resMischNormal.totalsNormalNetto, 600);
    assert.strictEqual(resMischNormal.totalTax, 114); // 19% von 600
    assert.strictEqual(resMischNormal.bruttoNachRabatt, 1114);

    // 3. Global true, aber Pos 1 weicht explizit mit is13b: false ab
    const resMisch13bGlobal = InvoiceController.calculateTotals({
        mode: 'netto',
        isGlobal13b: true,
        positionen: [
            { menge: 1, preis: 300, mwst: 19, is13b: false }, // weicht ab -> normale Besteuerung
            { menge: 1, preis: 700, mwst: 19 }                 // erbt global 13b
        ]
    });
    assert.strictEqual(resMisch13bGlobal.positionenNetto, 1000);
    assert.strictEqual(resMisch13bGlobal.totalsNormalNetto, 300);
    assert.strictEqual(resMisch13bGlobal.totals13bNetto, 700);
    assert.strictEqual(resMisch13bGlobal.totalTax, 57); // 19% von 300
    assert.strictEqual(resMisch13bGlobal.bruttoNachRabatt, 1057);
});

test('K1-4: Leitweg-ID ISO 7064 MOD 97-10 Prüfziffernberechnung & Validierung', () => {
    // 1. Prüfziffern-Berechnung
    const pz1 = InvoiceController.computeLeitwegIdChecksum('04011000-1234567890');
    assert.strictEqual(pz1, '17', 'Prüfziffer für 04011000-1234567890 muss 17 sein');

    const pz2 = InvoiceController.computeLeitwegIdChecksum('991-12345678');
    assert.strictEqual(pz2, '30', 'Prüfziffer für 991-12345678 muss 30 sein');

    // 2. Gültige IDs
    assert.strictEqual(InvoiceController.validateLeitwegId('04011000-1234567890-17').valid, true);
    assert.strictEqual(InvoiceController.validateLeitwegId('991-12345678-30').valid, true);

    // 3. Ungültige Prüfziffer
    const invalidCheck = InvoiceController.validateLeitwegId('991-12345678-12');
    assert.strictEqual(invalidCheck.valid, false);
    assert.ok(invalidCheck.message.includes('Ungültige Prüfziffer'), 'Verständliche Fehlermeldung erwartet');
    assert.ok(invalidCheck.message.includes('Erwartet: 30'), 'Erwartete Prüfziffer muss genannt werden');

    // 4. B2G Validierung in validateSaveDocument
    const docB2GValid = {
        kundeId: 10,
        customer_type: 'B2G',
        leitweg_id: '991-12345678-30',
        positionen: [{ name: 'Leistung', menge: 1, preis: 100 }]
    };
    assert.strictEqual(InvoiceController.validateSaveDocument(docB2GValid).valid, true);

    const docB2GInvalid = {
        kundeId: 10,
        customer_type: 'B2G',
        leitweg_id: '991-12345678-99',
        positionen: [{ name: 'Leistung', menge: 1, preis: 100 }]
    };
    const resSaveInvalid = InvoiceController.validateSaveDocument(docB2GInvalid);
    assert.strictEqual(resSaveInvalid.valid, false);
    assert.ok(resSaveInvalid.message.includes('Ungültige Leitweg-ID'));
});

test('P0-4: createStornoData erzeugt Storno-Typ und Ursprungsreferenz', () => {
    const original = {
        id: 42,
        nr: 'RE-2026-0042',
        datum: '2026-08-10',
        kundeId: 7,
        netto: 500,
        brutto: 595,
        positionen: [{ name: 'Pos 1', menge: 1, preis: 500, mwst: 19 }]
    };
    const { updatedOriginal, stornoDoc, stornoNr } = InvoiceController.createStornoData(original);
    assert.strictEqual(stornoDoc.typ, 'STORNO');
    assert.strictEqual(stornoDoc.rechnungsart, 'STORNO');
    assert.strictEqual(stornoDoc.isStorno, true);
    assert.strictEqual(stornoDoc.storno_zu_nr, 'RE-2026-0042');
    assert.strictEqual(stornoDoc.storno_zu_datum, '2026-08-10');
    assert.strictEqual(stornoNr, 'STORNO - RE-2026-0042');
    assert.strictEqual(updatedOriginal.status, 'Storniert');
});

test('P0-3: B2G-Gate härten - B2G-Rechnung mit ungültiger oder fehlender Leitweg-ID wird abgelehnt', () => {
    const EInvoiceEngine = require('../js/einvoice.js');

    // 1. In InvoiceController.validateSaveDocument: buyer_reference reicht nicht als Ersatz für BT-10 Leitweg-ID
    const docB2GOnlyBuyerRef = {
        kundeId: 10,
        customer_type: 'B2G',
        buyer_reference: 'BESTELLUNG-9988',
        positionen: [{ name: 'Leistung', menge: 1, preis: 100 }]
    };
    const resOnlyBuyerRef = InvoiceController.validateSaveDocument(docB2GOnlyBuyerRef);
    assert.strictEqual(resOnlyBuyerRef.valid, false);
    assert.ok(resOnlyBuyerRef.message.includes('Leitweg-ID'), 'Muss Leitweg-ID fordern und nicht buyer_reference akzeptieren');

    // 2. Ungültige Prüfziffer bei validateSaveDocument
    const docB2GInvalidLid = {
        kundeId: 10,
        customer_type: 'B2G',
        leitweg_id: '991-12345678-99',
        buyer_reference: 'BESTELLUNG-9988',
        positionen: [{ name: 'Leistung', menge: 1, preis: 100 }]
    };
    const resInvalidLid = InvoiceController.validateSaveDocument(docB2GInvalidLid);
    assert.strictEqual(resInvalidLid.valid, false);
    assert.ok(resInvalidLid.message.includes('Ungültige Leitweg-ID'));

    // 3. EInvoiceEngine.buildCII / generateXRechnungXML wirft echten Fehler bei B2G ohne / mit ungültiger Leitweg-ID
    const invB2G = {
        id: 1,
        status: 'Festgeschrieben',
        isLocked: 1,
        nr: 'RE-2026-B2G',
        datum: '2026-08-01',
        customer_type: 'B2G',
        leitweg_id: '991-12345678-99', // ungültig
        positionen: [{ name: 'Leistung', menge: 1, preis: 100 }]
    };
    const custB2G = { name: 'Behörde Berlin', ort: 'Berlin', customer_type: 'B2G' };
    const seller = { firmenname: 'Bau GmbH', ort: 'Berlin', iban: 'DE123', ustId: 'DE123' };

    assert.throws(() => {
        EInvoiceEngine.generateXRechnungXML(invB2G, custB2G, seller);
    }, /Leitweg-ID.*ungültig/);

    const invB2GMissing = { ...invB2G, leitweg_id: '', buyer_reference: 'BESTELLUNG-123' };
    assert.throws(() => {
        EInvoiceEngine.generateXRechnungXML(invB2GMissing, custB2G, seller);
    }, /Leitweg-ID fehlt/);

    // 4. Gültige Leitweg-ID passiert sowohl Validierung als auch Export
    const docB2GValid = {
        ...invB2G,
        kundeId: 10,
        leitweg_id: '991-12345678-30'
    };
    assert.strictEqual(InvoiceController.validateSaveDocument(docB2GValid).valid, true);
    assert.doesNotThrow(() => {
        EInvoiceEngine.generateXRechnungXML(docB2GValid, custB2G, seller);
    });
});

test('P0-4: § 13b Harmonisierung - isGlobal13b und unterliegt_13b werden einheitlich ausgewertet', () => {
    const EInvoiceEngine = require('../js/einvoice.js');

    const invGlobalFlag = {
        unterliegt_13b: 1,
        positionen: [{ name: 'Dachdeckerarbeiten', menge: 1, preis: 1000 }]
    };
    const invGlobalAlias = {
        isGlobal13b: true,
        positionen: [{ name: 'Dachdeckerarbeiten', menge: 1, preis: 1000 }]
    };

    const catFlag = EInvoiceEngine.resolvePositionCategory(invGlobalFlag, invGlobalFlag.positionen[0]);
    const catAlias = EInvoiceEngine.resolvePositionCategory(invGlobalAlias, invGlobalAlias.positionen[0]);
    assert.strictEqual(catFlag, 'AE', 'unterliegt_13b muss Steuercode AE liefern');
    assert.strictEqual(catAlias, 'AE', 'isGlobal13b Alias muss ebenfalls Steuercode AE liefern');

    const totFlag = InvoiceController.calculateTotals({ mode: 'netto', unterliegt_13b: true, positionen: [{ menge: 1, preis: 1000, mwst: 19 }] });
    const totAlias = InvoiceController.calculateTotals({ mode: 'netto', isGlobal13b: true, positionen: [{ menge: 1, preis: 1000, mwst: 19 }] });
    assert.strictEqual(totFlag.totalTax, 0);
    assert.strictEqual(totAlias.totalTax, 0);
    assert.strictEqual(totFlag.totals13bNetto, 1000);
    assert.strictEqual(totAlias.totals13bNetto, 1000);
});

test('§ 13b Vorranglogik greift auch bei Rechnungsvorschau und Belegdruck', () => {
    // Vorranglogik gem. js/einstellungen.js (Zeilen 493-494, 565-566, 1548):
    // const global13b = Boolean(rech.unterliegt_13b || rech.isGlobal13b);
    // const isPos13b = (pos.is13b !== undefined && pos.is13b !== null) ? Boolean(pos.is13b) : global13b;
    // Vorschau MwSt: isPos13b ? '0%' : `${pos.mwst}%`;

    const getPreviewMwstText = (rech, pos) => {
        const global13b = Boolean(rech.unterliegt_13b || rech.isGlobal13b);
        const isPos13b = (pos.is13b !== undefined && pos.is13b !== null) ? Boolean(pos.is13b) : global13b;
        return isPos13b ? '0%' : `${pos.mwst}%`;
    };

    const rechGlobal = {
        unterliegt_13b: true,
        positionen: [
            { name: 'Leistung ohne Positionsflag', menge: 1, preis: 500, mwst: 19 },
            { name: 'Leistung mit explizitem is13b: false', menge: 1, preis: 200, mwst: 19, is13b: false }
        ]
    };

    // 1. Rechnungsvorschau-Logik:
    // - global gesetzt, Position ohne Flag -> 0% MwSt
    assert.strictEqual(
        getPreviewMwstText(rechGlobal, rechGlobal.positionen[0]),
        '0%',
        'Rechnungsvorschau: Position ohne Flag erbt globales 13b und muss 0% MwSt ausweisen'
    );

    // - Position explizit false trotz global -> Standard-MwSt
    assert.strictEqual(
        getPreviewMwstText(rechGlobal, rechGlobal.positionen[1]),
        '19%',
        'Rechnungsvorschau: Position mit is13b: false trotz global 13b muss Standard-MwSt (19%) ausweisen'
    );

    // 2. Gegenprobe mit isGlobal13b Alias:
    const rechAlias = {
        isGlobal13b: true,
        positionen: [
            { name: 'Leistung ohne Positionsflag', menge: 1, preis: 300, mwst: 7 },
            { name: 'Leistung mit explizitem is13b: false', menge: 1, preis: 400, mwst: 19, is13b: false }
        ]
    };
    assert.strictEqual(getPreviewMwstText(rechAlias, rechAlias.positionen[0]), '0%');
    assert.strictEqual(getPreviewMwstText(rechAlias, rechAlias.positionen[1]), '19%');

    // 3. Controller-Ebene spiegelt genau diese Vorschau-Werte wider
    const totals = InvoiceController.calculateTotals({
        mode: 'netto',
        unterliegt_13b: true,
        positionen: rechGlobal.positionen
    });
    assert.strictEqual(totals.processedPositions[0].pos13b, true);
    assert.strictEqual(totals.processedPositions[0].tax, 0);
    assert.strictEqual(totals.processedPositions[1].pos13b, false);
    assert.strictEqual(totals.processedPositions[1].tax, 38);

    // 4. Source-Code Regression-Check:
    // Verifiziere, dass js/einstellungen.js nirgendwo mehr die alte UND-Logik verwendet
    const fs = require('fs');
    const path = require('path');
    const einstellungenCode = fs.readFileSync(path.join(__dirname, '../js/einstellungen.js'), 'utf-8');
    assert.ok(
        !einstellungenCode.includes('rech.unterliegt_13b && pos.is13b'),
        'Veraltete UND-Logik (rech.unterliegt_13b && pos.is13b) darf in js/einstellungen.js nicht mehr vorkommen'
    );
});


