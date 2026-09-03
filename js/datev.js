/**
 * datev.js - DATEV EXTF 700 Export Engine für Bau-ERP (B2G, B2B § 13b, B2C § 35a, VOB/B)
 */
class DATEVExporter {
    static sanitizeCsvField(val) {
        if (val === null || val === undefined) return '';
        let str = String(val);
        if (/^[=\+\-@\t\r]/.test(str)) {
            str = "'" + str;
        }
        return str.replace(/"/g, '""');
    }

    /**
     * Erzeugt den offiziellen DATEV EXTF Header 700 + Buchungsstapel.
     * @param {Array} rechnungen - Liste der Rechnungsdokumente
     * @param {Array} kunden - Liste der Kunden
     * @param {Object} options - { skr: 'SKR03' | 'SKR04' }
     */
    static generateEXTFContent(rechnungen = [], kunden = [], options = { skr: 'SKR03' }) {
        const isSKR04 = options.skr === 'SKR04';

        // Erlöskonten
        const konto19 = isSKR04 ? '4400' : '8400';
        const konto7 = isSKR04 ? '4300' : '8300';
        const konto13b = isSKR04 ? '4337' : '8337'; // § 13b Erlöse
        const kontoSicherheit = isSKR04 ? '1240' : '1540'; // Konto für Sicherheitseinbehalte

        // EXTF Header Format 700
        const now = new Date();
        const timestamp = now.toISOString().replace(/[-:T.]/g, '').slice(0, 14);

        let csv = `"EXTF";700;21;"Buchungsstapel";9;;;"W-LINK ERP";"";"";1;${timestamp};;;;"EUR";;;;;\n`;
        csv += '"Umsatz (ohne Soll/Haben-Kz)";"Soll/Haben-Kennzeichen";"Konto";"Gegenkonto (ohne BU-Schlüssel)";"BU-Schlüssel";"Belegdatum";"Belegfeld 1";"Buchungstext"\n';

        rechnungen.forEach(r => {
            if (r.status === 'Entwurf' || r.status === 'DRAFT') return;

            const kunde = (kunden || []).find(k => k.id === parseInt(r.kundeId)) || { name: 'Kunde' };
            const debitorKonto = 10000 + (parseInt(r.kundeId) || 1);

            const is13b = Boolean(r.unterliegt_13b || (kunde.customer_type === 'B2B' && kunde.ist_bauleistender_13b));
            const buSchluessel = is13b ? (isSKR04 ? '68' : '19') : '';
            const erloeskonto = is13b ? konto13b : konto19;

            const rawBetrag = parseFloat(r.zahlbetrag !== undefined && r.zahlbetrag !== null ? r.zahlbetrag : (r.brutto !== undefined && r.brutto !== null ? r.brutto : r.netto)) || 0;
            const isStorno = rawBetrag < 0 ||
                String(r.nr || '').toUpperCase().startsWith('STORNO') ||
                r.status === 'Storniert' ||
                r.type === 'Gutschrift' ||
                r.rechnungsart === 'STORNO' ||
                r.rechnungsart === 'GUTSCHRIFT';
            const umsatzStr = Math.abs(rawBetrag).toFixed(2).replace('.', ',');
            const sh = isStorno ? 'S' : 'H'; // Storno/Gutschrift wechselt von Haben auf Soll

            let belegdatum = '0101';
            if (r.datum) {
                const parts = r.datum.split('-');
                if (parts.length === 3) {
                    belegdatum = parts[2] + parts[1]; // DDMM
                }
            }

            const belegfeld1 = this.sanitizeCsvField(r.nr);
            const text = this.sanitizeCsvField(`Rechnung ${r.nr} - ${kunde.name}`);

            csv += `"${umsatzStr}";"${sh}";"${erloeskonto}";"${debitorKonto}";"${buSchluessel}";"${belegdatum}";"${belegfeld1}";"${text}"\n`;

            // Sicherheitseinbehalt Abgrenzungsbuchung falls vorhanden
            const sicherheit = parseFloat(r.sicherheitseinbehalt) || 0;
            if (sicherheit > 0) {
                const sichStr = sicherheit.toFixed(2).replace('.', ',');
                csv += `"${sichStr}";"S";"${kontoSicherheit}";"${debitorKonto}";"";"${belegdatum}";"${belegfeld1}";"Sicherheitseinbehalt VOB/B ${r.nr}"\n`;
            }
        });

        return csv;
    }
}

function exportDATEV() {
    const rechnungen = (typeof state !== 'undefined' && state.rechnungen) ? state.rechnungen : [];
    const kunden = (typeof state !== 'undefined' && state.kunden) ? state.kunden : [];

    const csv = DATEVExporter.generateEXTFContent(rechnungen, kunden);

    const blob = new Blob([csv], { type: 'text/csv;charset=ISO-8859-1;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "DATEV_Export_EXTF.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DATEVExporter, exportDATEV };
}
