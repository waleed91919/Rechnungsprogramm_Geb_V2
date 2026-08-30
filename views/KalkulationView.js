/**
 * views/KalkulationView.js - UI-Komponente für Zuschlags- & Endsummenkalkulation (VHB 221/222)
 * Deckungsbeitrags-Cockpit, Mittellohn-Engine & Soll-Ist-Nachkalkulation.
 */

window.KalkulationView = class KalkulationView {
    constructor(containerId = 'pd-panel-kalkulation') {
        this.containerId = containerId;
        this.currentProjectId = null;
        this.currentData = null;
        this.currentProfile = null;
    }

    /**
     * Lädt die Kalkulation für ein Projekt und rendert die UI.
     * @param {number} projectId
     */
    async loadAndRender(projectId) {
        this.currentProjectId = projectId;
        const container = document.getElementById(this.containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="flex items-center justify-center py-12 text-slate-400">
                <span class="material-symbols-outlined animate-spin mr-2">progress_activity</span>
                Zuschlagskalkulation wird berechnet...
            </div>
        `;

        try {
            let data = null;
            if (window.api && window.api.getProjectKalkulation) {
                data = await window.api.getProjectKalkulation(projectId);
            } else if (window.KalkulationController) {
                const state = window.state || {};
                const project = (state.projekte || []).find(p => p.id === projectId) || { id: projectId, name: 'Projekt' };
                const positions = (state.rechnungen || [])
                    .filter(r => r.projektId === projectId)
                    .flatMap(r => r.positionen || []);
                const profile = window.KalkulationController.getDefaultProfile();
                const calculationResult = window.KalkulationController.calculateProjectKalkulation(positions, profile);
                data = { project, profile, calculationResult, positionsCount: positions.length, actualCosts: { material: 0, sub: 0, hours: 0 } };
            }

            if (!data) {
                container.innerHTML = `<div class="p-6 text-red-500">Konnte Kalkulationsdaten nicht laden.</div>`;
                return;
            }

            this.currentData = data;
            this.currentProfile = data.profile;
            this.render(container);
        } catch (err) {
            console.error('Fehler beim Laden der Kalkulation:', err);
            container.innerHTML = `<div class="p-6 text-red-500 font-medium">Fehler: ${err.message}</div>`;
        }
    }

    /**
     * Rendert das vollständige Kalkulations-Cockpit.
     */
    render(container) {
        const { calculationResult, profile, project } = this.currentData;
        const ml = calculationResult.mittellohnStructure;
        const totals = calculationResult.totals;
        const nachkalk = calculationResult.nachkalkulation;

        const formatCur = (v) => (parseFloat(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
        const formatPct = (v) => (parseFloat(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
        const formatNum = (v) => (parseFloat(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        // DB1 Margen-Farbe
        const db1Color = totals.db1Quote >= 25 ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : (totals.db1Quote >= 15 ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-red-600 bg-red-50 border-red-200');

        container.innerHTML = `
            <div class="space-y-6 w-full p-2">
                <!-- Header & Verfahren-Wahl -->
                <div class="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div>
                        <h2 class="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <span class="material-symbols-outlined text-primary">calculate</span>
                            Zuschlagskalkulation & Deckungsbeitrags-Cockpit
                        </h2>
                        <p class="text-xs text-slate-500">Projekt: <strong>${project.name || 'Projekt'}</strong> &bull; VHB 2024/2026 & KLR Bau</p>
                    </div>
                    <div class="flex items-center gap-3">
                        <select id="kalk-verfahren-select" onchange="window.kalkulationViewInstance.onProfileChange()" class="text-xs font-semibold rounded-lg border-slate-300 shadow-sm focus:border-primary focus:ring-primary py-1.5 px-3 bg-slate-50">
                            <option value="ZUSCHLAGSKALKULATION" ${profile.kalkulationsverfahren === 'ZUSCHLAGSKALKULATION' ? 'selected' : ''}>Zuschlagskalkulation (EFB 221)</option>
                            <option value="ENDSUMMENKALKULATION" ${profile.kalkulationsverfahren === 'ENDSUMMENKALKULATION' ? 'selected' : ''}>Endsummenkalkulation (EFB 222)</option>
                        </select>
                        <button onclick="window.kalkulationViewInstance.saveProfile()" class="px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90 flex items-center gap-1.5 shadow-sm">
                            <span class="material-symbols-outlined text-sm">save</span> Profil speichern
                        </button>
                    </div>
                </div>

                <!-- KPI Cockpit Cards -->
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <div class="text-xs font-medium text-slate-500 uppercase tracking-wider">Angebotssumme Netto</div>
                        <div class="text-xl font-bold text-slate-900 mt-1">${formatCur(totals.summeAngebotNetto)}</div>
                        <div class="text-[11px] text-slate-400 mt-1">${formatNum(totals.summeGesamtstunden)} Lohnstunden kalkuliert</div>
                    </div>
                    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <div class="text-xs font-medium text-slate-500 uppercase tracking-wider">Einzelkosten (EKT)</div>
                        <div class="text-xl font-bold text-slate-700 mt-1">${formatCur(totals.summeEktGesamt)}</div>
                        <div class="text-[11px] text-slate-400 mt-1">Lohn: ${formatCur(totals.summeEktLohn)} | Stoffe: ${formatCur(totals.summeEktStoffe)}</div>
                    </div>
                    <div class="bg-white p-4 rounded-xl border ${db1Color} shadow-sm">
                        <div class="text-xs font-medium uppercase tracking-wider">Deckungsbeitrag I (DB I)</div>
                        <div class="text-xl font-bold mt-1">${formatCur(totals.deckungsbeitrag1)}</div>
                        <div class="text-[11px] font-semibold mt-1">DB-Quote: ${formatPct(totals.db1Quote)}</div>
                    </div>
                    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <div class="text-xs font-medium text-slate-500 uppercase tracking-wider">Kalkulierter Gewinn</div>
                        <div class="text-xl font-bold text-primary mt-1">${formatCur(totals.kalkulierterGewinn)}</div>
                        <div class="text-[11px] text-slate-500 mt-1">Umsatzrendite: <strong>${formatPct(totals.gewinnMargeProzent)}</strong></div>
                    </div>
                </div>

                <!-- 2-Spalten Layout: Mittellohn & Zuschlagsmatrix -->
                <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <!-- Mittellohn-Engine (5 Spalten) -->
                    <div class="lg:col-span-5 bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                        <h3 class="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center justify-between">
                            <span>1. Mittellohn-Kalkulation (VHB 221)</span>
                            <span class="text-xs font-normal text-slate-400">Stundensätze</span>
                        </h3>
                        <div class="space-y-3 text-xs">
                            <div class="flex items-center justify-between">
                                <label class="text-slate-600">Mittellohn (ML):</label>
                                <div class="flex items-center gap-1">
                                    <input type="number" step="0.50" id="kalk-ml" value="${profile.mittellohn_eur}" oninput="window.kalkulationViewInstance.onProfileChange()" class="w-24 text-right rounded border-slate-300 text-xs py-1 px-2">
                                    <span class="text-slate-400">€/h</span>
                                </div>
                            </div>
                            <div class="flex items-center justify-between">
                                <label class="text-slate-600">Lohngebundene Kosten (LK):</label>
                                <div class="flex items-center gap-1">
                                    <input type="number" step="0.50" id="kalk-lk" value="${profile.lohngebundene_kosten_prozent}" oninput="window.kalkulationViewInstance.onProfileChange()" class="w-24 text-right rounded border-slate-300 text-xs py-1 px-2">
                                    <span class="text-slate-400">%</span>
                                    <span class="text-slate-500 font-mono w-20 text-right">(${formatCur(ml.lohngebundeneKosten.eur)})</span>
                                </div>
                            </div>
                            <div class="flex items-center justify-between">
                                <label class="text-slate-600">Lohnnebenkosten (LNK):</label>
                                <div class="flex items-center gap-1">
                                    <input type="number" step="0.50" id="kalk-lnk" value="${profile.lohnnebenkosten_prozent}" oninput="window.kalkulationViewInstance.onProfileChange()" class="w-24 text-right rounded border-slate-300 text-xs py-1 px-2">
                                    <span class="text-slate-400">%</span>
                                    <span class="text-slate-500 font-mono w-20 text-right">(${formatCur(ml.lohnnebenkosten.eur)})</span>
                                </div>
                            </div>
                            <div class="flex items-center justify-between font-bold bg-slate-50 p-2 rounded border border-slate-200">
                                <span class="text-slate-800">Kalkulationslohn (KL):</span>
                                <span class="text-primary font-mono text-sm">${formatCur(ml.kalkulationslohn)} / h</span>
                            </div>
                            <div class="flex items-center justify-between">
                                <label class="text-slate-600">Gesamtzuschlag Lohn:</label>
                                <span class="font-mono text-slate-700 font-semibold">${formatPct(ml.zuschlagLohn.prozent)} (${formatCur(ml.zuschlagLohn.eur)})</span>
                            </div>
                            <div class="flex items-center justify-between font-bold bg-primary/5 p-2 rounded border border-primary/20">
                                <span class="text-primary">Verrechnungslohn (VL):</span>
                                <span class="text-primary font-mono text-sm">${formatCur(ml.verrechnungslohn)} / h</span>
                            </div>
                        </div>
                    </div>

                    <!-- Zuschlagsmatrix (7 Spalten) -->
                    <div class="lg:col-span-7 bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                        <h3 class="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">
                            2. Gemeinkosten-Zuschläge auf EKT in %
                        </h3>
                        <div class="overflow-x-auto">
                            <table class="w-full text-xs border-collapse">
                                <thead>
                                    <tr class="bg-slate-50 border-b border-slate-200 text-slate-600">
                                        <th class="p-2 text-left">Zuschlag</th>
                                        <th class="p-2 text-center">Lohn</th>
                                        <th class="p-2 text-center">Stoffe</th>
                                        <th class="p-2 text-center">Geräte</th>
                                        <th class="p-2 text-center">Sonst.</th>
                                        <th class="p-2 text-center">NU</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">
                                    <tr>
                                        <td class="p-2 font-medium text-slate-700">Baustellengem. (BGK)</td>
                                        <td class="p-1"><input type="number" step="0.5" id="z-lohn-bgk" value="${profile.zuschlag_lohn_bgk}" oninput="window.kalkulationViewInstance.onProfileChange()" class="w-full text-center rounded border-slate-300 text-xs py-1 px-1"></td>
                                        <td class="p-1"><input type="number" step="0.5" id="z-stoff-bgk" value="${profile.zuschlag_stoff_bgk}" oninput="window.kalkulationViewInstance.onProfileChange()" class="w-full text-center rounded border-slate-300 text-xs py-1 px-1"></td>
                                        <td class="p-1"><input type="number" step="0.5" id="z-geraet-bgk" value="${profile.zuschlag_geraet_bgk}" oninput="window.kalkulationViewInstance.onProfileChange()" class="w-full text-center rounded border-slate-300 text-xs py-1 px-1"></td>
                                        <td class="p-1"><input type="number" step="0.5" id="z-sonst-bgk" value="${profile.zuschlag_sonst_bgk}" oninput="window.kalkulationViewInstance.onProfileChange()" class="w-full text-center rounded border-slate-300 text-xs py-1 px-1"></td>
                                        <td class="p-1"><input type="number" step="0.5" id="z-nu-bgk" value="${profile.zuschlag_nu_bgk}" oninput="window.kalkulationViewInstance.onProfileChange()" class="w-full text-center rounded border-slate-300 text-xs py-1 px-1"></td>
                                    </tr>
                                    <tr>
                                        <td class="p-2 font-medium text-slate-700">Allg. Geschäftsk. (AGK)</td>
                                        <td class="p-1"><input type="number" step="0.5" id="z-lohn-agk" value="${profile.zuschlag_lohn_agk}" oninput="window.kalkulationViewInstance.onProfileChange()" class="w-full text-center rounded border-slate-300 text-xs py-1 px-1"></td>
                                        <td class="p-1"><input type="number" step="0.5" id="z-stoff-agk" value="${profile.zuschlag_stoff_agk}" oninput="window.kalkulationViewInstance.onProfileChange()" class="w-full text-center rounded border-slate-300 text-xs py-1 px-1"></td>
                                        <td class="p-1"><input type="number" step="0.5" id="z-geraet-agk" value="${profile.zuschlag_geraet_agk}" oninput="window.kalkulationViewInstance.onProfileChange()" class="w-full text-center rounded border-slate-300 text-xs py-1 px-1"></td>
                                        <td class="p-1"><input type="number" step="0.5" id="z-sonst-agk" value="${profile.zuschlag_sonst_agk}" oninput="window.kalkulationViewInstance.onProfileChange()" class="w-full text-center rounded border-slate-300 text-xs py-1 px-1"></td>
                                        <td class="p-1"><input type="number" step="0.5" id="z-nu-agk" value="${profile.zuschlag_nu_agk}" oninput="window.kalkulationViewInstance.onProfileChange()" class="w-full text-center rounded border-slate-300 text-xs py-1 px-1"></td>
                                    </tr>
                                    <tr>
                                        <td class="p-2 font-medium text-slate-700">Wagnis & Gewinn (W&G)</td>
                                        <td class="p-1"><input type="number" step="0.5" id="z-lohn-wug" value="${profile.zuschlag_lohn_wug}" oninput="window.kalkulationViewInstance.onProfileChange()" class="w-full text-center rounded border-slate-300 text-xs py-1 px-1"></td>
                                        <td class="p-1"><input type="number" step="0.5" id="z-stoff-wug" value="${profile.zuschlag_stoff_wug}" oninput="window.kalkulationViewInstance.onProfileChange()" class="w-full text-center rounded border-slate-300 text-xs py-1 px-1"></td>
                                        <td class="p-1"><input type="number" step="0.5" id="z-geraet-wug" value="${profile.zuschlag_geraet_wug}" oninput="window.kalkulationViewInstance.onProfileChange()" class="w-full text-center rounded border-slate-300 text-xs py-1 px-1"></td>
                                        <td class="p-1"><input type="number" step="0.5" id="z-sonst-wug" value="${profile.zuschlag_sonst_wug}" oninput="window.kalkulationViewInstance.onProfileChange()" class="w-full text-center rounded border-slate-300 text-xs py-1 px-1"></td>
                                        <td class="p-1"><input type="number" step="0.5" id="z-nu-wug" value="${profile.zuschlag_nu_wug}" oninput="window.kalkulationViewInstance.onProfileChange()" class="w-full text-center rounded border-slate-300 text-xs py-1 px-1"></td>
                                    </tr>
                                    <tr class="bg-slate-50 font-bold border-t border-slate-200">
                                        <td class="p-2 text-slate-800">Gesamtzuschlag</td>
                                        <td class="p-2 text-center text-primary font-mono">${formatPct(ml.zuschlagLohn.prozent)}</td>
                                        <td class="p-2 text-center font-mono">${formatPct((parseFloat(profile.zuschlag_stoff_bgk)||0) + (parseFloat(profile.zuschlag_stoff_agk)||0) + (parseFloat(profile.zuschlag_stoff_wug)||0))}</td>
                                        <td class="p-2 text-center font-mono">${formatPct((parseFloat(profile.zuschlag_geraet_bgk)||0) + (parseFloat(profile.zuschlag_geraet_agk)||0) + (parseFloat(profile.zuschlag_geraet_wug)||0))}</td>
                                        <td class="p-2 text-center font-mono">${formatPct((parseFloat(profile.zuschlag_sonst_bgk)||0) + (parseFloat(profile.zuschlag_sonst_agk)||0) + (parseFloat(profile.zuschlag_sonst_wug)||0))}</td>
                                        <td class="p-2 text-center font-mono">${formatPct((parseFloat(profile.zuschlag_nu_bgk)||0) + (parseFloat(profile.zuschlag_nu_agk)||0) + (parseFloat(profile.zuschlag_nu_wug)||0))}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Soll-Ist Nachkalkulation Box -->
                <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
                    <h3 class="text-sm font-bold text-slate-800 flex items-center justify-between border-b border-slate-100 pb-2">
                        <span>3. Soll-Ist-Nachkalkulation (Controlling-Abgleich)</span>
                        <span class="text-xs font-normal text-slate-500">Live aus Eingangsrechnungen & Bautagebuch</span>
                    </h3>
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                        <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <div class="text-slate-500">Soll-EKT (Vorkalkuliert)</div>
                            <div class="text-sm font-bold text-slate-800 mt-1">${formatCur(nachkalk.sollEkt)}</div>
                            <div class="text-[11px] text-slate-400 mt-0.5">${formatNum(nachkalk.sollStunden)} Soll-Stunden</div>
                        </div>
                        <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <div class="text-slate-500">Ist-EKT (Rechnung & Std)</div>
                            <div class="text-sm font-bold text-slate-800 mt-1">${formatCur(nachkalk.istEkt)}</div>
                            <div class="text-[11px] text-slate-400 mt-0.5">${formatNum(nachkalk.istStunden)} Ist-Stunden</div>
                        </div>
                        <div class="p-3 ${nachkalk.abweichungEkt >= 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'} rounded-lg border">
                            <div class="font-medium">Kostenabweichung</div>
                            <div class="text-sm font-bold mt-1">${formatCur(nachkalk.abweichungEkt)}</div>
                            <div class="text-[11px] mt-0.5">${nachkalk.abweichungEkt >= 0 ? '✓ Im Budget' : '⚠ Budgetüberschreitung'}</div>
                        </div>
                        <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <div class="text-slate-500">Ist-Deckungsbeitrag</div>
                            <div class="text-sm font-bold text-slate-800 mt-1">${formatCur(nachkalk.istDeckungsbeitrag)}</div>
                            <div class="text-[11px] text-slate-500 mt-0.5">Ist-DB Quote: <strong>${formatPct(nachkalk.istDbQuote)}</strong></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Liest die aktuellen Formularwerte aus und aktualisiert die Live-Berechnung.
     */
    onProfileChange() {
        const getVal = (id, def = 0) => {
            const el = document.getElementById(id);
            return el ? parseFloat(el.value) || def : def;
        };

        const verfahrenEl = document.getElementById('kalk-verfahren-select');
        const verfahren = verfahrenEl ? verfahrenEl.value : 'ZUSCHLAGSKALKULATION';

        const updatedProfile = {
            ...this.currentProfile,
            kalkulationsverfahren: verfahren,
            mittellohn_eur: getVal('kalk-ml', 26.00),
            lohngebundene_kosten_prozent: getVal('kalk-lk', 84.50),
            lohnnebenkosten_prozent: getVal('kalk-lnk', 13.50),
            zuschlag_lohn_bgk: getVal('z-lohn-bgk', 18.0),
            zuschlag_lohn_agk: getVal('z-lohn-agk', 22.0),
            zuschlag_lohn_wug: getVal('z-lohn-wug', 8.0),
            zuschlag_stoff_bgk: getVal('z-stoff-bgk', 12.0),
            zuschlag_stoff_agk: getVal('z-stoff-agk', 14.0),
            zuschlag_stoff_wug: getVal('z-stoff-wug', 6.0),
            zuschlag_geraet_bgk: getVal('z-geraet-bgk', 15.0),
            zuschlag_geraet_agk: getVal('z-geraet-agk', 16.0),
            zuschlag_geraet_wug: getVal('z-geraet-wug', 6.0),
            zuschlag_sonst_bgk: getVal('z-sonst-bgk', 10.0),
            zuschlag_sonst_agk: getVal('z-sonst-agk', 12.0),
            zuschlag_sonst_wug: getVal('z-sonst-wug', 5.0),
            zuschlag_nu_bgk: getVal('z-nu-bgk', 8.0),
            zuschlag_nu_agk: getVal('z-nu-agk', 10.0),
            zuschlag_nu_wug: getVal('z-nu-wug', 4.0)
        };

        const state = window.state || {};
        const positions = (state.rechnungen || [])
            .filter(r => r.projektId === this.currentProjectId)
            .flatMap(r => r.positionen || []);

        const calculationResult = window.KalkulationController.calculateProjectKalkulation(
            positions,
            updatedProfile,
            this.currentData.actualCosts || { material: 0, sub: 0, hours: 0 }
        );

        this.currentData.profile = updatedProfile;
        this.currentData.calculationResult = calculationResult;
        this.currentProfile = updatedProfile;
        const container = document.getElementById(this.containerId);
        if (container) this.render(container);
    }

    /**
     * Speichert das aktuelle Kalkulationsprofil in SQLite.
     */
    async saveProfile() {
        if (!this.currentProjectId || !this.currentProfile) return;
        try {
            if (window.api && window.api.saveProjectKalkulationProfil) {
                await window.api.saveProjectKalkulationProfil(this.currentProjectId, this.currentProfile);
                if (typeof showToast === 'function') {
                    showToast('Kalkulationsprofil erfolgreich gespeichert.', 'success');
                }
            }
        } catch (err) {
            console.error('Fehler beim Speichern des Kalkulationsprofils:', err);
            if (typeof showToast === 'function') {
                showToast('Fehler beim Speichern: ' + err.message, 'error');
            }
        }
    }
};
