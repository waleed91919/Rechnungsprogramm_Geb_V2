const path = require('path');
const { BrowserWindow, dialog } = require('electron');
const { wrapHandler: defaultWrapHandler } = require('./ipc-util');

function register(ipcMain, context = {}) {
    const dbAPI = context.dbAPI || require('../../db').dbAPI;
    const wrapHandler = context.wrapHandler || defaultWrapHandler;

    // --- Phase 4: IDS Connect 2.5 & Open Masterdata ---
    ipcMain.handle('ids:getKonten', wrapHandler(async (event, filter) => {
        return dbAPI.getIdsKonten(filter);
    }));

    ipcMain.handle('ids:getKonto', wrapHandler(async (event, id) => {
        return dbAPI.getIdsKontoById(id);
    }));

    ipcMain.handle('ids:saveKonto', wrapHandler(async (event, data) => {
        return dbAPI.saveIdsKonto(data);
    }));

    ipcMain.handle('ids:deleteKonto', wrapHandler(async (event, id) => {
        return dbAPI.deleteIdsKonto(id);
    }));

    ipcMain.handle('ids:launchShop', wrapHandler(async (event, { kontoId, projektId, angebotId, action, orderReference, itemNumber }) => {
        const idsService = dbAPI.getIdsConnectService();
        const win = BrowserWindow.fromWebContents(event.sender);
        idsService.setOnCartReceived((cartData) => {
            if (win && !win.isDestroyed()) {
                win.webContents.send('ids:cartReceived', cartData);
            }
        });
        return await idsService.launchShop(kontoId, {
            projektId,
            angebotId,
            action,
            orderReference,
            itemNumber
        });
    }));

    ipcMain.handle('ids:getWarenkoerbe', wrapHandler(async (event, filter) => {
        return dbAPI.getIdsWarenkoerbe(filter);
    }));

    ipcMain.handle('ids:getWarenkorbDetails', wrapHandler(async (event, id) => {
        return dbAPI.getIdsWarenkorbDetails(id);
    }));

    ipcMain.handle('ids:deleteWarenkorb', wrapHandler(async (event, id) => {
        return dbAPI.deleteIdsWarenkorb(id);
    }));

    ipcMain.handle('ids:importCartToDocument', wrapHandler(async (event, { cartId, dokumentId, aufschlagProzent, replaceExisting }) => {
        return dbAPI.importCartToDocument(cartId, dokumentId, aufschlagProzent, replaceExisting);
    }));

    ipcMain.handle('ids:queryPriceAvailability', wrapHandler(async (event, { kontoId, itemNumbers }) => {
        const konto = dbAPI.getIdsKontoById(kontoId);
        if (!konto) throw new Error(`Großhandelskonto #${kontoId} nicht gefunden.`);

        // Echte Schnittstellenprüfung statt Fake-Preise (MOCK-1)
        if (!konto.price_service_url || !konto.api_key) {
            return {
                success: false,
                error: 'PRICE_UNAVAILABLE',
                message: 'Für dieses Großhandelskonto ist keine Webservice-Schnittstelle für Echtzeitpreise hinterlegt. Bitte Preise im Online-Shop prüfen.',
                items: (itemNumbers || []).map(num => ({
                    supplierItemNumber: num,
                    netPrice: null,
                    grossPrice: null,
                    availabilityStatus: 'PRICE_UNAVAILABLE',
                    deliveryDays: null
                }))
            };
        }

        const idsConnectService = dbAPI.getIdsConnectService ? dbAPI.getIdsConnectService() : null;
        if (idsConnectService && typeof idsConnectService.queryRealtimePrice === 'function') {
            return await idsConnectService.queryRealtimePrice(konto, itemNumbers);
        }
        return {
            success: false,
            error: 'PRICE_UNAVAILABLE',
            message: 'Echtzeitpreise-Dienst nicht verfügbar.'
        };
    }));

    // --- Phase 4: SOKA-BAU / ZVK Meldedaten-Engine ---
    ipcMain.handle('soka:getBeitragssaetze', wrapHandler(async (event, stichtag) => {
        return dbAPI.getSokaBeitragssaetze(stichtag);
    }));

    ipcMain.handle('soka:saveBeitragssatz', wrapHandler(async (event, data) => {
        return dbAPI.saveSokaBeitragssatz(data);
    }));

    ipcMain.handle('soka:getMeldungen', wrapHandler(async (event, filter) => {
        return dbAPI.getSokaMeldungen(filter);
    }));

    ipcMain.handle('soka:getMeldungDetails', wrapHandler(async (event, id) => {
        return dbAPI.getSokaMeldungDetails(id);
    }));

    ipcMain.handle('soka:calculateMeldung', wrapHandler(async (event, { meldeMonat, tarifgebiet }) => {
        return dbAPI.generateSokaMonatsmeldung(meldeMonat, tarifgebiet);
    }));

    ipcMain.handle('soka:saveMeldung', wrapHandler(async (event, data) => {
        return dbAPI.saveSokaMeldung(data);
    }));

    ipcMain.handle('soka:deleteMeldung', wrapHandler(async (event, id) => {
        return dbAPI.deleteSokaMeldung(id);
    }));

    // SEC-4: Sicherer SOKA-Bau Datei-Export mit Pfad-Validierung
    ipcMain.handle('soka:exportFiles', wrapHandler(async (event, { meldungId, exportDir }) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        let targetDir = exportDir;

        // Wenn kein Pfad angegeben wurde oder ungültig ist: Nativer Dialog
        if (!targetDir || typeof targetDir !== 'string') {
            const result = await dialog.showOpenDialog(win, {
                title: 'Zielordner für SOKA-BAU Export wählen',
                properties: ['openDirectory', 'createDirectory']
            });
            if (result.canceled || result.filePaths.length === 0) {
                return { canceled: true };
            }
            targetDir = result.filePaths[0];
        }

        // Path Traversal & Systemverzeichnis-Schutz
        const resolvedPath = path.resolve(targetDir);
        const normalizedPath = path.normalize(resolvedPath);
        if (normalizedPath !== resolvedPath || normalizedPath.includes('..')) {
            throw new Error('Sicherheitsverstoß (SEC-4): Unzulässiger Pfad mit Traversal-Sequenzen.');
        }

        // Verbot kritischer Systemverzeichnisse unter Windows/Linux
        const lower = normalizedPath.toLowerCase();
        if (lower.startsWith('c:\\windows') || lower.startsWith('c:\\program files') || lower.startsWith('/etc') || lower.startsWith('/bin')) {
            throw new Error('Sicherheitsverstoß: Export in Systemverzeichnisse ist untersagt.');
        }

        return dbAPI.exportSokaFiles(meldungId, normalizedPath);
    }));

    // --- Phase 4: Nachunternehmer Compliance & § 14 AEntG ---
    ipcMain.handle('subcontractor:getCompliance', wrapHandler(async (event, { kundeId, pruefDatum }) => {
        return dbAPI.getSubcontractorCompliance(kundeId, pruefDatum);
    }));

    ipcMain.handle('subcontractor:auditAll', wrapHandler(async (event, { pruefDatum } = {}) => {
        return dbAPI.auditAllSubcontractors(pruefDatum);
    }));

    ipcMain.handle('subcontractor:saveNachweis', wrapHandler(async (event, data) => {
        return dbAPI.saveSubcontractorNachweis(data);
    }));

    ipcMain.handle('subcontractor:deleteNachweis', wrapHandler(async (event, id) => {
        return dbAPI.deleteSubcontractorNachweis(id);
    }));

    ipcMain.handle('subcontractor:getNachweise', wrapHandler(async (event, { kundeId } = {}) => {
        return dbAPI.getSubcontractorNachweise(kundeId);
    }));
}

module.exports = {
    register,
    registerIpc: register
};
