const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { httpError } = require('./utils/helpers');
const { SAFE_ID } = require('./config');
const { detectImageFormat } = require('./utils/image');

async function handlePhotoUpload(serverState, req, res) {
    const photoUuid = req.headers['x-photo-uuid'] || crypto.randomUUID();
    const entityType = req.headers['x-entity-type'] || 'MANGEL';
    const entityUuid = req.headers['x-entity-uuid'] || '';
    const clientSha = req.headers['x-sha256'] || '';
    if (!SAFE_ID.test(photoUuid)) throw httpError(400, 'Ungültige Foto-UUID.');
    if (clientSha && !/^[a-fA-F0-9]{64}$/.test(clientSha)) throw httpError(400, 'Ungültiger SHA-256 Hash.');
    if (!SAFE_ID.test(entityType) || (entityUuid && !SAFE_ID.test(entityUuid))) throw httpError(400, 'Ungültige Foto-Metadaten.');
    if (Number(req.headers['content-length']) > serverState.maxPhotoBytes) throw httpError(413, 'Foto zu groß.');
    serverState.assertSession(req.syncSession);
    const configuredRoot = path.resolve(serverState.uploadsDir);
    await fs.promises.mkdir(configuredRoot, { recursive: true, mode: 0o700 });
    if ((await fs.promises.lstat(configuredRoot)).isSymbolicLink()) throw httpError(403, 'Upload-Verzeichnis nicht erlaubt.');
    const root = await fs.promises.realpath(configuredRoot);
    let fileName = `${photoUuid}.webp`;
    let targetPath = path.join(root, fileName);
    let stageDir;
    let handle;
    let published = false;
    let completed = false;
    let calculatedSha;
    const hash = crypto.createHash('sha256');
    try {
        stageDir = await fs.promises.mkdtemp(path.join(root, '.sync-upload-'));
        const stagePath = path.join(stageDir, 'photo.part');
        handle = await fs.promises.open(stagePath,
            fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
        let bytes = 0;
        const headerChunks = [];
        let headerBytes = 0;
        let detected = null;

        // Async iteration supplies backpressure; early limit rejection must not destroy the response socket.
        for await (const chunk of req.iterator({ destroyOnReturn: false })) {
            serverState.assertSession(req.syncSession);
            bytes += chunk.length;
            if (bytes > serverState.maxPhotoBytes) throw httpError(413, 'Foto zu groß.');
            if (!detected) {
                headerChunks.push(chunk);
                headerBytes += chunk.length;
                if (headerBytes >= 16) {
                    const headerBuf = Buffer.concat(headerChunks);
                    detected = detectImageFormat(headerBuf);
                    if (!detected) {
                        throw httpError(415, 'Nicht unterstütztes Bildformat. Erlaubt sind JPEG, PNG und WebP.');
                    }
                }
            }
            hash.update(chunk);
            await handle.writeFile(chunk);
        }
        if (req.aborted || !req.complete) throw httpError(400, 'Upload abgebrochen.');
        if (!detected) {
            const headerBuf = Buffer.concat(headerChunks);
            detected = detectImageFormat(headerBuf);
            if (!detected) {
                throw httpError(415, 'Nicht unterstütztes Bildformat. Erlaubt sind JPEG, PNG und WebP.');
            }
        }
        fileName = `${photoUuid}.${detected.ext}`;
        targetPath = path.join(root, fileName);
        calculatedSha = hash.digest('hex');
        if (clientSha && calculatedSha !== clientSha.toLowerCase()) throw httpError(422, 'SHA-256 stimmt nicht überein.');
        await handle.sync();
        await handle.close();
        handle = null;
        serverState.assertSession(req.syncSession);
        if ((await fs.promises.lstat(configuredRoot)).isSymbolicLink()
            || await fs.promises.realpath(configuredRoot) !== root
            || await fs.promises.realpath(stageDir) !== stageDir) {
            throw httpError(403, 'Upload-Verzeichnis wurde verändert.');
        }
        // Atomic publish without replacement: an existing file, hard link or symlink fails with EEXIST.
        await fs.promises.link(stagePath, targetPath);
        published = true;
        serverState.assertSession(req.syncSession);
        if (req.aborted || res.destroyed) throw httpError(400, 'Upload abgebrochen.');

        // Preserve optional business linkage, only after the verified file is fully written.
        if (entityType === 'MANGEL' && entityUuid) {
            try {
                const mangel = serverState.db.prepare('SELECT id FROM maengelkataster WHERE id = ? OR mangel_nr = ?').get(entityUuid, entityUuid);
                if (mangel) {
                    serverState.db.prepare(`
                        INSERT INTO maengel_fotos (mangel_id, dateipfad, aufnahme_datum, typ, kommentar)
                        VALUES (?, ?, CURRENT_TIMESTAMP, 'VOR_NACHBESSERUNG', ?)
                    `).run(mangel.id, targetPath, `Mobil synchronisiert (UUID: ${photoUuid})`);
                }
            } catch (_e) { /* ignore */ }
        }
        completed = true;
        // Cleanup finishes before acknowledgement, so neither a partial file nor an absolute path escapes.
        await fs.promises.rm(stageDir, { recursive: true, force: true });
        stageDir = null;
        serverState.sendJson(res, 200, {
            status: 'UPLOADED',
            photo_uuid: photoUuid,
            file_name: fileName,
            filePath: fileName, // legacy property, deliberately relative
            sha256: calculatedSha,
            clientShaMatches: true,
            mime: detected.mime
        });
    } catch (err) {
        if (err.code === 'EEXIST') {
            let existingHandle;
            try {
                const targetStat = await fs.promises.lstat(targetPath);
                if (!targetStat.isFile() || targetStat.isSymbolicLink()) throw httpError(409, 'Foto-UUID bereits vorhanden.');
                existingHandle = await fs.promises.open(targetPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
                const openedStat = await existingHandle.stat();
                if (!openedStat.isFile() || openedStat.size > serverState.maxPhotoBytes
                    || openedStat.dev !== targetStat.dev || openedStat.ino !== targetStat.ino) {
                    throw httpError(409, 'Foto-UUID bereits vorhanden.');
                }
                const existingHash = crypto.createHash('sha256');
                for await (const chunk of existingHandle.createReadStream({ autoClose: false })) {
                    serverState.assertSession(req.syncSession);
                    existingHash.update(chunk);
                }
                if (existingHash.digest('hex') !== calculatedSha) throw httpError(409, 'Foto-UUID bereits vorhanden.');
                await existingHandle.close();
                existingHandle = null;
                await fs.promises.rm(stageDir, { recursive: true, force: true });
                stageDir = null;
                serverState.assertSession(req.syncSession);
                completed = true;
                serverState.sendJson(res, 200, {
                    status: 'UPLOADED',
                    photo_uuid: photoUuid,
                    file_name: fileName,
                    filePath: fileName,
                    sha256: calculatedSha,
                    clientShaMatches: true
                });
                return;
            } finally {
                if (existingHandle) await existingHandle.close().catch(() => {});
            }
        }
        throw err;
    } finally {
        if (handle) await handle.close().catch(() => {});
        if (published && !completed) await fs.promises.unlink(targetPath).catch(() => {});
        if (stageDir) await fs.promises.rm(stageDir, { recursive: true, force: true });
    }
}

module.exports = {
    handlePhotoUpload
};
