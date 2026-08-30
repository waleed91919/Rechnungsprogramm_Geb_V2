/**
 * tests/backup.test.js - Unit- und Integrationstests für die Revisionssichere Auto-Backup Engine (GoBD & GFS)
 *
 * Das native better-sqlite3 ist für die Electron-Runtime gebaut.
 * Läuft der Test im System-Node, führt er sich selbst über die Electron-Binary aus.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const IS_ELECTRON_AS_NODE = !!process.versions.electron;
const RUN_INNER_MARKER = 'BACKUP_TEST_INNER_RUN';

function canLoadBetterSqlite() {
    try {
        const DbCtor = require('better-sqlite3');
        const probe = new DbCtor(':memory:');
        probe.close();
        return true;
    } catch (_e) {
        return false;
    }
}

if (!IS_ELECTRON_AS_NODE && !canLoadBetterSqlite()) {
    test('Revisionssichere Auto-Backup Engine (GoBD & GFS, via Electron-as-Node Runtime)', () => {
        const electronBin = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
        assert.ok(fs.existsSync(electronBin), 'Electron-Binary muss als Runtime verfügbar sein');

        const stdout = execFileSync(
            electronBin,
            [path.join(__filename), `--${RUN_INNER_MARKER}`],
            {
                env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '' },
                encoding: 'utf-8',
                maxBuffer: 64 * 1024 * 1024,
                timeout: 120000
            }
        );

        assert.match(stdout, /BACKUP_TESTS_PASSED/, 'Alle Backup-Tests müssen erfolgreich bestehen');
    });
} else {
    // -------------------------------------------------------------------------
    // Eigentliche Backup Engine Tests
    // -------------------------------------------------------------------------
    const Database = require('better-sqlite3');
    const BackupService = require('../main/backup');

    test('1. Erstellung eines Online-Snapshots mit Gzip-Kompression & SHA-256 Hash', async () => {
        const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wlink-backup-test-1-'));
        const dbPath = path.join(testDir, 'test.db');
        const backupDir = path.join(testDir, 'backups');

        const testDb = new Database(dbPath);
        testDb.exec(`
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS kunden (id INTEGER PRIMARY KEY, name TEXT);
            CREATE TABLE IF NOT EXISTS backup_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dateiname TEXT NOT NULL,
                dateipfad TEXT NOT NULL,
                trigger_typ TEXT NOT NULL,
                file_size_bytes INTEGER NOT NULL,
                uncompressed_size_bytes INTEGER,
                sha256_hash TEXT NOT NULL,
                gfs_generation TEXT DEFAULT 'S',
                status TEXT DEFAULT 'SUCCESS',
                bemerkung TEXT,
                erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO kunden (name) VALUES ('Musterbau GmbH'), ('Handwerk Partner AG');
        `);

        const backupService = new BackupService(testDb, {
            dbPath,
            backupDir,
            auditLogger: { appendAuditLog: () => {} }
        });

        const result = await backupService.createBackup('MANUAL', 'Test-Sicherung 1');

        assert.strictEqual(result.success, true);
        assert.ok(result.backupId > 0, 'Backup-ID muss > 0 sein');
        assert.ok(fs.existsSync(result.filePath), 'Backup-Datei muss auf der Festplatte existieren');
        assert.ok(result.fileSize > 0, 'Dateigröße muss > 0 sein');
        assert.strictEqual(typeof result.sha256, 'string');
        assert.strictEqual(result.sha256.length, 64, 'SHA-256 Hash muss 64 Hex-Zeichen lang sein');

        const row = testDb.prepare('SELECT * FROM backup_history WHERE id = ?').get(result.backupId);
        assert.ok(row, 'Eintrag in backup_history muss existieren');
        assert.strictEqual(row.sha256_hash, result.sha256);
        assert.strictEqual(row.trigger_typ, 'MANUAL');

        testDb.close();
        fs.rmSync(testDir, { recursive: true, force: true });
    });

    test('2. Verifikation eines bestehenden Backups (Integritäts- und Hashprüfung)', async () => {
        const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wlink-backup-test-2-'));
        const dbPath = path.join(testDir, 'test.db');
        const backupDir = path.join(testDir, 'backups');

        const testDb = new Database(dbPath);
        testDb.exec(`
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS kunden (id INTEGER PRIMARY KEY, name TEXT);
            CREATE TABLE IF NOT EXISTS backup_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dateiname TEXT NOT NULL,
                dateipfad TEXT NOT NULL,
                trigger_typ TEXT NOT NULL,
                file_size_bytes INTEGER NOT NULL,
                uncompressed_size_bytes INTEGER,
                sha256_hash TEXT NOT NULL,
                gfs_generation TEXT DEFAULT 'S',
                status TEXT DEFAULT 'SUCCESS',
                bemerkung TEXT,
                erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO kunden (name) VALUES ('Musterbau GmbH');
        `);

        const backupService = new BackupService(testDb, {
            dbPath,
            backupDir,
            auditLogger: { appendAuditLog: () => {} }
        });

        const createRes = await backupService.createBackup('AUTO_INTERVAL', 'Test Intervall');
        const verifyRes = await backupService.verifyBackup(createRes.backupId);

        assert.strictEqual(verifyRes.valid, true, 'Backup muss als valide verifiziert werden');
        assert.strictEqual(verifyRes.hashMatch, true, 'SHA-256 Hash muss übereinstimmen');
        assert.strictEqual(verifyRes.isSqlite, true, 'Muss valider SQLite-Header sein');
        assert.strictEqual(verifyRes.sha256, createRes.sha256);

        // Manipulations-Test
        fs.appendFileSync(createRes.filePath, Buffer.from([0x00, 0xFF]));
        const verifyManipulated = await backupService.verifyBackup(createRes.backupId);
        assert.strictEqual(verifyManipulated.valid, false, 'Manipuliertes Backup darf nicht valide sein');
        assert.strictEqual(verifyManipulated.hashMatch, false, 'Hash darf nicht mehr übereinstimmen');

        testDb.close();
        fs.rmSync(testDir, { recursive: true, force: true });
    });

    test('3. GFS Aufbewahrung und Disaster Recovery (Restore)', async () => {
        const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wlink-backup-test-3-'));
        const dbPath = path.join(testDir, 'test.db');
        const backupDir = path.join(testDir, 'backups');

        const testDb = new Database(dbPath);
        testDb.exec(`
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS kunden (id INTEGER PRIMARY KEY, name TEXT);
            CREATE TABLE IF NOT EXISTS backup_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dateiname TEXT NOT NULL,
                dateipfad TEXT NOT NULL,
                trigger_typ TEXT NOT NULL,
                file_size_bytes INTEGER NOT NULL,
                uncompressed_size_bytes INTEGER,
                sha256_hash TEXT NOT NULL,
                gfs_generation TEXT DEFAULT 'S',
                status TEXT DEFAULT 'SUCCESS',
                bemerkung TEXT,
                erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO kunden (name) VALUES ('Original Kunde 1'), ('Original Kunde 2');
        `);

        const backupService = new BackupService(testDb, {
            dbPath,
            backupDir,
            auditLogger: { appendAuditLog: () => {} }
        });

        // Teste GFS Generation
        const now = new Date();
        const gen = backupService.determineGfsGeneration(now);
        assert.ok(['G', 'F', 'S'].includes(gen));

        // Teste Backup & Restore
        const backupRes = await backupService.createBackup('MANUAL', 'Vor dem Löschen');
        assert.strictEqual(backupRes.success, true);

        // Lösche alle Kunden
        testDb.prepare('DELETE FROM kunden').run();
        assert.strictEqual(testDb.prepare('SELECT COUNT(*) as c FROM kunden').get().c, 0);

        // Führe Restore durch
        const restoreRes = await backupService.restoreBackup(backupRes.backupId, 'Test Wiederherstellung');
        assert.strictEqual(restoreRes.success, true);

        // Kunden müssen wieder da sein
        const countAfter = testDb.prepare('SELECT COUNT(*) as c FROM kunden').get().c;
        assert.strictEqual(countAfter, 2, 'Kundenanzahl muss nach Restore exakt 2 sein');

        testDb.close();
        fs.rmSync(testDir, { recursive: true, force: true });
        console.log('BACKUP_TESTS_PASSED');
    });
}
