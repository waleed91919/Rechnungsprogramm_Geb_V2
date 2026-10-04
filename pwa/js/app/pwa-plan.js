(function() {
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
    

    
    // Expose to window for browser
    window.initPlanViewerOnce = initPlanViewerOnce;
    window.loadSelectedPlan = loadSelectedPlan;
    window.renderCurrentPlanPins = renderCurrentPlanPins;
    window.planZoomIn = planZoomIn;
    window.planZoomOut = planZoomOut;
    window.planResetView = planResetView;
    window.handlePlanPinPlacement = handlePlanPinPlacement;
    
    // Export for Node.js tests
    if (typeof module !== 'undefined' && module.exports) {
        module.exports.initPlanViewerOnce = initPlanViewerOnce;
        module.exports.loadSelectedPlan = loadSelectedPlan;
        module.exports.renderCurrentPlanPins = renderCurrentPlanPins;
        module.exports.planZoomIn = planZoomIn;
        module.exports.planZoomOut = planZoomOut;
        module.exports.planResetView = planResetView;
        module.exports.handlePlanPinPlacement = handlePlanPinPlacement;
    }
    
})();
