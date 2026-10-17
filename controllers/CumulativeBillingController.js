/**
 * CumulativeBillingController.js - Logik für Kumulierte Abrechnung nach VOB/B & Sicherheitseinbehalte
 * Berechnungsformel: F_t = L_t - \sum F_i
 *
 * SSoT: alle Rundungen über js/money.js (EN 16931, 2 NK, mit EPSILON).
 * Kein eigenes Math.round(*100)/100 mehr.
 */
function __resolveMoney_cbc() {
    if (typeof Money !== 'undefined' && Money && typeof Money.round2 === 'function') return Money;
    if (typeof window !== 'undefined' && window.Money) return window.Money;
    if (typeof globalThis !== 'undefined' && globalThis.Money) return globalThis.Money;
    try {
        if (typeof require !== 'undefined') return require('../js/money');
    } catch (e) {}
    return null;
}
class CumulativeBillingController {
    /**
     * Berechnet die kumulierte Abrechnung für ein Bauprojekt nach VOB/B § 14, 16, 17.
     * @param {number} totalPerformanceNet - L_t (Gesamte erbrachte Leistung bis heute netto)
     * @param {Array} previousInvoices - Liste der bisherigen Abschlagsrechnungen [{ netto, sicherheitseinbehalt, ... }]
     * @param {number} securityRetentionRate - Sicherheitseinbehalt in Prozent (z.B. 5.0 für 5% oder 10.0%)
     * @param {number} vatRate - Mehrwertsteuersatz in Prozent (z.B. 19.0)
     * @param {boolean} isReverseCharge - Steuerschuldnerschaft des Leistungsempfängers gem. § 13b UStG
     * @param {string} retentionMode - 'EXECUTION' (Vertragserfüllung max 10% mit Obergrenze max 5% Auftragssumme) | 'WARRANTY' (Gewährleistung 5% Schlussrechnung)
     * @param {number} contractTotalNet - Ursprüngliche Netto-Auftragssumme für Deckelungsberechnung
     * @param {number} maxRetentionRate - Obergrenze in Prozent für Erfüllungssicherheit (Standard 5.0%)
     * @param {number} currentRetentionRate - Laufender Abschlagsabzugssatz (z.B. 10.0%), falls abweichend von securityRetentionRate
     * @returns {Object} Abschlagsrechnungs-Berechnung
     */
    static calculateCumulativeInvoice({
        totalPerformanceNet = 0,
        previousInvoices = [],
        securityRetentionRate = 5.0,
        vatRate = 19.0,
        isReverseCharge = false,
        retentionMode = 'WARRANTY',
        contractTotalNet = 0,
        maxRetentionRate = 5.0,
        currentRetentionRate = null
    }) {
        const __M = __resolveMoney_cbc();
        const R = (v) => __M ? __M.round2(v) : (() => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0; })();
        const P = (base, rate) => __M ? __M.percent(base, rate) : R(parseFloat(base) * parseFloat(rate) / 100);
        // Summe bisheriger Netto-Abschlagsrechnungen (\sum F_i) — sofort gerundet,
        // damit downstream (MwSt, Rückgabe) mit demselben Wert rechnet.
        const totalPreviousBilledNet = R(previousInvoices.reduce((sum, inv) => {
            return sum + (parseFloat(inv.netto) || parseFloat(inv.currentPeriodNet) || parseFloat(inv.kumulierte_leistung_netto) || 0);
        }, 0));

        // Aktuelle Netto-Leistung dieser Periode: F_t = L_t - \sum F_i
        const currentPeriodNet = R(Math.max(0, R(totalPerformanceNet) - totalPreviousBilledNet));

        // Bisher einbehaltene Beträge aus Vorrechnungen ermitteln — sofort gerundet.
        const previousRetentionTotal = R(previousInvoices.reduce((sum, inv) => {
            return sum + (parseFloat(inv.sicherheitseinbehalt) || parseFloat(inv.securityRetentionAmount) || 0);
        }, 0));

        // Bestimmung des anzuwendenden Einbehaltssatzes
        const rate = currentRetentionRate !== null ? (parseFloat(currentRetentionRate) || 0) : (parseFloat(securityRetentionRate) || 0);

        let totalRetentionTarget = 0;
        let isCapped = false;
        let maxRetentionCap = null;
        let vobAHint = null;

        if (retentionMode === 'EXECUTION') {
            // VOB/B § 17 Abs. 6: Vertragserfüllungssicherheit mit Deckelung auf Netto-Auftragssumme
            const contractNet = parseFloat(contractTotalNet) || 0;
            const maxRate = parseFloat(maxRetentionRate) || 5.0;
            maxRetentionCap = contractNet > 0 ? P(contractNet, maxRate) : null;

            const uncappedTarget = P(totalPerformanceNet, rate);
            if (maxRetentionCap !== null && uncappedTarget >= maxRetentionCap) {
                totalRetentionTarget = maxRetentionCap;
                isCapped = true;
            } else {
                totalRetentionTarget = uncappedTarget;
                isCapped = false;
            }

            // VOB/A § 9c Schwellenwert-Check: < 250.000 € Netto-Auftragssumme
            if (contractNet > 0 && contractNet < 250000) {
                vobAHint = 'Gemäß VOB/A § 9c Abs. 2 soll bei einem Netto-Auftragswert unter 250.000 € auf die Vereinbarung einer Vertragserfüllungssicherheit verzichtet werden.';
            }
        } else {
            // Mängelansprüche / Gewährleistungssicherheit (WARRANTY)
            totalRetentionTarget = P(totalPerformanceNet, rate);
        }

        // In dieser Periode verbleibender Einbehaltsabzug:
        const securityRetentionAmount = Math.max(0, R(totalRetentionTarget - previousRetentionTotal));

        // Steuerbare Basis für die aktuelle Periode (EN 16931: Steuer auf gerundetes Perioden-Netto je Satz)
        const taxRate = isReverseCharge ? 0 : vatRate;
        const currentPeriodVat = (__M ? __M.taxFor(currentPeriodNet, taxRate, isReverseCharge) : R(currentPeriodNet * (parseFloat(taxRate) || 0) / 100));
        const currentPeriodGross = R(currentPeriodNet + currentPeriodVat);

        // Zahlbetrag dieser Rechnung nach Abzug des Sicherheitseinbehalts
        const netPayableAmount = Math.max(0, R(currentPeriodGross - securityRetentionAmount));

        return {
            totalPerformanceNet: R(totalPerformanceNet),
            totalPreviousBilledNet: R(totalPreviousBilledNet),
            currentPeriodNet: R(currentPeriodNet),
            netto: R(currentPeriodNet),
            currentPeriodVat,
            currentPeriodGross: R(currentPeriodGross),
            securityRetentionRate: rate,
            retentionMode,
            isCapped,
            maxRetentionCap,
            contractTotalNet: parseFloat(contractTotalNet) || 0,
            totalRetentionTarget: R(totalRetentionTarget),
            previousRetentionTotal: R(previousRetentionTotal),
            securityRetentionAmount: R(securityRetentionAmount),
            sicherheitseinbehalt: R(securityRetentionAmount),
            netPayableAmount: R(netPayableAmount),
            sequenceNumber: previousInvoices.length + 1,
            vobAHint
        };
    }

    /**
     * Berechnet die Frist zur Einzahlung des Bareinbehalts auf ein Sperrkonto nach VOB/B § 17 Abs. 5.
     * Frist: 18 Werktage (Montag bis Samstag, ausgenommen bundesweite gesetzliche Feiertage und Sonntage).
     * @param {string|Date} invoiceDate - Rechnungsdatum
     * @param {number} workingDays - Anzahl der Werktage (Standard 18 nach VOB/B)
     * @returns {Object} Sperrkonto-Fristinformation
     */
    static getEscrowDeadline(invoiceDate, workingDays = 18) {
        let d = invoiceDate ? new Date(invoiceDate) : new Date();
        if (isNaN(d.getTime())) d = new Date();

        let added = 0;
        const targetWorkingDays = Math.max(1, parseInt(workingDays, 10) || 18);

        // Hilfsfunktion zur Feiertagsprüfung (Ostersonntag nach Gauß)
        const isFeiertag = (dateObj) => {
            const y = dateObj.getFullYear();
            const m = dateObj.getMonth();
            const day = dateObj.getDate();

            // Feste Feiertage bundesweit
            if (m === 0 && day === 1) return true; // Neujahr
            if (m === 4 && day === 1) return true; // 1. Mai
            if (m === 9 && day === 3) return true; // Tag d. Dt. Einheit
            if (m === 11 && (day === 25 || day === 26)) return true; // Weihnachten

            // Gaußsche Osterformel
            const a = y % 19, b = Math.floor(y / 100), c = y % 100;
            const dG = Math.floor(b / 4), eG = b % 4, fG = Math.floor((b + 8) / 25);
            const gG = Math.floor((b - fG + 1) / 3), hG = (19 * a + b - dG - gG + 15) % 30;
            const iG = Math.floor(c / 4), kG = c % 4, lG = (32 + 2 * eG + 2 * iG - hG - kG) % 7;
            const mG = Math.floor((a + 11 * hG + 22 * lG) / 451);
            const ostersonntagMonat = Math.floor((hG + lG - 7 * mG + 114) / 31) - 1;
            const ostersonntagTag = ((hG + lG - 7 * mG + 114) % 31) + 1;
            const ostersonntag = new Date(y, ostersonntagMonat, ostersonntagTag, 12, 0, 0);

            const diffDays = Math.round((new Date(y, m, day, 12, 0, 0) - ostersonntag) / 86400000);
            // Karfreitag (-2), Ostermontag (+1), Christi Himmelfahrt (+39), Pfingstmontag (+50)
            return diffDays === -2 || diffDays === 1 || diffDays === 39 || diffDays === 50;
        };

        const current = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);

        while (added < targetWorkingDays) {
            current.setDate(current.getDate() + 1);
            const dayOfWeek = current.getDay();
            // Werktage im Sinne des BGB/VOB sind Mo-Sa (Sonntag = 0 ist arbeitsfrei)
            if (dayOfWeek === 0) continue;
            if (isFeiertag(current)) continue;
            added++;
        }

        const yyyy = current.getFullYear();
        const mm = String(current.getMonth() + 1).padStart(2, '0');
        const dd = String(current.getDate()).padStart(2, '0');
        const escrowDueDate = `${yyyy}-${mm}-${dd}`;

        const today = new Date();
        const todayIso = today.toISOString().split('T')[0];
        const isOverdue = escrowDueDate < todayIso;

        return {
            invoiceDate: invoiceDate instanceof Date ? invoiceDate.toISOString().split('T')[0] : String(invoiceDate).substring(0, 10),
            escrowDueDate,
            workingDays: targetWorkingDays,
            isOverdue,
            legalNotice: 'Gemäß § 17 Abs. 5 VOB/B muss der Auftraggeber den Bareinbehalt binnen 18 Werktagen auf ein gemeinsames Sperrkonto einzahlen.'
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
        warrantyYears = 4, // VOB/B Standard: 4 Jahre Gewährleistung
        invoiceDate = new Date(),
        contractTotalNet = 0
    }) {
        const d = invoiceDate ? new Date(invoiceDate) : new Date();
        const dueDate = new Date(d);

        if (retentionType === 'EXECUTION') {
            // Vertragserfüllungssicherheit wird mit der Abnahme fällig (z.B. vorläufig 1 Jahr oder bis Abnahme)
            dueDate.setFullYear(dueDate.getFullYear() + 1);
        } else {
            // Mängelansprüche / Gewährleistung
            dueDate.setFullYear(dueDate.getFullYear() + warrantyYears);
        }

        const escrow = CumulativeBillingController.getEscrowDeadline(invoiceDate, 18);

        const __M2 = __resolveMoney_cbc();
        const R2 = (v) => __M2 ? __M2.round2(v) : (() => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0; })();
        return {
            projectId,
            invoiceId,
            retentionType,
            amount: R2(amount),
            dueDate: dueDate.toISOString().split('T')[0],
            escrowDueDate: escrow.escrowDueDate,
            escrowStatus: escrow.isOverdue ? 'OVERDUE' : 'PENDING',
            vobParagraph: '§ 17 Abs. 5 VOB/B',
            contractTotalNet: parseFloat(contractTotalNet) || 0,
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
