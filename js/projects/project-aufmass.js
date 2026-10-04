(function(global) {



function handleGAEBFileUpload(event) {
    const file = event.target.files ? event.target.files[0] : null;
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const content = e.target.result;
        if (typeof GAEBEngine !== 'undefined') {
            try {
                const parsed = GAEBEngine.parseGAEBXML(content);
                renderGAEBPositionsTable(parsed.items || []);
                showToast(`GAEB X83 (${parsed.items ? parsed.items.length : 0} Positionen) erfolgreich importiert.`, 'success');
            } catch (err) {
                console.error('GAEB Import error:', err);
                showToast('Fehler beim Parsen der GAEB-Datei.', 'error');
            }
        } else {
            showToast('GAEB-Engine nicht verfügbar.', 'error');
        }
    };
    reader.readAsText(file);
}

function renderGAEBPositionsTable(items) {
    const tbody = document.getElementById('gaeb-table-body');
    const container = document.getElementById('gaeb-table-container');
    if (tbody && container) {
        tbody.innerHTML = '';
        if (!items || items.length === 0) {
            container.classList.add('hidden');
        } else {
            container.classList.remove('hidden');
        }
    }

    // [D-4] GAEB-Positionen direkt in splitPositionsData überführen und Split-Table aktualisieren
    if (items && items.length > 0) {
        splitPositionsData = items.map(item => ({
            oz: item.oz || '01.01.0010',
            name: item.name || item.kurztext || 'Position',
            mengeSoll: parseFloat(item.menge) || 1,
            einheit: item.einheit || 'm²',
            mengeIst: 0
        }));
        renderSplitPositionsTable();
    }

    if (!tbody || !items || items.length === 0) return;

    items.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition-colors';

        const tdOz = document.createElement('td');
        tdOz.className = 'px-4 py-2.5 font-mono text-xs font-semibold text-primary';
        tdOz.textContent = item.oz || '-';
        tr.appendChild(tdOz);

        const tdTitle = document.createElement('td');
        tdTitle.className = 'px-4 py-2.5 font-medium text-slate-800';
        tdTitle.textContent = item.name || item.kurztext || '';
        tr.appendChild(tdTitle);

        const tdMenge = document.createElement('td');
        tdMenge.className = 'px-4 py-2.5 text-center font-mono tabular-nums text-slate-700';
        tdMenge.textContent = item.menge || 1;
        tr.appendChild(tdMenge);

        const tdEinheit = document.createElement('td');
        tdEinheit.className = 'px-4 py-2.5 text-center text-xs text-slate-500 font-semibold';
        tdEinheit.textContent = item.einheit || 'Stk.';
        tr.appendChild(tdEinheit);

        const tdEp = document.createElement('td');
        tdEp.className = 'px-4 py-2.5 text-right font-mono tabular-nums text-slate-700';
        tdEp.textContent = formatCurrency(item.preis || 0);
        tr.appendChild(tdEp);

        const tdGp = document.createElement('td');
        tdGp.className = 'px-4 py-2.5 text-right font-mono tabular-nums font-bold text-slate-900';
        const gp = (item.menge || 1) * (item.preis || 0);
        tdGp.textContent = formatCurrency(gp);
        tr.appendChild(tdGp);

        tbody.appendChild(tr);
    });

    container.classList.remove('hidden');
}

function switchAufmassSubTab(subTabKey) {
    currentAufmassSubTab = subTabKey;
    const btnInfo = document.getElementById('pd-subtab-btn-aufmass-info');
    const btnPos = document.getElementById('pd-subtab-btn-aufmass-pos');
    const panelInfo = document.getElementById('pd-subpanel-aufmass-info');
    const panelPos = document.getElementById('pd-subpanel-aufmass-pos');

    if (subTabKey === 'info') {
        if (btnInfo) { btnInfo.classList.add('border-primary', 'text-primary'); btnInfo.classList.remove('border-transparent', 'text-slate-500'); }
        if (btnPos) { btnPos.classList.remove('border-primary', 'text-primary'); btnPos.classList.add('border-transparent', 'text-slate-500'); }
        if (panelInfo) panelInfo.classList.remove('hidden');
        if (panelPos) { panelPos.classList.add('hidden'); panelPos.classList.remove('flex'); }
        loadProjektAufmassBlaetter(window.currentViewProjektId);
    } else {
        if (btnPos) { btnPos.classList.add('border-primary', 'text-primary'); btnPos.classList.remove('border-transparent', 'text-slate-500'); }
        if (btnInfo) { btnInfo.classList.remove('border-primary', 'text-primary'); btnInfo.classList.add('border-transparent', 'text-slate-500'); }
        if (panelInfo) panelInfo.classList.add('hidden');
        if (panelPos) { panelPos.classList.remove('hidden'); panelPos.classList.add('flex'); }
        loadSplitViewPositions(window.currentViewProjektId);
    }
}

async function loadSplitViewPositions(projectId) {
    if (!projectId) return;
    const p = state.projekte.find(x => x.id === projectId);
    const tbody = document.getElementById('split-positions-body');
    const empty = document.getElementById('split-positions-empty');
    const countEl = document.getElementById('split-pos-count');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Collect positions from project GAEB / documents / blaetter
    splitPositionsData = [];
    const pAngebote = (state.dokumente || []).filter(d => d.projekt_id === projectId && (d.typ === 'Angebot' || d.typ === 'Auftragsbestätigung'));
    
    pAngebote.forEach(doc => {
        (doc.positionen || []).forEach(pos => {
            if (pos.oz || pos.name) {
                splitPositionsData.push({
                    oz: pos.oz || '01.01.0010',
                    name: pos.name || pos.kurztext || 'Position',
                    mengeSoll: pos.menge || 1,
                    einheit: pos.einheit || 'm²',
                    mengeIst: 0
                });
            }
        });
    });

    // Fallback if no documents yet: load positions from existing Aufmaßblätter
    if (splitPositionsData.length === 0 && window.api && window.api.getAufmassBlaetter) {
        const blaetter = await window.api.getAufmassBlaetter(projectId);
        const ozMap = {};
        (blaetter || []).forEach(b => {
            (b.zeilen || []).forEach(z => {
                if (!ozMap[z.oz_code]) {
                    ozMap[z.oz_code] = { oz: z.oz_code, name: z.bezeichnung || 'Position', mengeSoll: 100, einheit: z.einheit || 'm²', mengeIst: 0 };
                    splitPositionsData.push(ozMap[z.oz_code]);
                }
                ozMap[z.oz_code].mengeIst += (z.ergebnis || 0) * (z.vorzeichen || 1);
            });
        });
    }

    if (splitPositionsData.length === 0) {
        // Standard Dummy-Positions to get started immediately
        splitPositionsData = [
            { oz: '01.01.0010', name: 'Baustelleneinrichtung & Vorhaltung', mengeSoll: 1, einheit: 'psch', mengeIst: 1 },
            { oz: '01.01.0020', name: 'Bodenbelag Fliesen Feinsteinzeug EG', mengeSoll: 120, einheit: 'm²', mengeIst: 0 },
            { oz: '01.02.0010', name: 'Innenputz Q3 mineralisch Wände', mengeSoll: 350, einheit: 'm²', mengeIst: 0 }
        ];
    }

    renderSplitPositionsTable();
}

function renderSplitPositionsTable() {
    const tbody = document.getElementById('split-positions-body');
    const empty = document.getElementById('split-positions-empty');
    const countEl = document.getElementById('split-pos-count');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (countEl) countEl.innerText = `${splitPositionsData.length} Pos.`;
    if (empty) {
        if (splitPositionsData.length === 0) {
            empty.classList.remove('hidden');
        } else {
            empty.classList.add('hidden');
        }
    }

    splitPositionsData.forEach((item, idx) => {
        const tr = document.createElement('tr');
        tr.id = `split-pos-row-${idx}`;
        tr.className = `cursor-pointer hover:bg-primary/5 transition-colors ${idx === 0 ? 'bg-primary/10 font-semibold' : ''}`;
        tr.onclick = () => selectSplitPosition(item.oz, item.name, item.mengeSoll, item.einheit, idx);

        tr.innerHTML = `
            <td class="px-3 py-2 font-mono font-bold text-primary">${item.oz}</td>
            <td class="px-3 py-2 text-slate-800 truncate max-w-[140px]">${item.name}</td>
            <td class="px-3 py-2 text-right font-mono text-slate-500">${item.mengeSoll} ${item.einheit}</td>
            <td class="px-3 py-2 text-right font-mono font-bold text-emerald-600" id="split-pos-ist-${item.oz}">${(item.mengeIst || 0).toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
    });

    if (splitPositionsData.length > 0) {
        const first = splitPositionsData[0];
        selectSplitPosition(first.oz, first.name, first.mengeSoll, first.einheit, 0);
    }
}

async function selectSplitPosition(oz, name, mengeSoll, einheit, rowIdx) {
    activeSplitOz = oz;
    activeSplitPosition = { oz, name, mengeSoll, einheit };

    document.querySelectorAll('#split-positions-body tr').forEach(r => r.classList.remove('bg-primary/10', 'font-semibold'));
    const row = document.getElementById(`split-pos-row-${rowIdx}`);
    if (row) row.classList.add('bg-primary/10', 'font-semibold');

    const titleEl = document.getElementById('detail-active-title');
    const ozEl = document.getElementById('detail-active-oz');
    if (titleEl) titleEl.innerText = `${name} (Soll: ${mengeSoll} ${einheit})`;
    if (ozEl) ozEl.innerText = `OZ ${oz}`;

    // Load existing Aufmaß-Zeilen for this OZ from project
    currentSplitZeilen = [];
    if (window.api && window.api.getAufmassBlaetter) {
        const blaetter = await window.api.getAufmassBlaetter(window.currentViewProjektId);
        (blaetter || []).forEach(b => {
            (b.zeilen || []).filter(z => z.oz_code === oz).forEach(z => {
                currentSplitZeilen.push({ ...z });
            });
        });
    }

    if (currentSplitZeilen.length === 0) {
        currentSplitZeilen = [
            { oz_code: oz, bezeichnung: 'Raum 1 / Fläche', rechenansatz: '5.50 * 4.20', ergebnis: 23.10, einheit: einheit, vorzeichen: 1 }
        ];
    }

    renderSplitDetailZeilenTable();
}

function addSplitAufmassZeile() {
    if (!activeSplitOz) return;
    currentSplitZeilen.push({
        oz_code: activeSplitOz,
        bezeichnung: '',
        rechenansatz: '',
        ergebnis: 0,
        einheit: activeSplitPosition ? activeSplitPosition.einheit : 'm²',
        vorzeichen: 1
    });
    renderSplitDetailZeilenTable();
}

function removeSplitAufmassZeile(idx) {
    currentSplitZeilen.splice(idx, 1);
    renderSplitDetailZeilenTable();
}

function toggleSplitZeileVorzeichen(idx) {
    if (currentSplitZeilen[idx]) {
        currentSplitZeilen[idx].vorzeichen = (currentSplitZeilen[idx].vorzeichen === -1) ? 1 : -1;
        renderSplitDetailZeilenTable();
    }
}

function renderSplitDetailZeilenTable() {
    const tbody = document.getElementById('split-detail-zeilen-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    currentSplitZeilen.forEach((z, idx) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/80 transition-colors';
        const isMinus = z.vorzeichen === -1;
        const vorzeichenBtn = isMinus
            ? `<button type="button" onclick="toggleSplitZeileVorzeichen(${idx})" class="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-rose-100 text-rose-700 border border-rose-300 hover:bg-rose-200 transition-all shadow-xs" title="Abzug (−). Klicken für Zuschlag (+)"><span class="font-mono text-sm leading-none font-bold">−</span> Abzug</button>`
            : `<button type="button" onclick="toggleSplitZeileVorzeichen(${idx})" class="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-300 hover:bg-emerald-200 transition-all shadow-xs" title="Zuschlag (+). Klicken für Abzug (−)"><span class="font-mono text-sm leading-none font-bold">+</span> Plus</button>`;

        const lineErgebnis = (z.ergebnis || 0) * (z.vorzeichen || 1);
        const ergClass = lineErgebnis < 0 ? 'text-rose-600' : 'text-slate-800';

        tr.innerHTML = `
            <td class="px-2.5 py-2 font-mono text-slate-400 text-center text-xs">${idx + 1}</td>
            <td class="px-2.5 py-2">
                <input type="text" value="${z.bezeichnung || ''}" onchange="currentSplitZeilen[${idx}].bezeichnung = this.value" class="w-full px-2.5 py-1.5 border border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary rounded-md text-xs text-slate-800 placeholder-slate-400" placeholder="z.B. EG Wohnbereich / Wand">
            </td>
            <td class="px-2.5 py-2">
                <input type="text" id="split-formula-input-${idx}" value="${z.rechenansatz || ''}" oninput="calcSplitZeileFormula(${idx}, this.value)" class="w-full px-2.5 py-1.5 border border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-md font-mono text-xs text-slate-900 bg-white placeholder-slate-400" placeholder="z.B. 4.50 * 3.20 oder L*B*H">
            </td>
            <td class="px-2.5 py-2 text-center">
                ${vorzeichenBtn}
            </td>
            <td class="px-2.5 py-2 text-right font-mono font-bold ${ergClass} text-xs" id="split-erg-${idx}">
                ${lineErgebnis.toFixed(2)}
            </td>
            <td class="px-1.5 py-2 text-center">
                <button type="button" onclick="removeSplitAufmassZeile(${idx})" class="text-slate-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors" title="Zeile löschen">
                    <span class="material-symbols-outlined text-[16px]">delete</span>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    recalcSplitDetailTotal();
}

function calcSplitZeileFormula(idx, formulaStr) {
    if (currentSplitZeilen[idx]) {
        currentSplitZeilen[idx].rechenansatz = formulaStr;
        const res = window.AufmassController ? window.AufmassController.evaluateFormula(formulaStr) : 0;
        currentSplitZeilen[idx].ergebnis = res;
        const ergEl = document.getElementById(`split-erg-${idx}`);
        if (ergEl) {
            const lineErg = res * (currentSplitZeilen[idx].vorzeichen || 1);
            ergEl.innerText = lineErg.toFixed(2);
            ergEl.className = lineErg < 0 ? 'px-2.5 py-2 text-right font-mono font-bold text-rose-600 text-xs' : 'px-2.5 py-2 text-right font-mono font-bold text-slate-800 text-xs';
        }
        recalcSplitDetailTotal();
    }
}

function recalcSplitDetailTotal() {
    let subtotal = currentSplitZeilen.reduce((acc, z) => acc + (z.ergebnis || 0) * (z.vorzeichen || 1), 0);
    const verschnitt = parseFloat(document.getElementById('split-verschnitt-input')?.value) || 0;
    const finalTotal = subtotal * (1 + verschnitt / 100);

    const totalEl = document.getElementById('split-detail-total-result');
    const unit = activeSplitPosition ? activeSplitPosition.einheit : 'm²';
    if (totalEl) totalEl.innerText = `${finalTotal.toFixed(2)} ${unit}`;

    if (activeSplitOz) {
        const istCell = document.getElementById(`split-pos-ist-${activeSplitOz}`);
        if (istCell) istCell.innerText = finalTotal.toFixed(2);
    }
}

async function saveSplitDetailAufmass() {
    const pId = window.currentViewProjektId;
    if (!pId || !activeSplitOz) {
        showToast('Keine Position ausgewählt.', 'warning');
        return;
    }

    const blattData = {
        project_id: pId,
        blatt_nummer: `POS-${activeSplitOz.replace(/[^0-9A-Za-z]/g, '')}`,
        titel: `Aufmaß Position ${activeSplitOz} (${activeSplitPosition ? activeSplitPosition.name : ''})`,
        status: 'VERIFIED'
    };

    try {
        const savedId = await window.api.saveAufmassBlatt(blattData, currentSplitZeilen);
        showToast(`Detailaufmaß für OZ ${activeSplitOz} erfolgreich gespeichert.`, 'success');
        loadProjektAufmassBlaetter(pId);
    } catch (e) {
        console.error('Error saving split detail aufmass:', e);
        showToast('Fehler beim Speichern des Detailaufmaßes.', 'error');
    }
}

function selectAufmassWizardTyp(typ) {
    currentAufmassTyp = typ || 'FREI';
    const cards = document.querySelectorAll('.wiz-card-typ');
    cards.forEach(card => {
        const cardTyp = card.getAttribute('data-aufmass-typ');
        const radio = card.querySelector('input[type="radio"]');
        const icon = card.querySelector('.wiz-card-icon');
        if (cardTyp === currentAufmassTyp) {
            card.className = 'wiz-card-typ border-2 border-primary ring-2 ring-primary/20 bg-primary/5 rounded-xl p-4 cursor-pointer hover:border-primary hover:shadow-md transition-all flex flex-col items-center text-center shadow-xs';
            if (radio) radio.checked = true;
            if (icon) {
                icon.classList.remove('text-slate-500', 'text-slate-600');
                icon.classList.add('text-primary');
            }
        } else {
            card.className = 'wiz-card-typ border-2 border-slate-200 bg-white rounded-xl p-4 cursor-pointer hover:border-primary hover:shadow-md transition-all flex flex-col items-center text-center';
            if (radio) radio.checked = false;
            if (icon) {
                icon.classList.remove('text-primary');
                icon.classList.add('text-slate-500');
            }
        }
    });
}

function selectAufmassWizardVariante(variante) {
    currentAufmassVariante = (variante === 'TEILAUFMASS' ? 'TEIL' : (variante === 'EINZELAUFMASS' ? 'EINZEL' : (variante === 'SCHLUSSAUFMASS' ? 'SCHLUSS' : variante))) || 'TEIL';
    const cards = document.querySelectorAll('.wiz-card-var');
    cards.forEach(card => {
        const cardVar = card.getAttribute('data-aufmass-variante');
        const radio = card.querySelector('input[type="radio"]');
        const isSelected = (cardVar === currentAufmassVariante) || (cardVar === 'TEIL' && currentAufmassVariante === 'TEILAUFMASS') || (cardVar === 'EINZEL' && currentAufmassVariante === 'EINZELAUFMASS') || (cardVar === 'SCHLUSS' && currentAufmassVariante === 'SCHLUSSAUFMASS');
        if (isSelected) {
            card.className = 'wiz-card-var border-2 border-primary ring-2 ring-primary/20 bg-primary/5 rounded-xl p-3 cursor-pointer hover:border-primary hover:shadow-md transition-all flex flex-col shadow-xs';
            if (radio) radio.checked = true;
        } else {
            card.className = 'wiz-card-var border-2 border-slate-200 bg-white rounded-xl p-3 cursor-pointer hover:border-primary hover:shadow-md transition-all flex flex-col';
            if (radio) radio.checked = false;
        }
    });
}

function openAufmassWizardModal() {
    const modal = document.getElementById('aufmass-wizard-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    currentWizardStep = 1;
    selectAufmassWizardTyp('FREI');
    selectAufmassWizardVariante('TEIL');

    document.getElementById('wizard-step-1-content').classList.remove('hidden');
    document.getElementById('wizard-step-2-content').classList.add('hidden');
    document.getElementById('wiz-btn-back').classList.add('hidden');
    document.getElementById('wiz-btn-next').classList.remove('hidden');
    document.getElementById('wiz-btn-finish').classList.add('hidden');
    const fpBtn = document.getElementById('wiz-btn-finish-print');
    if (fpBtn) fpBtn.classList.add('hidden');

    document.getElementById('wiz-nummer').value = `AUF-${new Date().getFullYear()}-001`;
    document.getElementById('wiz-datum').value = new Date().toISOString().split('T')[0];
    document.getElementById('wiz-titel').value = '';
    document.getElementById('wiz-bemerkung').value = '';

    updateWizardBadges();
}

function closeAufmassWizardModal() {
    const modal = document.getElementById('aufmass-wizard-modal');
    if (modal) modal.classList.add('hidden');
}

function wizardNextStep() {
    currentWizardStep = 2;
    document.getElementById('wizard-step-1-content').classList.add('hidden');
    document.getElementById('wizard-step-2-content').classList.remove('hidden');
    document.getElementById('wiz-btn-back').classList.remove('hidden');
    document.getElementById('wiz-btn-next').classList.add('hidden');
    document.getElementById('wiz-btn-finish').classList.remove('hidden');
    const fpBtn = document.getElementById('wiz-btn-finish-print');
    if (fpBtn) fpBtn.classList.remove('hidden');
    updateWizardBadges();
}

function wizardPrevStep() {
    currentWizardStep = 1;
    document.getElementById('wizard-step-1-content').classList.remove('hidden');
    document.getElementById('wizard-step-2-content').classList.add('hidden');
    document.getElementById('wiz-btn-back').classList.add('hidden');
    document.getElementById('wiz-btn-next').classList.remove('hidden');
    document.getElementById('wiz-btn-finish').classList.add('hidden');
    const fpBtn = document.getElementById('wiz-btn-finish-print');
    if (fpBtn) fpBtn.classList.add('hidden');
    updateWizardBadges();
}

function updateWizardBadges() {
    const b1 = document.getElementById('wizard-step-badge-1');
    const b2 = document.getElementById('wizard-step-badge-2');
    if (currentWizardStep === 1) {
        if (b1) { b1.className = 'w-6 h-6 rounded-full bg-primary text-white font-bold flex items-center justify-center text-[11px]'; }
        if (b2) { b2.className = 'w-6 h-6 rounded-full bg-slate-200 text-slate-600 font-bold flex items-center justify-center text-[11px]'; }
    } else {
        if (b1) { b1.className = 'w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-[11px]'; }
        if (b2) { b2.className = 'w-6 h-6 rounded-full bg-primary text-white font-bold flex items-center justify-center text-[11px]'; }
    }
}

async function finishAufmassWizard(andPrint = false) {
    const pId = window.currentViewProjektId;
    const nummer = document.getElementById('wiz-nummer').value || 'AUF-001';
    const titel = document.getElementById('wiz-titel').value || 'Neues Aufmaß';
    const typ = currentAufmassTyp || document.querySelector('input[name="wiz-aufmass-typ"]:checked')?.value || 'FREI';
    let rawVar = currentAufmassVariante || document.querySelector('input[name="wiz-aufmass-var"]:checked')?.value || 'TEIL';
    let variante = rawVar;
    if (variante === 'TEIL') variante = 'TEILAUFMASS';
    if (variante === 'EINZEL') variante = 'EINZELAUFMASS';
    if (variante === 'SCHLUSS') variante = 'SCHLUSSAUFMASS';
    const bemerkung = document.getElementById('wiz-bemerkung')?.value || '';

    const typLabels = {
        'FREI': 'Freies Aufmaß',
        'SPALTEN': 'Spaltenaufmaß',
        'RAUM': 'Raumaufmaß'
    };
    const varLabels = {
        'TEILAUFMASS': 'Teilaufmaß',
        'EINZELAUFMASS': 'Einzelaufmaß',
        'SCHLUSSAUFMASS': 'Schlussaufmaß',
        'TEIL': 'Teilaufmaß',
        'EINZEL': 'Einzelaufmaß',
        'SCHLUSS': 'Schlussaufmaß'
    };

    const blattData = {
        project_id: pId,
        blatt_nummer: nummer,
        titel: `${titel} [${typLabels[typ] || typ} - ${varLabels[variante] || variante}]`,
        status: 'DRAFT'
    };

    let defaultZeilen = [];
    if (typ === 'SPALTEN') {
        defaultZeilen = [
            { oz_code: '01.01.0010', bezeichnung: 'Wandfläche Nord', formel_reb: '01', rechenansatz: '5.50 * 2.80', ergebnis: 15.40, einheit: 'm²', vorzeichen: 1 },
            { oz_code: '01.01.0010', bezeichnung: 'Wandfläche Süd', formel_reb: '01', rechenansatz: '5.50 * 2.80', ergebnis: 15.40, einheit: 'm²', vorzeichen: 1 },
            { oz_code: '01.01.0010', bezeichnung: 'Fensterausschnitt Abzug', formel_reb: '01', rechenansatz: '1.20 * 1.40', ergebnis: 1.68, einheit: 'm²', vorzeichen: -1 }
        ];
    } else if (typ === 'RAUM') {
        defaultZeilen = [
            { oz_code: '01.01.0010', bezeichnung: 'EG - Wohnbereich', formel_reb: '91', rechenansatz: '6.20 * 4.80', ergebnis: 29.76, einheit: 'm²', vorzeichen: 1 },
            { oz_code: '01.01.0010', bezeichnung: 'EG - Küche', formel_reb: '91', rechenansatz: '3.50 * 3.10', ergebnis: 10.85, einheit: 'm²', vorzeichen: 1 },
            { oz_code: '01.01.0010', bezeichnung: 'OG - Bad', formel_reb: '91', rechenansatz: '2.80 * 2.40', ergebnis: 6.72, einheit: 'm²', vorzeichen: 1 }
        ];
    } else {
        defaultZeilen = [
            { oz_code: '01.01.0010', bezeichnung: bemerkung ? `Fläche (${bemerkung})` : 'Flächenansatz', formel_reb: '91', rechenansatz: '4.50 * 3.20', ergebnis: 14.40, einheit: 'm²', vorzeichen: 1 }
        ];
    }

    try {
        const savedId = await window.api.saveAufmassBlatt(blattData, defaultZeilen);
        showToast('Aufmaß über Assistent erfolgreich erstellt.', 'success');
        closeAufmassWizardModal();
        if (pId) loadProjektAufmassBlaetter(pId);

        if (andPrint && savedId) {
            await printAufmassBlattAction(savedId);
        } else {
            switchAufmassSubTab('pos');
        }
    } catch (e) {
        console.error('Error creating wizard aufmass:', e);
        showToast('Fehler beim Erstellen des Aufmaßes.', 'error');
    }
}

function openFormelassistentModal(targetInputId = null) {
    activeTargetFormulaInputId = targetInputId;
    const modal = document.getElementById('formelassistent-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    onFormelVorlageChange();
}

function closeFormelassistentModal() {
    const modal = document.getElementById('formelassistent-modal');
    if (modal) modal.classList.add('hidden');
}

function onFormelVorlageChange() {
    const select = document.getElementById('fa-vorlage-select');
    const formulaInput = document.getElementById('fa-formel-text');
    if (!select || !formulaInput) return;

    if (select.value !== 'custom') {
        formulaInput.value = select.value;
    }
    parseAndBuildParameterInputs(formulaInput.value);
}

function onCustomFormulaInput() {
    const formulaInput = document.getElementById('fa-formel-text');
    if (formulaInput) parseAndBuildParameterInputs(formulaInput.value);
}

function parseAndBuildParameterInputs(formulaStr) {
    const grid = document.getElementById('fa-dynamische-parameter-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const matches = formulaStr.match(/\[([a-zA-Z0-9_]+)\]/g) || [];
    const uniqueParams = [...new Set(matches.map(m => m.replace(/[[\]]/g, '')))];

    if (uniqueParams.length === 0) {
        grid.innerHTML = '<span class="text-slate-400 italic col-span-2">Keine Variablen in der Formel vorhanden.</span>';
        recalcFormelassistentLive();
        return;
    }

    uniqueParams.forEach(param => {
        const div = document.createElement('div');
        div.innerHTML = `
            <label class="block text-xs font-semibold text-slate-600 mb-1 capitalize">${param.replace(/_/g, ' ')}</label>
            <input type="number" step="0.01" value="2.50" id="fa-param-${param}" oninput="recalcFormelassistentLive()" class="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs">
        `;
        grid.appendChild(div);
    });

    recalcFormelassistentLive();
}

function recalcFormelassistentLive() {
    const formulaInput = document.getElementById('fa-formel-text')?.value || '';
    let resolvedFormula = formulaInput;

    const matches = formulaInput.match(/\[([a-zA-Z0-9_]+)\]/g) || [];
    matches.forEach(m => {
        const param = m.replace(/[[\]]/g, '');
        const val = parseFloat(document.getElementById(`fa-param-${param}`)?.value) || 0;
        resolvedFormula = resolvedFormula.replace(m, val);
    });

    const previewAnsatz = document.getElementById('fa-live-ansatz-preview');
    const previewErg = document.getElementById('fa-live-ergebnis-preview');
    if (previewAnsatz) previewAnsatz.innerText = resolvedFormula;

    const erg = window.AufmassController ? window.AufmassController.evaluateFormula(resolvedFormula) : 0;
    if (previewErg) previewErg.innerText = erg.toFixed(2);
}

function applyFormelassistentResult() {
    const resolved = document.getElementById('fa-live-ansatz-preview')?.innerText || '';
    if (activeTargetFormulaInputId) {
        const targetEl = document.getElementById(activeTargetFormulaInputId);
        if (targetEl) {
            targetEl.value = resolved;
            targetEl.dispatchEvent(new Event('input'));
        }
    } else if (currentSplitZeilen.length > 0) {
        const lastIdx = currentSplitZeilen.length - 1;
        currentSplitZeilen[lastIdx].rechenansatz = resolved;
        const res = window.AufmassController ? window.AufmassController.evaluateFormula(resolved) : 0;
        currentSplitZeilen[lastIdx].ergebnis = res;
        renderSplitDetailZeilenTable();
    }
    closeFormelassistentModal();
}

async function loadProjektAufmassBlaetter(projectId) {
    if (!window.api || !window.api.getAufmassBlaetter) return;
    try {
        const blaetter = await window.api.getAufmassBlaetter(projectId);
        const tbody = document.getElementById('pd-aufmass-blaetter-body');
        const empty = document.getElementById('pd-aufmass-blaetter-empty');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!blaetter || blaetter.length === 0) {
            if (empty) empty.classList.remove('hidden');
            return;
        }
        if (empty) empty.classList.add('hidden');

        blaetter.forEach(b => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 transition-colors';

            const zeilenCount = (b.zeilen && b.zeilen.length) || 0;
            const summe = (b.zeilen || []).reduce((acc, z) => acc + (z.ergebnis || 0) * (z.vorzeichen !== undefined ? z.vorzeichen : 1), 0);

            tr.innerHTML = `
                <td class="px-4 py-3 font-mono font-bold text-primary">${b.blatt_nummer}</td>
                <td class="px-4 py-3 font-semibold text-slate-800">${b.titel}</td>
                <td class="px-4 py-3 text-center">${zeilenCount} Pos. (${summe.toFixed(2)} m²)</td>
                <td class="px-4 py-3 text-center">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${b.status === 'FINALIZED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}">${b.status || 'DRAFT'}</span>
                </td>
                <td class="px-4 py-3 text-center text-xs text-slate-400">${b.created_at ? new Date(b.created_at).toLocaleDateString() : '-'}</td>
                <td class="px-4 py-3 text-right space-x-1">
                    <button onclick="printAufmassBlattAction(${b.id})" class="p-1.5 hover:bg-indigo-50 text-indigo-600 rounded transition-colors" title="Aufmaßblatt drucken / PDF Vorschau">
                        <span class="material-symbols-outlined text-[18px]">print</span>
                    </button>
                    <button onclick="openAufmassBlattModal(${b.id})" class="p-1.5 hover:bg-slate-100 text-slate-600 rounded transition-colors" title="Bearbeiten">
                        <span class="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button onclick="exportProjektDA11(${b.id})" class="p-1.5 hover:bg-emerald-50 text-emerald-600 rounded transition-colors" title="DA11 REB 23.003 Export">
                        <span class="material-symbols-outlined text-[18px]">file_download</span>
                    </button>
                    <button onclick="deleteAufmassBlattAction(${b.id})" class="p-1.5 hover:bg-red-50 text-red-600 rounded transition-colors" title="Löschen">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error('Error loading aufmass blaetter:', e);
    }
}

async function openAufmassBlattModal(blattId = null) {
    const modal = document.getElementById('aufmassblatt-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    currentAufmassZeilen = [];
    document.getElementById('ab-id').value = '';
    document.getElementById('ab-nummer').value = '001';
    document.getElementById('ab-titel').value = '';

    if (blattId && window.api && window.api.getAufmassBlaetter) {
        const blaetter = await window.api.getAufmassBlaetter(window.currentViewProjektId);
        const b = blaetter.find(x => x.id === blattId);
        if (b) {
            document.getElementById('ab-id').value = b.id;
            document.getElementById('ab-nummer').value = b.blatt_nummer;
            document.getElementById('ab-titel').value = b.titel;
            currentAufmassZeilen = (b.zeilen || []).map(z => ({ ...z }));
        }
    } else {
        // Standardmäßig 1 leere Zeile
        currentAufmassZeilen.push({ oz_code: '01.01.0010', bezeichnung: '', rechenansatz: '4.50 * 3.20', ergebnis: 14.40, einheit: 'm²', vorzeichen: 1 });
    }

    renderAufmassBlattZeilenTable();
}

function closeAufmassBlattModal() {
    const modal = document.getElementById('aufmassblatt-modal');
    if (modal) modal.classList.add('hidden');
}

function addAufmassBlattZeile() {
    currentAufmassZeilen.push({ oz_code: '', bezeichnung: '', rechenansatz: '', ergebnis: 0, einheit: 'm²', vorzeichen: 1 });
    renderAufmassBlattZeilenTable();
}

function removeAufmassBlattZeile(idx) {
    currentAufmassZeilen.splice(idx, 1);
    renderAufmassBlattZeilenTable();
}

function toggleAufmassZeileVorzeichen(idx) {
    if (currentAufmassZeilen[idx]) {
        currentAufmassZeilen[idx].vorzeichen = (currentAufmassZeilen[idx].vorzeichen === -1) ? 1 : -1;
        renderAufmassBlattZeilenTable();
    }
}

function renderAufmassBlattZeilenTable() {
    const tbody = document.getElementById('ab-zeilen-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    let total = 0;

    currentAufmassZeilen.forEach((z, idx) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition-colors';
        const isMinus = z.vorzeichen === -1;
        const vorzeichenBtn = isMinus
            ? `<button type="button" onclick="toggleAufmassZeileVorzeichen(${idx})" class="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded text-xs font-bold bg-rose-100 text-rose-700 border border-rose-300 hover:bg-rose-200 transition-all shadow-xs" title="Abzug (−)"><span class="font-mono text-sm leading-none font-bold">−</span> Abzug</button>`
            : `<button type="button" onclick="toggleAufmassZeileVorzeichen(${idx})" class="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-300 hover:bg-emerald-200 transition-all shadow-xs" title="Zuschlag (+)"><span class="font-mono text-sm leading-none font-bold">+</span> Plus</button>`;

        const lineErgebnis = (z.ergebnis || 0) * (z.vorzeichen !== undefined ? z.vorzeichen : 1);
        const ergClass = lineErgebnis < 0 ? 'text-rose-600' : 'text-slate-800';

        tr.innerHTML = `
            <td class="px-2.5 py-2"><input type="text" value="${z.oz_code || ''}" onchange="updateAufmassZeile(${idx}, 'oz_code', this.value)" class="w-full px-2 py-1.5 border border-slate-300 focus:border-primary rounded font-mono text-xs" placeholder="01.01.0010"></td>
            <td class="px-2.5 py-2"><input type="text" value="${z.bezeichnung || ''}" onchange="updateAufmassZeile(${idx}, 'bezeichnung', this.value)" class="w-full px-2 py-1.5 border border-slate-300 focus:border-primary rounded text-xs" placeholder="Raum / Bauteil"></td>
            <td class="px-2.5 py-2"><input type="text" value="${z.rechenansatz || ''}" oninput="calcAufmassZeileFormula(${idx}, this.value)" class="w-full px-2 py-1.5 border border-slate-300 focus:border-indigo-500 rounded font-mono text-xs text-indigo-900 font-semibold" placeholder="z.B. 4.50 * 3.20 * 0.25"></td>
            <td class="px-2.5 py-2"><input type="text" value="${z.einheit || 'm²'}" onchange="updateAufmassZeile(${idx}, 'einheit', this.value)" class="w-full px-1.5 py-1.5 border border-slate-300 rounded text-center text-xs"></td>
            <td class="px-2.5 py-2 text-center">
                ${vorzeichenBtn}
            </td>
            <td class="px-2.5 py-2 text-right font-mono font-bold ${ergClass} text-xs" id="ab-erg-${idx}">
                ${lineErgebnis.toFixed(2)}
            </td>
            <td class="px-1.5 py-2 text-center">
                <button type="button" onclick="removeAufmassBlattZeile(${idx})" class="text-slate-400 hover:text-red-500 p-1 rounded hover:bg-red-50" title="Zeile löschen">
                    <span class="material-symbols-outlined text-[16px]">delete</span>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
        total += lineErgebnis;
    });

    const totalEl = document.getElementById('ab-total-sum');
    if (totalEl) totalEl.innerText = total.toFixed(2);
}

function updateAufmassZeile(idx, field, val) {
    if (currentAufmassZeilen[idx]) {
        currentAufmassZeilen[idx][field] = val;
        renderAufmassBlattZeilenTable();
    }
}

function calcAufmassZeileFormula(idx, formulaStr) {
    if (currentAufmassZeilen[idx]) {
        currentAufmassZeilen[idx].rechenansatz = formulaStr;
        const res = window.AufmassController ? window.AufmassController.evaluateFormula(formulaStr) : 0;
        currentAufmassZeilen[idx].ergebnis = res;
        const ergCell = document.getElementById(`ab-erg-${idx}`);
        const lineErg = res * (currentAufmassZeilen[idx].vorzeichen !== undefined ? currentAufmassZeilen[idx].vorzeichen : 1);
        if (ergCell) {
            ergCell.innerText = lineErg.toFixed(2);
            ergCell.className = lineErg < 0 ? 'px-2.5 py-2 text-right font-mono font-bold text-rose-600 text-xs' : 'px-2.5 py-2 text-right font-mono font-bold text-slate-800 text-xs';
        }
        // Recalc total
        let total = 0;
        currentAufmassZeilen.forEach(z => total += (z.ergebnis || 0) * (z.vorzeichen !== undefined ? z.vorzeichen : 1));
        const totalEl = document.getElementById('ab-total-sum');
        if (totalEl) totalEl.innerText = total.toFixed(2);
    }
}

async function saveAufmassBlattData() {
    const id = document.getElementById('ab-id').value;
    const blatt_nummer = document.getElementById('ab-nummer').value || '001';
    const titel = document.getElementById('ab-titel').value || 'Aufmaßblatt';
    const project_id = window.currentViewProjektId;

    if (!project_id) {
        showToast('Kein Projekt ausgewählt.', 'error');
        return;
    }

    const blattData = {
        id: id ? parseInt(id) : null,
        project_id,
        blatt_nummer,
        titel,
        status: 'VERIFIED'
    };

    try {
        const savedId = await window.api.saveAufmassBlatt(blattData, currentAufmassZeilen);
        showToast('Aufmaßblatt erfolgreich gespeichert.', 'success');
        closeAufmassBlattModal();
        loadProjektAufmassBlaetter(project_id);
    } catch (e) {
        console.error('Error saving aufmass blatt:', e);
        showToast('Fehler beim Speichern des Aufmaßblatts.', 'error');
    }
}

async function deleteAufmassBlattAction(blattId) {
    const confirmed = await window.api.confirm({
        title: 'Aufmaßblatt löschen',
        message: 'Möchten Sie dieses Aufmaßblatt wirklich löschen?'
    });
    if (confirmed) {
        await window.api.deleteAufmassBlatt(blattId);
        showToast('Aufmaßblatt gelöscht.', 'success');
        loadProjektAufmassBlaetter(window.currentViewProjektId);
    }
}

async function exportProjektDA11(blattId = null) {
    const pId = window.currentViewProjektId;
    if (!pId) return;
    try {
        const res = await window.api.exportDA11(pId, blattId);
        if (res && res.success) {
            showToast(`DA11 Datei erfolgreich exportiert: ${res.filePath}`, 'success');
        }
    } catch (e) {
        console.error('Error exporting DA11:', e);
        showToast('Fehler beim Exportieren der DA11 Datei.', 'error');
    }
}

async function exportProjektGAEBX31(blattId = null) {
    const pId = window.currentViewProjektId;
    if (!pId) return;
    try {
        if (window.api && window.api.exportGAEBX31) {
            const res = await window.api.exportGAEBX31(pId, blattId);
            if (res && res.success) {
                showToast(`GAEB DA XML 3.3 Phase X31 Mengenermittlung exportiert: ${res.filePath}`, 'success');
            }
        }
    } catch (e) {
        console.error('Fehler beim GAEB X31 Export:', e);
        showToast('Fehler beim GAEB X31 Export: ' + e.message, 'error');
    }
}

async function importProjektGAEBX31() {
    const pId = window.currentViewProjektId;
    if (!pId) return;
    try {
        if (window.api && window.api.importGAEBX31) {
            const res = await window.api.importGAEBX31(pId);
            if (res && res.success) {
                showToast(`GAEB X31 Import erfolgreich: ${res.importedCount} Zeilen aus ${res.itemsCount} Positionen importiert.`, 'success');
                loadProjektAufmassBlaetter(pId);
            }
        }
    } catch (e) {
        console.error('Fehler beim GAEB X31 Import:', e);
        showToast('Fehler beim GAEB X31 Import: ' + e.message, 'error');
    }
}



global.handleGAEBFileUpload = handleGAEBFileUpload;
global.renderGAEBPositionsTable = renderGAEBPositionsTable;
global.switchAufmassSubTab = switchAufmassSubTab;
global.loadSplitViewPositions = loadSplitViewPositions;
global.renderSplitPositionsTable = renderSplitPositionsTable;
global.selectSplitPosition = selectSplitPosition;
global.addSplitAufmassZeile = addSplitAufmassZeile;
global.removeSplitAufmassZeile = removeSplitAufmassZeile;
global.toggleSplitZeileVorzeichen = toggleSplitZeileVorzeichen;
global.renderSplitDetailZeilenTable = renderSplitDetailZeilenTable;
global.calcSplitZeileFormula = calcSplitZeileFormula;
global.recalcSplitDetailTotal = recalcSplitDetailTotal;
global.saveSplitDetailAufmass = saveSplitDetailAufmass;
global.selectAufmassWizardTyp = selectAufmassWizardTyp;
global.selectAufmassWizardVariante = selectAufmassWizardVariante;
global.openAufmassWizardModal = openAufmassWizardModal;
global.closeAufmassWizardModal = closeAufmassWizardModal;
global.wizardNextStep = wizardNextStep;
global.wizardPrevStep = wizardPrevStep;
global.updateWizardBadges = updateWizardBadges;
global.finishAufmassWizard = finishAufmassWizard;
global.openFormelassistentModal = openFormelassistentModal;
global.closeFormelassistentModal = closeFormelassistentModal;
global.onFormelVorlageChange = onFormelVorlageChange;
global.onCustomFormulaInput = onCustomFormulaInput;
global.parseAndBuildParameterInputs = parseAndBuildParameterInputs;
global.recalcFormelassistentLive = recalcFormelassistentLive;
global.applyFormelassistentResult = applyFormelassistentResult;
global.loadProjektAufmassBlaetter = loadProjektAufmassBlaetter;
global.openAufmassBlattModal = openAufmassBlattModal;
global.closeAufmassBlattModal = closeAufmassBlattModal;
global.addAufmassBlattZeile = addAufmassBlattZeile;
global.removeAufmassBlattZeile = removeAufmassBlattZeile;
global.toggleAufmassZeileVorzeichen = toggleAufmassZeileVorzeichen;
global.renderAufmassBlattZeilenTable = renderAufmassBlattZeilenTable;
global.updateAufmassZeile = updateAufmassZeile;
global.calcAufmassZeileFormula = calcAufmassZeileFormula;
global.saveAufmassBlattData = saveAufmassBlattData;
global.deleteAufmassBlattAction = deleteAufmassBlattAction;
global.exportProjektDA11 = exportProjektDA11;
global.exportProjektGAEBX31 = exportProjektGAEBX31;
global.importProjektGAEBX31 = importProjektGAEBX31;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        handleGAEBFileUpload,
        renderGAEBPositionsTable,
        switchAufmassSubTab,
        loadSplitViewPositions,
        renderSplitPositionsTable,
        selectSplitPosition,
        addSplitAufmassZeile,
        removeSplitAufmassZeile,
        toggleSplitZeileVorzeichen,
        renderSplitDetailZeilenTable,
        calcSplitZeileFormula,
        recalcSplitDetailTotal,
        saveSplitDetailAufmass,
        selectAufmassWizardTyp,
        selectAufmassWizardVariante,
        openAufmassWizardModal,
        closeAufmassWizardModal,
        wizardNextStep,
        wizardPrevStep,
        updateWizardBadges,
        finishAufmassWizard,
        openFormelassistentModal,
        closeFormelassistentModal,
        onFormelVorlageChange,
        onCustomFormulaInput,
        parseAndBuildParameterInputs,
        recalcFormelassistentLive,
        applyFormelassistentResult,
        loadProjektAufmassBlaetter,
        openAufmassBlattModal,
        closeAufmassBlattModal,
        addAufmassBlattZeile,
        removeAufmassBlattZeile,
        toggleAufmassZeileVorzeichen,
        renderAufmassBlattZeilenTable,
        updateAufmassZeile,
        calcAufmassZeileFormula,
        saveAufmassBlattData,
        deleteAufmassBlattAction,
        exportProjektDA11,
        exportProjektGAEBX31,
        importProjektGAEBX31
    };
}

})(typeof window !== 'undefined' ? window : this);
