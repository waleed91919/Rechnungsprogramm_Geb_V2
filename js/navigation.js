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
    'projekte', 'projekt-details', 'berichte', 'einstellungen'
];

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
