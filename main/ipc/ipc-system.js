const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app, BrowserWindow, dialog } = require('electron');
const {
    wrapHandler: defaultWrapHandler,
    focusWin: defaultFocusWin,
    toPdfBuffer: defaultToPdfBuffer,
    printToPdfWithTimeout: defaultPrintToPdfWithTimeout,
    waitForPrintReady: defaultWaitForPrintReady
} = require('./ipc-util');

function initAutoBackupScheduler(db, dbAPI) {
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

function register(ipcMain, context = {}) {
    const db = context.db || require('../../db').db;
    const dbAPI = context.dbAPI || require('../../db').dbAPI;
    const appendAuditLog = context.appendAuditLog || require('../../db').appendAuditLog;
    const wrapHandler = context.wrapHandler || defaultWrapHandler;
    const focusWin = context.focusWin || defaultFocusWin;
    const toPdfBuffer = context.toPdfBuffer || defaultToPdfBuffer;
    const printToPdfWithTimeout = context.printToPdfWithTimeout || defaultPrintToPdfWithTimeout;
    const waitForPrintReady = context.waitForPrintReady || defaultWaitForPrintReady;
    const electronApp = context.app || app;
    const getUserDataDir = () => (electronApp && typeof electronApp.getPath === 'function') ? electronApp.getPath('userData') : process.cwd();
    const getDocsDir = () => (electronApp && typeof electronApp.getPath === 'function') ? electronApp.getPath('documents') : process.cwd();

    // --- E-Mail-Versand (F10): Service mit injizierten Abhängigkeiten ---
    const emailService = context.emailService || (() => {
        const { createEmailService } = require('../email');
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
            outboxDir: path.join(getUserDataDir(), 'email-outbox')
        });
    })();

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
        const win = BrowserWindow.fromWebContents(event.sender);
        const defaultPath = path.join(getDocsDir(), `backup_${new Date().toISOString().split('T')[0]}.sqlite`);

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
            margin: 2,
            width: 400
        });
    }));

    // Fokus-Wiederherstellung nach Dialogen
    ipcMain.handle('app:focusWindow', wrapHandler(async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        focusWin(win);
    }));

    ipcMain.handle('dialog:confirm', wrapHandler(async (event, options) => {
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

    // Drucken
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
    ipcMain.handle('save:pdf', wrapHandler(async (event, bufferData, defaultName = 'Dokument.pdf') => {
        const win = BrowserWindow.fromWebContents(event.sender);
        
        try {
            let pdfBuffer = bufferData;
            let fileName = defaultName;
            if (typeof bufferData === 'string') {
                fileName = bufferData;
                pdfBuffer = null;
            }

            const defaultPath = path.join(getDocsDir(), fileName || 'Dokument.pdf');

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
            const docId = payload.docId || (payload.doc && payload.doc.id);
            if (!docId || typeof docId !== 'number' || docId <= 0) {
                throw new Error('ZUGFeRD-Export blockiert: Feld „Beleg-ID“ fehlt — Beleg erst speichern und festschreiben.');
            }

            // B-3: Belegfixierung - Lade maßgeblichen Datensatz direkt per SELECT aus SQLite
            const dbDoc = dbAPI.getDocumentById ? dbAPI.getDocumentById(docId) : dbAPI.getDocumentWithChildren(docId);
            if (!dbDoc) {
                throw new Error(`ZUGFeRD-Export blockiert: Beleg #${docId} wurde in der Datenbank nicht gefunden.`);
            }

            const EInvoiceEngine = require('../../js/einvoice');
            // B-9 & H-2: Export-Gate erzwingen
            EInvoiceEngine.assertExportfaehigerBeleg(dbDoc);

            // Integritätsprüfung gegen übergebenen Renderer-DOM-Stand
            if (payload.doc && typeof payload.doc === 'object') {
                if (Math.abs((parseFloat(payload.doc.netto) || 0) - (parseFloat(dbDoc.netto) || 0)) > 0.02 ||
                    Math.abs((parseFloat(payload.doc.brutto) || 0) - (parseFloat(dbDoc.brutto) || 0)) > 0.02) {
                    throw new Error('Integritätsfehler (B-3): Die Werte im Rechnungsformular weichen vom gespeicherten Beleg ab. Bitte Änderungen zuerst speichern oder verwerfen.');
                }
            }

            const customer = (dbDoc.kundeId ? db.prepare('SELECT * FROM kunden WHERE id=?').get(dbDoc.kundeId) : null) || payload.customer || null;
            const profile = payload.profile === 'XRECHNUNG' ? 'XRECHNUNG' : 'EN16931';
            const { ZugferdBuilder } = require('../zugferd-builder');
            const profileInfo = EInvoiceEngine.getZUGFeRDProfileInfo(profile);

            const fullState = await dbAPI.getFullState();
            const seller = { ...(fullState.einstellungen || {}), artikel: fullState.artikel || [] };
            const validation = EInvoiceEngine.validateForEN16931(dbDoc, customer, seller);
            if (!validation.isValid) {
                focusWin(win);
                return { success: false, validationErrors: validation.errors, error: validation.errors.join(' ') };
            }
            const xmlString = EInvoiceEngine.generateZUGFeRDXML(dbDoc, customer, seller, { profile });

            let basePdfBuffer = toPdfBuffer(payload.basePdfBuffer);
            let sichtseiteQuelle = basePdfBuffer ? 'echt' : null;
            let sichtseiteFehler = null;
            if (!basePdfBuffer && payload.sichtseiteErzeugen !== false && event.sender && !event.sender.isDestroyed()) {
                try {
                    await waitForPrintReady(event.sender);
                    basePdfBuffer = toPdfBuffer(await printToPdfWithTimeout(event.sender));
                    if (basePdfBuffer) {
                        sichtseiteQuelle = 'echt';
                    } else {
                        sichtseiteFehler = 'printToPDF lieferte keinen gültigen PDF-Puffer';
                    }
                } catch (pdfErr) {
                    sichtseiteFehler = (pdfErr && (pdfErr.message || String(pdfErr))) || 'Unbekannter printToPDF-Fehler';
                }
            }
            const allowFallback = payload.allowFallback === true || payload.sichtseiteErzeugen === false;
            if (!basePdfBuffer) {
                if (!allowFallback) {
                    throw new Error('ZUGFeRD-Export abgebrochen: Keine echte Sichtseite verfügbar (' + (sichtseiteFehler || 'leerer printToPDF-Puffer') + '). Mit Platzhalter-Seite speichern? Export mit allowFallback:true wiederholen.');
                }
                sichtseiteQuelle = 'fallback';
                console.warn('ZUGFeRD-Export: Keine echte Sichtseite verfügbar (' + (sichtseiteFehler || 'leerer Puffer') + ') - verwende Platzhalter-Seite.');
            }

            const duePayableAmount = EInvoiceEngine.computeTotals(dbDoc).duePayable;

            const buffer = await ZugferdBuilder.build({
                basePdfBuffer,
                xmlString,
                meta: {
                    nr: dbDoc.nr,
                    datum: dbDoc.datum,
                    sellerName: seller.firmenname || seller.name || '',
                    empfaengerName: (customer && (customer.name || customer.firmenname)) || dbDoc.customerName || '',
                    duePayableAmount: duePayableAmount.toFixed(2),
                    conformanceLevel: profileInfo.conformanceLevel,
                    fileName: profileInfo.fileName,
                    title: `Rechnung ${dbDoc.nr}`
                }
            });

            const fileNameHint = String(payload.fileNameHint || `ZUGFeRD_${dbDoc.nr}.pdf`).replace(/[\\/:*?"<>|]/g, '_');

            let defaultDir = getDocsDir();
            if (profile !== 'XRECHNUNG') {
                try {
                    const kandidat = path.join(process.cwd(), 'output', 'invoices', 'b2b_zugferd');
                    fs.mkdirSync(kandidat, { recursive: true });
                    defaultDir = kandidat;
                } catch (_e) {
                    defaultDir = getDocsDir();
                }
            }

            const { filePath } = await dialog.showSaveDialog(win, {
                title: 'ZUGFeRD-PDF (PDF/A-3) speichern',
                defaultPath: path.join(defaultDir, fileNameHint),
                filters: [
                    { name: 'ZUGFeRD PDF (*.pdf)', extensions: ['pdf'] },
                    { name: 'Alle Dateien (*.*)', extensions: ['*'] }
                ]
            });

            if (!filePath) {
                focusWin(win);
                return { success: false, cancelled: true, sichtseiteQuelle };
            }

            appendAuditLog({
                entityType: 'DOCUMENT',
                entityId: dbDoc.id,
                action: 'ZUGFERD_EXPORT',
                details: {
                    nr: dbDoc.nr,
                    profile,
                    sichtseiteQuelle,
                    fileName: path.basename(filePath),
                    bytes: buffer.length,
                    sha256: crypto.createHash('sha256').update(buffer).digest('hex')
                }
            });

            fs.writeFileSync(filePath, buffer);

            focusWin(win);
            return { success: true, path: filePath, sichtseiteQuelle };
        } catch (err) {
            console.error('IPC invoice:exportZugferdPdf error:', err);
            if (win && !win.isDestroyed()) focusWin(win);
            return { success: false, error: err.message || String(err) };
        }
    }));

    // XRechnung XML Export (EN 16931-1 / CII)
    ipcMain.handle('invoice:exportXRechnungXml', wrapHandler(async (event, payload = {}) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        try {
            const docId = payload.docId || (payload.doc && payload.doc.id);
            if (!docId || typeof docId !== 'number' || docId <= 0) {
                throw new Error('XRechnung-Export blockiert: Feld „Beleg-ID“ fehlt — Beleg erst speichern und festschreiben.');
            }

            // B-3: Belegfixierung - Lade maßgeblichen Datensatz direkt per SELECT aus SQLite
            const dbDoc = dbAPI.getDocumentById ? dbAPI.getDocumentById(docId) : dbAPI.getDocumentWithChildren(docId);
            if (!dbDoc) {
                throw new Error(`XRechnung-Export blockiert: Beleg #${docId} wurde in der Datenbank nicht gefunden.`);
            }

            const EInvoiceEngine = require('../../js/einvoice');
            // B-9 & H-2: Export-Gate erzwingen
            EInvoiceEngine.assertExportfaehigerBeleg(dbDoc);

            // Integritätsprüfung gegen übergebenen Renderer-DOM-Stand
            if (payload.doc && typeof payload.doc === 'object') {
                if (Math.abs((parseFloat(payload.doc.netto) || 0) - (parseFloat(dbDoc.netto) || 0)) > 0.02 ||
                    Math.abs((parseFloat(payload.doc.brutto) || 0) - (parseFloat(dbDoc.brutto) || 0)) > 0.02) {
                    throw new Error('Integritätsfehler (B-3): Die Werte im Rechnungsformular weichen vom gespeicherten Beleg ab. Bitte Änderungen zuerst speichern oder verwerfen.');
                }
            }

            const customer = (dbDoc.kundeId ? db.prepare('SELECT * FROM kunden WHERE id=?').get(dbDoc.kundeId) : null) || payload.customer || null;
            const fullState = await dbAPI.getFullState();
            const seller = { ...(fullState.einstellungen || {}), artikel: fullState.artikel || [] };

            const validation = EInvoiceEngine.validateForEN16931(dbDoc, customer, seller);
            if (!validation.isValid) {
                focusWin(win);
                return { success: false, validationErrors: validation.errors, error: validation.errors.join(' ') };
            }

            const xmlString = EInvoiceEngine.generateXRechnungXML(dbDoc, customer, seller);
            const fileNameHint = String(payload.fileNameHint || `XRechnung_${dbDoc.nr}.xml`).replace(/[\\/:*?"<>|]/g, '_');

            const { filePath } = await dialog.showSaveDialog(win, {
                title: 'XRechnung XML (EN 16931) speichern',
                defaultPath: path.join(getDocsDir(), fileNameHint),
                filters: [
                    { name: 'XRechnung XML (*.xml)', extensions: ['xml'] },
                    { name: 'Alle Dateien (*.*)', extensions: ['*'] }
                ]
            });

            if (!filePath) {
                focusWin(win);
                return { success: false, cancelled: true };
            }

            appendAuditLog({
                entityType: 'DOCUMENT',
                entityId: dbDoc.id,
                action: 'XRECHNUNG_EXPORT',
                details: {
                    nr: dbDoc.nr,
                    fileName: path.basename(filePath),
                    bytes: Buffer.byteLength(xmlString, 'utf-8'),
                    sha256: crypto.createHash('sha256').update(xmlString, 'utf-8').digest('hex')
                }
            });

            fs.writeFileSync(filePath, xmlString, 'utf-8');
            focusWin(win);
            return { success: true, path: filePath };
        } catch (err) {
            console.error('IPC invoice:exportXRechnungXml error:', err);
            if (win && !win.isDestroyed()) focusWin(win);
            return { success: false, error: err.message || String(err) };
        }
    }));

    // --- Modale Komponenten-Lader (views/modals/) ---
    ipcMain.handle('modals:loadPartial', wrapHandler(async (_event, modalName) => {
        const safeName = path.basename(modalName).replace(/\.html$/, '') + '.html';
        const filePath = path.join(__dirname, '../../views/modals', safeName);
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf8');
        }
        throw new Error(`Modal partial ${safeName} nicht gefunden`);
    }));

    ipcMain.handle('modals:loadAll', wrapHandler(async () => {
        const modalsDir = path.join(__dirname, '../../views/modals');
        const result = {};
        if (fs.existsSync(modalsDir)) {
            const files = fs.readdirSync(modalsDir);
            for (const file of files) {
                if (file.endsWith('.html') && !file.endsWith('-modals.html')) {
                    const id = file.replace('.html', '');
                    result[id] = fs.readFileSync(path.join(modalsDir, file), 'utf8');
                }
            }
        }
        return result;
    }));
}

module.exports = {
    register,
    registerIpc: register,
    initAutoBackupScheduler
};
