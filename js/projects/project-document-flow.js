(function(global) {

function openAufmassUebergabeModal() {
    const modal = document.getElementById('aufmass-uebergabe-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    const select = document.getElementById('uebergabe-doc-select');
    select.innerHTML = '';
    const pDocs = (state.dokumente || []).filter(d => d.projekt_id === window.currentViewProjektId);
    pDocs.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = `${d.typ} ${d.nummer || d.id} (${formatCurrency(d.summe_netto || 0)})`;
        select.appendChild(opt);
    });
}

function closeAufmassUebergabeModal() {
    const modal = document.getElementById('aufmass-uebergabe-modal');
    if (modal) modal.classList.add('hidden');
}

function onUebergabeTypChange() {
    // Mode toggles if needed
}

async function executeAufmassUebergabe() {
    const pId = window.currentViewProjektId;
    const zielTyp = document.getElementById('uebergabe-ziel-typ')?.value || 'RECHNUNG';
    const modus = document.querySelector('input[name="uebergabe-modus"]:checked')?.value || 'UPDATE_EXISTING';
    const docId = parseInt(document.getElementById('uebergabe-doc-select')?.value, 10);

    if (!pId || !window.api) return { success: false, reason: 'NO_API' };

    try {
        // 1. Projektstamm laden & kunde_id validieren
        const projekt = await window.api.getProjekt(pId);
        if (!projekt) {
            showToast('Projekt nicht gefunden — Übergabe abgelehnt.', 'error');
            return { success: false, reason: 'PROJECT_NOT_FOUND' };
        }

        const kundeId = projekt.kunde_id || projekt.kundeId;
        if (!kundeId) {
            showToast('Das Projekt besitzt keinen zugeordneten Kunden. Bitte erst Kunden im Projekt hinterlegen!', 'error');
            return { success: false, reason: 'MISSING_KUNDE' };
        }

        // 2. Aufmaßzeilen konsolidieren (ohne unfertige DRAFTS)
        const aggAufmass = await window.api.mergeSchlussaufmass(pId);
        if (!aggAufmass || aggAufmass.length === 0) {
            showToast('Keine berechneten Aufmaßpositionen zum Übergeben vorhanden.', 'warning');
            return { success: false, reason: 'EMPTY_AUFMASS' };
        }

        const loadDoc = async (id) => {
            if (window.api.getDocumentById) {
                const d = await window.api.getDocumentById(id);
                if (d) return d;
            }
            const full = await window.api.getFullState();
            const all = (full.rechnungen || []).concat(full.dokumente || [], state.dokumente || []);
            return all.find(d => parseInt(d.id) === parseInt(id)) || null;
        };

        if (modus === 'UPDATE_EXISTING' && docId) {
            const doc = await loadDoc(docId);
            if (!doc) {
                showToast('Zielbeleg nicht gefunden — Übergabe blockiert.', 'error');
                return { success: false, reason: 'DOC_NOT_FOUND' };
            }
            const PROTECTED = ['Festgeschrieben', 'Bezahlt', 'Storniert'];
            if (doc.isLocked || PROTECTED.includes(doc.status)) {
                showToast('Übergabe blockiert: Beleg ist gesperrt/storniert/festgeschrieben. Entsperren nur mit Grund + Audit.', 'error');
                return { success: false, reason: 'DOC_LOCKED' };
            }
            const now = new Date().toISOString();
            const diff = [];
            (doc.positionen || []).forEach(pos => {
                const match = aggAufmass.find(a => a.oz_code === pos.oz || a.oz_code === pos.oz_code);
                if (match) {
                    const alt = parseFloat(pos.menge) || 0;
                    const neu = Math.round(parseFloat(match.summe_menge) * 1000) / 1000;
                    if (alt !== neu) {
                        diff.push({ oz: match.oz_code, alt, neu });
                        pos.menge = neu;
                        pos.aufmass_blatt_id = match.blatt_id !== undefined ? match.blatt_id : (match.aufmass_blatt_id || null);
                        pos.oz_code = match.oz_code;
                        pos.aufmass_menge = neu;
                        pos.aufmass_quelle = 'mergeSchlussaufmass';
                        pos.aufmass_zeitstempel = now;
                    }
                }
            });
            // Persistieren via IPC (P0.3) — erst nach await + Reload-Read gilt Erfolg.
            await window.api.saveDocument(doc);
            const reloaded = await loadDoc(docId);
            const ok = reloaded && (reloaded.positionen || []).every(pos => {
                const m = aggAufmass.find(a => a.oz_code === pos.oz || a.oz_code === pos.oz_code);
                return !m || Math.abs((parseFloat(pos.menge) || 0) - (parseFloat(m.summe_menge) || 0)) < 0.0005;
            });
            if (!ok) {
                showToast('Persistenz-Nachweis fehlgeschlagen — bitte Reload prüfen.', 'error');
                return { success: false, reason: 'RELOAD_MISMATCH' };
            }
            const newState = await window.api.getFullState();
            if (newState) {
                if (Array.isArray(newState.dokumente)) state.dokumente = newState.dokumente;
                if (Array.isArray(newState.rechnungen)) state.rechnungen = newState.rechnungen;
            }
            showToast(`Aufmaßmengen in ${doc.typ || 'Beleg'} ${doc.nummer || doc.id} gespeichert (${diff.length} Positionen, Herkunft je Blattzeile).`, 'success');
            closeAufmassUebergabeModal();
            return { success: true, diff };
        } else {
            // CREATE_NEW: echten Beleg-Entwurf mit Herkunftsbezügen, kundeId & LV-Preisen erzeugen + speichern.
            const now = new Date().toISOString();
            const positionen = aggAufmass.map((a, idx) => ({
                name: a.bezeichnung || a.oz_code || `Aufmaßposition ${idx + 1}`,
                oz: a.oz_code,
                oz_code: a.oz_code,
                menge: Math.round(parseFloat(a.summe_menge) * 1000) / 1000,
                preis: parseFloat(a.einheitspreis) || 0,
                einheit: a.einheit || 'm²',
                mwst: a.mwst !== undefined ? a.mwst : 19,
                aufmass_blatt_id: a.blatt_id !== undefined ? a.blatt_id : (a.aufmass_blatt_id || null),
                aufmass_menge: Math.round(parseFloat(a.summe_menge) * 1000) / 1000,
                aufmass_quelle: 'mergeSchlussaufmass',
                aufmass_zeitstempel: now
            }));
            const entwurf = {
                id: null,
                type: zielTyp === 'RECHNUNG' ? 'rechnung' : 'angebot',
                typ: zielTyp,
                nr: null,
                kundeId: kundeId,
                projektId: pId,
                positionen,
                status: 'Entwurf',
                isLocked: false,
                datum: now.slice(0, 10),
                faelligkeit: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
                bemerkung: `Erstellt aus Schlussaufmaß-Merge am ${now.slice(0, 10)}.`
            };
            const savedId = await window.api.saveDocument(entwurf);
            const newState = await window.api.getFullState();
            if (newState) {
                if (Array.isArray(newState.dokumente)) state.dokumente = newState.dokumente;
                if (Array.isArray(newState.rechnungen)) state.rechnungen = newState.rechnungen;
            }
            showToast(`Neues ${zielTyp}-Dokument (ID ${savedId}) für Kunde #${kundeId} mit ${positionen.length} Aufmaßpositionen gespeichert.`, 'success');
            closeAufmassUebergabeModal();
            return { success: true, id: savedId };
        }
    } catch (e) {
        console.error('Error executing aufmass uebergabe:', e);
        showToast('Fehler bei der Dokumentenübergabe: ' + (e.message || e), 'error');
        return { success: false, reason: 'EXCEPTION' };
    }
}

async function applyApprovedNachtraegeToCurrentInvoice() {
    const pId = window.currentViewProjektId;
    if (!pId || !window.api || !window.api.getNachtraege) return { success: false, reason: 'NO_API' };
    try {
        const list = await window.api.getNachtraege(pId);
        const approved = (list || []).filter(n => n.status === 'GENEHMIGT');
        if (approved.length === 0) {
            showToast('Keine genehmigten Nachträge zum Übernehmen vorhanden.', 'warning');
            return { success: false, reason: 'EMPTY' };
        }

        const invoicePositions = window.NachtragController ? window.NachtragController.extractApprovedPositionsForInvoice(list) : [];
        if (invoicePositions.length === 0) {
            showToast('Die genehmigten Nachträge enthalten keine abrechenbaren Positionen.', 'warning');
            return { success: false, reason: 'NO_POSITIONS' };
        }

        // 2. Ziel-Rechnung ermitteln & GoBD-Sperrprüfung durchführen
        const idEl = document.getElementById('rechnung-id');
        let curId = idEl && idEl.value ? parseInt(idEl.value, 10) : null;
        let targetDoc = null;

        if (curId) {
            targetDoc = window.api.getDocumentById ? await window.api.getDocumentById(curId) : null;
            if (!targetDoc && window.api.getFullState) {
                const full = await window.api.getFullState();
                const all = (full.rechnungen || []).concat(full.dokumente || []);
                targetDoc = all.find(d => parseInt(d.id) === curId) || null;
            }

            if (targetDoc) {
                const PROTECTED_STATUSES = ['Festgeschrieben', 'Bezahlt', 'Storniert'];
                if (targetDoc.isLocked === 1 || targetDoc.isLocked === true || PROTECTED_STATUSES.includes(targetDoc.status)) {
                    showToast(`Rechnung ${targetDoc.nr || curId} ist gesperrt/festgeschrieben (GoBD). Nachträge können nicht hinzugefügt werden!`, 'error');
                    return { success: false, reason: 'DOC_LOCKED' };
                }
            }
        }

        // 3. State initialisieren mit Isolationsschutz (kein Leak aus Fremdbelegen)
        if (typeof state === 'undefined') window.state = {};
        if (targetDoc && Array.isArray(targetDoc.positionen)) {
            state.currentRechnungPositionen = [...targetDoc.positionen];
        } else if (!Array.isArray(state.currentRechnungPositionen)) {
            state.currentRechnungPositionen = [];
        }

        // Positionsgenauer Idempotenz-Check: N:${nachtrag_id}:POS:${pos_id}
        const existingKeys = new Set(
            state.currentRechnungPositionen
                .filter(p => p.nachtrag_id != null)
                .map(p => `N:${p.nachtrag_id}:POS:${p.nachtrag_pos_id || p.id || p.name}`)
        );

        let added = 0;
        for (const np of invoicePositions) {
            const key = `N:${np.nachtrag_id}:POS:${np.nachtrag_pos_id || np.id || np.name}`;
            if (existingKeys.has(key)) continue; // Idempotenz: keine Doppel-Übernahme

            existingKeys.add(key);
            state.currentRechnungPositionen.push({ ...np, mwst: np.mwst !== undefined ? np.mwst : 19 });
            added++;
        }

        if (added === 0) {
            showToast('Alle Positionen dieser Nachträge sind bereits in der Rechnung vorhanden.', 'info');
            return { success: true, added: 0 };
        }

        if (typeof recalculateRechnungTotals === 'function') recalculateRechnungTotals();
        else if (typeof calculateRechnungTotals === 'function') calculateRechnungTotals();

        // 4. Echte Persistenz in SQLite (Schutz vor Datenverlust)
        let savedId = curId;
        const now = new Date().toISOString();

        if (curId && typeof saveRechnung === 'function') {
            await saveRechnung();
        } else {
            // Beleg existiert noch nicht in DB -> atomar neu anlegen
            const projekt = await window.api.getProjekt(pId);
            const kundeId = projekt ? (projekt.kunde_id || projekt.kundeId || null) : null;
            if (!kundeId) {
                showToast('Projekt besitzt keinen zugeordneten Kunden. Bitte erst Kunden im Projekt hinterlegen.', 'error');
                return { success: false, reason: 'MISSING_KUNDE' };
            }

            const entwurf = {
                id: null,
                type: 'rechnung',
                typ: 'RECHNUNG',
                nr: null,
                kundeId: kundeId,
                projektId: pId,
                positionen: state.currentRechnungPositionen,
                status: 'Entwurf',
                isLocked: 0,
                datum: now.slice(0, 10),
                faelligkeit: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
                bemerkung: `Automatisch erstellter Entwurf mit ${added} Nachtragspositionen.`
            };

            savedId = await window.api.saveDocument(entwurf);
            if (idEl) idEl.value = savedId;
            if (state.currentRechnung) state.currentRechnung.id = savedId;
        }

        // 5. Reload-Read Verifikation zur Bestätigung der physischen Persistenz
        if (window.api.getDocumentById && savedId) {
            const verified = await window.api.getDocumentById(savedId);
            if (!verified || !Array.isArray(verified.positionen)) {
                throw new Error('Persistenz-Verifikation fehlgeschlagen: Beleg nach Speichern nicht in SQLite gefunden.');
            }
        }
        if (window.api.getFullState) {
            const full = await window.api.getFullState(); // Reload-Read Nachweis
            if (full && Array.isArray(full.dokumente)) state.dokumente = full.dokumente;
            if (full && Array.isArray(full.rechnungen)) state.rechnungen = full.rechnungen;
        }

        showToast(`${added} Positionen aus ${approved.length} genehmigten Nachträgen erfolgreich in Beleg #${savedId || curId} gespeichert.`, 'success');
        return { success: true, added, docId: savedId };

    } catch (e) {
        console.error('Error applying approved nachtraege:', e);
        showToast('Fehler bei Nachtragsübernahme: ' + (e.message || e), 'error');
        return { success: false, reason: 'EXCEPTION' };
    }
}



global.openAufmassUebergabeModal = openAufmassUebergabeModal;
global.closeAufmassUebergabeModal = closeAufmassUebergabeModal;
global.onUebergabeTypChange = onUebergabeTypChange;
global.executeAufmassUebergabe = executeAufmassUebergabe;
global.applyApprovedNachtraegeToCurrentInvoice = applyApprovedNachtraegeToCurrentInvoice;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        openAufmassUebergabeModal,
        closeAufmassUebergabeModal,
        onUebergabeTypChange,
        executeAufmassUebergabe,
        applyApprovedNachtraegeToCurrentInvoice
    };
}

})(typeof window !== 'undefined' ? window : this);
