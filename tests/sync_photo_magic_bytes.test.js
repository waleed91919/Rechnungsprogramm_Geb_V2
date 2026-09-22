const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const SyncServer = require('../main/sync-server');

async function harness(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wlink-magic-bytes-test-'));
    const pwaDir = path.join(dir, 'pwa');
    const uploadsDir = path.join(dir, 'uploads');
    fs.mkdirSync(pwaDir, { recursive: true });
    fs.writeFileSync(path.join(pwaDir, 'index.html'), '<!doctype html><title>Shell</title>');
    const db = new Database(':memory:');
    db.exec(`
        CREATE TABLE maengelkataster (id INTEGER PRIMARY KEY, mangel_nr TEXT);
        INSERT INTO maengelkataster VALUES (1, 'MANGEL-001');
        CREATE TABLE maengel_fotos (id INTEGER PRIMARY KEY, mangel_id INTEGER, dateipfad TEXT,
            aufnahme_datum TEXT, typ TEXT, kommentar TEXT);
    `);
    const server = new SyncServer(db, null, { port: 0, pwaDir, uploadsDir });
    t.after(async () => {
        await server.stop().catch(() => {});
        db.close();
        fs.rmSync(dir, { recursive: true, force: true });
    });
    await server.start();
    return { server, db, dir, uploadsDir };
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
                let json;
                try { json = JSON.parse(text); } catch (_e) {}
                resolve({ status: res.statusCode, headers: res.headers, text, json });
            });
        });
        req.on('error', reject);
        req.setTimeout(4000, () => req.destroy(new Error('timeout')));
        if (body !== undefined) req.write(Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
        req.end();
    });
}

async function pair(server, deviceId = 'MAGIC_DEV') {
    const token = server.createPairingToken();
    const res = await request(server, '/api/v1/sync/pair', { body: { pairing_token: token, device_id: deviceId } });
    assert.equal(res.status, 200, res.text);
    return { headers: { Authorization: `Bearer ${res.json.access_token}`, 'X-Device-Id': deviceId } };
}

test('SYNC-1: Magic-Bytes Streaming Inspection validiert Bildformate und weist manipulierte Payloads ab', async t => {
    const { server, uploadsDir, db } = await harness(t);
    const paired = await pair(server);

    // 1. Valider JPEG Buffer (FF D8 FF E0...)
    const jpegBuffer = Buffer.from([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
        0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xFF, 0xD9
    ]);
    const jpegSha = crypto.createHash('sha256').update(jpegBuffer).digest('hex');
    const jpegRes = await request(server, '/api/v1/sync/photo-upload', {
        headers: {
            ...paired.headers,
            'X-Photo-Uuid': 'photo-jpeg-01',
            'X-Sha256': jpegSha,
            'X-Entity-Uuid': 'MANGEL-001'
        },
        body: jpegBuffer
    });
    assert.equal(jpegRes.status, 200, jpegRes.text);
    assert.equal(jpegRes.json.file_name, 'photo-jpeg-01.jpg');
    assert.ok(fs.existsSync(path.join(uploadsDir, 'photo-jpeg-01.jpg')));

    // 2. Valider PNG Buffer (89 50 4E 47 0D 0A 1A 0A...)
    const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52
    ]);
    const pngSha = crypto.createHash('sha256').update(pngBuffer).digest('hex');
    const pngRes = await request(server, '/api/v1/sync/photo-upload', {
        headers: {
            ...paired.headers,
            'X-Photo-Uuid': 'photo-png-01',
            'X-Sha256': pngSha,
            'X-Entity-Uuid': 'MANGEL-001'
        },
        body: pngBuffer
    });
    assert.equal(pngRes.status, 200, pngRes.text);
    assert.equal(pngRes.json.file_name, 'photo-png-01.png');
    assert.ok(fs.existsSync(path.join(uploadsDir, 'photo-png-01.png')));

    // 3. Valider WebP Buffer (RIFF....WEBPVP8 ...)
    const webpBuffer = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
        0x56, 0x50, 0x38, 0x20, 0x18, 0x00, 0x00, 0x00
    ]);
    const webpSha = crypto.createHash('sha256').update(webpBuffer).digest('hex');
    const webpRes = await request(server, '/api/v1/sync/photo-upload', {
        headers: {
            ...paired.headers,
            'X-Photo-Uuid': 'photo-webp-01',
            'X-Sha256': webpSha,
            'X-Entity-Uuid': 'MANGEL-001'
        },
        body: webpBuffer
    });
    assert.equal(webpRes.status, 200, webpRes.text);
    assert.equal(webpRes.json.file_name, 'photo-webp-01.webp');
    assert.ok(fs.existsSync(path.join(uploadsDir, 'photo-webp-01.webp')));

    // 4. Fake-WebP (RIFF....BADP) -> 415 Unsupported Media Type
    const fakeWebp = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x42, 0x41, 0x44, 0x50,
        0x56, 0x50, 0x38, 0x20
    ]);
    const fakeWebpSha = crypto.createHash('sha256').update(fakeWebp).digest('hex');
    const fakeWebpRes = await request(server, '/api/v1/sync/photo-upload', {
        headers: {
            ...paired.headers,
            'X-Photo-Uuid': 'fake-webp',
            'X-Sha256': fakeWebpSha,
            'X-Entity-Uuid': 'MANGEL-001'
        },
        body: fakeWebp
    });
    assert.equal(fakeWebpRes.status, 415, 'Fake WebP muss mit 415 abgewiesen werden');
    assert.equal(fs.existsSync(path.join(uploadsDir, 'fake-webp.webp')), false);

    // 5. Reine Textdatei / Script (Fake Payload) -> 415 Unsupported Media Type
    const scriptBuffer = Buffer.from('<?php echo "evil"; ?><h1>Hello World</h1>');
    const scriptSha = crypto.createHash('sha256').update(scriptBuffer).digest('hex');
    const scriptRes = await request(server, '/api/v1/sync/photo-upload', {
        headers: {
            ...paired.headers,
            'X-Photo-Uuid': 'fake-script',
            'X-Sha256': scriptSha,
            'X-Entity-Uuid': 'MANGEL-001'
        },
        body: scriptBuffer
    });
    assert.equal(scriptRes.status, 415, 'Skripte/HTML müssen mit 415 abgewiesen werden');
    assert.equal(fs.existsSync(path.join(uploadsDir, 'fake-script.webp')), false);

    // 6. DB-Integrität: Nur die 3 validen Fotos wurden in maengel_fotos eingetragen
    const count = db.prepare('SELECT COUNT(*) AS c FROM maengel_fotos').get().c;
    assert.equal(count, 3, 'Nur 3 gültige Fotos dürfen in der DB persistiert werden');
});
