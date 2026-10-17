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
 * Führt den vollständigen X84-Export eines Tender-Entwurfs durch (rein, ohne DB-Zugriff):
 * 1. Validiert den Entwurf auf Vollständigkeit und Konformität
 * 2. Mappt das hierarchische Modell mit centgenauen Totals
 * 3. Serialisiert das GAEB DA XML für 3.2 oder 3.3
 *
 * SOLL: exportTenderDraftToX84(draftData, options) — draftData vorab via
 * window.api.loadTenderDraft / dbAPI.loadTenderDraft / Repository geladen.
 * Legacy: (db, draftId, options, deps) mit injiziertem Loader (deps.loadTenderDraft).
 * Direkter DB-Zugriff (require db / db.prepare) ist untersagt — s. IPC-Disziplin
 * (main/ipc/ipc-gaeb.js 'gaeb:export-x84' lädt via Repository, Renderer via window.api).
 *
 * @param {Object} draftDataOrDb - Vorab geladenes draftData ODER Legacy-db-Handle
 * @param {number|Object} [draftIdOrOptions]
 * @param {Object} [options]
 * @param {Object} [deps]
 * @returns {Object} { xml, model, validation, stats }
 */
function exportTenderDraftToX84(draftDataOrDb, draftIdOrOptions, options = {}, deps = {}) {
    // SOLL-Pfad normalize: (draftData, options?, deps?)
    let draftIdForError = null;
    let effOptions = options;
    let effDeps = deps;
    const isDraftData = draftDataOrDb && typeof draftDataOrDb === 'object'
        && draftDataOrDb.draft && Array.isArray(draftDataOrDb.items);
    if (isDraftData) {
        if (draftIdOrOptions && typeof draftIdOrOptions === 'object' && !options) effOptions = draftIdOrOptions;
        draftIdForError = draftDataOrDb.draft && draftDataOrDb.draft.id;
    } else {
        draftIdForError = draftIdOrOptions;
    }
    // 1. Strikte Vorvalidierung (reine Funktion, DB nur via Loader in effOptions/effDeps)
    const validation = isDraftData
        ? validateDraftForExport(draftDataOrDb, effOptions, effDeps)
        : validateDraftForExport(draftDataOrDb, draftIdOrOptions, effOptions, effDeps);
    if (!validation.valid) {
        const err = new Error(`Tender-Draft #${draftIdForError} ist nicht bereit für den X84-Export:\n- ${validation.errors.join('\n- ')}`);
        err.validationErrors = validation.errors;
        err.validation = validation;
        throw err;
    }

    // 2. Exportmodell aufbereiten (rein)
    const model = isDraftData
        ? mapDraftToX84Model(draftDataOrDb, effOptions, effDeps)
        : mapDraftToX84Model(draftDataOrDb, draftIdOrOptions, effOptions, effDeps);

    // 3. XML erzeugen
    const xml = serializeX84XML(model);

    return {
        xml,
        model,
        validation,
        stats: {
            draftId: validation.draftSummary?.draftId || draftIdForError,
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
