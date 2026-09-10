/**
 * AufmassController.js - Geschäftsschicht & Formel-Rechner für Aufmaße nach REB 23.003
 * Berechnet physische Maße aus Formel-Strings und koordiniert Aufmaß- & DA11-Operationen.
 */

class AufmassController {
    /**
     * Berechnet mathematische Strings (z.B. "(5 + 3.5) * 2") sicher ohne unsicheres eval().
     * @param {string} formulaString - Mathematischer Ausdruck
     * @returns {number} Das berechnete Ergebnis oder 0 bei Ungültigkeit
     */
    static evaluateFormula(formulaString) {
        if (!formulaString || typeof formulaString !== 'string') {
            return 0;
        }

        // 1. Deutsches Komma in Dezimalpunkt umwandeln und Whitespace trimmen
        let sanitized = formulaString.trim().replace(/,/g, '.');

        // 2. Potenz-Operator ^ durch JavaScript-Potenz ** ersetzen
        sanitized = sanitized.replace(/\^/g, '**');

        // 3. Strikte Validierung mit RegEx: Nur Zahlen, grundlegende Operatoren (+, -, *, /, %, **), Klammern und Punkte erlauben
        const validFormulaRegex = /^[0-9+\-*/().\s%*]+$/;
        if (!validFormulaRegex.test(sanitized)) {
            console.warn(`AufmassController.evaluateFormula: Ungültiges Zeichen in Formel "${formulaString}"`);
            return 0;
        }

        // 4. Zusätzlicher Schutz vor verdächtigen Kombinationen (z.B. multiple Punkte in einer Zahl, leere Klammern)
        if (/\(\s*\)/.test(sanitized) || /\.\./.test(sanitized)) {
            console.warn(`AufmassController.evaluateFormula: Syntaxfehler in Formel "${formulaString}"`);
            return 0;
        }

        try {
            // Safe execution context via Function Constructor mit strict mode
            const calcFunction = new Function(`"use strict"; return (${sanitized});`);
            const result = calcFunction();

            if (typeof result === 'number' && Number.isFinite(result)) {
                // Runden auf 4 Dezimalstellen für präzise Aufmaßberechnungen
                return Math.round(result * 10000) / 10000;
            }
            return 0;
        } catch (error) {
            console.warn(`AufmassController.evaluateFormula: Fehler bei Berechnung von "${formulaString}":`, error.message);
            return 0;
        }
    }

    /**
     * REB 23.003 Standard-Formel-Berechnung
     * @param {string} formelCode - z.B. '01' (Rechteck), '04' (Quader), '91' (Frei)
     * @param {Array<number>} params - Parameterwerte [a, b, c, d]
     * @returns {number}
     */
    static calculateREBFormula(formelCode, params = []) {
        const [a = 0, b = 0, c = 0, d = 0] = params.map(p => parseFloat(p) || 0);

        switch (formelCode) {
            case '01': // Rechteck: a * b
                return Math.round(a * b * 10000) / 10000;
            case '02': // Dreieck: (a * b) / 2
                return Math.round(((a * b) / 2) * 10000) / 10000;
            case '03': // Trapez: ((a + c) / 2) * h (b)
                return Math.round((((a + c) / 2) * b) * 10000) / 10000;
            case '04': // Quader: a * b * c
                return Math.round(a * b * c * 10000) / 10000;
            case '05': // Zylinder: (PI / 4) * d^2 * h -> (PI / 4) * a^2 * b
                return Math.round(((Math.PI / 4) * Math.pow(a, 2) * b) * 10000) / 10000;
            case '91': // Freie Formel: Standardprodukt a * b * c
            default:
                if (c > 0) return Math.round(a * b * c * 10000) / 10000;
                if (b > 0) return Math.round(a * b * 10000) / 10000;
                return a;
        }
    }

    /**
     * Lädt das Aufmaß für eine spezifische Rechnungsposition aus dem AufmassModel.
     */
    static async loadAufmassForPosition(positionId, currentEinheit = null) {
        if (!positionId || typeof window === 'undefined' || !window.AufmassModel) return null;
        const model = new window.AufmassModel(window.api);
        const loaded = await model.getAufmassByPositionId(positionId);

        if (!loaded) return null;

        const savedEinheit = loaded.einheit || (loaded.positionen && loaded.positionen[0] && loaded.positionen[0].einheit);
        if (currentEinheit && savedEinheit && savedEinheit !== currentEinheit) {
            console.log(`Aufmaß für Position ${positionId} zurückgesetzt (Einheitswechsel von "${savedEinheit}" zu "${currentEinheit}").`);
            return null;
        }

        return loaded;
    }

    /**
     * Speichert die Aufmaßzeilen für eine spezifische Rechnungsposition.
     */
    static async saveAufmassForPosition(positionId, positionen = [], titel = '', einheit = 'm²') {
        if (!positionId || typeof window === 'undefined' || !window.AufmassModel) return null;
        const model = new window.AufmassModel(window.api);
        const processed = positionen.map(p => ({
            ...p,
            einheit: p.einheit || einheit,
            ergebnis: this.evaluateFormula(p.formel)
        }));

        const aufmassData = {
            position_id: positionId,
            titel: titel || `Aufmaß Position ${positionId}`,
            einheit: einheit || 'm²',
            positionen: processed
        };

        return await model.saveAufmassForPosition(positionId, aufmassData);
    }

    /**
     * Berechnet die Summe aller Positionsergebnisse für ein Aufmaß.
     */
    static calculateAufmassTotals(positionen = []) {
        const totalsByUnit = {};
        let totalSum = 0;

        const processedPositions = positionen.map(pos => {
            const ergebnis = pos.formel ? this.evaluateFormula(pos.formel) : (parseFloat(pos.ergebnis) || 0);
            const einheit = (pos.einheit || 'Stk.').trim();

            totalsByUnit[einheit] = Math.round(((totalsByUnit[einheit] || 0) + ergebnis) * 10000) / 10000;
            totalSum += ergebnis;

            return {
                ...pos,
                ergebnis
            };
        });

        return {
            processedPositions,
            totalsByUnit,
            totalSum: Math.round(totalSum * 10000) / 10000
        };
    }

    /**
     * Validiert ein Aufmaß-Objekt vor dem Speichern.
     */
    static validateAufmass(aufmass) {
        if (!aufmass || !aufmass.titel || aufmass.titel.trim() === '') {
            return { valid: false, message: 'Bitte geben Sie einen Titel für das Aufmaß ein.' };
        }
        if (!aufmass.rechnung_id && !aufmass.projekt_id && !aufmass.position_id) {
            return { valid: false, message: 'Das Aufmaß muss mit einer Position, Rechnung oder einem Projekt verknüpft sein.' };
        }
        if (!aufmass.positionen || !Array.isArray(aufmass.positionen) || aufmass.positionen.length === 0) {
            return { valid: false, message: 'Bitte fügen Sie mindestens eine Aufmaßposition hinzu.' };
        }
        return { valid: true };
    }

    /**
     * Prüft eine Öffnung, Aussparung oder Unterbrechung anhand der gewerkespezifischen VOB/C Übermessungsregeln.
     * Referenz: ATV DIN 18299 (Abschnitt 5) und Fach-ATVs DIN 18330 bis DIN 18363.
     * @param {number} einzelmass - Größe der Öffnung/Aussparung (m², m³ oder m)
     * @param {string} gewerkNorm - Gewerke-Norm (z.B. 'DIN_18350', 'PUTZ', 'TROCKENBAU', 'FLIESEN', 'ESTRICH')
     * @param {string} massType - 'FLAECHE' (m²), 'LAENGE' (m) oder 'RAUM' (m³)
     * @returns {Object} Übermessungs-Prüfergebnis
     */
    static applyUebermessungRule(einzelmass, gewerkNorm = 'DIN_18350', massType = 'FLAECHE') {
        const mass = Math.round((parseFloat(einzelmass) || 0) * 10000) / 10000;
        const norm = String(gewerkNorm || '').toUpperCase().replace(/[\s-]+/g, '_');
        const type = String(massType || 'FLAECHE').toUpperCase();

        let grenzwert = 2.50; // Standardgrenzwert für Wandflächen (DIN 18330 ff.)

        if (type === 'LAENGE' || type === 'METER' || norm.includes('LAENGE')) {
            // Längenmaße: Unterbrechungen <= 1,00 m Einzellänge werden übermessen (DIN 18299)
            grenzwert = 1.00;
        } else if (type === 'RAUM' || norm.includes('RAUM') || norm.includes('KUBIK')) {
            // Beton-Raummaße: Aussparungen <= 0,50 m³ werden übermessen (DIN 18331)
            grenzwert = 0.50;
        } else if (norm.includes('18352') || norm.includes('FLIESEN') ||
                   norm.includes('18353') || norm.includes('ESTRICH') ||
                   norm.includes('18356') || norm.includes('BODENBELAG')) {
            // Fliesen, Platten, Estrich, Bodenbeläge: Aussparungen <= 0,10 m² werden übermessen
            grenzwert = 0.10;
        } else if (norm.includes('BODEN') && (norm.includes('18330') || norm.includes('18340') || norm.includes('ROHBAU'))) {
            // Rohbau- / Trockenbauböden: Aussparungen <= 0,50 m² werden übermessen
            grenzwert = 0.50;
        } else {
            // Mauerwerk (DIN 18330), Beton Wand (DIN 18331), Trockenbau (DIN 18340), Putz (DIN 18350),
            // WDVS (DIN 18345), Maler (DIN 18363), Tischler (DIN 18355): Öffnungen <= 2,50 m² werden übermessen
            grenzwert = 2.50;
        }

        const isOvermeasured = mass <= grenzwert;
        const abzug = isOvermeasured ? 0 : mass;
        const begruendung = isOvermeasured
            ? `Einzelmaß ${mass} <= Grenzwert ${grenzwert} gem. VOB/C: Übermessung (kein Abzug, Abrechnung als Vollfläche).`
            : `Einzelmaß ${mass} > Grenzwert ${grenzwert} gem. VOB/C: Abzugspflichtige Minderfläche.`;

        return {
            mass,
            gewerkNorm,
            massType: type,
            grenzwert,
            isOvermeasured,
            abzug: Math.round(abzug * 10000) / 10000,
            begruendung
        };
    }

    /**
     * Berechnet die abrechenbare Nettofläche nach VOB/C unter Berücksichtigung aller Aussparungen.
     * @param {number} bruttoFlaeche - Gesamte Bruttofläche
     * @param {Array} aussparungen - Liste der Aussparungen (Zahlen, Formeln oder { breite, hoehe, flaeche, bezeichnung })
     * @param {string} gewerkNorm - Gewerke-Norm
     * @param {string} massType - 'FLAECHE' oder 'LAENGE'
     * @returns {Object} Detaillierte Abrechnungsübersicht nach VOB/C
     */
    static calculateNettoAufmass(bruttoFlaeche, aussparungen = [], gewerkNorm = 'DIN_18350', massType = 'FLAECHE') {
        const brutto = Math.round((parseFloat(bruttoFlaeche) || 0) * 10000) / 10000;
        let summeUebermessen = 0;
        let summeAbzuege = 0;

        const gepruefteAussparungen = aussparungen.map((item, idx) => {
            let mass = 0;
            let bez = `Aussparung ${idx + 1}`;

            if (typeof item === 'number') {
                mass = item;
            } else if (typeof item === 'string') {
                mass = AufmassController.evaluateFormula(item);
                bez = item;
            } else if (item && typeof item === 'object') {
                bez = item.bezeichnung || item.name || bez;
                if (item.flaeche !== undefined) {
                    mass = parseFloat(item.flaeche) || 0;
                } else if (item.breite && item.hoehe) {
                    mass = Math.round((parseFloat(item.breite) * parseFloat(item.hoehe)) * 10000) / 10000;
                } else if (item.formel) {
                    mass = AufmassController.evaluateFormula(item.formel);
                }
            }

            const check = AufmassController.applyUebermessungRule(mass, gewerkNorm, massType);
            if (check.isOvermeasured) {
                summeUebermessen += check.mass;
            } else {
                summeAbzuege += check.abzug;
            }

            return {
                bezeichnung: bez,
                ...check
            };
        });

        summeUebermessen = Math.round(summeUebermessen * 10000) / 10000;
        summeAbzuege = Math.round(summeAbzuege * 10000) / 10000;
        const nettoFlaeche = Math.max(0, Math.round((brutto - summeAbzuege) * 10000) / 10000);

        return {
            bruttoFlaeche: brutto,
            gewerkNorm,
            massType,
            gepruefteAussparungen,
            summeUebermessen,
            summeAbzuege,
            nettoFlaeche
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AufmassController;
}
if (typeof window !== 'undefined') {
    window.AufmassController = AufmassController;
}
