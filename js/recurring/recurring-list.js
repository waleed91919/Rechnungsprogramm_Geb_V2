(function() {
// Dauerrechnungen (F2): Rendering & Interaktion

/**
 * Gesetzliche Aufbewahrungsfristen nach dem Bürokratieentlastungsgesetz IV (BEG IV, Stand 2025/2026):
 * - Rechnungs- und Buchungsbelege: 8 Jahre gem. § 14b Abs. 1 Satz 1 UStG, § 147 Abs. 3 Satz 1 AO n.F. (durch BEG IV seit 01.01.2025).
 * - Handelsbücher, Inventare, Jahresabschlüsse: weiterhin 10 Jahre (§ 147 Abs. 3 Satz 1 AO n.F., § 257 Abs. 4 HGB).
 * - Handels- und Geschäftsbriefe (inkl. Angebote ohne Auftrag): 6 Jahre (§ 147 Abs. 3 Satz 1 AO n.F., § 257 Abs. 4 HGB).
 * - Hinweistext für Privatkunden bei grundstücksbezogenen Leistungen: 2 Jahre (§ 14b Abs. 1 Satz 5 UStG).
 * - Zeiterfassungsdaten: 2 Jahre (§ 17 Abs. 2 MiLoG).
 * Fristbeginn: Mit dem Schluss des Kalenderjahres, in dem die Rechnung ausgestellt wurde (§ 147 Abs. 4 AO).
 * Ablaufhemmung: Bei offener Festsetzungsfrist oder laufender Betriebsprüfung (§ 147 Abs. 3 Satz 5 AO n.F.).
 */
var AUFBEWAHRUNGSFRISTEN_BEG_IV = (typeof window !== 'undefined' && window.AUFBEWAHRUNGSFRISTEN_BEG_IV) || {
    RECHNUNGSBELEGE_JAHRE: 8,
    BUCHUNGSBELEGE_JAHRE: 8,
    BUECHER_ABSCHLUESSE_JAHRE: 10,
    GESCHAEFTSBRIEFE_JAHRE: 6,
    PRIVATKUNDEN_GRUNDSTUECK_JAHRE: 2,
    ZEITERFASSUNG_MILOG_JAHRE: 2,
    hinweisPrivatkunde: 'Hinweis gem. § 14b Abs. 1 Satz 5 UStG: Als Privatperson sind Sie gesetzlich verpflichtet, diese Rechnung sowie den zugehörigen Zahlungsbeleg bei steuerpflichtigen Werkleistungen oder sonstigen Leistungen im Zusammenhang mit einem Grundstück mindestens zwei Jahre lang aufzubewahren (Fristbeginn: Schluss des Kalenderjahres der Ausstellung).',
    hinweisUnternehmer: 'Aufbewahrungsfristen nach BEG IV: Rechnungs- und Buchungsbelege: 8 Jahre gem. § 14b Abs. 1 Satz 1 UStG, § 147 Abs. 3 Satz 1 AO n.F. (durch BEG IV seit 01.01.2025), Bücher und Bilanzen 10 Jahre (§ 147 Abs. 3 Satz 1 AO n.F.), Geschäftsbriefe 6 Jahre (§ 147 Abs. 3 Satz 1 AO n.F.). Fristbeginn mit Schluss des Kalenderjahres; Hemmung bei offener Steuerfestsetzung (§ 147 Abs. 3 Satz 5 AO n.F.).'
};
if (typeof window !== 'undefined') {
    window.AUFBEWAHRUNGSFRISTEN_BEG_IV = AUFBEWAHRUNGSFRISTEN_BEG_IV;
}

window.DR_STATUS_BADGE = {
    aktiv: 'bg-green-100 text-green-800',
    pausiert: 'bg-amber-100 text-amber-800'
};

window.drPlaeneCache = window.drPlaeneCache || [];
window.laeufePanelPlanId = window.laeufePanelPlanId || null;
window.stornoLaufCurrentId = window.stornoLaufCurrentId || null;

async function refreshPlaeneState() {
    if (!window.api || !window.api.getAbrechnungsplaene) return [];
    window.drPlaeneCache = await window.api.getAbrechnungsplaene();
    state.abrechnungsplaene = window.drPlaeneCache;
    return window.drPlaeneCache;
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

    let plaene = [...window.drPlaeneCache];
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
        tdStatus.innerHTML = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border border-transparent ${istAktiv ? window.DR_STATUS_BADGE.aktiv : window.DR_STATUS_BADGE.pausiert}">${istAktiv ? 'Aktiv' : 'Pausiert'}</span>`;
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
    const aktive = window.drPlaeneCache.filter(p => p.aktiv === 1).length;
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
            <td class="px-3 py-2 text-center"><span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${istAktiv ? window.DR_STATUS_BADGE.aktiv : window.DR_STATUS_BADGE.pausiert}">${istAktiv ? 'Aktiv' : 'Pausiert'}</span></td>
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

    // Exports
    window.refreshPlaeneState = refreshPlaeneState;
    window.planNetto = planNetto;
    window.formatiereDatumIso = formatiereDatumIso;
    window.renderDauerrechnungen = renderDauerrechnungen;
    window.formattiereKurz = formattiereKurz;
    window.updateDauerrechnungenKpis = updateDauerrechnungenKpis;
    window.toggleDauerrechnungenAuto = toggleDauerrechnungenAuto;
    window.renderObjektPlaene = renderObjektPlaene;
})();
