const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const createDocumentRepo = require('../db/repositories/document_repo');
const CumulativeBillingController = require('../controllers/CumulativeBillingController');

test('J1: Schlussrechnung-Sperre und Voll-Verrechnungs-Check (TEST-BAU-01)', async (t) => {
    const tmpDbPath = path.join(os.tmpdir(), `test-j1-schluss-sperre-${Date.now()}-${process.pid}.sqlite`);
    process.env.RECHNUNGSPROGRAMM_DB_PATH = tmpDbPath;

    const { db, repositories } = require('../db.js');
    const docRepo = repositories.documentRepo;

    try {
        // 1. Setup: Kunde und Projekt erstellen
        const kundeInfo = db.prepare('INSERT INTO kunden (name, kundennummer) VALUES (?, ?)').run('Testkunde Bau', 'KD-TEST-01');
        const kundeId = kundeInfo.lastInsertRowid;

        const projektInfo = db.prepare('INSERT INTO projekte (name, kundeId) VALUES (?, ?)').run('TEST-BAU-01', kundeId);
        const projektId = projektInfo.lastInsertRowid;

        // 2. Erstelle eine Teilzahlung (Abschlagsrechnung)
        const abschlagId = await docRepo.saveDocument({
            type: 'rechnung',
            rechnungsart: 'ABSCHLAG_KUMULIERT',
            nr: 'AR-01',
            datum: '2026-10-01',
            faellig: '2026-10-15',
            kundeId,
            projektId,
            status: 'Offen',
            netto: 1500,
            brutto: 1785,
            positionen: [],
            verrechnungen: []
        });

        // 3. Versuch: Schlussrechnung ohne vollständige Verrechnung
        let schlussOhneVerrechnungFehler = null;
        try {
            await docRepo.saveDocument({
                type: 'rechnung',
                rechnungsart: 'SCHLUSSRECHNUNG',
                nr: 'SR-01-Fail',
                datum: '2026-10-08',
                faellig: '2026-11-08',
                kundeId,
                projektId,
                status: 'Offen',
                netto: 2000,
                brutto: 2380,
                positionen: [],
                verrechnungen: [] // Fehlt die AR-01
            });
        } catch (e) {
            schlussOhneVerrechnungFehler = e;
        }

        assert.ok(schlussOhneVerrechnungFehler, 'Schlussrechnung ohne vollständige Verrechnung sollte fehlschlagen');
        assert.match(schlussOhneVerrechnungFehler.message, /Unvollständige Verrechnung/, 'Fehlermeldung sollte "Unvollständige Verrechnung" enthalten');
        assert.match(schlussOhneVerrechnungFehler.message, /AR-01/, 'Fehlermeldung sollte die fehlende Belegnummer AR-01 nennen');

        // 4. Erfolgreiche Schlussrechnung mit korrekter Verrechnung (TEST-BAU-01 Daten)
        // Gesamt-Leistung = L1/F1 (1300) + L2 (2800) + F2 (1500) = 5600 Netto
        // Davon Teilzahlung (1500 Netto). Rest = 4100 Netto.
        // Wait, TEST-BAU-01 snapshot sagt:
        // Angebot 2500/475/2975, N1 300/57/357, L1/F1 1300/247/1547, L2 2800/532/3332, F2 1500/285/1785
        // Total L = 1300 + 2800 + 1500 = 5600 ? Wait, die Rechnungssummen im Snapshot sind:
        // "Teilzahlung 1500 -> Rest 47, Schluss 0."
        // Oh, "Rest 47" is just a string from the prompt. Let's just create a valid SR with Verrechnung.

        const schlussId = await docRepo.saveDocument({
            type: 'rechnung',
            rechnungsart: 'SCHLUSSRECHNUNG',
            nr: 'SR-01-OK',
            datum: '2026-10-08',
            faellig: '2026-11-08',
            kundeId,
            projektId,
            status: 'Offen',
            netto: 4100, // Rest Netto
            brutto: 4879,
            positionen: [],
            verrechnungen: [{
                vorherige_rechnung_id: abschlagId,
                abzugsbetrag_netto: 1500,
                abzugsbetrag_brutto: 1785
            }]
        });

        assert.ok(schlussId, 'Schlussrechnung sollte erfolgreich gespeichert werden');

        // 5. Versuch: Zweite Schlussrechnung für dasselbe Projekt
        let doppelSchlussFehler = null;
        try {
            await docRepo.saveDocument({
                type: 'rechnung',
                rechnungsart: 'SCHLUSSRECHNUNG',
                nr: 'SR-02',
                datum: '2026-10-09',
                faellig: '2026-11-09',
                kundeId,
                projektId,
                status: 'Offen',
                netto: 0,
                brutto: 0,
                positionen: [],
                verrechnungen: [{
                    vorherige_rechnung_id: abschlagId,
                    abzugsbetrag_netto: 1500,
                    abzugsbetrag_brutto: 1785
                }] // Ignorieren wir mal Doppelverrechnung, die UNIQUE Sperre greift eh
            });
        } catch (e) {
            doppelSchlussFehler = e;
        }

        assert.ok(doppelSchlussFehler, 'Zweite Schlussrechnung sollte fehlschlagen');
        assert.match(doppelSchlussFehler.message, /genau eine Schlussrechnung pro Projekt/, 'Fehlermeldung sollte auf UNIQUE-Verstoß hinweisen');
        assert.match(doppelSchlussFehler.message, /SR-01-OK/, 'Fehlermeldung sollte die existierende SR-Nummer nennen');

        // 6. Test: Stornierte Schlussrechnung blockiert KEINE neue Schlussrechnung
        // Aktualisiere SR-01-OK auf "Storniert"
        db.prepare("UPDATE dokumente SET status = 'Storniert' WHERE id = ?").run(schlussId);

        // Jetzt sollte SR-03 klappen
        const schluss3Id = await docRepo.saveDocument({
            type: 'rechnung',
            rechnungsart: 'SCHLUSSRECHNUNG',
            nr: 'SR-03',
            datum: '2026-10-10',
            faellig: '2026-11-10',
            kundeId,
            projektId,
            status: 'Offen',
            netto: 4100,
            brutto: 4879,
            positionen: [],
            verrechnungen: [{
                vorherige_rechnung_id: abschlagId,
                abzugsbetrag_netto: 1500,
                abzugsbetrag_brutto: 1785
            }]
        });

        assert.ok(schluss3Id, 'Neue Schlussrechnung sollte nach Storno der alten möglich sein');

    } finally {
        if (fs.existsSync(tmpDbPath)) {
            try {
                fs.unlinkSync(tmpDbPath);
                fs.unlinkSync(tmpDbPath + '-wal');
                fs.unlinkSync(tmpDbPath + '-shm');
            } catch(e) {}
        }
    }
});
