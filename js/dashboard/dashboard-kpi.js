function isRechnungBezahltOderStorniert(rech, bezahlteNrsSet) {
  if (!rech) return false;
  if (rech.status === 'Bezahlt') return true;
  if (rech.status === 'Storniert') {
    return bezahlteNrsSet.has('STORNO - ' + rech.nr);
  }
  return false;
}


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
      const kunde = kundenMap.get(parseInt(r.kundeId)) || {
        name: 'Unbekannt'
      };
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
        const kunde = kundenMap.get(parseInt(rech.kundeId)) || {
          name: 'Unbekannt'
        };
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition-colors cursor-pointer group';
        tr.onclick = () => {
          switchView('rechnungen');
          openRechnungModal(rech.id);
        };
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

if (typeof window !== 'undefined') window.isRechnungBezahltOderStorniert = isRechnungBezahltOderStorniert;
if (typeof window !== 'undefined') window.renderDashboard = renderDashboard;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        renderDashboard: typeof window !== 'undefined' ? window.renderDashboard : renderDashboard,
        isRechnungBezahltOderStorniert: typeof window !== 'undefined' ? window.isRechnungBezahltOderStorniert : isRechnungBezahltOderStorniert
    };
}