const { describe, it } = require('node:test');
const assert = require('node:assert');
const CumulativeBillingController = require('../controllers/CumulativeBillingController');
const InvoiceController = require('../controllers/InvoiceController');

describe('VOB/B § 17 & VOB/A § 9c Sicherheitseinbehalte & Fristenradar', () => {
    it('1. Vertragserfüllungssicherheit (EXECUTION): 10% laufender Abzug wird bei 5% der Auftragssumme gedeckelt', () => {
        const contractTotalNet = 100000.00; // 100.000 € Netto-Auftragssumme
        // Max. Deckelung bei 5% = 5.000 €

        // 1. Abschlagsrechnung: Leistung 30.000 €
        // Laufender Einbehalt 10% von 30.000 € = 3.000 € (unter dem Cap von 5.000 €)
        const ar1 = CumulativeBillingController.calculateCumulativeInvoice({
            totalPerformanceNet: 30000.00,
            previousInvoices: [],
            securityRetentionRate: 10.0,
            retentionMode: 'EXECUTION',
            contractTotalNet,
            maxRetentionRate: 5.0
        });

        assert.strictEqual(ar1.currentPeriodNet, 30000.00);
        assert.strictEqual(ar1.securityRetentionAmount, 3000.00);
        assert.strictEqual(ar1.totalRetentionTarget, 3000.00);
        assert.strictEqual(ar1.isCapped, false);
        assert.strictEqual(ar1.maxRetentionCap, 5000.00);

        // 2. Abschlagsrechnung: Kumulierte Leistung 80.000 €
        // 10% von 80.000 € wäre 8.000 €, Cap greift bei 5.000 €!
        // Vorher einbehalten: 3.000 €. Verbleibender Abzug: 5.000 € - 3.000 € = 2.000 €
        const ar2 = CumulativeBillingController.calculateCumulativeInvoice({
            totalPerformanceNet: 80000.00,
            previousInvoices: [ar1],
            securityRetentionRate: 10.0,
            retentionMode: 'EXECUTION',
            contractTotalNet,
            maxRetentionRate: 5.0
        });

        assert.strictEqual(ar2.currentPeriodNet, 50000.00);
        assert.strictEqual(ar2.totalRetentionTarget, 5000.00, 'Solleinbehalt muss auf max 5.000 € gedeckelt sein');
        assert.strictEqual(ar2.securityRetentionAmount, 2000.00, 'In Periode 2 dürfen nur noch 2.000 € bis zum Cap abgezogen werden');
        assert.strictEqual(ar2.isCapped, true, 'Deckelung muss aktiv sein');

        // 3. Abschlagsrechnung: Kumulierte Leistung 100.000 €
        // Cap von 5.000 € bereits voll erreicht. Abzug in AR 3 = 0 €!
        const ar3 = CumulativeBillingController.calculateCumulativeInvoice({
            totalPerformanceNet: 100000.00,
            previousInvoices: [ar1, ar2],
            securityRetentionRate: 10.0,
            retentionMode: 'EXECUTION',
            contractTotalNet,
            maxRetentionRate: 5.0
        });

        assert.strictEqual(ar3.securityRetentionAmount, 0.00, 'Nach Erreichen der Obergrenze darf kein weiterer Einbehalt erfolgen');
        assert.strictEqual(ar3.isCapped, true);
    });

    it('2. VOB/A § 9c Schwellenwert-Hinweis bei Auftragswert < 250.000 €', () => {
        const ar = CumulativeBillingController.calculateCumulativeInvoice({
            totalPerformanceNet: 50000.00,
            previousInvoices: [],
            securityRetentionRate: 10.0,
            retentionMode: 'EXECUTION',
            contractTotalNet: 120000.00, // < 250.000 €
            maxRetentionRate: 5.0
        });

        assert.ok(ar.vobAHint, 'Muss VOB/A 9c Hinweis enthalten');
        assert.ok(ar.vobAHint.includes('250.000'), 'Hinweis muss 250.000 € Schwellenwert nennen');

        // Bei Auftragswert >= 250.000 € darf kein VOB/A 9c Warnhinweis erscheinen
        const arGross = CumulativeBillingController.calculateCumulativeInvoice({
            totalPerformanceNet: 100000.00,
            previousInvoices: [],
            securityRetentionRate: 10.0,
            retentionMode: 'EXECUTION',
            contractTotalNet: 350000.00, // >= 250.000 €
            maxRetentionRate: 5.0
        });
        assert.strictEqual(arGross.vobAHint, null);
    });

    it('3. Gewährleistungssicherheit (WARRANTY) behält 5% ohne Cap', () => {
        const schlussrechnung = CumulativeBillingController.calculateCumulativeInvoice({
            totalPerformanceNet: 150000.00,
            previousInvoices: [{ netto: 100000, sicherheitseinbehalt: 0 }],
            securityRetentionRate: 5.0,
            retentionMode: 'WARRANTY'
        });

        assert.strictEqual(schlussrechnung.totalRetentionTarget, 7500.00); // 5% von 150.000 €
        assert.strictEqual(schlussrechnung.securityRetentionAmount, 7500.00);
        assert.strictEqual(schlussrechnung.isCapped, false);
    });

    it('4. Sperrkonto-Fristenradar nach VOB/B § 17 Abs. 5 (18 Werktage Frist)', () => {
        const testDate = '2026-10-01'; // Donnerstag
        const deadlineInfo = CumulativeBillingController.getEscrowDeadline(testDate, 18);

        assert.strictEqual(deadlineInfo.workingDays, 18);
        assert.ok(deadlineInfo.escrowDueDate > testDate, 'Fristdatum muss nach Rechnungsdatum liegen');
        assert.ok(deadlineInfo.legalNotice.includes('18 Werktagen'), 'Hinweis muss 18 Werktage nennen');

        const entry = CumulativeBillingController.createSecurityRetentionEntry({
            projectId: 42,
            invoiceId: 101,
            amount: 5000.00,
            retentionType: 'EXECUTION',
            invoiceDate: '2026-10-01'
        });

        assert.strictEqual(entry.vobParagraph, '§ 17 Abs. 5 VOB/B');
        assert.ok(entry.escrowDueDate, 'Muss Sperrkonto-Fristdatum enthalten');
        assert.strictEqual(entry.retentionType, 'EXECUTION');
    });

    it('5. InvoiceController.calculateTotals unterstützt Deckelung und VOB/A 9c', () => {
        const res = InvoiceController.calculateTotals({
            positionen: [
                { menge: 1, preis: 80000.00, mwst: 19 }
            ],
            mode: 'netto',
            sicherheitseinbehaltProzent: 10.0,
            retentionMode: 'EXECUTION',
            contractTotalNet: 100000.00,
            maxRetentionRate: 5.0
        });

        // 10% von 80.000 = 8.000 €, aber Cap auf 5% von 100.000 € = 5.000 €
        assert.strictEqual(res.sicherheitseinbehaltNetto, 5000.00);
        assert.strictEqual(res.isCapped, true);
        assert.strictEqual(res.maxRetentionCap, 5000.00);
        assert.ok(res.vobAHint.includes('250.000'));
    });
});
