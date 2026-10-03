const crypto = require('crypto');
const os = require('os');
const net = require('net');
const path = require('path');

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

function getLocalIpAddress() {
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

module.exports = {
    httpError,
    positiveLimit,
    hashToken,
    isLoopback,
    urlHost,
    isContained,
    getLocalIpAddress
};
