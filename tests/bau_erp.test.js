const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// Require modules to test
const SubcontractorController = require('../controllers/SubcontractorController.js');
const CumulativeBillingController = require('../controllers/CumulativeBillingController.js');
const EInvoiceEngine = require('../js/einvoice.js');
const GAEBEngine = require('../js/gaeb.js');
const { DATEVExporter } = require('../js/datev.js');
const GoBDAuditEngine = require('../js/gobd.js');

test('1. Subcontractor § 48b EStG Bauabzugsteuer Logic', async (t) => {
    await t.test('Valid Freistellungsbescheinigung should not trigger 15% retention', () => {
        const sub = {
            is_subcontractor: 1,
            sec48b_status: 'VALID',
            sec48b_valid_until: '2028-12-31'
        };

        const result = SubcontractorController.checkSec48bStatus(sub, new Date('2026-08-01'));
        assert.strictEqual(result.isValid, true);
        assert.strictEqual(result.appliesRetention, false);
        assert.strictEqual(result.retentionRate, 0);

        const taxAmount = SubcontractorController.calculateBauabzugsteuer(1000.00, result.appliesRetention);
        assert.strictEqual(taxAmount, 0);
    });

    await t.test('Expired or missing Freistellungsbescheinigung triggers 15% retention', () => {
        const subExpired = {
            is_subcontractor: 1,
            sec48b_status: 'EXPIRED',
            sec48b_valid_until: '2025-01-01'
        };

        const result = SubcontractorController.checkSec48bStatus(subExpired, new Date('2026-08-01'));
        assert.strictEqual(result.isValid, false);
        assert.strictEqual(result.appliesRetention, true);
        assert.strictEqual(result.retentionRate, 15.0);

        const taxAmount = SubcontractorController.calculateBauabzugsteuer(10000.00, result.appliesRetention);
        assert.strictEqual(taxAmount, 1500.00); // 15% of 10,000 EUR
    });
});

test('2. § 35a EStG B2C Handwerkerleistung Wage Breakdown', () => {
    const positionen = [
        { name: 'Malerarbeiten (Arbeitslohn)', menge: 10, preis: 50, mwst: 19, cost_type: 'LOHN' },
        { name: 'Anfahrtskosten', menge: 1, preis: 30, mwst: 19, cost_type: 'FAHRT' },
        { name: 'Wandfarbe Premium', menge: 5, preis: 40, mwst: 19, cost_type: 'MATERIAL' }
    ];

    const res = SubcontractorController.calculateSec35aBreakdown(positionen);
    assert.strictEqual(res.lohnNetto, 500.00);
    assert.strictEqual(res.fahrtNetto, 30.00);
    assert.strictEqual(res.materialNetto, 200.00);
    assert.strictEqual(res.eligibleNetto, 530.00); // 500 + 30
    assert.strictEqual(res.eligibleBrutto, 630.70); // 530 * 1.19
    assert.ok(res.noticeText.includes('§ 35a EStG'));
});

test('3. VOB/B Cumulative Billing Logic (F_t = L_t - sum F_i)', () => {
    const previousInvoices = [
        { nr: 'RE-1001', netto: 5000.00 },
        { nr: 'RE-1002', netto: 3000.00 }
    ];

    // Current total cumulative performance L_t = 12,000 EUR
    const res = CumulativeBillingController.calculateCumulativeInvoice({
        totalPerformanceNet: 12000.00,
        previousInvoices,
        securityRetentionRate: 5.0,
        vatRate: 19.0
    });

    assert.strictEqual(res.totalPreviousBilledNet, 8000.00); // 5000 + 3000
    assert.strictEqual(res.currentPeriodNet, 4000.00);      // 12000 - 8000 = 4000
    assert.strictEqual(res.securityRetentionAmount, 600.00); // 5% of 12000 = 600
    assert.strictEqual(res.sequenceNumber, 3);               // 3rd cumulative invoice

    // Test mit bereits erfolgten Sicherheitseinbehalten in Vorrechnungen
    const prevInvoicesWithRetention = [
        { nr: 'RE-1001', netto: 5000.00, sicherheitseinbehalt: 250.00 },
        { nr: 'RE-1002', netto: 3000.00, sicherheitseinbehalt: 150.00 }
    ];
    const resWithPrevRetention = CumulativeBillingController.calculateCumulativeInvoice({
        totalPerformanceNet: 12000.00,
        previousInvoices: prevInvoicesWithRetention,
        securityRetentionRate: 5.0,
        vatRate: 19.0
    });
    // Gesamtziel 5% von 12000 = 600. Bisher einbehalten: 250 + 150 = 400. In dieser Periode: 200.
    assert.strictEqual(resWithPrevRetention.securityRetentionAmount, 200.00);
});

test('4. EN 16931-1 XRechnung & ZUGFeRD Generator & B2G Leitweg-ID Check', () => {
    const b2gCustomer = {
        name: 'Bezirksamt Mitte',
        customer_type: 'B2G',
        adresse: 'Müllerstraße 147',
        plz: '13349',
        ort: 'Berlin',
        leitweg_id: '991-12345678-12'
    };

    const invoice = {
        nr: 'RE-2026-001',
        datum: '2026-08-13',
        faellig: '2026-09-13',
        netto: 1000.00,
        steuer: 190.00,
        brutto: 1190.00,
        positionen: [
            { name: 'Rohbauarbeiten Gewerk 01', menge: 1, preis: 1000.00, mwst: 19, einheit: 'C62' }
        ]
    };

    const seller = {
        firmenname: 'W-Link Bau GmbH',
        adresse: 'Bauweg 12, 10115 Berlin',
        iban: 'DE89370400440532013000',
        bic: 'COBADEFFXXX',
        ustId: 'DE123456789'
    };

    const valResult = EInvoiceEngine.validateForEN16931(invoice, b2gCustomer, seller);
    assert.strictEqual(valResult.isValid, true);

    const xml = EInvoiceEngine.generateXRechnungXML(invoice, b2gCustomer, seller);
    assert.ok(xml.includes('991-12345678-12'));
    assert.ok(xml.includes('<ram:BuyerReference>991-12345678-12</ram:BuyerReference>'), 'BT-10 muss die Leitweg-ID tragen');
    assert.ok(!xml.includes('DE000000000'), 'Keine Fake-USt-IdNr mehr erlaubt');
    assert.ok(xml.includes('<ram:CalculatedAmount>190.00</ram:CalculatedAmount>'), 'BG-23 Steuerbetrag fehlt');
    assert.ok(xml.includes('<ram:BasisAmount>1000.00</ram:BasisAmount>'), 'BG-23 BasisAmount fehlt');
    const countryCount = (xml.match(/<ram:CountryID>DE<\/ram:CountryID>/g) || []).length;
    assert.ok(countryCount >= 2, `Seller+Buyer CountryID DE erwartet, gefunden: ${countryCount}`);
    assert.ok(/<ram:DueDateDateTime>\s*<udt:DateTimeString format="102">20260913<\/udt:DateTimeString>/s.test(xml), 'DueDate (BT-9) fehlt');
    assert.ok(xml.includes('<ram:DuePayableAmount>1190.00</ram:DuePayableAmount>'));
    assert.ok(xml.includes('urn:xoev-de:kosit:standard:xrechnung_2.3'));
    assert.ok(xml.includes('RE-2026-001'));

    // ZUGFeRD-Profilvarianten: Guideline-URN je Profil
    const zugferdXmlEN = EInvoiceEngine.generateZUGFeRDXML(invoice, b2gCustomer, seller, { profile: 'EN16931' });
    assert.ok(zugferdXmlEN.includes('urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:en16931'));
    assert.ok(!zugferdXmlEN.includes('xoev-de:kosit'));

    const zugferdXmlX = EInvoiceEngine.generateZUGFeRDXML(invoice, b2gCustomer, seller, { profile: 'XRECHNUNG' });
    assert.ok(zugferdXmlX.includes('urn:xoev-de:kosit:standard:xrechnung_2.3'));
});

test('5. GAEB X83 Import & X84 Export Engine', () => {
    const sampleX83XML = `<?xml version="1.0" encoding="UTF-8"?>
<GAEB>
  <GAEBInfo><DP>X83</DP></GAEBInfo>
  <PrjInfo><PrjName>Neubau Grundschule</PrjName></PrjInfo>
  <Item>
    <RNoPart>01.01.0010</RNoPart>
    <Qty>150.0</Qty>
    <QU>m²</QU>
    <TextOutl><p>Betonfundament gießen</p></TextOutl>
    <UP>85.00</UP>
  </Item>
</GAEB>`;

    const parsed = GAEBEngine.parseGAEBXML(sampleX83XML);
    assert.strictEqual(parsed.projectInfo.name, 'Neubau Grundschule');
    assert.strictEqual(parsed.items.length, 1);
    assert.strictEqual(parsed.items[0].oz_code, '01.01.0010');
    assert.strictEqual(parsed.items[0].menge, 150.0);
    assert.strictEqual(parsed.items[0].einheit, 'm²');

    const x84XML = GAEBEngine.generateGAEBX84XML('Neubau Grundschule', parsed.items);
    assert.ok(x84XML.includes('<DP>X84</DP>'));
    assert.ok(x84XML.includes('01.01.0010'));
});

test('6. DATEV EXTF 700 Export Generation', () => {
    const rechnungen = [
        {
            id: 1,
            nr: 'RE-2026-100',
            datum: '2026-08-13',
            kundeId: 5,
            brutto: 2380.00,
            netto: 2000.00,
            status: 'Bezahlt',
            unterliegt_13b: 1,
            sicherheitseinbehalt: 100.00
        }
    ];

    const kunden = [{ id: 5, name: 'Baupartner GmbH', customer_type: 'B2B', ist_bauleistender_13b: 1 }];

    const csv = DATEVExporter.generateEXTFContent(rechnungen, kunden, { skr: 'SKR03' });
    assert.ok(csv.includes('"EXTF";700;21'));
    assert.ok(csv.includes('8337')); // § 13b Revenue Account in SKR03
    assert.ok(csv.includes('19'));   // BU Key 19 for § 13b
    assert.ok(csv.includes('1540')); // Security Retention Interim Account

    // Storno / Gutschrift mit negativem Betrag exportieren:
    // DATEV-Norm: Betrag muss immer positiv sein (Math.abs), Kennzeichen 'S' statt 'H'
    const stornoRechnungen = [
        {
            nr: 'STORNO-2026-001',
            datum: '2026-08-14',
            kundeId: 5,
            brutto: -1190.00,
            netto: -1000.00,
            status: 'Storniert',
            rechnungsart: 'STORNO'
        }
    ];
    const stornoCsv = DATEVExporter.generateEXTFContent(stornoRechnungen, kunden, { skr: 'SKR03' });
    assert.ok(stornoCsv.includes('"1190,00";"S"'), 'Umsatz darf nicht negativ sein und muss Soll-Kennzeichen S tragen');
});

test('7. GoBD Immutability & SHA-256 Hash Chaining', () => {
    const docDraft = { id: 1, nr: 'RE-001', datum: '2026-08-13', netto: 100, steuer: 19, brutto: 119, status: 'DRAFT', isLocked: false };
    const docLocked = { id: 1, nr: 'RE-001', datum: '2026-08-13', netto: 100, steuer: 19, brutto: 119, status: 'POSTED', isLocked: true };

    const checkDraft = GoBDAuditEngine.validateImmutability(docDraft);
    assert.strictEqual(checkDraft.canEdit, true);

    const checkLocked = GoBDAuditEngine.validateImmutability(docLocked);
    assert.strictEqual(checkLocked.canEdit, false);
    assert.ok(checkLocked.reason.includes('GoBD'));

    const hash1 = GoBDAuditEngine.calculateDocumentHash(docLocked, 'GENESIS_HASH');
    assert.strictEqual(typeof hash1, 'string');
    assert.strictEqual(hash1.length, 64); // SHA-256 hex length
});
