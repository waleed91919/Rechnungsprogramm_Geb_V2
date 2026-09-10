/**
 * main/sync-server.js - Lokaler Peer-to-Peer Sync Server (HTTP/HTTPS, WebSocket & SSE) im Electron Prozess
 * Zero Dependencies (Node.js nativ): Verarbeitet Push/Pull-Sync-Batches, wickelt Pairing ab,
 * sichert Transaktionen in SQLite und stellt statische PWA-Dateien für mobile Baustellenbegleiter bereit.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const net = require('net');

const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const PAIRING_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_SESSIONS = 100;
const MAX_PAIRING_TOKENS = 32;
const PUBLIC_CONTROLLERS = new Set([
    '/controllers/ZeiterfassungController.js',
    '/controllers/BautagebuchMobileController.js',
    '/controllers/MaengelController.js'
]);

function httpError(statusCode, message) {
    return Object.assign(new Error(message), { statusCode });
}

function positiveLimit(value, fallback) {
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function isLoopback(host) {
    if (net.isIP(host) === 4) return host.startsWith('127.');
    return net.isIP(host) === 6 && new URL(`http://[${host}]`).hostname === '[::1]';
}

function urlHost(host) {
    return net.isIP(host) === 6 ? `[${host}]` : host;
}

function isContained(root, candidate) {
    const relative = path.relative(root, candidate);
    return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

const ZeiterfassungController = require('../controllers/ZeiterfassungController');
const BautagebuchMobileController = require('../controllers/BautagebuchMobileController');

class SyncServer {
    /**
     * @param {Object} db - Aktive better-sqlite3 Instanz
     * @param {Object} auditLogger - Audit-Logger Instanz
     * @param {Object} options - { port, host, pwaDir, uploadsDir, sslKeyPath, sslCertPath, useTls,
     *                            allowedOrigins, sessionTtlMs, maxJsonBytes, maxPhotoBytes }
     */
    constructor(db, auditLogger = null, options = {}) {
        this.db = db;
        this.auditLogger = auditLogger;
        this.basePort = options.port ?? 38400;
        this.port = this.basePort;
        this.host = options.host ?? '127.0.0.1';
        this.pwaDir = options.pwaDir || path.join(__dirname, '..', 'pwa');
        this.uploadsDir = options.uploadsDir || path.join(process.cwd(), 'uploads', 'photos');
        this.useTls = Boolean(options.useTls);
        this.sslKeyPath = options.sslKeyPath || null;
        this.sslCertPath = options.sslCertPath || null;
        this.sessionTtlMs = Math.min(positiveLimit(options.sessionTtlMs, SESSION_TTL_MS), SESSION_TTL_MS);
        this.maxJsonBytes = positiveLimit(options.maxJsonBytes, 1024 * 1024);
        this.maxPhotoBytes = positiveLimit(options.maxPhotoBytes, 10 * 1024 * 1024);
        this.allowedOrigins = new Set(Array.isArray(options.allowedOrigins)
            ? options.allowedOrigins.filter(origin => typeof origin === 'string' && origin !== 'null' && /^https?:\/\//.test(origin))
            : []);

        this.server = null;
        this.isRunning = false;
        this.activeSockets = new Set(); // WebSocket Sockets
        this.sseClients = new Set();    // SSE Response Streams
        this.httpSockets = new Set();
        this.pairingTokens = new Map(); // SHA-256 token -> { validUntil }
        this.sessions = new Map();      // SHA-256 token -> identity, expiry, channels
        this.pairAttempts = new Map();
        this.globalPairAttempts = { startedAt: Date.now(), count: 0 };
        this.pendingUploads = new Set();
        this.advertisedHost = null;
    }

    /**
     * Ermittelt die primäre lokale IPv4-Adresse im WLAN/LAN.
     */
    static getLocalIpAddress() {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
        return '127.0.0.1';
    }

    /**
     * Startet den internen HTTP/HTTPS und WebSocket-Server mit Port-Fallback (38400-38410).
     */
    async start() {
        if (this.isRunning) return { success: true, ...this.getServerInfo() };
        if (!Number.isInteger(this.basePort) || this.basePort < 0 || this.basePort > 65535) {
            throw new Error('Ungültiger Sync-Port.');
        }
        if (typeof this.host !== 'string' || (!net.isIP(this.host) && !/^[A-Za-z0-9.-]+$/.test(this.host))) {
            throw new Error('Ungültiger Sync-Host.');
        }
        if (!this.useTls && !isLoopback(this.host)) {
            throw new Error('HTTP ist nur an einer literalen Loopback-Adresse erlaubt; LAN benötigt TLS.');
        }
        if (this.useTls && (!this.sslKeyPath || !this.sslCertPath)) {
            throw new Error('TLS benötigt einen gültigen Schlüssel und ein Zertifikat; kein HTTP-Fallback.');
        }

        let currentPort = this.basePort;
        const maxPort = this.basePort === 0 ? 0 : Math.min(this.basePort + 10, 65535);

        while (currentPort <= maxPort) {
            try {
                await this._listenOnPort(currentPort);
                this.port = this.server.address().port;
                const address = this.server.address().address;
                this.advertisedHost = address === '0.0.0.0' || address === '::'
                    ? SyncServer.getLocalIpAddress() : address;
                this.isRunning = true;
                break;
            } catch (err) {
                if (err.code === 'EADDRINUSE') {
                    console.warn(`[SyncServer] Port ${currentPort} belegt, teste ${currentPort + 1}...`);
                    currentPort++;
                } else {
                    throw err;
                }
            }
        }

        if (!this.isRunning) {
            throw new Error(`[SyncServer] Kein freier Port im Bereich ${this.basePort}-${maxPort} gefunden.`);
        }

        console.log(`[SyncServer] W-Link Sync Hub läuft auf ${this.getServerInfo().serverUrl}`);
        return { success: true, ...this.getServerInfo() };
    }

    getServerInfo() {
        const localIp = this.advertisedHost || ((this.host === '0.0.0.0' || this.host === '::')
            ? SyncServer.getLocalIpAddress() : this.host);
        const authority = `${urlHost(localIp)}:${this.port}`;
        return {
            isRunning: this.isRunning,
            port: this.port,
            serverUrl: `${this.useTls ? 'https' : 'http'}://${authority}`,
            wsUrl: `${this.useTls ? 'wss' : 'ws'}://${authority}/ws`,
            localIp,
            host: this.host,
            useTls: this.useTls
        };
    }

    _listenOnPort(portToTry) {
        return new Promise((resolve, reject) => {
            let s;
            if (this.useTls) {
                const options = {
                    key: fs.readFileSync(this.sslKeyPath),
                    cert: fs.readFileSync(this.sslCertPath),
                    minVersion: 'TLSv1.2'
                };
                const certificate = new crypto.X509Certificate(options.cert);
                const now = Date.now();
                if (Date.parse(certificate.validFrom) > now || Date.parse(certificate.validTo) <= now
                    || !certificate.checkPrivateKey(crypto.createPrivateKey(options.key))) {
                    throw new Error('TLS-Zertifikat ist abgelaufen, noch nicht gültig oder passt nicht zum Schlüssel.');
                }
                s = https.createServer(options, (req, res) => this.handleHttpRequest(req, res));
            } else {
                s = http.createServer((req, res) => this.handleHttpRequest(req, res));
            }

            // Zero-Dependency RFC 6455 WebSocket Upgrade Handler
            s.on('upgrade', (req, socket, head) => {
                this.handleWsUpgrade(req, socket, head);
            });
            s.on('connection', socket => {
                this.httpSockets.add(socket);
                socket.on('close', () => this.httpSockets.delete(socket));
            });
            s.requestTimeout = 30000;
            s.headersTimeout = 15000;
            s.keepAliveTimeout = 5000;
            s.maxHeadersCount = 100;

            s.once('error', (err) => {
                reject(err);
            });

            s.listen(portToTry, this.host, () => {
                this.server = s;
                resolve();
            });
        });
    }

    /**
     * Beendet den Server und trennt alle Verbindungen.
     */
    async stop() {
        this.isRunning = false;
        this.pairingTokens.clear();
        this.pairAttempts.clear();
        this.globalPairAttempts = { startedAt: Date.now(), count: 0 };
        for (const key of this.sessions.keys()) this.revokeSession(key);
        for (const socket of this.activeSockets) socket.destroy();
        for (const res of this.sseClients) res.end();
        this.activeSockets.clear();
        this.sseClients.clear();
        const server = this.server;
        this.server = null;
        const closed = server ? new Promise(resolve => server.close(resolve)) : Promise.resolve();
        for (const socket of this.httpSockets) socket.destroy();
        this.httpSockets.clear();
        await Promise.all([closed, ...this.pendingUploads]);
        return { success: true };
    }

    /**
     * Generiert einen flüchtigen Pairing-Token für den QR-Code.
     */
    createPairingToken() {
        this.pruneSecurityState();
        while (this.pairingTokens.size >= MAX_PAIRING_TOKENS) {
            this.pairingTokens.delete(this.pairingTokens.keys().next().value);
        }
        const token = crypto.randomBytes(32).toString('base64url');
        this.pairingTokens.set(hashToken(token), { validUntil: Date.now() + PAIRING_TTL_MS });
        return token;
    }

    /**
     * Erzeugt das vollständige QR-Code-Payload-Objekt zur mobilen Kopplung.
     */
    getPairingPayload() {
        const token = this.createPairingToken();
        const info = this.getServerInfo();

        return {
            app: 'W-LINK-ERP',
            version: '1.2.0',
            server_url: info.serverUrl,
            ws_url: info.wsUrl,
            hub_name: 'W-Link ERP Hauptzentrale',
            pairing_token: token,
            valid_until: new Date(this.pairingTokens.get(hashToken(token)).validUntil).toISOString()
        };
    }

    pruneSecurityState() {
        const now = Date.now();
        for (const [key, value] of this.pairingTokens) {
            if (value.validUntil <= now) this.pairingTokens.delete(key);
        }
        for (const [key, session] of this.sessions) {
            if (session.expiresAt <= now) this.revokeSession(key);
        }
        for (const [key, attempt] of this.pairAttempts) {
            if (now - attempt.startedAt >= 60000) this.pairAttempts.delete(key);
        }
    }

    revokeSession(key) {
        const session = this.sessions.get(key);
        if (!session) return;
        this.sessions.delete(key);
        clearTimeout(session.timer);
        for (const channel of session.channels) {
            this.activeSockets.delete(channel);
            this.sseClients.delete(channel);
            if (typeof channel.destroy === 'function') channel.destroy();
            else channel.end();
        }
        session.channels.clear();
    }

    assertSession(session) {
        if (!session || this.sessions.get(session.key) !== session || session.expiresAt <= Date.now()) {
            if (session) this.revokeSession(session.key);
            throw httpError(401, 'Sitzung ungültig oder abgelaufen.');
        }
    }

    authenticate(req) {
        this.pruneSecurityState();
        const authorization = req.headers.authorization;
        const deviceId = req.headers['x-device-id'];
        const match = typeof authorization === 'string' && /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization);
        if (!match || typeof deviceId !== 'string' || !SAFE_ID.test(deviceId)) {
            throw httpError(401, 'Bearer-Token und X-Device-Id erforderlich.');
        }
        const session = this.sessions.get(hashToken(match[1]));
        this.assertSession(session);
        if (session.deviceId !== deviceId) throw httpError(403, 'Geräteidentität stimmt nicht überein.');
        return session;
    }

    checkPairRate(req) {
        this.pruneSecurityState();
        const now = Date.now();
        if (now - this.globalPairAttempts.startedAt >= 60000) {
            this.globalPairAttempts = { startedAt: now, count: 0 };
        }
        // Bound both per-address storage and aggregate requests; forwarded IP headers are not trusted.
        if (++this.globalPairAttempts.count > 100) throw httpError(429, 'Zu viele Pairing-Versuche.');
        const address = req.socket.remoteAddress || 'unknown';
        let attempt = this.pairAttempts.get(address);
        if (!attempt) {
            if (this.pairAttempts.size >= 256) throw httpError(429, 'Zu viele Pairing-Versuche.');
            attempt = { startedAt: now, count: 0 };
            this.pairAttempts.set(address, attempt);
        }
        if (++attempt.count > 10) throw httpError(429, 'Zu viele Pairing-Versuche.');
    }

    validateRequestBoundary(req, res = null) {
        const info = this.getServerInfo();
        const hosts = new Set([new URL(info.serverUrl).host.toLowerCase()]);
        if (this.host !== '0.0.0.0' && this.host !== '::') hosts.add(`${urlHost(this.host)}:${this.port}`.toLowerCase());
        if (isLoopback(this.advertisedHost || this.host)) {
            hosts.add(`localhost:${this.port}`);
            hosts.add(`127.0.0.1:${this.port}`);
            hosts.add(`[::1]:${this.port}`);
        }
        const host = req.headers.host;
        if (typeof host !== 'string' || !hosts.has(host.toLowerCase())) {
            throw httpError(403, 'Host nicht erlaubt.');
        }
        const origin = req.headers.origin;
        const sameOrigins = new Set([...hosts].map(validHost => `${this.useTls ? 'https' : 'http'}://${validHost}`));
        if (origin !== undefined && (origin === 'null' || (!sameOrigins.has(origin) && !this.allowedOrigins.has(origin)))) {
            throw httpError(403, 'Origin nicht erlaubt.');
        }
        if (res) {
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('Referrer-Policy', 'no-referrer');
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('Vary', 'Origin');
            if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Device-Id, X-Photo-Uuid, X-Entity-Type, X-Entity-Uuid, X-Sha256');
        }
        // Do not let URL normalization hide traversal or credentials in query strings.
        if (!req.url.startsWith('/') || req.url.startsWith('//')) throw httpError(400, 'Ungültiger Request-Pfad.');
        let pathname;
        try { pathname = decodeURIComponent(req.url.split('?')[0]); }
        catch (_e) { throw httpError(400, 'Ungültiger Request-Pfad.'); }
        if (pathname.includes('\\') || /[\x00-\x1f\x7f]/.test(pathname) || pathname.split('/').some(part => part === '..' || part === '.')) {
            throw httpError(403, 'Request-Pfad nicht erlaubt.');
        }
        const url = new URL(req.url, info.serverUrl);
        for (const key of url.searchParams.keys()) {
            if (/token|authorization/i.test(key)) throw httpError(400, 'Tokens in URLs sind nicht erlaubt.');
        }
        return pathname;
    }

    bindBodyIdentity(body, session) {
        this.assertSession(session);
        if (body.device_id !== undefined && body.device_id !== session.deviceId) {
            throw httpError(403, 'Geräteidentität stimmt nicht überein.');
        }
        body.device_id = session.deviceId;
        if (body.mutations !== undefined) {
            if (!Array.isArray(body.mutations)) throw httpError(400, 'Mutations array required');
            if (body.mutations.length > 50) throw httpError(413, 'Maximal 50 Mutationen pro Batch.');
            // Validate the entire batch before any database side effects.
            for (const mutation of body.mutations) {
                if (!mutation || typeof mutation !== 'object' || Array.isArray(mutation)) throw httpError(400, 'Ungültige Mutation.');
                let payload = mutation.payload ?? {};
                if (typeof payload === 'string') {
                    try { payload = JSON.parse(payload); }
                    catch (_e) { throw httpError(400, 'Ungültiges Mutations-JSON.'); }
                }
                if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw httpError(400, 'Ungültige Mutation.');
                // Older offline controllers used their own IDs. Normalize these to the session;
                // the explicit batch device_id still has to match and cannot impersonate a peer.
                mutation.device_id = session.deviceId;
                mutation.payload = { ...payload, device_id: session.deviceId };
            }
        }
        return body;
    }

    /**
     * Behandelt nativen RFC 6455 WebSocket-Handshake ohne externe Abhängigkeiten.
     */
    handleWsUpgrade(req, socket, head) {
        let session;
        try {
            const pathname = this.validateRequestBoundary(req);
            session = this.authenticate(req);
            if (pathname !== '/ws' || req.method !== 'GET') throw httpError(404, 'WebSocket-Pfad nicht gefunden.');
            if (session.channels.size >= 8) throw httpError(429, 'Zu viele offene Streams.');
        } catch (err) {
            const status = err.statusCode || 400;
            socket.end(`HTTP/1.1 ${status} ${http.STATUS_CODES[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
            return;
        }
        const key = req.headers['sec-websocket-key'];
        if (typeof key !== 'string' || !/^[A-Za-z0-9+/]{22}==$/.test(key)
            || req.headers['sec-websocket-version'] !== '13' || req.headers.upgrade?.toLowerCase() !== 'websocket') {
            socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
            return;
        }

        const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
        const acceptKey = crypto.createHash('sha1').update(key + GUID).digest('base64');

        const headers = [
            'HTTP/1.1 101 Switching Protocols',
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Accept: ${acceptKey}`
        ];

        socket.write(headers.concat('\r\n').join('\r\n'));
        socket.syncSession = session;
        socket.syncBuffer = Buffer.alloc(0);
        this.activeSockets.add(socket);
        session.channels.add(socket);

        socket.on('data', (buffer) => {
            this.handleWsFrame(socket, buffer);
        });

        socket.on('close', () => {
            this.activeSockets.delete(socket);
            session.channels.delete(socket);
        });

        socket.on('error', () => {
            this.activeSockets.delete(socket);
            session.channels.delete(socket);
        });

        // Begrüßungsnachricht senden
        this.sendWsMessage(socket, {
            type: 'WELCOME',
            app: 'W-Link ERP Sync Hub',
            serverTime: new Date().toISOString()
        });
        if (head.length) this.handleWsFrame(socket, head);
    }

    /**
     * Parst eingehende RFC 6455 Frames.
     */
    handleWsFrame(socket, buffer) {
        try { this.assertSession(socket.syncSession); }
        catch (_e) { socket.destroy(); return; }
        if (socket.syncBuffer.length + buffer.length > 65536) {
            socket.destroy();
            return;
        }
        buffer = Buffer.concat([socket.syncBuffer, buffer]);
        while (buffer.length >= 2) {
            const opcode = buffer[0] & 0x0f;
            // Only complete masked text/control frames are supported, with a bounded accumulator.
            if (!(buffer[0] & 0x80) || (buffer[0] & 0x70) || !(buffer[1] & 0x80) || ![1, 8, 9, 10].includes(opcode)) {
                socket.destroy();
                return;
            }
            let length = buffer[1] & 0x7f;
            let offset = 2;
            if ((opcode >= 8 && length > 125) || length === 127) { socket.destroy(); return; }
            if (length === 126) {
                if (buffer.length < 4) break;
                length = buffer.readUInt16BE(2);
                offset = 4;
            }
            if (length + offset + 4 > 65536) { socket.destroy(); return; }
            if (buffer.length < offset + 4 + length) break;
            const mask = buffer.subarray(offset, offset + 4);
            offset += 4;
            const payload = Buffer.from(buffer.subarray(offset, offset + length));
            for (let i = 0; i < length; i++) payload[i] ^= mask[i % 4];
            buffer = buffer.subarray(offset + length);
            if (opcode === 8) { socket.end(); return; }
            if (opcode === 9) {
                socket.write(Buffer.concat([Buffer.from([0x8a, length]), payload]));
                continue;
            }
            try {
                const data = JSON.parse(payload.toString('utf-8'));
                if (opcode === 1 && data.type === 'PING') {
                    this.sendWsMessage(socket, { type: 'PONG', time: new Date().toISOString() });
                }
            } catch (_e) { /* ignore */ }
        }
        socket.syncBuffer = Buffer.from(buffer);
    }

    /**
     * Sendet Text-Frame an einen WebSocket.
     */
    sendWsMessage(socket, obj) {
        try {
            this.assertSession(socket.syncSession);
            if (socket.destroyed || socket.writableLength > 1024 * 1024) {
                socket.destroy();
                return;
            }
            const text = JSON.stringify(obj);
            const payload = Buffer.from(text, 'utf-8');
            let header;
            if (payload.length <= 125) {
                header = Buffer.from([0x81, payload.length]);
            } else if (payload.length <= 65535) {
                header = Buffer.alloc(4);
                header[0] = 0x81;
                header[1] = 126;
                header.writeUInt16BE(payload.length, 2);
            } else {
                header = Buffer.alloc(10);
                header[0] = 0x81;
                header[1] = 127;
                header.writeBigUInt64BE(BigInt(payload.length), 2);
            }
            socket.write(Buffer.concat([header, payload]));
        } catch (_e) { /* ignore */ }
    }

    /**
     * Sendet Broadcast-Nachricht an alle verbundenen WebSockets und SSE-Streams.
     */
    broadcast(messageObj) {
        this.pruneSecurityState();
        for (const socket of this.activeSockets) {
            this.sendWsMessage(socket, messageObj);
        }

        const sseData = `data: ${JSON.stringify(messageObj)}\n\n`;
        for (const res of this.sseClients) {
            try {
                this.assertSession(res.syncSession);
                if (res.destroyed || res.writableLength > 1024 * 1024) res.destroy();
                else res.write(sseData);
            } catch (_e) { res.destroy(); }
        }
    }

    /**
     * Zentraler HTTP-Router für REST-Sync & PWA Static Files.
     */
    async handleHttpRequest(req, res) {
        try {
            const pathname = this.validateRequestBoundary(req, res);
            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                return res.end();
            }
            const route = pathname.replace(/^\/api\/sync\//, '/api/v1/sync/');
            // 1. Healthcheck / Discovery
            if ((route === '/api/v1/sync/ping' || route === '/api/v1/sync/info') && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({
                    status: 'OK',
                    app: 'W-Link ERP',
                    version: '1.2.0',
                    serverTime: new Date().toISOString(),
                    connectedClients: this.activeSockets.size + this.sseClients.size
                }));
            }

            // 2. Pairing Endpunkt
            if (route === '/api/v1/sync/pair' && req.method === 'POST') {
                this.checkPairRate(req);
                const body = await this.readJsonBody(req);
                return this.handlePairing(body, res);
            }

            // Authenticate before reading a body, accessing the DB or opening files, for every alias/method.
            if (route.startsWith('/api/v1/sync/')) req.syncSession = this.authenticate(req);
            // 3. Push-Sync (Outbox Mutations)
            if (route === '/api/v1/sync/push' && req.method === 'POST') {
                const body = this.bindBodyIdentity(await this.readJsonBody(req), req.syncSession);
                return this.handlePushSync(body, res);
            }

            // 4. Pull-Sync (Delta Data)
            if (route === '/api/v1/sync/pull' && req.method === 'POST') {
                const body = this.bindBodyIdentity(await this.readJsonBody(req), req.syncSession);
                return this.handlePullSync(body, res);
            }

            if (route === '/api/v1/sync/unpair' && req.method === 'POST') {
                this.bindBodyIdentity(await this.readJsonBody(req), req.syncSession);
                this.revokeSession(req.syncSession.key);
                return this.sendJson(res, 200, { status: 'UNPAIRED', device_id: req.syncSession.deviceId });
            }
            // 5. Large-Blob Streaming Foto-Upload
            if ((route === '/api/v1/sync/photo-upload' || route === '/api/v1/sync/upload-photo') && req.method === 'POST') {
                const upload = this.handlePhotoUpload(req, res);
                // Keep a non-rejecting cleanup promise so stop() waits for staged files to disappear.
                const cleanup = upload.catch(() => {});
                this.pendingUploads.add(cleanup);
                try { return await upload; }
                finally { this.pendingUploads.delete(cleanup); }
            }

            // 6. SSE Event Stream Fallback
            if (route === '/api/v1/sync/events' && req.method === 'GET') {
                if (req.syncSession.channels.size >= 8) throw httpError(429, 'Zu viele offene Streams.');
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                });
                res.write('retry: 10000\n\n');
                res.syncSession = req.syncSession;
                req.syncSession.channels.add(res);
                this.sseClients.add(res);
                res.on('close', () => {
                    this.sseClients.delete(res);
                    req.syncSession.channels.delete(res);
                });
                return;
            }

            // 7. Statische PWA-Dateien ausliefern
            if (route.startsWith('/api/')) throw httpError(404, 'Endpunkt nicht gefunden.');
            if (req.method !== 'GET' && req.method !== 'HEAD') throw httpError(405, 'Methode nicht erlaubt.');
            return await this.serveStaticPwaFile(pathname, res, req.method === 'HEAD');

        } catch (err) {
            // Do not log request bodies, credentials, or expose internal paths/SQL to remote clients.
            if (!res.headersSent && !req.complete) {
                res.setHeader('Connection', 'close');
                req.resume();
            }
            if (!res.headersSent && err.statusCode === 429) res.setHeader('Retry-After', '60');
            this.sendJson(res, err.statusCode || 500, {
                error: err.statusCode ? err.message : 'Interner Sync-Fehler.'
            });
        }
    }

    sendJson(res, statusCode, body) {
        if (res.destroyed || res.writableEnded) return;
        if (res.headersSent) { res.destroy(); return; }
        res.writeHead(statusCode, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(body));
    }

    /**
     * Prüft Pairing Token und bestätigt Registrierung.
     */
    handlePairing(body = {}, res) {
        if (!this.isRunning) throw httpError(503, 'Sync-Server ist gestoppt.');
        const { pairing_token, device_id } = body;

        if (typeof device_id !== 'string' || !SAFE_ID.test(device_id)) throw httpError(400, 'Ungültige Geräte-ID.');
        if (typeof pairing_token !== 'string' || !TOKEN.test(pairing_token)) throw httpError(400, 'Ungültiges Pairing-Token-Format.');
        this.pruneSecurityState();
        const tokenKey = hashToken(pairing_token);
        const tokenData = this.pairingTokens.get(tokenKey);
        if (!tokenData || tokenData.validUntil <= Date.now()) throw httpError(403, 'Ungültiger oder abgelaufener Pairing-Token.');
        // Consume before creating a session: replay and concurrent redemption cannot succeed.
        this.pairingTokens.delete(tokenKey);
        while (this.sessions.size >= MAX_SESSIONS) this.revokeSession(this.sessions.keys().next().value);
        const accessToken = crypto.randomBytes(32).toString('base64url');
        const key = hashToken(accessToken);
        const session = { key, deviceId: device_id, expiresAt: Date.now() + this.sessionTtlMs, channels: new Set() };
        session.timer = setTimeout(() => this.revokeSession(key), this.sessionTtlMs);
        session.timer.unref();
        this.sessions.set(key, session);
        this.sendJson(res, 200, {
            status: 'PAIRED',
            device_id,
            access_token: accessToken,
            expires_at: new Date(session.expiresAt).toISOString(),
            server_time: new Date().toISOString(),
            hub_name: 'W-Link ERP Hauptzentrale'
        });
    }

    /**
     * Verarbeitet eingehende Push-Mutations-Batches von der mobilen PWA.
     */
    handlePushSync(body = {}, res) {
        const { device_id = 'MOBILE_PWA', mutations = [] } = body;
        if (!Array.isArray(mutations)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Mutations array required' }));
        }

        const ackedUuids = [];
        const conflicts = [];

        const syncTx = this.db.transaction(() => {
            const checkMutationStmt = this.db.prepare('SELECT id FROM sync_processed_mutations WHERE mutation_uuid = ?');
            const recordMutationStmt = this.db.prepare(`
                INSERT INTO sync_processed_mutations (mutation_uuid, device_id, entity_type, entity_uuid, created_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);

            for (const mut of mutations) {
                if (!mut || !mut.uuid) continue;

                // 1. Idempotenz-Prüfung: Bereits verarbeitet?
                const existing = checkMutationStmt.get(mut.uuid);
                if (existing) {
                    ackedUuids.push(mut.uuid);
                    continue;
                }

                // 2. Fachentität verarbeiten & Konflikte abfangen
                try {
                    const conflictInfo = this.applyEntityMutation(mut, device_id);
                    if (conflictInfo && conflictInfo.conflict) {
                        conflicts.push(conflictInfo);
                        recordMutationStmt.run(mut.uuid, device_id, mut.entity_type, mut.entity_uuid);
                        ackedUuids.push(mut.uuid);
                    } else {
                        recordMutationStmt.run(mut.uuid, device_id, mut.entity_type, mut.entity_uuid);
                        ackedUuids.push(mut.uuid);
                    }
                } catch (_mutationErr) {
                    conflicts.push({ uuid: mut.uuid, error: 'Mutation konnte nicht verarbeitet werden.' });
                }
            }
        });

        syncTx();

        // WebSocket & SSE Broadcast über neue Daten
        if (ackedUuids.length > 0) {
            this.broadcast({
                type: 'SYNC_UPDATE',
                count: ackedUuids.length,
                device_id
            });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'SUCCESS',
            acked_uuids: ackedUuids,
            conflicts,
            server_time: new Date().toISOString()
        }));
    }

    /**
     * Schreibt eine mobile Mutation in die SQLite-Hauptdatenbank oder leitet sie bei Konflikten in Quarantäne.
     */
    applyEntityMutation(mut, deviceId) {
        const { entity_type, mutation_type, entity_uuid, payload, lamport_timestamp } = mut;
        const data = typeof payload === 'string' ? JSON.parse(payload) : (payload || {});
        data.uuid = data.uuid || entity_uuid || mut.uuid;
        data.device_id = deviceId;

        if (entity_type === 'ZEITERFASSUNG') {
            const serverRecord = this.db.prepare('SELECT * FROM zeiterfassung WHERE uuid = ?').get(data.uuid);
            if (serverRecord && (serverRecord.status === 'FREIGEGEBEN' || serverRecord.status === 'ABGERECHNET')) {
                this.quarantineConflict('ZEITERFASSUNG', data.uuid, deviceId, serverRecord, data, 'GoBD-Status FREIGEGEBEN/ABGERECHNET auf dem Server hat Vorrang.');
                return { conflict: true, reason: 'GoBD-geschützt', uuid: mut.uuid };
            }

            ZeiterfassungController.saveZeiteintrag(this.db, data, this.auditLogger);
            return { conflict: false };

        } else if (entity_type === 'BAUTAGEBUCH') {
            const serverBt = this.db.prepare('SELECT * FROM bautagebuch WHERE uuid = ?').get(data.uuid);
            if (serverBt && serverBt.unterzeichnet_bauleiter === 1 && !data.unterzeichnet_polier) {
                this.quarantineConflict('BAUTAGEBUCH', data.uuid, deviceId, serverBt, data, 'Bauleiter-Signatur auf dem Server vorhanden.');
                return { conflict: true, reason: 'Bauleiter-Signatur vorhanden', uuid: mut.uuid };
            }

            const upsertBtStmt = this.db.prepare(`
                INSERT INTO bautagebuch (
                    uuid, project_id, datum, wetter, temperatur_min, temperatur_max,
                    personal_eigen_anzahl, personal_eigen_stunden, personal_sub_json, geraete_json,
                    tagesbericht, vorkommnisse_behinderungen, fotos_json, created_at
                ) VALUES (
                    @uuid, @project_id, @datum, @wetter, @temperatur_min, @temperatur_max,
                    @personal_eigen_anzahl, @personal_eigen_stunden, @personal_sub_json, @geraete_json,
                    @tagesbericht, @vorkommnisse_behinderungen, @fotos_json, @created_at
                ) ON CONFLICT(uuid) DO UPDATE SET
                    tagesbericht = excluded.tagesbericht,
                    vorkommnisse_behinderungen = excluded.vorkommnisse_behinderungen,
                    fotos_json = excluded.fotos_json,
                    personal_eigen_anzahl = excluded.personal_eigen_anzahl,
                    personal_eigen_stunden = excluded.personal_eigen_stunden
            `);

            upsertBtStmt.run({
                uuid: data.uuid,
                project_id: parseInt(data.projekt_id || data.project_id, 10),
                datum: data.datum,
                wetter: data.wetter || data.wetter_code || 'HEITER',
                temperatur_min: parseFloat(data.temperatur_min) || 0.0,
                temperatur_max: parseFloat(data.temperatur_max) || 0.0,
                personal_eigen_anzahl: parseInt(data.personal_eigen_anzahl, 10) || 0,
                personal_eigen_stunden: parseFloat(data.personal_eigen_stunden) || 0.0,
                personal_sub_json: typeof data.personal_sub_json === 'string' ? data.personal_sub_json : JSON.stringify(data.personal_sub_json || []),
                geraete_json: typeof data.geraete_json === 'string' ? data.geraete_json : JSON.stringify(data.geraete_json || []),
                tagesbericht: data.tagesbericht || '',
                vorkommnisse_behinderungen: data.vorkommnisse || data.vorkommnisse_behinderungen || '',
                fotos_json: typeof data.fotos_json === 'string' ? data.fotos_json : JSON.stringify(data.fotos_json || []),
                created_at: data.created_at || new Date().toISOString()
            });

            return { conflict: false };

        } else if (entity_type === 'VOB_MELDUNG' || entity_type === 'BEDENKEN_BEHINDERUNGEN') {
            BautagebuchMobileController.saveVobMeldung(this.db, data, this.auditLogger);
            return { conflict: false };

        } else if (entity_type === 'AUFMASS_ZEILE' || entity_type === 'AUFMASS') {
            const stmt = this.db.prepare(`
                INSERT INTO aufmass_zeilen (
                    uuid, blatt_id, oz_code, zeilen_nr, bezeichnung, formel_reb, formel_code, rechenansatz, ergebnis, einheit, raum_id
                ) VALUES (
                    @uuid, @blatt_id, @oz_code, @zeilen_nr, @bezeichnung, @formel_code, @formel_code, @rechenansatz, @ergebnis, @einheit, @raum_id
                ) ON CONFLICT(uuid) DO UPDATE SET
                    rechenansatz = excluded.rechenansatz,
                    ergebnis = excluded.ergebnis
            `);
            stmt.run({
                uuid: data.uuid,
                blatt_id: data.blatt_id || 1,
                oz_code: data.oz || data.oz_code || '01.01.001',
                zeilen_nr: data.zeilen_nr || 1,
                bezeichnung: data.bezeichnung || '',
                formel_code: data.formel_code || '91',
                rechenansatz: data.rechenansatz || `${data.ergebnis || 0}=`,
                ergebnis: parseFloat(data.ergebnis) || 0.0,
                einheit: data.einheit || 'm²',
                raum_id: data.raum_id || null
            });
            return { conflict: false };

        } else if (entity_type === 'MAENGEL' || entity_type === 'MANGEL') {
            const stmt = this.db.prepare(`
                INSERT INTO maengel (
                    uuid, projekt_id, plan_id, mangel_nr, x_pct, y_pct, titel, beschreibung, status, frist_datum, created_at
                ) VALUES (
                    @uuid, @projekt_id, @plan_id, @mangel_nr, @x_pct, @y_pct, @titel, @beschreibung, @status, @frist_datum, @created_at
                ) ON CONFLICT(uuid) DO UPDATE SET
                    status = excluded.status,
                    titel = excluded.titel
            `);
            stmt.run({
                uuid: data.uuid,
                projekt_id: parseInt(data.projekt_id, 10) || 1,
                plan_id: data.plan_id || null,
                mangel_nr: data.mangel_nr || 'M-001',
                x_pct: parseFloat(data.x_pct) || 0.0,
                y_pct: parseFloat(data.y_pct) || 0.0,
                titel: data.titel || 'Mangel',
                beschreibung: data.beschreibung || '',
                status: data.status || 'ERFASST',
                frist_datum: data.frist_datum || null,
                created_at: data.created_at || new Date().toISOString()
            });
            return { conflict: false };

        } else if (entity_type === 'GERAETE_BUCHUNG' || entity_type === 'GERAET') {
            const stmt = this.db.prepare(`
                INSERT INTO geraete_buchungen (
                    uuid, projekt_id, geraet_code, datum, betriebsstunden, stillstand_stunden, stillstand_grund, device_id
                ) VALUES (
                    @uuid, @projekt_id, @geraet_code, @datum, @betriebsstunden, @stillstand_stunden, @stillstand_grund, @device_id
                ) ON CONFLICT(uuid) DO UPDATE SET
                    betriebsstunden = excluded.betriebsstunden,
                    stillstand_stunden = excluded.stillstand_stunden,
                    stillstand_grund = excluded.stillstand_grund
            `);
            stmt.run({
                uuid: data.uuid,
                projekt_id: parseInt(data.projekt_id, 10) || 1,
                geraet_code: data.geraet_code || 'GERAET',
                datum: data.datum || new Date().toISOString().split('T')[0],
                betriebsstunden: parseFloat(data.betriebsstunden || data.stunden) || 0.0,
                stillstand_stunden: parseFloat(data.stillstand_stunden) || 0.0,
                stillstand_grund: data.stillstand_grund || null,
                device_id: deviceId
            });
            return { conflict: false };

        } else if (entity_type === 'LIEFERSCHEIN') {
            const stmt = this.db.prepare(`
                INSERT INTO lieferscheine_digital (
                    uuid, projekt_id, lieferant_name, lieferschein_nr, datum, foto_pfad, sha256_hash, status, device_id
                ) VALUES (
                    @uuid, @projekt_id, @lieferant_name, @lieferschein_nr, @datum, @foto_pfad, @sha256_hash, @status, @device_id
                ) ON CONFLICT(uuid) DO UPDATE SET
                    lieferschein_nr = excluded.lieferschein_nr,
                    status = excluded.status
            `);
            stmt.run({
                uuid: data.uuid,
                projekt_id: parseInt(data.projekt_id, 10) || 1,
                lieferant_name: data.lieferant_name || 'Lieferant',
                lieferschein_nr: data.lieferschein_nr || '',
                datum: data.datum || new Date().toISOString().split('T')[0],
                foto_pfad: data.foto_pfad || '',
                sha256_hash: data.sha256_hash || '',
                status: data.status || 'ERFASST',
                device_id: deviceId
            });
            return { conflict: false };
        }

        return { conflict: false };
    }

    /**
     * Isoliert kollidierende Mutationen in der Quarantäne-Tabelle sync_conflicts.
     */
    quarantineConflict(entityType, entityUuid, deviceId, serverData, clientData, reason) {
        const stmt = this.db.prepare(`
            INSERT INTO sync_conflicts (
                entity_type, entity_uuid, client_device_id, server_data_json, client_data_json, conflict_reason, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', CURRENT_TIMESTAMP)
        `);
        stmt.run(
            entityType,
            entityUuid,
            deviceId,
            JSON.stringify(serverData || {}),
            JSON.stringify(clientData || {}),
            reason || 'Inhaltlicher Konflikt'
        );
    }

    /**
     * Sendet Stammdaten-Delta an den mobilen Client.
     */
    handlePullSync(body = {}, res) {
        const projekte = this.db.prepare("SELECT id, name, start, ende, status FROM projekte WHERE status != 'ARCHIVIERT'").all();
        const liegenschaften = this.db.prepare('SELECT id, objekt_nr, name, ort FROM liegenschaften WHERE aktiv = 1').all();
        const mitarbeiter = this.db.prepare('SELECT id, personalnummer, vorname, nachname FROM mitarbeiter WHERE aktiv = 1').all();
        const lvPositionen = this.db.prepare('SELECT id, bereich_id, positionsnr, bezeichnung, menge, menge_einheit FROM lv_positionen').all();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            server_time: new Date().toISOString(),
            data: {
                projekte,
                liegenschaften,
                mitarbeiter,
                lv_positionen: lvPositionen
            }
        }));
    }

    /**
     * Large-Blob Streaming Foto-Upload mit SHA-256 Validierung & Dateispeicherung.
     */
    async handlePhotoUpload(req, res) {
        const photoUuid = req.headers['x-photo-uuid'] || crypto.randomUUID();
        const entityType = req.headers['x-entity-type'] || 'MANGEL';
        const entityUuid = req.headers['x-entity-uuid'] || '';
        const clientSha = req.headers['x-sha256'] || '';
        if (!SAFE_ID.test(photoUuid)) throw httpError(400, 'Ungültige Foto-UUID.');
        if (clientSha && !/^[a-fA-F0-9]{64}$/.test(clientSha)) throw httpError(400, 'Ungültiger SHA-256 Hash.');
        if (!SAFE_ID.test(entityType) || (entityUuid && !SAFE_ID.test(entityUuid))) throw httpError(400, 'Ungültige Foto-Metadaten.');
        if (Number(req.headers['content-length']) > this.maxPhotoBytes) throw httpError(413, 'Foto zu groß.');
        this.assertSession(req.syncSession);
        const configuredRoot = path.resolve(this.uploadsDir);
        await fs.promises.mkdir(configuredRoot, { recursive: true, mode: 0o700 });
        if ((await fs.promises.lstat(configuredRoot)).isSymbolicLink()) throw httpError(403, 'Upload-Verzeichnis nicht erlaubt.');
        const root = await fs.promises.realpath(configuredRoot);
        const fileName = `${photoUuid}.webp`;
        const targetPath = path.join(root, fileName);
        let stageDir;
        let handle;
        let published = false;
        let completed = false;
        let calculatedSha;
        const hash = crypto.createHash('sha256');
        try {
            stageDir = await fs.promises.mkdtemp(path.join(root, '.sync-upload-'));
            const stagePath = path.join(stageDir, 'photo.part');
            handle = await fs.promises.open(stagePath,
                fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
            let bytes = 0;
            // Async iteration supplies backpressure; early limit rejection must not destroy the response socket.
            for await (const chunk of req.iterator({ destroyOnReturn: false })) {
                this.assertSession(req.syncSession);
                bytes += chunk.length;
                if (bytes > this.maxPhotoBytes) throw httpError(413, 'Foto zu groß.');
                hash.update(chunk);
                await handle.writeFile(chunk);
            }
            if (req.aborted || !req.complete) throw httpError(400, 'Upload abgebrochen.');
            calculatedSha = hash.digest('hex');
            if (clientSha && calculatedSha !== clientSha.toLowerCase()) throw httpError(422, 'SHA-256 stimmt nicht überein.');
            await handle.sync();
            await handle.close();
            handle = null;
            this.assertSession(req.syncSession);
            if ((await fs.promises.lstat(configuredRoot)).isSymbolicLink()
                || await fs.promises.realpath(configuredRoot) !== root
                || await fs.promises.realpath(stageDir) !== stageDir) {
                throw httpError(403, 'Upload-Verzeichnis wurde verändert.');
            }
            // Atomic publish without replacement: an existing file, hard link or symlink fails with EEXIST.
            await fs.promises.link(stagePath, targetPath);
            published = true;
            this.assertSession(req.syncSession);
            if (req.aborted || res.destroyed) throw httpError(400, 'Upload abgebrochen.');

            // Preserve optional business linkage, only after the verified file is fully written.
            if (entityType === 'MANGEL' && entityUuid) {
                try {
                    const mangel = this.db.prepare('SELECT id FROM maengelkataster WHERE id = ? OR mangel_nr = ?').get(entityUuid, entityUuid);
                    if (mangel) {
                        this.db.prepare(`
                            INSERT INTO maengel_fotos (mangel_id, dateipfad, aufnahme_datum, typ, kommentar)
                            VALUES (?, ?, CURRENT_TIMESTAMP, 'VOR_NACHBESSERUNG', ?)
                        `).run(mangel.id, targetPath, `Mobil synchronisiert (UUID: ${photoUuid})`);
                    }
                } catch (_e) { /* ignore */ }
            }
            completed = true;
            // Cleanup finishes before acknowledgement, so neither a partial file nor an absolute path escapes.
            await fs.promises.rm(stageDir, { recursive: true, force: true });
            stageDir = null;
            this.sendJson(res, 200, {
                status: 'UPLOADED',
                photo_uuid: photoUuid,
                file_name: fileName,
                filePath: fileName, // legacy property, deliberately relative
                sha256: calculatedSha,
                clientShaMatches: true
            });
        } catch (err) {
            if (err.code === 'EEXIST') {
                let existingHandle;
                try {
                    const targetStat = await fs.promises.lstat(targetPath);
                    if (!targetStat.isFile() || targetStat.isSymbolicLink()) throw httpError(409, 'Foto-UUID bereits vorhanden.');
                    existingHandle = await fs.promises.open(targetPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
                    const openedStat = await existingHandle.stat();
                    if (!openedStat.isFile() || openedStat.size > this.maxPhotoBytes
                        || openedStat.dev !== targetStat.dev || openedStat.ino !== targetStat.ino) {
                        throw httpError(409, 'Foto-UUID bereits vorhanden.');
                    }
                    const existingHash = crypto.createHash('sha256');
                    for await (const chunk of existingHandle.createReadStream({ autoClose: false })) {
                        this.assertSession(req.syncSession);
                        existingHash.update(chunk);
                    }
                    if (existingHash.digest('hex') !== calculatedSha) throw httpError(409, 'Foto-UUID bereits vorhanden.');
                    await existingHandle.close();
                    existingHandle = null;
                    await fs.promises.rm(stageDir, { recursive: true, force: true });
                    stageDir = null;
                    this.assertSession(req.syncSession);
                    completed = true;
                    this.sendJson(res, 200, {
                        status: 'UPLOADED',
                        photo_uuid: photoUuid,
                        file_name: fileName,
                        filePath: fileName,
                        sha256: calculatedSha,
                        clientShaMatches: true
                    });
                    return;
                } finally {
                    if (existingHandle) await existingHandle.close().catch(() => {});
                }
            }
            throw err;
        } finally {
            if (handle) await handle.close().catch(() => {});
            if (published && !completed) await fs.promises.unlink(targetPath).catch(() => {});
            if (stageDir) await fs.promises.rm(stageDir, { recursive: true, force: true });
        }
    }

    /**
     * Liefert statische HTML/JS/CSS-Dateien der PWA an mobile Endgeräte aus.
     */
    async serveStaticPwaFile(pathname, res, headOnly = false) {
        const mimeTypes = {
            '.html': 'text/html; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.webmanifest': 'application/manifest+json; charset=utf-8',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml'
        };
        const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
        if (relativePath.split('/').some(part => part.startsWith('.'))) throw httpError(403, 'Datei nicht erlaubt.');
        const ext = path.extname(relativePath).toLowerCase();
        if (!Object.hasOwn(mimeTypes, ext)) throw httpError(404, 'Datei nicht gefunden.');
        const publicController = PUBLIC_CONTROLLERS.has(pathname);
        if (pathname.startsWith('/controllers/') && !publicController) throw httpError(404, 'Datei nicht gefunden.');
        let file;
        try {
            const repositoryRoot = publicController ? await fs.promises.realpath(path.join(__dirname, '..')) : null;
            const controllerRoot = publicController ? path.join(repositoryRoot, 'controllers') : null;
            const root = await fs.promises.realpath(publicController ? controllerRoot : this.pwaDir);
            if (publicController && root !== controllerRoot) throw httpError(403, 'Datei nicht erlaubt.');
            const candidate = path.resolve(root, publicController ? path.basename(pathname) : relativePath);
            if (!isContained(root, candidate)) throw httpError(403, 'Datei nicht erlaubt.');
            const fullPath = await fs.promises.realpath(candidate);
            if (!isContained(root, fullPath) || (publicController && fullPath !== candidate)) throw httpError(403, 'Datei nicht erlaubt.');
            file = await fs.promises.open(fullPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
            const stat = await file.stat();
            if (!stat.isFile()) throw httpError(404, 'Datei nicht gefunden.');
            res.writeHead(200, { 'Content-Type': mimeTypes[ext], 'Content-Length': stat.size });
            if (headOnly) return res.end();
            const stream = file.createReadStream();
            file = null; // stream owns and closes the descriptor
            stream.on('error', () => res.destroy());
            res.on('close', () => stream.destroy());
            stream.pipe(res);
        } catch (err) {
            if (['ENOENT', 'ENOTDIR'].includes(err.code)) throw httpError(404, 'Datei nicht gefunden.');
            throw err;
        } finally {
            if (file) await file.close();
        }
    }

    readJsonBody(req) {
        if (Number(req.headers['content-length']) > this.maxJsonBytes) return Promise.reject(httpError(413, 'JSON-Body zu groß.'));
        return new Promise((resolve, reject) => {
            const chunks = [];
            let bytes = 0;
            let failed = false;
            const fail = err => {
                if (failed) return;
                failed = true;
                chunks.length = 0;
                reject(err);
            };
            req.on('data', chunk => {
                if (failed) return;
                bytes += chunk.length;
                if (bytes > this.maxJsonBytes) return fail(httpError(413, 'JSON-Body zu groß.'));
                chunks.push(chunk);
            });
            req.on('end', () => {
                if (failed) return;
                try {
                    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Object required');
                    resolve(body);
                } catch (_e) {
                    fail(httpError(400, 'Ungültiges JSON im Request-Body.'));
                }
            });
            req.on('aborted', () => fail(httpError(400, 'Request abgebrochen.')));
            req.on('error', () => fail(httpError(400, 'Request abgebrochen.')));
        });
    }

    // =========================================================================
    // Konflikt-Schlichtungsmethoden für das Desktop-Center
    // =========================================================================

    getOpenConflicts() {
        return this.db.prepare("SELECT * FROM sync_conflicts WHERE status = 'OPEN' ORDER BY created_at DESC").all();
    }

    resolveConflict(conflictId, resolutionStrategy, mergedData = null) {
        const conflict = this.db.prepare('SELECT * FROM sync_conflicts WHERE id = ?').get(conflictId);
        if (!conflict) throw new Error(`Konflikt #${conflictId} nicht gefunden.`);

        const tx = this.db.transaction(() => {
            if (resolutionStrategy === 'RESOLVED_CLIENT') {
                const clientObj = JSON.parse(conflict.client_data_json || '{}');
                if (conflict.entity_type === 'ZEITERFASSUNG') {
                    ZeiterfassungController.saveZeiteintrag(this.db, clientObj, this.auditLogger);
                }
            } else if (resolutionStrategy === 'RESOLVED_MERGE' && mergedData) {
                if (conflict.entity_type === 'ZEITERFASSUNG') {
                    ZeiterfassungController.saveZeiteintrag(this.db, mergedData, this.auditLogger);
                }
            }

            this.db.prepare(`
                UPDATE sync_conflicts SET status = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?
            `).run(resolutionStrategy, conflictId);
        });

        tx();
        return { success: true, conflictId, resolutionStrategy };
    }
}

module.exports = SyncServer;
