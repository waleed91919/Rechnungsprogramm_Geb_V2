/**
 * main/ipc/ipc-gaeb.js
 * IPC-Handler für GAEB X83 Import, Persistenz, Laden und Löschen.
 */

const { wrapHandler: defaultWrapHandler } = require('./ipc-util');
const gaebRepo = require('../../db/repositories/gaeb_repository');

function register(ipcMain, context = {}) {
    const db = context.db || (context.dbAPI && context.dbAPI.db) || require('../../db').db;
    const dbAPI = context.dbAPI || require('../../db').dbAPI;
    const wrapHandler = context.wrapHandler || defaultWrapHandler;

    // Speichert ein geparstes X83 Dokument atomar in SQLite
    ipcMain.handle('gaeb:save-import', wrapHandler(async (e, payload = {}) => {
        const { parsedData, options } = payload;
        if (dbAPI && typeof dbAPI.saveX83Import === 'function') {
            return dbAPI.saveX83Import(parsedData, options);
        }
        return gaebRepo.saveX83Import(db, parsedData, options);
    }));

    // Lädt einen vollständigen X83 Import (Kopfdaten, Baum, Items, BiReq, UPComponents)
    ipcMain.handle('gaeb:load-import', wrapHandler(async (e, importId) => {
        if (!importId) throw new Error('Import-ID fehlt.');
        if (dbAPI && typeof dbAPI.loadX83Import === 'function') {
            return dbAPI.loadX83Import(importId);
        }
        return gaebRepo.loadX83Import(db, importId);
    }));

    // Listet alle importierten Ausschreibungen mit aggregierten Statistiken
    ipcMain.handle('gaeb:list-imports', wrapHandler(async () => {
        if (dbAPI && typeof dbAPI.listX83Imports === 'function') {
            return dbAPI.listX83Imports();
        }
        return gaebRepo.listX83Imports(db);
    }));

    // Löscht einen Import mit Verknüpfungsschutz
    ipcMain.handle('gaeb:delete-import', wrapHandler(async (e, importId) => {
        if (!importId) throw new Error('Import-ID fehlt.');
        if (dbAPI && typeof dbAPI.deleteX83Import === 'function') {
            return dbAPI.deleteX83Import(importId);
        }
        return gaebRepo.deleteX83Import(db, importId);
    }));

    // Verknüpft einen GAEB-Import mit einem echten Angebot in dokumente
    ipcMain.handle('gaeb:link-angebot', wrapHandler(async (e, payload = {}) => {
        const { importId, angebotId, notes } = payload;
        if (dbAPI && typeof dbAPI.linkImportToAngebot === 'function') {
            return dbAPI.linkImportToAngebot(importId, angebotId, notes);
        }
        return gaebRepo.linkImportToAngebot(db, importId, angebotId, notes);
    }));

    // Gibt alle mit dem Import verknüpften Angebote zurück
    ipcMain.handle('gaeb:get-linked-angebote', wrapHandler(async (e, importId) => {
        if (!importId) throw new Error('Import-ID fehlt.');
        if (dbAPI && typeof dbAPI.getLinkedAngebote === 'function') {
            return dbAPI.getLinkedAngebote(importId);
        }
        return gaebRepo.getLinkedAngebote(db, importId);
    }));

    // Gibt gezielt den echten Original-Dateipuffer (BLOB) des Imports zurück
    ipcMain.handle('gaeb:get-original-buffer', wrapHandler(async (e, importId) => {
        if (!importId) throw new Error('Import-ID fehlt.');
        if (dbAPI && typeof dbAPI.getImportOriginalBuffer === 'function') {
            return dbAPI.getImportOriginalBuffer(importId);
        }
        return gaebRepo.getImportOriginalBuffer(db, importId);
    }));
}

module.exports = {
    register
};
