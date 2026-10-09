function applyRechnungReadOnlyMode(existing, form, submitBtn) {
  // Apply Read-Only logic
  const titleEl = document.getElementById('rechnung-modal-title');
  titleEl.textContent = 'Rechnung Ansehen ';
  const span = document.createElement('span');
  span.className = 'bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded ml-2 align-middle';
  span.textContent = 'GESPERRT (GoBD)';
  titleEl.appendChild(span);
  if (existing.mahnungLevel > 0) {
    const dunningSpan = document.createElement('span');
    dunningSpan.className = 'bg-amber-100 text-amber-800 text-xs font-bold px-2 py-1 rounded ml-2 align-middle';
    dunningSpan.textContent = `${existing.mahnungLevel}. MAHNUNG (${new Date(existing.mahnungDatum).toLocaleDateString('de-DE')})`;
    titleEl.appendChild(dunningSpan);
  }

  // Disable all inputs
  const inputs = form.querySelectorAll('input, select, textarea');
  inputs.forEach(el => el.disabled = true);

  // Hide add row button
  const addRowBtn = form.querySelector('button[onclick="addRechnungPosition()"]');
  if (addRowBtn) addRowBtn.classList.add('hidden');
  submitBtn.classList.add('hidden');

  // GoBD: Expliziter Freigabe-Weg (Entsperren wird serverseitig audit-protokolliert)
  const unlockBtn = document.createElement('button');
  unlockBtn.type = 'button';
  unlockBtn.className = 'ml-auto inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-400 opacity-50 cursor-not-allowed';
  unlockBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">lock</span> Entsperren';
  unlockBtn.disabled = true;
  unlockBtn.title = 'GoBD-gesperrt — bitte Storno (InvoiceController 627-669) nutzen.';
  titleEl.parentElement.insertBefore(unlockBtn, titleEl.nextSibling);

  // Fill data
  document.getElementById('rechnung-kunde').value = existing.kundeId;
  document.getElementById('rechnung-nr').value = existing.nr;
  document.getElementById('rechnung-datum').value = typeof formatDateISO === 'function' ? formatDateISO(existing.datum) : existing.datum;
  document.getElementById('rechnung-faellig').value = typeof formatDateISO === 'function' ? formatDateISO(existing.faellig) : existing.faellig;
  const wTageReadOnly = document.getElementById('rechnung-werktage');
  if (wTageReadOnly) {
    wTageReadOnly.disabled = true;
    if (existing.datum && existing.faellig && typeof countWorkingDaysBetween === 'function') {
      wTageReadOnly.value = countWorkingDaysBetween(existing.datum, existing.faellig);
    }
  }
  if (typeof updateRechnungDatePreviews === 'function') updateRechnungDatePreviews();
  document.getElementById('rechnung-status').value = existing.status;
  if (document.getElementById('rechnung-skonto-tage')) document.getElementById('rechnung-skonto-tage').value = existing.skonto_tage || '';
  if (document.getElementById('rechnung-skonto-prozent')) document.getElementById('rechnung-skonto-prozent').value = existing.skonto_prozent || '';
  if (existing.eingabemodus) {
    setEingabeModus(existing.eingabemodus);
  }
  const rabattValRO = existing.globalRabattValue !== undefined && existing.globalRabattValue !== null && existing.globalRabattValue !== 0 ? existing.globalRabattValue : '';
  if (document.getElementById('rechnung-global-rabatt')) document.getElementById('rechnung-global-rabatt').value = rabattValRO;
  if (typeof setRabattType === 'function') setRabattType(existing.globalRabattType || '%');
  if (document.getElementById('rechnung-anzahlung')) document.getElementById('rechnung-anzahlung').value = existing.anzahlung || '';
  const sichValRO = existing.sicherheitseinbehalt_prozent !== undefined && existing.sicherheitseinbehalt_prozent !== null && existing.sicherheitseinbehalt_prozent !== 0 ? existing.sicherheitseinbehalt_prozent : existing.sicherheitseinbehalt && existing.netto ? Math.round(existing.sicherheitseinbehalt / existing.netto * 1000) / 10 : '';
  const sichEl1RO = document.getElementById('rechnung-sicherheitseinbehalt-prozent');
  const sichEl2RO = document.getElementById('rechnung-handwerk-sicherheitseinbehalt');
  if (sichEl1RO) sichEl1RO.value = sichValRO;
  if (sichEl2RO) sichEl2RO.value = sichValRO;
  document.getElementById('rechnung-art').value = existing.rechnungsart || 'REGULAER';
  document.getElementById('rechnung-leistungszeitraum-von').value = existing.leistungszeitraum_von || '';
  document.getElementById('rechnung-leistungszeitraum-bis').value = existing.leistungszeitraum_bis || '';
  document.getElementById('rechnung-baustellen-adresse').value = existing.baustellen_adresse || '';
  document.getElementById('rechnung-vob-vereinbart').checked = !!existing.vob_vereinbart;
  document.getElementById('rechnung-ist-privatkunde').checked = !!existing.ist_privatkunde;
  document.getElementById('rechnung-unterliegt-bauabzugsteuer').checked = !!existing.unterliegt_bauabzugsteuer;
  document.getElementById('rechnung-13b-ustg').checked = !!existing.unterliegt_13b;
  const detectedTypeReadOnly = existing.customer_type || (existing.ist_privatkunde ? 'B2C' : existing.leitweg_id ? 'B2G' : 'B2B');
  setRechnungCustomerType(detectedTypeReadOnly, {
    preserveMode: true
  });
  handleRechtlicheCheckboxes();
  document.getElementById('rechnung-vortext').value = existing.vortext || '';
  document.getElementById('rechnung-fusstext').value = existing.fusstext || '';
  state.currentRechnungPositionen = JSON.parse(JSON.stringify(existing.positionen || []));
  state.currentRechnungVerrechnungen = JSON.parse(JSON.stringify(existing.verrechnungen || []));
  handleKundeSelect({
    target: {
      value: existing.kundeId
    }
  });
  renderRechnungPositionen();

  // Toggle Abschlags-Kumulation UI
  toggleAbschlagsKumulationUI();
  renderVerrechnungen();

  // Hide delete buttons on rows
  const delBtns = document.getElementById('rechnung-positionen').querySelectorAll('button');
  delBtns.forEach(b => b.classList.add('hidden'));
}

window.applyRechnungReadOnlyMode = applyRechnungReadOnlyMode;

function setzeRechnungObjektSelect(existing) {
  const objektSel = document.getElementById('rechnung-objekt');
  if (!objektSel) return;
  if (existing && existing.objekt_typ && existing.objekt_id) {
    const wert = `${existing.objekt_typ}:${existing.objekt_id}`;
    objektSel.value = objektSel.querySelector(`option[value="${wert}"]`) ? wert : '';
  } else {
    objektSel.value = '';
  }
}

window.setzeRechnungObjektSelect = setzeRechnungObjektSelect;

function fuegeDauerrechnungsChipHinzu(existing) {
  if (!existing || typeof existing !== 'object') return;
  const istSammel = existing.rechnungsart === 'SAMMELRECHNUNG';
  const planName = !istSammel && existing.vortext && existing.vortext.includes('Abrechnungsplan') ? String(existing.vortext).split('"')[1] || null : null;
  if (!istSammel && !planName) return;
  const titleEl = document.getElementById('rechnung-modal-title');
  if (!titleEl) return;
  const chip = document.createElement('span');
  chip.className = 'bg-purple-100 text-purple-800 text-xs font-bold px-2 py-1 rounded ml-2 align-middle inline-flex items-center gap-1';
  chip.innerHTML = `<span class="material-symbols-outlined text-[14px]">event_repeat</span>${istSammel ? 'SAMMELRECHNUNG' : `Aus Abrechnungsplan "${planName}"`}`;
  titleEl.appendChild(chip);
}

window.fuegeDauerrechnungsChipHinzu = fuegeDauerrechnungsChipHinzu;

function applyRechnungEditMode(existing, form, submitBtn) {
  document.getElementById('rechnung-modal-title').innerText = 'Rechnung Bearbeiten';

  // Un-disable inputs just in case
  const inputs = form.querySelectorAll('input, select, textarea');
  inputs.forEach(el => el.disabled = false);
  submitBtn.classList.remove('hidden');
  const addRowBtn = form.querySelector('button[onclick="addRechnungPosition()"]');
  if (addRowBtn) addRowBtn.classList.remove('hidden');
  document.getElementById('rechnung-id').value = existing.id;
  document.getElementById('rechnung-kunde').value = existing.kundeId;
  document.getElementById('rechnung-projekt').value = existing.projektId || '';
  setzeRechnungObjektSelect(existing);
  document.getElementById('rechnung-nr').value = existing.nr;
  document.getElementById('rechnung-datum').value = typeof formatDateISO === 'function' ? formatDateISO(existing.datum) : existing.datum;
  document.getElementById('rechnung-faellig').value = typeof formatDateISO === 'function' ? formatDateISO(existing.faellig) : existing.faellig;
  const wTageEdit = document.getElementById('rechnung-werktage');
  if (wTageEdit) {
    wTageEdit.disabled = false;
    if (existing.datum && existing.faellig && typeof countWorkingDaysBetween === 'function') {
      wTageEdit.value = countWorkingDaysBetween(existing.datum, existing.faellig);
    }
  }
  if (typeof initRechnungDateHandlers === 'function') initRechnungDateHandlers();
  if (typeof updateRechnungDatePreviews === 'function') updateRechnungDatePreviews();
  document.getElementById('rechnung-status').value = existing.status;
  if (document.getElementById('rechnung-skonto-tage')) document.getElementById('rechnung-skonto-tage').value = existing.skonto_tage || '';
  if (document.getElementById('rechnung-skonto-prozent')) document.getElementById('rechnung-skonto-prozent').value = existing.skonto_prozent || '';
  document.getElementById('rechnung-art').value = existing.rechnungsart || 'REGULAER';
  document.getElementById('rechnung-leistungszeitraum-von').value = existing.leistungszeitraum_von || '';
  document.getElementById('rechnung-leistungszeitraum-bis').value = existing.leistungszeitraum_bis || '';
  document.getElementById('rechnung-baustellen-adresse').value = existing.baustellen_adresse || '';
  document.getElementById('rechnung-vob-vereinbart').checked = !!existing.vob_vereinbart;
  document.getElementById('rechnung-ist-privatkunde').checked = !!existing.ist_privatkunde;
  document.getElementById('rechnung-unterliegt-bauabzugsteuer').checked = !!existing.unterliegt_bauabzugsteuer;
  document.getElementById('rechnung-13b-ustg').checked = !!existing.unterliegt_13b;
  const detectedTypeEdit = existing.customer_type || (existing.ist_privatkunde ? 'B2C' : existing.leitweg_id ? 'B2G' : 'B2B');
  setRechnungCustomerType(detectedTypeEdit, {
    preserveMode: true
  });
  handleRechtlicheCheckboxes();
  document.getElementById('rechnung-vortext').value = existing.vortext || '';
  document.getElementById('rechnung-fusstext').value = existing.fusstext || '';
  if (existing.eingabemodus) {
    setEingabeModus(existing.eingabemodus);
  }
  document.getElementById('rechnung-global-rabatt').value = existing.globalRabattValue !== undefined && existing.globalRabattValue !== null && existing.globalRabattValue !== 0 ? existing.globalRabattValue : '';
  setRabattType(existing.globalRabattType || '%');
  document.getElementById('rechnung-anzahlung').value = existing.anzahlung || '';
  const sichValEdit = existing.sicherheitseinbehalt_prozent !== undefined && existing.sicherheitseinbehalt_prozent !== null && existing.sicherheitseinbehalt_prozent !== 0 ? existing.sicherheitseinbehalt_prozent : existing.sicherheitseinbehalt && existing.netto ? Math.round(existing.sicherheitseinbehalt / existing.netto * 1000) / 10 : '';
  const sichEl1Edit = document.getElementById('rechnung-sicherheitseinbehalt-prozent');
  const sichEl2Edit = document.getElementById('rechnung-handwerk-sicherheitseinbehalt');
  if (sichEl1Edit) sichEl1Edit.value = sichValEdit;
  if (sichEl2Edit) sichEl2Edit.value = sichValEdit;
  state.currentRechnungPositionen = JSON.parse(JSON.stringify(existing.positionen || []));
  state.currentRechnungVerrechnungen = JSON.parse(JSON.stringify(existing.verrechnungen || []));
  handleKundeSelect({
    target: {
      value: existing.kundeId
    }
  });
  renderRechnungPositionen();

  // Toggle Abschlags-Kumulation UI
  toggleAbschlagsKumulationUI();
  renderVerrechnungen();

  // Show delete buttons
  const delBtns = document.getElementById('rechnung-positionen').querySelectorAll('button');
  delBtns.forEach(b => b.classList.remove('hidden'));
}

window.applyRechnungEditMode = applyRechnungEditMode;

function applyRechnungNewMode(form, submitBtn) {
  // New Invoice Mode - Ensure form is unlocked
  document.getElementById('rechnung-id').value = '';
  document.getElementById('rechnung-art').value = 'REGULAER';
  document.getElementById('rechnung-leistungszeitraum-von').value = '';
  document.getElementById('rechnung-leistungszeitraum-bis').value = '';
  document.getElementById('rechnung-baustellen-adresse').value = '';
  document.getElementById('rechnung-vob-vereinbart').checked = false;
  document.getElementById('rechnung-ist-privatkunde').checked = false;
  document.getElementById('rechnung-unterliegt-bauabzugsteuer').checked = false;
  document.getElementById('rechnung-13b-ustg').checked = false;
  setRechnungCustomerType('B2B');
  handleRechtlicheCheckboxes();
  document.getElementById('rechnung-vortext').value = '';
  document.getElementById('rechnung-fusstext').value = '';
  const sichEl1New = document.getElementById('rechnung-sicherheitseinbehalt-prozent');
  const sichEl2New = document.getElementById('rechnung-handwerk-sicherheitseinbehalt');
  if (sichEl1New) sichEl1New.value = '';
  if (sichEl2New) sichEl2New.value = '';
  const inputs = form.querySelectorAll('input, select, textarea');
  inputs.forEach(el => el.disabled = false);
  submitBtn.classList.remove('hidden');
  const addRowBtn = form.querySelector('button[onclick="addRechnungPosition()"]');
  if (addRowBtn) addRowBtn.classList.remove('hidden');
  toggleAbschlagsKumulationUI();
  renderVerrechnungen();
}

window.applyRechnungNewMode = applyRechnungNewMode;

function applyManuelleNummernSetting(existing) {
  const nrInput = document.getElementById('rechnung-nr');
  const isLocked = existing && existing.isLocked;
  if (!isLocked && state.einstellungen.manuelleRechnungsnummer === 'true') {
    nrInput.removeAttribute('readonly');
    nrInput.classList.remove('cursor-not-allowed', 'bg-slate-100');
    nrInput.classList.add('bg-white', 'focus:ring-2', 'focus:ring-primary/20', 'focus:border-primary');
  } else {
    nrInput.setAttribute('readonly', 'true');
    nrInput.classList.add('cursor-not-allowed', 'bg-slate-100');
    nrInput.classList.remove('bg-white', 'focus:ring-2', 'focus:ring-primary/20', 'focus:border-primary');
  }
}

window.applyManuelleNummernSetting = applyManuelleNummernSetting;

function setRechnungCustomerType(type, options = {}) {
  const validTypes = ['B2C', 'B2B', 'B2G'];
  const selectedType = validTypes.includes(type) ? type : 'B2B';
  const hiddenInput = document.getElementById('rechnung-customer-type');
  if (hiddenInput) hiddenInput.value = selectedType;
  const btnB2C = document.getElementById('btn-type-b2c');
  const btnB2B = document.getElementById('btn-type-b2b');
  const btnB2G = document.getElementById('btn-type-b2g');
  const typeBadge = document.getElementById('rechnung-type-badge');
  const modeHint = document.getElementById('rechnung-b2g-netto-hint');
  const b2gSection = document.getElementById('rechnung-b2g-section');
  const b2gTitle = document.getElementById('b2g-section-title');
  const b2gBadge = document.getElementById('b2g-section-badge');
  const leitwegReq = document.getElementById('rechnung-leitweg-required');
  const btnModeNetto = document.getElementById('btn-mode-netto');
  const btnModeBrutto = document.getElementById('btn-mode-brutto');
  const activeClass = 'py-1.5 px-2 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1 shadow-sm bg-primary text-white';
  const inactiveClass = 'py-1.5 px-2 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1 text-slate-600 hover:text-slate-800 hover:bg-slate-200/60';
  if (btnB2C) btnB2C.className = selectedType === 'B2C' ? activeClass : inactiveClass;
  if (btnB2B) btnB2B.className = selectedType === 'B2B' ? activeClass : inactiveClass;
  if (btnB2G) btnB2G.className = selectedType === 'B2G' ? activeClass : inactiveClass;
  const pKunde = document.getElementById('rechnung-ist-privatkunde');
  if (selectedType === 'B2G') {
    if (typeBadge) {
      typeBadge.textContent = 'B2G (EN 16931)';
      typeBadge.className = 'text-[11px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800';
    }
    if (modeHint) {
      modeHint.textContent = '* B2G erfordert Netto (EN 16931)';
      modeHint.className = 'text-[11px] text-blue-700 font-semibold italic block';
    }
    if (leitwegReq) leitwegReq.classList.remove('hidden');
    if (b2gTitle) b2gTitle.textContent = 'B2G E-Rechnung (Öffentlicher Auftraggeber / EN 16931)';
    if (b2gBadge) {
      b2gBadge.textContent = 'XRechnung / ZUGFeRD (Pflicht)';
      b2gBadge.className = 'text-xs bg-blue-200 text-blue-900 font-bold px-2 py-0.5 rounded';
    }

    // B2G requires Netto by EN 16931: force Netto and disable Brutto
    if (btnModeNetto) {
      btnModeNetto.disabled = false;
      btnModeNetto.title = 'B2G: Netto-Preise gem. EN 16931 aktiv';
    }
    if (btnModeBrutto) {
      btnModeBrutto.disabled = true;
      btnModeBrutto.title = 'B2G erfordert zwingend Netto-Einzelpreise gem. EN 16931.';
    }
    setEingabeModus('netto', {
      force: true
    });
    if (pKunde) {
      pKunde.checked = false;
    }
    if (b2gSection) {
      b2gSection.classList.remove('hidden');
      b2gSection.classList.add('ring-2', 'ring-blue-400/40', 'bg-blue-50/80');
    }
    if (typeof initRechnungLeitwegLiveCheck === 'function') initRechnungLeitwegLiveCheck();
    if (typeof validateRechnungLeitwegField === 'function') validateRechnungLeitwegField();
  } else if (selectedType === 'B2B') {
    if (typeBadge) {
      typeBadge.textContent = 'B2B (Gewerbe)';
      typeBadge.className = 'text-[11px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700';
    }
    if (modeHint) modeHint.className = 'text-[11px] text-slate-500 font-medium italic hidden';
    if (leitwegReq) leitwegReq.classList.add('hidden');
    if (b2gTitle) b2gTitle.textContent = 'E-Rechnung (B2B ZUGFeRD / XRechnung nach EN 16931)';
    if (b2gBadge) {
      b2gBadge.textContent = 'ZUGFeRD 2.0.1+ / XRechnung';
      b2gBadge.className = 'text-xs bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded';
    }
    if (btnModeNetto) {
      btnModeNetto.disabled = false;
      btnModeNetto.title = 'Netto-Eingabe (zzgl. MwSt.)';
    }
    if (btnModeBrutto) {
      btnModeBrutto.disabled = false;
      btnModeBrutto.title = 'Brutto-Eingabe (inkl. MwSt.)';
    }
    if (!options.preserveMode) {
      setEingabeModus(state.einstellungen.eingabemodus || 'netto', {
        force: true
      });
    } else {
      const curMode = document.getElementById('rechnung-eingabemodus')?.value || 'netto';
      setEingabeModus(curMode, {
        force: true
      });
    }
    if (pKunde) {
      pKunde.checked = false;
    }
    applyUnternehmensartVisibility();
    if (b2gSection) {
      b2gSection.classList.add('hidden');
      b2gSection.classList.remove('ring-2', 'ring-blue-400/40');
    }
  } else {
    // B2C: Nur Brutto bleibt!
    if (typeBadge) {
      typeBadge.textContent = 'B2C (Privat)';
      typeBadge.className = 'text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800';
    }
    if (modeHint) {
      modeHint.textContent = '* B2C erfordert Brutto (PAngV)';
      modeHint.className = 'text-[11px] text-emerald-700 font-semibold italic block';
    }
    if (leitwegReq) leitwegReq.classList.add('hidden');

    // B2C requires Brutto by PAngV: force Brutto and disable Netto
    if (btnModeBrutto) {
      btnModeBrutto.disabled = false;
      btnModeBrutto.title = 'B2C: Brutto-Preise gem. PAngV aktiv';
    }
    if (btnModeNetto) {
      btnModeNetto.disabled = true;
      btnModeNetto.title = 'Für Privatkunden (B2C) sind Endpreise (Brutto) gemäß Preisangabenverordnung (PAngV) vorgeschrieben.';
    }
    setEingabeModus('brutto', {
      force: true
    });
    if (pKunde && !options.preserveMode) {
      pKunde.checked = true;
    }
    if (b2gSection) {
      b2gSection.classList.add('hidden');
      b2gSection.classList.remove('ring-2', 'ring-blue-400/40');
    }
  }
  handleRechtlicheCheckboxes();
}

window.setRechnungCustomerType = setRechnungCustomerType;

function setEingabeModus(mode, options = {}) {
  const currentCustomerType = document.getElementById('rechnung-customer-type')?.value || 'B2B';

  // Guard: B2C is strictly Brutto (PAngV), B2G is strictly Netto (EN 16931) unless force option passed
  if (!options.force) {
    if (currentCustomerType === 'B2C' && mode === 'netto') {
      showToast('Für Privatkunden (B2C) sind Endpreise (Brutto) gem. Preisangabenverordnung (PAngV) vorgeschrieben.', 'info');
      return;
    }
    if (currentCustomerType === 'B2G' && mode === 'brutto') {
      showToast('Für Rechnungen an Behörden (B2G) sind Netto-Preise gem. EU-Norm EN 16931 vorgeschrieben.', 'info');
      return;
    }
  }
  document.getElementById('rechnung-eingabemodus').value = mode;
  const btnNetto = document.getElementById('btn-mode-netto');
  const btnBrutto = document.getElementById('btn-mode-brutto');
  if (!btnNetto || !btnBrutto) return;
  if (mode === 'netto') {
    btnNetto.className = 'flex-1 py-1.5 text-xs font-bold rounded-md transition-all shadow-sm bg-primary text-white';
    btnBrutto.className = 'flex-1 py-1.5 text-xs font-medium rounded-md transition-all text-slate-600 hover:text-slate-800' + (btnBrutto.disabled ? ' opacity-40 cursor-not-allowed' : '');
  } else {
    btnBrutto.className = 'flex-1 py-1.5 text-xs font-bold rounded-md transition-all shadow-sm bg-primary text-white';
    btnNetto.className = 'flex-1 py-1.5 text-xs font-medium rounded-md transition-all text-slate-600 hover:text-slate-800' + (btnNetto.disabled ? ' opacity-40 cursor-not-allowed' : '');
  }
  const headerPreis = document.getElementById('header-einzelpreis');
  const headerGesamt = document.getElementById('header-gesamtpreis');
  if (headerPreis && headerGesamt) {
    headerPreis.textContent = mode === 'netto' ? 'Einzelpreis (Netto)' : 'Einzelpreis (Brutto)';
    headerGesamt.textContent = mode === 'netto' ? 'Gesamt (Netto)' : 'Gesamt (Brutto)';
  }
  calculateRechnungTotals();
}

window.setEingabeModus = setEingabeModus;

function updateAngebotModalFooter(angStatus, existing) {
  const leftActions = document.getElementById('angebot-modal-actions-left');
  const rightActions = document.getElementById('rechnung-modal-actions-right');
  if (!leftActions || !rightActions) return;
  leftActions.innerHTML = '';
  rightActions.innerHTML = '';
  const statusNorm = (angStatus || existing?.angebot_status || 'ENTWURF').toUpperCase().trim();
  const ver = existing?.version || 1;
  if (statusNorm === 'ENTWURF' || statusNorm === 'OFFEN') {
    // Bei ENTWURF:
    leftActions.innerHTML = `
            <button type="button" id="btn-preview-angebot-pdf" onclick="previewAngebotPdf()"
                class="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 shadow-sm transition-all">
                <span class="material-symbols-outlined text-[18px] text-slate-500">visibility</span>
                PDF Vorschau
            </button>
        `;
    rightActions.innerHTML = `
            <button onclick="closeRechnungModal()" type="button" id="rechnung-modal-cancel"
                class="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm transition-all focus:ring-2 focus:ring-slate-200">Abbrechen</button>
            <button onclick="saveAngebotEntwurf()" type="button" id="btn-angebot-save-draft"
                class="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 shadow-sm transition-all flex items-center gap-2">
                <span class="material-symbols-outlined text-[18px]">save</span>
                Entwurf speichern
            </button>
            <button onclick="registerAngebotVersand()" type="button" id="btn-freeze-angebot" data-legacy-id="btn-angebot-freeze-send"
                class="px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2">
                <span class="material-symbols-outlined text-[18px]">lock</span>
                Versand registrieren (Einfrieren)
            </button>
        `;
  } else if (statusNorm === 'VERSENDET') {
    // Bei VERSENDET (Gefroren):
    leftActions.innerHTML = `
            <button type="button" id="btn-preview-angebot-pdf" onclick="previewAngebotPdf()"
                class="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 shadow-sm transition-all">
                <span class="material-symbols-outlined text-[18px] text-primary">picture_as_pdf</span>
                PDF anzeigen
            </button>
            <button type="button" onclick="createNextAngebotVersion()" id="btn-neue-version-angebot" data-legacy-id="btn-angebot-new-version"
                class="px-4 py-2 text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 flex items-center gap-1.5 shadow-sm transition-all">
                <span class="material-symbols-outlined text-[18px]">difference</span>
                Neue Version erstellen (v${ver + 1})
            </button>
        `;
    rightActions.innerHTML = `
            <button onclick="closeRechnungModal()" type="button" id="rechnung-modal-close"
                class="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm transition-all focus:ring-2 focus:ring-slate-200">Schließen</button>
            <button onclick="rejectAngebotFromModal()" type="button" id="btn-angebot-reject"
                class="px-4 py-2.5 text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 shadow-sm transition-all flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[18px]">cancel</span>
                Angebot ablehnen
            </button>
            <button onclick="acceptAngebotFromModal()" type="button" id="btn-accept-angebot" data-legacy-id="btn-angebot-accept"
                class="px-6 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2">
                <span class="material-symbols-outlined text-[18px]">check_circle</span>
                Angebot annehmen
            </button>
        `;
  } else if (statusNorm === 'ANGENOMMEN') {
    // Bei ANGENOMMEN:
    leftActions.innerHTML = `
            <button type="button" id="btn-preview-angebot-pdf" onclick="previewAngebotPdf()"
                class="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 shadow-sm transition-all">
                <span class="material-symbols-outlined text-[18px] text-primary">picture_as_pdf</span>
                PDF anzeigen
            </button>
        `;
    const acceptedVer = existing?.angenommene_version || existing?.version || 1;
    const existingProjekt = (state.projekte || []).find(p => p.source_angebot_id === existing?.id && (p.source_angebot_version || 1) === acceptedVer);
    let projBtnHtml = '';
    if (existingProjekt) {
      projBtnHtml = `
                <button type="button" onclick="navigateToAngebotProjekt(${existingProjekt.id})" id="btn-to-project-angebot"
                    class="px-6 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-lg shadow-md flex items-center gap-2 transition-all">
                    <span class="material-symbols-outlined text-[18px]">folder_open</span>
                    Zum Projekt (#${existingProjekt.id})
                </button>
            `;
    } else {
      projBtnHtml = `
                <button type="button" onclick="convertToAuftrag(${existing?.id})" id="btn-create-auftrag"
                    class="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-md flex items-center gap-2 transition-all mr-2">
                    <span class="material-symbols-outlined text-[18px]">post_add</span>
                    Auftragsbestätigung (AB) erstellen
                </button>
                <button type="button" onclick="createProjektFromAngebotModal()" id="btn-create-project-angebot" data-legacy-id="btn-angebot-create-project"
                    class="px-6 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2">
                    <span class="material-symbols-outlined text-[18px]">construction</span>
                    In Projekt umwandeln / Projekt anlegen
                </button>
            `;
    }
    rightActions.innerHTML = `
            <button onclick="closeRechnungModal()" type="button" id="rechnung-modal-close"
                class="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm transition-all focus:ring-2 focus:ring-slate-200">Schließen</button>
            ${projBtnHtml}
        `;
  } else if (statusNorm === 'ABGELEHNT') {
    // Bei ABGELEHNT:
    leftActions.innerHTML = `
            <button type="button" onclick="previewAngebotPdf()"
                class="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 shadow-sm transition-all">
                <span class="material-symbols-outlined text-[18px] text-primary">picture_as_pdf</span>
                PDF anzeigen
            </button>
            <button type="button" onclick="createNextAngebotVersion()"
                class="px-4 py-2 text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 flex items-center gap-1.5 shadow-sm transition-all">
                <span class="material-symbols-outlined text-[18px]">difference</span>
                Neue Version verhandeln
            </button>
        `;
    rightActions.innerHTML = `
            <button onclick="closeRechnungModal()" type="button"
                class="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm transition-all focus:ring-2 focus:ring-slate-200">Schließen</button>
        `;
  }
}

window.updateAngebotModalFooter = updateAngebotModalFooter;

function applyAngebotEditMode(existing, form, submitBtn) {
  const rawStatus = (existing.angebot_status || (existing.status === 'Entwurf' ? 'ENTWURF' : existing.status) || 'ENTWURF').toUpperCase().trim();
  const angStatus = rawStatus === 'OFFEN' ? 'ENTWURF' : rawStatus;
  const isFrozen = angStatus === 'VERSENDET' || angStatus === 'ANGENOMMEN' || angStatus === 'ABGELEHNT' || Boolean(existing.freeze_snapshot_json);
  state.isEditorReadOnly = isFrozen;

  // Header Title
  document.getElementById('rechnung-modal-title').innerText = isFrozen ? `Angebot ansehen (${existing.nr || ''})` : 'Angebot Bearbeiten';

  // Header Badges
  const verBadge = document.getElementById('rechnung-modal-version');
  if (verBadge) {
    verBadge.classList.remove('hidden');
    verBadge.textContent = 'v' + (existing.version || 1);
  }
  const modalStatus = document.getElementById('rechnung-modal-status');
  if (modalStatus) {
    if (angStatus === 'VERSENDET') {
      modalStatus.className = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200';
      modalStatus.innerHTML = '<span class="material-symbols-outlined text-[14px]">lock</span>VERSENDET (Gefroren)';
    } else if (angStatus === 'ANGENOMMEN') {
      modalStatus.className = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200';
      modalStatus.innerHTML = '<span class="material-symbols-outlined text-[14px]">check_circle</span>ANGENOMMEN';
    } else if (angStatus === 'ABGELEHNT') {
      modalStatus.className = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200';
      modalStatus.innerHTML = '<span class="material-symbols-outlined text-[14px]">cancel</span>ABGELEHNT';
    } else {
      modalStatus.className = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200';
      modalStatus.innerHTML = '<span class="material-symbols-outlined text-[14px]">edit_document</span>ENTWURF';
    }
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
      selAuftraggeber.disabled = isFrozen;
      selAuftraggeber.value = existing.auftraggeber_typ || 'PRIVAT';
    }
    const selVertrag = document.getElementById('angebot-vertragsgrundlage');
    if (selVertrag) {
      selVertrag.disabled = isFrozen;
      selVertrag.value = existing.vertragsgrundlage || 'BGB_WERKVERTRAG';
    }
    const alertBox = document.getElementById('bgb-650m-alert-box');
    if (alertBox) {
      if (existing.vertragsgrundlage === 'BGB_VERBRAUCHERBAU') alertBox.classList.remove('hidden');else alertBox.classList.add('hidden');
    }
    const freezeBadge = document.getElementById('angebot-freeze-badge');
    if (freezeBadge) {
      if (isFrozen) freezeBadge.classList.remove('hidden');else freezeBadge.classList.add('hidden');
    }
    const adresseEl = document.getElementById('angebot-baustellen-adresse');
    if (adresseEl) {
      adresseEl.value = existing.baustellen_adresse || '';
      adresseEl.disabled = isFrozen;
    }
    const ausfVonEl = document.getElementById('angebot-ausfuehrung-von');
    if (ausfVonEl) {
      ausfVonEl.value = existing.leistungszeitraum_von || '';
      ausfVonEl.disabled = isFrozen;
    }
    const ausfBisEl = document.getElementById('angebot-ausfuehrung-bis');
    if (ausfBisEl) {
      ausfBisEl.value = existing.leistungszeitraum_bis || '';
      ausfBisEl.disabled = isFrozen;
    }
    const sichEl = document.getElementById('angebot-sicherheitseinbehalt');
    if (sichEl) {
      const sichVal = existing.sicherheitseinbehalt_prozent !== undefined && existing.sicherheitseinbehalt_prozent !== null && existing.sicherheitseinbehalt_prozent !== 0 ? existing.sicherheitseinbehalt_prozent : existing.sicherheitseinbehalt && existing.netto ? Math.round(existing.sicherheitseinbehalt / existing.netto * 1000) / 10 : '';
      sichEl.value = sichVal;
      sichEl.disabled = isFrozen;
    }
    const cb13b = document.getElementById('angebot-13b-ustg');
    if (cb13b) {
      cb13b.checked = !!existing.unterliegt_13b;
      cb13b.disabled = isFrozen;
      cb13b.onchange = handleAngebot13bChange;
    }
    handleAngebotMetaChange();
  }
  const addRowBtn = form.querySelector('button[onclick="addRechnungPosition()"]');
  if (addRowBtn) {
    if (isFrozen) addRowBtn.classList.add('hidden');else addRowBtn.classList.remove('hidden');
  }

  // Fill form values
  document.getElementById('rechnung-id').value = existing.id;
  document.getElementById('rechnung-kunde').value = existing.kundeId;
  document.getElementById('rechnung-projekt').value = existing.projektId || '';
  setzeRechnungObjektSelect(existing);
  document.getElementById('rechnung-nr').value = existing.nr;
  document.getElementById('rechnung-datum').value = typeof formatDateISO === 'function' ? formatDateISO(existing.datum) : existing.datum;
  document.getElementById('rechnung-faellig').value = typeof formatDateISO === 'function' ? formatDateISO(existing.faellig) : existing.faellig;
  const wTageAng = document.getElementById('rechnung-werktage');
  if (wTageAng) {
    wTageAng.disabled = isFrozen;
    if (existing.datum && existing.faellig && typeof countWorkingDaysBetween === 'function') {
      wTageAng.value = countWorkingDaysBetween(existing.datum, existing.faellig);
    }
  }
  if (typeof initRechnungDateHandlers === 'function') initRechnungDateHandlers();
  if (typeof updateRechnungDatePreviews === 'function') updateRechnungDatePreviews();
  const statusSelect = document.getElementById('rechnung-status');
  if (statusSelect) statusSelect.value = angStatus;
  if (existing.eingabemodus) {
    setEingabeModus(existing.eingabemodus);
  }
  document.getElementById('rechnung-global-rabatt').value = existing.globalRabattValue !== undefined && existing.globalRabattValue !== null && existing.globalRabattValue !== 0 ? existing.globalRabattValue : '';
  setRabattType(existing.globalRabattType || '%');
  document.getElementById('rechnung-anzahlung').value = existing.anzahlung || '';
  state.currentRechnungPositionen = JSON.parse(JSON.stringify(existing.positionen || []));
  handleKundeSelect({
    target: {
      value: existing.kundeId
    }
  });
  renderRechnungPositionen();

  // Enable/Disable ALL form inputs (including dynamically rendered positions and customer selects)
  const inputs = form.querySelectorAll('input:not([type="hidden"]), select, textarea');
  inputs.forEach(el => {
    el.disabled = isFrozen;
    if (isFrozen) {
      el.classList.add('cursor-not-allowed');
    } else {
      el.classList.remove('cursor-not-allowed');
    }
  });
  updateAngebotModalFooter(angStatus, existing);
}

window.applyAngebotEditMode = applyAngebotEditMode;

function applyAngebotNewMode() {
  state.isEditorReadOnly = false;
  const today = new Date();
  const todayIso = typeof formatDateISO === 'function' ? formatDateISO(today) : today.toISOString().split('T')[0];
  document.getElementById('rechnung-datum').value = todayIso;
  const zZiel = 30; // 30 Arbeitstage Angebots-Bindefrist
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

  // Generate next NR dynamically
  const currentMaxAngebot = state.angebote.reduce((max, a) => Math.max(max, extractLaufendeNummer(a.nr)), 0);
  const nextAngebotIdNumber = currentMaxAngebot + 1;
  const nextNr = `ANG-${today.getFullYear()}-${String(nextAngebotIdNumber).padStart(3, '0')}`;
  document.getElementById('rechnung-nr').value = nextNr;
  renderRechnungPositionen(); // Empty initially
  updateAngebotModalFooter('ENTWURF', null);
}

window.applyAngebotNewMode = applyAngebotNewMode;

