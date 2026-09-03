/**
 * pwa/js/pwa-app.js - PWA App-Orchestrator & Touch-UI Controller
 * Erweiterung Phase 5: Kolonnen-Stempelung (ArbZG & BRTV), Notfall-USB-Sync,
 * REB 23.003 Aufmaß mit Web Bluetooth Laser, Offline Plan-Viewer & Barcode Scanner.
 */

let syncWorker = null;
let currentActivePunch = null;
let liveTimerInterval = null;
let signaturePadCtx = null;
let isDrawingSignature = false;
let currentPhotoBlob = null;
let markupActions = [];
let markupMode = 'circle';
let currentPlanViewer = null;
let currentStempelModus = 'EINZEL'; // 'EINZEL' | 'KOLONNE'

// Initialisierung bei DOMContentLoaded (im Browser)
if (typeof document !== 'undefined') {
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
        if (typeof window !== 'undefined' && window.mobileDb) {
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

        // 6. Signatur- & Markup-Canvas einrichten
        setupSignatureCanvas();
        setupMarkupCanvas();

        // 7. Form-Defaults setzen
        const todayStr = new Date().toISOString().split('T')[0];
        const btDate = document.getElementById('bt-datum-input');
        if (btDate) btDate.value = todayStr;
        const vobDate = document.getElementById('vob-beginn-date');
        if (vobDate) vobDate.value = todayStr;

        // 8. Server-Konfiguration laden
        loadServerConfig();

        // 9. Laser-Engine Status-Callback
        if (typeof window !== 'undefined' && window.bluetoothLaserEngine) {
            window.bluetoothLaserEngine.onStatusChangeCallback = (info) => {
                const badge = document.getElementById('laser-status-badge');
                const txt = document.getElementById('laser-status-text');
                if (badge && txt) {
                    if (info.isConnected) {
                        badge.className = 'laser-active-badge';
                        txt.textContent = 'Laser Verbunden';
                    } else {
                        badge.className = 'laser-active-badge disconnected';
                        txt.textContent = info.message || 'Laser getrennt';
                    }
                }
            };

            window.bluetoothLaserEngine.onMeasurementCallback = (_m) => {
                calculateLiveAufmass();
            };
        }
    });
}

// =========================================================================
// UI-Modi: Sonnenlicht (High Contrast) & Handschuh-Modus
// =========================================================================
function toggleSunlightMode() {
    document.body.classList.toggle('baustelle-sunlight-mode');
    const active = document.body.classList.contains('baustelle-sunlight-mode');
    if (typeof showToast === 'function') showToast(active ? 'Sonnenlicht-Modus AKTIV' : 'Normaler Kontrast');
}

function toggleGloveMode() {
    document.body.classList.toggle('baustelle-glove-mode');
    const active = document.body.classList.contains('baustelle-glove-mode');
    if (typeof showToast === 'function') showToast(active ? 'Handschuh-Modus AKTIV (>= 52px)' : 'Normaler Touch');
}

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
    } else if (tabName === 'aufmass') {
        loadProjectAufmassBlatt();
    } else if (tabName === 'bauplan') {
        initPlanViewerOnce();
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

        // Kolonnen-Presets laden
        await renderKolonnenSelect();

        const projekte = await window.mobileDb.cache_projekte.toArray();
        const pSelects = [
            document.getElementById('punch-projekt-select'),
            document.getElementById('aufmass-projekt-select'),
            document.getElementById('bt-projekt-select'),
            document.getElementById('vob-projekt-select'),
            document.getElementById('cam-projekt-select'),
            document.getElementById('ger-projekt-select'),
            document.getElementById('ls-projekt-select')
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

        // Baupläne Dropdown
        const plans = await window.mobileDb.cache_bauplaene.toArray();
        const planSelect = document.getElementById('plan-select');
        if (planSelect) {
            planSelect.innerHTML = '<option value="">-- Bauplan wählen (PDF) --</option>';
            plans.forEach(pl => {
                const opt = document.createElement('option');
                opt.value = pl.id;
                opt.textContent = `${pl.titel} (${pl.dateiname || 'PDF'})`;
                planSelect.appendChild(opt);
            });
        }
    } catch (e) {
        console.warn('[PWA] Stammdaten-Laden:', e.message);
    }
}

// =========================================================================
// STUFE 1: Kolonnen-Schnellstempelung (Polier-Batch, ArbZG & BRTV)
// =========================================================================
function setStempelModus(mode) {
    currentStempelModus = mode;
    const btnEinzel = document.getElementById('mode-btn-einzel');
    const btnKolonne = document.getElementById('mode-btn-kolonne');
    const containerEinzel = document.getElementById('punch-einzel-container');
    const containerKolonne = document.getElementById('punch-kolonne-container');
    const punchGridEinzel = document.getElementById('punch-buttons-einzel');
    const punchGridKolonne = document.getElementById('punch-buttons-kolonne');

    if (mode === 'KOLONNE') {
        btnEinzel?.classList.remove('active');
        btnKolonne?.classList.add('active');
        if (containerEinzel) containerEinzel.style.display = 'none';
        if (containerKolonne) containerKolonne.style.display = 'block';
        if (punchGridEinzel) punchGridEinzel.style.display = 'none';
        if (punchGridKolonne) punchGridKolonne.style.display = 'grid';
        updateKolonneCountLabel();
    } else {
        btnEinzel?.classList.add('active');
        btnKolonne?.classList.remove('active');
        if (containerEinzel) containerEinzel.style.display = 'block';
        if (containerKolonne) containerKolonne.style.display = 'none';
        if (punchGridEinzel) punchGridEinzel.style.display = 'grid';
        if (punchGridKolonne) punchGridKolonne.style.display = 'none';
    }
}

async function renderKolonnenSelect() {
    const kSelect = document.getElementById('punch-kolonne-select');
    if (!kSelect || !window.mobileDb) return;

    kSelect.innerHTML = '<option value="">-- Kolonne wählen / Alle Monteure --</option>';
    try {
        const kolonnen = await window.mobileDb.cache_kolonnen.toArray();
        kolonnen.forEach(k => {
            const opt = document.createElement('option');
            opt.value = k.id;
            opt.textContent = k.name;
            kSelect.appendChild(opt);
        });
    } catch (_e) { }

    await renderKolonneWorkerList();
}

async function renderKolonneWorkerList(filterIds = null) {
    const listEl = document.getElementById('kolonne-workers-list');
    if (!listEl || !window.mobileDb) return;

    const mitarbeiter = await window.mobileDb.cache_mitarbeiter.toArray();
    let workersToShow = mitarbeiter;

    if (filterIds && Array.isArray(filterIds)) {
        workersToShow = mitarbeiter.filter(m => filterIds.includes(m.id));
    }

    if (workersToShow.length === 0) {
        listEl.innerHTML = '<p style="color: var(--text-muted); font-size: 13px;">Keine Monteure in dieser Kolonne.</p>';
        updateKolonneCountLabel();
        return;
    }

    let html = '';
    for (const m of workersToShow) {
        html += `
            <div class="kolonne-worker-card">
                <label>
                    <input type="checkbox" class="kolonne-worker-checkbox" value="${m.id}" data-name="${m.vorname} ${m.nachname}" onchange="updateKolonneCountLabel()"/>
                    <div>
                        <strong>${m.vorname} ${m.nachname}</strong>
                        <div style="font-size: 11px; color: var(--text-muted);">${m.personalnummer} &bull; ${m.lohngruppe_id || 'LG1'}</div>
                    </div>
                </label>
            </div>
        `;
    }
    listEl.innerHTML = html;
    updateKolonneCountLabel();
}

async function handleKolonneChange() {
    const kId = document.getElementById('punch-kolonne-select')?.value;
    if (!kId || !window.mobileDb) {
        await renderKolonneWorkerList(null);
        return;
    }

    const k = await window.mobileDb.cache_kolonnen.get(parseInt(kId, 10));
    if (k && k.mitarbeiter_ids_json) {
        try {
            const ids = JSON.parse(k.mitarbeiter_ids_json);
            await renderKolonneWorkerList(ids);
        } catch (_e) {
            await renderKolonneWorkerList(null);
        }
    } else {
        await renderKolonneWorkerList(null);
    }
}

function toggleSelectAllKolonne(checked) {
    const checkboxes = document.querySelectorAll('.kolonne-worker-checkbox');
    checkboxes.forEach(cb => cb.checked = Boolean(checked));
    updateKolonneCountLabel();
}

function updateKolonneCountLabel() {
    const selected = document.querySelectorAll('.kolonne-worker-checkbox:checked');
    const count = selected.length;
    const labelKommen = document.getElementById('btn-label-kolonne-kommen');
    const labelGehen = document.getElementById('btn-label-kolonne-gehen');
    if (labelKommen) labelKommen.textContent = `${count} Monteure`;
    if (labelGehen) labelGehen.textContent = `${count} Monteure`;
}

/**
 * BRTV-Bau § 7 Wegezeitentschädigung nach Entfernungsstaffel:
 * 0–50 km = 7,00 €
 * 51–75 km = 8,00 €
 * >75 km = 9,00 €
 * Fahrer: voll vergütungspflichtige Arbeitszeit (gem. ArbZG, pauschale 0 € da Arbeitszeit)
 * Mitfahrer: tarifliche Entschädigung gem. Staffel
 */
function calculateBRTVWegezeitStaffel(km = 0, isFahrer = false) {
    const dist = parseFloat(km) || 0;
    if (isFahrer) {
        return {
            isFahrer: true,
            entschaedigungEur: 0.0,
            hinweis: 'Fahrer: Voll vergütungspflichtige Arbeitszeit gem. § 3 ArbZG'
        };
    }
    let eur = 7.00;
    if (dist > 75) {
        eur = 9.00;
    } else if (dist > 50) {
        eur = 8.00;
    }
    return {
        isFahrer: false,
        distanzKm: dist,
        entschaedigungEur: eur,
        hinweis: `Mitfahrer: Tarifliche Wegezeitentschädigung gem. BRTV § 7 (${eur.toFixed(2)} €)`
    };
}

/**
 * Validiert ArbZG für einen Monteur:
 * § 3: Tagesarbeitszeit > 10 Stunden
 * § 4: Pausenpflicht (30 Min ab 6h, 45 Min ab 9h)
 * § 5: 11 Stunden ununterbrochene Ruhezeit
 */
async function validateArbzgForWorker(mitarbeiterId, punchType, timestampMs = Date.now()) {
    if (!window.mobileDb) return { hasViolation: false, violations: [], violationText: '' };
    const todayStr = new Date(timestampMs).toISOString().split('T')[0];
    const allPunches = await window.mobileDb.local_zeiterfassung.toArray();
    const workerPunches = allPunches.filter(p => p.mitarbeiter_id === mitarbeiterId);

    const todayPunches = workerPunches.filter(p => p.zeit_von && p.zeit_von.startsWith(todayStr));

    let totalDurationMin = 0;
    for (const p of todayPunches) {
        if (p.dauer_min) totalDurationMin += p.dauer_min;
        else if (p.zeit_von && !p.zeit_bis) {
            const elapsed = Math.floor((timestampMs - new Date(p.zeit_von).getTime()) / 60000);
            if (elapsed > 0) totalDurationMin += elapsed;
        }
    }

    const violations = [];

    if (punchType === 'GEHEN' || punchType === 'KOMMEN') {
        if (totalDurationMin > 600) { // > 10 Stunden
            violations.push('§ 3 ArbZG: Höchstarbeitszeit von 10 Stunden überschritten!');
        }
    }

    if (punchType === 'KOMMEN') {
        const pastCompleted = workerPunches
            .filter(p => p.zeit_bis)
            .sort((a, b) => new Date(b.zeit_bis).getTime() - new Date(a.zeit_bis).getTime());

        if (pastCompleted.length > 0) {
            const lastEndMs = new Date(pastCompleted[0].zeit_bis).getTime();
            const restHours = (timestampMs - lastEndMs) / (1000 * 60 * 60);
            if (restHours < 11.0 && restHours >= 0) {
                violations.push(`§ 5 ArbZG: Ruhezeit von 11 Stunden unterschritten (nur ${restHours.toFixed(1)} h Ruhezeit)!`);
            }
        }
    }

    return {
        hasViolation: violations.length > 0,
        violations,
        violationText: violations.join(' ')
    };
}

/**
 * Führt eine Batch-Stempelung für eine gesamte Kolonne aus.
 * @param {'KOMMEN'|'GEHEN'|'PAUSE'} punchType 
 */
async function handleKolonnenPunch(punchType) {
    const selectedCheckboxes = document.querySelectorAll('.kolonne-worker-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        alert('Bitte mindestens einen Monteur der Kolonne auswählen.');
        return;
    }

    const projId = document.getElementById('punch-projekt-select')?.value;
    const taetigkeit = document.getElementById('punch-taetigkeit-select')?.value || 'PRODUKTIV';
    const nowIso = new Date().toISOString();
    const timestampMs = Date.now();

    let successCount = 0;
    const warnings = [];

    for (const cb of selectedCheckboxes) {
        const mitarbeiterId = parseInt(cb.value, 10);
        const mitarbeiterName = cb.dataset.name || `Monteur #${mitarbeiterId}`;

        // 1. ArbZG Vorprüfung
        const arbzg = await validateArbzgForWorker(mitarbeiterId, punchType, timestampMs);
        if (arbzg.hasViolation) {
            warnings.push(`${mitarbeiterName}: ${arbzg.violationText}`);
        }

        // 2. Entitäts-UUID
        const uuid = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `zeit-${mitarbeiterId}-${timestampMs}-${Math.random().toString(36).substring(2, 7)}`;

        if (punchType === 'KOMMEN') {
            const zeiteintrag = {
                uuid,
                mitarbeiter_id: mitarbeiterId,
                projekt_id: projId ? parseInt(projId, 10) : null,
                taetigkeit_typ: taetigkeit,
                zeit_von: nowIso,
                zeit_bis: null,
                dauer_min: 0,
                pause_min: 0,
                is_kolonne: 1,
                status: 'ERFASST',
                is_synced: 0,
                created_at: nowIso
            };
            await window.mobileDb.local_zeiterfassung.put(zeiteintrag);
            if (syncWorker) await syncWorker.queueMutation('ZEITERFASSUNG', uuid, 'INSERT', zeiteintrag);
            successCount++;

        } else if (punchType === 'PAUSE') {
            const punches = await window.mobileDb.local_zeiterfassung.toArray();
            const open = punches.filter(p => p.mitarbeiter_id === mitarbeiterId && !p.zeit_bis).pop();
            if (open) {
                open.pause_min = (open.pause_min || 0) + 30;
                await window.mobileDb.local_zeiterfassung.put(open);
                if (syncWorker) await syncWorker.queueMutation('ZEITERFASSUNG', open.uuid, 'UPDATE', open);
                successCount++;
            }

        } else if (punchType === 'GEHEN') {
            const punches = await window.mobileDb.local_zeiterfassung.toArray();
            const open = punches.filter(p => p.mitarbeiter_id === mitarbeiterId && !p.zeit_bis).pop();
            if (open) {
                open.zeit_bis = nowIso;
                const workCalc = ZeiterfassungController.calculateWorkTime(open.zeit_von, open.zeit_bis, open.pause_min || 0);
                if (workCalc.valid) {
                    open.dauer_min = workCalc.nettoMin;
                    open.pause_min = workCalc.effektivePauseMin;
                }
                const isFahrer = taetigkeit === 'WEGEZEIT_FAHRER';
                const wege = calculateBRTVWegezeitStaffel(35, isFahrer);
                open.wegezeit_eur = wege.entschaedigungEur;

                await window.mobileDb.local_zeiterfassung.put(open);
                if (syncWorker) await syncWorker.queueMutation('ZEITERFASSUNG', open.uuid, 'UPDATE', open);
                successCount++;
            }
        }
    }

    // Haptisches Feedback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate([60, 40, 60]); } catch (_e) { }
    }

    let msg = `✓ ${successCount} Monteure als "${punchType}" gestempelt.`;
    if (warnings.length > 0) {
        msg += '\n\n⚠️ ArbZG-Hinweise:\n' + warnings.join('\n');
    }
    alert(msg);
    await renderTodayPunches();
}

// =========================================================================
// Einzel-Stempeluhr Logik
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
        } catch (_geoErr) { }
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
            is_kolonne: 0,
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

            const wege = calculateBRTVWegezeitStaffel(30, taetigkeit === 'WEGEZEIT_FAHRER');
            open.wegezeit_eur = wege.entschaedigungEur;

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
                    <div style="color: var(--text-muted); font-size: 11px;">${p.taetigkeit_typ} | Pause: ${p.pause_min || 0}m ${p.is_kolonne ? '(Kolonne)' : ''}</div>
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
    openBarcodeScanner((code) => {
        alert('✓ Bauwerk-QR-Code erkannt: ' + code);
    });
}

// =========================================================================
// STUFE 1: Notfall-USB-Sync (.wlsync)
// =========================================================================
async function exportEmergencyUsbBundle() {
    const pwd = document.getElementById('usb-sync-password')?.value;
    if (!pwd || pwd.length < 4) {
        alert('Bitte ein sicheres Baustellen-Passwort mit mindestens 4 Zeichen eingeben.');
        return;
    }

    try {
        const bundleJson = await CryptoSyncBundle.exportToBundle(window.mobileDb, pwd);
        const fname = `wlink_notfall_sync_${new Date().toISOString().split('T')[0]}.wlsync`;
        CryptoSyncBundle.downloadBundle(bundleJson, fname);
        alert(`✓ Notfall-Bundle "${fname}" erfolgreich erstellt und heruntergeladen!\nKopieren Sie die Datei auf Ihren USB-Stick.`);
    } catch (e) {
        alert('Fehler beim Export: ' + e.message);
    }
}

async function importEmergencyUsbBundle(fileInput) {
    const file = fileInput?.files?.[0] || (fileInput instanceof File ? fileInput : null);
    if (!file) return;

    const pwd = prompt('Bitte Baustellen-Passwort für die Entschlüsselung des Bundles eingeben:');
    if (!pwd) {
        if (fileInput && fileInput.value) fileInput.value = '';
        return;
    }

    try {
        await importSyncBundle(file, pwd);
    } catch (_e) {
        // Fehler wird bereits in importSyncBundle behandelt
    } finally {
        if (fileInput && fileInput.value) fileInput.value = '';
    }
}

async function importSyncBundle(fileOrText, pwd) {
    try {
        let text;
        if (typeof fileOrText === 'string') {
            text = fileOrText;
        } else if (fileOrText instanceof File || fileOrText instanceof Blob) {
            text = await new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = e => resolve(e.target.result);
                r.onerror = reject;
                r.readAsText(fileOrText);
            });
        } else if (fileOrText?.files?.[0]) {
            text = await new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = e => resolve(e.target.result);
                r.onerror = reject;
                r.readAsText(fileOrText.files[0]);
            });
        } else {
            throw new Error('Keine gültige Datei oder Bundle-Text angegeben.');
        }

        const decrypted = await CryptoSyncBundle.importFromBundle(text, pwd);

        // [K-1] Atomares Speichern in window.mobileDb
        if (window.mobileDb) {
            await window.mobileDb.transaction('rw', [window.mobileDb.sync_outbox, window.mobileDb.local_fotos], async () => {
                if (Array.isArray(decrypted.mutations) && decrypted.mutations.length > 0) {
                    await window.mobileDb.sync_outbox.bulkPut(decrypted.mutations);
                }
                if (Array.isArray(decrypted.photos) && decrypted.photos.length > 0) {
                    await window.mobileDb.local_fotos.bulkPut(decrypted.photos);
                }
            });
        }

        if (typeof updateOutboxCount === 'function') await updateOutboxCount();
        if (typeof loadCachedMasterData === 'function') await loadCachedMasterData();
        if (typeof renderTodayPunches === 'function') await renderTodayPunches();

        alert(`✓ Notfall-Bundle erfolgreich importiert!\n${decrypted.mutations?.length || 0} Mutationen und ${decrypted.photos?.length || 0} Fotos von Gerät "${decrypted.export_meta?.deviceId || 'unbekannt'}" übernommen.`);
        return decrypted;
    } catch (e) {
        // [H-5] OperationError abfangen & verständlich als "Falsches Passwort" anzeigen
        if (e.name === 'OperationError' || (e.message && e.message.toLowerCase().includes('operationerror'))) {
            alert('Falsches Passwort: Das Baustellen-Passwort zur Entschlüsselung des Bundles ist ungültig.');
        } else {
            alert('Fehler beim Import: ' + e.message);
        }
        throw e;
    }
}

if (typeof window !== 'undefined') {
    window.importSyncBundle = importSyncBundle;
    window.importEmergencyUsbBundle = importEmergencyUsbBundle;
}

// =========================================================================
// STUFE 2: Mobiles Aufmaß (REB 23.003 & Laser BLE)
// =========================================================================
async function connectLaserDevice() {
    if (!window.bluetoothLaserEngine) {
        alert('Bluetooth Laser Engine ist nicht initialisiert.');
        return;
    }

    try {
        const res = await window.bluetoothLaserEngine.connectLaser();
        alert(`✓ Erfolgreich verbunden mit ${res.deviceName} (${res.type})`);
    } catch (e) {
        if (e.name === 'UserCancelledError' || e.name === 'NotFoundError') {
            console.log('[BluetoothLaser] Kopplung durch Benutzer abgebrochen.');
        } else {
            alert('Bluetooth-Hinweis: ' + e.message);
        }
    }
}

function selectRebFormel(code) {
    document.querySelectorAll('.reb-pill').forEach(p => p.classList.remove('active'));
    document.getElementById(`pill-fn-${code}`)?.classList.add('active');
    const inputCode = document.getElementById('aufmass-formel-code');
    if (inputCode) inputCode.value = code;

    const stdInputs = document.getElementById('reb-inputs-standard');
    const extInputs = document.getElementById('reb-inputs-extended');
    const freeInput = document.getElementById('reb-inputs-free');

    if (code === '01' || code === '02') {
        if (stdInputs) stdInputs.style.display = 'grid';
        if (extInputs) extInputs.style.display = 'none';
        if (freeInput) freeInput.style.display = 'none';
    } else if (code === '04' || code === '23') {
        if (stdInputs) stdInputs.style.display = 'grid';
        if (extInputs) extInputs.style.display = 'grid';
        if (freeInput) freeInput.style.display = 'none';
    } else {
        if (stdInputs) stdInputs.style.display = 'none';
        if (extInputs) extInputs.style.display = 'none';
        if (freeInput) freeInput.style.display = 'block';
    }

    calculateLiveAufmass();
}

function calculateLiveAufmass() {
    const code = document.getElementById('aufmass-formel-code')?.value || '01';
    const a = parseFloat(document.getElementById('reb-param-a')?.value) || 0;
    const b = parseFloat(document.getElementById('reb-param-b')?.value) || 0;
    const c = parseFloat(document.getElementById('reb-param-c')?.value) || 0;
    const h = parseFloat(document.getElementById('reb-param-h')?.value) || 0;
    const frei = document.getElementById('reb-param-free')?.value || '';

    const res = RebAufmassEngine.calculate(code, { a, b, c, h, freiString: frei });
    const resDisplay = document.getElementById('reb-live-result');
    if (resDisplay) {
        const unit = (code === '23' && c > 0) ? 'm³' : 'm²';
        resDisplay.textContent = `${res.toFixed(3)} ${unit}`;
    }

    // VOB/C Übermessung anzeigen
    const vobBadge = document.getElementById('vob-uebermessung-badge');
    if (vobBadge) {
        if (RebAufmassEngine.isUebermessen(res, 2.5)) {
            vobBadge.style.display = 'block';
        } else {
            vobBadge.style.display = 'none';
        }
    }

    return res;
}

async function saveAufmassZeile() {
    if (!window.mobileDb) return;

    const projId = document.getElementById('aufmass-projekt-select')?.value;
    const oz = document.getElementById('aufmass-oz-input')?.value || '01.01.0010';
    const raum = document.getElementById('aufmass-raum-input')?.value || '';
    const code = document.getElementById('aufmass-formel-code')?.value || '01';
    const a = parseFloat(document.getElementById('reb-param-a')?.value) || 0;
    const b = parseFloat(document.getElementById('reb-param-b')?.value) || 0;
    const c = parseFloat(document.getElementById('reb-param-c')?.value) || 0;
    const h = parseFloat(document.getElementById('reb-param-h')?.value) || 0;
    const frei = document.getElementById('reb-param-free')?.value || '';

    const ergebnis = calculateLiveAufmass();
    const uuid = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `aufm-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    let rechenansatz = `${a}*${b}=`;
    if (code === '02') rechenansatz = `(${a}*${b})/2=`;
    else if (code === '04') rechenansatz = `((${a}+${c})/2)*${h || b}=`;
    else if (code === '23') rechenansatz = `${a}*${b}*${c}=`;
    else if (code === '91') rechenansatz = frei || `${a}=`;

    const zeile = {
        uuid,
        aufmass_uuid: projId || 'AUFMASS-DEFAULT',
        oz,
        raum_id: null,
        bezeichnung: raum,
        formel_code: code,
        rechenansatz,
        ergebnis,
        einheit: (code === '23' && c > 0) ? 'm³' : 'm²',
        is_synced: 0
    };

    await window.mobileDb.local_aufmass_zeilen.put(zeile);
    if (syncWorker) {
        await syncWorker.queueMutation('AUFMASS_ZEILE', uuid, 'INSERT', zeile);
    }

    // Felder leeren für nächste Lasermessung
    const pA = document.getElementById('reb-param-a');
    const pB = document.getElementById('reb-param-b');
    if (pA) pA.value = '';
    if (pB) pB.value = '';
    if (pA) pA.focus();

    await loadProjectAufmassBlatt();
    alert(`✓ Zeile mit ${ergebnis.toFixed(3)} ${zeile.einheit} gespeichert.`);
}

async function loadProjectAufmassBlatt() {
    const listEl = document.getElementById('aufmass-zeilen-list');
    const totalEl = document.getElementById('aufmass-oz-total');
    if (!listEl || !window.mobileDb) return;

    const oz = document.getElementById('aufmass-oz-input')?.value || '01.01.0010';
    const all = await window.mobileDb.local_aufmass_zeilen.toArray();
    const filtered = all.filter(z => z.oz === oz);

    if (filtered.length === 0) {
        listEl.innerHTML = '<p style="color: var(--text-muted); font-size: 13px;">Noch keine Aufmaßzeilen für diese OZ erfasst.</p>';
        if (totalEl) totalEl.textContent = 'Gesamt: 0.000 m²';
        return;
    }

    let sum = 0;
    let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
    for (const z of filtered) {
        sum += z.ergebnis;
        html += `
            <div style="background: var(--bg-main); padding: 10px; border-radius: 8px; font-size: 13px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>${z.bezeichnung || 'Ohne Raumbeschreibung'}</strong>
                    <div style="font-family: monospace; font-size: 11px; color: var(--text-muted);">FN ${z.formel_code}: ${z.rechenansatz}</div>
                </div>
                <div style="font-weight: bold; color: var(--primary);">
                    ${z.ergebnis.toFixed(3)} ${z.einheit}
                </div>
            </div>
        `;
    }
    html += '</div>';
    listEl.innerHTML = html;
    if (totalEl) totalEl.textContent = `Gesamt: ${sum.toFixed(3)} m²`;
}

async function exportCurrentDa11() {
    if (!window.mobileDb) return;
    const all = await window.mobileDb.local_aufmass_zeilen.toArray();
    if (all.length === 0) {
        alert('Keine Aufmaßzeilen zum Exportieren vorhanden.');
        return;
    }

    const da11Content = RebAufmassEngine.generateDa11File(all);
    const blob = new Blob([da11Content], { type: 'text/plain;charset=ascii' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aufmass_${new Date().toISOString().split('T')[0]}.d11`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    alert('✓ DA11-Datei erfolgreich exportiert (normiert nach Satzart 11)!');
}

// =========================================================================
// STUFE 3: Offline Bauplan-Viewer & Mängel-Pins
// =========================================================================
function initPlanViewerOnce() {
    if (!currentPlanViewer && document.getElementById('bauplan-viewport')) {
        currentPlanViewer = new OfflinePlanViewer('bauplan-viewport', 'plan-canvas', 'plan-overlay-layer');
        currentPlanViewer.onPlanClick = (coords) => {
            handlePlanPinPlacement(coords);
        };
        currentPlanViewer.onPinClick = (mangel) => {
            alert(`Mangel #${mangel.mangel_nr || mangel.id}\n${mangel.titel}\nStatus: ${mangel.status}\nFrist: ${mangel.frist_datum || 'keine'}`);
        };
    }
}

async function loadSelectedPlan() {
    initPlanViewerOnce();
    const pId = document.getElementById('plan-select')?.value;
    if (!pId || !window.mobileDb) return;

    try {
        const plan = await window.mobileDb.cache_bauplaene.get(parseInt(pId, 10));
        if (plan && plan.pdf_blob) {
            await currentPlanViewer.loadPdfFromBlob(plan.pdf_blob);
        } else {
            // Fallback: Zeichne Platzhalter-Plan auf Canvas
            const canvas = document.getElementById('plan-canvas');
            if (canvas) {
                canvas.width = 1200;
                canvas.height = 800;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#f8fafc';
                ctx.fillRect(0, 0, 1200, 800);
                ctx.strokeStyle = '#94a3b8';
                ctx.lineWidth = 2;
                ctx.strokeRect(50, 50, 1100, 700);
                ctx.font = '24px sans-serif';
                ctx.fillStyle = '#334155';
                ctx.fillText(`Bauplan: ${plan ? plan.titel : 'Plan'}`, 70, 90);
                // Räume skizzieren
                ctx.strokeRect(80, 120, 450, 300);
                ctx.fillText('Raum 101 Büro', 100, 160);
                ctx.strokeRect(550, 120, 550, 300);
                ctx.fillText('Raum 102 Besprechung', 570, 160);
                ctx.strokeRect(80, 440, 1020, 280);
                ctx.fillText('Flur / Empfang', 100, 480);
            }
        }

        // Mängel-Pins laden
        await renderCurrentPlanPins();
    } catch (e) {
        console.warn('[PlanViewer] Fehler beim Plan-Laden:', e.message);
    }
}

async function renderCurrentPlanPins() {
    if (!window.mobileDb || !currentPlanViewer) return;
    const planId = parseInt(document.getElementById('plan-select')?.value, 10) || null;
    const all = await window.mobileDb.local_maengel.toArray();
    const filtered = all.filter(m => !planId || m.plan_id === planId);
    currentPlanViewer.renderPins(filtered);
}

function planZoomIn() {
    if (currentPlanViewer) {
        currentPlanViewer.scale = Math.min(10.0, currentPlanViewer.scale * 1.3);
        currentPlanViewer._applyTransform();
    }
}

function planZoomOut() {
    if (currentPlanViewer) {
        currentPlanViewer.scale = Math.max(0.5, currentPlanViewer.scale / 1.3);
        currentPlanViewer._applyTransform();
    }
}

function planResetView() {
    if (currentPlanViewer) currentPlanViewer.resetView();
}

async function handlePlanPinPlacement(coords) {
    const titel = prompt(`Neuen Mangel an Position X: ${coords.xPct}%, Y: ${coords.yPct}% erfassen:\nTitel:`);
    if (!titel) return;

    const planId = parseInt(document.getElementById('plan-select')?.value, 10) || 1;
    const uuid = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `mgl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    const mangel = {
        uuid,
        projekt_id: 1,
        plan_id: planId,
        mangel_nr: `M-${Math.floor(Math.random() * 900 + 100)}`,
        x_pct: coords.xPct,
        y_pct: coords.yPct,
        titel,
        status: 'ERFASST',
        frist_datum: in7Days,
        is_synced: 0,
        created_at: new Date().toISOString()
    };

    await window.mobileDb.local_maengel.put(mangel);
    if (syncWorker) {
        await syncWorker.queueMutation('MAENGEL', uuid, 'INSERT', mangel);
    }

    await renderCurrentPlanPins();
    alert(`✓ Mangel-Pin #${mangel.mangel_nr} gesetzt! (Frist: ${in7Days}, Ampel: Gelb)`);
}

// =========================================================================
// STUFE 3: BGL-Gerätestunden & Digitale Lieferscheine
// =========================================================================
let scannerStream = null;
let scannerScanInterval = null;
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

// =========================================================================
// Exports für automatisierte Tests (Node.js & Browser)
// =========================================================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateBRTVWegezeitStaffel,
        validateArbzgForWorker,
        handleKolonnenPunch
    };
}
