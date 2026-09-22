/**
 * cumulative_retention_chain.test.js (P0.2-Abnahmetabelle)
 * Auftragssumme netto 1.000 €, 19 % USt, Einbehalt 5 %, Modus EXECUTION, kein §13b.
 * Prüft: EINE Einbehalt-Quelle, Σ Periodeneinbehalte == kumulatives Ziel,
 * Netto + Steuer == Brutto, OPOS-Trennung Leistung/Faktura/Zahlung/Einbehalt.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const InvoiceController = require('../controllers/InvoiceController');
const CumulativeBillingController = require('../controllers/CumulativeBillingController');

const pos = (netto) => [{ menge: 1, preis: netto, mwst: 19 }];
const opts = { sicherheitseinbehaltProzent: 5, retentionMode: 'EXECUTION', contractTotalNet: 1000 };

test('P0.2 Abnahmetabelle: kumulativer Einbehalt ohne Doppelzählung', () => {
    // Abschlag 1: L1 = 100 → Einbehalt 5, Zahlbetrag 114
    const ar1 = InvoiceController.calculateTotals({ positionen: pos(100), ...opts });
    assert.equal(ar1.sicherheitseinbehaltNetto, 5);
    assert.equal(ar1.totalTax, 19);
    assert.equal(ar1.bruttoNachRabatt, 119);
    assert.equal(ar1.zahlbetrag, 114);
    assert.equal(ar1.nettoNachRabatt + ar1.totalTax, ar1.bruttoNachRabatt);

    // Abschlag 2: L2 = 200 kumuliert → Perioden-Einbehalt 5 (kumuliert 10).
    // Übergabe aus gespeicherten Belegen (previousInvoices), nicht Formular-State.
    const ar1Doc = { netto: ar1.nettoNachRabatt, sicherheitseinbehalt: ar1.sicherheitseinbehaltNetto };
    const ar2 = InvoiceController.calculateTotals({
        positionen: pos(100), // Periodenleistung L2 − L1
        ...opts,
        previousInvoices: [ar1Doc],
        totalPerformanceNet: 200
    });
    assert.equal(ar2.previousRetentionTotal, 5);
    assert.equal(ar2.sicherheitseinbehaltNetto, 5, 'Perioden-Einbehalt muss 5 sein (kumuliert 10), Bug wäre 10 auf volle 200');
    assert.equal(ar1.sicherheitseinbehaltNetto + ar2.sicherheitseinbehaltNetto, 10);
    assert.notEqual(ar1.sicherheitseinbehaltNetto + ar2.sicherheitseinbehaltNetto, 15, 'alter Bug (15) darf nicht auftreten');
    assert.equal(ar2.zahlbetrag, 114);
    assert.equal(ar2.nettoNachRabatt + ar2.totalTax, ar2.bruttoNachRabatt);

    // Genehmigter Nachtrag +100 → L3 = 300 → kumuliert 15, Periode 5
    const ar3 = InvoiceController.calculateTotals({
        positionen: pos(100), ...opts,
        previousInvoices: [ar1Doc, { netto: 100, sicherheitseinbehalt: ar2.sicherheitseinbehaltNetto }],
        totalPerformanceNet: 300
    });
    assert.equal(ar3.sicherheitseinbehaltNetto, 5);
    assert.equal(ar3.previousRetentionTotal, 10);

    // CumulativeBillingController als gleiche Quelle: identisches Ziel
    const cum = CumulativeBillingController.calculateCumulativeInvoice({
        totalPerformanceNet: 200,
        previousInvoices: [{ netto: 100, sicherheitseinbehalt: 5 }],
        securityRetentionRate: 5, vatRate: 19, retentionMode: 'EXECUTION',
        contractTotalNet: 1000, maxRetentionRate: 5.0
    });
    assert.equal(cum.totalRetentionTarget, 10);
    assert.equal(cum.securityRetentionAmount, 5);
    assert.equal(cum.securityRetentionAmount, ar2.sicherheitseinbehaltNetto);
});

test('P0.2 OPOS: Faktura/Zahlung/Einbehalt getrennt, kein Doppelzähler', () => {
    const ar1 = { zahlbetrag: 114, sicherheitseinbehalt: 5 };
    const ar2 = { zahlbetrag: 114, sicherheitseinbehalt: 5 };
    const bal = InvoiceController.computeProjectBalance({ invoices: [ar1, ar2], paymentsTotal: 50, releasedRetentionTotal: 0 });
    assert.equal(bal.fakturiert, 228);
    assert.equal(bal.offenerSaldo, 178); // 228 − 50 − 0
    assert.equal(bal.einbehaltenOffen, 10);
    // SAL-1 (B-8): Bei Freigabe von 10 wird der Einbehalt fällig: faelligeForderung = 228 + 10 = 238
    const nachFreigabeOffen = InvoiceController.computeProjectBalance({ invoices: [ar1, ar2], paymentsTotal: 228, releasedRetentionTotal: 10 });
    assert.equal(nachFreigabeOffen.faelligeForderung, 238);
    assert.equal(nachFreigabeOffen.offenerSaldo, 10, 'Nach Freigabe ohne Zahlung des Einbehalts verbleiben 10 € offener Saldo');
    assert.equal(nachFreigabeOffen.einbehaltenOffen, 0);

    const nachVollzahlung = InvoiceController.computeProjectBalance({ invoices: [ar1, ar2], paymentsTotal: 238, releasedRetentionTotal: 10 });
    assert.equal(nachVollzahlung.offenerSaldo, 0, 'Nach vollständiger Begleichung inkl. freigegebenem Einbehalt ist Saldo 0');
});

test('P0.2 Steuer trotz Einbehalt auf vollem Netto (§13 UStG)', () => {
    const r = InvoiceController.calculateTotals({ positionen: pos(100), ...opts });
    assert.equal(r.totalTax, 19, 'Einbehalt mindert NICHT die Steuer');
});

test('P0.2 EXECUTION-Deckel + VOB/A-Hinweis genau einmal', () => {
    const r = InvoiceController.calculateTotals({ positionen: pos(100000), ...opts });
    assert.equal(r.isCapped, true);
    assert.equal(r.maxRetentionCap, 50); // 5 % von 1000
    assert.match(r.vobAHint || '', /VOB\/A/);
});
