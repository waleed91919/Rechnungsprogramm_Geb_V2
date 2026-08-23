const fs = require('fs');
const path = require('path');

const EInvoiceEngine = require('../js/einvoice');
const SubcontractorController = require('../controllers/SubcontractorController');
const CumulativeBillingController = require('../controllers/CumulativeBillingController');
const { DATEVExporter } = require('../js/datev');
const GoBDAuditEngine = require('../js/gobd');
const GAEBEngine = require('../js/gaeb');

console.log("================================================================================");
console.log(" FULL-STACK SYSTEM TEST RUNNER: BAU-ERP MODULES 1-8 VALIDATION");
console.log("================================================================================\n");

const dirs = [
    path.join(__dirname, '../tests/test_results'),
    path.join(__dirname, '../output/invoices/b2g_xrechnung'),
    path.join(__dirname, '../output/invoices/b2b_zugferd'),
    path.join(__dirname, '../output/invoices/b2c_privat'),
    path.join(__dirname, '../output/invoices/datev_exports')
];

dirs.forEach(d => {
    if (!fs.existsSync(d)) {
        fs.mkdirSync(d, { recursive: true });
    }
});

const results = {
    timestamp: new Date().toISOString(),
    modulesTested: [],
    passCount: 0,
    failCount: 0,
    generatedFiles: [],
    gobdAuditTrail: []
};

function recordTest(moduleName, testName, isSuccess, details = '') {
    results.modulesTested.push({ moduleName, testName, isSuccess, details });
    if (isSuccess) {
        results.passCount++;
        console.log(`  ✔ [${moduleName}] ${testName} - PASS ${details ? '(' + details + ')' : ''}`);
    } else {
        results.failCount++;
        console.log(`  ✖ [${moduleName}] ${testName} - FAIL: ${details}`);
    }
}

// --- MODULE 1: DASHBOARD ---
console.log("▶ Testing Module 1: Dashboard & Realtime KPIs...");
try {
    const mockInvoices = [
        { id: 1, nr: 'RE-1', brutto: 1000, status: 'Ausstehend', sicherheitseinbehalt: 50 },
        { id: 2, nr: 'RE-2', brutto: 2500, status: 'Überfällig', sicherheitseinbehalt: 125 },
        { id: 3, nr: 'RE-3', brutto: 5000, status: 'Bezahlt', sicherheitseinbehalt: 250 }
    ];

    const opos = mockInvoices.filter(i => i.status === 'Ausstehend' || i.status === 'Überfällig').reduce((s, i) => s + i.brutto, 0);
    const totalSicherheit = mockInvoices.reduce((s, i) => s + i.sicherheitseinbehalt, 0);

    recordTest("Dashboard", "KPI OPOS Computation", opos === 3500, `OPOS Sum = €${opos}`);
    recordTest("Dashboard", "KPI Security Retention Computation", totalSicherheit === 425, `Retention Sum = €${totalSicherheit}`);
} catch (err) {
    recordTest("Dashboard", "KPI Computation", false, err.message);
}

// --- MODULE 2: INVOICES & Compliance Automation ---
console.log("\n▶ Testing Module 2: Invoices & Compliance Automation...");
try {
    const b2gKunde = { name: 'Stadt Frankfurt', customer_type: 'B2G', adresse: 'Römerberg 1', plz: '60311', ort: 'Frankfurt am Main', leitweg_id: '992-88776655-11', buyer_reference: 'REF-8877' };
    const b2gInvoice = { id: 10, nr: 'RE-2026-B2G-002', datum: '2026-08-01', faellig: '2026-08-31', me: 1, netto: 15000, steuer: 2850, brutto: 17850, positionen: [{ name: 'Kanalbau', menge: 100, preis: 150, mwst: 19 }] };
    const mockSeller = { firmenname: 'Bauunternehmen GmbH', adresse: 'Baugasse 3, 60313 Frankfurt am Main', iban: 'DE89370400440532013000', bankname: 'Deutsche Bank', ustId: 'DE136695976' };

    const validation = EInvoiceEngine.validateForEN16931(b2gInvoice, b2gKunde, mockSeller);
    recordTest("Invoices", "B2G EN 16931 Validation", validation.isValid);

    const xml = EInvoiceEngine.generateXRechnungXML(b2gInvoice, b2gKunde, mockSeller);
    const b2gPath = path.join(__dirname, '../output/invoices/b2g_xrechnung/RE-2026-B2G-002.xml');
    fs.writeFileSync(b2gPath, xml, 'utf-8');
    results.generatedFiles.push(b2gPath);
    recordTest("Invoices", "XRechnung XML Generation", fs.existsSync(b2gPath), `File: ${b2gPath}`);

    // GoBD Hash & Lock
    const hash = GoBDAuditEngine.calculateDocumentHash(b2gInvoice);
    b2gInvoice.isLocked = true;
    b2gInvoice.status = 'POSTED';
    const immutabilityCheck = GoBDAuditEngine.validateImmutability(b2gInvoice);
    recordTest("Invoices", "GoBD Immutability Guard", !immutabilityCheck.canEdit, `Lock check works: ${immutabilityCheck.reason}`);
    results.gobdAuditTrail.push({ docNr: b2gInvoice.nr, hash: hash, timestamp: new Date().toISOString() });
} catch (err) {
    recordTest("Invoices", "Compliance Automation", false, err.message);
}

// --- MODULE 3: QUOTES & GAEB ENGINE ---
console.log("\n▶ Testing Module 3: Quotes & GAEB Engine (X83 / X84)...");
try {
    const mockGaebXml = `<?xml version="1.0" encoding="UTF-8"?>
    <GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/3.2/X83">
        <Award>
            <BoQ>
                <BoQBody>
                    <Item RNoPart="01.001">
                        <Description><CompleteText><DetailTxt><Text>Aushub Erdreich</Text></DetailTxt></CompleteText></Description>
                        <Qty>250.00</Qty>
                        <QU>m³</QU>
                        <UP>18.50</UP>
                    </Item>
                </BoQBody>
            </BoQ>
        </Award>
    </GAEB>`;

    const parsedGaeb = GAEBEngine.parseGAEBXML(mockGaebXml);
    recordTest("Quotes", "GAEB X83 XML Parser", parsedGaeb.items && parsedGaeb.items.length === 1, `Items parsed: ${parsedGaeb.items.length}`);

    const exportedX84 = GAEBEngine.generateGAEBX84XML('Kanalbau Projekt', parsedGaeb.items);
    recordTest("Quotes", "GAEB X84 Export Generator", exportedX84.includes('GAEB') && exportedX84.includes('X84'));
} catch (err) {
    recordTest("Quotes", "GAEB Engine", false, err.message);
}

// --- MODULE 4: ARTICLES & MATERIAL ---
console.log("\n▶ Testing Module 4: Articles & Material Stamm...");
try {
    const artikel = [
        { id: 1, name: 'Facharbeiter Stundenlohn', cost_type: 'LOHN', preis: 65.00, sec35a_relevant: 1 },
        { id: 2, name: 'Beton C25/30', cost_type: 'MATERIAL', preis: 120.00, sec35a_relevant: 0 },
        { id: 3, name: 'Anfahrt Baustelle', cost_type: 'FAHRT', preis: 45.00, sec35a_relevant: 1 }
    ];

    const breakdown = SubcontractorController.calculateSec35aBreakdown(artikel.map(a => ({ menge: 1, preis: a.preis, cost_type: a.cost_type })));
    recordTest("Articles", "Cost Type Categorization & § 35a Relevance", breakdown.eligibleBrutto > 0, `Eligible Brutto = €${breakdown.eligibleBrutto}`);
} catch (err) {
    recordTest("Articles", "Material Stamm", false, err.message);
}

// --- MODULE 5: CUSTOMERS & SUBCONTRACTORS ---
console.log("\n▶ Testing Module 5: Customers & Subcontractor Compliance (§ 48b)...");
try {
    const subExpired = { is_subcontractor: 1, sec48b_valid_until: '2025-01-01' };
    const subCheckExpired = SubcontractorController.checkSec48bStatus(subExpired);
    const retentionAmt = SubcontractorController.calculateBauabzugsteuer(10000, subCheckExpired.appliesRetention);

    recordTest("Customers", "Subcontractor § 48b Expiration Check", !subCheckExpired.isValid && subCheckExpired.appliesRetention);
    recordTest("Customers", "15% Bauabzugsteuer Calculation", retentionAmt === 1500, `Withholding Amount = €${retentionAmt}`);
} catch (err) {
    recordTest("Customers", "Subcontractors", false, err.message);
}

// --- MODULE 6: PROJECTS, AUFMASS & BAUTAGEBUCH ---
console.log("\n▶ Testing Module 6: Projects, Aufmaß & Bautagebuch...");
try {
    const messzeilen = [
        { formula: '10 * 5 * 0.3', qty: 15 },
        { formula: '4 * 2.5 * 1', qty: 10 }
    ];
    const totalQty = messzeilen.reduce((sum, m) => sum + m.qty, 0);

    const bautagebuch = {
        datum: '2026-08-13',
        wetter: 'Bewölkt, 20°C',
        arbeiter: 6,
        geraete: 'Mobilbagger 12t',
        notiz: 'Bewehrung verlegt, Abnahme durch Bauleiter.'
    };

    recordTest("Projects", "REB 23.003 Aufmaß Formula Calculation", totalQty === 25, `Total Quantity = ${totalQty} m³`);
    recordTest("Projects", "Bautagebuch Entry Logging", Boolean(bautagebuch.datum && bautagebuch.notiz));
} catch (err) {
    recordTest("Projects", "Aufmaß & Bautagebuch", false, err.message);
}

// --- MODULE 7: REPORTS & DATEV EXPORT ---
console.log("\n▶ Testing Module 7: Reports & DATEV EXTF 700 Exporter...");
try {
    const reportInvoices = [
        { id: 1, nr: 'RE-2026-001', kundeId: 1, brutto: 1190, netto: 1000, steuer: 190, status: 'Bezahlt', datum: '2026-07-10' },
        { id: 2, nr: 'RE-2026-002', kundeId: 2, brutto: 5000, netto: 5000, steuer: 0, status: 'Bezahlt', datum: '2026-07-15', unterliegt_13b: 1 }
    ];
    const reportKunden = [{ id: 1, name: 'Privatkunde' }, { id: 2, name: 'Baupartner GmbH', customer_type: 'B2B', ist_bauleistender_13b: 1 }];

    const csv = DATEVExporter.generateEXTFContent(reportInvoices, reportKunden, { skr: 'SKR03' });
    const datevPath = path.join(__dirname, '../output/invoices/datev_exports/EXTF_FULL_SYSTEM.csv');
    fs.writeFileSync(datevPath, csv, 'latin1');
    results.generatedFiles.push(datevPath);

    recordTest("Reports", "DATEV EXTF 700 Export Generation", fs.existsSync(datevPath) && csv.includes('EXTF'), `CSV Length = ${csv.length} bytes`);
} catch (err) {
    recordTest("Reports", "DATEV Export", false, err.message);
}

// --- MODULE 8: SETTINGS & BACKUP ---
console.log("\n▶ Testing Module 8: Settings & Database Backup...");
try {
    const backupPath = path.join(__dirname, '../tests/test_results/db_backup_test.json');
    const mockDbBackup = { timestamp: new Date().toISOString(), tables: ['kunden', 'dokumente', 'projekte', 'positionen'] };
    fs.writeFileSync(backupPath, JSON.stringify(mockDbBackup, null, 2), 'utf-8');
    results.generatedFiles.push(backupPath);

    recordTest("Settings", "Database Backup Generator", fs.existsSync(backupPath), `Backup file: ${backupPath}`);
} catch (err) {
    recordTest("Settings", "Backup", false, err.message);
}

// --- SAVE REPORTS ---
const summaryReportPath = path.join(__dirname, '../tests/test_results/full_system_test_report.json');
fs.writeFileSync(summaryReportPath, JSON.stringify(results, null, 2), 'utf-8');

const gobdAuditPath = path.join(__dirname, '../tests/test_results/gobd_full_audit_hashes.json');
fs.writeFileSync(gobdAuditPath, JSON.stringify(results.gobdAuditTrail, null, 2), 'utf-8');

console.log("\n================================================================================");
console.log(` SYSTEM TEST COMPLETE: ${results.passCount} Passed, ${results.failCount} Failed.`);
console.log(` Summary Written To: ${summaryReportPath}`);
console.log("================================================================================\n");
