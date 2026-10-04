
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
      parentId: row.parent_id ? categoryRows.find(c => c.id === row.parent_id)?.raw_metadata_json ? JSON.parse(categoryRows.find(c => c.id === row.parent_id).raw_metadata_json).originalId : `ctg_${row.parent_id}` : null,
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
      itemType: row.item_type === 'NORMAL' ? 'Normal' : row.item_type === 'HINWEISTEXT' ? 'Hinweistext' : row.item_type,
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
            COUNT(DISTINCT gia.angebot_id) AS linked_angebot_count,
            COUNT(DISTINCT d.id) AS draft_count
        FROM gaeb_imports i
        LEFT JOIN gaeb_categories c ON c.import_id = i.id
        LEFT JOIN gaeb_items it ON it.import_id = i.id
        LEFT JOIN gaeb_import_angebote gia ON gia.import_id = i.id
        LEFT JOIN gaeb_tender_drafts d ON d.import_id = i.id
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

module.exports = { loadX83Import, listX83Imports, getImportOriginalBuffer };
