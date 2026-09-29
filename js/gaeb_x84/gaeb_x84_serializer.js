/**
 * js/gaeb_x84/gaeb_x84_serializer.js
 * 
 * Erzeugt valides XML für GAEB 3.2 oder 3.3 gemäß den offiziellen Schemadateien:
 * - GAEB 3.3: tests/schemas/gaeb_da_xml_3.3/GAEB_DA_XML_84_3.3_2021-05.xsd (Namespace: http://www.gaeb.de/GAEB_DA_XML/DA84/3.3)
 * - GAEB 3.2: tests/schemas/gaeb_da_xml_3.2/GAEB_DA_XML_84_3.2_2013-10.xsd (Namespace: http://www.gaeb.de/GAEB_DA_XML/DA84/3.2)
 */

'use strict';

/**
 * Sicheres XML-Escaping der 5 vordefinierten XML-Entities.
 * 
 * @param {string|number} str 
 * @returns {string}
 */
function escapeXml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Serialisiert eine einzelne Position (<Item>) nach X84.
 * 
 * @param {Object} item 
 * @param {string} version '3.2' | '3.3'
 * @param {string} indent 
 * @returns {string}
 */
function serializeItem(item, version, indent = '          ') {
    const lines = [];
    lines.push(`${indent}<Item ID="${escapeXml(item.id)}" RNoPart="${escapeXml(item.rnoPart)}">`);

    if (item.qty !== null && item.qty !== undefined) {
        lines.push(`${indent}  <Qty>${item.qty}</Qty>`);
    }

    if (item.up !== null && item.up !== undefined) {
        lines.push(`${indent}  <UP>${item.up}</UP>`);
    }

    if (item.it !== null && item.it !== undefined) {
        lines.push(`${indent}  <IT>${item.it}</IT>`);
    }

    // BiReq Antworten (<Description>)
    if (Array.isArray(item.biReqAnswers) && item.biReqAnswers.length > 0) {
        lines.push(`${indent}  <Description>`);
        lines.push(`${indent}    <CompleteText>`);
        lines.push(`${indent}      <DetailTxt>`);

        if (version === '3.3') {
            lines.push(`${indent}        <Text>`);
            item.biReqAnswers.forEach(br => {
                lines.push(`${indent}          <p>`);
                lines.push(`${indent}            <TextComplement MarkLbl="${escapeXml(br.markLbl)}" Kind="Bidder">`);
                lines.push(`${indent}              <ComplBody>`);
                lines.push(`${indent}                <p><span>${escapeXml(br.answerValue)}</span></p>`);
                lines.push(`${indent}              </ComplBody>`);
                lines.push(`${indent}            </TextComplement>`);
                lines.push(`${indent}          </p>`);
            });
            lines.push(`${indent}        </Text>`);
        } else {
            // Version 3.2: TextComplement direkt unter DetailTxt!
            item.biReqAnswers.forEach(br => {
                lines.push(`${indent}        <TextComplement MarkLbl="${escapeXml(br.markLbl)}" Kind="Bidder">`);
                lines.push(`${indent}          <ComplBody>`);
                lines.push(`${indent}            <p><span>${escapeXml(br.answerValue)}</span></p>`);
                lines.push(`${indent}          </ComplBody>`);
                lines.push(`${indent}        </TextComplement>`);
            });
        }

        lines.push(`${indent}      </DetailTxt>`);
        lines.push(`${indent}    </CompleteText>`);
        lines.push(`${indent}  </Description>`);
    }

    // Bieter-Kommentar / Notizen (<BidComm>)
    if (item.notes) {
        lines.push(`${indent}  <BidComm>`);
        lines.push(`${indent}    <p><span>${escapeXml(item.notes)}</span></p>`);
        lines.push(`${indent}  </BidComm>`);
    }

    lines.push(`${indent}</Item>`);
    return lines.join('\n');
}

/**
 * Serialisiert eine Kategorie (<BoQCtgy>) rekursiv samt Unterkategorien oder Itemlist
 * und schließt mit <Totals><Total>...</Total></Totals> ab.
 * 
 * @param {Object} cat 
 * @param {string} version '3.2' | '3.3'
 * @param {string} indent 
 * @returns {string}
 */
function serializeCategory(cat, version, indent = '      ') {
    const lines = [];
    lines.push(`${indent}<BoQCtgy ID="${escapeXml(cat.id)}" RNoPart="${escapeXml(cat.rnoPart)}">`);

    const hasSubCats = Array.isArray(cat.subCategories) && cat.subCategories.length > 0;
    const hasItems = Array.isArray(cat.items) && cat.items.length > 0;

    if (hasSubCats || hasItems) {
        lines.push(`${indent}  <BoQBody>`);
        if (hasSubCats) {
            cat.subCategories.forEach(subCat => {
                lines.push(serializeCategory(subCat, version, `${indent}    `));
            });
        } else if (hasItems) {
            lines.push(`${indent}    <Itemlist>`);
            cat.items.forEach(item => {
                lines.push(serializeItem(item, version, `${indent}      `));
            });
            lines.push(`${indent}    </Itemlist>`);
        }
        lines.push(`${indent}  </BoQBody>`);
    }

    lines.push(`${indent}  <Totals>`);
    lines.push(`${indent}    <Total>${cat.totalFormatted}</Total>`);
    lines.push(`${indent}  </Totals>`);
    lines.push(`${indent}</BoQCtgy>`);

    return lines.join('\n');
}

/**
 * Serialisiert das gesamte X84-Modell in einen wohlgeformten und schemakonformen XML-String.
 * 
 * @param {Object} model - Vom Mapper erstelltes X84-Modell
 * @returns {string} XML-String
 */
function serializeX84XML(model) {
    if (!model || typeof model !== 'object') {
        throw new Error('Ungültiges X84-Modell übergeben.');
    }

    const version = String(model.gaebVersion || '3.3').trim();
    if (version !== '3.2' && version !== '3.3') {
        throw new Error(`Nicht unterstützte GAEB-Version: "${version}". Unterstützt werden nur 3.2 und 3.3.`);
    }

    const namespace = (version === '3.2')
        ? 'http://www.gaeb.de/GAEB_DA_XML/DA84/3.2'
        : 'http://www.gaeb.de/GAEB_DA_XML/DA84/3.3';

    const versDate = (version === '3.2') ? '2013-10' : '2021-05';

    const lines = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(`<GAEB xmlns="${namespace}">`);

    // 1. GAEBInfo
    lines.push('  <GAEBInfo>');
    lines.push(`    <Version>${version}</Version>`);
    lines.push(`    <VersDate>${versDate}</VersDate>`);
    lines.push(`    <Date>${escapeXml(model.date)}</Date>`);
    lines.push(`    <Time>${escapeXml(model.time)}</Time>`);
    lines.push(`    <ProgSystem>${escapeXml(model.progSystem || 'W-Link ERP')}</ProgSystem>`);
    lines.push(`    <ProgName>${escapeXml(model.progName || 'W-Link GAEB Core')}</ProgName>`);
    lines.push('  </GAEBInfo>');

    // 2. PrjInfo
    lines.push('  <PrjInfo>');
    lines.push(`    <NamePrj>${escapeXml(model.project?.namePrj || 'Projekt')}</NamePrj>`);
    if (version === '3.3' && model.project?.prjId) {
        lines.push(`    <PrjID>${escapeXml(model.project.prjId)}</PrjID>`);
    }
    if (model.project?.lblPrj) {
        lines.push(`    <LblPrj>${escapeXml(model.project.lblPrj)}</LblPrj>`);
    }
    lines.push('  </PrjInfo>');

    // 3. Award
    lines.push('  <Award>');
    lines.push('    <DP>84</DP>');

    // 3.1 AwardInfo
    lines.push('    <AwardInfo>');
    if (model.award?.boqId) {
        lines.push(`      <BoQID>${escapeXml(model.award.boqId)}</BoQID>`);
    }
    lines.push(`      <Cur>${escapeXml(model.award?.cur || 'EUR')}</Cur>`);
    if (model.award?.curLbl) {
        lines.push(`      <CurLbl>${escapeXml(model.award.curLbl)}</CurLbl>`);
    }
    if (model.award?.bidDate) {
        lines.push(`      <BidDate>${escapeXml(model.award.bidDate)}</BidDate>`);
    }
    lines.push('    </AwardInfo>');

    // 3.2 CTR (Bieter / Auftragnehmer)
    const bidder = model.award?.bidder || {};
    lines.push('    <CTR>');
    lines.push('      <Address>');
    lines.push(`        <Name1>${escapeXml(bidder.name1 || '')}</Name1>`);
    lines.push(`        <Street>${escapeXml(bidder.street || '')}</Street>`);
    lines.push(`        <PCode>${escapeXml(bidder.pcode || '')}</PCode>`);
    lines.push(`        <City>${escapeXml(bidder.city || '')}</City>`);
    lines.push('      </Address>');
    lines.push('    </CTR>');

    // 3.3 BoQ (Leistungsverzeichnis)
    const boq = model.award?.boq || {};
    lines.push(`    <BoQ ID="${escapeXml(boq.id || 'BOQ_1')}">`);

    // 3.3.1 BoQInfo
    const boqInfo = boq.boqInfo || {};
    lines.push('      <BoQInfo>');
    lines.push(`        <Name>${escapeXml(boqInfo.name || 'LV')}</Name>`);

    if (Array.isArray(boqInfo.boqBkdn)) {
        boqInfo.boqBkdn.forEach(b => {
            lines.push('        <BoQBkdn>');
            lines.push(`          <Type>${escapeXml(b.type)}</Type>`);
            if (b.lbl) {
                lines.push(`          <LblBoQBkdn>${escapeXml(b.lbl)}</LblBoQBkdn>`);
            }
            lines.push(`          <Length>${b.length}</Length>`);
            lines.push(`          <Num>${escapeXml(b.num)}</Num>`);
            lines.push('        </BoQBkdn>');
        });
    }

    lines.push('        <Totals>');
    lines.push(`          <Total>${boqInfo.total || '0.00'}</Total>`);
    lines.push('        </Totals>');
    lines.push('      </BoQInfo>');

    // 3.3.2 BoQBody
    lines.push('      <BoQBody>');
    if (Array.isArray(boq.categories)) {
        boq.categories.forEach(cat => {
            lines.push(serializeCategory(cat, version, '        '));
        });
    }
    lines.push('      </BoQBody>');

    lines.push('    </BoQ>');
    lines.push('  </Award>');
    lines.push('</GAEB>');
    lines.push(''); // abschließender Zeilenumbruch

    return lines.join('\n');
}

module.exports = {
    serializeX84XML,
    serializeCategory,
    serializeItem,
    escapeXml
};
