const { wrapHandler: defaultWrapHandler } = require('./ipc-util');


function register(ipcMain, context = {}) {
    const dbAPI = context.dbAPI || require('../../db').dbAPI;
    const wrapHandler = context.wrapHandler || defaultWrapHandler;

    // --- Banking, OPOS & SEPA (F11) ---
    ipcMain.handle('db:getBankKonten', wrapHandler(async () => {
        return await dbAPI.getBankKonten();
    }));

    ipcMain.handle('db:saveBankKonto', wrapHandler(async (e, konto) => {
        if (!konto || typeof konto !== 'object') throw new Error('Ungültige Kontodaten');
        return await dbAPI.saveBankKonto(konto);
    }));

    ipcMain.handle('db:deleteBankKonto', wrapHandler(async (e, id) => {
        if (typeof id !== 'number') throw new Error('Ungültige Konto-ID');
        return await dbAPI.deleteBankKonto(id);
    }));

    ipcMain.handle('db:importBankTransactions', wrapHandler(async (e, kontoId, transactions, meta) => {
        if (typeof kontoId !== 'number' || !Array.isArray(transactions)) throw new Error('Ungültige Importdaten');
        return await dbAPI.importBankTransactions(kontoId, transactions, meta);
    }));

    ipcMain.handle('db:getBankTransaktionen', wrapHandler(async (e, filter = {}) => {
        return await dbAPI.getBankTransaktionen(filter);
    }));

    ipcMain.handle('db:runOposMatching', wrapHandler(async (e, kontoId = null) => {
        return await dbAPI.runOposMatching(kontoId);
    }));

    ipcMain.handle('db:applyPaymentMatching', wrapHandler(async (e, matches, options = {}) => {
        if (!Array.isArray(matches)) throw new Error('Ungültige Matching-Daten');
        return await dbAPI.applyPaymentMatching(matches, options);
    }));

    ipcMain.handle('db:unmatchTransaction', wrapHandler(async (e, zuordnungId, grund) => {
        if (typeof zuordnungId !== 'number') throw new Error('Ungültige Zuordnungs-ID');
        return await dbAPI.unmatchTransaction(zuordnungId, grund);
    }));

    ipcMain.handle('db:getKundenMandate', wrapHandler(async (e, kundeId = null) => {
        return await dbAPI.getKundenMandate(kundeId);
    }));

    ipcMain.handle('db:saveSepaMandat', wrapHandler(async (e, mandat) => {
        if (!mandat || typeof mandat !== 'object') throw new Error('Ungültige Mandatsdaten');
        return await dbAPI.saveSepaMandat(mandat);
    }));

    ipcMain.handle('db:deleteSepaMandat', wrapHandler(async (e, id) => {
        if (typeof id !== 'number') throw new Error('Ungültige Mandat-ID');
        return await dbAPI.deleteSepaMandat(id);
    }));

    ipcMain.handle('db:getOffeneRechnungenFuerSepa', wrapHandler(async () => {
        return await dbAPI.getOffeneRechnungenFuerSepa();
    }));

    ipcMain.handle('db:createSepaRun', wrapHandler(async (e, payload) => {
        if (!payload || typeof payload !== 'object') throw new Error('Ungültige SEPA-Laufdaten');
        return await dbAPI.createSepaRun(payload);
    }));

    ipcMain.handle('db:getSepaLaeufe', wrapHandler(async () => {
        return await dbAPI.getSepaLaeufe();
    }));

    ipcMain.handle('db:getSepaLaufDetails', wrapHandler(async (e, laufId) => {
        if (typeof laufId !== 'number') throw new Error('Ungültige Lauf-ID');
        return await dbAPI.getSepaLaufDetails(laufId);
    }));

    ipcMain.handle('db:exportSepaRunXml', wrapHandler(async (e, laufId) => {
        if (typeof laufId !== 'number') throw new Error('Ungültige Lauf-ID');
        return await dbAPI.exportSepaRunXml(laufId);
    }));

    ipcMain.handle('db:storniereSepaLauf', wrapHandler(async (e, laufId, grund) => {
        if (typeof laufId !== 'number') throw new Error('Ungültige Lauf-ID');
        return await dbAPI.storniereSepaLauf(laufId, grund);
    }));

    ipcMain.handle('db:markiereRuecklastschrift', wrapHandler(async (e, positionId, grund) => {
        if (typeof positionId !== 'number') throw new Error('Ungültige Positions-ID');
        return await dbAPI.markiereRuecklastschrift(positionId, grund);
    }));
}

module.exports = {
    register,
    registerIpc: register
};
