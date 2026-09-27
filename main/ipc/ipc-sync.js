const path = require('path');
const { app } = require('electron');
const SyncServer = require('../sync-server');
const { loadSyncConfig, saveSyncConfig } = require('../sync-config');
const { wrapHandler: defaultWrapHandler } = require('./ipc-util');

let syncServerInstance = null;

function createSyncServer(db, customApp = null) {
    const electronApp = customApp || app;
    const userDataDir = (electronApp && typeof electronApp.getPath === 'function')
        ? electronApp.getPath('userData')
        : process.cwd();

    return new SyncServer(db, null, {
        ...loadSyncConfig(db),
        uploadsDir: path.join(userDataDir, 'sync_uploads')
    });
}

function getSyncServerInstance() {
    return syncServerInstance;
}

async function stopSyncServer() {
    if (syncServerInstance) {
        await syncServerInstance.stop();
        syncServerInstance = null;
    }
}

function autoStartSyncServer(db, customApp = null) {
    try {
        if (loadSyncConfig(db).autoStart) {
            syncServerInstance = createSyncServer(db, customApp);
            syncServerInstance.start().catch(e => console.warn('[SyncServer Auto-Start] Warnung:', e.message));
        }
    } catch (syncErr) {
        console.warn('[SyncServer Auto-Start] Fehler:', syncErr.message);
    }
}

function register(ipcMain, context = {}) {
    const db = context.db || require('../../db').db;
    const dbAPI = context.dbAPI || require('../../db').dbAPI;
    const wrapHandler = context.wrapHandler || defaultWrapHandler;
    const electronApp = context.app || app;

    // --- Phase 3: Local-First P2P Sync Server ---
    ipcMain.handle('sync:getStatus', wrapHandler(async () => {
        return {
            ...(syncServerInstance ? syncServerInstance.getServerInfo() : { isRunning: false }),
            config: loadSyncConfig(db)
        };
    }));

    ipcMain.handle('sync:configure', wrapHandler(async (event, config) => {
        // Konfiguration zuerst validieren. Speichern startet keinen Listener.
        const saved = saveSyncConfig(db, config);
        if (syncServerInstance) await syncServerInstance.stop();
        syncServerInstance = null;
        return saved;
    }));

    ipcMain.handle('sync:startServer', wrapHandler(async () => {
        if (!syncServerInstance) {
            syncServerInstance = createSyncServer(db, electronApp);
        }
        return await syncServerInstance.start();
    }));

    ipcMain.handle('sync:stopServer', wrapHandler(async () => {
        if (syncServerInstance) {
            return await syncServerInstance.stop();
        }
        return { success: true };
    }));

    ipcMain.handle('sync:getPairingPayload', wrapHandler(async () => {
        if (!syncServerInstance || !syncServerInstance.isRunning) {
            throw new Error('Sync Hub zuerst ausdrücklich starten.');
        }
        return syncServerInstance.getPairingPayload();
    }));

    ipcMain.handle('sync:getConflicts', wrapHandler(async () => {
        return dbAPI.getSyncConflicts();
    }));

    ipcMain.handle('sync:resolveConflict', wrapHandler(async (event, { conflictId, strategy, mergedData }) => {
        return dbAPI.resolveSyncConflict(conflictId, strategy, mergedData);
    }));
}

module.exports = {
    register,
    registerIpc: register,
    createSyncServer,
    getSyncServerInstance,
    stopSyncServer,
    autoStartSyncServer
};
