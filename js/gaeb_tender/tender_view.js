/**
 * js/gaeb_tender/tender_view.js
 * Modulare View für den GAEB Ausschreibungs- und Bepreisungsdialog.
 */

(function () {
    'use strict';

    function formatCurrency(amount) {
        if (amount === null || amount === undefined || isNaN(amount)) return '0,00 €';
        return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
    }

    function formatNumber(num, decimals = 3) {
        if (num === null || num === undefined || isNaN(num)) return '--';
        return new Intl.NumberFormat('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(num);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    class GaebTenderView {
        /**
         * Aktualisiert die Kopfzeile des Modals
         */
        renderHeader(state) {
            const projectEl = document.getElementById('gt-header-project-name');
            const fileEl = document.getElementById('gt-header-file-name');
            const dateEl = document.getElementById('gt-header-import-date');
            const versionEl = document.getElementById('gt-header-gaeb-version');
            const statusBadge = document.getElementById('gt-header-status-badge');
            const draftSelect = document.getElementById('gt-draft-select');

            if (projectEl) projectEl.textContent = state.projectInfo?.name || state.draft?.name || 'Ausschreibung';
            if (fileEl) fileEl.textContent = state.projectInfo?.fileName || `Import #${state.currentImportId}`;
            if (dateEl) {
                const dateStr = state.projectInfo?.importedAt || state.draft?.created_at || '';
                dateEl.textContent = dateStr ? `Import: ${dateStr.slice(0, 10)}` : 'Importiert';
            }
            if (versionEl) versionEl.textContent = `GAEB ${state.projectInfo?.gaebVersion || '3.3'}`;

            if (statusBadge) {
                const isFullyPriced = (state.stats.status === 'VOLLSTAENDIG_BEPREIST');
                if (isFullyPriced) {
                    statusBadge.className = 'px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1';
                    statusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Vollständig bepreist';
                } else if (state.stats.status === 'VERWORFEN') {
                    statusBadge.className = 'px-2.5 py-0.5 text-xs font-bold rounded-full bg-slate-200 text-slate-700 border border-slate-300 flex items-center gap-1';
                    statusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-slate-500"></span> Verworfen';
                } else {
                    statusBadge.className = 'px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1';
                    statusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> In Bearbeitung';
                }
            }

            if (draftSelect && Array.isArray(state.availableDrafts)) {
                draftSelect.innerHTML = state.availableDrafts.map(d => `
                    <option value="${d.id}" ${d.id === state.currentDraftId ? 'selected' : ''}>
                        ${escapeHtml(d.name)} (v${d.version})
                    </option>
                `).join('');
            }
        }

        /**
         * Rendert die hierarchische Baumstruktur der Kategorien und Positionen
         */
        renderTree(state) {
            const container = document.getElementById('gt-tree-container');
            if (!container) return;

            const query = (state.searchQuery || '').toLowerCase().trim();
            const filter = state.filterMode || 'all';

            // Filterfunktion für Positionen
            function itemMatches(it) {
                if (filter === 'unpriced' && (it.isHinweistext || it.is_priced)) return false;
                if (filter === 'bireq' && (!Array.isArray(it.bieterangaben) || it.bieterangaben.length === 0 || it.bieterangaben.every(b => b.is_answered))) return false;

                if (query) {
                    const matchOz = (it.oz_code || '').toLowerCase().includes(query);
                    const matchKurz = (it.kurztext || '').toLowerCase().includes(query);
                    const matchLang = (it.langtext || '').toLowerCase().includes(query);
                    return matchOz || matchKurz || matchLang;
                }
                return true;
            }

            let renderedItemCount = 0;

            function renderCategory(cat, depth = 0) {
                const subCatsHtml = (cat.categories || []).map(c => renderCategory(c, depth + 1)).join('');
                
                const matchingItems = (cat.items || []).filter(itemMatches);
                renderedItemCount += matchingItems.length;

                const itemsHtml = matchingItems.map(it => {
                    const isSelected = it._dbId === state.selectedItemId;
                    
                    let badgeClass = 'bg-blue-50 text-blue-700 border-blue-200';
                    let typeLabel = it.positions_art || 'NORMAL';
                    if (it.isHinweistext) {
                        badgeClass = 'bg-slate-100 text-slate-600 border-slate-200';
                        typeLabel = 'HINWEIS';
                    } else if (it.isGrundposition) {
                        badgeClass = 'bg-indigo-50 text-indigo-700 border-indigo-200';
                        typeLabel = 'GRUND';
                    } else if (it.isAlternative) {
                        badgeClass = 'bg-purple-50 text-purple-700 border-purple-200';
                        typeLabel = 'WAHL';
                    } else if (it.isBedarf) {
                        badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
                        typeLabel = 'BEDARF';
                    } else if (it.isPauschal) {
                        badgeClass = 'bg-teal-50 text-teal-700 border-teal-200';
                        typeLabel = 'PAUSCHAL';
                    }

                    // Status-Symbol
                    let iconHtml = '';
                    if (it.isHinweistext) {
                        iconHtml = '<span class="material-symbols-outlined text-[15px] text-slate-400" title="Hinweistext">info</span>';
                    } else if (it.is_priced) {
                        iconHtml = '<span class="material-symbols-outlined text-[15px] text-emerald-600" title="Bepreist">check_circle</span>';
                    } else {
                        iconHtml = '<span class="material-symbols-outlined text-[15px] text-amber-500" title="Unbepreist">warning</span>';
                    }

                    // BiReq-Indikator
                    let bireqIndicator = '';
                    if (Array.isArray(it.bieterangaben) && it.bieterangaben.length > 0) {
                        const allAnswered = it.bieterangaben.every(b => b.is_answered);
                        bireqIndicator = allAnswered
                            ? '<span class="w-1.5 h-1.5 rounded-full bg-indigo-500" title="BiReq ausgefüllt"></span>'
                            : '<span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" title="BiReq offen"></span>';
                    }

                    const selectedClass = isSelected
                        ? 'bg-primary/10 border-primary font-bold text-primary shadow-sm'
                        : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700';

                    return `
                        <div onclick="window.GaebTenderController.selectItem(${it._dbId})"
                             class="flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-all ${selectedClass} ml-${Math.min(depth * 2, 8)}">
                            <div class="flex items-center gap-2 min-w-0 flex-1">
                                ${iconHtml}
                                <span class="font-mono text-[11px] font-bold shrink-0">${escapeHtml(it.oz_code || it.rno_part)}</span>
                                <span class="truncate text-[11px]">${escapeHtml(it.kurztext || 'Position')}</span>
                            </div>
                            <div class="flex items-center gap-1 shrink-0 ml-2">
                                ${bireqIndicator}
                                <span class="px-1.5 py-0.2 text-[9px] font-bold rounded border ${badgeClass}">${typeLabel}</span>
                            </div>
                        </div>
                    `;
                }).join('');

                if (!subCatsHtml && matchingItems.length === 0 && (query || filter !== 'all')) {
                    return ''; // Kategorie ausblenden wenn keine Treffer
                }

                const catIndent = depth > 0 ? `ml-${Math.min(depth * 2, 6)}` : '';
                const catTitle = cat.name || cat.lblCtgy || cat.rno_part || 'Abschnitt';

                return `
                    <div class="space-y-1 ${catIndent}">
                        <div class="flex items-center gap-1.5 py-1 px-1.5 bg-slate-100/80 rounded font-semibold text-slate-700 text-[11px]">
                            <span class="material-symbols-outlined text-[15px] text-slate-500">folder_open</span>
                            <span class="font-mono text-slate-900">${escapeHtml(cat.rno_part || cat.oz_prefix)}</span>
                            <span class="truncate">${escapeHtml(catTitle)}</span>
                        </div>
                        <div class="pl-2 space-y-1 border-l-2 border-slate-200/60 ml-2">
                            ${subCatsHtml}
                            ${itemsHtml}
                        </div>
                    </div>
                `;
            }

            if (!state.tree || state.tree.length === 0) {
                container.innerHTML = '<div class="text-center py-8 text-slate-400 text-xs">Keine Strukturdaten vorhanden.</div>';
                return;
            }

            const html = state.tree.map(cat => renderCategory(cat, 0)).join('');
            if (!html.trim()) {
                container.innerHTML = '<div class="text-center py-8 text-slate-400 text-xs">Keine Positionen für diesen Filter gefunden.</div>';
            } else {
                container.innerHTML = html;
            }

            // Aktive Filter-Buttons markieren
            ['all', 'unpriced', 'bireq'].forEach(m => {
                const btn = document.getElementById(`gt-filter-${m}`);
                if (btn) {
                    if (state.filterMode === m) {
                        btn.className = 'flex-1 py-1 text-[11px] font-bold rounded bg-slate-200 text-slate-900 border border-slate-300 shadow-sm';
                    } else {
                        btn.className = 'flex-1 py-1 text-[11px] font-semibold rounded bg-white text-slate-600 border border-slate-200 hover:bg-slate-50';
                    }
                }
            });
        }

        /**
         * Rendert den rechten Detailbereich für das selektierte Item
         */
        renderDetail(state) {
            const emptyState = document.getElementById('gt-empty-detail-state');
            const content = document.getElementById('gt-item-detail-content');
            const item = state.getSelectedItem();

            if (!item) {
                if (emptyState) emptyState.classList.remove('hidden');
                if (content) content.classList.add('hidden');
                return;
            }

            if (emptyState) emptyState.classList.add('hidden');
            if (content) content.classList.remove('hidden');

            // Kopfdaten
            const ozEl = document.getElementById('gt-item-oz');
            const rnopartEl = document.getElementById('gt-item-rnopart');
            const typeBadge = document.getElementById('gt-item-type-badge');
            const pricingBadge = document.getElementById('gt-item-pricing-badge');
            const kurztextEl = document.getElementById('gt-item-kurztext');
            const langtextEl = document.getElementById('gt-item-langtext');
            const mengeEl = document.getElementById('gt-item-menge');
            const einheitEl = document.getElementById('gt-item-einheit');
            const qtyTbdWarn = document.getElementById('gt-qty-tbd-warning');
            const vorbemerkungBox = document.getElementById('gt-item-vorbemerkung-box');
            const vorbemerkungText = document.getElementById('gt-item-vorbemerkung-text');

            if (ozEl) ozEl.textContent = item.oz_code || item.oz || '--';
            if (rnopartEl) rnopartEl.textContent = item.rno_part || '--';
            if (kurztextEl) kurztextEl.textContent = item.kurztext || item.name || 'Ohne Kurztext';
            
            // Vorbemerkung anzeigen falls vorhanden
            if (vorbemerkungBox && vorbemerkungText) {
                const vorb = item.vorbemerkung || item.category_remark || '';
                if (vorb && vorb.trim().length > 0) {
                    vorbemerkungBox.classList.remove('hidden');
                    vorbemerkungText.textContent = vorb;
                } else {
                    vorbemerkungBox.classList.add('hidden');
                }
            }

            // Langtext mit Absätzen
            if (langtextEl) {
                const lt = item.langtext || item.completeText || item.detailTxt || item.description || '';
                langtextEl.textContent = lt.trim().length > 0 ? lt : 'Kein ausführlicher Langtext vorhanden.';
            }

            // Menge & Einheit
            if (mengeEl) mengeEl.textContent = item.menge !== null ? formatNumber(item.menge, 3) : '--';
            if (einheitEl) einheitEl.textContent = item.einheit || '';

            if (qtyTbdWarn) {
                if (item.isQtyTBD || item.is_qty_tbd) {
                    qtyTbdWarn.classList.remove('hidden');
                } else {
                    qtyTbdWarn.classList.add('hidden');
                }
            }

            // Typ-Badge
            if (typeBadge) {
                typeBadge.textContent = item.positions_art || (item.isHinweistext ? 'HINWEISTEXT' : 'NORMAL');
            }

            // Status-Badge
            if (pricingBadge) {
                if (item.isHinweistext) {
                    pricingBadge.className = 'px-2 py-0.5 text-[11px] font-semibold rounded bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1';
                    pricingBadge.innerHTML = '<span class="material-symbols-outlined text-[13px]">info</span> Informativ';
                } else if (item.is_priced) {
                    pricingBadge.className = 'px-2 py-0.5 text-[11px] font-semibold rounded bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1';
                    pricingBadge.innerHTML = '<span class="material-symbols-outlined text-[13px]">check_circle</span> Bepreist';
                } else {
                    pricingBadge.className = 'px-2 py-0.5 text-[11px] font-semibold rounded bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1';
                    pricingBadge.innerHTML = '<span class="material-symbols-outlined text-[13px]">warning</span> Unbepreist';
                }
            }

            // Preiseingabe-Felder
            const pricingInputs = document.getElementById('gt-pricing-inputs');
            const hinweistextNotice = document.getElementById('gt-hinweistext-notice');
            const unitPriceInput = document.getElementById('gt-input-unit-price');
            const totalCalcInput = document.getElementById('gt-calculated-total-price');
            const unpricedHint = document.getElementById('gt-unpriced-hint');
            const inTotalCheck = document.getElementById('gt-check-in-total');
            const zeroConfirmCheck = document.getElementById('gt-check-zero-confirm');
            const zeroConfirmContainer = document.getElementById('gt-zero-confirm-container');
            const taxSelect = document.getElementById('gt-input-tax-rate');
            const notesInput = document.getElementById('gt-input-notes');

            if (item.isHinweistext) {
                if (pricingInputs) pricingInputs.classList.add('hidden');
                if (hinweistextNotice) hinweistextNotice.classList.remove('hidden');
            } else {
                if (pricingInputs) pricingInputs.classList.remove('hidden');
                if (hinweistextNotice) hinweistextNotice.classList.add('hidden');

                if (unitPriceInput) {
                    unitPriceInput.value = (item.unit_price !== null && item.unit_price !== undefined) ? item.unit_price : '';
                }

                if (totalCalcInput) {
                    if (item.total_price !== null && item.total_price !== undefined) {
                        totalCalcInput.value = formatCurrency(item.total_price);
                    } else if (item.isQtyTBD) {
                        totalCalcInput.value = 'Menge unbestimmt (QtyTBD)';
                    } else {
                        totalCalcInput.value = '--';
                    }
                }

                if (unpricedHint) {
                    if (item.unit_price === null) {
                        unpricedHint.classList.remove('hidden');
                    } else {
                        unpricedHint.classList.add('hidden');
                    }
                }

                if (inTotalCheck) {
                    inTotalCheck.checked = Boolean(item.in_total);
                }

                if (zeroConfirmCheck) {
                    zeroConfirmCheck.checked = Boolean(item.is_zero_confirmed);
                }

                if (zeroConfirmContainer) {
                    // Zeige Null-Preis-Checkbox hervor, wenn 0.00 eingegeben oder bestätigt
                    if (item.unit_price === 0) {
                        zeroConfirmContainer.classList.remove('hidden');
                        zeroConfirmContainer.classList.add('animate-pulse');
                    } else {
                        zeroConfirmContainer.classList.remove('animate-pulse');
                    }
                }

                if (taxSelect) {
                    taxSelect.value = String(item.tax_rate !== undefined ? item.tax_rate : 19.0);
                }

                if (notesInput) {
                    notesInput.value = item.draft_notes || '';
                }
            }

            // BiReq-Liste rendern
            const bireqList = document.getElementById('gt-bireq-list');
            const bireqBadge = document.getElementById('gt-bireq-count-badge');

            if (Array.isArray(item.bieterangaben) && item.bieterangaben.length > 0) {
                if (bireqBadge) bireqBadge.textContent = `${item.bieterangaben.length} Angabe(n) gefordert`;
                if (bireqList) {
                    bireqList.innerHTML = item.bieterangaben.map(b => {
                        const bId = b.id || b._dbId;
                        const label = b.label || b.description || 'Bieterangabe';
                        const isDone = Boolean(b.answer_value && b.answer_value.trim().length > 0);
                        const statusClass = isDone ? 'text-emerald-600 font-bold' : 'text-amber-600 font-semibold';

                        return `
                            <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                                <div class="flex justify-between items-center text-xs">
                                    <label class="font-bold text-slate-800">${escapeHtml(label)}</label>
                                    <span class="text-[11px] ${statusClass}">
                                        ${isDone ? 'Ausgefüllt ✓' : 'Erforderlich !'}
                                    </span>
                                </div>
                                ${b.description && b.description !== b.label ? `<p class="text-[11px] text-slate-500">${escapeHtml(b.description)}</p>` : ''}
                                <input type="text"
                                       placeholder="${escapeHtml(label)} eingeben..."
                                       value="${escapeHtml(b.answer_value || '')}"
                                       oninput="window.GaebTenderController.onBiReqInput(${bId}, this.value)"
                                       class="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white">
                            </div>
                        `;
                    }).join('');
                }
            } else {
                if (bireqBadge) bireqBadge.textContent = '0 Angaben';
                if (bireqList) {
                    bireqList.innerHTML = '<p class="text-xs text-slate-400 italic">Keine Bieterangaben für diese Position gefordert.</p>';
                }
            }
        }

        /**
         * Rendert den Fußbereich mit Summen und Statistiken
         */
        renderFooter(state) {
            const nettoEl = document.getElementById('gt-footer-netto');
            const taxEl = document.getElementById('gt-footer-tax');
            const bruttoEl = document.getElementById('gt-footer-brutto');
            const pricedRatioEl = document.getElementById('gt-stat-priced-ratio');
            const missingBireqEl = document.getElementById('gt-stat-missing-bireq');

            if (nettoEl) nettoEl.textContent = formatCurrency(state.stats.total_netto);
            if (taxEl) taxEl.textContent = formatCurrency(state.stats.total_tax);
            if (bruttoEl) bruttoEl.textContent = formatCurrency(state.stats.total_brutto);

            if (pricedRatioEl) {
                const priced = state.stats.priced_items_count || 0;
                const total = state.stats.priceable_items_count || 0;
                pricedRatioEl.textContent = `${priced} / ${total}`;
                pricedRatioEl.className = (priced === total && total > 0)
                    ? 'font-bold text-emerald-600 font-mono'
                    : 'font-bold text-amber-600 font-mono';
            }

            if (missingBireqEl) {
                const missing = state.stats.missing_bireq_count || 0;
                missingBireqEl.textContent = missing;
                missingBireqEl.className = missing === 0
                    ? 'font-bold text-emerald-600 font-mono'
                    : 'font-bold text-amber-600 font-mono';
            }
        }

        /**
         * Rendert das gesamte UI basierend auf dem aktuellen State
         */
        renderAll(state) {
            this.renderHeader(state);
            this.renderTree(state);
            this.renderDetail(state);
            this.renderFooter(state);
        }
    }

    window.GaebTenderView = new GaebTenderView();
})();
