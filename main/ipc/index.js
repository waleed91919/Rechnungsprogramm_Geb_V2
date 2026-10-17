const core = require('./ipc-core');
const aufmass = require('./ipc-aufmass');
const efb = require('./ipc-efb');
const nachtragBau = require('./ipc-nachtrag-bau');
const banking = require('./ipc-banking');
const kalkulation = require('./ipc-kalkulation');
const zeiterfassung = require('./ipc-zeiterfassung');
const compliance = require('./ipc-compliance');
const system = require('./ipc-system');
const gaeb = require('./ipc-gaeb');
const workflow = require('./ipc-workflow');

function registerAllIpc(ipcMain, context = {}) {
    core.register(ipcMain, context);
    aufmass.register(ipcMain, context);
    efb.register(ipcMain, context);
    nachtragBau.register(ipcMain, context);
    banking.register(ipcMain, context);
    kalkulation.register(ipcMain, context);
    zeiterfassung.register(ipcMain, context);
    compliance.register(ipcMain, context);
    system.register(ipcMain, context);
    gaeb.register(ipcMain, context);
    workflow.register(ipcMain, context);
}

module.exports = {
    registerAllIpc,
    core,
    aufmass,
    efb,
    nachtragBau,
    banking,
    kalkulation,
    zeiterfassung,
    compliance,
    system,
    gaeb,
    workflow
};
