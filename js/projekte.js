// --- Projekte Logic ---
function openProjektModal(id = null) {
    document.getElementById('projekt-modal').classList.remove('hidden');
    populateSelects();
    if (id) {
        const p = state.projekte.find(x => x.id === id);
        document.getElementById('projekt-modal-title').innerText = 'Projekt bearbeiten';
        document.getElementById('projekt-id').value = p.id;
        document.getElementById('projekt-name').value = p.name;
        document.getElementById('projekt-kunde').value = p.kundeId;
        document.getElementById('projekt-start').value = p.start || '';
        document.getElementById('projekt-ende').value = p.ende || '';
        document.getElementById('projekt-budget').value = p.budget || '';
        document.getElementById('projekt-sicherheitseinbehalt').value = p.sicherheitseinbehalt_prozent || '';
        document.getElementById('projekt-status').value = p.status || 'Geplant';
        document.getElementById('projekt-notizen').value = p.notizen || '';
    } else {
        document.getElementById('projekt-modal-title').innerText = 'Neues Projekt';
        document.getElementById('projekt-form').reset();
        document.getElementById('projekt-id').value = '';
        document.getElementById('projekt-status').value = 'Geplant';
        document.getElementById('projekt-sicherheitseinbehalt').value = '';
    }

    // Robust focus: first ensure webContents has OS-level focus, then focus the input
    const doFocus = async () => {
        try {
            if (window.api && window.api.focusWindow) {
                await window.api.focusWindow();
            }
        } catch (e) { /* ignore */ }
        requestAnimationFrame(() => {
            const nameInput = document.getElementById('projekt-name');
            if (nameInput) {
                nameInput.focus();
                nameInput.select();
            }
        });
    };
    setTimeout(doFocus, 200);
    setTimeout(doFocus, 450);
}

function closeProjektModal() {
    document.getElementById('projekt-modal').classList.add('hidden');
}

async function saveProjekt() {
    const id = document.getElementById('projekt-id').value;
    const name = document.getElementById('projekt-name').value;
    const kundeId = document.getElementById('projekt-kunde').value;
    const start = document.getElementById('projekt-start').value;
    const ende = document.getElementById('projekt-ende').value;
    const budget = parseFloat(document.getElementById('projekt-budget').value) || 0;
    const sicherheitseinbehalt_prozent = parseFloat(document.getElementById('projekt-sicherheitseinbehalt').value) || 0;
    const status = document.getElementById('projekt-status').value || 'Geplant';
    const notizen = document.getElementById('projekt-notizen').value;

    if (!name || !kundeId) {
        showToast('Bitte füllen Sie alle Pflichtfelder aus.', 'error');
        return;
    }

    const projektObj = { name, kundeId: parseInt(kundeId), start, ende, budget, status, notizen, sicherheitseinbehalt_prozent };

    if (id) {
        projektObj.id = parseInt(id);
    }

    try {
        await window.api.saveProjekt(projektObj);

        // Refresh state
        const newState = await window.api.getFullState();
        state.projekte = newState.projekte;

        closeProjektModal();
        if (document.getElementById('view-projekte') && !document.getElementById('view-projekte').classList.contains('hidden')) {
            renderProjekte();
        }
        showToast('Projekt gespeichert.', 'success');
    } catch (e) {
        console.error('Error saving projekt:', e);
        showToast('Fehler beim Speichern des Projekts.', 'error');
    }
}

function renderProjekte(searchQuery = '') {
    const grid = document.getElementById('projekte-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const kundenMap = new Map(state.kunden.map(k => [k.id, k]));

    let filteredProjekte = [...state.projekte];
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filteredProjekte = filteredProjekte.filter(p => {
            const kunde = kundenMap.get(p.kundeId) || { name: 'Unbekannt' };
            return p.name.toLowerCase().includes(q) || kunde.name.toLowerCase().includes(q);
        });
    }

    if (filteredProjekte.length === 0) {
        const div = document.createElement('div');
        div.className = 'col-span-full py-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200 border-dashed';
        div.textContent = 'Keine Projekte gefunden.';
        grid.appendChild(div);
        return;
    }

    const paidStornoOriginalNrs = new Set();
    const rechnungenByProjektId = new Map();

    for (const r of state.rechnungen) {
        if (r.status === 'Bezahlt' && r.nr && r.nr.startsWith('STORNO - ')) {
            paidStornoOriginalNrs.add(r.nr.substring(9));
        }

        if (r.projektId) {
            let pRechnungen = rechnungenByProjektId.get(r.projektId);
            if (!pRechnungen) {
                pRechnungen = [];
                rechnungenByProjektId.set(r.projektId, pRechnungen);
            }
            pRechnungen.push(r);
        }
    }

    filteredProjekte.forEach(p => {
        const kunde = kundenMap.get(p.kundeId) || { name: 'Unbekannt' };

        const allProjektRechnungen = rechnungenByProjektId.get(p.id) || [];
        const projektRechnungen = allProjektRechnungen.filter(r => {
            if (r.status === 'Entwurf') return false;
            if (r.status !== 'Storniert') return true;
            return paidStornoOriginalNrs.has(r.nr);
        });

        let umsatz = 0;
        projektRechnungen.forEach(r => umsatz += parseFloat(r.brutto || 0));

        const progressVal = p.budget > 0 ? Math.min(100, (umsatz / p.budget) * 100) : 0;

        let statusColor = 'bg-slate-100 text-slate-800 border-slate-200';
        if (p.status === 'Geplant') statusColor = 'bg-blue-100 text-blue-800 border-blue-200';
        else if (p.status === 'In Bearbeitung') statusColor = 'bg-amber-100 text-amber-800 border-amber-200';
        else if (p.status === 'Abgeschlossen') statusColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
        else if (p.status === 'Abgebrochen') statusColor = 'bg-red-100 text-red-800 border-red-200';

        const card = createProjektCardElement(p, kunde, umsatz, progressVal, statusColor);
        grid.appendChild(card);
    });
}

function createProjektCardElement(p, kunde, umsatz, progressVal, statusColor) {
    const card = document.createElement('div');
    card.className = 'bg-white rounded-xl border border-slate-200 shadow-sm p-6 hover:shadow-md transition-shadow relative overflow-hidden group cursor-pointer';
    card.onclick = () => showProjektDetails(p.id);

    // Decoration
    const decor = document.createElement('div');
    decor.className = 'absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-primary/10 to-transparent rounded-bl-full -z-0 opacity-50 group-hover:opacity-100 transition-opacity';
    card.appendChild(decor);

    // Header
    const headerDiv = document.createElement('div');
    headerDiv.className = 'flex justify-between items-start mb-4 relative z-10';
    const titleCont = document.createElement('div');
    const h4 = document.createElement('h4');
    h4.className = 'font-bold text-lg text-slate-800 tracking-tight leading-tight mb-1';
    h4.textContent = p.name;
    const pKunde = document.createElement('p');
    pKunde.className = 'text-sm text-slate-500 flex items-center gap-1.5 font-medium';
    const spanDom = document.createElement('span');
    spanDom.className = 'material-symbols-outlined text-[16px] text-slate-400';
    spanDom.textContent = 'domain';
    pKunde.appendChild(spanDom);
    pKunde.appendChild(document.createTextNode(kunde.name));
    titleCont.appendChild(h4);
    titleCont.appendChild(pKunde);
    headerDiv.appendChild(titleCont);
    const spanStatus = document.createElement('span');
    spanStatus.className = `inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider border ${statusColor}`;
    spanStatus.textContent = p.status || 'Aktiv';
    headerDiv.appendChild(spanStatus);
    card.appendChild(headerDiv);

    // Dates
    const datesGrid = document.createElement('div');
    datesGrid.className = 'grid grid-cols-2 gap-4 mb-5 text-sm relative z-10';
    const startDiv = document.createElement('div');
    startDiv.className = 'bg-slate-50 rounded-lg p-3 border border-slate-100';
    const pStartLbl = document.createElement('p');
    pStartLbl.className = 'text-slate-400 text-xs font-semibold mb-0.5 uppercase tracking-wider';
    pStartLbl.textContent = 'Start';
    const pStartVal = document.createElement('p');
    pStartVal.className = 'font-medium text-slate-700';
    pStartVal.textContent = p.start ? new Date(p.start).toLocaleDateString() : '-';
    startDiv.appendChild(pStartLbl);
    startDiv.appendChild(pStartVal);
    datesGrid.appendChild(startDiv);
    const endeDiv = document.createElement('div');
    endeDiv.className = 'bg-slate-50 rounded-lg p-3 border border-slate-100';
    const pEndeLbl = document.createElement('p');
    pEndeLbl.className = 'text-slate-400 text-xs font-semibold mb-0.5 uppercase tracking-wider';
    pEndeLbl.textContent = 'Ende';
    const pEndeVal = document.createElement('p');
    pEndeVal.className = 'font-medium text-slate-700';
    pEndeVal.textContent = p.ende ? new Date(p.ende).toLocaleDateString() : '-';
    endeDiv.appendChild(pEndeLbl);
    endeDiv.appendChild(pEndeVal);
    datesGrid.appendChild(endeDiv);
    card.appendChild(datesGrid);

    // Progress
    const progCont = document.createElement('div');
    progCont.className = 'space-y-3 relative z-10 border-t border-slate-100 pt-4';
    const umsatzFlex = document.createElement('div');
    umsatzFlex.className = 'flex justify-between text-sm font-medium';
    const spanUmLbl = document.createElement('span');
    spanUmLbl.className = 'text-slate-600';
    spanUmLbl.textContent = 'Umsatz / Rentabilität';
    const spanUmVal = document.createElement('span');
    spanUmVal.className = 'text-slate-800';
    spanUmVal.textContent = formatCurrency(umsatz);
    umsatzFlex.appendChild(spanUmLbl);
    umsatzFlex.appendChild(spanUmVal);
    progCont.appendChild(umsatzFlex);

    const pbCont = document.createElement('div');
    const pbFlex = document.createElement('div');
    pbFlex.className = 'flex justify-between text-[11px] font-bold text-slate-500 mb-1 uppercase tracking-wider';
    const spanPbLbl = document.createElement('span');
    spanPbLbl.textContent = 'Fortschritt ggü. Budget';
    const spanPbVal = document.createElement('span');
    spanPbVal.textContent = `${progressVal.toFixed(0)}%`;
    pbFlex.appendChild(spanPbLbl);
    pbFlex.appendChild(spanPbVal);
    pbCont.appendChild(pbFlex);
    const pbBg = document.createElement('div');
    pbBg.className = 'w-full bg-slate-100 rounded-full h-2';
    const pbFill = document.createElement('div');
    pbFill.className = (progressVal > 100 ? 'bg-red-500' : 'bg-primary') + ' h-2 rounded-full';
    pbFill.style.width = `${Math.min(100, progressVal)}%`;
    pbBg.appendChild(pbFill);
    pbCont.appendChild(pbBg);
    const pbFooter = document.createElement('div');
    pbFooter.className = 'flex justify-between text-xs text-slate-400 mt-1.5';
    const spanMin = document.createElement('span');
    spanMin.textContent = formatCurrency(0);
    const spanMax = document.createElement('span');
    spanMax.textContent = `Budget: ${formatCurrency(p.budget)}`;
    pbFooter.appendChild(spanMin);
    pbFooter.appendChild(spanMax);
    pbCont.appendChild(pbFooter);
    progCont.appendChild(pbCont);
    card.appendChild(progCont);

    return card;
}

// --- Project Details View ---
function updateProjektHeaderUI(p, kunde) {
    document.getElementById('pd-name').innerText = p.name;
    const pdKunde = document.getElementById('pd-kunde');
    pdKunde.innerHTML = '';
    const spanDom = document.createElement('span');
    spanDom.className = 'material-symbols-outlined text-[16px]';
    spanDom.textContent = 'domain';
    pdKunde.appendChild(spanDom);
    pdKunde.appendChild(document.createTextNode(` ${kunde.name}`));
}

function updateProjektStatusUI(p) {
    let statusColor = 'bg-slate-100 text-slate-800 border-slate-200';
    if (p.status === 'Geplant') statusColor = 'bg-blue-100 text-blue-800 border-blue-200';
    else if (p.status === 'In Bearbeitung') statusColor = 'bg-amber-100 text-amber-800 border-amber-200';
    else if (p.status === 'Abgeschlossen') statusColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
    else if (p.status === 'Abgebrochen') statusColor = 'bg-red-100 text-red-800 border-red-200';

    const badge = document.getElementById('pd-status');
    badge.className = `inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider border ${statusColor}`;
    badge.innerText = p.status || 'Geplant';
}

function updateProjektNotizenUI(p) {
    const notizenCont = document.getElementById('pd-notizen-container');
    if (p.notizen) {
        document.getElementById('pd-notizen').innerText = p.notizen;
        notizenCont.classList.remove('hidden');
    } else {
        notizenCont.classList.add('hidden');
    }
}

function showProjektDetails(id) {
    const p = state.projekte.find(x => x.id === id);
    if (!p) return;
    const kunde = state.kunden.find(k => k.id === p.kundeId) || { name: 'Unbekannt' };

    updateProjektHeaderUI(p, kunde);
    updateProjektStatusUI(p);
    updateProjektNotizenUI(p);

    // Set Edit Action
    document.getElementById('pd-edit-btn').onclick = () => openProjektModal(p.id);

    // Filter Documents
    const pRechnungen = state.rechnungen.filter(r => r.projektId === p.id);
    const pAngebote = state.angebote.filter(a => a.projektId === p.id);

    const paidStornoOriginalNrs = new Set();
    for (const r of state.rechnungen) {
        if (r.status === 'Bezahlt' && r.nr && r.nr.startsWith('STORNO - ')) {
            paidStornoOriginalNrs.add(r.nr.substring(9));
        }
    }

    const umsatz = calculateProjektUmsatz(pRechnungen, paidStornoOriginalNrs);
    const budget = p.budget || 0;
    const progressVal = budget > 0 ? (umsatz / budget) * 100 : 0;
    const rest = Math.max(0, budget - umsatz);

    updateProjektProgressUI(umsatz, budget, progressVal, rest);

    // Store the ID globally for quick actions
    window.currentViewProjektId = id;

    populateProjektRechnungenTable(pRechnungen);
    populateProjektAngeboteTable(pAngebote);

    switchView('projekt-details');
}

function calculateProjektUmsatz(pRechnungen = [], paidStornoOriginalNrs = new Set()) {
    let umsatz = 0;

    if (!Array.isArray(pRechnungen)) {
        return umsatz;
    }

    pRechnungen.forEach(r => {
        // Any invoice that isn't drafted counts.
        // Storniert invoices are included if they have a corresponding STORNO invoice that is Bezahlt,
        // which ensures they offset each other to 0.
        let include = false;
        if (r.status !== 'Entwurf') {
            if (r.status !== 'Storniert') {
                include = true;
            } else {
                include = paidStornoOriginalNrs && typeof paidStornoOriginalNrs.has === 'function' && paidStornoOriginalNrs.has(r.nr);
            }
        }
        
        if (include) {
            umsatz += parseFloat(r.brutto || 0);
        }
    });
    return umsatz;
}

function updateProjektProgressUI(umsatz, budget, progressVal, rest) {
    document.getElementById('pd-umsatz').innerText = formatCurrency(umsatz);
    document.getElementById('pd-budget').innerText = budget > 0 ? formatCurrency(budget) : '-';

    const pb = document.getElementById('pd-progress-bar');
    pb.style.width = `${Math.min(100, progressVal)}%`;
    pb.className = `h-4 rounded-full transition-all duration-700 ease-out ${progressVal > 100 ? 'bg-red-500' : 'bg-primary'}`;

    document.getElementById('pd-progress-text').innerText = `${progressVal.toFixed(0)}%`;
    document.getElementById('pd-progress-text').className = `text-xl font-bold ${progressVal > 100 ? 'text-red-500' : 'text-slate-700'}`;
    document.getElementById('pd-verbraucht').innerText = formatCurrency(umsatz);
    document.getElementById('pd-rest').innerText = budget > 0 ? formatCurrency(rest) : '-';
}

function populateProjektRechnungenTable(pRechnungen) {
    const rBody = document.getElementById('pd-rechnungen-body');
    const rEmpty = document.getElementById('pd-rechnungen-empty');
    rBody.innerHTML = '';
    if (pRechnungen.length > 0) {
        pRechnungen.forEach(r => {
            const tr = document.createElement('tr');
            tr.className = 'group cursor-pointer hover:bg-slate-50 transition-colors';
            tr.onclick = () => { switchView('rechnungen'); openRechnungModal(r.id); };

            const tdNr = document.createElement('td');
            tdNr.className = 'px-4 py-3 font-mono text-slate-500 text-[11px]';
            tdNr.textContent = r.nr;
            tr.appendChild(tdNr);

            const tdDate = document.createElement('td');
            tdDate.className = 'px-4 py-3 text-slate-600';
            tdDate.textContent = new Date(r.datum).toLocaleDateString();
            tr.appendChild(tdDate);

            const tdStatus = document.createElement('td');
            tdStatus.className = 'px-4 py-3';
            const spanStatus = document.createElement('span');
            spanStatus.className = 'px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-slate-100 text-slate-700';
            spanStatus.textContent = r.status;
            tdStatus.appendChild(spanStatus);
            tr.appendChild(tdStatus);

            const tdSum = document.createElement('td');
            tdSum.className = 'px-4 py-3 text-right font-medium text-slate-800';
            tdSum.textContent = formatCurrency(r.brutto);
            tr.appendChild(tdSum);

            const tdEye = document.createElement('td');
            tdEye.className = 'px-4 py-3 text-right';
            const spanEye = document.createElement('span');
            spanEye.className = 'material-symbols-outlined text-[18px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity';
            spanEye.textContent = 'visibility';
            tdEye.appendChild(spanEye);
            tr.appendChild(tdEye);

            rBody.appendChild(tr);
        });
        rBody.parentElement.classList.remove('hidden');
        rEmpty.classList.add('hidden');
    } else {
        rBody.parentElement.classList.add('hidden');
        rEmpty.classList.remove('hidden');
    }
}

function populateProjektAngeboteTable(pAngebote) {
    const aBody = document.getElementById('pd-angebote-body');
    const aEmpty = document.getElementById('pd-angebote-empty');
    aBody.innerHTML = '';
    if (pAngebote.length > 0) {
        pAngebote.forEach(a => {
            const tr = document.createElement('tr');
            tr.className = 'group cursor-pointer hover:bg-slate-50 transition-colors';
            tr.onclick = () => generatePdf(a.id, true);

            const tdNr = document.createElement('td');
            tdNr.className = 'px-4 py-3 font-mono text-slate-500 text-[11px]';
            tdNr.textContent = a.nr;
            tr.appendChild(tdNr);

            const tdDate = document.createElement('td');
            tdDate.className = 'px-4 py-3 text-slate-600 text-center';
            tdDate.textContent = new Date(a.datum).toLocaleDateString();
            tr.appendChild(tdDate);

            const tdStatus = document.createElement('td');
            tdStatus.className = 'px-4 py-3';
            const spanStatus = document.createElement('span');
            spanStatus.className = 'px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-slate-100 text-slate-700';
            spanStatus.textContent = a.status;
            tdStatus.appendChild(spanStatus);
            tr.appendChild(tdStatus);

            const tdSum = document.createElement('td');
            tdSum.className = 'px-4 py-3 text-right font-medium text-slate-800';
            tdSum.textContent = formatCurrency(a.brutto);
            tr.appendChild(tdSum);

            const tdEye = document.createElement('td');
            tdEye.className = 'px-4 py-3 text-right';
            const spanEye = document.createElement('span');
            spanEye.className = 'material-symbols-outlined text-[18px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity';
            spanEye.textContent = 'visibility';
            spanEye.title = 'Als PDF ansehen';
            tdEye.appendChild(spanEye);
            tr.appendChild(tdEye);

            aBody.appendChild(tr);
        });
        aBody.parentElement.classList.remove('hidden');
        aEmpty.classList.add('hidden');
    } else {
        aBody.parentElement.classList.add('hidden');
        aEmpty.classList.remove('hidden');
    }
}

function createRechnungForProjekt() {
    closeProjektDetails();
    switchView('rechnungen');
    openRechnungModal();
    const pId = window.currentViewProjektId;
    if (pId) {
        const p = state.projekte.find(x => x.id === pId);
        if (p) {
            document.getElementById('rechnung-projekt').value = p.id;
            document.getElementById('rechnung-kunde').value = p.kundeId;
            handleKundeSelect({ target: { value: p.kundeId } });
        }
    }
}

function createAngebotForProjekt() {
    closeProjektDetails();
    switchView('angebote');
    openAngebotModal();
    const pId = window.currentViewProjektId;
    if (pId) {
        const p = state.projekte.find(x => x.id === pId);
        if (p) {
            document.getElementById('rechnung-projekt').value = p.id;
            document.getElementById('rechnung-kunde').value = p.kundeId;
            handleKundeSelect({ target: { value: p.kundeId } });
        }
    }
}

function closeProjektDetails() {
    document.getElementById('view-projekt-details').classList.add('hidden');
    document.getElementById('view-projekte').classList.remove('hidden');
}

if (typeof module !== 'undefined' && module.exports) { module.exports = { calculateProjektUmsatz }; }
