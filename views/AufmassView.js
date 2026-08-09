/**
 * AufmassView.js - UI-Darstellungs- und Live-Berechnungs-Komponente für Aufmaße
 */
window.AufmassView = class AufmassView {
    constructor(modalId = 'aufmass-modal') {
        this.modalId = modalId;
        this.targetPosId = null;
        this.onTransferCallback = null;
        this.einheit = 'm²';
        this.isInitialized = false;
    }

    /**
     * Initialisiert die Event-Listener für das Aufmaß-Modal.
     */
    init() {
        if (this.isInitialized) return;
        const modal = document.getElementById(this.modalId);
        if (!modal) return;

        // Live-Berechnung bei jedem Tastendruck im Modal (input-Event)
        modal.addEventListener('input', (e) => {
            if (e.target.classList.contains('aufmass-formel-input')) {
                this.recalculateAll();
            }
        });

        // Event-Delegation für Zeilen-Aktionen & Modal-Steuerung
        modal.addEventListener('click', async (e) => {
            if (e.target.closest('#btn-add-aufmass-zeile')) {
                this.addZeile();
            } else if (e.target.closest('.btn-delete-aufmass-zeile')) {
                const row = e.target.closest('tr');
                if (row) {
                    row.remove();
                    this.recalculateAll();
                }
            } else if (e.target.closest('#btn-apply-aufmass')) {
                await this.applyTotal();
            } else if (e.target.closest('.btn-close-aufmass-modal')) {
                this.closeModal();
            }
        });

        this.isInitialized = true;
    }

    /**
     * Öffnet das Aufmaß-Modal und lädt bestehende Daten für die spezifische position_id aus der DB.
     * @param {string|number} posId - ID der Rechnungsposition
     * @param {Function} onTransfer - Callback-Funktion zur Übernahme der berechneten Menge
     * @param {string} einheit - Einheit der Rechnungsposition (z. B. m², Std., Stk.)
     */
    async openModal(posId, onTransfer = null, einheit = 'm²') {
        this.init();
        this.targetPosId = posId;
        this.onTransferCallback = onTransfer;
        this.einheit = einheit || 'm²';

        const modal = document.getElementById(this.modalId);
        if (!modal) return;

        const tbody = document.getElementById('aufmass-rows-body');
        if (tbody) {
            tbody.innerHTML = '';
        }

        // Aufmaß aus DB zur Position laden (unter Angabe der aktuell gewählten Einheit)
        let loadedAufmass = null;
        if (window.AufmassController && typeof window.AufmassController.loadAufmassForPosition === 'function') {
            try {
                loadedAufmass = await window.AufmassController.loadAufmassForPosition(posId, this.einheit);
            } catch (err) {
                console.warn('Fehler beim Laden des Aufmaßes für Position', posId, err);
            }
        }

        if (loadedAufmass && loadedAufmass.positionen && loadedAufmass.positionen.length > 0) {
            // Gespeicherte Zeilen laden & rendern
            loadedAufmass.positionen.forEach(pos => {
                this.addZeile(pos.bezeichnung || pos.raum || '', pos.formel || '');
            });
        } else {
            // Standardmäßig 1 leere Zeile bereitstellen, wenn kein Aufmaß existiert
            this.addZeile('', '');
        }

        this.recalculateAll();
        modal.classList.remove('hidden');
    }

    /**
     * Schließt das Aufmaß-Modal.
     */
    closeModal() {
        const modal = document.getElementById(this.modalId);
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    /**
     * Fügt eine neue Aufmaßzeile in die Tabelle ein.
     */
    addZeile(bezeichnung = '', formel = '') {
        const tbody = document.getElementById('aufmass-rows-body');
        if (!tbody) return;

        const index = tbody.children.length + 1;
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/80 transition-colors border-b border-slate-200';
        tr.innerHTML = `
            <td class="px-4 py-3 text-center text-slate-400 font-mono text-xs">${index}</td>
            <td class="px-4 py-3">
                <input type="text" class="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary aufmass-raum-input" value="${bezeichnung}" placeholder="z.B. EG Wohnzimmer">
            </td>
            <td class="px-4 py-3">
                <input type="text" class="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary aufmass-formel-input" value="${formel}" placeholder="z.B. (5 + 3.5) * 2.6">
            </td>
            <td class="px-4 py-3 text-right font-mono font-semibold text-slate-800 aufmass-ergebnis-cell">0.00</td>
            <td class="px-4 py-3 text-center">
                <button type="button" class="btn-delete-aufmass-zeile text-slate-400 hover:text-red-600 p-1 rounded transition-colors" title="Zeile löschen">
                    <span class="material-symbols-outlined text-[18px]">delete</span>
                </button>
            </td>
        `;

        tbody.appendChild(tr);
        this.recalculateAll();
    }

    /**
     * Liest alle Zeilen aus der DOM-Tabelle aus.
     * @returns {Array} Array von Zeilen-Objekten
     */
    collectZeilenFromDOM() {
        const tbody = document.getElementById('aufmass-rows-body');
        if (!tbody) return [];

        const zeilen = [];
        tbody.querySelectorAll('tr').forEach(tr => {
            const raumInput = tr.querySelector('.aufmass-raum-input');
            const formelInput = tr.querySelector('.aufmass-formel-input');

            const bezeichnung = raumInput ? raumInput.value.trim() : '';
            const formel = formelInput ? formelInput.value.trim() : '';

            if (bezeichnung || formel) {
                const ergebnis = window.AufmassController
                    ? window.AufmassController.evaluateFormula(formel)
                    : 0;

                zeilen.push({
                    raum: bezeichnung,
                    bezeichnung,
                    formel,
                    ergebnis,
                    einheit: this.einheit || 'm²'
                });
            }
        });

        return zeilen;
    }

    /**
     * Berechnet alle Zeilen live und aktualisiert das Gesamtergebnis.
     */
    recalculateAll() {
        const tbody = document.getElementById('aufmass-rows-body');
        if (!tbody) return 0;

        let total = 0;
        const rows = tbody.querySelectorAll('tr');

        rows.forEach((tr, idx) => {
            const indexCell = tr.querySelector('td:first-child');
            if (indexCell) indexCell.textContent = idx + 1;

            const formelInput = tr.querySelector('.aufmass-formel-input');
            const ergebnisCell = tr.querySelector('.aufmass-ergebnis-cell');

            const formel = formelInput ? formelInput.value : '';
            const ergebnis = window.AufmassController
                ? window.AufmassController.evaluateFormula(formel)
                : 0;

            if (ergebnisCell) {
                ergebnisCell.textContent = ergebnis.toFixed(2);
                ergebnisCell.className = ergebnis < 0
                    ? 'px-4 py-3 text-right font-mono font-semibold text-red-600 aufmass-ergebnis-cell'
                    : 'px-4 py-3 text-right font-mono font-semibold text-slate-800 aufmass-ergebnis-cell';
            }

            total += ergebnis;
        });

        const totalElement = document.getElementById('aufmass-total-value');
        if (totalElement) {
            totalElement.textContent = `${total.toFixed(2)} ${this.einheit || 'm²'}`;
        }

        return total;
    }

    /**
     * Sammelt die Zeilendaten, speichert das Aufmaß via Controller/Model in der DB,
     * überträgt die Gesamtsumme in die Rechnungsposition und schließt das Modal.
     */
    async applyTotal() {
        const total = this.recalculateAll();
        const zeilen = this.collectZeilenFromDOM();

        // Speichern in SQLite via Controller & Model (IPC)
        if (window.AufmassController && typeof window.AufmassController.saveAufmassForPosition === 'function' && this.targetPosId) {
            try {
                await window.AufmassController.saveAufmassForPosition(this.targetPosId, zeilen, '', this.einheit);
            } catch (err) {
                console.warn('Fehler beim Speichern des Aufmaßes für Position', this.targetPosId, err);
            }
        }

        if (typeof this.onTransferCallback === 'function') {
            this.onTransferCallback(total, this.targetPosId);
        }
        this.closeModal();
    }
};
