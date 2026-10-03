const { httpError, urlHost, isLoopback } = require('../utils/helpers');

function checkPairRate(serverState, req) {
    serverState.pruneSecurityState();
    const now = Date.now();
    if (now - serverState.globalPairAttempts.startedAt >= 60000) {
        serverState.globalPairAttempts = { startedAt: now, count: 0 };
    }
    // Bound both per-address storage and aggregate requests; forwarded IP headers are not trusted.
    if (++serverState.globalPairAttempts.count > 100) throw httpError(429, 'Zu viele Pairing-Versuche.');
    const address = req.socket.remoteAddress || 'unknown';
    let attempt = serverState.pairAttempts.get(address);
    if (!attempt) {
        if (serverState.pairAttempts.size >= 256) throw httpError(429, 'Zu viele Pairing-Versuche.');
        attempt = { startedAt: now, count: 0 };
        serverState.pairAttempts.set(address, attempt);
    }
    if (++attempt.count > 10) throw httpError(429, 'Zu viele Pairing-Versuche.');
}

function validateRequestBoundary(serverState, req, res = null) {
    const info = serverState.getServerInfo();
    const hosts = new Set([new URL(info.serverUrl).host.toLowerCase()]);
    if (serverState.host !== '0.0.0.0' && serverState.host !== '::') hosts.add(`${urlHost(serverState.host)}:${serverState.port}`.toLowerCase());
    if (isLoopback(serverState.advertisedHost || serverState.host)) {
        hosts.add(`localhost:${serverState.port}`);
        hosts.add(`127.0.0.1:${serverState.port}`);
        hosts.add(`[::1]:${serverState.port}`);
    }
    const host = req.headers.host;
    if (typeof host !== 'string' || !hosts.has(host.toLowerCase())) {
        throw httpError(403, 'Host nicht erlaubt.');
    }
    const origin = req.headers.origin;
    const sameOrigins = new Set([...hosts].map(validHost => `${serverState.useTls ? 'https' : 'http'}://${validHost}`));
    if (origin !== undefined && (origin === 'null' || (!sameOrigins.has(origin) && !serverState.allowedOrigins.has(origin)))) {
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

module.exports = {
    checkPairRate,
    validateRequestBoundary
};
