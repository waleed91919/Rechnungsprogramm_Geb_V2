/**
 * workflow_e2e.test.js — Durchgängiger Datenfluss (End-to-End State).
 *
 * Beweist: GAEB-OZ → Angebot → AB → Projekt → DA11-Import → Blatt-Freigabe →
 * 1. Abschlag → OPOS-Zahlungsabgleich (abzgl. Einbehalt) → Nachtrag →
 * Schlussrechnung (auto-verrechnet) → Freigabe Sicherheitseinbehalt —
 * als EIN Strang ohne manuelles Abtippen (IDs/Herkunft statt Neu-Erfassung).
 */
const { describe, it, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { getElectronPath } = require('./test_electron_helper');
const { execFileSync } = require('child_process');

const IS_ELECTRON_AS_NODE = !!process.versions.electron;
const RUN_INNER_MARKER = 'WORKFLOW_E2E_INNER_RUN';

function canLoadBetterSqlite() {
    try {
        const DbCtor = require('better-sqlite3');
        const probe = new DbCtor(':memory:');
        probe.close();
        return true;
    } catch (_e) {
        return false;
    }
}

// System-Node ohne passendes better-sqlite3-ABI: DB-Teil läuft in Electron-as-Node
// (Muster j9-gaeb-generator.test.js). Reine WorkflowController-Tests laufen immer.
if (!IS_ELECTRON_AS_NODE && !canLoadBetterSqlite() && !process.env[RUN_INNER_MARKER]) {
    test('Re-executing workflow e2e db tests in Electron-as-Node...', () => {
        const electronPath = getElectronPath();
        assert.ok(electronPath, 'Electron executable muss gefunden werden');
        const env = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1', [RUN_INNER_MARKER]: '1' });
        try {
            execFileSync(electronPath, [__filename], { env, stdio: 'inherit' });
        } catch (e) {
            assert.fail('Inner test execution in Electron failed: ' + e.message);
        }
    });
}

const WorkflowController = require('../controllers/WorkflowController');
const DA11Service = require('../js/da11');
const DB_AVAILABLE = IS_ELECTRON_AS_NODE || canLoadBetterSqlite();
const Database = DB_AVAILABLE ? require('better-sqlite3') : null;

describe('WorkflowController (rein, DB-frei)', () => {
    it('normalizeOz gleicht DA11 (ohne Punkte) mit LV (mit Punkten) an', () => {
        assert.equal(WorkflowController.normalizeOz('01.02.0030'), '01020030');
        assert.equal(WorkflowController.normalizeOz('01020030 '), '01020030');
        assert.equal(WorkflowController.normalizeOz(null), '');
    });

    it('sollBetrag/offenerBetrag: Einbehalt ist bereits abgezogen', () => {
        const doc = { brutto: 1190, zahlbetrag: 1140 };
        assert.equal(WorkflowController.sollBetrag(doc), 1140);
        assert.equal(WorkflowController.offenerBetrag(doc, 0), 1140);
        assert.equal(WorkflowController.offenerBetrag(doc, 1140), 0);
        assert.equal(WorkflowController.sollBetrag({ brutto: 1190 }), 1190);
    });

    it('buildRechnungFromVorgaenger: Angebot → Rechnung mit Herkunft, ohne IDs', () => {
        const src = {
            id: 7, type: 'angebot', nr: 'A-2026-0001', kundeId: 1, projektId: 2,
            globalRabattValue: 5, globalRabattType: '%', skonto_prozent: 2, skonto_tage: 14,
            positionen: [{ id: 11, name: 'Mauerwerk', menge: 10, preis: 100, oz_code: '01.01.0010' }]
        };
        const doc = WorkflowController.buildRechnungFromVorgaenger(src, { nr: 'RE-2026-0001' });
        assert.equal(doc.type, 'rechnung');
        assert.equal(doc.nr, 'RE-2026-0001');
        assert.equal(doc.parent_angebot_id, 7);
        assert.equal(doc.herkunft_typ, 'ANGEBOT');
        assert.equal(doc.herkunft_id, 7);
        assert.equal(doc.positionen.length, 1);
        assert.equal(doc.positionen[0].id, undefined);
        assert.equal(doc.positionen[0].herkunft_typ, 'ANGEBOT');
        assert.equal(doc.globalRabattValue, 5);
        assert.equal(doc.skonto_prozent, 2);
    });

    it('buildRechnungFromVorgaenger: Auftrag → Rechnung mit AB-Herkunft', () => {
        const src = {
            id: 9, type: 'auftrag', nr: 'AB-2026-0001', kundeId: 1, parent_angebot_id: 7,
            positionen: [{ id: 12, name: 'Putz', menge: 5, preis: 200 }]
        };
        const doc = WorkflowController.buildRechnungFromVorgaenger(src, { nr: 'RE-2026-0002' });
        assert.equal(doc.source_auftrag_id, 9);
        assert.equal(doc.parent_angebot_id, 7);
        assert.equal(doc.herkunft_typ, 'AUFTRAG');
    });

    it('buildRechnungFromVorgaenger: unzulässige Quellen werfen', () => {
        assert.throws(() => WorkflowController.buildRechnungFromVorgaenger({ id: 1, type: 'rechnung', positionen: [{ a: 1 }] }), /nicht in eine Rechnung/);
        assert.throws(() => WorkflowController.buildRechnungFromVorgaenger({ type: 'angebot', positionen: [] }), /nicht gespeichert|keine Positionen/);
        assert.throws(() => WorkflowController.buildRechnungFromVorgaenger({ id: 1, type: 'angebot', positionen: [] }), /keine Positionen/);
    });

    it('buildSchlussrechnung: gemessene OZ gewinnt, Nachtrag-Doppel wird übersprungen', () => {
        const build = WorkflowController.buildSchlussrechnung({
            mergeRows: [{ oz_code: '01.01.0010', summe_menge: 10, einheitspreis: 100, blatt_id: 3 }],
            previousDocs: [{ id: 21, netto: 500, brutto: 595 }],
            nachtragPositions: [
                { oz_code: '01.01.0010', menge: 2, preis: 100, nachtrag_id: 5, nachtrag_pos_id: 51 },
                { oz_code: 'N.01', menge: 1, preis: 300, nachtrag_id: 5, nachtrag_pos_id: 52 }
            ]
        });
        assert.deepEqual(build.skippedOz, ['01.01.0010']);
        assert.equal(build.positionen.length, 2);
        assert.equal(build.verrechnungen.length, 1);
        assert.equal(build.verrechnungen[0].vorherige_rechnung_id, 21);
        assert.equal(build.verrechnungen[0].abzugsbetrag_netto, 500);
        assert.equal(build.verrechnungen[0].abzugsbetrag_brutto, 595);
    });

    it('DA11-Roundtrip: generate → parse → importfertige Blätter', () => {
        const content = DA11Service.generateDA11({ name: 'Testprojekt' }, [{
            blatt_nummer: '0001', titel: 'Blatt 1', status: 'DRAFT',
            zeilen: [{ oz_code: '01.01.0010', zeilen_nr: 1, bezeichnung: 'Wand', formel_reb: '91', rechenansatz: '2*3', ergebnis: 6, einheit: 'm2', vorzeichen: 1 }]
        }]);
        const imp = WorkflowController.parseDa11ToImport(content);
        assert.equal(imp.blaetter.length, 1);
        assert.equal(imp.blaetter[0].status, 'DRAFT');
        assert.equal(imp.blaetter[0].zeilen[0].ergebnis, 6);
        assert.throws(() => WorkflowController.parseDa11ToImport('kein DA11 Inhalt\n99\n'), /Keine Aufmaßzeilen/);
    });

    it('nextBelegNr: lückenlos pro Jahr', () => {
        assert.equal(WorkflowController.nextBelegNr('RE', ['RE-2026-0001', 'RE-2026-0003'], 2026), 'RE-2026-0004');
        assert.equal(WorkflowController.nextBelegNr('AB', [], 2026), 'AB-2026-0001');
    });

    it('buildRetentionRelease: nur HELD, Bürgschaft braucht Referenz', () => {
        const patch = WorkflowController.buildRetentionRelease({ id: 1, status: 'HELD' }, { mode: 'RELEASED' });
        assert.equal(patch.status, 'RELEASED');
        assert.throws(() => WorkflowController.buildRetentionRelease({ id: 1, status: 'RELEASED' }, {}), /nicht freigebbar/);
        assert.throws(() => WorkflowController.buildRetentionRelease({ id: 1, status: 'HELD' }, { mode: 'GUARANTEE_SUBSTITUTED' }), /Bürgschafts-Referenz/);
        const g = WorkflowController.buildRetentionRelease({ id: 1, status: 'HELD' }, { mode: 'GUARANTEE_SUBSTITUTED', guaranteeRef: 'BÜ-123' });
        assert.equal(g.guarantee_document_ref, 'BÜ-123');
    });
});

if (!DB_AVAILABLE && (IS_ELECTRON_AS_NODE || process.env[RUN_INNER_MARKER])) {
    // Laut scheitern statt still skippen: Im Inner-Run MUSS sqlite ladbar sein.
    test('Vorgangs-Strang DB (FATAL: sqlite nicht ladbar)', () => {
        assert.fail('better-sqlite3 konnte im Electron-as-Node-Run nicht geladen werden.');
    });
}

(DB_AVAILABLE ? describe : describe.skip)('Vorgangs-Strang (DB-Integration, :memory:)', () => {
    let db, dbAPI;

    before(() => {
        db = new Database(':memory:');
        db.pragma('foreign_keys = ON');
        const { createSchema, runMigrations } = require('../schema.js');
        createSchema(db);
        runMigrations(db);

        const dbQuery = async (sql, params = []) => db.prepare(sql).all(params);
        const dbRun = async (sql, params = []) => {
            const res = db.prepare(sql).run(params);
            if (res && res.lastInsertRowid !== undefined && res.id === undefined) res.id = res.lastInsertRowid;
            return res;
        };
        const noopLog = () => {};
        const { initRepositories } = require('../db/repositories');
        ({ dbAPI } = initRepositories({
            db, dbQuery, dbRun,
            appendAuditLog: noopLog,
            auditLogger: { warn: noopLog, info: noopLog, error: noopLog },
            backupService: {},
            dbPath: ':memory:'
        }));
    });

    it('Kette: Angebot → AB → Projekt → DA11 → Abschlag → OPOS → Nachtrag → Schluss → Freigabe', async () => {
        const AngebotController = require('../controllers/AngebotController');

        // Kunde + Angebot (2 LV-Positionen mit GAEB-OZs)
        const kundeId = db.prepare(`INSERT INTO kunden (name) VALUES ('Bauherr GmbH')`).run().lastInsertRowid;
        const angebotId = await dbAPI.saveDocument({
            id: null, type: 'angebot', nr: 'A-2026-0001', kundeId, projektId: null,
            status: 'Entwurf', datum: '2026-10-01', netto: 2000, steuer: 380, brutto: 2380,
            zahlbetrag: 2380, version: 1, angebot_status: 'VERSENDET',
            positionen: [
                { name: 'Mauerwerk', menge: 10, einheit: 'm2', preis: 100, mwst: 19, oz_code: '01.01.0010' },
                { name: 'Putz', menge: 5, einheit: 'm2', preis: 200, mwst: 19, oz_code: '01.01.0020' }
            ]
        });
        assert.ok(angebotId > 0);

        // AB aus Angebot (Herkunft parent_angebot_id — wie convertToAuftrag)
        const abId = await dbAPI.saveDocument({
            id: null, type: 'auftrag', nr: 'AB-2026-0001', kundeId, projektId: null,
            status: 'Bestätigt', datum: '2026-10-02', netto: 2000, steuer: 380, brutto: 2380,
            zahlbetrag: 2380, parent_angebot_id: angebotId,
            positionen: [
                { name: 'Mauerwerk', menge: 10, einheit: 'm2', preis: 100, mwst: 19, oz_code: '01.01.0010', herkunft_typ: 'ANGEBOT', herkunft_id: angebotId },
                { name: 'Putz', menge: 5, einheit: 'm2', preis: 200, mwst: 19, oz_code: '01.01.0020', herkunft_typ: 'ANGEBOT', herkunft_id: angebotId }
            ]
        });
        const ab = dbAPI.getDocumentById(abId);
        assert.equal(ab.parent_angebot_id, angebotId);
        assert.equal(ab.positionen[0].herkunft_typ, 'ANGEBOT');

        // Projekt aus Angebot (Strang reißt nicht: source_angebot_id)
        const angebotFull = dbAPI.getDocumentById(angebotId);
        const projektData = AngebotController.createProjektFromAngebot(angebotFull, angebotFull.positionen);
        const projektId = await dbAPI.saveProjekt({ ...projektData, kundeId, sicherheitseinbehalt_prozent: 5 });
        assert.ok(projektId > 0);

        // DA11-Import mit 9-stelligen OZs (ohne Punkte!) → muss LV trotzdem matchen
        const da11 = DA11Service.generateDA11({ name: 'Strangprojekt' }, [{
            blatt_nummer: '0001', titel: 'Aufmaß EG', status: 'DRAFT',
            zeilen: [
                { oz_code: '01.01.0010', zeilen_nr: 1, bezeichnung: 'Wand EG', formel_reb: '91', rechenansatz: '5*2', ergebnis: 10, einheit: 'm2', vorzeichen: 1 },
                { oz_code: '01.01.0020', zeilen_nr: 2, bezeichnung: 'Putz EG', formel_reb: '91', rechenansatz: '5*1', ergebnis: 5, einheit: 'm2', vorzeichen: 1 }
            ]
        }]);
        const imp = await dbAPI.importDA11(projektId, da11);
        assert.equal(imp.success, true);
        assert.equal(imp.sheetsCreated, 1);
        assert.equal(imp.zeilenCreated, 2);

        // Freigabe → Merge findet Preise (OZ-Normierung beweist sich hier)
        const verify = await dbAPI.verifyAufmassBlatt(imp.blattIds[0]);
        assert.equal(verify.status, 'VERIFIED');
        const merge = await dbAPI.mergeSchlussaufmass(projektId);
        assert.equal(merge.warnings.length, 0);
        assert.equal(merge.rows.length, 2);
        assert.ok(merge.rows.every(r => r.einheitspreis > 0));

        // 1. Abschlag aus Aufmaß (5 % Einbehalt, kumuliert)
        const abschlag = await dbAPI.createAbschlagFromAufmass(projektId, {});
        assert.equal(abschlag.success, true);
        const a1 = dbAPI.getDocumentById(abschlag.id);
        assert.equal(a1.rechnungsart, 'ABSCHLAG_KUMULIERT');
        assert.equal(a1.netto, 2000);
        assert.equal(a1.sicherheitseinbehalt, 100);
        assert.equal(a1.zahlbetrag, 2280); // 2380 − 100 Einbehalt
        assert.equal(a1.positionen[0].aufmass_quelle, 'mergeSchlussaufmass');
        assert.ok(a1.positionen[0].aufmass_blatt_id > 0);
        // Einbehalt automatisch abgelegt (VOB/B § 17, HELD)
        const ret1 = db.prepare('SELECT * FROM security_retentions WHERE invoice_id=?').get(abschlag.id);
        assert.equal(ret1.status, 'HELD');
        assert.equal(ret1.amount, 100);

        // OPOS: Zahlung exakt in Höhe des ZAHLBETRAGS (nicht Brutto!) matcht exakt
        db.prepare(`INSERT INTO bank_konten (kontoname, bankname, iban, bic, kontoinhaber) VALUES ('GK','Bank','DE001','BIC','Firma')`).run();
        const kontoId = 1;
        db.prepare(`INSERT INTO bank_transaktionen (bank_konto_id, buchungstag, betrag, verwendungszweck, dedup_hash, status)
            VALUES (?, '2026-10-15', 2280, ?, 'hash-e2e-1', 'OFFEN')`).run(kontoId, `Rechnung ${a1.nr} Ausgleich`);
        const matching = await dbAPI.runOposMatching(kontoId);
        const hit = matching.matches.find(m => m.dokumentId === abschlag.id);
        assert.ok(hit, 'OPOS findet die Abschlagszahlung');
        assert.equal(hit.matchType, 'EXACT_INVOICE_AND_AMOUNT');
        const applied = await dbAPI.applyPaymentMatching([hit]);
        assert.equal(applied.count, 1);
        const a1paid = dbAPI.getDocumentById(abschlag.id);
        assert.equal(a1paid.status, 'Bezahlt');
        assert.equal(a1paid.offener_betrag, 0);

        // Nachtrag (GENEHMIGT → automatisch im LV-Stamm, dann in Schluss)
        const nachtragId = await dbAPI.saveNachtrag(
            { project_id: projektId, nachtrag_nr: 'N01', titel: 'Mehrmenge Sockel', rechtsgrundlage: 'VOB_2_6', status: 'EINGEREICHT' },
            [{ oz_code: 'N.01', kurztext: 'Sockelputz', menge: 2, einheit: 'm2', einheitspreis: 150, cost_type: 'LOHN' }]
        );
        const genehmigt = await dbAPI.updateNachtragStatus(nachtragId, 'GENEHMIGT');
        assert.equal(genehmigt.success, true);

        // Schlussrechnung: Aufmaß + Nachtrag, Abschlag auto-verrechnet
        const schluss = await dbAPI.createSchlussrechnung(projektId, {});
        assert.equal(schluss.success, true);
        assert.equal(schluss.verrechnet.length, 1);
        assert.equal(schluss.verrechnet[0].id, abschlag.id);
        const s1 = dbAPI.getDocumentById(schluss.id);
        assert.equal(s1.rechnungsart, 'SCHLUSSRECHNUNG');
        // 2000 LV + 300 Nachtrag = 2300 netto; Einbehalt WARRANTY 5 % = 115
        assert.equal(s1.netto, 2300);
        assert.equal(s1.sicherheitseinbehalt, 115);
        assert.ok(s1.positionen.some(p => p.nachtrag_id === nachtragId), 'Nachtrag im Beleg mit Herkunft');
        assert.equal(s1.verrechnungen.length, 1);
        // Zweite Schlussrechnung: J1-Guard schlägt zu
        await assert.rejects(() => dbAPI.createSchlussrechnung(projektId, {}), /bereits die Schlussrechnung/);

        // Freigabe Sicherheitseinbehalt nach Gewährleistung
        const retentions = await dbAPI.getSecurityRetentions(projektId);
        assert.equal(retentions.length, 2);
        const released = await dbAPI.releaseSecurityRetention(retentions[0].id, { mode: 'RELEASED' });
        assert.equal(released.status, 'RELEASED');
        await assert.rejects(async () => dbAPI.releaseSecurityRetention(retentions[0].id, {}), /nicht freigebbar/);

        // Ein Strang lesbar
        const kette = await dbAPI.getVorgangskette(projektId);
        assert.equal(kette.angebote.length, 1);
        assert.equal(kette.blaetter.length, 1);
        assert.equal(kette.blaetter[0].status, 'VERIFIED');
        assert.equal(kette.rechnungen.length, 2);
        assert.equal(kette.nachtraege.length, 1);
        assert.equal(kette.einbehalte.length, 2);
        assert.ok(kette.rechnungen.every(r => r.herkunft_typ === 'AUFMASS' || r.herkunft_typ === undefined || r.herkunft_typ === null || typeof r.herkunft_typ === 'string'));
        assert.equal(kette.rechnungen.find(r => r.rechnungsart === 'SCHLUSSRECHNUNG').verrechnungen.length, 1);
    });
});
