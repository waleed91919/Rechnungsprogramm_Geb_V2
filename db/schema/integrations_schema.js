/**
 * integrations_schema.js
 */

function createSchema(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS ids_connect_konten (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            grosshaendler_code TEXT NOT NULL,
            shop_url TEXT NOT NULL,
            rest_api_url TEXT,
            kundennummer TEXT NOT NULL,
            benutzername TEXT,
            passwort_enc TEXT,
            api_key TEXT,
            standard_aufschlag_prozent REAL DEFAULT 25.0,
            is_default INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS ids_warenkoerbe (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            konto_id INTEGER REFERENCES ids_connect_konten(id) ON DELETE SET NULL,
            lieferant TEXT NOT NULL,
            cart_id TEXT NOT NULL,
            projekt_id INTEGER REFERENCES projekte(id) ON DELETE SET NULL,
            angebot_id INTEGER REFERENCES dokumente(id) ON DELETE SET NULL,
            netto_gesamt REAL NOT NULL DEFAULT 0.0,
            items_count INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL CHECK(status IN ('RECEIVED', 'IMPORTED', 'REJECTED')),
            cart_xml TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS ids_artikel_dokumente (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            artikel_id INTEGER REFERENCES artikel(id) ON DELETE CASCADE,
            warenkorb_id INTEGER REFERENCES ids_warenkoerbe(id) ON DELETE SET NULL,
            dokument_typ TEXT NOT NULL CHECK(dokument_typ IN ('SDB', 'MANUAL', 'CAD', 'CE_DOP', 'PRODUKTBLATT', 'DOC')),
            titel TEXT NOT NULL,
            url TEXT NOT NULL,
            lokaler_dateipfad TEXT,
            sha256_hash TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

}

module.exports = {
    createSchema
};
