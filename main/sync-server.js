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

const {
    SAFE_ID,
    TOKEN,
    PAIRING_TTL_MS,
    SESSION_TTL_MS,
    MAX_SESSIONS,
    MAX_PAIRING_TOKENS,
    PUBLIC_CONTROLLERS
} = require('./sync/config');

const {
    httpError,
    positiveLimit,
    hashToken,
    isLoopback,
    urlHost,
    isContained,
    getLocalIpAddress
} = require('./sync/utils/helpers');

const { detectImageFormat } = require('./sync/utils/image');
const { readJsonBody } = require('./sync/middleware/body-parser');
const { checkPairRate, validateRequestBoundary } = require('./sync/middleware/security');
const { assertSession, authenticate, bindBodyIdentity } = require('./sync/middleware/auth');

const ZeiterfassungController = require('../controllers/ZeiterfassungController');
const BautagebuchMobileController = require('../controllers/BautagebuchMobileController');
const { handleWsUpgrade, handleWsFrame, sendWsMessage, broadcast } = require("./sync/websocket");
const { handlePhotoUpload } = require("./sync/photo-storage");
const { handlePushSync, handlePullSync, applyEntityMutation, quarantineConflict, getOpenConflicts, resolveConflict } = require("./sync/sync-engine");
const { serveStaticPwaFile } = require("./sync/static-server");
const HybridLogicalClock = require('./hlc');

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
        this.hlc = new HybridLogicalClock('srv-' + (this.port || 'main'));
    }

    /**
     * Ermittelt die primäre lokale IPv4-Adresse im WLAN/LAN.
     */
    static getLocalIpAddress() {
        return getLocalIpAddress();
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
        assertSession(this, session);
    }

    authenticate(req) {
        return authenticate(this, req);
    }

    checkPairRate(req) {
        checkPairRate(this, req);
    }

    validateRequestBoundary(req, res = null) {
        return validateRequestBoundary(this, req, res);
    }

    bindBodyIdentity(body, session) {
        return bindBodyIdentity(this, body, session);
    }

    /**
     * Behandelt nativen RFC 6455 WebSocket-Handshake ohne externe Abhängigkeiten.
     */
    handleWsUpgrade(req, socket, head) {
        return handleWsUpgrade(this, req, socket, head);
    }

    /**
     * Parst eingehende RFC 6455 Frames.
     */
    handleWsFrame(socket, buffer) {
        return handleWsFrame(this, socket, buffer);
    }

    /**
     * Sendet Text-Frame an einen WebSocket.
     */
    sendWsMessage(socket, obj) {
        return sendWsMessage(this, socket, obj);
    }

    /**
     * Sendet Broadcast-Nachricht an alle verbundenen WebSockets und SSE-Streams.
     */
    broadcast(messageObj) {
        return broadcast(this, messageObj);
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
            // 1. Healthcheck / Discovery / Version Handshake
            if (route === '/api/v1/sync/version' && req.method === 'GET') {
                return this.sendJson(res, 200, {
                    app: 'W-Link ERP',
                    appVersion: '1.4.0',
                    schemaVersion: 4,
                    swCacheName: 'wlink-mobile-v1.4.0-build20260911',
                    serverTime: new Date().toISOString()
                });
            }
            if ((route === '/api/v1/sync/ping' || route === '/api/v1/sync/info') && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({
                    status: 'OK',
                    app: 'W-Link ERP',
                    version: '1.4.0',
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
        return handlePushSync(this, body, res);
    }

    /**
     * Schreibt eine mobile Mutation in die SQLite-Hauptdatenbank oder leitet sie bei Konflikten in Quarantäne.
     */
    applyEntityMutation(mut, deviceId) {
        return applyEntityMutation(this, mut, deviceId);
    }

    /**
     * Isoliert kollidierende Mutationen in der Quarantäne-Tabelle sync_conflicts.
     */
    quarantineConflict(entityType, entityUuid, deviceId, serverData, clientData, reason) {
        return quarantineConflict(this, entityType, entityUuid, deviceId, serverData, clientData, reason);
    }

    /**
     * Sendet Stammdaten-Delta an den mobilen Client.
     */
    handlePullSync(body = {}, res) {
        return handlePullSync(this, body, res);
    }

    /**
     * Large-Blob Streaming Foto-Upload mit SHA-256 Validierung & Dateispeicherung.
     */
    async handlePhotoUpload(req, res) {
        return handlePhotoUpload(this, req, res);
    }

    /**
     * Liefert statische HTML/JS/CSS-Dateien der PWA an mobile Endgeräte aus.
     */
    async serveStaticPwaFile(pathname, res, headOnly = false) {
        return serveStaticPwaFile(this, pathname, res, headOnly);
    }

    readJsonBody(req) {
        return readJsonBody(req, this.maxJsonBytes);
    }

    // =========================================================================
    // Konflikt-Schlichtungsmethoden für das Desktop-Center
    // =========================================================================

    getOpenConflicts() {
        return getOpenConflicts(this);
    }

    resolveConflict(conflictId, resolutionStrategy, mergedData = null) {
        return resolveConflict(this, conflictId, resolutionStrategy, mergedData);
    }
}

module.exports = SyncServer;
