(function() {
    // =========================================================================
    // Kamera & Foto-Markup
    
    // =========================================================================
    window.fileInputFallback = null;
    
    function triggerCameraCapture() {
        if (!fileInputFallback) {
            fileInputFallback = CameraEngine.createFileInputElement(async (file) => {
                await handleCapturedPhoto(file);
            });
        }
        fileInputFallback.click();
    }
    
    let markupBaseImage = null;
    let isDrawingMarkup = false;
    let markupStartX = 0;
    let markupStartY = 0;
    
    function setupMarkupCanvas() {
        const canvas = document.getElementById('markup-canvas');
        if (!canvas) return;
    
        const getPos = (e) => {
            const rect = canvas.getBoundingClientRect();
            const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches && e.touches.length > 0 ? e.touches[0].clientY : e.clientY;
            const scaleX = canvas.width / (rect.width || 1);
            const scaleY = canvas.height / (rect.height || 1);
            return {
                x: (clientX - rect.left) * scaleX,
                y: (clientY - rect.top) * scaleY
            };
        };
    
        const redrawAll = (ctx) => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (markupBaseImage) {
                ctx.drawImage(markupBaseImage, 0, 0, canvas.width, canvas.height);
            }
            for (const action of markupActions) {
                drawMarkupItem(ctx, action);
            }
        };
    
        const startDraw = (e) => {
            if (e.cancelable) e.preventDefault();
            isDrawingMarkup = true;
            const pos = getPos(e);
            markupStartX = pos.x;
            markupStartY = pos.y;
    
            if (markupMode === 'freehand') {
                markupActions.push({
                    type: 'freehand',
                    color: '#ef4444',
                    lineWidth: 4,
                    points: [{ x: pos.x, y: pos.y }]
                });
            }
        };
    
        const draw = (e) => {
            if (!isDrawingMarkup) return;
            if (e.cancelable) e.preventDefault();
            const pos = getPos(e);
            const ctx = canvas.getContext('2d');
    
            if (markupMode === 'freehand') {
                const cur = markupActions[markupActions.length - 1];
                if (cur && cur.points) {
                    cur.points.push({ x: pos.x, y: pos.y });
                }
                redrawAll(ctx);
            } else if (markupMode === 'circle') {
                redrawAll(ctx);
                drawCircle(ctx, markupStartX, markupStartY, pos.x, pos.y, '#ef4444', 4);
            } else if (markupMode === 'arrow') {
                redrawAll(ctx);
                drawArrow(ctx, markupStartX, markupStartY, pos.x, pos.y, '#ef4444', 4);
            }
        };
    
        const stopDraw = (e) => {
            if (!isDrawingMarkup) return;
            isDrawingMarkup = false;
            const ctx = canvas.getContext('2d');
            const pos = e.changedTouches && e.changedTouches.length > 0 ? {
                x: (e.changedTouches[0].clientX - canvas.getBoundingClientRect().left) * (canvas.width / (canvas.getBoundingClientRect().width || 1)),
                y: (e.changedTouches[0].clientY - canvas.getBoundingClientRect().top) * (canvas.height / (canvas.getBoundingClientRect().height || 1))
            } : (e.clientX ? getPos(e) : { x: markupStartX, y: markupStartY });
    
            if (markupMode === 'circle') {
                markupActions.push({
                    type: 'circle',
                    x1: markupStartX,
                    y1: markupStartY,
                    x2: pos.x,
                    y2: pos.y,
                    color: '#ef4444',
                    lineWidth: 4
                });
            } else if (markupMode === 'arrow') {
                markupActions.push({
                    type: 'arrow',
                    x1: markupStartX,
                    y1: markupStartY,
                    x2: pos.x,
                    y2: pos.y,
                    color: '#ef4444',
                    lineWidth: 4
                });
            }
            redrawAll(ctx);
        };
    
        canvas.addEventListener('mousedown', startDraw);
        canvas.addEventListener('mousemove', draw);
        window.addEventListener('mouseup', stopDraw);
    
        // [K-5] Touch-Listener für mobile Touchscreens registrieren
        canvas.addEventListener('touchstart', startDraw, { passive: false });
        canvas.addEventListener('touchmove', draw, { passive: false });
        window.addEventListener('touchend', stopDraw);
    }
    
    function drawCircle(ctx, x1, y1, x2, y2, color = '#ef4444', width = 4) {
        const rx = Math.abs(x2 - x1) / 2;
        const ry = Math.abs(y2 - y1) / 2;
        const cx = Math.min(x1, x2) + rx;
        const cy = Math.min(y1, y2) + ry;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx || 1, ry || 1, 0, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.restore();
    }
    
    function drawArrow(ctx, fromx, fromy, tox, toy, color = '#ef4444', width = 4) {
        const headlen = 16;
        const dx = tox - fromx;
        const dy = toy - fromy;
        const angle = Math.atan2(dy, dx);
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = width;
    
        ctx.beginPath();
        ctx.moveTo(fromx, fromy);
        ctx.lineTo(tox, toy);
        ctx.stroke();
    
        ctx.beginPath();
        ctx.moveTo(tox, toy);
        ctx.lineTo(tox - headlen * Math.cos(angle - Math.PI / 6), toy - headlen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(tox - headlen * Math.cos(angle + Math.PI / 6), toy - headlen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
    
    function drawMarkupItem(ctx, action) {
        if (action.type === 'freehand' && action.points && action.points.length > 1) {
            ctx.save();
            ctx.strokeStyle = action.color || '#ef4444';
            ctx.lineWidth = action.lineWidth || 4;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(action.points[0].x, action.points[0].y);
            for (let i = 1; i < action.points.length; i++) {
                ctx.lineTo(action.points[i].x, action.points[i].y);
            }
            ctx.stroke();
            ctx.restore();
        } else if (action.type === 'circle') {
            drawCircle(ctx, action.x1, action.y1, action.x2, action.y2, action.color, action.lineWidth);
        } else if (action.type === 'arrow') {
            drawArrow(ctx, action.x1, action.y1, action.x2, action.y2, action.color, action.lineWidth);
        }
    }
    
    async function handleCapturedPhoto(file) {
        try {
            const res = await CameraEngine.processAndWatermarkPhoto(file, {
                projektNr: document.getElementById('cam-projekt-select')?.value || 'BAUSTELLE',
                datum: new Date().toLocaleString('de-DE')
            });
    
            currentPhotoBlob = res.blob || file;
            const container = document.getElementById('photo-preview-container');
            if (container) container.style.display = 'block';
    
            markupActions = [];
            const canvas = document.getElementById('markup-canvas');
            if (canvas && res.dataUrl) {
                canvas.width = canvas.parentElement.clientWidth || 300;
                canvas.height = 240;
                const ctx = canvas.getContext('2d');
                const img = new Image();
                img.onload = () => {
                    markupBaseImage = img;
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                };
                img.src = res.dataUrl;
            }
    
            // Lieferschein Vorschau Kontrastoptimierung
            const lsCanvas = document.getElementById('ls-contrast-canvas');
            if (lsCanvas && res.dataUrl) {
                const prev = document.getElementById('ls-preview-container');
                if (prev) prev.style.display = 'block';
                lsCanvas.width = 300;
                lsCanvas.height = 200;
                const lsCtx = lsCanvas.getContext('2d');
                const img = new Image();
                img.onload = () => {
                    lsCtx.drawImage(img, 0, 0, lsCanvas.width, lsCanvas.height);
                    BarcodeScannerEngine.enhanceLieferscheinContrast(lsCanvas);
                };
                img.src = res.dataUrl;
            }
        } catch (e) {
            alert('Kamerafehler: ' + e.message);
        }
    }
    
    function setMarkupMode(mode) {
        markupMode = mode;
        const modeNames = { circle: '⭕ Kreis', arrow: '➡️ Pfeil', freehand: '✏️ Stift' };
        if (typeof showToast === 'function') {
            showToast('Zeichenmodus: ' + (modeNames[mode] || mode));
        }
    }
    
    async function saveCompressedPhoto() {
        const canvas = document.getElementById('markup-canvas');
        if (!currentPhotoBlob && !canvas) {
            alert('Kein Foto vorhanden.');
            return;
        }
    
        let finalBlob = currentPhotoBlob;
        if (canvas && typeof canvas.toBlob === 'function') {
            try {
                const blobFromCanvas = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
                if (blobFromCanvas) {
                    finalBlob = blobFromCanvas;
                }
            } catch (_bErr) {
                finalBlob = currentPhotoBlob;
            }
        }
    
        const projId = document.getElementById('cam-projekt-select')?.value;
        const uuid = ZeiterfassungController.generateUUID();
    
        const photoEntry = {
            uuid,
            entitaet_typ: 'MANGEL',
            entitaet_uuid: projId || '',
            blob: finalBlob,
            sha256_hash: '',
            is_synced: 0,
            created_at: new Date().toISOString()
        };
    
        await window.mobileDb.local_fotos.put(photoEntry);
        alert('✓ Foto mit Markups gespeichert! Wird im Hintergrund zum Desktop-Hub gestreamt.');
        document.getElementById('photo-preview-container').style.display = 'none';
    }
    

    
    // Expose to window for browser
    window.triggerCameraCapture = triggerCameraCapture;
    window.setupMarkupCanvas = setupMarkupCanvas;
    window.drawCircle = drawCircle;
    window.drawArrow = drawArrow;
    window.drawMarkupItem = drawMarkupItem;
    window.handleCapturedPhoto = handleCapturedPhoto;
    window.setMarkupMode = setMarkupMode;
    window.saveCompressedPhoto = saveCompressedPhoto;
    
    // Export for Node.js tests
    if (typeof module !== 'undefined' && module.exports) {
        module.exports.triggerCameraCapture = triggerCameraCapture;
        module.exports.setupMarkupCanvas = setupMarkupCanvas;
        module.exports.drawCircle = drawCircle;
        module.exports.drawArrow = drawArrow;
        module.exports.drawMarkupItem = drawMarkupItem;
        module.exports.handleCapturedPhoto = handleCapturedPhoto;
        module.exports.setMarkupMode = setMarkupMode;
        module.exports.saveCompressedPhoto = saveCompressedPhoto;
    }
    
})();
