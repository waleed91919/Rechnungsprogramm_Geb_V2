const { describe, it } = require('node:test');
const assert = require('node:assert');
const EFBController = require('../controllers/EFBController');

describe('EFB 222 (Endsummenkalkulation) nach VHB-Bund', () => {
    it('1. Standard BGK-Gliederung enthält Abschnitte 3.1.1 bis 3.1.5', () => {
        const bgk = EFBController.getDefaultBgkDetails();
        assert.ok(bgk.lohnkosten_baustelleneinrichtung > 0, '3.1.1 Lohnkosten BE muss vorhanden sein');
        assert.ok(bgk.gehaltskosten_baustelle > 0, '3.1.2 Gehaltskosten Baustelle muss vorhanden sein');
        assert.ok(bgk.geraete_ausruestung > 0, '3.1.3 Geräte & Ausrüstung muss vorhanden sein');
        assert.ok(bgk.transporte_anfahrten > 0, '3.1.4 Transporte & Anfahrten muss vorhanden sein');
        assert.ok(bgk.sonderkosten > 0, '3.1.5 Sonderkosten muss vorhanden sein');
    });

    it('2. EFB 222 Umlagerechnung: Rest-Gemeinkosten werden sauber auf den Lohn umgelegt', () => {
        const project = { id: 1, name: 'Neubau Bürogebäude Berlin' };
        const positions = [
            {
                id: 101,
                name: 'Mauerwerk Porenbeton',
                menge: 100,
                preis: 95.00,
                zeitansatz_h: 1.20,
                kostenart: 'LOHN',
                ekt_stoffe: 35.00
            },
            {
                id: 102,
                name: 'Betonage Bodenplatte C25/30',
                menge: 50,
                preis: 140.00,
                zeitansatz_h: 0.80,
                kostenart: 'MATERIAL',
                ek: 80.00
            }
        ];

        const bgkDetails = {
            lohnkosten_baustelleneinrichtung: 1500.00,
            gehaltskosten_baustelle: 3000.00,
            geraete_ausruestung: 2000.00,
            transporte_anfahrten: 800.00,
            sonderkosten: 500.00
        };

        const profile = {
            mittellohn_eur: 25.00,
            lohngebundene_kosten_prozent: 84.00,
            lohnnebenkosten_prozent: 12.00,
            umlage_stoff_prozent: 20.00,
            umlage_geraet_prozent: 10.00,
            umlage_sonst_prozent: 5.00,
            umlage_nu_prozent: 10.00,
            agk_endsumme_prozent: 12.00,
            wug_gewinn_prozent: 4.00,
            wug_betriebswagnis_prozent: 2.00,
            wug_leistungswagnis_prozent: 1.80
        };

        const res = EFBController.calculateEFB222(project, positions, bgkDetails, profile);

        assert.strictEqual(res.formblatt, 'EFB_222');
        assert.strictEqual(res.abschnitt1.mittellohn, 25.00);

        // KL = 25 * (1 + 0.84 + 0.12) = 25 * 1.96 = 49.00 €/h
        assert.strictEqual(res.abschnitt1.kalkulationslohn, 49.00);

        // BGK Summe = 1500 + 3000 + 2000 + 800 + 500 = 7800 €
        assert.strictEqual(res.abschnitt3.summeBgk, 7800.00);

        // Gesamtstunden: 100 * 1.20 + 50 * 0.80 = 120 + 40 = 160 h
        assert.strictEqual(res.abschnitt4.gesamtstunden, 160);

        // EKT Lohn = 160 * 49.00 = 7840.00 €
        assert.strictEqual(res.abschnitt4.ektLohn, 7840.00);

        // Verrechnungslohn (VL) muss höher sein als Kalkulationslohn (KL)
        assert.ok(res.abschnitt1.verrechnungslohn > res.abschnitt1.kalkulationslohn, 'VL muss durch Restumlage höher sein als KL');
        assert.ok(res.abschnitt1.zuschlagLohnProzent > 0, 'Zuschlag Lohn muss positiv sein');

        // W&G Aufteilung muss differenziert vorliegen
        assert.strictEqual(res.abschnitt2.wugAufteilung.betriebswagnisProzent, 2.00);
        assert.strictEqual(res.abschnitt2.wugAufteilung.leistungswagnisProzent, 1.80);
        assert.strictEqual(res.abschnitt2.wugAufteilung.gewinnProzent, 4.00);
        assert.ok(res.abschnitt2.wugAufteilung.gesamtBetrag > 0, 'W&G Gesamtbetrag muss > 0 sein');

        // Verprobung der Angebotssumme
        const calculatedSum = Math.round((res.abschnitt4.summeLohn + res.abschnitt4.summeStoffe + res.abschnitt4.summeGeraete + res.abschnitt4.summeSonstige + res.abschnitt4.summeNU) * 100) / 100;
        assert.strictEqual(res.abschnitt4.angebotssummeNetto, calculatedSum, 'Netto-Angebotssumme muss Summe aller Kostenarten entsprechen');
    });

    it('3. generateEFB222Html erzeugt valides VHB-Bund Druckdokument', () => {
        const project = { name: 'Sanierung Altbau Leipzig' };
        const res = EFBController.calculateEFB222(project, [], {}, {});
        const html = EFBController.generateEFB222Html(project, res, { firmenname: 'Bau GmbH' });

        assert.ok(html.includes('EFB-Preisblatt 222 (VHB Bund)'), 'Muss Titel enthalten');
        assert.ok(html.includes('Preisermittlung bei Endsummenkalkulation'), 'Muss Untertitel enthalten');
        assert.ok(html.includes('3.1.1 Lohnkosten der Baustelleneinrichtung'), 'Muss BGK 3.1.1 enthalten');
        assert.ok(html.includes('3.1.5 Sonderkosten der Baustelle'), 'Muss BGK 3.1.5 enthalten');
        assert.ok(html.includes('Netto-Angebotssumme'), 'Muss Angebotssumme enthalten');
        assert.ok(html.includes('Sanierung Altbau Leipzig'), 'Muss Projektnamen enthalten');
    });
});
