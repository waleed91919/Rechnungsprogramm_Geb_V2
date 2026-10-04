(function(global) {

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

        // Use the global calculateProjektUmsatz or calculate it
        let umsatz = 0;
        if (typeof calculateProjektUmsatz === 'function') {
            umsatz = calculateProjektUmsatz(projektRechnungen);
        } else {
             projektRechnungen.forEach(r => umsatz += parseFloat(r.brutto || 0));
        }


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

global.renderProjekte = renderProjekte;
global.createProjektCardElement = createProjektCardElement;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        renderProjekte,
        createProjektCardElement
    };
}

})(typeof window !== 'undefined' ? window : this);
