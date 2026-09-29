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
        unresolved_qty_tbd_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(import_id, version)
    )`);
    try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_gaeb_tender_drafts_import ON gaeb_tender_drafts(import_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_gaeb_tender_drafts_angebot ON gaeb_tender_drafts(angebot_id)`);
    } catch (e) {
        console.error('[GAEB Schema] Indizes gaeb_tender_drafts:', e.message);
    }

    // Sicherstellen, dass unresolved_qty_tbd_count existiert, falls gaeb_tender_drafts bereits als Alt-Tabelle existierte
    ensureDraftColumns(db);

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

    // 10. Schutz-Trigger und Unique-Index installieren und verifizieren (kein stiller catch!)
    installGaebTriggersAndIndices(db);
    verifyGaebTriggersAndIndices(db);
}

const REQUIRED_GAEB_TRIGGERS = [
    'trg_validate_gaeb_import_angebot_type',
    'trg_validate_gaeb_import_angebot_type_update',
    'trg_validate_gaeb_tender_draft_angebot_type',
    'trg_validate_gaeb_tender_draft_angebot_type_update',
    'trg_prevent_type_change_linked_gaeb_angebot'
];

const REQUIRED_GAEB_INDICES = [
    'idx_gaeb_tender_drafts_import_version'
];

/**
 * Stellt sicher, dass alle Spalten von gaeb_tender_drafts vorhanden sind.
 */
function ensureDraftColumns(db) {
    const draftsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='gaeb_tender_drafts'").get();
    if (!draftsTable) return;
    const cols = db.prepare(`PRAGMA table_info(gaeb_tender_drafts)`).all().map(c => c.name);
    if (!cols.includes('unresolved_qty_tbd_count')) {
        db.exec(`ALTER TABLE gaeb_tender_drafts ADD COLUMN unresolved_qty_tbd_count INTEGER DEFAULT 0;`);
    }
}

/**
 * Sichere, nicht-destruktive Bereinigung eventueller Altdaten mit doppeltem (import_id, version).
 */
function deduplicateDraftVersions(db) {
    const draftsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='gaeb_tender_drafts'").get();
    if (!draftsTable) return;

    const duplicates = db.prepare(`
        SELECT import_id, version, COUNT(*) as cnt
        FROM gaeb_tender_drafts
        GROUP BY import_id, version
        HAVING COUNT(*) > 1
    `).all();

    if (duplicates && duplicates.length > 0) {
        for (const dup of duplicates) {
            const rows = db.prepare(`
                SELECT id FROM gaeb_tender_drafts
                WHERE import_id = ? AND version = ?
                ORDER BY id ASC
            `).all(dup.import_id, dup.version);

            const maxVerRow = db.prepare(`
                SELECT COALESCE(MAX(version), 0) AS max_v
                FROM gaeb_tender_drafts
                WHERE import_id = ?
            `).get(dup.import_id);
            let currentMax = maxVerRow ? maxVerRow.max_v : 0;

            for (let i = 1; i < rows.length; i++) {
                currentMax++;
                db.prepare(`
                    UPDATE gaeb_tender_drafts
                    SET version = ?, name = name || ' (v' || ? || ')'
                    WHERE id = ?
                `).run(currentMax, currentMax, rows[i].id);
            }
        }
    }
}

/**
 * Installiert die 5 Schutz-Trigger und den Unique-Index.
 * Wirft bei Fehlern sofort und ungefangen eine Exception.
 */
function installGaebTriggersAndIndices(db) {
    const docTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dokumente'").get();
    if (!docTable) {
        throw new Error('Integritätsfehler: Tabelle "dokumente" existiert nicht. GAEB-Schutztrigger können nicht installiert werden.');
    }

    // Trigger 1 & 2: Typüberprüfung bei gaeb_import_angebote
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

    // Trigger 3 & 4: Typüberprüfung bei gaeb_tender_drafts
    db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_validate_gaeb_tender_draft_angebot_type
        BEFORE INSERT ON gaeb_tender_drafts
        FOR EACH ROW
        WHEN NEW.angebot_id IS NOT NULL AND (SELECT type FROM dokumente WHERE id = NEW.angebot_id) != 'angebot'
        BEGIN
            SELECT RAISE(ABORT, 'Ungültige Verknüpfung: Das referenzierte Dokument im Entwurf muss vom Typ angebot sein.');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_validate_gaeb_tender_draft_angebot_type_update
        BEFORE UPDATE OF angebot_id ON gaeb_tender_drafts
        FOR EACH ROW
        WHEN NEW.angebot_id IS NOT NULL AND (SELECT type FROM dokumente WHERE id = NEW.angebot_id) != 'angebot'
        BEGIN
            SELECT RAISE(ABORT, 'Ungültige Verknüpfung: Das referenzierte Dokument im Entwurf muss vom Typ angebot sein.');
        END;
    `);

    // Trigger 5: Typänderungsschutz auf dokumente
    db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_prevent_type_change_linked_gaeb_angebot
        BEFORE UPDATE OF type ON dokumente
        FOR EACH ROW
        WHEN OLD.type = 'angebot' AND NEW.type != 'angebot'
        BEGIN
            SELECT RAISE(ABORT, 'Änderung des Dokumenttyps verweigert: Dieses Angebot ist mit einer GAEB-Ausschreibung verknüpft.')
            WHERE EXISTS (SELECT 1 FROM gaeb_import_angebote WHERE angebot_id = OLD.id)
               OR EXISTS (SELECT 1 FROM gaeb_tender_drafts WHERE angebot_id = OLD.id);
        END;
    `);

    // Deduplizieren und Unique-Index sicherstellen
    deduplicateDraftVersions(db);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_gaeb_tender_drafts_import_version ON gaeb_tender_drafts(import_id, version);`);
}

/**
 * Überprüft explizit in sqlite_master, ob alle erforderlichen Schutz-Trigger und Indizes aktiv sind.
 * Wirft eine aussagekräftige Exception, falls ein Element fehlt.
 */
function verifyGaebTriggersAndIndices(db) {
    const triggerRows = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all();
    const triggerSet = new Set(triggerRows.map(r => r.name));
    const missingTriggers = REQUIRED_GAEB_TRIGGERS.filter(name => !triggerSet.has(name));

    if (missingTriggers.length > 0) {
        throw new Error(
            `Integritätsfehler: Folgende erforderliche GAEB-Trigger fehlen in sqlite_master: ${missingTriggers.join(', ')}`
        );
    }

    const indexRows = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all();
    const indexSet = new Set(indexRows.map(r => r.name));
    const missingIndices = REQUIRED_GAEB_INDICES.filter(name => !indexSet.has(name));

    if (missingIndices.length > 0) {
        throw new Error(
            `Integritätsfehler: Folgende erforderliche GAEB-Indizes fehlen in sqlite_master: ${missingIndices.join(', ')}`
        );
    }
}

/**
 * Berechnet die Zähler für unbepreiste Positionen, fehlende BiReqs und offene QtyTBD-Positionen
 * für einen Entwurf deterministisch und konsistent.
 */
function calculateDraftCounts(db, draftId, importId) {
    const qtyTbdRow = db.prepare(`
        SELECT COUNT(i.id) AS cnt
        FROM gaeb_items i
        LEFT JOIN gaeb_tender_item_prices p ON p.gaeb_item_id = i.id AND p.draft_id = ?
        WHERE i.import_id = ? 
          AND i.is_hinweistext = 0 
          AND COALESCE(p.in_total, i.in_endsumme_enthalten, 1) = 1
          AND (i.is_qty_tbd = 1 OR i.menge IS NULL)
    `).get(draftId, importId);
    const unresolvedQtyTbdCount = qtyTbdRow ? qtyTbdRow.cnt : 0;

    const unpricedRow = db.prepare(`
        SELECT COUNT(i.id) AS cnt 
        FROM gaeb_items i
        LEFT JOIN gaeb_tender_item_prices p ON p.gaeb_item_id = i.id AND p.draft_id = ?
        WHERE i.import_id = ? AND i.is_hinweistext = 0 AND (p.unit_price IS NULL)
    `).get(draftId, importId);
    const unpricedCount = unpricedRow ? unpricedRow.cnt : 0;

    const missingBireqRow = db.prepare(`
        SELECT COUNT(b.id) AS cnt
        FROM gaeb_item_bireq b
        JOIN gaeb_items i ON b.item_id = i.id
        LEFT JOIN gaeb_tender_bireq_answers a ON a.gaeb_bireq_id = b.id AND a.draft_id = ?
        WHERE i.import_id = ? AND (a.answer_value IS NULL OR TRIM(a.answer_value) = '')
    `).get(draftId, importId);
    const missingBireqCount = missingBireqRow ? missingBireqRow.cnt : 0;

    return {
        unresolvedQtyTbdCount,
        unpricedCount,
        missingBireqCount
    };
}

/**
 * Berechnet für jeden bestehenden Entwurf den echten Wert von unresolved_qty_tbd_count
 * und korrigiert den Status von VOLLSTAENDIG_BEPREIST auf IN_BEARBEITUNG, falls Blocker vorliegen.
 * VERWORFEN bleibt zwingend VERWORFEN.
 */
function reconcileLegacyDrafts(db) {
    const draftsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='gaeb_tender_drafts'").get();
    if (!draftsTable) return;

    const drafts = db.prepare('SELECT id, import_id, status FROM gaeb_tender_drafts').all();
    if (!drafts || drafts.length === 0) return;

    const updateStmt = db.prepare(`
        UPDATE gaeb_tender_drafts
        SET unresolved_qty_tbd_count = ?,
            unpriced_count = ?,
            missing_bireq_count = ?,
            status = ?
        WHERE id = ?
    `);

    for (const draft of drafts) {
        const counts = calculateDraftCounts(db, draft.id, draft.import_id);

        let newStatus = draft.status;
        if (draft.status === 'VERWORFEN') {
            // WICHTIG: Ein Entwurf mit status = 'VERWORFEN' bleibt zwingend VERWORFEN (niemals reaktivieren!)
            newStatus = 'VERWORFEN';
        } else if (draft.status === 'VOLLSTAENDIG_BEPREIST') {
            // Wenn status = 'VOLLSTAENDIG_BEPREIST' war, aber nun unresolved_qty_tbd_count > 0
            // (oder unbepreiste Positionen/fehlende BiReq vorhanden sind): Setze status = 'IN_BEARBEITUNG'!
            if (counts.unresolvedQtyTbdCount > 0 || counts.unpricedCount > 0 || counts.missingBireqCount > 0) {
                newStatus = 'IN_BEARBEITUNG';
            }
        }

        updateStmt.run(
            counts.unresolvedQtyTbdCount,
            counts.unpricedCount,
            counts.missingBireqCount,
            newStatus,
            draft.id
        );
    }
}

function runGaebMigrations(db) {
    if (!db) throw new Error('Datenbankverbindung erforderlich.');

    // 1. Initialisiere / erstelle alle Basistabellen, Trigger und Indizes
    initGaebSchema(db);

    // 2. Transaktionale Altdaten-Migration
    db.transaction(() => {
        // 2.1. Migration: raw_bytes Spalte zu gaeb_imports hinzufügen, falls Alt-Tabelle ohne Spalte vorliegt
        const tableInfo = db.prepare(`PRAGMA table_info(gaeb_imports)`).all();
        if (tableInfo && tableInfo.length > 0) {
            const hasRawBytes = tableInfo.some(col => col.name === 'raw_bytes');
            if (!hasRawBytes) {
                db.exec(`ALTER TABLE gaeb_imports ADD COLUMN raw_bytes BLOB;`);
            }
        }

        // 2.2. Migration: gaeb_tender_drafts Spalten, Deduplizierung und QtyTBD-Status-Aktualisierung
        const draftsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='gaeb_tender_drafts'").get();
        if (draftsTable) {
            ensureDraftColumns(db);
            deduplicateDraftVersions(db);
            db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_gaeb_tender_drafts_import_version ON gaeb_tender_drafts(import_id, version);`);
            reconcileLegacyDrafts(db);
        }
    })();

    // 3. Verifikation aller Trigger und Unique-Index
    verifyGaebTriggersAndIndices(db);
}

module.exports = {
    initGaebSchema,
    runGaebMigrations,
    calculateDraftCounts,
    installGaebTriggersAndIndices,
    verifyGaebTriggersAndIndices,
    REQUIRED_GAEB_TRIGGERS,
    REQUIRED_GAEB_INDICES
};
