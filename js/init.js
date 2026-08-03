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

            // Merge settings
            if (dbState.einstellungen) {
                for (const [k, v] of Object.entries(dbState.einstellungen)) {
                    state.einstellungen[k] = v;
                }
            }
            console.log("State loaded from SQLite:", state);

            // Auto-update overdue invoices
            await checkOverdueInvoices();
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
