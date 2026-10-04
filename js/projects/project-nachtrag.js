(function(global) {

async function loadProjektNachtraege(projectId) {
    if (!window.api || !window.api.getNachtraege) return;
    try {
        const nachtraege = await window.api.getNachtraege(projectId);
        const tbody = document.getElementById('pd-nachtraege-body');
        const empty = document.getElementById('pd-nachtraege-empty');
        if (!tbody) return;
        tbody.innerHTML = '';

        let sumEingereicht = 0;
        let sumGenehmigt = 0;
        let sumAbgelehnt = 0;

        if (!nachtraege || nachtraege.length === 0) {
            if (empty) empty.classList.remove('hidden');
            updateNachtragSums(0, 0, 0);
            return;
        }
        if (empty) empty.classList.add('hidden');

        nachtraege.forEach(n => {
            const netto = n.summe_netto || 0;
            if (n.status === 'GENEHMIGT') sumGenehmigt += netto;
            else if (n.status === 'ABGELEHNT') sumAbgelehnt += netto;
            else sumEingereicht += netto;

            let statusPill = 'bg-amber-100 text-amber-800';
            if (n.status === 'GENEHMIGT') statusPill = 'bg-emerald-100 text-emerald-800';
            else if (n.status === 'ABGELEHNT') statusPill = 'bg-red-100 text-red-800';

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 transition-colors';
            tr.innerHTML = `
                <td class="px-4 py-3 font-mono font-bold text-indigo-700">${n.nachtrag_nr}</td>
                <td class="px-4 py-3 font-semibold text-slate-800">${n.titel}</td>
                <td class="px-4 py-3 text-xs text-slate-500">${window.NachtragController ? window.NachtragController.getRechtsgrundlageLabel(n.rechtsgrundlage) : n.rechtsgrundlage}</td>
                <td class="px-4 py-3 text-right font-mono font-bold">${formatCurrency(n.summe_netto)}</td>
                <td class="px-4 py-3 text-center">
                    <span class="px-2.5 py-0.5 rounded text-[11px] font-bold uppercase ${statusPill}">${n.status}</span>
                </td>
                <td class="px-4 py-3 text-right space-x-1">
                    <button onclick="updateNachtragStatusAction(${n.id}, 'GENEHMIGT')" class="p-1.5 hover:bg-emerald-50 text-emerald-600 rounded text-xs font-bold" title="Genehmigen">
                        <span class="material-symbols-outlined text-[18px]">check_circle</span>
                    </button>
                    <button onclick="updateNachtragStatusAction(${n.id}, 'ABGELEHNT')" class="p-1.5 hover:bg-red-50 text-red-600 rounded text-xs font-bold" title="Ablehnen">
                        <span class="material-symbols-outlined text-[18px]">cancel</span>
                    </button>
                    <button onclick="openNachtragModal(${n.id})" class="p-1.5 hover:bg-slate-100 text-slate-600 rounded" title="Bearbeiten">
                        <span class="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button onclick="deleteNachtragAction(${n.id})" class="p-1.5 hover:bg-red-50 text-red-600 rounded" title="Löschen">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        updateNachtragSums(sumEingereicht, sumGenehmigt, sumAbgelehnt);
    } catch (e) {
        console.error('Error loading nachtraege:', e);
    }
}

function updateNachtragSums(e, g, a) {
    const elE = document.getElementById('pd-nachtrag-sum-eingereicht');
    const elG = document.getElementById('pd-nachtrag-sum-genehmigt');
    const elA = document.getElementById('pd-nachtrag-sum-abgelehnt');
    if (elE) elE.innerText = formatCurrency(e);
    if (elG) elG.innerText = formatCurrency(g);
    if (elA) elA.innerText = formatCurrency(a);
}

async function openNachtragModal(nachtragId = null) {
    const modal = document.getElementById('nachtrag-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    currentNachtragPositionen = [];
    document.getElementById('nt-id').value = '';
    document.getElementById('nt-nr').value = 'N-01';
    document.getElementById('nt-titel').value = '';
    document.getElementById('nt-rechtsgrundlage').value = 'VOB_2_6';
    document.getElementById('nt-status').value = 'EINGEREICHT';
    document.getElementById('nt-begruendung').value = '';

    if (nachtragId && window.api && window.api.getNachtraege) {
        const list = await window.api.getNachtraege(window.currentViewProjektId);
        const n = list.find(x => x.id === nachtragId);
        if (n) {
            document.getElementById('nt-id').value = n.id;
            document.getElementById('nt-nr').value = n.nachtrag_nr;
            document.getElementById('nt-titel').value = n.titel;
            document.getElementById('nt-rechtsgrundlage').value = n.rechtsgrundlage || 'VOB_2_6';
            document.getElementById('nt-status').value = n.status || 'EINGEREICHT';
            document.getElementById('nt-begruendung').value = n.begruendung || '';
            currentNachtragPositionen = (n.positionen || []).map(p => ({ ...p }));
        }
    } else {
        currentNachtragPositionen.push({ oz_code: 'N1.01.0010', kurztext: 'Zusätzliche Dämmung', cost_type: 'MATERIAL', menge: 1, einheit: 'm²', einheitspreis: 45.00 });
    }

    renderNachtragPositionsTable();
}

function closeNachtragModal() {
    const modal = document.getElementById('nachtrag-modal');
    if (modal) modal.classList.add('hidden');
}

function addNachtragPositionRow() {
    currentNachtragPositionen.push({ oz_code: '', kurztext: '', cost_type: 'MATERIAL', menge: 1, einheit: 'Stk.', einheitspreis: 0 });
    renderNachtragPositionsTable();
}

function removeNachtragPositionRow(idx) {
    currentNachtragPositionen.splice(idx, 1);
    renderNachtragPositionsTable();
}

function renderNachtragPositionsTable() {
    const tbody = document.getElementById('nt-positionen-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    let totalNetto = 0;

    currentNachtragPositionen.forEach((p, idx) => {
        const gp = (parseFloat(p.menge) || 0) * (parseFloat(p.einheitspreis) || 0);
        totalNetto += gp;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-2 py-1.5"><input type="text" value="${p.oz_code || ''}" onchange="updateNachtragPos(${idx}, 'oz_code', this.value)" class="w-full px-2 py-1 border border-slate-200 rounded font-mono text-xs" placeholder="N1.01"></td>
            <td class="px-2 py-1.5"><input type="text" value="${p.kurztext || ''}" onchange="updateNachtragPos(${idx}, 'kurztext', this.value)" class="w-full px-2 py-1 border border-slate-200 rounded text-xs" placeholder="Bezeichnung"></td>
            <td class="px-2 py-1.5">
                <select onchange="updateNachtragPos(${idx}, 'cost_type', this.value)" class="w-full px-1 py-1 border border-slate-200 rounded text-xs">
                    <option value="MATERIAL" ${p.cost_type === 'MATERIAL' ? 'selected' : ''}>Material</option>
                    <option value="LOHN" ${p.cost_type === 'LOHN' ? 'selected' : ''}>Lohn</option>
                    <option value="GERÄT" ${p.cost_type === 'GERÄT' ? 'selected' : ''}>Gerät</option>
                    <option value="FAHRT" ${p.cost_type === 'FAHRT' ? 'selected' : ''}>Fahrt</option>
                </select>
            </td>
            <td class="px-2 py-1.5"><input type="number" step="0.01" value="${p.menge || 1}" oninput="updateNachtragPos(${idx}, 'menge', parseFloat(this.value) || 0)" class="w-full px-2 py-1 border border-slate-200 rounded text-center text-xs"></td>
            <td class="px-2 py-1.5"><input type="text" value="${p.einheit || 'Stk.'}" onchange="updateNachtragPos(${idx}, 'einheit', this.value)" class="w-full px-1 py-1 border border-slate-200 rounded text-center text-xs"></td>
            <td class="px-2 py-1.5"><input type="number" step="0.01" value="${p.einheitspreis || 0}" oninput="updateNachtragPos(${idx}, 'einheitspreis', parseFloat(this.value) || 0)" class="w-full px-2 py-1 border border-slate-200 rounded text-right text-xs"></td>
            <td class="px-2 py-1.5 text-right font-mono font-bold text-slate-800 text-xs">${formatCurrency(gp)}</td>
            <td class="px-1 py-1.5 text-center">
                <button type="button" onclick="removeNachtragPositionRow(${idx})" class="text-slate-400 hover:text-red-500">
                    <span class="material-symbols-outlined text-[16px]">close</span>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    const nettoEl = document.getElementById('nt-total-netto');
    const bruttoEl = document.getElementById('nt-total-brutto');
    if (nettoEl) nettoEl.innerText = formatCurrency(totalNetto);
    if (bruttoEl) bruttoEl.innerText = formatCurrency(totalNetto * 1.19);
}

function updateNachtragPos(idx, field, val) {
    if (currentNachtragPositionen[idx]) {
        currentNachtragPositionen[idx][field] = val;
        renderNachtragPositionsTable();
    }
}

async function saveNachtragData() {
    const id = document.getElementById('nt-id').value;
    const nachtrag_nr = document.getElementById('nt-nr').value || 'N-01';
    const titel = document.getElementById('nt-titel').value;
    const rechtsgrundlage = document.getElementById('nt-rechtsgrundlage').value;
    const status = document.getElementById('nt-status').value;
    const begruendung = document.getElementById('nt-begruendung').value;
    const project_id = window.currentViewProjektId;

    if (!titel) {
        showToast('Bitte geben Sie einen Titel für den Nachtrag ein.', 'warning');
        return;
    }

    const nachtragData = {
        id: id ? parseInt(id) : null,
        project_id,
        nachtrag_nr,
        titel,
        rechtsgrundlage,
        status,
        begruendung
    };

    try {
        await window.api.saveNachtrag(nachtragData, currentNachtragPositionen);
        showToast('Nachtrag erfolgreich gespeichert.', 'success');
        closeNachtragModal();
        loadProjektNachtraege(project_id);
    } catch (e) {
        console.error('Error saving nachtrag:', e);
        showToast('Fehler beim Speichern des Nachtrags.', 'error');
    }
}

async function updateNachtragStatusAction(nachtragId, status) {
    try {
        await window.api.updateNachtragStatus(nachtragId, status);
        showToast(`Nachtrags-Status auf "${status}" aktualisiert.`, 'success');
        loadProjektNachtraege(window.currentViewProjektId);
    } catch (e) {
        console.error('Error updating nachtrag status:', e);
    }
}

async function deleteNachtragAction(nachtragId) {
    const confirmed = await window.api.confirm({
        title: 'Nachtrag löschen',
        message: 'Möchten Sie diesen Nachtrag unwiderruflich löschen?'
    });
    if (confirmed) {
        await window.api.deleteNachtrag(nachtragId);
        showToast('Nachtrag gelöscht.', 'success');
        loadProjektNachtraege(window.currentViewProjektId);
    }
}



global.loadProjektNachtraege = loadProjektNachtraege;
global.updateNachtragSums = updateNachtragSums;
global.openNachtragModal = openNachtragModal;
global.closeNachtragModal = closeNachtragModal;
global.addNachtragPositionRow = addNachtragPositionRow;
global.removeNachtragPositionRow = removeNachtragPositionRow;
global.renderNachtragPositionsTable = renderNachtragPositionsTable;
global.updateNachtragPos = updateNachtragPos;
global.saveNachtragData = saveNachtragData;
global.updateNachtragStatusAction = updateNachtragStatusAction;
global.deleteNachtragAction = deleteNachtragAction;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        loadProjektNachtraege,
        updateNachtragSums,
        openNachtragModal,
        closeNachtragModal,
        addNachtragPositionRow,
        removeNachtragPositionRow,
        renderNachtragPositionsTable,
        updateNachtragPos,
        saveNachtragData,
        updateNachtragStatusAction,
        deleteNachtragAction
    };
}

})(typeof window !== 'undefined' ? window : this);
