(function() {
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


window.OBJEKT_ELTERN_KONFIG = OBJEKT_ELTERN_KONFIG;
window.setzeEbenenSichtbarkeit = setzeEbenenSichtbarkeit;
window.fuelleElternSelect = fuelleElternSelect;
window.fuelleKundenSelect = fuelleKundenSelect;
window.toggleEmpfaengerArt = toggleEmpfaengerArt;
window.openObjektModal = openObjektModal;
window.closeObjektModal = closeObjektModal;
window.saveObjektFromModal = saveObjektFromModal;
window.toggleObjektAktiv = toggleObjektAktiv;
window.deleteObjektMitConfirm = deleteObjektMitConfirm;
if (typeof module !== 'undefined' && module.exports) {
module.exports = { OBJEKT_ELTERN_KONFIG, setzeEbenenSichtbarkeit, fuelleElternSelect, fuelleKundenSelect, toggleEmpfaengerArt, openObjektModal, closeObjektModal, saveObjektFromModal, toggleObjektAktiv, deleteObjektMitConfirm };
}
})();
