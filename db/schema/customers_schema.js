/**
 * customers_schema.js
 */

function createSchema(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS kunden (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kundennummer TEXT,
            name TEXT NOT NULL,
            adresse TEXT,
            plz TEXT,
            ort TEXT,
            telefon TEXT,
            email TEXT,
            ustId TEXT,
            createdAt TEXT DEFAULT CURRENT_TIMESTAMP
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS subcontractor_compliance_nachweise (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kunde_id INTEGER NOT NULL REFERENCES kunden(id) ON DELETE CASCADE,
            nachweis_typ TEXT NOT NULL CHECK(nachweis_typ IN ('SOKA_BAU_UB', 'SEC48B_FINANZAMT', 'BG_BAU_UB', 'BUERGSCHAFT')),
            zertifikatsnummer TEXT,
            aussteller TEXT NOT NULL,
            gueltig_von DATE NOT NULL,
            gueltig_bis DATE NOT NULL,
            status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'EXPIRED', 'REVOKED')),
            dokument_dateipfad TEXT,
            bemerkung TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

}

module.exports = {
    createSchema
};
