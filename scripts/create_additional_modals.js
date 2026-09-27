const fs = require('fs');
const path = require('path');

const modalsDir = path.join(__dirname, '../views/modals');

// 1. maengel-modal.html
const maengelModalHtml = `<!-- Mängelkataster Neuer Mangel Modal -->
<div id="mangel-create-modal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs">
        <div class="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <h3 class="font-bold text-slate-800 text-sm flex items-center gap-2">
                <span class="material-symbols-outlined text-primary">add_circle</span>
                Neuen Mangel erfassen
            </h3>
            <button type="button" onclick="document.getElementById('mangel-create-modal').classList.add('hidden')" class="text-slate-400 hover:text-slate-600">
                <span class="material-symbols-outlined">close</span>
            </button>
        </div>
        <div class="p-6 overflow-y-auto space-y-4">
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block font-semibold text-slate-700 mb-1">Projekt *</label>
                    <select id="mc-projekt" class="w-full rounded-lg border-slate-300 py-1.5 px-3">
                    </select>
                </div>
                <div>
                    <label class="block font-semibold text-slate-700 mb-1">Subunternehmer / Verursacher</label>
                    <select id="mc-sub" class="w-full rounded-lg border-slate-300 py-1.5 px-3">
                        <option value="">-- Eigenleistung / Unbekannt --</option>
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
                    <input type="date" id="mc-frist" class="w-full rounded-lg border-slate-300 py-1.5 px-3">
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
            <button type="button" onclick="document.getElementById('mangel-create-modal').classList.add('hidden')" class="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-100">Abbrechen</button>
            <button type="button" onclick="window.maengelViewInstance && window.maengelViewInstance.submitCreateMangel()" class="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-semibold">Mangel speichern</button>
        </div>
    </div>
</div>`;
fs.writeFileSync(path.join(modalsDir, 'maengel-modal.html'), maengelModalHtml, 'utf8');

// 2. soka-nachweis-modal.html
const sokaModalHtml = `<!-- SOKA-BAU Subunternehmer Nachweis Modal -->
<div id="nachweis-modal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
    <div class="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden border border-slate-100">
        <div class="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <h3 class="font-bold text-slate-800 text-sm flex items-center gap-2">
                <span class="material-symbols-outlined text-primary">verified_user</span>
                Compliance-Nachweis hinterlegen
            </h3>
            <button type="button" onclick="document.getElementById('nachweis-modal').classList.add('hidden')" class="text-slate-400 hover:text-slate-600 p-1">
                <span class="material-symbols-outlined text-sm">close</span>
            </button>
        </div>
        <div class="p-6 space-y-4 text-xs">
            <div>
                <label class="block font-semibold text-slate-700 mb-1">Subunternehmer *</label>
                <select id="nw-kunde" class="w-full rounded-xl border border-slate-200 py-2 px-3 text-xs bg-slate-50 font-medium"></select>
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block font-semibold text-slate-700 mb-1">Nachweis-Typ *</label>
                    <select id="nw-typ" class="w-full rounded-xl border border-slate-200 py-2 px-3 text-xs bg-white">
                        <option value="FREISTELLUNGSBESCHEINIGUNG_48B">§ 48b EStG Freistellung</option>
                        <option value="UNBEDENKLICHKEIT_SOKA">SOKA-BAU Unbedenklichkeit</option>
                        <option value="UNBEDENKLICHKEIT_KRANKENKASSE">Krankenkasse Unbedenklichkeit</option>
                        <option value="UNBEDENKLICHKEIT_BG_BAU">BG BAU Bescheinigung</option>
                        <option value="GEWERBEANMELDUNG">Gewerbeanmeldung</option>
                        <option value="HAFTPFLICHTVERSICHERUNG">Betriebshaftpflicht</option>
                        <option value="MINDESTLOHN_ERKLAERUNG">MiLoG Erklärung</option>
                    </select>
                </div>
                <div>
                    <label class="block font-semibold text-slate-700 mb-1">Zertifikats- / Bescheid-Nr.</label>
                    <input type="text" id="nw-nr" placeholder="z. B. FS-2026/8912" class="w-full rounded-xl border border-slate-200 py-2 px-3 text-xs">
                </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block font-semibold text-slate-700 mb-1">Gültig von</label>
                    <input type="date" id="nw-von" class="w-full rounded-xl border border-slate-200 py-2 px-3 text-xs">
                </div>
                <div>
                    <label class="block font-semibold text-slate-700 mb-1">Gültig bis (Ablaufdatum) *</label>
                    <input type="date" id="nw-bis" class="w-full rounded-xl border border-slate-200 py-2 px-3 text-xs font-bold text-slate-800">
                </div>
            </div>
            <div>
                <label class="block font-semibold text-slate-700 mb-1">Ausstellende Behörde / Kasse</label>
                <input type="text" id="nw-aussteller" placeholder="z. B. Finanzamt Wiesbaden, SOKA-BAU..." class="w-full rounded-xl border border-slate-200 py-2 px-3 text-xs">
            </div>
        </div>
        <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
            <button type="button" onclick="document.getElementById('nachweis-modal').classList.add('hidden')" class="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs font-bold">Abbrechen</button>
            <button type="button" onclick="window.sokaBauViewInstance && window.sokaBauViewInstance.saveNachweis()" class="px-5 py-2 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary-dark">Nachweis speichern</button>
        </div>
    </div>
</div>`;
fs.writeFileSync(path.join(modalsDir, 'soka-nachweis-modal.html'), sokaModalHtml, 'utf8');

// 3. ids-connect-modals.html
const idsConnectModalHtml = `<!-- IDS Connect 2.5 / Großhandels Dialoge -->
<div id="quick-launch-modal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
    <div class="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-slate-100 p-6">
        <div class="flex justify-between items-center mb-4">
            <h3 class="font-bold text-slate-800 text-sm flex items-center gap-2">
                <span class="material-symbols-outlined text-primary">storefront</span>
                Großhändler Online-Shop öffnen
            </h3>
            <button type="button" onclick="document.getElementById('quick-launch-modal').classList.add('hidden')" class="text-slate-400 hover:text-slate-600 p-1">
                <span class="material-symbols-outlined text-sm">close</span>
            </button>
        </div>
        <p class="text-xs text-slate-500 mb-4">Wählen Sie den gewünschten Lieferanten für den IDS Connect 2.5 Sprung:</p>
        <div id="quick-launch-list" class="space-y-2"></div>
    </div>
</div>

<div id="konto-modal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
    <div class="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden border border-slate-100">
        <div class="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <h3 class="font-bold text-slate-800 text-sm flex items-center gap-2">
                <span class="material-symbols-outlined text-primary">store</span>
                Großhändler-Anbindung (IDS Connect 2.5)
            </h3>
            <button type="button" onclick="document.getElementById('konto-modal').classList.add('hidden')" class="text-slate-400 hover:text-slate-600 p-1">
                <span class="material-symbols-outlined text-sm">close</span>
            </button>
        </div>
        <div class="p-6 space-y-4 text-xs">
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block font-semibold text-slate-700 mb-1">Lieferant / Großhändler *</label>
                    <input type="text" id="k-name" placeholder="z. B. GC Gruppe / Gienger" class="w-full rounded-xl border border-slate-200 py-2 px-3 text-xs">
                </div>
                <div>
                    <label class="block font-semibold text-slate-700 mb-1">Kürzel / Code *</label>
                    <input type="text" id="k-code" placeholder="z. B. GC" class="w-full rounded-xl border border-slate-200 py-2 px-3 text-xs font-mono uppercase">
                </div>
            </div>
            <div>
                <label class="block font-semibold text-slate-700 mb-1">Kundennummer beim Großhändler</label>
                <input type="text" id="k-kdnr" placeholder="z. B. KD-884920" class="w-full rounded-xl border border-slate-200 py-2 px-3 text-xs">
            </div>
            <div>
                <label class="block font-semibold text-slate-700 mb-1">IDS Shop URL (Start-URL) *</label>
                <input type="url" id="k-url" placeholder="https://shop.grosshandel.de/ids" class="w-full rounded-xl border border-slate-200 py-2 px-3 text-xs font-mono">
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block font-semibold text-slate-700 mb-1">Standard-Kalkulationsaufschlag (%)</label>
                    <input type="number" id="k-aufschlag" step="0.5" value="25.0" class="w-full rounded-xl border border-slate-200 py-2 px-3 text-xs font-mono">
                </div>
                <div class="flex items-center pt-5">
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" id="k-default" class="rounded text-primary focus:ring-primary/20">
                        <span class="font-semibold text-slate-700">Als Standardlieferant festlegen</span>
                    </label>
                </div>
            </div>
        </div>
        <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
            <button type="button" onclick="document.getElementById('konto-modal').classList.add('hidden')" class="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs font-bold">Abbrechen</button>
            <button type="button" onclick="window.grosshandelViewInstance && window.grosshandelViewInstance.saveKonto()" class="px-5 py-2 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary-dark">Lieferant speichern</button>
        </div>
    </div>
</div>`;
fs.writeFileSync(path.join(modalsDir, 'ids-connect-modals.html'), idsConnectModalHtml, 'utf8');

// 4. efb-modal.html
const efbModalHtml = `<!-- EFB-Preisblätter 221 & 223 (VHB Bund) Dialog Template -->
<div id="efb-export-modal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
    <div class="bg-white rounded-2xl shadow-xl max-w-2xl w-full overflow-hidden border border-slate-100">
        <div class="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <h3 class="font-bold text-slate-800 text-sm flex items-center gap-2">
                <span class="material-symbols-outlined text-primary">description</span>
                EFB-Preisblätter Export (Formblatt 221 / 223)
            </h3>
            <button type="button" onclick="document.getElementById('efb-export-modal').classList.add('hidden')" class="text-slate-400 hover:text-slate-600 p-1">
                <span class="material-symbols-outlined text-sm">close</span>
            </button>
        </div>
        <div class="p-6 space-y-4 text-xs">
            <p class="text-slate-600">Exportieren Sie VHB-konforme EFB-Preisblätter nach Vorgaben des Bundesministeriums für Wohnen, Stadtentwicklung und Bauwesen:</p>
            <div class="grid grid-cols-2 gap-4">
                <div class="p-4 border border-slate-200 rounded-xl bg-slate-50/50 hover:border-primary cursor-pointer transition-colors">
                    <h4 class="font-bold text-slate-800 mb-1">EFB-Preisblatt 221</h4>
                    <p class="text-slate-500 text-[11px] mb-3">Angaben zur Preisermittlung bei Zuschlagskalkulation (Löhne, Stoffe, Geräte, Sonstiges)</p>
                    <button type="button" id="btn-export-efb-221" class="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-semibold">PDF erzeugen</button>
                </div>
                <div class="p-4 border border-slate-200 rounded-xl bg-slate-50/50 hover:border-primary cursor-pointer transition-colors">
                    <h4 class="font-bold text-slate-800 mb-1">EFB-Preisblatt 223</h4>
                    <p class="text-slate-500 text-[11px] mb-3">Aufgliederung der Einheitspreise für Teilleistungen und LV-Positionen</p>
                    <button type="button" id="btn-export-efb-223" class="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-semibold">PDF erzeugen</button>
                </div>
            </div>
        </div>
        <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
            <button type="button" onclick="document.getElementById('efb-export-modal').classList.add('hidden')" class="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs font-bold">Schließen</button>
        </div>
    </div>
</div>`;
fs.writeFileSync(path.join(modalsDir, 'efb-modal.html'), efbModalHtml, 'utf8');

console.log('Created additional partials: maengel-modal.html, soka-nachweis-modal.html, ids-connect-modals.html, efb-modal.html');
