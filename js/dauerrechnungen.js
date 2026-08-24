// Dauerrechnungen (F2): Rendering & Interaktion
const DR_STATUS_BADGE = {
    aktiv: 'bg-green-100 text-green-800',
    pausiert: 'bg-amber-100 text-amber-800'
};

let drPlaeneCache = [];
let laeufePanelPlanId = null;
let stornoLaufCurrentId = null;

async function refreshPlaeneState() {
    if (!window.api || !window.api.getAbrechnungsplaene) return [];
    drPlaeneCache = await window.api.getAbrechnungsplaene();
    state.abrechnungsplaene = drPlaeneCache;
    return drPlaeneCache;
}

function planNetto(plan) {
    if (plan.preis_modus === 'POSITIONEN') {
        return Math.round((plan.positionen || []).reduce((s, p) => s + (parseFloat(p.menge) || 0) * (parseFloat(p.preis) || 0), 0) * 100) / 100;
    }
    return parseFloat(plan.pauschale_netto) || 0;
}

function formatiereDatumIso(iso) {
    return iso ? new Date(iso).toLocaleDateString('de-DE') : '–';
}

async function renderDauerrechnungen() {
    const tbody = document.getElementById('plaene-table-body');
    if (!tbody) return;

    await refreshPlaeneState();

    const such = (document.getElementById('search-plaene')?.value || '').trim().toLowerCase();
    const filter = document.getElementById('filter-plaene-status')?.value || 'alle';
    const heuteIso = new Date().toISOString().split('T')[0];

    let plaene = [...drPlaeneCache];
    if (such) {
        plaene = plaene.filter(p =>
            String(p.name).toLowerCase().includes(such) ||
            String(p.objektPfad || '').toLowerCase().includes(such) ||
            String(p.empfaengerName || '').toLowerCase().includes(such));
    }
    if (filter === 'aktiv') plaene = plaene.filter(p => p.aktiv === 1);
    else if (filter === 'inaktiv') plaene = plaene.filter(p => p.aktiv !== 1);
    else if (filter === 'faellig') plaene = plaene.filter(p => p.aktiv === 1 && p.naechste_lauf_am && p.naechste_lauf_am <= heuteIso);

    tbody.innerHTML = '';
    document.getElementById('plaene-leer')?.classList.toggle('hidden', plaene.length > 0);

    const DC = window.DauerrechnungController;
    plaene.forEach(p => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-blue-50/50 transition-colors group' + (p.aktiv !== 1 ? ' opacity-50' : '');

        const tdName = document.createElement('td');
        tdName.className = 'px-4 align-middle font-medium text-slate-800';
        tdName.innerHTML = p.name + (Number(p.preise_live) === 1 && p.preis_modus === 'POSITIONEN'
            ? ` <span class="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-100 text-blue-700" title="Preise werden live aus dem Artikelkatalog übernommen">Live</span>`
            : '');
        tr.appendChild(tdName);

        const tdObjekt = document.createElement('td');
        tdObjekt.className = 'px-4 align-middle';
        tdObjekt.innerHTML = `<span class="cursor-pointer hover:text-primary" onclick="openObjektDetails('${p.objekt_typ}', ${p.objekt_id})">${p.objektPfad || '-'}</span>`;
        tr.appendChild(tdObjekt);

        const tdEmpf = document.createElement('td');
        tdEmpf.className = 'px-4 align-middle text-slate-600';
        tdEmpf.textContent = p.empfaengerName || '-';
        tr.appendChild(tdEmpf);

        const tdRhythmus = document.createElement('td');
        tdRhythmus.className = 'px-4 align-middle text-slate-600';
        tdRhythmus.textContent = DC ? DC.rhythmusLabel(p) : p.rhythmus;
        tr.appendChild(tdRhythmus);

        const tdZeitraum = document.createElement('td');
        tdZeitraum.className = 'px-4 align-middle text-slate-500 text-xs';
        tdZeitraum.textContent = `${formattiereKurz(p.start_datum)} – ${p.ende_datum ? formattiereKurz(p.ende_datum) : 'offen'}`;
        tr.appendChild(tdZeitraum);

        const tdNetto = document.createElement('td');
        tdNetto.className = 'px-4 align-middle text-right font-medium text-slate-800';
        tdNetto.textContent = formatCurrency(planNetto(p));
        tr.appendChild(tdNetto);

        const tdNaechster = document.createElement('td');
        tdNaechster.className = 'px-4 align-middle' + (p.aktiv === 1 && p.naechste_lauf_am && p.naechste_lauf_am <= heuteIso ? ' text-red-600 font-semibold' : ' text-slate-600');
        tdNaechster.textContent = p.naechste_lauf_am ? formattiereKurz(p.naechste_lauf_am) : '–';
        tr.appendChild(tdNaechster);

        const tdStatus = document.createElement('td');
        tdStatus.className = 'px-4 align-middle text-center';
        const istAktiv = p.aktiv === 1;
        tdStatus.innerHTML = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border border-transparent ${istAktiv ? DR_STATUS_BADGE.aktiv : DR_STATUS_BADGE.pausiert}">${istAktiv ? 'Aktiv' : 'Pausiert'}</span>`;
        tr.appendChild(tdStatus);

        const tdActions = document.createElement('td');
        tdActions.className = 'px-4 align-middle text-right whitespace-nowrap';
        const mkBtn = (icon, title, cls, fn) => {
            const b = document.createElement('button');
            b.title = title;
            b.className = cls;
            b.onclick = fn;
            const s = document.createElement('span');
            s.className = 'material-symbols-outlined text-[18px]';
            s.textContent = icon;
            b.appendChild(s);
            return b;
        };
        tdActions.appendChild(mkBtn('edit', 'Bearbeiten', 'text-slate-400 hover:text-primary p-1 mx-0.5 transition-colors', () => openPlanModal(p.id)));
        tdActions.appendChild(mkBtn('history', 'Läufe anzeigen', 'text-slate-400 hover:text-primary p-1 mx-0.5 transition-colors', () => openLaeufePanel(p.id)));
        tdActions.appendChild(mkBtn('play_arrow', 'Jetzt generieren', 'text-slate-400 hover:text-green-600 p-1 mx-0.5 transition-colors', () => jetztGenerieren(p.id)));
        tdActions.appendChild(mkBtn(istAktiv ? 'pause' : 'play_arrow', istAktiv ? 'Pausieren' : 'Fortsetzen', 'text-slate-400 hover:text-amber-600 p-1 mx-0.5 transition-colors', () => togglePlanStatus(p.id)));
        tdActions.appendChild(mkBtn('delete', 'Löschen', 'text-slate-400 hover:text-red-500 p-1 mx-0.5 transition-colors', () => deletePlanMitConfirm(p.id)));
        tr.appendChild(tdActions);

        tbody.appendChild(tr);
    });

    await updateDauerrechnungenKpis();
}

function formattiereKurz(iso) {
    const [y, m, d] = String(iso || '').split('-');
    return y ? `${d}.${m}.${y}` : '–';
}

async function updateDauerrechnungenKpis() {
    const aktive = drPlaeneCache.filter(p => p.aktiv === 1).length;
    document.getElementById('kpi-plaene-aktiv').innerText = aktive;

    try {
        const vorschau = await window.api.dauerrechnungenVorschau();
        const heute = new Date();
        const monatsPrefix = `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, '0')}`;
        const faelligMonat = vorschau.faellig.filter(e => String(e.rechnungsDatum).startsWith(monatsPrefix));
        document.getElementById('kpi-faellig-monat').innerText = faelligMonat.length;
        const summe = faelligMonat.reduce((s, e) => s + (e.nettoErwartet || 0), 0);
        document.getElementById('kpi-umsatz-dauerrechnungen').innerText = formatCurrency(summe);
    } catch (e) {
        console.warn('KPI-Fehler Dauerrechnungen:', e);
    }
}

document.getElementById('search-plaene')?.addEventListener('input', () => renderDauerrechnungen());
document.getElementById('filter-plaene-status')?.addEventListener('change', () => renderDauerrechnungen());

async function toggleDauerrechnungenAuto(checked) {
    try {
        await window.api.saveEinstellung('dauerrechnungen_auto_erstellen', checked ? 'true' : 'false');
        state.einstellungen.dauerrechnungen_auto_erstellen = checked ? 'true' : 'false';
        showToast(`Auto-Erstellung beim Start ${checked ? 'aktiviert' : 'deaktiviert'}.`, 'success');
    } catch (e) {
        showToast('Konnte Einstellung nicht speichern.', 'error');
    }
}

// --- Plan-Modal ---
const PLAN_ELTERN_KONFIG = [
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
    PLAN_ELTERN_KONFIG.forEach(({ typ, liste }) => {
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
        const p = drPlaeneCache.find(x => x.id === planId) || (await refreshPlaeneState()).find(x => x.id === planId);
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

    const bestehenderPlan = idVal ? drPlaeneCache.find(p => p.id === Number(idVal)) : null;

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
    const p = drPlaeneCache.find(x => x.id === id);
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
    const p = drPlaeneCache.find(x => x.id === id);
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
    const p = drPlaeneCache.find(x => x.id === planId);
    if (!p) return;
    try {
        const res = await window.api.generiereFaelligeRechnungen({ planIds: [planId] });
        await refreshPlaeneState();
        renderDauerrechnungen();
        if (laeufePanelPlanId === planId) await openLaeufePanel(planId);
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

// --- Läufe-Panel ---
async function openLaeufePanel(planId) {
    laeufePanelPlanId = planId;
    const p = drPlaeneCache.find(x => x.id === planId);
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
    laeufePanelPlanId = null;
}

// --- Storno ---
function openStornoLaufModal(laufId) {
    stornoLaufCurrentId = laufId;
    document.getElementById('storno-lauf-grund').value = '';
    document.getElementById('storno-lauf-modal').classList.remove('hidden');
    document.getElementById('storno-lauf-grund').focus();
}

function closeStornoLaufModal() {
    document.getElementById('storno-lauf-modal').classList.add('hidden');
    stornoLaufCurrentId = null;
}

async function bestaetigeStornoLauf() {
    const grund = document.getElementById('storno-lauf-grund').value.trim();
    if (!grund) {
        showToast('Storno ohne Begründung nicht erlaubt (GoBD).', 'error');
        return;
    }
    try {
        const res = await window.api.storniereLauf(stornoLaufCurrentId, grund);
        closeStornoLaufModal();
        await refreshPlaeneState();
        renderDauerrechnungen();
        if (laeufePanelPlanId) await openLaeufePanel(laeufePanelPlanId);
        showToast(res.dokumentStorniert ? 'Lauf storniert und Beleg entfernt/storniert.' : 'Lauf storniert.', 'success');
    } catch (err) {
        showToast(err.message || String(err), 'error');
    }
}

// --- Generierung Vorschau ---
let drVorschauCache = [];

async function openGenerierungModal() {
    drVorschauCache = await window.api.dauerrechnungenVorschau();
    const liste = document.getElementById('generierung-liste');
    liste.innerHTML = '';

    let letzterEmpfaenger = null;
    drVorschauCache.faellig.forEach((eintrag, idx) => {
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

    document.getElementById('generierung-leer').classList.toggle('hidden', drVorschauCache.faellig.length > 0);
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
    const planIds = [...new Set(Array.from(document.querySelectorAll('#generierung-liste .dr-gen-check:checked')).map(c => drVorschauCache.faellig[parseInt(c.dataset.idx)].planId))];
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
        drVorschauCache = await window.api.dauerrechnungenVorschau();
        showToast(`${res.erstellt.length} Rechnung(en) erstellt.`, 'success');
    } catch (err) {
        showToast(err.message || String(err), 'error');
    }
}

// --- Sammelrechnung Modal ---
async function openSammelModal() {
    drVorschauCache = await window.api.dauerrechnungenVorschau();

    const gruppen = window.DauerrechnungController
        ? window.DauerrechnungController.gruppiereFuerSammelrechnung(drVorschauCache.faellig)
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

    drVorschauCache.faellig
        .filter(e => e.empfaengerKundeId === kundeId)
        .forEach((eintrag, idx) => {
            const label = document.createElement('label');
            label.className = 'flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-50 cursor-pointer border border-slate-100 text-sm';
            label.innerHTML = `
                <input type="checkbox" class="dr-sammel-check rounded border-slate-300 text-primary focus:ring-primary" data-idx="${drVorschauCache.faellig.indexOf(eintrag)}" checked>
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
        .map(c => drVorschauCache.faellig[parseInt(c.dataset.idx)]);
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

// --- Objektdetail-Tab (F2 füllt den F1-Hook) ---
async function renderObjektPlaene(objektTyp, objektId) {
    const inhalt = document.getElementById('od-plaene-inhalt');
    if (!inhalt || !odCurrent.typ) return;

    let plaene = [];
    try {
        plaene = await window.api.getAbrechnungsplaene({ objektTyp, objektId });
    } catch (e) {
        inhalt.innerHTML = '<p class="text-sm text-red-500">Pläne konnten nicht geladen werden.</p>';
        return;
    }

    if (!plaene || plaene.length === 0) {
        inhalt.innerHTML = `
            <div class="p-8 text-center text-slate-400 flex flex-col items-center gap-2">
                <span class="material-symbols-outlined text-4xl text-slate-200">event_repeat</span>
                <p>Noch keine Abrechnungspläne für dieses Objekt vorhanden.</p>
            </div>`;
        return;
    }

    const DC = window.DauerrechnungController;
    const table = document.createElement('table');
    table.className = 'w-full text-left text-sm dense-table';
    table.innerHTML = `
        <thead class="bg-slate-50 text-slate-500 border-b border-slate-200">
            <tr>
                <th class="px-3 py-2 font-semibold">Name</th>
                <th class="px-3 py-2 font-semibold">Rhythmus</th>
                <th class="px-3 py-2 font-semibold">Nächster Lauf</th>
                <th class="px-3 py-2 font-semibold text-right">Netto</th>
                <th class="px-3 py-2 font-semibold text-center">Status</th>
                <th class="px-3 py-2 font-semibold text-right">Aktionen</th>
            </tr>
        </thead>`;
    const tbody = document.createElement('tbody');
    tbody.className = 'divide-y divide-slate-100';

    plaene.forEach(p => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50';
        const istAktiv = p.aktiv === 1;
        tr.innerHTML = `
            <td class="px-3 py-2 font-medium text-slate-800">${p.name}</td>
            <td class="px-3 py-2 text-slate-600">${DC ? DC.rhythmusLabel(p) : p.rhythmus}</td>
            <td class="px-3 py-2 ${istAktiv && p.naechste_lauf_am && p.naechste_lauf_am <= new Date().toISOString().split('T')[0] ? 'text-red-600 font-semibold' : 'text-slate-600'}">${p.naechste_lauf_am ? formattiereKurz(p.naechste_lauf_am) : '–'}</td>
            <td class="px-3 py-2 text-right font-medium">${formatCurrency(planNetto(p))}</td>
            <td class="px-3 py-2 text-center"><span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${istAktiv ? DR_STATUS_BADGE.aktiv : DR_STATUS_BADGE.pausiert}">${istAktiv ? 'Aktiv' : 'Pausiert'}</span></td>
            <td class="px-3 py-2 text-right whitespace-nowrap"></td>`;

        const actionTd = tr.lastElementChild;
        const btnLaeufe = document.createElement('button');
        btnLaeufe.title = 'Läufe anzeigen';
        btnLaeufe.className = 'text-slate-400 hover:text-primary transition-colors p-1';
        btnLaeufe.onclick = async () => {
            switchView('dauerrechnungen');
            await renderDauerrechnungen();
            openLaeufePanel(p.id);
        };
        btnLaeufe.innerHTML = '<span class="material-symbols-outlined text-[18px]">history</span>';
        actionTd.appendChild(btnLaeufe);

        const btnEdit = document.createElement('button');
        btnEdit.title = 'Bearbeiten';
        btnEdit.className = 'text-slate-400 hover:text-primary transition-colors p-1 ml-1';
        btnEdit.onclick = () => openPlanModal(p.id);
        btnEdit.innerHTML = '<span class="material-symbols-outlined text-[18px]">edit</span>';
        actionTd.appendChild(btnEdit);

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    inhalt.innerHTML = '';
    inhalt.appendChild(table);
}
