async function exportZugferdPdfFromModal() {
    let currentDoc, customer, nr;
    try {
        ({ currentDoc, customer, nr } = collectERechnungExportData());
    } catch (gateErr) {
        showToast(gateErr.message || 'E-Rechnungs-Export blockiert: ungespeicherter Entwurf.', 'error');
        return;
    }
    if (!validateERechnungForB2G(currentDoc, customer)) return;

    if (!(window.api && typeof window.api.exportZugferdPdf === 'function')) {
        showToast('ZUGFeRD-PDF/A-3-Export ist in dieser App-Version nicht verfügbar.', 'error');
        return;
    }

    // Sichtseite aus DEMSELBEN doc-Objekt unsichtbar rendern; der Main-Prozess
    // erfasst sie per printToPDF (nur #print-template ist im @media print sichtbar).
    let previousTemplateHtml = null;
    try {
        if (typeof window.renderInvoiceForZugferdExport === 'function') {
            previousTemplateHtml = await window.renderInvoiceForZugferdExport(currentDoc, customer);
        }
    } catch (renderErr) {
        console.warn('ZUGFeRD-Sichtseite konnte nicht gerendert werden - Export läuft mit Platzhalter-Seite:', renderErr);
    }

    try {
        const res = await window.api.exportZugferdPdf({
            docId: currentDoc.id,
            doc: currentDoc,
            customer,
            profile: 'EN16931',
            fileNameHint: `ZUGFeRD_${nr}.pdf`,
            allowFallback: true
        });
        if (res && res.success) {
            if (res.sichtseiteQuelle === 'fallback') {
                showToast(`ZUGFeRD PDF/A-3 mit Platzhalter-Seite gespeichert: ${res.path}`, 'info');
            } else {
                showToast(`ZUGFeRD PDF/A-3 gespeichert: ${res.path}`, 'success');
            }
        } else if (res && res.cancelled) {
            showToast('ZUGFeRD-Export abgebrochen.', 'info');
        } else {
            showToast('ZUGFeRD-Export fehlgeschlagen: ' + ((res && res.error) || 'Unbekannter Fehler'), 'error');
        }
    } catch (err) {
        showToast('ZUGFeRD-Export fehlgeschlagen: ' + err.message, 'error');
    } finally {
        if (previousTemplateHtml !== null && typeof window.restorePrintTemplateContent === 'function') {
            window.restorePrintTemplateContent(previousTemplateHtml);
        }
    }
}

window.exportZugferdPdfFromModal = exportZugferdPdfFromModal;

async function exportXRechnungXMLFromModal() {
    const format = document.getElementById('rechnung-erechnung-format')?.value || 'XRECHNUNG';
    if (format === 'ZUGFERD') {
        await exportZugferdPdfFromModal();
        return;
    }

    const { currentDoc, customer, nr } = (() => {
        try {
            return collectERechnungExportData();
        } catch (gateErr) {
            showToast(gateErr.message || 'E-Rechnungs-Export blockiert: ungespeicherter Entwurf.', 'error');
            return {};
        }
    })();
    if (!currentDoc) return;
    if (!validateERechnungForB2G(currentDoc, customer)) return;

    if (window.api && typeof window.api.exportXRechnungXml === 'function') {
        try {
            const res = await window.api.exportXRechnungXml({
                docId: currentDoc.id,
                doc: currentDoc,
                customer,
                fileNameHint: `XRechnung_${nr}.xml`
            });
            if (res && res.success) {
                showToast(`XRechnung XML gespeichert: ${res.path}`, 'success');
                return;
            } else if (res && res.cancelled) {
                showToast('XRechnung-Export abgebrochen.', 'info');
                return;
            } else if (res && res.validationErrors) {
                showToast('XRechnung-Export blockiert - Validierungsfehler: ' + res.validationErrors.join(' '), 'error');
                return;
            } else if (res && res.error) {
                showToast('XRechnung-Export fehlgeschlagen: ' + res.error, 'error');
                return;
            }
        } catch (ipcErr) {
            console.warn('IPC exportXRechnungXml fehlgeschlagen, nutze Fallback:', ipcErr);
        }
    }

    const engine = (typeof EInvoiceEngine !== 'undefined') ? EInvoiceEngine : (window.EInvoiceEngine || null);
    if (engine) {
        const xml = engine.generateXRechnungXML(currentDoc, customer, state.einstellungen);
        const blob = new Blob([xml], { type: 'application/xml;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `XRechnung_${nr}.xml`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast(`XRechnung XML für ${nr} heruntergeladen.`, 'success');
    } else {
        showToast('E-Rechnungs-Engine nicht bereit.', 'error');
    }
}

window.exportXRechnungXMLFromModal = exportXRechnungXMLFromModal;

async function previewAngebotPdf() {
    const existingIdVal = document.getElementById('rechnung-id')?.value;
    const existingId = existingIdVal ? parseInt(existingIdVal, 10) : null;
    let angebot = existingId ? (state.angebote || []).find(a => a.id === existingId) : null;

    if (!angebot) {
        const { doc } = collectAngebotFormData();
        if (!doc.kundeId) {
            showToast('Bitte wählen Sie vor der Vorschau einen Kunden aus.', 'error');
            return;
        }
        doc.angebot_status = 'ENTWURF';
        doc.status = 'Entwurf';
        try {
            const savedId = await window.api.saveDocument(doc);
            const fullState = await window.api.getFullState();
            if (fullState) state.angebote = fullState.angebote || [];
            angebot = (state.angebote || []).find(a => a.id === savedId);
            const idInput = document.getElementById('rechnung-id');
            if (idInput) idInput.value = savedId;
        } catch (err) {
            showToast('Fehler bei Vorbereitung der PDF-Vorschau: ' + err.message, 'error');
            return;
        }
    }

    // Explizit: Status MUSS Entwurf bleiben und Freeze-Snapshot null
    if (angebot && (angebot.angebot_status === 'ENTWURF' || !angebot.freeze_snapshot_json)) {
        angebot.angebot_status = 'ENTWURF';
        angebot.status = 'Entwurf';
        angebot.freeze_snapshot_json = null;
    }

    if (typeof window.generatePdf === 'function') {
        await window.generatePdf(angebot.id, true);
    }
}

window.previewAngebotPdf = previewAngebotPdf;

async function openAufmassModalForPosition(posId) {
    if (!window.aufmassViewInstance) {
        window.aufmassViewInstance = new window.AufmassView('aufmass-modal');
    }
    const pos = (state.currentRechnungPositionen || []).find(p => p.id === posId);
    const einheit = pos ? (pos.einheit || 'm²') : 'm²';
    await window.aufmassViewInstance.openModal(posId, (total, targetId) => {
        handlePositionChange(targetId, 'menge', total);
        renderRechnungPositionen();
    }, einheit);
}

window.openAufmassModalForPosition = openAufmassModalForPosition;

function collectERechnungExportData(options = {}) {
    // P0.4 Belegfixierung: Exportdaten stammen aus dem GESPEICHERTEN Beleg.
    // Pflicht: belegId (aus DB geladen). Ohne belegId → throw, kein Export.
    const belegIdRaw = options.belegId !== undefined ? options.belegId
        : document.getElementById('rechnung-id')?.value;
    const belegId = belegIdRaw !== '' && belegIdRaw !== null && belegIdRaw !== undefined
        ? parseInt(belegIdRaw, 10) : null;
    if (!Number.isFinite(belegId)) {
        throw new Error('E-Rechnungs-Export blockiert: Feld „Beleg-ID“ fehlt — Beleg erst speichern und festschreiben (Entwurf nur als Vorschau).');
    }
    const savedList = (state.rechnungen || []).concat(state.dokumente || []);
    const savedDoc = savedList.find(d => parseInt(d.id) === belegId) || null;
    if (savedDoc && !savedDoc.isLocked && savedDoc.status !== 'Festgeschrieben' && !options.allowDraft) {
        throw new Error(`E-Rechnungs-Export blockiert: Feld „Status“ ist „${savedDoc.status || 'Entwurf'}“ — nur festgeschriebene Belege sind versandfähig.`);
    }
    const kundeId = parseInt(document.getElementById('rechnung-kunde')?.value);
    const kunde = state.kunden.find(k => k.id === kundeId) || { name: 'Empfänger' };
    const nr = document.getElementById('rechnung-nr')?.value || 'RE-000';
    const datum = document.getElementById('rechnung-datum')?.value || new Date().toISOString().split('T')[0];
    const faellig = document.getElementById('rechnung-faellig')?.value || datum;
    const leitweg_id = document.getElementById('rechnung-leitweg-id')?.value || kunde.leitweg_id || '';
    const buyer_reference = document.getElementById('rechnung-buyer-reference')?.value || kunde.buyer_reference || leitweg_id;
    const unterliegt_13b = document.getElementById('rechnung-13b-ustg')?.checked ? 1 : 0;
    const customer_type = document.getElementById('rechnung-customer-type')?.value || kunde.customer_type || 'B2B';

    const currentDoc = {
        id: belegId,
        nr,
        datum,
        faellig,
        leitweg_id,
        buyer_reference,
        customer_type,
        unterliegt_13b,
        netto: state.currentRechnungTotals ? state.currentRechnungTotals.netto : 0,
        steuer: state.currentRechnungTotals ? state.currentRechnungTotals.steuer : 0,
        brutto: state.currentRechnungTotals ? state.currentRechnungTotals.brutto : 0,
        globalRabattAbzug: state.currentRechnungTotals ? state.currentRechnungTotals.rabattAbzug : 0,
        anzahlung: state.currentRechnungTotals ? state.currentRechnungTotals.anzahlung : 0,
        sicherheitseinbehalt: state.currentRechnungTotals ? state.currentRechnungTotals.sicherheitseinbehalt : 0,
        sicherheitseinbehalt_prozent: (state.currentRechnungTotals && state.currentRechnungTotals.sicherheitseinbehalt_prozent !== undefined)
            ? state.currentRechnungTotals.sicherheitseinbehalt_prozent
            : (parseFloat(document.getElementById('rechnung-sicherheitseinbehalt-prozent')?.value || document.getElementById('rechnung-handwerk-sicherheitseinbehalt')?.value) || 0),
        zahlbetrag: state.currentRechnungTotals ? state.currentRechnungTotals.zahlbetrag : 0,
        verrechnungen: [...(state.currentRechnungVerrechnungen || [])],
        positionen: [...(state.currentRechnungPositionen || [])],
        eingabemodus: document.getElementById('rechnung-eingabemodus')?.value || 'netto',
        leistungszeitraum_von: document.getElementById('rechnung-leistungszeitraum-von')?.value || '',
        leistungszeitraum_bis: document.getElementById('rechnung-leistungszeitraum-bis')?.value || '',
        vob_vereinbart: document.getElementById('rechnung-vob-vereinbart')?.checked ? 1 : 0,
        ist_privatkunde: (customer_type === 'B2C' && document.getElementById('rechnung-ist-privatkunde')?.checked) ? 1 : 0,
        unterliegt_bauabzugsteuer: (customer_type !== 'B2C' && document.getElementById('rechnung-unterliegt-bauabzugsteuer')?.checked) ? 1 : 0,
        vortext: document.getElementById('rechnung-vortext')?.value || '',
        fusstext: document.getElementById('rechnung-fusstext')?.value || '',
        kumulierte_leistung_netto: state.currentRechnungTotals ? state.currentRechnungTotals.kumulierte_leistung_netto : 0
    };

    return { currentDoc, customer: { ...kunde, customer_type, leitweg_id, buyer_reference }, nr };
}

window.collectERechnungExportData = collectERechnungExportData;

function validateERechnungForB2G(currentDoc, customer) {
    const engine = (typeof EInvoiceEngine !== 'undefined') ? EInvoiceEngine : (window.EInvoiceEngine || null);
    if (!engine) {
        showToast('E-Rechnungs-Engine nicht verfügbar.', 'error');
        return false;
    }
    // Echtes Gate: Kundentyp bleibt unverändert, B2G-Pflichten greifen nur bei echten B2G-Kunden
    const validation = engine.validateForEN16931(currentDoc, customer, state.einstellungen);
    if (!validation.isValid) {
        showToast('E-Rechnungs-Export blockiert - Validierungsfehler: ' + validation.errors.join(' '), 'error');
        return false;
    }
    return true;
}

window.validateERechnungForB2G = validateERechnungForB2G;

async function openBelegEmailModal() {
    const kontext = collectBelegEmailContext();
    if (kontext.fehler) {
        showToast(kontext.fehler, 'error');
        return;
    }

    const chipEl = document.getElementById('email-modal-chip');
    chipEl.textContent = kontext.beleg_typ === 'MAHNUNG' ? `Mahnung Stufe ${kontext.mahnstufe || 1}` : (kontext.beleg_typ === 'ANGEBOT' ? 'Angebot' : 'Rechnung');
    document.getElementById('email-modal-nr').textContent = kontext.nr || '';

    const empfaengerEl = document.getElementById('email-modal-empfaenger');
    empfaengerEl.value = kontext.kunde.email || '';
    document.getElementById('email-modal-empfaenger-warnung').classList.toggle('hidden', !!kontext.kunde.email);

    document.getElementById('email-modal-cc').value = '';
    document.getElementById('email-modal-bcc').value = '';

    const firmenname = state.einstellungen.firmenname || '';
    let betreffVorschlag;
    if (kontext.beleg_typ === 'MAHNUNG') betreffVorschlag = `${kontext.mahnstufe || 1}. Mahnung zu Rechnung ${kontext.nr}`;
    else if (kontext.beleg_typ === 'ANGEBOT') betreffVorschlag = `Angebot ${kontext.nr} – ${firmenname}`;
    else betreffVorschlag = `Rechnung ${kontext.nr} – ${firmenname}`;
    document.getElementById('email-modal-betreff').value = betreffVorschlag;

    const signatur = state.einstellungen.email_signatur || '';
    const textVorschlag = fuelleEmailTemplate(kontext.beleg_typ, {
        kunde_name: kontext.kunde.name || '',
        nummer: kontext.nr || '',
        datum: kontext.datum || '',
        faelligkeit: kontext.faelligkeit || '',
        betrag_brutto: typeof kontext.brutto === 'number' ? kontext.brutto : parseFloat(kontext.brutto) || 0,
        firmenname
    });
    document.getElementById('email-modal-text').value = signatur ? `${textVorschlag}\n\n${signatur}` : textVorschlag;

    document.getElementById('email-modal-anhang').textContent =
        `${kontext.beleg_typ === 'MAHNUNG' ? 'Mahnung' : (kontext.beleg_typ === 'ANGEBOT' ? 'Angebot' : 'Rechnung')}_${String(kontext.nr).replace(/[\\/:*?"<>|]/g, '_')}.pdf`;

    document.getElementById('email-modal-pdf-kopie').checked = state.einstellungen.email_pdf_kopie_speichern === 'true';

    const fehlerEl = document.getElementById('email-modal-fehler');
    fehlerEl.classList.add('hidden');

    await ladeEmailKontoSelect();

    const m = document.getElementById('email-modal');
    m.dataset.belegTyp = kontext.beleg_typ;
    m.dataset.belegId = kontext.beleg_id;
    m.dataset.mahnstufe = kontext.mahnstufe || '';
    m.classList.remove('hidden');
    m.classList.add('flex');

    await ladeEmailHistorie(kontext.beleg_typ, kontext.beleg_id);
}

window.openBelegEmailModal = openBelegEmailModal;

async function sendeBelegEmailFromModal() {
    const m = document.getElementById('email-modal');
    const fehlerEl = document.getElementById('email-modal-fehler');
    const empfaenger = document.getElementById('email-modal-empfaenger').value.trim();
    const betreff = document.getElementById('email-modal-betreff').value.trim();
    fehlerEl.classList.add('hidden');

    if (!empfaenger || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(empfaenger)) {
        fehlerEl.textContent = 'Bitte eine gültige Empfänger-E-Mail-Adresse eingeben.';
        fehlerEl.classList.remove('hidden');
        return;
    }
    if (!betreff) {
        fehlerEl.textContent = 'Bitte einen Betreff eingeben.';
        fehlerEl.classList.remove('hidden');
        return;
    }

    const payload = {
        beleg_typ: m.dataset.belegTyp,
        beleg_id: parseInt(m.dataset.belegId),
        mahnstufe: m.dataset.mahnstufe ? parseInt(m.dataset.mahnstufe) : undefined,
        empfaenger,
        cc: document.getElementById('email-modal-cc').value.trim() || undefined,
        bcc: document.getElementById('email-modal-bcc').value.trim() || undefined,
        betreff,
        text: document.getElementById('email-modal-text').value,
        konto_id: document.getElementById('email-modal-konto').value || undefined
    };

    const sendBtn = document.getElementById('email-modal-send-btn');
    sendBtn.disabled = true;
    try {
        let vorherigesTemplateHtml = null;
        if (payload.beleg_typ !== 'MAHNUNG' && typeof window.renderInvoiceForZugferdExport === 'function') {
            const { currentDoc, customer } = collectERechnungExportData();
            try {
                vorherigesTemplateHtml = await window.renderInvoiceForZugferdExport(currentDoc, customer);
            } catch (renderErr) {
                console.warn('E-Mail-Sichtseite konnte nicht gerendert werden:', renderErr);
            }
        }

        let res;
        try {
            res = await window.api.sendBelegEmail(payload);
        } finally {
            if (vorherigesTemplateHtml !== null && typeof window.restorePrintTemplateContent === 'function') {
                window.restorePrintTemplateContent(vorherigesTemplateHtml);
            }
        }

        if (res && res.success) {
            showToast(`E-Mail erfolgreich versendet an ${empfaenger}.`, 'success');
            closeEmailModal();
        } else {
            fehlerEl.textContent = (res && res.fehlermeldung) || 'Unbekannter Fehler beim Versand.';
            fehlerEl.classList.remove('hidden');
            showToast(`E-Mail-Versand fehlgeschlagen: ${(res && res.fehlermeldung) || ''}`, 'error');
        }
        await ladeEmailHistorie(payload.beleg_typ, payload.beleg_id);
    } catch (e) {
        fehlerEl.textContent = e.message || String(e);
        fehlerEl.classList.remove('hidden');
    } finally {
        sendBtn.disabled = false;
    }
}

window.sendeBelegEmailFromModal = sendeBelegEmailFromModal;

function fuelleEmailTemplate(typ, kontext) {
    const templateKey = typ === 'MAHNUNG' ? 'email_text_mahnung' : (typ === 'ANGEBOT' ? 'email_text_angebot' : 'email_text_rechnung');
    const basis = (state.einstellungen && state.einstellungen[templateKey]) || EMAIL_STANDARD_TEXTE[typ] || '';
    return basis.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (voll, schluessel) => {
        if (!(schluessel in kontext)) return '';
        const wert = kontext[schluessel];
        if (schluessel === 'betrag_brutto') {
            return typeof wert === 'number' ? wert.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €' : String(wert == null ? '' : wert);
        }
        return wert == null ? '' : String(wert);
    });
}

window.fuelleEmailTemplate = fuelleEmailTemplate;

function collectBelegEmailContext() {
    if (state.belegEmailKontext && state.belegEmailKontext.beleg_typ === 'MAHNUNG') {
        const template = document.getElementById('print-template');
        if (template && template.innerHTML.includes('Mahnung')) {
            const k = state.belegEmailKontext;
            const kundeMahn = state.kunden.find(ku => parseInt(ku.id) === parseInt(k.kundeId)) || {};
            return { ...k, kunde: kundeMahn };
        }
        state.belegEmailKontext = null;
    }

    const { currentDoc, customer } = collectERechnungExportData();
    const existingIdVal = document.getElementById('rechnung-id') ? document.getElementById('rechnung-id').value : '';
    const belegId = existingIdVal ? parseInt(existingIdVal) : null;
    if (!belegId) {
        return { fehler: 'Bitte speichern Sie den Beleg zuerst, bevor Sie ihn per E-Mail versenden.' };
    }
    return {
        beleg_typ: state.isAngebotMode ? 'ANGEBOT' : 'RECHNUNG',
        beleg_id: belegId,
        nr: currentDoc.nr,
        brutto: currentDoc.brutto,
        datum: currentDoc.datum,
        faelligkeit: currentDoc.faellig,
        kunde: customer,
        currentDoc
    };
}

window.collectBelegEmailContext = collectBelegEmailContext;

async function ladeEmailKontoSelect() {
    const sel = document.getElementById('email-modal-konto');
    const hinweisBtn = document.getElementById('email-modal-konto-hinweis');
    sel.innerHTML = '<option value="">– kein Konto vorhanden –</option>';
    let konten = [];
    try {
        konten = await window.api.getSmtpKonten();
    } catch (_e) { /* ignore */ }

    if (konten.length === 0) {
        hinweisBtn.classList.remove('hidden');
        return;
    }
    hinweisBtn.classList.add('hidden');

    sel.innerHTML = '';
    konten.forEach(konto => {
        const opt = document.createElement('option');
        opt.value = konto.id;
        opt.textContent = `${konto.name} (${konto.absender_email})`;
        if (konto.ist_standard) opt.selected = true;
        sel.appendChild(opt);
    });
}

window.ladeEmailKontoSelect = ladeEmailKontoSelect;

function openSmtpSetupHinweis() {
    closeEmailModal();
    closePdfPreview();
    switchView('einstellungen');
    setTimeout(() => openSmtpKontoModal(), 300);
}

window.openSmtpSetupHinweis = openSmtpSetupHinweis;

function closeEmailModal() {
    const m = document.getElementById('email-modal');
    m.classList.add('hidden');
    m.classList.remove('flex');
}

window.closeEmailModal = closeEmailModal;

function toggleEmailPdfKopie(checked) {
    state.einstellungen.email_pdf_kopie_speichern = checked ? 'true' : 'false';
    window.api.saveEinstellung('email_pdf_kopie_speichern', checked ? 'true' : 'false')
        .catch(e => console.warn('PDF-Kopie-Einstellung nicht gespeichert:', e));
}

window.toggleEmailPdfKopie = toggleEmailPdfKopie;

async function ladeEmailHistorie(belegTyp, belegId) {
    const anzahlEl = document.getElementById('email-historie-anzahl');
    const body = document.getElementById('email-historie-body');
    body.innerHTML = '';
    let zeilen = [];
    try {
        zeilen = await window.api.getVersandhistorie(belegTyp, belegId);
    } catch (_e) { /* ignore */ }
    anzahlEl.textContent = String(zeilen.length);

    if (zeilen.length === 0) {
        body.innerHTML = '<tr><td colspan="5" class="px-2 py-3 text-center text-slate-400 italic">Noch keine E-Mails zu diesem Beleg versendet.</td></tr>';
        return;
    }

    zeilen.forEach(zeile => {
        const tr = document.createElement('tr');
        const statusBadge = zeile.status === 'VERSANDT'
            ? '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-green-100 text-green-800">Versandt</span>'
            : '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-red-100 text-red-700" title="' + sanitize(zeile.fehlermeldung || '') + '">Fehler</span>';
        const datumAnzeige = zeile.gesendet_am ? new Date(zeile.gesendet_am).toLocaleString('de-DE') : '-';
        tr.innerHTML = `
            <td class="px-2 py-1.5 whitespace-nowrap">${datumAnzeige}</td>
            <td class="px-2 py-1.5">${statusBadge}</td>
            <td class="px-2 py-1.5 truncate max-w-[160px]" title="${sanitize(zeile.empfaenger)}">${sanitize(zeile.empfaenger)}</td>
            <td class="px-2 py-1.5 text-center">${Number(zeile.versuche || 1)}</td>
            <td class="px-2 py-1.5 text-right"></td>`;
        const aktionTd = tr.lastElementChild;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = 'Versand wiederholen';
        btn.className = 'text-slate-400 hover:text-primary p-0.5 transition-colors';
        btn.innerHTML = '<span class="material-symbols-outlined text-[16px]">replay</span>';
        btn.onclick = () => wiederholeEmailVersandAusHistorie(Number(zeile.id), zeile.beleg_typ, Number(zeile.beleg_id));
        aktionTd.appendChild(btn);
        body.appendChild(tr);
    });
}

window.ladeEmailHistorie = ladeEmailHistorie;

function toggleEmailHistorie() {
    const panel = document.getElementById('email-historie-panel');
    const chevron = document.getElementById('email-historie-chevron');
    panel.classList.toggle('hidden');
    chevron.style.transform = panel.classList.contains('hidden') ? '' : 'rotate(180deg)';
}

window.toggleEmailHistorie = toggleEmailHistorie;

async function wiederholeEmailVersandAusHistorie(historieId, belegTyp, belegId) {
    try {
        const res = await window.api.wiederholeEmailVersand(historieId, null);
        if (res && res.success) {
            showToast('E-Mail erneut versendet.', 'success');
        } else {
            showToast(`Erneuter Versand fehlgeschlagen: ${(res && res.fehlermeldung) || ''}`, 'error');
        }
    } catch (e) {
        showToast(e.message || 'Wiederholen fehlgeschlagen.', 'error');
    }
    await ladeEmailHistorie(belegTyp, belegId);
}

window.wiederholeEmailVersandAusHistorie = wiederholeEmailVersandAusHistorie;
