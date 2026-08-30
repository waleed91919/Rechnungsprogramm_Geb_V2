/**
 * controllers/SokaBauController.js - SOKA-BAU / ZVK Meldedaten-Engine & BRTV/MiLoG Compliance-Prüfung
 * Berechnet ULAK, ZVK, BBV, Winterbauumlage und Urlaubsansprüche nach Bundesrahmentarifvertrag Bau (BRTV).
 * Erzeugt offizielle DTA-Bau Festbreitendateien und SOKA-BAU XML V3.0 Meldedokumente.
 */

class SokaBauController {
    /**
     * Tarifliche Beitragssätze je Tarifgebiet mit Zeitraumgültigkeit (Stand 01.07.2026 / 2027).
     * Lädt dynamisch aus der SQLite-Tabelle soka_beitragssaetze falls DB übergeben wird.
     * @param {string} tarifgebiet - 'WEST', 'OST', 'BERLIN_WEST', 'BERLIN_OST'
     * @param {Date|string} stichtag - Stichtag der Abrechnung
     * @param {Object} db - better-sqlite3 Instanz (optional)
     */
    static getBeitragssaetze(tarifgebiet = 'WEST', stichtag = new Date(), db = null) {
        const area = (tarifgebiet || 'WEST').toUpperCase();
        const dateStr = typeof stichtag === 'string' ? stichtag.slice(0, 10) : new Date(stichtag).toISOString().slice(0, 10);

        if (db) {
            try {
                const row = db.prepare(`
                    SELECT * FROM soka_beitragssaetze
                    WHERE tarifgebiet = ? AND gueltig_ab <= ? AND (gueltig_bis IS NULL OR gueltig_bis >= ?)
                    ORDER BY gueltig_ab DESC LIMIT 1
                `).get(area, dateStr, dateStr);

                if (row) {
                    return {
                        ulak: parseFloat(row.ulak_prozent) || 14.70,
                        zvk: parseFloat(row.zvk_prozent) || 3.20,
                        bbv: parseFloat(row.bbv_prozent) || 1.45,
                        winterbauAg: parseFloat(row.winterbau_ag_prozent) || 0.60,
                        winterbauAn: parseFloat(row.winterbau_an_prozent) || 0.40,
                        urlaubsverguetungSatz: parseFloat(row.urlaubsverguetung_prozent) || 14.25,
                        mindestlohn1: parseFloat(row.mindestlohn_1) || 14.35,
                        mindestlohn2: parseFloat(row.mindestlohn_2) || 16.50
                    };
                }
            } catch (_e) {
                // Fallback zu statischen Tabellensätzen
            }
        }

        // Statische Standard-Beitragssätze (Stand 01.07.2026 / 2027)
        const isHistorisch = dateStr < '2026-07-01';

        const saetzeAktuell = {
            WEST: {
                ulak: 14.70,
                zvk: 3.20,
                bbv: 1.45,
                winterbauAg: 0.60,
                winterbauAn: 0.40,
                urlaubsverguetungSatz: 14.25,
                mindestlohn1: 14.35,
                mindestlohn2: 16.50
            },
            OST: {
                ulak: 12.10,
                zvk: 0.80,
                bbv: 1.45,
                winterbauAg: 0.60,
                winterbauAn: 0.40,
                urlaubsverguetungSatz: 11.40,
                mindestlohn1: 14.35,
                mindestlohn2: 14.35
            },
            BERLIN_WEST: {
                ulak: 15.05,
                zvk: 3.20,
                bbv: 1.45,
                winterbauAg: 0.60,
                winterbauAn: 0.40,
                urlaubsverguetungSatz: 14.25,
                mindestlohn1: 14.35,
                mindestlohn2: 16.50
            },
            BERLIN_OST: {
                ulak: 12.10,
                zvk: 0.80,
                bbv: 1.45,
                winterbauAg: 0.60,
                winterbauAn: 0.40,
                urlaubsverguetungSatz: 11.40,
                mindestlohn1: 14.35,
                mindestlohn2: 14.35
            }
        };

        const saetzeHistorisch = {
            WEST: {
                ulak: 15.20,
                zvk: 3.20,
                bbv: 1.65,
                winterbauAg: 0.80,
                winterbauAn: 0.40,
                urlaubsverguetungSatz: 14.25,
                mindestlohn1: 13.80,
                mindestlohn2: 15.70
            },
            OST: {
                ulak: 14.00,
                zvk: 0.70,
                bbv: 1.65,
                winterbauAg: 0.80,
                winterbauAn: 0.40,
                urlaubsverguetungSatz: 11.40,
                mindestlohn1: 13.80,
                mindestlohn2: 13.80
            },
            BERLIN_WEST: {
                ulak: 15.05,
                zvk: 3.20,
                bbv: 1.65,
                winterbauAg: 0.80,
                winterbauAn: 0.40,
                urlaubsverguetungSatz: 14.25,
                mindestlohn1: 13.80,
                mindestlohn2: 15.70
            },
            BERLIN_OST: {
                ulak: 14.00,
                zvk: 0.70,
                bbv: 1.65,
                winterbauAg: 0.80,
                winterbauAn: 0.40,
                urlaubsverguetungSatz: 11.40,
                mindestlohn1: 13.80,
                mindestlohn2: 13.80
            }
        };

        const map = isHistorisch ? saetzeHistorisch : saetzeAktuell;
        return map[area] || map.WEST;
    }

    /**
     * Gesetzliche & tarifliche Mindestlöhne im Baugewerbe (Stand 2026/2027).
     */
    static getMindestlohnGrenzen(stichtag = new Date(), db = null) {
        const saetze = this.getBeitragssaetze('WEST', stichtag, db);
        return {
            milogGesetzlich: 12.82,
            mindestlohn1: saetze.mindestlohn1 || 14.35,
            mindestlohn2: saetze.mindestlohn2 || 16.50
        };
    }

    /**
     * Berechnet die vollständige Monatsmeldung für einen Mitarbeiter nach BRTV.
     * @param {Object} mitarbeiter - Stammdaten des Arbeitnehmers
     * @param {Object} monatsDaten - { bruttoLohn, geleisteteStunden, beschaeftigungstage, ausfallzeiten, genommenerUrlaubTage, ausbezahltesUrlaubsentgelt }
     * @param {Object} customSaetze - Optionale abweichende Beitragssätze
     */
    static calculateArbeitnehmerMonat(mitarbeiter = {}, monatsDaten = {}, customSaetze = null) {
        const tarifgebiet = (mitarbeiter.tarifgebiet || 'WEST').toUpperCase();
        let mData = monatsDaten || {};
        let saetze = customSaetze;

        // Falls customSaetze als 2. Parameter übergeben wurde (kombiniertes Mitarbeiter-/Monatsdatenobjekt)
        if (mData && (mData.ulak !== undefined || mData.zvk !== undefined) && customSaetze === null) {
            saetze = mData;
            mData = mitarbeiter;
        }

        if (!saetze) {
            saetze = this.getBeitragssaetze(tarifgebiet);
        }

        const bruttoLohn = Math.round((parseFloat(mData.bruttoLohn !== undefined ? mData.bruttoLohn : mitarbeiter.bruttoLohn) || 0) * 100) / 100;
        const geleisteteStunden = parseFloat(mData.geleisteteStunden !== undefined ? mData.geleisteteStunden : mitarbeiter.geleisteteStunden) || 0.0;
        const beschaeftigungstage = mData.beschaeftigungstage !== undefined
            ? parseInt(mData.beschaeftigungstage, 10)
            : (mitarbeiter.beschaeftigungstage !== undefined ? parseInt(mitarbeiter.beschaeftigungstage, 10) : 30);

        // 1. SOKA-BAU Beiträge (ULAK, ZVK, BBV, Winterbau-AG)
        const ulakBeitrag = Math.round(bruttoLohn * (saetze.ulak / 100) * 100) / 100;
        const zvkBeitrag = Math.round(bruttoLohn * (saetze.zvk / 100) * 100) / 100;
        const bbvBeitrag = Math.round(bruttoLohn * (saetze.bbv / 100) * 100) / 100;
        const winterbauAg = Math.round(bruttoLohn * (saetze.winterbauAg / 100) * 100) / 100;
        const gesamtBeitrag = Math.round((ulakBeitrag + zvkBeitrag + bbvBeitrag + winterbauAg) * 100) / 100;

        // 2. Urlaubsanspruchsberechnung nach BRTV: Für jeweils 12 Beschäftigungstage = 1 Urlaubstag
        const erworbeneUrlaubstage = Math.round((beschaeftigungstage / 12) * 100) / 100;
        const erworbeneUrlaubsverguetung = Math.round(bruttoLohn * (saetze.urlaubsverguetungSatz / 100) * 100) / 100;

        const genommeneTage = parseFloat(monatsDaten.genommenerUrlaubTage) || 0.0;
        const ausbezahltesUrlaubsentgelt = parseFloat(monatsDaten.ausbezahltesUrlaubsentgelt) || 0.0;
        const ulakErstattungsanspruch = Math.round(ausbezahltesUrlaubsentgelt * 100) / 100;

        // 3. Compliance- & Plausibilitätsprüfungen (MiLoG & ArbZG)
        const complianceWarnings = [];
        const mindestlohnLimits = this.getMindestlohnGrenzen();

        if (geleisteteStunden > 0) {
            const rechnerischerStundensatz = Math.round((bruttoLohn / geleisteteStunden) * 100) / 100;
            if (rechnerischerStundensatz < mindestlohnLimits.mindestlohn1) {
                complianceWarnings.push({
                    code: 'MINDESTLOHN_UNTERSCHRITTEN',
                    level: 'ERROR',
                    message: `Rechnerischer Stundenlohn (${rechnerischerStundensatz.toFixed(2)} €/h) unterschreitet tariflichen Mindestlohn 1 (${mindestlohnLimits.mindestlohn1.toFixed(2)} €/h)!`
                });
            } else if (rechnerischerStundensatz < mindestlohnLimits.mindestlohn2 && tarifgebiet === 'WEST' && mitarbeiter.lohngruppe_id && mitarbeiter.lohngruppe_id >= 'LG3') {
                complianceWarnings.push({
                    code: 'MINDESTLOHN2_HINWEIS',
                    level: 'WARN',
                    message: `Stundenlohn (${rechnerischerStundensatz.toFixed(2)} €/h) liegt unter Mindestlohn 2 (${mindestlohnLimits.mindestlohn2.toFixed(2)} €/h) für Facharbeiter.`
                });
            }
        }

        // ArbZG Höchstarbeitszeit-Prüfung (> 220 Monatsstunden)
        if (geleisteteStunden > 220) {
            complianceWarnings.push({
                code: 'HOECHSTARBEITSZEIT_UEBERSCHRITTEN',
                level: 'WARN',
                message: `Monatsarbeitszeit (${geleisteteStunden.toFixed(1)} h) überschreitet gesetzliche Höchstarbeitszeit nach § 3 ArbZG.`
            });
        }

        // VSNR Prüfung
        const vsnr = String(mitarbeiter.vsnr || '').trim();
        if (!vsnr) {
            complianceWarnings.push({
                code: 'VSNR_FEHLT',
                level: 'ERROR',
                message: 'Sozialversicherungsnummer (VSNR) fehlt! Für SOKA-Meldung zwingend erforderlich.'
            });
        } else if (vsnr.length !== 12) {
            complianceWarnings.push({
                code: 'VSNR_FORMAT_UNGULTIG',
                level: 'WARN',
                message: `Sozialversicherungsnummer "${vsnr}" hat ${vsnr.length} statt der normierten 12 Zeichen.`
            });
        }

        const isInvalid = complianceWarnings.some(w => w.level === 'ERROR');
        const hasWarning = complianceWarnings.some(w => w.level === 'WARN');

        return {
            mitarbeiterId: mitarbeiter.id,
            anNummer: mitarbeiter.an_nummer || mitarbeiter.personalnummer || `AN-${mitarbeiter.id}`,
            vsnr,
            name: mitarbeiter.nachname || mitarbeiter.name || '',
            vorname: mitarbeiter.vorname || '',
            tarifgebiet,
            beschaeftigungstage,
            geleisteteStunden,
            bruttoLohn,
            beitraege: {
                ulakBeitrag,
                zvkBeitrag,
                bbvBeitrag,
                winterbauAg,
                gesamtBeitrag
            },
            urlaub: {
                erworbeneUrlaubstage,
                erworbeneUrlaubsverguetung,
                genommeneTage,
                ausbezahltesUrlaubsentgelt,
                ulakErstattungsanspruch
            },
            ausfallzeiten: monatsDaten.ausfallzeiten || [],
            complianceStatus: isInvalid ? 'INVALID' : (hasWarning ? 'WARNING' : 'VALID'),
            complianceWarnings
        };
    }

    /**
     * Aggregiert die Monatsmeldung über alle Arbeitnehmer.
     */
    static calculateMonatsmeldungGesamt(betrieb, mitarbeiterMeldungen = [], meldeMonat = '2026-09', tarifgebiet = 'WEST') {
        let actualBetrieb = typeof betrieb === 'object' && betrieb !== null && !Array.isArray(betrieb) ? betrieb : {};
        let actualMeldungen = Array.isArray(mitarbeiterMeldungen) ? mitarbeiterMeldungen : [];
        let actualMonat = typeof meldeMonat === 'string' ? meldeMonat : '2026-09';
        let actualTarif = typeof tarifgebiet === 'string' ? tarifgebiet : 'WEST';

        if (Array.isArray(betrieb)) {
            actualMeldungen = betrieb;
            actualBetrieb = { betriebsnummer: '98765432' };
            if (typeof mitarbeiterMeldungen === 'string') actualMonat = mitarbeiterMeldungen;
        } else if (typeof betrieb === 'string' && Array.isArray(tarifgebiet)) {
            actualMonat = betrieb;
            actualTarif = typeof mitarbeiterMeldungen === 'string' ? mitarbeiterMeldungen : 'WEST';
            actualBetrieb = { betriebsnummer: String(meldeMonat || '98765432') };
            actualMeldungen = tarifgebiet;
        }

        let totalBrutto = 0;
        let totalBeitrag = 0;
        let totalErstattung = 0;
        let validCount = 0;
        let errorCount = 0;

        actualMeldungen.forEach(m => {
            totalBrutto += (m.bruttoLohn || 0);
            totalBeitrag += (m.beitraege && m.beitraege.gesamtBeitrag) || 0;
            totalErstattung += (m.urlaub && m.urlaub.ulakErstattungsanspruch) || 0;
            if (m.complianceStatus === 'INVALID') {
                errorCount++;
            } else {
                validCount++;
            }
        });

        totalBrutto = Math.round(totalBrutto * 100) / 100;
        totalBeitrag = Math.round(totalBeitrag * 100) / 100;
        totalErstattung = Math.round(totalErstattung * 100) / 100;
        const zahlbetrag = Math.round((totalBeitrag - totalErstattung) * 100) / 100;

        return {
            betriebsnummer: actualBetrieb.betriebsnummer || actualBetrieb.soka_betriebsnummer || '98765432',
            betriebsname: actualBetrieb.firmenname || actualBetrieb.name || 'W-Link Bauunternehmen',
            meldeMonat: actualMonat,
            tarifgebiet: actualTarif,
            anzahlArbeitnehmer: actualMeldungen.length,
            validCount,
            errorCount,
            bruttolohnGesamt: totalBrutto,
            bruttolohnSumme: totalBrutto,
            beitragGesamt: totalBeitrag,
            erstattungGesamt: totalErstattung,
            zahlbetrag,
            status: errorCount > 0 ? 'ENTWURF' : 'VALIDIERT',
            arbeitnehmerMeldungen: actualMeldungen
        };
    }

    /**
     * Erzeugt den normierten DTA-Bau Datensatz (Datenträgeraustausch Festbreitenformat mit Satzarten 01, 02, 03, 09).
     * @param {Object} betrieb - { betriebsnummer, name }
     * @param {Array} monatsMeldungen - Liste berechneter Arbeitnehmer-Monatssätze
     * @param {string} meldeMonat - '2026-09' oder '202609'
     */
    static generateDtaBauString(betrieb, monatsMeldungen = [], meldeMonat = '2026-09') {
        const lines = [];
        const dateNow = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 8); // JJJJMMDD
        const cleanMonat = String(meldeMonat).replace(/[^0-9]/g, '').slice(0, 6); // JJJJMM

        const bnr = String(betrieb.betriebsnummer || betrieb.soka_betriebsnummer || '00000000').padEnd(8, ' ').slice(0, 8);
        const bName = String(betrieb.firmenname || betrieb.name || 'W-Link Bau GmbH').padEnd(30, ' ').slice(0, 30);

        // 1. Satzart 01 - Betriebssatz (Header)
        lines.push(`01${bnr}${cleanMonat}${bName}${dateNow}${' '.repeat(40)}`);

        let summeBrutto = 0;
        let summeBeitrag = 0;
        let summeErstattung = 0;

        // 2. Satzart 02 - Arbeitnehmer-Sätze
        monatsMeldungen.forEach(m => {
            summeBrutto += m.bruttoLohn;
            summeBeitrag += m.beitraege.gesamtBeitrag;
            summeErstattung += m.urlaub.ulakErstattungsanspruch;

            const anNr = String(m.anNummer || '').padEnd(10, ' ').slice(0, 10);
            const vsnr = String(m.vsnr || '').padEnd(12, ' ').slice(0, 12);
            const nameStr = `${m.name}, ${m.vorname}`.padEnd(30, ' ').slice(0, 30);
            const tage = String(m.beschaeftigungstage).padStart(2, '0').slice(0, 2);
            const std = String(Math.round(m.geleisteteStunden * 100)).padStart(6, '0').slice(0, 6);
            const brutto = String(Math.round(m.bruttoLohn * 100)).padStart(8, '0').slice(0, 8);
            const beitrag = String(Math.round(m.beitraege.gesamtBeitrag * 100)).padStart(8, '0').slice(0, 8);
            const erstattung = String(Math.round(m.urlaub.ulakErstattungsanspruch * 100)).padStart(8, '0').slice(0, 8);

            lines.push(`02${bnr}${cleanMonat}${anNr}${vsnr}${nameStr}${tage}${std}${brutto}${beitrag}${erstattung}`);

            // Satzart 03 - Ausfallzeiten
            (m.ausfallzeiten || []).forEach(af => {
                const schluessel = String(af.schluessel || '01').padStart(2, '0').slice(0, 2);
                const von = String(af.von || af.von_datum || '').replace(/[^0-9]/g, '').padEnd(8, '0').slice(0, 8);
                const bis = String(af.bis || af.bis_datum || '').replace(/[^0-9]/g, '').padEnd(8, '0').slice(0, 8);
                const afStd = String(Math.round((parseFloat(af.stunden) || 0) * 100)).padStart(5, '0').slice(0, 5);
                lines.push(`03${bnr}${cleanMonat}${anNr}${schluessel}${von}${bis}${afStd}`);
            });
        });

        // 3. Satzart 09 - Summensatz (Trailer)
        const anzahlAn = String(monatsMeldungen.length).padStart(5, '0').slice(0, 5);
        const sumBruttoStr = String(Math.round(summeBrutto * 100)).padStart(10, '0').slice(0, 10);
        const sumBeitragStr = String(Math.round(summeBeitrag * 100)).padStart(10, '0').slice(0, 10);
        const sumErstattungStr = String(Math.round(summeErstattung * 100)).padStart(10, '0').slice(0, 10);
        const zahlbetragVal = Math.max(0, Math.round((summeBeitrag - summeErstattung) * 100));
        const zahlbetragStr = String(zahlbetragVal).padStart(10, '0').slice(0, 10);

        lines.push(`09${bnr}${cleanMonat}${anzahlAn}${sumBruttoStr}${sumBeitragStr}${sumErstattungStr}${zahlbetragStr}`);

        return lines.join('\r\n');
    }

    /**
     * Erzeugt das offizielle SOKA-BAU XML-Meldedokument (Version 3.0).
     */
    static generateSokaBauXml(betrieb, monatsMeldungen = [], meldeMonat = '2026-09') {
        const timestamp = new Date().toISOString();
        const cleanMonat = meldeMonat.length === 6 ? `${meldeMonat.slice(0, 4)}-${meldeMonat.slice(4, 6)}` : meldeMonat;

        let totalBrutto = 0;
        let totalBeitrag = 0;
        let totalErstattung = 0;
        let itemsXml = '';

        monatsMeldungen.forEach(m => {
            totalBrutto += m.bruttoLohn;
            totalBeitrag += m.beitraege.gesamtBeitrag;
            totalErstattung += m.urlaub.ulakErstattungsanspruch;

            let afXml = '';
            (m.ausfallzeiten || []).forEach(af => {
                afXml += `
        <Ausfallzeit schluessel="${this._escapeXml(af.schluessel)}" bezeichnung="${this._escapeXml(af.bezeichnung || '')}">
          <Von>${this._escapeXml(af.von || af.von_datum || '')}</Von>
          <Bis>${this._escapeXml(af.bis || af.bis_datum || '')}</Bis>
          <Stunden>${(parseFloat(af.stunden) || 0).toFixed(2)}</Stunden>
        </Ausfallzeit>`;
            });

            itemsXml += `
    <Arbeitnehmer id="${m.mitarbeiterId}">
      <ArbeitnehmerNummer>${this._escapeXml(m.anNummer)}</ArbeitnehmerNummer>
      <SozialversicherungsNummer>${this._escapeXml(m.vsnr)}</SozialversicherungsNummer>
      <Name>${this._escapeXml(m.name)}</Name>
      <Vorname>${this._escapeXml(m.vorname)}</Vorname>
      <Tarifgebiet>${this._escapeXml(m.tarifgebiet)}</Tarifgebiet>
      <Beschaeftigungstage>${m.beschaeftigungstage}</Beschaeftigungstage>
      <GeleisteteStunden>${m.geleisteteStunden.toFixed(2)}</GeleisteteStunden>
      <Bruttolohn>${m.bruttoLohn.toFixed(2)}</Bruttolohn>
      <Beitraege>
        <UlakBeitrag>${m.beitraege.ulakBeitrag.toFixed(2)}</UlakBeitrag>
        <ZvkBeitrag>${m.beitraege.zvkBeitrag.toFixed(2)}</ZvkBeitrag>
        <BbvBeitrag>${m.beitraege.bbvBeitrag.toFixed(2)}</BbvBeitrag>
        <WinterbauAgBeitrag>${m.beitraege.winterbauAg.toFixed(2)}</WinterbauAgBeitrag>
        <GesamtBeitrag>${m.beitraege.gesamtBeitrag.toFixed(2)}</GesamtBeitrag>
      </Beitraege>
      <Urlaubsanspruch>
        <ErworbeneTage>${m.urlaub.erworbeneUrlaubstage.toFixed(2)}</ErworbeneTage>
        <ErworbeneVerguetung>${m.urlaub.erworbeneUrlaubsverguetung.toFixed(2)}</ErworbeneVerguetung>
        <GenommeneTage>${m.urlaub.genommeneTage.toFixed(2)}</GenommeneTage>
        <AusbezahlteVerguetung>${m.urlaub.ausbezahltesUrlaubsentgelt.toFixed(2)}</AusbezahlteVerguetung>
      </Urlaubsanspruch>
      <Ausfallzeiten>${afXml}
      </Ausfallzeiten>
    </Arbeitnehmer>`;
        });

        totalBrutto = Math.round(totalBrutto * 100) / 100;
        totalBeitrag = Math.round(totalBeitrag * 100) / 100;
        totalErstattung = Math.round(totalErstattung * 100) / 100;
        const zahlbetrag = Math.round((totalBeitrag - totalErstattung) * 100) / 100;

        return `<?xml version="1.0" encoding="UTF-8"?>
<SokaBauMeldung xmlns="http://www.soka-bau.de/schema/meldedaten/v3" version="3.0">
  <Header>
    <Betriebsnummer>${this._escapeXml(betrieb.betriebsnummer || betrieb.soka_betriebsnummer || '00000000')}</Betriebsnummer>
    <BetriebsName>${this._escapeXml(betrieb.firmenname || betrieb.name || 'W-Link Bau GmbH')}</BetriebsName>
    <MeldeMonat>${this._escapeXml(cleanMonat)}</MeldeMonat>
    <ErstellungsZeitstempel>${timestamp}</ErstellungsZeitstempel>
    <Software>W-Link ERP v2.0</Software>
  </Header>
  <ArbeitnehmerMeldungen>${itemsXml}
  </ArbeitnehmerMeldungen>
  <SummenBlock>
    <AnzahlArbeitnehmer>${monatsMeldungen.length}</AnzahlArbeitnehmer>
    <GesamtBruttolohn>${totalBrutto.toFixed(2)}</GesamtBruttolohn>
    <GesamtBeitragssumme>${totalBeitrag.toFixed(2)}</GesamtBeitragssumme>
    <GesamtErstattungsanspruch>${totalErstattung.toFixed(2)}</GesamtErstattungsanspruch>
    <Zahlbetrag>${zahlbetrag.toFixed(2)}</Zahlbetrag>
  </SummenBlock>
</SokaBauMeldung>`;
    }

    static _escapeXml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SokaBauController;
} else {
    window.SokaBauController = SokaBauController;
}
