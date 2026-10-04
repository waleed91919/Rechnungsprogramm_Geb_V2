(function() {
// --- Läufe-Panel ---
async function openLaeufePanel(planId) {
    window.laeufePanelPlanId = planId;
    const p = window.drPlaeneCache.find(x => x.id === planId);
    document.getElementById('laeufe-plan-name').textContent = p ? p.name : '';
    const laeufe = await window.api.getPlanLaeufe(planId);

    const tbody = document.getElementById('laeufe-table-body');
    tbody.innerHTML = '';
    laeufe.forEach(l => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-blue-50/50 transition-colors';

        const tdPeriode = document.createElement('td');
        tdPeriode.className = 'px-4 text-slate-600';
        tdPeriode.textContent = `${formattiereKurz(l.periode_von)} – ${formattiereKurz(l.periode_bis)}`;
        tr.appendChild(tdPeriode);

        const tdNr = document.createElement('td');
        tdNr.className = 'px-4 font-mono text-xs';
        if (l.dokumentNr) {
            const link = document.createElement('span');
            link.className = 'cursor-pointer text-primary hover:underline';
            link.textContent = l.dokumentNr;
            link.onclick = () => openRechnungModal(Number(dbIdVonLauf(l)));
            tdNr.appendChild(link);
        } else {
            tdNr.textContent = '–';
        }
        tr.appendChild(tdNr);

        const tdDatum = document.createElement('td');
        tdDatum.className = 'px-4 text-slate-600';
        tdDatum.textContent = formattiereKurz(l.rechnungs_datum);
        tr.appendChild(tdDatum);

        const tdFaellig = document.createElement('td');
        tdFaellig.className = 'px-4 text-slate-600';
        tdFaellig.textContent = formattiereKurz(l.faellig_am);
        tr.appendChild(tdFaellig);

        const tdBrutto = document.createElement('td');
        tdBrutto.className = 'px-4 text-right font-medium text-slate-800';
        tdBrutto.textContent = l.dokumentBrutto != null ? formatCurrency(l.dokumentBrutto) : '–';
        tr.appendChild(tdBrutto);

        const tdStatus = document.createElement('td');
        tdStatus.className = 'px-4 text-center';
        const storniert = l.status === 'STORNIERT';
        tdStatus.innerHTML = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${storniert ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'}">${l.status}</span>`;
        tr.appendChild(tdStatus);

        const tdAction = document.createElement('td');
        tdAction.className = 'px-4 text-right';
        if (l.status === 'ERSTELLT') {
            const btn = document.createElement('button');
            btn.title = 'Stornieren';
            btn.className = 'text-slate-400 hover:text-red-500 transition-colors';
            btn.onclick = () => openStornoLaufModal(l.id);
            btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">cancel</span>';
            tdAction.appendChild(btn);
        }
        tr.appendChild(tdAction);

        tbody.appendChild(tr);
    });

    document.getElementById('laeufe-panel').classList.remove('hidden');
}

function dbIdVonLauf(l) {
    return l.dokument_id;
}

function closeLaeufePanel() {
    document.getElementById('laeufe-panel').classList.add('hidden');
    window.laeufePanelPlanId = null;
}

// --- Storno ---
function openStornoLaufModal(laufId) {
    window.stornoLaufCurrentId = laufId;
    document.getElementById('storno-lauf-grund').value = '';
    document.getElementById('storno-lauf-modal').classList.remove('hidden');
    document.getElementById('storno-lauf-grund').focus();
}

function closeStornoLaufModal() {
    document.getElementById('storno-lauf-modal').classList.add('hidden');
    window.stornoLaufCurrentId = null;
}

async function bestaetigeStornoLauf() {
    const grund = document.getElementById('storno-lauf-grund').value.trim();
    if (!grund) {
        showToast('Storno ohne Begründung nicht erlaubt (GoBD).', 'error');
        return;
    }
    try {
        const res = await window.api.storniereLauf(window.stornoLaufCurrentId, grund);
        closeStornoLaufModal();
        await refreshPlaeneState();
        renderDauerrechnungen();
        if (window.laeufePanelPlanId) await openLaeufePanel(window.laeufePanelPlanId);
        showToast(res.dokumentStorniert ? 'Lauf storniert und Beleg entfernt/storniert.' : 'Lauf storniert.', 'success');
    } catch (err) {
        showToast(err.message || String(err), 'error');
    }
}

// --- Generierung Vorschau ---
window.drVorschauCache = window.drVorschauCache || [];

async function openGenerierungModal() {
    window.drVorschauCache = await window.api.dauerrechnungenVorschau();
    const liste = document.getElementById('generierung-liste');
    liste.innerHTML = '';

    let letzterEmpfaenger = null;
    window.drVorschauCache.faellig.forEach((eintrag, idx) => {
        if (eintrag.empfaengerKundeId !== letzterEmpfaenger) {
            letzterEmpfaenger = eintrag.empfaengerKundeId;
            const gruppenHeader = document.createElement('div');
            gruppenHeader.className = 'pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100';
            gruppenHeader.textContent = `Empfänger: ${eintrag.empfaengerName || '#' + eintrag.empfaengerKundeId}`;
            liste.appendChild(gruppenHeader);
        }

        const label = document.createElement('label');
        label.className = 'flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-50 cursor-pointer border border-slate-100';
        label.innerHTML = `
            <input type="checkbox" class="dr-gen-check rounded border-slate-300 text-primary focus:ring-primary" data-idx="${idx}" data-netto="${eintrag.nettoErwartet}" checked>
            <span class="flex-1 text-sm"><strong>${eintrag.planName}</strong> <span class="text-slate-400">· ${eintrag.objektPfad}</span></span>
            <span class="text-xs text-slate-500">${formattiereKurz(eintrag.periodeVon)} – ${formattiereKurz(eintrag.periodeBis)}</span>
            <span class="text-sm font-semibold text-slate-700 w-24 text-right">${formatCurrency(eintrag.nettoErwartet)}</span>`;
        label.querySelector('input').onchange = updateGenerierungSumme;
        liste.appendChild(label);
    });

    document.getElementById('generierung-leer').classList.toggle('hidden', window.drVorschauCache.faellig.length > 0);
    document.getElementById('generierung-ergebnis').classList.add('hidden');
    updateGenerierungSumme();
    document.getElementById('generierung-modal').classList.remove('hidden');
}

function closeGenerierungModal() {
    document.getElementById('generierung-modal').classList.add('hidden');
}

function updateGenerierungSumme() {
    let summe = 0;
    let count = 0;
    document.querySelectorAll('#generierung-liste .dr-gen-check:checked').forEach(c => {
        summe += parseFloat(c.dataset.netto) || 0;
        count++;
    });
    document.getElementById('generierung-summe').textContent = formatCurrency(summe);
    const btn = document.querySelector('#generierung-modal button[onclick="fuehreGenerierungAus()"]');
    if (btn) btn.textContent = `${count} Rechnungen jetzt erstellen`;
}

async function fuehreGenerierungAus() {
    const planIds = [...new Set(Array.from(document.querySelectorAll('#generierung-liste .dr-gen-check:checked')).map(c => window.drVorschauCache.faellig[parseInt(c.dataset.idx)].planId))];
    const sammelModus = document.querySelector('input[name="generierung-art"]:checked')?.value === 'sammel';

    if (planIds.length === 0) {
        showToast('Bitte mindestens einen Lauf auswählen.', 'error');
        return;
    }

    try {
        const res = await window.api.generiereFaelligeRechnungen({ planIds, sammelProKunde: sammelModus });
        const ergebnisBox = document.getElementById('generierung-ergebnis');
        const zeilen = [];
        res.sammelrechnungen.forEach(s => zeilen.push(`<div>✓ Sammelrechnung <strong>${s.nr}</strong> für Kunde #${s.kundeId} (${s.anzahlLaeufe} Läufe, ${formatCurrency(s.brutto)})</div>`));
        res.erstellt.forEach(e => zeilen.push(`<div>✓ <strong>${e.nr}</strong> – ${formatCurrency(e.brutto)}</div>`));
        res.uebersprungen.forEach(u => zeilen.push(`<div class="text-red-600">✗ Plan #${u.planId}: ${u.grund}</div>`));
        ergebnisBox.innerHTML = zeilen.join('');
        ergebnisBox.classList.remove('hidden');

        await refreshPlaeneState();
        renderDauerrechnungen();
        window.drVorschauCache = await window.api.dauerrechnungenVorschau();
        showToast(`${res.erstellt.length} Rechnung(en) erstellt.`, 'success');
    } catch (err) {
        showToast(err.message || String(err), 'error');
    }
}


    // Exports
    window.openLaeufePanel = openLaeufePanel;
    window.dbIdVonLauf = dbIdVonLauf;
    window.closeLaeufePanel = closeLaeufePanel;
    window.openStornoLaufModal = openStornoLaufModal;
    window.closeStornoLaufModal = closeStornoLaufModal;
    window.bestaetigeStornoLauf = bestaetigeStornoLauf;
    window.openGenerierungModal = openGenerierungModal;
    window.closeGenerierungModal = closeGenerierungModal;
    window.updateGenerierungSumme = updateGenerierungSumme;
    window.fuehreGenerierungAus = fuehreGenerierungAus;
})();
