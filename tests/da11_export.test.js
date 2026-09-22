const assert = require('assert');
const DA11Service = require('../js/da11');
const AufmassController = require('../controllers/AufmassController');

console.log('=== TEST SUITE: DA11 EXPORT & REB 23.003 SPEZIFIKATION ===\n');

// 1. Test Fixed-Width Zeilenlänge (Exakt 80 Zeichen je Zeile)
const dummyProjekt = { name: 'Neubau Bürogebäude Hauptstraße 10', ozMaske: '1122PPPPI' };
const dummyBlaetter = [
    {
        blatt_nummer: '0001',
        titel: 'Erdarbeiten & Fundamente',
        zeilen: [
            { oz_code: '01.01.0010', zeilen_nr: 1, bezeichnung: 'Baugrube Aushub', formel_reb: '04', rechenansatz: '12.50 * 8.40 * 2.80', ergebnis: 294.00, einheit: 'm³', vorzeichen: 1 },
            { oz_code: '01.01.0020', zeilen_nr: 2, bezeichnung: 'Sauberkeitsschicht', formel_reb: '01', rechenansatz: '12.50 * 8.40', ergebnis: 105.00, einheit: 'm²', vorzeichen: 1 },
            { oz_code: '01.01.0020', zeilen_nr: 3, bezeichnung: 'Aussparung Liftschacht', formel_reb: '01', rechenansatz: '2.50 * 2.50', ergebnis: 6.25, einheit: 'm²', vorzeichen: -1 }
        ]
    }
];

const da11Output = DA11Service.generateDA11(dummyProjekt, dummyBlaetter);
assert.ok(da11Output.includes('\r\n'), 'DA11 muss CRLF Zeilenenden haben');
const lines = da11Output.split('\r\n').filter(l => l.length > 0);

console.log(`Generierte Zeilen: ${lines.length}`);
assert.strictEqual(lines.length, 5, 'Erwartet: 1 Vorlaufsatz (00) + 3 Rechenzeilen (11) + 1 Nachlaufsatz (99)');

// Validierung jeder Zeile auf exakt 80 Zeichen
lines.forEach((line, idx) => {
    assert.strictEqual(line.length, 80, `Zeile ${idx + 1} muss exakt 80 Zeichen lang sein (Ist: ${line.length}): "${line}"`);
});
console.log('✓ Alle Zeilen erfüllen die REB 23.003 80-Zeichen Fixed-Width Anforderung.');

// 2. Test Satzart 00 (Vorlaufsatz nach REB 23.003)
const headerLine = lines[0];
assert.strictEqual(headerLine.substring(0, 2), '00', 'Erste Zeile muss Satzart 00 (Vorlaufsatz) sein');
assert.strictEqual(headerLine.substring(2, 4), '11', 'DP-Kennzeichen für Mengenberechnung muss 11 sein');
assert.strictEqual(headerLine.substring(4, 9), '23003', 'REB-Verfahrensbeschreibung muss 23003 sein');
assert.strictEqual(headerLine.substring(9, 18), '1122PPPPI', 'OZ-Maske muss 1122PPPPI sein');
console.log('✓ Satzart 00 (Projektkopf & OZ-Maske nach REB 23.003) korrekt erzeugt.');

// 3. Test Satzart 11 (Mengenberechnungszeilen nach REB 23.003)
const dataLine1 = lines[1];
assert.strictEqual(dataLine1.substring(0, 2), '11', 'Rechenzeile muss Satzart 11 sein');
assert.strictEqual(dataLine1.substring(2, 11).trim(), '01010010', 'OZ muss korrekt formatiert sein');
assert.strictEqual(dataLine1.substring(11, 15), '0001', 'Blattnummer muss 0001 sein');
assert.strictEqual(dataLine1.substring(15, 17), 'A0', 'Zeilenadresse muss A0 sein');
assert.strictEqual(dataLine1.substring(17, 19), '04', 'Formelnummer muss 04 sein');
console.log('✓ Satzart 11 Spaltenlayout und Metadaten entsprechen der REB 23.003 Norm.');

// 4. Test Satzart 99 (Nachlaufsatz)
const footerLine = lines[lines.length - 1];
assert.strictEqual(footerLine.substring(0, 2), '99', 'Letzte Zeile muss Satzart 99 (Nachlauf) sein');
assert.strictEqual(footerLine.substring(2).trim(), '', 'Nachlauf muss mit Leerzeichen gefüllt sein');
console.log('✓ Satzart 99 (Nachlaufsatz) korrekt erzeugt.');

// 5. Test DA11 Re-Parsing (Roundtrip-Test)
const parsed = DA11Service.parseDA11(da11Output);
assert.strictEqual(parsed.success, true, 'Parsing muss erfolgreich sein');
assert.strictEqual(parsed.blaetter.length, 1, 'Muss 1 Blatt enthalten');
assert.strictEqual(parsed.blaetter[0].zeilen.length, 3, 'Muss 3 Zeilen enthalten');
assert.strictEqual(parsed.blaetter[0].zeilen[0].oz_code, '01010010');
assert.strictEqual(parsed.blaetter[0].zeilen[2].vorzeichen, -1, 'Abzugszeile muss Vorzeichen -1 haben');
console.log('✓ DA11 Roundtrip Parser erfolgreich validiert.');

console.log('\n--> DA11 TESTS ERFOLGREICH ABGESCHLOSSEN <--\n');
