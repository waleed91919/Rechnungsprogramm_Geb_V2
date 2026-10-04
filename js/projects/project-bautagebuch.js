(function(global) {

function selectWeatherQuick(wetterStr) {
    const input = document.getElementById('bautagebuch-wetter');
    if (input) {
        input.value = wetterStr;
        showToast(`Wetter "${wetterStr}" übernommen.`, 'success');
    }
}

async function loadProjektBautagebuch(projectId) {
    const text = value => String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
    if (!window.api || !window.api.getBautagebuch) return;
    try {
        const list = await window.api.getBautagebuch(projectId);
        const container = document.getElementById('pd-bautagebuch-list');
        if (!container) return;
        container.innerHTML = '';

        if (!list || list.length === 0) {
            container.innerHTML = '<p class="text-xs text-slate-400 italic">Noch keine Tagesberichte erfasst.</p>';
            return;
        }

        list.forEach(item => {
            const card = document.createElement('div');
            card.className = 'p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col gap-2';
            card.innerHTML = `
                <div class="flex justify-between items-center text-xs">
                    <span class="font-bold text-slate-800 flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-[16px] text-amber-600">calendar_today</span>
                        ${new Date(item.datum).toLocaleDateString()}
                    </span>
                    <span class="text-slate-500 font-medium">${text(item.wetter || 'Kein Wetter erfasst')} | ${text(item.personal_eigen_anzahl || 0)} Arbeiter (${text(item.personal_eigen_stunden || 0)}h)</span>
                </div>
                <p class="text-sm text-slate-700 leading-relaxed">${text(item.tagesbericht || '')}</p>
                ${item.vorkommnisse_behinderungen ? `<div class="p-2 bg-amber-100/60 rounded text-xs text-amber-900 font-medium">⚠️ Behinderung/Bedenken: ${text(item.vorkommnisse_behinderungen)}</div>` : ''}
            `;
            container.appendChild(card);
        });
    } catch (e) {
        console.error('Error loading bautagebuch:', e);
    }
}

async function saveBautagebuchEntry() {
    const pId = window.currentViewProjektId;
    const datum = document.getElementById('bautagebuch-datum')?.value || new Date().toISOString().split('T')[0];
    const wetter = document.getElementById('bautagebuch-wetter')?.value || '';
    const arbeiter = parseInt(document.getElementById('bautagebuch-arbeiter')?.value, 10) || 0;
    const stunden = parseFloat(document.getElementById('bautagebuch-stunden')?.value) || (arbeiter * 8);
    const geraete = document.getElementById('bautagebuch-geraete')?.value || '';
    const notiz = document.getElementById('bautagebuch-notiz')?.value || '';
    const behinderungen = document.getElementById('bautagebuch-behinderungen')?.value || '';

    if (!notiz && !wetter && !arbeiter) {
        showToast('Bitte erfassen Sie mindestens die Tagesleistungen oder das Wetter.', 'warning');
        return;
    }

    const entry = {
        project_id: pId,
        datum,
        wetter,
        personal_eigen_anzahl: arbeiter,
        personal_eigen_stunden: stunden,
        geraete_json: geraete ? [{ geraet: geraete, stunden: 8 }] : [],
        tagesbericht: notiz,
        vorkommnisse_behinderungen: behinderungen
    };

    try {
        await window.api.saveBautagebuch(entry);
        showToast('Bautagebuch-Eintrag erfolgreich gespeichert.', 'success');
        if (document.getElementById('bautagebuch-notiz')) document.getElementById('bautagebuch-notiz').value = '';
        if (document.getElementById('bautagebuch-behinderungen')) document.getElementById('bautagebuch-behinderungen').value = '';
        loadProjektBautagebuch(pId);
    } catch (e) {
        console.error('Error saving bautagebuch:', e);
        showToast('Fehler beim Speichern des Tagesberichts.', 'error');
    }
}

async function loadProjektAbnahmen(projectId) {
    if (!window.api || !window.api.getAbnahmeprotokolle) return;
    try {
        const list = await window.api.getAbnahmeprotokolle(projectId);
        const container = document.getElementById('pd-abnahmen-container');
        if (!container) return;
        container.innerHTML = '';

        if (!list || list.length === 0) {
            container.innerHTML = '<p class="text-xs text-slate-400 italic">Noch kein Abnahmeprotokoll für dieses Projekt erstellt.</p>';
            return;
        }

        list.forEach(a => {
            const card = document.createElement('div');
            card.className = 'p-5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col gap-3';
            let statusPill = 'bg-emerald-100 text-emerald-800';
            if (a.abnahme_status === 'VERWEIGERT') statusPill = 'bg-red-100 text-red-800';
            else if (a.abnahme_status === 'MIT_VORBEHALT') statusPill = 'bg-amber-100 text-amber-800';

            card.innerHTML = `
                <div class="flex justify-between items-center">
                    <div>
                        <h4 class="font-bold text-slate-800 text-base">Förmliche Bauabnahme vom ${new Date(a.datum).toLocaleDateString()}</h4>
                        <p class="text-xs text-slate-500">Ort: ${a.ort || '-'} | AG: ${a.auftraggeber_vertreter} | AN: ${a.auftragnehmer_vertreter}</p>
                    </div>
                    <span class="px-3 py-1 rounded-full text-xs font-bold uppercase ${statusPill}">${a.abnahme_status.replace(/_/g, ' ')}</span>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-white p-3 rounded-lg border border-slate-200">
                    <div><span class="text-slate-400 block">Gewährleistungsbeginn:</span> <strong>${a.gewaehrleistung_beginn || a.datum}</strong></div>
                    <div><span class="text-slate-400 block">Gewährleistungsende:</span> <strong>${a.gewaehrleistung_ende}</strong> (${a.gewaehrleistung_jahre || 4} Jahre)</div>
                    <div><span class="text-slate-400 block">Sicherheitseinbehalt:</span> <strong>${a.sicherheitseinbehalt_prozent || 5}%</strong></div>
                    <div><span class="text-slate-400 block">Signaturen:</span> <strong>${a.unterschrift_ag_data ? '✓ AG signiert' : '-'} / ${a.unterschrift_an_data ? '✓ AN signiert' : '-'}</strong></div>
                </div>
            `;
            container.appendChild(card);
        });
    } catch (e) {
        console.error('Error loading abnahmen:', e);
    }
}

function openAbnahmeModal() {
    const modal = document.getElementById('abnahme-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    currentMaengelList = [];
    document.getElementById('abn-id').value = '';
    document.getElementById('abn-datum').value = new Date().toISOString().split('T')[0];
    document.getElementById('abn-ort').value = 'Baustelle';
    document.getElementById('abn-status').value = 'OHNE_VORBEHALT';
    document.getElementById('abn-ag-vertreter').value = '';
    document.getElementById('abn-an-vertreter').value = 'Bauleiter';

    renderMaengelList();
    initSignCanvas('signature-ag');
    initSignCanvas('signature-an');
}

function closeAbnahmeModal() {
    const modal = document.getElementById('abnahme-modal');
    if (modal) modal.classList.add('hidden');
}

function addMangelRow() {
    currentMaengelList.push({ mangel: '', frist: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0], status: 'OFFEN' });
    renderMaengelList();
}

function removeMangelRow(idx) {
    currentMaengelList.splice(idx, 1);
    renderMaengelList();
}

function renderMaengelList() {
    const container = document.getElementById('abn-maengel-list');
    if (!container) return;
    container.innerHTML = '';

    currentMaengelList.forEach((m, idx) => {
        const div = document.createElement('div');
        div.className = 'flex gap-2 items-center';
        div.innerHTML = `
            <input type="text" value="${m.mangel || ''}" onchange="currentMaengelList[${idx}].mangel = this.value" placeholder="Mangelbeschreibung (z.B. Kratzer an Türzarge EG links)" class="flex-1 px-3 py-1.5 border border-slate-300 rounded text-xs">
            <input type="date" value="${m.frist || ''}" onchange="currentMaengelList[${idx}].frist = this.value" class="px-2 py-1.5 border border-slate-300 rounded text-xs">
            <button type="button" onclick="removeMangelRow(${idx})" class="text-slate-400 hover:text-red-500 p-1">
                <span class="material-symbols-outlined text-[18px]">close</span>
            </button>
        `;
        container.appendChild(div);
    });
}

function initSignCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;

    let drawing = false;

    const startDraw = (e) => {
        drawing = true;
        ctx.beginPath();
        const rect = canvas.getBoundingClientRect();
        ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    };

    const draw = (e) => {
        if (!drawing) return;
        const rect = canvas.getBoundingClientRect();
        ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
        ctx.stroke();
    };

    const stopDraw = () => { drawing = false; };

    canvas.onmousedown = startDraw;
    canvas.onmousemove = draw;
    canvas.onmouseup = stopDraw;
    canvas.onmouseleave = stopDraw;
}

function clearCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

async function saveAbnahmeprotokollData() {
    const pId = window.currentViewProjektId;
    const datum = document.getElementById('abn-datum').value || new Date().toISOString().split('T')[0];
    const ort = document.getElementById('abn-ort').value || 'Baustelle';
    const abnahme_status = document.getElementById('abn-status').value;
    const auftraggeber_vertreter = document.getElementById('abn-ag-vertreter').value;
    const auftragnehmer_vertreter = document.getElementById('abn-an-vertreter').value;

    if (!auftraggeber_vertreter || !auftragnehmer_vertreter) {
        showToast('Bitte geben Sie die Namen beider Vertreter an.', 'warning');
        return;
    }

    const gewaehrleistung_ende = window.BautagebuchController ? window.BautagebuchController.calculateWarrantyEndDate(datum, 4) : '';

    const canvasAg = document.getElementById('signature-ag');
    const canvasAn = document.getElementById('signature-an');

    const abnahmeData = {
        project_id: pId,
        datum,
        ort,
        abnahme_status,
        auftraggeber_vertreter,
        auftragnehmer_vertreter,
        gewaehrleistung_beginn: datum,
        gewaehrleistung_ende,
        gewaehrleistung_jahre: 4,
        sicherheitseinbehalt_prozent: 5.0,
        maengel_json: currentMaengelList,
        unterschrift_ag_data: canvasAg ? canvasAg.toDataURL() : '',
        unterschrift_an_data: canvasAn ? canvasAn.toDataURL() : ''
    };

    try {
        await window.api.saveAbnahmeprotokoll(abnahmeData);
        showToast('Abnahmeprotokoll erfolgreich abgeschlossen.', 'success');
        closeAbnahmeModal();
        loadProjektAbnahmen(pId);
    } catch (e) {
        console.error('Error saving abnahmeprotokoll:', e);
        showToast('Fehler beim Speichern des Abnahmeprotokolls.', 'error');
    }
}



global.selectWeatherQuick = selectWeatherQuick;
global.loadProjektBautagebuch = loadProjektBautagebuch;
global.saveBautagebuchEntry = saveBautagebuchEntry;
global.loadProjektAbnahmen = loadProjektAbnahmen;
global.openAbnahmeModal = openAbnahmeModal;
global.closeAbnahmeModal = closeAbnahmeModal;
global.addMangelRow = addMangelRow;
global.removeMangelRow = removeMangelRow;
global.renderMaengelList = renderMaengelList;
global.initSignCanvas = initSignCanvas;
global.clearCanvas = clearCanvas;
global.saveAbnahmeprotokollData = saveAbnahmeprotokollData;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        selectWeatherQuick,
        loadProjektBautagebuch,
        saveBautagebuchEntry,
        loadProjektAbnahmen,
        openAbnahmeModal,
        closeAbnahmeModal,
        addMangelRow,
        removeMangelRow,
        renderMaengelList,
        initSignCanvas,
        clearCanvas,
        saveAbnahmeprotokollData
    };
}

})(typeof window !== 'undefined' ? window : this);
