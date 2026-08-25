/**
 * reinigungslv_kalkulation.test.js - F3: Reiner Rechenkern des ReinigungControllers
 * (Turni, Referenzfall §4.3, Zuschlags-Breakdown, Eintrags-/Summen-Kalkulation, Profil-Validierung)
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const RC = require('../controllers/ReinigungController');
const PROFIL = RC.DEFAULT_ZUSCHLAGSPROFIL;

test('einsaetzeProJahr: kanonische Turnus-Werte', () => {
    assert.equal(RC.einsaetzeProJahr('X_PRO_WOCHE', 5), 260);
    assert.equal(RC.einsaetzeProJahr('X_PRO_WOCHE', 1), 52);
    assert.equal(RC.einsaetzeProJahr('X_PRO_WOCHE', 7), 364);
    assert.equal(RC.einsaetzeProJahr('ALLE_X_TAGE', 14), 26);
    assert.equal(RC.einsaetzeProJahr('ALLE_X_TAGE', 7), 52);
    assert.equal(RC.einsaetzeProJahr('ALLE_X_TAGE', 30), 12);
    assert.equal(RC.einsaetzeProJahr('X_PRO_MONAT', 1), 12);
    assert.equal(RC.einsaetzeProJahr('X_PRO_MONAT', 2), 24);
    assert.equal(RC.einsaetzeProJahr('JAEHRLICH', 1), 1);
    assert.equal(RC.einsaetzeProJahr('JAEHRLICH', 2), 2);
});

test('einsaetzeProJahr: Kalender-Override (53 Wochen) und Guard-Fälle', () => {
    assert.equal(RC.einsaetzeProJahr('X_PRO_WOCHE', 1, { wochen_pro_jahr: 53, tage_pro_jahr: 365 }), 53);
    assert.equal(RC.einsaetzeProJahr('X_PRO_WOCHE', 5, { wochen_pro_jahr: 53, tage_pro_jahr: 366 }), 265);
    assert.equal(RC.einsaetzeProJahr('ALLE_X_TAGE', 14, { wochen_pro_jahr: 52, tage_pro_jahr: 366 }), Math.floor(366 / 14));
    assert.equal(RC.einsaetzeProJahr('X_PRO_WOCHE', 0), 0);
    assert.equal(RC.einsaetzeProJahr('UNBEKANNT', 3), 0);
});

test('Referenzfall: 500 m², 5x/Woche, 1 min/m², 15 EUR/h, 10% Nacht-Anteil (exakt)', () => {
    const pos = {
        menge: 500,
        menge_einheit: 'm²',
        turnus_typ: 'X_PRO_WOCHE',
        turnus_wert: 5,
        zeitbedarf_min_je_einheit: 1.0,
        kalk_stundensatz: 15.0,
        zuschlaege_json: JSON.stringify({ nacht: 10 })
    };
    const k = RC.positionsKalkulation(pos, [], null, PROFIL);

    assert.equal(k.quelle, 'POSITION');
    assert.ok(Math.abs(k.jahresStunden - 2166.6667) < 0.0001, `jahresStunden=${k.jahresStunden}`);
    assert.equal(Math.round(k.jahresStunden * 100) / 100, 2166.67);
    assert.equal(k.nettoJahr, 32500.00);
    assert.deepEqual(k.zuschlaege, [{ key: 'nacht', label: 'Nacht (22–05 Uhr)', anteilProzent: 10, satzProzent: 30, betrag: 975.00 }]);
    assert.equal(k.nettoJahrInklZuschlaege, 33475.00);
    assert.equal(k.nettoMonat, 2789.58);
    assert.equal(k.direkteMenge, 500);
});

test('Zuschlags-Breakdown: mehrere Fenster gleichzeitig; Anteil 0 erzeugt keinen Posten', () => {
    const zs = RC.berechneZuschlaege(100, 20, JSON.stringify({ nacht: 50, sonntag_feiertag: 10, hoher_feiertag: 2, belastung: 15 }), PROFIL);
    assert.deepEqual(zs.map(z => [z.key, z.betrag]), [
        ['nacht', 100 * 0.5 * 0.3 * 20],
        ['sonntag_feiertag', 100 * 0.1 * 0.8 * 20],
        ['hoher_feiertag', 100 * 0.02 * 2.0 * 20],
        ['belastung', 100 * 0.15 * 0.25 * 20]
    ]);

    const nurNacht = RC.berechneZuschlaege(100, 20, JSON.stringify({ nacht: 25, sonntag_feiertag: 0, hoher_feiertag: 0, belastung: 0 }), PROFIL);
    assert.equal(nurNacht.length, 1);
    assert.equal(nurNacht[0].key, 'nacht');

    const ohneJson = RC.berechneZuschlaege(100, 20, null, PROFIL);
    assert.deepEqual(ohneJson, []);
});

test('positionsKalkulation: EINTRAG-Modus mit Override-Menge vs. Auto-Fläche', () => {
    const objekteState = {
        liegenschaften: [{ id: 1, name: 'Liegenschaft A' }],
        gebaeude: [{ id: 10, name: 'Haus A', liegenschaft_id: 1 }],
        etagen: [
            { id: 100, name: 'EG', gebaeude_id: 10 },
            { id: 101, name: 'OG', gebaeude_id: 10 }
        ],
        raeume: [
            { id: 1000, name: 'Buero', etage_id: 100, flaeche: 200, einheit: 'm²' },
            { id: 1001, name: 'Flur', etage_id: 101, flaeche: 150.5, einheit: 'm²' }
        ]
    };

    const pos = {
        menge: 0,
        turnus_typ: 'X_PRO_WOCHE',
        turnus_wert: 2,
        zeitbedarf_min_je_einheit: 2,
        kalk_stundensatz: 18.4,
        zuschlaege_json: ''
    };
    const eintraege = [
        { objekt_typ: 'RAUM', objekt_id: 1000, menge_override: null, turnus_typ: 'X_PRO_WOCHE', turnus_wert: 2, _label: 'Buero' },
        { objekt_typ: 'RAUM', objekt_id: 1001, menge_override: 99, turnus_typ: 'X_PRO_WOCHE', turnus_wert: 2, _label: 'Flur' }
    ];

    const k = RC.positionsKalkulation(pos, eintraege, (t, id) => RC.autoMengeFuerObjekt(t, id, objekteState), PROFIL);

    assert.equal(k.quelle, 'EINTRAG');
    assert.equal(k.direkteMenge, null);
    assert.equal(k.eintraege.length, 2);
    assert.equal(k.eintraege[0].menge, 200, 'Auto-Menge muss aus Raumfläche kommen');
    assert.equal(k.eintraege[1].menge, 99, 'Override-Menge muss Vorrang haben');

    const einsaetze = 2 * 52;
    const stundenEintrag1 = 200 * 2 * einsaetze / 60;
    const stundenEintrag2 = 99 * 2 * einsaetze / 60;
    assert.equal(k.eintraege[0].nettoGesamt, Math.round(stundenEintrag1 * 18.4 * 100) / 100);
    assert.equal(k.eintraege[1].nettoGesamt, Math.round(stundenEintrag2 * 18.4 * 100) / 100);
    assert.equal(k.nettoJahrInklZuschlaege, Math.round((stundenEintrag1 + stundenEintrag2) * 18.4 * 100) / 100);
});

test('autoMengeFuerObjekt spiegelt getObjektBaum-Summenlogik', () => {
    const objekteState = {
        liegenschaften: [{ id: 1, name: 'L' }],
        gebaeude: [{ id: 10, liegenschaft_id: 1 }, { id: 11, liegenschaft_id: 1 }],
        etagen: [{ id: 100, gebaeude_id: 10 }, { id: 101, gebaeude_id: 11 }],
        raeume: [
            { id: 1000, etage_id: 100, flaeche: 120, einheit: 'm²' },
            { id: 1001, etage_id: 101, flaeche: 80, einheit: 'm²' },
            { id: 1002, etage_id: 101, flaeche: 50, einheit: 'Stk.' }
        ]
    };
    assert.equal(RC.autoMengeFuerObjekt('RAUM', 1000, objekteState), 120);
    assert.equal(RC.autoMengeFuerObjekt('ETAGE', 101, objekteState), 80, 'nicht-m²-Räume werden nicht summiert');
    assert.equal(RC.autoMengeFuerObjekt('GEBAEUDE', 10, objekteState), 120);
    assert.equal(RC.autoMengeFuerObjekt('LIEGENSCHAFT', 1, objekteState), 200);
    assert.equal(RC.autoMengeFuerObjekt('LIEGENSCHAFT', 999, objekteState), 0);
});

test('summiere über 2 Bereiche inkl. Zuschläge', () => {
    const bereiche = [
        {
            positionen: [{
                kalkulation: {
                    jahresStunden: 2166.6667,
                    nettoJahrInklZuschlaege: 33475,
                    zuschlaegeGesamt: 975,
                    eintraege: [{}]
                }
            }]
        },
        {
            positionen: [{
                kalkulation: {
                    jahresStunden: 104,
                    nettoJahrInklZuschlaege: 2080,
                    zuschlaegeGesamt: 0,
                    eintraege: []
                }
            }]
        }
    ];
    assert.deepEqual(RC.summiere(bereiche), {
        jahresStunden: 2270.67,
        nettoJahr: 35555,
        nettoMonat: Math.round(35555 / 12 * 100) / 100,
        zuschlaegeGesamt: 975,
        positionenAnzahl: 2,
        eintraegeAnzahl: 1
    });
    assert.deepEqual(RC.summiere([]), { jahresStunden: 0, nettoJahr: 0, nettoMonat: 0, zuschlaegeGesamt: 0, positionenAnzahl: 0, eintraegeAnzahl: 0 });
});

test('buildTurnusLabel: deutsche Texte', () => {
    assert.equal(RC.buildTurnusLabel('X_PRO_WOCHE', 5), '5× wöchentlich');
    assert.equal(RC.buildTurnusLabel('X_PRO_WOCHE', 1), '1× wöchentlich');
    assert.equal(RC.buildTurnusLabel('ALLE_X_TAGE', 14), 'alle 14 Tage');
    assert.equal(RC.buildTurnusLabel('X_PRO_MONAT', 2), '2× monatlich');
    assert.equal(RC.buildTurnusLabel('JAEHRLICH', 1), 'jährlich');
    assert.equal(RC.buildTurnusLabel('JAEHRLICH', 2), '2× jährlich');
    assert.equal(RC.buildTurnusLabel('BLUBB', 3), '-');
});

test('validateProfil: Fehlerfälle mit Feldnamen und gültiges Profil', () => {
    assert.equal(RC.validateProfil(PROFIL).valid, true);
    assert.match(RC.validateProfil(null).message, /Struktur fehlt/);
    assert.match(RC.validateProfil({ profil_name: '', zuschlaege: {}, kalender: {} }).message, /Profilnamen/);
    assert.match(
        RC.validateProfil({ ...PROFIL, standard_stundensatz: -1 }).message,
        /standard_stundensatz/
    );
    assert.match(
        RC.validateProfil({ ...PROFIL, zuschlaege: { ...PROFIL.zuschlaege, nacht: { prozent: 401 } } }).message,
        /nacht.*0 und 400/
    );
    assert.match(
        RC.validateProfil({ ...PROFIL, kalender: { wochen_pro_jahr: 0, tage_pro_jahr: 365 } }).message,
        /wochen_pro_jahr/
    );
});

test('R10: Belastungszuschlag 25 % Kalkulation (§ 10 Ziff. 3 RTV)', () => {
    const zs = RC.berechneZuschlaege(100, 15.00, JSON.stringify({ belastung: 20 }), PROFIL);
    assert.equal(zs.length, 1);
    assert.equal(zs[0].key, 'belastung');
    assert.equal(zs[0].label, 'Belastungszuschlag (>8h/Tag bzw. >40h/Woche)');
    assert.equal(zs[0].anteilProzent, 20);
    assert.equal(zs[0].satzProzent, 25);
    assert.equal(zs[0].betrag, 75.00);
});

test('R11: Lohngruppenkatalog LG 1 bis LG 9 (2026) und Mindestlohnprüfung', () => {
    assert.ok(Array.isArray(RC.LOHNGRUPPEN_GEBAEUDEREINIGUNG_2026));
    assert.equal(RC.LOHNGRUPPEN_GEBAEUDEREINIGUNG_2026.length, 9);
    const lg1 = RC.LOHNGRUPPEN_GEBAEUDEREINIGUNG_2026.find(g => g.id === 'LG1');
    const lg6 = RC.LOHNGRUPPEN_GEBAEUDEREINIGUNG_2026.find(g => g.id === 'LG6');
    const lg5 = RC.LOHNGRUPPEN_GEBAEUDEREINIGUNG_2026.find(g => g.id === 'LG5');
    assert.equal(lg1.lohn, 15.00);
    assert.equal(lg1.mindestlohn, true);
    assert.equal(lg6.lohn, 18.40);
    assert.equal(lg6.mindestlohn, true);
    assert.equal(lg5.entfallen, true);

    const r1 = RC.pruefeMindestlohn(14.50, 'LG1');
    assert.equal(r1.warnung, true);
    assert.ok(r1.meldung.includes('15.00'));

    const r2 = RC.pruefeMindestlohn(15.00, 'LG1');
    assert.equal(r2.warnung, false);
    assert.equal(r2.meldung, '');

    const r3 = RC.pruefeMindestlohn(17.50, 'LG6');
    assert.equal(r3.warnung, true);
    assert.ok(r3.meldung.includes('18.40'));

    const r4 = RC.pruefeMindestlohn(18.40, 'LG6');
    assert.equal(r4.warnung, false);
    assert.equal(r4.meldung, '');
});
