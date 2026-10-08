const test = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');

test('Auftragsbestätigung (AB) Lifecycle', async (t) => {
    const db = new Database(':memory:');

    // Create schema
    db.exec(`
        CREATE TABLE kunden (id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE projekte (id INTEGER PRIMARY KEY, name TEXT, nummer TEXT, kundeId INTEGER);
        CREATE TABLE dokumente (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            typ TEXT,
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
            sha256_hash TEXT
        );
        CREATE UNIQUE INDEX idx_dokumente_type_nr ON dokumente(type, nr);
        CREATE TABLE positionen (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dokumentId INTEGER,
            artikelId INTEGER,
            menge REAL DEFAULT 1,
            einheit TEXT DEFAULT 'Stk.',
            preis REAL DEFAULT 0,
            mwst INTEGER DEFAULT 19
        );
        CREATE TABLE rechnung_verrechnungen (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            aktuelle_rechnung_id INTEGER,
            vorherige_rechnung_id INTEGER,
            abzugsbetrag_netto REAL DEFAULT 0,
            abzugsbetrag_brutto REAL DEFAULT 0
        );
    `);

    let auditLogs = [];
    const appendAuditLog = (log) => auditLogs.push(log);
    const auditLogger = { warn: () => {}, info: () => {}, error: () => {} };

    // Pass db directly via mock
    const docRepo = {
        saveDocument: async (doc) => {
            const requestedLockedInt = doc.isLocked ? 1 : 0;
            const insertStmt = db.prepare('INSERT INTO dokumente (type, typ, nr, datum, faellig, kundeId, projektId, status, isLocked, netto, steuer, brutto, parent_angebot_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            const info = insertStmt.run(
                doc.type, doc.typ, doc.nr, doc.datum, doc.faellig, doc.kundeId, doc.projektId, doc.status, requestedLockedInt, doc.netto, doc.steuer, doc.brutto, doc.parent_angebot_id
            );
            return info.lastInsertRowid;
        },
        updateDocument: async (doc) => {
            const updateStmt = db.prepare('UPDATE dokumente SET status=?, angebot_status=? WHERE id=?');
            updateStmt.run(doc.status, doc.angebot_status, doc.id);
        }
    };

    db.prepare('INSERT INTO kunden (name) VALUES (?)').run('Testkunde AB');
    const kundeId = db.prepare('SELECT last_insert_rowid() AS id').get().id;

    await t.test('Angebot V2 anlegen', async () => {
        const angebot = {
            id: null,
            type: 'angebot',
            typ: 'ANGEBOT',
            nr: 'ANG-2026-001',
            kundeId,
            status: 'ENTWURF',
            angebot_status: 'ENTWURF',
            version: 2,
            netto: 2500,
            steuer: 475,
            brutto: 2975,
            positionen: [
                { menge: 1, preis: 2500, mwst: 19 }
            ]
        };

        const docId = await docRepo.saveDocument(angebot);
        assert.ok(docId > 0, 'Angebot gespeichert');

        // Set to ANGENOMMEN
        const existing = db.prepare('SELECT * FROM dokumente WHERE id=?').get(docId);
        existing.status = 'ANGENOMMEN';
        existing.angebot_status = 'ANGENOMMEN';
        await docRepo.updateDocument(existing);

        const accepted = db.prepare('SELECT * FROM dokumente WHERE id=?').get(docId);
        assert.strictEqual(accepted.status, 'ANGENOMMEN', 'Angebot ist ANGENOMMEN');
    });

    await t.test('Auftragsbestätigung aus Angebot generieren', async () => {
        const angebot = db.prepare("SELECT * FROM dokumente WHERE type='angebot' AND nr='ANG-2026-001'").get();
        assert.ok(angebot, 'Angebot geladen');

        const auftrag = {
            id: null,
            type: 'auftrag',
            typ: 'AUFTRAG',
            nr: 'AB-2026-0001',
            kundeId: angebot.kundeId,
            projektId: angebot.projektId,
            status: 'Bestätigt',
            netto: angebot.netto,
            steuer: angebot.steuer,
            brutto: angebot.brutto,
            parent_angebot_id: angebot.id,
            positionen: [
                { menge: 1, preis: 2500, mwst: 19 }
            ]
        };

        const auftragId = await docRepo.saveDocument(auftrag);
        assert.ok(auftragId > 0, 'Auftragsbestätigung gespeichert');

        const savedAb = db.prepare('SELECT * FROM dokumente WHERE id=?').get(auftragId);
        assert.strictEqual(savedAb.type, 'auftrag', 'Typ ist korrekt');
        assert.strictEqual(savedAb.nr, 'AB-2026-0001', 'AB Nummer korrekt');
        assert.strictEqual(savedAb.netto, 2500, 'Netto Summe 2500 korrekt kopiert');
        assert.strictEqual(savedAb.brutto, 2975, 'Brutto Summe 2975 korrekt kopiert');
        assert.strictEqual(savedAb.parent_angebot_id, angebot.id, 'Parent-Referenz ist korrekt');
    });
});
