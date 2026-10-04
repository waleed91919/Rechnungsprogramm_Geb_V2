const path = require('path');
const fs = require('fs');
const { httpError, isContained } = require('./utils/helpers');
const { PUBLIC_CONTROLLERS } = require('./config');

async function serveStaticPwaFile(serverState, pathname, res, headOnly = false) {
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
        const repositoryRoot = publicController ? await fs.promises.realpath(path.join(__dirname, '../..')) : null;
        const controllerRoot = publicController ? path.join(repositoryRoot, 'controllers') : null;
        const root = await fs.promises.realpath(publicController ? controllerRoot : serverState.pwaDir);
        if (publicController && root !== controllerRoot) throw httpError(403, 'Datei nicht erlaubt.');
        const candidate = path.resolve(root, publicController ? path.basename(pathname) : relativePath);
        if (!isContained(root, candidate)) throw httpError(403, 'Datei nicht erlaubt.');
        const fullPath = await fs.promises.realpath(candidate);
        if (!isContained(root, fullPath) || (publicController && fullPath !== candidate)) throw httpError(403, 'Datei nicht erlaubt.');
        file = await fs.promises.open(fullPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
        const stat = await file.stat();
        const isServiceWorker = pathname === '/sw.js' || pathname === '/manifest.webmanifest';
        const cacheControl = isServiceWorker
            ? 'no-cache, no-store, must-revalidate, max-age=0'
            : 'public, max-age=3600, stale-while-revalidate=86400';

        res.writeHead(200, {
            'Content-Type': mimeTypes[ext],
            'Content-Length': stat.size,
            'Cache-Control': cacheControl,
            'Pragma': isServiceWorker ? 'no-cache' : 'public'
        });
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

module.exports = {
    serveStaticPwaFile
};
