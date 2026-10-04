(function() {
    function formatGermanDate(d) {
        if (!d) return '';
        const date = new Date(d);
        if (isNaN(date.getTime())) return String(d);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
    }

    function formatIban(iban) {
        if (!iban) return '';
        return iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
    }

    if (typeof window !== 'undefined') {
        window.formatGermanDate = formatGermanDate;
        window.formatIban = formatIban;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { formatGermanDate, formatIban };
    }
})();
