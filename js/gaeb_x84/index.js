/**
 * js/gaeb_x84/index.js
 * 
 * Zentrales Einstiegsmodul für den GAEB DA XML X84 Export (Phase 84: Angebotsabgabe).
 * Unterstützt Dual-Mode (Node.js CommonJS & Browser/Electron window.GAEB_X84).
 */

'use strict';

const { validateDraftForExport } = require('./gaeb_x84_validator');
const { mapDraftToX84Model, sanitizeXmlId, getBidderAddress, extractOriginalXmlMetadata } = require('./gaeb_x84_mapper');
const { serializeX84XML, serializeCategory, serializeItem, escapeXml } = require('./gaeb_x84_serializer');

/**
 * Führt den vollständigen X84-Export eines Tender-Entwurfs durch:
 * 1. Validiert den Entwurf auf Vollständigkeit und Konformität
 * 2. Mappt das hierarchische Modell mit centgenauen Totals
 * 3. Serialisiert das GAEB DA XML für 3.2 oder 3.3
 * 
 * @param {Object} db - better-sqlite3 Instanz oder vorab geladenes draftData
 * @param {number} draftId - ID aus gaeb_tender_drafts
 * @param {Object} [options] - Export-Optionen ({ bidder, bidDate, importId, ... })
 * @returns {Object} { xml, model, validation, stats }
 */
function exportTenderDraftToX84(db, draftId, options = {}) {
    // 1. Strikte Vorvalidierung
    const validation = validateDraftForExport(db, draftId, options);
    if (!validation.valid) {
        const err = new Error(`Tender-Draft #${draftId} ist nicht bereit für den X84-Export:\n- ${validation.errors.join('\n- ')}`);
        err.validationErrors = validation.errors;
        err.validation = validation;
        throw err;
    }

    // 2. Exportmodell aufbereiten
    const model = mapDraftToX84Model(db, draftId, options);

    // 3. XML erzeugen
    const xml = serializeX84XML(model);

    return {
        xml,
        model,
        validation,
        stats: {
            draftId: validation.draftSummary?.draftId || draftId,
            draftName: validation.draftSummary?.name,
            version: validation.draftSummary?.version,
            gaebVersion: model.gaebVersion,
            totalNetto: model.award?.boq?.boqInfo?.total,
            xmlLength: xml.length
        }
    };
}

const GAEB_X84 = {
    validateDraftForExport,
    mapDraftToX84Model,
    serializeX84XML,
    exportTenderDraftToX84,
    sanitizeXmlId,
    getBidderAddress,
    extractOriginalXmlMetadata,
    escapeXml
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GAEB_X84;
}

if (typeof window !== 'undefined') {
    window.GAEB_X84 = GAEB_X84;
}
