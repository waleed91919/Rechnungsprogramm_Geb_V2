/**
 * controllers/efb/efb-utils.js
 * Utility-Funktionen für EFB Berechnungen
 */

const EfbUtils = (function () {
    /**
     * Standard-Zuschlagsprofil nach VHB 2024/2026 Vorgaben.
     */
    function getDefaultProfile() {
        return {
            name: 'Standard-Zuschlagsprofil (VHB 221)',
            mittellohn_eur: 24.50,
            lohngebundene_kosten_prozent: 85.00,
            lohnnebenkosten_prozent: 12.50,
            kalkulationslohn_eur: 48.39,
            zuschlag_lohn_bgk: 18.00,
            zuschlag_lohn_agk: 22.00,
            zuschlag_lohn_wug: 8.80,
            zuschlag_stoff_bgk: 12.00,
            zuschlag_stoff_agk: 14.00,
            zuschlag_stoff_wug: 6.00,
            zuschlag_geraet_bgk: 15.00,
            zuschlag_geraet_agk: 16.00,
            zuschlag_geraet_wug: 6.00,
            zuschlag_sonst_bgk: 10.00,
            zuschlag_sonst_agk: 12.00,
            zuschlag_sonst_wug: 5.00,
            zuschlag_nu_bgk: 8.00,
            zuschlag_nu_agk: 10.00,
            zuschlag_nu_wug: 4.00,
            wug_gewinn_prozent: 5.00,
            wug_betriebswagnis_prozent: 2.00,
            wug_leistungswagnis_prozent: 1.80,
            umlage_stoff_prozent: 20.00,
            umlage_geraet_prozent: 10.00,
            umlage_sonst_prozent: 5.00,
            umlage_nu_prozent: 10.00,
            agk_endsumme_prozent: 12.00
        };
    }

    /**
     * Standard-Gliederung der Baustellengemeinkosten (BGK) für EFB 222 (Abschnitt 3).
     */
    function getDefaultBgkDetails() {
        return {
            lohnkosten_baustelleneinrichtung: 1200.00, // 3.1.1 Löhne BE
            gehaltskosten_baustelle: 2500.00,          // 3.1.2 Gehälter Bauleitung/Polier
            geraete_ausruestung: 1800.00,              // 3.1.3 Geräte und Ausrüstungen
            transporte_anfahrten: 650.00,              // 3.1.4 Transporte und Anfahrten
            sonderkosten: 450.00                       // 3.1.5 Sonderkosten der Baustelle
        };
    }

    /**
     * Sicheres Parsen von Prozent- und Zahlenwerten unter Berücksichtigung von 0.00%.
     * Verhindert die falsche Fallback-Aktivierung bei legitimen 0-Werten (||-Falle).
     * @param {any} val - Zu prüfender Wert
     * @param {number} defaultVal - Fallback-Standardwert
     * @returns {number} Geparselter numerischer Wert
     */
    function _parseNumberOrZero(val, defaultVal) {
        return (val !== undefined && val !== null && !isNaN(parseFloat(val))) ? parseFloat(val) : defaultVal;
    }

    /**
     * Führt ein übergebenes Zuschlagsprofil mit den Standard-Defaults zusammen,
     * ohne legitime 0-Werte zu überschreiben.
     * @param {Object} profile - Benutzerdefiniertes Profil
     * @returns {Object} Gemergtes Profil
     */
    function mergeProfile(profile = {}) {
        const defaults = getDefaultProfile();
        if (!profile || typeof profile !== 'object') return { ...defaults };
        const merged = { ...defaults };
        for (const [key, val] of Object.entries(profile)) {
            if (val !== undefined && val !== null && val !== '') {
                merged[key] = val;
            }
        }
        return merged;
    }

    function _formatCurrency(v) {
        return (parseFloat(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    }

    return {
        getDefaultProfile,
        getDefaultBgkDetails,
        _parseNumberOrZero,
        mergeProfile,
        _formatCurrency
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = EfbUtils;
}
if (typeof window !== 'undefined') {
    window.EfbUtils = EfbUtils;
}
