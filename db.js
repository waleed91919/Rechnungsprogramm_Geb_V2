const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let dbPath;
try {
    // Try to get the path from Electron's app module
    const { app } = require('electron');
    if (app) {
        dbPath = path.join(app.getPath('userData'), 'database.sqlite');
    } else {
        dbPath = path.join(__dirname, 'database.sqlite');
    }
} catch (e) {
    // Fallback for testing or scripts outside of Electron
    dbPath = path.join(__dirname, 'database.sqlite');
}

console.log('Database path:', dbPath);
const db = new Database(dbPath, { verbose: console.log });

// Enable security and performance features (WAL Mode, Foreign Keys)
db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA temp_store = MEMORY;
    PRAGMA mmap_size = 30000000000;
    PRAGMA page_size = 4096;
`);

console.log('Connected to the SQLite database using better-sqlite3 (Expert Mode).');
initDb();

function initDb() {
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

    try {
        db.exec(`ALTER TABLE kunden ADD COLUMN createdAt TEXT`);
        // Manually set existing to an old date to avoid null issues or leave null
    } catch (e) {
        // Ignore if column already exists
    }

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

    try {
        db.exec(`ALTER TABLE aufmass ADD COLUMN position_id TEXT`);
    } catch (e) {
        // Column already exists
    }

    try {
        db.exec(`ALTER TABLE aufmass ADD COLUMN einheit TEXT`);
    } catch (e) {
        // Column already exists
    }

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

    try {
        db.exec(`ALTER TABLE positionen ADD COLUMN ek REAL DEFAULT 0`);
    } catch (e) {
        // Column already exists
    }

    try {
        db.exec(`ALTER TABLE positionen ADD COLUMN einheit TEXT DEFAULT 'Stk.'`);
    } catch (e) {
        // Column already exists
    }

    try {
        db.exec(`ALTER TABLE positionen ADD COLUMN name TEXT`);
    } catch (e) {
        // Column already exists
    }

    try {
        db.exec(`ALTER TABLE dokumente ADD COLUMN mahnungLevel INTEGER DEFAULT 0`);
    } catch (e) { }
    try {
        db.exec(`ALTER TABLE dokumente ADD COLUMN mahnungDatum TEXT`);
    } catch (e) { }
    try {
        db.exec(`ALTER TABLE dokumente ADD COLUMN mahnungGebuehr REAL DEFAULT 0`);
    } catch (e) { }
    try {
        db.exec(`ALTER TABLE dokumente ADD COLUMN globalRabattType TEXT DEFAULT '%'`);
    } catch (e) { }
    try {
        db.exec(`ALTER TABLE dokumente ADD COLUMN globalRabattValue REAL DEFAULT 0`);
    } catch (e) { }
    try {
        db.exec(`ALTER TABLE dokumente ADD COLUMN eingabemodus TEXT DEFAULT 'netto'`);
    } catch (e) { }

    // --- Artikel Erweiterungen ---
    try { db.exec(`ALTER TABLE artikel ADD COLUMN ist_bauleistung INTEGER DEFAULT 0`); } catch (e) { }
    try { db.exec(`ALTER TABLE artikel ADD COLUMN kostenart TEXT DEFAULT 'MATERIAL'`); } catch (e) { }
    try { db.exec(`ALTER TABLE artikel ADD COLUMN lohnanteil_prozent REAL DEFAULT 0`); } catch (e) { }

    // --- Kunden Erweiterungen ---
    try { db.exec(`ALTER TABLE kunden ADD COLUMN ist_bauleistender_13b INTEGER DEFAULT 0`); } catch (e) { }
    try { db.exec(`ALTER TABLE kunden ADD COLUMN ust_1_tg_gueltig_bis TEXT`); } catch (e) { }
    try { db.exec(`ALTER TABLE kunden ADD COLUMN hat_freistellungsbescheinigung INTEGER DEFAULT 0`); } catch (e) { }
    try { db.exec(`ALTER TABLE kunden ADD COLUMN freistellung_gueltig_bis TEXT`); } catch (e) { }
    try { db.exec(`ALTER TABLE kunden ADD COLUMN ist_umsatzsteuerfreie_vermietung INTEGER DEFAULT 0`); } catch (e) { }
    try { db.exec(`ALTER TABLE kunden ADD COLUMN customer_type TEXT DEFAULT 'B2C'`); } catch (e) { }
    try { db.exec(`ALTER TABLE kunden ADD COLUMN leitweg_id TEXT`); } catch (e) { }
    try { db.exec(`ALTER TABLE kunden ADD COLUMN peppol_id TEXT`); } catch (e) { }
    try { db.exec(`ALTER TABLE kunden ADD COLUMN buyer_reference TEXT`); } catch (e) { }
    try { db.exec(`ALTER TABLE kunden ADD COLUMN tax_number TEXT`); } catch (e) { }
    try { db.exec(`ALTER TABLE kunden ADD COLUMN sec48b_status TEXT DEFAULT 'NONE'`); } catch (e) { }
    try { db.exec(`ALTER TABLE kunden ADD COLUMN sec48b_certificate_path TEXT`); } catch (e) { }

    // --- Dokumente Erweiterungen ---
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN vortext TEXT`); } catch (e) { }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN fusstext TEXT`); } catch (e) { }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN leistungszeitraum_von TEXT`); } catch (e) { }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN leistungszeitraum_bis TEXT`); } catch (e) { }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN baustellen_adresse TEXT`); } catch (e) { }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN vob_vereinbart INTEGER DEFAULT 0`); } catch (e) { }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN ist_privatkunde INTEGER DEFAULT 0`); } catch (e) { }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN unterliegt_bauabzugsteuer INTEGER DEFAULT 0`); } catch (e) { }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN unterliegt_13b INTEGER DEFAULT 0`); } catch (e) { }
    try { db.exec(`ALTER TABLE positionen ADD COLUMN is13b INTEGER DEFAULT 0`); } catch (e) { }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN bauabzugsteuer_betrag REAL DEFAULT 0`); } catch (e) { }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN ausweis_35a_erforderlich INTEGER DEFAULT 0`); } catch (e) { }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN summe_lohnkosten_brutto REAL DEFAULT 0`); } catch (e) { }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN rechnungsart TEXT DEFAULT 'REGULAER'`); } catch (e) { }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN kumulierte_leistung_netto REAL DEFAULT 0`); } catch (e) { }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN sicherheitseinbehalt REAL DEFAULT 0`); } catch (e) { }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN leitweg_id TEXT`); } catch (e) { }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN buyer_reference TEXT`); } catch (e) { }
    try { db.exec(`ALTER TABLE dokumente ADD COLUMN sha256_hash TEXT`); } catch (e) { }

    // --- Positionen Erweiterungen ---
    try { db.exec(`ALTER TABLE positionen ADD COLUMN steuer_schluessel INTEGER`); } catch (e) { }
    try { db.exec(`ALTER TABLE positionen ADD COLUMN cost_type TEXT DEFAULT 'MATERIAL'`); } catch (e) { }
    try { db.exec(`ALTER TABLE positionen ADD COLUMN oz_code TEXT`); } catch (e) { }
    try { db.exec(`ALTER TABLE positionen ADD COLUMN is_tax_deductible_35a INTEGER DEFAULT 0`); } catch (e) { }

    // --- Projekte Erweiterungen ---
    try { db.exec(`ALTER TABLE projekte ADD COLUMN sicherheitseinbehalt_prozent REAL DEFAULT 0`); } catch (e) { }
    try { db.exec(`ALTER TABLE projekte ADD COLUMN gaeb_phase TEXT`); } catch (e) { }
    try { db.exec(`ALTER TABLE projekte ADD COLUMN hoai_vob_flag TEXT DEFAULT 'VOB'`); } catch (e) { }

    // --- Neue Tabelle: rechnung_verrechnungen ---
    db.exec(`CREATE TABLE IF NOT EXISTS rechnung_verrechnungen (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        aktuelle_rechnung_id INTEGER,
        vorherige_rechnung_id INTEGER,
        abzugsbetrag_netto REAL DEFAULT 0,
        FOREIGN KEY(aktuelle_rechnung_id) REFERENCES dokumente(id),
        FOREIGN KEY(vorherige_rechnung_id) REFERENCES dokumente(id)
    )`);

    // --- Neue Tabelle: invoice_cumulative_states (VOB/B Kumulierte Abschlagsrechnungen) ---
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

    // --- Neue Tabelle: security_retentions (VOB/B Sicherheitseinbehalte & Gewährleitung) ---
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

    // --- Neue Tabelle: audit_logs (GoBD Kryptografische Beleg-Historie) ---
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

    db.exec(`CREATE TABLE IF NOT EXISTS einstellungen (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);

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

// Utility wrappers exposing Promises to conform to the previous API signature
const dbQuery = async (sql, params = []) => {
    return db.prepare(sql).all(params);
};

const dbRun = async (sql, params = []) => {
    const info = db.prepare(sql).run(params);
    return { id: info.lastInsertRowid, changes: info.changes };
};

const dbAPI = {
    // --- Initial Full State Load (for init.js) ---
    async getFullState() {
        const state = {
            artikel: await dbQuery('SELECT * FROM artikel'),
            kunden: await dbQuery('SELECT * FROM kunden'),
            rechnungen: [],
            angebote: [],
            projekte: await dbQuery('SELECT * FROM projekte'),
            einstellungen: {}
        };

        // Load settings
        const settingsRows = await dbQuery('SELECT * FROM einstellungen');
        settingsRows.forEach(row => state.einstellungen[row.key] = row.value);

        // Load documents
        const docs = await dbQuery('SELECT * FROM dokumente');
        const posRows = await dbQuery('SELECT * FROM positionen');
        const verrechnungenRows = await dbQuery('SELECT * FROM rechnung_verrechnungen');

        docs.forEach(d => {
            d.isLocked = !!d.isLocked; // Convert 1/0 to true/false
            d.positionen = posRows.filter(p => p.dokumentId === d.id);
            d.verrechnungen = verrechnungenRows.filter(v => v.aktuelle_rechnung_id === d.id);
            if (d.type === 'rechnung') {
                state.rechnungen.push(d);
            } else if (d.type === 'angebot') {
                state.angebote.push(d);
            }
        });

        // Load aufmasse
        const aufmassRows = await dbQuery('SELECT * FROM aufmass');
        const aufmassPosRows = await dbQuery('SELECT * FROM aufmass_positionen');
        aufmassRows.forEach(a => {
            a.positionen = aufmassPosRows.filter(p => p.aufmass_id === a.id);
        });
        state.aufmasse = aufmassRows;

        return state;
    },

    // --- Aufmaß ---
    async getAufmassById(id) {
        const aufmass = db.prepare('SELECT * FROM aufmass WHERE id=?').get(id);
        if (aufmass) {
            aufmass.positionen = db.prepare('SELECT * FROM aufmass_positionen WHERE aufmass_id=? ORDER BY sortier_index ASC').all(id);
        }
        return aufmass || null;
    },

    async getAufmassByPositionId(positionId) {
        if (!positionId) return null;
        const posIdStr = String(positionId);
        const aufmass = db.prepare('SELECT * FROM aufmass WHERE position_id=?').get(posIdStr);
        if (aufmass) {
            aufmass.positionen = db.prepare('SELECT * FROM aufmass_positionen WHERE aufmass_id=? ORDER BY sortier_index ASC').all(aufmass.id);
        }
        return aufmass || null;
    },

    async saveAufmassForPosition(positionId, data) {
        if (!positionId) return null;
        const posIdStr = String(positionId);

        const saveTransaction = db.transaction((aufmassData) => {
            let existing = db.prepare('SELECT id FROM aufmass WHERE position_id=?').get(posIdStr);
            let aufmassId;

            if (existing) {
                aufmassId = existing.id;
                db.prepare('UPDATE aufmass SET titel=?, rechnung_id=?, projekt_id=?, bemerkung=?, einheit=? WHERE id=?')
                  .run(aufmassData.titel || ('Aufmaß Position ' + posIdStr), aufmassData.rechnung_id || null, aufmassData.projekt_id || null, aufmassData.bemerkung || '', aufmassData.einheit || 'm²', aufmassId);
                db.prepare('DELETE FROM aufmass_positionen WHERE aufmass_id=?').run(aufmassId);
            } else {
                const info = db.prepare('INSERT INTO aufmass (position_id, titel, rechnung_id, projekt_id, bemerkung, einheit) VALUES (?, ?, ?, ?, ?, ?)')
                  .run(posIdStr, aufmassData.titel || ('Aufmaß Position ' + posIdStr), aufmassData.rechnung_id || null, aufmassData.projekt_id || null, aufmassData.bemerkung || '', aufmassData.einheit || 'm²');
                aufmassId = info.lastInsertRowid;
            }

            if (aufmassData.positionen && Array.isArray(aufmassData.positionen)) {
                const insertPos = db.prepare('INSERT INTO aufmass_positionen (aufmass_id, raum, bezeichnung, formel, ergebnis, einheit, sortier_index) VALUES (?, ?, ?, ?, ?, ?, ?)');
                aufmassData.positionen.forEach((p, idx) => {
                    const label = p.raum || p.bezeichnung || '';
                    insertPos.run(aufmassId, label, label, p.formel || '', p.ergebnis || 0, p.einheit || 'm²', idx);
                });
            }

            return aufmassId;
        });

        return saveTransaction(data);
    },

    async getAufmasseByRechnungId(rechnungId) {
        const list = db.prepare('SELECT * FROM aufmass WHERE rechnung_id=?').all(rechnungId);
        list.forEach(a => {
            a.positionen = db.prepare('SELECT * FROM aufmass_positionen WHERE aufmass_id=? ORDER BY sortier_index ASC').all(a.id);
        });
        return list;
    },

    async getAufmasseByProjektId(projektId) {
        const list = db.prepare('SELECT * FROM aufmass WHERE projekt_id=?').all(projektId);
        list.forEach(a => {
            a.positionen = db.prepare('SELECT * FROM aufmass_positionen WHERE aufmass_id=? ORDER BY sortier_index ASC').all(a.id);
        });
        return list;
    },

    async saveAufmass(aufmass) {
        const saveTransaction = db.transaction((data) => {
            let aufmassId = data.id;
            if (aufmassId) {
                db.prepare('UPDATE aufmass SET titel=?, rechnung_id=?, projekt_id=?, bemerkung=? WHERE id=?')
                  .run(data.titel, data.rechnung_id || null, data.projekt_id || null, data.bemerkung || '', aufmassId);
                db.prepare('DELETE FROM aufmass_positionen WHERE aufmass_id=?').run(aufmassId);
            } else {
                const info = db.prepare('INSERT INTO aufmass (titel, rechnung_id, projekt_id, bemerkung) VALUES (?, ?, ?, ?)')
                  .run(data.titel, data.rechnung_id || null, data.projekt_id || null, data.bemerkung || '');
                aufmassId = info.lastInsertRowid;
            }

            if (data.positionen && Array.isArray(data.positionen)) {
                const insertPos = db.prepare('INSERT INTO aufmass_positionen (aufmass_id, raum, bezeichnung, formel, ergebnis, einheit, sortier_index) VALUES (?, ?, ?, ?, ?, ?, ?)');
                data.positionen.forEach((p, idx) => {
                    insertPos.run(aufmassId, p.raum || '', p.bezeichnung || '', p.formel || '', p.ergebnis || 0, p.einheit || 'm²', idx);
                });
            }

            return aufmassId;
        });

        return saveTransaction(aufmass);
    },

    async deleteAufmass(id) {
        const delTransaction = db.transaction((aufmassId) => {
            db.prepare('DELETE FROM aufmass_positionen WHERE aufmass_id=?').run(aufmassId);
            db.prepare('DELETE FROM aufmass WHERE id=?').run(aufmassId);
        });
        return delTransaction(id);
    },

    // --- Artikel ---
    async saveArtikel(artikel) {
        if (artikel.id) {
            await dbRun(
                'UPDATE artikel SET name=?, ean=?, beschreibung=?, ek=?, vk=?, mwst=?, bestand=?, lieferant=?, katalog=?, ist_bauleistung=?, kostenart=?, lohnanteil_prozent=? WHERE id=?',
                [artikel.name, artikel.ean, artikel.beschreibung, artikel.ek, artikel.vk, artikel.mwst, artikel.bestand, artikel.lieferant, artikel.katalog, artikel.ist_bauleistung || 0, artikel.kostenart || 'MATERIAL', artikel.lohnanteil_prozent || 0, artikel.id]
            );
            return artikel.id;
        } else {
            const res = await dbRun(
                'INSERT INTO artikel (name, ean, beschreibung, ek, vk, mwst, bestand, lieferant, katalog, ist_bauleistung, kostenart, lohnanteil_prozent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [artikel.name, artikel.ean, artikel.beschreibung, artikel.ek, artikel.vk, artikel.mwst, artikel.bestand, artikel.lieferant, artikel.katalog, artikel.ist_bauleistung || 0, artikel.kostenart || 'MATERIAL', artikel.lohnanteil_prozent || 0]
            );
            return res.id;
        }
    },
    async deleteArtikel(id) {
        return await dbRun('DELETE FROM artikel WHERE id=?', [id]);
    },

    // --- Kunden ---
    async saveKunde(kunde) {
        if (kunde.id) {
            await dbRun(
                'UPDATE kunden SET kundennummer=?, name=?, adresse=?, plz=?, ort=?, telefon=?, email=?, ustId=?, ist_bauleistender_13b=?, ust_1_tg_gueltig_bis=?, hat_freistellungsbescheinigung=?, freistellung_gueltig_bis=?, ist_umsatzsteuerfreie_vermietung=?, customer_type=?, leitweg_id=?, peppol_id=?, buyer_reference=?, tax_number=?, sec48b_status=?, sec48b_certificate_path=? WHERE id=?',
                [kunde.kundennummer, kunde.name, kunde.adresse, kunde.plz, kunde.ort, kunde.telefon, kunde.email, kunde.ustId, kunde.ist_bauleistender_13b || 0, kunde.ust_1_tg_gueltig_bis, kunde.hat_freistellungsbescheinigung || 0, kunde.freistellung_gueltig_bis, kunde.ist_umsatzsteuerfreie_vermietung || 0, kunde.customer_type || 'B2C', kunde.leitweg_id || null, kunde.peppol_id || null, kunde.buyer_reference || null, kunde.tax_number || null, kunde.sec48b_status || 'NONE', kunde.sec48b_certificate_path || null, kunde.id]
            );
            return kunde.id;
        } else {
            // Generate sequence if needed
            let knr = kunde.kundennummer;
            if (!knr) {
                const row = await dbQuery('SELECT MAX(id) as mx FROM kunden');
                const nextId = (row && row[0] && row[0].mx) ? row[0].mx + 1 : 1;
                knr = `KD-${1000 + nextId}`;
            }

            const res = await dbRun(
                'INSERT INTO kunden (kundennummer, name, adresse, plz, ort, telefon, email, ustId, ist_bauleistender_13b, ust_1_tg_gueltig_bis, hat_freistellungsbescheinigung, freistellung_gueltig_bis, ist_umsatzsteuerfreie_vermietung, customer_type, leitweg_id, peppol_id, buyer_reference, tax_number, sec48b_status, sec48b_certificate_path, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
                [knr, kunde.name, kunde.adresse, kunde.plz, kunde.ort, kunde.telefon, kunde.email, kunde.ustId, kunde.ist_bauleistender_13b || 0, kunde.ust_1_tg_gueltig_bis, kunde.hat_freistellungsbescheinigung || 0, kunde.freistellung_gueltig_bis, kunde.ist_umsatzsteuerfreie_vermietung || 0, kunde.customer_type || 'B2C', kunde.leitweg_id || null, kunde.peppol_id || null, kunde.buyer_reference || null, kunde.tax_number || null, kunde.sec48b_status || 'NONE', kunde.sec48b_certificate_path || null]
            );
            return res.id;
        }
    },
    async deleteKunde(id) {
        return await dbRun('DELETE FROM kunden WHERE id=?', [id]);
    },

    // --- Kunden (Bulk Save) ---
    async bulkSaveKunden(kunden) {
        if (!kunden || !Array.isArray(kunden) || kunden.length === 0) return [];

        const bulkTransaction = db.transaction((kundenList) => {
            const updateStmt = db.prepare('UPDATE kunden SET kundennummer=?, name=?, adresse=?, plz=?, ort=?, telefon=?, email=?, ustId=?, ist_bauleistender_13b=?, ust_1_tg_gueltig_bis=?, hat_freistellungsbescheinigung=?, freistellung_gueltig_bis=?, ist_umsatzsteuerfreie_vermietung=?, customer_type=?, leitweg_id=?, peppol_id=?, buyer_reference=?, tax_number=?, sec48b_status=?, sec48b_certificate_path=? WHERE id=?');
            const insertStmt = db.prepare('INSERT INTO kunden (kundennummer, name, adresse, plz, ort, telefon, email, ustId, ist_bauleistender_13b, ust_1_tg_gueltig_bis, hat_freistellungsbescheinigung, freistellung_gueltig_bis, ist_umsatzsteuerfreie_vermietung, customer_type, leitweg_id, peppol_id, buyer_reference, tax_number, sec48b_status, sec48b_certificate_path, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)');
            
            const ids = [];
            for (const k of kundenList) {
                if (k.id) {
                    updateStmt.run(k.kundennummer, k.name, k.adresse, k.plz, k.ort, k.telefon, k.email, k.ustId, k.ist_bauleistender_13b || 0, k.ust_1_tg_gueltig_bis, k.hat_freistellungsbescheinigung || 0, k.freistellung_gueltig_bis, k.ist_umsatzsteuerfreie_vermietung || 0, k.customer_type || 'B2C', k.leitweg_id || null, k.peppol_id || null, k.buyer_reference || null, k.tax_number || null, k.sec48b_status || 'NONE', k.sec48b_certificate_path || null, k.id);
                    ids.push(k.id);
                } else {
                    let knr = k.kundennummer;
                    if (!knr) {
                        const row = db.prepare('SELECT MAX(id) as mx FROM kunden').get();
                        const nextId = (row && row.mx) ? row.mx + 1 : 1;
                        knr = `KD-${1000 + nextId}`;
                    }
                    const res = insertStmt.run(knr, k.name, k.adresse, k.plz, k.ort, k.telefon, k.email, k.ustId, k.ist_bauleistender_13b || 0, k.ust_1_tg_gueltig_bis, k.hat_freistellungsbescheinigung || 0, k.freistellung_gueltig_bis, k.ist_umsatzsteuerfreie_vermietung || 0, k.customer_type || 'B2C', k.leitweg_id || null, k.peppol_id || null, k.buyer_reference || null, k.tax_number || null, k.sec48b_status || 'NONE', k.sec48b_certificate_path || null);
                    ids.push(res.lastInsertRowid);
                }
            }
            return ids;
        });

        return bulkTransaction(kunden);
    },

    // --- Dokumente (Rechnungen/Angebote) ---
    async saveDocument(doc) {
        const isLockedInt = doc.isLocked ? 1 : 0;

        // Wrap the document and position saving in a transaction for data integrity
        const saveTransaction = db.transaction((d) => {
            let docId = d.id;

            if (docId) {
                const updateStmt = db.prepare('UPDATE dokumente SET type=?, nr=?, datum=?, faellig=?, kundeId=?, projektId=?, status=?, isLocked=?, netto=?, steuer=?, brutto=?, globalRabattAbzug=?, globalRabattType=?, globalRabattValue=?, anzahlung=?, mahnungLevel=?, mahnungDatum=?, mahnungGebuehr=?, eingabemodus=?, vortext=?, fusstext=?, leistungszeitraum_von=?, leistungszeitraum_bis=?, baustellen_adresse=?, vob_vereinbart=?, ist_privatkunde=?, unterliegt_bauabzugsteuer=?, bauabzugsteuer_betrag=?, ausweis_35a_erforderlich=?, summe_lohnkosten_brutto=?, rechnungsart=?, kumulierte_leistung_netto=?, sicherheitseinbehalt=?, unterliegt_13b=?, leitweg_id=?, buyer_reference=?, sha256_hash=? WHERE id=?');
                updateStmt.run(d.type, d.nr, d.datum, d.faellig, d.kundeId, d.projektId, d.status, isLockedInt, d.netto, d.steuer, d.brutto, d.globalRabattAbzug || 0, d.globalRabattType || '%', d.globalRabattValue || 0, d.anzahlung || 0, d.mahnungLevel || 0, d.mahnungDatum || null, d.mahnungGebuehr || 0, d.eingabemodus || 'netto', d.vortext, d.fusstext, d.leistungszeitraum_von, d.leistungszeitraum_bis, d.baustellen_adresse, d.vob_vereinbart || 0, d.ist_privatkunde || 0, d.unterliegt_bauabzugsteuer || 0, d.bauabzugsteuer_betrag || 0, d.ausweis_35a_erforderlich || 0, d.summe_lohnkosten_brutto || 0, d.rechnungsart || 'REGULAER', d.kumulierte_leistung_netto || 0, d.sicherheitseinbehalt || 0, d.unterliegt_13b || 0, d.leitweg_id || null, d.buyer_reference || null, d.sha256_hash || null, docId);

                if (d.type === 'rechnung') {
                    // Restore stock: Group by artikelId in memory to avoid N+1 and slow subqueries
                    const oldPositions = db.prepare('SELECT artikelId, menge FROM positionen WHERE dokumentId=?').all(docId);
                    if (oldPositions.length > 0) {
                        const restoreStockMap = new Map();
                        for (const p of oldPositions) {
                            if (p.artikelId) {
                                restoreStockMap.set(p.artikelId, (restoreStockMap.get(p.artikelId) || 0) + p.menge);
                            }
                        }
                        const restoreStockStmt = db.prepare('UPDATE artikel SET bestand = bestand + ? WHERE id=?');
                        for (const [artId, qty] of restoreStockMap.entries()) {
                            restoreStockStmt.run(qty, artId);
                        }
                    }
                }

                const deletePosStmt = db.prepare('DELETE FROM positionen WHERE dokumentId=?');
                deletePosStmt.run(docId);
                const deleteVerrechnungStmt = db.prepare('DELETE FROM rechnung_verrechnungen WHERE aktuelle_rechnung_id=?');
                deleteVerrechnungStmt.run(docId);
            } else {
                const insertStmt = db.prepare('INSERT INTO dokumente (type, nr, datum, faellig, kundeId, projektId, status, isLocked, netto, steuer, brutto, globalRabattAbzug, globalRabattType, globalRabattValue, anzahlung, eingabemodus, vortext, fusstext, leistungszeitraum_von, leistungszeitraum_bis, baustellen_adresse, vob_vereinbart, ist_privatkunde, unterliegt_bauabzugsteuer, bauabzugsteuer_betrag, ausweis_35a_erforderlich, summe_lohnkosten_brutto, rechnungsart, kumulierte_leistung_netto, sicherheitseinbehalt, unterliegt_13b, leitweg_id, buyer_reference, sha256_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                const res = insertStmt.run(d.type, d.nr, d.datum, d.faellig, d.kundeId, d.projektId, d.status, isLockedInt, d.netto, d.steuer, d.brutto, d.globalRabattAbzug || 0, d.globalRabattType || '%', d.globalRabattValue || 0, d.anzahlung || 0, d.eingabemodus || 'netto', d.vortext, d.fusstext, d.leistungszeitraum_von, d.leistungszeitraum_bis, d.baustellen_adresse, d.vob_vereinbart || 0, d.ist_privatkunde || 0, d.unterliegt_bauabzugsteuer || 0, d.bauabzugsteuer_betrag || 0, d.ausweis_35a_erforderlich || 0, d.summe_lohnkosten_brutto || 0, d.rechnungsart || 'REGULAER', d.kumulierte_leistung_netto || 0, d.sicherheitseinbehalt || 0, d.unterliegt_13b || 0, d.leitweg_id || null, d.buyer_reference || null, d.sha256_hash || null);
                docId = res.lastInsertRowid;
            }

            // Insert new positions and deduct stock
            if (d.positionen && d.positionen.length > 0) {
                const insertPosStmt = db.prepare('INSERT INTO positionen (dokumentId, artikelId, name, menge, einheit, preis, ek, mwst, rabatt, steuer_schluessel, is13b, cost_type, oz_code, is_tax_deductible_35a) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                const stockDeductionMap = new Map();

                for (const p of d.positionen) {
                    insertPosStmt.run(docId, p.artikelId || null, p.name || null, p.menge, p.einheit || 'Stk.', p.preis, p.ek || 0, p.mwst, p.rabatt || 0, p.steuer_schluessel || null, p.is13b ? 1 : 0, p.cost_type || 'MATERIAL', p.oz_code || null, p.is_tax_deductible_35a ? 1 : 0);

                    if (d.type === 'rechnung' && p.artikelId) {
                        stockDeductionMap.set(p.artikelId, (stockDeductionMap.get(p.artikelId) || 0) + p.menge);
                    }
                }

                if (stockDeductionMap.size > 0) {
                    // Optimization idea rejected: Dynamic CASE ... WHEN ... THEN SQL string approach is discouraged.
                    // Relying on a Node-level loop executing a prepared statement strictly within a single SQLite
                    // transaction is highly performant in better-sqlite3, much safer, and significantly easier to read.
                    const deductStockStmt = db.prepare('UPDATE artikel SET bestand = bestand - ? WHERE id=?');
                    for (const [artId, qty] of stockDeductionMap.entries()) {
                        deductStockStmt.run(qty, artId);
                    }
                }
            }

            if (d.verrechnungen && d.verrechnungen.length > 0) {
                const insertVerrechnungStmt = db.prepare('INSERT INTO rechnung_verrechnungen (aktuelle_rechnung_id, vorherige_rechnung_id, abzugsbetrag_netto) VALUES (?, ?, ?)');
                for (const v of d.verrechnungen) {
                    insertVerrechnungStmt.run(docId, v.vorherige_rechnung_id, v.abzugsbetrag_netto || 0);
                }
            }

            return docId;
        });

        return saveTransaction(doc);
    },


    // --- Dokumente (Bulk Save) ---
    async bulkSaveDocuments(docs) {
        if (!docs || !Array.isArray(docs) || docs.length === 0) return [];

        const bulkTransaction = db.transaction((docsList) => {
            const updateStmt = db.prepare('UPDATE dokumente SET type=?, nr=?, datum=?, faellig=?, kundeId=?, projektId=?, status=?, isLocked=?, netto=?, steuer=?, brutto=?, globalRabattAbzug=?, globalRabattType=?, globalRabattValue=?, anzahlung=?, mahnungLevel=?, mahnungDatum=?, mahnungGebuehr=?, eingabemodus=?, vortext=?, fusstext=?, leistungszeitraum_von=?, leistungszeitraum_bis=?, baustellen_adresse=?, vob_vereinbart=?, ist_privatkunde=?, unterliegt_bauabzugsteuer=?, bauabzugsteuer_betrag=?, ausweis_35a_erforderlich=?, summe_lohnkosten_brutto=?, rechnungsart=?, kumulierte_leistung_netto=?, sicherheitseinbehalt=?, unterliegt_13b=?, leitweg_id=?, buyer_reference=?, sha256_hash=? WHERE id=?');
            const insertDocStmt = db.prepare('INSERT INTO dokumente (type, nr, datum, faellig, kundeId, projektId, status, isLocked, netto, steuer, brutto, globalRabattAbzug, globalRabattType, globalRabattValue, anzahlung, eingabemodus, vortext, fusstext, leistungszeitraum_von, leistungszeitraum_bis, baustellen_adresse, vob_vereinbart, ist_privatkunde, unterliegt_bauabzugsteuer, bauabzugsteuer_betrag, ausweis_35a_erforderlich, summe_lohnkosten_brutto, rechnungsart, kumulierte_leistung_netto, sicherheitseinbehalt, unterliegt_13b, leitweg_id, buyer_reference, sha256_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            const deletePosStmt = db.prepare('DELETE FROM positionen WHERE dokumentId=?');
            const deleteVerrechnungStmt = db.prepare('DELETE FROM rechnung_verrechnungen WHERE aktuelle_rechnung_id=?');
            const insertPosStmt = db.prepare('INSERT INTO positionen (dokumentId, artikelId, name, menge, einheit, preis, ek, mwst, rabatt, steuer_schluessel, is13b, cost_type, oz_code, is_tax_deductible_35a) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            const insertVerrechnungStmt = db.prepare('INSERT INTO rechnung_verrechnungen (aktuelle_rechnung_id, vorherige_rechnung_id, abzugsbetrag_netto) VALUES (?, ?, ?)');
            const restoreStockStmt = db.prepare('UPDATE artikel SET bestand = bestand + ? WHERE id=?');
            const deductStockStmt = db.prepare('UPDATE artikel SET bestand = bestand - ? WHERE id=?');

            const docIds = [];

            for (const d of docsList) {
                let docId = d.id;
                const isLockedInt = d.isLocked ? 1 : 0;

                if (docId) {
                    updateStmt.run(d.type, d.nr, d.datum, d.faellig, d.kundeId, d.projektId, d.status, isLockedInt, d.netto, d.steuer, d.brutto, d.globalRabattAbzug || 0, d.globalRabattType || '%', d.globalRabattValue || 0, d.anzahlung || 0, d.mahnungLevel || 0, d.mahnungDatum || null, d.mahnungGebuehr || 0, d.eingabemodus || 'netto', d.vortext, d.fusstext, d.leistungszeitraum_von, d.leistungszeitraum_bis, d.baustellen_adresse, d.vob_vereinbart || 0, d.ist_privatkunde || 0, d.unterliegt_bauabzugsteuer || 0, d.bauabzugsteuer_betrag || 0, d.ausweis_35a_erforderlich || 0, d.summe_lohnkosten_brutto || 0, d.rechnungsart || 'REGULAER', d.kumulierte_leistung_netto || 0, d.sicherheitseinbehalt || 0, d.unterliegt_13b || 0, d.leitweg_id || null, d.buyer_reference || null, d.sha256_hash || null, docId);

                    if (d.type === 'rechnung') {
                        // Restore stock
                        const oldPositions = db.prepare('SELECT artikelId, menge FROM positionen WHERE dokumentId=?').all(docId);
                        if (oldPositions.length > 0) {
                            const restoreStockMap = new Map();
                            for (const p of oldPositions) {
                                if (p.artikelId) {
                                    restoreStockMap.set(p.artikelId, (restoreStockMap.get(p.artikelId) || 0) + p.menge);
                                }
                            }
                            for (const [artId, qty] of restoreStockMap.entries()) {
                                restoreStockStmt.run(qty, artId);
                            }
                        }
                    }

                    deletePosStmt.run(docId);
                    deleteVerrechnungStmt.run(docId);
                } else {
                    const res = insertDocStmt.run(d.type, d.nr, d.datum, d.faellig, d.kundeId, d.projektId, d.status, isLockedInt, d.netto, d.steuer, d.brutto, d.globalRabattAbzug || 0, d.globalRabattType || '%', d.globalRabattValue || 0, d.anzahlung || 0, d.eingabemodus || 'netto', d.vortext, d.fusstext, d.leistungszeitraum_von, d.leistungszeitraum_bis, d.baustellen_adresse, d.vob_vereinbart || 0, d.ist_privatkunde || 0, d.unterliegt_bauabzugsteuer || 0, d.bauabzugsteuer_betrag || 0, d.ausweis_35a_erforderlich || 0, d.summe_lohnkosten_brutto || 0, d.rechnungsart || 'REGULAER', d.kumulierte_leistung_netto || 0, d.sicherheitseinbehalt || 0, d.unterliegt_13b || 0, d.leitweg_id || null, d.buyer_reference || null, d.sha256_hash || null);
                    docId = res.lastInsertRowid;
                }

                if (d.positionen && d.positionen.length > 0) {
                    const stockDeductionMap = new Map();

                    for (const p of d.positionen) {
                        insertPosStmt.run(docId, p.artikelId || null, p.name || null, p.menge, p.einheit || 'Stk.', p.preis, p.ek || 0, p.mwst, p.rabatt || 0, p.steuer_schluessel || null, p.is13b ? 1 : 0, p.cost_type || 'MATERIAL', p.oz_code || null, p.is_tax_deductible_35a ? 1 : 0);

                        if (d.type === 'rechnung' && p.artikelId) {
                            stockDeductionMap.set(p.artikelId, (stockDeductionMap.get(p.artikelId) || 0) + p.menge);
                        }
                    }

                    if (stockDeductionMap.size > 0) {
                        for (const [artId, qty] of stockDeductionMap.entries()) {
                            deductStockStmt.run(qty, artId);
                        }
                    }
                }
                
                if (d.verrechnungen && d.verrechnungen.length > 0) {
                    for (const v of d.verrechnungen) {
                        insertVerrechnungStmt.run(docId, v.vorherige_rechnung_id, v.abzugsbetrag_netto || 0);
                    }
                }
                docIds.push(docId);
            }
            return docIds;
        });

        return bulkTransaction(docs);
    },

    async deleteDocument(id) {
        const delTransaction = db.transaction((docId) => {
            // SELECT fetches only strictly necessary columns.
            const doc = db.prepare('SELECT type FROM dokumente WHERE id=?').get(docId);
            if (doc && doc.type === 'rechnung') {
                // Restore stock: Group by artikelId in memory to avoid N+1 and slow subqueries.
                // Node-level loop is executed within a transaction, making it safe and highly optimized.
                const positions = db.prepare('SELECT artikelId, menge FROM positionen WHERE dokumentId=?').all(docId);
                if (positions.length > 0) {
                    const restoreStockMap = new Map();
                    for (const p of positions) {
                        if (p.artikelId) {
                            restoreStockMap.set(p.artikelId, (restoreStockMap.get(p.artikelId) || 0) + p.menge);
                        }
                    }
                    const restoreStockStmt = db.prepare('UPDATE artikel SET bestand = bestand + ? WHERE id=?');
                    // OPTIMIZATION NOTE:
                    // This node-level loop uses in-memory JS Map aggregation and executes
                    // individual prepared UPDATE statements inside a single SQLite transaction.
                    // This prevents N+1 queries and avoids the overhead of complex dynamic SQL strings.
                    for (const [artId, qty] of restoreStockMap.entries()) {
                        restoreStockStmt.run(qty, artId);
                    }
                }
            }
            db.prepare('DELETE FROM positionen WHERE dokumentId=?').run(docId);
            db.prepare('DELETE FROM rechnung_verrechnungen WHERE aktuelle_rechnung_id=?').run(docId);
            db.prepare('DELETE FROM dokumente WHERE id=?').run(docId);
        });
        return delTransaction(id);
    },

    // --- Projekte ---
    async saveProjekt(projekt) {
        if (projekt.id) {
            await dbRun(
                'UPDATE projekte SET name=?, kundeId=?, start=?, ende=?, budget=?, status=?, sicherheitseinbehalt_prozent=? WHERE id=?',
                [projekt.name, projekt.kundeId, projekt.start, projekt.ende, projekt.budget, projekt.status, projekt.sicherheitseinbehalt_prozent || 0, projekt.id]
            );
            return projekt.id;
        } else {
            const res = await dbRun(
                'INSERT INTO projekte (name, kundeId, start, ende, budget, status, sicherheitseinbehalt_prozent) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [projekt.name, projekt.kundeId, projekt.start, projekt.ende, projekt.budget, projekt.status, projekt.sicherheitseinbehalt_prozent || 0]
            );
            return res.id;
        }
    },

    // --- Einstellungen ---
    async saveEinstellung(key, value) {
        await dbRun('INSERT OR REPLACE INTO einstellungen (key, value) VALUES (?, ?)', [key, value]);
    },

    // --- Backup ---
    async backup(destinationPath) {
        return db.backup(destinationPath);
    },

    // --- Restore ---
    async restore(sourcePath) {
        // 1. Create an emergency backup of the CURRENT state before overwriting
        const emergencyPath = dbPath + '.emergency-backup-' + Date.now();
        fs.copyFileSync(dbPath, emergencyPath);
        console.log('Emergency backup created at:', emergencyPath);

        // 2. Close the active database connection
        db.close();

        // 3. Overwrite the database file with the selected backup
        fs.copyFileSync(sourcePath, dbPath);
        console.log('Database overwritten with backup from:', sourcePath);

        // 4. Relaunch the application to load the new database
        const { app } = require('electron');
        app.relaunch();
        app.exit(0);
    }
};

module.exports = { db, dbAPI };
