/**
 * documents_schema.js
 */

function createSchema(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS dokumente (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL, -- 'rechnung', 'angebot', 'auftrag' or 'lieferschein'
            nr TEXT NOT NULL,
            datum TEXT,
            faellig TEXT,
            kundeId INTEGER,
            projektId INTEGER,
            status TEXT,
            isLocked INTEGER DEFAULT 0,
            netto REAL DEFAULT 0,
            steuer REAL DEFAULT 0,
            brutto REAL DEFAULT 0,
            globalRabattAbzug REAL DEFAULT 0,
            globalRabattType TEXT DEFAULT '%',
            globalRabattValue REAL DEFAULT 0,
            anzahlung REAL DEFAULT 0,
            mahnungLevel INTEGER DEFAULT 0,
            mahnungDatum TEXT,
            mahnungGebuehr REAL DEFAULT 0,
            eingabemodus TEXT DEFAULT 'netto',
            zahlbetrag REAL DEFAULT 0,
            version INTEGER DEFAULT 1,
            parent_angebot_id INTEGER,
            angebot_status TEXT DEFAULT 'ENTWURF',
            freeze_snapshot_json TEXT,
            auftraggeber_typ TEXT DEFAULT 'PRIVAT',
            vergabe_verfahren TEXT DEFAULT 'DIREKT',
            vertragsgrundlage TEXT DEFAULT 'BGB_WERKVERTRAG',
            angenommen_am TEXT,
            angenommene_version INTEGER,
            FOREIGN KEY(kundeId) REFERENCES kunden(id),
            FOREIGN KEY(projektId) REFERENCES projekte(id),
            FOREIGN KEY(parent_angebot_id) REFERENCES dokumente(id)
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS positionen (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dokumentId INTEGER,
            artikelId INTEGER,
            name TEXT, -- Added for custom items
            menge REAL DEFAULT 1,
            einheit TEXT DEFAULT 'Stk.',
            preis REAL DEFAULT 0,
            ek REAL DEFAULT 0, -- Purchase price snapshot
            mwst INTEGER DEFAULT 19,
            rabatt REAL DEFAULT 0,
            titel TEXT,
            positionstyp TEXT DEFAULT 'NORMAL',
            in_endsumme_enthalten INTEGER DEFAULT 1,
            bieterangabe_wert TEXT,
            lieferschein_quelle TEXT,
            FOREIGN KEY(dokumentId) REFERENCES dokumente(id),
            FOREIGN KEY(artikelId) REFERENCES artikel(id)
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS rechnung_verrechnungen (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            aktuelle_rechnung_id INTEGER,
            vorherige_rechnung_id INTEGER,
            abzugsbetrag_netto REAL DEFAULT 0,
            abzugsbetrag_brutto REAL DEFAULT 0,
            FOREIGN KEY(aktuelle_rechnung_id) REFERENCES dokumente(id),
            FOREIGN KEY(vorherige_rechnung_id) REFERENCES dokumente(id)
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS invoice_cumulative_states (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            invoice_id INTEGER NOT NULL UNIQUE,
            sequence_number INTEGER NOT NULL,
            billing_type TEXT NOT NULL CHECK(billing_type IN ('ADVANCE', 'PARTIAL_FINAL', 'FINAL')),
            total_performance_net REAL NOT NULL,
            total_performance_vat REAL NOT NULL,
            total_previous_billed_net REAL NOT NULL,
            total_previous_billed_vat REAL NOT NULL,
            current_period_net REAL NOT NULL,
            current_period_vat REAL NOT NULL,
            security_retention_rate REAL DEFAULT 5.0,
            security_retention_amount REAL DEFAULT 0.0,
            net_payable_amount REAL NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projekte(id),
            FOREIGN KEY (invoice_id) REFERENCES dokumente(id)
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS security_retentions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            invoice_id INTEGER NOT NULL,
            retention_type TEXT CHECK(retention_type IN ('EXECUTION', 'WARRANTY')),
            amount REAL NOT NULL,
            due_date DATE NOT NULL,
            status TEXT DEFAULT 'HELD' CHECK(status IN ('HELD', 'RELEASED', 'GUARANTEE_SUBSTITUTED')),
            guarantee_document_ref TEXT,
            FOREIGN KEY (project_id) REFERENCES projekte(id),
            FOREIGN KEY (invoice_id) REFERENCES dokumente(id)
        )`);

}

module.exports = {
    createSchema
};
