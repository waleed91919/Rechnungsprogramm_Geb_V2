/**
 * measurement_schema.js
 */

function createSchema(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS aufmass (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            projekt_position_id INTEGER REFERENCES projekt_positionen(id) ON DELETE RESTRICT,
            position_id TEXT,
            titel TEXT NOT NULL,
            datum TEXT DEFAULT CURRENT_TIMESTAMP,
            rechnung_id INTEGER,
            projekt_id INTEGER,
            bemerkung TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (rechnung_id) REFERENCES dokumente(id) ON DELETE SET NULL,
            FOREIGN KEY (projekt_id) REFERENCES projekte(id) ON DELETE SET NULL
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS aufmass_positionen (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            aufmass_id INTEGER NOT NULL,
            raum TEXT,
            bezeichnung TEXT NOT NULL,
            formel TEXT NOT NULL,
            ergebnis REAL DEFAULT 0,
            einheit TEXT DEFAULT 'm²',
            sortier_index INTEGER DEFAULT 0,
            FOREIGN KEY (aufmass_id) REFERENCES aufmass(id) ON DELETE CASCADE
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS aufmass_blaetter (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            invoice_id INTEGER,
            blatt_nummer TEXT NOT NULL,
            titel TEXT NOT NULL,
            status TEXT DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'SUBMITTED', 'VERIFIED', 'FINALIZED')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projekte(id),
            FOREIGN KEY (invoice_id) REFERENCES dokumente(id)
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS aufmass_zeilen (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT UNIQUE,
            blatt_id INTEGER NOT NULL,
            oz_code TEXT NOT NULL,
            zeilen_nr INTEGER NOT NULL,
            bezeichnung TEXT,
            formel_reb TEXT DEFAULT '91',
            rechenansatz TEXT NOT NULL,
            ergebnis REAL NOT NULL,
            einheit TEXT NOT NULL DEFAULT 'm²',
            vorzeichen INTEGER DEFAULT 1,
            FOREIGN KEY (blatt_id) REFERENCES aufmass_blaetter(id) ON DELETE CASCADE
        )`);

}

module.exports = {
    createSchema
};
