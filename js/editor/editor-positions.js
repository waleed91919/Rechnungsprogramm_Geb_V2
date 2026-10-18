const _win = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});

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

_win.addRechnungPosition = addRechnungPosition;

function removeRechnungPosition(id) {
    const index = state.currentRechnungPositionen.findIndex(p => p.id === id);
    if (index !== -1) {
        state.currentRechnungPositionen.splice(index, 1);
    }
    renderRechnungPositionen();
}

_win.removeRechnungPosition = removeRechnungPosition;

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

_win.handlePositionChange = handlePositionChange;

function getArtikelName(artikelId, customName) {
    if (!artikelId) return customName || '';
    const art = state.artikel.find(a => a.id === artikelId);
    if (art) {
        return art.ean ? `${art.name} (${art.ean})` : art.name;
    }
    return customName || '';
}

_win.getArtikelName = getArtikelName;

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

_win.handleArtikelAutocomplete = handleArtikelAutocomplete;

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

_win.setRabattType = setRabattType;

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

_win.syncSicherheitseinbehalt = syncSicherheitseinbehalt;

function __resolveMoney_pos() {
    if (typeof Money !== 'undefined' && Money && typeof Money.round2 === 'function') return Money;
    if (typeof window !== 'undefined' && window.Money) return window.Money;
    if (typeof globalThis !== 'undefined' && globalThis.Money) return globalThis.Money;
    try {
        if (typeof require !== 'undefined') return require('../money');
    } catch (e) {}
    return null;
}

function toggleBauumlageMenu(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    const menu = document.getElementById('gu-bauumlage-menu');
    if (menu) {
        menu.classList.toggle('hidden');
    }
}
_win.toggleBauumlageMenu = toggleBauumlageMenu;

function closeBauumlageMenu() {
    const menu = document.getElementById('gu-bauumlage-menu');
    if (menu && !menu.classList.contains('hidden')) {
        menu.classList.add('hidden');
    }
}
_win.closeBauumlageMenu = closeBauumlageMenu;

if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
        const container = document.getElementById('gu-bauumlage-dropdown-container');
        if (container && !container.contains(e.target)) {
            closeBauumlageMenu();
        }
    });
}

/**
 * Fügt eine GU-Bauumlage (Abzugsposition auf die Zwischensumme aller positiven Leistungspositionen) ein.
 * @param {string} type - 'strom_wasser' | 'versicherung' | 'kombi'
 * @param {number} percentValue - z. B. 0.5 für 0,5 %
 */
function addBauumlagePosition(type, percentValue) {
    const _M = __resolveMoney_pos();
    const R2 = (v) => _M ? _M.round2(v) : (() => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0; })();
    const P = (base, rate) => _M ? _M.percent(base, rate) : R2(parseFloat(base) * parseFloat(rate) / 100);

    const positions = (typeof state !== 'undefined' && Array.isArray(state.currentRechnungPositionen))
        ? state.currentRechnungPositionen
        : [];

    let zwischensummePositivNetto = 0;
    const taxCount = {};
    let has13b = false;

    const isGlobal13bEl = typeof document !== 'undefined' ? document.getElementById('rechnung-13b-ustg') : null;
    const isGlobal13b = isGlobal13bEl ? isGlobal13bEl.checked : (typeof state !== 'undefined' && state.currentRechnung && (state.currentRechnung.unterliegt_13b || state.currentRechnung.isGlobal13b));

    for (const pos of positions) {
        if (pos.in_endsumme_enthalten === 0 || pos.positionstyp === 'OPTIONAL' || pos.positionstyp === 'ALTERNATIV') {
            continue;
        }
        const menge = parseFloat(pos.menge) || 0;
        const preis = parseFloat(pos.preis) || 0;
        const rabatt = parseFloat(pos.rabatt) || 0;
        const rowNetto = R2((menge * preis) * (1 - rabatt / 100));

        if (rowNetto > 0) {
            zwischensummePositivNetto = R2(zwischensummePositivNetto + rowNetto);
            const rate = pos.is13b ? 0 : (pos.mwst !== undefined ? parseInt(pos.mwst, 10) : 19);
            taxCount[rate] = (taxCount[rate] || 0) + rowNetto;
            if (pos.is13b) has13b = true;
        }
    }

    if (zwischensummePositivNetto <= 0) {
        const msg = 'Bitte erfassen Sie zuerst Leistungspositionen mit positivem Betrag.';
        if (typeof showToast === 'function') {
            showToast(msg, 'warning');
        } else if (typeof alert === 'function') {
            alert(msg);
        }
        return null;
    }

    // Dominanten Steuersatz ermitteln
    let dominantMwst = 19;
    let maxBase = -1;
    for (const [rateStr, base] of Object.entries(taxCount)) {
        if (base > maxBase) {
            maxBase = base;
            dominantMwst = parseInt(rateStr, 10);
        }
    }
    const pos13b = Boolean(isGlobal13b || (has13b && dominantMwst === 0));
    const finalMwst = pos13b ? 0 : dominantMwst;

    const rate = parseFloat(percentValue) || 0;
    const abzugBetragNetto = P(zwischensummePositivNetto, rate);

    let bezeichnung = '';
    if (type === 'strom_wasser') {
        bezeichnung = `Abzug Bauumlage: Baustrom / Bauwasser (${rate}% gem. Bauvertrag)`;
    } else if (type === 'versicherung') {
        bezeichnung = `Abzug Bauumlage: Bauwesenversicherung (${rate}% gem. Bauvertrag)`;
    } else if (type === 'kombi') {
        bezeichnung = `Abzug Bauumlage: Kombi Strom/Wasser/Versicherung (${rate}% gem. Bauvertrag)`;
    } else {
        bezeichnung = `Abzug Bauumlage (${rate}% gem. Bauvertrag)`;
    }

    const newPos = {
        id: Date.now(),
        artikelId: '',
        name: bezeichnung,
        menge: 1,
        einheit: 'psch',
        preis: -abzugBetragNetto,
        mwst: finalMwst,
        is13b: pos13b,
        rabatt: 0,
        positionstyp: 'NORMAL',
        in_endsumme_enthalten: 1
    };

    if (typeof state !== 'undefined' && Array.isArray(state.currentRechnungPositionen)) {
        state.currentRechnungPositionen.push(newPos);
    }
    if (typeof renderRechnungPositionen === 'function') {
        renderRechnungPositionen();
    }
    if (typeof calculateRechnungTotals === 'function') {
        calculateRechnungTotals();
    }

    return newPos;
}

_win.addBauumlagePosition = addBauumlagePosition;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        addRechnungPosition,
        removeRechnungPosition,
        handlePositionChange,
        getArtikelName,
        handleArtikelAutocomplete,
        setRabattType,
        syncSicherheitseinbehalt,
        addBauumlagePosition,
        toggleBauumlageMenu,
        closeBauumlageMenu
    };
}

