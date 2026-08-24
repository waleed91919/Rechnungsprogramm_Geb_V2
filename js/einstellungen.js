// Settings Logic
function loadEinstellungenToForm() {
    document.getElementById('setting-firma').value = state.einstellungen.firmenname || '';
    document.getElementById('setting-adresse').value = state.einstellungen.adresse || '';
    document.getElementById('setting-bank').value = state.einstellungen.bankname || '';
    document.getElementById('setting-steuer').value = state.einstellungen.steuer || '';
    document.getElementById('setting-iban').value = state.einstellungen.iban || '';
    document.getElementById('setting-bic').value = state.einstellungen.bic || '';

    // Zahlungskonditionen
    document.getElementById('setting-zahlungsziel').value = state.einstellungen.zahlungsziel || '14';
    document.getElementById('setting-mahngebuehr-1').value = state.einstellungen.mahngebuehr1 || '0.00';
    document.getElementById('setting-mahngebuehr-2').value = state.einstellungen.mahngebuehr2 || '5.00';
    document.getElementById('setting-mahngebuehr-3').value = state.einstellungen.mahngebuehr3 || '10.00';

    // Allgemeine Einstellungen
    document.getElementById('setting-manuelle-nummern').checked = state.einstellungen.manuelleRechnungsnummer === 'true';
    if (document.getElementById('setting-rechnungsvorlage')) {
        document.getElementById('setting-rechnungsvorlage').value = state.einstellungen.rechnungsvorlage || 'klassisch';
    }
    if (document.getElementById('setting-eingabemodus')) {
        document.getElementById('setting-eingabemodus').value = state.einstellungen.eingabemodus || 'netto';
    }
    if (document.getElementById('setting-unternehmensart')) {
        document.getElementById('setting-unternehmensart').value = state.einstellungen.unternehmensart || 'handwerk';
    }

    if (document.getElementById('setting-email-text-rechnung')) {
        document.getElementById('setting-email-text-rechnung').value = state.einstellungen.email_text_rechnung || '';
        document.getElementById('setting-email-text-mahnung').value = state.einstellungen.email_text_mahnung || '';
        document.getElementById('setting-email-text-angebot').value = state.einstellungen.email_text_angebot || '';
        document.getElementById('setting-email-signatur').value = state.einstellungen.email_signatur || '';
        document.getElementById('setting-email-pdf-kopie').checked = state.einstellungen.email_pdf_kopie_speichern === 'true';
    }
    if (typeof renderSmtpKonten === 'function') {
        renderSmtpKonten();
    }

    const previewImg = document.getElementById('logo-preview-image');
    const btnRemove = document.getElementById('btn-remove-logo');
    if (state.einstellungen.logo) {
        previewImg.src = state.einstellungen.logo;
        previewImg.classList.remove('hidden');
        btnRemove.classList.remove('hidden');
    } else {
        previewImg.src = '';
        previewImg.classList.add('hidden');
        btnRemove.classList.add('hidden');
    }
}

async function saveEinstellungen() {
    state.einstellungen.firmenname = document.getElementById('setting-firma').value;
    state.einstellungen.adresse = document.getElementById('setting-adresse').value;
    state.einstellungen.bankname = document.getElementById('setting-bank').value;
    state.einstellungen.steuer = document.getElementById('setting-steuer').value;
    state.einstellungen.iban = document.getElementById('setting-iban').value;
    state.einstellungen.bic = document.getElementById('setting-bic').value;

    // Zahlungskonditionen
    state.einstellungen.zahlungsziel = document.getElementById('setting-zahlungsziel').value;
    state.einstellungen.mahngebuehr1 = document.getElementById('setting-mahngebuehr-1').value;
    state.einstellungen.mahngebuehr2 = document.getElementById('setting-mahngebuehr-2').value;
    state.einstellungen.mahngebuehr3 = document.getElementById('setting-mahngebuehr-3').value;

    // Allgemeine Einstellungen
    state.einstellungen.manuelleRechnungsnummer = document.getElementById('setting-manuelle-nummern').checked ? 'true' : 'false';
    if (document.getElementById('setting-rechnungsvorlage')) {
        state.einstellungen.rechnungsvorlage = document.getElementById('setting-rechnungsvorlage').value;
    }
    if (document.getElementById('setting-eingabemodus')) {
        state.einstellungen.eingabemodus = document.getElementById('setting-eingabemodus').value;
    }
    if (document.getElementById('setting-unternehmensart')) {
        state.einstellungen.unternehmensart = document.getElementById('setting-unternehmensart').value;
    }
    if (document.getElementById('setting-email-text-rechnung')) {
        state.einstellungen.email_text_rechnung = document.getElementById('setting-email-text-rechnung').value;
        state.einstellungen.email_text_mahnung = document.getElementById('setting-email-text-mahnung').value;
        state.einstellungen.email_text_angebot = document.getElementById('setting-email-text-angebot').value;
        state.einstellungen.email_signatur = document.getElementById('setting-email-signatur').value;
        state.einstellungen.email_pdf_kopie_speichern = document.getElementById('setting-email-pdf-kopie').checked ? 'true' : 'false';
    }

    try {
        await window.api.saveEinstellung('firmenname', state.einstellungen.firmenname);
        await window.api.saveEinstellung('adresse', state.einstellungen.adresse);
        await window.api.saveEinstellung('bankname', state.einstellungen.bankname);
        await window.api.saveEinstellung('steuer', state.einstellungen.steuer);
        await window.api.saveEinstellung('iban', state.einstellungen.iban);
        await window.api.saveEinstellung('bic', state.einstellungen.bic);

        // Zahlungskonditionen speichern
        await window.api.saveEinstellung('zahlungsziel', state.einstellungen.zahlungsziel);
        await window.api.saveEinstellung('mahngebuehr1', state.einstellungen.mahngebuehr1);
        await window.api.saveEinstellung('mahngebuehr2', state.einstellungen.mahngebuehr2);
        await window.api.saveEinstellung('mahngebuehr3', state.einstellungen.mahngebuehr3);

        // Allgemeine Einstellungen speichern
        await window.api.saveEinstellung('manuelleRechnungsnummer', state.einstellungen.manuelleRechnungsnummer);
        if (state.einstellungen.rechnungsvorlage) {
            await window.api.saveEinstellung('rechnungsvorlage', state.einstellungen.rechnungsvorlage);
        }
        if (state.einstellungen.eingabemodus) {
            await window.api.saveEinstellung('eingabemodus', state.einstellungen.eingabemodus);
        }
        if (state.einstellungen.unternehmensart) {
            await window.api.saveEinstellung('unternehmensart', state.einstellungen.unternehmensart);
        }
        if (document.getElementById('setting-email-text-rechnung')) {
            await window.api.saveEinstellung('email_text_rechnung', state.einstellungen.email_text_rechnung);
            await window.api.saveEinstellung('email_text_mahnung', state.einstellungen.email_text_mahnung);
            await window.api.saveEinstellung('email_text_angebot', state.einstellungen.email_text_angebot);
            await window.api.saveEinstellung('email_signatur', state.einstellungen.email_signatur);
            await window.api.saveEinstellung('email_pdf_kopie_speichern', state.einstellungen.email_pdf_kopie_speichern);
        }
        if (state.einstellungen.logo) {
            await window.api.saveEinstellung('logo', state.einstellungen.logo);
        } else {
            await window.api.saveEinstellung('logo', '');
        }

        if (typeof applyUnternehmensartVisibility === 'function') {
            applyUnternehmensartVisibility();
        }

        showToast('Einstellungen erfolgreich gespeichert!', 'success');
    } catch (e) {
        console.error('Error saving settings:', e);
        showToast('Fehler beim Speichern der Einstellungen.', 'error');
    }
}

function handleLogoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const base64Str = e.target.result;
        state.einstellungen.logo = base64Str;

        const previewImg = document.getElementById('logo-preview-image');
        previewImg.src = base64Str;
        previewImg.classList.remove('hidden');
        document.getElementById('btn-remove-logo').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

function removeLogo() {
    state.einstellungen.logo = '';
    document.getElementById('logo-upload').value = '';
    document.getElementById('logo-preview-image').classList.add('hidden');
    document.getElementById('btn-remove-logo').classList.add('hidden');
}

async function createDatabaseBackup() {
    try {
        const result = await window.api.backupDatabase();
        if (result.success) {
            showToast(`Backup erfolgreich erstellt unter: ${result.path}`, 'success');
        } else if (!result.cancelled) {
            showToast('Fehler beim Erstellen des Backups.', 'error');
        }
    } catch (e) {
        console.error('Backup error:', e);
        showToast('Fehler beim Erstellen des Backups.', 'error');
    }
}

// Restore Logic
function openRestoreModal() {
    const modal = document.getElementById('restore-modal');
    const input = document.getElementById('restore-confirm-input');
    const btn = document.getElementById('restore-confirm-btn');
    if (modal && input && btn) {
        input.value = '';
        btn.disabled = true;
        modal.classList.remove('hidden');
        input.focus();
    }
}

function closeRestoreModal() {
    const modal = document.getElementById('restore-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

async function handleRestoreBackup() {
    const input = document.getElementById('restore-confirm-input');
    if (input.value !== 'BESTÄTIGEN') {
        showToast('Bitte geben Sie BESTÄTIGEN ein.', 'error');
        return;
    }

    try {
        closeRestoreModal();
        const result = await window.api.restoreDatabase();
        if (result.success) {
            // App will relaunch, but just in case show something
            showToast('Datenbank erfolgreich wiederhergestellt. System wird neu gestartet...', 'success');
        } else if (!result.cancelled) {
            showToast('Fehler bei der Wiederherstellung.', 'error');
        }
    } catch (e) {
        console.error('Restore error:', e);
        showToast('Fehler bei der Wiederherstellung.', 'error');
    }
}

// Global initialization for restore modal input
document.addEventListener('DOMContentLoaded', () => {
    const confirmInput = document.getElementById('restore-confirm-input');
    const confirmBtn = document.getElementById('restore-confirm-btn');
    if (confirmInput && confirmBtn) {
        confirmInput.addEventListener('input', (e) => {
            confirmBtn.disabled = e.target.value !== 'BESTÄTIGEN';
        });
    }
});

// PDF Generation
// Baut die vollständige Sichtseiten-HTML (alle Vorlagen) aus einem explizit übergebenen
// Dokumentobjekt. Bewusst von window.generatePdf entkoppelt, damit der ZUGFeRD-Export
// Sichtseite und CII-XML aus DEMSELBEN doc-Objekt erzeugen kann.
async function buildInvoiceDocumentHtml(rech, kunde, isAngebot = false) {
    const logoHtml = state.einstellungen.logo ? `<img src="${state.einstellungen.logo}" class="h-16 object-contain">` : '';
    const datumStr = new Date(rech.datum).toLocaleDateString('de-DE');
    const faelligStr = new Date(rech.faellig).toLocaleDateString('de-DE');

    let itemsHtml = '';
    rech.positionen.forEach((pos, i) => {
        const artId = parseInt(pos.artikelId);
        const art = state.artikel.find(a => parseInt(a.id) === artId) || {};
        const rabatt = parseFloat(pos.rabatt) || 0;
        const gesamt = (pos.menge * pos.preis) * (1 - rabatt / 100);

        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-200 text-sm avoid-break pdf-no-break';
        tr.style.pageBreakInside = 'avoid';
        tr.style.breakInside = 'avoid';

        const tdIdx = document.createElement('td');
        tdIdx.className = 'py-3 pl-4 text-slate-500';
        tdIdx.textContent = i + 1;
        tr.appendChild(tdIdx);

        const tdName = document.createElement('td');
        tdName.className = 'py-3 font-medium';
        tdName.textContent = art.name || pos.name || 'Unbekannt';
        tr.appendChild(tdName);

        const tdMenge = document.createElement('td');
        tdMenge.className = 'py-3 text-center';
        tdMenge.textContent = `${pos.menge} ${pos.einheit || 'Stk.'}`;
        tr.appendChild(tdMenge);

        const tdPreis = document.createElement('td');
        tdPreis.className = 'py-3 text-right';
        tdPreis.textContent = formatCurrency(pos.preis);
        tr.appendChild(tdPreis);

        const isPos13b = (rech.unterliegt_13b && pos.is13b) || pos.is13b;

        const tdMwst = document.createElement('td');
        tdMwst.className = 'py-3 text-right text-slate-500';
        tdMwst.textContent = isPos13b ? '0%' : `${pos.mwst}%`;
        tr.appendChild(tdMwst);

        const tdRabatt = document.createElement('td');
        tdRabatt.className = 'py-3 text-right ' + (rabatt > 0 ? 'text-emerald-600' : 'text-slate-300');
        tdRabatt.textContent = rabatt > 0 ? `-${rabatt}%` : '-';
        tr.appendChild(tdRabatt);

        const tdGesamt = document.createElement('td');
        tdGesamt.className = 'py-3 pr-4 text-right font-medium';
        tdGesamt.textContent = formatCurrency(gesamt);
        tr.appendChild(tdGesamt);

        itemsHtml += tr.outerHTML;
    });


    let taxes = {
        '13b_netto': 0,
        'normal_netto': 0
    };
    let positionenNetto = 0;
    let positionenBrutto = 0;
    const mode = rech.eingabemodus || 'netto';
    const einzelpreisLabel = mode === 'netto' ? 'Einzelpreis (Netto)' : 'Einzelpreis (Brutto)';
    const gesamtLabel = mode === 'netto' ? 'Gesamt (Netto)' : 'Gesamt (Brutto)';

    rech.positionen.forEach(pos => {
        const rabatt = parseFloat(pos.rabatt) || 0;
        let rowNetto = 0;
        let rowBrutto = 0;
        let tax = 0;

        const isPos13b = rech.unterliegt_13b && pos.is13b;

        if (mode === 'netto') {
            rowNetto = (pos.menge * pos.preis) * (1 - rabatt / 100);
            tax = isPos13b ? 0 : (rowNetto * (pos.mwst / 100));
            rowBrutto = rowNetto + tax;
        } else {
            rowBrutto = (pos.menge * pos.preis) * (1 - rabatt / 100);
            if (isPos13b) {
                rowNetto = rowBrutto;
                tax = 0;
            } else {
                rowNetto = rowBrutto / (1 + pos.mwst / 100);
                tax = rowBrutto - rowNetto;
            }
        }

        positionenNetto += rowNetto;
        positionenBrutto += rowBrutto;
        
        if (isPos13b) {
            taxes['13b_netto'] += rowNetto;
        } else {
            taxes['normal_netto'] += rowNetto;
            if (pos.mwst > 0) {
                if (!taxes[pos.mwst]) taxes[pos.mwst] = 0;
                taxes[pos.mwst] += tax;
            }
        }
    });

    const globalRabattAbzug = parseFloat(rech.globalRabattAbzug) || 0;
    const baseForRabatt = mode === 'netto' ? positionenNetto : positionenBrutto;
    const rabattFaktor = baseForRabatt > 0 ? ((baseForRabatt - globalRabattAbzug) / baseForRabatt) : 1;

    const leistungsstandNetto = rech.kumulierte_leistung_netto || ((mode === 'netto' ? positionenNetto : positionenBrutto - Object.keys(taxes).filter(k => k !== '13b_netto' && k !== 'normal_netto').map(k => taxes[k]).reduce((a,b)=>a+b,0)) - globalRabattAbzug);
    
    // Taxable Netto is rech.netto which already has deductions subtracted
    const steuerpflichtigesNetto = rech.netto;
    const taxableRatio = leistungsstandNetto > 0 ? (steuerpflichtigesNetto / leistungsstandNetto) : (steuerpflichtigesNetto === 0 ? 0 : 1);

    let taxHtml = '';
    
    // If we have a mixed invoice or 13b items, display the split explicitly
    if (rech.unterliegt_13b && taxes['13b_netto'] > 0 && taxes['normal_netto'] > 0) {
        const netto13b = taxes['13b_netto'] * rabattFaktor * taxableRatio;
        const nettoNormal = taxes['normal_netto'] * rabattFaktor * taxableRatio;
        
        // Show Netto (regulär)
        taxHtml += `
            <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 4px; color: #64748b;">
                <span>Netto (regulär)</span>
                <span>${formatCurrency(nettoNormal)}</span>
            </div>
        `;
        // Show Netto (13b)
        taxHtml += `
            <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 4px; color: #64748b;">
                <span>Netto (§ 13b ohne Steuer)</span>
                <span>${formatCurrency(netto13b)}</span>
            </div>
        `;
    }

    Object.keys(taxes).forEach(rate => {
        if (rate === '13b_netto' || rate === 'normal_netto') return;
        const baseTax = taxes[rate] * rabattFaktor;
        const taxVal = baseTax * taxableRatio;
        if (taxVal > 0.005) { // Show only if it's more than half a cent
            const div = document.createElement('div');
            div.className = 'flex justify-between text-sm text-slate-600 mt-1';

            const adjustedLabel = taxableRatio < 0.999 ? ' (angepasst)' : '';
            const spanLbl = document.createElement('span');
            spanLbl.textContent = mode === 'netto' ? `zzgl. ${rate}% MwSt${adjustedLabel}` : `darin enthaltene ${rate}% MwSt${adjustedLabel}`;

            const spanVal = document.createElement('span');
            spanVal.textContent = formatCurrency(taxVal);

            div.appendChild(spanLbl);
            div.appendChild(spanVal);
            taxHtml += div.outerHTML;
        }
    });

    const hatKumulationOderSicherheit = (rech.sicherheitseinbehalt > 0) || (rech.verrechnungen && rech.verrechnungen.length > 0);
    let deductionsHtml = '';
    
    if (hatKumulationOderSicherheit) {
        deductionsHtml += `
            <div class="flex justify-between text-sm text-slate-700 font-medium mb-2">
                <span>Leistungsstand (Netto)</span>
                <span>${formatCurrency(leistungsstandNetto)}</span>
            </div>
        `;

        if (rech.sicherheitseinbehalt > 0) {
            deductionsHtml += `
                <div class="flex justify-between text-sm text-amber-600 mb-1">
                    <span>Abzug Sicherheitseinbehalt</span>
                    <span>-${formatCurrency(rech.sicherheitseinbehalt)}</span>
                </div>
            `;
        }

        if (rech.verrechnungen && rech.verrechnungen.length > 0) {
            rech.verrechnungen.forEach(v => {
                const vRech = state.rechnungen.find(r => r.id === v.vorherige_rechnung_id);
                const infoStr = vRech ? `Rechnung ${vRech.nr} vom ${new Date(vRech.datum).toLocaleDateString('de-DE')}` : 'Vorherige Abschlagsrechnung';
                deductionsHtml += `
                    <div class="flex justify-between text-[13px] text-indigo-600 mb-1">
                        <span>Abzug ${infoStr}</span>
                        <span>-${formatCurrency(v.abzugsbetrag_netto)}</span>
                    </div>
                `;
            });
        }
        
        deductionsHtml += `<div class="border-b border-slate-200 my-3"></div>`;
    }

    // --- Custom Texts & Legal Information ---
    let vortextHtml = rech.vortext ? `<div class="mb-6 whitespace-pre-wrap text-sm text-slate-700">${sanitize(rech.vortext)}</div>` : '';
    let fusstextHtml = rech.fusstext ? `<div class="mt-8 whitespace-pre-wrap text-sm text-slate-700">${sanitize(rech.fusstext)}</div>` : '';
    
    let legalTextsHtml = '<div class="space-y-2 text-[11px] text-slate-500 mt-6 max-w-2xl leading-relaxed">';
    
    if (rech.leistungszeitraum_von && rech.leistungszeitraum_bis) {
        legalTextsHtml += `<p><strong>Leistungszeitraum:</strong> ${new Date(rech.leistungszeitraum_von).toLocaleDateString('de-DE')} bis ${new Date(rech.leistungszeitraum_bis).toLocaleDateString('de-DE')}.</p>`;
    } else {
        legalTextsHtml += `<p><em>Das Liefer-/Leistungsdatum entspricht dem Rechnungsdatum, sofern nicht anders angegeben.</em></p>`;
    }
    
    const isReverseCharge = rech.unterliegt_13b || (Object.keys(taxes).length === 0 && positionenNetto > 0 && kunde.ist_bauleistender_13b);
    if (isReverseCharge) {
        legalTextsHtml += `<p><strong>Steuerschuldnerschaft des Leistungsempfängers:</strong> Leistungen unterliegen gemäß § 13b UStG dem Reverse-Charge-Verfahren. Die Steuerschuldnerschaft geht auf den Leistungsempfänger über.</p>`;
    }
    
    if (rech.unterliegt_bauabzugsteuer) {
        if (kunde.hat_freistellungsbescheinigung) {
            legalTextsHtml += `<p>Eine gültige Freistellungsbescheinigung nach § 48b EStG liegt vor. Ein Einbehalt der Bauabzugsteuer durch den Leistungsempfänger ist nicht vorzunehmen.</p>`;
        } else {
            legalTextsHtml += `<p><strong>Bauabzugsteuer:</strong> Gemäß § 48 EStG unterliegt diese Rechnung der Bauabzugsteuer. Bitte behalten Sie 15% ein und führen Sie diesen an das Finanzamt ab.</p>`;
        }
    }
    
    if (rech.vob_vereinbart) {
        legalTextsHtml += `<p>Gemäß § 16 Abs. 1 VOB/B ist diese Zahlung innerhalb von 21 Tagen nach Zugang dieser prüfbaren Aufstellung fällig.</p>`;
    }
    
    if (rech.ist_privatkunde) {
        legalTextsHtml += `<p><strong>Hinweis gem. § 14b Abs. 1 UStG:</strong> Als Privatperson sind Sie gesetzlich verpflichtet, diese Rechnung sowie den zugehörigen Zahlungsbeleg für steuerliche Zwecke mindestens zwei Jahre lang aufzubewahren.</p>`;
    }
    
    if (rech.ausweis_35a_erforderlich && rech.summe_lohnkosten_brutto > 0) {
        const lohnNetto = rech.summe_lohnkosten_brutto / 1.19; 
        const lohnSteuer = rech.summe_lohnkosten_brutto - lohnNetto;
        legalTextsHtml += `<p><strong>Hinweis zur Steuerermäßigung nach § 35a EStG:</strong> In dem oben ausgewiesenen Rechnungsbetrag sind steuerbegünstigte Arbeits-, Fahrt- und Maschinenkosten in Höhe von ${formatCurrency(lohnNetto)} (netto) zzgl. ${formatCurrency(lohnSteuer)} Umsatzsteuer, somit insgesamt ${formatCurrency(rech.summe_lohnkosten_brutto)} (brutto) enthalten.</p>`;
    }
    
    legalTextsHtml += '</div>';

    // Generate GiroCode (EPC-QR) for Invoices
    let qrHtml = '';
    const zahlbetragNumerical = rech.zahlbetrag || rech.brutto;
    if (!isAngebot && state.einstellungen.iban && state.einstellungen.firmenname && zahlbetragNumerical > 0) {
        // EPC069-12 Format
        const bic = state.einstellungen.bic ? state.einstellungen.bic.trim() : '';
        const name = state.einstellungen.firmenname.substring(0, 70).trim();
        const iban = state.einstellungen.iban.replace(/\s+/g, '').trim();
        // strict amount formatting: EUR12.34 or EUR12 (no trailing .00 if whole number, up to 9 digits)
        let amountStr = zahlbetragNumerical.toFixed(2);
        if (amountStr.endsWith('.00')) {
            amountStr = parseInt(zahlbetragNumerical, 10).toString();
        }

        // Clean ref string from any weird characters
        const refStr = `Rechnung ${rech.nr}`.substring(0, 35).replace(/[^a-zA-Z0-9.\- ]/g, '');

        const epcLines = [
            "BCD",               // 1. Service Tag (Must be BCD)
            "002",               // 2. Version (002 is safest for VR Bank)
            "1",                 // 3. Character Set (1 = UTF-8)
            "SCT",               // 4. Identification (SEPA Credit Transfer)
            bic,                 // 5. BIC (Can be empty in 002 within EEA)
            name,                // 6. Beneficiary Name (max 70 chars)
            iban,                // 7. IBAN
            `EUR${amountStr}`,   // 8. Currency & Amount
            "",                  // 9. Purpose (empty)
            "",                  // 10. Remittance Information (Structured / Creditor Ref)
            refStr,              // 11. Remittance Information (Unstructured Ref, max 140)
            ""                   // 12. Beneficiary to Originator Info (empty)
        ];

        // Use strict LF (\n) without CR
        const epcString = epcLines.join('\n');

        const qrDataUrl = await window.api.generateQrCode(epcString);
        if (qrDataUrl) {
            qrHtml = `
                                            <div class="mt-6 flex items-start gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100 w-full">
                                                <img src="${qrDataUrl}" class="w-20 h-20 rounded shadow-sm bg-white" alt="GiroCode">
                                                <div class="text-xs text-slate-500 flex-1 pt-1">
                                                    <p class="font-bold text-slate-700 mb-1 flex items-center gap-1">
                                                        <span class="material-symbols-outlined text-[14px]">qr_code_scanner</span>
                                                        GiroCode / QR-Rechnung
                                                    </p>
                                                    <p class="leading-relaxed">Einfach mit der Banking-App scannen (Zahlen per Code) und Überweisungsdaten automatisch ausfüllen lassen.</p>
                                                </div>
                                            </div>
            `;
        }
    }

    const absenderInline = state.einstellungen.adresse ?
        (sanitize(state.einstellungen.firmenname) + " - " + sanitize(state.einstellungen.adresse).replace(/\n/g, ', ')) :
        sanitize(state.einstellungen.firmenname);

    const vorlage = state.einstellungen.rechnungsvorlage || 'klassisch';
    
    let templateHtml = '';

    if (vorlage === 'modern') {
        templateHtml = `
                        <div id="invoice-paper" class="invoice-paper max-w-4xl mx-auto bg-white min-h-[297mm] font-sans flex flex-col justify-between relative">
                            <!-- Header Block -->
                            <div class="bg-slate-900 text-white px-12 py-12 flex justify-between items-center rounded-b-xl shadow-lg mb-8 mx-4">
                                <div class="flex items-center gap-6">
                                    ${logoHtml ? `<div class="bg-white p-2 rounded-lg">${logoHtml}</div>` : ''}
                                    <div>
                                        <h1 class="text-3xl font-extrabold tracking-tight">${sanitize(state.einstellungen.firmenname)}</h1>
                                        ${state.einstellungen.adresse ? `<p class="text-sm text-slate-300 mt-1">${sanitize(state.einstellungen.adresse).replace(/\n/g, ' &middot; ')}</p>` : ''}
                                    </div>
                                </div>
                                <div class="text-right">
                                    <h2 class="text-2xl font-semibold tracking-wider text-primary-400 uppercase">${isAngebot ? 'Angebot' : 'Rechnung'}</h2>
                                    <div class="mt-2 text-sm text-slate-300">
                                        <p>Nr. <span class="text-white font-medium">${sanitize(rech.nr)}</span></p>
                                        <p>${datumStr}</p>
                                    </div>
                                </div>
                            </div>

                            <div class="px-12 py-4">
                                <!-- Address Block -->
                                <div class="flex justify-between items-start mb-12">
                                    <div class="bg-slate-50 p-6 rounded-xl border border-slate-100 w-1/2">
                                        <p class="text-[10px] text-slate-500 font-semibold uppercase tracking-widest mb-3">${absenderInline}</p>
                                        <div class="text-slate-800 leading-relaxed text-sm">
                                            <p class="font-bold text-lg text-slate-900">${sanitize(kunde.name || '')}</p>
                                            <p>${sanitize(kunde.adresse || '').replace(/\n/g, '<br>')}</p>
                                            <p>${sanitize(kunde.plz || '')} ${sanitize(kunde.ort || '')}</p>
                                        </div>
                                    </div>
                                    <div class="text-right text-sm text-slate-600 bg-slate-50 p-6 rounded-xl border border-slate-100">
                                        <p class="mb-1"><span class="font-semibold text-slate-800">Datum:</span> ${datumStr}</p>
                                        <p class="mb-1"><span class="font-semibold text-slate-800">${isAngebot ? 'Gültig bis:' : 'Fällig am:'}</span> ${faelligStr}</p>
                                        <p><span class="font-semibold text-slate-800">Kundennummer:</span> ${kunde.id}</p>
                                    </div>
                                </div>

                                ${vortextHtml}

                                <!-- Table -->
                                <div class="overflow-hidden rounded-xl border border-slate-200 mb-10 shadow-sm">
                                    <table class="w-full">
                                        <thead>
                                            <tr class="text-left text-xs uppercase tracking-wider text-slate-600 bg-slate-100 border-b border-slate-200">
                                                <th class="py-4 pl-4 font-semibold w-12">Pos.</th>
                                                <th class="py-4 font-semibold">Bezeichnung</th>
                                                <th class="py-4 font-semibold text-center w-24">Menge</th>
                                                <th class="py-4 font-semibold text-right w-32">${einzelpreisLabel}</th>
                                                <th class="py-4 font-semibold text-right w-20">MwSt</th>
                                                <th class="py-4 font-semibold text-right w-24">Rabatt</th>
                                                <th class="py-4 pr-4 font-semibold text-right w-32">${gesamtLabel}</th>
                                            </tr>
                                        </thead>
                                        <tbody class="text-slate-700 bg-white">
                                            ${itemsHtml}
                                        </tbody>
                                    </table>
                                </div>
                                
                                <!-- Totals & QR -->
                                <div class="flex justify-between items-start mb-16 gap-12 summenblock avoid-break pdf-no-break" style="break-inside: avoid; page-break-inside: avoid;">
                                    <div class="flex-1">
                                        ${legalTextsHtml}
                                        ${qrHtml}
                                    </div>
                                    <div class="w-80 bg-slate-50 rounded-xl p-6 border border-slate-100 shadow-sm">
                                        
                                        ${rech.globalRabattAbzug > 0 ? `
                                            <div class="flex justify-between text-sm text-slate-500 mb-2">
                                                <span>Zwischensumme</span>
                                                <span>${formatCurrency(rech.netto + rech.globalRabattAbzug)}</span>
                                            </div>
                                            <div class="flex justify-between text-sm text-emerald-600 mb-4 pb-4 border-b border-slate-200">
                                                <span>Gesamtrabatt</span>
                                                <span>-${formatCurrency(rech.globalRabattAbzug)}</span>
                                            </div>
                                        ` : ''}

                                        ${deductionsHtml}
                                        <div class="flex justify-between text-sm font-medium text-slate-700 mb-2">
                                            <span>${hatKumulationOderSicherheit ? 'Steuerpflichtig (Netto)' : 'Nettobetrag'}</span>
                                            <span>${formatCurrency(rech.netto)}</span>
                                        </div>
                                        
                                        <div class="mb-4 pb-4 border-b border-slate-200">
                                            ${taxHtml}
                                        </div>
                                        
                                        <div class="flex justify-between font-bold text-lg text-slate-900 mb-2">
                                            <span>Bruttobetrag</span>
                                            <span>${formatCurrency(rech.brutto)}</span>
                                        </div>

                                        ${rech.anzahlung > 0 ? `
                                            <div class="flex justify-between text-sm text-slate-600 mb-4 pb-4 border-b border-slate-200">
                                                <span>Abzüglich Anzahlung</span>
                                                <span>-${formatCurrency(rech.anzahlung)}</span>
                                            </div>
                                        ` : ''}

                                        <div class="mt-4 pt-4 border-t-2 border-slate-900">
                                            <div class="flex justify-between font-black text-2xl text-slate-900">
                                                <span>Zahlbetrag</span>
                                                <span>${formatCurrency(zahlbetragNumerical)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                ${fusstextHtml ? `<div class="mb-8 pdf-no-break" style="break-inside: avoid; page-break-inside: avoid;">${fusstextHtml}</div>` : ''}

                                <!-- Footer -->
                                <div class="mt-24 pt-8 border-t border-slate-200 text-xs text-slate-500 grid grid-cols-3 gap-8 text-left pb-12 pdf-footer avoid-break" style="break-inside: avoid; page-break-inside: avoid; position: static !important;">
                                    <div>
                                        <p class="font-bold text-slate-800 mb-2 uppercase tracking-wider text-[10px]">Unternehmen</p>
                                        <p>${sanitize(state.einstellungen.firmenname)}</p>
                                        ${state.einstellungen.adresse ? `<p class="mt-1">${sanitize(state.einstellungen.adresse).replace(/\n/g, '<br>')}</p>` : ''}
                                    </div>
                                    <div>
                                        <p class="font-bold text-slate-800 mb-2 uppercase tracking-wider text-[10px]">Bankverbindung</p>
                                        <p>${sanitize(state.einstellungen.bankname)}</p>
                                        <p>IBAN: ${sanitize(state.einstellungen.iban)}</p>
                                        <p>BIC: ${sanitize(state.einstellungen.bic)}</p>
                                    </div>
                                    <div>
                                        <p class="font-bold text-slate-800 mb-2 uppercase tracking-wider text-[10px]">Rechtliches</p>
                                        <p>Steuernummer / USt-IdNr:</p>
                                        <p>${sanitize(state.einstellungen.steuer)}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
        `;
    } else if (vorlage === 'minimalistisch') {
        templateHtml = `
                        <div id="invoice-paper" class="invoice-paper max-w-4xl mx-auto bg-white min-h-[297mm] font-serif flex flex-col justify-between relative">
                            <div class="px-16 py-16">
                                <!-- Header -->
                                <div class="flex justify-between items-end mb-16 border-b-2 border-black pb-8">
                                    <div>
                                        ${logoHtml ? `<div class="mb-4 grayscale opacity-90">${logoHtml}</div>` : ''}
                                        <h1 class="text-xl font-bold tracking-widest uppercase text-black">${sanitize(state.einstellungen.firmenname)}</h1>
                                    </div>
                                    <div class="text-right">
                                        <h2 class="text-3xl font-light tracking-widest text-black uppercase mb-2">${isAngebot ? 'Angebot' : 'Rechnung'}</h2>
                                        <p class="text-sm font-medium">${sanitize(rech.nr)}</p>
                                    </div>
                                </div>

                                <!-- Info Grid -->
                                <div class="grid grid-cols-2 gap-16 mb-16">
                                    <div>
                                        <p class="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-4">${absenderInline}</p>
                                        <div class="text-black text-sm">
                                            <p class="font-bold mb-1">${sanitize(kunde.name || '')}</p>
                                            <p class="leading-relaxed">${sanitize(kunde.adresse || '').replace(/\n/g, '<br>')}</p>
                                            <p>${sanitize(kunde.plz || '')} ${sanitize(kunde.ort || '')}</p>
                                        </div>
                                    </div>
                                    <div class="text-sm text-black space-y-2 border-l border-gray-200 pl-8">
                                        <div class="flex justify-between"><span class="text-gray-500">Datum</span> <span class="font-medium">${datumStr}</span></div>
                                        <div class="flex justify-between"><span class="text-gray-500">${isAngebot ? 'Gültig bis' : 'Fällig am'}</span> <span class="font-medium">${faelligStr}</span></div>
                                        <div class="flex justify-between"><span class="text-gray-500">Kundennummer</span> <span class="font-medium">${kunde.id}</span></div>
                                    </div>
                                </div>

                                ${vortextHtml}

                                <!-- Table -->
                                <table class="w-full mb-12">
                                    <thead>
                                        <tr class="text-left text-[10px] uppercase tracking-widest text-gray-500 border-b border-black">
                                            <th class="py-3 font-normal pl-4">Pos.</th>
                                            <th class="py-3 font-normal">Bezeichnung</th>
                                            <th class="py-3 font-normal text-center">Menge</th>
                                            <th class="py-3 font-normal text-right">${einzelpreisLabel}</th>
                                            <th class="py-3 font-normal text-right">MwSt</th>
                                            <th class="py-3 font-normal text-right">Rabatt</th>
                                            <th class="py-3 font-normal text-right pr-4">${gesamtLabel}</th>
                                        </tr>
                                    </thead>
                                    <tbody class="text-black border-b border-gray-200">
                                        ${itemsHtml}
                                    </tbody>
                                </table>

                                <!-- Totals & QR -->
                                <div class="flex justify-between items-start mb-16 gap-12 summenblock avoid-break pdf-no-break" style="break-inside: avoid; page-break-inside: avoid;">
                                    <div class="flex-1">
                                        ${legalTextsHtml}
                                        ${qrHtml ? `<div class="grayscale opacity-90">${qrHtml}</div>` : ''}
                                    </div>
                                    <div class="w-72">
                                        ${rech.globalRabattAbzug > 0 ? `
                                            <div class="flex justify-between text-sm mb-2 text-gray-600">
                                                <span>Zwischensumme</span>
                                                <span>${formatCurrency(rech.netto + rech.globalRabattAbzug)}</span>
                                            </div>
                                            <div class="flex justify-between text-sm mb-4 pb-2 border-b border-gray-200 text-gray-900">
                                                <span>Gesamtrabatt</span>
                                                <span>-${formatCurrency(rech.globalRabattAbzug)}</span>
                                            </div>
                                        ` : ''}

                                        ${deductionsHtml}
                                        <div class="flex justify-between text-sm mb-2">
                                            <span class="text-gray-600">${hatKumulationOderSicherheit ? 'Steuerpflichtig (Netto)' : 'Nettobetrag'}</span>
                                            <span>${formatCurrency(rech.netto)}</span>
                                        </div>
                                        
                                        <div class="mb-4 pb-4 border-b border-gray-200">
                                            ${taxHtml}
                                        </div>
                                        
                                        <div class="flex justify-between font-bold text-sm mb-2">
                                            <span>Bruttobetrag</span>
                                            <span>${formatCurrency(rech.brutto)}</span>
                                        </div>

                                        ${rech.anzahlung > 0 ? `
                                            <div class="flex justify-between text-sm mb-4 pb-4 border-b border-gray-200 text-gray-600">
                                                <span>Abzüglich Anzahlung</span>
                                                <span>-${formatCurrency(rech.anzahlung)}</span>
                                            </div>
                                        ` : ''}

                                        <div class="mt-2 pt-4 border-t-2 border-black flex justify-between font-bold text-xl">
                                            <span>Zahlbetrag</span>
                                            <span>${formatCurrency(zahlbetragNumerical)}</span>
                                        </div>
                                    </div>
                                </div>

                                ${fusstextHtml ? `<div class="mb-8 pdf-no-break" style="break-inside: avoid; page-break-inside: avoid;">${fusstextHtml}</div>` : ''}

                                <!-- Footer -->
                                <div class="mt-32 pt-8 border-t border-gray-200 text-[10px] text-gray-500 grid grid-cols-3 gap-8 uppercase tracking-wider leading-relaxed pdf-footer avoid-break" style="break-inside: avoid; page-break-inside: avoid; position: static !important;">
                                    <div>
                                        <p class="text-black font-bold mb-2">Unternehmen</p>
                                        <p>${sanitize(state.einstellungen.firmenname)}</p>
                                        ${state.einstellungen.adresse ? `<p>${sanitize(state.einstellungen.adresse).replace(/\n/g, '<br>')}</p>` : ''}
                                    </div>
                                    <div>
                                        <p class="text-black font-bold mb-2">Bankverbindung</p>
                                        <p>${sanitize(state.einstellungen.bankname)}</p>
                                        <p>IBAN: ${sanitize(state.einstellungen.iban)}</p>
                                        <p>BIC: ${sanitize(state.einstellungen.bic)}</p>
                                    </div>
                                    <div>
                                        <p class="text-black font-bold mb-2">Rechtliches</p>
                                        <p>Steuernummer / USt-IdNr:</p>
                                        <p>${sanitize(state.einstellungen.steuer)}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
        `;
    } else {
        templateHtml = `
                        <div id="invoice-paper" class="invoice-paper max-w-4xl mx-auto bg-white min-h-[297mm] flex flex-col justify-between relative">
                            <!-- Header Block -->
                            <div class="bg-slate-50 px-12 py-10 flex justify-between items-start border-b border-slate-200">
                                <div>
                                    ${logoHtml}
                                    <h1 class="text-2xl font-bold tracking-tight text-slate-800 mt-4">${sanitize(state.einstellungen.firmenname)}</h1>
                                    ${state.einstellungen.adresse ? `<p class="text-sm text-slate-600 mt-1">${sanitize(state.einstellungen.adresse).replace(/\n/g, '<br>')}</p>` : ''}
                                </div>
                                <div class="text-right">
                                    <h2 class="text-4xl font-light tracking-tight text-slate-400 uppercase tracking-widest mb-4">${isAngebot ? 'Angebot' : 'Rechnung'}</h2>
                                    <div class="text-sm space-y-1 text-slate-600">
                                        <p><span class="font-semibold text-slate-800">${isAngebot ? 'Angebots-Nr:' : 'Rechnungs-Nr:'}</span> ${sanitize(rech.nr)}</p>
                                        <p><span class="font-semibold text-slate-800">Datum:</span> ${datumStr}</p>
                                        <p><span class="font-semibold text-slate-800">${isAngebot ? 'Gültig bis:' : 'Fällig am:'}</span> ${faelligStr}</p>
                                    </div>
                                </div>
                            </div>

                            <div class="px-12 py-8">
                                <!-- Address Block -->
                                <div class="mb-12">
                                    <p class="text-[10px] text-slate-400 font-semibold uppercase tracking-widest mb-2 border-b-2 border-primary inline-block pb-1">${absenderInline}</p>
                                    <div class="text-slate-800 leading-relaxed text-sm mt-2">
                                        <p class="font-bold text-base">${sanitize(kunde.name || '')}</p>
                                        <p>${sanitize(kunde.adresse || '').replace(/\n/g, '<br>')}</p>
                                        <p>${sanitize(kunde.plz || '')} ${sanitize(kunde.ort || '')}</p>
                                    </div>
                                </div>

                                ${vortextHtml}

                                <!-- Table -->
                                <table class="w-full mb-10">
                                    <thead>
                                        <tr class="text-left text-xs uppercase tracking-wider text-slate-500 bg-slate-50">
                                            <th class="py-4 pl-4 font-semibold w-12 rounded-l-lg">Pos.</th>
                                            <th class="py-4 font-semibold">Bezeichnung</th>
                                            <th class="py-4 font-semibold text-center w-24">Menge</th>
                                            <th class="py-4 font-semibold text-right w-32">${einzelpreisLabel}</th>
                                            <th class="py-4 font-semibold text-right w-20">MwSt</th>
                                            <th class="py-4 font-semibold text-right w-24">Rabatt</th>
                                            <th class="py-4 pr-4 font-semibold text-right w-32 rounded-r-lg">${gesamtLabel}</th>
                                        </tr>
                                    </thead>
                                    <tbody class="text-slate-700">
                                        ${itemsHtml}
                                    </tbody>
                                </table>
                                
                                <!-- Lieferdatum Hinweis (UStG) & Legal -->
                                ${legalTextsHtml}

                                <!-- Totals & QR -->
                                <div class="flex justify-between items-end mb-16 gap-8 summenblock avoid-break pdf-no-break" style="break-inside: avoid; page-break-inside: avoid;">
                                    <div class="flex-1 max-w-sm">
                                        ${qrHtml}
                                    </div>
                                    <div class="w-80 flex-shrink-0">
                                        
                                        ${rech.globalRabattAbzug > 0 ? `
                                            <div class="flex justify-between text-sm text-slate-500 mb-1 px-4">
                                                <span>Zwischensumme Positionen</span>
                                                <span>${formatCurrency(rech.netto + rech.globalRabattAbzug)}</span>
                                            </div>
                                            <div class="flex justify-between text-sm text-emerald-600 mb-3 px-4 border-b border-slate-100 pb-2">
                                                <span>Abzug Gesamtrabatt</span>
                                                <span>-${formatCurrency(rech.globalRabattAbzug)}</span>
                                            </div>
                                        ` : ''}

                                        ${deductionsHtml}
                                        <div class="flex justify-between text-sm font-medium text-slate-700 px-4 py-1">
                                            <span>${hatKumulationOderSicherheit ? 'Steuerpflichtig (Netto)' : 'Nettobetrag'}</span>
                                            <span>${formatCurrency(rech.netto)}</span>
                                        </div>
                                        
                                        <div class="px-4">
                                            ${taxHtml}
                                        </div>
                                        
                                        <div class="flex justify-between font-bold text-lg text-slate-900 mt-3 pt-3 px-4 border-t border-slate-200">
                                            <span>Bruttobetrag</span>
                                            <span>${formatCurrency(rech.brutto)}</span>
                                        </div>

                                        ${rech.anzahlung > 0 ? `
                                            <div class="flex justify-between text-sm text-slate-600 mt-2 px-4 pb-3">
                                                <span>Abzüglich Anzahlung</span>
                                                <span>-${formatCurrency(rech.anzahlung)}</span>
                                            </div>
                                        ` : ''}

                                        <!-- Highlighted Total Box -->
                                        <div class="mt-4 p-4 bg-primary/5 border-l-4 border-primary rounded-r-lg">
                                            <div class="flex justify-between font-bold text-2xl text-primary">
                                                <span>Zahlbetrag</span>
                                                <span>${formatCurrency(zahlbetragNumerical)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                ${fusstextHtml ? `<div class="mb-8 pdf-no-break" style="break-inside: avoid; page-break-inside: avoid;">${fusstextHtml}</div>` : ''}

                                <!-- Footer -->
                                <div class="mt-24 pt-8 border-t border-slate-200 text-xs text-slate-500 grid grid-cols-3 gap-8 text-left pdf-footer avoid-break" style="break-inside: avoid; page-break-inside: avoid; position: static !important;">
                                    <div>
                                        <p class="font-semibold text-slate-700 mb-1">Unternehmen</p>
                                        <p>${sanitize(state.einstellungen.firmenname)}</p>
                                        ${state.einstellungen.adresse ? `<p class="mt-1">${sanitize(state.einstellungen.adresse).replace(/\n/g, '<br>')}</p>` : ''}
                                    </div>
                                    <div>
                                        <p class="font-semibold text-slate-700 mb-1">Bankverbindung</p>
                                        <p>${sanitize(state.einstellungen.bankname)}</p>
                                        <p>IBAN: ${sanitize(state.einstellungen.iban)}</p>
                                        <p>BIC: ${sanitize(state.einstellungen.bic)}</p>
                                    </div>
                                    <div>
                                        <p class="font-semibold text-slate-700 mb-1">Rechtliches</p>
                                        <p>Steuernummer / USt-IdNr:</p>
                                        <p>${sanitize(state.einstellungen.steuer)}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
        `;
    }

    return templateHtml;
}

window.generatePdf = async function(id, isAngebot = false) {
    const idNum = parseInt(id);
    const rech = isAngebot ? state.angebote.find(r => parseInt(r.id) === idNum) : state.rechnungen.find(r => parseInt(r.id) === idNum);
    if (!rech) return;

    // GoBD Compliance Lock (Invoices only)
    if (!isAngebot && rech.status !== 'Entwurf' && !rech.isLocked) {
        if (!(await safeConfirm(`Durch das Generieren des PDFs wird die Rechnung ${rech.nr} finalisiert und für nachträgliche Änderungen gesperrt (GoBD-konform). Möchten Sie fortfahren?`))) {
            return;
        }
        rech.isLocked = true;
        // Save to database
        await window.api.saveDocument(rech);
        
        // Re-render dashboard behind modal
        if (document.getElementById('view-dashboard') && !document.getElementById('view-dashboard').classList.contains('hidden')) {
            renderDashboard();
        } else if (document.getElementById('view-rechnungen') && !document.getElementById('view-rechnungen').classList.contains('hidden')) {
            renderRechnungen();
        }
    }

    const kundeId = parseInt(rech.kundeId);
    const kunde = state.kunden.find(k => parseInt(k.id) === kundeId) || {};
    const templateHtml = await buildInvoiceDocumentHtml(rech, kunde, isAngebot);
    const template = document.getElementById('print-template');
    template.innerHTML = templateHtml;

    const pdfFilename = `${isAngebot ? 'Angebot' : 'Rechnung'}_${rech.nr || 'Dokument'}.pdf`;
    setTimeout(() => {
        openPdfPreview(template.innerHTML, pdfFilename);
    }, 50);
};

// Rendert die Sichtseite für den ZUGFeRD-Export unsichtbar in #print-template
// (das @media print-CSS blendet alles andere aus) und gibt den vorherigen
// Inhalt zur Wiederherstellung zurück. Wirft bei Fehlern, bevor der Container
// verändert wird - der Export läuft dann mit der Platzhalter-Seite weiter.
window.renderInvoiceForZugferdExport = async function(rech, kunde) {
    const template = document.getElementById('print-template');
    if (!template) throw new Error('Druckvorlage (#print-template) nicht gefunden.');
    const previousHtml = template.innerHTML;
    const templateHtml = await buildInvoiceDocumentHtml(rech, kunde || {}, false);
    template.innerHTML = templateHtml;
    await new Promise(resolve => setTimeout(resolve, 150));
    return previousHtml;
};

window.restorePrintTemplateContent = function(previousHtml) {
    const template = document.getElementById('print-template');
    if (template && typeof previousHtml === 'string') {
        template.innerHTML = previousHtml;
    }
};

// Generate Mahnung (Dunning) PDF
window.generateMahnungPdf = async function(id) {
    try {
        const idNum = parseInt(id);
        const rech = state.rechnungen.find(r => parseInt(r.id) === idNum);
        
        if (!rech) {
            console.warn('Mahnung PDF: Rechnung nicht gefunden', id);
            showToast("Fehler: Rechnung wurde nicht im System gefunden.", "error");
            return;
        }

        if (rech.status !== 'Überfällig') {
            console.warn('Mahnung PDF: Status nicht Überfällig', id, rech.status);
            showToast("Mahnungen können nur für überfällige Rechnungen erstellt werden.", "warning");
            return;
        }

        // GoBD Compliance Check
        if (!rech.isLocked) {
            showToast("Fehler: Rechnung muss zuerst gedruckt werden (GoBD-Sperre), bevor eine Mahnung erstellt werden kann.", "error");
            return;
        }

        // Open custom modal instead of using prompt()
        const modal = document.getElementById('mahnung-modal');
        if (modal) {
            document.getElementById('mahnung-rechnung-id').value = id;
            document.getElementById('mahnung-level-select').value = "1";
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        } else {
            console.error('Mahnung modal not found in DOM');
            showToast("Systemfehler: Mahnungs-Dialog nicht gefunden.", "error");
        }
    } catch (error) {
        console.error('Error in generateMahnungPdf:', error);
        showToast("Ein unerwarteter Fehler ist beim Öffnen des Mahnungs-Dialogs aufgetreten.", "error");
    }
}

window.closeMahnungModal = function() {
    const modal = document.getElementById('mahnung-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

window.confirmMahnungLevel = async function() {
    try {
        const id = document.getElementById('mahnung-rechnung-id').value;
        const levelStr = document.getElementById('mahnung-level-select').value;
        closeMahnungModal();

        if (!levelStr) return;
        const level = parseInt(levelStr);
        if (![1, 2, 3].includes(level)) {
            showToast("Ungültige Mahnstufe ausgewählt (1, 2 oder 3 erlaubt).", "error");
            return;
        }

        const idNum = parseInt(id);
        const rech = state.rechnungen.find(r => parseInt(r.id) === idNum);
        if (!rech) return;

        const kundeId = parseInt(rech.kundeId);
        const kunde = state.kunden.find(k => parseInt(k.id) === kundeId) || {};
        const template = document.getElementById('print-template');
        if (!template) {
            console.error('Print template container not found');
            showToast("Systemfehler: Druckvorlage nicht gefunden.", "error");
            return;
        }
        
        // Fee based on level
        let MAHNGEBUHR = 0;
        if (level === 1) MAHNGEBUHR = parseFloat(state.einstellungen.mahngebuehr1) || 0;
        else if (level === 2) MAHNGEBUHR = parseFloat(state.einstellungen.mahngebuehr2) || 5.00;
        else if (level === 3) MAHNGEBUHR = parseFloat(state.einstellungen.mahngebuehr3) || 10.00;

        const logoHtml = state.einstellungen.logo ? `<img src="${state.einstellungen.logo}" class="h-16 object-contain">` : '';
        const datumStr = new Date().toLocaleDateString('de-DE'); // Today is the Mahnung date
        const origRechDatum = new Date(rech.datum).toLocaleDateString('de-DE');

        // Set a new due date for the Dunning letter
        const neuFaellig = new Date();
        neuFaellig.setDate(neuFaellig.getDate() + (level === 3 ? 7 : 14));
        const faelligStr = neuFaellig.toLocaleDateString('de-DE');

        const itemsHtml = generateMahnungItemsHtml(rech, MAHNGEBUHR);

        // Recalculate Totals
        const currentZahlbetrag = typeof rech.zahlbetrag === 'number' ? rech.zahlbetrag : (rech.brutto || 0);
        const newZahlbetrag = currentZahlbetrag + MAHNGEBUHR;

        // --- GIROCODE GENERATION (EPC-QR) for Mahnung ---
        let qrHtml = '';
        if (state.einstellungen.iban && state.einstellungen.firmenname && newZahlbetrag > 0) {
            const bic = state.einstellungen.bic ? state.einstellungen.bic.trim() : '';
            const name = state.einstellungen.firmenname.substring(0, 70).trim();
            const iban = state.einstellungen.iban.replace(/\s+/g, '').trim();
            
            let amountStr = newZahlbetrag.toFixed(2);
            if (amountStr.endsWith('.00')) {
                amountStr = parseInt(newZahlbetrag, 10).toString();
            }

            const refStr = `Mahnung zu ${rech.nr}`.substring(0, 35).replace(/[^a-zA-Z0-9.\- ]/g, '');

            const epcLines = [
                "BCD",
                "002",
                "1",
                "SCT",
                bic,
                name,
                iban,
                `EUR${amountStr}`,
                "",
                "",
                refStr,
                ""
            ];

            const epcString = epcLines.join('\n');
            const qrDataUrl = await window.api.generateQrCode(epcString);
            if (qrDataUrl) {
                qrHtml = `
                                            <div class="mt-6 flex items-start gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100 w-full">
                                                <img src="${qrDataUrl}" class="w-20 h-20 rounded shadow-sm bg-white" alt="GiroCode">
                                                <div class="text-xs text-slate-500 flex-1 pt-1">
                                                    <p class="font-bold text-slate-700 mb-1 flex items-center gap-1">
                                                        <span class="material-symbols-outlined text-[14px]">qr_code_scanner</span>
                                                        GiroCode / Mahnung
                                                    </p>
                                                    <p class="leading-relaxed">Einfach mit der Banking-App scannen und den Mahnbetrag von <strong>${formatCurrency(newZahlbetrag)}</strong> direkt überweisen.</p>
                                                </div>
                                            </div>
                `;
            }
        }

        // Update state and save to DB
        rech.mahnungLevel = level;
        rech.mahnungDatum = new Date().toISOString().split('T')[0];
        rech.mahnungGebuehr = MAHNGEBUHR;

        if (window.api && typeof window.api.saveDocument === 'function') {
            await window.api.saveDocument(rech);
            console.log('Mahnung information saved for invoice:', id);
        }

        const absenderInline = state.einstellungen.adresse ?
            (sanitize(state.einstellungen.firmenname) + " - " + sanitize(state.einstellungen.adresse).replace(/\n/g, ', ')) :
            sanitize(state.einstellungen.firmenname);

        template.innerHTML = buildMahnungHtmlTemplate({
            logoHtml,
            datumStr,
            origRechDatum,
            absenderInline,
            kunde,
            itemsHtml,
            currentZahlbetrag,
            MAHNGEBUHR,
            newZahlbetrag,
            faelligStr,
            rech,
            level,
            qrHtml
        });

        setTimeout(() => {
            state.belegEmailKontext = {
                beleg_typ: 'MAHNUNG',
                beleg_id: idNum,
                mahnstufe: level,
                nr: rech.nr,
                kundeId: kundeId,
                brutto: newZahlbetrag,
                faelligkeitVorschlag: neuFaellig.toISOString().split('T')[0]
            };
            openPdfPreview(template.innerHTML);
        }, 50);
    } catch (error) {
        console.error('Error in confirmMahnungLevel:', error);
        showToast("Ein unerwarteter Fehler ist beim Erstellen der Mahnung aufgetreten.", "error");
    }
}

// HTML Generation Helpers for Mahnung PDF
function generateMahnungItemsHtml(rech, MAHNGEBUHR) {
    let itemsHtml = '';
    rech.positionen.forEach((pos, i) => {
        const artId = parseInt(pos.artikelId);
        const art = state.artikel.find(a => parseInt(a.id) === artId) || {};
        const rabatt = parseFloat(pos.rabatt) || 0;
        const gesamt = (pos.menge * pos.preis) * (1 - rabatt / 100);

        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-200 text-sm';

        const tdIdx = document.createElement('td');
        tdIdx.className = 'py-3 pl-4 text-slate-500';
        tdIdx.textContent = i + 1;
        tr.appendChild(tdIdx);

        const tdName = document.createElement('td');
        tdName.className = 'py-3 font-medium';
        tdName.textContent = art.name || pos.name || 'Unbekannt';
        tr.appendChild(tdName);

        const tdMenge = document.createElement('td');
        tdMenge.className = 'py-3 text-center';
        tdMenge.textContent = `${pos.menge} ${pos.einheit || 'Stk.'}`;
        tr.appendChild(tdMenge);

        const tdPreis = document.createElement('td');
        tdPreis.className = 'py-3 text-right';
        tdPreis.textContent = formatCurrency(pos.preis);
        tr.appendChild(tdPreis);

        const isPos13b = (rech.unterliegt_13b && pos.is13b) || pos.is13b;

        const tdMwst = document.createElement('td');
        tdMwst.className = 'py-3 text-right text-slate-500';
        tdMwst.textContent = isPos13b ? '0%' : `${pos.mwst}%`;
        tr.appendChild(tdMwst);

        const tdRabatt = document.createElement('td');
        tdRabatt.className = 'py-3 text-right ' + (rabatt > 0 ? 'text-emerald-600' : 'text-slate-300');
        tdRabatt.textContent = rabatt > 0 ? `-${rabatt}%` : '-';
        tr.appendChild(tdRabatt);

        const tdGesamt = document.createElement('td');
        tdGesamt.className = 'py-3 pr-4 text-right font-medium';
        tdGesamt.textContent = formatCurrency(gesamt);
        tr.appendChild(tdGesamt);

        itemsHtml += tr.outerHTML;
    });

    // Add Mahngebühr as a line item
    if (MAHNGEBUHR > 0) {
        itemsHtml += `
            <tr class="border-b-2 border-slate-800 text-sm bg-amber-50/50">
                <td class="py-3 pl-4 text-amber-500 font-bold">*</td>
                <td class="py-3 font-bold text-slate-800">Mahngebühr / Verzugsschaden</td>
                <td class="py-3 text-center">1</td>
                <td class="py-3 text-right">${formatCurrency(MAHNGEBUHR)}</td>
                <td class="py-3 text-right text-slate-500">0%</td>
                <td class="py-3 text-right text-slate-300">-</td>
                <td class="py-3 pr-4 text-right font-medium text-slate-800">${formatCurrency(MAHNGEBUHR)}</td>
            </tr>
        `;
    }
    return itemsHtml;
}

function buildMahnungHtmlTemplate(data) {
    const {
        logoHtml,
        datumStr,
        origRechDatum,
        absenderInline,
        kunde,
        itemsHtml,
        currentZahlbetrag,
        MAHNGEBUHR,
        newZahlbetrag,
        faelligStr,
        rech,
        level,
        qrHtml
    } = data;

    let origFaelligStr = "unbekannt";
    try {
        if (rech.faellig) {
            origFaelligStr = new Date(rech.faellig).toLocaleDateString('de-DE');
        } else {
            const tempDate = new Date(rech.datum);
            tempDate.setDate(tempDate.getDate() + 14);
            origFaelligStr = tempDate.toLocaleDateString('de-DE');
        }
    } catch (e) {
        console.warn("Konnte Fälligkeitsdatum nicht parsen", e);
    }

    let title = "1. Zahlungserinnerung";
    let textHeader = "Zahlungserinnerung";
    let textBody = `leider konnten wir bis zum heutigen Datum keinen Zahlungseingang für die o.g. Rechnung verzeichnen. Vielleicht haben Sie es in der Hektik des Alltags einfach vergessen? Der Betrag war ursprünglich zum <strong>${origFaelligStr}</strong> fällig.`;
    let colorClass = "amber";

    if (level === 2) {
        title = "2. Mahnung";
        textHeader = "Mahnung";
        textBody = `wir stellen fest, dass Sie trotz unserer ersten Zahlungserinnerung die o.g. Rechnung noch nicht beglichen haben. Der Betrag war ursprünglich zum <strong>${origFaelligStr}</strong> fällig. Wir berechnen daher eine Mahngebühr von <strong>${formatCurrency(MAHNGEBUHR)}</strong>.`;
        colorClass = "orange";
    } else if (level === 3) {
        title = "3. & LETZTE MAHNUNG";
        textHeader = "Letzte Mahnung vor Inkasso";
        textBody = `auf unsere bisherigen Mahnungen haben Sie leider nicht reagiert. Wir fordern Sie hiermit letztmalig auf, den fälligen Betrag inklusive Mahngebühren zu begleichen. Sollte die Zahlung nicht fristgerecht eingehen, werden wir die Forderung ohne weitere Ankündigung an ein Inkassobüro übergeben, was für Sie mit erheblichen Mehrkosten verbunden ist.`;
        colorClass = "red";
    }

    const colorHex = colorClass === "amber" ? "#f59e0b" : (colorClass === "orange" ? "#f97316" : "#ef4444");
    const mahnungsNr = `${rech.nr}-M${level}`;

    return `
                        <div id="invoice-paper" class="invoice-paper max-w-4xl mx-auto bg-white min-h-[297mm] flex flex-col justify-between relative">
                            <!-- Header Block -->
                            <div class="bg-slate-50 px-12 py-8 flex justify-between items-start border-b border-slate-200">
                                <div>
                                    ${logoHtml}
                                    <h1 class="text-2xl font-bold tracking-tight text-slate-800 mt-4">${sanitize(state.einstellungen.firmenname)}</h1>
                                    ${state.einstellungen.adresse ? `<p class="text-sm text-slate-600 mt-1">${sanitize(state.einstellungen.adresse).replace(/\n/g, '<br>')}</p>` : ''}
                                </div>
                                <div class="text-right">
                                    <h2 class="text-4xl font-light tracking-tight uppercase tracking-widest mb-4" style="color: ${colorHex}">${title}</h2>
                                    <div class="text-sm space-y-1 text-slate-600">
                                        <p><span class="font-semibold text-slate-800">Bezug:</span> Rechnung ${sanitize(rech.nr)}</p>
                                        <p><span class="font-semibold text-slate-800">Mahn-Nr:</span> ${mahnungsNr}</p>
                                        <p><span class="font-semibold text-slate-800">Rechnungsdatum:</span> ${origRechDatum}</p>
                                        <p><span class="font-semibold text-slate-800">Mahndatum:</span> ${datumStr}</p>
                                    </div>
                                </div>
                            </div>

                            <div class="px-12 py-6 flex-grow flex flex-col">
                                <!-- Address Block -->
                                <div class="mb-6">
                                    <p class="text-[10px] text-slate-400 font-semibold uppercase tracking-widest mb-2 border-b-2 inline-block pb-1" style="border-color: ${colorHex}">${absenderInline}</p>
                                    <div class="text-slate-800 leading-relaxed text-sm mt-2">
                                        <p class="font-bold text-base">${sanitize(kunde.name || '')}</p>
                                        <p>${sanitize(kunde.adresse || '').replace(/\n/g, '<br>')}</p>
                                        <p>${sanitize(kunde.plz || '')} ${sanitize(kunde.ort || '')}</p>
                                    </div>
                                </div>
                                
                                <!-- Mahnung Text -->
                                <div class="mb-6 p-4 rounded-r-lg text-slate-800 text-sm shadow-sm" style="background-color: ${colorHex}10; border-left: 4px solid ${colorHex}">
                                    <p class="font-bold text-lg mb-1 tracking-tight" style="color: ${colorHex}">${textHeader}</p>
                                    <p class="leading-relaxed">Sehr geehrte Damen und Herren,</p>
                                    <p class="mt-1 leading-relaxed">${textBody}</p>
                                    <p class="mt-2 leading-relaxed">Bitte überweisen Sie den neuen <strong>Gesamtbetrag von ${formatCurrency(newZahlbetrag)}</strong> bis spätestens zum <strong class="px-1 py-0.5 rounded" style="background-color: ${colorHex}20; color: ${colorHex}">${faelligStr}</strong>.</p>
                                </div>

                                <!-- Table -->
                                <table class="w-full mb-6">
                                    <thead>
                                        <tr class="text-left text-xs uppercase tracking-wider text-slate-500 bg-slate-50">
                                            <th class="py-3 pl-4 font-semibold w-12 rounded-l-lg">Pos.</th>
                                            <th class="py-3 font-semibold">Bezeichnung</th>
                                            <th class="py-3 font-semibold text-center w-24">Menge</th>
                                            <th class="py-3 font-semibold text-right w-32">Einzelpreis</th>
                                            <th class="py-3 font-semibold text-right w-20">MwSt</th>
                                            <th class="py-3 font-semibold text-right w-24">Rabatt</th>
                                            <th class="py-3 pr-4 font-semibold text-right w-32 rounded-r-lg">Gesamt</th>
                                        </tr>
                                    </thead>
                                    <tbody class="text-slate-700">
                                        ${itemsHtml}
                                    </tbody>
                                </table>

                                <!-- Totals & QR -->
                                <div class="flex justify-between items-end mb-6 gap-8">
                                    <div class="flex-1 max-w-sm">
                                        ${qrHtml}
                                    </div>
                                    <div class="w-80 flex-shrink-0">
                                        <div class="flex justify-between text-sm font-medium text-slate-600 mb-1 px-4">
                                            <span>Offener Rechnungsbetrag</span>
                                            <span>${formatCurrency(currentZahlbetrag)}</span>
                                        </div>
                                        ${MAHNGEBUHR > 0 ? `
                                        <div class="flex justify-between text-sm font-medium px-4 pb-1" style="color: ${colorHex}">
                                            <span>+ Zzgl. Mahngebühr</span>
                                            <span>${formatCurrency(MAHNGEBUHR)}</span>
                                        </div>
                                        <div class="mx-4 border-b border-slate-200 mb-1"></div>
                                        ` : ''}
                                                                            
                                        <!-- Highlighted Total Box -->
                                        <div class="mt-2 p-4 rounded-r-lg shadow-sm" style="background-color: ${colorHex}10; border-left: 4px solid ${colorHex}">
                                            <div class="flex justify-between font-bold text-xl" style="color: ${colorHex}">
                                                <span>Zu zahlender Betrag</span>
                                                <span>${formatCurrency(newZahlbetrag)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Footer -->
                                <div class="mt-auto pt-6 border-t border-slate-200 text-xs text-slate-500 grid grid-cols-3 gap-8 text-left pdf-footer avoid-break" style="break-inside: avoid; page-break-inside: avoid; position: static !important;">
                                    <div>
                                        <p class="font-semibold text-slate-700 mb-1">Unternehmen</p>
                                        <p>${sanitize(state.einstellungen.firmenname)}</p>
                                        ${state.einstellungen.adresse ? `<p class="mt-1">${sanitize(state.einstellungen.adresse).replace(/\n/g, '<br>')}</p>` : ''}
                                    </div>
                                    <div>
                                        <p class="font-semibold text-slate-700 mb-1">Bankverbindung</p>
                                        <p>${sanitize(state.einstellungen.bankname)}</p>
                                        <p>IBAN: ${sanitize(state.einstellungen.iban)}</p>
                                        <p>BIC: ${sanitize(state.einstellungen.bic)}</p>
                                    </div>
                                    <div>
                                        <p class="font-semibold text-slate-700 mb-1">Rechtliches</p>
                                        <p>Steuernummer / USt-IdNr:</p>
                                        <p>${sanitize(state.einstellungen.steuer)}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
}

// --- PDF Preview Logic ---
// --- PDF Preview & Export Logic ---
function openPdfPreview(htmlContent, filename = 'Rechnung.pdf') {
    if (window.invoiceView && typeof window.invoiceView.openPdfPreview === 'function') {
        window.invoiceView.openPdfPreview(htmlContent, filename);
    } else {
        const previewContainer = document.getElementById('pdf-preview-container');
        const modal = document.getElementById('pdf-preview-modal');
        if (previewContainer && modal) {
            previewContainer.innerHTML = htmlContent;
            previewContainer.dataset.filename = filename;
            modal.style.display = '';
            modal.style.zIndex = '';
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
    }
}
window.openPdfPreview = openPdfPreview;

function closePdfPreview() {
    if (window.invoiceView && typeof window.invoiceView.closePdfPreview === 'function') {
        window.invoiceView.closePdfPreview();
    } else {
        const modal = document.getElementById('pdf-preview-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            modal.style.display = 'none';
            modal.style.zIndex = '-10';
        }
    }
}
window.closePdfPreview = closePdfPreview;

async function executePrint(mode = 'print') {
    const printBtn = document.getElementById('pdf-preview-print-btn');
    const saveBtn = document.getElementById('pdf-preview-save-btn');
    const closeBtn = document.getElementById('pdf-preview-close-btn');

    const setButtonsState = (isBusy) => {
        [printBtn, saveBtn, closeBtn].forEach(btn => {
            if (!btn) return;
            btn.disabled = isBusy;
            if (isBusy) {
                btn.classList.add('opacity-50', 'pointer-events-none');
            } else {
                btn.classList.remove('opacity-50', 'pointer-events-none');
            }
        });
    };

    const closePdfModal = () => {
        if (window.invoiceView && typeof window.invoiceView.closePdfPreview === 'function') {
            window.invoiceView.closePdfPreview();
        } else if (typeof window.closePdfPreview === 'function') {
            window.closePdfPreview();
        }
    };

    try {
        setButtonsState(true);

        const printTemplate = document.getElementById('print-template');
        const previewContainer = document.getElementById('pdf-preview-container');

        if (!previewContainer) {
            console.warn('pdf-preview-container not found');
            return;
        }

        const invoiceElement = document.getElementById('invoice-paper') || previewContainer.querySelector('#invoice-paper') || previewContainer.firstElementChild || previewContainer;
        const filename = previewContainer.dataset.filename || 'Rechnung.pdf';

        if (mode === 'save') {
            if (window.api && typeof window.api.savePdf === 'function') {
                // 100% Nativ Electron - Absolut Freeze-sicher (Bypass html2pdf & html2canvas)
                const result = await window.api.savePdf(null, filename);
                if (result && result.success) {
                    showToast('PDF erfolgreich gespeichert', 'success');
                    closePdfModal();
                } else if (result && !result.cancelled) {
                    showToast('Fehler beim Speichern der PDF', 'error');
                }
            } else {
                // Fallback nur für normale Webbrowser (ohne Electron window.api)
                if (typeof html2pdf !== 'undefined') {
                    const opt = {
                        margin: [10, 10, 10, 10],
                        filename: filename,
                        image: { type: 'jpeg', quality: 0.98 },
                        html2canvas: { scale: 2, useCORS: true, allowTaint: true, windowWidth: 1024, logging: false },
                        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                        pagebreak: { mode: ['css', 'legacy'], avoid: ['.avoid-break', '.pdf-no-break', '.pdf-footer'] }
                    };
                    showToast('PDF-Export wird vorbereitet...', 'info');
                    await html2pdf().set(opt).from(invoiceElement.cloneNode(true)).save();
                    showToast('PDF erfolgreich gespeichert', 'success');
                    closePdfModal();
                } else {
                    showToast('PDF-Export im Browser nicht möglich.', 'error');
                }
            }
        } else {
            // Druck-Modus
            if (printTemplate) printTemplate.innerHTML = invoiceElement.outerHTML || previewContainer.innerHTML;
            await new Promise(resolve => setTimeout(resolve, 150));

            if (window.api && typeof window.api.printDocument === 'function') {
                const printRes = await window.api.printDocument();
                if (printRes && printRes.success) {
                    showToast('Druckauftrag gesendet', 'success');
                    closePdfModal();
                }
            } else {
                window.print();
                closePdfModal();
            }
        }
    } catch (globalErr) {
        console.error('executePrint unhandled error:', globalErr);
        showToast('Druckvorgang konnte nicht ausgeführt werden.', 'error');
    } finally {
        // 1. Verwaiste html2pdf-Container killen
        document.querySelectorAll('.html2pdf__container, iframe.html2canvas-container').forEach(el => {
            el.remove();
        });

        // 2. Pointer-Events korrekt zurücksetzen
        document.body.style.pointerEvents = '';
        const modal = document.getElementById('pdf-preview-modal');
        if (modal) modal.style.pointerEvents = '';

        // 3. Lade-Overlays abschalten
        ['loading-overlay', 'spinner', 'global-loading'].forEach(id => {
            const spinner = document.getElementById(id);
            if (spinner) {
                spinner.classList.add('hidden');
                spinner.style.display = 'none';
            }
        });

        // 4. Frische Referenzen holen und hart entsperren
        const pBtn = document.getElementById('pdf-preview-print-btn');
        const sBtn = document.getElementById('pdf-preview-save-btn');
        const cBtn = document.getElementById('pdf-preview-close-btn');
        [pBtn, sBtn, cBtn].forEach(btn => {
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'pointer-events-none');
            }
        });

        // 5. Events sicher neu binden
        if (window.invoiceView && typeof window.invoiceView.bindPdfModalControls === 'function') {
            window.invoiceView.bindPdfModalControls();
        }

        // 6. Fokus zurückholen
        if (typeof window.focus === 'function') window.focus();

        if (window.api && typeof window.api.focusWindow === 'function') {
            try {
                window.api.focusWindow();
            } catch (e) {
                // Focus API Fallback ignoriert
            }
        }
    }
}
window.executePrint = executePrint;

// --- E-Mail-Versand (F10): SMTP-Kontenverwaltung ---
async function renderSmtpKonten() {
    const liste = document.getElementById('smtp-konten-liste');
    const leer = document.getElementById('smtp-konten-leer');
    if (!liste) return;
    liste.innerHTML = '';
    let konten = [];
    try {
        konten = await window.api.getSmtpKonten();
    } catch (e) {
        console.warn('SMTP-Konten konnten nicht geladen werden:', e);
    }
    leer.classList.toggle('hidden', konten.length > 0);

    konten.forEach(konto => {
        const zeile = document.createElement('div');
        zeile.className = 'flex flex-wrap items-center justify-between gap-3 border border-slate-200 rounded-md px-4 py-3 bg-white';
        const sicherheitsBadge = konto.gespeichert_sicher
            ? '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-green-100 text-green-800 border border-green-200">verschlüsselt</span>'
            : '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-red-100 text-red-700 border border-red-200">unsicher gespeichert</span>';
        const verbindungsBadge = konto.port === 465 || konto.secure ? 'SSL/TLS' : 'STARTTLS';
        zeile.innerHTML = `
            <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-semibold text-sm text-slate-800">${sanitize(konto.name)}</span>
                    ${konto.ist_standard ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-primary/10 text-primary border border-primary/30">Standard</span>' : ''}
                    ${konto.hat_passwort ? '<span class="text-green-600 material-symbols-outlined text-[16px]" title="Passwort gespeichert">check_circle</span>' : '<span class="text-amber-500 material-symbols-outlined text-[16px]" title="Kein Passwort gespeichert">warning</span>'}
                    ${sicherheitsBadge}
                </div>
                <div class="text-xs text-slate-500 mt-0.5 font-mono">${sanitize(konto.host)}:${Number(konto.port)} · ${verbindungsBadge} · Absender: ${sanitize(konto.absender_email)}</div>
            </div>`;
        const aktionen = document.createElement('div');
        aktionen.className = 'flex items-center gap-1 shrink-0';
        const mkBtn = (icon, title, cls, handler) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.title = title;
            b.className = cls;
            b.onclick = handler;
            const s = document.createElement('span');
            s.className = 'material-symbols-outlined text-[18px]';
            s.textContent = icon;
            b.appendChild(s);
            return b;
        };
        if (!konto.ist_standard) {
            aktionen.appendChild(mkBtn('star', 'Als Standard setzen', 'text-slate-400 hover:text-amber-500 p-1 transition-colors', () => setzeStandardKonto(konto.id)));
        }
        aktionen.appendChild(mkBtn('edit', 'Bearbeiten', 'text-slate-400 hover:text-primary p-1 transition-colors', () => openSmtpKontoModal(konto)));
        aktionen.appendChild(mkBtn('delete', 'Löschen', 'text-slate-400 hover:text-red-500 p-1 transition-colors', () => deleteSmtpKontoMitConfirm(konto)));
        zeile.appendChild(aktionen);
        liste.appendChild(zeile);
    });
}

async function setzeStandardKonto(id) {
    try {
        const konten = await window.api.getSmtpKonten();
        const ziel = konten.find(k => k.id === id);
        if (!ziel) throw new Error('SMTP-Konto nicht gefunden.');
        await window.api.saveSmtpKonto({
            id: ziel.id,
            name: ziel.name,
            host: ziel.host,
            port: Number(ziel.port),
            secure: !!ziel.secure,
            user: '',
            absender_name: ziel.absender_name,
            absender_email: ziel.absender_email,
            ist_standard: true,
            passwort_leer_lassen: true
        });
        showToast('Standardkonto aktualisiert.', 'success');
        await renderSmtpKonten();
    } catch (e) {
        showToast(e.message || 'Konnte Standardkonto nicht setzen.', 'error');
    }
}

function onSmtpPortChange() {
    const port = parseInt(document.getElementById('smtp-modal-port').value, 10);
    document.getElementById('smtp-modal-secure-on').checked = port === 465;
    document.getElementById('smtp-modal-secure-off').checked = port !== 465;
}

async function openSmtpKontoModal(konto = null) {
    document.getElementById('smtp-konto-modal-title').innerText = konto ? 'SMTP-Konto bearbeiten' : 'SMTP-Konto anlegen';
    document.getElementById('smtp-modal-id').value = konto ? konto.id : '';
    document.getElementById('smtp-modal-name').value = konto ? konto.name : '';
    document.getElementById('smtp-modal-host').value = konto ? konto.host : '';
    document.getElementById('smtp-modal-port').value = String(konto ? Number(konto.port) : 587);
    onSmtpPortChange();
    if (konto) {
        document.getElementById('smtp-modal-secure-on').checked = !!konto.secure && Number(konto.port) !== 465;
        document.getElementById('smtp-modal-secure-off').checked = !(!!konto.secure && Number(konto.port) !== 465);
    }
    document.getElementById('smtp-modal-user').value = '';
    document.getElementById('smtp-modal-user').placeholder = konto ? '(unverändert – gespeichert)' : '';
    document.getElementById('smtp-modal-passwort').value = '';
    document.getElementById('smtp-modal-absender-name').value = konto ? konto.absender_name : '';
    document.getElementById('smtp-modal-absender-email').value = konto ? konto.absender_email : '';
    document.getElementById('smtp-modal-standard').checked = konto ? !!konto.ist_standard : false;
    document.getElementById('smtp-modal-klartext').checked = false;
    document.getElementById('smtp-modal-test-ergebnis').classList.add('hidden');

    document.getElementById('smtp-modal-klartext-wrap').classList.add('hidden');
    document.getElementById('smtp-modal-klartext').checked = false;

    const m = document.getElementById('smtp-konto-modal');
    m.classList.remove('hidden');
    m.classList.add('flex');
    document.getElementById('smtp-modal-name').focus();
}

function closeSmtpKontoModal() {
    const m = document.getElementById('smtp-konto-modal');
    m.classList.add('hidden');
    m.classList.remove('flex');
}

function leseSmtpFormular() {
    return {
        id: document.getElementById('smtp-modal-id').value || undefined,
        name: document.getElementById('smtp-modal-name').value.trim(),
        host: document.getElementById('smtp-modal-host').value.trim(),
        port: parseInt(document.getElementById('smtp-modal-port').value, 10),
        secure: document.getElementById('smtp-modal-secure-on').checked,
        user: document.getElementById('smtp-modal-user').value.trim(),
        passwort: document.getElementById('smtp-modal-passwort').value,
        absender_name: document.getElementById('smtp-modal-absender-name').value.trim(),
        absender_email: document.getElementById('smtp-modal-absender-email').value.trim(),
        ist_standard: document.getElementById('smtp-modal-standard').checked,
        klartext_erlaubt: document.getElementById('smtp-modal-klartext').checked
    };
}

async function testSmtpConnectionFromModal() {
    const ergebnisEl = document.getElementById('smtp-modal-test-ergebnis');
    ergebnisEl.classList.remove('hidden', 'bg-green-50', 'text-green-800', 'border-green-300', 'bg-red-50', 'text-red-800', 'border-red-300');
    const btn = document.getElementById('smtp-modal-test-btn') || ergebnisEl.closest('.max-h-\\[90vh\\]').querySelector('button[onclick="testSmtpConnectionFromModal()"]');
    btn.disabled = true;
    try {
        const res = await window.api.testSmtpConnection(leseSmtpFormular());
        if (res.success) {
            ergebnisEl.textContent = `Verbindung erfolgreich – Server meldet: ${res.details}`;
            ergebnisEl.classList.add('bg-green-50', 'text-green-800', 'border', 'border-green-300');
        } else {
            ergebnisEl.textContent = `Fehler: ${res.fehlermeldung}`;
            ergebnisEl.classList.add('bg-red-50', 'text-red-800', 'border', 'border-red-300');
        }
    } catch (e) {
        ergebnisEl.textContent = `Fehler: ${e.message || e}`;
        ergebnisEl.classList.add('bg-red-50', 'text-red-800', 'border', 'border-red-300');
    } finally {
        btn.disabled = false;
    }
}

async function saveSmtpKontoFromModal() {
    try {
        const res = await window.api.saveSmtpKonto(leseSmtpFormular());
        showToast(res && res.success ? 'SMTP-Konto gespeichert.' : 'Unbekannte Antwort beim Speichern.', res && res.success ? 'success' : 'error');
        closeSmtpKontoModal();
        await renderSmtpKonten();
    } catch (e) {
        if (e && /Sichere Speicherung/.test(e.message || '')) {
            document.getElementById('smtp-modal-klartext-wrap').classList.remove('hidden');
            document.getElementById('smtp-modal-klartext-wrap').classList.add('flex');
            showToast('Betriebssystem-Schlüsselspeicher nicht verfügbar. Bitte Option unten wählen.', 'error');
        } else {
            showToast(e.message || 'Speichern fehlgeschlagen.', 'error');
        }
    }
}

async function deleteSmtpKontoMitConfirm(konto) {
    const ok = await safeConfirm(`SMTP-Konto "${konto.name}" wirklich löschen?`, 'Konto löschen');
    if (!ok) return;
    try {
        await window.api.deleteSmtpKonto(konto.id);
        showToast('SMTP-Konto gelöscht.', 'success');
        await renderSmtpKonten();
    } catch (e) {
        showToast(e.message || 'Löschen fehlgeschlagen.', 'error');
    }
}
