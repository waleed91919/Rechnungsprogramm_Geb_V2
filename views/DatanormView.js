/**
 * views/DatanormView.js - UI-Komponente für DATANORM 4.0 & 5.0 Import-Wizard und Katalogverwaltung
 */

window.DatanormView = class DatanormView {
    constructor(modalId = 'datanorm-modal') {
        this.modalId = modalId;
        this.selectedFiles = [];
        this.isImporting = false;
        this.kataloge = [];
    }

    /**
     * Öffnet den DATANORM Import-Wizard.
     */
    async openModal() {
        let modal = document.getElementById(this.modalId);
        if (!modal) {
            this.createModalElement();
            modal = document.getElementById(this.modalId);
        }
        modal.classList.remove('hidden');
        await this.loadKataloge();
        this.renderWizard();
    }

    /**
     * Schließt das Modal.
     */
    closeModal() {
        const modal = document.getElementById(this.modalId);
        if (modal) modal.classList.add('hidden');
    }

    /**
     * Erstellt das Modal-DOM-Element falls nicht vorhanden.
     */
    createModalElement() {
        const div = document.createElement('div');
        div.id = this.modalId;
        div.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden';
        div.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
                <div class="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-primary text-2xl">upload_file</span>
                        <div>
                            <h3 class="font-bold text-slate-800 text-base">DATANORM 4.0 & 5.0 Katalog-Import & Manager</h3>
                            <p class="text-xs text-slate-500">Großhandels-Artikelkataloge, Rabattmatrizen und Warengruppen</p>
                        </div>
                    </div>
                    <button onclick="window.datanormViewInstance.closeModal()" class="text-slate-400 hover:text-slate-600 rounded-lg p-1">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div id="datanorm-modal-body" class="p-6 overflow-y-auto flex-1 space-y-6">
                    <!-- Wizard Body -->
                </div>
            </div>
        `;
        document.body.appendChild(div);
    }

    /**
     * Lädt bestehende Kataloge aus SQLite.
     */
    async loadKataloge() {
        try {
            if (window.api && window.api.getDatanormKataloge) {
                this.kataloge = await window.api.getDatanormKataloge();
            }
        } catch (e) {
            console.error('Fehler beim Laden der DATANORM-Kataloge:', e);
        }
    }

    /**
     * Rendert die Wizard-Oberfläche.
     */
    renderWizard() {
        const body = document.getElementById('datanorm-modal-body');
        if (!body) return;

        body.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-12 gap-6">
                <!-- Linke Spalte: Datei-Upload & Einstellungen -->
                <div class="md:col-span-7 space-y-4">
                    <div class="border-2 border-dashed border-slate-300 hover:border-primary rounded-xl p-6 text-center bg-slate-50 transition-colors cursor-pointer"
                         onclick="document.getElementById('datanorm-file-input').click()">
                        <span class="material-symbols-outlined text-4xl text-slate-400">cloud_upload</span>
                        <div class="text-sm font-semibold text-slate-700 mt-2">DATANORM-Dateien auswählen</div>
                        <div class="text-xs text-slate-400 mt-1">*.001, *.WRG, *.RAB, DATATEXT, DATPREIS</div>
                        <input type="file" id="datanorm-file-input" multiple class="hidden" onchange="window.datanormViewInstance.onFilesSelected(event)">
                    </div>

                    <div id="datanorm-file-list" class="space-y-1 text-xs">
                        ${this.selectedFiles.length === 0 ? '<div class="text-slate-400 italic text-center py-2">Keine Dateien ausgewählt</div>' : ''}
                        ${this.selectedFiles.map((f, i) => `
                            <div class="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-lg shadow-sm">
                                <div class="flex items-center gap-2 truncate">
                                    <span class="material-symbols-outlined text-slate-500 text-sm">description</span>
                                    <span class="font-medium text-slate-700 truncate">${f.name || f}</span>
                                </div>
                                <button onclick="window.datanormViewInstance.removeFile(${i})" class="text-red-400 hover:text-red-600">
                                    <span class="material-symbols-outlined text-sm">delete</span>
                                </button>
                            </div>
                        `).join('')}
                    </div>

                    <div class="grid grid-cols-2 gap-3 pt-2">
                        <div>
                            <label class="block text-xs font-semibold text-slate-700 mb-1">Lieferant / Großhändler</label>
                            <input type="text" id="datanorm-lieferant" placeholder="z. B. GC Gruppe / Richter+Frenzel" value="Großhandel" class="w-full text-xs rounded-lg border-slate-300 py-1.5 px-3">
                        </div>
                        <div>
                            <label class="block text-xs font-semibold text-slate-700 mb-1">Katalog-Bezeichnung</label>
                            <input type="text" id="datanorm-katalogname" placeholder="z. B. Sanitär 2026" value="DATANORM Katalog" class="w-full text-xs rounded-lg border-slate-300 py-1.5 px-3">
                        </div>
                    </div>

                    <div>
                        <label class="block text-xs font-semibold text-slate-700 mb-1">Kalkulationsaufschlag auf Netto-EK (%)</label>
                        <input type="number" id="datanorm-aufschlag" step="1" value="25" class="w-full text-xs rounded-lg border-slate-300 py-1.5 px-3">
                        <p class="text-[11px] text-slate-400 mt-1">Automatische Berechnung von kalkuliertem VK = Netto-EK × (1 + Aufschlag%)</p>
                    </div>

                    <div id="datanorm-progress-box" class="hidden p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                        <div class="flex justify-between text-xs font-medium text-slate-700">
                            <span>Import läuft...</span>
                            <span id="datanorm-progress-text">0 Artikel</span>
                        </div>
                        <div class="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                            <div id="datanorm-progress-bar" class="bg-primary h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
                        </div>
                    </div>

                    <button onclick="window.datanormViewInstance.startImport()" ${this.selectedFiles.length === 0 || this.isImporting ? 'disabled' : ''} class="w-full py-2.5 bg-primary text-white font-semibold text-xs rounded-xl shadow-sm hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
                        <span class="material-symbols-outlined text-sm">play_arrow</span>
                        Import jetzt starten
                    </button>
                </div>

                <!-- Rechte Spalte: Vorhandene Kataloge -->
                <div class="md:col-span-5 space-y-3 border-l border-slate-100 pl-4">
                    <h4 class="text-xs font-bold text-slate-800 uppercase tracking-wider">Importierte Kataloge</h4>
                    <div class="space-y-2 max-h-[350px] overflow-y-auto">
                        ${this.kataloge.length === 0 ? '<div class="text-xs text-slate-400 py-4 text-center">Noch keine Kataloge importiert.</div>' : ''}
                        ${this.kataloge.map(k => `
                            <div class="p-3 bg-white border border-slate-200 rounded-xl shadow-sm text-xs space-y-1">
                                <div class="flex items-center justify-between font-bold text-slate-800">
                                    <span>${k.katalog_name}</span>
                                    <button onclick="window.datanormViewInstance.deleteKatalog(${k.id})" class="text-red-400 hover:text-red-600" title="Katalog löschen">
                                        <span class="material-symbols-outlined text-sm">delete</span>
                                    </button>
                                </div>
                                <div class="text-slate-500 font-medium">${k.lieferant_name}</div>
                                <div class="flex justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-50">
                                    <span>${k.anzahl_artikel.toLocaleString('de-DE')} Artikel</span>
                                    <span>${new Date(k.import_datum).toLocaleDateString('de-DE')}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    onFilesSelected(event) {
        const files = Array.from(event.target.files || []);
        // In Electron, File objects have a 'path' property
        this.selectedFiles = files.map(f => f.path || f.name);
        this.renderWizard();
    }

    removeFile(index) {
        this.selectedFiles.splice(index, 1);
        this.renderWizard();
    }

    async startImport() {
        if (this.selectedFiles.length === 0) return;
        this.isImporting = true;

        const lieferant = document.getElementById('datanorm-lieferant')?.value || 'Großhandel';
        const katalogName = document.getElementById('datanorm-katalogname')?.value || 'DATANORM Katalog';
        const aufschlagProzent = parseFloat(document.getElementById('datanorm-aufschlag')?.value) || 25.0;

        const progressBox = document.getElementById('datanorm-progress-box');
        const progressBar = document.getElementById('datanorm-progress-bar');
        const progressText = document.getElementById('datanorm-progress-text');
        if (progressBox) progressBox.classList.remove('hidden');

        try {
            if (window.api && window.api.startDatanormImport) {
                const res = await window.api.startDatanormImport(this.selectedFiles, {
                    lieferant,
                    katalogName,
                    aufschlagProzent
                });

                if (typeof showToast === 'function') {
                    showToast(`DATANORM-Import erfolgreich: ${res.totalInserted || res.countInserted} Artikel importiert!`, 'success');
                }
            }
            this.selectedFiles = [];
            await this.loadKataloge();
        } catch (err) {
            console.error('Fehler beim DATANORM-Import:', err);
            if (typeof showToast === 'function') {
                showToast('Import-Fehler: ' + err.message, 'error');
            }
        } finally {
            this.isImporting = false;
            this.renderWizard();
        }
    }

    async deleteKatalog(katalogId) {
        if (!confirm('Möchten Sie diesen Katalog und alle zugehörigen DATANORM-Artikel wirklich löschen?')) return;
        try {
            if (window.api && window.api.deleteDatanormKatalog) {
                await window.api.deleteDatanormKatalog(katalogId);
                if (typeof showToast === 'function') {
                    showToast('Katalog gelöscht.', 'success');
                }
                await this.loadKataloge();
                this.renderWizard();
            }
        } catch (e) {
            console.error('Fehler beim Löschen:', e);
        }
    }
};
