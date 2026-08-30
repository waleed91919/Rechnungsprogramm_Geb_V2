// Objektverwaltung (F1): Rendering & Interaktion
const OBJEKT_TYP_LABEL = {
    LIEGENSCHAFT: 'Liegenschaft',
    GEBAEUDE: 'Gebäude',
    ETAGE: 'Etage',
    RAUM: 'Raum'
};

const OBJEKT_ART_LABEL = {
    EIGENTUEMER: 'Eigentümer',
    MIETER: 'Mieter',
    HAUSVERWALTUNG: 'HV'
};

let objektHistorieFilter = 'alle';

function objekteStateLeer() {
    return { liegenschaften: [], gebaeude: [], etagen: [], raeume: [] };
}

async function refreshObjekteState() {
    if (!window.api || !window.api.getObjektBaum) return;
    const baum = await window.api.getObjektBaum();
    state.objekte = {
        liegenschaften: baum.liegenschaften || [],
        gebaeude: baum.gebaeude || [],
        etagen: baum.etagen || [],
        raeume: baum.raeume || []
    };
}

function objektBadge(typ, extra = '') {
    const farben = {
        LIEGENSCHAFT: 'bg-blue-100 text-blue-800 border-blue-200',
        GEBAEUDE: 'bg-indigo-100 text-indigo-800 border-indigo-200',
        ETAGE: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        RAUM: 'bg-slate-100 text-slate-700 border-slate-200'
    };
    return `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${farben[typ] || ''} ${extra}">${OBJEKT_TYP_LABEL[typ] || typ}</span>`;
}

function buildObjekteRows(filterQuery = '', statusFilter = 'alle') {
    const OC = window.ObjektController;
    const q = filterQuery.trim().toLowerCase();
    const matchQuery = (k, typ) => {
        if (!q) return true;
        const pfad = OC ? OC.buildPfad(typ, k.id, state.objekte).toLowerCase() : '';
        return String(k.name || '').toLowerCase().includes(q) ||
            String(k.objekt_nr || '').toLowerCase().includes(q) ||
            String(k.raum_nr || '').toLowerCase().includes(q) ||
            String(k.ort || '').toLowerCase().includes(q) ||
            String(k.strasse || '').toLowerCase().includes(q) ||
            String(k.plz || '').toLowerCase().includes(q) ||
            String(k.raumtyp || '').toLowerCase().includes(q) ||
            String(k.bodenbelag || '').toLowerCase().includes(q) ||
            pfad.includes(q);
    };

    const matchStatus = k => {
        if (statusFilter === 'aktiv') return k.aktiv !== 0;
        if (statusFilter === 'inaktiv') return k.aktiv === 0;
        return true;
    };

    const match = (k, typ) => matchQuery(k, typ) && matchStatus(k);

    const rows = [];
    const lies = [...(state.objekte.liegenschaften || [])].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    for (const l of lies) {
        if (match(l, 'LIEGENSCHAFT')) rows.push({ typ: 'LIEGENSCHAFT', knoten: l, ebene: 0 });
        const gebs = (state.objekte.gebaeude || []).filter(g => g.liegenschaft_id === l.id);
        for (const g of gebs) {
            if (match(g, 'GEBAEUDE')) rows.push({ typ: 'GEBAEUDE', knoten: g, ebene: 1 });
            const etgs = (state.objekte.etagen || []).filter(e => e.gebaeude_id === g.id);
            for (const e of etgs) {
                if (match(e, 'ETAGE')) rows.push({ typ: 'ETAGE', knoten: e, ebene: 2 });
                for (const r of (state.objekte.raeume || []).filter(r => r.etage_id === e.id)) {
                    if (match(r, 'RAUM')) rows.push({ typ: 'RAUM', knoten: r, ebene: 3 });
                }
            }
        }
    }
    return { rows, OC };
}

function renderObjekte(filterQuery) {
    if (!state.objekte) state.objekte = objekteStateLeer();
    const tbody = document.getElementById('objekte-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const query = filterQuery !== undefined ? filterQuery : (document.getElementById('search-objekte')?.value || '');
    const statusFilter = document.getElementById('filter-objekte-status')?.value || 'alle';

    const { rows, OC } = buildObjekteRows(query, statusFilter);

    rows.forEach(({ typ, knoten, ebene }) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-blue-50/50 transition-colors group' + (knoten.aktiv === 0 ? ' opacity-50' : '');

        const tdNr = document.createElement('td');
        tdNr.className = 'px-4 align-middle text-slate-500 text-xs font-mono';
        tdNr.textContent = knoten.objekt_nr || (typ === 'RAUM' ? knoten.raum_nr : '') || '-';
        tr.appendChild(tdNr);

        const tdName = document.createElement('td');
        tdName.className = 'px-4 align-middle cursor-pointer hover:text-primary transition-colors';
        const einzug = '&nbsp;&nbsp;&nbsp;&nbsp;'.repeat(ebene);
        const pfeil = ebene > 0 ? '<span class="text-slate-300 mr-1">' + '▸'.repeat(Math.min(ebene, 3)) + '</span>' : '';
        tdName.innerHTML = `${einzug}${pfeil}<span class="${ebene === 0 ? 'font-semibold text-slate-800' : 'font-medium'}">${knoten.name}</span>`;
        tdName.onclick = () => openObjektDetails(typ, knoten.id);
        tr.appendChild(tdName);

        const tdTyp = document.createElement('td');
        tdTyp.className = 'px-4 align-middle';
        tdTyp.innerHTML = objektBadge(typ);
        tr.appendChild(tdTyp);

        const tdOrt = document.createElement('td');
        tdOrt.className = 'px-4 align-middle text-slate-600';
        tdOrt.textContent = `${knoten.plz ? knoten.plz + ' ' : ''}${knoten.ort || ''}`.trim() || '-';
        tr.appendChild(tdOrt);

        const tdEmpf = document.createElement('td');
        tdEmpf.className = 'px-4 align-middle';
        const empf = OC.resolveEmpfaenger(typ, knoten.id, state.objekte);
        if (empf && empf.kundeId) {
            const kunde = (state.kunden || []).find(k => k.id === empf.kundeId);
            const geerbt = !empf.direkt;
            tdEmpf.innerHTML = `<span class="font-medium">${kunde ? kunde.name : '#' + empf.kundeId}</span>
                <span class="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${empf.art ? 'bg-slate-100 text-slate-600 border border-slate-200' : 'hidden'}">${empf.art ? (OBJEKT_ART_LABEL[empf.art] || empf.art) : ''}</span>
                <span class="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-yellow-100 text-yellow-800 border border-yellow-200 ${geerbt ? '' : 'hidden'}">geerbt</span>`;
        } else {
            tdEmpf.innerHTML = '<span class="text-red-400 text-xs italic">kein Empfänger</span>';
        }
        tr.appendChild(tdEmpf);

        const tdFlaeche = document.createElement('td');
        tdFlaeche.className = 'px-4 align-middle text-right text-slate-700';
        const flaecheWert = typ === 'RAUM' ? (knoten.einheit === 'm²' ? (knoten.flaeche || 0) : null)
            : (knoten.flaeche_summe != null ? knoten.flaeche_summe : OC.summiereFlaechen(typ, knoten.id, state.objekte));
        tdFlaeche.textContent = flaecheWert == null ? '-' : Number(flaecheWert).toLocaleString('de-DE') + ' m²';
        tr.appendChild(tdFlaeche);

        const tdStatus = document.createElement('td');
        tdStatus.className = 'px-4 align-middle text-center';
        const aktiv = knoten.aktiv !== 0;
        tdStatus.innerHTML = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${aktiv ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'}">${aktiv ? 'Aktiv' : 'Inaktiv'}</span>`;
        tr.appendChild(tdStatus);

        const tdActions = document.createElement('td');
        tdActions.className = 'px-4 align-middle text-right whitespace-nowrap';

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

        tdActions.appendChild(mkBtn('edit', 'Bearbeiten', 'text-slate-400 hover:text-primary p-1 mx-0.5 transition-colors', () => openObjektModal(typ, null, knoten.id)));

        const btnDetails = mkBtn('north_east', 'Details', 'text-slate-400 hover:text-primary p-1 mx-0.5 transition-colors', () => openObjektDetails(typ, knoten.id));
        tdActions.appendChild(btnDetails);

        const kindEbene = { LIEGENSCHAFT: 'GEBAEUDE', GEBAEUDE: 'ETAGE', ETAGE: 'RAUM' }[typ];
        if (kindEbene) {
            tdActions.appendChild(mkBtn('add', OBJEKT_TYP_LABEL[kindEbene] + ' anlegen', 'text-slate-400 hover:text-green-600 p-1 mx-0.5 transition-colors', () => openObjektModal(kindEbene, knoten.id)));
        }

        tdActions.appendChild(mkBtn(knoten.aktiv !== 0 ? 'pause' : 'play_arrow', knoten.aktiv !== 0 ? 'Deaktivieren' : 'Aktivieren',
            'text-slate-400 hover:text-amber-600 p-1 mx-0.5 transition-colors', () => toggleObjektAktiv(typ, knoten.id)));

        tdActions.appendChild(mkBtn('delete', 'Löschen', 'text-slate-400 hover:text-red-500 p-1 mx-0.5 transition-colors', () => deleteObjektMitConfirm(typ, knoten.id)));

        tr.appendChild(tdActions);
        tbody.appendChild(tr);
    });

    document.getElementById('kpi-anzahl-liegenschaften').innerText = (state.objekte.liegenschaften || []).length;
    document.getElementById('kpi-anzahl-gebaeude').innerText = (state.objekte.gebaeude || []).length;
    const flaecheGesamt = (state.objekte.raeume || []).reduce((s, r) => s + (r.einheit === 'm²' ? (parseFloat(r.flaeche) || 0) : 0), 0);
    document.getElementById('kpi-flaeche-gesamt').innerText = Math.round(flaecheGesamt * 100) / 100;
}

function exportObjekteCSV() {
    if (!state.objekte) return;
    const OC = window.ObjektController;
    const { rows } = buildObjekteRows('', 'alle');

    const escapeCsv = (val) => {
        const s = String(val == null ? '' : val);
        if (s.includes(';') || s.includes('"') || s.includes('\n')) {
            return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
    };

    const header = [
        'Ebene',
        'Objekt-Nr',
        'Name',
        'Pfad',
        'Strasse',
        'PLZ',
        'Ort',
        'Flaeche',
        'Einheit',
        'Raumtyp',
        'Bodenbelag',
        'Empfaenger_Name',
        'Empfaenger_Art',
        'Empfaenger_Herkunft',
        'Status'
    ];

    const csvLines = [header.join(';')];

    for (const { typ, knoten } of rows) {
        const empf = OC ? OC.resolveEmpfaenger(typ, knoten.id, state.objekte) : null;
        let empfName = '';
        let empfArt = '';
        let empfQuelle = '';
        if (empf && empf.kundeId) {
            const kunde = (state.kunden || []).find(k => k.id === empf.kundeId);
            empfName = kunde ? kunde.name : `#${empf.kundeId}`;
            empfArt = empf.art ? (OBJEKT_ART_LABEL[empf.art] || empf.art) : '';
            empfQuelle = empf.direkt ? 'DIREKT' : `GEERBT_VON_${empf.quelle}`;
        }

        const pfad = OC ? OC.buildPfad(typ, knoten.id, state.objekte) : knoten.name;
        const flaeche = typ === 'RAUM' ? (knoten.flaeche || 0) : (OC ? OC.summiereFlaechen(typ, knoten.id, state.objekte) : 0);

        const zeile = [
            OBJEKT_TYP_LABEL[typ] || typ,
            knoten.objekt_nr || knoten.raum_nr || '',
            knoten.name || '',
            pfad,
            knoten.strasse || '',
            knoten.plz || '',
            knoten.ort || '',
            String(flaeche).replace('.', ','),
            knoten.einheit || (typ === 'RAUM' ? 'm²' : ''),
            knoten.raumtyp || '',
            knoten.bodenbelag || '',
            empfName,
            empfArt,
            empfQuelle,
            knoten.aktiv !== 0 ? 'Aktiv' : 'Inaktiv'
        ];

        csvLines.push(zeile.map(escapeCsv).join(';'));
    }

    const csvContent = '\uFEFF' + csvLines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const datumStr = new Date().toISOString().split('T')[0];
    const a = document.createElement('a');
    a.href = url;
    a.download = `Objektstruktur_${datumStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Objektstruktur erfolgreich als CSV exportiert.', 'success');
}

document.getElementById('search-objekte')?.addEventListener('input', (e) => {
    renderObjekte(e.target.value);
});

// --- Modal ---
const OBJEKT_ELTERN_KONFIG = {
    GEBAEUDE: { feld: 'liegenschaft_id', typ: 'LIEGENSCHAFT', liste: 'liegenschaften' },
    ETAGE: { feld: 'gebaeude_id', typ: 'GEBAEUDE', liste: 'gebaeude' },
    RAUM: { feld: 'etage_id', typ: 'ETAGE', liste: 'etagen' }
};

function setzeEbenenSichtbarkeit(ebene) {
    const zeige = (el, an) => { if (el) el.classList.toggle('hidden', !an); };
    document.querySelectorAll('#objekt-form [data-ebene]').forEach(el => {
        el.classList.toggle('hidden', !(el.dataset.ebene || '').split(' ').includes(ebene));
    });
    zeige(document.getElementById('objekt-modal-adresse'), ['LIEGENSCHAFT', 'GEBAEUDE'].includes(ebene));
    zeige(document.getElementById('objekt-modal-gebaeude-felder'), ebene === 'GEBAEUDE');
    zeige(document.getElementById('objekt-modal-raum-felder'), ebene === 'RAUM');
    zeige(document.getElementById('objekt-modal-eltern-wrap'), ebene !== 'LIEGENSCHAFT');
    zeige(document.getElementById('objekt-modal-aktiv-wrap'), !!document.getElementById('objekt-modal-id').value);
}

function fuelleElternSelect(ebene, selectedId) {
    const sel = document.getElementById('objekt-modal-eltern');
    sel.innerHTML = '';
    const konfig = OBJEKT_ELTERN_KONFIG[ebene];
    if (!konfig) return;

    const optDefault = document.createElement('option');
    optDefault.value = '';
    optDefault.textContent = 'Bitte wählen...';
    sel.appendChild(optDefault);

    const OC = window.ObjektController;
    (state.objekte[konfig.liste] || []).forEach(k => {
        const opt = document.createElement('option');
        opt.value = k.id;
        opt.textContent = OC.buildPfad(konfig.typ, k.id, state.objekte);
        sel.appendChild(opt);
    });
    if (selectedId) sel.value = String(selectedId);
}

function fuelleKundenSelect(selectedId) {
    const sel = document.getElementById('objekt-modal-empfaenger-kunde');
    while (sel.options.length > 1) sel.remove(1);
    (state.kunden || []).forEach(k => {
        const opt = document.createElement('option');
        opt.value = k.id;
        opt.textContent = `${k.kundennummer ? k.kundennummer + ' – ' : ''}${k.name}`;
        sel.appendChild(opt);
    });
    if (selectedId) sel.value = String(selectedId);
    toggleEmpfaengerArt();
}

function toggleEmpfaengerArt() {
    const kundeSel = document.getElementById('objekt-modal-empfaenger-kunde');
    const artSel = document.getElementById('objekt-modal-empfaenger-art');
    artSel.disabled = !kundeSel.value;
}

function openObjektModal(ebene, elternId = null, editId = null) {
    const form = document.getElementById('objekt-form');
    form.reset();
    document.getElementById('objekt-modal-id').value = editId || '';
    document.getElementById('objekt-modal-ebene').value = ebene;

    const istEdit = !!editId;
    const titel = istEdit
        ? `${OBJEKT_TYP_LABEL[ebene]} bearbeiten`
        : `Neue ${OBJEKT_TYP_LABEL[ebene] === 'Liegenschaft' ? 'Liegenschaft' : OBJEKT_TYP_LABEL[ebene]}`;
    document.getElementById('objekt-modal-title').innerText = titel;

    const nrLabel = document.getElementById('objekt-modal-nr-label');
    if (nrLabel) nrLabel.innerText = ebene === 'RAUM' ? 'Raum-Nr.' : 'Liegenschafts-Nr.';

    fuelleKundenSelect();

    let elternVorbelegung = elternId;
    if (istEdit) {
        const OC = window.ObjektController;
        const knoten = OC.findeKnoten(ebene, editId, state.objekte);
        if (knoten) {
            document.getElementById('objekt-modal-name').value = knoten.name || '';
            document.getElementById('objekt-modal-nr').value = knoten.objekt_nr || knoten.raum_nr || '';
            document.getElementById('objekt-modal-strasse').value = knoten.strasse || '';
            document.getElementById('objekt-modal-plz').value = knoten.plz || '';
            document.getElementById('objekt-modal-ort').value = knoten.ort || '';
            document.getElementById('objekt-modal-baujahr').value = knoten.baujahr != null ? knoten.baujahr : '';
            document.getElementById('objekt-modal-geschosse').value = knoten.geschosse != null ? knoten.geschosse : '';
            document.getElementById('objekt-modal-ebene-nummer').value = knoten.ebene_nummer != null ? knoten.ebene_nummer : '';
            document.getElementById('objekt-modal-flaeche').value = knoten.flaeche != null ? knoten.flaeche : 0;
            document.getElementById('objekt-modal-einheit').value = knoten.einheit || 'm²';
            document.getElementById('objekt-modal-raumtyp').value = knoten.raumtyp || '';
            const bodenInput = document.getElementById('objekt-modal-bodenbelag');
            if (bodenInput) bodenInput.value = knoten.bodenbelag || '';
            document.getElementById('objekt-modal-notizen').value = knoten.notizen || '';
            document.getElementById('objekt-modal-aktiv').checked = knoten.aktiv !== 0;
            elternVorbelegung = knoten[OBJEKT_ELTERN_KONFIG[ebene]?.feld];
            fuelleKundenSelect(knoten.empfaenger_kunde_id);
            document.getElementById('objekt-modal-empfaenger-art').value = knoten.empfaenger_art || '';
        }
    } else {
        const bodenInput = document.getElementById('objekt-modal-bodenbelag');
        if (bodenInput) bodenInput.value = '';
    }

    fuelleElternSelect(ebene, elternVorbelegung);
    setzeEbenenSichtbarkeit(ebene);
    toggleEmpfaengerArt();
    document.getElementById('objekt-modal').classList.remove('hidden');
    document.getElementById('objekt-modal-name').focus();
}

function closeObjektModal() {
    document.getElementById('objekt-modal').classList.add('hidden');
}

async function saveObjektFromModal() {
    const OC = window.ObjektController;
    const ebene = document.getElementById('objekt-modal-ebene').value;
    const idVal = document.getElementById('objekt-modal-id').value;

    const payload = {
        name: document.getElementById('objekt-modal-name').value.trim(),
        notizen: document.getElementById('objekt-modal-notizen').value.trim()
    };

    const kundeVal = document.getElementById('objekt-modal-empfaenger-kunde').value;
    payload.empfaenger_kunde_id = kundeVal ? parseInt(kundeVal) : null;
    payload.empfaenger_art = kundeVal ? (document.getElementById('objekt-modal-empfaenger-art').value || null) : null;

    if (ebene !== 'LIEGENSCHAFT') {
        const elternVal = document.getElementById('objekt-modal-eltern').value;
        payload[OBJEKT_ELTERN_KONFIG[ebene].feld] = elternVal ? parseInt(elternVal) : null;
    }

    const nrVal = document.getElementById('objekt-modal-nr').value.trim();
    if (['LIEGENSCHAFT', 'GEBAEUDE'].includes(ebene)) {
        payload.strasse = document.getElementById('objekt-modal-strasse').value.trim();
        payload.plz = document.getElementById('objekt-modal-plz').value.trim();
        payload.ort = document.getElementById('objekt-modal-ort').value.trim();
    }
    if (ebene === 'LIEGENSCHAFT') {
        payload.objekt_nr = nrVal || null;
    } else if (ebene === 'GEBAEUDE') {
        const bj = document.getElementById('objekt-modal-baujahr').value;
        const gs = document.getElementById('objekt-modal-geschosse').value;
        payload.baujahr = bj === '' ? null : parseInt(bj);
        payload.geschosse = gs === '' ? null : parseInt(gs);
    } else if (ebene === 'ETAGE') {
        const en = document.getElementById('objekt-modal-ebene-nummer').value;
        payload.ebene_nummer = en === '' ? null : parseInt(en);
    } else if (ebene === 'RAUM') {
        payload.raum_nr = nrVal || null;
        payload.flaeche = parseFloat(document.getElementById('objekt-modal-flaeche').value) || 0;
        payload.einheit = document.getElementById('objekt-modal-einheit').value;
        payload.raumtyp = document.getElementById('objekt-modal-raumtyp').value.trim() || null;
        const bodenVal = document.getElementById('objekt-modal-bodenbelag')?.value;
        payload.bodenbelag = bodenVal ? bodenVal.trim() || null : null;
    }

    const validation = OC.validateKnoten(ebene, payload);
    if (!validation.valid) {
        showToast(validation.message, 'error');
        return;
    }

    try {
        if (idVal) payload.id = parseInt(idVal);
        const apiFn = {
            LIEGENSCHAFT: window.api.saveLiegenschaft,
            GEBAEUDE: window.api.saveGebaeude,
            ETAGE: window.api.saveEtage,
            RAUM: window.api.saveRaum
        }[ebene];
        await apiFn(payload);
        closeObjektModal();
        await refreshObjekteState();
        renderObjekte(document.getElementById('search-objekte')?.value || '');
        if (typeof refreshObjektDetails === 'function' && window.currentObjektDetailTyp &&
            document.getElementById('view-objekt-details') && !document.getElementById('view-objekt-details').classList.contains('hidden')) {
            refreshObjektDetails();
        }
        showToast(`${OBJEKT_TYP_LABEL[ebene]} erfolgreich gespeichert.`, 'success');
    } catch (err) {
        console.error('Fehler beim Speichern des Objekts:', err);
        showToast(err.message || String(err), 'error');
    }
}

async function toggleObjektAktiv(typ, id) {
    const OC = window.ObjektController;
    const knoten = OC.findeKnoten(typ, id, state.objekte);
    if (!knoten) return;
    const neuerStatus = knoten.aktiv === 0 ? 1 : 0;
    try {
        const payload = { ...knoten, aktiv: neuerStatus };
        delete payload.created_at;
        const apiFn = {
            LIEGENSCHAFT: window.api.saveLiegenschaft,
            GEBAEUDE: window.api.saveGebaeude,
            ETAGE: window.api.saveEtage,
            RAUM: window.api.saveRaum
        }[typ];
        await apiFn(payload);
        await refreshObjekteState();
        renderObjekte(document.getElementById('search-objekte')?.value || '');
        showToast(`${OBJEKT_TYP_LABEL[typ]} wurde ${neuerStatus === 1 ? 'aktiviert' : 'deaktiviert'}.`, 'success');
    } catch (err) {
        console.error('Fehler beim Ändern des Status:', err);
        showToast(err.message || String(err), 'error');
    }
}

async function deleteObjektMitConfirm(typ, id) {
    const OC = window.ObjektController;
    const knoten = OC.findeKnoten(typ, id, state.objekte);
    if (!knoten) return;

    let message = `${OBJEKT_TYP_LABEL[typ]} "${knoten.name}" wirklich löschen?`;
    if (typ === 'LIEGENSCHAFT') {
        message = `Alle Gebäude der Liegenschaft "${knoten.name}" mitsamt Etagen/Räumen löschen?`;
    }

    const ok = await safeConfirm(message, 'Objekt löschen');
    if (!ok) return;

    try {
        const apiFn = {
            LIEGENSCHAFT: window.api.deleteLiegenschaft,
            GEBAEUDE: window.api.deleteGebaeude,
            ETAGE: window.api.deleteEtage,
            RAUM: window.api.deleteRaum
        }[typ];
        await apiFn(id);
        await refreshObjekteState();
        renderObjekte(document.getElementById('search-objekte')?.value || '');
        showToast(`${OBJEKT_TYP_LABEL[typ]} gelöscht.`, 'success');
    } catch (err) {
        console.error('Fehler beim Löschen:', err);
        showToast(err.message || String(err), 'error');
    }
}

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
            empfEl.innerHTML = `<span class="material-symbols-outlined text-[16px]">domain</span> Rechnungsempfänger: ${empf.name || '#' + empf.kundeId}${artLabel}
                <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">direkt</span>`;
        } else {
            const quelleLabel = empf.quelle.replace('GEERBT_VON_', '');
            empfEl.innerHTML = `<span class="material-symbols-outlined text-[16px]">domain</span> Rechnungsempfänger: ${empf.name || '#' + empf.kundeId}${artLabel}
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
    objektHistorieFilter = 'alle';
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
    objektHistorieFilter = filter;
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
        if (objektHistorieFilter === 'RE') return d.type === 'rechnung';
        if (objektHistorieFilter === 'AN') return d.type === 'angebot';
        if (objektHistorieFilter === 'DAUERRECHNUNG') return d.matchArt === 'DAUERRECHNUNG';
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
