const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const Worker = require('../pwa/js/sync-worker');
const SyncView = require('../views/SyncView');
const { validateSyncConfig, loadSyncConfig, saveSyncConfig } = require('../main/sync-config');

function store(rows = [], key = 'uuid') {
    const data = new Map(rows.map(row => [row[key], row]));
    return {
        data,
        get: async id => data.get(id),
        put: async row => data.set(row[key], { ...row }),
        bulkPut: async rows => rows.forEach(row => data.set(row[key], { ...row })),
        bulkDelete: async ids => ids.forEach(id => data.delete(id)),
        clear: async () => data.clear(),
        where(field) {
            let value, max = Infinity;
            return {
                equals(input) { value = input; return this; },
                limit(n) { max = n; return this; },
                async toArray() { return [...data.values()].filter(row => row[field] === value).slice(0, max); }
            };
        }
    };
}

function fixture() {
    const config = {
        key: 'server_config', server_url: 'https://hub.example',
        device_id: 'MOBILE_test', access_token: 'a'.repeat(64),
        expires_at: new Date(Date.now() + 3600000).toISOString()
    };
    const db = {
        app_settings: store([config], 'key'),
        sync_outbox: store([{ uuid: 'pending1', status: 'PENDING' }]),
        local_fotos: store([{ uuid: 'photo1', is_synced: 0, blob: new Blob(['photo']) }]),
        cache_mitarbeiter: store([{ id: 9, tarif_stundensatz: 100 }], 'id'),
        cache_projekte: store([], 'id')
    };
    return { config, db, worker: new Worker(db) };
}

function stubFetch(t, callback) {
    const old = global.fetch;
    global.fetch = callback;
    t.after(() => { global.fetch = old; });
}

const ok = data => ({ ok: true, status: 200, json: async () => data });

test('Client erlaubt HTTPS und nur lokales HTTP, keine URL-Credentials/Pfade', () => {
    assert.equal(Worker.normalizeServerUrl('https://hub.example/'), 'https://hub.example');
    assert.equal(Worker.normalizeServerUrl('http://127.0.0.1:38400'), 'http://127.0.0.1:38400');
    for (const url of ['http://192.168.1.1', 'http://localhost.evil', 'https://u:p@hub.example',
        'https://hub.example/path', 'https://hub.example?token=x', 'https://hub.example#secret', 'file:///tmp']) {
        assert.throws(() => Worker.normalizeServerUrl(url));
    }
});

test('Legacy-Konfiguration und abgelaufene Sitzung lösen keinen Netzwerkzugriff aus', async t => {
    stubFetch(t, () => { throw new Error('darf nicht aufgerufen werden'); });
    for (const config of [
        { key: 'server_config', server_url: 'https://hub.example' },
        { key: 'server_config', server_url: 'https://hub.example', access_token: 'x', device_id: 'd', expires_at: '2020-01-01' }
    ]) {
        const { db, worker } = fixture();
        await db.app_settings.put(config);
        assert.equal((await worker.runFullSync()).status, 'UNPAIRED');
        assert.equal(db.sync_outbox.data.size, 1);
        assert.equal(db.local_fotos.data.size, 1);
    }
});

test('Push, Foto und Pull tragen Auth-Header; alter Lohncache wird entfernt', async t => {
    const { worker, db, config } = fixture();
    const routes = [];
    stubFetch(t, async (url, options) => {
        assert.equal(options.headers.Authorization, `Bearer ${config.access_token}`);
        assert.equal(options.headers['X-Device-Id'], config.device_id);
        assert.equal(options.redirect, 'error');
        assert.equal(options.credentials, 'omit');
        assert.equal(options.cache, 'no-store');
        const route = url.split('/').pop();
        routes.push(route);
        if (route === 'push') {
            assert.equal(JSON.parse(options.body).device_id, config.device_id);
            return ok({ acked_uuids: ['pending1', 'not-submitted'] });
        }
        if (route === 'photo-upload') return ok({});
        return ok({ data: { mitarbeiter: [{ id: 1, vorname: 'Test' }] }, server_time: new Date().toISOString() });
    });
    const result = await worker.runFullSync();
    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.pushCount, 1);
    assert.equal(result.photoCount, 1);
    assert.deepEqual(routes, ['push', 'photo-upload', 'pull']);
    assert.equal(db.sync_outbox.data.size, 0);
    assert.equal(db.cache_mitarbeiter.data.has(9), false);
});

for (const failedRoute of ['push', 'photo-upload', 'pull']) {
    test(`401 bei ${failedRoute}: Neu-Koppeln statt falschem Erfolg, keine Datenverluste`, async t => {
        const { worker, db } = fixture();
        if (failedRoute !== 'push') await db.sync_outbox.clear();
        stubFetch(t, async url => {
            const route = url.split('/').pop();
            if (route === failedRoute) return { ok: false, status: 401 };
            if (route === 'push') return ok({ acked_uuids: [] });
            return ok({});
        });
        const result = await worker.runFullSync();
        assert.equal(result.status, 'UNPAIRED');
        assert.equal((await db.app_settings.get('server_config')).access_token, undefined);
        assert.equal(db.sync_outbox.data.size, failedRoute === 'push' ? 1 : 0);
        assert.equal(db.local_fotos.data.size, 1);
        assert.equal(await db.app_settings.get('last_sync_timestamp'), undefined);
        assert.equal(worker.isSyncing, false);
    });
}

test('Pull-Fehler und fehlende Stammdaten sind kein SUCCESS', async t => {
    const responses = [{ ok: false, status: 500 }, ok({})];
    let currentResponse;
    stubFetch(t, async () => currentResponse);
    for (const response of responses) {
        currentResponse = response;
        const { worker, db } = fixture();
        await db.sync_outbox.clear();
        await db.local_fotos.clear();
        assert.equal((await worker.runFullSync()).status, 'ERROR');
        assert.equal(await db.app_settings.get('last_sync_timestamp'), undefined);
    }
});

test('Unbestätigte Push-Daten bleiben erhalten und werden nicht als Erfolg gemeldet', async t => {
    const { worker, db } = fixture();
    stubFetch(t, async () => ok({ acked_uuids: [], conflicts: [{ error: 'invalid' }] }));
    assert.equal((await worker.runFullSync()).status, 'ERROR');
    assert.equal(db.sync_outbox.data.size, 1);
    assert.equal((await db.local_fotos.get('photo1')).is_synced, 0);
});

test('In Quarantäne bestätigte Daten werden als Konflikt und nicht als Erfolg gemeldet', async t => {
    const { worker, db } = fixture();
    await db.local_fotos.clear();
    stubFetch(t, async url => url.endsWith('/push') ?
        ok({ acked_uuids: ['pending1'], conflicts: [{ conflict: true }] }) :
        ok({ data: {}, server_time: new Date().toISOString() }));
    assert.equal((await worker.runFullSync()).status, 'CONFLICT');
    assert.equal(db.sync_outbox.data.size, 0, 'Daten befinden sich bestätigt im Desktop-Konfliktspeicher');
});
test('Origin-Wechsel einschließlich HTTP zu HTTPS wird nicht als Datenmigration ausgegeben', () => {
    assert.equal(Worker.canReconnectServer('http://192.168.1.5:38400', 'https://192.168.1.5:38400'), false);
    assert.equal(Worker.canReconnectServer('https://hub.example:38400/', 'https://hub.example:38400'), true);
    assert.equal(Worker.canReconnectServer('https://hub.example:38400', 'https://other.example:38400'), false);
    assert.equal(Worker.canReconnectServer('https://hub.example:38400', 'https://hub.example:38500'), false);
    assert.equal(Worker.canReconnectServer('https://hub.example:38400', 'http://hub.example:38400'), false);
});

test('USB-Bundle-Skripte lassen sich gemeinsam als Browser-Skripte laden', () => {
    const context = vm.createContext({ window: {}, console });
    for (const script of ['crypto-sync-bundle.js', 'sync-bundle.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../pwa/js', script), 'utf8'), context);
    }
    assert.equal(typeof context.window.createSyncBundle, 'function');
    assert.equal(typeof context.window.unpackSyncBundle, 'function');
    assert.equal(typeof context.window.CryptoSyncBundle.exportToBundle, 'function');
});
test('Foto-Fehler lässt das Foto in der Offline-Warteschlange', async t => {
    const { worker, db } = fixture();
    await db.sync_outbox.clear();
    stubFetch(t, async () => ({ ok: false, status: 413 }));
    assert.equal((await worker.runFullSync()).status, 'ERROR');
    assert.equal((await db.local_fotos.get('photo1')).is_synced, 0);
});

test('Konfiguration startet standardmäßig nicht, LAN benötigt TLS-Dateien', () => {
    assert.deepEqual(validateSyncConfig(), {
        host: '127.0.0.1', port: 38400, useTls: false,
        sslCertPath: '', sslKeyPath: '', autoStart: false
    });
    assert.throws(() => validateSyncConfig({ host: '0.0.0.0' }), /HTTPS/);
    assert.throws(() => validateSyncConfig({ host: '0.0.0.0', useTls: true }), /PEM/);
    assert.throws(() => validateSyncConfig({ port: 'invalid' }), /Port/);
    assert.throws(() => validateSyncConfig({ host: 'attacker.example' }), /Bindung/);
});

test('Sicherheitsmigration setzt alten Autostart genau einmal zurück', () => {
    const Database = require('better-sqlite3');
    const { createSchema, runMigrations, seedDefaultData } = require('../schema');
    const db = new Database(':memory:');
    try {
        createSchema(db);
        db.prepare('INSERT INTO einstellungen (key, value) VALUES (?, ?)').run('sync_server_auto_start', 'true');
        runMigrations(db);
        seedDefaultData(db);
        assert.equal(loadSyncConfig(db).autoStart, false);
        assert.equal(loadSyncConfig(db).host, '127.0.0.1');
        saveSyncConfig(db, { autoStart: true });
        runMigrations(db);
        assert.equal(loadSyncConfig(db).autoStart, true, 'bewusster Opt-in nach Migration bleibt erhalten');
    } finally { db.close(); }
});

test('Sync-Ansicht ist beim Öffnen lesend und escaped synchronisierte Konflikttexte', async t => {
    const previous = global.window;
    t.after(() => { global.window = previous; });
    let generated = 0;
    global.window = { api: {
        getSyncStatus: async () => ({ isRunning: false, config: validateSyncConfig() }),
        getSyncConflicts: async () => [{
            id: 1, entity_type: '<img src=x onerror=alert(1)>',
            client_device_id: '<script>bad()</script>', conflict_reason: '<b>raw</b>'
        }],
        getSyncPairingPayload: async () => { generated++; }
    } };
    const html = await new SyncView().render();
    assert.equal(generated, 0);
    assert.match(html, /GESTOPPT/);
    assert.match(html, /&lt;img/);
    assert.doesNotMatch(html, /<script>bad/);
    assert.doesNotMatch(html, /<b>raw/);
});

test('Bautagebuch rendert synchronisierte HTML-Nutzlasten ausschließlich als Text', async () => {
    const cards = [];
    const payload = '<img src=x onerror=alert(1)>';
    const context = vm.createContext({
        console, window: { api: { getBautagebuch: async () => [{
            datum: '2026-09-10', wetter: payload, tagesbericht: payload,
            vorkommnisse_behinderungen: payload, personal_eigen_anzahl: payload
        }] } },
        document: {
            getElementById: () => ({ innerHTML: '', appendChild: card => cards.push(card) }),
            createElement: () => ({})
        }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/projekte.js'), 'utf8'), context);
    await context.loadProjektBautagebuch(1);
    assert.equal(cards.length, 1);
    assert.doesNotMatch(cards[0].innerHTML, /<img/);
    assert.match(cards[0].innerHTML, /&lt;img/);
});
