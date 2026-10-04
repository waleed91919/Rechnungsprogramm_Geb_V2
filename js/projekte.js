// This file acts as a facade.
// Global variables
let currentAufmassSubTab = 'info';
let activeSplitOz = null;
let activeSplitPosition = null;
let currentSplitZeilen = [];
let splitPositionsData = [];
let currentWizardStep = 1;
let currentAufmassTyp = 'FREI';
let currentAufmassVariante = 'TEIL';
let activeTargetFormulaInputId = null;
let currentAufmassZeilen = [];
let currentNachtragPositionen = [];
let currentMaengelList = [];

// window variables
window.currentViewProjektId = null;

if (typeof module !== 'undefined' && module.exports) {
    const calcModule = require('./projects/project-calculations.js');
    const projektAufmass = require('./projects/project-aufmass.js');
    const projektAufmassPrint = require('./projects/project-aufmass-print.js');
    const projektBautagebuch = require('./projects/project-bautagebuch.js');
    const projektControlling = require('./projects/project-controlling.js');
    const projektDetail = require('./projects/project-detail.js');
    const projektDocumentFlow = require('./projects/project-document-flow.js');
    const projektForm = require('./projects/project-form.js');
    const projektList = require('./projects/project-list.js');
    const projektNachtrag = require('./projects/project-nachtrag.js');

    module.exports = {
        calculateProjektUmsatz: calcModule.calculateProjektUmsatz,
        saveBautagebuchEntry: projektBautagebuch.saveBautagebuchEntry,
        switchProjektTab: projektDetail.switchProjektTab,
        
        // Export everything else in case other tests or parts of code need them
        ...projektAufmass,
        ...projektAufmassPrint,
        ...projektBautagebuch,
        ...projektControlling,
        ...projektDetail,
        ...projektDocumentFlow,
        ...projektForm,
        ...projektList,
        ...projektNachtrag
    };
}
