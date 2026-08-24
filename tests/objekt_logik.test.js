/**
 * objekt_logik.test.js - F1: Reine Logik des ObjektControllers
 * (resolveEmpfaenger, buildPfad, getDescendantIds, summiereFlaechen)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const ObjektController = require('../controllers/ObjektController');

const state = {
    liegenschaften: [
        { id: 10, objekt_nr: 'L-001', name: 'Liegenschaft Alpha', empfaenger_kunde_id: 1, empfaenger_art: 'EIGENTUEMER' },
        { id: 11, name: 'Liegenschaft Ohne' }
    ],
    gebaeude: [
        { id: 20, liegenschaft_id: 10, name: 'Haus A' },
        { id: 21, liegenschaft_id: 10, name: 'Haus B', empfaenger_kunde_id: 2, empfaenger_art: 'MIETER' }
    ],
    etagen: [
        { id: 30, gebaeude_id: 20, name: 'EG', ebene_nummer: 0 },
        { id: 31, gebaeude_id: 21, name: '1. OG', empfaenger_kunde_id: 3, empfaenger_art: 'HAUSVERWALTUNG' },
        { id: 32, gebaeude_id: 20, name: '2. OG', ebene_nummer: 2 }
    ],
    raeume: [
        { id: 40, etage_id: 30, name: 'Büro 101', flaeche: 25, einheit: 'm²' },
        { id: 41, etage_id: 30, name: 'Treppenhaus', flaeche: 12, einheit: 'm²' },
        { id: 42, etage_id: 31, name: 'Lager', flaeche: 50, einheit: 'm²', empfaenger_kunde_id: 4, empfaenger_art: 'MIETER' },
        { id: 43, etage_id: 32, name: 'Stellplätze', flaeche: 6, einheit: 'Stk.' },
        { id: 44, etage_id: 32, name: 'Flur', flaeche: 8.5, einheit: 'm²' }
    ]
};

test('validateKnoten: Name und Elternteil Pflicht, Fläche >= 0, Art nur mit Kunde', () => {
    assert.equal(ObjektController.validateKnoten('LIEGENSCHAFT', { name: 'X' }).valid, true);
    assert.equal(ObjektController.validateKnoten('GEBAEUDE', { name: 'X' }).valid, false);
    assert.match(ObjektController.validateKnoten('RAUM', {}).message, /Namen/);
    assert.equal(ObjektController.validateKnoten('RAUM', { name: 'R', etage_id: 30 }).valid, true);
    assert.match(ObjektController.validateKnoten('RAUM', { name: 'R', etage_id: 30, flaeche: -5 }).message, /negativ/);
    assert.match(ObjektController.validateKnoten('RAUM', { name: 'R', etage_id: 30, empfaenger_art: 'MIETER' }).message, /Empfänger-Kunden/);
});

test('resolveEmpfaenger: direkt am Raum', () => {
    const res = ObjektController.resolveEmpfaenger('RAUM', 42, state);
    assert.deepEqual(res, { kundeId: 4, art: 'MIETER', quelle: 'RAUM', direkt: true });
});

test('resolveEmpfaenger: geerbt von Etage / Gebäude / Liegenschaft', () => {
    assert.equal(ObjektController.resolveEmpfaenger('ETAGE', 31, state).kundeId, 3);

    const vonLieg = ObjektController.resolveEmpfaenger('ETAGE', 30, state);
    assert.equal(vonLieg.kundeId, 1);
    assert.equal(vonLieg.quelle, 'LIEGENSCHAFT');
    assert.equal(vonLieg.direkt, false);

    assert.equal(ObjektController.resolveEmpfaenger('RAUM', 40, state).kundeId, 1);
});

test('resolveEmpfaenger: gar nicht gesetzt → null', () => {
    assert.equal(ObjektController.resolveEmpfaenger('GEBAEUDE', 999, state), null);
    const leer = ObjektController.resolveEmpfaenger('RAUM', 41, {
        liegenschaften: [{ id: 10, name: 'X' }],
        gebaeude: [{ id: 20, liegenschaft_id: 10, name: 'Haus' }],
        etagen: [{ id: 30, gebaeude_id: 20, name: 'EG' }],
        raeume: [{ id: 40, etage_id: 30, name: 'Büro' }]
    });
    assert.equal(leer, null);
});

test('buildPfad: exakter String über alle Ebenen', () => {
    assert.equal(ObjektController.buildPfad('RAUM', 40, state), 'L-001 › Haus A › EG › Büro 101');
    assert.equal(ObjektController.buildPfad('LIEGENSCHAFT', 10, state), 'L-001');
    assert.equal(ObjektController.buildPfad('GEBAEUDE', 21, state), 'L-001 › Haus B');
});

test('getDescendantIds: Gebäude liefert eigene Etagen + deren Räume', () => {
    const ids = ObjektController.getDescendantIds('GEBAEUDE', 20, state);
    assert.deepEqual(ids, [
        { objektTyp: 'GEBAEUDE', objektId: 20 },
        { objektTyp: 'ETAGE', objektId: 30 },
        { objektTyp: 'RAUM', objektId: 40 },
        { objektTyp: 'RAUM', objektId: 41 },
        { objektTyp: 'ETAGE', objektId: 32 },
        { objektTyp: 'RAUM', objektId: 43 },
        { objektTyp: 'RAUM', objektId: 44 }
    ]);
});

test('summiereFlaechen: inkl. Einheiten-Filter (nur m²)', () => {
    assert.equal(ObjektController.summiereFlaechen('GEBAEUDE', 20, state), 45.5);
    assert.equal(ObjektController.summiereFlaechen('RAUM', 43, state), 0);
    assert.equal(ObjektController.summiereFlaechen('LIEGENSCHAFT', 10, state), 95.5);
});
