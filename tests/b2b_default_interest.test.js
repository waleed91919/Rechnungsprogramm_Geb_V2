const { describe, it } = require('node:test');
const assert = require('node:assert');
const BankingController = require('../controllers/BankingController');

describe('B2B-Verzugszinsen & 40-€-Pauschale (§ 288 BGB & § 16 VOB/B)', () => {
    it('1. Bundesbank-Basiszins 1,52% seit 01.07.2026 (B2B: 10,52%, B2C: 6,52%)', () => {
        // Standardmäßig ohne Angabe von baseRate greift ab 01.07.2026 der aktuelle Satz 1.52%
        const resB2B = BankingController.calculateDefaultInterest({
            amount: 10000.00,
            dueDate: '2026-08-01',
            paymentDate: '2026-08-31', // 30 Verzugstage
            isB2B: true
        });

        // 1.52 + 9.00 = 10.52 %
        assert.strictEqual(resB2B.baseRate, 1.52);
        assert.strictEqual(resB2B.appliedInterestRate, 10.52);
        assert.strictEqual(resB2B.daysOverdue, 30);
        // Zinsen: 10.000 * 0.1052 * (30 / 360) = 87.666... -> 87.67 €
        assert.strictEqual(resB2B.interestAmount, 87.67);

        const resB2C = BankingController.calculateDefaultInterest({
            amount: 10000.00,
            dueDate: '2026-08-01',
            paymentDate: '2026-08-31',
            isB2B: false
        });

        // 1.52 + 5.00 = 6.52 %
        assert.strictEqual(resB2C.baseRate, 1.52);
        assert.strictEqual(resB2C.appliedInterestRate, 6.52);
        // Zinsen: 10.000 * 0.0652 * (30 / 360) = 54.333... -> 54.33 €
        assert.strictEqual(resB2C.interestAmount, 54.33);
    });

    it('2. Historische Bundesbank-Zinstabelle liefert korrekte Stichtagssätze', () => {
        // bis 30.06.2024: 3.62%
        assert.strictEqual(BankingController.getBaseRateForDate('2024-06-15'), 3.62);
        assert.strictEqual(BankingController.getBaseRateForDate('2024-06-30'), 3.62);

        // 01.07.2024 - 31.12.2024: 3.37%
        assert.strictEqual(BankingController.getBaseRateForDate('2024-07-01'), 3.37);
        assert.strictEqual(BankingController.getBaseRateForDate('2024-12-31'), 3.37);

        // 01.01.2025 - 30.06.2025: 2.27%
        assert.strictEqual(BankingController.getBaseRateForDate('2025-01-01'), 2.27);
        assert.strictEqual(BankingController.getBaseRateForDate('2025-06-30'), 2.27);

        // 01.07.2025 - 30.06.2026: 1.27%
        assert.strictEqual(BankingController.getBaseRateForDate('2025-07-01'), 1.27);
        assert.strictEqual(BankingController.getBaseRateForDate('2025-12-31'), 1.27);
        assert.strictEqual(BankingController.getBaseRateForDate('2026-01-01'), 1.27);
        assert.strictEqual(BankingController.getBaseRateForDate('2026-05-15'), 1.27);
        assert.strictEqual(BankingController.getBaseRateForDate('2026-06-30'), 1.27);

        // ab 01.07.2026: 1.52% (aktueller Basiszins)
        assert.strictEqual(BankingController.getBaseRateForDate('2026-07-01'), 1.52);
        assert.strictEqual(BankingController.getBaseRateForDate('2026-09-24'), 1.52);

        // Default ohne Datum liefert aktuellen Satz
        assert.strictEqual(BankingController.getBaseRateForDate(), 1.52);
    });

    it('3. Stichtagsbezogene Zinsberechnung anhand Rechnungs-/Verzugszeitraum', () => {
        // Rechnung aus 1. Halbjahr 2026 (Basiszins 1.27%)
        const resH1 = BankingController.calculateDefaultInterest({
            amount: 5000.00,
            dueDate: '2026-05-01',
            paymentDate: '2026-05-31',
            isB2B: true
        });
        // 1.27 + 9.00 = 10.27%
        assert.strictEqual(resH1.baseRate, 1.27);
        assert.strictEqual(resH1.appliedInterestRate, 10.27);
        // 5000 * 0.1027 * (30 / 360) = 42.7916... -> 42.79 €
        assert.strictEqual(resH1.interestAmount, 42.79);

        // Periodenübergreifende Berechnung mit splitPeriods
        const resSplit = BankingController.calculateDefaultInterest({
            amount: 10000.00,
            dueDate: '2026-06-20',
            paymentDate: '2026-07-10', // 20 Verzugstage: 10 Tage in H1 (1.27%), 10 Tage in H2 (1.52%)
            isB2B: true,
            splitPeriods: true
        });
        assert.strictEqual(resSplit.daysOverdue, 20);
        assert.ok(Array.isArray(resSplit.periods), 'Muss Periodenaufteilung enthalten');
        assert.strictEqual(resSplit.periods.length, 2);
        assert.strictEqual(resSplit.periods[0].baseRate, 1.27);
        assert.strictEqual(resSplit.periods[1].baseRate, 1.52);
        assert.ok(resSplit.interestAmount > 0);
    });

    it('4. Gesetzliche 40-€-Pauschale nach § 288 Abs. 5 BGB greift nur bei B2B im Verzug', () => {
        assert.strictEqual(BankingController.calculateLatePaymentFee(true, true), 40.00, 'B2B im Verzug muss 40 € liefern');
        assert.strictEqual(BankingController.calculateLatePaymentFee(true, false), 0.00, 'B2B nicht im Verzug muss 0 € liefern');
        assert.strictEqual(BankingController.calculateLatePaymentFee(false, true), 0.00, 'B2C im Verzug darf keine 40 € Pauschale erhalten');
        assert.strictEqual(BankingController.calculateLatePaymentFee(false, false), 0.00);
    });

    it('5. K2-5: Trennung zwischen Fälligkeit und Verzug (Zahlungserinnerung vs. Mahnwesen)', () => {
        // Rechnung 1: Seit 30 Tagen fällig -> Verzug nach § 286 Abs. 3 BGB
        // Rechnung 2: Erst seit 10 Tagen fällig ohne Mahnung -> nur FÄLLIG (Zahlungserinnerung, KEIN Verzug)
        // Rechnung 3: Seit 10 Tagen fällig, aber explizit gemahnt -> VERZUG gem. § 286 Abs. 1 BGB
        const invoices = [
            {
                id: 1,
                nr: 'RE-2026-001',
                offen: 5000.00,
                datum: '2026-07-25',
                faellig: '2026-08-01',
                customer_type: 'B2B'
            },
            {
                id: 2,
                nr: 'RE-2026-002',
                offen: 3000.00,
                datum: '2026-08-10',
                faellig: '2026-08-20',
                customer_type: 'B2B'
                // Keine Mahnung, < 30 Tage -> Status FAELLIG
            },
            {
                id: 3,
                nr: 'RE-2026-003',
                offen: 2000.00,
                datum: '2026-08-10',
                faellig: '2026-08-20',
                customer_type: 'B2B',
                gemahnt_am: '2026-08-22' // Gemahnt nach Fälligkeit -> Status VERZUG
            }
        ];

        const calc = BankingController.calculateMahnungClaims({
            invoices,
            calculationDate: '2026-08-31',
            mahngebuehrJeRechnung: 5.00
        });

        assert.strictEqual(calc.totalPrincipal, 10000.00);

        // RE 1: Verzug (30-Tage-Regel)
        assert.strictEqual(calc.invoices[0].status, 'VERZUG');
        assert.strictEqual(calc.invoices[0].lateFee, 40.00);
        assert.strictEqual(calc.invoices[0].mahngebuehr, 5.00);
        assert.ok(calc.invoices[0].interestAmount > 0);

        // RE 2: Nur fällig (11 Tage über Fälligkeit, keine Mahnung, < 30 Tage)
        assert.strictEqual(calc.invoices[1].status, 'FAELLIG');
        assert.strictEqual(calc.invoices[1].isInDefault, false);
        assert.strictEqual(calc.invoices[1].lateFee, 0.00, 'Keine 40 € Pauschale bei bloßer Fälligkeit');
        assert.strictEqual(calc.invoices[1].interestAmount, 0.00, 'Keine Zinsen bei bloßer Fälligkeit');
        assert.strictEqual(calc.invoices[1].mahngebuehr, 0.00);

        // RE 3: Verzug durch Mahnung
        assert.strictEqual(calc.invoices[2].status, 'VERZUG');
        assert.strictEqual(calc.invoices[2].lateFee, 40.00);
        assert.strictEqual(calc.invoices[2].mahngebuehr, 5.00);
        assert.ok(calc.invoices[2].interestAmount > 0);

        // Aggregation: Nur 2 Rechnungen im Verzug (RE 1 & RE 3)
        assert.strictEqual(calc.totalLateFee, 80.00); // 2 x 40.00 €
        assert.strictEqual(calc.totalMahngebuehr, 10.00); // 2 x 5.00 €
        assert.strictEqual(calc.totalClaim, Math.round((calc.totalPrincipal + calc.totalInterest + calc.totalLateFee + calc.totalMahngebuehr) * 100) / 100);
    });

    it('6. VOB/B-Fälligkeits-Hilfsfunktionen (§ 16 VOB/B)', () => {
        // Fristen
        assert.strictEqual(BankingController.getVobPaymentTermDays('ABSCHLAG'), 21, 'Abschlag: 21 Kalendertage gem. § 16 Abs. 1 Nr. 3 VOB/B');
        assert.strictEqual(BankingController.getVobPaymentTermDays('SCHLUSSRECHNUNG'), 30, 'Schlussrechnung: 30 Kalendertage gem. § 16 Abs. 3 Nr. 1 VOB/B');

        // Fälligkeitsdaten
        const dueAbschlag = BankingController.calculateVobDueDate('2026-09-01', 'ABSCHLAG');
        assert.strictEqual(dueAbschlag, '2026-09-22', '01.09 + 21 Tage = 22.09.2026');

        const dueSchluss = BankingController.calculateVobDueDate('2026-09-01', 'SCHLUSSRECHNUNG');
        assert.strictEqual(dueSchluss, '2026-10-01', '01.09 + 30 Tage = 01.10.2026');

        // Maximal 60 Kalendertage zulässig
        const dueCustomMax = BankingController.calculateVobDueDate('2026-09-01', 'ABSCHLAG', 90);
        const expected60 = new Date('2026-09-01T00:00:00Z');
        expected60.setUTCDate(expected60.getUTCDate() + 60);
        assert.strictEqual(dueCustomMax, expected60.toISOString().split('T')[0], 'Frist muss auf maximal 60 Tage gedeckelt sein');
    });

    it('7. P1-6: B2C-Verzugshinweis gem. § 286 Abs. 3 Satz 1 Halbsatz 2 BGB', () => {
        // Fall A: B2C-Rechnung nach 35 Tagen OHNE Verzugshinweis
        // Bleibt FAELLIG, gerät NICHT automatisch nach 30 Tagen in Verzug!
        const invB2COhneHinweis = {
            id: 10,
            nr: 'RE-B2C-001',
            offen: 1500.00,
            datum: '2026-07-01',
            faellig: '2026-07-15',
            customer_type: 'B2C'
            // kein hat_verzugshinweis gesetzt
        };

        const statusOhne = BankingController.checkInvoiceDefaultStatus(invB2COhneHinweis, '2026-08-20'); // 36 Tage nach Fälligkeit
        assert.strictEqual(statusOhne.isDue, true, 'Rechnung ist über Fälligkeit hinaus');
        assert.strictEqual(statusOhne.isInDefault, false, 'B2C ohne Verzugshinweis darf NICHT in Verzug geraten (§ 286 Abs. 3 Satz 1 Halbsatz 2 BGB)');
        assert.strictEqual(statusOhne.status, 'FAELLIG', 'Status muss FAELLIG bleiben');
        assert.strictEqual(statusOhne.daysInDefault, 0);

        // Fall B: B2C-Rechnung MIT ausdrücklichem Verzugshinweis
        // Gerät nach 30 Tagen in Verzug gem. § 286 Abs. 3 BGB
        const invB2CMitHinweis = {
            id: 11,
            nr: 'RE-B2C-002',
            offen: 1500.00,
            datum: '2026-07-01',
            faellig: '2026-07-15',
            customer_type: 'B2C',
            hat_verzugshinweis: true
        };

        const statusMit = BankingController.checkInvoiceDefaultStatus(invB2CMitHinweis, '2026-08-20');
        assert.strictEqual(statusMit.isDue, true);
        assert.strictEqual(statusMit.isInDefault, true, 'B2C mit Verzugshinweis gerät nach 30 Tagen in Verzug');
        assert.strictEqual(statusMit.status, 'VERZUG');
        assert.strictEqual(statusMit.daysInDefault, 6); // 36 - 30 = 6 Verzugstage

        // Fall C: B2C vor Ablauf von 30 Tagen mit Hinweis
        const statusMit17Tage = BankingController.checkInvoiceDefaultStatus(invB2CMitHinweis, '2026-08-01'); // 17 Tage nach Fälligkeit
        assert.strictEqual(statusMit17Tage.isDue, true);
        assert.strictEqual(statusMit17Tage.isInDefault, false, 'Vor 30 Tagen noch kein Verzug ohne Mahnung');
        assert.strictEqual(statusMit17Tage.status, 'FAELLIG');
    });
});

