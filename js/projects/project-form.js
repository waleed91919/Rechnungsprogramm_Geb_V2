(function(global) {

function openProjektModal(id = null) {
    document.getElementById('projekt-modal').classList.remove('hidden');
    populateSelects();
    if (id) {
        const p = state.projekte.find(x => x.id === id);
        document.getElementById('projekt-modal-title').innerText = 'Projekt bearbeiten';
        document.getElementById('projekt-id').value = p.id;
        document.getElementById('projekt-name').value = p.name;
        document.getElementById('projekt-kunde').value = p.kundeId;
        document.getElementById('projekt-start').value = p.start || '';
        document.getElementById('projekt-ende').value = p.ende || '';
        document.getElementById('projekt-budget').value = p.budget || '';
        document.getElementById('projekt-sicherheitseinbehalt').value = p.sicherheitseinbehalt_prozent || '';
        document.getElementById('projekt-status').value = p.status || 'Geplant';
        document.getElementById('projekt-notizen').value = p.notizen || '';
    } else {
        document.getElementById('projekt-modal-title').innerText = 'Neues Projekt';
        document.getElementById('projekt-form').reset();
        document.getElementById('projekt-id').value = '';
        document.getElementById('projekt-status').value = 'Geplant';
        document.getElementById('projekt-sicherheitseinbehalt').value = '';
    }

    // Robust focus: first ensure webContents has OS-level focus, then focus the input
    const doFocus = async () => {
        try {
            if (window.api && window.api.focusWindow) {
                await window.api.focusWindow();
            }
        } catch (e) { /* ignore */ }
        requestAnimationFrame(() => {
            const nameInput = document.getElementById('projekt-name');
            if (nameInput) {
                nameInput.focus();
                nameInput.select();
            }
        });
    };
    setTimeout(doFocus, 200);
    setTimeout(doFocus, 450);
}

function closeProjektModal() {
    document.getElementById('projekt-modal').classList.add('hidden');
}

async function saveProjekt() {
    const id = document.getElementById('projekt-id').value;
    const name = document.getElementById('projekt-name').value;
    const kundeId = document.getElementById('projekt-kunde').value;
    const start = document.getElementById('projekt-start').value;
    const ende = document.getElementById('projekt-ende').value;
    const budget = parseFloat(document.getElementById('projekt-budget').value) || 0;
    const sicherheitseinbehalt_prozent = parseFloat(document.getElementById('projekt-sicherheitseinbehalt').value) || 0;
    const status = document.getElementById('projekt-status').value || 'Geplant';
    const notizen = document.getElementById('projekt-notizen').value;

    if (!name || !kundeId) {
        showToast('Bitte füllen Sie alle Pflichtfelder aus.', 'error');
        return;
    }

    if (start && ende && ende < start) {
        showToast('Das Projekt-Enddatum darf nicht vor dem Startdatum liegen.', 'error');
        return;
    }

    const projektObj = { name, kundeId: parseInt(kundeId), start, ende, budget, status, notizen, sicherheitseinbehalt_prozent };

    if (id) {
        projektObj.id = parseInt(id);
    }

    try {
        await window.api.saveProjekt(projektObj);

        // Refresh state
        const newState = await window.api.getFullState();
        state.projekte = newState.projekte;

        closeProjektModal();
        if (document.getElementById('view-projekte') && !document.getElementById('view-projekte').classList.contains('hidden')) {
            renderProjekte();
        }
        showToast('Projekt gespeichert.', 'success');
    } catch (e) {
        console.error('Error saving projekt:', e);
        showToast('Fehler beim Speichern des Projekts.', 'error');
    }
}

global.openProjektModal = openProjektModal;
global.closeProjektModal = closeProjektModal;
global.saveProjekt = saveProjekt;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        openProjektModal,
        closeProjektModal,
        saveProjekt
    };
}

})(typeof window !== 'undefined' ? window : this);
