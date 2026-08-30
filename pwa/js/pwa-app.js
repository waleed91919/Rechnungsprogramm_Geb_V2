/**
 * pwa/js/pwa-app.js - PWA App-Orchestrator & Touch-UI Controller
 */

let syncWorker = null;
let currentActivePunch = null;
let liveTimerInterval = null;
let signaturePadCtx = null;
let isDrawingSignature = false;
let currentPhotoBlob = null;
let markupActions = [];
let markupMode = 'circle';

// Initialisierung bei DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Service Worker registrieren
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('./sw.js');
            console.log('[PWA] ServiceWorker erfolgreich registriert.');
        } catch (e) {
            console.warn('[PWA] ServiceWorker Registrierung fehlgeschlagen:', e.message);
        }
    }

    // 2. Sync Worker initialisieren
    if (window.mobileDb) {
        syncWorker = new MobileSyncWorker(window.mobileDb);
        syncWorker.onSyncProgress = (res) => updateSyncStatusUI(res);
        syncWorker.startAutoSync(25);
    }

    // 3. Stammdaten in Dropdowns laden
    await loadCachedMasterData();

    // 4. Heutige Stempelungen laden
    await renderTodayPunches();

    // 5. Timer & Datum starten
    startLiveClock();

    // 6. Signatur-Canvas einrichten
    setupSignatureCanvas();

    // 7. Form-Defaults setzen
    const todayStr = new Date().toISOString().split('T')[0];
    const btDate = document.getElementById('bt-datum-input');
    if (btDate) btDate.value = todayStr;
    const vobDate = document.getElementById('vob-beginn-date');
    if (vobDate) vobDate.value = todayStr;

    // 8. Server-Konfiguration laden
    loadServerConfig();
});

// =========================================================================
// Tab-Navigation
// =========================================================================
function switchTab(tabName) {
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    const targetTab = document.getElementById(`tab-${tabName}`);
    if (targetTab) targetTab.classList.add('active');

    const navItem = document.getElementById(`nav-tab-${tabName}`);
    if (navItem) navItem.classList.add('active');

    if (tabName === 'sync') {
        updateOutboxCount();
    }
}

// =========================================================================
// Stammdaten & Dropdowns
// =========================================================================
async function loadCachedMasterData() {
    if (!window.mobileDb) return;

    try {
        const mitarbeiter = await window.mobileDb.cache_mitarbeiter.toArray();
        const maSelect = document.getElementById('punch-mitarbeiter-select');
        if (maSelect) {
            maSelect.innerHTML = '<option value="">-- Mitarbeiter wählen --</option>';
            mitarbeiter.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = `${m.vorname} ${m.nachname} (${m.personalnummer})`;
                maSelect.appendChild(opt);
            });
        }

        const projekte = await window.mobileDb.cache_projekte.toArray();
        const pSelects = [
            document.getElementById('punch-projekt-select'),
            document.getElementById('bt-projekt-select'),
            document.getElementById('vob-projekt-select'),
            document.getElementById('cam-projekt-select')
        ];

        pSelects.forEach(select => {
            if (!select) return;
            select.innerHTML = '<option value="">-- Projekt wählen --</option>';
            projekte.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                select.appendChild(opt);
            });
        });
    } catch (e) {
        console.warn('[PWA] Stammdaten-Laden:', e.message);
    }
}

// =========================================================================
// Stempeluhr-Logik (BAG / ArbZG / BRTV)
// =========================================================================
async function handlePunch(actionType) {
    const maId = document.getElementById('punch-mitarbeiter-select')?.value;
    if (!maId) {
        alert('Bitte wählen Sie zuerst einen Mitarbeiter aus.');
        return;
    }

    const projId = document.getElementById('punch-projekt-select')?.value || null;
    const taetigkeit = document.getElementById('punch-taetigkeit-select')?.value || 'PRODUKTIV';
    const nowIso = new Date().toISOString();

    let geoSnapshot = { lat: null, lng: null };
    if (navigator.geolocation) {
        try {
            const pos = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 });
            });
            geoSnapshot.lat = pos.coords.latitude;
            geoSnapshot.lng = pos.coords.longitude;
        } catch (_geoErr) { /* Kein Geofence zwingend */ }
    }

    if (actionType === 'KOMMEN') {
        const uuid = ZeiterfassungController.generateUUID();
        const punch = {
            uuid,
            mitarbeiter_id: parseInt(maId, 10),
            projekt_id: projId ? parseInt(projId, 10) : null,
            taetigkeit_typ: taetigkeit,
            zeit_von: nowIso,
            zeit_bis: null,
            dauer_min: 0,
            pause_min: 0,
            geo_lat: geoSnapshot.lat,
            geo_lng: geoSnapshot.lng,
            status: 'ERFASST',
            is_synced: 0,
            created_at: nowIso
        };

        await window.mobileDb.local_zeiterfassung.put(punch);
        if (syncWorker) {
            await syncWorker.queueMutation('ZEITERFASSUNG', uuid, 'INSERT', punch);
        }
        currentActivePunch = punch;
        alert('Eingestempelt um ' + new Date().toLocaleTimeString('de-DE'));

    } else if (actionType === 'PAUSE') {
        // Find latest open or today's punch
        const punches = await window.mobileDb.local_zeiterfassung.toArray();
        const open = punches.filter(p => p.mitarbeiter_id === parseInt(maId, 10) && !p.zeit_bis).pop();
        if (open) {
            open.pause_min = (open.pause_min || 0) + 30;
            await window.mobileDb.local_zeiterfassung.put(open);
            if (syncWorker) {
                await syncWorker.queueMutation('ZEITERFASSUNG', open.uuid, 'UPDATE', open);
            }
            alert('30 Minuten Pause verbucht.');
        } else {
            alert('Keine laufende Schicht gefunden. Bitte zuerst KOMMEN stempeln.');
        }

    } else if (actionType === 'GEHEN') {
        const punches = await window.mobileDb.local_zeiterfassung.toArray();
        const open = punches.filter(p => p.mitarbeiter_id === parseInt(maId, 10) && !p.zeit_bis).pop();
        if (open) {
            open.zeit_bis = nowIso;
            const workCalc = ZeiterfassungController.calculateWorkTime(open.zeit_von, open.zeit_bis, open.pause_min || 0);
            if (workCalc.valid) {
                open.dauer_min = workCalc.nettoMin;
                open.pause_min = workCalc.effektivePauseMin;
            }

            // Wegezeitentschädigung berechnen
            const wege = ZeiterfassungController.calculateBRTVWegezeit(30, true, 8.5);
            open.wegezeit_eur = wege.entschädigungEur;

            await window.mobileDb.local_zeiterfassung.put(open);
            if (syncWorker) {
                await syncWorker.queueMutation('ZEITERFASSUNG', open.uuid, 'UPDATE', open);
            }
            currentActivePunch = null;

            let msg = `Ausgestempelt! Nettoarbeitszeit: ${workCalc.nettoStunden || 0} h (Pause: ${open.pause_min} Min).`;
            if (workCalc.hasVerstoss) {
                msg += '\n\nACHTUNG: ' + workCalc.verstoesse.join('\n');
            }
            alert(msg);
        } else {
            alert('Keine offene Schicht zum Beenden vorhanden.');
        }
    }

    await renderTodayPunches();
}

async function renderTodayPunches() {
    const listEl = document.getElementById('today-punches-list');
    if (!listEl || !window.mobileDb) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const all = await window.mobileDb.local_zeiterfassung.toArray();
    const today = all.filter(p => p.zeit_von && p.zeit_von.startsWith(todayStr));

    if (today.length === 0) {
        listEl.innerHTML = '<p style="color: var(--text-muted); font-size: 13px;">Noch keine Stempelungen für heute.</p>';
        return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
    for (const p of today) {
        const von = new Date(p.zeit_von).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        const bis = p.zeit_bis ? new Date(p.zeit_bis).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : 'LÄUFT...';
        html += `
            <div style="background: var(--bg-main); padding: 10px; border-radius: 8px; font-size: 13px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>${von} - ${bis}</strong>
                    <div style="color: var(--text-muted); font-size: 11px;">${p.taetigkeit_typ} | Pause: ${p.pause_min || 0}m</div>
                </div>
                <div style="font-weight: bold; color: var(--primary);">
                    ${p.dauer_min ? (p.dauer_min / 60).toFixed(2) + ' h' : 'aktiv'}
                </div>
            </div>
        `;
    }
    html += '</div>';
    listEl.innerHTML = html;
}

function startLiveClock() {
    const display = document.getElementById('live-timer-display');
    const dateLabel = document.getElementById('current-date-label');
    if (dateLabel) dateLabel.textContent = new Date().toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });

    setInterval(() => {
        if (display) {
            display.textContent = new Date().toLocaleTimeString('de-DE');
        }
    }, 1000);
}

function triggerQrScan() {
    alert('QR-Scanner: Bitte halten Sie die Kamera auf den Bauwerk-QR-Code.');
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

// =========================================================================
// Kamera & Foto-Markup
// =========================================================================
let fileInputFallback = null;

function triggerCameraCapture() {
    if (!fileInputFallback) {
        fileInputFallback = CameraEngine.createFileInputElement(async (file) => {
            await handleCapturedPhoto(file);
        });
    }
    fileInputFallback.click();
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

        const canvas = document.getElementById('markup-canvas');
        if (canvas && res.dataUrl) {
            canvas.width = canvas.parentElement.clientWidth || 300;
            canvas.height = 240;
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            img.src = res.dataUrl;
        }
    } catch (e) {
        alert('Kamerafehler: ' + e.message);
    }
}

function setMarkupMode(mode) {
    markupMode = mode;
    alert('Zeichenmodus: ' + mode);
}

async function saveCompressedPhoto() {
    if (!currentPhotoBlob) {
        alert('Kein Foto vorhanden.');
        return;
    }

    const projId = document.getElementById('cam-projekt-select')?.value;
    const titel = document.getElementById('cam-titel-input')?.value || 'Mangel';
    const uuid = ZeiterfassungController.generateUUID();

    const photoEntry = {
        uuid,
        entitaet_typ: 'MANGEL',
        entitaet_uuid: projId || '',
        blob: currentPhotoBlob,
        sha256_hash: '',
        is_synced: 0,
        created_at: new Date().toISOString()
    };

    await window.mobileDb.local_fotos.put(photoEntry);
    alert('Foto gespeichert! Wird im Hintergrund zum Desktop-Hub gestreamt.');
    document.getElementById('photo-preview-container').style.display = 'none';
}

// =========================================================================
// Sync & Server-Pairing
// =========================================================================
async function loadServerConfig() {
    if (!window.mobileDb) return;
    const cfg = await window.mobileDb.app_settings.get('server_config');
    if (cfg && cfg.server_url) {
        const urlInput = document.getElementById('sync-server-url');
        if (urlInput) urlInput.value = cfg.server_url;
        updateSyncStatusUI({ status: 'ONLINE', serverUrl: cfg.server_url });
    }
}

async function connectAndPairServer() {
    const url = document.getElementById('sync-server-url')?.value;
    const token = document.getElementById('sync-pairing-token')?.value;

    if (!url) {
        alert('Bitte Server-URL angeben.');
        return;
    }

    try {
        const cleanUrl = url.replace(/\/+$/, '');
        const res = await fetch(`${cleanUrl}/api/v1/sync/pair`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pairing_token: token,
                device_id: 'MOBILE_PWA_' + Math.random().toString(36).substring(2, 7)
            })
        });

        if (res.ok) {
            await window.mobileDb.app_settings.put({
                key: 'server_config',
                server_url: cleanUrl,
                paired_at: new Date().toISOString()
            });
            alert('Erfolgreich mit Desktop ERP gekoppelt!');
            triggerManualSync();
        } else {
            alert('Kopplung fehlgeschlagen (HTTP ' + res.status + ')');
        }
    } catch (e) {
        alert('Verbindungsfehler: ' + e.message);
    }
}

async function triggerManualSync() {
    if (!syncWorker) return;
    updateSyncStatusUI({ status: 'SYNCING' });
    const res = await syncWorker.runFullSync();
    updateSyncStatusUI(res);
    await loadCachedMasterData();
    await updateOutboxCount();
    alert(res.status === 'SUCCESS' ? `Synchronisation abgeschlossen! (${res.pushCount} gesendet, Stammdaten aktualisiert)` : `Sync-Status: ${res.status}`);
}

async function updateOutboxCount() {
    if (!window.mobileDb) return;
    const count = await window.mobileDb.sync_outbox.where('status').equals('PENDING').toArray();
    const countLabel = document.getElementById('outbox-count-label');
    if (countLabel) countLabel.textContent = count.length;
}

function updateSyncStatusUI(info) {
    const dot = document.getElementById('sync-dot');
    const text = document.getElementById('sync-text');

    if (info && info.status === 'SUCCESS') {
        if (dot) { dot.className = 'status-dot'; }
        if (text) { text.textContent = 'Verbunden'; }
    } else if (info && info.status === 'ERROR') {
        if (dot) { dot.className = 'status-dot error'; }
        if (text) { text.textContent = 'Fehler'; }
    }
}
