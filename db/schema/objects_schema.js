/**
 * objects_schema.js
 */

function createSchema(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS liegenschaften (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            objekt_nr TEXT,
            name TEXT NOT NULL,
            strasse TEXT,
            plz TEXT,
            ort TEXT,
            empfaenger_kunde_id INTEGER,
            empfaenger_art TEXT CHECK(empfaenger_art IN ('EIGENTUEMER','MIETER','HAUSVERWALTUNG')),
            notizen TEXT,
            aktiv INTEGER DEFAULT 1 CHECK(aktiv IN (0,1)),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (empfaenger_kunde_id) REFERENCES kunden(id)
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS gebaeude (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            liegenschaft_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            strasse TEXT,
            plz TEXT,
            ort TEXT,
            baujahr INTEGER,
            geschosse INTEGER,
            empfaenger_kunde_id INTEGER,
            empfaenger_art TEXT CHECK(empfaenger_art IN ('EIGENTUEMER','MIETER','HAUSVERWALTUNG')),
            notizen TEXT,
            aktiv INTEGER DEFAULT 1 CHECK(aktiv IN (0,1)),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (liegenschaft_id) REFERENCES liegenschaften(id) ON DELETE CASCADE,
            FOREIGN KEY (empfaenger_kunde_id) REFERENCES kunden(id)
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS etagen (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            gebaeude_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            ebene_nummer INTEGER,
            empfaenger_kunde_id INTEGER,
            empfaenger_art TEXT CHECK(empfaenger_art IN ('EIGENTUEMER','MIETER','HAUSVERWALTUNG')),
            notizen TEXT,
            aktiv INTEGER DEFAULT 1 CHECK(aktiv IN (0,1)),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (gebaeude_id) REFERENCES gebaeude(id) ON DELETE CASCADE,
            FOREIGN KEY (empfaenger_kunde_id) REFERENCES kunden(id)
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS raeume (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            etage_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            raum_nr TEXT,
            flaeche REAL DEFAULT 0,
            einheit TEXT DEFAULT 'm²',
            raumtyp TEXT,
            bodenbelag TEXT,
            empfaenger_kunde_id INTEGER,
            empfaenger_art TEXT CHECK(empfaenger_art IN ('EIGENTUEMER','MIETER','HAUSVERWALTUNG')),
            notizen TEXT,
            aktiv INTEGER DEFAULT 1 CHECK(aktiv IN (0,1)),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (etage_id) REFERENCES etagen(id) ON DELETE CASCADE,
            FOREIGN KEY (empfaenger_kunde_id) REFERENCES kunden(id)
        )`);

}

module.exports = {
    createSchema
};
