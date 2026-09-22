/**
 * erechnung_belegfixierung.test.js (P0.4):
 * - Export nur aus gespeichertem + festgeschriebenem Beleg
 * - Entwurf ohne belegId / entityId 0 → blockiert mit Feldbezug
 * - XRechnung-3.0-Leitweg (KoSIT-Bundle 3.0.2)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const EInvoiceEngine = require('../js/einvoice');

test('P0.4 XRechnung-Profil nutzt 3.0-Leitweg', () => {
    const info = EInvoiceEngine.getZUGFeRDProfileInfo('XRECHNUNG');
    assert.equal(info.guidelineId, EInvoiceEngine.GUIDELINE_XRECHNUNG_30);
    assert.equal(info.guidelineId, 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0');
    assert.ok(info.guidelineId.includes('xeinkauf.de:kosit:xrechnung_3.0'));
});

test('P0.4 assertExportfaehigerBeleg blockiert Entwurf ohne Beleg-ID (Feldbezug)', () => {
    assert.throws(() => EInvoiceEngine.assertExportfaehigerBeleg(null), /Beleg/);
    assert.throws(() => EInvoiceEngine.assertExportfaehigerBeleg({ nr: 'RE-1' }), /Beleg-ID/);
    assert.throws(() => EInvoiceEngine.assertExportfaehigerBeleg({ id: 0, nr: 'RE-1' }), /Beleg-ID/);
});

test('P0.4 assertExportfaehigerBeleg blockiert ungesperrten Entwurf (Status-Feldbezug)', () => {
    assert.throws(
        () => EInvoiceEngine.assertExportfaehigerBeleg({ id: 5, nr: 'RE-1', status: 'Entwurf' }),
        /Status/
    );
});

test('P0.4 festgeschriebener Beleg passiert das Gate', () => {
    assert.equal(
        EInvoiceEngine.assertExportfaehigerBeleg({ id: 5, nr: 'RE-1', status: 'Festgeschrieben', isLocked: true }),
        true
    );
});

test('P0.4 generiertes XRechnung-XML trägt 3.0-URN (xeinkauf.de/kosit)', () => {
    const invoice = {
        id: 42, isLocked: true, status: 'Festgeschrieben',
        nr: 'RE-2026-001', datum: '2026-09-10', faellig: '2026-09-24',
        positionen: [{ menge: 1, preis: 100, mwst: 19, name: 'Leistung' }],
        netto: 100, steuer: 19, brutto: 119
    };
    const customer = { name: 'Kunde', ort: 'Berlin', leitweg_id: '991-12345678-12', customer_type: 'B2B', vat_id: 'DE123' };
    const seller = { firmenname: 'Firma', ort: 'Berlin', ustId: 'DE999', iban: 'DE00' };
    const xml = EInvoiceEngine.generateXRechnungXML(invoice, customer, seller);
    assert.ok(xml.includes('urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0'));
    assert.ok(!xml.includes('xoev-de:kosit:standard:xrechnung'));
    assert.ok(!xml.includes('xrechnung_2.3'));
});

test('P0.4 generateXRechnungXML blockiert ungespeicherte Entwürfe ohne allowDraft', () => {
    const draft = {
        nr: 'RE-ENTWURF', datum: '2026-09-10',
        positionen: [{ menge: 1, preis: 100, mwst: 19, name: 'Leistung' }]
    };
    const customer = { name: 'Kunde', ort: 'Berlin', customer_type: 'B2B' };
    const seller = { firmenname: 'Firma', ort: 'Berlin', ustId: 'DE999', iban: 'DE00' };
    assert.throws(() => EInvoiceEngine.generateXRechnungXML(draft, customer, seller), /Beleg-ID/);

    // Mit allowDraft: true für Vorschau erlaubt
    const previewXml = EInvoiceEngine.generateXRechnungXML(draft, customer, seller, { allowDraft: true });
    assert.ok(previewXml.includes('urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0'));
});
