/**
 * db/repositories/gaeb_tender_repo.js
 * Modulares Repository für die Bepreisung und Angebotsentwürfe von GAEB X83 Ausschreibungen.
 * 
 * Verarbeitet Benutzerpreise, Null-Preis-Bestätigungen und Bieterangaben (BiReq)
 * strikt getrennt vom unveränderlichen Original-X83.
 */

const { loadX83Import } = require('./gaeb_repository');
const { calculateDraftCounts } = require('../schema/gaeb_schema');

/**
 * Erstellt einen neuen Tender-Entwurf für einen importierten X83-Datensatz.
 * 
 * @param {Object} db - better-sqlite3 Instanz
 * @param {number} importId - ID aus gaeb_imports
 * @param {Object} [options] - Optionen ({ name, version, angebotId })
 * @returns {Object} Erstellter Draft-Datensatz
 */
function createTenderDraft(db, importId, options = {}) {
    if (!db) throw new Error('Datenbankverbindung erforderlich.');
    if (!importId) throw new Error('Import-ID erforderlich.');

    const imp = db.prepare('SELECT id, project_name FROM gaeb_imports WHERE id = ?').get(importId);
    if (!imp) {
        throw new Error(`GAEB-Import mit ID ${importId} existiert nicht.`);
    }

    let version = Number(options.version);
    if (!version || isNaN(version) || version <= 0) {
        const nextVerRow = db.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS next_ver FROM gaeb_tender_drafts WHERE import_id = ?').get(importId);
        version = nextVerRow ? nextVerRow.next_ver : 1;
    }
    const name = options.name ? String(options.name).trim() : `Hauptangebot v${version}`;
    const angebotId = options.angebotId || null;

    if (angebotId) {
        const doc = db.prepare('SELECT id, type FROM dokumente WHERE id = ?').get(angebotId);
        if (!doc) {
            throw new Error(`Dokument mit ID ${angebotId} existiert nicht.`);
        }
        if (doc.type !== 'angebot') {
            throw new Error(`Dokument mit ID ${angebotId} ist kein Angebot (Typ: '${doc.type}').`);
        }
    }

    // Ermittle initiale Zähler für unbepreiste Positionen und offene BiReq
    const priceableRow = db.prepare(`
        SELECT COUNT(*) AS cnt 
        FROM gaeb_items 
        WHERE import_id = ? AND is_hinweistext = 0
    `).get(importId);
    const initialUnpriced = priceableRow ? priceableRow.cnt : 0;

    const bireqRow = db.prepare(`
        SELECT COUNT(b.id) AS cnt 
        FROM gaeb_item_bireq b 
        JOIN gaeb_items i ON b.item_id = i.id 
        WHERE i.import_id = ?
    `).get(importId);
    const initialMissingBireq = bireqRow ? bireqRow.cnt : 0;

    const qtyTbdRow = db.prepare(`
        SELECT COUNT(*) AS cnt 
        FROM gaeb_items 
        WHERE import_id = ? AND is_hinweistext = 0 AND in_endsumme_enthalten = 1 AND (is_qty_tbd = 1 OR menge IS NULL)
    `).get(importId);
    const initialUnresolvedQtyTbd = qtyTbdRow ? qtyTbdRow.cnt : 0;

    const stmt = db.prepare(`
        INSERT INTO gaeb_tender_drafts (
            import_id, angebot_id, version, name, status,
            total_netto, total_tax, total_brutto,
            unpriced_count, missing_bireq_count, unresolved_qty_tbd_count,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'IN_BEARBEITUNG', 0, 0, 0, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    const res = stmt.run(importId, angebotId, version, name, initialUnpriced, initialMissingBireq, initialUnresolvedQtyTbd);

    return {
        id: res.lastInsertRowid,
        import_id: importId,
        angebot_id: angebotId,
        version,
        name,
        status: 'IN_BEARBEITUNG',
        total_netto: 0,
        total_tax: 0,
        total_brutto: 0,
        unpriced_count: initialUnpriced,
        missing_bireq_count: initialMissingBireq,
        unresolved_qty_tbd_count: initialUnresolvedQtyTbd
    };
}

/**
 * Speichert benutzerdefinierte Preise und BiReq-Antworten atomar in einer SQLite-Transaktion.
 * 
 * Strikte Regeln:
 * - unit_price === null/undefined/'' -> unbepreist
 * - unit_price === 0 -> nur zulässig mit is_zero_confirmed === 1 / true
 * - unit_price > 0 -> regulär
 * - Keine Umwandlung von '' oder null in 0.00!
 * - QtyTBD hat total_price === null (keine Summenverzerrung)
 * - Hinweistexte sind nicht bepreisbar
 * - Transaktions-Rollback bei jeglichem Fehler
 * 
 * @param {Object} db - better-sqlite3 Instanz
 * @param {number} draftId - ID aus gaeb_tender_drafts
 * @param {Object} draftData - Daten ({ name, version, angebotId, prices/items, bireq_answers/bireqAnswers, status })
 * @returns {Object} Aktualisierter Draft-Status und Summen
 */
function saveTenderDraft(db, draftId, draftData = {}) {
    if (!db) throw new Error('Datenbankverbindung erforderlich.');
    if (!draftId) throw new Error('Draft-ID erforderlich.');

    return db.transaction(() => {
        const draft = db.prepare('SELECT * FROM gaeb_tender_drafts WHERE id = ?').get(draftId);
        if (!draft) {
            throw new Error(`Tender-Draft mit ID ${draftId} existiert nicht.`);
        }

        const importId = draft.import_id;

        // Alle Positionen des Imports zur Validierung laden
        const itemRows = db.prepare(`
            SELECT id, import_id, path_oz, menge, is_qty_tbd, in_endsumme_enthalten, is_hinweistext, item_type 
            FROM gaeb_items 
            WHERE import_id = ?
        `).all(importId);
        const itemMap = new Map();
        itemRows.forEach(it => itemMap.set(it.id, it));

        // Alle BiReq-Definitionen des Imports laden
        const bireqRows = db.prepare(`
            SELECT b.id, b.item_id 
            FROM gaeb_item_bireq b 
            JOIN gaeb_items i ON b.item_id = i.id 
            WHERE i.import_id = ?
        `).all(importId);
        const bireqMap = new Map();
        bireqRows.forEach(b => bireqMap.set(b.id, b));

        // 1. Verarbeite Positions-Preise
        const pricesInput = draftData.prices || draftData.items || [];
        const upsertPriceStmt = db.prepare(`
            INSERT INTO gaeb_tender_item_prices (
                draft_id, gaeb_item_id, unit_price, is_zero_confirmed, total_price, tax_rate, in_total, notes, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(draft_id, gaeb_item_id) DO UPDATE SET
                unit_price = excluded.unit_price,
                is_zero_confirmed = excluded.is_zero_confirmed,
                total_price = excluded.total_price,
                tax_rate = excluded.tax_rate,
                in_total = excluded.in_total,
                notes = excluded.notes,
                updated_at = datetime('now')
        `);

        // Normalisiere Preiserfassungs-Array
        const normalizedPrices = Array.isArray(pricesInput)
            ? pricesInput
            : Object.entries(pricesInput).map(([k, v]) => ({ gaeb_item_id: Number(k), ...v }));

        for (const entry of normalizedPrices) {
            const itemId = entry.gaeb_item_id !== undefined ? Number(entry.gaeb_item_id) : (entry.itemId !== undefined ? Number(entry.itemId) : Number(entry._dbId));
            if (!itemId || !itemMap.has(itemId)) {
                throw new Error(`Ungültige gaeb_item_id: ${itemId} gehört nicht zu Import ${importId}.`);
            }

            const item = itemMap.get(itemId);

            // Hinweistexte dürfen nicht bepreist werden
            if (item.is_hinweistext === 1 || item.item_type === 'HINWEISTEXT') {
                continue;
            }

            let unitPrice = null;
            let isZeroConfirmed = 0;

            if (entry.unit_price !== null && entry.unit_price !== undefined && String(entry.unit_price).trim() !== '') {
                const num = Number(entry.unit_price);
                if (isNaN(num) || num < 0) {
                    throw new Error(`Ungültiger Einheitspreis für Position ${item.path_oz || itemId}: '${entry.unit_price}'.`);
                }

                if (num === 0) {
                    isZeroConfirmed = (entry.is_zero_confirmed === 1 || entry.is_zero_confirmed === true) ? 1 : 0;
                    if (!isZeroConfirmed) {
                        throw new Error(`Einheitspreis 0,00 € muss ausdrücklich bestätigt werden (Position: ${item.path_oz || itemId}).`);
                    }
                    unitPrice = 0.0;
                } else {
                    unitPrice = num;
                    isZeroConfirmed = 0;
                }
            } else {
                unitPrice = null;
                isZeroConfirmed = 0;
            }

            // in_total Bestimmung
            let inTotal = 1;
            if (entry.in_total !== undefined && entry.in_total !== null) {
                inTotal = entry.in_total ? 1 : 0;
            } else {
                inTotal = item.in_endsumme_enthalten;
            }

            const taxRate = entry.tax_rate !== undefined && entry.tax_rate !== null ? Number(entry.tax_rate) : 19.0;
            const notes = entry.notes ? String(entry.notes) : null;

            // Gesamtpreis berechnen: Nur wenn Einheitspreis vorhanden UND Menge bestimmt (nicht QtyTBD)
            let totalPrice = null;
            if (unitPrice !== null) {
                if (item.is_qty_tbd === 1 || item.menge === null) {
                    totalPrice = null; // QtyTBD darf keinen festen Gesamtpreis erfinden
                } else {
                    totalPrice = Math.round((unitPrice * item.menge) * 100) / 100;
                }
            }

            upsertPriceStmt.run(draftId, itemId, unitPrice, isZeroConfirmed, totalPrice, taxRate, inTotal, notes);
        }

        // 2. Verarbeite Bieterangaben (BiReq)
        const bireqInput = draftData.bireq_answers || draftData.bireqAnswers || [];
        const upsertBireqStmt = db.prepare(`
            INSERT INTO gaeb_tender_bireq_answers (
                draft_id, gaeb_bireq_id, answer_value, updated_at
            ) VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(draft_id, gaeb_bireq_id) DO UPDATE SET
                answer_value = excluded.answer_value,
                updated_at = datetime('now')
        `);

        const normalizedBireqs = Array.isArray(bireqInput)
            ? bireqInput
            : Object.entries(bireqInput).map(([k, v]) => ({ gaeb_bireq_id: Number(k), answer_value: v }));

        for (const bEntry of normalizedBireqs) {
            const bireqId = bEntry.gaeb_bireq_id !== undefined ? Number(bEntry.gaeb_bireq_id) : (bEntry.bireqId !== undefined ? Number(bEntry.bireqId) : Number(bEntry.id));
            if (!bireqId || !bireqMap.has(bireqId)) {
                throw new Error(`Ungültige gaeb_bireq_id: ${bireqId} gehört nicht zu Import ${importId}.`);
            }

            const answerVal = (bEntry.answer_value !== null && bEntry.answer_value !== undefined) ? String(bEntry.answer_value).trim() : '';
            upsertBireqStmt.run(draftId, bireqId, answerVal);
        }

        // 3. Zähler und Summen ermitteln (einheitliche Zähllogik mit Migration geteilt)
        const { unresolvedQtyTbdCount, unpricedCount, missingBireqCount } = calculateDraftCounts(db, draftId, importId);

        // Summen berechnen: Berücksichtigt nur in_total === 1 mit gültigem totalPrice
        const sumsRow = db.prepare(`
            SELECT 
                COALESCE(SUM(total_price), 0.0) AS total_netto,
                COALESCE(SUM(total_price * (tax_rate / 100.0)), 0.0) AS total_tax
            FROM gaeb_tender_item_prices
            WHERE draft_id = ? AND in_total = 1 AND total_price IS NOT NULL
        `).get(draftId);

        const totalNetto = Math.round((sumsRow.total_netto || 0) * 100) / 100;
        const totalTax = Math.round((sumsRow.total_tax || 0) * 100) / 100;
        const totalBrutto = Math.round((totalNetto + totalTax) * 100) / 100;

        // Status setzen: Vollständig bepreist NUR wenn alle unit prices gesetzt, alle BiReqs beantwortet UND keine offenen QtyTBDs in_total verbleiben
        let newStatus = (unpricedCount === 0 && missingBireqCount === 0 && unresolvedQtyTbdCount === 0) ? 'VOLLSTAENDIG_BEPREIST' : 'IN_BEARBEITUNG';
        if (draftData.status === 'VERWORFEN') {
            newStatus = 'VERWORFEN';
        }

        // Optional Name, Version, Angebot-ID aktualisieren
        const updatedName = draftData.name ? String(draftData.name).trim() : draft.name;
        const updatedVersion = draftData.version ? Number(draftData.version) : draft.version;
        const updatedAngebotId = draftData.angebotId !== undefined ? draftData.angebotId : draft.angebot_id;

        if (updatedAngebotId) {
            const doc = db.prepare('SELECT type FROM dokumente WHERE id = ?').get(updatedAngebotId);
            if (!doc || doc.type !== 'angebot') {
                throw new Error(`Referenziertes Dokument ${updatedAngebotId} ist kein gültiges Angebot.`);
            }
        }

        db.prepare(`
            UPDATE gaeb_tender_drafts SET
                name = ?,
                version = ?,
                angebot_id = ?,
                status = ?,
                total_netto = ?,
                total_tax = ?,
                total_brutto = ?,
                unpriced_count = ?,
                missing_bireq_count = ?,
                unresolved_qty_tbd_count = ?,
                updated_at = datetime('now')
            WHERE id = ?
        `).run(
            updatedName,
            updatedVersion,
            updatedAngebotId,
            newStatus,
            totalNetto,
            totalTax,
            totalBrutto,
            unpricedCount,
            missingBireqCount,
            unresolvedQtyTbdCount,
            draftId
        );

        return {
            success: true,
            draftId,
            status: newStatus,
            total_netto: totalNetto,
            total_tax: totalTax,
            total_brutto: totalBrutto,
            unpriced_count: unpricedCount,
            missing_bireq_count: missingBireqCount,
            unresolved_qty_tbd_count: unresolvedQtyTbdCount
        };
    })();
}

/**
 * Lädt einen Tender-Entwurf und verschmilzt benutzerdefinierte Preise und BiReq-Antworten
 * in das Originalmodell, ohne die Original-X83-Daten zu manipulieren.
 * 
 * @param {Object} db - better-sqlite3 Instanz
 * @param {number} draftId - ID aus gaeb_tender_drafts
 * @returns {Object} { draft, tree, items, projectInfo, stats }
 */
function loadTenderDraft(db, draftId) {
    if (!db) throw new Error('Datenbankverbindung erforderlich.');
    if (!draftId) throw new Error('Draft-ID erforderlich.');

    const draft = db.prepare('SELECT * FROM gaeb_tender_drafts WHERE id = ?').get(draftId);
    if (!draft) {
        throw new Error(`Tender-Draft mit ID ${draftId} nicht gefunden.`);
    }

    // 1. Originales X83-Modell unverfälscht laden
    const loadedOriginal = loadX83Import(db, draft.import_id);

    // 2. Draft-Preise laden
    const priceRows = db.prepare(`
        SELECT * FROM gaeb_tender_item_prices WHERE draft_id = ?
    `).all(draftId);
    const priceMap = new Map();
    priceRows.forEach(p => priceMap.set(p.gaeb_item_id, p));

    // 3. Draft-BiReq-Antworten laden
    const bireqAnswers = db.prepare(`
        SELECT * FROM gaeb_tender_bireq_answers WHERE draft_id = ?
    `).all(draftId);
    const bireqMap = new Map();
    bireqAnswers.forEach(b => bireqMap.set(b.gaeb_bireq_id, b));

    // 4. Verschmelzen für die UI-Projektion
    const items = loadedOriginal.items.map(origItem => {
        const item = { ...origItem };
        const priceRow = priceMap.get(item._dbId);

        if (priceRow) {
            item.draft_price = priceRow.unit_price;
            item.unit_price = priceRow.unit_price;
            item.is_zero_confirmed = Boolean(priceRow.is_zero_confirmed);
            item.draft_total_price = priceRow.total_price;
            item.total_price = priceRow.total_price;
            item.in_total = Boolean(priceRow.in_total);
            item.in_endsumme_enthalten = priceRow.in_total;
            item.draft_notes = priceRow.notes;
            item.tax_rate = priceRow.tax_rate;
            item.is_priced = priceRow.unit_price !== null;
        } else {
            item.draft_price = null;
            item.unit_price = null;
            item.is_zero_confirmed = false;
            item.draft_total_price = null;
            item.total_price = null;
            item.in_total = (origItem.in_endsumme_enthalten === 1);
            item.draft_notes = null;
            item.tax_rate = 19.0;
            item.is_priced = false;
        }

        // BiReq Antworten verschmelzen
        if (Array.isArray(item.bieterangaben)) {
            item.bieterangaben = item.bieterangaben.map(b => {
                const answerRow = bireqMap.get(b.id || b._dbId);
                const answerVal = answerRow ? answerRow.answer_value : '';
                return {
                    ...b,
                    answer_value: answerVal,
                    is_answered: Boolean(answerVal && answerVal.trim().length > 0)
                };
            });
            item.biReq = item.bieterangaben;
        }

        return item;
    });

    // Kategorien-Baum aktualisieren, sodass Category.items auf die aktualisierten Items verweisen
    const itemsByDbId = new Map();
    items.forEach(it => itemsByDbId.set(it._dbId, it));

    function syncCategoryTree(cat) {
        if (Array.isArray(cat.items)) {
            cat.items = cat.items.map(it => itemsByDbId.get(it._dbId) || it);
        }
        if (Array.isArray(cat.categories)) {
            cat.categories.forEach(child => syncCategoryTree(child));
        }
    }

    const tree = loadedOriginal.categories;
    tree.forEach(topCat => syncCategoryTree(topCat));

    const priceableItems = items.filter(i => !i.isHinweistext);
    const pricedItems = priceableItems.filter(i => i.is_priced);

    const stats = {
        draft_id: draft.id,
        version: draft.version,
        name: draft.name,
        status: draft.status,
        total_netto: draft.total_netto,
        total_tax: draft.total_tax,
        total_brutto: draft.total_brutto,
        total_items: items.length,
        priceable_items_count: priceableItems.length,
        priced_items_count: pricedItems.length,
        unpriced_count: draft.unpriced_count,
        missing_bireq_count: draft.missing_bireq_count,
        unresolved_qty_tbd_count: draft.unresolved_qty_tbd_count || 0
    };

    return {
        draft,
        tree,
        categories: tree,
        hierarchy: tree,
        sections: tree,
        items,
        projectInfo: loadedOriginal.projectInfo,
        rawXml: loadedOriginal.rawXml,
        hasOriginalBytes: loadedOriginal.hasOriginalBytes,
        stats
    };
}

/**
 * Erstellt eine unabhängige Kopie / neue Version eines bestehenden Drafts.
 * 
 * @param {Object} db - better-sqlite3 Instanz
 * @param {number} draftId - ID des Vorlagen-Drafts
 * @param {Object} [options] - Optionen ({ newName, newVersion })
 * @returns {Object} Neuer geklonter Draft
 */
function cloneTenderDraft(db, draftId, options = {}) {
    if (!db) throw new Error('Datenbankverbindung erforderlich.');
    if (!draftId) throw new Error('Draft-ID erforderlich.');

    return db.transaction(() => {
        const orig = db.prepare('SELECT * FROM gaeb_tender_drafts WHERE id = ?').get(draftId);
        if (!orig) {
            throw new Error(`Tender-Draft mit ID ${draftId} nicht gefunden.`);
        }

        const nextVerRow = db.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS next_ver FROM gaeb_tender_drafts WHERE import_id = ?').get(orig.import_id);
        const newVersion = (options.newVersion !== undefined && !isNaN(Number(options.newVersion)) && Number(options.newVersion) > 0)
            ? Number(options.newVersion)
            : (nextVerRow ? nextVerRow.next_ver : orig.version + 1);
        const newName = options.newName ? String(options.newName).trim() : `${orig.name} (v${newVersion})`;
        const newAngebotId = null; // Zwingend null! Kopiere angebot_id NIEMALS automatisch in die geklonte Version!

        const insertDraftStmt = db.prepare(`
            INSERT INTO gaeb_tender_drafts (
                import_id, angebot_id, version, name, status,
                total_netto, total_tax, total_brutto,
                unpriced_count, missing_bireq_count, unresolved_qty_tbd_count,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `);

        const res = insertDraftStmt.run(
            orig.import_id,
            newAngebotId,
            newVersion,
            newName,
            orig.status,
            orig.total_netto,
            orig.total_tax,
            orig.total_brutto,
            orig.unpriced_count,
            orig.missing_bireq_count,
            orig.unresolved_qty_tbd_count || 0
        );
        const newDraftId = res.lastInsertRowid;

        // Alle Positionspreise des Ursprungsentwurfs kopieren
        db.prepare(`
            INSERT INTO gaeb_tender_item_prices (
                draft_id, gaeb_item_id, unit_price, is_zero_confirmed, total_price, tax_rate, in_total, notes, created_at, updated_at
            )
            SELECT ?, gaeb_item_id, unit_price, is_zero_confirmed, total_price, tax_rate, in_total, notes, datetime('now'), datetime('now')
            FROM gaeb_tender_item_prices
            WHERE draft_id = ?
        `).run(newDraftId, draftId);

        // Alle BiReq-Antworten des Ursprungsentwurfs kopieren
        db.prepare(`
            INSERT INTO gaeb_tender_bireq_answers (
                draft_id, gaeb_bireq_id, answer_value, created_at, updated_at
            )
            SELECT ?, gaeb_bireq_id, answer_value, datetime('now'), datetime('now')
            FROM gaeb_tender_bireq_answers
            WHERE draft_id = ?
        `).run(newDraftId, draftId);

        return {
            id: newDraftId,
            import_id: orig.import_id,
            angebot_id: null,
            version: newVersion,
            name: newName,
            status: orig.status,
            total_netto: orig.total_netto,
            total_tax: orig.total_tax,
            total_brutto: orig.total_brutto,
            unpriced_count: orig.unpriced_count,
            missing_bireq_count: orig.missing_bireq_count,
            unresolved_qty_tbd_count: orig.unresolved_qty_tbd_count || 0
        };
    })();
}

/**
 * Listet alle Drafts für einen GAEB-Import auf.
 * 
 * @param {Object} db - better-sqlite3 Instanz
 * @param {number} importId - ID aus gaeb_imports
 * @returns {Array<Object>} Liste aller Drafts
 */
function listTenderDrafts(db, importId) {
    if (!db) throw new Error('Datenbankverbindung erforderlich.');
    if (!importId) throw new Error('Import-ID erforderlich.');

    return db.prepare(`
        SELECT 
            d.*,
            (SELECT COUNT(*) FROM gaeb_tender_item_prices p WHERE p.draft_id = d.id AND p.unit_price IS NOT NULL) AS priced_count
        FROM gaeb_tender_drafts d
        WHERE d.import_id = ?
        ORDER BY d.version ASC, d.id ASC
    `).all(importId);
}

/**
 * Löscht einen Tender-Entwurf und kaskadierend alle zugehörigen Preise und BiReq-Antworten.
 * 
 * @param {Object} db - better-sqlite3 Instanz
 * @param {number} draftId - ID aus gaeb_tender_drafts
 * @returns {Object} { success: true, deletedDraftId }
 */
function deleteTenderDraft(db, draftId) {
    if (!db) throw new Error('Datenbankverbindung erforderlich.');
    if (!draftId) throw new Error('Draft-ID erforderlich.');

    const res = db.prepare('DELETE FROM gaeb_tender_drafts WHERE id = ?').run(draftId);
    if (res.changes === 0) {
        throw new Error(`Draft ${draftId} nicht gefunden.`);
    }

    return { success: true, deletedDraftId: draftId };
}

/**
 * Lädt und validiert einen Tender-Entwurf für den X84-Export.
 * 
 * @param {Object} db - better-sqlite3 Instanz
 * @param {number} draftId - ID aus gaeb_tender_drafts
 * @param {Object} [options] - Optionen
 * @returns {Object} { draftData, validation, model }
 */
function getTenderDraftForExport(db, draftId, options = {}) {
    if (!db) throw new Error('Datenbankverbindung erforderlich.');
    if (!draftId) throw new Error('Draft-ID erforderlich.');

    const gaebX84 = require('../../js/gaeb_x84');
    const validation = gaebX84.validateDraftForExport(db, draftId, options);
    const draftData = loadTenderDraft(db, draftId);
    let model = null;
    if (validation.valid) {
        model = gaebX84.mapDraftToX84Model(db, draftId, options);
    }

    return {
        draftData,
        validation,
        model
    };
}

/**
 * Factory-Funktion zur Integration in das zentrale Repositories-Setup.
 * @param {Object} deps - Abhängigkeiten ({ db, dbAPI })
 */
function createGaebTenderRepo(deps) {
    const { db } = deps;
    return {
        createTenderDraft: (importId, options) => createTenderDraft(db, importId, options),
        saveTenderDraft: (draftId, draftData) => saveTenderDraft(db, draftId, draftData),
        loadTenderDraft: (draftId) => loadTenderDraft(db, draftId),
        cloneTenderDraft: (draftId, options) => cloneTenderDraft(db, draftId, options),
        listTenderDrafts: (importId) => listTenderDrafts(db, importId),
        deleteTenderDraft: (draftId) => deleteTenderDraft(db, draftId),
        getTenderDraftForExport: (draftId, options) => getTenderDraftForExport(db, draftId, options)
    };
}

module.exports = {
    createTenderDraft,
    saveTenderDraft,
    loadTenderDraft,
    cloneTenderDraft,
    listTenderDrafts,
    deleteTenderDraft,
    getTenderDraftForExport,
    createGaebTenderRepo
};

