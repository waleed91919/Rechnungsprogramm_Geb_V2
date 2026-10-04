(function() {
// --- Detail-View ---
let odCurrent = { typ: null, id: null, details: null, historie: [] };

function switchObjektTab(tabKey) {
    document.querySelectorAll('.od-tab-btn').forEach(btn => {
        btn.classList.remove('border-primary', 'text-primary', 'font-bold');
        btn.classList.add('border-transparent', 'text-slate-500', 'font-semibold');
    });
    document.querySelectorAll('.od-tab-panel').forEach(panel => {
        panel.classList.add('hidden');
        panel.classList.remove('flex');
    });

    const activeBtn = document.getElementById(`od-tab-btn-${tabKey}`);
    const activePanel = document.getElementById(`od-panel-${tabKey}`);
    if (activeBtn && activePanel) {
        activeBtn.classList.remove('border-transparent', 'text-slate-500', 'font-semibold');
        activeBtn.classList.add('border-primary', 'text-primary', 'font-bold');
        activePanel.classList.remove('hidden');
        activePanel.classList.add('flex');
    }

    if (!odCurrent.typ) return;
    if (tabKey === 'historie') {
        renderObjektHistorie();
    } else if (tabKey === 'abrechnungsplaene') {
        if (typeof renderObjektPlaene === 'function') renderObjektPlaene(odCurrent.typ, odCurrent.id);
    }
}

async function openObjektDetails(objektTyp, objektId) {
    odCurrent = { typ: objektTyp, id: objektId, details: null, historie: [] };
    switchView('objekt-details');
    await refreshObjektDetails();
    switchObjektTab('stammdaten');
}

function closeObjektDetails() {
    switchView('objekte');
}

async function refreshObjektDetails() {
    if (!odCurrent.typ || !odCurrent.id) return;
    if (!state.objekte) await refreshObjekteState();

    const details = await window.api.getObjektDetails(odCurrent.typ, odCurrent.id);
    odCurrent.details = details;

    const knoten = details.knoten;
    document.getElementById('od-name').textContent = knoten.name;
    document.getElementById('od-typ').textContent = OBJEKT_TYP_LABEL[odCurrent.typ] || odCurrent.typ;
    document.getElementById('od-pfad').textContent = details.pfad;

    const empfEl = document.getElementById('od-empfaenger');
    const empf = details.empfaenger;
    if (empf && empf.kundeId) {
        const artLabel = empf.art ? ` · ${OBJEKT_ART_LABEL[empf.art] || empf.art}` : '';
        if (empf.quelle === 'DIREKT') {
            empfEl.innerHTML = `<span class="material-symbols-outlined text-[16px]">domain</span> Rechnungsempfänger: ${escapeHtml(empf.name || '#' + empf.kundeId)}${artLabel}
                <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">direkt</span>`;
        } else {
            const quelleLabel = empf.quelle.replace('GEERBT_VON_', '');
            empfEl.innerHTML = `<span class="material-symbols-outlined text-[16px]">domain</span> Rechnungsempfänger: ${escapeHtml(empf.name || '#' + empf.kundeId)}${artLabel}
                <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-yellow-100 text-yellow-800 border border-yellow-200">geerbt von ${OBJEKT_TYP_LABEL[quelleLabel] || quelleLabel}</span>`;
        }
    } else {
        empfEl.innerHTML = '<span class="material-symbols-outlined text-[16px] text-red-400">warning</span><span class="text-red-500 italic">Kein Rechnungsempfänger gesetzt – Dauerrechnungs-Lauf nicht möglich.</span>';
    }

    document.getElementById('od-edit-btn').onclick = () => openObjektModal(odCurrent.typ, null, odCurrent.id);
    const kindEbene = { LIEGENSCHAFT: 'GEBAEUDE', GEBAEUDE: 'ETAGE', ETAGE: 'RAUM', RAUM: null }[odCurrent.typ];
    const neuBtn = document.getElementById('od-neu-btn');
    neuBtn.classList.toggle('hidden', !kindEbene);
    neuBtn.onclick = () => kindEbene && openObjektModal(kindEbene, odCurrent.id);

    renderObjektStammdaten(details);
    renderObjektStruktur(details);
    odCurrent.historie = await window.api.getObjektHistorie(odCurrent.typ, odCurrent.id);
    window.objektHistorieFilter = 'alle';
    renderObjektHistorie();
    renderObjektPlaene(odCurrent.typ, odCurrent.id);
}

function renderObjektStammdaten(details) {
    const knoten = details.knoten;
    const dl = document.getElementById('od-stammdaten');
    dl.innerHTML = '';

    const felder = [];
    if (knoten.objekt_nr) felder.push(['Objekt-Nr.', knoten.objekt_nr]);
    if (knoten.raum_nr) felder.push(['Raum-Nr.', knoten.raum_nr]);
    felder.push(['Name', knoten.name]);
    if (knoten.strasse) felder.push(['Straße', knoten.strasse]);
    if (knoten.plz || knoten.ort) felder.push(['PLZ / Ort', `${knoten.plz || ''} ${knoten.ort || ''}`.trim()]);
    if (odCurrent.typ === 'GEBAEUDE') {
        if (knoten.baujahr != null) felder.push(['Baujahr', knoten.baujahr]);
        if (knoten.geschosse != null) felder.push(['Geschosse', knoten.geschosse]);
    }
    if (odCurrent.typ === 'ETAGE' && knoten.ebene_nummer != null) felder.push(['Ebenen-Nr.', knoten.ebene_nummer]);
    if (odCurrent.typ === 'RAUM') {
        felder.push(['Fläche', `${knoten.flaeche || 0} ${knoten.einheit || 'm²'}`]);
        if (knoten.raumtyp) felder.push(['Raumtyp', knoten.raumtyp]);
        if (knoten.bodenbelag) felder.push(['Bodenbelag', knoten.bodenbelag]);
    }
    felder.push(['Status', knoten.aktiv !== 0 ? 'Aktiv' : 'Inaktiv']);

    felder.forEach(([label, wert]) => {
        const dt = document.createElement('dt');
        dt.className = 'text-slate-400 font-medium whitespace-nowrap';
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.className = 'text-slate-700 font-medium';
        dd.textContent = wert;
        dl.appendChild(dt);
        dl.appendChild(dd);
    });

    const kz = document.getElementById('od-kennzahlen');
    kz.innerHTML = '';
    const kennzahlen = [
        ['Fläche gesamt', `${details.kennzahlen.flaecheGesamt.toLocaleString('de-DE')} m²`],
        ['Räume darunter', details.kennzahlen.anzahlRaeume],
        ['Etagen darunter', details.kennzahlen.anzahlEtagen],
        ['Gebäude darunter', details.kennzahlen.anzahlGebaeude]
    ];
    kennzahlen.forEach(([label, wert]) => {
        const div = document.createElement('div');
        div.className = 'bg-slate-50 border border-slate-100 rounded-lg p-3';
        const p = document.createElement('p');
        p.className = 'text-[11px] font-bold uppercase tracking-wider text-slate-400';
        p.textContent = label;
        const h = document.createElement('h4');
        h.className = 'text-lg font-bold text-slate-800 mt-1';
        h.textContent = wert;
        div.appendChild(p);
        div.appendChild(h);
        kz.appendChild(div);
    });

    const notizenEl = document.getElementById('od-notizen');
    if (knoten.notizen) {
        notizenEl.textContent = knoten.notizen;
        notizenEl.classList.remove('hidden');
    } else {
        notizenEl.classList.add('hidden');
    }
}

function renderObjektStruktur(details) {
    const ul = document.getElementById('od-struktur-baum');
    const leer = document.getElementById('od-struktur-leer');
    ul.innerHTML = '';

    const kinderListen = [
        { typ: 'GEBAEUDE', liste: details.kinder.gebaeude },
        { typ: 'ETAGE', liste: details.kinder.etagen },
        { typ: 'RAUM', liste: details.kinder.raeume }
    ];

    let gesamt = 0;
    kinderListen.forEach(({ typ, liste }) => {
        (liste || []).forEach(kind => {
            gesamt++;
            const li = document.createElement('li');
            li.className = 'flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-slate-50 group';

            const links = document.createElement('div');
            links.className = 'flex items-center gap-2';
            links.innerHTML = `<span class="material-symbols-outlined text-[16px] text-slate-400">${{ GEBAEUDE: 'domain', ETAGE: 'layers', RAUM: 'meeting_room' }[typ]}</span>
                <span class="cursor-pointer hover:text-primary font-medium" data-id="${kind.id}" data-typ="${typ}">${kind.name}</span>
                ${objektBadge(typ, 'ml-1')}`;

            links.querySelector('span[data-typ], span.font-medium').onclick = () => openObjektDetails(typ, kind.id);

            const rechts = document.createElement('div');
            rechts.className = 'flex items-center gap-1';
            const flaecheInfo = typ === 'RAUM' ? `${kind.flaeche || 0} ${kind.einheit || 'm²'}`
                : (kind.flaeche_summe != null ? `${Number(kind.flaeche_summe).toLocaleString('de-DE')} m²` : '');
            if (flaecheInfo) {
                const spanF = document.createElement('span');
                spanF.className = 'text-xs text-slate-400 mr-2';
                spanF.textContent = flaecheInfo;
                rechts.appendChild(spanF);
            }

            const mkBtn = (icon, title, cls, fn) => {
                const b = document.createElement('button');
                b.title = title;
                b.className = cls;
                b.onclick = fn;
                const s = document.createElement('span');
                s.className = 'material-symbols-outlined text-[16px]';
                s.textContent = icon;
                b.appendChild(s);
                return b;
            };

            const subKindEbene = { GEBAEUDE: 'ETAGE', ETAGE: 'RAUM', RAUM: null }[typ];
            if (subKindEbene) {
                rechts.appendChild(mkBtn('add', OBJEKT_TYP_LABEL[subKindEbene] + ' anlegen', 'text-slate-400 hover:text-green-600 transition-colors', () => openObjektModal(subKindEbene, kind.id)));
            }

            rechts.appendChild(mkBtn('edit', 'Bearbeiten', 'text-slate-400 hover:text-primary transition-colors', () => openObjektModal(typ, null, kind.id)));
            rechts.appendChild(mkBtn('north_east', 'Details', 'text-slate-400 hover:text-primary transition-colors', () => openObjektDetails(typ, kind.id)));
            rechts.appendChild(mkBtn('delete', 'Löschen', 'text-slate-400 hover:text-red-500 transition-colors', () => deleteObjektMitConfirm(typ, kind.id)));

            li.appendChild(links);
            li.appendChild(rechts);
            ul.appendChild(li);
        });
    });

    leer.classList.toggle('hidden', gesamt > 0);
}

function odEbeneHinzufuegen() {
    const kindEbene = { LIEGENSCHAFT: 'GEBAEUDE', GEBAEUDE: 'ETAGE', ETAGE: 'RAUM', RAUM: null }[odCurrent.typ];
    if (!kindEbene) return;
    openObjektModal(kindEbene, odCurrent.id);
}

// --- Historie ---
function setObjektHistorieFilter(filter) {
    window.objektHistorieFilter = filter;
    document.querySelectorAll('#od-hist-filter .od-hist-chip').forEach(chip => {
        const aktivChip = chip.dataset.filter === filter;
        chip.classList.toggle('bg-primary', aktivChip);
        chip.classList.toggle('text-white', aktivChip);
        chip.classList.toggle('bg-slate-100', !aktivChip);
        chip.classList.toggle('text-slate-600', !aktivChip);
    });
    renderObjektHistorie();
}

function renderObjektHistorie() {
    const tbody = document.getElementById('od-historie-body');
    const leerEl = document.getElementById('od-historie-leer');
    const summenEl = document.getElementById('od-historie-summen');
    if (!tbody) return;
    tbody.innerHTML = '';

    const alle = odCurrent.historie || [];
    const gefiltert = alle.filter(d => {
        if (window.objektHistorieFilter === 'RE') return d.type === 'rechnung';
        if (window.objektHistorieFilter === 'AN') return d.type === 'angebot';
        if (window.objektHistorieFilter === 'DAUERRECHNUNG') return d.matchArt === 'DAUERRECHNUNG';
        return true;
    });

    gefiltert.forEach(d => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-blue-50/50 transition-colors cursor-pointer';
        tr.onclick = () => { if (d.type === 'rechnung') openRechnungModal(d.id); else openAngebotModal(d.id); };

        const tdNr = document.createElement('td');
        tdNr.className = 'px-4 font-mono text-xs text-slate-500';
        tdNr.textContent = d.nr;
        tr.appendChild(tdNr);

        const tdTyp = document.createElement('td');
        tdTyp.className = 'px-4';
        const isRe = d.type === 'rechnung';
        tdTyp.innerHTML = `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${isRe ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}">${isRe ? 'RE' : 'AN'}</span>${d.matchArt === 'DAUERRECHNUNG' ? '<span class="ml-1 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-100 text-purple-800">Dauer</span>' : ''}`;
        tr.appendChild(tdTyp);

        const tdDatum = document.createElement('td');
        tdDatum.className = 'px-4 text-slate-600';
        tdDatum.textContent = d.datum ? new Date(d.datum).toLocaleDateString('de-DE') : '-';
        tr.appendChild(tdDatum);

        const tdFaellig = document.createElement('td');
        tdFaellig.className = 'px-4 text-slate-600';
        tdFaellig.textContent = d.faellig ? new Date(d.faellig).toLocaleDateString('de-DE') : '-';
        tr.appendChild(tdFaellig);

        const tdStatus = document.createElement('td');
        tdStatus.className = 'px-4';
        tdStatus.innerHTML = `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200">${d.status || '-'}</span>`;
        tr.appendChild(tdStatus);

        const tdNetto = document.createElement('td');
        tdNetto.className = 'px-4 text-right text-slate-700';
        tdNetto.textContent = formatCurrency(d.netto || 0);
        tr.appendChild(tdNetto);

        const tdBrutto = document.createElement('td');
        tdBrutto.className = 'px-4 text-right font-medium text-slate-800';
        tdBrutto.textContent = formatCurrency(d.brutto || 0);
        tr.appendChild(tdBrutto);

        const tdKunde = document.createElement('td');
        tdKunde.className = 'px-4 text-slate-600';
        tdKunde.textContent = d.kundeName || '-';
        tr.appendChild(tdKunde);

        const tdAction = document.createElement('td');
        tdAction.className = 'px-4 text-right';
        tdAction.innerHTML = '<span class="material-symbols-outlined text-[18px] text-slate-400 inline-block">open_in_new</span>';
        tr.appendChild(tdAction);

        tbody.appendChild(tr);
    });

    leerEl.classList.toggle('hidden', gefiltert.length > 0);

    summenEl.innerHTML = '';
    const rechnungen = alle.filter(d => d.type === 'rechnung' && d.status !== 'Storniert');
    const offen = rechnungen.filter(d => d.status !== 'Bezahlt');
    const bezahlt = rechnungen.filter(d => d.status === 'Bezahlt');
    const summe = list => list.reduce((s, d) => s + (d.netto || 0), 0);
    const trSum = document.createElement('tr');
    trSum.innerHTML = `
        <td colspan="5" class="px-4 py-2 text-right">Σ netto offen / bezahlt:</td>
        <td class="px-4 py-2 text-right text-slate-800">${formatCurrency(summe(offen))} / ${formatCurrency(summe(bezahlt))}</td>
        <td colspan="3" class="px-4"></td>`;
    summenEl.appendChild(trSum);
}

// --- Abrechnungspläne-Tab (F2 befüllt diesen Hook) ---
function renderObjektPlaene(objektTyp, objektId) {
    const inhalt = document.getElementById('od-plaene-inhalt');
    if (!inhalt || !odCurrent.typ) return;
    inhalt.innerHTML = `
        <div class="p-8 text-center text-slate-400 flex flex-col items-center gap-2">
            <span class="material-symbols-outlined text-4xl text-slate-200">event_repeat</span>
            <p>Noch keine Abrechnungspläne für dieses Objekt vorhanden.</p>
        </div>`;
}

function odOpenPlanModal() {
    if (typeof openPlanModal === 'function') {
        openPlanModal(null, `${odCurrent.typ}:${odCurrent.id}`);
    } else {
        showToast('Dauerrechnungen-Modul noch nicht verfügbar.', 'info');
    }
}


window.odCurrent = odCurrent;
window.switchObjektTab = switchObjektTab;
window.openObjektDetails = openObjektDetails;
window.closeObjektDetails = closeObjektDetails;
window.refreshObjektDetails = refreshObjektDetails;
window.renderObjektStammdaten = renderObjektStammdaten;
window.renderObjektStruktur = renderObjektStruktur;
window.odEbeneHinzufuegen = odEbeneHinzufuegen;
window.setObjektHistorieFilter = setObjektHistorieFilter;
window.renderObjektHistorie = renderObjektHistorie;
window.renderObjektPlaene = renderObjektPlaene;
window.odOpenPlanModal = odOpenPlanModal;
if (typeof module !== 'undefined' && module.exports) {
module.exports = { odCurrent, switchObjektTab, openObjektDetails, closeObjektDetails, refreshObjektDetails, renderObjektStammdaten, renderObjektStruktur, odEbeneHinzufuegen, setObjektHistorieFilter, renderObjektHistorie, renderObjektPlaene, odOpenPlanModal };
}
})();
