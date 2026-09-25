/**
 * tests/gaeb_validation.test.js - Validierung GAEB DA XML 3.3 (Phase 84 / X84 Angebotsabgabe)
 * Prüft Namespace, XML-Hierarchie, Tag-Konformität und Roundtrip-Parsing.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const GAEBEngine = require('../js/gaeb');

describe('GAEB DA XML 3.3 Export & Validierung (P0-7)', () => {

    const samplePositions = [
        {
            id: 'pos_1',
            oz_code: '01.01.0010',
            name: 'Aushub Baugrube Bodenklasse 3-4',
            menge: 180.50,
            preis: 34.50,
            einheit: 'm³'
        },
        {
            id: 'pos_2',
            oz_code: '01.01.0020',
            name: 'Sauberkeitsschicht aus Magerbeton C8/10 d=5cm',
            menge: 95.00,
            preis: 14.80,
            einheit: 'm²'
        },
        {
            id: 'pos_3',
            oz_code: '01.02.0010',
            name: 'Bodenplatte WU-Beton C25/30 d=25cm inkl. Bewehrungsstahl',
            menge: 42.50,
            preis: 220.00,
            einheit: 'm³'
        }
    ];

    test('1. GAEB DA XML 3.3 Namespace und Header-Knoten', () => {
        const xml = GAEBEngine.generateGAEBX84XML('Neubau Feuerwehrhaus', samplePositions);

        assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'Muss XML-Deklaration enthalten');
        assert.ok(xml.includes('xmlns="http://www.gaeb.de/GAEB_DA_XML/DA_XML_3.3"'), 'Muss aktuellen GAEB DA XML 3.3 Namespace besitzen');
        assert.ok(!xml.includes('http://www.gaeb.de/GAEB_DA_XML/200407'), 'Veralteter Namespace 200407 darf nicht mehr vorkommen');

        // GAEBInfo-Struktur
        assert.ok(xml.includes('<GAEBInfo>'), 'Muss GAEBInfo enthalten');
        assert.ok(xml.includes('<Version>3.3</Version>'), 'Muss Version 3.3 deklarieren');
        assert.ok(xml.includes('<ProgMan>W-Link ERP</ProgMan>'), 'Muss ProgMan W-Link ERP enthalten');
        assert.ok(/<Date>\d{4}-\d{2}-\d{2}<\/Date>/.test(xml), 'Muss ISO-Datum enthalten');
        assert.ok(/<Time>\d{2}:\d{2}:\d{2}<\/Time>/.test(xml), 'Muss ISO-Uhrzeit enthalten');
    });

    test('2. Eliminierung proprietärer / veralteter Tags', () => {
        const xml = GAEBEngine.generateGAEBX84XML('Neubau Feuerwehrhaus', samplePositions);

        // Keine proprietären / ungültigen Tags
        assert.ok(!xml.includes('<PrjInfo>'), 'Proprietärer PrjInfo-Tag darf nicht auf oberster Ebene vorkommen');
        assert.ok(!xml.includes('<PrjName>'), 'Proprietärer PrjName-Tag darf nicht vorkommen');
        assert.ok(!xml.includes('<GAEBInfo>\n    <DP>'), 'DP darf nicht in GAEBInfo deklariert sein');
        assert.ok(xml.includes('<Award>\n    <DP>84</DP>'), 'DP 84 gehört in das Award-Element');
    });

    test('3. Award-, BoQ- und Itemlist-Hierarchie nach GAEB DA XML 3.3', () => {
        const xml = GAEBEngine.generateGAEBX84XML('Schulzentrum Sanierung', samplePositions);

        assert.ok(xml.includes('<Award>'), 'Muss Award enthalten');
        assert.ok(xml.includes('<DP>84</DP>'), 'Datenaustauschphase muss 84 sein');
        assert.ok(xml.includes('<Cur>EUR</Cur>'), 'Währung muss EUR sein');

        // NetTotal: 180.5*34.5 (6227.25) + 95*14.8 (1406.00) + 42.5*220 (9350.00) = 16983.25
        assert.ok(xml.includes('<NetTotal>16983.25</NetTotal>'), 'NetTotal muss korrekt summiert sein');

        assert.ok(xml.includes('<BoQ>'), 'Muss BoQ enthalten');
        assert.ok(xml.includes('<BoQInfo>'), 'Muss BoQInfo enthalten');
        assert.ok(xml.includes('<Name>Schulzentrum Sanierung</Name>'), 'Projektname in BoQInfo/Name');
        assert.ok(xml.includes('<BoQBody>'), 'Muss BoQBody enthalten');
        assert.ok(xml.includes('<Itemlist>'), 'Muss Itemlist enthalten');
    });

    test('4. Item-Strukturierung & XSD-Konformität (OZ, Qty, QU, UP, IT, Description)', () => {
        const xml = GAEBEngine.generateGAEBX84XML('Gewerbepark Nord', samplePositions);

        // Position 1 prüfen
        assert.ok(xml.includes('ID="pos_1"'), 'Item ID muss gesetzt sein');
        assert.ok(xml.includes('RNoPart="01.01.0010"'), 'RNoPart muss vorhanden sein');
        assert.ok(xml.includes('<OZ>01.01.0010</OZ>'), 'OZ-Tag muss vorhanden sein');
        assert.ok(xml.includes('<Qty>180.500</Qty>'), 'Qty mit 3 Nachkommastellen');
        assert.ok(xml.includes('<QU>m³</QU>'), 'Mengeneinheit');
        assert.ok(xml.includes('<UP>34.50</UP>'), 'Einheitspreis mit 2 Dezimalstellen');
        assert.ok(xml.includes('<IT>6227.25</IT>'), 'Gesamtpreis (180.5 * 34.5 = 6227.25)');

        // TextOutl / CompleteText
        assert.ok(xml.includes('<TextOutl><span>Aushub Baugrube Bodenklasse 3-4</span></TextOutl>'),
            'Kurztext in TextOutl für AVA-Systeme');
        assert.ok(xml.includes('<CompleteText>'), 'Langtext/CompleteText vorhanden');
    });

    test('5. XML Well-formedness & Escaping von Sonderzeichen', () => {
        const specialPositions = [
            {
                oz_code: '01.01.0010',
                name: 'Mauerwerk & Mörtel <Kalksandstein> "Sonderklasse" & \'Güte B\'',
                menge: 10.0,
                preis: 50.0,
                einheit: 'm²'
            }
        ];

        const xml = GAEBEngine.generateGAEBX84XML('Projekt & Co. <GmbH>', specialPositions);

        assert.ok(xml.includes('Projekt &amp; Co. &lt;GmbH&gt;'), 'Projektname muss escaped sein');
        assert.ok(xml.includes('&amp; Mörtel &lt;Kalksandstein&gt; &quot;Sonderklasse&quot; &amp; &apos;Güte B&apos;'),
            'Sonderzeichen im Positionstext müssen escaped sein');
        assert.ok(!xml.includes('<Kalksandstein>'), 'Ungemaskte Tags dürfen nicht vorkommen');
    });

    test('6. GAEB DA XML 3.3 Roundtrip-Parsing mit GAEBEngine.parseGAEBXML', () => {
        const xml = GAEBEngine.generateGAEBX84XML('Klinikum Neubau Haus B', samplePositions);
        const parsed = GAEBEngine.parseGAEBXML(xml);

        assert.strictEqual(parsed.projectInfo.name, 'Klinikum Neubau Haus B');
        assert.strictEqual(parsed.projectInfo.gaebPhase, 'X84');
        assert.strictEqual(parsed.projectInfo.currency, 'EUR');
        assert.strictEqual(parsed.items.length, 3);

        const pos1 = parsed.items[0];
        assert.strictEqual(pos1.oz_code, '01.01.0010');
        assert.strictEqual(pos1.menge, 180.50);
        assert.strictEqual(pos1.einheit, 'm³');
        assert.strictEqual(pos1.preis, 34.50);
        assert.strictEqual(pos1.gesamtpreis, 6227.25);
        assert.ok(pos1.name.includes('Aushub Baugrube'));

        const pos3 = parsed.items[2];
        assert.strictEqual(pos3.oz_code, '01.02.0010');
        assert.strictEqual(pos3.menge, 42.50);
        assert.strictEqual(pos3.preis, 220.00);
        assert.strictEqual(pos3.gesamtpreis, 9350.00);
    });
});
