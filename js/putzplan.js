// Putzplan & Reinigungs-LV (F3) - Renderer
const RC = window.ReinigungController;
const OC_PUTZ = window.ObjektController;

let putzplanAuswahl = null;
let putzplanDaten = null;
let putzplanProfil = null;
let lvEintraegeDraft = [];
const lvAufgeklapptePositionen = new Set();

function putzplanKnotenListe() {
    const alle = [];
    (state.objekte.liegenschaften || []).forEach(l => alle.push({ typ: 'LIEGENSCHAFT', id: l.id, ebene: 0 }));
    (state.objekte.gebaeude || []).forEach(g => alle.push({ typ: 'GEBAEUDE', id: g.id, ebene: 1 }));
    (state.objekte.etagen || []).forEach(e => alle.push({ typ: 'ETAGE', id: e.id, ebene: 2 }));
    (state.objekte.raeume || []).forEach(r => alle.push({ typ: 'RAUM', id: r.id, ebene: 3 }));
    return alle;
}

function putzplanObjektLabel(typ, id) {
    return OC_PUTZ.buildPfad(typ, id, state.objekte) || `${typ}:${id}`;
}

async function renderPutzplan() {
    try {
        putzplanProfil = await window.api.getZuschlagsProfil();
    } catch (e) {
        putzplanProfil = RC.DEFAULT_ZUSCHLAGSPROFIL;
    }

    fuellePutzplanObjektSelect();

    if (!putzplanAuswahl && state.putzplanAuswahl) putzplanAuswahl = state.putzplanAuswahl;
    if (!putzplanAuswahl) {
        const ersteLieg = (state.objekte.liegenschaften || [])[0];
        if (ersteLieg) putzplanAuswahl = { typ: 'LIEGENSCHAFT', id: ersteLieg.id };
    }
    if (!putzplanAuswahl) {
        document.getElementById('lv-bereiche-liste').innerHTML = '';
        document.getElementById('lv-leer').classList.remove('hidden');
        renderPutzplanBaum();
        return;
    }

    syncPutzplanSelect();
    renderPutzplanBaum();
    await ladePutzplanDaten();
}

function fuellePutzplanObjektSelect() {
    const sel = document.getElementById('putzplan-objekt-select');
    sel.innerHTML = '';
    putzplanKnotenListe()
        .sort((a, b) => a.ebene - b.ebene || String(putzplanObjektLabel(a.typ, a.id)).localeCompare(String(putzplanObjektLabel(b.typ, b.id)), 'de'))
        .forEach(k => {
            const opt = document.createElement('option');
            opt.value = `${k.typ}:${k.id}`;
            opt.textContent = '— '.repeat(k.ebene) + putzplanObjektLabel(k.typ, k.id);
            sel.appendChild(opt);
        });
}

function syncPutzplanSelect() {
    if (!putzplanAuswahl) return;
    const sel = document.getElementById('putzplan-objekt-select');
    const wert = `${putzplanAuswahl.typ}:${putzplanAuswahl.id}`;
    if ([...sel.options].some(o => o.value === wert)) sel.value = wert;
}

function onPutzplanSelectChange(val) {
    const [typ, id] = String(val).split(':');
    selectPutzplanObjekt(typ, Number(id));
}

function selectPutzplanObjekt(typ, id) {
    putzplanAuswahl = { typ, id };
    state.putzplanAuswahl = putzplanAuswahl;
    syncPutzplanSelect();
    renderPutzplanBaum();
    ladePutzplanDaten();
}

async function ladePutzplanDaten() {
    if (!putzplanAuswahl) return;
    try {
        putzplanDaten = await window.api.getPutzplan(putzplanAuswahl.typ, putzplanAuswahl.id);
    } catch (e) {
        showToast(e.message || 'Putzplan konnte nicht geladen werden.', 'error');
        return;
    }
    renderLvBereiche();
}

function updatePutzplanKpis(summen) {
    document.getElementById('kpi-lv-stunden').innerText = Number(summen.jahresStunden).toLocaleString('de-DE') + ' h';
    document.getElementById('kpi-lv-netto-jahr').innerText = formatCurrency(summen.nettoJahr);
    document.getElementById('kpi-lv-netto-monat').innerText = formatCurrency(summen.nettoMonat);
    document.getElementById('kpi-lv-zuschlaege').innerText = formatCurrency(summen.zuschlaegeGesamt);
    const btn = document.getElementById('btn-lv-uebernehmen');
    btn.disabled = !(summen.positionenAnzahl > 0);
}

function renderPutzplanBaum() {
    const container = document.getElementById('putzplan-baum');
    container.innerHTML = '';

    (state.objekte.liegenschaften || []).forEach(l => {
        renderPutzplanBaumZeile(container, 'LIEGENSCHAFT', l, 0);
    });

    if ((state.objekte.liegenschaften || []).length === 0) {
        container.innerHTML = '<p class="p-4 text-center text-slate-400 text-xs">Noch keine Liegenschaften angelegt.</p>';
    }
}

function renderPutzplanBaumZeile(container, typ, knoten, tiefe) {
    const badge = typ === 'RAUM'
        ? (knoten.einheit === 'm²' ? Number(knoten.flaeche || 0).toLocaleString('de-DE') + ' m²' : (knoten.einheit || '-'))
        : Number(knoten.flaeche_summe != null ? knoten.flaeche_summe : OC_PUTZ.summiereFlaechen(typ, knoten.id, state.objekte)).toLocaleString('de-DE') + ' m²';
    renderPutzplanBaumKnoten(container, typ, knoten, badge, tiefe);

    if (typ === 'RAUM') return;

    const kindKonfig = {
        LIEGENSCHAFT: { liste: 'gebaeude', childTyp: 'GEBAEUDE' },
        GEBAEUDE: { liste: 'etagen', childTyp: 'ETAGE' },
        ETAGE: { liste: 'raeume', childTyp: 'RAUM' }
    }[typ];
    const kinder = (state.objekte[kindKonfig.liste] || []).filter(k => {
        if (kindKonfig.childTyp === 'GEBAEUDE') return k.liegenschaft_id === knoten.id;
        if (kindKonfig.childTyp === 'ETAGE') return k.gebaeude_id === knoten.id;
        return k.etage_id === knoten.id;
    });
    kinder.forEach(kind => renderPutzplanBaumZeile(container, kindKonfig.childTyp, kind, tiefe + 1));
}

function renderPutzplanBaumKnoten(container, typ, knoten, badge, tiefe) {
    const aktiv = putzplanAuswahl && putzplanAuswahl.typ === typ && putzplanAuswahl.id === knoten.id;
    const zeile = document.createElement('button');
    zeile.type = 'button';
    zeile.className = `w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-left text-sm transition-colors ${aktiv ? 'bg-primary/10 text-primary font-semibold' : 'text-slate-600 hover:bg-slate-100'}`;
    zeile.style.paddingLeft = `${8 + tiefe * 16}px`;
    zeile.onclick = () => selectPutzplanObjekt(typ, knoten.id);

    const labelWrap = document.createElement('span');
    labelWrap.className = 'flex items-center gap-1.5 min-w-0';
    const icon = { LIEGENSCHAFT: 'apartment', GEBAEUDE: 'domain', ETAGE: 'layers', RAUM: 'meeting_room' }[typ];
    labelWrap.innerHTML = `<span class="material-symbols-outlined text-[16px] ${aktiv ? 'text-primary' : 'text-slate-400'} shrink-0">${icon}</span><span class="truncate">${sanitize(putzplanObjektLabel(typ, knoten.id))}</span>`;
    zeile.appendChild(labelWrap);

    const badgeEl = document.createElement('span');
    badgeEl.className = 'shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200';
    badgeEl.textContent = badge;
    zeile.appendChild(badgeEl);
    container.appendChild(zeile);
}

function baueZuschlagsTooltip(kalkulation) {
    if (!kalkulation || !kalkulation.zuschlaege || kalkulation.zuschlaege.length === 0) return 'Keine Zuschläge';
    return kalkulation.zuschlaege.map(z =>
        `${z.label}: ${Number(z.anteilProzent).toLocaleString('de-DE')} % × ${Number(z.satzProzent).toLocaleString('de-DE')} % = ${formatCurrency(z.betrag)}/Jahr`
    ).join('\n');
}

function renderLvBereiche() {
    const listeEl = document.getElementById('lv-bereiche-liste');
    const leerEl = document.getElementById('lv-leer');
    listeEl.innerHTML = '';

    if (!putzplanDaten) { leerEl.classList.add('hidden'); return; }
    updatePutzplanKpis(putzplanDaten.summen);

    const suchtext = (document.getElementById('search-lv').value || '').trim().toLowerCase();
    const bereiche = putzplanDaten.bereiche.filter(b => !suchtext || b.name.toLowerCase().includes(suchtext));

    let sichtbarePositionen = 0;
    bereiche.forEach(bereich => {
        const card = document.createElement('div');
        card.className = 'bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden';

        const header = document.createElement('div');
        header.className = 'px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3';
        header.innerHTML = `
            <div class="flex items-center gap-2 min-w-0">
                <h4 class="font-semibold text-slate-800 text-sm truncate">${sanitize(bereich.name)}</h4>
                <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-500 border border-slate-200">${bereich.positionen.length} Pos.</span>
                ${bereich.aktiv === 0 ? '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-red-50 text-red-600 border border-red-200">Inaktiv</span>' : ''}
                ${bereich.positionsnr_prefix ? `<span class="text-[11px] font-mono text-slate-400">Präfix ${sanitize(bereich.positionsnr_prefix)}</span>` : ''}
            </div>
            <div class="flex items-center gap-1 shrink-0"></div>`;
        const headerActions = header.querySelector('.shrink-0');

        const mkBtn = (icon, title, cls, handler) => {
            const b = document.createElement('button');
            b.title = title;
            b.className = cls;
            b.onclick = handler;
            const s = document.createElement('span');
            s.className = 'material-symbols-outlined text-[18px]';
            s.textContent = icon;
            b.appendChild(s);
            return b;
        };

        headerActions.appendChild(mkBtn('add', 'Position anlegen', 'text-slate-400 hover:text-green-600 p-1 transition-colors', () => openLvPositionModal(null, bereich.id)));
        headerActions.appendChild(mkBtn('edit', 'Bereich bearbeiten', 'text-slate-400 hover:text-primary p-1 transition-colors', () => openLvBereichModal(bereich)));
        headerActions.appendChild(mkBtn('delete', 'Bereich löschen', 'text-slate-400 hover:text-red-500 p-1 transition-colors', () => deleteLvBereichMitConfirm(bereich)));

        card.appendChild(header);

        const positionen = bereich.positionen.filter(p => !suchtext ||
            (p.bezeichnung || '').toLowerCase().includes(suchtext) ||
            (p.positionsnr || '').toLowerCase().includes(suchtext));
        sichtbarePositionen += positionen.length;

        if (positionen.length > 0) {
            const tableWrap = document.createElement('div');
            tableWrap.className = 'overflow-x-auto';
            const table = document.createElement('table');
            table.className = 'w-full text-left text-sm dense-table';
            table.innerHTML = `
                <thead class="bg-white text-slate-500 border-b border-slate-200">
                    <tr>
                        <th class="px-3 py-2 font-semibold whitespace-nowrap">Pos.Nr</th>
                        <th class="px-3 py-2 font-semibold whitespace-nowrap">Bezeichnung</th>
                        <th class="px-3 py-2 font-semibold whitespace-nowrap text-right">Menge</th>
                        <th class="px-3 py-2 font-semibold whitespace-nowrap">Turnus</th>
                        <th class="px-3 py-2 font-semibold whitespace-nowrap text-right">min/Einh.</th>
                        <th class="px-3 py-2 font-semibold whitespace-nowrap text-right">Std./Jahr</th>
                        <th class="px-3 py-2 font-semibold whitespace-nowrap text-right">Netto/Jahr</th>
                        <th class="px-3 py-2 font-semibold whitespace-nowrap text-right">Netto/Monat</th>
                        <th class="px-3 py-2 font-semibold whitespace-nowrap text-right">Aktionen</th>
                    </tr>
                </thead>`;
            const tbody = document.createElement('tbody');
            tbody.className = 'divide-y divide-slate-100 text-slate-700';

            positionen.forEach(pos => {
                const k = pos.kalkulation;
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50';
                const mengeAnzeige = k.quelle === 'POSITION'
                    ? `<span>${Number(k.direkteMenge).toLocaleString('de-DE')} ${sanitize(pos.menge_einheit)}</span>`
                    : `<span title="${sanitize((k.eintraege || []).map(e => `${e.objektLabel}: ${Number(e.menge).toLocaleString('de-DE')} ${sanitize(pos.menge_einheit)}`).join(' | '))}">${(k.eintraege || []).reduce((s, e) => s + Number(e.menge), 0).toLocaleString('de-DE')} ${sanitize(pos.menge_einheit)}</span><span class="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">aus Raumfläche</span>`;

                tr.innerHTML = `
                    <td class="px-3 py-2 font-mono text-xs text-slate-500 align-top">${sanitize(pos.positionsnr || '-')}</td>
                    <td class="px-3 py-2 align-top">
                        <div class="font-medium text-slate-800">${sanitize(pos.bezeichnung)}</div>
                        ${pos.beschreibung ? `<div class="text-xs text-slate-400 truncate max-w-[280px]" title="${sanitize(pos.beschreibung)}">${sanitize(pos.beschreibung)}</div>` : ''}
                    </td>
                    <td class="px-3 py-2 text-right align-top whitespace-nowrap">${mengeAnzeige}</td>
                    <td class="px-3 py-2 align-top whitespace-nowrap">${sanitize(RC.buildTurnusLabel(pos.turnus_typ, pos.turnus_wert))}</td>
                    <td class="px-3 py-2 text-right align-top whitespace-nowrap">${Number(pos.zeitbedarf_min_je_einheit).toLocaleString('de-DE')}</td>
                    <td class="px-3 py-2 text-right align-top whitespace-nowrap">${Number(Math.round(k.jahresStunden * 100) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })}</td>
                    <td class="px-3 py-2 text-right align-top whitespace-nowrap">
                        <span class="font-medium cursor-help" title="${sanitize(baueZuschlagsTooltip(k)).replace(/"/g, '&quot;')}">${formatCurrency(k.nettoJahrInklZuschlaege)}</span>
                        ${(k.zuschlaege || []).length > 0 ? `<div class="text-[10px] text-purple-600">inkl. ${formatCurrency(k.zuschlaegeGesamt)} Zuschläge</div>` : ''}
                    </td>
                    <td class="px-3 py-2 text-right align-top whitespace-nowrap font-semibold">${formatCurrency(k.nettoMonat)}</td>
                    <td class="px-3 py-2 text-right align-top whitespace-nowrap"></td>`;

                const aktionenTd = tr.lastElementChild;
                aktionenTd.appendChild(mkBtn('edit', 'Position bearbeiten', 'text-slate-400 hover:text-primary p-1 mx-0.5 transition-colors', () => openLvPositionModal(pos, bereich.id)));
                aktionenTd.appendChild(mkBtn('meeting_room', `Einträge (${(k.eintraege || []).length})`, 'text-slate-400 hover:text-green-600 p-1 mx-0.5 transition-colors', () => toggleLvEintraege(pos)));
                aktionenTd.appendChild(mkBtn('delete', 'Position löschen', 'text-slate-400 hover:text-red-500 p-1 mx-0.5 transition-colors', () => deleteLvPositionMitConfirm(pos)));

                tbody.appendChild(tr);

                if (lvAufgeklapptePositionen.has(pos.id)) {
                    tbody.appendChild(baueEintraegeZeile(pos));
                }
            });

            table.appendChild(tbody);
            tableWrap.appendChild(table);
            card.appendChild(tableWrap);
        }

        listeEl.appendChild(card);
    });

    leerEl.classList.toggle('hidden', bereiche.length > 0 && sichtbarePositionen > 0);
}

function baueEintraegeZeile(pos) {
    const k = pos.kalkulation;
    const zeile = document.createElement('tr');
    zeile.className = 'bg-slate-50/70';
    const td = document.createElement('td');
    td.colSpan = 9;
    td.className = 'px-6 py-3';

    const titel = document.createElement('div');
    titel.className = 'text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1';
    titel.innerHTML = '<span class="material-symbols-outlined text-[14px]">meeting_room</span> Zugewiesene Objekte & Häufigkeit';
    td.appendChild(titel);

    if (!k.eintraege || k.eintraege.length === 0) {
        td.insertAdjacentHTML('beforeend', '<p class="text-xs text-slate-400 italic">Noch keine Objekte zugewiesen – Kalkulation über Direktmenge der Position.</p>');
    } else {
        const ul = document.createElement('ul');
        ul.className = 'flex flex-col gap-1';
        k.eintraege.forEach(e => {
            const li = document.createElement('li');
            li.className = 'flex items-center justify-between gap-3 text-xs bg-white border border-slate-200 rounded px-2 py-1.5';
            li.innerHTML = `
                <span class="truncate"><span class="material-symbols-outlined text-[14px] text-slate-400 align-middle">place</span> <span class="font-medium">${sanitize(e.objektLabel)}</span></span>
                <span class="text-slate-500 whitespace-nowrap">${e.mengeOverride != null ? 'Override ' : ''}${Number(e.menge).toLocaleString('de-DE')} · ${sanitize(RC.buildTurnusLabel(e.turnusTyp, e.turnusWert))}</span>
                <span class="font-semibold whitespace-nowrap">${formatCurrency(e.nettoGesamt)}</span>`;
            ul.appendChild(li);
        });
        td.appendChild(ul);
    }

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'mt-2 inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-primary bg-white border border-primary/40 rounded hover:bg-primary/5 transition-colors';
    addBtn.innerHTML = '<span class="material-symbols-outlined text-[14px]">add</span> Raum/Etage zuweisen';
    addBtn.onclick = () => openLvEintragModal(null, pos);
    td.appendChild(addBtn);

    zeile.appendChild(td);
    return zeile;
}

function toggleLvEintraege(pos) {
    if (lvAufgeklapptePositionen.has(pos.id)) lvAufgeklapptePositionen.delete(pos.id);
    else lvAufgeklapptePositionen.add(pos.id);
    renderLvBereiche();
}

// --- Bereichs-Modal ---
function openLvBereichModal(bereich = null) {
    if (!putzplanAuswahl) { showToast('Bitte zuerst ein Objekt wählen.', 'error'); return; }
    document.getElementById('lv-bereich-modal-id').value = bereich ? bereich.id : '';
    document.getElementById('lv-bereich-modal-name').value = bereich ? bereich.name : '';
    document.getElementById('lv-bereich-modal-prefix').value = bereich ? (bereich.positionsnr_prefix || '') : '';
    document.getElementById('lv-bereich-modal-sortier').value = bereich ? (bereich.sortier_index || 0) : (putzplanDaten ? putzplanDaten.bereiche.length : 0);
    document.getElementById('lv-bereich-modal-notizen').value = bereich ? (bereich.notizen || '') : '';
    document.getElementById('lv-bereich-modal-aktiv').checked = bereich ? bereich.aktiv !== 0 : true;
    document.getElementById('lv-bereich-modal-title').innerText = bereich ? 'Leistungsbereich bearbeiten' : 'Leistungsbereich anlegen';
    document.getElementById('lv-bereich-modal').classList.remove('hidden');
    document.getElementById('lv-bereich-modal').classList.add('flex');
    document.getElementById('lv-bereich-modal-name').focus();
}

function closeLvBereichModal() {
    const m = document.getElementById('lv-bereich-modal');
    m.classList.add('hidden');
    m.classList.remove('flex');
}

async function saveLvBereichFromModal() {
    const name = document.getElementById('lv-bereich-modal-name').value.trim();
    if (!name) { showToast('Bitte einen Bereichsnamen eingeben.', 'error'); return; }
    try {
        await window.api.saveLvBereich({
            id: document.getElementById('lv-bereich-modal-id').value ? Number(document.getElementById('lv-bereich-modal-id').value) : null,
            objekt_typ: putzplanAuswahl.typ,
            objekt_id: putzplanAuswahl.id,
            name,
            positionsnr_prefix: document.getElementById('lv-bereich-modal-prefix').value.trim() || null,
            sortier_index: parseInt(document.getElementById('lv-bereich-modal-sortier').value, 10) || 0,
            notizen: document.getElementById('lv-bereich-modal-notizen').value.trim() || null,
            aktiv: document.getElementById('lv-bereich-modal-aktiv').checked ? 1 : 0
        });
        showToast('Leistungsbereich gespeichert.', 'success');
        closeLvBereichModal();
        await ladePutzplanDaten();
    } catch (e) {
        showToast(e.message || 'Speichern fehlgeschlagen.', 'error');
    }
}

async function deleteLvBereichMitConfirm(bereich) {
    const ok = await safeConfirm(`Leistungsbereich "${bereich.name}" inkl. aller Positionen und Putzplan-Einträgen löschen?`, 'Bereich löschen');
    if (!ok) return;
    try {
        await window.api.deleteLvBereich(bereich.id);
        showToast('Leistungsbereich gelöscht.', 'success');
        await ladePutzplanDaten();
    } catch (e) {
        showToast(e.message || 'Löschen fehlgeschlagen.', 'error');
    }
}

// --- Positions-Modal ---
function findeLvPosition(posId) {
    for (const bereich of (putzplanDaten ? putzplanDaten.bereiche : [])) {
        const gefunden = bereich.positionen.find(p => p.id === posId);
        if (gefunden) return { bereich, pos: gefunden };
    }
    return null;
}

function fuelleLvEintraegeListe() {
    const wrap = document.getElementById('lv-position-modal-eintraege-liste');
    wrap.innerHTML = '';
    if (lvEintraegeDraft.length === 0) {
        wrap.innerHTML = '<p class="text-xs text-slate-400 italic px-1">Noch keine Zuweisungen – Kalkulation läuft über die Direktmenge.</p>';
        return;
    }
    lvEintraegeDraft.forEach((e, idx) => {
        const zeile = document.createElement('div');
        zeile.className = 'flex items-center justify-between gap-2 text-xs bg-white border border-slate-200 rounded px-2 py-1.5';
        const auto = e.menge_override == null || e.menge_override === '';
        zeile.innerHTML = `
            <span class="truncate font-medium">${sanitize(putzplanObjektLabel(e.objekt_typ, e.objekt_id))}</span>
            <span class="text-slate-500 whitespace-nowrap">${auto ? 'Fläche automatisch' : 'Override ' + Number(e.menge_override).toLocaleString('de-DE')} · ${sanitize(RC.buildTurnusLabel(e.turnus_typ, e.turnus_wert))}</span>`;
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'text-slate-400 hover:text-red-500 p-0.5 transition-colors';
        del.title = 'Zuweisung entfernen';
        del.innerHTML = '<span class="material-symbols-outlined text-[16px]">close</span>';
        del.onclick = () => { lvEintraegeDraft.splice(idx, 1); fuelleLvEintraegeListe(); updateLvPositionVorschau(); };
        zeile.appendChild(del);
        wrap.appendChild(zeile);
    });
}

function openLvPositionModal(pos = null, bereichId = null) {
    if (!putzplanAuswahl) { showToast('Bitte zuerst ein Objekt wählen.', 'error'); return; }
    lvEintraegeDraft = [];

    const profilSatz = putzplanProfil ? putzplanProfil.standard_stundensatz : 15;
    document.getElementById('lv-position-modal-id').value = pos ? pos.id : '';
    document.getElementById('lv-position-modal-bereich').value = pos ? pos.bereich_id : (bereichId || '');
    document.getElementById('lv-position-modal-bezeichnung').value = pos ? pos.bezeichnung : '';
    document.getElementById('lv-position-modal-nr').value = pos ? (pos.positionsnr || '') : vorschlagePositionsNr(bereichId);
    document.getElementById('lv-position-modal-beschreibung').value = pos ? (pos.beschreibung || '') : '';
    document.getElementById('lv-position-modal-menge').value = pos ? (pos.menge || 0) : 0;
    document.getElementById('lv-position-modal-einheit').value = pos ? (pos.menge_einheit || 'm²') : 'm²';
    document.getElementById('lv-position-modal-turnus-typ').value = pos ? pos.turnus_typ : 'X_PRO_WOCHE';
    document.getElementById('lv-position-modal-turnus-wert').value = pos ? pos.turnus_wert : 5;
    document.getElementById('lv-position-modal-zeitbedarf').value = pos ? (pos.zeitbedarf_min_je_einheit || 0) : 1;
    document.getElementById('lv-position-modal-stundensatz').value = pos ? (pos.kalk_stundensatz || 0) : profilSatz;
    document.getElementById('lv-position-modal-mwst').value = pos ? String(pos.mwst || 19) : '19';
    document.getElementById('lv-position-modal-notizen').value = pos ? (pos.notizen || '') : '';

    let zs = {};
    if (pos && pos.zuschlaege_json) {
        try { zs = JSON.parse(pos.zuschlaege_json) || {}; } catch (_e) { zs = {}; }
    }
    document.getElementById('lv-position-modal-zs-nacht').value = zs.nacht || 0;
    document.getElementById('lv-position-modal-zs-sofei').value = zs.sonntag_feiertag || 0;
    document.getElementById('lv-position-modal-zs-hoher').value = zs.hoher_feiertag || 0;

    if (pos && pos.kalkulation && pos.kalkulation.eintraege) {
        lvEintraegeDraft = pos.kalkulation.eintraege.map(e => ({
            objekt_typ: e.objekt_typ,
            objekt_id: e.objekt_id,
            menge_override: e.mengeOverride != null ? e.mengeOverride : '',
            turnus_typ: e.turnusTyp,
            turnus_wert: e.turnusWert,
            notizen: e.notizen || null
        }));
    }
    fuelleLvEintraegeListe();

    document.getElementById('lv-position-modal-title').innerText = pos ? 'LV-Position bearbeiten' : 'LV-Position anlegen';
    document.getElementById('lv-position-modal').classList.remove('hidden');
    document.getElementById('lv-position-modal').classList.add('flex');
    updateTurnusWertLabel();
    updateLvPositionVorschau();
    document.getElementById('lv-position-modal-bezeichnung').focus();
}

function vorschlagePositionsNr(bereichId) {
    const bereich = (putzplanDaten ? putzplanDaten.bereiche : []).find(b => b.id === Number(bereichId));
    if (!bereich) return '';
    const prefix = bereich.positionsnr_prefix || '';
    const naechste = bereich.positionen.length + 1;
    return `${prefix}${String(naechste).padStart(2, '0')}`;
}

function closeLvPositionModal() {
    const m = document.getElementById('lv-position-modal');
    m.classList.add('hidden');
    m.classList.remove('flex');
}

function updateTurnusWertLabel() {
    const typ = document.getElementById('lv-position-modal-turnus-typ').value;
    const label = {
        X_PRO_WOCHE: 'Einsätze pro Woche',
        ALLE_X_TAGE: 'Intervall in Tagen',
        X_PRO_MONAT: 'Einsätze pro Monat',
        JAEHRLICH: 'Einsätze pro Jahr'
    }[typ];
    document.getElementById('lv-position-modal-turnus-label').innerText = label || 'Wert';
}

function bauePositionsDraftAusFormular() {
    const zsJsonTeile = {};
    const nacht = parseFloat(document.getElementById('lv-position-modal-zs-nacht').value) || 0;
    const sofei = parseFloat(document.getElementById('lv-position-modal-zs-sofei').value) || 0;
    const hoher = parseFloat(document.getElementById('lv-position-modal-zs-hoher').value) || 0;
    if (nacht > 0) zsJsonTeile.nacht = nacht;
    if (sofei > 0) zsJsonTeile.sonntag_feiertag = sofei;
    if (hoher > 0) zsJsonTeile.hoher_feiertag = hoher;

    return {
        id: document.getElementById('lv-position-modal-id').value ? Number(document.getElementById('lv-position-modal-id').value) : null,
        bereich_id: Number(document.getElementById('lv-position-modal-bereich').value),
        bezeichnung: document.getElementById('lv-position-modal-bezeichnung').value.trim(),
        beschreibung: document.getElementById('lv-position-modal-beschreibung').value.trim() || null,
        positionsnr: document.getElementById('lv-position-modal-nr').value.trim() || null,
        menge: parseFloat(document.getElementById('lv-position-modal-menge').value) || 0,
        menge_einheit: document.getElementById('lv-position-modal-einheit').value,
        turnus_typ: document.getElementById('lv-position-modal-turnus-typ').value,
        turnus_wert: parseFloat(document.getElementById('lv-position-modal-turnus-wert').value) || 1,
        zeitbedarf_min_je_einheit: parseFloat(document.getElementById('lv-position-modal-zeitbedarf').value) || 0,
        kalk_stundensatz: parseFloat(document.getElementById('lv-position-modal-stundensatz').value) || 0,
        zuschlaege_json: Object.keys(zsJsonTeile).length > 0 ? JSON.stringify(zsJsonTeile) : null,
        mwst: parseInt(document.getElementById('lv-position-modal-mwst').value, 10) || 19,
        notizen: document.getElementById('lv-position-modal-notizen').value.trim() || null
    };
}

function updateLvPositionVorschau() {
    const el = document.getElementById('lv-position-modal-vorschau');
    if (!el) return;
    try {
        const draft = bauePositionsDraftAusFormular();
        const kalk = RC.positionsKalkulation(
            draft,
            lvEintraegeDraft,
            (typ, id) => RC.autoMengeFuerObjekt(typ, id, state.objekte),
            putzplanProfil || RC.DEFAULT_ZUSCHLAGSPROFIL
        );
        const zsText = kalk.zuschlaege.length > 0 ? ` · Zuschläge ${formatCurrency(kalk.zuschlaegeGesamt)}` : '';
        el.innerText = `Jahr: ${Number(Math.round(kalk.jahresStunden * 100) / 100).toLocaleString('de-DE')} h / ${formatCurrency(kalk.nettoJahrInklZuschlaege)} · Monat: ${formatCurrency(kalk.nettoMonat)}${zsText}`;
    } catch (_e) {
        el.innerText = 'Jahr: – · Monat: –';
    }
}

async function saveLvPositionFromModal() {
    const data = bauePositionsDraftAusFormular();
    if (!data.bezeichnung) { showToast('Bitte eine Bezeichnung eingeben.', 'error'); return; }
    if (!(data.turnus_wert > 0)) { showToast('Turnus-Wert muss größer 0 sein.', 'error'); return; }
    if (!data.bereich_id) { showToast('Ungültiger Bereich.', 'error'); return; }
    try {
        await window.api.saveLvPosition(data, lvEintraegeDraft);
        showToast('LV-Position gespeichert.', 'success');
        closeLvPositionModal();
        await ladePutzplanDaten();
    } catch (e) {
        showToast(e.message || 'Speichern fehlgeschlagen.', 'error');
    }
}

async function deleteLvPositionMitConfirm(pos) {
    const ok = await safeConfirm(`LV-Position "${pos.bezeichnung}" löschen?`, 'Position löschen');
    if (!ok) return;
    try {
        await window.api.deleteLvPosition(pos.id);
        lvAufgeklapptePositionen.delete(pos.id);
        showToast('LV-Position gelöscht.', 'success');
        await ladePutzplanDaten();
    } catch (e) {
        showToast(e.message || 'Löschen fehlgeschlagen.', 'error');
    }
}

// --- Eintrag-Modal ---
function fuelleLvEintragObjektSelect(selectedKey) {
    const sel = document.getElementById('lv-eintrag-modal-objekt');
    sel.innerHTML = '';
    const gruppen = [
        { label: 'Liegenschaften', liste: state.objekte.liegenschaften || [], typ: 'LIEGENSCHAFT' },
        { label: 'Gebäude', liste: state.objekte.gebaeude || [], typ: 'GEBAEUDE' },
        { label: 'Etagen', liste: state.objekte.etagen || [], typ: 'ETAGE' },
        { label: 'Räume', liste: state.objekte.raeume || [], typ: 'RAUM' }
    ];
    gruppen.forEach(gruppe => {
        if (gruppe.liste.length === 0) return;
        const og = document.createElement('optgroup');
        og.label = gruppe.label;
        gruppe.liste.forEach(k => {
            const opt = document.createElement('option');
            opt.value = `${gruppe.typ}:${k.id}`;
            opt.textContent = putzplanObjektLabel(gruppe.typ, k.id);
            og.appendChild(opt);
        });
        sel.appendChild(og);
    });
    if (selectedKey && [...sel.options].some(o => o.value === selectedKey)) sel.value = selectedKey;
}

function openLvEintragModal(existing = null, parentPos = null) {
    const modal = document.getElementById('lv-eintrag-modal');
    modal.dataset.parentPosId = parentPos ? parentPos.id : (modal.dataset.parentPosId || '');
    const selectedKey = existing ? `${existing.objekt_typ}:${existing.objekt_id}` : '';
    fuelleLvEintragObjektSelect(selectedKey);
    document.getElementById('lv-eintrag-modal-auto').checked = existing ? existing.menge_override == null : true;
    document.getElementById('lv-eintrag-modal-menge').value = existing && existing.menge_override != null ? existing.menge_override : 0;
    toggleEintragOverride();
    document.getElementById('lv-eintrag-modal-turnus-typ').value = existing ? existing.turnus_typ : (parentPos ? parentPos.turnus_typ : 'X_PRO_WOCHE');
    document.getElementById('lv-eintrag-modal-turnus-wert').value = existing ? existing.turnus_wert : (parentPos ? parentPos.turnus_wert : 1);
    document.getElementById('lv-eintrag-modal-notizen').value = existing ? (existing.notizen || '') : '';
    modal.dataset.editIndex = existing ? lvEintraegeDraft.findIndex(d =>
        d.objekt_typ === existing.objekt_typ && d.objekt_id === existing.objekt_id) : '';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function toggleEintragOverride() {
    const auto = document.getElementById('lv-eintrag-modal-auto').checked;
    document.getElementById('lv-eintrag-modal-override-wrap').classList.toggle('hidden', auto);
}

function closeLvEintragModal() {
    const m = document.getElementById('lv-eintrag-modal');
    m.classList.add('hidden');
    m.classList.remove('flex');
}

function saveLvEintragFromModal() {
    const modal = document.getElementById('lv-eintrag-modal');
    const objektVal = document.getElementById('lv-eintrag-modal-objekt').value;
    if (!objektVal) { showToast('Bitte ein Objekt wählen.', 'error'); return; }
    const [typ, idStr] = objektVal.split(':');
    const id = Number(idStr);
    const auto = document.getElementById('lv-eintrag-modal-auto').checked;
    const overrideVal = auto ? '' : (parseFloat(document.getElementById('lv-eintrag-modal-menge').value) || 0);
    const turnusTyp = document.getElementById('lv-eintrag-modal-turnus-typ').value;
    const turnusWert = parseFloat(document.getElementById('lv-eintrag-modal-turnus-wert').value) || 1;
    if (!(turnusWert > 0)) { showToast('Turnus-Wert muss größer 0 sein.', 'error'); return; }

    const eintrag = {
        objekt_typ: typ,
        objekt_id: id,
        menge_override: overrideVal === '' ? null : overrideVal,
        turnus_typ: turnusTyp,
        turnus_wert: turnusWert,
        notizen: document.getElementById('lv-eintrag-modal-notizen').value.trim() || null
    };

    const dupIndex = lvEintraegeDraft.findIndex(d => d.objekt_typ === typ && d.objekt_id === id);
    if (dupIndex >= 0 && modal.dataset.editIndex === '') {
        lvEintraegeDraft.splice(dupIndex, 1);
    }
    if (modal.dataset.editIndex !== '' && modal.dataset.editIndex != null) {
        lvEintraegeDraft[Number(modal.dataset.editIndex)] = eintrag;
    } else {
        lvEintraegeDraft.push(eintrag);
    }

    fuelleLvEintraegeListe();
    updateLvPositionVorschau();
    closeLvEintragModal();
}

// --- Zuschlagsprofil-Modal ---
async function openZuschlagsprofilModal() {
    if (!putzplanProfil) {
        try { putzplanProfil = await window.api.getZuschlagsProfil(); } catch (_e) { putzplanProfil = RC.DEFAULT_ZUSCHLAGSPROFIL; }
    }
    const p = putzplanProfil;
    document.getElementById('zp-profil-name').value = p.profil_name || '';
    document.getElementById('zp-gueltig-ab').value = p.gueltig_ab || '';
    document.getElementById('zp-stundensatz').value = p.standard_stundensatz != null ? p.standard_stundensatz : 15;
    document.getElementById('zp-stundensatz-glas').value = p.standard_stundensatz_glas != null ? p.standard_stundensatz_glas : 18.4;
    document.getElementById('zp-zs-nacht').value = (p.zuschlaege && p.zuschlaege.nacht && p.zuschlaege.nacht.prozent) || 30;
    document.getElementById('zp-zs-sofei').value = (p.zuschlaege && p.zuschlaege.sonntag_feiertag && p.zuschlaege.sonntag_feiertag.prozent) || 80;
    document.getElementById('zp-zs-hoher').value = (p.zuschlaege && p.zuschlaege.hoher_feiertag && p.zuschlaege.hoher_feiertag.prozent) || 200;
    document.getElementById('zp-wochen').value = (p.kalender && p.kalender.wochen_pro_jahr) || 52;
    document.getElementById('zp-tage').value = (p.kalender && p.kalender.tage_pro_jahr) || 365;
    document.getElementById('zuschlagsprofil-modal').classList.remove('hidden');
    document.getElementById('zuschlagsprofil-modal').classList.add('flex');
}

function closeZuschlagsprofilModal() {
    const m = document.getElementById('zuschlagsprofil-modal');
    m.classList.add('hidden');
    m.classList.remove('flex');
}

async function saveZuschlagsprofilFromModal() {
    const profil = {
        ...(putzplanProfil || {}),
        profil_name: document.getElementById('zp-profil-name').value.trim(),
        gueltig_ab: document.getElementById('zp-gueltig-ab').value || null,
        standard_stundensatz: parseFloat(document.getElementById('zp-stundensatz').value) || 0,
        standard_stundensatz_glas: parseFloat(document.getElementById('zp-stundensatz-glas').value) || 0,
        zuschlaege: {
            nacht: { prozent: parseFloat(document.getElementById('zp-zs-nacht').value) || 0 },
            sonntag_feiertag: { prozent: parseFloat(document.getElementById('zp-zs-sofei').value) || 0 },
            hoher_feiertag: { prozent: parseFloat(document.getElementById('zp-zs-hoher').value) || 0 }
        },
        kalender: {
            wochen_pro_jahr: parseInt(document.getElementById('zp-wochen').value, 10) || 52,
            tage_pro_jahr: parseInt(document.getElementById('zp-tage').value, 10) || 365
        },
        quellen: ['BIV Vergabe-Empfehlungen 01/2026', 'Tarifbroschüre Berlin 01/2025']
    };
    const pruefung = RC.validateProfil(profil);
    if (!pruefung.valid) { showToast(pruefung.message, 'error'); return; }
    try {
        await window.api.saveZuschlagsProfil(profil);
        putzplanProfil = profil;
        showToast('Zuschlagsprofil gespeichert.', 'success');
        closeZuschlagsprofilModal();
        await ladePutzplanDaten();
    } catch (e) {
        showToast(e.message || 'Speichern fehlgeschlagen.', 'error');
    }
}

// --- Übernahme in Abrechnungsplan ---
async function uebernehmeLvInPlan() {
    if (!putzplanAuswahl || !putzplanDaten || putzplanDaten.summen.positionenAnzahl === 0) return;
    const summen = putzplanDaten.summen;
    const bestaetigt = await safeConfirm(
        `Reinigungs-LV mit ${summen.positionenAnzahl} Position(en) im Wert von ${formatCurrency(summen.nettoMonat)} netto/Monat als Abrechnungsplan übernehmen?\n\nDer Plan läuft mit Live-Preisen aus dem LV (preise_live): Preisänderungen im LV wirken auf künftige Rechnungsläufe.`,
        'In Abrechnungsplan übernehmen'
    );
    if (!bestaetigt) return;
    try {
        const res = await window.api.uebernehmeLvInAbrechnungsplan({
            objekt_typ: putzplanAuswahl.typ,
            objekt_id: putzplanAuswahl.id
        });
        showToast(`Abrechnungsplan erstellt/aktualisiert: ${res.anzahlPositionen} Positionen, ${formatCurrency(res.monatsNetto)} netto/Monat. Nächster Lauf: ${res.naechste_lauf_am}`, 'success');
    } catch (e) {
        showToast(e.message || 'Übernahme fehlgeschlagen.', 'error');
    }
}
