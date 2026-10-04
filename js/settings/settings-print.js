(function() {
async function generatePdf(id, isAngebot = false) {
    const idNum = parseInt(id);
    const rech = isAngebot ? state.angebote.find(r => parseInt(r.id) === idNum) : state.rechnungen.find(r => parseInt(r.id) === idNum);
    if (!rech) return;

    // GoBD Compliance Lock (Invoices only)
    if (!isAngebot && rech.status !== 'Entwurf' && !rech.isLocked) {
        if (!(await safeConfirm(`Durch das Generieren des PDFs wird die Rechnung ${rech.nr} finalisiert und für nachträgliche Änderungen gesperrt (GoBD-konform). Möchten Sie fortfahren?`))) {
            return;
        }
        rech.isLocked = true;
        // Save to database
        await window.api.saveDocument(rech);
        
        // Re-render dashboard behind modal
        if (document.getElementById('view-dashboard') && !document.getElementById('view-dashboard').classList.contains('hidden')) {
            renderDashboard();
        } else if (document.getElementById('view-rechnungen') && !document.getElementById('view-rechnungen').classList.contains('hidden')) {
            renderRechnungen();
        }
    }

    const kundeId = parseInt(rech.kundeId);
    const kunde = state.kunden.find(k => parseInt(k.id) === kundeId) || {};
    const templateHtml = await buildInvoiceDocumentHtml(rech, kunde, isAngebot);
    const template = document.getElementById('print-template');
    template.innerHTML = templateHtml;

    const pdfFilename = `${isAngebot ? 'Angebot' : 'Rechnung'}_${rech.nr || 'Dokument'}.pdf`;
    setTimeout(() => {
        openPdfPreview(template.innerHTML, pdfFilename);
    }, 50);
};

async function renderInvoiceForZugferdExport(rech, kunde) {
    const template = document.getElementById('print-template');
    if (!template) throw new Error('Druckvorlage (#print-template) nicht gefunden.');
    const previousHtml = template.innerHTML;
    const templateHtml = await buildInvoiceDocumentHtml(rech, kunde || {}, false);
    template.innerHTML = templateHtml;
    await new Promise(resolve => setTimeout(resolve, 150));
    return previousHtml;
};

function restorePrintTemplateContent(previousHtml) {
    const template = document.getElementById('print-template');
    if (template && typeof previousHtml === 'string') {
        template.innerHTML = previousHtml;
    }
};

function openPdfPreview(htmlContent, filename = 'Rechnung.pdf') {
    if (window.invoiceView && typeof window.invoiceView.openPdfPreview === 'function') {
        window.invoiceView.openPdfPreview(htmlContent, filename);
    } else {
        const previewContainer = document.getElementById('pdf-preview-container');
        const modal = document.getElementById('pdf-preview-modal');
        if (previewContainer && modal) {
            previewContainer.innerHTML = htmlContent;
            previewContainer.dataset.filename = filename;
            modal.style.display = '';
            modal.style.zIndex = '';
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
    }
}

function closePdfPreview() {
    if (window.invoiceView && typeof window.invoiceView.closePdfPreview === 'function') {
        window.invoiceView.closePdfPreview();
    } else {
        const modal = document.getElementById('pdf-preview-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            modal.style.display = 'none';
            modal.style.zIndex = '-10';
        }
    }
}

async function executePrint(mode = 'print') {
    const printBtn = document.getElementById('pdf-preview-print-btn');
    const saveBtn = document.getElementById('pdf-preview-save-btn');
    const closeBtn = document.getElementById('pdf-preview-close-btn');

    const setButtonsState = (isBusy) => {
        [printBtn, saveBtn, closeBtn].forEach(btn => {
            if (!btn) return;
            btn.disabled = isBusy;
            if (isBusy) {
                btn.classList.add('opacity-50', 'pointer-events-none');
            } else {
                btn.classList.remove('opacity-50', 'pointer-events-none');
            }
        });
    };

    const closePdfModal = () => {
        if (window.invoiceView && typeof window.invoiceView.closePdfPreview === 'function') {
            window.invoiceView.closePdfPreview();
        } else if (typeof window.closePdfPreview === 'function') {
            window.closePdfPreview();
        }
    };

    try {
        setButtonsState(true);

        const printTemplate = document.getElementById('print-template');
        const previewContainer = document.getElementById('pdf-preview-container');

        if (!previewContainer) {
            console.warn('pdf-preview-container not found');
            return;
        }

        const invoiceElement = document.getElementById('invoice-paper') || previewContainer.querySelector('#invoice-paper') || previewContainer.firstElementChild || previewContainer;
        const filename = previewContainer.dataset.filename || 'Rechnung.pdf';

        // Synchronisiere #print-template für Nativ-Electron printToPDF und Browserdruck
        if (printTemplate) {
            printTemplate.innerHTML = invoiceElement.outerHTML || previewContainer.innerHTML;
        }
        await new Promise(resolve => setTimeout(resolve, 60));

        if (mode === 'save') {
            if (window.api && typeof window.api.savePdf === 'function') {
                // 100% Nativ Electron - Absolut Freeze-sicher (Bypass html2pdf & html2canvas)
                const result = await window.api.savePdf(null, filename);
                if (result && result.success) {
                    showToast('PDF erfolgreich gespeichert', 'success');
                    closePdfModal();
                } else if (result && !result.cancelled) {
                    showToast('Fehler beim Speichern der PDF', 'error');
                }
            } else {
                // Fallback nur für normale Webbrowser (ohne Electron window.api)
                if (typeof html2pdf !== 'undefined') {
                    const opt = {
                        margin: [12, 15, 12, 15],
                        filename: filename,
                        image: { type: 'jpeg', quality: 0.98 },
                        html2canvas: { scale: 2, useCORS: true, allowTaint: true, windowWidth: 1024, logging: false },
                        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                        pagebreak: { mode: ['css', 'legacy'], avoid: ['.avoid-break', '.pdf-no-break', '.pdf-footer'] }
                    };
                    showToast('PDF-Export wird vorbereitet...', 'info');
                    await html2pdf().set(opt).from(invoiceElement.cloneNode(true)).save();
                    showToast('PDF erfolgreich gespeichert', 'success');
                    closePdfModal();
                } else {
                    showToast('PDF-Export im Browser nicht möglich.', 'error');
                }
            }
        } else {
            // Druck-Modus
            if (window.api && typeof window.api.printDocument === 'function') {
                const printRes = await window.api.printDocument();
                if (printRes && printRes.success) {
                    showToast('Druckauftrag gesendet', 'success');
                    closePdfModal();
                }
            } else {
                window.print();
                closePdfModal();
            }
        }
    } catch (globalErr) {
        console.error('executePrint unhandled error:', globalErr);
        showToast('Druckvorgang konnte nicht ausgeführt werden.', 'error');
    } finally {
        // 1. Verwaiste html2pdf-Container killen
        document.querySelectorAll('.html2pdf__container, iframe.html2canvas-container').forEach(el => {
            el.remove();
        });

        // 2. Pointer-Events korrekt zurücksetzen
        document.body.style.pointerEvents = '';
        const modal = document.getElementById('pdf-preview-modal');
        if (modal) modal.style.pointerEvents = '';

        // 3. Lade-Overlays abschalten
        ['loading-overlay', 'spinner', 'global-loading'].forEach(id => {
            const spinner = document.getElementById(id);
            if (spinner) {
                spinner.classList.add('hidden');
                spinner.style.display = 'none';
            }
        });

        // 4. Frische Referenzen holen und hart entsperren
        const pBtn = document.getElementById('pdf-preview-print-btn');
        const sBtn = document.getElementById('pdf-preview-save-btn');
        const cBtn = document.getElementById('pdf-preview-close-btn');
        [pBtn, sBtn, cBtn].forEach(btn => {
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'pointer-events-none');
            }
        });

        // 5. Events sicher neu binden
        if (window.invoiceView && typeof window.invoiceView.bindPdfModalControls === 'function') {
            window.invoiceView.bindPdfModalControls();
        }

        // 6. Fokus zurückholen
        if (typeof window.focus === 'function') window.focus();

        if (window.api && typeof window.api.focusWindow === 'function') {
            try {
                window.api.focusWindow();
            } catch (e) {
                // Focus API Fallback ignoriert
            }
        }
    }
}


    if (typeof window !== 'undefined') window.generatePdf = generatePdf;
    if (typeof window !== 'undefined') window.renderInvoiceForZugferdExport = renderInvoiceForZugferdExport;
    if (typeof window !== 'undefined') window.restorePrintTemplateContent = restorePrintTemplateContent;
    if (typeof window !== 'undefined') window.openPdfPreview = openPdfPreview;
    if (typeof window !== 'undefined') window.closePdfPreview = closePdfPreview;
    if (typeof window !== 'undefined') window.executePrint = executePrint;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { generatePdf, renderInvoiceForZugferdExport, restorePrintTemplateContent, openPdfPreview, closePdfPreview, executePrint };
    }
})();
