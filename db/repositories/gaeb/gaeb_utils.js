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

module.exports = { calculateFileHash, detectGaebVersion };
