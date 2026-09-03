/**
 * pwa/js/reb-aufmass.js - Vollständiger REB 23.003 Rechenkern für die Mobile PWA
 * Berechnet Formeln 01, 02, 04, 23, 91, prüft VOB/C Übermessungen (<= 2,5 m²)
 * und generiert normierte DA11-Satzart 11 Strings (exakt 80 Bytes).
 * Isomorph für Node.js Backend und Web Browser.
 */

class RebAufmassEngine {
    /**
     * Berechnet eine REB 23.003 Formel anhand von Formelcode und Parametern.
     * @param {'01'|'02'|'04'|'23'|'91'|number} formelCode 
     * @param {Object} params - { a, b, c, d, h, freiString, isCylinder }
     * @returns {number} Kaufmännisch auf 4 Dezimalstellen gerundetes Ergebnis
     */
    static calculate(formelCode, params = {}) {
        const code = String(formelCode || '91').padStart(2, '0');
        const a = parseFloat(params.a) || 0;
        const b = parseFloat(params.b) || 0;
        const c = parseFloat(params.c) || 0;
        const d = parseFloat(params.d !== undefined ? params.d : params.a) || 0;
        const h = parseFloat(params.h !== undefined ? params.h : params.b) || 0;

        let result = 0;

        switch (code) {
            case '01': // Rechteck: a * b
                result = a * b;
                break;
            case '02': // Dreieck: (a * b) / 2
                result = (a * b) / 2;
                break;
            case '04': // Trapez: ((a + c) / 2) * h
                result = ((a + c) / 2) * h;
                break;
            case '23': // Quader: a * b * c bzw. Zylinder: (PI / 4) * d^2 * h
                if (params.isCylinder || params.zylinder) {
                    result = (Math.PI / 4) * d * d * h;
                } else {
                    result = a * b * (c > 0 ? c : 1);
                }
                break;
            case '91': // Freie Formel
                result = this.evaluateSafeExpression(params.freiString || `${a}`);
                break;
            default:
                result = a;
        }

        return Math.round(result * 10000) / 10000;
    }

    /**
     * Sicherer mathematischer Ausdrucks-Evaluator ohne unsicheres eval().
     * Erlaubt nur Ziffern, Klammern und Grundrechenarten (+, -, *, /, %).
     * @param {string} expr 
     * @returns {number}
     */
    static evaluateSafeExpression(expr) {
        if (!expr || typeof expr !== 'string') return 0;
        let sanitized = expr.trim().replace(/,/g, '.').replace(/\^/g, '**');

        // Strikte Whitelist-Validierung gegen Code Injection
        if (!/^[0-9+\-*/().\s%*]+$/.test(sanitized)) return 0;
        if (/\(\s*\)/.test(sanitized) || /\.\./.test(sanitized)) return 0;

        try {
            const fn = new Function(`"use strict"; return (${sanitized});`);
            const res = fn();
            return (typeof res === 'number' && Number.isFinite(res))
                ? Math.round(res * 10000) / 10000
                : 0;
        } catch (_e) {
            return 0;
        }
    }

    /**
     * Prüft, ob eine Öffnung (Fenster, Tür, Durchbruch) nach VOB/C übermessen wird.
     * Gemäß DIN 18350, DIN 18365 etc. werden Öffnungen <= 2,50 m² übermessen (kein Abzug).
     * @param {number} flaeche 
     * @param {number} [grenze=2.5] Abzugsschwelle in m²
     * @returns {boolean} true wenn übermessen (nicht abgezogen), false wenn abzugspflichtig
     */
    static isUebermessen(flaeche, grenze = 2.5) {
        const f = Math.abs(parseFloat(flaeche) || 0);
        return f <= grenze;
    }

    /**
     * Berechnet die Summe aller abzugspflichtigen Öffnungen (> 2,5 m²).
     * @param {Array<number|Object>} oeffnungen - Array von Flächen oder { flaeche }
     * @param {number} [grenze=2.5] 
     * @returns {number} Summe der abzuziehenden Flächen auf 4 Stellen gerundet
     */
    static calculateVobAbzug(oeffnungen = [], grenze = 2.5) {
        if (!Array.isArray(oeffnungen)) return 0;
        let abzug = 0;
        for (const item of oeffnungen) {
            const val = typeof item === 'number' ? item : (parseFloat(item?.flaeche) || 0);
            if (!this.isUebermessen(val, grenze)) {
                abzug += val;
            }
        }
        return Math.round(abzug * 10000) / 10000;
    }

    /**
     * Berechnet die Netto-Fläche nach VOB/C: Brutto minus alle Öffnungen > 2,5 m².
     * @param {number} bruttoFlaeche 
     * @param {Array<number|Object>} oeffnungen 
     * @param {number} [grenze=2.5] 
     * @returns {number} Nettofläche
     */
    static calculateNettoMitUebermessung(bruttoFlaeche = 0, oeffnungen = [], grenze = 2.5) {
        const brutto = parseFloat(bruttoFlaeche) || 0;
        const abzug = this.calculateVobAbzug(oeffnungen, grenze);
        const netto = Math.max(0, brutto - abzug);
        return Math.round(netto * 10000) / 10000;
    }

    /**
     * Formatiert eine Aufmaßzeile in den genormten DA11 Satzart 11 Standard (Ausgabe 1979/2009).
     * Exakt 80 Zeichen lang:
     * - Spalte 01-02 (2): Satzart "11"
     * - Spalte 03-11 (9): Ordnungszahl (OZ)
     * - Spalte 12-12 (1): Index / Kennzeichen
     * - Spalte 13-22 (10): Text / Raumbeschreibung
     * - Spalte 23-24 (2): Formelnummer (z. B. "01", "04", "91")
     * - Spalte 25-70 (46): Rechenansatz
     * - Spalte 71-80 (10): Ergebnis (3 Nachkommastellen, rechtsbündig)
     * @param {Object} row - { oz, index, bezeichnung, formelCode, params, ergebnis }
     * @returns {string} Feste 80-Zeichen DA11-Zeile
     */
    static formatDa11Line(row = {}) {
        // Spalte 1-2: Satzart "11"
        let line = '11';

        // Spalte 3-11: Ordnungszahl (OZ) (9 Zeichen)
        const ozClean = (row.oz || row.oz_code || '').replace(/[^0-9A-Za-z]/g, '').padEnd(9, ' ').substring(0, 9);
        line += ozClean;

        // Spalte 12: Index / Kennzeichen (1 Zeichen)
        const indexClean = (row.index || ' ').substring(0, 1) || ' ';
        line += indexClean;

        // Spalte 13-22: Text / Raumbeschreibung (10 Zeichen)
        const textClean = (row.bezeichnung || row.raum || '').padEnd(10, ' ').substring(0, 10);
        line += textClean;

        // Spalte 23-24: Formelnummer (2 Zeichen)
        const fnClean = String(row.formelCode || row.formel_reb || '91').padStart(2, '0').substring(0, 2);
        line += fnClean;

        // Spalte 25-70: Rechenansatz (46 Zeichen)
        let ansatz = '';
        const params = row.params || {};
        if (fnClean === '01') {
            ansatz = `${params.a}*${params.b}=`;
        } else if (fnClean === '02') {
            ansatz = `(${params.a}*${params.b})/2=`;
        } else if (fnClean === '04') {
            ansatz = `((${params.a}+${params.c})/2)*${params.h || params.b}=`;
        } else if (fnClean === '23') {
            ansatz = `${params.a}*${params.b}*${params.c}=`;
        } else {
            ansatz = row.rechenansatz || params.freiString || `${params.a || row.ergebnis || 0}=`;
        }

        ansatz = ansatz.padEnd(46, ' ').substring(0, 46);
        line += ansatz;

        // Spalte 71-80: Ergebnis (10 Zeichen, rechtsbündig)
        const numRes = typeof row.ergebnis === 'number' ? row.ergebnis : parseFloat(row.ergebnis) || 0;
        const resStr = numRes.toFixed(3).padStart(10, ' ').substring(0, 10);
        line += resStr;

        // Zusätzliche Längenabsicherung auf exakt 80 Zeichen
        if (line.length < 80) {
            line = line.padEnd(80, ' ');
        } else if (line.length > 80) {
            line = line.substring(0, 80);
        }

        return line;
    }

    /**
     * Erzeugt eine vollständige DA11-Datei als String für eine Liste von Zeilen.
     * @param {Array<Object>} rows 
     * @returns {string}
     */
    static generateDa11File(rows = []) {
        return rows.map(r => this.formatDa11Line(r)).join('\r\n') + '\r\n';
    }
}

if (typeof window !== 'undefined') {
    window.RebAufmassEngine = RebAufmassEngine;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RebAufmassEngine;
}
