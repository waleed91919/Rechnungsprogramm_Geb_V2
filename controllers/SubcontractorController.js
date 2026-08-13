/**
 * SubcontractorController.js - Geschäftschicht für Subunternehmer (§ 48b EStG), B2B (§ 13b UStG) & B2C (§ 35a EStG)
 */
class SubcontractorController {
    /**
     * Prüft den Gültigkeitsstatus der Freistellungsbescheinigung nach § 48b EStG für Subunternehmer.
     * @param {Object} partner - Der Kontakt / Subunternehmer.
     * @param {string|Date} referenceDate - Das Prüfdatum (Standard: heute).
     * @returns {Object} { isValid: boolean, status: string, appliesRetention: boolean, retentionRate: number, warning: string|null }
     */
    static checkSec48bStatus(partner, referenceDate = new Date()) {
        if (!partner || !partner.is_subcontractor) {
            return { isValid: true, status: 'N/A', appliesRetention: false, retentionRate: 0, warning: null };
        }

        const today = new Date(referenceDate);
        const validUntil = partner.sec48b_valid_until || partner.freistellung_gueltig_bis;

        if (!validUntil) {
            return {
                isValid: false,
                status: 'EXPIRED',
                appliesRetention: true,
                retentionRate: 15.0,
                warning: 'Keine Freistellungsbescheinigung (§ 48b EStG) hinterlegt! 15% Bauabzugsteuer muss einbehalten und an das Finanzamt abgeführt werden.'
            };
        }

        const expDate = new Date(validUntil);
        if (expDate < today) {
            return {
                isValid: false,
                status: 'EXPIRED',
                appliesRetention: true,
                retentionRate: 15.0,
                warning: `Freistellungsbescheinigung (§ 48b EStG) ist seit dem ${validUntil} abgelaufen! 15% Bauabzugsteuer muss einbehalten werden.`
            };
        }

        // Check if expiring within 30 days
        const daysRemaining = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
        let warning = null;
        if (daysRemaining <= 30) {
            warning = `Achtung: Die Freistellungsbescheinigung (§ 48b EStG) läuft in ${daysRemaining} Tagen (am ${validUntil}) ab.`;
        }

        return {
            isValid: true,
            status: 'VALID',
            appliesRetention: false,
            retentionRate: 0,
            warning
        };
    }

    /**
     * Berechnet den 15% Einbehalt nach § 48b EStG für Bauabzugsteuer.
     */
    static calculateBauabzugsteuer(grossAmount, appliesRetention) {
        if (!appliesRetention || grossAmount <= 0) return 0;
        return Math.round(grossAmount * 0.15 * 100) / 100;
    }

    /**
     * Prüft Steuerschuldnerschaft des Leistungsempfängers nach § 13b UStG für B2B-Bauleistungen.
     */
    static validateReverseCharge(customer, hasConstructionServices = true) {
        const isB2B = customer && (customer.customer_type === 'B2B' || customer.ist_bauleistender_13b);
        const applies13b = Boolean(isB2B && hasConstructionServices);
        const legalNotice = applies13b 
            ? "Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge) gemäß § 13b UStG. Das Entgelt ist netto ohne USt auszuweisen." 
            : null;

        return { applies13b, legalNotice };
    }

    /**
     * Aufschlüsselung der Lohn- und Materialkosten nach § 35a EStG für B2C-Kunden (Handwerkerleistung).
     * Trennung in LOHN, FAHRT, GERÄT und MATERIAL.
     */
    static calculateSec35aBreakdown(positionen = []) {
        let lohnNetto = 0;
        let fahrtNetto = 0;
        let geraetNetto = 0;
        let materialNetto = 0;
        let totalNetto = 0;

        let lohnBrutto = 0;
        let fahrtBrutto = 0;

        positionen.forEach(pos => {
            const menge = parseFloat(pos.menge) || 0;
            const preis = parseFloat(pos.preis) || 0;
            const rabatt = parseFloat(pos.rabatt) || 0;
            const mwst = parseFloat(pos.mwst) || 19;
            const itemNetto = (menge * preis) * (1 - rabatt / 100);
            const itemBrutto = itemNetto * (1 + mwst / 100);

            const costType = pos.cost_type || (pos.is_tax_deductible_35a ? 'LOHN' : 'MATERIAL');

            switch (costType.toUpperCase()) {
                case 'LOHN':
                    lohnNetto += itemNetto;
                    lohnBrutto += itemBrutto;
                    break;
                case 'FAHRT':
                    fahrtNetto += itemNetto;
                    fahrtBrutto += itemBrutto;
                    break;
                case 'GERÄT':
                    geraetNetto += itemNetto;
                    break;
                case 'MATERIAL':
                default:
                    materialNetto += itemNetto;
                    break;
            }
            totalNetto += itemNetto;
        });

        const eligibleNetto = lohnNetto + fahrtNetto;
        const eligibleBrutto = lohnBrutto + fahrtBrutto;
        const noticeText = eligibleBrutto > 0 
            ? `In der Gesamtsumme sind Arbeits- und Fahrtkosten von netto ${eligibleNetto.toFixed(2)} € (brutto ${eligibleBrutto.toFixed(2)} €) gemäß § 35a EStG enthalten.`
            : null;

        return {
            lohnNetto: Math.round(lohnNetto * 100) / 100,
            fahrtNetto: Math.round(fahrtNetto * 100) / 100,
            geraetNetto: Math.round(geraetNetto * 100) / 100,
            materialNetto: Math.round(materialNetto * 100) / 100,
            totalNetto: Math.round(totalNetto * 100) / 100,
            eligibleNetto: Math.round(eligibleNetto * 100) / 100,
            eligibleBrutto: Math.round(eligibleBrutto * 100) / 100,
            noticeText
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SubcontractorController;
} else {
    window.SubcontractorController = SubcontractorController;
}
