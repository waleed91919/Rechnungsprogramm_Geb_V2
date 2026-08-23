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

// Set up IPC Handlers
function setupIpc() {
    const { db, dbAPI } = require('./db');

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

    // Backup
    ipcMain.handle('db:backup', wrapHandler(async (event) => {
        const { dialog } = require('electron');
        const win = BrowserWindow.fromWebContents(event.sender);
        const defaultPath = path.join(app.getPath('documents'), `backup_${new Date().toISOString().split('T')[0]}.sqlite`);

        const { filePath } = await dialog.showSaveDialog(win, {
            title: 'Datenbank-Backup speichern',
            defaultPath: defaultPath,
            filters: [{ name: 'SQLite Datenbank', extensions: ['sqlite'] }]
        });

        if (filePath) {
            await dbAPI.backup(filePath);
            focusWin(win);
            return { success: true, path: filePath };
        }
        focusWin(win);
        return { success: false, cancelled: true };
    }));

    // Restore
    ipcMain.handle('db:restore', wrapHandler(async (event) => {
        const { dialog } = require('electron');
        const win = BrowserWindow.fromWebContents(event.sender);

        const { filePaths } = await dialog.showOpenDialog(win, {
            title: 'Backup-Datei zum Wiederherstellen auswählen',
            properties: ['openFile'],
            filters: [{ name: 'SQLite Datenbank', extensions: ['sqlite'] }]
        });

        if (filePaths && filePaths.length > 0) {
            await dbAPI.restore(filePaths[0]);
            focusWin(win);
            return { success: true };
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

            const buffer = await ZugferdBuilder.build({
                basePdfBuffer: null,
                xmlString,
                meta: {
                    nr: doc.nr,
                    datum: doc.datum,
                    sellerName: seller.firmenname || seller.name || '',
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

            fs.writeFileSync(filePath, buffer);

            try {
                const crypto = require('crypto');
                const lastRow = db.prepare('SELECT current_hash FROM audit_logs ORDER BY id DESC LIMIT 1').get();
                const currentHash = crypto.createHash('sha256').update(buffer).digest('hex');
                db.prepare('INSERT INTO audit_logs (entity_type, entity_id, action, previous_hash, current_hash, details) VALUES (?, ?, ?, ?, ?, ?)')
                    .run(
                        'DOCUMENT',
                        typeof doc.id === 'number' ? doc.id : 0,
                        'ZUGFERD_EXPORT',
                        (lastRow && lastRow.current_hash) || '',
                        currentHash,
                        JSON.stringify({ nr: doc.nr, profile, fileName: path.basename(filePath), bytes: buffer.length })
                    );
            } catch (auditErr) {
                console.error('Audit-Log für den ZUGFeRD-Export fehlgeschlagen:', auditErr);
            }

            focusWin(win);
            return { success: true, path: filePath };
        } catch (err) {
            console.error('IPC invoice:exportZugferdPdf error:', err);
            if (win && !win.isDestroyed()) focusWin(win);
            return { success: false, error: err.message || String(err) };
        }
    }));
}

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
