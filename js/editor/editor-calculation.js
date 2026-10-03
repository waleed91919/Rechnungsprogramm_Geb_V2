/**
 * Extrahiert die laufende Nummer aus einer Belegnummer - robust gegen Präfixe wie
 * "STORNO - INV-2026-001" oder abweichende Formate. Es wird die LASTE Zifferngruppe
 * der Nummer verwendet (regex statt blindes parseInt auf split('-').pop()).
 */
function extractLaufendeNummer(nr) {
    const groups = String(nr || '').match(/\d+/g);
    return (groups && groups.length > 0) ? (parseInt(groups[groups.length - 1], 10) || 0) : 0;
}

window.extractLaufendeNummer = extractLaufendeNummer;
