(function() {
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
    

    
    // Expose to window for browser
    window.setStempelModus = setStempelModus;
    window.renderKolonnenSelect = renderKolonnenSelect;
    window.renderKolonneWorkerList = renderKolonneWorkerList;
    window.handleKolonneChange = handleKolonneChange;
    window.toggleSelectAllKolonne = toggleSelectAllKolonne;
    window.updateKolonneCountLabel = updateKolonneCountLabel;
    window.calculateBRTVWegezeitStaffel = calculateBRTVWegezeitStaffel;
    window.validateArbzgForWorker = validateArbzgForWorker;
    window.handleKolonnenPunch = handleKolonnenPunch;
    window.handlePunch = handlePunch;
    window.renderTodayPunches = renderTodayPunches;
    window.startLiveClock = startLiveClock;
    window.triggerQrScan = triggerQrScan;
    
    // Export for Node.js tests
    if (typeof module !== 'undefined' && module.exports) {
        module.exports.setStempelModus = setStempelModus;
        module.exports.renderKolonnenSelect = renderKolonnenSelect;
        module.exports.renderKolonneWorkerList = renderKolonneWorkerList;
        module.exports.handleKolonneChange = handleKolonneChange;
        module.exports.toggleSelectAllKolonne = toggleSelectAllKolonne;
        module.exports.updateKolonneCountLabel = updateKolonneCountLabel;
        module.exports.calculateBRTVWegezeitStaffel = calculateBRTVWegezeitStaffel;
        module.exports.validateArbzgForWorker = validateArbzgForWorker;
        module.exports.handleKolonnenPunch = handleKolonnenPunch;
        module.exports.handlePunch = handlePunch;
        module.exports.renderTodayPunches = renderTodayPunches;
        module.exports.startLiveClock = startLiveClock;
        module.exports.triggerQrScan = triggerQrScan;
    }
    
})();
