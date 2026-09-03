/**
 * CumulativeBillingController.js - Logik für Kumulierte Abrechnung nach VOB/B & Sicherheitseinbehalte
 * Berechnungsformel: F_t = L_t - \sum F_i
 */
class CumulativeBillingController {
    /**
     * Berechnet die kumulierte Abrechnung für ein Bauprojekt.
     * @param {number} totalPerformanceNet - L_t (Gesamte erbrachte Leistung bis heute netto)
     * @param {Array} previousInvoices - Liste der bisherigen Abschlagsrechnungen [{ netto, steuer, brutto }]
     * @param {number} securityRetentionRate - Sicherheitseinbehalt in Prozent (z.B. 5.0 für 5%)
     * @param {number} vatRate - Mehrwertsteuersatz in Prozent (z.B. 19)
     * @returns {Object} Abschlagsrechnungs-Berechnung
     */
    static calculateCumulativeInvoice({
        totalPerformanceNet = 0,
        previousInvoices = [],
        securityRetentionRate = 5.0,
        vatRate = 19.0,
        isReverseCharge = false
    }) {
        // Summe bisheriger Netto-Abschlagsrechnungen (\sum F_i)
        const totalPreviousBilledNet = previousInvoices.reduce((sum, inv) => {
            return sum + (parseFloat(inv.netto) || parseFloat(inv.kumulierte_leistung_netto) || 0);
        }, 0);

        // Aktuelle Netto-Leistung dieser Periode: F_t = L_t - \sum F_i
        const currentPeriodNet = Math.max(0, totalPerformanceNet - totalPreviousBilledNet);

        // Bisher einbehaltene Beträge aus Vorrechnungen ermitteln
        const previousRetentionTotal = previousInvoices.reduce((sum, inv) => {
            return sum + (parseFloat(inv.sicherheitseinbehalt) || 0);
        }, 0);

        // Kumulierter Solleinbehalt auf die Gesamtleistung
        const totalRetentionTarget = Math.round((totalPerformanceNet * (securityRetentionRate / 100)) * 100) / 100;
        // In dieser Periode verbleibender Einbehaltsabzug:
        const securityRetentionAmount = Math.max(0, Math.round((totalRetentionTarget - previousRetentionTotal) * 100) / 100);

        // Steuerbare Basis für die aktuelle Periode
        const taxRate = isReverseCharge ? 0 : vatRate;
        const currentPeriodVat = Math.round(currentPeriodNet * (taxRate / 100) * 100) / 100;
        const currentPeriodGross = Math.round((currentPeriodNet + currentPeriodVat) * 100) / 100;

        // Zahlbetrag dieser Rechnung nach Abzug des Sicherheitseinbehalts
        const netPayableAmount = Math.max(0, Math.round((currentPeriodGross - securityRetentionAmount) * 100) / 100);

        return {
            totalPerformanceNet: Math.round(totalPerformanceNet * 100) / 100,
            totalPreviousBilledNet: Math.round(totalPreviousBilledNet * 100) / 100,
            currentPeriodNet: Math.round(currentPeriodNet * 100) / 100,
            currentPeriodVat,
            currentPeriodGross: Math.round(currentPeriodGross * 100) / 100,
            securityRetentionRate,
            securityRetentionAmount: Math.round(securityRetentionAmount * 100) / 100,
            netPayableAmount: Math.round(netPayableAmount * 100) / 100,
            sequenceNumber: previousInvoices.length + 1
        };
    }

    /**
     * Erstellt einen Datensatz für die Sicherheitseinbehalts- und Gewährleistungsverfolgung nach VOB/B.
     */
    static createSecurityRetentionEntry({
        projectId,
        invoiceId,
        amount,
        retentionType = 'WARRANTY', // EXECUTION (Ausführung) oder WARRANTY (Gewährleistung)
        warrantyYears = 4 // VOB/B Standard: 4 Jahre Gewährleistung
    }) {
        const today = new Date();
        const dueDate = new Date(today);
        dueDate.setFullYear(dueDate.getFullYear() + warrantyYears);

        return {
            projectId,
            invoiceId,
            retentionType,
            amount: Math.round(amount * 100) / 100,
            dueDate: dueDate.toISOString().split('T')[0],
            status: 'HELD',
            guaranteeDocumentRef: null
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CumulativeBillingController;
} else {
    window.CumulativeBillingController = CumulativeBillingController;
}
