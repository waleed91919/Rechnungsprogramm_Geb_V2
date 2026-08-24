/**
 * reinigungslv_schema.test.js - F3: Schema-Tabellen/Indizes + Migration lv_position_id
 * (Electron-as-Node-Wrapper-Muster, Vorbild dauerrechnung_crud.test.js)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const IS_ELECTRON_AS_NODE = !!process.versions.electron;
const RUN_INNER_MARKER = 'REINIGUNG_SCHEMA_INNER_RUN';

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
    test('Reinigungs-LV Schema (DB-Ebene, via Electron-as-Node Runtime)', () => {
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

        assert.match(stdout, /REINIGUNG_SCHEMA_DB_TESTS_PASSED/, 'Schema-Assertions müssen unter der App-Runtime bestehen');
    });
} else {
    process.env.RECHNUNGSPROGRAMM_DB_PATH = path.join(os.tmpdir(), `reinigung-schema-test-${Date.now()}-${process.pid}.sqlite`);
    const { db } = require('../db.js');

    test.after(() => {
        try { db.close(); } catch (_e) { /* ignore */ }
        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.rmSync(process.env.RECHNUNGSPROGRAMM_DB_PATH + suffix, { force: true }); } catch (_e) { /* ignore */ }
        }
    });

    test('F3-Schema: 3 Tabellen + 6 Indizes existieren; Migration lv_position_id vorhanden', () => {
        const tabellen = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
        for (const t of ['lv_bereiche', 'lv_positionen', 'putzplan_eintraege']) {
            assert.ok(tabellen.includes(t), `Tabelle ${t} muss existieren`);
        }
        const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r => r.name);
        for (const i of ['idx_lv_bereiche_objekt_name', 'idx_lv_bereiche_objekt', 'idx_lv_positionen_bereich', 'idx_putzplan_eintraege_unique', 'idx_putzplan_eintraege_objekt', 'idx_putzplan_eintraege_pos']) {
            assert.ok(idx.includes(i), `Index ${i} muss existieren`);
        }
        const cols = db.prepare('PRAGMA table_info(abrechnungsplan_positionen)').all().map(c => c.name);
        assert.ok(cols.includes('lv_position_id'), 'abrechnungsplan_positionen.lv_position_id muss existieren');
    });

    console.log('REINIGUNG_SCHEMA_DB_TESTS_PASSED');
}
