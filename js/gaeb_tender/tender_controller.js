/**
 * js/gaeb_tender/tender_controller.js
 * Controller für den modularen GAEB Ausschreibungs- und Bepreisungsablauf.
 * 
 * Verwendet ausschließlich IPC (window.api.invoke) und trennt Renderer strikt
 * von Node.js / require().
 */

(function () {
    'use strict';

    class GaebTenderController {
        constructor() {
            this.modalId = 'gaeb-tender-modal';
            this.selectedImportInfo = null;
        }

        async getIpc() {
            if (window.api && typeof window.api.invoke === 'function') {
                return window.api;
            }
            throw new Error('Electron IPC (window.api) nicht verfügbar.');
        }

        /**
         * Öffnet das Ausschreibungs-Bepreisungs-Modal für einen Import / Draft
         * @param {number} [importId] 
         * @param {number} [draftId] 
         */
        async openModal(importId, draftId) {
            try {
                // 1. Modal im DOM sicherstellen
                if (!document.getElementById(this.modalId)) {
                    if (window.ModalLoader && typeof window.ModalLoader.mountModal === 'function') {
                        window.ModalLoader.mountModal(this.modalId);
                    }
                }

                // Modal sichtbar machen
                const modalEl = document.getElementById(this.modalId);
                if (modalEl) {
                    modalEl.classList.remove('hidden');
                }

                // 2. Ohne explizite importId: Zeige IMMER die Auswahlliste aller Importe!
                // Kein stiller Fallback auf imports[0], keine automatische Draft-Erstellung!
                let targetImportId = importId ? Number(importId) : null;
                if (!targetImportId) {
                    await this.showImportList();
                    return;
                }

                // 3. Mit expliziter importId: Prüfe serverseitig via IPC, ob der Import existiert
                const api = await this.getIpc();
                const imports = await api.invoke('gaeb:list-imports');
                const matchingImport = Array.isArray(imports) ? imports.find(i => i.id === targetImportId) : null;
                if (!matchingImport) {
                    alert(`GAEB-Import mit ID ${targetImportId} existiert nicht.`);
                    await this.showImportList();
                    return;
                }

                this.selectedImportInfo = matchingImport;

                // 4. Wenn zusätzlich draftId übergeben wurde: Validiere, dass der Entwurf zum Import gehört
                let targetDraftId = draftId ? Number(draftId) : null;
                if (targetDraftId) {
                    const drafts = await api.invoke('gaeb:list-tender-drafts', targetImportId);
                    const matchingDraft = Array.isArray(drafts) ? drafts.find(d => d.id === targetDraftId) : null;
                    if (!matchingDraft) {
                        alert(`Entwurf #${targetDraftId} gehört nicht zum GAEB-Import #${targetImportId}.`);
                        await this.showDraftList(targetImportId);
                        return;
                    }
                    await this.openDraft(targetDraftId, targetImportId);
                    return;
                }

                // 5. Nur importId ohne draftId: Zeige die Entwurfsübersicht für diesen Import!
                // Erstelle NIEMALS einen Entwurf allein durch das Öffnen des Modals!
                await this.showDraftList(targetImportId);

            } catch (err) {
                console.error('[GAEB Tender Controller] Fehler beim Öffnen des Modals:', err);
                alert(`Fehler beim Öffnen der Ausschreibung: ${err.message}`);
            }
        }

        /**
         * Zeigt die Übersicht aller importierten Ausschreibungen
         */
        async showImportList() {
            try {
                const api = await this.getIpc();
                window.GaebTenderView.setViewMode('import-list');

                const imports = await api.invoke('gaeb:list-imports');
                window.GaebTenderView.renderImportList(imports);
            } catch (err) {
                console.error('[GAEB Tender Controller] Fehler beim Laden der Importliste:', err);
                const errorEl = document.getElementById('gt-error-imports');
                const errorMsg = document.getElementById('gt-error-imports-msg');
                if (errorEl && errorMsg) {
                    errorEl.classList.remove('hidden');
                    errorMsg.textContent = `Fehler beim Laden der Ausschreibungen: ${err.message}`;
                }
            }
        }

        /**
         * Wählt einen Import aus der Liste aus und wechselt zur Entwurfsübersicht
         * @param {number} importId 
         */
        async selectImport(importId) {
            if (!importId) return;
            await this.showDraftList(Number(importId));
        }

        /**
         * Zeigt die Entwurfsübersicht für einen spezifischen Import
         * @param {number} importId 
         */
        async showDraftList(importId) {
            try {
                const api = await this.getIpc();
                const targetImportId = Number(importId);

                // Import-Informationen beschaffen
                const imports = await api.invoke('gaeb:list-imports');
                const importInfo = Array.isArray(imports) ? imports.find(i => i.id === targetImportId) : null;
                if (!importInfo) {
                    alert(`Import #${targetImportId} nicht gefunden.`);
                    await this.showImportList();
                    return;
                }

                this.selectedImportInfo = importInfo;

                // Entwürfe für diesen Import laden
                const drafts = await api.invoke('gaeb:list-tender-drafts', targetImportId);
                window.GaebTenderView.renderDraftList(importInfo, drafts);
            } catch (err) {
                console.error('[GAEB Tender Controller] Fehler beim Laden der Entwurfsliste:', err);
                alert(`Fehler beim Laden der Entwürfe: ${err.message}`);
            }
        }

        /**
         * Erstellt gezielt einen neuen Bepreisungsentwurf für den aktuell ausgewählten Import
         */
        async createNewDraftForSelectedImport() {
            const importId = this.selectedImportInfo?.id || window.GaebTenderState.currentImportId;
            if (!importId) {
                alert('Kein Import ausgewählt.');
                return;
            }
            await this.createNewDraftForImport(importId);
        }

        /**
         * Erstellt gezielt einen neuen Bepreisungsentwurf für einen Import
         * @param {number} importId 
         */
        async createNewDraftForImport(importId) {
            try {
                const api = await this.getIpc();
                const targetImportId = Number(importId);

                const newDraft = await api.invoke('gaeb:create-tender-draft', {
                    importId: targetImportId
                });

                if (typeof showToast === 'function') {
                    showToast(`Neuer Bepreisungsentwurf '${newDraft.name}' angelegt.`, 'success');
                }

                await this.openDraft(newDraft.id, targetImportId);
            } catch (err) {
                console.error('[GAEB Tender Controller] Fehler beim Anlegen des Entwurfs:', err);
                alert(`Fehler beim Erstellen des Bepreisungsentwurfs: ${err.message}`);
            }
        }

        /**
         * Öffnet einen Entwurf im Bepreisungs-Editor
         * @param {number} draftId 
         * @param {number} [importId] 
         */
        async openDraft(draftId, importId) {
            try {
                const api = await this.getIpc();
                const targetDraftId = Number(draftId);

                const loadResult = await api.invoke('gaeb:load-tender-draft', targetDraftId);
                if (!loadResult || !loadResult.draft) {
                    throw new Error(`Entwurf #${targetDraftId} konnte nicht geladen werden.`);
                }

                const actualImportId = loadResult.draft.import_id;
                if (importId && Number(importId) !== actualImportId) {
                    throw new Error(`Datenmischung verhindert: Entwurf #${targetDraftId} gehört zu Import #${actualImportId}, nicht zu #${importId}.`);
                }

                const drafts = await api.invoke('gaeb:list-tender-drafts', actualImportId);

                window.GaebTenderState.init(loadResult, drafts);
                window.GaebTenderView.renderAll(window.GaebTenderState);
            } catch (err) {
                console.error('[GAEB Tender Controller] Fehler beim Öffnen des Entwurfs:', err);
                alert(`Fehler beim Öffnen des Entwurfs: ${err.message}`);
            }
        }

        /**
         * Kehrt zur Importauswahl zurück (mit Dirty-Check)
         */
        async backToImportList() {
            if (window.GaebTenderState.isDirty) {
                const proceed = confirm('Sie haben ungespeicherte Änderungen am Entwurf. Wirklich zur Importauswahl zurückkehren und Änderungen verwerfen?');
                if (!proceed) return;
                window.GaebTenderState.isDirty = false;
            }
            window.GaebTenderState.reset();
            await this.showImportList();
        }

        /**
         * Kehrt zur Entwurfsübersicht des aktuellen Imports zurück (mit Dirty-Check)
         */
        async backToDraftList() {
            if (window.GaebTenderState.isDirty) {
                const proceed = confirm('Sie haben ungespeicherte Änderungen am Entwurf. Wirklich zur Entwurfsübersicht zurückkehren und Änderungen verwerfen?');
                if (!proceed) return;
                window.GaebTenderState.isDirty = false;
            }
            const importId = window.GaebTenderState.currentImportId || this.selectedImportInfo?.id;
            window.GaebTenderState.reset();
            if (importId) {
                await this.showDraftList(importId);
            } else {
                await this.showImportList();
            }
        }

        /**
         * Schließt das Modal
         */
        closeModal() {
            if (window.GaebTenderState.isDirty) {
                const proceed = confirm('Sie haben ungespeicherte Änderungen am Entwurf. Wirklich schließen?');
                if (!proceed) return;
            }

            const modalEl = document.getElementById(this.modalId);
            if (modalEl) {
                modalEl.classList.add('hidden');
            }
            window.GaebTenderState.reset();
        }

        /**
         * Wählt eine Position im Baum aus
         * @param {number} itemId 
         */
        selectItem(itemId) {
            window.GaebTenderState.selectItem(itemId);
            window.GaebTenderView.renderTree(window.GaebTenderState);
            window.GaebTenderView.renderDetail(window.GaebTenderState);
        }

        /**
         * Einheitspreis-Änderung verarbeiten
         * @param {string} value 
         */
        onUnitPriceInput(value) {
            const item = window.GaebTenderState.getSelectedItem();
            if (!item) return;

            window.GaebTenderState.updateItemPrice(item._dbId, { unit_price: value });
            window.GaebTenderView.renderDetail(window.GaebTenderState);
            window.GaebTenderView.renderFooter(window.GaebTenderState);
            window.GaebTenderView.renderHeader(window.GaebTenderState);
            window.GaebTenderView.renderTree(window.GaebTenderState);
        }

        /**
         * Null-Preis-Bestätigung verarbeiten
         * @param {boolean} checked 
         */
        onZeroConfirmChange(checked) {
            const item = window.GaebTenderState.getSelectedItem();
            if (!item) return;

            window.GaebTenderState.updateItemPrice(item._dbId, { is_zero_confirmed: checked });
            window.GaebTenderView.renderDetail(window.GaebTenderState);
            window.GaebTenderView.renderFooter(window.GaebTenderState);
        }

        /**
         * Einrechnung in Angebotssumme verarbeiten
         * @param {boolean} checked 
         */
        onInTotalChange(checked) {
            const item = window.GaebTenderState.getSelectedItem();
            if (!item) return;

            window.GaebTenderState.updateItemPrice(item._dbId, { in_total: checked });
            window.GaebTenderView.renderFooter(window.GaebTenderState);
        }

        /**
         * Steuersatz ändern
         * @param {string} val 
         */
        onTaxRateChange(val) {
            const item = window.GaebTenderState.getSelectedItem();
            if (!item) return;

            window.GaebTenderState.updateItemPrice(item._dbId, { tax_rate: Number(val) });
            window.GaebTenderView.renderFooter(window.GaebTenderState);
        }

        /**
         * Positionsnotiz ändern
         * @param {string} notes 
         */
        onNotesInput(notes) {
            const item = window.GaebTenderState.getSelectedItem();
            if (!item) return;

            window.GaebTenderState.updateItemPrice(item._dbId, { notes });
        }

        /**
         * BiReq-Antwort erfassen
         * @param {number} bireqId 
         * @param {string} val 
         */
        onBiReqInput(bireqId, val) {
            window.GaebTenderState.updateBiReqAnswer(bireqId, val);
            window.GaebTenderView.renderFooter(window.GaebTenderState);
            window.GaebTenderView.renderHeader(window.GaebTenderState);
            window.GaebTenderView.renderTree(window.GaebTenderState);
        }

        /**
         * Suchleiste im Baum
         * @param {string} query 
         */
        onSearchInput(query) {
            window.GaebTenderState.searchQuery = query;
            window.GaebTenderView.renderTree(window.GaebTenderState);
        }

        /**
         * Filtermodus wechseln ('all' | 'unpriced' | 'bireq')
         * @param {string} mode 
         */
        setFilter(mode) {
            window.GaebTenderState.filterMode = mode;
            window.GaebTenderView.renderTree(window.GaebTenderState);
        }

        /**
         * Speichert den aktuellen Entwurf über IPC in die SQLite-Datenbank
         */
        async saveDraft() {
            try {
                const api = await this.getIpc();
                const saveBtn = document.getElementById('gt-btn-save-draft');
                if (saveBtn) {
                    saveBtn.disabled = true;
                    saveBtn.innerHTML = '<span class="material-symbols-outlined text-[16px] animate-spin">progress_activity</span> Speichere...';
                }

                const payload = window.GaebTenderState.getExportPayload();
                const res = await api.invoke('gaeb:save-tender-draft', {
                    draftId: window.GaebTenderState.currentDraftId,
                    draftData: payload
                });

                window.GaebTenderState.isDirty = false;

                // Aktualisiere Status und Summen aus Backend-Berechnung
                window.GaebTenderState.stats = {
                    ...window.GaebTenderState.stats,
                    total_netto: res.total_netto,
                    total_tax: res.total_tax,
                    total_brutto: res.total_brutto,
                    unpriced_count: res.unpriced_count,
                    missing_bireq_count: res.missing_bireq_count,
                    unresolved_qty_tbd_count: res.unresolved_qty_tbd_count,
                    status: res.status
                };

                window.GaebTenderView.renderHeader(window.GaebTenderState);
                window.GaebTenderView.renderFooter(window.GaebTenderState);

                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">check</span> Gespeichert!';
                    setTimeout(() => {
                        saveBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">save</span> <span>Entwurf speichern</span>';
                    }, 2000);
                }

                if (typeof showToast === 'function') {
                    showToast('Entwurf erfolgreich gespeichert.', 'success');
                }
            } catch (err) {
                console.error('[GAEB Tender Controller] Fehler beim Speichern des Entwurfs:', err);
                alert(`Fehler beim Speichern: ${err.message}`);
                const saveBtn = document.getElementById('gt-btn-save-draft');
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">save</span> <span>Entwurf speichern</span>';
                }
            }
        }

        /**
         * Erstellt eine neue unabhängige Version des Entwurfs (z. B. v2)
         */
        async createNewVersion() {
            try {
                const api = await this.getIpc();
                const curDraft = window.GaebTenderState.draft;
                const defaultName = `${curDraft?.name || 'Entwurf'} (neue Version)`;

                const newName = prompt('Name für die neue Entwurfsversion (optional, leer lassen für automatischen Namen):', defaultName);
                if (newName === null) return;

                const cloned = await api.invoke('gaeb:clone-tender-draft', {
                    draftId: window.GaebTenderState.currentDraftId,
                    options: newName.trim() ? { newName: newName.trim() } : {}
                });

                // Aktualisiere Entwurfs-Auswahl und lade den neuen Entwurf
                const drafts = await api.invoke('gaeb:list-tender-drafts', window.GaebTenderState.currentImportId);
                const loadResult = await api.invoke('gaeb:load-tender-draft', cloned.id);

                window.GaebTenderState.init(loadResult, drafts);
                window.GaebTenderView.renderAll(window.GaebTenderState);

                if (typeof showToast === 'function') {
                    showToast(`Neue Version '${cloned.name}' erfolgreich erstellt.`, 'success');
                }
            } catch (err) {
                console.error('[GAEB Tender Controller] Fehler beim Klonen des Entwurfs:', err);
                alert(`Fehler beim Erstellen einer neuen Version: ${err.message}`);
            }
        }

        /**
         * Wechselt zu einem anderen Entwurf desselben Imports
         * @param {string|number} draftId 
         */
        async switchDraft(draftId) {
            if (!draftId) return;
            const targetId = Number(draftId);
            if (targetId === window.GaebTenderState.currentDraftId) return;

            if (window.GaebTenderState.isDirty) {
                const proceed = confirm('Sie haben ungespeicherte Änderungen. Vor dem Wechsel verwerfen?');
                if (!proceed) {
                    const select = document.getElementById('gt-draft-select');
                    if (select) select.value = String(window.GaebTenderState.currentDraftId);
                    return;
                }
            }

            try {
                const api = await this.getIpc();
                const loadResult = await api.invoke('gaeb:load-tender-draft', targetId);
                const drafts = await api.invoke('gaeb:list-tender-drafts', window.GaebTenderState.currentImportId);

                window.GaebTenderState.init(loadResult, drafts);
                window.GaebTenderView.renderAll(window.GaebTenderState);
            } catch (err) {
                console.error('[GAEB Tender Controller] Fehler beim Wechseln des Entwurfs:', err);
                alert(`Fehler beim Laden des Entwurfs: ${err.message}`);
            }
        }
    }

    const controller = new GaebTenderController();
    window.GaebTenderController = controller;
    window.openGaebTenderModal = (importId, draftId) => controller.openModal(importId, draftId);
    window.closeGaebTenderModal = () => controller.closeModal();
})();
