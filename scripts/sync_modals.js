const fs = require('fs');
const path = require('path');

const modalsDir = path.join(__dirname, '../views/modals');
const outputFile = path.join(__dirname, '../js/modal-loader.js');

const modalFiles = fs.readdirSync(modalsDir).filter(f => f.endsWith('.html') && !f.endsWith('-modals.html'));

console.log(`Found ${modalFiles.length} modal partials in views/modals/`);

const templates = {};
modalFiles.forEach(file => {
    const content = fs.readFileSync(path.join(modalsDir, file), 'utf8');
    const idMatch = content.match(/<div\s+[^>]*id=["']([^"']+)["']/i);
    const modalId = idMatch ? idMatch[1] : file.replace('.html', '');
    templates[modalId] = content;
});

const code = `/**
 * modal-loader.js - W-Link ERP Modulare Komponenten-Ladeinfrastruktur
 * 
 * Verwaltet und lädt alle Modal-Dialoge und UI-Overlays zentral.
 * Garantiert sofortige Verfügbarkeit aller DOM-Element-IDs und CSS-Klassen
 * beim Bootstrapping der Anwendung, sodass Event-Listener nahtlos greifen.
 */

(function () {
    'use strict';

    const win = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this);
    const doc = (typeof document !== 'undefined' && document) ? document : (win && win.document ? win.document : null);

    // Statischer Template-Cache für alle ausgelagerten Modale
    const MODAL_TEMPLATES = ${JSON.stringify(templates, null, 2)};

    const ModalLoader = {
        /**
         * Gibt an, ob ein Modal im DOM existiert
         * @param {string} modalId 
         * @returns {boolean}
         */
        isMounted(modalId) {
            return doc ? doc.getElementById(modalId) !== null : false;
        },

        /**
         * Gibt das HTML-Markup eines Modals zurück
         * @param {string} modalId 
         * @returns {string|null}
         */
        getHtml(modalId) {
            return MODAL_TEMPLATES[modalId] || null;
        },

        /**
         * Gibt alle registrierten Modal-IDs zurück
         * @returns {string[]}
         */
        getRegisteredIds() {
            return Object.keys(MODAL_TEMPLATES);
        },

        /**
         * Hängt ein einzelnes Modal in den DOM ein
         * @param {string} modalId 
         * @param {HTMLElement} [targetContainer] 
         * @returns {HTMLElement|null}
         */
        mountModal(modalId, targetContainer = null) {
            if (!doc) return null;
            if (this.isMounted(modalId)) {
                return doc.getElementById(modalId);
            }

            const html = this.getHtml(modalId);
            if (!html) {
                console.warn(\`[ModalLoader] Modal '\${modalId}' ist nicht im Template-Cache registriert.\`);
                return null;
            }

            const container = targetContainer || this.getOrCreateContainer();
            if (!container) return null;

            const temp = doc.createElement('div');
            temp.innerHTML = html.trim();
            const modalEl = temp.firstElementChild;

            if (modalEl) {
                container.appendChild(modalEl);
                return modalEl;
            }
            return null;
        },

        /**
         * Hängt alle registrierten Modale in den DOM ein
         * @param {HTMLElement} [targetContainer]
         */
        mountAll(targetContainer = null) {
            if (!doc) return;
            const container = targetContainer || this.getOrCreateContainer();
            if (!container) return;

            const fragment = doc.createDocumentFragment();

            for (const [id, html] of Object.entries(MODAL_TEMPLATES)) {
                if (!this.isMounted(id)) {
                    const temp = doc.createElement('div');
                    temp.innerHTML = html.trim();
                    while (temp.firstChild) {
                        fragment.appendChild(temp.firstChild);
                    }
                }
            }

            container.appendChild(fragment);
        },

        /**
         * Sucht oder erstellt den zentralen Modals-Container (#modals-container)
         * @returns {HTMLElement|null}
         */
        getOrCreateContainer() {
            if (!doc) return null;
            let container = doc.getElementById('modals-container');
            if (!container) {
                container = doc.createElement('div');
                container.id = 'modals-container';
                const main = doc.querySelector('main') || doc.body;
                if (main) {
                    main.appendChild(container);
                } else if (doc.documentElement) {
                    doc.documentElement.appendChild(container);
                }
            }
            return container;
        },

        /**
         * Lädt ein Modal asynchron via IPC oder Fetch neu (Hot-Reloading für Entwicklung)
         * @param {string} modalId 
         * @returns {Promise<boolean>}
         */
        async reloadModal(modalId) {
            if (!doc) return false;
            try {
                let freshHtml = null;
                if (win.api && typeof win.api.loadModalPartial === 'function') {
                    freshHtml = await win.api.loadModalPartial(modalId);
                } else if (typeof fetch === 'function') {
                    const res = await fetch(\`views/modals/\${modalId}.html\`);
                    if (res.ok) {
                        freshHtml = await res.text();
                    }
                }

                if (freshHtml) {
                    MODAL_TEMPLATES[modalId] = freshHtml;
                    const existing = doc.getElementById(modalId);
                    if (existing) {
                        const temp = doc.createElement('div');
                        temp.innerHTML = freshHtml.trim();
                        const newEl = temp.firstElementChild;
                        if (newEl) {
                            existing.replaceWith(newEl);
                        }
                    } else {
                        this.mountModal(modalId);
                    }
                    return true;
                }
            } catch (err) {
                console.error(\`[ModalLoader] Fehler beim Neuladen von '\${modalId}':\`, err);
            }
            return false;
        }
    };

    // Automatische Initialisierung: Sobald das Skript geparst wird,
    // werden alle Modale sofort in den DOM gehängt, sodass nachfolgende
    // Skripte und Listener synchron auf die Elemente zugreifen können.
    function autoInit() {
        if (doc && doc.body) {
            ModalLoader.mountAll();
        } else if (doc) {
            doc.addEventListener('DOMContentLoaded', () => {
                ModalLoader.mountAll();
            });
        }
    }

    autoInit();

    // Global exponieren
    if (win) {
        win.ModalLoader = ModalLoader;
    }

})();
`;

fs.writeFileSync(outputFile, code, 'utf8');
console.log(`Generated ${outputFile} with ${Object.keys(templates).length} templates (${(code.length / 1024).toFixed(1)} KB)`);
