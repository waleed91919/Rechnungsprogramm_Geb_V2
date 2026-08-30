/**
 * views/EFBView.js - UI-Darstellungs- und Interaktions-Komponente für EFB-Preisblätter 221 & 223
 * Nach Vergabehandbuch Bund (VHB 2024/2026).
 */

window.EFBView = class EFBView {
    constructor() {
        this.currentProjectId = null;
        this.currentProfile = null;
        this.currentKalkulation = null;
        this.activeSubTab = '221'; // '221' | '223'
    }

    /**
     * Lädt und rendert die EFB-Kalkulation für ein Projekt.
     * @param {number} projectId
     */
    async loadAndRender(projectId) {
        this.currentProjectId = projectId;
        const container = document.getElementById('pd-panel-efb');
        if (!container) return;

        container.innerHTML = `
            <div class="flex items-center justify-center py-12 text-slate-400">
                <span class="material-symbols-outlined animate-spin mr-2">progress_activity</span>
                EFB-Kalkulation wird geladen...
            </div>
        `;

        try {
            let data = null;
            if (window.api && window.api.getEfbKalkulation) {
                data = await window.api.getEfbKalkulation(projectId);
            } else if (window.EFBController) {
                const state = window.state || {};
                const project = (state.projekte || []).find(p => p.id === projectId) || { id: projectId, name: 'Projekt' };
                const positions = (state.rechnungen || [])
                    .filter(r => r.projektId === projectId)
                    .flatMap(r => r.positionen || []);
                const profile = window.EFBController.getDefaultProfile();
                const efb221 = window.EFBController.calculateEFB221(project, positions, profile);
                const efb223 = window.EFBController.calculateEFB223(positions, efb221);
                data = { efb221, efb223, profile, project, positions };
            }

            if (!data) {
                container.innerHTML = `<div class="p-6 text-red-500">Konnte EFB-Daten nicht laden.</div>`;
                return;
            }

            this.currentKalkulation = data;
            this.currentProfile = data.profile;
            this.renderView(container, data);
        } catch (err) {
            console.error('Fehler beim Laden der EFB-Kalkulation:', err);
            container.innerHTML = `<div class="p-6 text-red-500 font-medium">Fehler: ${err.message}</div>`;
        }
    }

    /**
     * Rendert die Hauptansicht mit Sub-Tabs (EFB 221 / EFB 223 / PDF-Export).
     */
    renderView(container, data) {
        const { efb221, efb223, profile } = data;
        const a1 = efb221.abschnitt1;
        const a2 = efb221.abschnitt2;
        const a3 = efb221.abschnitt3;
        const z = a2.zuschlaege;

        const formatCur = (v) => (parseFloat(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
        const formatPct = (v) => (parseFloat(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
        const formatNum = (v, dec = 2) => (parseFloat(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec });

        container.innerHTML = `
            <div class="space-y-6 w-full">
                <!-- Header Toolbar -->
                <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <span class="material-symbols-outlined text-primary text-[22px]">price_change</span>
                            EFB-Preisblätter 221 & 223 (VHB Bund)
                        </h3>
                        <p class="text-xs text-slate-500 mt-0.5">
                            Rechtskonforme Zuschlagskalkulation & Aufgliederung der Einheitspreise für öffentliche Aufträge
                        </p>
                    </div>

                    <div class="flex items-center gap-3">
                        <button type="button" id="btn-save-efb-profile" class="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200">
                            <span class="material-symbols-outlined text-[16px]">save</span>
                            Profil speichern
                        </button>
                        <button type="button" id="btn-export-efb221-pdf" class="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-lg shadow-sm transition-colors">
                            <span class="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                            EFB 221 PDF (A4 Hoch)
                        </button>
                        <button type="button" id="btn-export-efb223-pdf" class="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-dark rounded-lg shadow-sm transition-colors">
                            <span class="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                            EFB 223 PDF (A4 Quer)
                        </button>
                    </div>
                </div>

                <!-- Sub-Tabs Navigation -->
                <div class="flex border-b border-slate-200 bg-white rounded-t-xl px-4 pt-3 gap-6 text-sm font-semibold">
                    <button type="button" id="tab-btn-efb221" class="pb-3 border-b-2 ${this.activeSubTab === '221' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'} flex items-center gap-2">
                        <span class="material-symbols-outlined text-[18px]">calculate</span>
                        Formblatt EFB 221 (Zuschlagskalkulation)
                    </button>
                    <button type="button" id="tab-btn-efb223" class="pb-3 border-b-2 ${this.activeSubTab === '223' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'} flex items-center gap-2">
                        <span class="material-symbols-outlined text-[18px]">view_list</span>
                        Formblatt EFB 223 (Positionsaufgliederung)
                    </button>
                </div>

                <!-- Tab Panel: EFB 221 -->
                <div id="panel-efb221" class="${this.activeSubTab === '221' ? 'block' : 'hidden'} space-y-6">
                    <!-- 1. Verrechnungslohn & Mittellohn -->
                    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                        <div class="bg-slate-900 text-white px-5 py-3 font-semibold text-sm flex justify-between items-center">
                            <span>1. Angaben über den Verrechnungslohn</span>
                            <span class="text-xs bg-primary/30 px-2 py-0.5 rounded text-primary-content">VL: ${formatCur(a1.verrechnungslohn)} / h</span>
                        </div>
                        <div class="p-5 grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div class="space-y-1.5">
                                <label class="block text-xs font-semibold text-slate-600">1.1 Mittellohn (ML) €/h</label>
                                <input type="number" step="0.01" id="efb-mittellohn" value="${a1.mittellohn}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary">
                            </div>
                            <div class="space-y-1.5">
                                <label class="block text-xs font-semibold text-slate-600">1.2 Lohngebundene Kosten % (Sozial/BG)</label>
                                <div class="flex items-center gap-2">
                                    <input type="number" step="0.01" id="efb-lohngebundene-pct" value="${a1.lohngebundeneKostenProzent}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary">
                                    <span class="text-xs text-slate-500 whitespace-nowrap font-mono">(= ${formatCur(a1.lohngebundeneKostenEur)}/h)</span>
                                </div>
                            </div>
                            <div class="space-y-1.5">
                                <label class="block text-xs font-semibold text-slate-600">1.3 Lohnnebenkosten % (Fahrgeld/Wegezeit)</label>
                                <div class="flex items-center gap-2">
                                    <input type="number" step="0.01" id="efb-lohnneben-pct" value="${a1.lohnnebenkostenProzent}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary">
                                    <span class="text-xs text-slate-500 whitespace-nowrap font-mono">(= ${formatCur(a1.lohnnebenkostenEur)}/h)</span>
                                </div>
                            </div>
                        </div>
                        <div class="bg-slate-50 px-5 py-3 border-t border-slate-200 flex flex-wrap justify-between text-xs font-semibold text-slate-700">
                            <div>1.4 Kalkulationslohn (KL): <span class="font-mono text-slate-900 text-sm">${formatCur(a1.kalkulationslohn)} / h</span></div>
                            <div>1.5 Zuschlag auf KL (${formatPct(a1.zuschlagLohnProzent)}): <span class="font-mono text-slate-900 text-sm">${formatCur(a1.zuschlagLohnEur)} / h</span></div>
                            <div>1.6 Verrechnungslohn (VL): <span class="font-mono text-primary text-base font-bold">${formatCur(a1.verrechnungslohn)} / h</span></div>
                        </div>
                    </div>

                    <!-- 2. Zuschlagsmatrix nach Kostenarten -->
                    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                        <div class="bg-slate-900 text-white px-5 py-3 font-semibold text-sm">
                            2. Zuschläge auf die Einzelkosten der Teilleistungen (EKT) in %
                        </div>
                        <div class="p-5 overflow-x-auto">
                            <table class="w-full text-left text-sm border-collapse">
                                <thead>
                                    <tr class="border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                                        <th class="py-2.5 px-3">Zuschlagsart</th>
                                        <th class="py-2.5 px-3">Lohn (Sp. 1)</th>
                                        <th class="py-2.5 px-3">Stoffe (Sp. 2)</th>
                                        <th class="py-2.5 px-3">Geräte (Sp. 3)</th>
                                        <th class="py-2.5 px-3">Sonstige (Sp. 4)</th>
                                        <th class="py-2.5 px-3">NU-Leistung (Sp. 5)</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100 text-sm">
                                    <tr>
                                        <td class="py-2.5 px-3 font-medium text-slate-700">2.1 Baustellengemeinkosten (BGK %)</td>
                                        <td class="py-2.5 px-3"><input type="number" step="0.01" id="efb-zuschlag-lohn-bgk" value="${z.lohn.bgk}" class="w-24 px-2.5 py-1 border border-slate-300 rounded font-mono text-xs"></td>
                                        <td class="py-2.5 px-3"><input type="number" step="0.01" id="efb-zuschlag-stoff-bgk" value="${z.stoffe.bgk}" class="w-24 px-2.5 py-1 border border-slate-300 rounded font-mono text-xs"></td>
                                        <td class="py-2.5 px-3"><input type="number" step="0.01" id="efb-zuschlag-geraet-bgk" value="${z.geraete.bgk}" class="w-24 px-2.5 py-1 border border-slate-300 rounded font-mono text-xs"></td>
                                        <td class="py-2.5 px-3"><input type="number" step="0.01" id="efb-zuschlag-sonst-bgk" value="${z.sonstige.bgk}" class="w-24 px-2.5 py-1 border border-slate-300 rounded font-mono text-xs"></td>
                                        <td class="py-2.5 px-3"><input type="number" step="0.01" id="efb-zuschlag-nu-bgk" value="${z.nu.bgk}" class="w-24 px-2.5 py-1 border border-slate-300 rounded font-mono text-xs"></td>
                                    </tr>
                                    <tr>
                                        <td class="py-2.5 px-3 font-medium text-slate-700">2.2 Allg. Geschäftskosten (AGK %)</td>
                                        <td class="py-2.5 px-3"><input type="number" step="0.01" id="efb-zuschlag-lohn-agk" value="${z.lohn.agk}" class="w-24 px-2.5 py-1 border border-slate-300 rounded font-mono text-xs"></td>
                                        <td class="py-2.5 px-3"><input type="number" step="0.01" id="efb-zuschlag-stoff-agk" value="${z.stoffe.agk}" class="w-24 px-2.5 py-1 border border-slate-300 rounded font-mono text-xs"></td>
                                        <td class="py-2.5 px-3"><input type="number" step="0.01" id="efb-zuschlag-geraet-agk" value="${z.geraete.agk}" class="w-24 px-2.5 py-1 border border-slate-300 rounded font-mono text-xs"></td>
                                        <td class="py-2.5 px-3"><input type="number" step="0.01" id="efb-zuschlag-sonst-agk" value="${z.sonstige.agk}" class="w-24 px-2.5 py-1 border border-slate-300 rounded font-mono text-xs"></td>
                                        <td class="py-2.5 px-3"><input type="number" step="0.01" id="efb-zuschlag-nu-agk" value="${z.nu.agk}" class="w-24 px-2.5 py-1 border border-slate-300 rounded font-mono text-xs"></td>
                                    </tr>
                                    <tr>
                                        <td class="py-2.5 px-3 font-medium text-slate-700">2.3 Wagnis und Gewinn (W&G %)</td>
                                        <td class="py-2.5 px-3"><input type="number" step="0.01" id="efb-zuschlag-lohn-wug" value="${z.lohn.wug}" class="w-24 px-2.5 py-1 border border-slate-300 rounded font-mono text-xs"></td>
                                        <td class="py-2.5 px-3"><input type="number" step="0.01" id="efb-zuschlag-stoff-wug" value="${z.stoffe.wug}" class="w-24 px-2.5 py-1 border border-slate-300 rounded font-mono text-xs"></td>
                                        <td class="py-2.5 px-3"><input type="number" step="0.01" id="efb-zuschlag-geraet-wug" value="${z.geraete.wug}" class="w-24 px-2.5 py-1 border border-slate-300 rounded font-mono text-xs"></td>
                                        <td class="py-2.5 px-3"><input type="number" step="0.01" id="efb-zuschlag-sonst-wug" value="${z.sonstige.wug}" class="w-24 px-2.5 py-1 border border-slate-300 rounded font-mono text-xs"></td>
                                        <td class="py-2.5 px-3"><input type="number" step="0.01" id="efb-zuschlag-nu-wug" value="${z.nu.wug}" class="w-24 px-2.5 py-1 border border-slate-300 rounded font-mono text-xs"></td>
                                    </tr>
                                    <tr class="bg-slate-50 font-bold">
                                        <td class="py-2.5 px-3 text-slate-900">2.4 Gesamtzuschläge (= 2.1 + 2.2 + 2.3)</td>
                                        <td class="py-2.5 px-3 font-mono text-primary">${formatPct(z.lohn.gesamt)}</td>
                                        <td class="py-2.5 px-3 font-mono text-primary">${formatPct(z.stoffe.gesamt)}</td>
                                        <td class="py-2.5 px-3 font-mono text-primary">${formatPct(z.geraete.gesamt)}</td>
                                        <td class="py-2.5 px-3 font-mono text-primary">${formatPct(z.sonstige.gesamt)}</td>
                                        <td class="py-2.5 px-3 font-mono text-primary">${formatPct(z.nu.gesamt)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- 3. Ermittlung der Angebotssumme -->
                    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                        <div class="bg-slate-900 text-white px-5 py-3 font-semibold text-sm">
                            3. Ermittlung der Angebotssumme (Verprobungsgrundlage)
                        </div>
                        <div class="p-5 space-y-3 text-sm">
                            <div class="flex justify-between py-1.5 border-b border-slate-100">
                                <span class="text-slate-600">3.1 Eigene Lohnkosten (${formatNum(a3.gesamtstunden, 2)} h × ${formatCur(a1.verrechnungslohn)})</span>
                                <span class="font-mono font-semibold text-slate-800">${formatCur(a3.summeLohn)}</span>
                            </div>
                            <div class="flex justify-between py-1.5 border-b border-slate-100">
                                <span class="text-slate-600">3.2 Stoffkosten (${formatCur(a3.ektStoffe)} EKT + ${formatPct(z.stoffe.gesamt)} Zuschlag)</span>
                                <span class="font-mono font-semibold text-slate-800">${formatCur(a3.summeStoffe)}</span>
                            </div>
                            <div class="flex justify-between py-1.5 border-b border-slate-100">
                                <span class="text-slate-600">3.3 Gerätekosten (${formatCur(a3.ektGeraete)} EKT + ${formatPct(z.geraete.gesamt)} Zuschlag)</span>
                                <span class="font-mono font-semibold text-slate-800">${formatCur(a3.summeGeraete)}</span>
                            </div>
                            <div class="flex justify-between py-1.5 border-b border-slate-100">
                                <span class="text-slate-600">3.4 Sonstige Kosten (${formatCur(a3.ektSonstige)} EKT + ${formatPct(z.sonstige.gesamt)} Zuschlag)</span>
                                <span class="font-mono font-semibold text-slate-800">${formatCur(a3.summeSonstige)}</span>
                            </div>
                            <div class="flex justify-between py-1.5 border-b border-slate-100">
                                <span class="text-slate-600">3.5 Nachunternehmerleistungen (${formatCur(a3.ektNU)} EKT + ${formatPct(z.nu.gesamt)} Zuschlag)</span>
                                <span class="font-mono font-semibold text-slate-800">${formatCur(a3.summeNU)}</span>
                            </div>
                            <div class="flex justify-between py-3 bg-slate-50 px-3 rounded-lg border border-slate-200 mt-2">
                                <span class="font-bold text-slate-900 text-base">3.6 Netto-Angebotssumme:</span>
                                <span class="font-mono font-bold text-primary text-lg">${formatCur(a3.angebotssummeNetto)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Tab Panel: EFB 223 -->
                <div id="panel-efb223" class="${this.activeSubTab === '223' ? 'block' : 'hidden'} space-y-4">
                    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                        <div class="bg-slate-900 text-white px-5 py-3 font-semibold text-sm flex justify-between items-center">
                            <span>Aufgliederung der Einheitspreise nach Formblatt 223</span>
                            <span class="text-xs ${efb223.isVerprobt ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'} px-2.5 py-0.5 rounded font-semibold">
                                ${efb223.isVerprobt ? '✓ Verprobung OK (Δ 0,00 €)' : `⚠ Differenz: ${formatCur(efb223.verprobungsDifferenz)}`}
                            </span>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr class="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold">
                                        <th class="py-2.5 px-3">OZ</th>
                                        <th class="py-2.5 px-3">Kurzbezeichnung</th>
                                        <th class="py-2.5 px-3 text-right">Menge</th>
                                        <th class="py-2.5 px-3 text-center">ME</th>
                                        <th class="py-2.5 px-3 text-right">Zeit h/ME</th>
                                        <th class="py-2.5 px-3 text-right">Lohn €</th>
                                        <th class="py-2.5 px-3 text-right">Stoffe €</th>
                                        <th class="py-2.5 px-3 text-right">Geräte €</th>
                                        <th class="py-2.5 px-3 text-right">Sonst. €</th>
                                        <th class="py-2.5 px-3 text-right font-bold">EP €/ME</th>
                                        <th class="py-2.5 px-3 text-right font-bold">Gesamtbetrag</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100 font-mono">
                                    ${(efb223.aufgliederung || []).map(r => `
                                        <tr class="hover:bg-slate-50 transition-colors">
                                            <td class="py-2 px-3 font-semibold text-slate-900">${r.oz}</td>
                                            <td class="py-2 px-3 font-sans text-slate-700 max-w-xs truncate">${r.kurztext}</td>
                                            <td class="py-2 px-3 text-right">${formatNum(r.menge, 3)}</td>
                                            <td class="py-2 px-3 text-center font-sans">${r.einheit}</td>
                                            <td class="py-2 px-3 text-right">${formatNum(r.zeitansatz, 2)}</td>
                                            <td class="py-2 px-3 text-right">${formatNum(r.teilkostenLohn, 2)}</td>
                                            <td class="py-2 px-3 text-right">${formatNum(r.teilkostenStoffe, 2)}</td>
                                            <td class="py-2 px-3 text-right">${formatNum(r.teilkostenGeraete, 2)}</td>
                                            <td class="py-2 px-3 text-right">${formatNum(r.teilkostenSonstige, 2)}</td>
                                            <td class="py-2 px-3 text-right font-bold text-slate-900">${formatNum(r.einheitspreis, 2)}</td>
                                            <td class="py-2 px-3 text-right font-bold text-primary">${formatCur(r.gesamtbetrag)}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                                <tfoot>
                                    <tr class="bg-slate-50 font-bold border-t-2 border-slate-300 text-xs">
                                        <td colspan="4" class="py-3 px-3 text-right text-slate-700">Gesamtsummen:</td>
                                        <td class="py-3 px-3 text-right font-mono text-slate-900">${formatNum(efb223.summeLohnstunden, 2)} h</td>
                                        <td colspan="5"></td>
                                        <td class="py-3 px-3 text-right font-mono text-base text-primary">${formatCur(efb223.summeGesamtbetrag)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.bindEvents(container);
    }

    /**
     * Bindet Event-Listener an die EFB-Ansicht.
     */
    bindEvents(container) {
        // Tab Umschaltung
        const btn221 = container.querySelector('#tab-btn-efb221');
        const btn223 = container.querySelector('#tab-btn-efb223');
        const panel221 = container.querySelector('#panel-efb221');
        const panel223 = container.querySelector('#panel-efb223');

        if (btn221 && btn223) {
            btn221.onclick = () => {
                this.activeSubTab = '221';
                btn221.classList.add('border-primary', 'text-primary');
                btn221.classList.remove('border-transparent', 'text-slate-500');
                btn223.classList.remove('border-primary', 'text-primary');
                btn223.classList.add('border-transparent', 'text-slate-500');
                panel221.classList.remove('hidden');
                panel223.classList.add('hidden');
            };
            btn223.onclick = () => {
                this.activeSubTab = '223';
                btn223.classList.add('border-primary', 'text-primary');
                btn223.classList.remove('border-transparent', 'text-slate-500');
                btn221.classList.remove('border-primary', 'text-primary');
                btn221.classList.add('border-transparent', 'text-slate-500');
                panel223.classList.remove('hidden');
                panel221.classList.add('hidden');
            };
        }

        // Live Re-Calculation bei Eingaben
        const liveInputs = container.querySelectorAll('input[type="number"]');
        liveInputs.forEach(input => {
            input.addEventListener('change', () => this.handleLiveRecalculate());
        });

        // Profil speichern
        const saveBtn = container.querySelector('#btn-save-efb-profile');
        if (saveBtn) {
            saveBtn.onclick = () => this.handleSaveProfile();
        }

        // PDF Exporte
        const pdf221Btn = container.querySelector('#btn-export-efb221-pdf');
        if (pdf221Btn) {
            pdf221Btn.onclick = () => this.handleExportPdf('221');
        }
        const pdf223Btn = container.querySelector('#btn-export-efb223-pdf');
        if (pdf223Btn) {
            pdf223Btn.onclick = () => this.handleExportPdf('223');
        }
    }

    /**
     * Liest die aktuellen Formularwerte aus dem DOM.
     */
    collectProfileFromDOM() {
        const getVal = (id, fallback) => {
            const el = document.getElementById(id);
            return el ? parseFloat(el.value) || fallback : fallback;
        };

        return {
            projekt_id: this.currentProjectId,
            mittellohn_eur: getVal('efb-mittellohn', 24.50),
            lohngebundene_kosten_prozent: getVal('efb-lohngebundene-pct', 85.00),
            lohnnebenkosten_prozent: getVal('efb-lohnneben-pct', 12.50),
            zuschlag_lohn_bgk: getVal('efb-zuschlag-lohn-bgk', 18.0),
            zuschlag_lohn_agk: getVal('efb-zuschlag-lohn-agk', 22.0),
            zuschlag_lohn_wug: getVal('efb-zuschlag-lohn-wug', 8.8),
            zuschlag_stoff_bgk: getVal('efb-zuschlag-stoff-bgk', 12.0),
            zuschlag_stoff_agk: getVal('efb-zuschlag-stoff-agk', 14.0),
            zuschlag_stoff_wug: getVal('efb-zuschlag-stoff-wug', 6.0),
            zuschlag_geraet_bgk: getVal('efb-zuschlag-geraet-bgk', 15.0),
            zuschlag_geraet_agk: getVal('efb-zuschlag-geraet-agk', 16.0),
            zuschlag_geraet_wug: getVal('efb-zuschlag-geraet-wug', 6.0),
            zuschlag_sonst_bgk: getVal('efb-zuschlag-sonst-bgk', 10.0),
            zuschlag_sonst_agk: getVal('efb-zuschlag-sonst-agk', 12.0),
            zuschlag_sonst_wug: getVal('efb-zuschlag-sonst-wug', 5.0),
            zuschlag_nu_bgk: getVal('efb-zuschlag-nu-bgk', 8.0),
            zuschlag_nu_agk: getVal('efb-zuschlag-nu-agk', 10.0),
            zuschlag_nu_wug: getVal('efb-zuschlag-nu-wug', 4.0)
        };
    }

    /**
     * Führt eine Live-Neuberechnung im Browser durch.
     */
    handleLiveRecalculate() {
        if (!this.currentKalkulation) return;
        const profile = this.collectProfileFromDOM();
        const project = this.currentKalkulation.project || {};
        const positions = this.currentKalkulation.positions || [];

        if (window.EFBController) {
            const efb221 = window.EFBController.calculateEFB221(project, positions, profile);
            const efb223 = window.EFBController.calculateEFB223(positions, efb221);
            this.currentKalkulation = { efb221, efb223, profile, project, positions };
            const container = document.getElementById('pd-panel-efb');
            if (container) this.renderView(container, this.currentKalkulation);
        }
    }

    /**
     * Speichert das EFB-Zuschlagsprofil in der Datenbank.
     */
    async handleSaveProfile() {
        const profile = this.collectProfileFromDOM();
        try {
            if (window.api && window.api.saveEfbProfil) {
                await window.api.saveEfbProfil(profile);
            }
            if (typeof showToast === 'function') {
                showToast('EFB-Zuschlagsprofil erfolgreich gespeichert.', 'success');
            }
        } catch (err) {
            console.error('Fehler beim Speichern des EFB-Profils:', err);
            if (typeof showToast === 'function') {
                showToast('Fehler beim Speichern: ' + err.message, 'error');
            }
        }
    }

    /**
     * Startet den PDF-Export für Formblatt 221 oder 223.
     */
    async handleExportPdf(formblatt = '221') {
        if (!this.currentKalkulation) return;
        const project = this.currentKalkulation.project || {};
        const company = (window.state && window.state.einstellungen) || {};

        let html = '';
        let defaultName = '';
        if (formblatt === '221') {
            html = window.EFBController.generateEFB221Html(project, this.currentKalkulation.efb221, company);
            defaultName = `EFB_221_${(project.name || 'Projekt').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
        } else {
            html = window.EFBController.generateEFB223Html(project, this.currentKalkulation.efb223, this.currentKalkulation.efb221, company);
            defaultName = `EFB_223_${(project.name || 'Projekt').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
        }

        try {
            if (window.api && window.api.generateEfbPdf) {
                await window.api.generateEfbPdf({
                    projectId: this.currentProjectId,
                    formblatt,
                    html,
                    defaultName
                });
            } else {
                // Fallback: Druckansicht öffnen
                const printWin = window.open('', '_blank');
                if (printWin) {
                    printWin.document.write(html);
                    printWin.document.close();
                    printWin.focus();
                    setTimeout(() => printWin.print(), 500);
                }
            }
        } catch (err) {
            console.error('PDF-Exportfehler:', err);
            if (typeof showToast === 'function') showToast('PDF Export fehlgeschlagen: ' + err.message, 'error');
        }
    }
};
