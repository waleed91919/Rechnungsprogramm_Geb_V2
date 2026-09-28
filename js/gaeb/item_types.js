/**
 * js/gaeb/item_types.js - Erkennung von Positionstypen, Bieterangaben und Preisaufgliederungen
 */

const XMLUtils = (typeof require === 'function') 
    ? require('./xml_dom_utils.js') 
    : (typeof window !== 'undefined' ? window.GAEB_XMLDomUtils : null);

class GAEB_ItemTypes {
    /**
     * Ermittelt Positionstyp, Kennzeichen und Endsummen-Relevanz.
     * @param {Element} itemElem 
     * @param {string} itemTypeAttr 
     * @param {boolean} isHinweistext 
     * @param {string} einheit 
     * @returns {Object}
     */
    static determineItemType(itemElem, itemTypeAttr = '', isHinweistext = false, einheit = '') {
        const utils = (typeof XMLUtils !== 'undefined' && XMLUtils) || (typeof window !== 'undefined' ? window.GAEB_XMLDomUtils : null);
        const find = utils ? utils.findFirstDescendant : (el, tag) => el.getElementsByTagName(tag)[0];

        let positions_art = 'NORMAL';
        let itemType = 'Normal';
        let isGrundposition = false;
        let isAlternative = false;
        let isBedarf = false;
        let provis = false;
        let withTotal = false;
        let isPauschal = false;
        let in_endsumme_enthalten = 1;

        const alnGroupElem = find(itemElem, 'ALNGroup') || find(itemElem, 'ALNGroupNo');
        const alnSerNoElem = find(itemElem, 'ALNSerNo');
        const alnGroup = alnGroupElem ? alnGroupElem.textContent.trim() : null;
        const alnSerNo = alnSerNoElem ? alnSerNoElem.textContent.trim() : null;

        const provisElem = find(itemElem, 'Provis');
        const lumpSumElem = find(itemElem, 'LumpSumItem');

        const unitLower = (einheit || '').toLowerCase();

        if (isHinweistext) {
            positions_art = 'HINWEISTEXT';
            itemType = 'Hinweistext';
            in_endsumme_enthalten = 0;
        } else if (alnGroup !== null || itemTypeAttr === 'Base' || itemTypeAttr === 'Alternative') {
            if (alnSerNo === '00' || itemTypeAttr === 'Base') {
                positions_art = 'GRUND';
                itemType = 'Base';
                isGrundposition = true;
                in_endsumme_enthalten = 1;
            } else {
                positions_art = 'WAHL';
                itemType = 'Alternative';
                isAlternative = true;
                in_endsumme_enthalten = 0;
            }
        } else if (provisElem !== null || itemTypeAttr.toLowerCase().includes('eventual')) {
            isBedarf = true;
            provis = true;
            const provisWithTotal = provisElem ? provisElem.getAttribute('WithTotal') : null;
            if (provisWithTotal === 'true' || itemTypeAttr === 'EventualWithTotal') {
                withTotal = true;
                positions_art = 'BEDARF_MIT_GB';
                itemType = 'EventualWithTotal';
                in_endsumme_enthalten = 1;
            } else {
                withTotal = false;
                positions_art = 'BEDARF_OHNE_GB';
                itemType = 'EventualWithoutTotal';
                in_endsumme_enthalten = 0;
            }
        } else if (lumpSumElem !== null || unitLower === 'psch' || unitLower === 'pauschale' || unitLower === 'pauschal') {
            isPauschal = true;
            positions_art = 'PAUSCHALE';
            itemType = 'LumpSum';
            in_endsumme_enthalten = 1;
        }

        return {
            positions_art,
            itemType,
            in_endsumme_enthalten,
            isGrundposition,
            isAlternative,
            isBedarf,
            provis: provis ? true : undefined,
            withTotal: isBedarf ? withTotal : undefined,
            isPauschal,
            alnGroup: alnGroup || undefined,
            alnSerNo: alnSerNo || undefined
        };
    }

    /**
     * Extrahiert Bieterangaben (<BiReq> / <BiEl>).
     * @param {Element} itemElem 
     * @returns {Array|undefined}
     */
    static extractBieterangaben(itemElem) {
        const utils = (typeof XMLUtils !== 'undefined' && XMLUtils) || (typeof window !== 'undefined' ? window.GAEB_XMLDomUtils : null);
        const find = utils ? utils.findFirstDescendant : (el, tag) => el.getElementsByTagName(tag)[0];
        const biReqElem = find(itemElem, 'BiReq');
        if (!biReqElem) return undefined;

        const bieterangaben = [];
        const biEls = biReqElem.getElementsByTagName('BiEl');
        for (let b = 0; b < biEls.length; b++) {
            const biEl = biEls[b];
            const biId = biEl.getAttribute('ID') || `biel_${b + 1}`;
            const lbl = find(biEl, 'Lbl')?.textContent.trim() || '';
            const desc = find(biEl, 'Description')?.textContent.trim() || '';
            bieterangaben.push({
                id: biId,
                label: lbl,
                description: desc,
                pflicht: true,
                wert: ''
            });
        }
        return bieterangaben.length > 0 ? bieterangaben : undefined;
    }

    /**
     * Extrahiert EP-Aufgliederung (<UPComponents>).
     * @param {Element} itemElem 
     * @returns {Object|undefined}
     */
    static extractUPComponents(itemElem) {
        const utils = (typeof XMLUtils !== 'undefined' && XMLUtils) || (typeof window !== 'undefined' ? window.GAEB_XMLDomUtils : null);
        const find = utils ? utils.findFirstDescendant : (el, tag) => el.getElementsByTagName(tag)[0];
        const upCompElem = find(itemElem, 'UPComponents');
        if (!upCompElem) return undefined;

        let l = 0, s = 0, g = 0, m = 0;
        const comps = upCompElem.getElementsByTagName('UPComp');
        for (let c = 0; c < comps.length; c++) {
            const comp = comps[c];
            const type = (comp.getAttribute('Type') || '').toLowerCase();
            const upTag = find(comp, 'UP');
            const val = upTag ? parseFloat(upTag.textContent.replace(',', '.')) : 0;
            if (type === 'labor' || type === 'lohn') l = val;
            else if (type === 'material' || type === 'stoff' || type === 'mat') s = val;
            else if (type === 'plant' || type === 'gerät' || type === 'geraet' || type === 'equip') g = val;
            else if (type === 'misc' || type === 'sonstiges' || type === 'other') m = val;
        }

        const laborTag = find(upCompElem, 'Labor') || find(upCompElem, 'Lohn');
        if (laborTag) l = parseFloat(laborTag.textContent.replace(',', '.')) || l;

        const matTag = find(upCompElem, 'Material') || find(upCompElem, 'Stoff');
        if (matTag) s = parseFloat(matTag.textContent.replace(',', '.')) || s;

        const plantTag = find(upCompElem, 'Plant') || find(upCompElem, 'Geraet') || find(upCompElem, 'Gerät');
        if (plantTag) g = parseFloat(plantTag.textContent.replace(',', '.')) || g;

        const miscTag = find(upCompElem, 'Misc') || find(upCompElem, 'Sonstiges');
        if (miscTag) m = parseFloat(miscTag.textContent.replace(',', '.')) || m;

        return {
            upComponents: { lohn: l, stoff: s, gerat: g, sonstiges: m },
            lohn: l,
            stoff: s,
            gerat: g,
            sonstiges: m
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GAEB_ItemTypes;
}
if (typeof window !== 'undefined') {
    window.GAEB_ItemTypes = GAEB_ItemTypes;
}
