/**
 * tests/efb.test.js - Unit- und Integrationstests für EFB-Preisblätter 221 & 223 (VHB Bund)
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const EFBController = require('../controllers/EFBController');

describe('EFB-Preisblätter 221 & 223 (VHB Bund)', () => {

    const sampleProfile = {
        name: 'Testprofil Hochbau',
        mittellohn_eur: 25.00,
        lohngebundene_kosten_prozent: 80.00,
        lohnnebenkosten_prozent: 10.00,
        zuschlag_lohn_bgk: 15.00,
        zuschlag_lohn_agk: 20.00,
        zuschlag_lohn_wug: 5.00,
        zuschlag_stoff_bgk: 10.00,
        zuschlag_stoff_agk: 12.00,
        zuschlag_stoff_wug: 5.00,
        zuschlag_geraet_bgk: 12.00,
        zuschlag_geraet_agk: 15.00,
        zuschlag_geraet_wug: 5.00,
        zuschlag_sonst_bgk: 8.00,
        zuschlag_sonst_agk: 10.00,
        zuschlag_sonst_wug: 4.00,
        zuschlag_nu_bgk: 5.00,
        zuschlag_nu_agk: 8.00,
        zuschlag_nu_wug: 3.00
    };

    const samplePositions = [
        {
            pos_nr: '01.01.0010',
            name: 'Mauerwerk KS 20DF',
            beschreibung: 'Kalksandstein Mauerwerk d=24cm',
            menge: 100,
            einheit: 'm²',
            preis: 85.00,
            kostenart: 'LOHN_MATERIAL',
            lohnanteil_prozent: 50
        },
        {
            pos_nr: '01.01.0020',
            name: 'Betonarbeiten Bodenplatte',
            beschreibung: 'C25/30 bewehrt',
            menge: 50,
            einheit: 'm³',
            preis: 150.00,
            kostenart: 'MATERIAL',
            lohnanteil_prozent: 20
        },
        {
            pos_nr: '01.02.0010',
            name: 'Gerüstgestellung',
            beschreibung: 'Fassadengerüst Lastklasse 3',
            menge: 200,
            einheit: 'm²',
            preis: 12.00,
            kostenart: 'GERAETE',
            lohnanteil_prozent: 10
        }
    ];

    const sampleProject = {
        id: 101,
        name: 'Neubau Wohnanlage Parkblick',
        auftraggeber: 'Städtische Wohnungsbau GmbH'
    };

    test('1. Berechnung Mittellohn & Verrechnungslohn (EFB 221 Abschnitt 1)', () => {
        const efb221 = EFBController.calculateEFB221(sampleProject, samplePositions, sampleProfile);
        const a1 = efb221.abschnitt1;

        assert.strictEqual(a1.mittellohn, 25.00);
        assert.strictEqual(a1.lohngebundeneKostenEur, 20.00); // 80% von 25
        assert.strictEqual(a1.lohnnebenkostenEur, 2.50); // 10% von 25
        assert.strictEqual(a1.kalkulationslohn, 47.50); // 25 + 20 + 2.50
        assert.strictEqual(a1.zuschlagLohnProzent, 40.00); // 15 + 20 + 5
        assert.strictEqual(a1.zuschlagLohnEur, 19.00); // 40% von 47.50
        assert.strictEqual(a1.verrechnungslohn, 66.50); // 47.50 + 19.00
    });

    test('2. Zuschlagsmatrix nach 5 Kostenarten (EFB 221 Abschnitt 2)', () => {
        const efb221 = EFBController.calculateEFB221(sampleProject, samplePositions, sampleProfile);
        const z = efb221.abschnitt2.zuschlaege;

        assert.strictEqual(z.lohn.gesamt, 40.00);
        assert.strictEqual(z.stoffe.gesamt, 27.00); // 10 + 12 + 5
        assert.strictEqual(z.geraete.gesamt, 32.00); // 12 + 15 + 5
        assert.strictEqual(z.sonstige.gesamt, 22.00); // 8 + 10 + 4
        assert.strictEqual(z.nu.gesamt, 16.00); // 5 + 8 + 3
    });

    test('3. Ermittlung der Angebotssumme (EFB 221 Abschnitt 3)', () => {
        const efb221 = EFBController.calculateEFB221(sampleProject, samplePositions, sampleProfile);
        const a3 = efb221.abschnitt3;

        assert.ok(a3.angebotssummeNetto > 0, 'Angebotssumme Netto muss positiv sein');
        assert.ok(a3.gesamtstunden > 0, 'Gesamtstunden müssen ermittelt werden');

        // Summe aller 3 Positionen:
        // Pos 1: 100 * 85 = 8500
        // Pos 2: 50 * 150 = 7500
        // Pos 3: 200 * 12 = 2400
        // Gesamt = 18400.00
        assert.strictEqual(a3.angebotssummeNetto, 18400.00);
    });

    test('4. Formblatt 223 Positionsaufgliederung & Teilkostenzerlegung', () => {
        const efb221 = EFBController.calculateEFB221(sampleProject, samplePositions, sampleProfile);
        const efb223 = EFBController.calculateEFB223(samplePositions, efb221);

        assert.strictEqual(efb223.aufgliederung.length, 3);
        const pos1 = efb223.aufgliederung[0];

        assert.strictEqual(pos1.oz, '01.01.0010');
        assert.strictEqual(pos1.menge, 100);
        assert.strictEqual(pos1.gesamtbetrag, 8500.00);

        // Summe der Teilkosten muss Einheitspreis ergeben
        const sumTeilkosten = pos1.teilkostenLohn + pos1.teilkostenStoffe + pos1.teilkostenGeraete + pos1.teilkostenSonstige;
        assert.ok(Math.abs(sumTeilkosten - pos1.einheitspreis) < 0.05, `Teilkosten-Summe (${sumTeilkosten}) muss EP (${pos1.einheitspreis}) entsprechen`);
    });

    test('5. VHB 221 / 223 Mathematische Live-Verprobung (Δ = 0,00 €)', () => {
        const efb221 = EFBController.calculateEFB221(sampleProject, samplePositions, sampleProfile);
        const efb223 = EFBController.calculateEFB223(samplePositions, efb221);

        assert.strictEqual(efb223.isVerprobt, true, 'Verprobung zwischen EFB 221 und 223 muss erfolgreich sein');
        assert.ok(Math.abs(efb223.verprobungsDifferenz) < 0.05, `Verprobungsdifferenz muss < 0.05 € sein (Ist: ${efb223.verprobungsDifferenz})`);
        assert.strictEqual(efb223.summeGesamtbetrag, 18400.00);
    });

    test('6. HTML Generator für EFB 221 (A4 Hochformat) und EFB 223 (A4 Querformat)', () => {
        const efb221 = EFBController.calculateEFB221(sampleProject, samplePositions, sampleProfile);
        const efb223 = EFBController.calculateEFB223(samplePositions, efb221);
        const company = { firmenname: 'W-Link Bau GmbH', ort: 'Frankfurt' };

        const html221 = EFBController.generateEFB221Html(sampleProject, efb221, company);
        assert.ok(html221.includes('EFB-Preisblatt 221'), 'HTML 221 muss Titel enthalten');
        assert.ok(html221.includes('W-Link Bau GmbH'), 'HTML 221 muss Firmennamen enthalten');
        assert.ok(html221.includes('66,50'), 'HTML 221 muss Verrechnungslohn enthalten');

        const html223 = EFBController.generateEFB223Html(sampleProject, efb223, efb221, company);
        assert.ok(html223.includes('EFB-Preisblatt 223'), 'HTML 223 muss Titel enthalten');
        assert.ok(html223.includes('@page { size: A4 landscape;'), 'HTML 223 muss Landscape CSS enthalten');
        assert.ok(html223.includes('01.01.0010'), 'HTML 223 muss OZ enthalten');
    });
});
