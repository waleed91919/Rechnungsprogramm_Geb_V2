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

// IPC- & Repository-Disziplin: Dieses Modul ist reine Fachlogik (Renderer + Main + Tests).
// KEIN require('../../db/...'), KEIN db.prepare/SELECT/INSERT — DB-Zugriffe nur via
// typisierte IPC-Kanäle (main/ipc/ipc-gaeb.js: 'gaeb:validate-x84-export') und
// Repositories (db/repositories/gaeb_tender_repo.js: loadTenderDraft).
// Aufrufer (Main/IPC/Repository) lädt draftData vorab und übergibt es hier rein.

/**
 * Validiert einen Bepreisungsentwurf auf Exportfähigkeit nach GAEB DA XML X84.
 *
 * Reine Funktion ohne DB-Zugriff. Erwartet vorab geladene draftData
 * (via window.api.loadTenderDraft / dbAPI.loadTenderDraft / Repository).
 *
 * @param {Object} draftDataOrDb - Vorab geladenes draftData ({ draft, items, ... }) — SOLL.
 *   Aus Kompatibilität wird auch die Legacy-Signatur (db, draftId, options, deps) erkannt,
 *   greift dann aber NUR auf einen injizierten Loader (deps.loadTenderDraft / options.loadTenderDraft)
 *   zurück — niemals direkt auf db.prepare oder db-Repositories.
 * @param {number} [draftId] - ID aus gaeb_tender_drafts (nur Legacy-Pfad / Fehlermeldungen)
 * @param {Object} [options] - Optionale Parameter (z. B. importId zur Verifikation, loadTenderDraft-Loader)
 * @param {Object} [deps] - Optionale Loader ({ loadTenderDraft })
 * @returns {Object} { valid: boolean, errors: string[], warnings: string[], draftSummary: object }
 */
function validateDraftForExport(draftDataOrDb, draftId, options = {}, deps = {}) {
    const errors = [];
    const warnings = [];

    let draftData = null;
    let draft = null;

    // SOLL-Pfad: bereits geladenes draftData-Objekt (Renderer via window.api, Main via Repository)
    if (draftDataOrDb && typeof draftDataOrDb === 'object' && draftDataOrDb.draft && Array.isArray(draftDataOrDb.items)) {
        draftData = draftDataOrDb;
        draft = draftData.draft;
        // draftId kann im SOLL-Pfad als options-Override im 2. Arg stecken — normalisieren
        if (draftId && typeof draftId === 'object' && !options) {
            options = draftId;
        }
    } else {
        // Legacy-Pfad (Node/Main/Tests): (db, draftId) — DB-Zugriff NUR via injizierten Repository-Loader
        const db = draftDataOrDb;
        const loader = (deps && typeof deps.loadTenderDraft === 'function')
            ? deps.loadTenderDraft
            : (options && typeof options.loadTenderDraft === 'function' ? options.loadTenderDraft : null);
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
        let effLoader = loader;
        if (!effLoader) {
            // Renderer (window + sandbox): strikt untersagt — nur vorab geladene draftData via window.api.
            const isRenderer = (typeof window !== 'undefined' && typeof window.document !== 'undefined')
                || (typeof process !== 'undefined' && process.type === 'renderer');
            if (isRenderer) {
                return {
                    valid: false,
                    errors: [
                        'IPC-/Repository-Disziplin: validateDraftForExport benötigt vorab geladene draftData ' +
                        '(window.api.loadTenderDraft). ' +
                        `Direkter DB-Zugriff für Draft #${draftId} ist im Renderer untersagt.`
                    ],
                    warnings: [],
                    draftSummary: null
                };
            }
            // Node/Main/Tests: Fallback strikt via Repository (kein db.prepare hier) — Legacy-Kompatibilität.
            try {
                const repo = require('../../db/repositories/gaeb_tender_repo');
                if (repo && typeof repo.loadTenderDraft === 'function') effLoader = repo.loadTenderDraft;
            } catch (_e) { effLoader = null; }
        }
        if (!effLoader) {
            return {
                valid: false,
                errors: [
                    'IPC-/Repository-Disziplin: validateDraftForExport benötigt vorab geladene draftData ' +
                    '(window.api.loadTenderDraft / dbAPI.loadTenderDraft). ' +
                    `Direkter DB-Zugriff für Draft #${draftId} ist untersagt.`
                ],
                warnings: [],
                draftSummary: null
            };
        }

        let loaded = null;
        try {
            loaded = effLoader(db, draftId);
        } catch (e) {
            return {
                valid: false,
                errors: [`Fehler beim Laden des Tender-Drafts #${draftId}: ${e.message}`],
                warnings: [],
                draftSummary: null
            };
        }
        if (!loaded || !loaded.draft) {
            return {
                valid: false,
                errors: [`Tender-Draft mit ID ${draftId} nicht gefunden.`],
                warnings: [],
                draftSummary: null
            };
        }
        if (options && options.importId && Number(loaded.draft.import_id) !== Number(options.importId)) {
            return {
                valid: false,
                errors: [`Tender-Draft #${draftId} gehört zu Import #${loaded.draft.import_id}, nicht zu Import #${options.importId}.`],
                warnings: [],
                draftSummary: null
            };
        }
        draftData = loaded;
        draft = draftData.draft;
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
        const inTotal = item.in_total !== undefined && item.in_total !== null
            ? Boolean(Number(item.in_total))
            : Boolean(item.in_endsumme_enthalten);

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
