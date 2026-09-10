const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const Database = require('better-sqlite3');
const SyncServer = require('../main/sync-server');

// These tests only touch synthetic in-memory records and private temporary directories.
async function harness(t, options = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wlink-sync-security-'));
    const pwaDir = path.join(dir, 'pwa');
    const uploadsDir = path.join(dir, 'uploads');
    fs.mkdirSync(pwaDir);
    fs.writeFileSync(path.join(pwaDir, 'index.html'), '<!doctype html><title>Synthetic shell</title>');
    fs.writeFileSync(path.join(pwaDir, 'app.js'), 'window.synthetic = true;');
    const db = new Database(':memory:');
    db.exec(`
        CREATE TABLE projekte (id INTEGER PRIMARY KEY, name TEXT, start TEXT, ende TEXT, status TEXT);
        INSERT INTO projekte VALUES (1, 'Synthetic project', '2026-01-01', NULL, 'AKTIV');
        CREATE TABLE liegenschaften (id INTEGER PRIMARY KEY, objekt_nr TEXT, name TEXT, ort TEXT, aktiv INTEGER);
        INSERT INTO liegenschaften VALUES (1, 'SYN-1', 'Synthetic building', 'Test town', 1);
        CREATE TABLE mitarbeiter (id INTEGER PRIMARY KEY, personalnummer TEXT, vorname TEXT, nachname TEXT,
            aktiv INTEGER, lohngruppe_id INTEGER, tarif_stundensatz REAL, gehalt REAL);
        INSERT INTO mitarbeiter VALUES (1, 'SYN-001', 'Synthetic', 'Operator', 1, 999, 999.99, 8888.88);
        CREATE TABLE lv_positionen (id INTEGER PRIMARY KEY, bereich_id INTEGER, positionsnr TEXT, bezeichnung TEXT,
            menge REAL, menge_einheit TEXT);
        CREATE TABLE sync_processed_mutations (id INTEGER PRIMARY KEY, mutation_uuid TEXT UNIQUE,
            device_id TEXT, entity_type TEXT, entity_uuid TEXT, created_at TEXT);
        CREATE TABLE sync_conflicts (id INTEGER PRIMARY KEY, entity_type TEXT, entity_uuid TEXT,
            client_device_id TEXT, server_data_json TEXT, client_data_json TEXT, conflict_reason TEXT,
            status TEXT, created_at TEXT);
        CREATE TABLE geraete_buchungen (uuid TEXT UNIQUE, projekt_id INTEGER, geraet_code TEXT, datum TEXT,
            betriebsstunden REAL, stillstand_stunden REAL, stillstand_grund TEXT, device_id TEXT);
        CREATE TABLE maengelkataster (id INTEGER PRIMARY KEY, mangel_nr TEXT);
        INSERT INTO maengelkataster VALUES (1, 'SYN-M1');
        CREATE TABLE maengel_fotos (id INTEGER PRIMARY KEY, mangel_id INTEGER, dateipfad TEXT,
            aufnahme_datum TEXT, typ TEXT, kommentar TEXT);
    `);
    const server = new SyncServer(db, null, { port: 0, pwaDir, uploadsDir, ...options });
    t.after(async () => {
        await server.stop();
        db.close();
        fs.rmSync(dir, { recursive: true, force: true });
    });
    await server.start();
    return { server, db, dir, pwaDir, uploadsDir };
}

function request(server, endpoint, { method = 'POST', body, headers = {}, tls = false } = {}) {
    return new Promise((resolve, reject) => {
        const req = (tls ? https : http).request({
            hostname: '127.0.0.1', port: server.port, path: endpoint, method, headers, agent: false,
            ...(tls ? { rejectUnauthorized: false } : {})
        }, res => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('error', reject);
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                let json;
                try { json = JSON.parse(text); } catch (_e) { }
                resolve({ status: res.statusCode, headers: res.headers, text, json });
            });
        });
        req.on('error', reject);
        req.setTimeout(4000, () => req.destroy(new Error('Request timeout')));
        if (body !== undefined) req.write(Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
        req.end();
    });
}

async function pair(server, deviceId = 'SYNTHETIC_DEVICE', endpoint = '/api/v1/sync/pair') {
    const token = server.createPairingToken();
    const response = await request(server, endpoint, { body: { pairing_token: token, device_id: deviceId } });
    assert.equal(response.status, 200, response.text);
    assert.equal(response.json.status, 'PAIRED');
    assert.equal(response.json.device_id, deviceId);
    assert.match(response.json.access_token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(new Date(response.json.expires_at).toISOString(), response.json.expires_at);
    return { response, token, headers: { Authorization: `Bearer ${response.json.access_token}`, 'X-Device-Id': deviceId } };
}

function mutation(uuid = crypto.randomUUID(), deviceId) {
    return {
        uuid, entity_type: 'GERAETE_BUCHUNG', entity_uuid: uuid, mutation_type: 'INSERT',
        payload: { uuid, projekt_id: 1, geraet_code: 'SYN-EXCAVATOR', datum: '2026-01-01', betriebsstunden: 2,
            ...(deviceId ? { device_id: deviceId } : {}) }
    };
}

function changed(db) {
    return db.prepare('SELECT total_changes() AS n').get().n;
}

function files(dir) {
    return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
}

async function eventually(predicate, message, timeout = 2000) {
    const deadline = Date.now() + timeout;
    while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(predicate(), message);
}

function openSse(server, headers, endpoint = '/api/v1/sync/events') {
    return new Promise((resolve, reject) => {
        const req = http.get({ hostname: '127.0.0.1', port: server.port, path: endpoint, headers, agent: false }, res => {
            const channel = { req, res, text: '', closed: false };
            res.on('close', () => { channel.closed = true; });
            res.on('error', () => {});
            res.on('data', chunk => {
                channel.text += chunk.toString();
                resolve(channel);
            });
        });
        req.on('error', reject);
    });
}

function openWs(server, headers = {}, endpoint = '/ws') {
    return new Promise((resolve, reject) => {
        const socket = net.connect(server.port, '127.0.0.1');
        const channel = { socket, text: '', closed: false };
        socket.setTimeout(4000, () => socket.destroy(new Error('WebSocket timeout')));
        socket.on('error', reject);
        socket.on('close', () => { channel.closed = true; });
        socket.on('data', data => {
            channel.text += data.toString('utf8');
            if (channel.text.includes('\r\n\r\n')) resolve(channel);
        });
        socket.on('connect', () => {
            const allHeaders = {
                Host: `127.0.0.1:${server.port}`, Upgrade: 'websocket', Connection: 'Upgrade',
                'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'), 'Sec-WebSocket-Version': '13', ...headers
            };
            socket.write(`GET ${endpoint} HTTP/1.1\r\n${Object.entries(allHeaders).map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n`);
        });
    });
}

test('default binding, advertised URLs and five-minute one-use pairing contract', async t => {
    const { server } = await harness(t);
    const info = server.getServerInfo();
    assert.deepEqual(Object.keys(info).sort(), ['host', 'isRunning', 'localIp', 'port', 'serverUrl', 'useTls', 'wsUrl'].sort());
    assert.equal(info.host, '127.0.0.1');
    assert.equal(server.server.address().address, '127.0.0.1');
    assert.equal(info.useTls, false);
    assert.equal(info.serverUrl, `http://127.0.0.1:${server.port}`);
    assert.equal(info.wsUrl, `ws://127.0.0.1:${server.port}/ws`);
    assert.ok(server.port > 0);
    const qr = server.getPairingPayload();
    assert.equal(qr.server_url, info.serverUrl);
    assert.equal(qr.ws_url, info.wsUrl);
    assert.ok(Date.parse(qr.valid_until) - Date.now() <= 300000);
    assert.ok(Date.parse(qr.valid_until) - Date.now() > 295000);
    assert.equal(server.pairingTokens.has(qr.pairing_token), false);
    const paired = await pair(server);
    assert.equal(server.sessions.has(paired.response.json.access_token), false);
    assert.match([...server.sessions.keys()][0], /^[a-f0-9]{64}$/);
    assert.ok(Date.parse(paired.response.json.expires_at) - Date.now() > 8 * 3600000 - 5000);
    const replay = await request(server, '/api/sync/pair', {
        body: { pairing_token: paired.token, device_id: 'OTHER_DEVICE' }
    });
    assert.equal(replay.status, 403);
    assert.equal(server.sessions.size, 1);
    assert.deepEqual(await server.start(), { success: true, ...info });
    const contestedToken = server.createPairingToken();
    const contested = await Promise.all(['SYN_A', 'SYN_B'].map(deviceId => request(server, '/api/v1/sync/pair', {
        body: { pairing_token: contestedToken, device_id: deviceId }
    })));
    assert.deepEqual(contested.map(result => result.status).sort(), [200, 403]);
});

test('all unauthenticated aliases are denied before body, database, file or channel side effects', async t => {
    const { server, db, uploadsDir } = await harness(t);
    const before = changed(db);
    for (const prefix of ['/api/v1/sync/', '/api/sync/']) {
        for (const endpoint of ['push', 'pull', 'photo-upload', 'upload-photo', 'unpair', 'events']) {
            const res = await request(server, `${prefix}${endpoint}`, {
                method: endpoint === 'events' ? 'GET' : 'POST',
                headers: { 'X-Photo-Uuid': 'unauthenticated' },
                body: endpoint === 'events' ? undefined : { device_id: 'ATTACKER', mutations: [mutation()] }
            });
            assert.equal(res.status, 401, `${prefix}${endpoint}: ${res.text}`);
        }
    }
    const urlToken = await request(server, '/api/v1/sync/pull?access_token=secret', { body: {} });
    assert.equal(urlToken.status, 400);
    assert.equal(changed(db), before);
    assert.deepEqual(files(uploadsDir), []);
    assert.equal(server.sseClients.size, 0);
    assert.equal(server.activeSockets.size, 0);
    const ws = await openWs(server);
    assert.match(ws.text, /^HTTP\/1\.1 401 /);
    assert.doesNotMatch(ws.text, /101 Switching/);
    await eventually(() => ws.closed, 'Rejected WebSocket must close');
});

test('paired push/pull work across aliases, redact wages and bind batch and offline mutation identities', async t => {
    const { server, db } = await harness(t);
    const paired = await pair(server, 'TRUSTED_OPERATOR', '/api/sync/pair');
    for (const endpoint of ['/api/sync/pull', '/api/v1/sync/pull']) {
        const pull = await request(server, endpoint, { headers: paired.headers, body: {} });
        assert.equal(pull.status, 200);
        assert.deepEqual(pull.json.data.mitarbeiter, [
            { id: 1, personalnummer: 'SYN-001', vorname: 'Synthetic', nachname: 'Operator' }
        ]);
        assert.doesNotMatch(pull.text, /lohngruppe|stundensatz|gehalt|8888/);
    }
    const mut = mutation('synthetic-mutation', 'OLD_OFFLINE_CONTROLLER');
    mut.device_id = 'ANOTHER_OLD_CONTROLLER';
    const push = await request(server, '/api/sync/push', {
        headers: paired.headers, body: { device_id: 'TRUSTED_OPERATOR', mutations: [mut] }
    });
    assert.equal(push.status, 200, push.text);
    assert.deepEqual(push.json.acked_uuids, [mut.uuid]);
    assert.equal(db.prepare('SELECT device_id FROM geraete_buchungen').get().device_id, 'TRUSTED_OPERATOR');
    assert.equal(db.prepare('SELECT device_id FROM sync_processed_mutations').get().device_id, 'TRUSTED_OPERATOR');
    const stringPayload = mutation('string-payload', 'LEGACY');
    stringPayload.payload = JSON.stringify(stringPayload.payload);
    assert.equal((await request(server, '/api/v1/sync/push', {
        headers: paired.headers, body: { mutations: [stringPayload] }
    })).status, 200);
    assert.equal(db.prepare('SELECT device_id FROM geraete_buchungen WHERE uuid = ?').get(stringPayload.uuid).device_id, 'TRUSTED_OPERATOR');
    const replay = await request(server, '/api/v1/sync/push', { headers: paired.headers, body: { mutations: [mut] } });
    assert.equal(replay.status, 200);
    assert.equal(db.prepare('SELECT count(*) AS n FROM geraete_buchungen').get().n, 2);
    const before = changed(db);
    for (const route of ['push', 'pull', 'unpair']) {
        assert.equal((await request(server, `/api/v1/sync/${route}`, {
            headers: paired.headers, body: { device_id: 'IMPERSONATED', mutations: [mutation()] }
        })).status, 403);
    }
    assert.equal((await request(server, '/api/v1/sync/push', {
        headers: { ...paired.headers, 'X-Device-Id': 'OTHER_DEVICE' }, body: { mutations: [mutation()] }
    })).status, 403);
    assert.equal((await request(server, '/api/v1/sync/pull', {
        headers: { Authorization: paired.headers.Authorization }, body: {}
    })).status, 401);
    assert.equal((await request(server, '/api/v1/sync/pull', {
        headers: { 'X-Device-Id': paired.headers['X-Device-Id'] }, body: {}
    })).status, 401);
    assert.equal(changed(db), before);
});

test('expired/revoked sessions close SSE and WebSockets and cannot receive broadcasts', async t => {
    const { server } = await harness(t, { sessionTtlMs: 450 });
    const paired = await pair(server);
    const sse = await openSse(server, paired.headers, '/api/sync/events');
    const ws = await openWs(server, paired.headers);
    assert.match(ws.text, /^HTTP\/1\.1 101 /);
    server.broadcast({ type: 'SYNTHETIC_ALLOWED_UPDATE' });
    await eventually(() => sse.text.includes('SYNTHETIC_ALLOWED_UPDATE') && ws.text.includes('SYNTHETIC_ALLOWED_UPDATE'), 'Authorized channels receive broadcasts');
    await eventually(() => sse.closed && ws.closed && server.sessions.size === 0, 'Expiry closes both transports');
    server.broadcast({ type: 'SECRET_AFTER_EXPIRY' });
    assert.doesNotMatch(sse.text + ws.text, /SECRET_AFTER_EXPIRY/);
    assert.equal((await request(server, '/api/v1/sync/pull', { headers: paired.headers, body: {} })).status, 401);

    const second = await pair(server, 'REVOKED_DEVICE');
    const sse2 = await openSse(server, second.headers);
    const ws2 = await openWs(server, second.headers);
    const revoked = await request(server, '/api/v1/sync/unpair', { headers: second.headers, body: { device_id: 'REVOKED_DEVICE' } });
    assert.equal(revoked.status, 200);
    assert.equal(revoked.json.status, 'UNPAIRED');
    await eventually(() => sse2.closed && ws2.closed, 'Unpair closes both transports');
    server.broadcast({ type: 'SECRET_AFTER_REVOKE' });
    assert.doesNotMatch(sse2.text + ws2.text, /SECRET_AFTER_REVOKE/);
    assert.equal((await request(server, '/api/sync/pull', { headers: second.headers, body: {} })).status, 401);
    assert.equal(server.sseClients.size, 0);
    assert.equal(server.activeSockets.size, 0);
});

test('stop clears sessions, pairing tokens and channels, including when already stopped', async t => {
    const { server } = await harness(t);
    const paired = await pair(server);
    const sse = await openSse(server, paired.headers);
    const ws = await openWs(server, paired.headers);
    server.createPairingToken();
    await server.stop();
    await eventually(() => sse.closed && ws.closed, 'Stop closes channels');
    assert.equal(server.sessions.size, 0);
    assert.equal(server.pairingTokens.size, 0);
    assert.equal(server.getServerInfo().isRunning, false);
    server.createPairingToken();
    server.sessions.set('synthetic-only', { timer: null, channels: new Set() });
    await server.stop();
    assert.equal(server.pairingTokens.size, 0);
    assert.equal(server.sessions.size, 0);
    await server.start();
    assert.equal((await request(server, '/api/v1/sync/pull', { headers: paired.headers, body: {} })).status, 401);
});

test('Origin and Host boundaries apply before pairing, preflight, static routes and WebSocket upgrades', async t => {
    const explicitOrigin = 'https://trusted-pwa.example';
    const { server, db } = await harness(t, { allowedOrigins: [explicitOrigin, 'null'] });
    const paired = await pair(server);
    const before = changed(db);
    for (const origin of ['null', 'http://attacker.example', 'https://trusted-pwa.example.evil', 'file://']) {
        for (const method of ['POST', 'OPTIONS']) {
            const result = await request(server, '/api/v1/sync/push', {
                method, headers: { ...paired.headers, Origin: origin }, body: { mutations: [mutation()] }
            });
            assert.equal(result.status, 403);
            assert.equal(result.headers['access-control-allow-origin'], undefined);
        }
    }
    for (const host of ['attacker.example', `attacker.example:${server.port}`, `127.0.0.1:${server.port + 1}`, '127.0.0.1']) {
        assert.equal((await request(server, '/', { method: 'GET', headers: { Host: host } })).status, 403);
        assert.equal((await request(server, '/api/v1/sync/pair', {
            headers: { Host: host }, body: { pairing_token: server.createPairingToken(), device_id: 'BOUNDARY_DEVICE' }
        })).status, 403);
    }
    const ownOrigin = server.getServerInfo().serverUrl;
    for (const origin of [ownOrigin, explicitOrigin]) {
        const preflight = await request(server, '/api/v1/sync/pull', { method: 'OPTIONS', headers: { Origin: origin } });
        assert.equal(preflight.status, 204);
        assert.equal(preflight.headers['access-control-allow-origin'], origin);
        assert.match(preflight.headers['access-control-allow-headers'], /Authorization/);
        assert.equal((await request(server, '/api/v1/sync/pull', { headers: { ...paired.headers, Origin: origin }, body: {} })).status, 200);
    }
    assert.equal((await request(server, '/', { method: 'GET', headers: { Host: `localhost:${server.port}` } })).status, 200);
    const localhostOrigin = `http://localhost:${server.port}`;
    const loopbackPull = await request(server, '/api/v1/sync/pull', {
        headers: { ...paired.headers, Host: `localhost:${server.port}`, Origin: localhostOrigin }, body: {}
    });
    assert.equal(loopbackPull.status, 200);
    assert.equal(loopbackPull.headers['access-control-allow-origin'], localhostOrigin);
    for (const headers of [{ ...paired.headers, Origin: 'null' }, { ...paired.headers, Host: 'evil.example' }]) {
        const ws = await openWs(server, headers);
        assert.match(ws.text, /^HTTP\/1\.1 403 /);
        await eventually(() => ws.closed, 'Rejected upgrade closes');
    }
    const wsUrl = await openWs(server, paired.headers, `/ws?access_token=${paired.response.json.access_token}`);
    assert.match(wsUrl.text, /^HTTP\/1\.1 400 /);
    assert.equal(changed(db), before);
});

test('JSON bytes, mutation count and malformed bodies are bounded without partial database changes', async t => {
    const { server, db } = await harness(t, { maxJsonBytes: 1024 });
    const paired = await pair(server);
    const before = changed(db);
    for (const body of ['{broken', 'null', '[]', '"string"', '{"mutations":[{"payload":"{broken"}]}']) {
        const result = await request(server, '/api/v1/sync/push', { headers: paired.headers, body });
        assert.equal(result.status, 400, result.text);
    }
    for (const headers of [paired.headers, { ...paired.headers, 'Content-Length': '1025' }]) {
        const result = await request(server, '/api/v1/sync/push', { headers, body: ' '.repeat(1025) });
        assert.equal(result.status, 413, result.text);
    }
    // Raw byte count (rather than character count) must enforce the bound.
    assert.equal((await request(server, '/api/v1/sync/pull', {
        headers: paired.headers, body: { text: 'ü'.repeat(600) }
    })).status, 413);
    assert.equal((await request(server, '/api/v1/sync/push', {
        headers: paired.headers, body: { mutations: Array.from({ length: 51 }, () => ({})) }
    })).status, 413);
    assert.equal((await request(server, '/api/v1/sync/push', {
        headers: paired.headers, body: { mutations: [{}, null] }
    })).status, 400);
    assert.equal(changed(db), before);
    assert.equal((await request(server, '/api/v1/sync/push', {
        headers: paired.headers, body: { mutations: Array.from({ length: 50 }, () => ({})) }
    })).status, 200);
});

test('photo staging verifies hashes, length and safe names; never overwrites files or follows symlinks', async t => {
    const { server, db, dir, uploadsDir } = await harness(t, { maxPhotoBytes: 128 });
    const paired = await pair(server);
    const photo = Buffer.from('Synthetic image bytes only');
    const sha = crypto.createHash('sha256').update(photo).digest('hex');
    const photoHeaders = { ...paired.headers, 'X-Photo-Uuid': 'safe_photo-01', 'X-Sha256': sha, 'X-Entity-Uuid': 'SYN-M1' };
    const before = changed(db);
    for (const name of ['../escape', '..', '.hidden', 'sub/name', 'sub\\name', 'x'.repeat(81), 'photo.webp']) {
        assert.equal((await request(server, '/api/v1/sync/photo-upload', {
            headers: { ...photoHeaders, 'X-Photo-Uuid': name }, body: photo
        })).status, 400, name);
    }
    assert.equal((await request(server, '/api/v1/sync/photo-upload', {
        headers: { ...photoHeaders, 'X-Sha256': '0'.repeat(64) }, body: photo
    })).status, 422);
    assert.equal(changed(db), before);
    assert.deepEqual(files(uploadsDir), []);
    for (const extra of [{}, { 'Content-Length': '129' }]) {
        assert.equal((await request(server, '/api/sync/upload-photo', {
            headers: { ...photoHeaders, ...extra }, body: Buffer.alloc(129)
        })).status, 413);
        assert.deepEqual(files(uploadsDir), []);
    }
    const success = await request(server, '/api/v1/sync/upload-photo', { headers: photoHeaders, body: photo });
    assert.equal(success.status, 200, success.text);
    assert.equal(success.json.sha256, sha);
    assert.equal(success.json.file_name, 'safe_photo-01.webp');
    assert.equal(path.isAbsolute(success.json.filePath), false);
    assert.doesNotMatch(success.text, new RegExp(dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.deepEqual(fs.readFileSync(path.join(uploadsDir, success.json.file_name)), photo);
    assert.equal(db.prepare('SELECT count(*) AS n FROM maengel_fotos').get().n, 1);
    assert.deepEqual(files(uploadsDir), ['safe_photo-01.webp']);
    const idempotentRetry = await request(server, '/api/sync/photo-upload', { headers: photoHeaders, body: photo });
    assert.equal(idempotentRetry.status, 200);
    assert.equal(idempotentRetry.json.sha256, sha);
    assert.equal(db.prepare('SELECT count(*) AS n FROM maengel_fotos').get().n, 1);
    assert.equal((await request(server, '/api/sync/photo-upload', {
        headers: { ...photoHeaders, 'X-Sha256': crypto.createHash('sha256').update('different').digest('hex') },
        body: 'different'
    })).status, 409);
    const outside = path.join(dir, 'outside.webp');
    fs.writeFileSync(outside, 'do not overwrite');
    fs.symlinkSync(outside, path.join(uploadsDir, 'symlink.webp'));
    assert.equal((await request(server, '/api/v1/sync/photo-upload', {
        headers: { ...photoHeaders, 'X-Photo-Uuid': 'symlink' }, body: photo
    })).status, 409);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'do not overwrite');
    assert.ok(fs.lstatSync(path.join(uploadsDir, 'symlink.webp')).isSymbolicLink());
    assert.equal(files(uploadsDir).some(name => name.startsWith('.sync-upload-')), false);
    const exactBound = await request(server, '/api/v1/sync/photo-upload', {
        headers: { ...paired.headers, 'X-Photo-Uuid': 'exact-bound', 'Content-Length': '128' }, body: Buffer.alloc(128)
    });
    assert.equal(exactBound.status, 200);
    assert.equal(fs.statSync(path.join(uploadsDir, 'exact-bound.webp')).size, 128);
});

test('upload filesystem errors and symlink roots fail without leaking paths or leaving partial files', async t => {
    const { server, dir, db } = await harness(t);
    const paired = await pair(server);
    const rootFile = path.join(dir, 'not-a-directory');
    fs.writeFileSync(rootFile, 'preserve synthetic original');
    const realDir = path.join(dir, 'not-authorized-through-symlink');
    fs.mkdirSync(realDir);
    const rootSymlink = path.join(dir, 'linked-root');
    fs.symlinkSync(realDir, rootSymlink);
    for (const [root, expected] of [[rootFile, 500], [rootSymlink, 403]]) {
        server.uploadsDir = root;
        const result = await request(server, '/api/v1/sync/photo-upload', {
            headers: { ...paired.headers, 'X-Photo-Uuid': 'filesystem-error', 'X-Entity-Uuid': 'SYN-M1' },
            body: 'synthetic bytes'
        });
        assert.equal(result.status, expected);
        assert.equal(result.text.includes(dir), false);
    }
    assert.equal(fs.readFileSync(rootFile, 'utf8'), 'preserve synthetic original');
    assert.deepEqual(files(realDir), []);
    assert.equal(db.prepare('SELECT count(*) AS n FROM maengel_fotos').get().n, 0);
});

test('aborted and stopped uploads clean all staged files and cannot mutate photo metadata', async t => {
    const { server, db, uploadsDir } = await harness(t);
    const paired = await pair(server);
    const beginPartial = () => {
        const req = http.request({
            hostname: '127.0.0.1', port: server.port, method: 'POST', path: '/api/v1/sync/photo-upload',
            headers: { ...paired.headers, 'X-Photo-Uuid': 'aborted', 'X-Entity-Uuid': 'SYN-M1', 'Content-Length': '10000' },
            agent: false
        });
        req.on('error', () => {});
        req.write(Buffer.alloc(100));
        return req;
    };
    const first = beginPartial();
    await eventually(() => files(uploadsDir).some(name => name.startsWith('.sync-upload-')), 'Partial upload reaches private staging');
    first.destroy();
    await eventually(() => files(uploadsDir).length === 0 && server.pendingUploads.size === 0, 'Aborted stage is removed');
    assert.equal(db.prepare('SELECT count(*) AS n FROM maengel_fotos').get().n, 0);
    const second = beginPartial();
    await eventually(() => files(uploadsDir).some(name => name.startsWith('.sync-upload-')), 'Second partial upload starts');
    await server.stop();
    second.destroy();
    assert.deepEqual(files(uploadsDir), []);
    assert.equal(server.pendingUploads.size, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM maengel_fotos').get().n, 0);
});

test('public PWA shell and explicit controllers work; traversal, unknown extensions and escaping symlinks do not', async t => {
    const { server, pwaDir, dir } = await harness(t);
    const outside = path.join(dir, 'private.js');
    fs.writeFileSync(outside, 'SYNTHETIC_PRIVATE_SECRET');
    fs.writeFileSync(path.join(pwaDir, 'private.sqlite'), 'SYNTHETIC_PRIVATE_DATABASE');
    fs.writeFileSync(path.join(pwaDir, '.secrets.json'), 'SYNTHETIC_PRIVATE_SECRET');
    fs.symlinkSync(outside, path.join(pwaDir, 'escape.js'));
    fs.symlinkSync(dir, path.join(pwaDir, 'outside'));
    const shell = await request(server, '/', { method: 'GET' });
    assert.equal(shell.status, 200);
    assert.match(shell.text, /Synthetic shell/);
    assert.equal(shell.headers['x-content-type-options'], 'nosniff');
    const controllerNames = ['ZeiterfassungController', 'BautagebuchMobileController', 'MaengelController'];
    const actualShell = fs.readFileSync(path.join(__dirname, '..', 'pwa', 'index.html'), 'utf8');
    for (const name of controllerNames) {
        assert.ok(actualShell.includes(`../controllers/${name}.js`), 'Existing shell controller reference must resolve');
        const controller = await request(server, `/controllers/${name}.js`, { method: 'GET' });
        assert.equal(controller.status, 200);
        assert.match(controller.headers['content-type'], /javascript/);
    }
    for (const endpoint of [
        '/../private.js', '/%2e%2e/private.js', '/%2e%2e%2fprivate.js', '/..%5cprivate.js',
        '/outside/private.js', '/escape.js', '/private.sqlite', '/.secrets.json',
        '/controllers/OtherController.js', '/controllers/../main.js', '/%00.js', '/%broken.js'
    ]) {
        const result = await request(server, endpoint, { method: 'GET' });
        assert.ok([400, 403, 404].includes(result.status), `${endpoint}: ${result.status}`);
        assert.doesNotMatch(result.text, /SYNTHETIC_PRIVATE/);
    }
    assert.equal((await request(server, '/app.js', { method: 'HEAD' })).text, '');
    assert.equal((await request(server, '/app.js', { method: 'POST', body: 'bad method' })).status, 405);
});

test('pairing validates safe IDs, rate limits attempts, prunes expiries and bounds token/session storage', async t => {
    const { server } = await harness(t);
    const token = server.createPairingToken();
    for (const deviceId of ['', 'bad.id', 'x'.repeat(81), 'ä', '../device', null]) {
        assert.equal((await request(server, '/api/v1/sync/pair', {
            body: { pairing_token: token, device_id: deviceId }
        })).status, 400);
    }
    const key = crypto.createHash('sha256').update(token).digest('hex');
    server.pairingTokens.get(key).validUntil = Date.now() - 1;
    assert.equal((await request(server, '/api/v1/sync/pair', {
        body: { pairing_token: token, device_id: 'VALID_ID' }
    })).status, 403);
    for (let i = 0; i < 3; i++) {
        assert.equal((await request(server, '/api/v1/sync/pair', {
            body: { pairing_token: crypto.randomBytes(32).toString('base64url'), device_id: 'VALID_ID' }
        })).status, 403);
    }
    const limited = await request(server, '/api/sync/pair', { body: { pairing_token: token, device_id: 'VALID_ID' } });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers['retry-after'], '60');
    assert.equal(server.sessions.size, 0);
    for (let i = 0; i < 80; i++) server.createPairingToken();
    assert.equal(server.pairingTokens.size, 32);
    for (const entry of server.pairAttempts.values()) entry.startedAt = Date.now() - 61000;
    server.globalPairAttempts.startedAt = Date.now() - 61000;
    server.pruneSecurityState();
    assert.equal(server.pairAttempts.size, 0);
    // Fill only synthetic in-memory sessions, then use the real HTTP pairing endpoint to test bounded eviction.
    for (let i = 0; i < 100; i++) server.sessions.set(`synthetic-${i}`, {
        expiresAt: Date.now() + 60000, timer: null, channels: new Set()
    });
    await pair(server, 'BOUND_TEST');
    assert.equal(server.sessions.size, 100);
    assert.equal(server.sessions.has('synthetic-0'), false);
});

test('HTTP refuses every nonliteral-loopback bind and TLS fails closed with missing or invalid material', async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wlink-sync-tls-refusal-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const badKey = path.join(dir, 'invalid.key');
    const badCert = path.join(dir, 'invalid.crt');
    fs.writeFileSync(badKey, 'not a private key');
    fs.writeFileSync(badCert, 'not a certificate');
    for (const options of [
        { port: '38400' }, { port: -1 }, { port: 65536 },
        { host: '0.0.0.0' }, { host: '::' }, { host: '192.0.2.1' }, { host: 'localhost' },
        { useTls: true }, { host: '0.0.0.0', useTls: true },
        { useTls: true, sslKeyPath: path.join(dir, 'missing'), sslCertPath: badCert },
        { host: '0.0.0.0', useTls: true, sslKeyPath: badKey, sslCertPath: badCert }
    ]) {
        const server = new SyncServer(null, null, { port: 0, uploadsDir: path.join(dir, 'uploads'), ...options });
        await assert.rejects(server.start());
        assert.equal(server.isRunning, false);
        assert.equal(server.server, null);
        await server.stop();
    }
});

test('a valid TLS listener actually speaks HTTPS and advertises HTTPS/WSS', async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wlink-sync-valid-tls-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const keyPath = path.join(dir, 'key.pem');
    const certPath = path.join(dir, 'cert.pem');
    try {
        execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
            '-keyout', keyPath, '-out', certPath, '-days', '1', '-subj', '/CN=localhost'],
        { stdio: 'ignore', timeout: 10000 });
    } catch (err) {
        if (err.code === 'ENOENT') return t.skip('OpenSSL not installed; refusal tests still run.');
        throw err;
    }
    const { server } = await harness(t, { useTls: true, sslKeyPath: keyPath, sslCertPath: certPath });
    assert.equal(server.getServerInfo().serverUrl, `https://127.0.0.1:${server.port}`);
    assert.equal(server.getPairingPayload().ws_url, `wss://127.0.0.1:${server.port}/ws`);
    assert.equal((await request(server, '/api/v1/sync/ping', { method: 'GET', tls: true })).status, 200);
    await assert.rejects(request(server, '/api/v1/sync/ping', { method: 'GET' }));
    const lan = await harness(t, { host: '0.0.0.0', useTls: true, sslKeyPath: keyPath, sslCertPath: certPath });
    assert.equal(lan.server.server.address().address, '0.0.0.0');
    assert.match(lan.server.getServerInfo().serverUrl, /^https:\/\//);
    assert.doesNotMatch(lan.server.getServerInfo().serverUrl, /\/\/0\.0\.0\.0:/);
    assert.equal((await request(lan.server, '/api/v1/sync/ping', {
        method: 'GET', tls: true, headers: { Host: new URL(lan.server.getServerInfo().serverUrl).host }
    })).status, 200);
});
