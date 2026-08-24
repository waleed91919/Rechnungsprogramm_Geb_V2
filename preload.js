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

    // --- Objektverwaltung (F1) ---
    getObjektBaum: () => ipcRenderer.invoke('db:getObjektBaum'),
    saveLiegenschaft: (data) => ipcRenderer.invoke('db:saveLiegenschaft', data),
    deleteLiegenschaft: (id) => ipcRenderer.invoke('db:deleteLiegenschaft', id),
    saveGebaeude: (data) => ipcRenderer.invoke('db:saveGebaeude', data),
    deleteGebaeude: (id) => ipcRenderer.invoke('db:deleteGebaeude', id),
    saveEtage: (data) => ipcRenderer.invoke('db:saveEtage', data),
    deleteEtage: (id) => ipcRenderer.invoke('db:deleteEtage', id),
    saveRaum: (data) => ipcRenderer.invoke('db:saveRaum', data),
    deleteRaum: (id) => ipcRenderer.invoke('db:deleteRaum', id),
    getObjektDetails: (objektTyp, objektId) => ipcRenderer.invoke('db:getObjektDetails', objektTyp, objektId),
    getObjektHistorie: (objektTyp, objektId, optionen = {}) => ipcRenderer.invoke('db:getObjektHistorie', objektTyp, objektId, optionen),

    // --- Dauerrechnungen (F2) ---
    getAbrechnungsplaene: (filter = {}) => ipcRenderer.invoke('db:getAbrechnungsplaene', filter),
    saveAbrechnungsplan: (plan, positionen = []) => ipcRenderer.invoke('db:saveAbrechnungsplan', plan, positionen),
    deleteAbrechnungsplan: (id) => ipcRenderer.invoke('db:deleteAbrechnungsplan', id),
    updateAbrechnungsplanStatus: (id, aktiv) => ipcRenderer.invoke('db:updateAbrechnungsplanStatus', id, aktiv),
    getPlanLaeufe: (planId) => ipcRenderer.invoke('db:getPlanLaeufe', planId),
    dauerrechnungenVorschau: (stichdatum = null) => ipcRenderer.invoke('db:dauerrechnungenVorschau', stichdatum),
    generiereFaelligeRechnungen: (optionen = {}) => ipcRenderer.invoke('db:generiereFaelligeRechnungen', optionen),
    generiereSammelrechnung: (payload) => ipcRenderer.invoke('db:generiereSammelrechnung', payload),
    storniereLauf: (laufId, grund) => ipcRenderer.invoke('db:storniereLauf', laufId, grund),
    dauerrechnungenAutoRun: () => ipcRenderer.invoke('db:autoRunDauerrechnungen'),

    // --- Putzplan & Reinigungs-LV (F3) ---
    getPutzplan: (objektTyp, objektId) => ipcRenderer.invoke('db:getPutzplan', objektTyp, objektId),
    saveLvBereich: (data) => ipcRenderer.invoke('db:saveLvBereich', data),
    deleteLvBereich: (id) => ipcRenderer.invoke('db:deleteLvBereich', id),
    saveLvPosition: (data, eintraege = []) => ipcRenderer.invoke('db:saveLvPosition', data, eintraege),
    deleteLvPosition: (id) => ipcRenderer.invoke('db:deleteLvPosition', id),
    getZuschlagsProfil: () => ipcRenderer.invoke('db:getZuschlagsProfil'),
    saveZuschlagsProfil: (profil) => ipcRenderer.invoke('db:saveZuschlagsProfil', profil),
    uebernehmeLvInAbrechnungsplan: (payload) => ipcRenderer.invoke('db:uebernehmeLvInAbrechnungsplan', payload),

    // --- E-Mail-Versand (F10) ---
    getSmtpKonten: () => ipcRenderer.invoke('smtp:getKonten'),
    saveSmtpKonto: (konto) => ipcRenderer.invoke('smtp:saveKonto', konto),
    deleteSmtpKonto: (id) => ipcRenderer.invoke('smtp:deleteKonto', id),
    testSmtpConnection: (konto) => ipcRenderer.invoke('smtp:testConnection', konto),
    sendBelegEmail: (payload) => ipcRenderer.invoke('smtp:sendBeleg', payload),
    wiederholeEmailVersand: (historieId, basePdfBuffer = null) => ipcRenderer.invoke('smtp:wiederholeVersand', historieId, basePdfBuffer),
    getVersandhistorie: (belegTyp = null, belegId = null) => ipcRenderer.invoke('smtp:getVersandhistorie', belegTyp, belegId),

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
