/**
 * core_schema.js
 */

function createSchema(db) {
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

    db.exec(`CREATE TABLE IF NOT EXISTS einstellungen (
            key TEXT PRIMARY KEY,
            value TEXT
        )`);

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

    db.exec(`CREATE TABLE IF NOT EXISTS backup_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dateiname TEXT NOT NULL,
            dateipfad TEXT NOT NULL,
            dateigroesse_bytes INTEGER NOT NULL,
            dateigroesse_komprimiert_bytes INTEGER NOT NULL,
            sha256_hash TEXT NOT NULL,
            trigger_type TEXT NOT NULL CHECK(trigger_type IN ('MANUAL', 'AUTO_SHUTDOWN', 'CRON', 'PRE_MIGRATION', 'PRE_RESTORE', 'AUTO_INTERVAL', 'RESTORE_ROLLBACK')),
            retention_category TEXT NOT NULL CHECK(retention_category IN ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'ARCHIVE')),
            integrity_status TEXT NOT NULL CHECK(integrity_status IN ('OK', 'CORRUPT', 'UNKNOWN')),
            erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
            bemerkung TEXT
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS sync_processed_mutations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mutation_uuid TEXT NOT NULL UNIQUE,
            device_id TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_uuid TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

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

}

module.exports = {
    createSchema
};
