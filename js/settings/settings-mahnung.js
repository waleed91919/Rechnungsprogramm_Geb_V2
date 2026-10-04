(function() {
async function generateMahnungPdf(id) {
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

function closeMahnungModal() {
    const modal = document.getElementById('mahnung-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

async function confirmMahnungLevel() {
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
                    <div class="flex items-center gap-3.5 p-2.5 bg-slate-50 rounded-lg border border-slate-200/70 w-full">
                        <img src="${qrDataUrl}" class="w-28 h-28 rounded bg-white p-1 border border-slate-200 shrink-0" style="width: 28mm; height: 28mm;" alt="GiroCode">
                        <div class="text-xs text-slate-600 flex-1 leading-snug">
                            <p class="font-bold text-slate-800 mb-1 flex items-center gap-1.5 text-xs">
                                <span class="material-symbols-outlined text-[15px] text-primary">qr_code_scanner</span>
                                GiroCode / Überweisung
                            </p>
                            <p class="text-[11px] text-slate-600 leading-snug mb-1">
                                Mit Banking-App scannen &amp; ${formatCurrency(newZahlbetrag)} direkt überweisen.
                            </p>
                            <p class="text-[10px] text-slate-400">
                                Rechnungsnummer &amp; Mahnbetrag werden direkt übernommen.
                            </p>
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
            (sanitize(state.einstellungen.firmenname) + " • " + sanitize(state.einstellungen.adresse).replace(/[\r\n]+/g, ' • ')) :
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

function generateMahnungItemsHtml(rech, MAHNGEBUHR) {
    let itemsHtml = '';
    rech.positionen.forEach((pos, i) => {
        const artId = parseInt(pos.artikelId);
        const art = state.artikel.find(a => parseInt(a.id) === artId) || {};
        const rabatt = parseFloat(pos.rabatt) || 0;
        const gesamt = (pos.menge * pos.preis) * (1 - rabatt / 100);

        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-100 text-xs avoid-break pdf-no-break';
        tr.style.pageBreakInside = 'avoid';
        tr.style.breakInside = 'avoid';

        const tdIdx = document.createElement('td');
        tdIdx.className = 'py-2 pl-2 text-center text-slate-400 font-mono text-[11px]';
        tdIdx.textContent = i + 1;
        tr.appendChild(tdIdx);

        const tdName = document.createElement('td');
        tdName.className = 'py-2 px-2 font-medium text-slate-900';
        tdName.textContent = art.name || pos.name || 'Position';
        tr.appendChild(tdName);

        const tdMenge = document.createElement('td');
        tdMenge.className = 'py-2 px-2 text-center tabular-nums text-slate-700';
        tdMenge.textContent = `${pos.menge} ${pos.einheit || 'Stk.'}`;
        tr.appendChild(tdMenge);

        const tdPreis = document.createElement('td');
        tdPreis.className = 'py-2 px-2 text-right tabular-nums text-slate-700 font-mono';
        tdPreis.textContent = formatCurrency(pos.preis);
        tr.appendChild(tdPreis);

        const global13b = Boolean(rech.unterliegt_13b || rech.isGlobal13b);
        const isPos13b = (pos.is13b !== undefined && pos.is13b !== null) ? Boolean(pos.is13b) : global13b;

        const tdMwst = document.createElement('td');
        tdMwst.className = 'py-2 px-2 text-right tabular-nums text-slate-500 font-mono';
        tdMwst.textContent = isPos13b ? '§ 13b' : `${pos.mwst}%`;
        tr.appendChild(tdMwst);

        const tdRabatt = document.createElement('td');
        tdRabatt.className = 'py-2 px-2 text-right tabular-nums font-mono ' + (rabatt > 0 ? 'text-emerald-600 font-medium' : 'text-slate-300');
        tdRabatt.textContent = rabatt > 0 ? `-${rabatt}%` : '-';
        tr.appendChild(tdRabatt);

        const tdGesamt = document.createElement('td');
        tdGesamt.className = 'py-2 pr-2 text-right tabular-nums font-medium text-slate-900 font-mono';
        tdGesamt.textContent = formatCurrency(gesamt);
        tr.appendChild(tdGesamt);

        itemsHtml += tr.outerHTML;
    });

    // Add Mahngebühr as a line item
    if (MAHNGEBUHR > 0) {
        itemsHtml += `
            <tr class="border-b border-amber-200 text-xs bg-amber-50/60 font-semibold text-amber-900 avoid-break pdf-no-break" style="page-break-inside: avoid; break-inside: avoid;">
                <td class="py-2 pl-2 text-center text-amber-600 font-mono">*</td>
                <td class="py-2 px-2 text-amber-950">Mahngebühr / Verzugspauschale</td>
                <td class="py-2 px-2 text-center tabular-nums">1 Stk.</td>
                <td class="py-2 px-2 text-right tabular-nums font-mono">${formatCurrency(MAHNGEBUHR)}</td>
                <td class="py-2 px-2 text-right tabular-nums font-mono text-slate-500">0%</td>
                <td class="py-2 px-2 text-right tabular-nums font-mono text-slate-300">-</td>
                <td class="py-2 pr-2 text-right tabular-nums font-mono font-bold text-amber-900">${formatCurrency(MAHNGEBUHR)}</td>
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
            origFaelligStr = formatGermanDate(rech.faellig);
        } else {
            const tempDate = new Date(rech.datum);
            tempDate.setDate(tempDate.getDate() + 14);
            origFaelligStr = formatGermanDate(tempDate);
        }
    } catch (e) {
        console.warn("Konnte Fälligkeitsdatum nicht parsen", e);
    }

    let title = "1. Mahnung (Zahlungserinnerung)";
    let textHeader = "Zahlungserinnerung";
    let textBody = `bisher konnten wir leider keinen Zahlungseingang für die unten aufgeführte Rechnung verzeichnen. Sicherlich handelt es sich hierbei nur um ein Versehen. Der Betrag war ursprünglich zum <strong>${origFaelligStr}</strong> fällig.`;
    let colorClass = "amber";

    if (level === 2) {
        title = "2. Mahnung";
        textHeader = "Ausdrückliche Mahnung";
        textBody = `trotz unserer ersten Zahlungserinnerung konnten wir bisher keinen Zahlungseingang für die unten aufgeführte Rechnung feststellen. Der Rechnungsbetrag war am <strong>${origFaelligStr}</strong> fällig. Gemäß unseren Zahlungsbedingungen berechnen wir eine Mahngebühr in Höhe von <strong>${formatCurrency(MAHNGEBUHR)}</strong>.`;
        colorClass = "orange";
    } else if (level === 3) {
        title = "3. & letzte Mahnung";
        textHeader = "Letzte Mahnung vor Übergabe an Inkasso";
        textBody = `auf unsere bisherigen Zahlungserinnerungen und Mahnungen haben Sie leider nicht reagiert. Wir fordern Sie hiermit letztmalig auf, den offenen Gesamtbetrag einschließlich Mahngebühren unverzüglich zu begleichen. Sollte bis zum unten angegebenen Datum kein Zahlungseingang erfolgen, werden wir das gerichtliche Mahnverfahren bzw. ein Inkassobüro beauftragen. Hierdurch entstehen erhebliche Zusatzkosten.`;
        colorClass = "red";
    }

    const colorHex = colorClass === "amber" ? "#d97706" : (colorClass === "orange" ? "#ea580c" : "#dc2626");
    const mahnungsNr = `${rech.nr}-M${level}`;
    const formattedIban = formatIban(state.einstellungen.iban);

    const empfaengerName = sanitize((kunde && kunde.name) || 'Sehr geehrte Damen und Herren');
    const empfaengerAdresse = sanitize((kunde && kunde.adresse) || '').replace(/[\r\n]+/g, '<br>');
    const empfaengerPlzOrt = `${sanitize((kunde && kunde.plz) || '')} ${sanitize((kunde && kunde.ort) || '')}`.trim();
    const kundenNr = (kunde && kunde.kundennummer) || (kunde && kunde.id ? `KD-${String(kunde.id).padStart(5, '0')}` : '-');

    return `
        <div id="invoice-paper" class="invoice-paper max-w-4xl mx-auto bg-white text-slate-800 font-sans flex flex-col justify-between relative" style="min-height: calc(297mm - 24mm);">
            <div class="flex-1 flex flex-col">
                <!-- Briefkopf: Logo links, Firmendaten rechts -->
                <div class="flex justify-between items-start pb-3 border-b border-slate-200 mb-5">
                    <div class="max-w-[45%]">
                        ${logoHtml ? logoHtml : `<h1 class="text-xl font-bold tracking-tight text-slate-900">${sanitize(state.einstellungen.firmenname)}</h1>`}
                    </div>
                    <div class="text-right text-xs text-slate-600 space-y-0.5 leading-tight">
                        <p class="font-bold text-slate-900 text-sm">${sanitize(state.einstellungen.firmenname)}</p>
                        ${state.einstellungen.adresse ? `<p>${sanitize(state.einstellungen.adresse).replace(/\n/g, '<br>')}</p>` : ''}
                        ${state.einstellungen.telefon ? `<p><span class="text-slate-400">Tel:</span> ${sanitize(state.einstellungen.telefon)}</p>` : ''}
                        ${state.einstellungen.email ? `<p><span class="text-slate-400">E-Mail:</span> ${sanitize(state.einstellungen.email)}</p>` : ''}
                    </div>
                </div>

                <!-- Anschriftenfeld & Infoblock (DIN 5008) -->
                <div class="flex justify-between items-start mb-5 gap-6">
                    <!-- Anschrift Empfänger (85mm x 45mm Zone) -->
                    <div class="w-1/2 pt-1">
                        <p class="text-[9px] text-slate-400 font-semibold tracking-wider uppercase border-b border-slate-300 pb-1 mb-2 truncate" title="${absenderInline}">${absenderInline}</p>
                        <div class="text-slate-800 leading-snug text-xs">
                            <p class="font-bold text-sm text-slate-900 mb-1">${empfaengerName}</p>
                            ${empfaengerAdresse ? `<p class="text-slate-700">${empfaengerAdresse}</p>` : ''}
                            ${empfaengerPlzOrt ? `<p class="text-slate-700 font-medium">${empfaengerPlzOrt}</p>` : ''}
                            ${kunde && kunde.land && kunde.land !== 'Deutschland' ? `<p class="font-semibold uppercase text-[10px] text-slate-600 mt-0.5">${sanitize(kunde.land)}</p>` : ''}
                        </div>
                    </div>

                    <!-- Infoblock -->
                    <div class="w-64 bg-slate-50 rounded-lg p-3 border border-slate-200/80 text-xs space-y-1.5 flex-shrink-0">
                        <div class="flex justify-between border-b border-slate-200/60 pb-1">
                            <span class="text-slate-500">Mahn-Nr.:</span>
                            <span class="font-bold text-slate-900 font-mono">${mahnungsNr}</span>
                        </div>
                        <div class="flex justify-between border-b border-slate-200/60 pb-1">
                            <span class="text-slate-500">Mahndatum:</span>
                            <span class="font-medium text-slate-800">${datumStr}</span>
                        </div>
                        <div class="flex justify-between border-b border-slate-200/60 pb-1">
                            <span class="text-slate-500">Rechnungs-Nr.:</span>
                            <span class="font-bold text-slate-900 font-mono">${sanitize(rech.nr)}</span>
                        </div>
                        <div class="flex justify-between border-b border-slate-200/60 pb-1">
                            <span class="text-slate-500">Rechnungsdatum:</span>
                            <span class="font-medium text-slate-800">${origRechDatum}</span>
                        </div>
                        <div class="flex justify-between border-b border-slate-200/60 pb-1">
                            <span class="text-slate-500">Kundennummer:</span>
                            <span class="font-medium text-slate-800 font-mono">${kundenNr}</span>
                        </div>
                        <div class="flex justify-between pt-0.5">
                            <span class="text-slate-500 font-semibold">Neues Zahlungsziel:</span>
                            <span class="font-bold" style="color: ${colorHex}">${faelligStr}</span>
                        </div>
                    </div>
                </div>

                <!-- Titel & Betreffzeile -->
                <div class="mb-3">
                    <h2 class="text-lg font-bold tracking-tight" style="color: ${colorHex}">
                        ${title} <span class="text-slate-500 font-normal">zu Rechnung #${sanitize(rech.nr)}</span>
                    </h2>
                </div>

                <!-- Mahnschreiben Textblock -->
                <div class="mb-4 p-3 rounded-lg text-slate-800 text-xs leading-relaxed border-l-4 shadow-sm" style="background-color: ${colorHex}0c; border-color: ${colorHex}">
                    <p class="font-bold mb-1" style="color: ${colorHex}">${textHeader}</p>
                    <p>Sehr geehrte Damen und Herren,</p>
                    <p class="mt-1">${textBody}</p>
                    <p class="mt-1.5 font-medium">Bitte überweisen Sie den neuen Gesamtbetrag von <strong>${formatCurrency(newZahlbetrag)}</strong> bis spätestens zum <strong style="color: ${colorHex}">${faelligStr}</strong> auf das unten aufgeführte Bankkonto.</p>
                </div>

                <!-- Positionstabelle -->
                <div class="overflow-hidden mb-4">
                    <table class="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr class="border-y border-slate-700 text-slate-700 font-semibold uppercase tracking-wider text-[10px] bg-slate-50/50">
                                <th class="py-2 pl-2 text-center w-8">Pos.</th>
                                <th class="py-2 px-2">Bezeichnung</th>
                                <th class="py-2 px-2 text-center w-20">Menge</th>
                                <th class="py-2 px-2 text-right w-24">Einzelpreis</th>
                                <th class="py-2 px-2 text-right w-16">MwSt</th>
                                <th class="py-2 px-2 text-right w-16">Rabatt</th>
                                <th class="py-2 pr-2 text-right w-24">Gesamt</th>
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
                        <div class="flex-1">
                            ${qrHtml}
                        </div>

                        <div class="w-72 flex-shrink-0 bg-slate-50/90 rounded-xl p-3 border border-slate-200/70 shadow-sm text-xs space-y-1.5">
                            <div class="flex justify-between text-slate-600">
                                <span>Offener Rechnungsbetrag:</span>
                                <span class="tabular-nums font-mono">${formatCurrency(currentZahlbetrag)}</span>
                            </div>
                            ${MAHNGEBUHR > 0 ? `
                            <div class="flex justify-between" style="color: ${colorHex}">
                                <span>+ Mahngebühr:</span>
                                <span class="tabular-nums font-mono font-medium">${formatCurrency(MAHNGEBUHR)}</span>
                            </div>` : ''}
                            <div class="mt-2 pt-2 border-t-2 border-slate-800 flex justify-between items-baseline">
                                <span class="font-bold text-xs uppercase tracking-wider text-slate-900">Zu zahlender Betrag</span>
                                <span class="font-black text-lg font-mono" style="color: ${colorHex}">${formatCurrency(newZahlbetrag)}</span>
                            </div>
                        </div>
                    </div>
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


    if (typeof window !== 'undefined') window.generateMahnungPdf = generateMahnungPdf;
    if (typeof window !== 'undefined') window.closeMahnungModal = closeMahnungModal;
    if (typeof window !== 'undefined') window.confirmMahnungLevel = confirmMahnungLevel;
    if (typeof window !== 'undefined') window.generateMahnungItemsHtml = generateMahnungItemsHtml;
    if (typeof window !== 'undefined') window.buildMahnungHtmlTemplate = buildMahnungHtmlTemplate;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { generateMahnungPdf, closeMahnungModal, confirmMahnungLevel, generateMahnungItemsHtml, buildMahnungHtmlTemplate };
    }
})();
