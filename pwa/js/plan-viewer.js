/**
 * pwa/js/plan-viewer.js - Hochperformanter, gestenbasierter Offline-Bauplan-Viewer mit pdf.js
 * Ermöglicht Zoom-invariante Mängel-Pins mit normalisierten Koordinaten (X% / Y%)
 * und automatischer VOB/B § 13 Fristen-Ampel.
 * Isomorph für Node.js Tests und Browser Canvas.
 */

class OfflinePlanViewer {
    /**
     * Rechnet Pixelkoordinaten in unskalierte Prozentkoordinaten um (0 - 100%).
     * @param {number} clickX 
     * @param {number} clickY 
     * @param {number} baseWidth 
     * @param {number} baseHeight 
     * @returns {{ xPct: number, yPct: number }}
     */
    static calculateNormalizedCoordinates(clickX, clickY, baseWidth, baseHeight) {
        if (!baseWidth || !baseHeight || baseWidth <= 0 || baseHeight <= 0) {
            return { xPct: 0, yPct: 0 };
        }
        const xPct = (clickX / baseWidth) * 100;
        const yPct = (clickY / baseHeight) * 100;
        return {
            xPct: Math.round(xPct * 100) / 100,
            yPct: Math.round(yPct * 100) / 100
        };
    }

    /**
     * Rechnet Prozentkoordinaten in absolute Pixelkoordinaten für eine gegebene Plan-Dimension um.
     * @param {number} xPct 
     * @param {number} yPct 
     * @param {number} baseWidth 
     * @param {number} baseHeight 
     * @returns {{ x: number, y: number }}
     */
    static denormalizeCoordinates(xPct, yPct, baseWidth, baseHeight) {
        const x = (xPct / 100) * (baseWidth || 0);
        const y = (yPct / 100) * (baseHeight || 0);
        return {
            x: Math.round(x * 10) / 10,
            y: Math.round(y * 10) / 10
        };
    }

    /**
     * Ermittelt die Fristenampel für einen Mangel.
     */
    static calculateFristAmpel(fristDate, status) {
        if (typeof MaengelController !== 'undefined' && typeof MaengelController.calculateFristAmpel === 'function') {
            return MaengelController.calculateFristAmpel(fristDate, status);
        }

        if (!fristDate || status === 'ERLEDIGT' || status === 'ABGEWIESEN') {
            return { color: 'GRAY', daysRemaining: null, isOverdue: false, text: 'Erledigt' };
        }

        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const target = new Date(fristDate);
        target.setHours(0, 0, 0, 0);

        if (isNaN(target.getTime())) {
            return { color: 'GRAY', daysRemaining: null, isOverdue: false, text: 'Ungültig' };
        }

        const diffTime = target.getTime() - now.getTime();
        const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (daysRemaining < 0) {
            return { color: 'RED', daysRemaining, isOverdue: true, text: 'Überfällig' };
        } else if (daysRemaining <= 7) {
            return { color: 'YELLOW', daysRemaining, isOverdue: false, text: 'Frist bald fällig' };
        } else {
            return { color: 'GREEN', daysRemaining, isOverdue: false, text: 'Fristgerecht' };
        }
    }

    constructor(containerId, canvasId, overlayId) {
        this.container = typeof document !== 'undefined' ? document.getElementById(containerId) : null;
        this.canvas = typeof document !== 'undefined' ? document.getElementById(canvasId) : null;
        this.overlay = typeof document !== 'undefined' ? document.getElementById(overlayId) : null;
        this.ctx = this.canvas && this.canvas.getContext ? this.canvas.getContext('2d') : null;

        this.currentPdfDoc = null;
        this.currentPage = null;
        this.baseViewport = null;

        // Transformations-Status
        this.scale = 1.0;
        this.translateX = 0;
        this.translateY = 0;

        // Touch-Gesten Status
        this.isPanning = false;
        this.hasMovedSignificant = false;
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.startX = 0;
        this.startY = 0;
        this.lastDistance = 0;

        this.onPinClick = null;
        this.onPlanClick = null;

        if (this.container) {
            this._initGestures();
        }
    }

    /**
     * Lädt ein PDF aus einem ArrayBuffer oder Blob mit Fallback-Prüfung.
     */
    async loadPdfFromBlob(blob) {
        if (!blob) return;

        // [K-3] Robustheits-Check auf pdf.js Verfügbarkeit
        const hasPdfJs = typeof pdfjsLib !== 'undefined' || (typeof window !== 'undefined' && window.pdfjsLib);
        if (!hasPdfJs) {
            this._renderOfflineFallback('PDF-Bibliothek (pdf.js) offline nicht geladen. Plan kann alternativ als Bild geladen werden.');
            return;
        }
        const pdfLib = typeof pdfjsLib !== 'undefined' ? pdfjsLib : window.pdfjsLib;

        try {
            const arrayBuffer = await blob.arrayBuffer();

            // [K-3] Validierung auf echten %PDF Header
            const headerBytes = new Uint8Array(arrayBuffer.slice(0, 5));
            const headerStr = String.fromCharCode(...headerBytes);
            if (!headerStr.startsWith('%PDF')) {
                this._renderOfflineFallback('Die ausgewählte Datei ist kein gültiges PDF-Dokument (fehlender PDF-Header).');
                return;
            }

            const loadingTask = pdfLib.getDocument({ data: arrayBuffer });
            this.currentPdfDoc = await loadingTask.promise;
            await this.renderPage(1);
        } catch (err) {
            console.warn('[OfflinePlanViewer] Fehler beim Laden des PDFs:', err);
            this._renderOfflineFallback('PDF-Dokument konnte nicht gerendert werden: ' + err.message);
        }
    }

    /**
     * Zeichnet ein ansprechendes Offline-Raster mit Infotext, falls PDF nicht geladen werden kann.
     */
    _renderOfflineFallback(message = 'Bauplan Offline-Vorschau nicht verfügbar.') {
        if (!this.canvas || !this.ctx) return;
        const width = this.container ? this.container.clientWidth || 800 : 800;
        const height = this.container ? this.container.clientHeight || 600 : 600;
        this.canvas.width = width;
        this.canvas.height = height;
        if (this.overlay) {
            this.overlay.style.width = `${width}px`;
            this.overlay.style.height = `${height}px`;
        }

        const ctx = this.ctx;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, height);

        // Blueprint Grid Pattern
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        const step = 40;
        for (let x = 0; x < width; x += step) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        for (let y = 0; y < height; y += step) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(message, width / 2, height / 2 - 12);
        ctx.font = '13px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText('Mängel-Pins können weiterhin im Plan-Raster platziert werden.', width / 2, height / 2 + 16);

        this.baseViewport = { width, height };
        this.resetView();
    }

    /**
     * Rendert eine spezifische Seite auf dem Canvas.
     */
    async renderPage(pageNumber = 1) {
        if (!this.currentPdfDoc || !this.canvas) return;
        this.currentPage = await this.currentPdfDoc.getPage(pageNumber);

        this.baseViewport = this.currentPage.getViewport({ scale: 1.0 });

        this.canvas.width = this.baseViewport.width;
        this.canvas.height = this.baseViewport.height;
        if (this.overlay) {
            this.overlay.style.width = `${this.baseViewport.width}px`;
            this.overlay.style.height = `${this.baseViewport.height}px`;
        }

        const renderContext = {
            canvasContext: this.ctx,
            viewport: this.baseViewport
        };

        await this.currentPage.render(renderContext).promise;
        this.resetView();
    }

    _initGestures() {
        if (!this.container) return;
        let lastTap = 0;
        this.hasMovedSignificant = false;
        this.touchStartX = 0;
        this.touchStartY = 0;

        this.container.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                const now = Date.now();
                if (now - lastTap < 300) {
                    this.resetView();
                    e.preventDefault();
                    return;
                }
                lastTap = now;

                this.isPanning = true;
                this.hasMovedSignificant = false;
                this.touchStartX = e.touches[0].clientX;
                this.touchStartY = e.touches[0].clientY;
                this.startX = e.touches[0].clientX - this.translateX;
                this.startY = e.touches[0].clientY - this.translateY;
            } else if (e.touches.length === 2) {
                this.isPanning = false;
                this.hasMovedSignificant = true;
                this.lastDistance = this._getDistance(e.touches);
            }
        }, { passive: false });

        this.container.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (e.touches.length === 1 && this.isPanning) {
                const dx = e.touches[0].clientX - this.touchStartX;
                const dy = e.touches[0].clientY - this.touchStartY;
                // [K-2] Hysterese-Schwellenwert > 8px
                if (Math.hypot(dx, dy) > 8) {
                    this.hasMovedSignificant = true;
                }
                this.translateX = e.touches[0].clientX - this.startX;
                this.translateY = e.touches[0].clientY - this.startY;
                this._applyTransform();
            } else if (e.touches.length === 2) {
                this.hasMovedSignificant = true;
                const currentDist = this._getDistance(e.touches);
                if (this.lastDistance > 0) {
                    const factor = currentDist / this.lastDistance;
                    const oldScale = this.scale;
                    const newScale = Math.min(Math.max(0.5, oldScale * factor), 10.0);

                    // [H-4] Zoom auf den Mittelpunkt zwischen beiden Fingern ausrichten
                    const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                    const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                    const rect = this.container.getBoundingClientRect();
                    const cx = midX - rect.left;
                    const cy = midY - rect.top;

                    const scaleRatio = newScale / oldScale;
                    this.translateX = cx - (cx - this.translateX) * scaleRatio;
                    this.translateY = cy - (cy - this.translateY) * scaleRatio;
                    this.scale = newScale;

                    this._applyTransform();
                }
                this.lastDistance = currentDist;
            }
        }, { passive: false });

        this.container.addEventListener('touchend', (e) => {
            this.isPanning = false;
            this.lastDistance = 0;

            // [K-2] _handleTap() NUR aufrufen, wenn keine signifikante Bewegung stattfand
            if (e.changedTouches.length === 1 && e.touches.length === 0) {
                if (!this.hasMovedSignificant) {
                    this._handleTap(e.changedTouches[0]);
                }
            }
            this.hasMovedSignificant = false;
        });
    }

    _getDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    _applyTransform() {
        const transformStr = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
        if (this.canvas) {
            this.canvas.style.transform = transformStr;
            this.canvas.style.transformOrigin = '0 0';
        }
        if (this.overlay) {
            this.overlay.style.transform = transformStr;
            this.overlay.style.transformOrigin = '0 0';
        }
    }

    resetView() {
        this.scale = 1.0;
        this.translateX = 0;
        this.translateY = 0;
        this._applyTransform();
    }

    _handleTap(touch) {
        if (!this.container) return;
        const rect = this.container.getBoundingClientRect();
        const clickX = touch.clientX - rect.left;
        const clickY = touch.clientY - rect.top;

        const planX = (clickX - this.translateX) / this.scale;
        const planY = (clickY - this.translateY) / this.scale;

        const baseW = this.baseViewport ? this.baseViewport.width : (this.canvas ? this.canvas.width : 2000);
        const baseH = this.baseViewport ? this.baseViewport.height : (this.canvas ? this.canvas.height : 1000);

        if (planX >= 0 && planX <= baseW && planY >= 0 && planY <= baseH) {
            const coords = OfflinePlanViewer.calculateNormalizedCoordinates(planX, planY, baseW, baseH);
            if (this.onPlanClick) {
                this.onPlanClick(coords);
            }
        }
    }

    /**
     * Rendert Mängel-Pins lagerichtig auf dem HTML-Overlay-Layer mit geometrischen Symbolen.
     * @param {Array<Object>} maengelList 
     */
    renderPins(maengelList = []) {
        if (!this.overlay) return;
        this.overlay.innerHTML = '';

        // [H-2] Barrierefreie geometrische Symbole für Farbenblindheit
        const symbols = {
            RED: '▲ !',
            YELLOW: '◆ ⏳',
            GREEN: '● ✓',
            GRAY: '■ —'
        };

        for (const m of maengelList) {
            const pin = document.createElement('div');
            pin.className = 'plan-pin';
            pin.dataset.uuid = m.uuid || m.id;

            const ampel = OfflinePlanViewer.calculateFristAmpel(m.frist_datum || m.nachbesserungsfrist, m.status);
            pin.classList.add(`pin-${ampel.color.toLowerCase()}`);

            pin.style.left = `${m.x_pct || 0}%`;
            pin.style.top = `${m.y_pct || 0}%`;

            const symbol = symbols[ampel.color] || '●';
            pin.setAttribute('aria-label', `${ampel.text}: ${symbol}`);

            pin.innerHTML = `
                <div class="pin-marker" title="${ampel.text} (${symbol})">
                    <span>${symbol}</span>
                </div>
            `;

            pin.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onPinClick) {
                    this.onPinClick(m);
                }
            });

            this.overlay.appendChild(pin);
        }
    }
}

if (typeof window !== 'undefined') {
    window.OfflinePlanViewer = OfflinePlanViewer;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OfflinePlanViewer;
}
