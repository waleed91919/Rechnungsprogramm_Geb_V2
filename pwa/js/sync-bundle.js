/**
 * pwa/js/sync-bundle.js - Notfall-USB-Sync-Bundle (.wlsync) Modul
 * Erstellt und entpackt AES-GCM-256 verschlüsselte Baustellen-Sync-Pakete.
 */

const CryptoSyncBundle = (typeof require !== 'undefined')
    ? require('./crypto-sync-bundle')
    : (window.CryptoSyncBundle || null);

async function createSyncBundle(password, db = null) {
    const targetDb = db || (typeof window !== 'undefined' ? window.mobileDb : null);
    return CryptoSyncBundle.exportToBundle(targetDb, password);
}

async function unpackSyncBundle(bundleData, password) {
    return CryptoSyncBundle.importFromBundle(bundleData, password);
}

function downloadSyncBundleFile(bundleJson, filename) {
    CryptoSyncBundle.downloadBundle(bundleJson, filename);
}

async function readSyncBundleFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error('Fehler beim Lesen der Sync-Bundle-Datei'));
        reader.readAsText(file);
    });
}

if (typeof window !== 'undefined') {
    window.createSyncBundle = createSyncBundle;
    window.unpackSyncBundle = unpackSyncBundle;
    window.downloadSyncBundleFile = downloadSyncBundleFile;
    window.readSyncBundleFile = readSyncBundleFile;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CryptoSyncBundle,
        createSyncBundle,
        unpackSyncBundle,
        downloadSyncBundleFile,
        readSyncBundleFile
    };
}
