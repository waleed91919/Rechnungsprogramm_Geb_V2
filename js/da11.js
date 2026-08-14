/**
 * da11.js - REB 23.003 & DA11 Export & Import Engine
 * Konforme Formatierung nach REB-VB 23.003 (80 Zeichen Fixed-Width Format).
 */

class DA11Service {
    /**
     * Formatiert einen String auf exakte Länge (Fixed-Width, Padding links/rechts).
     */
    static pad(str, length, padChar = ' ', align = 'left') {
        const s = String(str !== undefined && str !== null ? str : '');
        if (s.length >= length) {
            return s.substring(0, length);
        }
        const padding = padChar.repeat(length - s.length);
        return align === 'right' ? padding + s : s + padding;
    }

    /**
     * Formatiert eine Ordnungszahl (OZ) z.B. "01.02.0030" in das 9-stellige DA11-Format "01020030 ".
     */
    static formatOZ(oz) {
        if (!oz) return '01010010 ';
        const cleaned = oz.replace(/[^0-9A-Za-z]/g, '');
        return this.pad(cleaned, 9, ' ', 'left');
    }

    /**
     * Formatiert einen Zahlenwert in das 10-stellige DA11 Ergebnis-Format mit 3 Dezimalstellen (z.B. "     2.970").
     */
    static formatResult(val) {
        const num = parseFloat(val) || 0;
        const formatted = num.toFixed(3);
        return this.pad(formatted, 10, ' ', 'right');
    }

    /**
     * Generiert eine vollständige DA11-Datei aus Aufmaßblättern.
     * @param {Object} projektInfo - { name: string, projektNr?: string }
     * @param {Array} blaetter - Liste von Aufmaßblättern mit zeilen
     * @returns {string} Der DA11 Dateiinhalt mit 80 Zeichen je Zeile
     */
    static generateDA11(projektInfo, blaetter = []) {
        const lines = [];

        // 1. Satzart 11: Header / Projektkopf (80 Zeichen)
        // Spalte 01-02: '11'
        // Spalte 03-11: '000000000' (Projektkennung)
        // Spalte 12-70: Projektname / Bezeichnung
        // Spalte 71-80: Datum (JJMMTT) + Versions-Tag
        const today = new Date();
        const dateStr = today.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
        
        let header = '11' + '000000000' + this.pad(projektInfo.name || 'W-LINK ERP PROJEKT', 59) + this.pad(dateStr + 'DA11', 10, ' ', 'right');
        lines.push(header.substring(0, 80));

        // 2. Iteration über alle Aufmaßblätter und deren Zeilen
        for (const blatt of blaetter) {
            const blattNr = this.pad(blatt.blatt_nummer || '001', 3, '0', 'right');
            const zeilen = blatt.zeilen || [];

            let lineIdx = 1;
            for (const z of zeilen) {
                const satzart = '12'; // Satzart 12: Rechenzeile nach REB 23.003
                const oz = this.formatOZ(z.oz_code);
                const index = '  '; // Spalte 12-13: Index / Kennung
                const blattStr = this.pad(blattNr, 3, '0', 'right'); // Spalte 14-16
                const zeilenNr = this.pad(z.zeilen_nr || lineIdx++, 2, '0', 'right'); // Spalte 17-18
                const formelReb = this.pad(z.formel_reb || '91', 2, '0', 'right'); // Spalte 19-20
                
                // Spalte 21-70: Rechenansatz / Formel (max 50 Zeichen)
                let rechenansatz = (z.rechenansatz || '').trim();
                // Wenn Erläuterung/Bezeichnung vorhanden, voranstellen
                if (z.bezeichnung && rechenansatz) {
                    // REB 23.003 erlaubt Text-Erläuterung mit Anführungszeichen
                    const ansatzWithDesc = `"${z.bezeichnung}" ${rechenansatz}`;
                    if (ansatzWithDesc.length <= 50) {
                        rechenansatz = ansatzWithDesc;
                    }
                }
                const rechenansatzFormatted = this.pad(rechenansatz, 50, ' ', 'left');

                // Spalte 71-80: Ergebnis
                const resultFormatted = this.formatResult((z.ergebnis || 0) * (z.vorzeichen !== undefined ? z.vorzeichen : 1));

                const da11Line = satzart + oz + index + blattStr + zeilenNr + formelReb + rechenansatzFormatted + resultFormatted;
                lines.push(da11Line.substring(0, 80));
            }
        }

        // Zeilenabschluss mit CRLF
        return lines.join('\r\n') + '\r\n';
    }

    /**
     * Parst eine DA11-Datei und wandelt sie in strukturierte Aufmaßblätter & Zeilen um.
     */
    static parseDA11(da11Content) {
        if (!da11Content || typeof da11Content !== 'string') {
            return { success: false, message: 'Leerer Dateiinhalt' };
        }

        const rawLines = da11Content.split(/\r?\n/).filter(l => l.trim().length > 0);
        const blaetterMap = new Map();
        let projektName = '';

        for (const line of rawLines) {
            if (line.length < 15) continue;
            const satzart = line.substring(0, 2);

            if (satzart === '11') {
                projektName = line.substring(11, 70).trim();
            } else if (satzart === '12' || satzart === '21' || satzart === '23') {
                const ozRaw = line.substring(2, 11).trim();
                const blattNr = line.substring(13, 16).trim() || '001';
                const zeilenNr = parseInt(line.substring(16, 18).trim(), 10) || 1;
                const formelReb = line.substring(18, 20).trim() || '91';
                const rechenansatz = line.substring(20, 70).trim();
                const ergebnis = parseFloat(line.substring(70, 80).trim()) || 0;

                if (!blaetterMap.has(blattNr)) {
                    blaetterMap.set(blattNr, {
                        blatt_nummer: blattNr,
                        titel: `Aufmaßblatt ${blattNr}`,
                        status: 'DRAFT',
                        zeilen: []
                    });
                }

                blaetterMap.get(blattNr).zeilen.push({
                    oz_code: ozRaw,
                    zeilen_nr: zeilenNr,
                    formel_reb: formelReb,
                    rechenansatz: rechenansatz,
                    ergebnis: Math.abs(ergebnis),
                    vorzeichen: ergebnis < 0 ? -1 : 1,
                    einheit: 'm²'
                });
            }
        }

        return {
            success: true,
            projektName,
            blaetter: Array.from(blaetterMap.values())
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DA11Service;
}
if (typeof window !== 'undefined') {
    window.DA11Service = DA11Service;
}
