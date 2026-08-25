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
    renderBankingTabs();
    await switchBankingTab(bankingState.activeTab);
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
    const reader = new FileReader();

    reader.onload = async (e) => {
        const content = e.target.result;
        try {
            let transactions = [];
            let format = 'CSV_GENERIC';
            let closingBalance = null;

            if (file.name.toLowerCase().endsWith('.xml') || content.trim().startsWith('<?xml') || content.includes('<Document')) {
                format = 'CAMT053';
                const parser = typeof BankingController !== 'undefined' ? BankingController : window.BankingController;
                const statements = parser.parseCamt053(content);
                if (statements.length > 0) {
                    transactions = statements.flatMap(s => s.transactions);
                    closingBalance = statements[0].closingBalance;
                }
            } else {
                const parser = typeof BankingController !== 'undefined' ? BankingController : window.BankingController;
                transactions = parser.parseCsvStatement(content, 'AUTO', konto ? konto.iban : '');
                format = 'CSV';
            }

            if (transactions.length === 0) {
                if (typeof showToast === 'function') showToast('Keine Buchungszeilen in der Datei gefunden.', 'warning');
                return;
            }

            const res = await window.api.importBankTransactions(bankingState.selectedKontoId, transactions, {
                filename: file.name,
                format,
                closingBalance
            });

            if (typeof showToast === 'function') {
                showToast(`Import abgeschlossen: ${res.inserted} neu importiert, ${res.duplicates} Duplikate übersprungen.`, 'success');
            }

            await ladeTransaktionen();
            if (res.inserted > 0) {
                switchBankingTab('opos');
            }
        } catch (err) {
            console.error('Import-Fehler:', err);
            if (typeof showToast === 'function') showToast('Fehler beim Importieren: ' + err.message, 'error');
        }
    };

    reader.readAsText(file);
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
        } else {
            statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">Erstellt</span>';
        }

        return `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                <td class="px-4 py-3 text-xs font-mono font-semibold text-slate-800">${escapeHtml(lauf.lauf_nr)}</td>
                <td class="px-4 py-3 text-xs text-slate-600">${escapeHtml(lauf.kontoname || '')}</td>
                <td class="px-4 py-3 text-xs text-center">${escapeHtml(lauf.ausfuehrungs_datum)}</td>
                <td class="px-4 py-3 text-xs text-center">${lauf.anzahl_transaktionen}</td>
                <td class="px-4 py-3 text-xs text-right font-semibold text-slate-800">${summeStr}</td>
                <td class="px-4 py-3 text-xs text-center">${statusBadge}</td>
                <td class="px-4 py-3 text-xs text-center whitespace-nowrap">
                    <button onclick="downloadSepaXml(${lauf.id})"
                        class="px-2.5 py-1 bg-primary hover:bg-primary-dark text-white rounded text-xs font-medium transition-colors flex items-center gap-1 mx-auto">
                        <span class="material-symbols-outlined text-xs">download</span>
                        XML Download
                    </button>
                </td>
            </tr>
        `;
    }).join('');
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

    try {
        const res = await window.api.createSepaRun({
            bankKontoId: bankingState.selectedKontoId,
            invoiceIds,
            ausfuehrungsDatum: executionDate,
            xmlFormat,
            sammelTyp
        });

        if (typeof showToast === 'function') {
            showToast(`SEPA-Lauf ${res.laufNr} erfolgreich mit ${res.anzahlTransaktionen} Posten (${res.summeGesamt.toFixed(2)} €) generiert.`, 'success');
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
    const text = parser.buildPreNotification({
        glaeubigerId: konto.glaeubiger_id || 'DE98ZZZ09999999999',
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
