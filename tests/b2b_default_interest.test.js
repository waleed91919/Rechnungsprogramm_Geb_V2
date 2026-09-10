const { describe, it } = require('node:test');
const assert = require('node:assert');
const BankingController = require('../controllers/BankingController');

describe('B2B-Verzugszinsen & 40-€-Pauschale (§ 288 BGB & § 16 VOB/B)', () => {
    it('1. B2B-Verzugszinssatz ist Basiszinssatz + 9 Prozentpunkte', () => {
        const baseRate = 3.37;
        const resB2B = BankingController.calculateDefaultInterest({
            amount: 10000.00,
            dueDate: '2026-08-01',
            paymentDate: '2026-08-31', // 30 Verzugstage
            isB2B: true,
            baseRate
        });

        // 3.37 + 9.00 = 12.37 %
        assert.strictEqual(resB2B.appliedInterestRate, 12.37);
        assert.strictEqual(resB2B.daysOverdue, 30);
        // Zinsen: 10.000 * 0.1237 * (30 / 360) = 103.0833 -> 103.08 €
        assert.strictEqual(resB2B.interestAmount, 103.08);

        const resB2C = BankingController.calculateDefaultInterest({
            amount: 10000.00,
            dueDate: '2026-08-01',
            paymentDate: '2026-08-31',
            isB2B: false,
            baseRate
        });

        // 3.37 + 5.00 = 8.37 %
        assert.strictEqual(resB2C.appliedInterestRate, 8.37);
        // Zinsen: 10.000 * 0.0837 * (30 / 360) = 69.75 €
        assert.strictEqual(resB2C.interestAmount, 69.75);
    });

    it('2. Gesetzliche 40-€-Pauschale nach § 288 Abs. 5 BGB greift nur bei B2B im Verzug', () => {
        assert.strictEqual(BankingController.calculateLatePaymentFee(true, true), 40.00, 'B2B im Verzug muss 40 € liefern');
        assert.strictEqual(BankingController.calculateLatePaymentFee(true, false), 0.00, 'B2B nicht im Verzug muss 0 € liefern');
        assert.strictEqual(BankingController.calculateLatePaymentFee(false, true), 0.00, 'B2C im Verzug darf keine 40 € Pauschale erhalten');
        assert.strictEqual(BankingController.calculateLatePaymentFee(false, false), 0.00);
    });

    it('3. calculateMahnungClaims aggregiert Forderungen, Zinsen und Pauschalen', () => {
        const invoices = [
            {
                id: 1,
                nr: 'RE-2026-001',
                offen: 5000.00,
                faellig: '2026-08-01',
                customer_type: 'B2B'
            },
            {
                id: 2,
                nr: 'RE-2026-002',
                offen: 3000.00,
                faellig: '2026-08-16',
                customer_type: 'B2B'
            }
        ];

        const calc = BankingController.calculateMahnungClaims({
            invoices,
            calculationDate: '2026-08-31',
            baseRate: 3.37,
            mahngebuehrJeRechnung: 5.00
        });

        assert.strictEqual(calc.totalPrincipal, 8000.00);
        // RE 1: 30 Tage, RE 2: 15 Tage
        // Pauschalen: 2 x 40.00 € = 80.00 €
        assert.strictEqual(calc.totalLateFee, 80.00);
        // Mahngebühr: 2 x 5.00 € = 10.00 €
        assert.strictEqual(calc.totalMahngebuehr, 10.00);
        assert.ok(calc.totalInterest > 0, 'Verzugszinsen müssen berechnet worden sein');
        assert.strictEqual(calc.totalClaim, Math.round((calc.totalPrincipal + calc.totalInterest + calc.totalLateFee + calc.totalMahngebuehr) * 100) / 100);
    });
});
