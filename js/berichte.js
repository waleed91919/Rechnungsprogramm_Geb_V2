function initBerichte() {
    renderBerichte();
    
    // Close dropdown when clicking outside
    window.addEventListener('click', function(e) {
        const dropdown = document.getElementById('report-filter-dropdown');
        const trigger = dropdown ? dropdown.previousElementSibling : null;
        if (dropdown && !dropdown.contains(e.target) && !trigger.contains(e.target)) {
            dropdown.classList.add('hidden');
            const arrow = document.getElementById('report-filter-arrow');
            if (arrow) arrow.style.transform = 'rotate(0deg)';
        }
    });
}

/**
 * Custom Dropdown Logic
 */
function toggleReportFilterDropdown() {
    const dropdown = document.getElementById('report-filter-dropdown');
    const arrow = document.getElementById('report-filter-arrow');
    if (!dropdown) return;
    
    const isHidden = dropdown.classList.toggle('hidden');
    if (arrow) {
        arrow.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
    }
}

function selectReportFilter(val, label) {
    const hiddenSelect = document.getElementById('report-time-filter');
    const labelEl = document.getElementById('report-time-filter-label');
    const dropdown = document.getElementById('report-filter-dropdown');
    const arrow = document.getElementById('report-filter-arrow');
    
    if (hiddenSelect) {
        hiddenSelect.value = val;
        // Manually trigger the onchange logic
        handleReportTimeFilterChange();
    }
    
    if (labelEl) labelEl.innerText = label;
    if (dropdown) dropdown.classList.add('hidden');
    if (arrow) arrow.style.transform = 'rotate(0deg)';
    
    // Update active state in dropdown UI
    if (dropdown) {
        const buttons = dropdown.querySelectorAll('button');
        buttons.forEach(btn => {
            if (btn.innerText === label) {
                btn.classList.add('font-semibold', 'bg-blue-50/30');
            } else {
                btn.classList.remove('font-semibold', 'bg-blue-50/30');
            }
        });
    }
}

function handleReportTimeFilterChange() {
    const val = document.getElementById('report-time-filter').value;
    const customDiv = document.getElementById('report-custom-dates');
    if (val === 'custom') {
        customDiv.classList.remove('hidden');
    } else {
        customDiv.classList.add('hidden');
        renderBerichte();
    }
}

function getBezahlteUndStornierteRechnungen(rechnungen) {
    if (!rechnungen) return [];
    
    // Create an O(1) lookup Set of all paid invoice numbers
    const bezahlteNrs = new Set();
    for (const r of rechnungen) {
        if (r.status === 'Bezahlt' && r.nr) {
            bezahlteNrs.add(r.nr);
        }
    }

    // Include Bezahlt invoices AND Storniert invoices that have a corresponding STORNO invoice that is Bezahlt
    // This ensures that the original positive amount offsets the negative STORNO amount to result in 0 net revenue.
    return rechnungen.filter(r => isRechnungBezahltOderStorniert(r, bezahlteNrs));
}

function getFilteredRechnungen() {
    if (!state.rechnungen) return [];

    const bezahlte = getBezahlteUndStornierteRechnungen(state.rechnungen);

    const filterSelect = document.getElementById('report-time-filter');
    if (!filterSelect) return bezahlte;

    const val = filterSelect.value;
    const today = new Date();

    return bezahlte.filter(r => {
        const d = new Date(r.datum);
        switch (val) {
            case 'this_month':
                return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
            case 'last_month':
                const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                return d.getMonth() === lastMonth.getMonth() && d.getFullYear() === lastMonth.getFullYear();
            case 'this_quarter':
                const q = Math.floor(today.getMonth() / 3);
                const rq = Math.floor(d.getMonth() / 3);
                return q === rq && d.getFullYear() === today.getFullYear();
            case 'this_year':
                return d.getFullYear() === today.getFullYear();
            case 'last_year':
                return d.getFullYear() === today.getFullYear() - 1;
            case 'custom':
                const from = document.getElementById('report-date-from').value;
                const to = document.getElementById('report-date-to').value;
                if (from && d < new Date(from)) return false;
                if (to) {
                    const toDate = new Date(to);
                    toDate.setHours(23, 59, 59);
                    if (d > toDate) return false;
                }
                return true;
            case 'all_time':
            default:
                return true;
        }
    });
}

function calculateReportMetrics(bezahlteRechnungen) {
    let totalRevenue = 0;
    let totalProfit = 0;
    let netRevenue = 0;
    let monthlyTax = 0;

    const articleSales = {};
    const customerSales = {};

    const kundenMap = new Map(state.kunden.map(k => [k.id, k]));
    const artikelMap = new Map(state.artikel.map(a => [a.id, a]));

    bezahlteRechnungen.forEach(r => {
        totalRevenue += r.brutto;
        netRevenue += r.netto;

        let invoiceEk = 0;
        if (r.positionen) {
            r.positionen.forEach(p => {
                let itemEk = 0;
                
                if (p.ek !== undefined && p.ek !== null) {
                    itemEk = p.ek;
                } else if (p.artikelId) {
                    const article = artikelMap.get(p.artikelId);
                    if (article) {
                        itemEk = article.ek;
                    }
                }
                
                invoiceEk += (itemEk * p.menge);
                
                const articleId = p.artikelId || 'custom-' + p.name;
                if (!articleSales[articleId]) {
                    const artName = p.artikelId ? (artikelMap.get(p.artikelId)?.name || p.name) : p.name;
                    articleSales[articleId] = { name: artName, verkauft: 0, umsatz: 0 };
                }
                articleSales[articleId].verkauft += p.menge;
                articleSales[articleId].umsatz += (p.preis * p.menge);
            });
        }
        totalProfit += (r.netto - invoiceEk);

        monthlyTax += r.steuer;

        if (!customerSales[r.kundeId]) {
            const k = kundenMap.get(parseInt(r.kundeId));
            customerSales[r.kundeId] = { name: k ? k.name : 'Unbekannt', rechnungen: 0, umsatz: 0 };
        }
        customerSales[r.kundeId].rechnungen++;
        customerSales[r.kundeId].umsatz += r.netto;
    });

    const margin = netRevenue > 0 ? (totalProfit / netRevenue) * 100 : 0;

    return { totalRevenue, totalProfit, margin, monthlyTax, articleSales, customerSales };
}

function renderReportMetrics(metrics) {
    const elRevenue = document.getElementById('report-revenue');
    if (elRevenue) animateValue(elRevenue, 0, metrics.totalRevenue, 800, true);

    const elMargin = document.getElementById('report-margin');
    if (elMargin) animateValue(elMargin, 0, metrics.margin, 800, false, true);

    const elTotalProfit = document.getElementById('report-total-profit');
    if (elTotalProfit) animateValue(elTotalProfit, 0, metrics.totalProfit, 800, true);

    const elMonthlyTax = document.getElementById('report-monthly-tax');
    if (elMonthlyTax) animateValue(elMonthlyTax, 0, metrics.monthlyTax, 800, true);

    const elCurrentMonthLabel = document.getElementById('report-current-month-label');
    if (elCurrentMonthLabel) {
        const sel = document.getElementById('report-time-filter');
        elCurrentMonthLabel.innerText = sel ? sel.options[sel.selectedIndex].text : "Gewählter Zeitraum";
    }
}

function renderTopSellers(articleSales) {
    const sortedArticles = Object.values(articleSales).sort((a, b) => b.umsatz - a.umsatz).slice(0, 5);
    const tbody = document.getElementById('report-topsellers-body');
    if (tbody) {
        tbody.innerHTML = '';
        if (sortedArticles.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-slate-400">Keine Daten verfügbar.</td></tr>';
        } else {
            sortedArticles.forEach((a, idx) => {
                const tr = document.createElement('tr');
                tr.className = 'border-b border-slate-50 last:border-0 hover:bg-slate-50';

                const tdIdx = document.createElement('td');
                tdIdx.className = 'px-5 py-3 text-center text-slate-400 font-mono';
                tdIdx.textContent = idx + 1;
                tr.appendChild(tdIdx);

                const tdName = document.createElement('td');
                tdName.className = 'px-5 py-3 font-medium text-slate-700';
                tdName.textContent = a.name;
                tr.appendChild(tdName);

                const tdSold = document.createElement('td');
                tdSold.className = 'px-5 py-3 text-center text-slate-600';
                tdSold.textContent = a.verkauft;
                tr.appendChild(tdSold);

                const tdRevenue = document.createElement('td');
                tdRevenue.className = 'px-5 py-3 text-right font-medium text-slate-800';
                tdRevenue.textContent = formatCurrency(a.umsatz);
                tr.appendChild(tdRevenue);

                tbody.appendChild(tr);
            });
        }
    }
}

function renderTopCustomers(customerSales) {
    const sortedCustomers = Object.values(customerSales).sort((a, b) => b.umsatz - a.umsatz).slice(0, 5);
    const tbodyCustomers = document.getElementById('report-topcustomers-body');
    if (tbodyCustomers) {
        tbodyCustomers.innerHTML = '';
        if (sortedCustomers.length === 0) {
            tbodyCustomers.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-slate-400">Keine Daten verfügbar.</td></tr>';
        } else {
            sortedCustomers.forEach((c, idx) => {
                const tr = document.createElement('tr');
                tr.className = 'border-b border-slate-50 last:border-0 hover:bg-slate-50';

                const tdIdx = document.createElement('td');
                tdIdx.className = 'px-5 py-3 text-center text-slate-400 font-mono';
                tdIdx.textContent = idx + 1;
                tr.appendChild(tdIdx);

                const tdName = document.createElement('td');
                tdName.className = 'px-5 py-3 font-medium text-slate-700';
                tdName.textContent = c.name;
                tr.appendChild(tdName);

                const tdCount = document.createElement('td');
                tdCount.className = 'px-5 py-3 text-center text-slate-600';
                tdCount.textContent = c.rechnungen;
                tr.appendChild(tdCount);

                const tdRevenue = document.createElement('td');
                tdRevenue.className = 'px-5 py-3 text-right font-medium text-slate-800';
                tdRevenue.textContent = formatCurrency(c.umsatz);
                tr.appendChild(tdRevenue);

                tbodyCustomers.appendChild(tr);
            });
        }
    }
}

function renderBerichte() {
    if (!state.rechnungen || state.rechnungen.length === 0) return;

    const bezahlteRechnungen = getFilteredRechnungen();

    const metrics = calculateReportMetrics(bezahlteRechnungen);

    renderReportMetrics(metrics);
    renderTopSellers(metrics.articleSales);
    renderTopCustomers(metrics.customerSales);

    renderTrendChart();
}

function renderTrendChart() {
    const chartContainer = document.getElementById('report-trend-chart');
    if (!chartContainer) return;

    // We want the last 6 months including current
    const monthsData = [];
    const today = new Date();

    for (let i = 5; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        monthsData.push({
            label: d.toLocaleDateString('de-DE', { month: 'short' }),
            month: d.getMonth(),
            year: d.getFullYear(),
            netRevenue: 0
        });
    }

    // calculate revenue for each
    const bezahlte = getBezahlteUndStornierteRechnungen(state.rechnungen);
    bezahlte.forEach(r => {
        const d = new Date(r.datum);
        const m = d.getMonth();
        const y = d.getFullYear();
        const slot = monthsData.find(x => x.month === m && x.year === y);
        if (slot) {
            slot.netRevenue += r.netto;
        }
    });

    const maxRev = Math.max(...monthsData.map(m => m.netRevenue), 1); // prevent div by zero

    chartContainer.innerHTML = '';
    monthsData.forEach(m => {
        const heightPct = (m.netRevenue / maxRev) * 100;

        const col = document.createElement('div');
        col.className = 'flex flex-col items-center justify-end w-full h-full group relative';

        // Tooltip
        const divTooltip = document.createElement('div');
        divTooltip.className = 'absolute -top-10 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none';
        divTooltip.textContent = formatCurrency(m.netRevenue);
        col.appendChild(divTooltip);

        // Bar
        const divBar = document.createElement('div');
        divBar.className = 'w-full max-w-[40px] bg-indigo-100 rounded-t-lg relative overflow-hidden flex items-end mx-1 transition-all duration-500 hover:bg-indigo-200';
        divBar.style.height = `${Math.max(5, heightPct)}%`;
        const divFill = document.createElement('div');
        divFill.className = 'w-full bg-indigo-500 rounded-t-lg transition-all duration-700 ease-out';
        divFill.style.height = '100%';
        divBar.appendChild(divFill);
        col.appendChild(divBar);

        // Label
        const divLabel = document.createElement('div');
        divLabel.className = 'text-xs text-slate-500 font-medium mt-2';
        divLabel.textContent = m.label;
        col.appendChild(divLabel);

        chartContainer.appendChild(col);
    });
}

function getReportPeriodText() {
    const filterSelect = document.getElementById("report-time-filter");
    if (!filterSelect) return "";
    return filterSelect.options[filterSelect.selectedIndex].text;
}

function printTaxReport(directPrint = false) {
    const bezahlteRechnungen = getFilteredRechnungen();
    const periodText = getReportPeriodText();

    const data = calculateSteuerberichtData(bezahlteRechnungen);
    const reportHtml = generateSteuerberichtHtml(data, periodText);

    executeReportPrint(reportHtml, directPrint);
}

function executeReportPrint(reportHtml, directPrint) {
    let printContainer = document.getElementById('print-template');

    if (!printContainer) {
        printContainer = document.createElement('div');
        printContainer.id = 'print-template';
        printContainer.className = 'hidden print:block print:w-full print:bg-white text-black text-sm absolute inset-0 z-[9999] bg-white';
        document.body.appendChild(printContainer);
    }

    if (directPrint) {
        // eslint-disable-next-line no-inner-html
        printContainer.innerHTML = reportHtml;
        window.print();
    } else {
        if (typeof openPdfPreview === 'function') {
            openPdfPreview(reportHtml);
        } else {
            console.error('openPdfPreview function not found');
        }
    }
}

/**
 * Steuerbericht Modal & Exports
 */

function openSteuerberichtModal() {
    const modal = document.getElementById('steuerbericht-modal');
    const label = document.getElementById('steuerbericht-period-label');
    const filterSelect = document.getElementById('report-time-filter');
    
    if (label && filterSelect) {
        label.innerText = filterSelect.options[filterSelect.selectedIndex].text;
    }
    
    if (modal) modal.classList.remove('hidden');
}

function closeSteuerberichtModal() {
    const modal = document.getElementById('steuerbericht-modal');
    if (modal) modal.classList.add('hidden');
}

function calculateSteuerberichtData(bezahlteRechnungen) {
    let totalNetto = 0;
    let tax19 = 0;
    let tax7 = 0;
    let totalBrutto = 0;
    let tableRows = "";

    const kundenMap = new Map(state.kunden.map(k => [k.id, k]));

    bezahlteRechnungen.forEach(r => {
        totalNetto += r.netto;
        totalBrutto += r.brutto;
        
        if (r.positionen) {
            let positionenNettoRaw = 0;
            let taxesRaw = { 19: 0, 7: 0 };
            
            r.positionen.forEach(p => {
                const rabatt = parseFloat(p.rabatt) || 0;
                const rowNetto = (p.menge * p.preis) * (1 - rabatt / 100);
                positionenNettoRaw += rowNetto;
                const mwst = parseFloat(p.mwst);
                if (mwst > 0) {
                    taxesRaw[mwst] = (taxesRaw[mwst] || 0) + (rowNetto * (mwst / 100));
                }
            });

            const globalAbzug = parseFloat(r.globalRabattAbzug) || 0;
            const rabattFaktor = positionenNettoRaw > 0 ? ((positionenNettoRaw - globalAbzug) / positionenNettoRaw) : 1;

            if (taxesRaw[19]) tax19 += taxesRaw[19] * rabattFaktor;
            if (taxesRaw[7]) tax7 += taxesRaw[7] * rabattFaktor;
        }

        const dateStr = r.zahlungsdatum ? new Date(r.zahlungsdatum).toLocaleDateString("de-DE") : new Date(r.datum).toLocaleDateString("de-DE");
        const kName = kundenMap.get(parseInt(r.kundeId))?.name || "Unbekannt";

        tableRows += `
            <tr class="border-b border-slate-200 text-[11px]">
                <td class="py-2">${sanitize(dateStr)}</td>
                <td class="py-2">${sanitize(r.nr)}</td>
                <td class="py-2 font-medium">${sanitize(kName)}</td>
                <td class="py-2 text-right">${formatCurrency(r.netto)}</td>
                <td class="py-2 text-right">${sanitize(r.positionen?.[0]?.mwst || 19)}%</td>
                <td class="py-2 text-right">${formatCurrency(r.steuer)}</td>
                <td class="py-2 text-right font-bold">${formatCurrency(r.brutto)}</td>
            </tr>
        `;
    });

    return {
        totalNetto,
        tax19,
        tax7,
        totalBrutto,
        tableRows
    };
}
function generateSteuerberichtHtml(data, periodText) {
    const { totalNetto, tax19, tax7, totalBrutto, tableRows } = data;

    return `
        <div id="invoice-paper" class="invoice-paper p-10 max-w-5xl mx-auto bg-white text-slate-800 flex flex-col justify-between relative" style="font-family: 'Inter', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
            <div class="flex justify-between items-end border-b-4 border-primary pb-8 mb-8">
                <div>
                    <h1 class="text-3xl font-black uppercase tracking-tighter text-primary">Umsatzsteuerbericht</h1>
                    <p class="text-slate-500 font-bold mt-1 tracking-widest uppercase text-xs">Offizielles Dokument & Nachweis</p>
                </div>
                <div class="text-right">
                    <p class="text-xl font-black text-slate-800">${sanitize(state.einstellungen.firmenname || 'Ihre Firma')}</p>
                    <p class="text-slate-500 text-sm font-medium">Steuernummer: ${sanitize(state.einstellungen.steuernummer || '-')}</p>
                    <p class="bg-slate-100 px-3 py-1 rounded text-primary font-bold text-sm mt-2 inline-block italic">Zeitraum: ${sanitize(periodText)}</p>
                </div>
            </div>

            <div class="grid grid-cols-4 gap-4 mb-10">
                <div class="bg-slate-50 border-l-4 border-slate-400 p-4 rounded shadow-sm">
                    <p class="text-[10px] font-bold text-slate-500 uppercase mb-1">Nettoumsatz</p>
                    <p class="text-xl font-black text-slate-800">${formatCurrency(totalNetto)}</p>
                </div>
                <div class="bg-blue-50 border-l-4 border-blue-500 p-4 rounded shadow-sm">
                    <p class="text-[10px] font-bold text-blue-600 uppercase mb-1">19% Umsatzsteuer</p>
                    <p class="text-xl font-black text-blue-700">${formatCurrency(tax19)}</p>
                </div>
                <div class="bg-indigo-50 border-l-4 border-indigo-400 p-4 rounded shadow-sm">
                    <p class="text-[10px] font-bold text-indigo-600 uppercase mb-1">7% Umsatzsteuer</p>
                    <p class="text-xl font-black text-indigo-700">${formatCurrency(tax7)}</p>
                </div>
                <div class="bg-primary text-white p-4 rounded shadow-md shadow-primary/20">
                    <p class="text-[10px] font-bold opacity-80 uppercase mb-1 text-white">Gesamtbetrag Brutto</p>
                    <p class="text-2xl font-black">${formatCurrency(totalBrutto)}</p>
                </div>
            </div>

            <h2 class="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                <span class="w-2 h-6 bg-primary rounded-full"></span>
                Detaillierte Aufstellung (Ist-Versteuerung)
            </h2>
            <p class="text-xs text-slate-500 mb-4 italic">Berücksichtigt werden nur Rechnungen mit Status "Bezahlt" im gewählten Zeitraum.</p>

            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="border-b-2 border-slate-800 text-[10px] font-black uppercase text-slate-600">
                        <th class="py-3">Zahldatum</th>
                        <th class="py-3">Rechnung</th>
                        <th class="py-3">Kunde</th>
                        <th class="py-3 text-right">Netto</th>
                        <th class="py-3 text-right">Satz</th>
                        <th class="py-3 text-right">USt.</th>
                        <th class="py-3 text-right">Brutto</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows || '<tr><td colspan="7" class="py-10 text-center text-slate-400 font-medium">Keine Daten für diesen Zeitraum vorhanden.</td></tr>'}
                </tbody>
                <tfoot>
                    <tr class="bg-slate-900 text-white font-bold">
                        <td colspan="3" class="py-3 px-4 rounded-l-lg">GESAMTSUMME</td>
                        <td class="py-3 text-right">${formatCurrency(totalNetto)}</td>
                        <td class="py-3"></td>
                        <td class="py-3 text-right">${formatCurrency(tax19 + tax7)}</td>
                        <td class="py-3 text-right px-4 rounded-r-lg">${formatCurrency(totalBrutto)}</td>
                    </tr>
                </tfoot>
            </table>

            <div class="mt-20 pt-8 border-t border-slate-100 flex justify-between text-[10px] text-slate-400 font-medium uppercase tracking-widest">
                <p>Erstellt am: ${new Date().toLocaleString('de-DE')}</p>
                <p>ERP RECHNUNGSPROGRAMM - EXPORT STEUERBERATER</p>
                <p>Seite 1 von 1</p>
            </div>
        </div>
    `;
}

function exportSteuerberichtPDF() {
    const bezahlteRechnungen = getFilteredRechnungen();
    const periodText = getReportPeriodText();

    const data = calculateSteuerberichtData(bezahlteRechnungen);
    const reportHtml = generateSteuerberichtHtml(data, periodText);

    openPdfPreview(reportHtml);
}

function exportSteuerberichtCSV() {
    const bezahlteRechnungen = getFilteredRechnungen();
    
    // CSV Header
    const headers = [
        "Rechnungsdatum",
        "Zahlungsdatum",
        "Rechnungsnummer",
        "Kundenname",
        "Nettobetrag",
        "Steuersatz",
        "Steuerbetrag",
        "Bruttobetrag"
    ];

    const formatDe = (val) => {
        if (typeof val !== 'number') return val;
        return val.toFixed(2).replace('.', ',');
    };

    let csvContent = headers.join(";") + "\r\n";

    const kundenMap = new Map(state.kunden.map(k => [k.id, k]));

    bezahlteRechnungen.forEach(r => {
        const kName = kundenMap.get(parseInt(r.kundeId))?.name || "Unbekannt";
        const mwstSatz = r.positionen?.[0]?.mwst || 19;
        
        const row = [
            new Date(r.datum).toLocaleDateString('de-DE'),
            r.zahlungsdatum ? new Date(r.zahlungsdatum).toLocaleDateString('de-DE') : new Date(r.datum).toLocaleDateString('de-DE'),
            r.nr,
            kName.replace(/;/g, ","), // Sanitize semicolon
            formatDe(r.netto),
            mwstSatz,
            formatDe(r.steuer),
            formatDe(r.brutto)
        ];
        csvContent += row.join(";") + "\r\n";
    });

    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Steuerbericht_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    closeSteuerberichtModal();
}
