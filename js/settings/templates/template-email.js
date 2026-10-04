(function() {
    function getAngebotKonditionenText(rech, faelligStr, customKonditionen) {
        const rawCustom = (typeof customKonditionen === 'string' && customKonditionen)
            ? customKonditionen
            : (rech ? ((typeof rech.zahlungsbedingungen === 'string' && rech.zahlungsbedingungen) || (typeof rech.konditionen === 'string' && rech.konditionen) || '') : '');
        const cleanCustom = rawCustom ? (typeof sanitize === 'function' ? sanitize(rawCustom).trim() : String(rawCustom).trim()) : '';

        let konditionenText = '';
        if (cleanCustom) {
            konditionenText = cleanCustom;
        } else {
            const vg = (rech && (rech.vertragsgrundlage || (rech.vob_vereinbart ? 'VOB_B' : 'BGB_WERKVERTRAG'))) || 'BGB_WERKVERTRAG';
            if (vg === 'VOB_B') {
                konditionenText = 'Vertragsgrundlage: VOB/B (Vergabe- und Vertragsordnung für Bauleistungen, Teil B). Zahlungsbedingungen: Abschlagszahlungen nach Leistungsfortschritt gemäß § 16 VOB/B.';
            } else if (vg === 'BGB_VERBRAUCHERBAU') {
                konditionenText = 'Vertragsgrundlage: Verbraucherbauvertrag (§ 650i BGB). Zahlungsbedingungen: Abschlagszahlungen nach Baufortschritt gemäß § 650m BGB.';
            } else {
                konditionenText = 'Vertragsgrundlage: BGB-Werkvertrag (§§ 631 ff. BGB). Zahlungsbedingungen: Abschlagszahlungen nach Leistungsstand gemäß § 632a BGB.';
            }
        }

        const faelligDisplay = (faelligStr && String(faelligStr).includes('<strong'))
            ? faelligStr
            : `<strong>${faelligStr || ''}</strong>`;

        return `Dieses Angebot kann bis zum ${faelligDisplay} angenommen werden. ${konditionenText}`;
    }

    if (typeof window !== 'undefined') {
        window.getAngebotKonditionenText = getAngebotKonditionenText;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { getAngebotKonditionenText };
    }
})();
