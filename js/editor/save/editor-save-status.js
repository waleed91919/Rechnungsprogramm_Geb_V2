async function storniereRechnung(id) {
    const original = state.rechnungen.find(r => r.id === id);
    if (!original) return;

    if (await safeConfirm(`Möchten Sie für die Rechnung ${original.nr} wirklich eine Stornorechnung (Gutschrift) erstellen? Dies kann nicht rückgängig gemacht werden.`)) {
        const stornoData = window.InvoiceController.createStornoData(original);
        if (!stornoData) return;

        try {
            const model = new window.InvoiceModel(window.api);
            const newState = await model.storniereRechnung(stornoData.updatedOriginal, stornoData.stornoDoc);

            if (newState) {
                state.angebote = newState.angebote;
                state.rechnungen = newState.rechnungen;
                state.artikel = newState.artikel;
            }

            if (document.getElementById('view-dashboard') && !document.getElementById('view-dashboard').classList.contains('hidden')) {
                renderDashboard();
            } else if (document.getElementById('view-rechnungen') && !document.getElementById('view-rechnungen').classList.contains('hidden')) {
                renderRechnungen();
            }
            showToast(`Stornorechnung ${stornoData.stornoNr} wurde erfolgreich erstellt.`, 'success');
        } catch (e) {
            console.error('Fehler beim Stornieren:', e);
            showToast('Fehler beim Stornieren der Rechnung', 'error');
        }
    }
}

window.storniereRechnung = storniereRechnung;

async function markAsPaid(id) {
    const rech = state.rechnungen.find(r => r.id === id);
    if (!rech) return;

    if (await safeConfirm(`Möchten Sie die Rechnung ${rech.nr} als bezahlt markieren?`)) {
        try {
            const model = new window.InvoiceModel(window.api);
            await model.markAsPaid(rech);
            showToast(`Rechnung ${rech.nr} als bezahlt markiert.`, 'success');

            if (document.getElementById('view-dashboard') && !document.getElementById('view-dashboard').classList.contains('hidden')) {
                renderDashboard();
            } else if (document.getElementById('view-rechnungen') && !document.getElementById('view-rechnungen').classList.contains('hidden')) {
                renderRechnungen(document.getElementById('global-search') ? document.getElementById('global-search').value : '');
            }
        } catch (e) {
            console.error('Fehler beim Markieren als bezahlt:', e);
            showToast('Fehler beim Speichern des Status', 'error');
        }
    }
}

window.markAsPaid = markAsPaid;

async function deleteRechnung(id) {
    if (await safeConfirm('Möchten Sie dieses Dokument wirklich löschen?')) {
        try {
            await window.api.deleteDocument(id, 'rechnung');
            const newState = await window.api.getFullState();
            state.angebote = newState.angebote;
            state.rechnungen = newState.rechnungen;
            state.artikel = newState.artikel;
            if (document.getElementById('view-dashboard') && !document.getElementById('view-dashboard').classList.contains('hidden')) {
                renderDashboard();
            } else if (document.getElementById('view-rechnungen') && !document.getElementById('view-rechnungen').classList.contains('hidden')) {
                renderRechnungen();
            } else if (document.getElementById('view-projekt-details') && !document.getElementById('view-projekt-details').classList.contains('hidden')) {
                if (state.currentProjektId) openProjektDetails(state.currentProjektId);
            }
            showToast('Rechnung gelöscht.', 'success');
        } catch (e) {
            console.error('Error deleting document:', e);
            showToast(e && e.message ? e.message : 'Fehler beim Löschen.', 'error');
        }
    }
}

window.deleteRechnung = deleteRechnung;