/**
 * pwa/js/barcode-scanner.js - Native BarcodeDetector API & BGL-Gerätestunden / Lieferschein-Engine
 * Unterstützt QR-Code, EAN-13, Code 128 mit automatischer Kontrastoptimierung für Belege.
 * Isomorph für Node.js Tests und Browser.
 */

class BarcodeScannerEngine {
    /**
     * Prüft, ob die native BarcodeDetector API verfügbar ist.
     */
    static isSupported() {
        return typeof window !== 'undefined' && ('BarcodeDetector' in window);
    }

    /**
     * Ermittelt die vom Browser unterstützten Barcode-Formate.
     */
    static async getSupportedFormats() {
        if (!this.isSupported()) {
            return ['qr_code', 'ean_13', 'code_128', 'data_matrix'];
        }
        try {
            return await window.BarcodeDetector.getSupportedFormats();
        } catch (_e) {
            return ['qr_code', 'ean_13', 'code_128'];
        }
    }

    /**
     * Dekodiert Barcodes aus einem Image-, Video- oder Canvas-Element.
     * @param {ImageBitmap|HTMLVideoElement|HTMLCanvasElement|ImageData} imageSource 
     * @param {Array<string>} [formats] 
     * @returns {Promise<Array<{ rawValue: string, format: string }>>}
     */
    static async detectBarcodes(imageSource, formats = ['qr_code', 'ean_13', 'code_128', 'data_matrix']) {
        if (this.isSupported()) {
            try {
                const detector = new window.BarcodeDetector({ formats });
                const results = await detector.detect(imageSource);
                return results.map(r => ({
                    rawValue: r.rawValue,
                    format: r.format,
                    cornerPoints: r.cornerPoints
                }));
            } catch (detectorErr) {
                console.warn('[BarcodeScanner] BarcodeDetector Fehler, wechsle zu Fallback:', detectorErr.message);
            }
        }

        // Fallback: Wenn Bildquelle ein Canvas/ImageData ist oder jsQR existiert
        if (typeof window !== 'undefined' && window.jsQR && imageSource) {
            try {
                let imageData = imageSource;
                if (imageSource instanceof HTMLCanvasElement) {
                    const ctx = imageSource.getContext('2d');
                    imageData = ctx.getImageData(0, 0, imageSource.width, imageSource.height);
                }
                if (imageData && imageData.data) {
                    const code = window.jsQR(imageData.data, imageData.width, imageData.height);
                    if (code) {
                        return [{ rawValue: code.data, format: 'qr_code' }];
                    }
                }
            } catch (_e) { /* ignore */ }
        }

        return [];
    }

    /**
     * Kontrastoptimierungs-Filter für fotografierte Papier-Lieferscheine.
     * Filtert Schlagschatten heraus und verstärkt Kugelschreiber-/Druckerschwärze.
     * @param {HTMLCanvasElement|ImageData|Object} canvasOrImageData 
     * @returns {Object} Modifizierte Bilddaten mit erhöhtem Schwarz-Weiß-Kontrast
     */
    static enhanceLieferscheinContrast(canvasOrImageData) {
        let imgData;
        let ctx = null;

        if (typeof HTMLCanvasElement !== 'undefined' && canvasOrImageData instanceof HTMLCanvasElement) {
            ctx = canvasOrImageData.getContext('2d');
            imgData = ctx.getImageData(0, 0, canvasOrImageData.width, canvasOrImageData.height);
        } else {
            imgData = canvasOrImageData;
        }

        if (!imgData || !imgData.data) return imgData;

        const data = imgData.data;
        const len = data.length;

        // Kontrast- und Schwellenwerttransformation (Adaptive Binarisierung / Gamma)
        for (let i = 0; i < len; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // Grauwert nach ITU-R BT.601
            const gray = (r * 299 + g * 587 + b * 114) / 1000;

            // Kontrastspreizung (S-Kurve / Schwellwert)
            let enhanced;
            if (gray > 160) {
                enhanced = 255; // Hintergrund weißer machen
            } else if (gray < 90) {
                enhanced = 0;   // Schrift tiefschwarz machen
            } else {
                // Lineare Spreizung im Mittenbereich
                enhanced = Math.round(((gray - 90) / (160 - 90)) * 255);
            }

            data[i] = enhanced;
            data[i + 1] = enhanced;
            data[i + 2] = enhanced;
        }

        if (ctx) {
            ctx.putImageData(imgData, 0, 0);
        }

        return imgData;
    }

    /**
     * Erfasst eine mobile Großgeräte-Einsatzbuchung (BGL).
     * @param {Object} db - Mobile Dexie DB Instanz
     * @param {Object} syncWorker - MobileSyncWorker Instanz
     * @param {Object} bookingData - { projektId, geraetCode, datum, betriebsstunden, stillstandStunden, stillstandGrund, deviceId }
     * @returns {Promise<Object>} Gespeicherter Datensatz
     */
    static async bookGeraet(db, syncWorker, bookingData = {}) {
        if (!db || !db.local_geraete_buchungen) {
            throw new Error('Datenbank-Handle für local_geraete_buchungen fehlt.');
        }

        const uuid = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `ger-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

        const entry = {
            uuid,
            projekt_id: parseInt(bookingData.projektId || bookingData.projekt_id, 10),
            geraet_code: bookingData.geraetCode || bookingData.geraet_code || 'BGL-GERAET',
            datum: bookingData.datum || new Date().toISOString().split('T')[0],
            betriebsstunden: parseFloat(bookingData.betriebsstunden || bookingData.stunden) || 0.0,
            stillstand_stunden: parseFloat(bookingData.stillstandStunden || bookingData.stillstand_stunden) || 0.0,
            stillstand_grund: bookingData.stillstandGrund || bookingData.stillstand_grund || null,
            is_synced: 0,
            created_at: new Date().toISOString()
        };

        await db.local_geraete_buchungen.put(entry);

        if (syncWorker && typeof syncWorker.queueMutation === 'function') {
            await syncWorker.queueMutation('GERAETE_BUCHUNG', uuid, 'INSERT', entry);
        }

        return entry;
    }

    /**
     * Puffert einen digitalen Lieferschein mit Foto und Hash lokal ab.
     */
    static async saveDigitalLieferschein(db, syncWorker, data = {}) {
        if (!db || !db.local_lieferscheine) {
            throw new Error('Datenbank-Handle für local_lieferscheine fehlt.');
        }

        const uuid = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `ls-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

        const entry = {
            uuid,
            projekt_id: parseInt(data.projektId || data.projekt_id, 10),
            lieferant_id: data.lieferantId ? parseInt(data.lieferantId, 10) : null,
            lieferant_name: data.lieferantName || data.lieferant_name || 'Lieferant',
            lieferschein_nr: data.lieferscheinNr || data.lieferschein_nr || '',
            datum: data.datum || new Date().toISOString().split('T')[0],
            sha256_hash: data.sha256Hash || data.sha256_hash || '',
            foto_data_url: data.fotoDataUrl || null,
            is_synced: 0,
            created_at: new Date().toISOString()
        };

        await db.local_lieferscheine.put(entry);

        if (syncWorker && typeof syncWorker.queueMutation === 'function') {
            await syncWorker.queueMutation('LIEFERSCHEIN', uuid, 'INSERT', entry);
        }

        return entry;
    }
}

if (typeof window !== 'undefined') {
    window.BarcodeScannerEngine = BarcodeScannerEngine;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BarcodeScannerEngine;
}
