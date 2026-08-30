/**
 * views/SokaBauView.js - UI-Komponente für SOKA-BAU & ZVK Melde-Center & Nachunternehmer-Compliance
 * Monatsmeldungen, DTA-Bau & XML V3.0 Export, MiLoG/ArbZG Ampel-Prüfprotokoll und § 14 AEntG Fristenradar
 */

window.SokaBauView = class SokaBauView {
    constructor() {
        this.selectedMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
        this.selectedTarifgebiet = 'WEST';
        this.activeMeldung = null;
        this.savedMeldungen = [];
        this.subComplianceList = [];
        this.activeTab = 'meldung'; // 'meldung' | 'historie' | 'nachunternehmer'
    }

    async init() {
        await this.loadData();
    }

    async loadData() {
        try {
            if (window.api && window.api.getSokaMeldungen) {
                this.savedMeldungen = await window.api.getSokaMeldungen();
            }
            if (window.api && window.api.auditAllSubcontractors) {
                const subAudit = await window.api.auditAllSubcontractors();
                this.subComplianceList = subAudit ? subAudit.results : [];
            }
            if (!this.activeMeldung && window.api && window.api.calculateSokaMeldung) {
                this.activeMeldung = await window.api.calculateSokaMeldung({
                    meldeMonat: this.selectedMonth,
                    tarifgebiet: this.selectedTarifgebiet
                });
            }
        } catch (e) {
            console.error('[SokaBauView] Fehler beim Laden der SOKA-Daten:', e);
        }
    }

    async render() {
        await this.loadData();

        const meldung = this.activeMeldung || {
            anzahlArbeitnehmer: 0,
            bruttolohnGesamt: 0,
            beitragGesamt: 0,
            erstattungGesamt: 0,
            zahlbetrag: 0,
            arbeitnehmerMeldungen: [],
            validCount: 0,
            errorCount: 0
        };

        const lockedSubsCount = this.subComplianceList.filter(s => !s.canPay).length;

        return `
            <div class="max-w-[1600px] mx-auto flex flex-col gap-6 p-6">
                <!-- Header Card -->
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div class="flex items-center gap-4">
                        <div class="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
                            <span class="material-symbols-outlined text-[32px]">foundation</span>
                        </div>
                        <div>
                            <div class="flex items-center gap-3">
                                <h1 class="text-2xl font-bold text-slate-800 tracking-tight">SOKA-BAU &amp; Lohn-Compliance Center</h1>
                                <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">BRTV Bau 2026/2027</span>
                            </div>
                            <p class="text-sm text-slate-500 mt-0.5">
                                Elektronische Monatsmeldungen (DTA-Bau &amp; SOKA-XML V3.0), Urlaubs-/ZVK-Berechnung &amp; Generalunternehmer-Enthaftung nach § 14 AEntG.
                            </p>
                        </div>
                    </div>
                    <div class="flex items-center gap-3">
                        <button onclick="window.sokaBauViewInstance.saveActiveMeldung()"
                            class="px-4 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-bold shadow-sm shadow-primary/30 flex items-center gap-2 transition-all">
                            <span class="material-symbols-outlined text-[18px]">save</span>
                            Meldung speichern
                        </button>
                        <button onclick="window.sokaBauViewInstance.exportFiles()"
                            class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-emerald-600/30 flex items-center gap-2 transition-all">
                            <span class="material-symbols-outlined text-[18px]">file_download</span>
                            Meldedateien exportieren
                        </button>
                    </div>
                </div>

                <!-- Melde-Filter & Steuerung -->
                <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
                    <div class="flex flex-wrap items-center gap-4 text-xs font-bold">
                        <div>
                            <label class="block text-[11px] text-slate-400 uppercase tracking-wider mb-1">Melde-Monat</label>
                            <input type="month" id="soka-month-input" value="${this.selectedMonth}" onchange="window.sokaBauViewInstance.onMonthChange(this.value)"
                                class="px-3 py-2 border border-slate-300 rounded-xl font-bold text-slate-700 bg-slate-50">
                        </div>
                        <div>
                            <label class="block text-[11px] text-slate-400 uppercase tracking-wider mb-1">Tarifgebiet</label>
                            <select id="soka-gebiet-input" onchange="window.sokaBauViewInstance.onGebietChange(this.value)"
                                class="px-3 py-2 border border-slate-300 rounded-xl font-bold text-slate-700 bg-slate-50">
                                <option value="WEST" ${this.selectedTarifgebiet === 'WEST' ? 'selected' : ''}>Tarifgebiet WEST (ULAK 14,70% / ZVK 3,20%)</option>
                                <option value="OST" ${this.selectedTarifgebiet === 'OST' ? 'selected' : ''}>Tarifgebiet OST (ULAK 12,10% / ZVK 0,80%)</option>
                                <option value="BERLIN_WEST" ${this.selectedTarifgebiet === 'BERLIN_WEST' ? 'selected' : ''}>Berlin (West) (ULAK 15,05% / ZVK 3,20%)</option>
                                <option value="BERLIN_OST" ${this.selectedTarifgebiet === 'BERLIN_OST' ? 'selected' : ''}>Berlin (Ost) (ULAK 12,10% / ZVK 0,80%)</option>
                            </select>
                        </div>
                    </div>
                    <button onclick="window.sokaBauViewInstance.recalculateMeldung()"
                        class="px-4 py-2 bg-indigo-50 text-primary hover:bg-indigo-100 rounded-xl text-xs font-bold flex items-center gap-2 transition-all">
                        <span class="material-symbols-outlined text-[16px]">sync</span>
                        Aus Zeiterfassung &amp; Lohnstamm berechnen
                    </button>
                </div>

                <!-- KPI Tiles -->
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">Gemeldete AN</p>
                            <h3 class="text-2xl font-bold text-slate-800 mt-1">${meldung.anzahlArbeitnehmer}</h3>
                            <p class="text-[11px] ${meldung.errorCount > 0 ? 'text-red-500 font-bold' : 'text-emerald-600'} mt-0.5">
                                ${meldung.errorCount > 0 ? `⚠️ ${meldung.errorCount} Fehler zu prüfen` : '✓ Alle Angaben valide'}
                            </p>
                        </div>
                        <span class="material-symbols-outlined text-[36px] text-slate-300">groups</span>
                    </div>
                    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">Meldelohnsumme</p>
                            <h3 class="text-2xl font-bold text-slate-800 mt-1">${meldung.bruttolohnGesamt.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</h3>
                            <p class="text-[11px] text-slate-400 mt-0.5">Beitragspflichtiges Brutto</p>
                        </div>
                        <span class="material-symbols-outlined text-[36px] text-indigo-300">payments</span>
                    </div>
                    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">SOKA-Gesamtbeitrag</p>
                            <h3 class="text-2xl font-bold text-amber-600 mt-1">${meldung.beitragGesamt.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</h3>
                            <p class="text-[11px] text-slate-400 mt-0.5">ULAK + ZVK + BBV + Winterbau</p>
                        </div>
                        <span class="material-symbols-outlined text-[36px] text-amber-300">account_balance_wallet</span>
                    </div>
                    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">Zahlbetrag Kasse</p>
                            <h3 class="text-2xl font-bold text-emerald-600 mt-1">${meldung.zahlbetrag.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</h3>
                            <p class="text-[11px] text-slate-400 mt-0.5">Abzgl. ${meldung.erstattungGesamt.toFixed(2)} € Erstattung</p>
                        </div>
                        <span class="material-symbols-outlined text-[36px] text-emerald-300">savings</span>
                    </div>
                </div>

                <!-- Tabs Container -->
                <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div class="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-4">
                        <div class="flex items-center gap-2">
                            <button onclick="window.sokaBauViewInstance.switchTab('meldung')"
                                class="px-4 py-2 rounded-xl text-xs font-bold transition-all ${this.activeTab === 'meldung' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200/60'}">
                                Aktuelle Monatsmeldung (${this.selectedMonth})
                            </button>
                            <button onclick="window.sokaBauViewInstance.switchTab('nachunternehmer')"
                                class="px-4 py-2 rounded-xl text-xs font-bold transition-all ${this.activeTab === 'nachunternehmer' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200/60'}">
                                § 14 AEntG Nachunternehmer-Haftungsschutz ${lockedSubsCount > 0 ? `<span class="ml-1 px-1.5 py-0.2 rounded-full bg-red-500 text-white text-[10px]">${lockedSubsCount} Sperren</span>` : ''}
                            </button>
                            <button onclick="window.sokaBauViewInstance.switchTab('historie')"
                                class="px-4 py-2 rounded-xl text-xs font-bold transition-all ${this.activeTab === 'historie' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200/60'}">
                                Gespeicherte Meldeläufe (${this.savedMeldungen.length})
                            </button>
                        </div>
                    </div>

                    <!-- Tab Content -->
                    <div class="p-6">
                        ${this.activeTab === 'meldung' ? this._renderMeldungTab(meldung) : (this.activeTab === 'nachunternehmer' ? this._renderNachunternehmerTab() : this._renderHistorieTab())}
                    </div>
                </div>
            </div>

            <!-- Modals Container -->
            <div id="soka-modals-container"></div>
        `;
    }

    _renderMeldungTab(meldung) {
        if (!meldung.arbeitnehmerMeldungen || meldung.arbeitnehmerMeldungen.length === 0) {
            return `
                <div class="text-center py-16 text-slate-400">
                    <span class="material-symbols-outlined text-6xl text-slate-300 mb-3">badge</span>
                    <h3 class="text-base font-bold text-slate-700">Keine Arbeitnehmer für ${this.selectedMonth} gefunden</h3>
                    <p class="text-xs text-slate-400 max-w-md mx-auto mt-1">
                        Legen Sie Mitarbeiter in der Mitarbeiterverwaltung an oder erfassen Sie Arbeitszeiten in der mobilen Zeiterfassung.
                    </p>
                </div>
            `;
        }

        return `
            <div class="space-y-6">
                <!-- Arbeitnehmer-Tabelle -->
                <div class="overflow-x-auto rounded-xl border border-slate-200">
                    <table class="w-full text-left text-xs whitespace-nowrap">
                        <thead class="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                            <tr>
                                <th class="px-3 py-3">Status</th>
                                <th class="px-3 py-3">AN-Nr. / VSNR</th>
                                <th class="px-3 py-3">Name, Vorname</th>
                                <th class="px-3 py-3 text-center">Tage</th>
                                <th class="px-3 py-3 text-right">Std.</th>
                                <th class="px-3 py-3 text-right">Bruttolohn</th>
                                <th class="px-3 py-3 text-right">ULAK</th>
                                <th class="px-3 py-3 text-right">ZVK</th>
                                <th class="px-3 py-3 text-right">BBV</th>
                                <th class="px-3 py-3 text-right">Winter</th>
                                <th class="px-3 py-3 text-right">Gesamt</th>
                                <th class="px-3 py-3 text-center">Urlaub (Tage)</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 bg-white">
                            ${meldung.arbeitnehmerMeldungen.map(an => {
                                const isInvalid = an.complianceStatus === 'INVALID';
                                const hasWarn = an.complianceStatus === 'WARNING';
                                const statusBadge = isInvalid
                                    ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">Fehler</span>'
                                    : (hasWarn
                                        ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">Hinweis</span>'
                                        : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">OK</span>');

                                return `
                                    <tr class="${isInvalid ? 'bg-red-50/40' : (hasWarn ? 'bg-amber-50/20' : 'hover:bg-slate-50')} transition-colors">
                                        <td class="px-3 py-2.5">${statusBadge}</td>
                                        <td class="px-3 py-2.5 font-mono text-[11px] text-slate-600">
                                            <div class="font-bold text-slate-800">${an.anNummer}</div>
                                            <div class="text-[10px] text-slate-400">${an.vsnr || '<span class="text-red-500 font-bold">VSNR fehlt!</span>'}</div>
                                        </td>
                                        <td class="px-3 py-2.5 font-bold text-slate-800">${an.name}, ${an.vorname}</td>
                                        <td class="px-3 py-2.5 text-center font-semibold text-slate-700">${an.beschaeftigungstage}</td>
                                        <td class="px-3 py-2.5 text-right font-mono">${an.geleisteteStunden.toFixed(1)} h</td>
                                        <td class="px-3 py-2.5 text-right font-mono font-bold text-slate-800">${an.bruttoLohn.toFixed(2)} €</td>
                                        <td class="px-3 py-2.5 text-right font-mono text-slate-600">${an.beitraege.ulakBeitrag.toFixed(2)} €</td>
                                        <td class="px-3 py-2.5 text-right font-mono text-slate-600">${an.beitraege.zvkBeitrag.toFixed(2)} €</td>
                                        <td class="px-3 py-2.5 text-right font-mono text-slate-600">${an.beitraege.bbvBeitrag.toFixed(2)} €</td>
                                        <td class="px-3 py-2.5 text-right font-mono text-slate-600">${an.beitraege.winterbauAg.toFixed(2)} €</td>
                                        <td class="px-3 py-2.5 text-right font-mono font-bold text-indigo-900 bg-indigo-50/30">${an.beitraege.gesamtBeitrag.toFixed(2)} €</td>
                                        <td class="px-3 py-2.5 text-center font-semibold text-emerald-700">+${an.urlaub.erworbeneUrlaubstage.toFixed(2)}</td>
                                    </tr>
                                    ${(an.complianceWarnings || []).length > 0 ? `
                                        <tr class="bg-amber-50/60 text-xs">
                                            <td colspan="12" class="px-4 py-1.5 text-amber-900">
                                                ${an.complianceWarnings.map(w => `
                                                    <div class="flex items-center gap-1.5 text-[11px] ${w.level === 'ERROR' ? 'text-red-700 font-bold' : 'text-amber-800'}">
                                                        <span>⚠️</span> ${w.message}
                                                    </div>
                                                `).join('')}
                                            </td>
                                        </tr>
                                    ` : ''}
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    _renderNachunternehmerTab() {
        return `
            <div class="space-y-4">
                <div class="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div>
                        <h3 class="font-bold text-slate-800 text-sm">Generalunternehmer-Haftung nach § 14 AEntG &amp; § 48b EStG</h3>
                        <p class="text-xs text-slate-500">Überwachung der SOKA-BAU Unbedenklichkeitsbescheinigungen (UB) zur Vermeidung von Durchgriffshaftung.</p>
                    </div>
                    <button onclick="window.sokaBauViewInstance.openNachweisModal()"
                        class="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-[16px]">add_moderator</span>
                        Nachweis hinterlegen
                    </button>
                </div>

                <div class="overflow-x-auto rounded-xl border border-slate-200">
                    <table class="w-full text-left text-xs whitespace-nowrap">
                        <thead class="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                            <tr>
                                <th class="px-4 py-3">Auszahlungsstatus</th>
                                <th class="px-4 py-3">Nachunternehmer</th>
                                <th class="px-4 py-3">Compliance-Status</th>
                                <th class="px-4 py-3">Warnungen &amp; Handlungsbedarf</th>
                                <th class="px-4 py-3 text-right">Aktionen</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 bg-white">
                            ${this.subComplianceList.map(sub => {
                                const isLocked = !sub.canPay;
                                const lockBadge = isLocked
                                    ? '<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-200 flex items-center gap-1 w-fit"><span class="material-symbols-outlined text-[12px]">lock</span> Auszahlung gesperrt</span>'
                                    : '<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1 w-fit"><span class="material-symbols-outlined text-[12px]">check_circle</span> Freigegeben</span>';

                                return `
                                    <tr class="hover:bg-slate-50 transition-colors">
                                        <td class="px-4 py-3">${lockBadge}</td>
                                        <td class="px-4 py-3 font-bold text-slate-800">${sub.name}</td>
                                        <td class="px-4 py-3">
                                            ${sub.isCompliant ? '<span class="text-emerald-700 font-bold">✓ Alle Nachweise gültig</span>' : '<span class="text-red-600 font-bold">⚠️ Nachweis fehlt / abgelaufen</span>'}
                                        </td>
                                        <td class="px-4 py-3 text-slate-600 max-w-lg truncate">
                                            ${sub.warnings.map(w => `<div class="${w.level === 'LOCK_PAYMENT' ? 'text-red-700 font-bold' : 'text-amber-800'} text-[11px]">${w.message}</div>`).join('') || '<span class="text-slate-400">Keine Beanstandungen</span>'}
                                        </td>
                                        <td class="px-4 py-3 text-right">
                                            <button onclick="window.sokaBauViewInstance.openNachweisModal(${sub.subcontractorId})"
                                                class="px-2.5 py-1 text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 font-bold rounded-lg transition-colors">
                                                Nachweis pflegen
                                            </button>
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

    _renderHistorieTab() {
        return `
            <div class="overflow-x-auto rounded-xl border border-slate-200">
                <table class="w-full text-left text-xs whitespace-nowrap">
                    <thead class="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                        <tr>
                            <th class="px-4 py-3">Monat</th>
                            <th class="px-4 py-3">Tarifgebiet</th>
                            <th class="px-4 py-3">Betriebsnr.</th>
                            <th class="px-4 py-3 text-center">Arbeitnehmer</th>
                            <th class="px-4 py-3 text-right">Meldelohn</th>
                            <th class="px-4 py-3 text-right">Beitragssumme</th>
                            <th class="px-4 py-3 text-right">Zahlbetrag</th>
                            <th class="px-4 py-3">Status</th>
                            <th class="px-4 py-3 text-right">Aktionen</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 bg-white">
                        ${this.savedMeldungen.map(m => `
                            <tr class="hover:bg-slate-50 transition-colors">
                                <td class="px-4 py-3 font-bold text-slate-800">${m.melde_monat}</td>
                                <td class="px-4 py-3 font-semibold text-slate-600">${m.tarifgebiet}</td>
                                <td class="px-4 py-3 font-mono text-slate-500">${m.betriebsnummer}</td>
                                <td class="px-4 py-3 text-center font-bold">${m.anzahl_arbeitnehmer}</td>
                                <td class="px-4 py-3 text-right font-mono">${(parseFloat(m.bruttolohn_gesamt) || 0).toFixed(2)} €</td>
                                <td class="px-4 py-3 text-right font-mono font-bold text-amber-700">${(parseFloat(m.beitrag_gesamt) || 0).toFixed(2)} €</td>
                                <td class="px-4 py-3 text-right font-mono font-bold text-emerald-700">${(parseFloat(m.zahlbetrag) || 0).toFixed(2)} €</td>
                                <td class="px-4 py-3">
                                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${m.status === 'EXPORTIERT' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}">
                                        ${m.status}
                                    </span>
                                </td>
                                <td class="px-4 py-3 text-right">
                                    <button onclick="window.sokaBauViewInstance.exportFiles(${m.id})"
                                        class="px-2.5 py-1 text-xs bg-primary text-white hover:bg-primary-dark font-bold rounded-lg transition-colors">
                                        Exportieren
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    async switchTab(tab) {
        this.activeTab = tab;
        await this.refresh();
    }

    async onMonthChange(newMonth) {
        this.selectedMonth = newMonth;
        await this.recalculateMeldung();
    }

    async onGebietChange(newGebiet) {
        this.selectedTarifgebiet = newGebiet;
        await this.recalculateMeldung();
    }

    async recalculateMeldung() {
        try {
            if (window.api && window.api.calculateSokaMeldung) {
                this.activeMeldung = await window.api.calculateSokaMeldung({
                    meldeMonat: this.selectedMonth,
                    tarifgebiet: this.selectedTarifgebiet
                });
                await this.refresh();
            }
        } catch (err) {
            alert('Fehler bei der Beitragsberechnung: ' + err.message);
        }
    }

    async saveActiveMeldung() {
        if (!this.activeMeldung) return;
        try {
            if (window.api && window.api.saveSokaMeldung) {
                await window.api.saveSokaMeldung(this.activeMeldung);
                if (typeof showNotification === 'function') {
                    showNotification('SOKA-Meldung gespeichert', `Monatsmeldung für ${this.selectedMonth} erfolgreich archiviert.`);
                }
                await this.refresh();
            }
        } catch (err) {
            alert('Fehler beim Speichern der Meldung: ' + err.message);
        }
    }

    async exportFiles(meldungId = null) {
        try {
            let targetId = meldungId;
            if (!targetId) {
                // Speichere zuerst aktiven Entwurf
                const saveRes = await window.api.saveSokaMeldung(this.activeMeldung);
                targetId = saveRes.meldungId;
            }

            if (window.api && window.api.exportSokaFiles) {
                const res = await window.api.exportSokaFiles({ meldungId: targetId });
                if (res && res.success) {
                    // Triggere Browser-Downloads für DTA-Bau und SOKA-XML
                    this._downloadFile(`DTA_BAU_${this.selectedMonth.replace(/-/g, '')}.dta`, res.dtaContent, 'text/plain');
                    this._downloadFile(`SOKA_MELDUNG_${this.selectedMonth}.xml`, res.xmlContent, 'application/xml');

                    if (typeof showNotification === 'function') {
                        showNotification('Export erfolgreich', 'DTA-Bau und SOKA-XML Dateien wurden für den Meldeportal-Upload generiert.');
                    }
                    await this.refresh();
                }
            }
        } catch (err) {
            alert('Fehler beim Exportieren: ' + err.message);
        }
    }

    _downloadFile(filename, text, mimeType) {
        const element = document.createElement('a');
        element.setAttribute('href', `data:${mimeType};charset=utf-8,` + encodeURIComponent(text));
        element.setAttribute('download', filename);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    }

    openNachweisModal(subId = null) {
        const modalContainer = document.getElementById('soka-modals-container') || document.body;
        const div = document.createElement('div');
        div.id = 'nachweis-modal';
        div.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4';
        div.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-200">
                <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 class="font-bold text-slate-800 text-base">SOKA-BAU / Compliance-Nachweis hinterlegen</h3>
                    <button onclick="document.getElementById('nachweis-modal').remove()" class="text-slate-400 hover:text-slate-600 p-1">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <form onsubmit="window.sokaBauViewInstance.saveNachweis(event)" class="p-6 space-y-4 text-xs">
                    <div>
                        <label class="block font-bold text-slate-700 uppercase tracking-wider mb-1">Nachunternehmer wählen *</label>
                        <select id="nw-kunde" required class="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold">
                            ${this.subComplianceList.map(s => `<option value="${s.subcontractorId}" ${subId === s.subcontractorId ? 'selected' : ''}>${s.name}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block font-bold text-slate-700 uppercase tracking-wider mb-1">Nachweistyp *</label>
                        <select id="nw-typ" required class="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold">
                            <option value="SOKA_BAU_UB">SOKA-BAU Unbedenklichkeitsbescheinigung (UB)</option>
                            <option value="SEC48B_FINANZAMT">§ 48b EStG Freistellungsbescheinigung</option>
                            <option value="BG_BAU_UB">BG-BAU Unbedenklichkeitsbescheinigung</option>
                            <option value="BUERGSCHAFT">Qualifizierte Bürgschaft (§ 14 AEntG)</option>
                        </select>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block font-bold text-slate-700 uppercase tracking-wider mb-1">Gültig von *</label>
                            <input type="date" id="nw-von" required value="${new Date().toISOString().slice(0, 10)}"
                                class="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm">
                        </div>
                        <div>
                            <label class="block font-bold text-slate-700 uppercase tracking-wider mb-1">Gültig bis *</label>
                            <input type="date" id="nw-bis" required value="${new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString().slice(0, 10)}"
                                class="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold text-primary">
                        </div>
                    </div>
                    <div>
                        <label class="block font-bold text-slate-700 uppercase tracking-wider mb-1">Aussteller *</label>
                        <input type="text" id="nw-aussteller" required value="SOKA-BAU Wiesbaden" placeholder="z. B. SOKA-BAU Wiesbaden"
                            class="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm">
                    </div>
                    <div>
                        <label class="block font-bold text-slate-700 uppercase tracking-wider mb-1">Zertifikats- / Registriernummer</label>
                        <input type="text" id="nw-nr" placeholder="z. B. UB-2026-88914"
                            class="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono">
                    </div>
                    <div class="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 mt-4">
                        <button type="button" onclick="document.getElementById('nachweis-modal').remove()" class="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs font-bold">Abbrechen</button>
                        <button type="submit" class="px-5 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-bold shadow-sm">Nachweis speichern</button>
                    </div>
                </form>
            </div>
        `;
        modalContainer.appendChild(div);
    }

    async saveNachweis(event) {
        event.preventDefault();
        const data = {
            kunde_id: parseInt(document.getElementById('nw-kunde').value, 10),
            nachweis_typ: document.getElementById('nw-typ').value,
            gueltig_von: document.getElementById('nw-von').value,
            gueltig_bis: document.getElementById('nw-bis').value,
            aussteller: document.getElementById('nw-aussteller').value,
            zertifikatsnummer: document.getElementById('nw-nr').value,
            status: 'ACTIVE'
        };

        try {
            if (window.api && window.api.saveSubcontractorNachweis) {
                await window.api.saveSubcontractorNachweis(data);
                document.getElementById('nachweis-modal')?.remove();
                if (typeof showNotification === 'function') {
                    showNotification('Nachweis hinterlegt', 'Die Unbedenklichkeitsbescheinigung wurde erfolgreich registriert.');
                }
                await this.refresh();
            }
        } catch (err) {
            alert('Fehler beim Speichern: ' + err.message);
        }
    }

    async refresh() {
        const container = document.getElementById('view-sokabau');
        if (container) {
            container.innerHTML = await this.render();
        }
    }
};
