/**
 * construction_schema.js
 */

function createSchema(db) {
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

    db.exec(`CREATE TABLE IF NOT EXISTS bautagebuch (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT UNIQUE,
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

    db.exec(`CREATE TABLE IF NOT EXISTS maengel_fotos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mangel_id INTEGER NOT NULL REFERENCES maengelkataster(id) ON DELETE CASCADE,
            dateipfad TEXT NOT NULL,
            thumbnail_base64 TEXT,
            aufnahme_datum DATETIME DEFAULT CURRENT_TIMESTAMP,
            typ TEXT DEFAULT 'VOR_NACHBESSERUNG' CHECK(typ IN ('VOR_NACHBESSERUNG', 'NACH_NACHBESSERUNG', 'BELEG')),
            kommentar TEXT
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS maengel_historie (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mangel_id INTEGER NOT NULL REFERENCES maengelkataster(id) ON DELETE CASCADE,
            alter_status TEXT,
            neuer_status TEXT NOT NULL,
            geaendert_am DATETIME DEFAULT CURRENT_TIMESTAMP,
            geaendert_von TEXT,
            kommentar TEXT
        )`);

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

}

module.exports = {
    createSchema
};
