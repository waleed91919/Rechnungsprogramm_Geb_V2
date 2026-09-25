/**
 * datev.js - DATEV EXTF 700 Export Engine für W-Link ERP (B2G, B2B § 13b, B2C § 35a, VOB/B)
 * Konform zu: DATEV-Schnittstellen-Entwicklungsleitfaden Format 700 (Version 13)
 * Behebt:
 * - DAT-1: Bruttobuchung auf Automatikkonten 8400/4400 & Abgrenzung Sicherheitseinbehalt auf 1540/1240
 * - DAT-2: Korrekte Differenzierung 19% (8400/4400), 7% (8300/4300), § 13b (8337/4337 mit BU), 0% (8100/4100)
 * - DAT-3: Vollständiger 31-Felder EXTF 700 Header (ohne Timestamp in Mandantennummer, mit Datum von/bis & Sachkontenlänge)
 */

class DATEVExporter {
    static sanitizeCsvField(val) {
        if (val === null || val === undefined) return '';
        let str = String(val).replace(/\r?\n|\r/g, ' ').trim();
        // CSV-Injection-Schutz (OWASP)
        if (/^[=\+\-@\t]/.test(str)) {
            str = "'" + str;
        }
        return str.replace(/"/g, '""');
    }

    static pad2(n) { return String(n).padStart(2, '0'); }
    static pad3(n) { return String(n).padStart(3, '0'); }

    /**
     * Erzeugt einen ISO/DATEV-Timestamp YYYYMMDDHHMMSSFFF (17 Stellen)
     */
    static formatDatevTimestamp(d = new Date()) {
        const yyyy = d.getFullYear();
        const mm = this.pad2(d.getMonth() + 1);
        const dd = this.pad2(d.getDate());
        const hh = this.pad2(d.getHours());
        const mi = this.pad2(d.getMinutes());
        const ss = this.pad2(d.getSeconds());
        const ms = this.pad3(d.getMilliseconds());
        return `${yyyy}${mm}${dd}${hh}${mi}${ss}${ms}`;
    }

    static formatDatevDate(dateStr) {
        if (!dateStr) return '';
        const clean = String(dateStr).trim();
        if (/^\d{8}$/.test(clean)) return clean;
        const d = new Date(clean);
        if (isNaN(d.getTime())) {
            const parts = clean.substring(0, 10).split('-');
            if (parts.length === 3) {
                return `${parts[0]}${parts[1]}${parts[2]}`;
            }
            return '';
        }
        return `${d.getFullYear()}${this.pad2(d.getMonth() + 1)}${this.pad2(d.getDate())}`;
    }

    static formatBelegdatum(dateStr) {
        if (!dateStr) return '0101';
        const parts = String(dateStr).substring(0, 10).split('-');
        if (parts.length === 3) {
            return parts[2] + parts[1]; // DDMM
        }
        return '0101';
    }

    /**
     * Erzeugt den 31-Felder DATEV EXTF 700 Header (Satzart 1)
     */
    static buildExtf700Header(options = {}, minDate, maxDate) {
        const isSKR04 = options.skr === 'SKR04';
        const now = new Date();
        const timestamp17 = this.formatDatevTimestamp(now);
        const beraterNr = parseInt(options.beraternummer, 10) || 1001;
        const mandantenNr = parseInt(options.mandantennummer, 10) || 10001;
        const currentYear = now.getFullYear();
        const wjBeginn = options.wirtschaftsjahrBeginn || `${currentYear}0101`;
        const sachkontenLaenge = parseInt(options.sachkontenlaenge, 10) || 4;

        const dVon = minDate || `${currentYear}0101`;
        const dBis = maxDate || `${currentYear}1231`;
        const skrCode = isSKR04 ? '04' : '03';

        // 31 Felder strikt nach DATEV-Schnittstellenentwicklungs-Leitfaden Format 700
        const headerFields = [
            '"EXTF"',                         // 1. Kennzeichen
            '700',                            // 2. Versionsnummer
            '21',                             // 3. Datenkategorie (Buchungsstapel)
            '"Buchungsstapel"',               // 4. Formatname
            '13',                             // 5. Formatversion (Spezifikation zu EXTF 700)
            timestamp17,                      // 6. Erzeugt am (YYYYMMDDHHMMSSFFF, 17-stellig)
            '""',                             // 7. Importiert
            '"RE"',                           // 8. Herkunft (Rechnungswesen / Fremdprogramm)
            '""',                             // 9. Exportiert von
            '""',                             // 10. Importiert von
            String(beraterNr),                // 11. Beraternummer
            String(mandantenNr),              // 12. Mandantennummer (kein Timestamp!)
            wjBeginn,                         // 13. Wirtschaftsjahresbeginn (YYYYMMDD)
            String(sachkontenLaenge),         // 14. Sachkontenlänge (4-8, Standard 4)
            dVon,                             // 15. Datum von (YYYYMMDD)
            dBis,                             // 16. Datum bis (YYYYMMDD)
            '"Rechnungsstapel W-Link ERP"',   // 17. Bezeichnung
            '""',                             // 18. Diktatkürzel
            '1',                              // 19. Buchungstyp (1=Finanzbuchführung)
            '0',                              // 20. Rechnungslegungszweck (0=General Standard)
            '0',                              // 21. Festschreibung (0=ungeprüft/änderbar)
            '"EUR"',                          // 22. Währungskennzeichen
            '""',                             // 23. Reserviert
            '""',                             // 24. Derivatskennzeichen
            '""',                             // 25. Reserviert
            '""',                             // 26. Reserviert
            `"${skrCode}"`,                   // 27. Sachkontenrahmen ("03" oder "04")
            '""',                             // 28. Branchenlösung
            '""',                             // 29. Reserviert
            '""',                             // 30. Reserviert
            '""'                              // 31. Anwendungsinformation
        ];

        return headerFields.join(';') + '\n';
    }

    /**
     * Erzeugt Satzart 2: Spaltenüberschriften der Buchungssätze
     */
    static buildExtf700ColHeader() {
        const cols = [
            'Umsatz (ohne Soll/Haben-Kz)',
            'Soll/Haben-Kennzeichen',
            'WKZ Umsatz',
            'Kurs',
            'Basis-Umsatz',
            'WKZ Basis-Umsatz',
            'Konto',
            'Gegenkonto (ohne BU-Schlüssel)',
            'BU-Schlüssel',
            'Belegdatum',
            'Belegfeld 1',
            'Belegfeld 2',
            'Skonto',
            'Buchungstext'
        ];
        return cols.map(c => `"${c}"`).join(';') + '\n';
    }

    /**
     * Generiert den kompletten EXTF 700 Inhalt
     * @param {Array} rechnungen - Liste der Rechnungsdokumente
     * @param {Array} kunden - Liste der Kundenstammdaten
     * @param {Object} options - { skr: 'SKR03' | 'SKR04', beraternummer, mandantennummer, sachkontenlaenge, wirtschaftsjahrBeginn }
     */
    static generateEXTFContent(rechnungen = [], kunden = [], options = { skr: 'SKR03' }) {
        const isSKR04 = options.skr === 'SKR04';

        // Kontenplan SKR03 / SKR04
        const KONTEN = {
            erloese19: isSKR04 ? '4400' : '8400',
            erloese7: isSKR04 ? '4300' : '8300',
            erloese13b: isSKR04 ? '4337' : '8337',
            erloese0: isSKR04 ? '4100' : '8100',
            sicherheit: isSKR04 ? '1240' : '1540',
            bu13b: isSKR04 ? '68' : '19'
        };

        const exportable = (rechnungen || []).filter(r => r.status !== 'Entwurf' && r.status !== 'DRAFT');
        if (exportable.length === 0) {
            return this.buildExtf700Header(options) + this.buildExtf700ColHeader();
        }

        // Ermittlung von DatumVon und DatumBis
        let minDate = '99999999';
        let maxDate = '00000000';
        for (const r of exportable) {
            const dt = this.formatDatevDate(r.datum);
            if (dt && dt.length === 8) {
                if (dt < minDate) minDate = dt;
                if (dt > maxDate) maxDate = dt;
            }
        }
        if (minDate === '99999999') minDate = `${new Date().getFullYear()}0101`;
        if (maxDate === '00000000') maxDate = `${new Date().getFullYear()}1231`;

        let csv = this.buildExtf700Header(options, minDate, maxDate);
        csv += this.buildExtf700ColHeader();

        for (const r of exportable) {
            const kunde = (kunden || []).find(k => k.id === parseInt(r.kundeId, 10)) || { name: 'Kunde' };
            const debitorKonto = 10000 + (parseInt(r.kundeId, 10) || 1);
            const belegdatum = this.formatBelegdatum(r.datum);
            const belegfeld1 = this.sanitizeCsvField(r.nr);
            const buchungstext = this.sanitizeCsvField(`Rechnung ${r.nr} - ${kunde.name}`);

            const isStorno = parseFloat(r.brutto !== undefined ? r.brutto : r.netto) < 0 ||
                String(r.nr || '').toUpperCase().startsWith('STORNO') ||
                r.status === 'Storniert' ||
                r.type === 'Gutschrift' ||
                r.rechnungsart === 'STORNO' ||
                r.rechnungsart === 'GUTSCHRIFT';

            // Prüfung auf § 13b UStG (K1-11): Eine Buchung auf 13b (Konto 8337/4337) darf NUR erfolgen,
            // wenn der Beleg selbst explizit unterliegt_13b = 1 markiert ist (keine Heuristik über Kundenstammdaten).
            const is13b = Boolean(r.unterliegt_13b);

            // Steuersatz-Ermittlung & Aufteilung (DAT-2)
            const steuer7 = parseFloat(r.steuer_7 || 0);
            const steuer19 = parseFloat(r.steuer_19 || 0);
            const netto7 = parseFloat(r.netto_7 || 0);
            const netto19 = parseFloat(r.netto_19 || 0);
            const ustSatz = parseFloat(r.ustSatz !== undefined ? r.ustSatz : (r.mwstSatz !== undefined ? r.mwstSatz : 19));

            // 1. HAUPTBUCHUNG(EN) BRUTTO (DAT-1: Volles Rechnungsbrutto, NICHT Zahlbetrag)
            if (is13b) {
                // § 13b Reverse Charge: Netto = Brutto, Steuer = 0
                const rawNetto = Math.abs(parseFloat(r.netto || r.zahlbetrag || 0));
                const betragStr = rawNetto.toFixed(2).replace('.', ',');
                const sh = isStorno ? 'S' : 'H';
                csv += `"${betragStr}";"${sh}";"EUR";"";"${betragStr}";"EUR";"${KONTEN.erloese13b}";"${debitorKonto}";"${KONTEN.bu13b}";"${belegdatum}";"${belegfeld1}";"";"";"${buchungstext}"\n`;
            } else if (steuer7 > 0 && steuer19 > 0) {
                // Gemischter Steuersatz: 2 getrennte Buchungszeilen
                const brutto7 = Math.abs(netto7 + steuer7);
                const brutto19 = Math.abs(netto19 + steuer19);
                const sh = isStorno ? 'S' : 'H';

                // Buchung 7%
                const b7Str = brutto7.toFixed(2).replace('.', ',');
                csv += `"${b7Str}";"${sh}";"EUR";"";"${b7Str}";"EUR";"${KONTEN.erloese7}";"${debitorKonto}";"";"${belegdatum}";"${belegfeld1}";"";"";"${buchungstext} (7% USt)"\n`;

                // Buchung 19%
                const b19Str = brutto19.toFixed(2).replace('.', ',');
                csv += `"${b19Str}";"${sh}";"EUR";"";"${b19Str}";"EUR";"${KONTEN.erloese19}";"${debitorKonto}";"";"${belegdatum}";"${belegfeld1}";"";"";"${buchungstext} (19% USt)"\n`;
            } else {
                // Reguläre Einzelbuchung (19%, 7% oder 0%)
                const is7Percent = ustSatz === 7 || (steuer7 > 0 && steuer19 === 0);
                const is0Percent = ustSatz === 0 && (parseFloat(r.steuer || 0) === 0);

                let erloeskonto = KONTEN.erloese19;
                if (is0Percent) erloeskonto = KONTEN.erloese0;
                else if (is7Percent) erloeskonto = KONTEN.erloese7;

                // DAT-1: ZWINGEND BRUTTO (Voller Erlös!), NICHT Zahlbetrag
                const rawBrutto = Math.abs(parseFloat(r.brutto !== undefined && r.brutto !== null ? r.brutto : r.netto) || 0);
                const umsatzStr = rawBrutto.toFixed(2).replace('.', ',');
                const sh = isStorno ? 'S' : 'H';

                csv += `"${umsatzStr}";"${sh}";"EUR";"";"${umsatzStr}";"EUR";"${erloeskonto}";"${debitorKonto}";"";"${belegdatum}";"${belegfeld1}";"";"";"${buchungstext}"\n`;
            }

            // 2. ABGRENZUNGSBUCHUNG SICHERHEITSEINBEHALT (DAT-1)
            // Wenn Einbehalt > 0: Soll 1540 / 1240 an Haben Debitor (bzw. umgekehrt bei Storno)
            const sicherheit = parseFloat(r.sicherheitseinbehalt || r.sicherheitseinbehaltNetto || 0);
            if (sicherheit > 0) {
                const sichStr = sicherheit.toFixed(2).replace('.', ',');
                const sichSh = isStorno ? 'H' : 'S'; // Bei Normalbeleg Soll 1540 an Haben Debitor
                const sichText = this.sanitizeCsvField(`Sicherheitseinbehalt VOB/B ${r.nr}`);
                csv += `"${sichStr}";"${sichSh}";"EUR";"";"${sichStr}";"EUR";"${KONTEN.sicherheit}";"${debitorKonto}";"";"${belegdatum}";"${belegfeld1}";"";"";"${sichText}"\n`;
            }
        }

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
