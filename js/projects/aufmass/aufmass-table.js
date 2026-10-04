(function(global) {
    global.global.splitPositionsData = global.global.splitPositionsData || [];
    global.global.currentAufmassSubTab = global.global.currentAufmassSubTab || 'info';
    global.global.activeSplitOz = global.global.activeSplitOz || null;
    global.global.activeSplitPosition = global.global.activeSplitPosition || null;
    global.global.currentSplitZeilen = global.global.currentSplitZeilen || [];
    global.global.currentAufmassTyp = global.global.currentAufmassTyp || null;
    global.global.currentAufmassVariante = global.global.currentAufmassVariante || null;
    global.global.currentWizardStep = global.global.currentWizardStep || 1;
    global.global.activeTargetFormulaInputId = global.global.activeTargetFormulaInputId || null;
    global.global.currentAufmassZeilen = global.global.currentAufmassZeilen || [];
global.switchAufmassSubTab = switchAufmassSubTab;
global.loadSplitViewPositions = loadSplitViewPositions;
global.renderSplitPositionsTable = renderSplitPositionsTable;
global.selectSplitPosition = selectSplitPosition;
global.addSplitAufmassZeile = addSplitAufmassZeile;
global.removeSplitAufmassZeile = removeSplitAufmassZeile;
global.toggleSplitZeileVorzeichen = toggleSplitZeileVorzeichen;
global.renderSplitDetailZeilenTable = renderSplitDetailZeilenTable;
global.saveSplitDetailAufmass = saveSplitDetailAufmass;
global.selectAufmassWizardTyp = selectAufmassWizardTyp;
global.selectAufmassWizardVariante = selectAufmassWizardVariante;
global.openAufmassWizardModal = openAufmassWizardModal;
global.closeAufmassWizardModal = closeAufmassWizardModal;
global.wizardNextStep = wizardNextStep;
global.wizardPrevStep = wizardPrevStep;
global.updateWizardBadges = updateWizardBadges;
global.finishAufmassWizard = finishAufmassWizard;
global.loadProjektAufmassBlaetter = loadProjektAufmassBlaetter;
global.openAufmassBlattModal = openAufmassBlattModal;
global.closeAufmassBlattModal = closeAufmassBlattModal;
global.addAufmassBlattZeile = addAufmassBlattZeile;
global.removeAufmassBlattZeile = removeAufmassBlattZeile;
global.toggleAufmassZeileVorzeichen = toggleAufmassZeileVorzeichen;
global.renderAufmassBlattZeilenTable = renderAufmassBlattZeilenTable;
global.updateAufmassZeile = updateAufmassZeile;
global.saveAufmassBlattData = saveAufmassBlattData;
global.deleteAufmassBlattAction = deleteAufmassBlattAction;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        switchAufmassSubTab,
        loadSplitViewPositions,
        renderSplitPositionsTable,
        selectSplitPosition,
        addSplitAufmassZeile,
        removeSplitAufmassZeile,
        toggleSplitZeileVorzeichen,
        renderSplitDetailZeilenTable,
        saveSplitDetailAufmass,
        selectAufmassWizardTyp,
        selectAufmassWizardVariante,
        openAufmassWizardModal,
        closeAufmassWizardModal,
        wizardNextStep,
        wizardPrevStep,
        updateWizardBadges,
        finishAufmassWizard,
        loadProjektAufmassBlaetter,
        openAufmassBlattModal,
        closeAufmassBlattModal,
        addAufmassBlattZeile,
        removeAufmassBlattZeile,
        toggleAufmassZeileVorzeichen,
        renderAufmassBlattZeilenTable,
        updateAufmassZeile,
        saveAufmassBlattData,
        deleteAufmassBlattAction
    };
}
})(typeof window !== 'undefined' ? window : this);
