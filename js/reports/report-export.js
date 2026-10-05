// Modul: report-export.js
// extracted from js/berichte.js

(function() {
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

    // Exports
    window.openSteuerberichtModal = openSteuerberichtModal;
    window.closeSteuerberichtModal = closeSteuerberichtModal;
    window.generateSteuerberichtHtml = generateSteuerberichtHtml;
    window.printTaxReport = printTaxReport;
    window.executeReportPrint = executeReportPrint;
    window.exportSteuerberichtPDF = exportSteuerberichtPDF;
    window.exportSteuerberichtCSV = exportSteuerberichtCSV;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports.openSteuerberichtModal = openSteuerberichtModal;
        module.exports.closeSteuerberichtModal = closeSteuerberichtModal;
        module.exports.generateSteuerberichtHtml = generateSteuerberichtHtml;
        module.exports.printTaxReport = printTaxReport;
        module.exports.executeReportPrint = executeReportPrint;
        module.exports.exportSteuerberichtPDF = exportSteuerberichtPDF;
        module.exports.exportSteuerberichtCSV = exportSteuerberichtCSV;
    }
})();
