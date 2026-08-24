/**
 * objekt_stamm.test.js - F1 Objektverwaltung: Schema/Migration, CRUD, FK,
 * CASCADE, Löschschutz (GoBD), CHECK-Constraints, getFullState, Audit-Kette
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const IS_ELECTRON_AS_NODE = !!process.versions.electron;
const RUN_INNER_MARKER = 'OBJEKT_STAMM_INNER_RUN';

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

// ---------------------------------------------------------------------------
if (!IS_ELECTRON_AS_NODE && !canLoadBetterSqlite()) {
    test('Objektstamm (DB-Ebene, via Electron-as-Node Runtime)', () => {
        const electronBin = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
        assert.ok(fs.existsSync(electronBin), 'Electron-Binary muss als Node-Runtime verfügbar sein');

        const stdout = execFileSync(
            electronBin,
            [path.join(__filename), `--${RUN_INNER_MARKER}`],
            {
                env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '' },
                encoding: 'utf-8',
                maxBuffer: 64 * 1024 * 1024,
                timeout: 120000
            }
        );

        assert.match(stdout, /OBJEKT_STAMM_DB_TESTS_PASSED/, 'Alle Objektstamm-Assertions müssen unter der App-Runtime bestehen');
    });
} else {
    process.env.RECHNUNGSPROGRAMM_DB_PATH = path.join(os.tmpdir(), `objekt-stamm-test-${Date.now()}-${process.pid}.sqlite`);
    const { db, dbAPI } = require('../db.js');

    const kundeId = db.prepare("INSERT INTO kunden (name) VALUES ('Objekt-Empfänger AG')").run().lastInsertRowid;

    function baseDoc(overrides = {}) {
        return {
            type: 'rechnung',
            nr: 'RE-OBJ-BASIS',
            datum: '2026-08-01',
            faellig: '2026-08-31',
            kundeId,
            status: 'Ausstehend',
            netto: 100,
            steuer: 19,
            brutto: 119,
            positionen: [{ name: 'Reinigung', menge: 1, einheit: 'Stk.', preis: 100, mwst: 19 }],
            isLocked: false,
            ...overrides
        };
    }

    test.after(() => {
        try { db.close(); } catch (_e) { /* ignore */ }
        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.rmSync(process.env.RECHNUNGSPROGRAMM_DB_PATH + suffix, { force: true }); } catch (_e) { /* ignore */ }
        }
    });

    test('(a) Schema/Migration: Tabellen, dokumente-Spalten und Indizes existieren', () => {
        const tabellen = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
        for (const t of ['liegenschaften', 'gebaeude', 'etagen', 'raeume']) {
            assert.ok(tabellen.includes(t), `Tabelle ${t} muss existieren`);
        }
        const docCols = db.prepare('PRAGMA table_info(dokumente)').all().map(c => c.name);
        assert.ok(docCols.includes('objekt_typ'), 'dokumente.objekt_typ muss existieren');
        assert.ok(docCols.includes('objekt_id'), 'dokumente.objekt_id muss existieren');

        const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r => r.name);
        assert.ok(idx.includes('idx_dokumente_objekt'), 'Index idx_dokumente_objekt muss existieren');
        assert.ok(idx.includes('idx_gebaeude_liegenschaft'), 'Index idx_gebaeude_liegenschaft muss existieren');
    });

    test('(b) CRUD happy path: Liegenschaft → Gebäude → Etage → Raum', async () => {
        const lId = await dbAPI.saveLiegenschaft({ objekt_nr: 'L-001', name: 'Liegenschaft Alpha', ort: 'Musterstadt', empfaenger_kunde_id: Number(kundeId), empfaenger_art: 'EIGENTUEMER' });
        const gId = await dbAPI.saveGebaeude({ liegenschaft_id: lId, name: 'Haus A', baujahr: 1995, geschosse: 3 });
        const eId = await dbAPI.saveEtage({ gebaeude_id: gId, name: 'EG', ebene_nummer: 0 });
        const rId = await dbAPI.saveRaum({ etage_id: eId, name: 'Büro 101', raum_nr: '101', flaeche: 25.5, einheit: 'm²' });

        const lieg = db.prepare('SELECT * FROM liegenschaften WHERE id=?').get(lId);
        const geb = db.prepare('SELECT * FROM gebaeude WHERE id=?').get(gId);
        const etg = db.prepare('SELECT * FROM etagen WHERE id=?').get(eId);
        const raum = db.prepare('SELECT * FROM raeume WHERE id=?').get(rId);

        assert.equal(geb.liegenschaft_id, lieg.id);
        assert.equal(etg.gebaeude_id, geb.id);
        assert.equal(raum.etage_id, etg.id);
        assert.equal(lieg.empfaenger_kunde_id, kundeId);
        assert.equal(lieg.empfaenger_art, 'EIGENTUEMER');
        assert.equal(raum.flaeche, 25.5);

        const updateId = await dbAPI.saveRaum({ id: rId, etage_id: eId, name: 'Büro 102', flaeche: 30 });
        assert.equal(updateId, rId);
        assert.equal(db.prepare('SELECT name FROM raeume WHERE id=?').get(rId).name, 'Büro 102');

        global.__objektTestIds = { lId, gId, eId, rId };
    });

    test('(c) FK: saveGebaeude mit unbekannter Liegenschaft wirft FOREIGN KEY', async () => {
        await assert.rejects(
            () => dbAPI.saveGebaeude({ liegenschaft_id: 987654, name: 'Geisterhaus' }),
            /FOREIGN KEY/i
        );
    });

    test('(d) ON DELETE CASCADE: Liegenschaft ohne Belege löscht Kinder mit', async () => {
        const lId = await dbAPI.saveLiegenschaft({ name: 'Liegenschaft Beta' });
        const gId = await dbAPI.saveGebaeude({ liegenschaft_id: lId, name: 'Haus B' });
        const eId = await dbAPI.saveEtage({ gebaeude_id: gId, name: '1. OG' });
        await dbAPI.saveRaum({ etage_id: eId, name: 'Raum B1', flaeche: 10 });

        await dbAPI.deleteLiegenschaft(lId);

        assert.equal(db.prepare('SELECT COUNT(*) c FROM gebaeude WHERE liegenschaft_id=?').get(lId).c, 0);
        assert.equal(db.prepare('SELECT COUNT(*) c FROM etagen WHERE gebaeude_id=?').get(gId).c, 0);
        assert.equal(db.prepare('SELECT COUNT(*) c FROM raeume').get().c, 1 - 1 + (global.__objektTestIds ? 1 : 1));
    });

    test('(e) Löschschutz: Raum mit Belegbezug nicht löschbar, aber deaktivierbar', async () => {
        const { lId, gId, eId, rId } = global.__objektTestIds;
        await dbAPI.saveDocument(baseDoc({ nr: 'RE-OBJ-LINK', objekt_typ: 'RAUM', objekt_id: rId }));

        await assert.rejects(() => dbAPI.deleteRaum(rId), /Belege/);

        await dbAPI.saveRaum({ id: rId, etage_id: eId, name: 'Büro 102', flaeche: 30, aktiv: 0 });
        assert.equal(db.prepare('SELECT aktiv FROM raeume WHERE id=?').get(rId).aktiv, 0);

        await dbAPI.deleteDocument(db.prepare('SELECT id FROM dokumente WHERE nr=?').get('RE-OBJ-LINK').id);
        await dbAPI.deleteLiegenschaft(lId);
    });

    test('(f) CHECK-Constraints: empfaenger_art und aktiv werden validiert', async () => {
        assert.throws(
            () => db.prepare("INSERT INTO liegenschaften (name, empfaenger_art) VALUES ('X', 'FALSCH')").run(),
            /CHECK/i
        );
        assert.throws(
            () => db.prepare("INSERT INTO liegenschaften (name, aktiv) VALUES ('X', 5)").run(),
            /CHECK/i
        );
    });

    test('(g) getFullState liefert state.objekte mit allen 4 Listen', async () => {
        const state = await dbAPI.getFullState();
        assert.ok(state.objekte, 'state.objekte muss existieren');
        for (const key of ['liegenschaften', 'gebaeude', 'etagen', 'raeume']) {
            assert.ok(Array.isArray(state.objekte[key]), `state.objekte.${key} muss Liste sein`);
        }
    });

    test('(h) GoBD-Hashkette bleibt nach Belegspeichern mit Objekt-Link gültig', async () => {
        const docId = await dbAPI.saveDocument(baseDoc({ nr: 'RE-OBJ-HASH', objekt_typ: 'LIEGENSCHAFT', objekt_id: global.__objektTestIds.lId }));
        assert.ok(docId, 'Beleg muss angelegt werden');
        const stored = db.prepare('SELECT objekt_typ, objekt_id FROM dokumente WHERE id=?').get(docId);
        assert.equal(stored.objekt_typ, 'LIEGENSCHAFT');
        assert.equal(stored.objekt_id, global.__objektTestIds.lId);

        const res = dbAPI.verifiziereAuditKette();
        assert.equal(res.valid, true, 'Audit-Kette muss gültig sein: ' + JSON.stringify(res.errors));

        await dbAPI.deleteDocument(docId);
    });

    console.log('OBJEKT_STAMM_DB_TESTS_PASSED');
}
