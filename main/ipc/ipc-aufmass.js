const path = require('path');
const fs = require('fs');
const { BrowserWindow, dialog, app } = require('electron');
const { wrapHandler: defaultWrapHandler, focusWin: defaultFocusWin } = require('./ipc-util');

function register(ipcMain, context = {}) {
    const dbAPI = context.dbAPI || require('../../db').dbAPI;
    const wrapHandler = context.wrapHandler || defaultWrapHandler;
    const focusWin = context.focusWin || defaultFocusWin;
    const electronApp = context.app || app;
    const getDocsDir = () => (electronApp && typeof electronApp.getPath === 'function') ? electronApp.getPath('documents') : process.cwd();

    // Aufmaß
    ipcMain.handle('db:saveAufmass', wrapHandler(async (e, aufmass) => {
        if (!aufmass || typeof aufmass !== 'object') {
            throw new Error('Ungültige Aufmaß-Daten');
        }
        return await dbAPI.saveAufmass(aufmass);
    }));

    ipcMain.handle('db:deleteAufmass', wrapHandler(async (e, id) => {
        if (typeof id !== 'number') throw new Error('Ungültige Aufmaß-ID');
        return await dbAPI.deleteAufmass(id);
    }));

    ipcMain.handle('db:getAufmassById', wrapHandler(async (e, id) => {
        if (typeof id !== 'number') throw new Error('Ungültige Aufmaß-ID');
        return await dbAPI.getAufmassById(id);
    }));

    ipcMain.handle('db:getAufmassByPositionId', wrapHandler(async (e, positionId) => {
        return await dbAPI.getAufmassByPositionId(positionId);
    }));

    ipcMain.handle('db:saveAufmassForPosition', wrapHandler(async (e, positionId, aufmassData) => {
        return await dbAPI.saveAufmassForPosition(positionId, aufmassData);
    }));

    ipcMain.handle('db:getAufmasseByRechnungId', wrapHandler(async (e, rechnungId) => {
        return await dbAPI.getAufmasseByRechnungId(rechnungId);
    }));

    ipcMain.handle('db:getAufmasseByProjektId', wrapHandler(async (e, projektId) => {
        return await dbAPI.getAufmasseByProjektId(projektId);
    }));

    // --- Aufmaßcenter & DA11 Export ---
    ipcMain.handle('db:getAufmassBlaetter', wrapHandler(async (e, projectId) => {
        return await dbAPI.getAufmassBlaetter(projectId);
    }));

    ipcMain.handle('db:saveAufmassBlatt', wrapHandler(async (e, blattData, zeilen) => {
        return await dbAPI.saveAufmassBlatt(blattData, zeilen);
    }));

    ipcMain.handle('db:deleteAufmassBlatt', wrapHandler(async (e, blattId) => {
        return await dbAPI.deleteAufmassBlatt(blattId);
    }));

    ipcMain.handle('db:mergeSchlussaufmass', wrapHandler(async (e, projectId) => {
        return await dbAPI.mergeSchlussaufmass(projectId);
    }));

    ipcMain.handle('aufmass:exportDA11', wrapHandler(async (e, projectId, blattId = null) => {
        const DA11Service = require('../../js/da11');
        const projekt = (await dbAPI.getFullState()).projekte.find(p => p.id === projectId) || { name: 'Projekt' };
        let blaetter = await dbAPI.getAufmassBlaetter(projectId);
        if (blattId) {
            blaetter = blaetter.filter(b => b.id === blattId);
        }
        const da11Content = DA11Service.generateDA11(projekt, blaetter);

        const win = BrowserWindow.fromWebContents(e.sender);
        const { filePath } = await dialog.showSaveDialog(win, {
            title: 'DA11 Aufmaßdatei (REB 23.003) speichern',
            defaultPath: path.join(getDocsDir(), `${(projekt.name || 'Aufmass').replace(/[^a-zA-Z0-9]/g, '_')}_REB23003.d11`),
            filters: [
                { name: 'DA11 REB 23.003 Aufmaß (*.d11, *.da11)', extensions: ['d11', 'da11', 'txt'] },
                { name: 'Alle Dateien (*.*)', extensions: ['*'] }
            ]
        });

        if (filePath) {
            fs.writeFileSync(filePath, da11Content, 'latin1');
            return { success: true, filePath, content: da11Content };
        }
        return { success: false, cancelled: true };
    }));

    // --- GAEB DA XML 3.3 Phase X31 (Mengenermittlung nach REB 23.003) ---
    ipcMain.handle('aufmass:exportGAEBX31', wrapHandler(async (e, projectId, blattId = null) => {
        const projekt = (await dbAPI.getFullState()).projekte.find(p => p.id === projectId) || { name: 'Projekt' };
        const xmlContent = await dbAPI.exportGAEBX31(projectId, blattId);

        const win = BrowserWindow.fromWebContents(e.sender);
        const { filePath } = await dialog.showSaveDialog(win, {
            title: 'GAEB DA XML 3.3 Phase X31 (REB 23.003) Mengenermittlung speichern',
            defaultPath: path.join(getDocsDir(), `${(projekt.name || 'Aufmass').replace(/[^a-zA-Z0-9]/g, '_')}_Mengenermittlung.x31`),
            filters: [
                { name: 'GAEB DA XML Phase X31 (*.x31, *.xml)', extensions: ['x31', 'xml'] },
                { name: 'Alle Dateien (*.*)', extensions: ['*'] }
            ]
        });

        if (filePath) {
            fs.writeFileSync(filePath, xmlContent, 'utf-8');
            focusWin(win);
            return { success: true, filePath, xml: xmlContent };
        }
        focusWin(win);
        return { success: false, cancelled: true };
    }));

    ipcMain.handle('aufmass:importGAEBX31', wrapHandler(async (e, projectId, xmlContent = null) => {
        const win = BrowserWindow.fromWebContents(e.sender);

        let content = xmlContent;
        if (!content) {
            const { filePaths } = await dialog.showOpenDialog(win, {
                title: 'GAEB X31 Mengenermittlung importieren',
                properties: ['openFile'],
                filters: [
                    { name: 'GAEB DA XML Phase X31 (*.x31, *.xml)', extensions: ['x31', 'xml'] },
                    { name: 'Alle Dateien (*.*)', extensions: ['*'] }
                ]
            });
            if (filePaths && filePaths.length > 0) {
                content = fs.readFileSync(filePaths[0], 'utf-8');
            } else {
                focusWin(win);
                return { success: false, cancelled: true };
            }
        }

        const result = await dbAPI.importGAEBX31(projectId, content);
        focusWin(win);
        return result;
    }));

    ipcMain.handle('db:getKumulativeAbrechnung', wrapHandler(async (e, projectId) => {
        return await dbAPI.getKumulativeAbrechnung(projectId);
    }));
}

module.exports = {
    register,
    registerIpc: register
};
