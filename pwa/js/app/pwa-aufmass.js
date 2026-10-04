(function() {
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
    

    
    // Expose to window for browser
    window.connectLaserDevice = connectLaserDevice;
    window.selectRebFormel = selectRebFormel;
    window.calculateLiveAufmass = calculateLiveAufmass;
    window.saveAufmassZeile = saveAufmassZeile;
    window.loadProjectAufmassBlatt = loadProjectAufmassBlatt;
    window.exportCurrentDa11 = exportCurrentDa11;
    
    // Export for Node.js tests
    if (typeof module !== 'undefined' && module.exports) {
        module.exports.connectLaserDevice = connectLaserDevice;
        module.exports.selectRebFormel = selectRebFormel;
        module.exports.calculateLiveAufmass = calculateLiveAufmass;
        module.exports.saveAufmassZeile = saveAufmassZeile;
        module.exports.loadProjectAufmassBlatt = loadProjectAufmassBlatt;
        module.exports.exportCurrentDa11 = exportCurrentDa11;
    }
    
})();
