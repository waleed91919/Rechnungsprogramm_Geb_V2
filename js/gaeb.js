/**
 * gaeb.js - Modularer Einstiegspunkt für GAEB DA XML (Phasen X83, X84 & X89)
 * Bindet spezialisierte Module aus js/gaeb/ ein:
 * - js/gaeb/xml_dom_utils.js: DOM-Parser & XML-Utilities
 * - js/gaeb/item_reader.js: Kurz-/Langtext, Mengen, Einheiten, Null-sichere Preise
 * - js/gaeb/item_types.js: Normal, Grund, Wahl, Bedarf, Pauschale, BiReq, UPComponents
 * - js/gaeb/hierarchy_builder.js: BoQCtgy-Hierarchie & Ordnungszahlen
 */

var XMLDomUtils = (typeof require === 'function')
    ? require('./gaeb/xml_dom_utils.js')
    : (typeof window !== 'undefined' ? window.GAEB_XMLDomUtils : null);
var HierarchyBuilder = (typeof require === 'function')
    ? require('./gaeb/hierarchy_builder.js')
    : (typeof window !== 'undefined' ? window.GAEB_HierarchyBuilder : null);
var ItemReader = (typeof require === 'function')
    ? require('./gaeb/item_reader.js')
    : (typeof window !== 'undefined' ? window.GAEB_ItemReader : null);
var ItemTypes = (typeof require === 'function')
    ? require('./gaeb/item_types.js')
    : (typeof window !== 'undefined' ? window.GAEB_ItemTypes : null);

const getXMLDomUtils = () => (typeof XMLDomUtils !== 'undefined' && XMLDomUtils) || 
    (typeof require === 'function' ? require('./gaeb/xml_dom_utils.js') : (typeof window !== 'undefined' ? window.GAEB_XMLDomUtils : null));
const getHierarchyBuilder = () => (typeof HierarchyBuilder !== 'undefined' && HierarchyBuilder) || 
    (typeof require === 'function' ? require('./gaeb/hierarchy_builder.js') : (typeof window !== 'undefined' ? window.GAEB_HierarchyBuilder : null));
const getItemReader = () => (typeof ItemReader !== 'undefined' && ItemReader) || 
    (typeof require === 'function' ? require('./gaeb/item_reader.js') : (typeof window !== 'undefined' ? window.GAEB_ItemReader : null));
const getItemTypes = () => (typeof ItemTypes !== 'undefined' && ItemTypes) || 
    (typeof require === 'function' ? require('./gaeb/item_types.js') : (typeof window !== 'undefined' ? window.GAEB_ItemTypes : null));

class GAEBEngine {
    // Delegationsmethoden für Abwärtskompatibilität
    static getDOMParser() {
        const u = getXMLDomUtils();
        return u ? u.getDOMParser() : new DOMParser();
    }

    static getDirectChildElements(parent, tagName = null) {
        const u = getXMLDomUtils();
        return u ? u.getDirectChildElements(parent, tagName) : [];
    }

    static findFirstDescendant(element, tagName) {
        const u = getXMLDomUtils();
        return u ? u.findFirstDescendant(element, tagName) : null;
    }

    static extractTextLines(containerElement) {
        const u = getXMLDomUtils();
        return u ? u.extractTextLines(containerElement) : '';
    }

    static extractKurztext(itemElem, ozCode) {
        const r = getItemReader();
        return r ? r.extractKurztext(itemElem, ozCode) : '';
    }

    static extractLangtext(itemElem) {
        const r = getItemReader();
        return r ? r.extractLangtext(itemElem) : '';
    }

    static escapeXML(str) {
        const u = getXMLDomUtils();
        return u ? u.escapeXML(str) : String(str || '');
    }

    /**
     * Parsed ein GAEB XML Dokument (z.B. X83) in eine hierarchische Objektstruktur.
     * Erhält BoQCtgy-Hierarchien, Pfad-OZs, RNoPart, vollständige Langtexte,
     * Vorbemerkungen, Positionstypen, Bieterangaben und UPComponents.
     * Fehlende Preise in X83 bleiben strikt null (keine 0.00 Erfindung).
     * @param {string} xmlString - GAEB XML Datei-Inhalt
     * @returns {Object} { projectInfo, items, categories, hierarchy, sections, warnings }
     */
    static parseGAEBXML(xmlString) {
        if (!xmlString || typeof xmlString !== 'string') {
            throw new Error('Ungültiger GAEB-Inhalt.');
        }

        // BOM (Byte Order Mark \uFEFF) am Stringanfang für DOMParser entfernen
        if (xmlString.charCodeAt(0) === 0xFEFF) {
            xmlString = xmlString.slice(1);
        }

        const parser = GAEBEngine.getDOMParser();
        let doc;
        try {
            doc = parser.parseFromString(xmlString, 'text/xml');
        } catch (e) {
            throw new Error('XML-Parsing-Fehler: ' + e.message);
        }

        const parserErrors = doc.getElementsByTagName('parsererror');
        if (parserErrors && parserErrors.length > 0) {
            const errMsg = parserErrors[0].textContent.trim();
            throw new Error('XML-Parsing-Fehler: ' + errMsg);
        }

        const root = doc.documentElement;
        if (!root || (root.localName !== 'GAEB' && root.nodeName !== 'GAEB')) {
            throw new Error('Ungültiger GAEB-Inhalt: Wurzelknoten <GAEB> fehlt.');
        }

        const projectInfo = {
            name: 'GAEB Import',
            gaebPhase: 'X83',
            currency: 'EUR'
        };

        // GAEB-Phase aus Award/DP, GAEBInfo/DP oder DP
        const awardElem = GAEBEngine.findFirstDescendant(doc, 'Award');
        const gaebInfoElem = GAEBEngine.findFirstDescendant(doc, 'GAEBInfo');
        const dpElem = (awardElem && GAEBEngine.findFirstDescendant(awardElem, 'DP')) ||
                       (gaebInfoElem && GAEBEngine.findFirstDescendant(gaebInfoElem, 'DP')) ||
                       GAEBEngine.findFirstDescendant(doc, 'DP');
        if (dpElem) {
            let phase = dpElem.textContent.trim();
            if (/^\d{2}$/.test(phase)) {
                phase = 'X' + phase;
            }
            projectInfo.gaebPhase = phase;
        }

        // Währung
        const curElem = GAEBEngine.findFirstDescendant(doc, 'Cur') || GAEBEngine.findFirstDescendant(doc, 'Currency');
        if (curElem) {
            projectInfo.currency = curElem.textContent.trim();
        }

        // Projektname
        const boqInfoElem = GAEBEngine.findFirstDescendant(doc, 'BoQInfo');
        const nameElem = (boqInfoElem && GAEBEngine.findFirstDescendant(boqInfoElem, 'Name')) ||
                         GAEBEngine.findFirstDescendant(doc, 'PrjName') ||
                         (awardElem && GAEBEngine.findFirstDescendant(awardElem, 'Name'));
        if (nameElem && nameElem.textContent.trim()) {
            projectInfo.name = nameElem.textContent.trim();
        }

        // Hierarchie & Positionen aufbauen
        const hb = getHierarchyBuilder();
        const buildResult = hb ? hb.build(doc) : { allItems: [], topLevelCategories: [], warnings: [] };

        const warnings = [...(buildResult.warnings || [])];
        if (!dpElem) {
            warnings.push('GAEB-Phase (DP) nicht explizit im Dokument deklariert; Standardphase X83 angenommen.');
        } else if (projectInfo.gaebPhase !== 'X83' && projectInfo.gaebPhase !== '83') {
            warnings.push(`Hinweis: Dokument deklariert GAEB-Phase '${projectInfo.gaebPhase}' (erwartet: X83 Angebotsaufforderung).`);
        }

        return {
            projectInfo,
            items: buildResult.allItems,
            categories: buildResult.topLevelCategories.length > 0 ? buildResult.topLevelCategories : undefined,
            hierarchy: buildResult.topLevelCategories.length > 0 ? buildResult.topLevelCategories : undefined,
            sections: buildResult.topLevelCategories.length > 0 ? buildResult.topLevelCategories : undefined,
            warnings: warnings
        };
    }

    /**
     * Erzeugt eine standardkonforme GAEB DA XML 3.3 Angebotsdatei (Phase X84 / 84) aus berechneten Positionen.
     * @param {string} projectName - Bezeichnung des Bauprojekts
     * @param {Array} positionen - LV-Positionen
     * @returns {string} XML-String nach GAEB DA XML 3.3
     */
    static generateGAEBX84XML(projectName, positionen = []) {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0];

        let totalNet = 0;
        let itemsXML = '';

        positionen.forEach((pos, idx) => {
            const oz = pos.oz_code || pos.pos_nr || `01.01.${String(idx + 1).padStart(4, '0')}`;
            const menge = parseFloat(pos.menge) || 0;
            const ep = parseFloat(pos.preis) || 0;
            const gp = menge * ep;
            totalNet += gp;
            const name = GAEBEngine.escapeXML(pos.name || `Position ${oz}`);
            const einheit = GAEBEngine.escapeXML(pos.einheit || 'Stk.');
            const itemId = GAEBEngine.escapeXML(pos.id || `item_${idx + 1}`);

            itemsXML += `
              <Item ID="${itemId}" RNoPart="${GAEBEngine.escapeXML(oz)}">
                <RNoPart>${GAEBEngine.escapeXML(oz)}</RNoPart>
                <OZ>${GAEBEngine.escapeXML(oz)}</OZ>
                <Qty>${menge.toFixed(3)}</Qty>
                <QU>${einheit}</QU>
                <Description>
                  <CompleteText>
                    <DetailTxt>
                      <Text>
                        <p><span>${name}</span></p>
                      </Text>
                    </DetailTxt>
                  </CompleteText>
                  <OutlineText>
                    <OutlTxt>
                      <TextOutl><span>${name}</span></TextOutl>
                    </OutlTxt>
                  </OutlineText>
                </Description>
                <UP>${ep.toFixed(2)}</UP>
                <IT>${gp.toFixed(2)}</IT>
              </Item>`;
        });

        return `<?xml version="1.0" encoding="UTF-8"?>
<!-- GAEB DA XML 3.3 Phase X84 (Angebotsabgabe) -->
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA_XML_3.3">
  <GAEBInfo>
    <Version>3.3</Version>
    <Date>${dateStr}</Date>
    <Time>${timeStr}</Time>
    <ProgMan>W-Link ERP</ProgMan>
  </GAEBInfo>
  <Award>
    <DP>84</DP>
    <AwardInfo>
      <Cur>EUR</Cur>
      <NetTotal>${totalNet.toFixed(2)}</NetTotal>
    </AwardInfo>
    <BoQ>
      <BoQInfo>
        <Name>${GAEBEngine.escapeXML(projectName || 'Bauprojekt')}</Name>
        <LblBoQ>LV</LblBoQ>
      </BoQInfo>
      <BoQBody>
        <Itemlist>${itemsXML}
        </Itemlist>
      </BoQBody>
    </BoQ>
  </Award>
</GAEB>`;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GAEBEngine;
}
if (typeof window !== 'undefined') {
    window.GAEBEngine = GAEBEngine;
}
