/**
 * ipc-workflow.js — Vorgangs-Strang (End-to-End State), typisierte Kanäle.
 * Kein direkter DB-Zugriff im Renderer: alles läuft über dbAPI/workflow_repo
 * (validiert, GoBD-/J1-Guards bleiben aktiv).
 */
const { wrapHandler: defaultWrapHandler } = require('./ipc-util');

function register(ipcMain, context = {}) {
    const dbAPI = context.dbAPI || require('../../db').dbAPI;
    const wrapHandler = context.wrapHandler || defaultWrapHandler;

    const needId = (v, name) => {
        const n = Number(v);
        if (!Number.isInteger(n) || n <= 0) throw new Error(`Ungültige ${name}.`);
        return n;
    };

    // --- Vorgänger → Rechnung (speichernd, mit Herkunft, ohne Abtippen) ---
    ipcMain.handle('workflow:createRechnungFromAngebot', wrapHandler(async (e, angebotId, opts = {}) => {
        const src = await dbAPI.getDocumentById(needId(angebotId, 'Angebot-ID'));
        if (!src || src.type !== 'angebot') throw new Error(`Beleg #${angebotId} ist kein Angebot.`);
        return await dbAPI.createRechnungFromVorgaenger(src.id, opts);
    }));

    ipcMain.handle('workflow:createRechnungFromAuftrag', wrapHandler(async (e, auftragId, opts = {}) => {
        const src = await dbAPI.getDocumentById(needId(auftragId, 'Auftrag-ID'));
        if (!src || src.type !== 'auftrag') throw new Error(`Beleg #${auftragId} ist keine Auftragsbestätigung.`);
        return await dbAPI.createRechnungFromVorgaenger(src.id, opts);
    }));

    // --- Aufmaß → Abschlag / Schlussrechnung ---
    ipcMain.handle('workflow:createAbschlagFromAufmass', wrapHandler(async (e, projectId, opts = {}) => {
        return await dbAPI.createAbschlagFromAufmass(needId(projectId, 'Projekt-ID'), opts || {});
    }));

    ipcMain.handle('workflow:createSchlussrechnung', wrapHandler(async (e, projectId, opts = {}) => {
        return await dbAPI.createSchlussrechnung(needId(projectId, 'Projekt-ID'), opts || {});
    }));

    // --- Aufmaßblatt-Freigabe (DRAFT/SUBMITTED → VERIFIED) ---
    ipcMain.handle('workflow:verifyAufmassBlatt', wrapHandler(async (e, blattId) => {
        return await dbAPI.verifyAufmassBlatt(needId(blattId, 'Aufmaßblatt-ID'));
    }));

    // --- Sicherheitseinbehalt (VOB/B § 17): lesen + freigeben ---
    ipcMain.handle('workflow:getSecurityRetentions', wrapHandler(async (e, projectId) => {
        return await dbAPI.getSecurityRetentions(needId(projectId, 'Projekt-ID'));
    }));

    ipcMain.handle('workflow:releaseSecurityRetention', wrapHandler(async (e, retentionId, opts = {}) => {
        return await dbAPI.releaseSecurityRetention(needId(retentionId, 'Einbehalt-ID'), opts || {});
    }));

    // --- Ein Strang lesbar ---
    ipcMain.handle('workflow:getVorgangskette', wrapHandler(async (e, projectId) => {
        return await dbAPI.getVorgangskette(needId(projectId, 'Projekt-ID'));
    }));
}

module.exports = {
    register,
    registerIpc: register
};
