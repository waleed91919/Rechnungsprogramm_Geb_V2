/**
 * pwa/js/crypto-sync-bundle.js - Verschlüsselter Notfall-USB-Sync via Web Crypto API
 * Verwendet PBKDF2 (100.000 Iterationen) und AES-GCM-256 für militärische Abhörsicherheit.
 * Isomorph für Node.js (v18+) und moderne Browser.
 */

function getCryptoSubtle() {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
        return { subtle: window.crypto.subtle, getRandomValues: (arr) => window.crypto.getRandomValues(arr) };
    }
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
        return { subtle: globalThis.crypto.subtle, getRandomValues: (arr) => globalThis.crypto.getRandomValues(arr) };
    }
    try {
        const nodeCrypto = require('crypto');
        const subtle = nodeCrypto.webcrypto ? nodeCrypto.webcrypto.subtle : nodeCrypto.subtle;
        return {
            subtle,
            getRandomValues: (arr) => (nodeCrypto.webcrypto ? nodeCrypto.webcrypto.getRandomValues(arr) : nodeCrypto.randomFillSync(arr))
        };
    } catch (_e) {
        throw new Error('Keine kryptografische WebCrypto-Engine verfügbar.');
    }
}

class CryptoSyncBundle {
    /**
     * Exportiert alle anstehenden Outbox-Daten und Fotos in ein .wlsync Bundle.
     * @param {Object} db - Dexie DB Instanz oder Mock
     * @param {string} passphrase - Baustellen-Passwort oder PIN
     * @returns {Promise<string>} JSON-codiertes .wlsync Bundle
     */
    static async exportToBundle(db, passphrase) {
        if (!passphrase || passphrase.length < 4) {
            throw new Error('Das Baustellen-Passwort muss mindestens 4 Zeichen lang sein.');
        }

        const cryptoApi = getCryptoSubtle();

        // 1. Alle ungesendeten Mutationen sammeln
        let pendingMutations = [];
        if (db && db.sync_outbox) {
            if (typeof db.sync_outbox.where === 'function') {
                pendingMutations = await db.sync_outbox
                    .where('status')
                    .equals('PENDING')
                    .toArray();
            } else if (typeof db.sync_outbox.toArray === 'function') {
                const all = await db.sync_outbox.toArray();
                pendingMutations = all.filter(m => m.status === 'PENDING');
            }
        }

        // 2. Unsynchronisierte Fotos sammeln
        let unsyncedPhotos = [];
        if (db && db.local_fotos) {
            if (typeof db.local_fotos.where === 'function') {
                unsyncedPhotos = await db.local_fotos
                    .where('is_synced')
                    .equals(0)
                    .toArray();
            } else if (typeof db.local_fotos.toArray === 'function') {
                const all = await db.local_fotos.toArray();
                unsyncedPhotos = all.filter(f => f.is_synced === 0);
            }
        }

        let deviceId = 'MOBILE-OFFLINE';
        if (db && db.app_settings && typeof db.app_settings.get === 'function') {
            const deviceSettings = await db.app_settings.get('server_config');
            if (deviceSettings && deviceSettings.device_id) {
                deviceId = deviceSettings.device_id;
            }
        }

        const payloadObj = {
            export_meta: {
                deviceId,
                exported_at: new Date().toISOString(),
                mutation_count: pendingMutations.length,
                photo_count: unsyncedPhotos.length
            },
            mutations: pendingMutations,
            photos: unsyncedPhotos
        };

        const payloadJson = JSON.stringify(payloadObj);
        const enc = new TextEncoder();
        const payloadBytes = enc.encode(payloadJson);

        // 3. Salt & IV generieren
        const salt = cryptoApi.getRandomValues(new Uint8Array(16));
        const iv = cryptoApi.getRandomValues(new Uint8Array(12)); // 96-Bit IV für AES-GCM

        // 4. PBKDF2 Key Derivation
        const keyMaterial = await cryptoApi.subtle.importKey(
            'raw',
            enc.encode(passphrase),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );

        const aesKey = await cryptoApi.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );

        // 5. AES-GCM Verschlüsselung
        const ciphertextBuffer = await cryptoApi.subtle.encrypt(
            { name: 'AES-GCM', iv },
            aesKey,
            payloadBytes
        );

        const ciphertextHex = Array.from(new Uint8Array(ciphertextBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        // 6. SHA-256 Prüfsumme über Ciphertext berechnen
        const hashBuffer = await cryptoApi.subtle.digest('SHA-256', new Uint8Array(ciphertextBuffer));
        const hashHex = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        const bundle = {
            magic: 'WLSYNC01',
            version: '1.0',
            device_id: deviceId,
            exported_at: new Date().toISOString(),
            kdf: {
                algorithm: 'PBKDF2',
                hash: 'SHA-256',
                iterations: 100000,
                salt_hex: Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('')
            },
            cipher: {
                algorithm: 'AES-GCM',
                iv_hex: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''),
                tag_length_bits: 128
            },
            payload_cipher_hex: ciphertextHex,
            sha256_checksum: hashHex
        };

        return JSON.stringify(bundle, null, 2);
    }

    /**
     * Entschlüsselt ein .wlsync Bundle (Node.js & Browser kompatibel).
     * @param {string|Object} bundleJson 
     * @param {string} passphrase 
     * @returns {Promise<Object>} Entschlüsselter Payload { export_meta, mutations, photos }
     */
    static async importFromBundle(bundleJson, passphrase) {
        const bundle = typeof bundleJson === 'string' ? JSON.parse(bundleJson) : bundleJson;
        if (!bundle || bundle.magic !== 'WLSYNC01') {
            throw new Error('Ungültiges Dateiformat: Kein valides W-Link Sync-Bundle.');
        }

        const cryptoApi = getCryptoSubtle();

        // 1. Prüfsumme verifizieren
        const matches = bundle.payload_cipher_hex.match(/.{1,2}/g);
        if (!matches) {
            throw new Error('Ungültiger Payload-Hex-String.');
        }
        const cipherBytes = new Uint8Array(matches.map(byte => parseInt(byte, 16)));

        const hashBuffer = await cryptoApi.subtle.digest('SHA-256', cipherBytes);
        const computedHash = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        if (computedHash !== bundle.sha256_checksum) {
            throw new Error('Manipulationsverdacht: SHA-256 Prüfsumme stimmt nicht überein!');
        }

        // 2. Schlüssel ableiten
        const saltMatches = bundle.kdf.salt_hex.match(/.{1,2}/g) || [];
        const ivMatches = bundle.cipher.iv_hex.match(/.{1,2}/g) || [];
        const salt = new Uint8Array(saltMatches.map(b => parseInt(b, 16)));
        const iv = new Uint8Array(ivMatches.map(b => parseInt(b, 16)));
        const enc = new TextEncoder();

        const keyMaterial = await cryptoApi.subtle.importKey(
            'raw',
            enc.encode(passphrase),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );

        const aesKey = await cryptoApi.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt,
                iterations: bundle.kdf.iterations,
                hash: bundle.kdf.hash
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );

        // 3. Entschlüsseln
        const decryptedBuffer = await cryptoApi.subtle.decrypt(
            { name: 'AES-GCM', iv },
            aesKey,
            cipherBytes
        );

        const dec = new TextDecoder();
        return JSON.parse(dec.decode(decryptedBuffer));
    }

    /**
     * Bequemer Alias für exportToBundle
     */
    static async createSyncBundle(dbOrPassword, passwordIfDb) {
        if (typeof dbOrPassword === 'string' && !passwordIfDb) {
            // Aufruf mit nur Passwort, db aus window.mobileDb beziehen
            const db = (typeof window !== 'undefined') ? window.mobileDb : null;
            return CryptoSyncBundle.exportToBundle(db, dbOrPassword);
        }
        return CryptoSyncBundle.exportToBundle(dbOrPassword, passwordIfDb);
    }

    /**
     * Bequemer Alias für importFromBundle
     */
    static async unpackSyncBundle(bundleData, password) {
        return CryptoSyncBundle.importFromBundle(bundleData, password);
    }

    /**
     * Triggert einen Browser-Dateidownload für die .wlsync Datei
     */
    static downloadBundle(bundleJson, filename) {
        if (typeof document === 'undefined') return;
        const fname = filename || `wlink_sync_${new Date().toISOString().replace(/[:.]/g, '-')}.wlsync`;
        const blob = new Blob([bundleJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

if (typeof window !== 'undefined') {
    window.CryptoSyncBundle = CryptoSyncBundle;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CryptoSyncBundle;
}
