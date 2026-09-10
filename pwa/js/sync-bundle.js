/**
 * pwa/js/sync-bundle.js - Notfall-USB-Sync-Bundle (.wlsync) Modul
 * Erstellt und entpackt AES-GCM-256 verschlüsselte Baustellen-Sync-Pakete.
 */

// Distinct binding: crypto-sync-bundle.js already declares a global class with
// the name CryptoSyncBundle when both files are loaded as classic scripts.
const SyncBundleCrypto = (typeof require !== 'undefined')
    ? require('./crypto-sync-bundle')
    : (window.CryptoSyncBundle || null);

async function createSyncBundle(password, db = null) {
    const targetDb = db || (typeof window !== 'undefined' ? window.mobileDb : null);
    return SyncBundleCrypto.exportToBundle(targetDb, password);
}

async function unpackSyncBundle(bundleData, password) {
    return SyncBundleCrypto.importFromBundle(bundleData, password);
}

function downloadSyncBundleFile(bundleJson, filename) {
    SyncBundleCrypto.downloadBundle(bundleJson, filename);
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
        CryptoSyncBundle: SyncBundleCrypto,
        createSyncBundle,
        unpackSyncBundle,
        downloadSyncBundleFile,
        readSyncBundleFile
    };
}
