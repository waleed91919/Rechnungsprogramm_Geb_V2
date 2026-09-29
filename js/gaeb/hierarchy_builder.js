/**
 * js/gaeb/hierarchy_builder.js - Rekursiver Aufbau der BoQCtgy-Hierarchie und Zuordnung von Positionen
 */

const XMLUtils = (typeof require === 'function') 
    ? require('./xml_dom_utils.js') 
    : (typeof window !== 'undefined' ? window.GAEB_XMLDomUtils : null);
const ItemReader = (typeof require === 'function') 
    ? require('./item_reader.js') 
    : (typeof window !== 'undefined' ? window.GAEB_ItemReader : null);
const ItemTypes = (typeof require === 'function') 
    ? require('./item_types.js') 
    : (typeof window !== 'undefined' ? window.GAEB_ItemTypes : null);

class GAEB_HierarchyBuilder {
    /**
     * Baut die vollständige BoQCtgy-Hierarchie und die Positionsliste aus einem DOM-Dokument auf.
     * @param {Document} doc 
     * @returns {Object} { allItems, topLevelCategories, warnings }
     */
    static build(doc) {
        const xmlUtils = (typeof XMLUtils !== 'undefined' && XMLUtils) || (typeof window !== 'undefined' ? window.GAEB_XMLDomUtils : null);
        const itemReader = (typeof ItemReader !== 'undefined' && ItemReader) || (typeof window !== 'undefined' ? window.GAEB_ItemReader : null);
        const itemTypes = (typeof ItemTypes !== 'undefined' && ItemTypes) || (typeof window !== 'undefined' ? window.GAEB_ItemTypes : null);

        const find = xmlUtils ? xmlUtils.findFirstDescendant : (el, tag) => el.getElementsByTagName(tag)[0];
        const getChildren = xmlUtils ? xmlUtils.getDirectChildElements : (el, tag) => [];
        const extractLines = xmlUtils ? xmlUtils.extractTextLines : el => (el ? el.textContent.trim() : '');
        const clean = xmlUtils ? xmlUtils.cleanText : str => (str || '').replace(/\s+/g, ' ').trim();

        const allItems = [];
        const topLevelCategories = [];
        const warnings = [];
        const seenOZs = new Map();

        function parseItem(itemElem, categoryObj, categoryPath) {
            const itemId = itemElem.getAttribute('ID') || `item_${allItems.length + 1}`;
            const itemTypeAttr = itemElem.getAttribute('ItemType') || '';
            const itemRNoPart = itemElem.getAttribute('RNoPart') ||
                                find(itemElem, 'RNoPart')?.textContent.trim() || '';

            const ozElem = find(itemElem, 'OZ');
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

            // Erkennung doppelter Ordnungszahlen (OZ)
            let isDuplicate = false;
            if (seenOZs.has(fullOZ)) {
                isDuplicate = true;
                const prevId = seenOZs.get(fullOZ);
                warnings.push(`Doppelte Ordnungszahl erkannt: OZ '${fullOZ}' (ID: ${itemId}, vorherige ID: ${prevId})`);
            } else {
                seenOZs.set(fullOZ, itemId);
            }

            // Kurztext & Langtext
            const kurztext = itemReader 
                ? itemReader.extractKurztext(itemElem, fullOZ)
                : clean(find(itemElem, 'OutlineText')?.textContent || `Position ${fullOZ}`);
            const langtext = itemReader 
                ? itemReader.extractLangtext(itemElem)
                : extractLines(find(itemElem, 'CompleteText') || find(itemElem, 'DetailTxt'));

            // Hinweistext-Erkennung
            const qtyElem = find(itemElem, 'Qty');
            const unitElem = find(itemElem, 'QU') || find(itemElem, 'Unit');
            const upElem = find(itemElem, 'UP') || find(itemElem, 'UnitPrice');
            const qtyTBDElem = find(itemElem, 'QtyTBD');

            const hasQty = qtyElem !== null && qtyElem.textContent.trim() !== '';
            const hasUnit = unitElem !== null && unitElem.textContent.trim() !== '';
            const hasUP = upElem !== null && upElem.textContent.trim() !== '';
            const isQtyTBD = (qtyTBDElem !== null && qtyTBDElem.textContent.trim().toLowerCase() === 'yes') ||
                             (find(itemElem, 'QtyTBD')?.textContent.trim().toLowerCase() === 'yes');

            const isExplicitHinweis = itemTypeAttr.toLowerCase() === 'hinweistext' ||
                                      itemTypeAttr.toLowerCase() === 'hinweis' ||
                                      itemTypeAttr.toLowerCase() === 'text';
            const isImplicitHinweis = !hasQty && !hasUnit && !hasUP && !isQtyTBD;
            const isHinweistext = isExplicitHinweis || isImplicitHinweis;

            // Mengen & Preise (strikter Null-Erhalt bei fehlendem UP nach liesen.txt)
            const qp = itemReader
                ? itemReader.extractQuantitiesAndPrices(itemElem, isHinweistext)
                : {
                    menge: (hasQty && !isQtyTBD) ? parseFloat(qtyElem.textContent.replace(',', '.')) : null,
                    einheit: hasUnit ? unitElem.textContent.trim() : '',
                    preis: hasUP ? parseFloat(upElem.textContent.replace(',', '.')) : null,
                    gesamtpreis: null,
                    isPriceMissing: !hasUP,
                    isQtyTBD: isQtyTBD
                };

            // Typen & Kennzeichen
            const typeInfo = itemTypes
                ? itemTypes.determineItemType(itemElem, itemTypeAttr, isHinweistext, qp.einheit)
                : {
                    positions_art: isHinweistext ? 'HINWEISTEXT' : 'NORMAL',
                    itemType: isHinweistext ? 'Hinweistext' : 'Normal',
                    in_endsumme_enthalten: isHinweistext ? 0 : 1,
                    isGrundposition: false,
                    isAlternative: false,
                    isBedarf: false,
                    is_wahl: false,
                    is_bedarf: false,
                    isPauschal: false
                };

            // Bieterangaben (<BiReq>)
            const bieterangaben = itemTypes ? itemTypes.extractBieterangaben(itemElem) : undefined;
            const requiresBidderInfo = Boolean(bieterangaben && bieterangaben.length > 0);

            // EP-Aufgliederung (<UPComponents>)
            const upInfo = itemTypes ? itemTypes.extractUPComponents(itemElem) : undefined;

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
                menge: qp.menge,
                einheit: qp.einheit,
                preis: qp.preis,
                gesamtpreis: qp.gesamtpreis,
                isPriceMissing: qp.isPriceMissing,
                isQtyTBD: qp.isQtyTBD ? true : undefined,
                cost_type: 'MATERIAL',
                positions_art: typeInfo.positions_art,
                itemType: typeInfo.itemType,
                in_endsumme_enthalten: typeInfo.in_endsumme_enthalten,
                isGrundposition: typeInfo.isGrundposition,
                isAlternative: typeInfo.isAlternative,
                isBedarf: typeInfo.isBedarf,
                is_wahl: typeInfo.is_wahl,
                is_bedarf: typeInfo.is_bedarf,
                provis: typeInfo.provis,
                withTotal: typeInfo.withTotal,
                isPauschal: typeInfo.isPauschal,
                isHinweistext: isHinweistext ? true : undefined,
                alnGroup: typeInfo.alnGroup,
                alnSerNo: typeInfo.alnSerNo,
                aln_group_no: typeInfo.aln_group_no,
                aln_ser_no: typeInfo.aln_ser_no,
                requiresBidderInfo: requiresBidderInfo ? true : undefined,
                bieterangaben: requiresBidderInfo ? bieterangaben : undefined,
                biReq: requiresBidderInfo ? bieterangaben : undefined,
                upComponents: upInfo ? upInfo.upComponents : undefined,
                lohn: upInfo ? upInfo.lohn : undefined,
                stoff: upInfo ? upInfo.stoff : undefined,
                gerat: upInfo ? upInfo.gerat : undefined,
                sonstiges: upInfo ? upInfo.sonstiges : undefined,
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

            // Durchlaufe alle Kindknoten von boqBodyElem in exakter Dokumenten-Reihenfolge
            for (let c = 0; c < boqBodyElem.childNodes.length; c++) {
                const node = boqBodyElem.childNodes[c];
                if (node.nodeType !== 1) continue; // Nur Element-Knoten

                const tag = (node.localName || node.nodeName || '').replace(/^.*:/, '');

                if (tag === 'Remark') {
                    const text = extractLines(node);
                    if (text && parentCategory) {
                        if (!parentCategory.remarks) parentCategory.remarks = [];
                        parentCategory.remarks.push(text);
                    }
                } else if (tag === 'BoQCtgy') {
                    const ctgElem = node;
                    const ctgId = ctgElem.getAttribute('ID') || `ctg_${parentCategory ? (parentCategory.categories.length + 1) : (topLevelCategories.length + 1)}`;
                    const rnoPartElem = getChildren(ctgElem, 'RNoPart')[0];
                    const rnoPart = ctgElem.getAttribute('RNoPart') ||
                                    (rnoPartElem ? rnoPartElem.textContent.trim() : '');
                    const lblCtgy = ctgElem.getAttribute('lblCtgy') || ctgElem.getAttribute('LblCtgy') || rnoPart;

                    // Name aus direktem LblTx, OutlineText oder Description (niemals aus Kind-BoQBody / Items!)
                    let ctgName = '';
                    const lblTxElem = getChildren(ctgElem, 'LblTx')[0];
                    if (lblTxElem) {
                        ctgName = clean(lblTxElem.textContent);
                    }
                    if (!ctgName) {
                        const outlElem = getChildren(ctgElem, 'OutlineText')[0];
                        if (outlElem) {
                            const textOutl = find(outlElem, 'TextOutlTxt') || find(outlElem, 'TextOutl') || find(outlElem, 'OutlTxt') || outlElem;
                            ctgName = clean(textOutl.textContent);
                        }
                    }
                    if (!ctgName) {
                        const descElem = getChildren(ctgElem, 'Description')[0];
                        if (descElem) {
                            const outlElem = find(descElem, 'OutlineText');
                            if (outlElem) {
                                const textOutl = find(outlElem, 'TextOutlTxt') || find(outlElem, 'TextOutl') || find(outlElem, 'OutlTxt') || outlElem;
                                ctgName = clean(textOutl.textContent);
                            }
                        }
                    }
                    if (!ctgName) {
                        ctgName = `Kategorie ${rnoPart || (parentCategory ? (parentCategory.categories.length + 1) : (topLevelCategories.length + 1))}`;
                    }

                    // Vorbemerkung / Description auf BoQCtgy-Ebene (NUR direkte Description!)
                    let vorbemerkung = null;
                    const descElem = getChildren(ctgElem, 'Description')[0];
                    if (descElem) {
                        const text = extractLines(descElem);
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
                    const innerBoQBody = getChildren(ctgElem, 'BoQBody')[0];
                    if (innerBoQBody) {
                        traverseBoQBody(innerBoQBody, newPath, categoryObj);
                    }

                    // Direkte Itemlist in ctgElem prüfen (falls außerhalb von BoQBody)
                    const directItemlist = getChildren(ctgElem, 'Itemlist')[0];
                    if (directItemlist) {
                        for (let j = 0; j < directItemlist.childNodes.length; j++) {
                            const itNode = directItemlist.childNodes[j];
                            if (itNode.nodeType !== 1) continue;
                            const itTag = (itNode.localName || itNode.nodeName || '').replace(/^.*:/, '');
                            if (itTag === 'Item') {
                                const parsedItem = parseItem(itNode, categoryObj, newPath);
                                categoryObj.items.push(parsedItem);
                                allItems.push(parsedItem);
                            } else if (itTag === 'Remark') {
                                const remText = extractLines(itNode);
                                if (remText) {
                                    if (!categoryObj.remarks) categoryObj.remarks = [];
                                    categoryObj.remarks.push(remText);
                                }
                            }
                        }
                    }
                } else if (tag === 'Itemlist') {
                    for (let j = 0; j < node.childNodes.length; j++) {
                        const itNode = node.childNodes[j];
                        if (itNode.nodeType !== 1) continue;
                        const itTag = (itNode.localName || itNode.nodeName || '').replace(/^.*:/, '');
                        if (itTag === 'Item') {
                            const parsedItem = parseItem(itNode, parentCategory, currentPath);
                            if (parentCategory) {
                                parentCategory.items.push(parsedItem);
                            }
                            allItems.push(parsedItem);
                        } else if (itTag === 'Remark') {
                            const remText = extractLines(itNode);
                            if (remText && parentCategory) {
                                if (!parentCategory.remarks) parentCategory.remarks = [];
                                parentCategory.remarks.push(remText);
                            }
                        }
                    }
                } else if (tag === 'Item') {
                    const parsedItem = parseItem(node, parentCategory, currentPath);
                    if (parentCategory) {
                        parentCategory.items.push(parsedItem);
                    }
                    allItems.push(parsedItem);
                }
            }
        }

        // Starte Traversierung an BoQ -> BoQBody
        const boqElem = find(doc, 'BoQ');
        const boqBodyElem = boqElem ? (getChildren(boqElem, 'BoQBody')[0] || find(boqElem, 'BoQBody')) : null;

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
            allItems,
            topLevelCategories,
            warnings
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GAEB_HierarchyBuilder;
}
if (typeof window !== 'undefined') {
    window.GAEB_HierarchyBuilder = GAEB_HierarchyBuilder;
}
