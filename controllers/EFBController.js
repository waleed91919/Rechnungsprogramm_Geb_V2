/**
 * controllers/EFBController.js - EFB-Preisblätter 221 & 223 Berechnungs- und Verprobungs-Engine
 * Konform nach VHB 2024/2026 (BMWSB)
 * Isomorph aufgebaut für Node.js und Browser-Renderer.
 */

class EFBController {
    /**
     * Standard-Zuschlagsprofil nach VHB 2024/2026 Vorgaben.
     */
    static getDefaultProfile() {
        return {
            name: 'Standard-Zuschlagsprofil (VHB 221)',
            mittellohn_eur: 24.50,
            lohngebundene_kosten_prozent: 85.00,
            lohnnebenkosten_prozent: 12.50,
            kalkulationslohn_eur: 48.39,
            zuschlag_lohn_bgk: 18.00,
            zuschlag_lohn_agk: 22.00,
            zuschlag_lohn_wug: 8.80,
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
            wug_leistungswagnis_prozent: 1.80,
            umlage_stoff_prozent: 20.00,
            umlage_geraet_prozent: 10.00,
            umlage_sonst_prozent: 5.00,
            umlage_nu_prozent: 10.00,
            agk_endsumme_prozent: 12.00
        };
    }

    /**
     * Standard-Gliederung der Baustellengemeinkosten (BGK) für EFB 222 (Abschnitt 3).
     */
    static getDefaultBgkDetails() {
        return {
            lohnkosten_baustelleneinrichtung: 1200.00, // 3.1.1 Löhne BE
            gehaltskosten_baustelle: 2500.00,          // 3.1.2 Gehälter Bauleitung/Polier
            geraete_ausruestung: 1800.00,              // 3.1.3 Geräte und Ausrüstungen
            transporte_anfahrten: 650.00,              // 3.1.4 Transporte und Anfahrten
            sonderkosten: 450.00                       // 3.1.5 Sonderkosten der Baustelle
        };
    }

    /**
     * Berechnet die vollständige EFB 221 Struktur für ein Projekt.
     * @param {Object} project - Projekt-Datensatz
     * @param {Array} positions - Liste der Positionen mit Kostenarten & Zeitansätzen
     * @param {Object} profile - EFB-Zuschlagsprofil
     * @returns {Object} EFB 221 Berechnungsergebnis
     */
    static calculateEFB221(project = {}, positions = [], profile = {}) {
        const mergedProfile = { ...EFBController.getDefaultProfile(), ...profile };

        // 1. Angaben über den Verrechnungslohn (Abschnitt 1)
        const ml = parseFloat(mergedProfile.mittellohn_eur) || 24.50;
        const lohngebPct = parseFloat(mergedProfile.lohngebundene_kosten_prozent) || 85.00;
        const lohnnebenPct = parseFloat(mergedProfile.lohnnebenkosten_prozent) || 12.50;

        const lohngebEur = Math.round((ml * (lohngebPct / 100)) * 100) / 100;
        const lohnnebenEur = Math.round((ml * (lohnnebenPct / 100)) * 100) / 100;
        const kalkulationslohn = Math.round((ml + lohngebEur + lohnnebenEur) * 100) / 100;

        // 2. Zuschläge auf Einzelkosten der Teilleistungen (Abschnitt 2)
        const zuschlaege = {
            lohn: {
                bgk: parseFloat(mergedProfile.zuschlag_lohn_bgk) || 18.0,
                agk: parseFloat(mergedProfile.zuschlag_lohn_agk) || 22.0,
                wug: parseFloat(mergedProfile.zuschlag_lohn_wug) || 8.8,
                gesamt: 0
            },
            stoffe: {
                bgk: parseFloat(mergedProfile.zuschlag_stoff_bgk) || 12.0,
                agk: parseFloat(mergedProfile.zuschlag_stoff_agk) || 14.0,
                wug: parseFloat(mergedProfile.zuschlag_stoff_wug) || 6.0,
                gesamt: 0
            },
            geraete: {
                bgk: parseFloat(mergedProfile.zuschlag_geraet_bgk) || 15.0,
                agk: parseFloat(mergedProfile.zuschlag_geraet_agk) || 16.0,
                wug: parseFloat(mergedProfile.zuschlag_geraet_wug) || 6.0,
                gesamt: 0
            },
            sonstige: {
                bgk: parseFloat(mergedProfile.zuschlag_sonst_bgk) || 10.0,
                agk: parseFloat(mergedProfile.zuschlag_sonst_agk) || 12.0,
                wug: parseFloat(mergedProfile.zuschlag_sonst_wug) || 5.0,
                gesamt: 0
            },
            nu: {
                bgk: parseFloat(mergedProfile.zuschlag_nu_bgk) || 8.0,
                agk: parseFloat(mergedProfile.zuschlag_nu_agk) || 10.0,
                wug: parseFloat(mergedProfile.zuschlag_nu_wug) || 4.0,
                gesamt: 0
            }
        };

        // Gesamtzuschläge = BGK + AGK + W&G
        for (const k of Object.keys(zuschlaege)) {
            zuschlaege[k].gesamt = Math.round((zuschlaege[k].bgk + zuschlaege[k].agk + zuschlaege[k].wug) * 100) / 100;
        }

        // Verrechnungslohn (VL)
        const zuschlagLohnBetrag = Math.round((kalkulationslohn * (zuschlaege.lohn.gesamt / 100)) * 100) / 100;
        const verrechnungslohn = Math.round((kalkulationslohn + zuschlagLohnBetrag) * 100) / 100;

        // 3. Ermittlung der Einzelkosten (EKT) und Gesamtstunden aus den Positionen
        let totalHours = 0;
        let summeLohn = 0;
        let summeStoffe = 0;
        let summeGeraete = 0;
        let summeSonstige = 0;
        let summeNU = 0;

        positions.forEach(pos => {
            const bd = EFBController.getPositionCostBreakdown(pos, verrechnungslohn, zuschlaege);
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
            projektName: project.name || 'Projekt',
            abschnitt1: {
                mittellohn: ml,
                lohngebundeneKostenProzent: lohngebPct,
                lohngebundeneKostenEur: lohngebEur,
                lohnnebenkostenProzent: lohnnebenPct,
                lohnnebenkostenEur: lohnnebenEur,
                kalkulationslohn,
                zuschlagLohnProzent: zuschlaege.lohn.gesamt,
                zuschlagLohnEur: zuschlagLohnBetrag,
                verrechnungslohn
            },
            abschnitt2: {
                zuschlaege,
                wugAufteilung: {
                    gewinn: parseFloat(mergedProfile.wug_gewinn_prozent) || 5.0,
                    betriebswagnis: parseFloat(mergedProfile.wug_betriebswagnis_prozent) || 2.0,
                    leistungswagnis: parseFloat(mergedProfile.wug_leistungswagnis_prozent) || 1.8
                }
            },
            abschnitt3: {
                gesamtstunden: Math.round(totalHours * 100) / 100,
                summeLohn,
                ektLohn,
                ektStoffe,
                summeStoffe,
                ektGeraete,
                summeGeraete,
                ektSonstige,
                summeSonstige,
                ektNU,
                summeNU,
                angebotssummeNetto
            }
        };
    }

    /**
     * Ermittelt die detaillierte Kostenaufteilung einer Einzelposition.
     */
    static getPositionCostBreakdown(pos, vl, zuschlaege) {
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

    /**
     * Berechnet die vollständige EFB 223 Aufgliederung aller LV-Positionen.
     * @param {Array} positions - Liste der Positionen
     * @param {Object} efb221Result - Ergebnis aus calculateEFB221
     * @returns {Object} EFB 223 Aufgliederungsergebnis mit Verprobung
     */
    static calculateEFB223(positions = [], efb221Result) {
        if (!efb221Result || !efb221Result.abschnitt1 || !efb221Result.abschnitt2) {
            throw new Error('Ungültiges EFB 221 Ergebnis für EFB 223 Berechnung übergeben.');
        }

        const vl = efb221Result.abschnitt1.verrechnungslohn;
        const zuschlaege = efb221Result.abschnitt2.zuschlaege;

        let summeGesamtbetrag = 0;
        let summeLohnstunden = 0;

        const aufgliederung = positions.map((pos, idx) => {
            const bd = EFBController.getPositionCostBreakdown(pos, vl, zuschlaege);
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
        const angebotssumme221 = efb221Result.abschnitt3.angebotssummeNetto;
        const verprobungsDifferenz = Math.round((roundGesamt - angebotssumme221) * 100) / 100;

        return {
            aufgliederung,
            summeGesamtbetrag: roundGesamt,
            summeLohnstunden: Math.round(summeLohnstunden * 100) / 100,
            angebotssumme221,
            verprobungsDifferenz,
            isVerprobt: Math.abs(verprobungsDifferenz) < 0.05
        };
    }

    /**
     * Erzeugt druckfertiges HTML für Formblatt EFB 221 im DIN A4 Hochformat.
     */
    static generateEFB221Html(project = {}, efb221Result, companyInfo = {}) {
        const a1 = efb221Result.abschnitt1;
        const a2 = efb221Result.abschnitt2;
        const a3 = efb221Result.abschnitt3;
        const z = a2.zuschlaege;

        const formatCur = (v) => (parseFloat(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
        const formatPct = (v) => (parseFloat(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
        const formatStd = (v) => (parseFloat(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' h';

        return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>EFB-Preisblatt 221 - ${project.name || 'Projekt'}</title>
<style>
    @page { size: A4 portrait; margin: 12mm 15mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9.5pt; color: #1e293b; line-height: 1.35; margin: 0; padding: 0; background: #fff; }
    .header-box { border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 14px; }
    .vhb-title { font-size: 14pt; font-weight: bold; color: #0f172a; margin: 0; }
    .vhb-subtitle { font-size: 10pt; color: #475569; margin: 2px 0 0 0; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; font-size: 9pt; background: #f8fafc; padding: 8px; border: 1px solid #e2e8f0; border-radius: 4px; }
    .section-box { border: 1px solid #cbd5e1; border-radius: 4px; margin-bottom: 14px; overflow: hidden; page-break-inside: avoid; }
    .section-header { background: #0f172a; color: #fff; padding: 6px 10px; font-weight: bold; font-size: 9.5pt; }
    .section-body { padding: 8px 10px; }
    table.calc-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    table.calc-table th, table.calc-table td { padding: 4px 6px; border-bottom: 1px solid #f1f5f9; }
    table.calc-table th { text-align: left; background: #f8fafc; font-weight: 600; color: #334155; border-bottom: 1px solid #cbd5e1; }
    .num { text-align: right; font-family: 'Consolas', monospace; }
    .total-row { font-weight: bold; background: #f1f5f9; border-top: 1.5px solid #0f172a; }
    .highlight-row { font-weight: bold; color: #0f172a; }
    .footer-sign { margin-top: 25px; display: grid; grid-template-columns: 1fr 1fr; gap: 30px; page-break-inside: avoid; }
    .sign-box { border-top: 1px solid #0f172a; padding-top: 4px; font-size: 8.5pt; color: #475569; }
</style>
</head>
<body>
    <div class="header-box">
        <h1 class="vhb-title">EFB-Preisblatt 221 (VHB Bund)</h1>
        <p class="vhb-subtitle">Preisermittlung bei Zuschlagskalkulation gemäß Vergabehandbuch Bund</p>
    </div>

    <div class="meta-grid">
        <div><strong>Bieter / Auftragnehmer:</strong> ${companyInfo.firmenname || companyInfo.name || 'W-Link ERP System'}</div>
        <div><strong>Baumaßnahme:</strong> ${project.name || 'Projekt'}</div>
        <div><strong>Datum:</strong> ${new Date().toLocaleDateString('de-DE')}</div>
        <div><strong>Vergabenummer / LV:</strong> LV-01 / Hauptangebot</div>
    </div>

    <!-- Abschnitt 1 -->
    <div class="section-box">
        <div class="section-header">1. Angaben über den Verrechnungslohn</div>
        <div class="section-body">
            <table class="calc-table">
                <tr><td>1.1 Mittellohn (ML)</td><td class="num">${formatCur(a1.mittellohn)} / h</td></tr>
                <tr><td>1.2 Lohngebundene Kosten (Sozialabgaben, Urlaubskasse, BG)</td><td class="num">${formatPct(a1.lohngebundeneKostenProzent)} = ${formatCur(a1.lohngebundeneKostenEur)} / h</td></tr>
                <tr><td>1.3 Lohnnebenkosten (Fahrgelder, Wegezeit, Auslösungen)</td><td class="num">${formatPct(a1.lohnnebenkostenProzent)} = ${formatCur(a1.lohnnebenkostenEur)} / h</td></tr>
                <tr class="highlight-row" style="background:#f8fafc;"><td>1.4 Kalkulationslohn (KL = 1.1 + 1.2 + 1.3)</td><td class="num"><strong>${formatCur(a1.kalkulationslohn)} / h</strong></td></tr>
                <tr><td>1.5 Zuschlag auf Kalkulationslohn (Gesamtzuschlag Lohn Sp. 1)</td><td class="num">${formatPct(a1.zuschlagLohnProzent)} = ${formatCur(a1.zuschlagLohnEur)} / h</td></tr>
                <tr class="total-row"><td>1.6 Verrechnungslohn (VL = 1.4 + 1.5)</td><td class="num" style="font-size:10.5pt; color:#0f172a;">${formatCur(a1.verrechnungslohn)} / h</td></tr>
            </table>
        </div>
    </div>

    <!-- Abschnitt 2 -->
    <div class="section-box">
        <div class="section-header">2. Zuschläge auf die Einzelkosten der Teilleistungen (EKT) in %</div>
        <div class="section-body">
            <table class="calc-table">
                <thead>
                    <tr>
                        <th>Zuschlagsart</th>
                        <th class="num">Lohn (Sp. 1)</th>
                        <th class="num">Stoffe (Sp. 2)</th>
                        <th class="num">Geräte (Sp. 3)</th>
                        <th class="num">Sonstige (Sp. 4)</th>
                        <th class="num">NU-Leistung (Sp. 5)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>2.1 Baustellengemeinkosten (BGK)</td>
                        <td class="num">${formatPct(z.lohn.bgk)}</td>
                        <td class="num">${formatPct(z.stoffe.bgk)}</td>
                        <td class="num">${formatPct(z.geraete.bgk)}</td>
                        <td class="num">${formatPct(z.sonstige.bgk)}</td>
                        <td class="num">${formatPct(z.nu.bgk)}</td>
                    </tr>
                    <tr>
                        <td>2.2 Allg. Geschäftskosten (AGK)</td>
                        <td class="num">${formatPct(z.lohn.agk)}</td>
                        <td class="num">${formatPct(z.stoffe.agk)}</td>
                        <td class="num">${formatPct(z.geraete.agk)}</td>
                        <td class="num">${formatPct(z.sonstige.agk)}</td>
                        <td class="num">${formatPct(z.nu.agk)}</td>
                    </tr>
                    <tr>
                        <td>2.3 Wagnis und Gewinn (W&G)</td>
                        <td class="num">${formatPct(z.lohn.wug)}</td>
                        <td class="num">${formatPct(z.stoffe.wug)}</td>
                        <td class="num">${formatPct(z.geraete.wug)}</td>
                        <td class="num">${formatPct(z.sonstige.wug)}</td>
                        <td class="num">${formatPct(z.nu.wug)}</td>
                    </tr>
                    <tr class="total-row">
                        <td>2.4 Gesamtzuschläge (2.1 + 2.2 + 2.3)</td>
                        <td class="num">${formatPct(z.lohn.gesamt)}</td>
                        <td class="num">${formatPct(z.stoffe.gesamt)}</td>
                        <td class="num">${formatPct(z.geraete.gesamt)}</td>
                        <td class="num">${formatPct(z.sonstige.gesamt)}</td>
                        <td class="num">${formatPct(z.nu.gesamt)}</td>
                    </tr>
                </tbody>
            </table>
            <div style="margin-top:6px; font-size:8pt; color:#64748b;">
                Aufteilung W&G: Gewinn ${formatPct(a2.wugAufteilung.gewinn)}, betriebsbezogenes Wagnis ${formatPct(a2.wugAufteilung.betriebswagnis)}, leistungsbezogenes Wagnis ${formatPct(a2.wugAufteilung.leistungswagnis)}
            </div>
        </div>
    </div>

    <!-- Abschnitt 3 -->
    <div class="section-box">
        <div class="section-header">3. Ermittlung der Angebotssumme</div>
        <div class="section-body">
            <table class="calc-table">
                <tr><td>3.1 Eigene Lohnkosten (${formatStd(a3.gesamtstunden)} × ${formatCur(a1.verrechnungslohn)})</td><td class="num">${formatCur(a3.summeLohn)}</td></tr>
                <tr><td>3.2 Stoffkosten (${formatCur(a3.ektStoffe)} EKT + ${formatPct(z.stoffe.gesamt)} Zuschlag)</td><td class="num">${formatCur(a3.summeStoffe)}</td></tr>
                <tr><td>3.3 Gerätekosten (${formatCur(a3.ektGeraete)} EKT + ${formatPct(z.geraete.gesamt)} Zuschlag)</td><td class="num">${formatCur(a3.summeGeraete)}</td></tr>
                <tr><td>3.4 Sonstige Kosten (${formatCur(a3.ektSonstige)} EKT + ${formatPct(z.sonstige.gesamt)} Zuschlag)</td><td class="num">${formatCur(a3.summeSonstige)}</td></tr>
                <tr><td>3.5 Nachunternehmerleistungen (${formatCur(a3.ektNU)} EKT + ${formatPct(z.nu.gesamt)} Zuschlag)</td><td class="num">${formatCur(a3.summeNU)}</td></tr>
                <tr class="total-row" style="font-size:10.5pt; color:#0f172a;">
                    <td>3.6 Netto-Angebotssumme (Summe 3.1 bis 3.5)</td>
                    <td class="num"><strong>${formatCur(a3.angebotssummeNetto)}</strong></td>
                </tr>
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

    /**
     * Erzeugt druckfertiges HTML für Formblatt EFB 223 im DIN A4 Querformat.
     */
    static generateEFB223Html(project = {}, efb223Result, efb221Result, companyInfo = {}) {
        const rows = efb223Result.aufgliederung || [];
        const formatCur = (v) => (parseFloat(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
        const formatNum = (v, dec = 2) => (parseFloat(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec });

        let tableRowsHtml = '';
        rows.forEach(r => {
            tableRowsHtml += `
            <tr>
                <td style="font-family:monospace; font-weight:600; color:#0f172a;">${r.oz}</td>
                <td>${r.kurztext}</td>
                <td class="num">${formatNum(r.menge, 3)}</td>
                <td style="text-align:center;">${r.einheit}</td>
                <td class="num">${formatNum(r.zeitansatz, 2)}</td>
                <td class="num">${formatNum(r.teilkostenLohn, 2)}</td>
                <td class="num">${formatNum(r.teilkostenStoffe, 2)}</td>
                <td class="num">${formatNum(r.teilkostenGeraete, 2)}</td>
                <td class="num">${formatNum(r.teilkostenSonstige, 2)}</td>
                <td class="num" style="font-weight:600;">${formatNum(r.einheitspreis, 2)}</td>
                <td class="num" style="font-weight:bold; color:#0f172a;">${formatCur(r.gesamtbetrag)}</td>
            </tr>`;
        });

        return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>EFB-Preisblatt 223 - ${project.name || 'Projekt'}</title>
<style>
    @page { size: A4 landscape; margin: 10mm 12mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 8.5pt; color: #1e293b; line-height: 1.25; margin: 0; padding: 0; background: #fff; }
    .header-box { border-bottom: 2px solid #0f172a; padding-bottom: 6px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: flex-end; }
    .vhb-title { font-size: 13pt; font-weight: bold; color: #0f172a; margin: 0; }
    .vhb-subtitle { font-size: 9pt; color: #475569; margin: 2px 0 0 0; }
    .meta-inline { font-size: 8pt; color: #334155; }
    table.efb223-table { width: 100%; border-collapse: collapse; font-size: 8pt; page-break-inside: auto; }
    table.efb223-table thead { display: table-header-group; }
    table.efb223-table tr { page-break-inside: avoid; }
    table.efb223-table th, table.efb223-table td { padding: 4px 5px; border: 1px solid #cbd5e1; }
    table.efb223-table th { background: #0f172a; color: #fff; font-weight: 600; text-align: left; font-size: 7.8pt; }
    .num { text-align: right; font-family: 'Consolas', monospace; }
    .total-footer { font-weight: bold; background: #f1f5f9; border-top: 2px solid #0f172a; font-size: 8.5pt; }
    .verprob-box { margin-top: 10px; padding: 6px 10px; border-radius: 4px; font-size: 8pt; display: flex; justify-content: space-between; background: ${efb223Result.isVerprobt ? '#ecfdf5; border: 1px solid #10b981; color: #065f46;' : '#fef2f2; border: 1px solid #ef4444; color: #991b1b;'} }
</style>
</head>
<body>
    <div class="header-box">
        <div>
            <h1 class="vhb-title">EFB-Preisblatt 223 (VHB Bund)</h1>
            <p class="vhb-subtitle">Aufgliederung der Einheitspreise nach Teilleistungen</p>
        </div>
        <div class="meta-inline">
            <strong>Projekt:</strong> ${project.name || 'Projekt'} | <strong>VL:</strong> ${formatCur(efb221Result ? efb221Result.abschnitt1.verrechnungslohn : 0)} / h | <strong>Datum:</strong> ${new Date().toLocaleDateString('de-DE')}
        </div>
    </div>

    <table class="efb223-table">
        <thead>
            <tr>
                <th style="width:70px;">OZ</th>
                <th>Kurzbezeichnung der Teilleistung</th>
                <th class="num" style="width:50px;">Menge</th>
                <th style="width:30px; text-align:center;">ME</th>
                <th class="num" style="width:45px;">Zeit h/ME</th>
                <th class="num" style="width:55px;">Lohn €/ME</th>
                <th class="num" style="width:55px;">Stoffe €/ME</th>
                <th class="num" style="width:55px;">Geräte €/ME</th>
                <th class="num" style="width:55px;">Sonst. €/ME</th>
                <th class="num" style="width:60px;">EP €/ME</th>
                <th class="num" style="width:75px;">Gesamtbetrag €</th>
            </tr>
        </thead>
        <tbody>
            ${tableRowsHtml}
        </tbody>
        <tfoot>
            <tr class="total-footer">
                <td colspan="4" style="text-align:right;">Gesamtsummen:</td>
                <td class="num">${formatNum(efb223Result.summeLohnstunden, 2)} h</td>
                <td colspan="5"></td>
                <td class="num" style="color:#0f172a;">${formatCur(efb223Result.summeGesamtbetrag)}</td>
            </tr>
        </tfoot>
    </table>

    <div class="verprob-box">
        <div><strong>Verprobung EFB 221 vs. EFB 223:</strong> Angebotssumme EFB 221: ${formatCur(efb223Result.angebotssumme221)} | Summe EFB 223: ${formatCur(efb223Result.summeGesamtbetrag)}</div>
        <div><strong>Status:</strong> ${efb223Result.isVerprobt ? '✓ Exakt verprobt (Δ 0,00 €)' : `⚠ Differenz: ${formatCur(efb223Result.verprobungsDifferenz)}`}</div>
    </div>
</body>
</html>`;
    }

    /**
     * Berechnet die vollständige EFB 222 Struktur (Endsummenkalkulation) nach VHB-Bund.
     * @param {Object} project - Projekt-Datensatz
     * @param {Array} positions - Liste der Positionen
     * @param {Object} bgkDetails - Detaillierte auftragsbezogene BGK (Abschnitt 3.1.1 bis 3.1.5)
     * @param {Object} profile - Zuschlagsprofil mit festen Sachkostenumlagen und W&G
     * @returns {Object} EFB 222 Berechnungsergebnis
     */
    static calculateEFB222(project = {}, positions = [], bgkDetails = {}, profile = {}) {
        const mergedProfile = { ...EFBController.getDefaultProfile(), ...profile };
        const mergedBgk = { ...EFBController.getDefaultBgkDetails(), ...bgkDetails };

        // 1. Angaben über den Lohn (Mittellohn -> Kalkulationslohn)
        const ml = parseFloat(mergedProfile.mittellohn_eur) || 24.50;
        const lohngebPct = parseFloat(mergedProfile.lohngebundene_kosten_prozent) || 85.00;
        const lohnnebenPct = parseFloat(mergedProfile.lohnnebenkosten_prozent) || 12.50;

        const lohngebEur = Math.round((ml * (lohngebPct / 100)) * 100) / 100;
        const lohnnebenEur = Math.round((ml * (lohnnebenPct / 100)) * 100) / 100;
        const kalkulationslohn = Math.round((ml + lohngebEur + lohnnebenEur) * 100) / 100;

        // 2. Feste Umlagesätze auf Sachkosten
        const umlageStoffePct = parseFloat(mergedProfile.umlage_stoff_prozent) || 20.00;
        const umlageGeraetePct = parseFloat(mergedProfile.umlage_geraet_prozent) || 10.00;
        const umlageSonstigePct = parseFloat(mergedProfile.umlage_sonst_prozent) || 5.00;
        const umlageNuPct = parseFloat(mergedProfile.umlage_nu_prozent) || 10.00;

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
        const agkPct = parseFloat(mergedProfile.agk_endsumme_prozent || mergedProfile.zuschlag_lohn_agk) || 12.00;
        const agkBetrag = Math.round((herstellkosten * (agkPct / 100)) * 100) / 100;
        const selbstkosten = Math.round((herstellkosten + agkBetrag) * 100) / 100;

        const wugGewinnPct = parseFloat(mergedProfile.wug_gewinn_prozent) || 5.00;
        const wugBetriebswagnisPct = parseFloat(mergedProfile.wug_betriebswagnis_prozent) || 2.00;
        const wugLeistungswagnisPct = parseFloat(mergedProfile.wug_leistungswagnis_prozent) || 1.80;
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

    /**
     * Erzeugt druckfertiges HTML für Formblatt EFB 222 (Endsummenkalkulation) im DIN A4 Hochformat.
     */
    static generateEFB222Html(project = {}, efb222Result, companyInfo = {}) {
        const a1 = efb222Result.abschnitt1;
        const a2 = efb222Result.abschnitt2;
        const a3 = efb222Result.abschnitt3;
        const a4 = efb222Result.abschnitt4;
        const uml = a2.festeSachkostenUmlagen;
        const wug = a2.wugAufteilung;

        const formatCur = (v) => (parseFloat(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
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
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = EFBController;
}
if (typeof window !== 'undefined') {
    window.EFBController = EFBController;
}
