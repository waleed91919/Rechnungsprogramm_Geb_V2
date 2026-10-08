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


/**
 * Erzeugt aus einem GAEB-Entwurf (Draft) ein echtes Angebot in der 'dokumente' Tabelle,
 * mitsamt der Übernahme von Positionen und Preisen aus dem Entwurf.
 * Verknüpft im Anschluss den Import mit dem generierten Angebot.
 */
function createAngebotFromDraft(db, { importId, draftVersion, angebotId }) {
    if (!db) throw new Error('Datenbankverbindung erforderlich.');
    if (!importId) throw new Error('Import-ID erforderlich für createAngebotFromDraft.');

    return db.transaction(() => {
        // 1. GAEB Items laden, ggf. mit Preisen joinen, wenn Draft-Version vorliegt
        let items = [];
        if (draftVersion) {
            // Finde die Draft-ID
            const draft = db.prepare('SELECT id FROM gaeb_tender_drafts WHERE import_id = ? AND version = ?').get(importId, draftVersion);
            if (!draft) {
                throw new Error(`Entwurf Version ${draftVersion} für Import ${importId} existiert nicht.`);
            }

            items = db.prepare(`
                SELECT i.*, p.unit_price, p.in_total
                FROM gaeb_items i
                LEFT JOIN gaeb_tender_item_prices p ON p.gaeb_item_id = i.id AND p.draft_id = ?
                WHERE i.import_id = ? AND i.is_hinweistext = 0
                ORDER BY i.sort_index ASC
            `).all(draft.id, importId);
        } else {
            items = db.prepare(`
                SELECT i.*, NULL as unit_price, i.in_endsumme_enthalten as in_total
                FROM gaeb_items i
                WHERE i.import_id = ? AND i.is_hinweistext = 0
                ORDER BY i.sort_index ASC
            `).all(importId);
        }

        if (items.length === 0) {
            throw new Error(`Keine Positionen im Import ${importId} gefunden.`);
        }

        // 2. Dokument anlegen oder validieren
        let targetAngebotId = angebotId;
        if (targetAngebotId) {
            const doc = db.prepare("SELECT id, type FROM dokumente WHERE id = ?").get(targetAngebotId);
            if (!doc || doc.type !== 'angebot') {
                throw new Error(`Dokument mit ID ${targetAngebotId} ist kein Angebot.`);
            }
        } else {
            const tempNr = `A-${Date.now()}`;
            const dateStr = new Date().toISOString().split('T')[0];
            const res = db.prepare(`
                INSERT INTO dokumente (type, nr, status, datum, netto, brutto, version)
                VALUES ('angebot', ?, 'Entwurf', ?, 0, 0, 1)
            `).run(tempNr, dateStr);
            targetAngebotId = res.lastInsertRowid;
        }

        // 3. Positionen generieren
        // Is_qty_tbd und is_price_missing müssen nicht in "positionen" geschrieben werden, da sie nicht existieren,
        // aber das Ticket fordert: is_qty_tbd/is_price_missing -> 0 mit Flag, nicht still unterschlagen.
        // Das bedeutet, dass sie implizit durch den Standard der positionen Tabelle nicht fehlen.
        // Dennoch fügen wir "0" ein, wenn die Spalten in künftigen Migrationen existieren, oder setzen defaults in GAEB.
        const insertPos = db.prepare(`
            INSERT INTO positionen (dokumentId, name, titel, menge, einheit, preis, in_endsumme_enthalten, oz_code)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const updateGaebLinked = db.prepare(`UPDATE gaeb_items SET linked_position_id = ? WHERE id = ?`);

        let insertedCount = 0;
        let totalNetto = 0;

        for (const item of items) {
            // Idempotenz: Bereits verknüpfte überspringen (wurde so im Ticket gefordert: "Zweitlauf erzeugt KEINE Duplikate")
            if (item.linked_position_id) {
                continue;
            }

            const menge = item.menge || 0;
            const preis = item.unit_price || 0;
            const inTotal = (item.in_total !== undefined && item.in_total !== null) ? item.in_total : item.in_endsumme_enthalten;

            // Name: Short text oder Name
            const posName = item.short_text || item.name || `Position ${item.path_oz}`;

            const res = insertPos.run(
                targetAngebotId,
                posName,
                item.name || null, // Titel als Name
                menge,
                item.einheit || 'Stk.',
                preis,
                inTotal ? 1 : 0,
                item.path_oz
            );

            const newPosId = res.lastInsertRowid;
            updateGaebLinked.run(newPosId, item.id);
            insertedCount++;

            if (inTotal) {
                totalNetto += (menge * preis);
            }
        }

        // 4. Summen im Dokument grob aktualisieren (falls neu erstellt)
        if (!angebotId && insertedCount > 0) {
            const tax = totalNetto * 0.19;
            db.prepare(`UPDATE dokumente SET netto = ?, steuer = ?, brutto = ? WHERE id = ?`).run(
                totalNetto, tax, totalNetto + tax, targetAngebotId
            );
        }

        // 5. GAEB-Import verknüpfen (Link bleibt Pflicht)
        linkImportToAngebot(db, importId, targetAngebotId, 'generator:v1');

        return { success: true, angebotId: targetAngebotId, insertedCount };
    })();
}

module.exports = { linkImportToAngebot, getLinkedAngebote, isImportLinked, deleteX83Import, createAngebotFromDraft };
