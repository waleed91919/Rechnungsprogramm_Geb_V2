const electron = require('electron');
const { app, BrowserWindow, Menu, ipcMain } = electron;
const path = require('path');
function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        title: 'W-Link ERP',
        icon: path.join(__dirname, 'W-Link_ERP_software_202604132222.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        show: false
    });

    // Deutsche Menüleiste
    const menuTemplate = [
        {
            label: 'Datei',
            submenu: [
                { label: 'Neue Rechnung', accelerator: 'CmdOrCtrl+N', click: () => { } },
                { type: 'separator' },
                { label: 'Drucken', accelerator: 'CmdOrCtrl+P', click: () => mainWindow.webContents.print() },
                { type: 'separator' },
                { label: 'Beenden', accelerator: 'CmdOrCtrl+Q', role: 'quit' }
            ]
        },
        {
            label: 'Bearbeiten',
            submenu: [
                { label: 'Rückgängig', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
                { label: 'Wiederholen', accelerator: 'CmdOrCtrl+Y', role: 'redo' },
                { type: 'separator' },
                { label: 'Ausschneiden', accelerator: 'CmdOrCtrl+X', role: 'cut' },
                { label: 'Kopieren', accelerator: 'CmdOrCtrl+C', role: 'copy' },
                { label: 'Einfügen', accelerator: 'CmdOrCtrl+V', role: 'paste' },
                { label: 'Alles auswählen', accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
            ]
        },
        {
            label: 'Ansicht',
            submenu: [
                { label: 'Vergrößern', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
                { label: 'Verkleinern', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
                { label: 'Originalgröße', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
                { type: 'separator' },
                { label: 'Vollbild', accelerator: 'F11', role: 'togglefullscreen' },
                { type: 'separator' },
                { label: 'Entwicklertools', accelerator: 'F12', role: 'toggleDevTools' }
            ]
        },
        {
            label: 'Hilfe',
            submenu: [
                {
                    label: 'Über W-Link ERP', click: () => {
                        const { dialog } = require('electron');
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'Über W-Link ERP',
                            message: 'W-Link ERP v1.0.5',
                            detail: 'Professionelle ERP Rechnungsverwaltung\n© 2026 W-Link. Alle Rechte vorbehalten.'
                        });
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);

    mainWindow.loadFile('code.html');

    mainWindow.once('ready-to-show', () => {
        if (process.platform === 'win32') {
            mainWindow.setAlwaysOnTop(true);
            mainWindow.show();
            mainWindow.focus();
            mainWindow.setAlwaysOnTop(false);
        } else {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

// ZUGFeRD-Sichtseite: Der Renderer rendert die Rechnungs-HTML unsichtbar in
// #print-template (das @media print-CSS blendet alles andere aus, identisch zum
// bewährten save:pdf-Weg); hier wird genau dieser Zustand per printToPDF erfasst.
// Entscheidung gegen ein separates Hidden-BrowserWindow: die HTML-Erzeugung liegt
// komplett im Renderer (state, GiroCode via IPC) - ein Duplikat dort wäre fehleranfällig.
const ZUGFERD_SICHTSEITE_TIMEOUT_MS = 15000;

function toPdfBuffer(value) {
    if (!value) return null;
    try {
        let buf;
        if (Buffer.isBuffer(value)) buf = value;
        else if (value instanceof ArrayBuffer) buf = Buffer.from(value);
        else if (ArrayBuffer.isView(value)) buf = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
        else return null;
        if (buf.length > 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return buf;
    } catch (_e) {
        return null;
    }
    return null;
}

function printToPdfWithTimeout(contents, timeoutMs = ZUGFERD_SICHTSEITE_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (err, buf) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (err) reject(err); else resolve(buf);
        };
        const timer = setTimeout(() => finish(new Error(`printToPDF-Timeout nach ${timeoutMs} ms`)), timeoutMs);
        contents.printToPDF({
            printBackground: true,
            pageSize: 'A4',
            margins: { marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 }
        }).then((buf) => finish(null, buf), (err) => finish(err));
    });
}

// Set up IPC Handlers
function setupIpc() {
    const { db, dbAPI, appendAuditLog } = require('./db');

    // --- E-Mail-Versand (F10): Service mit injizierten Abhängigkeiten ---
    const emailService = (() => {
        const { createEmailService } = require('./main/email');
        return createEmailService({
            db,
            appendAuditLog,
            getEinstellung: (key) => {
                const row = db.prepare('SELECT value FROM einstellungen WHERE key=?').get(key);
                return row ? row.value : null;
            },
            saveEinstellung: (key, value) => {
                db.prepare('INSERT OR REPLACE INTO einstellungen (key, value) VALUES (?, ?)').run(key, value);
                return { success: true };
            },
            outboxDir: path.join(app.getPath('userData'), 'email-outbox')
        });
    })();

    // Generic error wrapper for IPC handlers
    const wrapHandler = (fn) => async (event, ...args) => {
        try {
            return await fn(event, ...args);
        } catch (error) {
            console.error('IPC Handler Error:', error);
            throw error; // Electron will pass this error to the renderer
        }
    };

    ipcMain.handle('db:getFullState', wrapHandler(async () => await dbAPI.getFullState()));

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

    // GoBD: Expliziter Freigabe-Weg für gesperrte Belege (audit-pflichtig)
    ipcMain.handle('db:unlockDocument', wrapHandler(async (e, id, grund) => {
        if (typeof id !== 'number') throw new Error('Ungültige Dokumenten-ID');
        return await dbAPI.entsperreBeleg(id, grund);
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
        const DA11Service = require('./js/da11');
        const projekt = (await dbAPI.getFullState()).projekte.find(p => p.id === projectId) || { name: 'Projekt' };
        let blaetter = await dbAPI.getAufmassBlaetter(projectId);
        if (blattId) {
            blaetter = blaetter.filter(b => b.id === blattId);
        }
        const da11Content = DA11Service.generateDA11(projekt, blaetter);

        const { dialog } = require('electron');
        const win = BrowserWindow.fromWebContents(e.sender);
        const { filePath } = await dialog.showSaveDialog(win, {
            title: 'DA11 Aufmaßdatei (REB 23.003) speichern',
            defaultPath: path.join(app.getPath('documents'), `${(projekt.name || 'Aufmass').replace(/[^a-zA-Z0-9]/g, '_')}_REB23003.d11`),
            filters: [
                { name: 'DA11 REB 23.003 Aufmaß (*.d11, *.da11)', extensions: ['d11', 'da11', 'txt'] },
                { name: 'Alle Dateien (*.*)', extensions: ['*'] }
            ]
        });

        if (filePath) {
            const fs = require('fs');
            fs.writeFileSync(filePath, da11Content, 'latin1');
            return { success: true, filePath, content: da11Content };
        }
        return { success: false, cancelled: true };
    }));

    // --- GAEB DA XML 3.3 Phase X31 (Mengenermittlung nach REB 23.003) ---
    ipcMain.handle('aufmass:exportGAEBX31', wrapHandler(async (e, projectId, blattId = null) => {
        const projekt = (await dbAPI.getFullState()).projekte.find(p => p.id === projectId) || { name: 'Projekt' };
        const xmlContent = await dbAPI.exportGAEBX31(projectId, blattId);

        const { dialog } = require('electron');
        const win = BrowserWindow.fromWebContents(e.sender);
        const { filePath } = await dialog.showSaveDialog(win, {
            title: 'GAEB DA XML 3.3 Phase X31 (REB 23.003) Mengenermittlung speichern',
            defaultPath: path.join(app.getPath('documents'), `${(projekt.name || 'Aufmass').replace(/[^a-zA-Z0-9]/g, '_')}_Mengenermittlung.x31`),
            filters: [
                { name: 'GAEB DA XML 3.3 Phase X31 (*.x31, *.xml)', extensions: ['x31', 'xml'] },
                { name: 'Alle Dateien (*.*)', extensions: ['*'] }
            ]
        });

        if (filePath) {
            const fs = require('fs');
            fs.writeFileSync(filePath, xmlContent, 'utf-8');
            focusWin(win);
            return { success: true, filePath, xml: xmlContent };
        }
        focusWin(win);
        return { success: false, cancelled: true };
    }));

    ipcMain.handle('aufmass:importGAEBX31', wrapHandler(async (e, projectId, xmlContent = null) => {
        const { dialog } = require('electron');
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
                const fs = require('fs');
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
        const { dialog } = require('electron');
        const win = BrowserWindow.fromWebContents(e.sender);
        const { projectId, formblatt = '221', html, defaultName } = payload;

        const defaultFileName = defaultName || `EFB_${formblatt}_Projekt.pdf`;
        const { filePath } = await dialog.showSaveDialog(win, {
            title: `EFB-Preisblatt ${formblatt} als PDF speichern`,
            defaultPath: path.join(app.getPath('documents'), defaultFileName),
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

        const fs = require('fs');
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

    // Projekte
    ipcMain.handle('db:saveProjekt', wrapHandler(async (e, projekt) => {
        if (!projekt || typeof projekt !== 'object' || !projekt.name) {
            throw new Error('Ungültige Projekt-Daten');
        }
        return await dbAPI.saveProjekt(projekt);
    }));

    // --- Objektverwaltung (F1) ---
    const OBJEKT_TYPEN = ['LIEGENSCHAFT', 'GEBAEUDE', 'ETAGE', 'RAUM'];

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

    // --- E-Mail-Versand (F10) ---
    ipcMain.handle('smtp:getKonten', wrapHandler(async () => {
        return emailService.ladeKonten();
    }));

    ipcMain.handle('smtp:saveKonto', wrapHandler(async (e, konto) => {
        if (!konto || typeof konto !== 'object') throw new Error('Ungültige Konto-Daten');
        return await emailService.speichereKonto(konto);
    }));

    ipcMain.handle('smtp:deleteKonto', wrapHandler(async (e, id) => {
        if (typeof id !== 'string' || !id.trim()) throw new Error('Ungültige Konto-ID');
        return emailService.loescheKonto(id);
    }));

    ipcMain.handle('smtp:testConnection', wrapHandler(async (e, konto) => {
        if (!konto || typeof konto !== 'object') throw new Error('Ungültige Konto-Daten');
        return await emailService.testeVerbindung(konto);
    }));

    ipcMain.handle('smtp:sendBeleg', wrapHandler(async (event, payload = {}) => {
        if (!payload || typeof payload !== 'object') throw new Error('Ungültige Versand-Daten');
        let pdfBuffer = toPdfBuffer(payload.basePdfBuffer);
        if (!pdfBuffer && event.sender && !event.sender.isDestroyed()) {
            try {
                pdfBuffer = toPdfBuffer(await printToPdfWithTimeout(event.sender));
            } catch (_err) {
                pdfBuffer = null;
            }
        }
        return await emailService.sendeBeleg(payload, pdfBuffer);
    }));

    ipcMain.handle('smtp:wiederholeVersand', wrapHandler(async (event, historieId, basePdfBuffer = null) => {
        if (typeof historieId !== 'number') throw new Error('Ungültige Historie-ID');
        let pdfBuffer = toPdfBuffer(basePdfBuffer);
        if (!pdfBuffer && event.sender && !event.sender.isDestroyed()) {
            try {
                pdfBuffer = toPdfBuffer(await printToPdfWithTimeout(event.sender));
            } catch (_err) {
                pdfBuffer = null;
            }
        }
        return await emailService.wiederhole(historieId, pdfBuffer);
    }));

    ipcMain.handle('smtp:getVersandhistorie', wrapHandler(async (e, belegTyp = null, belegId = null) => {
        return emailService.getVersandhistorie(belegTyp || null, belegId != null ? Number(belegId) : null);
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

    // Einstellungen
    ipcMain.handle('db:saveEinstellung', wrapHandler(async (e, key, val) => {
        if (!key) throw new Error('Ungültiger Einstellungs-Key');
        return await dbAPI.saveEinstellung(key, val);
    }));

    // Helper for robust focus restoration
    const focusWin = (win) => {
        if (!win || win.isDestroyed()) return;
        
        // sequence to "kick" the OS-level focus back to the window
        if (process.platform === 'win32') {
            // Bring app to front at OS level
            app.focus({ steal: true });
            
            win.setAlwaysOnTop(true, 'screen-saver');
            win.setEnabled(true);
            win.show();
            win.focus();
            
            // WebContents focus is often the key for input fields
            win.webContents.focus();

            // Give the OS time to process the focus change before removing AlwaysOnTop
            setTimeout(() => {
                if (!win.isDestroyed()) {
                    win.setAlwaysOnTop(false);
                    win.webContents.focus();
                }
            }, 150);
        } else {
            win.focus();
            win.webContents.focus();
        }
    };

    // --- Revisionssichere Auto-Backup Engine (GoBD & GFS) ---
    ipcMain.handle('backup:create', wrapHandler(async (event, triggerType = 'MANUAL', bemerkung = '') => {
        return await dbAPI.createBackup(triggerType, bemerkung);
    }));

    ipcMain.handle('backup:getHistory', wrapHandler(async () => {
        return await dbAPI.getBackupHistory();
    }));

    ipcMain.handle('backup:verify', wrapHandler(async (event, backupId) => {
        if (!backupId) throw new Error('Backup-ID fehlt für die Prüfung.');
        return await dbAPI.verifyBackup(backupId);
    }));

    ipcMain.handle('backup:restore', wrapHandler(async (event, backupId, bemerkung = '') => {
        if (!backupId) throw new Error('Backup-ID fehlt für die Wiederherstellung.');
        return await dbAPI.restoreBackup(backupId, bemerkung);
    }));

    // Backup (Dialog-Export)
    ipcMain.handle('db:backup', wrapHandler(async (event) => {
        const { dialog } = require('electron');
        const win = BrowserWindow.fromWebContents(event.sender);
        const defaultPath = path.join(app.getPath('documents'), `backup_${new Date().toISOString().split('T')[0]}.sqlite`);

        const { filePath } = await dialog.showSaveDialog(win, {
            title: 'Datenbank-Backup speichern',
            defaultPath: defaultPath,
            filters: [{ name: 'SQLite Datenbank (*.sqlite, *.sqlite.gz)', extensions: ['sqlite', 'gz'] }]
        });

        if (filePath) {
            const result = await dbAPI.backup(filePath);
            focusWin(win);
            return { success: true, path: filePath, ...result };
        }
        focusWin(win);
        return { success: false, cancelled: true };
    }));

    // Restore (Dialog-Import)
    ipcMain.handle('db:restore', wrapHandler(async (event) => {
        const { dialog } = require('electron');
        const win = BrowserWindow.fromWebContents(event.sender);

        const { filePaths } = await dialog.showOpenDialog(win, {
            title: 'Backup-Datei zum Wiederherstellen auswählen',
            properties: ['openFile'],
            filters: [{ name: 'SQLite Datenbank (*.sqlite, *.sqlite.gz)', extensions: ['sqlite', 'gz', 'db'] }]
        });

        if (filePaths && filePaths.length > 0) {
            const result = await dbAPI.restore(filePaths[0]);
            focusWin(win);
            return { success: true, ...result };
        }
        focusWin(win);
        return { success: false, cancelled: true };
    }));

    // QR Code Generation
    ipcMain.handle('qr:generate', wrapHandler(async (event, text) => {
        if (!text) return null;
        const QRCode = require('qrcode');
        return await QRCode.toDataURL(text, {
            errorCorrectionLevel: 'M',
            margin: 1,
            width: 150
        });
    }));

    /**
     * Fokussiert das Zielfenster nach Modal- und Dialog-Schließungen unter Windows.
     */
    ipcMain.handle('app:focusWindow', wrapHandler(async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        focusWin(win);
    }));

    ipcMain.handle('dialog:confirm', wrapHandler(async (event, options) => {
        const { dialog } = require('electron');
        const win = BrowserWindow.fromWebContents(event.sender);
        const result = await dialog.showMessageBox(win, {
            type: 'question',
            buttons: ['Abbrechen', 'Bestätigen'],
            defaultId: 1,
            cancelId: 0,
            title: options.title || 'Bestätigung',
            message: options.message,
            detail: options.detail || ''
        });
        focusWin(win);
        return result.response === 1;
    }));

    ipcMain.handle('dialog:alert', wrapHandler(async (event, options) => {
        const { dialog } = require('electron');
        const win = BrowserWindow.fromWebContents(event.sender);
        await dialog.showMessageBox(win, {
            type: 'info',
            buttons: ['OK'],
            title: options.title || 'Information',
            message: options.message,
            detail: options.detail || ''
        });
        focusWin(win);
    }));

    // Print Handler (Electron Main Process)
    ipcMain.handle('app:printDocument', wrapHandler(async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win && !win.isDestroyed()) {
            return new Promise((resolve) => {
                win.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
                    focusWin(win);
                    resolve({ success: !!success, failureReason });
                });
            });
        }
        return { success: false, failureReason: 'Window not found' };
    }));

    // PDF Generierung
    const fs = require('fs');
    ipcMain.handle('save:pdf', wrapHandler(async (event, bufferData, defaultName = 'Dokument.pdf') => {
        const { dialog } = require('electron');
        const win = BrowserWindow.fromWebContents(event.sender);
        
        try {
            let pdfBuffer = bufferData;
            let fileName = defaultName;
            if (typeof bufferData === 'string') {
                fileName = bufferData;
                pdfBuffer = null;
            }

            const defaultPath = path.join(app.getPath('documents'), fileName || 'Dokument.pdf');

            const { filePath } = await dialog.showSaveDialog(win, {
                title: 'Als PDF speichern',
                defaultPath: defaultPath,
                filters: [{ name: 'PDF Dateien', extensions: ['pdf'] }]
            });

            if (filePath) {
                let dataToWrite;
                if (pdfBuffer && (pdfBuffer instanceof ArrayBuffer || ArrayBuffer.isView(pdfBuffer) || Buffer.isBuffer(pdfBuffer))) {
                    dataToWrite = Buffer.from(pdfBuffer);
                } else {
                    dataToWrite = await event.sender.printToPDF({
                        printBackground: true,
                        pageSize: 'A4',
                        margins: { marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 }
                    });
                }
                fs.writeFileSync(filePath, dataToWrite);
                focusWin(win);
                return { success: true, path: filePath };
            }
            focusWin(win);
            return { success: false, cancelled: true };
        } catch (err) {
            console.error('IPC save:pdf error:', err);
            if (win) focusWin(win);
            return { success: false, error: err.message || String(err) };
        }
    }));

    // ZUGFeRD 2.x Export (PDF/A-3 mit eingebetteter E-Rechnungs-XML)
    ipcMain.handle('invoice:exportZugferdPdf', wrapHandler(async (event, payload = {}) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        try {
            const doc = payload.doc;
            const customer = payload.customer || null;
            if (!doc || typeof doc !== 'object' || !doc.nr) {
                throw new Error('Ungültige Rechnungsdaten für den ZUGFeRD-Export.');
            }

            const profile = payload.profile === 'XRECHNUNG' ? 'XRECHNUNG' : 'EN16931';
            const EInvoiceEngine = require('./js/einvoice');
            const { ZugferdBuilder } = require('./main/zugferd-builder');
            const profileInfo = EInvoiceEngine.getZUGFeRDProfileInfo(profile);

            const seller = (await dbAPI.getFullState()).einstellungen;
            const xmlString = EInvoiceEngine.generateZUGFeRDXML(doc, customer, seller, { profile });

            // Echte menschenlesbare Sichtseite: bevorzugt vom Renderer mitgeliefert,
            // sonst per printToPDF vom aufrufenden Fenster erfassen; bei jedem Fehler
            // läuft der Export mit der Platzhalter-Seite des Builders weiter.
            let basePdfBuffer = toPdfBuffer(payload.basePdfBuffer);
            if (!basePdfBuffer && payload.sichtseiteErzeugen !== false && event.sender && !event.sender.isDestroyed()) {
                try {
                    basePdfBuffer = toPdfBuffer(await printToPdfWithTimeout(event.sender));
                    if (!basePdfBuffer) {
                        console.warn('ZUGFeRD-Export: printToPDF lieferte kein gültiges PDF - verwende Platzhalter-Seite.');
                    }
                } catch (pdfErr) {
                    console.warn('ZUGFeRD-Export: Keine echte Sichtseite verfügbar (' + (pdfErr.message || pdfErr) + ') - verwende Platzhalter-Seite.');
                }
            }

            const duePayableAmount = EInvoiceEngine.computeTotals(doc).duePayable;

            const buffer = await ZugferdBuilder.build({
                basePdfBuffer,
                xmlString,
                meta: {
                    nr: doc.nr,
                    datum: doc.datum,
                    sellerName: seller.firmenname || seller.name || '',
                    empfaengerName: (customer && customer.name) || doc.customerName || '',
                    duePayableAmount: duePayableAmount.toFixed(2),
                    conformanceLevel: profileInfo.conformanceLevel,
                    fileName: profileInfo.fileName,
                    title: `Rechnung ${doc.nr}`
                }
            });

            const { dialog } = require('electron');
            const fileNameHint = String(payload.fileNameHint || `ZUGFeRD_${doc.nr}.pdf`).replace(/[\\/:*?"<>|]/g, '_');

            const { filePath } = await dialog.showSaveDialog(win, {
                title: 'ZUGFeRD-PDF (PDF/A-3) speichern',
                defaultPath: path.join(app.getPath('documents'), fileNameHint),
                filters: [
                    { name: 'ZUGFeRD PDF (*.pdf)', extensions: ['pdf'] },
                    { name: 'Alle Dateien (*.*)', extensions: ['*'] }
                ]
            });

            if (!filePath) {
                focusWin(win);
                return { success: false, cancelled: true };
            }

            // GoBD: Audit-Eintrag VOR dem Schreiben der Datei über die zentrale
            // Hashkette. Schlägt das Protokollieren fehl, wird der Export
            // abgebrochen - unprotokollierte Belegausgaben sind unzulässig.
            appendAuditLog({
                entityType: 'DOCUMENT',
                entityId: typeof doc.id === 'number' ? doc.id : 0,
                action: 'ZUGFERD_EXPORT',
                details: {
                    nr: doc.nr,
                    profile,
                    fileName: path.basename(filePath),
                    bytes: buffer.length,
                    sha256: require('crypto').createHash('sha256').update(buffer).digest('hex')
                }
            });

            fs.writeFileSync(filePath, buffer);

            focusWin(win);
            return { success: true, path: filePath };
        } catch (err) {
            console.error('IPC invoice:exportZugferdPdf error:', err);
            if (win && !win.isDestroyed()) focusWin(win);
            return { success: false, error: err.message || String(err) };
        }
    }));

    // Starte automatischen Backup-Scheduler falls konfiguriert
    try {
        const intervalRow = db.prepare("SELECT value FROM einstellungen WHERE key='backup_interval_hours'").get();
        const intervalHours = intervalRow ? parseFloat(intervalRow.value) : 4;
        if (intervalHours > 0 && dbAPI.getBackupService) {
            dbAPI.getBackupService().startAutoScheduler(intervalHours);
        }
    } catch (schedErr) {
        console.warn('[Auto-Backup Scheduler] Konnte Scheduler nicht starten:', schedErr.message);
    }
}

let isQuittingApp = false;
app.on('before-quit', async (event) => {
    if (isQuittingApp) return;
    try {
        const { db, dbAPI } = require('./db');
        const autoExitRow = db.prepare("SELECT value FROM einstellungen WHERE key='backup_auto_on_exit'").get();
        if (!autoExitRow || autoExitRow.value === 'true' || autoExitRow.value === '1') {
            console.log('[Auto-Backup] Erstelle Sicherung beim Beenden der Anwendung...');
            await dbAPI.createBackup('AUTO_SHUTDOWN', 'Automatisches Backup beim Beenden der Anwendung');
        }
    } catch (e) {
        console.warn('[Auto-Backup on Exit] Warnung:', e.message);
    }
    isQuittingApp = true;
});

app.whenReady().then(() => {
    setupIpc();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
