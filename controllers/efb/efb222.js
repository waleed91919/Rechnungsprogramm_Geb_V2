/**
 * controllers/efb/efb222.js
 * EFB 222 (Endsummenkalkulation) Logik und HTML Generator
 */

const EfbUtils = typeof require !== 'undefined' ? require('./efb-utils.js') : window.EfbUtils;

const Efb222 = (function () {
    
    function calculateEFB222(project = {}, positions = [], bgkDetails = {}, profile = {}) {
        const mergedProfile = EfbUtils.mergeProfile(profile);
        const mergedBgk = { ...EfbUtils.getDefaultBgkDetails(), ...bgkDetails };
        const parsePct = EfbUtils._parseNumberOrZero;

        // 1. Angaben über den Lohn (Mittellohn -> Kalkulationslohn)
        const ml = parsePct(mergedProfile.mittellohn_eur, 24.50);
        const lohngebPct = parsePct(mergedProfile.lohngebundene_kosten_prozent, 85.00);
        const lohnnebenPct = parsePct(mergedProfile.lohnnebenkosten_prozent, 12.50);

        const lohngebEur = Math.round((ml * (lohngebPct / 100)) * 100) / 100;
        const lohnnebenEur = Math.round((ml * (lohnnebenPct / 100)) * 100) / 100;
        const kalkulationslohn = Math.round((ml + lohngebEur + lohnnebenEur) * 100) / 100;

        // 2. Feste Umlagesätze auf Sachkosten
        const umlageStoffePct = parsePct(mergedProfile.umlage_stoff_prozent, 20.00);
        const umlageGeraetePct = parsePct(mergedProfile.umlage_geraet_prozent, 10.00);
        const umlageSonstigePct = parsePct(mergedProfile.umlage_sonst_prozent, 5.00);
        const umlageNuPct = parsePct(mergedProfile.umlage_nu_prozent, 10.00);

        // 3. Auftragsbezogene Baustellengemeinkosten (Abschnitt 3 VHB 222)
        const bgk311 = Math.round((parseFloat(mergedBgk.lohnkosten_baustelleneinrichtung) || 0) * 100) / 100;
        const bgk312 = Math.round((parseFloat(mergedBgk.gehaltskosten_baustelle) || 0) * 100) / 100;
        const bgk313 = Math.round((parseFloat(mergedBgk.geraete_ausruestung) || 0) * 100) / 100;
        const bgk314 = Math.round((parseFloat(mergedBgk.transporte_anfahrten) || 0) * 100) / 100;
        const bgk315 = Math.round((parseFloat(mergedBgk.sonderkosten) || 0) * 100) / 100;
        const summeBgk = Math.round((bgk311 + bgk312 + bgk313 + bgk314 + bgk315) * 100) / 100;

        // 4. Einzelkosten der Teilleistungen (EKT) aus Positionen ermitteln
        let totalHours = 0;
        let ektStoffe = 0;
        let ektGeraete = 0;
        let ektSonstige = 0;
        let ektNU = 0;

        positions.forEach(pos => {
            const menge = parseFloat(pos.menge) || 0;
            const ep = parseFloat(pos.preis) > 0 ? parseFloat(pos.preis) : (parseFloat(pos.ek) || 0);
            const costType = (pos.kostenart || pos.cost_type || 'MATERIAL').toUpperCase();

            // Zeitansatz für Lohn
            let posZeitansatz = 0;
            if (pos.zeitansatz_h !== undefined && pos.zeitansatz_h !== null && !isNaN(parseFloat(pos.zeitansatz_h))) {
                posZeitansatz = parseFloat(pos.zeitansatz_h);
            } else if (costType === 'LOHN') {
                posZeitansatz = kalkulationslohn > 0 ? (ep / kalkulationslohn) : 1.0;
            } else if (pos.lohnanteil_prozent && parseFloat(pos.lohnanteil_prozent) > 0) {
                const lohnVal = ep * (parseFloat(pos.lohnanteil_prozent) / 100);
                posZeitansatz = kalkulationslohn > 0 ? (lohnVal / kalkulationslohn) : 0;
            }
            totalHours += menge * posZeitansatz;

            // Sachkosten-EKT
            const posEk = parseFloat(pos.ek) > 0 ? parseFloat(pos.ek) : 0;
            if (pos.ekt_stoffe !== undefined) {
                ektStoffe += menge * parseFloat(pos.ekt_stoffe);
            } else if (costType === 'MATERIAL' || costType === 'STOFFE' || costType === 'STOFF') {
                const baseEk = posEk > 0 ? posEk : (ep / (1 + umlageStoffePct / 100));
                ektStoffe += menge * baseEk;
            }

            if (pos.ekt_geraete !== undefined) {
                ektGeraete += menge * parseFloat(pos.ekt_geraete);
            } else if (costType === 'GERÄT' || costType === 'GERAET' || costType === 'EQUIPMENT') {
                const baseEk = posEk > 0 ? posEk : (ep / (1 + umlageGeraetePct / 100));
                ektGeraete += menge * baseEk;
            }

            if (pos.ekt_sonstige !== undefined) {
                ektSonstige += menge * parseFloat(pos.ekt_sonstige);
            } else if (costType === 'SONSTIGES' || costType === 'SONSTIGE') {
                const baseEk = posEk > 0 ? posEk : (ep / (1 + umlageSonstigePct / 100));
                ektSonstige += menge * baseEk;
            }

            if (pos.ekt_nu !== undefined) {
                ektNU += menge * parseFloat(pos.ekt_nu);
            } else if (costType === 'SUB' || costType === 'SUBCONTRACTOR' || costType === 'NU') {
                const baseEk = posEk > 0 ? posEk : (ep / (1 + umlageNuPct / 100));
                ektNU += menge * baseEk;
            }
        });

        totalHours = Math.round(totalHours * 100) / 100;
        const ektLohn = Math.round((totalHours * kalkulationslohn) * 100) / 100;
        ektStoffe = Math.round(ektStoffe * 100) / 100;
        ektGeraete = Math.round(ektGeraete * 100) / 100;
        ektSonstige = Math.round(ektSonstige * 100) / 100;
        ektNU = Math.round(ektNU * 100) / 100;
        const summeEkt = Math.round((ektLohn + ektStoffe + ektGeraete + ektSonstige + ektNU) * 100) / 100;

        // 5. Gedeckte Gemeinkosten durch feste Sachkostenumlagen
        const deckungStoffe = Math.round((ektStoffe * (umlageStoffePct / 100)) * 100) / 100;
        const deckungGeraete = Math.round((ektGeraete * (umlageGeraetePct / 100)) * 100) / 100;
        const deckungSonstige = Math.round((ektSonstige * (umlageSonstigePct / 100)) * 100) / 100;
        const deckungNU = Math.round((ektNU * (umlageNuPct / 100)) * 100) / 100;
        const summeDeckungSachkosten = Math.round((deckungStoffe + deckungGeraete + deckungSonstige + deckungNU) * 100) / 100;

        // 6. Allgemeine Geschäftskosten (AGK) & Wagnis & Gewinn (W&G)
        // Herstellkosten vor AGK: HK = EKT + BGK
        const herstellkosten = Math.round((summeEkt + summeBgk) * 100) / 100;
        const rawAgk = mergedProfile.agk_endsumme_prozent ?? mergedProfile.agk_prozent ?? mergedProfile.zuschlag_lohn_agk;
        const agkPct = (rawAgk !== undefined && rawAgk !== null && !isNaN(parseFloat(rawAgk))) ? parseFloat(rawAgk) : 12.00;
        const agkBetrag = Math.round((herstellkosten * (agkPct / 100)) * 100) / 100;
        const selbstkosten = Math.round((herstellkosten + agkBetrag) * 100) / 100;

        const rawGewinn = mergedProfile.wug_gewinn_prozent;
        const wugGewinnPct = (rawGewinn !== undefined && rawGewinn !== null && !isNaN(parseFloat(rawGewinn))) ? parseFloat(rawGewinn) : 5.00;
        const rawBetriebswagnis = mergedProfile.wug_betriebswagnis_prozent;
        const wugBetriebswagnisPct = (rawBetriebswagnis !== undefined && rawBetriebswagnis !== null && !isNaN(parseFloat(rawBetriebswagnis))) ? parseFloat(rawBetriebswagnis) : 2.00;
        const rawLeistungswagnis = mergedProfile.wug_leistungswagnis_prozent;
        const wugLeistungswagnisPct = (rawLeistungswagnis !== undefined && rawLeistungswagnis !== null && !isNaN(parseFloat(rawLeistungswagnis))) ? parseFloat(rawLeistungswagnis) : 1.80;
        const wugGesamtPct = Math.round((wugGewinnPct + wugBetriebswagnisPct + wugLeistungswagnisPct) * 100) / 100;

        const wugBetrag = Math.round((selbstkosten * (wugGesamtPct / 100)) * 100) / 100;
        const gewinnBetrag = Math.round((selbstkosten * (wugGewinnPct / 100)) * 100) / 100;
        const betriebswagnisBetrag = Math.round((selbstkosten * (wugBetriebswagnisPct / 100)) * 100) / 100;
        const leistungswagnisBetrag = Math.round((selbstkosten * (wugLeistungswagnisPct / 100)) * 100) / 100;

        // 7. Gesamtbedarf an Gemeinkosten & W&G
        const gesamtGemeinkostenBedarf = Math.round((summeBgk + agkBetrag + wugBetrag) * 100) / 100;

        // 8. Rest-Gemeinkostenumlage auf den Lohn zur Bildung des Verrechnungslohns (VL)
        const restGemeinkostenLohn = Math.max(0, Math.round((gesamtGemeinkostenBedarf - summeDeckungSachkosten) * 100) / 100);
        const zuschlagLohnProzent = ektLohn > 0 ? Math.round((restGemeinkostenLohn / ektLohn) * 100 * 100) / 100 : 0;
        const zuschlagLohnEur = Math.round((kalkulationslohn * (zuschlagLohnProzent / 100)) * 100) / 100;
        const verrechnungslohn = Math.round((kalkulationslohn + zuschlagLohnEur) * 100) / 100;
        const summeLohn = Math.round((totalHours * verrechnungslohn) * 100) / 100;

        // 9. Endbeträge der Kostenarten
        const summeStoffe = Math.round((ektStoffe + deckungStoffe) * 100) / 100;
        const summeGeraete = Math.round((ektGeraete + deckungGeraete) * 100) / 100;
        const summeSonstige = Math.round((ektSonstige + deckungSonstige) * 100) / 100;
        const summeNU = Math.round((ektNU + deckungNU) * 100) / 100;

        const angebotssummeNetto = Math.round((summeLohn + summeStoffe + summeGeraete + summeSonstige + summeNU) * 100) / 100;

        return {
            projektName: project.name || 'Projekt',
            formblatt: 'EFB_222',
            verfahren: 'Endsummenkalkulation (VHB Bund)',
            abschnitt1: {
                mittellohn: ml,
                lohngebundeneKostenProzent: lohngebPct,
                lohngebundeneKostenEur: lohngebEur,
                lohnnebenkostenProzent: lohnnebenPct,
                lohnnebenkostenEur: lohnnebenEur,
                kalkulationslohn,
                zuschlagLohnProzent,
                zuschlagLohnEur,
                verrechnungslohn
            },
            abschnitt2: {
                agkProzent: agkPct,
                agkBetrag,
                wugAufteilung: {
                    gewinnProzent: wugGewinnPct,
                    gewinnBetrag,
                    betriebswagnisProzent: wugBetriebswagnisPct,
                    betriebswagnisBetrag,
                    leistungswagnisProzent: wugLeistungswagnisPct,
                    leistungswagnisBetrag,
                    gesamtProzent: wugGesamtPct,
                    gesamtBetrag: wugBetrag
                },
                festeSachkostenUmlagen: {
                    stoffe: umlageStoffePct,
                    geraete: umlageGeraetePct,
                    sonstige: umlageSonstigePct,
                    nu: umlageNuPct
                }
            },
            abschnitt3: {
                lohnkostenBaustelleneinrichtung: bgk311,
                gehaltskostenBaustelle: bgk312,
                geraeteAusruestung: bgk313,
                transporteAnfahrten: bgk314,
                sonderkosten: bgk315,
                summeBgk
            },
            abschnitt4: {
                gesamtstunden: totalHours,
                ektLohn,
                restGemeinkostenLohn,
                summeLohn,
                ektStoffe,
                deckungStoffe,
                summeStoffe,
                ektGeraete,
                deckungGeraete,
                summeGeraete,
                ektSonstige,
                deckungSonstige,
                summeSonstige,
                ektNU,
                deckungNU,
                summeNU,
                summeEkt,
                summeDeckungSachkosten,
                herstellkosten,
                selbstkosten,
                gesamtGemeinkostenBedarf,
                angebotssummeNetto
            }
        };
    }

    function generateEFB222Html(project = {}, efb222Result, companyInfo = {}) {
        const a1 = efb222Result.abschnitt1;
        const a2 = efb222Result.abschnitt2;
        const a3 = efb222Result.abschnitt3;
        const a4 = efb222Result.abschnitt4;
        const uml = a2.festeSachkostenUmlagen;
        const wug = a2.wugAufteilung;

        const formatCur = EfbUtils._formatCurrency;
        const formatPct = (v) => (parseFloat(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
        const formatStd = (v) => (parseFloat(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' h';

        return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>EFB-Preisblatt 222 - ${project.name || 'Projekt'}</title>
<style>
    @page { size: A4 portrait; margin: 12mm 15mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9.5pt; color: #1e293b; line-height: 1.35; margin: 0; padding: 0; background: #fff; }
    .header-box { border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
    .vhb-title { font-size: 14pt; font-weight: bold; color: #0f172a; margin: 0; }
    .vhb-subtitle { font-size: 9.5pt; color: #475569; margin: 2px 0 0 0; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; font-size: 8.5pt; background: #f8fafc; padding: 8px; border: 1px solid #e2e8f0; border-radius: 4px; }
    .section-box { border: 1px solid #cbd5e1; border-radius: 4px; margin-bottom: 10px; overflow: hidden; page-break-inside: avoid; }
    .section-header { background: #0f172a; color: #fff; padding: 5px 10px; font-weight: bold; font-size: 9pt; }
    .section-body { padding: 6px 10px; }
    table.calc-table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
    table.calc-table th, table.calc-table td { padding: 3.5px 6px; border-bottom: 1px solid #f1f5f9; }
    table.calc-table th { text-align: left; background: #f8fafc; font-weight: 600; color: #334155; border-bottom: 1px solid #cbd5e1; }
    .num { text-align: right; font-family: 'Consolas', monospace; }
    .total-row { font-weight: bold; background: #f1f5f9; border-top: 1.5px solid #0f172a; }
    .highlight-row { font-weight: bold; color: #0f172a; }
    .footer-sign { margin-top: 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 30px; page-break-inside: avoid; }
    .sign-box { border-top: 1px solid #0f172a; padding-top: 4px; font-size: 8.5pt; color: #475569; }
</style>
</head>
<body>
    <div class="header-box">
        <h1 class="vhb-title">EFB-Preisblatt 222 (VHB Bund)</h1>
        <p class="vhb-subtitle">Preisermittlung bei Endsummenkalkulation gemäß Vergabehandbuch Bund</p>
    </div>

    <div class="meta-grid">
        <div><strong>Bieter / Auftragnehmer:</strong> ${companyInfo.firmenname || companyInfo.name || 'W-Link ERP System'}</div>
        <div><strong>Baumaßnahme:</strong> ${project.name || 'Projekt'}</div>
        <div><strong>Datum:</strong> ${new Date().toLocaleDateString('de-DE')}</div>
        <div><strong>Vergabenummer / LV:</strong> LV-01 / Hauptangebot (Endsummenkalkulation)</div>
    </div>

    <!-- Abschnitt 1 -->
    <div class="section-box">
        <div class="section-header">1. Angaben über den Verrechnungslohn (VL)</div>
        <div class="section-body">
            <table class="calc-table">
                <tr><td>1.1 Mittellohn (ML)</td><td class="num">${formatCur(a1.mittellohn)} / h</td></tr>
                <tr><td>1.2 Lohngebundene Kosten (LGK)</td><td class="num">${formatPct(a1.lohngebundeneKostenProzent)} = ${formatCur(a1.lohngebundeneKostenEur)} / h</td></tr>
                <tr><td>1.3 Lohnnebenkosten (LNK)</td><td class="num">${formatPct(a1.lohnnebenkostenProzent)} = ${formatCur(a1.lohnnebenkostenEur)} / h</td></tr>
                <tr class="highlight-row" style="background:#f8fafc;"><td>1.4 Kalkulationslohn (KL = 1.1 + 1.2 + 1.3)</td><td class="num"><strong>${formatCur(a1.kalkulationslohn)} / h</strong></td></tr>
                <tr><td>1.5 Rest-Gemeinkostenzuschlag auf Lohn (aus Endsummen-Umlage)</td><td class="num">${formatPct(a1.zuschlagLohnProzent)} = ${formatCur(a1.zuschlagLohnEur)} / h</td></tr>
                <tr class="total-row"><td>1.6 Kalkulierter Verrechnungslohn (VL = 1.4 + 1.5)</td><td class="num" style="font-size:10pt; color:#0f172a;">${formatCur(a1.verrechnungslohn)} / h</td></tr>
            </table>
        </div>
    </div>

    <!-- Abschnitt 2 -->
    <div class="section-box">
        <div class="section-header">2. Allgemeine Geschäftskosten (AGK) und Wagnis & Gewinn (W&G)</div>
        <div class="section-body">
            <table class="calc-table">
                <tr><td>2.1 Allgemeine Geschäftskosten (AGK auf Herstellkosten)</td><td class="num">${formatPct(a2.agkProzent)} = ${formatCur(a2.agkBetrag)}</td></tr>
                <tr>
                    <td>2.2 Wagnis und Gewinn (W&G auf Selbstkosten)
                        <div style="font-size:7.5pt; color:#64748b; margin-top:2px;">
                            Davon: Gewinn ${formatPct(wug.gewinnProzent)} (${formatCur(wug.gewinnBetrag)}), 
                            betriebsbezogenes Wagnis ${formatPct(wug.betriebswagnisProzent)} (${formatCur(wug.betriebswagnisBetrag)}), 
                            leistungsbezogenes Wagnis ${formatPct(wug.leistungswagnisProzent)} (${formatCur(wug.leistungswagnisBetrag)})
                        </div>
                    </td>
                    <td class="num" style="vertical-align:top;">${formatPct(wug.gesamtProzent)} = ${formatCur(wug.gesamtBetrag)}</td>
                </tr>
                <tr class="total-row"><td>Feste Umlagen auf Sachkosten:</td><td class="num">Stoffe ${formatPct(uml.stoffe)} | Geräte ${formatPct(uml.geraete)} | Sonst. ${formatPct(uml.sonstige)} | NU ${formatPct(uml.nu)}</td></tr>
            </table>
        </div>
    </div>

    <!-- Abschnitt 3 -->
    <div class="section-box">
        <div class="section-header">3. Baustellengemeinkosten (BGK) des Auftrags</div>
        <div class="section-body">
            <table class="calc-table">
                <tr><td>3.1.1 Lohnkosten der Baustelleneinrichtung (Hilfslöhne BE, Bewachung, Winterbau)</td><td class="num">${formatCur(a3.lohnkostenBaustelleneinrichtung)}</td></tr>
                <tr><td>3.1.2 Gehaltskosten der Baustelle (Bauleitung, Vermessung, Poliere, Abrechnung)</td><td class="num">${formatCur(a3.gehaltskostenBaustelle)}</td></tr>
                <tr><td>3.1.3 Geräte und Ausrüstungen der Baustelleneinrichtung (Vorhaltung Krane, Container, Energie/Wasser)</td><td class="num">${formatCur(a3.geraeteAusruestung)}</td></tr>
                <tr><td>3.1.4 Transport- und Anfahrtskosten (An-/Abtransport von Geräten, Sondernutzung)</td><td class="num">${formatCur(a3.transporteAnfahrten)}</td></tr>
                <tr><td>3.1.5 Sonderkosten der Baustelle (Versicherungen, Prüfstatik, Genehmigungen)</td><td class="num">${formatCur(a3.sonderkosten)}</td></tr>
                <tr class="total-row"><td>3.1 Summe der auftragsbezogenen BGK (3.1.1 bis 3.1.5)</td><td class="num" style="font-size:10pt; color:#0f172a;">${formatCur(a3.summeBgk)}</td></tr>
            </table>
        </div>
    </div>

    <!-- Abschnitt 4 -->
    <div class="section-box">
        <div class="section-header">4. Umlageverfahren & Ermittlung der Netto-Angebotssumme</div>
        <div class="section-body">
            <table class="calc-table">
                <thead>
                    <tr>
                        <th>Kostenart</th>
                        <th class="num">Einzelkosten (EKT)</th>
                        <th class="num">Umlage %</th>
                        <th class="num">Umlagebetrag</th>
                        <th class="num">Endsummenbetrag</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>4.1 Eigene Lohnkosten (${formatStd(a4.gesamtstunden)})</td>
                        <td class="num">${formatCur(a4.ektLohn)}</td>
                        <td class="num">${formatPct(a1.zuschlagLohnProzent)}</td>
                        <td class="num">${formatCur(a4.restGemeinkostenLohn)}</td>
                        <td class="num" style="font-weight:600;">${formatCur(a4.summeLohn)}</td>
                    </tr>
                    <tr>
                        <td>4.2 Stoffkosten</td>
                        <td class="num">${formatCur(a4.ektStoffe)}</td>
                        <td class="num">${formatPct(uml.stoffe)}</td>
                        <td class="num">${formatCur(a4.deckungStoffe)}</td>
                        <td class="num" style="font-weight:600;">${formatCur(a4.summeStoffe)}</td>
                    </tr>
                    <tr>
                        <td>4.3 Gerätekosten</td>
                        <td class="num">${formatCur(a4.ektGeraete)}</td>
                        <td class="num">${formatPct(uml.geraete)}</td>
                        <td class="num">${formatCur(a4.deckungGeraete)}</td>
                        <td class="num" style="font-weight:600;">${formatCur(a4.summeGeraete)}</td>
                    </tr>
                    <tr>
                        <td>4.4 Sonstige Kosten</td>
                        <td class="num">${formatCur(a4.ektSonstige)}</td>
                        <td class="num">${formatPct(uml.sonstige)}</td>
                        <td class="num">${formatCur(a4.deckungSonstige)}</td>
                        <td class="num" style="font-weight:600;">${formatCur(a4.summeSonstige)}</td>
                    </tr>
                    <tr>
                        <td>4.5 Nachunternehmerleistungen (NU)</td>
                        <td class="num">${formatCur(a4.ektNU)}</td>
                        <td class="num">${formatPct(uml.nu)}</td>
                        <td class="num">${formatCur(a4.deckungNU)}</td>
                        <td class="num" style="font-weight:600;">${formatCur(a4.summeNU)}</td>
                    </tr>
                    <tr class="total-row" style="font-size:10.5pt; color:#0f172a;">
                        <td>4.6 Netto-Angebotssumme (Summe 4.1 bis 4.5)</td>
                        <td class="num">${formatCur(a4.summeEkt)}</td>
                        <td></td>
                        <td class="num">${formatCur(a4.gesamtGemeinkostenBedarf)}</td>
                        <td class="num"><strong>${formatCur(a4.angebotssummeNetto)}</strong></td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>

    <div class="footer-sign">
        <div class="sign-box">Ort, Datum</div>
        <div class="sign-box">Rechtsverbindliche Unterschrift des Bieters / Stempel</div>
    </div>
</body>
</html>`;
    }

    return {
        calculateEFB222,
        generateEFB222Html
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Efb222;
}
if (typeof window !== 'undefined') {
    window.Efb222 = Efb222;
}
