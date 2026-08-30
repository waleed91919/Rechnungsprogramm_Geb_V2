/**
 * main/backup.js - Revisionssichere Auto-Backup Engine & GFS Retention Policy
 * GoBD-konform nach §§ 146, 147 AO und VOB-Prüfstandards.
 * Verwendet better-sqlite3 Online-Snapshots, Gzip-Kompression und SHA-256 Fingerprints.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const Database = require('better-sqlite3');

class BackupService {
    /**
     * @param {Object} db - Aktive better-sqlite3 Instanz
     * @param {Object} options - Konfiguration { dbPath, backupDir, auditLogger }
     */
    constructor(db, options = {}) {
        this.db = db;
        this.dbPath = options.dbPath || (db && db.name) || '';
        this.backupDir = options.backupDir || (this.dbPath ? path.join(path.dirname(this.dbPath), 'backups') : path.join(process.cwd(), 'backups'));
        this.auditLogger = options.auditLogger || null;
        this.schedulerIntervalId = null;

        if (!fs.existsSync(this.backupDir)) {
            try {
                fs.mkdirSync(this.backupDir, { recursive: true });
            } catch (err) {
                console.error('[BackupService] Konnte Backup-Verzeichnis nicht anlegen:', err.message);
            }
        }
    }

    /**
     * Führt eine vollständige Integritätsprüfung der aktiven Datenbank durch.
     */
    verifyIntegrity(customDb = null) {
        const targetDb = customDb || this.db;
        if (!targetDb) {
            return { valid: false, message: 'Keine Datenbankinstanz verfügbar.' };
        }

        try {
            const integrityRows = targetDb.prepare('PRAGMA integrity_check').all();
            const fkRows = targetDb.prepare('PRAGMA foreign_key_check').all();

            const isIntegrityOk = integrityRows.length === 1 && (integrityRows[0].integrity_check === 'ok' || Object.values(integrityRows[0])[0] === 'ok');
            const isFkOk = fkRows.length === 0;

            return {
                valid: isIntegrityOk && isFkOk,
                integrityCheck: integrityRows.map(r => r.integrity_check || Object.values(r)[0]),
                foreignKeyErrors: fkRows
            };
        } catch (err) {
            return {
                valid: false,
                error: err.message,
                integrityCheck: [],
                foreignKeyErrors: []
            };
        }
    }

    /**
     * Erstellt ein atomares, komprimiertes Online-Backup mit SHA-256 Checksumme.
     * @param {string} triggerType - 'MANUAL' | 'AUTO_SHUTDOWN' | 'CRON' | 'PRE_MIGRATION' | 'PRE_RESTORE'
     * @param {string} bemerkung - Optionale Beschreibung
     */
    async createBackup(triggerType = 'MANUAL', bemerkung = '') {
        if (!this.db) {
            throw new Error('Backup fehlgeschlagen: Keine Datenbankverbindung.');
        }

        // 1. Vorprüfung auf physische Integrität
        const integrity = this.verifyIntegrity();
        if (!integrity.valid) {
            const errorMsg = `Backup abgebrochen: Datenbankintegritätsprüfung fehlgeschlagen (${JSON.stringify(integrity)})`;
            console.error('[BackupService]', errorMsg);
            throw new Error(errorMsg);
        }

        // 2. WAL-Puffer konsolidieren
        try {
            this.db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').run();
        } catch (walErr) {
            console.warn('[BackupService] WAL-Checkpoint Warnung:', walErr.message);
        }

        // 3. Temporären Online-Snapshot erstellen
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const tempRawPath = path.join(this.backupDir, `snapshot_${timestamp}_${Math.random().toString(36).substring(2, 7)}.tmp.sqlite`);
        const finalGzName = `backup_${timestamp}_${triggerType.toLowerCase()}.sqlite.gz`;
        const finalGzPath = path.join(this.backupDir, finalGzName);

        try {
            // Online SQLite Snapshot
            await this.db.backup(tempRawPath);

            const rawStats = fs.statSync(tempRawPath);
            const rawBytes = rawStats.size;

            // 4. Gzip Kompression (Level 9)
            const readStream = fs.createReadStream(tempRawPath);
            const gzipStream = zlib.createGzip({ level: 9 });
            const writeStream = fs.createWriteStream(finalGzPath);

            await pipeline(readStream, gzipStream, writeStream);

            // Lösche unkomprimierten Temp-Snapshot
            if (fs.existsSync(tempRawPath)) {
                fs.unlinkSync(tempRawPath);
            }

            const gzStats = fs.statSync(finalGzPath);
            const gzBytes = gzStats.size;
            const gzBuffer = fs.readFileSync(finalGzPath);
            const sha256Hash = crypto.createHash('sha256').update(gzBuffer).digest('hex');

            // 5. Retention-Kategorie / GFS Generation bestimmen
            const gfsGen = this.determineGfsGeneration(new Date());
            const category = this.determineRetentionCategory(new Date());

            // 6. Metadaten in backup_history und audit_logs eintragen
            let backupId = null;
            try {
                const insertStmt = this.db.prepare(`
                    INSERT INTO backup_history (
                        dateiname, dateipfad, file_size_bytes, uncompressed_size_bytes,
                        sha256_hash, trigger_typ, gfs_generation, status, bemerkung
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'SUCCESS', ?)
                `);
                const info = insertStmt.run(finalGzName, finalGzPath, gzBytes, rawBytes, sha256Hash, triggerType, gfsGen, bemerkung);
                backupId = info.lastInsertRowid;
            } catch (dbErr) {
                console.warn('[BackupService] Konnte Backup nicht in backup_history protokollieren:', dbErr.message);
            }

            if (this.auditLogger && typeof this.auditLogger.appendAuditLog === 'function') {
                this.auditLogger.appendAuditLog({
                    entityType: 'SYSTEM_BACKUP',
                    entityId: backupId ? Number(backupId) : 0,
                    action: 'BACKUP_CREATED',
                    details: {
                        file: finalGzName,
                        bytes: gzBytes,
                        sha256: sha256Hash,
                        trigger: triggerType,
                        gfsGeneration: gfsGen
                    }
                });
            }

            // 7. GFS Pruning durchführen
            this.cleanupGfsRetention();

            return {
                success: true,
                backupId: backupId ? Number(backupId) : null,
                fileName: finalGzName,
                filePath: finalGzPath,
                fileSize: gzBytes,
                rawBytes,
                gzBytes,
                compressionRatio: `${Math.round((1 - gzBytes / (rawBytes || 1)) * 100)}%`,
                sha256: sha256Hash,
                gfsGeneration: gfsGen,
                category
            };
        } catch (err) {
            // Bereinige temporäre Dateien bei Fehlern
            if (fs.existsSync(tempRawPath)) {
                try { fs.unlinkSync(tempRawPath); } catch (_) {}
            }
            if (fs.existsSync(finalGzPath)) {
                try { fs.unlinkSync(finalGzPath); } catch (_) {}
            }
            throw err;
        }
    }

    /**
     * Bestimmt die GFS-Generation (G = Großvater, F = Vater, S = Sohn).
     * @param {Date} date
     * @returns {'G'|'F'|'S'}
     */
    determineGfsGeneration(date) {
        const dayOfMonth = date.getDate();
        const dayOfWeek = date.getDay(); // 0 = Sonntag

        if (dayOfMonth === 1) return 'G'; // Monatlich / Jährlich (Großvater)
        if (dayOfWeek === 0) return 'F';  // Wöchentlich Sonntag (Vater)
        return 'S';                       // Täglich (Sohn)
    }

    /**
     * Bestimmt die GFS-Kategorie eines Backups basierend auf dem Kalenderdatum.
     * @param {Date} date
     * @returns {'YEARLY'|'MONTHLY'|'WEEKLY'|'DAILY'}
     */
    determineRetentionCategory(date) {
        const dayOfMonth = date.getDate();
        const dayOfWeek = date.getDay();

        if (dayOfMonth === 1 && date.getMonth() === 0) return 'YEARLY';
        if (dayOfMonth === 1) return 'MONTHLY';
        if (dayOfWeek === 0) return 'WEEKLY';
        return 'DAILY';
    }

    /**
     * Intelligente GFS-Retention Bereinigung (Grandfather-Father-Son Policy).
     * - Sohn (S / Daily): Max 14 Tage
     * - Vater (F / Weekly): Max 8 Wochen (56 Tage)
     * - Großvater (G / Monthly/Yearly): 10 Jahre (GoBD)
     */
    cleanupGfsRetention() {
        if (!this.db) return 0;

        let allBackups = [];
        try {
            allBackups = this.db.prepare('SELECT * FROM backup_history ORDER BY erstellt_am DESC').all();
        } catch (e) {
            return 0;
        }

        const now = Date.now();
        const MS_PER_DAY = 86400000;
        const keepIds = new Set();
        let cleanedCount = 0;

        for (const bkp of allBackups) {
            const ageDays = (now - new Date(bkp.erstellt_am).getTime()) / MS_PER_DAY;
            const gen = bkp.gfs_generation || 'S';

            if (bkp.trigger_typ === 'MANUAL' || bkp.trigger_typ === 'RESTORE_ROLLBACK' || gen === 'G') {
                keepIds.add(bkp.id);
            } else if (gen === 'F' && ageDays <= 56) {
                keepIds.add(bkp.id);
            } else if (gen === 'S' && ageDays <= 14) {
                keepIds.add(bkp.id);
            }
        }

        const toDelete = allBackups.filter(b => !keepIds.has(b.id));
        if (toDelete.length === 0) return 0;

        const deleteStmt = this.db.prepare('DELETE FROM backup_history WHERE id = ?');
        for (const del of toDelete) {
            try {
                if (fs.existsSync(del.dateipfad)) {
                    fs.unlinkSync(del.dateipfad);
                }
                deleteStmt.run(del.id);
                cleanedCount++;
            } catch (err) {
                console.warn(`[BackupService] Konnte veraltetes Backup nicht bereinigen: ${del.dateipfad}`, err.message);
            }
        }
        return cleanedCount;
    }

    async runGfsPruning() {
        return this.cleanupGfsRetention();
    }

    /**
     * Prüft die Integrität und Checksumme eines archivierten Backups.
     * @param {number|string} backupIdOrPath - ID in backup_history oder direkter Dateipfad
     */
    async verifyBackup(backupIdOrPath) {
        let backupRow = null;
        let targetFilePath = '';
        let expectedSha256 = '';

        if (typeof backupIdOrPath === 'number' || (!isNaN(parseInt(backupIdOrPath, 10)) && Number.isInteger(Number(backupIdOrPath)))) {
            backupRow = this.db.prepare('SELECT * FROM backup_history WHERE id = ?').get(backupIdOrPath);
            if (!backupRow) {
                return { valid: false, message: `Backup mit ID ${backupIdOrPath} nicht gefunden.` };
            }
            targetFilePath = backupRow.dateipfad;
            expectedSha256 = backupRow.sha256_hash;
        } else {
            targetFilePath = backupIdOrPath;
        }

        if (!fs.existsSync(targetFilePath)) {
            return { valid: false, message: `Backup-Datei existiert nicht: ${targetFilePath}` };
        }

        // 1. SHA-256 Prüfsumme der physischen Datei auf Datenträger validieren
        const fileBuf = fs.readFileSync(targetFilePath);
        const calculatedHash = crypto.createHash('sha256').update(fileBuf).digest('hex');
        const hashMatch = expectedSha256 ? (calculatedHash === expectedSha256) : true;

        const tempUnpackPath = path.join(this.backupDir, `verify_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.tmp.sqlite`);

        try {
            const isGz = targetFilePath.endsWith('.gz');

            if (isGz) {
                const readStream = fs.createReadStream(targetFilePath);
                const gunzipStream = zlib.createGunzip();
                const writeStream = fs.createWriteStream(tempUnpackPath);
                await pipeline(readStream, gunzipStream, writeStream);
            } else {
                fs.writeFileSync(tempUnpackPath, fileBuf);
            }

            // 2. Integrität der entpackten SQLite-Datenbank prüfen
            const testDb = new Database(tempUnpackPath, { readonly: true });
            const integrityResult = this.verifyIntegrity(testDb);
            testDb.close();

            if (fs.existsSync(tempUnpackPath)) {
                try { fs.unlinkSync(tempUnpackPath); } catch (_) {}
            }

            const valid = hashMatch && integrityResult.valid;

            return {
                valid,
                hashMatch,
                sha256Match: hashMatch,
                isSqlite: integrityResult.valid,
                fileSize: fileBuf.length,
                sha256: calculatedHash,
                calculatedHash,
                expectedSha256,
                integrityCheck: integrityResult.integrityCheck,
                foreignKeyErrors: integrityResult.foreignKeyErrors,
                message: valid ? 'Backup ist vollständig valide und konsistent.' : 'Integritätsprüfung fehlgeschlagen.'
            };
        } catch (err) {
            if (fs.existsSync(tempUnpackPath)) {
                try { fs.unlinkSync(tempUnpackPath); } catch (_) {}
            }
            return {
                valid: false,
                hashMatch: false,
                sha256Match: false,
                isSqlite: false,
                error: err.message,
                message: `Prüfung fehlgeschlagen: ${err.message}`
            };
        }
    }

    /**
     * Führt ein sicheres Disaster Recovery / Datenbank-Restore durch.
     * Erstellt vor dem Überschreiben IMMER einen zwingenden Sicherheits-Snapshot ('PRE_RESTORE').
     * @param {number|string} backupIdOrPath - Backup-ID oder Dateipfad
     */
    async restoreBackup(backupIdOrPath, bemerkung = 'Disaster Recovery Restore') {
        // 1. Zuerst das Ziel-Backup prüfen
        const verification = await this.verifyBackup(backupIdOrPath);
        if (!verification.valid) {
            throw new Error(`Wiederherstellung abgebrochen: Das ausgewählte Backup ist ungültig oder beschädigt (${verification.message || verification.error})`);
        }

        let targetFilePath = '';
        if (typeof backupIdOrPath === 'number' || (!isNaN(parseInt(backupIdOrPath, 10)) && Number.isInteger(Number(backupIdOrPath)))) {
            const row = this.db.prepare('SELECT * FROM backup_history WHERE id = ?').get(backupIdOrPath);
            targetFilePath = row.dateipfad;
        } else {
            targetFilePath = backupIdOrPath;
        }

        // 2. Zwingender Notfall-Snapshot des aktuellen Zustands vor Restore
        const preRestoreInfo = await this.createBackup('PRE_RESTORE', `Automatischer Notfall-Snapshot vor Wiederherstellung von ${path.basename(targetFilePath)}`);

        // 3. Backup in temporäre SQLite-Datei entpacken
        const tempRestoreDbPath = path.join(this.backupDir, `restore_${Date.now()}.tmp.sqlite`);
        try {
            if (targetFilePath.endsWith('.gz')) {
                const readStream = fs.createReadStream(targetFilePath);
                const gunzipStream = zlib.createGunzip();
                const writeStream = fs.createWriteStream(tempRestoreDbPath);
                await pipeline(readStream, gunzipStream, writeStream);
            } else {
                fs.copyFileSync(targetFilePath, tempRestoreDbPath);
            }

            // 4. Temporäre DB verifizieren
            const sourceDb = new Database(tempRestoreDbPath);
            const testIntegrity = this.verifyIntegrity(sourceDb);

            if (!testIntegrity.valid) {
                sourceDb.close();
                throw new Error('Entpacktes Backup ist korrupt.');
            }

            // 5. Konsistenter Datenbank-Austausch via better-sqlite3 Backup/Restore
            const activeDbPath = this.dbPath;
            if (!activeDbPath || !fs.existsSync(activeDbPath)) {
                sourceDb.close();
                throw new Error(`Aktiver Datenbankpfad nicht gefunden: ${activeDbPath}`);
            }

            // Online-Wiederherstellung in activeDbPath
            await sourceDb.backup(activeDbPath);
            sourceDb.close();

            // Checkpoint auf aktiver DB
            try {
                this.db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').run();
            } catch (_) {}

            // Temp Restore Datei aufräumen
            if (fs.existsSync(tempRestoreDbPath)) {
                try { fs.unlinkSync(tempRestoreDbPath); } catch (_) {}
            }

            if (this.auditLogger && typeof this.auditLogger.appendAuditLog === 'function') {
                this.auditLogger.appendAuditLog({
                    entityType: 'SYSTEM_BACKUP',
                    entityId: 0,
                    action: 'RESTORE_COMPLETED',
                    details: {
                        sourceFile: path.basename(targetFilePath),
                        preRestoreBackup: preRestoreInfo.fileName,
                        bemerkung
                    }
                });
            }

            return {
                success: true,
                message: 'Datenbank erfolgreich wiederhergestellt.',
                preRestoreSnapshot: preRestoreInfo.fileName
            };
        } catch (err) {
            if (fs.existsSync(tempRestoreDbPath)) {
                try { fs.unlinkSync(tempRestoreDbPath); } catch (_) {}
            }
            throw err;
        }
    }

    /**
     * Startet den automatischen Hintergrund-Scheduler für regelmäßige Sicherungen.
     * @param {number} intervalHours - Intervall in Stunden (Standard: 4 Stunden)
     */
    startAutoScheduler(intervalHours = 4) {
        this.stopAutoScheduler();
        const intervalMs = Math.max(1, intervalHours) * 3600 * 1000;
        this.schedulerIntervalId = setInterval(async () => {
            try {
                console.log(`[BackupService] Automatisches Intervall-Backup (${intervalHours}h) wird ausgeführt...`);
                await this.createBackup('CRON', `Automatisches Backup alle ${intervalHours} Stunden`);
            } catch (err) {
                console.error('[BackupService] Fehler im automatischen Backup-Scheduler:', err.message);
            }
        }, intervalMs);

        // Timer nicht Prozess-blockierend halten
        if (this.schedulerIntervalId && this.schedulerIntervalId.unref) {
            this.schedulerIntervalId.unref();
        }
    }

    /**
     * Stoppt den Hintergrund-Scheduler.
     */
    stopAutoScheduler() {
        if (this.schedulerIntervalId) {
            clearInterval(this.schedulerIntervalId);
            this.schedulerIntervalId = null;
        }
    }

    /**
     * Exportiert ein Online-Backup direkt in eine benutzerdefinierte Zieldatei.
     */
    async exportBackupTo(targetFilePath, triggerType = 'MANUAL') {
        const result = await this.createBackup(triggerType, `Manuelle Sicherung nach ${targetFilePath}`);
        if (result.filePath !== targetFilePath) {
            fs.copyFileSync(result.filePath, targetFilePath);
        }
        return { success: true, filePath: targetFilePath, sha256: result.sha256 };
    }
}

module.exports = BackupService;
