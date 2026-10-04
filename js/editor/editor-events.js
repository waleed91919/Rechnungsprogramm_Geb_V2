// --- Editor Events Fassade ---
// Diese Datei dient als schlanke Fassade und Einstiegspunkt, 
// die Fachlogik wurde nach js/editor/events/* ausgelagert.

if (typeof setupRechnungModalUI !== 'undefined') window.setupRechnungModalUI = setupRechnungModalUI;
if (typeof setupAngebotModalUI !== 'undefined') window.setupAngebotModalUI = setupAngebotModalUI;
if (typeof openRechnungModal !== 'undefined') window.openRechnungModal = openRechnungModal;
if (typeof openAngebotModal !== 'undefined') window.openAngebotModal = openAngebotModal;
if (typeof closeRechnungModal !== 'undefined') window.closeRechnungModal = closeRechnungModal;
if (typeof handleAngebot13bChange !== 'undefined') window.handleAngebot13bChange = handleAngebot13bChange;
if (typeof handleAngebotMetaChange !== 'undefined') window.handleAngebotMetaChange = handleAngebotMetaChange;
if (typeof handleKundeSelect !== 'undefined') window.handleKundeSelect = handleKundeSelect;
if (typeof handleRechtlicheCheckboxes !== 'undefined') window.handleRechtlicheCheckboxes = handleRechtlicheCheckboxes;
if (typeof initRechnungDateHandlers !== 'undefined') window.initRechnungDateHandlers = initRechnungDateHandlers;
if (typeof applyRechnungReadOnlyMode !== 'undefined') window.applyRechnungReadOnlyMode = applyRechnungReadOnlyMode;
if (typeof setzeRechnungObjektSelect !== 'undefined') window.setzeRechnungObjektSelect = setzeRechnungObjektSelect;
if (typeof fuegeDauerrechnungsChipHinzu !== 'undefined') window.fuegeDauerrechnungsChipHinzu = fuegeDauerrechnungsChipHinzu;
if (typeof applyRechnungEditMode !== 'undefined') window.applyRechnungEditMode = applyRechnungEditMode;
if (typeof applyRechnungNewMode !== 'undefined') window.applyRechnungNewMode = applyRechnungNewMode;
if (typeof applyManuelleNummernSetting !== 'undefined') window.applyManuelleNummernSetting = applyManuelleNummernSetting;
if (typeof setRechnungCustomerType !== 'undefined') window.setRechnungCustomerType = setRechnungCustomerType;
if (typeof setEingabeModus !== 'undefined') window.setEingabeModus = setEingabeModus;
if (typeof updateAngebotModalFooter !== 'undefined') window.updateAngebotModalFooter = updateAngebotModalFooter;
if (typeof applyAngebotEditMode !== 'undefined') window.applyAngebotEditMode = applyAngebotEditMode;
if (typeof applyAngebotNewMode !== 'undefined') window.applyAngebotNewMode = applyAngebotNewMode;
if (typeof toggleAbschlagsKumulationUI !== 'undefined') window.toggleAbschlagsKumulationUI = toggleAbschlagsKumulationUI;
if (typeof addVerrechnung !== 'undefined') window.addVerrechnung = addVerrechnung;
if (typeof removeVerrechnung !== 'undefined') window.removeVerrechnung = removeVerrechnung;
