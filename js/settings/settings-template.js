(function() {
    // Fassade für Abwärtskompatibilität.
    // Die tatsächliche Logik liegt unter js/settings/templates/

    const _formatGermanDate = (typeof window !== 'undefined' && window.formatGermanDate) ? window.formatGermanDate : null;
    const _formatIban = (typeof window !== 'undefined' && window.formatIban) ? window.formatIban : null;
    const _getAngebotKonditionenText = (typeof window !== 'undefined' && window.getAngebotKonditionenText) ? window.getAngebotKonditionenText : null;
    const _buildInvoiceDocumentHtml = (typeof window !== 'undefined' && window.buildInvoiceDocumentHtml) ? window.buildInvoiceDocumentHtml : null;

    function getFormatters() {
        if (typeof require !== 'undefined') {
            try { return require('./templates/template-editor'); } catch (e) {}
        }
        return { formatGermanDate: _formatGermanDate, formatIban: _formatIban };
    }
    
    function getEmail() {
        if (typeof require !== 'undefined') {
            try { return require('./templates/template-email'); } catch (e) {}
        }
        return { getAngebotKonditionenText: _getAngebotKonditionenText };
    }
    
    function getPreview() {
        if (typeof require !== 'undefined') {
            try { return require('./templates/template-preview'); } catch (e) {}
        }
        return { buildInvoiceDocumentHtml: _buildInvoiceDocumentHtml };
    }

    const facade = {
        formatGermanDate: function(...args) { const fn = getFormatters().formatGermanDate || _formatGermanDate; return fn ? fn(...args) : undefined; },
        formatIban: function(...args) { const fn = getFormatters().formatIban || _formatIban; return fn ? fn(...args) : undefined; },
        getAngebotKonditionenText: function(...args) { const fn = getEmail().getAngebotKonditionenText || _getAngebotKonditionenText; return fn ? fn(...args) : undefined; },
        buildInvoiceDocumentHtml: function(...args) { const fn = getPreview().buildInvoiceDocumentHtml || _buildInvoiceDocumentHtml; return fn ? fn(...args) : undefined; }
    };

    if (typeof window !== 'undefined') {
        window.formatGermanDate = _formatGermanDate || facade.formatGermanDate;
        window.formatIban = _formatIban || facade.formatIban;
        window.getAngebotKonditionenText = _getAngebotKonditionenText || facade.getAngebotKonditionenText;
        window.buildInvoiceDocumentHtml = _buildInvoiceDocumentHtml || facade.buildInvoiceDocumentHtml;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = facade;
    }
})();
