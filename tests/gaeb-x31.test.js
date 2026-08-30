/**
 * tests/gaeb-x31.test.js - Unit- und Roundtrip-Tests für GAEB DA XML 3.3 Phase X31 (REB 23.003)
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const GaebX31Service = require('../js/gaeb-x31');

describe('GAEB DA XML 3.3 Phase X31 (Mengenermittlung nach REB 23.003)', () => {

    const sampleProject = {
        name: 'Neubau Feuerwehrgerätehaus Musterstadt',
        auftraggeber: 'Stadt Musterstadt Bauamt'
    };

    const sampleBlaetter = [
        {
            id: 1,
            blatt_nummer: '001',
            titel: 'Rohbau & Erdarbeiten',
            zeilen: [
                {
                    oz_code: '01.01.0010',
                    zeilen_nr: 1,
                    bezeichnung: 'Aushub Fundamentgräben',
                    formel_reb: '04',
                    rechenansatz: '15.00 * 8.50 * 1.20',
                    ergebnis: 153.00,
                    einheit: 'm³',
                    vorzeichen: 1
                },
                {
                    oz_code: '01.01.0010',
                    zeilen_nr: 2,
                    bezeichnung: 'Aussparung Schacht',
                    formel_reb: '01',
                    rechenansatz: '2.00 * 2.00 * 1.20',
                    ergebnis: 4.80,
                    einheit: 'm³',
                    vorzeichen: -1
                },
                {
                    oz_code: '01.01.0020',
                    zeilen_nr: 1,
                    bezeichnung: 'Bodenplatte Stahlbeton',
                    formel_reb: '91',
                    rechenansatz: '15.00 * 8.50 * 0.25',
                    ergebnis: 31.875,
                    einheit: 'm³',
                    vorzeichen: 1
                }
            ]
        }
    ];

    const samplePositions = [
        { pos_nr: '01.01.0010', name: 'Erdarbeiten Fundamente', menge: 148.20, einheit: 'm³' },
        { pos_nr: '01.01.0020', name: 'Bodenplatte C25/30', menge: 31.88, einheit: 'm³' }
    ];

    test('1. GAEB DA XML 3.3 X31 Generierung mit Schema-Konformität', () => {
        const xml = GaebX31Service.generateX31Xml(sampleProject, sampleBlaetter, samplePositions);

        assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'Muss XML-Prolog haben');
        assert.ok(xml.includes('xmlns="http://www.gaeb.de/GAEB_DA_XML/DA_XML/3.3"'), 'Muss GAEB XML 3.3 Schema Namespace haben');
        assert.ok(xml.includes('<GAEB'), 'Muss Root-Tag GAEB enthalten');
        assert.ok(xml.includes('<QtyDetermination>'), 'Muss QtyDetermination Tag enthalten');
        assert.ok(xml.includes('<DP>X31</DP>'), 'Muss Datenphase X31 deklarieren');
        assert.ok(xml.includes('<ProgSystem>W-Link ERP</ProgSystem>'), 'Muss Herkunftssystem angeben');
    });

    test('2. Korrekte Strukturierung von Positionen (Item) und Rechenansätzen (QtyDeterm)', () => {
        const xml = GaebX31Service.generateX31Xml(sampleProject, sampleBlaetter, samplePositions);

        assert.ok(xml.includes('RNoPart="01.01.0010"'), 'Muss Item mit OZ 01.01.0010 enthalten');
        assert.ok(xml.includes('RNoPart="01.01.0020"'), 'Muss Item mit OZ 01.01.0020 enthalten');
        assert.ok(xml.includes('<FormulaNo>04</FormulaNo>'), 'Muss REB Formel 04 enthalten');
        assert.ok(xml.includes('<FormulaNo>91</FormulaNo>'), 'Muss REB Formel 91 (Freie Formel) enthalten');
        assert.ok(xml.includes('<QtyDetermSign>-</QtyDetermSign>'), 'Muss Abzugsvorzeichen (-) für Schachtaussparung enthalten');
    });

    test('3. REB 23.003 Mathematische Auswertung in GaebX31Service.evaluateFormula', () => {
        assert.strictEqual(GaebX31Service.evaluateFormula('15.00 * 8.50 * 1.20'), 153);
        assert.strictEqual(GaebX31Service.evaluateFormula('2.00 * 2.00 * 1.20'), 4.8);
        assert.strictEqual(GaebX31Service.evaluateFormula('(12.5 + 7.5) * 3'), 60);
        assert.strictEqual(GaebX31Service.evaluateFormula(''), 0);
    });

    test('4. GAEB DA XML 3.3 X31 Parsing & Roundtrip-Verifikation', () => {
        const generatedXml = GaebX31Service.generateX31Xml(sampleProject, sampleBlaetter, samplePositions);
        const parsed = GaebX31Service.parseX31Xml(generatedXml);

        assert.strictEqual(parsed.dp, 'X31', 'Geparste Datenphase muss X31 sein');
        assert.strictEqual(parsed.items.length, 2, 'Muss 2 Positionen extrahieren');

        const item1 = parsed.items.find(it => it.oz_code === '01.01.0010');
        assert.ok(item1, 'Position 01.01.0010 muss existieren');
        assert.strictEqual(item1.ansatze.length, 2, 'Position 1 muss 2 Ansätze haben');

        // Prüfe Ansatz 1
        const ansatz1 = item1.ansatze[0];
        assert.strictEqual(ansatz1.rechenansatz, '15.00 * 8.50 * 1.20');
        assert.strictEqual(ansatz1.resultQty, 153.00);
        assert.strictEqual(ansatz1.sign, 1);

        // Prüfe Ansatz 2 (Abzug)
        const ansatz2 = item1.ansatze[1];
        assert.strictEqual(ansatz2.sign, -1, 'Abzug muss Vorzeichen -1 haben');
        assert.strictEqual(ansatz2.resultQty, 4.80);

        // Netto-Gesamtmenge von Item 1: 153 - 4.8 = 148.20
        assert.strictEqual(item1.totalQty, 148.20);
    });

    test('5. Fehlerbehandlung bei unvollständigem XML', () => {
        assert.throws(() => {
            GaebX31Service.parseX31Xml('<InvalidXml>kein GAEB</InvalidXml>');
        }, /Ungültige GAEB XML Datei/);
    });
});
