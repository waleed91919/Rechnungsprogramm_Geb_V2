/**
 * js/da11.js - REB-VB 23.003 & DA11 Export & Import Engine
 *
 * Konforme Implementierung nach den offiziellen Richtlinien der REB 23.003 (Ausgabe 2009 / 1979).
 * Gewährleistet strikte 80-Zeichen-Festbreiten-Formatierung und CRLF-Terminierung.
 *
 * Satzarten:
 * - 00: Vorlaufsatz (Projektidentifikation, DP-Kennzeichen 11, REB 23.003, OZ-Maske)
 * - 11: Aufmaßzeile (Berechnungszeile mit Blattadresse BBBBZI, Formel, Ansatz, Ergebnis)
 * - 99: Nachlaufsatz (Dateiende)
 */

class DA11Service {
    /**
     * Transliteriert deutsche Umlaute und Sonderzeichen für REB-ASCII-Kompatibilität,
     * damit Zeichenlänge und Byte-Länge (80 Bytes) identisch bleiben.
     */
    static cleanAscii(str) {
        if (!str) return '';
        return String(str)
            .replace(/ä/g, 'ae').replace(/Ä/g, 'Ae')
            .replace(/ö/g, 'oe').replace(/Ö/g, 'Oe')
            .replace(/ü/g, 'ue').replace(/Ü/g, 'Ue')
            .replace(/ß/g, 'ss')
            .replace(/[\r\n]/g, ' ');
    }

    /**
     * Formatiert einen String auf exakte Länge (Fixed-Width, Padding links/rechts).
     * Schneidet bei Überschreitung strikt ab.
     */
    static pad(str, length, padChar = ' ', align = 'left') {
        const s = this.cleanAscii(str !== undefined && str !== null ? str : '');
        if (s.length >= length) {
            return s.substring(0, length);
        }
        const padding = padChar.repeat(length - s.length);
        return align === 'right' ? padding + s : s + padding;
    }

    /**
     * Formatiert eine Ordnungszahl (OZ) in das standardisierte 9-stellige DA11-Format.
     * Entfernt alle Trennpunkte und Sonderzeichen, füllt auf 9 Zeichen linksbündig auf.
     * Beispiel: "01.02.0030" -> "01020030 "
     */
    static formatOZ(oz) {
        if (!oz) return '01010010 ';
        const cleaned = String(oz).replace(/[^0-9A-Za-z]/g, '');
        return this.pad(cleaned, 9, ' ', 'left');
    }

    /**
     * Formatiert die 6-stellige REB-Blattadresse: BBBBZI
     * - BBBB: 4-stellige Blattnummer (z. B. '0001')
     * - Z:    Zeilenbuchstabe 'A'-'Z' (1 Stelle)
     * - I:    Zeilenindex '0'-'9' (1 Stelle)
     */
    static formatAddress(blattNummer, zeilenIndex) {
        const cleanBlatt = String(blattNummer || '1').replace(/[^0-9A-Za-z]/g, '');
        const blattPart = this.pad(cleanBlatt, 4, '0', 'right');

        const idx = Math.max(1, parseInt(zeilenIndex, 10) || 1) - 1;
        const letterCode = 65 + (idx % 26); // A = 65
        const indexSub = Math.min(9, Math.floor(idx / 26));

        const zeileLetter = String.fromCharCode(letterCode);
        const indexChar = String(indexSub);

        return `${blattPart}${zeileLetter}${indexChar}`;
    }

    /**
     * Formatiert das Rechenergebnis in ein 11-stelliges DA11-Ergebnisfeld (Spalte 70-80).
     * Exakt 3 Dezimalstellen, rechtsbündig, führende Vorzeichen-Unterstützung.
     * Beispiel: 12.345 -> "     12.345", -8.5 -> "     -8.500"
     */
    static formatResult(val) {
        const num = parseFloat(val) || 0;
        const formatted = num.toFixed(3);
        return this.pad(formatted, 11, ' ', 'right');
    }

    /**
     * Generiert eine vollständige, REB 23.003-konforme DA11-Datei aus Aufmaßblättern.
     * @param {Object} projektInfo - { name: string, projektNr?: string, ozMaske?: string }
     * @param {Array} blaetter - Liste von Aufmaßblättern mit zeilen
     * @returns {string} Der DA11-Dateiinhalt (80 Zeichen je Zeile mit CRLF)
     */
    static generateDA11(projektInfo = {}, blaetter = []) {
        const lines = [];

        // 1. Satzart 00: Vorlaufsatz nach REB 23.003 (Exakt 80 Zeichen)
        // Spalte 01-02: '00'
        // Spalte 03-04: '11' (DP-Kennzeichen für Mengenberechnung DA11)
        // Spalte 05-09: '23003' (REB-Verfahrensbeschreibung)
        // Spalte 10-18: '1122PPPPI' (Standard OZ-Maske: 2 Stellen HG, 2 Stellen OG, 4 Stellen Pos, 1 Stelle Index)
        // Spalte 19-20: '  ' (Reserve)
        // Spalte 21-80: Baumaßnahme / Projektbezeichnung (60 Zeichen)
        const ozMaske = this.pad(projektInfo.ozMaske || '1122PPPPI', 9, ' ', 'left');
        const projName = this.pad(projektInfo.name || 'W-LINK ERP PROJEKT', 60, ' ', 'left');
        const header00 = `001123003${ozMaske}  ${projName}`;
        lines.push(header00.substring(0, 80));

        // 2. Satzart 11: Aufmaßzeilen
        for (const blatt of blaetter) {
            const blattNr = blatt.blatt_nummer || '0001';
            const zeilen = blatt.zeilen || [];

            let lineCounter = 1;
            for (const z of zeilen) {
                // Spalte 01-02: '11' (Aufmaßzeile)
                const satzart = '11';

                // Spalte 03-11: Ordnungszahl (9 Zeichen)
                const oz = this.formatOZ(z.oz_code);

                // Spalte 12-17: Blattadresse BBBBZI (6 Zeichen)
                const adresse = this.formatAddress(blattNr, z.zeilen_nr || lineCounter++);

                // Spalte 18-19: Formelnummer (2 Zeichen, Standard 91 für freie Formel)
                const formelReb = this.pad(z.formel_reb || '91', 2, '0', 'right');

                // Spalte 20-69: Rechenansatz / Text (50 Zeichen)
                let rechenansatz = String(z.rechenansatz || '').trim();

                // Falls Erläuterung vorhanden und nicht bereits in Anführungszeichen:
                if (z.bezeichnung && !rechenansatz.startsWith('"')) {
                    const descSafe = this.cleanAscii(z.bezeichnung).replace(/"/g, "'").trim();
                    const combined = `"${descSafe}" ${rechenansatz}`.trim();
                    if (combined.length <= 49) {
                        rechenansatz = combined;
                    }
                }

                // REB-Regel: Ein Rechenansatz sollte mit '=' abschließen, sofern noch Platz ist
                if (rechenansatz.length > 0 && !rechenansatz.endsWith('=') && rechenansatz.length < 50) {
                    rechenansatz += '=';
                }
                const ansatzFormatted = this.pad(rechenansatz, 50, ' ', 'left');

                // Spalte 70-80: Ergebniswert (11 Zeichen)
                const vorzeichen = z.vorzeichen !== undefined ? parseInt(z.vorzeichen, 10) : 1;
                const effectiveResult = (parseFloat(z.ergebnis) || 0) * vorzeichen;
                const resultFormatted = this.formatResult(effectiveResult);

                // Gesamtzeile zusammensetzen (2 + 9 + 6 + 2 + 50 + 11 = 80 Zeichen)
                const da11Line = `${satzart}${oz}${adresse}${formelReb}${ansatzFormatted}${resultFormatted}`;
                lines.push(da11Line.substring(0, 80));
            }
        }

        // 3. Satzart 99: Nachlaufsatz (Ende des Berechnungsabschnitts)
        // Spalte 01-02: '99'
        // Spalte 03-80: 78 Leerzeichen
        const footer99 = '99' + ' '.repeat(78);
        lines.push(footer99);

        // Windows-Standard CRLF nach jeder Zeile
        return lines.join('\r\n') + '\r\n';
    }

    /**
     * Parst eine DA11-Datei und wandelt sie in strukturierte Aufmaßblätter & Zeilen um.
     * Unterstützt Satzart 00 (Vorlaufsatz), Satzart 11 (Mengenansätze), Satzart 99
     * sowie abwärtskompatibel Satzart 12 (historische Fehlbelegung).
     * @param {string} da11Content
     * @returns {Object} { success: boolean, projektName, ozMaske, blaetter: Array }
     */
    static parseDA11(da11Content) {
        if (!da11Content || typeof da11Content !== 'string') {
            return { success: false, message: 'Leerer oder ungültiger Dateiinhalt.' };
        }

        const rawLines = da11Content.split(/\r?\n/).filter(l => l.trim().length > 0);
        const blaetterMap = new Map();
        let projektName = '';
        let ozMaske = '1122PPPPI';
        let parsedZeilenCount = 0;

        for (let i = 0; i < rawLines.length; i++) {
            const line = rawLines[i];
            if (line.length < 11) continue;

            const satzart = line.substring(0, 2);

            // 1. Vorlaufsatz: Satzart 00
            if (satzart === '00') {
                if (line.length >= 18) {
                    ozMaske = line.substring(9, 18).trim() || ozMaske;
                }
                if (line.length >= 21) {
                    projektName = line.substring(20, 80).trim();
                }
                continue;
            }

            // 2. Ende des Berechnungsabschnitts: Satzart 99
            if (satzart === '99') {
                break;
            }

            // 3. Aufmaßzeilen: Satzart 11 (Standard) sowie Fallback 12 (Legacy)
            if (satzart === '11' || satzart === '12') {
                // Spalte 03-11: Ordnungszahl (9 Zeichen)
                const ozRaw = line.substring(2, 11).trim();

                // Spalte 12-17: Adresse (BBBBZI)
                let blattNr = '0001';
                let zeilenNr = parsedZeilenCount + 1;

                if (line.length >= 17) {
                    const addrPart = line.substring(11, 17);
                    const bPart = addrPart.substring(0, 4).trim();
                    if (bPart) blattNr = bPart;

                    const letterPart = addrPart.substring(4, 5).toUpperCase();
                    const indexPart = parseInt(addrPart.substring(5, 6), 10) || 0;
                    if (letterPart >= 'A' && letterPart <= 'Z') {
                        zeilenNr = ((letterPart.charCodeAt(0) - 65) + 1) + (indexPart * 26);
                    }
                }

                // Spalte 18-19: Formel-Nr.
                const formelReb = line.length >= 19 ? line.substring(17, 19).trim() || '91' : '91';

                // Spalte 20-69: Rechenansatz & Erläuterung (50 Zeichen)
                let rechenansatzRaw = line.length >= 69 ? line.substring(19, 69).trim() : line.substring(19).trim();

                // Spalte 70-80: Ergebniswert (11 Zeichen)
                let ergebnisRaw = line.length >= 80 ? line.substring(69, 80).trim() : '';
                let ergebnisNum = parseFloat(ergebnisRaw);

                // Erläuterung aus Text in Anführungszeichen separieren
                let bezeichnung = '';
                const commentMatch = rechenansatzRaw.match(/^"([^"]*)"\s*(.*)$/);
                if (commentMatch) {
                    bezeichnung = commentMatch[1].trim();
                    rechenansatzRaw = commentMatch[2].trim();
                }

                // Falls '=' am Ende steht, für mathematische Lesbarkeit bereinigen
                if (rechenansatzRaw.endsWith('=')) {
                    rechenansatzRaw = rechenansatzRaw.slice(0, -1).trim();
                }

                // Vorzeichen und Absolutbetrag bestimmen
                const vorzeichen = (!isNaN(ergebnisNum) && ergebnisNum < 0) ? -1 : 1;
                const ergebnisAbs = !isNaN(ergebnisNum) ? Math.abs(ergebnisNum) : 0;

                // Blatt in Map verwalten
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
                    bezeichnung: bezeichnung,
                    rechenansatz: rechenansatzRaw,
                    ergebnis: ergebnisAbs,
                    vorzeichen: vorzeichen,
                    einheit: 'm²'
                });

                parsedZeilenCount++;
            }
        }

        return {
            success: parsedZeilenCount > 0,
            projektName: projektName || 'DA11 Import',
            ozMaske,
            lineCount: parsedZeilenCount,
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
