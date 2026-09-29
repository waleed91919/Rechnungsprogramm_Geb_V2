/**
 * main/ipc/ipc-gaeb.js
 * IPC-Handler für GAEB X83 Import, Persistenz, Laden und Löschen.
 */

const fs = require('fs');
const path = require('path');
const { dialog, BrowserWindow } = require('electron');
const { wrapHandler: defaultWrapHandler } = require('./ipc-util');
const gaebRepo = require('../../db/repositories/gaeb_repository');
const gaebTenderRepo = require('../../db/repositories/gaeb_tender_repo');
const gaebX84 = require('../../js/gaeb_x84');

function register(ipcMain, context = {}) {
    const db = context.db || (context.dbAPI && context.dbAPI.db) || require('../../db').db;
    const dbAPI = context.dbAPI || require('../../db').dbAPI;
    const wrapHandler = context.wrapHandler || defaultWrapHandler;
    const dialogModule = context.dialog || dialog;
    const browserWindowModule = context.BrowserWindow || BrowserWindow;

    // Speichert ein geparstes X83 Dokument atomar in SQLite
    ipcMain.handle('gaeb:save-import', wrapHandler(async (e, payload = {}) => {
        const { parsedData, options } = payload;
        if (dbAPI && typeof dbAPI.saveX83Import === 'function') {
            return dbAPI.saveX83Import(parsedData, options);
        }
        return gaebRepo.saveX83Import(db, parsedData, options);
    }));

    // Lädt einen vollständigen X83 Import (Kopfdaten, Baum, Items, BiReq, UPComponents)
    ipcMain.handle('gaeb:load-import', wrapHandler(async (e, importId) => {
        if (!importId) throw new Error('Import-ID fehlt.');
        if (dbAPI && typeof dbAPI.loadX83Import === 'function') {
            return dbAPI.loadX83Import(importId);
        }
        return gaebRepo.loadX83Import(db, importId);
    }));

    // Listet alle importierten Ausschreibungen mit aggregierten Statistiken
    ipcMain.handle('gaeb:list-imports', wrapHandler(async () => {
        if (dbAPI && typeof dbAPI.listX83Imports === 'function') {
            return dbAPI.listX83Imports();
        }
        return gaebRepo.listX83Imports(db);
    }));

    // Löscht einen Import mit Verknüpfungsschutz
    ipcMain.handle('gaeb:delete-import', wrapHandler(async (e, importId) => {
        if (!importId) throw new Error('Import-ID fehlt.');
        if (dbAPI && typeof dbAPI.deleteX83Import === 'function') {
            return dbAPI.deleteX83Import(importId);
        }
        return gaebRepo.deleteX83Import(db, importId);
    }));

    // Verknüpft einen GAEB-Import mit einem echten Angebot in dokumente
    ipcMain.handle('gaeb:link-angebot', wrapHandler(async (e, payload = {}) => {
        const { importId, angebotId, notes } = payload;
        if (dbAPI && typeof dbAPI.linkImportToAngebot === 'function') {
            return dbAPI.linkImportToAngebot(importId, angebotId, notes);
        }
        return gaebRepo.linkImportToAngebot(db, importId, angebotId, notes);
    }));

    // Gibt alle mit dem Import verknüpften Angebote zurück
    ipcMain.handle('gaeb:get-linked-angebote', wrapHandler(async (e, importId) => {
        if (!importId) throw new Error('Import-ID fehlt.');
        if (dbAPI && typeof dbAPI.getLinkedAngebote === 'function') {
            return dbAPI.getLinkedAngebote(importId);
        }
        return gaebRepo.getLinkedAngebote(db, importId);
    }));

    // Gibt gezielt den echten Original-Dateipuffer (BLOB) des Imports zurück
    ipcMain.handle('gaeb:get-original-buffer', wrapHandler(async (e, importId) => {
        if (!importId) throw new Error('Import-ID fehlt.');
        if (dbAPI && typeof dbAPI.getImportOriginalBuffer === 'function') {
            return dbAPI.getImportOriginalBuffer(importId);
        }
        return gaebRepo.getImportOriginalBuffer(db, importId);
    }));

    // --- Tender Bepreisung & Entwürfe ---

    // Erstellt einen neuen Tender-Entwurf
    ipcMain.handle('gaeb:create-tender-draft', wrapHandler(async (e, payload = {}, maybeOptions) => {
        const importId = (typeof payload === 'object' && payload !== null && payload.importId !== undefined)
            ? payload.importId
            : payload;
        const options = (typeof payload === 'object' && payload !== null && payload.options !== undefined)
            ? payload.options
            : (maybeOptions || (typeof payload === 'object' && payload !== null && payload.importId !== undefined ? payload : {}));

        if (!importId) throw new Error('Import-ID fehlt für Tender-Draft-Erstellung.');
        if (dbAPI && typeof dbAPI.createTenderDraft === 'function') {
            return dbAPI.createTenderDraft(importId, options);
        }
        return gaebTenderRepo.createTenderDraft(db, importId, options);
    }));

    // Speichert Preise und BiReq-Antworten eines Tender-Entwurfs
    ipcMain.handle('gaeb:save-tender-draft', wrapHandler(async (e, payload = {}, maybeData) => {
        const draftId = (typeof payload === 'object' && payload !== null && payload.draftId !== undefined)
            ? payload.draftId
            : payload;
        const draftData = (typeof payload === 'object' && payload !== null && payload.draftData !== undefined)
            ? payload.draftData
            : (maybeData || (typeof payload === 'object' && payload !== null ? payload : {}));

        if (!draftId) throw new Error('Draft-ID fehlt für Speicherung.');
        if (dbAPI && typeof dbAPI.saveTenderDraft === 'function') {
            return dbAPI.saveTenderDraft(draftId, draftData);
        }
        return gaebTenderRepo.saveTenderDraft(db, draftId, draftData);
    }));

    // Lädt einen Tender-Entwurf inkl. Items, Preisen und Baum
    ipcMain.handle('gaeb:load-tender-draft', wrapHandler(async (e, payload) => {
        const draftId = (typeof payload === 'object' && payload !== null && payload.draftId !== undefined)
            ? payload.draftId
            : payload;
        if (!draftId) throw new Error('Draft-ID fehlt für Laden.');
        if (dbAPI && typeof dbAPI.loadTenderDraft === 'function') {
            return dbAPI.loadTenderDraft(draftId);
        }
        return gaebTenderRepo.loadTenderDraft(db, draftId);
    }));

    // Listet alle Entwürfe eines Imports auf
    ipcMain.handle('gaeb:list-tender-drafts', wrapHandler(async (e, payload) => {
        const importId = (typeof payload === 'object' && payload !== null && payload.importId !== undefined)
            ? payload.importId
            : payload;
        if (!importId) throw new Error('Import-ID fehlt.');
        if (dbAPI && typeof dbAPI.listTenderDrafts === 'function') {
            return dbAPI.listTenderDrafts(importId);
        }
        return gaebTenderRepo.listTenderDrafts(db, importId);
    }));

    // Klont einen Entwurf zu einer neuen Version
    ipcMain.handle('gaeb:clone-tender-draft', wrapHandler(async (e, payload = {}, maybeOptions) => {
        const draftId = (typeof payload === 'object' && payload !== null && payload.draftId !== undefined)
            ? payload.draftId
            : payload;
        const options = (typeof payload === 'object' && payload !== null && payload.options !== undefined)
            ? payload.options
            : (maybeOptions || (typeof payload === 'object' && payload !== null ? payload : {}));

        if (!draftId) throw new Error('Draft-ID fehlt für Klonen.');
        if (dbAPI && typeof dbAPI.cloneTenderDraft === 'function') {
            return dbAPI.cloneTenderDraft(draftId, options);
        }
        return gaebTenderRepo.cloneTenderDraft(db, draftId, options);
    }));

    // Löscht einen Tender-Entwurf
    ipcMain.handle('gaeb:delete-tender-draft', wrapHandler(async (e, payload) => {
        const draftId = (typeof payload === 'object' && payload !== null && payload.draftId !== undefined)
            ? payload.draftId
            : payload;
        if (!draftId) throw new Error('Draft-ID fehlt für Löschung.');
        if (dbAPI && typeof dbAPI.deleteTenderDraft === 'function') {
            return dbAPI.deleteTenderDraft(draftId);
        }
        return gaebTenderRepo.deleteTenderDraft(db, draftId);
    }));

    // --- GAEB DA XML X84 Export (Phase 84: Angebotsabgabe) ---

    // Validiert einen Tender-Entwurf für den X84-Export
    ipcMain.handle('gaeb:validate-x84-export', wrapHandler(async (e, payload) => {
        const draftId = (typeof payload === 'object' && payload !== null && payload.draftId !== undefined)
            ? payload.draftId
            : payload;
        if (!draftId) throw new Error('Draft-ID fehlt für Validierung.');
        return gaebX84.validateDraftForExport(db, draftId);
    }));

    // Exportiert einen Tender-Entwurf als GAEB DA XML X84 Datei
    ipcMain.handle('gaeb:export-x84', wrapHandler(async (e, payload = {}, maybeOptions) => {
        const draftId = (typeof payload === 'object' && payload !== null && payload.draftId !== undefined)
            ? payload.draftId
            : payload;
        const options = (typeof payload === 'object' && payload !== null && payload.options !== undefined)
            ? payload.options
            : (maybeOptions || (typeof payload === 'object' && payload !== null && payload.draftId === undefined ? payload : {}));

        if (!draftId) throw new Error('Draft-ID fehlt für X84-Export.');

        const validation = gaebX84.validateDraftForExport(db, draftId, options);
        if (!validation.valid) {
            return {
                success: false,
                validationErrors: validation.errors,
                error: validation.errors.join('\n')
            };
        }

        // Standard-Dateiname vorbereiten: z.B. [Projektname]_v[Version].x84
        const draftName = (validation.draftSummary?.name || 'Ausschreibung').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
        const defaultFileName = `${draftName}_v${validation.draftSummary?.version || 1}.x84`;

        let defaultPath = defaultFileName;
        try {
            const { app } = require('electron');
            if (app && typeof app.getPath === 'function') {
                defaultPath = path.join(app.getPath('documents'), defaultFileName);
            }
        } catch (_e) {}

        let targetFilePath = null;
        if (options && options.isTestEnv && options.filePath) { targetFilePath = options.filePath; }

        // Wenn kein filePath vorgegeben wurde (Standardfall im Renderer), nativen Save-Dialog öffnen
        if (!targetFilePath) {
            const win = (e && e.sender && browserWindowModule && typeof browserWindowModule.fromWebContents === 'function')
                ? browserWindowModule.fromWebContents(e.sender)
                : (browserWindowModule && typeof browserWindowModule.getFocusedWindow === 'function' ? browserWindowModule.getFocusedWindow() : null);
            const { filePath, canceled } = await dialogModule.showSaveDialog(win, {
                title: 'GAEB DA XML X84 (Angebotsabgabe) speichern',
                defaultPath,
                filters: [
                    { name: 'GAEB DA XML Phase X84 (*.x84)', extensions: ['x84'] },
                    { name: 'Alle Dateien (*.*)', extensions: ['*'] }
                ]
            });

            if (canceled || !filePath) {
                return { canceled: true };
            }
            targetFilePath = filePath;
        }

        // Export durchführen (XML erzeugen)
        const exportResult = gaebX84.exportTenderDraftToX84(db, draftId, options);
        const xml = exportResult.xml;

        // XSD-Prüfung vor dem Schreiben
        const gaebVersion = exportResult.model.gaebVersion || '3.3';
        const schemaDir = path.join(__dirname, '..', '..', 'tests', 'schemas', `gaeb_da_xml_${gaebVersion}`);
        const schemaFile = gaebVersion === '3.2' ? 'GAEB_DA_XML_84_3.2_2013-10.xsd' : 'GAEB_DA_XML_84_3.3_2021-05.xsd';
        const schemaPath = path.join(schemaDir, schemaFile);

        try {
            if (fs.existsSync(schemaPath)) {
                const libxmljs = require('libxmljs');
                const xsdStr = fs.readFileSync(schemaPath, 'utf8');
                
                const cwd = process.cwd();
                try {
                    process.chdir(schemaDir);
                    const xsdDoc = libxmljs.parseXml(xsdStr, { baseUrl: 'file://' + schemaPath, nonet: true });
                    const xmlDoc = libxmljs.parseXml(xml);
                    const isValid = xmlDoc.validate(xsdDoc);
                    if (!isValid) {
                        const errs = xmlDoc.validationErrors.filter(e => !e.message.includes('No matching global declaration available')).map(e => `Zeile ${e.line}: ${e.message}`);
                        if (errs.length > 0) {
                            return {
                                success: false,
                                validationErrors: errs,
                                error: 'XSD-Validierung fehlgeschlagen:\n' + errs.join('\n')
                            };
                        }
                    }
                } finally {
                    process.chdir(cwd);
                }
            } else {
                return {
                    success: false,
                    validationErrors: ['Schema nicht gefunden'],
                    error: 'XSD-Schema nicht gefunden: ' + schemaPath
                };
            }
        } catch (e) {
            return {
                success: false,
                validationErrors: [e.message],
                error: 'Fehler bei der XSD-Prüfung: ' + e.message
            };
        }

        // Datei schreiben, nachdem sie validiert wurde
        fs.writeFileSync(targetFilePath, xml, 'utf-8');

        return {
            success: true,
            filePath: targetFilePath,
            stats: exportResult.stats,
            validation: exportResult.validation
        };
    }));
}


module.exports = {
    register
};
