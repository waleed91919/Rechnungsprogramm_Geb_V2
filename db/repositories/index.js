/**
 * Central Repositories Index & Facade Assembler
 * W-Link ERP Modular Database Layer
 */
const createDocumentRepo = require('./document_repo');
const createKundenArtikelRepo = require('./kunden_artikel_repo');
const createAufmassRepo = require('./aufmass_repo');
const createControllingBautagebuchRepo = require('./controlling_bautagebuch_repo');
const createBankingRepo = require('./banking_repo');
const createEfbRepo = require('./efb_repo');
const createBackupRepo = require('./backup_repo');
const createKalkulationDatanormMaengelRepo = require('./kalkulation_datanorm_maengel_repo');
const createZeiterfassungRepo = require('./zeiterfassung_repo');
const createIdsConnectRepo = require('./ids_connect_repo');
const createSokabauSubcontractorRepo = require('./sokabau_subcontractor_repo');
const createSystemRepo = require('./system_repo');
const { createGaebRepo } = require('./gaeb_repository');
const { createGaebTenderRepo } = require('./gaeb_tender_repo');
const createWorkflowRepo = require('./workflow_repo');

function initRepositories(deps) {
    const { db, dbQuery, dbRun, appendAuditLog, auditLogger, backupService, dbPath } = deps;

    const dbAPI = {};

    const systemRepo = createSystemRepo({ db, dbQuery, dbRun, dbAPI });
    const getEinstellung = (key) => systemRepo.getEinstellung(key);

    const documentRepo = createDocumentRepo({
        db, dbQuery, dbRun, appendAuditLog, auditLogger, dbAPI
    });

    const kundenArtikelRepo = createKundenArtikelRepo({
        db, dbQuery, dbRun, appendAuditLog, dbAPI
    });

    const aufmassRepo = createAufmassRepo({
        db, dbQuery, dbRun, appendAuditLog, dbAPI
    });

    const controllingBautagebuchRepo = createControllingBautagebuchRepo({
        db, dbQuery, dbRun, appendAuditLog, auditLogger, getEinstellung, dbAPI
    });

    const bankingRepo = createBankingRepo({
        db, dbQuery, dbRun, appendAuditLog, getDocumentWithChildren: documentRepo.getDocumentWithChildren, dbAPI
    });

    const efbRepo = createEfbRepo({
        db, appendAuditLog, dbAPI
    });

    const backupRepo = createBackupRepo({
        db, dbPath, backupService, dbAPI
    });

    const kalkulationRepo = createKalkulationDatanormMaengelRepo({
        db, appendAuditLog, getEinstellung, dbAPI
    });

    const zeiterfassungRepo = createZeiterfassungRepo({
        db, appendAuditLog, auditLogger, dbAPI
    });

    const idsConnectRepo = createIdsConnectRepo({
        db, appendAuditLog, auditLogger, dbAPI
    });

    const sokabauRepo = createSokabauSubcontractorRepo({
        db, appendAuditLog, getEinstellung, dbAPI
    });

    const gaebRepo = createGaebRepo({
        db, appendAuditLog, dbAPI
    });

    const gaebTenderRepo = createGaebTenderRepo({
        db, appendAuditLog, dbAPI
    });

    // Vorgangs-Strang: Orchestrierung erst NACH kompletter Facade assemblieren
    // (nutzt dbAPI.saveDocument/getDocumentById/mergeSchlussaufmass/getNachtraege lazily)
    const workflowRepo = createWorkflowRepo({ db, dbQuery, dbRun, appendAuditLog, dbAPI });

    // Assemble the facade object with all repository methods
    Object.assign(
        dbAPI,
        // GoBD B-3: Atomares Belegladen & Full State
        { getDocumentById: documentRepo.getDocumentById },
        { getDokumente: documentRepo.getDokumente },
        workflowRepo,
        systemRepo,
        aufmassRepo,
        kundenArtikelRepo,
        documentRepo,
        controllingBautagebuchRepo,
        backupRepo,
        bankingRepo,
        efbRepo,
        kalkulationRepo,
        zeiterfassungRepo,
        idsConnectRepo,
        sokabauRepo,
        gaebRepo,
        gaebTenderRepo
    );

    return {
        dbAPI,
        repositories: {
            documentRepo,
            kundenArtikelRepo,
            aufmassRepo,
            controllingBautagebuchRepo,
            bankingRepo,
            efbRepo,
            backupRepo,
            kalkulationRepo,
            zeiterfassungRepo,
            idsConnectRepo,
            sokabauRepo,
            gaebRepo,
            gaebTenderRepo,
            systemRepo,
            workflowRepo
        }
    };
}

module.exports = {
    initRepositories,
    createDocumentRepo,
    createKundenArtikelRepo,
    createAufmassRepo,
    createControllingBautagebuchRepo,
    createBankingRepo,
    createEfbRepo,
    createBackupRepo,
    createKalkulationDatanormMaengelRepo,
    createZeiterfassungRepo,
    createIdsConnectRepo,
    createSokabauSubcontractorRepo,
    createGaebRepo,
    createSystemRepo
};
