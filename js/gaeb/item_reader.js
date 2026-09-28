/**
 * js/gaeb/item_reader.js - Extraktion von Texten, Mengen, Einheiten und Preisen für GAEB-Positionen
 */

const XMLUtils = (typeof require === 'function') 
    ? require('./xml_dom_utils.js') 
    : (typeof window !== 'undefined' ? window.GAEB_XMLDomUtils : null);

class GAEB_ItemReader {
    /**
     * Extrahiert den Kurztext einer Position aus TextOutlTxt, TextOutl, OutlTxt oder Description.
     * @param {Element} itemElem 
     * @param {string} ozCode 
     * @returns {string}
     */
    static extractKurztext(itemElem, ozCode = '') {
        const utils = (typeof XMLUtils !== 'undefined' && XMLUtils) || (typeof window !== 'undefined' ? window.GAEB_XMLDomUtils : null);
        const find = utils ? utils.findFirstDescendant : (el, tag) => el.getElementsByTagName(tag)[0];
        const clean = utils ? utils.cleanText : str => (str || '').replace(/\s+/g, ' ').trim();

        // 1. TextOutlTxt (offizielles GAEB DA XML 3.3 Element)
        const textOutlTxt = find(itemElem, 'TextOutlTxt');
        if (textOutlTxt) {
            const text = clean(textOutlTxt.textContent);
            if (text) return text;
        }

        // 2. TextOutl (GAEB DA XML 3.0 - 3.2 & verbreitete AVA-Ausgaben)
        const textOutl = find(itemElem, 'TextOutl');
        if (textOutl) {
            const text = clean(textOutl.textContent);
            if (text) return text;
        }

        // 3. OutlTxt
        const outlTxt = find(itemElem, 'OutlTxt');
        if (outlTxt) {
            const text = clean(outlTxt.textContent);
            if (text) return text;
        }

        // 4. OutlineText (ohne OutlTSA / OutlTSB Flags)
        const outlineText = find(itemElem, 'OutlineText');
        if (outlineText) {
            let text = '';
            for (let i = 0; i < outlineText.childNodes.length; i++) {
                const node = outlineText.childNodes[i];
                if (node.nodeType === 3) {
                    text += node.textContent + ' ';
                } else if (node.nodeType === 1) {
                    const tag = (node.localName || node.nodeName || '').toLowerCase();
                    if (!tag.startsWith('outlts')) {
                        text += node.textContent + ' ';
                    }
                }
            }
            const cleaned = clean(text || outlineText.textContent);
            if (cleaned) return cleaned;
        }

        // 5. Description Fallback
        const desc = find(itemElem, 'Description');
        if (desc) {
            const pElem = desc.getElementsByTagName('p')[0];
            if (pElem) {
                const text = clean(pElem.textContent);
                if (text) return text;
            }
            const text = clean(desc.textContent);
            if (text) return text;
        }

        return ozCode ? `Position ${ozCode}` : 'Position ohne Bezeichnung';
    }

    /**
     * Extrahiert den mehrzeiligen Langtext einer Position (DetailTxt / CompleteText / Text).
     * @param {Element} itemElem 
     * @returns {string}
     */
    static extractLangtext(itemElem) {
        const utils = (typeof XMLUtils !== 'undefined' && XMLUtils) || (typeof window !== 'undefined' ? window.GAEB_XMLDomUtils : null);
        const find = utils ? utils.findFirstDescendant : (el, tag) => el.getElementsByTagName(tag)[0];
        const extractLines = utils ? utils.extractTextLines : el => (el ? el.textContent.trim() : '');

        const detailTxt = find(itemElem, 'DetailTxt');
        if (detailTxt) {
            const text = extractLines(detailTxt);
            if (text) return text;
        }

        const completeText = find(itemElem, 'CompleteText');
        if (completeText) {
            const text = extractLines(completeText);
            if (text) return text;
        }

        return '';
    }

    /**
     * Extrahiert Menge, Einheit und Preise (unter strikter Einhaltung von liesen.txt).
     * Fehlende Preise in Ausschreibungen (X83) bleiben null und werden nicht zu 0.00 verfälscht!
     * @param {Element} itemElem 
     * @param {boolean} isHinweistext 
     * @returns {Object} { menge, einheit, preis, gesamtpreis, isPriceMissing, isQtyTBD }
     */
    static extractQuantitiesAndPrices(itemElem, isHinweistext = false) {
        const utils = (typeof XMLUtils !== 'undefined' && XMLUtils) || (typeof window !== 'undefined' ? window.GAEB_XMLDomUtils : null);
        const find = utils ? utils.findFirstDescendant : (el, tag) => el.getElementsByTagName(tag)[0];

        const qtyElem = find(itemElem, 'Qty');
        const unitElem = find(itemElem, 'QU') || find(itemElem, 'Unit');
        const upElem = find(itemElem, 'UP') || find(itemElem, 'UnitPrice');
        const itElem = find(itemElem, 'IT') || find(itemElem, 'TotalPrice');
        const qtyTBDElem = find(itemElem, 'QtyTBD');

        const isQtyTBD = qtyTBDElem !== null && qtyTBDElem.textContent.trim().toLowerCase() === 'yes';

        const hasQty = qtyElem !== null && qtyElem.textContent.trim() !== '';
        const hasUnit = unitElem !== null && unitElem.textContent.trim() !== '';
        const hasUP = upElem !== null && upElem.textContent.trim() !== '';
        const hasIT = itElem !== null && itElem.textContent.trim() !== '';

        if (isHinweistext) {
            return {
                menge: null,
                einheit: '',
                preis: null,
                gesamtpreis: null,
                isPriceMissing: false,
                isQtyTBD: false
            };
        }

        // Menge
        let menge = null;
        if (hasQty) {
            const parsedQty = parseFloat(qtyElem.textContent.replace(',', '.'));
            menge = isNaN(parsedQty) ? null : parsedQty;
        }

        // Mengeneinheit
        const einheit = hasUnit ? unitElem.textContent.trim() : '';

        // Preise: Wenn kein <UP> vorhanden ist (Standardfall in X83 Ausschreibungen),
        // DARF kein 0.00 erfunden werden!
        let preis = null;
        let gesamtpreis = null;
        let isPriceMissing = false;

        if (hasUP) {
            const parsedUP = parseFloat(upElem.textContent.replace(',', '.'));
            if (!isNaN(parsedUP)) {
                preis = parsedUP;
                if (hasIT) {
                    const parsedIT = parseFloat(itElem.textContent.replace(',', '.'));
                    gesamtpreis = !isNaN(parsedIT) ? parsedIT : (menge !== null ? menge * preis : null);
                } else {
                    gesamtpreis = (menge !== null) ? menge * preis : null;
                }
            } else {
                preis = null;
                isPriceMissing = true;
            }
        } else {
            preis = null;
            gesamtpreis = hasIT ? parseFloat(itElem.textContent.replace(',', '.')) : null;
            if (isNaN(gesamtpreis)) gesamtpreis = null;
            isPriceMissing = true;
        }

        return {
            menge,
            einheit,
            preis,
            gesamtpreis,
            isPriceMissing,
            isQtyTBD
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GAEB_ItemReader;
}
if (typeof window !== 'undefined') {
    window.GAEB_ItemReader = GAEB_ItemReader;
}
