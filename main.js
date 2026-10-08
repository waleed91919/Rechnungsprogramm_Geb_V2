const electron = require('electron');
const { app, BrowserWindow, Menu, ipcMain } = electron;
const path = require('path');
const { registerAllIpc } = require('./main/ipc');
const syncIpc = require('./main/ipc/ipc-sync');
const systemIpc = require('./main/ipc/ipc-system');
const { wrapHandler, focusWin, toPdfBuffer, printToPdfWithTimeout } = require('./main/ipc/ipc-util');

// Deutsches Lokalsystem erzwingen (DD.MM.YYYY und de-DE Chromium-Datumsformat/Kalender)
if (app && app.commandLine) {
    app.commandLine.appendSwitch('lang', 'de-DE');
    app.commandLine.appendSwitch('accept-languages', 'de-DE,de');
}

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        title: 'W-Link ERP',
        icon: path.join(__dirname, 'W-Link_ERP_software_202604132222.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            preload: path.join(__dirname, 'preload.js')
        },
        show: false
    });

    // SEC-3 Guard 1: Sämtliche unautorisierten Fenster-Öffnungen (window.open, target=_blank) blockieren
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        console.warn('[Security] Unerlaubter window.open Aufruf abgewiesen:', url);
        return { action: 'deny' };
    });

    // SEC-3 Guard 2: Ungewollte Navigation des Hauptfensters verhindern (Single-Page-Integrität)
    const { fileURLToPath } = require('url');
    mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
        try {
            const parsed = new URL(navigationUrl);
            if (parsed.protocol === 'file:') {
                const filePath = path.normalize(fileURLToPath(navigationUrl));
                const expectedPath = path.normalize(path.join(__dirname, 'code.html'));
                if (filePath === expectedPath) {
                    return;
                }
            }
        } catch (_) {}
        event.preventDefault();
        console.warn('[Security] will-navigate Navigation abgewiesen:', navigationUrl);
    });

    // SEC-3 Guard 3: Verhindern von Webview-Tags im Renderer
    mainWindow.webContents.on('will-attach-webview', (event) => {
        event.preventDefault();
        console.warn('[Security] will-attach-webview Aufruf unterbunden.');
    });

    // Deutsche Menüleiste
    const menuTemplate = [
        {
            label: 'Datei',
            submenu: [
                { label: 'Drucken', accelerator: 'CmdOrCtrl+P', click: () => mainWindow.webContents.print() },
                { type: 'separator' },
                { label: 'Beenden', accelerator: 'CmdOrCtrl+Q', role: 'quit' }
            ]
        },
        {
            label: 'Bearbeiten',
            submenu: [
                { label: 'Rückgängig', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
                { label: 'Wiederholen', accelerator: 'CmdOrCtrl+Y', role: 'redo' },
                { type: 'separator' },
                { label: 'Ausschneiden', accelerator: 'CmdOrCtrl+X', role: 'cut' },
                { label: 'Kopieren', accelerator: 'CmdOrCtrl+C', role: 'copy' },
                { label: 'Einfügen', accelerator: 'CmdOrCtrl+V', role: 'paste' },
                { label: 'Alles auswählen', accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
            ]
        },
        {
            label: 'Ansicht',
            submenu: [
                { label: 'Vergrößern', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
                { label: 'Verkleinern', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
                { label: 'Originalgröße', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
                { type: 'separator' },
                { label: 'Vollbild', accelerator: 'F11', role: 'togglefullscreen' },
                { type: 'separator' },
                { label: 'Entwicklertools', accelerator: 'F12', role: 'toggleDevTools' }
            ]
        },
        {
            label: 'Hilfe',
            submenu: [
                {
                    label: 'Über W-Link ERP', click: () => {
                        const { dialog } = require('electron');
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'Über W-Link ERP',
                            message: 'W-Link ERP v1.0.5',
                            detail: 'Professionelle ERP Rechnungsverwaltung\n© 2026 W-Link. Alle Rechte vorbehalten.'
                        });
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);

    mainWindow.loadFile(path.join(__dirname, 'code.html'));

    mainWindow.once('ready-to-show', () => {
        if (process.platform === 'win32') {
            mainWindow.setAlwaysOnTop(true);
            mainWindow.show();
            mainWindow.focus();
            mainWindow.setAlwaysOnTop(false);
        } else {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

// Set up IPC Handlers
function setupIpc() {
    const { db, dbAPI, appendAuditLog } = require('./db');

    // Kontext für modulare IPC-Handler
    const context = {
        db,
        dbAPI,
        appendAuditLog,
        wrapHandler,
        focusWin,
        toPdfBuffer,
        printToPdfWithTimeout,
        app,
        BrowserWindow
    };

    // Thematische Module registrieren
    registerAllIpc(ipcMain, context);

    // Starte automatischen Backup-Scheduler falls konfiguriert
    systemIpc.initAutoBackupScheduler(db, dbAPI);

    // Starte Sync-Server automatisch falls konfiguriert
    syncIpc.autoStartSyncServer(db);
}

// DB-3 Fix: Deterministischer Shutdown-Lifecycle mit event.preventDefault()
let isQuittingApp = false;
app.on('before-quit', async (event) => {
    if (isQuittingApp) return;

    // Beenden unterbrechen, um asynchrone Sicherungen sauber abzuschließen
    event.preventDefault();

    try {
        console.log('[App Shutdown] Bereite geordnetes Beenden vor...');
        await syncIpc.stopSyncServer();

        const { db, dbAPI } = require('./db');
        if (db && db.open) {
            const autoExitRow = db.prepare("SELECT value FROM einstellungen WHERE key='backup_auto_on_exit'").get();
            if (!autoExitRow || autoExitRow.value === 'true' || autoExitRow.value === '1') {
                console.log('[Auto-Backup] Erstelle Shutdown-Sicherung...');
                await dbAPI.createBackup('AUTO_SHUTDOWN', 'Automatisches Backup beim Beenden der Anwendung');
            }

            // WAL Checkpoint ausführen und DB vor Exit ordentlich schließen
            try {
                db.pragma('wal_checkpoint(TRUNCATE)');
                db.close();
                console.log('[App Shutdown] Datenbank handles ordentlich geschlossen.');
            } catch (closeErr) {
                console.warn('[App Shutdown] DB close warning:', closeErr.message);
            }
        }
    } catch (err) {
        console.error('[App Shutdown Fehler]:', err.message);
    } finally {
        isQuittingApp = true;
        app.quit(); // Nun regulär beenden
    }
});

app.whenReady().then(() => {
    setupIpc();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

module.exports = {
    setupIpc,
    createWindow
};
