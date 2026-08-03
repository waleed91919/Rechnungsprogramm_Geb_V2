// DATEV Export Logic
function sanitizeCsvField(val) {
    if (val === null || val === undefined) return '';
    let str = String(val);
    if (/^[=\+\-@\t\r]/.test(str)) {
        str = "'" + str;
    }
    return str.replace(/"/g, '""');
}

function exportDATEV() {
    // Generates a basic DATEV EXTF format
    let csv = '"Umsatz (ohne Soll/Haben-Kz)";"Soll/Haben-Kennzeichen";"Konto";"Gegenkonto (ohne BU-Schlüssel)";"Belegdatum";"Belegfeld 1";"Buchungstext"\n';

    state.rechnungen.forEach(r => {
        // Only export finalized invoices (not drafts)
        if (r.status === 'Entwurf') return;

        const kunde = state.kunden.find(k => k.id === parseInt(r.kundeId)) || { name: 'Unbekannt' };

        const umsatz = r.brutto.toFixed(2).replace('.', ',');
        const sh = 'H'; // Haben for revenue
        const konto = '8400'; // Erlöskonto 19% USt. (SKR03 Standard)
        const gegenkonto = 10000 + parseInt(r.kundeId); // Debitorenkonto mapping

        const d = new Date(r.datum);
        const belegdatum = String(d.getDate()).padStart(2, '0') + String(d.getMonth() + 1).padStart(2, '0');

        const beleg1 = r.nr;
        const buchungstext = `Rechnung ${kunde.name}`;

        const sUmsatz = sanitizeCsvField(umsatz);
        const sSh = sanitizeCsvField(sh);
        const sKonto = sanitizeCsvField(konto);
        const sGegenkonto = sanitizeCsvField(gegenkonto);
        const sBelegdatum = sanitizeCsvField(belegdatum);
        const sBeleg1 = sanitizeCsvField(beleg1);
        const sBuchungstext = sanitizeCsvField(buchungstext);

        csv += `"${sUmsatz}";"${sSh}";"${sKonto}";"${sGegenkonto}";"${sBelegdatum}";"${sBeleg1}";"${sBuchungstext}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=ISO-8859-1;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "DATEV_Export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
