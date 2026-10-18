const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { getElectronPath } = require('./test_electron_helper');
const Money = require('../js/money');
const CumulativeBillingController = require('../controllers/CumulativeBillingController');
const InvoiceController = require('../controllers/InvoiceController');
const WorkflowController = require('../controllers/WorkflowController');
const { addBauumlagePosition } = require('../js/editor/editor-positions');
const EInvoiceValidation = require('../js/einvoice/einvoice-validation');

const IS_ELECTRON_AS_NODE = !!process.versions.electron;
const RUN_INNER_MARKER = 'ARCHITEKTEN_KUERZUNG_INNER_RUN';

function canLoadBetterSqlite() {
    try {
        const DbCtor = require('better-sqlite3');
        const probe = new DbCtor(':memory:');
        probe.close();
        return true;
    } catch (_e) {
        return false;
    }
}

// -----------------------------------------------------------------------------
// PURE UNIT TESTS (DB-frei)
// -----------------------------------------------------------------------------

test('Prüfung 3: GU-Bauumlage - Berechnung mit Money SSoT und ZUGFeRD-Validierung', () => {
    // Mock global state for addBauumlagePosition
    global.state = {
        currentRechnungPositionen: [
            {
                id: 1,
                name: 'Estricharbeiten Halle A',
                menge: 100,
                einheit: 'm²',
                preis: 100.00,
                mwst: 19,
                rabatt: 0,
                positionstyp: 'NORMAL',
                in_endsumme_enthalten: 1
            }
        ]
    };

    // Zwischensumme = 10.000 €
    // Test 1: Baustrom / Bauwasser (-0,5 %)
    const pos1 = addBauumlagePosition('strom_wasser', 0.5);
    assert.ok(pos1, 'Position sollte erzeugt werden');
    assert.equal(pos1.menge, 1);
    assert.equal(pos1.einheit, 'psch');
    // 0,5 % von 10.000 € = 50,00 € -> Einzelpreis -50.00
    assert.equal(pos1.preis, -50.00);
    assert.equal(pos1.mwst, 19);
    assert.match(pos1.name, /Baustrom \/ Bauwasser/);

    // Test 2: Berechne Totals mit InvoiceController
    const totals = InvoiceController.calculateTotals({
        positionen: global.state.currentRechnungPositionen,
        mode: 'netto',
        isGlobal13b: false
    });

    // 10.000 € - 50 € = 9.950 € Netto
    assert.equal(totals.positionenNetto, 9950.00);
    assert.equal(totals.nettoNachRabatt, 9950.00);
    assert.equal(totals.totalTax, 1890.50); // 19% von 9950 = 1890.50
    assert.equal(totals.bruttoNachRabatt, 11840.50);

    // Test 3: E-Rechnungs-Validierung nach EN 16931
    const invoiceForValidation = {
        nr: 'RE-2026-GU-001',
        datum: '2026-10-18',
        faellig: '2026-11-01',
        netto: totals.nettoNachRabatt,
        steuer: totals.totalTax,
        brutto: totals.bruttoNachRabatt,
        positionen: global.state.currentRechnungPositionen,
        eingabemodus: 'netto'
    };
    const mockCustomer = {
        name: 'GU Generalbau AG',
        customer_type: 'B2B',
        strasse: 'Bauallee 1',
        plz: '10115',
        ort: 'Berlin',
        land: 'DE',
        vat_id: 'DE123456789'
    };
    const mockSeller = {
        firmenname: 'Meisterbetrieb Bau GmbH',
        adresse: 'Handwerkerstr. 10',
        plz: '50667',
        ort: 'Köln',
        land: 'DE',
        bankname: 'Volksbank Köln',
        iban: 'DE89370400440532013000',
        bic: 'GENODED1VKX',
        ustId: 'DE987654321'
    };

    const valResult = EInvoiceValidation.validateForEN16931(invoiceForValidation, mockCustomer, mockSeller);
    assert.ok(valResult.isValid, `Validierung muss fehlerfrei sein: ${valResult.errors.join(', ')}`);
});

test('Prüfung 2 (Reine Logik): CumulativeBillingController.effectivePreviousNet & 2. Abschlag', () => {
    // 1. AR: fakturiert 10.000 €, aber vom Architekten gekürzt auf 8.000 €
    const inv1 = {
        id: 1,
        nr: 'AR-001',
        netto: 10000.00,
        geprueft_netto: 8000.00,
        kuerzung_grund: 'ARCHITEKTEN_KUERZUNG_KUMULIERT',
        status: 'Bezahlt'
    };

    assert.equal(CumulativeBillingController.effectivePreviousNet(inv1), 8000.00);

    // 2. Abschlag: Gesamtleistung L_2 = 15.000 € Netto
    const calc = CumulativeBillingController.calculateCumulativeInvoice({
        totalPerformanceNet: 15000.00,
        previousInvoices: [inv1],
        vatRate: 19.0,
        securityRetentionRate: 0.0 // Ohne Einbehalt für einfache Prüfung
    });

    // Abzug Vorrechnungen muss 8.000 € sein (nicht 10.000 €)
    assert.equal(calc.totalPreviousBilledNet, 8000.00);
    // Perioden-Netto muss 15.000 - 8.000 = 7.000 € sein!
    assert.equal(calc.currentPeriodNet, 7000.00);
    assert.equal(calc.netto, 7000.00);
    assert.equal(calc.currentPeriodVat, 1330.00); // 19% von 7000 = 1330
    assert.equal(calc.currentPeriodGross, 8330.00);
});

test('WorkflowController.buildSchlussrechnung nutzt geprueft_netto bei gekürzten Vorrechnungen', () => {
    const prevDocs = [
        {
            id: 1,
            nr: 'AR-001',
            netto: 10000.00,
            brutto: 11900.00,
            geprueft_netto: 8000.00,
            kuerzung_grund: 'ARCHITEKTEN_KUERZUNG_KUMULIERT'
        }
    ];

    const mergeRows = [
        { oz_code: '01.01.0010', bezeichnung: 'Fliesen', menge: 200, einheit: 'm²', ep: 100.00, mwst: 19 }
    ];

    const result = WorkflowController.buildSchlussrechnung({ mergeRows, previousDocs: prevDocs });
    assert.equal(result.verrechnungen.length, 1);
    assert.equal(result.verrechnungen[0].vorherige_rechnung_id, 1);
    assert.equal(result.verrechnungen[0].abzugsbetrag_netto, 8000.00);
    assert.equal(result.verrechnungen[0].abzugsbetrag_brutto, 9520.00); // 8000 * 1.19
});

// -----------------------------------------------------------------------------
// DB INTEGRATION TEST (Reconciliation & OPOS mit ARCHITEKTEN_KUERZUNG_KUMULIERT)
// -----------------------------------------------------------------------------

if (!IS_ELECTRON_AS_NODE && !canLoadBetterSqlite()) {
    test('DB-Integration: Architektenkürzung in reconciliation_repo (via Electron-as-Node Runtime)', () => {
        const electronBin = getElectronPath();
        const stdout = execFileSync(
            electronBin,
            [path.join(__filename), `--${RUN_INNER_MARKER}`],
            {
                env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '' },
                encoding: 'utf-8',
                maxBuffer: 64 * 1024 * 1024,
                timeout: 120000
            }
        );
        assert.match(stdout, /ARCHITEKTEN_KUERZUNG_DB_TESTS_PASSED/, 'DB-Integrationstests müssen bestehen');
    });
} else {
    // INNER RUN OR DIRECT NODE EXECUTION
    (async () => {
        process.env.RECHNUNGSPROGRAMM_DB_PATH = path.join(os.tmpdir(), `kuerzung-test-${Date.now()}-${process.pid}.sqlite`);
        const { db, dbAPI } = require('../db.js');

        try {
            console.log('--- START DB INTEGRATION TEST: ARCHITEKTEN_KUERZUNG_KUMULIERT ---');
            
            // 1. Bankkonto anlegen
            const konto = await dbAPI.saveBankKonto({
                kontoname: 'Bau-Geschäftskonto',
                bankname: 'Volksbank Bau',
                iban: 'DE89370400440532013000',
                bic: 'GENODED1VKX',
                kontoinhaber: 'W-Link Bauunternehmung GmbH',
                ist_standard: 1
            });

            // 2. Kunde anlegen
            const kunde = await dbAPI.saveKunde({
                kundennummer: 'K-9901',
                name: 'Bauherr Muster GmbH',
                customer_type: 'B2B',
                strasse: 'Projektstraße 5',
                plz: '50667',
                ort: 'Köln',
                iban: 'DE44500105175407324931'
            });

            // 3. 1. Abschlagsrechnung anlegen: 100 m² à 100 € = 10.000 € Netto, 19% USt = 1.900 €, Brutto = 11.900 €
            const r1Id = await dbAPI.saveDocument({
                type: 'rechnung',
                rechnungsart: 'ABSCHLAG_KUMULIERT',
                nr: 'AR-2026-001',
                datum: '2026-08-01',
                faellig: '2026-08-22',
                kundeId: kunde.id,
                status: 'Ausstehend',
                netto: 10000.00,
                steuer: 1900.00,
                brutto: 11900.00,
                zahlbetrag: 11900.00,
                positionen: [
                    {
                        name: 'Mauerwerk EG',
                        menge: 100,
                        einheit: 'm²',
                        preis: 100.00,
                        mwst: 19,
                        rabatt: 0
                    }
                ]
            });

            // 4. Architekt kürzt auf 80 m² (8.000 € Netto). Kunde überweist 8.000 € Netto + 19% MwSt = 9.520 €
            await dbAPI.importBankTransactions(konto.id, [
                {
                    buchungstag: '2026-08-10',
                    betrag: 9520.00,
                    partner_name: 'Bauherr Muster GmbH',
                    partner_iban: 'DE44500105175407324931',
                    verwendungszweck: 'Abschlag 1 AR-2026-001 gemaess Pruefbericht'
                }
            ], { format: 'CSV_GENERIC' });

            const txRow = db.prepare('SELECT id FROM bank_transaktionen WHERE bank_konto_id = ?').get(konto.id);
            assert.ok(txRow, 'Transaktion muss importiert sein');

            // 5. OPOS-Abgleich mit ARCHITEKTEN_KUERZUNG_KUMULIERT durchführen
            const matchRes = await dbAPI.applyPaymentMatching([
                {
                    transaktionId: txRow.id,
                    dokumentId: r1Id,
                    betrag: 9520.00,
                    skontoAbzug: 0,
                    differenzGrund: 'ARCHITEKTEN_KUERZUNG_KUMULIERT',
                    geprueftNetto: 8000.00,
                    benutzerNotiz: 'Prüfvermerk Architekt: nur 80 m² anerkannt'
                }
            ]);

            assert.equal(matchRes.count, 1, 'Matching muss angewendet worden sein');

            // Prüfung 1: Dokument muss auf Status 'Bezahlt' sein, geprueft_netto = 8000.00
            const docNachZahlung = await dbAPI.getDocumentById(r1Id);
            assert.equal(docNachZahlung.status, 'Bezahlt', 'Status muss Bezahlt sein (kein Mahnlauf)');
            assert.equal(docNachZahlung.geprueft_netto, 8000.00, 'geprueft_netto muss 8.000 € betragen');
            assert.equal(docNachZahlung.kuerzung_grund, 'ARCHITEKTEN_KUERZUNG_KUMULIERT');
            assert.equal(docNachZahlung.offener_betrag, 0, 'offener_betrag muss 0 sein');
            assert.equal(docNachZahlung.bezahlt_betrag, 9520.00);

            // Prüfung 2: 2. Abschlag über Gesamtleistung 15.000 € Netto
            const calcAbschlag2 = CumulativeBillingController.calculateCumulativeInvoice({
                totalPerformanceNet: 15000.00,
                previousInvoices: [docNachZahlung],
                vatRate: 19.0,
                securityRetentionRate: 0.0
            });
            assert.equal(calcAbschlag2.totalPreviousBilledNet, 8000.00, 'Muss 8.000 € statt 10.000 € abziehen');
            assert.equal(calcAbschlag2.currentPeriodNet, 7000.00, 'Perioden-Netto muss genau 7.000 € sein');

            // 6. Test: Unmatch setzt geprueft_netto zurück
            const zuordnung = db.prepare('SELECT id FROM zahlung_zuordnungen WHERE dokument_id = ?').get(r1Id);
            assert.ok(zuordnung);
            await dbAPI.unmatchTransaction(zuordnung.id, 'Test Rücknahme');

            const docNachUnmatch = await dbAPI.getDocumentById(r1Id);
            assert.equal(docNachUnmatch.geprueft_netto, null, 'geprueft_netto muss nach Entkopplung null sein');
            assert.equal(docNachUnmatch.kuerzung_grund, null, 'kuerzung_grund muss nach Entkopplung null sein');
            assert.equal(docNachUnmatch.status, 'Ausstehend');

            console.log('ARCHITEKTEN_KUERZUNG_DB_TESTS_PASSED');
        } catch (err) {
            console.error('FEHLER im DB-Test:', err);
            process.exit(1);
        }
    })();
}
