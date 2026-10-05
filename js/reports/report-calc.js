// Modul: report-calc.js
// extracted from js/berichte.js

(function() {
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

    function calculateSteuerberichtData(bezahlteRechnungen) {
        // Cent-Rundung identisch zu InvoiceController.round2 / EInvoiceEngine.round2,
        // damit Steuerbericht, Rechenkern und E-Rechnung zu gleichen Summen kommen.
        const round2 = (v) => Math.round((parseFloat(v) + Number.EPSILON) * 100) / 100;
        let totalNetto = 0;
        let tax19 = 0;
        let tax7 = 0;
        let totalBrutto = 0;
        let tableRows = "";
    
        const kundenMap = new Map(state.kunden.map(k => [k.id, k]));
    
        bezahlteRechnungen.forEach(r => {
            totalNetto = round2(totalNetto + r.netto);
            totalBrutto = round2(totalBrutto + r.brutto);
    
            if (r.positionen) {
                let positionenNettoRaw = 0;
                const taxBases = { 19: 0, 7: 0 };
    
                r.positionen.forEach(p => {
                    const rabatt = parseFloat(p.rabatt) || 0;
                    const rowNetto = round2((p.menge * p.preis) * (1 - rabatt / 100));
                    positionenNettoRaw = round2(positionenNettoRaw + rowNetto);
                    const mwst = parseFloat(p.mwst);
                    if (mwst > 0) {
                        taxBases[mwst] = round2((taxBases[mwst] || 0) + rowNetto);
                    }
                });
    
                const globalAbzug = round2(parseFloat(r.globalRabattAbzug) || 0);
                const nettoNachRabatt = round2(Math.max(0, positionenNettoRaw - globalAbzug));
                const rabattFaktor = positionenNettoRaw > 0 ? (nettoNachRabatt / positionenNettoRaw) : 1;
    
                if (taxBases[19]) tax19 = round2(tax19 + round2(round2(taxBases[19] * rabattFaktor) * 19 / 100));
                if (taxBases[7]) tax7 = round2(tax7 + round2(round2(taxBases[7] * rabattFaktor) * 7 / 100));
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

    // Exports
    window.getBezahlteUndStornierteRechnungen = getBezahlteUndStornierteRechnungen;
    window.calculateReportMetrics = calculateReportMetrics;
    window.calculateSteuerberichtData = calculateSteuerberichtData;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports.getBezahlteUndStornierteRechnungen = getBezahlteUndStornierteRechnungen;
        module.exports.calculateReportMetrics = calculateReportMetrics;
        module.exports.calculateSteuerberichtData = calculateSteuerberichtData;
    }
})();
