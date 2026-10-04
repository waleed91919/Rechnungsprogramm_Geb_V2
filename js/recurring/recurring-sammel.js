(function() {
// --- Sammelrechnung Modal ---
async function openSammelModal() {
    window.drVorschauCache = await window.api.dauerrechnungenVorschau();

    const gruppen = window.DauerrechnungController
        ? window.DauerrechnungController.gruppiereFuerSammelrechnung(window.drVorschauCache.faellig)
        : new Map();
    const sel = document.getElementById('sammel-modal-empfaenger');
    sel.innerHTML = '<option value="">Bitte wählen...</option>';

    for (const [kundeId, liste] of gruppen.entries()) {
        if (liste.length < 2) continue;
        const kunde = (state.kunden || []).find(k => k.id === kundeId);
        const opt = document.createElement('option');
        opt.value = kundeId;
        opt.textContent = `${liste.length} Läufe – ${kunde ? kunde.name : '#' + kundeId}`;
        sel.appendChild(opt);
    }

    document.getElementById('sammel-laeufe-liste').innerHTML = '';
    document.getElementById('sammel-hinweis').textContent = 'Nur Empfänger mit mindestens 2 offenen Läufen werden angeboten.';
    document.getElementById('sammel-modal').classList.remove('hidden');
}

function closeSammelModal() {
    document.getElementById('sammel-modal').classList.add('hidden');
}

function renderSammelLaeufe() {
    const kundeId = parseInt(document.getElementById('sammel-modal-empfaenger').value);
    const container = document.getElementById('sammel-laeufe-liste');
    container.innerHTML = '';
    if (!kundeId) return;

    window.drVorschauCache.faellig
        .filter(e => e.empfaengerKundeId === kundeId)
        .forEach((eintrag, idx) => {
            const label = document.createElement('label');
            label.className = 'flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-50 cursor-pointer border border-slate-100 text-sm';
            label.innerHTML = `
                <input type="checkbox" class="dr-sammel-check rounded border-slate-300 text-primary focus:ring-primary" data-idx="${window.drVorschauCache.faellig.indexOf(eintrag)}" checked>
                <span class="flex-1"><strong>${eintrag.planName}</strong> <span class="text-slate-400">· ${eintrag.objektPfad}</span></span>
                <span class="text-xs text-slate-500">${formattiereKurz(eintrag.periodeVon)} – ${formattiereKurz(eintrag.periodeBis)}</span>`;
            container.appendChild(label);
        });
}

async function fuehreSammelrechnungAus() {
    const kundeId = parseInt(document.getElementById('sammel-modal-empfaenger').value);
    if (!kundeId) {
        showToast('Bitte einen Empfänger wählen.', 'error');
        return;
    }
    const ausgewaehlt = Array.from(document.querySelectorAll('#sammel-laeufe-liste .dr-sammel-check:checked'))
        .map(c => window.drVorschauCache.faellig[parseInt(c.dataset.idx)]);
    if (ausgewaehlt.length < 2) {
        showToast('Sammelrechnung benötigt mindestens 2 Läufe.', 'error');
        return;
    }

    try {
        const res = await window.api.generiereSammelrechnung({
            kundeId,
            laufIds: ausgewaehlt.map(e => ({ planId: e.planId, periodeVon: e.periodeVon, periodeBis: e.periodeBis, rechnungsDatum: e.rechnungsDatum }))
        });
        closeSammelModal();
        await refreshPlaeneState();
        renderDauerrechnungen();
        showToast(`Sammelrechnung ${res.nr} über ${formatCurrency(res.brutto)} erstellt.`, 'success');
    } catch (err) {
        showToast(err.message || String(err), 'error');
    }
}


    // Exports
    window.openSammelModal = openSammelModal;
    window.closeSammelModal = closeSammelModal;
    window.renderSammelLaeufe = renderSammelLaeufe;
    window.fuehreSammelrechnungAus = fuehreSammelrechnungAus;
})();
