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
     * WICHTIG: Muss IMMER vor dem Abschneiden / Auffüllen (Padding) auf feste
     * Feldbreiten ausgeführt werden, da die Transliteration (z. B. 'ä' -> 'ae')
     * die Zeichenanzahl erhöht und sonst Spaltenversatz erzeugen würde.
     */
    static cleanAscii(str) {
        if (!str) return '';
        return String(str)
            .replace(/ä/g, 'ae').replace(/Ä/g, 'Ae')
            .replace(/ö/g, 'oe').replace(/Ö/g, 'Oe')
            .replace(/ü/g, 'ue').replace(/Ü/g, 'Ue')
            .replace(/ß/g, 'ss')
            .replace(/²/g, '2').replace(/³/g, '3')
            .replace(/°/g, 'Grad')
            .replace(/€/g, 'EUR')
            .replace(/[\r\n\t]/g, ' ')
            .replace(/[^\x20-\x7E]/g, ' ');
    }

    /**
     * Formatiert einen String auf exakte Länge (Fixed-Width, Padding links/rechts).
     * Transliteriert zuerst alle Umlaute und Sonderzeichen zu ASCII, prüft erst danach
     * die Länge und schneidet bei Überschreitung strikt ab.
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
     * Formatiert eine Ordnungszahl (OZ) in das standardisierte 9-stellige DA11-Format (Spalte 3-11).
     * Entfernt alle Trennpunkte und Sonderzeichen, füllt auf 9 Zeichen linksbündig auf.
     * Beispiel: "01.02.0030" -> "01020030 "
     */
    static formatOZ(oz) {
        if (!oz) return '01010010 ';
        const cleaned = this.cleanAscii(oz).replace(/[^0-9A-Za-z]/g, '');
        return this.pad(cleaned, 9, ' ', 'left');
    }

    /**
     * Formatiert die 6-stellige REB-Blattadresse: BBBBZI
     * - BBBB: 4-stellige Blattnummer (z. B. '0001')
     * - Z:    Zeilenbuchstabe 'A'-'Z' (1 Stelle)
     * - I:    Zeilenindex '0'-'9' (1 Stelle)
     */
    static formatAddress(blattNummer, zeilenIndex) {
        const cleanBlatt = this.cleanAscii(blattNummer || '1').replace(/[^0-9A-Za-z]/g, '');
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
     * Hält den offiziellen Stellenplan nach REB-VB 23.003 (Satzart 11) strikt ein:
     * - Spalte 01-02: Satzart "11" (2)
     * - Spalte 03-11: Ordnungszahl OZ (9)
     * - Spalte 12-13: Index (2)
     * - Spalte 14-19: Blattnummer (6)
     * - Spalte 20-21: Zeilennummer (2)
     * - Spalte 22:    Kennzeichen (1)
     * - Spalte 23-80: Erläuterung / Rechenansatz / Formelnummer / Ergebnis (58):
     *                 Spalte 23-24: Formelnummer (2)
     *                 Spalte 25-69: Rechenansatz / Erläuterung (45)
     *                 Spalte 70-80: Ergebniswert (11)
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

        // 2. Satzart 11: Aufmaßzeilen nach REB-VB 23.003 Stellenplan
        for (const blatt of blaetter) {
            const blattNr = blatt.blatt_nummer || '000001';
            const zeilen = blatt.zeilen || [];

            let lineCounter = 1;
            for (const z of zeilen) {
                // Spalte 01-02: Satzart '11' (2 Zeichen)
                const satzart = '11';

                // Spalte 03-11: Ordnungszahl OZ (9 Zeichen)
                const oz = this.formatOZ(z.oz_code);

                // Spalte 12-13: Index (2 Zeichen)
                const index = this.pad(z.index || z.oz_index || '', 2, ' ', 'left');

                // Spalte 14-19: Blattnummer (6 Zeichen)
                const cleanBlatt = this.cleanAscii(blattNr).replace(/[^0-9A-Za-z]/g, '');
                const blattFormatted = this.pad(cleanBlatt, 6, /^\d+$/.test(cleanBlatt) ? '0' : ' ', 'right');

                // Spalte 20-21: Zeilennummer (2 Zeichen)
                const zNr = z.zeilen_nr !== undefined && z.zeilen_nr !== null ? z.zeilen_nr : lineCounter;
                const zeileFormatted = this.pad(String(zNr), 2, '0', 'right');

                // Spalte 22: Kennzeichen (1 Zeichen)
                const kennzeichen = this.pad(z.kennzeichen || '', 1, ' ', 'left');

                // Spalte 23-24: Formelnummer (2 Zeichen, z. B. 01, 04, 91)
                const formelReb = this.pad(z.formel_reb || '91', 2, '0', 'right');

                // Spalte 25-69: Rechenansatz & Erläuterung (45 Zeichen)
                // Wichtig: Transliteration VOR dem Zusammensetzen / Padding!
                const descClean = this.cleanAscii(z.bezeichnung || '').replace(/"/g, "'").trim();
                let ansatzClean = this.cleanAscii(z.rechenansatz || z.formel || '').trim();

                let combined = ansatzClean;
                if (descClean && !ansatzClean.startsWith('"')) {
                    if (ansatzClean) {
                        combined = `"${descClean}" ${ansatzClean}`.trim();
                    } else {
                        combined = `"${descClean}"`;
                    }
                }

                // REB-Regel: Rechenansatz sollte mit '=' abschließen, sofern noch Platz ist (max 45 Zeichen)
                if (combined.length > 0 && !combined.endsWith('=') && combined.length < 45) {
                    combined += '=';
                }
                const ansatzFormatted = this.pad(combined, 45, ' ', 'left');

                // Spalte 70-80: Ergebniswert (11 Zeichen)
                // Vorzeichen-Fix nach Sanierungsplan P0-8:
                // Math.abs(raw) * (vorzeichen < 0 ? -1 : 1)
                // Verhindert, dass bereits negative Ergebnisse aus Abzugsflächen bei vorzeichen = -1 ins Positive gedreht werden.
                const vorzeichen = z.vorzeichen !== undefined ? parseInt(z.vorzeichen, 10) : 1;
                const raw = parseFloat(z.ergebnis) || 0;
                const effectiveResult = Math.abs(raw) * (vorzeichen < 0 ? -1 : 1);
                const resultFormatted = this.formatResult(effectiveResult);

                // Zusammensetzen nach REB-VB 23.003 Stellenplan:
                // Spalte 01-02 (2) + 03-11 (9) + 12-13 (2) + 14-19 (6) + 20-21 (2) + 22 (1) + 23-24 (2) + 25-69 (45) + 70-80 (11) = 80 Zeichen
                const da11Line = `${satzart}${oz}${index}${blattFormatted}${zeileFormatted}${kennzeichen}${formelReb}${ansatzFormatted}${resultFormatted}`;
                lines.push(da11Line.substring(0, 80));

                lineCounter++;
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
     * Unterstützt Satzart 00 (Vorlaufsatz), Satzart 11 nach REB-VB 23.003 Stellenplan,
     * Satzart 99 sowie abwärtskompatibel historische / alternative Feldlayouts.
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

                let blattNr = '000001';
                let zeilenNr = parsedZeilenCount + 1;
                let formelReb = '91';
                let rechenansatzRaw = '';
                let ergebnisRaw = '';

                // Prüfe ob Standard REB-VB 23.003 Stellenplan vorliegt:
                // Spalte 14-19 (Index 13..19): Blattnummer (6 Zeichen)
                // Spalte 20-21 (Index 19..21): Zeilennummer (2 Zeichen)
                // Spalte 22 (Index 21..22): Kennzeichen (1 Zeichen)
                // Spalte 23-24 (Index 22..24): Formelnummer (2 Zeichen)
                // Spalte 25-69 (Index 24..69): Rechenansatz / Erläuterung (45 Zeichen)
                // Spalte 70-80 (Index 69..80): Ergebnis (11 Zeichen)
                if (line.length >= 24) {
                    const formelCandidate = line.substring(22, 24).trim();
                    const blattCandidate = line.substring(13, 19).trim();
                    
                    if (formelCandidate && /^\d{2}$/.test(formelCandidate)) {
                        // Standard REB-VB 23.003 Stellenplan
                        blattNr = blattCandidate || '000001';
                        const zNrPart = line.substring(19, 21).trim();
                        zeilenNr = parseInt(zNrPart, 10) || zNrPart || (parsedZeilenCount + 1);
                        formelReb = formelCandidate;
                        rechenansatzRaw = line.length >= 69 ? line.substring(24, 69).trim() : line.substring(24).trim();
                        ergebnisRaw = line.length >= 80 ? line.substring(69, 80).trim() : '';
                    } else {
                        // Fallback für Legacy DA11 Format (BBBBZI in Spalte 12-17, Formel in Spalte 18-19)
                        const addrPart = line.substring(11, 17);
                        const bPart = addrPart.substring(0, 4).trim();
                        if (bPart) blattNr = bPart;

                        const letterPart = addrPart.substring(4, 5).toUpperCase();
                        const indexPart = parseInt(addrPart.substring(5, 6), 10) || 0;
                        if (letterPart >= 'A' && letterPart <= 'Z') {
                            zeilenNr = ((letterPart.charCodeAt(0) - 65) + 1) + (indexPart * 26);
                        }
                        formelReb = line.substring(17, 19).trim() || '91';
                        rechenansatzRaw = line.length >= 69 ? line.substring(19, 69).trim() : line.substring(19).trim();
                        ergebnisRaw = line.length >= 80 ? line.substring(69, 80).trim() : '';
                    }
                } else {
                    rechenansatzRaw = line.substring(19).trim();
                }

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
