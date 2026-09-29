/**
 * js/gaeb_x84/gaeb_x84_mapper.js
 * 
 * Bereitet das Datenmodell für den GAEB DA XML X84 Export vor:
 * - Übernimmt Projekt-Metadaten (NamePrj, PrjID, LblPrj, Cur, BoQInfo, BoQBkdn)
 * - Übernimmt Bieter-Informationen (CTR > Address) aus options.bidder oder einstellungen
 * - Berechnet Summen (Totals.Total) für jede BoQCtgy und das gesamte BoQ strikt basierend auf in_total = 1
 * - Ordnet jedem Item seine Bepreisung zu (Qty, UP, IT, BiReq TextComplements, BidComm)
 */

'use strict';

const gaebTenderRepo = require('../../db/repositories/gaeb_tender_repo');

/**
 * Wandelt einen String in eine für XML xs:ID gültige Zeichenkette (NCName) um.
 * Ein xs:ID darf nicht mit einer Ziffer beginnen.
 * 
 * @param {string} id 
 * @param {string} [prefix='ID_'] 
 * @returns {string}
 */
function sanitizeXmlId(id, prefix = 'ID_') {
    if (!id || typeof id !== 'string') return `${prefix}${Date.now()}`;
    let sanitized = id.replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!/^[a-zA-Z_]/.test(sanitized)) {
        sanitized = `${prefix}${sanitized}`;
    }
    return sanitized;
}

/**
 * Liest Bieter-Adressdaten aus options.bidder oder aus der Tabelle 'einstellungen'.
 * Erfindet KEINE Daten: Fehlt eine Angabe, bleibt sie ein leerer String.
 * 
 * @param {Object} db 
 * @param {Object} options 
 * @returns {Object} { name1, street, pcode, city }
 */
function getBidderAddress(db, options = {}) {
    const bidder = {
        name1: '',
        street: '',
        pcode: '',
        city: ''
    };

    if (options.bidder && typeof options.bidder === 'object') {
        bidder.name1 = String(options.bidder.name1 || options.bidder.Name1 || options.bidder.firmenname || options.bidder.name || '').trim();
        bidder.street = String(options.bidder.street || options.bidder.Street || options.bidder.strasse || '').trim();
        bidder.pcode = String(options.bidder.pcode || options.bidder.PCode || options.bidder.plz || options.bidder.PLZ || '').trim();
        bidder.city = String(options.bidder.city || options.bidder.City || options.bidder.ort || options.bidder.Ort || '').trim();
    }

    if (db && typeof db.prepare === 'function') {
        try {
            const rows = db.prepare(`SELECT key, value FROM einstellungen WHERE key IN ('firmenname', 'firma', 'strasse', 'plz', 'ort')`).all();
            const settings = {};
            rows.forEach(r => { settings[r.key] = r.value; });

            if (!bidder.name1) bidder.name1 = (settings.firmenname || settings.firma || '').trim();
            if (!bidder.street) bidder.street = (settings.strasse || '').trim();
            if (!bidder.pcode) bidder.pcode = (settings.plz || '').trim();
            if (!bidder.city) bidder.city = (settings.ort || '').trim();
        } catch (_e) {
            // Einstellungen-Tabelle existiert möglicherweise in isolierten Tests nicht
        }
    }

    // Beschränkung auf max. XSD-Längen
    return {
        name1: bidder.name1.substring(0, 40),
        street: bidder.street.substring(0, 40),
        pcode: bidder.pcode.substring(0, 20),
        city: bidder.city.substring(0, 40)
    };
}

/**
 * Extrahiert Metadaten (BoQ ID, BoQBkdn, PrjInfo, BoQID) aus dem unveränderten Original-X83 XML.
 * 
 * @param {string} rawXml 
 * @returns {Object}
 */
function extractOriginalXmlMetadata(rawXml) {
    if (!rawXml || typeof rawXml !== 'string') return {};

    const meta = {};

    // 1. BoQ ID Attribut
    const boqIdMatch = rawXml.match(/<BoQ\s+[^>]*ID=["']([^"']+)["']/i);
    if (boqIdMatch) {
        meta.boqId = boqIdMatch[1];
    }

    // 2. BoQ Name
    const boqNameMatch = rawXml.match(/<BoQInfo>[\s\S]*?<Name>([\s\S]*?)<\/Name>/i);
    if (boqNameMatch) {
        meta.boqName = boqNameMatch[1].trim();
    }

    // 3. PrjInfo
    const prjNameMatch = rawXml.match(/<PrjInfo>[\s\S]*?<NamePrj>([\s\S]*?)<\/NamePrj>/i);
    if (prjNameMatch) {
        meta.namePrj = prjNameMatch[1].trim();
    }
    const prjIdMatch = rawXml.match(/<PrjInfo>[\s\S]*?<PrjID>([\s\S]*?)<\/PrjID>/i);
    if (prjIdMatch) {
        meta.prjId = prjIdMatch[1].trim();
    }
    const lblPrjMatch = rawXml.match(/<PrjInfo>[\s\S]*?<LblPrj>([\s\S]*?)<\/LblPrj>/i);
    if (lblPrjMatch) {
        meta.lblPrj = lblPrjMatch[1].trim();
    }

    // 4. AwardInfo (Cur, CurLbl, BoQID)
    const curMatch = rawXml.match(/<AwardInfo>[\s\S]*?<Cur>([\s\S]*?)<\/Cur>/i);
    if (curMatch) {
        meta.cur = curMatch[1].trim();
    }
    const curLblMatch = rawXml.match(/<AwardInfo>[\s\S]*?<CurLbl>([\s\S]*?)<\/CurLbl>/i);
    if (curLblMatch) {
        meta.curLbl = curLblMatch[1].trim();
    }
    const boqGuidMatch = rawXml.match(/<AwardInfo>[\s\S]*?<BoQID>([\s\S]*?)<\/BoQID>/i);
    if (boqGuidMatch) {
        meta.awardBoqId = boqGuidMatch[1].trim();
    }

    // 5. BoQBkdn Blöcke
    const bkdnRegex = /<BoQBkdn>([\s\S]*?)<\/BoQBkdn>/gi;
    const bkdnList = [];
    let match;
    while ((match = bkdnRegex.exec(rawXml)) !== null) {
        const bkdnContent = match[1];
        const typeMatch = bkdnContent.match(/<Type>([\s\S]*?)<\/Type>/i);
        const lblMatch = bkdnContent.match(/<LblBoQBkdn>([\s\S]*?)<\/LblBoQBkdn>/i);
        const lenMatch = bkdnContent.match(/<Length>([\s\S]*?)<\/Length>/i);
        const numMatch = bkdnContent.match(/<Num>([\s\S]*?)<\/Num>/i);

        if (typeMatch && lenMatch && numMatch) {
            bkdnList.push({
                type: typeMatch[1].trim(),
                lbl: lblMatch ? lblMatch[1].trim() : null,
                length: parseInt(lenMatch[1].trim(), 10),
                num: numMatch[1].trim()
            });
        }
    }
    if (bkdnList.length > 0) {
        meta.boqBkdn = bkdnList;
    }

    return meta;
}

/**
 * Erstellt Standard-Gliederungsstufen (BoQBkdn) basierend auf der Kategorie-Tiefe,
 * falls das Original-XML keine Gliederung enthielt oder nicht vorlag.
 * 
 * @param {Array} categories 
 * @returns {Array}
 */
function generateFallbackBkdn(categories) {
    function getMaxDepth(cats, currentDepth = 1) {
        let max = currentDepth;
        for (const c of cats) {
            if (Array.isArray(c.categories) && c.categories.length > 0) {
                const d = getMaxDepth(c.categories, currentDepth + 1);
                if (d > max) max = d;
            }
        }
        return max;
    }

    const catDepth = getMaxDepth(categories || []);
    const bkdn = [];

    // Für jede Kategorie-Ebene einen BoQLevel-Eintrag
    for (let i = 0; i < catDepth; i++) {
        bkdn.push({
            type: 'BoQLevel',
            lbl: i === 0 ? 'Gewerk' : (i === 1 ? 'Abschnitt' : `Ebene ${i + 1}`),
            length: 2,
            num: 'Yes'
        });
    }

    // Positionsebene
    bkdn.push({
        type: 'Item',
        lbl: 'Position',
        length: 4,
        num: 'Yes'
    });

    return bkdn.slice(0, 7); // Maximal 7 Ebenen laut GAEB-Schema
}

/**
 * Mappt ein einzelnes GAEB-Item für den X84-Export.
 * 
 * @param {Object} item 
 * @returns {Object}
 */
function mapItemForX84(item) {
    const isHinweistext = Boolean(
        item.isHinweistext || 
        item.is_hinweistext === 1 || 
        String(item.item_type || item.positions_art || '').toUpperCase() === 'HINWEISTEXT'
    );

    const oz = item.oz || item.oz_code || item.rno_part || '';
    const id = sanitizeXmlId(item.id || `POS_${item._dbId || oz.replace(/[^a-zA-Z0-9_]/g, '_')}`);
    const rnoPart = item.rno_part || oz.split('.').pop() || '0010';

    const shortText = item.kurztext || item.short_text || item.name || '';
    const longText = item.langtext || item.long_text || item.description || item.detailTxt || item.completeText || null;

    if (isHinweistext) {
        return {
            id,
            rnoPart,
            shortText,
            longText,
            isHinweistext: true,
            inTotal: false,
            qty: null,
            up: null,
            it: null,
            itNumeric: null,
            biReqAnswers: [],
            notes: null
        };
    }

    const inTotal = item.in_total !== undefined && item.in_total !== null
        ? Boolean(Number(item.in_total))
        : Boolean(item.in_endsumme_enthalten);

    const menge = (item.menge !== null && item.menge !== undefined) ? Number(item.menge) : null;
    const up = (item.unit_price !== null && item.unit_price !== undefined) ? Number(item.unit_price) : null;

    let itNumeric = null;
    if (menge !== null && up !== null) {
        itNumeric = Math.round(menge * up * 100) / 100;
    } else if (item.total_price !== null && item.total_price !== undefined) {
        itNumeric = Math.round(Number(item.total_price) * 100) / 100;
    }

    const qtyFormatted = menge !== null ? menge.toFixed(3) : null;
    const upFormatted = up !== null ? up.toFixed(3) : null;
    const itFormatted = itNumeric !== null ? itNumeric.toFixed(2) : null;

    // BiReq Antworten
    const biReqAnswers = [];
    const bireqs = item.biReq || item.bieterangaben || [];
    if (Array.isArray(bireqs)) {
        bireqs.forEach((br, idx) => {
            const markLbl = br.sort_index !== undefined ? (Number(br.sort_index) + 1) : (idx + 1);
            const answerValue = (br.answer_value !== null && br.answer_value !== undefined) ? String(br.answer_value).trim() : '';
            biReqAnswers.push({
                markLbl: String(markLbl),
                answerValue,
                label: br.label || br.description || ''
            });
        });
    }

    const notes = (item.draft_notes || item.notes || '').trim() || null;

    return {
        id,
        rnoPart,
        shortText,
        longText,
        isHinweistext: false,
        inTotal,
        qty: qtyFormatted,
        up: upFormatted,
        it: itFormatted,
        itNumeric,
        biReqAnswers,
        notes
    };
}

/**
 * Rekursives Mapping des Kategoriebaums und centgenaue Summenbildung (Totals.Total).
 * Strikte Regel: Nur Positionen mit in_total === true fließen in die Totals ein!
 * 
 * @param {Object} cat 
 * @returns {Object}
 */
function mapCategoryRecursive(cat) {
    let catTotal = 0;
    const subCategories = [];
    if (Array.isArray(cat.categories)) {
        for (const subCat of cat.categories) {
            const mappedSub = mapCategoryRecursive(subCat);
            subCategories.push(mappedSub);
            catTotal += mappedSub.totalNumeric;
        }
    }

    const mappedItems = [];
    if (Array.isArray(cat.items)) {
        for (const item of cat.items) {
            const mappedItem = mapItemForX84(item);
            mappedItems.push(mappedItem);
            if (mappedItem.inTotal && mappedItem.itNumeric !== null) {
                catTotal += mappedItem.itNumeric;
            }
        }
    }

    // GAEB X84 validation rule: A BoQCtgy cannot contain both sub-categories and items.
    if (subCategories.length > 0 && mappedItems.length > 0) {
        throw new Error(`Kategorie "${cat.rno_part || cat.id || 'Unbekannt'}" enthält sowohl Unterkategorien als auch direkte Positionen. Dies ist im GAEB X84 Format unzulässig.`);
    }

    catTotal = Math.round(catTotal * 100) / 100;

    return {
        id: sanitizeXmlId(cat.id || `CTG_${cat._dbId || '1'}`),
        rnoPart: cat.rno_part || cat.lblCtgy || '01',
        subCategories,
        items: mappedItems,
        totalNumeric: catTotal,
        totalFormatted: catTotal.toFixed(2)
    };
}

/**
 * Bereitet das vollständige X84-Exportmodell vor.
 * 
 * @param {Object} db - better-sqlite3 Instanz oder vorab geladenes draftData
 * @param {number} [draftId] - ID aus gaeb_tender_drafts
 * @param {Object} [options] - Optionen ({ bidder, bidDate, ... })
 * @returns {Object} Vorbereitetes Modell für gaeb_x84_serializer
 */
function mapDraftToX84Model(db, draftId, options = {}) {
    let draftData = null;
    let dbInstance = db;

    if (db && typeof db === 'object' && db.draft && Array.isArray(db.items)) {
        draftData = db;
        dbInstance = options.db || null;
    } else {
        if (!db) throw new Error('Datenbankverbindung erforderlich.');
        if (!draftId) throw new Error('Draft-ID erforderlich.');
        draftData = gaebTenderRepo.loadTenderDraft(db, draftId);
    }

    const draft = draftData.draft;
    const gaebVersion = String(draftData.projectInfo?.gaebVersion || '3.3').trim();
    if (gaebVersion !== '3.2' && gaebVersion !== '3.3') {
        throw new Error(`GAEB-Version "${gaebVersion}" wird für X84 nicht unterstützt. Nur 3.2 und 3.3 sind zulässig.`);
    }

    // Original-XML Metadaten extrahieren
    const xmlMeta = extractOriginalXmlMetadata(draftData.rawXml);

    // Projekt-Kopfdaten
    const namePrj = (xmlMeta.namePrj || draftData.projectInfo?.name || draft?.name || 'Projekt').substring(0, 60);
    const prjId = xmlMeta.prjId || draftData.projectInfo?.id || null;
    const lblPrj = (xmlMeta.lblPrj || draftData.projectInfo?.name || namePrj).substring(0, 100);

    // Währung
    const cur = (xmlMeta.cur || draftData.projectInfo?.currency || 'EUR').trim();
    const curLbl = xmlMeta.curLbl || null;

    // Bieter-Adresse
    const bidder = getBidderAddress(dbInstance, options);

    // Datum & Uhrzeit
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 8);
    const bidDate = options.bidDate || dateStr;

    // BoQ ID & Name
    const boqXmlId = sanitizeXmlId(xmlMeta.boqId || draftData.projectInfo?.id || `BOQ_${draft?.import_id || '1'}`, 'BOQ_');
    const boqName = (xmlMeta.boqName || draftData.projectInfo?.name || 'Leistungsverzeichnis').substring(0, 20).trim();

    // Kategorien rekursiv mappen und berechnen
    const rawCategories = draftData.categories || draftData.tree || draftData.hierarchy || draftData.sections || [];
    const mappedCategories = rawCategories.map(cat => mapCategoryRecursive(cat));

    // Gesamtsumme der Ausschreibung berechnen (strikte Summe aller Hauptangebotspositionen)
    let boqTotal = 0;
    mappedCategories.forEach(cat => {
        boqTotal += cat.totalNumeric;
    });
    boqTotal = Math.round(boqTotal * 100) / 100;
    const boqTotalFormatted = boqTotal.toFixed(2);

    // Gliederungsstufen (BoQBkdn)
    const boqBkdn = xmlMeta.boqBkdn || generateFallbackBkdn(rawCategories);

    // BoQID für AwardInfo (bei 3.2 strikte Prüfung auf UUID)
    let awardBoqId = xmlMeta.awardBoqId || null;
    if (gaebVersion === '3.2' && awardBoqId) {
        const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(awardBoqId);
        if (!isUuid) {
            awardBoqId = null;
        }
    }

    return {
        gaebVersion,
        date: dateStr,
        time: timeStr,
        progSystem: 'W-Link ERP',
        progName: 'W-Link GAEB Core',
        project: {
            namePrj,
            prjId: gaebVersion === '3.3' ? prjId : null, // PrjID existiert in 3.2 tgPrjInfo nicht!
            lblPrj
        },
        award: {
            dp: '84',
            cur,
            curLbl,
            bidDate,
            boqId: awardBoqId,
            bidder,
            boq: {
                id: boqXmlId,
                boqInfo: {
                    name: boqName,
                    boqBkdn,
                    total: boqTotalFormatted
                },
                categories: mappedCategories
            }
        }
    };
}

module.exports = {
    mapDraftToX84Model,
    sanitizeXmlId,
    getBidderAddress,
    extractOriginalXmlMetadata
};
