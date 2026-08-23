const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');
const { JSDOM } = require('jsdom');

function assertXmlWellFormed(xmlContent, label) {
    let documentElement;
    try {
        const dom = new JSDOM(xmlContent, { contentType: 'text/xml' });
        documentElement = dom.window.document.documentElement;
    } catch (err) {
        assert.fail(`${label}: XML ist nicht wohlgeformt - ${err.message}`);
        return;
    }
    assert.ok(
        documentElement && /CrossIndustryInvoice$/.test(documentElement.tagName),
        `${label}: Wurzelelement rsm:CrossIndustryInvoice fehlt oder XML unvollständig geparst (Tag: ${documentElement && documentElement.tagName})`
    );
}

// XMP-Fallback: falls der /Metadata-Stream Flate-komprimiert ist (Plan 13, Kap. 7.1 Z2)
function extractSearchText(buf) {
    const raw = buf.toString('latin1');
    const parts = [raw];
    const streamRe = /stream\r?\n/g;
    let m;
    while ((m = streamRe.exec(raw)) !== null) {
        const start = m.index + m[0].length;
        const end = raw.indexOf('endstream', start);
        if (end === -1) continue;
        try {
            parts.push(zlib.inflateSync(buf.subarray(start, end)).toString('latin1'));
        } catch (_e) {
            continue;
        }
    }
    return parts.join('\n');
}

// Kern-Strukturchecks wie tests/zugferd.test.js Z1/Z2 auf echte Hybrid-PDFs
function assertZugferdCoreStructure(buf, expectedFileName, label) {
    assert.match(
        buf.slice(0, 8).toString('latin1'),
        /^%PDF-\d\.\d$/,
        `${label}: ungültiger PDF-Header`
    );

    const raw = buf.toString('latin1');
    // Negativ-Lookahead: /AF soll nicht auf /AFRelationship aufschlagen
    assert.ok(/\/AF(?![A-Za-z])/.test(raw), `${label}: Katalog-Eintrag /AF fehlt`);
    assert.ok(raw.includes('/EmbeddedFiles'), `${label}: /Names /EmbeddedFiles fehlt`);
    assert.ok(
        raw.includes('/AFRelationship /Alternative'),
        `${label}: /AFRelationship /Alternative fehlt`
    );

    let fileNameCount = 0;
    let idx = raw.indexOf(expectedFileName);
    while (idx !== -1) {
        fileNameCount++;
        idx = raw.indexOf(expectedFileName, idx + expectedFileName.length);
    }
    assert.ok(fileNameCount >= 2, `${label}: ${expectedFileName} muss in FileSpec UND Names-Baum erscheinen`);
    assert.ok(raw.trimEnd().endsWith('%%EOF'), `${label}: EOF-Markierung %%EOF fehlt`);

    const text = extractSearchText(buf);
    assert.ok(
        /pdfaid:part>3</.test(text) || /pdfaid:part\s*=\s*["']3["']/.test(text),
        `${label}: pdfaid:part = 3 fehlt im XMP`
    );
    assert.ok(text.includes('<fx:DocumentType>INVOICE</fx:DocumentType>'), `${label}: fx:DocumentType != INVOICE`);
    assert.ok(
        text.includes(`<fx:DocumentFileName>${expectedFileName}</fx:DocumentFileName>`),
        `${label}: fx:DocumentFileName passt nicht zum Attachment-Namen`
    );
    assert.ok(text.includes('pdfaExtension:schemas'), `${label}: PDF/A Extension-Schema-Deklaration fehlt`);
}

test('End-to-End Pipeline & Invoice Document Generation', async () => {
    // Run generate_and_test script
    const scriptPath = path.join(__dirname, '../scripts/generate_and_test.js');
    const output = execSync(`node "${scriptPath}"`, { encoding: 'utf-8' });
    
    assert.ok(output.includes('PIPELINE COMPLETE'), 'Output should state PIPELINE COMPLETE');

    // Verify created files
    const b2gXmlPath = path.join(__dirname, '../output/invoices/b2g_xrechnung/RE-2026-B2G-001.xml');
    const b2bAb1Path = path.join(__dirname, '../output/invoices/b2b_zugferd/RE-2026-B2B-AB1.pdf');
    const b2bAb2Path = path.join(__dirname, '../output/invoices/b2b_zugferd/RE-2026-B2B-AB2.pdf');
    const b2cPdfPath = path.join(__dirname, '../output/invoices/b2c_privat/RE-2026-B2C-001.pdf');
    const datevCsvPath = path.join(__dirname, '../output/invoices/datev_exports/EXTF_2026_JULI.csv');
    const gobdJsonPath = path.join(__dirname, '../tests/test_results/gobd_audit_hashes.json');

    assert.ok(fs.existsSync(b2gXmlPath), 'B2G XRechnung XML should exist');
    assert.ok(fs.existsSync(b2bAb1Path), 'B2B 1. Abschlagsrechnung PDF should exist');
    assert.ok(fs.existsSync(b2bAb2Path), 'B2B 2. Abschlagsrechnung PDF should exist');
    assert.ok(fs.existsSync(b2cPdfPath), 'B2C Privatkunde PDF should exist');
    assert.ok(fs.existsSync(datevCsvPath), 'DATEV EXTF 700 CSV should exist');
    assert.ok(fs.existsSync(gobdJsonPath), 'GoBD Audit Hashes JSON should exist');

    const xmlContent = fs.readFileSync(b2gXmlPath, 'utf-8');
    assertXmlWellFormed(xmlContent, 'RE-2026-B2G-001.xml');
    assert.ok(xmlContent.includes('991-12345678-12'), 'XRechnung XML must contain Leitweg-ID');
    assert.ok(
        /<ram:BuyerReference>991-12345678-12<\/ram:BuyerReference>/.test(xmlContent),
        'BT-10 BuyerReference muss die Leitweg-ID tragen (Vorrang vor buyer_reference)'
    );
    assert.ok(!xmlContent.includes('AB-45001'), 'buyer_reference darf nicht vor der Leitweg-ID in BT-10 landen');

    // BG-23 Steueraufschlüsselung: 25000 netto, 19% => 4750.00
    assert.ok(xmlContent.includes('<ram:CalculatedAmount>4750.00</ram:CalculatedAmount>'), 'BG-23 CalculatedAmount 4750.00 fehlt');
    assert.ok(xmlContent.includes('<ram:BasisAmount>25000.00</ram:BasisAmount>'), 'BG-23 BasisAmount 25000.00 fehlt');
    assert.ok(xmlContent.includes('<ram:CategoryCode>S</ram:CategoryCode>'), 'BG-23 CategoryCode S fehlt');

    // BG-5/BG-8 Adressen mit CountryID
    const countryCount = (xmlContent.match(/<ram:CountryID>DE<\/ram:CountryID>/g) || []).length;
    assert.ok(countryCount >= 2, `Seller+Buyer CountryID DE erwartet, gefunden: ${countryCount}`);
    assert.ok(xmlContent.includes('<ram:CityName>Berlin</ram:CityName>'), 'CityName fehlt');
    assert.ok(!xmlContent.includes('DE000000000'), 'Fake-USt-IdNr DE000000000 ist verboten');

    // Einheits-Mapping und Fälligkeit
    assert.ok(xmlContent.includes('unitCode="MTK"'), 'Einheit m² muss auf MTK gemappt werden');
    assert.ok(!xmlContent.includes('unitCode="m²"'), 'Ungemappte Einheit im unitCode-Attribut');
    assert.ok(/<ram:DueDateDateTime>\s*<udt:DateTimeString format="102">20260731<\/udt:DateTimeString>/s.test(xmlContent), 'DueDate (BT-9) 2026-07-31 fehlt');
    assert.ok(/<ram:SpecifiedTradePaymentTerms>[\s\S]*<ram:DueDateDateTime>/s.test(xmlContent), 'SpecifiedTradePaymentTerms fehlt');

    // Summenkonsistenz im Artefakt
    assert.ok(xmlContent.includes('<ram:LineTotalAmount>25000.00</ram:LineTotalAmount>'), 'Header LineTotalAmount falsch');
    assert.ok(xmlContent.includes('<ram:TaxBasisTotalAmount>25000.00</ram:TaxBasisTotalAmount>'), 'TaxBasisTotalAmount falsch');
    assert.ok(xmlContent.includes('<ram:GrandTotalAmount>29750.00</ram:GrandTotalAmount>'), 'GrandTotalAmount falsch');
    assert.ok(xmlContent.includes('<ram:DuePayableAmount>29750.00</ram:DuePayableAmount>'), 'DuePayableAmount falsch');

    const gobdContent = JSON.parse(fs.readFileSync(gobdJsonPath, 'utf-8'));
    assert.ok(Array.isArray(gobdContent) && gobdContent.length > 0, 'GoBD audit log must contain hashes');

    assertZugferdCoreStructure(fs.readFileSync(b2bAb1Path), 'factur-x.xml', 'RE-2026-B2B-AB1.pdf');
    assertZugferdCoreStructure(fs.readFileSync(b2bAb2Path), 'factur-x.xml', 'RE-2026-B2B-AB2.pdf');

    // Eingebettete CII-XML in den ZUGFeRD-PDFs muss wohlgeformt und inhaltlich korrekt sein
    const { PDFDocument } = require('@cantoo/pdf-lib');
    for (const [pdfPath, label] of [[b2bAb1Path, 'RE-2026-B2B-AB1.pdf'], [b2bAb2Path, 'RE-2026-B2B-AB2.pdf']]) {
        const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfPath), { ignoreEncryption: true });
        const attachment = pdfDoc.getAttachments().find((a) => a.name === 'factur-x.xml');
        assert.ok(attachment, `${label}: Attachment factur-x.xml fehlt`);
        const embeddedXml = Buffer.from(attachment.data).toString('utf-8');
        assertXmlWellFormed(embeddedXml, `${label} (embedded factur-x.xml)`);
        assert.ok(embeddedXml.includes('<ram:CategoryCode>AE</ram:CategoryCode>'), `${label}: AE-Kategorie für § 13b fehlt`);
        assert.ok(embeddedXml.includes('<ram:ExemptionReasonCode>VTEX</ram:ExemptionReasonCode>'), `${label}: VTEX fehlt`);
        assert.ok(embeddedXml.includes('<ram:TotalPrepaidAmount>'), `${label}: TotalPrepaidAmount fehlt`);
    }
});
