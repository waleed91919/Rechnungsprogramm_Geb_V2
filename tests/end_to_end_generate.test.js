const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');

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

test('End-to-End Pipeline & Invoice Document Generation', () => {
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
    assert.ok(xmlContent.includes('AB-45001') || xmlContent.includes('991-12345678-12'), 'XRechnung XML must contain Buyer Reference / Leitweg-ID');

    const gobdContent = JSON.parse(fs.readFileSync(gobdJsonPath, 'utf-8'));
    assert.ok(Array.isArray(gobdContent) && gobdContent.length > 0, 'GoBD audit log must contain hashes');

    assertZugferdCoreStructure(fs.readFileSync(b2bAb1Path), 'factur-x.xml', 'RE-2026-B2B-AB1.pdf');
    assertZugferdCoreStructure(fs.readFileSync(b2bAb2Path), 'factur-x.xml', 'RE-2026-B2B-AB2.pdf');
});
