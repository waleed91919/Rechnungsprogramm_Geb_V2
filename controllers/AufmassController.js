/**
 * AufmassController.js - Geschäftsschicht & Formel-Rechner für Aufmaße
 * Berechnet physische Maße aus Formel-Strings und koordiniert Aufmaß-Operationen.
 */
window.AufmassController = class AufmassController {
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
     * Lädt das Aufmaß für eine spezifische Rechnungsposition aus dem AufmassModel.
     * @param {string|number} positionId 
     * @returns {Promise<Object|null>}
     */
    static async loadAufmassForPosition(positionId) {
        if (!positionId) return null;
        const model = new window.AufmassModel(window.api);
        return await model.getAufmassByPositionId(positionId);
    }

    /**
     * Speichert die Aufmaßzeilen für eine spezifische Rechnungsposition.
     * @param {string|number} positionId 
     * @param {Array} positionen 
     * @param {string} titel 
     * @returns {Promise<number|null>}
     */
    static async saveAufmassForPosition(positionId, positionen = [], titel = '') {
        if (!positionId) return null;
        const model = new window.AufmassModel(window.api);
        const processed = positionen.map(p => ({
            ...p,
            ergebnis: this.evaluateFormula(p.formel)
        }));

        const aufmassData = {
            position_id: positionId,
            titel: titel || `Aufmaß Position ${positionId}`,
            positionen: processed
        };

        return await model.saveAufmassForPosition(positionId, aufmassData);
    }

    /**
     * Berechnet die Summe aller Positionsergebnisse für ein Aufmaß.
     * @param {Array} positionen - Liste von Positionsobjekten
     * @returns {Object} Aufschlüsselung nach Einheiten und Gesamtergebnis
     */
    static calculateAufmassTotals(positionen = []) {
        const totalsByUnit = {};
        let totalSum = 0;

        const processedPositions = positionen.map(pos => {
            const ergebnis = this.evaluateFormula(pos.formel);
            const einheit = (pos.einheit || 'm²').trim();

            totalsByUnit[einheit] = (totalsByUnit[einheit] || 0) + ergebnis;
            totalSum += ergebnis;

            return {
                ...pos,
                ergebnis
            };
        });

        return {
            processedPositions,
            totalsByUnit,
            totalSum
        };
    }

    /**
     * Validiert ein Aufmaß-Objekt vor dem Speichern.
     * @param {Object} aufmass - Aufmaß-Stammdaten mit Positionen
     * @returns {Object} { valid: boolean, message?: string }
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
};
