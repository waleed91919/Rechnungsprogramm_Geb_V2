
const _getProfiles = () => typeof EInvoiceProfiles !== 'undefined' ? EInvoiceProfiles : require('./einvoice-profiles.js');
const _getValidation = () => typeof EInvoiceValidation !== 'undefined' ? EInvoiceValidation : require('./einvoice-validation.js');
const _getViewer = () => typeof EInvoiceViewer !== 'undefined' ? EInvoiceViewer : require('./einvoice-viewer.js');
class EInvoiceProfiles {
    static GUIDELINE_XRECHNUNG_30 = 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0';

    static GUIDELINE_XRECHNUNG_23 = 'urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.3';

    static GUIDELINE_FACTURX_EN16931 = 'urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:en16931';

    static EXEMPTION_REASON_13B = 'Steuerschuldnerschaft des Leistungsempfängers';

    static UNIT_CODES = {
        'm²': 'MTK', 'm2': 'MTK', 'qm': 'MTK', 'quadratmeter': 'MTK',
        'm³': 'MTQ', 'm3': 'MTQ', 'cbm': 'MTQ', 'kubikmeter': 'MTQ',
        'm': 'MTR', 'meter': 'MTR', 'lfm': 'MTR', 'laufende meter': 'MTR',
        'mm': 'MMT', 'cm': 'CMT', 'km': 'KMT',
        'std': 'HUR', 'std.': 'HUR', 'h': 'HUR', 'hr': 'HUR', 'stunde': 'HUR', 'stunden': 'HUR',
        'tag': 'DAY', 'tage': 'DAY', 'woche': 'WEE', 'wochen': 'WEE', 'monat': 'MON', 'monate': 'MON',
        'stk': 'H87', 'stk.': 'H87', 'stück': 'H87', 'stueck': 'H87', 'stücke': 'H87',
        'pausch': 'C62', 'pauschal': 'C62', 'pauschale': 'C62',
        'kg': 'KGM', 'kilogramm': 'KGM', 'g': 'GRM',
        't': 'TNE', 'to': 'TNE', 'tonne': 'TNE', 'tonnen': 'TNE',
        'l': 'LTR', 'liter': 'LTR', '%': 'P1', 'prozent': 'P1'
    };

    static mapUnitToUNECERec20(einheit) {
        const key = String(einheit || '').trim().toLowerCase();
        if (!key) return 'C62';
        if (this.UNIT_CODES[key]) return this.UNIT_CODES[key];
        if (/^[a-z][a-z0-9]{1,2}$/.test(key)) return key.toUpperCase();
        if (key === 'eimer' || key === 'eimer.') {
            console.warn(`[E-Rechnung] Einheit "${einheit}" hat keinen gültigen UN/ECE Rec 20 Code, Fallback "H87" (Stück).`);
            return 'H87';
        }
        console.warn(`[E-Rechnung] Unbekannte Einheit "${einheit}", Fallback UN/ECE Rec 20 Code "C62".`);
        return 'C62';
    }

    static getZUGFeRDProfileInfo(profile) {
        switch (String(profile || 'EN16931').toUpperCase()) {
            case 'XRECHNUNG':
                return {
                    profile: 'XRECHNUNG',
                    guidelineId: this.GUIDELINE_XRECHNUNG_30,
                    fileName: 'xrechnung.xml',
                    conformanceLevel: 'XRECHNUNG'
                };
            case 'EN16931':
            default:
                return {
                    profile: 'EN16931',
                    guidelineId: this.GUIDELINE_FACTURX_EN16931,
                    fileName: 'factur-x.xml',
                    conformanceLevel: 'EN 16931'
                };
        }
    }
}

if (typeof window !== 'undefined') window.EInvoiceProfiles = EInvoiceProfiles;
if (typeof module !== 'undefined' && module.exports) module.exports = EInvoiceProfiles;
