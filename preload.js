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

    // --- Aufmaß & GAEB / DA11 ---
    getAufmassBlaetter: (projectId) => ipcRenderer.invoke('db:getAufmassBlaetter', projectId),
    saveAufmassBlatt: (blattData, zeilen) => ipcRenderer.invoke('db:saveAufmassBlatt', blattData, zeilen),
    deleteAufmassBlatt: (blattId) => ipcRenderer.invoke('db:deleteAufmassBlatt', blattId),
    mergeSchlussaufmass: (projectId) => ipcRenderer.invoke('db:mergeSchlussaufmass', projectId),
    exportDA11: (projectId, blattId) => ipcRenderer.invoke('aufmass:exportDA11', projectId, blattId),
    exportGAEBX31: (projectId, blattId) => ipcRenderer.invoke('aufmass:exportGAEBX31', projectId, blattId),
    importGAEBX31: (projectId, xmlContent) => ipcRenderer.invoke('aufmass:importGAEBX31', projectId, xmlContent),

    // --- EFB-Preisblätter 221 & 223 (VHB Bund) ---
    getEfbKalkulation: (projectId) => ipcRenderer.invoke('efb:getKalkulation', projectId),
    saveEfbProfil: (profilData) => ipcRenderer.invoke('efb:saveProfil', profilData),
    generateEfbPdf: (payload) => ipcRenderer.invoke('efb:generatePdf', payload),

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

    // --- Banking, OPOS & SEPA (F11) ---
    getBankKonten: () => ipcRenderer.invoke('db:getBankKonten'),
    saveBankKonto: (konto) => ipcRenderer.invoke('db:saveBankKonto', konto),
    deleteBankKonto: (id) => ipcRenderer.invoke('db:deleteBankKonto', id),
    importBankTransactions: (kontoId, transactions, meta) => ipcRenderer.invoke('db:importBankTransactions', kontoId, transactions, meta),
    getBankTransaktionen: (filter) => ipcRenderer.invoke('db:getBankTransaktionen', filter),
    runOposMatching: (kontoId) => ipcRenderer.invoke('db:runOposMatching', kontoId),
    applyPaymentMatching: (matches, options) => ipcRenderer.invoke('db:applyPaymentMatching', matches, options),
    unmatchTransaction: (zuordnungId, grund) => ipcRenderer.invoke('db:unmatchTransaction', zuordnungId, grund),
    getKundenMandate: (kundeId) => ipcRenderer.invoke('db:getKundenMandate', kundeId),
    saveSepaMandat: (mandat) => ipcRenderer.invoke('db:saveSepaMandat', mandat),
    deleteSepaMandat: (id) => ipcRenderer.invoke('db:deleteSepaMandat', id),
    getOffeneRechnungenFuerSepa: () => ipcRenderer.invoke('db:getOffeneRechnungenFuerSepa'),
    createSepaRun: (payload) => ipcRenderer.invoke('db:createSepaRun', payload),
    getSepaLaeufe: () => ipcRenderer.invoke('db:getSepaLaeufe'),
    getSepaLaufDetails: (laufId) => ipcRenderer.invoke('db:getSepaLaufDetails', laufId),
    exportSepaRunXml: (laufId) => ipcRenderer.invoke('db:exportSepaRunXml', laufId),
    storniereSepaLauf: (laufId, grund) => ipcRenderer.invoke('db:storniereSepaLauf', laufId, grund),
    markiereRuecklastschrift: (positionId, grund) => ipcRenderer.invoke('db:markiereRuecklastschrift', positionId, grund),

    saveEinstellung: (key, value) => ipcRenderer.invoke('db:saveEinstellung', key, value),

    // --- Phase 2: Zuschlagskalkulation & Mittellohn ---
    getZuschlagskalkulationStamm: (id) => ipcRenderer.invoke('kalkulation:getStammProfil', id),
    getAllZuschlagskalkulationStamm: () => ipcRenderer.invoke('kalkulation:getAllStammProfile'),
    saveZuschlagskalkulationStamm: (profileData) => ipcRenderer.invoke('kalkulation:saveStammProfil', profileData),
    deleteZuschlagskalkulationStamm: (id) => ipcRenderer.invoke('kalkulation:deleteStammProfil', id),
    getProjectKalkulation: (projektId) => ipcRenderer.invoke('kalkulation:getProjectKalkulation', projektId),
    saveProjectKalkulationProfil: (projektId, profileData) => ipcRenderer.invoke('kalkulation:saveProjectProfil', projektId, profileData),

    // --- Phase 2: DATANORM 4.0 / 5.0 Streaming Import ---
    startDatanormImport: (filePaths, options) => ipcRenderer.invoke('datanorm:startImport', { filePaths, options }),
    getDatanormKataloge: (filter) => ipcRenderer.invoke('datanorm:getKataloge', filter),
    deleteDatanormKatalog: (katalogId) => ipcRenderer.invoke('datanorm:deleteKatalog', katalogId),

    // --- Phase 2: Projektübergreifendes Mängelkataster & Fristenmanagement ---
    getMaengelKataster: (filter) => ipcRenderer.invoke('maengel:getKataster', filter),
    getMangelDetails: (mangelId) => ipcRenderer.invoke('maengel:getDetails', mangelId),
    saveMangel: (mangelData, fotos) => ipcRenderer.invoke('maengel:saveMangel', mangelData, fotos),
    updateMangelStatus: (mangelId, newStatus, kommentar, geaendertVon) => ipcRenderer.invoke('maengel:updateStatus', { mangelId, newStatus, kommentar, geaendertVon }),
    deleteMangel: (mangelId) => ipcRenderer.invoke('maengel:deleteMangel', mangelId),
    generateMahnschreiben: (mangelId, stufe, optionen) => ipcRenderer.invoke('maengel:generateMahnschreiben', { mangelId, stufe, optionen }),
    generateMangelProtokoll: (mangelId) => ipcRenderer.invoke('maengel:generateProtokoll', mangelId),
    executeMangelErsatzvornahme: (payload) => ipcRenderer.invoke('maengel:executeErsatzvornahme', payload),

    // --- Revisionssichere Auto-Backup Engine (GoBD & GFS) ---
    createBackup: (triggerType, bemerkung) => ipcRenderer.invoke('backup:create', triggerType, bemerkung),
    getBackupHistory: () => ipcRenderer.invoke('backup:getHistory'),
    verifyBackup: (backupId) => ipcRenderer.invoke('backup:verify', backupId),
    restoreBackup: (backupId, bemerkung) => ipcRenderer.invoke('backup:restore', backupId, bemerkung),
    backupDatabase: () => ipcRenderer.invoke('db:backup'),
    restoreDatabase: () => ipcRenderer.invoke('db:restore'),

    savePdf: (buffer, defaultName) => ipcRenderer.invoke('save:pdf', buffer, defaultName),
    exportZugferdPdf: (payload) => ipcRenderer.invoke('invoice:exportZugferdPdf', payload),
    printDocument: () => ipcRenderer.invoke('app:printDocument'),

    generateQrCode: (text) => ipcRenderer.invoke('qr:generate', text),

    // --- Phase 3: Mitarbeiter- & Arbeitszeit-Engine (BAG/ArbZG/BRTV) ---
    getMitarbeiter: (filter) => ipcRenderer.invoke('mitarbeiter:getAll', filter),
    saveMitarbeiter: (data) => ipcRenderer.invoke('mitarbeiter:save', data),
    deleteMitarbeiter: (id) => ipcRenderer.invoke('mitarbeiter:delete', id),
    getZeiteintraege: (filter) => ipcRenderer.invoke('zeiterfassung:getAll', filter),
    saveZeiteintrag: (data) => ipcRenderer.invoke('zeiterfassung:save', data),
    deleteZeiteintrag: (id) => ipcRenderer.invoke('zeiterfassung:delete', id),
    getZeiterfassungMonatsauswertung: (monat, jahr, mitarbeiterId) => ipcRenderer.invoke('zeiterfassung:getMonatsauswertung', { monat, jahr, mitarbeiterId }),

    // --- Phase 3: VOB/B Bedenken- & Behinderungsanzeigen ---
    getVobMeldungen: (filter) => ipcRenderer.invoke('vob:getAll', filter),
    saveVobMeldung: (data) => ipcRenderer.invoke('vob:save', data),
    deleteVobMeldung: (id) => ipcRenderer.invoke('vob:delete', id),
    generateVobPdf: (id) => ipcRenderer.invoke('vob:generatePdf', id),

    // --- Phase 3: Local-First P2P Sync Server & Konflikt-Schlichtung ---
    getSyncStatus: () => ipcRenderer.invoke('sync:getStatus'),
    startSyncServer: () => ipcRenderer.invoke('sync:startServer'),
    stopSyncServer: () => ipcRenderer.invoke('sync:stopServer'),
    getSyncPairingPayload: () => ipcRenderer.invoke('sync:getPairingPayload'),
    getSyncConflicts: () => ipcRenderer.invoke('sync:getConflicts'),
    resolveSyncConflict: (conflictId, strategy, mergedData) => ipcRenderer.invoke('sync:resolveConflict', { conflictId, strategy, mergedData }),

    // --- Phase 4: Großhandel & IDS Connect 2.5 ---
    getIdsKonten: (filter) => ipcRenderer.invoke('ids:getKonten', filter),
    getIdsKonto: (id) => ipcRenderer.invoke('ids:getKonto', id),
    saveIdsKonto: (data) => ipcRenderer.invoke('ids:saveKonto', data),
    deleteIdsKonto: (id) => ipcRenderer.invoke('ids:deleteKonto', id),
    launchIdsShop: (options) => ipcRenderer.invoke('ids:launchShop', options),
    getIdsWarenkoerbe: (filter) => ipcRenderer.invoke('ids:getWarenkoerbe', filter),
    getIdsWarenkorbDetails: (id) => ipcRenderer.invoke('ids:getWarenkorbDetails', id),
    deleteIdsWarenkorb: (id) => ipcRenderer.invoke('ids:deleteWarenkorb', id),
    importCartToDocument: (options) => ipcRenderer.invoke('ids:importCartToDocument', options),
    queryIdsPriceAvailability: (options) => ipcRenderer.invoke('ids:queryPriceAvailability', options),
    onIdsCartReceived: (callback) => {
        ipcRenderer.on('ids:cartReceived', (_event, data) => callback(data));
    },

    // --- Phase 4: SOKA-BAU Meldedaten & Beitrags-Engine ---
    getSokaBeitragssaetze: (stichtag) => ipcRenderer.invoke('soka:getBeitragssaetze', stichtag),
    saveSokaBeitragssatz: (data) => ipcRenderer.invoke('soka:saveBeitragssatz', data),
    getSokaMeldungen: (filter) => ipcRenderer.invoke('soka:getMeldungen', filter),
    getSokaMeldungDetails: (id) => ipcRenderer.invoke('soka:getMeldungDetails', id),
    calculateSokaMeldung: (options) => ipcRenderer.invoke('soka:calculateMeldung', options),
    saveSokaMeldung: (data) => ipcRenderer.invoke('soka:saveMeldung', data),
    deleteSokaMeldung: (id) => ipcRenderer.invoke('soka:deleteMeldung', id),
    exportSokaFiles: (options) => ipcRenderer.invoke('soka:exportFiles', options),

    // --- Phase 4: Nachunternehmer Compliance & § 14 AEntG ---
    getSubcontractorCompliance: (kundeId, pruefDatum) => ipcRenderer.invoke('subcontractor:getCompliance', { kundeId, pruefDatum }),
    auditAllSubcontractors: (options) => ipcRenderer.invoke('subcontractor:auditAll', options),
    saveSubcontractorNachweis: (data) => ipcRenderer.invoke('subcontractor:saveNachweis', data),
    deleteSubcontractorNachweis: (id) => ipcRenderer.invoke('subcontractor:deleteNachweis', id),
    getSubcontractorNachweise: (kundeId) => ipcRenderer.invoke('subcontractor:getNachweise', { kundeId }),

    focusWindow: () => ipcRenderer.invoke('app:focusWindow'),
    confirm: (options) => ipcRenderer.invoke('dialog:confirm', options),
    alert: (options) => ipcRenderer.invoke('dialog:alert', options)
});


