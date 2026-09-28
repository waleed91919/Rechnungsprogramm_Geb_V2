/**
 * db/schema/gaeb_schema.js
 * Modulares Datenmodell für GAEB DA XML X83 Ausschreibungsdaten.
 * 
 * Trennt GAEB-Ausschreibungsstrukturen sauber von bepreisten Rechnungen (dokumente)
 * und Positionen (positionen) ab.
 */

function initGaebSchema(db) {
    // 1. gaeb_imports: Kopfdaten & Revisionssichere Original-XML-Ablage
    db.exec(`CREATE TABLE IF NOT EXISTS gaeb_imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_name TEXT NOT NULL,
        gaeb_version TEXT,
        exchange_phase TEXT,
        project_name TEXT,
        project_id_ext TEXT,
        currency TEXT DEFAULT 'EUR',
        file_hash TEXT NOT NULL,
        file_size INTEGER,
        raw_bytes BLOB,
        raw_xml TEXT,
        imported_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_gaeb_imports_file_hash ON gaeb_imports(file_hash)`);
    } catch (e) {
        console.error('[GAEB Schema] Index idx_gaeb_imports_file_hash:', e.message);
    }

    // 2. gaeb_categories: BoQCtgy-Hierarchie (Gewerke, Abschnitte, Titel)
    db.exec(`CREATE TABLE IF NOT EXISTS gaeb_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        import_id INTEGER NOT NULL REFERENCES gaeb_imports(id) ON DELETE CASCADE,
        parent_id INTEGER REFERENCES gaeb_categories(id) ON DELETE CASCADE,
        cat_level INTEGER NOT NULL,
        sort_index INTEGER NOT NULL,
        lbl_ctgy TEXT,
        rno_part TEXT,
        path_oz TEXT,
        name TEXT,
        description TEXT,
        raw_metadata_json TEXT
    )`);
    try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_gaeb_categories_import ON gaeb_categories(import_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_gaeb_categories_parent ON gaeb_categories(parent_id)`);
    } catch (e) {
        console.error('[GAEB Schema] Indizes gaeb_categories:', e.message);
    }

    // 3. gaeb_items: Positionen & Hinweistexte
    db.exec(`CREATE TABLE IF NOT EXISTS gaeb_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        import_id INTEGER NOT NULL REFERENCES gaeb_imports(id) ON DELETE CASCADE,
        category_id INTEGER REFERENCES gaeb_categories(id) ON DELETE CASCADE,
        sort_index INTEGER NOT NULL,
        path_oz TEXT NOT NULL,
        rno_part TEXT,
        item_type TEXT NOT NULL,
        short_text TEXT,
        long_text TEXT,
        menge REAL,
        is_qty_tbd INTEGER NOT NULL DEFAULT 0,
        einheit TEXT,
        preis REAL,
        gesamtpreis REAL,
        is_price_missing INTEGER NOT NULL DEFAULT 1,
        in_endsumme_enthalten INTEGER NOT NULL DEFAULT 1,
        aln_group_no TEXT,
        aln_ser_no TEXT,
        provis TEXT,
        is_hinweistext INTEGER NOT NULL DEFAULT 0,
        linked_position_id INTEGER,
        raw_metadata_json TEXT
    )`);
    try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_gaeb_items_import ON gaeb_items(import_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_gaeb_items_category ON gaeb_items(category_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_gaeb_items_path_oz ON gaeb_items(path_oz)`);
    } catch (e) {
        console.error('[GAEB Schema] Indizes gaeb_items:', e.message);
    }

    // 4. gaeb_item_bireq: Bietertextergänzungen (<BiReq>)
    db.exec(`CREATE TABLE IF NOT EXISTS gaeb_item_bireq (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL REFERENCES gaeb_items(id) ON DELETE CASCADE,
        sort_index INTEGER NOT NULL,
        bireq_type TEXT,
        label TEXT,
        description TEXT,
        value TEXT
    )`);
    try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_gaeb_item_bireq_item ON gaeb_item_bireq(item_id)`);
    } catch (e) {
        console.error('[GAEB Schema] Index idx_gaeb_item_bireq_item:', e.message);
    }

    // 5. gaeb_item_up_components: Einheitspreis-Aufgliederung (<UPComponents>)
    db.exec(`CREATE TABLE IF NOT EXISTS gaeb_item_up_components (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL REFERENCES gaeb_items(id) ON DELETE CASCADE,
        lohn REAL,
        stoff REAL,
        geraet REAL,
        sonstiges REAL,
        total REAL
    )`);
    try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_gaeb_item_up_components_item ON gaeb_item_up_components(item_id)`);
    } catch (e) {
        console.error('[GAEB Schema] Index idx_gaeb_item_up_components_item:', e.message);
    }

    // 6. gaeb_import_angebote: Reale, SQLite-gestützte Verknüpfung mit echten Angebotsversionen in dokumente
    db.exec(`CREATE TABLE IF NOT EXISTS gaeb_import_angebote (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        import_id INTEGER NOT NULL REFERENCES gaeb_imports(id) ON DELETE RESTRICT,
        angebot_id INTEGER NOT NULL REFERENCES dokumente(id) ON DELETE RESTRICT,
        linked_at TEXT DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        UNIQUE(import_id, angebot_id)
    )`);
    try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_gaeb_import_angebote_import ON gaeb_import_angebote(import_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_gaeb_import_angebote_angebot ON gaeb_import_angebote(angebot_id)`);
    } catch (e) {
        console.error('[GAEB Schema] Indizes gaeb_import_angebote:', e.message);
    }

    // Trigger zur datenbankseitigen Erzwingung des Dokument-Typs 'angebot'
    try {
        db.exec(`
            CREATE TRIGGER IF NOT EXISTS trg_validate_gaeb_import_angebot_type
            BEFORE INSERT ON gaeb_import_angebote
            FOR EACH ROW
            WHEN (SELECT type FROM dokumente WHERE id = NEW.angebot_id) != 'angebot'
            BEGIN
                SELECT RAISE(ABORT, 'Ungültige Verknüpfung: Das referenzierte Dokument muss vom Typ angebot sein.');
            END;

            CREATE TRIGGER IF NOT EXISTS trg_validate_gaeb_import_angebot_type_update
            BEFORE UPDATE OF angebot_id ON gaeb_import_angebote
            FOR EACH ROW
            WHEN (SELECT type FROM dokumente WHERE id = NEW.angebot_id) != 'angebot'
            BEGIN
                SELECT RAISE(ABORT, 'Ungültige Verknüpfung: Das referenzierte Dokument muss vom Typ angebot sein.');
            END;
        `);
    } catch (e) {
        console.error('[GAEB Schema] Trigger trg_validate_gaeb_import_angebot_type:', e.message);
    }

    // 7. gaeb_tender_drafts: Bepreisungsentwürfe & Verhandlungsstände
    db.exec(`CREATE TABLE IF NOT EXISTS gaeb_tender_drafts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        import_id INTEGER NOT NULL REFERENCES gaeb_imports(id) ON DELETE RESTRICT,
        angebot_id INTEGER REFERENCES dokumente(id) ON DELETE SET NULL,
        version INTEGER NOT NULL DEFAULT 1,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'IN_BEARBEITUNG',
        total_netto REAL DEFAULT 0,
        total_tax REAL DEFAULT 0,
        total_brutto REAL DEFAULT 0,
        unpriced_count INTEGER DEFAULT 0,
        missing_bireq_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_gaeb_tender_drafts_import ON gaeb_tender_drafts(import_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_gaeb_tender_drafts_angebot ON gaeb_tender_drafts(angebot_id)`);
    } catch (e) {
        console.error('[GAEB Schema] Indizes gaeb_tender_drafts:', e.message);
    }

    // 8. gaeb_tender_item_prices: Positions-Preise des Entwurfs
    db.exec(`CREATE TABLE IF NOT EXISTS gaeb_tender_item_prices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        draft_id INTEGER NOT NULL REFERENCES gaeb_tender_drafts(id) ON DELETE CASCADE,
        gaeb_item_id INTEGER NOT NULL REFERENCES gaeb_items(id) ON DELETE RESTRICT,
        unit_price REAL,
        is_zero_confirmed INTEGER NOT NULL DEFAULT 0,
        total_price REAL,
        tax_rate REAL DEFAULT 19.0,
        in_total INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(draft_id, gaeb_item_id)
    )`);
    try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_gaeb_item_prices_draft ON gaeb_tender_item_prices(draft_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_gaeb_item_prices_item ON gaeb_tender_item_prices(gaeb_item_id)`);
    } catch (e) {
        console.error('[GAEB Schema] Indizes gaeb_tender_item_prices:', e.message);
    }

    // 9. gaeb_tender_bireq_answers: Bieterangaben-Antworten des Entwurfs
    db.exec(`CREATE TABLE IF NOT EXISTS gaeb_tender_bireq_answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        draft_id INTEGER NOT NULL REFERENCES gaeb_tender_drafts(id) ON DELETE CASCADE,
        gaeb_bireq_id INTEGER NOT NULL REFERENCES gaeb_item_bireq(id) ON DELETE RESTRICT,
        answer_value TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(draft_id, gaeb_bireq_id)
    )`);
    try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_gaeb_bireq_answers_draft ON gaeb_tender_bireq_answers(draft_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_gaeb_bireq_answers_bireq ON gaeb_tender_bireq_answers(gaeb_bireq_id)`);
    } catch (e) {
        console.error('[GAEB Schema] Indizes gaeb_tender_bireq_answers:', e.message);
    }
}

function runGaebMigrations(db) {
    // 1. Initialisiere / erstelle alle Basistabellen und Indizes idempotent
    initGaebSchema(db);

    // 2. Trigger sicherstellen
    try {
        db.exec(`
            CREATE TRIGGER IF NOT EXISTS trg_validate_gaeb_import_angebot_type
            BEFORE INSERT ON gaeb_import_angebote
            FOR EACH ROW
            WHEN (SELECT type FROM dokumente WHERE id = NEW.angebot_id) != 'angebot'
            BEGIN
                SELECT RAISE(ABORT, 'Ungültige Verknüpfung: Das referenzierte Dokument muss vom Typ angebot sein.');
            END;

            CREATE TRIGGER IF NOT EXISTS trg_validate_gaeb_import_angebot_type_update
            BEFORE UPDATE OF angebot_id ON gaeb_import_angebote
            FOR EACH ROW
            WHEN (SELECT type FROM dokumente WHERE id = NEW.angebot_id) != 'angebot'
            BEGIN
                SELECT RAISE(ABORT, 'Ungültige Verknüpfung: Das referenzierte Dokument muss vom Typ angebot sein.');
            END;
        `);
    } catch (e) {
        // Falls dokumente-Tabelle in isolierten Tests noch nicht existiert
    }

    // 3. Migration: raw_bytes Spalte zu gaeb_imports hinzufügen, falls Alt-Tabelle ohne Spalte vorliegt
    try {
        const tableInfo = db.prepare(`PRAGMA table_info(gaeb_imports)`).all();
        if (tableInfo && tableInfo.length > 0) {
            const hasRawBytes = tableInfo.some(col => col.name === 'raw_bytes');
            if (!hasRawBytes) {
                db.exec(`ALTER TABLE gaeb_imports ADD COLUMN raw_bytes BLOB;`);
            }
        }
    } catch (e) {
        console.error('[GAEB Migration] Fehler bei raw_bytes Migration:', e.message);
    }
}

module.exports = {
    initGaebSchema,
    runGaebMigrations
};
