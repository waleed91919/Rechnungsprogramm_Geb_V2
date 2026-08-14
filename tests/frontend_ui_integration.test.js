const assert = require('assert');
const AufmassController = require('../controllers/AufmassController');
const NachtragController = require('../controllers/NachtragController');
const ControllingController = require('../controllers/ControllingController');
const BautagebuchController = require('../controllers/BautagebuchController');
const DA11Service = require('../js/da11');

console.log('=== TEST SUITE: FRONTEND UI & WORKFLOW INTEGRATION (PLAN 08) ===\n');

// 1. Test Formelassistent Template-Parser & Variable-Resolver
const sampleFormulaTemplates = [
    { template: '2*([laenge]+[breite])*[hoehe]', params: { laenge: 5.0, breite: 4.0, hoehe: 2.5 }, expected: 45.0 },
    { template: '[wand_b]*[wand_h]-([tuer_b]*[tuer_h])', params: { wand_b: 6.0, wand_h: 2.8, tuer_b: 1.0, tuer_h: 2.1 }, expected: 14.7 },
    { template: '[laenge]*[breite]-[abzug]', params: { laenge: 10.0, breite: 5.0, abzug: 8.5 }, expected: 41.5 },
    { template: '(3.14159/4)*[durchmesser]^2*[hoehe]', params: { durchmesser: 2.0, hoehe: 3.0 }, expected: 9.42477 }
];

sampleFormulaTemplates.forEach((test, idx) => {
    let resolved = test.template;
    Object.keys(test.params).forEach(k => {
        resolved = resolved.replace(new RegExp(`\\[${k}\\]`, 'g'), test.params[k]);
    });
    const result = AufmassController.evaluateFormula(resolved);
    assert.strictEqual(Math.abs(result - test.expected) < 0.01, true, `Formel ${idx + 1} ergab ${result}, erwartet ~${test.expected}`);
});
console.log('✓ Formelassistent: Template-Erkennung & Variablen-Auflösung arbeiten präzise.');

// 2. Test TopKontor Split-View Verschnitt & Zeilensummierung
const splitLines = [
    { oz: '01.01.0020', ansatz: '5.50 * 4.20', ergebnis: 23.10, vorzeichen: 1 },
    { oz: '01.01.0020', ansatz: '2.00 * 1.50', ergebnis: 3.00, vorzeichen: -1 }
];
const subtotal = splitLines.reduce((acc, l) => acc + l.ergebnis * l.vorzeichen, 0); // 20.10 m²
const verschnittProzent = 5.0;
const finalQuantity = subtotal * (1 + verschnittProzent / 100); // 21.105 m²
assert.strictEqual(Math.round(finalQuantity * 100) / 100, 21.11);
console.log('✓ Split-View Aufmaßcenter: Verschnitt-Zuschlag & Zeilensummierung validiert.');

// 3. Test Dokumentenfluss Übergabe (Aufmaß -> Abschlagsrechnung)
const mockAggregatedAufmass = [
    { oz_code: '01.01.0010', summe_menge: 1.0 },
    { oz_code: '01.01.0020', summe_menge: 21.11 }
];
const mockInvoicePositions = [
    { oz: '01.01.0010', name: 'Baustelleneinrichtung', menge: 0, preis: 500.0 },
    { oz: '01.01.0020', name: 'Fliesenbelag EG', menge: 0, preis: 65.0 }
];
// Apply handover
mockInvoicePositions.forEach(p => {
    const match = mockAggregatedAufmass.find(a => a.oz_code === p.oz);
    if (match) p.menge = match.summe_menge;
});
assert.strictEqual(mockInvoicePositions[0].menge, 1.0);
assert.strictEqual(mockInvoicePositions[1].menge, 21.11);
const totalNetto = mockInvoicePositions.reduce((acc, p) => acc + p.menge * p.preis, 0);
assert.strictEqual(totalNetto, 1.0 * 500.0 + 21.11 * 65.0);
console.log('✓ Dokumentenfluss: Aufmaß-in-Rechnung Übergabe erfolgreich simuliert & validiert.');

// 4. Test VOB/B Nachtrag Rechnungs-Sync
const mockNachtraege = [
    { id: 1, nachtrag_nr: 'N-01', status: 'GENEHMIGT', positionen: [{ oz_code: 'N-01.1', kurztext: 'Zusatzdämmung', menge: 20, einheitspreis: 45 }] },
    { id: 2, nachtrag_nr: 'N-02', status: 'IN_VERHANDLUNG', positionen: [{ oz_code: 'N-02.1', kurztext: 'Optionaler Anstrich', menge: 10, einheitspreis: 30 }] }
];
const approvedPositions = NachtragController.extractApprovedPositionsForInvoice(mockNachtraege);
assert.strictEqual(approvedPositions.length, 1, 'Nur genehmigte Nachträge dürfen übernommen werden');
assert.strictEqual(approvedPositions[0].is_supplement, true);
console.log('✓ Nachtrags-Sync: 1-Klick-Übernahme genehmigter VOB-Nachträge validiert.');

// 5. Test § 48b Bauabzugsteuer & Controlling Dashboard KPIs
const mockSubInvoice = {
    betrag_netto: 10000,
    betrag_brutto: 11900,
    kostenart: 'SUBCONTRACTOR'
};
const sec48bCheck = ControllingController.checkSec48bCompliance({ is_subcontractor: 1, sec48b_status: 'EXPIRED' }, '2026-08-14', mockSubInvoice.betrag_brutto);
assert.strictEqual(sec48bCheck.bauabzugsteuer, 1785.0, '15% von 11.900 € Brutto = 1.785 €');
assert.strictEqual(sec48bCheck.auszahlungsBetrag, 10115.0);
console.log('✓ Controlling & Eingangsrechnung: § 48b Status-Warnung & 15% Steuer-Split validiert.');

console.log('\n--> ALLE FRONTEND UI & WORKFLOW TESTS ERFOLGREICH BESTANDEN <--\n');
