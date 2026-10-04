/**
 * controllers/efb/efb223.js
 * EFB 223 Logik
 */

const Efb221 = typeof require !== 'undefined' ? require('./efb221.js') : window.Efb221;

const Efb223 = (function () {
    
    function calculateEFB223Positions(positions = [], vl, zuschlaege) {
        let summeGesamtbetrag = 0;
        let summeLohnstunden = 0;

        const aufgliederung = positions.map((pos, idx) => {
            const bd = Efb221.getPositionCostBreakdown(pos, vl, zuschlaege);
            const oz = pos.oz_code || pos.pos_nr || pos.oz || `01.01.${String(idx + 1).padStart(4, '0')}`;

            summeGesamtbetrag += bd.totalPosNetto;
            summeLohnstunden += bd.totalPosHours;

            return {
                index: idx + 1,
                id: pos.id,
                oz,
                kurztext: pos.name || `Position ${idx + 1}`,
                menge: bd.menge,
                einheit: pos.einheit || 'Stk.',
                zeitansatz: bd.zeitansatz,
                teilkostenLohn: bd.lohnTeilkosten,
                teilkostenStoffe: bd.stoffTeilkosten,
                teilkostenGeraete: bd.geraeteTeilkosten,
                teilkostenSonstige: bd.sonstigeTeilkosten + bd.nuTeilkosten,
                einheitspreis: bd.ep,
                gesamtbetrag: bd.totalPosNetto
            };
        });

        const roundGesamt = Math.round(summeGesamtbetrag * 100) / 100;
        const roundLohnstunden = Math.round(summeLohnstunden * 100) / 100;

        return {
            aufgliederung,
            summeGesamtbetrag: roundGesamt,
            summeLohnstunden: roundLohnstunden
        };
    }

    function verifyEFB223Verprobung(summeGesamtbetrag, angebotssumme221) {
        const verprobungsDifferenz = Math.round((summeGesamtbetrag - angebotssumme221) * 100) / 100;
        const isVerprobt = Math.abs(verprobungsDifferenz) < 0.05;

        return {
            verprobungsDifferenz,
            isVerprobt
        };
    }

    function calculateEFB223(positions = [], efb221Result) {
        if (!efb221Result || !efb221Result.abschnitt1 || !efb221Result.abschnitt2) {
            throw new Error('Ungültiges EFB 221 Ergebnis für EFB 223 Berechnung übergeben.');
        }

        const vl = efb221Result.abschnitt1.verrechnungslohn;
        const zuschlaege = efb221Result.abschnitt2.zuschlaege;

        const { aufgliederung, summeGesamtbetrag, summeLohnstunden } = calculateEFB223Positions(positions, vl, zuschlaege);
        
        const angebotssumme221 = efb221Result.abschnitt3.angebotssummeNetto;
        const { verprobungsDifferenz, isVerprobt } = verifyEFB223Verprobung(summeGesamtbetrag, angebotssumme221);

        return {
            aufgliederung,
            summeGesamtbetrag,
            summeLohnstunden,
            angebotssumme221,
            verprobungsDifferenz,
            isVerprobt
        };
    }

    return {
        calculateEFB223Positions,
        verifyEFB223Verprobung,
        calculateEFB223
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Efb223;
}
if (typeof window !== 'undefined') {
    window.Efb223 = Efb223;
}
