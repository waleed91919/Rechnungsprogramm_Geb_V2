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
    throw new Error(`Import ${importId} kann nicht gelöscht werden: ${linked.cnt} Position(en) sind mit aktiven Angeboten/Positionen verknüpft.`);
  }
  const delStmt = db.prepare('DELETE FROM gaeb_imports WHERE id = ?');
  const res = delStmt.run(importId);
  if (res.changes === 0) {
    throw new Error(`Import ${importId} wurde nicht gefunden.`);
  }
  return {
    success: true,
    deletedId: importId
  };
}

/**
 * Factory-Funktion zur Integration in das zentrale Repositories-Setup.
 * @param {Object} deps - Abhängigkeiten ({ db, appendAuditLog, dbAPI })
 */

module.exports = { linkImportToAngebot, getLinkedAngebote, isImportLinked, deleteX83Import };
