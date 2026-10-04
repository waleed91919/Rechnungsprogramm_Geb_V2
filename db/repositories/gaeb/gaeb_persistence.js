
const crypto = require('crypto');
const { detectGaebVersion } = require('./gaeb_utils');
const { isImportLinked } = require('./gaeb_linking');

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
  const providedBuffer = Buffer.isBuffer(options.rawBytes) ? options.rawBytes : Buffer.isBuffer(options.buffer) ? options.buffer : Buffer.isBuffer(options.rawContent) ? options.rawContent : null;
  const providedXml = typeof options.rawXml === 'string' ? options.rawXml : typeof options.xmlString === 'string' ? options.xmlString : typeof options.rawContent === 'string' ? options.rawContent : null;
  if (providedBuffer && providedXml !== null) {
    const textFromBuf = providedBuffer.toString('utf-8');
    const textFromBufNoBom = textFromBuf.replace(/^\uFEFF/, '');
    const textFromXmlNoBom = providedXml.replace(/^\uFEFF/, '');
    if (textFromBufNoBom !== textFromXmlNoBom) {
      throw new Error('Konsistenzfehler: rawBytes und rawXml stimmen inhaltlich nicht überein.');
    }
  }
  if (rawBuffer) {
    // Garantierter Original-Byte-Pfad
    rawBytes = rawBuffer;
    fileHash = crypto.createHash('sha256').update(rawBuffer).digest('hex');
    fileSize = rawBuffer.length;
    rawXml = typeof options.rawXml === 'string' && options.rawXml.length > 0 ? options.rawXml : typeof parsedData.rawXml === 'string' && parsedData.rawXml.length > 0 ? parsedData.rawXml : rawBuffer.toString('utf8');
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
      throw new Error(`Import kann nicht überschrieben werden: Der bestehende Import (ID: ${existing.id}) ` + `ist bereits mit mindestens einem Angebot verknüpft.`);
    }
    if (linkedItems && linkedItems.cnt > 0) {
      throw new Error(`Import kann nicht überschrieben werden: ${linkedItems.cnt} Position(en) des bestehenden Imports (ID: ${existing.id}) ` + `sind bereits mit aktiven Angeboten/Positionen verknüpft.`);
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
    const importRes = insertImportStmt.run(fileName, gaebVersion, exchangePhase, parsedData.projectInfo?.name || null, parsedData.projectInfo?.id || parsedData.projectInfo?.projectId || null, parsedData.projectInfo?.currency || 'EUR', fileHash, fileSize, rawBytes, rawXml || null);
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
      const res = insertCategoryStmt.run(importId, parentSqlId, level, sortIndex, cat.lblCtgy || cat.rno_part || null, cat.rno_part || null, cat.oz_prefix || null, cat.name || null, desc, JSON.stringify(meta));
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
      const shortText = pos.kurztext || pos.name ? String(pos.kurztext || pos.name) : '';
      const longText = pos.langtext || pos.detailTxt || pos.completeText || pos.description ? String(pos.langtext || pos.detailTxt || pos.completeText || pos.description) : null;
      const menge = pos.menge !== undefined && pos.menge !== null && !isNaN(Number(pos.menge)) ? Number(pos.menge) : null;
      const isQtyTbd = pos.isQtyTBD ? 1 : 0;
      const einheit = pos.einheit ? String(pos.einheit) : null;
      const preis = pos.preis !== undefined && pos.preis !== null && !isNaN(Number(pos.preis)) ? Number(pos.preis) : null;
      const gesamtpreis = pos.gesamtpreis !== undefined && pos.gesamtpreis !== null && !isNaN(Number(pos.gesamtpreis)) ? Number(pos.gesamtpreis) : null;
      const isPriceMissing = pos.isPriceMissing !== false && preis === null ? 1 : 0;
      const inEndsumme = pos.in_endsumme_enthalten === 0 || pos.in_endsumme_enthalten === false ? 0 : 1;
      const alnGroupNo = pos.aln_group_no || pos.alnGroup ? String(pos.aln_group_no || pos.alnGroup) : null;
      const alnSerNo = pos.aln_ser_no || pos.alnSerNo ? String(pos.aln_ser_no || pos.alnSerNo) : null;
      const provis = pos.provis !== undefined && pos.provis !== null ? String(pos.provis) : null;
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
      const itemRes = insertItemStmt.run(importId, catSqlId !== undefined && catSqlId !== null ? catSqlId : null, itemIdx, pathOz, rnoPart, itemType, shortText, longText, menge, isQtyTbd, einheit, preis, gesamtpreis, isPriceMissing, inEndsumme, alnGroupNo, alnSerNo, provis, isHinweistext, null,
      // linked_position_id
      JSON.stringify(rawMeta));
      const itemSqlId = itemRes.lastInsertRowid;

      // BiReq einfügen
      const biReqs = pos.biReq || pos.bieterangaben;
      if (Array.isArray(biReqs)) {
        biReqs.forEach((br, brIdx) => {
          insertBiReqStmt.run(itemSqlId, brIdx, br.type || br.bireq_type ? String(br.type || br.bireq_type) : null, br.label ? String(br.label) : null, br.description || br.text ? String(br.description || br.text) : null, br.value ? String(br.value) : null);
        });
      }

      // UPComponents einfügen
      const up = pos.upComponents || null;
      const hasUpValues = up !== null || pos.lohn !== undefined || pos.stoff !== undefined || pos.gerat !== undefined || pos.sonstiges !== undefined;
      if (hasUpValues) {
        const lohn = pos.lohn !== undefined && pos.lohn !== null && !isNaN(Number(pos.lohn)) ? Number(pos.lohn) : up && up.lohn !== undefined && up.lohn !== null && !isNaN(Number(up.lohn)) ? Number(up.lohn) : null;
        const stoff = pos.stoff !== undefined && pos.stoff !== null && !isNaN(Number(pos.stoff)) ? Number(pos.stoff) : up && up.stoff !== undefined && up.stoff !== null && !isNaN(Number(up.stoff)) ? Number(up.stoff) : null;
        const rawGer = pos.gerat !== undefined ? pos.gerat : pos.geraet !== undefined ? pos.geraet : up ? up.geraet !== undefined ? up.geraet : up.gerat : null;
        const geraet = rawGer !== undefined && rawGer !== null && !isNaN(Number(rawGer)) ? Number(rawGer) : null;
        const sonstiges = pos.sonstiges !== undefined && pos.sonstiges !== null && !isNaN(Number(pos.sonstiges)) ? Number(pos.sonstiges) : up && up.sonstiges !== undefined && up.sonstiges !== null && !isNaN(Number(up.sonstiges)) ? Number(up.sonstiges) : null;
        const total = up && up.total !== undefined && up.total !== null && !isNaN(Number(up.total)) ? Number(up.total) : preis !== null ? Number(preis) : null;
        insertUpCompStmt.run(itemSqlId, lohn, stoff, geraet, sonstiges, total);
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

module.exports = { saveX83Import };
