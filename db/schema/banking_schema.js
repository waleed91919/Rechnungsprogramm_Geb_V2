/**
 * banking_schema.js
 */

function createSchema(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS bank_konten (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kontoname TEXT NOT NULL,
            bankname TEXT NOT NULL,
            iban TEXT NOT NULL UNIQUE,
            bic TEXT NOT NULL,
            kontoinhaber TEXT NOT NULL,
            glaeubiger_id TEXT,
            waehrung TEXT DEFAULT 'EUR',
            aktueller_saldo REAL DEFAULT 0.0,
            saldo_datum DATE,
            ist_standard INTEGER DEFAULT 0 CHECK(ist_standard IN (0,1)),
            aktiv INTEGER DEFAULT 1 CHECK(aktiv IN (0,1)),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS bank_transaktionen (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bank_konto_id INTEGER NOT NULL,
            buchungstag DATE NOT NULL,
            valuta DATE,
            betrag REAL NOT NULL,
            waehrung TEXT DEFAULT 'EUR',
            partner_name TEXT,
            partner_iban TEXT,
            partner_bic TEXT,
            buchungstext TEXT,
            verwendungszweck TEXT,
            transaktions_code TEXT,
            gv_code TEXT,
            primanota TEXT,
            dedup_hash TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'OFFEN' CHECK(status IN ('OFFEN', 'ZUGEORDNET', 'TEILWEISE_ZUGEORDNET', 'IGNORIERT', 'MANUELL_GEBUCHT')),
            zugeordneter_betrag REAL DEFAULT 0.0,
            import_datei TEXT,
            import_format TEXT CHECK(import_format IN ('CAMT053', 'CAMT052', 'CSV_SPARKASSE', 'CSV_VOLKSBANK', 'CSV_DEUTSCHE_BANK', 'CSV_COMMERZBANK', 'CSV_GENERIC')),
            importiert_am DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (bank_konto_id) REFERENCES bank_konten(id) ON DELETE CASCADE
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS zahlung_zuordnungen (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaktion_id INTEGER NOT NULL,
            dokument_id INTEGER,
            eingangsrechnung_id INTEGER,
            betrag REAL NOT NULL CHECK(betrag > 0),
            skonto_abzug REAL DEFAULT 0.0 CHECK(skonto_abzug >= 0),
            differenz_grund TEXT CHECK(differenz_grund IN ('SKONTO', 'TEILZAHLUNG', 'KULANZ', 'GEBUEHR', 'UEBERZAHLUNG', 'SONSTIGES')),
            zugeordnet_am DATETIME DEFAULT CURRENT_TIMESTAMP,
            benutzer_notiz TEXT,
            FOREIGN KEY (transaktion_id) REFERENCES bank_transaktionen(id) ON DELETE CASCADE,
            FOREIGN KEY (dokument_id) REFERENCES dokumente(id) ON DELETE SET NULL,
            FOREIGN KEY (eingangsrechnung_id) REFERENCES eingangsrechnungen(id) ON DELETE SET NULL
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS kunden_sepa_mandate (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kunde_id INTEGER NOT NULL,
            mandatsreferenz TEXT NOT NULL UNIQUE,
            mandats_typ TEXT NOT NULL DEFAULT 'CORE' CHECK(mandats_typ IN ('CORE', 'B2B')),
            sequenz_typ TEXT NOT NULL DEFAULT 'FRST' CHECK(sequenz_typ IN ('FRST', 'RCUR', 'FNAL', 'OOFF')),
            unterschrifts_datum DATE NOT NULL,
            iban TEXT NOT NULL,
            bic TEXT NOT NULL,
            kontoinhaber TEXT NOT NULL,
            bank_name TEXT,
            status TEXT NOT NULL DEFAULT 'AKTIV' CHECK(status IN ('AKTIV', 'WIDERRUFEN', 'ABGELAUFEN', 'PAUSIERT')),
            gueltig_bis DATE,
            pre_notification_tage INTEGER DEFAULT 14 CHECK(pre_notification_tage >= 1),
            letzter_einzug_am DATE,
            letzte_lauf_nr TEXT,
            bemerkung TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (kunde_id) REFERENCES kunden(id) ON DELETE CASCADE
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS sepa_lastschrift_laeufe (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lauf_nr TEXT NOT NULL UNIQUE,
            bank_konto_id INTEGER NOT NULL,
            sammel_typ TEXT NOT NULL DEFAULT 'CORE' CHECK(sammel_typ IN ('CORE', 'B2B')),
            sequenz_typ TEXT NOT NULL DEFAULT 'RCUR' CHECK(sequenz_typ IN ('FRST', 'RCUR', 'OOFF', 'FNAL', 'MIXED')),
            ausfuehrungs_datum DATE NOT NULL,
            anzahl_transaktionen INTEGER NOT NULL DEFAULT 0,
            summe_gesamt REAL NOT NULL DEFAULT 0.0,
            xml_format TEXT NOT NULL DEFAULT 'pain.008.001.08' CHECK(xml_format IN ('pain.008.001.08', 'pain.008.001.02')),
            xml_content TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'ERSTELLT' CHECK(status IN ('ERSTELLT', 'EXPORTIERT', 'EINGEREICHT', 'STORNIERT')),
            erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
            exportiert_am DATETIME,
            FOREIGN KEY (bank_konto_id) REFERENCES bank_konten(id)
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS sepa_lastschrift_positionen (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lauf_id INTEGER NOT NULL,
            dokument_id INTEGER,
            dauerrechnung_lauf_id INTEGER,
            mandat_id INTEGER NOT NULL,
            betrag REAL NOT NULL CHECK(betrag > 0),
            verwendungszweck TEXT NOT NULL,
            end_to_end_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'EINGEREICHT' CHECK(status IN ('EINGEREICHT', 'EINGELOEST', 'RUECKLASTSCHRIFT', 'STORNIERT')),
            FOREIGN KEY (lauf_id) REFERENCES sepa_lastschrift_laeufe(id) ON DELETE CASCADE,
            FOREIGN KEY (dokument_id) REFERENCES dokumente(id) ON DELETE SET NULL,
            FOREIGN KEY (dauerrechnung_lauf_id) REFERENCES dauerrechnung_laeufe(id) ON DELETE SET NULL,
            FOREIGN KEY (mandat_id) REFERENCES kunden_sepa_mandate(id)
        )`);

}

module.exports = {
    createSchema
};
