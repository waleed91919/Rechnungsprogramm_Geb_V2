/**
 * workforce_schema.js
 */

function createSchema(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS mitarbeiter (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            personalnummer TEXT NOT NULL UNIQUE,
            vorname TEXT NOT NULL,
            nachname TEXT NOT NULL,
            lohngruppe_id TEXT NOT NULL DEFAULT 'LG1',
            tarif_stundensatz REAL NOT NULL DEFAULT 15.00,
            ist_kolonnenfuehrer INTEGER DEFAULT 0 CHECK(ist_kolonnenfuehrer IN (0,1)),
            pin_hash TEXT,
            nfc_tag_uid TEXT UNIQUE,
            telefon TEXT,
            email TEXT,
            aktiv INTEGER DEFAULT 1 CHECK(aktiv IN (0,1)),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS zeiterfassung (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            mitarbeiter_id INTEGER NOT NULL REFERENCES mitarbeiter(id) ON DELETE RESTRICT,
            projekt_id INTEGER REFERENCES projekte(id) ON DELETE SET NULL,
            liegenschaft_id INTEGER REFERENCES liegenschaften(id) ON DELETE SET NULL,
            gebaeude_id INTEGER REFERENCES gebaeude(id) ON DELETE SET NULL,
            raum_id INTEGER REFERENCES raeume(id) ON DELETE SET NULL,
            taetigkeit_typ TEXT NOT NULL DEFAULT 'PRODUKTIV' CHECK(taetigkeit_typ IN (
                'PRODUKTIV', 'RUESTZEIT', 'WEGEZEIT_FAHRER', 'WEGEZEIT_MITFAHRER', 'SCHLECHTWEWETTER', 'BEREITSCHAFT', 'REINIGUNG'
            )),
            zeit_von DATETIME NOT NULL,
            zeit_bis DATETIME,
            dauer_min INTEGER DEFAULT 0,
            pause_min INTEGER DEFAULT 0,
            qr_code_scanned INTEGER DEFAULT 0,
            geo_lat REAL,
            geo_lng REAL,
            bemerkung TEXT,
            wegezeit_eur REAL DEFAULT 0.0,
            status TEXT NOT NULL DEFAULT 'ERFASST' CHECK(status IN ('ERFASST', 'GEPRUEFT', 'FREIGEGEBEN', 'ABGERECHNET', 'STORNIERT')),
            device_id TEXT,
            sha256_hash TEXT,
            is_verspaetet INTEGER DEFAULT 0,
            status_milog TEXT DEFAULT 'PUENKTLICH',
            is_deleted INTEGER NOT NULL DEFAULT 0,
            deleted_at DATETIME,
            deleted_by TEXT,
            delete_reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS soka_beitragssaetze (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            gueltig_ab DATE NOT NULL,
            gueltig_bis DATE,
            tarifgebiet TEXT NOT NULL CHECK(tarifgebiet IN ('WEST', 'OST', 'BERLIN_WEST', 'BERLIN_OST')),
            ulak_prozent REAL NOT NULL,
            zvk_prozent REAL NOT NULL,
            bbv_prozent REAL NOT NULL,
            winterbau_ag_prozent REAL NOT NULL,
            winterbau_an_prozent REAL NOT NULL,
            urlaubsverguetung_prozent REAL NOT NULL,
            mindestlohn_1 REAL DEFAULT 14.35,
            mindestlohn_2 REAL DEFAULT 16.50,
            bezeichnung TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS soka_bau_meldungen (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            melde_monat TEXT NOT NULL,
            betriebsnummer TEXT NOT NULL,
            tarifgebiet TEXT NOT NULL DEFAULT 'WEST' CHECK(tarifgebiet IN ('WEST', 'OST', 'BERLIN_WEST', 'BERLIN_OST')),
            status TEXT NOT NULL DEFAULT 'ENTWURF' CHECK(status IN ('ENTWURF', 'VALIDIERT', 'EXPORTIERT', 'QUITTIERT')),
            anzahl_arbeitnehmer INTEGER NOT NULL DEFAULT 0,
            bruttolohn_gesamt REAL NOT NULL DEFAULT 0.0,
            beitrag_gesamt REAL NOT NULL DEFAULT 0.0,
            erstattung_gesamt REAL NOT NULL DEFAULT 0.0,
            zahlbetrag REAL NOT NULL DEFAULT 0.0,
            dta_dateipfad TEXT,
            xml_dateipfad TEXT,
            sha256_hash TEXT,
            quittungs_protokoll TEXT,
            erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
            exportiert_am DATETIME
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS soka_bau_arbeitnehmer_monat (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            meldung_id INTEGER NOT NULL REFERENCES soka_bau_meldungen(id) ON DELETE CASCADE,
            mitarbeiter_id INTEGER NOT NULL REFERENCES mitarbeiter(id) ON DELETE RESTRICT,
            an_nummer TEXT NOT NULL,
            vsnr TEXT NOT NULL,
            name TEXT NOT NULL,
            vorname TEXT NOT NULL,
            beschaeftigungstage INTEGER NOT NULL DEFAULT 30,
            geleistete_stunden REAL NOT NULL DEFAULT 0.0,
            bruttolohn REAL NOT NULL DEFAULT 0.0,
            ulak_beitrag REAL NOT NULL DEFAULT 0.0,
            zvk_beitrag REAL NOT NULL DEFAULT 0.0,
            bbv_beitrag REAL NOT NULL DEFAULT 0.0,
            winterbau_ag_beitrag REAL NOT NULL DEFAULT 0.0,
            gesamt_beitrag REAL NOT NULL DEFAULT 0.0,
            urlaub_erworben_tage REAL NOT NULL DEFAULT 0.0,
            urlaub_erworben_eur REAL NOT NULL DEFAULT 0.0,
            urlaub_genommen_tage REAL NOT NULL DEFAULT 0.0,
            urlaub_ausbezahlt_eur REAL NOT NULL DEFAULT 0.0,
            compliance_status TEXT NOT NULL DEFAULT 'VALID' CHECK(compliance_status IN ('VALID', 'WARNING', 'INVALID')),
            compliance_fehler TEXT
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS soka_bau_ausfallzeiten (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            arbeitnehmer_monat_id INTEGER NOT NULL REFERENCES soka_bau_arbeitnehmer_monat(id) ON DELETE CASCADE,
            schluessel TEXT NOT NULL,
            bezeichnung TEXT NOT NULL,
            von_datum DATE NOT NULL,
            bis_datum DATE NOT NULL,
            stunden REAL NOT NULL DEFAULT 0.0
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS kolonnen (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            polier_id INTEGER,
            aktiv INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (polier_id) REFERENCES mitarbeiter(id) ON DELETE SET NULL
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS kolonnen_mitarbeiter (
            kolonne_id INTEGER NOT NULL,
            mitarbeiter_id INTEGER NOT NULL,
            PRIMARY KEY (kolonne_id, mitarbeiter_id),
            FOREIGN KEY (kolonne_id) REFERENCES kolonnen(id) ON DELETE CASCADE,
            FOREIGN KEY (mitarbeiter_id) REFERENCES mitarbeiter(id) ON DELETE CASCADE
        )`);

}

module.exports = {
    createSchema
};
