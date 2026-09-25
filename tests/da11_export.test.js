const { test, describe } = require('node:test');
const assert = require('node:assert');
const DA11Service = require('../js/da11');

describe('DA11 EXPORT & REB 23.003 SPEZIFIKATION', () => {

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

    test('1. Fixed-Width Zeilenlänge (Exakt 80 Zeichen je Zeile zzgl. CRLF)', () => {
        const da11Output = DA11Service.generateDA11(dummyProjekt, dummyBlaetter);
        assert.ok(da11Output.includes('\r\n'), 'DA11 muss Windows CRLF Zeilenenden haben');
        const lines = da11Output.split('\r\n').filter(l => l.length > 0);

        assert.strictEqual(lines.length, 5, 'Erwartet: 1 Vorlaufsatz (00) + 3 Rechenzeilen (11) + 1 Nachlaufsatz (99)');

        // Validierung jeder Zeile auf exakt 80 Zeichen
        lines.forEach((line, idx) => {
            assert.strictEqual(line.length, 80, `Zeile ${idx + 1} muss exakt 80 Zeichen lang sein (Ist: ${line.length}): "${line}"`);
        });
    });

    test('2. Satzart 00 (Vorlaufsatz nach REB 23.003)', () => {
        const da11Output = DA11Service.generateDA11(dummyProjekt, dummyBlaetter);
        const lines = da11Output.split('\r\n').filter(l => l.length > 0);
        const headerLine = lines[0];

        assert.strictEqual(headerLine.substring(0, 2), '00', 'Spalte 1-2: Satzart 00 (Vorlaufsatz)');
        assert.strictEqual(headerLine.substring(2, 4), '11', 'Spalte 3-4: DP-Kennzeichen für Mengenberechnung muss 11 sein');
        assert.strictEqual(headerLine.substring(4, 9), '23003', 'Spalte 5-9: REB-Verfahrensbeschreibung muss 23003 sein');
        assert.strictEqual(headerLine.substring(9, 18), '1122PPPPI', 'Spalte 10-18: OZ-Maske muss 1122PPPPI sein');
        assert.strictEqual(headerLine.substring(18, 20), '  ', 'Spalte 19-20: 2 Reserve-Leerzeichen');
        assert.ok(headerLine.substring(20, 80).startsWith('W-LINK ERP PROJEKT') || headerLine.substring(20, 80).includes('Buerogebaeude'),
            'Spalte 21-80: Baumaßnahme mit transliterierten Umlauten');
    });

    test('3. Satzart 11 (REB-VB 23.003 Stellenplan für Aufmaßzeilen)', () => {
        const da11Output = DA11Service.generateDA11(dummyProjekt, dummyBlaetter);
        const lines = da11Output.split('\r\n').filter(l => l.length > 0);
        const dataLine1 = lines[1];

        // Stellenplan nach REB-VB 23.003:
        // Spalte 01-02: Satzart "11" (2)
        assert.strictEqual(dataLine1.substring(0, 2), '11', 'Spalte 1-2: Satzart muss 11 sein');

        // Spalte 03-11: Ordnungszahl OZ (9)
        assert.strictEqual(dataLine1.substring(2, 11).trim(), '01010010', 'Spalte 3-11: OZ muss 01010010 sein');

        // Spalte 12-13: Index (2)
        assert.strictEqual(dataLine1.substring(11, 13), '  ', 'Spalte 12-13: Index muss 2 Zeichen lang sein');

        // Spalte 14-19: Blattnummer (6)
        assert.strictEqual(dataLine1.substring(13, 19), '000001', 'Spalte 14-19: Blattnummer muss 6-stellig sein');

        // Spalte 20-21: Zeilennummer (2)
        assert.strictEqual(dataLine1.substring(19, 21), '01', 'Spalte 20-21: Zeilennummer muss 2-stellig sein');

        // Spalte 22: Kennzeichen (1)
        assert.strictEqual(dataLine1.substring(21, 22), ' ', 'Spalte 22: Kennzeichen muss 1 Zeichen sein');

        // Spalte 23-24: Formelnummer (2)
        assert.strictEqual(dataLine1.substring(22, 24), '04', 'Spalte 23-24: Formelnummer muss 04 sein');

        // Spalte 25-69: Rechenansatz / Erläuterung (45)
        assert.strictEqual(dataLine1.substring(24, 69).length, 45, 'Spalte 25-69: Rechenansatz muss genau 45 Zeichen haben');
        assert.ok(dataLine1.substring(24, 69).includes('"Baugrube Aushub"'), 'Erläuterung muss im Ansatz enthalten sein');

        // Spalte 70-80: Ergebniswert (11)
        assert.strictEqual(dataLine1.substring(69, 80).length, 11, 'Spalte 70-80: Ergebniswert muss 11 Zeichen haben');
        assert.strictEqual(dataLine1.substring(69, 80).trim(), '294.000', 'Ergebniswert muss 294.000 sein');
    });

    test('4. Vorzeichen-Fix: Negative Abzugsmengen bleiben stets negativ', () => {
        const testBlaetter = [
            {
                blatt_nummer: '0002',
                zeilen: [
                    // Fall A: ergebnis positiv, vorzeichen -1
                    { oz_code: '02.01.0010', zeilen_nr: 1, bezeichnung: 'Aussparung Tür', formel_reb: '01', rechenansatz: '1.01 * 2.135', ergebnis: 2.156, vorzeichen: -1 },
                    // Fall B: ergebnis bereits negativ (z.B. aus Abzugsfunktion), vorzeichen -1
                    // Früherer Bug: Math.abs(raw) * vorzeichen kippte bei raw < 0 und vorzeichen = -1 ins Positive!
                    { oz_code: '02.01.0010', zeilen_nr: 2, bezeichnung: 'Abzug Durchbruch', formel_reb: '01', rechenansatz: '0.80 * 0.80', ergebnis: -0.640, vorzeichen: -1 },
                    // Fall C: ergebnis positiv, vorzeichen +1
                    { oz_code: '02.01.0010', zeilen_nr: 3, bezeichnung: 'Mauerwerk Wand', formel_reb: '01', rechenansatz: '5.00 * 2.80', ergebnis: 14.000, vorzeichen: 1 }
                ]
            }
        ];

        const output = DA11Service.generateDA11({ name: 'Vorzeichentest' }, testBlaetter);
        const lines = output.split('\r\n').filter(l => l.length > 0);

        // Zeile 1: Fall A
        const resA = lines[1].substring(69, 80).trim();
        assert.strictEqual(resA, '-2.156', 'Fall A: Vorzeichen -1 mit positivem Ergebnis muss negativ sein');

        // Zeile 2: Fall B (bereits negatives Roh-Ergebnis mit vorzeichen -1)
        const resB = lines[2].substring(69, 80).trim();
        assert.strictEqual(resB, '-0.640', 'Fall B: Vorzeichen -1 mit bereits negativem Ergebnis darf NICHT ins Positive kippen');

        // Zeile 3: Fall C
        const resC = lines[3].substring(69, 80).trim();
        assert.strictEqual(resC, '14.000', 'Fall C: Positiver Ansatz muss positiv bleiben');
    });

    test('5. Umlaute-Transliteration vor dem Padding verhindert Spaltenversatz', () => {
        const umlautBlaetter = [
            {
                blatt_nummer: '0003',
                zeilen: [
                    {
                        oz_code: '03.01.0010',
                        zeilen_nr: 1,
                        bezeichnung: 'Gründungskörper & Schachtabdeckung für Lüftungsanlagen',
                        formel_reb: '04',
                        rechenansatz: '10.50 * 4.20 * 1.50',
                        ergebnis: 66.15,
                        vorzeichen: 1
                    },
                    {
                        oz_code: '03.01.0020',
                        zeilen_nr: 2,
                        bezeichnung: 'Böschungsfläche mit Gehölzen & Sträuchern',
                        formel_reb: '01',
                        rechenansatz: '25.00 * 3.50',
                        ergebnis: 87.50,
                        vorzeichen: 1
                    }
                ]
            }
        ];

        const output = DA11Service.generateDA11({ name: 'Projekt mit Umlauten: Übersee-Häfen & Brücken' }, umlautBlaetter);
        const lines = output.split('\r\n').filter(l => l.length > 0);

        // Jede Zeile MUSS exakt 80 Zeichen lang sein
        lines.forEach((line, idx) => {
            assert.strictEqual(line.length, 80, `Umlaut-Zeile ${idx + 1} muss exakt 80 Zeichen lang sein (Ist: ${line.length})`);
            // Darf keine Nicht-ASCII Zeichen enthalten (z. B. keine UTF-8 Umlaute wie 'ä')
            assert.ok(!/[äöüÄÖÜß]/.test(line), `Zeile ${idx + 1} darf keine Roh-Umlaute mehr enthalten: ${line}`);
        });

        // Prüfe, dass Spalte 70-80 (Ergebnis) nicht nach rechts oder links verschoben wurde!
        const line1 = lines[1];
        assert.strictEqual(line1.substring(69, 80).trim(), '66.150', 'Ergebnis 66.150 muss exakt in Spalte 70-80 stehen');

        const line2 = lines[2];
        assert.strictEqual(line2.substring(69, 80).trim(), '87.500', 'Ergebnis 87.500 muss exakt in Spalte 70-80 stehen');
    });

    test('6. Satzart 99 (Nachlaufsatz)', () => {
        const da11Output = DA11Service.generateDA11(dummyProjekt, dummyBlaetter);
        const lines = da11Output.split('\r\n').filter(l => l.length > 0);
        const footerLine = lines[lines.length - 1];

        assert.strictEqual(footerLine.substring(0, 2), '99', 'Letzte Zeile muss Satzart 99 (Nachlauf) sein');
        assert.strictEqual(footerLine.substring(2).trim(), '', 'Nachlauf muss mit 78 Leerzeichen gefüllt sein');
        assert.strictEqual(footerLine.length, 80, 'Nachlauf muss exakt 80 Zeichen lang sein');
    });

    test('7. DA11 Re-Parsing (Roundtrip-Test)', () => {
        const da11Output = DA11Service.generateDA11(dummyProjekt, dummyBlaetter);
        const parsed = DA11Service.parseDA11(da11Output);

        assert.strictEqual(parsed.success, true, 'Parsing muss erfolgreich sein');
        assert.strictEqual(parsed.blaetter.length, 1, 'Muss 1 Blatt enthalten');
        assert.strictEqual(parsed.blaetter[0].zeilen.length, 3, 'Muss 3 Zeilen enthalten');
        assert.strictEqual(parsed.blaetter[0].zeilen[0].oz_code, '01010010');
        assert.strictEqual(parsed.blaetter[0].zeilen[0].ergebnis, 294.00);
        assert.strictEqual(parsed.blaetter[0].zeilen[0].vorzeichen, 1);
        assert.strictEqual(parsed.blaetter[0].zeilen[2].ergebnis, 6.25);
        assert.strictEqual(parsed.blaetter[0].zeilen[2].vorzeichen, -1, 'Abzugszeile muss Vorzeichen -1 haben');
    });
});
