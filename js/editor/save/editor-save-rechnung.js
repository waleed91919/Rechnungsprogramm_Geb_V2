async function saveRechnung() {
    if (window.isSavingRechnung) return;
    const submitBtn = document.getElementById('rechnung-modal-submit');
    const submitText = document.getElementById('rechnung-modal-submit-text');
    const originalText = submitText ? submitText.innerText : 'Rechnung Speichern';

    try {
        window.isSavingRechnung = true;
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
        window.isSavingRechnung = false;
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