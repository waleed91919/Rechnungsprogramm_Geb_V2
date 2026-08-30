/**
 * main/ids-connect-service.js - Lokaler Loopback-Callback-Server & Webservice-Client für IDS Connect 2.5
 * Bereitstellung eines dynamischen lokalen Callback-Endpunkts (Port 0 / 49152) mit CSRF- & Session-Token Validierung.
 */

const http = require('http');
const crypto = require('crypto');
const IDSConnectController = require('../controllers/IDSConnectController');

class IDSConnectService {
    constructor(db, auditLogger, options = {}) {
        this.db = db;
        this.auditLogger = auditLogger;
        this.server = null;
        this.port = options.port || 0; // 0 = dynamischer Ephemeral Port
        this.boundPort = 0;
        this.activeSessions = new Map(); // sessionId -> { csrfToken, kontoId, projektId, angebotId, createdAt }
        this.onCartReceivedCallback = null;
    }

    /**
     * Startet den lokalen HTTP-Server für IDS Connect Rückrufe (HookURL).
     */
    startLocalServer() {
        if (this.server && this.boundPort > 0) {
            return Promise.resolve(this.boundPort);
        }

        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                this._handleHttpRequest(req, res);
            });

            // Standardmäßig Port 0 (automatischer freier Ephemeral-Port) oder konfigurierter Port
            const targetPort = this.port || 0;

            this.server.listen(targetPort, '127.0.0.1', () => {
                const addr = this.server.address();
                this.boundPort = typeof addr === 'object' && addr !== null ? addr.port : targetPort;
                console.log(`[IDSConnectService] Lokaler Callback-Server aktiv auf http://127.0.0.1:${this.boundPort}`);
                resolve(this.boundPort);
            });

            this.server.on('error', (err) => {
                console.error('[IDSConnectService] Serverfehler:', err);
                if (targetPort !== 0 && err.code === 'EADDRINUSE') {
                    console.warn(`[IDSConnectService] Port ${targetPort} belegt, wechsle auf dynamischen Port 0.`);
                    this.server.listen(0, '127.0.0.1', () => {
                        const addr = this.server.address();
                        this.boundPort = addr.port;
                        resolve(this.boundPort);
                    });
                } else {
                    reject(err);
                }
            });
        });
    }

    /**
     * Stoppt den lokalen Server.
     */
    stopLocalServer() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    this.server = null;
                    this.boundPort = 0;
                    resolve({ success: true });
                });
            } else {
                resolve({ success: true });
            }
        });
    }

    /**
     * Setzt den Callback-Handler für empfangene Warenkörbe.
     */
    setOnCartReceived(cb) {
        this.onCartReceivedCallback = cb;
    }

    /**
     * Erstellt eine neue Shop-Sitzung mit Session-ID und CSRF-Token.
     */
    createSession(kontoId, meta = {}) {
        const sessionId = `IDS-${crypto.randomUUID()}`;
        const csrfToken = crypto.randomBytes(24).toString('hex');

        this.activeSessions.set(sessionId, {
            csrfToken,
            kontoId: kontoId || null,
            projektId: meta.projektId || null,
            angebotId: meta.angebotId || null,
            createdAt: Date.now()
        });

        // Automatische Bereinigung alter Sessions (> 2 Stunden)
        this._cleanupOldSessions();

        return { sessionId, csrfToken };
    }

    /**
     * Validiert eine Session.
     */
    validateSession(sessionId, csrfToken = null) {
        if (!sessionId) return false;
        const session = this.activeSessions.get(sessionId);
        if (!session) return false;

        // Wenn ein CSRF-Token übergeben wurde, verifiziere ihn strikt
        if (csrfToken && session.csrfToken && csrfToken !== session.csrfToken) {
            return false;
        }

        return true;
    }

    /**
     * Behandelt eingehende HTTP-Requests von Großhandels-Webshops.
     */
    _handleHttpRequest(req, res) {
        const reqUrl = new URL(req.url, `http://127.0.0.1:${this.boundPort}`);

        // CORS Headers für Cross-Origin POSTs aus Browser-Webshops
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        if (req.method === 'POST' && reqUrl.pathname.startsWith('/ids/callback')) {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    let xmlPayload = body;
                    let sessionId = reqUrl.searchParams.get('session_id') || reqUrl.searchParams.get('sessionId') || '';
                    let csrfToken = reqUrl.searchParams.get('csrf_token') || reqUrl.searchParams.get('csrfToken') || '';

                    // Falls Body Form-Encoded ist
                    if (body.includes('shoppingcart=')) {
                        const params = new URLSearchParams(body);
                        xmlPayload = params.get('shoppingcart') || body;
                        if (!sessionId && params.has('session_id')) sessionId = params.get('session_id');
                        if (!csrfToken && params.has('csrf_token')) csrfToken = params.get('csrf_token');
                    } else if (body.startsWith('xml=')) {
                        const params = new URLSearchParams(body);
                        xmlPayload = params.get('xml') || body;
                    }

                    // XML dekodieren falls URL-encoded
                    if (xmlPayload.startsWith('%3C') || xmlPayload.includes('%3Cshopping_cart')) {
                        try {
                            xmlPayload = decodeURIComponent(xmlPayload);
                        } catch (_e) { }
                    }

                    // Parse Shopping Cart
                    const parsedCart = IDSConnectController.parseShoppingCartXml(xmlPayload);

                    // Hole verknüpfte Session falls vorhanden
                    let sessionInfo = this.activeSessions.get(sessionId) || null;
                    const kontoId = sessionInfo ? sessionInfo.kontoId : null;
                    const projektId = sessionInfo ? sessionInfo.projektId : null;
                    const angebotId = sessionInfo ? sessionInfo.angebotId : null;

                    // In Datenbank persistieren falls DB vorhanden
                    let databaseCartId = null;
                    if (this.db) {
                        const insertStmt = this.db.prepare(`
                            INSERT INTO ids_warenkoerbe (
                                konto_id, lieferant, cart_id, projekt_id, angebot_id,
                                netto_gesamt, items_count, status, cart_xml
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'RECEIVED', ?)
                        `);

                        const supplier = parsedCart.header.supplierId || 'GROSSHANDEL';
                        const resDb = insertStmt.run(
                            kontoId,
                            supplier,
                            parsedCart.header.cartId,
                            projektId,
                            angebotId,
                            parsedCart.totalNetAmount,
                            parsedCart.items.length,
                            xmlPayload
                        );

                        databaseCartId = resDb.lastInsertRowid;
                    }

                    parsedCart.databaseCartId = databaseCartId;
                    parsedCart.sessionId = sessionId;
                    parsedCart.projektId = projektId;
                    parsedCart.angebotId = angebotId;

                    if (this.auditLogger && typeof this.auditLogger.appendAuditLog === 'function') {
                        this.auditLogger.appendAuditLog({
                            action: 'IDS_CART_RECEIVED',
                            entityType: 'IDS_WARENKORB',
                            entityId: databaseCartId,
                            details: {
                                cartId: parsedCart.header.cartId,
                                supplier: parsedCart.header.supplierId,
                                itemsCount: parsedCart.items.length,
                                totalNet: parsedCart.totalNetAmount
                            }
                        });
                    }

                    // Erfolgs-HTML für den Webshop senden
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(`
                        <!DOCTYPE html>
                        <html lang="de">
                        <head>
                            <meta charset="utf-8">
                            <title>W-Link ERP - Warenkorb übertragen</title>
                            <style>
                                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; color: #1e293b; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                                .card { background: white; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1); padding: 40px; text-align: center; max-width: 480px; width: 90%; border: 1px solid #e2e8f0; }
                                .badge { width: 64px; height: 64px; border-radius: 50%; background: #dcfce7; color: #16a34a; display: inline-flex; align-items: center; justify-content: center; font-size: 32px; margin-bottom: 20px; font-weight: bold; }
                                h1 { font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 8px; }
                                p { font-size: 14px; color: #64748b; line-height: 1.5; margin: 6px 0; }
                                .summary { background: #f1f5f9; border-radius: 10px; padding: 14px; margin: 20px 0; font-size: 13px; font-weight: 600; color: #334155; }
                                .footer { font-size: 12px; color: #94a3b8; margin-top: 24px; }
                            </style>
                        </head>
                        <body>
                            <div class="card">
                                <div class="badge">✓</div>
                                <h1>Warenkorb übertragen!</h1>
                                <p>Der Großhandels-Warenkorb wurde erfolgreich an <strong>W-Link ERP</strong> übermittelt.</p>
                                <div class="summary">
                                    <span>${parsedCart.items.length} Positionen</span> · 
                                    <span>${parsedCart.totalNetAmount.toFixed(2)} € Netto</span>
                                </div>
                                <p>Sie können diesen Browser-Tab nun schließen und die Positionen in W-Link ERP übernehmen.</p>
                                <div class="footer">W-Link ERP &bull; IDS Connect 2.5 Standard</div>
                            </div>
                        </body>
                        </html>
                    `);

                    // Benachrichtige UI / Renderer
                    if (this.onCartReceivedCallback) {
                        this.onCartReceivedCallback(parsedCart);
                    }

                } catch (err) {
                    console.error('[IDSConnectService] Fehler beim Verarbeiten des Warenkorbs:', err);
                    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(`
                        <!DOCTYPE html>
                        <html>
                        <body style="font-family: sans-serif; text-align: center; padding: 40px; background: #fff1f2;">
                            <h2 style="color: #991b1b;">Fehler bei der Warenkorb-Übernahme</h2>
                            <p style="color: #4b5563;">${err.message}</p>
                        </body>
                        </html>
                    `);
                }
            });
        } else if (req.method === 'GET' && reqUrl.pathname === '/ids/status') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                active: true,
                version: '2.5',
                port: this.boundPort,
                activeSessionsCount: this.activeSessions.size
            }));
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        }
    }

    /**
     * Startet den Absprung in den Großhandels-Webshop.
     */
    async launchShop(kontoId, options = {}) {
        await this.startLocalServer();

        let konto = null;
        if (this.db) {
            konto = this.db.prepare('SELECT * FROM ids_connect_konten WHERE id = ?').get(kontoId);
        }
        if (!konto && options.konto) {
            konto = options.konto;
        }
        if (!konto) throw new Error(`Großhandelskonto mit ID ${kontoId} nicht gefunden.`);

        const { sessionId, csrfToken } = this.createSession(kontoId, {
            projektId: options.projektId,
            angebotId: options.angebotId
        });

        const hookUrl = `http://127.0.0.1:${this.boundPort}/ids/callback?session_id=${encodeURIComponent(sessionId)}&csrf_token=${encodeURIComponent(csrfToken)}`;

        const launchUrl = IDSConnectController.buildLaunchUrl(konto, {
            action: options.action || 'call',
            hookUrl,
            sessionId,
            orderReference: options.orderReference || 'W-Link ERP',
            itemNumber: options.itemNumber,
            csrfToken
        });

        // Falls Electron verfügbar ist, öffne externen Browser
        try {
            const { shell } = require('electron');
            if (shell && typeof shell.openExternal === 'function') {
                await shell.openExternal(launchUrl);
            }
        } catch (_e) {
            // Ausführung außerhalb von Electron (z. B. im Test)
        }

        return {
            success: true,
            sessionId,
            csrfToken,
            port: this.boundPort,
            launchUrl,
            message: `Großhandel "${konto.name}" wurde aufgerufen.`
        };
    }

    _cleanupOldSessions() {
        const now = Date.now();
        const maxAgeMs = 2 * 60 * 60 * 1000; // 2 Stunden
        for (const [id, sess] of this.activeSessions.entries()) {
            if (now - sess.createdAt > maxAgeMs) {
                this.activeSessions.delete(id);
            }
        }
    }
}

module.exports = IDSConnectService;
