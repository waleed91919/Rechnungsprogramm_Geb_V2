(function(global) {
    // SSoT (js/money.js): einzige Rundungsquelle, kein eigenes Math.round mehr.
    function _M() {
        if (typeof Money !== 'undefined' && Money && typeof Money.round2 === 'function') return Money;
        if (typeof window !== 'undefined' && window.Money) return window.Money;
        if (typeof globalThis !== 'undefined' && globalThis.Money) return globalThis.Money;
        try {
            if (typeof require !== 'undefined') {
                try { return require('../money'); } catch (e) {}
                try { return require('./money'); } catch (e) {}
            }
        } catch (e) {}
        return null;
    }
    function _round2(v) {
        const M = _M();
        if (M) return M.round2(v);
        const n = parseFloat(v);
        if (!Number.isFinite(n)) return 0;
        return Math.round((n + Number.EPSILON) * 100) / 100;
    }
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
                return _round2(schlussRechnung.netto || schlussRechnung.gesamtNetto || 0);
            }

            // Falls noch keine Schlussrechnung vorliegt: Höchste kumulierte Abschlagsleistung L_t
            const maxNetto = Math.max(0, ...validInvoices.map(r => parseFloat(r.kumulierte_leistung_netto || r.netto || r.gesamtNetto || 0)));
            return _round2(Math.max(0, maxNetto));
        }

        // 3. Bei reinen Periodenrechnungen: Summe der Netto-Zahlungsanforderungen
        let summeNetto = 0;
        validInvoices.forEach(r => {
            summeNetto += parseFloat(r.netto || r.gesamtNetto || 0);
        });

        return _round2(summeNetto);
    }

    if (typeof window !== 'undefined') {
        window.calculateProjektUmsatz = calculateProjektUmsatz;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { calculateProjektUmsatz };
    }
})(this);
