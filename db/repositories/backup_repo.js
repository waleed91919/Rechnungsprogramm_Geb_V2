/**
 * Backup Repository
 * Revisionssichere Auto-Backup Engine (GoBD & GFS) sowie SQLite-Sicherung
 */
const fs = require('fs');

function createBackupRepo(deps) {
    const { db, dbPath, backupService } = deps;

    return {
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
    },

// --- Revisionssichere Auto-Backup Engine (GoBD & GFS) ---
    async createBackup(triggerType = 'MANUAL', bemerkung = '') {
        return await backupService.createBackup(triggerType, bemerkung);
    },

    getBackupHistory() {
        return db.prepare('SELECT * FROM backup_history ORDER BY erstellt_am DESC').all();
    },

    async verifyBackup(backupIdOrPath) {
        return await backupService.verifyBackup(backupIdOrPath);
    },

    async restoreBackup(backupIdOrPath, bemerkung = '') {
        return await backupService.restoreBackup(backupIdOrPath, bemerkung);
    },

    async backup(filePath) {
        return await backupService.exportBackupTo(filePath);
    },

    async restore(filePath) {
        return await backupService.restoreBackup(filePath);
    },

    getBackupService() {
        return backupService;
    }
    };
}

module.exports = createBackupRepo;
