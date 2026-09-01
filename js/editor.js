// --- Rechnung Erstellen Logic ---

/**
 * Extrahiert die laufende Nummer aus einer Belegnummer - robust gegen Präfixe wie
 * "STORNO - INV-2026-001" oder abweichende Formate. Es wird die LASTE Zifferngruppe
 * der Nummer verwendet (regex statt blindes parseInt auf split('-').pop()).
 */
function extractLaufendeNummer(nr) {
    const groups = String(nr || '').match(/\d+/g);
    return (groups && groups.length > 0) ? (parseInt(groups[groups.length - 1], 10) || 0) : 0;
}

function convertToRechnung(angId) {
    const ang = state.angebote.find(a => a.id === angId);
    if (!ang) return;

    openRechnungModal();

    // Deep copy positions
    state.currentRechnungPositionen = JSON.parse(JSON.stringify(ang.positionen));

    // Fill static fields
    document.getElementById('rechnung-kunde').value = ang.kundeId;
    if (ang.projektId) {
        document.getElementById('rechnung-projekt').value = ang.projektId;
    }

    document.getElementById('rechnung-global-rabatt').value = (ang.globalRabattValue !== undefined && ang.globalRabattValue !== null && ang.globalRabattValue !== 0) ? ang.globalRabattValue : '';
    setRabattType(ang.globalRabattType || '%');
    document.getElementById('rechnung-anzahlung').value = ang.anzahlung > 0 ? ang.anzahlung : '';

    handleKundeSelect({ target: { value: ang.kundeId } });
    renderRechnungPositionen();

    // Switch view to dashboard so that users can see it after saving
    document.getElementById('nav-dashboard').click();
}

async function storniereRechnung(id) {
    const original = state.rechnungen.find(r => r.id === id);
    if (!original) return;

    if (await safeConfirm(`Möchten Sie für die Rechnung ${original.nr} wirklich eine Stornorechnung (Gutschrift) erstellen? Dies kann nicht rückgängig gemacht werden.`)) {
        const stornoData = window.InvoiceController.createStornoData(original);
        if (!stornoData) return;

        try {
            const model = new window.InvoiceModel(window.api);
            const newState = await model.storniereRechnung(stornoData.updatedOriginal, stornoData.stornoDoc);

            if (newState) {
                state.angebote = newState.angebote;
                state.rechnungen = newState.rechnungen;
                state.artikel = newState.artikel;
            }

            if (document.getElementById('view-dashboard') && !document.getElementById('view-dashboard').classList.contains('hidden')) {
                renderDashboard();
            } else if (document.getElementById('view-rechnungen') && !document.getElementById('view-rechnungen').classList.contains('hidden')) {
                renderRechnungen();
            }
            showToast(`Stornorechnung ${stornoData.stornoNr} wurde erfolgreich erstellt.`, 'success');
        } catch (e) {
            console.error('Fehler beim Stornieren:', e);
            showToast('Fehler beim Stornieren der Rechnung', 'error');
        }
    }
}

async function markAsPaid(id) {
    const rech = state.rechnungen.find(r => r.id === id);
    if (!rech) return;

    if (await safeConfirm(`Möchten Sie die Rechnung ${rech.nr} als bezahlt markieren?`)) {
        try {
            const model = new window.InvoiceModel(window.api);
            await model.markAsPaid(rech);
            showToast(`Rechnung ${rech.nr} als bezahlt markiert.`, 'success');
            
            if (document.getElementById('view-dashboard') && !document.getElementById('view-dashboard').classList.contains('hidden')) {
                renderDashboard();
            } else if (document.getElementById('view-rechnungen') && !document.getElementById('view-rechnungen').classList.contains('hidden')) {
                renderRechnungen(document.getElementById('global-search') ? document.getElementById('global-search').value : '');
            }
        } catch (e) {
            console.error('Fehler beim Markieren als bezahlt:', e);
            showToast('Fehler beim Speichern des Status', 'error');
        }
    }
}

function setupRechnungModalUI() {
    state.isAngebotMode = false;
    document.getElementById('rechnung-modal-title').innerText = 'Neue Rechnung erstellen';
    document.getElementById('rechnungsdetails-title').innerText = 'Rechnungsdetails';
    document.getElementById('rechnung-nr-label').innerText = 'Rechnungsnummer';
    document.getElementById('rechnung-datum-label').innerText = 'Rechnungsdatum';
    document.getElementById('rechnung-modal-submit-text').innerText = 'Rechnung Speichern';

    // Update Status Label and Options for Rechnung
    const statusLabel = document.getElementById('rechnungsstatus-label');
    if (statusLabel) statusLabel.innerText = 'Rechnungsstatus';
    const statusSelect = document.getElementById('rechnung-status');
    if (statusSelect) {
        statusSelect.innerHTML = '';
        const options = [
            { value: 'Entwurf', label: 'Entwurf' },
            { value: 'Ausstehend', label: 'Ausstehend', selected: true },
            { value: 'Bezahlt', label: 'Bezahlt' },
            { value: 'Überfällig', label: 'Überfällig' },
            { value: 'Storniert', label: 'Storniert' }
        ];
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
    if (document.getElementById('rechnung-skonto-tage')) document.getElementById('rechnung-skonto-tage').value = '';
    if (document.getElementById('rechnung-skonto-prozent')) document.getElementById('rechnung-skonto-prozent').value = '';

    // Defaults
    const today = new Date();
    document.getElementById('rechnung-datum').value = today.toISOString().split('T')[0];
    const later = new Date(today);
    const zZiel = parseInt(state.einstellungen.zahlungsziel) || 14;
    later.setDate(today.getDate() + zZiel);
    document.getElementById('rechnung-faellig').value = later.toISOString().split('T')[0];

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
    unlockBtn.className = 'ml-auto inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors';
    unlockBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">lock_open</span> Entsperren';
    unlockBtn.onclick = async () => {
        if (!(await safeConfirm(`Rechnung ${existing.nr} wirklich entsperren? Die Freigabe wird GoBD-konform protokolliert und danach sind Inhaltsänderungen wieder möglich.`))) return;
        try {
            await window.api.unlockDocument(existing.id, 'Manuelle Freigabe im Rechnungseditor');
            showToast(`Rechnung ${existing.nr} wurde entsperrt.`, 'success');
            closeRechnungModal();
            openRechnungModal(existing.id);
        } catch (err) {
            console.error('Fehler beim Entsperren:', err);
            showToast('Fehler beim Entsperren: ' + (err.message || err), 'error');
        }
    };
    titleEl.parentElement.insertBefore(unlockBtn, titleEl.nextSibling);

    // Fill data
    document.getElementById('rechnung-kunde').value = existing.kundeId;
    document.getElementById('rechnung-nr').value = existing.nr;
    document.getElementById('rechnung-datum').value = existing.datum;
    document.getElementById('rechnung-faellig').value = existing.faellig;
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
    
    const detectedTypeReadOnly = existing.customer_type || (existing.ist_privatkunde ? 'B2C' : (existing.leitweg_id ? 'B2G' : 'B2B'));
    setRechnungCustomerType(detectedTypeReadOnly, { preserveMode: true });
    handleRechtlicheCheckboxes();
    document.getElementById('rechnung-vortext').value = existing.vortext || '';
    document.getElementById('rechnung-fusstext').value = existing.fusstext || '';

    state.currentRechnungPositionen = JSON.parse(JSON.stringify(existing.positionen || []));
    state.currentRechnungVerrechnungen = JSON.parse(JSON.stringify(existing.verrechnungen || []));
    
    handleKundeSelect({ target: { value: existing.kundeId } });
    renderRechnungPositionen();
    
    // Toggle Abschlags-Kumulation UI
    toggleAbschlagsKumulationUI();
    renderVerrechnungen();

    // Hide delete buttons on rows
    const delBtns = document.getElementById('rechnung-positionen').querySelectorAll('button');
    delBtns.forEach(b => b.classList.add('hidden'));
}

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

function fuegeDauerrechnungsChipHinzu(existing) {
    if (!existing || typeof existing !== 'object') return;
    const istSammel = existing.rechnungsart === 'SAMMELRECHNUNG';
    const planName = !istSammel && existing.vortext && existing.vortext.includes('Abrechnungsplan')
        ? (String(existing.vortext).split('"')[1] || null)
        : null;
    if (!istSammel && !planName) return;

    const titleEl = document.getElementById('rechnung-modal-title');
    if (!titleEl) return;
    const chip = document.createElement('span');
    chip.className = 'bg-purple-100 text-purple-800 text-xs font-bold px-2 py-1 rounded ml-2 align-middle inline-flex items-center gap-1';
    chip.innerHTML = `<span class="material-symbols-outlined text-[14px]">event_repeat</span>${istSammel ? 'SAMMELRECHNUNG' : `Aus Abrechnungsplan "${planName}"`}`;
    titleEl.appendChild(chip);
}

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
    document.getElementById('rechnung-datum').value = existing.datum;
    document.getElementById('rechnung-faellig').value = existing.faellig;
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

    const detectedTypeEdit = existing.customer_type || (existing.ist_privatkunde ? 'B2C' : (existing.leitweg_id ? 'B2G' : 'B2B'));
    setRechnungCustomerType(detectedTypeEdit, { preserveMode: true });
    handleRechtlicheCheckboxes();
    document.getElementById('rechnung-vortext').value = existing.vortext || '';
    document.getElementById('rechnung-fusstext').value = existing.fusstext || '';

    if (existing.eingabemodus) {
        setEingabeModus(existing.eingabemodus);
    }
    document.getElementById('rechnung-global-rabatt').value = (existing.globalRabattValue !== undefined && existing.globalRabattValue !== null && existing.globalRabattValue !== 0) ? existing.globalRabattValue : '';
    setRabattType(existing.globalRabattType || '%');
    document.getElementById('rechnung-anzahlung').value = existing.anzahlung || '';

    state.currentRechnungPositionen = JSON.parse(JSON.stringify(existing.positionen || []));
    state.currentRechnungVerrechnungen = JSON.parse(JSON.stringify(existing.verrechnungen || []));
    
    handleKundeSelect({ target: { value: existing.kundeId } });
    renderRechnungPositionen();
    
    // Toggle Abschlags-Kumulation UI
    toggleAbschlagsKumulationUI();
    renderVerrechnungen();

    // Show delete buttons
    const delBtns = document.getElementById('rechnung-positionen').querySelectorAll('button');
    delBtns.forEach(b => b.classList.remove('hidden'));
}

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

    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(el => el.disabled = false);
    submitBtn.classList.remove('hidden');
    const addRowBtn = form.querySelector('button[onclick="addRechnungPosition()"]');
    if (addRowBtn) addRowBtn.classList.remove('hidden');
    
    toggleAbschlagsKumulationUI();
    renderVerrechnungen();
}

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

    if (btnB2C) btnB2C.className = (selectedType === 'B2C') ? activeClass : inactiveClass;
    if (btnB2B) btnB2B.className = (selectedType === 'B2B') ? activeClass : inactiveClass;
    if (btnB2G) btnB2G.className = (selectedType === 'B2G') ? activeClass : inactiveClass;

    const pKunde = document.getElementById('rechnung-ist-privatkunde');
    const bauabzug = document.getElementById('rechnung-unterliegt-bauabzugsteuer');
    const ustg13b = document.getElementById('rechnung-13b-ustg');

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
        setEingabeModus('netto', { force: true });

        if (pKunde) {
            pKunde.checked = false;
            pKunde.disabled = true;
        }
        if (bauabzug) bauabzug.disabled = false;
        if (ustg13b) ustg13b.disabled = false;

        if (b2gSection) {
            b2gSection.classList.remove('hidden');
            b2gSection.classList.add('ring-2', 'ring-blue-400/40', 'bg-blue-50/80');
        }
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
            setEingabeModus(state.einstellungen.eingabemodus || 'netto', { force: true });
        } else {
            const curMode = document.getElementById('rechnung-eingabemodus')?.value || 'netto';
            setEingabeModus(curMode, { force: true });
        }

        if (pKunde) {
            pKunde.checked = false;
            pKunde.disabled = false;
        }
        if (bauabzug) bauabzug.disabled = false;
        if (ustg13b) ustg13b.disabled = false;

        applyUnternehmensartVisibility();
        if (b2gSection) {
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
        setEingabeModus('brutto', { force: true });

        if (pKunde) {
            pKunde.checked = true;
            pKunde.disabled = false;
        }
        if (bauabzug) {
            bauabzug.checked = false;
            bauabzug.disabled = true;
            bauabzug.title = 'Bauabzugsteuer nach § 48b EStG gilt nur im gewerblichen Bereich (B2B/B2G).';
        }
        if (ustg13b) {
            ustg13b.checked = false;
            ustg13b.disabled = true;
            ustg13b.title = 'Reverse Charge nach § 13b UStG ist für Privatkunden (B2C) gesetzlich unzulässig.';
        }

        if (b2gSection) {
            b2gSection.classList.add('hidden');
            b2gSection.classList.remove('ring-2', 'ring-blue-400/40');
        }
    }
}

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

function setupAngebotModalUI() {
    state.isAngebotMode = true;
    document.getElementById('rechnung-modal-title').innerText = 'Neues Angebot erstellen';
    document.getElementById('rechnungsdetails-title').innerText = 'Angebotsdetails';
    document.getElementById('rechnung-nr-label').innerText = 'Angebotsnummer';
    document.getElementById('rechnung-datum-label').innerText = 'Angebotsdatum';
    document.getElementById('rechnung-modal-submit-text').innerText = 'Angebot Speichern';

    // Update Status Label and Options for Angebot
    const statusLabel = document.getElementById('rechnungsstatus-label');
    if (statusLabel) statusLabel.innerText = 'Angebotsstatus';
    const statusSelect = document.getElementById('rechnung-status');
    if (statusSelect) {
        statusSelect.innerHTML = '';
        const options = [
            { value: 'Offen', label: 'Offen', selected: true },
            { value: 'Angenommen', label: 'Angenommen' },
            { value: 'Abgelehnt', label: 'Abgelehnt' }
        ];
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
    document.getElementById('rechnung-modal').classList.remove('hidden');

    // Reset specific UI
    const detailsBox = document.getElementById('rechnung-kunde-details');
    detailsBox.innerHTML = '';
    const pNoKunde = document.createElement('p');
    pNoKunde.className = 'text-slate-400 italic text-center text-sm';
    pNoKunde.textContent = 'Kein Kunde ausgewählt';
    detailsBox.appendChild(pNoKunde);

    populateSelects();
}

function applyAngebotEditMode(existing, form, submitBtn) {
    document.getElementById('rechnung-modal-title').innerText = 'Angebot Bearbeiten';

    // Un-disable inputs
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
    document.getElementById('rechnung-datum').value = existing.datum;
    document.getElementById('rechnung-faellig').value = existing.faellig;
    document.getElementById('rechnung-status').value = existing.status;
    if (existing.eingabemodus) {
        setEingabeModus(existing.eingabemodus);
    }
    document.getElementById('rechnung-global-rabatt').value = (existing.globalRabattValue !== undefined && existing.globalRabattValue !== null && existing.globalRabattValue !== 0) ? existing.globalRabattValue : '';
    setRabattType(existing.globalRabattType || '%');
    document.getElementById('rechnung-anzahlung').value = existing.anzahlung || '';

    state.currentRechnungPositionen = JSON.parse(JSON.stringify(existing.positionen));

    handleKundeSelect({ target: { value: existing.kundeId } });
    renderRechnungPositionen();

    // Show delete buttons
    const delBtns = document.getElementById('rechnung-positionen').querySelectorAll('button');
    delBtns.forEach(b => b.classList.remove('hidden'));
}

function applyAngebotNewMode() {
    const today = new Date();
    document.getElementById('rechnung-datum').value = today.toISOString().split('T')[0];
    const later = new Date(today);
    later.setDate(today.getDate() + 30); // 30 days valid
    document.getElementById('rechnung-faellig').value = later.toISOString().split('T')[0];

    // Generate next NR dynamically
    const currentMaxAngebot = state.angebote.reduce((max, a) => Math.max(max, extractLaufendeNummer(a.nr)), 0);
    const nextAngebotIdNumber = currentMaxAngebot + 1;
    const nextNr = `ANG-${today.getFullYear()}-${String(nextAngebotIdNumber).padStart(3, '0')}`;
    document.getElementById('rechnung-nr').value = nextNr;

    renderRechnungPositionen(); // Empty initially
}

function openAngebotModal() {
    setupAngebotModalUI();

    const form = document.getElementById('rechnung-form');
    const submitBtn = document.getElementById('rechnung-modal-submit');

    let existing = null;
    // Check if we passed an ID for editing
    if (arguments.length > 0 && typeof arguments[0] === 'number') {
        existing = state.angebote.find(a => a.id === arguments[0]);
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

function closeRechnungModal() {
    document.getElementById('rechnung-modal').classList.add('hidden');
}

function populateSelects() {
    const kSelect = document.getElementById('rechnung-kunde');
    const pKundeSelect = document.getElementById('projekt-kunde');
    const rProjSelect = document.getElementById('rechnung-projekt');
    const rObjektSelect = document.getElementById('rechnung-objekt');

    kSelect.innerHTML = '';
    const optDefaultK = document.createElement('option');
    optDefaultK.value = '';
    optDefaultK.textContent = 'Bitte wählen...';
    kSelect.appendChild(optDefaultK);

    if (pKundeSelect) {
        pKundeSelect.innerHTML = '';
        const optDefaultPK = document.createElement('option');
        optDefaultPK.value = '';
        optDefaultPK.textContent = 'Bitte wählen...';
        pKundeSelect.appendChild(optDefaultPK);
    }

    state.kunden.forEach(k => {
        const opt = document.createElement('option');
        opt.value = k.id;
        opt.textContent = k.name;
        kSelect.appendChild(opt);

        if (pKundeSelect) {
            const optP = document.createElement('option');
            optP.value = k.id;
            optP.textContent = k.name;
            pKundeSelect.appendChild(optP);
        }
    });

    if (rProjSelect) {
        rProjSelect.innerHTML = '';
        const optDefaultP = document.createElement('option');
        optDefaultP.value = '';
        optDefaultP.textContent = 'Kein Projekt';
        rProjSelect.appendChild(optDefaultP);

        state.projekte.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            rProjSelect.appendChild(opt);
        });
    }

    if (rObjektSelect) {
        rObjektSelect.innerHTML = '';
        const optDefaultO = document.createElement('option');
        optDefaultO.value = '';
        optDefaultO.textContent = 'Kein Objekt';
        rObjektSelect.appendChild(optDefaultO);

        const OC = window.ObjektController;
        if (OC && state.objekte) {
            const eintraege = [
                { typ: 'LIEGENSCHAFT', liste: state.objekte.liegenschaften || [] },
                { typ: 'GEBAEUDE', liste: state.objekte.gebaeude || [] },
                { typ: 'ETAGE', liste: state.objekte.etagen || [] },
                { typ: 'RAUM', liste: state.objekte.raeume || [] }
            ];
            eintraege.forEach(({ typ, liste }) => {
                liste.forEach(knoten => {
                    const opt = document.createElement('option');
                    opt.value = `${typ}:${knoten.id}`;
                    opt.textContent = OC.buildPfad(typ, knoten.id, state.objekte);
                    rObjektSelect.appendChild(opt);
                });
            });
        }
    }

    // Populate datalist for article autocomplete
    const aDatalist = document.getElementById('artikel-datalist');
    if (aDatalist) {
        aDatalist.innerHTML = '';
        state.artikel.forEach(a => {
            const displayName = a.ean ? `${a.name} (${a.ean})` : a.name;
            const opt = document.createElement('option');
            opt.value = displayName;
            aDatalist.appendChild(opt);
        });
    }
}

function handleKundeSelect(event) {
    const id = parseInt(event.target.value);
    const kunde = state.kunden.find(k => k.id === id);
    const detailsBox = document.getElementById('rechnung-kunde-details');

    detailsBox.innerHTML = '';
    if (kunde) {
        // Automatically sync customer type to B2C / B2B / B2G
        const cType = kunde.customer_type || (kunde.ist_privatkunde ? 'B2C' : (kunde.leitweg_id ? 'B2G' : 'B2B'));
        setRechnungCustomerType(cType, { fromCustomerSelect: true });

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

        // Checkbox defaults for B2C/B2B
        if (cType === 'B2C' || kunde.ist_privatkunde) {
            const privCb = document.getElementById('rechnung-ist-privatkunde');
            if (privCb) privCb.checked = true;
        }
        if (cType === 'B2B' && kunde.ist_bauleistender_13b) {
            const cb13b = document.getElementById('rechnung-13b-ustg');
            if (cb13b) cb13b.checked = true;
        }

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

function collectERechnungExportData() {
    const kundeId = parseInt(document.getElementById('rechnung-kunde')?.value);
    const kunde = state.kunden.find(k => k.id === kundeId) || { name: 'Empfänger' };
    const nr = document.getElementById('rechnung-nr')?.value || 'RE-000';
    const datum = document.getElementById('rechnung-datum')?.value || new Date().toISOString().split('T')[0];
    const faellig = document.getElementById('rechnung-faellig')?.value || datum;
    const leitweg_id = document.getElementById('rechnung-leitweg-id')?.value || kunde.leitweg_id || '';
    const buyer_reference = document.getElementById('rechnung-buyer-reference')?.value || kunde.buyer_reference || leitweg_id;
    const unterliegt_13b = document.getElementById('rechnung-13b-ustg')?.checked ? 1 : 0;
    const customer_type = document.getElementById('rechnung-customer-type')?.value || kunde.customer_type || 'B2B';

    const currentDoc = {
        nr,
        datum,
        faellig,
        leitweg_id,
        buyer_reference,
        customer_type,
        unterliegt_13b,
        netto: state.currentRechnungTotals ? state.currentRechnungTotals.netto : 0,
        steuer: state.currentRechnungTotals ? state.currentRechnungTotals.steuer : 0,
        brutto: state.currentRechnungTotals ? state.currentRechnungTotals.brutto : 0,
        globalRabattAbzug: state.currentRechnungTotals ? state.currentRechnungTotals.rabattAbzug : 0,
        anzahlung: state.currentRechnungTotals ? state.currentRechnungTotals.anzahlung : 0,
        sicherheitseinbehalt: state.currentRechnungTotals ? state.currentRechnungTotals.sicherheitseinbehalt : 0,
        zahlbetrag: state.currentRechnungTotals ? state.currentRechnungTotals.zahlbetrag : 0,
        verrechnungen: [...(state.currentRechnungVerrechnungen || [])],
        positionen: [...(state.currentRechnungPositionen || [])],
        eingabemodus: document.getElementById('rechnung-eingabemodus')?.value || 'netto',
        leistungszeitraum_von: document.getElementById('rechnung-leistungszeitraum-von')?.value || '',
        leistungszeitraum_bis: document.getElementById('rechnung-leistungszeitraum-bis')?.value || '',
        vob_vereinbart: document.getElementById('rechnung-vob-vereinbart')?.checked ? 1 : 0,
        ist_privatkunde: document.getElementById('rechnung-ist-privatkunde')?.checked ? 1 : 0,
        unterliegt_bauabzugsteuer: document.getElementById('rechnung-unterliegt-bauabzugsteuer')?.checked ? 1 : 0,
        vortext: document.getElementById('rechnung-vortext')?.value || '',
        fusstext: document.getElementById('rechnung-fusstext')?.value || '',
        kumulierte_leistung_netto: state.currentRechnungTotals ? state.currentRechnungTotals.kumulierte_leistung_netto : 0
    };

    return { currentDoc, customer: { ...kunde, customer_type, leitweg_id, buyer_reference }, nr };
}

function validateERechnungForB2G(currentDoc, customer) {
    if (typeof EInvoiceEngine === 'undefined') {
        showToast('E-Rechnungs-Engine nicht verfügbar.', 'error');
        return false;
    }
    // Echtes Gate: Kundentyp bleibt unverändert, B2G-Pflichten greifen nur bei echten B2G-Kunden
    const validation = EInvoiceEngine.validateForEN16931(currentDoc, customer, state.einstellungen);
    if (!validation.isValid) {
        showToast('E-Rechnungs-Export blockiert - Validierungsfehler: ' + validation.errors.join(' '), 'error');
        return false;
    }
    return true;
}

async function exportZugferdPdfFromModal() {
    const { currentDoc, customer, nr } = collectERechnungExportData();
    if (!validateERechnungForB2G(currentDoc, customer)) return;

    if (!(window.api && typeof window.api.exportZugferdPdf === 'function')) {
        showToast('ZUGFeRD-PDF/A-3-Export ist in dieser App-Version nicht verfügbar.', 'error');
        return;
    }

    // Sichtseite aus DEMSELBEN doc-Objekt unsichtbar rendern; der Main-Prozess
    // erfasst sie per printToPDF (nur #print-template ist im @media print sichtbar).
    let previousTemplateHtml = null;
    try {
        if (typeof window.renderInvoiceForZugferdExport === 'function') {
            previousTemplateHtml = await window.renderInvoiceForZugferdExport(currentDoc, customer);
        }
    } catch (renderErr) {
        console.warn('ZUGFeRD-Sichtseite konnte nicht gerendert werden - Export läuft mit Platzhalter-Seite:', renderErr);
    }

    try {
        const res = await window.api.exportZugferdPdf({
            doc: currentDoc,
            customer,
            profile: 'EN16931',
            fileNameHint: `ZUGFeRD_${nr}.pdf`
        });
        if (res && res.success) {
            showToast(`ZUGFeRD PDF/A-3 gespeichert: ${res.path}`, 'success');
        } else if (res && res.cancelled) {
            showToast('ZUGFeRD-Export abgebrochen.', 'info');
        } else {
            showToast('ZUGFeRD-Export fehlgeschlagen: ' + ((res && res.error) || 'Unbekannter Fehler'), 'error');
        }
    } catch (err) {
        showToast('ZUGFeRD-Export fehlgeschlagen: ' + err.message, 'error');
    } finally {
        if (previousTemplateHtml !== null && typeof window.restorePrintTemplateContent === 'function') {
            window.restorePrintTemplateContent(previousTemplateHtml);
        }
    }
}

async function exportXRechnungXMLFromModal() {
    const format = document.getElementById('rechnung-erechnung-format')?.value || 'XRECHNUNG';
    if (format === 'ZUGFERD') {
        await exportZugferdPdfFromModal();
        return;
    }

    const { currentDoc, customer, nr } = collectERechnungExportData();
    if (!validateERechnungForB2G(currentDoc, customer)) return;

    const xml = EInvoiceEngine.generateXRechnungXML(currentDoc, customer, state.einstellungen);
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `XRechnung_${nr}.xml`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`XRechnung XML für ${nr} heruntergeladen.`, 'success');
}

// Line Items
function addRechnungPosition() {
    state.currentRechnungPositionen.push({
        id: Date.now(), // temp id
        artikelId: '',
        name: '', // Allow custom Name
        menge: 1,
        einheit: 'Stk.',
        preis: 0,
        mwst: 19,
        rabatt: 0 // New field
    });
    renderRechnungPositionen();
}

function removeRechnungPosition(id) {
    const index = state.currentRechnungPositionen.findIndex(p => p.id === id);
    if (index !== -1) {
        state.currentRechnungPositionen.splice(index, 1);
    }
    renderRechnungPositionen();
}

function getArtikelName(artikelId, customName) {
    if (!artikelId) return customName || '';
    const art = state.artikel.find(a => a.id === artikelId);
    if (art) {
        return art.ean ? `${art.name} (${art.ean})` : art.name;
    }
    return customName || '';
}

function handleArtikelAutocomplete(posId, query) {
    const pos = state.currentRechnungPositionen.find(p => p.id === posId);
    if (!pos) return;

    // Find article matching exactly this query format "Name (EAN)" or exact Name
    const art = state.artikel.find(a => {
        const expectedName = a.ean ? `${a.name} (${a.ean})` : a.name;
        return expectedName === query || a.name === query;
    });

    if (art) {
        pos.artikelId = art.id;
        pos.preis = art.vk;
        pos.ek = art.ek; // Snapshot current purchase price
        pos.name = '';
        pos.mwst = art.mwst !== undefined ? art.mwst : 19;
        pos.kostenart = art.kostenart || 'MATERIAL';
        pos.lohnanteil_prozent = art.lohnanteil_prozent || 0;

        // Update input field to show correctly formatted string
        const inputField = document.querySelector(`input[list="artikel-datalist"][onchange*="${pos.id}"]`);
        if (inputField) inputField.value = getArtikelName(art.id, pos.name);

    } else {
        // Clear it or allow custom name? Currently system works with IDs
        pos.artikelId = '';
        pos.name = query;
        // Keep previous numeric values or reset? We typically shouldn't reset price if they are just typing a custom name!
    }

    renderRechnungPositionen();
}

function handlePositionChange(id, field, value) {
    const pos = state.currentRechnungPositionen.find(p => p.id === id);
    if (!pos) return;

    if (field === 'artikelId') {
        const art = state.artikel.find(a => a.id === parseInt(value));
        pos.artikelId = parseInt(value);
        if (art) {
            pos.preis = art.vk;
            pos.ek = art.ek; // Snapshot current purchase price
            pos.mwst = art.mwst !== undefined ? art.mwst : 19;
            pos.rabatt = 0; // Reset user discount when changing article
            pos.kostenart = art.kostenart || 'MATERIAL';
            pos.lohnanteil_prozent = art.lohnanteil_prozent || 0;
        } else {
            pos.preis = 0;
            pos.rabatt = 0;
        }
    } else if (field === 'menge') {
        pos.menge = pos.einheit === 'Pauschal' ? 1 : (parseFloat(value) || 0);
    } else if (field === 'einheit') {
        pos.einheit = value || 'Stk.';
        if (pos.einheit === 'Pauschal') {
            pos.menge = 1;
        }
    } else if (field === 'preis') {
        pos.preis = parseFloat(value) || 0;
    } else if (field === 'mwst') {
        pos.mwst = parseInt(value) || 0;
        if (!pos.is13b) {
            pos.previousMwst = pos.mwst;
        }
    } else if (field === 'is13b') {
        pos.is13b = !!value;
        if (pos.is13b) {
            if (pos.mwst !== 0) {
                pos.previousMwst = pos.mwst;
            }
            pos.mwst = 0;
        } else {
            pos.mwst = pos.previousMwst !== undefined ? pos.previousMwst : 19;
        }
    } else if (field === 'rabatt') {
        pos.rabatt = Math.max(0, Math.min(100, parseFloat(value) || 0)); // Cap 0-100%
    }

    renderRechnungPositionen();
}

function createRechnungPositionRow(pos, index) {
    const tr = document.createElement('tr');

    // Index cell
    const tdIdx = document.createElement('td');
    tdIdx.className = 'px-2 py-2 text-center text-slate-400 font-mono text-xs';
    tdIdx.textContent = index + 1;
    tr.appendChild(tdIdx);

    // Article search cell
    const tdArt = document.createElement('td');
    tdArt.className = 'px-3 py-2';
    const divRel = document.createElement('div');
    divRel.className = 'relative';
    const spanSearch = document.createElement('span');
    spanSearch.className = 'material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]';
    spanSearch.textContent = 'search';
    const inputArt = document.createElement('input');
    inputArt.type = 'text';
    inputArt.setAttribute('list', 'artikel-datalist');
    inputArt.value = getArtikelName(pos.artikelId, pos.name);
    inputArt.onchange = (e) => handleArtikelAutocomplete(pos.id, e.target.value);
    inputArt.placeholder = 'Artikel suchen...';
    inputArt.className = 'w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-primary focus:border-primary';
    divRel.appendChild(spanSearch);
    divRel.appendChild(inputArt);
    tdArt.appendChild(divRel);
    tr.appendChild(tdArt);

    // Menge cell mit Einheit & Aufmaß-Button
    const tdMenge = document.createElement('td');
    tdMenge.className = 'px-2 py-2';
    const divMengeWrapper = document.createElement('div');
    divMengeWrapper.className = 'flex items-center rounded-lg border border-slate-300 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary overflow-hidden shadow-sm';

    const currentEinheit = pos.einheit || 'Stk.';
    if (currentEinheit === 'Pauschal') {
        pos.menge = 1;
    }

    const inputMenge = document.createElement('input');
    inputMenge.type = 'number';
    inputMenge.min = '0';
    inputMenge.step = 'any';
    inputMenge.value = pos.menge;
    if (currentEinheit === 'Pauschal') {
        inputMenge.disabled = true;
    }
    inputMenge.onblur = (e) => handlePositionChange(pos.id, 'menge', e.target.value);
    inputMenge.className = 'border-none text-right focus:ring-0 w-14 text-sm px-1 py-1.5 bg-transparent disabled:opacity-50 disabled:bg-slate-50';

    const selectEinheit = document.createElement('select');
    selectEinheit.className = 'bg-slate-100 border-l border-r border-slate-300 text-xs px-1.5 py-1.5 font-medium text-slate-700 focus:ring-0 shrink-0 outline-none cursor-pointer';
    selectEinheit.onchange = (e) => handlePositionChange(pos.id, 'einheit', e.target.value);

    const einheitenOptions = ['Stk.', 'm²', 'm³', 'lfm', 'Std.', 'Pauschal'];
    if (!einheitenOptions.includes(currentEinheit)) {
        einheitenOptions.push(currentEinheit);
    }

    einheitenOptions.forEach(optVal => {
        const opt = document.createElement('option');
        opt.value = optVal;
        opt.textContent = optVal;
        if (optVal === currentEinheit) opt.selected = true;
        selectEinheit.appendChild(opt);
    });

    const btnAufmass = document.createElement('button');
    btnAufmass.type = 'button';
    btnAufmass.title = 'Aufmaß / Mengenberechnung öffnen';
    btnAufmass.className = 'p-1.5 hover:bg-primary hover:text-white text-slate-500 transition-colors flex items-center justify-center shrink-0';
    btnAufmass.innerHTML = '<span class="material-symbols-outlined text-[16px]">straighten</span>';
    btnAufmass.onclick = () => openAufmassModalForPosition(pos.id);

    divMengeWrapper.appendChild(inputMenge);
    divMengeWrapper.appendChild(selectEinheit);
    divMengeWrapper.appendChild(btnAufmass);
    tdMenge.appendChild(divMengeWrapper);
    tr.appendChild(tdMenge);

    // Preis cell
    const tdPreis = document.createElement('td');
    tdPreis.className = 'px-2 py-2';
    const inputPreis = document.createElement('input');
    inputPreis.type = 'number';
    inputPreis.step = '0.01';
    inputPreis.value = pos.preis.toFixed(2);
    inputPreis.onblur = (e) => handlePositionChange(pos.id, 'preis', e.target.value);
    inputPreis.className = 'w-full px-3 py-1.5 border border-slate-300 rounded text-sm text-right focus:ring-1 focus:ring-primary focus:border-primary';
    tdPreis.appendChild(inputPreis);
    tr.appendChild(tdPreis);

    
    const isGlobal13b = document.getElementById('rechnung-13b-ustg') && document.getElementById('rechnung-13b-ustg').checked;
    const isPos13b = isGlobal13b && pos.is13b;
    
    // MwSt cell
    const tdMwst = document.createElement('td');
    tdMwst.className = 'px-2 py-2 min-w-[80px]';
    const selectMwst = document.createElement('select');
    selectMwst.onchange = (e) => handlePositionChange(pos.id, 'mwst', e.target.value);
    selectMwst.className = 'w-full pl-2 pr-6 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-primary focus:border-primary appearance-none bg-no-repeat';
    selectMwst.style.backgroundImage = "url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2394a3b8%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')";
    selectMwst.style.backgroundPosition = 'right 0.5rem top 50%';
    selectMwst.style.backgroundSize = '0.65rem auto';
    
    const currentMwstShow = isPos13b ? 0 : pos.mwst;

    [19, 7, 0].forEach(rate => {
        const opt = document.createElement('option');
        opt.value = rate;
        opt.textContent = `${rate}%`;
        if (currentMwstShow == rate) opt.selected = true;
        selectMwst.appendChild(opt);
    });

    if (isPos13b) {
        selectMwst.disabled = true;
        selectMwst.classList.add('opacity-50', 'bg-slate-100', 'cursor-not-allowed');
    }

    tdMwst.appendChild(selectMwst);
    
    if (isGlobal13b) {
        const div13b = document.createElement('div');
        div13b.className = 'mt-2 flex items-center gap-1';
        const cb13b = document.createElement('input');
        cb13b.type = 'checkbox';
        cb13b.checked = !!pos.is13b;
        cb13b.onchange = (e) => handlePositionChange(pos.id, 'is13b', e.target.checked);
        cb13b.className = 'rounded border-slate-300 text-primary focus:ring-primary h-3 w-3 cursor-pointer';
        const lbl13b = document.createElement('span');
        lbl13b.className = 'text-xs font-semibold text-slate-500 cursor-pointer uppercase tracking-wider';
        lbl13b.textContent = '13b (0%)';
        lbl13b.onclick = () => cb13b.click();
        div13b.appendChild(cb13b);
        div13b.appendChild(lbl13b);
        tdMwst.appendChild(div13b);
    }
    
    tr.appendChild(tdMwst);

    // Rabatt cell
    const tdRabatt = document.createElement('td');
    tdRabatt.className = 'px-2 py-2';
    const divRabatt = document.createElement('div');
    divRabatt.className = 'flex items-center justify-end';
    const inputRabatt = document.createElement('input');
    inputRabatt.type = 'number';
    inputRabatt.min = '0';
    inputRabatt.max = '100';
    inputRabatt.step = 'any';
    inputRabatt.value = pos.rabatt;
    inputRabatt.onblur = (e) => handlePositionChange(pos.id, 'rabatt', e.target.value);
    inputRabatt.className = 'w-16 px-2 py-1.5 border border-slate-300 rounded text-sm text-right focus:ring-1 focus:ring-primary focus:border-primary placeholder-slate-300';
    inputRabatt.placeholder = '0';
    const spanPct = document.createElement('span');
    spanPct.className = 'text-slate-500 ml-1';
    spanPct.textContent = '%';
    divRabatt.appendChild(inputRabatt);
    divRabatt.appendChild(spanPct);
    tdRabatt.appendChild(divRabatt);
    tr.appendChild(tdRabatt);

    // Total cell
    const tdTotal = document.createElement('td');
    tdTotal.className = 'px-3 py-2 text-right font-medium text-slate-800';
    tdTotal.textContent = formatCurrency(pos.menge * pos.preis * (1 - (pos.rabatt || 0) / 100));
    tr.appendChild(tdTotal);

    // Action cell
    const tdAction = document.createElement('td');
    tdAction.className = 'px-2 py-2 text-center';
    const btnDel = document.createElement('button');
    btnDel.type = 'button';
    btnDel.onclick = () => removeRechnungPosition(pos.id);
    btnDel.className = 'text-slate-400 hover:text-red-500 transition-colors p-1 rounded-full hover:bg-red-50';
    const spanDel = document.createElement('span');
    spanDel.className = 'material-symbols-outlined text-[18px]';
    spanDel.textContent = 'close';
    btnDel.appendChild(spanDel);
    tdAction.appendChild(btnDel);
    tr.appendChild(tdAction);

    return tr;
}

function renderRechnungPositionen() {
    const tbody = document.getElementById('rechnung-positionen');
    const emptyState = document.getElementById('rechnung-empty-state');
    tbody.innerHTML = '';

    if (state.currentRechnungPositionen.length === 0) {
        tbody.parentElement.classList.add('hidden');
        emptyState.classList.remove('hidden');
    } else {
        tbody.parentElement.classList.remove('hidden');
        emptyState.classList.add('hidden');
    }

    state.currentRechnungPositionen.forEach((pos, index) => {
        const tr = createRechnungPositionRow(pos, index);
        tbody.appendChild(tr);
    });

    calculateRechnungTotals();
}

function setRabattType(type) {
    const inputType = document.getElementById('rechnung-global-rabatt-type');
    if (!inputType) return;
    
    inputType.value = type;
    
    const btnPct = document.getElementById('btn-rabatt-pct');
    const btnEur = document.getElementById('btn-rabatt-eur');
    
    if (type === '%') {
        btnPct.className = 'px-3 py-1 text-xs font-bold rounded-md transition-all shadow-sm bg-primary text-white';
        btnEur.className = 'px-3 py-1 text-xs font-bold rounded-md transition-all text-slate-600 hover:text-slate-800';
    } else {
        btnPct.className = 'px-3 py-1 text-xs font-bold rounded-md transition-all text-slate-600 hover:text-slate-800';
        btnEur.className = 'px-3 py-1 text-xs font-bold rounded-md transition-all shadow-sm bg-primary text-white';
    }
    calculateRechnungTotals();
}


function calculateRechnungTotals() {
    if (!window.invoiceView && window.InvoiceView) {
        window.invoiceView = new window.InvoiceView(window.formatCurrency);
    }
    if (!window.invoiceModel && window.InvoiceModel) {
        window.invoiceModel = new window.InvoiceModel(window.api);
    }

    if (!window.invoiceView || !window.InvoiceController) {
        console.warn("MVC Invoice components not yet initialized.");
        return;
    }

    let currentProjekt = null;
    const projektSelect = document.getElementById('rechnung-projekt');
    if (projektSelect && projektSelect.value) {
        const projektId = parseInt(projektSelect.value);
        currentProjekt = state.projekte ? state.projekte.find(p => parseInt(p.id) === projektId) : null;
    }

    state.currentRechnungTotals13bNetto = 0;
    state.currentRechnungTotalsNormalNetto = 0;

    const calculated = window.invoiceView.handleInputEvent(
        state.currentRechnungPositionen || [],
        state.currentRechnungVerrechnungen || [],
        currentProjekt,
        (res) => {
            state.currentRechnungTotals13bNetto = res.totals13bNetto;
            state.currentRechnungTotalsNormalNetto = res.totalsNormalNetto;
        }
    );

    state.currentRechnungTotals = {
        netto: calculated.nettoNachRabatt,
        steuer: calculated.totalTax,
        brutto: calculated.bruttoNachRabatt,
        rabattAbzug: calculated.abzug,
        anzahlung: calculated.anzahlung,
        sicherheitseinbehalt: calculated.sicherheitseinbehaltNetto,
        kumulierte_leistung_netto: calculated.nettoNachRabatt,
        zahlbetrag: calculated.zahlbetrag,
        netto13b: calculated.totals13bNetto,
        nettoNormal: calculated.totalsNormalNetto
    };
}


async function saveRechnung() {
    const kundeId = document.getElementById('rechnung-kunde').value;
    const projektId = document.getElementById('rechnung-projekt').value;
    const objektWert = document.getElementById('rechnung-objekt') ? document.getElementById('rechnung-objekt').value : '';
    const [objektTyp, objektIdStr] = objektWert ? objektWert.split(':') : [null, null];
    const datum = document.getElementById('rechnung-datum').value;
    const faellig = document.getElementById('rechnung-faellig').value;
    const status = document.getElementById('rechnung-status').value || 'Ausstehend';
    const nr = document.getElementById('rechnung-nr').value;
    const existingIdVal = document.getElementById('rechnung-id').value;
    const existingId = existingIdVal ? parseInt(existingIdVal) : null;

    const existing = existingId ? (state.isAngebotMode ? state.angebote.find(a => a.id === existingId) : state.rechnungen.find(r => r.id === existingId)) : null;

    const newDoc = {
        id: existingId ? existingId : null,
        nr,
        datum,
        faellig,
        kundeId: kundeId ? parseInt(kundeId) : null,
        projektId: projektId ? parseInt(projektId) : null,
        objekt_typ: objektTyp || null,
        objekt_id: objektIdStr ? parseInt(objektIdStr) : null,
        positionen: [...(state.currentRechnungPositionen || [])],
        netto: state.currentRechnungTotals ? state.currentRechnungTotals.netto : 0,
        steuer: state.currentRechnungTotals ? state.currentRechnungTotals.steuer : 0,
        brutto: state.currentRechnungTotals ? state.currentRechnungTotals.brutto : 0,
        globalRabattAbzug: state.currentRechnungTotals ? state.currentRechnungTotals.rabattAbzug : 0,
        globalRabattType: document.getElementById('rechnung-global-rabatt-type') ? document.getElementById('rechnung-global-rabatt-type').value : '%',
        globalRabattValue: parseFloat(document.getElementById('rechnung-global-rabatt')?.value) || 0,
        anzahlung: state.currentRechnungTotals ? state.currentRechnungTotals.anzahlung : 0,
        zahlbetrag: state.currentRechnungTotals ? state.currentRechnungTotals.zahlbetrag : 0,
        status: status,
        eingabemodus: document.getElementById('rechnung-eingabemodus') ? document.getElementById('rechnung-eingabemodus').value : 'netto',
        customer_type: document.getElementById('rechnung-customer-type') ? document.getElementById('rechnung-customer-type').value : 'B2B',
        rechnungsart: document.getElementById('rechnung-art') ? document.getElementById('rechnung-art').value : 'Standard',
        leitweg_id: document.getElementById('rechnung-leitweg-id') ? document.getElementById('rechnung-leitweg-id').value : '',
        buyer_reference: document.getElementById('rechnung-buyer-reference') ? document.getElementById('rechnung-buyer-reference').value : '',
        leistungszeitraum_von: document.getElementById('rechnung-leistungszeitraum-von') ? document.getElementById('rechnung-leistungszeitraum-von').value : '',
        leistungszeitraum_bis: document.getElementById('rechnung-leistungszeitraum-bis') ? document.getElementById('rechnung-leistungszeitraum-bis').value : '',
        baustellen_adresse: document.getElementById('rechnung-baustellen-adresse') ? document.getElementById('rechnung-baustellen-adresse').value : '',
        vob_vereinbart: document.getElementById('rechnung-vob-vereinbart')?.checked ? 1 : 0,
        ist_privatkunde: document.getElementById('rechnung-ist-privatkunde')?.checked ? 1 : 0,
        unterliegt_bauabzugsteuer: document.getElementById('rechnung-unterliegt-bauabzugsteuer')?.checked ? 1 : 0,
        unterliegt_13b: document.getElementById('rechnung-13b-ustg')?.checked ? 1 : 0,
        vortext: document.getElementById('rechnung-vortext') ? document.getElementById('rechnung-vortext').value : '',
        fusstext: document.getElementById('rechnung-fusstext') ? document.getElementById('rechnung-fusstext').value : '',
        sicherheitseinbehalt: state.currentRechnungTotals ? state.currentRechnungTotals.sicherheitseinbehalt : 0,
        kumulierte_leistung_netto: state.currentRechnungTotals ? state.currentRechnungTotals.kumulierte_leistung_netto : 0,
        skonto_tage: document.getElementById('rechnung-skonto-tage')?.value ? parseInt(document.getElementById('rechnung-skonto-tage').value, 10) : null,
        skonto_prozent: document.getElementById('rechnung-skonto-prozent')?.value ? parseFloat(document.getElementById('rechnung-skonto-prozent').value) : null,
        verrechnungen: [...(state.currentRechnungVerrechnungen || [])],
        isLocked: existing ? (existing.isLocked || false) : false
    };

    // Calculate summe_lohnkosten_brutto for § 35a EStG tax notice
    let totalLohnBrutto = 0;
    (newDoc.positionen || []).forEach(pos => {
        let art = null;
        if (pos.artikelId) {
            art = state.artikel ? state.artikel.find(a => a.id === pos.artikelId) : null;
        }
        const kostenart = pos.kostenart || (art ? art.kostenart : 'MATERIAL');
        const lohnanteilPct = pos.lohnanteil_prozent !== undefined ? pos.lohnanteil_prozent : (art ? art.lohnanteil_prozent : 0);

        const menge = pos.menge || 0;
        const preis = pos.preis || 0;
        const rabatt = pos.rabatt || 0;
        const mwstRate = pos.mwst !== undefined ? pos.mwst : 19;
        const is13b = newDoc.unterliegt_13b && pos.is13b;
        const effectiveMwst = is13b ? 0 : mwstRate;

        const posNetto = menge * preis * (1 - rabatt / 100);
        const posBrutto = posNetto * (1 + effectiveMwst / 100);

        if (kostenart === 'LOHN') {
            totalLohnBrutto += posBrutto;
        } else if (lohnanteilPct > 0) {
            totalLohnBrutto += posBrutto * (lohnanteilPct / 100);
        }
    });

    newDoc.summe_lohnkosten_brutto = Math.round(totalLohnBrutto * 100) / 100;
    newDoc.ausweis_35a_erforderlich = (newDoc.summe_lohnkosten_brutto > 0) ? 1 : 0;

    newDoc.type = state.isAngebotMode ? 'angebot' : 'rechnung';

    // MVC Validation via Controller
    if (window.InvoiceController && window.InvoiceController.validateSaveDocument) {
        const validation = window.InvoiceController.validateSaveDocument(newDoc);
        if (!validation.valid) {
            showToast(validation.message, 'error');
            return;
        }
    }

    // Datenintegrität: Belegnummern müssen eindeutig sein (DB hat zusätzlich einen UNIQUE-Index).
    const sameTypeDocs = state.isAngebotMode ? (state.angebote || []) : (state.rechnungen || []);
    const nrConflict = sameTypeDocs.find(d => d.nr === nr && d.id !== existingId);
    if (nrConflict) {
        showToast(`Die Belegnummer "${nr}" ist bereits vergeben (${nrConflict.datum ? new Date(nrConflict.datum).toLocaleDateString('de-DE') : 'ohne Datum'}). Bitte eine andere Nummer verwenden.`, 'error');
        return;
    }

    try {
        const model = new window.InvoiceModel(window.api);
        await model.saveDocument(newDoc);

        const newState = await model.getFullState();
        if (newState) {
            state.angebote = newState.angebote || [];
            state.rechnungen = newState.rechnungen || [];
            state.artikel = newState.artikel || [];
        }

        closeRechnungModal();
        showToast('Dokument erfolgreich gespeichert.', 'success');

        if (state.isAngebotMode) {
            if (document.getElementById('view-projekt-details') && !document.getElementById('view-projekt-details').classList.contains('hidden')) {
                if (state.currentProjektId && typeof openProjektDetails === 'function') {
                    openProjektDetails(state.currentProjektId);
                }
            } else if (typeof switchView === 'function') {
                switchView('angebote');
            } else if (typeof renderAngebote === 'function') {
                renderAngebote();
            }
        } else {
            if (document.getElementById('view-projekt-details') && !document.getElementById('view-projekt-details').classList.contains('hidden')) {
                if (state.currentProjektId && typeof openProjektDetails === 'function') {
                    openProjektDetails(state.currentProjektId);
                }
            } else if (typeof switchView === 'function') {
                switchView('rechnungen');
            } else if (typeof renderRechnungen === 'function') {
                renderRechnungen();
            }
        }
    } catch (e) {
        console.error('Error saving document:', e);
        showToast('Fehler beim Speichern in die Datenbank.', 'error');
    }
}

async function deleteRechnung(id) {
    if (await safeConfirm('Möchten Sie dieses Dokument wirklich löschen?')) {
        try {
            await window.api.deleteDocument(id, 'rechnung');
            const newState = await window.api.getFullState();
            state.angebote = newState.angebote;
            state.rechnungen = newState.rechnungen;
            state.artikel = newState.artikel;
            if (document.getElementById('view-dashboard') && !document.getElementById('view-dashboard').classList.contains('hidden')) {
                renderDashboard();
            } else if (document.getElementById('view-rechnungen') && !document.getElementById('view-rechnungen').classList.contains('hidden')) {
                renderRechnungen();
            } else if (document.getElementById('view-projekt-details') && !document.getElementById('view-projekt-details').classList.contains('hidden')) {
                if (state.currentProjektId) openProjektDetails(state.currentProjektId);
            }
            showToast('Rechnung gelöscht.', 'success');
        } catch (e) {
            console.error('Error deleting document:', e);
            showToast('Fehler beim Löschen.', 'error');
        }
    }
}

async function deleteAngebot(id) {
    if (await safeConfirm('Möchten Sie dieses Angebot wirklich löschen?')) {
        try {
            await window.api.deleteDocument(id, 'angebot');
            const newState = await window.api.getFullState();
            state.angebote = newState.angebote;
            state.rechnungen = newState.rechnungen;
            state.artikel = newState.artikel;
            if (document.getElementById('view-angebote') && !document.getElementById('view-angebote').classList.contains('hidden')) {
                renderAngebote();
            } else if (document.getElementById('view-projekt-details') && !document.getElementById('view-projekt-details').classList.contains('hidden')) {
                if (state.currentProjektId) openProjektDetails(state.currentProjektId);
            }
            showToast('Angebot gelöscht.', 'success');
        } catch (e) {
            console.error('Error deleting document:', e);
            showToast('Fehler beim Löschen.', 'error');
        }
    }
}

// --- Kumulierte Abschlagsrechnungen Logic ---

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

function populateVerrechnungSelect() {
    const select = document.getElementById('rechnung-verrechnung-select');
    const projektId = document.getElementById('rechnung-projekt').value;
    if (!select) return;

    select.innerHTML = '<option value="">Vorherige Rechnung wählen...</option>';

    if (!projektId) return;

    const currentId = document.getElementById('rechnung-id').value;

    // Datenintegrität: Bereits GLOBAL verwendete Vorrechnungen ausschließen -
    // eine Rechnung darf nur in EINER Schlussrechnung verrechnet sein (DB-Regel:
    // UNIQUE je Vorrechnung + Doppelverrechnungs-Guard im Backend). Eigene,
    // noch nicht gespeicherte Verrechnungen des aktuellen Formulars bleiben wählbar.
    const globalUsedIds = new Set();
    (state.rechnungen || []).forEach(r => {
        if (r.id != currentId) {
            (r.verrechnungen || []).forEach(v => globalUsedIds.add(v.vorherige_rechnung_id));
        }
    });

    const availableRechnungen = state.rechnungen.filter(r =>
        r.projektId == projektId &&
        r.status !== 'Entwurf' &&
        r.isLocked &&
        r.id != currentId &&
        !globalUsedIds.has(r.id) &&
        !state.currentRechnungVerrechnungen.find(v => v.vorherige_rechnung_id == r.id)
    );

    availableRechnungen.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        // Use Netto or Zahlbetrag? Rule says Abzugsbetrag Netto
        opt.textContent = `${r.nr} (${new Date(r.datum).toLocaleDateString('de-DE')}) - Netto: ${formatCurrency(r.netto)}`;
        select.appendChild(opt);
    });
}

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

function removeVerrechnung(id) {
    state.currentRechnungVerrechnungen = state.currentRechnungVerrechnungen.filter(v => v.vorherige_rechnung_id !== id);
    populateVerrechnungSelect();
    renderVerrechnungen();
}

function renderVerrechnungen() {
    const tbody = document.getElementById('rechnung-verrechnungen-list');
    const emptyState = document.getElementById('verrechnungen-empty-state');
    const summeNetto = document.getElementById('verrechnungen-summe-netto');
    if (!tbody) return;

    tbody.innerHTML = '';
    let sum = 0;

    if (!state.currentRechnungVerrechnungen) {
        state.currentRechnungVerrechnungen = [];
    }

    if (state.currentRechnungVerrechnungen.length === 0) {
        tbody.parentElement.classList.add('hidden');
        if (emptyState) emptyState.classList.remove('hidden');
    } else {
        tbody.parentElement.classList.remove('hidden');
        if (emptyState) emptyState.classList.add('hidden');

        state.currentRechnungVerrechnungen.forEach(v => {
            const r = state.rechnungen.find(rech => rech.id === v.vorherige_rechnung_id);
            if (!r) return;
            sum += v.abzugsbetrag_netto;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-4 py-2 font-medium">${r.nr}</td>
                <td class="px-4 py-2">${new Date(r.datum).toLocaleDateString('de-DE')}</td>
                <td class="px-4 py-2 text-right font-mono text-indigo-700">-${formatCurrency(v.abzugsbetrag_netto)}</td>
                <td class="px-4 py-2 text-center">
                    <button type="button" onclick="removeVerrechnung(${r.id})" class="text-slate-400 hover:text-red-500 transition-colors p-1 rounded-full hover:bg-red-50">
                        <span class="material-symbols-outlined text-[18px]">close</span>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    if (summeNetto) {
        summeNetto.textContent = formatCurrency(sum);
    }
    
    // Call calculateRechnungTotals ONLY if it exists to avoid loop when initializing early
    if (typeof calculateRechnungTotals === 'function') {
        renderRechnungPositionen();
        calculateRechnungTotals();
    }
}

// Attach Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    const artSelect = document.getElementById('rechnung-art');
    const projektSelect = document.getElementById('rechnung-projekt');
    if (artSelect) artSelect.addEventListener('change', toggleAbschlagsKumulationUI);
    if (projektSelect) projektSelect.addEventListener('change', populateVerrechnungSelect);
    applyUnternehmensartVisibility();
});

function applyUnternehmensartVisibility() {
    const art = state.einstellungen.unternehmensart || 'handwerk';
    const isHandwerkOrBau = art === 'handwerk' || art === 'bauhauptgewerbe' || art === 'b2g_spezialist';
    const isB2GSpezialist = art === 'b2g_spezialist' || art === 'bauhauptgewerbe';

    const handwerkSection = document.getElementById('rechnung-handwerk-section');
    const b2gSection = document.getElementById('rechnung-b2g-section');
    const currentCustomerType = document.getElementById('rechnung-customer-type')?.value || 'B2B';

    if (handwerkSection) {
        if (isHandwerkOrBau) {
            handwerkSection.classList.remove('hidden');
            if (typeof toggleAbschlagsKumulationUI === 'function') {
                toggleAbschlagsKumulationUI();
            }
        } else {
            handwerkSection.classList.add('hidden');
            const kumulationSection = document.getElementById('rechnung-kumulation-section');
            if (kumulationSection) {
                kumulationSection.classList.add('hidden');
            }
        }
    }

    if (b2gSection) {
        if (currentCustomerType === 'B2G') {
            b2gSection.classList.remove('hidden');
        } else if (currentCustomerType === 'B2C') {
            b2gSection.classList.add('hidden');
        } else if (isHandwerkOrBau || isB2GSpezialist) {
            b2gSection.classList.remove('hidden');
        } else {
            b2gSection.classList.add('hidden');
        }
    }
}

function handleRechtlicheCheckboxes(triggeredById) {
    const pKunde = document.getElementById('rechnung-ist-privatkunde');
    const bauabzug = document.getElementById('rechnung-unterliegt-bauabzugsteuer');
    const ustg13b = document.getElementById('rechnung-13b-ustg');

    if (!pKunde || !bauabzug || !ustg13b) return;

    if (pKunde.checked) {
        bauabzug.checked = false;
        bauabzug.disabled = true;
        ustg13b.checked = false;
        ustg13b.disabled = true;
    } else {
        bauabzug.disabled = false;
        ustg13b.disabled = false;
        
        if (bauabzug.checked || ustg13b.checked) {
            pKunde.checked = false;
            pKunde.disabled = true;
        } else {
            pKunde.disabled = false;
        }
    }
    if (typeof renderRechnungPositionen === 'function') {
        renderRechnungPositionen();
    } else if (typeof calculateRechnungTotals === 'function') {
        calculateRechnungTotals();
    }
}

async function openAufmassModalForPosition(posId) {
    if (!window.aufmassViewInstance) {
        window.aufmassViewInstance = new window.AufmassView('aufmass-modal');
    }
    const pos = (state.currentRechnungPositionen || []).find(p => p.id === posId);
    const einheit = pos ? (pos.einheit || 'm²') : 'm²';
    await window.aufmassViewInstance.openModal(posId, (total, targetId) => {
        handlePositionChange(targetId, 'menge', total);
        renderRechnungPositionen();
    }, einheit);
}


// --- E-Mail-Versand (F10): Beleg per SMTP senden ---
const EMAIL_STANDARD_TEXTE = {
    RECHNUNG: 'Guten Tag {{kunde_name}},\n\nanbei erhalten Sie die Rechnung {{nummer}} vom {{datum}} über {{betrag_brutto}}.\nDie Zahlung wird fällig am {{faelligkeit}}.\n\nMit freundlichen Grüßen\n{{firmenname}}',
    MAHNUNG: 'Guten Tag {{kunde_name}},\n\ntrotz Fälligkeit ist die Rechnung {{nummer}} über {{betrag_brutto}} (fällig am {{faelligkeit}}) noch offen.\nWir bitten um Begleichung bzw. Rückmeldung.\n\nMit freundlichen Grüßen\n{{firmenname}}',
    ANGEBOT: 'Guten Tag {{kunde_name}},\n\nanbei erhalten Sie unser Angebot {{nummer}} vom {{datum}} über {{betrag_brutto}}.\nFür Rückfragen stehen wir gerne zur Verfügung.\n\nMit freundlichen Grüßen\n{{firmenname}}'
};

function fuelleEmailTemplate(typ, kontext) {
    const templateKey = typ === 'MAHNUNG' ? 'email_text_mahnung' : (typ === 'ANGEBOT' ? 'email_text_angebot' : 'email_text_rechnung');
    const basis = (state.einstellungen && state.einstellungen[templateKey]) || EMAIL_STANDARD_TEXTE[typ] || '';
    return basis.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (voll, schluessel) => {
        if (!(schluessel in kontext)) return '';
        const wert = kontext[schluessel];
        if (schluessel === 'betrag_brutto') {
            return typeof wert === 'number' ? wert.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €' : String(wert == null ? '' : wert);
        }
        return wert == null ? '' : String(wert);
    });
}

function collectBelegEmailContext() {
    if (state.belegEmailKontext && state.belegEmailKontext.beleg_typ === 'MAHNUNG') {
        const template = document.getElementById('print-template');
        if (template && template.innerHTML.includes('Mahnung')) {
            const k = state.belegEmailKontext;
            const kundeMahn = state.kunden.find(ku => parseInt(ku.id) === parseInt(k.kundeId)) || {};
            return { ...k, kunde: kundeMahn };
        }
        state.belegEmailKontext = null;
    }

    const { currentDoc, customer } = collectERechnungExportData();
    const existingIdVal = document.getElementById('rechnung-id') ? document.getElementById('rechnung-id').value : '';
    const belegId = existingIdVal ? parseInt(existingIdVal) : null;
    if (!belegId) {
        return { fehler: 'Bitte speichern Sie den Beleg zuerst, bevor Sie ihn per E-Mail versenden.' };
    }
    return {
        beleg_typ: state.isAngebotMode ? 'ANGEBOT' : 'RECHNUNG',
        beleg_id: belegId,
        nr: currentDoc.nr,
        brutto: currentDoc.brutto,
        datum: currentDoc.datum,
        faelligkeit: currentDoc.faellig,
        kunde: customer,
        currentDoc
    };
}

async function openBelegEmailModal() {
    const kontext = collectBelegEmailContext();
    if (kontext.fehler) {
        showToast(kontext.fehler, 'error');
        return;
    }

    const chipEl = document.getElementById('email-modal-chip');
    chipEl.textContent = kontext.beleg_typ === 'MAHNUNG' ? `Mahnung Stufe ${kontext.mahnstufe || 1}` : (kontext.beleg_typ === 'ANGEBOT' ? 'Angebot' : 'Rechnung');
    document.getElementById('email-modal-nr').textContent = kontext.nr || '';

    const empfaengerEl = document.getElementById('email-modal-empfaenger');
    empfaengerEl.value = kontext.kunde.email || '';
    document.getElementById('email-modal-empfaenger-warnung').classList.toggle('hidden', !!kontext.kunde.email);

    document.getElementById('email-modal-cc').value = '';
    document.getElementById('email-modal-bcc').value = '';

    const firmenname = state.einstellungen.firmenname || '';
    let betreffVorschlag;
    if (kontext.beleg_typ === 'MAHNUNG') betreffVorschlag = `${kontext.mahnstufe || 1}. Mahnung zu Rechnung ${kontext.nr}`;
    else if (kontext.beleg_typ === 'ANGEBOT') betreffVorschlag = `Angebot ${kontext.nr} – ${firmenname}`;
    else betreffVorschlag = `Rechnung ${kontext.nr} – ${firmenname}`;
    document.getElementById('email-modal-betreff').value = betreffVorschlag;

    const signatur = state.einstellungen.email_signatur || '';
    const textVorschlag = fuelleEmailTemplate(kontext.beleg_typ, {
        kunde_name: kontext.kunde.name || '',
        nummer: kontext.nr || '',
        datum: kontext.datum || '',
        faelligkeit: kontext.faelligkeit || '',
        betrag_brutto: typeof kontext.brutto === 'number' ? kontext.brutto : parseFloat(kontext.brutto) || 0,
        firmenname
    });
    document.getElementById('email-modal-text').value = signatur ? `${textVorschlag}\n\n${signatur}` : textVorschlag;

    document.getElementById('email-modal-anhang').textContent =
        `${kontext.beleg_typ === 'MAHNUNG' ? 'Mahnung' : (kontext.beleg_typ === 'ANGEBOT' ? 'Angebot' : 'Rechnung')}_${String(kontext.nr).replace(/[\\/:*?"<>|]/g, '_')}.pdf`;

    document.getElementById('email-modal-pdf-kopie').checked = state.einstellungen.email_pdf_kopie_speichern === 'true';

    const fehlerEl = document.getElementById('email-modal-fehler');
    fehlerEl.classList.add('hidden');

    await ladeEmailKontoSelect();

    const m = document.getElementById('email-modal');
    m.dataset.belegTyp = kontext.beleg_typ;
    m.dataset.belegId = kontext.beleg_id;
    m.dataset.mahnstufe = kontext.mahnstufe || '';
    m.classList.remove('hidden');
    m.classList.add('flex');

    await ladeEmailHistorie(kontext.beleg_typ, kontext.beleg_id);
}

async function ladeEmailKontoSelect() {
    const sel = document.getElementById('email-modal-konto');
    const hinweisBtn = document.getElementById('email-modal-konto-hinweis');
    sel.innerHTML = '<option value="">– kein Konto vorhanden –</option>';
    let konten = [];
    try {
        konten = await window.api.getSmtpKonten();
    } catch (_e) { /* ignore */ }

    if (konten.length === 0) {
        hinweisBtn.classList.remove('hidden');
        return;
    }
    hinweisBtn.classList.add('hidden');

    sel.innerHTML = '';
    konten.forEach(konto => {
        const opt = document.createElement('option');
        opt.value = konto.id;
        opt.textContent = `${konto.name} (${konto.absender_email})`;
        if (konto.ist_standard) opt.selected = true;
        sel.appendChild(opt);
    });
}

function openSmtpSetupHinweis() {
    closeEmailModal();
    closePdfPreview();
    switchView('einstellungen');
    setTimeout(() => openSmtpKontoModal(), 300);
}

function closeEmailModal() {
    const m = document.getElementById('email-modal');
    m.classList.add('hidden');
    m.classList.remove('flex');
}

async function sendeBelegEmailFromModal() {
    const m = document.getElementById('email-modal');
    const fehlerEl = document.getElementById('email-modal-fehler');
    const empfaenger = document.getElementById('email-modal-empfaenger').value.trim();
    const betreff = document.getElementById('email-modal-betreff').value.trim();
    fehlerEl.classList.add('hidden');

    if (!empfaenger || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(empfaenger)) {
        fehlerEl.textContent = 'Bitte eine gültige Empfänger-E-Mail-Adresse eingeben.';
        fehlerEl.classList.remove('hidden');
        return;
    }
    if (!betreff) {
        fehlerEl.textContent = 'Bitte einen Betreff eingeben.';
        fehlerEl.classList.remove('hidden');
        return;
    }

    const payload = {
        beleg_typ: m.dataset.belegTyp,
        beleg_id: parseInt(m.dataset.belegId),
        mahnstufe: m.dataset.mahnstufe ? parseInt(m.dataset.mahnstufe) : undefined,
        empfaenger,
        cc: document.getElementById('email-modal-cc').value.trim() || undefined,
        bcc: document.getElementById('email-modal-bcc').value.trim() || undefined,
        betreff,
        text: document.getElementById('email-modal-text').value,
        konto_id: document.getElementById('email-modal-konto').value || undefined
    };

    const sendBtn = document.getElementById('email-modal-send-btn');
    sendBtn.disabled = true;
    try {
        let vorherigesTemplateHtml = null;
        if (payload.beleg_typ !== 'MAHNUNG' && typeof window.renderInvoiceForZugferdExport === 'function') {
            const { currentDoc, customer } = collectERechnungExportData();
            try {
                vorherigesTemplateHtml = await window.renderInvoiceForZugferdExport(currentDoc, customer);
            } catch (renderErr) {
                console.warn('E-Mail-Sichtseite konnte nicht gerendert werden:', renderErr);
            }
        }

        let res;
        try {
            res = await window.api.sendBelegEmail(payload);
        } finally {
            if (vorherigesTemplateHtml !== null && typeof window.restorePrintTemplateContent === 'function') {
                window.restorePrintTemplateContent(vorherigesTemplateHtml);
            }
        }

        if (res && res.success) {
            showToast(`E-Mail erfolgreich versendet an ${empfaenger}.`, 'success');
            closeEmailModal();
        } else {
            fehlerEl.textContent = (res && res.fehlermeldung) || 'Unbekannter Fehler beim Versand.';
            fehlerEl.classList.remove('hidden');
            showToast(`E-Mail-Versand fehlgeschlagen: ${(res && res.fehlermeldung) || ''}`, 'error');
        }
        await ladeEmailHistorie(payload.beleg_typ, payload.beleg_id);
    } catch (e) {
        fehlerEl.textContent = e.message || String(e);
        fehlerEl.classList.remove('hidden');
    } finally {
        sendBtn.disabled = false;
    }
}

function toggleEmailPdfKopie(checked) {
    state.einstellungen.email_pdf_kopie_speichern = checked ? 'true' : 'false';
    window.api.saveEinstellung('email_pdf_kopie_speichern', checked ? 'true' : 'false')
        .catch(e => console.warn('PDF-Kopie-Einstellung nicht gespeichert:', e));
}

async function ladeEmailHistorie(belegTyp, belegId) {
    const anzahlEl = document.getElementById('email-historie-anzahl');
    const body = document.getElementById('email-historie-body');
    body.innerHTML = '';
    let zeilen = [];
    try {
        zeilen = await window.api.getVersandhistorie(belegTyp, belegId);
    } catch (_e) { /* ignore */ }
    anzahlEl.textContent = String(zeilen.length);

    if (zeilen.length === 0) {
        body.innerHTML = '<tr><td colspan="5" class="px-2 py-3 text-center text-slate-400 italic">Noch keine E-Mails zu diesem Beleg versendet.</td></tr>';
        return;
    }

    zeilen.forEach(zeile => {
        const tr = document.createElement('tr');
        const statusBadge = zeile.status === 'VERSANDT'
            ? '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-green-100 text-green-800">Versandt</span>'
            : '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-red-100 text-red-700" title="' + sanitize(zeile.fehlermeldung || '') + '">Fehler</span>';
        const datumAnzeige = zeile.gesendet_am ? new Date(zeile.gesendet_am).toLocaleString('de-DE') : '-';
        tr.innerHTML = `
            <td class="px-2 py-1.5 whitespace-nowrap">${datumAnzeige}</td>
            <td class="px-2 py-1.5">${statusBadge}</td>
            <td class="px-2 py-1.5 truncate max-w-[160px]" title="${sanitize(zeile.empfaenger)}">${sanitize(zeile.empfaenger)}</td>
            <td class="px-2 py-1.5 text-center">${Number(zeile.versuche || 1)}</td>
            <td class="px-2 py-1.5 text-right"></td>`;
        const aktionTd = tr.lastElementChild;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = 'Versand wiederholen';
        btn.className = 'text-slate-400 hover:text-primary p-0.5 transition-colors';
        btn.innerHTML = '<span class="material-symbols-outlined text-[16px]">replay</span>';
        btn.onclick = () => wiederholeEmailVersandAusHistorie(Number(zeile.id), zeile.beleg_typ, Number(zeile.beleg_id));
        aktionTd.appendChild(btn);
        body.appendChild(tr);
    });
}

function toggleEmailHistorie() {
    const panel = document.getElementById('email-historie-panel');
    const chevron = document.getElementById('email-historie-chevron');
    panel.classList.toggle('hidden');
    chevron.style.transform = panel.classList.contains('hidden') ? '' : 'rotate(180deg)';
}

async function wiederholeEmailVersandAusHistorie(historieId, belegTyp, belegId) {
    try {
        const res = await window.api.wiederholeEmailVersand(historieId, null);
        if (res && res.success) {
            showToast('E-Mail erneut versendet.', 'success');
        } else {
            showToast(`Erneuter Versand fehlgeschlagen: ${(res && res.fehlermeldung) || ''}`, 'error');
        }
    } catch (e) {
        showToast(e.message || 'Wiederholen fehlgeschlagen.', 'error');
    }
    await ladeEmailHistorie(belegTyp, belegId);
}

window.openBelegEmailModal = openBelegEmailModal;
