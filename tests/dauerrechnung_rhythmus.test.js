/**
 * dauerrechnung_rhythmus.test.js - F2: Reiner Rhythmus-Rechenkern
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const DauerrechnungController = require('../controllers/DauerrechnungController');

function plan(overrides = {}) {
    return {
        rhythmus: 'MONATLICH',
        abrechnungstag: 1,
        abrechnungsmonat: null,
        intervall_wochen: null,
        abrechnungs_modus: 'NACHTRAEGLICH',
        start_datum: '2026-01-01',
        ende_datum: null,
        ...overrides
    };
}

test('MONATLICH: Tag 31 wird auf Monatsende geklemmt (28./29./30.)', () => {
    const p = plan({ abrechnungstag: 31, start_datum: '2026-01-31' });
    assert.equal(DauerrechnungController.berechneNaechstenTermin(p, '2026-01-31'), '2026-02-28');
    assert.equal(DauerrechnungController.berechneNaechstenTermin(p, '2026-02-28'), '2026-03-31');
    assert.equal(DauerrechnungController.berechneNaechstenTermin(p, '2026-03-31'), '2026-04-30');
    const schaltjahr = plan({ abrechnungstag: 31, start_datum: '2028-01-31' });
    assert.equal(DauerrechnungController.berechneNaechstenTermin(schaltjahr, '2028-01-31'), '2028-02-29');
});

test('MONATLICH: exakte Terminfolge 01.01 - 01.06', () => {
    const p = plan({});
    let cursor = '';
    const folge = [];
    for (let i = 0; i < 6; i++) {
        cursor = DauerrechnungController.berechneNaechstenTermin(p, cursor || null);
        folge.push(cursor);
        cursor = DauerrechnungController.addTage(cursor, 0);
    }
    assert.deepEqual(folge, ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01']);
});

test('QUARTALSWEISE: alle 3 Monate ab 15.01.', () => {
    const p = plan({ rhythmus: 'QUARTALSWEISE', abrechnungstag: 15, start_datum: '2026-01-15' });
    assert.equal(DauerrechnungController.berechneNaechstenTermin(p, null), '2026-01-15');
    assert.equal(DauerrechnungController.berechneNaechstenTermin(p, '2026-01-15'), '2026-04-15');
    assert.equal(DauerrechnungController.berechneNaechstenTermin(p, '2026-04-15'), '2026-07-15');
    assert.equal(DauerrechnungController.berechneNaechstenTermin(p, '2026-07-15'), '2026-10-15');
});

test('JAEHRLICH: abrechnungsmonat=3, Tag 31 -> 31.03 je Jahr; Schaltfall 29.02', () => {
    const p = plan({ rhythmus: 'JAEHRLICH', abrechnungsmonat: 3, abrechnungstag: 31, start_datum: '2025-01-01' });
    assert.equal(DauerrechnungController.berechneNaechstenTermin(p, null), '2025-03-31');
    assert.equal(DauerrechnungController.berechneNaechstenTermin(p, '2025-03-31'), '2026-03-31');

    const februar = plan({ rhythmus: 'JAEHRLICH', abrechnungsmonat: 2, abrechnungstag: 29, start_datum: '2027-01-01' });
    assert.equal(DauerrechnungController.berechneNaechstenTermin(februar, null), '2027-02-28');
    assert.equal(DauerrechnungController.berechneNaechstenTermin(februar, '2027-02-28'), '2028-02-29');
});

test('WOCHEN_INTERVALL: alle 2 Wochen ab Donnerstag-Anker, über Monats-/Jahresgrenze', () => {
    const p = plan({ rhythmus: 'WOCHEN_INTERVALL', intervall_wochen: 2, start_datum: '2025-12-25' });
    assert.equal(DauerrechnungController.berechneNaechstenTermin(p, null), '2025-12-25');
    assert.equal(DauerrechnungController.berechneNaechstenTermin(p, '2025-12-25'), '2026-01-08');
    assert.equal(DauerrechnungController.berechneNaechstenTermin(p, '2026-01-08'), '2026-01-22');

    const w1 = plan({ rhythmus: 'WOCHEN_INTERVALL', intervall_wochen: 1, start_datum: '2026-01-05' });
    assert.equal(DauerrechnungController.berechneNaechstenTermin(w1, '2026-01-05'), '2026-01-12');

    const w6 = plan({ rhythmus: 'WOCHEN_INTERVALL', intervall_wochen: 6, start_datum: '2026-01-05' });
    assert.equal(DauerrechnungController.berechneNaechstenTermin(w6, '2026-01-05'), '2026-02-16');
});

test('berechneLeistungszeitraum: NACHTRAEGLICH Januar-Lauf -> Dezember inkl. 31.; VORAUS -> Januar', () => {
    const nach = plan({ abrechnungs_modus: 'NACHTRAEGLICH', start_datum: '2025-11-01' });
    assert.deepEqual(
        DauerrechnungController.berechneLeistungszeitraum(nach, '2026-01-01'),
        { periodeVon: '2025-12-01', periodeBis: '2025-12-31' }
    );

    const vor = plan({ abrechnungs_modus: 'VORAUS' });
    assert.deepEqual(
        DauerrechnungController.berechneLeistungszeitraum(vor, '2026-01-01'),
        { periodeVon: '2026-01-01', periodeBis: '2026-01-31' }
    );
});

test('berechneLeistungszeitraum: Wochenfenster-Grenzen und Quartal/Jahr zurück', () => {
    const wochen = plan({ rhythmus: 'WOCHEN_INTERVALL', intervall_wochen: 2, abrechnungs_modus: 'NACHTRAEGLICH', start_datum: '2025-06-01' });
    assert.deepEqual(
        DauerrechnungController.berechneLeistungszeitraum(wochen, '2026-01-15'),
        { periodeVon: '2026-01-01', periodeBis: '2026-01-14' }
    );

    const quartal = plan({ rhythmus: 'QUARTALSWEISE', abrechnungs_modus: 'NACHTRAEGLICH' });
    assert.deepEqual(
        DauerrechnungController.berechneLeistungszeitraum(quartal, '2026-04-15'),
        { periodeVon: '2026-01-01', periodeBis: '2026-03-31' }
    );

    const jahr = plan({ rhythmus: 'JAEHRLICH', abrechnungsmonat: 3, abrechnungstag: 31, abrechnungs_modus: 'NACHTRAEGLICH', start_datum: '2024-01-01' });
    assert.deepEqual(
        DauerrechnungController.berechneLeistungszeitraum(jahr, '2026-03-31'),
        { periodeVon: '2025-01-01', periodeBis: '2025-12-31' }
    );
});

test('berechneLeistungszeitraum: Clamping an start/ende', () => {
    const p = plan({
        abrechnungs_modus: 'NACHTRAEGLICH',
        start_datum: '2026-01-10',
        ende_datum: '2026-12-20'
    });
    assert.deepEqual(
        DauerrechnungController.berechneLeistungszeitraum(p, '2026-02-01'),
        { periodeVon: '2026-01-10', periodeBis: '2026-01-31' }
    );
});

test('ende_datum: Termine nach Ende -> null; unbefristet läuft weiter', () => {
    const begrenzt = plan({ start_datum: '2026-01-01', ende_datum: '2026-03-31' });
    assert.equal(DauerrechnungController.berechneNaechstenTermin(begrenzt, '2026-02-15'), '2026-03-01');
    assert.equal(DauerrechnungController.berechneNaechstenTermin(begrenzt, '2026-03-31'), null);

    const unbefristet = plan({});
    assert.ok(DauerrechnungController.berechneNaechstenTermin(unbefristet, '2030-06-01'));
});

test('berechneLaufTermine: alle Termine im Fenster inkl. Perioden', () => {
    const p = plan({ start_datum: '2025-11-01', abrechnungs_modus: 'NACHTRAEGLICH' });
    const termine = DauerrechnungController.berechneLaufTermine(p, '2025-11-01', '2026-02-01');
    assert.deepEqual(termine.map(t => t.rechnungsDatum), ['2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01']);
    const dezember = termine.find(t => t.rechnungsDatum === '2026-01-01');
    assert.deepEqual({ periodeVon: dezember.periodeVon, periodeBis: dezember.periodeBis }, { periodeVon: '2025-12-01', periodeBis: '2025-12-31' });
});

test('gruppiereFuerSammelrechnung: 5 Läufe / 2 Empfänger -> Gruppen 3+2', () => {
    const laeufe = [
        { planId: 1, empfaengerKundeId: 100 },
        { planId: 2, empfaengerKundeId: 100 },
        { planId: 3, empfaengerKundeId: 100 },
        { planId: 4, empfaengerKundeId: 200 },
        { planId: 5, empfaengerKundeId: 200 },
        { planId: 6, empfaengerKundeId: 300 }
    ];
    const gruppen = DauerrechnungController.gruppiereFuerSammelrechnung(laeufe);
    assert.equal(gruppen.size, 3);
    assert.deepEqual([...gruppen.keys()].sort(), [100, 200, 300]);
    assert.equal(gruppen.get(100).length, 3);
    assert.equal(gruppen.get(200).length, 2);
    assert.equal(gruppen.get(300).length, 1);

    assert.equal(gruppen.get(100).length >= 2, true);
    assert.equal(gruppen.get(300).length >= 2, false);
});

test('berechnePositionsListe: Pauschale vs. Positionen', () => {
    const pauschale = plan({ pauschale_netto: 100, mwst_satz: 19, name: 'Unterhaltsreinigung' });
    assert.deepEqual(DauerrechnungController.berechnePositionsListe(pauschale, []), [
        { artikelId: null, name: 'Unterhaltsreinigung', menge: 1, einheit: 'pauschal', preis: 100, mwst: 19 }
    ]);

    const positionenPlan = plan({ preis_modus: 'POSITIONEN' });
    const liste = DauerrechnungController.berechnePositionsListe(positionenPlan, [
        { name: 'Glasreinigung', menge: 2, einheit: 'm²', preis: 3.5, mwst: 19, sortier_index: 2 },
        { artikelId: 7, name: '', menge: 1, einheit: 'Stk.', preis: 50, mwst: 19, sortier_index: 1 }
    ]);
    assert.equal(liste[0].artikelId, 7);
    assert.equal(liste[1].name, 'Glasreinigung');
});

test('rhythmusLabel: lesbare deutsche Texte', () => {
    assert.equal(DauerrechnungController.rhythmusLabel(plan({})), 'monatlich zum 1.');
    assert.equal(DauerrechnungController.rhythmusLabel(plan({ rhythmus: 'QUARTALSWEISE', abrechnungstag: 15 })), 'alle 3 Monate zum 15.');
    assert.equal(DauerrechnungController.rhythmusLabel(plan({ rhythmus: 'JAEHRLICH', abrechnungsmonat: 3, abrechnungstag: 31 })), 'jährlich am 31. März');
    assert.equal(DauerrechnungController.rhythmusLabel(plan({ rhythmus: 'WOCHEN_INTERVALL', intervall_wochen: 3 })), 'alle 3 Wochen');
});
