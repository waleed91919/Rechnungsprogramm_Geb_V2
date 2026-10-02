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
         * Schaltet zwischen Ansichtsmodi um ('import-list' | 'draft-list' | 'editor')
         */
        setViewMode(mode) {
            const importListView = document.getElementById('gt-view-import-list');
            const draftListView = document.getElementById('gt-view-draft-list');
            const editorView = document.getElementById('gt-view-editor');

            const navImports = document.getElementById('gt-nav-to-imports');
            const navDrafts = document.getElementById('gt-nav-to-drafts');
            const navSep1 = document.getElementById('gt-nav-sep-1');
            const navSep2 = document.getElementById('gt-nav-sep-2');
            const editorControls = document.getElementById('gt-header-editor-controls');
            const phaseBadge = document.getElementById('gt-header-phase-badge');
            const statusBadge = document.getElementById('gt-header-status-badge');
            const subtitle = document.getElementById('gt-header-subtitle');
            const projTitle = document.getElementById('gt-header-project-name');

            if (mode === 'import-list') {
                if (importListView) importListView.classList.remove('hidden');
                if (draftListView) draftListView.classList.add('hidden');
                if (editorView) editorView.classList.add('hidden');

                if (navImports) navImports.classList.add('hidden');
                if (navDrafts) navDrafts.classList.add('hidden');
                if (navSep1) navSep1.classList.add('hidden');
                if (navSep2) navSep2.classList.add('hidden');
                if (editorControls) editorControls.classList.add('hidden');
                if (phaseBadge) phaseBadge.classList.add('hidden');
                if (statusBadge) statusBadge.classList.add('hidden');
                if (subtitle) subtitle.classList.add('hidden');

                if (projTitle) projTitle.textContent = 'GAEB Ausschreibungen - Importauswahl';
            } else if (mode === 'draft-list') {
                if (importListView) importListView.classList.add('hidden');
                if (draftListView) draftListView.classList.remove('hidden');
                if (editorView) editorView.classList.add('hidden');

                if (navImports) navImports.classList.remove('hidden');
                if (navDrafts) navDrafts.classList.add('hidden');
                if (navSep1) navSep1.classList.remove('hidden');
                if (navSep2) navSep2.classList.add('hidden');
                if (editorControls) editorControls.classList.add('hidden');
                if (phaseBadge) phaseBadge.classList.remove('hidden');
                if (statusBadge) statusBadge.classList.add('hidden');
                if (subtitle) subtitle.classList.remove('hidden');
            } else if (mode === 'editor') {
                if (importListView) importListView.classList.add('hidden');
                if (draftListView) draftListView.classList.add('hidden');
                if (editorView) editorView.classList.remove('hidden');

                if (navImports) navImports.classList.remove('hidden');
                if (navDrafts) navDrafts.classList.remove('hidden');
                if (navSep1) navSep1.classList.remove('hidden');
                if (navSep2) navSep2.classList.remove('hidden');
                if (editorControls) editorControls.classList.remove('hidden');
                if (phaseBadge) phaseBadge.classList.remove('hidden');
                if (statusBadge) statusBadge.classList.remove('hidden');
                if (subtitle) subtitle.classList.remove('hidden');
            }
        }

        /**
         * Rendert die Liste aller verfügbaren GAEB-Importe
         */
        renderImportList(imports) {
            this.setViewMode('import-list');
            const tbody = document.getElementById('gt-import-list-tbody');
            const emptyEl = document.getElementById('gt-empty-imports');
            const tableContainer = document.getElementById('gt-import-table-container');
            const errorEl = document.getElementById('gt-error-imports');

            if (errorEl) errorEl.classList.add('hidden');

            if (!Array.isArray(imports) || imports.length === 0) {
                if (tbody) tbody.innerHTML = '';
                if (tableContainer) tableContainer.classList.add('hidden');
                if (emptyEl) emptyEl.classList.remove('hidden');
                return;
            }

            if (tableContainer) tableContainer.classList.remove('hidden');
            if (emptyEl) emptyEl.classList.add('hidden');

            if (tbody) {
                tbody.innerHTML = imports.map(imp => {
                    const draftsCount = (imp.draft_count !== undefined) ? imp.draft_count : (imp.drafts ? imp.drafts.length : 0);
                    const importDate = (imp.imported_at || '').slice(0, 10) || '--';
                    const gaebVer = imp.gaeb_version || '3.3';

                    return `
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="py-3 px-4 font-bold text-slate-800 font-mono">${escapeHtml(imp.file_name)}</td>
                            <td class="py-3 px-4 text-slate-700">${escapeHtml(imp.project_name || 'Unbenanntes Projekt')}</td>
                            <td class="py-3 px-4">
                                <span class="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 text-slate-700 border border-slate-200">GAEB ${escapeHtml(gaebVer)}</span>
                            </td>
                            <td class="py-3 px-4 text-slate-500">${escapeHtml(importDate)}</td>
                            <td class="py-3 px-4 font-mono text-slate-500">#${imp.id}</td>
                            <td class="py-3 px-4 text-slate-600">${imp.category_count || 0} Kat. / ${imp.item_count || 0} Pos.</td>
                            <td class="py-3 px-4">
                                <span class="px-2 py-0.5 text-[11px] font-semibold rounded-full ${draftsCount > 0 ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-100 text-slate-500'}">
                                    ${draftsCount} ${draftsCount === 1 ? 'Entwurf' : 'Entwürfe'}
                                </span>
                            </td>
                            <td class="py-3 px-4 text-right">
                                <button type="button" onclick="window.GaebTenderController.selectImport(${imp.id})" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm hover:shadow transition-all inline-flex items-center gap-1">
                                    <span>Auswählen</span>
                                    <span class="material-symbols-outlined text-[14px]">arrow_forward</span>
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('');
            }
        }

        /**
         * Rendert die Liste der Bepreisungsentwürfe für einen ausgewählten Import
         */
        renderDraftList(importInfo, drafts) {
            this.setViewMode('draft-list');

            const projTitle = document.getElementById('gt-header-project-name');
            if (projTitle) projTitle.textContent = importInfo?.project_name || 'GAEB Ausschreibung';

            const cardProj = document.getElementById('gt-draftlist-project-name');
            const cardFile = document.getElementById('gt-draftlist-file-name');
            const cardDate = document.getElementById('gt-draftlist-import-date');
            const cardStats = document.getElementById('gt-draftlist-stats');

            if (cardProj) cardProj.textContent = importInfo?.project_name || 'Unbenanntes Projekt';
            if (cardFile) cardFile.textContent = importInfo?.file_name || 'import.x83';
            if (cardDate) cardDate.textContent = `Import: ${(importInfo?.imported_at || '').slice(0, 10)}`;
            if (cardStats) cardStats.textContent = `${importInfo?.item_count || 0} Positionen (${importInfo?.category_count || 0} Kategorien)`;

            const fileEl = document.getElementById('gt-header-file-name');
            const dateEl = document.getElementById('gt-header-import-date');
            const versionEl = document.getElementById('gt-header-gaeb-version');
            if (fileEl) fileEl.textContent = importInfo?.file_name || `Import #${importInfo?.id}`;
            if (dateEl) dateEl.textContent = `Import: ${(importInfo?.imported_at || '').slice(0, 10)}`;
            if (versionEl) versionEl.textContent = `GAEB ${importInfo?.gaeb_version || '3.3'}`;

            const tbody = document.getElementById('gt-draft-list-tbody');
            const emptyEl = document.getElementById('gt-empty-drafts');
            const tableContainer = document.getElementById('gt-draft-table-container');

            if (!Array.isArray(drafts) || drafts.length === 0) {
                if (tbody) tbody.innerHTML = '';
                if (tableContainer) tableContainer.classList.add('hidden');
                if (emptyEl) emptyEl.classList.remove('hidden');
                return;
            }

            if (tableContainer) tableContainer.classList.remove('hidden');
            if (emptyEl) emptyEl.classList.add('hidden');

            if (tbody) {
                tbody.innerHTML = drafts.map(d => {
                    let badgeHtml = '';
                    const isFullyPriced = (d.status === 'VOLLSTAENDIG_BEPREIST');
                    const hasUnresolvedQtyTbd = (d.unresolved_qty_tbd_count > 0);
                    const pricesDone = (d.unpriced_count === 0 && d.missing_bireq_count === 0);

                    if (isFullyPriced) {
                        badgeHtml = '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">Vollständig bepreist</span>';
                    } else if (d.status === 'VERWORFEN') {
                        badgeHtml = '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-200 text-slate-700">Verworfen</span>';
                    } else if (pricesDone && hasUnresolvedQtyTbd) {
                        badgeHtml = '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-900 border border-amber-300" title="Mengen noch unbestimmt (QtyTBD) - Nicht bereit zur Abgabe">Mengen unbestimmt (QtyTBD)</span>';
                    } else {
                        badgeHtml = '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">In Bearbeitung</span>';
                    }

                    const canExportDraft = (d.status === 'VOLLSTAENDIG_BEPREIST') && (!d.unresolved_qty_tbd_count || d.unresolved_qty_tbd_count === 0);
                    const exportBtnCls = canExportDraft 
                        ? 'px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm hover:shadow transition-all inline-flex items-center gap-1'
                        : 'px-2.5 py-1.5 bg-slate-200 text-slate-400 font-bold rounded-lg shadow-sm cursor-not-allowed inline-flex items-center gap-1';
                    const exportTitle = canExportDraft
                        ? 'Als GAEB DA XML X84 exportieren'
                        : 'Export erst nach vollständiger Bepreisung und Beantwortung aller Pflichtangaben verfügbar';

                    const rawDate = (d.updated_at && String(d.updated_at).trim())
                        || (d.created_at && String(d.created_at).trim())
                        || null;
                    const updatedAt = rawDate ? (String(rawDate).slice(0, 16).replace('T', ' ') || '—') : '—';

                    return `
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="py-3 px-4 font-mono font-bold text-slate-800">v${d.version}</td>
                            <td class="py-3 px-4 font-semibold text-slate-900">${escapeHtml(d.name)}</td>
                            <td class="py-3 px-4">${badgeHtml}</td>
                            <td class="py-3 px-4 text-slate-500 text-[11px]">${d.unpriced_count || 0} unbepreist, ${d.missing_bireq_count || 0} BiReq</td>
                            <td class="py-3 px-4 font-mono text-slate-700">${formatCurrency(d.total_netto)}</td>
                            <td class="py-3 px-4 font-mono font-bold text-emerald-700">${formatCurrency(d.total_brutto)}</td>
                            <td class="py-3 px-4 text-slate-400 text-[11px]">${escapeHtml(updatedAt)}</td>
                            <td class="py-3 px-4 text-right">
                                <div class="inline-flex items-center gap-1 justify-end">
                                    <button type="button" onclick="window.GaebTenderController.openDraft(${d.id}, ${importInfo.id})" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm hover:shadow transition-all inline-flex items-center gap-1">
                                        <span>Öffnen</span>
                                        <span class="material-symbols-outlined text-[14px]">edit</span>
                                    </button>
                                    <button type="button" onclick="window.GaebTenderController.exportX84(${d.id})" ${canExportDraft ? '' : 'disabled'} title="${exportTitle}" class="${exportBtnCls}">
                                        <span class="material-symbols-outlined text-[14px]">file_download</span>
                                        <span>X84</span>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `;
                }).join('');
            }
        }

        /**
         * Aktualisiert die Kopfzeile des Modals
         */
        renderHeader(state) {
            this.setViewMode('editor');

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
                const hasUnresolvedQtyTbd = (state.stats.unresolved_qty_tbd_count > 0 || state.draft?.unresolved_qty_tbd_count > 0);
                const pricesDone = (state.stats.unpriced_count === 0 && state.stats.missing_bireq_count === 0);

                if (isFullyPriced) {
                    statusBadge.className = 'px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1';
                    statusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Vollständig bepreist';
                } else if (state.stats.status === 'VERWORFEN') {
                    statusBadge.className = 'px-2.5 py-0.5 text-xs font-bold rounded-full bg-slate-200 text-slate-700 border border-slate-300 flex items-center gap-1';
                    statusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-slate-500"></span> Verworfen';
                } else if (pricesDone && hasUnresolvedQtyTbd) {
                    statusBadge.className = 'px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1';
                    statusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> Preise erfasst, aber Mengen noch unbestimmt (QtyTBD) - Nicht bereit zur Abgabe';
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

            const exportBtn = document.getElementById('gt-btn-export-x84');
            const exportBtnLabel = document.getElementById('gt-export-btn-label');
            if (exportBtnLabel) {
                const draftName = state.draft?.name || `Entwurf #${state.currentDraftId}`;
                const gaebVer = state.projectInfo?.gaebVersion || '3.3';
                exportBtnLabel.textContent = `X84 exportieren: ${draftName} (GAEB ${gaebVer})`;
            }
            if (exportBtn) {
                const canExport = (state.stats.status === 'VOLLSTAENDIG_BEPREIST') && (!state.stats.unresolved_qty_tbd_count || state.stats.unresolved_qty_tbd_count === 0);
                exportBtn.disabled = !canExport;
                if (!canExport) {
                    exportBtn.classList.add('opacity-50', 'cursor-not-allowed');
                    exportBtn.classList.remove('hover:bg-indigo-700', 'hover:shadow-md');
                    exportBtn.title = 'Export erst nach vollständiger Bepreisung und Beantwortung aller Pflichtangaben verfügbar.';
                } else {
                    exportBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                    exportBtn.classList.add('hover:bg-indigo-700', 'hover:shadow-md');
                    exportBtn.title = 'Als GAEB DA XML X84 Angebotsdatei exportieren';
                }
            }
        }

        /**
         * Zeigt eine Infobox zum Status des X84-Exports an
         */
        showExportInfo(msg, isError = false) {
            const box = document.getElementById('gt-export-info-box');
            const textEl = document.getElementById('gt-export-info-text');
            if (!box || !textEl) return;

            textEl.textContent = msg;
            const iconEl = box.querySelector('.material-symbols-outlined');
            if (isError) {
                box.className = 'mx-6 mt-3 p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-center justify-between gap-2 shrink-0';
                if (iconEl) {
                    iconEl.textContent = 'error';
                    iconEl.className = 'material-symbols-outlined text-red-600 text-[20px]';
                }
            } else {
                box.className = 'mx-6 mt-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center justify-between gap-2 shrink-0';
                if (iconEl) {
                    iconEl.textContent = 'check_circle';
                    iconEl.className = 'material-symbols-outlined text-emerald-600 text-[20px]';
                }
            }
            box.classList.remove('hidden');
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

            const qtyTbdContainer = document.getElementById('gt-stat-qty-tbd-container');
            const qtyTbdEl = document.getElementById('gt-stat-unresolved-qty-tbd');
            const unresolvedQty = state.stats.unresolved_qty_tbd_count || 0;
            if (qtyTbdContainer && qtyTbdEl) {
                if (unresolvedQty > 0) {
                    qtyTbdContainer.classList.remove('hidden');
                    qtyTbdEl.textContent = unresolvedQty;
                } else {
                    qtyTbdContainer.classList.add('hidden');
                }
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
