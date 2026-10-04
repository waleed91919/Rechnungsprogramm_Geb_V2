// cleaning-plan.js
(function() {
const RC = window.ReinigungController;
const OC_PUTZ = window.ObjektController;

function putzplanKnotenListe() {
    const alle = [];
    (window.state.objekte.liegenschaften || []).forEach(l => alle.push({ typ: 'LIEGENSCHAFT', id: l.id, ebene: 0 }));
    (window.state.objekte.gebaeude || []).forEach(g => alle.push({ typ: 'GEBAEUDE', id: g.id, ebene: 1 }));
    (window.state.objekte.etagen || []).forEach(e => alle.push({ typ: 'ETAGE', id: e.id, ebene: 2 }));
    (window.state.objekte.raeume || []).forEach(r => alle.push({ typ: 'RAUM', id: r.id, ebene: 3 }));
    return alle;
}

window.putzplanKnotenListe = putzplanKnotenListe;

function putzplanObjektLabel(typ, id) {
    return OC_PUTZ.buildPfad(typ, id, window.state.objekte) || `${typ}:${id}`;
}

window.putzplanObjektLabel = putzplanObjektLabel;

async function renderPutzplan() {
    try {
        window.putzplanProfil = await window.api.getZuschlagsProfil();
    } catch (e) {
        window.putzplanProfil = RC.DEFAULT_ZUSCHLAGSPROFIL;
    }

    fuellePutzplanObjektSelect();

    if (!window.putzplanAuswahl && window.state.window.putzplanAuswahl) window.putzplanAuswahl = window.state.window.putzplanAuswahl;
    if (!window.putzplanAuswahl) {
        const ersteLieg = (window.state.objekte.liegenschaften || [])[0];
        if (ersteLieg) window.putzplanAuswahl = { typ: 'LIEGENSCHAFT', id: ersteLieg.id };
    }
    if (!window.putzplanAuswahl) {
        document.getElementById('lv-bereiche-liste').innerHTML = '';
        document.getElementById('lv-leer').classList.remove('hidden');
        renderPutzplanBaum();
        return;
    }

    syncPutzplanSelect();
    renderPutzplanBaum();
    await ladePutzplanDaten();
}

window.renderPutzplan = renderPutzplan;

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

window.fuellePutzplanObjektSelect = fuellePutzplanObjektSelect;

function syncPutzplanSelect() {
    if (!window.putzplanAuswahl) return;
    const sel = document.getElementById('putzplan-objekt-select');
    const wert = `${window.putzplanAuswahl.typ}:${window.putzplanAuswahl.id}`;
    if ([...sel.options].some(o => o.value === wert)) sel.value = wert;
}

window.syncPutzplanSelect = syncPutzplanSelect;

function onPutzplanSelectChange(val) {
    const [typ, id] = String(val).split(':');
    selectPutzplanObjekt(typ, Number(id));
}

window.onPutzplanSelectChange = onPutzplanSelectChange;

function selectPutzplanObjekt(typ, id) {
    window.putzplanAuswahl = { typ, id };
    window.state.window.putzplanAuswahl = window.putzplanAuswahl;
    syncPutzplanSelect();
    renderPutzplanBaum();
    ladePutzplanDaten();
}

window.selectPutzplanObjekt = selectPutzplanObjekt;

async function ladePutzplanDaten() {
    if (!window.putzplanAuswahl) return;
    try {
        window.putzplanDaten = await window.api.getPutzplan(window.putzplanAuswahl.typ, window.putzplanAuswahl.id);
    } catch (e) {
        window.showToast(e.message || 'Putzplan konnte nicht geladen werden.', 'error');
        return;
    }
    renderLvBereiche();
}

window.ladePutzplanDaten = ladePutzplanDaten;

function updatePutzplanKpis(summen) {
    document.getElementById('kpi-lv-stunden').innerText = Number(summen.jahresStunden).toLocaleString('de-DE') + ' h';
    document.getElementById('kpi-lv-netto-jahr').innerText = window.formatCurrency(summen.nettoJahr);
    document.getElementById('kpi-lv-netto-monat').innerText = window.formatCurrency(summen.nettoMonat);
    document.getElementById('kpi-lv-zuschlaege').innerText = window.formatCurrency(summen.zuschlaegeGesamt);
    const btn = document.getElementById('btn-lv-uebernehmen');
    btn.disabled = !(summen.positionenAnzahl > 0);
}

window.updatePutzplanKpis = updatePutzplanKpis;

function renderPutzplanBaum() {
    const container = document.getElementById('putzplan-baum');
    container.innerHTML = '';

    (window.state.objekte.liegenschaften || []).forEach(l => {
        renderPutzplanBaumZeile(container, 'LIEGENSCHAFT', l, 0);
    });

    if ((window.state.objekte.liegenschaften || []).length === 0) {
        container.innerHTML = '<p class="p-4 text-center text-slate-400 text-xs">Noch keine Liegenschaften angelegt.</p>';
    }
}

window.renderPutzplanBaum = renderPutzplanBaum;

function renderPutzplanBaumZeile(container, typ, knoten, tiefe) {
    const badge = typ === 'RAUM'
        ? (knoten.einheit === 'm²' ? Number(knoten.flaeche || 0).toLocaleString('de-DE') + ' m²' : (knoten.einheit || '-'))
        : Number(knoten.flaeche_summe != null ? knoten.flaeche_summe : OC_PUTZ.summiereFlaechen(typ, knoten.id, window.state.objekte)).toLocaleString('de-DE') + ' m²';
    renderPutzplanBaumKnoten(container, typ, knoten, badge, tiefe);

    if (typ === 'RAUM') return;

    const kindKonfig = {
        LIEGENSCHAFT: { liste: 'gebaeude', childTyp: 'GEBAEUDE' },
        GEBAEUDE: { liste: 'etagen', childTyp: 'ETAGE' },
        ETAGE: { liste: 'raeume', childTyp: 'RAUM' }
    }[typ];
    const kinder = (window.state.objekte[kindKonfig.liste] || []).filter(k => {
        if (kindKonfig.childTyp === 'GEBAEUDE') return k.liegenschaft_id === knoten.id;
        if (kindKonfig.childTyp === 'ETAGE') return k.gebaeude_id === knoten.id;
        return k.etage_id === knoten.id;
    });
    kinder.forEach(kind => renderPutzplanBaumZeile(container, kindKonfig.childTyp, kind, tiefe + 1));
}

window.renderPutzplanBaumZeile = renderPutzplanBaumZeile;

function renderPutzplanBaumKnoten(container, typ, knoten, badge, tiefe) {
    const aktiv = window.putzplanAuswahl && window.putzplanAuswahl.typ === typ && window.putzplanAuswahl.id === knoten.id;
    const zeile = document.createElement('button');
    zeile.type = 'button';
    zeile.className = `w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-left text-sm transition-colors ${aktiv ? 'bg-primary/10 text-primary font-semibold' : 'text-slate-600 hover:bg-slate-100'}`;
    zeile.style.paddingLeft = `${8 + tiefe * 16}px`;
    zeile.onclick = () => selectPutzplanObjekt(typ, knoten.id);

    const labelWrap = document.createElement('span');
    labelWrap.className = 'flex items-center gap-1.5 min-w-0';
    const icon = { LIEGENSCHAFT: 'apartment', GEBAEUDE: 'domain', ETAGE: 'layers', RAUM: 'meeting_room' }[typ];
    labelWrap.innerHTML = `<span class="material-symbols-outlined text-[16px] ${aktiv ? 'text-primary' : 'text-slate-400'} shrink-0">${icon}</span><span class="truncate">${window.sanitize(putzplanObjektLabel(typ, knoten.id))}</span>`;
    zeile.appendChild(labelWrap);

    const badgeEl = document.createElement('span');
    badgeEl.className = 'shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200';
    badgeEl.textContent = badge;
    zeile.appendChild(badgeEl);
    container.appendChild(zeile);
}

window.renderPutzplanBaumKnoten = renderPutzplanBaumKnoten;

function baueZuschlagsTooltip(kalkulation) {
    if (!kalkulation || !kalkulation.zuschlaege || kalkulation.zuschlaege.length === 0) return 'Keine Zuschläge';
    return kalkulation.zuschlaege.map(z =>
        `${z.label}: ${Number(z.anteilProzent).toLocaleString('de-DE')} % × ${Number(z.satzProzent).toLocaleString('de-DE')} % = ${window.formatCurrency(z.betrag)}/Jahr`
    ).join('\n');
}

window.baueZuschlagsTooltip = baueZuschlagsTooltip;

function renderLvBereiche() {
    const listeEl = document.getElementById('lv-bereiche-liste');
    const leerEl = document.getElementById('lv-leer');
    listeEl.innerHTML = '';

    if (!window.putzplanDaten) { leerEl.classList.add('hidden'); return; }
    updatePutzplanKpis(window.putzplanDaten.summen);

    const suchtext = (document.getElementById('search-lv').value || '').trim().toLowerCase();
    const bereiche = window.putzplanDaten.bereiche.filter(b => !suchtext || b.name.toLowerCase().includes(suchtext));

    let sichtbarePositionen = 0;
    bereiche.forEach(bereich => {
        const card = document.createElement('div');
        card.className = 'bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden';

        const header = document.createElement('div');
        header.className = 'px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3';
        header.innerHTML = `
            <div class="flex items-center gap-2 min-w-0">
                <h4 class="font-semibold text-slate-800 text-sm truncate">${window.sanitize(bereich.name)}</h4>
                <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-500 border border-slate-200">${bereich.positionen.length} Pos.</span>
                ${bereich.aktiv === 0 ? '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-red-50 text-red-600 border border-red-200">Inaktiv</span>' : ''}
                ${bereich.positionsnr_prefix ? `<span class="text-[11px] font-mono text-slate-400">Präfix ${window.sanitize(bereich.positionsnr_prefix)}</span>` : ''}
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
                    ? `<span>${Number(k.direkteMenge).toLocaleString('de-DE')} ${window.sanitize(pos.menge_einheit)}</span>`
                    : `<span title="${window.sanitize((k.eintraege || []).map(e => `${e.objektLabel}: ${Number(e.menge).toLocaleString('de-DE')} ${window.sanitize(pos.menge_einheit)}`).join(' | '))}">${(k.eintraege || []).reduce((s, e) => s + Number(e.menge), 0).toLocaleString('de-DE')} ${window.sanitize(pos.menge_einheit)}</span><span class="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">aus Raumfläche</span>`;

                tr.innerHTML = `
                    <td class="px-3 py-2 font-mono text-xs text-slate-500 align-top">${window.sanitize(pos.positionsnr || '-')}</td>
                    <td class="px-3 py-2 align-top">
                        <div class="font-medium text-slate-800">${window.sanitize(pos.bezeichnung)}</div>
                        ${pos.beschreibung ? `<div class="text-xs text-slate-400 truncate max-w-[280px]" title="${window.sanitize(pos.beschreibung)}">${window.sanitize(pos.beschreibung)}</div>` : ''}
                    </td>
                    <td class="px-3 py-2 text-right align-top whitespace-nowrap">${mengeAnzeige}</td>
                    <td class="px-3 py-2 align-top whitespace-nowrap">${window.sanitize(RC.buildTurnusLabel(pos.turnus_typ, pos.turnus_wert))}</td>
                    <td class="px-3 py-2 text-right align-top whitespace-nowrap">${Number(pos.zeitbedarf_min_je_einheit).toLocaleString('de-DE')}</td>
                    <td class="px-3 py-2 text-right align-top whitespace-nowrap">${Number(Math.round(k.jahresStunden * 100) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })}</td>
                    <td class="px-3 py-2 text-right align-top whitespace-nowrap">
                        <span class="font-medium cursor-help" title="${window.sanitize(baueZuschlagsTooltip(k)).replace(/"/g, '&quot;')}">${window.formatCurrency(k.nettoJahrInklZuschlaege)}</span>
                        ${(k.zuschlaege || []).length > 0 ? `<div class="text-[10px] text-purple-600">inkl. ${window.formatCurrency(k.zuschlaegeGesamt)} Zuschläge</div>` : ''}
                    </td>
                    <td class="px-3 py-2 text-right align-top whitespace-nowrap font-semibold">${window.formatCurrency(k.nettoMonat)}</td>
                    <td class="px-3 py-2 text-right align-top whitespace-nowrap"></td>`;

                const aktionenTd = tr.lastElementChild;
                aktionenTd.appendChild(mkBtn('edit', 'Position bearbeiten', 'text-slate-400 hover:text-primary p-1 mx-0.5 transition-colors', () => openLvPositionModal(pos, bereich.id)));
                aktionenTd.appendChild(mkBtn('meeting_room', `Einträge (${(k.eintraege || []).length})`, 'text-slate-400 hover:text-green-600 p-1 mx-0.5 transition-colors', () => toggleLvEintraege(pos)));
                aktionenTd.appendChild(mkBtn('delete', 'Position löschen', 'text-slate-400 hover:text-red-500 p-1 mx-0.5 transition-colors', () => deleteLvPositionMitConfirm(pos)));

                tbody.appendChild(tr);

                if (window.lvAufgeklapptePositionen.has(pos.id)) {
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

window.renderLvBereiche = renderLvBereiche;

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
                <span class="truncate"><span class="material-symbols-outlined text-[14px] text-slate-400 align-middle">place</span> <span class="font-medium">${window.sanitize(e.objektLabel)}</span></span>
                <span class="text-slate-500 whitespace-nowrap">${e.mengeOverride != null ? 'Override ' : ''}${Number(e.menge).toLocaleString('de-DE')} · ${window.sanitize(RC.buildTurnusLabel(e.turnusTyp, e.turnusWert))}</span>
                <span class="font-semibold whitespace-nowrap">${window.formatCurrency(e.nettoGesamt)}</span>`;
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

window.baueEintraegeZeile = baueEintraegeZeile;

function toggleLvEintraege(pos) {
    if (window.lvAufgeklapptePositionen.has(pos.id)) window.lvAufgeklapptePositionen.delete(pos.id);
    else window.lvAufgeklapptePositionen.add(pos.id);
    renderLvBereiche();
}

window.toggleLvEintraege = toggleLvEintraege;

async function uebernehmeLvInPlan() {
    if (!window.putzplanAuswahl || !window.putzplanDaten || window.putzplanDaten.summen.positionenAnzahl === 0) return;
    const summen = window.putzplanDaten.summen;
    const bestaetigt = await window.safeConfirm(
        `Reinigungs-LV mit ${summen.positionenAnzahl} Position(en) im Wert von ${window.formatCurrency(summen.nettoMonat)} netto/Monat als Abrechnungsplan übernehmen?\n\nDer Plan läuft mit Live-Preisen aus dem LV (preise_live): Preisänderungen im LV wirken auf künftige Rechnungsläufe.`,
        'In Abrechnungsplan übernehmen'
    );
    if (!bestaetigt) return;
    try {
        const res = await window.api.uebernehmeLvInAbrechnungsplan({
            objekt_typ: window.putzplanAuswahl.typ,
            objekt_id: window.putzplanAuswahl.id
        });
        window.showToast(`Abrechnungsplan erstellt/aktualisiert: ${res.anzahlPositionen} Positionen, ${window.formatCurrency(res.monatsNetto)} netto/Monat. Nächster Lauf: ${res.naechste_lauf_am}`, 'success');
    } catch (e) {
        window.showToast(e.message || 'Übernahme fehlgeschlagen.', 'error');
    }
}

window.uebernehmeLvInPlan = uebernehmeLvInPlan;

})();
