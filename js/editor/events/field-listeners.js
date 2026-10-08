function handleAngebot13bChange() {
  const ang13b = document.getElementById('angebot-13b-ustg');
  const rech13b = document.getElementById('rechnung-13b-ustg');
  if (ang13b && rech13b) {
    rech13b.checked = ang13b.checked;
  }
  if (typeof handleRechtlicheCheckboxes === 'function') {
    handleRechtlicheCheckboxes();
  }
  if (typeof calculateRechnungTotals === 'function') {
    calculateRechnungTotals();
  }
}

window.handleAngebot13bChange = handleAngebot13bChange;

function handleAngebotMetaChange() {
  const auftraggeberTypEl = document.getElementById('angebot-auftraggeber-typ');
  const vertragsgrundlageEl = document.getElementById('angebot-vertragsgrundlage');
  const alertBox = document.getElementById('bgb-650m-alert-box');
  const auftraggeberTyp = auftraggeberTypEl ? auftraggeberTypEl.value : 'PRIVAT';
  const vertragsgrundlage = vertragsgrundlageEl ? vertragsgrundlageEl.value : 'BGB_WERKVERTRAG';

  // 1. § 650m BGB Alert
  if (alertBox) {
    if (vertragsgrundlage === 'BGB_VERBRAUCHERBAU') {
      alertBox.classList.remove('hidden');
    } else {
      alertBox.classList.add('hidden');
    }
  }

  // 2. Synchronisation Auftraggeber-Typ -> ist_privatkunde & Customer Type
  const pKunde = document.getElementById('rechnung-ist-privatkunde');
  if (auftraggeberTyp === 'PRIVAT') {
    if (pKunde) pKunde.checked = true;
    if (typeof setRechnungCustomerType === 'function') {
      setRechnungCustomerType('B2C');
    }
  } else if (auftraggeberTyp === 'GEWERBLICH') {
    if (pKunde) pKunde.checked = false;
    if (typeof setRechnungCustomerType === 'function') {
      setRechnungCustomerType('B2B');
    }
  } else if (auftraggeberTyp === 'OEFFENTLICH') {
    if (pKunde) pKunde.checked = false;
    if (typeof setRechnungCustomerType === 'function') {
      setRechnungCustomerType('B2G');
    }
  }

  // 3. Synchronisation Vertragsgrundlage -> vob_vereinbart
  const vobCb = document.getElementById('rechnung-vob-vereinbart');
  if (vobCb) {
    vobCb.checked = vertragsgrundlage === 'VOB_B';
  }
}

window.handleAngebotMetaChange = handleAngebotMetaChange;

function handleKundeSelect(event) {
  const id = parseInt(event.target.value);
  const kunde = state.kunden.find(k => k.id === id);
  const detailsBox = document.getElementById('rechnung-kunde-details');
  detailsBox.innerHTML = '';
  if (kunde) {
    // Automatically sync customer type to B2C / B2B / B2G
    const cType = kunde.customer_type || (kunde.ist_privatkunde ? 'B2C' : kunde.leitweg_id ? 'B2G' : 'B2B');
    setRechnungCustomerType(cType, {
      fromCustomerSelect: true
    });
    const div = document.createElement('div');
    div.className = 'relative z-10 w-full text-left';
    const strong = document.createElement('strong');
    strong.textContent = kunde.name;
    div.appendChild(strong);
    div.appendChild(document.createElement('br'));
    div.appendChild(document.createTextNode(kunde.adresse));
    div.appendChild(document.createElement('br'));
    div.appendChild(document.createTextNode(`${kunde.plz} ${kunde.ort || ''}`));
    div.appendChild(document.createElement('br'));
    const span = document.createElement('span');
    span.className = 'text-slate-400 mt-1 block';
    span.textContent = `Tel: ${kunde.telefon}`;
    div.appendChild(span);

    // Auto-fill B2G fields if present on customer
    const leitwegInput = document.getElementById('rechnung-leitweg-id');
    const buyerRefInput = document.getElementById('rechnung-buyer-reference');
    if (leitwegInput && kunde.leitweg_id) {
      leitwegInput.value = kunde.leitweg_id;
    }
    if (buyerRefInput && kunde.buyer_reference) {
      buyerRefInput.value = kunde.buyer_reference;
    }
    if (typeof initRechnungLeitwegLiveCheck === 'function') initRechnungLeitwegLiveCheck();
    if (typeof validateRechnungLeitwegField === 'function') validateRechnungLeitwegField();

    // Checkbox defaults for B2C/B2B
    const privCb = document.getElementById('rechnung-ist-privatkunde');
    if (cType === 'B2C' || kunde.ist_privatkunde) {
      if (privCb) privCb.checked = true;
    } else {
      if (privCb) privCb.checked = false;
    }
    if (cType === 'B2B' && kunde.ist_bauleistender_13b) {
      const cb13b = document.getElementById('rechnung-13b-ustg');
      if (cb13b) cb13b.checked = true;
    }
    if (state.isAngebotMode) {
      const angebotAuftraggeberEl = document.getElementById('angebot-auftraggeber-typ');
      if (angebotAuftraggeberEl) {
        if (cType === 'B2C' || kunde.ist_privatkunde) {
          angebotAuftraggeberEl.value = 'PRIVAT';
        } else if (cType === 'B2G') {
          angebotAuftraggeberEl.value = 'OEFFENTLICH';
        } else {
          angebotAuftraggeberEl.value = 'GEWERBLICH';
        }
      }
      const cb13bAng = document.getElementById('angebot-13b-ustg');
      if (cb13bAng) {
        if (cType === 'B2B' && kunde.ist_bauleistender_13b) {
          cb13bAng.checked = true;
        } else if (cType === 'B2C') {
          cb13bAng.checked = false;
        }
      }
    }
    handleRechtlicheCheckboxes();

    // § 48b Subunternehmer Warning Check
    if (typeof SubcontractorController !== 'undefined') {
      const sec48bCheck = SubcontractorController.checkSec48bStatus(kunde);
      const warningBanner = document.getElementById('subcontractor-sec48b-warning');
      const warningText = document.getElementById('subcontractor-sec48b-warning-text');
      if (warningBanner) {
        if (!sec48bCheck.isValid || sec48bCheck.warning) {
          warningBanner.classList.remove('hidden');
          if (warningText) warningText.textContent = sec48bCheck.warning || 'Freistellungsbescheinigung ungültig.';
        } else {
          warningBanner.classList.add('hidden');
        }
      }
    }
    detailsBox.appendChild(div);
  } else {
    const p = document.createElement('p');
    p.className = 'text-slate-400 italic text-center text-sm';
    p.textContent = 'Kein Kunde ausgewählt';
    detailsBox.appendChild(p);
  }
}

window.handleKundeSelect = handleKundeSelect;

function handleRechtlicheCheckboxes(triggeredById) {
  const vob = document.getElementById('rechnung-vob-vereinbart');
  const pKunde = document.getElementById('rechnung-ist-privatkunde');
  const bauabzug = document.getElementById('rechnung-unterliegt-bauabzugsteuer');
  const ustg13b = document.getElementById('rechnung-13b-ustg');
  if (!pKunde || !bauabzug || !ustg13b) return;
  const currentType = document.getElementById('rechnung-customer-type')?.value || 'B2B';
  const isReadOnly = document.getElementById('rechnung-modal-submit')?.classList.contains('hidden');
  function applyCheckboxRule(inputEl, allowed, forbiddenReason) {
    if (!inputEl) return;
    const label = inputEl.closest('label');
    if (isReadOnly) {
      inputEl.disabled = true;
      if (label) {
        label.classList.add('cursor-default');
        label.classList.remove('cursor-pointer');
      }
      return;
    }
    if (!allowed) {
      inputEl.checked = false;
      inputEl.disabled = true;
      if (forbiddenReason) inputEl.title = forbiddenReason;
      if (label) {
        label.classList.add('opacity-40', 'cursor-not-allowed');
        label.classList.remove('cursor-pointer');
        if (forbiddenReason) label.title = forbiddenReason;
      }
    } else {
      inputEl.disabled = false;
      inputEl.removeAttribute('title');
      if (label) {
        label.classList.remove('opacity-40', 'cursor-not-allowed');
        label.classList.add('cursor-pointer');
        label.removeAttribute('title');
      }
    }
  }
  if (currentType === 'B2C') {
    // B2C: nur 1. (VOB/B) und 2. (Privatkunde) können gewählt werden, Rest kann nicht
    applyCheckboxRule(vob, true);
    applyCheckboxRule(pKunde, true);
    applyCheckboxRule(bauabzug, false, 'Bauabzugsteuer nach § 48 EStG gilt nur im gewerblichen Bereich (B2B/B2G).');
    applyCheckboxRule(ustg13b, false, 'Reverse Charge nach § 13b UStG ist für Privatkunden (B2C) gesetzlich unzulässig.');
  } else {
    // B2B & B2G: können 1. (VOB/B), 3. (Bauabzugsteuer) und 4./letzte (§ 13b) wählen. 2. (Privatkunde) kann nicht
    applyCheckboxRule(vob, true);
    applyCheckboxRule(pKunde, false, 'Privatkunde kann bei Geschäftskunden oder Behörden (B2B/B2G) nicht gewählt werden.');
    applyCheckboxRule(bauabzug, true);
    applyCheckboxRule(ustg13b, true);
  }
  const ang13b = document.getElementById('angebot-13b-ustg');
  if (ang13b) {
    if (currentType === 'B2C') {
      ang13b.checked = false;
      ang13b.disabled = true;
    } else {
      ang13b.disabled = isReadOnly;
    }
  }
  if (typeof renderRechnungPositionen === 'function') {
    renderRechnungPositionen();
  } else if (typeof calculateRechnungTotals === 'function') {
    calculateRechnungTotals();
  }
}

window.handleRechtlicheCheckboxes = handleRechtlicheCheckboxes;

function initRechnungDateHandlers() {
  const datumEl = document.getElementById('rechnung-datum');
  const faelligEl = document.getElementById('rechnung-faellig');
  const werktageInput = document.getElementById('rechnung-werktage');
  if (datumEl && !datumEl.dataset.hasDateHandler) {
    datumEl.dataset.hasDateHandler = 'true';
    const onDatumChange = () => {
      const raw = datumEl.value;
      if (!raw) return;
      const iso = typeof formatDateISO === 'function' ? formatDateISO(raw) : raw;
      if (iso && iso !== raw) {
        datumEl.value = iso;
      }
      const at = parseInt(werktageInput?.value, 10) || parseInt(state?.einstellungen?.zahlungsziel, 10) || 14;
      if (typeof calculateDueDateWorkingDays === 'function') {
        const newFaellig = calculateDueDateWorkingDays(datumEl.value, at);
        if (faelligEl) faelligEl.value = newFaellig;
      }
      updateRechnungDatePreviews();
    };
    datumEl.addEventListener('change', onDatumChange);
    datumEl.addEventListener('input', onDatumChange);
  }
  if (werktageInput && !werktageInput.dataset.hasDateHandler) {
    werktageInput.dataset.hasDateHandler = 'true';
    const onWerktageChange = () => {
      const at = parseInt(werktageInput.value, 10);
      if (isNaN(at) || at < 0) return;
      const baseDatum = datumEl?.value || (typeof formatDateISO === 'function' ? formatDateISO(new Date()) : new Date().toISOString().split('T')[0]);
      if (typeof calculateDueDateWorkingDays === 'function') {
        const newFaellig = calculateDueDateWorkingDays(baseDatum, at);
        if (faelligEl) faelligEl.value = newFaellig;
      }
      updateRechnungDatePreviews();
    };
    werktageInput.addEventListener('input', onWerktageChange);
    werktageInput.addEventListener('change', onWerktageChange);
  }
  if (faelligEl && !faelligEl.dataset.hasDateHandler) {
    faelligEl.dataset.hasDateHandler = 'true';
    const onFaelligChange = () => {
      const raw = faelligEl.value;
      if (!raw) return;
      const iso = typeof formatDateISO === 'function' ? formatDateISO(raw) : raw;
      if (iso && iso !== raw) {
        faelligEl.value = iso;
      }
      const baseDatum = datumEl?.value;
      if (baseDatum && typeof countWorkingDaysBetween === 'function') {
        const at = countWorkingDaysBetween(baseDatum, faelligEl.value);
        if (werktageInput) werktageInput.value = at >= 0 ? at : 0;
      }
      updateRechnungDatePreviews();
    };
    faelligEl.addEventListener('change', onFaelligChange);
    faelligEl.addEventListener('input', onFaelligChange);
  }
}

window.initRechnungDateHandlers = initRechnungDateHandlers;

function addVerrechnung() {
  const select = document.getElementById('rechnung-verrechnung-select');
  const id = parseInt(select.value);
  if (!id) return;
  const rech = state.rechnungen.find(r => r.id === id);
  if (rech) {
    state.currentRechnungVerrechnungen.push({
      vorherige_rechnung_id: rech.id,
      abzugsbetrag_netto: rech.netto
    });
    populateVerrechnungSelect();
    renderVerrechnungen();
  }
}

window.addVerrechnung = addVerrechnung;

function removeVerrechnung(id) {
  state.currentRechnungVerrechnungen = state.currentRechnungVerrechnungen.filter(v => v.vorherige_rechnung_id !== id);
  populateVerrechnungSelect();
  renderVerrechnungen();
}

window.removeVerrechnung = removeVerrechnung;

function validateRechnungLeitwegField() {
  const input = document.getElementById('rechnung-leitweg-id');
  if (!input) return true;
  const typeEl = document.getElementById('rechnung-customer-type');
  const isB2G = !!typeEl && typeEl.value === 'B2G';
  let err = document.getElementById('rechnung-leitweg-id-fehler');
  const clearErr = () => {
    input.classList.remove('border-red-500', 'ring-2', 'ring-red-200');
    if (err) {
      err.textContent = '';
      err.classList.add('hidden');
    }
  };
  if (!isB2G) {
    clearErr();
    return true;
  }
  const val = (input.value || '').trim();
  const showErr = (message) => {
    input.classList.add('border-red-500', 'ring-2', 'ring-red-200');
    if (!err) {
      err = document.createElement('p');
      err.id = 'rechnung-leitweg-id-fehler';
      err.className = 'text-xs text-red-600 font-medium mt-1';
      input.insertAdjacentElement('afterend', err);
    }
    err.textContent = message || '';
    err.classList.remove('hidden');
  };
  if (!val) {
    showErr('Leitweg-ID fehlt: Bei B2G (öffentlicher Auftraggeber) ist die Leitweg-ID Pflicht (BT-10 gemäß BR-DE-15).');
    return false;
  }
  const leitwegValidation = (typeof EInvoiceValidation !== 'undefined') ? EInvoiceValidation : null;
  if (leitwegValidation) {
    const check = leitwegValidation.validateLeitwegId(val);
    if (!check.valid) {
      showErr(check.message);
      return false;
    }
  }
  clearErr();
  return true;
}

window.validateRechnungLeitwegField = validateRechnungLeitwegField;

function initRechnungLeitwegLiveCheck() {
  const input = document.getElementById('rechnung-leitweg-id');
  if (input && !input.dataset.hasLeitwegCheck) {
    input.dataset.hasLeitwegCheck = 'true';
    input.addEventListener('input', () => validateRechnungLeitwegField());
  }
}

window.initRechnungLeitwegLiveCheck = initRechnungLeitwegLiveCheck;

