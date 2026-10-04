async function saveRechnung() {
    if (isSavingRechnung) return;
    const submitBtn = document.getElementById('rechnung-modal-submit');
    const submitText = document.getElementById('rechnung-modal-submit-text');
    const originalText = submitText ? submitText.innerText : 'Rechnung Speichern';

    try {
        isSavingRechnung = true;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
        if (submitText) {
            submitText.innerText = 'Wird gespeichert...';
        }

        const kundeId = document.getElementById('rechnung-kunde')?.value || '';
        const projektId = document.getElementById('rechnung-projekt')?.value || '';
        const objektWert = document.getElementById('rechnung-objekt') ? document.getElementById('rechnung-objekt').value : '';
        const [objektTyp, objektIdStr] = objektWert ? objektWert.split(':') : [null, null];
        const rawDatum = document.getElementById('rechnung-datum')?.value || '';
        const rawFaellig = document.getElementById('rechnung-faellig')?.value || '';
        const datum = typeof formatDateISO === 'function' ? (formatDateISO(rawDatum) || formatDateISO(new Date())) : rawDatum;
        const faellig = typeof formatDateISO === 'function' ? (formatDateISO(rawFaellig) || datum) : rawFaellig;
        const status = document.getElementById('rechnung-status')?.value || 'Ausstehend';
        const nr = document.getElementById('rechnung-nr')?.value || '';
        const existingIdVal = document.getElementById('rechnung-id')?.value;
        const existingId = existingIdVal ? parseInt(existingIdVal) : null;
        const customer_type = document.getElementById('rechnung-customer-type')?.value || 'B2B';

        if (!nr || !nr.trim()) {
            showToast('Bitte geben Sie eine Belegnummer an.', 'error');
            return;
        }

        const existing = existingId ? (state.isAngebotMode ? (state.angebote || []).find(a => a.id === existingId) : (state.rechnungen || []).find(r => r.id === existingId)) : null;

        const newDoc = {
            id: existingId ? existingId : null,
            nr,
            datum,
            faellig,
            kundeId: kundeId ? parseInt(kundeId) : null,
            projektId: projektId ? parseInt(projektId) : null,
            objekt_typ: objektTyp || null,
            objekt_id: objektIdStr ? parseInt(objektIdStr) : null,
            positionen: [...(state.currentRechnungPositionen || [])],
            netto: state.currentRechnungTotals ? state.currentRechnungTotals.netto : 0,
            steuer: state.currentRechnungTotals ? state.currentRechnungTotals.steuer : 0,
            brutto: state.currentRechnungTotals ? state.currentRechnungTotals.brutto : 0,
            globalRabattAbzug: state.currentRechnungTotals ? state.currentRechnungTotals.rabattAbzug : 0,
            globalRabattType: document.getElementById('rechnung-global-rabatt-type') ? document.getElementById('rechnung-global-rabatt-type').value : '%',
            globalRabattValue: parseFloat(document.getElementById('rechnung-global-rabatt')?.value) || 0,
            anzahlung: state.currentRechnungTotals ? state.currentRechnungTotals.anzahlung : 0,
            zahlbetrag: state.currentRechnungTotals ? state.currentRechnungTotals.zahlbetrag : 0,
            status: status,
            eingabemodus: document.getElementById('rechnung-eingabemodus') ? document.getElementById('rechnung-eingabemodus').value : 'netto',
            customer_type: customer_type,
            rechnungsart: document.getElementById('rechnung-art') ? document.getElementById('rechnung-art').value : 'Standard',
            leitweg_id: document.getElementById('rechnung-leitweg-id') ? document.getElementById('rechnung-leitweg-id').value : '',
            buyer_reference: document.getElementById('rechnung-buyer-reference') ? document.getElementById('rechnung-buyer-reference').value : '',
            leistungszeitraum_von: document.getElementById('rechnung-leistungszeitraum-von') ? document.getElementById('rechnung-leistungszeitraum-von').value : '',
            leistungszeitraum_bis: document.getElementById('rechnung-leistungszeitraum-bis') ? document.getElementById('rechnung-leistungszeitraum-bis').value : '',
            baustellen_adresse: document.getElementById('rechnung-baustellen-adresse') ? document.getElementById('rechnung-baustellen-adresse').value : '',
            vob_vereinbart: document.getElementById('rechnung-vob-vereinbart')?.checked ? 1 : 0,
            ist_privatkunde: (customer_type === 'B2C' && document.getElementById('rechnung-ist-privatkunde')?.checked) ? 1 : 0,
            unterliegt_bauabzugsteuer: (customer_type !== 'B2C' && document.getElementById('rechnung-unterliegt-bauabzugsteuer')?.checked) ? 1 : 0,
            unterliegt_13b: (customer_type !== 'B2C' && document.getElementById('rechnung-13b-ustg')?.checked) ? 1 : 0,
            vortext: document.getElementById('rechnung-vortext') ? document.getElementById('rechnung-vortext').value : '',
            fusstext: document.getElementById('rechnung-fusstext') ? document.getElementById('rechnung-fusstext').value : '',
            sicherheitseinbehalt: state.currentRechnungTotals ? state.currentRechnungTotals.sicherheitseinbehalt : 0,
            sicherheitseinbehalt_prozent: (state.currentRechnungTotals && state.currentRechnungTotals.sicherheitseinbehalt_prozent !== undefined)
                ? state.currentRechnungTotals.sicherheitseinbehalt_prozent
                : (parseFloat(document.getElementById('rechnung-sicherheitseinbehalt-prozent')?.value || document.getElementById('rechnung-handwerk-sicherheitseinbehalt')?.value) || 0),
            kumulierte_leistung_netto: state.currentRechnungTotals ? state.currentRechnungTotals.kumulierte_leistung_netto : 0,
            skonto_tage: document.getElementById('rechnung-skonto-tage')?.value ? parseInt(document.getElementById('rechnung-skonto-tage').value, 10) : null,
            skonto_prozent: document.getElementById('rechnung-skonto-prozent')?.value ? parseFloat(document.getElementById('rechnung-skonto-prozent').value) : null,
            verrechnungen: [...(state.currentRechnungVerrechnungen || [])],
            isLocked: existing ? (existing.isLocked || false) : false
        };

        // Calculate summe_lohnkosten_brutto for § 35a EStG tax notice
        let totalLohnBrutto = 0;
        (newDoc.positionen || []).forEach(pos => {
            let art = null;
            if (pos.artikelId) {
                art = state.artikel ? state.artikel.find(a => a.id === pos.artikelId) : null;
            }
            if (!pos.name && art && art.name) {
                pos.name = art.name;
            }
            const kostenart = pos.kostenart || (art ? art.kostenart : 'MATERIAL');
            const lohnanteilPct = pos.lohnanteil_prozent !== undefined ? pos.lohnanteil_prozent : (art ? art.lohnanteil_prozent : 0);

            const menge = pos.menge || 0;
            const preis = pos.preis || 0;
            const rabatt = pos.rabatt || 0;
            const mwstRate = pos.mwst !== undefined ? pos.mwst : 19;
            const is13b = newDoc.unterliegt_13b && pos.is13b;
            const effectiveMwst = is13b ? 0 : mwstRate;

            const posNetto = menge * preis * (1 - rabatt / 100);
            const posBrutto = posNetto * (1 + effectiveMwst / 100);

            if (kostenart === 'LOHN') {
                totalLohnBrutto += posBrutto;
            } else if (lohnanteilPct > 0) {
                totalLohnBrutto += posBrutto * (lohnanteilPct / 100);
            }
        });

        newDoc.summe_lohnkosten_brutto = Math.round(totalLohnBrutto * 100) / 100;
        newDoc.ausweis_35a_erforderlich = (newDoc.summe_lohnkosten_brutto > 0) ? 1 : 0;

        newDoc.type = state.isAngebotMode ? 'angebot' : 'rechnung';

        // MVC Validation via Controller
        if (window.InvoiceController && window.InvoiceController.validateSaveDocument) {
            const validation = window.InvoiceController.validateSaveDocument(newDoc);
            if (!validation.valid) {
                showToast(validation.message, 'error');
                return;
            }
        }

        // Datenintegrität: Belegnummern müssen eindeutig sein (DB hat zusätzlich einen UNIQUE-Index).
        const sameTypeDocs = state.isAngebotMode ? (state.angebote || []) : (state.rechnungen || []);
        const nrConflict = sameTypeDocs.find(d => d.nr === nr && d.id !== existingId);
        if (nrConflict) {
            showToast(`Die Belegnummer "${nr}" ist bereits vergeben (${nrConflict.datum ? new Date(nrConflict.datum).toLocaleDateString('de-DE') : 'ohne Datum'}). Bitte eine andere Nummer verwenden.`, 'error');
            return;
        }

        const model = (window.InvoiceModel && typeof window.InvoiceModel === 'function')
            ? new window.InvoiceModel(window.api)
            : window.api;
        await model.saveDocument(newDoc);

        const newState = await model.getFullState();
        if (newState) {
            state.angebote = newState.angebote || [];
            state.rechnungen = newState.rechnungen || [];
            state.artikel = newState.artikel || [];
        }

        closeRechnungModal();
        showToast('Dokument erfolgreich gespeichert.', 'success');

        if (state.isAngebotMode) {
            if (document.getElementById('view-projekt-details') && !document.getElementById('view-projekt-details').classList.contains('hidden')) {
                if (state.currentProjektId && typeof openProjektDetails === 'function') {
                    openProjektDetails(state.currentProjektId);
                }
            } else if (typeof switchView === 'function') {
                switchView('angebote');
            } else if (typeof renderAngebote === 'function') {
                renderAngebote();
            }
        } else {
            if (document.getElementById('view-projekt-details') && !document.getElementById('view-projekt-details').classList.contains('hidden')) {
                if (state.currentProjektId && typeof openProjektDetails === 'function') {
                    openProjektDetails(state.currentProjektId);
                }
            } else if (typeof switchView === 'function') {
                switchView('rechnungen');
            } else if (typeof renderRechnungen === 'function') {
                renderRechnungen();
            }
        }
    } catch (e) {
        console.error('Error saving document:', e);
        const errMsg = (e && e.message) ? e.message : 'Fehler beim Speichern in die Datenbank.';
        showToast(errMsg, 'error');
    } finally {
        isSavingRechnung = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
        if (submitText) {
            submitText.innerText = originalText;
        }
    }
}

window.saveRechnung = saveRechnung;

async function saveAngebotEntwurf() {
    const { doc, positions } = collectAngebotFormData();
    if (!doc.nr || !doc.nr.trim()) {
        showToast('Bitte geben Sie eine Angebotsnummer an.', 'error');
        return;
    }
    if (!doc.kundeId) {
        showToast('Bitte wählen Sie einen Kunden aus.', 'error');
        return;
    }

    doc.angebot_status = 'ENTWURF';
    doc.status = 'Entwurf';
    doc.freeze_snapshot_json = null;

    try {
        const model = (window.InvoiceModel && typeof window.InvoiceModel === 'function')
            ? new window.InvoiceModel(window.api)
            : window.api;
        await model.saveDocument(doc);
        const fullState = await window.api.getFullState();
        if (fullState) {
            state.angebote = fullState.angebote || [];
            state.rechnungen = fullState.rechnungen || [];
            state.artikel = fullState.artikel || [];
        }
        showToast('Angebot erfolgreich als Entwurf gespeichert.', 'success');
        closeRechnungModal();
        if (typeof renderAngebote === 'function') renderAngebote();
    } catch (err) {
        console.error('Fehler beim Speichern des Entwurfs:', err);
        showToast('Fehler beim Speichern: ' + (err.message || err), 'error');
    }
}

window.saveAngebotEntwurf = saveAngebotEntwurf;

async function registerAngebotVersand() {
    const { doc, positions } = collectAngebotFormData();
    if (!doc.nr || !doc.nr.trim()) {
        showToast('Bitte geben Sie eine Angebotsnummer an.', 'error');
        return;
    }
    if (!doc.kundeId) {
        showToast('Bitte wählen Sie einen Kunden aus.', 'error');
        return;
    }

    // 1. Risikoprüfung via AngebotController
    const validation = window.AngebotController.validateAngebot(doc, positions);
    if (!validation.valid) {
        const errorMessages = validation.errors.map(e => `• ${e.message}`).join('\n');
        await safeAlert(`Prüfung fehlgeschlagen - Angebot kann nicht versendet werden:\n\n${errorMessages}`);
        return;
    }

    // 2. Warnungen / Bestätigungen (z.B. 0,00 € Positionen oder BGB § 650m Hinweis)
    let confirmPrompt = 'Möchten Sie dieses Angebot jetzt verbindlich einfrieren und den Versand registrieren?\n\nNach dem Versand ist das Angebot schreibgeschützt und Änderungen erfordern eine neue Version.';
    const details = [];
    if (validation.warnings && validation.warnings.length > 0) {
        details.push('Warnungen:');
        validation.warnings.forEach(w => details.push(`• ${w.message}`));
    }
    if (validation.hinweise && validation.hinweise.length > 0) {
        details.push('\nHinweise:');
        validation.hinweise.forEach(h => details.push(`• ${h.message}`));
    }

    if (details.length > 0) {
        confirmPrompt = `Baurechtliche & kalkulatorische Prüfung:\n\n${details.join('\n')}\n\n${confirmPrompt}`;
    }

    const confirmed = await safeConfirm(confirmPrompt);
    if (!confirmed) return;

    // 3. Wenn noch keine ID (neues Angebot), zuerst Entwurf speichern
    let targetDocId = doc.id;
    if (!targetDocId) {
        doc.angebot_status = 'ENTWURF';
        doc.status = 'Entwurf';
        targetDocId = await window.api.saveDocument(doc);
        doc.id = targetDocId;
    }

    // 4. Freeze Snapshot erstellen & Status auf VERSENDET setzen
    window.AngebotController.freezeAngebot(doc, positions);

    try {
        await window.api.saveDocument(doc);
        const fullState = await window.api.getFullState();
        if (fullState) {
            state.angebote = fullState.angebote || [];
            state.rechnungen = fullState.rechnungen || [];
            state.artikel = fullState.artikel || [];
        }
        showToast(`Angebot ${doc.nr} (v${doc.version || 1}) wurde erfolgreich eingefroren und der Versand registriert.`, 'success');
        const updated = (state.angebote || []).find(a => a.id === doc.id) || doc;
        const form = document.getElementById('rechnung-form');
        const submitBtn = document.getElementById('rechnung-modal-submit');
        if (form) {
            applyAngebotEditMode(updated, form, submitBtn);
        }
        if (typeof renderAngebote === 'function') renderAngebote();
    } catch (err) {
        console.error('Fehler beim Einfrieren/Versenden:', err);
        showToast('Fehler beim Einfrieren: ' + (err.message || err), 'error');
    }
}

window.registerAngebotVersand = registerAngebotVersand;

async function deleteRechnung(id) {
    if (await safeConfirm('Möchten Sie dieses Dokument wirklich löschen?')) {
        try {
            await window.api.deleteDocument(id, 'rechnung');
            const newState = await window.api.getFullState();
            state.angebote = newState.angebote;
            state.rechnungen = newState.rechnungen;
            state.artikel = newState.artikel;
            if (document.getElementById('view-dashboard') && !document.getElementById('view-dashboard').classList.contains('hidden')) {
                renderDashboard();
            } else if (document.getElementById('view-rechnungen') && !document.getElementById('view-rechnungen').classList.contains('hidden')) {
                renderRechnungen();
            } else if (document.getElementById('view-projekt-details') && !document.getElementById('view-projekt-details').classList.contains('hidden')) {
                if (state.currentProjektId) openProjektDetails(state.currentProjektId);
            }
            showToast('Rechnung gelöscht.', 'success');
        } catch (e) {
            console.error('Error deleting document:', e);
            showToast(e && e.message ? e.message : 'Fehler beim Löschen.', 'error');
        }
    }
}

window.deleteRechnung = deleteRechnung;

async function deleteAngebot(id) {
    if (await safeConfirm('Möchten Sie dieses Angebot wirklich löschen?')) {
        try {
            await window.api.deleteDocument(id, 'angebot');
            const newState = await window.api.getFullState();
            state.angebote = newState.angebote;
            state.rechnungen = newState.rechnungen;
            state.artikel = newState.artikel;
            if (document.getElementById('view-angebote') && !document.getElementById('view-angebote').classList.contains('hidden')) {
                renderAngebote();
            } else if (document.getElementById('view-projekt-details') && !document.getElementById('view-projekt-details').classList.contains('hidden')) {
                if (state.currentProjektId) openProjektDetails(state.currentProjektId);
            }
            showToast('Angebot gelöscht.', 'success');
        } catch (e) {
            console.error('Error deleting document:', e);
            showToast(e && e.message ? e.message : 'Fehler beim Löschen.', 'error');
        }
    }
}

window.deleteAngebot = deleteAngebot;

async function storniereRechnung(id) {
    const original = state.rechnungen.find(r => r.id === id);
    if (!original) return;

    if (await safeConfirm(`Möchten Sie für die Rechnung ${original.nr} wirklich eine Stornorechnung (Gutschrift) erstellen? Dies kann nicht rückgängig gemacht werden.`)) {
        const stornoData = window.InvoiceController.createStornoData(original);
        if (!stornoData) return;

        try {
            const model = new window.InvoiceModel(window.api);
            const newState = await model.storniereRechnung(stornoData.updatedOriginal, stornoData.stornoDoc);

            if (newState) {
                state.angebote = newState.angebote;
                state.rechnungen = newState.rechnungen;
                state.artikel = newState.artikel;
            }

            if (document.getElementById('view-dashboard') && !document.getElementById('view-dashboard').classList.contains('hidden')) {
                renderDashboard();
            } else if (document.getElementById('view-rechnungen') && !document.getElementById('view-rechnungen').classList.contains('hidden')) {
                renderRechnungen();
            }
            showToast(`Stornorechnung ${stornoData.stornoNr} wurde erfolgreich erstellt.`, 'success');
        } catch (e) {
            console.error('Fehler beim Stornieren:', e);
            showToast('Fehler beim Stornieren der Rechnung', 'error');
        }
    }
}

window.storniereRechnung = storniereRechnung;

async function markAsPaid(id) {
    const rech = state.rechnungen.find(r => r.id === id);
    if (!rech) return;

    if (await safeConfirm(`Möchten Sie die Rechnung ${rech.nr} als bezahlt markieren?`)) {
        try {
            const model = new window.InvoiceModel(window.api);
            await model.markAsPaid(rech);
            showToast(`Rechnung ${rech.nr} als bezahlt markiert.`, 'success');

            if (document.getElementById('view-dashboard') && !document.getElementById('view-dashboard').classList.contains('hidden')) {
                renderDashboard();
            } else if (document.getElementById('view-rechnungen') && !document.getElementById('view-rechnungen').classList.contains('hidden')) {
                renderRechnungen(document.getElementById('global-search') ? document.getElementById('global-search').value : '');
            }
        } catch (e) {
            console.error('Fehler beim Markieren als bezahlt:', e);
            showToast('Fehler beim Speichern des Status', 'error');
        }
    }
}

window.markAsPaid = markAsPaid;

function convertToRechnung(angId) {
    const ang = state.angebote.find(a => a.id === angId);
    if (!ang) return;

    openRechnungModal();

    // Deep copy positions
    state.currentRechnungPositionen = JSON.parse(JSON.stringify(ang.positionen));

    // Fill static fields
    document.getElementById('rechnung-kunde').value = ang.kundeId;
    if (ang.projektId) {
        document.getElementById('rechnung-projekt').value = ang.projektId;
    }

    document.getElementById('rechnung-global-rabatt').value = (ang.globalRabattValue !== undefined && ang.globalRabattValue !== null && ang.globalRabattValue !== 0) ? ang.globalRabattValue : '';
    setRabattType(ang.globalRabattType || '%');
    document.getElementById('rechnung-anzahlung').value = ang.anzahlung > 0 ? ang.anzahlung : '';

    handleKundeSelect({ target: { value: ang.kundeId } });
    renderRechnungPositionen();

    // Switch view to dashboard so that users can see it after saving
    document.getElementById('nav-dashboard').click();
}

window.convertToRechnung = convertToRechnung;

function syncAngebotFieldToRechnung(srcId, targetId) {
    const src = document.getElementById(srcId);
    const target = document.getElementById(targetId);
    if (src && target && target.value !== src.value) {
        target.value = src.value;
    }
}

window.syncAngebotFieldToRechnung = syncAngebotFieldToRechnung;

function collectAngebotFormData() {
    const existingIdVal = document.getElementById('rechnung-id')?.value;
    const existingId = existingIdVal ? parseInt(existingIdVal, 10) : null;
    const existing = existingId ? (state.angebote || []).find(a => a.id === existingId) : null;

    const kundeId = document.getElementById('rechnung-kunde')?.value || '';
    const projektId = document.getElementById('rechnung-projekt')?.value || '';
    const objektWert = document.getElementById('rechnung-objekt')?.value || '';
    const [objektTyp, objektIdStr] = objektWert ? objektWert.split(':') : [null, null];
    const rawDatum = document.getElementById('rechnung-datum')?.value || '';
    const rawFaellig = document.getElementById('rechnung-faellig')?.value || '';
    const datum = typeof formatDateISO === 'function' ? (formatDateISO(rawDatum) || formatDateISO(new Date())) : rawDatum;
    const faellig = typeof formatDateISO === 'function' ? (formatDateISO(rawFaellig) || datum) : rawFaellig;
    const nr = document.getElementById('rechnung-nr')?.value || '';

    const auftraggeberTypEl = document.getElementById('angebot-auftraggeber-typ');
    const vertragsgrundlageEl = document.getElementById('angebot-vertragsgrundlage');
    const auftraggeber_typ = auftraggeberTypEl ? auftraggeberTypEl.value : (existing?.auftraggeber_typ || 'PRIVAT');
    const vertragsgrundlage = vertragsgrundlageEl ? vertragsgrundlageEl.value : (existing?.vertragsgrundlage || 'BGB_WERKVERTRAG');

    const baustellenEl = document.getElementById('angebot-baustellen-adresse');
    const baustellen_adresse = baustellenEl ? baustellenEl.value.trim() : (existing?.baustellen_adresse || '');

    const ausfVonEl = document.getElementById('angebot-ausfuehrung-von');
    const ausfBisEl = document.getElementById('angebot-ausfuehrung-bis');
    const leistungszeitraum_von = ausfVonEl ? ausfVonEl.value : (existing?.leistungszeitraum_von || '');
    const leistungszeitraum_bis = ausfBisEl ? ausfBisEl.value : (existing?.leistungszeitraum_bis || '');

    const sichEl = document.getElementById('angebot-sicherheitseinbehalt');
    let sicherheitseinbehalt_prozent = 0;
    if (sichEl) {
        const sVal = sichEl.value.trim();
        sicherheitseinbehalt_prozent = (sVal !== '' && !isNaN(parseFloat(sVal))) ? parseFloat(sVal) : 0;
    } else if (existing?.sicherheitseinbehalt_prozent !== undefined) {
        sicherheitseinbehalt_prozent = parseFloat(existing.sicherheitseinbehalt_prozent) || 0;
    }

    const cb13b = document.getElementById('angebot-13b-ustg');
    let unterliegt_13b = 0;
    if (cb13b) {
        unterliegt_13b = (auftraggeber_typ !== 'PRIVAT' && cb13b.checked) ? 1 : 0;
    } else if (existing && existing.unterliegt_13b !== undefined) {
        unterliegt_13b = existing.unterliegt_13b ? 1 : 0;
    }
    const ist_privatkunde = (auftraggeber_typ === 'PRIVAT') ? 1 : 0;
    const vob_vereinbart = (vertragsgrundlage === 'VOB_B') ? 1 : 0;

    const positions = (state.currentRechnungPositionen || []).map((p, idx) => {
        const rawPreis = (p.preis !== undefined && p.preis !== null) ? String(p.preis).trim() : '';
        const parsedPreis = (rawPreis === '' || isNaN(parseFloat(p.preis))) ? null : parseFloat(p.preis);
        return {
            id: p.id !== undefined ? p.id : null,
            positionIndex: idx,
            artikelId: p.artikelId || null,
            titel: p.titel || null,
            name: p.name || '',
            menge: parseFloat(p.menge) || 0,
            einheit: p.einheit || 'Stk.',
            preis: parsedPreis,
            preis_null_bestaetigt: Boolean(p.preis_null_bestaetigt),
            ek: parseFloat(p.ek) || 0,
            mwst: p.mwst !== undefined && p.mwst !== null ? parseFloat(p.mwst) : 19,
            rabatt: parseFloat(p.rabatt) || 0,
            positionstyp: (p.positionstyp || 'NORMAL').toUpperCase().trim(),
            in_endsumme_enthalten: window.AngebotController ? window.AngebotController.normalizeInEndsumme(p.in_endsumme_enthalten, p.positionstyp) : 1,
            bieterangabe_wert: p.bieterangabe_wert || null,
            oz_code: p.oz_code || null,
            cost_type: p.cost_type || 'MATERIAL'
        };
    });

    const totals = window.AngebotController
        ? window.AngebotController.calculateTotals(positions, { unterliegt_13b: Boolean(unterliegt_13b) })
        : { netto: 0, steuer: 0, brutto: 0 };

    const sicherheitseinbehalt = (totals.netto && sicherheitseinbehalt_prozent > 0)
        ? Math.round(totals.netto * sicherheitseinbehalt_prozent) / 100
        : 0;

    const doc = {
        id: existingId,
        type: 'angebot',
        nr,
        datum,
        faellig,
        kundeId: kundeId ? parseInt(kundeId, 10) : null,
        projektId: projektId ? parseInt(projektId, 10) : null,
        objekt_typ: objektTyp || null,
        objekt_id: objektIdStr ? parseInt(objektIdStr, 10) : null,
        positionen: positions,
        netto: totals.netto,
        steuer: totals.steuer,
        brutto: totals.brutto,
        globalRabattAbzug: 0,
        globalRabattType: document.getElementById('rechnung-global-rabatt-type')?.value || '%',
        globalRabattValue: parseFloat(document.getElementById('rechnung-global-rabatt')?.value) || 0,
        anzahlung: 0,
        zahlbetrag: totals.brutto,
        status: existing?.status || 'Entwurf',
        angebot_status: existing?.angebot_status || 'ENTWURF',
        version: existing?.version || 1,
        parent_angebot_id: existing?.parent_angebot_id || null,
        freeze_snapshot_json: existing?.freeze_snapshot_json || null,
        auftraggeber_typ,
        vertragsgrundlage,
        baustellen_adresse,
        leistungszeitraum_von,
        leistungszeitraum_bis,
        sicherheitseinbehalt_prozent,
        sicherheitseinbehalt,
        unterliegt_13b,
        ist_privatkunde,
        vob_vereinbart,
        vergabe_verfahren: existing?.vergabe_verfahren || 'DIREKT',
        angenommen_am: existing?.angenommen_am || null,
        angenommene_version: existing?.angenommene_version || null,
        vortext: document.getElementById('rechnung-vortext')?.value || '',
        fusstext: document.getElementById('rechnung-fusstext')?.value || '',
        skonto_tage: document.getElementById('rechnung-skonto-tage')?.value ? parseInt(document.getElementById('rechnung-skonto-tage').value, 10) : null,
        skonto_prozent: document.getElementById('rechnung-skonto-prozent')?.value ? parseFloat(document.getElementById('rechnung-skonto-prozent').value) : null,
        ausfuehrungszeitraum: existing?.ausfuehrungszeitraum || '',
        zahlungsbedingungen: existing?.zahlungsbedingungen || '',
        konditionen: existing?.konditionen || '',
        isLocked: existing?.isLocked || false
    };

    return { doc, positions };
}

window.collectAngebotFormData = collectAngebotFormData;

async function createNextAngebotVersion() {
    const existingIdVal = document.getElementById('rechnung-id')?.value;
    const existingId = existingIdVal ? parseInt(existingIdVal, 10) : null;
    const existing = existingId ? (state.angebote || []).find(a => a.id === existingId) : null;

    if (!existing) {
        showToast('Kein bestehendes Angebot zum Versionieren gefunden.', 'error');
        return;
    }

    const nextVer = (parseInt(existing.version, 10) || 1) + 1;
    if (!(await safeConfirm(`Möchten Sie eine neue Verhandlungs-Version (v${nextVer}) auf Basis von ${existing.nr} anlegen?\n\nDie bisherige Version bleibt unverändert gefroren.`))) {
        return;
    }

    try {
        const newVersionObj = window.AngebotController.createVersion(existing, existing.positionen);
        const newDocId = await window.api.saveDocument(newVersionObj);
        const fullState = await window.api.getFullState();
        if (fullState) {
            state.angebote = fullState.angebote || [];
            state.rechnungen = fullState.rechnungen || [];
        }
        showToast(`Neue Version ${newVersionObj.nr} (v${newVersionObj.version}) als Entwurf angelegt.`, 'success');
        closeRechnungModal();
        if (typeof renderAngebote === 'function') renderAngebote();
        openAngebotModal(newDocId);
    } catch (err) {
        console.error('Fehler beim Erstellen der neuen Version:', err);
        showToast('Fehler beim Erstellen der Version: ' + (err.message || err), 'error');
    }
}

window.createNextAngebotVersion = createNextAngebotVersion;

async function acceptAngebotFromModal() {
    const existingIdVal = document.getElementById('rechnung-id')?.value;
    const existingId = existingIdVal ? parseInt(existingIdVal, 10) : null;
    const existing = existingId ? (state.angebote || []).find(a => a.id === existingId) : null;

    if (!existing) {
        showToast('Kein Angebot gefunden.', 'error');
        return;
    }

    if (!(await safeConfirm(`Angebot ${existing.nr} (v${existing.version || 1}) verbindlich als ANGENOMMEN markieren?`))) {
        return;
    }

    try {
        window.AngebotController.acceptAngebot(existing, existing.version);
        await window.api.saveDocument(existing);
        const fullState = await window.api.getFullState();
        if (fullState) {
            state.angebote = fullState.angebote || [];
            state.rechnungen = fullState.rechnungen || [];
        }
        showToast(`Angebot ${existing.nr} wurde als ANGENOMMEN markiert.`, 'success');
        const updated = (state.angebote || []).find(a => a.id === existing.id);
        const form = document.getElementById('rechnung-form');
        const submitBtn = document.getElementById('rechnung-modal-submit');
        applyAngebotEditMode(updated, form, submitBtn);
        if (typeof renderAngebote === 'function') renderAngebote();
    } catch (err) {
        console.error('Fehler beim Annehmen des Angebots:', err);
        showToast('Fehler beim Annehmen: ' + (err.message || err), 'error');
    }
}

window.acceptAngebotFromModal = acceptAngebotFromModal;

async function rejectAngebotFromModal() {
    const existingIdVal = document.getElementById('rechnung-id')?.value;
    const existingId = existingIdVal ? parseInt(existingIdVal, 10) : null;
    const existing = existingId ? (state.angebote || []).find(a => a.id === existingId) : null;

    if (!existing) return;

    if (!(await safeConfirm(`Angebot ${existing.nr} als ABGELEHNT markieren?`))) {
        return;
    }

    try {
        existing.angebot_status = 'ABGELEHNT';
        existing.status = 'Abgelehnt';
        await window.api.saveDocument(existing);
        const fullState = await window.api.getFullState();
        if (fullState) {
            state.angebote = fullState.angebote || [];
        }
        showToast(`Angebot ${existing.nr} wurde als ABGELEHNT markiert.`, 'info');
        const updated = (state.angebote || []).find(a => a.id === existing.id);
        const form = document.getElementById('rechnung-form');
        const submitBtn = document.getElementById('rechnung-modal-submit');
        applyAngebotEditMode(updated, form, submitBtn);
        if (typeof renderAngebote === 'function') renderAngebote();
    } catch (err) {
        console.error('Fehler beim Ablehnen des Angebots:', err);
        showToast('Fehler beim Ablehnen: ' + (err.message || err), 'error');
    }
}

window.rejectAngebotFromModal = rejectAngebotFromModal;

async function createProjektFromAngebotModal() {
    const existingIdVal = document.getElementById('rechnung-id')?.value;
    const existingId = existingIdVal ? parseInt(existingIdVal, 10) : null;
    const existing = existingId ? (state.angebote || []).find(a => a.id === existingId) : null;

    if (!existing) {
        showToast('Kein Angebot gefunden.', 'error');
        return;
    }

    const sVer = existing.angenommene_version || existing.version || 1;
    const existingProjekt = (state.projekte || []).find(p => p.source_angebot_id === existing.id && (p.source_angebot_version || 1) === sVer);
    if (existingProjekt) {
        showToast(`Für dieses Angebot existiert bereits Projekt #${existingProjekt.id} (${existingProjekt.name}).`, 'info');
        return;
    }

    if (!(await safeConfirm(`Aus Angebot ${existing.nr} (v${sVer}) jetzt ein neues Projekt anlegen?`))) {
        return;
    }

    try {
        const projektData = window.AngebotController.createProjektFromAngebot(existing, existing.positionen, {
            name: `Projekt: ${existing.nr} (v${sVer})`
        });
        const newProjId = await window.api.saveProjekt(projektData);
        const fullState = await window.api.getFullState();
        if (fullState) {
            state.projekte = fullState.projekte || [];
            state.angebote = fullState.angebote || [];
        }
        showToast(`Projekt #${newProjId} erfolgreich aus Angebot ${existing.nr} angelegt!`, 'success');
        closeRechnungModal();
        if (typeof renderAngebote === 'function') renderAngebote();
        if (typeof renderProjekte === 'function') renderProjekte();
        if (typeof openProjektDetails === 'function') {
            openProjektDetails(newProjId);
        } else if (typeof switchView === 'function') {
            switchView('projekte');
        }
    } catch (err) {
        console.error('Fehler bei der Projektanlage:', err);
        showToast('Fehler bei Projektanlage: ' + (err.message || err), 'error');
    }
}

window.createProjektFromAngebotModal = createProjektFromAngebotModal;

function navigateToAngebotProjekt(projId) {
    closeRechnungModal();
    if (typeof openProjektDetails === 'function') {
        openProjektDetails(projId);
    } else if (typeof switchView === 'function') {
        switchView('projekte');
    }
}

window.navigateToAngebotProjekt = navigateToAngebotProjekt;
