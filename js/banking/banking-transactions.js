(function() {

async function ladeTransaktionen() {
  if (!window.api || !window.api.getBankTransaktionen) return;
  const filter = {};
  if (bankingState.selectedKontoId) filter.bank_konto_id = bankingState.selectedKontoId;
  if (bankingState.filterStatus) filter.status = bankingState.filterStatus;
  if (bankingState.filterSearch) filter.search = bankingState.filterSearch;

  try {
    bankingState.transaktionen = await window.api.getBankTransaktionen(filter);
    renderTransaktionenTabelle();
  } catch (e) {
    console.error('Fehler beim Laden der Transaktionen:', e);
  }
}

function renderTransaktionenTabelle() {
  const tbody = document.getElementById('banking-transaktionen-tbody');
  if (!tbody) return;

  if (bankingState.transaktionen.length === 0) {
    tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-8 text-slate-400 text-sm">
                    Keine Banktransaktionen vorhanden. Importieren Sie eine CAMT.053 XML- oder CSV-Kontoauszugsdatei.
                </td>
            </tr>
        `;
    return;
  }

  tbody.innerHTML = bankingState.transaktionen.map((tx) => {
    const betrag = parseFloat(tx.betrag) || 0;
    const isPos = betrag > 0;
    const betragClass = isPos ? 'text-emerald-600 font-semibold' : 'text-slate-800 font-semibold';
    const formattedBetrag = (isPos ? '+' : '') + betrag.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

    let statusBadge = '';
    if (tx.status === 'ZUGEORDNET') {
      statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">Zugeordnet</span>';
    } else if (tx.status === 'TEILWEISE_ZUGEORDNET') {
      statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">Teilweise zugeordnet</span>';
    } else if (tx.status === 'IGNORIERT') {
      statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">Ignoriert</span>';
    } else {
      statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">Offen</span>';
    }

    const zuordnungenText = (tx.zuordnungen || []).map((z) => {
      const ref = z.dokument_nr || z.eingangsrechnung_nr || `#${z.dokument_id || z.eingangsrechnung_id}`;
      const skText = z.skonto_abzug > 0 ? ` (inkl. ${z.skonto_abzug.toFixed(2)} € Skonto)` : '';
      return `<div class="text-xs text-slate-500 mt-0.5 flex items-center justify-between">
                <span>→ Beleg ${escapeHtml(ref)}: ${z.betrag.toFixed(2)} €${skText}</span>
                <button onclick="entkoppleTransaktion(${z.id})" class="text-red-500 hover:text-red-700 ml-2 text-xs" title="Zuordnung aufheben">✕</button>
            </div>`;
    }).join('');

    return `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                <td class="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(tx.buchungstag || '')}</td>
                <td class="px-4 py-3 text-xs font-medium text-slate-800">${escapeHtml(tx.partner_name || '-')}</td>
                <td class="px-4 py-3 text-xs text-slate-600">
                    <div class="max-w-xs truncate" title="${escapeHtml(tx.verwendungszweck || '')}">
                        ${escapeHtml(tx.verwendungszweck || '-')}
                    </div>
                    ${zuordnungenText}
                </td>
                <td class="px-4 py-3 text-xs font-mono text-slate-500 whitespace-nowrap">${escapeHtml(tx.partner_iban || '-')}</td>
                <td class="px-4 py-3 text-xs text-right whitespace-nowrap ${betragClass}">${formattedBetrag}</td>
                <td class="px-4 py-3 text-xs text-center whitespace-nowrap">${statusBadge}</td>
                <td class="px-4 py-3 text-xs text-center whitespace-nowrap">
                    ${tx.status === 'OFFEN' ? `
                        <button onclick="oeffneManuelleZuordnung(${tx.id})"
                            class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs transition-colors">
                            Zuordnen
                        </button>
                    ` : ''}
                </td>
            </tr>
        `;
  }).join('');
}

    // Expose globally for HTML onclick and cross-file usage
    window.ladeTransaktionen = ladeTransaktionen;
    window.renderTransaktionenTabelle = renderTransaktionenTabelle;

})();
