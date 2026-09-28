/**
 * tests/gaeb_x83_import_audit.test.js
 * 
 * Verifikations- und Audit-Testsuite für den GAEB DA XML (X83) Import von W-Link.
 * Überprüft anhand der 5 Testfixtures (tests/fixtures/gaeb_x83/*.x83) den
 * vollständigen Erhalt von Hierarchien (BoQCtgy), Pfad-OZs, RNoPart, Langtexten,
 * Vorbemerkungen, Positionstypen, Bieterangaben und UPComponents.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const GAEBEngine = require('../js/gaeb');

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'gaeb_x83');

const ALL_FIXTURES = [
    '01_standard_hierarchie.x83',
    '02_positionstypen_wahl_bedarf.x83',
    '03_bieterangaben_vorbemerkungen_ep.x83',
    '04_reales_muster_hochbau.x83',
    '05_muster_angelehnt_an_gaeb_bvbs.x83'
];

function loadFixture(filename) {
    const filePath = path.join(FIXTURES_DIR, filename);
    return fs.readFileSync(filePath, 'utf8');
}

describe('GAEB X83 Import: Vollständige Verifikation des Datenerhalts (Phasen 1 & 2)', () => {

    const xml01 = loadFixture('01_standard_hierarchie.x83');
    const xml02 = loadFixture('02_positionstypen_wahl_bedarf.x83');
    const xml03 = loadFixture('03_bieterangaben_vorbemerkungen_ep.x83');
    const xml04 = loadFixture('04_reales_muster_hochbau.x83');
    const xml05 = loadFixture('05_muster_angelehnt_an_gaeb_bvbs.x83');

    // =========================================================================
    // 0. Validierung: XML-Wohlgeformtheit & strukturelle Basiskonformität vs. XSD
    // =========================================================================
    test('0. Validierung: Alle 5 X83-Testdateien sind wohlgeformtes XML mit struktureller Basiskonformität', () => {
        const dom = new JSDOM();
        const parser = new dom.window.DOMParser();

        ALL_FIXTURES.forEach(filename => {
            const xmlContent = loadFixture(filename);
            const doc = parser.parseFromString(xmlContent, 'text/xml');

            // 1. Wohlgeformtheit (Well-Formedness)
            const parserErrors = doc.getElementsByTagName('parsererror');
            assert.strictEqual(parserErrors.length, 0, `Datei ${filename} muss wohlgeformtes XML sein (keine Parser-Fehler)`);

            // 2. Strukturelle Basiskonformität
            const root = doc.documentElement;
            assert.strictEqual(root.nodeName, 'GAEB', `Datei ${filename} muss <GAEB> als Wurzelknoten besitzen`);
            assert.strictEqual(root.getAttribute('xmlns'), 'http://www.gaeb.de/GAEB_DA_XML/DA_XML_3.3',
                `Datei ${filename} muss den allgemeinen GAEB DA XML 3.3 Namespace verwenden`);

            // GAEBInfo-Version
            const versionElem = doc.getElementsByTagName('Version')[0];
            assert.ok(versionElem, `Datei ${filename} muss ein <Version>-Element besitzen`);
            assert.strictEqual(versionElem.textContent.trim(), '3.3', `Datei ${filename} muss GAEB Version 3.3 deklarieren`);

            // Award-DP 83
            const dpElem = doc.getElementsByTagName('DP')[0];
            assert.ok(dpElem, `Datei ${filename} muss ein <DP>-Element enthalten`);
            assert.strictEqual(dpElem.textContent.trim(), '83', `Datei ${filename} muss Datenaustauschphase 83 (X83) sein`);

            // Hinweis zur Abgrenzung: Die strikte Schemaprüfung nach der phasenbezogenen
            // XSD GAEB_DA_XML_83_3.3_2021-05.xsd erwartet den phasenspezifischen Namespace
            // 'http://www.gaeb.de/GAEB_DA_XML/DA83/3.3' sowie strikte Elementreihenfolgen.
            // Der W-Link Import-Parser verarbeitet beide Varianten tolerant und fehlertolerant.
        });
    });

    // =========================================================================
    // 1. Basisfunktion des Parsers: Kopfdaten & Positionen
    // =========================================================================
    test('1. Basisfunktion: Parser liest Kopfdaten und extrahiert alle Positionen', () => {
        const parsed01 = GAEBEngine.parseGAEBXML(xml01);
        assert.ok(parsed01.projectInfo, 'projectInfo muss existieren');
        assert.strictEqual(parsed01.projectInfo.name, 'Neubau Verwaltungsgebäude Campus Nord');
        assert.strictEqual(parsed01.projectInfo.gaebPhase, 'X83');
        assert.strictEqual(parsed01.projectInfo.currency, 'EUR');
        assert.strictEqual(parsed01.items.length, 6, 'Muss 6 Positionen in 01 extrahieren');

        const parsed04 = GAEBEngine.parseGAEBXML(xml04);
        assert.strictEqual(parsed04.projectInfo.name, 'Neubau Mehrfamilienhaus mit Tiefgarage Sonnenallee 42');
        assert.strictEqual(parsed04.projectInfo.gaebPhase, 'X83');
        assert.strictEqual(parsed04.items.length, 9, 'Muss 9 Positionen im Hochbau-Muster extrahieren');

        const parsed05 = GAEBEngine.parseGAEBXML(xml05);
        assert.strictEqual(parsed05.projectInfo.name, 'Muster-Leistungsverzeichnis Verkehrswegebau (angelehnt an GAEB/BVBS)');
        assert.strictEqual(parsed05.projectInfo.gaebPhase, 'X83');
        assert.strictEqual(parsed05.projectInfo.currency, 'EUR');
        assert.strictEqual(parsed05.items.length, 5, 'Muss 5 Positionen im BVBS-Referenzmuster extrahieren');
    });

    // =========================================================================
    // 2. Hierarchie-Ebenen (BoQCtgy, Gewerke, Abschnitte, Titel)
    // =========================================================================
    test('2. Datenerhalt Hierarchie: BoQCtgy-Ebenen bleiben vollständig erhalten', () => {
        const parsed01 = GAEBEngine.parseGAEBXML(xml01);

        // 1. Kategorienstruktur existiert auf oberster Ebene
        assert.ok(parsed01.categories, 'Parser muss categories-Hierarchie bereitstellen');
        assert.strictEqual(parsed01.categories.length, 1, 'Muss 1 Hauptgewerk auf oberster Ebene besitzen');

        // Ebene 1: Gewerk 01
        const gewerk01 = parsed01.categories[0];
        assert.strictEqual(gewerk01.id, 'CTG_01');
        assert.strictEqual(gewerk01.rno_part, '01');
        assert.strictEqual(gewerk01.name, '01 Rohbauarbeiten');
        assert.strictEqual(gewerk01.level, 1);
        assert.strictEqual(gewerk01.categories.length, 1, 'Gewerk 01 hat 1 Abschnitt');

        // Ebene 2: Abschnitt 01
        const abschnitt01 = gewerk01.categories[0];
        assert.strictEqual(abschnitt01.id, 'CTG_01_01');
        assert.strictEqual(abschnitt01.rno_part, '01');
        assert.strictEqual(abschnitt01.name, 'Abschnitt 01: Erdarbeiten');
        assert.strictEqual(abschnitt01.level, 2);
        assert.strictEqual(abschnitt01.categories.length, 2, 'Abschnitt 01 hat 2 Unterabschnitte');

        // Ebene 3: Unterabschnitte
        const unterabschnitt01 = abschnitt01.categories[0];
        assert.strictEqual(unterabschnitt01.id, 'CTG_01_01_01');
        assert.strictEqual(unterabschnitt01.name, 'Unterabschnitt 01: Baugrube');
        assert.strictEqual(unterabschnitt01.items.length, 2, 'Unterabschnitt 01 hat 2 Positionen');

        const unterabschnitt02 = abschnitt01.categories[1];
        assert.strictEqual(unterabschnitt02.id, 'CTG_01_01_02');
        assert.strictEqual(unterabschnitt02.name, 'Unterabschnitt 02: Wasserhaltung und Entwässerung');
        assert.strictEqual(unterabschnitt02.items.length, 4, 'Unterabschnitt 02 hat 4 Positionen');

        // 2. Positionsbezogene Hierarchiezuweisung
        parsed01.items.forEach(item => {
            assert.ok(item.category, `Item ${item.oz_code} muss category zugewiesen haben`);
            assert.strictEqual(item.gewerk, '01 Rohbauarbeiten', 'Gewerk muss 01 Rohbauarbeiten sein');
            assert.strictEqual(item.abschnitt, 'Abschnitt 01: Erdarbeiten', 'Abschnitt muss Erdarbeiten sein');
            assert.ok(item.titel, 'Titel/Unterabschnitt muss gesetzt sein');
            assert.ok(item.parentId, 'ParentId der Kategorie muss gesetzt sein');
            assert.ok(Array.isArray(item.categoryPath), 'categoryPath muss ein Array sein');
            assert.strictEqual(item.categoryPath.length, 3, 'Pfadtiefe muss 3 sein');
        });

        // 3. Prüfung an Datei 04 (Hochbau: 2 separate Gewerke)
        const parsed04 = GAEBEngine.parseGAEBXML(xml04);
        assert.ok(parsed04.categories);
        assert.strictEqual(parsed04.categories.length, 2, 'Hochbau muss genau 2 Gewerke besitzen');
        assert.strictEqual(parsed04.categories[0].name, 'Gewerk 01: Erdarbeiten');
        assert.strictEqual(parsed04.categories[1].name, 'Gewerk 02: Beton- und Stahlbetonarbeiten');

        const betonItems = parsed04.items.filter(it => it.gewerk === 'Gewerk 02: Beton- und Stahlbetonarbeiten');
        assert.strictEqual(betonItems.length, 6, 'Muss 6 Positionen im Gewerk Betonarbeiten haben');
    });

    // =========================================================================
    // 3. Ordnungszahlen (OZ) Extraktion
    // =========================================================================
    test('3. Datenerhalt OZ: Zusammengesetzte Pfad-OZ UND isolierte RNoPart bleiben erhalten', () => {
        // Fall A: Expliziter <OZ>-Tag vorhanden (wie in 01_standard_hierarchie.x83)
        const parsed01 = GAEBEngine.parseGAEBXML(xml01);
        const item1 = parsed01.items[0];
        assert.strictEqual(item1.oz_code, '01.01.01.0010', 'Expliziter OZ-Tag wird als oz_code übernommen');
        assert.strictEqual(item1.oz, '01.01.01.0010', 'Alias oz entspricht oz_code');
        assert.strictEqual(item1.rno_part, '0010', 'Lokaler RNoPart bleibt unverändert isoliert erhalten');

        // Fall B: Standard-GAEB-Praxis: BoQCtgy hat RNoPart und Item hat nur leaf RNoPart (ohne redundanten <OZ>)
        const xmlWithoutOZ = `
        <GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA_XML_3.3">
          <Award><DP>83</DP><BoQ ID="B1"><BoQBody>
            <BoQCtgy ID="C1" RNoPart="01"><LblTx><p><span>Erdarbeiten</span></p></LblTx>
              <BoQBody>
                <BoQCtgy ID="C2" RNoPart="02"><LblTx><p><span>Baugrube</span></p></LblTx>
                  <BoQBody><Itemlist>
                    <Item ID="I1" RNoPart="0030">
                      <RNoPart>0030</RNoPart>
                      <Qty>10.0</Qty><QU>m³</QU>
                      <OutlineText><OutlTxt><TextOutl><span>Aushub</span></TextOutl></OutlTxt></OutlineText>
                    </Item>
                  </Itemlist></BoQBody>
                </BoQCtgy>
              </BoQBody>
            </BoQCtgy>
          </BoQBody></BoQ></Award>
        </GAEB>`;

        const parsedWithoutOZ = GAEBEngine.parseGAEBXML(xmlWithoutOZ);
        assert.strictEqual(parsedWithoutOZ.items.length, 1);
        const reconstructedItem = parsedWithoutOZ.items[0];

        // Verifikation: Pfad-OZ aus RNoPart-Stack '01' + '02' + '0030'
        assert.strictEqual(reconstructedItem.oz_code, '01.02.0030',
            'Parser muss hierarchischen OZ-Pfad 01.02.0030 aus den RNoPart-Knoten rekonstruieren');
        assert.strictEqual(reconstructedItem.rno_part, '0030',
            'Lokaler RNoPart 0030 muss separat erhalten bleiben');
    });

    // =========================================================================
    // 4. Kurztext vs. mehrzeiliger Langtext (CompleteText / DetailTxt)
    // =========================================================================
    test('4. Datenerhalt Texte: Mehrzeilige Langtexte (CompleteText) werden vollständig extrahiert', () => {
        const parsed01 = GAEBEngine.parseGAEBXML(xml01);
        const pos1 = parsed01.items[0];

        // Kurztext in "name" und "kurztext"
        assert.strictEqual(pos1.name, 'Mutterboden abtragen d=20cm');
        assert.strictEqual(pos1.kurztext, 'Mutterboden abtragen d=20cm');

        // Langtext ist vollständig vorhanden
        assert.ok(pos1.langtext, 'Feld langtext muss existieren');
        assert.ok(pos1.detailTxt, 'Feld detailTxt muss existieren');
        assert.ok(pos1.completeText, 'Feld completeText muss existieren');

        // Alle 3 Absätze des Langtextes müssen enthalten sein
        assert.ok(pos1.langtext.includes('Mutterboden bis 20 cm Dicke im Bereich des Baufeldes abschieben.'),
            'Absatz 1 muss im Langtext vorhanden sein');
        assert.ok(pos1.langtext.includes('Boden seitlich auf dem Grundstück zur späteren Wiederverwendung in Mieten lagern.'),
            'Absatz 2 muss im Langtext vorhanden sein');
        assert.ok(pos1.langtext.includes('Bodenklasse 1 bis 3 nach DIN 18300. Abrechnung nach Aufmaß im Urgelände.'),
            'Absatz 3 muss im Langtext vorhanden sein');
    });

    // =========================================================================
    // 5. Positionstypen (Normal, Grund/Wahl, Bedarf, Pauschale)
    // =========================================================================
    test('5. Datenerhalt Positionstypen: Wahl-, Bedarfs- und Pauschalpositionen werden korrekt differenziert', () => {
        const parsed02 = GAEBEngine.parseGAEBXML(xml02);
        assert.strictEqual(parsed02.items.length, 6);

        const posNormal = parsed02.items[0];     // 01.0010 Normal
        const posBase = parsed02.items[1];       // 01.0020 Grundposition (ALNGroup 01, ALNSerNo 00)
        const posAlternative = parsed02.items[2];// 01.0030 Wahlposition (ALNGroup 01, ALNSerNo 01)
        const posBedarfMitGB = parsed02.items[3];// 01.0040 Bedarfsposition mit Gesamtbetrag
        const posBedarfOhneGB = parsed02.items[4];// 01.0050 Bedarfsposition ohne Gesamtbetrag
        const posPauschal = parsed02.items[5];   // 01.0060 Pauschale

        // 1. Normalposition
        assert.strictEqual(posNormal.positions_art, 'NORMAL');
        assert.strictEqual(posNormal.in_endsumme_enthalten, 1);
        assert.strictEqual(posNormal.isAlternative, false);
        assert.strictEqual(posNormal.isBedarf, false);

        // 2. Grundposition
        assert.strictEqual(posBase.positions_art, 'GRUND');
        assert.strictEqual(posBase.isGrundposition, true);
        assert.strictEqual(posBase.isAlternative, false);
        assert.strictEqual(posBase.alnGroup, '01');
        assert.strictEqual(posBase.alnSerNo, '00');
        assert.strictEqual(posBase.in_endsumme_enthalten, 1);

        // 3. Wahl-/Alternativposition (Darf NICHT in Hauptsumme einfließen)
        assert.strictEqual(posAlternative.positions_art, 'WAHL');
        assert.strictEqual(posAlternative.isAlternative, true);
        assert.strictEqual(posAlternative.isGrundposition, false);
        assert.strictEqual(posAlternative.alnGroup, '01');
        assert.strictEqual(posAlternative.alnSerNo, '01');
        assert.strictEqual(posAlternative.in_endsumme_enthalten, 0, 'Wahlposition darf nicht in Gesamtsumme enthalten sein');

        // 4. Bedarfsposition mit Gesamtbetrag
        assert.strictEqual(posBedarfMitGB.positions_art, 'BEDARF_MIT_GB');
        assert.strictEqual(posBedarfMitGB.isBedarf, true);
        assert.strictEqual(posBedarfMitGB.withTotal, true);
        assert.strictEqual(posBedarfMitGB.in_endsumme_enthalten, 1, 'Bedarfsposition mit GB zählt zur Gesamtsumme');

        // 5. Bedarfsposition ohne Gesamtbetrag
        assert.strictEqual(posBedarfOhneGB.positions_art, 'BEDARF_OHNE_GB');
        assert.strictEqual(posBedarfOhneGB.isBedarf, true);
        assert.strictEqual(posBedarfOhneGB.withTotal, false);
        assert.strictEqual(posBedarfOhneGB.in_endsumme_enthalten, 0, 'Bedarfsposition ohne GB darf nicht in Gesamtsumme einfließen');

        // 6. Pauschalposition
        assert.strictEqual(posPauschal.positions_art, 'PAUSCHALE');
        assert.strictEqual(posPauschal.isPauschal, true);
        assert.strictEqual(posPauschal.einheit, 'Psch');
        assert.strictEqual(posPauschal.in_endsumme_enthalten, 1);
    });

    // =========================================================================
    // 6. Bieterangaben / Bietertextergänzungen (BiReq)
    // =========================================================================
    test('6. Datenerhalt Bieterangaben: BiReq-Knoten und Bietertextergänzungen werden extrahiert', () => {
        const parsed03 = GAEBEngine.parseGAEBXML(xml03);
        const posBieter = parsed03.items.find(it => it.oz_code === '01.0010');
        assert.ok(posBieter, 'Position 01.0010 muss existieren');

        assert.strictEqual(posBieter.requiresBidderInfo, true, 'requiresBidderInfo muss true sein');
        assert.ok(Array.isArray(posBieter.bieterangaben), 'bieterangaben muss ein Array sein');
        assert.strictEqual(posBieter.bieterangaben.length, 2, 'Muss 2 Bieterangaben (Fabrikat, Typ) enthalten');

        const fabrikat = posBieter.bieterangaben.find(b => b.label === 'Fabrikat');
        assert.ok(fabrikat, 'Bieterangabe für Fabrikat muss existieren');
        assert.strictEqual(fabrikat.id, 'BI_01_0010_01');

        const typ = posBieter.bieterangaben.find(b => b.label === 'Typ');
        assert.ok(typ, 'Bieterangabe für Typ muss existieren');
        assert.strictEqual(typ.id, 'BI_01_0010_02');
    });

    // =========================================================================
    // 7. Vorbemerkungen & Hinweistexte (Titel- und Positionsebene)
    // =========================================================================
    test('7. Datenerhalt Vorbemerkungen: Titelebene wird gespeichert, Hinweistext bleibt mengenneutral', () => {
        const parsed03 = GAEBEngine.parseGAEBXML(xml03);

        // 1. Vorbemerkung auf Titelebene (BoQCtgy > Description)
        assert.ok(parsed03.categories && parsed03.categories.length > 0);
        const gewerkSanitaer = parsed03.categories[0];
        assert.ok(gewerkSanitaer.vorbemerkung, 'Vorbemerkung am Gewerk muss existieren');
        assert.ok(gewerkSanitaer.vorbemerkung.includes('Vorbemerkung zu Gewerk 01 Sanitär:'),
            'Titel-Vorbemerkung muss Titelzeile enthalten');
        assert.ok(gewerkSanitaer.vorbemerkung.includes('DIN 1988 und DIN EN 806'),
            'Titel-Vorbemerkung muss technische Normen enthalten');

        // 2. Hinweistext auf Positionsebene (<Item ID="POS_01_0001" ItemType="Hinweistext">)
        const hinweisPos = parsed03.items.find(it => it.oz_code === '01.0001');
        assert.ok(hinweisPos, 'Hinweistext-Item muss existieren');

        assert.strictEqual(hinweisPos.isHinweistext, true, 'isHinweistext muss true sein');
        assert.strictEqual(hinweisPos.positions_art, 'HINWEISTEXT');
        assert.strictEqual(hinweisPos.menge, null, 'Hinweistext darf KEINE Menge 1.0 erhalten (bleibt null)');
        assert.strictEqual(hinweisPos.einheit, '', 'Hinweistext darf KEINE Fallback-Einheit Stk. erhalten');
        assert.strictEqual(hinweisPos.in_endsumme_enthalten, 0, 'Hinweistext darf nicht in Endsumme fließen');
        assert.ok(hinweisPos.langtext.includes('DIN 4109 Beiblatt 2'), 'Hinweistext-Langtext muss vollständig erhalten bleiben');
    });

    // =========================================================================
    // 8. Einheitspreis-Aufgliederung (UPComponents / EFB-Formblätter)
    // =========================================================================
    test('8. Datenerhalt EP-Aufgliederung: UPComponents (Lohn, Stoff, Gerät, Sonstiges) werden extrahiert', () => {
        const parsed03 = GAEBEngine.parseGAEBXML(xml03);
        const posRohr = parsed03.items.find(it => it.oz_code === '01.0020');
        assert.ok(posRohr, 'Position 01.0020 muss existieren');

        assert.ok(posRohr.upComponents, 'upComponents-Objekt muss existieren');
        assert.strictEqual(posRohr.upComponents.lohn, 28.50, 'Lohnanteil muss 28.50 sein');
        assert.strictEqual(posRohr.upComponents.stoff, 34.20, 'Stoffanteil muss 34.20 sein');
        assert.strictEqual(posRohr.upComponents.gerat, 4.10, 'Geräteanteil muss 4.10 sein');
        assert.strictEqual(posRohr.upComponents.sonstiges, 2.20, 'Sonstiges muss 2.20 sein');

        // Direkte Schnellzugriff-Attribute
        assert.strictEqual(posRohr.lohn, 28.50);
        assert.strictEqual(posRohr.stoff, 34.20);
        assert.strictEqual(posRohr.gerat, 4.10);
        assert.strictEqual(posRohr.sonstiges, 2.20);
    });

    // =========================================================================
    // 9. Reales Hochbau-Muster: Vollständiger Erhalt von Hierarchie und Spezifikationen
    // =========================================================================
    test('9. Reales Hochbau-Muster (04_reales_muster_hochbau.x83): Hierarchien und Langtexte vollständig erhalten', () => {
        const parsed04 = GAEBEngine.parseGAEBXML(xml04);
        assert.strictEqual(parsed04.items.length, 9, 'Alle 9 Hochbau-Positionen eingelesen');

        // Standardposition mit Qty und QU
        const posBewehrung = parsed04.items.find(it => it.oz_code === '02.01.0040');
        assert.ok(posBewehrung);
        assert.strictEqual(posBewehrung.menge, 12.5);
        assert.strictEqual(posBewehrung.einheit, 't');
        assert.strictEqual(posBewehrung.name, 'Betonstahl B500B liefern und verlegen');
        assert.strictEqual(posBewehrung.gewerk, 'Gewerk 02: Beton- und Stahlbetonarbeiten');

        // Technische Langtext-Spezifikationen erhalten
        const posBodenplatte = parsed04.items.find(it => it.oz_code === '02.01.0030');
        assert.ok(posBodenplatte);
        assert.strictEqual(posBodenplatte.menge, 114);
        assert.strictEqual(posBodenplatte.einheit, 'm³');
        assert.ok(posBodenplatte.langtext.includes('WU-Richtlinie des DAfStb'),
            'WU-Richtlinie im Langtext der Bodenplatte muss erhalten bleiben');
        assert.ok(posBodenplatte.langtext.includes('C25/30, XC4, XD1, XA1'),
            'Betongüten im Langtext müssen erhalten bleiben');
    });

    // =========================================================================
    // 10. GAEB/BVBS-angelehntes Testmuster (05_muster_angelehnt_an_gaeb_bvbs.x83)
    // =========================================================================
    test('10. Angelehntes Testmuster: Vollständige Erfassung von Hierarchie und ZTVE-Spezifikationen', () => {
        const parsed05 = GAEBEngine.parseGAEBXML(xml05);
        assert.strictEqual(parsed05.items.length, 5, 'Alle 5 Positionen des Testmusters extrahiert');

        // Hierarchie
        assert.ok(parsed05.categories);
        assert.strictEqual(parsed05.categories.length, 1);
        assert.strictEqual(parsed05.categories[0].name, '01 Entwässerungs- und Erdarbeiten');
        assert.strictEqual(parsed05.categories[0].categories.length, 2, '2 Abschnitte in Gewerk 01');

        const posPlanum = parsed05.items.find(it => it.oz_code === '01.01.0020');
        assert.ok(posPlanum);
        assert.strictEqual(posPlanum.menge, 2400.0);
        assert.strictEqual(posPlanum.einheit, 'm²');
        assert.strictEqual(posPlanum.gewerk, '01 Entwässerungs- und Erdarbeiten');
        assert.ok(posPlanum.langtext.includes('ZTVE-StB'), 'ZTVE-StB im Langtext muss erhalten bleiben');

        const posSchacht = parsed05.items.find(it => it.oz_code === '01.02.0020');
        assert.ok(posSchacht);
        assert.strictEqual(posSchacht.menge, 4.0);
        assert.strictEqual(posSchacht.einheit, 'Stk');
        assert.ok(posSchacht.langtext.includes('Schachtabdeckung Klasse D 400'),
            'Schachtabdeckung im Langtext muss erhalten bleiben');
    });

    // =========================================================================
    // 11. Robuste Fehlerbehandlung: Ungültige XML-Dateien & Nicht-GAEB-Dateien
    // =========================================================================
    test('11. Fehlerbehandlung: Ungültige Eingaben und Nicht-GAEB-XML werfen klare Exceptions', () => {
        // Leere oder ungültige Strings
        assert.throws(() => {
            GAEBEngine.parseGAEBXML('');
        }, /Ungültiger GAEB-Inhalt/);

        assert.throws(() => {
            GAEBEngine.parseGAEBXML(null);
        }, /Ungültiger GAEB-Inhalt/);

        // XML mit Syntaxfehlern (Malformed XML)
        const malformedXML = '<GAEB><Award><DP>83</DP><unclosedTag></Award></GAEB>';
        assert.throws(() => {
            GAEBEngine.parseGAEBXML(malformedXML);
        }, /XML-Parsing-Fehler/);

        // Wohlgeformtes XML, aber kein GAEB-Wurzelknoten
        const nonGAEBXML = '<?xml version="1.0"?><Invoice><Total>100</Total></Invoice>';
        assert.throws(() => {
            GAEBEngine.parseGAEBXML(nonGAEBXML);
        }, /Wurzelknoten <GAEB> fehlt/);
    });

    // =========================================================================
    // 12. Erkennung doppelter Ordnungszahlen (OZ-Kollisionen)
    // =========================================================================
    test('12. Robuste OZ-Verwaltung: Doppelte Ordnungszahlen werden erkannt und protokolliert', () => {
        const xmlWithDuplicateOZ = `
        <GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA_XML_3.3">
          <Award><DP>83</DP><BoQ ID="B1"><BoQBody>
            <BoQCtgy ID="C1" RNoPart="01"><LblTx><p><span>Gewerk 1</span></p></LblTx>
              <BoQBody><Itemlist>
                <Item ID="POS_1" RNoPart="0010">
                  <OZ>01.0010</OZ>
                  <Qty>5.0</Qty><QU>m²</QU>
                  <OutlineText><OutlTxt><TextOutl><span>Erster Belag</span></TextOutl></OutlTxt></OutlineText>
                </Item>
                <Item ID="POS_2" RNoPart="0010">
                  <OZ>01.0010</OZ>
                  <Qty>10.0</Qty><QU>m²</QU>
                  <OutlineText><OutlTxt><TextOutl><span>Zweiter Belag mit doppelter OZ</span></TextOutl></OutlTxt></OutlineText>
                </Item>
              </Itemlist></BoQBody>
            </BoQCtgy>
          </BoQBody></BoQ></Award>
        </GAEB>`;

        const parsed = GAEBEngine.parseGAEBXML(xmlWithDuplicateOZ);
        assert.strictEqual(parsed.items.length, 2);
        assert.strictEqual(parsed.items[0].oz_code, '01.0010');
        assert.strictEqual(parsed.items[1].oz_code, '01.0010');

        // Die zweite Position muss als Duplikat markiert sein
        assert.strictEqual(parsed.items[1].isDuplicateOZ, true);
        assert.ok(parsed.warnings && parsed.warnings.length > 0, 'Parser muss Warning für doppelte OZ enthalten');
        assert.ok(parsed.warnings.some(w => w.includes('01.0010')), 'Warnmeldung muss die betroffene OZ 01.0010 nennen');
    });

    // =========================================================================
    // 13. Konsistenzprüfung zwischen Kategorien-Baum und flacher Item-Liste
    // =========================================================================
    test('13. Konsistenzprüfung: Baum-Struktur (categories) und flache Liste (items) sind synchron', () => {
        [xml01, xml02, xml03, xml04, xml05].forEach((xml, idx) => {
            const parsed = GAEBEngine.parseGAEBXML(xml);
            assert.ok(parsed.items.length > 0, `Datei ${ALL_FIXTURES[idx]} muss Positionen haben`);

            // Rekursiv alle Items aus categories sammeln
            const treeItems = [];
            function collectCategoryItems(category) {
                if (category.items && category.items.length > 0) {
                    treeItems.push(...category.items);
                }
                if (category.categories && category.categories.length > 0) {
                    category.categories.forEach(sub => collectCategoryItems(sub));
                }
            }

            if (parsed.categories) {
                parsed.categories.forEach(cat => collectCategoryItems(cat));
            }

            // Anzahl im Baum muss exakt der flachen Liste entsprechen
            assert.strictEqual(treeItems.length, parsed.items.length,
                `Datei ${ALL_FIXTURES[idx]}: Item-Anzahl im Baum (${treeItems.length}) muss mit flacher Liste (${parsed.items.length}) übereinstimmen`);

            // Jedes Item im Baum muss mit exakt derselben ID in der flachen Liste auffindbar sein
            treeItems.forEach((tItem, itemIdx) => {
                const flatItem = parsed.items[itemIdx];
                assert.strictEqual(tItem.id, flatItem.id);
                assert.strictEqual(tItem.oz_code, flatItem.oz_code);
            });
        });
    });
});
