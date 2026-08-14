const assert = require('assert');
const NachtragController = require('../controllers/NachtragController');

console.log('=== TEST SUITE: VOB/B NACHTRAGSMANAGEMENT & RECHNUNGSÜBERNAHME ===\n');

// 1. Nachtragssummen-Berechnung
const samplePos = [
    { kurztext: 'Zusätzliche Abdichtung Keller', cost_type: 'MATERIAL', menge: 25.0, einheitspreis: 30.0 }, // 750.00
    { kurztext: 'Regiestunden Mauerwerk', cost_type: 'LOHN', menge: 10.0, einheitspreis: 65.0 }             // 650.00
];

const totals = NachtragController.calculateNachtragTotals(samplePos, 19.0);
assert.strictEqual(totals.summeNetto, 1400.0, 'Netto muss 1.400,00 € sein');
assert.strictEqual(totals.summeUst, 266.0, 'USt muss 266,00 € sein');
assert.strictEqual(totals.summeBrutto, 1666.0, 'Brutto muss 1.666,00 € sein');
assert.strictEqual(totals.totalsByCostType.MATERIAL, 750.0);
assert.strictEqual(totals.totalsByCostType.LOHN, 650.0);
console.log('✓ Nachtragssummen und Kostenarten-Splitting korrekt berechnet.');

// 2. Validierung
const validNachtrag = { nachtrag_nr: 'N-01', titel: 'Kellerabdichtung' };
const validCheck = NachtragController.validateNachtrag(validNachtrag, samplePos);
assert.strictEqual(validCheck.valid, true);

const invalidCheck = NachtragController.validateNachtrag({ nachtrag_nr: '', titel: '' }, []);
assert.strictEqual(invalidCheck.valid, false);
console.log('✓ Nachtrags-Validierungsregeln geprüft.');

// 3. Übernahme genehmigter Nachträge in Rechnungspositionen
const sampleNachtraege = [
    { id: 1, nachtrag_nr: 'N-01', status: 'GENEHMIGT', positionen: samplePos },
    { id: 2, nachtrag_nr: 'N-02', status: 'ABGELEHNT', positionen: [{ kurztext: 'Nicht genehmigt', menge: 1, einheitspreis: 500 }] }
];

const invoicePositions = NachtragController.extractApprovedPositionsForInvoice(sampleNachtraege);
assert.strictEqual(invoicePositions.length, 2, 'Nur genehmigte Positionen dürfen übernommen werden');
assert.strictEqual(invoicePositions[0].is_supplement, true);
assert.strictEqual(invoicePositions[0].name.includes('[N-01]'), true);
console.log('✓ Automatische Extraktion genehmigter Nachträge für Rechnungsstellung validiert.');

console.log('\n--> NACHTRAGS-TESTS ERFOLGREICH ABGESCHLOSSEN <--\n');
