(function(global) {

const _calcProjektUmsatz = (typeof window !== 'undefined' && window.calculateProjektUmsatz) 
    ? window.calculateProjektUmsatz 
    : (typeof module !== 'undefined' && module.exports ? require('./project-calculations.js').calculateProjektUmsatz : null);

function updateProjektHeaderUI(p, kunde) {
    document.getElementById('pd-name').innerText = p.name;
    document.getElementById('pd-kunde').innerText = kunde.name;

    let statusColor = 'bg-slate-100 text-slate-800 border-slate-200';
    if (p.status === 'Geplant') statusColor = 'bg-blue-100 text-blue-800 border-blue-200';
    else if (p.status === 'In Bearbeitung') statusColor = 'bg-amber-100 text-amber-800 border-amber-200';
    else if (p.status === 'Abgeschlossen') statusColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
    else if (p.status === 'Abgebrochen') statusColor = 'bg-red-100 text-red-800 border-red-200';

    const stEl = document.getElementById('pd-status');
    stEl.innerText = p.status || 'Aktiv';
    stEl.className = `px-3 py-1 rounded text-xs font-bold uppercase tracking-wider border ${statusColor}`;
}

function updateProjektStatusUI(p) {
    let statusColor = 'bg-slate-100 text-slate-800 border-slate-200';
    if (p.status === 'Geplant') statusColor = 'bg-blue-100 text-blue-800 border-blue-200';
    else if (p.status === 'In Bearbeitung') statusColor = 'bg-amber-100 text-amber-800 border-amber-200';
    else if (p.status === 'Abgeschlossen') statusColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
    else if (p.status === 'Abgebrochen') statusColor = 'bg-red-100 text-red-800 border-red-200';

    const stEl = document.getElementById('pd-status');
    if (stEl) {
        stEl.innerText = p.status || 'Aktiv';
        stEl.className = `px-3 py-1 rounded text-xs font-bold uppercase tracking-wider border ${statusColor}`;
    }
}

function updateProjektNotizenUI(p) {
    const notEl = document.getElementById('pd-notizen');
    if (notEl) {
        notEl.innerText = p.notizen || '- Keine Notizen -';
    }
}

function showProjektDetails(id) {
    const p = state.projekte.find(x => x.id === id);
    if (!p) return;

    const kunde = state.kunden.find(k => k.id === p.kundeId) || { name: 'Unbekannt' };

    updateProjektHeaderUI(p, kunde);
    updateProjektNotizenUI(p);

    const pRechnungen = state.rechnungen.filter(r => r.projektId === id && r.status !== 'Entwurf');
    const pAngebote = state.angebote.filter(a => a.projektId === id);

    const paidStornoOriginalNrs = new Set();
    for (const r of state.rechnungen) {
        if (r.status === 'Bezahlt' && r.nr && r.nr.startsWith('STORNO - ')) {
            paidStornoOriginalNrs.add(r.nr.substring(9));
        }
    }

    let umsatz = 0;
    if (_calcProjektUmsatz) {
        umsatz = _calcProjektUmsatz(pRechnungen, paidStornoOriginalNrs);
    } else {
         pRechnungen.forEach(r => umsatz += parseFloat(r.brutto || 0));
    }
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
    if (!rBody) return;
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
        if (rEmpty) rEmpty.classList.add('hidden');
    } else {
        rBody.parentElement.classList.add('hidden');
        if (rEmpty) rEmpty.classList.remove('hidden');
    }
}

function populateProjektAngeboteTable(pAngebote) {
    const aBody = document.getElementById('pd-angebote-body');
    const aEmpty = document.getElementById('pd-angebote-empty');
    if (!aBody) return;
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
        if (aEmpty) aEmpty.classList.add('hidden');
    } else {
        aBody.parentElement.classList.add('hidden');
        if (aEmpty) aEmpty.classList.remove('hidden');
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
        if (typeof loadProjektAufmassBlaetter === 'function') loadProjektAufmassBlaetter(pId);
    } else if (tabKey === 'nachtraege') {
        if (typeof loadProjektNachtraege === 'function') loadProjektNachtraege(pId);
    } else if (tabKey === 'bautagebuch') {
        if (typeof loadProjektBautagebuch === 'function') loadProjektBautagebuch(pId);
        if (typeof loadProjektAbnahmen === 'function') loadProjektAbnahmen(pId);
    } else if (tabKey === 'controlling') {
        if (typeof loadProjektControlling === 'function') loadProjektControlling(pId);
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

global.showProjektDetails = showProjektDetails;
global.updateProjektHeaderUI = updateProjektHeaderUI;
global.updateProjektStatusUI = updateProjektStatusUI;
global.updateProjektNotizenUI = updateProjektNotizenUI;
global.updateProjektProgressUI = updateProjektProgressUI;
global.populateProjektRechnungenTable = populateProjektRechnungenTable;
global.populateProjektAngeboteTable = populateProjektAngeboteTable;
global.createRechnungForProjekt = createRechnungForProjekt;
global.createAngebotForProjekt = createAngebotForProjekt;
global.closeProjektDetails = closeProjektDetails;
global.switchProjektTab = switchProjektTab;
global.loadProjektEFB = loadProjektEFB;
global.loadProjektKalkulation = loadProjektKalkulation;
global.loadProjektMaengel = loadProjektMaengel;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        showProjektDetails,
        updateProjektHeaderUI,
        updateProjektStatusUI,
        updateProjektNotizenUI,
        updateProjektProgressUI,
        populateProjektRechnungenTable,
        populateProjektAngeboteTable,
        createRechnungForProjekt,
        createAngebotForProjekt,
        closeProjektDetails,
        switchProjektTab,
        loadProjektEFB,
        loadProjektKalkulation,
        loadProjektMaengel
    };
}

})(typeof window !== 'undefined' ? window : this);
