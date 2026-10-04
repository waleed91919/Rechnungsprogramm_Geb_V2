(function() {
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
    

    
    // Expose to window for browser
    window.toggleSunlightMode = toggleSunlightMode;
    window.toggleGloveMode = toggleGloveMode;
    window.switchTab = switchTab;
    window.loadCachedMasterData = loadCachedMasterData;
    
    // Export for Node.js tests
    if (typeof module !== 'undefined' && module.exports) {
        module.exports.toggleSunlightMode = toggleSunlightMode;
        module.exports.toggleGloveMode = toggleGloveMode;
        module.exports.switchTab = switchTab;
        module.exports.loadCachedMasterData = loadCachedMasterData;
    }
    
})();
