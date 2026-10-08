// UI Logic for Musterbriefe

function fillPlaceholders(text, kundeId = null, projektId = null) {
    let replacedText = text;

    // Default placeholders
    const heute = new Date().toLocaleDateString('de-DE');
    replacedText = replacedText.replace(/{datum}/g, heute);
    replacedText = replacedText.replace(/{frist}/g, '[Frist einfügen]');
    replacedText = replacedText.replace(/{betrag}/g, '[Betrag einfügen]');

    let kundenName = '[Kundenname einfügen]';
    let projektName = '[Projektname einfügen]';

    if (typeof window !== 'undefined' && window.state) {
        // Find Kunde
        if (kundeId && window.state.kunden) {
            const kunde = window.state.kunden.find(k => k.id === parseInt(kundeId) || k.id === kundeId);
            if (kunde) {
                kundenName = kunde.firma || `${kunde.vorname || ''} ${kunde.nachname || ''}`.trim() || kundenName;
            }
        }

        // Find Projekt
        if (projektId && window.state.projekte) {
            const projekt = window.state.projekte.find(p => p.id === parseInt(projektId) || p.id === projektId);
            if (projekt) {
                projektName = projekt.titel || projekt.name || projektName;
            }
        }
    }

    replacedText = replacedText.replace(/{kunde}/g, kundenName);
    replacedText = replacedText.replace(/{projekt}/g, projektName);

    return replacedText;
}

function renderMusterbriefe(query = '') {
    const container = document.getElementById('view-musterbriefe');
    if (!container) return;

    let html = `
        <div class="max-w-7xl mx-auto">
            <div class="flex justify-between items-center mb-6">
                <div>
                    <h2 class="text-2xl font-bold text-slate-800">VOB/BGB Musterbriefe</h2>
                    <p class="text-slate-500 text-sm mt-1">18 Pflicht-Vorlagen für Büro & Baustelle (Keine Rechtsberatung)</p>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <!-- List -->
                <div class="lg:col-span-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[calc(100vh-12rem)]">
                    <div class="p-4 border-b border-slate-200 bg-slate-50">
                        <input type="text" id="musterbrief-search" placeholder="Suchen nach Paragraph, Stichwort..."
                            class="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                            value="${query}"
                            onkeyup="filterMusterbriefe()">
                    </div>
                    <div class="overflow-y-auto flex-1 p-2" id="musterbrief-list">
                        <!-- Items rendered via JS -->
                    </div>
                </div>

                <!-- Detail -->
                <div class="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col h-[calc(100vh-12rem)]" id="musterbrief-detail">
                    <div class="flex items-center justify-center h-full text-slate-400">
                        <p>Bitte wählen Sie einen Musterbrief aus der Liste aus.</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;

    // Initial render list
    filterMusterbriefe(query);
}

function filterMusterbriefe(initialQuery = null) {
    const searchInput = document.getElementById('musterbrief-search');
    const query = (initialQuery !== null ? initialQuery : (searchInput ? searchInput.value : '')).toLowerCase();

    const listContainer = document.getElementById('musterbrief-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    const filtered = MUSTERBRIEFE_DATA.filter(mb =>
        mb.titel.toLowerCase().includes(query) ||
        mb.paragraph.toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
        listContainer.innerHTML = '<p class="text-sm text-slate-500 p-4 text-center">Keine Musterbriefe gefunden.</p>';
        return;
    }

    filtered.forEach(mb => {
        const div = document.createElement('div');
        div.className = 'p-3 mb-2 rounded-lg cursor-pointer hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-colors';
        div.onclick = () => selectMusterbrief(mb.id);
        div.innerHTML = `
            <div class="font-medium text-slate-800 text-sm">${mb.titel}</div>
            <div class="text-xs text-primary mt-1 font-semibold">${mb.paragraph}</div>
        `;
        listContainer.appendChild(div);
    });
}

function selectMusterbrief(id) {
    const mb = MUSTERBRIEFE_DATA.find(m => m.id === id);
    if (!mb) return;

    const detailContainer = document.getElementById('musterbrief-detail');
    if (!detailContainer) return;

    // Build options for select dropdowns based on state
    let kundenOptions = '<option value="">[Kunde auswählen]</option>';
    if (typeof window !== 'undefined' && window.state && window.state.kunden) {
        window.state.kunden.forEach(k => {
            const name = k.firma || `${k.vorname || ''} ${k.nachname || ''}`.trim();
            kundenOptions += `<option value="${k.id}">${name}</option>`;
        });
    }

    let projekteOptions = '<option value="">[Projekt auswählen]</option>';
    if (typeof window !== 'undefined' && window.state && window.state.projekte) {
        window.state.projekte.forEach(p => {
            const name = p.titel || p.name || `Projekt ${p.id}`;
            projekteOptions += `<option value="${p.id}">${name}</option>`;
        });
    }

    const initialText = fillPlaceholders(mb.vorlage_text);

    detailContainer.innerHTML = `
        <div class="flex justify-between items-start mb-4">
            <div>
                <h3 class="text-lg font-bold text-slate-800">${mb.titel}</h3>
                <div class="flex gap-3 mt-2">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        ${mb.paragraph}
                    </span>
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                        Frist: ${mb.fristhinweis}
                    </span>
                </div>
            </div>
            <a href="${mb.url}" target="_blank" class="text-primary hover:text-primary-dark text-sm flex items-center gap-1" title="Auf Bauprofessor.de öffnen">
                <span class="material-symbols-outlined text-[18px]">open_in_new</span> Info
            </a>
        </div>

        <div class="mb-4 grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div>
                <label class="block text-xs font-medium text-slate-700 mb-1">Vorausfüllen: Kunde</label>
                <select id="mb-kunde-select" class="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:border-primary" onchange="updateMusterbriefPreview(${mb.id})">
                    ${kundenOptions}
                </select>
            </div>
            <div>
                <label class="block text-xs font-medium text-slate-700 mb-1">Vorausfüllen: Projekt</label>
                <select id="mb-projekt-select" class="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:border-primary" onchange="updateMusterbriefPreview(${mb.id})">
                    ${projekteOptions}
                </select>
            </div>
        </div>

        <div class="flex-1 flex flex-col min-h-0">
            <div class="flex justify-between items-center mb-2">
                <label class="block text-sm font-medium text-slate-700">Vorlage (Bitte anpassen):</label>
                <button onclick="copyMusterbrief()" class="text-xs flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-300 transition-colors">
                    <span class="material-symbols-outlined text-[14px]">content_copy</span> Kopieren
                </button>
            </div>
            <textarea id="mb-preview-text" class="flex-1 w-full p-4 border border-slate-300 rounded-lg text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary" spellcheck="false">${initialText}</textarea>
        </div>

        <div class="mt-4 p-3 bg-red-50 border border-red-100 rounded-md">
            <p class="text-xs text-red-800 font-semibold flex items-center gap-1">
                <span class="material-symbols-outlined text-[16px]">warning</span>
                Wichtiger Hinweis:
            </p>
            <p class="text-xs text-red-700 mt-1">Dies ist eine reine Textvorlage und stellt keine Rechtsberatung dar. Die Nutzung erfolgt auf eigene Verantwortung. Bitte prüfen Sie den Text vor Versand auf den konkreten Einzelfall.</p>
        </div>
    `;
}

function updateMusterbriefPreview(id) {
    const mb = MUSTERBRIEFE_DATA.find(m => m.id === id);
    if (!mb) return;

    const kundeSelect = document.getElementById('mb-kunde-select');
    const projektSelect = document.getElementById('mb-projekt-select');
    const textArea = document.getElementById('mb-preview-text');

    if (!textArea) return;

    const kundeId = kundeSelect ? kundeSelect.value : null;
    const projektId = projektSelect ? projektSelect.value : null;

    textArea.value = fillPlaceholders(mb.vorlage_text, kundeId, projektId);
}

function copyMusterbrief() {
    const textArea = document.getElementById('mb-preview-text');
    if (!textArea) return;

    textArea.select();
    document.execCommand('copy');

    // Optional: show a small toast or notification if available in the app
    if (typeof showToast === 'function') {
        showToast('Vorlage in die Zwischenablage kopiert', 'success');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { renderMusterbriefe, fillPlaceholders, filterMusterbriefe, selectMusterbrief, updateMusterbriefPreview, copyMusterbrief };
}
