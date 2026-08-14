const assert = require('assert');
const DA11Service = require('../js/da11');
const AufmassController = require('../controllers/AufmassController');

console.log('=== TEST SUITE: DA11 EXPORT & REB 23.003 SPEZIFIKATION ===\n');

// 1. Test Fixed-Width Zeilenlänge (Exakt 80 Zeichen je Zeile)
const dummyProjekt = { name: 'Neubau Bürogebäude Hauptstraße 10' };
const dummyBlaetter = [
    {
        blatt_nummer: '001',
        titel: 'Erdarbeiten & Fundamente',
        zeilen: [
            { oz_code: '01.01.0010', zeilen_nr: 1, bezeichnung: 'Baugrube Aushub', formel_reb: '04', rechenansatz: '12.50 * 8.40 * 2.80', ergebnis: 294.00, einheit: 'm³', vorzeichen: 1 },
            { oz_code: '01.01.0020', zeilen_nr: 2, bezeichnung: 'Sauberkeitsschicht', formel_reb: '01', rechenansatz: '12.50 * 8.40', ergebnis: 105.00, einheit: 'm²', vorzeichen: 1 },
            { oz_code: '01.01.0020', zeilen_nr: 3, bezeichnung: 'Aussparung Liftschacht', formel_reb: '01', rechenansatz: '2.50 * 2.50', ergebnis: 6.25, einheit: 'm²', vorzeichen: -1 }
        ]
    }
];

const da11Output = DA11Service.generateDA11(dummyProjekt, dummyBlaetter);
const lines = da11Output.split(/\r?\n/).filter(l => l.length > 0);

console.log(`Generierte Zeilen: ${lines.length}`);

// Validierung jeder Zeile auf exakt 80 Zeichen
lines.forEach((line, idx) => {
    assert.strictEqual(line.length, 80, `Zeile ${idx + 1} muss exakt 80 Zeichen lang sein (Ist: ${line.length}): "${line}"`);
});
console.log('✓ Alle Zeilen erfüllen die REB 23.003 80-Zeichen Fixed-Width Anforderung.');

// 2. Test Satzart 11 (Header)
const headerLine = lines[0];
assert.strictEqual(headerLine.substring(0, 2), '11', 'Erste Zeile muss Satzart 11 sein');
console.log('✓ Satzart 11 (Projektkopf) korrekt erzeugt.');

// 3. Test Satzart 12 (Rechenzeilen)
const dataLine1 = lines[1];
assert.strictEqual(dataLine1.substring(0, 2), '12', 'Rechenzeile muss Satzart 12 sein');
assert.strictEqual(dataLine1.substring(2, 11).trim(), '01010010', 'OZ muss korrekt formatiert sein');
assert.strictEqual(dataLine1.substring(13, 16), '001', 'Blattnummer muss 001 sein');
assert.strictEqual(dataLine1.substring(16, 18), '01', 'Zeilennummer muss 01 sein');
console.log('✓ Satzart 12 Spaltenlayout und Metadaten entsprechen der Norm.');

// 4. Test DA11 Re-Parsing (Roundtrip-Test)
const parsed = DA11Service.parseDA11(da11Output);
assert.strictEqual(parsed.success, true, 'Parsing muss erfolgreich sein');
assert.strictEqual(parsed.blaetter.length, 1, 'Muss 1 Blatt enthalten');
assert.strictEqual(parsed.blaetter[0].zeilen.length, 3, 'Muss 3 Zeilen enthalten');
assert.strictEqual(parsed.blaetter[0].zeilen[2].vorzeichen, -1, 'Abzugszeile muss Vorzeichen -1 haben');
console.log('✓ DA11 Roundtrip Parser erfolgreich validiert.');

console.log('\n--> DA11 TESTS ERFOLGREICH ABGESCHLOSSEN <--\n');
