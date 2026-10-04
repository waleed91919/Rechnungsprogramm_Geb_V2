(function() {
// Settings Logic

/**
 * Gesetzliche Aufbewahrungsfristen nach dem Bürokratieentlastungsgesetz IV (BEG IV, Stand 2025/2026):
 * - Rechnungs- und Buchungsbelege: 8 Jahre gem. § 14b Abs. 1 Satz 1 UStG, § 147 Abs. 3 Satz 1 AO n.F. (durch BEG IV seit 01.01.2025).
 * - Handelsbücher, Inventare, Jahresabschlüsse: weiterhin 10 Jahre (§ 147 Abs. 3 Satz 1 AO n.F., § 257 Abs. 4 HGB).
 * - Handels- und Geschäftsbriefe (inkl. Angebote ohne Auftrag): 6 Jahre (§ 147 Abs. 3 Satz 1 AO n.F., § 257 Abs. 4 HGB).
 * - Hinweistext für Privatkunden bei grundstücksbezogenen Leistungen: 2 Jahre (§ 14b Abs. 1 Satz 5 UStG).
 * - Zeiterfassungsdaten: 2 Jahre (§ 17 Abs. 2 MiLoG).
 * Fristbeginn: Mit dem Schluss des Kalenderjahres, in dem die Rechnung ausgestellt wurde (§ 147 Abs. 4 AO).
 * Ablaufhemmung: Bei offener Festsetzungsfrist oder laufender Betriebsprüfung (§ 147 Abs. 3 Satz 5 AO n.F.).
 */
var AUFBEWAHRUNGSFRISTEN_BEG_IV = (typeof window !== 'undefined' && window.AUFBEWAHRUNGSFRISTEN_BEG_IV) || {
    RECHNUNGSBELEGE_JAHRE: 8,
    BUCHUNGSBELEGE_JAHRE: 8,
    BUECHER_ABSCHLUESSE_JAHRE: 10,
    GESCHAEFTSBRIEFE_JAHRE: 6,
    PRIVATKUNDEN_GRUNDSTUECK_JAHRE: 2,
    ZEITERFASSUNG_MILOG_JAHRE: 2,
    hinweisPrivatkunde: 'Hinweis gem. § 14b Abs. 1 Satz 5 UStG: Als Privatperson sind Sie gesetzlich verpflichtet, diese Rechnung sowie den zugehörigen Zahlungsbeleg bei steuerpflichtigen Werkleistungen oder sonstigen Leistungen im Zusammenhang mit einem Grundstück mindestens zwei Jahre lang aufzubewahren (Fristbeginn: Schluss des Kalenderjahres der Ausstellung).',
    hinweisUnternehmer: 'Aufbewahrungsfristen nach BEG IV: Rechnungs- und Buchungsbelege: 8 Jahre gem. § 14b Abs. 1 Satz 1 UStG, § 147 Abs. 3 Satz 1 AO n.F. (durch BEG IV seit 01.01.2025), Bücher und Bilanzen 10 Jahre (§ 147 Abs. 3 Satz 1 AO n.F.), Geschäftsbriefe 6 Jahre (§ 147 Abs. 3 Satz 1 AO n.F.). Fristbeginn mit Schluss des Kalenderjahres; Hemmung bei offener Steuerfestsetzung (§ 147 Abs. 3 Satz 5 AO n.F.).'
};

if (typeof window !== 'undefined') {
    window.AUFBEWAHRUNGSFRISTEN_BEG_IV = AUFBEWAHRUNGSFRISTEN_BEG_IV;
}

function loadEinstellungenToForm() {
    document.getElementById('setting-firma').value = state.einstellungen.firmenname || '';
    document.getElementById('setting-adresse').value = state.einstellungen.adresse || '';
    document.getElementById('setting-bank').value = state.einstellungen.bankname || '';
    document.getElementById('setting-steuer').value = state.einstellungen.steuer || '';
    document.getElementById('setting-iban').value = state.einstellungen.iban || '';
    document.getElementById('setting-bic').value = state.einstellungen.bic || '';

    // Zahlungskonditionen
    document.getElementById('setting-zahlungsziel').value = state.einstellungen.zahlungsziel || '14';
    document.getElementById('setting-mahngebuehr-1').value = state.einstellungen.mahngebuehr1 || '0.00';
    document.getElementById('setting-mahngebuehr-2').value = state.einstellungen.mahngebuehr2 || '5.00';
    document.getElementById('setting-mahngebuehr-3').value = state.einstellungen.mahngebuehr3 || '10.00';

    // Allgemeine Einstellungen
    document.getElementById('setting-manuelle-nummern').checked = state.einstellungen.manuelleRechnungsnummer === 'true';
    if (document.getElementById('setting-rechnungsvorlage')) {
        document.getElementById('setting-rechnungsvorlage').value = state.einstellungen.rechnungsvorlage || 'klassisch';
    }
    if (document.getElementById('setting-eingabemodus')) {
        document.getElementById('setting-eingabemodus').value = state.einstellungen.eingabemodus || 'netto';
    }
    if (document.getElementById('setting-unternehmensart')) {
        document.getElementById('setting-unternehmensart').value = state.einstellungen.unternehmensart || 'handwerk';
    }

    // Auto-Backup Einstellungen
    if (document.getElementById('setting-backup-interval')) {
        document.getElementById('setting-backup-interval').value = state.einstellungen.backup_interval_hours || '4';
    }
    if (document.getElementById('setting-backup-auto-exit')) {
        document.getElementById('setting-backup-auto-exit').checked = state.einstellungen.backup_auto_on_exit !== 'false';
    }
    if (typeof loadBackupHistory === 'function') {
        loadBackupHistory();
    }

    if (document.getElementById('setting-email-text-rechnung')) {
        document.getElementById('setting-email-text-rechnung').value = state.einstellungen.email_text_rechnung || '';
        document.getElementById('setting-email-text-mahnung').value = state.einstellungen.email_text_mahnung || '';
        document.getElementById('setting-email-text-angebot').value = state.einstellungen.email_text_angebot || '';
        document.getElementById('setting-email-signatur').value = state.einstellungen.email_signatur || '';
        document.getElementById('setting-email-pdf-kopie').checked = state.einstellungen.email_pdf_kopie_speichern === 'true';
    }
    if (typeof renderSmtpKonten === 'function') {
        renderSmtpKonten();
    }

    // UI-Fokusmodus & Modulsichtbarkeit (NAV-1, B-13)
    const expCb = document.getElementById('setting-experimental-module');
    if (expCb) {
        const isExp = state.einstellungen.experimental_module === true ||
                      state.einstellungen.experimental_module === 'true' ||
                      state.einstellungen.experimental_module === 1 ||
                      state.einstellungen.experimental_module === '1';
        expCb.checked = isExp;
        updateFokusmodusStatusLabel(isExp);
    }

    const previewImg = document.getElementById('logo-preview-image');
    const btnRemove = document.getElementById('btn-remove-logo');
    if (state.einstellungen.logo) {
        previewImg.src = state.einstellungen.logo;
        previewImg.classList.remove('hidden');
        btnRemove.classList.remove('hidden');
    } else {
        previewImg.src = '';
        previewImg.classList.add('hidden');
        btnRemove.classList.add('hidden');
    }
}

async function saveEinstellungen() {
    state.einstellungen.firmenname = document.getElementById('setting-firma').value;
    state.einstellungen.adresse = document.getElementById('setting-adresse').value;
    state.einstellungen.bankname = document.getElementById('setting-bank').value;
    state.einstellungen.steuer = document.getElementById('setting-steuer').value;
    state.einstellungen.iban = document.getElementById('setting-iban').value;
    state.einstellungen.bic = document.getElementById('setting-bic').value;

    // Zahlungskonditionen
    state.einstellungen.zahlungsziel = document.getElementById('setting-zahlungsziel').value;
    state.einstellungen.mahngebuehr1 = document.getElementById('setting-mahngebuehr-1').value;
    state.einstellungen.mahngebuehr2 = document.getElementById('setting-mahngebuehr-2').value;
    state.einstellungen.mahngebuehr3 = document.getElementById('setting-mahngebuehr-3').value;

    // Allgemeine Einstellungen
    state.einstellungen.manuelleRechnungsnummer = document.getElementById('setting-manuelle-nummern').checked ? 'true' : 'false';
    if (document.getElementById('setting-rechnungsvorlage')) {
        state.einstellungen.rechnungsvorlage = document.getElementById('setting-rechnungsvorlage').value;
    }
    if (document.getElementById('setting-eingabemodus')) {
        state.einstellungen.eingabemodus = document.getElementById('setting-eingabemodus').value;
    }
    if (document.getElementById('setting-unternehmensart')) {
        state.einstellungen.unternehmensart = document.getElementById('setting-unternehmensart').value;
    }
    if (document.getElementById('setting-backup-interval')) {
        state.einstellungen.backup_interval_hours = document.getElementById('setting-backup-interval').value;
    }
    if (document.getElementById('setting-backup-auto-exit')) {
        state.einstellungen.backup_auto_on_exit = document.getElementById('setting-backup-auto-exit').checked ? 'true' : 'false';
    }
    if (document.getElementById('setting-email-text-rechnung')) {
        state.einstellungen.email_text_rechnung = document.getElementById('setting-email-text-rechnung').value;
        state.einstellungen.email_text_mahnung = document.getElementById('setting-email-text-mahnung').value;
        state.einstellungen.email_text_angebot = document.getElementById('setting-email-text-angebot').value;
        state.einstellungen.email_signatur = document.getElementById('setting-email-signatur').value;
        state.einstellungen.email_pdf_kopie_speichern = document.getElementById('setting-email-pdf-kopie').checked ? 'true' : 'false';
    }

    const expCb = document.getElementById('setting-experimental-module');
    if (expCb) {
        state.einstellungen.experimental_module = expCb.checked ? 'true' : 'false';
    }

    try {
        await window.api.saveEinstellung('firmenname', state.einstellungen.firmenname);
        await window.api.saveEinstellung('adresse', state.einstellungen.adresse);
        await window.api.saveEinstellung('bankname', state.einstellungen.bankname);
        await window.api.saveEinstellung('steuer', state.einstellungen.steuer);
        await window.api.saveEinstellung('iban', state.einstellungen.iban);
        await window.api.saveEinstellung('bic', state.einstellungen.bic);

        // Zahlungskonditionen speichern
        await window.api.saveEinstellung('zahlungsziel', state.einstellungen.zahlungsziel);
        await window.api.saveEinstellung('mahngebuehr1', state.einstellungen.mahngebuehr1);
        await window.api.saveEinstellung('mahngebuehr2', state.einstellungen.mahngebuehr2);
        await window.api.saveEinstellung('mahngebuehr3', state.einstellungen.mahngebuehr3);

        // Allgemeine Einstellungen speichern
        await window.api.saveEinstellung('manuelleRechnungsnummer', state.einstellungen.manuelleRechnungsnummer);
        if (state.einstellungen.rechnungsvorlage) {
            await window.api.saveEinstellung('rechnungsvorlage', state.einstellungen.rechnungsvorlage);
        }
        if (state.einstellungen.eingabemodus) {
            await window.api.saveEinstellung('eingabemodus', state.einstellungen.eingabemodus);
        }
        if (state.einstellungen.unternehmensart) {
            await window.api.saveEinstellung('unternehmensart', state.einstellungen.unternehmensart);
        }
        if (state.einstellungen.backup_interval_hours !== undefined) {
            await window.api.saveEinstellung('backup_interval_hours', state.einstellungen.backup_interval_hours);
        }
        if (state.einstellungen.backup_auto_on_exit !== undefined) {
            await window.api.saveEinstellung('backup_auto_on_exit', state.einstellungen.backup_auto_on_exit);
        }
        if (document.getElementById('setting-email-text-rechnung')) {
            await window.api.saveEinstellung('email_text_rechnung', state.einstellungen.email_text_rechnung);
            await window.api.saveEinstellung('email_text_mahnung', state.einstellungen.email_text_mahnung);
            await window.api.saveEinstellung('email_text_angebot', state.einstellungen.email_text_angebot);
            await window.api.saveEinstellung('email_signatur', state.einstellungen.email_signatur);
            await window.api.saveEinstellung('email_pdf_kopie_speichern', state.einstellungen.email_pdf_kopie_speichern);
        }
        if (expCb) {
            await window.api.saveEinstellung('experimental_module', state.einstellungen.experimental_module);
            if (typeof applyFocusMode === 'function') {
                applyFocusMode();
            }
        }
        if (state.einstellungen.logo) {
            await window.api.saveEinstellung('logo', state.einstellungen.logo);
        } else {
            await window.api.saveEinstellung('logo', '');
        }

        if (typeof applyUnternehmensartVisibility === 'function') {
            applyUnternehmensartVisibility();
        }

        showToast('Einstellungen erfolgreich gespeichert!', 'success');
    } catch (e) {
        console.error('Error saving settings:', e);
        showToast('Fehler beim Speichern der Einstellungen.', 'error');
    }
}

function toggleExperimentalModules(checked) {
    if (typeof state !== 'undefined') {
        if (!state.einstellungen) state.einstellungen = {};
        state.einstellungen.experimental_module = checked ? 'true' : 'false';
    }
    updateFokusmodusStatusLabel(checked);
    if (typeof applyFocusMode === 'function') {
        applyFocusMode();
    }
}

function updateFokusmodusStatusLabel(isExp) {
    const label = document.getElementById('fokusmodus-status-text');
    if (label) {
        if (isExp) {
            label.textContent = 'Alle Module sichtbar (Experten-Modus)';
            label.className = 'text-indigo-600 font-bold';
        } else {
            label.textContent = 'Fokusmodus aktiv (Kern-Views)';
            label.className = 'text-slate-600 font-medium';
        }
    }
}

function handleLogoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const base64Str = e.target.result;
        state.einstellungen.logo = base64Str;

        const previewImg = document.getElementById('logo-preview-image');
        previewImg.src = base64Str;
        previewImg.classList.remove('hidden');
        document.getElementById('btn-remove-logo').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

function removeLogo() {
    state.einstellungen.logo = '';
    document.getElementById('logo-upload').value = '';
    document.getElementById('logo-preview-image').classList.add('hidden');
    document.getElementById('btn-remove-logo').classList.add('hidden');
}


    if (typeof window !== 'undefined') window.AUFBEWAHRUNGSFRISTEN_BEG_IV = AUFBEWAHRUNGSFRISTEN_BEG_IV;
    if (typeof window !== 'undefined') window.loadEinstellungenToForm = loadEinstellungenToForm;
    if (typeof window !== 'undefined') window.saveEinstellungen = saveEinstellungen;
    if (typeof window !== 'undefined') window.toggleExperimentalModules = toggleExperimentalModules;
    if (typeof window !== 'undefined') window.updateFokusmodusStatusLabel = updateFokusmodusStatusLabel;
    if (typeof window !== 'undefined') window.handleLogoUpload = handleLogoUpload;
    if (typeof window !== 'undefined') window.removeLogo = removeLogo;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { AUFBEWAHRUNGSFRISTEN_BEG_IV, loadEinstellungenToForm, saveEinstellungen, toggleExperimentalModules, updateFokusmodusStatusLabel, handleLogoUpload, removeLogo };
    }
})();
