// cleaning-modal.js
(function() {
const RC = window.ReinigungController;

function openLvBereichModal(bereich = null) {
    if (!window.putzplanAuswahl) { window.showToast('Bitte zuerst ein Objekt wählen.', 'error'); return; }
    document.getElementById('lv-bereich-modal-id').value = bereich ? bereich.id : '';
    document.getElementById('lv-bereich-modal-name').value = bereich ? bereich.name : '';
    document.getElementById('lv-bereich-modal-prefix').value = bereich ? (bereich.positionsnr_prefix || '') : '';
    document.getElementById('lv-bereich-modal-sortier').value = bereich ? (bereich.sortier_index || 0) : (window.putzplanDaten ? window.putzplanDaten.bereiche.length : 0);
    document.getElementById('lv-bereich-modal-notizen').value = bereich ? (bereich.notizen || '') : '';
    document.getElementById('lv-bereich-modal-aktiv').checked = bereich ? bereich.aktiv !== 0 : true;
    document.getElementById('lv-bereich-modal-title').innerText = bereich ? 'Leistungsbereich bearbeiten' : 'Leistungsbereich anlegen';
    document.getElementById('lv-bereich-modal').classList.remove('hidden');
    document.getElementById('lv-bereich-modal').classList.add('flex');
    document.getElementById('lv-bereich-modal-name').focus();
}

window.openLvBereichModal = openLvBereichModal;

function closeLvBereichModal() {
    const m = document.getElementById('lv-bereich-modal');
    m.classList.add('hidden');
    m.classList.remove('flex');
}

window.closeLvBereichModal = closeLvBereichModal;

async function saveLvBereichFromModal() {
    const name = document.getElementById('lv-bereich-modal-name').value.trim();
    if (!name) { window.showToast('Bitte einen Bereichsnamen eingeben.', 'error'); return; }
    try {
        await window.api.saveLvBereich({
            id: document.getElementById('lv-bereich-modal-id').value ? Number(document.getElementById('lv-bereich-modal-id').value) : null,
            objekt_typ: window.putzplanAuswahl.typ,
            objekt_id: window.putzplanAuswahl.id,
            name,
            positionsnr_prefix: document.getElementById('lv-bereich-modal-prefix').value.trim() || null,
            sortier_index: parseInt(document.getElementById('lv-bereich-modal-sortier').value, 10) || 0,
            notizen: document.getElementById('lv-bereich-modal-notizen').value.trim() || null,
            aktiv: document.getElementById('lv-bereich-modal-aktiv').checked ? 1 : 0
        });
        window.showToast('Leistungsbereich gespeichert.', 'success');
        closeLvBereichModal();
        await ladePutzplanDaten();
    } catch (e) {
        window.showToast(e.message || 'Speichern fehlgeschlagen.', 'error');
    }
}

window.saveLvBereichFromModal = saveLvBereichFromModal;

async function deleteLvBereichMitConfirm(bereich) {
    const ok = await window.safeConfirm(`Leistungsbereich "${bereich.name}" inkl. aller Positionen und Putzplan-Einträgen löschen?`, 'Bereich löschen');
    if (!ok) return;
    try {
        await window.api.deleteLvBereich(bereich.id);
        window.showToast('Leistungsbereich gelöscht.', 'success');
        await ladePutzplanDaten();
    } catch (e) {
        window.showToast(e.message || 'Löschen fehlgeschlagen.', 'error');
    }
}

window.deleteLvBereichMitConfirm = deleteLvBereichMitConfirm;

function findeLvPosition(posId) {
    for (const bereich of (window.putzplanDaten ? window.putzplanDaten.bereiche : [])) {
        const gefunden = bereich.positionen.find(p => p.id === posId);
        if (gefunden) return { bereich, pos: gefunden };
    }
    return null;
}

window.findeLvPosition = findeLvPosition;

function fuelleLvEintraegeListe() {
    const wrap = document.getElementById('lv-position-modal-eintraege-liste');
    wrap.innerHTML = '';
    if (window.lvEintraegeDraft.length === 0) {
        wrap.innerHTML = '<p class="text-xs text-slate-400 italic px-1">Noch keine Zuweisungen – Kalkulation läuft über die Direktmenge.</p>';
        return;
    }
    window.lvEintraegeDraft.forEach((e, idx) => {
        const zeile = document.createElement('div');
        zeile.className = 'flex items-center justify-between gap-2 text-xs bg-white border border-slate-200 rounded px-2 py-1.5';
        const auto = e.menge_override == null || e.menge_override === '';
        zeile.innerHTML = `
            <span class="truncate font-medium">${window.sanitize(putzplanObjektLabel(e.objekt_typ, e.objekt_id))}</span>
            <span class="text-slate-500 whitespace-nowrap">${auto ? 'Fläche automatisch' : 'Override ' + Number(e.menge_override).toLocaleString('de-DE')} · ${window.sanitize(RC.buildTurnusLabel(e.turnus_typ, e.turnus_wert))}</span>`;
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'text-slate-400 hover:text-red-500 p-0.5 transition-colors';
        del.title = 'Zuweisung entfernen';
        del.innerHTML = '<span class="material-symbols-outlined text-[16px]">close</span>';
        del.onclick = () => { window.lvEintraegeDraft.splice(idx, 1); fuelleLvEintraegeListe(); updateLvPositionVorschau(); };
        zeile.appendChild(del);
        wrap.appendChild(zeile);
    });
}

window.fuelleLvEintraegeListe = fuelleLvEintraegeListe;

function openLvPositionModal(pos = null, bereichId = null) {
    if (!window.putzplanAuswahl) { window.showToast('Bitte zuerst ein Objekt wählen.', 'error'); return; }
    window.lvEintraegeDraft = [];

    const profilSatz = window.putzplanProfil ? window.putzplanProfil.standard_stundensatz : 15;
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
    const belastungInput = document.getElementById('lv-position-modal-zs-belastung');
    if (belastungInput) belastungInput.value = zs.belastung || 0;

    if (pos && pos.kalkulation && pos.kalkulation.eintraege) {
        window.lvEintraegeDraft = pos.kalkulation.eintraege.map(e => ({
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

window.openLvPositionModal = openLvPositionModal;

function vorschlagePositionsNr(bereichId) {
    const bereich = (window.putzplanDaten ? window.putzplanDaten.bereiche : []).find(b => b.id === Number(bereichId));
    if (!bereich) return '';
    const prefix = bereich.positionsnr_prefix || '';
    const naechste = bereich.positionen.length + 1;
    return `${prefix}${String(naechste).padStart(2, '0')}`;
}

window.vorschlagePositionsNr = vorschlagePositionsNr;

function closeLvPositionModal() {
    const m = document.getElementById('lv-position-modal');
    m.classList.add('hidden');
    m.classList.remove('flex');
}

window.closeLvPositionModal = closeLvPositionModal;

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

window.updateTurnusWertLabel = updateTurnusWertLabel;

function bauePositionsDraftAusFormular() {
    const zsJsonTeile = {};
    const nacht = parseFloat(document.getElementById('lv-position-modal-zs-nacht').value) || 0;
    const sofei = parseFloat(document.getElementById('lv-position-modal-zs-sofei').value) || 0;
    const hoher = parseFloat(document.getElementById('lv-position-modal-zs-hoher').value) || 0;
    const belastung = parseFloat(document.getElementById('lv-position-modal-zs-belastung') ? document.getElementById('lv-position-modal-zs-belastung').value : 0) || 0;
    if (nacht > 0) zsJsonTeile.nacht = nacht;
    if (sofei > 0) zsJsonTeile.sonntag_feiertag = sofei;
    if (hoher > 0) zsJsonTeile.hoher_feiertag = hoher;
    if (belastung > 0) zsJsonTeile.belastung = belastung;

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

window.bauePositionsDraftAusFormular = bauePositionsDraftAusFormular;

function updateLvPositionVorschau() {
    const el = document.getElementById('lv-position-modal-vorschau');
    if (!el) return;
    try {
        const draft = bauePositionsDraftAusFormular();
        const kalk = RC.positionsKalkulation(
            draft,
            window.lvEintraegeDraft,
            (typ, id) => RC.autoMengeFuerObjekt(typ, id, window.state.objekte),
            window.putzplanProfil || RC.DEFAULT_ZUSCHLAGSPROFIL
        );
        const zsText = kalk.zuschlaege.length > 0 ? ` · Zuschläge ${window.formatCurrency(kalk.zuschlaegeGesamt)}` : '';
        el.innerText = `Jahr: ${Number(Math.round(kalk.jahresStunden * 100) / 100).toLocaleString('de-DE')} h / ${window.formatCurrency(kalk.nettoJahrInklZuschlaege)} · Monat: ${window.formatCurrency(kalk.nettoMonat)}${zsText}`;
    } catch (_e) {
        el.innerText = 'Jahr: – · Monat: –';
    }
}

window.updateLvPositionVorschau = updateLvPositionVorschau;

async function saveLvPositionFromModal() {
    const data = bauePositionsDraftAusFormular();
    if (!data.bezeichnung) { window.showToast('Bitte eine Bezeichnung eingeben.', 'error'); return; }
    if (!(data.turnus_wert > 0)) { window.showToast('Turnus-Wert muss größer 0 sein.', 'error'); return; }
    if (!data.bereich_id) { window.showToast('Ungültiger Bereich.', 'error'); return; }
    try {
        await window.api.saveLvPosition(data, window.lvEintraegeDraft);
        window.showToast('LV-Position gespeichert.', 'success');
        closeLvPositionModal();
        await ladePutzplanDaten();
    } catch (e) {
        window.showToast(e.message || 'Speichern fehlgeschlagen.', 'error');
    }
}

window.saveLvPositionFromModal = saveLvPositionFromModal;

async function deleteLvPositionMitConfirm(pos) {
    const ok = await window.safeConfirm(`LV-Position "${pos.bezeichnung}" löschen?`, 'Position löschen');
    if (!ok) return;
    try {
        await window.api.deleteLvPosition(pos.id);
        window.lvAufgeklapptePositionen.delete(pos.id);
        window.showToast('LV-Position gelöscht.', 'success');
        await ladePutzplanDaten();
    } catch (e) {
        window.showToast(e.message || 'Löschen fehlgeschlagen.', 'error');
    }
}

window.deleteLvPositionMitConfirm = deleteLvPositionMitConfirm;

function fuelleLvEintragObjektSelect(selectedKey) {
    const sel = document.getElementById('lv-eintrag-modal-objekt');
    sel.innerHTML = '';
    const gruppen = [
        { label: 'Liegenschaften', liste: window.state.objekte.liegenschaften || [], typ: 'LIEGENSCHAFT' },
        { label: 'Gebäude', liste: window.state.objekte.gebaeude || [], typ: 'GEBAEUDE' },
        { label: 'Etagen', liste: window.state.objekte.etagen || [], typ: 'ETAGE' },
        { label: 'Räume', liste: window.state.objekte.raeume || [], typ: 'RAUM' }
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

window.fuelleLvEintragObjektSelect = fuelleLvEintragObjektSelect;

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
    modal.dataset.editIndex = existing ? window.lvEintraegeDraft.findIndex(d =>
        d.objekt_typ === existing.objekt_typ && d.objekt_id === existing.objekt_id) : '';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

window.openLvEintragModal = openLvEintragModal;

function toggleEintragOverride() {
    const auto = document.getElementById('lv-eintrag-modal-auto').checked;
    document.getElementById('lv-eintrag-modal-override-wrap').classList.toggle('hidden', auto);
}

window.toggleEintragOverride = toggleEintragOverride;

function closeLvEintragModal() {
    const m = document.getElementById('lv-eintrag-modal');
    m.classList.add('hidden');
    m.classList.remove('flex');
}

window.closeLvEintragModal = closeLvEintragModal;

function saveLvEintragFromModal() {
    const modal = document.getElementById('lv-eintrag-modal');
    const objektVal = document.getElementById('lv-eintrag-modal-objekt').value;
    if (!objektVal) { window.showToast('Bitte ein Objekt wählen.', 'error'); return; }
    const [typ, idStr] = objektVal.split(':');
    const id = Number(idStr);
    const auto = document.getElementById('lv-eintrag-modal-auto').checked;
    const overrideVal = auto ? '' : (parseFloat(document.getElementById('lv-eintrag-modal-menge').value) || 0);
    const turnusTyp = document.getElementById('lv-eintrag-modal-turnus-typ').value;
    const turnusWert = parseFloat(document.getElementById('lv-eintrag-modal-turnus-wert').value) || 1;
    if (!(turnusWert > 0)) { window.showToast('Turnus-Wert muss größer 0 sein.', 'error'); return; }

    const eintrag = {
        objekt_typ: typ,
        objekt_id: id,
        menge_override: overrideVal === '' ? null : overrideVal,
        turnus_typ: turnusTyp,
        turnus_wert: turnusWert,
        notizen: document.getElementById('lv-eintrag-modal-notizen').value.trim() || null
    };

    const dupIndex = window.lvEintraegeDraft.findIndex(d => d.objekt_typ === typ && d.objekt_id === id);
    if (dupIndex >= 0 && modal.dataset.editIndex === '') {
        window.lvEintraegeDraft.splice(dupIndex, 1);
    }
    if (modal.dataset.editIndex !== '' && modal.dataset.editIndex != null) {
        window.lvEintraegeDraft[Number(modal.dataset.editIndex)] = eintrag;
    } else {
        window.lvEintraegeDraft.push(eintrag);
    }

    fuelleLvEintraegeListe();
    updateLvPositionVorschau();
    closeLvEintragModal();
}

window.saveLvEintragFromModal = saveLvEintragFromModal;

async function openZuschlagsprofilModal() {
    if (!window.putzplanProfil) {
        try { window.putzplanProfil = await window.api.getZuschlagsProfil(); } catch (_e) { window.putzplanProfil = RC.DEFAULT_ZUSCHLAGSPROFIL; }
    }
    const p = window.putzplanProfil;
    document.getElementById('zp-profil-name').value = p.profil_name || '';
    document.getElementById('zp-gueltig-ab').value = p.gueltig_ab || '';
    document.getElementById('zp-stundensatz').value = p.standard_stundensatz != null ? p.standard_stundensatz : 15;
    document.getElementById('zp-stundensatz-glas').value = p.standard_stundensatz_glas != null ? p.standard_stundensatz_glas : 18.4;
    document.getElementById('zp-zs-nacht').value = (p.zuschlaege && p.zuschlaege.nacht && p.zuschlaege.nacht.prozent) || 30;
    document.getElementById('zp-zs-sofei').value = (p.zuschlaege && p.zuschlaege.sonntag_feiertag && p.zuschlaege.sonntag_feiertag.prozent) || 80;
    document.getElementById('zp-zs-hoher').value = (p.zuschlaege && p.zuschlaege.hoher_feiertag && p.zuschlaege.hoher_feiertag.prozent) || 200;
    document.getElementById('zp-zs-belastung').value = (p.zuschlaege && p.zuschlaege.belastung && p.zuschlaege.belastung.prozent) || 25;
    document.getElementById('zp-wochen').value = (p.kalender && p.kalender.wochen_pro_jahr) || 52;
    document.getElementById('zp-tage').value = (p.kalender && p.kalender.tage_pro_jahr) || 365;
    document.getElementById('zuschlagsprofil-modal').classList.remove('hidden');
    document.getElementById('zuschlagsprofil-modal').classList.add('flex');
}

window.openZuschlagsprofilModal = openZuschlagsprofilModal;

function closeZuschlagsprofilModal() {
    const m = document.getElementById('zuschlagsprofil-modal');
    m.classList.add('hidden');
    m.classList.remove('flex');
}

window.closeZuschlagsprofilModal = closeZuschlagsprofilModal;

async function saveZuschlagsprofilFromModal() {
    const profil = {
        ...(window.putzplanProfil || {}),
        profil_name: document.getElementById('zp-profil-name').value.trim(),
        gueltig_ab: document.getElementById('zp-gueltig-ab').value || null,
        standard_stundensatz: parseFloat(document.getElementById('zp-stundensatz').value) || 0,
        standard_stundensatz_glas: parseFloat(document.getElementById('zp-stundensatz-glas').value) || 0,
        zuschlaege: {
            nacht: { prozent: parseFloat(document.getElementById('zp-zs-nacht').value) || 0 },
            sonntag_feiertag: { prozent: parseFloat(document.getElementById('zp-zs-sofei').value) || 0 },
            hoher_feiertag: { prozent: parseFloat(document.getElementById('zp-zs-hoher').value) || 0 },
            belastung: { prozent: parseFloat(document.getElementById('zp-zs-belastung').value) || 0 }
        },
        kalender: {
            wochen_pro_jahr: parseInt(document.getElementById('zp-wochen').value, 10) || 52,
            tage_pro_jahr: parseInt(document.getElementById('zp-tage').value, 10) || 365
        },
        quellen: ['RTV Gebäudereinigung v. 31.10.2019 (§ 3 Ziff. 4.7, § 10 Ziff. 3)', 'BIV Vergabe-Empfehlungen 01/2026', '10. GebäudeArbbV']
    };
    const pruefung = RC.validateProfil(profil);
    if (!pruefung.valid) { window.showToast(pruefung.message, 'error'); return; }
    try {
        await window.api.saveZuschlagsProfil(profil);
        window.putzplanProfil = profil;
        window.showToast('Zuschlagsprofil gespeichert.', 'success');
        closeZuschlagsprofilModal();
        await ladePutzplanDaten();
    } catch (e) {
        window.showToast(e.message || 'Speichern fehlgeschlagen.', 'error');
    }
}

window.saveZuschlagsprofilFromModal = saveZuschlagsprofilFromModal;

})();
