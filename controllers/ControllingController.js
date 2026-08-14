/**
 * ControllingController.js - Eingangsrechnungen & Soll-Ist Projekt-Controlling
 * Überwacht Projektkosten, prüft die § 48b Freistellungsbescheinigung (15% Bauabzugsteuer)
 * und liefert tagesaktuelle Deckungsbeiträge und Margenanalysen.
 */

class ControllingController {
    /**
     * Prüft die Freistellungsbescheinigung nach § 48b EStG für Subunternehmer-Rechnungen.
     * @param {Object} subcontractor - Subunternehmer-Objekt aus 'kunden'
     * @param {string} rechnungsDatum - Belegdatum der Eingangsrechnung
     * @param {number} bruttoBetrag - Bruttobetrag der Rechnung
     * @returns {Object} { isValid, bauabzugsteuer, auszahlungsBetrag, warning }
     */
    static checkSec48bCompliance(subcontractor, rechnungsDatum, bruttoBetrag) {
        if (!subcontractor || !subcontractor.is_subcontractor) {
            return {
                isValid: true,
                bauabzugsteuer: 0,
                auszahlungsBetrag: bruttoBetrag,
                warning: null
            };
        }

        const dateCheck = rechnungsDatum || new Date().toISOString().split('T')[0];
        const status = subcontractor.sec48b_status;
        const validUntil = subcontractor.sec48b_valid_until;

        const isCurrentlyValid = status === 'VALID' && (!validUntil || validUntil >= dateCheck);

        if (isCurrentlyValid) {
            return {
                isValid: true,
                bauabzugsteuer: 0,
                auszahlungsBetrag: bruttoBetrag,
                warning: null
            };
        }

        // Nicht gültig -> 15 % Bauabzugsteuer nach § 48b EStG einbehalten
        const bauabzug = Math.round(bruttoBetrag * 0.15 * 100) / 100;
        const auszahlung = Math.round((bruttoBetrag - bauabzug) * 100) / 100;

        return {
            isValid: false,
            bauabzugsteuer: bauabzug,
            auszahlungsBetrag: auszahlung,
            warning: `Achtung: Für Subunternehmer "${subcontractor.name}" liegt keine gültige § 48b Freistellungsbescheinigung vor (Status: ${status || 'Keine'}, Gültig bis: ${validUntil || 'Unbekannt'}). 15 % Bauabzugsteuer (${bauabzug.toFixed(2)} €) werden automatisch einbehalten.`
        };
    }

    /**
     * Berechnet die Soll-Ist Controlling-Kennzahlen für ein Projekt.
     */
    static calculateProjectKPIs(sollKosten, istKosten, istUmsatzNetto) {
        const sollGesamt = (sollKosten.lohn || 0) + (sollKosten.material || 0) + (sollKosten.geraet || 0) + (sollKosten.sub || 0);
        const istGesamt = (istKosten.lohn || 0) + (istKosten.material || 0) + (istKosten.geraet || 0) + (istKosten.subcontractor || 0) + (istKosten.sonstiges || 0);

        const deckungsbeitrag = Math.round((istUmsatzNetto - istGesamt) * 100) / 100;
        const margeProzent = istUmsatzNetto > 0 ? Math.round((deckungsbeitrag / istUmsatzNetto) * 1000) / 10 : 0;
        const kostenAbweichung = Math.round((istGesamt - sollGesamt) * 100) / 100;
        const budgetVerbrauchProzent = sollGesamt > 0 ? Math.round((istGesamt / sollGesamt) * 1000) / 10 : 0;

        return {
            sollGesamt: Math.round(sollGesamt * 100) / 100,
            istGesamt: Math.round(istGesamt * 100) / 100,
            deckungsbeitrag,
            margeProzent,
            kostenAbweichung,
            budgetVerbrauchProzent,
            isProfitabel: deckungsbeitrag >= 0,
            statusLevel: deckungsbeitrag < 0 ? 'CRITICAL' : (margeProzent < 10 ? 'WARNING' : 'HEALTHY')
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ControllingController;
}
if (typeof window !== 'undefined') {
    window.ControllingController = ControllingController;
}
