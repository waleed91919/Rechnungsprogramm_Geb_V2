const test = require('node:test');
const assert = require('node:assert');
const InvoiceController = require('../controllers/InvoiceController');
const utils = require('../js/utils');

test('=== TEST SUITE: DEUTSCHES DATUMS- UND ARBEITSTAGE-SYSTEM ===', async (t) => {

    await t.test('1. Datumsnormalisierung & Deutsches Format (DD.MM.YYYY)', () => {
        // InvoiceController
        assert.strictEqual(InvoiceController.normalizeDateISO('2026-09-05'), '2026-09-05');
        assert.strictEqual(InvoiceController.normalizeDateISO('05.09.2026'), '2026-09-05');
        assert.strictEqual(InvoiceController.normalizeDateISO('5.9.2026'), '2026-09-05');
        assert.strictEqual(InvoiceController.formatDateDE('2026-09-05'), '05.09.2026');
        assert.strictEqual(InvoiceController.formatDateDEWithWeekday('2026-09-05'), '05.09.2026 (Samstag)');
        assert.strictEqual(InvoiceController.formatDateDEWithWeekday('2026-09-07'), '07.09.2026 (Montag)');

        // utils
        assert.strictEqual(utils.formatDateISO('2026-09-05'), '2026-09-05');
        assert.strictEqual(utils.formatDateISO('05.09.2026'), '2026-09-05');
        assert.strictEqual(utils.formatDateDE('2026-09-05'), '05.09.2026');
        assert.strictEqual(utils.formatDateDEWithWeekday('2026-09-05'), '05.09.2026 (Samstag)');
    });

    await t.test('2. Bundesweite gesetzliche Feiertage Deutschland 2026', () => {
        const holidays2026 = InvoiceController.getGermanHolidaysMap(2026);
        
        // Feste Feiertage
        assert.strictEqual(holidays2026.get('2026-01-01'), 'Neujahr');
        assert.strictEqual(holidays2026.get('2026-05-01'), 'Tag der Arbeit');
        assert.strictEqual(holidays2026.get('2026-10-03'), 'Tag der Deutschen Einheit');
        assert.strictEqual(holidays2026.get('2026-12-25'), '1. Weihnachtsfeiertag');
        assert.strictEqual(holidays2026.get('2026-12-26'), '2. Weihnachtsfeiertag');

        // Bewegliche Osterfeiertage 2026 (Ostern ist der 05.04.2026)
        assert.strictEqual(holidays2026.get('2026-04-03'), 'Karfreitag');
        assert.strictEqual(holidays2026.get('2026-04-06'), 'Ostermontag');
        assert.strictEqual(holidays2026.get('2026-05-14'), 'Christi Himmelfahrt');
        assert.strictEqual(holidays2026.get('2026-05-25'), 'Pfingstmontag');

        // Prüfung via isGermanPublicHoliday
        assert.strictEqual(InvoiceController.isGermanPublicHoliday('2026-04-03').isHoliday, true);
        assert.strictEqual(InvoiceController.isGermanPublicHoliday('2026-04-03').name, 'Karfreitag');
        assert.strictEqual(InvoiceController.isGermanPublicHoliday('2026-09-07').isHoliday, false);
        assert.strictEqual(InvoiceController.isGermanPublicHoliday('2026-09-07').name, null);
    });

    await t.test('3. Arbeitstage-Prüfung (isArbeitstag)', () => {
        // Samstag und Sonntag sind keine Arbeitstage
        assert.strictEqual(InvoiceController.isArbeitstag('2026-09-05'), false, 'Samstag darf kein Arbeitstag sein');
        assert.strictEqual(InvoiceController.isArbeitstag('2026-09-06'), false, 'Sonntag darf kein Arbeitstag sein');
        
        // Regulärer Werktag (Montag)
        assert.strictEqual(InvoiceController.isArbeitstag('2026-09-07'), true, 'Montag ist ein Arbeitstag');

        // Feiertage, die auf Wochentage fallen, sind keine Arbeitstage
        assert.strictEqual(InvoiceController.isArbeitstag('2026-05-01'), false, '1. Mai (Freitag) ist Feiertag');
        assert.strictEqual(InvoiceController.isArbeitstag('2026-04-06'), false, 'Ostermontag ist Feiertag');
        assert.strictEqual(InvoiceController.isArbeitstag('2026-05-14'), false, 'Christi Himmelfahrt (Donnerstag) ist Feiertag');
    });

    await t.test('4. Fälligkeitsberechnung mit Netto-Arbeitstagen (VOB/BGB § 193)', () => {
        // 1 Arbeitstag ab Freitag 04.09.2026 springt über Sa/So auf Montag 07.09.2026
        const nextWorkDay = InvoiceController.calculateDueDateWorkingDays('2026-09-04', 1);
        assert.strictEqual(nextWorkDay, '2026-09-07');

        // 1 Arbeitstag vor Ostern: Do 02.04.2026 -> Karfreitag (03.04.), Sa, So, Ostermontag (06.04.) überspringen -> Di 07.04.2026!
        const postEaster = InvoiceController.calculateDueDateWorkingDays('2026-04-02', 1);
        assert.strictEqual(postEaster, '2026-04-07', 'Muss Karfreitag und Ostermontag komplett überspringen');

        // 14 Standard-Arbeitstage ab Sa 05.09.2026
        // Mo-Fr (Woche 1): 5 AT -> 11.09.
        // Mo-Fr (Woche 2): 5 AT -> 18.09. (gesamt 10)
        // Mo-Do (Woche 3): 4 AT -> 24.09. (gesamt 14)
        const due14 = InvoiceController.calculateDueDateWorkingDays('2026-09-05', 14);
        assert.strictEqual(due14, '2026-09-24');

        // Rückrechnung / Zählung der Arbeitstage
        const count = InvoiceController.countWorkingDaysBetween('2026-09-05', '2026-09-24');
        assert.strictEqual(count, 14);
    });

    await t.test('5. Speichervalidierung & automatische Datumsnormalisierung', () => {
        const testDoc = {
            kundeId: 1,
            nr: 'INV-2026-TEST',
            datum: '05.09.2026', // deutsches Format eingegeben
            faellig: '24.09.2026',
            customer_type: 'B2B',
            eingabemodus: 'netto',
            positionen: [{ name: 'Test Position', menge: 1, einheit: 'Stk', preis: 100, mwst: 19 }]
        };

        const result = InvoiceController.validateSaveDocument(testDoc);
        assert.strictEqual(result.valid, true);
        assert.strictEqual(testDoc.datum, '2026-09-05', 'Datum muss ins ISO-Format normalisiert werden');
        assert.strictEqual(testDoc.faellig, '2026-09-24', 'Fälligkeit muss ins ISO-Format normalisiert werden');
    });

});
