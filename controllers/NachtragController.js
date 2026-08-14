/**
 * NachtragController.js - VOB/B Nachtragsverwaltung & Workflow Engine
 * Verwaltet Nachtragsangebote (VOB/B § 2 Abs. 5 & 6) und integriert genehmigte Positionen
 * in die kumulierte Bauabrechnung (F_t = L_t - SUM(F_i)).
 */

class NachtragController {
    /**
     * Berechnet die Summen eines Nachtragsangebots.
     * @param {Array} positionen - Liste von Nachtragspositionen
     * @param {number} taxRate - Steuersatz in Prozent (Standard: 19)
     * @returns {Object} { summeNetto, summeUst, summeBrutto, totalsByCostType }
     */
    static calculateNachtragTotals(positionen = [], taxRate = 19.0) {
        let summeNetto = 0;
        const totalsByCostType = {
            LOHN: 0,
            MATERIAL: 0,
            GERÄT: 0,
            FAHRT: 0
        };

        for (const p of positionen) {
            const menge = parseFloat(p.menge) || 0;
            const ep = parseFloat(p.einheitspreis) || 0;
            const gp = Math.round(menge * ep * 100) / 100;
            p.gesamtpreis = gp;

            summeNetto += gp;
            const costType = (p.cost_type || 'MATERIAL').toUpperCase();
            if (totalsByCostType[costType] !== undefined) {
                totalsByCostType[costType] += gp;
            } else {
                totalsByCostType.MATERIAL += gp;
            }
        }

        summeNetto = Math.round(summeNetto * 100) / 100;
        const summeUst = Math.round(summeNetto * (taxRate / 100) * 100) / 100;
        const summeBrutto = Math.round((summeNetto + summeUst) * 100) / 100;

        return {
            summeNetto,
            summeUst,
            summeBrutto,
            totalsByCostType: {
                LOHN: Math.round(totalsByCostType.LOHN * 100) / 100,
                MATERIAL: Math.round(totalsByCostType.MATERIAL * 100) / 100,
                GERÄT: Math.round(totalsByCostType.GERÄT * 100) / 100,
                FAHRT: Math.round(totalsByCostType.FAHRT * 100) / 100
            }
        };
    }

    /**
     * Validiert einen Nachtrag vor dem Einreichen oder Speichern.
     */
    static validateNachtrag(nachtrag, positionen = []) {
        if (!nachtrag.titel || nachtrag.titel.trim() === '') {
            return { valid: false, message: 'Bitte geben Sie einen Titel für den Nachtrag an.' };
        }
        if (!nachtrag.nachtrag_nr || nachtrag.nachtrag_nr.trim() === '') {
            return { valid: false, message: 'Bitte vergeben Sie eine Nachtragsnummer (z.B. N-01).' };
        }
        if (!positionen || positionen.length === 0) {
            return { valid: false, message: 'Ein Nachtrag muss mindestens eine Position enthalten.' };
        }
        for (const p of positionen) {
            if (!p.kurztext || p.kurztext.trim() === '') {
                return { valid: false, message: 'Jede Nachtragsposition benötigt eine Kurzbezeichnung.' };
            }
            if ((parseFloat(p.menge) || 0) <= 0) {
                return { valid: false, message: 'Die Menge jeder Position muss größer als 0 sein.' };
            }
        }
        return { valid: true };
    }

    /**
     * Ermittelt die Rechtsgrundlagen-Bezeichnung nach VOB/B bzw. BGB.
     */
    static getRechtsgrundlageLabel(code) {
        switch (code) {
            case 'VOB_2_5':
                return 'VOB/B § 2 Abs. 5 (Leistungsänderung durch AG)';
            case 'VOB_2_6':
                return 'VOB/B § 2 Abs. 6 (Zusätzliche Leistung ohne Vereinbarung)';
            case 'VOB_2_3':
                return 'VOB/B § 2 Abs. 3 (Mengenänderung > 110%)';
            case 'BGB_650b':
                return 'BGB § 650b (Bauvertragliche Änderungsanordnung)';
            default:
                return 'VOB/B § 2 Abs. 6 (Zusätzliche Leistung)';
        }
    }

    /**
     * Filtert alle genehmigten Nachträge eines Projekts und bereitet sie als Rechnungspositionen vor.
     */
    static extractApprovedPositionsForInvoice(nachtraege = []) {
        const approvedNachtraege = nachtraege.filter(n => n.status === 'GENEHMIGT');
        const invoicePositions = [];

        for (const n of approvedNachtraege) {
            for (const p of (n.positionen || [])) {
                invoicePositions.push({
                    name: `[${n.nachtrag_nr}] ${p.kurztext}`,
                    oz_code: p.oz_code || n.nachtrag_nr,
                    menge: p.menge,
                    einheit: p.einheit || 'Stk.',
                    preis: p.einheitspreis,
                    cost_type: p.cost_type || 'MATERIAL',
                    is_supplement: true,
                    nachtrag_id: n.id,
                    nachtrag_nr: n.nachtrag_nr
                });
            }
        }

        return invoicePositions;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NachtragController;
}
if (typeof window !== 'undefined') {
    window.NachtragController = NachtragController;
}
