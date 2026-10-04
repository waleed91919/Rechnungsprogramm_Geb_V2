(function() {
    // =========================================================================
    // STUFE 3: BGL-Gerätestunden & Digitale Lieferscheine
    
    // =========================================================================
    window.scannerStream = null;
    window.scannerScanInterval = null;
    let onBarcodeDetectedCallback = null;
    
    async function openBarcodeScanner(onSuccess) {
        onBarcodeDetectedCallback = onSuccess;
        const modal = document.getElementById('barcode-scanner-modal');
        const video = document.getElementById('barcode-scanner-video');
        const status = document.getElementById('barcode-scanner-status');
        if (!modal) {
            const code = prompt('Barcode / QR-Code eingeben:');
            if (code && typeof onSuccess === 'function') onSuccess(code);
            return;
        }
    
        modal.style.display = 'flex';
        if (status) status.textContent = 'Kamera wird initialisiert...';
    
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Kamera-Zugriff im Browser nicht unterstützt.');
            }
    
            scannerStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            if (video) {
                video.srcObject = scannerStream;
                await video.play();
            }
            if (status) status.textContent = 'Halten Sie den Code vor die Kamera';
    
            scannerScanInterval = setInterval(async () => {
                if (!video || video.readyState < 2) return;
                try {
                    const barcodes = await BarcodeScannerEngine.detectBarcodes(video);
                    if (barcodes && barcodes.length > 0) {
                        const code = barcodes[0].rawValue;
                        closeBarcodeScannerModal();
                        if (typeof onBarcodeDetectedCallback === 'function') {
                            onBarcodeDetectedCallback(code);
                        }
                    }
                } catch (err) {
                    console.warn('[BarcodeScanner] Frame Scan:', err);
                }
            }, 300);
        } catch (e) {
            if (status) status.textContent = 'Kamera nicht verfügbar: ' + e.message;
            setTimeout(() => {
                closeBarcodeScannerModal();
                const manualCode = prompt('Kamera nicht verfügbar (' + e.message + '). Bitte Code manuell eingeben:');
                if (manualCode && typeof onSuccess === 'function') {
                    onSuccess(manualCode);
                }
            }, 800);
        }
    }
    
    function closeBarcodeScannerModal() {
        if (scannerScanInterval) {
            clearInterval(scannerScanInterval);
            scannerScanInterval = null;
        }
        if (scannerStream) {
            scannerStream.getTracks().forEach(track => track.stop());
            scannerStream = null;
        }
        const video = document.getElementById('barcode-scanner-video');
        if (video) video.srcObject = null;
        const modal = document.getElementById('barcode-scanner-modal');
        if (modal) modal.style.display = 'none';
        onBarcodeDetectedCallback = null;
    }
    
    function scanGeraetQrCode() {
        openBarcodeScanner((code) => {
            const input = document.getElementById('ger-code-input');
            if (input) input.value = code;
            alert('✓ Barcode/QR erkannt: ' + code);
        });
    }
    
    async function saveGeraetBookingForm() {
        if (!window.mobileDb) return;
        const projId = document.getElementById('ger-projekt-select')?.value;
        const code = document.getElementById('ger-code-input')?.value;
        const stunden = parseFloat(document.getElementById('ger-stunden-input')?.value) || 0;
        const stillstand = parseFloat(document.getElementById('ger-stillstand-input')?.value) || 0;
        const grund = document.getElementById('ger-grund-input')?.value || '';
    
        if (!code) {
            alert('Bitte Geräte-Code angeben.');
            return;
        }
    
        await BarcodeScannerEngine.bookGeraet(window.mobileDb, syncWorker, {
            projektId: projId || 1,
            geraetCode: code,
            betriebsstunden: stunden,
            stillstandStunden: stillstand,
            stillstandGrund: grund
        });
    
        alert('✓ Gerätestunden erfolgreich gebucht & in Sync-Warteschlange eingereiht!');
        document.getElementById('ger-code-input').value = '';
        document.getElementById('ger-grund-input').value = '';
    }
    
    let capturedLieferscheinCanvas = null;
    
    function triggerLieferscheinCapture() {
        triggerCameraCapture();
    }
    
    async function saveCapturedLieferschein() {
        if (!window.mobileDb) return;
        const projId = document.getElementById('ls-projekt-select')?.value;
        const lieferant = document.getElementById('ls-lieferant-input')?.value;
        const nr = document.getElementById('ls-nummer-input')?.value;
    
        await BarcodeScannerEngine.saveDigitalLieferschein(window.mobileDb, syncWorker, {
            projektId: projId || 1,
            lieferantName: lieferant,
            lieferscheinNr: nr,
            sha256Hash: 'mock-sha256'
        });
    
        alert('✓ Lieferschein mit Kontrastfilter lokal gepuffert!');
        const prev = document.getElementById('ls-preview-container');
        if (prev) prev.style.display = 'none';
    }
    
    
    // =========================================================================
    // Bautagebuch
    
    // =========================================================================
    function setWeather(code) {
        const el = document.getElementById('bt-wetter-val');
        if (el) el.value = code;
        alert('Wetter gewählt: ' + code);
    }
    
    async function saveBautagesbericht() {
        const projId = document.getElementById('bt-projekt-select')?.value;
        const datum = document.getElementById('bt-datum-input')?.value;
        const bericht = document.getElementById('bt-bericht-text')?.value;
        const vorkommnisse = document.getElementById('bt-vorkommnisse-text')?.value;
        const wetter = document.getElementById('bt-wetter-val')?.value || 'SONNIG';
        const eigenAnzahl = parseInt(document.getElementById('bt-eigen-count')?.value, 10) || 1;
        const eigenStunden = parseFloat(document.getElementById('bt-eigen-hours')?.value) || 8.0;
    
        if (!projId || !datum || !bericht) {
            alert('Bitte füllen Sie alle Pflichtfelder (Projekt, Datum, Tagesbericht) aus.');
            return;
        }
    
        try {
            const report = BautagebuchMobileController.buildDailyReport({
                projekt_id: projId,
                datum,
                tagesbericht: bericht,
                vorkommnisse,
                wetter_code: wetter,
                personal_eigen_anzahl: eigenAnzahl,
                personal_eigen_stunden: eigenStunden
            });
    
            await window.mobileDb.local_bautagebuch.put(report);
            if (syncWorker) {
                await syncWorker.queueMutation('BAUTAGEBUCH', report.uuid, 'INSERT', report);
            }
    
            alert('Tagesbericht erfolgreich lokal gespeichert & in Sync-Outbox übertragen!');
            document.getElementById('bt-bericht-text').value = '';
            document.getElementById('bt-vorkommnisse-text').value = '';
        } catch (e) {
            alert('Fehler: ' + e.message);
        }
    }
    
    
    // =========================================================================
    // VOB/B Meldungen & Touch-Signatur
    
    // =========================================================================
    function toggleVobFields() {
        const typ = document.getElementById('vob-typ-select')?.value;
        const bedFields = document.getElementById('vob-bedenken-fields');
        const behFields = document.getElementById('vob-behinderung-fields');
    
        if (typ === 'BEHINDERUNG_6_1') {
            if (bedFields) bedFields.style.display = 'none';
            if (behFields) behFields.style.display = 'block';
        } else {
            if (bedFields) bedFields.style.display = 'block';
            if (behFields) behFields.style.display = 'none';
        }
    }
    
    function setupSignatureCanvas() {
        const canvas = document.getElementById('signature-canvas');
        if (!canvas) return;
    
        canvas.width = canvas.parentElement.clientWidth || 300;
        canvas.height = 160;
        signaturePadCtx = canvas.getContext('2d');
        signaturePadCtx.strokeStyle = '#0f172a';
        signaturePadCtx.lineWidth = 2.5;
        signaturePadCtx.lineCap = 'round';
    
        const getPos = (e) => {
            const rect = canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return { x: clientX - rect.left, y: clientY - rect.top };
        };
    
        const startDraw = (e) => {
            isDrawingSignature = true;
            const { x, y } = getPos(e);
            signaturePadCtx.beginPath();
            signaturePadCtx.moveTo(x, y);
        };
    
        const draw = (e) => {
            if (!isDrawingSignature) return;
            const { x, y } = getPos(e);
            signaturePadCtx.lineTo(x, y);
            signaturePadCtx.stroke();
        };
    
        const stopDraw = () => { isDrawingSignature = false; };
    
        canvas.addEventListener('mousedown', startDraw);
        canvas.addEventListener('mousemove', draw);
        window.addEventListener('mouseup', stopDraw);
    
        canvas.addEventListener('touchstart', startDraw, { passive: true });
        canvas.addEventListener('touchmove', draw, { passive: true });
        window.addEventListener('touchend', stopDraw);
    }
    
    function clearSignature() {
        const canvas = document.getElementById('signature-canvas');
        if (canvas && signaturePadCtx) {
            signaturePadCtx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
    
    async function saveVobMeldungForm() {
        const typ = document.getElementById('vob-typ-select')?.value;
        const projId = document.getElementById('vob-projekt-select')?.value;
        const betreff = document.getElementById('vob-betreff-input')?.value;
        const sachverhalt = document.getElementById('vob-sachverhalt-text')?.value;
    
        if (!projId || !betreff || !sachverhalt) {
            alert('Bitte alle Pflichtfelder (Projekt, Betreff, Sachverhalt) ausfüllen.');
            return;
        }
    
        const canvas = document.getElementById('signature-canvas');
        const sigSvg = canvas ? `<svg viewBox="0 0 ${canvas.width} ${canvas.height}"><image href="${canvas.toDataURL()}" width="${canvas.width}" height="${canvas.height}"/></svg>` : null;
    
        let payload;
        if (typ === 'BEHINDERUNG_6_1') {
            const beginn = document.getElementById('vob-beginn-date')?.value || new Date().toISOString().split('T')[0];
            const verzug = parseInt(document.getElementById('vob-verzug-tage')?.value, 10) || 1;
            payload = BautagebuchMobileController.createBehinderungsanzeige({
                projekt_id: projId,
                hinderungsgrund: sachverhalt,
                betreff,
                beginn_datum: beginn,
                auswirkung_bauzeit_tage: verzug,
                unterschrift_svg: sigSvg
            });
        } else {
            const kategorie = document.getElementById('vob-kategorie-select')?.value || 'VORLEISTUNG_UNGEEIGNET';
            payload = BautagebuchMobileController.createBedenkenanzeige({
                projekt_id: projId,
                betreff,
                begruendung: sachverhalt,
                kategorie,
                unterschrift_svg: sigSvg
            });
        }
    
        await window.mobileDb.local_vob_meldungen.put(payload);
        if (syncWorker) {
            await syncWorker.queueMutation('VOB_MELDUNG', payload.uuid, 'INSERT', payload);
        }
    
        alert('Formelle VOB-Meldung erfolgreich erstellt & in Sync-Queue abgelegt!');
        document.getElementById('vob-betreff-input').value = '';
        document.getElementById('vob-sachverhalt-text').value = '';
        clearSignature();
    }
    

    
    // Expose to window for browser
    window.openBarcodeScanner = openBarcodeScanner;
    window.closeBarcodeScannerModal = closeBarcodeScannerModal;
    window.scanGeraetQrCode = scanGeraetQrCode;
    window.saveGeraetBookingForm = saveGeraetBookingForm;
    window.triggerLieferscheinCapture = triggerLieferscheinCapture;
    window.saveCapturedLieferschein = saveCapturedLieferschein;
    window.setWeather = setWeather;
    window.saveBautagesbericht = saveBautagesbericht;
    window.toggleVobFields = toggleVobFields;
    window.setupSignatureCanvas = setupSignatureCanvas;
    window.clearSignature = clearSignature;
    window.saveVobMeldungForm = saveVobMeldungForm;
    
    // Export for Node.js tests
    if (typeof module !== 'undefined' && module.exports) {
        module.exports.openBarcodeScanner = openBarcodeScanner;
        module.exports.closeBarcodeScannerModal = closeBarcodeScannerModal;
        module.exports.scanGeraetQrCode = scanGeraetQrCode;
        module.exports.saveGeraetBookingForm = saveGeraetBookingForm;
        module.exports.triggerLieferscheinCapture = triggerLieferscheinCapture;
        module.exports.saveCapturedLieferschein = saveCapturedLieferschein;
        module.exports.setWeather = setWeather;
        module.exports.saveBautagesbericht = saveBautagesbericht;
        module.exports.toggleVobFields = toggleVobFields;
        module.exports.setupSignatureCanvas = setupSignatureCanvas;
        module.exports.clearSignature = clearSignature;
        module.exports.saveVobMeldungForm = saveVobMeldungForm;
    }
    
})();
