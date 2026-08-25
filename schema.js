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
        eingabemodus TEXT DEFAULT 'netto',
        FOREIGN KEY(kundeId) REFERENCES kunden(id),
        FOREIGN KEY(projektId) REFERENCES projekte(id)
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
        FOREIGN KEY(dokumentId) REFERENCES dokumente(id),
        FOREIGN KEY(artikelId) REFERENCES artikel(id)
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

    // --- Objektverwaltung (F1): Liegenschaft -> Gebäude -> Etage -> Raum/Fläche ---
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
        empfaenger_kunde_id INTEGER,
        empfaenger_art TEXT CHECK(empfaenger_art IN ('EIGENTUEMER','MIETER','HAUSVERWALTUNG')),
        notizen TEXT,
        aktiv INTEGER DEFAULT 1 CHECK(aktiv IN (0,1)),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (etage_id) REFERENCES etagen(id) ON DELETE CASCADE,
        FOREIGN KEY (empfaenger_kunde_id) REFERENCES kunden(id)
    )`);

    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_liegenschaften_kunde ON liegenschaften(empfaenger_kunde_id)`); } catch (e) { console.error('[DB Schema] Index idx_liegenschaften_kunde:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_gebaeude_liegenschaft ON gebaeude(liegenschaft_id)`); } catch (e) { console.error('[DB Schema] Index idx_gebaeude_liegenschaft:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_gebaeude_kunde ON gebaeude(empfaenger_kunde_id)`); } catch (e) { console.error('[DB Schema] Index idx_gebaeude_kunde:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_etagen_gebaeude ON etagen(gebaeude_id)`); } catch (e) { console.error('[DB Schema] Index idx_etagen_gebaeude:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_etagen_kunde ON etagen(empfaenger_kunde_id)`); } catch (e) { console.error('[DB Schema] Index idx_etagen_kunde:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_raeume_etage ON raeume(etage_id)`); } catch (e) { console.error('[DB Schema] Index idx_raeume_etage:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_raeume_kunde ON raeume(empfaenger_kunde_id)`); } catch (e) { console.error('[DB Schema] Index idx_raeume_kunde:', e.message); }

    // --- Dauerrechnungen F2: Tabellen abrechnungsplaene / abrechnungsplan_positionen / dauerrechnung_laeufe ---
    db.exec(`CREATE TABLE IF NOT EXISTS abrechnungsplaene (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        objekt_typ TEXT NOT NULL CHECK(objekt_typ IN ('LIEGENSCHAFT','GEBAEUDE','ETAGE','RAUM')),
        objekt_id INTEGER NOT NULL,
        empfaenger_kunde_id INTEGER NOT NULL,
        rhythmus TEXT NOT NULL CHECK(rhythmus IN ('MONATLICH','QUARTALSWEISE','JAEHRLICH','WOCHEN_INTERVALL')),
        intervall_wochen INTEGER CHECK(intervall_wochen IS NULL OR intervall_wochen >= 1),
        abrechnungstag INTEGER DEFAULT 1 CHECK(abrechnungstag BETWEEN 1 AND 31),
        abrechnungsmonat INTEGER CHECK(abrechnungsmonat IS NULL OR abrechnungsmonat BETWEEN 1 AND 12),
        abrechnungs_modus TEXT NOT NULL DEFAULT 'NACHTRAEGLICH' CHECK(abrechnungs_modus IN ('NACHTRAEGLICH','VORAUS')),
        start_datum TEXT NOT NULL,
        ende_datum TEXT,
        preis_modus TEXT NOT NULL DEFAULT 'PAUSCHALE' CHECK(preis_modus IN ('PAUSCHALE','POSITIONEN')),
        preise_live INTEGER DEFAULT 0 CHECK(preise_live IN (0,1)),
        pauschale_netto REAL DEFAULT 0,
        mwst_satz INTEGER DEFAULT 19 CHECK(mwst_satz IN (0,7,19)),
        zahlungsziel_tage INTEGER DEFAULT 14,
        als_entwurf INTEGER DEFAULT 1 CHECK(als_entwurf IN (0,1)),
        naechste_lauf_am TEXT,
        letzte_lauf_am TEXT,
        aktiv INTEGER DEFAULT 1 CHECK(aktiv IN (0,1)),
        bemerkung TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (empfaenger_kunde_id) REFERENCES kunden(id)
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS abrechnungsplan_positionen (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id INTEGER NOT NULL,
        artikelId INTEGER,
        name TEXT CHECK(artikelId IS NOT NULL OR (name IS NOT NULL AND TRIM(name) <> '')),
        menge REAL DEFAULT 1,
        einheit TEXT DEFAULT 'Stk.',
        preis REAL DEFAULT 0,
        mwst INTEGER DEFAULT 19,
        sortier_index INTEGER DEFAULT 0,
        FOREIGN KEY (plan_id) REFERENCES abrechnungsplaene(id) ON DELETE CASCADE,
        FOREIGN KEY (artikelId) REFERENCES artikel(id)
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS dauerrechnung_laeufe (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id INTEGER NOT NULL,
        periode_von TEXT NOT NULL,
        periode_bis TEXT NOT NULL,
        rechnungs_datum TEXT NOT NULL,
        faellig_am TEXT,
        status TEXT NOT NULL DEFAULT 'ERSTELLT' CHECK(status IN ('ERSTELLT','STORNIERT')),
        dokument_id INTEGER,
        erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
        storno_grund TEXT,
        FOREIGN KEY (plan_id) REFERENCES abrechnungsplaene(id),
        FOREIGN KEY (dokument_id) REFERENCES dokumente(id)
    )`);

    try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_abrechnungsplaene_objekt_name ON abrechnungsplaene(objekt_typ, objekt_id, name)`); } catch (e) { console.error('[DB Schema] Index idx_abrechnungsplaene_objekt_name:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_abrechnungsplaene_empfaenger ON abrechnungsplaene(empfaenger_kunde_id)`); } catch (e) { console.error('[DB Schema] Index idx_abrechnungsplaene_empfaenger:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_abrechnungsplaene_faellig ON abrechnungsplaene(aktiv, naechste_lauf_am)`); } catch (e) { console.error('[DB Schema] Index idx_abrechnungsplaene_faellig:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_plan_positionen_plan ON abrechnungsplan_positionen(plan_id)`); } catch (e) { console.error('[DB Schema] Index idx_plan_positionen_plan:', e.message); }
    try {
        db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_laeufe_plan_periode_unique
            ON dauerrechnung_laeufe(plan_id, periode_von, periode_bis)
            WHERE status = 'ERSTELLT'`);
    } catch (e) { console.error('[DB Schema] Index idx_laeufe_plan_periode_unique:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_laeufe_dokument ON dauerrechnung_laeufe(dokument_id)`); } catch (e) { console.error('[DB Schema] Index idx_laeufe_dokument:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_laeufe_plan ON dauerrechnung_laeufe(plan_id)`); } catch (e) { console.error('[DB Schema] Index idx_laeufe_plan:', e.message); }

    // --- Putzplan/Reinigungs-LV (F3) ---
    db.exec(`CREATE TABLE IF NOT EXISTS lv_bereiche (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        objekt_typ TEXT NOT NULL CHECK(objekt_typ IN ('LIEGENSCHAFT','GEBAEUDE','ETAGE','RAUM')),
        objekt_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        positionsnr_prefix TEXT,
        sortier_index INTEGER DEFAULT 0,
        notizen TEXT,
        aktiv INTEGER DEFAULT 1 CHECK(aktiv IN (0,1)),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS lv_positionen (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bereich_id INTEGER NOT NULL,
        positionsnr TEXT,
        bezeichnung TEXT NOT NULL,
        beschreibung TEXT,
        menge REAL DEFAULT 0,
        menge_einheit TEXT DEFAULT 'm²',
        turnus_typ TEXT NOT NULL DEFAULT 'X_PRO_WOCHE' CHECK(turnus_typ IN ('X_PRO_WOCHE','ALLE_X_TAGE','X_PRO_MONAT','JAEHRLICH')),
        turnus_wert REAL NOT NULL DEFAULT 1 CHECK(turnus_wert > 0),
        zeitbedarf_min_je_einheit REAL DEFAULT 0 CHECK(zeitbedarf_min_je_einheit >= 0),
        kalk_stundensatz REAL DEFAULT 0 CHECK(kalk_stundensatz >= 0),
        zuschlaege_json TEXT,
        mwst INTEGER DEFAULT 19 CHECK(mwst IN (0,7,19)),
        notizen TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bereich_id) REFERENCES lv_bereiche(id) ON DELETE CASCADE
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS putzplan_eintraege (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        position_id INTEGER NOT NULL,
        objekt_typ TEXT NOT NULL CHECK(objekt_typ IN ('LIEGENSCHAFT','GEBAEUDE','ETAGE','RAUM')),
        objekt_id INTEGER NOT NULL,
        menge_override REAL CHECK(menge_override IS NULL OR menge_override >= 0),
        turnus_typ TEXT NOT NULL DEFAULT 'X_PRO_WOCHE' CHECK(turnus_typ IN ('X_PRO_WOCHE','ALLE_X_TAGE','X_PRO_MONAT','JAEHRLICH')),
        turnus_wert REAL NOT NULL DEFAULT 1 CHECK(turnus_wert > 0),
        notizen TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (position_id) REFERENCES lv_positionen(id) ON DELETE CASCADE
    )`);

    try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_lv_bereiche_objekt_name ON lv_bereiche(objekt_typ, objekt_id, name)`); } catch (e) { console.error('[DB Schema] Index idx_lv_bereiche_objekt_name:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_lv_bereiche_objekt ON lv_bereiche(objekt_typ, objekt_id)`); } catch (e) { console.error('[DB Schema] Index idx_lv_bereiche_objekt:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_lv_positionen_bereich ON lv_positionen(bereich_id)`); } catch (e) { console.error('[DB Schema] Index idx_lv_positionen_bereich:', e.message); }
    try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_putzplan_eintraege_unique ON putzplan_eintraege(position_id, objekt_typ, objekt_id)`); } catch (e) { console.error('[DB Schema] Index idx_putzplan_eintraege_unique:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_putzplan_eintraege_objekt ON putzplan_eintraege(objekt_typ, objekt_id)`); } catch (e) { console.error('[DB Schema] Index idx_putzplan_eintraege_objekt:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_putzplan_eintraege_pos ON putzplan_eintraege(position_id)`); } catch (e) { console.error('[DB Schema] Index idx_putzplan_eintraege_pos:', e.message); }

    // --- E-Mail-Versand (F10) ---
    db.exec(`CREATE TABLE IF NOT EXISTS email_versandhistorie (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        beleg_typ TEXT NOT NULL CHECK(beleg_typ IN ('RECHNUNG','ANGEBOT','MAHNUNG')),
        beleg_id INTEGER NOT NULL,
        mahnstufe INTEGER CHECK(mahnstufe IS NULL OR mahnstufe BETWEEN 1 AND 3),
        empfaenger TEXT NOT NULL,
        cc TEXT,
        bcc TEXT,
        betreff TEXT NOT NULL,
        nachricht_text TEXT,
        status TEXT NOT NULL DEFAULT 'VERSANDT' CHECK(status IN ('VERSANDT','FEHLGESCHLAGEN')),
        versuche INTEGER NOT NULL DEFAULT 1 CHECK(versuche >= 1),
        fehlermeldung TEXT,
        message_id TEXT,
        smtp_response TEXT,
        smtp_konto_name TEXT,
        pdf_dateiname TEXT,
        pdf_sha256 TEXT,
        pdf_pfad TEXT,
        gesendet_am DATETIME,
        erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_email_historie_beleg ON email_versandhistorie(beleg_typ, beleg_id)`); } catch (e) { console.error('[DB Schema] Index idx_email_historie_beleg:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_email_historie_status ON email_versandhistorie(status, gesendet_am)`); } catch (e) { console.error('[DB Schema] Index idx_email_historie_status:', e.message); }

    // --- Bankkonten, Transaktionen, OPOS-Matching & SEPA (F11) ---
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

    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_bank_konten_iban ON bank_konten(iban)`); } catch (e) { console.error('[DB Schema] Index idx_bank_konten_iban:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_bank_konten_aktiv ON bank_konten(aktiv)`); } catch (e) { console.error('[DB Schema] Index idx_bank_konten_aktiv:', e.message); }

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

    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_transaktionen_konto_datum ON bank_transaktionen(bank_konto_id, buchungstag)`); } catch (e) { console.error('[DB Schema] Index idx_transaktionen_konto_datum:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_transaktionen_status ON bank_transaktionen(status)`); } catch (e) { console.error('[DB Schema] Index idx_transaktionen_status:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_transaktionen_hash ON bank_transaktionen(dedup_hash)`); } catch (e) { console.error('[DB Schema] Index idx_transaktionen_hash:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_transaktionen_partner_iban ON bank_transaktionen(partner_iban)`); } catch (e) { console.error('[DB Schema] Index idx_transaktionen_partner_iban:', e.message); }

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

    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_zuordnungen_transaktion ON zahlung_zuordnungen(transaktion_id)`); } catch (e) { console.error('[DB Schema] Index idx_zuordnungen_transaktion:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_zuordnungen_dokument ON zahlung_zuordnungen(dokument_id)`); } catch (e) { console.error('[DB Schema] Index idx_zuordnungen_dokument:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_zuordnungen_eingangsrechnung ON zahlung_zuordnungen(eingangsrechnung_id)`); } catch (e) { console.error('[DB Schema] Index idx_zuordnungen_eingangsrechnung:', e.message); }

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

    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_mandate_kunde ON kunden_sepa_mandate(kunde_id)`); } catch (e) { console.error('[DB Schema] Index idx_mandate_kunde:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_mandate_status ON kunden_sepa_mandate(status)`); } catch (e) { console.error('[DB Schema] Index idx_mandate_status:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_mandate_referenz ON kunden_sepa_mandate(mandatsreferenz)`); } catch (e) { console.error('[DB Schema] Index idx_mandate_referenz:', e.message); }

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

    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_sepa_laeufe_datum ON sepa_lastschrift_laeufe(ausfuehrungs_datum)`); } catch (e) { console.error('[DB Schema] Index idx_sepa_laeufe_datum:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_sepa_laeufe_status ON sepa_lastschrift_laeufe(status)`); } catch (e) { console.error('[DB Schema] Index idx_sepa_laeufe_status:', e.message); }

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

    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_sepa_pos_lauf ON sepa_lastschrift_positionen(lauf_id)`); } catch (e) { console.error('[DB Schema] Index idx_sepa_pos_lauf:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_sepa_pos_dokument ON sepa_lastschrift_positionen(dokument_id)`); } catch (e) { console.error('[DB Schema] Index idx_sepa_pos_dokument:', e.message); }
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

    // --- Datenintegrität: §48b / Subunternehmer-Felder auf kunden ---
    // Bug A: kunden.sec48b_valid_until wird von getEingangsrechnungen()/saveEingangsrechnung()
    // gelesen, existierte aber nie -> 'no such column' auf frischen DBs.
    try { db.exec(`ALTER TABLE kunden ADD COLUMN sec48b_valid_until TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    // Bug B: lieferant.is_subcontractor steuert den 15%-Bauabzugseinbehalt (§ 48b EStG).
    try { db.exec(`ALTER TABLE kunden ADD COLUMN is_subcontractor INTEGER DEFAULT 0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }

    // --- Migration Objektverwaltung F1: Beleg ↔ Objekt (polymorphe Referenz, kein FK) ---
    // erlaubte Werte (Anwenderebene): 'LIEGENSCHAFT' | 'GEBAEUDE' | 'ETAGE' | 'RAUM'; NULL = kein Objektbezug (Altbestand!)
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN objekt_typ TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN objekt_id INTEGER`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_dokumente_objekt ON dokumente(objekt_typ, objekt_id)`);
    } catch (e) {
        console.error('[DB Migration] Index idx_dokumente_objekt konnte nicht erstellt werden:', e.message);
    }

    // --- Migration Putzplan/Reinigungs-LV F3: Plan-Position ↔ LV-Position (kein FK-Enforcement, polymorpher Projektstil) ---
    try { db.exec(`ALTER TABLE abrechnungsplan_positionen ADD COLUMN lv_position_id INTEGER`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }

    // --- Banking, OPOS & SEPA (F11) ---
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN skonto_tage INTEGER DEFAULT 0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN skonto_prozent REAL DEFAULT 0.0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN bezahlt_betrag REAL DEFAULT 0.0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN offener_betrag REAL`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN sepa_mandat_id INTEGER REFERENCES kunden_sepa_mandate(id)`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }

    try { db.exec(`ALTER TABLE kunden ADD COLUMN iban TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE kunden ADD COLUMN bic TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE kunden ADD COLUMN bank_name TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE kunden ADD COLUMN kontoinhaber TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE kunden ADD COLUMN sepa_mandat_aktiv INTEGER DEFAULT 0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }

    // --- Datenintegrität: Duplikate bereinigen + UNIQUE-Indizes ---
    ensureUniqueConstraints(db);
}

/**
 * Dedupliziert doppelte Belegnummern deterministisch: Der älteste Beleg (MIN id)
 * behält die Nummer, alle weiteren erhalten Suffixe "-2", "-3" ... die noch frei sind.
 */
function dedupeDuplicateDocumentNumbers(db) {
    const dupes = db.prepare(`
        SELECT nr, COUNT(*) AS cnt, MIN(id) AS keepId
        FROM dokumente
        GROUP BY nr
        HAVING COUNT(*) > 1
    `).all();
    if (dupes.length === 0) return [];

    const allNrs = new Set(db.prepare('SELECT nr FROM dokumente').all().map(r => r.nr));
    const updateStmt = db.prepare('UPDATE dokumente SET nr = ? WHERE id = ?');
    const renamed = [];

    const tx = db.transaction(() => {
        for (const dupe of dupes) {
            const others = db.prepare('SELECT id FROM dokumente WHERE nr = ? AND id != ? ORDER BY id ASC').all(dupe.nr, dupe.keepId);
            for (const row of others) {
                let i = 2;
                let candidate = `${dupe.nr}-${i}`;
                while (allNrs.has(candidate)) {
                    i++;
                    candidate = `${dupe.nr}-${i}`;
                }
                updateStmt.run(candidate, row.id);
                allNrs.add(candidate);
                renamed.push({ id: row.id, alt: dupe.nr, neu: candidate });
            }
        }
    });
    tx();

    renamed.forEach(r => console.warn(`[DB Migration] Doppelte Belegnummer "${r.alt}" gefunden: Dokument #${r.id} wurde deterministisch zu "${r.neu}" umbenannt.`));
    return renamed;
}

/**
 * Dedupliziert Verrechnungspaare: pro (aktuelle_rechnung_id, vorherige_rechnung_id)
 * bleibt der neueste Eintrag (MAX id), Rest wird gelöscht.
 */
function dedupeDuplicateVerrechnungen(db) {
    const info = db.prepare(`
        DELETE FROM rechnung_verrechnungen
        WHERE id NOT IN (
            SELECT MAX(id) FROM rechnung_verrechnungen
            GROUP BY aktuelle_rechnung_id, vorherige_rechnung_id
        )
    `).run();
    if (info.changes > 0) {
        console.warn(`[DB Migration] ${info.changes} doppelte Verrechnungseinträge entfernt (neuester Eintrag je Paar behalten).`);
    }
    return info.changes;
}

/**
 * Dedupliziert Sicherheitseinbehalte: pro invoice_id bleibt der neueste Eintrag.
 * Fachlich ist ein Einbehalt pro Rechnung vorgesehen (invoice_id als Anker).
 */
function dedupeDuplicateRetentions(db) {
    const info = db.prepare(`
        DELETE FROM security_retentions
        WHERE id NOT IN (
            SELECT MAX(id) FROM security_retentions GROUP BY invoice_id
        )
    `).run();
    if (info.changes > 0) {
        console.warn(`[DB Migration] ${info.changes} doppelte Sicherheitseinbehalt-Einträge entfernt (neuester je Rechnung behalten).`);
    }
    return info.changes;
}

/**
 * Legt UNIQUE-Indizes an. Bestandsduplikate werden VORHER deterministisch entfernt,
 * damit der Index die App niemals beim Start crashen kann. Schlägt ein Index fehl,
 * wird nur geloggt (App läuft ohne Index weiter).
 */
function ensureUniqueConstraints(db) {
    try {
        dedupeDuplicateDocumentNumbers(db);
        db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_dokumente_nr_unique ON dokumente(nr)`);
    } catch (e) {
        console.error('[DB Migration] UNIQUE-Index auf dokumente(nr) konnte nicht erstellt werden:', e.message);
    }

    try {
        dedupeDuplicateVerrechnungen(db);
        db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_verrechnungen_paar_unique ON rechnung_verrechnungen(aktuelle_rechnung_id, vorherige_rechnung_id)`);
    } catch (e) {
        console.error('[DB Migration] UNIQUE-Index auf rechnung_verrechnungen konnte nicht erstellt werden:', e.message);
    }

    try {
        dedupeDuplicateRetentions(db);
        db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_security_retentions_invoice_unique ON security_retentions(invoice_id)`);
    } catch (e) {
        console.error('[DB Migration] UNIQUE-Index auf security_retentions(invoice_id) konnte nicht erstellt werden:', e.message);
    }

    try {
        db.exec(`ALTER TABLE abrechnungsplaene ADD COLUMN preise_live INTEGER DEFAULT 0`);
    } catch (e) {
        if (!e.message.includes('duplicate column')) {
            console.warn('[DB Migration Warning]:', e.message);
        }
    }
}

function seedDefaultData(db) {
    const defaults = {
        firmenname: 'W-LINK ERP',
        logo: '',
        bankname: 'Volksbank Musterstadt',
        steuer: 'DE999888777',
        iban: 'DE89 3704 0044 0532 0130 00',
        bic: 'COBADEFFXXX',
        mahngebuehr: '5.00',
        manuelleRechnungsnummer: 'false',
        glaeubiger_id: 'DE98ZZZ09999999999',
        sepa_xml_standard: 'pain.008.001.08',
        sepa_pre_notification_standard_tage: '14',
        matching_auto_skonto_toleranz_tage: '2'
    };
    const insertStmt = db.prepare('INSERT OR IGNORE INTO einstellungen (key, value) VALUES (?, ?)');
    const insertTransaction = db.transaction((defs) => {
        for (const [k, v] of Object.entries(defs)) {
            insertStmt.run(k, v);
        }
    });
    insertTransaction(defaults);
}

module.exports = {
    createSchema,
    runMigrations,
    seedDefaultData,
    ensureUniqueConstraints,
    dedupeDuplicateDocumentNumbers,
    dedupeDuplicateVerrechnungen,
    dedupeDuplicateRetentions
};
