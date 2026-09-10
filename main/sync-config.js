'use strict';

const SETTING_KEYS = {
    host: 'sync_server_host',
    port: 'sync_server_port',
    useTls: 'sync_tls_enabled',
    sslCertPath: 'sync_tls_cert_path',
    sslKeyPath: 'sync_tls_key_path',
    autoStart: 'sync_server_auto_start'
};

function validateSyncConfig(input = {}) {
    const config = {
        host: input.host || '127.0.0.1',
        port: Number(input.port ?? 38400),
        useTls: input.useTls === true || input.useTls === 'true',
        sslCertPath: String(input.sslCertPath || '').trim(),
        sslKeyPath: String(input.sslKeyPath || '').trim(),
        autoStart: input.autoStart === true || input.autoStart === 'true'
    };
    if (!['127.0.0.1', '0.0.0.0'].includes(config.host)) {
        throw new Error('Sync-Bindung muss 127.0.0.1 (lokal) oder 0.0.0.0 (LAN) sein.');
    }
    if (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65535) {
        throw new Error('Sync-Port muss zwischen 1024 und 65535 liegen.');
    }
    if (config.host !== '127.0.0.1' && !config.useTls) {
        throw new Error('Netzwerk-Sync benötigt HTTPS. Bitte TLS aktivieren und Zertifikat eintragen.');
    }
    if (config.useTls && (!config.sslCertPath || !config.sslKeyPath)) {
        throw new Error('Für HTTPS werden ein Zertifikat und ein privater Schlüssel (PEM-Dateien) benötigt.');
    }
    return config;
}

function loadSyncConfig(db) {
    const input = {};
    const get = db.prepare('SELECT value FROM einstellungen WHERE key = ?');
    for (const [name, key] of Object.entries(SETTING_KEYS)) {
        const row = get.get(key);
        if (row) input[name] = row.value;
    }
    return validateSyncConfig(input);
}

function saveSyncConfig(db, input) {
    const config = validateSyncConfig(input);
    db.transaction(() => {
        const save = db.prepare('INSERT OR REPLACE INTO einstellungen (key, value) VALUES (?, ?)');
        for (const [name, key] of Object.entries(SETTING_KEYS)) {
            save.run(key, String(config[name]));
        }
    })();
    return config;
}

module.exports = { validateSyncConfig, loadSyncConfig, saveSyncConfig };
