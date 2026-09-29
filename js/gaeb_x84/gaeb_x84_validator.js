/**
 * js/gaeb_x84/gaeb_x84_validator.js
 * 
 * Validiert einen Bepreisungsentwurf vor dem GAEB X84 Export:
 * - Existenz des Drafts und Zugehörigkeit zum angegebenen Import
 * - GAEB-Version: Streng nur '3.2' und '3.3'
 * - Vollständige Bepreisung aller bepreisbaren Positionen
 * - Null-Preise (0,00 €) nur bei ausdrücklicher Bestätigung (is_zero_confirmed = 1)
 * - Keine ungelösten Mengen (QtyTBD / menge == null) im Hauptangebot (in_total = 1)
 * - Bepreisung auch von Wahl-/Bedarfspositionen (in_total = 0)
 * - Vollständige Beantwortung aller geforderten Bieterangaben (<BiReq>)
 */

'use strict';

const gaebTenderRepo = require('../../db/repositories/gaeb_tender_repo');

/**
 * Validiert einen Bepreisungsentwurf auf Exportfähigkeit nach GAEB DA XML X84.
 * 
 * @param {Object} db - better-sqlite3 Instanz oder vorab geladenes draftData
 * @param {number} [draftId] - ID aus gaeb_tender_drafts
 * @param {Object} [options] - Optionale Parameter (z. B. importId zur Verifikation)
 * @returns {Object} { valid: boolean, errors: string[], warnings: string[], draftSummary: object }
 */
function validateDraftForExport(db, draftId, options = {}) {
    const errors = [];
    const warnings = [];

    let draftData = null;
    let draft = null;

    // Unterstütze Übergabe eines bereits geladenen draftData-Objekts (z. B. in Tests)
    if (db && typeof db === 'object' && db.draft && Array.isArray(db.items)) {
        draftData = db;
        draft = draftData.draft;
    } else {
        if (!db) {
            return {
                valid: false,
                errors: ['Datenbankverbindung erforderlich.'],
                warnings: [],
                draftSummary: null
            };
        }
        if (!draftId) {
            return {
                valid: false,
                errors: ['Draft-ID erforderlich.'],
                warnings: [],
                draftSummary: null
            };
        }

        const draftRow = db.prepare('SELECT * FROM gaeb_tender_drafts WHERE id = ?').get(draftId);
        if (!draftRow) {
            return {
                valid: false,
                errors: [`Tender-Draft mit ID ${draftId} nicht gefunden.`],
                warnings: [],
                draftSummary: null
            };
        }

        if (options.importId && Number(draftRow.import_id) !== Number(options.importId)) {
            return {
                valid: false,
                errors: [`Tender-Draft #${draftId} gehört zu Import #${draftRow.import_id}, nicht zu Import #${options.importId}.`],
                warnings: [],
                draftSummary: null
            };
        }

        try {
            draftData = gaebTenderRepo.loadTenderDraft(db, draftId);
            draft = draftData.draft;
        } catch (e) {
            return {
                valid: false,
                errors: [`Fehler beim Laden des Tender-Drafts #${draftId}: ${e.message}`],
                warnings: [],
                draftSummary: null
            };
        }
    }

    // 1. GAEB-Version prüfen
    const gaebVersion = String(draftData.projectInfo?.gaebVersion || '').trim();
    if (gaebVersion !== '3.2' && gaebVersion !== '3.3') {
        errors.push(`GAEB-Version "${gaebVersion || 'unbekannt'}" wird für den X84-Export nicht unterstützt. Unterstützt werden ausschließlich GAEB DA XML 3.2 und 3.3.`);
    }

    // 2. Positionen und Vollständigkeit analysieren
    const items = draftData.items || [];
    let priceableCount = 0;
    let pricedCount = 0;
    let totalBireqCount = 0;
    let answeredBireqCount = 0;
    let unresolvedQtyTbdCount = 0;

    items.forEach(item => {
        const isHinweistext = Boolean(
            item.isHinweistext || 
            item.is_hinweistext === 1 || 
            String(item.item_type || item.positions_art || '').toUpperCase() === 'HINWEISTEXT'
        );

        if (isHinweistext) {
            // Hinweistexte sind mengenneutral und unbepreist
            return;
        }

        priceableCount++;
        const ozLabel = item.oz || item.oz_code || item.rno_part || item.id || `Pos_${item._sortIndex || '?'}`;
        const inTotal = Boolean(item.in_total === 1 || item.in_total === true || item.in_endsumme_enthalten === 1);

        // a) Einheitspreis prüfen
        const hasUnitPrice = (item.unit_price !== null && item.unit_price !== undefined && !isNaN(Number(item.unit_price)));
        if (!hasUnitPrice) {
            errors.push(`Position ${ozLabel}: Fehlender Einheitspreis (EP).`);
        } else {
            const numPrice = Number(item.unit_price);
            if (numPrice < 0) {
                errors.push(`Position ${ozLabel}: Negativer Einheitspreis (${numPrice.toFixed(2)} €) nicht zulässig.`);
            } else if (numPrice === 0) {
                if (!item.is_zero_confirmed) {
                    errors.push(`Position ${ozLabel}: Einheitspreis ist 0,00 €, aber die Null-Preis-Bestätigung fehlt.`);
                } else {
                    pricedCount++;
                }
            } else {
                pricedCount++;
            }
        }

        // b) QtyTBD im Hauptangebot prüfen
        const isQtyTbd = Boolean(item.isQtyTBD || item.is_qty_tbd === 1 || item.menge === null || item.menge === undefined);
        if (inTotal && isQtyTbd) {
            unresolvedQtyTbdCount++;
            errors.push(`Position ${ozLabel}: Ungelöste Bedarfs-/Freie Menge (QtyTBD) im Hauptangebot (in_total = 1) nicht zulässig.`);
        }

        // c) BiReq Beantwortung prüfen
        const bireqs = item.biReq || item.bieterangaben || [];
        if (Array.isArray(bireqs) && bireqs.length > 0) {
            bireqs.forEach(br => {
                totalBireqCount++;
                const val = (br.answer_value !== null && br.answer_value !== undefined) ? String(br.answer_value).trim() : '';
                if (val.length === 0) {
                    const brLabel = br.label || br.description || br.bireq_type || 'Bietertextergänzung';
                    errors.push(`Position ${ozLabel}: Fehlende Bieterangabe für "${brLabel}".`);
                } else {
                    answeredBireqCount++;
                }
            });
        }
    });

    const draftSummary = {
        draftId: draft?.id,
        name: draft?.name,
        version: draft?.version,
        importId: draft?.import_id,
        gaebVersion,
        totalNetto: draft?.total_netto || 0,
        totalTax: draft?.total_tax || 0,
        totalBrutto: draft?.total_brutto || 0,
        totalItems: items.length,
        priceableCount,
        pricedCount,
        totalBireqCount,
        answeredBireqCount,
        unresolvedQtyTbdCount,
        status: draft?.status
    };

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        draftSummary
    };
}

module.exports = {
    validateDraftForExport
};
