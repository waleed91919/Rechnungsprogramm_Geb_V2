const { wrapHandler: defaultWrapHandler } = require('./ipc-util');

function register(ipcMain, context = {}) {
    const dbAPI = context.dbAPI || require('../../db').dbAPI;
    const wrapHandler = context.wrapHandler || defaultWrapHandler;

    // --- Phase 3: Mitarbeiter & Arbeitszeiterfassung (BAG/ArbZG/BRTV) ---
    ipcMain.handle('mitarbeiter:getAll', wrapHandler(async (event, filter) => {
        return dbAPI.getMitarbeiter(filter);
    }));

    ipcMain.handle('mitarbeiter:save', wrapHandler(async (event, data) => {
        return dbAPI.saveMitarbeiter(data);
    }));

    ipcMain.handle('mitarbeiter:delete', wrapHandler(async (event, id) => {
        return dbAPI.deleteMitarbeiter(id);
    }));

    ipcMain.handle('zeiterfassung:getAll', wrapHandler(async (event, filter) => {
        return dbAPI.getZeiteintraege(filter);
    }));

    ipcMain.handle('zeiterfassung:save', wrapHandler(async (event, data) => {
        return dbAPI.saveZeiteintrag(data);
    }));

    ipcMain.handle('zeiterfassung:delete', wrapHandler(async (event, id, meta) => {
        return dbAPI.deleteZeiteintrag(id, meta);
    }));

    ipcMain.handle('zeiterfassung:getMonatsauswertung', wrapHandler(async (event, { monat, jahr, mitarbeiterId }) => {
        return dbAPI.getZeiterfassungMonatsauswertung(monat, jahr, mitarbeiterId);
    }));

    // --- Phase 3: VOB/B Bedenken- & Behinderungsanzeigen ---
    ipcMain.handle('vob:getAll', wrapHandler(async (event, filter) => {
        return dbAPI.getVobMeldungen(filter);
    }));

    ipcMain.handle('vob:save', wrapHandler(async (event, data) => {
        return dbAPI.saveVobMeldung(data);
    }));

    ipcMain.handle('vob:delete', wrapHandler(async (event, id) => {
        return dbAPI.deleteVobMeldung(id);
    }));

    ipcMain.handle('vob:generatePdf', wrapHandler(async (event, id) => {
        return dbAPI.generateVobMeldungPdfHtml(id);
    }));
}

module.exports = {
    register,
    registerIpc: register
};
