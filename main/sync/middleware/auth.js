const { httpError, hashToken } = require('../utils/helpers');
const { SAFE_ID } = require('../config');

function assertSession(serverState, session) {
    if (!session || serverState.sessions.get(session.key) !== session || session.expiresAt <= Date.now()) {
        if (session) serverState.revokeSession(session.key);
        throw httpError(401, 'Sitzung ungültig oder abgelaufen.');
    }
}

function authenticate(serverState, req) {
    serverState.pruneSecurityState();
    const authorization = req.headers.authorization;
    const deviceId = req.headers['x-device-id'];
    const match = typeof authorization === 'string' && /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization);
    if (!match || typeof deviceId !== 'string' || !SAFE_ID.test(deviceId)) {
        throw httpError(401, 'Bearer-Token und X-Device-Id erforderlich.');
    }
    const session = serverState.sessions.get(hashToken(match[1]));
    assertSession(serverState, session);
    if (session.deviceId !== deviceId) throw httpError(403, 'Geräteidentität stimmt nicht überein.');
    return session;
}

function bindBodyIdentity(serverState, body, session) {
    assertSession(serverState, session);
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

module.exports = {
    assertSession,
    authenticate,
    bindBodyIdentity
};
