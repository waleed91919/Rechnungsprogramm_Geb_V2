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

        // Extract GAEB phase if present
        const phaseMatch = xmlString.match(/<GAEBInfo>[\s\S]*?<DP>([^<]+)<\/DP>/i) || xmlString.match(/<DP>([^<]+)<\/DP>/i);
        if (phaseMatch) {
            projectInfo.gaebPhase = phaseMatch[1].trim();
        }

        const prjNameMatch = xmlString.match(/<PrjName>([^<]+)<\/PrjName>/i);
        if (prjNameMatch) {
            projectInfo.name = prjNameMatch[1].trim();
        }

        const items = [];
        // Regex-basierter Parser für GAEB-Item-Knoten <Item> ... </Item>
        const itemRegex = /<Item\b[^>]*>([\s\S]*?)<\/Item>/gi;
        let match;

        while ((match = itemRegex.exec(xmlString)) !== null) {
            const itemContent = match[1];

            const ozMatch = itemContent.match(/<RNoPart>([^<]+)<\/RNoPart>/i) || itemContent.match(/<OZ>([^<]+)<\/OZ>/i);
            const oz = ozMatch ? ozMatch[1].trim() : '';

            const qtyMatch = itemContent.match(/<Qty>([^<]+)<\/Qty>/i);
            const menge = qtyMatch ? parseFloat(qtyMatch[1].replace(',', '.')) : 1.0;

            const unitMatch = itemContent.match(/<QU>([^<]+)<\/QU>/i) || itemContent.match(/<Unit>([^<]+)<\/Unit>/i);
            const einheit = unitMatch ? unitMatch[1].trim() : 'Stk.';

            const textMatch = itemContent.match(/<TextOutl>[\s\S]*?<p>([^<]+)<\/p>/i) || itemContent.match(/<TextOutl>([^<]+)<\/TextOutl>/i) || itemContent.match(/<Description>([^<]+)<\/Description>/i);
            const kurztext = textMatch ? textMatch[1].replace(/<[^>]+>/g, '').trim() : `Position ${oz}`;

            const epMatch = itemContent.match(/<UP>([^<]+)<\/UP>/i) || itemContent.match(/<UnitPrice>([^<]+)<\/UnitPrice>/i);
            const einheitspreis = epMatch ? parseFloat(epMatch[1].replace(',', '.')) : 0.0;

            items.push({
                oz_code: oz,
                name: kurztext,
                menge,
                einheit,
                preis: einheitspreis,
                cost_type: 'MATERIAL'
            });
        }

        return {
            projectInfo,
            items
        };
    }

    /**
     * Erzeugt eine GAEB X84 XML Angebotsdatei aus berechneten Positionen.
     */
    static generateGAEBX84XML(projectName, positionen = []) {
        let itemsXML = '';

        positionen.forEach((pos, idx) => {
            const oz = pos.oz_code || `01.01.${String(idx + 1).padStart(4, '0')}`;
            const menge = parseFloat(pos.menge) || 0;
            const ep = parseFloat(pos.preis) || 0;
            const gp = menge * ep;
            const name = GAEBEngine.escapeXML(pos.name || `Position ${oz}`);
            const einheit = GAEBEngine.escapeXML(pos.einheit || 'Stk.');

            itemsXML += `
        <Item RNoIndex="${idx + 1}">
          <OZ>${oz}</OZ>
          <Qty>${menge.toFixed(3)}</Qty>
          <QU>${einheit}</QU>
          <Description>${name}</Description>
          <UP>${ep.toFixed(2)}</UP>
          <IT>${gp.toFixed(2)}</IT>
        </Item>`;
        });

        return `<?xml version="1.0" encoding="UTF-8"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/200407">
  <GAEBInfo>
    <DP>X84</DP>
    <Date>${new Date().toISOString().split('T')[0]}</Date>
  </GAEBInfo>
  <PrjInfo>
    <PrjName>${GAEBEngine.escapeXML(projectName || 'Bauprojekt')}</PrjName>
  </PrjInfo>
  <Award>
    <BoQ>
      <BoQBody>${itemsXML}
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
