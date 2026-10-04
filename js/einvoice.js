/**
 * einvoice.js - Fassade für die modulare EInvoiceEngine
 */

class EInvoiceEngine {
    // === Profiles ===
    static get GUIDELINE_XRECHNUNG_30() { return (typeof EInvoiceProfiles !== 'undefined' ? EInvoiceProfiles : require('./einvoice/einvoice-profiles')).GUIDELINE_XRECHNUNG_30; }
    static get GUIDELINE_XRECHNUNG_23() { return (typeof EInvoiceProfiles !== 'undefined' ? EInvoiceProfiles : require('./einvoice/einvoice-profiles')).GUIDELINE_XRECHNUNG_23; }
    static get GUIDELINE_FACTURX_EN16931() { return (typeof EInvoiceProfiles !== 'undefined' ? EInvoiceProfiles : require('./einvoice/einvoice-profiles')).GUIDELINE_FACTURX_EN16931; }
    static get EXEMPTION_REASON_13B() { return (typeof EInvoiceProfiles !== 'undefined' ? EInvoiceProfiles : require('./einvoice/einvoice-profiles')).EXEMPTION_REASON_13B; }
    static get UNIT_CODES() { return (typeof EInvoiceProfiles !== 'undefined' ? EInvoiceProfiles : require('./einvoice/einvoice-profiles')).UNIT_CODES; }

    static mapUnitToUNECERec20(...args) { return (typeof EInvoiceProfiles !== 'undefined' ? EInvoiceProfiles : require('./einvoice/einvoice-profiles')).mapUnitToUNECERec20(...args); }
    static getZUGFeRDProfileInfo(...args) { return (typeof EInvoiceProfiles !== 'undefined' ? EInvoiceProfiles : require('./einvoice/einvoice-profiles')).getZUGFeRDProfileInfo(...args); }

    // === Validation ===
    static computeLeitwegIdChecksum(...args) { return (typeof EInvoiceValidation !== 'undefined' ? EInvoiceValidation : require('./einvoice/einvoice-validation')).computeLeitwegIdChecksum(...args); }
    static validateLeitwegId(...args) { return (typeof EInvoiceValidation !== 'undefined' ? EInvoiceValidation : require('./einvoice/einvoice-validation')).validateLeitwegId(...args); }
    static validateForEN16931(...args) { return (typeof EInvoiceValidation !== 'undefined' ? EInvoiceValidation : require('./einvoice/einvoice-validation')).validateForEN16931(...args); }
    static assertExportfaehigerBeleg(...args) { return (typeof EInvoiceValidation !== 'undefined' ? EInvoiceValidation : require('./einvoice/einvoice-validation')).assertExportfaehigerBeleg(...args); }

    // === Viewer & Generation ===
    static round2(...args) { return (typeof EInvoiceViewer !== 'undefined' ? EInvoiceViewer : require('./einvoice/einvoice-viewer')).round2(...args); }
    static toDate102(...args) { return (typeof EInvoiceViewer !== 'undefined' ? EInvoiceViewer : require('./einvoice/einvoice-viewer')).toDate102(...args); }
    static parseAddressString(...args) { return (typeof EInvoiceViewer !== 'undefined' ? EInvoiceViewer : require('./einvoice/einvoice-viewer')).parseAddressString(...args); }
    static resolveAddress(...args) { return (typeof EInvoiceViewer !== 'undefined' ? EInvoiceViewer : require('./einvoice/einvoice-viewer')).resolveAddress(...args); }
    static getSellerTaxRegistrations(...args) { return (typeof EInvoiceViewer !== 'undefined' ? EInvoiceViewer : require('./einvoice/einvoice-viewer')).getSellerTaxRegistrations(...args); }
    static getBuyerVatId(...args) { return (typeof EInvoiceViewer !== 'undefined' ? EInvoiceViewer : require('./einvoice/einvoice-viewer')).getBuyerVatId(...args); }
    static resolvePositionCategory(...args) { return (typeof EInvoiceViewer !== 'undefined' ? EInvoiceViewer : require('./einvoice/einvoice-viewer')).resolvePositionCategory(...args); }
    static computeTotals(...args) { return (typeof EInvoiceViewer !== 'undefined' ? EInvoiceViewer : require('./einvoice/einvoice-viewer')).computeTotals(...args); }
    static resolveItemName(...args) { return (typeof EInvoiceViewer !== 'undefined' ? EInvoiceViewer : require('./einvoice/einvoice-viewer')).resolveItemName(...args); }
    static generateXRechnungXML(...args) { return (typeof EInvoiceViewer !== 'undefined' ? EInvoiceViewer : require('./einvoice/einvoice-viewer')).generateXRechnungXML(...args); }
    static buildPostalAddressXML(...args) { return (typeof EInvoiceViewer !== 'undefined' ? EInvoiceViewer : require('./einvoice/einvoice-viewer')).buildPostalAddressXML(...args); }
    static buildElectronicAddressXML(...args) { return (typeof EInvoiceViewer !== 'undefined' ? EInvoiceViewer : require('./einvoice/einvoice-viewer')).buildElectronicAddressXML(...args); }
    static buildCII(...args) { return (typeof EInvoiceViewer !== 'undefined' ? EInvoiceViewer : require('./einvoice/einvoice-viewer')).buildCII(...args); }
    static generateZUGFeRDXML(...args) { return (typeof EInvoiceViewer !== 'undefined' ? EInvoiceViewer : require('./einvoice/einvoice-viewer')).generateZUGFeRDXML(...args); }
    static escapeXML(...args) { return (typeof EInvoiceViewer !== 'undefined' ? EInvoiceViewer : require('./einvoice/einvoice-viewer')).escapeXML(...args); }
}

// Isomorpher Export (Node.js & Browser/Renderer)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EInvoiceEngine;
}
if (typeof window !== 'undefined') {
    window.EInvoiceEngine = EInvoiceEngine;
}
if (typeof globalThis !== 'undefined' && !globalThis.EInvoiceEngine) {
    globalThis.EInvoiceEngine = EInvoiceEngine;
}
