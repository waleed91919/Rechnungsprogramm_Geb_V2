const test = require('node:test');
const assert = require('node:assert/strict');
const { DATEVExporter } = require('../js/datev.js');

test('T-DAT-1: DATEV EXTF 700 - Hauptbuchung mit vollem Brutto (11.900,00 €) und 1540-Abgrenzung (DAT-1)', () => {
    const rechnungen = [
        {
            id: 1,
            nr: 'RE-2026-0001',
            kundeId: 42,
            datum: '2026-08-15',
            netto: 10000.00,
            steuer: 1900.00,
            brutto: 11900.00,
            sicherheitseinbehalt: 500.00,
            zahlbetrag: 11400.00,
            status: 'Gestellt'
        }
    ];
    const kunden = [{ id: 42, name: 'Bauherr Alpha GmbH' }];

    const csv = DATEVExporter.generateEXTFContent(rechnungen, kunden, { skr: 'SKR03' });
    const lines = csv.trim().split('\n');

    assert.ok(lines.length >= 3, 'CSV muss Header Satzart 1, Satzart 2 und mindestens 2 Buchungszeilen enthalten');

    // Buchungszeile 1: Hauptbuchung Erlös
    const b1 = lines[2].split(';');
    // Umsatz (Brutto 11.900,00)
    assert.equal(b1[0], '"11900,00"', 'Hauptbuchung muss Rechnungsbrutto sein, NICHT Zahlbetrag');
    assert.equal(b1[1], '"H"', 'Normalrechnung Erlös im Haben');
    assert.equal(b1[6], '"8400"', 'Erlöskonto SKR03 19%');
    assert.equal(b1[7], '"10042"', 'Debitor 10042');
    assert.equal(b1[9], '"1508"', 'Belegdatum DDMM (1508)');
    assert.equal(b1[10], '"RE-2026-0001"');

    // Buchungszeile 2: Abgrenzung Sicherheitseinbehalt (1540 an Debitor)
    const b2 = lines[3].split(';');
    assert.equal(b2[0], '"500,00"', 'Einbehaltungsbetrag');
    assert.equal(b2[1], '"S"', 'Einbehalt im Soll');
    assert.equal(b2[6], '"1540"', 'Konto Sicherheitseinbehalte SKR03');
    assert.equal(b2[7], '"10042"', 'Gegenkonto Debitor 10042');
});

test('T-DAT-2: DATEV EXTF 700 - 7% MwSt wird auf Erlöskonto 8300 bzw. 4300 verbucht (DAT-2)', () => {
    const rechnungen = [
        {
            id: 2,
            nr: 'RE-2026-0002',
            kundeId: 5,
            datum: '2026-08-20',
            netto: 1000.00,
            steuer: 70.00,
            brutto: 1070.00,
            ustSatz: 7,
            status: 'Freigegeben'
        }
    ];
    const kunden = [{ id: 5, name: 'Hotel Sonnenschein' }];

    // SKR03
    const csv03 = DATEVExporter.generateEXTFContent(rechnungen, kunden, { skr: 'SKR03' });
    const line03 = csv03.trim().split('\n')[2].split(';');
    assert.equal(line03[6], '"8300"', 'SKR03 7% Erlöskonto muss 8300 sein');
    assert.equal(line03[0], '"1070,00"');

    // SKR04
    const csv04 = DATEVExporter.generateEXTFContent(rechnungen, kunden, { skr: 'SKR04' });
    const line04 = csv04.trim().split('\n')[2].split(';');
    assert.equal(line04[6], '"4300"', 'SKR04 7% Erlöskonto muss 4300 sein');
    assert.equal(line04[0], '"1070,00"');
});

test('T-DAT-3: DATEV EXTF 700 - Exakter 31-Felder Header ohne Timestamp in Mandantennummer (DAT-3)', () => {
    const header = DATEVExporter.buildExtf700Header({
        beraternummer: 12345,
        mandantennummer: 67890,
        sachkontenlaenge: 4,
        skr: 'SKR03'
    }, '20260801', '20260831');

    const fields = header.trim().split(';');
    assert.equal(fields.length, 31, 'Header (Satzart 1) muss exakt 31 Felder besitzen');

    assert.equal(fields[0], '"EXTF"', 'Feld 1: EXTF');
    assert.equal(fields[1], '700', 'Feld 2: Format 700');
    assert.equal(fields[2], '21', 'Feld 3: Buchungsstapel');
    assert.equal(fields[3], '"Buchungsstapel"', 'Feld 4: Buchungsstapel');
    assert.equal(fields[4], '13', 'Feld 5: Formatversion 13');
    assert.match(fields[5], /^\d{17}$/, 'Feld 6: Erzeugt am Timestamp mit Millisekunden (17-stellig)');
    assert.equal(fields[7], '"RE"', 'Feld 8: Herkunft RE');
    assert.equal(fields[10], '12345', 'Feld 11: Beraternummer');
    assert.equal(fields[11], '67890', 'Feld 12: Mandantennummer darf KEIN Timestamp sein');
    assert.equal(fields[13], '4', 'Feld 14: Sachkontenlänge');
    assert.equal(fields[14], '20260801', 'Feld 15: Datum von');
    assert.equal(fields[15], '20260831', 'Feld 16: Datum bis');
    assert.equal(fields[21], '"EUR"', 'Feld 22: WKZ');
    assert.equal(fields[26], '"03"', 'Feld 27: SKR03 Kennung');
});

test('T-DAT-4: DATEV EXTF 700 - § 13b Bauleistung mit BU-Schlüssel 19 (SKR03) / 68 (SKR04)', () => {
    const rechnungen = [
        {
            id: 3,
            nr: 'RE-2026-0003',
            kundeId: 10,
            datum: '2026-08-25',
            netto: 5000.00,
            steuer: 0.00,
            brutto: 5000.00,
            unterliegt_13b: true,
            status: 'Gestellt'
        }
    ];
    const kunden = [{ id: 10, name: 'Generalunternehmer Bau AG' }];

    const csv03 = DATEVExporter.generateEXTFContent(rechnungen, kunden, { skr: 'SKR03' });
    const line03 = csv03.trim().split('\n')[2].split(';');
    assert.equal(line03[6], '"8337"', 'SKR03 § 13b Erlöskonto');
    assert.equal(line03[8], '"19"', 'SKR03 § 13b BU-Schlüssel 19');

    const csv04 = DATEVExporter.generateEXTFContent(rechnungen, kunden, { skr: 'SKR04' });
    const line04 = csv04.trim().split('\n')[2].split(';');
    assert.equal(line04[6], '"4337"', 'SKR04 § 13b Erlöskonto');
    assert.equal(line04[8], '"68"', 'SKR04 § 13b BU-Schlüssel 68');
});

test('T-DAT-5: DATEV EXTF 700 - Storno kehrt Soll/Haben um', () => {
    const rechnungen = [
        {
            id: 4,
            nr: 'STORNO - RE-2026-0001',
            kundeId: 42,
            datum: '2026-08-30',
            netto: -10000.00,
            steuer: -1900.00,
            brutto: -11900.00,
            status: 'Storniert',
            rechnungsart: 'STORNO'
        }
    ];
    const kunden = [{ id: 42, name: 'Bauherr Alpha GmbH' }];

    const csv = DATEVExporter.generateEXTFContent(rechnungen, kunden, { skr: 'SKR03' });
    const line = csv.trim().split('\n')[2].split(';');
    assert.equal(line[1], '"S"', 'Storno Hauptbuchung im Soll');
    assert.equal(line[0], '"11900,00"');
    assert.equal(line[6], '"8400"');
});

test('T-DAT-6: CSV Sanitization verhindert Formel-Injection', () => {
    assert.equal(DATEVExporter.sanitizeCsvField('=SUM(A1:A10)'), "'=SUM(A1:A10)");
    assert.equal(DATEVExporter.sanitizeCsvField('-cmd|calc!A1'), "'-cmd|calc!A1");
    assert.equal(DATEVExporter.sanitizeCsvField('Normaler Text'), 'Normaler Text');
});

test('T-DAT-7: DATEV EXTF 700 - Keine pauschale 13b-Zuordnung nur aufgrund von kunde.ist_bauleistender_13b (K1-11)', () => {
    const rechnungen = [
        {
            id: 5,
            nr: 'RE-2026-0005',
            kundeId: 20,
            datum: '2026-08-28',
            netto: 2000.00,
            steuer: 380.00,
            brutto: 2380.00,
            unterliegt_13b: false,
            status: 'Gestellt'
        }
    ];
    // Kunde ist Bauleistender, aber Beleg unterliegt NICHT 13b
    const kunden = [{ id: 20, name: 'Bauunternehmen Müller GmbH', ist_bauleistender_13b: true }];

    const csv03 = DATEVExporter.generateEXTFContent(rechnungen, kunden, { skr: 'SKR03' });
    const line03 = csv03.trim().split('\n')[2].split(';');
    assert.equal(line03[6], '"8400"', 'Muss Erlöskonto 8400 sein, NICHT 8337');
    assert.equal(line03[8], '""', 'BU-Schlüssel darf nicht 19 sein');
});

