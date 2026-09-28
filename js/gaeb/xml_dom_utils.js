/**
 * js/gaeb/xml_dom_utils.js - XML- & DOM-Hilfswerkzeuge für GAEB DA XML
 * Unterstützt Node.js (via jsdom), Browser und Electron.
 */

class GAEB_XMLDomUtils {
    /**
     * Ermittelt eine verfügbare DOMParser-Instanz.
     * @returns {DOMParser}
     */
    static getDOMParser() {
        if (typeof window !== 'undefined' && window.DOMParser) {
            return new window.DOMParser();
        }
        if (typeof DOMParser !== 'undefined') {
            return new DOMParser();
        }
        if (typeof globalThis !== 'undefined' && globalThis.DOMParser) {
            return new globalThis.DOMParser();
        }
        try {
            const { JSDOM } = require('jsdom');
            const dom = new JSDOM();
            return new dom.window.DOMParser();
        } catch (e) {
            throw new Error('Kein DOMParser verfügbar: ' + e.message);
        }
    }

    /**
     * Ermittelt direkte Kind-Elementknoten (nodeType === 1), optional nach tagName gefiltert.
     * @param {Node} parent 
     * @param {string|null} tagName 
     * @returns {Element[]}
     */
    static getDirectChildElements(parent, tagName = null) {
        const result = [];
        if (!parent || !parent.childNodes) return result;
        const targetTag = tagName ? tagName.toLowerCase() : null;
        for (let i = 0; i < parent.childNodes.length; i++) {
            const node = parent.childNodes[i];
            if (node.nodeType === 1) { // Node.ELEMENT_NODE
                if (!targetTag) {
                    result.push(node);
                } else {
                    const local = (node.localName || '').toLowerCase();
                    const tag = (node.tagName || node.nodeName || '').toLowerCase();
                    if (local === targetTag || tag === targetTag) {
                        result.push(node);
                    }
                }
            }
        }
        return result;
    }

    /**
     * Findet das erste Nachfahren-Element mit dem angegebenen Tag-Namen (Case-Insensitive & Namespace-agnostisch).
     * @param {Element|Document} element 
     * @param {string} tagName 
     * @returns {Element|null}
     */
    static findFirstDescendant(element, tagName) {
        if (!element) return null;
        // Zunächst getElementsByTagName
        const elements = element.getElementsByTagName(tagName);
        if (elements && elements.length > 0) return elements[0];

        // Fallback für Namespaces (localName-Suche)
        const target = tagName.toLowerCase();
        const all = element.getElementsByTagName('*');
        if (all) {
            for (let i = 0; i < all.length; i++) {
                const node = all[i];
                if ((node.localName && node.localName.toLowerCase() === target) ||
                    (node.nodeName && node.nodeName.toLowerCase() === target)) {
                    return node;
                }
            }
        }
        return null;
    }

    /**
     * Extrahiert Textzeilen aus strukturierten Textknoten (z. B. DetailTxt, Description, Text, LblTx).
     * Berücksichtigt <p>-Absätze und Zeilenumbrüche ohne Datenverlust.
     * @param {Element} containerElement 
     * @returns {string}
     */
    static extractTextLines(containerElement) {
        if (!containerElement) return '';
        const pElements = containerElement.getElementsByTagName('p');
        if (pElements && pElements.length > 0) {
            const lines = [];
            for (let i = 0; i < pElements.length; i++) {
                const line = pElements[i].textContent.trim();
                if (line) lines.push(line);
            }
            if (lines.length > 0) return lines.join('\n');
        }

        // Falls keine <p>-Tags existieren, Text bereinigen und Zeilenumbrüche erhalten
        const raw = containerElement.textContent || '';
        const rawLines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        return rawLines.join('\n');
    }

    /**
     * Bereinigt Leerzeichen in einzeiligen Texten (Kurztexte, Namen).
     * @param {string} str 
     * @returns {string}
     */
    static cleanText(str) {
        if (!str) return '';
        return String(str).replace(/\s+/g, ' ').trim();
    }

    /**
     * XML-Zeichenmaskierung für Entities (&, <, >, ", ').
     * @param {string} str 
     * @returns {string}
     */
    static escapeXML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GAEB_XMLDomUtils;
}
if (typeof window !== 'undefined') {
    window.GAEB_XMLDomUtils = GAEB_XMLDomUtils;
}
