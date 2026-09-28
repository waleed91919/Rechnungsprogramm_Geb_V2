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
}

function runGaebMigrations(db) {
    // Stellt sicher, dass das GAEB-Schema auch auf Alt-Datenbanken idempotent initialisiert wird.
    initGaebSchema(db);
}

module.exports = {
    initGaebSchema,
    runGaebMigrations
};
