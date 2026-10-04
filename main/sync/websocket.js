const http = require('http');
const crypto = require('crypto');

function handleWsUpgrade(serverState, req, socket, head) {
    let session;
    try {
        const pathname = serverState.validateRequestBoundary(req);
        session = serverState.authenticate(req);
        if (pathname !== '/ws' || req.method !== 'GET') throw Object.assign(new Error('WebSocket-Pfad nicht gefunden.'), { statusCode: 404 });
        if (session.channels.size >= 8) throw Object.assign(new Error('Zu viele offene Streams.'), { statusCode: 429 });
    } catch (err) {
        const status = err.statusCode || 400;
        socket.end(`HTTP/1.1 ${status} ${http.STATUS_CODES[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
        return;
    }
    const key = req.headers['sec-websocket-key'];
    if (typeof key !== 'string' || !/^[A-Za-z0-9+/]{22}==$/.test(key)
        || req.headers['sec-websocket-version'] !== '13' || req.headers.upgrade?.toLowerCase() !== 'websocket') {
        socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
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
    socket.syncSession = session;
    socket.syncBuffer = Buffer.alloc(0);
    serverState.activeSockets.add(socket);
    session.channels.add(socket);

    socket.on('data', (buffer) => {
        serverState.handleWsFrame(socket, buffer);
    });

    socket.on('close', () => {
        serverState.activeSockets.delete(socket);
        session.channels.delete(socket);
    });

    socket.on('error', () => {
        serverState.activeSockets.delete(socket);
        session.channels.delete(socket);
    });

    // Begrüßungsnachricht senden
    serverState.sendWsMessage(socket, {
        type: 'WELCOME',
        app: 'W-Link ERP Sync Hub',
        serverTime: new Date().toISOString()
    });
    if (head.length) serverState.handleWsFrame(socket, head);
}

function handleWsFrame(serverState, socket, buffer) {
    try { serverState.assertSession(socket.syncSession); }
    catch (_e) { socket.destroy(); return; }
    if (socket.syncBuffer.length + buffer.length > 65536) {
        socket.destroy();
        return;
    }
    buffer = Buffer.concat([socket.syncBuffer, buffer]);
    while (buffer.length >= 2) {
        const opcode = buffer[0] & 0x0f;
        // Only complete masked text/control frames are supported, with a bounded accumulator.
        if (!(buffer[0] & 0x80) || (buffer[0] & 0x70) || !(buffer[1] & 0x80) || ![1, 8, 9, 10].includes(opcode)) {
            socket.destroy();
            return;
        }
        let length = buffer[1] & 0x7f;
        let offset = 2;
        if ((opcode >= 8 && length > 125) || length === 127) { socket.destroy(); return; }
        if (length === 126) {
            if (buffer.length < 4) break;
            length = buffer.readUInt16BE(2);
            offset = 4;
        }
        if (length + offset + 4 > 65536) { socket.destroy(); return; }
        if (buffer.length < offset + 4 + length) break;
        const mask = buffer.subarray(offset, offset + 4);
        offset += 4;
        const payload = Buffer.from(buffer.subarray(offset, offset + length));
        for (let i = 0; i < length; i++) payload[i] ^= mask[i % 4];
        buffer = buffer.subarray(offset + length);
        if (opcode === 8) { socket.end(); return; }
        if (opcode === 9) {
            socket.write(Buffer.concat([Buffer.from([0x8a, length]), payload]));
            continue;
        }
        try {
            const data = JSON.parse(payload.toString('utf-8'));
            if (opcode === 1 && data.type === 'PING') {
                serverState.sendWsMessage(socket, { type: 'PONG', time: new Date().toISOString() });
            }
        } catch (_e) { /* ignore */ }
    }
    socket.syncBuffer = Buffer.from(buffer);
}

function sendWsMessage(serverState, socket, obj) {
    try {
        serverState.assertSession(socket.syncSession);
        if (socket.destroyed || socket.writableLength > 1024 * 1024) {
            socket.destroy();
            return;
        }
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

function broadcast(serverState, messageObj) {
    serverState.pruneSecurityState();
    for (const socket of serverState.activeSockets) {
        serverState.sendWsMessage(socket, messageObj);
    }

    const sseData = `data: ${JSON.stringify(messageObj)}\n\n`;
    for (const res of serverState.sseClients) {
        try {
            serverState.assertSession(res.syncSession);
            if (res.destroyed || res.writableLength > 1024 * 1024) res.destroy();
            else res.write(sseData);
        } catch (_e) { res.destroy(); }
    }
}

module.exports = {
    handleWsUpgrade,
    handleWsFrame,
    sendWsMessage,
    broadcast
};
