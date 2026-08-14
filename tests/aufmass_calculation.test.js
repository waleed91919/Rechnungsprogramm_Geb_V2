const assert = require('assert');
const AufmassController = require('../controllers/AufmassController');

console.log('=== TEST SUITE: AUFMASS-BERECHNUNG & FORMEL-EVALUATION ===\n');

// 1. Sichere Formelberechnung
const testCases = [
    { formula: '5.50 * 3.20', expected: 17.6 },
    { formula: '(4.20 + 3.80) * 2.50', expected: 20.0 },
    { formula: '10.50 * 4.20 * 0.25', expected: 11.025 },
    { formula: '(5 + 3.5) * 2 - 1.25', expected: 15.75 },
    { formula: '4,5 * 2,0', expected: 9.0 }, // Deutsches Komma
    { formula: '2 ^ 3', expected: 8.0 },      // Potenz
    { formula: 'invalid string', expected: 0 },
    { formula: ';; alert(1)', expected: 0 }
];

testCases.forEach(tc => {
    const result = AufmassController.evaluateFormula(tc.formula);
    assert.strictEqual(result, tc.expected, `Formel "${tc.formula}" ergab ${result}, erwartet ${tc.expected}`);
});
console.log('✓ Formel-Parser & AST-Evaluation arbeiten mathematisch korrekt und sicher.');

// 2. REB 23.003 Standardformeln
// Formel 01: Rechteck (a * b)
assert.strictEqual(AufmassController.calculateREBFormula('01', [4.5, 3.0]), 13.5);
// Formel 02: Dreieck ((a * b) / 2)
assert.strictEqual(AufmassController.calculateREBFormula('02', [4.0, 3.0]), 6.0);
// Formel 04: Quader (a * b * c)
assert.strictEqual(AufmassController.calculateREBFormula('04', [5.0, 4.0, 2.5]), 50.0);
console.log('✓ REB 23.003 Standard-Formelkatalog (01, 02, 04) validiert.');

// 3. Totals Aggregation mit Einheiten
const samplePositions = [
    { formel: '4.0 * 2.5', einheit: 'm²' },
    { formel: '2.0 * 3.0', einheit: 'm²' },
    { formel: '10.0', einheit: 'm' }
];
const totals = AufmassController.calculateAufmassTotals(samplePositions);
assert.strictEqual(totals.totalsByUnit['m²'], 16.0);
assert.strictEqual(totals.totalsByUnit['m'], 10.0);
assert.strictEqual(totals.totalSum, 26.0);
console.log('✓ Totals-Aggregation nach Einheiten erfolgreich geprüft.');

console.log('\n--> AUFMASS-TESTS ERFOLGREICH ABGESCHLOSSEN <--\n');
