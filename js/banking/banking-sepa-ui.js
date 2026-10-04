(function() {

async function ladeSepaBereich() {
  if (!window.api || !window.api.getOffeneRechnungenFuerSepa) return;
  try {
    bankingState.offeneSepaRechnungen = await window.api.getOffeneRechnungenFuerSepa();
    bankingState.sepaLaeufe = await window.api.getSepaLaeufe();
    renderSepaBereich();
  } catch (e) {
    console.error('Fehler beim Laden des SEPA-Bereichs:', e);
  }
}

function renderSepaBereich() {
  const tbody = document.getElementById('sepa-offene-rechnungen-tbody');
  const sumEl = document.getElementById('sepa-auswahl-summe');
  const dateInput = document.getElementById('sepa-ausfuehrungs-datum');

  if (dateInput && !dateInput.value) {
    const parser = typeof SepaController !== 'undefined' ? SepaController : window.SepaController;
    if (parser && parser.getNextTarget2BankingDay) {
      dateInput.value = parser.getNextTarget2BankingDay(new Date().toISOString().substring(0, 10), 1);
    }
  }

  if (tbody) {
    if (bankingState.offeneSepaRechnungen.length === 0) {
      tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-8 text-slate-400 text-sm">
                        Keine fälligen Ausgangsrechnungen mit aktivem SEPA-Mandat vorhanden.
                    </td>
                </tr>
            `;
    } else {
      tbody.innerHTML = bankingState.offeneSepaRechnungen.map((doc) => {
        const offen = doc.offener_betrag !== null && doc.offener_betrag !== undefined ?
        parseFloat(doc.offener_betrag) :
        Math.round(((doc.brutto || 0) - (doc.bezahlt_betrag || 0)) * 100) / 100;
        const formattedBetrag = offen.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

        return `
                    <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                        <td class="px-4 py-3 text-center">
                            <input type="checkbox" class="sepa-doc-checkbox rounded border-slate-300 text-primary focus:ring-primary"
                                data-id="${doc.id}" data-betrag="${offen}" onchange="updateSepaAuswahlSumme()" checked>
                        </td>
                        <td class="px-4 py-3 text-xs font-semibold text-slate-800">${escapeHtml(doc.nr || '')}</td>
                        <td class="px-4 py-3 text-xs text-slate-700">${escapeHtml(doc.kunden_name || '')}</td>
                        <td class="px-4 py-3 text-xs font-mono text-slate-500">${escapeHtml(doc.mandatsreferenz || '')}</td>
                        <td class="px-4 py-3 text-xs font-mono text-slate-500">${escapeHtml(doc.mandat_iban || '')}</td>
                        <td class="px-4 py-3 text-xs text-right font-semibold text-slate-800">${formattedBetrag}</td>
                        <td class="px-4 py-3 text-xs text-center whitespace-nowrap">
                            <button onclick="zeigePreNotificationModal(${doc.id})"
                                class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs transition-colors">
                                Pre-Notification
                            </button>
                        </td>
                    </tr>
                `;
      }).join('');
    }
  }

  updateSepaAuswahlSumme();
  renderSepaLaeufeTabelle();
}

function updateSepaAuswahlSumme() {
  const checkboxes = document.querySelectorAll('.sepa-doc-checkbox:checked');
  let total = 0;
  checkboxes.forEach((cb) => {
    total += parseFloat(cb.dataset.betrag) || 0;
  });
  const sumEl = document.getElementById('sepa-auswahl-summe');
  if (sumEl) {
    sumEl.innerText = total.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }
}

function renderSepaLaeufeTabelle() {
  const tbody = document.getElementById('sepa-laeufe-tbody');
  if (!tbody) return;

  if (bankingState.sepaLaeufe.length === 0) {
    tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-6 text-slate-400 text-sm">
                    Noch keine SEPA-Lastschriftläufe erstellt.
                </td>
            </tr>
        `;
    return;
  }

  tbody.innerHTML = bankingState.sepaLaeufe.map((lauf) => {
    const summeStr = (parseFloat(lauf.summe_gesamt) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    let statusBadge = '';
    if (lauf.status === 'EXPORTIERT') {
      statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">Exportiert</span>';
    } else if (lauf.status === 'EINGEREICHT') {
      statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">Eingereicht</span>';
    } else if (lauf.status === 'STORNIERT') {
      statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">Storniert</span>';
    } else {
      statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">Erstellt</span>';
    }

    const stornoBtn = lauf.status === 'ERSTELLT' || lauf.status === 'EXPORTIERT' ?
    `<button onclick="storniereSepaLauf(${lauf.id})" title="Lauf stornieren"
                class="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded text-xs transition-colors">Storno</button>` :
    '';
    const detailBtn = `<button onclick="zeigeSepaLaufDetails(${lauf.id})" title="Positionen anzeigen"
                class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs transition-colors">Positionen</button>`;

    return `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                <td class="px-4 py-3 text-xs font-mono font-semibold text-slate-800">${escapeHtml(lauf.lauf_nr)}</td>
                <td class="px-4 py-3 text-xs text-slate-600">${escapeHtml(lauf.kontoname || '')}</td>
                <td class="px-4 py-3 text-xs text-center">${escapeHtml(lauf.ausfuehrungs_datum)}</td>
                <td class="px-4 py-3 text-xs text-center">${lauf.anzahl_transaktionen}</td>
                <td class="px-4 py-3 text-xs text-right font-semibold text-slate-800">${summeStr}</td>
                <td class="px-4 py-3 text-xs text-center">${statusBadge}</td>
                <td class="px-4 py-3 text-xs text-center whitespace-nowrap">
                    <div class="flex items-center justify-center gap-1">
                        ${detailBtn}
                        ${stornoBtn}
                        <button onclick="downloadSepaXml(${lauf.id})"
                            class="px-2.5 py-1 bg-primary hover:bg-primary-dark text-white rounded text-xs font-medium transition-colors flex items-center gap-1">
                            <span class="material-symbols-outlined text-xs">download</span>
                            XML
                        </button>
                    </div>
                </td>
            </tr>
        `;
  }).join('');
}

async function storniereSepaLauf(laufId) {
  if (!window.api || !window.api.storniereSepaLauf) return;
  const grund = prompt('Grund der Stornierung (wird GoBD-konform protokolliert):', 'Manuelle Stornierung');
  if (grund === null) return;
  try {
    await window.api.storniereSepaLauf(laufId, grund || 'Manuelle Stornierung');
    if (typeof showToast === 'function') showToast('SEPA-Lauf wurde storniert. Bereits umgestellte Mandate wurden auf FRST zurückgesetzt.', 'info');
    await ladeSepaBereich();
  } catch (e) {
    console.error('Fehler beim Stornieren des SEPA-Laufs:', e);
    if (typeof showToast === 'function') showToast('Fehler beim Stornieren: ' + e.message, 'error');
  }
}

async function zeigeSepaLaufDetails(laufId) {
  if (!window.api || !window.api.getSepaLaufDetails) return;
  try {
    const details = await window.api.getSepaLaufDetails(laufId);
    const tbody = document.getElementById('sepa-lauf-detail-tbody');
    if (!tbody) return;

    tbody.innerHTML = (details.positionen || []).map((pos) => {
      const betragStr = (parseFloat(pos.betrag) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
      const rueckBtn = pos.status !== 'RUECKLASTSCHRIFT' && pos.status !== 'STORNIERT' ?
      `<button onclick="markiereRuecklastschrift(${pos.id})" class="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded text-xs transition-colors">Rücklastschrift</button>` :
      '';
      return `
                <tr class="border-b border-slate-100">
                    <td class="px-3 py-2 text-xs font-mono">${escapeHtml(pos.beleg_nr || '-')}</td>
                    <td class="px-3 py-2 text-xs">${escapeHtml(pos.kunden_name || '')}</td>
                    <td class="px-3 py-2 text-xs font-mono">${escapeHtml(pos.mandatsreferenz || '')}</td>
                    <td class="px-3 py-2 text-xs text-right font-semibold">${betragStr}</td>
                    <td class="px-3 py-2 text-xs text-center">${escapeHtml(pos.status)}</td>
                    <td class="px-3 py-2 text-xs text-center">${rueckBtn}</td>
                </tr>
            `;
    }).join('');

    const modal = document.getElementById('sepa-lauf-detail-modal');
    if (modal) modal.classList.remove('hidden');
  } catch (e) {
    console.error('Fehler beim Laden der Laufdetails:', e);
    if (typeof showToast === 'function') showToast('Fehler beim Laden der Laufdetails: ' + e.message, 'error');
  }
}

function schliesseSepaLaufDetail() {
  const modal = document.getElementById('sepa-lauf-detail-modal');
  if (modal) modal.classList.add('hidden');
}

async function markiereRuecklastschrift(positionId) {
  if (!window.api || !window.api.markiereRuecklastschrift) return;
  const grund = prompt('Grund der Rücklastschrift:', 'Rücklastschrift durch Zahlungsinstitut');
  if (grund === null) return;
  try {
    await window.api.markiereRuecklastschrift(positionId, grund || 'Rücklastschrift durch Zahlungsinstitut');
    if (typeof showToast === 'function') showToast('Position als Rücklastschrift markiert. Der Beleg bleibt offen.', 'warning');
    await ladeSepaBereich();
  } catch (e) {
    console.error('Fehler bei Rücklastschrift:', e);
    if (typeof showToast === 'function') showToast('Fehler bei Rücklastschrift: ' + e.message, 'error');
  }
}

async function erstelleSepaLastschriftlauf() {
  const checkboxes = document.querySelectorAll('.sepa-doc-checkbox:checked');
  const invoiceIds = [];
  checkboxes.forEach((cb) => {
    const id = parseInt(cb.dataset.id, 10);
    if (id) invoiceIds.push(id);
  });

  if (invoiceIds.length === 0) {
    if (typeof showToast === 'function') showToast('Bitte wählen Sie mindestens eine Rechnung aus.', 'warning');
    return;
  }

  if (!bankingState.selectedKontoId) {
    if (typeof showToast === 'function') showToast('Bitte wählen Sie ein Bankkonto für den Einzug aus.', 'warning');
    return;
  }

  const dateInput = document.getElementById('sepa-ausfuehrungs-datum');
  const executionDate = dateInput ? dateInput.value : '';
  const formatSelect = document.getElementById('sepa-format-select');
  const xmlFormat = formatSelect ? formatSelect.value : 'pain.008.001.08';
  const typeSelect = document.getElementById('sepa-type-select');
  const sammelTyp = typeSelect ? typeSelect.value : 'CORE';
  const fristCheckbox = document.getElementById('sepa-prenot-frist-bestaetigt');
  const preNotFristBestaetigt = !!(fristCheckbox && fristCheckbox.checked);

  try {
    const res = await window.api.createSepaRun({
      bankKontoId: bankingState.selectedKontoId,
      invoiceIds,
      ausfuehrungsDatum: executionDate,
      xmlFormat,
      sammelTyp,
      preNotFristBestaetigt
    });

    if (typeof showToast === 'function') {
      let msg = `SEPA-Lauf ${res.laufNr} erfolgreich mit ${res.anzahlTransaktionen} Posten (${res.summeGesamt.toFixed(2)} €) generiert.`;
      if (res.warnings && res.warnings.length > 0) {
        msg += ` ${res.warnings.length} Position(en) gefiltert (Mandatstyp passt nicht zum Lauf).`;
        showToast(msg, 'warning');
      } else {
        showToast(msg, 'success');
      }
    }

    downloadXmlFile(res.laufNr + '.xml', res.xmlContent);
    await ladeSepaBereich();
  } catch (e) {
    console.error('Fehler bei SEPA-Lauf Erstellung:', e);
    if (typeof showToast === 'function') showToast('Fehler bei SEPA-Lauf: ' + e.message, 'error');
  }
}

async function downloadSepaXml(laufId) {
  if (!window.api || !window.api.exportSepaRunXml) return;
  try {
    const res = await window.api.exportSepaRunXml(laufId);
    downloadXmlFile(res.laufNr + '.xml', res.xmlContent);
    await ladeSepaBereich();
  } catch (e) {
    console.error('Fehler beim Download:', e);
  }
}

function downloadXmlFile(filename, content) {
  const blob = new Blob([content], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function zeigePreNotificationModal(invoiceId) {
  const doc = bankingState.offeneSepaRechnungen.find((d) => d.id === invoiceId);
  if (!doc) return;

  const konto = bankingState.konten.find((k) => k.id === bankingState.selectedKontoId) || {};
  const parser = typeof SepaController !== 'undefined' ? SepaController : window.SepaController;
  const glaeubigerIdRaw = konto.glaeubiger_id || '';
  const glaeubigerOk = glaeubigerIdRaw && parser.validateGlaeubigerId(glaeubigerIdRaw);
  if (!glaeubigerOk && typeof showToast === 'function') {
    showToast('Warnung: Keine gültige Gläubiger-ID am Bankkonto hinterlegt. Bitte unter Tab 4 konfigurieren.', 'warning');
  }
  const text = parser.buildPreNotification({
    glaeubigerId: glaeubigerOk ? glaeubigerIdRaw : 'BITTE GLÄUBIGER-ID HINTERLEGEN',
    firmenname: konto.kontoinhaber || 'W-Link ERP',
    mandatsreferenz: doc.mandatsreferenz,
    faelligkeitsdatum: doc.faellig || new Date().toISOString().substring(0, 10),
    betrag: doc.offener_betrag || doc.brutto,
    iban: doc.mandat_iban,
    belegNr: doc.nr,
    kundenName: doc.kunden_name
  });

  const modal = document.getElementById('sepa-prenot-modal');
  const textarea = document.getElementById('sepa-prenot-text');
  if (modal && textarea) {
    textarea.value = text;
    modal.classList.remove('hidden');
  }
}

function schliessePreNotificationModal() {
  const modal = document.getElementById('sepa-prenot-modal');
  if (modal) modal.classList.add('hidden');
}

    // Expose globally for HTML onclick and cross-file usage
    window.ladeSepaBereich = ladeSepaBereich;
    window.renderSepaBereich = renderSepaBereich;
    window.updateSepaAuswahlSumme = updateSepaAuswahlSumme;
    window.renderSepaLaeufeTabelle = renderSepaLaeufeTabelle;
    window.storniereSepaLauf = storniereSepaLauf;
    window.zeigeSepaLaufDetails = zeigeSepaLaufDetails;
    window.schliesseSepaLaufDetail = schliesseSepaLaufDetail;
    window.markiereRuecklastschrift = markiereRuecklastschrift;
    window.erstelleSepaLastschriftlauf = erstelleSepaLastschriftlauf;
    window.downloadSepaXml = downloadSepaXml;
    window.downloadXmlFile = downloadXmlFile;
    window.zeigePreNotificationModal = zeigePreNotificationModal;
    window.schliessePreNotificationModal = schliessePreNotificationModal;

})();
