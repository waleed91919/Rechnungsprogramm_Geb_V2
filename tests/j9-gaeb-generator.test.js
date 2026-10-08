const { test, describe } = require('node:test');
const assert = require('node:assert');
const { getElectronPath } = require('./test_electron_helper');
const { execFileSync } = require('child_process');

const IS_ELECTRON_AS_NODE = !!process.versions.electron;
const RUN_INNER_MARKER = 'GAEB_TENDER_GENERATOR_INNER_RUN';

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
    test('Re-executing db tests in Electron-as-Node...', () => {
        const electronPath = getElectronPath();
        assert.ok(electronPath, 'Electron executable muss gefunden werden');
        const env = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1', [RUN_INNER_MARKER]: '1' });
        try {
            execFileSync(electronPath, [__filename], { env, stdio: 'inherit' });
        } catch (e) {
            assert.fail('Inner test execution in Electron failed: ' + e.message);
        }
    });
    return; // Stop outer script
}

const Database = require('better-sqlite3');
const { initGaebSchema, installGaebTriggersAndIndices } = require('../db/schema/gaeb_schema');
const { createAngebotFromDraft, deleteX83Import } = require('../db/repositories/gaeb/gaeb_linking');

describe('J9 GAEB Generator: createAngebotFromDraft', () => {
    let db;

    test('setup', () => {
        db = new Database(':memory:');

        // 1. Core Schema für Dokumente und Positionen mocken (Minimales Setup)
        db.exec(`
            CREATE TABLE IF NOT EXISTS dokumente (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                nr TEXT NOT NULL,
                datum TEXT,
                status TEXT,
                netto REAL DEFAULT 0,
                steuer REAL DEFAULT 0,
                brutto REAL DEFAULT 0,
                version INTEGER DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS positionen (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dokumentId INTEGER,
                name TEXT,
                titel TEXT,
                menge REAL DEFAULT 1,
                einheit TEXT DEFAULT 'Stk.',
                preis REAL DEFAULT 0,
                in_endsumme_enthalten INTEGER DEFAULT 1,
                oz_code TEXT,
                FOREIGN KEY(dokumentId) REFERENCES dokumente(id)
            );
        `);

        // 2. GAEB Schema
        initGaebSchema(db);
        installGaebTriggersAndIndices(db);
    });

    let importId;
    let draftId;

    test('Fixtures erzeugen: Import, Items und Draft mit Preisen', () => {
        // Import anlegen
        const resImp = db.prepare(`INSERT INTO gaeb_imports (file_name, gaeb_version, exchange_phase, file_hash) VALUES ('test.x83', '3.3', 'X83', 'abc')`).run();
        importId = resImp.lastInsertRowid;

        // GAEB Items
        const insertItem = db.prepare(`INSERT INTO gaeb_items (import_id, sort_index, path_oz, item_type, short_text, menge, einheit, is_hinweistext) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

        // Position 1: 50.00 * 30 = 1500
        const id1 = insertItem.run(importId, 1, '01.01.0001', 'position', 'Wand betonieren', 30, 'm3', 0).lastInsertRowid;

        // Position 2: 100.00 * 10 = 1000
        const id2 = insertItem.run(importId, 2, '01.01.0002', 'position', 'Decke schalen', 10, 'm2', 0).lastInsertRowid;

        // Draft anlegen (Version 1)
        const resDraft = db.prepare(`INSERT INTO gaeb_tender_drafts (import_id, version, name) VALUES (?, 1, 'Draft v1')`).run(importId);
        draftId = resDraft.lastInsertRowid;

        // Preise setzen (Summe Netto: 2500)
        const insertPrice = db.prepare(`INSERT INTO gaeb_tender_item_prices (draft_id, gaeb_item_id, unit_price, in_total) VALUES (?, ?, ?, 1)`);
        insertPrice.run(draftId, id1, 50.00);
        insertPrice.run(draftId, id2, 100.00);
    });

    test('createAngebotFromDraft generiert Angebot, Positionen und setzt Links', () => {
        const res = createAngebotFromDraft(db, { importId, draftVersion: 1 });
        assert.strictEqual(res.success, true);
        assert.ok(res.angebotId > 0, 'Angebot ID muss > 0 sein');
        assert.strictEqual(res.insertedCount, 2, 'Zwei Positionen müssen eingefügt worden sein');

        // Prüfe Tabelle Dokumente
        const doc = db.prepare(`SELECT * FROM dokumente WHERE id = ?`).get(res.angebotId);
        assert.ok(doc, 'Dokument wurde erstellt');
        assert.strictEqual(doc.type, 'angebot');
        assert.strictEqual(doc.netto, 2500, 'Summe Netto muss 2500 betragen');

        // Prüfe Tabelle Positionen
        const posRows = db.prepare(`SELECT * FROM positionen WHERE dokumentId = ? ORDER BY id ASC`).all(res.angebotId);
        assert.strictEqual(posRows.length, 2);
        assert.strictEqual(posRows[0].oz_code, '01.01.0001');
        assert.strictEqual(posRows[0].preis, 50.00);
        assert.strictEqual(posRows[0].menge, 30);
        assert.strictEqual(posRows[1].oz_code, '01.01.0002');
        assert.strictEqual(posRows[1].preis, 100.00);
        assert.strictEqual(posRows[1].menge, 10);

        // Prüfe Link in gaeb_import_angebote
        const link = db.prepare(`SELECT * FROM gaeb_import_angebote WHERE import_id = ?`).get(importId);
        assert.ok(link, 'Link in gaeb_import_angebote muss existieren');
        assert.strictEqual(link.angebot_id, res.angebotId);

        // Prüfe linked_position_id in gaeb_items
        const items = db.prepare(`SELECT linked_position_id FROM gaeb_items WHERE import_id = ?`).all(importId);
        for (const item of items) {
            assert.ok(item.linked_position_id, 'linked_position_id darf nicht null sein');
        }
    });

    test('Idempotenz: Zweiter Aufruf erzeugt keine Duplikate', () => {
        const prevAngebote = db.prepare(`SELECT id FROM dokumente`).all();
        const prevPos = db.prepare(`SELECT COUNT(*) as cnt FROM positionen`).get().cnt;

        const res = createAngebotFromDraft(db, { importId, draftVersion: 1 });

        assert.strictEqual(res.insertedCount, 0, 'Sollte 0 einfügen, da alle linked_position_id gesetzt sind');
        const currPos = db.prepare(`SELECT COUNT(*) as cnt FROM positionen`).get().cnt;
        assert.strictEqual(currPos, prevPos, 'Anzahl Positionen darf nicht wachsen');
    });

    test('Löschschutz: deleteX83Import blockiert', () => {
        assert.throws(() => {
            deleteX83Import(db, importId);
        }, /Dieser Import ist mit mindestens einem Angebot verknüpft/, 'Löschen muss verboten sein');
    });

    test('teardown', () => {
        if (db) db.close();
    });
});
