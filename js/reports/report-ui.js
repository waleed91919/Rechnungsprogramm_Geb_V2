// Modul: report-ui.js
// extracted from js/berichte.js

(function() {
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

    // Exports
    window.renderReportMetrics = renderReportMetrics;
    window.renderTopSellers = renderTopSellers;
    window.renderTopCustomers = renderTopCustomers;
    window.renderBerichte = renderBerichte;
    window.renderTrendChart = renderTrendChart;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports.renderReportMetrics = renderReportMetrics;
        module.exports.renderTopSellers = renderTopSellers;
        module.exports.renderTopCustomers = renderTopCustomers;
        module.exports.renderBerichte = renderBerichte;
        module.exports.renderTrendChart = renderTrendChart;
    }
})();
