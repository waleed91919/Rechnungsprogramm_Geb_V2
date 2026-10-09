const { wrapHandler: defaultWrapHandler } = require('./ipc-util');

const OBJEKT_TYPEN = ['LIEGENSCHAFT', 'GEBAEUDE', 'ETAGE', 'RAUM'];

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

    // --- Objektverwaltung (F1) ---
    ipcMain.handle('db:getObjektBaum', wrapHandler(async () => {
        return await dbAPI.getObjektBaum();
    }));

    ipcMain.handle('db:saveLiegenschaft', wrapHandler(async (e, data) => {
        if (!data || typeof data !== 'object' || !data.name || !String(data.name).trim()) {
            throw new Error('Ungültige Liegenschafts-Daten');
        }
        return await dbAPI.saveLiegenschaft(data);
    }));

    ipcMain.handle('db:deleteLiegenschaft', wrapHandler(async (e, id) => {
        const numId = Number(id);
        if (!Number.isInteger(numId) || numId <= 0) throw new Error('Ungültige Liegenschaft-ID');
        return await dbAPI.deleteLiegenschaft(numId);
    }));

    ipcMain.handle('db:saveGebaeude', wrapHandler(async (e, data) => {
        if (!data || typeof data !== 'object' || !data.name || !String(data.name).trim()) {
            throw new Error('Ungültige Gebäude-Daten');
        }
        if (data.liegenschaft_id == null || !Number.isInteger(Number(data.liegenschaft_id))) throw new Error('Ungültige Gebäude-Daten');
        return await dbAPI.saveGebaeude(data);
    }));

    ipcMain.handle('db:deleteGebaeude', wrapHandler(async (e, id) => {
        const numId = Number(id);
        if (!Number.isInteger(numId) || numId <= 0) throw new Error('Ungültige Gebäude-ID');
        return await dbAPI.deleteGebaeude(numId);
    }));

    ipcMain.handle('db:saveEtage', wrapHandler(async (e, data) => {
        if (!data || typeof data !== 'object' || !data.name || !String(data.name).trim()) {
            throw new Error('Ungültige Etagen-Daten');
        }
        if (data.gebaeude_id == null || !Number.isInteger(Number(data.gebaeude_id))) throw new Error('Ungültige Etagen-Daten');
        return await dbAPI.saveEtage(data);
    }));

    ipcMain.handle('db:deleteEtage', wrapHandler(async (e, id) => {
        const numId = Number(id);
        if (!Number.isInteger(numId) || numId <= 0) throw new Error('Ungültige Etage-ID');
        return await dbAPI.deleteEtage(numId);
    }));

    ipcMain.handle('db:saveRaum', wrapHandler(async (e, data) => {
        if (!data || typeof data !== 'object' || !data.name || !String(data.name).trim()) {
            throw new Error('Ungültige Raum-Daten');
        }
        if (data.etage_id == null || !Number.isInteger(Number(data.etage_id))) throw new Error('Ungültige Raum-Daten');
        if (data.flaeche != null && data.flaeche !== '' && (isNaN(parseFloat(data.flaeche)) || parseFloat(data.flaeche) < 0)) {
            throw new Error('Ungültige Fläche');
        }
        return await dbAPI.saveRaum(data);
    }));

    ipcMain.handle('db:deleteRaum', wrapHandler(async (e, id) => {
        const numId = Number(id);
        if (!Number.isInteger(numId) || numId <= 0) throw new Error('Ungültige Raum-ID');
        return await dbAPI.deleteRaum(numId);
    }));

    ipcMain.handle('db:getObjektDetails', wrapHandler(async (e, objektTyp, objektId) => {
        if (!OBJEKT_TYPEN.includes(objektTyp)) throw new Error('Ungültiger Objekttyp');
        const numId = Number(objektId);
        if (!Number.isInteger(numId) || numId <= 0) throw new Error('Ungültige Objekt-ID');
        return await dbAPI.getObjektDetails(objektTyp, numId);
    }));

    ipcMain.handle('db:getObjektHistorie', wrapHandler(async (e, objektTyp, objektId, optionen = {}) => {
        if (!OBJEKT_TYPEN.includes(objektTyp)) throw new Error('Ungültiger Objekttyp');
        const numId = Number(objektId);
        if (!Number.isInteger(numId) || numId <= 0) throw new Error('Ungültige Objekt-ID');
        return await dbAPI.getObjektHistorie(objektTyp, numId, optionen.includeKinder !== false);
    }));
}

module.exports = {
    register,
    registerIpc: register,
    OBJEKT_TYPEN
};
