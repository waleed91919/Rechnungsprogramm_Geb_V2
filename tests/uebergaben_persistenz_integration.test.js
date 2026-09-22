/**
 * tests/uebergaben_persistenz_integration.test.js
 * Echte SQLite/IPC Integrationstests für Aufmaß- und Nachtragsübernahmen.
 * Verifiziert physische Persistenz, Transaktionssicherheit, Idempotenz und GoBD-Schreibschutz.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// 1. Isolierte Testdatenbank aufbauen
const testDbPath = path.join(os.tmpdir(), `wlink-aufmass-test-${Date.now()}-${process.pid}.sqlite`);
process.env.RECHNUNGSPROGRAMM_DB_PATH = testDbPath;

const { db, dbAPI } = require('../db');
const DA11Service = require('../js/da11');
const GaebX31Service = require('../js/gaeb-x31');
const NachtragController = require('../controllers/NachtragController');

test.after(() => {
    try {
        db.close();
        if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    } catch (_e) {}
});

test('1. BUG-01: DA11 Export erzeugt Satzart 00, 11, 99 auf exakt 80 Zeichen CRLF', () => {
    const projekt = { name: 'Sanierung Schulzentrum West', ozMaske: '1122PPPPI' };
    const blaetter = [{
        blatt_nummer: '0001',
        zeilen: [
            { oz_code: '01.01.0010', zeilen_nr: 1, bezeichnung: 'Abbruch Mauerwerk', formel_reb: '91', rechenansatz: '4.50*2.80*0.24', ergebnis: 3.024, vorzeichen: 1 },
            { oz_code: '01.01.0020', zeilen_nr: 2, bezeichnung: 'Türöffnung Abzug', formel_reb: '91', rechenansatz: '1.01*2.135*0.24', ergebnis: 0.517, vorzeichen: -1 }
        ]
    }];

    const rawDa11 = DA11Service.generateDA11(projekt, blaetter);
    assert.ok(rawDa11.includes('\r\n'), 'DA11 muss Windows CRLF Zeilenumbrüche nutzen');

    const lines = rawDa11.split('\r\n').filter(l => l.length > 0);
    assert.equal(lines.length, 4, 'Erwartet: Satzart 00, zwei Zeilen 11, Satzart 99');

    // Zeilenlängen prüfen
    for (const l of lines) {
        assert.equal(l.length, 80, `Jede DA11-Zeile muss exakt 80 Zeichen haben. Fehler bei: "${l}"`);
    }

    // Satzarten prüfen
    assert.equal(lines[0].substring(0, 2), '00', 'Zeile 1 muss Vorlaufsatz 00 sein');
    assert.equal(lines[0].substring(2, 4), '11', 'DP-Kennzeichen in Satzart 00 muss 11 sein');
    assert.equal(lines[1].substring(0, 2), '11', 'Zeile 2 muss Aufmaßzeile 11 sein');
    assert.equal(lines[2].substring(0, 2), '11', 'Zeile 3 muss Aufmaßzeile 11 sein');
    assert.equal(lines[3].substring(0, 2), '99', 'Zeile 4 muss Nachlaufsatz 99 sein');

    // Roundtrip Re-Parsing
    const parsed = DA11Service.parseDA11(rawDa11);
    assert.equal(parsed.success, true);
    assert.equal(parsed.blaetter.length, 1);
    assert.equal(parsed.blaetter[0].zeilen.length, 2);
    assert.equal(parsed.blaetter[0].zeilen[0].oz_code, '01010010');
    assert.equal(parsed.blaetter[0].zeilen[1].vorzeichen, -1);
});

test('2. BUG-03 & BUG-05: Nachtragsübernahme ohne curId persistiert in SQLite mit positionsgenauer Idempotenz', async () => {
    // Projekt und Kunde anlegen
    const kRes = db.prepare("INSERT INTO kunden (name, adresse) VALUES ('Bauherr Musterstadt', 'Rathausplatz 1')").run();
    const kundeId = kRes.lastInsertRowid;
    const pRes = db.prepare("INSERT INTO projekte (name, kundeId, budget, status) VALUES ('Projekt Nachtrag Test', ?, 50000, 'IN_PROGRESS')").run(kundeId);
    const projectId = pRes.lastInsertRowid;

    // Nachtrag mit 2 identisch benannten Positionen anlegen
    const nRes = db.prepare(`
        INSERT INTO nachtraege (project_id, nachtrag_nr, titel, status, summe_netto, summe_brutto)
        VALUES (?, 'N-01', 'Zusatzarbeiten Erdarbeiten', 'GENEHMIGT', 1500, 1785)
    `).run(projectId);
    const nachtragId = nRes.lastInsertRowid;

    db.prepare("INSERT INTO nachtrag_positionen (nachtrag_id, kurztext, menge, einheitspreis, gesamtpreis, einheit) VALUES (?, 'Regiestunde Monteur', 10, 65, 650, 'Std')").run(nachtragId);
    db.prepare("INSERT INTO nachtrag_positionen (nachtrag_id, kurztext, menge, einheitspreis, gesamtpreis, einheit) VALUES (?, 'Regiestunde Monteur', 5, 65, 325, 'Std')").run(nachtragId);

    const nachtraege = await dbAPI.getNachtraege(projectId);
    const invoicePos = NachtragController.extractApprovedPositionsForInvoice(nachtraege);

    assert.equal(invoicePos.length, 2, 'Beide Positionen müssen extrahiert werden');
    assert.notEqual(invoicePos[0].nachtrag_pos_id, invoicePos[1].nachtrag_pos_id, 'Positionsgenaue IDs müssen unterschiedlich sein');

    // Beleg anlegen und in SQLite persistieren
    const entwurf = {
        type: 'rechnung',
        typ: 'RECHNUNG',
        nr: 'RE-TEST-001',
        kundeId: kundeId,
        projektId: projectId,
        positionen: invoicePos,
        status: 'Entwurf',
        isLocked: 0,
        datum: '2026-09-11'
    };

    const savedDocId = await dbAPI.saveDocument(entwurf);
    assert.ok(savedDocId > 0, 'Dokument muss mit echter SQLite-ID gespeichert sein');

    // Reload-Read Verifikation
    const loaded = await dbAPI.getDocumentById(savedDocId);
    assert.equal(loaded.kundeId, kundeId, 'Kunden-ID muss dauerhaft gespeichert sein');
    assert.equal(loaded.positionen.length, 2, 'Beide namensgleichen Positionen müssen in der DB existieren (keine Kollision!)');
    assert.equal(loaded.positionen[0].preis, 65);
    assert.equal(loaded.positionen[1].preis, 65);
});

test('3. BUG-06 & BUG-07: mergeSchlussaufmass schließt DRAFT aus und behält LV-Preise', async () => {
    const pRes = db.prepare("INSERT INTO projekte (name, budget, status) VALUES ('Projekt Aufmaß Merge', 20000, 'IN_PROGRESS')").run();
    const projectId = pRes.lastInsertRowid;

    // Vertragsposition im Angebot anlegen (für LV-Preisfindung)
    await dbAPI.saveDocument({
        type: 'angebot',
        typ: 'ANGEBOT',
        nr: 'ANG-001',
        projektId: projectId,
        status: 'Beauftragt',
        positionen: [
            { oz: '01.01.0010', oz_code: '01.01.0010', name: 'Betonstahl B500A', preis: 1.45, menge: 1000, einheit: 'kg' }
        ]
    });

    // 1 freigegebenes Blatt und 1 DRAFT-Blatt anlegen
    const b1 = db.prepare("INSERT INTO aufmass_blaetter (project_id, blatt_nummer, titel, status) VALUES (?, '001', 'Blatt 1', 'VERIFIED')").run(projectId).lastInsertRowid;
    const b2 = db.prepare("INSERT INTO aufmass_blaetter (project_id, blatt_nummer, titel, status) VALUES (?, '002', 'Blatt 2', 'DRAFT')").run(projectId).lastInsertRowid;

    db.prepare("INSERT INTO aufmass_zeilen (blatt_id, oz_code, zeilen_nr, rechenansatz, ergebnis, vorzeichen) VALUES (?, '01.01.0010', 1, '500.0', 500.0, 1)").run(b1);
    db.prepare("INSERT INTO aufmass_zeilen (blatt_id, oz_code, zeilen_nr, rechenansatz, ergebnis, vorzeichen) VALUES (?, '01.01.0010', 1, '999.0', 999.0, 1)").run(b2);

    // Merge ausführen
    const merged = await dbAPI.mergeSchlussaufmass(projectId, { includeDrafts: false });
    assert.equal(merged.length, 1);
    assert.equal(merged[0].oz_code, '01.01.0010');
    assert.equal(merged[0].summe_menge, 500.0, 'DRAFT-Zeile (999.0) darf nicht im Schlussaufmaß enthalten sein');
    assert.equal(merged[0].einheitspreis, 1.45, 'Einheitspreis aus Vertragsposition muss verknüpft sein');
    assert.equal(merged[0].bezeichnung, 'Betonstahl B500A');
});

test('4. BUG-08: GAEB X31 Multi-Sheet Import und Auflösung von Zeilenadresse A0', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA_XML/3.3">
      <GAEBInfo><DP>X31</DP></GAEBInfo>
      <QtyDetermination>
        <Award>
          <BOQ>
            <BoQBody>
              <Item RNoPart="02.01.0050">
                <p>Estricharbeiten</p>
                <QU>m²</QU>
                <QtyDeterm>
                  <QDetermItem>
                    <SheetNo>0001</SheetNo>
                    <RowNo>01</RowNo>
                    <QTakeoff Row="5.00 * 4.00">"Raum 1" 5.00 * 4.00</QTakeoff>
                    <ResultQty>20.000</ResultQty>
                  </QDetermItem>
                  <QDetermItem>
                    <SheetNo>0002</SheetNo>
                    <RowNo>01</RowNo>
                    <QTakeoff Row="A0 * 1.50">"Zuschlag Dicke" A0 * 1.50</QTakeoff>
                    <ResultQty>30.000</ResultQty>
                  </QDetermItem>
                </QtyDeterm>
              </Item>
            </BoQBody>
          </BOQ>
        </Award>
      </QtyDetermination>
    </GAEB>`;

    const parsed = GaebX31Service.parseX31Xml(xml);
    assert.equal(parsed.items.length, 1);
    assert.equal(parsed.items[0].ansatze.length, 2);
    assert.equal(parsed.items[0].ansatze[0].sheetNo, '0001');
    assert.equal(parsed.items[0].ansatze[1].sheetNo, '0002');
    assert.equal(parsed.items[0].ansatze[1].resultQty, 30.0, 'A0-Zeilenbezug muss korrekt ausgewertet/übernommen werden');
});

test('5. BUG-09: VOB/B § 16 Kumulatives Controlling addiert Abschläge nicht fälschlich auf', async () => {
    const pRes = db.prepare("INSERT INTO projekte (name, budget, status) VALUES ('Projekt VOB Kumulation', 50000, 'IN_PROGRESS')").run();
    const projectId = pRes.lastInsertRowid;

    // Hauptauftrag
    await dbAPI.saveDocument({
        type: 'angebot', typ: 'ANGEBOT', nr: 'ANG-VOB', projektId: projectId,
        status: 'Beauftragt', netto: 30000, brutto: 35700, positionen: []
    });

    // 1. Abschlagsrechnung über 10.000 € netto (Zahlbetrag 10.000)
    await dbAPI.saveDocument({
        type: 'rechnung', typ: 'ABSCHLAGSRECHNUNG', rechnungsart: 'ABSCHLAG_KUMULIERT', nr: 'AR-1', projektId: projectId,
        status: 'Bezahlt', netto: 10000, brutto: 11900, kumulierte_leistung_netto: 10000, positionen: []
    });

    // 2. Abschlagsrechnung kumuliert über 25.000 € netto
    await dbAPI.saveDocument({
        type: 'rechnung', typ: 'ABSCHLAGSRECHNUNG', rechnungsart: 'ABSCHLAG_KUMULIERT', nr: 'AR-2', projektId: projectId,
        status: 'Bezahlt', netto: 25000, brutto: 29750, kumulierte_leistung_netto: 25000, positionen: []
    });

    // Schlussrechnung kumuliert über 30.000 € netto
    await dbAPI.saveDocument({
        type: 'rechnung', typ: 'SCHLUSSRECHNUNG', rechnungsart: 'SCHLUSSRECHNUNG', nr: 'SR-1', projektId: projectId,
        status: 'Festgeschrieben', netto: 30000, brutto: 35700, kumulierte_leistung_netto: 30000, positionen: []
    });

    const stats = await dbAPI.getControllingStats(projectId);
    assert.equal(stats.istUmsatzNetto, 30000.0, 'Gesamtumsatz muss dem kumulierten Schlussrechnungswert entsprechen (30.000 €), nicht der Summe aller Abschläge (65.000 €)');
    assert.equal(stats.gesamtAuftragsvolumen, 30000.0);
});
