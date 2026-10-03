/**
 * articles_schema.js
 */

function createSchema(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS artikel (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            ean TEXT,
            beschreibung TEXT,
            ek REAL DEFAULT 0,
            vk REAL DEFAULT 0,
            mwst INTEGER DEFAULT 19,
            bestand INTEGER DEFAULT 0,
            lieferant TEXT,
            katalog TEXT,
            einheit TEXT DEFAULT 'Stk.',
            hersteller_name TEXT,
            hersteller_kontakt TEXT,
            charge_seriennummer TEXT,
            eu_verantwortlicher TEXT,
            warnhinweis TEXT
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS datanorm_kataloge (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lieferant_name TEXT NOT NULL,
            katalog_name TEXT NOT NULL,
            version TEXT DEFAULT '5',
            import_datum DATETIME DEFAULT CURRENT_TIMESTAMP,
            anzahl_artikel INTEGER DEFAULT 0,
            dateipfade_json TEXT,
            sha256_hash TEXT,
            status TEXT DEFAULT 'AKTIV' CHECK(status IN ('AKTIV', 'ARCHIVIERT'))
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS datanorm_warengruppen (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            katalog_id INTEGER REFERENCES datanorm_kataloge(id) ON DELETE CASCADE,
            hauptwarengruppe TEXT NOT NULL,
            warengruppe TEXT NOT NULL,
            bezeichnung TEXT NOT NULL,
            aufschlag_prozent REAL DEFAULT 25.0,
            UNIQUE(katalog_id, hauptwarengruppe, warengruppe)
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS datanorm_rabattgruppen (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            katalog_id INTEGER REFERENCES datanorm_kataloge(id) ON DELETE CASCADE,
            rabattgruppe TEXT NOT NULL,
            bezeichnung TEXT,
            rabatt_prozent1 REAL DEFAULT 0.0,
            rabatt_prozent2 REAL DEFAULT 0.0,
            zuschlag_prozent REAL DEFAULT 0.0,
            UNIQUE(katalog_id, rabattgruppe)
        )`);

}

module.exports = {
    createSchema
};
