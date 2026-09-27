const { app } = require('electron');

const wrapHandler = (fn) => async (event, ...args) => {
    try {
        return await fn(event, ...args);
    } catch (error) {
        console.error('IPC Handler Error:', error);
        throw error;
    }
};

const focusWin = (win) => {
    if (!win || win.isDestroyed()) return;

    if (process.platform === 'win32') {
        app.focus({ steal: true });

        win.setAlwaysOnTop(true, 'screen-saver');
        win.setEnabled(true);
        win.show();
        win.focus();
        win.webContents.focus();

        setTimeout(() => {
            if (!win.isDestroyed()) {
                win.setAlwaysOnTop(false);
                win.webContents.focus();
            }
        }, 150);
    } else {
        win.focus();
        win.webContents.focus();
    }
};

const ZUGFERD_SICHTSEITE_TIMEOUT_MS = 15000;

function toPdfBuffer(value) {
    if (!value) return null;
    try {
        let buf;
        if (Buffer.isBuffer(value)) buf = value;
        else if (value instanceof ArrayBuffer) buf = Buffer.from(value);
        else if (ArrayBuffer.isView(value)) buf = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
        else return null;
        if (buf.length > 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return buf;
    } catch (_e) {
        return null;
    }
    return null;
}

function printToPdfWithTimeout(contents, timeoutMs = ZUGFERD_SICHTSEITE_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (err, buf) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (err) reject(err); else resolve(buf);
        };
        const timer = setTimeout(() => finish(new Error(`printToPDF-Timeout nach ${timeoutMs} ms`)), timeoutMs);
        contents.printToPDF({
            printBackground: true,
            pageSize: 'A4',
            preferCSSPageSize: true,
            margins: { marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 }
        }).then((buf) => finish(null, buf), (err) => finish(err));
    });
}

function waitForPrintReady(contents, timeoutMs = 4000) {
    return new Promise((resolve) => {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve();
        };
        const timer = setTimeout(finish, timeoutMs);
        try {
            const pending = contents.executeJavaScript(
                'document.fonts ? document.fonts.ready.then(function () { return document.readyState; }) : document.readyState',
                true
            );
            if (pending && typeof pending.then === 'function') {
                pending.then(() => setTimeout(finish, 250), () => finish());
            } else {
                setTimeout(finish, 250);
            }
        } catch (_e) {
            finish();
        }
    });
}

module.exports = {
    wrapHandler,
    focusWin,
    toPdfBuffer,
    printToPdfWithTimeout,
    waitForPrintReady,
    ZUGFERD_SICHTSEITE_TIMEOUT_MS
};
