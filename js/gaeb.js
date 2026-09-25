/**
 * gaeb.js - GAEB DA XML Parser & Exporter für GAEB Phasen X83 (Ausschreibung), X84 (Angebotsabgabe) & X89 (Rechnung)
 */
class GAEBEngine {
    /**
     * Parsed ein GAEB XML Dokument (z.B. X83) in eine hierarchische Objektstruktur.
     * @param {string} xmlString - GAEB XML Datei-Inhalt
     * @returns {Object} { projectInfo: {}, items: [] }
     */
    static parseGAEBXML(xmlString) {
        if (!xmlString || typeof xmlString !== 'string') {
            throw new Error('Ungültiger GAEB-Inhalt.');
        }

        const projectInfo = {
            name: 'GAEB Import',
            gaebPhase: 'X83',
            currency: 'EUR'
        };

        // Extrahiere GAEB-Phase aus Award/DP, GAEBInfo/DP oder DP
        const phaseMatch = xmlString.match(/<Award>[\s\S]*?<DP>([^<]+)<\/DP>/i) ||
                           xmlString.match(/<GAEBInfo>[\s\S]*?<DP>([^<]+)<\/DP>/i) ||
                           xmlString.match(/<DP>([^<]+)<\/DP>/i);
        if (phaseMatch) {
            let phase = phaseMatch[1].trim();
            // Normalisiere z. B. '84' -> 'X84', '83' -> 'X83'
            if (/^\d{2}$/.test(phase)) {
                phase = 'X' + phase;
            }
            projectInfo.gaebPhase = phase;
        }

        const curMatch = xmlString.match(/<Cur>([^<]+)<\/Cur>/i) || xmlString.match(/<Currency>([^<]+)<\/Currency>/i);
        if (curMatch) {
            projectInfo.currency = curMatch[1].trim();
        }

        const prjNameMatch = xmlString.match(/<BoQInfo>[\s\S]*?<Name>([^<]+)<\/Name>/i) ||
                             xmlString.match(/<PrjName>([^<]+)<\/PrjName>/i) ||
                             xmlString.match(/<Name>([^<]+)<\/Name>/i);
        if (prjNameMatch) {
            projectInfo.name = prjNameMatch[1].trim();
        }

        const items = [];
        // Regex-basierter Parser für GAEB-Item-Knoten <Item ...> ... </Item>
        const itemRegex = /<Item\b[^>]*>([\s\S]*?)<\/Item>/gi;
        let match;

        while ((match = itemRegex.exec(xmlString)) !== null) {
            const itemContent = match[1];

            const ozMatch = itemContent.match(/<OZ>([^<]+)<\/OZ>/i) || itemContent.match(/<RNoPart>([^<]+)<\/RNoPart>/i);
            const oz = ozMatch ? ozMatch[1].trim() : '';

            const qtyMatch = itemContent.match(/<Qty>([^<]+)<\/Qty>/i);
            const menge = qtyMatch ? parseFloat(qtyMatch[1].replace(',', '.')) : 1.0;

            const unitMatch = itemContent.match(/<QU>([^<]+)<\/QU>/i) || itemContent.match(/<Unit>([^<]+)<\/Unit>/i);
            const einheit = unitMatch ? unitMatch[1].trim() : 'Stk.';

            const textMatch = itemContent.match(/<TextOutl>[\s\S]*?<p>([^<]+)<\/p>/i) ||
                              itemContent.match(/<TextOutl>[\s\S]*?<span>([^<]+)<\/span>/i) ||
                              itemContent.match(/<TextOutl>([^<]+)<\/TextOutl>/i) ||
                              itemContent.match(/<CompleteText>[\s\S]*?<p>(?:<span>)?([^<]+)(?:<\/span>)?<\/p>/i) ||
                              itemContent.match(/<Description>([^<]+)<\/Description>/i);
            const kurztext = textMatch ? textMatch[1].replace(/<[^>]+>/g, '').trim() : `Position ${oz}`;

            const epMatch = itemContent.match(/<UP>([^<]+)<\/UP>/i) || itemContent.match(/<UnitPrice>([^<]+)<\/UnitPrice>/i);
            const einheitspreis = epMatch ? parseFloat(epMatch[1].replace(',', '.')) : 0.0;

            const itMatch = itemContent.match(/<IT>([^<]+)<\/IT>/i) || itemContent.match(/<TotalPrice>([^<]+)<\/TotalPrice>/i);
            const gesamtpreis = itMatch ? parseFloat(itMatch[1].replace(',', '.')) : (menge * einheitspreis);

            items.push({
                oz_code: oz,
                name: kurztext,
                menge,
                einheit,
                preis: einheitspreis,
                gesamtpreis,
                cost_type: 'MATERIAL'
            });
        }

        return {
            projectInfo,
            items
        };
    }

    /**
     * Erzeugt eine standardkonforme GAEB DA XML 3.3 Angebotsdatei (Phase X84 / 84) aus berechneten Positionen.
     * @param {string} projectName - Bezeichnung des Bauprojekts
     * @param {Array} positionen - LV-Positionen
     * @returns {string} XML-String nach GAEB DA XML 3.3
     */
    static generateGAEBX84XML(projectName, positionen = []) {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0];

        let totalNet = 0;
        let itemsXML = '';

        positionen.forEach((pos, idx) => {
            const oz = pos.oz_code || pos.pos_nr || `01.01.${String(idx + 1).padStart(4, '0')}`;
            const menge = parseFloat(pos.menge) || 0;
            const ep = parseFloat(pos.preis) || 0;
            const gp = menge * ep;
            totalNet += gp;
            const name = GAEBEngine.escapeXML(pos.name || `Position ${oz}`);
            const einheit = GAEBEngine.escapeXML(pos.einheit || 'Stk.');
            const itemId = GAEBEngine.escapeXML(pos.id || `item_${idx + 1}`);

            itemsXML += `
              <Item ID="${itemId}" RNoPart="${GAEBEngine.escapeXML(oz)}">
                <RNoPart>${GAEBEngine.escapeXML(oz)}</RNoPart>
                <OZ>${GAEBEngine.escapeXML(oz)}</OZ>
                <Qty>${menge.toFixed(3)}</Qty>
                <QU>${einheit}</QU>
                <Description>
                  <CompleteText>
                    <DetailTxt>
                      <Text>
                        <p><span>${name}</span></p>
                      </Text>
                    </DetailTxt>
                  </CompleteText>
                  <OutlineText>
                    <OutlTxt>
                      <TextOutl><span>${name}</span></TextOutl>
                    </OutlTxt>
                  </OutlineText>
                </Description>
                <UP>${ep.toFixed(2)}</UP>
                <IT>${gp.toFixed(2)}</IT>
              </Item>`;
        });

        return `<?xml version="1.0" encoding="UTF-8"?>
<!-- GAEB DA XML 3.3 Phase X84 (Angebotsabgabe) -->
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA_XML_3.3">
  <GAEBInfo>
    <Version>3.3</Version>
    <Date>${dateStr}</Date>
    <Time>${timeStr}</Time>
    <ProgMan>W-Link ERP</ProgMan>
  </GAEBInfo>
  <Award>
    <DP>84</DP>
    <AwardInfo>
      <Cur>EUR</Cur>
      <NetTotal>${totalNet.toFixed(2)}</NetTotal>
    </AwardInfo>
    <BoQ>
      <BoQInfo>
        <Name>${GAEBEngine.escapeXML(projectName || 'Bauprojekt')}</Name>
        <LblBoQ>LV</LblBoQ>
      </BoQInfo>
      <BoQBody>
        <Itemlist>${itemsXML}
        </Itemlist>
      </BoQBody>
    </BoQ>
  </Award>
</GAEB>`;
    }

    static escapeXML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GAEBEngine;
} else {
    window.GAEBEngine = GAEBEngine;
}
