(function() {
// --- Plan-Modal ---
window.PLAN_ELTERN_KONFIG = [
    { typ: 'LIEGENSCHAFT', liste: 'liegenschaften' },
    { typ: 'GEBAEUDE', liste: 'gebaeude' },
    { typ: 'ETAGE', liste: 'etagen' },
    { typ: 'RAUM', liste: 'raeume' }
];

async function openPlanModal(planId = null, objektVorbelegung = null) {
    const form = document.getElementById('plan-form');
    form.reset();
    document.getElementById('plan-modal-id').value = planId || '';
    document.getElementById('plan-modal-title').innerText = planId ? 'Abrechnungsplan bearbeiten' : 'Abrechnungsplan anlegen';

    const monatSel = document.getElementById('plan-modal-abrechnungsmonat');
    if (monatSel && monatSel.options.length === 0) {
        const monate = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
        monate.forEach((name, idx) => {
            const opt = document.createElement('option');
            opt.value = idx + 1;
            opt.textContent = name;
            monatSel.appendChild(opt);
        });
    }

    const objektSel = document.getElementById('plan-modal-objekt');
    objektSel.innerHTML = '';
    if (!state.objekte) await refreshObjekteState();
    const OC = window.ObjektController;
    window.PLAN_ELTERN_KONFIG.forEach(({ typ, liste }) => {
        (state.objekte[liste] || []).forEach(knoten => {
            const opt = document.createElement('option');
            opt.value = `${typ}:${knoten.id}`;
            opt.textContent = `[${OBJEKT_TYP_LABEL[typ]}] ${OC.buildPfad(typ, knoten.id, state.objekte)}`;
            objektSel.appendChild(opt);
        });
    });
    objektSel.disabled = false;

    const zZielInput = document.getElementById('plan-modal-zahlungsziel');
    if (!planId) zZielInput.value = parseInt(state.einstellungen.zahlungsziel) || 14;

    let empfaengerPreviewKunde = null;

    if (planId) {
        const p = window.drPlaeneCache.find(x => x.id === planId) || (await refreshPlaeneState()).find(x => x.id === planId);
        if (p) {
            document.getElementById('plan-modal-name').value = p.name;
            document.getElementById('plan-modal-rhythmus').value = p.rhythmus;
            document.getElementById('plan-modal-abrechnungstag').value = p.abrechnungstag || 1;
            if (p.abrechnungsmonat) monatSel.value = String(p.abrechnungsmonat);
            if (p.intervall_wochen) document.getElementById('plan-modal-intervall-wochen').value = p.intervall_wochen;
            document.querySelector(`input[name="plan-modus"][value="${p.abrechnungs_modus}"]`).checked = true;
            document.getElementById('plan-modal-start').value = p.start_datum;
            document.getElementById('plan-modal-ende').value = p.ende_datum || '';
            document.querySelector(`input[name="plan-preis-modus"][value="${p.preis_modus}"]`).checked = true;
            document.getElementById('plan-modal-pauschale-netto').value = p.pauschale_netto || '';
            document.getElementById('plan-modal-mwst').value = String(p.mwst_satz ?? 19);
            document.getElementById('plan-modal-zahlungsziel').value = p.zahlungsziel_tage ?? 14;
            document.getElementById('plan-modal-als-entwurf').checked = p.als_entwurf !== 0;
            document.getElementById('plan-modal-preise-live').checked = Number(p.preise_live) === 1;
            document.getElementById('plan-modal-bemerkung').value = p.bemerkung || '';

            objektSel.value = `${p.objekt_typ}:${p.objekt_id}`;
            objektSel.disabled = true;

            const kunde = (state.kunden || []).find(k => k.id === p.empfaenger_kunde_id);
            empfaengerPreviewKunde = kunde ? `${kunde.kundennummer ? kunde.kundennummer + ' – ' : ''}${kunde.name}` : '#' + p.empfaenger_kunde_id;

            renderPlanPositionenRows(p.positionen || []);
        }
    } else if (objektVorbelegung) {
        objektSel.value = objektVorbelegung;
        objektSel.disabled = true;
    } else {
        renderPlanPositionenRows([]);
    }

    togglePlanRhythmusFelder();
    togglePlanPreisModus();
    updatePlanEmpfaengerPreview(empfaengerPreviewKunde);
    document.getElementById('plan-modal').classList.remove('hidden');
    document.getElementById('plan-modal-name').focus();
}

function closePlanModal() {
    document.getElementById('plan-modal').classList.add('hidden');
}

function togglePlanRhythmusFelder() {
    const r = document.getElementById('plan-modal-rhythmus').value;
    document.getElementById('plan-modal-tag-wrap').classList.toggle('hidden', r === 'WOCHEN_INTERVALL');
    document.getElementById('plan-modal-monat-wrap').classList.toggle('hidden', r !== 'JAEHRLICH');
    document.getElementById('plan-modal-wochen-wrap').classList.toggle('hidden', r !== 'WOCHEN_INTERVALL');
}

function togglePlanPreisModus() {
    const modus = document.querySelector('input[name="plan-preis-modus"]:checked')?.value || 'PAUSCHALE';
    document.getElementById('plan-modal-pauschale-wrap').classList.toggle('hidden', modus !== 'PAUSCHALE');
    document.getElementById('plan-modal-positionen-wrap').classList.toggle('hidden', modus !== 'POSITIONEN');
    document.getElementById('plan-modal-preise-live-wrap').classList.toggle('hidden', modus !== 'POSITIONEN');
    if (modus === 'POSITIONEN' && document.getElementById('plan-modal-positionen-body').children.length === 0) {
        addPlanPosition();
    }
}

function updatePlanEmpfaengerPreview(festerText = null) {
    const preview = document.getElementById('plan-modal-empfaenger-preview');
    if (festerText) {
        preview.innerHTML = `<span class="material-symbols-outlined text-[14px] align-text-bottom">domain</span> Empfänger: <strong>${festerText}</strong> (aus Objektstamm übernommen)`;
        preview.className = 'text-xs mt-1.5 text-emerald-700';
        return;
    }
    const wert = document.getElementById('plan-modal-objekt').value;
    if (!wert) {
        preview.textContent = '';
        return;
    }
    const [typ, idStr] = wert.split(':');
    const OC = window.ObjektController;
    const empf = OC.resolveEmpfaenger(typ, parseInt(idStr), state.objekte);
    if (empf && empf.kundeId) {
        const kunde = (state.kunden || []).find(k => k.id === empf.kundeId);
        const artLabel = empf.art ? ` · ${OBJEKT_ART_LABEL[empf.art] || empf.art}` : '';
        if (empf.direkt) {
            preview.innerHTML = `<span class="material-symbols-outlined text-[14px] align-text-bottom">domain</span> Eigentümer/Empfänger: <strong>${kunde ? kunde.name : '#' + empf.kundeId}</strong>${artLabel} (direkt am Objekt)`;
            preview.className = 'text-xs mt-1.5 text-emerald-700';
        } else {
            preview.innerHTML = `<span class="material-symbols-outlined text-[14px] align-text-bottom">domain</span> Empfänger: <strong>${kunde ? kunde.name : '#' + empf.kundeId}</strong>${artLabel} — geerbt von ${OBJEKT_TYP_LABEL[empf.quelle] || empf.quelle}`;
            preview.className = 'text-xs mt-1.5 text-amber-700';
        }
    } else {
        preview.innerHTML = '<span class="material-symbols-outlined text-[14px] align-text-bottom">warning</span> Kein Rechnungsempfänger ermittelbar – Plan kann nicht gespeichert werden.';
        preview.className = 'text-xs mt-1.5 text-red-600 font-medium';
    }
}

function addPlanPosition(vorlage = {}) {
    const tbody = document.getElementById('plan-modal-positionen-body');
    const tr = document.createElement('tr');

    const tdArtikel = document.createElement('td');
    tdArtikel.className = 'px-2 py-1';
    const sel = document.createElement('select');
    sel.className = 'dr-pos-artikel w-full px-1.5 py-1 border border-slate-200 rounded text-xs bg-white';
    sel.onchange = function () {
        const art = (state.artikel || []).find(a => a.id === parseInt(this.value));
        const zeile = this.closest('tr');
        if (art) {
            zeile.querySelector('.dr-pos-preis').value = art.vk != null ? art.vk : '';
            zeile.querySelector('.dr-pos-einheit').value = art.kostenart === 'LOHN' ? 'Std.' : 'Stk.';
            zeile.querySelector('.dr-pos-mwst').value = String(art.mwst ?? 19);
        }
    };
    const optLeer = document.createElement('option');
    optLeer.value = '';
    optLeer.textContent = 'Freitext...';
    sel.appendChild(optLeer);
    (state.artikel || []).forEach(a => {
        const o = document.createElement('option');
        o.value = a.id;
        o.textContent = a.name;
        sel.appendChild(o);
    });
    if (vorlage.artikelId) sel.value = String(vorlage.artikelId);
    tdArtikel.appendChild(sel);
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Bezeichnung';
    nameInput.className = 'dr-pos-name w-full mt-1 px-1.5 py-1 border border-slate-200 rounded text-xs';
    nameInput.value = vorlage.name || '';
    tdArtikel.appendChild(nameInput);
    tr.appendChild(tdArtikel);

    const tdMenge = document.createElement('td');
    tdMenge.className = 'px-2 py-1';
    tdMenge.innerHTML = `<input type="number" min="0" step="0.01" value="${vorlage.menge != null ? vorlage.menge : 1}" class="dr-pos-menge w-full px-1.5 py-1 border border-slate-200 rounded text-xs">`;
    tr.appendChild(tdMenge);

    const tdEinheit = document.createElement('td');
    tdEinheit.className = 'px-2 py-1';
    tdEinheit.innerHTML = `<input type="text" value="${vorlage.einheit || 'Stk.'}" class="dr-pos-einheit w-full px-1.5 py-1 border border-slate-200 rounded text-xs">`;
    tr.appendChild(tdEinheit);

    const tdPreis = document.createElement('td');
    tdPreis.className = 'px-2 py-1';
    tdPreis.innerHTML = `<input type="number" min="0" step="0.01" value="${vorlage.preis != null ? vorlage.preis : ''}" class="dr-pos-preis w-full px-1.5 py-1 border border-slate-200 rounded text-xs">`;
    tr.appendChild(tdPreis);

    const tdMwst = document.createElement('td');
    tdMwst.className = 'px-2 py-1';
    tdMwst.innerHTML = `<select class="dr-pos-mwst w-full px-1 py-1 border border-slate-200 rounded text-xs bg-white">
        <option value="19">19 %</option><option value="7">7 %</option><option value="0">0 %</option></select>`;
    tdMwst.querySelector('.dr-pos-mwst').value = String(vorlage.mwst ?? 19);
    tr.appendChild(tdMwst);

    const tdDel = document.createElement('td');
    tdDel.className = 'px-1 py-1 text-center';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'text-slate-400 hover:text-red-500 transition-colors';
    btn.onclick = () => tr.remove();
    btn.innerHTML = '<span class="material-symbols-outlined text-[16px]">delete</span>';
    tdDel.appendChild(btn);
    tr.appendChild(tdDel);

    tbody.appendChild(tr);
}

function renderPlanPositionenRows(positionen) {
    const tbody = document.getElementById('plan-modal-positionen-body');
    tbody.innerHTML = '';
    (positionen || []).forEach(p => addPlanPosition(p));
}

async function savePlanFromModal() {
    const DC = window.DauerrechnungController;
    const idVal = document.getElementById('plan-modal-id').value;
    const objektWert = document.getElementById('plan-modal-objekt').value;
    const [objektTyp, objektIdStr] = objektWert ? objektWert.split(':') : [null, null];
    const OC = window.ObjektController;
    const empf = objektTyp ? OC.resolveEmpfaenger(objektTyp, parseInt(objektIdStr), state.objekte) : null;

    const positionen = Array.from(document.querySelectorAll('#plan-modal-positionen-body tr')).map(tr => ({
        artikelId: tr.querySelector('.dr-pos-artikel').value ? parseInt(tr.querySelector('.dr-pos-artikel').value) : null,
        name: tr.querySelector('.dr-pos-name').value.trim() || null,
        menge: parseFloat(tr.querySelector('.dr-pos-menge').value) || 0,
        einheit: tr.querySelector('.dr-pos-einheit').value.trim() || 'Stk.',
        preis: parseFloat(tr.querySelector('.dr-pos-preis').value) || 0,
        mwst: parseInt(tr.querySelector('.dr-pos-mwst').value, 10) || 0
    }));

    const bestehenderPlan = idVal ? window.drPlaeneCache.find(p => p.id === Number(idVal)) : null;

    const plan = {
        name: document.getElementById('plan-modal-name').value.trim(),
        objekt_typ: objektTyp,
        objekt_id: objektIdStr ? parseInt(objektIdStr) : null,
        empfaenger_kunde_id: empf ? empf.kundeId : null,
        rhythmus: document.getElementById('plan-modal-rhythmus').value,
        intervall_wochen: parseInt(document.getElementById('plan-modal-intervall-wochen').value, 10) || null,
        abrechnungstag: parseInt(document.getElementById('plan-modal-abrechnungstag').value, 10) || 1,
        abrechnungsmonat: parseInt(document.getElementById('plan-modal-abrechnungsmonat').value, 10) || null,
        abrechnungs_modus: document.querySelector('input[name="plan-modus"]:checked')?.value || 'NACHTRAEGLICH',
        start_datum: document.getElementById('plan-modal-start').value,
        ende_datum: document.getElementById('plan-modal-ende').value || null,
        preis_modus: document.querySelector('input[name="plan-preis-modus"]:checked')?.value || 'PAUSCHALE',
        preise_live: document.getElementById('plan-modal-preise-live').checked ? 1 : 0,
        pauschale_netto: parseFloat(document.getElementById('plan-modal-pauschale-netto').value) || 0,
        mwst_satz: parseInt(document.getElementById('plan-modal-mwst').value, 10) || 0,
        zahlungsziel_tage: parseInt(document.getElementById('plan-modal-zahlungsziel').value, 10) || 14,
        als_entwurf: document.getElementById('plan-modal-als-entwurf').checked ? 1 : 0,
        bemerkung: document.getElementById('plan-modal-bemerkung').value.trim() || null
    };
    if (bestehenderPlan) {
        plan.letzte_lauf_am = bestehenderPlan.letzte_lauf_am;
    }

    if (!empf) {
        showToast('Kein Rechnungsempfänger ermittelbar – bitte zuerst am Objekt setzen.', 'error');
        return;
    }
    if (!plan.name) {
        showToast('Bitte einen Plannamen eingeben.', 'error');
        return;
    }
    if (!plan.objekt_typ) {
        showToast('Bitte ein Objekt auswählen.', 'error');
        return;
    }

    try {
        const res = await window.api.saveAbrechnungsplan(plan, plan.preis_modus === 'POSITIONEN' ? positionen : []);
        closePlanModal();
        await refreshPlaeneState();
        renderDauerrechnungen();
        showToast(`Plan gespeichert. Nächster Lauf: ${res.naechste_lauf_am ? formattiereKurz(res.naechste_lauf_am) : 'kein Termin (Ende erreicht)'}`, 'success');
    } catch (err) {
        console.error('Fehler beim Speichern des Plans:', err);
        showToast(err.message || String(err), 'error');
    }
}

// --- Aktionen ---
async function togglePlanStatus(id) {
    const p = window.drPlaeneCache.find(x => x.id === id);
    if (!p) return;
    try {
        await window.api.updateAbrechnungsplanStatus(id, p.aktiv !== 1);
        await refreshPlaeneState();
        renderDauerrechnungen();
        showToast(`Plan "${p.name}" wurde ${p.aktiv !== 1 ? 'fortgesetzt' : 'pausiert'}.`, 'success');
    } catch (err) {
        showToast(err.message || String(err), 'error');
    }
}

async function deletePlanMitConfirm(id) {
    const p = window.drPlaeneCache.find(x => x.id === id);
    if (!p) return;
    const ok = await safeConfirm(`Abrechnungsplan "${p.name}" wirklich löschen? Pläne mit vorhandenen Läufen können nicht gelöscht werden.`, 'Plan löschen');
    if (!ok) return;
    try {
        await window.api.deleteAbrechnungsplan(id);
        await refreshPlaeneState();
        renderDauerrechnungen();
        showToast('Plan gelöscht.', 'success');
    } catch (err) {
        showToast(err.message || String(err), 'error');
    }
}

async function jetztGenerieren(planId) {
    const p = window.drPlaeneCache.find(x => x.id === planId);
    if (!p) return;
    try {
        const res = await window.api.generiereFaelligeRechnungen({ planIds: [planId] });
        await refreshPlaeneState();
        renderDauerrechnungen();
        if (window.laeufePanelPlanId === planId) await openLaeufePanel(planId);
        if (res.erstellt.length > 0) {
            const erste = res.erstellt[0];
            showToast(`${res.erstellt.length} Rechnung(en) erstellt, z.B. ${erste.nr} (${formatCurrency(erste.brutto)}).`, 'success');
        } else {
            const grund = (res.uebersprungen[0] && res.uebersprungen[0].grund) || 'Keine fälligen Läufe.';
            showToast(grund, 'info');
        }
    } catch (err) {
        showToast(err.message || String(err), 'error');
    }
}


    // Exports
    window.openPlanModal = openPlanModal;
    window.closePlanModal = closePlanModal;
    window.togglePlanRhythmusFelder = togglePlanRhythmusFelder;
    window.togglePlanPreisModus = togglePlanPreisModus;
    window.updatePlanEmpfaengerPreview = updatePlanEmpfaengerPreview;
    window.addPlanPosition = addPlanPosition;
    window.renderPlanPositionenRows = renderPlanPositionenRows;
    window.savePlanFromModal = savePlanFromModal;
    window.togglePlanStatus = togglePlanStatus;
    window.deletePlanMitConfirm = deletePlanMitConfirm;
    window.jetztGenerieren = jetztGenerieren;
})();
