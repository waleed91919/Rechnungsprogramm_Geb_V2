(function() {
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

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

window.objektHistorieFilter = 'alle';

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
        tdName.innerHTML = `${einzug}${pfeil}<span class="${ebene === 0 ? 'font-semibold text-slate-800' : 'font-medium'}">${escapeHtml(knoten.name)}</span>`;
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
            tdEmpf.innerHTML = `<span class="font-medium">${escapeHtml(kunde ? kunde.name : '#' + empf.kundeId)}</span>
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

document.getElementById('search-objekte')?.addEventListener('input', (e) => {
    renderObjekte(e.target.value);
});


window.escapeHtml = escapeHtml;
window.OBJEKT_TYP_LABEL = OBJEKT_TYP_LABEL;
window.OBJEKT_ART_LABEL = OBJEKT_ART_LABEL;
window.objekteStateLeer = objekteStateLeer;
window.refreshObjekteState = refreshObjekteState;
window.objektBadge = objektBadge;
window.buildObjekteRows = buildObjekteRows;
window.renderObjekte = renderObjekte;
if (typeof module !== 'undefined' && module.exports) {
module.exports = { escapeHtml, OBJEKT_TYP_LABEL, OBJEKT_ART_LABEL, objekteStateLeer, refreshObjekteState, objektBadge, buildObjekteRows, renderObjekte };
}
})();
