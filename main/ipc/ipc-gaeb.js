/**
 * main/ipc/ipc-gaeb.js
 * IPC-Handler für GAEB X83 Import, Persistenz, Laden und Löschen.
 */

const { wrapHandler: defaultWrapHandler } = require('./ipc-util');
const gaebRepo = require('../../db/repositories/gaeb_repository');
const gaebTenderRepo = require('../../db/repositories/gaeb_tender_repo');

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

    // --- Tender Bepreisung & Entwürfe ---

    // Erstellt einen neuen Tender-Entwurf
    ipcMain.handle('gaeb:create-tender-draft', wrapHandler(async (e, payload = {}, maybeOptions) => {
        const importId = (typeof payload === 'object' && payload !== null && payload.importId !== undefined)
            ? payload.importId
            : payload;
        const options = (typeof payload === 'object' && payload !== null && payload.options !== undefined)
            ? payload.options
            : (maybeOptions || (typeof payload === 'object' && payload !== null && payload.importId !== undefined ? payload : {}));

        if (!importId) throw new Error('Import-ID fehlt für Tender-Draft-Erstellung.');
        if (dbAPI && typeof dbAPI.createTenderDraft === 'function') {
            return dbAPI.createTenderDraft(importId, options);
        }
        return gaebTenderRepo.createTenderDraft(db, importId, options);
    }));

    // Speichert Preise und BiReq-Antworten eines Tender-Entwurfs
    ipcMain.handle('gaeb:save-tender-draft', wrapHandler(async (e, payload = {}, maybeData) => {
        const draftId = (typeof payload === 'object' && payload !== null && payload.draftId !== undefined)
            ? payload.draftId
            : payload;
        const draftData = (typeof payload === 'object' && payload !== null && payload.draftData !== undefined)
            ? payload.draftData
            : (maybeData || (typeof payload === 'object' && payload !== null ? payload : {}));

        if (!draftId) throw new Error('Draft-ID fehlt für Speicherung.');
        if (dbAPI && typeof dbAPI.saveTenderDraft === 'function') {
            return dbAPI.saveTenderDraft(draftId, draftData);
        }
        return gaebTenderRepo.saveTenderDraft(db, draftId, draftData);
    }));

    // Lädt einen Tender-Entwurf inkl. Items, Preisen und Baum
    ipcMain.handle('gaeb:load-tender-draft', wrapHandler(async (e, payload) => {
        const draftId = (typeof payload === 'object' && payload !== null && payload.draftId !== undefined)
            ? payload.draftId
            : payload;
        if (!draftId) throw new Error('Draft-ID fehlt für Laden.');
        if (dbAPI && typeof dbAPI.loadTenderDraft === 'function') {
            return dbAPI.loadTenderDraft(draftId);
        }
        return gaebTenderRepo.loadTenderDraft(db, draftId);
    }));

    // Listet alle Entwürfe eines Imports auf
    ipcMain.handle('gaeb:list-tender-drafts', wrapHandler(async (e, payload) => {
        const importId = (typeof payload === 'object' && payload !== null && payload.importId !== undefined)
            ? payload.importId
            : payload;
        if (!importId) throw new Error('Import-ID fehlt.');
        if (dbAPI && typeof dbAPI.listTenderDrafts === 'function') {
            return dbAPI.listTenderDrafts(importId);
        }
        return gaebTenderRepo.listTenderDrafts(db, importId);
    }));

    // Klont einen Entwurf zu einer neuen Version
    ipcMain.handle('gaeb:clone-tender-draft', wrapHandler(async (e, payload = {}, maybeOptions) => {
        const draftId = (typeof payload === 'object' && payload !== null && payload.draftId !== undefined)
            ? payload.draftId
            : payload;
        const options = (typeof payload === 'object' && payload !== null && payload.options !== undefined)
            ? payload.options
            : (maybeOptions || (typeof payload === 'object' && payload !== null ? payload : {}));

        if (!draftId) throw new Error('Draft-ID fehlt für Klonen.');
        if (dbAPI && typeof dbAPI.cloneTenderDraft === 'function') {
            return dbAPI.cloneTenderDraft(draftId, options);
        }
        return gaebTenderRepo.cloneTenderDraft(db, draftId, options);
    }));

    // Löscht einen Tender-Entwurf
    ipcMain.handle('gaeb:delete-tender-draft', wrapHandler(async (e, payload) => {
        const draftId = (typeof payload === 'object' && payload !== null && payload.draftId !== undefined)
            ? payload.draftId
            : payload;
        if (!draftId) throw new Error('Draft-ID fehlt für Löschung.');
        if (dbAPI && typeof dbAPI.deleteTenderDraft === 'function') {
            return dbAPI.deleteTenderDraft(draftId);
        }
        return gaebTenderRepo.deleteTenderDraft(db, draftId);
    }));
}

module.exports = {
    register
};
