/**
 * InvoiceView.js - Reine Präsentationsschicht & DOM-Interaktion für den Rechnungseditor & PDF-Vorschau
 */
window.InvoiceView = class InvoiceView {
    constructor(formatCurrencyFn) {
        this.formatCurrency = typeof formatCurrencyFn === 'function' ? formatCurrencyFn : (val => (typeof window.formatCurrency === 'function' ? window.formatCurrency(val) : val.toFixed(2) + ' €'));
        this.initPdfModalEvents();
    }

    /**
     * Registriert Event-Listener für das PDF-Vorschau Modal (Drucken, Speichern, Schließen).
     */
    initPdfModalEvents() {
        if (typeof document === 'undefined') return;

        const setupEvents = () => {
            this.bindPdfModalControls();
        };

        if (document.readyState === 'interactive' || document.readyState === 'complete') {
            setupEvents();
        } else {
            document.addEventListener('DOMContentLoaded', setupEvents);
        }
    }

    bindPdfModalControls() {
        const modal = document.getElementById('pdf-preview-modal');
        if (!modal) return;

        // 1. Schließen-Button ('X')
        const closeBtn = document.getElementById('pdf-preview-close-btn');
        if (closeBtn) {
            closeBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.closePdfPreview();
            };
        }

        // 2. Drucken-Button
        const printBtn = document.getElementById('pdf-preview-print-btn');
        if (printBtn) {
            printBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof window.executePrint === 'function') {
                    window.executePrint('print');
                }
            };
        }

        // 3. Als PDF Speichern Button
        const saveBtn = document.getElementById('pdf-preview-save-btn');
        if (saveBtn) {
            saveBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof window.executePrint === 'function') {
                    window.executePrint('save');
                }
            };
        }

        // 3b. Per E-Mail senden Button (F10)
        const emailBtn = document.getElementById('pdf-preview-email-btn');
        if (emailBtn) {
            emailBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof window.openBelegEmailModal === 'function') {
                    window.openBelegEmailModal();
                }
            };
        }

        // 4. Backdrop-Klick außerhalb des Rechnungs-Papiers schließt Modal
        const scrollWrapper = document.getElementById('pdf-preview-scroll-wrapper');
        if (scrollWrapper) {
            scrollWrapper.onclick = (e) => {
                if (e.target === scrollWrapper) {
                    this.closePdfPreview();
                }
            };
        }

        // 5. Keydown Handler für ESC-Taste
        if (!this.boundKeyDownHandler) {
            this.boundKeyDownHandler = (e) => {
                if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
                    this.closePdfPreview();
                }
            };
            document.addEventListener('keydown', this.boundKeyDownHandler);
        }
    }

    /**
     * Öffnet das PDF-Vorschau Modal mit HTML-Inhalt.
     */
    openPdfPreview(htmlContent, filename = 'Rechnung.pdf') {
        const previewContainer = document.getElementById('pdf-preview-container');
        const modal = document.getElementById('pdf-preview-modal');

        if (!modal || !previewContainer) {
            console.warn("PDF Modal-Elemente nicht gefunden im DOM.");
            return;
        }

        this.bindPdfModalControls();

        previewContainer.innerHTML = htmlContent;
        previewContainer.dataset.filename = filename;

        modal.style.display = '';
        modal.style.zIndex = '';
        modal.classList.remove('hidden');
        modal.classList.add('flex');

        const scrollWrapper = document.getElementById('pdf-preview-scroll-wrapper');
        if (scrollWrapper) {
            scrollWrapper.scrollTop = 0;
        }
    }

    /**
     * Schließt das PDF-Vorschau Modal sicher ohne den Main-Thread zu blockieren.
     */
    closePdfPreview() {
        const modal = document.getElementById('pdf-preview-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            modal.style.removeProperty('display');
            modal.style.removeProperty('z-index');
        }
    }

    /**
     * Liest aktuelle UI-Formulardaten aus dem DOM.
     */
    getFormData(currentPositions = [], currentVerrechnungen = [], currentProjekt = null) {
        const modeEl = document.getElementById('rechnung-eingabemodus');
        const is13bEl = document.getElementById('rechnung-13b-ustg');
        const rabattValEl = document.getElementById('rechnung-global-rabatt');
        const rabattTypeEl = document.getElementById('rechnung-global-rabatt-type');
        const anzahlungEl = document.getElementById('rechnung-anzahlung');

        return {
            positionen: currentPositions,
            verrechnungen: currentVerrechnungen,
            mode: modeEl ? modeEl.value : 'netto',
            isGlobal13b: is13bEl ? is13bEl.checked : false,
            globalRabatt: {
                value: parseFloat(rabattValEl?.value) || 0,
                type: rabattTypeEl?.value || '%'
            },
            sicherheitseinbehaltProzent: currentProjekt?.sicherheitseinbehalt_prozent || 0,
            anzahlung: parseFloat(anzahlungEl?.value) || 0
        };
    }

    /**
     * Aktualisiert alle relevanten DOM-Elemente basierend auf dem Berechnungsergebnis des Controllers.
     */
    updateTotalsUI(calculated) {
        const fmt = (v) => (typeof window.formatCurrency === 'function' ? window.formatCurrency(v) : this.formatCurrency(v));

        // 1. Zwischensumme
        const zwischensummeEl = document.getElementById('rechnung-zwischensumme');
        if (zwischensummeEl) {
            zwischensummeEl.innerText = fmt(calculated.zwischensumme);
        }

        // 2. Steuern-Container
        const taxContainer = document.getElementById('rechnung-steuern-container');
        if (taxContainer) {
            taxContainer.innerHTML = '';
            if (!calculated.taxBreakdown || calculated.taxBreakdown.length === 0 || calculated.totalTax === 0) {
                const emptyDiv = document.createElement('div');
                emptyDiv.className = 'text-right text-xs text-slate-400 italic';
                emptyDiv.textContent = 'Keine Steuern berechnet';
                taxContainer.appendChild(emptyDiv);
            } else {
                calculated.taxBreakdown.forEach(taxItem => {
                    const div = document.createElement('div');
                    div.className = 'flex justify-between items-center text-slate-500';
                    const spanLabel = document.createElement('span');
                    spanLabel.textContent = taxItem.label;
                    const spanVal = document.createElement('span');
                    spanVal.className = 'font-mono';
                    spanVal.textContent = fmt(taxItem.amount);
                    div.appendChild(spanLabel);
                    div.appendChild(spanVal);
                    taxContainer.appendChild(div);
                });
            }
        }

        // 3. Sicherheitseinbehalt Zeile
        const sichRow = document.getElementById('rechnung-sicherheitseinbehalt-row');
        if (sichRow) {
            if (calculated.sicherheitseinbehaltNetto > 0) {
                sichRow.classList.remove('hidden');
                const lbl = document.getElementById('rechnung-sicherheitseinbehalt-label');
                const val = document.getElementById('rechnung-sicherheitseinbehalt-wert');
                if (lbl) lbl.innerText = `Sicherheitseinbehalt Netto (${calculated.sicherheitseinbehaltProzent}%)`;
                if (val) val.innerText = '-' + fmt(calculated.sicherheitseinbehaltNetto);
            } else {
                sichRow.classList.add('hidden');
            }
        }

        // 4. Verrechnungen Zeile
        const verrRow = document.getElementById('rechnung-verrechnungen-row');
        if (verrRow) {
            if (calculated.verrechnungenSummeNetto > 0) {
                verrRow.classList.remove('hidden');
                const verrWert = document.getElementById('rechnung-verrechnungen-wert');
                if (verrWert) verrWert.innerText = '-' + fmt(calculated.verrechnungenSummeNetto);
            } else {
                verrRow.classList.add('hidden');
            }
        }

        // 5. Rabatt, Netto, Brutto, Anzahlung & Zahlbetrag
        const rabattWertEl = document.getElementById('rechnung-rabatt-wert');
        if (rabattWertEl) rabattWertEl.innerText = '-' + fmt(calculated.abzug);

        const nettoEl = document.getElementById('rechnung-netto');
        if (nettoEl) nettoEl.innerText = fmt(calculated.nettoNachRabatt);

        const bruttoEl = document.getElementById('rechnung-brutto');
        if (bruttoEl) bruttoEl.innerText = fmt(calculated.bruttoNachRabatt);

        const anzahlungWertEl = document.getElementById('rechnung-anzahlung-wert');
        if (anzahlungWertEl) {
            anzahlungWertEl.innerText = calculated.anzahlung > 0 ? '-' + fmt(calculated.anzahlung) : '-';
        }

        const zahlbetragEl = document.getElementById('rechnung-zahlbetrag');
        if (zahlbetragEl) zahlbetragEl.innerText = fmt(calculated.zahlbetrag);
    }

    /**
     * Führt die Neuberechnung über den Controller aus und aktualisiert das UI.
     */
    handleInputEvent(currentPositions, currentVerrechnungen, currentProjekt, onCalculatedCallback) {
        const formData = this.getFormData(currentPositions, currentVerrechnungen, currentProjekt);
        const result = window.InvoiceController.calculateTotals(formData);
        this.updateTotalsUI(result);
        if (typeof onCalculatedCallback === 'function') {
            onCalculatedCallback(result);
        }
        return result;
    }
};
