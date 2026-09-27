const path = require('path');
const fs = require('fs');
const { BrowserWindow, dialog, app } = require('electron');
const { wrapHandler: defaultWrapHandler, focusWin: defaultFocusWin } = require('./ipc-util');

function register(ipcMain, context = {}) {
    const dbAPI = context.dbAPI || require('../../db').dbAPI;
    const appendAuditLog = context.appendAuditLog || require('../../db').appendAuditLog;
    const wrapHandler = context.wrapHandler || defaultWrapHandler;
    const focusWin = context.focusWin || defaultFocusWin;
    const electronApp = context.app || app;
    const getDocsDir = () => (electronApp && typeof electronApp.getPath === 'function') ? electronApp.getPath('documents') : process.cwd();

    // --- EFB-Preisblätter 221 & 223 (VHB Bund) ---
    ipcMain.handle('efb:getKalkulation', wrapHandler(async (e, projectId) => {
        if (!projectId) throw new Error('Projekt-ID fehlt');
        return await dbAPI.getEfbKalkulation(projectId);
    }));

    ipcMain.handle('efb:saveProfil', wrapHandler(async (e, profilData) => {
        if (!profilData) throw new Error('Profildaten fehlen');
        return await dbAPI.saveEfbProfile(profilData);
    }));

    ipcMain.handle('efb:generatePdf', wrapHandler(async (e, payload = {}) => {
        const win = BrowserWindow.fromWebContents(e.sender);
        const { projectId, formblatt = '221', html, defaultName } = payload;

        const defaultFileName = defaultName || `EFB_${formblatt}_Projekt.pdf`;
        const { filePath } = await dialog.showSaveDialog(win, {
            title: `EFB-Preisblatt ${formblatt} als PDF speichern`,
            defaultPath: path.join(getDocsDir(), defaultFileName),
            filters: [{ name: 'PDF Dateien', extensions: ['pdf'] }]
        });

        if (!filePath) {
            focusWin(win);
            return { success: false, cancelled: true };
        }

        const isLandscape = formblatt === '223';
        const pdfWin = new BrowserWindow({
            show: false,
            width: isLandscape ? 1400 : 900,
            height: isLandscape ? 900 : 1400,
            webPreferences: { nodeIntegration: false, contextIsolation: true }
        });

        await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html || '<h1>EFB Preisblatt</h1>')}`);
        const pdfBuffer = await pdfWin.webContents.printToPDF({
            printBackground: true,
            pageSize: 'A4',
            landscape: isLandscape,
            margins: { marginType: 'custom', top: 0.3, bottom: 0.3, left: 0.4, right: 0.4 }
        });
        pdfWin.close();

        fs.writeFileSync(filePath, pdfBuffer);

        appendAuditLog({
            entityType: 'PROJECT',
            entityId: Number(projectId) || 0,
            action: 'EFB_PDF_EXPORT',
            details: {
                formblatt,
                filePath,
                bytes: pdfBuffer.length
            }
        });

        focusWin(win);
        return { success: true, filePath };
    }));
}

module.exports = {
    register,
    registerIpc: register
};
