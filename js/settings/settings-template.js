(function() {
function formatGermanDate(d) {
    if (!d) return '';
    const date = new Date(d);
    if (isNaN(date.getTime())) return String(d);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
}

function formatIban(iban) {
    if (!iban) return '';
    return iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

function getAngebotKonditionenText(rech, faelligStr, customKonditionen) {
    const rawCustom = (typeof customKonditionen === 'string' && customKonditionen)
        ? customKonditionen
        : (rech ? ((typeof rech.zahlungsbedingungen === 'string' && rech.zahlungsbedingungen) || (typeof rech.konditionen === 'string' && rech.konditionen) || '') : '');
    const cleanCustom = rawCustom ? (typeof sanitize === 'function' ? sanitize(rawCustom).trim() : String(rawCustom).trim()) : '';

    let konditionenText = '';
    if (cleanCustom) {
        konditionenText = cleanCustom;
    } else {
        const vg = (rech && (rech.vertragsgrundlage || (rech.vob_vereinbart ? 'VOB_B' : 'BGB_WERKVERTRAG'))) || 'BGB_WERKVERTRAG';
        if (vg === 'VOB_B') {
            konditionenText = 'Vertragsgrundlage: VOB/B (Vergabe- und Vertragsordnung für Bauleistungen, Teil B). Zahlungsbedingungen: Abschlagszahlungen nach Leistungsfortschritt gemäß § 16 VOB/B.';
        } else if (vg === 'BGB_VERBRAUCHERBAU') {
            konditionenText = 'Vertragsgrundlage: Verbraucherbauvertrag (§ 650i BGB). Zahlungsbedingungen: Abschlagszahlungen nach Baufortschritt gemäß § 650m BGB.';
        } else {
            konditionenText = 'Vertragsgrundlage: BGB-Werkvertrag (§§ 631 ff. BGB). Zahlungsbedingungen: Abschlagszahlungen nach Leistungsstand gemäß § 632a BGB.';
        }
    }

    const faelligDisplay = (faelligStr && String(faelligStr).includes('<strong'))
        ? faelligStr
        : `<strong>${faelligStr || ''}</strong>`;

    return `Dieses Angebot kann bis zum ${faelligDisplay} angenommen werden. ${konditionenText}`;
}

async function buildInvoiceDocumentHtml(rech, kunde, isAngebot = false) {
    // Sicherstellen, dass isAngebot auch anhand von Dokumenteigenschaften sauber erkannt wird
    isAngebot = Boolean(isAngebot || (rech && (rech.type === 'angebot' || rech.doc_type === 'angebot')));

    const logoHtml = state.einstellungen.logo ? `<img src="${state.einstellungen.logo}" class="max-h-14 max-w-[220px] object-contain" alt="Firmenlogo">` : '';
    const datumStr = formatGermanDate(rech.datum);
    const faelligStr = formatGermanDate(rech.faellig);

    let ausfuehrungStr = '';
    if (rech.leistungszeitraum_von && rech.leistungszeitraum_bis) {
        ausfuehrungStr = `${formatGermanDate(rech.leistungszeitraum_von)} – ${formatGermanDate(rech.leistungszeitraum_bis)}`;
    } else if (rech.ausfuehrungszeitraum) {
        ausfuehrungStr = sanitize(rech.ausfuehrungszeitraum);
    } else if (rech.leistungsdatum) {
        ausfuehrungStr = formatGermanDate(rech.leistungsdatum);
    }

    // Bei Rechnungen Standard-Fallback auf Rechnungsdatum
    const leistungsdatumStr = ausfuehrungStr || datumStr;

    const kundenNr = (kunde && kunde.kundennummer) || (kunde && kunde.id ? `KD-${String(kunde.id).padStart(5, '0')}` : '-');

    let projektName = '';
    if (rech.projekt_name) {
        projektName = rech.projekt_name;
    } else if (rech.projekt_id && state.projekte) {
        const p = state.projekte.find(prj => prj.id == rech.projekt_id);
        if (p) projektName = p.name;
    }

    const empfaengerName = sanitize((kunde && kunde.name) || 'Sehr geehrte Damen und Herren');
    const empfaengerAdresse = sanitize((kunde && kunde.adresse) || '').replace(/[\r\n]+/g, '<br>');
    const empfaengerPlzOrt = `${sanitize((kunde && kunde.plz) || '')} ${sanitize((kunde && kunde.ort) || '')}`.trim();

    let itemsHtml = '';
    rech.positionen.forEach((pos, i) => {
        const artId = parseInt(pos.artikelId);
        const art = state.artikel.find(a => parseInt(a.id) === artId) || {};
        const rabatt = parseFloat(pos.rabatt) || 0;
        const gesamt = (pos.menge * pos.preis) * (1 - rabatt / 100);

        const global13b = Boolean(rech.unterliegt_13b || rech.isGlobal13b || rech.is13b);
        const explicit13b = (pos.is13b !== undefined && pos.is13b !== null)
            ? pos.is13b
            : ((pos.unterliegt_13b !== undefined && pos.unterliegt_13b !== null)
                ? pos.unterliegt_13b
                : (pos.ist13b !== undefined && pos.ist13b !== null ? pos.ist13b : undefined));
        const isPos13b = (explicit13b !== undefined && explicit13b !== null)
            ? Boolean(explicit13b)
            : global13b;
        const descText = pos.beschreibung || pos.text || art.beschreibung || '';

        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-100 text-xs avoid-break pdf-no-break';
        tr.style.pageBreakInside = 'avoid';
        tr.style.breakInside = 'avoid';

        const tdIdx = document.createElement('td');
        tdIdx.className = 'py-2 pl-2 text-center text-slate-400 font-mono text-[11px]';
        tdIdx.textContent = i + 1;
        tr.appendChild(tdIdx);

        const tdName = document.createElement('td');
        tdName.className = 'py-2 px-2';
        const nameDiv = document.createElement('div');
        nameDiv.className = 'font-semibold text-slate-900';
        nameDiv.textContent = pos.name || art.name || 'Position';
        tdName.appendChild(nameDiv);
        if (descText) {
            const descDiv = document.createElement('div');
            descDiv.className = 'text-[11px] text-slate-500 leading-snug mt-0.5 whitespace-pre-line';
            descDiv.textContent = descText;
            tdName.appendChild(descDiv);
        }
        tr.appendChild(tdName);

        const tdMenge = document.createElement('td');
        tdMenge.className = 'py-2 px-2 text-center tabular-nums text-slate-700';
        tdMenge.textContent = `${pos.menge} ${pos.einheit || 'Stk.'}`;
        tr.appendChild(tdMenge);

        const tdPreis = document.createElement('td');
        tdPreis.className = 'py-2 px-2 text-right tabular-nums text-slate-700';
        tdPreis.textContent = formatCurrency(pos.preis);
        tr.appendChild(tdPreis);

        const tdMwst = document.createElement('td');
        tdMwst.className = 'py-2 px-2 text-right tabular-nums text-slate-500';
        tdMwst.textContent = isPos13b ? '§ 13b' : `${pos.mwst}%`;
        tr.appendChild(tdMwst);

        const tdRabatt = document.createElement('td');
        tdRabatt.className = 'py-2 px-2 text-right tabular-nums ' + (rabatt > 0 ? 'text-emerald-600 font-medium' : 'text-slate-300');
        tdRabatt.textContent = rabatt > 0 ? `-${rabatt}%` : '-';
        tr.appendChild(tdRabatt);

        const tdGesamt = document.createElement('td');
        tdGesamt.className = 'py-2 pr-2 text-right tabular-nums font-semibold text-slate-900';
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

        const global13b = Boolean(rech.unterliegt_13b || rech.isGlobal13b || rech.is13b);
        const explicit13b = (pos.is13b !== undefined && pos.is13b !== null)
            ? pos.is13b
            : ((pos.unterliegt_13b !== undefined && pos.unterliegt_13b !== null)
                ? pos.unterliegt_13b
                : (pos.ist13b !== undefined && pos.ist13b !== null ? pos.ist13b : undefined));
        const isPos13b = (explicit13b !== undefined && explicit13b !== null)
            ? Boolean(explicit13b)
            : global13b;

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
    
    const steuerpflichtigesNetto = (rech.netto !== undefined && rech.netto !== null) ? rech.netto : (positionenNetto - globalRabattAbzug);
    const taxableRatio = leistungsstandNetto > 0 ? (steuerpflichtigesNetto / leistungsstandNetto) : (steuerpflichtigesNetto === 0 ? 0 : 1);

    let taxHtml = '';
    
    const hat13bNetto = (taxes['13b_netto'] && taxes['13b_netto'] > 0);
    const hatNormalNetto = (taxes['normal_netto'] && taxes['normal_netto'] > 0);

    if (hat13bNetto && hatNormalNetto) {
        const netto13b = taxes['13b_netto'] * rabattFaktor * taxableRatio;
        const nettoNormal = taxes['normal_netto'] * rabattFaktor * taxableRatio;
        
        taxHtml += `
            <div class="flex justify-between text-xs text-slate-500 py-0.5">
                <span>Netto (regulär):</span>
                <span class="tabular-nums font-mono">${formatCurrency(nettoNormal)}</span>
            </div>
            <div class="flex justify-between text-xs text-slate-500 py-0.5">
                <span>Netto (§ 13b – Steuerschuldnerschaft des Leistungsempfängers):</span>
                <span class="tabular-nums font-mono">${formatCurrency(netto13b)}</span>
            </div>
        `;
    }

    Object.keys(taxes).forEach(rate => {
        if (rate === '13b_netto' || rate === 'normal_netto') return;
        const baseTax = taxes[rate] * rabattFaktor;
        const taxVal = baseTax * taxableRatio;
        if (taxVal > 0.005) {
            const adjustedLabel = taxableRatio < 0.999 ? ' (angepasst)' : '';
            const taxLbl = mode === 'netto' ? `zzgl. ${rate}% MwSt${adjustedLabel}:` : `inkl. ${rate}% MwSt${adjustedLabel}:`;
            taxHtml += `
                <div class="flex justify-between text-xs text-slate-600 py-0.5">
                    <span>${taxLbl}</span>
                    <span class="tabular-nums font-mono">${formatCurrency(taxVal)}</span>
                </div>
            `;
        }
    });

    if (hat13bNetto && !hatNormalNetto) {
        taxHtml += `
            <div class="flex justify-between text-xs text-slate-600 py-0.5">
                <span>USt. nicht ausgewiesen (§ 13b UStG – Steuerschuldnerschaft des Leistungsempfängers):</span>
                <span class="tabular-nums font-mono">${formatCurrency(0)}</span>
            </div>
        `;
    }

    const hatKumulationOderSicherheit = (rech.sicherheitseinbehalt > 0) || (rech.verrechnungen && rech.verrechnungen.length > 0);
    let deductionsHtml = '';
    
    if (hatKumulationOderSicherheit) {
        deductionsHtml += `
            <div class="flex justify-between text-xs text-slate-700 font-medium py-0.5">
                <span>Leistungsstand (Netto):</span>
                <span class="tabular-nums font-mono">${formatCurrency(leistungsstandNetto)}</span>
            </div>
        `;

        if (rech.sicherheitseinbehalt > 0) {
            const sichPct = (rech.sicherheitseinbehalt_prozent !== undefined && rech.sicherheitseinbehalt_prozent !== null && rech.sicherheitseinbehalt_prozent !== 0)
                ? rech.sicherheitseinbehalt_prozent
                : (leistungsstandNetto > 0 ? (Math.round((rech.sicherheitseinbehalt / leistungsstandNetto) * 1000) / 10) : null);
            const sichLabel = `Abzug Sicherheitseinbehalt${sichPct ? ` (${sichPct}%)` : ''}:`;
            deductionsHtml += `
                <div class="flex justify-between text-xs text-amber-600 py-0.5">
                    <span>${sichLabel}</span>
                    <span class="tabular-nums font-mono">-${formatCurrency(rech.sicherheitseinbehalt)}</span>
                </div>
            `;
        }

        if (rech.verrechnungen && rech.verrechnungen.length > 0) {
            rech.verrechnungen.forEach(v => {
                const vRech = state.rechnungen.find(r => r.id === v.vorherige_rechnung_id);
                const infoStr = vRech ? `Abzug Rech. ${vRech.nr}:` : 'Abzug Abschlagsrech.:';
                deductionsHtml += `
                    <div class="flex justify-between text-xs text-indigo-600 py-0.5">
                        <span>${infoStr}</span>
                        <span class="tabular-nums font-mono">-${formatCurrency(v.abzugsbetrag_netto)}</span>
                    </div>
                `;
            });
        }
        
        deductionsHtml += `<div class="border-b border-slate-200 my-1"></div>`;
    }

    const totalTaxVal = Object.keys(taxes)
        .filter(k => k !== '13b_netto' && k !== 'normal_netto')
        .reduce((sum, r) => sum + (taxes[r] * rabattFaktor * taxableRatio), 0);

    const calculatedNetto = mode === 'netto'
        ? (positionenNetto - globalRabattAbzug)
        : (positionenBrutto - totalTaxVal - globalRabattAbzug);

    const effectiveNetto = (rech.netto !== undefined && rech.netto !== null) ? rech.netto : calculatedNetto;
    const effectiveBrutto = (rech.brutto !== undefined && rech.brutto !== null) ? rech.brutto : (effectiveNetto + totalTaxVal);
    const zahlbetragNumerical = (rech.zahlbetrag !== undefined && rech.zahlbetrag !== null) ? rech.zahlbetrag : effectiveBrutto;

    let totalsHtml = `
        ${rech.globalRabattAbzug > 0 ? `
            <div class="flex justify-between text-slate-500 py-0.5">
                <span>Zwischensumme:</span>
                <span class="tabular-nums font-mono">${formatCurrency(effectiveNetto + rech.globalRabattAbzug)}</span>
            </div>
            <div class="flex justify-between text-emerald-600 py-0.5 pb-1 border-b border-slate-200">
                <span>Gesamtrabatt:</span>
                <span class="tabular-nums font-mono">-${formatCurrency(rech.globalRabattAbzug)}</span>
            </div>
        ` : ''}

        ${deductionsHtml}

        <div class="flex justify-between font-medium text-slate-700 py-0.5">
            <span>${hatKumulationOderSicherheit ? 'Steuerpflichtig (Netto):' : 'Nettobetrag:'}</span>
            <span class="tabular-nums font-mono">${formatCurrency(effectiveNetto)}</span>
        </div>

        ${taxHtml}

        <div class="flex justify-between font-bold text-slate-900 pt-1 mt-1 border-t border-slate-200">
            <span>Gesamtbetrag (Brutto):</span>
            <span class="tabular-nums font-mono">${formatCurrency(effectiveBrutto)}</span>
        </div>

        ${rech.anzahlung > 0 ? `
            <div class="flex justify-between text-slate-600 pt-1">
                <span>Abzüglich Anzahlung:</span>
                <span class="tabular-nums font-mono text-emerald-700">-${formatCurrency(rech.anzahlung)}</span>
            </div>
        ` : ''}
    `;

    // --- Custom Texts & Legal Information ---
    let vortextHtml = rech.vortext ? `<div class="mb-3 whitespace-pre-wrap text-xs text-slate-700 leading-relaxed">${sanitize(rech.vortext)}</div>` : '';
    let fusstextHtml = rech.fusstext ? `<div class="mt-3 whitespace-pre-wrap text-xs text-slate-700 leading-relaxed">${sanitize(rech.fusstext)}</div>` : '';
    
    let legalTextsHtml = '<div class="space-y-1 text-[10px] text-slate-500 leading-relaxed">';
    
    if (isAngebot) {
        if (ausfuehrungStr) {
            legalTextsHtml += `<p><strong>Voraussichtlicher Ausführungszeitraum:</strong> ${ausfuehrungStr}.</p>`;
        }
    } else {
        if (rech.leistungszeitraum_von && rech.leistungszeitraum_bis) {
            legalTextsHtml += `<p><strong>Leistungszeitraum:</strong> ${formatGermanDate(rech.leistungszeitraum_von)} bis ${formatGermanDate(rech.leistungszeitraum_bis)}.</p>`;
        } else if (rech.leistungsdatum) {
            legalTextsHtml += `<p><strong>Leistungsdatum:</strong> ${formatGermanDate(rech.leistungsdatum)}.</p>`;
        } else {
            legalTextsHtml += `<p class="italic">Das Liefer- und Leistungsdatum entspricht, sofern nicht anders angegeben, dem Rechnungsdatum.</p>`;
        }
    }
    
    const isReverseCharge = Boolean(rech.unterliegt_13b || rech.isGlobal13b || rech.is13b) || (taxes['13b_netto'] > 0) || (Object.keys(taxes).length === 0 && positionenNetto > 0 && kunde && kunde.ist_bauleistender_13b);
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
    
    if (!isAngebot && rech.vob_vereinbart) {
        legalTextsHtml += `<p>Gemäß § 16 Abs. 1 VOB/B ist diese Zahlung innerhalb von 21 Tagen nach Zugang dieser prüfbaren Aufstellung fällig.</p>`;
    }
    
    if (!isAngebot && (rech.ist_privatkunde || rech.customer_type === 'B2C' || (kunde && kunde.customer_type === 'B2C'))) {
        legalTextsHtml += `<p><strong>Hinweis gem. § 14b Abs. 1 Satz 5 UStG:</strong> Als Privatperson sind Sie gesetzlich verpflichtet, diese Rechnung sowie den zugehörigen Zahlungsbeleg bei steuerpflichtigen Werkleistungen oder sonstigen Leistungen im Zusammenhang mit einem Grundstück mindestens zwei Jahre lang aufzubewahren (Fristbeginn: Schluss des Kalenderjahres der Ausstellung).</p>`;
    }
    
    if (rech.ausweis_35a_erforderlich) {
        let sumLohnNetto = 0;
        let sumLohnSteuer = 0;
        let sumLohnBrutto = 0;

        if (Array.isArray(rech.positionen) && rech.positionen.length > 0) {
            const lohnPos = rech.positionen.filter(p => {
                const ct = String(p.cost_type || p.kostenart || '').toUpperCase();
                return ct === 'LOHN' || ct === 'FAHRT' || Boolean(p.is_tax_deductible_35a);
            });
            if (lohnPos.length > 0) {
                lohnPos.forEach(p => {
                    const menge = parseFloat(p.menge) || 0;
                    const preis = parseFloat(p.preis) || 0;
                    const rabatt = parseFloat(p.rabatt) || 0;
                    const mwstRate = parseFloat(p.mwst !== undefined ? p.mwst : (rech.mwst !== undefined ? rech.mwst : 19)) || 0;
                    const net = Math.round((menge * preis * (1 - rabatt / 100)) * 100) / 100;
                    const tax = Math.round((net * (mwstRate / 100)) * 100) / 100;
                    sumLohnNetto += net;
                    sumLohnSteuer += tax;
                    sumLohnBrutto += (net + tax);
                });
                sumLohnNetto = Math.round(sumLohnNetto * 100) / 100;
                sumLohnSteuer = Math.round(sumLohnSteuer * 100) / 100;
                sumLohnBrutto = Math.round(sumLohnBrutto * 100) / 100;
            }
        }

        // Fallback falls keine Positionen kategorisiert sind, aber ein Gesamtwert übergeben wurde
        if (sumLohnBrutto === 0 && rech.summe_lohnkosten_brutto > 0) {
            const mwstRate = parseFloat(rech.mwst !== undefined ? rech.mwst : (rech.netto > 0 ? (rech.steuer / rech.netto * 100) : 19)) || 19;
            sumLohnNetto = Math.round((rech.summe_lohnkosten_brutto / (1 + mwstRate / 100)) * 100) / 100;
            sumLohnSteuer = Math.round((rech.summe_lohnkosten_brutto - sumLohnNetto) * 100) / 100;
            sumLohnBrutto = parseFloat(rech.summe_lohnkosten_brutto);
        }

        if (sumLohnBrutto > 0) {
            legalTextsHtml += `<p><strong>Hinweis zur Steuerermäßigung nach § 35a EStG:</strong> In dem oben ausgewiesenen Rechnungsbetrag sind steuerbegünstigte Arbeits-, Fahrt- und Maschinenkosten in Höhe von ${formatCurrency(sumLohnNetto)} (netto) zzgl. ${formatCurrency(sumLohnSteuer)} Umsatzsteuer, somit insgesamt ${formatCurrency(sumLohnBrutto)} (brutto) enthalten.</p>`;
        }
    }
    
    legalTextsHtml += '</div>';

    // Generate GiroCode (EPC-QR) for Invoices
    let qrHtml = '';
    if (!isAngebot && state.einstellungen.iban && state.einstellungen.firmenname && zahlbetragNumerical > 0) {
        const bic = state.einstellungen.bic ? state.einstellungen.bic.trim() : '';
        const name = state.einstellungen.firmenname.substring(0, 70).trim();
        const iban = state.einstellungen.iban.replace(/\s+/g, '').trim();
        let amountStr = zahlbetragNumerical.toFixed(2);
        if (amountStr.endsWith('.00')) {
            amountStr = parseInt(zahlbetragNumerical, 10).toString();
        }

        const refStr = `Rechnung ${rech.nr}`.substring(0, 35).replace(/[^a-zA-Z0-9.\- ]/g, '');

        const epcLines = [
            "BCD", "002", "1", "SCT", bic, name, iban, `EUR${amountStr}`, "", "", refStr, ""
        ];
        const epcString = epcLines.join('\n');

        const qrDataUrl = await window.api.generateQrCode(epcString);
        if (qrDataUrl) {
            qrHtml = `
                <div class="flex items-center gap-3.5 p-2.5 bg-slate-50 rounded-lg border border-slate-200/80 w-full">
                    <img src="${qrDataUrl}" class="w-28 h-28 rounded bg-white p-1 border border-slate-200 shrink-0" style="width: 28mm; height: 28mm;" alt="GiroCode">
                    <div class="text-xs text-slate-600 flex-1 leading-snug">
                        <p class="font-bold text-slate-800 mb-1 flex items-center gap-1.5 text-xs">
                            <span class="material-symbols-outlined text-[15px] text-primary">qr_code_scanner</span>
                            GiroCode / QR-Rechnung
                        </p>
                        <p class="text-[11px] text-slate-600 leading-snug mb-1">
                            Mit Banking-App scannen, um Betrag &amp; Überweisungsdaten automatisch und fehlerfrei zu übernehmen.
                        </p>
                        <p class="text-[10px] text-slate-400">
                            Empfänger, IBAN &amp; Rechnungsnummer werden direkt ausgefüllt.
                        </p>
                    </div>
                </div>
            `;
        }
    }

    const absenderInline = state.einstellungen.adresse ?
        (sanitize(state.einstellungen.firmenname) + " • " + sanitize(state.einstellungen.adresse).replace(/[\r\n]+/g, ' • ')) :
        sanitize(state.einstellungen.firmenname);

    const formattedIban = formatIban(state.einstellungen.iban);
    const vorlage = state.einstellungen.rechnungsvorlage || 'klassisch';
    const customKonditionen = (typeof rech.zahlungsbedingungen === 'string' && rech.zahlungsbedingungen.trim())
        ? sanitize(rech.zahlungsbedingungen).trim()
        : ((typeof rech.konditionen === 'string' && rech.konditionen.trim()) ? sanitize(rech.konditionen).trim() : '');
    const datumLabel = isAngebot ? 'Angebotsdatum:' : 'Rechnungsdatum:';
    const totalBoxLabel = isAngebot ? 'Angebotssumme (Brutto)' : 'Zahlbetrag';
    
    let templateHtml = '';

    if (vorlage === 'modern') {
        templateHtml = `
            <div id="invoice-paper" class="invoice-paper max-w-4xl mx-auto bg-white text-slate-800 font-sans flex flex-col justify-between relative" style="min-height: calc(297mm - 24mm);">
                <div class="flex-1 flex flex-col">
                    <!-- Accent bar -->
                    <div class="h-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full mb-4"></div>

                    <!-- Briefkopf: Logo links, Firmendaten rechts -->
                    <div class="flex justify-between items-start pb-3 border-b border-slate-100 mb-5">
                        <div class="max-w-[45%]">
                            ${logoHtml ? logoHtml : `<h1 class="text-xl font-extrabold tracking-tight text-blue-600">${sanitize(state.einstellungen.firmenname)}</h1>`}
                        </div>
                        <div class="text-right text-xs text-slate-600 space-y-0.5 leading-tight">
                            <p class="font-bold text-slate-900 text-sm">${sanitize(state.einstellungen.firmenname)}</p>
                            ${state.einstellungen.adresse ? `<p>${sanitize(state.einstellungen.adresse).replace(/\n/g, '<br>')}</p>` : ''}
                        </div>
                    </div>

                    <!-- Anschriftenfeld & Infoblock (DIN 5008) -->
                    <div class="flex justify-between items-start mb-5 gap-6">
                        <!-- Anschrift Empfänger -->
                        <div class="w-1/2 pt-1">
                            <p class="text-[9px] text-blue-600 font-semibold tracking-wider uppercase border-b border-blue-100 pb-1 mb-2">${absenderInline}</p>
                            <div class="text-slate-800 leading-snug text-xs">
                                <p class="font-bold text-sm text-slate-900 mb-1">${empfaengerName}</p>
                                ${empfaengerAdresse ? `<p class="text-slate-700">${empfaengerAdresse}</p>` : ''}
                                ${empfaengerPlzOrt ? `<p class="text-slate-700 font-medium">${empfaengerPlzOrt}</p>` : ''}
                            </div>
                        </div>

                        <!-- Infoblock -->
                        <div class="w-64 bg-slate-50 p-3 rounded-xl border border-slate-200/80 border-l-4 border-l-blue-600 text-xs text-slate-600 space-y-1.5 shadow-sm">
                            <div class="flex justify-between border-b border-slate-200/60 pb-1">
                                <span class="text-slate-500 font-medium">${isAngebot ? 'Angebots-Nr.:' : 'Rechnungs-Nr.:'}</span>
                                <span class="font-bold text-blue-600 font-mono">${sanitize(rech.nr)}</span>
                            </div>
                            <div class="flex justify-between border-b border-slate-200/60 pb-1">
                                <span class="text-slate-500">${datumLabel}</span>
                                <span class="font-medium text-slate-800">${datumStr}</span>
                            </div>
                            ${!isAngebot ? `
                            <div class="flex justify-between border-b border-slate-200/60 pb-1">
                                <span class="text-slate-500">Leistungsdatum:</span>
                                <span class="font-medium text-slate-800">${leistungsdatumStr}</span>
                            </div>` : (ausfuehrungStr ? `
                            <div class="flex justify-between border-b border-slate-200/60 pb-1">
                                <span class="text-slate-500">Voraussichtl. Ausführung:</span>
                                <span class="font-medium text-slate-800">${ausfuehrungStr}</span>
                            </div>` : '')}
                            <div class="flex justify-between border-b border-slate-200/60 pb-1">
                                <span class="text-slate-500">Kundennummer:</span>
                                <span class="font-medium text-slate-800 font-mono">${kundenNr}</span>
                            </div>
                            <div class="flex justify-between border-b border-slate-200/60 pb-1">
                                <span class="text-slate-500">${isAngebot ? 'Gültig bis:' : 'Fällig am:'}</span>
                                <span class="font-bold text-slate-900">${faelligStr}</span>
                            </div>
                            ${kunde.ustId ? `
                            <div class="flex justify-between border-b border-slate-200/60 pb-1">
                                <span class="text-slate-500">Ihre USt-IdNr.:</span>
                                <span class="font-medium text-slate-800 font-mono">${sanitize(kunde.ustId)}</span>
                            </div>` : ''}
                            ${projektName ? `
                            <div class="flex justify-between pt-0.5">
                                <span class="text-slate-500">Projekt:</span>
                                <span class="font-medium text-slate-800 truncate max-w-[120px]" title="${sanitize(projektName)}">${sanitize(projektName)}</span>
                            </div>` : ''}
                        </div>
                    </div>

                    <!-- Titel & Betreffzeile -->
                    <div class="mb-3 flex items-center justify-between">
                        <div>
                            <h2 class="text-xl font-bold text-slate-900 tracking-tight">
                                ${isAngebot ? 'Angebot' : 'Rechnung'} <span class="text-blue-600 font-medium">#${sanitize(rech.nr)}</span>
                            </h2>
                            ${projektName ? `<p class="text-xs text-slate-600 mt-0.5 font-medium">Bauvorhaben / Projekt: ${sanitize(projektName)}</p>` : ''}
                        </div>
                        <span class="px-2.5 py-1 text-[11px] font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                            ${isAngebot ? 'Angebot' : 'Rechnung'}
                        </span>
                    </div>

                    ${vortextHtml ? `<div class="mb-3 text-xs text-slate-700 leading-relaxed">${vortextHtml}</div>` : ''}

                    <!-- Positionstabelle -->
                    <div class="overflow-hidden rounded-lg border border-slate-200 mb-4 shadow-sm">
                        <table class="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr class="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-200">
                                    <th class="py-2.5 pl-2 text-center w-8">Pos.</th>
                                    <th class="py-2.5 px-2">Bezeichnung</th>
                                    <th class="py-2.5 px-2 text-center w-20">Menge</th>
                                    <th class="py-2.5 px-2 text-right w-24">${einzelpreisLabel}</th>
                                    <th class="py-2.5 px-2 text-right w-16">MwSt</th>
                                    <th class="py-2.5 px-2 text-right w-16">Rabatt</th>
                                    <th class="py-2.5 pr-2 text-right w-24">${gesamtLabel}</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100 text-slate-700">
                                ${itemsHtml}
                            </tbody>
                        </table>
                    </div>

                    <!-- Flex Spacer: Füllt den Leerraum dynamisch aus und schiebt den Abschlussblock nach unten -->
                    <div class="flex-1 min-h-[16px]"></div>

                    <!-- Abschlussbereich: Zahlungsbedingungen, Hinweise & Summenblock -->
                    <div class="mt-auto">
                        <div class="flex justify-between items-start gap-6 mb-4 avoid-break pdf-no-break" style="break-inside: avoid; page-break-inside: avoid;">
                            <div class="flex-1 space-y-2.5">
                                ${isAngebot ? `
                                <div class="text-xs text-slate-600 bg-blue-50/50 p-2.5 rounded-xl border border-blue-100 leading-relaxed">
                                    <p class="font-semibold text-blue-900 mb-0.5">Konditionen &amp; Gültigkeit:</p>
                                    <p>${getAngebotKonditionenText(rech, `<strong class="text-slate-900">${faelligStr}</strong>`, customKonditionen)}</p>
                                </div>
                                ` : `
                                <div class="text-xs text-slate-600 bg-blue-50/50 p-2.5 rounded-xl border border-blue-100 leading-relaxed">
                                    <p class="font-semibold text-blue-900 mb-0.5">Zahlungsbedingungen:</p>
                                    <p>Bitte überweisen Sie den Betrag bis zum <strong class="text-slate-900">${faelligStr}</strong> auf das unten angegebene Bankkonto unter Angabe der Rechnungsnummer <strong class="text-slate-900 font-mono">${sanitize(rech.nr)}</strong>.</p>
                                </div>
                                `}

                                ${legalTextsHtml}

                                ${qrHtml}
                            </div>

                            <!-- Rechts: Summenblock -->
                            <div class="w-72 flex-shrink-0 bg-slate-50 rounded-xl p-3.5 border border-slate-200/80 shadow-sm text-xs">
                                ${totalsHtml}
                                <div class="mt-2.5 p-2.5 bg-blue-600 text-white rounded-lg flex justify-between items-baseline shadow-sm">
                                    <span class="font-bold text-xs uppercase tracking-wider text-blue-100">${totalBoxLabel}</span>
                                    <span class="font-black text-lg font-mono">${formatCurrency(zahlbetragNumerical)}</span>
                                </div>
                            </div>
                        </div>

                        ${fusstextHtml ? `<div class="mb-3 text-xs text-slate-700 leading-relaxed pdf-no-break" style="break-inside: avoid; page-break-inside: avoid;">${fusstextHtml}</div>` : ''}
                    </div>
                </div>

                <!-- Fußzeile -->
                <div class="pt-3 border-t border-slate-200 text-[10px] text-slate-500 grid grid-cols-3 gap-6 leading-snug pdf-footer avoid-break mt-auto" style="break-inside: avoid; page-break-inside: avoid;">
                    <div>
                        <p class="font-bold text-blue-700 uppercase tracking-wider text-[9px] mb-0.5">Unternehmen</p>
                        <p class="font-medium text-slate-800">${sanitize(state.einstellungen.firmenname)}</p>
                        ${state.einstellungen.adresse ? `<p class="text-slate-600 mt-0.5">${sanitize(state.einstellungen.adresse).replace(/\n/g, '<br>')}</p>` : ''}
                    </div>
                    <div>
                        <p class="font-bold text-blue-700 uppercase tracking-wider text-[9px] mb-0.5">Bankverbindung</p>
                        <p class="font-medium text-slate-800">${sanitize(state.einstellungen.bankname)}</p>
                        <p class="font-mono text-slate-700">IBAN: ${formattedIban}</p>
                        <p class="font-mono text-slate-700">BIC: ${sanitize(state.einstellungen.bic)}</p>
                    </div>
                    <div>
                        <p class="font-bold text-blue-700 uppercase tracking-wider text-[9px] mb-0.5">Rechtliches & Steuer</p>
                        <p>Steuernummer / USt-IdNr.:</p>
                        <p class="font-medium text-slate-800 font-mono">${sanitize(state.einstellungen.steuer)}</p>
                    </div>
                </div>
            </div>
        `;
    } else if (vorlage === 'minimalistisch') {
        templateHtml = `
            <div id="invoice-paper" class="invoice-paper max-w-4xl mx-auto bg-white text-black font-sans flex flex-col justify-between relative" style="min-height: calc(297mm - 24mm);">
                <div class="flex-1 flex flex-col">
                    <!-- Briefkopf: Minimalistisch -->
                    <div class="flex justify-between items-end pb-3 border-b-2 border-black mb-5">
                        <div>
                            ${logoHtml ? `<div class="grayscale opacity-90">${logoHtml}</div>` : `<h1 class="text-lg font-bold tracking-widest uppercase text-black">${sanitize(state.einstellungen.firmenname)}</h1>`}
                        </div>
                        <div class="text-right">
                            <h2 class="text-xl font-light tracking-widest text-black uppercase">${isAngebot ? 'Angebot' : 'Rechnung'}</h2>
                            <p class="text-xs font-mono font-bold">${sanitize(rech.nr)}</p>
                        </div>
                    </div>

                    <!-- Anschriftenfeld & Infoblock (DIN 5008) -->
                    <div class="flex justify-between items-start mb-5 gap-6">
                        <div class="w-1/2 pt-1">
                            <p class="text-[9px] text-gray-500 font-bold uppercase tracking-widest border-b border-gray-300 pb-1 mb-2">${absenderInline}</p>
                            <div class="text-black leading-snug text-xs">
                                <p class="font-bold text-sm mb-1">${empfaengerName}</p>
                                ${empfaengerAdresse ? `<p class="text-gray-800">${empfaengerAdresse}</p>` : ''}
                                ${empfaengerPlzOrt ? `<p class="text-gray-800 font-medium">${empfaengerPlzOrt}</p>` : ''}
                            </div>
                        </div>

                        <div class="w-60 border-l border-gray-300 pl-4 text-xs text-gray-700 space-y-1">
                            <div class="flex justify-between"><span class="text-gray-500">${datumLabel}</span> <span class="font-medium">${datumStr}</span></div>
                            ${!isAngebot ? `
                            <div class="flex justify-between"><span class="text-gray-500">Leistungsdatum:</span> <span class="font-medium">${leistungsdatumStr}</span></div>` : (ausfuehrungStr ? `
                            <div class="flex justify-between"><span class="text-gray-500">Voraussichtl. Ausführung:</span> <span class="font-medium">${ausfuehrungStr}</span></div>` : '')}
                            <div class="flex justify-between"><span class="text-gray-500">Kundennummer:</span> <span class="font-medium font-mono">${kundenNr}</span></div>
                            <div class="flex justify-between"><span class="text-gray-500">${isAngebot ? 'Gültig bis:' : 'Fällig am:'}</span> <span class="font-bold">${faelligStr}</span></div>
                            ${kunde.ustId ? `<div class="flex justify-between"><span class="text-gray-500">USt-IdNr.:</span> <span class="font-mono">${sanitize(kunde.ustId)}</span></div>` : ''}
                            ${projektName ? `<div class="flex justify-between"><span class="text-gray-500">Projekt:</span> <span class="font-medium truncate max-w-[110px]">${sanitize(projektName)}</span></div>` : ''}
                        </div>
                    </div>

                    <!-- Titel -->
                    <div class="mb-3">
                        <h2 class="text-base font-bold text-black uppercase tracking-wider">
                            ${isAngebot ? 'Angebot' : 'Rechnung'} ${sanitize(rech.nr)}
                        </h2>
                        ${projektName ? `<p class="text-xs text-gray-600 mt-0.5">Projekt: ${sanitize(projektName)}</p>` : ''}
                    </div>

                    ${vortextHtml ? `<div class="mb-3 text-xs text-gray-800 leading-relaxed">${vortextHtml}</div>` : ''}

                    <!-- Positionstabelle -->
                    <div class="mb-4">
                        <table class="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr class="border-y border-black text-[10px] uppercase tracking-widest text-gray-600">
                                    <th class="py-2 pl-2 text-center w-8">Pos.</th>
                                    <th class="py-2 px-2">Bezeichnung</th>
                                    <th class="py-2 px-2 text-center w-20">Menge</th>
                                    <th class="py-2 px-2 text-right w-24">${einzelpreisLabel}</th>
                                    <th class="py-2 px-2 text-right w-16">MwSt</th>
                                    <th class="py-2 px-2 text-right w-16">Rabatt</th>
                                    <th class="py-2 pr-2 text-right w-24">${gesamtLabel}</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200 text-black">
                                ${itemsHtml}
                            </tbody>
                        </table>
                    </div>

                    <!-- Flex Spacer: Füllt den Leerraum dynamisch aus und schiebt den Abschlussblock nach unten -->
                    <div class="flex-1 min-h-[16px]"></div>

                    <!-- Abschlussbereich: Zahlungsbedingungen, Hinweise & Summenblock -->
                    <div class="mt-auto">
                        <div class="flex justify-between items-start gap-6 mb-4 avoid-break pdf-no-break" style="break-inside: avoid; page-break-inside: avoid;">
                            <div class="flex-1 space-y-2.5">
                                ${isAngebot ? `
                                <div class="text-xs text-gray-700 border-l-2 border-black pl-3 leading-relaxed">
                                    <p class="font-bold text-black mb-0.5">Konditionen &amp; Gültigkeit:</p>
                                    <p>${getAngebotKonditionenText(rech, `<strong>${faelligStr}</strong>`, customKonditionen)}</p>
                                </div>
                                ` : `
                                <div class="text-xs text-gray-700 border-l-2 border-black pl-3 leading-relaxed">
                                    <p class="font-bold text-black mb-0.5">Zahlungsbedingungen:</p>
                                    <p>Zahlbar bis zum <strong>${faelligStr}</strong> ohne Abzug auf unten genanntes Konto unter Angabe der Rechnungs-Nr. <strong>${sanitize(rech.nr)}</strong>.</p>
                                </div>
                                `}

                                ${legalTextsHtml}

                                ${qrHtml ? `<div class="grayscale opacity-90">${qrHtml}</div>` : ''}
                            </div>

                            <!-- Rechts: Summenblock -->
                            <div class="w-72 flex-shrink-0 text-xs">
                                ${totalsHtml}
                                <div class="mt-2.5 pt-2 border-t-2 border-black flex justify-between items-baseline font-bold text-base">
                                    <span>${totalBoxLabel}</span>
                                    <span class="font-mono text-lg">${formatCurrency(zahlbetragNumerical)}</span>
                                </div>
                            </div>
                        </div>

                        ${fusstextHtml ? `<div class="mb-3 text-xs text-gray-800 leading-relaxed pdf-no-break" style="break-inside: avoid; page-break-inside: avoid;">${fusstextHtml}</div>` : ''}
                    </div>
                </div>

                <!-- Fußzeile -->
                <div class="pt-3 border-t border-gray-300 text-[9px] text-gray-500 grid grid-cols-3 gap-6 uppercase tracking-wider leading-relaxed pdf-footer avoid-break mt-auto" style="break-inside: avoid; page-break-inside: avoid;">
                    <div>
                        <p class="text-black font-bold mb-0.5">Unternehmen</p>
                        <p>${sanitize(state.einstellungen.firmenname)}</p>
                        ${state.einstellungen.adresse ? `<p class="mt-0.5">${sanitize(state.einstellungen.adresse).replace(/\n/g, '<br>')}</p>` : ''}
                    </div>
                    <div>
                        <p class="text-black font-bold mb-0.5">Bankverbindung</p>
                        <p>${sanitize(state.einstellungen.bankname)}</p>
                        <p class="font-mono">IBAN: ${formattedIban}</p>
                        <p class="font-mono">BIC: ${sanitize(state.einstellungen.bic)}</p>
                    </div>
                    <div>
                        <p class="text-black font-bold mb-0.5">Rechtliches</p>
                        <p>Steuernummer / USt-IdNr:</p>
                        <p class="font-mono">${sanitize(state.einstellungen.steuer)}</p>
                    </div>
                </div>
            </div>
        `;
    } else {
        // Standard / Klassisch (DIN 5008 konform)
        templateHtml = `
            <div id="invoice-paper" class="invoice-paper max-w-4xl mx-auto bg-white text-slate-800 font-sans flex flex-col justify-between relative" style="min-height: calc(297mm - 24mm);">
                <div class="flex-1 flex flex-col">
                    <!-- Briefkopf DIN 5008: Logo links, Firmendaten rechts -->
                    <div class="flex justify-between items-start pb-3 border-b border-slate-200 mb-5">
                        <div class="max-w-[45%]">
                            ${logoHtml ? logoHtml : `<h1 class="text-xl font-black tracking-tight text-slate-900 uppercase">${sanitize(state.einstellungen.firmenname)}</h1>`}
                        </div>
                        <div class="text-right text-xs text-slate-600 space-y-0.5 leading-tight">
                            <p class="font-bold text-slate-800 text-sm">${sanitize(state.einstellungen.firmenname)}</p>
                            ${state.einstellungen.adresse ? `<p>${sanitize(state.einstellungen.adresse).replace(/\n/g, '<br>')}</p>` : ''}
                        </div>
                    </div>

                    <!-- Anschriftenfeld & Infoblock (DIN 5008) -->
                    <div class="flex justify-between items-start mb-5 gap-6">
                        <!-- Anschrift Empfänger -->
                        <div class="w-1/2 pt-1">
                            <p class="text-[9px] text-slate-400 font-medium tracking-wide border-b border-slate-200/80 pb-1 mb-2">${absenderInline}</p>
                            <div class="text-slate-800 leading-snug text-xs">
                                <p class="font-bold text-sm text-slate-900 mb-1">${empfaengerName}</p>
                                ${empfaengerAdresse ? `<p class="text-slate-700">${empfaengerAdresse}</p>` : ''}
                                ${empfaengerPlzOrt ? `<p class="text-slate-700 font-medium">${empfaengerPlzOrt}</p>` : ''}
                            </div>
                        </div>

                        <!-- Infoblock nach DIN 5008 -->
                        <div class="w-64 bg-slate-50/90 p-3 rounded-lg border border-slate-200/70 text-xs text-slate-600 space-y-1.5 shadow-sm">
                            <div class="flex justify-between border-b border-slate-200/50 pb-1">
                                <span class="text-slate-500 font-medium">${isAngebot ? 'Angebots-Nr.:' : 'Rechnungs-Nr.:'}</span>
                                <span class="font-bold text-slate-900 font-mono">${sanitize(rech.nr)}</span>
                            </div>
                            <div class="flex justify-between border-b border-slate-200/50 pb-1">
                                <span class="text-slate-500">${datumLabel}</span>
                                <span class="font-medium text-slate-800">${datumStr}</span>
                            </div>
                            ${!isAngebot ? `
                            <div class="flex justify-between border-b border-slate-200/50 pb-1">
                                <span class="text-slate-500">Leistungsdatum:</span>
                                <span class="font-medium text-slate-800">${leistungsdatumStr}</span>
                            </div>` : (ausfuehrungStr ? `
                            <div class="flex justify-between border-b border-slate-200/50 pb-1">
                                <span class="text-slate-500">Voraussichtl. Ausführung:</span>
                                <span class="font-medium text-slate-800">${ausfuehrungStr}</span>
                            </div>` : '')}
                            <div class="flex justify-between border-b border-slate-200/50 pb-1">
                                <span class="text-slate-500">Kundennummer:</span>
                                <span class="font-medium text-slate-800 font-mono">${kundenNr}</span>
                            </div>
                            <div class="flex justify-between border-b border-slate-200/50 pb-1">
                                <span class="text-slate-500">${isAngebot ? 'Gültig bis:' : 'Fällig am:'}</span>
                                <span class="font-bold text-slate-900">${faelligStr}</span>
                            </div>
                            ${kunde.ustId ? `
                            <div class="flex justify-between border-b border-slate-200/50 pb-1">
                                <span class="text-slate-500">Ihre USt-IdNr.:</span>
                                <span class="font-medium text-slate-800 font-mono">${sanitize(kunde.ustId)}</span>
                            </div>` : ''}
                            ${projektName ? `
                            <div class="flex justify-between pt-0.5">
                                <span class="text-slate-500">Projekt:</span>
                                <span class="font-medium text-slate-800 truncate max-w-[120px]" title="${sanitize(projektName)}">${sanitize(projektName)}</span>
                            </div>` : ''}
                        </div>
                    </div>

                    <!-- Titel & Betreffzeile -->
                    <div class="mb-3">
                        <h2 class="text-lg font-bold text-slate-900 tracking-tight">
                            ${isAngebot ? 'Angebot' : 'Rechnung'} <span class="text-slate-500 font-normal">#${sanitize(rech.nr)}</span>
                        </h2>
                        ${projektName ? `<p class="text-xs text-slate-600 mt-0.5 font-medium">Bauvorhaben / Projekt: ${sanitize(projektName)}</p>` : ''}
                    </div>

                    ${vortextHtml ? `<div class="mb-3 text-xs text-slate-700 leading-relaxed">${vortextHtml}</div>` : ''}

                    <!-- Positionstabelle -->
                    <div class="overflow-hidden mb-4">
                        <table class="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr class="border-y border-slate-700 text-slate-700 font-semibold uppercase tracking-wider text-[10px] bg-slate-50/50">
                                    <th class="py-2 pl-2 text-center w-8">Pos.</th>
                                    <th class="py-2 px-2">Bezeichnung</th>
                                    <th class="py-2 px-2 text-center w-20">Menge</th>
                                    <th class="py-2 px-2 text-right w-24">${einzelpreisLabel}</th>
                                    <th class="py-2 px-2 text-right w-16">MwSt</th>
                                    <th class="py-2 px-2 text-right w-16">Rabatt</th>
                                    <th class="py-2 pr-2 text-right w-24">${gesamtLabel}</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100 text-slate-700">
                                ${itemsHtml}
                            </tbody>
                        </table>
                    </div>

                    <!-- Flex Spacer: Füllt den Leerraum dynamisch aus und schiebt den Abschlussblock nach unten -->
                    <div class="flex-1 min-h-[16px]"></div>

                    <!-- Abschlussbereich: Zahlungsbedingungen, Hinweise & Summenblock -->
                    <div class="mt-auto">
                        <div class="flex justify-between items-start gap-6 mb-4 avoid-break pdf-no-break" style="break-inside: avoid; page-break-inside: avoid;">
                            <!-- Links: Zahlungsbedingungen, Gesetzliche Hinweise & GiroCode -->
                            <div class="flex-1 space-y-2.5">
                                ${isAngebot ? `
                                <div class="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200/70 leading-relaxed">
                                    <p class="font-semibold text-slate-800 mb-0.5">Konditionen &amp; Gültigkeit:</p>
                                    <p>${getAngebotKonditionenText(rech, `<strong class="text-slate-900">${faelligStr}</strong>`, customKonditionen)}</p>
                                </div>
                                ` : `
                                <div class="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200/70 leading-relaxed">
                                    <p class="font-semibold text-slate-800 mb-0.5">Zahlungsbedingungen:</p>
                                    <p>Bitte überweisen Sie den Betrag bis zum <strong class="text-slate-900">${faelligStr}</strong> auf das unten angegebene Bankkonto unter Angabe der Rechnungsnummer <strong class="text-slate-900 font-mono">${sanitize(rech.nr)}</strong>.</p>
                                </div>
                                `}

                                ${legalTextsHtml}

                                ${qrHtml}
                            </div>

                            <!-- Rechts: Summenblock -->
                            <div class="w-72 flex-shrink-0 bg-slate-50/90 rounded-xl p-3 border border-slate-200/70 shadow-sm text-xs">
                                ${totalsHtml}
                                <div class="mt-2.5 pt-2 border-t-2 border-slate-800 flex justify-between items-baseline">
                                    <span class="font-bold text-xs text-slate-900 uppercase tracking-wider">${totalBoxLabel}</span>
                                    <span class="font-black text-lg text-slate-900 font-mono">${formatCurrency(zahlbetragNumerical)}</span>
                                </div>
                            </div>
                        </div>

                        ${fusstextHtml ? `<div class="mb-3 text-xs text-slate-700 leading-relaxed pdf-no-break" style="break-inside: avoid; page-break-inside: avoid;">${fusstextHtml}</div>` : ''}
                    </div>
                </div>

                <!-- Fußzeile (DIN 5008 3-Spalten) -->
                <div class="pt-3 border-t border-slate-200 text-[10px] text-slate-500 grid grid-cols-3 gap-6 leading-snug pdf-footer avoid-break mt-auto" style="break-inside: avoid; page-break-inside: avoid;">
                    <div>
                        <p class="font-bold text-slate-700 uppercase tracking-wider text-[9px] mb-0.5">Unternehmen</p>
                        <p class="font-medium text-slate-800">${sanitize(state.einstellungen.firmenname)}</p>
                        ${state.einstellungen.adresse ? `<p class="text-slate-600 mt-0.5">${sanitize(state.einstellungen.adresse).replace(/\n/g, '<br>')}</p>` : ''}
                    </div>
                    <div>
                        <p class="font-bold text-slate-700 uppercase tracking-wider text-[9px] mb-0.5">Bankverbindung</p>
                        <p class="font-medium text-slate-800">${sanitize(state.einstellungen.bankname)}</p>
                        <p class="font-mono text-slate-700">IBAN: ${formattedIban}</p>
                        <p class="font-mono text-slate-700">BIC: ${sanitize(state.einstellungen.bic)}</p>
                    </div>
                    <div>
                        <p class="font-bold text-slate-700 uppercase tracking-wider text-[9px] mb-0.5">Rechtliches & Steuer</p>
                        <p>Steuernummer / USt-IdNr.:</p>
                        <p class="font-medium text-slate-800 font-mono">${sanitize(state.einstellungen.steuer)}</p>
                    </div>
                </div>
            </div>
        `;
    }

    return templateHtml;
}


    if (typeof window !== 'undefined') window.formatGermanDate = formatGermanDate;
    if (typeof window !== 'undefined') window.formatIban = formatIban;
    if (typeof window !== 'undefined') window.getAngebotKonditionenText = getAngebotKonditionenText;
    if (typeof window !== 'undefined') window.buildInvoiceDocumentHtml = buildInvoiceDocumentHtml;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { formatGermanDate, formatIban, getAngebotKonditionenText, buildInvoiceDocumentHtml };
    }
})();
