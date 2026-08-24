/**
 * ReinigungController.js - Reiner Rechenkern für Putzplan & Reinigungs-LV (F3).
 * Node + Browser-fähig (module.exports UND window.ReinigungController).
 */
const TURNUS_TYPEN = ['X_PRO_WOCHE', 'ALLE_X_TAGE', 'X_PRO_MONAT', 'JAEHRLICH'];

const ZUSCHLAG_LABELS = {
    nacht: 'Nacht',
    sonntag_feiertag: 'Sonn-/Feiertag',
    hoher_feiertag: 'Hoher Feiertag'
};

const DEFAULT_ZUSCHLAGSPROFIL = {
    profil_name: 'RTV Gebäudereinigung (gewerblich)',
    gueltig_ab: '2026-01-01',
    standard_stundensatz: 15.0,
    standard_stundensatz_glas: 18.4,
    zuschlaege: {
        nacht: { prozent: 30 },
        sonntag_feiertag: { prozent: 80 },
        hoher_feiertag: { prozent: 200 }
    },
    kalender: { wochen_pro_jahr: 52, tage_pro_jahr: 365 },
    quellen: ['BIV Vergabe-Empfehlungen 01/2026', 'Tarifbroschüre Berlin 01/2025']
};

function rundeCent(x) {
    return Math.round((Number(x) || 0) * 100) / 100;
}

function zahl(v, fallback = 0) {
    const n = parseFloat(v);
    return isNaN(n) ? fallback : n;
}

function einsaetzeProJahr(turnus_typ, turnus_wert, kalender = {}) {
    const kal = {
        wochen_pro_jahr: zahl(kalender.wochen_pro_jahr, 52),
        tage_pro_jahr: zahl(kalender.tage_pro_jahr, 365)
    };
    const wert = zahl(turnus_wert, 0);
    if (wert <= 0) return 0;
    switch (turnus_typ) {
        case 'X_PRO_WOCHE': return Math.round(wert * kal.wochen_pro_jahr);
        case 'ALLE_X_TAGE': return Math.floor(kal.tage_pro_jahr / wert);
        case 'X_PRO_MONAT': return Math.round(wert * 12);
        case 'JAEHRLICH': return Math.round(wert);
        default: return 0;
    }
}

function minutenJeEinsatz(menge, zeitbedarfMinJeEinheit) {
    return Math.max(0, zahl(menge)) * Math.max(0, zahl(zeitbedarfMinJeEinheit));
}

function jahresMinuten(menge, zeitbedarf, typ, wert, kalender) {
    return minutenJeEinsatz(menge, zeitbedarf) * einsaetzeProJahr(typ, wert, kalender);
}

function jahresStunden(menge, zeitbedarf, typ, wert, kalender) {
    return jahresMinuten(menge, zeitbedarf, typ, wert, kalender) / 60;
}

function parseZuschlaege(zuschlaegeJson) {
    let parsed = {};
    if (typeof zuschlaegeJson === 'string' && zuschlaegeJson.trim()) {
        try { parsed = JSON.parse(zuschlaegeJson) || {}; } catch (_e) { parsed = {}; }
    } else if (zuschlaegeJson && typeof zuschlaegeJson === 'object') {
        parsed = zuschlaegeJson;
    }
    return parsed;
}

function berechneZuschlaege(jahresStundenWert, stundensatz, zuschlaegeJson, profil) {
    const anteile = parseZuschlaege(zuschlaegeJson);
    const profilZuschlaege = (profil && profil.zuschlaege) || {};
    const ergebnis = [];
    for (const key of Object.keys(ZUSCHLAG_LABELS)) {
        const anteilProzent = zahl(anteile[key], 0);
        const satzProzent = zahl((profilZuschlaege[key] || {}).prozent, 0);
        if (anteilProzent <= 0 || satzProzent <= 0) continue;
        ergebnis.push({
            key,
            label: ZUSCHLAG_LABELS[key],
            anteilProzent,
            satzProzent,
            betrag: rundeCent(jahresStundenWert * (anteilProzent / 100) * (satzProzent / 100) * zahl(stundensatz))
        });
    }
    return ergebnis;
}

function buildTurnusLabel(typ, wert) {
    const w = zahl(wert, 1);
    const fmt = Number.isInteger(w) ? String(w) : String(w).replace('.', ',');
    switch (typ) {
        case 'X_PRO_WOCHE': return `${fmt}× wöchentlich`;
        case 'ALLE_X_TAGE': return `alle ${fmt} Tage`;
        case 'X_PRO_MONAT': return `${fmt}× monatlich`;
        case 'JAEHRLICH': return w === 1 ? 'jährlich' : `${fmt}× jährlich`;
        default: return '-';
    }
}

function autoMengeFuerObjekt(typ, id, objekteState) {
    if (!objekteState) return 0;
    const numId = Number(id);
    if (typ === 'RAUM') {
        const raum = (objekteState.raeume || []).find(r => r.id === numId);
        if (!raum || raum.einheit !== 'm²') return 0;
        return rundeCent(zahl(raum.flaeche));
    }
    const etagenIds = new Set();
    if (typ === 'ETAGE') etagenIds.add(numId);
    else {
        const gebaeudeIds = new Set();
        if (typ === 'GEBAEUDE') gebaeudeIds.add(numId);
        else {
            const gebList = (objekteState.gebaeude || []).filter(g => g.liegenschaft_id === numId);
            gebList.forEach(g => gebaeudeIds.add(g.id));
            if (gebaeudeIds.size === 0 && !(objekteState.liegenschaften || []).some(l => l.id === numId)) return 0;
        }
        (objekteState.etagen || []).forEach(e => { if (gebaeudeIds.has(e.gebaeude_id)) etagenIds.add(e.id); });
    }
    let summe = 0;
    (objekteState.raeume || []).forEach(r => {
        if (r.einheit === 'm²' && etagenIds.has(r.etage_id)) summe += zahl(r.flaeche);
    });
    return rundeCent(summe);
}

function validateProfil(profil) {
    if (!profil || typeof profil !== 'object' || Array.isArray(profil)) {
        return { valid: false, message: 'Ungültige Profildaten: Struktur fehlt.' };
    }
    if (!profil.profil_name || !String(profil.profil_name).trim()) {
        return { valid: false, message: 'Bitte einen Profilnamen angeben.' };
    }
    for (const feld of ['standard_stundensatz', 'standard_stundensatz_glas']) {
        const v = zahl(profil[feld], NaN);
        if (isNaN(v) || v < 0) return { valid: false, message: `Ungültiger Wert für ${feld}: muss eine Zahl >= 0 sein.` };
    }
    if (!profil.zuschlaege || typeof profil.zuschlaege !== 'object') {
        return { valid: false, message: 'Zuschlagsstruktur fehlt (zuschlaege).' };
    }
    for (const key of Object.keys(ZUSCHLAG_LABELS)) {
        const p = zahl((profil.zuschlaege[key] || {}).prozent, NaN);
        if (isNaN(p) || p < 0 || p > 400) return { valid: false, message: `Ungültiger Zuschlagssatz für "${key}": Prozent muss zwischen 0 und 400 liegen.` };
    }
    const kalender = profil.kalender || {};
    const wochen = zahl(kalender.wochen_pro_jahr, 52);
    const tage = zahl(kalender.tage_pro_jahr, 365);
    if (!(wochen >= 1 && wochen <= 60)) return { valid: false, message: 'kalender.wochen_pro_jahr muss zwischen 1 und 60 liegen.' };
    if (!(tage >= 1 && tage <= 380)) return { valid: false, message: 'kalender.tage_pro_jahr muss zwischen 1 und 380 liegen.' };
    return { valid: true };
}

function positionsKalkulation(pos, eintraege, objektMengeResolver, profil) {
    const kalender = (profil && profil.kalender) || {};
    const effektiverStundensatz = zahl(pos.kalk_stundensatz) > 0
        ? zahl(pos.kalk_stundensatz)
        : zahl((profil && profil.standard_stundensatz));

    const liste = Array.isArray(eintraege) ? eintraege : [];

    if (liste.length === 0) {
        const menge = zahl(pos.menge);
        const stunden = jahresStunden(menge, pos.zeitbedarf_min_je_einheit, pos.turnus_typ, pos.turnus_wert, kalender);
        const nettoRoh = stunden * effektiverStundensatz;
        const zuschlaege = berechneZuschlaege(stunden, effektiverStundensatz, pos.zuschlaege_json, profil);
        const nettoJahr = rundeCent(nettoRoh);
        const zuschlaegeGesamt = rundeCent(zuschlaege.reduce((s, z) => s + z.betrag, 0));
        const nettoJahrInkl = rundeCent(nettoJahr + zuschlaegeGesamt);
        return {
            direkteMenge: menge,
            einsaetzeProJahr: einsaetzeProJahr(pos.turnus_typ, pos.turnus_wert, kalender),
            jahresMinuten: rundeCent(stunden * 60),
            jahresStunden: stunden,
            stundensatz: effektiverStundensatz,
            nettoJahr,
            nettoMonat: rundeCent(nettoJahrInkl / 12),
            zuschlaege,
            nettoJahrInklZuschlaege: nettoJahrInkl,
            zuschlaegeGesamt,
            quelle: 'POSITION',
            eintraege: []
        };
    }

    let stundenGesamt = 0;
    let nettoRohGesamt = 0;
    let zuschlagDetailGesamt = 0;
    const eintragDetails = liste.map(e => {
        const menge = e.menge_override != null && e.menge_override !== ''
            ? zahl(e.menge_override)
            : (typeof objektMengeResolver === 'function' ? zahl(objektMengeResolver(e.objekt_typ, e.objekt_id)) : 0);
        const typ = e.turnus_typ || pos.turnus_typ;
        const wert = e.turnus_wert != null ? zahl(e.turnus_wert, 1) : zahl(pos.turnus_wert, 1);
        const stunden = jahresStunden(menge, pos.zeitbedarf_min_je_einheit, typ, wert, kalender);
        const nettoRoh = stunden * effektiverStundensatz;
        const zs = berechneZuschlaege(stunden, effektiverStundensatz, pos.zuschlaege_json, profil);
        const zsGesamt = zs.reduce((s, z) => s + z.betrag, 0);
        stundenGesamt += stunden;
        nettoRohGesamt += nettoRoh;
        zuschlagDetailGesamt += zsGesamt;
        return {
            objekt_typ: e.objekt_typ,
            objekt_id: e.objekt_id,
            objektLabel: e._label || '',
            menge,
            mengeOverride: e.menge_override != null && e.menge_override !== '' ? zahl(e.menge_override) : null,
            turnusTyp: typ,
            turnusWert: wert,
            notizen: e.notizen || null,
            einsaetzeProJahr: einsaetzeProJahr(typ, wert, kalender),
            jahresStunden: stunden,
            netto: rundeCent(nettoRoh),
            zuschlaegsBetrag: rundeCent(zsGesamt),
            nettoGesamt: rundeCent(nettoRoh + zsGesamt)
        };
    });

    const zuschlaegeAggregiert = berechneZuschlaege(stundenGesamt, effektiverStundensatz, pos.zuschlaege_json, profil);
    const nettoJahr = rundeCent(nettoRohGesamt);
    const zuschlaegeGesamt = rundeCent(zuschlagDetailGesamt);
    const nettoJahrInkl = rundeCent(nettoJahr + zuschlaegeGesamt);

    return {
        direkteMenge: null,
        einsaetzeProJahr: null,
        jahresMinuten: rundeCent(stundenGesamt * 60),
        jahresStunden: stundenGesamt,
        stundensatz: effektiverStundensatz,
        nettoJahr,
        nettoMonat: rundeCent(nettoJahrInkl / 12),
        zuschlaege: zuschlaegeAggregiert,
        nettoJahrInklZuschlaege: nettoJahrInkl,
        zuschlaegeGesamt,
        quelle: 'EINTRAG',
        eintraege: eintragDetails
    };
}

function summiere(bereicheMitKalkulation) {
    let jahresStundenSum = 0;
    let nettoJahrSum = 0;
    let zuschlaegeSum = 0;
    let positionenAnzahl = 0;
    let eintraegeAnzahl = 0;
    for (const bereich of bereicheMitKalkulation || []) {
        for (const pos of bereich.positionen || []) {
            const k = pos.kalkulation;
            if (!k) continue;
            positionenAnzahl++;
            jahresStundenSum += zahl(k.jahresStunden);
            nettoJahrSum += zahl(k.nettoJahrInklZuschlaege);
            zuschlaegeSum += zahl(k.zuschlaegeGesamt);
            eintraegeAnzahl += (k.eintraege || []).length;
        }
    }
    const nettoJahr = rundeCent(nettoJahrSum);
    return {
        jahresStunden: rundeCent(jahresStundenSum),
        nettoJahr,
        nettoMonat: rundeCent(nettoJahr / 12),
        zuschlaegeGesamt: rundeCent(zuschlaegeSum),
        positionenAnzahl,
        eintraegeAnzahl
    };
}

const ReinigungController = {
    TURNUS_TYPEN,
    ZUSCHLAG_LABELS,
    DEFAULT_ZUSCHLAGSPROFIL,
    einsaetzeProJahr,
    minutenJeEinsatz,
    jahresMinuten,
    jahresStunden,
    berechneZuschlaege,
    buildTurnusLabel,
    autoMengeFuerObjekt,
    validateProfil,
    positionsKalkulation,
    summiere
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ReinigungController;
}
if (typeof window !== 'undefined') {
    window.ReinigungController = ReinigungController;
}
