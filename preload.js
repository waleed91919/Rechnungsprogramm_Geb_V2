const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    getFullState: () => ipcRenderer.invoke('db:getFullState'),

    saveArtikel: (artikel) => ipcRenderer.invoke('db:saveArtikel', artikel),
    deleteArtikel: (id) => ipcRenderer.invoke('db:deleteArtikel', id),

    saveKunde: (kunde) => ipcRenderer.invoke('db:saveKunde', kunde),
    deleteKunde: (id) => ipcRenderer.invoke('db:deleteKunde', id),
    bulkSaveKunden: (kunden) => ipcRenderer.invoke('db:bulkSaveKunden', kunden),

        saveDocument: (doc) => ipcRenderer.invoke('db:saveDocument', doc),
    bulkSaveDocuments: (docs) => ipcRenderer.invoke('db:bulkSaveDocuments', docs),
    deleteDocument: (id) => ipcRenderer.invoke('db:deleteDocument', id),

    saveProjekt: (projekt) => ipcRenderer.invoke('db:saveProjekt', projekt),

    saveEinstellung: (key, value) => ipcRenderer.invoke('db:saveEinstellung', key, value),

    backupDatabase: () => ipcRenderer.invoke('db:backup'),
    restoreDatabase: () => ipcRenderer.invoke('db:restore'),

    savePdf: (buffer, defaultName) => ipcRenderer.invoke('save:pdf', buffer, defaultName),

    generateQrCode: (text) => ipcRenderer.invoke('qr:generate', text),

    focusWindow: () => ipcRenderer.invoke('app:focusWindow'),
    confirm: (options) => ipcRenderer.invoke('dialog:confirm', options),
    alert: (options) => ipcRenderer.invoke('dialog:alert', options)
});
