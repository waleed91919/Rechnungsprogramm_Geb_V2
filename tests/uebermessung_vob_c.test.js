const { describe, it } = require('node:test');
const assert = require('node:assert');
const AufmassController = require('../controllers/AufmassController');

describe('VOB/C Übermessungs- & Abzugsregeln (ATV DIN 18299 ff.)', () => {
    it('1. Wandflächen (Putz, Trockenbau, Mauerwerk, Maler): Grenzwert 2,50 m²', () => {
        // DIN 18350 (Putz)
        const fensterKlein = AufmassController.applyUebermessungRule(2.40, 'DIN_18350');
        assert.strictEqual(fensterKlein.isOvermeasured, true, '2.40 m² muss übermessen werden');
        assert.strictEqual(fensterKlein.abzug, 0.0);
        assert.strictEqual(fensterKlein.grenzwert, 2.50);

        const fensterExakt = AufmassController.applyUebermessungRule(2.50, 'DIN_18340');
        assert.strictEqual(fensterExakt.isOvermeasured, true, '2.50 m² muss übermessen werden (<= 2,50 m²)');
        assert.strictEqual(fensterExakt.abzug, 0.0);

        const fensterGross = AufmassController.applyUebermessungRule(2.55, 'DIN_18363');
        assert.strictEqual(fensterGross.isOvermeasured, false, '2.55 m² muss abgezogen werden (> 2,50 m²)');
        assert.strictEqual(fensterGross.abzug, 2.55);

        const doppelTuer = AufmassController.applyUebermessungRule(4.20, 'MAUERWERK');
        assert.strictEqual(doppelTuer.isOvermeasured, false);
        assert.strictEqual(doppelTuer.abzug, 4.20);
    });

    it('2. Fliesen, Platten, Estrich, Bodenbeläge: Grenzwert 0,10 m²', () => {
        // DIN 18352 (Fliesen)
        const rohrDurchfuehrung = AufmassController.applyUebermessungRule(0.08, 'DIN_18352');
        assert.strictEqual(rohrDurchfuehrung.isOvermeasured, true, '0.08 m² Fliesen muss übermessen werden');
        assert.strictEqual(rohrDurchfuehrung.abzug, 0.0);
        assert.strictEqual(rohrDurchfuehrung.grenzwert, 0.10);

        const bodenablauf = AufmassController.applyUebermessungRule(0.10, 'ESTRICH');
        assert.strictEqual(bodenablauf.isOvermeasured, true, '0.10 m² Estrich muss übermessen werden (<= 0,10 m²)');
        assert.strictEqual(bodenablauf.abzug, 0.0);

        const revisionKappe = AufmassController.applyUebermessungRule(0.12, 'FLIESEN');
        assert.strictEqual(revisionKappe.isOvermeasured, false, '0.12 m² Fliesen muss abgezogen werden (> 0,10 m²)');
        assert.strictEqual(revisionKappe.abzug, 0.12);
    });

    it('3. Längenmaße: Grenzwert 1,00 m Unterbrechung', () => {
        const unterbrechungKurz = AufmassController.applyUebermessungRule(0.90, 'DIN_18299', 'LAENGE');
        assert.strictEqual(unterbrechungKurz.isOvermeasured, true, '0.90 m muss übermessen werden');
        assert.strictEqual(unterbrechungKurz.abzug, 0.0);
        assert.strictEqual(unterbrechungKurz.grenzwert, 1.00);

        const unterbrechungLang = AufmassController.applyUebermessungRule(1.50, 'DIN_18299', 'LAENGE');
        assert.strictEqual(unterbrechungLang.isOvermeasured, false, '1.50 m muss abgezogen werden');
        assert.strictEqual(unterbrechungLang.abzug, 1.50);
    });

    it('4. calculateNettoAufmass saldiert Bruttofläche mit VOB/C Aussparungen', () => {
        // Wandfläche 100 m² Putz (DIN 18350)
        // Fenster 1: 1.20 m x 1.50 m = 1.80 m² (übermessen)
        // Fenster 2: 2.00 m x 1.80 m = 3.60 m² (abzugspflichtig: 3.60 m²)
        // Tür: 1.00 m x 2.10 m = 2.10 m² (übermessen)
        // Tor: 3.00 m x 2.50 m = 7.50 m² (abzugspflichtig: 7.50 m²)
        const aussparungen = [
            { bezeichnung: 'Fenster 1', breite: 1.20, hoehe: 1.50 },
            { bezeichnung: 'Fenster 2', breite: 2.00, hoehe: 1.80 },
            { bezeichnung: 'Tür EG', breite: 1.00, hoehe: 2.10 },
            { bezeichnung: 'Sektionaltor', breite: 3.00, hoehe: 2.50 }
        ];

        const res = AufmassController.calculateNettoAufmass(100.00, aussparungen, 'DIN_18350');

        assert.strictEqual(res.bruttoFlaeche, 100.00);
        // Übermessen: 1.80 + 2.10 = 3.90 m²
        assert.strictEqual(res.summeUebermessen, 3.90);
        // Abzuziehen: 3.60 + 7.50 = 11.10 m²
        assert.strictEqual(res.summeAbzuege, 11.10);
        // Netto: 100.00 - 11.10 = 88.90 m²
        assert.strictEqual(res.nettoFlaeche, 88.90);
        assert.strictEqual(res.gepruefteAussparungen.length, 4);
    });
});
