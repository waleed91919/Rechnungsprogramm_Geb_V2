const { wrapHandler: defaultWrapHandler } = require('./ipc-util');

const OBJEKT_TYPEN = ['LIEGENSCHAFT', 'GEBAEUDE', 'ETAGE', 'RAUM'];

function register(ipcMain, context = {}) {
    const dbAPI = context.dbAPI || require('../../db').dbAPI;
    const wrapHandler = context.wrapHandler || defaultWrapHandler;

    // --- Dauerrechnungen (F2) ---
    ipcMain.handle('db:getAbrechnungsplaene', wrapHandler(async (e, filter = {}) => {
        return await dbAPI.getAbrechnungsplaene(filter || {});
    }));

    ipcMain.handle('db:saveAbrechnungsplan', wrapHandler(async (e, plan, positionen = []) => {
        if (!plan || typeof plan !== 'object') {
            throw new Error('Ungültige Plan-Daten');
        }
        if (!Array.isArray(positionen)) {
            throw new Error('Ungültige Plan-Positionen');
        }
        return await dbAPI.saveAbrechnungsplan(plan, positionen);
    }));

    ipcMain.handle('db:deleteAbrechnungsplan', wrapHandler(async (e, id) => {
        if (typeof id !== 'number') throw new Error('Ungültige Plan-ID');
        return await dbAPI.deleteAbrechnungsplan(id);
    }));

    ipcMain.handle('db:updateAbrechnungsplanStatus', wrapHandler(async (e, id, aktiv) => {
        if (typeof id !== 'number') throw new Error('Ungültige Plan-ID');
        return await dbAPI.updateAbrechnungsplanStatus(id, aktiv);
    }));

    ipcMain.handle('db:getPlanLaeufe', wrapHandler(async (e, planId) => {
        if (typeof planId !== 'number') throw new Error('Ungültige Plan-ID');
        return await dbAPI.getPlanLaeufe(planId);
    }));

    ipcMain.handle('db:dauerrechnungenVorschau', wrapHandler(async (e, stichdatum = null) => {
        return await dbAPI.dauerrechnungenVorschau(stichdatum);
    }));

    ipcMain.handle('db:generiereFaelligeRechnungen', wrapHandler(async (e, optionen = {}) => {
        if (!optionen || typeof optionen !== 'object') {
            throw new Error('Ungültige Generierungs-Optionen');
        }
        return await dbAPI.generiereFaelligeRechnungen(optionen);
    }));

    ipcMain.handle('db:generiereSammelrechnung', wrapHandler(async (e, payload = {}) => {
        if (!payload || typeof payload.kundeId !== 'number' || !Array.isArray(payload.laufIds)) {
            throw new Error('Ungültige Sammelrechnung-Daten');
        }
        const laeufe = payload.laufIds.length > 0 && typeof payload.laufIds[0] === 'object'
            ? payload.laufIds
            : payload.laufIds.map(id => ({ laufId: id }));
        return await dbAPI.erzeugeSammelrechnung(payload.kundeId, laeufe);
    }));

    ipcMain.handle('db:storniereLauf', wrapHandler(async (e, laufId, grund) => {
        if (typeof laufId !== 'number') throw new Error('Ungültige Lauf-ID');
        return await dbAPI.storniereLauf(laufId, grund);
    }));

    ipcMain.handle('db:autoRunDauerrechnungen', wrapHandler(async () => {
        return await dbAPI.autoRunDauerrechnungen();
    }));

    // --- Putzplan/Reinigungs-LV (F3) ---
    ipcMain.handle('db:getPutzplan', wrapHandler(async (e, objektTyp, objektId) => {
        if (!OBJEKT_TYPEN.includes(objektTyp)) throw new Error('Ungültiger Objekttyp');
        if (typeof objektId !== 'number') throw new Error('Ungültige Objekt-ID');
        return await dbAPI.getPutzplan(objektTyp, objektId);
    }));

    ipcMain.handle('db:saveLvBereich', wrapHandler(async (e, data) => {
        if (!data || typeof data !== 'object' || !data.name || !String(data.name).trim()) {
            throw new Error('Ungültige Bereichs-Daten');
        }
        return await dbAPI.saveLvBereich(data);
    }));

    ipcMain.handle('db:deleteLvBereich', wrapHandler(async (e, id) => {
        if (typeof id !== 'number') throw new Error('Ungültige Bereichs-ID');
        return await dbAPI.deleteLvBereich(id);
    }));

    ipcMain.handle('db:saveLvPosition', wrapHandler(async (e, data, eintraege = []) => {
        if (!data || typeof data !== 'object') throw new Error('Ungültige Positions-Daten');
        if (!Array.isArray(eintraege)) throw new Error('Ungültige Eintragsliste');
        return await dbAPI.saveLvPosition(data, eintraege);
    }));

    ipcMain.handle('db:deleteLvPosition', wrapHandler(async (e, id) => {
        if (typeof id !== 'number') throw new Error('Ungültige Positions-ID');
        return await dbAPI.deleteLvPosition(id);
    }));

    ipcMain.handle('db:getZuschlagsProfil', wrapHandler(async () => {
        return await dbAPI.getZuschlagsProfil();
    }));

    ipcMain.handle('db:saveZuschlagsProfil', wrapHandler(async (e, profil) => {
        if (!profil || typeof profil !== 'object') throw new Error('Ungültige Profildaten');
        return await dbAPI.saveZuschlagsProfil(profil);
    }));

    ipcMain.handle('db:uebernehmeLvInAbrechnungsplan', wrapHandler(async (e, payload = {}) => {
        if (!payload || typeof payload !== 'object') throw new Error('Ungültige Übernahme-Daten');
        return await dbAPI.uebernehmeLvInAbrechnungsplan(payload);
    }));

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
