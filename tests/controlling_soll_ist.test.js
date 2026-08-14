const assert = require('assert');
const ControllingController = require('../controllers/ControllingController');
const BautagebuchController = require('../controllers/BautagebuchController');

console.log('=== TEST SUITE: CONTROLLING, § 48b & SOLL-IST ANALYSE ===\n');

// 1. § 48b EStG Freistellungsbescheinigung & 15% Bauabzugsteuer Check
const validSub = {
    name: 'Maler Meister GmbH',
    is_subcontractor: 1,
    sec48b_status: 'VALID',
    sec48b_valid_until: '2028-12-31'
};

const expiredSub = {
    name: 'Tiefbau Schnell GmbH',
    is_subcontractor: 1,
    sec48b_status: 'EXPIRED',
    sec48b_valid_until: '2025-01-01'
};

// Check gültiger Subunternehmer (Rechnungsbetrag 10.000 € Brutto)
const validResult = ControllingController.checkSec48bCompliance(validSub, '2026-08-14', 10000.0);
assert.strictEqual(validResult.isValid, true);
assert.strictEqual(validResult.bauabzugsteuer, 0.0);
assert.strictEqual(validResult.auszahlungsBetrag, 10000.0);
console.log('✓ Gültiger Subunternehmer: 0% Bauabzugsteuer, volle Auszahlung.');

// Check abgelaufener Subunternehmer (Rechnungsbetrag 10.000 € Brutto)
const expiredResult = ControllingController.checkSec48bCompliance(expiredSub, '2026-08-14', 10000.0);
assert.strictEqual(expiredResult.isValid, false);
assert.strictEqual(expiredResult.bauabzugsteuer, 1500.0, '15% von 10.000 € = 1.500 € Bauabzugsteuer');
assert.strictEqual(expiredResult.auszahlungsBetrag, 8500.0, '85% = 8.500 € Auszahlung');
console.log('✓ Abgelaufene § 48b Bescheinigung: 15% Bauabzugsteuer (1.500 €) automatisch abgespalten.');

// 2. Soll-Ist Controlling & Deckungsbeitrag
const sollKosten = { lohn: 20000, material: 15000, geraet: 3000, sub: 12000 }; // Soll = 50.000 €
const istKosten = { lohn: 18000, material: 14000, geraet: 2500, subcontractor: 11000, sonstiges: 500 }; // Ist = 46.000 €
const istUmsatzNetto = 65000.0;

const kpis = ControllingController.calculateProjectKPIs(sollKosten, istKosten, istUmsatzNetto);
assert.strictEqual(kpis.sollGesamt, 50000.0);
assert.strictEqual(kpis.istGesamt, 46000.0);
assert.strictEqual(kpis.deckungsbeitrag, 19000.0, 'Deckungsbeitrag = 65.000 - 46.000 = 19.000 €');
assert.strictEqual(kpis.isProfitabel, true);
assert.strictEqual(kpis.statusLevel, 'HEALTHY');
console.log(`✓ Projekt-KPIs berechnet: DB = ${kpis.deckungsbeitrag} €, Marge = ${kpis.margeProzent} %, Budget-Verbrauch = ${kpis.budgetVerbrauchProzent} %`);

// 3. Gewährleistungsfrist-Berechnung nach VOB/B § 13
const abnahmeDatum = '2026-08-14';
const endeVob = BautagebuchController.calculateWarrantyEndDate(abnahmeDatum, 4);
assert.strictEqual(endeVob, '2030-08-14', 'VOB/B Gewährleistungsende muss 4 Jahre später sein');
console.log('✓ Gewährleistungsfrist-Berechnung (4 Jahre VOB/B) validiert.');

console.log('\n--> CONTROLLING-TESTS ERFOLGREICH ABGESCHLOSSEN <--\n');
