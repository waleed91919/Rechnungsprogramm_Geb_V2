/**
 * views/GrosshandelView.js - UI-Komponente für Großhandels-Center (IDS Connect 2.5 & Open Masterdata)
 * Webshop-Absprung, Kontenverwaltung & Eingangskorb für Warenkörbe
 */

window.GrosshandelView = class GrosshandelView {
    constructor() {
        this.konten = [];
        this.warenkoerbe = [];
        this.selectedCart = null;
        this.activeTab = 'warenkoerbe'; // 'warenkoerbe' | 'konten'
    }

    async init() {
        await this.loadData();
    }

    async loadData() {
        try {
            if (window.api && window.api.getIdsKonten) {
                this.konten = await window.api.getIdsKonten();
            }
            if (window.api && window.api.getIdsWarenkoerbe) {
                this.warenkoerbe = await window.api.getIdsWarenkoerbe();
            }
        } catch (e) {
            console.error('[GrosshandelView] Fehler beim Laden der Daten:', e);
        }
    }

    async render() {
        await this.loadData();

        const receivedCount = this.warenkoerbe.filter(w => w.status === 'RECEIVED').length;
        const totalValue = this.warenkoerbe.reduce((s, w) => s + (parseFloat(w.netto_gesamt) || 0), 0);

        return `
            <div class="max-w-[1600px] mx-auto flex flex-col gap-6 p-6">
                <!-- Header / KPI Row -->
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div class="flex items-center gap-4">
                        <div class="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-primary">
                            <span class="material-symbols-outlined text-[32px]">storefront</span>
                        </div>
                        <div>
                            <div class="flex items-center gap-3">
                                <h1 class="text-2xl font-bold text-slate-800 tracking-tight">Großhandels-Center &amp; IDS Connect 2.5</h1>
                                <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-primary border border-indigo-200">Release 2.0</span>
                            </div>
                            <p class="text-sm text-slate-500 mt-0.5">
                                Nahtloser Deep-Link Absprung in GC Online Plus, Richter+Frenzel, Sonepar, Rexel &amp; Würth mit automatischem Warenkorb-Reimport.
                            </p>
                        </div>
                    </div>
                    <div class="flex items-center gap-3">
                        <button onclick="window.grosshandelViewInstance.openQuickLaunchModal()"
                            class="px-4 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-bold shadow-sm shadow-primary/30 flex items-center gap-2 transition-all">
                            <span class="material-symbols-outlined text-[18px]">launch</span>
                            Webshop aufrufen
                        </button>
                        <button onclick="window.grosshandelViewInstance.openKontoModal()"
                            class="px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 transition-all">
                            <span class="material-symbols-outlined text-[18px]">add_circle</span>
                            Konto anlegen
                        </button>
                    </div>
                </div>

                <!-- KPI Tiles -->
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">Verbundene Händler</p>
                            <h3 class="text-2xl font-bold text-slate-800 mt-1">${this.konten.length}</h3>
                        </div>
                        <span class="material-symbols-outlined text-[36px] text-slate-300">hub</span>
                    </div>
                    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">Neue Warenkörbe</p>
                            <h3 class="text-2xl font-bold text-amber-600 mt-1">${receivedCount}</h3>
                        </div>
                        <span class="material-symbols-outlined text-[36px] text-amber-300">shopping_cart</span>
                    </div>
                    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">Gesamt-Warenwert</p>
                            <h3 class="text-2xl font-bold text-emerald-600 mt-1">${totalValue.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</h3>
                        </div>
                        <span class="material-symbols-outlined text-[36px] text-emerald-300">payments</span>
                    </div>
                    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">IDS Standard</p>
                            <h3 class="text-lg font-bold text-primary mt-1">v2.5 &amp; Open Masterdata</h3>
                        </div>
                        <span class="material-symbols-outlined text-[36px] text-primary/30">verified</span>
                    </div>
                </div>

                <!-- Tabs & Controls -->
                <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div class="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-4">
                        <div class="flex items-center gap-2">
                            <button onclick="window.grosshandelViewInstance.switchTab('warenkoerbe')"
                                class="px-4 py-2 rounded-xl text-xs font-bold transition-all ${this.activeTab === 'warenkoerbe' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200/60'}">
                                Eingangskorb (${this.warenkoerbe.length})
                            </button>
                            <button onclick="window.grosshandelViewInstance.switchTab('konten')"
                                class="px-4 py-2 rounded-xl text-xs font-bold transition-all ${this.activeTab === 'konten' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200/60'}">
                                Großhandelskonten (${this.konten.length})
                            </button>
                        </div>
                        <button onclick="window.grosshandelViewInstance.refresh()" class="text-xs text-primary font-bold hover:underline flex items-center gap-1">
                            <span class="material-symbols-outlined text-[16px]">refresh</span> Aktualisieren
                        </button>
                    </div>

                    <!-- Tab Body -->
                    <div class="p-6">
                        ${this.activeTab === 'warenkoerbe' ? this._renderWarenkoerbeTab() : this._renderKontenTab()}
                    </div>
                </div>
            </div>

            <!-- Modals Container -->
            <div id="grosshandel-modals-container"></div>
        `;
    }

    _renderWarenkoerbeTab() {
        if (this.warenkoerbe.length === 0) {
            return `
                <div class="text-center py-16 text-slate-400">
                    <span class="material-symbols-outlined text-6xl text-slate-300 mb-3">shopping_cart_checkout</span>
                    <h3 class="text-base font-bold text-slate-700">Noch keine Warenkörbe empfangen</h3>
                    <p class="text-xs text-slate-400 max-w-md mx-auto mt-1">
                        Klicken Sie oben auf "Webshop aufrufen", wählen Sie Artikel im Großhandelsshop aus und übertragen Sie den Warenkorb per Klick an W-Link ERP.
                    </p>
                </div>
            `;
        }

        return `
            <div class="overflow-x-auto rounded-xl border border-slate-200">
                <table class="w-full text-left text-xs whitespace-nowrap">
                    <thead class="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                        <tr>
                            <th class="px-4 py-3">Status</th>
                            <th class="px-4 py-3">Lieferant / Großhandel</th>
                            <th class="px-4 py-3">Cart-ID</th>
                            <th class="px-4 py-3">Empfangen am</th>
                            <th class="px-4 py-3 text-center">Positionen</th>
                            <th class="px-4 py-3 text-right">Netto-Gesamt</th>
                            <th class="px-4 py-3 text-right">Aktionen</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 bg-white">
                        ${this.warenkoerbe.map(w => {
                            const isNew = w.status === 'RECEIVED';
                            const badge = isNew
                                ? '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">Empfangen</span>'
                                : (w.status === 'IMPORTED'
                                    ? '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">Übernommen</span>'
                                    : '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">Verworfen</span>');

                            return `
                                <tr class="hover:bg-slate-50 transition-colors">
                                    <td class="px-4 py-3">${badge}</td>
                                    <td class="px-4 py-3 font-bold text-slate-800">${w.konto_name || w.lieferant}</td>
                                    <td class="px-4 py-3 font-mono text-slate-500">${w.cart_id}</td>
                                    <td class="px-4 py-3 text-slate-600">${new Date(w.created_at).toLocaleString('de-DE')}</td>
                                    <td class="px-4 py-3 text-center font-semibold text-slate-700">${w.items_count} Stk.</td>
                                    <td class="px-4 py-3 text-right font-bold text-slate-800">${(parseFloat(w.netto_gesamt) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
                                    <td class="px-4 py-3 text-right">
                                        <div class="flex items-center justify-end gap-1.5">
                                            <button onclick="window.grosshandelViewInstance.viewCartDetails(${w.id})"
                                                class="px-2.5 py-1 text-xs bg-indigo-50 text-primary hover:bg-indigo-100 font-semibold rounded-lg transition-colors flex items-center gap-1">
                                                <span class="material-symbols-outlined text-[14px]">visibility</span> Details
                                            </button>
                                            <button onclick="window.grosshandelViewInstance.openImportModal(${w.id})"
                                                class="px-2.5 py-1 text-xs bg-primary text-white hover:bg-primary-dark font-semibold rounded-lg transition-colors flex items-center gap-1">
                                                <span class="material-symbols-outlined text-[14px]">move_to_inbox</span> Übernehmen
                                            </button>
                                            <button onclick="window.grosshandelViewInstance.deleteCart(${w.id})"
                                                class="p-1 text-slate-400 hover:text-red-600 rounded-lg transition-colors">
                                                <span class="material-symbols-outlined text-[16px]">delete</span>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    _renderKontenTab() {
        return `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                ${this.konten.map(k => `
                    <div class="bg-white border ${k.is_default ? 'border-primary ring-1 ring-primary/20' : 'border-slate-200'} rounded-2xl p-5 shadow-sm flex flex-col justify-between relative group hover:border-primary/50 transition-all">
                        <div>
                            <div class="flex items-start justify-between gap-2 mb-2">
                                <div class="flex items-center gap-2">
                                    <span class="material-symbols-outlined text-primary text-[24px]">store</span>
                                    <h4 class="font-bold text-slate-800 text-sm">${k.name}</h4>
                                </div>
                                ${k.is_default ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary">Standard</span>' : ''}
                            </div>
                            <div class="text-xs text-slate-500 space-y-1.5 my-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <div class="flex justify-between">
                                    <span>Kundennummer:</span>
                                    <span class="font-mono font-bold text-slate-700">${k.kundennummer}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span>Kalk.-Aufschlag:</span>
                                    <span class="font-bold text-slate-700">+${k.standard_aufschlag_prozent} %</span>
                                </div>
                                <div class="flex justify-between">
                                    <span>Code:</span>
                                    <span class="font-mono text-slate-600">${k.grosshaendler_code}</span>
                                </div>
                            </div>
                        </div>
                        <div class="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                            <button onclick="window.grosshandelViewInstance.launchShopDirect(${k.id})"
                                class="flex-1 px-3 py-1.5 bg-primary hover:bg-primary-dark text-white rounded-lg text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 transition-all">
                                <span class="material-symbols-outlined text-[14px]">launch</span> Shop öffnen
                            </button>
                            <button onclick="window.grosshandelViewInstance.openKontoModal(${k.id})"
                                class="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors">
                                <span class="material-symbols-outlined text-[16px]">edit</span>
                            </button>
                            <button onclick="window.grosshandelViewInstance.deleteKonto(${k.id})"
                                class="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                                <span class="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    async switchTab(tab) {
        this.activeTab = tab;
        await this.refresh();
    }

    async refresh() {
        const container = document.getElementById('view-grosshandel');
        if (container) {
            container.innerHTML = await this.render();
        }
    }

    async launchShopDirect(kontoId) {
        try {
            if (window.api && window.api.launchIdsShop) {
                const res = await window.api.launchIdsShop({ kontoId, action: 'call' });
                if (typeof showNotification === 'function') {
                    showNotification('Großhandel geöffnet', res.message || 'Der Shop wurde im Browser gestartet.');
                }
            }
        } catch (err) {
            alert('Fehler beim Starten des Großhandels-Shops: ' + err.message);
        }
    }

    openQuickLaunchModal() {
        const modalContainer = document.getElementById('grosshandel-modals-container') || document.body;
        const div = document.createElement('div');
        div.id = 'quick-launch-modal';
        div.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4';
        div.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-200">
                <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-primary text-2xl">storefront</span>
                        <div>
                            <h3 class="font-bold text-slate-800 text-base">Großhandels-Webshop auswählen</h3>
                            <p class="text-xs text-slate-500">IDS Connect 2.5 Deep-Link Absprung mit Callback</p>
                        </div>
                    </div>
                    <button onclick="document.getElementById('quick-launch-modal').remove()" class="text-slate-400 hover:text-slate-600 p-1">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div class="p-6 space-y-3">
                    ${this.konten.map(k => `
                        <div onclick="window.grosshandelViewInstance.launchShopDirect(${k.id}); document.getElementById('quick-launch-modal').remove();"
                            class="p-4 rounded-xl border border-slate-200 hover:border-primary hover:bg-indigo-50/40 cursor-pointer flex items-center justify-between transition-all group">
                            <div>
                                <h4 class="font-bold text-slate-800 text-sm group-hover:text-primary">${k.name}</h4>
                                <p class="text-xs text-slate-400 mt-0.5">Kundennummer: <span class="font-mono text-slate-600">${k.kundennummer}</span></p>
                            </div>
                            <span class="material-symbols-outlined text-slate-400 group-hover:text-primary text-[20px]">arrow_forward</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        modalContainer.appendChild(div);
    }

    async viewCartDetails(cartId) {
        try {
            if (!window.api || !window.api.getIdsWarenkorbDetails) return;
            const details = await window.api.getIdsWarenkorbDetails(cartId);
            if (!details || !details.parsedCart) {
                alert('Warenkorb-Daten konnten nicht geladen werden.');
                return;
            }

            const cart = details.parsedCart;
            const modalContainer = document.getElementById('grosshandel-modals-container') || document.body;
            const div = document.createElement('div');
            div.id = 'cart-details-modal';
            div.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4';
            div.innerHTML = `
                <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                    <div class="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                        <div class="flex items-center gap-2">
                            <span class="material-symbols-outlined text-primary text-2xl">shopping_cart</span>
                            <div>
                                <h3 class="font-bold text-slate-800 text-base">Warenkorb-Details: ${details.lieferant}</h3>
                                <p class="text-xs text-slate-500">Cart-ID: ${details.cart_id} · ${cart.items.length} Positionen · ${cart.totalNetAmount.toFixed(2)} € Netto</p>
                            </div>
                        </div>
                        <button onclick="document.getElementById('cart-details-modal').remove()" class="text-slate-400 hover:text-slate-600 p-1">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>
                    <div class="p-6 overflow-y-auto flex-1 space-y-4">
                        <div class="overflow-x-auto rounded-xl border border-slate-200">
                            <table class="w-full text-left text-xs whitespace-nowrap">
                                <thead class="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                                    <tr>
                                        <th class="px-3 py-2.5">Art.-Nr. / EAN</th>
                                        <th class="px-3 py-2.5">Beschreibung</th>
                                        <th class="px-3 py-2.5 text-right">Menge</th>
                                        <th class="px-3 py-2.5 text-right">HEK (Netto)</th>
                                        <th class="px-3 py-2.5 text-right">Gesamt-Netto</th>
                                        <th class="px-3 py-2.5">Dokumente</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100 bg-white">
                                    ${cart.items.map(it => `
                                        <tr>
                                            <td class="px-3 py-2 font-mono text-[11px] text-slate-600">${it.supplierItemNumber || it.ean || '-'}</td>
                                            <td class="px-3 py-2">
                                                <div class="font-bold text-slate-800 max-w-md truncate">${it.shortDescription}</div>
                                                ${it.longDescription ? `<div class="text-[10px] text-slate-400 max-w-md truncate">${it.longDescription}</div>` : ''}
                                            </td>
                                            <td class="px-3 py-2 text-right font-semibold">${it.quantity} ${it.quantityUnit}</td>
                                            <td class="px-3 py-2 text-right font-mono">${it.netPrice.toFixed(2)} €</td>
                                            <td class="px-3 py-2 text-right font-mono font-bold text-slate-800">${it.posNetTotal.toFixed(2)} €</td>
                                            <td class="px-3 py-2">
                                                ${(it.documents || []).map(d => `
                                                    <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                                        📄 ${d.type}
                                                    </span>
                                                `).join(' ')}
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
                        <button onclick="document.getElementById('cart-details-modal').remove()" class="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-100">Schließen</button>
                        <button onclick="document.getElementById('cart-details-modal').remove(); window.grosshandelViewInstance.openImportModal(${cartId})"
                            class="px-5 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-bold shadow-sm">
                            In Beleg übernehmen →
                        </button>
                    </div>
                </div>
            `;
            modalContainer.appendChild(div);
        } catch (err) {
            alert('Fehler beim Anzeigen der Details: ' + err.message);
        }
    }

    async openImportModal(cartId) {
        // Lade offene Angebote/Rechnungen
        let dokumente = [];
        try {
            if (window.api && window.api.getDokumente) {
                dokumente = await window.api.getDokumente();
            }
        } catch (_e) { }

        const modalContainer = document.getElementById('grosshandel-modals-container') || document.body;
        const div = document.createElement('div');
        div.id = 'import-cart-modal';
        div.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4';
        div.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-200">
                <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-primary text-2xl">move_to_inbox</span>
                        <h3 class="font-bold text-slate-800 text-base">Warenkorb in Beleg übernehmen</h3>
                    </div>
                    <button onclick="document.getElementById('import-cart-modal').remove()" class="text-slate-400 hover:text-slate-600 p-1">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div class="p-6 space-y-4 text-xs">
                    <div>
                        <label class="block font-bold text-slate-700 uppercase tracking-wider mb-1">Ziel-Dokument wählen</label>
                        <select id="import-target-doc" class="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white font-medium">
                            ${dokumente.map(d => `<option value="${d.id}">#${d.nr} - ${d.kunde_name || 'Kunde'} (${d.type === 'angebot' ? 'Angebot' : 'Rechnung'})</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block font-bold text-slate-700 uppercase tracking-wider mb-1">Kalkulationsaufschlag auf HEK (%)</label>
                        <input type="number" id="import-aufschlag" value="25.0" step="0.5" min="0" class="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold text-primary">
                        <p class="text-[11px] text-slate-400 mt-1">Ermittelt den Netto-Verkaufspreis (VK) für das Angebot.</p>
                    </div>
                </div>
                <div class="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
                    <button onclick="document.getElementById('import-cart-modal').remove()" class="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-100">Abbrechen</button>
                    <button onclick="window.grosshandelViewInstance.executeImport(${cartId})" class="px-5 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-bold shadow-sm">Übernahme durchführen</button>
                </div>
            </div>
        `;
        modalContainer.appendChild(div);
    }

    async executeImport(cartId) {
        const docSelect = document.getElementById('import-target-doc');
        const aufschlagInput = document.getElementById('import-aufschlag');
        if (!docSelect || !docSelect.value) {
            alert('Bitte wählen Sie ein Zieldokument.');
            return;
        }

        const dokumentId = parseInt(docSelect.value, 10);
        const aufschlagProzent = parseFloat(aufschlagInput.value) || 25.0;

        try {
            if (window.api && window.api.importCartToDocument) {
                const res = await window.api.importCartToDocument({
                    cartId,
                    dokumentId,
                    aufschlagProzent
                });
                document.getElementById('import-cart-modal')?.remove();
                if (typeof showNotification === 'function') {
                    showNotification('Warenkorb übernommen', `${res.insertedCount} Positionen wurden erfolgreich in Beleg #${dokumentId} eingefügt.`);
                }
                await this.refresh();
            }
        } catch (err) {
            alert('Fehler bei der Übernahme: ' + err.message);
        }
    }

    async deleteCart(cartId) {
        if (!confirm('Möchten Sie diesen Warenkorb wirklich löschen?')) return;
        try {
            if (window.api && window.api.deleteIdsWarenkorb) {
                await window.api.deleteIdsWarenkorb(cartId);
                await this.refresh();
            }
        } catch (err) {
            alert('Fehler beim Löschen: ' + err.message);
        }
    }

    openKontoModal(kontoId = null) {
        const konto = kontoId ? this.konten.find(k => k.id === kontoId) : null;
        const modalContainer = document.getElementById('grosshandel-modals-container') || document.body;
        const div = document.createElement('div');
        div.id = 'konto-modal';
        div.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4';
        div.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-200">
                <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 class="font-bold text-slate-800 text-base">${konto ? 'Großhandelskonto bearbeiten' : 'Neues Großhandelskonto'}</h3>
                    <button onclick="document.getElementById('konto-modal').remove()" class="text-slate-400 hover:text-slate-600 p-1">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <form onsubmit="window.grosshandelViewInstance.saveKonto(event, ${kontoId || 'null'})" class="p-6 space-y-4 text-xs">
                    <div>
                        <label class="block font-bold text-slate-700 uppercase tracking-wider mb-1">Name des Großhandels *</label>
                        <input type="text" id="k-name" required value="${konto ? konto.name : ''}" placeholder="z. B. GC Gruppe (Online Plus)"
                            class="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block font-bold text-slate-700 uppercase tracking-wider mb-1">Code / Kennung *</label>
                            <input type="text" id="k-code" required value="${konto ? konto.grosshaendler_code : 'CUSTOM'}" placeholder="GC_GRUPPE"
                                class="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono uppercase">
                        </div>
                        <div>
                            <label class="block font-bold text-slate-700 uppercase tracking-wider mb-1">Kundennummer *</label>
                            <input type="text" id="k-kdnr" required value="${konto ? konto.kundennummer : ''}" placeholder="884920"
                                class="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono">
                        </div>
                    </div>
                    <div>
                        <label class="block font-bold text-slate-700 uppercase tracking-wider mb-1">IDS Start-URL *</label>
                        <input type="url" id="k-url" required value="${konto ? konto.shop_url : 'https://onlineplus.gc-gruppe.de/ids'}" placeholder="https://..."
                            class="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono">
                    </div>
                    <div>
                        <label class="block font-bold text-slate-700 uppercase tracking-wider mb-1">Open Masterdata REST URL</label>
                        <input type="url" id="k-rest" value="${konto ? (konto.rest_api_url || '') : ''}" placeholder="https://api..."
                            class="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block font-bold text-slate-700 uppercase tracking-wider mb-1">Standard-Aufschlag (%)</label>
                            <input type="number" id="k-aufschlag" step="0.5" value="${konto ? konto.standard_aufschlag_prozent : '25.0'}"
                                class="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold text-primary">
                        </div>
                        <div class="flex items-center pt-5">
                            <label class="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" id="k-default" ${konto && konto.is_default ? 'checked' : ''} class="rounded border-slate-300 text-primary">
                                <span class="font-bold text-slate-700">Als Standard setzen</span>
                            </label>
                        </div>
                    </div>
                    <div class="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 mt-4">
                        <button type="button" onclick="document.getElementById('konto-modal').remove()" class="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs font-bold">Abbrechen</button>
                        <button type="submit" class="px-5 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-bold shadow-sm">Speichern</button>
                    </div>
                </form>
            </div>
        `;
        modalContainer.appendChild(div);
    }

    async saveKonto(event, kontoId) {
        event.preventDefault();
        const data = {
            id: kontoId,
            name: document.getElementById('k-name').value,
            grosshaendler_code: document.getElementById('k-code').value,
            kundennummer: document.getElementById('k-kdnr').value,
            shop_url: document.getElementById('k-url').value,
            rest_api_url: document.getElementById('k-rest').value,
            standard_aufschlag_prozent: parseFloat(document.getElementById('k-aufschlag').value) || 25.0,
            is_default: document.getElementById('k-default').checked ? 1 : 0
        };

        try {
            if (window.api && window.api.saveIdsKonto) {
                await window.api.saveIdsKonto(data);
                document.getElementById('konto-modal')?.remove();
                await this.refresh();
            }
        } catch (err) {
            alert('Fehler beim Speichern: ' + err.message);
        }
    }

    async deleteKonto(id) {
        if (!confirm('Möchten Sie dieses Großhandelskonto wirklich löschen?')) return;
        try {
            if (window.api && window.api.deleteIdsKonto) {
                await window.api.deleteIdsKonto(id);
                await this.refresh();
            }
        } catch (err) {
            alert('Fehler beim Löschen: ' + err.message);
        }
    }
};
