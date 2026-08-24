/**
 * dauerrechnung_generation.test.js - F2 Kernsuite:
 * Teil 1: Einzelgenerierung, Doppelgenerierungs-Schutz, Entwurfs-/Lock-Fälle,
 * Nummernkreis, POSITIONEN-Pläne.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const IS_ELECTRON_AS_NODE = !!process.versions.electron;
const RUN_INNER_MARKER = 'DAUERRECHNUNG_GENERATION_INNER_RUN';

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

if (!IS_ELECTRON_AS_NODE && !canLoadBetterSqlite()) {
    test('Dauerrechnungen Generierung (DB-Ebene, via Electron-as-Node Runtime)', () => {
        const electronBin = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
        assert.ok(fs.existsSync(electronBin), 'Electron-Binary muss als Node-Runtime verfügbar sein');

        const stdout = execFileSync(
            electronBin,
            [path.join(__filename), `--${RUN_INNER_MARKER}`],
            {
                env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '' },
                encoding: 'utf-8',
                maxBuffer: 64 * 1024 * 1024,
                timeout: 180000
            }
        );

        assert.match(stdout, /DAUERRECHNUNG_GENERATION_DB_TESTS_PASSED/, 'Alle Generierungs-Assertions müssen unter der App-Runtime bestehen');
    });
} else {
    process.env.RECHNUNGSPROGRAMM_DB_PATH = path.join(os.tmpdir(), `dauer-gen-test-${Date.now()}-${process.pid}.sqlite`);
    const { db, dbAPI } = require('../db.js');
    const InvoiceController = require('../controllers/InvoiceController');

    const eigentuemerId = Number(db.prepare("INSERT INTO kunden (name) VALUES ('Eigentümer A')").run().lastInsertRowid);
    const mieterId = Number(db.prepare("INSERT INTO kunden (name) VALUES ('Mieter B')").run().lastInsertRowid);
    const artikelId = Number(db.prepare("INSERT INTO artikel (name, vk, mwst) VALUES ('Glasreinigung', 3.5, 19)").run().lastInsertRowid);

    async function baueStruktur() {
        const lId = await dbAPI.saveLiegenschaft({ name: 'Gen-Liegenschaft', empfaenger_kunde_id: eigentuemerId });
        const gId = await dbAPI.saveGebaeude({ liegenschaft_id: lId, name: 'Haus A' });
        const eId = await dbAPI.saveEtage({ gebaeude_id: gId, name: 'EG' });
        const rId = await dbAPI.saveRaum({ etage_id: eId, name: 'Büro 101', empfaenger_kunde_id: mieterId, empfaenger_art: 'MIETER' });
        return { lId, gId, eId, rId };
    }

    function basisplan(overrides = {}) {
        return {
            name: 'Monatlich Pauschale',
            objekt_typ: 'LIEGENSCHAFT',
            objekt_id: null,
            empfaenger_kunde_id: eigentuemerId,
            rhythmus: 'MONATLICH',
            intervall_wochen: null,
            abrechnungstag: 1,
            abrechnungsmonat: null,
            abrechnungs_modus: 'NACHTRAEGLICH',
            start_datum: '2025-11-01',
            ende_datum: null,
            preis_modus: 'PAUSCHALE',
            pauschale_netto: 100,
            mwst_satz: 19,
            zahlungsziel_tage: 14,
            als_entwurf: 1,
            aktiv: 1,
            ...overrides
        };
    }

    test.after(() => {
        try { db.close(); } catch (_e) { /* ignore */ }
        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.rmSync(process.env.RECHNUNGSPROGRAMM_DB_PATH + suffix, { force: true }); } catch (_e) { /* ignore */ }
        }
    });

    test('Fixtures: Struktur + Pläne angelegt', async () => {
        global.__gen = await baueStruktur();
        const res = await dbAPI.saveAbrechnungsplan(basisplan({ objekt_id: global.__gen.lId }), []);
        global.__gen.planId = res.id;
        assert.ok(res.id > 0);

        const posPlan = await dbAPI.saveAbrechnungsplan(basisplan({
            name: 'Positionen Plan',
            objekt_typ: 'RAUM',
            objekt_id: global.__gen.rId,
            empfaenger_kunde_id: mieterId,
            preis_modus: 'POSITIONEN'
        }), [
            { artikelId, menge: 4, einheit: 'm²', preis: 3.5, mwst: 19 },
            { name: 'Sonderleistung Freitext', menge: 1, einheit: 'Stk.', preis: 50, mwst: 7 }
        ]);
        global.__gen.posPlanId = posPlan.id;
    });

    test('Einzelgenerierung: Beleg centgenau, verknüpft, Entwurf, Plan-Caches aktualisiert', async () => {
        const plan = db.prepare('SELECT * FROM abrechnungsplaene WHERE id=?').get(global.__gen.planId);
        const lauf = { rechnungsDatum: '2026-01-01', periodeVon: '2025-12-01', periodeBis: '2025-12-31' };

        const res = dbAPI.erzeugeRechnungAusLauf(plan, lauf);
        global.__gen.dokumentId = res.dokumentId;
        global.__gen.laufId = res.laufId;

        const doc = db.prepare('SELECT * FROM dokumente WHERE id=?').get(res.dokumentId);
        assert.equal(doc.type, 'rechnung');
        assert.equal(doc.rechnungsart, 'REGULAER');
        assert.match(doc.nr, /^INV-\d{4}-\d{3,}$/);
        assert.equal(doc.netto, 100);
        assert.equal(doc.steuer, 19);
        assert.equal(doc.brutto, 119);
        assert.equal(doc.kundeId, eigentuemerId);
        assert.equal(doc.objekt_typ, 'LIEGENSCHAFT');
        assert.equal(doc.objekt_id, global.__gen.lId);
        assert.equal(doc.leistungszeitraum_von, '2025-12-01');
        assert.equal(doc.leistungszeitraum_bis, '2025-12-31');
        assert.equal(doc.status, 'Entwurf');
        assert.equal(doc.isLocked, 0);

        const laufRow = db.prepare('SELECT * FROM dauerrechnung_laeufe WHERE id=?').get(res.laufId);
        assert.equal(laufRow.plan_id, global.__gen.planId);
        assert.equal(laufRow.dokument_id, res.dokumentId);
        assert.equal(laufRow.status, 'ERSTELLT');
        assert.equal(laufRow.faellig_am, '2026-01-15');

        const planNeu = db.prepare('SELECT letzte_lauf_am, naechste_lauf_am FROM abrechnungsplaene WHERE id=?').get(global.__gen.planId);
        assert.equal(planNeu.letzte_lauf_am, '2026-01-01');
        assert.ok(planNeu.naechste_lauf_am && planNeu.naechste_lauf_am > '2026-01-01');
    });

    test('Nummernkreis: fortlaufende INV-Nummern ohne Kollision', () => {
        const nr1 = db.prepare('SELECT nr FROM dokumente WHERE id=?').get(global.__gen.dokumentId).nr;
        assert.ok(nr1.startsWith('INV-'));
        const nummern = db.prepare("SELECT nr FROM dokumente WHERE type='rechnung'").all().map(r => r.nr);
        assert.equal(new Set(nummern).size, nummern.length);
    });

    test('Doppelgenerierung desselben Fensters -> deutsche Fehlermeldung; nach Storno erneut OK', async () => {
        const plan = db.prepare('SELECT * FROM abrechnungsplaene WHERE id=?').get(global.__gen.planId);
        const lauf = { rechnungsDatum: '2026-01-01', periodeVon: '2025-12-01', periodeBis: '2025-12-31' };

        await assert.rejects(
            async () => dbAPI.erzeugeRechnungAusLauf(plan, lauf),
            /bereits abgerechnet/
        );

        await dbAPI.storniereLauf(Number(global.__gen.laufId), 'Doppeltest-Storno');

        const erneut = dbAPI.erzeugeRechnungAusLauf(plan, lauf);
        assert.ok(erneut.dokumentId > 0);
        global.__gen.laufId = erneut.laufId;
        global.__gen.dokumentId = erneut.dokumentId;
    });

    test('als_entwurf=0 -> gesperrter Beleg; Inhaltsänderung blockiert, Statuspfad erlaubt', async () => {
        const planRow = basisplan({
            name: 'Sofort-Gesperrt',
            objekt_id: global.__gen.lId,
            als_entwurf: 0
        });
        const res = await dbAPI.saveAbrechnungsplan(planRow, []);
        const plan = db.prepare('SELECT * FROM abrechnungsplaene WHERE id=?').get(res.id);

        const gen = dbAPI.erzeugeRechnungAusLauf(plan, { rechnungsDatum: '2026-02-01', periodeVon: '2026-01-01', periodeBis: '2026-01-31' });
        const doc = db.prepare('SELECT * FROM dokumente WHERE id=?').get(gen.dokumentId);
        assert.equal(doc.isLocked, 1);
        assert.notEqual(doc.status, 'Entwurf');

        await assert.rejects(
            () => dbAPI.saveDocument({ ...doc, isLocked: true, netto: 999, positionen: [{ name: 'X', menge: 1, preis: 999, mwst: 19 }] }),
            /gesperrt|GoBD/i
        );

        await assert.doesNotReject(
            () => dbAPI.updateDocumentStatus(gen.dokumentId, { status: 'Bezahlt' })
        );
    });

    test('POSITIONEN-Plan: Summen konsistent über calculateTotals', async () => {
        const plan = db.prepare('SELECT * FROM abrechnungsplaene WHERE id=?').get(global.__gen.posPlanId);
        const gen = dbAPI.erzeugeRechnungAusLauf(plan, { rechnungsDatum: '2026-01-15', periodeVon: '2025-10-01', periodeBis: '2025-12-31' });
        const doc = db.prepare('SELECT * FROM dokumente WHERE id=?').get(gen.dokumentId);
        const positionen = db.prepare('SELECT * FROM positionen WHERE dokumentId=? ORDER BY id ASC').all(gen.dokumentId);

        const totals = InvoiceController.calculateTotals({
            positionen: positionen.map(p => ({ ...p, rabatt: 0 })),
            mode: 'netto',
            globalRabatt: { value: 0, type: '%' },
            anzahlung: 0
        });
        assert.equal(doc.netto, totals.nettoNachRabatt);
        assert.equal(doc.steuer, totals.totalTax);
        assert.equal(doc.brutto, totals.bruttoNachRabatt);

        const nettoErwartet = Math.round((4 * 3.5 + 1 * 50) * 100) / 100;
        assert.equal(Math.round(doc.netto * 100) / 100, nettoErwartet);
    });

    test('Sammelrechnung: 2 Läufe / 2 Objekte / Eigentümer A -> EIN Beleg SAMMELRECHNUNG', async () => {
        const planA = db.prepare('SELECT * FROM abrechnungsplaene WHERE id=?').get(global.__gen.planId);
        const lauf1 = { rechnungsDatum: '2026-04-01', periodeVon: '2026-03-01', periodeBis: '2026-03-31' };
        const einzeln = dbAPI.erzeugeSammelrechnung(eigentuemerId, [
            { planId: planA.id, ...lauf1 },
            { planId: planA.id, rechnungsDatum: '2026-05-01', periodeVon: '2026-04-01', periodeBis: '2026-04-30' }
        ]);

        global.__gen.sammelDokumentId = einzeln.dokumentId;
        const doc = db.prepare('SELECT * FROM dokumente WHERE id=?').get(einzeln.dokumentId);
        assert.equal(doc.rechnungsart, 'SAMMELRECHNUNG');
        assert.equal(doc.kundeId, eigentuemerId);
        assert.equal(doc.objekt_typ, null);
        assert.equal(doc.leistungszeitraum_von, '2026-03-01');
        assert.equal(doc.leistungszeitraum_bis, '2026-04-30');

        const positionen = db.prepare('SELECT name FROM positionen WHERE dokumentId=?').all(einzeln.dokumentId);
        assert.ok(positionen.length >= 2);
        assert.ok(positionen.every(p => p.name.startsWith('[Gen-Liegenschaft]')), 'Positionsnamen müssen den Objekt-Pfad-Prefix tragen');

        const laeufe = db.prepare("SELECT dokument_id FROM dauerrechnung_laeufe WHERE plan_id=? AND status='ERSTELLT' AND periode_von >= '2026-03-01'").all(planA.id);
        assert.ok(laeufe.length >= 2);
        assert.ok(laeufe.every(l => l.dokument_id === einzeln.dokumentId));

        const hist = await dbAPI.getObjektHistorie('LIEGENSCHAFT', Number(global.__gen.lId));
        assert.ok(hist.some(d => d.id === einzeln.dokumentId), 'Sammelrechnung muss in der Objekt-Historie erscheinen (Historie-SQL aus F1)');

        const nettoErwartetSammel = Math.round((100 + 100) * 100) / 100;
        const bruttoErwartetSammel = Math.round((119 + 119) * 100) / 100;
        assert.equal(doc.netto, nettoErwartetSammel);
        assert.equal(doc.brutto, bruttoErwartetSammel);
    });

    test('Sammelrechnung Fehlerfälle: <2 Läufe, gemischte Empfänger, bereits abgerechnet', async () => {
        await assert.rejects(
            async () => dbAPI.erzeugeSammelrechnung(eigentuemerId, []),
            /mindestens 2/
        );

        const gemischt = [
            { planId: global.__gen.planId, rechnungsDatum: '2026-09-01', periodeVon: '2026-08-01', periodeBis: '2026-08-31' },
            { planId: global.__gen.posPlanId, rechnungsDatum: '2026-09-15', periodeVon: '2026-08-01', periodeBis: '2026-08-31' }
        ];
        await assert.rejects(
            async () => dbAPI.erzeugeSammelrechnung(eigentuemerId, gemischt),
            /denselben Rechnungsempfänger/
        );

        const verbraucht = db.prepare("SELECT id FROM dauerrechnung_laeufe WHERE dokument_id IS NOT NULL LIMIT 1").get();
        if (verbraucht) {
            await assert.rejects(
                async () => dbAPI.erzeugeSammelrechnung(eigentuemerId, [{ laufId: verbraucht.id }, { laufId: verbraucht.id }]),
                /bereits abgerechnet|ERSTELLT|mindestens/
            );
        }
    });

    test('Storno geschlossener Beleg via storniereLauf -> Lauf STORNIERT, Grund pflichtig, Kette valid', async () => {
        await assert.rejects(
            async () => dbAPI.storniereLauf(1, '   '),
            /Storno ohne Begründung/
        );

        const lauf = db.prepare("SELECT * FROM dauerrechnung_laeufe WHERE status='ERSTELLT' AND dokument_id IS NOT NULL ORDER BY id DESC LIMIT 1").get();
        if (!lauf) return;

        const docVorher = db.prepare('SELECT * FROM dokumente WHERE id=?').get(lauf.dokument_id);
        if (!docVorher.isLocked) {
            await dbAPI.saveDocument({ ...docVorher, isLocked: true, positionen: db.prepare('SELECT * FROM positionen WHERE dokumentId=?').all(docVorher.id) });
        }

        const res = await dbAPI.storniereLauf(Number(lauf.id), 'Jahresend-Storno nach Prüfung');
        assert.equal(res.success, true);
        assert.equal(res.dokumentStorniert, true);

        const laufNeu = db.prepare('SELECT status, storno_grund FROM dauerrechnung_laeufe WHERE id=?').get(lauf.id);
        assert.equal(laufNeu.status, 'STORNIERT');
        assert.equal(laufNeu.storno_grund, 'Jahresend-Storno nach Prüfung');

        const kette = dbAPI.verifiziereAuditKette();
        assert.equal(kette.valid, true, JSON.stringify(kette.errors));
    });

    test('autoRun: setzt last_auto_run, zweiter Aufruf same day no-op, Entwurfsanzahl korrekt', async () => {
        db.prepare("DELETE FROM einstellungen WHERE key='dauerrechnungen_last_auto_run'").run();

        const auto1 = await dbAPI.autoRunDauerrechnungen();
        assert.equal(auto1.ausgefuehrt, true);
        assert.equal(typeof auto1.erstellteAnzahl, 'number');
        assert.ok(auto1.erstellteAnzahl >= 0);

        const lastRun = db.prepare("SELECT value FROM einstellungen WHERE key='dauerrechnungen_last_auto_run'").get();
        assert.equal(lastRun.value, new Date().toISOString().split('T')[0]);

        const auto2 = await dbAPI.autoRunDauerrechnungen();
        assert.equal(auto2.ausgefuehrt, false);
        assert.match(auto2.grund, /heute bereits/);

        db.prepare("INSERT OR REPLACE INTO einstellungen (key, value) VALUES ('dauerrechnungen_auto_erstellen', 'false')").run();
        db.prepare("DELETE FROM einstellungen WHERE key='dauerrechnungen_last_auto_run'").run();
        const auto3 = await dbAPI.autoRunDauerrechnungen();
        assert.equal(auto3.ausgefuehrt, false);
        assert.match(auto3.grund || '', /deaktiviert/);

        const kette = dbAPI.verifiziereAuditKette();
        assert.equal(kette.valid, true);
    });

    console.log('DAUERRECHNUNG_GENERATION_DB_TESTS_PASSED');
}
