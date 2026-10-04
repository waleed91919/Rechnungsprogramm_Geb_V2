function addRechnungPosition() {
    state.currentRechnungPositionen.push({
        id: Date.now(), // temp id
        artikelId: '',
        name: '', // Allow custom Name
        menge: 1,
        einheit: 'Stk.',
        preis: state.isAngebotMode ? null : 0,
        mwst: 19,
        rabatt: 0 // New field
    });
    renderRechnungPositionen();
}

window.addRechnungPosition = addRechnungPosition;

function removeRechnungPosition(id) {
    const index = state.currentRechnungPositionen.findIndex(p => p.id === id);
    if (index !== -1) {
        state.currentRechnungPositionen.splice(index, 1);
    }
    renderRechnungPositionen();
}

window.removeRechnungPosition = removeRechnungPosition;

function handlePositionChange(id, field, value) {
    const pos = state.currentRechnungPositionen.find(p => p.id === id);
    if (!pos) return;

    if (field === 'name') {
        pos.name = value || '';
    } else if (field === 'artikelId') {
        const art = state.artikel.find(a => a.id === parseInt(value));
        pos.artikelId = parseInt(value);
        if (art) {
            pos.name = art.name;
            pos.preis = art.vk;
            pos.ek = art.ek; // Snapshot current purchase price
            pos.mwst = art.mwst !== undefined ? art.mwst : 19;
            pos.rabatt = 0; // Reset user discount when changing article
            pos.kostenart = art.kostenart || 'MATERIAL';
            pos.lohnanteil_prozent = art.lohnanteil_prozent || 0;
        } else {
            pos.preis = state.isAngebotMode ? null : 0;
            pos.rabatt = 0;
        }
    } else if (field === 'menge') {
        pos.menge = pos.einheit === 'Pauschal' ? 1 : (parseFloat(value) || 0);
    } else if (field === 'einheit') {
        pos.einheit = value || 'Stk.';
        if (pos.einheit === 'Pauschal') {
            pos.menge = 1;
        }
    } else if (field === 'preis') {
        if (value === '' || value === null || value === undefined) {
            pos.preis = null;
        } else {
            pos.preis = isNaN(parseFloat(value)) ? null : parseFloat(value);
        }
    } else if (field === 'mwst') {
        pos.mwst = parseInt(value) || 0;
        if (!pos.is13b) {
            pos.previousMwst = pos.mwst;
        }
    } else if (field === 'is13b') {
        pos.is13b = !!value;
        if (pos.is13b) {
            if (pos.mwst !== 0) {
                pos.previousMwst = pos.mwst;
            }
            pos.mwst = 0;
        } else {
            pos.mwst = pos.previousMwst !== undefined ? pos.previousMwst : 19;
        }
    } else if (field === 'rabatt') {
        pos.rabatt = Math.max(0, Math.min(100, parseFloat(value) || 0)); // Cap 0-100%
    } else if (field === 'positionstyp') {
        pos.positionstyp = (value || 'NORMAL').toUpperCase().trim();
        pos.in_endsumme_enthalten = (pos.positionstyp === 'NORMAL' || pos.positionstyp === 'PAUSCHALE') ? 1 : 0;
    } else if (field === 'in_endsumme_enthalten') {
        pos.in_endsumme_enthalten = (value === 1 || value === '1' || value === true) ? 1 : 0;
    }

    renderRechnungPositionen();
}

window.handlePositionChange = handlePositionChange;

function getArtikelName(artikelId, customName) {
    if (!artikelId) return customName || '';
    const art = state.artikel.find(a => a.id === artikelId);
    if (art) {
        return art.ean ? `${art.name} (${art.ean})` : art.name;
    }
    return customName || '';
}

window.getArtikelName = getArtikelName;

function handleArtikelAutocomplete(posId, query) {
    const pos = state.currentRechnungPositionen.find(p => p.id === posId);
    if (!pos) return;

    // Find article matching exactly this query format "Name (EAN)" or exact Name
    const art = state.artikel.find(a => {
        const expectedName = a.ean ? `${a.name} (${a.ean})` : a.name;
        return expectedName === query || a.name === query;
    });

    if (art) {
        pos.artikelId = art.id;
        pos.preis = art.vk;
        pos.ek = art.ek; // Snapshot current purchase price
        pos.name = art.name;
        pos.mwst = art.mwst !== undefined ? art.mwst : 19;
        pos.kostenart = art.kostenart || 'MATERIAL';
        pos.lohnanteil_prozent = art.lohnanteil_prozent || 0;

        // Update input field to show correctly formatted string
        const inputField = document.querySelector(`input[list="artikel-datalist"][onchange*="${pos.id}"]`);
        if (inputField) inputField.value = getArtikelName(art.id, pos.name);

    } else {
        // Clear it or allow custom name? Currently system works with IDs
        pos.artikelId = '';
        pos.name = query;
        // Keep previous numeric values or reset? We typically shouldn't reset price if they are just typing a custom name!
    }

    renderRechnungPositionen();
}

window.handleArtikelAutocomplete = handleArtikelAutocomplete;

function setRabattType(type) {
    const inputType = document.getElementById('rechnung-global-rabatt-type');
    if (!inputType) return;

    inputType.value = type;

    const btnPct = document.getElementById('btn-rabatt-pct');
    const btnEur = document.getElementById('btn-rabatt-eur');

    if (type === '%') {
        btnPct.className = 'px-3 py-1 text-xs font-bold rounded-md transition-all shadow-sm bg-primary text-white';
        btnEur.className = 'px-3 py-1 text-xs font-bold rounded-md transition-all text-slate-600 hover:text-slate-800';
    } else {
        btnPct.className = 'px-3 py-1 text-xs font-bold rounded-md transition-all text-slate-600 hover:text-slate-800';
        btnEur.className = 'px-3 py-1 text-xs font-bold rounded-md transition-all shadow-sm bg-primary text-white';
    }
    calculateRechnungTotals();
}

window.setRabattType = setRabattType;

function syncSicherheitseinbehalt(sourceId) {
    const src = document.getElementById(sourceId);
    if (!src) return;
    const val = src.value;
    const allIds = [
        'rechnung-sicherheitseinbehalt-prozent',
        'rechnung-handwerk-sicherheitseinbehalt',
        'angebot-sicherheitseinbehalt'
    ];
    for (const id of allIds) {
        if (id !== sourceId) {
            const target = document.getElementById(id);
            if (target && target.value !== val) {
                target.value = val;
            }
        }
    }
    if (typeof calculateRechnungTotals === 'function') {
        calculateRechnungTotals();
    }
}

window.syncSicherheitseinbehalt = syncSicherheitseinbehalt;
