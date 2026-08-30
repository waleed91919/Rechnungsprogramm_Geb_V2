/**
 * js/gaeb-x31.js - GAEB DA XML 3.3 Datenaustauschphase X31 (Mengenermittlung nach REB 23.003)
 * Erzeugt und parst standardkonforme X31 XML-Dateien für den elektronischen Aufmaß-Austausch.
 * Isomorph aufgebaut für Node.js und Browser.
 */

class GaebX31Service {
    /**
     * Erzeugt ein valides GAEB DA XML 3.3 Dokument (Phase X31) aus Projektdaten,
     * Aufmaßblättern und LV-Positionen.
     * @param {Object} project - Projektinformationen
     * @param {Array} blaetter - Liste der Aufmaßblätter mit enthaltenen Aufmaßzeilen
     * @param {Array} positions - Liste der LV-Positionen (optional zur Anreicherung)
     * @returns {string} XML-String
     */
    static generateX31Xml(project = {}, blaetter = [], positions = []) {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0];

        // 1. Gruppiere alle Aufmaßzeilen nach Ordnungszahl (OZ)
        const zeilenByOz = {};
        const posMap = new Map();
        (positions || []).forEach(p => {
            const oz = p.oz_code || p.pos_nr || p.oz;
            if (oz) posMap.set(oz, p);
        });

        (blaetter || []).forEach(blatt => {
            const blattNr = String(blatt.blatt_nummer || '001');
            (blatt.zeilen || []).forEach((z, zIdx) => {
                const oz = z.oz_code || '01.01.0010';
                if (!zeilenByOz[oz]) zeilenByOz[oz] = [];

                let sign = 1;
                if (z.vorzeichen !== undefined && z.vorzeichen !== null) {
                    sign = parseInt(z.vorzeichen, 10) < 0 ? -1 : 1;
                } else if (parseFloat(z.ergebnis) < 0) {
                    sign = -1;
                }

                zeilenByOz[oz].push({
                    sheetNo: blattNr.padStart(3, '0'),
                    rowNo: String(z.zeilen_nr || zIdx + 1).padStart(2, '0'),
                    formulaNo: String(z.formel_reb || '91').padStart(2, '0'),
                    formulaText: z.bezeichnung || z.raum || '',
                    rechenansatz: z.rechenansatz || z.formel || '',
                    resultQty: Math.abs(parseFloat(z.ergebnis) || 0),
                    sign: sign,
                    einheit: z.einheit || 'm²'
                });
            });
        });

        // 2. Erzeuge die Item-Knoten mit <QtyDeterm> Blöcken
        const allOzs = new Set([...Object.keys(zeilenByOz), ...posMap.keys()]);
        let itemsXml = '';

        Array.from(allOzs).sort().forEach((oz, idx) => {
            const zeilen = zeilenByOz[oz] || [];
            const posMeta = posMap.get(oz) || {};
            const posName = posMeta.name || `Position ${oz}`;
            const posUnit = (zeilen[0] && zeilen[0].einheit) || posMeta.einheit || 'm²';

            // Berechne Netto-Aufmaßmenge unter Berücksichtigung des Vorzeichens
            let totalQty = 0;
            let qdetermXml = '';

            zeilen.forEach(z => {
                const effectiveVal = z.resultQty * z.sign;
                totalQty += effectiveVal;

                const cleanAnsatz = GaebX31Service.escapeXml(z.rechenansatz);
                const desc = z.formulaText ? GaebX31Service.escapeXml(z.formulaText) : '';
                const takeoffText = desc ? `"${desc}" ${cleanAnsatz}` : cleanAnsatz;
                const signTag = z.sign < 0 ? '<QtyDetermSign>-</QtyDetermSign>' : '<QtyDetermSign>+</QtyDetermSign>';

                qdetermXml += `
                <QDetermItem>
                  <SheetNo>${z.sheetNo}</SheetNo>
                  <RowNo>${z.rowNo}</RowNo>
                  <FormulaNo>${z.formulaNo}</FormulaNo>
                  ${signTag}
                  <QTakeoff Row="${cleanAnsatz}">${takeoffText}</QTakeoff>
                  ${desc ? `<FormulaText>${desc}</FormulaText>` : ''}
                  <ResultQty>${z.resultQty.toFixed(3)}</ResultQty>
                  <Sign>${z.sign}</Sign>
                </QDetermItem>`;
            });

            // Falls keine Zeilen vorhanden, aber Position im LV ist
            const finalQty = zeilen.length > 0 ? totalQty : (parseFloat(posMeta.menge) || 0);

            itemsXml += `
            <Item RNoPart="${GaebX31Service.escapeXml(oz)}" RNoIndex="${idx + 1}">
              <OZ>${GaebX31Service.escapeXml(oz)}</OZ>
              <Qty>${finalQty.toFixed(3)}</Qty>
              <QU>${GaebX31Service.escapeXml(posUnit)}</QU>
              <Description>
                <CompleteText>
                  <DetailTxt>
                    <Text>
                      <p>${GaebX31Service.escapeXml(posName)}</p>
                    </Text>
                  </DetailTxt>
                </CompleteText>
              </Description>
              ${zeilen.length > 0 ? `<QtyDeterm>${qdetermXml}
              </QtyDeterm>` : ''}
            </Item>`;
        });

        return `<?xml version="1.0" encoding="UTF-8"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA_XML/3.3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <GAEBInfo>
    <DP>X31</DP>
    <Date>${dateStr}</Date>
    <Time>${timeStr}</Time>
    <ProgSystem>W-Link ERP</ProgSystem>
    <ProgName>W-Link ERP</ProgName>
    <ProgVers>1.0.6</ProgVers>
  </GAEBInfo>
  <QtyDetermination>
    <DP>X31</DP>
    <Award>
      <DP>X31</DP>
      <AwardInfo>
        <Cur>EUR</Cur>
      </AwardInfo>
      <BOQ>
        <BoQInfo>
          <Name>${GaebX31Service.escapeXml(project.name || 'Projekt Mengenermittlung')}</Name>
          <LblBoQ>LV-01</LblBoQ>
        </BoQInfo>
        <BoQBody>
          <BoQCtgy RNoPart="01">
            <LblTx>Aufmaß &amp; Mengenermittlung (REB 23.003)</LblTx>
            <BoQBody>${itemsXml}
            </BoQBody>
          </BoQCtgy>
        </BoQBody>
      </BOQ>
    </Award>
  </QtyDetermination>
</GAEB>`;
    }

    /**
     * Sichere mathematische Auswertung von REB Formeln und Ausdrücken.
     * @param {string} expr
     * @returns {number}
     */
    static evaluateFormula(expr) {
        if (!expr || typeof expr !== 'string') return 0;
        try {
            const sanitized = expr.replace(/,/g, '.').replace(/[^0-9+\-*/().\s]/g, '');
            if (!sanitized.trim()) return 0;
            // Safe math eval
            const res = Function(`'use strict'; return (${sanitized});`)();
            return typeof res === 'number' && !isNaN(res) && isFinite(res) ? Math.round(res * 10000) / 10000 : 0;
        } catch (_e) {
            return 0;
        }
    }

    /**
     * Parst eine GAEB DA XML 3.3 X31 Datei und extrahiert Mengen und Rechenansätze.
     * @param {string} xmlString
     * @returns {Object} Geparste Daten
     */
    static parseX31Xml(xmlString) {
        if (!xmlString || typeof xmlString !== 'string' || (!xmlString.includes('<GAEB') && !xmlString.includes('<QtyDetermination'))) {
            throw new Error('Ungültige GAEB XML Datei: Kein GAEB Root-Element gefunden.');
        }

        const projectInfo = {
            name: GaebX31Service.extractTag(xmlString, 'Name') || 'GAEB X31 Projekt',
            date: GaebX31Service.extractTag(xmlString, 'Date') || '',
            progName: GaebX31Service.extractTag(xmlString, 'ProgName') || GaebX31Service.extractTag(xmlString, 'ProgSystem') || 'GAEB XML'
        };

        const rawDp = GaebX31Service.extractTag(xmlString, 'DP') || 'X31';
        const dp = rawDp.includes('31') ? 'X31' : rawDp;

        // Extrahiere alle <Item> Blöcke
        const items = [];
        const itemRegex = /<Item[\s\S]*?<\/Item>/gi;
        let match;

        while ((match = itemRegex.exec(xmlString)) !== null) {
            const itemXml = match[0];
            const oz = GaebX31Service.extractAttribute(itemXml, 'Item', 'RNoPart') ||
                       GaebX31Service.extractTag(itemXml, 'OZ') ||
                       GaebX31Service.extractTag(itemXml, 'RNoPart') ||
                       `Pos_${items.length + 1}`;

            const name = GaebX31Service.extractTag(itemXml, 'p') ||
                         GaebX31Service.extractTag(itemXml, 'Text') ||
                         GaebX31Service.extractTag(itemXml, 'LblTx') ||
                         `Position ${oz}`;

            const einheit = GaebX31Service.extractTag(itemXml, 'QU') || 'm²';
            const declaredQty = parseFloat(GaebX31Service.extractTag(itemXml, 'Qty')) || 0;

            // Extrahiere Rechenansätze aus <QtyDeterm> bzw. <QDetermItem>
            const ansatze = [];
            const ansatzRegex = /<QDetermItem[\s\S]*?<\/QDetermItem>/gi;
            let aMatch;
            let calculatedSum = 0;

            while ((aMatch = ansatzRegex.exec(itemXml)) !== null) {
                const aXml = aMatch[0];
                const sheetNo = GaebX31Service.extractTag(aXml, 'SheetNo') || '001';
                const rowNo = GaebX31Service.extractTag(aXml, 'RowNo') || String(ansatze.length + 1);
                const formulaNo = GaebX31Service.extractTag(aXml, 'FormulaNo') || '91';

                const signTag = GaebX31Service.extractTag(aXml, 'QtyDetermSign') || GaebX31Service.extractTag(aXml, 'Sign') || '1';
                const sign = (signTag === '-' || signTag === '-1' || parseInt(signTag, 10) === -1) ? -1 : 1;

                let rowAnsatz = GaebX31Service.extractAttribute(aXml, 'QTakeoff', 'Row');
                let fullTakeoff = GaebX31Service.extractTag(aXml, 'QTakeoff') || '';
                let bezeichnung = GaebX31Service.extractTag(aXml, 'FormulaText') || '';

                if (!rowAnsatz) {
                    // Prüfe ob Text in Anführungszeichen steht
                    const commentMatch = fullTakeoff.match(/^"([^"]*)"\s*(.*)$/);
                    if (commentMatch) {
                        bezeichnung = bezeichnung || commentMatch[1];
                        rowAnsatz = commentMatch[2];
                    } else {
                        rowAnsatz = fullTakeoff;
                    }
                }

                let resultQty = parseFloat(GaebX31Service.extractTag(aXml, 'ResultQty'));
                if (isNaN(resultQty)) {
                    resultQty = GaebX31Service.evaluateFormula(rowAnsatz);
                }

                calculatedSum += (resultQty * sign);

                ansatze.push({
                    sheetNo,
                    rowNo,
                    formulaNo,
                    bezeichnung: bezeichnung || '',
                    rechenansatz: (rowAnsatz || '').trim(),
                    resultQty: Math.abs(resultQty),
                    sign,
                    einheit
                });
            }

            const totalQty = ansatze.length > 0 ? Math.round(calculatedSum * 1000) / 1000 : declaredQty;

            items.push({
                oz_code: oz,
                name: name.trim(),
                einheit,
                totalQty,
                declaredQty,
                ansatze
            });
        }

        return {
            dp,
            projectInfo,
            items,
            itemCount: items.length
        };
    }

    /**
     * Hilfsfunktion zum Extrahieren von XML-Tags.
     */
    static extractTag(xml, tagName) {
        const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
        const match = xml.match(regex);
        return match ? match[1].replace(/<!\[CDATA\[(.*?)\]\]>/gi, '$1').trim() : null;
    }

    /**
     * Hilfsfunktion zum Extrahieren von XML-Attributen.
     */
    static extractAttribute(xml, tagName, attrName) {
        const regex = new RegExp(`<${tagName}[^>]*\\s+${attrName}="([^"]*)"`, 'i');
        const match = xml.match(regex);
        return match ? match[1] : null;
    }

    /**
     * XML Zeichen-Maskierung.
     */
    static escapeXml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}

// Isomorpher Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GaebX31Service;
}
if (typeof window !== 'undefined') {
    window.GaebX31Service = GaebX31Service;
}
