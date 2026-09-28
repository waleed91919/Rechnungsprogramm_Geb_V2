/**
 * js/gaeb_tender/tender_state.js
 * Zentraler State-Manager für die GAEB-Ausschreibungsbepreisung im Frontend.
 */

(function () {
    'use strict';

    class GaebTenderStateManager {
        constructor() {
            this.reset();
        }

        reset() {
            this.currentImportId = null;
            this.currentDraftId = null;
            this.availableDrafts = [];
            this.draft = null;
            this.tree = [];
            this.items = [];
            this.itemsMap = new Map();
            this.bireqsMap = new Map();
            this.projectInfo = {};
            this.stats = {};
            this.selectedItemId = null;
            this.filterMode = 'all'; // 'all' | 'unpriced' | 'bireq'
            this.searchQuery = '';
            this.isDirty = false;
        }

        init(loadResult, availableDrafts = []) {
            this.reset();
            if (!loadResult) return;

            this.draft = loadResult.draft;
            this.currentDraftId = loadResult.draft.id;
            this.currentImportId = loadResult.draft.import_id;
            this.tree = loadResult.tree || [];
            this.items = loadResult.items || [];
            this.projectInfo = loadResult.projectInfo || {};
            this.stats = loadResult.stats || {};
            this.availableDrafts = availableDrafts || [];

            // Schnelle Lookup-Maps aufbauen
            this.items.forEach(it => {
                this.itemsMap.set(it._dbId, it);
                if (Array.isArray(it.bieterangaben)) {
                    it.bieterangaben.forEach(b => {
                        this.bireqsMap.set(b.id || b._dbId, { ...b, item_id: it._dbId });
                    });
                }
            });

            // Standardmäßig erstes bepreisbares Item auswählen (oder das erste überhaupt)
            const firstPriceable = this.items.find(i => !i.isHinweistext) || this.items[0];
            if (firstPriceable) {
                this.selectedItemId = firstPriceable._dbId;
            }
        }

        getSelectedItem() {
            if (!this.selectedItemId) return null;
            return this.itemsMap.get(this.selectedItemId) || null;
        }

        selectItem(itemId) {
            this.selectedItemId = Number(itemId);
        }

        updateItemPrice(itemId, patch = {}) {
            const item = this.itemsMap.get(Number(itemId));
            if (!item || item.isHinweistext) return;

            if ('unit_price' in patch) {
                const val = patch.unit_price;
                if (val === null || val === undefined || String(val).trim() === '') {
                    item.unit_price = null;
                    item.is_priced = false;
                } else {
                    const num = Number(val);
                    item.unit_price = isNaN(num) ? null : Math.max(0, num);
                    item.is_priced = item.unit_price !== null;
                }
            }

            if ('is_zero_confirmed' in patch) {
                item.is_zero_confirmed = Boolean(patch.is_zero_confirmed);
            }

            if ('in_total' in patch) {
                item.in_total = Boolean(patch.in_total);
                item.in_endsumme_enthalten = item.in_total ? 1 : 0;
            }

            if ('tax_rate' in patch) {
                item.tax_rate = Number(patch.tax_rate) || 19.0;
            }

            if ('notes' in patch) {
                item.draft_notes = String(patch.notes || '');
            }

            // Gesamtpreis berechnen
            if (item.unit_price !== null && !item.isQtyTBD && item.menge !== null) {
                item.total_price = Math.round((item.unit_price * item.menge) * 100) / 100;
            } else {
                item.total_price = null;
            }

            this.isDirty = true;
            this.recalculateTotals();
        }

        updateBiReqAnswer(bireqId, answerVal) {
            const bireqNum = Number(bireqId);
            const val = String(answerVal || '').trim();

            for (const item of this.items) {
                if (Array.isArray(item.bieterangaben)) {
                    const target = item.bieterangaben.find(b => (b.id === bireqNum || b._dbId === bireqNum));
                    if (target) {
                        target.answer_value = val;
                        target.is_answered = val.length > 0;
                        break;
                    }
                }
            }

            if (this.bireqsMap.has(bireqNum)) {
                const b = this.bireqsMap.get(bireqNum);
                b.answer_value = val;
                b.is_answered = val.length > 0;
            }

            this.isDirty = true;
            this.recalculateTotals();
        }

        recalculateTotals() {
            let sumNetto = 0;
            let sumTax = 0;
            let unpriced = 0;
            let priceableCount = 0;

            for (const item of this.items) {
                if (item.isHinweistext) continue;
                priceableCount++;

                if (item.unit_price === null) {
                    unpriced++;
                } else if (item.in_total && item.total_price !== null) {
                    sumNetto += item.total_price;
                    const taxRate = item.tax_rate !== undefined ? item.tax_rate : 19.0;
                    sumTax += (item.total_price * (taxRate / 100.0));
                }
            }

            // Offene BiReqs zählen
            let missingBiReq = 0;
            for (const [, bireq] of this.bireqsMap.entries()) {
                if (!bireq.answer_value || bireq.answer_value.trim().length === 0) {
                    missingBiReq++;
                }
            }

            sumNetto = Math.round(sumNetto * 100) / 100;
            sumTax = Math.round(sumTax * 100) / 100;
            const sumBrutto = Math.round((sumNetto + sumTax) * 100) / 100;

            const isFullyPriced = (unpriced === 0 && missingBiReq === 0);
            const status = this.draft?.status === 'VERWORFEN' ? 'VERWORFEN' : (isFullyPriced ? 'VOLLSTAENDIG_BEPREIST' : 'IN_BEARBEITUNG');

            this.stats = {
                ...this.stats,
                total_netto: sumNetto,
                total_tax: sumTax,
                total_brutto: sumBrutto,
                unpriced_count: unpriced,
                priceable_items_count: priceableCount,
                priced_items_count: priceableCount - unpriced,
                missing_bireq_count: missingBiReq,
                status
            };

            if (this.draft) {
                this.draft.total_netto = sumNetto;
                this.draft.total_tax = sumTax;
                this.draft.total_brutto = sumBrutto;
                this.draft.unpriced_count = unpriced;
                this.draft.missing_bireq_count = missingBiReq;
                this.draft.status = status;
            }
        }

        getExportPayload() {
            const prices = [];
            const bireq_answers = [];

            for (const item of this.items) {
                if (item.isHinweistext) continue;

                prices.push({
                    gaeb_item_id: item._dbId,
                    unit_price: item.unit_price,
                    is_zero_confirmed: item.is_zero_confirmed ? 1 : 0,
                    in_total: item.in_total ? 1 : 0,
                    tax_rate: item.tax_rate !== undefined ? item.tax_rate : 19.0,
                    notes: item.draft_notes || null
                });

                if (Array.isArray(item.bieterangaben)) {
                    for (const b of item.bieterangaben) {
                        bireq_answers.push({
                            gaeb_bireq_id: b.id || b._dbId,
                            answer_value: b.answer_value || ''
                        });
                    }
                }
            }

            return {
                name: this.draft?.name,
                version: this.draft?.version,
                angebotId: this.draft?.angebot_id,
                status: this.stats.status,
                prices,
                bireq_answers
            };
        }
    }

    window.GaebTenderState = new GaebTenderStateManager();
})();
