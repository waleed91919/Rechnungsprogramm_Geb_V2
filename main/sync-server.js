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

const ZeiterfassungController = require('../controllers/ZeiterfassungController');
const BautagebuchMobileController = require('../controllers/BautagebuchMobileController');

class SyncServer {
    /**
     * @param {Object} db - Aktive better-sqlite3 Instanz
     * @param {Object} auditLogger - Audit-Logger Instanz
     * @param {Object} options - { port: 38400, pwaDir, uploadsDir, sslKeyPath, sslCertPath, useTls }
     */
    constructor(db, auditLogger = null, options = {}) {
        this.db = db;
        this.auditLogger = auditLogger;
        this.basePort = options.port || 38400;
        this.port = this.basePort;
        this.pwaDir = options.pwaDir || path.join(__dirname, '..', 'pwa');
        this.uploadsDir = options.uploadsDir || path.join(process.cwd(), 'uploads', 'photos');
        this.useTls = Boolean(options.useTls);
        this.sslKeyPath = options.sslKeyPath || null;
        this.sslCertPath = options.sslCertPath || null;

        this.server = null;
        this.isRunning = false;
        this.activeSockets = new Set(); // WebSocket Sockets
        this.sseClients = new Set();    // SSE Response Streams
        this.pairingTokens = new Map(); // token -> { createdAt, validUntil, deviceId }

        if (!fs.existsSync(this.uploadsDir)) {
            try {
                fs.mkdirSync(this.uploadsDir, { recursive: true });
            } catch (_e) { /* ignore */ }
        }
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
        if (this.isRunning) return { success: true, port: this.port, ip: SyncServer.getLocalIpAddress() };

        let currentPort = this.basePort;
        const maxPort = this.basePort + 10;

        while (currentPort <= maxPort) {
            try {
                await this._listenOnPort(currentPort);
                this.port = currentPort;
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

        const localIp = SyncServer.getLocalIpAddress();
        const protocol = this.useTls ? 'https' : 'http';
        console.log(`[SyncServer] W-Link Sync Hub läuft auf ${protocol}://${localIp}:${this.port}`);

        return {
            success: true,
            port: this.port,
            localIp,
            serverUrl: `${protocol}://${localIp}:${this.port}`,
            wsUrl: `${this.useTls ? 'wss' : 'ws'}://${localIp}:${this.port}/ws`
        };
    }

    _listenOnPort(portToTry) {
        return new Promise((resolve, reject) => {
            let s;
            if (this.useTls && this.sslKeyPath && this.sslCertPath && fs.existsSync(this.sslKeyPath) && fs.existsSync(this.sslCertPath)) {
                const options = {
                    key: fs.readFileSync(this.sslKeyPath),
                    cert: fs.readFileSync(this.sslCertPath)
                };
                s = https.createServer(options, (req, res) => this.handleHttpRequest(req, res));
            } else {
                s = http.createServer((req, res) => this.handleHttpRequest(req, res));
            }

            // Zero-Dependency RFC 6455 WebSocket Upgrade Handler
            s.on('upgrade', (req, socket, head) => {
                this.handleWsUpgrade(req, socket, head);
            });

            s.once('error', (err) => {
                reject(err);
            });

            s.listen(portToTry, '0.0.0.0', () => {
                this.server = s;
                resolve();
            });
        });
    }

    /**
     * Beendet den Server und trennt alle Verbindungen.
     */
    async stop() {
        if (!this.isRunning) return { success: true };

        return new Promise((resolve) => {
            // Sockets trennen
            for (const socket of this.activeSockets) {
                try { socket.destroy(); } catch (_e) { }
            }
            this.activeSockets.clear();

            for (const sse of this.sseClients) {
                try { sse.end(); } catch (_e) { }
            }
            this.sseClients.clear();

            if (this.server) {
                this.server.close(() => {
                    this.server = null;
                    this.isRunning = false;
                    console.log('[SyncServer] Server gestoppt.');
                    resolve({ success: true });
                });
            } else {
                this.isRunning = false;
                resolve({ success: true });
            }
        });
    }

    /**
     * Generiert einen flüchtigen Pairing-Token für den QR-Code.
     */
    createPairingToken(ttlMinutes = 30) {
        const token = crypto.randomBytes(20).toString('hex');
        const validUntil = Date.now() + ttlMinutes * 60 * 1000;
        this.pairingTokens.set(token, {
            createdAt: Date.now(),
            validUntil
        });
        return token;
    }

    /**
     * Erzeugt das vollständige QR-Code-Payload-Objekt zur mobilen Kopplung.
     */
    getPairingPayload() {
        const token = this.createPairingToken();
        const localIp = SyncServer.getLocalIpAddress();
        const protocol = this.useTls ? 'https' : 'http';
        const wsProtocol = this.useTls ? 'wss' : 'ws';

        return {
            app: 'W-LINK-ERP',
            version: '1.2.0',
            server_url: `${protocol}://${localIp}:${this.port}`,
            ws_url: `${wsProtocol}://${localIp}:${this.port}/ws`,
            hub_name: 'W-Link ERP Hauptzentrale',
            pairing_token: token,
            valid_until: new Date(Date.now() + 30 * 60 * 1000).toISOString()
        };
    }

    /**
     * Behandelt nativen RFC 6455 WebSocket-Handshake ohne externe Abhängigkeiten.
     */
    handleWsUpgrade(req, socket, head) {
        const key = req.headers['sec-websocket-key'];
        if (!key) {
            socket.destroy();
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
        this.activeSockets.add(socket);

        socket.on('data', (buffer) => {
            this.handleWsFrame(socket, buffer);
        });

        socket.on('close', () => {
            this.activeSockets.delete(socket);
        });

        socket.on('error', () => {
            this.activeSockets.delete(socket);
        });

        // Begrüßungsnachricht senden
        this.sendWsMessage(socket, {
            type: 'WELCOME',
            app: 'W-Link ERP Sync Hub',
            serverTime: new Date().toISOString()
        });
    }

    /**
     * Parst eingehende RFC 6455 Frames.
     */
    handleWsFrame(socket, buffer) {
        if (buffer.length < 2) return;
        const opcode = buffer[0] & 0x0f;

        // Ping -> Pong
        if (opcode === 0x9) {
            socket.write(Buffer.from([0x8a, 0x00])); // Pong Frame
            return;
        }
        // Close
        if (opcode === 0x8) {
            this.activeSockets.delete(socket);
            socket.end();
            return;
        }

        // Text Frame
        if (opcode === 0x1) {
            const isMasked = Boolean(buffer[1] & 0x80);
            let length = buffer[1] & 0x7f;
            let offset = 2;

            if (length === 126) {
                length = buffer.readUInt16BE(2);
                offset = 4;
            } else if (length === 127) {
                length = Number(buffer.readBigUInt64BE(2));
                offset = 10;
            }

            let payload;
            if (isMasked) {
                const mask = buffer.slice(offset, offset + 4);
                offset += 4;
                const raw = buffer.slice(offset, offset + length);
                payload = Buffer.alloc(raw.length);
                for (let i = 0; i < raw.length; i++) {
                    payload[i] = raw[i] ^ mask[i % 4];
                }
            } else {
                payload = buffer.slice(offset, offset + length);
            }

            try {
                const data = JSON.parse(payload.toString('utf-8'));
                if (data.type === 'PING') {
                    this.sendWsMessage(socket, { type: 'PONG', time: new Date().toISOString() });
                }
            } catch (_e) { /* ignore */ }
        }
    }

    /**
     * Sendet Text-Frame an einen WebSocket.
     */
    sendWsMessage(socket, obj) {
        try {
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
        for (const socket of this.activeSockets) {
            this.sendWsMessage(socket, messageObj);
        }

        const sseData = `data: ${JSON.stringify(messageObj)}\n\n`;
        for (const res of this.sseClients) {
            try { res.write(sseData); } catch (_e) { }
        }
    }

    /**
     * Zentraler HTTP-Router für REST-Sync & PWA Static Files.
     */
    async handleHttpRequest(req, res) {
        // CORS-Header für PWA & Mobile Web
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Device-Id, X-Pairing-Token, X-Photo-Uuid, X-Entity-Type, X-Entity-Uuid, X-Sha256');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            return res.end();
        }

        const host = req.headers.host || `localhost:${this.port}`;
        const url = new URL(req.url, `http://${host}`);

        try {
            // 1. Healthcheck / Discovery
            if ((url.pathname === '/api/v1/sync/ping' || url.pathname === '/api/sync/ping' || url.pathname === '/api/sync/info') && req.method === 'GET') {
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
            if ((url.pathname === '/api/v1/sync/pair' || url.pathname === '/api/sync/pair') && req.method === 'POST') {
                const body = await this.readJsonBody(req);
                return this.handlePairing(body, res);
            }

            // 3. Push-Sync (Outbox Mutations)
            if ((url.pathname === '/api/v1/sync/push' || url.pathname === '/api/sync/push') && req.method === 'POST') {
                const body = await this.readJsonBody(req);
                return this.handlePushSync(body, res);
            }

            // 4. Pull-Sync (Delta Data)
            if ((url.pathname === '/api/v1/sync/pull' || url.pathname === '/api/sync/pull') && req.method === 'POST') {
                const body = await this.readJsonBody(req);
                return this.handlePullSync(body, res);
            }

            // 5. Large-Blob Streaming Foto-Upload
            if ((url.pathname === '/api/v1/sync/photo-upload' || url.pathname === '/api/v1/sync/upload-photo' || url.pathname === '/api/sync/photo-upload') && req.method === 'POST') {
                return this.handlePhotoUpload(req, res);
            }

            // 6. SSE Event Stream Fallback
            if (url.pathname === '/api/v1/sync/events' || url.pathname === '/api/sync/events') {
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                });
                res.write('retry: 10000\n\n');
                this.sseClients.add(res);
                req.on('close', () => this.sseClients.delete(res));
                return;
            }

            // 7. Statische PWA-Dateien ausliefern
            return this.serveStaticPwaFile(url.pathname, res);

        } catch (err) {
            console.error('[SyncServer Error]:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
    }

    /**
     * Prüft Pairing Token und bestätigt Registrierung.
     */
    handlePairing(body = {}, res) {
        const { pairing_token, device_id, device_name } = body;

        if (!pairing_token) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Pairing-Token fehlt.' }));
        }

        const tokenData = this.pairingTokens.get(pairing_token);
        if (!tokenData || tokenData.validUntil < Date.now()) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Ungültiger oder abgelaufener Pairing-Token.' }));
        }

        tokenData.deviceId = device_id;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'PAIRED',
            device_id: device_id || 'MOBILE_PWA',
            server_time: new Date().toISOString(),
            hub_name: 'W-Link ERP Hauptzentrale'
        }));
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
                } catch (mutationErr) {
                    console.warn(`[SyncServer] Fehler bei Mutation ${mut.uuid}:`, mutationErr.message);
                    conflicts.push({ uuid: mut.uuid, error: mutationErr.message });
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
        data.device_id = data.device_id || deviceId;

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
        const mitarbeiter = this.db.prepare('SELECT id, personalnummer, vorname, nachname, lohngruppe_id, tarif_stundensatz FROM mitarbeiter WHERE aktiv = 1').all();
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
    handlePhotoUpload(req, res) {
        const photoUuid = req.headers['x-photo-uuid'] || crypto.randomUUID();
        const entityType = req.headers['x-entity-type'] || 'MANGEL';
        const entityUuid = req.headers['x-entity-uuid'] || '';
        const clientSha = req.headers['x-sha256'] || '';

        const fileName = `${photoUuid}.webp`;
        const targetPath = path.join(this.uploadsDir, fileName);

        const writeStream = fs.createWriteStream(targetPath);
        const hash = crypto.createHash('sha256');

        req.on('data', chunk => {
            writeStream.write(chunk);
            hash.update(chunk);
        });

        req.on('end', () => {
            writeStream.end();
            const calculatedSha = hash.digest('hex');

            // Metadaten in DB verknüpfen falls Mangel-Foto
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

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'UPLOADED',
                photo_uuid: photoUuid,
                filePath: targetPath,
                sha256: calculatedSha,
                clientShaMatches: clientSha ? (clientSha === calculatedSha) : true
            }));
        });

        req.on('error', err => {
            writeStream.destroy();
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        });
    }

    /**
     * Liefert statische HTML/JS/CSS-Dateien der PWA an mobile Endgeräte aus.
     */
    serveStaticPwaFile(pathname, res) {
        let relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
        const safePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
        const fullPath = path.join(this.pwaDir, safePath);

        if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('404 Not Found');
        }

        const ext = path.extname(fullPath).toLowerCase();
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

        const contentType = mimeTypes[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(fullPath).pipe(res);
    }

    readJsonBody(req) {
        return new Promise((resolve, reject) => {
            let data = '';
            req.on('data', chunk => data += chunk);
            req.on('end', () => {
                try {
                    resolve(JSON.parse(data || '{}'));
                } catch (e) {
                    reject(new Error('Ungültiges JSON im Request-Body'));
                }
            });
            req.on('error', reject);
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
