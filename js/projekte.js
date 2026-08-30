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
    switchProjektTab('finanzen');
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

function handleGAEBFileUpload(event) {
    const file = event.target.files ? event.target.files[0] : null;
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const content = e.target.result;
        if (typeof GAEBEngine !== 'undefined') {
            try {
                const parsed = GAEBEngine.parseGAEBXML(content);
                renderGAEBPositionsTable(parsed.items || []);
                showToast(`GAEB X83 (${parsed.items ? parsed.items.length : 0} Positionen) erfolgreich importiert.`, 'success');
            } catch (err) {
                console.error('GAEB Import error:', err);
                showToast('Fehler beim Parsen der GAEB-Datei.', 'error');
            }
        } else {
            showToast('GAEB-Engine nicht verfügbar.', 'error');
        }
    };
    reader.readAsText(file);
}

function renderGAEBPositionsTable(items) {
    const tbody = document.getElementById('gaeb-table-body');
    const container = document.getElementById('gaeb-table-container');
    if (!tbody || !container) return;

    tbody.innerHTML = '';
    if (!items || items.length === 0) {
        container.classList.add('hidden');
        return;
    }

    items.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition-colors';

        const tdOz = document.createElement('td');
        tdOz.className = 'px-4 py-2.5 font-mono text-xs font-semibold text-primary';
        tdOz.textContent = item.oz || '-';
        tr.appendChild(tdOz);

        const tdTitle = document.createElement('td');
        tdTitle.className = 'px-4 py-2.5 font-medium text-slate-800';
        tdTitle.textContent = item.name || item.kurztext || '';
        tr.appendChild(tdTitle);

        const tdMenge = document.createElement('td');
        tdMenge.className = 'px-4 py-2.5 text-center font-mono tabular-nums text-slate-700';
        tdMenge.textContent = item.menge || 1;
        tr.appendChild(tdMenge);

        const tdEinheit = document.createElement('td');
        tdEinheit.className = 'px-4 py-2.5 text-center text-xs text-slate-500 font-semibold';
        tdEinheit.textContent = item.einheit || 'Stk.';
        tr.appendChild(tdEinheit);

        const tdEp = document.createElement('td');
        tdEp.className = 'px-4 py-2.5 text-right font-mono tabular-nums text-slate-700';
        tdEp.textContent = formatCurrency(item.preis || 0);
        tr.appendChild(tdEp);

        const tdGp = document.createElement('td');
        tdGp.className = 'px-4 py-2.5 text-right font-mono tabular-nums font-bold text-slate-900';
        const gp = (item.menge || 1) * (item.preis || 0);
        tdGp.textContent = formatCurrency(gp);
        tr.appendChild(tdGp);

        tbody.appendChild(tr);
    });

    container.classList.remove('hidden');
}

function switchProjektTab(tabKey) {
    document.querySelectorAll('.pd-tab-btn').forEach(btn => {
        btn.classList.remove('border-primary', 'text-primary');
        btn.classList.add('border-transparent', 'text-slate-500');
    });
    document.querySelectorAll('.pd-tab-panel').forEach(panel => {
        panel.classList.add('hidden');
        panel.classList.remove('flex');
    });

    const activeBtn = document.getElementById(`pd-tab-btn-${tabKey}`);
    const activePanel = document.getElementById(`pd-panel-${tabKey}`);

    if (activeBtn && activePanel) {
        activeBtn.classList.remove('border-transparent', 'text-slate-500');
        activeBtn.classList.add('border-primary', 'text-primary');
        activePanel.classList.remove('hidden');
        activePanel.classList.add('flex');
    }

    const pId = window.currentViewProjektId;
    if (!pId) return;

    if (tabKey === 'aufmass') {
        loadProjektAufmassBlaetter(pId);
    } else if (tabKey === 'nachtraege') {
        loadProjektNachtraege(pId);
    } else if (tabKey === 'bautagebuch') {
        loadProjektBautagebuch(pId);
        loadProjektAbnahmen(pId);
    } else if (tabKey === 'controlling') {
        loadProjektControlling(pId);
    } else if (tabKey === 'efb') {
        loadProjektEFB(pId);
    } else if (tabKey === 'kalkulation') {
        loadProjektKalkulation(pId);
    } else if (tabKey === 'maengel') {
        loadProjektMaengel(pId);
    }
}

async function loadProjektEFB(projectId) {
    if (!projectId) return;
    if (!window.efbViewInstance && window.EFBView) {
        window.efbViewInstance = new window.EFBView();
    }
    if (window.efbViewInstance) {
        await window.efbViewInstance.loadAndRender(projectId);
    }
}

async function loadProjektKalkulation(projectId) {
    if (!projectId) return;
    if (!window.kalkulationViewInstance && window.KalkulationView) {
        window.kalkulationViewInstance = new window.KalkulationView('pd-panel-kalkulation');
    }
    if (window.kalkulationViewInstance) {
        await window.kalkulationViewInstance.loadAndRender(projectId);
    }
}

async function loadProjektMaengel(projectId) {
    if (!projectId) return;
    if (!window.maengelViewInstance && window.MaengelView) {
        window.maengelViewInstance = new window.MaengelView('pd-panel-maengel');
    } else if (window.maengelViewInstance) {
        window.maengelViewInstance.containerId = 'pd-panel-maengel';
    }
    if (window.maengelViewInstance) {
        await window.maengelViewInstance.loadAndRender({ projektId: projectId });
    }
}

// --- AUFMASSCENTER SUB-REGISTER (TOPKONTOR VORBILD) ---
let currentAufmassSubTab = 'info';
let activeSplitOz = null;
let activeSplitPosition = null;
let currentSplitZeilen = [];
let splitPositionsData = [];

function switchAufmassSubTab(subTabKey) {
    currentAufmassSubTab = subTabKey;
    const btnInfo = document.getElementById('pd-subtab-btn-aufmass-info');
    const btnPos = document.getElementById('pd-subtab-btn-aufmass-pos');
    const panelInfo = document.getElementById('pd-subpanel-aufmass-info');
    const panelPos = document.getElementById('pd-subpanel-aufmass-pos');

    if (subTabKey === 'info') {
        if (btnInfo) { btnInfo.classList.add('border-primary', 'text-primary'); btnInfo.classList.remove('border-transparent', 'text-slate-500'); }
        if (btnPos) { btnPos.classList.remove('border-primary', 'text-primary'); btnPos.classList.add('border-transparent', 'text-slate-500'); }
        if (panelInfo) panelInfo.classList.remove('hidden');
        if (panelPos) { panelPos.classList.add('hidden'); panelPos.classList.remove('flex'); }
        loadProjektAufmassBlaetter(window.currentViewProjektId);
    } else {
        if (btnPos) { btnPos.classList.add('border-primary', 'text-primary'); btnPos.classList.remove('border-transparent', 'text-slate-500'); }
        if (btnInfo) { btnInfo.classList.remove('border-primary', 'text-primary'); btnInfo.classList.add('border-transparent', 'text-slate-500'); }
        if (panelInfo) panelInfo.classList.add('hidden');
        if (panelPos) { panelPos.classList.remove('hidden'); panelPos.classList.add('flex'); }
        loadSplitViewPositions(window.currentViewProjektId);
    }
}

async function loadSplitViewPositions(projectId) {
    if (!projectId) return;
    const p = state.projekte.find(x => x.id === projectId);
    const tbody = document.getElementById('split-positions-body');
    const empty = document.getElementById('split-positions-empty');
    const countEl = document.getElementById('split-pos-count');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Collect positions from project GAEB / documents / blaetter
    splitPositionsData = [];
    const pAngebote = (state.dokumente || []).filter(d => d.projekt_id === projectId && (d.typ === 'Angebot' || d.typ === 'Auftragsbestätigung'));
    
    pAngebote.forEach(doc => {
        (doc.positionen || []).forEach(pos => {
            if (pos.oz || pos.name) {
                splitPositionsData.push({
                    oz: pos.oz || '01.01.0010',
                    name: pos.name || pos.kurztext || 'Position',
                    mengeSoll: pos.menge || 1,
                    einheit: pos.einheit || 'm²',
                    mengeIst: 0
                });
            }
        });
    });

    // Fallback if no documents yet: load positions from existing Aufmaßblätter
    if (splitPositionsData.length === 0 && window.api && window.api.getAufmassBlaetter) {
        const blaetter = await window.api.getAufmassBlaetter(projectId);
        const ozMap = {};
        (blaetter || []).forEach(b => {
            (b.zeilen || []).forEach(z => {
                if (!ozMap[z.oz_code]) {
                    ozMap[z.oz_code] = { oz: z.oz_code, name: z.bezeichnung || 'Position', mengeSoll: 100, einheit: z.einheit || 'm²', mengeIst: 0 };
                    splitPositionsData.push(ozMap[z.oz_code]);
                }
                ozMap[z.oz_code].mengeIst += (z.ergebnis || 0) * (z.vorzeichen || 1);
            });
        });
    }

    if (splitPositionsData.length === 0) {
        // Standard Dummy-Positions to get started immediately
        splitPositionsData = [
            { oz: '01.01.0010', name: 'Baustelleneinrichtung & Vorhaltung', mengeSoll: 1, einheit: 'psch', mengeIst: 1 },
            { oz: '01.01.0020', name: 'Bodenbelag Fliesen Feinsteinzeug EG', mengeSoll: 120, einheit: 'm²', mengeIst: 0 },
            { oz: '01.02.0010', name: 'Innenputz Q3 mineralisch Wände', mengeSoll: 350, einheit: 'm²', mengeIst: 0 }
        ];
    }

    if (countEl) countEl.innerText = `${splitPositionsData.length} Pos.`;
    if (empty) empty.classList.add('hidden');

    splitPositionsData.forEach((item, idx) => {
        const tr = document.createElement('tr');
        tr.id = `split-pos-row-${idx}`;
        tr.className = `cursor-pointer hover:bg-primary/5 transition-colors ${idx === 0 ? 'bg-primary/10 font-semibold' : ''}`;
        tr.onclick = () => selectSplitPosition(item.oz, item.name, item.mengeSoll, item.einheit, idx);

        tr.innerHTML = `
            <td class="px-3 py-2 font-mono font-bold text-primary">${item.oz}</td>
            <td class="px-3 py-2 text-slate-800 truncate max-w-[140px]">${item.name}</td>
            <td class="px-3 py-2 text-right font-mono text-slate-500">${item.mengeSoll} ${item.einheit}</td>
            <td class="px-3 py-2 text-right font-mono font-bold text-emerald-600" id="split-pos-ist-${item.oz}">${item.mengeIst.toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
    });

    if (splitPositionsData.length > 0) {
        const first = splitPositionsData[0];
        selectSplitPosition(first.oz, first.name, first.mengeSoll, first.einheit, 0);
    }
}

async function selectSplitPosition(oz, name, mengeSoll, einheit, rowIdx) {
    activeSplitOz = oz;
    activeSplitPosition = { oz, name, mengeSoll, einheit };

    document.querySelectorAll('#split-positions-body tr').forEach(r => r.classList.remove('bg-primary/10', 'font-semibold'));
    const row = document.getElementById(`split-pos-row-${rowIdx}`);
    if (row) row.classList.add('bg-primary/10', 'font-semibold');

    const titleEl = document.getElementById('detail-active-title');
    const ozEl = document.getElementById('detail-active-oz');
    if (titleEl) titleEl.innerText = `${name} (Soll: ${mengeSoll} ${einheit})`;
    if (ozEl) ozEl.innerText = `OZ ${oz}`;

    // Load existing Aufmaß-Zeilen for this OZ from project
    currentSplitZeilen = [];
    if (window.api && window.api.getAufmassBlaetter) {
        const blaetter = await window.api.getAufmassBlaetter(window.currentViewProjektId);
        (blaetter || []).forEach(b => {
            (b.zeilen || []).filter(z => z.oz_code === oz).forEach(z => {
                currentSplitZeilen.push({ ...z });
            });
        });
    }

    if (currentSplitZeilen.length === 0) {
        currentSplitZeilen = [
            { oz_code: oz, bezeichnung: 'Raum 1 / Fläche', rechenansatz: '5.50 * 4.20', ergebnis: 23.10, einheit: einheit, vorzeichen: 1 }
        ];
    }

    renderSplitDetailZeilenTable();
}

function addSplitAufmassZeile() {
    if (!activeSplitOz) return;
    currentSplitZeilen.push({
        oz_code: activeSplitOz,
        bezeichnung: '',
        rechenansatz: '',
        ergebnis: 0,
        einheit: activeSplitPosition ? activeSplitPosition.einheit : 'm²',
        vorzeichen: 1
    });
    renderSplitDetailZeilenTable();
}

function removeSplitAufmassZeile(idx) {
    currentSplitZeilen.splice(idx, 1);
    renderSplitDetailZeilenTable();
}

function toggleSplitZeileVorzeichen(idx) {
    if (currentSplitZeilen[idx]) {
        currentSplitZeilen[idx].vorzeichen = (currentSplitZeilen[idx].vorzeichen === -1) ? 1 : -1;
        renderSplitDetailZeilenTable();
    }
}

function renderSplitDetailZeilenTable() {
    const tbody = document.getElementById('split-detail-zeilen-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    currentSplitZeilen.forEach((z, idx) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/80 transition-colors';
        const isMinus = z.vorzeichen === -1;
        const vorzeichenBtn = isMinus
            ? `<button type="button" onclick="toggleSplitZeileVorzeichen(${idx})" class="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-rose-100 text-rose-700 border border-rose-300 hover:bg-rose-200 transition-all shadow-xs" title="Abzug (−). Klicken für Zuschlag (+)"><span class="font-mono text-sm leading-none font-bold">−</span> Abzug</button>`
            : `<button type="button" onclick="toggleSplitZeileVorzeichen(${idx})" class="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-300 hover:bg-emerald-200 transition-all shadow-xs" title="Zuschlag (+). Klicken für Abzug (−)"><span class="font-mono text-sm leading-none font-bold">+</span> Plus</button>`;

        const lineErgebnis = (z.ergebnis || 0) * (z.vorzeichen || 1);
        const ergClass = lineErgebnis < 0 ? 'text-rose-600' : 'text-slate-800';

        tr.innerHTML = `
            <td class="px-2.5 py-2 font-mono text-slate-400 text-center text-xs">${idx + 1}</td>
            <td class="px-2.5 py-2">
                <input type="text" value="${z.bezeichnung || ''}" onchange="currentSplitZeilen[${idx}].bezeichnung = this.value" class="w-full px-2.5 py-1.5 border border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary rounded-md text-xs text-slate-800 placeholder-slate-400" placeholder="z.B. EG Wohnbereich / Wand">
            </td>
            <td class="px-2.5 py-2">
                <input type="text" id="split-formula-input-${idx}" value="${z.rechenansatz || ''}" oninput="calcSplitZeileFormula(${idx}, this.value)" class="w-full px-2.5 py-1.5 border border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-md font-mono text-xs text-slate-900 bg-white placeholder-slate-400" placeholder="z.B. 4.50 * 3.20 oder L*B*H">
            </td>
            <td class="px-2.5 py-2 text-center">
                ${vorzeichenBtn}
            </td>
            <td class="px-2.5 py-2 text-right font-mono font-bold ${ergClass} text-xs" id="split-erg-${idx}">
                ${lineErgebnis.toFixed(2)}
            </td>
            <td class="px-1.5 py-2 text-center">
                <button type="button" onclick="removeSplitAufmassZeile(${idx})" class="text-slate-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors" title="Zeile löschen">
                    <span class="material-symbols-outlined text-[16px]">delete</span>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    recalcSplitDetailTotal();
}

function calcSplitZeileFormula(idx, formulaStr) {
    if (currentSplitZeilen[idx]) {
        currentSplitZeilen[idx].rechenansatz = formulaStr;
        const res = window.AufmassController ? window.AufmassController.evaluateFormula(formulaStr) : 0;
        currentSplitZeilen[idx].ergebnis = res;
        const ergEl = document.getElementById(`split-erg-${idx}`);
        if (ergEl) {
            const lineErg = res * (currentSplitZeilen[idx].vorzeichen || 1);
            ergEl.innerText = lineErg.toFixed(2);
            ergEl.className = lineErg < 0 ? 'px-2.5 py-2 text-right font-mono font-bold text-rose-600 text-xs' : 'px-2.5 py-2 text-right font-mono font-bold text-slate-800 text-xs';
        }
        recalcSplitDetailTotal();
    }
}

function recalcSplitDetailTotal() {
    let subtotal = currentSplitZeilen.reduce((acc, z) => acc + (z.ergebnis || 0) * (z.vorzeichen || 1), 0);
    const verschnitt = parseFloat(document.getElementById('split-verschnitt-input')?.value) || 0;
    const finalTotal = subtotal * (1 + verschnitt / 100);

    const totalEl = document.getElementById('split-detail-total-result');
    const unit = activeSplitPosition ? activeSplitPosition.einheit : 'm²';
    if (totalEl) totalEl.innerText = `${finalTotal.toFixed(2)} ${unit}`;

    if (activeSplitOz) {
        const istCell = document.getElementById(`split-pos-ist-${activeSplitOz}`);
        if (istCell) istCell.innerText = finalTotal.toFixed(2);
    }
}

async function saveSplitDetailAufmass() {
    const pId = window.currentViewProjektId;
    if (!pId || !activeSplitOz) {
        showToast('Keine Position ausgewählt.', 'warning');
        return;
    }

    const blattData = {
        project_id: pId,
        blatt_nummer: `POS-${activeSplitOz.replace(/[^0-9A-Za-z]/g, '')}`,
        titel: `Aufmaß Position ${activeSplitOz} (${activeSplitPosition ? activeSplitPosition.name : ''})`,
        status: 'VERIFIED'
    };

    try {
        const savedId = await window.api.saveAufmassBlatt(blattData, currentSplitZeilen);
        showToast(`Detailaufmaß für OZ ${activeSplitOz} erfolgreich gespeichert.`, 'success');
        loadProjektAufmassBlaetter(pId);
    } catch (e) {
        console.error('Error saving split detail aufmass:', e);
        showToast('Fehler beim Speichern des Detailaufmaßes.', 'error');
    }
}

// --- WIZARD: AUFMASS-ERSTELLUNG (2 SCHRITTE) ---
let currentWizardStep = 1;
let currentAufmassTyp = 'FREI';
let currentAufmassVariante = 'TEIL';

function selectAufmassWizardTyp(typ) {
    currentAufmassTyp = typ || 'FREI';
    const cards = document.querySelectorAll('.wiz-card-typ');
    cards.forEach(card => {
        const cardTyp = card.getAttribute('data-aufmass-typ');
        const radio = card.querySelector('input[type="radio"]');
        const icon = card.querySelector('.wiz-card-icon');
        if (cardTyp === currentAufmassTyp) {
            card.className = 'wiz-card-typ border-2 border-primary ring-2 ring-primary/20 bg-primary/5 rounded-xl p-4 cursor-pointer hover:border-primary hover:shadow-md transition-all flex flex-col items-center text-center shadow-xs';
            if (radio) radio.checked = true;
            if (icon) {
                icon.classList.remove('text-slate-500', 'text-slate-600');
                icon.classList.add('text-primary');
            }
        } else {
            card.className = 'wiz-card-typ border-2 border-slate-200 bg-white rounded-xl p-4 cursor-pointer hover:border-primary hover:shadow-md transition-all flex flex-col items-center text-center';
            if (radio) radio.checked = false;
            if (icon) {
                icon.classList.remove('text-primary');
                icon.classList.add('text-slate-500');
            }
        }
    });
}

function selectAufmassWizardVariante(variante) {
    currentAufmassVariante = (variante === 'TEILAUFMASS' ? 'TEIL' : (variante === 'EINZELAUFMASS' ? 'EINZEL' : (variante === 'SCHLUSSAUFMASS' ? 'SCHLUSS' : variante))) || 'TEIL';
    const cards = document.querySelectorAll('.wiz-card-var');
    cards.forEach(card => {
        const cardVar = card.getAttribute('data-aufmass-variante');
        const radio = card.querySelector('input[type="radio"]');
        const isSelected = (cardVar === currentAufmassVariante) || (cardVar === 'TEIL' && currentAufmassVariante === 'TEILAUFMASS') || (cardVar === 'EINZEL' && currentAufmassVariante === 'EINZELAUFMASS') || (cardVar === 'SCHLUSS' && currentAufmassVariante === 'SCHLUSSAUFMASS');
        if (isSelected) {
            card.className = 'wiz-card-var border-2 border-primary ring-2 ring-primary/20 bg-primary/5 rounded-xl p-3 cursor-pointer hover:border-primary hover:shadow-md transition-all flex flex-col shadow-xs';
            if (radio) radio.checked = true;
        } else {
            card.className = 'wiz-card-var border-2 border-slate-200 bg-white rounded-xl p-3 cursor-pointer hover:border-primary hover:shadow-md transition-all flex flex-col';
            if (radio) radio.checked = false;
        }
    });
}

function openAufmassWizardModal() {
    const modal = document.getElementById('aufmass-wizard-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    currentWizardStep = 1;
    selectAufmassWizardTyp('FREI');
    selectAufmassWizardVariante('TEIL');

    document.getElementById('wizard-step-1-content').classList.remove('hidden');
    document.getElementById('wizard-step-2-content').classList.add('hidden');
    document.getElementById('wiz-btn-back').classList.add('hidden');
    document.getElementById('wiz-btn-next').classList.remove('hidden');
    document.getElementById('wiz-btn-finish').classList.add('hidden');
    const fpBtn = document.getElementById('wiz-btn-finish-print');
    if (fpBtn) fpBtn.classList.add('hidden');

    document.getElementById('wiz-nummer').value = `AUF-${new Date().getFullYear()}-001`;
    document.getElementById('wiz-datum').value = new Date().toISOString().split('T')[0];
    document.getElementById('wiz-titel').value = '';
    document.getElementById('wiz-bemerkung').value = '';

    updateWizardBadges();
}

function closeAufmassWizardModal() {
    const modal = document.getElementById('aufmass-wizard-modal');
    if (modal) modal.classList.add('hidden');
}

function wizardNextStep() {
    currentWizardStep = 2;
    document.getElementById('wizard-step-1-content').classList.add('hidden');
    document.getElementById('wizard-step-2-content').classList.remove('hidden');
    document.getElementById('wiz-btn-back').classList.remove('hidden');
    document.getElementById('wiz-btn-next').classList.add('hidden');
    document.getElementById('wiz-btn-finish').classList.remove('hidden');
    const fpBtn = document.getElementById('wiz-btn-finish-print');
    if (fpBtn) fpBtn.classList.remove('hidden');
    updateWizardBadges();
}

function wizardPrevStep() {
    currentWizardStep = 1;
    document.getElementById('wizard-step-1-content').classList.remove('hidden');
    document.getElementById('wizard-step-2-content').classList.add('hidden');
    document.getElementById('wiz-btn-back').classList.add('hidden');
    document.getElementById('wiz-btn-next').classList.remove('hidden');
    document.getElementById('wiz-btn-finish').classList.add('hidden');
    const fpBtn = document.getElementById('wiz-btn-finish-print');
    if (fpBtn) fpBtn.classList.add('hidden');
    updateWizardBadges();
}

function updateWizardBadges() {
    const b1 = document.getElementById('wizard-step-badge-1');
    const b2 = document.getElementById('wizard-step-badge-2');
    if (currentWizardStep === 1) {
        if (b1) { b1.className = 'w-6 h-6 rounded-full bg-primary text-white font-bold flex items-center justify-center text-[11px]'; }
        if (b2) { b2.className = 'w-6 h-6 rounded-full bg-slate-200 text-slate-600 font-bold flex items-center justify-center text-[11px]'; }
    } else {
        if (b1) { b1.className = 'w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-[11px]'; }
        if (b2) { b2.className = 'w-6 h-6 rounded-full bg-primary text-white font-bold flex items-center justify-center text-[11px]'; }
    }
}

async function finishAufmassWizard(andPrint = false) {
    const pId = window.currentViewProjektId;
    const nummer = document.getElementById('wiz-nummer').value || 'AUF-001';
    const titel = document.getElementById('wiz-titel').value || 'Neues Aufmaß';
    const typ = currentAufmassTyp || document.querySelector('input[name="wiz-aufmass-typ"]:checked')?.value || 'FREI';
    let rawVar = currentAufmassVariante || document.querySelector('input[name="wiz-aufmass-var"]:checked')?.value || 'TEIL';
    let variante = rawVar;
    if (variante === 'TEIL') variante = 'TEILAUFMASS';
    if (variante === 'EINZEL') variante = 'EINZELAUFMASS';
    if (variante === 'SCHLUSS') variante = 'SCHLUSSAUFMASS';
    const bemerkung = document.getElementById('wiz-bemerkung')?.value || '';

    const typLabels = {
        'FREI': 'Freies Aufmaß',
        'SPALTEN': 'Spaltenaufmaß',
        'RAUM': 'Raumaufmaß'
    };
    const varLabels = {
        'TEILAUFMASS': 'Teilaufmaß',
        'EINZELAUFMASS': 'Einzelaufmaß',
        'SCHLUSSAUFMASS': 'Schlussaufmaß',
        'TEIL': 'Teilaufmaß',
        'EINZEL': 'Einzelaufmaß',
        'SCHLUSS': 'Schlussaufmaß'
    };

    const blattData = {
        project_id: pId,
        blatt_nummer: nummer,
        titel: `${titel} [${typLabels[typ] || typ} - ${varLabels[variante] || variante}]`,
        status: 'DRAFT'
    };

    let defaultZeilen = [];
    if (typ === 'SPALTEN') {
        defaultZeilen = [
            { oz_code: '01.01.0010', bezeichnung: 'Wandfläche Nord', formel_reb: '01', rechenansatz: '5.50 * 2.80', ergebnis: 15.40, einheit: 'm²', vorzeichen: 1 },
            { oz_code: '01.01.0010', bezeichnung: 'Wandfläche Süd', formel_reb: '01', rechenansatz: '5.50 * 2.80', ergebnis: 15.40, einheit: 'm²', vorzeichen: 1 },
            { oz_code: '01.01.0010', bezeichnung: 'Fensterausschnitt Abzug', formel_reb: '01', rechenansatz: '1.20 * 1.40', ergebnis: 1.68, einheit: 'm²', vorzeichen: -1 }
        ];
    } else if (typ === 'RAUM') {
        defaultZeilen = [
            { oz_code: '01.01.0010', bezeichnung: 'EG - Wohnbereich', formel_reb: '91', rechenansatz: '6.20 * 4.80', ergebnis: 29.76, einheit: 'm²', vorzeichen: 1 },
            { oz_code: '01.01.0010', bezeichnung: 'EG - Küche', formel_reb: '91', rechenansatz: '3.50 * 3.10', ergebnis: 10.85, einheit: 'm²', vorzeichen: 1 },
            { oz_code: '01.01.0010', bezeichnung: 'OG - Bad', formel_reb: '91', rechenansatz: '2.80 * 2.40', ergebnis: 6.72, einheit: 'm²', vorzeichen: 1 }
        ];
    } else {
        defaultZeilen = [
            { oz_code: '01.01.0010', bezeichnung: bemerkung ? `Fläche (${bemerkung})` : 'Flächenansatz', formel_reb: '91', rechenansatz: '4.50 * 3.20', ergebnis: 14.40, einheit: 'm²', vorzeichen: 1 }
        ];
    }

    try {
        const savedId = await window.api.saveAufmassBlatt(blattData, defaultZeilen);
        showToast('Aufmaß über Assistent erfolgreich erstellt.', 'success');
        closeAufmassWizardModal();
        if (pId) loadProjektAufmassBlaetter(pId);

        if (andPrint && savedId) {
            await printAufmassBlattAction(savedId);
        } else {
            switchAufmassSubTab('pos');
        }
    } catch (e) {
        console.error('Error creating wizard aufmass:', e);
        showToast('Fehler beim Erstellen des Aufmaßes.', 'error');
    }
}

// --- FORMELAUSWAHL- & PARAMETER-ASSISTENT ---
let activeTargetFormulaInputId = null;

function openFormelassistentModal(targetInputId = null) {
    activeTargetFormulaInputId = targetInputId;
    const modal = document.getElementById('formelassistent-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    onFormelVorlageChange();
}

function closeFormelassistentModal() {
    const modal = document.getElementById('formelassistent-modal');
    if (modal) modal.classList.add('hidden');
}

function onFormelVorlageChange() {
    const select = document.getElementById('fa-vorlage-select');
    const formulaInput = document.getElementById('fa-formel-text');
    if (!select || !formulaInput) return;

    if (select.value !== 'custom') {
        formulaInput.value = select.value;
    }
    parseAndBuildParameterInputs(formulaInput.value);
}

function onCustomFormulaInput() {
    const formulaInput = document.getElementById('fa-formel-text');
    if (formulaInput) parseAndBuildParameterInputs(formulaInput.value);
}

function parseAndBuildParameterInputs(formulaStr) {
    const grid = document.getElementById('fa-dynamische-parameter-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const matches = formulaStr.match(/\[([a-zA-Z0-9_]+)\]/g) || [];
    const uniqueParams = [...new Set(matches.map(m => m.replace(/[[\]]/g, '')))];

    if (uniqueParams.length === 0) {
        grid.innerHTML = '<span class="text-slate-400 italic col-span-2">Keine Variablen in der Formel vorhanden.</span>';
        recalcFormelassistentLive();
        return;
    }

    uniqueParams.forEach(param => {
        const div = document.createElement('div');
        div.innerHTML = `
            <label class="block text-xs font-semibold text-slate-600 mb-1 capitalize">${param.replace(/_/g, ' ')}</label>
            <input type="number" step="0.01" value="2.50" id="fa-param-${param}" oninput="recalcFormelassistentLive()" class="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs">
        `;
        grid.appendChild(div);
    });

    recalcFormelassistentLive();
}

function recalcFormelassistentLive() {
    const formulaInput = document.getElementById('fa-formel-text')?.value || '';
    let resolvedFormula = formulaInput;

    const matches = formulaInput.match(/\[([a-zA-Z0-9_]+)\]/g) || [];
    matches.forEach(m => {
        const param = m.replace(/[[\]]/g, '');
        const val = parseFloat(document.getElementById(`fa-param-${param}`)?.value) || 0;
        resolvedFormula = resolvedFormula.replace(m, val);
    });

    const previewAnsatz = document.getElementById('fa-live-ansatz-preview');
    const previewErg = document.getElementById('fa-live-ergebnis-preview');
    if (previewAnsatz) previewAnsatz.innerText = resolvedFormula;

    const erg = window.AufmassController ? window.AufmassController.evaluateFormula(resolvedFormula) : 0;
    if (previewErg) previewErg.innerText = erg.toFixed(2);
}

function applyFormelassistentResult() {
    const resolved = document.getElementById('fa-live-ansatz-preview')?.innerText || '';
    if (activeTargetFormulaInputId) {
        const targetEl = document.getElementById(activeTargetFormulaInputId);
        if (targetEl) {
            targetEl.value = resolved;
            targetEl.dispatchEvent(new Event('input'));
        }
    } else if (currentSplitZeilen.length > 0) {
        const lastIdx = currentSplitZeilen.length - 1;
        currentSplitZeilen[lastIdx].rechenansatz = resolved;
        const res = window.AufmassController ? window.AufmassController.evaluateFormula(resolved) : 0;
        currentSplitZeilen[lastIdx].ergebnis = res;
        renderSplitDetailZeilenTable();
    }
    closeFormelassistentModal();
}

// --- DOKUMENTENFLUSS: AUFMASS IN DOKUMENT ÜBERGEBEN ---
function openAufmassUebergabeModal() {
    const modal = document.getElementById('aufmass-uebergabe-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    const select = document.getElementById('uebergabe-doc-select');
    select.innerHTML = '';
    const pDocs = (state.dokumente || []).filter(d => d.projekt_id === window.currentViewProjektId);
    pDocs.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = `${d.typ} ${d.nummer || d.id} (${formatCurrency(d.summe_netto || 0)})`;
        select.appendChild(opt);
    });
}

function closeAufmassUebergabeModal() {
    const modal = document.getElementById('aufmass-uebergabe-modal');
    if (modal) modal.classList.add('hidden');
}

function onUebergabeTypChange() {
    // Mode toggles if needed
}

async function executeAufmassUebergabe() {
    const pId = window.currentViewProjektId;
    const zielTyp = document.getElementById('uebergabe-ziel-typ').value;
    const modus = document.querySelector('input[name="uebergabe-modus"]:checked')?.value || 'UPDATE_EXISTING';
    const docId = parseInt(document.getElementById('uebergabe-doc-select')?.value, 10);

    try {
        const aggAufmass = await window.api.mergeSchlussaufmass(pId);
        if (!aggAufmass || aggAufmass.length === 0) {
            showToast('Keine berechneten Aufmaßpositionen zum Übergeben vorhanden.', 'warning');
            return;
        }

        if (modus === 'UPDATE_EXISTING' && docId) {
            const doc = (state.dokumente || []).find(d => d.id === docId);
            if (doc) {
                (doc.positionen || []).forEach(pos => {
                    const match = aggAufmass.find(a => a.oz_code === pos.oz);
                    if (match) {
                        pos.menge = match.summe_menge;
                    }
                });
                showToast(`Aufmaßmengen in ${doc.typ} ${doc.nummer || doc.id} erfolgreich aktualisiert!`, 'success');
            }
        } else {
            showToast(`Neues ${zielTyp}-Dokument mit ${aggAufmass.length} Aufmaßpositionen vorbereitet.`, 'success');
        }

        closeAufmassUebergabeModal();
    } catch (e) {
        console.error('Error executing aufmass uebergabe:', e);
        showToast('Fehler bei der Dokumentenübergabe.', 'error');
    }
}

// --- WETTER SCHNELLWAHL & NACHTRAG RECHNUNGS-SYNC ---
function selectWeatherQuick(wetterStr) {
    const input = document.getElementById('bautagebuch-wetter');
    if (input) {
        input.value = wetterStr;
        showToast(`Wetter "${wetterStr}" übernommen.`, 'success');
    }
}

async function applyApprovedNachtraegeToCurrentInvoice() {
    const pId = window.currentViewProjektId;
    if (!pId || !window.api || !window.api.getNachtraege) return;
    try {
        const list = await window.api.getNachtraege(pId);
        const approved = (list || []).filter(n => n.status === 'GENEHMIGT');
        if (approved.length === 0) {
            showToast('Keine genehmigten Nachträge zum Übernehmen vorhanden.', 'warning');
            return;
        }

        const invoicePositions = window.NachtragController ? window.NachtragController.extractApprovedPositionsForInvoice(list) : [];
        showToast(`${invoicePositions.length} Positionen aus ${approved.length} genehmigten Nachträgen für die Abrechnung vorbereitet.`, 'success');
    } catch (e) {
        console.error('Error applying approved nachtraege:', e);
    }
}

// --- AUFMASSCENTER & DA11 (REB 23.003) ---
let currentAufmassZeilen = [];

async function loadProjektAufmassBlaetter(projectId) {
    if (!window.api || !window.api.getAufmassBlaetter) return;
    try {
        const blaetter = await window.api.getAufmassBlaetter(projectId);
        const tbody = document.getElementById('pd-aufmass-blaetter-body');
        const empty = document.getElementById('pd-aufmass-blaetter-empty');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!blaetter || blaetter.length === 0) {
            if (empty) empty.classList.remove('hidden');
            return;
        }
        if (empty) empty.classList.add('hidden');

        blaetter.forEach(b => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 transition-colors';

            const zeilenCount = (b.zeilen && b.zeilen.length) || 0;
            const summe = (b.zeilen || []).reduce((acc, z) => acc + (z.ergebnis || 0) * (z.vorzeichen !== undefined ? z.vorzeichen : 1), 0);

            tr.innerHTML = `
                <td class="px-4 py-3 font-mono font-bold text-primary">${b.blatt_nummer}</td>
                <td class="px-4 py-3 font-semibold text-slate-800">${b.titel}</td>
                <td class="px-4 py-3 text-center">${zeilenCount} Pos. (${summe.toFixed(2)} m²)</td>
                <td class="px-4 py-3 text-center">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${b.status === 'FINALIZED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}">${b.status || 'DRAFT'}</span>
                </td>
                <td class="px-4 py-3 text-center text-xs text-slate-400">${b.created_at ? new Date(b.created_at).toLocaleDateString() : '-'}</td>
                <td class="px-4 py-3 text-right space-x-1">
                    <button onclick="printAufmassBlattAction(${b.id})" class="p-1.5 hover:bg-indigo-50 text-indigo-600 rounded transition-colors" title="Aufmaßblatt drucken / PDF Vorschau">
                        <span class="material-symbols-outlined text-[18px]">print</span>
                    </button>
                    <button onclick="openAufmassBlattModal(${b.id})" class="p-1.5 hover:bg-slate-100 text-slate-600 rounded transition-colors" title="Bearbeiten">
                        <span class="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button onclick="exportProjektDA11(${b.id})" class="p-1.5 hover:bg-emerald-50 text-emerald-600 rounded transition-colors" title="DA11 REB 23.003 Export">
                        <span class="material-symbols-outlined text-[18px]">file_download</span>
                    </button>
                    <button onclick="deleteAufmassBlattAction(${b.id})" class="p-1.5 hover:bg-red-50 text-red-600 rounded transition-colors" title="Löschen">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error('Error loading aufmass blaetter:', e);
    }
}

async function openAufmassBlattModal(blattId = null) {
    const modal = document.getElementById('aufmassblatt-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    currentAufmassZeilen = [];
    document.getElementById('ab-id').value = '';
    document.getElementById('ab-nummer').value = '001';
    document.getElementById('ab-titel').value = '';

    if (blattId && window.api && window.api.getAufmassBlaetter) {
        const blaetter = await window.api.getAufmassBlaetter(window.currentViewProjektId);
        const b = blaetter.find(x => x.id === blattId);
        if (b) {
            document.getElementById('ab-id').value = b.id;
            document.getElementById('ab-nummer').value = b.blatt_nummer;
            document.getElementById('ab-titel').value = b.titel;
            currentAufmassZeilen = (b.zeilen || []).map(z => ({ ...z }));
        }
    } else {
        // Standardmäßig 1 leere Zeile
        currentAufmassZeilen.push({ oz_code: '01.01.0010', bezeichnung: '', rechenansatz: '4.50 * 3.20', ergebnis: 14.40, einheit: 'm²', vorzeichen: 1 });
    }

    renderAufmassBlattZeilenTable();
}

function closeAufmassBlattModal() {
    const modal = document.getElementById('aufmassblatt-modal');
    if (modal) modal.classList.add('hidden');
}

function addAufmassBlattZeile() {
    currentAufmassZeilen.push({ oz_code: '', bezeichnung: '', rechenansatz: '', ergebnis: 0, einheit: 'm²', vorzeichen: 1 });
    renderAufmassBlattZeilenTable();
}

function removeAufmassBlattZeile(idx) {
    currentAufmassZeilen.splice(idx, 1);
    renderAufmassBlattZeilenTable();
}

function toggleAufmassZeileVorzeichen(idx) {
    if (currentAufmassZeilen[idx]) {
        currentAufmassZeilen[idx].vorzeichen = (currentAufmassZeilen[idx].vorzeichen === -1) ? 1 : -1;
        renderAufmassBlattZeilenTable();
    }
}

function renderAufmassBlattZeilenTable() {
    const tbody = document.getElementById('ab-zeilen-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    let total = 0;

    currentAufmassZeilen.forEach((z, idx) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition-colors';
        const isMinus = z.vorzeichen === -1;
        const vorzeichenBtn = isMinus
            ? `<button type="button" onclick="toggleAufmassZeileVorzeichen(${idx})" class="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded text-xs font-bold bg-rose-100 text-rose-700 border border-rose-300 hover:bg-rose-200 transition-all shadow-xs" title="Abzug (−)"><span class="font-mono text-sm leading-none font-bold">−</span> Abzug</button>`
            : `<button type="button" onclick="toggleAufmassZeileVorzeichen(${idx})" class="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-300 hover:bg-emerald-200 transition-all shadow-xs" title="Zuschlag (+)"><span class="font-mono text-sm leading-none font-bold">+</span> Plus</button>`;

        const lineErgebnis = (z.ergebnis || 0) * (z.vorzeichen !== undefined ? z.vorzeichen : 1);
        const ergClass = lineErgebnis < 0 ? 'text-rose-600' : 'text-slate-800';

        tr.innerHTML = `
            <td class="px-2.5 py-2"><input type="text" value="${z.oz_code || ''}" onchange="updateAufmassZeile(${idx}, 'oz_code', this.value)" class="w-full px-2 py-1.5 border border-slate-300 focus:border-primary rounded font-mono text-xs" placeholder="01.01.0010"></td>
            <td class="px-2.5 py-2"><input type="text" value="${z.bezeichnung || ''}" onchange="updateAufmassZeile(${idx}, 'bezeichnung', this.value)" class="w-full px-2 py-1.5 border border-slate-300 focus:border-primary rounded text-xs" placeholder="Raum / Bauteil"></td>
            <td class="px-2.5 py-2"><input type="text" value="${z.rechenansatz || ''}" oninput="calcAufmassZeileFormula(${idx}, this.value)" class="w-full px-2 py-1.5 border border-slate-300 focus:border-indigo-500 rounded font-mono text-xs text-indigo-900 font-semibold" placeholder="z.B. 4.50 * 3.20 * 0.25"></td>
            <td class="px-2.5 py-2"><input type="text" value="${z.einheit || 'm²'}" onchange="updateAufmassZeile(${idx}, 'einheit', this.value)" class="w-full px-1.5 py-1.5 border border-slate-300 rounded text-center text-xs"></td>
            <td class="px-2.5 py-2 text-center">
                ${vorzeichenBtn}
            </td>
            <td class="px-2.5 py-2 text-right font-mono font-bold ${ergClass} text-xs" id="ab-erg-${idx}">
                ${lineErgebnis.toFixed(2)}
            </td>
            <td class="px-1.5 py-2 text-center">
                <button type="button" onclick="removeAufmassBlattZeile(${idx})" class="text-slate-400 hover:text-red-500 p-1 rounded hover:bg-red-50" title="Zeile löschen">
                    <span class="material-symbols-outlined text-[16px]">delete</span>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
        total += lineErgebnis;
    });

    const totalEl = document.getElementById('ab-total-sum');
    if (totalEl) totalEl.innerText = total.toFixed(2);
}

function updateAufmassZeile(idx, field, val) {
    if (currentAufmassZeilen[idx]) {
        currentAufmassZeilen[idx][field] = val;
        renderAufmassBlattZeilenTable();
    }
}

function calcAufmassZeileFormula(idx, formulaStr) {
    if (currentAufmassZeilen[idx]) {
        currentAufmassZeilen[idx].rechenansatz = formulaStr;
        const res = window.AufmassController ? window.AufmassController.evaluateFormula(formulaStr) : 0;
        currentAufmassZeilen[idx].ergebnis = res;
        const ergCell = document.getElementById(`ab-erg-${idx}`);
        const lineErg = res * (currentAufmassZeilen[idx].vorzeichen !== undefined ? currentAufmassZeilen[idx].vorzeichen : 1);
        if (ergCell) {
            ergCell.innerText = lineErg.toFixed(2);
            ergCell.className = lineErg < 0 ? 'px-2.5 py-2 text-right font-mono font-bold text-rose-600 text-xs' : 'px-2.5 py-2 text-right font-mono font-bold text-slate-800 text-xs';
        }
        // Recalc total
        let total = 0;
        currentAufmassZeilen.forEach(z => total += (z.ergebnis || 0) * (z.vorzeichen !== undefined ? z.vorzeichen : 1));
        const totalEl = document.getElementById('ab-total-sum');
        if (totalEl) totalEl.innerText = total.toFixed(2);
    }
}

async function saveAufmassBlattData() {
    const id = document.getElementById('ab-id').value;
    const blatt_nummer = document.getElementById('ab-nummer').value || '001';
    const titel = document.getElementById('ab-titel').value || 'Aufmaßblatt';
    const project_id = window.currentViewProjektId;

    if (!project_id) {
        showToast('Kein Projekt ausgewählt.', 'error');
        return;
    }

    const blattData = {
        id: id ? parseInt(id) : null,
        project_id,
        blatt_nummer,
        titel,
        status: 'VERIFIED'
    };

    try {
        const savedId = await window.api.saveAufmassBlatt(blattData, currentAufmassZeilen);
        showToast('Aufmaßblatt erfolgreich gespeichert.', 'success');
        closeAufmassBlattModal();
        loadProjektAufmassBlaetter(project_id);
    } catch (e) {
        console.error('Error saving aufmass blatt:', e);
        showToast('Fehler beim Speichern des Aufmaßblatts.', 'error');
    }
}

async function deleteAufmassBlattAction(blattId) {
    const confirmed = await window.api.confirm({
        title: 'Aufmaßblatt löschen',
        message: 'Möchten Sie dieses Aufmaßblatt wirklich löschen?'
    });
    if (confirmed) {
        await window.api.deleteAufmassBlatt(blattId);
        showToast('Aufmaßblatt gelöscht.', 'success');
        loadProjektAufmassBlaetter(window.currentViewProjektId);
    }
}

async function exportProjektDA11(blattId = null) {
    const pId = window.currentViewProjektId;
    if (!pId) return;
    try {
        const res = await window.api.exportDA11(pId, blattId);
        if (res && res.success) {
            showToast(`DA11 Datei erfolgreich exportiert: ${res.filePath}`, 'success');
        }
    } catch (e) {
        console.error('Error exporting DA11:', e);
        showToast('Fehler beim Exportieren der DA11 Datei.', 'error');
    }
}

async function exportProjektGAEBX31(blattId = null) {
    const pId = window.currentViewProjektId;
    if (!pId) return;
    try {
        if (window.api && window.api.exportGAEBX31) {
            const res = await window.api.exportGAEBX31(pId, blattId);
            if (res && res.success) {
                showToast(`GAEB DA XML 3.3 Phase X31 Mengenermittlung exportiert: ${res.filePath}`, 'success');
            }
        }
    } catch (e) {
        console.error('Fehler beim GAEB X31 Export:', e);
        showToast('Fehler beim GAEB X31 Export: ' + e.message, 'error');
    }
}

async function importProjektGAEBX31() {
    const pId = window.currentViewProjektId;
    if (!pId) return;
    try {
        if (window.api && window.api.importGAEBX31) {
            const res = await window.api.importGAEBX31(pId);
            if (res && res.success) {
                showToast(`GAEB X31 Import erfolgreich: ${res.importedCount} Zeilen aus ${res.itemsCount} Positionen importiert.`, 'success');
                loadProjektAufmassBlaetter(pId);
            }
        }
    } catch (e) {
        console.error('Fehler beim GAEB X31 Import:', e);
        showToast('Fehler beim GAEB X31 Import: ' + e.message, 'error');
    }
}

// --- AUFMASS PRINT & PDF ENGINE ---

function generateAufmassDocumentHtml({ projekt, blatt, zeilen = [], typ = 'FREI', variante = 'TEILAUFMASS', isSchlussaufmass = false, allPositions = [] }) {
    const firma = state.einstellungen || {};
    const firmenName = sanitize(firma.firmenname || 'Handwerksbetrieb');
    const firmenStrasse = sanitize(firma.strasse || '');
    const firmenPlzOrt = sanitize(`${firma.plz || ''} ${firma.ort || ''}`.trim());
    const firmenTel = sanitize(firma.telefon || '');
    const firmenEmail = sanitize(firma.email || '');
    const firmenSteuer = sanitize(firma.steuernummer || firma.steuer || '');

    const pName = sanitize(projekt ? projekt.name : 'Bauvorhaben');
    const pNr = sanitize(projekt ? (projekt.nummer || `PRJ-${projekt.id}`) : '-');
    const pKunde = sanitize(projekt && projekt.kunde_name ? projekt.kunde_name : (projekt && projekt.kunde ? (typeof projekt.kunde === 'string' ? projekt.kunde : (projekt.kunde.name || 'Kunde')) : 'Auftraggeber'));
    const pDatum = new Date().toLocaleDateString('de-DE');

    let docTitle = 'AUFMASSBLATT & MENGENBERECHNUNG';
    let docSubtitle = 'Nach REB 23.003 / VOB Teil C - Prüffähige Mengenermittlung';
    let badgeText = blatt ? (blatt.blatt_nummer || 'AUF-001') : 'AUFMASS';

    if (isSchlussaufmass || (blatt && blatt.titel && blatt.titel.includes('Schlussaufmaß'))) {
        docTitle = 'SCHLUSSAUFMASS & GESAMTABNAHME';
        docSubtitle = 'Gesamtaufmaß & Abrechnungsprotokoll aller Projektpositionen nach VOB/B § 14';
        badgeText = 'SCHLUSSAUFMASS';
    } else if (typ === 'SPALTEN' || (blatt && blatt.titel && blatt.titel.includes('Spaltenaufmaß'))) {
        docTitle = 'SPALTENAUFMASS (REB 23.003)';
        docSubtitle = 'Detailliertes Spaltenaufmaß mit Faktoren, Zu- und Abschlägen';
        badgeText = 'SPALTENAUFMASS';
    } else if (typ === 'RAUM' || (blatt && blatt.titel && blatt.titel.includes('Raumaufmaß'))) {
        docTitle = 'RAUMAUFMASS & FLÄCHENNACHWEIS';
        docSubtitle = 'Mengenberechnung gegliedert nach Geschoss & Räumen';
        badgeText = 'RAUMAUFMASS';
    } else if (variante === 'EINZELAUFMASS' || (blatt && blatt.titel && blatt.titel.includes('Einzelaufmaß'))) {
        docTitle = 'EINZELAUFMASS & MENGENNACHWEIS';
        docSubtitle = 'Prüffähiger Einzelnachweis für spezifische Leistungsbereiche';
        badgeText = 'EINZELAUFMASS';
    }

    let rowsHtml = '';
    let totalSum = 0;

    if (isSchlussaufmass && allPositions && allPositions.length > 0) {
        // Render summary table comparing all positions
        rowsHtml = `
            <table class="w-full text-left border-collapse mb-3">
                <thead>
                    <tr class="border-b-2 border-slate-800 bg-slate-100 text-slate-700 text-[10px] font-bold uppercase">
                        <th class="py-1.5 px-2.5">OZ</th>
                        <th class="py-1.5 px-2.5">Leistungsbezeichnung</th>
                        <th class="py-1.5 px-2.5 text-center">Einheit</th>
                        <th class="py-1.5 px-2.5 text-right">Soll-Menge</th>
                        <th class="py-1.5 px-2.5 text-right">Aufmaß (Ist)</th>
                        <th class="py-1.5 px-2.5 text-right">Differenz</th>
                        <th class="py-1.5 px-2.5 text-center">Status</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-200 text-xs">
                    ${allPositions.map(pos => {
                        const soll = pos.mengeSoll || pos.soll_menge || 0;
                        const ist = pos.mengeIst !== undefined ? pos.mengeIst : (pos.summe_menge !== undefined ? pos.summe_menge : 0);
                        const diff = ist - soll;
                        const diffColor = diff > 0 ? 'text-amber-600' : (diff < 0 ? 'text-blue-600' : 'text-slate-600');
                        const statusBadge = ist > 0 ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800">Erfasst</span>' : '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500">Offen</span>';
                        return `
                            <tr class="hover:bg-slate-50/80">
                                <td class="py-1.5 px-2.5 font-mono font-bold text-primary">${sanitize(pos.oz || pos.oz_code || '01.01.0010')}</td>
                                <td class="py-1.5 px-2.5 font-semibold text-slate-800">${sanitize(pos.name || pos.bezeichnung || 'Position')}</td>
                                <td class="py-1.5 px-2.5 text-center font-mono text-slate-600">${sanitize(pos.einheit || 'm²')}</td>
                                <td class="py-1.5 px-2.5 text-right font-mono text-slate-500">${soll.toFixed(2)}</td>
                                <td class="py-1.5 px-2.5 text-right font-mono font-bold text-slate-800">${ist.toFixed(2)}</td>
                                <td class="py-1.5 px-2.5 text-right font-mono font-semibold ${diffColor}">${diff >= 0 ? '+' : ''}${diff.toFixed(2)}</td>
                                <td class="py-1.5 px-2.5 text-center">${statusBadge}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    } else {
        // Render detail calculation lines
        rowsHtml = `
            <table class="w-full text-left border-collapse mb-3">
                <thead>
                    <tr class="border-b-2 border-slate-800 bg-slate-100 text-slate-700 text-[10px] font-bold uppercase">
                        <th class="py-1.5 px-2.5 w-10 text-center">#</th>
                        <th class="py-1.5 px-2.5 w-24">OZ Code</th>
                        <th class="py-1.5 px-2.5">Raum / Bauteil / Erläuterung</th>
                        <th class="py-1.5 px-2.5">Rechenansatz / Formel (REB 23.003)</th>
                        <th class="py-1.5 px-2.5 w-16 text-center">Vorzeichen</th>
                        <th class="py-1.5 px-2.5 w-24 text-right">Ergebnis</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-200 text-xs">
                    ${(zeilen || []).map((z, idx) => {
                        const lineErg = (z.ergebnis || 0) * (z.vorzeichen !== undefined ? z.vorzeichen : 1);
                        totalSum += lineErg;
                        const isMinus = (z.vorzeichen === -1) || lineErg < 0;
                        const vzBadge = isMinus 
                            ? '<span class="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-700 font-mono">− Abzug</span>' 
                            : '<span class="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700 font-mono">+ Plus</span>';

                        return `
                            <tr class="hover:bg-slate-50/80">
                                <td class="py-1.5 px-2.5 text-center font-mono text-slate-400">${idx + 1}</td>
                                <td class="py-1.5 px-2.5 font-mono font-bold text-primary">${sanitize(z.oz_code || '01.01.0010')}</td>
                                <td class="py-1.5 px-2.5 text-slate-800 font-medium">${sanitize(z.bezeichnung || 'Fläche')}</td>
                                <td class="py-1.5 px-2.5 font-mono font-semibold text-indigo-900 bg-slate-50/50">${sanitize(z.rechenansatz || '-')}</td>
                                <td class="py-1.5 px-2.5 text-center">${vzBadge}</td>
                                <td class="py-1.5 px-2.5 text-right font-mono font-bold ${lineErg < 0 ? 'text-rose-600' : 'text-slate-800'}">
                                    ${lineErg.toFixed(2)} ${sanitize(z.einheit || 'm²')}
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    const defaultUnit = (zeilen && zeilen[0] && zeilen[0].einheit) || 'm²';

    return `
        <div id="invoice-paper" class="invoice-paper p-6 max-w-4xl mx-auto bg-white text-slate-800 flex flex-col justify-between relative shadow-lg my-2 rounded-xl border border-slate-200" style="font-family: 'Inter', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; min-height: 260mm; box-sizing: border-box;">
            <div>
                <!-- Kopfbereich -->
                <div class="flex justify-between items-start border-b border-slate-200 pb-3 mb-3">
                    <div>
                        <span class="inline-block px-2 py-0.5 bg-primary text-white text-[10px] font-black uppercase rounded tracking-wider mb-1">${badgeText}</span>
                        <h1 class="text-xl font-black text-slate-900 tracking-tight">${docTitle}</h1>
                        <p class="text-[11px] text-slate-500 font-medium mt-0.5">${docSubtitle}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-base font-black text-slate-900">${firmenName}</p>
                        <p class="text-[11px] text-slate-500">${firmenStrasse}</p>
                        <p class="text-[11px] text-slate-500">${firmenPlzOrt}</p>
                        ${firmenTel ? `<p class="text-[11px] text-slate-500">Tel: ${firmenTel}</p>` : ''}
                        ${firmenEmail ? `<p class="text-[11px] text-slate-500">${firmenEmail}</p>` : ''}
                        ${firmenSteuer ? `<p class="text-[10px] text-slate-400 mt-0.5">St.-Nr.: ${firmenSteuer}</p>` : ''}
                    </div>
                </div>

                <!-- Stammdaten Raster -->
                <div class="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 mb-3 text-xs">
                    <div>
                        <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Bauvorhaben / Projekt</span>
                        <p class="font-bold text-slate-800 mt-0.5 text-xs">${pName}</p>
                        <p class="text-slate-500 font-mono text-[11px] mt-0.5">Projekt-Nr.: ${pNr}</p>
                    </div>
                    <div>
                        <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Auftraggeber / Bauherr</span>
                        <p class="font-bold text-slate-800 mt-0.5 text-xs">${pKunde}</p>
                        <p class="text-slate-500 text-[11px] mt-0.5">Aufmaßblatt: ${sanitize(blatt ? blatt.blatt_nummer : '001')}</p>
                    </div>
                    <div>
                        <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Datum / Status</span>
                        <p class="font-bold text-slate-800 mt-0.5 text-xs">Erstellt am: ${pDatum}</p>
                        <p class="text-emerald-700 font-semibold text-[11px] mt-0.5 flex items-center gap-1">
                            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                            Status: ${sanitize(blatt && blatt.status ? blatt.status : 'VERIFIZIERT')}
                        </p>
                    </div>
                </div>

                ${blatt && blatt.titel ? `
                    <div class="mb-3 bg-primary/5 p-2 rounded-md border border-primary/10">
                        <h3 class="text-xs font-bold text-slate-700">Leistungsbereich: <span class="text-primary text-xs font-semibold">${sanitize(blatt.titel)}</span></h3>
                    </div>
                ` : ''}

                <!-- Aufmaß Tabelleninhalt -->
                ${rowsHtml}

                <!-- Gesamtsumme Box (wenn nicht Schlussaufmaß) -->
                ${!isSchlussaufmass ? `
                    <div class="flex justify-end mb-3">
                        <div class="bg-primary/5 border border-primary/20 rounded-lg p-2.5 min-w-[220px] text-right">
                            <span class="text-[9px] uppercase font-bold text-slate-500 block">Gesamtaufmaß Summe:</span>
                            <span class="text-xl font-black font-mono text-primary">${totalSum.toFixed(2)} ${sanitize(defaultUnit)}</span>
                        </div>
                    </div>
                ` : ''}
            </div>

            <!-- Unterschriften & Prüfblock -->
            <div class="border-t border-slate-300 pt-3 mt-3 avoid-break">
                <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Gemeinsame Feststellung & Freigabe (§ 14 VOB/B)</p>
                <div class="grid grid-cols-3 gap-6 text-xs text-slate-600">
                    <div class="border-t border-slate-300 pt-1.5 text-center">
                        <p class="font-bold text-slate-800 text-xs">Aufgestellt</p>
                        <p class="text-[10px] text-slate-400 mt-0.5">Auftragnehmer / Handwerker</p>
                    </div>
                    <div class="border-t border-slate-300 pt-1.5 text-center">
                        <p class="font-bold text-slate-800 text-xs">Geprüft & Gemessen</p>
                        <p class="text-[10px] text-slate-400 mt-0.5">Bauleiter / Architekt</p>
                    </div>
                    <div class="border-t border-slate-300 pt-1.5 text-center">
                        <p class="font-bold text-slate-800 text-xs">Anerkannt</p>
                        <p class="text-[10px] text-slate-400 mt-0.5">Bauherr / Auftraggeber</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function printAufmassBlattAction(blattId) {
    const pId = window.currentViewProjektId;
    if (!pId || !window.api || !window.api.getAufmassBlaetter) return;

    try {
        const blaetter = await window.api.getAufmassBlaetter(pId);
        const blatt = (blaetter || []).find(b => b.id === blattId);
        if (!blatt) {
            showToast('Aufmaßblatt nicht gefunden.', 'error');
            return;
        }

        const projekt = (state.projekte || []).find(p => p.id === pId);
        let typ = 'FREI';
        let variante = 'TEILAUFMASS';
        if (blatt.titel) {
            if (blatt.titel.includes('Spaltenaufmaß')) typ = 'SPALTEN';
            else if (blatt.titel.includes('Raumaufmaß')) typ = 'RAUM';
            if (blatt.titel.includes('Einzelaufmaß')) variante = 'EINZELAUFMASS';
            else if (blatt.titel.includes('Schlussaufmaß')) variante = 'SCHLUSSAUFMASS';
        }

        const html = generateAufmassDocumentHtml({
            projekt,
            blatt,
            zeilen: blatt.zeilen || [],
            typ,
            variante
        });

        const filename = `Aufmass_${blatt.blatt_nummer || blatt.id}_${(projekt ? projekt.name : 'Projekt').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
        openPdfPreview(html, filename);
    } catch (e) {
        console.error('Error printing aufmass blatt:', e);
        showToast('Fehler beim Laden der Aufmaß-Druckvorschau.', 'error');
    }
}

async function printActiveSplitPositionAufmass() {
    const pId = window.currentViewProjektId;
    if (!pId || !activeSplitOz) {
        showToast('Bitte wählen Sie zuerst links eine Position aus.', 'warning');
        return;
    }

    const projekt = (state.projekte || []).find(p => p.id === pId);
    const posName = activeSplitPosition ? activeSplitPosition.name : 'Position';
    const blatt = {
        blatt_nummer: `POS-${activeSplitOz.replace(/[^0-9A-Za-z]/g, '')}`,
        titel: `Detailaufmaß OZ ${activeSplitOz} - ${posName}`,
        status: 'VERIFIZIERT'
    };

    const html = generateAufmassDocumentHtml({
        projekt,
        blatt,
        zeilen: currentSplitZeilen,
        typ: 'FREI',
        variante: 'EINZELAUFMASS'
    });

    const filename = `Einzelaufmass_${activeSplitOz.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    openPdfPreview(html, filename);
}

async function printCurrentAufmassBlattModal() {
    const pId = window.currentViewProjektId;
    const projekt = (state.projekte || []).find(p => p.id === pId);
    const blatt_nummer = document.getElementById('ab-nummer')?.value || '001';
    const titel = document.getElementById('ab-titel')?.value || 'Aufmaßblatt';

    const blatt = {
        blatt_nummer,
        titel,
        status: 'VERIFIZIERT'
    };

    const html = generateAufmassDocumentHtml({
        projekt,
        blatt,
        zeilen: currentAufmassZeilen,
        typ: 'FREI',
        variante: 'TEILAUFMASS'
    });

    const filename = `Aufmass_${blatt_nummer}.pdf`;
    openPdfPreview(html, filename);
}

async function calculateSchlussaufmassForProjekt() {
    const pId = window.currentViewProjektId;
    if (!pId) return;
    try {
        const projekt = (state.projekte || []).find(p => p.id === pId);
        const aggRows = await window.api.mergeSchlussaufmass(pId);
        const blaetter = await window.api.getAufmassBlaetter(pId);

        // Collect all positions with Soll-Mengen
        const posMap = {};
        (splitPositionsData || []).forEach(sp => {
            posMap[sp.oz] = { oz: sp.oz, name: sp.name, mengeSoll: sp.mengeSoll, einheit: sp.einheit, mengeIst: 0 };
        });

        (aggRows || []).forEach(r => {
            if (posMap[r.oz_code]) {
                posMap[r.oz_code].mengeIst = r.summe_menge;
            } else {
                posMap[r.oz_code] = { oz: r.oz_code, name: `Position ${r.oz_code}`, mengeSoll: 0, einheit: r.einheit, mengeIst: r.summe_menge };
            }
        });

        // Collect all individual lines across all sheets
        const allZeilen = [];
        (blaetter || []).forEach(b => {
            (b.zeilen || []).forEach(z => {
                allZeilen.push({ ...z, bezeichnung: `[${b.blatt_nummer}] ${z.bezeichnung || ''}` });
            });
        });

        const allPosList = Object.values(posMap);

        const blatt = {
            blatt_nummer: 'SCHLUSS-01',
            titel: `Schlussaufmaß Gesamtprojekt: ${projekt ? projekt.name : ''}`,
            status: 'FINALISIERT'
        };

        const html = generateAufmassDocumentHtml({
            projekt,
            blatt,
            zeilen: allZeilen,
            typ: 'FREI',
            variante: 'SCHLUSSAUFMASS',
            isSchlussaufmass: true,
            allPositions: allPosList
        });

        const filename = `Schlussaufmass_${(projekt ? projekt.name : 'Projekt').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
        openPdfPreview(html, filename);
    } catch (e) {
        console.error('Error calculating and printing schlussaufmass:', e);
        showToast('Fehler beim Erstellen des Schlussaufmaßes.', 'error');
    }
}

// --- VOB/B NACHTRAGSVERWALTUNG ---
let currentNachtragPositionen = [];

async function loadProjektNachtraege(projectId) {
    if (!window.api || !window.api.getNachtraege) return;
    try {
        const nachtraege = await window.api.getNachtraege(projectId);
        const tbody = document.getElementById('pd-nachtraege-body');
        const empty = document.getElementById('pd-nachtraege-empty');
        if (!tbody) return;
        tbody.innerHTML = '';

        let sumEingereicht = 0;
        let sumGenehmigt = 0;
        let sumAbgelehnt = 0;

        if (!nachtraege || nachtraege.length === 0) {
            if (empty) empty.classList.remove('hidden');
            updateNachtragSums(0, 0, 0);
            return;
        }
        if (empty) empty.classList.add('hidden');

        nachtraege.forEach(n => {
            const netto = n.summe_netto || 0;
            if (n.status === 'GENEHMIGT') sumGenehmigt += netto;
            else if (n.status === 'ABGELEHNT') sumAbgelehnt += netto;
            else sumEingereicht += netto;

            let statusPill = 'bg-amber-100 text-amber-800';
            if (n.status === 'GENEHMIGT') statusPill = 'bg-emerald-100 text-emerald-800';
            else if (n.status === 'ABGELEHNT') statusPill = 'bg-red-100 text-red-800';

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 transition-colors';
            tr.innerHTML = `
                <td class="px-4 py-3 font-mono font-bold text-indigo-700">${n.nachtrag_nr}</td>
                <td class="px-4 py-3 font-semibold text-slate-800">${n.titel}</td>
                <td class="px-4 py-3 text-xs text-slate-500">${window.NachtragController ? window.NachtragController.getRechtsgrundlageLabel(n.rechtsgrundlage) : n.rechtsgrundlage}</td>
                <td class="px-4 py-3 text-right font-mono font-bold">${formatCurrency(n.summe_netto)}</td>
                <td class="px-4 py-3 text-center">
                    <span class="px-2.5 py-0.5 rounded text-[11px] font-bold uppercase ${statusPill}">${n.status}</span>
                </td>
                <td class="px-4 py-3 text-right space-x-1">
                    <button onclick="updateNachtragStatusAction(${n.id}, 'GENEHMIGT')" class="p-1.5 hover:bg-emerald-50 text-emerald-600 rounded text-xs font-bold" title="Genehmigen">
                        <span class="material-symbols-outlined text-[18px]">check_circle</span>
                    </button>
                    <button onclick="updateNachtragStatusAction(${n.id}, 'ABGELEHNT')" class="p-1.5 hover:bg-red-50 text-red-600 rounded text-xs font-bold" title="Ablehnen">
                        <span class="material-symbols-outlined text-[18px]">cancel</span>
                    </button>
                    <button onclick="openNachtragModal(${n.id})" class="p-1.5 hover:bg-slate-100 text-slate-600 rounded" title="Bearbeiten">
                        <span class="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button onclick="deleteNachtragAction(${n.id})" class="p-1.5 hover:bg-red-50 text-red-600 rounded" title="Löschen">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        updateNachtragSums(sumEingereicht, sumGenehmigt, sumAbgelehnt);
    } catch (e) {
        console.error('Error loading nachtraege:', e);
    }
}

function updateNachtragSums(e, g, a) {
    const elE = document.getElementById('pd-nachtrag-sum-eingereicht');
    const elG = document.getElementById('pd-nachtrag-sum-genehmigt');
    const elA = document.getElementById('pd-nachtrag-sum-abgelehnt');
    if (elE) elE.innerText = formatCurrency(e);
    if (elG) elG.innerText = formatCurrency(g);
    if (elA) elA.innerText = formatCurrency(a);
}

async function openNachtragModal(nachtragId = null) {
    const modal = document.getElementById('nachtrag-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    currentNachtragPositionen = [];
    document.getElementById('nt-id').value = '';
    document.getElementById('nt-nr').value = 'N-01';
    document.getElementById('nt-titel').value = '';
    document.getElementById('nt-rechtsgrundlage').value = 'VOB_2_6';
    document.getElementById('nt-status').value = 'EINGEREICHT';
    document.getElementById('nt-begruendung').value = '';

    if (nachtragId && window.api && window.api.getNachtraege) {
        const list = await window.api.getNachtraege(window.currentViewProjektId);
        const n = list.find(x => x.id === nachtragId);
        if (n) {
            document.getElementById('nt-id').value = n.id;
            document.getElementById('nt-nr').value = n.nachtrag_nr;
            document.getElementById('nt-titel').value = n.titel;
            document.getElementById('nt-rechtsgrundlage').value = n.rechtsgrundlage || 'VOB_2_6';
            document.getElementById('nt-status').value = n.status || 'EINGEREICHT';
            document.getElementById('nt-begruendung').value = n.begruendung || '';
            currentNachtragPositionen = (n.positionen || []).map(p => ({ ...p }));
        }
    } else {
        currentNachtragPositionen.push({ oz_code: 'N1.01.0010', kurztext: 'Zusätzliche Dämmung', cost_type: 'MATERIAL', menge: 1, einheit: 'm²', einheitspreis: 45.00 });
    }

    renderNachtragPositionsTable();
}

function closeNachtragModal() {
    const modal = document.getElementById('nachtrag-modal');
    if (modal) modal.classList.add('hidden');
}

function addNachtragPositionRow() {
    currentNachtragPositionen.push({ oz_code: '', kurztext: '', cost_type: 'MATERIAL', menge: 1, einheit: 'Stk.', einheitspreis: 0 });
    renderNachtragPositionsTable();
}

function removeNachtragPositionRow(idx) {
    currentNachtragPositionen.splice(idx, 1);
    renderNachtragPositionsTable();
}

function renderNachtragPositionsTable() {
    const tbody = document.getElementById('nt-positionen-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    let totalNetto = 0;

    currentNachtragPositionen.forEach((p, idx) => {
        const gp = (parseFloat(p.menge) || 0) * (parseFloat(p.einheitspreis) || 0);
        totalNetto += gp;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-2 py-1.5"><input type="text" value="${p.oz_code || ''}" onchange="updateNachtragPos(${idx}, 'oz_code', this.value)" class="w-full px-2 py-1 border border-slate-200 rounded font-mono text-xs" placeholder="N1.01"></td>
            <td class="px-2 py-1.5"><input type="text" value="${p.kurztext || ''}" onchange="updateNachtragPos(${idx}, 'kurztext', this.value)" class="w-full px-2 py-1 border border-slate-200 rounded text-xs" placeholder="Bezeichnung"></td>
            <td class="px-2 py-1.5">
                <select onchange="updateNachtragPos(${idx}, 'cost_type', this.value)" class="w-full px-1 py-1 border border-slate-200 rounded text-xs">
                    <option value="MATERIAL" ${p.cost_type === 'MATERIAL' ? 'selected' : ''}>Material</option>
                    <option value="LOHN" ${p.cost_type === 'LOHN' ? 'selected' : ''}>Lohn</option>
                    <option value="GERÄT" ${p.cost_type === 'GERÄT' ? 'selected' : ''}>Gerät</option>
                    <option value="FAHRT" ${p.cost_type === 'FAHRT' ? 'selected' : ''}>Fahrt</option>
                </select>
            </td>
            <td class="px-2 py-1.5"><input type="number" step="0.01" value="${p.menge || 1}" oninput="updateNachtragPos(${idx}, 'menge', parseFloat(this.value) || 0)" class="w-full px-2 py-1 border border-slate-200 rounded text-center text-xs"></td>
            <td class="px-2 py-1.5"><input type="text" value="${p.einheit || 'Stk.'}" onchange="updateNachtragPos(${idx}, 'einheit', this.value)" class="w-full px-1 py-1 border border-slate-200 rounded text-center text-xs"></td>
            <td class="px-2 py-1.5"><input type="number" step="0.01" value="${p.einheitspreis || 0}" oninput="updateNachtragPos(${idx}, 'einheitspreis', parseFloat(this.value) || 0)" class="w-full px-2 py-1 border border-slate-200 rounded text-right text-xs"></td>
            <td class="px-2 py-1.5 text-right font-mono font-bold text-slate-800 text-xs">${formatCurrency(gp)}</td>
            <td class="px-1 py-1.5 text-center">
                <button type="button" onclick="removeNachtragPositionRow(${idx})" class="text-slate-400 hover:text-red-500">
                    <span class="material-symbols-outlined text-[16px]">close</span>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    const nettoEl = document.getElementById('nt-total-netto');
    const bruttoEl = document.getElementById('nt-total-brutto');
    if (nettoEl) nettoEl.innerText = formatCurrency(totalNetto);
    if (bruttoEl) bruttoEl.innerText = formatCurrency(totalNetto * 1.19);
}

function updateNachtragPos(idx, field, val) {
    if (currentNachtragPositionen[idx]) {
        currentNachtragPositionen[idx][field] = val;
        renderNachtragPositionsTable();
    }
}

async function saveNachtragData() {
    const id = document.getElementById('nt-id').value;
    const nachtrag_nr = document.getElementById('nt-nr').value || 'N-01';
    const titel = document.getElementById('nt-titel').value;
    const rechtsgrundlage = document.getElementById('nt-rechtsgrundlage').value;
    const status = document.getElementById('nt-status').value;
    const begruendung = document.getElementById('nt-begruendung').value;
    const project_id = window.currentViewProjektId;

    if (!titel) {
        showToast('Bitte geben Sie einen Titel für den Nachtrag ein.', 'warning');
        return;
    }

    const nachtragData = {
        id: id ? parseInt(id) : null,
        project_id,
        nachtrag_nr,
        titel,
        rechtsgrundlage,
        status,
        begruendung
    };

    try {
        await window.api.saveNachtrag(nachtragData, currentNachtragPositionen);
        showToast('Nachtrag erfolgreich gespeichert.', 'success');
        closeNachtragModal();
        loadProjektNachtraege(project_id);
    } catch (e) {
        console.error('Error saving nachtrag:', e);
        showToast('Fehler beim Speichern des Nachtrags.', 'error');
    }
}

async function updateNachtragStatusAction(nachtragId, status) {
    try {
        await window.api.updateNachtragStatus(nachtragId, status);
        showToast(`Nachtrags-Status auf "${status}" aktualisiert.`, 'success');
        loadProjektNachtraege(window.currentViewProjektId);
    } catch (e) {
        console.error('Error updating nachtrag status:', e);
    }
}

async function deleteNachtragAction(nachtragId) {
    const confirmed = await window.api.confirm({
        title: 'Nachtrag löschen',
        message: 'Möchten Sie diesen Nachtrag unwiderruflich löschen?'
    });
    if (confirmed) {
        await window.api.deleteNachtrag(nachtragId);
        showToast('Nachtrag gelöscht.', 'success');
        loadProjektNachtraege(window.currentViewProjektId);
    }
}

// --- BAUTAGEBUCH & ABNAHMEPROTOKOLL ---
async function loadProjektBautagebuch(projectId) {
    if (!window.api || !window.api.getBautagebuch) return;
    try {
        const list = await window.api.getBautagebuch(projectId);
        const container = document.getElementById('pd-bautagebuch-list');
        if (!container) return;
        container.innerHTML = '';

        if (!list || list.length === 0) {
            container.innerHTML = '<p class="text-xs text-slate-400 italic">Noch keine Tagesberichte erfasst.</p>';
            return;
        }

        list.forEach(item => {
            const card = document.createElement('div');
            card.className = 'p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col gap-2';
            card.innerHTML = `
                <div class="flex justify-between items-center text-xs">
                    <span class="font-bold text-slate-800 flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-[16px] text-amber-600">calendar_today</span>
                        ${new Date(item.datum).toLocaleDateString()}
                    </span>
                    <span class="text-slate-500 font-medium">${item.wetter || 'Kein Wetter erfasst'} | ${item.personal_eigen_anzahl || 0} Arbeiter (${item.personal_eigen_stunden || 0}h)</span>
                </div>
                <p class="text-sm text-slate-700 leading-relaxed">${item.tagesbericht || ''}</p>
                ${item.vorkommnisse_behinderungen ? `<div class="p-2 bg-amber-100/60 rounded text-xs text-amber-900 font-medium">⚠️ Behinderung/Bedenken: ${item.vorkommnisse_behinderungen}</div>` : ''}
            `;
            container.appendChild(card);
        });
    } catch (e) {
        console.error('Error loading bautagebuch:', e);
    }
}

async function saveBautagebuchEntry() {
    const pId = window.currentViewProjektId;
    const datum = document.getElementById('bautagebuch-datum')?.value || new Date().toISOString().split('T')[0];
    const wetter = document.getElementById('bautagebuch-wetter')?.value || '';
    const arbeiter = parseInt(document.getElementById('bautagebuch-arbeiter')?.value, 10) || 0;
    const stunden = parseFloat(document.getElementById('bautagebuch-stunden')?.value) || (arbeiter * 8);
    const geraete = document.getElementById('bautagebuch-geraete')?.value || '';
    const notiz = document.getElementById('bautagebuch-notiz')?.value || '';
    const behinderungen = document.getElementById('bautagebuch-behinderungen')?.value || '';

    if (!notiz && !wetter && !arbeiter) {
        showToast('Bitte erfassen Sie mindestens die Tagesleistungen oder das Wetter.', 'warning');
        return;
    }

    const entry = {
        project_id: pId,
        datum,
        wetter,
        personal_eigen_anzahl: arbeiter,
        personal_eigen_stunden: stunden,
        geraete_json: geraete ? [{ geraet: geraete, stunden: 8 }] : [],
        tagesbericht: notiz,
        vorkommnisse_behinderungen: behinderungen
    };

    try {
        await window.api.saveBautagebuch(entry);
        showToast('Bautagebuch-Eintrag erfolgreich gespeichert.', 'success');
        if (document.getElementById('bautagebuch-notiz')) document.getElementById('bautagebuch-notiz').value = '';
        if (document.getElementById('bautagebuch-behinderungen')) document.getElementById('bautagebuch-behinderungen').value = '';
        loadProjektBautagebuch(pId);
    } catch (e) {
        console.error('Error saving bautagebuch:', e);
        showToast('Fehler beim Speichern des Tagesberichts.', 'error');
    }
}

// Abnahmeprotokoll Actions
let currentMaengelList = [];

async function loadProjektAbnahmen(projectId) {
    if (!window.api || !window.api.getAbnahmeprotokolle) return;
    try {
        const list = await window.api.getAbnahmeprotokolle(projectId);
        const container = document.getElementById('pd-abnahmen-container');
        if (!container) return;
        container.innerHTML = '';

        if (!list || list.length === 0) {
            container.innerHTML = '<p class="text-xs text-slate-400 italic">Noch kein Abnahmeprotokoll für dieses Projekt erstellt.</p>';
            return;
        }

        list.forEach(a => {
            const card = document.createElement('div');
            card.className = 'p-5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col gap-3';
            let statusPill = 'bg-emerald-100 text-emerald-800';
            if (a.abnahme_status === 'VERWEIGERT') statusPill = 'bg-red-100 text-red-800';
            else if (a.abnahme_status === 'MIT_VORBEHALT') statusPill = 'bg-amber-100 text-amber-800';

            card.innerHTML = `
                <div class="flex justify-between items-center">
                    <div>
                        <h4 class="font-bold text-slate-800 text-base">Förmliche Bauabnahme vom ${new Date(a.datum).toLocaleDateString()}</h4>
                        <p class="text-xs text-slate-500">Ort: ${a.ort || '-'} | AG: ${a.auftraggeber_vertreter} | AN: ${a.auftragnehmer_vertreter}</p>
                    </div>
                    <span class="px-3 py-1 rounded-full text-xs font-bold uppercase ${statusPill}">${a.abnahme_status.replace(/_/g, ' ')}</span>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-white p-3 rounded-lg border border-slate-200">
                    <div><span class="text-slate-400 block">Gewährleistungsbeginn:</span> <strong>${a.gewaehrleistung_beginn || a.datum}</strong></div>
                    <div><span class="text-slate-400 block">Gewährleistungsende:</span> <strong>${a.gewaehrleistung_ende}</strong> (${a.gewaehrleistung_jahre || 4} Jahre)</div>
                    <div><span class="text-slate-400 block">Sicherheitseinbehalt:</span> <strong>${a.sicherheitseinbehalt_prozent || 5}%</strong></div>
                    <div><span class="text-slate-400 block">Signaturen:</span> <strong>${a.unterschrift_ag_data ? '✓ AG signiert' : '-'} / ${a.unterschrift_an_data ? '✓ AN signiert' : '-'}</strong></div>
                </div>
            `;
            container.appendChild(card);
        });
    } catch (e) {
        console.error('Error loading abnahmen:', e);
    }
}

function openAbnahmeModal() {
    const modal = document.getElementById('abnahme-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    currentMaengelList = [];
    document.getElementById('abn-id').value = '';
    document.getElementById('abn-datum').value = new Date().toISOString().split('T')[0];
    document.getElementById('abn-ort').value = 'Baustelle';
    document.getElementById('abn-status').value = 'OHNE_VORBEHALT';
    document.getElementById('abn-ag-vertreter').value = '';
    document.getElementById('abn-an-vertreter').value = 'Bauleiter';

    renderMaengelList();
    initSignCanvas('signature-ag');
    initSignCanvas('signature-an');
}

function closeAbnahmeModal() {
    const modal = document.getElementById('abnahme-modal');
    if (modal) modal.classList.add('hidden');
}

function addMangelRow() {
    currentMaengelList.push({ mangel: '', frist: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0], status: 'OFFEN' });
    renderMaengelList();
}

function removeMangelRow(idx) {
    currentMaengelList.splice(idx, 1);
    renderMaengelList();
}

function renderMaengelList() {
    const container = document.getElementById('abn-maengel-list');
    if (!container) return;
    container.innerHTML = '';

    currentMaengelList.forEach((m, idx) => {
        const div = document.createElement('div');
        div.className = 'flex gap-2 items-center';
        div.innerHTML = `
            <input type="text" value="${m.mangel || ''}" onchange="currentMaengelList[${idx}].mangel = this.value" placeholder="Mangelbeschreibung (z.B. Kratzer an Türzarge EG links)" class="flex-1 px-3 py-1.5 border border-slate-300 rounded text-xs">
            <input type="date" value="${m.frist || ''}" onchange="currentMaengelList[${idx}].frist = this.value" class="px-2 py-1.5 border border-slate-300 rounded text-xs">
            <button type="button" onclick="removeMangelRow(${idx})" class="text-slate-400 hover:text-red-500 p-1">
                <span class="material-symbols-outlined text-[18px]">close</span>
            </button>
        `;
        container.appendChild(div);
    });
}

function initSignCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;

    let drawing = false;

    const startDraw = (e) => {
        drawing = true;
        ctx.beginPath();
        const rect = canvas.getBoundingClientRect();
        ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    };

    const draw = (e) => {
        if (!drawing) return;
        const rect = canvas.getBoundingClientRect();
        ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
        ctx.stroke();
    };

    const stopDraw = () => { drawing = false; };

    canvas.onmousedown = startDraw;
    canvas.onmousemove = draw;
    canvas.onmouseup = stopDraw;
    canvas.onmouseleave = stopDraw;
}

function clearCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

async function saveAbnahmeprotokollData() {
    const pId = window.currentViewProjektId;
    const datum = document.getElementById('abn-datum').value || new Date().toISOString().split('T')[0];
    const ort = document.getElementById('abn-ort').value || 'Baustelle';
    const abnahme_status = document.getElementById('abn-status').value;
    const auftraggeber_vertreter = document.getElementById('abn-ag-vertreter').value;
    const auftragnehmer_vertreter = document.getElementById('abn-an-vertreter').value;

    if (!auftraggeber_vertreter || !auftragnehmer_vertreter) {
        showToast('Bitte geben Sie die Namen beider Vertreter an.', 'warning');
        return;
    }

    const gewaehrleistung_ende = window.BautagebuchController ? window.BautagebuchController.calculateWarrantyEndDate(datum, 4) : '';

    const canvasAg = document.getElementById('signature-ag');
    const canvasAn = document.getElementById('signature-an');

    const abnahmeData = {
        project_id: pId,
        datum,
        ort,
        abnahme_status,
        auftraggeber_vertreter,
        auftragnehmer_vertreter,
        gewaehrleistung_beginn: datum,
        gewaehrleistung_ende,
        gewaehrleistung_jahre: 4,
        sicherheitseinbehalt_prozent: 5.0,
        maengel_json: currentMaengelList,
        unterschrift_ag_data: canvasAg ? canvasAg.toDataURL() : '',
        unterschrift_an_data: canvasAn ? canvasAn.toDataURL() : ''
    };

    try {
        await window.api.saveAbnahmeprotokoll(abnahmeData);
        showToast('Abnahmeprotokoll erfolgreich abgeschlossen.', 'success');
        closeAbnahmeModal();
        loadProjektAbnahmen(pId);
    } catch (e) {
        console.error('Error saving abnahmeprotokoll:', e);
        showToast('Fehler beim Speichern des Abnahmeprotokolls.', 'error');
    }
}

// --- CONTROLLING & EINGANGSRECHNUNGEN ---
async function loadProjektControlling(projectId) {
    if (!window.api || !window.api.getControllingStats) return;
    try {
        const stats = await window.api.getControllingStats(projectId);
        if (stats) {
            document.getElementById('ctrl-soll-gesamt').innerText = formatCurrency(stats.gesamtAuftragsvolumen);
            document.getElementById('ctrl-ist-gesamt').innerText = formatCurrency(stats.istKosten.gesamt);
            
            const dbEl = document.getElementById('ctrl-deckungsbeitrag');
            dbEl.innerText = formatCurrency(stats.deckungsbeitrag);
            dbEl.className = `text-2xl font-bold ${stats.deckungsbeitrag >= 0 ? 'text-emerald-600' : 'text-red-500'}`;

            document.getElementById('ctrl-marge-prozent').innerText = `${stats.margeProzent.toFixed(1)}%`;
            document.getElementById('ctrl-ist-lohn').innerText = formatCurrency(stats.istKosten.lohn);
            document.getElementById('ctrl-ist-material').innerText = formatCurrency(stats.istKosten.material);
            document.getElementById('ctrl-ist-sub').innerText = formatCurrency(stats.istKosten.subcontractor);
            document.getElementById('ctrl-ist-geraet').innerText = formatCurrency(stats.istKosten.geraet + stats.istKosten.sonstiges);
            document.getElementById('ctrl-bauabzug-gesamt').innerText = formatCurrency(stats.istKosten.bauabzugsteuer);
        }

        // Eingangsrechnungen Tabelle
        const erList = await window.api.getEingangsrechnungen(projectId);
        const tbody = document.getElementById('pd-eingangsrechnungen-body');
        const empty = document.getElementById('pd-eingangsrechnungen-empty');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!erList || erList.length === 0) {
            if (empty) empty.classList.remove('hidden');
            return;
        }
        if (empty) empty.classList.add('hidden');

        erList.forEach(er => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 transition-colors';

            let sec48bBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">Kein Sub</span>';
            if (er.kostenart === 'SUBCONTRACTOR') {
                if (er.bauabzugsteuer_einbehalten > 0) {
                    sec48bBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800" title="15% Bauabzugsteuer einbehalten: ${formatCurrency(er.bauabzugsteuer_einbehalten)}">15% Einbehalt</span>`;
                } else {
                    sec48bBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">§ 48b Gültig</span>';
                }
            }

            tr.innerHTML = `
                <td class="px-4 py-3 font-mono font-bold text-slate-800">${er.rechnungs_nr}</td>
                <td class="px-4 py-3 font-semibold text-slate-700">${er.lieferant_name || 'Lieferant'}</td>
                <td class="px-4 py-3 text-slate-500 text-xs">${new Date(er.rechnungs_datum).toLocaleDateString()}</td>
                <td class="px-4 py-3 text-xs uppercase font-bold text-slate-600">${er.kostenart}</td>
                <td class="px-4 py-3 text-right font-mono">${formatCurrency(er.betrag_netto)}</td>
                <td class="px-4 py-3 text-right font-mono font-bold">${formatCurrency(er.betrag_brutto)}</td>
                <td class="px-4 py-3 text-center">${sec48bBadge}</td>
                <td class="px-4 py-3 text-right">
                    <button onclick="deleteEingangsrechnungAction(${er.id})" class="p-1.5 hover:bg-red-50 text-red-600 rounded" title="Löschen">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error('Error loading controlling:', e);
    }
}

async function openEingangsrechnungModal() {
    const modal = document.getElementById('eingangsrechnung-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    document.getElementById('er-id').value = '';
    document.getElementById('er-nr').value = '';
    document.getElementById('er-datum').value = new Date().toISOString().split('T')[0];
    document.getElementById('er-faellig').value = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    document.getElementById('er-netto').value = '';
    document.getElementById('er-ust-satz').value = '19';
    document.getElementById('er-brutto').value = '';
    document.getElementById('er-sec48b-warnbox').classList.add('hidden');

    // Populate Lieferanten Select
    const select = document.getElementById('er-lieferant');
    select.innerHTML = '<option value="">-- Lieferant / Subunternehmer wählen --</option>';
    (state.kunden || []).forEach(k => {
        const opt = document.createElement('option');
        opt.value = k.id;
        opt.textContent = `${k.name} ${k.is_subcontractor ? '(Subunternehmer)' : ''}`;
        select.appendChild(opt);
    });
}

function closeEingangsrechnungModal() {
    const modal = document.getElementById('eingangsrechnung-modal');
    if (modal) modal.classList.add('hidden');
}

function calculateERBrutto() {
    const netto = parseFloat(document.getElementById('er-netto').value) || 0;
    const satz = parseFloat(document.getElementById('er-ust-satz').value) || 19;
    const brutto = netto * (1 + satz / 100);
    document.getElementById('er-brutto').value = brutto.toFixed(2);
    checkSubcontractorWarningInModal();
}

function checkSubcontractorWarningInModal() {
    const lieferantId = parseInt(document.getElementById('er-lieferant').value, 10);
    const kostenart = document.getElementById('er-kostenart').value;
    const warnBox = document.getElementById('er-sec48b-warnbox');

    if (!lieferantId || kostenart !== 'SUBCONTRACTOR') {
        warnBox.classList.add('hidden');
        return;
    }

    const lieferant = state.kunden.find(k => k.id === lieferantId);
    if (lieferant && lieferant.is_subcontractor) {
        const today = new Date().toISOString().split('T')[0];
        const isValid = lieferant.sec48b_status === 'VALID' && (!lieferant.sec48b_valid_until || lieferant.sec48b_valid_until >= today);
        if (!isValid) {
            warnBox.classList.remove('hidden');
            return;
        }
    }
    warnBox.classList.add('hidden');
}

async function saveEingangsrechnungData() {
    const pId = window.currentViewProjektId;
    const lieferant_id = parseInt(document.getElementById('er-lieferant').value, 10);
    const rechnungs_nr = document.getElementById('er-nr').value;
    const rechnungs_datum = document.getElementById('er-datum').value;
    const faelligkeits_datum = document.getElementById('er-faellig').value;
    const betrag_netto = parseFloat(document.getElementById('er-netto').value) || 0;
    const steuersatz = parseFloat(document.getElementById('er-ust-satz').value) || 19;
    const kostenart = document.getElementById('er-kostenart').value;

    if (!rechnungs_nr || betrag_netto <= 0) {
        showToast('Bitte geben Sie eine Rechnungsnummer und einen gültigen Betrag ein.', 'warning');
        return;
    }

    const rechnungData = {
        project_id: pId,
        lieferant_id: lieferant_id || null,
        rechnungs_nr,
        rechnungs_datum,
        faelligkeits_datum,
        betrag_netto,
        steuersatz,
        kostenart
    };

    try {
        const res = await window.api.saveEingangsrechnung(rechnungData);
        if (res && res.bauabzugsteuer > 0) {
            showToast(`Eingangsrechnung gespeichert. 15% Bauabzugsteuer (${formatCurrency(res.bauabzugsteuer)}) einbehalten!`, 'warning');
        } else {
            showToast('Eingangsrechnung erfolgreich gespeichert.', 'success');
        }
        closeEingangsrechnungModal();
        loadProjektControlling(pId);
    } catch (e) {
        console.error('Error saving eingangsrechnung:', e);
        showToast('Fehler beim Speichern der Eingangsrechnung.', 'error');
    }
}

async function deleteEingangsrechnungAction(erId) {
    const confirmed = await window.api.confirm({
        title: 'Eingangsrechnung löschen',
        message: 'Möchten Sie diesen Beleg wirklich löschen?'
    });
    if (confirmed) {
        await window.api.deleteEingangsrechnung(erId);
        showToast('Eingangsrechnung gelöscht.', 'success');
        loadProjektControlling(window.currentViewProjektId);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateProjektUmsatz,
        saveBautagebuchEntry,
        switchProjektTab
    };
}

