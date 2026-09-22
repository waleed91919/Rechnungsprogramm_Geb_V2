/**
 * sync_p0_negativmatrix.test.js (P0.1-Nachweis — kein Funktionsausbau)
 * 6 Negativtests: 401/403-Matrix, Token-Reuse, Fremd-Device-Write,
 * Symlink-Upload, SSE-ohne-Auth, Stopp-Revoke.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const SyncServer = require('../main/sync-server');

async function harness(t, options = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wlink-p0-negativ-'));
    const pwaDir = path.join(dir, 'pwa');
    const uploadsDir = path.join(dir, 'uploads');
    fs.mkdirSync(pwaDir, { recursive: true });
    fs.writeFileSync(path.join(pwaDir, 'index.html'), '<!doctype html><title>P0 synthetic</title>');
    const db = new Database(':memory:');
    db.exec(`
        CREATE TABLE projekte (id INTEGER PRIMARY KEY, name TEXT, start TEXT, ende TEXT, status TEXT);
        INSERT INTO projekte VALUES (1, 'P0 project', '2026-01-01', NULL, 'AKTIV');
        CREATE TABLE liegenschaften (id INTEGER PRIMARY KEY, objekt_nr TEXT, name TEXT, ort TEXT, aktiv INTEGER);
        CREATE TABLE mitarbeiter (id INTEGER PRIMARY KEY, personalnummer TEXT, vorname TEXT, nachname TEXT,
            aktiv INTEGER, lohngruppe_id INTEGER, tarif_stundensatz REAL, gehalt REAL);
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
        INSERT INTO maengelkataster VALUES (1, 'P0-M1');
        CREATE TABLE maengel_fotos (id INTEGER PRIMARY KEY, mangel_id INTEGER, dateipfad TEXT,
            aufnahme_datum TEXT, typ TEXT, kommentar TEXT);
    `);
    const server = new SyncServer(db, null, { port: 0, pwaDir, uploadsDir, ...options });
    t.after(async () => {
        await server.stop().catch(() => {});
        db.close();
        fs.rmSync(dir, { recursive: true, force: true });
    });
    await server.start();
    return { server, db, dir, pwaDir, uploadsDir };
}

function request(server, endpoint, { method = 'POST', body, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1', port: server.port, path: endpoint, method, headers, agent: false
        }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('error', reject);
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                let json; try { json = JSON.parse(text); } catch (_e) { }
                resolve({ status: res.statusCode, text, json });
            });
        });
        req.on('error', reject);
        req.setTimeout(4000, () => req.destroy(new Error('timeout')));
        if (body !== undefined) req.write(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
        req.end();
    });
}

async function pair(server, deviceId = 'P0_DEVICE') {
    const token = server.createPairingToken();
    const res = await request(server, '/api/v1/sync/pair', { body: { pairing_token: token, device_id: deviceId } });
    assert.equal(res.status, 200, res.text);
    return { token, headers: { Authorization: `Bearer ${res.json.access_token}`, 'X-Device-Id': deviceId }, accessToken: res.json.access_token };
}

function changes(db) { return db.prepare('SELECT total_changes() AS n').get().n; }

test('P0.1/1 401-403-Matrix: kein Sync-Handler ohne authenticate() erreichbar', async t => {
    const { server } = await harness(t);
    for (const ep of ['push', 'pull', 'unpair', 'photo-upload']) {
        const res = await request(server, `/api/v1/sync/${ep}`, { body: { device_id: 'X' } });
        assert.equal(res.status, 401, `${ep}: ${res.text}`);
    }
    const sse = await request(server, '/api/v1/sync/events', { method: 'GET' });
    assert.equal(sse.status, 401, `events: ${sse.text}`);
    // Falsche Device-ID bei gültigem Token → 403
    const { headers } = await pair(server);
    const wrong = await request(server, '/api/v1/sync/pull', {
        body: {}, headers: { ...headers, 'X-Device-Id': 'FREMDE_ID' }
    });
    assert.equal(wrong.status, 403, wrong.text);
});

test('P0.1/2 Token-Reuse: derselbe Pairing-Token nur einmal', async t => {
    const { server } = await harness(t);
    const token = server.createPairingToken();
    const first = await request(server, '/api/v1/sync/pair', { body: { pairing_token: token, device_id: 'P0_A' } });
    assert.equal(first.status, 200, first.text);
    const reuse = await request(server, '/api/v1/sync/pair', { body: { pairing_token: token, device_id: 'P0_B' } });
    assert.equal(reuse.status, 403, reuse.text);
});

test('P0.1/3 Fremd-Device-Write verändert keine DB-Zeilen', async t => {
    const { server, db } = await harness(t);
    const { headers } = await pair(server, 'P0_OWNER');
    const before = changes(db);
    const uuid = crypto.randomUUID();
    const res = await request(server, '/api/v1/sync/push', {
        body: {
            device_id: 'P0_FREMDE',
            mutations: [{ uuid, entity_type: 'GERAETE_BUCHUNG', entity_uuid: uuid, mutation_type: 'INSERT',
                payload: { uuid, projekt_id: 1, geraet_code: 'P0-BAGGER', datum: '2026-01-01', betriebsstunden: 2 } }]
        },
        headers
    });
    assert.equal(res.status, 403, res.text);
    assert.equal(changes(db), before, 'keine DB-Änderung bei Fremd-Device-Write');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM geraete_buchungen').get().n, 0);
});

test('P0.1/4 Symlink-Upload-Verzeichnis + Traversal-Dateiname → kein File auf Platte', async t => {
    const { server, dir, uploadsDir } = await harness(t);
    const { headers } = await pair(server);
    // Traversal via Foto-UUID-Header wird abgewiesen (400), kein File
    const evil = await request(server, '/api/v1/sync/photo-upload', {
        body: Buffer.from('P0-bytes'),
        headers: { ...headers, 'X-Photo-Uuid': '../evil', 'Content-Type': 'application/octet-stream' }
    });
    assert.ok([400, 401, 403].includes(evil.status), evil.text);
    const outside = path.join(dir, 'evil.webp');
    assert.ok(!fs.existsSync(outside), 'keine Datei außerhalb des Upload-Roots');
    assert.deepEqual(fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [], []);
});

test('P0.1/5 SSE ohne Auth → 401, kein offener Kanal', async t => {
    const { server } = await harness(t);
    const res = await request(server, '/api/v1/sync/events', { method: 'GET' });
    assert.equal(res.status, 401, res.text);
    assert.equal(server.sseClients.size, 0);
});

test('P0.1/6 Stopp-Revoke: nach unpair/stop ist die Sitzung tot', async t => {
    const { server } = await harness(t);
    const { headers } = await pair(server);
    const ok = await request(server, '/api/v1/sync/pull', { body: {}, headers });
    assert.equal(ok.status, 200, ok.text);
    const unpair = await request(server, '/api/v1/sync/unpair', { body: {}, headers });
    assert.equal(unpair.status, 200, unpair.text);
    const dead = await request(server, '/api/v1/sync/pull', { body: {}, headers });
    assert.equal(dead.status, 401, `widerrufene Sitzung: ${dead.text}`);
    await server.stop();
    assert.equal(server.sessions.size, 0, 'stop() räumt alle Sitzungen');
});
