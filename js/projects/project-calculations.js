(function(global) {
    function calculateProjektUmsatz(pRechnungen = [], paidStornoOriginalNrs = new Set()) {
        if (!Array.isArray(pRechnungen) || pRechnungen.length === 0) {
            return 0;
        }

        // 1. Gültige Rechnungen filtern (Entwürfe und Stornos ausschließen, es sei denn ausgeglichen)
        const validInvoices = pRechnungen.filter(r => {
            if (!r || r.status === 'Entwurf') return false;
            if (r.status === 'Storniert') {
                return paidStornoOriginalNrs && typeof paidStornoOriginalNrs.has === 'function' && paidStornoOriginalNrs.has(r.nr);
            }
            return true;
        });

        if (validInvoices.length === 0) return 0;

        // 2. Prüfen, ob Rechnungen kumulierte Gesamtabrechnungen darstellen
        const hasCumulativeInvoices = validInvoices.some(r =>
            (Array.isArray(r.verrechnungen) && r.verrechnungen.length > 0) ||
            r.rechnungsart === 'SCHLUSSRECHNUNG' ||
            r.rechnungsart === 'TEILSCHLUSSRECHNUNG' ||
            r.rechnungsart === 'ABSCHLAG_KUMULIERT' ||
            r.typ === 'SCHLUSSRECHNUNG' ||
            r.typ === 'TEILSCHLUSSRECHNUNG' ||
            (r.title && r.title.toLowerCase().includes('abzug'))
        );

        if (hasCumulativeInvoices) {
            const schlussRechnung = validInvoices.find(r => r.rechnungsart === 'SCHLUSSRECHNUNG' || r.typ === 'SCHLUSSRECHNUNG');
            if (schlussRechnung) {
                return parseFloat(schlussRechnung.netto || schlussRechnung.gesamtNetto || 0);
            }

            // Falls noch keine Schlussrechnung vorliegt: Höchste kumulierte Abschlagsleistung L_t
            const maxNetto = Math.max(0, ...validInvoices.map(r => parseFloat(r.kumulierte_leistung_netto || r.netto || r.gesamtNetto || 0)));
            return Math.max(0, maxNetto);
        }

        // 3. Bei reinen Periodenrechnungen: Summe der Netto-Zahlungsanforderungen
        let summeNetto = 0;
        validInvoices.forEach(r => {
            summeNetto += parseFloat(r.netto || r.gesamtNetto || 0);
        });

        return Math.round(summeNetto * 100) / 100;
    }

    if (typeof window !== 'undefined') {
        window.calculateProjektUmsatz = calculateProjektUmsatz;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { calculateProjektUmsatz };
    }
})(this);
