/**
 * js/money.js - SINGLE SOURCE OF TRUTH für kaufmännische Rundungen (EN 16931).
 *
 * Regel: ALLE Euro-Berechnungen (UI, Controller, E-Invoice/XML, DATEV, Banking)
 * MÜSSEN diese Funktionen nutzen. Keine eigenen Math.round(*100)/100 oder
 * toFixed(2)-Rundungen mehr inline.
 *
 * - Kaufmännisch auf 2 Nachkommastellen, pro Steuersatz-Bucket (EN 16931).
 * - Mit Number.EPSILON gegen Binär-Float-Fehler (z.B. 2.675 -> 2.68 statt 2.67).
 * - Isomorph: Browser (window.Money) + Node (require) + globalThis.
 */

class Money {
    /**
     * Kaufmännisch auf Cent runden. Nicht-finite Werte -> 0.
     */
    static round2(value) {
        const n = parseFloat(value);
        if (!Number.isFinite(n)) return 0;
        return Math.round((n + Number.EPSILON) * 100) / 100;
    }

    /**
     * Prozentanteil einer (bereits gerundeten) Basis, Ergebnis gerundet.
     * percent(1000, 5) -> 50.00
     */
    static percent(base, ratePercent) {
        const b = parseFloat(base);
        const r = parseFloat(ratePercent);
        if (!Number.isFinite(b) || !Number.isFinite(r)) return 0;
        return Money.round2((b * r) / 100);
    }

    /**
     * Steuer je Bucket: befreit (AE/13b) oder Satz<=0 -> 0,
     * sonst kaufmännisch auf 2 NK (EN 16931 pro Bucket).
     */
    static taxFor(base, ratePercent, isExempt = false) {
        if (isExempt) return 0;
        const r = parseFloat(ratePercent);
        if (!Number.isFinite(r) || r <= 0) return 0;
        return Money.round2((parseFloat(base) || 0) * r / 100);
    }

    /**
     * Summe beliebig vieler Beträge, Ergebnis gerundet.
     */
    static sum2(values) {
        let s = 0;
        for (const v of (values || [])) {
            const n = parseFloat(v);
            if (Number.isFinite(n)) s += n;
        }
        return Money.round2(s);
    }

    /**
     * Kanonischer 2-NK-String mit Punkt (für XML/EN16931).
     */
    static toFixed2(value) {
        return Money.round2(value).toFixed(2);
    }

    /**
     * DATEV-Format: gerundet, optional absolut, mit Komma.
     * Fixiert den toFixed-Binärfehler (2.675 -> "2,68").
     */
    static toDatev(value, abs = true) {
        const r = Money.round2(value);
        const v = abs ? Math.abs(r) : r;
        return v.toFixed(2).replace('.', ',');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Money;
}
if (typeof window !== 'undefined') {
    window.Money = Money;
}
if (typeof globalThis !== 'undefined' && !globalThis.Money) {
    globalThis.Money = Money;
}
