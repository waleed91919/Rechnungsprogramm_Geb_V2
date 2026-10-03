/**
 * recurring_schema.js
 */

function createSchema(db) {
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

}

module.exports = {
    createSchema
};
