/**
 * views/MaengelView.js - UI-Komponente für das projektübergreifende Mängelkataster & Fristenmanagement
 * Konform nach VOB/B § 13 und BGB § 641 Abs. 3.
 */

window.MaengelView = class MaengelView {
    constructor(containerId = 'view-maengel') {
        this.containerId = containerId;
        this.maengel = [];
        this.filter = { projektId: '', status: '', subId: '', schweregrad: '', search: '' };
        this.selectedMangel = null;
    }

    /**
     * Lädt alle Mängel und rendert die Hauptansicht.
     */
    async loadAndRender(filterOverrides = {}) {
        this.filter = { ...this.filter, ...filterOverrides };
        const container = document.getElementById(this.containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="flex items-center justify-center py-12 text-slate-400">
                <span class="material-symbols-outlined animate-spin mr-2">progress_activity</span>
                Mängelkataster wird geladen...
            </div>
        `;

        try {
            if (window.api && window.api.getMaengelKataster) {
                this.maengel = await window.api.getMaengelKataster(this.filter);
            } else if (window.MaengelController) {
                this.maengel = [];
            }
            this.render(container);
        } catch (err) {
            console.error('Fehler beim Laden des Mängelkatasters:', err);
            container.innerHTML = `<div class="p-6 text-red-500 font-medium">Fehler: ${err.message}</div>`;
        }
    }

    /**
     * Rendert das Haupt-Dashboard des Mängelkatasters.
     */
    render(container) {
        const state = window.state || {};
        const projekte = state.projekte || [];
        const kunden = (state.kunden || []).filter(k => k.is_subcontractor || k.customer_type === 'LIEFERANT');

        // Fristen-Statistik
        let countRot = 0;
        let countGelb = 0;
        let countGruen = 0;
        let countErledigt = 0;
        let summeEinbehalt = 0;

        let filtered = this.maengel.filter(m => {
            if (this.filter.search) {
                const q = this.filter.search.toLowerCase();
                const match = (m.titel || '').toLowerCase().includes(q) ||
                    (m.mangel_nr || '').toLowerCase().includes(q) ||
                    (m.gewerk || '').toLowerCase().includes(q) ||
                    (m.ort_beschreibung || '').toLowerCase().includes(q);
                if (!match) return false;
            }
            return true;
        });

        this.maengel.forEach(m => {
            if (m.status === 'ERLEDIGT' || m.status === 'ABGEWIESEN') {
                countErledigt++;
            } else if (m.fristAmpel.color === 'RED') {
                countRot++;
                summeEinbehalt += (m.einbehalt_betrag_eur || 0);
            } else if (m.fristAmpel.color === 'YELLOW') {
                countGelb++;
                summeEinbehalt += (m.einbehalt_betrag_eur || 0);
            } else {
                countGruen++;
            }
        });

        const formatCur = (v) => (parseFloat(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

        container.innerHTML = `
            <div class="space-y-6 max-w-7xl mx-auto p-4">
                <!-- Top Header & Aktionen -->
                <div class="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 class="text-2xl font-bold text-slate-800 flex items-center gap-2">
                            <span class="material-symbols-outlined text-primary text-3xl">assignment_late</span>
                            Projektübergreifendes Mängelkataster & Fristenradar
                        </h1>
                        <p class="text-xs text-slate-500 mt-1">Rechtssichere Fristenüberwachung nach VOB/B § 13 und § 641 Abs. 3 BGB</p>
                    </div>
                    <button onclick="window.maengelViewInstance.openCreateModal()" class="px-4 py-2 bg-primary text-white text-xs font-semibold rounded-xl hover:bg-primary/90 shadow-sm flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-sm">add</span> Neuen Mangel erfassen
                    </button>
                </div>

                <!-- Fristenradar KPI-Karten -->
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div class="bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm cursor-pointer" onclick="window.maengelViewInstance.applyStatusFilter('OVERDUE')">
                        <div class="flex justify-between items-center text-red-700 text-xs font-bold uppercase tracking-wider">
                            <span>Überfällige Fristen</span>
                            <span class="material-symbols-outlined text-red-500">error</span>
                        </div>
                        <div class="text-2xl font-black text-red-800 mt-2">${countRot}</div>
                        <div class="text-[11px] text-red-600 mt-1">Sofortige Nachfrist / Ersatzvornahme erforderlich</div>
                    </div>

                    <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-sm cursor-pointer" onclick="window.maengelViewInstance.applyStatusFilter('DUE_SOON')">
                        <div class="flex justify-between items-center text-amber-700 text-xs font-bold uppercase tracking-wider">
                            <span>Fristablauf &le; 7 Tage</span>
                            <span class="material-symbols-outlined text-amber-500">warning</span>
                        </div>
                        <div class="text-2xl font-black text-amber-800 mt-2">${countGelb}</div>
                        <div class="text-[11px] text-amber-600 mt-1">In Nachbesserung / Frist beachten</div>
                    </div>

                    <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 shadow-sm cursor-pointer" onclick="window.maengelViewInstance.applyStatusFilter('ON_TIME')">
                        <div class="flex justify-between items-center text-emerald-700 text-xs font-bold uppercase tracking-wider">
                            <span>Fristgerecht</span>
                            <span class="material-symbols-outlined text-emerald-500">check_circle</span>
                        </div>
                        <div class="text-2xl font-black text-emerald-800 mt-2">${countGruen}</div>
                        <div class="text-[11px] text-emerald-600 mt-1">Laufende Nacherfüllung</div>
                    </div>

                    <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                        <div class="flex justify-between items-center text-slate-500 text-xs font-bold uppercase tracking-wider">
                            <span>Druckzuschlag-Einbehalt</span>
                            <span class="material-symbols-outlined text-slate-400">gavel</span>
                        </div>
                        <div class="text-xl font-bold text-slate-800 mt-2">${formatCur(summeEinbehalt)}</div>
                        <div class="text-[11px] text-slate-400 mt-1">§ 641 (3) BGB Zurückbehaltungsrecht</div>
                    </div>
                </div>

                <!-- Filter-Leiste -->
                <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-3 text-xs">
                    <div class="flex-1 min-w-[200px]">
                        <input type="text" id="maengel-search" placeholder="Suche nach Titel, Mangel-Nr, Gewerk..." value="${this.filter.search}" oninput="window.maengelViewInstance.onSearch(event)" class="w-full text-xs rounded-lg border-slate-300 py-1.5 px-3">
                    </div>
                    <select id="maengel-filter-projekt" onchange="window.maengelViewInstance.onFilterChange()" class="text-xs rounded-lg border-slate-300 py-1.5 px-3">
                        <option value="">Alle Projekte</option>
                        ${projekte.map(p => `<option value="${p.id}" ${String(this.filter.projektId) === String(p.id) ? 'selected' : ''}>${p.name}</option>`).join('')}
                    </select>
                    <select id="maengel-filter-status" onchange="window.maengelViewInstance.onFilterChange()" class="text-xs rounded-lg border-slate-300 py-1.5 px-3">
                        <option value="">Alle Status</option>
                        <option value="ERFASST" ${this.filter.status === 'ERFASST' ? 'selected' : ''}>Erfasst</option>
                        <option value="MAENGELRUEGE_VERSCHICKT" ${this.filter.status === 'MAENGELRUEGE_VERSCHICKT' ? 'selected' : ''}>Mängelrüge verschickt (Stufe 1)</option>
                        <option value="IN_NACHBESSERUNG" ${this.filter.status === 'IN_NACHBESSERUNG' ? 'selected' : ''}>In Nachbesserung</option>
                        <option value="MAHNUNG_STUFE_2" ${this.filter.status === 'MAHNUNG_STUFE_2' ? 'selected' : ''}>Mahnung Stufe 2 (Nachfrist)</option>
                        <option value="ZUR_ABNAHME" ${this.filter.status === 'ZUR_ABNAHME' ? 'selected' : ''}>Zur Abnahme gemeldet</option>
                        <option value="ERLEDIGT" ${this.filter.status === 'ERLEDIGT' ? 'selected' : ''}>Erledigt</option>
                        <option value="ERSATZVORNAHME" ${this.filter.status === 'ERSATZVORNAHME' ? 'selected' : ''}>Ersatzvornahme</option>
                    </select>
                </div>

                <!-- Mängel Tabelle -->
                <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <table class="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr class="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                                <th class="p-3">Mangel-Nr</th>
                                <th class="p-3">Titel & Bauteil</th>
                                <th class="p-3">Projekt</th>
                                <th class="p-3">Subunternehmer</th>
                                <th class="p-3">Fristen-Radar</th>
                                <th class="p-3">Status</th>
                                <th class="p-3 text-right">Beseitigung / Einbehalt</th>
                                <th class="p-3 text-center">Aktionen</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            ${filtered.length === 0 ? '<tr><td colspan="8" class="p-8 text-center text-slate-400">Keine Mängel für die aktuellen Filter gefunden.</td></tr>' : ''}
                            ${filtered.map(m => {
                                const ampel = m.fristAmpel;
                                const ampelBadge = ampel.color === 'RED'
                                    ? '<span class="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">● Überfällig</span>'
                                    : (ampel.color === 'YELLOW'
                                        ? '<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">● Frist nah</span>'
                                        : (ampel.color === 'GREEN'
                                            ? '<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">● Fristgerecht</span>'
                                            : '<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Erledigt</span>'));

                                return `
                                    <tr class="hover:bg-slate-50 transition-colors">
                                        <td class="p-3 font-mono font-bold text-slate-800">${m.mangel_nr}</td>
                                        <td class="p-3">
                                            <div class="font-bold text-slate-800">${m.titel}</div>
                                            <div class="text-[11px] text-slate-400">${[m.gewerk, m.bauteil, m.ort_beschreibung].filter(Boolean).join(' &bull; ')}</div>
                                        </td>
                                        <td class="p-3 text-slate-600 font-medium">${m.projekt_name || '-'}</td>
                                        <td class="p-3 text-slate-600">${m.subunternehmer_name || m.verursacher_typ || 'Sub'}</td>
                                        <td class="p-3">
                                            <div>${ampelBadge}</div>
                                            <div class="text-[11px] text-slate-500 mt-0.5">${ampel.text}</div>
                                        </td>
                                        <td class="p-3">
                                            <span class="px-2 py-0.5 rounded text-[11px] font-semibold ${m.status === 'ERLEDIGT' ? 'bg-slate-100 text-slate-600' : (m.status === 'MAHNUNG_STUFE_2' ? 'bg-red-100 text-red-800' : 'bg-primary/10 text-primary')}">
                                                ${m.status}
                                            </span>
                                        </td>
                                        <td class="p-3 text-right">
                                            <div class="font-medium text-slate-800">${formatCur(m.geschaetzte_beseitigungskosten_eur)}</div>
                                            <div class="text-[11px] text-slate-400">Einbehalt: ${formatCur(m.einbehalt_betrag_eur)}</div>
                                        </td>
                                        <td class="p-3 text-center">
                                            <div class="flex items-center justify-center gap-1">
                                                <button onclick="window.maengelViewInstance.openDetailModal(${m.id})" class="p-1 text-slate-500 hover:text-primary" title="Details / Mahnwesen">
                                                    <span class="material-symbols-outlined text-sm">visibility</span>
                                                </button>
                                                <button onclick="window.maengelViewInstance.openMahnungModal(${m.id}, 1)" class="p-1 text-sky-500 hover:text-sky-700" title="Mängelrüge Stufe 1">
                                                    <span class="material-symbols-outlined text-sm">mail</span>
                                                </button>
                                                <button onclick="window.maengelViewInstance.openMahnungModal(${m.id}, 2)" class="p-1 text-red-500 hover:text-red-700" title="Nachfrist Stufe 2">
                                                    <span class="material-symbols-outlined text-sm">warning</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    onSearch(e) {
        this.filter.search = e.target.value;
        const container = document.getElementById(this.containerId);
        if (container) this.render(container);
    }

    onFilterChange() {
        this.filter.projektId = document.getElementById('maengel-filter-projekt')?.value || '';
        this.filter.status = document.getElementById('maengel-filter-status')?.value || '';
        this.loadAndRender();
    }

    applyStatusFilter(type) {
        if (type === 'OVERDUE') {
            this.filter.status = 'MAHNUNG_STUFE_2';
        } else if (type === 'DUE_SOON') {
            this.filter.status = 'MAENGELRUEGE_VERSCHICKT';
        } else if (type === 'ON_TIME') {
            this.filter.status = 'IN_NACHBESSERUNG';
        }
        this.loadAndRender();
    }

    /**
     * Öffnet das Erfassungs-Modal für einen neuen Mangel.
     */
    openCreateModal(projectId = null) {
        const state = window.state || {};
        const projekte = state.projekte || [];
        const kunden = (state.kunden || []).filter(k => k.is_subcontractor || k.customer_type === 'LIEFERANT');

        let modal = document.getElementById('mangel-create-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'mangel-create-modal';
            modal.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4';
            document.body.appendChild(modal);
        }
        modal.classList.remove('hidden');

        const defaultFrist = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs">
                <div class="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <h3 class="font-bold text-slate-800 text-sm flex items-center gap-2">
                        <span class="material-symbols-outlined text-primary">add_circle</span>
                        Neuen Mangel erfassen
                    </h3>
                    <button onclick="document.getElementById('mangel-create-modal').classList.add('hidden')" class="text-slate-400 hover:text-slate-600">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div class="p-6 overflow-y-auto space-y-4">
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block font-semibold text-slate-700 mb-1">Projekt *</label>
                            <select id="mc-projekt" class="w-full rounded-lg border-slate-300 py-1.5 px-3">
                                ${projekte.map(p => `<option value="${p.id}" ${projectId && String(projectId) === String(p.id) ? 'selected' : ''}>${p.name}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block font-semibold text-slate-700 mb-1">Subunternehmer / Verursacher</label>
                            <select id="mc-sub" class="w-full rounded-lg border-slate-300 py-1.5 px-3">
                                <option value="">-- Eigenleistung / Unbekannt --</option>
                                ${kunden.map(k => `<option value="${k.id}">${k.name}</option>`).join('')}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Mangel-Bezeichnung / Titel *</label>
                        <input type="text" id="mc-titel" placeholder="z. B. Undichtigkeit an Eckventil im EG Bad" class="w-full rounded-lg border-slate-300 py-1.5 px-3">
                    </div>

                    <div class="grid grid-cols-3 gap-3">
                        <div>
                            <label class="block font-semibold text-slate-700 mb-1">Gewerk</label>
                            <input type="text" id="mc-gewerk" placeholder="z. B. Sanitär" class="w-full rounded-lg border-slate-300 py-1.5 px-3">
                        </div>
                        <div>
                            <label class="block font-semibold text-slate-700 mb-1">Bauteil</label>
                            <input type="text" id="mc-bauteil" placeholder="z. B. Waschtisch" class="w-full rounded-lg border-slate-300 py-1.5 px-3">
                        </div>
                        <div>
                            <label class="block font-semibold text-slate-700 mb-1">Schweregrad</label>
                            <select id="mc-schweregrad" class="w-full rounded-lg border-slate-300 py-1.5 px-3">
                                <option value="LEICHT">Leicht (Optisch)</option>
                                <option value="MITTEL" selected>Mittel (Funktionell)</option>
                                <option value="SCHWER">Schwer</option>
                                <option value="ABNAHMEHINDERND">Abnahmehindernd</option>
                            </select>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block font-semibold text-slate-700 mb-1">Nacherfüllungsfrist</label>
                            <input type="date" id="mc-frist" value="${defaultFrist}" class="w-full rounded-lg border-slate-300 py-1.5 px-3">
                        </div>
                        <div>
                            <label class="block font-semibold text-slate-700 mb-1">Geschätzte Kosten (€)</label>
                            <input type="number" id="mc-kosten" step="50" value="0" class="w-full rounded-lg border-slate-300 py-1.5 px-3">
                        </div>
                    </div>

                    <div>
                        <label class="block font-semibold text-slate-700 mb-1">Detaillierte Sachverhaltsbeschreibung</label>
                        <textarea id="mc-beschreibung" rows="3" placeholder="Genaue Beschreibung des Mangels..." class="w-full rounded-lg border-slate-300 py-1.5 px-3"></textarea>
                    </div>
                </div>
                <div class="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
                    <button onclick="document.getElementById('mangel-create-modal').classList.add('hidden')" class="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-100">Abbrechen</button>
                    <button onclick="window.maengelViewInstance.submitCreateMangel()" class="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-semibold">Mangel speichern</button>
                </div>
            </div>
        `;
    }

    async submitCreateMangel() {
        const projektId = parseInt(document.getElementById('mc-projekt')?.value, 10);
        const subId = document.getElementById('mc-sub')?.value ? parseInt(document.getElementById('mc-sub')?.value, 10) : null;
        const titel = document.getElementById('mc-titel')?.value;
        const gewerk = document.getElementById('mc-gewerk')?.value;
        const bauteil = document.getElementById('mc-bauteil')?.value;
        const schweregrad = document.getElementById('mc-schweregrad')?.value || 'MITTEL';
        const frist = document.getElementById('mc-frist')?.value;
        const kosten = parseFloat(document.getElementById('mc-kosten')?.value) || 0;
        const beschreibung = document.getElementById('mc-beschreibung')?.value;

        if (!projektId || !titel) {
            alert('Bitte wählen Sie ein Projekt aus und geben Sie einen Titel an.');
            return;
        }

        try {
            if (window.api && window.api.saveMangel) {
                await window.api.saveMangel({
                    projekt_id: projektId,
                    subunternehmer_kunde_id: subId,
                    titel,
                    gewerk,
                    bauteil,
                    schweregrad,
                    nachbesserungsfrist: frist,
                    geschaetzte_beseitigungskosten_eur: kosten,
                    beschreibung,
                    status: 'ERFASST'
                });
                if (typeof showToast === 'function') {
                    showToast('Mangel erfolgreich erfasst.', 'success');
                }
            }
            document.getElementById('mangel-create-modal')?.classList.add('hidden');
            await this.loadAndRender();
        } catch (e) {
            console.error('Fehler beim Erfassen des Mangels:', e);
            alert('Fehler: ' + e.message);
        }
    }

    /**
     * Öffnet das Mahnwesen-Modal (Stufe 1 oder 2).
     */
    async openMahnungModal(mangelId, stufe = 1) {
        try {
            if (window.api && window.api.generateMahnschreiben) {
                const res = await window.api.generateMahnschreiben(mangelId, stufe, {});
                if (res && res.html) {
                    const win = window.open('', '_blank');
                    if (win) {
                        win.document.write(res.html);
                        win.document.close();
                    }
                }
                await this.loadAndRender();
            }
        } catch (e) {
            console.error('Fehler beim Generieren des Mahnschreibens:', e);
        }
    }

    /**
     * Öffnet die Detailansicht eines Mangels.
     */
    async openDetailModal(mangelId) {
        try {
            if (window.api && window.api.getMangelDetails) {
                const mangel = await window.api.getMangelDetails(mangelId);
                if (mangel) {
                    this.selectedMangel = mangel;
                    this.openMahnungModal(mangelId, mangel.status === 'MAHNUNG_STUFE_2' ? 2 : 1);
                }
            }
        } catch (e) {
            console.error('Fehler:', e);
        }
    }
};
