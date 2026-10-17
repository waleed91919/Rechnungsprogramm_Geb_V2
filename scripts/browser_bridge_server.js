/**
 * scripts/browser_bridge_server.js
 * 
 * Lokaler HTTP-Server & IPC-Web-Bridge für W-Link ERP.
 * Ermöglicht die Ausführung und vollständige Überprüfung der Desktop-Applikation
 * sowie der mobilen Companion PWA in jedem Standard-Webbrowser (Chrome, Edge, Firefox).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';

// 1. Initialisiere Backend & SQLite
const { db, dbAPI } = require('../db');
const { registerAllIpc } = require('../main/ipc');

const ipcHandlers = new Map();
const fakeIpcMain = {
    handle: (channel, handler) => {
        ipcHandlers.set(channel, handler);
    },
    on: (channel, handler) => {
        // Event listener stub
    }
};

registerAllIpc(fakeIpcMain, { db, dbAPI });
console.log(`[Browser Bridge] ${ipcHandlers.size} IPC-Kanäle erfolgreich registriert.`);

// 2. Extrahiere Methodennamen und Mappings aus preload.js
const preloadCode = fs.readFileSync(path.join(ROOT_DIR, 'preload.js'), 'utf-8');
const methodMappings = [];
const preloadRegex = /^\s*([a-zA-Z0-9_]+)\s*:\s*\((.*?)\)\s*=>\s*ipcRenderer\.invoke\(['"]([^'"]+)['"]/gm;
let match;
while ((match = preloadRegex.exec(preloadCode)) !== null) {
    methodMappings.push({
        method: match[1],
        args: match[2],
        channel: match[3]
    });
}
console.log(`[Browser Bridge] ${methodMappings.length} API-Methoden aus preload.js gemappt.`);

// 3. Generiere clientseitiges browser-bridge.js
function generateClientBridgeScript() {
    let script = `// W-Link ERP Browser Bridge Polyfill
(function() {
    console.log('[Browser Bridge] Initialisiere window.api Polyfill für Browser-Modus...');
    
    async function invokeIpc(channel, ...args) {
        try {
            const response = await fetch('/api/ipc', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel, args })
            });
            const data = await response.json();
            if (!data.ok) {
                console.error('[Browser Bridge Error]', channel, data.error);
                throw new Error(data.error || 'IPC-Aufruf fehlgeschlagen');
            }
            return data.result;
        } catch (err) {
            console.error('[Browser Bridge IPC Exception]', channel, err);
            throw err;
        }
    }

    const api = {
        _isBrowserMode: true,
        unlockDocument: (id, grund) => Promise.reject(new Error('GoBD: Belege können nicht entsperrt werden. Bitte Storno nutzen.')),
        onIdsCartReceived: (cb) => { console.log('[Browser Bridge] onIdsCartReceived registriert'); },
        focusWindow: () => Promise.resolve(true),
        confirm: async (options) => {
            const message = (typeof options === 'object' && options.message) ? options.message : String(options);
            return window.confirm(message) ? 0 : 1;
        },
        alert: async (options) => {
            const message = (typeof options === 'object' && options.message) ? options.message : String(options);
            window.alert(message);
            return true;
        },
        printDocument: () => {
            window.print();
            return Promise.resolve(true);
        },
        savePdf: (buffer, defaultName) => {
            try {
                const bytes = (buffer && buffer.data) ? buffer.data : buffer;
                const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = defaultName || 'Rechnung.pdf';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 10000);
                return Promise.resolve({ success: true, filePath: defaultName });
            } catch (e) {
                console.warn('[Browser Bridge PDF Download]', e);
                return Promise.resolve({ success: false, error: e.message });
            }
        }
    };\n\n`;

    // Methoden aus preload.js anhängen
    for (const m of methodMappings) {
        if (!['unlockDocument', 'onIdsCartReceived', 'focusWindow', 'confirm', 'alert', 'printDocument', 'savePdf'].includes(m.method)) {
            script += `    api['${m.method}'] = (...args) => invokeIpc('${m.channel}', ...args);\n`;
        }
    }

    script += `
    window.api = api;
    console.log('[Browser Bridge] window.api erfolgreich bereitgestellt mit ' + Object.keys(api).length + ' Methoden.');
})();
`;
    return script;
}

const clientBridgeScript = generateClientBridgeScript();

// 4. MIME-Typen
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.pdf': 'application/pdf',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf'
};

// 5. HTTP-Server
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    // CORS Headers für lokale Tests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    // A. Browser-Bridge Script ausliefern
    if (pathname === '/browser-bridge.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
        return res.end(clientBridgeScript);
    }

    // B. IPC-Gateway Endpoint
    if (pathname === '/api/ipc' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const payload = JSON.parse(body || '{}');
                const { channel, args = [] } = payload;
                const handler = ipcHandlers.get(channel);
                if (!handler) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ ok: false, error: `IPC-Kanal nicht gefunden: ${channel}` }));
                }

                const fakeEvent = {
                    sender: {
                        send: () => {},
                        focus: () => {}
                    }
                };

                const result = await handler(fakeEvent, ...args);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, result }));
            } catch (err) {
                console.error('[IPC Handler Error]:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: err.message || 'Interner Serverfehler' }));
            }
        });
        return;
    }

    // C. Root Redirect auf code.html
    if (pathname === '/' || pathname === '') {
        pathname = '/code.html';
    }

    // D. PWA Shortcut
    if (pathname === '/pwa') {
        res.writeHead(302, { 'Location': '/pwa/' });
        return res.end();
    }
    if (pathname === '/pwa/') {
        pathname = '/pwa/index.html';
    }

    // E. Statische Dateien ausliefern
    let filePath = path.join(ROOT_DIR, pathname.startsWith('/') ? pathname.slice(1) : pathname);
    filePath = path.normalize(filePath);

    // Sicherheitsprüfung: Darf nicht außerhalb von ROOT_DIR navigieren
    if (!filePath.startsWith(ROOT_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Zugriff verweigert');
    }

    // Wenn es code.html ist, Browser-Bridge-Skript injizieren
    if (pathname === '/code.html') {
        try {
            let htmlContent = fs.readFileSync(filePath, 'utf-8');
            // Inject bridge right after <head>
            htmlContent = htmlContent.replace('<head>', '<head>\n    <script src="/browser-bridge.js"></script>');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end(htmlContent);
        } catch (e) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('code.html nicht gefunden: ' + e.message);
        }
    }

    // Statische Datei ausliefern
    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end(`Datei nicht gefunden: ${pathname}`);
        }

        const ext = path.extname(filePath).toLowerCase();
        const mime = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': mime,
            'Content-Length': stats.size,
            'Cache-Control': 'no-cache'
        });

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
    });
});

server.listen(PORT, HOST, () => {
    console.log(`=======================================================`);
    console.log(` W-Link ERP Browser-Bridge Server erfolgreich gestartet!`);
    console.log(` URL: http://${HOST}:${PORT}/`);
    console.log(` PWA: http://${HOST}:${PORT}/pwa/`);
    console.log(`=======================================================`);
});

module.exports = server;
