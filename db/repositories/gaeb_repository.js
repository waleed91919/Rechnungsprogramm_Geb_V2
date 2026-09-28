/**
 * db/repositories/gaeb_repository.js
 * Modulares Repository für die Persistenz von GAEB X83 Ausschreibungsdaten.
 * 
 * Bietet atomare Transaktionen, Re-Import-Policies mit Verknüpfungsschutz
 * und lückenlose Rekonstruktion der BoQCtgy-Hierarchie.
 */

const crypto = require('crypto');

/**
 * Berechnet den SHA-256-Hash eines Strings oder Buffers.
 * @param {string|Buffer} content 
 * @returns {string} 64-stelliger Hex-Hash
 */
function calculateFileHash(content) {
    if (!content) return '';
    return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Erkennt die GAEB-Version aus XML-Inhalt oder Fallbacks.
 * @param {string} rawXml 
 * @returns {string} '3.2' | '3.3'
 */
function detectGaebVersion(rawXml) {
    if (!rawXml || typeof rawXml !== 'string') return '3.3';
    if (rawXml.includes('DA83/3.2') || rawXml.includes('DA_XML_3.2') || rawXml.includes('3.2_2013-10')) {
        return '3.2';
    }
    return '3.3';
}

/**
 * Speichert ein geparstes GAEB X83 Dokument atomar in die Datenbank.
 * 
 * Re-Import Policy:
 * 1. Existiert file_hash bereits:
 *    - Prüfen, ob Positionen mit einem aktiven Angebot/Beleg verknüpft sind (linked_position_id IS NOT NULL).
 *    - Wenn verknüpft: Ablehnen mit Ausnahme (Schutz bestehender Belege).
 *    - Wenn NICHT verknüpft und options.overwrite === true: Alten Import atomar löschen und neu anlegen.
 *    - Wenn NICHT verknüpft und options.overwrite !== true: Bestehenden Import unverändert zurückgeben.
 * 2. Sämtliche Inserts (Import, Kategorien, Items, BiReq, UPComponents) laufen in einer
 *    einzigen SQLite-Transaktion. Tritt ein Fehler auf, erfolgt ein kompletter Rollback.
 * 
 * @param {Object} db - better-sqlite3 Instanz
 * @param {Object} parsedData - Rückgabe von GAEBEngine.parseGAEBXML()
 * @param {Object} [options] - Optionen ({ fileName, rawXml, overwrite, gaebVersion })
 * @returns {Object} { importId, fileHash, itemCount, categoryCount, isExisting }
 */
function saveX83Import(db, parsedData, options = {}) {
    if (!db) throw new Error('Datenbankverbindung erforderlich.');
    if (!parsedData || typeof parsedData !== 'object') {
        throw new Error('Ungültige GAEB-Daten für Speicherung.');
    }

    // Puffer-Erkennung (striktes Trennen von binärem Original und decodiertem XML-Text)
    let rawBuffer = null;
    if (Buffer.isBuffer(options.rawBytes)) {
        rawBuffer = options.rawBytes;
    } else if (Buffer.isBuffer(options.buffer)) {
        rawBuffer = options.buffer;
    } else if (Buffer.isBuffer(options.rawContent)) {
        rawBuffer = options.rawContent;
    } else if (Buffer.isBuffer(parsedData.rawBytes)) {
        rawBuffer = parsedData.rawBytes;
    } else if (Buffer.isBuffer(parsedData.rawBuffer)) {
        rawBuffer = parsedData.rawBuffer;
    }

    let rawBytes = null;
    let rawXml = '';
    let fileHash = '';
    let fileSize = 0;

    // Vorprüfung: Wenn BEIDE Optionen (rawBytes bzw. buffer UND rawXml als String) übergeben werden:
    // Verifiziere serverseitig, dass beide denselben Inhalt darstellen!
    const providedBuffer = Buffer.isBuffer(options.rawBytes)
        ? options.rawBytes
        : (Buffer.isBuffer(options.buffer)
            ? options.buffer
            : (Buffer.isBuffer(options.rawContent) ? options.rawContent : null));

    const providedXml = typeof options.rawXml === 'string'
        ? options.rawXml
        : (typeof options.xmlString === 'string'
            ? options.xmlString
            : (typeof options.rawContent === 'string' ? options.rawContent : null));

    if (providedBuffer && providedXml !== null) {
        const hashFromBytes = crypto.createHash('sha256').update(providedBuffer).digest('hex');
        const hashFromXml = crypto.createHash('sha256').update(providedXml, 'utf-8').digest('hex');
        if (hashFromBytes !== hashFromXml) {
            throw new Error('Konsistenzfehler: rawBytes und rawXml stimmen inhaltlich nicht überein.');
        }
    }

    if (rawBuffer) {
        // Garantierter Original-Byte-Pfad
        rawBytes = rawBuffer;
        fileHash = crypto.createHash('sha256').update(rawBuffer).digest('hex');
        fileSize = rawBuffer.length;
        rawXml = typeof options.rawXml === 'string' && options.rawXml.length > 0
            ? options.rawXml
            : (typeof parsedData.rawXml === 'string' && parsedData.rawXml.length > 0 ? parsedData.rawXml : rawBuffer.toString('utf8'));
    } else {
        // Legacy-String-Pfad: Keine Original-Bytes vorhanden; keine Scheingenauigkeit vortäuschen
        rawXml = options.rawXml || options.xmlString || (typeof options.rawContent === 'string' ? options.rawContent : '') || (typeof parsedData.rawXml === 'string' ? parsedData.rawXml : '');
        rawBytes = null;
        fileHash = crypto.createHash('sha256').update(rawXml, 'utf8').digest('hex');
        fileSize = Buffer.byteLength(rawXml, 'utf8');
    }

    const fileName = options.fileName || parsedData.projectInfo?.name || 'import.x83';
    const gaebVersion = options.gaebVersion || detectGaebVersion(rawXml);
    const exchangePhase = parsedData.projectInfo?.gaebPhase || 'X83';

    // 1. Re-Import-Policy: Existiert file_hash bereits?
    const existing = db.prepare('SELECT id, file_name, imported_at, raw_bytes FROM gaeb_imports WHERE file_hash = ?').get(fileHash);
    if (existing) {
        // Verknüpfungsprüfung 1: Explizite Verknüpfung mit Angeboten (gaeb_import_angebote)
        const isLinked = isImportLinked(db, existing.id);

        // Verknüpfungsprüfung 2: Legacy-Verknüpfung über gaeb_items.linked_position_id
        const linkedItems = db.prepare(`
            SELECT COUNT(*) AS cnt 
            FROM gaeb_items 
            WHERE import_id = ? AND linked_position_id IS NOT NULL
        `).get(existing.id);

        if (isLinked) {
            throw new Error(
                `Import kann nicht überschrieben werden: Der bestehende Import (ID: ${existing.id}) ` +
                `ist bereits mit mindestens einem Angebot verknüpft.`
            );
        }

        if (linkedItems && linkedItems.cnt > 0) {
            throw new Error(
                `Import kann nicht überschrieben werden: ${linkedItems.cnt} Position(en) des bestehenden Imports (ID: ${existing.id}) ` +
                `sind bereits mit aktiven Angeboten/Positionen verknüpft.`
            );
        }

        if (!options.overwrite) {
            // Unverändert zurückgeben (keine stillen Duplikate erzeugen)
            return {
                importId: existing.id,
                fileHash,
                isExisting: true,
                hasOriginalBytes: Boolean(existing.raw_bytes !== null && existing.raw_bytes !== undefined),
                itemCount: db.prepare('SELECT COUNT(*) AS cnt FROM gaeb_items WHERE import_id = ?').get(existing.id).cnt,
                categoryCount: db.prepare('SELECT COUNT(*) AS cnt FROM gaeb_categories WHERE import_id = ?').get(existing.id).cnt,
                message: 'Import mit diesem Datei-Hash existiert bereits (unverändert zurückgegeben).'
            };
        }
    }

    // 2. Atomare Transaktion ausführen
    return db.transaction(() => {
        // Falls overwrite aktiv und Datensatz existiert: alten Eintrag sauber atomar entfernen
        if (existing && options.overwrite) {
            db.prepare('DELETE FROM gaeb_imports WHERE id = ?').run(existing.id);
        }

        // a) Import-Kopfdatensatz
        const insertImportStmt = db.prepare(`
            INSERT INTO gaeb_imports (
                file_name, gaeb_version, exchange_phase, project_name, project_id_ext,
                currency, file_hash, file_size, raw_bytes, raw_xml, imported_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `);

        const importRes = insertImportStmt.run(
            fileName,
            gaebVersion,
            exchangePhase,
            parsedData.projectInfo?.name || null,
            parsedData.projectInfo?.id || parsedData.projectInfo?.projectId || null,
            parsedData.projectInfo?.currency || 'EUR',
            fileHash,
            fileSize,
            rawBytes,
            rawXml || null
        );
        const importId = importRes.lastInsertRowid;

        // b) Prepared Statements für Kindelemente
        const insertCategoryStmt = db.prepare(`
            INSERT INTO gaeb_categories (
                import_id, parent_id, cat_level, sort_index, lbl_ctgy, rno_part, path_oz, name, description, raw_metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertItemStmt = db.prepare(`
            INSERT INTO gaeb_items (
                import_id, category_id, sort_index, path_oz, rno_part, item_type,
                short_text, long_text, menge, is_qty_tbd, einheit, preis, gesamtpreis,
                is_price_missing, in_endsumme_enthalten, aln_group_no, aln_ser_no, provis,
                is_hinweistext, linked_position_id, raw_metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertBiReqStmt = db.prepare(`
            INSERT INTO gaeb_item_bireq (
                item_id, sort_index, bireq_type, label, description, value
            ) VALUES (?, ?, ?, ?, ?, ?)
        `);

        const insertUpCompStmt = db.prepare(`
            INSERT INTO gaeb_item_up_components (
                item_id, lohn, stoff, geraet, sonstiges, total
            ) VALUES (?, ?, ?, ?, ?, ?)
        `);

        // c) Kategorien rekursiv einfügen
        const categoryIdMap = new Map();
        let totalCategories = 0;

        function insertCategoryRecursive(cat, parentSqlId, level, sortIndex) {
            totalCategories++;
            const meta = {
                originalId: cat.id || null,
                remarks: cat.remarks || [],
                categoryPath: cat.categoryPath || []
            };
            const desc = cat.description || cat.vorbemerkung || null;

            const res = insertCategoryStmt.run(
                importId,
                parentSqlId,
                level,
                sortIndex,
                cat.lblCtgy || cat.rno_part || null,
                cat.rno_part || null,
                cat.oz_prefix || null,
                cat.name || null,
                desc,
                JSON.stringify(meta)
            );
            const catSqlId = res.lastInsertRowid;
            if (cat.id) {
                categoryIdMap.set(cat.id, catSqlId);
            }
            categoryIdMap.set(cat, catSqlId);

            if (Array.isArray(cat.categories)) {
                cat.categories.forEach((subCat, subIdx) => {
                    insertCategoryRecursive(subCat, catSqlId, level + 1, subIdx);
                });
            }
            return catSqlId;
        }

        const categories = parsedData.categories || parsedData.hierarchy || parsedData.sections || [];
        if (Array.isArray(categories)) {
            categories.forEach((cat, idx) => {
                insertCategoryRecursive(cat, null, 0, idx);
            });
        }

        // d) Positionen einfügen
        const allItems = parsedData.items || [];
        let totalItems = 0;

        allItems.forEach((pos, itemIdx) => {
            totalItems++;
            let catSqlId = null;
            if (pos.categoryId && categoryIdMap.has(pos.categoryId)) {
                catSqlId = categoryIdMap.get(pos.categoryId);
            } else if (pos.parentId && categoryIdMap.has(pos.parentId)) {
                catSqlId = categoryIdMap.get(pos.parentId);
            } else if (pos.categoryObj && categoryIdMap.has(pos.categoryObj)) {
                catSqlId = categoryIdMap.get(pos.categoryObj);
            }

            const pathOz = pos.oz_code || pos.oz || `pos_${itemIdx + 1}`;
            const rnoPart = pos.rno_part ? String(pos.rno_part) : null;
            const itemType = String(pos.positions_art || pos.itemType || 'NORMAL').toUpperCase();
            const shortText = (pos.kurztext || pos.name) ? String(pos.kurztext || pos.name) : '';
            const longText = (pos.langtext || pos.detailTxt || pos.completeText || pos.description) ? String(pos.langtext || pos.detailTxt || pos.completeText || pos.description) : null;

            const menge = (pos.menge !== undefined && pos.menge !== null && !isNaN(Number(pos.menge))) ? Number(pos.menge) : null;
            const isQtyTbd = pos.isQtyTBD ? 1 : 0;
            const einheit = pos.einheit ? String(pos.einheit) : null;
            const preis = (pos.preis !== undefined && pos.preis !== null && !isNaN(Number(pos.preis))) ? Number(pos.preis) : null;
            const gesamtpreis = (pos.gesamtpreis !== undefined && pos.gesamtpreis !== null && !isNaN(Number(pos.gesamtpreis))) ? Number(pos.gesamtpreis) : null;
            const isPriceMissing = (pos.isPriceMissing !== false && preis === null) ? 1 : 0;
            const inEndsumme = (pos.in_endsumme_enthalten === 0 || pos.in_endsumme_enthalten === false) ? 0 : 1;
            const alnGroupNo = (pos.aln_group_no || pos.alnGroup) ? String(pos.aln_group_no || pos.alnGroup) : null;
            const alnSerNo = (pos.aln_ser_no || pos.alnSerNo) ? String(pos.aln_ser_no || pos.alnSerNo) : null;
            const provis = (pos.provis !== undefined && pos.provis !== null) ? String(pos.provis) : null;
            const isHinweistext = pos.isHinweistext ? 1 : 0;

            const rawMeta = {
                originalId: pos.id || null,
                declared_oz: pos.declared_oz || null,
                cost_type: pos.cost_type || 'MATERIAL',
                isGrundposition: Boolean(pos.isGrundposition),
                isAlternative: Boolean(pos.isAlternative || pos.is_wahl),
                isBedarf: Boolean(pos.isBedarf || pos.is_bedarf),
                isPauschal: Boolean(pos.isPauschal),
                withTotal: pos.withTotal,
                gewerk: pos.gewerk,
                abschnitt: pos.abschnitt,
                titel: pos.titel,
                categoryPath: pos.categoryPath
            };

            const itemRes = insertItemStmt.run(
                importId,
                catSqlId !== undefined && catSqlId !== null ? catSqlId : null,
                itemIdx,
                pathOz,
                rnoPart,
                itemType,
                shortText,
                longText,
                menge,
                isQtyTbd,
                einheit,
                preis,
                gesamtpreis,
                isPriceMissing,
                inEndsumme,
                alnGroupNo,
                alnSerNo,
                provis,
                isHinweistext,
                null, // linked_position_id
                JSON.stringify(rawMeta)
            );
            const itemSqlId = itemRes.lastInsertRowid;

            // BiReq einfügen
            const biReqs = pos.biReq || pos.bieterangaben;
            if (Array.isArray(biReqs)) {
                biReqs.forEach((br, brIdx) => {
                    insertBiReqStmt.run(
                        itemSqlId,
                        brIdx,
                        (br.type || br.bireq_type) ? String(br.type || br.bireq_type) : null,
                        br.label ? String(br.label) : null,
                        (br.description || br.text) ? String(br.description || br.text) : null,
                        br.value ? String(br.value) : null
                    );
                });
            }

            // UPComponents einfügen
            const up = pos.upComponents || null;
            const hasUpValues = up !== null || pos.lohn !== undefined || pos.stoff !== undefined || pos.gerat !== undefined || pos.sonstiges !== undefined;
            if (hasUpValues) {
                const lohn = (pos.lohn !== undefined && pos.lohn !== null && !isNaN(Number(pos.lohn))) ? Number(pos.lohn) : (up && up.lohn !== undefined && up.lohn !== null && !isNaN(Number(up.lohn)) ? Number(up.lohn) : null);
                const stoff = (pos.stoff !== undefined && pos.stoff !== null && !isNaN(Number(pos.stoff))) ? Number(pos.stoff) : (up && up.stoff !== undefined && up.stoff !== null && !isNaN(Number(up.stoff)) ? Number(up.stoff) : null);
                const rawGer = pos.gerat !== undefined ? pos.gerat : (pos.geraet !== undefined ? pos.geraet : (up ? (up.geraet !== undefined ? up.geraet : up.gerat) : null));
                const geraet = (rawGer !== undefined && rawGer !== null && !isNaN(Number(rawGer))) ? Number(rawGer) : null;
                const sonstiges = (pos.sonstiges !== undefined && pos.sonstiges !== null && !isNaN(Number(pos.sonstiges))) ? Number(pos.sonstiges) : (up && up.sonstiges !== undefined && up.sonstiges !== null && !isNaN(Number(up.sonstiges)) ? Number(up.sonstiges) : null);
                const total = (up && up.total !== undefined && up.total !== null && !isNaN(Number(up.total))) ? Number(up.total) : (preis !== null ? Number(preis) : null);

                insertUpCompStmt.run(
                    itemSqlId,
                    lohn,
                    stoff,
                    geraet,
                    sonstiges,
                    total
                );
            }
        });

        return {
            importId,
            fileHash,
            itemCount: totalItems,
            categoryCount: totalCategories,
            isExisting: false,
            hasOriginalBytes: Boolean(rawBytes !== null)
        };
    })();
}

/**
 * Lädt einen gespeicherten GAEB X83 Import vollständig aus der Datenbank.
 * Rekonstruiert die identische Baum- und Listenstruktur wie GAEBEngine.parseGAEBXML().
 * 
 * Gibt standardmäßig KEINEN riesigen Buffer im Rückgabeobjekt zurück,
 * um JSON/IPC zum Renderer nicht zu belasten. Stattdessen wird hasOriginalBytes gesetzt.
 * Der Puffer kann bei Bedarf gezielt über getImportOriginalBuffer(db, importId) geladen werden.
 * 
 * @param {Object} db - better-sqlite3 Instanz
 * @param {number} importId - ID aus gaeb_imports
 * @returns {Object|null} { importId, projectInfo, hasOriginalBytes, categories, hierarchy, sections, items, rawXml }
 */
function loadX83Import(db, importId) {
    if (!db) throw new Error('Datenbankverbindung erforderlich.');
    if (!importId) throw new Error('Import-ID fehlt.');

    const importRow = db.prepare('SELECT * FROM gaeb_imports WHERE id = ?').get(importId);
    if (!importRow) return null;

    const categoryRows = db.prepare(`
        SELECT * FROM gaeb_categories 
        WHERE import_id = ? 
        ORDER BY cat_level ASC, sort_index ASC
    `).all(importId);

    const itemRows = db.prepare(`
        SELECT * FROM gaeb_items 
        WHERE import_id = ? 
        ORDER BY sort_index ASC
    `).all(importId);

    const biReqRows = db.prepare(`
        SELECT b.* 
        FROM gaeb_item_bireq b
        JOIN gaeb_items i ON b.item_id = i.id
        WHERE i.import_id = ?
        ORDER BY b.item_id ASC, b.sort_index ASC
    `).all(importId);

    const upRows = db.prepare(`
        SELECT u.* 
        FROM gaeb_item_up_components u
        JOIN gaeb_items i ON u.item_id = i.id
        WHERE i.import_id = ?
    `).all(importId);

    // Mappings für 1:N und 1:1 Kindtabellen
    const biReqMap = new Map();
    biReqRows.forEach(br => {
        if (!biReqMap.has(br.item_id)) {
            biReqMap.set(br.item_id, []);
        }
        biReqMap.get(br.item_id).push(br);
    });

    const upMap = new Map();
    upRows.forEach(up => {
        upMap.set(up.item_id, up);
    });

    // Kategorien vorbereiten
    const categoriesMap = new Map(); // catSqlId -> categoryObj
    const topLevelCategories = [];

    categoryRows.forEach(row => {
        const meta = JSON.parse(row.raw_metadata_json || '{}');
        const catObj = {
            id: meta.originalId || `ctg_${row.id}`,
            _dbId: row.id,
            _parentId: row.parent_id,
            rno_part: row.rno_part || '',
            lblCtgy: row.lbl_ctgy || row.rno_part || '',
            name: row.name || '',
            vorbemerkung: row.description || null,
            description: row.description || null,
            level: row.cat_level + 1,
            parentId: row.parent_id ? (categoryRows.find(c => c.id === row.parent_id)?.raw_metadata_json ? JSON.parse(categoryRows.find(c => c.id === row.parent_id).raw_metadata_json).originalId : `ctg_${row.parent_id}`) : null,
            categoryPath: meta.categoryPath || [],
            oz_prefix: row.path_oz || '',
            remarks: meta.remarks || [],
            categories: [],
            items: []
        };
        categoriesMap.set(row.id, catObj);
    });

    // Kategorien-Baum verknüpfen
    categoryRows.forEach(row => {
        const catObj = categoriesMap.get(row.id);
        if (row.parent_id === null || !categoriesMap.has(row.parent_id)) {
            topLevelCategories.push(catObj);
        } else {
            const parentCat = categoriesMap.get(row.parent_id);
            parentCat.categories.push(catObj);
        }
    });

    // Positionen rekonstruieren
    const allItems = [];

    itemRows.forEach(row => {
        const meta = JSON.parse(row.raw_metadata_json || '{}');
        const biReqs = biReqMap.get(row.id) || [];
        const upComp = upMap.get(row.id) || null;

        const biReqFormatted = biReqs.length > 0 ? biReqs.map(b => ({
            id: b.id,
            _dbId: b.id,
            type: b.bireq_type,
            label: b.label,
            description: b.description,
            value: b.value
        })) : undefined;

        const upComponentsFormatted = upComp ? {
            lohn: upComp.lohn,
            stoff: upComp.stoff,
            geraet: upComp.geraet,
            gerat: upComp.geraet,
            sonstiges: upComp.sonstiges,
            total: upComp.total
        } : undefined;

        const parentCatObj = row.category_id ? categoriesMap.get(row.category_id) : null;

        const itemObj = {
            id: meta.originalId || `item_${row.id}`,
            oz_code: row.path_oz,
            oz: row.path_oz,
            rno_part: row.rno_part || '',
            declared_oz: meta.declared_oz || null,
            name: row.short_text,
            kurztext: row.short_text,
            langtext: row.long_text || undefined,
            detailTxt: row.long_text || undefined,
            completeText: row.long_text || undefined,
            description: row.long_text || undefined,
            menge: row.menge !== null ? row.menge : null,
            einheit: row.einheit || '',
            preis: row.preis !== null ? row.preis : null,
            gesamtpreis: row.gesamtpreis !== null ? row.gesamtpreis : null,
            isPriceMissing: row.is_price_missing === 1,
            isQtyTBD: row.is_qty_tbd === 1 ? true : undefined,
            cost_type: meta.cost_type || 'MATERIAL',
            positions_art: row.item_type,
            itemType: (row.item_type === 'NORMAL' ? 'Normal' : (row.item_type === 'HINWEISTEXT' ? 'Hinweistext' : row.item_type)),
            in_endsumme_enthalten: row.in_endsumme_enthalten,
            isGrundposition: meta.isGrundposition || false,
            isAlternative: meta.isAlternative || false,
            isBedarf: meta.isBedarf || false,
            is_wahl: meta.isAlternative || false,
            is_bedarf: meta.isBedarf || false,
            provis: row.provis || undefined,
            withTotal: meta.withTotal,
            isPauschal: meta.isPauschal || false,
            isHinweistext: row.is_hinweistext === 1 ? true : undefined,
            alnGroup: row.aln_group_no || undefined,
            alnSerNo: row.aln_ser_no || undefined,
            aln_group_no: row.aln_group_no || undefined,
            aln_ser_no: row.aln_ser_no || undefined,
            requiresBidderInfo: biReqs.length > 0 ? true : undefined,
            bieterangaben: biReqFormatted,
            biReq: biReqFormatted,
            upComponents: upComponentsFormatted,
            lohn: upComp ? upComp.lohn : undefined,
            stoff: upComp ? upComp.stoff : undefined,
            gerat: upComp ? upComp.geraet : undefined,
            sonstiges: upComp ? upComp.sonstiges : undefined,
            categoryId: parentCatObj ? parentCatObj.id : undefined,
            parentId: parentCatObj ? parentCatObj.id : undefined,
            category: parentCatObj ? parentCatObj.name : undefined,
            categoryPath: meta.categoryPath,
            gewerk: meta.gewerk,
            abschnitt: meta.abschnitt,
            titel: meta.titel,
            linked_position_id: row.linked_position_id || null,
            _dbId: row.id,
            _importId: row.import_id,
            _categoryId: row.category_id,
            _sortIndex: row.sort_index
        };

        allItems.push(itemObj);

        // Position der Kategorie zuweisen
        if (parentCatObj) {
            parentCatObj.items.push(itemObj);
        }
    });

    const hasOriginalBytes = Boolean(importRow.raw_bytes !== null && importRow.raw_bytes !== undefined);

    const projectInfo = {
        name: importRow.project_name || 'GAEB Import',
        gaebPhase: importRow.exchange_phase || 'X83',
        currency: importRow.currency || 'EUR',
        gaebVersion: importRow.gaeb_version,
        id: importRow.project_id_ext,
        file_name: importRow.file_name,
        file_hash: importRow.file_hash,
        file_size: importRow.file_size,
        hasOriginalBytes,
        imported_at: importRow.imported_at,
        updated_at: importRow.updated_at
    };

    return {
        importId: importRow.id,
        projectInfo,
        hasOriginalBytes,
        categories: topLevelCategories.length > 0 ? topLevelCategories : undefined,
        hierarchy: topLevelCategories.length > 0 ? topLevelCategories : undefined,
        sections: topLevelCategories.length > 0 ? topLevelCategories : undefined,
        items: allItems,
        rawXml: importRow.raw_xml
    };
}

/**
 * Gibt gezielt den echten Original-Dateipuffer (BLOB) eines GAEB-Imports zurück.
 * Für Altdaten mit nur raw_xml TEXT wird null zurückgegeben.
 * 
 * @param {Object} db - better-sqlite3 Instanz
 * @param {number} importId - ID aus gaeb_imports
 * @returns {Buffer|null} Buffer mit exakten Original-Bytes oder null
 */
function getImportOriginalBuffer(db, importId) {
    if (!db) throw new Error('Datenbankverbindung erforderlich.');
    if (!importId) throw new Error('Import-ID fehlt.');

    const row = db.prepare('SELECT raw_bytes FROM gaeb_imports WHERE id = ?').get(importId);
    if (!row) return null;
    return row.raw_bytes || null;
}

/**
 * Verknüpft einen GAEB X83 Import mit einer echten Angebotsversion in `dokumente`.
 * 
 * @param {Object} db - better-sqlite3 Instanz
 * @param {number} importId - ID aus gaeb_imports
 * @param {number} angebotId - ID aus dokumente
 * @param {string|null} [notes] - Optionale Notizen / Referenzhinweise
 * @returns {Object} { success: true, id, importId, angebotId, notes }
 */
function linkImportToAngebot(db, importId, angebotId, notes = null) {
    if (!db) throw new Error('Datenbankverbindung erforderlich.');
    if (!importId) throw new Error('Import-ID erforderlich.');
    if (!angebotId) throw new Error('Angebots-ID erforderlich.');

    // 1. Prüfe, dass importId in gaeb_imports existiert
    const imp = db.prepare('SELECT id FROM gaeb_imports WHERE id = ?').get(importId);
    if (!imp) {
        throw new Error(`GAEB-Import mit ID ${importId} existiert nicht.`);
    }

    // 2. Prüfe, dass angebotId in dokumente existiert UND type === 'angebot'
    const doc = db.prepare('SELECT id, type, nr FROM dokumente WHERE id = ?').get(angebotId);
    if (!doc) {
        throw new Error(`Dokument mit ID ${angebotId} existiert nicht.`);
    }
    if (doc.type !== 'angebot') {
        throw new Error(`Dokument mit ID ${angebotId} ist kein Angebot (Typ: '${doc.type}'). Verknüpfung verweigert.`);
    }

    // 3. In gaeb_import_angebote eintragen
    const stmt = db.prepare(`
        INSERT INTO gaeb_import_angebote (import_id, angebot_id, notes)
        VALUES (?, ?, ?)
    `);
    const res = stmt.run(importId, angebotId, notes ? String(notes) : null);

    return {
        success: true,
        id: res.lastInsertRowid,
        importId,
        angebotId,
        notes: notes ? String(notes) : null
    };
}

/**
 * Gibt alle mit einem GAEB-Import verknüpften Angebote mit Details zurück.
 * @param {Object} db - better-sqlite3 Instanz
 * @param {number} importId - ID aus gaeb_imports
 * @returns {Array<Object>} Verknüpfte Angebote mit { angebot_id, nr, version, status, datum, linked_at, notes }
 */
function getLinkedAngebote(db, importId) {
    if (!db) throw new Error('Datenbankverbindung erforderlich.');
    if (!importId) throw new Error('Import-ID fehlt.');

    const stmt = db.prepare(`
        SELECT 
            gia.angebot_id,
            d.nr,
            d.version,
            COALESCE(d.angebot_status, d.status) AS status,
            d.datum,
            gia.linked_at,
            gia.notes
        FROM gaeb_import_angebote gia
        JOIN dokumente d ON gia.angebot_id = d.id
        WHERE gia.import_id = ?
        ORDER BY gia.linked_at ASC, gia.id ASC
    `);
    return stmt.all(importId);
}

/**
 * Prüft, ob ein GAEB-Import mit mindestens einem Angebot verknüpft ist.
 * @param {Object} db - better-sqlite3 Instanz
 * @param {number} importId - ID aus gaeb_imports
 * @returns {boolean} true, wenn mindestens eine Verknüpfung in gaeb_import_angebote existiert
 */
function isImportLinked(db, importId) {
    if (!db || !importId) return false;
    const row = db.prepare('SELECT COUNT(*) AS cnt FROM gaeb_import_angebote WHERE import_id = ?').get(importId);
    return Boolean(row && row.cnt > 0);
}

/**
 * Gibt eine Übersicht aller importierten Ausschreibungen mit Statistiken zurück.
 * @param {Object} db - better-sqlite3 Instanz
 * @returns {Array<Object>} Liste von Import-Zusammenfassungen
 */
function listX83Imports(db) {
    if (!db) throw new Error('Datenbankverbindung erforderlich.');

    const stmt = db.prepare(`
        SELECT 
            i.id,
            i.file_name,
            i.gaeb_version,
            i.exchange_phase,
            i.project_name,
            i.currency,
            i.file_hash,
            i.file_size,
            (i.raw_bytes IS NOT NULL) AS has_original_bytes,
            i.imported_at,
            i.updated_at,
            COUNT(DISTINCT c.id) AS category_count,
            COUNT(DISTINCT it.id) AS item_count,
            COUNT(DISTINCT CASE WHEN it.linked_position_id IS NOT NULL THEN it.id END) AS linked_item_count,
            COUNT(DISTINCT gia.angebot_id) AS linked_angebot_count
        FROM gaeb_imports i
        LEFT JOIN gaeb_categories c ON c.import_id = i.id
        LEFT JOIN gaeb_items it ON it.import_id = i.id
        LEFT JOIN gaeb_import_angebote gia ON gia.import_id = i.id
        GROUP BY i.id
        ORDER BY i.imported_at DESC, i.id DESC
    `);
    return stmt.all();
}

/**
 * Löscht einen GAEB X83 Import atomar mit Verknüpfungsschutz.
 * @param {Object} db - better-sqlite3 Instanz
 * @param {number} importId - ID des zu löschenden Imports
 * @returns {Object} { success: true, deletedId }
 */
function deleteX83Import(db, importId) {
    if (!db) throw new Error('Datenbankverbindung erforderlich.');
    if (!importId) throw new Error('Import-ID fehlt.');

    // Verknüpfungsschutz: Prüfung gegen gaeb_import_angebote
    if (isImportLinked(db, importId)) {
        throw new Error('Löschen der GAEB-Ausschreibung verhindert: Dieser Import ist mit mindestens einem Angebot verknüpft.');
    }

    // Zusätzlicher Schutz für Legacy-Positionen
    const linked = db.prepare(`
        SELECT COUNT(*) AS cnt 
        FROM gaeb_items 
        WHERE import_id = ? AND linked_position_id IS NOT NULL
    `).get(importId);

    if (linked && linked.cnt > 0) {
        throw new Error(
            `Import ${importId} kann nicht gelöscht werden: ${linked.cnt} Position(en) sind mit aktiven Angeboten/Positionen verknüpft.`
        );
    }

    const delStmt = db.prepare('DELETE FROM gaeb_imports WHERE id = ?');
    const res = delStmt.run(importId);
    if (res.changes === 0) {
        throw new Error(`Import ${importId} wurde nicht gefunden.`);
    }

    return { success: true, deletedId: importId };
}

/**
 * Factory-Funktion zur Integration in das zentrale Repositories-Setup.
 * @param {Object} deps - Abhängigkeiten ({ db, appendAuditLog, dbAPI })
 */
function createGaebRepo(deps) {
    const { db } = deps;
    return {
        saveX83Import: (parsedData, options) => saveX83Import(db, parsedData, options),
        loadX83Import: (importId) => loadX83Import(db, importId),
        listX83Imports: () => listX83Imports(db),
        deleteX83Import: (importId) => deleteX83Import(db, importId),
        linkImportToAngebot: (importId, angebotId, notes) => linkImportToAngebot(db, importId, angebotId, notes),
        getLinkedAngebote: (importId) => getLinkedAngebote(db, importId),
        isImportLinked: (importId) => isImportLinked(db, importId),
        getImportOriginalBuffer: (importId) => getImportOriginalBuffer(db, importId)
    };
}

module.exports = {
    calculateFileHash,
    detectGaebVersion,
    saveX83Import,
    loadX83Import,
    listX83Imports,
    deleteX83Import,
    linkImportToAngebot,
    getLinkedAngebote,
    isImportLinked,
    getImportOriginalBuffer,
    createGaebRepo
};
