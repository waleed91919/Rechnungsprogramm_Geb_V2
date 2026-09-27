const path = require('path');
const fs = require('fs');
const { BrowserWindow } = require('electron');
const { wrapHandler: defaultWrapHandler } = require('./ipc-util');

function register(ipcMain, context = {}) {
    const dbAPI = context.dbAPI || require('../../db').dbAPI;
    const wrapHandler = context.wrapHandler || defaultWrapHandler;

    // --- Zuschlagskalkulation & Mittellohn ---
    ipcMain.handle('kalkulation:getStammProfil', wrapHandler(async (event, id) => {
        return dbAPI.getZuschlagskalkulationStamm(id);
    }));

    ipcMain.handle('kalkulation:getAllStammProfile', wrapHandler(async () => {
        return dbAPI.getAllZuschlagskalkulationStamm();
    }));

    ipcMain.handle('kalkulation:saveStammProfil', wrapHandler(async (event, profileData) => {
        return dbAPI.saveZuschlagskalkulationStamm(profileData);
    }));

    ipcMain.handle('kalkulation:deleteStammProfil', wrapHandler(async (event, id) => {
        return dbAPI.deleteZuschlagskalkulationStamm(id);
    }));

    ipcMain.handle('kalkulation:getProjectKalkulation', wrapHandler(async (event, projektId) => {
        return dbAPI.getProjectKalkulation(projektId);
    }));

    ipcMain.handle('kalkulation:saveProjectProfil', wrapHandler(async (event, projektId, profileData) => {
        return dbAPI.saveProjectKalkulationProfile(projektId, profileData);
    }));

    // --- DATANORM 4.0 / 5.0 Streaming Import (SEC-5 gehärtet) ---
    ipcMain.handle('datanorm:startImport', wrapHandler(async (event, payload) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        const { filePaths, options } = payload || {};

        if (!Array.isArray(filePaths) || filePaths.length === 0) {
            throw new Error('Keine Dateipfade für den Import übergeben.');
        }

        const ALLOWED_EXTS = new Set(['.001', '.002', '.003', '.004', '.005', '.ans', '.art', '.dat', '.txt', '.csv', '.d81', '.d82', '.d83', '.d84', '.d85', '.d86']);
        const validatedPaths = [];

        for (const fp of filePaths) {
            if (typeof fp !== 'string' || !fp.trim()) continue;
            const resolved = path.resolve(fp.trim());
            const ext = path.extname(resolved).toLowerCase();

            if (!ALLOWED_EXTS.has(ext)) {
                throw new Error(`Sicherheitsverstoß (SEC-5): Dateityp "${ext}" ist für DATANORM unzulässig.`);
            }
            if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
                throw new Error(`Datei nicht gefunden oder kein reguläres Dateiobjekt: ${path.basename(resolved)}`);
            }

            // Größen-Check (Schutz vor DoS durch übergroße Dateien > 250 MB)
            const stat = fs.statSync(resolved);
            if (stat.size > 250 * 1024 * 1024) {
                throw new Error(`Datei ${path.basename(resolved)} überschreitet das Sicherheitslimit von 250 MB.`);
            }

            // Systemverzeichnis-Prüfung
            const lower = resolved.toLowerCase();
            if (lower.startsWith('c:\\windows') || lower.startsWith('/etc')) {
                throw new Error(`Zugriff auf Systempfad verweigert: ${resolved}`);
            }

            validatedPaths.push(resolved);
        }

        const progressCb = (progress) => {
            if (win && !win.isDestroyed()) {
                win.webContents.send('datanorm:progress', progress);
            }
        };
        return await dbAPI.startDatanormImport({ filePaths: validatedPaths, options }, progressCb);
    }));

    ipcMain.handle('datanorm:getKataloge', wrapHandler(async (event, filter) => {
        return dbAPI.getDatanormKataloge(filter);
    }));

    ipcMain.handle('datanorm:deleteKatalog', wrapHandler(async (event, katalogId) => {
        return dbAPI.deleteDatanormKatalog(katalogId);
    }));

    // --- Projektübergreifendes Mängelkataster & Fristenmanagement ---
    ipcMain.handle('maengel:getKataster', wrapHandler(async (event, filter) => {
        return dbAPI.getMaengelKataster(filter);
    }));

    ipcMain.handle('maengel:getDetails', wrapHandler(async (event, mangelId) => {
        return dbAPI.getMangelDetails(mangelId);
    }));

    ipcMain.handle('maengel:saveMangel', wrapHandler(async (event, mangelData, fotos) => {
        return dbAPI.saveMangel(mangelData, fotos);
    }));

    ipcMain.handle('maengel:updateStatus', wrapHandler(async (event, { mangelId, newStatus, kommentar, geaendertVon }) => {
        return dbAPI.updateMangelStatus(mangelId, newStatus, kommentar, geaendertVon);
    }));

    ipcMain.handle('maengel:deleteMangel', wrapHandler(async (event, mangelId) => {
        return dbAPI.deleteMangel(mangelId);
    }));

    ipcMain.handle('maengel:generateMahnschreiben', wrapHandler(async (event, { mangelId, stufe, optionen }) => {
        return dbAPI.generateMahnschreiben(mangelId, stufe, optionen);
    }));

    ipcMain.handle('maengel:generateProtokoll', wrapHandler(async (event, mangelId) => {
        return dbAPI.generateMangelProtokollPdf(mangelId);
    }));

    ipcMain.handle('maengel:executeErsatzvornahme', wrapHandler(async (event, payload) => {
        return dbAPI.executeMangelErsatzvornahme(payload);
    }));
}

module.exports = {
    register,
    registerIpc: register
};
