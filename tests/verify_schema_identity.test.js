const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

// Pfad als Konstante am Dateianfang, aktuell zeigt sie auf ./schema.js
const NEW_SCHEMA_PATH = '../schema.js';
const OLD_SCHEMA_PATH = '../schema.js';

function getHash(data) {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function initDb(db, schemaModule) {
    schemaModule.createSchema(db);
    schemaModule.ensureGoBDSchemaAndTriggers(db);
    schemaModule.runMigrations(db);
    schemaModule.seedDefaultData(db);
}

test('Schema Identity Test: Old vs New Module', (t) => {
    const oldSchema = require(OLD_SCHEMA_PATH);
    const newSchema = require(NEW_SCHEMA_PATH);

    const dbOld = new Database(':memory:');
    const dbNew = new Database(':memory:');

    // Enable same pragmas as main app
    [dbOld, dbNew].forEach(db => {
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
    });

    initDb(dbOld, oldSchema);
    initDb(dbNew, newSchema);

    // 1. Compare sqlite_master
    const getMaster = (db) => db.prepare("SELECT name, type, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const masterOld = getMaster(dbOld);
    const masterNew = getMaster(dbNew);

    assert.deepEqual(masterNew, masterOld, 'sqlite_master (tables, indexes, triggers) should be identical');

    // Snapshot Info
    const tablesCount = masterOld.filter(m => m.type === 'table').length;
    const indexesCount = masterOld.filter(m => m.type === 'index').length;
    const triggersCount = masterOld.filter(m => m.type === 'trigger').length;
    console.log(`Snapshot: ${tablesCount} Tables, ${indexesCount} Indexes, ${triggersCount} Triggers`);

    // Get all tables
    const tables = masterOld.filter(m => m.type === 'table').map(t => t.name);

    for (const table of tables) {
        // 2. PRAGMA table_info
        const getTableInfo = (db) => db.prepare(`PRAGMA table_info("${table}")`).all();
        assert.deepEqual(getTableInfo(dbNew), getTableInfo(dbOld), `Table info for ${table} should match`);

        // 3. PRAGMA foreign_key_list
        const getFkList = (db) => db.prepare(`PRAGMA foreign_key_list("${table}")`).all();
        assert.deepEqual(getFkList(dbNew), getFkList(dbOld), `Foreign keys for ${table} should match`);

        // 4. PRAGMA index_list
        const getIndexList = (db) => db.prepare(`PRAGMA index_list("${table}")`).all();
        assert.deepEqual(getIndexList(dbNew), getIndexList(dbOld), `Indexes for ${table} should match`);
    }

    // 5. Hash of Seed Tables
    const seedTables = ['einstellungen', 'zuschlagskalkulation_stamm', 'mitarbeiter', 'ids_connect_konten', 'soka_beitragssaetze'];
    for (const table of seedTables) {
        if (!tables.includes(table)) continue;
        const getData = (db) => db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all().map(row => {
            const r = { ...row };
            delete r.created_at;
            delete r.updated_at;
            return r;
        });

        const dataOld = getData(dbOld);
        const dataNew = getData(dbNew);

        assert.equal(getHash(dataNew), getHash(dataOld), `Seed data hash for ${table} should match`);
    }

    dbOld.close();
    dbNew.close();
});
