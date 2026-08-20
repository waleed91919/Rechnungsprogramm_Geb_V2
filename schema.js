/**
 * schema.js - Database Schema Definition, Migrations & Default Seeding
 */

function createSchema(db) {
    // Create tables if they do not exist
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
        katalog TEXT
    )`);

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

    db.exec(`CREATE TABLE IF NOT EXISTS dokumente (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL, -- 'rechnung' or 'angebot'
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
        eingabemodus TEXT DEFAULT 'netto'
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
        FOREIGN KEY(dokumentId) REFERENCES dokumente(id)
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS aufmass (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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

    db.exec(`CREATE TABLE IF NOT EXISTS rechnung_verrechnungen (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        aktuelle_rechnung_id INTEGER,
        vorherige_rechnung_id INTEGER,
        abzugsbetrag_netto REAL DEFAULT 0,
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

    db.exec(`CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        previous_hash TEXT,
        current_hash TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        details TEXT
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS projekte (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        kundeId INTEGER,
        start TEXT,
        ende TEXT,
        budget REAL DEFAULT 0,
        status TEXT
    )`);

    // 1. Aufmaßblätter & Zeilen (REB 23.003 & DA11)
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

    // 2. Nachtragsverwaltung (VOB/B)
    db.exec(`CREATE TABLE IF NOT EXISTS nachtraege (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        nachtrag_nr TEXT NOT NULL,
        titel TEXT NOT NULL,
        beschreibung TEXT,
        rechtsgrundlage TEXT DEFAULT 'VOB_2_6' CHECK(rechtsgrundlage IN ('VOB_2_5', 'VOB_2_6', 'VOB_2_3', 'BGB_650b')),
        summe_netto REAL DEFAULT 0.0,
        summe_brutto REAL DEFAULT 0.0,
        status TEXT DEFAULT 'EINGEREICHT' CHECK(status IN ('ENTWURF', 'EINGEREICHT', 'IN_VERHANDLUNG', 'GENEHMIGT', 'ABGELEHNT')),
        eingereicht_am DATE,
        entschieden_am DATE,
        begruendung TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projekte(id)
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS nachtrag_positionen (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nachtrag_id INTEGER NOT NULL,
        oz_code TEXT,
        kurztext TEXT NOT NULL,
        langtext TEXT,
        menge REAL NOT NULL,
        einheit TEXT NOT NULL,
        einheitspreis REAL NOT NULL,
        gesamtpreis REAL NOT NULL,
        cost_type TEXT DEFAULT 'MATERIAL' CHECK(cost_type IN ('LOHN', 'MATERIAL', 'GERÄT', 'FAHRT')),
        FOREIGN KEY (nachtrag_id) REFERENCES nachtraege(id) ON DELETE CASCADE
    )`);

    // 3. Bautagebuch
    db.exec(`CREATE TABLE IF NOT EXISTS bautagebuch (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        bericht_nr INTEGER,
        datum DATE NOT NULL,
        wetter TEXT,
        temperatur_min REAL,
        temperatur_max REAL,
        personal_eigen_anzahl INTEGER DEFAULT 0,
        personal_eigen_stunden REAL DEFAULT 0.0,
        personal_sub_json TEXT,
        geraete_json TEXT,
        tagesbericht TEXT NOT NULL,
        vorkommnisse_behinderungen TEXT,
        unterzeichnet_bauleiter INTEGER DEFAULT 0,
        fotos_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projekte(id)
    )`);

    // 4. Abnahmeprotokolle (VOB/B § 12)
    db.exec(`CREATE TABLE IF NOT EXISTS abnahmeprotokolle (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        datum DATE NOT NULL,
        ort TEXT NOT NULL,
        auftraggeber_vertreter TEXT NOT NULL,
        auftragnehmer_vertreter TEXT NOT NULL,
        abnahme_status TEXT NOT NULL CHECK(abnahme_status IN ('OHNE_VORBEHALT', 'MIT_VORBEHALT', 'VERWEIGERT')),
        gewaehrleistung_beginn DATE NOT NULL,
        gewaehrleistung_ende DATE NOT NULL,
        gewaehrleistung_jahre INTEGER DEFAULT 4,
        sicherheitseinbehalt_prozent REAL DEFAULT 5.0,
        maengel_json TEXT,
        unterschrift_ag_data TEXT,
        unterschrift_an_data TEXT,
        pdf_pfad TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projekte(id)
    )`);

    // 5. Eingangsrechnungen & Controlling
    db.exec(`CREATE TABLE IF NOT EXISTS eingangsrechnungen (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        lieferant_id INTEGER,
        rechnungs_nr TEXT NOT NULL,
        rechnungs_datum DATE NOT NULL,
        faelligkeits_datum DATE NOT NULL,
        betrag_netto REAL NOT NULL,
        steuersatz REAL DEFAULT 19.0,
        betrag_ust REAL NOT NULL,
        betrag_brutto REAL NOT NULL,
        kostenart TEXT NOT NULL CHECK(kostenart IN ('MATERIAL', 'SUBCONTRACTOR', 'EQUIPMENT', 'OTHER', 'LOHN')),
        sec48b_geprueft INTEGER DEFAULT 0,
        bauabzugsteuer_einbehalten REAL DEFAULT 0.0,
        zahlungs_status TEXT DEFAULT 'OFFEN' CHECK(zahlungs_status IN ('OFFEN', 'TEILWEISE', 'BEZAHLT')),
        bezahlt_am DATE,
        beleg_pfad TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projekte(id),
        FOREIGN KEY (lieferant_id) REFERENCES kunden(id)
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS einstellungen (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);
}

function runMigrations(db) {
    try {
        db.exec(`ALTER TABLE kunden ADD COLUMN createdAt TEXT`);
    } catch (e) {
        if (!e.message.includes('duplicate column')) {
            console.warn('[DB Migration Warning]:', e.message);
        }
    }

    try {
        db.exec(`ALTER TABLE aufmass ADD COLUMN position_id TEXT`);
    } catch (e) {
        if (!e.message.includes('duplicate column')) {
            console.warn('[DB Migration Warning]:', e.message);
        }
    }

    try {
        db.exec(`ALTER TABLE aufmass ADD COLUMN einheit TEXT`);
    } catch (e) {
        if (!e.message.includes('duplicate column')) {
            console.warn('[DB Migration Warning]:', e.message);
        }
    }

    try {
        db.exec(`ALTER TABLE positionen ADD COLUMN ek REAL DEFAULT 0`);
    } catch (e) {
        if (!e.message.includes('duplicate column')) {
            console.warn('[DB Migration Warning]:', e.message);
        }
    }

    try {
        db.exec(`ALTER TABLE positionen ADD COLUMN einheit TEXT DEFAULT 'Stk.'`);
    } catch (e) {
        if (!e.message.includes('duplicate column')) {
            console.warn('[DB Migration Warning]:', e.message);
        }
    }

    try {
        db.exec(`ALTER TABLE positionen ADD COLUMN name TEXT`);
    } catch (e) {
        if (!e.message.includes('duplicate column')) {
            console.warn('[DB Migration Warning]:', e.message);
        }
    }

    try {
        db.exec(`ALTER TABLE dokumente ADD COLUMN mahnungLevel INTEGER DEFAULT 0`);
    } catch (e) {
        if (!e.message.includes('duplicate column')) {
            console.warn('[DB Migration Warning]:', e.message);
        }
    }

    try {
        db.exec(`ALTER TABLE dokumente ADD COLUMN mahnungDatum TEXT`);
    } catch (e) {
        if (!e.message.includes('duplicate column')) {
            console.warn('[DB Migration Warning]:', e.message);
        }
    }

    try {
        db.exec(`ALTER TABLE dokumente ADD COLUMN mahnungGebuehr REAL DEFAULT 0`);
    } catch (e) {
        if (!e.message.includes('duplicate column')) {
            console.warn('[DB Migration Warning]:', e.message);
        }
    }

    try {
        db.exec(`ALTER TABLE dokumente ADD COLUMN globalRabattType TEXT DEFAULT '%'`);
    } catch (e) {
        if (!e.message.includes('duplicate column')) {
            console.warn('[DB Migration Warning]:', e.message);
        }
    }

    try {
        db.exec(`ALTER TABLE dokumente ADD COLUMN globalRabattValue REAL DEFAULT 0`);
    } catch (e) {
        if (!e.message.includes('duplicate column')) {
            console.warn('[DB Migration Warning]:', e.message);
        }
    }

    try {
        db.exec(`ALTER TABLE dokumente ADD COLUMN eingabemodus TEXT DEFAULT 'netto'`);
    } catch (e) {
        if (!e.message.includes('duplicate column')) {
            console.warn('[DB Migration Warning]:', e.message);
        }
    }

    // --- Artikel Erweiterungen ---
    try { db.exec(`ALTER TABLE artikel ADD COLUMN ist_bauleistung INTEGER DEFAULT 0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE artikel ADD COLUMN kostenart TEXT DEFAULT 'MATERIAL'`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE artikel ADD COLUMN lohnanteil_prozent REAL DEFAULT 0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }

    // --- Kunden Erweiterungen ---
    try { db.exec(`ALTER TABLE kunden ADD COLUMN ist_bauleistender_13b INTEGER DEFAULT 0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE kunden ADD COLUMN ust_1_tg_gueltig_bis TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE kunden ADD COLUMN hat_freistellungsbescheinigung INTEGER DEFAULT 0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE kunden ADD COLUMN freistellung_gueltig_bis TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE kunden ADD COLUMN ist_umsatzsteuerfreie_vermietung INTEGER DEFAULT 0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE kunden ADD COLUMN customer_type TEXT DEFAULT 'B2C'`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE kunden ADD COLUMN leitweg_id TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE kunden ADD COLUMN peppol_id TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE kunden ADD COLUMN buyer_reference TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE kunden ADD COLUMN tax_number TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE kunden ADD COLUMN sec48b_status TEXT DEFAULT 'NONE'`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE kunden ADD COLUMN sec48b_certificate_path TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }

    // --- Dokumente Erweiterungen ---
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN vortext TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN fusstext TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN leistungszeitraum_von TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN leistungszeitraum_bis TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN baustellen_adresse TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN vob_vereinbart INTEGER DEFAULT 0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN ist_privatkunde INTEGER DEFAULT 0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN unterliegt_bauabzugsteuer INTEGER DEFAULT 0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN unterliegt_13b INTEGER DEFAULT 0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE positionen ADD COLUMN is13b INTEGER DEFAULT 0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN bauabzugsteuer_betrag REAL DEFAULT 0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN ausweis_35a_erforderlich INTEGER DEFAULT 0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN summe_lohnkosten_brutto REAL DEFAULT 0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN rechnungsart TEXT DEFAULT 'REGULAER'`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN kumulierte_leistung_netto REAL DEFAULT 0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN sicherheitseinbehalt REAL DEFAULT 0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN leitweg_id TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN buyer_reference TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN sha256_hash TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }

    // --- Positionen Erweiterungen ---
    try { db.exec(`ALTER TABLE positionen ADD COLUMN steuer_schluessel INTEGER`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE positionen ADD COLUMN cost_type TEXT DEFAULT 'MATERIAL'`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE positionen ADD COLUMN oz_code TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE positionen ADD COLUMN is_tax_deductible_35a INTEGER DEFAULT 0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }

    // --- Projekte Erweiterungen ---
    try { db.exec(`ALTER TABLE projekte ADD COLUMN sicherheitseinbehalt_prozent REAL DEFAULT 0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE projekte ADD COLUMN gaeb_phase TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE projekte ADD COLUMN hoai_vob_flag TEXT DEFAULT 'VOB'`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
}

function seedDefaultData(db) {
    // Settings defaults if empty
    const stmt = db.prepare('SELECT COUNT(*) as cnt FROM einstellungen');
    const row = stmt.get();

    if (row.cnt === 0) {
        const defaults = {
            firmenname: 'W-LINK ERP',
            logo: '',
            bankname: 'Volksbank Musterstadt',
            steuer: 'DE999888777',
            iban: 'DE89 3704 0044 0532 0130 00',
            bic: 'COBADEFFXXX',
            mahngebuehr: '5.00',
            manuelleRechnungsnummer: 'false'
        };
        const insertStmt = db.prepare('INSERT INTO einstellungen (key, value) VALUES (?, ?)');
        const insertTransaction = db.transaction((defs) => {
            for (const [k, v] of Object.entries(defs)) {
                insertStmt.run(k, v);
            }
        });
        insertTransaction(defaults);
    }
}

module.exports = {
    createSchema,
    runMigrations,
    seedDefaultData
};
