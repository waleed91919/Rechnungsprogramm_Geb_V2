/**
 * Extrahiert die laufende Nummer aus einer Belegnummer - robust gegen Präfixe wie
 * "STORNO - INV-2026-001" oder abweichende Formate. Es wird die LASTE Zifferngruppe
 * der Nummer verwendet (regex statt blindes parseInt auf split('-').pop()).
 */
function extractLaufendeNummer(nr) {
    const groups = String(nr || '').match(/\d+/g);
    return (groups && groups.length > 0) ? (parseInt(groups[groups.length - 1], 10) || 0) : 0;
}

window.extractLaufendeNummer = extractLaufendeNummer;

function calculateRechnungTotals() {
    if (state.isAngebotMode && window.AngebotController) {
        const posList = state.currentRechnungPositionen || [];
        const curIdVal = document.getElementById('rechnung-id')?.value;
        const curId = curIdVal ? parseInt(curIdVal, 10) : null;
        const existing = curId ? (state.angebote || []).find(a => a.id === curId) : null;

        const auftraggeberTypEl = document.getElementById('angebot-auftraggeber-typ');
        const auftraggeber_typ = auftraggeberTypEl ? auftraggeberTypEl.value : (existing?.auftraggeber_typ || 'PRIVAT');

        const cb13b = document.getElementById('angebot-13b-ustg');
        let unterliegt_13b = 0;
        if (cb13b) {
            unterliegt_13b = (auftraggeber_typ !== 'PRIVAT' && cb13b.checked) ? 1 : 0;
        } else if (existing && existing.unterliegt_13b !== undefined) {
            unterliegt_13b = existing.unterliegt_13b ? 1 : 0;
        }

        const totals = window.AngebotController.calculateTotals(posList, { unterliegt_13b: Boolean(unterliegt_13b) });

        const sichEl = document.getElementById('angebot-sicherheitseinbehalt');
        let sicherheitseinbehalt_prozent = 0;
        if (sichEl) {
            const sVal = sichEl.value.trim();
            sicherheitseinbehalt_prozent = (sVal !== '' && !isNaN(parseFloat(sVal))) ? parseFloat(sVal) : 0;
        } else if (existing?.sicherheitseinbehalt_prozent !== undefined) {
            sicherheitseinbehalt_prozent = parseFloat(existing.sicherheitseinbehalt_prozent) || 0;
        }
        const sicherheitseinbehalt = (totals.netto && sicherheitseinbehalt_prozent > 0)
            ? Math.round(totals.netto * sicherheitseinbehalt_prozent) / 100
            : 0;

        state.currentRechnungTotals = {
            netto: totals.netto,
            steuer: totals.steuer,
            brutto: totals.brutto,
            rabattAbzug: 0,
            anzahlung: 0,
            sicherheitseinbehalt,
            sicherheitseinbehalt_prozent,
            kumulierte_leistung_netto: totals.netto,
            zahlbetrag: totals.brutto,
            netto13b: (totals.totals13bNetto !== undefined && totals.totals13bNetto !== null) ? totals.totals13bNetto : (unterliegt_13b ? totals.netto : 0),
            nettoNormal: (totals.totalsNormalNetto !== undefined && totals.totalsNormalNetto !== null) ? totals.totalsNormalNetto : (unterliegt_13b ? 0 : totals.netto)
        };

        const nettoEl = document.getElementById('rechnung-netto');
        if (nettoEl) nettoEl.textContent = formatCurrency(totals.netto);
        const bruttoEl = document.getElementById('rechnung-brutto');
        if (bruttoEl) bruttoEl.textContent = formatCurrency(totals.brutto);
        const zahlbetragEl = document.getElementById('rechnung-zahlbetrag');
        if (zahlbetragEl) zahlbetragEl.textContent = formatCurrency(totals.brutto);
        const zwSumEl = document.getElementById('rechnung-zwischensumme');
        if (zwSumEl) zwSumEl.textContent = formatCurrency(totals.netto);
        const rabattEl = document.getElementById('rechnung-rabatt-wert');
        if (rabattEl) rabattEl.textContent = formatCurrency(0);

        const sichRow = document.getElementById('rechnung-sicherheitseinbehalt-row');
        const sichWert = document.getElementById('rechnung-sicherheitseinbehalt-wert');
        if (sichRow && sichWert) {
            if (sicherheitseinbehalt_prozent > 0 && sicherheitseinbehalt > 0) {
                sichRow.classList.remove('hidden');
                sichWert.textContent = `- ${formatCurrency(sicherheitseinbehalt)}`;
            } else {
                sichRow.classList.add('hidden');
            }
        }

        const steuerContainer = document.getElementById('rechnung-steuern-container');
        if (steuerContainer) {
            steuerContainer.innerHTML = '';
            for (const [rate, data] of Object.entries(totals.taxBreakdown || {})) {
                const div = document.createElement('div');
                div.className = 'flex justify-between items-center text-xs text-slate-500';
                if (data.is13b || (rate === '0' && Boolean(data.notice || unterliegt_13b))) {
                    div.innerHTML = `<span>USt. nicht erhoben (§ 13b Steuerschuldnerschaft d. Leistungsempfängers auf ${formatCurrency(data.base)})</span><span class="font-mono text-slate-700">${formatCurrency(data.tax)}</span>`;
                } else {
                    div.innerHTML = `<span>MwSt. ${rate}% (auf ${formatCurrency(data.base)})</span><span class="font-mono text-slate-700">${formatCurrency(data.tax)}</span>`;
                }
                steuerContainer.appendChild(div);
            }
        }
        return;
    }

    if (!window.invoiceView && window.InvoiceView) {
        window.invoiceView = new window.InvoiceView(window.formatCurrency);
    }
    if (!window.invoiceModel && window.InvoiceModel) {
        window.invoiceModel = new window.InvoiceModel(window.api);
    }

    if (!window.invoiceView || !window.InvoiceController) {
        console.warn("MVC Invoice components not yet initialized.");
        return;
    }

    let currentProjekt = null;
    const projektSelect = document.getElementById('rechnung-projekt');
    if (projektSelect && projektSelect.value) {
        const projektId = parseInt(projektSelect.value);
        currentProjekt = state.projekte ? state.projekte.find(p => parseInt(p.id) === projektId) : null;
    }

    state.currentRechnungTotals13bNetto = 0;
    state.currentRechnungTotalsNormalNetto = 0;

    // P0.2: Vorgänger-Einbehalte desselben Projekts aus gespeicherten Belegen laden.
    let previousInvoices = [];
    try {
        const curIdEl = document.getElementById('rechnung-id');
        const curId = curIdEl && curIdEl.value ? parseInt(curIdEl.value, 10) : null;
        const docs = (state.rechnungen || []).concat(state.dokumente || []);
        if (currentProjekt) {
            previousInvoices = docs.filter(d => {
                const pid = d.projektId !== undefined ? d.projektId : d.projekt_id;
                const isSameProject = parseInt(pid, 10) === parseInt(currentProjekt.id, 10);
                const isNotCurrent = (curId == null || parseInt(d.id, 10) !== curId);
                const isInvoice = (d.type === 'rechnung' || !d.type);
                const isValidStatus = d.status !== 'Storniert' && d.status !== 'Entwurf';
                const isNotSchluss = d.rechnungsart !== 'SCHLUSSRECHNUNG';
                return isSameProject && isNotCurrent && isInvoice && isValidStatus && isNotSchluss;
            });
        }
    } catch (_e) { previousInvoices = []; }

    const rechnungArt = document.getElementById('rechnung-art')?.value || 'REGULAER';
    const retentionMode = (rechnungArt === 'ABSCHLAG_KUMULIERT' || currentProjekt?.retention_mode === 'EXECUTION')
        ? 'EXECUTION'
        : 'WARRANTY';
    const contractTotalNet = currentProjekt ? (parseFloat(currentProjekt.budget) || parseFloat(currentProjekt.contractTotalNet) || 0) : 0;
    const retentionBase = document.getElementById('rechnung-sicherheitseinbehalt-basis')?.value || currentProjekt?.retention_base || 'netto';

    const calculated = window.invoiceView.handleInputEvent(
        state.currentRechnungPositionen || [],
        state.currentRechnungVerrechnungen || [],
        currentProjekt,
        (res) => {
            state.currentRechnungTotals13bNetto = res.totals13bNetto;
            state.currentRechnungTotalsNormalNetto = res.totalsNormalNetto;
        },
        {
            previousInvoices,
            retentionMode,
            contractTotalNet,
            retentionBase
        }
    );

    state.currentRechnungTotals = {
        netto: calculated.nettoNachRabatt,
        steuer: calculated.totalTax,
        brutto: calculated.bruttoNachRabatt,
        rabattAbzug: calculated.abzug,
        anzahlung: calculated.anzahlung,
        sicherheitseinbehalt: calculated.sicherheitseinbehaltNetto,
        sicherheitseinbehalt_prozent: calculated.sicherheitseinbehaltProzent,
        kumulierte_leistung_netto: calculated.nettoNachRabatt,
        zahlbetrag: calculated.zahlbetrag,
        netto13b: calculated.totals13bNetto,
        nettoNormal: calculated.totalsNormalNetto
    };
}

window.calculateRechnungTotals = calculateRechnungTotals;
