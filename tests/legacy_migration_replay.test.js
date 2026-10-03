const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const schema = require('../schema.js');

test('Legacy Migration Replay Test', (t) => {
    const db = new Database(':memory:');

    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // 1. Create a legacy database (old schema)
    // Create base tables needed for migration and seed tests
    // Ensure all required columns for seed Default Data are present
    db.exec(`
        CREATE TABLE einstellungen (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE kunden (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);
        CREATE TABLE artikel (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);
        CREATE TABLE aufmass (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            projekt_position_id INTEGER,
            titel TEXT NOT NULL,
            datum TEXT DEFAULT CURRENT_TIMESTAMP,
            rechnung_id INTEGER,
            projekt_id INTEGER
        );
        CREATE TABLE positionen (id INTEGER PRIMARY KEY AUTOINCREMENT, dokumentId TEXT, artikelId TEXT);
        CREATE TABLE dokumente (id INTEGER PRIMARY KEY AUTOINCREMENT, kundeId INTEGER, nr TEXT, type TEXT, status TEXT, projektId INTEGER);
        CREATE TABLE audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT);

        CREATE TABLE zuschlagskalkulation_stamm (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            ist_standard INTEGER,
            mittellohn_eur REAL,
            lohngebundene_kosten_prozent REAL,
            lohnnebenkosten_prozent REAL,
            gemeinkosten_prozent REAL,
            wagnis_gewinn_prozent REAL,
            wug_gewinn_prozent REAL,
            wug_wagnis_prozent REAL,
            wug_betriebswagnis_prozent REAL,
            wug_leistungswagnis_prozent REAL,
            material_gemeinkosten_prozent REAL,
            kalkulationslohn_eur REAL,
            kalkulationsverfahren TEXT,
            endsumme_umlage_basis TEXT,
            endsumme_umlage_prozent REAL,
            geraete_gemeinkosten_prozent REAL,
            fremdleistung_gemeinkosten_prozent REAL,
            zuschlag_lohn_bgk REAL,
            zuschlag_lohn_agk REAL,
            zuschlag_lohn_wagnis REAL,
            zuschlag_lohn_wug REAL,
            zuschlag_stoff_bgk REAL,
            zuschlag_stoff_agk REAL,
            zuschlag_stoff_wug REAL,
            zuschlag_material_bgk REAL,
            zuschlag_material_agk REAL,
            zuschlag_material_wagnis REAL,
            zuschlag_material_wug REAL,
            zuschlag_geraet_bgk REAL,
            zuschlag_geraet_agk REAL,
            zuschlag_geraet_wagnis REAL,
            zuschlag_geraet_wug REAL,
            zuschlag_fremdleistung_bgk REAL,
            zuschlag_fremdleistung_agk REAL,
            zuschlag_fremdleistung_wagnis REAL,
            zuschlag_fremdleistung_wug REAL,
            zuschlag_sonst_bgk REAL,
            zuschlag_sonst_agk REAL,
            zuschlag_sonst_wug REAL,
            zuschlag_nu_bgk REAL,
            zuschlag_nu_agk REAL,
            zuschlag_nu_wug REAL,
            kalkulationslohn2_eur REAL,
            kalkulationslohn_beschreibung TEXT,
            kalkulationslohn2_beschreibung TEXT,
            zuschlag_lohn2_bgk REAL,
            zuschlag_lohn2_agk REAL,
            zuschlag_lohn2_wug REAL,
            skonto_abzug_kalkulation_prozent REAL
        );

        CREATE TABLE mitarbeiter (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            personalnummer TEXT,
            vorname TEXT,
            nachname TEXT,
            aktiv INTEGER,
            lohngruppe_id INTEGER,
            tarif_stundensatz REAL,
            soka_pflichtig INTEGER,
            ist_kolonnenfuehrer INTEGER
        );

        CREATE TABLE ids_connect_konten (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            grosshaendler_code TEXT,
            name TEXT,
            shop_url TEXT,
            rest_api_url TEXT,
            oci_url TEXT,
            username TEXT,
            password TEXT,
            kundennummer TEXT,
            standard_aufschlag_prozent REAL,
            letzter_sync TEXT,
            is_default INTEGER
        );

        CREATE TABLE soka_beitragssaetze (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bezeichnung TEXT,
            tarifgebiet TEXT,
            gueltig_ab TEXT,
            gueltig_bis TEXT,
            ag_anteil REAL,
            an_anteil REAL,
            ulak_prozent REAL,
            zvk_prozent REAL,
            bbv_prozent REAL,
            insolvenzgeld_prozent REAL,
            winterbau_ag_prozent REAL,
            winterbau_an_prozent REAL,
            urlaubsverguetung_prozent REAL,
            urlaubsentgelt_prozent REAL,
            mindestlohn_1 REAL,
            mindestlohn_2 REAL,
            mindesturlaub_tage INTEGER,
            schwerbehinderten_zusatzurlaub_tage INTEGER
        );

        CREATE TABLE projekte (id INTEGER PRIMARY KEY AUTOINCREMENT, source_angebot_id INTEGER, source_angebot_version INTEGER);
    `);

    // Insert legacy data
    db.exec(`
        INSERT INTO kunden (name) VALUES ('Max Mustermann');
        INSERT INTO artikel (name) VALUES ('Testartikel');
        INSERT INTO dokumente (kundeId, nr, type, status, projektId) VALUES (1, 'RE123', 'RECHNUNG', 'ENTWURF', 1);
    `);

    // 2. Run Migrations
    schema.createSchema(db);
    schema.ensureGoBDSchemaAndTriggers(db);
    schema.runMigrations(db);
    schema.seedDefaultData(db);

    // 3. Check PRAGMA foreign_key_check
    const fkCheck = db.prepare('PRAGMA foreign_key_check').all();
    assert.deepEqual(fkCheck, [], 'PRAGMA foreign_key_check should be empty');

    // 4. Verify existing example data is still intact
    const kundenData = db.prepare('SELECT name FROM kunden').all();
    assert.equal(kundenData.length, 1);
    assert.equal(kundenData[0].name, 'Max Mustermann');

    const artikelData = db.prepare('SELECT name FROM artikel').all();
    assert.equal(artikelData.length, 1);
    assert.equal(artikelData[0].name, 'Testartikel');

    // Ensure migration columns are present now
    const kundenCols = db.prepare('PRAGMA table_info("kunden")').all().map(c => c.name);
    assert.ok(kundenCols.includes('createdAt'), 'createdAt column should have been added by runMigrations');

    db.close();
});
