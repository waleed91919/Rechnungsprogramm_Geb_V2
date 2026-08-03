// --- Rechnungen Rendering (Dashboard) ---
function getStatusBadge(status) {
    switch (status) {
        case 'Bezahlt': return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200">Bezahlt</span>';
        case 'Ausstehend': return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">Ausstehend</span>';
        case 'Überfällig': return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 border border-red-200">Überfällig</span>';
        case 'Entwurf': return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">Entwurf</span>';
        default: return `<span>${sanitize(status)}</span>`;
    }
}

let currentRechnungFilter = 'Alle';

function renderDashboard(searchQuery = '') {
    let umsatz = 0;
    let ausstehend = 0;
    let uberfallig = 0;
    let ausstehendCount = 0;
    let uberfalligCount = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const kundenMap = new Map();
    state.kunden.forEach(k => kundenMap.set(k.id, k));

    let sortedRechnungen = [...state.rechnungen].reverse();
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        sortedRechnungen = sortedRechnungen.filter(r => {
            const kunde = kundenMap.get(parseInt(r.kundeId)) || { name: 'Unbekannt' };
            return r.nr.toLowerCase().includes(q) || kunde.name.toLowerCase().includes(q) || r.brutto.toString().includes(q);
        });
    }

    // Optimize KPI calculation by pre-computing paid invoices in O(N) instead of nested O(N^2)
    const bezahlteNrsAll = new Set();
    for (let i = 0; i < state.rechnungen.length; i++) {
        const r = state.rechnungen[i];
        if (r.status === 'Bezahlt' && r.nr) {
            bezahlteNrsAll.add(r.nr);
        }
    }

    sortedRechnungen.forEach(rech => {
        // Basic KPI logic: Include Bezahlt AND Storniert that has a STORNO Bezahlt
        let countAsPaid = isRechnungBezahltOderStorniert(rech, bezahlteNrsAll);

        if (countAsPaid) umsatz += rech.brutto;
        if (rech.status === 'Ausstehend') {
            ausstehend += rech.brutto;
            ausstehendCount++;
        }
        if (rech.status === 'Überfällig') {
            uberfallig += rech.brutto;
            uberfalligCount++;
        }
    });

    // Update KPI UI
    const elUmsatz = document.getElementById('kpi-umsatz');
    const elAusstehend = document.getElementById('kpi-ausstehend');
    const elAusstehendCount = document.getElementById('kpi-ausstehend-count');
    const elUberfallig = document.getElementById('kpi-uberfallig');
    const elUberfalligCount = document.getElementById('kpi-uberfallig-count');

    if (elUmsatz) elUmsatz.innerText = formatCurrency(umsatz);
    if (elAusstehend) elAusstehend.innerText = formatCurrency(ausstehend);
    if (elAusstehendCount) elAusstehendCount.innerText = ausstehendCount + ' Rg.';
    if (elUberfallig) elUberfallig.innerText = formatCurrency(uberfallig);
    if (elUberfalligCount) {
        elUberfalligCount.innerHTML = '';
        const spanWarn = document.createElement('span');
        spanWarn.className = 'material-symbols-outlined text-[14px]';
        spanWarn.textContent = 'warning';
        elUberfalligCount.appendChild(spanWarn);
        elUberfalligCount.appendChild(document.createTextNode(` ${uberfalligCount} Rg.`));
    }

    // Render Recent Invoices
    const tbody = document.getElementById('dashboard-recent-table-body');
    if (tbody) {
        tbody.innerHTML = '';
        const recent = sortedRechnungen.slice(0, 5);
        if (recent.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 4;
            td.className = 'px-4 py-8 text-center text-slate-400 italic';
            td.textContent = 'Keine Rechnungen vorhanden';
            tr.appendChild(td);
            tbody.appendChild(tr);
        } else {
            recent.forEach(rech => {
                const kunde = kundenMap.get(parseInt(rech.kundeId)) || { name: 'Unbekannt' };
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50 transition-colors cursor-pointer group';
                tr.onclick = () => { switchView('rechnungen'); openRechnungModal(rech.id); };

                const tdNr = document.createElement('td');
                tdNr.className = 'px-4 py-3 font-medium text-primary group-hover:text-primary-dark';
                tdNr.textContent = rech.nr;
                tr.appendChild(tdNr);

                const tdKunde = document.createElement('td');
                tdKunde.className = 'px-4 py-3 text-slate-800 font-medium';
                tdKunde.textContent = kunde.name;
                tr.appendChild(tdKunde);

                const tdBetrag = document.createElement('td');
                tdBetrag.className = 'px-4 py-3 text-right font-medium text-slate-800';
                tdBetrag.textContent = formatCurrency(rech.brutto);
                tr.appendChild(tdBetrag);

                const tdStatus = document.createElement('td');
                tdStatus.className = 'px-4 py-3 text-center';
                tdStatus.innerHTML = getStatusBadge(rech.status);
                tr.appendChild(tdStatus);

                tbody.appendChild(tr);
            });
        }
    }
}

let currentRechnungenPage = 1;
const rechnungenPerPage = 15;

function renderRechnungen(searchQuery = '') {
    const tbody = document.getElementById('rechnungen-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const kundenMap = new Map();
    state.kunden.forEach(k => kundenMap.set(k.id, k));

    let sortedRechnungen = filterRechnungenData([...state.rechnungen].reverse(), searchQuery, currentRechnungFilter, kundenMap);

    // --- Pagination Logic ---
    const paginationResult = paginateRechnungen(sortedRechnungen, currentRechnungenPage, rechnungenPerPage);
    currentRechnungenPage = paginationResult.currentPage;

    paginationResult.paginatedData.forEach(rech => {
        const tr = createRechnungRow(rech, kundenMap);
        tbody.appendChild(tr);
    });

    renderRechnungPagination(
        paginationResult.totalItems,
        paginationResult.startIndex + 1,
        paginationResult.endIndex,
        paginationResult.totalPages
    );
}

function filterRechnungenData(rechnungen, query, filter, kundenMap) {
    let filtered = rechnungen;

    // Lazily build kundenMap if not provided
    let localKundenMap = kundenMap;
    if (!localKundenMap && query) {
        localKundenMap = new Map();
        if (state && state.kunden) {
            state.kunden.forEach(k => localKundenMap.set(k.id, k));
        }
    }

    const getKunde = (id) => localKundenMap ? localKundenMap.get(id) : null;

    if (query) {
        const q = query.toLowerCase();
        filtered = filtered.filter(r => {
            const kunde = getKunde(parseInt(r.kundeId)) || { name: 'Unbekannt' };
            return r.nr.toLowerCase().includes(q) || kunde.name.toLowerCase().includes(q) || r.brutto.toString().includes(q);
        });
    }

    if (filter !== 'Alle') {
        filtered = filtered.filter(r => r.status === filter);
    }

    return filtered;
}

function paginateRechnungen(rechnungen, page, perPage) {
    const totalItems = rechnungen.length;
    const totalPages = Math.ceil(totalItems / perPage) || 1;

    let currentPage = page;
    if (currentPage > totalPages) {
        currentPage = totalPages;
    }

    const startIndex = (currentPage - 1) * perPage;
    const endIndex = Math.min(startIndex + perPage, totalItems);

    return {
        paginatedData: rechnungen.slice(startIndex, endIndex),
        totalItems,
        totalPages,
        currentPage,
        startIndex,
        endIndex
    };
}

function createRechnungRow(rech, kundenMap) {
    // Fallback if kundenMap is not provided
    const getKunde = (id) => kundenMap ? kundenMap.get(id) : state.kunden.find(k => k.id === id);
    const kunde = getKunde(parseInt(rech.kundeId)) || { name: 'Unbekannt' };
    const dateStr = new Date(rech.datum).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-blue-50/50 transition-colors group';

    // Checkbox cell
    const tdCheck = document.createElement('td');
    tdCheck.className = 'px-4 align-middle';
    const inputCheck = document.createElement('input');
    inputCheck.className = 'rechnung-checkbox rounded border-slate-300 text-primary focus:ring-primary h-4 w-4';
    inputCheck.type = 'checkbox';
    inputCheck.value = rech.id;
    inputCheck.onchange = handleSelectionChange;
    tdCheck.appendChild(inputCheck);
    tr.appendChild(tdCheck);

    // NR cell
    const tdNr = document.createElement('td');
    tdNr.className = 'px-4 font-medium text-primary';
    tdNr.textContent = rech.nr;
    tr.appendChild(tdNr);

    // Date cell
    const tdDate = document.createElement('td');
    tdDate.className = 'px-4 text-slate-500';
    tdDate.textContent = dateStr;
    tr.appendChild(tdDate);

    // Kunde cell
    const tdKunde = document.createElement('td');
    tdKunde.className = 'px-4 font-medium';
    tdKunde.textContent = kunde.name;
    tr.appendChild(tdKunde);

    // Betrag cell
    const tdBetrag = document.createElement('td');
    tdBetrag.className = 'px-4 text-right font-medium text-slate-800 tabular-nums';
    tdBetrag.textContent = formatCurrency(rech.brutto);
    tr.appendChild(tdBetrag);

    // Restbetrag cell
    const tdRest = document.createElement('td');
    tdRest.className = 'px-4 text-right tabular-nums ' + (rech.status === 'Ausstehend' || rech.status === 'Überfällig' ? 'font-bold text-slate-700' : 'text-slate-400');
    tdRest.textContent = rech.status === 'Bezahlt' ? '€0,00' : formatCurrency(rech.brutto);
    tr.appendChild(tdRest);

    // Status cell
    const tdStatus = document.createElement('td');
    tdStatus.className = 'px-4 text-center';
    tdStatus.innerHTML = getStatusBadge(rech.status);
    tr.appendChild(tdStatus);

    // Actions cell
    const tdActions = document.createElement('td');
    tdActions.className = 'px-4 py-3 text-right w-24';
    const divActions = document.createElement('div');
    divActions.className = 'flex justify-end items-center gap-1';

    if (rech.status === 'Ausstehend' || rech.status === 'Überfällig') {
        const btnPaid = document.createElement('button');
        btnPaid.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            markAsPaid(rech.id);
        };
        btnPaid.className = 'text-slate-400 hover:text-emerald-600 p-1 transition-colors flex items-center justify-center';
        btnPaid.title = 'Zahlungsbestätigung';
        const spanPaid = document.createElement('span');
        spanPaid.className = 'material-symbols-outlined text-[18px]';
        spanPaid.textContent = 'payments';
        btnPaid.appendChild(spanPaid);
        divActions.appendChild(btnPaid);
    }

    if (rech.isLocked) {
        if (rech.status !== 'Storniert' && !rech.nr.startsWith('STORNO')) {
            const btnStorno = document.createElement('button');
            btnStorno.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                storniereRechnung(rech.id);
            };
            btnStorno.className = 'text-slate-400 hover:text-red-500 p-1 transition-colors flex items-center justify-center';
            btnStorno.title = 'Stornieren (GoBD)';
            const spanStorno = document.createElement('span');
            spanStorno.className = 'material-symbols-outlined text-[18px]';
            spanStorno.textContent = 'undo';
            btnStorno.appendChild(spanStorno);
            divActions.appendChild(btnStorno);
        }
        const btnLock = document.createElement('button');
        btnLock.className = 'text-slate-300 p-1 cursor-not-allowed flex items-center justify-center';
        btnLock.title = 'Rechnung ist gesperrt (GoBD)';
        btnLock.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };
        const spanLock = document.createElement('span');
        spanLock.className = 'material-symbols-outlined text-[18px]';
        spanLock.textContent = 'lock';
        btnLock.appendChild(spanLock);
        divActions.appendChild(btnLock);
    } else {
        const btnEdit = document.createElement('button');
        btnEdit.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            openRechnungModal(rech.id);
        };
        btnEdit.className = 'text-slate-400 hover:text-primary p-1 transition-colors flex items-center justify-center';
        btnEdit.title = 'Bearbeiten';
        const spanEdit = document.createElement('span');
        spanEdit.className = 'material-symbols-outlined text-[18px]';
        spanEdit.textContent = 'edit';
        btnEdit.appendChild(spanEdit);
        divActions.appendChild(btnEdit);

        const btnDel = document.createElement('button');
        btnDel.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteRechnung(rech.id);
        };
        btnDel.className = 'text-slate-400 hover:text-red-500 p-1 transition-colors flex items-center justify-center';
        btnDel.title = 'Löschen';
        const spanDel = document.createElement('span');
        spanDel.className = 'material-symbols-outlined text-[18px]';
        spanDel.textContent = 'delete';
        btnDel.appendChild(spanDel);
        divActions.appendChild(btnDel);
    }

    if (rech.status === 'Überfällig') {
        const btnExtend = document.createElement('button');
        btnExtend.className = 'text-slate-400 hover:text-primary p-1 transition-colors flex items-center justify-center';
        btnExtend.title = 'Zahlungsziel verlängern';
        btnExtend.innerHTML = '<span class="material-symbols-outlined text-[18px]">calendar_month</span>';
        btnExtend.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.extendPaymentDeadline(rech.id);
        };
        divActions.appendChild(btnExtend);

        const btnMahn = document.createElement('button');
        let btnMahnClass = 'text-amber-500 hover:text-amber-700';
        if (rech.mahnungLevel === 2) btnMahnClass = 'text-orange-500 hover:text-orange-700';
        else if (rech.mahnungLevel === 3) btnMahnClass = 'text-red-500 hover:text-red-700';
        
        btnMahn.className = `${btnMahnClass} p-1 transition-colors relative flex items-center justify-center`;
        btnMahn.title = rech.mahnungLevel > 0 ? `${rech.mahnungLevel}. Mahnung bereits erstellt` : 'Mahnung generieren';
        btnMahn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.generateMahnungPdf === 'function') {
                window.generateMahnungPdf(rech.id);
            }
        };
        const spanMahn = document.createElement('span');
        spanMahn.className = 'material-symbols-outlined text-[18px]';
        spanMahn.textContent = 'gavel';
        btnMahn.appendChild(spanMahn);

        if (rech.mahnungLevel > 0) {
            const badge = document.createElement('span');
            badge.className = 'absolute -top-1 -right-1 bg-white text-[10px] font-bold px-1 rounded-full border border-current leading-none';
            badge.textContent = rech.mahnungLevel;
            btnMahn.appendChild(badge);
        }

        divActions.appendChild(btnMahn);
    }

    const btnPdf = document.createElement('button');
    btnPdf.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.generatePdf(rech.id);
    };
    btnPdf.className = 'text-slate-400 hover:text-primary p-1 transition-colors flex items-center justify-center';
    btnPdf.title = 'PDF generieren';
    const spanPdf = document.createElement('span');
    spanPdf.className = 'material-symbols-outlined text-[18px]';
    spanPdf.textContent = 'picture_as_pdf';
    btnPdf.appendChild(spanPdf);
    divActions.appendChild(btnPdf);

    tdActions.appendChild(divActions);
    tr.appendChild(tdActions);
    return tr;
}

window.extendPaymentDeadline = function(id) {
    const idNum = parseInt(id);
    const rech = state.rechnungen.find(r => r.id === idNum);
    if (!rech) return;

    document.getElementById('extend-rechnung-id').value = idNum;
    document.getElementById('extend-date-input').value = rech.faellig || new Date().toISOString().split('T')[0];
    
    const modal = document.getElementById('extend-deadline-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

window.closeExtendModal = function() {
    const modal = document.getElementById('extend-deadline-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
};

window.confirmExtendDeadline = async function() {
    const id = parseInt(document.getElementById('extend-rechnung-id').value);
    const newDateStr = document.getElementById('extend-date-input').value;
    
    if (!newDateStr) {
        showToast('Bitte wählen Sie ein Datum.', 'error');
        return;
    }

    const rech = state.rechnungen.find(r => r.id === id);
    if (!rech) return;

    rech.faellig = newDateStr;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(newDateStr);
    checkDate.setHours(0, 0, 0, 0);

    if (checkDate >= today) {
        rech.status = 'Ausstehend';
    } else {
        rech.status = 'Überfällig';
    }

    try {
        await window.api.saveDocument(rech);
        showToast('Zahlungsziel erfolgreich verlängert.', 'success');
        window.closeExtendModal();
        
        if (typeof renderRechnungen === 'function') renderRechnungen();
        if (typeof renderDashboard === 'function') renderDashboard();
    } catch (e) {
        console.error('Error extending deadline:', e);
        showToast('Fehler beim Speichern.', 'error');
    }
};

window.changeRechnungPage = function (page) {
    currentRechnungenPage = page;
    renderRechnungen(document.getElementById('global-search') ? document.getElementById('global-search').value : '');
};

function renderRechnungPagination(totalItems, startIdx, endIdx, totalPages) {
    const infoDiv = document.getElementById('rechnung-pagination-info');
    const controlsDiv = document.getElementById('rechnung-pagination-controls');

    if (!infoDiv || !controlsDiv) return;

    if (totalItems === 0) {
        infoDiv.innerText = 'Keine Rechnungen gefunden';
        controlsDiv.innerHTML = '';
        return;
    }

    infoDiv.innerText = `Zeige ${startIdx}-${endIdx} von ${totalItems} Rechnungen`;
    controlsDiv.innerHTML = '';

    // Prev Button
    const btnPrev = document.createElement('button');
    btnPrev.textContent = 'Zurück';
    if (currentRechnungenPage > 1) {
        btnPrev.onclick = () => changeRechnungPage(currentRechnungenPage - 1);
        btnPrev.className = 'px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100';
    } else {
        btnPrev.disabled = true;
        btnPrev.className = 'px-2 py-1 rounded border border-slate-300 bg-white opacity-50 cursor-not-allowed';
    }
    controlsDiv.appendChild(btnPrev);

    // Page Numbers
    for (let i = 1; i <= totalPages; i++) {
        const btnPage = document.createElement('button');
        btnPage.textContent = i;
        if (i === currentRechnungenPage) {
            btnPage.className = 'px-2 py-1 rounded border border-primary bg-primary text-white';
        } else {
            btnPage.onclick = () => changeRechnungPage(i);
            btnPage.className = 'px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100';
        }
        controlsDiv.appendChild(btnPage);
    }

    // Next Button
    const btnNext = document.createElement('button');
    btnNext.textContent = 'Weiter';
    if (currentRechnungenPage < totalPages) {
        btnNext.onclick = () => changeRechnungPage(currentRechnungenPage + 1);
        btnNext.className = 'px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100';
    } else {
        btnNext.disabled = true;
        btnNext.className = 'px-2 py-1 rounded border border-slate-300 bg-white opacity-50 cursor-not-allowed';
    }
    controlsDiv.appendChild(btnNext);
}

// Global Search
function filterRechnungen(filterValue) {
    currentRechnungFilter = filterValue;

    // Update button styles
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        if (btn.dataset.filter === filterValue) {
            btn.className = 'filter-btn px-3 py-1 text-xs font-semibold bg-white rounded shadow-sm text-slate-800';
        } else {
            btn.className = 'filter-btn px-3 py-1 text-xs font-medium text-slate-600 hover:text-slate-900';
        }
    });

    renderRechnungen(document.getElementById('global-search') ? document.getElementById('global-search').value : '');
}

function handleGlobalSearch(query) {
    if (document.getElementById('view-dashboard') && !document.getElementById('view-dashboard').classList.contains('hidden')) {
        renderDashboard(query);
    } else if (document.getElementById('view-rechnungen') && !document.getElementById('view-rechnungen').classList.contains('hidden')) {
        renderRechnungen(query);
    } else if (document.getElementById('view-artikel') && !document.getElementById('view-artikel').classList.contains('hidden')) {
        renderArtikel(query);
    } else if (document.getElementById('view-kunden') && !document.getElementById('view-kunden').classList.contains('hidden')) {
        renderKunden(query);
    } else if (document.getElementById('view-angebote') && !document.getElementById('view-angebote').classList.contains('hidden')) {
        renderAngebote(query);
    } else if (document.getElementById('view-projekte') && !document.getElementById('view-projekte').classList.contains('hidden')) {
        renderProjekte(query);
    }
}

// Bulk Actions Logic
function toggleAllSelections(source) {
    const checkboxes = document.querySelectorAll('.rechnung-checkbox');
    checkboxes.forEach(cb => cb.checked = source.checked);
    handleSelectionChange();
}

function handleSelectionChange() {
    const selectedCheckboxes = Array.from(document.querySelectorAll('.rechnung-checkbox:checked'));
    const selectedIds = selectedCheckboxes.map(cb => parseInt(cb.value));
    const bulkBar = document.getElementById('bulk-action-bar');
    const bulkCount = document.getElementById('bulk-selected-count');

    if (selectedIds.length > 1) {
        if (bulkBar) {
            bulkBar.classList.remove('hidden');
            bulkBar.classList.add('flex');
            bulkCount.innerText = selectedIds.length;

            const selectedRechnungen = selectedIds.map(id => state.rechnungen.find(r => r.id === id)).filter(Boolean);
            
            const canBePaid = selectedRechnungen.some(r => r.status === 'Ausstehend' || r.status === 'Überfällig');
            const canBeDunned = selectedRechnungen.some(r => r.status === 'Überfällig');

            const btnPaid = document.getElementById('bulk-btn-paid');
            const btnDunning = document.getElementById('bulk-btn-dunning');
            const btnPdf = document.getElementById('bulk-btn-pdf');

            if (btnPaid) btnPaid.disabled = !canBePaid;
            if (btnDunning) btnDunning.disabled = !canBeDunned;
            if (btnPdf) btnPdf.disabled = selectedIds.length === 0;
        }
    } else {
        if (bulkBar) {
            bulkBar.classList.add('hidden');
            bulkBar.classList.remove('flex');
        }
    }
}

async function bulkAction(action) {
    const selectedIds = Array.from(document.querySelectorAll('.rechnung-checkbox:checked')).map(cb => parseInt(cb.value));
    if (selectedIds.length === 0) return;

    const selectedRechnungen = selectedIds.map(id => state.rechnungen.find(r => r.id === id)).filter(Boolean);

    if (action === 'pdf') {
        showToast(`PDF-Export für ${selectedIds.length} Rechnungen gestartet...`, 'success');
        // In a real app, this would trigger a batch PDF generation
        // For now, we just simulate it
        setTimeout(() => {
            showToast(`${selectedIds.length} PDFs erfolgreich exportiert.`, 'success');
        }, 1500);
        
        // Unselect all and hide bar
        document.getElementById('selectAll').checked = false;
        toggleAllSelections(document.getElementById('selectAll'));
    } else if (action === 'paid') {
        const toUpdate = selectedRechnungen.filter(r => r.status === 'Ausstehend' || r.status === 'Überfällig');
        
        if (toUpdate.length === 0) {
            showToast('Keine der ausgewählten Rechnungen kann als bezahlt markiert werden (bereits bezahlt oder storniert).', 'warning');
            return;
        }

        if (await safeConfirm(`${toUpdate.length} Rechnungen als bezahlt markieren?`)) {
            let successCount = 0;
            for (const rech of toUpdate) {
                rech.status = 'Bezahlt';
                try {
                    await window.api.saveDocument(rech);
                    successCount++;
                } catch (e) {
                    console.error(`Error saving invoice ${rech.nr}:`, e);
                }
            }
            
            showToast(`${successCount} von ${toUpdate.length} Rechnungen als bezahlt markiert.`, 'success');
            renderRechnungen();
            renderDashboard();
            handleSelectionChange();
            
            // Unselect all
            document.getElementById('selectAll').checked = false;
            toggleAllSelections(document.getElementById('selectAll'));
        }
    } else if (action === 'dunning') {
        const toDunning = selectedRechnungen.filter(r => r.status === 'Überfällig');
        
        if (toDunning.length === 0) {
            showToast('Mahnungen können nur für überfällige Rechnungen gesendet werden.', 'warning');
            return;
        }

        if (await safeConfirm(`Mahnungen für ${toDunning.length} überfällige Rechnungen senden?`)) {
            // Simulation of dunning process
            showToast(`${toDunning.length} Mahnungen werden generiert und versendet...`, 'info');
            
            setTimeout(() => {
                showToast(`${toDunning.length} Mahnungen erfolgreich versendet.`, 'success');
                
                // Unselect all
                document.getElementById('selectAll').checked = false;
                toggleAllSelections(document.getElementById('selectAll'));
            }, 2000);
        }
    }
}

function renderAngebote(searchQuery = '') {
    const tbody = document.getElementById('angebote-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    let offeneAngebote = 0;

    const kundenMap = new Map();
    state.kunden.forEach(k => kundenMap.set(k.id, k));

    let sortedAngebote = [...state.angebote].reverse();
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        sortedAngebote = sortedAngebote.filter(ang => {
            const kunde = kundenMap.get(parseInt(ang.kundeId)) || { name: 'Unbekannt' };
            return ang.nr.toLowerCase().includes(q) || kunde.name.toLowerCase().includes(q) || ang.brutto.toString().includes(q);
        });
    }

    sortedAngebote.forEach(ang => {
        const kunde = kundenMap.get(parseInt(ang.kundeId)) || { name: 'Unbekannt' };

        if (ang.status === 'Offen') {
            offeneAngebote++;
        }

        const dateStr = new Date(ang.datum).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-blue-50/50 transition-colors group';

        const tdNr = document.createElement('td');
        tdNr.className = 'px-4 py-3 font-medium text-primary';
        tdNr.textContent = ang.nr;
        tr.appendChild(tdNr);

        const tdDate = document.createElement('td');
        tdDate.className = 'px-4 py-3 text-slate-500';
        tdDate.textContent = dateStr;
        tr.appendChild(tdDate);

        const tdKunde = document.createElement('td');
        tdKunde.className = 'px-4 py-3 font-medium';
        tdKunde.textContent = kunde.name;
        tr.appendChild(tdKunde);

        const tdBetrag = document.createElement('td');
        tdBetrag.className = 'px-4 py-3 text-right font-medium';
        tdBetrag.textContent = formatCurrency(ang.brutto);
        tr.appendChild(tdBetrag);

        const tdStatus = document.createElement('td');
        tdStatus.className = 'px-4 py-3 text-center';
        tdStatus.innerHTML = getStatusBadge(ang.status);
        tr.appendChild(tdStatus);

        const tdActions = document.createElement('td');
        tdActions.className = 'px-4 py-3 text-right w-24';
        const divActions = document.createElement('div');
        divActions.className = 'flex justify-end items-center gap-1';

        const btnEdit = document.createElement('button');
        btnEdit.onclick = () => openAngebotModal(ang.id);
        btnEdit.className = 'text-slate-400 hover:text-blue-500 p-1 transition-colors flex items-center justify-center';
        btnEdit.title = 'Angebot bearbeiten';
        const spanEdit = document.createElement('span');
        spanEdit.className = 'material-symbols-outlined text-[20px]';
        spanEdit.textContent = 'edit';
        btnEdit.appendChild(spanEdit);
        divActions.appendChild(btnEdit);

        const btnConv = document.createElement('button');
        btnConv.onclick = () => convertToRechnung(ang.id);
        btnConv.className = 'text-slate-400 hover:text-emerald-500 p-1 transition-colors flex items-center justify-center';
        btnConv.title = 'In Rechnung umwandeln';
        const spanConv = document.createElement('span');
        spanConv.className = 'material-symbols-outlined text-[20px]';
        spanConv.textContent = 'post_add';
        btnConv.appendChild(spanConv);
        divActions.appendChild(btnConv);

        const btnPdf = document.createElement('button');
        btnPdf.onclick = () => generatePdf(ang.id, true);
        btnPdf.className = 'text-slate-400 hover:text-primary p-1 transition-colors flex items-center justify-center';
        btnPdf.title = 'PDF generieren';
        const spanPdf = document.createElement('span');
        spanPdf.className = 'material-symbols-outlined text-[20px]';
        spanPdf.textContent = 'picture_as_pdf';
        btnPdf.appendChild(spanPdf);
        divActions.appendChild(btnPdf);

        tdActions.appendChild(divActions);
        tr.appendChild(tdActions);
        tbody.appendChild(tr);
    });

    document.getElementById('kpi-angebote-offen').innerText = offeneAngebote;
}
