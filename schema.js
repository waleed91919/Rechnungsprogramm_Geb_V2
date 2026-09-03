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
        bodenbelag TEXT,
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

    // --- EFB-Zuschlagsprofile & Mittellohn (VHB Bund Formblatt 221 & 223) ---
    db.exec(`CREATE TABLE IF NOT EXISTS efb_profile (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projekt_id INTEGER REFERENCES projekte(id) ON DELETE CASCADE,
        name TEXT NOT NULL DEFAULT 'Standard-Zuschlagsprofil',
        mittellohn_eur REAL NOT NULL DEFAULT 24.50,
        lohngebundene_kosten_prozent REAL NOT NULL DEFAULT 85.00,
        lohnnebenkosten_prozent REAL NOT NULL DEFAULT 12.50,
        kalkulationslohn_eur REAL NOT NULL DEFAULT 48.39,
        zuschlag_lohn_bgk REAL NOT NULL DEFAULT 18.00,
        zuschlag_lohn_agk REAL NOT NULL DEFAULT 22.00,
        zuschlag_lohn_wug REAL NOT NULL DEFAULT 8.80,
        zuschlag_stoff_bgk REAL NOT NULL DEFAULT 12.00,
        zuschlag_stoff_agk REAL NOT NULL DEFAULT 14.00,
        zuschlag_stoff_wug REAL NOT NULL DEFAULT 6.00,
        zuschlag_geraet_bgk REAL NOT NULL DEFAULT 15.00,
        zuschlag_geraet_agk REAL NOT NULL DEFAULT 16.00,
        zuschlag_geraet_wug REAL NOT NULL DEFAULT 6.00,
        zuschlag_sonst_bgk REAL NOT NULL DEFAULT 10.00,
        zuschlag_sonst_agk REAL NOT NULL DEFAULT 12.00,
        zuschlag_sonst_wug REAL NOT NULL DEFAULT 5.00,
        zuschlag_nu_bgk REAL NOT NULL DEFAULT 8.00,
        zuschlag_nu_agk REAL NOT NULL DEFAULT 10.00,
        zuschlag_nu_wug REAL NOT NULL DEFAULT 4.00,
        wug_gewinn_prozent REAL NOT NULL DEFAULT 5.00,
        wug_betriebswagnis_prozent REAL NOT NULL DEFAULT 2.00,
        wug_leistungswagnis_prozent REAL NOT NULL DEFAULT 1.80,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_efb_profile_projekt ON efb_profile(projekt_id)`); } catch (e) { console.error('[DB Schema] Index idx_efb_profile_projekt:', e.message); }

    // --- Revisionssichere Backup-Historie (GoBD & GFS) ---
    db.exec(`CREATE TABLE IF NOT EXISTS backup_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dateiname TEXT NOT NULL,
        dateipfad TEXT NOT NULL,
        dateigroesse_bytes INTEGER NOT NULL,
        dateigroesse_komprimiert_bytes INTEGER NOT NULL,
        sha256_hash TEXT NOT NULL,
        trigger_type TEXT NOT NULL CHECK(trigger_type IN ('MANUAL', 'AUTO_SHUTDOWN', 'CRON', 'PRE_MIGRATION', 'PRE_RESTORE')),
        retention_category TEXT NOT NULL CHECK(retention_category IN ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'ARCHIVE')),
        integrity_status TEXT NOT NULL CHECK(integrity_status IN ('OK', 'CORRUPT', 'UNKNOWN')),
        erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
        bemerkung TEXT
    )`);

    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_backup_created ON backup_history(erstellt_am)`); } catch (e) { console.error('[DB Schema] Index idx_backup_created:', e.message); }

    // =========================================================================
    // PHASE 2 (RELEASE 1.1) - KALKULATION, DATANORM & MÄNGELKATASTER
    // =========================================================================

    // 1. Unternehmensweite Stammdaten-Zuschlagsprofile
    db.exec(`CREATE TABLE IF NOT EXISTS zuschlagskalkulation_stamm (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        ist_standard INTEGER DEFAULT 0 CHECK(ist_standard IN (0, 1)),
        mittellohn_eur REAL NOT NULL DEFAULT 26.00,
        lohngebundene_kosten_prozent REAL NOT NULL DEFAULT 84.50,
        lohnnebenkosten_prozent REAL NOT NULL DEFAULT 13.50,
        kalkulationslohn_eur REAL NOT NULL DEFAULT 51.48,
        kalkulationsverfahren TEXT NOT NULL DEFAULT 'ZUSCHLAGSKALKULATION' CHECK(kalkulationsverfahren IN ('ZUSCHLAGSKALKULATION', 'ENDSUMMENKALKULATION')),
        endsumme_umlage_basis TEXT NOT NULL DEFAULT 'HERSTELLKOSTEN' CHECK(endsumme_umlage_basis IN ('HERSTELLKOSTEN', 'LOHNSTUNDEN')),
        zuschlag_lohn_bgk REAL NOT NULL DEFAULT 18.00,
        zuschlag_lohn_agk REAL NOT NULL DEFAULT 22.00,
        zuschlag_lohn_wug REAL NOT NULL DEFAULT 8.00,
        zuschlag_stoff_bgk REAL NOT NULL DEFAULT 12.00,
        zuschlag_stoff_agk REAL NOT NULL DEFAULT 14.00,
        zuschlag_stoff_wug REAL NOT NULL DEFAULT 6.00,
        zuschlag_geraet_bgk REAL NOT NULL DEFAULT 15.00,
        zuschlag_geraet_agk REAL NOT NULL DEFAULT 16.00,
        zuschlag_geraet_wug REAL NOT NULL DEFAULT 6.00,
        zuschlag_sonst_bgk REAL NOT NULL DEFAULT 10.00,
        zuschlag_sonst_agk REAL NOT NULL DEFAULT 12.00,
        zuschlag_sonst_wug REAL NOT NULL DEFAULT 5.00,
        zuschlag_nu_bgk REAL NOT NULL DEFAULT 8.00,
        zuschlag_nu_agk REAL NOT NULL DEFAULT 10.00,
        zuschlag_nu_wug REAL NOT NULL DEFAULT 4.00,
        wug_gewinn_prozent REAL NOT NULL DEFAULT 5.00,
        wug_betriebswagnis_prozent REAL NOT NULL DEFAULT 2.00,
        wug_leistungswagnis_prozent REAL NOT NULL DEFAULT 1.00,
        skonto_abzug_kalkulation_prozent REAL NOT NULL DEFAULT 0.00,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 2. Projektbezogene Kalkulationsprofile
    db.exec(`CREATE TABLE IF NOT EXISTS zuschlagskalkulation_projekte (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projekt_id INTEGER NOT NULL UNIQUE REFERENCES projekte(id) ON DELETE CASCADE,
        stamm_profil_id INTEGER REFERENCES zuschlagskalkulation_stamm(id) ON DELETE SET NULL,
        mittellohn_eur REAL NOT NULL DEFAULT 26.00,
        lohngebundene_kosten_prozent REAL NOT NULL DEFAULT 84.50,
        lohnnebenkosten_prozent REAL NOT NULL DEFAULT 13.50,
        kalkulationslohn_eur REAL NOT NULL DEFAULT 51.48,
        kalkulationsverfahren TEXT NOT NULL DEFAULT 'ZUSCHLAGSKALKULATION' CHECK(kalkulationsverfahren IN ('ZUSCHLAGSKALKULATION', 'ENDSUMMENKALKULATION')),
        endsumme_umlage_basis TEXT NOT NULL DEFAULT 'HERSTELLKOSTEN' CHECK(endsumme_umlage_basis IN ('HERSTELLKOSTEN', 'LOHNSTUNDEN')),
        zuschlag_lohn_bgk REAL NOT NULL DEFAULT 18.00,
        zuschlag_lohn_agk REAL NOT NULL DEFAULT 22.00,
        zuschlag_lohn_wug REAL NOT NULL DEFAULT 8.00,
        zuschlag_stoff_bgk REAL NOT NULL DEFAULT 12.00,
        zuschlag_stoff_agk REAL NOT NULL DEFAULT 14.00,
        zuschlag_stoff_wug REAL NOT NULL DEFAULT 6.00,
        zuschlag_geraet_bgk REAL NOT NULL DEFAULT 15.00,
        zuschlag_geraet_agk REAL NOT NULL DEFAULT 16.00,
        zuschlag_geraet_wug REAL NOT NULL DEFAULT 6.00,
        zuschlag_sonst_bgk REAL NOT NULL DEFAULT 10.00,
        zuschlag_sonst_agk REAL NOT NULL DEFAULT 12.00,
        zuschlag_sonst_wug REAL NOT NULL DEFAULT 5.00,
        zuschlag_nu_bgk REAL NOT NULL DEFAULT 8.00,
        zuschlag_nu_agk REAL NOT NULL DEFAULT 10.00,
        zuschlag_nu_wug REAL NOT NULL DEFAULT 4.00,
        wug_gewinn_prozent REAL NOT NULL DEFAULT 5.00,
        wug_betriebswagnis_prozent REAL NOT NULL DEFAULT 2.00,
        wug_leistungswagnis_prozent REAL NOT NULL DEFAULT 1.00,
        skonto_abzug_kalkulation_prozent REAL NOT NULL DEFAULT 0.00,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_zuschlag_proj_pid ON zuschlagskalkulation_projekte(projekt_id)`); } catch (e) { console.error('[DB Schema] Index idx_zuschlag_proj_pid:', e.message); }

    // 3. DATANORM Kataloge, Warengruppen und Rabattgruppen
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

    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_datanorm_wrg_kat ON datanorm_warengruppen(katalog_id)`); } catch (e) { console.error('[DB Schema] Index idx_datanorm_wrg_kat:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_datanorm_rab_kat ON datanorm_rabattgruppen(katalog_id)`); } catch (e) { console.error('[DB Schema] Index idx_datanorm_rab_kat:', e.message); }

    // 4. Zentrales Mängelkataster & Fristenmanagement
    db.exec(`CREATE TABLE IF NOT EXISTS maengelkataster (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projekt_id INTEGER NOT NULL REFERENCES projekte(id) ON DELETE CASCADE,
        mangel_nr TEXT NOT NULL,
        titel TEXT NOT NULL,
        beschreibung TEXT,
        gewerk TEXT,
        bauteil TEXT,
        objekt_typ TEXT CHECK(objekt_typ IN ('LIEGENSCHAFT', 'GEBAEUDE', 'ETAGE', 'RAUM')),
        objekt_id INTEGER,
        ort_beschreibung TEXT,
        schweregrad TEXT DEFAULT 'MITTEL' CHECK(schweregrad IN ('LEICHT', 'MITTEL', 'SCHWER', 'ABNAHMEHINDERND')),
        status TEXT DEFAULT 'ERFASST' CHECK(status IN (
            'ERFASST', 'MAENGELRUEGE_VERSCHICKT', 'IN_NACHBESSERUNG',
            'MAHNUNG_STUFE_2', 'ZUR_ABNAHME', 'ERLEDIGT', 'ERSATZVORNAHME', 'ABGEWIESEN'
        )),
        verursacher_typ TEXT DEFAULT 'SUB' CHECK(verursacher_typ IN ('SUB', 'EIGENLEISTUNG', 'PLANER', 'UNBEKANNT')),
        subunternehmer_kunde_id INTEGER REFERENCES kunden(id) ON DELETE SET NULL,
        erfasst_am DATETIME DEFAULT CURRENT_TIMESTAMP,
        erfasst_von TEXT,
        nachbesserungsfrist DATE,
        nachfrist_stufe2 DATE,
        maengelruege_versandt_am DATETIME,
        mahnung_stufe2_versandt_am DATETIME,
        erledigt_am DATETIME,
        abnahme_am DATETIME,
        geschaetzte_beseitigungskosten_eur REAL DEFAULT 0.0,
        tatsaechliche_ersatzvornahme_kosten_eur REAL DEFAULT 0.0,
        druckzuschlag_faktor REAL DEFAULT 2.0,
        einbehalt_betrag_eur REAL DEFAULT 0.0,
        verknuepfte_eingangsrechnung_id INTEGER REFERENCES eingangsrechnungen(id) ON DELETE SET NULL,
        verknuepfter_einbehalt_id INTEGER REFERENCES security_retentions(id) ON DELETE SET NULL,
        bemerkungen TEXT
    )`);

    try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_maengel_projekt_nr ON maengelkataster(projekt_id, mangel_nr)`); } catch (e) { console.error('[DB Schema] Index idx_maengel_projekt_nr:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_maengel_status ON maengelkataster(status)`); } catch (e) { console.error('[DB Schema] Index idx_maengel_status:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_maengel_frist ON maengelkataster(nachbesserungsfrist)`); } catch (e) { console.error('[DB Schema] Index idx_maengel_frist:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_maengel_sub ON maengelkataster(subunternehmer_kunde_id)`); } catch (e) { console.error('[DB Schema] Index idx_maengel_sub:', e.message); }

    // 5. Fotobeweise & Dokumentation
    db.exec(`CREATE TABLE IF NOT EXISTS maengel_fotos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mangel_id INTEGER NOT NULL REFERENCES maengelkataster(id) ON DELETE CASCADE,
        dateipfad TEXT NOT NULL,
        thumbnail_base64 TEXT,
        aufnahme_datum DATETIME DEFAULT CURRENT_TIMESTAMP,
        typ TEXT DEFAULT 'VOR_NACHBESSERUNG' CHECK(typ IN ('VOR_NACHBESSERUNG', 'NACH_NACHBESSERUNG', 'BELEG')),
        kommentar TEXT
    )`);

    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_maengel_fotos_mangel ON maengel_fotos(mangel_id)`); } catch (e) { console.error('[DB Schema] Index idx_maengel_fotos_mangel:', e.message); }

    // 6. Revisionssichere Mängel-Historie (Audit-Trail)
    db.exec(`CREATE TABLE IF NOT EXISTS maengel_historie (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mangel_id INTEGER NOT NULL REFERENCES maengelkataster(id) ON DELETE CASCADE,
        alter_status TEXT,
        neuer_status TEXT NOT NULL,
        geaendert_am DATETIME DEFAULT CURRENT_TIMESTAMP,
        geaendert_von TEXT,
        kommentar TEXT
    )`);

    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_maengel_hist_mangel ON maengel_historie(mangel_id)`); } catch (e) { console.error('[DB Schema] Index idx_maengel_hist_mangel:', e.message); }

    // =========================================================================
    // PHASE 3 (RELEASE 1.2) - MOBIL-PWA, ZEITERFASSUNG, VOB/B & LOCAL-FIRST SYNC
    // =========================================================================

    // 1. Mitarbeiter-Stammdaten & Lohngruppen
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

    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_mitarbeiter_persnr ON mitarbeiter(personalnummer)`); } catch (e) { console.error('[DB Schema] Index idx_mitarbeiter_persnr:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_mitarbeiter_aktiv ON mitarbeiter(aktiv)`); } catch (e) { console.error('[DB Schema] Index idx_mitarbeiter_aktiv:', e.message); }

    // 2. Zeiterfassung (Mobile & Desktop)
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_zeit_mitarbeiter_datum ON zeiterfassung(mitarbeiter_id, zeit_von)`); } catch (e) { console.error('[DB Schema] Index idx_zeit_mitarbeiter_datum:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_zeit_projekt ON zeiterfassung(projekt_id)`); } catch (e) { console.error('[DB Schema] Index idx_zeit_projekt:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_zeit_uuid ON zeiterfassung(uuid)`); } catch (e) { console.error('[DB Schema] Index idx_zeit_uuid:', e.message); }

    // 3. Idempotente Sync-Tracking Tabelle
    db.exec(`CREATE TABLE IF NOT EXISTS sync_processed_mutations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mutation_uuid TEXT NOT NULL UNIQUE,
        device_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_uuid TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_mut_uuid ON sync_processed_mutations(mutation_uuid)`); } catch (e) { console.error('[DB Schema] Index idx_sync_mut_uuid:', e.message); }

    // 4. Bedenken- und Behinderungsanzeigen (VOB/B)
    db.exec(`CREATE TABLE IF NOT EXISTS bedenken_behinderungen (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT NOT NULL UNIQUE,
        projekt_id INTEGER NOT NULL REFERENCES projekte(id) ON DELETE CASCADE,
        typ TEXT NOT NULL CHECK(typ IN ('BEDENKEN_4_3', 'BEHINDERUNG_6_1')),
        datum DATE NOT NULL,
        beginn_datum DATE,
        voraussichtliches_ende DATE,
        betreff TEXT NOT NULL,
        sachverhalt TEXT NOT NULL,
        ursache TEXT,
        kategorie TEXT,
        betroffene_gewerke TEXT,
        vorschlag_abhilfe TEXT,
        auswirkung_bauzeit_tage INTEGER DEFAULT 0,
        mehrkosten_angemeldet INTEGER DEFAULT 0 CHECK(mehrkosten_angemeldet IN (0,1)),
        geschaetzte_mehrkosten_eur REAL DEFAULT 0.0,
        unterschrift_svg TEXT,
        status TEXT NOT NULL DEFAULT 'OFFEN' CHECK(status IN ('OFFEN', 'UEBERGEBEN', 'ANERKANNT', 'ABGELEHNT', 'ERLEDIGT')),
        pdf_pfad TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_vob_projekt ON bedenken_behinderungen(projekt_id)`); } catch (e) { console.error('[DB Schema] Index idx_vob_projekt:', e.message); }

    // 5. Quarantäne- & Konflikt-Tabelle
    db.exec(`CREATE TABLE IF NOT EXISTS sync_conflicts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_uuid TEXT NOT NULL,
        client_device_id TEXT NOT NULL,
        server_data_json TEXT NOT NULL,
        client_data_json TEXT NOT NULL,
        conflict_reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'RESOLVED_CLIENT', 'RESOLVED_SERVER', 'RESOLVED_MERGE')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME
    )`);

    // =========================================================================
    // PHASE 4 (RELEASE 2.0) - IDS CONNECT 2.5, OPEN MASTERDATA & SOKA-BAU COMPLIANCE
    // =========================================================================

    // 1. Großhandels- & Webshop-Konten (IDS Connect 2.5 & Open Masterdata)
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
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_ids_konten_code ON ids_connect_konten(grosshaendler_code)`); } catch (e) { console.error('[DB Schema] Index idx_ids_konten_code:', e.message); }

    // 2. Empfangene & exportierte IDS 2.5 Shopping Carts (Warenkörbe)
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
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_ids_cart_konto ON ids_warenkoerbe(konto_id)`); } catch (e) { console.error('[DB Schema] Index idx_ids_cart_konto:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_ids_cart_status ON ids_warenkoerbe(status)`); } catch (e) { console.error('[DB Schema] Index idx_ids_cart_status:', e.message); }

    // 3. Verknüpfte Artikel-Dokumente (Sicherheitsdatenblätter, Montage, CAD)
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
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_ids_doc_artikel ON ids_artikel_dokumente(artikel_id)`); } catch (e) { console.error('[DB Schema] Index idx_ids_doc_artikel:', e.message); }

    // 4. Zeitraumbezogene SOKA-BAU Beitragssätze (Stand 01.07.2026 / 2027)
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
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_soka_saetze_gebiet ON soka_beitragssaetze(tarifgebiet, gueltig_ab)`); } catch (e) { console.error('[DB Schema] Index idx_soka_saetze_gebiet:', e.message); }

    // 5. SOKA-BAU Monatsmeldungen
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
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_soka_monat ON soka_bau_meldungen(melde_monat)`); } catch (e) { console.error('[DB Schema] Index idx_soka_monat:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_soka_status ON soka_bau_meldungen(status)`); } catch (e) { console.error('[DB Schema] Index idx_soka_status:', e.message); }

    // 6. Arbeitnehmer-Monatsmeldesätze
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
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_soka_an_meldung ON soka_bau_arbeitnehmer_monat(meldung_id)`); } catch (e) { console.error('[DB Schema] Index idx_soka_an_meldung:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_soka_an_mitarbeiter ON soka_bau_arbeitnehmer_monat(mitarbeiter_id)`); } catch (e) { console.error('[DB Schema] Index idx_soka_an_mitarbeiter:', e.message); }

    // 7. SOKA-BAU Ausfallzeiten je Arbeitnehmer
    db.exec(`CREATE TABLE IF NOT EXISTS soka_bau_ausfallzeiten (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        arbeitnehmer_monat_id INTEGER NOT NULL REFERENCES soka_bau_arbeitnehmer_monat(id) ON DELETE CASCADE,
        schluessel TEXT NOT NULL,
        bezeichnung TEXT NOT NULL,
        von_datum DATE NOT NULL,
        bis_datum DATE NOT NULL,
        stunden REAL NOT NULL DEFAULT 0.0
    )`);
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_soka_ausfall_an ON soka_bau_ausfallzeiten(arbeitnehmer_monat_id)`); } catch (e) { console.error('[DB Schema] Index idx_soka_ausfall_an:', e.message); }

    // 8. Nachunternehmer Compliance & SOKA-Nachweise (§ 14 AEntG & § 48b EStG)
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
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_sub_compliance_kunde ON subcontractor_compliance_nachweise(kunde_id)`); } catch (e) { console.error('[DB Schema] Index idx_sub_compliance_kunde:', e.message); }
    // =========================================================================
    // PHASE 5 (STUFE 1, 2, 3) - MOBILER BAUSTELLEN-OFFLINE-BETRIEB (MIGRATION 006)
    // =========================================================================

    // 1. Kolonnen-Stammdaten für Polier-Schnellstempelung
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

    // 2. Bauplan-Verwaltung & PDF-Speicher
    db.exec(`CREATE TABLE IF NOT EXISTS bauplaene (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projekt_id INTEGER NOT NULL,
        titel TEXT NOT NULL,
        dateiname TEXT NOT NULL,
        rel_pfad TEXT NOT NULL,
        seiten_anzahl INTEGER DEFAULT 1,
        file_size_bytes INTEGER DEFAULT 0,
        sha256_hash TEXT NOT NULL,
        version INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (projekt_id) REFERENCES projekte(id) ON DELETE CASCADE
    )`);
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_bauplaene_projekt ON bauplaene(projekt_id)`); } catch (e) { console.error('[DB Schema] Index idx_bauplaene_projekt:', e.message); }

    // 3. Geräte-Einsatzbuchungen (BGL)
    db.exec(`CREATE TABLE IF NOT EXISTS geraete_buchungen (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT UNIQUE NOT NULL,
        projekt_id INTEGER NOT NULL,
        geraet_code TEXT NOT NULL,
        datum DATE NOT NULL,
        betriebsstunden REAL DEFAULT 0.0,
        stillstand_stunden REAL DEFAULT 0.0,
        stillstand_grund TEXT,
        device_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (projekt_id) REFERENCES projekte(id) ON DELETE CASCADE
    )`);
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_geraete_buchungen_proj ON geraete_buchungen(projekt_id, datum)`); } catch (e) { console.error('[DB Schema] Index idx_geraete_buchungen_proj:', e.message); }

    // 4. Digitale Lieferscheine vor Ort
    db.exec(`CREATE TABLE IF NOT EXISTS lieferscheine_digital (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT UNIQUE NOT NULL,
        projekt_id INTEGER NOT NULL,
        lieferant_name TEXT,
        lieferschein_nr TEXT,
        datum DATE NOT NULL,
        foto_pfad TEXT NOT NULL,
        sha256_hash TEXT NOT NULL,
        status TEXT DEFAULT 'ERFASST',
        device_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (projekt_id) REFERENCES projekte(id) ON DELETE CASCADE
    )`);
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_lieferscheine_proj ON lieferscheine_digital(projekt_id)`); } catch (e) { console.error('[DB Schema] Index idx_lieferscheine_proj:', e.message); }

    // 5. Mängel-Pins & Bauplanverortung
    db.exec(`CREATE TABLE IF NOT EXISTS maengel (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT UNIQUE,
        projekt_id INTEGER NOT NULL REFERENCES projekte(id) ON DELETE CASCADE,
        plan_id INTEGER REFERENCES bauplaene(id) ON DELETE SET NULL,
        mangel_nr TEXT NOT NULL,
        x_pct REAL DEFAULT 0.0,
        y_pct REAL DEFAULT 0.0,
        titel TEXT NOT NULL,
        beschreibung TEXT,
        gewerk TEXT,
        status TEXT DEFAULT 'ERFASST',
        frist_datum DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_maengel_proj ON maengel(projekt_id)`); } catch (e) { console.error('[DB Schema] Index idx_maengel_proj:', e.message); }
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_maengel_plan ON maengel(plan_id)`); } catch (e) { console.error('[DB Schema] Index idx_maengel_plan:', e.message); }
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
    try { db.exec(`ALTER TABLE raeume ADD COLUMN bodenbelag TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
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

    try { db.exec(`ALTER TABLE dokumente ADD COLUMN was_locked_vor_zahlung INTEGER DEFAULT 0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }

    try { db.exec(`ALTER TABLE zahlung_zuordnungen ADD COLUMN storno_flag INTEGER DEFAULT 0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE zahlung_zuordnungen ADD COLUMN storniert_am DATETIME`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE zahlung_zuordnungen ADD COLUMN storno_grund TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }

    // --- EFB-Preisblätter 221 & 223 (VHB Bund) ---
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS efb_profile (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            projekt_id INTEGER REFERENCES projekte(id) ON DELETE CASCADE,
            name TEXT NOT NULL DEFAULT 'Standard-Zuschlagsprofil',
            mittellohn_eur REAL NOT NULL DEFAULT 24.50,
            lohngebundene_kosten_prozent REAL NOT NULL DEFAULT 85.00,
            lohnnebenkosten_prozent REAL NOT NULL DEFAULT 12.50,
            kalkulationslohn_eur REAL NOT NULL DEFAULT 48.39,
            zuschlag_lohn_bgk REAL NOT NULL DEFAULT 18.00,
            zuschlag_lohn_agk REAL NOT NULL DEFAULT 22.00,
            zuschlag_lohn_wug REAL NOT NULL DEFAULT 8.80,
            zuschlag_stoff_bgk REAL NOT NULL DEFAULT 12.00,
            zuschlag_stoff_agk REAL NOT NULL DEFAULT 14.00,
            zuschlag_stoff_wug REAL NOT NULL DEFAULT 6.00,
            zuschlag_geraet_bgk REAL NOT NULL DEFAULT 15.00,
            zuschlag_geraet_agk REAL NOT NULL DEFAULT 16.00,
            zuschlag_geraet_wug REAL NOT NULL DEFAULT 6.00,
            zuschlag_sonst_bgk REAL NOT NULL DEFAULT 10.00,
            zuschlag_sonst_agk REAL NOT NULL DEFAULT 12.00,
            zuschlag_sonst_wug REAL NOT NULL DEFAULT 5.00,
            zuschlag_nu_bgk REAL NOT NULL DEFAULT 8.00,
            zuschlag_nu_agk REAL NOT NULL DEFAULT 10.00,
            zuschlag_nu_wug REAL NOT NULL DEFAULT 4.00,
            wug_gewinn_prozent REAL NOT NULL DEFAULT 5.00,
            wug_betriebswagnis_prozent REAL NOT NULL DEFAULT 2.00,
            wug_leistungswagnis_prozent REAL NOT NULL DEFAULT 1.80,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_efb_profile_projekt ON efb_profile(projekt_id)`);
    } catch (e) {
        if (!e.message.includes('already exists')) console.warn('[DB Migration Warning] efb_profile:', e.message);
    }

    try { db.exec(`ALTER TABLE positionen ADD COLUMN zeitansatz_h REAL DEFAULT 0.0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE positionen ADD COLUMN lohn_ep REAL DEFAULT 0.0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE positionen ADD COLUMN stoff_ep REAL DEFAULT 0.0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE positionen ADD COLUMN geraet_ep REAL DEFAULT 0.0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
    try { db.exec(`ALTER TABLE positionen ADD COLUMN sonst_ep REAL DEFAULT 0.0`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }

    // --- Revisionssichere Backup-Historie (GoBD & GFS) ---
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS backup_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dateiname TEXT NOT NULL,
            dateipfad TEXT NOT NULL,
            dateigroesse_bytes INTEGER NOT NULL,
            dateigroesse_komprimiert_bytes INTEGER NOT NULL,
            sha256_hash TEXT NOT NULL,
            trigger_type TEXT NOT NULL CHECK(trigger_type IN ('MANUAL', 'AUTO_SHUTDOWN', 'CRON', 'PRE_MIGRATION', 'PRE_RESTORE')),
            retention_category TEXT NOT NULL CHECK(retention_category IN ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'ARCHIVE')),
            integrity_status TEXT NOT NULL CHECK(integrity_status IN ('OK', 'CORRUPT', 'UNKNOWN')),
            erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
            bemerkung TEXT
        )`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_backup_created ON backup_history(erstellt_am)`);
    } catch (e) {
        if (!e.message.includes('already exists')) console.warn('[DB Migration Warning] backup_history:', e.message);
    }

    // --- Phase 2: Zuschlagskalkulation, DATANORM & Mängelkataster Migrationen ---
    try { db.exec(`ALTER TABLE positionen ADD COLUMN ekt_stoff_je_me REAL DEFAULT 0.0`); } catch (e) { if (!e.message.includes('duplicate column')) console.warn('[DB Migration Warning]:', e.message); }
    try { db.exec(`ALTER TABLE positionen ADD COLUMN ekt_geraet_je_me REAL DEFAULT 0.0`); } catch (e) { if (!e.message.includes('duplicate column')) console.warn('[DB Migration Warning]:', e.message); }
    try { db.exec(`ALTER TABLE positionen ADD COLUMN ekt_sonst_je_me REAL DEFAULT 0.0`); } catch (e) { if (!e.message.includes('duplicate column')) console.warn('[DB Migration Warning]:', e.message); }
    try { db.exec(`ALTER TABLE positionen ADD COLUMN ekt_nu_je_me REAL DEFAULT 0.0`); } catch (e) { if (!e.message.includes('duplicate column')) console.warn('[DB Migration Warning]:', e.message); }
    try { db.exec(`ALTER TABLE artikel ADD COLUMN datanorm_nr TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) console.warn('[DB Migration Warning]:', e.message); }
    try { db.exec(`ALTER TABLE artikel ADD COLUMN warengruppe_id TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) console.warn('[DB Migration Warning]:', e.message); }
    try { db.exec(`ALTER TABLE artikel ADD COLUMN rabattgruppe_id TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) console.warn('[DB Migration Warning]:', e.message); }
    try { db.exec(`ALTER TABLE security_retentions ADD COLUMN mangel_id INTEGER REFERENCES maengelkataster(id) ON DELETE SET NULL`); } catch (e) { if (!e.message.includes('duplicate column')) console.warn('[DB Migration Warning]:', e.message); }

    // Phase 2 Tabellen sicherstellen (für bestehende DBs)
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS zuschlagskalkulation_stamm (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            ist_standard INTEGER DEFAULT 0 CHECK(ist_standard IN (0, 1)),
            mittellohn_eur REAL NOT NULL DEFAULT 26.00,
            lohngebundene_kosten_prozent REAL NOT NULL DEFAULT 84.50,
            lohnnebenkosten_prozent REAL NOT NULL DEFAULT 13.50,
            kalkulationslohn_eur REAL NOT NULL DEFAULT 51.48,
            kalkulationsverfahren TEXT NOT NULL DEFAULT 'ZUSCHLAGSKALKULATION' CHECK(kalkulationsverfahren IN ('ZUSCHLAGSKALKULATION', 'ENDSUMMENKALKULATION')),
            endsumme_umlage_basis TEXT NOT NULL DEFAULT 'HERSTELLKOSTEN' CHECK(endsumme_umlage_basis IN ('HERSTELLKOSTEN', 'LOHNSTUNDEN')),
            zuschlag_lohn_bgk REAL NOT NULL DEFAULT 18.00,
            zuschlag_lohn_agk REAL NOT NULL DEFAULT 22.00,
            zuschlag_lohn_wug REAL NOT NULL DEFAULT 8.00,
            zuschlag_stoff_bgk REAL NOT NULL DEFAULT 12.00,
            zuschlag_stoff_agk REAL NOT NULL DEFAULT 14.00,
            zuschlag_stoff_wug REAL NOT NULL DEFAULT 6.00,
            zuschlag_geraet_bgk REAL NOT NULL DEFAULT 15.00,
            zuschlag_geraet_agk REAL NOT NULL DEFAULT 16.00,
            zuschlag_geraet_wug REAL NOT NULL DEFAULT 6.00,
            zuschlag_sonst_bgk REAL NOT NULL DEFAULT 10.00,
            zuschlag_sonst_agk REAL NOT NULL DEFAULT 12.00,
            zuschlag_sonst_wug REAL NOT NULL DEFAULT 5.00,
            zuschlag_nu_bgk REAL NOT NULL DEFAULT 8.00,
            zuschlag_nu_agk REAL NOT NULL DEFAULT 10.00,
            zuschlag_nu_wug REAL NOT NULL DEFAULT 4.00,
            wug_gewinn_prozent REAL NOT NULL DEFAULT 5.00,
            wug_betriebswagnis_prozent REAL NOT NULL DEFAULT 2.00,
            wug_leistungswagnis_prozent REAL NOT NULL DEFAULT 1.00,
            skonto_abzug_kalkulation_prozent REAL NOT NULL DEFAULT 0.00,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        db.exec(`CREATE TABLE IF NOT EXISTS zuschlagskalkulation_projekte (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            projekt_id INTEGER NOT NULL UNIQUE REFERENCES projekte(id) ON DELETE CASCADE,
            stamm_profil_id INTEGER REFERENCES zuschlagskalkulation_stamm(id) ON DELETE SET NULL,
            mittellohn_eur REAL NOT NULL DEFAULT 26.00,
            lohngebundene_kosten_prozent REAL NOT NULL DEFAULT 84.50,
            lohnnebenkosten_prozent REAL NOT NULL DEFAULT 13.50,
            kalkulationslohn_eur REAL NOT NULL DEFAULT 51.48,
            kalkulationsverfahren TEXT NOT NULL DEFAULT 'ZUSCHLAGSKALKULATION' CHECK(kalkulationsverfahren IN ('ZUSCHLAGSKALKULATION', 'ENDSUMMENKALKULATION')),
            endsumme_umlage_basis TEXT NOT NULL DEFAULT 'HERSTELLKOSTEN' CHECK(endsumme_umlage_basis IN ('HERSTELLKOSTEN', 'LOHNSTUNDEN')),
            zuschlag_lohn_bgk REAL NOT NULL DEFAULT 18.00,
            zuschlag_lohn_agk REAL NOT NULL DEFAULT 22.00,
            zuschlag_lohn_wug REAL NOT NULL DEFAULT 8.00,
            zuschlag_stoff_bgk REAL NOT NULL DEFAULT 12.00,
            zuschlag_stoff_agk REAL NOT NULL DEFAULT 14.00,
            zuschlag_stoff_wug REAL NOT NULL DEFAULT 6.00,
            zuschlag_geraet_bgk REAL NOT NULL DEFAULT 15.00,
            zuschlag_geraet_agk REAL NOT NULL DEFAULT 16.00,
            zuschlag_geraet_wug REAL NOT NULL DEFAULT 6.00,
            zuschlag_sonst_bgk REAL NOT NULL DEFAULT 10.00,
            zuschlag_sonst_agk REAL NOT NULL DEFAULT 12.00,
            zuschlag_sonst_wug REAL NOT NULL DEFAULT 5.00,
            zuschlag_nu_bgk REAL NOT NULL DEFAULT 8.00,
            zuschlag_nu_agk REAL NOT NULL DEFAULT 10.00,
            zuschlag_nu_wug REAL NOT NULL DEFAULT 4.00,
            wug_gewinn_prozent REAL NOT NULL DEFAULT 5.00,
            wug_betriebswagnis_prozent REAL NOT NULL DEFAULT 2.00,
            wug_leistungswagnis_prozent REAL NOT NULL DEFAULT 1.00,
            skonto_abzug_kalkulation_prozent REAL NOT NULL DEFAULT 0.00,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_zuschlag_proj_pid ON zuschlagskalkulation_projekte(projekt_id)`);
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
        db.exec(`CREATE INDEX IF NOT EXISTS idx_datanorm_wrg_kat ON datanorm_warengruppen(katalog_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_datanorm_rab_kat ON datanorm_rabattgruppen(katalog_id)`);
        db.exec(`CREATE TABLE IF NOT EXISTS maengelkataster (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            projekt_id INTEGER NOT NULL REFERENCES projekte(id) ON DELETE CASCADE,
            mangel_nr TEXT NOT NULL,
            titel TEXT NOT NULL,
            beschreibung TEXT,
            gewerk TEXT,
            bauteil TEXT,
            objekt_typ TEXT CHECK(objekt_typ IN ('LIEGENSCHAFT', 'GEBAEUDE', 'ETAGE', 'RAUM')),
            objekt_id INTEGER,
            ort_beschreibung TEXT,
            schweregrad TEXT DEFAULT 'MITTEL' CHECK(schweregrad IN ('LEICHT', 'MITTEL', 'SCHWER', 'ABNAHMEHINDERND')),
            status TEXT DEFAULT 'ERFASST' CHECK(status IN (
                'ERFASST', 'MAENGELRUEGE_VERSCHICKT', 'IN_NACHBESSERUNG',
                'MAHNUNG_STUFE_2', 'ZUR_ABNAHME', 'ERLEDIGT', 'ERSATZVORNAHME', 'ABGEWIESEN'
            )),
            verursacher_typ TEXT DEFAULT 'SUB' CHECK(verursacher_typ IN ('SUB', 'EIGENLEISTUNG', 'PLANER', 'UNBEKANNT')),
            subunternehmer_kunde_id INTEGER REFERENCES kunden(id) ON DELETE SET NULL,
            erfasst_am DATETIME DEFAULT CURRENT_TIMESTAMP,
            erfasst_von TEXT,
            nachbesserungsfrist DATE,
            nachfrist_stufe2 DATE,
            maengelruege_versandt_am DATETIME,
            mahnung_stufe2_versandt_am DATETIME,
            erledigt_am DATETIME,
            abnahme_am DATETIME,
            geschaetzte_beseitigungskosten_eur REAL DEFAULT 0.0,
            tatsaechliche_ersatzvornahme_kosten_eur REAL DEFAULT 0.0,
            druckzuschlag_faktor REAL DEFAULT 2.0,
            einbehalt_betrag_eur REAL DEFAULT 0.0,
            verknuepfte_eingangsrechnung_id INTEGER REFERENCES eingangsrechnungen(id) ON DELETE SET NULL,
            verknuepfter_einbehalt_id INTEGER REFERENCES security_retentions(id) ON DELETE SET NULL,
            bemerkungen TEXT
        )`);
        db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_maengel_projekt_nr ON maengelkataster(projekt_id, mangel_nr)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_maengel_status ON maengelkataster(status)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_maengel_frist ON maengelkataster(nachbesserungsfrist)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_maengel_sub ON maengelkataster(subunternehmer_kunde_id)`);
        db.exec(`CREATE TABLE IF NOT EXISTS maengel_fotos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mangel_id INTEGER NOT NULL REFERENCES maengelkataster(id) ON DELETE CASCADE,
            dateipfad TEXT NOT NULL,
            thumbnail_base64 TEXT,
            aufnahme_datum DATETIME DEFAULT CURRENT_TIMESTAMP,
            typ TEXT DEFAULT 'VOR_NACHBESSERUNG' CHECK(typ IN ('VOR_NACHBESSERUNG', 'NACH_NACHBESSERUNG', 'BELEG')),
            kommentar TEXT
        )`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_maengel_fotos_mangel ON maengel_fotos(mangel_id)`);
        db.exec(`CREATE TABLE IF NOT EXISTS maengel_historie (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mangel_id INTEGER NOT NULL REFERENCES maengelkataster(id) ON DELETE CASCADE,
            alter_status TEXT,
            neuer_status TEXT NOT NULL,
            geaendert_am DATETIME DEFAULT CURRENT_TIMESTAMP,
            geaendert_von TEXT,
            kommentar TEXT
        )`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_maengel_hist_mangel ON maengel_historie(mangel_id)`);
    } catch (e) {
        if (!e.message.includes('already exists')) console.warn('[DB Migration Warning] Phase 2 tables:', e.message);
    }

    // --- Phase 3: Mobile PWA, Zeiterfassung, VOB/B & Sync Hub Migrationen ---
    try {
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
        db.exec(`CREATE INDEX IF NOT EXISTS idx_mitarbeiter_persnr ON mitarbeiter(personalnummer)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_mitarbeiter_aktiv ON mitarbeiter(aktiv)`);

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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_zeit_mitarbeiter_datum ON zeiterfassung(mitarbeiter_id, zeit_von)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_zeit_projekt ON zeiterfassung(projekt_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_zeit_uuid ON zeiterfassung(uuid)`);

        db.exec(`CREATE TABLE IF NOT EXISTS sync_processed_mutations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mutation_uuid TEXT NOT NULL UNIQUE,
            device_id TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_uuid TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_mut_uuid ON sync_processed_mutations(mutation_uuid)`);

        db.exec(`CREATE TABLE IF NOT EXISTS bedenken_behinderungen (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            projekt_id INTEGER NOT NULL REFERENCES projekte(id) ON DELETE CASCADE,
            typ TEXT NOT NULL CHECK(typ IN ('BEDENKEN_4_3', 'BEHINDERUNG_6_1')),
            datum DATE NOT NULL,
            beginn_datum DATE,
            voraussichtliches_ende DATE,
            betreff TEXT NOT NULL,
            sachverhalt TEXT NOT NULL,
            ursache TEXT,
            kategorie TEXT,
            betroffene_gewerke TEXT,
            vorschlag_abhilfe TEXT,
            auswirkung_bauzeit_tage INTEGER DEFAULT 0,
            mehrkosten_angemeldet INTEGER DEFAULT 0 CHECK(mehrkosten_angemeldet IN (0,1)),
            geschaetzte_mehrkosten_eur REAL DEFAULT 0.0,
            unterschrift_svg TEXT,
            status TEXT NOT NULL DEFAULT 'OFFEN' CHECK(status IN ('OFFEN', 'UEBERGEBEN', 'ANERKANNT', 'ABGELEHNT', 'ERLEDIGT')),
            pdf_pfad TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_vob_projekt ON bedenken_behinderungen(projekt_id)`);

        db.exec(`CREATE TABLE IF NOT EXISTS sync_conflicts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_uuid TEXT NOT NULL,
            client_device_id TEXT NOT NULL,
            server_data_json TEXT NOT NULL,
            client_data_json TEXT NOT NULL,
            conflict_reason TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'RESOLVED_CLIENT', 'RESOLVED_SERVER', 'RESOLVED_MERGE')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            resolved_at DATETIME
        )`        );
    } catch (e) {
        if (!e.message.includes('already exists')) console.warn('[DB Migration Warning] Phase 3 tables:', e.message);
    }

    // --- Phase 4: IDS Connect 2.5, Open Masterdata & SOKA-BAU Migrationen ---
    try {
        // Mitarbeiter-Erweiterungen für SOKA-BAU
        try { db.exec(`ALTER TABLE mitarbeiter ADD COLUMN vsnr TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) console.warn('[DB Migration Warning]:', e.message); }
        try { db.exec(`ALTER TABLE mitarbeiter ADD COLUMN an_nummer TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) console.warn('[DB Migration Warning]:', e.message); }
        try { db.exec(`ALTER TABLE mitarbeiter ADD COLUMN tarifgebiet TEXT DEFAULT 'WEST'`); } catch (e) { if (!e.message.includes('duplicate column')) console.warn('[DB Migration Warning]:', e.message); }
        try { db.exec(`ALTER TABLE mitarbeiter ADD COLUMN beschaeftigungsart TEXT DEFAULT 'GEWERBLICH'`); } catch (e) { if (!e.message.includes('duplicate column')) console.warn('[DB Migration Warning]:', e.message); }
        try { db.exec(`ALTER TABLE mitarbeiter ADD COLUMN geburtsdatum DATE`); } catch (e) { if (!e.message.includes('duplicate column')) console.warn('[DB Migration Warning]:', e.message); }
        try { db.exec(`ALTER TABLE mitarbeiter ADD COLUMN betriebsnummer TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) console.warn('[DB Migration Warning]:', e.message); }

        // IDS Connect & Open Masterdata
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
        db.exec(`CREATE INDEX IF NOT EXISTS idx_ids_konten_code ON ids_connect_konten(grosshaendler_code)`);

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
        db.exec(`CREATE INDEX IF NOT EXISTS idx_ids_cart_konto ON ids_warenkoerbe(konto_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_ids_cart_status ON ids_warenkoerbe(status)`);

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
        db.exec(`CREATE INDEX IF NOT EXISTS idx_ids_doc_artikel ON ids_artikel_dokumente(artikel_id)`);

        // SOKA-BAU Beitragssätze & Meldedaten
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
        db.exec(`CREATE INDEX IF NOT EXISTS idx_soka_saetze_gebiet ON soka_beitragssaetze(tarifgebiet, gueltig_ab)`);

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
        db.exec(`CREATE INDEX IF NOT EXISTS idx_soka_monat ON soka_bau_meldungen(melde_monat)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_soka_status ON soka_bau_meldungen(status)`);

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
        db.exec(`CREATE INDEX IF NOT EXISTS idx_soka_an_meldung ON soka_bau_arbeitnehmer_monat(meldung_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_soka_an_mitarbeiter ON soka_bau_arbeitnehmer_monat(mitarbeiter_id)`);

        db.exec(`CREATE TABLE IF NOT EXISTS soka_bau_ausfallzeiten (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            arbeitnehmer_monat_id INTEGER NOT NULL REFERENCES soka_bau_arbeitnehmer_monat(id) ON DELETE CASCADE,
            schluessel TEXT NOT NULL,
            bezeichnung TEXT NOT NULL,
            von_datum DATE NOT NULL,
            bis_datum DATE NOT NULL,
            stunden REAL NOT NULL DEFAULT 0.0
        )`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_soka_ausfall_an ON soka_bau_ausfallzeiten(arbeitnehmer_monat_id)`);

        // Subunternehmer Compliance Nachweise (§ 14 AEntG)
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
        db.exec(`CREATE INDEX IF NOT EXISTS idx_sub_compliance_kunde ON subcontractor_compliance_nachweise(kunde_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_sub_compliance_status ON subcontractor_compliance_nachweise(status)`);
    } catch (e) {
        if (!e.message.includes('already exists')) console.warn('[DB Migration Warning] Phase 4 tables:', e.message);
    }

    // =========================================================================
    // PHASE 5: MIGRATION 006 - BAUSTELLEN-OFFLINE STUFE 1, 2 & 3
    // =========================================================================
    try {
        // 1. Kolonnen-Stammdaten für Polier-Schnellstempelung
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

        // 2. Bauplan-Verwaltung & PDF-Speicher
        db.exec(`CREATE TABLE IF NOT EXISTS bauplaene (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            projekt_id INTEGER NOT NULL,
            titel TEXT NOT NULL,
            dateiname TEXT NOT NULL,
            rel_pfad TEXT NOT NULL,
            seiten_anzahl INTEGER DEFAULT 1,
            file_size_bytes INTEGER DEFAULT 0,
            sha256_hash TEXT NOT NULL,
            version INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (projekt_id) REFERENCES projekte(id) ON DELETE CASCADE
        )`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_bauplaene_projekt ON bauplaene(projekt_id)`);

        // 3. Geräte-Einsatzbuchungen (BGL)
        db.exec(`CREATE TABLE IF NOT EXISTS geraete_buchungen (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT UNIQUE NOT NULL,
            projekt_id INTEGER NOT NULL,
            geraet_code TEXT NOT NULL,
            datum DATE NOT NULL,
            betriebsstunden REAL DEFAULT 0.0,
            stillstand_stunden REAL DEFAULT 0.0,
            stillstand_grund TEXT,
            device_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (projekt_id) REFERENCES projekte(id) ON DELETE CASCADE
        )`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_geraete_buchungen_proj ON geraete_buchungen(projekt_id, datum)`);

        // 4. Digitale Lieferscheine vor Ort
        db.exec(`CREATE TABLE IF NOT EXISTS lieferscheine_digital (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT UNIQUE NOT NULL,
            projekt_id INTEGER NOT NULL,
            lieferant_name TEXT,
            lieferschein_nr TEXT,
            datum DATE NOT NULL,
            foto_pfad TEXT NOT NULL,
            sha256_hash TEXT NOT NULL,
            status TEXT DEFAULT 'ERFASST',
            device_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (projekt_id) REFERENCES projekte(id) ON DELETE CASCADE
        )`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_lieferscheine_proj ON lieferscheine_digital(projekt_id)`);

        // 5. Mängel-Pins & Bauplanverortung
        db.exec(`CREATE TABLE IF NOT EXISTS maengel (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT UNIQUE,
            projekt_id INTEGER NOT NULL REFERENCES projekte(id) ON DELETE CASCADE,
            plan_id INTEGER REFERENCES bauplaene(id) ON DELETE SET NULL,
            mangel_nr TEXT NOT NULL,
            x_pct REAL DEFAULT 0.0,
            y_pct REAL DEFAULT 0.0,
            titel TEXT NOT NULL,
            beschreibung TEXT,
            gewerk TEXT,
            status TEXT DEFAULT 'ERFASST',
            frist_datum DATE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_maengel_proj ON maengel(projekt_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_maengel_plan ON maengel(plan_id)`);
    } catch (e) {
        if (!e.message.includes('already exists')) console.warn('[DB Migration Warning] Phase 5 tables:', e.message);
    }

    // 6. Mängel-Pins Spaltenerweiterungen auf maengel & maengelkataster
    try { db.exec(`ALTER TABLE maengelkataster ADD COLUMN plan_id INTEGER REFERENCES bauplaene(id) ON DELETE SET NULL`); } catch (e) { if (!e.message.includes('duplicate column')) console.warn('[DB Migration Warning]:', e.message); }
    try { db.exec(`ALTER TABLE maengelkataster ADD COLUMN x_pct REAL DEFAULT 0.0`); } catch (e) { if (!e.message.includes('duplicate column')) console.warn('[DB Migration Warning]:', e.message); }
    try { db.exec(`ALTER TABLE maengelkataster ADD COLUMN y_pct REAL DEFAULT 0.0`); } catch (e) { if (!e.message.includes('duplicate column')) console.warn('[DB Migration Warning]:', e.message); }

    try { db.exec(`ALTER TABLE maengel ADD COLUMN plan_id INTEGER REFERENCES bauplaene(id) ON DELETE SET NULL`); } catch (e) { if (!e.message.includes('duplicate column')) console.warn('[DB Migration Warning]:', e.message); }
    try { db.exec(`ALTER TABLE maengel ADD COLUMN x_pct REAL DEFAULT 0.0`); } catch (e) { if (!e.message.includes('duplicate column')) console.warn('[DB Migration Warning]:', e.message); }
    try { db.exec(`ALTER TABLE maengel ADD COLUMN y_pct REAL DEFAULT 0.0`); } catch (e) { if (!e.message.includes('duplicate column')) console.warn('[DB Migration Warning]:', e.message); }

    // 7. REB 23.003 Aufmaßzeilen Erweiterungen
    try { db.exec(`ALTER TABLE aufmass_zeilen ADD COLUMN uuid TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) console.warn('[DB Migration Warning]:', e.message); }
    try { db.exec(`ALTER TABLE aufmass_zeilen ADD COLUMN raum_id INTEGER`); } catch (e) { if (!e.message.includes('duplicate column')) console.warn('[DB Migration Warning]:', e.message); }
    try { db.exec(`ALTER TABLE aufmass_zeilen ADD COLUMN formel_code TEXT DEFAULT '91'`); } catch (e) { if (!e.message.includes('duplicate column')) console.warn('[DB Migration Warning]:', e.message); }
    try { db.exec(`ALTER TABLE aufmass_zeilen ADD COLUMN rechenansatz TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) console.warn('[DB Migration Warning]:', e.message); }
    try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_aufmass_zeilen_uuid ON aufmass_zeilen(uuid)`); } catch (e) { if (!e.message.includes('already exists')) console.warn('[DB Migration Warning]:', e.message); }

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
        glaeubiger_id: '',
        sepa_xml_standard: 'pain.008.001.08',
        sepa_pre_notification_standard_tage: '14',
        matching_auto_skonto_toleranz_tage: '2',
        backup_interval_hours: '4',
        backup_auto_on_exit: 'true',
        backup_retention_days: '7',
        sync_server_port: '38400',
        sync_server_auto_start: 'true',
        sync_tls_enabled: 'false',
        ids_callback_port: '0',
        soka_betriebsnummer: '98765432',
        soka_standard_tarifgebiet: 'WEST'
    };
    const insertStmt = db.prepare('INSERT OR IGNORE INTO einstellungen (key, value) VALUES (?, ?)');
    const insertTransaction = db.transaction((defs) => {
        for (const [k, v] of Object.entries(defs)) {
            insertStmt.run(k, v);
        }
    });
    insertTransaction(defaults);

    // Standard-Zuschlagsprofil in zuschlagskalkulation_stamm seeden
    try {
        const countRow = db.prepare('SELECT COUNT(*) AS cnt FROM zuschlagskalkulation_stamm').get();
        if (!countRow || countRow.cnt === 0) {
            db.prepare(`
                INSERT INTO zuschlagskalkulation_stamm (
                    name, ist_standard, mittellohn_eur, lohngebundene_kosten_prozent, lohnnebenkosten_prozent,
                    kalkulationslohn_eur, kalkulationsverfahren, endsumme_umlage_basis,
                    zuschlag_lohn_bgk, zuschlag_lohn_agk, zuschlag_lohn_wug,
                    zuschlag_stoff_bgk, zuschlag_stoff_agk, zuschlag_stoff_wug,
                    zuschlag_geraet_bgk, zuschlag_geraet_agk, zuschlag_geraet_wug,
                    zuschlag_sonst_bgk, zuschlag_sonst_agk, zuschlag_sonst_wug,
                    zuschlag_nu_bgk, zuschlag_nu_agk, zuschlag_nu_wug,
                    wug_gewinn_prozent, wug_betriebswagnis_prozent, wug_leistungswagnis_prozent,
                    skonto_abzug_kalkulation_prozent
                ) VALUES (
                    'Standard Bau-Kalkulation (VHB 2024/2026)', 1, 26.00, 84.50, 13.50,
                    51.48, 'ZUSCHLAGSKALKULATION', 'HERSTELLKOSTEN',
                    18.00, 22.00, 8.00,
                    12.00, 14.00, 6.00,
                    15.00, 16.00, 6.00,
                    10.00, 12.00, 5.00,
                    8.00, 10.00, 4.00,
                    5.00, 2.00, 1.00,
                    0.00
                )
            `).run();
        }
    } catch (e) {
        console.warn('[DB Seed Warning] zuschlagskalkulation_stamm:', e.message);
    }

    // Standard-Mitarbeiter seeden
    try {
        const countMa = db.prepare('SELECT COUNT(*) AS cnt FROM mitarbeiter').get();
        if (!countMa || countMa.cnt === 0) {
            const seedMaStmt = db.prepare(`
                INSERT INTO mitarbeiter (personalnummer, an_nummer, vsnr, vorname, nachname, lohngruppe_id, tarif_stundensatz, ist_kolonnenfuehrer, tarifgebiet, beschaeftigungsart, aktiv)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            `);
            const maTx = db.transaction(() => {
                seedMaStmt.run('MA-101', 'AN-0101', '65120458K014', 'Max', 'Mustermann', 'LG6', 28.50, 1, 'WEST', 'GEWERBLICH');
                seedMaStmt.run('MA-102', 'AN-0102', '12050872M009', 'Stefan', 'Schmidt', 'LG4', 21.00, 0, 'WEST', 'GEWERBLICH');
                seedMaStmt.run('MA-103', 'AN-0103', '33091165P022', 'Jan', 'Kowalski', 'LG1', 15.00, 0, 'WEST', 'GEWERBLICH');
            });
            maTx();
        }
    } catch (e) {
        console.warn('[DB Seed Warning] mitarbeiter:', e.message);
    }

    // Standard-Großhändler (IDS Connect & Open Masterdata) seeden
    try {
        const countIds = db.prepare('SELECT COUNT(*) AS cnt FROM ids_connect_konten').get();
        if (!countIds || countIds.cnt === 0) {
            const seedIdsStmt = db.prepare(`
                INSERT INTO ids_connect_konten (
                    name, grosshaendler_code, shop_url, rest_api_url, kundennummer, standard_aufschlag_prozent, is_default
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            const idsTx = db.transaction(() => {
                seedIdsStmt.run('GC Gruppe (Online Plus)', 'GC_GRUPPE', 'https://onlineplus.gc-gruppe.de/ids', 'https://api.gc-gruppe.de/open-masterdata', '884920', 25.0, 1);
                seedIdsStmt.run('Richter + Frenzel', 'RICHTER_FRENZEL', 'https://shop.richter-frenzel.de/ids', 'https://api.richter-frenzel.de/open-masterdata', '441029', 25.0, 0);
                seedIdsStmt.run('Sonepar Deutschland', 'SONEPAR', 'https://www.sonepar.de/ids', 'https://api.sonepar.de/open-masterdata/v1', '109283', 25.0, 0);
                seedIdsStmt.run('Rexel Germany', 'REXEL', 'https://shop.rexel.de/ids', 'https://api.rexel.de/open-masterdata', '772154', 25.0, 0);
                seedIdsStmt.run('Adolf Würth GmbH & Co. KG', 'WUERTH', 'https://www.wuerth.de/ids', 'https://api.wuerth.de/masterdata', '992104', 30.0, 0);
            });
            idsTx();
        }
    } catch (e) {
        console.warn('[DB Seed Warning] ids_connect_konten:', e.message);
    }

    // SOKA-BAU Beitragssätze (Stand 01.07.2026 / 2027) seeden
    try {
        const countSoka = db.prepare('SELECT COUNT(*) AS cnt FROM soka_beitragssaetze').get();
        if (!countSoka || countSoka.cnt === 0) {
            const seedSokaStmt = db.prepare(`
                INSERT INTO soka_beitragssaetze (
                    gueltig_ab, gueltig_bis, tarifgebiet, ulak_prozent, zvk_prozent, bbv_prozent,
                    winterbau_ag_prozent, winterbau_an_prozent, urlaubsverguetung_prozent,
                    mindestlohn_1, mindestlohn_2, bezeichnung
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const sokaTx = db.transaction(() => {
                // Aktuelle Sätze (Stand 01.07.2026 / 2027)
                seedSokaStmt.run('2026-07-01', null, 'WEST', 14.70, 3.20, 1.45, 0.60, 0.40, 14.25, 14.35, 16.50, 'BRTV Bau 2026/2027 Tarifgebiet West (Stand 01.07.2026)');
                seedSokaStmt.run('2026-07-01', null, 'OST', 12.10, 0.80, 1.45, 0.60, 0.40, 11.40, 14.35, 14.35, 'BRTV Bau 2026/2027 Tarifgebiet Ost (Stand 01.07.2026)');
                seedSokaStmt.run('2026-07-01', null, 'BERLIN_WEST', 15.05, 3.20, 1.45, 0.60, 0.40, 14.25, 14.35, 16.50, 'BRTV Bau 2026/2027 Berlin (West)');
                seedSokaStmt.run('2026-07-01', null, 'BERLIN_OST', 12.10, 0.80, 1.45, 0.60, 0.40, 11.40, 14.35, 14.35, 'BRTV Bau 2026/2027 Berlin (Ost)');

                // Historische Sätze (bis 30.06.2026)
                seedSokaStmt.run('2024-01-01', '2026-06-30', 'WEST', 15.20, 3.20, 1.65, 0.80, 0.40, 14.25, 13.80, 15.70, 'BRTV Bau 2024-2026 Tarifgebiet West');
                seedSokaStmt.run('2024-01-01', '2026-06-30', 'OST', 14.00, 0.70, 1.65, 0.80, 0.40, 11.40, 13.80, 13.80, 'BRTV Bau 2024-2026 Tarifgebiet Ost');
            });
            sokaTx();
        }
    } catch (e) {
        console.warn('[DB Seed Warning] soka_beitragssaetze:', e.message);
    }
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
