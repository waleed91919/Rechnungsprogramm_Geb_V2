(function(global) {
global.handleGAEBFileUpload = handleGAEBFileUpload;
global.renderGAEBPositionsTable = renderGAEBPositionsTable;
global.exportProjektDA11 = exportProjektDA11;
global.exportProjektGAEBX31 = exportProjektGAEBX31;
global.importProjektGAEBX31 = importProjektGAEBX31;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        handleGAEBFileUpload,
        renderGAEBPositionsTable,
        exportProjektDA11,
        exportProjektGAEBX31,
        importProjektGAEBX31
    };
}
})(typeof window !== 'undefined' ? window : this);
