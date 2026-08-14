/**
 * BautagebuchController.js - Bautagebuch & VOB/B § 12 Abnahmeprotokoll-Engine
 * Koordiniert Tagesberichte, Wetterdokumentation, Personal-/Geräteeinsatz sowie
 * rechtssichere digitale Bauabnahmen mit E-Signatur.
 */

class BautagebuchController {
    /**
     * Validiert einen Bautagebucheintrag.
     */
    static validateTagebuch(data) {
        if (!data.datum) {
            return { valid: false, message: 'Bitte geben Sie das Berichtsdatum an.' };
        }
        if (!data.tagesbericht || data.tagesbericht.trim() === '') {
            return { valid: false, message: 'Bitte erfassen Sie die erbrachten Tagesleistungen.' };
        }
        return { valid: true };
    }

    /**
     * Berechnet die Gesamtarbeitsstunden aus Eigen- und Subunternehmer-Personal.
     */
    static calculateTotalHours(data) {
        const eigenStunden = parseFloat(data.personal_eigen_stunden) || 0;
        let subStunden = 0;

        let subList = data.personal_sub_json;
        if (typeof subList === 'string') {
            try {
                subList = JSON.parse(subList);
            } catch (e) {
                subList = [];
            }
        }

        if (Array.isArray(subList)) {
            for (const s of subList) {
                const anzahl = parseFloat(s.anzahl) || 0;
                const stundenJeKopf = parseFloat(s.stunden) || 8; // Standard 8h/Tag falls nicht spezifiziert
                subStunden += anzahl * stundenJeKopf;
            }
        }

        return {
            eigenStunden,
            subStunden,
            gesamtStunden: eigenStunden + subStunden
        };
    }

    /**
     * Berechnet das Gewährleistungsende nach VOB/B § 13 bzw. BGB § 634a.
     * @param {string|Date} abnahmeDatum - Datum der Abnahme (YYYY-MM-DD)
     * @param {number} jahre - Gewährleistungsdauer in Jahren (Standard 4 nach VOB/B)
     * @returns {string} ISO Date String (YYYY-MM-DD)
     */
    static calculateWarrantyEndDate(abnahmeDatum, jahre = 4) {
        if (!abnahmeDatum) return '';
        const d = new Date(abnahmeDatum);
        if (isNaN(d.getTime())) return '';
        d.setFullYear(d.getFullYear() + jahre);
        return d.toISOString().split('T')[0];
    }

    /**
     * Validiert ein Abnahmeprotokoll vor dem Abschluss.
     */
    static validateAbnahmeprotokoll(data) {
        if (!data.datum) {
            return { valid: false, message: 'Bitte geben Sie das Abnahmedatum an.' };
        }
        if (!data.auftraggeber_vertreter || data.auftraggeber_vertreter.trim() === '') {
            return { valid: false, message: 'Bitte erfassen Sie den Vertreter des Auftraggebers.' };
        }
        if (!data.auftragnehmer_vertreter || data.auftragnehmer_vertreter.trim() === '') {
            return { valid: false, message: 'Bitte erfassen Sie den Vertreter des Auftragnehmers.' };
        }
        if (!data.abnahme_status) {
            return { valid: false, message: 'Bitte wählen Sie das Abnahmeergebnis (z.B. Ohne Vorbehalt).' };
        }
        return { valid: true };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BautagebuchController;
}
if (typeof window !== 'undefined') {
    window.BautagebuchController = BautagebuchController;
}
