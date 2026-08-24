/**
 * objekt_historie.test.js - F1: Objekt-Historie (DIREKT-Treffer, Roll-up,
 * Sortierung, Deduplikation, leerer Zustand)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const IS_ELECTRON_AS_NODE = !!process.versions.electron;
const RUN_INNER_MARKER = 'OBJEKT_HISTORIE_INNER_RUN';

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
    test('Objekt-Historie (DB-Ebene, via Electron-as-Node Runtime)', () => {
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

        assert.match(stdout, /OBJEKT_HISTORIE_DB_TESTS_PASSED/, 'Alle Historien-Assertions müssen unter der App-Runtime bestehen');
    });
} else {
    process.env.RECHNUNGSPROGRAMM_DB_PATH = path.join(os.tmpdir(), `objekt-hist-test-${Date.now()}-${process.pid}.sqlite`);
    const { db, dbAPI } = require('../db.js');

    const kundeId = db.prepare("INSERT INTO kunden (name) VALUES ('Historien-Kunde')").run().lastInsertRowid;

    function baseDoc(nr, datum, overrides = {}) {
        return {
            type: 'rechnung',
            nr,
            datum,
            faellig: '2026-12-31',
            kundeId: Number(kundeId),
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

    let ids;
    test.before(async () => {
        const lId = await dbAPI.saveLiegenschaft({ name: 'Hist-Liegenschaft' });
        const gId = await dbAPI.saveGebaeude({ liegenschaft_id: lId, name: 'Hist-Haus' });
        const eId = await dbAPI.saveEtage({ gebaeude_id: gId, name: 'EG' });
        const rId = await dbAPI.saveRaum({ etage_id: eId, name: 'Hist-Raum' });
        ids = { lId, gId, eId, rId };
    });

    test('DIREKT-Treffer: Beleg mit Objekt-Link erscheint, ohne Link nicht', async () => {
        const linked = await dbAPI.saveDocument(baseDoc('HIST-LINK', '2026-01-10', { objekt_typ: 'RAUM', objekt_id: ids.rId }));
        await dbAPI.saveDocument(baseDoc('HIST-OHNE', '2026-01-11'));

        const hist = await dbAPI.getObjektHistorie('RAUM', Number(ids.rId));
        assert.equal(hist.length, 1);
        assert.equal(hist[0].nr, 'HIST-LINK');
        assert.equal(hist[0].matchArt, 'DIREKT');
    });

    test('Roll-up: Beleg am RAUM erscheint in Raum-, Etagen-, Gebäude- und Liegenschafts-Historie', async () => {
        for (const [typ, id] of [['ETAGE', ids.eId], ['GEBAEUDE', ids.gId], ['LIEGENSCHAFT', ids.lId]]) {
            const hist = await dbAPI.getObjektHistorie(typ, Number(id));
            assert.equal(hist.length, 1, `Historie von ${typ} muss den Raum-Beleg enthalten`);
            assert.equal(hist[0].nr, 'HIST-LINK');
        }
    });

    test('Sortierung: datum DESC, id DESC', async () => {
        await dbAPI.saveDocument(baseDoc('HIST-AELTER', '2025-06-01', { objekt_typ: 'RAUM', objekt_id: ids.rId }));
        await dbAPI.saveDocument(baseDoc('HIST-NEUER', '2026-05-01', { objekt_typ: 'RAUM', objekt_id: ids.rId }));

        const hist = await dbAPI.getObjektHistorie('RAUM', Number(ids.rId));
        assert.deepEqual(hist.map(d => d.nr), ['HIST-NEUER', 'HIST-LINK', 'HIST-AELTER']);
    });

    test('Deduplikation: Beleg erscheint nur einmal pro Historie', async () => {
        const hist = await dbAPI.getObjektHistorie('LIEGENSCHAFT', Number(ids.lId));
        const nrListe = hist.map(d => d.nr);
        const unique = new Set(nrListe);
        assert.equal(nrListe.length, unique.size, 'Keine Dubletten erlaubt');
        assert.equal(unique.has('HIST-NEUER'), true);
    });

    test('Leere Historie: Liegenschaft ohne Belege liefert []', async () => {
        const leereLieg = await dbAPI.saveLiegenschaft({ name: 'Ohne Belege' });
        const hist = await dbAPI.getObjektHistorie('LIEGENSCHAFT', Number(leereLieg));
        assert.deepEqual(hist, []);
    });

    test('Ungültiger Objekttyp wirft deutsche Meldung', async () => {
        await assert.rejects(() => dbAPI.getObjektHistorie('SCHRAUBEN', 1), /Ungültiger Objekttyp/);
        await assert.rejects(() => dbAPI.getObjektDetails('SCHRAUBEN', 1), /Ungültiger Objekttyp/);
    });

    console.log('OBJEKT_HISTORIE_DB_TESTS_PASSED');
}
