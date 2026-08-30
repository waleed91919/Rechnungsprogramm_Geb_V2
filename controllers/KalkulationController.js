/**
 * controllers/KalkulationController.js - Baubetriebliche Zuschlags- & Endsummenkalkulation
 * Konform nach VHB 2024/2026 (BMWSB), KLR Bau und KAS.
 * Isomorph aufgebaut für Node.js Backend und Electron Renderer UI.
 */

class KalkulationController {
    /**
     * Standard-Kalkulationsprofil mit branchenüblichen Standardwerten nach VHB 2024/2026.
     */
    static getDefaultProfile() {
        return {
            name: 'Standard Bau-Kalkulation (VHB 2024/2026)',
            mittellohn_eur: 26.00,
            lohngebundene_kosten_prozent: 84.50,
            lohnnebenkosten_prozent: 13.50,
            kalkulationslohn_eur: 51.48,
            kalkulationsverfahren: 'ZUSCHLAGSKALKULATION', // 'ZUSCHLAGSKALKULATION' | 'ENDSUMMENKALKULATION'
            endsumme_umlage_basis: 'HERSTELLKOSTEN', // 'HERSTELLKOSTEN' | 'LOHNSTUNDEN'
            zuschlag_lohn_bgk: 18.00,
            zuschlag_lohn_agk: 22.00,
            zuschlag_lohn_wug: 8.00,
            zuschlag_stoff_bgk: 12.00,
            zuschlag_stoff_agk: 14.00,
            zuschlag_stoff_wug: 6.00,
            zuschlag_geraet_bgk: 15.00,
            zuschlag_geraet_agk: 16.00,
            zuschlag_geraet_wug: 6.00,
            zuschlag_sonst_bgk: 10.00,
            zuschlag_sonst_agk: 12.00,
            zuschlag_sonst_wug: 5.00,
            zuschlag_nu_bgk: 8.00,
            zuschlag_nu_agk: 10.00,
            zuschlag_nu_wug: 4.00,
            wug_gewinn_prozent: 5.00,
            wug_betriebswagnis_prozent: 2.00,
            wug_leistungswagnis_prozent: 1.00,
            skonto_abzug_kalkulation_prozent: 0.00
        };
    }

    /**
     * Berechnet den Mittellohn, Kalkulationslohn und Verrechnungslohn.
     * @param {Object} profile - Zuschlagsprofil
     */
    static calculateMittellohnStructure(profile = {}) {
        const ml = parseFloat(profile.mittellohn_eur) || 26.00;
        const lkPct = parseFloat(profile.lohngebundene_kosten_prozent) || 84.50;
        const lnkPct = parseFloat(profile.lohnnebenkosten_prozent) || 13.50;

        const lkEur = Math.round((ml * (lkPct / 100)) * 10000) / 10000;
        const lnkEur = Math.round((ml * (lnkPct / 100)) * 10000) / 10000;
        const kalkulationslohn = Math.round((ml + lkEur + lnkEur) * 100) / 100;

        const bgkLohn = parseFloat(profile.zuschlag_lohn_bgk) || 18.00;
        const agkLohn = parseFloat(profile.zuschlag_lohn_agk) || 22.00;
        const wugLohn = parseFloat(profile.zuschlag_lohn_wug) || 8.00;
        const gesamtZuschlagLohn = Math.round((bgkLohn + agkLohn + wugLohn) * 100) / 100;

        const zuschlagLohnEur = Math.round((kalkulationslohn * (gesamtZuschlagLohn / 100)) * 100) / 100;
        const verrechnungslohn = Math.round((kalkulationslohn + zuschlagLohnEur) * 100) / 100;

        return {
            mittellohn: ml,
            lohngebundeneKosten: { prozent: lkPct, eur: Math.round(lkEur * 100) / 100 },
            lohnnebenkosten: { prozent: lnkPct, eur: Math.round(lnkEur * 100) / 100 },
            kalkulationslohn,
            zuschlagLohn: {
                prozent: gesamtZuschlagLohn,
                bgk: bgkLohn,
                agk: agkLohn,
                wug: wugLohn,
                eur: zuschlagLohnEur
            },
            verrechnungslohn
        };
    }

    /**
     * Berechnet eine einzelne LV-Position nach dem Zuschlagskalkulationsverfahren.
     * @param {Object} pos - Positionsdatensatz
     * @param {Object} profile - Zuschlagsprofil
     */
    static calculatePosition(pos = {}, profile = {}) {
        const mlStruct = KalkulationController.calculateMittellohnStructure(profile);
        const kl = mlStruct.kalkulationslohn;
        const vl = mlStruct.verrechnungslohn;

        const menge = parseFloat(pos.menge) || 0;
        const zeitansatz = parseFloat(pos.zeitansatz_h !== undefined ? pos.zeitansatz_h : (pos.zeitansatz_stunden !== undefined ? pos.zeitansatz_stunden : (pos.stunden_je_me !== undefined ? pos.stunden_je_me : (pos.zeitansatz || 0)))) || 0;
        const costType = (pos.kostenart || pos.cost_type || 'MATERIAL').toUpperCase();

        // EKT je Mengeneinheit
        const ektLohnJeMe = Math.round((zeitansatz * kl) * 10000) / 10000;
        const ektStoffJeMe = pos.ekt_stoff_je_me !== undefined && pos.ekt_stoff_je_me !== null && !isNaN(parseFloat(pos.ekt_stoff_je_me))
            ? parseFloat(pos.ekt_stoff_je_me)
            : (costType === 'MATERIAL' ? (parseFloat(pos.ek) || 0) : 0);

        const ektGeraetJeMe = pos.ekt_geraet_je_me !== undefined && pos.ekt_geraet_je_me !== null && !isNaN(parseFloat(pos.ekt_geraet_je_me))
            ? parseFloat(pos.ekt_geraet_je_me)
            : ((costType === 'GERÄT' || costType === 'GERAET' || costType === 'EQUIPMENT') ? (parseFloat(pos.ek) || 0) : 0);

        const ektSonstJeMe = pos.ekt_sonst_je_me !== undefined && pos.ekt_sonst_je_me !== null && !isNaN(parseFloat(pos.ekt_sonst_je_me))
            ? parseFloat(pos.ekt_sonst_je_me)
            : ((costType === 'SONSTIGES' || costType === 'SONSTIGE') ? (parseFloat(pos.ek) || 0) : 0);

        const ektNuJeMe = pos.ekt_nu_je_me !== undefined && pos.ekt_nu_je_me !== null && !isNaN(parseFloat(pos.ekt_nu_je_me))
            ? parseFloat(pos.ekt_nu_je_me)
            : ((costType === 'SUB' || costType === 'SUBCONTRACTOR' || costType === 'NU') ? (parseFloat(pos.ek) || 0) : 0);

        const summeEktJeMe = Math.round((ektLohnJeMe + ektStoffJeMe + ektGeraetJeMe + ektSonstJeMe + ektNuJeMe) * 100) / 100;

        // Zuschläge je Kostenart
        const zStoff = (parseFloat(profile.zuschlag_stoff_bgk) || 12) + (parseFloat(profile.zuschlag_stoff_agk) || 14) + (parseFloat(profile.zuschlag_stoff_wug) || 6);
        const zGeraet = (parseFloat(profile.zuschlag_geraet_bgk) || 15) + (parseFloat(profile.zuschlag_geraet_agk) || 16) + (parseFloat(profile.zuschlag_geraet_wug) || 6);
        const zSonst = (parseFloat(profile.zuschlag_sonst_bgk) || 10) + (parseFloat(profile.zuschlag_sonst_agk) || 12) + (parseFloat(profile.zuschlag_sonst_wug) || 5);
        const zNu = (parseFloat(profile.zuschlag_nu_bgk) || 8) + (parseFloat(profile.zuschlag_nu_agk) || 10) + (parseFloat(profile.zuschlag_nu_wug) || 4);

        // VK-Anteile je ME
        const vkLohnJeMe = Math.round((zeitansatz * vl) * 100) / 100;
        const vkStoffJeMe = Math.round((ektStoffJeMe * (1 + zStoff / 100)) * 100) / 100;
        const vkGeraetJeMe = Math.round((ektGeraetJeMe * (1 + zGeraet / 100)) * 100) / 100;
        const vkSonstJeMe = Math.round((ektSonstJeMe * (1 + zSonst / 100)) * 100) / 100;
        const vkNuJeMe = Math.round((ektNuJeMe * (1 + zNu / 100)) * 100) / 100;

        const kalkulierterEpNetto = Math.round((vkLohnJeMe + vkStoffJeMe + vkGeraetJeMe + vkSonstJeMe + vkNuJeMe) * 100) / 100;
        const finalEp = parseFloat(pos.preis) > 0 ? parseFloat(pos.preis) : kalkulierterEpNetto;
        const gesamtbetragNetto = Math.round((menge * finalEp) * 100) / 100;

        // Deckungsbeitrag I je Position
        const ektGesamtPos = Math.round((summeEktJeMe * menge) * 100) / 100;
        const deckungsbeitrag1 = Math.round((gesamtbetragNetto - ektGesamtPos) * 100) / 100;
        const db1Quote = gesamtbetragNetto > 0 ? Math.round((deckungsbeitrag1 / gesamtbetragNetto) * 10000) / 100 : 0;

        return {
            id: pos.id,
            oz_code: pos.oz_code || '',
            name: pos.name || '',
            menge,
            einheit: pos.einheit || 'Stk.',
            zeitansatz_h: zeitansatz,
            gesamtstunden: Math.round(menge * zeitansatz * 100) / 100,
            ekt: {
                lohn: Math.round(ektLohnJeMe * menge * 100) / 100,
                stoffe: Math.round(ektStoffJeMe * menge * 100) / 100,
                geraete: Math.round(ektGeraetJeMe * menge * 100) / 100,
                sonstiges: Math.round(ektSonstJeMe * menge * 100) / 100,
                nu: Math.round(ektNuJeMe * menge * 100) / 100,
                gesamt: ektGesamtPos,
                lohnJeMe: Math.round(ektLohnJeMe * 100) / 100,
                stoffJeMe: ektStoffJeMe,
                geraetJeMe: ektGeraetJeMe,
                sonstJeMe: ektSonstJeMe,
                nuJeMe: ektNuJeMe,
                summeJeMe: summeEktJeMe,
                summeGesamt: ektGesamtPos
            },
            vkAnteile: {
                lohnJeMe: vkLohnJeMe,
                stoffJeMe: vkStoffJeMe,
                geraetJeMe: vkGeraetJeMe,
                sonstJeMe: vkSonstJeMe,
                nuJeMe: vkNuJeMe
            },
            einheitspreis: finalEp,
            kalkulierterEp: kalkulierterEpNetto,
            gesamtbetragNetto,
            deckungsbeitrag1,
            db1Quote
        };
    }

    /**
     * Berechnet die vollständige Projekt-Kalkulation inklusive Deckungsbeiträgen,
     * Gemeinkosten (EFB 221 / EFB 222) und Soll-Ist-Nachkalkulation.
     * @param {Array} positions - Positionsarray
     * @param {Object} profile - Zuschlagsprofil
     * @param {Object} actualCosts - Tatsächliche Ist-Kosten { material: number, sub: number, hours: number }
     */
    static calculateProjectKalkulation(positions = [], profile = {}, actualCosts = { material: 0, sub: 0, hours: 0 }) {
        const p = { ...KalkulationController.getDefaultProfile(), ...profile };
        const mlStruct = KalkulationController.calculateMittellohnStructure(p);

        let summeEktLohn = 0;
        let summeEktStoffe = 0;
        let summeEktGeraete = 0;
        let summeEktSonstige = 0;
        let summeEktNu = 0;
        let summeGesamtstunden = 0;
        let summeAngebotNetto = 0;

        const calculatedPositions = positions.map(pos => {
            const res = KalkulationController.calculatePosition(pos, p);
            summeEktLohn += res.ekt.lohnJeMe * res.menge;
            summeEktStoffe += res.ekt.stoffJeMe * res.menge;
            summeEktGeraete += res.ekt.geraetJeMe * res.menge;
            summeEktSonstige += res.ekt.sonstJeMe * res.menge;
            summeEktNu += res.ekt.nuJeMe * res.menge;
            summeGesamtstunden += res.gesamtstunden;
            summeAngebotNetto += res.gesamtbetragNetto;
            return res;
        });

        summeEktLohn = Math.round(summeEktLohn * 100) / 100;
        summeEktStoffe = Math.round(summeEktStoffe * 100) / 100;
        summeEktGeraete = Math.round(summeEktGeraete * 100) / 100;
        summeEktSonstige = Math.round(summeEktSonstige * 100) / 100;
        summeEktNu = Math.round(summeEktNu * 100) / 100;
        const summeEktGesamt = Math.round((summeEktLohn + summeEktStoffe + summeEktGeraete + summeEktSonstige + summeEktNu) * 100) / 100;
        summeAngebotNetto = Math.round(summeAngebotNetto * 100) / 100;

        let bgkGesamt = 0;
        let agkGesamt = 0;
        let wugGesamt = 0;
        let finalAngebotNetto = summeAngebotNetto;

        if (p.kalkulationsverfahren === 'ENDSUMMENKALKULATION') {
            // EFB 222: Endsummenkalkulation (Umlageverfahren)
            // 1. BGK über EKT-Sätze
            bgkGesamt = Math.round((
                summeEktLohn * ((parseFloat(p.zuschlag_lohn_bgk) || 0) / 100) +
                summeEktStoffe * ((parseFloat(p.zuschlag_stoff_bgk) || 0) / 100) +
                summeEktGeraete * ((parseFloat(p.zuschlag_geraet_bgk) || 0) / 100) +
                summeEktSonstige * ((parseFloat(p.zuschlag_sonst_bgk) || 0) / 100) +
                summeEktNu * ((parseFloat(p.zuschlag_nu_bgk) || 0) / 100)
            ) * 100) / 100;

            const herstellkosten = Math.round((summeEktGesamt + bgkGesamt) * 100) / 100;

            if (p.endsumme_umlage_basis === 'LOHNSTUNDEN' && summeGesamtstunden > 0) {
                // Umlage über Lohnstunden
                const agkSatzLohn = parseFloat(p.zuschlag_lohn_agk) || 22.0;
                agkGesamt = Math.round((summeGesamtstunden * mlStruct.kalkulationslohn * (agkSatzLohn / 100)) * 100) / 100;
                const selbstkosten = Math.round((herstellkosten + agkGesamt) * 100) / 100;
                const wugSatz = parseFloat(p.zuschlag_lohn_wug) || 8.0;
                wugGesamt = Math.round((selbstkosten * (wugSatz / 100)) * 100) / 100;
            } else {
                // Standard: Umlage über Herstellkosten (EKT + BGK)
                const agkSatz = parseFloat(p.zuschlag_stoff_agk || p.zuschlag_lohn_agk) || 16.0;
                agkGesamt = Math.round((herstellkosten * (agkSatz / 100)) * 100) / 100;
                const selbstkosten = Math.round((herstellkosten + agkGesamt) * 100) / 100;
                const wugSatz = (parseFloat(p.wug_gewinn_prozent) || 5.0) + (parseFloat(p.wug_betriebswagnis_prozent) || 2.0) + (parseFloat(p.wug_leistungswagnis_prozent) || 1.0);
                wugGesamt = Math.round((selbstkosten * (wugSatz / 100)) * 100) / 100;
            }

            if (summeAngebotNetto === 0) {
                finalAngebotNetto = Math.round((herstellkosten + agkGesamt + wugGesamt) * 100) / 100;
            }
        } else {
            // EFB 221: Zuschlagskalkulation (auf EKT je Kostenart)
            bgkGesamt = Math.round((
                summeEktLohn * ((parseFloat(p.zuschlag_lohn_bgk) || 0) / 100) +
                summeEktStoffe * ((parseFloat(p.zuschlag_stoff_bgk) || 0) / 100) +
                summeEktGeraete * ((parseFloat(p.zuschlag_geraet_bgk) || 0) / 100) +
                summeEktSonstige * ((parseFloat(p.zuschlag_sonst_bgk) || 0) / 100) +
                summeEktNu * ((parseFloat(p.zuschlag_nu_bgk) || 0) / 100)
            ) * 100) / 100;

            agkGesamt = Math.round((
                summeEktLohn * ((parseFloat(p.zuschlag_lohn_agk) || 0) / 100) +
                summeEktStoffe * ((parseFloat(p.zuschlag_stoff_agk) || 0) / 100) +
                summeEktGeraete * ((parseFloat(p.zuschlag_geraet_agk) || 0) / 100) +
                summeEktSonstige * ((parseFloat(p.zuschlag_sonst_agk) || 0) / 100) +
                summeEktNu * ((parseFloat(p.zuschlag_nu_agk) || 0) / 100)
            ) * 100) / 100;

            wugGesamt = Math.round((
                summeEktLohn * ((parseFloat(p.zuschlag_lohn_wug) || 0) / 100) +
                summeEktStoffe * ((parseFloat(p.zuschlag_stoff_wug) || 0) / 100) +
                summeEktGeraete * ((parseFloat(p.zuschlag_geraet_wug) || 0) / 100) +
                summeEktSonstige * ((parseFloat(p.zuschlag_sonst_wug) || 0) / 100) +
                summeEktNu * ((parseFloat(p.zuschlag_nu_wug) || 0) / 100)
            ) * 100) / 100;
        }

        // Deckungsbeitrag I ($DB_I = Erlös - EKT$)
        const deckungsbeitrag1Gesamt = Math.round((finalAngebotNetto - summeEktGesamt) * 100) / 100;
        const db1QuoteGesamt = finalAngebotNetto > 0 ? Math.round((deckungsbeitrag1Gesamt / finalAngebotNetto) * 10000) / 100 : 0;

        // Deckungsbeitrag II ($DB_{II} = DB_I - BGK$)
        const deckungsbeitrag2Gesamt = Math.round((deckungsbeitrag1Gesamt - bgkGesamt) * 100) / 100;

        // Reingewinn / Kalkulierter Gewinn = DB_II - AGK
        const kalkulierterGewinn = Math.round((deckungsbeitrag2Gesamt - agkGesamt) * 100) / 100;
        const gewinnMargeProzent = finalAngebotNetto > 0 ? Math.round((kalkulierterGewinn / finalAngebotNetto) * 10000) / 100 : 0;

        // Soll-Ist Nachkalkulations-Vergleich
        const actualHours = parseFloat(actualCosts.hours) || 0;
        const istKostenLohn = Math.round((actualHours * mlStruct.kalkulationslohn) * 100) / 100;
        const istKostenMaterial = parseFloat(actualCosts.material) || 0;
        const istKostenSub = parseFloat(actualCosts.sub) || 0;
        const istKostenGesamt = Math.round((istKostenLohn + istKostenMaterial + istKostenSub) * 100) / 100;
        const abweichungEkt = Math.round((summeEktGesamt - istKostenGesamt) * 100) / 100;
        const istDeckungsbeitrag = Math.round((finalAngebotNetto - istKostenGesamt) * 100) / 100;
        const istDbQuote = finalAngebotNetto > 0 ? Math.round((istDeckungsbeitrag / finalAngebotNetto) * 10000) / 100 : 0;

        return {
            mittellohnStructure: mlStruct,
            profile: p,
            positions: calculatedPositions,
            totals: {
                summeGesamtstunden: Math.round(summeGesamtstunden * 100) / 100,
                summeEktLohn,
                summeEktStoffe,
                summeEktGeraete,
                summeEktSonstige,
                summeEktNu,
                summeEktGesamt,
                bgkGesamt,
                agkGesamt,
                wugGesamt,
                deckungsbeitrag1: deckungsbeitrag1Gesamt,
                db1Quote: db1QuoteGesamt,
                deckungsbeitrag2: deckungsbeitrag2Gesamt,
                kalkulierterGewinn,
                gewinnMargeProzent,
                summeAngebotNetto: finalAngebotNetto
            },
            nachkalkulation: {
                sollEkt: summeEktGesamt,
                istEkt: istKostenGesamt,
                istStunden: actualHours,
                sollStunden: Math.round(summeGesamtstunden * 100) / 100,
                abweichungStunden: Math.round(((Math.round(summeGesamtstunden * 100) / 100) - actualHours) * 100) / 100,
                abweichungEkt,
                istDeckungsbeitrag,
                istDbQuote
            }
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = KalkulationController;
}
if (typeof window !== 'undefined') {
    window.KalkulationController = KalkulationController;
}
