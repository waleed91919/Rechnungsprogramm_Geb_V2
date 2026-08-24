/**
 * dauerrechnung_crud.test.js - F2: Abrechnungspläne Schema, CRUD, Constraints,
 * Lauf-Schutz, Pausieren, getFullState, FK
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const IS_ELECTRON_AS_NODE = !!process.versions.electron;
const RUN_INNER_MARKER = 'DAUERRECHNUNG_CRUD_INNER_RUN';

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
    test('Dauerrechnungen CRUD (DB-Ebene, via Electron-as-Node Runtime)', () => {
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

        assert.match(stdout, /DAUERRECHNUNG_CRUD_DB_TESTS_PASSED/, 'Alle CRUD-Assertions müssen unter der App-Runtime bestehen');
    });
} else {
    process.env.RECHNUNGSPROGRAMM_DB_PATH = path.join(os.tmpdir(), `dauer-crud-test-${Date.now()}-${process.pid}.sqlite`);
    const { db, dbAPI } = require('../db.js');

    const kundeId = Number(db.prepare("INSERT INTO kunden (name) VALUES ('Plan-Empfänger')").run().lastInsertRowid);

    function plan(overrides = {}) {
        return {
            name: 'Unterhaltsreinigung Bürohaus',
            objekt_typ: 'LIEGENSCHAFT',
            objekt_id: 1,
            empfaenger_kunde_id: kundeId,
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
            bemerkung: null,
            ...overrides
        };
    }

    const positionen = [
        { name: 'Glasreinigung', menge: 4, einheit: 'm²', preis: 3.5, mwst: 19 },
        { artikelId: null, name: 'Sonderleistung', menge: 1, einheit: 'Stk.', preis: 50, mwst: 7 }
    ];

    test.after(() => {
        try { db.close(); } catch (_e) { /* ignore */ }
        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.rmSync(process.env.RECHNUNGSPROGRAMM_DB_PATH + suffix, { force: true }); } catch (_e) { /* ignore */ }
        }
    });

    test('Schema: 3 Tabellen + Indizes inkl. Partial-Unique existieren', () => {
        const tabellen = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
        for (const t of ['abrechnungsplaene', 'abrechnungsplan_positionen', 'dauerrechnung_laeufe']) {
            assert.ok(tabellen.includes(t), `Tabelle ${t} muss existieren`);
        }
        const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r => r.name);
        for (const i of ['idx_abrechnungsplaene_objekt_name', 'idx_abrechnungsplaene_empfaenger', 'idx_abrechnungsplaene_faellig', 'idx_plan_positionen_plan', 'idx_laeufe_plan_periode_unique', 'idx_laeufe_dokument', 'idx_laeufe_plan']) {
            assert.ok(idx.includes(i), `Index ${i} muss existieren`);
        }
        const partialSql = db.prepare("SELECT sql FROM sqlite_master WHERE name='idx_laeufe_plan_periode_unique'").get().sql;
        assert.match(partialSql, /WHERE status = 'ERSTELLT'/);
    });

    test('CRUD: Plan mit Positionen nested speichern/laden, naechste_lauf_am berechnet', async () => {
        const res = await dbAPI.saveAbrechnungsplan(plan(), positionen);
        assert.ok(res.id > 0);
        assert.ok(res.naechste_lauf_am, 'naechste_lauf_am muss berechnet werden');
        assert.equal(res.naechste_lauf_am >= plan().start_datum, true);

        const plaene = await dbAPI.getAbrechnungsplaene({ objektTyp: 'LIEGENSCHAFT', objektId: 1 });
        assert.equal(plaene.length, 1);
        assert.equal(plaene[0].positionen.length, 2);
        assert.equal(plaene[0].empfaengerName, 'Plan-Empfänger');
        assert.ok(plaene[0].objektPfad !== undefined);

        const alle = await dbAPI.getAbrechnungsplaene();
        assert.equal(alle.length, 1);
    });

    test('UNIQUE(objekt, name): zweite Speicherung wirft deutsche Meldung', async () => {
        await assert.rejects(
            () => dbAPI.saveAbrechnungsplan(plan(), []),
            /Plan mit diesem Namen existiert für dieses Objekt bereits/
        );
    });

    test('CHECK-/Validierungsfehler: falscher Rhythmus, Tag 32, leere Positionen, Pauschale 0, Wochenintervall, Jährlich', async () => {
        await assert.rejects(() => dbAPI.saveAbrechnungsplan(plan({ name: 'Falsch-Rhythmus', rhythmus: 'WOECHENTLICH' }), []), /Rhythmus/);
        await assert.rejects(() => dbAPI.saveAbrechnungsplan(plan({ name: 'Leere-Pos', preis_modus: 'POSITIONEN' }), []), /POSITIONEN ohne Positionen/);
        await assert.rejects(() => dbAPI.saveAbrechnungsplan(plan({ name: 'Pauschale-Null', pauschale_netto: 0 }), []), /PAUSCHALE ohne Betrag/);
        await assert.rejects(() => dbAPI.saveAbrechnungsplan(plan({ name: 'Wochen-Null', rhythmus: 'WOCHEN_INTERVALL', intervall_wochen: 0 }), []), /Intervall >= 1/);
        await assert.rejects(() => dbAPI.saveAbrechnungsplan(plan({ name: 'Jaehrlich-Ohne-Monat', rhythmus: 'JAEHRLICH', abrechnungsmonat: null }), []), /Jährlicher Rhythmus benötigt Abrechnungsmonat/);
        assert.throws(
            () => db.prepare("INSERT INTO abrechnungsplaene (name, objekt_typ, objekt_id, empfaenger_kunde_id, rhythmus, start_datum, abrechnungstag) VALUES ('X', 'LIEGENSCHAFT', 1, ?, 'MONATLICH', '2026-01-01', 32)").run(kundeId),
            /CHECK/i
        );
    });

    test('FK: unbekannter Empfänger wirft FOREIGN KEY', async () => {
        await assert.rejects(
            () => dbAPI.saveAbrechnungsplan(plan({ name: 'Geister-Empfänger', empfaenger_kunde_id: 987654 }), []),
            /FOREIGN KEY/i
        );
    });

    test('deleteAbrechnungsplan: mit Lauf blockiert, ohne Läufe ok, CASCADE positionen', async () => {
        const resMitPos = await dbAPI.saveAbrechnungsplan(plan({ name: 'Mit-Lauf', start_datum: '2026-01-01' }), positionen);
        const planId = resMitPos.id;

        db.prepare(`INSERT INTO dauerrechnung_laeufe (plan_id, periode_von, periode_bis, rechnungs_datum, status)
                    VALUES (?, '2025-12-01', '2025-12-31', '2026-01-01', 'ERSTELLT')`).run(planId);

        await assert.rejects(() => dbAPI.deleteAbrechnungsplan(planId), /Plan hat Läufe und kann nicht gelöscht werden/);

        db.prepare('DELETE FROM dauerrechnung_laeufe WHERE plan_id=?').run(planId);
        await dbAPI.deleteAbrechnungsplan(planId);
        assert.equal(db.prepare('SELECT COUNT(*) c FROM abrechnungsplaene WHERE id=?').get(planId).c, 0);
        assert.equal(db.prepare('SELECT COUNT(*) c FROM abrechnungsplan_positionen WHERE plan_id=?').get(planId).c, 0, 'Positionen müssen per CASCADE mitgelöscht werden');
    });

    test('updateAbrechnungsplanStatus: pausieren & reaktivieren; getFullState liefert Pläne+Läufe', async () => {
        const res = await dbAPI.saveAbrechnungsplan(plan({ name: 'Pausierbar' }), []);
        const statusAus = await dbAPI.updateAbrechnungsplanStatus(res.id, false);
        assert.deepEqual(statusAus, { success: true, id: res.id });
        assert.equal(db.prepare('SELECT aktiv FROM abrechnungsplaene WHERE id=?').get(res.id).aktiv, 0);

        await dbAPI.updateAbrechnungsplanStatus(res.id, true);
        assert.equal(db.prepare('SELECT aktiv FROM abrechnungsplaene WHERE id=?').get(res.id).aktiv, 1);

        await assert.rejects(() => dbAPI.updateAbrechnungsplanStatus('x', true), /Ungültige Plan-ID/);
        await assert.rejects(() => dbAPI.getPlanLaeufe('x'), /Ungültige Plan-ID/);

        db.prepare("INSERT INTO dauerrechnung_laeufe (plan_id, periode_von, periode_bis, rechnungs_datum) VALUES (?, '2026-01-01', '2026-01-31', '2026-02-01')").run(res.id);

        const laeufe = await dbAPI.getPlanLaeufe(res.id);
        assert.equal(laeufe.length, 1);
        assert.equal(laeufe[0].status, 'ERSTELLT');

        const state = await dbAPI.getFullState();
        assert.ok(Array.isArray(state.abrechnungsplaene) && state.abrechnungsplaene.length >= 1);
        assert.ok(Array.isArray(state.dauerrechnungLaeufe) && state.dauerrechnungLaeufe.length >= 1);
        assert.ok(Array.isArray(state.abrechnungsplaene.find(p => p.id === res.id).positionen));
    });

    console.log('DAUERRECHNUNG_CRUD_DB_TESTS_PASSED');
}
