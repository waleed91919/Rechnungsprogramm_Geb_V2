const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let dbPath;
try {
    // Try to get the path from Electron's app module
    const { app } = require('electron');
    if (app && app.isReady()) {
        dbPath = path.join(app.getPath('userData'), 'database.sqlite');
    }
} catch (e) {
    // Fallback for testing or scripts outside of Electron
}

if (!dbPath) {
    dbPath = path.join(__dirname, 'database.sqlite');
}

// Explicit override (e.g. isolated test databases)
if (process.env.RECHNUNGSPROGRAMM_DB_PATH) {
    dbPath = process.env.RECHNUNGSPROGRAMM_DB_PATH;
} else if (process.env.RECHNUNG_DB_PATH) {
    dbPath = process.env.RECHNUNG_DB_PATH;
}

console.log('Database path:', dbPath);

const db = new Database(dbPath, { verbose: console.log });

// Enable security and performance features (WAL Mode, Foreign Keys, Busy Timeout)
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

const { createSchema, runMigrations, seedDefaultData } = require('./schema.js');
const { createAuditLogger, calculateDocumentContentHash } = require('./main/audit.js');
const BackupService = require('./main/backup');

function initDb() {
    createSchema(db);
    runMigrations(db);
    seedDefaultData(db);
}

console.log('Connected to the SQLite database using better-sqlite3 (Expert Mode).');
initDb();

// Zentrale GoBD-Audit-Hashkette (nach Schema-Init, damit audit_logs existiert)
const auditLogger = createAuditLogger(db);
const appendAuditLog = auditLogger.appendAuditLog;

// Revisionssichere Auto-Backup Engine Instanz
const backupService = new BackupService(db, {
    dbPath,
    backupDir: path.join(path.dirname(dbPath), 'backups'),
    auditLogger
});

// Utility wrappers exposing Promises to conform to the previous API signature
const dbQuery = async (sql, params = []) => {
    return db.prepare(sql).all(params);
};

const dbRun = async (sql, params = []) => {
    const res = db.prepare(sql).run(params);
    if (res && res.lastInsertRowid !== undefined && res.id === undefined) {
        res.id = res.lastInsertRowid;
    }
    return res;
};

// Modular Repositories
const { initRepositories } = require('./db/repositories');

const { dbAPI, repositories } = initRepositories({
    db,
    dbQuery,
    dbRun,
    appendAuditLog,
    auditLogger,
    backupService,
    dbPath
});

module.exports = {
    db,
    dbAPI,
    appendAuditLog: auditLogger.appendAuditLog,
    verifiziereAuditKette: auditLogger.verifiziereAuditKette,
    calculateDocumentContentHash,
    repositories
};
