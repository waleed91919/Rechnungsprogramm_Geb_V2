// Navigation

const viewConfig = {
    dashboard: {
        title: 'Dashboard-Übersicht',
        subtitle: 'Startseite',
        action: (query) => { if (typeof renderDashboard === 'function') renderDashboard(query); }
    },
    rechnungen: {
        title: 'Ausgangsrechnungen',
        subtitle: 'Alle Rechnungen',
        action: (query) => { if (typeof renderRechnungen === 'function') renderRechnungen(query); }
    },
    artikel: {
        title: 'Artikel & Bestand',
        subtitle: 'Artikelverwaltung',
        action: (query) => { if (typeof renderArtikel === 'function') renderArtikel(query); }
    },
    kunden: {
        title: 'Kundenadressbuch',
        subtitle: 'Kundenverwaltung',
        action: (query) => { if (typeof renderKunden === 'function') renderKunden(query); }
    },
    angebote: {
        title: 'Angebote',
        subtitle: 'Alle offenen Angebote',
        action: (query) => { if (typeof renderAngebote === 'function') renderAngebote(query); }
    },
    projekte: {
        title: 'Projektmanagement',
        subtitle: 'Rentabilitätsübersicht',
        action: (query) => { if (typeof renderProjekte === 'function') renderProjekte(query); }
    },
    objekte: {
        title: 'Objektverwaltung',
        subtitle: 'Liegenschaften & Gebäude',
        action: () => { if (typeof renderObjekte === 'function') renderObjekte(); }
    },
    dauerrechnungen: {
        title: 'Dauerrechnungen',
        subtitle: 'Abrechnungspläne & Läufe',
        action: () => { if (typeof renderDauerrechnungen === 'function') renderDauerrechnungen(); }
    },
    putzplan: {
        title: 'Putzplan & Leistungsverzeichnis',
        subtitle: 'Flächen, Turni, Zuschläge',
        action: () => { if (typeof renderPutzplan === 'function') renderPutzplan(); }
    },
    banking: {
        title: 'Banking & OPOS-Abgleich',
        subtitle: 'Kontoauszug, Zahlungsabgleich & SEPA-Lastschriften',
        action: () => { if (typeof renderBanking === 'function') renderBanking(); }
    },
    maengel: {
        title: 'Mängelkataster & Fristenradar',
        subtitle: 'VOB/B § 13 & BGB § 641 (3)',
        action: () => {
            if (!window.maengelViewInstance && window.MaengelView) {
                window.maengelViewInstance = new window.MaengelView();
            }
            if (window.maengelViewInstance) {
                window.maengelViewInstance.loadAndRender();
            }
        }
    },
    zeiterfassung: {
        title: 'Zeiterfassung & VOB/B Bautagebuch',
        subtitle: 'BAG / ArbZG-Arbeitszeitkonten & VOB-Meldewesen',
        action: () => {
            if (!window.zeiterfassungViewInstance && window.ZeiterfassungView) {
                window.zeiterfassungViewInstance = new window.ZeiterfassungView();
            }
            if (window.zeiterfassungViewInstance) {
                window.currentViewInstance = window.zeiterfassungViewInstance;
                const container = document.getElementById('view-zeiterfassung');
                if (container) {
                    window.zeiterfassungViewInstance.render().then(html => container.innerHTML = html);
                }
            }
        }
    },
    sync: {
        title: 'Local-First P2P Sync & Mobile Hub',
        subtitle: 'PWA-Verbindung, QR-Pairing & Quarantäne-Center',
        action: () => {
            if (!window.syncViewInstance && window.SyncView) {
                window.syncViewInstance = new window.SyncView();
            }
            if (window.syncViewInstance) {
                window.currentViewInstance = window.syncViewInstance;
                const container = document.getElementById('view-sync');
                if (container) {
                    window.syncViewInstance.render().then(html => container.innerHTML = html);
                }
            }
        }
    },
    grosshandel: {
        title: 'Großhandels-Center & IDS Connect 2.5',
        subtitle: 'GC Online Plus, Richter+Frenzel, Sonepar, Rexel & Würth',
        action: () => {
            if (!window.grosshandelViewInstance && window.GrosshandelView) {
                window.grosshandelViewInstance = new window.GrosshandelView();
            }
            if (window.grosshandelViewInstance) {
                window.currentViewInstance = window.grosshandelViewInstance;
                const container = document.getElementById('view-grosshandel');
                if (container) {
                    window.grosshandelViewInstance.render().then(html => container.innerHTML = html);
                }
            }
        }
    },
    sokabau: {
        title: 'SOKA-BAU & Lohn-Compliance Center',
        subtitle: 'BRTV Bau 2026/2027, DTA-Bau, SOKA-XML & § 14 AEntG',
        action: () => {
            if (!window.sokaBauViewInstance && window.SokaBauView) {
                window.sokaBauViewInstance = new window.SokaBauView();
            }
            if (window.sokaBauViewInstance) {
                window.currentViewInstance = window.sokaBauViewInstance;
                const container = document.getElementById('view-sokabau');
                if (container) {
                    window.sokaBauViewInstance.render().then(html => container.innerHTML = html);
                }
            }
        }
    },
    'objekt-details': {
        title: 'Objekt-Detail',
        subtitle: 'Struktur & Historie',
        action: () => { if (typeof refreshObjektDetails === 'function') refreshObjektDetails(); }
    },
    berichte: {
        title: 'Umsatzsteuerberechnung',
        subtitle: 'Berichte',
        action: () => { if (typeof initBerichte === 'function') initBerichte(); }
    },
    einstellungen: {
        title: 'Systemeinstellungen',
        subtitle: 'Konfiguration',
        action: () => { if (typeof loadEinstellungenToForm === 'function') loadEinstellungenToForm(); }
    }
};

const views = [
    'dashboard', 'rechnungen', 'artikel', 'kunden', 'angebote',
    'projekte', 'projekt-details', 'objekte', 'objekt-details', 'dauerrechnungen', 'putzplan', 'banking', 'maengel', 'zeiterfassung', 'sync', 'grosshandel', 'sokabau', 'berichte', 'einstellungen'
];

// Initialisiere Event-Listener für empfangene IDS-Warenkörbe
if (typeof window !== 'undefined' && window.api && window.api.onIdsCartReceived) {
    window.api.onIdsCartReceived((cartData) => {
        if (typeof showNotification === 'function') {
            showNotification(
                'Warenkorb empfangen!',
                `${cartData.items ? cartData.items.length : 0} Positionen (${(cartData.totalNetAmount || 0).toFixed(2)} € Netto) vom Großhandel empfangen.`
            );
        }
        if (window.grosshandelViewInstance) {
            window.grosshandelViewInstance.refresh();
        }
    });
}


function switchView(viewName) {
    if (typeof state !== 'undefined') {
        state.view = viewName;
    }

    // Hide all views
    views.forEach(view => {
        const el = document.getElementById(`view-${view}`);
        if (el) el.classList.add('hidden');
    });

    // Reset nav styles
    const navClassesInactive = ['text-slate-300', 'hover:bg-sidebar-hover', 'hover:text-white', 'group'];
    const navClassesActive = ['bg-primary', 'text-white', 'shadow-sm', 'ring-1', 'ring-white/10'];

    views.forEach(view => {
        const el = document.getElementById(`nav-${view}`);
        if (el) {
            el.classList.remove(...navClassesActive);
            el.classList.add(...navClassesInactive);
            const icon = el.querySelector('span.material-symbols-outlined');
            if (icon) icon.classList.add('text-slate-400', 'group-hover:text-white');
        }
    });

    // Show active view and update nav
    const searchQueryElement = document.getElementById('global-search');
    const searchQuery = searchQueryElement ? searchQueryElement.value : '';

    const viewEl = document.getElementById(`view-${viewName}`);
    if (viewEl) viewEl.classList.remove('hidden');

    const activeNav = document.getElementById(`nav-${viewName}`);
    if (activeNav) {
        activeNav.classList.remove(...navClassesInactive);
        activeNav.classList.add(...navClassesActive);
        const icon = activeNav.querySelector('span.material-symbols-outlined');
        if (icon) icon.classList.remove('text-slate-400', 'group-hover:text-white');
    }

    const config = viewConfig[viewName];
    if (config) {
        const titleEl = document.getElementById('header-title');
        if (titleEl) titleEl.innerText = config.title;

        const subtitleEl = document.getElementById('header-subtitle');
        if (subtitleEl) subtitleEl.innerText = config.subtitle;

        config.action(searchQuery);

        // Autofocus primary input of the new view (with robust Electron focus)
        // Skip if a modal is open — the modal handles its own focus
        setTimeout(async () => {
            const anyModalOpen = document.querySelector(
                '#kunde-modal:not(.hidden), #artikel-modal:not(.hidden), #rechnung-modal:not(.hidden), #projekt-modal:not(.hidden)'
            );
            if (anyModalOpen) return; // Modal handles its own focus

            try {
                if (window.api && window.api.focusWindow) {
                    await window.api.focusWindow();
                }
            } catch (e) { /* ignore */ }
            requestAnimationFrame(() => {
                const activeView = document.getElementById(`view-${viewName}`);
                if (activeView) {
                    const firstInput = activeView.querySelector('input:not([type="hidden"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), select:not([disabled])');
                    if (firstInput) {
                        firstInput.focus();
                        if(typeof firstInput.select === 'function') firstInput.select();
                    } else {
                        const searchInput = document.getElementById('global-search');
                        if (searchInput) {
                            searchInput.focus();
                        }
                    }
                }
            });
        }, 150);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { switchView, viewConfig };
}
