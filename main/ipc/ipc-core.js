const { wrapHandler: defaultWrapHandler } = require('./ipc-util');

function register(ipcMain, context = {}) {
    const dbAPI = context.dbAPI || require('../../db').dbAPI;
    const wrapHandler = context.wrapHandler || defaultWrapHandler;

    // Stammdaten & Zustand
    ipcMain.handle('db:getFullState', wrapHandler(async () => await dbAPI.getFullState()));
    ipcMain.handle('db:getDokumente', wrapHandler(async () => await dbAPI.getDokumente()));

    // Artikel
    ipcMain.handle('db:saveArtikel', wrapHandler(async (e, artikel) => {
        if (!artikel || typeof artikel !== 'object' || !artikel.name) {
            throw new Error('Ungültige Artikel-Daten');
        }
        return await dbAPI.saveArtikel(artikel);
    }));

    ipcMain.handle('db:deleteArtikel', wrapHandler(async (e, id) => {
        if (typeof id !== 'number') throw new Error('Ungültige Artikel-ID');
        return await dbAPI.deleteArtikel(id);
    }));

    // Kunden
    ipcMain.handle('db:saveKunde', wrapHandler(async (e, kunde) => {
        if (!kunde || typeof kunde !== 'object' || !kunde.name) {
            throw new Error('Ungültige Kunden-Daten');
        }
        return await dbAPI.saveKunde(kunde);
    }));

    ipcMain.handle('db:deleteKunde', wrapHandler(async (e, id) => {
        if (typeof id !== 'number') throw new Error('Ungültige Kunden-ID');
        return await dbAPI.deleteKunde(id);
    }));

    ipcMain.handle('db:bulkSaveKunden', wrapHandler(async (e, kunden) => {
        if (!kunden || !Array.isArray(kunden)) {
            throw new Error('Ungültige Kunden-Daten für Bulk-Update');
        }
        return await dbAPI.bulkSaveKunden(kunden);
    }));

    // Dokumente
    ipcMain.handle('db:saveDocument', wrapHandler(async (e, doc) => {
        if (!doc || typeof doc !== 'object' || !doc.nr) {
            throw new Error('Ungültige Dokumenten-Daten');
        }
        return await dbAPI.saveDocument(doc);
    }));

    ipcMain.handle('db:bulkSaveDocuments', wrapHandler(async (e, docs) => {
        if (!docs || !Array.isArray(docs)) {
            throw new Error('Ungültige Dokumenten-Daten für Bulk-Update');
        }
        return await dbAPI.bulkSaveDocuments(docs);
    }));

    ipcMain.handle('db:deleteDocument', wrapHandler(async (e, id) => {
        if (typeof id !== 'number') throw new Error('Ungültige Dokumenten-ID');
        return await dbAPI.deleteDocument(id);
    }));

    // GoBD: Schmaler Status-/Buchhaltungspfad (erlaubt auch an gesperrten Belegen)
    ipcMain.handle('db:updateDocumentStatus', wrapHandler(async (e, id, patch) => {
        if (typeof id !== 'number') throw new Error('Ungültige Dokumenten-ID');
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
            throw new Error('Ungültige Status-Daten');
        }
        return await dbAPI.updateDocumentStatus(id, patch);
    }));

    // GOBD-2: GoBD-konformes Verbot jeglicher Beleg-Entsperrung
    ipcMain.handle('db:unlockDocument', wrapHandler(async (e, id, grund) => {
        throw new Error('GoBD-Verstoß: Entsperren von Belegen ist deaktiviert. Bitte erstellen Sie ein Storno.');
    }));

    // Atomares Storno: Original-Status + Gutschrift in einer Transaktion
    ipcMain.handle('db:storniereRechnung', wrapHandler(async (e, updatedOriginal, stornoDoc) => {
        if (!updatedOriginal || typeof updatedOriginal !== 'object' || updatedOriginal.id == null) {
            throw new Error('Ungültige Storno-Daten (Original-Rechnung fehlt)');
        }
        if (!stornoDoc || typeof stornoDoc !== 'object' || !stornoDoc.nr) {
            throw new Error('Ungültige Storno-Daten (Gutschrift ohne Belegnummer)');
        }
        return await dbAPI.storniereRechnung(updatedOriginal, stornoDoc);
    }));

    // GoBD: Prüfung der Audit-Hashkette
    ipcMain.handle('audit:verify', wrapHandler(async () => {
        return await Promise.resolve(dbAPI.verifiziereAuditKette());
    }));

    // Einstellungen
    ipcMain.handle('db:saveEinstellung', wrapHandler(async (e, key, val) => {
        if (!key) throw new Error('Ungültiger Einstellungs-Key');
        return await dbAPI.saveEinstellung(key, val);
    }));
}

module.exports = {
    register,
    registerIpc: register
};
