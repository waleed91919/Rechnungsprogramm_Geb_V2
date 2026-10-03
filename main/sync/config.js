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

module.exports = {
    SAFE_ID,
    TOKEN,
    PAIRING_TTL_MS,
    SESSION_TTL_MS,
    MAX_SESSIONS,
    MAX_PAIRING_TOKENS,
    PUBLIC_CONTROLLERS
};
