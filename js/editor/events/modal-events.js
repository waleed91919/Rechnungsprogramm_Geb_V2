function setupRechnungModalUI() {
  state.isAngebotMode = false;
  state.isEditorReadOnly = false;
  document.getElementById('rechnung-modal-title').innerText = 'Neue Rechnung erstellen';
  document.getElementById('rechnungsdetails-title').innerText = 'Rechnungsdetails';
  document.getElementById('rechnung-nr-label').innerText = 'Rechnungsnummer';
  document.getElementById('rechnung-datum-label').innerText = 'Rechnungsdatum';
  const faelligLabel = document.getElementById('rechnung-faellig-label');
  if (faelligLabel) faelligLabel.innerText = 'Fälligkeitsdatum';
  const verBadge = document.getElementById('rechnung-modal-version');
  if (verBadge) verBadge.classList.add('hidden');
  const modalStatus = document.getElementById('rechnung-modal-status');
  if (modalStatus) {
    modalStatus.className = 'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200';
    modalStatus.textContent = 'Entwurf';
  }
  const bauvorhabenSection = document.getElementById('angebot-bauvorhaben-section') || document.getElementById('angebot-metadaten-section');
  if (bauvorhabenSection) bauvorhabenSection.classList.add('hidden');
  const handwerkSection = document.getElementById('rechnung-handwerk-section');
  if (handwerkSection) handwerkSection.classList.remove('hidden');
  const leftActions = document.getElementById('angebot-modal-actions-left');
  if (leftActions) leftActions.innerHTML = '';
  const rightActions = document.getElementById('rechnung-modal-actions-right');
  if (rightActions) {
    rightActions.innerHTML = `
            <button onclick="closeRechnungModal()" type="button" id="rechnung-modal-cancel"
                class="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm transition-all focus:ring-2 focus:ring-slate-200">Abbrechen</button>
            <button onclick="saveRechnung()" type="button" id="rechnung-modal-submit"
                class="px-6 py-2.5 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary-dark shadow-md hover:shadow-lg transition-all active:scale-[0.98] focus:ring-2 focus:ring-primary/50 flex items-center gap-2">
                <span class="material-symbols-outlined text-[18px]">save</span>
                <span id="rechnung-modal-submit-text">Rechnung Speichern</span>
            </button>
        `;
  }

  // Update Status Label and Options for Rechnung
  const statusLabel = document.getElementById('rechnungsstatus-label');
  if (statusLabel) statusLabel.innerText = 'Rechnungsstatus';
  const statusSelect = document.getElementById('rechnung-status');
  if (statusSelect) {
    statusSelect.innerHTML = '';
    const options = [{
      value: 'Entwurf',
      label: 'Entwurf'
    }, {
      value: 'Ausstehend',
      label: 'Ausstehend',
      selected: true
    }, {
      value: 'Bezahlt',
      label: 'Bezahlt'
    }, {
      value: 'Überfällig',
      label: 'Überfällig'
    }, {
      value: 'Storniert',
      label: 'Storniert'
    }];
    options.forEach(optData => {
      const opt = document.createElement('option');
      opt.value = optData.value;
      opt.textContent = optData.label;
      if (optData.selected) opt.selected = true;
      statusSelect.appendChild(opt);
    });
  }
  state.currentRechnungPositionen = [];
  state.currentRechnungVerrechnungen = [];
  document.getElementById('rechnung-form').reset();
  document.getElementById('rechnung-modal').classList.remove('hidden');

  // Clear hidden values or specific fields
  document.getElementById('rechnung-global-rabatt').value = '';
  setRabattType('%');
  document.getElementById('rechnung-anzahlung').value = '';
  const sichProzentInput = document.getElementById('rechnung-sicherheitseinbehalt-prozent');
  const sichHandwerkInput = document.getElementById('rechnung-handwerk-sicherheitseinbehalt');
  if (sichProzentInput) sichProzentInput.value = '';
  if (sichHandwerkInput) sichHandwerkInput.value = '';
  if (document.getElementById('rechnung-skonto-tage')) document.getElementById('rechnung-skonto-tage').value = '';
  if (document.getElementById('rechnung-skonto-prozent')) document.getElementById('rechnung-skonto-prozent').value = '';

  // Defaults: Deutsches System (DD.MM.YYYY & Arbeitstage-Zahlungsziel)
  const today = new Date();
  const todayIso = typeof formatDateISO === 'function' ? formatDateISO(today) : today.toISOString().split('T')[0];
  document.getElementById('rechnung-datum').value = todayIso;
  const zZiel = parseInt(state.einstellungen?.zahlungsziel, 10) || 14;
  const werktageInput = document.getElementById('rechnung-werktage');
  if (werktageInput) {
    werktageInput.value = zZiel;
    werktageInput.disabled = false;
  }
  const faelligIso = typeof calculateDueDateWorkingDays === 'function' ? calculateDueDateWorkingDays(todayIso, zZiel) : (() => {
    const d = new Date();
    d.setDate(d.getDate() + zZiel);
    return d.toISOString().split('T')[0];
  })();
  document.getElementById('rechnung-faellig').value = faelligIso;
  if (typeof initRechnungDateHandlers === 'function') initRechnungDateHandlers();
  if (typeof updateRechnungDatePreviews === 'function') updateRechnungDatePreviews();

  // Generate next NR (dynamically finding the highest to prevent 'undefined')
  const currentMaxRechnung = state.rechnungen.reduce((max, r) => Math.max(max, extractLaufendeNummer(r.nr)), 0);
  const nextRechnungIdNumber = currentMaxRechnung + 1;
  const nextNr = `INV-${today.getFullYear()}-${String(nextRechnungIdNumber).padStart(3, '0')}`;
  document.getElementById('rechnung-nr').value = nextNr;

  // Reset specific UI
  const detailsBox = document.getElementById('rechnung-kunde-details');
  detailsBox.innerHTML = '';
  const pNoKunde = document.createElement('p');
  pNoKunde.className = 'text-slate-400 italic text-center text-sm';
  pNoKunde.textContent = 'Kein Kunde ausgewählt';
  detailsBox.appendChild(pNoKunde);
  populateSelects();
  renderRechnungPositionen(); // Empty initially
}

window.setupRechnungModalUI = setupRechnungModalUI;

function setupAngebotModalUI() {
  state.isAngebotMode = true;
  state.isEditorReadOnly = false;
  document.getElementById('rechnung-modal-title').innerText = 'Neues Angebot erstellen';
  document.getElementById('rechnungsdetails-title').innerText = 'Angebotsdetails';
  document.getElementById('rechnung-nr-label').innerText = 'Angebotsnummer';
  document.getElementById('rechnung-datum-label').innerText = 'Angebotsdatum';
  const faelligLabel = document.getElementById('rechnung-faellig-label');
  if (faelligLabel) faelligLabel.innerText = 'Gültig bis';

  // Header Badges
  const verBadge = document.getElementById('rechnung-modal-version');
  if (verBadge) {
    verBadge.classList.remove('hidden');
    verBadge.textContent = 'v1';
  }
  const modalStatus = document.getElementById('rechnung-modal-status');
  if (modalStatus) {
    modalStatus.className = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200';
    modalStatus.innerHTML = '<span class="material-symbols-outlined text-[14px]">edit_document</span>ENTWURF';
  }

  // Handwerk Section im Angebotsmodus strikt verbergen
  const handwerkSection = document.getElementById('rechnung-handwerk-section');
  if (handwerkSection) handwerkSection.classList.add('hidden');

  // Bauvorhaben & Vertragsbedingungen Section
  const bauvorhabenSection = document.getElementById('angebot-bauvorhaben-section') || document.getElementById('angebot-metadaten-section');
  if (bauvorhabenSection) {
    bauvorhabenSection.classList.remove('hidden');
    const selAuftraggeber = document.getElementById('angebot-auftraggeber-typ');
    if (selAuftraggeber) {
      selAuftraggeber.disabled = false;
      selAuftraggeber.value = 'PRIVAT';
    }
    const selVertrag = document.getElementById('angebot-vertragsgrundlage');
    if (selVertrag) {
      selVertrag.disabled = false;
      selVertrag.value = 'BGB_WERKVERTRAG';
    }
    const alertBox = document.getElementById('bgb-650m-alert-box');
    if (alertBox) alertBox.classList.add('hidden');
    const freezeBadge = document.getElementById('angebot-freeze-badge');
    if (freezeBadge) freezeBadge.classList.add('hidden');
    const adresseEl = document.getElementById('angebot-baustellen-adresse');
    if (adresseEl) {
      adresseEl.disabled = false;
      adresseEl.value = '';
    }
    const ausfVonEl = document.getElementById('angebot-ausfuehrung-von');
    if (ausfVonEl) {
      ausfVonEl.disabled = false;
      ausfVonEl.value = '';
    }
    const ausfBisEl = document.getElementById('angebot-ausfuehrung-bis');
    if (ausfBisEl) {
      ausfBisEl.disabled = false;
      ausfBisEl.value = '';
    }
    const sichEl = document.getElementById('angebot-sicherheitseinbehalt');
    if (sichEl) {
      sichEl.disabled = false;
      sichEl.value = '';
    }
    const cb13b = document.getElementById('angebot-13b-ustg');
    if (cb13b) {
      cb13b.disabled = false;
      cb13b.checked = false;
      cb13b.onchange = handleAngebot13bChange;
    }
    handleAngebotMetaChange();
  }

  // Status select for offer
  const statusLabel = document.getElementById('rechnungsstatus-label');
  if (statusLabel) statusLabel.innerText = 'Angebotsstatus';
  const statusSelect = document.getElementById('rechnung-status');
  if (statusSelect) {
    statusSelect.innerHTML = '';
    const options = [{
      value: 'ENTWURF',
      label: 'ENTWURF',
      selected: true
    }, {
      value: 'VERSENDET',
      label: 'VERSENDET'
    }, {
      value: 'ANGENOMMEN',
      label: 'ANGENOMMEN'
    }, {
      value: 'ABGELEHNT',
      label: 'ABGELEHNT'
    }];
    options.forEach(optData => {
      const opt = document.createElement('option');
      opt.value = optData.value;
      opt.textContent = optData.label;
      if (optData.selected) opt.selected = true;
      statusSelect.appendChild(opt);
    });
  }
  state.currentRechnungPositionen = [];
  document.getElementById('rechnung-form').reset();
  document.getElementById('rechnung-id').value = '';
  const sichEl1Ang = document.getElementById('rechnung-sicherheitseinbehalt-prozent');
  const sichEl2Ang = document.getElementById('rechnung-handwerk-sicherheitseinbehalt');
  const sichEl3Ang = document.getElementById('angebot-sicherheitseinbehalt');
  if (sichEl1Ang) sichEl1Ang.value = '';
  if (sichEl2Ang) sichEl2Ang.value = '';
  if (sichEl3Ang) sichEl3Ang.value = '';
  document.getElementById('rechnung-modal').classList.remove('hidden');

  // Reset specific UI
  const detailsBox = document.getElementById('rechnung-kunde-details');
  detailsBox.innerHTML = '';
  const pNoKunde = document.createElement('p');
  pNoKunde.className = 'text-slate-400 italic text-center text-sm';
  pNoKunde.textContent = 'Kein Kunde ausgewählt';
  detailsBox.appendChild(pNoKunde);
  populateSelects();
  updateAngebotModalFooter('ENTWURF', null);
}

window.setupAngebotModalUI = setupAngebotModalUI;

function openRechnungModal() {
  setupRechnungModalUI();

  // Set default mode from settings
  setEingabeModus(state.einstellungen.eingabemodus || 'netto');

  // Handle Edit Mode / Read-Only Mode
  const form = document.getElementById('rechnung-form');
  const submitBtn = document.getElementById('rechnung-modal-submit');
  let existing = null;
  // Check if we passed an ID
  if (arguments.length > 0 && typeof arguments[0] === 'number') {
    existing = state.rechnungen.find(r => r.id === arguments[0]);
    if (existing && existing.isLocked) {
      applyRechnungReadOnlyMode(existing, form, submitBtn);
    } else if (existing) {
      applyRechnungEditMode(existing, form, submitBtn);
    }
    fuegeDauerrechnungsChipHinzu(existing);
  } else {
    applyRechnungNewMode(form, submitBtn);
  }
  applyManuelleNummernSetting(existing);
  applyUnternehmensartVisibility();
}

window.openRechnungModal = openRechnungModal;

function openAngebotModal() {
  setupAngebotModalUI();
  const form = document.getElementById('rechnung-form');
  const submitBtn = document.getElementById('rechnung-modal-submit');
  let existing = null;
  // Check if we passed an ID for editing
  if (arguments.length > 0 && arguments[0] !== undefined && arguments[0] !== null) {
    const targetId = parseInt(arguments[0], 10) || arguments[0];
    existing = (state.angebote || []).find(a => a.id == targetId);
    if (existing) {
      applyAngebotEditMode(existing, form, submitBtn);
    } else {
      applyAngebotNewMode();
    }
  } else {
    applyAngebotNewMode();
  }
  applyManuelleNummernSetting(existing);
  applyUnternehmensartVisibility();
}

window.openAngebotModal = openAngebotModal;

function closeRechnungModal() {
  document.getElementById('rechnung-modal').classList.add('hidden');
}

window.closeRechnungModal = closeRechnungModal;

function toggleAbschlagsKumulationUI() {
  const art = document.getElementById('rechnung-art');
  const section = document.getElementById('rechnung-kumulation-section');
  if (!art || !section) return;
  if (art.value === 'ABSCHLAG_KUMULIERT' || art.value === 'SCHLUSSRECHNUNG') {
    section.classList.remove('hidden');
    populateVerrechnungSelect();
  } else {
    section.classList.add('hidden');
    state.currentRechnungVerrechnungen = [];
  }
  renderVerrechnungen();
}

window.toggleAbschlagsKumulationUI = toggleAbschlagsKumulationUI;

