const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
});
