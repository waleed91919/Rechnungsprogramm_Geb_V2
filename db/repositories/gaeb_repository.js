/**
 * db/repositories/gaeb_repository.js
 * Facade for GAEB repository modules.
 */

const { calculateFileHash, detectGaebVersion } = require('./gaeb/gaeb_utils');
const { saveX83Import } = require('./gaeb/gaeb_persistence');
const { loadX83Import, listX83Imports, getImportOriginalBuffer } = require('./gaeb/gaeb_loader');
const { linkImportToAngebot, getLinkedAngebote, isImportLinked, deleteX83Import } = require('./gaeb/gaeb_linking');

/**
 * Factory-Funktion zur Integration in das zentrale Repositories-Setup.
 * @param {Object} deps - Abhängigkeiten ({ db, appendAuditLog, dbAPI })
 */
function createGaebRepo(deps) {
  const {
    db
  } = deps;
  return {
    saveX83Import: (parsedData, options) => saveX83Import(db, parsedData, options),
    loadX83Import: importId => loadX83Import(db, importId),
    listX83Imports: () => listX83Imports(db),
    deleteX83Import: importId => deleteX83Import(db, importId),
    linkImportToAngebot: (importId, angebotId, notes) => linkImportToAngebot(db, importId, angebotId, notes),
    getLinkedAngebote: importId => getLinkedAngebote(db, importId),
    isImportLinked: importId => isImportLinked(db, importId),
    getImportOriginalBuffer: importId => getImportOriginalBuffer(db, importId)
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
