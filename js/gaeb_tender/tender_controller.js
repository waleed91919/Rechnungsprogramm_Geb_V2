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
                const api = await this.getIpc();

                // 1. Modal im DOM sicherstellen
                if (!document.getElementById(this.modalId)) {
                    if (window.ModalLoader && typeof window.ModalLoader.mountModal === 'function') {
                        window.ModalLoader.mountModal(this.modalId);
                    }
                }

                // 2. Import-ID ermitteln falls nicht übergeben
                let targetImportId = importId ? Number(importId) : null;
                if (!targetImportId) {
                    const imports = await api.invoke('gaeb:list-imports');
                    if (!Array.isArray(imports) || imports.length === 0) {
                        alert('Keine GAEB-Importe vorhanden. Bitte importiere zuerst ein X83 Leistungsverzeichnis.');
                        return;
                    }
                    targetImportId = imports[0].id;
                }

                // 3. Drafts für diesen Import ermitteln
                let drafts = await api.invoke('gaeb:list-tender-drafts', targetImportId);
                let targetDraftId = draftId ? Number(draftId) : null;

                if (!targetDraftId) {
                    if (Array.isArray(drafts) && drafts.length > 0) {
                        targetDraftId = drafts[0].id;
                    } else {
                        // Noch kein Draft vorhanden: Initial v1 atomar anlegen
                        const newDraft = await api.invoke('gaeb:create-tender-draft', {
                            importId: targetImportId,
                            options: { name: 'Hauptangebot v1', version: 1 }
                        });
                        targetDraftId = newDraft.id;
                        drafts = [newDraft];
                    }
                }

                // 4. Draft-Daten vollständig laden
                const loadResult = await api.invoke('gaeb:load-tender-draft', targetDraftId);

                // 5. State & View initialisieren
                window.GaebTenderState.init(loadResult, drafts);
                window.GaebTenderView.renderAll(window.GaebTenderState);

                // 6. Modal anzeigen
                const modalEl = document.getElementById(this.modalId);
                if (modalEl) {
                    modalEl.classList.remove('hidden');
                }
            } catch (err) {
                console.error('[GAEB Tender Controller] Fehler beim Öffnen des Modals:', err);
                alert(`Fehler beim Öffnen der Ausschreibung: ${err.message}`);
            }
        }

        /**
         * Schließt das Modal
         */
        closeModal() {
            if (window.GaebTenderState.isDirty) {
                const proceed = confirm('Du hast ungespeicherte Änderungen am Entwurf. Wirklich schließen?');
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
                const nextVersion = (curDraft?.version || 1) + 1;
                const defaultName = `${curDraft?.name || 'Entwurf'} v${nextVersion}`;

                const newName = prompt('Name für die neue Entwurfsversion:', defaultName);
                if (newName === null) return;

                const cloned = await api.invoke('gaeb:clone-tender-draft', {
                    draftId: window.GaebTenderState.currentDraftId,
                    options: { newName: newName.trim() || defaultName, newVersion: nextVersion }
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
                const proceed = confirm('Du hast ungespeicherte Änderungen. Vor dem Wechsel verwerfen?');
                if (!proceed) {
                    // Zurücksetzen des Dropdowns
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
