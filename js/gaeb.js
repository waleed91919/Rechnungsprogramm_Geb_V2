/**
 * gaeb.js - GAEB DA XML Parser & Exporter für GAEB Phasen X83 (Ausschreibung), X84 (Angebotsabgabe) & X89 (Rechnung)
 */
class GAEBEngine {
    /**
     * Parsed ein GAEB XML Dokument (z.B. X83) in eine hierarchische Objektstruktur.
     * @param {string} xmlString - GAEB XML Datei-Inhalt
     * @returns {Object} { projectInfo: {}, items: [] }
     */
    /**
     * Ermittelt eine verfügbare DOMParser-Instanz (Browser/Electron window.DOMParser oder Node.js jsdom).
     */
    static getDOMParser() {
        if (typeof window !== 'undefined' && window.DOMParser) {
            return new window.DOMParser();
        }
        if (typeof DOMParser !== 'undefined') {
            return new DOMParser();
        }
        try {
            const { JSDOM } = require('jsdom');
            const dom = new JSDOM();
            return new dom.window.DOMParser();
        } catch (e) {
            throw new Error('Kein DOMParser verfügbar: ' + e.message);
        }
    }

    static getDirectChildElements(parent, tagName = null) {
        const result = [];
        if (!parent || !parent.childNodes) return result;
        for (let i = 0; i < parent.childNodes.length; i++) {
            const node = parent.childNodes[i];
            if (node.nodeType === 1) { // Node.ELEMENT_NODE
                if (!tagName || node.localName === tagName || node.nodeName === tagName) {
                    result.push(node);
                }
            }
        }
        return result;
    }

    static findFirstDescendant(element, tagName) {
        if (!element) return null;
        const elements = element.getElementsByTagName(tagName);
        return elements && elements.length > 0 ? elements[0] : null;
    }

    static extractTextLines(containerElement) {
        if (!containerElement) return '';
        const pElements = containerElement.getElementsByTagName('p');
        if (pElements && pElements.length > 0) {
            const lines = [];
            for (let i = 0; i < pElements.length; i++) {
                const line = pElements[i].textContent.trim();
                if (line) lines.push(line);
            }
            return lines.join('\n');
        }
        return containerElement.textContent.trim();
    }

    static extractKurztext(itemElem, ozCode) {
        const textOutl = GAEBEngine.findFirstDescendant(itemElem, 'TextOutl');
        if (textOutl) {
            const text = textOutl.textContent.replace(/\s+/g, ' ').trim();
            if (text) return text;
        }
        const outlTxt = GAEBEngine.findFirstDescendant(itemElem, 'OutlTxt');
        if (outlTxt) {
            const text = outlTxt.textContent.replace(/\s+/g, ' ').trim();
            if (text) return text;
        }
        const outlineText = GAEBEngine.findFirstDescendant(itemElem, 'OutlineText');
        if (outlineText) {
            const text = outlineText.textContent.replace(/\s+/g, ' ').trim();
            if (text) return text;
        }
        const desc = GAEBEngine.findFirstDescendant(itemElem, 'Description');
        if (desc) {
            const pElem = desc.getElementsByTagName('p')[0];
            if (pElem) {
                const text = pElem.textContent.replace(/\s+/g, ' ').trim();
                if (text) return text;
            }
            const text = desc.textContent.replace(/\s+/g, ' ').trim();
            if (text) return text;
        }
        return ozCode ? `Position ${ozCode}` : 'Position ohne Bezeichnung';
    }

    static extractLangtext(itemElem) {
        const detailTxt = GAEBEngine.findFirstDescendant(itemElem, 'DetailTxt');
        if (detailTxt) {
            const text = GAEBEngine.extractTextLines(detailTxt);
            if (text) return text;
        }
        const completeText = GAEBEngine.findFirstDescendant(itemElem, 'CompleteText');
        if (completeText) {
            const text = GAEBEngine.extractTextLines(completeText);
            if (text) return text;
        }
        return '';
    }

    /**
     * Parsed ein GAEB XML Dokument (z.B. X83) in eine hierarchische Objektstruktur.
     * Erhält BoQCtgy-Hierarchien, Pfad-OZs, RNoPart, vollständige Langtexte,
     * Vorbemerkungen, Positionstypen, Bieterangaben und UPComponents.
     * @param {string} xmlString - GAEB XML Datei-Inhalt
     * @returns {Object} { projectInfo, items, categories, hierarchy, sections, warnings }
     */
    static parseGAEBXML(xmlString) {
        if (!xmlString || typeof xmlString !== 'string') {
            throw new Error('Ungültiger GAEB-Inhalt.');
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

        // Extrahiere GAEB-Phase aus Award/DP, GAEBInfo/DP oder DP
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

        const allItems = [];
        const topLevelCategories = [];
        const warnings = [];
        const seenOZs = new Map();

        function parseItem(itemElem, categoryObj, categoryPath) {
            const itemId = itemElem.getAttribute('ID') || `item_${allItems.length + 1}`;
            const itemTypeAttr = itemElem.getAttribute('ItemType') || '';
            const itemRNoPart = itemElem.getAttribute('RNoPart') ||
                                GAEBEngine.findFirstDescendant(itemElem, 'RNoPart')?.textContent.trim() || '';

            const ozElem = GAEBEngine.findFirstDescendant(itemElem, 'OZ');
            const declaredOZ = ozElem ? ozElem.textContent.trim() : null;

            const ozPrefix = categoryObj ? categoryObj.oz_prefix : '';
            let fullOZ = declaredOZ;
            if (!fullOZ) {
                if (ozPrefix && itemRNoPart) {
                    fullOZ = `${ozPrefix}.${itemRNoPart}`;
                } else {
                    fullOZ = itemRNoPart || `pos_${allItems.length + 1}`;
                }
            }

            // Erkennung doppelter OZs
            let isDuplicate = false;
            if (seenOZs.has(fullOZ)) {
                isDuplicate = true;
                const prevId = seenOZs.get(fullOZ);
                warnings.push(`Doppelte Ordnungszahl erkannt: OZ '${fullOZ}' (ID: ${itemId}, vorherige ID: ${prevId})`);
            } else {
                seenOZs.set(fullOZ, itemId);
            }

            // Kurztext & Langtext
            const kurztext = GAEBEngine.extractKurztext(itemElem, fullOZ);
            const langtext = GAEBEngine.extractLangtext(itemElem);

            // Mengen & Einheiten
            const qtyElem = GAEBEngine.findFirstDescendant(itemElem, 'Qty');
            const unitElem = GAEBEngine.findFirstDescendant(itemElem, 'QU') || GAEBEngine.findFirstDescendant(itemElem, 'Unit');
            const upElem = GAEBEngine.findFirstDescendant(itemElem, 'UP') || GAEBEngine.findFirstDescendant(itemElem, 'UnitPrice');
            const itElem = GAEBEngine.findFirstDescendant(itemElem, 'IT') || GAEBEngine.findFirstDescendant(itemElem, 'TotalPrice');

            const hasQty = qtyElem !== null;
            const hasUnit = unitElem !== null;
            const hasUP = upElem !== null;

            const isExplicitHinweis = itemTypeAttr.toLowerCase() === 'hinweistext' ||
                                      itemTypeAttr.toLowerCase() === 'hinweis' ||
                                      itemTypeAttr.toLowerCase() === 'text';
            const isImplicitHinweis = !hasQty && !hasUnit && !hasUP;
            const isHinweistext = isExplicitHinweis || isImplicitHinweis;

            let menge = null;
            let einheit = '';
            let einheitspreis = 0.0;
            let gesamtpreis = 0.0;

            if (isHinweistext) {
                menge = null;
                einheit = '';
                einheitspreis = 0.0;
                gesamtpreis = 0.0;
            } else {
                menge = hasQty ? parseFloat(qtyElem.textContent.replace(',', '.')) : 1.0;
                if (isNaN(menge)) menge = 1.0;
                einheit = hasUnit ? unitElem.textContent.trim() : 'Stk.';
                einheitspreis = hasUP ? parseFloat(upElem.textContent.replace(',', '.')) : 0.0;
                if (isNaN(einheitspreis)) einheitspreis = 0.0;
                gesamtpreis = itElem ? parseFloat(itElem.textContent.replace(',', '.')) : (menge * einheitspreis);
                if (isNaN(gesamtpreis)) gesamtpreis = 0.0;
            }

            // Positionstyp & Summenregeln ermitteln
            let positions_art = 'NORMAL';
            let itemType = 'Normal';
            let isGrundposition = false;
            let isAlternative = false;
            let isBedarf = false;
            let provis = false;
            let withTotal = false;
            let isPauschal = false;
            let in_endsumme_enthalten = 1;

            const alnGroupElem = GAEBEngine.findFirstDescendant(itemElem, 'ALNGroup') || GAEBEngine.findFirstDescendant(itemElem, 'ALNGroupNo');
            const alnSerNoElem = GAEBEngine.findFirstDescendant(itemElem, 'ALNSerNo');
            const alnGroup = alnGroupElem ? alnGroupElem.textContent.trim() : null;
            const alnSerNo = alnSerNoElem ? alnSerNoElem.textContent.trim() : null;

            const provisElem = GAEBEngine.findFirstDescendant(itemElem, 'Provis');
            const lumpSumElem = GAEBEngine.findFirstDescendant(itemElem, 'LumpSumItem');

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
            } else if (lumpSumElem !== null || einheit.toLowerCase() === 'psch' || einheit.toLowerCase() === 'pauschale') {
                isPauschal = true;
                positions_art = 'PAUSCHALE';
                itemType = 'LumpSum';
                in_endsumme_enthalten = 1;
            }

            // BiReq - Bietertextergänzungen
            const biReqElem = GAEBEngine.findFirstDescendant(itemElem, 'BiReq');
            const bieterangaben = [];
            if (biReqElem) {
                const biEls = biReqElem.getElementsByTagName('BiEl');
                for (let b = 0; b < biEls.length; b++) {
                    const biEl = biEls[b];
                    const biId = biEl.getAttribute('ID') || `biel_${b + 1}`;
                    const lbl = GAEBEngine.findFirstDescendant(biEl, 'Lbl')?.textContent.trim() || '';
                    const desc = GAEBEngine.findFirstDescendant(biEl, 'Description')?.textContent.trim() || '';
                    bieterangaben.push({
                        id: biId,
                        label: lbl,
                        description: desc,
                        pflicht: true,
                        wert: ''
                    });
                }
            }
            const requiresBidderInfo = bieterangaben.length > 0;

            // UPComponents - EFB Aufgliederung
            const upCompElem = GAEBEngine.findFirstDescendant(itemElem, 'UPComponents');
            let upComponents = undefined;
            let lohn = undefined;
            let stoff = undefined;
            let gerat = undefined;
            let sonstiges = undefined;

            if (upCompElem) {
                let l = 0, s = 0, g = 0, m = 0;
                const comps = upCompElem.getElementsByTagName('UPComp');
                for (let c = 0; c < comps.length; c++) {
                    const comp = comps[c];
                    const type = (comp.getAttribute('Type') || '').toLowerCase();
                    const upTag = GAEBEngine.findFirstDescendant(comp, 'UP');
                    const val = upTag ? parseFloat(upTag.textContent.replace(',', '.')) : 0;
                    if (type === 'labor' || type === 'lohn') l = val;
                    else if (type === 'material' || type === 'stoff' || type === 'mat') s = val;
                    else if (type === 'plant' || type === 'gerät' || type === 'geraet' || type === 'equip') g = val;
                    else if (type === 'misc' || type === 'sonstiges' || type === 'other') m = val;
                }

                const laborTag = GAEBEngine.findFirstDescendant(upCompElem, 'Labor') || GAEBEngine.findFirstDescendant(upCompElem, 'Lohn');
                if (laborTag) l = parseFloat(laborTag.textContent.replace(',', '.')) || l;

                const matTag = GAEBEngine.findFirstDescendant(upCompElem, 'Material') || GAEBEngine.findFirstDescendant(upCompElem, 'Stoff');
                if (matTag) s = parseFloat(matTag.textContent.replace(',', '.')) || s;

                const plantTag = GAEBEngine.findFirstDescendant(upCompElem, 'Plant') || GAEBEngine.findFirstDescendant(upCompElem, 'Geraet') || GAEBEngine.findFirstDescendant(upCompElem, 'Gerät');
                if (plantTag) g = parseFloat(plantTag.textContent.replace(',', '.')) || g;

                const miscTag = GAEBEngine.findFirstDescendant(upCompElem, 'Misc') || GAEBEngine.findFirstDescendant(upCompElem, 'Sonstiges');
                if (miscTag) m = parseFloat(miscTag.textContent.replace(',', '.')) || m;

                upComponents = { lohn: l, stoff: s, gerat: g, sonstiges: m };
                lohn = l;
                stoff = s;
                gerat = g;
                sonstiges = m;
            }

            const categoryNames = categoryPath.map(c => c.name);
            const gewerk = categoryPath[0] ? categoryPath[0].name : undefined;
            const abschnitt = categoryPath[1] ? categoryPath[1].name : undefined;
            const titel = categoryPath.length > 1 ? categoryPath[categoryPath.length - 1].name : gewerk;

            const pos = {
                id: itemId,
                oz_code: fullOZ,
                oz: fullOZ,
                rno_part: itemRNoPart,
                declared_oz: declaredOZ,
                name: kurztext,
                kurztext: kurztext,
                langtext: langtext || undefined,
                detailTxt: langtext || undefined,
                completeText: langtext || undefined,
                description: langtext || undefined,
                menge: menge,
                einheit: einheit,
                preis: einheitspreis,
                gesamtpreis: gesamtpreis,
                cost_type: 'MATERIAL',
                positions_art: positions_art,
                itemType: itemType,
                in_endsumme_enthalten: in_endsumme_enthalten,
                isGrundposition: isGrundposition,
                isAlternative: isAlternative,
                isBedarf: isBedarf,
                provis: provis ? true : undefined,
                withTotal: isBedarf ? withTotal : undefined,
                isPauschal: isPauschal,
                isHinweistext: isHinweistext ? true : undefined,
                alnGroup: alnGroup || undefined,
                alnSerNo: alnSerNo || undefined,
                requiresBidderInfo: requiresBidderInfo ? true : undefined,
                bieterangaben: requiresBidderInfo ? bieterangaben : undefined,
                biReq: requiresBidderInfo ? bieterangaben : undefined,
                upComponents: upComponents,
                lohn: lohn,
                stoff: stoff,
                gerat: gerat,
                sonstiges: sonstiges,
                categoryId: categoryObj ? categoryObj.id : undefined,
                parentId: categoryObj ? categoryObj.id : undefined,
                category: categoryObj ? categoryObj.name : undefined,
                categoryPath: categoryNames.length > 0 ? categoryNames : undefined,
                gewerk: gewerk,
                abschnitt: abschnitt,
                titel: titel,
                isDuplicateOZ: isDuplicate ? true : undefined
            };

            return pos;
        }

        function traverseBoQBody(boqBodyElem, currentPath, parentCategory) {
            if (!boqBodyElem) return;

            // 1. Kind-Elemente <BoQCtgy> durchlaufen
            const childCtgys = GAEBEngine.getDirectChildElements(boqBodyElem, 'BoQCtgy');
            for (let i = 0; i < childCtgys.length; i++) {
                const ctgElem = childCtgys[i];
                const ctgId = ctgElem.getAttribute('ID') || `ctg_${i + 1}`;
                const rnoPart = ctgElem.getAttribute('RNoPart') ||
                                GAEBEngine.findFirstDescendant(ctgElem, 'RNoPart')?.textContent.trim() || '';
                const lblCtgy = ctgElem.getAttribute('lblCtgy') || ctgElem.getAttribute('LblCtgy') || rnoPart;

                // Name aus LblTx oder OutlineText
                let ctgName = '';
                const lblTxElem = GAEBEngine.getDirectChildElements(ctgElem, 'LblTx')[0] || GAEBEngine.findFirstDescendant(ctgElem, 'LblTx');
                if (lblTxElem) {
                    ctgName = lblTxElem.textContent.replace(/\s+/g, ' ').trim();
                }
                if (!ctgName) {
                    const outlElem = GAEBEngine.findFirstDescendant(ctgElem, 'OutlineText');
                    if (outlElem) ctgName = outlElem.textContent.replace(/\s+/g, ' ').trim();
                }
                if (!ctgName) {
                    ctgName = `Kategorie ${rnoPart || i + 1}`;
                }

                // Vorbemerkung / Description auf BoQCtgy-Ebene
                let vorbemerkung = null;
                const descElem = GAEBEngine.getDirectChildElements(ctgElem, 'Description')[0] ||
                                 GAEBEngine.findFirstDescendant(ctgElem, 'Description');
                if (descElem) {
                    const text = GAEBEngine.extractTextLines(descElem);
                    if (text) vorbemerkung = text;
                }

                const pathEntry = { id: ctgId, rnoPart, name: ctgName };
                const newPath = [...currentPath, pathEntry];
                const ozPrefix = newPath.map(p => p.rnoPart).filter(Boolean).join('.');

                const categoryObj = {
                    id: ctgId,
                    rno_part: rnoPart,
                    lblCtgy: lblCtgy,
                    name: ctgName,
                    vorbemerkung: vorbemerkung,
                    description: vorbemerkung,
                    level: newPath.length,
                    parentId: parentCategory ? parentCategory.id : null,
                    categoryPath: newPath.map(p => p.name),
                    oz_prefix: ozPrefix,
                    categories: [],
                    items: []
                };

                if (parentCategory) {
                    parentCategory.categories.push(categoryObj);
                } else {
                    topLevelCategories.push(categoryObj);
                }

                // Inneres BoQBody der Kategorie rekursiv durchlaufen
                const innerBoQBody = GAEBEngine.getDirectChildElements(ctgElem, 'BoQBody')[0];
                if (innerBoQBody) {
                    traverseBoQBody(innerBoQBody, newPath, categoryObj);
                }

                // Direkte Itemlist in ctgElem prüfen
                const directItemlist = GAEBEngine.getDirectChildElements(ctgElem, 'Itemlist')[0];
                if (directItemlist) {
                    const items = GAEBEngine.getDirectChildElements(directItemlist, 'Item');
                    for (let j = 0; j < items.length; j++) {
                        const parsedItem = parseItem(items[j], categoryObj, newPath);
                        categoryObj.items.push(parsedItem);
                        allItems.push(parsedItem);
                    }
                }
            }

            // 2. Direkte Itemlist in diesem BoQBody durchlaufen
            const childItemlists = GAEBEngine.getDirectChildElements(boqBodyElem, 'Itemlist');
            for (let l = 0; l < childItemlists.length; l++) {
                const itemlistElem = childItemlists[l];
                const items = GAEBEngine.getDirectChildElements(itemlistElem, 'Item');
                for (let j = 0; j < items.length; j++) {
                    const parsedItem = parseItem(items[j], parentCategory, currentPath);
                    if (parentCategory) {
                        parentCategory.items.push(parsedItem);
                    }
                    allItems.push(parsedItem);
                }
            }
        }

        // Suche Startknoten BoQ -> BoQBody
        const boqElem = GAEBEngine.findFirstDescendant(doc, 'BoQ');
        const boqBodyElem = boqElem ? (GAEBEngine.getDirectChildElements(boqElem, 'BoQBody')[0] || GAEBEngine.findFirstDescendant(boqElem, 'BoQBody')) : null;

        if (boqBodyElem) {
            traverseBoQBody(boqBodyElem, [], null);
        } else {
            // Fallback: Flache Extraktion aller Items, falls kein BoQBody existiert
            const items = doc.getElementsByTagName('Item');
            for (let j = 0; j < items.length; j++) {
                const parsedItem = parseItem(items[j], null, []);
                allItems.push(parsedItem);
            }
        }

        return {
            projectInfo,
            items: allItems,
            categories: topLevelCategories.length > 0 ? topLevelCategories : undefined,
            hierarchy: topLevelCategories.length > 0 ? topLevelCategories : undefined,
            sections: topLevelCategories.length > 0 ? topLevelCategories : undefined,
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
    module.exports = GAEBEngine;
} else {
    window.GAEBEngine = GAEBEngine;
}
