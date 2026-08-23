const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    getFullState: () => ipcRenderer.invoke('db:getFullState'),

    saveArtikel: (artikel) => ipcRenderer.invoke('db:saveArtikel', artikel),
    deleteArtikel: (id) => ipcRenderer.invoke('db:deleteArtikel', id),

    saveKunde: (kunde) => ipcRenderer.invoke('db:saveKunde', kunde),
    deleteKunde: (id) => ipcRenderer.invoke('db:deleteKunde', id),
    bulkSaveKunden: (kunden) => ipcRenderer.invoke('db:bulkSaveKunden', kunden),

        saveDocument: (doc) => ipcRenderer.invoke('db:saveDocument', doc),
    bulkSaveDocuments: (docs) => ipcRenderer.invoke('db:bulkSaveDocuments', docs),
    deleteDocument: (id) => ipcRenderer.invoke('db:deleteDocument', id),
    updateDocumentStatus: (id, patch) => ipcRenderer.invoke('db:updateDocumentStatus', id, patch),
    unlockDocument: (id, grund) => ipcRenderer.invoke('db:unlockDocument', id, grund),
    storniereRechnung: (updatedOriginal, stornoDoc) => ipcRenderer.invoke('db:storniereRechnung', updatedOriginal, stornoDoc),
    verifyAuditChain: () => ipcRenderer.invoke('audit:verify'),

    saveAufmass: (aufmass) => ipcRenderer.invoke('db:saveAufmass', aufmass),
    deleteAufmass: (id) => ipcRenderer.invoke('db:deleteAufmass', id),
    getAufmassById: (id) => ipcRenderer.invoke('db:getAufmassById', id),
    getAufmassByPositionId: (positionId) => ipcRenderer.invoke('db:getAufmassByPositionId', positionId),
    saveAufmassForPosition: (positionId, aufmassData) => ipcRenderer.invoke('db:saveAufmassForPosition', positionId, aufmassData),
    getAufmasseByRechnungId: (rechnungId) => ipcRenderer.invoke('db:getAufmasseByRechnungId', rechnungId),
    getAufmasseByProjektId: (projektId) => ipcRenderer.invoke('db:getAufmasseByProjektId', projektId),

    // --- Aufmaß & DA11 ---
    getAufmassBlaetter: (projectId) => ipcRenderer.invoke('db:getAufmassBlaetter', projectId),
    saveAufmassBlatt: (blattData, zeilen) => ipcRenderer.invoke('db:saveAufmassBlatt', blattData, zeilen),
    deleteAufmassBlatt: (blattId) => ipcRenderer.invoke('db:deleteAufmassBlatt', blattId),
    mergeSchlussaufmass: (projectId) => ipcRenderer.invoke('db:mergeSchlussaufmass', projectId),
    exportDA11: (projectId, blattId) => ipcRenderer.invoke('aufmass:exportDA11', projectId, blattId),

    // --- Nachtragsverwaltung (VOB/B) ---
    getNachtraege: (projectId) => ipcRenderer.invoke('db:getNachtraege', projectId),
    saveNachtrag: (nachtragData, positionen) => ipcRenderer.invoke('db:saveNachtrag', nachtragData, positionen),
    updateNachtragStatus: (nachtragId, status) => ipcRenderer.invoke('db:updateNachtragStatus', nachtragId, status),
    deleteNachtrag: (nachtragId) => ipcRenderer.invoke('db:deleteNachtrag', nachtragId),

    // --- Bautagebuch & Abnahmeprotokoll ---
    getBautagebuch: (projectId) => ipcRenderer.invoke('db:getBautagebuch', projectId),
    saveBautagebuch: (data) => ipcRenderer.invoke('db:saveBautagebuch', data),
    deleteBautagebuch: (id) => ipcRenderer.invoke('db:deleteBautagebuch', id),
    getAbnahmeprotokolle: (projectId) => ipcRenderer.invoke('db:getAbnahmeprotokolle', projectId),
    saveAbnahmeprotokoll: (data) => ipcRenderer.invoke('db:saveAbnahmeprotokoll', data),

    // --- Eingangsrechnungen & Controlling ---
    getEingangsrechnungen: (projectId) => ipcRenderer.invoke('db:getEingangsrechnungen', projectId),
    saveEingangsrechnung: (data) => ipcRenderer.invoke('db:saveEingangsrechnung', data),
    deleteEingangsrechnung: (id) => ipcRenderer.invoke('db:deleteEingangsrechnung', id),
    getControllingStats: (projectId) => ipcRenderer.invoke('db:getControllingStats', projectId),

    saveProjekt: (projekt) => ipcRenderer.invoke('db:saveProjekt', projekt),

    saveEinstellung: (key, value) => ipcRenderer.invoke('db:saveEinstellung', key, value),

    backupDatabase: () => ipcRenderer.invoke('db:backup'),
    restoreDatabase: () => ipcRenderer.invoke('db:restore'),

    savePdf: (buffer, defaultName) => ipcRenderer.invoke('save:pdf', buffer, defaultName),
    exportZugferdPdf: (payload) => ipcRenderer.invoke('invoice:exportZugferdPdf', payload),
    printDocument: () => ipcRenderer.invoke('app:printDocument'),

    generateQrCode: (text) => ipcRenderer.invoke('qr:generate', text),

    focusWindow: () => ipcRenderer.invoke('app:focusWindow'),
    confirm: (options) => ipcRenderer.invoke('dialog:confirm', options),
    alert: (options) => ipcRenderer.invoke('dialog:alert', options)
});
