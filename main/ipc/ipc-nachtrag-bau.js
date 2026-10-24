const { wrapHandler: defaultWrapHandler } = require('./ipc-util');


function register(ipcMain, context = {}) {
    const dbAPI = context.dbAPI || require('../../db').dbAPI;
    const wrapHandler = context.wrapHandler || defaultWrapHandler;

    // --- Nachtragsverwaltung (VOB/B) ---
    ipcMain.handle('db:getNachtraege', wrapHandler(async (e, projectId) => {
        return await dbAPI.getNachtraege(projectId);
    }));

    ipcMain.handle('db:saveNachtrag', wrapHandler(async (e, nachtragData, positionen) => {
        return await dbAPI.saveNachtrag(nachtragData, positionen);
    }));

    ipcMain.handle('db:updateNachtragStatus', wrapHandler(async (e, nachtragId, status) => {
        return await dbAPI.updateNachtragStatus(nachtragId, status);
    }));

    // J13: GENEHMIGT-Nachtrag idempotent in den LV-Stamm übernehmen
    ipcMain.handle('db:uebernehmeNachtragInsLV', wrapHandler(async (e, nachtragId) => {
        const numId = Number(nachtragId);
        if (!Number.isInteger(numId) || numId <= 0) throw new Error('Ungültige Nachtrag-ID');
        return await dbAPI.uebernehmeNachtragInsLV(numId);
    }));

    ipcMain.handle('db:deleteNachtrag', wrapHandler(async (e, nachtragId) => {
        return await dbAPI.deleteNachtrag(nachtragId);
    }));

    // --- Bautagebuch & Abnahmeprotokoll ---
    ipcMain.handle('db:getBautagebuch', wrapHandler(async (e, projectId) => {
        return await dbAPI.getBautagebuch(projectId);
    }));

    ipcMain.handle('db:saveBautagebuch', wrapHandler(async (e, data) => {
        return await dbAPI.saveBautagebuch(data);
    }));

    ipcMain.handle('db:deleteBautagebuch', wrapHandler(async (e, id) => {
        return await dbAPI.deleteBautagebuch(id);
    }));

    ipcMain.handle('db:getAbnahmeprotokolle', wrapHandler(async (e, projectId) => {
        return await dbAPI.getAbnahmeprotokolle(projectId);
    }));

    ipcMain.handle('db:saveAbnahmeprotokoll', wrapHandler(async (e, data) => {
        return await dbAPI.saveAbnahmeprotokoll(data);
    }));

    // --- Eingangsrechnungen & Controlling ---
    ipcMain.handle('db:getEingangsrechnungen', wrapHandler(async (e, projectId) => {
        return await dbAPI.getEingangsrechnungen(projectId);
    }));

    ipcMain.handle('db:saveEingangsrechnung', wrapHandler(async (e, data) => {
        return await dbAPI.saveEingangsrechnung(data);
    }));

    ipcMain.handle('db:deleteEingangsrechnung', wrapHandler(async (e, id) => {
        return await dbAPI.deleteEingangsrechnung(id);
    }));

    ipcMain.handle('db:getControllingStats', wrapHandler(async (e, projectId) => {
        return await dbAPI.getControllingStats(projectId);
    }));

    // --- Projekte ---
    ipcMain.handle('db:saveProjekt', wrapHandler(async (e, projekt) => {
        if (!projekt || typeof projekt !== 'object' || !projekt.name) {
            throw new Error('Ungültige Projekt-Daten');
        }
        return await dbAPI.saveProjekt(projekt);
    }));

}

module.exports = {
    register,
    registerIpc: register
};
