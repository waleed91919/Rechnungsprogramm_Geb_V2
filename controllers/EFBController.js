/**
 * controllers/EFBController.js - EFB-Preisblätter 221 & 223 Berechnungs- und Verprobungs-Engine
 * Konform nach VHB 2024/2026 (BMWSB)
 * Isomorph aufgebaut für Node.js und Browser-Renderer.
 * Facade-Muster: Delegiert an Untermodule in controllers/efb/
 */

const EfbUtils = typeof require !== 'undefined' ? require('./efb/efb-utils.js') : window.EfbUtils;
const Efb221 = typeof require !== 'undefined' ? require('./efb/efb221.js') : window.Efb221;
const Efb222 = typeof require !== 'undefined' ? require('./efb/efb222.js') : window.Efb222;
const Efb223 = typeof require !== 'undefined' ? require('./efb/efb223.js') : window.Efb223;
const EfbHtml = typeof require !== 'undefined' ? require('./efb/efb-html.js') : window.EfbHtml;

class EFBController {
    /**
     * Standard-Zuschlagsprofil nach VHB 2024/2026 Vorgaben.
     */
    static getDefaultProfile() {
        return EfbUtils.getDefaultProfile();
    }

    /**
     * Standard-Gliederung der Baustellengemeinkosten (BGK) für EFB 222 (Abschnitt 3).
     */
    static getDefaultBgkDetails() {
        return EfbUtils.getDefaultBgkDetails();
    }

    /**
     * Sicheres Parsen von Prozent- und Zahlenwerten unter Berücksichtigung von 0.00%.
     * Verhindert die falsche Fallback-Aktivierung bei legitimen 0-Werten (||-Falle).
     * @param {any} val - Zu prüfender Wert
     * @param {number} defaultVal - Fallback-Standardwert
     * @returns {number} Geparselter numerischer Wert
     */
    static parsePct(val, defaultVal) {
        return EfbUtils._parseNumberOrZero(val, defaultVal);
    }

    /**
     * Führt ein übergebenes Zuschlagsprofil mit den Standard-Defaults zusammen,
     * ohne legitime 0-Werte zu überschreiben.
     * @param {Object} profile - Benutzerdefiniertes Profil
     * @returns {Object} Gemergtes Profil
     */
    static mergeProfile(profile = {}) {
        return EfbUtils.mergeProfile(profile);
    }

    /**
     * Berechnet die vollständige EFB 221 Struktur für ein Projekt.
     * @param {Object} project - Projekt-Datensatz
     * @param {Array} positions - Liste der Positionen mit Kostenarten & Zeitansätzen
     * @param {Object} profile - EFB-Zuschlagsprofil
     * @returns {Object} EFB 221 Berechnungsergebnis
     */
    static calculateEFB221(project = {}, positions = [], profile = {}) {
        return Efb221.calculateEFB221(project, positions, profile);
    }

    /**
     * Ermittelt die detaillierte Kostenaufteilung einer Einzelposition.
     */
    static getPositionCostBreakdown(pos, vl, zuschlaege) {
        return Efb221.getPositionCostBreakdown(pos, vl, zuschlaege);
    }

    /**
     * Berechnet die vollständige EFB 223 Aufgliederung aller LV-Positionen.
     * @param {Array} positions - Liste der Positionen
     * @param {Object} efb221Result - Ergebnis aus calculateEFB221
     * @returns {Object} EFB 223 Aufgliederungsergebnis mit Verprobung
     */
    static calculateEFB223(positions = [], efb221Result) {
        return Efb223.calculateEFB223(positions, efb221Result);
    }

    /**
     * Erzeugt druckfertiges HTML für Formblatt EFB 221 im DIN A4 Hochformat.
     */
    static generateEFB221Html(project = {}, efb221Result, companyInfo = {}) {
        return EfbHtml.generateEFB221Html(project, efb221Result, companyInfo);
    }

    /**
     * Erzeugt druckfertiges HTML für Formblatt EFB 223 im DIN A4 Querformat.
     */
    static generateEFB223Html(project = {}, efb223Result, efb221Result, companyInfo = {}) {
        return EfbHtml.generateEFB223Html(project, efb223Result, efb221Result, companyInfo);
    }

    /**
     * Berechnet die vollständige EFB 222 Struktur (Endsummenkalkulation) nach VHB-Bund.
     * @param {Object} project - Projekt-Datensatz
     * @param {Array} positions - Liste der Positionen
     * @param {Object} bgkDetails - Detaillierte auftragsbezogene BGK (Abschnitt 3.1.1 bis 3.1.5)
     * @param {Object} profile - Zuschlagsprofil mit festen Sachkostenumlagen und W&G
     * @returns {Object} EFB 222 Berechnungsergebnis
     */
    static calculateEFB222(project = {}, positions = [], bgkDetails = {}, profile = {}) {
        return Efb222.calculateEFB222(project, positions, bgkDetails, profile);
    }

    /**
     * Erzeugt druckfertiges HTML für Formblatt EFB 222 (Endsummenkalkulation) im DIN A4 Hochformat.
     */
    static generateEFB222Html(project = {}, efb222Result, companyInfo = {}) {
        return Efb222.generateEFB222Html(project, efb222Result, companyInfo);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = EFBController;
}
if (typeof window !== 'undefined') {
    window.EFBController = EFBController;
}
