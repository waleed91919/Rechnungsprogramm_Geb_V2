const { httpError } = require('../utils/helpers');

function readJsonBody(req, maxJsonBytes) {
    if (Number(req.headers['content-length']) > maxJsonBytes) return Promise.reject(httpError(413, 'JSON-Body zu groß.'));
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
            if (bytes > maxJsonBytes) return fail(httpError(413, 'JSON-Body zu groß.'));
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

module.exports = { readJsonBody };
