/**
 * tests/gaeb_x83_import_audit.test.js
 * 
 * Systematische Audit-Testsuite für den GAEB DA XML (X83) Import von W-Link.
 * Überprüft anhand der 4 Testfixtures (tests/fixtures/gaeb_x83/*.x83) genau,
 * was die aktuelle Engine (GAEBEngine.parseGAEBXML in js/gaeb.js) korrekt
 * erfasst und welche Strukturdaten, Texte und Typen verloren gehen.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const GAEBEngine = require('../js/gaeb');

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'gaeb_x83');

function loadFixture(filename) {
    const filePath = path.join(FIXTURES_DIR, filename);
    return fs.readFileSync(filePath, 'utf8');
}

describe('GAEB X83 Import Audit: Was W-Link importiert und was verloren geht', () => {

    const xml01 = loadFixture('01_standard_hierarchie.x83');
    const xml02 = loadFixture('02_positionstypen_wahl_bedarf.x83');
    const xml03 = loadFixture('03_bieterangaben_vorbemerkungen_ep.x83');
    const xml04 = loadFixture('04_reales_muster_hochbau.x83');

    // =========================================================================
    // 0. Basisfunktion des aktuellen Parsers
    // =========================================================================
    test('0. Basisfunktion: Parser liest Kopfdaten und erzeugt flache Item-Liste', () => {
        const parsed01 = GAEBEngine.parseGAEBXML(xml01);
        assert.ok(parsed01.projectInfo, 'projectInfo muss existieren');
        assert.strictEqual(parsed01.projectInfo.name, 'Neubau Verwaltungsgebäude Campus Nord');
        assert.strictEqual(parsed01.projectInfo.gaebPhase, 'X83');
        assert.strictEqual(parsed01.projectInfo.currency, 'EUR');
        assert.strictEqual(parsed01.items.length, 6, 'Muss 6 Positionen extrahieren');

        const parsed04 = GAEBEngine.parseGAEBXML(xml04);
        assert.strictEqual(parsed04.projectInfo.name, 'Neubau Mehrfamilienhaus mit Tiefgarage Sonnenallee 42');
        assert.strictEqual(parsed04.projectInfo.gaebPhase, 'X83');
        assert.strictEqual(parsed04.items.length, 9, 'Muss 9 Positionen im Hochbau-Muster extrahieren');
    });

    // =========================================================================
    // 1. Hierarchie-Ebenen (BoQCtgy, Gewerke, Titel)
    // =========================================================================
    test('1. Audit Hierarchie: BoQCtgy-Ebenen (Gewerke, Abschnitte, Titel) gehen vollständig verloren', () => {
        const parsed01 = GAEBEngine.parseGAEBXML(xml01);

        // Im XML 01 existieren 3 Hierarchie-Ebenen:
        // - Gewerk 01 (CTG_01)
        // - Abschnitt 01 (CTG_01_01)
        // - Unterabschnitt 01 (CTG_01_01_01) und Unterabschnitt 02 (CTG_01_01_02)
        assert.ok(xml01.includes('ID="CTG_01"'), 'XML enthält Gewerk-Ebene');
        assert.ok(xml01.includes('ID="CTG_01_01"'), 'XML enthält Abschnitt-Ebene');
        assert.ok(xml01.includes('ID="CTG_01_01_01"'), 'XML enthält Unterabschnitt-Ebene');

        // Audit-Befund im Parser-Ergebnis:
        // Die Struktur ist komplett flach. Es gibt kein Feld "categories", "sections", "titel" oder "gewerke"
        assert.strictEqual(parsed01.categories, undefined, 'Parser hat keine Kategorienstruktur');
        assert.strictEqual(parsed01.sections, undefined, 'Parser hat keine Abschnitte');
        assert.strictEqual(parsed01.hierarchy, undefined, 'Parser hat keine Hierarchie');

        // Auch an den Items selbst existiert keine Hierarchie-Referenz oder Gewerk-Zuweisung
        parsed01.items.forEach(item => {
            assert.strictEqual(item.category, undefined, 'Item hat keine Kategorie-Zuweisung');
            assert.strictEqual(item.titel, undefined, 'Item hat keinen Titel-Namen');
            assert.strictEqual(item.gewerk, undefined, 'Item hat keinen Gewerk-Namen');
            assert.strictEqual(item.parentId, undefined, 'Item hat keine Parent-ID');
        });

        // Prüfung an Datei 04 (Hochbau: Gewerk 01 Erdarbeiten, Gewerk 02 Betonarbeiten)
        const parsed04 = GAEBEngine.parseGAEBXML(xml04);
        assert.strictEqual(parsed04.categories, undefined);
        const gewerkNamesFoundInItems = parsed04.items.some(it => 
            (it.name && it.name.includes('Beton- und Stahlbetonarbeiten')) || 
            (it.gewerk && it.gewerk.includes('Erdarbeiten'))
        );
        assert.strictEqual(gewerkNamesFoundInItems, false, 'Gewerksbezeichnungen erscheinen nirgends in den Items');
    });

    // =========================================================================
    // 2. Ordnungszahlen (OZ) Extraktion
    // =========================================================================
    test('2. Audit OZ: Zusammengesetzte Pfad-OZ vs. isolierter RNoPart-Knoten', () => {
        // Fall A: Expliziter <OZ>-Tag vorhanden (wie in 01_standard_hierarchie.x83)
        const parsed01 = GAEBEngine.parseGAEBXML(xml01);
        assert.strictEqual(parsed01.items[0].oz_code, '01.01.01.0010', 'Expliziter OZ-Tag wird übernommen');

        // Fall B: Standard-GAEB-Praxis, in der BoQCtgy RNoPart hat und Item nur leaf RNoPart besitzt
        // Simuliere XML ohne redundanten <OZ>-Tag auf Item-Ebene
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
        // GAP-BEFUND: Ohne explizites <OZ> wird nur '0030' extrahiert, die Pfad-OZ '01.02.0030' geht verloren!
        assert.strictEqual(parsedWithoutOZ.items[0].oz_code, '0030', 
            'Befund: Parser liest nur den lokalen RNoPart und rekonstruiert nicht die übergeordnete OZ 01.02.0030');
    });

    // =========================================================================
    // 3. Kurztext vs. mehrzeiliger Langtext (CompleteText / DetailTxt)
    // =========================================================================
    test('3. Audit Texte: Mehrzeilige Langtexte (CompleteText) werden vollständig verworfen', () => {
        const parsed01 = GAEBEngine.parseGAEBXML(xml01);
        const pos1 = parsed01.items[0];

        // Kurztext wurde in "name" abgelegt
        assert.strictEqual(pos1.name, 'Mutterboden abtragen d=20cm');

        // Im Original-XML existiert ein ausführlicher 3-teiliger Langtext:
        assert.ok(xml01.includes('Mutterboden bis 20 cm Dicke im Bereich des Baufeldes abschieben.'));
        assert.ok(xml01.includes('Boden seitlich auf dem Grundstück zur späteren Wiederverwendung in Mieten lagern.'));
        assert.ok(xml01.includes('Bodenklasse 1 bis 3 nach DIN 18300.'));

        // GAP-BEFUND: Der Langtext existiert im Parsingergebnis überhaupt nicht!
        assert.strictEqual(pos1.langtext, undefined, 'Feld langtext fehlt vollständig');
        assert.strictEqual(pos1.detailTxt, undefined, 'Feld detailTxt fehlt vollständig');
        assert.strictEqual(pos1.completeText, undefined, 'Feld completeText fehlt vollständig');
        assert.strictEqual(pos1.description, undefined, 'Feld description fehlt vollständig');

        // Die Absätze 2 und 3 des Langtextes sind nirgends im Objekt enthalten
        assert.strictEqual(JSON.stringify(pos1).includes('Boden seitlich auf dem Grundstück'), false,
            'Langtext-Absatz 2 geht spurlos verloren');
        assert.strictEqual(JSON.stringify(pos1).includes('Bodenklasse 1 bis 3 nach DIN 18300'), false,
            'Langtext-Absatz 3 geht spurlos verloren');
    });

    // =========================================================================
    // 4. Positionstypen (Normal, Grund/Wahl, Bedarf, Pauschale)
    // =========================================================================
    test('4. Audit Positionstypen: Wahl-, Bedarfs- und Pauschalpositionen werden verflacht', () => {
        const parsed02 = GAEBEngine.parseGAEBXML(xml02);
        assert.strictEqual(parsed02.items.length, 6);

        const posNormal = parsed02.items[0];     // 01.0010 Normal
        const posBase = parsed02.items[1];       // 01.0020 Grundposition (ALNGroup 01, ALNSerNo 00)
        const posAlternative = parsed02.items[2];// 01.0030 Wahlposition (ALNGroup 01, ALNSerNo 01)
        const posBedarfMitGB = parsed02.items[3];// 01.0040 Bedarfsposition mit Gesamtbetrag
        const posBedarfOhneGB = parsed02.items[4];// 01.0050 Bedarfsposition ohne Gesamtbetrag
        const posPauschal = parsed02.items[5];   // 01.0060 Pauschale

        // GAP-BEFUND: Alle Positionen erhalten unterschiedslos denselben Standard-Cost-Type:
        assert.strictEqual(posNormal.cost_type, 'MATERIAL');
        assert.strictEqual(posBase.cost_type, 'MATERIAL');
        assert.strictEqual(posAlternative.cost_type, 'MATERIAL');
        assert.strictEqual(posBedarfMitGB.cost_type, 'MATERIAL');
        assert.strictEqual(posBedarfOhneGB.cost_type, 'MATERIAL');
        assert.strictEqual(posPauschal.cost_type, 'MATERIAL');

        // Keine Erkennung von Grund- oder Alternativpositionen
        assert.strictEqual(posAlternative.itemType, undefined, 'Wahlposition verliert ItemType');
        assert.strictEqual(posAlternative.isAlternative, undefined, 'Keine Kennzeichnung als Alternativposition');
        assert.strictEqual(posAlternative.alnGroup, undefined, 'ALNGroup geht verloren');
        assert.strictEqual(posAlternative.alnSerNo, undefined, 'ALNSerNo geht verloren');

        // Keine Erkennung von Bedarfspositionen (Provis)
        assert.strictEqual(posBedarfMitGB.isBedarf, undefined, 'Bedarfsposition mit GB wird nicht als solche erkannt');
        assert.strictEqual(posBedarfMitGB.provis, undefined, 'Provis-Tag geht verloren');
        assert.strictEqual(posBedarfOhneGB.isBedarf, undefined, 'Bedarfsposition ohne GB wird nicht als solche erkannt');
        assert.strictEqual(posBedarfOhneGB.withTotal, undefined, 'withTotal-Attribut geht verloren');

        // Pauschalposition wird nur an der Einheit "Psch" erkennbar, nicht als eigener Positionstyp
        assert.strictEqual(posPauschal.einheit, 'Psch');
        assert.strictEqual(posPauschal.isPauschal, undefined);
    });

    // =========================================================================
    // 5. Bieterangaben / Bietertextergänzungen
    // =========================================================================
    test('5. Audit Bieterangaben: BiReq-Knoten und Bietertextergänzungen werden ignoriert', () => {
        const parsed03 = GAEBEngine.parseGAEBXML(xml03);
        // Position 01.0010 (Wand-WC Tiefspüler) hat Bieterangaben für Fabrikat und Typ
        const posBieter = parsed03.items.find(it => it.oz_code === '01.0010');
        assert.ok(posBieter, 'Position 01.0010 muss existieren');

        // Im XML 03 ist <BiReq> mit zwei BiEl-Elementen deklariert:
        assert.ok(xml03.includes('<BiReq>'));
        assert.ok(xml03.includes('<Lbl>Fabrikat</Lbl>'));
        assert.ok(xml03.includes('<Lbl>Typ</Lbl>'));

        // GAP-BEFUND: Der Parser ignoriert Bieterangaben vollkommen
        assert.strictEqual(posBieter.biReq, undefined, 'biReq fehlt');
        assert.strictEqual(posBieter.bieterangaben, undefined, 'bieterangaben fehlt');
        assert.strictEqual(posBieter.requiresBidderInfo, undefined, 'Kennzeichnung für Bieterangabe fehlt');
        assert.strictEqual(JSON.stringify(posBieter).includes('Fabrikat'), false, 'Fabrikat-Feld fehlt im Item');
    });

    // =========================================================================
    // 6. Vorbemerkungen & Hinweistexte (Titel- und Positionsebene)
    // =========================================================================
    test('6. Audit Vorbemerkungen: Titelebene wird verworfen, Hinweistext als Position fehlinterpretiert', () => {
        const parsed03 = GAEBEngine.parseGAEBXML(xml03);

        // BEFUND A: Vorbemerkung auf Titelebene (BoQCtgy > Description) wird komplett ignoriert
        assert.ok(xml03.includes('Vorbemerkung zu Gewerk 01 Sanitär:'));
        const vorbemerkungFound = JSON.stringify(parsed03).includes('Vorbemerkung zu Gewerk 01 Sanitär');
        assert.strictEqual(vorbemerkungFound, false, 'Vorbemerkung auf Titelebene geht spurlos verloren');

        // BEFUND B: Hinweistext auf Positionsebene (<Item ID="POS_01_0001" ItemType="Hinweistext">)
        // Im XML hat dieser Knoten KEIN <Qty>, KEIN <QU> und KEIN <UP>
        const hinweisPos = parsed03.items.find(it => it.oz_code === '01.0001');
        assert.ok(hinweisPos, 'Hinweistext wurde als Item geparst');

        // KRITISCHER FEHLER DES AKTUELLEN PARSERS:
        // Da <Qty> fehlt, setzt der Parser fallback menge = 1.0
        // Da <QU> fehlt, setzt der Parser fallback einheit = 'Stk.'
        // Dadurch wird ein reiner Hinweistext zu einer abrechenbaren Leistungsposition mit Menge 1 Stk.!
        assert.strictEqual(hinweisPos.menge, 1.0, 'KRITISCH: Hinweistext erhält fälschlich Menge 1.0');
        assert.strictEqual(hinweisPos.einheit, 'Stk.', 'KRITISCH: Hinweistext erhält fälschlich Einheit Stk.');
        assert.strictEqual(hinweisPos.isHinweistext, undefined, 'Nicht als Hinweistext markiert');
    });

    // =========================================================================
    // 7. Einheitspreis-Aufgliederung (UPComponents / EFB-Formblätter)
    // =========================================================================
    test('7. Audit EP-Aufgliederung: UPComponents (Lohn, Stoff, Gerät, Sonstiges) werden ignoriert', () => {
        const parsed03 = GAEBEngine.parseGAEBXML(xml03);
        const posRohr = parsed03.items.find(it => it.oz_code === '01.0020');
        assert.ok(posRohr, 'Position 01.0020 muss existieren');

        // Im XML 03 sind Kalkulationsbestandteile deklariert:
        // Labor: 28.50, Material: 34.20, Plant: 4.10, Misc: 2.20
        assert.ok(xml03.includes('<UPComponents>'));
        assert.ok(xml03.includes('<Labor>28.50</Labor>'));
        assert.ok(xml03.includes('<Material>34.20</Material>'));

        // GAP-BEFUND: Der Parser ignoriert UPComponents vollständig
        assert.strictEqual(posRohr.upComponents, undefined, 'upComponents fehlt');
        assert.strictEqual(posRohr.lohn, undefined, 'lohn fehlt');
        assert.strictEqual(posRohr.stoff, undefined, 'stoff fehlt');
        assert.strictEqual(posRohr.gerat, undefined, 'gerat fehlt');
        assert.strictEqual(posRohr.sonstiges, undefined, 'sonstiges fehlt');
    });

    // =========================================================================
    // 8. Reales Hochbau-Muster: Prüfung von Mengen, Einheiten und Datenverlusten
    // =========================================================================
    test('8. Audit Reales Hochbau-Muster (04_reales_muster_hochbau.x83)', () => {
        const parsed04 = GAEBEngine.parseGAEBXML(xml04);
        assert.strictEqual(parsed04.items.length, 9, 'Alle 9 Hochbau-Positionen eingelesen');

        // Was funktioniert korrekt:
        // - Mengen und Einheiten werden für Standardpositionen mit Qty und QU korrekt geparst
        const posBewehrung = parsed04.items.find(it => it.oz_code === '02.01.0040');
        assert.ok(posBewehrung);
        assert.strictEqual(posBewehrung.menge, 12.5);
        assert.strictEqual(posBewehrung.einheit, 't');
        assert.strictEqual(posBewehrung.name, 'Betonstahl B500B liefern und verlegen');

        // Was verloren geht:
        // 1. Die beiden Gewerke ("Gewerk 01: Erdarbeiten", "Gewerk 02: Beton- und Stahlbetonarbeiten")
        // 2. Die drei Titel ("Titel 01: Baugrube...", "Titel 01: Gründung...", "Titel 02: Aufgehende Kellerwände")
        // 3. Alle technischen Spezifikationen im Langtext (z. B. "C25/30, XC4, XD1, XA1", "Biegelisten des Tragwerksplaners")
        const posBodenplatte = parsed04.items.find(it => it.oz_code === '02.01.0030');
        assert.ok(posBodenplatte);
        assert.strictEqual(posBodenplatte.menge, 114);
        assert.strictEqual(posBodenplatte.einheit, 'm³');
        assert.strictEqual(JSON.stringify(posBodenplatte).includes('WU-Richtlinie des DAfStb'), false,
            'Spezifikationen im Langtext der Bodenplatte fehlen im Parsingergebnis');
    });
});
