// --- Rechnung Erstellen Logic ---

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

        // Mark original as Storniert and lock it
        original.status = 'Storniert';
        original.isLocked = true;

        // Deep copy positions and negative them
        const stornoPositionen = JSON.parse(JSON.stringify(original.positionen)).map(p => {
            p.menge = p.menge * -1; // Negative quantity makes everything negative
            return p;
        });

        const stornoNr = "STORNO - " + original.nr;
        const today = new Date().toISOString().split('T')[0];

        const stornoDoc = {
            id: null,
            type: 'rechnung',
            nr: stornoNr,
            datum: today,
            faellig: today, // Storno is immediate
            kundeId: original.kundeId,
            projektId: original.projektId,
            positionen: stornoPositionen,
            netto: original.netto * -1,
            steuer: original.steuer * -1,
            brutto: original.brutto * -1,
            globalRabattAbzug: (original.globalRabattAbzug || 0) * -1,
            anzahlung: 0, // Doesn't apply to Storno usually
            zahlbetrag: (original.zahlbetrag || original.brutto) * -1,
            status: 'Bezahlt', // Storno is effectively settled
            isLocked: true // Storno inherently locked
        };

        try {
            // Save updated original invoice
            await window.api.saveDocument(original);
            // Save new storno doc
            await window.api.saveDocument(stornoDoc);

            // Resync all frontend state from DB to get updated stock and IDs
            const newState = await window.api.getFullState();
            state.angebote = newState.angebote;
            state.rechnungen = newState.rechnungen;
            state.artikel = newState.artikel;

            if (document.getElementById('view-dashboard') && !document.getElementById('view-dashboard').classList.contains('hidden')) {
                renderDashboard();
            } else if (document.getElementById('view-rechnungen') && !document.getElementById('view-rechnungen').classList.contains('hidden')) {
                renderRechnungen();
            }
            showToast(`Stornorechnung ${stornoNr} wurde erfolgreich erstellt.`, 'success');
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
        rech.status = 'Bezahlt';
        try {
            await window.api.saveDocument(rech);
            showToast(`Rechnung ${rech.nr} als bezahlt markiert.`, 'success');
            
            // Refresh UI
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

    // Defaults
    const today = new Date();
    document.getElementById('rechnung-datum').value = today.toISOString().split('T')[0];
    const later = new Date(today);
    const zZiel = parseInt(state.einstellungen.zahlungsziel) || 14;
    later.setDate(today.getDate() + zZiel);
    document.getElementById('rechnung-faellig').value = later.toISOString().split('T')[0];

    // Generate next NR (dynamically finding the highest to prevent 'undefined')
    const currentMaxRechnung = state.rechnungen.reduce((max, r) => Math.max(max, parseInt(r.nr.split('-').pop()) || 0), 0);
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

    // Fill data
    document.getElementById('rechnung-kunde').value = existing.kundeId;
    document.getElementById('rechnung-nr').value = existing.nr;
    document.getElementById('rechnung-datum').value = existing.datum;
    document.getElementById('rechnung-faellig').value = existing.faellig;
    document.getElementById('rechnung-status').value = existing.status;

    document.getElementById('rechnung-art').value = existing.rechnungsart || 'REGULAER';
    document.getElementById('rechnung-leistungszeitraum-von').value = existing.leistungszeitraum_von || '';
    document.getElementById('rechnung-leistungszeitraum-bis').value = existing.leistungszeitraum_bis || '';
    document.getElementById('rechnung-baustellen-adresse').value = existing.baustellen_adresse || '';
    document.getElementById('rechnung-vob-vereinbart').checked = !!existing.vob_vereinbart;
    document.getElementById('rechnung-ist-privatkunde').checked = !!existing.ist_privatkunde;
    document.getElementById('rechnung-unterliegt-bauabzugsteuer').checked = !!existing.unterliegt_bauabzugsteuer;
    document.getElementById('rechnung-13b-ustg').checked = !!existing.unterliegt_13b;
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
    document.getElementById('rechnung-nr').value = existing.nr;
    document.getElementById('rechnung-datum').value = existing.datum;
    document.getElementById('rechnung-faellig').value = existing.faellig;
    document.getElementById('rechnung-status').value = existing.status;
    
    document.getElementById('rechnung-art').value = existing.rechnungsart || 'REGULAER';
    document.getElementById('rechnung-leistungszeitraum-von').value = existing.leistungszeitraum_von || '';
    document.getElementById('rechnung-leistungszeitraum-bis').value = existing.leistungszeitraum_bis || '';
    document.getElementById('rechnung-baustellen-adresse').value = existing.baustellen_adresse || '';
    document.getElementById('rechnung-vob-vereinbart').checked = !!existing.vob_vereinbart;
    document.getElementById('rechnung-ist-privatkunde').checked = !!existing.ist_privatkunde;
    document.getElementById('rechnung-unterliegt-bauabzugsteuer').checked = !!existing.unterliegt_bauabzugsteuer;
    document.getElementById('rechnung-13b-ustg').checked = !!existing.unterliegt_13b;
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

function setEingabeModus(mode) {
    document.getElementById('rechnung-eingabemodus').value = mode;

    const btnNetto = document.getElementById('btn-mode-netto');
    const btnBrutto = document.getElementById('btn-mode-brutto');

    if (!btnNetto || !btnBrutto) return;

    if (mode === 'netto') {
        btnNetto.className = 'flex-1 py-1.5 text-xs font-bold rounded-md transition-all shadow-sm bg-primary text-white';
        btnBrutto.className = 'flex-1 py-1.5 text-xs font-bold rounded-md transition-all text-slate-600 hover:text-slate-800';
    } else {
        btnBrutto.className = 'flex-1 py-1.5 text-xs font-bold rounded-md transition-all shadow-sm bg-primary text-white';
        btnNetto.className = 'flex-1 py-1.5 text-xs font-bold rounded-md transition-all text-slate-600 hover:text-slate-800';
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
    const currentMaxAngebot = state.angebote.reduce((max, a) => Math.max(max, parseInt(a.nr.split('-').pop()) || 0), 0);
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

        detailsBox.appendChild(div);
    } else {
        const p = document.createElement('p');
        p.className = 'text-slate-400 italic text-center text-sm';
        p.textContent = 'Kein Kunde ausgewählt';
        detailsBox.appendChild(p);
    }
}

// Line Items
function addRechnungPosition() {
    state.currentRechnungPositionen.push({
        id: Date.now(), // temp id
        artikelId: '',
        name: '', // Allow custom Name
        menge: 1,
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
        } else {
            pos.preis = 0;
            pos.rabatt = 0;
        }
    } else if (field === 'menge') {
        pos.menge = parseFloat(value) || 0;
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
    tdIdx.className = 'px-6 py-3 text-center text-slate-400 font-mono text-xs';
    tdIdx.textContent = index + 1;
    tr.appendChild(tdIdx);

    // Article search cell
    const tdArt = document.createElement('td');
    tdArt.className = 'px-6 py-3';
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

    // Menge cell
    const tdMenge = document.createElement('td');
    tdMenge.className = 'px-6 py-3';
    const inputMenge = document.createElement('input');
    inputMenge.type = 'number';
    inputMenge.min = '0';
    inputMenge.step = 'any';
    inputMenge.value = pos.menge;
    inputMenge.onblur = (e) => handlePositionChange(pos.id, 'menge', e.target.value);
    inputMenge.className = 'w-full px-3 py-1.5 border border-slate-300 rounded text-sm text-right focus:ring-1 focus:ring-primary focus:border-primary';
    tdMenge.appendChild(inputMenge);
    tr.appendChild(tdMenge);

    // Preis cell
    const tdPreis = document.createElement('td');
    tdPreis.className = 'px-6 py-3';
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
    tdMwst.className = 'px-3 py-3';
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
    tdRabatt.className = 'px-3 py-3';
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
    tdTotal.className = 'px-6 py-3 text-right font-medium text-slate-800';
    tdTotal.textContent = formatCurrency(pos.menge * pos.preis * (1 - (pos.rabatt || 0) / 100));
    tr.appendChild(tdTotal);

    // Action cell
    const tdAction = document.createElement('td');
    tdAction.className = 'px-6 py-3 text-center';
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
    let positionenNetto = 0;
    let positionenBrutto = 0;
    let taxes = { 19: 0, 7: 0 };
    const mode = document.getElementById('rechnung-eingabemodus') ? document.getElementById('rechnung-eingabemodus').value : 'netto';

    state.currentRechnungTotals13bNetto = 0;
    state.currentRechnungTotalsNormalNetto = 0;

    state.currentRechnungPositionen.forEach(pos => {
        const rabatt = parseFloat(pos.rabatt) || 0;
        let rowNetto = 0;
        let rowBrutto = 0;
        let tax = 0;

        const isGlobal13b = document.getElementById('rechnung-13b-ustg') && document.getElementById('rechnung-13b-ustg').checked;
        const pos13b = isGlobal13b && pos.is13b;

        if (mode === 'netto') {
            rowNetto = (pos.menge * pos.preis) * (1 - rabatt / 100);
            tax = pos13b ? 0 : (rowNetto * (pos.mwst / 100));
            rowBrutto = rowNetto + tax;
        } else {
            rowBrutto = (pos.menge * pos.preis) * (1 - rabatt / 100);
            if (pos13b) {
                rowNetto = rowBrutto;
                tax = 0;
            } else {
                rowNetto = rowBrutto / (1 + pos.mwst / 100);
                tax = rowBrutto - rowNetto;
            }
        }

        positionenNetto += rowNetto;
        positionenBrutto += rowBrutto;
        
        if (pos13b) {
            state.currentRechnungTotals13bNetto += rowNetto;
        } else {
            state.currentRechnungTotalsNormalNetto += rowNetto;
            if (pos.mwst > 0) {
                if (!taxes[pos.mwst]) taxes[pos.mwst] = 0;
                taxes[pos.mwst] += tax;
            }
        }
    });

    document.getElementById('rechnung-zwischensumme').innerText = formatCurrency(mode === 'netto' ? positionenNetto : positionenBrutto);

    // Global Discount
    const globalRabattVal = parseFloat(document.getElementById('rechnung-global-rabatt').value) || 0;
    const globalRabattType = document.getElementById('rechnung-global-rabatt-type').value;

    let abzug = 0;
    const baseForGlobalRabatt = mode === 'netto' ? positionenNetto : positionenBrutto;
    
    if (globalRabattVal > 0) {
        if (globalRabattType === '%') {
            abzug = baseForGlobalRabatt * (globalRabattVal / 100);
        } else {
            abzug = globalRabattVal;
        }
    }

    // Recalculate taxes proportionally if there's a global discount
    let totalTax = 0;
    const taxContainer = document.getElementById('rechnung-steuern-container');
    taxContainer.innerHTML = '';

    let nettoNachRabatt = 0;
    let bruttoNachRabatt = 0;
    let sicherheitseinbehaltNetto = 0;
    let sicherheitseinbehaltProzent = 0;
    let verrechnungenSummeNetto = 0;

    // Calculate Verrechnungen Sum
    if (state.currentRechnungVerrechnungen && state.currentRechnungVerrechnungen.length > 0) {
        verrechnungenSummeNetto = state.currentRechnungVerrechnungen.reduce((sum, v) => sum + v.abzugsbetrag_netto, 0);
    }

    if (mode === 'netto') {
        nettoNachRabatt = positionenNetto - abzug;
        if (nettoNachRabatt < 0) nettoNachRabatt = 0;
        const rabattFaktor = positionenNetto > 0 ? (nettoNachRabatt / positionenNetto) : 1;

        // Calculate Sicherheitseinbehalt
        const projektSelect = document.getElementById('rechnung-projekt');
        if (projektSelect && projektSelect.value) {
            const projektId = parseInt(projektSelect.value);
            const projekt = state.projekte.find(p => parseInt(p.id) === projektId);
            if (projekt && projekt.sicherheitseinbehalt_prozent > 0) {
                sicherheitseinbehaltProzent = projekt.sicherheitseinbehalt_prozent;
                sicherheitseinbehaltNetto = nettoNachRabatt * (sicherheitseinbehaltProzent / 100);
            }
        }

        let steuerpflichtigesNetto = nettoNachRabatt - sicherheitseinbehaltNetto - verrechnungenSummeNetto;
        if (steuerpflichtigesNetto < 0) steuerpflichtigesNetto = 0;
        const taxableRatio = nettoNachRabatt > 0 ? (steuerpflichtigesNetto / nettoNachRabatt) : 0;

        totalTax = 0;
        taxContainer.innerHTML = '';

        Object.keys(taxes).forEach(rate => {
            const baseTax = taxes[rate] * rabattFaktor; // Tax after global discount
            const adjustedTax = baseTax * taxableRatio; // Tax after sicherheitseinbehalt & verrechnungen
            totalTax += adjustedTax;
            
            const div = document.createElement('div');
            div.className = 'flex justify-between items-center text-slate-500';
            const spanLabel = document.createElement('span');
            spanLabel.textContent = `zzgl. ${rate}% MwSt.` + (taxableRatio < 1 ? ` (auf gemindertes Netto)` : '');
            const spanVal = document.createElement('span');
            spanVal.className = 'font-mono';
            spanVal.textContent = formatCurrency(adjustedTax);
            div.appendChild(spanLabel);
            div.appendChild(spanVal);
            taxContainer.appendChild(div);
        });

        bruttoNachRabatt = steuerpflichtigesNetto + totalTax;

        // UI Updates for deductions
        const sichRow = document.getElementById('rechnung-sicherheitseinbehalt-row');
        if (sicherheitseinbehaltNetto > 0) {
            if (sichRow) sichRow.classList.remove('hidden');
            document.getElementById('rechnung-sicherheitseinbehalt-label').innerText = `Sicherheitseinbehalt Netto (${sicherheitseinbehaltProzent}%)`;
            document.getElementById('rechnung-sicherheitseinbehalt-wert').innerText = '-' + formatCurrency(sicherheitseinbehaltNetto);
        } else if (sichRow) {
            sichRow.classList.add('hidden');
        }

        const verrRow = document.getElementById('rechnung-verrechnungen-row');
        if (verrechnungenSummeNetto > 0) {
            if (verrRow) verrRow.classList.remove('hidden');
            const verrWert = document.getElementById('rechnung-verrechnungen-wert');
            if (verrWert) verrWert.innerText = '-' + formatCurrency(verrechnungenSummeNetto);
        } else if (verrRow) {
            verrRow.classList.add('hidden');
        }

        var sicherheitseinbehalt = sicherheitseinbehaltNetto;

        if (totalTax === 0) {
            const div = document.createElement('div');
            div.className = 'text-right text-xs text-slate-400 italic';
            div.textContent = 'Keine Steuern berechnet';
            taxContainer.appendChild(div);
        }
        
    } else {
        // Mode Brutto
        bruttoNachRabatt = positionenBrutto - abzug;
        if (bruttoNachRabatt < 0) bruttoNachRabatt = 0;
        const rabattFaktor = positionenBrutto > 0 ? (bruttoNachRabatt / positionenBrutto) : 1;

        let totalTaxBase = 0;
        Object.keys(taxes).forEach(rate => {
            totalTaxBase += (taxes[rate] * rabattFaktor);
        });
        nettoNachRabatt = bruttoNachRabatt - totalTaxBase;

        const projektSelect = document.getElementById('rechnung-projekt');
        if (projektSelect && projektSelect.value) {
            const projektId = parseInt(projektSelect.value);
            const projekt = state.projekte.find(p => parseInt(p.id) === projektId);
            if (projekt && projekt.sicherheitseinbehalt_prozent > 0) {
                sicherheitseinbehaltProzent = projekt.sicherheitseinbehalt_prozent;
                sicherheitseinbehaltNetto = nettoNachRabatt * (sicherheitseinbehaltProzent / 100);
            }
        }

        let steuerpflichtigesNetto = nettoNachRabatt - sicherheitseinbehaltNetto - verrechnungenSummeNetto;
        if (steuerpflichtigesNetto < 0) steuerpflichtigesNetto = 0;
        const taxableRatio = nettoNachRabatt > 0 ? (steuerpflichtigesNetto / nettoNachRabatt) : 0;

        totalTax = 0;
        taxContainer.innerHTML = '';

        Object.keys(taxes).forEach(rate => {
            const baseTax = taxes[rate] * rabattFaktor; 
            const adjustedTax = baseTax * taxableRatio; 
            totalTax += adjustedTax;
            
            const div = document.createElement('div');
            div.className = 'flex justify-between items-center text-slate-500';
            const spanLabel = document.createElement('span');
            spanLabel.textContent = `darin enthaltene ${rate}% MwSt.` + (taxableRatio < 1 ? ` (angepasst)` : '');
            const spanVal = document.createElement('span');
            spanVal.className = 'font-mono';
            spanVal.textContent = formatCurrency(adjustedTax);
            div.appendChild(spanLabel);
            div.appendChild(spanVal);
            taxContainer.appendChild(div);
        });

        bruttoNachRabatt = steuerpflichtigesNetto + totalTax;

        // UI Updates for deductions
        const sichRow = document.getElementById('rechnung-sicherheitseinbehalt-row');
        if (sicherheitseinbehaltNetto > 0) {
            if (sichRow) sichRow.classList.remove('hidden');
            document.getElementById('rechnung-sicherheitseinbehalt-label').innerText = `Sicherheitseinbehalt Netto (${sicherheitseinbehaltProzent}%)`;
            document.getElementById('rechnung-sicherheitseinbehalt-wert').innerText = '-' + formatCurrency(sicherheitseinbehaltNetto);
        } else if (sichRow) {
            sichRow.classList.add('hidden');
        }

        const verrRow = document.getElementById('rechnung-verrechnungen-row');
        if (verrechnungenSummeNetto > 0) {
            if (verrRow) verrRow.classList.remove('hidden');
            const verrWert = document.getElementById('rechnung-verrechnungen-wert');
            if (verrWert) verrWert.innerText = '-' + formatCurrency(verrechnungenSummeNetto);
        } else if (verrRow) {
            verrRow.classList.add('hidden');
        }

        var sicherheitseinbehalt = sicherheitseinbehaltNetto;

        if (totalTax === 0) {
            const div = document.createElement('div');
            div.className = 'text-right text-xs text-slate-400 italic';
            div.textContent = 'Keine Steuern berechnet';
            taxContainer.appendChild(div);
        }
    }

    // Prepayment / Anzahlung
    const anzahlung = parseFloat(document.getElementById('rechnung-anzahlung').value) || 0;
    document.getElementById('rechnung-anzahlung-wert').innerText = anzahlung > 0 ? '-' + formatCurrency(anzahlung) : '-';

    // The bruttoNachRabatt already has the sicherheitseinbehalt and verrechnungen deducted.
    const zahlbetrag = bruttoNachRabatt - anzahlung;

    document.getElementById('rechnung-rabatt-wert').innerText = '-' + formatCurrency(abzug);
    document.getElementById('rechnung-netto').innerText = formatCurrency(nettoNachRabatt);
    document.getElementById('rechnung-brutto').innerText = formatCurrency(bruttoNachRabatt);
    document.getElementById('rechnung-zahlbetrag').innerText = formatCurrency(Math.max(0, zahlbetrag));

    // Calculate total tax value for saving
    let savingTotalTax = 0;
    const taxSpans = taxContainer.querySelectorAll('span.font-mono');
    taxSpans.forEach(span => {
        let val = span.textContent.replace('€', '').replace(/\./g, '').replace(',', '.').trim();
        savingTotalTax += parseFloat(val) || 0;
    });

    // Store calculated on state for saving
    state.currentRechnungTotals = {
        netto: nettoNachRabatt,
        steuer: savingTotalTax,
        brutto: bruttoNachRabatt,
        rabattAbzug: abzug,
        anzahlung,
        sicherheitseinbehalt,
        kumulierte_leistung_netto: nettoNachRabatt, // Save the Leistungsstand netto
        zahlbetrag: Math.max(0, zahlbetrag),
        netto13b: state.currentRechnungTotals13bNetto,
        nettoNormal: state.currentRechnungTotalsNormalNetto
    };
}


async function saveRechnung() {
    const kundeId = document.getElementById('rechnung-kunde').value;
    const projektId = document.getElementById('rechnung-projekt').value;
    const datum = document.getElementById('rechnung-datum').value;
    const faellig = document.getElementById('rechnung-faellig').value;
    const status = document.getElementById('rechnung-status').value || 'Ausstehend';
    const nr = document.getElementById('rechnung-nr').value;
    const existingIdVal = document.getElementById('rechnung-id').value;
    const existingId = existingIdVal ? parseInt(existingIdVal) : null;

    // Validation
    if (!kundeId) {
        showToast('Bitte wählen Sie einen Kunden aus.', 'error');
        return;
    }
    if (state.currentRechnungPositionen.length === 0) {
        showToast('Bitte fügen Sie mindestens eine Position hinzu.', 'error');
        return;
    }

    // Check for empty articles or missing descriptions
    if (state.currentRechnungPositionen.some(p => !p.artikelId && !p.name)) {
        showToast('Bitte wählen Sie für alle Positionen einen Artikel aus oder geben Sie eine Beschreibung ein.', 'error');
        return;
    }

    const existing = existingId ? (state.isAngebotMode ? state.angebote.find(a => a.id === existingId) : state.rechnungen.find(r => r.id === existingId)) : null;

    const newDoc = {
        id: existingId ? existingId : null,
        nr,
        datum,
        faellig,
        kundeId: parseInt(kundeId),
        projektId: projektId ? parseInt(projektId) : null,
        positionen: [...state.currentRechnungPositionen], // shallow copy fine here
        netto: state.currentRechnungTotals.netto,
        steuer: state.currentRechnungTotals.steuer,
        brutto: state.currentRechnungTotals.brutto,
        globalRabattAbzug: state.currentRechnungTotals.rabattAbzug,
        globalRabattType: document.getElementById('rechnung-global-rabatt-type').value,
        globalRabattValue: parseFloat(document.getElementById('rechnung-global-rabatt').value) || 0,
        anzahlung: state.currentRechnungTotals.anzahlung,
        zahlbetrag: state.currentRechnungTotals.zahlbetrag,
        status: status,
        eingabemodus: document.getElementById('rechnung-eingabemodus').value,
        rechnungsart: document.getElementById('rechnung-art').value,
        leistungszeitraum_von: document.getElementById('rechnung-leistungszeitraum-von').value,
        leistungszeitraum_bis: document.getElementById('rechnung-leistungszeitraum-bis').value,
        baustellen_adresse: document.getElementById('rechnung-baustellen-adresse').value,
        vob_vereinbart: document.getElementById('rechnung-vob-vereinbart').checked ? 1 : 0,
        ist_privatkunde: document.getElementById('rechnung-ist-privatkunde').checked ? 1 : 0,
        unterliegt_bauabzugsteuer: document.getElementById('rechnung-unterliegt-bauabzugsteuer').checked ? 1 : 0,
        unterliegt_13b: document.getElementById('rechnung-13b-ustg').checked ? 1 : 0,
        vortext: document.getElementById('rechnung-vortext').value,
        fusstext: document.getElementById('rechnung-fusstext').value,
        sicherheitseinbehalt: state.currentRechnungTotals.sicherheitseinbehalt || 0,
        kumulierte_leistung_netto: state.currentRechnungTotals.kumulierte_leistung_netto || 0,
        verrechnungen: [...state.currentRechnungVerrechnungen],
        isLocked: existing ? (existing.isLocked || false) : false
    };

    newDoc.type = state.isAngebotMode ? 'angebot' : 'rechnung';

    try {
        const savedId = await window.api.saveDocument(newDoc);

        // Reload state from DB to get fresh IDs and updated lists
        const newState = await window.api.getFullState();
        state.angebote = newState.angebote;
        state.rechnungen = newState.rechnungen;
        state.artikel = newState.artikel; // might have updated inventory

        closeRechnungModal();
        showToast('Dokument erfolgreich gespeichert.', 'success');

        // Re-render views
        if (state.isAngebotMode) {
            if (document.getElementById('view-angebote') && !document.getElementById('view-angebote').classList.contains('hidden')) {
                renderAngebote();
            } else if (document.getElementById('view-projekt-details') && !document.getElementById('view-projekt-details').classList.contains('hidden')) {
                // if we are in project details, reload the project to reflect changes
                if (state.currentProjektId) {
                    openProjektDetails(state.currentProjektId);
                }
            }
        } else {
            if (document.getElementById('view-dashboard') && !document.getElementById('view-dashboard').classList.contains('hidden')) {
                renderDashboard();
            } else if (document.getElementById('view-rechnungen') && !document.getElementById('view-rechnungen').classList.contains('hidden')) {
                renderRechnungen();
            } else if (document.getElementById('view-projekt-details') && !document.getElementById('view-projekt-details').classList.contains('hidden')) {
                if (state.currentProjektId) {
                    openProjektDetails(state.currentProjektId);
                }
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

    const availableRechnungen = state.rechnungen.filter(r => 
        r.projektId == projektId && 
        r.status !== 'Entwurf' && 
        r.isLocked && 
        r.id != currentId &&
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
    const isHandwerk = (state.einstellungen.unternehmensart || 'handwerk') === 'handwerk';
    const handwerkSection = document.getElementById('rechnung-handwerk-section');
    if (handwerkSection) {
        if (isHandwerk) {
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
