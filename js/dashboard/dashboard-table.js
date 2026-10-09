// --- Rechnungen Rendering (Dashboard) ---
function getStatusBadge(status) {
  switch (status) {
    case 'Bezahlt':
      return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200">Bezahlt</span>';
    case 'Ausstehend':
      return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">Ausstehend</span>';
    case 'Überfällig':
      return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 border border-red-200">Überfällig</span>';
    case 'Entwurf':
      return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">Entwurf</span>';
    default:
      return `<span>${sanitize(status)}</span>`;
  }
}

window.currentRechnungFilter = 'Alle';

window.currentRechnungenPage = 1;

window.rechnungenPerPage = 15;

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
  renderRechnungPagination(paginationResult.totalItems, paginationResult.startIndex + 1, paginationResult.endIndex, paginationResult.totalPages);
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
  const getKunde = id => localKundenMap ? localKundenMap.get(id) : null;
  if (query) {
    const q = query.toLowerCase();
    filtered = filtered.filter(r => {
      const kunde = getKunde(parseInt(r.kundeId)) || {
        name: 'Unbekannt'
      };
      const rNr = r.nr ? String(r.nr).toLowerCase() : '';
      const kName = kunde.name ? String(kunde.name).toLowerCase() : '';
      const rBrutto = r.brutto !== undefined && r.brutto !== null ? String(r.brutto) : '';
      return rNr.includes(q) || kName.includes(q) || rBrutto.includes(q);
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
  const getKunde = id => kundenMap ? kundenMap.get(id) : state.kunden.find(k => k.id === id);
  const kunde = getKunde(parseInt(rech.kundeId)) || {
    name: 'Unbekannt'
  };
  const dateStr = rech.datum ? new Date(rech.datum).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }) : '-';
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

  // Rechnungsart cell
  const tdArt = document.createElement('td');
  tdArt.className = 'px-4 text-center';
  const artType = rech.rechnungsart || 'REGULAER';
  let badgeClass = 'bg-slate-100 text-slate-700';
  let badgeText = 'Einzelrechnung';
  if (artType === 'ABSCHLAG_KUMULIERT' || artType === 'TEILRECHNUNG') {
    badgeClass = 'bg-indigo-100 text-indigo-800 border border-indigo-200';
    badgeText = 'Abschlagsrechnung';
  } else if (artType === 'SCHLUSSRECHNUNG') {
    badgeClass = 'bg-emerald-100 text-emerald-800 border border-emerald-200';
    badgeText = 'Schlussrechnung';
  } else if (rech.nr && (rech.nr.startsWith('STORNO') || rech.status === 'Storniert')) {
    badgeClass = 'bg-red-100 text-red-800 border border-red-200';
    badgeText = 'Storno';
  }
  tdArt.innerHTML = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${badgeClass}">${badgeText}</span>`;
  tr.appendChild(tdArt);

  // Betrag cell
  const tdBetrag = document.createElement('td');
  tdBetrag.className = 'px-4 text-right font-medium text-slate-800 tabular-nums';
  tdBetrag.textContent = formatCurrency(rech.brutto);
  tr.appendChild(tdBetrag);

  // Restbetrag cell
  const tdRest = document.createElement('td');
  tdRest.className = 'px-4 text-right tabular-nums ' + (rech.status === 'Ausstehend' || rech.status === 'Überfällig' ? 'font-bold text-slate-700' : 'text-slate-400');
  const offenAmt = rech.offener_betrag !== undefined ? parseFloat(rech.offener_betrag) : parseFloat(rech.brutto || 0);
  tdRest.textContent = offenAmt <= 0.009 ? '€0,00' : formatCurrency(offenAmt);
  tr.appendChild(tdRest);

  // Status cell
  const tdStatus = document.createElement('td');
  tdStatus.className = 'px-4 text-center';
  let finalStatusHtml = getStatusBadge(rech.status);
  
  const today = new Date();
  today.setHours(0,0,0,0);
  const datumObj = rech.datum ? new Date(rech.datum) : today;
  const diffDays = Math.floor((today - datumObj) / (1000 * 60 * 60 * 24));
  
  let fristHtml = '';
  if (rech.rechnungsart === 'ABSCHLAG_KUMULIERT' || rech.rechnungsart === 'TEILRECHNUNG') {
      const remaining = 21 - diffDays;
      if (remaining >= 0) {
          fristHtml = `<br><span class="text-[10px] text-slate-500 block mt-1" title="VOB/B §16 Abs.1 Nr.3">Abschlag fällig in ${remaining} Tagen</span>`;
      } else {
          fristHtml = `<br><span class="text-[10px] text-red-500 font-medium block mt-1" title="VOB/B §16 Abs.1 Nr.3">Abschlag überfällig seit ${Math.abs(remaining)} Tagen</span>`;
      }
  } else if (rech.rechnungsart === 'SCHLUSSRECHNUNG') {
      fristHtml = `<br><span class="text-[10px] text-slate-500 block mt-1 leading-tight" title="VOB/B §16 Abs.3 Nr.1 / §14 Abs.3">VOB 30-Tage Schluss<br>12-Werktage-Einreichung<br><span class="italic text-[9px]">unbestrittenes Guthaben sofort als Abschlag zahlen</span></span>`;
  }
  
  if (rech.status === 'Ausstehend' && diffDays >= 30) {
      finalStatusHtml = getStatusBadge('Überfällig');
      fristHtml += '<span class="text-[10px] text-red-500 font-medium block mt-1">30-Tage-Verzug (Auto)</span>';
  }
  
  tdStatus.innerHTML = finalStatusHtml + fristHtml;
  tr.appendChild(tdStatus);

  // Actions cell
  const tdActions = document.createElement('td');
  tdActions.className = 'px-4 py-3 text-right w-36';
  const divActions = document.createElement('div');
  divActions.className = 'flex justify-end items-center gap-1';

  // Schnell-Download Buttons: PDF / ZUGFeRD & XRechnung XML
  const btnPdf = document.createElement('button');
  btnPdf.onclick = e => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof window.generatePdf === 'function') {
      window.generatePdf(rech.id);
    }
  };
  btnPdf.className = 'text-slate-400 hover:text-indigo-600 p-1 transition-colors flex items-center justify-center';
  btnPdf.title = 'PDF herunterladen';
  btnPdf.setAttribute('aria-label', `PDF für Rechnung ${rech.nr} herunterladen`);
  btnPdf.innerHTML = '<span class="material-symbols-outlined text-[18px]">picture_as_pdf</span>';
  divActions.appendChild(btnPdf);
  const btnXml = document.createElement('button');
  btnXml.onclick = e => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof window.downloadXRechnungXML === 'function') {
      window.downloadXRechnungXML(rech.id);
    }
  };
  btnXml.className = 'text-slate-400 hover:text-blue-600 p-1 transition-colors flex items-center justify-center';
  btnXml.title = 'XRechnung XML (EN 16931) herunterladen';
  btnXml.setAttribute('aria-label', `XRechnung XML für Rechnung ${rech.nr} herunterladen`);
  btnXml.innerHTML = '<span class="material-symbols-outlined text-[18px]">code</span>';
  divActions.appendChild(btnXml);
  const btnZugferd = document.createElement('button');
  btnZugferd.onclick = e => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof window.downloadZugferdPdf === 'function') {
      window.downloadZugferdPdf(rech.id);
    }
  };
  btnZugferd.className = 'text-slate-400 hover:text-violet-600 p-1 transition-colors flex items-center justify-center';
  btnZugferd.title = 'ZUGFeRD 2.x PDF/A-3 (E-Rechnung) herunterladen';
  btnZugferd.setAttribute('aria-label', `ZUGFeRD E-Rechnung für Rechnung ${rech.nr} herunterladen`);
  btnZugferd.innerHTML = '<span class="material-symbols-outlined text-[18px]">receipt_long</span>';
  divActions.appendChild(btnZugferd);
  if (rech.status === 'Ausstehend' || rech.status === 'Überfällig') {
    const btnPaid = document.createElement('button');
    btnPaid.onclick = e => {
      e.preventDefault();
      e.stopPropagation();
      markAsPaid(rech.id);
    };
    btnPaid.className = 'text-slate-400 hover:text-emerald-600 p-1 transition-colors flex items-center justify-center';
    btnPaid.title = 'Zahlungsbestätigung';
    btnPaid.setAttribute('aria-label', `Rechnung ${rech.nr} als bezahlt markieren`);
    const spanPaid = document.createElement('span');
    spanPaid.className = 'material-symbols-outlined text-[18px]';
    spanPaid.textContent = 'payments';
    btnPaid.appendChild(spanPaid);
    divActions.appendChild(btnPaid);
  }
  if (rech.isLocked) {
    if (rech.status !== 'Storniert' && (!rech.nr || !rech.nr.startsWith('STORNO'))) {
      const btnStorno = document.createElement('button');
      btnStorno.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        storniereRechnung(rech.id);
      };
      btnStorno.className = 'text-slate-400 hover:text-red-500 p-1 transition-colors flex items-center justify-center';
      btnStorno.title = 'Stornieren (GoBD)';
      btnStorno.setAttribute('aria-label', `Rechnung ${rech.nr} stornieren`);
      const spanStorno = document.createElement('span');
      spanStorno.className = 'material-symbols-outlined text-[18px]';
      spanStorno.textContent = 'undo';
      btnStorno.appendChild(spanStorno);
      divActions.appendChild(btnStorno);
      // J13: Minderungs-Gutschrift (Teilbetrag, ohne Voll-Storno)
      const nrUpper = String(rech.nr || '').toUpperCase();
      const istKorrekturbeleg = nrUpper.startsWith('STORNO') || nrUpper.startsWith('GUT-');
      if (!istKorrekturbeleg) {
        const btnGut = document.createElement('button');
        btnGut.onclick = e => {
          e.preventDefault();
          e.stopPropagation();
          const betragStr = window.prompt(`Minderungsbetrag (netto, €) für Rechnung ${rech.nr}:`, '');
          if (betragStr === null) return;
          const grund = window.prompt('Minderungsgrund (optional, z. B. VOB/B § 13 Abs. 6):', '') || '';
          buchenGutschrift(rech.id, betragStr, grund);
        };
        btnGut.className = 'text-slate-400 hover:text-amber-600 p-1 transition-colors flex items-center justify-center';
        btnGut.title = 'Minderungs-Gutschrift (ohne Voll-Storno)';
        btnGut.setAttribute('aria-label', `Minderungs-Gutschrift für Rechnung ${rech.nr} erstellen`);
        const spanGut = document.createElement('span');
        spanGut.className = 'material-symbols-outlined text-[18px]';
        spanGut.textContent = 'price_check';
        btnGut.appendChild(spanGut);
        divActions.appendChild(btnGut);
      }
    }
    const btnLock = document.createElement('button');
    btnLock.className = 'text-slate-400 p-1 transition-colors flex items-center justify-center opacity-50 cursor-not-allowed';
    btnLock.title = 'GoBD-gesperrt — bitte Storno (InvoiceController 627-669) nutzen.';
    btnLock.setAttribute('aria-label', `Rechnung ${rech.nr} entsperren`);
    btnLock.disabled = true;
    const spanLock = document.createElement('span');
    spanLock.className = 'material-symbols-outlined text-[18px]';
    spanLock.textContent = 'lock';
    btnLock.appendChild(spanLock);
    divActions.appendChild(btnLock);
  } else {
    const btnEdit = document.createElement('button');
    btnEdit.onclick = e => {
      e.preventDefault();
      e.stopPropagation();
      openRechnungModal(rech.id);
    };
    btnEdit.className = 'text-slate-400 hover:text-primary p-1 transition-colors flex items-center justify-center';
    btnEdit.title = 'Bearbeiten';
    btnEdit.setAttribute('aria-label', `Rechnung ${rech.nr} bearbeiten`);
    const spanEdit = document.createElement('span');
    spanEdit.className = 'material-symbols-outlined text-[18px]';
    spanEdit.textContent = 'edit';
    btnEdit.appendChild(spanEdit);
    divActions.appendChild(btnEdit);
    const btnDel = document.createElement('button');
    btnDel.onclick = e => {
      e.preventDefault();
      e.stopPropagation();
      deleteRechnung(rech.id);
    };
    btnDel.className = 'text-slate-400 hover:text-red-500 p-1 transition-colors flex items-center justify-center';
    btnDel.title = 'Löschen';
    btnDel.setAttribute('aria-label', `Rechnung ${rech.nr} löschen`);
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
    btnExtend.setAttribute('aria-label', `Zahlungsziel für Rechnung ${rech.nr} verlängern`);
    btnExtend.innerHTML = '<span class="material-symbols-outlined text-[18px]">calendar_month</span>';
    btnExtend.onclick = e => {
      e.preventDefault();
      e.stopPropagation();
      window.extendPaymentDeadline(rech.id);
    };
    divActions.appendChild(btnExtend);
    const btnMahn = document.createElement('button');
    let btnMahnClass = 'text-amber-500 hover:text-amber-700';
    if (rech.mahnungLevel === 2) btnMahnClass = 'text-orange-500 hover:text-orange-700';else if (rech.mahnungLevel === 3) btnMahnClass = 'text-red-500 hover:text-red-700';
    btnMahn.className = `${btnMahnClass} p-1 transition-colors relative flex items-center justify-center`;
    btnMahn.title = rech.mahnungLevel > 0 ? `${rech.mahnungLevel}. Mahnung bereits erstellt` : 'Mahnung generieren';
    btnMahn.setAttribute('aria-label', `Mahnung für Rechnung ${rech.nr} generieren`);
    btnMahn.onclick = e => {
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
  tdActions.appendChild(divActions);
  tr.appendChild(tdActions);
  return tr;
}

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

function getAngebotStatusBadge(ang) {
  const rawStatus = (ang.angebot_status || ang.status || 'ENTWURF').toUpperCase();
  switch (rawStatus) {
    case 'ENTWURF':
    case 'OFFEN':
      return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300">Entwurf</span>';
    case 'VERSENDET':
      return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-300">Versendet</span>';
    case 'ANGENOMMEN':
      return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">Angenommen</span>';
    case 'ABGELEHNT':
      return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-300">Abgelehnt</span>';
    default:
      return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">${typeof sanitize === 'function' ? sanitize(rawStatus) : rawStatus}</span>`;
  }
}

window.getAngebotStatusBadge = getAngebotStatusBadge;

function renderAngebote(searchQuery = '') {
  const tbody = document.getElementById('angebote-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  let offeneAngebote = 0;
  const kundenMap = new Map();
  (state.kunden || []).forEach(k => kundenMap.set(k.id, k));
  let sortedAngebote = [...(state.angebote || [])].reverse();
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    sortedAngebote = sortedAngebote.filter(ang => {
      const kunde = kundenMap.get(parseInt(ang.kundeId, 10)) || {
        name: 'Unbekannt'
      };
      const nrStr = ang.nr ? String(ang.nr).toLowerCase() : '';
      const kundeName = kunde.name ? String(kunde.name).toLowerCase() : '';
      const bruttoStr = ang.brutto !== undefined && ang.brutto !== null ? String(ang.brutto) : '';
      return nrStr.includes(q) || kundeName.includes(q) || bruttoStr.includes(q);
    });
  }
  sortedAngebote.forEach(ang => {
    const kunde = kundenMap.get(parseInt(ang.kundeId, 10)) || {
      name: 'Unbekannt'
    };
    const rawStatus = (ang.angebot_status || ang.status || 'ENTWURF').toUpperCase();
    if (rawStatus === 'ENTWURF' || rawStatus === 'OFFEN' || rawStatus === 'VERSENDET') {
      offeneAngebote++;
    }
    const dateStr = ang.datum ? new Date(ang.datum).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }) : '-';
    const isFrozen = Boolean(ang.freeze_snapshot_json || ['VERSENDET', 'ANGENOMMEN', 'ABGELEHNT'].includes(rawStatus));
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-blue-50/50 transition-colors group';

    // 1. Angebots-Nr.
    const tdNr = document.createElement('td');
    tdNr.className = 'px-4 py-3 font-medium text-primary';
    tdNr.textContent = ang.nr;
    tr.appendChild(tdNr);

    // 2. Version
    const tdVersion = document.createElement('td');
    tdVersion.className = 'px-4 py-3 text-center';
    const versionNum = ang.version || 1;
    tdVersion.innerHTML = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-700 font-mono border border-slate-200">v${versionNum}</span>`;
    tr.appendChild(tdVersion);

    // 3. Datum
    const tdDate = document.createElement('td');
    tdDate.className = 'px-4 py-3 text-slate-500';
    tdDate.textContent = dateStr;
    tr.appendChild(tdDate);

    // 4. Kunde
    const tdKunde = document.createElement('td');
    tdKunde.className = 'px-4 py-3 font-medium';
    tdKunde.textContent = kunde.name;
    tr.appendChild(tdKunde);

    // 5. Betrag
    const tdBetrag = document.createElement('td');
    tdBetrag.className = 'px-4 py-3 text-right font-medium text-slate-800 tabular-nums';
    tdBetrag.textContent = formatCurrency(ang.brutto);
    tr.appendChild(tdBetrag);

    // 6. Status
    const tdStatus = document.createElement('td');
    tdStatus.className = 'px-4 py-3 text-center';
    tdStatus.innerHTML = getAngebotStatusBadge(ang);
    tr.appendChild(tdStatus);

    // 7. Aktionen
    const tdActions = document.createElement('td');
    tdActions.className = 'px-4 py-3 text-right w-44';
    const divActions = document.createElement('div');
    divActions.className = 'flex justify-end items-center gap-1';

    // Action: Edit or View
    const btnEdit = document.createElement('button');
    btnEdit.onclick = () => openAngebotModal(ang.id);
    btnEdit.className = 'text-slate-400 hover:text-blue-500 p-1 transition-colors flex items-center justify-center';
    btnEdit.title = isFrozen ? 'Angebot ansehen' : 'Angebot bearbeiten';
    btnEdit.setAttribute('aria-label', `${btnEdit.title} ${ang.nr}`);
    const spanEdit = document.createElement('span');
    spanEdit.className = 'material-symbols-outlined text-[20px]';
    spanEdit.textContent = isFrozen ? 'visibility' : 'edit';
    btnEdit.appendChild(spanEdit);
    divActions.appendChild(btnEdit);

    // Action for Draft: Versand registrieren (Einfrieren)
    if (rawStatus === 'ENTWURF' || rawStatus === 'OFFEN') {
      const btnSend = document.createElement('button');
      btnSend.onclick = () => openAngebotModal(ang.id);
      btnSend.className = 'text-slate-400 hover:text-blue-600 p-1 transition-colors flex items-center justify-center';
      btnSend.title = 'Versand registrieren (Einfrieren)';
      btnSend.setAttribute('aria-label', `Versand für Angebot ${ang.nr} registrieren`);
      const spanSend = document.createElement('span');
      spanSend.className = 'material-symbols-outlined text-[20px]';
      spanSend.textContent = 'send';
      btnSend.appendChild(spanSend);
      divActions.appendChild(btnSend);
    }

    // Actions for Sent: Neue Version verhandeln & Annehmen
    if (rawStatus === 'VERSENDET') {
      const nextV = (parseInt(ang.version, 10) || 1) + 1;
      const btnVer = document.createElement('button');
      btnVer.onclick = () => neueVersionFromDashboard(ang.id);
      btnVer.className = 'text-slate-400 hover:text-amber-600 p-1 transition-colors flex items-center justify-center';
      btnVer.title = `Neue Version verhandeln (v${nextV})`;
      btnVer.setAttribute('aria-label', `Neue Version verhandeln für ${ang.nr}`);
      const spanVer = document.createElement('span');
      spanVer.className = 'material-symbols-outlined text-[20px]';
      spanVer.textContent = 'difference';
      btnVer.appendChild(spanVer);
      divActions.appendChild(btnVer);
      const btnAccept = document.createElement('button');
      btnAccept.onclick = () => angebotAnnehmenFromDashboard(ang.id);
      btnAccept.className = 'text-slate-400 hover:text-emerald-600 p-1 transition-colors flex items-center justify-center';
      btnAccept.title = 'Angebot annehmen';
      btnAccept.setAttribute('aria-label', `Angebot ${ang.nr} annehmen`);
      const spanAccept = document.createElement('span');
      spanAccept.className = 'material-symbols-outlined text-[20px]';
      spanAccept.textContent = 'check_circle';
      btnAccept.appendChild(spanAccept);
      divActions.appendChild(btnAccept);
    }

    // Actions for Accepted: Projekt anlegen / Zum Projekt
    if (rawStatus === 'ANGENOMMEN') {
      const sVer = ang.angenommene_version || ang.version || 1;
      const linkedProj = (state.projekte || []).find(p => p.source_angebot_id === ang.id && (p.source_angebot_version || 1) === sVer) || (state.projekte || []).find(p => p.source_angebot_id === ang.id || p.angebot_id === ang.id);
      if (linkedProj) {
        const btnProj = document.createElement('button');
        btnProj.onclick = () => {
          if (typeof openProjektDetails === 'function') {
            openProjektDetails(linkedProj.id);
          } else if (typeof switchView === 'function') {
            switchView('projekte');
          }
        };
        btnProj.className = 'text-slate-400 hover:text-indigo-600 p-1 transition-colors flex items-center justify-center';
        btnProj.title = `Zum verknüpften Projekt #${linkedProj.id}`;
        btnProj.setAttribute('aria-label', `Zum Projekt von Angebot ${ang.nr}`);
        const spanProj = document.createElement('span');
        spanProj.className = 'material-symbols-outlined text-[20px]';
        spanProj.textContent = 'folder_open';
        btnProj.appendChild(spanProj);
        divActions.appendChild(btnProj);
      } else {
        const btnNewProj = document.createElement('button');
        btnNewProj.onclick = () => projektAnlegenFromDashboard(ang.id);
        btnNewProj.className = 'text-slate-400 hover:text-emerald-600 p-1 transition-colors flex items-center justify-center';
        btnNewProj.title = 'In Projekt umwandeln';
        btnNewProj.setAttribute('aria-label', `Angebot ${ang.nr} in Projekt umwandeln`);
        const spanNewProj = document.createElement('span');
        spanNewProj.className = 'material-symbols-outlined text-[20px]';
        spanNewProj.textContent = 'construction';
        btnNewProj.appendChild(spanNewProj);
        divActions.appendChild(btnNewProj);
      }
    }

    // Action: PDF Generieren / Drucken
    const btnPdf = document.createElement('button');
    btnPdf.onclick = () => generatePdf(ang.id, true);
    btnPdf.className = 'text-slate-400 hover:text-primary p-1 transition-colors flex items-center justify-center';
    btnPdf.title = 'PDF generieren';
    btnPdf.setAttribute('aria-label', `PDF für Angebot ${ang.nr} generieren`);
    const spanPdf = document.createElement('span');
    spanPdf.className = 'material-symbols-outlined text-[20px]';
    spanPdf.textContent = 'picture_as_pdf';
    btnPdf.appendChild(spanPdf);
    divActions.appendChild(btnPdf);
    tdActions.appendChild(divActions);
    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  });
  const kpiEl = document.getElementById('kpi-angebote-offen');
  if (kpiEl) kpiEl.innerText = offeneAngebote;
}

window.renderAngebote = renderAngebote;

if (typeof window !== 'undefined') window.getStatusBadge = getStatusBadge;
if (typeof window !== 'undefined') window.renderRechnungen = renderRechnungen;
if (typeof window !== 'undefined') window.filterRechnungenData = filterRechnungenData;
if (typeof window !== 'undefined') window.paginateRechnungen = paginateRechnungen;
if (typeof window !== 'undefined') window.createRechnungRow = createRechnungRow;
if (typeof window !== 'undefined') window.changeRechnungPage = changeRechnungPage;
if (typeof window !== 'undefined') window.renderRechnungPagination = renderRechnungPagination;
if (typeof window !== 'undefined') window.filterRechnungen = filterRechnungen;
if (typeof window !== 'undefined') window.handleGlobalSearch = handleGlobalSearch;
if (typeof window !== 'undefined') window.toggleAllSelections = toggleAllSelections;
if (typeof window !== 'undefined') window.handleSelectionChange = handleSelectionChange;
if (typeof window !== 'undefined') window.getAngebotStatusBadge = getAngebotStatusBadge;
if (typeof window !== 'undefined') window.getAngebotStatusBadge = getAngebotStatusBadge;
if (typeof window !== 'undefined') window.renderAngebote = renderAngebote;
if (typeof window !== 'undefined') window.renderAngebote = renderAngebote;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getStatusBadge: typeof window !== 'undefined' ? window.getStatusBadge : getStatusBadge,
        renderRechnungen: typeof window !== 'undefined' ? window.renderRechnungen : renderRechnungen,
        filterRechnungenData: typeof window !== 'undefined' ? window.filterRechnungenData : filterRechnungenData,
        paginateRechnungen: typeof window !== 'undefined' ? window.paginateRechnungen : paginateRechnungen,
        createRechnungRow: typeof window !== 'undefined' ? window.createRechnungRow : createRechnungRow,
        changeRechnungPage: typeof window !== 'undefined' ? window.changeRechnungPage : changeRechnungPage,
        renderRechnungPagination: typeof window !== 'undefined' ? window.renderRechnungPagination : renderRechnungPagination,
        filterRechnungen: typeof window !== 'undefined' ? window.filterRechnungen : filterRechnungen,
        handleGlobalSearch: typeof window !== 'undefined' ? window.handleGlobalSearch : handleGlobalSearch,
        toggleAllSelections: typeof window !== 'undefined' ? window.toggleAllSelections : toggleAllSelections,
        handleSelectionChange: typeof window !== 'undefined' ? window.handleSelectionChange : handleSelectionChange,
        getAngebotStatusBadge: typeof window !== 'undefined' ? window.getAngebotStatusBadge : getAngebotStatusBadge,
        getAngebotStatusBadge: typeof window !== 'undefined' ? window.getAngebotStatusBadge : getAngebotStatusBadge,
        renderAngebote: typeof window !== 'undefined' ? window.renderAngebote : renderAngebote,
        renderAngebote: typeof window !== 'undefined' ? window.renderAngebote : renderAngebote
    };
}