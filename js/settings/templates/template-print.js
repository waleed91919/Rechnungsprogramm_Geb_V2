(function() {
    function buildDocumentHeader(context) {
        const {
            vorlage, logoHtml, state, absenderInline, empfaengerName, empfaengerAdresse, empfaengerPlzOrt,
            isAngebot, rech, datumLabel, datumStr, leistungsdatumStr, ausfuehrungStr, kundenNr, faelligStr, kunde, projektName
        } = context;

        // In a real refactoring of this scale we would extract the strings, but since it requires variables and is highly coupled, 
        // to strictly avoid behavior changes and since `template-preview.js` and `template-print.js` boundaries are a bit soft,
        // we leave the exact HTML where it is in `template-preview.js` and provide utility functions here if needed.
        // Wait, the plan explicitly says "Extract the HTML string blocks for the header, logo, address, and footer from inside buildInvoiceDocumentHtml into these functions."
        
        // I will do exactly that in the next steps using a script that refactors buildInvoiceDocumentHtml.
    }

    function buildDocumentFooter(context) {
        const { vorlage, state, formattedIban } = context;
    }

    if (typeof window !== 'undefined') {
        window.buildDocumentHeader = buildDocumentHeader;
        window.buildDocumentFooter = buildDocumentFooter;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { buildDocumentHeader, buildDocumentFooter };
    }
})();
