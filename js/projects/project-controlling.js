(function(global) {

async function loadProjektControlling(projectId) {
    if (!window.api || !window.api.getControllingStats) return;
    try {
        const stats = await window.api.getControllingStats(projectId);
        if (stats) {
            document.getElementById('ctrl-soll-gesamt').innerText = formatCurrency(stats.gesamtAuftragsvolumen);
            document.getElementById('ctrl-ist-gesamt').innerText = formatCurrency(stats.istKosten.gesamt);
            
            const dbEl = document.getElementById('ctrl-deckungsbeitrag');
            dbEl.innerText = formatCurrency(stats.deckungsbeitrag);
            dbEl.className = `text-2xl font-bold ${stats.deckungsbeitrag >= 0 ? 'text-emerald-600' : 'text-red-500'}`;

            document.getElementById('ctrl-marge-prozent').innerText = `${stats.margeProzent.toFixed(1)}%`;
            document.getElementById('ctrl-ist-lohn').innerText = formatCurrency(stats.istKosten.lohn);
            document.getElementById('ctrl-ist-material').innerText = formatCurrency(stats.istKosten.material);
            document.getElementById('ctrl-ist-sub').innerText = formatCurrency(stats.istKosten.subcontractor);
            document.getElementById('ctrl-ist-geraet').innerText = formatCurrency(stats.istKosten.geraet + stats.istKosten.sonstiges);
            document.getElementById('ctrl-bauabzug-gesamt').innerText = formatCurrency(stats.istKosten.bauabzugsteuer);
        }

        // Eingangsrechnungen Tabelle
        const erList = await window.api.getEingangsrechnungen(projectId);
        const tbody = document.getElementById('pd-eingangsrechnungen-body');
        const empty = document.getElementById('pd-eingangsrechnungen-empty');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!erList || erList.length === 0) {
            if (empty) empty.classList.remove('hidden');
            return;
        }
        if (empty) empty.classList.add('hidden');

        erList.forEach(er => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 transition-colors';

            let sec48bBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">Kein Sub</span>';
            if (er.kostenart === 'SUBCONTRACTOR') {
                if (er.bauabzugsteuer_einbehalten > 0) {
                    sec48bBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800" title="15% Bauabzugsteuer einbehalten: ${formatCurrency(er.bauabzugsteuer_einbehalten)}">15% Einbehalt</span>`;
                } else {
                    sec48bBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">§ 48b Gültig</span>';
                }
            }

            tr.innerHTML = `
                <td class="px-4 py-3 font-mono font-bold text-slate-800">${er.rechnungs_nr}</td>
                <td class="px-4 py-3 font-semibold text-slate-700">${er.lieferant_name || 'Lieferant'}</td>
                <td class="px-4 py-3 text-slate-500 text-xs">${new Date(er.rechnungs_datum).toLocaleDateString()}</td>
                <td class="px-4 py-3 text-xs uppercase font-bold text-slate-600">${er.kostenart}</td>
                <td class="px-4 py-3 text-right font-mono">${formatCurrency(er.betrag_netto)}</td>
                <td class="px-4 py-3 text-right font-mono font-bold">${formatCurrency(er.betrag_brutto)}</td>
                <td class="px-4 py-3 text-center">${sec48bBadge}</td>
                <td class="px-4 py-3 text-right">
                    <button onclick="deleteEingangsrechnungAction(${er.id})" class="p-1.5 hover:bg-red-50 text-red-600 rounded" title="Löschen">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error('Error loading controlling:', e);
    }
}

async function openEingangsrechnungModal() {
    const modal = document.getElementById('eingangsrechnung-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    document.getElementById('er-id').value = '';
    document.getElementById('er-nr').value = '';
    document.getElementById('er-datum').value = new Date().toISOString().split('T')[0];
    document.getElementById('er-faellig').value = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    document.getElementById('er-netto').value = '';
    document.getElementById('er-ust-satz').value = '19';
    document.getElementById('er-brutto').value = '';
    document.getElementById('er-sec48b-warnbox').classList.add('hidden');

    // Populate Lieferanten Select
    const select = document.getElementById('er-lieferant');
    select.innerHTML = '<option value="">-- Lieferant / Subunternehmer wählen --</option>';
    (state.kunden || []).forEach(k => {
        const opt = document.createElement('option');
        opt.value = k.id;
        opt.textContent = `${k.name} ${k.is_subcontractor ? '(Subunternehmer)' : ''}`;
        select.appendChild(opt);
    });
}

function closeEingangsrechnungModal() {
    const modal = document.getElementById('eingangsrechnung-modal');
    if (modal) modal.classList.add('hidden');
}

function calculateERBrutto() {
    const netto = parseFloat(document.getElementById('er-netto').value) || 0;
    const satz = parseFloat(document.getElementById('er-ust-satz').value) || 19;
    const brutto = netto * (1 + satz / 100);
    document.getElementById('er-brutto').value = brutto.toFixed(2);
    checkSubcontractorWarningInModal();
}

function checkSubcontractorWarningInModal() {
    const lieferantId = parseInt(document.getElementById('er-lieferant').value, 10);
    const kostenart = document.getElementById('er-kostenart').value;
    const warnBox = document.getElementById('er-sec48b-warnbox');

    if (!lieferantId || kostenart !== 'SUBCONTRACTOR') {
        warnBox.classList.add('hidden');
        return;
    }

    const lieferant = state.kunden.find(k => k.id === lieferantId);
    if (lieferant && lieferant.is_subcontractor) {
        const today = new Date().toISOString().split('T')[0];
        const isValid = lieferant.sec48b_status === 'VALID' && (!lieferant.sec48b_valid_until || lieferant.sec48b_valid_until >= today);
        if (!isValid) {
            warnBox.classList.remove('hidden');
            return;
        }
    }
    warnBox.classList.add('hidden');
}

async function saveEingangsrechnungData() {
    const pId = window.currentViewProjektId;
    const lieferant_id = parseInt(document.getElementById('er-lieferant').value, 10);
    const rechnungs_nr = document.getElementById('er-nr').value;
    const rechnungs_datum = document.getElementById('er-datum').value;
    const faelligkeits_datum = document.getElementById('er-faellig').value;
    const betrag_netto = parseFloat(document.getElementById('er-netto').value) || 0;
    const steuersatz = parseFloat(document.getElementById('er-ust-satz').value) || 19;
    const kostenart = document.getElementById('er-kostenart').value;

    if (!rechnungs_nr || betrag_netto <= 0) {
        showToast('Bitte geben Sie eine Rechnungsnummer und einen gültigen Betrag ein.', 'warning');
        return;
    }

    const rechnungData = {
        project_id: pId,
        lieferant_id: lieferant_id || null,
        rechnungs_nr,
        rechnungs_datum,
        faelligkeits_datum,
        betrag_netto,
        steuersatz,
        kostenart
    };

    try {
        const res = await window.api.saveEingangsrechnung(rechnungData);
        if (res && res.bauabzugsteuer > 0) {
            showToast(`Eingangsrechnung gespeichert. 15% Bauabzugsteuer (${formatCurrency(res.bauabzugsteuer)}) einbehalten!`, 'warning');
        } else {
            showToast('Eingangsrechnung erfolgreich gespeichert.', 'success');
        }
        closeEingangsrechnungModal();
        loadProjektControlling(pId);
    } catch (e) {
        console.error('Error saving eingangsrechnung:', e);
        showToast('Fehler beim Speichern der Eingangsrechnung.', 'error');
    }
}

async function deleteEingangsrechnungAction(erId) {
    const confirmed = await window.api.confirm({
        title: 'Eingangsrechnung löschen',
        message: 'Möchten Sie diesen Beleg wirklich löschen?'
    });
    if (confirmed) {
        await window.api.deleteEingangsrechnung(erId);
        showToast('Eingangsrechnung gelöscht.', 'success');
        loadProjektControlling(window.currentViewProjektId);
    }
}



global.loadProjektControlling = loadProjektControlling;
global.openEingangsrechnungModal = openEingangsrechnungModal;
global.closeEingangsrechnungModal = closeEingangsrechnungModal;
global.calculateERBrutto = calculateERBrutto;
global.checkSubcontractorWarningInModal = checkSubcontractorWarningInModal;
global.saveEingangsrechnungData = saveEingangsrechnungData;
global.deleteEingangsrechnungAction = deleteEingangsrechnungAction;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        loadProjektControlling,
        openEingangsrechnungModal,
        closeEingangsrechnungModal,
        calculateERBrutto,
        checkSubcontractorWarningInModal,
        saveEingangsrechnungData,
        deleteEingangsrechnungAction
    };
}

})(typeof window !== 'undefined' ? window : this);
