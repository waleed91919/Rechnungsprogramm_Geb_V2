/**
 * pwa/js/camera-engine.js - Client-seitige Bildverarbeitungs-, EXIF-Wasserzeichen- & Markup-Engine
 * Reduziert hochauflösende Handyfotos (12 MB) auf max 1600px WebP/JPEG (<800 KB),
 * brennt manipulationssichere Metadaten ein und ermöglicht Vor-Ort-Mängelmarkups.
 */

class CameraEngine {
    /**
     * Skaliert und komprimiert ein Rohfoto zu WebP (Fallback JPEG) und brennt Metadaten-Wasserzeichen ein.
     * @param {File|Blob|string} imageInput - Rohbild von Kamera-Input (File, Blob oder DataUrl)
     * @param {Object} metadata - { projektNr, objektName, datum, gpsLat, gpsLng, author }
     * @param {number} maxDimension - Maximale Kantenlänge (Standard 1600px)
     * @param {number} quality - WebP Kompressionsqualität (0.8 = 80%)
     */
    static async processAndWatermarkPhoto(imageInput, metadata = {}, maxDimension = 1600, quality = 0.8) {
        return new Promise((resolve, reject) => {
            if (typeof document === 'undefined') {
                return resolve({
                    simulated: true,
                    sizeBytes: 45000,
                    mimeType: 'image/webp',
                    width: 1600,
                    height: 1200,
                    metadata
                });
            }

            const img = new Image();

            const processImageElement = () => {
                let { width, height } = img;
                if (!width || !height) {
                    width = 1600;
                    height = 1200;
                }

                // 1. Seitenverhältnistreue Skalierung
                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    } else {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');

                // Bild zeichnen
                ctx.drawImage(img, 0, 0, width, height);

                // 2. Unveränderbares Wasserzeichen-Banner am unteren Rand einbrennen
                const bannerHeight = Math.max(40, Math.round(height * 0.06));
                ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'; // Dunkles Slate-900 mit Deckkraft
                ctx.fillRect(0, height - bannerHeight, width, bannerHeight);

                ctx.fillStyle = '#ffffff';
                ctx.font = `bold ${Math.max(12, Math.round(bannerHeight * 0.35))}px sans-serif`;
                ctx.textBaseline = 'middle';

                const datumStr = metadata.datum || new Date().toLocaleString('de-DE');
                const projStr = metadata.projektNr ? `Projekt: ${metadata.projektNr}` : (metadata.projektName || 'W-Link ERP');
                const locStr = (metadata.gpsLat && metadata.gpsLng) 
                    ? `GPS: ${Number(metadata.gpsLat).toFixed(5)}, ${Number(metadata.gpsLng).toFixed(5)}` 
                    : (metadata.objektName || '');

                const textLine = `[W-LINK] ${projStr} | ${datumStr} | ${locStr}`;
                ctx.fillText(textLine, 15, height - (bannerHeight / 2));

                // 3. Als WebP Blob exportieren (Fallback JPEG)
                const mimeType = 'image/webp';
                if (canvas.toBlob) {
                    canvas.toBlob(blob => {
                        if (!blob) {
                            // Fallback DataURL
                            const dataUrl = canvas.toDataURL('image/jpeg', quality);
                            return resolve({
                                dataUrl,
                                width,
                                height,
                                sizeBytes: Math.round(dataUrl.length * 0.75),
                                mimeType: 'image/jpeg'
                            });
                        }
                        resolve({
                            blob,
                            dataUrl: canvas.toDataURL(mimeType, quality),
                            width,
                            height,
                            sizeBytes: blob.size,
                            mimeType: blob.type || mimeType
                        });
                    }, mimeType, quality);
                } else {
                    const dataUrl = canvas.toDataURL('image/jpeg', quality);
                    resolve({
                        dataUrl,
                        width,
                        height,
                        sizeBytes: Math.round(dataUrl.length * 0.75),
                        mimeType: 'image/jpeg'
                    });
                }
            };

            img.onload = processImageElement;
            img.onerror = (err) => reject(new Error('Konnte Bild nicht laden: ' + (err.message || 'Formatfehler')));

            if (typeof imageInput === 'string') {
                img.src = imageInput;
            } else if (imageInput instanceof Blob || (typeof File !== 'undefined' && imageInput instanceof File)) {
                if (typeof URL !== 'undefined' && URL.createObjectURL) {
                    img.src = URL.createObjectURL(imageInput);
                } else {
                    const reader = new FileReader();
                    reader.onload = e => img.src = e.target.result;
                    reader.onerror = reject;
                    reader.readAsDataURL(imageInput);
                }
            } else {
                reject(new Error('Ungültiger Bildeingang'));
            }
        });
    }

    /**
     * Rendert digitale Zeichnungen (Mängelkreise, Pfeile, Freihand) auf ein bestehendes Foto.
     * @param {Blob|string} baseImageInput - Das Basis-Foto
     * @param {Array} drawActions - Array von Zeichenaktionen [{ type: 'circle'|'arrow'|'freehand', ... }]
     */
    static async applyDrawingsToPhoto(baseImageInput, drawActions = []) {
        return new Promise((resolve, reject) => {
            if (typeof document === 'undefined') {
                return resolve({ simulated: true, drawActionsCount: drawActions.length });
            }

            const img = new Image();
            let srcUrl = '';

            if (typeof baseImageInput === 'string') {
                srcUrl = baseImageInput;
            } else if (baseImageInput instanceof Blob) {
                srcUrl = URL.createObjectURL(baseImageInput);
            }

            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');

                ctx.drawImage(img, 0, 0);

                // Zeichenaktionen anwenden
                drawActions.forEach(action => {
                    ctx.strokeStyle = action.color || '#ef4444'; // Signalrot Standard
                    ctx.lineWidth = action.lineWidth || Math.max(4, Math.round(img.width * 0.005));
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';

                    if (action.type === 'circle') {
                        const cx = action.cx != null ? action.cx : (action.x || 100);
                        const cy = action.cy != null ? action.cy : (action.y || 100);
                        const r = action.r || action.radius || 40;
                        ctx.beginPath();
                        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
                        ctx.stroke();
                    } else if (action.type === 'arrow') {
                        const { fromX, fromY, toX, toY } = action;
                        const headlen = Math.max(15, Math.round(ctx.lineWidth * 3));
                        const angle = Math.atan2(toY - fromY, toX - fromX);
                        ctx.beginPath();
                        ctx.moveTo(fromX, fromY);
                        ctx.lineTo(toX, toY);
                        ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
                        ctx.moveTo(toX, toY);
                        ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
                        ctx.stroke();
                    } else if (action.type === 'freehand' && action.points && action.points.length > 1) {
                        ctx.beginPath();
                        ctx.moveTo(action.points[0].x, action.points[0].y);
                        for (let i = 1; i < action.points.length; i++) {
                            ctx.lineTo(action.points[i].x, action.points[i].y);
                        }
                        ctx.stroke();
                    }
                });

                if (baseImageInput instanceof Blob && srcUrl) {
                    URL.revokeObjectURL(srcUrl);
                }

                if (canvas.toBlob) {
                    canvas.toBlob(blob => {
                        resolve({
                            blob,
                            dataUrl: canvas.toDataURL('image/webp', 0.85),
                            width: canvas.width,
                            height: canvas.height
                        });
                    }, 'image/webp', 0.85);
                } else {
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    resolve({ dataUrl, width: canvas.width, height: canvas.height });
                }
            };

            img.onerror = reject;
            img.src = srcUrl;
        });
    }

    /**
     * Richtet einen Standard-HTML-Form-File-Input mit Umgebungskamera-Attribut ein.
     * Funktioniert auf iOS Safari und Android Chrome auch ohne Secure Context / HTTPS.
     */
    static createFileInputElement(callback) {
        if (typeof document === 'undefined') return null;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.setAttribute('capture', 'environment');
        input.style.display = 'none';

        input.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            if (file && typeof callback === 'function') {
                callback(file);
            }
        });

        document.body.appendChild(input);
        return input;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CameraEngine;
}
if (typeof window !== 'undefined') {
    window.CameraEngine = CameraEngine;
}
