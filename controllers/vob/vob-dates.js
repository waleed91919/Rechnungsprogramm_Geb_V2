(function(exports) {

    /**
     * Formatiert einen Betrag in deutsches Währungsformat (z.B. "12.345,67 €").
     */
    function formatCurrency(amount) {
        return (parseFloat(amount) || 0).toLocaleString('de-DE', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }) + ' €';
    }

    /**
     * Formatiert ein Datum in deutsches Standardformat (DD.MM.YYYY).
     */
    function formatDate(d) {
        if (!d) return '';
        if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) {
            const parts = d.substring(0, 10).split('-');
            return `${parts[2]}.${parts[1]}.${parts[0]}`;
        }
        const dateObj = d instanceof Date ? d : new Date(d);
        if (isNaN(dateObj.getTime())) return String(d);
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const year = dateObj.getFullYear();
        return `${day}.${month}.${year}`;
    }

    /**
     * Addiert Kalendertage zu einem Datum und gibt das ISO-Datum (YYYY-MM-DD) zurück.
     */
    function addCalendarDays(startDate, days) {
        const d = startDate ? new Date(startDate) : new Date();
        const res = new Date(d.getTime() + (parseInt(days, 10) || 0) * 86400000);
        return res.toISOString().split('T')[0];
    }

    /**
     * Addiert Werktage (Mo–Sa, ohne Sonn- und Feiertage) nach VOB/B.
     */
    function addWorkingDays(startDate, days) {
        const d = startDate ? new Date(startDate) : new Date();
        let current = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
        let needed = Math.max(1, parseInt(days, 10) || 1);
        let added = 0;

        const isFeiertag = (dateObj) => {
            const y = dateObj.getFullYear();
            const m = dateObj.getMonth();
            const day = dateObj.getDate();

            if (m === 0 && day === 1) return true; // Neujahr
            if (m === 4 && day === 1) return true; // 1. Mai
            if (m === 9 && day === 3) return true; // 3. Okt
            if (m === 11 && (day === 25 || day === 26)) return true; // Weihnachten

            const a = y % 19, b = Math.floor(y / 100), c = y % 100;
            const dG = Math.floor(b / 4), eG = b % 4, fG = Math.floor((b + 8) / 25);
            const gG = Math.floor((b - fG + 1) / 3), hG = (19 * a + b - dG - gG + 15) % 30;
            const iG = Math.floor(c / 4), kG = c % 4, lG = (32 + 2 * eG + 2 * iG - hG - kG) % 7;
            const mG = Math.floor((a + 11 * hG + 22 * lG) / 451);
            const ostersonntag = new Date(y, Math.floor((hG + lG - 7 * mG + 114) / 31) - 1, ((hG + lG - 7 * mG + 114) % 31) + 1, 12, 0, 0);

            const diffDays = Math.round((new Date(y, m, day, 12, 0, 0) - ostersonntag) / 86400000);
            return (diffDays === -2 || diffDays === 1 || diffDays === 39 || diffDays === 50);
        };

        while (added < needed) {
            current.setDate(current.getDate() + 1);
            if (current.getDay() === 0) continue; // Sonntag
            if (isFeiertag(current)) continue;
            added++;
        }

        const yyyy = current.getFullYear();
        const mm = String(current.getMonth() + 1).padStart(2, '0');
        const dd = String(current.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    exports.formatCurrency = formatCurrency;
    exports.formatDate = formatDate;
    exports.addCalendarDays = addCalendarDays;
    exports.addWorkingDays = addWorkingDays;

})(typeof module !== 'undefined' && module.exports ? (module.exports = {}) : (window.VobDates = {}));
