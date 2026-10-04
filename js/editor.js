// --- Rechnung & Angebot Editor Fassade ---
// Diese Datei dient als schlanke Fassade und enthält nur noch notwendige globale Variablen, Konstanten, Event-Listener
// sowie die zwingend benötigten window-Exports zur Abwärtskompatibilität, nachdem die Fachlogik
// nach js/editor/* ausgelagert wurde.

window.isSavingRechnung = false;

const EMAIL_STANDARD_TEXTE = {
    'RECHNUNG': "Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie unsere Rechnung {beleg_nr} vom {datum}.\nBitte begleichen Sie den Betrag von {betrag} bis zum {faelligkeit}.\n\nBei Rückfragen stehen wir Ihnen gerne zur Verfügung.\n\nMit freundlichen Grüßen",
    'ANGEBOT': "Sehr geehrte Damen und Herren,\n\nvielen Dank für Ihr Interesse. Anbei erhalten Sie unser Angebot {beleg_nr} vom {datum} mit einer Gesamtsumme von {betrag}.\n\nWir freuen uns auf Ihre Rückmeldung und stehen für Fragen jederzeit zur Verfügung.\n\nMit freundlichen Grüßen",
    'MAHNUNG': "Sehr geehrte Damen und Herren,\n\nbisher konnten wir zu unserer Rechnung {beleg_nr} keinen Zahlungseingang feststellen.\nBitte überweisen Sie den fälligen Betrag umgehend.\n\nMit freundlichen Grüßen",
    'EFB': "Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie die gewünschten EFB Formblätter für das Projekt.\n\nMit freundlichen Grüßen",
    'Nachtrag': "Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie unseren Nachtrag {beleg_nr} vom {datum}.\n\nMit freundlichen Grüßen"
};

// --- Window Exports ---
window.extractLaufendeNummer = extractLaufendeNummer;
window.syncAngebotFieldToRechnung = syncAngebotFieldToRechnung;
window.handleAngebot13bChange = handleAngebot13bChange;
window.handleAngebotMetaChange = handleAngebotMetaChange;
window.saveAngebotEntwurf = saveAngebotEntwurf;
window.previewAngebotPdf = previewAngebotPdf;
window.registerAngebotVersand = registerAngebotVersand;
window.createNextAngebotVersion = createNextAngebotVersion;
window.acceptAngebotFromModal = acceptAngebotFromModal;
window.rejectAngebotFromModal = rejectAngebotFromModal;
window.createProjektFromAngebotModal = createProjektFromAngebotModal;
window.navigateToAngebotProjekt = navigateToAngebotProjekt;
window.syncSicherheitseinbehalt = syncSicherheitseinbehalt;
window.openBelegEmailModal = openBelegEmailModal;

// --- Globale Event Listener ---
document.addEventListener('DOMContentLoaded', () => {
    const artSelect = document.getElementById('rechnung-art');
    const projektSelect = document.getElementById('rechnung-projekt');
    if (artSelect) artSelect.addEventListener('change', toggleAbschlagsKumulationUI);
    if (projektSelect) {
        projektSelect.addEventListener('change', () => {
            populateVerrechnungSelect();
            if (projektSelect.value && state.projekte) {
                const proj = state.projekte.find(p => parseInt(p.id) === parseInt(projektSelect.value));
                if (proj && proj.sicherheitseinbehalt_prozent > 0) {
                    const sichEl1 = document.getElementById('rechnung-sicherheitseinbehalt-prozent');
                    const sichEl2 = document.getElementById('rechnung-handwerk-sicherheitseinbehalt');
                    if ((!sichEl1 || !sichEl1.value) && (!sichEl2 || !sichEl2.value)) {
                        const val = proj.sicherheitseinbehalt_prozent.toString();
                        if (sichEl1) sichEl1.value = val;
                        if (sichEl2) sichEl2.value = val;
                        if (typeof calculateRechnungTotals === 'function') calculateRechnungTotals();
                    }
                }
            }
        });
    }
    const vobCheckbox = document.getElementById('rechnung-vob-vereinbart');
    if (vobCheckbox) {
        vobCheckbox.addEventListener('change', () => {
            if (vobCheckbox.checked) {
                const sichEl1 = document.getElementById('rechnung-sicherheitseinbehalt-prozent');
                const sichEl2 = document.getElementById('rechnung-handwerk-sicherheitseinbehalt');
                if ((!sichEl1 || !sichEl1.value) && (!sichEl2 || !sichEl2.value)) {
                    if (sichEl1) sichEl1.value = '5.0';
                    if (sichEl2) sichEl2.value = '5.0';
                    if (typeof calculateRechnungTotals === 'function') calculateRechnungTotals();
                }
            }
        });
    }
    if (typeof initRechnungDateHandlers === 'function') initRechnungDateHandlers();
    if (typeof applyUnternehmensartVisibility === 'function') applyUnternehmensartVisibility();
});
