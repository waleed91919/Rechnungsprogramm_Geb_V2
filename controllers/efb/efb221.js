/**
 * controllers/efb/efb221.js
 * EFB 221 Logik
 */

const EfbUtils = typeof require !== 'undefined' ? require('./efb-utils.js') : window.EfbUtils;

const Efb221 = (function () {
    
    function calculateMittellohn(mergedProfile) {
        const ml = EfbUtils._parseNumberOrZero(mergedProfile.mittellohn_eur, 24.50);
        const lohngebPct = EfbUtils._parseNumberOrZero(mergedProfile.lohngebundene_kosten_prozent, 85.00);
        const lohnnebenPct = EfbUtils._parseNumberOrZero(mergedProfile.lohnnebenkosten_prozent, 12.50);

        const lohngebEur = Math.round((ml * (lohngebPct / 100)) * 100) / 100;
        const lohnnebenEur = Math.round((ml * (lohnnebenPct / 100)) * 100) / 100;
        const kalkulationslohn = Math.round((ml + lohngebEur + lohnnebenEur) * 100) / 100;

        return { ml, lohngebPct, lohnnebenPct, lohngebEur, lohnnebenEur, kalkulationslohn };
    }

    function calculateZuschlaege(profile, mergedProfile) {
        const rawGlobalAgk = profile.agk_endsumme_prozent ?? profile.agk_prozent ?? profile.agk;
        const hasGlobalAgk = rawGlobalAgk !== undefined && rawGlobalAgk !== null && !isNaN(parseFloat(rawGlobalAgk));
        const fallbackAgk = hasGlobalAgk ? parseFloat(rawGlobalAgk) : null;

        const zuschlaege = {
            lohn: {
                bgk: EfbUtils._parseNumberOrZero(profile.zuschlag_lohn_bgk ?? mergedProfile.zuschlag_lohn_bgk, 18.0),
                agk: EfbUtils._parseNumberOrZero(profile.zuschlag_lohn_agk ?? fallbackAgk ?? mergedProfile.zuschlag_lohn_agk, 22.0),
                wug: EfbUtils._parseNumberOrZero(profile.zuschlag_lohn_wug ?? mergedProfile.zuschlag_lohn_wug, 8.8),
                gesamt: 0
            },
            stoffe: {
                bgk: EfbUtils._parseNumberOrZero(profile.zuschlag_stoff_bgk ?? mergedProfile.zuschlag_stoff_bgk, 12.0),
                agk: EfbUtils._parseNumberOrZero(profile.zuschlag_stoff_agk ?? fallbackAgk ?? mergedProfile.zuschlag_stoff_agk, 14.0),
                wug: EfbUtils._parseNumberOrZero(profile.zuschlag_stoff_wug ?? mergedProfile.zuschlag_stoff_wug, 6.0),
                gesamt: 0
            },
            geraete: {
                bgk: EfbUtils._parseNumberOrZero(profile.zuschlag_geraet_bgk ?? mergedProfile.zuschlag_geraet_bgk, 15.0),
                agk: EfbUtils._parseNumberOrZero(profile.zuschlag_geraet_agk ?? fallbackAgk ?? mergedProfile.zuschlag_geraet_agk, 16.0),
                wug: EfbUtils._parseNumberOrZero(profile.zuschlag_geraet_wug ?? mergedProfile.zuschlag_geraet_wug, 6.0),
                gesamt: 0
            },
            sonstige: {
                bgk: EfbUtils._parseNumberOrZero(profile.zuschlag_sonst_bgk ?? mergedProfile.zuschlag_sonst_bgk, 10.0),
                agk: EfbUtils._parseNumberOrZero(profile.zuschlag_sonst_agk ?? fallbackAgk ?? mergedProfile.zuschlag_sonst_agk, 12.0),
                wug: EfbUtils._parseNumberOrZero(profile.zuschlag_sonst_wug ?? mergedProfile.zuschlag_sonst_wug, 5.0),
                gesamt: 0
            },
            nu: {
                bgk: EfbUtils._parseNumberOrZero(profile.zuschlag_nu_bgk ?? mergedProfile.zuschlag_nu_bgk, 8.0),
                agk: EfbUtils._parseNumberOrZero(profile.zuschlag_nu_agk ?? fallbackAgk ?? mergedProfile.zuschlag_nu_agk, 10.0),
                wug: EfbUtils._parseNumberOrZero(profile.zuschlag_nu_wug ?? mergedProfile.zuschlag_nu_wug, 4.0),
                gesamt: 0
            }
        };

        for (const k of Object.keys(zuschlaege)) {
            zuschlaege[k].gesamt = Math.round((zuschlaege[k].bgk + zuschlaege[k].agk + zuschlaege[k].wug) * 100) / 100;
        }
        
        return zuschlaege;
    }

    function calculateEndsumme(positions, kalkulationslohn, verrechnungslohn, zuschlaege) {
        let totalHours = 0;
        let summeLohn = 0;
        let summeStoffe = 0;
        let summeGeraete = 0;
        let summeSonstige = 0;
        let summeNU = 0;

        positions.forEach(pos => {
            const bd = getPositionCostBreakdown(pos, verrechnungslohn, zuschlaege);
            totalHours += bd.totalPosHours;
            summeLohn += bd.lohnTeilkosten * bd.menge;
            summeStoffe += bd.stoffTeilkosten * bd.menge;
            summeGeraete += bd.geraeteTeilkosten * bd.menge;
            summeSonstige += bd.sonstigeTeilkosten * bd.menge;
            summeNU += bd.nuTeilkosten * bd.menge;
        });

        summeLohn = Math.round(summeLohn * 100) / 100;
        summeStoffe = Math.round(summeStoffe * 100) / 100;
        summeGeraete = Math.round(summeGeraete * 100) / 100;
        summeSonstige = Math.round(summeSonstige * 100) / 100;
        summeNU = Math.round(summeNU * 100) / 100;

        const ektLohn = Math.round((totalHours * kalkulationslohn) * 100) / 100;
        const ektStoffe = Math.round((summeStoffe / (1 + zuschlaege.stoffe.gesamt / 100)) * 100) / 100;
        const ektGeraete = Math.round((summeGeraete / (1 + zuschlaege.geraete.gesamt / 100)) * 100) / 100;
        const ektSonstige = Math.round((summeSonstige / (1 + zuschlaege.sonstige.gesamt / 100)) * 100) / 100;
        const ektNU = Math.round((summeNU / (1 + zuschlaege.nu.gesamt / 100)) * 100) / 100;

        const angebotssummeNetto = Math.round((summeLohn + summeStoffe + summeGeraete + summeSonstige + summeNU) * 100) / 100;

        return {
            totalHours,
            summeLohn,
            summeStoffe,
            summeGeraete,
            summeSonstige,
            summeNU,
            ektLohn,
            ektStoffe,
            ektGeraete,
            ektSonstige,
            ektNU,
            angebotssummeNetto
        };
    }

    function calculateEFB221(project = {}, positions = [], profile = {}) {
        const mergedProfile = EfbUtils.mergeProfile(profile);

        // 1. Angaben über den Verrechnungslohn (Abschnitt 1)
        const mlData = calculateMittellohn(mergedProfile);

        // 2. Zuschläge auf Einzelkosten der Teilleistungen (Abschnitt 2)
        const zuschlaege = calculateZuschlaege(profile, mergedProfile);

        // Verrechnungslohn (VL)
        const zuschlagLohnBetrag = Math.round((mlData.kalkulationslohn * (zuschlaege.lohn.gesamt / 100)) * 100) / 100;
        const verrechnungslohn = Math.round((mlData.kalkulationslohn + zuschlagLohnBetrag) * 100) / 100;

        // 3. Ermittlung der Einzelkosten (EKT) und Gesamtstunden aus den Positionen
        const esData = calculateEndsumme(positions, mlData.kalkulationslohn, verrechnungslohn, zuschlaege);

        return {
            projektName: project.name || 'Projekt',
            abschnitt1: {
                mittellohn: mlData.ml,
                lohngebundeneKostenProzent: mlData.lohngebPct,
                lohngebundeneKostenEur: mlData.lohngebEur,
                lohnnebenkostenProzent: mlData.lohnnebenPct,
                lohnnebenkostenEur: mlData.lohnnebenEur,
                kalkulationslohn: mlData.kalkulationslohn,
                zuschlagLohnProzent: zuschlaege.lohn.gesamt,
                zuschlagLohnEur: zuschlagLohnBetrag,
                verrechnungslohn
            },
            abschnitt2: {
                zuschlaege,
                wugAufteilung: {
                    gewinn: EfbUtils._parseNumberOrZero(mergedProfile.wug_gewinn_prozent, 5.0),
                    betriebswagnis: EfbUtils._parseNumberOrZero(mergedProfile.wug_betriebswagnis_prozent, 2.0),
                    leistungswagnis: EfbUtils._parseNumberOrZero(mergedProfile.wug_leistungswagnis_prozent, 1.8)
                }
            },
            abschnitt3: {
                gesamtstunden: Math.round(esData.totalHours * 100) / 100,
                summeLohn: esData.summeLohn,
                ektLohn: esData.ektLohn,
                ektStoffe: esData.ektStoffe,
                summeStoffe: esData.summeStoffe,
                ektGeraete: esData.ektGeraete,
                summeGeraete: esData.summeGeraete,
                ektSonstige: esData.ektSonstige,
                summeSonstige: esData.summeSonstige,
                ektNU: esData.ektNU,
                summeNU: esData.summeNU,
                angebotssummeNetto: esData.angebotssummeNetto
            }
        };
    }

    function getPositionCostBreakdown(pos, vl, zuschlaege) {
        const menge = parseFloat(pos.menge) || 0;
        const ep = parseFloat(pos.preis) > 0 ? parseFloat(pos.preis) : (parseFloat(pos.ek) || 0);
        const costType = (pos.kostenart || pos.cost_type || 'MATERIAL').toUpperCase();

        let lohnPct = 0;
        if (pos.lohnanteil_prozent !== undefined && pos.lohnanteil_prozent !== null && !isNaN(parseFloat(pos.lohnanteil_prozent))) {
            lohnPct = parseFloat(pos.lohnanteil_prozent);
        } else if (costType === 'LOHN') {
            lohnPct = 100;
        } else if (costType.includes('LOHN')) {
            lohnPct = 50;
        }

        let zeitansatz = 0;
        if (pos.zeitansatz_h !== undefined && pos.zeitansatz_h !== null && !isNaN(parseFloat(pos.zeitansatz_h))) {
            zeitansatz = parseFloat(pos.zeitansatz_h);
        } else if (lohnPct > 0 && vl > 0) {
            const lohnVal = ep * (lohnPct / 100);
            zeitansatz = parseFloat((lohnVal / vl).toFixed(4));
        }

        const lohnTeilkosten = Math.round((zeitansatz * vl) * 100) / 100;
        const remainder = Math.max(0, Math.round((ep - lohnTeilkosten) * 100) / 100);

        let stoffTeilkosten = 0;
        let geraeteTeilkosten = 0;
        let sonstigeTeilkosten = 0;
        let nuTeilkosten = 0;

        if (costType === 'GERÄT' || costType === 'GERAET' || costType === 'EQUIPMENT') {
            geraeteTeilkosten = remainder;
        } else if (costType === 'SUB' || costType === 'SUBCONTRACTOR' || costType === 'NU') {
            nuTeilkosten = remainder;
        } else if (costType === 'SONSTIGES' || costType === 'SONSTIGE') {
            sonstigeTeilkosten = remainder;
        } else {
            stoffTeilkosten = remainder;
        }

        const totalPosHours = menge * zeitansatz;
        const totalPosNetto = Math.round((menge * ep) * 100) / 100;

        return {
            menge,
            ep,
            costType,
            zeitansatz,
            lohnTeilkosten,
            stoffTeilkosten,
            geraeteTeilkosten,
            sonstigeTeilkosten,
            nuTeilkosten,
            totalPosHours,
            totalPosNetto
        };
    }

    return {
        calculateMittellohn,
        calculateZuschlaege,
        calculateEndsumme,
        calculateEFB221,
        getPositionCostBreakdown
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Efb221;
}
if (typeof window !== 'undefined') {
    window.Efb221 = Efb221;
}
