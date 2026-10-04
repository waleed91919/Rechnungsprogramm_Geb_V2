function createRechnungPositionRow(pos, index) {
    const isReadOnly = Boolean(state.isEditorReadOnly);
    const tr = document.createElement('tr');

    // Index cell
    const tdIdx = document.createElement('td');
    tdIdx.className = 'px-2 py-2 text-center text-slate-400 font-mono text-xs';
    tdIdx.textContent = index + 1;
    tr.appendChild(tdIdx);

    // Article search cell
    const tdArt = document.createElement('td');
    tdArt.className = 'px-3 py-2';
    const divRel = document.createElement('div');
    divRel.className = 'relative';
    const spanSearch = document.createElement('span');
    spanSearch.className = 'material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]';
    spanSearch.textContent = 'search';
    const inputArt = document.createElement('input');
    inputArt.type = 'text';
    inputArt.setAttribute('list', 'artikel-datalist');
    inputArt.value = getArtikelName(pos.artikelId, pos.name);
    inputArt.onchange = (e) => handleArtikelAutocomplete(pos.id, e.target.value);
    inputArt.placeholder = 'Artikel suchen...';
    inputArt.className = 'w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-primary focus:border-primary';
    if (isReadOnly) {
        inputArt.disabled = true;
        inputArt.classList.add('bg-slate-100', 'cursor-not-allowed');
    }
    divRel.appendChild(spanSearch);
    divRel.appendChild(inputArt);
    tdArt.appendChild(divRel);

    // Positionstyp & In-Endsumme Steuerung (nur im Angebotsmodus)
    if (state.isAngebotMode) {
        const divTypeWrapper = document.createElement('div');
        divTypeWrapper.className = 'mt-1.5 flex items-center gap-3 text-xs text-slate-500';

        const pType = (pos.positionstyp || 'NORMAL').toUpperCase().trim();
        const inEnd = (pos.in_endsumme_enthalten !== undefined && pos.in_endsumme_enthalten !== null)
            ? (pos.in_endsumme_enthalten === 1 || pos.in_endsumme_enthalten === '1' || pos.in_endsumme_enthalten === true ? 1 : 0)
            : ((pType === 'NORMAL' || pType === 'PAUSCHALE') ? 1 : 0);

        const selType = document.createElement('select');
        selType.className = 'bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-700 font-medium focus:ring-0';
        selType.disabled = isReadOnly;
        ['NORMAL', 'PAUSCHALE', 'ALTERNATIV', 'BEDARF'].forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t.charAt(0) + t.slice(1).toLowerCase();
            if (t === pType) opt.selected = true;
            selType.appendChild(opt);
        });
        selType.onchange = (e) => handlePositionChange(pos.id, 'positionstyp', e.target.value);

        const lblInEnd = document.createElement('label');
        lblInEnd.className = 'flex items-center gap-1 cursor-pointer select-none';
        const cbInEnd = document.createElement('input');
        cbInEnd.type = 'checkbox';
        cbInEnd.checked = (inEnd === 1);
        cbInEnd.disabled = isReadOnly;
        cbInEnd.className = 'rounded border-slate-300 text-primary focus:ring-primary h-3.5 w-3.5';
        cbInEnd.onchange = (e) => handlePositionChange(pos.id, 'in_endsumme_enthalten', e.target.checked ? 1 : 0);
        lblInEnd.appendChild(cbInEnd);
        lblInEnd.appendChild(document.createTextNode(' in Endsumme'));

        divTypeWrapper.appendChild(selType);
        divTypeWrapper.appendChild(lblInEnd);
        tdArt.appendChild(divTypeWrapper);
    }
    tr.appendChild(tdArt);

    // Menge cell mit Einheit & Aufmaß-Button
    const tdMenge = document.createElement('td');
    tdMenge.className = 'px-2 py-2';
    const divMengeWrapper = document.createElement('div');
    divMengeWrapper.className = 'flex items-center rounded-lg border border-slate-300 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary overflow-hidden shadow-sm';

    const currentEinheit = pos.einheit || 'Stk.';
    if (currentEinheit === 'Pauschal') {
        pos.menge = 1;
    }

    const inputMenge = document.createElement('input');
    inputMenge.type = 'number';
    inputMenge.min = '0';
    inputMenge.step = 'any';
    inputMenge.value = pos.menge;
    if (currentEinheit === 'Pauschal' || isReadOnly) {
        inputMenge.disabled = true;
    }
    inputMenge.onblur = (e) => handlePositionChange(pos.id, 'menge', e.target.value);
    inputMenge.className = 'border-none text-right focus:ring-0 w-14 text-sm px-1 py-1.5 bg-transparent disabled:opacity-50 disabled:bg-slate-50';

    const selectEinheit = document.createElement('select');
    selectEinheit.className = 'bg-slate-100 border-l border-r border-slate-300 text-xs px-1.5 py-1.5 font-medium text-slate-700 focus:ring-0 shrink-0 outline-none cursor-pointer';
    if (isReadOnly) selectEinheit.disabled = true;
    selectEinheit.onchange = (e) => handlePositionChange(pos.id, 'einheit', e.target.value);

    const einheitenOptions = ['Stk.', 'm²', 'm³', 'lfm', 'Std.', 'Pauschal'];
    if (!einheitenOptions.includes(currentEinheit)) {
        einheitenOptions.push(currentEinheit);
    }

    einheitenOptions.forEach(optVal => {
        const opt = document.createElement('option');
        opt.value = optVal;
        opt.textContent = optVal;
        if (optVal === currentEinheit) opt.selected = true;
        selectEinheit.appendChild(opt);
    });

    const btnAufmass = document.createElement('button');
    btnAufmass.type = 'button';
    btnAufmass.title = 'Aufmaß / Mengenberechnung öffnen';
    btnAufmass.className = 'p-1.5 hover:bg-primary hover:text-white text-slate-500 transition-colors flex items-center justify-center shrink-0';
    if (isReadOnly) {
        btnAufmass.disabled = true;
        btnAufmass.classList.add('opacity-40', 'cursor-not-allowed');
    }
    btnAufmass.innerHTML = '<span class="material-symbols-outlined text-[16px]">straighten</span>';
    btnAufmass.onclick = () => openAufmassModalForPosition(pos.id);

    divMengeWrapper.appendChild(inputMenge);
    divMengeWrapper.appendChild(selectEinheit);
    divMengeWrapper.appendChild(btnAufmass);
    tdMenge.appendChild(divMengeWrapper);
    tr.appendChild(tdMenge);

    // Preis cell
    const tdPreis = document.createElement('td');
    tdPreis.className = 'px-2 py-2';
    const inputPreis = document.createElement('input');
    inputPreis.type = 'number';
    inputPreis.step = '0.01';
    inputPreis.value = (pos.preis !== undefined && pos.preis !== null && pos.preis !== '') ? (typeof pos.preis === 'number' ? pos.preis.toFixed(2) : String(pos.preis)) : '';
    inputPreis.onblur = (e) => handlePositionChange(pos.id, 'preis', e.target.value);
    inputPreis.className = 'w-full px-3 py-1.5 border border-slate-300 rounded text-sm text-right focus:ring-1 focus:ring-primary focus:border-primary';
    if (isReadOnly) {
        inputPreis.disabled = true;
        inputPreis.classList.add('bg-slate-100', 'cursor-not-allowed');
    }
    tdPreis.appendChild(inputPreis);
    tr.appendChild(tdPreis);


    const isGlobal13b = document.getElementById('rechnung-13b-ustg') && document.getElementById('rechnung-13b-ustg').checked;
    const isPos13b = isGlobal13b && pos.is13b;

    // MwSt cell
    const tdMwst = document.createElement('td');
    tdMwst.className = 'px-2 py-2 min-w-[80px]';
    const selectMwst = document.createElement('select');
    selectMwst.onchange = (e) => handlePositionChange(pos.id, 'mwst', e.target.value);
    selectMwst.className = 'w-full pl-2 pr-6 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-primary focus:border-primary appearance-none bg-no-repeat';
    selectMwst.style.backgroundImage = "url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2394a3b8%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')";
    selectMwst.style.backgroundPosition = 'right 0.5rem top 50%';
    selectMwst.style.backgroundSize = '0.65rem auto';

    const currentMwstShow = isPos13b ? 0 : pos.mwst;

    [19, 7, 0].forEach(rate => {
        const opt = document.createElement('option');
        opt.value = rate;
        opt.textContent = `${rate}%`;
        if (currentMwstShow == rate) opt.selected = true;
        selectMwst.appendChild(opt);
    });

    if (isPos13b || isReadOnly) {
        selectMwst.disabled = true;
        selectMwst.classList.add('opacity-50', 'bg-slate-100', 'cursor-not-allowed');
    }

    tdMwst.appendChild(selectMwst);

    if (isGlobal13b) {
        const div13b = document.createElement('div');
        div13b.className = 'mt-2 flex items-center gap-1';
        const cb13b = document.createElement('input');
        cb13b.type = 'checkbox';
        cb13b.checked = !!pos.is13b;
        if (isReadOnly) cb13b.disabled = true;
        cb13b.onchange = (e) => handlePositionChange(pos.id, 'is13b', e.target.checked);
        cb13b.className = 'rounded border-slate-300 text-primary focus:ring-primary h-3 w-3 cursor-pointer';
        const lbl13b = document.createElement('span');
        lbl13b.className = 'text-xs font-semibold text-slate-500 cursor-pointer uppercase tracking-wider';
        lbl13b.textContent = '13b (Reverse Charge)';
        if (!isReadOnly) lbl13b.onclick = () => cb13b.click();
        div13b.appendChild(cb13b);
        div13b.appendChild(lbl13b);
        tdMwst.appendChild(div13b);
    }

    tr.appendChild(tdMwst);

    // Rabatt cell
    const tdRabatt = document.createElement('td');
    tdRabatt.className = 'px-2 py-2';
    const divRabatt = document.createElement('div');
    divRabatt.className = 'flex items-center justify-end';
    const inputRabatt = document.createElement('input');
    inputRabatt.type = 'number';
    inputRabatt.min = '0';
    inputRabatt.max = '100';
    inputRabatt.step = 'any';
    inputRabatt.value = pos.rabatt;
    inputRabatt.onblur = (e) => handlePositionChange(pos.id, 'rabatt', e.target.value);
    inputRabatt.className = 'w-16 px-2 py-1.5 border border-slate-300 rounded text-sm text-right focus:ring-1 focus:ring-primary focus:border-primary placeholder-slate-300';
    if (isReadOnly) {
        inputRabatt.disabled = true;
        inputRabatt.classList.add('bg-slate-100', 'cursor-not-allowed');
    }
    inputRabatt.placeholder = '0';
    const spanPct = document.createElement('span');
    spanPct.className = 'text-slate-500 ml-1';
    spanPct.textContent = '%';
    divRabatt.appendChild(inputRabatt);
    divRabatt.appendChild(spanPct);
    tdRabatt.appendChild(divRabatt);
    tr.appendChild(tdRabatt);

    // Total cell
    const tdTotal = document.createElement('td');
    tdTotal.className = 'px-3 py-2 text-right font-medium text-slate-800';
    tdTotal.textContent = formatCurrency(pos.menge * pos.preis * (1 - (pos.rabatt || 0) / 100));
    tr.appendChild(tdTotal);

    // Action cell
    const tdAction = document.createElement('td');
    tdAction.className = 'px-2 py-2 text-center';
    const btnDel = document.createElement('button');
    btnDel.type = 'button';
    btnDel.onclick = () => removeRechnungPosition(pos.id);
    btnDel.className = 'text-slate-400 hover:text-red-500 transition-colors p-1 rounded-full hover:bg-red-50';
    if (isReadOnly) {
        btnDel.classList.add('hidden');
    }
    const spanDel = document.createElement('span');
    spanDel.className = 'material-symbols-outlined text-[18px]';
    spanDel.textContent = 'close';
    btnDel.appendChild(spanDel);
    tdAction.appendChild(btnDel);
    tr.appendChild(tdAction);

    return tr;
}

window.createRechnungPositionRow = createRechnungPositionRow;

function renderRechnungPositionen() {
    const tbody = document.getElementById('rechnung-positionen');
    const emptyState = document.getElementById('rechnung-empty-state');
    tbody.innerHTML = '';

    if (state.currentRechnungPositionen.length === 0) {
        tbody.parentElement.classList.add('hidden');
        emptyState.classList.remove('hidden');
    } else {
        tbody.parentElement.classList.remove('hidden');
        emptyState.classList.add('hidden');
    }

    state.currentRechnungPositionen.forEach((pos, index) => {
        const tr = createRechnungPositionRow(pos, index);
        tbody.appendChild(tr);
    });

    calculateRechnungTotals();
}

window.renderRechnungPositionen = renderRechnungPositionen;

function renderVerrechnungen() {
    const tbody = document.getElementById('rechnung-verrechnungen-list');
    const emptyState = document.getElementById('verrechnungen-empty-state');
    const summeNetto = document.getElementById('verrechnungen-summe-netto');
    if (!tbody) return;

    tbody.innerHTML = '';
    let sum = 0;

    if (!state.currentRechnungVerrechnungen) {
        state.currentRechnungVerrechnungen = [];
    }

    if (state.currentRechnungVerrechnungen.length === 0) {
        tbody.parentElement.classList.add('hidden');
        if (emptyState) emptyState.classList.remove('hidden');
    } else {
        tbody.parentElement.classList.remove('hidden');
        if (emptyState) emptyState.classList.add('hidden');

        state.currentRechnungVerrechnungen.forEach(v => {
            const r = state.rechnungen.find(rech => rech.id === v.vorherige_rechnung_id);
            if (!r) return;
            sum += v.abzugsbetrag_netto;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-4 py-2 font-medium">${r.nr}</td>
                <td class="px-4 py-2">${new Date(r.datum).toLocaleDateString('de-DE')}</td>
                <td class="px-4 py-2 text-right font-mono text-indigo-700">-${formatCurrency(v.abzugsbetrag_netto)}</td>
                <td class="px-4 py-2 text-center">
                    <button type="button" onclick="removeVerrechnung(${r.id})" class="text-slate-400 hover:text-red-500 transition-colors p-1 rounded-full hover:bg-red-50">
                        <span class="material-symbols-outlined text-[18px]">close</span>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    if (summeNetto) {
        summeNetto.textContent = formatCurrency(sum);
    }

    // Call calculateRechnungTotals ONLY if it exists to avoid loop when initializing early
    if (typeof calculateRechnungTotals === 'function') {
        renderRechnungPositionen();
        calculateRechnungTotals();
    }
}

window.renderVerrechnungen = renderVerrechnungen;

function populateSelects() {
    const kSelect = document.getElementById('rechnung-kunde');
    const pKundeSelect = document.getElementById('projekt-kunde');
    const rProjSelect = document.getElementById('rechnung-projekt');
    const rObjektSelect = document.getElementById('rechnung-objekt');

    kSelect.innerHTML = '';
    const optDefaultK = document.createElement('option');
    optDefaultK.value = '';
    optDefaultK.textContent = 'Bitte wählen...';
    kSelect.appendChild(optDefaultK);

    if (pKundeSelect) {
        pKundeSelect.innerHTML = '';
        const optDefaultPK = document.createElement('option');
        optDefaultPK.value = '';
        optDefaultPK.textContent = 'Bitte wählen...';
        pKundeSelect.appendChild(optDefaultPK);
    }

    state.kunden.forEach(k => {
        const opt = document.createElement('option');
        opt.value = k.id;
        opt.textContent = k.name;
        kSelect.appendChild(opt);

        if (pKundeSelect) {
            const optP = document.createElement('option');
            optP.value = k.id;
            optP.textContent = k.name;
            pKundeSelect.appendChild(optP);
        }
    });

    if (rProjSelect) {
        rProjSelect.innerHTML = '';
        const optDefaultP = document.createElement('option');
        optDefaultP.value = '';
        optDefaultP.textContent = 'Kein Projekt';
        rProjSelect.appendChild(optDefaultP);

        state.projekte.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            rProjSelect.appendChild(opt);
        });
    }

    if (rObjektSelect) {
        rObjektSelect.innerHTML = '';
        const optDefaultO = document.createElement('option');
        optDefaultO.value = '';
        optDefaultO.textContent = 'Kein Objekt';
        rObjektSelect.appendChild(optDefaultO);

        const OC = window.ObjektController;
        if (OC && state.objekte) {
            const eintraege = [
                { typ: 'LIEGENSCHAFT', liste: state.objekte.liegenschaften || [] },
                { typ: 'GEBAEUDE', liste: state.objekte.gebaeude || [] },
                { typ: 'ETAGE', liste: state.objekte.etagen || [] },
                { typ: 'RAUM', liste: state.objekte.raeume || [] }
            ];
            eintraege.forEach(({ typ, liste }) => {
                liste.forEach(knoten => {
                    const opt = document.createElement('option');
                    opt.value = `${typ}:${knoten.id}`;
                    opt.textContent = OC.buildPfad(typ, knoten.id, state.objekte);
                    rObjektSelect.appendChild(opt);
                });
            });
        }
    }

    // Populate datalist for article autocomplete
    const aDatalist = document.getElementById('artikel-datalist');
    if (aDatalist) {
        aDatalist.innerHTML = '';
        state.artikel.forEach(a => {
            const displayName = a.ean ? `${a.name} (${a.ean})` : a.name;
            const opt = document.createElement('option');
            opt.value = displayName;
            aDatalist.appendChild(opt);
        });
    }
}

window.populateSelects = populateSelects;

function populateVerrechnungSelect() {
    const select = document.getElementById('rechnung-verrechnung-select');
    const projektId = document.getElementById('rechnung-projekt').value;
    if (!select) return;

    select.innerHTML = '<option value="">Vorherige Rechnung wählen...</option>';

    if (!projektId) return;

    const currentId = document.getElementById('rechnung-id').value;

    // Datenintegrität: Bereits GLOBAL verwendete Vorrechnungen ausschließen -
    // eine Rechnung darf nur in EINER Schlussrechnung verrechnet sein (DB-Regel:
    // UNIQUE je Vorrechnung + Doppelverrechnungs-Guard im Backend). Eigene,
    // noch nicht gespeicherte Verrechnungen des aktuellen Formulars bleiben wählbar.
    const globalUsedIds = new Set();
    (state.rechnungen || []).forEach(r => {
        if (r.id != currentId) {
            (r.verrechnungen || []).forEach(v => globalUsedIds.add(v.vorherige_rechnung_id));
        }
    });

    const availableRechnungen = state.rechnungen.filter(r =>
        r.projektId == projektId &&
        r.status !== 'Entwurf' &&
        r.isLocked &&
        r.id != currentId &&
        !globalUsedIds.has(r.id) &&
        !state.currentRechnungVerrechnungen.find(v => v.vorherige_rechnung_id == r.id)
    );

    availableRechnungen.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        // Use Netto or Zahlbetrag? Rule says Abzugsbetrag Netto
        opt.textContent = `${r.nr} (${new Date(r.datum).toLocaleDateString('de-DE')}) - Netto: ${formatCurrency(r.netto)}`;
        select.appendChild(opt);
    });
}

window.populateVerrechnungSelect = populateVerrechnungSelect;

function updateRechnungDatePreviews() {
    const datumEl = document.getElementById('rechnung-datum');
    const faelligEl = document.getElementById('rechnung-faellig');
    const datumPreviewText = document.getElementById('rechnung-datum-preview-text');
    const faelligPreviewText = document.getElementById('rechnung-faellig-preview-text');
    const werktageInput = document.getElementById('rechnung-werktage');

    if (datumEl && datumPreviewText) {
        const dVal = datumEl.value;
        if (dVal) {
            const formatted = typeof formatDateDEWithWeekday === 'function' ? formatDateDEWithWeekday(dVal) : dVal;
            datumPreviewText.textContent = formatted;
        } else {
            datumPreviewText.textContent = '--.--.----';
        }
    }

    if (faelligEl && faelligPreviewText) {
        const fVal = faelligEl.value;
        if (fVal) {
            const formatted = typeof formatDateDEWithWeekday === 'function' ? formatDateDEWithWeekday(fVal) : fVal;
            const at = werktageInput ? (parseInt(werktageInput.value, 10) || 0) : 0;

            const holidayCheck = typeof isGermanPublicHoliday === 'function' ? isGermanPublicHoliday(fVal) : { isHoliday: false, name: null };
            const cleanIso = typeof formatDateISO === 'function' ? formatDateISO(fVal) : fVal;
            const parts = cleanIso.split('-');
            const dObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
            const dayOfWeek = dObj.getDay();

            if (dayOfWeek === 6 || dayOfWeek === 0) {
                const wName = dayOfWeek === 6 ? 'Samstag' : 'Sonntag';
                faelligPreviewText.innerHTML = `<span class="text-amber-600 font-semibold">⚠️ ${formatted} (${wName} – kein Arbeitstag gem. § 193 BGB)</span>`;
            } else if (holidayCheck && holidayCheck.isHoliday) {
                faelligPreviewText.innerHTML = `<span class="text-amber-600 font-semibold">⚠️ ${formatted} (Feiertag: ${holidayCheck.name || 'Gesetzlicher Feiertag'})</span>`;
            } else {
                faelligPreviewText.textContent = `Fällig am: ${formatted} • ${at} Arbeitstage`;
            }
        } else {
            faelligPreviewText.textContent = '--.--.----';
        }
    }
}

window.updateRechnungDatePreviews = updateRechnungDatePreviews;

function applyUnternehmensartVisibility() {
    const art = state.einstellungen.unternehmensart || 'handwerk';
    const isHandwerkOrBau = art === 'handwerk' || art === 'bauhauptgewerbe' || art === 'b2g_spezialist';
    const isB2GSpezialist = art === 'b2g_spezialist' || art === 'bauhauptgewerbe';

    const handwerkSection = document.getElementById('rechnung-handwerk-section');
    const bauvorhabenSection = document.getElementById('angebot-bauvorhaben-section') || document.getElementById('angebot-metadaten-section');
    const b2gSection = document.getElementById('rechnung-b2g-section');
    const currentCustomerType = document.getElementById('rechnung-customer-type')?.value || 'B2B';

    if (state.isAngebotMode) {
        if (handwerkSection) handwerkSection.classList.add('hidden');
        if (bauvorhabenSection) bauvorhabenSection.classList.remove('hidden');
    } else {
        if (bauvorhabenSection) bauvorhabenSection.classList.add('hidden');
        if (handwerkSection) {
            if (isHandwerkOrBau) {
                handwerkSection.classList.remove('hidden');
                if (typeof toggleAbschlagsKumulationUI === 'function') {
                    toggleAbschlagsKumulationUI();
                }
            } else {
                handwerkSection.classList.add('hidden');
                const kumulationSection = document.getElementById('rechnung-kumulation-section');
                if (kumulationSection) {
                    kumulationSection.classList.add('hidden');
                }
            }
        }
    }

    if (b2gSection) {
        if (!state.isAngebotMode && currentCustomerType === 'B2G') {
            b2gSection.classList.remove('hidden');
        } else {
            b2gSection.classList.add('hidden');
        }
    }
}

window.applyUnternehmensartVisibility = applyUnternehmensartVisibility;
