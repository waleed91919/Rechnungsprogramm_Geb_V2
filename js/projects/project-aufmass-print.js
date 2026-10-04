(function(global) {

function generateAufmassDocumentHtml({ projekt, blatt, zeilen = [], typ = 'FREI', variante = 'TEILAUFMASS', isSchlussaufmass = false, allPositions = [] }) {
    const firma = state.einstellungen || {};
    const firmenName = sanitize(firma.firmenname || 'Handwerksbetrieb');
    const firmenStrasse = sanitize(firma.strasse || '');
    const firmenPlzOrt = sanitize(`${firma.plz || ''} ${firma.ort || ''}`.trim());
    const firmenTel = sanitize(firma.telefon || '');
    const firmenEmail = sanitize(firma.email || '');
    const firmenSteuer = sanitize(firma.steuernummer || firma.steuer || '');

    const pName = sanitize(projekt ? projekt.name : 'Bauvorhaben');
    const pNr = sanitize(projekt ? (projekt.nummer || `PRJ-${projekt.id}`) : '-');
    const pKunde = sanitize(projekt && projekt.kunde_name ? projekt.kunde_name : (projekt && projekt.kunde ? (typeof projekt.kunde === 'string' ? projekt.kunde : (projekt.kunde.name || 'Kunde')) : 'Auftraggeber'));
    const pDatum = new Date().toLocaleDateString('de-DE');

    let docTitle = 'AUFMASSBLATT & MENGENBERECHNUNG';
    let docSubtitle = 'Nach REB 23.003 / VOB Teil C - Prüffähige Mengenermittlung';
    let badgeText = blatt ? (blatt.blatt_nummer || 'AUF-001') : 'AUFMASS';

    if (isSchlussaufmass || (blatt && blatt.titel && blatt.titel.includes('Schlussaufmaß'))) {
        docTitle = 'SCHLUSSAUFMASS & GESAMTABNAHME';
        docSubtitle = 'Gesamtaufmaß & Abrechnungsprotokoll aller Projektpositionen nach VOB/B § 14';
        badgeText = 'SCHLUSSAUFMASS';
    } else if (typ === 'SPALTEN' || (blatt && blatt.titel && blatt.titel.includes('Spaltenaufmaß'))) {
        docTitle = 'SPALTENAUFMASS (REB 23.003)';
        docSubtitle = 'Detailliertes Spaltenaufmaß mit Faktoren, Zu- und Abschlägen';
        badgeText = 'SPALTENAUFMASS';
    } else if (typ === 'RAUM' || (blatt && blatt.titel && blatt.titel.includes('Raumaufmaß'))) {
        docTitle = 'RAUMAUFMASS & FLÄCHENNACHWEIS';
        docSubtitle = 'Mengenberechnung gegliedert nach Geschoss & Räumen';
        badgeText = 'RAUMAUFMASS';
    } else if (variante === 'EINZELAUFMASS' || (blatt && blatt.titel && blatt.titel.includes('Einzelaufmaß'))) {
        docTitle = 'EINZELAUFMASS & MENGENNACHWEIS';
        docSubtitle = 'Prüffähiger Einzelnachweis für spezifische Leistungsbereiche';
        badgeText = 'EINZELAUFMASS';
    }

    let rowsHtml = '';
    let totalSum = 0;

    if (isSchlussaufmass && allPositions && allPositions.length > 0) {
        // Render summary table comparing all positions
        rowsHtml = `
            <table class="w-full text-left border-collapse mb-3">
                <thead>
                    <tr class="border-b-2 border-slate-800 bg-slate-100 text-slate-700 text-[10px] font-bold uppercase">
                        <th class="py-1.5 px-2.5">OZ</th>
                        <th class="py-1.5 px-2.5">Leistungsbezeichnung</th>
                        <th class="py-1.5 px-2.5 text-center">Einheit</th>
                        <th class="py-1.5 px-2.5 text-right">Soll-Menge</th>
                        <th class="py-1.5 px-2.5 text-right">Aufmaß (Ist)</th>
                        <th class="py-1.5 px-2.5 text-right">Differenz</th>
                        <th class="py-1.5 px-2.5 text-center">Status</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-200 text-xs">
                    ${allPositions.map(pos => {
                        const soll = pos.mengeSoll || pos.soll_menge || 0;
                        const ist = pos.mengeIst !== undefined ? pos.mengeIst : (pos.summe_menge !== undefined ? pos.summe_menge : 0);
                        const diff = ist - soll;
                        const diffColor = diff > 0 ? 'text-amber-600' : (diff < 0 ? 'text-blue-600' : 'text-slate-600');
                        const statusBadge = ist > 0 ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800">Erfasst</span>' : '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500">Offen</span>';
                        return `
                            <tr class="hover:bg-slate-50/80">
                                <td class="py-1.5 px-2.5 font-mono font-bold text-primary">${sanitize(pos.oz || pos.oz_code || '01.01.0010')}</td>
                                <td class="py-1.5 px-2.5 font-semibold text-slate-800">${sanitize(pos.name || pos.bezeichnung || 'Position')}</td>
                                <td class="py-1.5 px-2.5 text-center font-mono text-slate-600">${sanitize(pos.einheit || 'm²')}</td>
                                <td class="py-1.5 px-2.5 text-right font-mono text-slate-500">${soll.toFixed(2)}</td>
                                <td class="py-1.5 px-2.5 text-right font-mono font-bold text-slate-800">${ist.toFixed(2)}</td>
                                <td class="py-1.5 px-2.5 text-right font-mono font-semibold ${diffColor}">${diff >= 0 ? '+' : ''}${diff.toFixed(2)}</td>
                                <td class="py-1.5 px-2.5 text-center">${statusBadge}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    } else {
        // Render detail calculation lines
        rowsHtml = `
            <table class="w-full text-left border-collapse mb-3">
                <thead>
                    <tr class="border-b-2 border-slate-800 bg-slate-100 text-slate-700 text-[10px] font-bold uppercase">
                        <th class="py-1.5 px-2.5 w-10 text-center">#</th>
                        <th class="py-1.5 px-2.5 w-24">OZ Code</th>
                        <th class="py-1.5 px-2.5">Raum / Bauteil / Erläuterung</th>
                        <th class="py-1.5 px-2.5">Rechenansatz / Formel (REB 23.003)</th>
                        <th class="py-1.5 px-2.5 w-16 text-center">Vorzeichen</th>
                        <th class="py-1.5 px-2.5 w-24 text-right">Ergebnis</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-200 text-xs">
                    ${(zeilen || []).map((z, idx) => {
                        const lineErg = (z.ergebnis || 0) * (z.vorzeichen !== undefined ? z.vorzeichen : 1);
                        totalSum += lineErg;
                        const isMinus = (z.vorzeichen === -1) || lineErg < 0;
                        const vzBadge = isMinus 
                            ? '<span class="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-700 font-mono">− Abzug</span>' 
                            : '<span class="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700 font-mono">+ Plus</span>';

                        return `
                            <tr class="hover:bg-slate-50/80">
                                <td class="py-1.5 px-2.5 text-center font-mono text-slate-400">${idx + 1}</td>
                                <td class="py-1.5 px-2.5 font-mono font-bold text-primary">${sanitize(z.oz_code || '01.01.0010')}</td>
                                <td class="py-1.5 px-2.5 text-slate-800 font-medium">${sanitize(z.bezeichnung || 'Fläche')}</td>
                                <td class="py-1.5 px-2.5 font-mono font-semibold text-indigo-900 bg-slate-50/50">${sanitize(z.rechenansatz || '-')}</td>
                                <td class="py-1.5 px-2.5 text-center">${vzBadge}</td>
                                <td class="py-1.5 px-2.5 text-right font-mono font-bold ${lineErg < 0 ? 'text-rose-600' : 'text-slate-800'}">
                                    ${lineErg.toFixed(2)} ${sanitize(z.einheit || 'm²')}
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    const defaultUnit = (zeilen && zeilen[0] && zeilen[0].einheit) || 'm²';

    return `
        <div id="invoice-paper" class="invoice-paper p-6 max-w-4xl mx-auto bg-white text-slate-800 flex flex-col justify-between relative shadow-lg my-2 rounded-xl border border-slate-200" style="font-family: 'Inter', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; min-height: 260mm; box-sizing: border-box;">
            <div>
                <!-- Kopfbereich -->
                <div class="flex justify-between items-start border-b border-slate-200 pb-3 mb-3">
                    <div>
                        <span class="inline-block px-2 py-0.5 bg-primary text-white text-[10px] font-black uppercase rounded tracking-wider mb-1">${badgeText}</span>
                        <h1 class="text-xl font-black text-slate-900 tracking-tight">${docTitle}</h1>
                        <p class="text-[11px] text-slate-500 font-medium mt-0.5">${docSubtitle}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-base font-black text-slate-900">${firmenName}</p>
                        <p class="text-[11px] text-slate-500">${firmenStrasse}</p>
                        <p class="text-[11px] text-slate-500">${firmenPlzOrt}</p>
                        ${firmenTel ? `<p class="text-[11px] text-slate-500">Tel: ${firmenTel}</p>` : ''}
                        ${firmenEmail ? `<p class="text-[11px] text-slate-500">${firmenEmail}</p>` : ''}
                        ${firmenSteuer ? `<p class="text-[10px] text-slate-400 mt-0.5">St.-Nr.: ${firmenSteuer}</p>` : ''}
                    </div>
                </div>

                <!-- Stammdaten Raster -->
                <div class="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 mb-3 text-xs">
                    <div>
                        <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Bauvorhaben / Projekt</span>
                        <p class="font-bold text-slate-800 mt-0.5 text-xs">${pName}</p>
                        <p class="text-slate-500 font-mono text-[11px] mt-0.5">Projekt-Nr.: ${pNr}</p>
                    </div>
                    <div>
                        <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Auftraggeber / Bauherr</span>
                        <p class="font-bold text-slate-800 mt-0.5 text-xs">${pKunde}</p>
                        <p class="text-slate-500 text-[11px] mt-0.5">Aufmaßblatt: ${sanitize(blatt ? blatt.blatt_nummer : '001')}</p>
                    </div>
                    <div>
                        <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Datum / Status</span>
                        <p class="font-bold text-slate-800 mt-0.5 text-xs">Erstellt am: ${pDatum}</p>
                        <p class="text-emerald-700 font-semibold text-[11px] mt-0.5 flex items-center gap-1">
                            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                            Status: ${sanitize(blatt && blatt.status ? blatt.status : 'VERIFIZIERT')}
                        </p>
                    </div>
                </div>

                ${blatt && blatt.titel ? `
                    <div class="mb-3 bg-primary/5 p-2 rounded-md border border-primary/10">
                        <h3 class="text-xs font-bold text-slate-700">Leistungsbereich: <span class="text-primary text-xs font-semibold">${sanitize(blatt.titel)}</span></h3>
                    </div>
                ` : ''}

                <!-- Aufmaß Tabelleninhalt -->
                ${rowsHtml}

                <!-- Gesamtsumme Box (wenn nicht Schlussaufmaß) -->
                ${!isSchlussaufmass ? `
                    <div class="flex justify-end mb-3">
                        <div class="bg-primary/5 border border-primary/20 rounded-lg p-2.5 min-w-[220px] text-right">
                            <span class="text-[9px] uppercase font-bold text-slate-500 block">Gesamtaufmaß Summe:</span>
                            <span class="text-xl font-black font-mono text-primary">${totalSum.toFixed(2)} ${sanitize(defaultUnit)}</span>
                        </div>
                    </div>
                ` : ''}
            </div>

            <!-- Unterschriften & Prüfblock -->
            <div class="border-t border-slate-300 pt-3 mt-3 avoid-break">
                <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Gemeinsame Feststellung & Freigabe (§ 14 VOB/B)</p>
                <div class="grid grid-cols-3 gap-6 text-xs text-slate-600">
                    <div class="border-t border-slate-300 pt-1.5 text-center">
                        <p class="font-bold text-slate-800 text-xs">Aufgestellt</p>
                        <p class="text-[10px] text-slate-400 mt-0.5">Auftragnehmer / Handwerker</p>
                    </div>
                    <div class="border-t border-slate-300 pt-1.5 text-center">
                        <p class="font-bold text-slate-800 text-xs">Geprüft & Gemessen</p>
                        <p class="text-[10px] text-slate-400 mt-0.5">Bauleiter / Architekt</p>
                    </div>
                    <div class="border-t border-slate-300 pt-1.5 text-center">
                        <p class="font-bold text-slate-800 text-xs">Anerkannt</p>
                        <p class="text-[10px] text-slate-400 mt-0.5">Bauherr / Auftraggeber</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function printAufmassBlattAction(blattId) {
    const pId = window.currentViewProjektId;
    if (!pId || !window.api || !window.api.getAufmassBlaetter) return;

    try {
        const blaetter = await window.api.getAufmassBlaetter(pId);
        const blatt = (blaetter || []).find(b => b.id === blattId);
        if (!blatt) {
            showToast('Aufmaßblatt nicht gefunden.', 'error');
            return;
        }

        const projekt = (state.projekte || []).find(p => p.id === pId);
        let typ = 'FREI';
        let variante = 'TEILAUFMASS';
        if (blatt.titel) {
            if (blatt.titel.includes('Spaltenaufmaß')) typ = 'SPALTEN';
            else if (blatt.titel.includes('Raumaufmaß')) typ = 'RAUM';
            if (blatt.titel.includes('Einzelaufmaß')) variante = 'EINZELAUFMASS';
            else if (blatt.titel.includes('Schlussaufmaß')) variante = 'SCHLUSSAUFMASS';
        }

        const html = generateAufmassDocumentHtml({
            projekt,
            blatt,
            zeilen: blatt.zeilen || [],
            typ,
            variante
        });

        const filename = `Aufmass_${blatt.blatt_nummer || blatt.id}_${(projekt ? projekt.name : 'Projekt').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
        openPdfPreview(html, filename);
    } catch (e) {
        console.error('Error printing aufmass blatt:', e);
        showToast('Fehler beim Laden der Aufmaß-Druckvorschau.', 'error');
    }
}

async function printActiveSplitPositionAufmass() {
    const pId = window.currentViewProjektId;
    if (!pId || !activeSplitOz) {
        showToast('Bitte wählen Sie zuerst links eine Position aus.', 'warning');
        return;
    }

    const projekt = (state.projekte || []).find(p => p.id === pId);
    const posName = activeSplitPosition ? activeSplitPosition.name : 'Position';
    const blatt = {
        blatt_nummer: `POS-${activeSplitOz.replace(/[^0-9A-Za-z]/g, '')}`,
        titel: `Detailaufmaß OZ ${activeSplitOz} - ${posName}`,
        status: 'VERIFIZIERT'
    };

    const html = generateAufmassDocumentHtml({
        projekt,
        blatt,
        zeilen: currentSplitZeilen,
        typ: 'FREI',
        variante: 'EINZELAUFMASS'
    });

    const filename = `Einzelaufmass_${activeSplitOz.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    openPdfPreview(html, filename);
}

async function printCurrentAufmassBlattModal() {
    const pId = window.currentViewProjektId;
    const projekt = (state.projekte || []).find(p => p.id === pId);
    const blatt_nummer = document.getElementById('ab-nummer')?.value || '001';
    const titel = document.getElementById('ab-titel')?.value || 'Aufmaßblatt';

    const blatt = {
        blatt_nummer,
        titel,
        status: 'VERIFIZIERT'
    };

    const html = generateAufmassDocumentHtml({
        projekt,
        blatt,
        zeilen: currentAufmassZeilen,
        typ: 'FREI',
        variante: 'TEILAUFMASS'
    });

    const filename = `Aufmass_${blatt_nummer}.pdf`;
    openPdfPreview(html, filename);
}

async function calculateSchlussaufmassForProjekt() {
    const pId = window.currentViewProjektId;
    if (!pId) return;
    try {
        const projekt = (state.projekte || []).find(p => p.id === pId);
        const aggRows = await window.api.mergeSchlussaufmass(pId);
        const blaetter = await window.api.getAufmassBlaetter(pId);

        // Collect all positions with Soll-Mengen
        const posMap = {};
        (splitPositionsData || []).forEach(sp => {
            posMap[sp.oz] = { oz: sp.oz, name: sp.name, mengeSoll: sp.mengeSoll, einheit: sp.einheit, mengeIst: 0 };
        });

        (aggRows || []).forEach(r => {
            if (posMap[r.oz_code]) {
                posMap[r.oz_code].mengeIst = r.summe_menge;
            } else {
                posMap[r.oz_code] = { oz: r.oz_code, name: `Position ${r.oz_code}`, mengeSoll: 0, einheit: r.einheit, mengeIst: r.summe_menge };
            }
        });

        // Collect all individual lines across all sheets
        const allZeilen = [];
        (blaetter || []).forEach(b => {
            (b.zeilen || []).forEach(z => {
                allZeilen.push({ ...z, bezeichnung: `[${b.blatt_nummer}] ${z.bezeichnung || ''}` });
            });
        });

        const allPosList = Object.values(posMap);

        const blatt = {
            blatt_nummer: 'SCHLUSS-01',
            titel: `Schlussaufmaß Gesamtprojekt: ${projekt ? projekt.name : ''}`,
            status: 'FINALISIERT'
        };

        const html = generateAufmassDocumentHtml({
            projekt,
            blatt,
            zeilen: allZeilen,
            typ: 'FREI',
            variante: 'SCHLUSSAUFMASS',
            isSchlussaufmass: true,
            allPositions: allPosList
        });

        const filename = `Schlussaufmass_${(projekt ? projekt.name : 'Projekt').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
        openPdfPreview(html, filename);
    } catch (e) {
        console.error('Error calculating and printing schlussaufmass:', e);
        showToast('Fehler beim Erstellen des Schlussaufmaßes.', 'error');
    }
}



global.generateAufmassDocumentHtml = generateAufmassDocumentHtml;
global.printAufmassBlattAction = printAufmassBlattAction;
global.printActiveSplitPositionAufmass = printActiveSplitPositionAufmass;
global.printCurrentAufmassBlattModal = printCurrentAufmassBlattModal;
global.calculateSchlussaufmassForProjekt = calculateSchlussaufmassForProjekt;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        generateAufmassDocumentHtml,
        printAufmassBlattAction,
        printActiveSplitPositionAufmass,
        printCurrentAufmassBlattModal,
        calculateSchlussaufmassForProjekt
    };
}

})(typeof window !== 'undefined' ? window : this);
