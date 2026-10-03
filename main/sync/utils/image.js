/**
 * Zero-Dependency Streaming Magic-Bytes Inspektion (JPEG, PNG, WebP)
 */
function detectImageFormat(buffer) {
    if (!buffer || buffer.length < 12) return null;

    // 1. PNG Check (8 Bytes: 89 50 4E 47 0D 0A 1A 0A)
    if (buffer.length >= 8 &&
        buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
        buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A) {
        return { ext: 'png', mime: 'image/png' };
    }

    // 2. JPEG Check (3 Bytes: FF D8 FF)
    if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return { ext: 'jpg', mime: 'image/jpeg' };
    }

    // 3. WebP Check (RIFF .... WEBP)
    if (buffer.length >= 12 &&
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        return { ext: 'webp', mime: 'image/webp' };
    }

    return null;
}

module.exports = {
    detectImageFormat
};
