let bankingState = {
    activeTab: 'kontoauszug',
    konten: [],
    selectedKontoId: null,
    transaktionen: [],
    filterStatus: '',
    filterSearch: '',
    matchVorschlaege: [],
    offeneSepaRechnungen: [],
    sepaLaeufe: [],
    mandate: []
};

async function renderBanking() {
    await ladeBankKonten();
    initBankDropzone();
    renderBankingTabs();
    await switchBankingTab(bankingState.activeTab);
}

function initBankDropzone() {
    const dz = document.getElementById('banking-dropzone');
    if (!dz || dz.dataset.dropInit === '1') return;
    dz.dataset.dropInit = '1';
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('border-primary', 'bg-primary/5'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('border-primary', 'bg-primary/5'));
    dz.addEventListener('drop', e => {
        e.preventDefault();
        dz.classList.remove('border-primary', 'bg-primary/5');
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) handleBankFileUpload(file);
    });
}

function liesseDateiMitEncodingFallback(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            const text = String(e.target.result || '');
            const mojibake = /\uFFFD|(Ã¤|Ã¶|Ã¼|Ã„|Ã–|Ãœ|ÃŸ)/.test(text);
            if (!mojibake) return resolve(text);
            const reader2 = new FileReader();
            reader2.onload = ev => resolve(String(ev.target.result || ''));
            reader2.onerror = reject;
            reader2.readAsText(file, 'windows-1252');
        };
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

function renderBankingTabs() {
    const tabs = [
        { id: 'kontoauszug', label: 'Kontoauszug & Import', icon: 'receipt_long' },
        { id: 'opos', label: 'OPOS-Zahlungsabgleich', icon: 'sync_alt' },
        { id: 'sepa', label: 'SEPA-Lastschriften', icon: 'payments' },
        { id: 'mandate', label: 'Konten & Mandate', icon: 'account_balance' }
    ];

    const tabNav = document.getElementById('banking-tab-nav');
    if (!tabNav) return;

    tabNav.innerHTML = tabs.map(t => {
        const isActive = bankingState.activeTab === t.id;
        const activeClasses = 'border-primary text-primary font-semibold';
        const inactiveClasses = 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300';
        return `
            <button onclick="switchBankingTab('${t.id}')"
                class="flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${isActive ? activeClasses : inactiveClasses}">
                <span class="material-symbols-outlined text-lg">${t.icon}</span>
                <span>${t.label}</span>
            </button>
        `;
    }).join('');
}

async function switchBankingTab(tabId) {
    bankingState.activeTab = tabId;
    renderBankingTabs();

    const panels = ['kontoauszug', 'opos', 'sepa', 'mandate'];
    panels.forEach(p => {
        const el = document.getElementById(`banking-panel-${p}`);
        if (el) {
            if (p === tabId) el.classList.remove('hidden');
            else el.classList.add('hidden');
        }
    });

    if (tabId === 'kontoauszug') {
        await ladeTransaktionen();
    } else if (tabId === 'opos') {
        await starteOposAbgleich();
    } else if (tabId === 'sepa') {
        await ladeSepaBereich();
    } else if (tabId === 'mandate') {
        await ladeKontenUndMandate();
    }
}

async function ladeBankKonten() {
    if (!window.api || !window.api.getBankKonten) return;
    try {
        bankingState.konten = await window.api.getBankKonten();
        if (!bankingState.selectedKontoId && bankingState.konten.length > 0) {
            const def = bankingState.konten.find(k => k.ist_standard) || bankingState.konten[0];
            bankingState.selectedKontoId = def.id;
        }
        updateKontoSelector();
    } catch (e) {
        console.error('Fehler beim Laden der Bankkonten:', e);
    }
}

function updateKontoSelector() {
    const sel = document.getElementById('banking-konto-select');
    if (!sel) return;
    if (bankingState.konten.length === 0) {
        sel.innerHTML = '<option value="">Kein Bankkonto eingerichtet</option>';
        return;
    }
    sel.innerHTML = bankingState.konten.map(k => `
        <option value="${k.id}" ${k.id === bankingState.selectedKontoId ? 'selected' : ''}>
            ${escapeHtml(k.kontoname)} (${escapeHtml(k.iban)}) ${k.ist_standard ? '★ Standard' : ''}
        </option>
    `).join('');
}

function onBankingKontoChange(kontoId) {
    bankingState.selectedKontoId = parseInt(kontoId, 10) || null;
    if (bankingState.activeTab === 'kontoauszug') ladeTransaktionen();
    else if (bankingState.activeTab === 'opos') starteOposAbgleich();
}

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

    tbody.innerHTML = bankingState.transaktionen.map(tx => {
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

        const zuordnungenText = (tx.zuordnungen || []).map(z => {
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

async function handleBankFileUpload(file) {
    if (!file) return;
    if (!bankingState.selectedKontoId) {
        if (typeof showToast === 'function') showToast('Bitte wählen Sie zuerst ein Bankkonto aus.', 'warning');
        return;
    }

    const konto = bankingState.konten.find(k => k.id === bankingState.selectedKontoId);

    try {
        const content = await liesseDateiMitEncodingFallback(file);
        let transactions = [];
        let format = 'CSV_GENERIC';
        let closingBalance = null;
        let skippedPendingSumme = 0;
        let rvslSkippedSumme = 0;

        if (file.name.toLowerCase().endsWith('.xml') || content.trim().startsWith('<?xml') || content.includes('<Document')) {
            format = 'CAMT053';
            const parser = typeof BankingController !== 'undefined' ? BankingController : window.BankingController;
            const statements = parser.parseCamt053(content);
            if (statements.length > 0) {
                transactions = statements.flatMap(s => s.transactions);
                closingBalance = statements[0].closingBalance;
                skippedPendingSumme = statements.reduce((sum, s) => sum + (s.skippedPending || 0), 0);
                rvslSkippedSumme = statements.reduce((sum, s) => sum + (s.rvslSkipped || 0), 0);
            }
        } else {
            const parser = typeof BankingController !== 'undefined' ? BankingController : window.BankingController;
            transactions = parser.parseCsvStatement(content, 'AUTO', konto ? konto.iban : '');
            format = 'CSV';
        }

        if (transactions.length === 0) {
            if (typeof showToast === 'function') showToast('Keine buchbaren Zeilen in der Datei gefunden (ggf. nur vorgemerkte/stornierte Einträge).', 'warning');
            return;
        }

        const res = await window.api.importBankTransactions(bankingState.selectedKontoId, transactions, {
            filename: file.name,
            format,
            closingBalance
        });

        if (typeof showToast === 'function') {
            let msg = `Import abgeschlossen: ${res.inserted} neu importiert, ${res.duplicates} Duplikate übersprungen.`;
            if (skippedPendingSumme > 0 || rvslSkippedSumme > 0) {
                msg += `, ${skippedPendingSumme + rvslSkippedSumme} vorgemerkt/storniert übersprungen`;
            }
            showToast(msg, 'success');
        }

        await ladeTransaktionen();
        if (res.inserted > 0) {
            switchBankingTab('opos');
        }
    } catch (err) {
        console.error('Import-Fehler:', err);
        if (typeof showToast === 'function') showToast('Fehler beim Importieren: ' + err.message, 'error');
    }
}

async function starteOposAbgleich() {
    if (!window.api || !window.api.runOposMatching) return;
    try {
        const res = await window.api.runOposMatching(bankingState.selectedKontoId);
        bankingState.matchVorschlaege = res.matches || [];
        renderOposVorschlaege(res);
    } catch (e) {
        console.error('Fehler beim OPOS-Abgleich:', e);
    }
}

function renderOposVorschlaege(stats = {}) {
    const tbody = document.getElementById('banking-opos-tbody');
    const badgeCount = document.getElementById('banking-opos-badge-count');
    const autoBtn = document.getElementById('banking-opos-auto-btn');

    if (badgeCount) {
        badgeCount.innerText = `${bankingState.matchVorschlaege.length} Vorschläge`;
    }

    if (!tbody) return;

    if (bankingState.matchVorschlaege.length === 0) {
        if (autoBtn) autoBtn.disabled = true;
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-10 text-slate-400 text-sm">
                    Keine offenen Zuordnungsvorschläge gefunden. Alle offenen Posten sind aktuell abgeglichen.
                </td>
            </tr>
        `;
        return;
    }

    if (autoBtn) autoBtn.disabled = false;

    tbody.innerHTML = bankingState.matchVorschlaege.map((m, idx) => {
        const tx = (bankingState.transaktionen || []).find(t => t.id === m.transaktionId) || {};
        const score = m.score || 0;
        let scoreBadge = '';
        if (score >= 90) {
            scoreBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800">${score}% Match</span>`;
        } else if (score >= 70) {
            scoreBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800">${score}% Match</span>`;
        } else {
            scoreBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-700">${score}% Match</span>`;
        }

        let typeLabel = '';
        if (m.matchType === 'EXACT_INVOICE_AND_AMOUNT') typeLabel = 'Exakter Rechnungs- & Betragstreffer';
        else if (m.matchType === 'SKONTO_DISCOUNT_MATCH') typeLabel = `Skonto-Abzug gem. Frist (${m.skontoAbzug.toFixed(2)} €)`;
        else if (m.matchType === 'PARTIAL_PAYMENT_MATCH') typeLabel = `Teilzahlung (Rest: ${m.restOffen.toFixed(2)} €)`;
        else if (m.matchType === 'IBAN_AND_AMOUNT_MATCH') typeLabel = 'Kunden-IBAN & Betragstreffer';
        else if (m.matchType === 'NAME_AND_AMOUNT_MATCH') typeLabel = 'Kundenname & Betragstreffer';
        else if (m.matchType === 'EXPENSE_EXACT_MATCH') typeLabel = 'Lieferantenrechnung (Geldausgang)';

        const betragStr = (parseFloat(m.betrag) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

        return `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                <td class="px-4 py-3 text-center">
                    <input type="checkbox" class="opos-match-checkbox rounded border-slate-300 text-primary focus:ring-primary" data-index="${idx}" checked>
                </td>
                <td class="px-4 py-3 text-xs text-center">${scoreBadge}</td>
                <td class="px-4 py-3 text-xs text-slate-800">
                    <div class="font-medium">${escapeHtml(tx.partner_name || 'Bankbuchung')}</div>
                    <div class="text-slate-500 text-[11px] truncate max-w-xs">${escapeHtml(tx.verwendungszweck || '')}</div>
                </td>
                <td class="px-4 py-3 text-xs font-semibold text-slate-800">
                    <div>Beleg ${escapeHtml(m.belegNr || '')}</div>
                    <div class="text-[11px] font-normal text-slate-500">${typeLabel}</div>
                </td>
                <td class="px-4 py-3 text-xs text-right font-semibold text-slate-800">${betragStr}</td>
                <td class="px-4 py-3 text-xs text-center">
                    ${m.skontoAbzug > 0 ? `<span class="text-amber-600 font-medium">${m.skontoAbzug.toFixed(2)} €</span>` : '<span class="text-slate-400">-</span>'}
                </td>
                <td class="px-4 py-3 text-xs text-center whitespace-nowrap">
                    <button onclick="uebernehmeEinzelMatch(${idx})"
                        class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium transition-colors">
                        Übernehmen
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function uebernehmeEinzelMatch(idx) {
    const match = bankingState.matchVorschlaege[idx];
    if (!match) return;
    await wendeMatchesAn([match]);
}

async function uebernehmeAlleAusgewaehltenMatches() {
    const checkboxes = document.querySelectorAll('.opos-match-checkbox:checked');
    const selectedMatches = [];
    checkboxes.forEach(cb => {
        const idx = parseInt(cb.dataset.index, 10);
        if (bankingState.matchVorschlaege[idx]) {
            selectedMatches.push(bankingState.matchVorschlaege[idx]);
        }
    });

    if (selectedMatches.length === 0) {
        if (typeof showToast === 'function') showToast('Keine Matches ausgewählt.', 'warning');
        return;
    }

    await wendeMatchesAn(selectedMatches);
}

async function wendeMatchesAn(matches) {
    if (!window.api || !window.api.applyPaymentMatching) return;
    try {
        const res = await window.api.applyPaymentMatching(matches);
        if (typeof showToast === 'function') {
            showToast(`${res.count || matches.length} Zahlung(en) erfolgreich verbucht.`, 'success');
        }
        await starteOposAbgleich();
    } catch (e) {
        console.error('Fehler bei Zahlungszuordnung:', e);
        if (typeof showToast === 'function') showToast('Fehler bei der Zuordnung: ' + e.message, 'error');
    }
}

async function entkoppleTransaktion(zuordnungId) {
    if (!confirm('Möchten Sie diese Zahlungszuordnung wirklich aufheben? Der Beleg wird wieder als offen geführt.')) return;
    if (!window.api || !window.api.unmatchTransaction) return;
    try {
        await window.api.unmatchTransaction(zuordnungId, 'Manuell aufgehoben');
        if (typeof showToast === 'function') showToast('Zahlungszuordnung aufgehoben.', 'info');
        await ladeTransaktionen();
    } catch (e) {
        console.error('Fehler beim Entkoppeln:', e);
        if (typeof showToast === 'function') showToast('Fehler beim Entkoppeln: ' + e.message, 'error');
    }
}

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
            tbody.innerHTML = bankingState.offeneSepaRechnungen.map(doc => {
                const offen = doc.offener_betrag !== null && doc.offener_betrag !== undefined
                    ? parseFloat(doc.offener_betrag)
                    : Math.round(((doc.brutto || 0) - (doc.bezahlt_betrag || 0)) * 100) / 100;
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
    checkboxes.forEach(cb => {
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

    tbody.innerHTML = bankingState.sepaLaeufe.map(lauf => {
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

        const stornoBtn = (lauf.status === 'ERSTELLT' || lauf.status === 'EXPORTIERT')
            ? `<button onclick="storniereSepaLauf(${lauf.id})" title="Lauf stornieren"
                class="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded text-xs transition-colors">Storno</button>`
            : '';
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

        tbody.innerHTML = (details.positionen || []).map(pos => {
            const betragStr = (parseFloat(pos.betrag) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
            const rueckBtn = pos.status !== 'RUECKLASTSCHRIFT' && pos.status !== 'STORNIERT'
                ? `<button onclick="markiereRuecklastschrift(${pos.id})" class="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded text-xs transition-colors">Rücklastschrift</button>`
                : '';
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
    checkboxes.forEach(cb => {
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
    const doc = bankingState.offeneSepaRechnungen.find(d => d.id === invoiceId);
    if (!doc) return;

    const konto = bankingState.konten.find(k => k.id === bankingState.selectedKontoId) || {};
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

async function ladeKontenUndMandate() {
    await ladeBankKonten();
    renderBankKontenListe();
    if (window.api && window.api.getKundenMandate) {
        bankingState.mandate = await window.api.getKundenMandate();
        renderMandateListe();
    }
}

function renderBankKontenListe() {
    const container = document.getElementById('banking-konten-list');
    if (!container) return;

    if (bankingState.konten.length === 0) {
        container.innerHTML = `<div class="text-sm text-slate-400 py-4">Noch keine eigenen Bankkonten hinterlegt.</div>`;
        return;
    }

    container.innerHTML = bankingState.konten.map(k => `
        <div class="p-4 rounded-xl border border-slate-200 bg-white shadow-sm flex items-center justify-between">
            <div>
                <div class="flex items-center gap-2">
                    <span class="font-semibold text-slate-800 text-sm">${escapeHtml(k.kontoname)}</span>
                    ${k.ist_standard ? '<span class="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-medium">Standard</span>' : ''}
                </div>
                <div class="text-xs font-mono text-slate-600 mt-1">${escapeHtml(k.iban)} · BIC: ${escapeHtml(k.bic || '-')}</div>
                <div class="text-xs text-slate-500 mt-0.5">${escapeHtml(k.bankname || '')} · Inhaber: ${escapeHtml(k.kontoinhaber)}</div>
            </div>
            <div class="flex items-center gap-2">
                <button onclick="oeffneBankKontoModal(${k.id})" class="p-1.5 text-slate-500 hover:text-slate-800 rounded hover:bg-slate-100">
                    <span class="material-symbols-outlined text-sm">edit</span>
                </button>
                <button onclick="loescheBankKonto(${k.id})" class="p-1.5 text-red-400 hover:text-red-600 rounded hover:bg-red-50">
                    <span class="material-symbols-outlined text-sm">delete</span>
                </button>
            </div>
        </div>
    `).join('');
}

function renderMandateListe() {
    const tbody = document.getElementById('banking-mandate-tbody');
    if (!tbody) return;

    if (bankingState.mandate.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-6 text-slate-400 text-sm">
                    Noch keine SEPA-Lastschriftmandate erfasst.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = bankingState.mandate.map(m => {
        let statusBadge = m.status === 'AKTIV'
            ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">Aktiv</span>'
            : '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">Widerrufen</span>';

        return `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                <td class="px-4 py-3 text-xs font-medium text-slate-800">${escapeHtml(m.kunden_name || '')}</td>
                <td class="px-4 py-3 text-xs font-mono font-semibold text-slate-700">${escapeHtml(m.mandatsreferenz)}</td>
                <td class="px-4 py-3 text-xs text-center">${escapeHtml(m.mandats_typ)} (${escapeHtml(m.sequenz_typ)})</td>
                <td class="px-4 py-3 text-xs font-mono text-slate-600">${escapeHtml(m.iban)}</td>
                <td class="px-4 py-3 text-xs text-center text-slate-600">${escapeHtml(m.unterschrifts_datum || '')}</td>
                <td class="px-4 py-3 text-xs text-center">${statusBadge}</td>
                <td class="px-4 py-3 text-xs text-center whitespace-nowrap">
                    <button onclick="loescheSepaMandat(${m.id})" class="p-1 text-red-400 hover:text-red-600 rounded">
                        <span class="material-symbols-outlined text-sm">delete</span>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function oeffneBankKontoModal(kontoId = null) {
    const modal = document.getElementById('bank-konto-modal');
    if (!modal) return;

    document.getElementById('bank-konto-id').value = kontoId || '';
    if (kontoId) {
        const k = bankingState.konten.find(x => x.id === kontoId);
        if (k) {
            document.getElementById('bank-konto-name').value = k.kontoname || '';
            document.getElementById('bank-konto-bankname').value = k.bankname || '';
            document.getElementById('bank-konto-iban').value = k.iban || '';
            document.getElementById('bank-konto-bic').value = k.bic || '';
            document.getElementById('bank-konto-inhaber').value = k.kontoinhaber || '';
            document.getElementById('bank-konto-glaeubiger').value = k.glaeubiger_id || '';
            document.getElementById('bank-konto-standard').checked = !!k.ist_standard;
        }
    } else {
        document.getElementById('bank-konto-name').value = '';
        document.getElementById('bank-konto-bankname').value = '';
        document.getElementById('bank-konto-iban').value = '';
        document.getElementById('bank-konto-bic').value = '';
        document.getElementById('bank-konto-inhaber').value = '';
        document.getElementById('bank-konto-glaeubiger').value = '';
        document.getElementById('bank-konto-standard').checked = bankingState.konten.length === 0;
    }

    modal.classList.remove('hidden');
}

function schliesseBankKontoModal() {
    const modal = document.getElementById('bank-konto-modal');
    if (modal) modal.classList.add('hidden');
}

async function speichereBankKontoForm() {
    const id = document.getElementById('bank-konto-id').value;
    const kontoname = document.getElementById('bank-konto-name').value.trim();
    const bankname = document.getElementById('bank-konto-bankname').value.trim();
    const iban = document.getElementById('bank-konto-iban').value.trim();
    const bic = document.getElementById('bank-konto-bic').value.trim();
    const kontoinhaber = document.getElementById('bank-konto-inhaber').value.trim();
    const glaeubiger_id = document.getElementById('bank-konto-glaeubiger').value.trim();
    const ist_standard = document.getElementById('bank-konto-standard').checked;

    if (!kontoname || !iban || !kontoinhaber) {
        if (typeof showToast === 'function') showToast('Kontoname, IBAN und Kontoinhaber sind erforderlich.', 'warning');
        return;
    }

    const sepaCtrl = typeof SepaController !== 'undefined' ? SepaController : window.SepaController;
    if (glaeubiger_id && !(sepaCtrl && sepaCtrl.validateGlaeubigerId && sepaCtrl.validateGlaeubigerId(glaeubiger_id))) {
        if (typeof showToast === 'function') showToast('Ungültige Gläubiger-Identifikationsnummer (Format DE##ZZZ###########, Prüfziffer falsch).', 'error');
        return;
    }

    try {
        await window.api.saveBankKonto({
            id: id ? parseInt(id, 10) : undefined,
            kontoname,
            bankname,
            iban,
            bic,
            kontoinhaber,
            glaeubiger_id,
            ist_standard
        });
        if (typeof showToast === 'function') showToast('Bankkonto gespeichert.', 'success');
        schliesseBankKontoModal();
        await ladeKontenUndMandate();
    } catch (e) {
        if (typeof showToast === 'function') showToast('Fehler beim Speichern: ' + e.message, 'error');
    }
}

async function loescheBankKonto(id) {
    if (!confirm('Möchten Sie dieses Bankkonto wirklich löschen oder deaktivieren?')) return;
    try {
        await window.api.deleteBankKonto(id);
        if (typeof showToast === 'function') showToast('Bankkonto entfernt.', 'info');
        await ladeKontenUndMandate();
    } catch (e) {
        if (typeof showToast === 'function') showToast('Fehler beim Löschen: ' + e.message, 'error');
    }
}

async function oeffneMandatModal() {
    const modal = document.getElementById('mandat-modal');
    if (!modal) return;

    let kunden = (typeof state !== 'undefined' && state.kunden) ? state.kunden : [];
    if ((!kunden || kunden.length === 0) && window.api && window.api.getFullState) {
        try {
            const full = await window.api.getFullState();
            kunden = full.kunden || [];
        } catch (_e) { kunden = []; }
    }

    const sel = document.getElementById('mandat-kunde');
    if (sel) {
        sel.innerHTML = kunden.length > 0
            ? kunden.map(k => `<option value="${k.id}" data-kundennummer="${escapeHtml(k.kundennummer || '')}" data-name="${escapeHtml(k.name || '')}">${escapeHtml(k.name)} (${escapeHtml(k.kundennummer || '')})</option>`).join('')
            : '<option value="">Keine Kunden vorhanden</option>';
    }
    sel.onchange = () => fuelleMandatsreferenzVorschlag(sel);

    document.getElementById('mandat-referenz').value = '';
    document.getElementById('mandat-unterschrift').value = new Date().toISOString().substring(0, 10);
    document.getElementById('mandat-typ').value = 'CORE';
    document.getElementById('mandat-sequenz').value = 'FRST';
    document.getElementById('mandat-iban').value = '';
    document.getElementById('mandat-bic').value = '';
    document.getElementById('mandat-kontoinhaber').value = '';
    document.getElementById('mandat-bankname').value = '';
    document.getElementById('mandat-prenot-tage').value = '14';
    document.getElementById('mandat-bemerkung').value = '';

    if (kunden.length > 0) fuelleMandatsreferenzVorschlag(sel);

    modal.classList.remove('hidden');
}

function fuelleMandatsreferenzVorschlag(sel) {
    const opt = sel.selectedOptions[0];
    if (!opt) return;
    const parser = typeof SepaController !== 'undefined' ? SepaController : window.SepaController;
    const refInput = document.getElementById('mandat-referenz');
    if (refInput && !refInput.value.trim() && parser && parser.generateMandateReference) {
        refInput.value = parser.generateMandateReference(opt.dataset.kundennummer || opt.value);
    }
}

function schliesseMandatModal() {
    const modal = document.getElementById('mandat-modal');
    if (modal) modal.classList.add('hidden');
}

async function speichereMandatForm() {
    const kundeSel = document.getElementById('mandat-kunde');
    const kundeId = parseInt(kundeSel.value, 10);
    const mandatsreferenz = document.getElementById('mandat-referenz').value.trim();
    const iban = document.getElementById('mandat-iban').value.trim();

    if (!kundeId) {
        if (typeof showToast === 'function') showToast('Bitte wählen Sie einen Kunden aus.', 'warning');
        return;
    }
    if (!mandatsreferenz || !iban) {
        if (typeof showToast === 'function') showToast('Kunde, Mandatsreferenz und IBAN sind Pflichtfelder.', 'warning');
        return;
    }

    try {
        await window.api.saveSepaMandat({
            kunde_id: kundeId,
            mandatsreferenz,
            mandats_typ: document.getElementById('mandat-typ').value,
            sequenz_typ: document.getElementById('mandat-sequenz').value,
            unterschrifts_datum: document.getElementById('mandat-unterschrift').value,
            iban,
            bic: document.getElementById('mandat-bic').value.trim(),
            kontoinhaber: document.getElementById('mandat-kontoinhaber').value.trim(),
            bank_name: document.getElementById('mandat-bankname').value.trim(),
            pre_notification_tage: parseInt(document.getElementById('mandat-prenot-tage').value, 10) || 14,
            bemerkung: document.getElementById('mandat-bemerkung').value.trim() || null
        });
        if (typeof showToast === 'function') showToast('SEPA-Mandat gespeichert.', 'success');
        schliesseMandatModal();
        await ladeKontenUndMandate();
    } catch (e) {
        console.error('Fehler beim Speichern des Mandats:', e);
        if (typeof showToast === 'function') showToast('Fehler beim Speichern: ' + e.message, 'error');
    }
}

async function loescheSepaMandat(id) {
    if (!confirm('Möchten Sie dieses SEPA-Mandat widerrufen?')) return;
    try {
        await window.api.deleteSepaMandat(id);
        if (typeof showToast === 'function') showToast('Mandat widerrufen.', 'info');
        await ladeKontenUndMandate();
    } catch (e) {
        if (typeof showToast === 'function') showToast('Fehler beim Widerrufen: ' + e.message, 'error');
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
