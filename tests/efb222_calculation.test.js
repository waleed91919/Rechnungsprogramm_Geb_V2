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

    it('4. K2-17: 0% AGK und 0% Leistungswagnis werden nicht durch Defaults überschrieben', () => {
        const project = { id: 2, name: 'Projekt mit 0% AGK' };
        const positions = [
            {
                id: 201,
                name: 'Montagearbeiten',
                menge: 10,
                preis: 50.00,
                zeitansatz_h: 1.0,
                kostenart: 'LOHN'
            }
        ];

        const profile = {
            mittellohn_eur: 30.00,
            agk_endsumme_prozent: 0.00,
            wug_gewinn_prozent: 3.00,
            wug_betriebswagnis_prozent: 1.00,
            wug_leistungswagnis_prozent: 0.00
        };

        const res = EFBController.calculateEFB222(project, positions, {}, profile);

        assert.strictEqual(res.abschnitt2.agkProzent, 0.00, 'AGK 0% darf nicht zu 12% werden');
        assert.strictEqual(res.abschnitt2.wugAufteilung.leistungswagnisProzent, 0.00, 'Leistungswagnis 0% darf nicht zu 1.80% werden');
        assert.strictEqual(res.abschnitt2.wugAufteilung.gewinnProzent, 3.00);
        assert.strictEqual(res.abschnitt2.wugAufteilung.betriebswagnisProzent, 1.00);
        assert.strictEqual(res.abschnitt2.wugAufteilung.gesamtProzent, 4.00);
    });

    it('5. P0-2: EFB 221 mit 0,00% AGK und 0,00% W&G wird nicht durch Fallback-Defaults überschrieben', () => {
        const project = { id: 3, name: 'Projekt EFB 221 mit 0% AGK' };
        const positions = [
            {
                id: 301,
                name: 'Estricharbeiten',
                menge: 50,
                preis: 40.00,
                zeitansatz_h: 0.5,
                kostenart: 'LOHN'
            }
        ];

        // Profil mit expliziten 0,00% AGK über alle Kostenarten und 0% Leistungswagnis
        const profile = {
            mittellohn_eur: 26.00,
            lohngebundene_kosten_prozent: 80.00,
            lohnnebenkosten_prozent: 10.00,
            zuschlag_lohn_bgk: 15.00,
            zuschlag_lohn_agk: 0.00,
            zuschlag_stoff_agk: 0.00,
            zuschlag_geraet_agk: 0.00,
            zuschlag_sonst_agk: 0.00,
            zuschlag_nu_agk: 0.00,
            zuschlag_lohn_wug: 5.00,
            wug_gewinn_prozent: 3.00,
            wug_betriebswagnis_prozent: 2.00,
            wug_leistungswagnis_prozent: 0.00
        };

        const res = EFBController.calculateEFB221(project, positions, profile);

        assert.strictEqual(res.abschnitt2.zuschlaege.lohn.agk, 0.00, 'Lohn-AGK 0% darf nicht zu 22% werden');
        assert.strictEqual(res.abschnitt2.zuschlaege.stoffe.agk, 0.00, 'Stoff-AGK 0% darf nicht zu 14% werden');
        assert.strictEqual(res.abschnitt2.zuschlaege.geraete.agk, 0.00, 'Geräte-AGK 0% darf nicht zu 16% werden');
        assert.strictEqual(res.abschnitt2.zuschlaege.sonstige.agk, 0.00, 'Sonstige-AGK 0% darf nicht zu 12% werden');
        assert.strictEqual(res.abschnitt2.zuschlaege.nu.agk, 0.00, 'NU-AGK 0% darf nicht zu 10% werden');

        // Lohn Gesamt = 15% (BGK) + 0% (AGK) + 5% (W&G) = 20%
        assert.strictEqual(res.abschnitt2.zuschlaege.lohn.gesamt, 20.00);

        // W&G Leistungswagnis 0.00%
        assert.strictEqual(res.abschnitt2.wugAufteilung.leistungswagnis, 0.00, 'Leistungswagnis 0% darf nicht zu 1.8% werden');
        assert.strictEqual(res.abschnitt2.wugAufteilung.gewinn, 3.00);
        assert.strictEqual(res.abschnitt2.wugAufteilung.betriebswagnis, 2.00);

        // Auch mit globalem agk_endsumme_prozent / agk_prozent Vererbung
        const profileGlobalAgk = {
            agk_endsumme_prozent: 0.00,
            wug_leistungswagnis_prozent: 0.00
        };
        const resGlobal = EFBController.calculateEFB221(project, positions, profileGlobalAgk);
        assert.strictEqual(resGlobal.abschnitt2.zuschlaege.lohn.agk, 0.00, 'Globales AGK 0% muss in EFB 221 übernommen werden');
        assert.strictEqual(resGlobal.abschnitt2.zuschlaege.stoffe.agk, 0.00);
        assert.strictEqual(resGlobal.abschnitt2.wugAufteilung.leistungswagnis, 0.00);
    });
});

