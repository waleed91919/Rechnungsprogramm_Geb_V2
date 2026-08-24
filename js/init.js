// Init
async function init() {
    // Load state from DB
    try {
        if (window.api && window.api.getFullState) {
            const dbState = await window.api.getFullState();
            state.artikel = dbState.artikel || [];
            state.kunden = dbState.kunden || [];
            state.rechnungen = dbState.rechnungen || [];
            state.angebote = dbState.angebote || [];
            state.projekte = dbState.projekte || [];
            state.objekte = dbState.objekte || { liegenschaften: [], gebaeude: [], etagen: [], raeume: [] };
            state.abrechnungsplaene = dbState.abrechnungsplaene || [];
            state.dauerrechnungLaeufe = dbState.dauerrechnungLaeufe || [];

            // Merge settings
            if (dbState.einstellungen) {
                for (const [k, v] of Object.entries(dbState.einstellungen)) {
                    state.einstellungen[k] = v;
                }
            }
            console.log("State loaded from SQLite:", state);

            // Auto-update overdue invoices
            await checkOverdueInvoices();

            // Dauerrechnungen F2: fällige Entwürfe beim App-Start nachziehen (max. 1×/Tag)
            try {
                if (window.api.dauerrechnungenAutoRun && state.einstellungen.dauerrechnungen_auto_erstellen !== 'false') {
                    const autoRes = await window.api.dauerrechnungenAutoRun();
                    if (autoRes && autoRes.ausgefuehrt && autoRes.erstellteAnzahl > 0) {
                        showToast(`${autoRes.erstellteAnzahl} Dauerrechnungs-Entwürfe erstellt`, 'success');
                    }
                }
            } catch (e) {
                console.warn('Dauerrechnungen Auto-Run:', e);
            }
        }
    } catch (e) {
        console.error("Failed to load state from DB:", e);
    }

    switchView('dashboard');
    
    // Notifications check
    if (typeof initNotificationCheck === 'function') {
        initNotificationCheck();
    }
}

document.addEventListener('DOMContentLoaded', init);
