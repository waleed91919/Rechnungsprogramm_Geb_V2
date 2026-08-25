const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const SepaController = require('../controllers/SepaController');

const IS_ELECTRON_AS_NODE = !!process.versions.electron;
const RUN_INNER_MARKER = 'SEPA_PAIN008_INNER_RUN';

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

test('S1: ISO 7064 Modulo 97 IBAN-Validierung', () => {
    assert.equal(SepaController.validateIban('DE89370400440532013000'), true);
    assert.equal(SepaController.validateIban('DE 89 3704 0044 0532 0130 00'), true);
    assert.equal(SepaController.validateIban('AT611904300234573201'), true);
    assert.equal(SepaController.validateIban('CH9300762011623852957'), true);

    // Ungültige Prüfziffer
    assert.equal(SepaController.validateIban('DE88370400440532013000'), false);
    // Ungültige Länge
    assert.equal(SepaController.validateIban('DE8937040044053201300'), false);
    // Ungültige Zeichen
    assert.equal(SepaController.validateIban('DE8937040044053201300X'), false);
    assert.equal(SepaController.validateIban(''), false);
    assert.equal(SepaController.validateIban(null), false);
});

test('S2: BIC / SWIFT-Code Validierung (8 und 11 Stellen)', () => {
    assert.equal(SepaController.validateBic('COBADEFFXXX'), true);
    assert.equal(SepaController.validateBic('COBADEFF'), true);
    assert.equal(SepaController.validateBic('GENODED1STG'), true);
    assert.equal(SepaController.validateBic('DEUTDEDD'), true);

    assert.equal(SepaController.validateBic('COBA1EFF'), false);
    assert.equal(SepaController.validateBic('COBADE'), false);
    assert.equal(SepaController.validateBic('COBADEFFXXXX'), false);
});

test('S3: TARGET2 Bankarbeitstage und Osterberechnung (Gauss/Computus)', () => {
    // Wochenende
    assert.equal(SepaController.isTarget2BankingDay('2026-08-22'), false); // Samstag
    assert.equal(SepaController.isTarget2BankingDay('2026-08-23'), false); // Sonntag

    // Feste TARGET2-Feiertage
    assert.equal(SepaController.isTarget2BankingDay('2026-01-01'), false); // Neujahr
    assert.equal(SepaController.isTarget2BankingDay('2026-05-01'), false); // Tag der Arbeit
    assert.equal(SepaController.isTarget2BankingDay('2026-12-25'), false); // 1. Weihnachtstag

    // Bewegliche Osterfeiertage 2026: Ostersonntag ist der 05.04.2026
    assert.equal(SepaController.isTarget2BankingDay('2026-04-03'), false); // Karfreitag
    assert.equal(SepaController.isTarget2BankingDay('2026-04-06'), false); // Ostermontag

    // Regulärer Bankarbeitstag
    assert.equal(SepaController.isTarget2BankingDay('2026-08-26'), true);

    // Nächster Bankarbeitstag nach Freitag
    assert.equal(SepaController.getNextTarget2BankingDay('2026-08-21', 1), '2026-08-24');
});

test('S4: Pre-Notification Textgenerator erzeugt rechtskonforme Vorabinformation', () => {
    const text = SepaController.buildPreNotification({
        glaeubigerId: 'DE98ZZZ09999999999',
        firmenname: 'W-Link Gebäudereinigung GmbH',
        mandatsreferenz: 'MND-2026-001',
        faelligkeitsdatum: '2026-09-01',
        betrag: 1190.00,
        iban: 'DE44500105175407324931',
        belegNr: 'INV-2026-100',
        kundenName: 'Alpha Facility GmbH'
    });

    assert.ok(text.includes('DE98ZZZ09999999999'), 'Gläubiger-ID muss enthalten sein');
    assert.ok(text.includes('MND-2026-001'), 'Mandatsreferenz muss enthalten sein');
    assert.ok(text.includes('1.190,00') || text.includes('1190,00'), 'Betrag muss formatiert enthalten sein');
    assert.ok(text.includes('2026-09-01') || text.includes('01.09.2026'), 'Fälligkeit muss enthalten sein');
    assert.ok(text.includes('INV-2026-100'), 'Rechnungsnummer muss enthalten sein');
});

test('S5: pain.008.001.08 XML Generierung enthält alle SEPA Rulebook Pflichtfelder', () => {
    const xml = SepaController.generatePain00800108({
        messageId: 'MSG-2026-TEST-01',
        initiatingPartyName: 'W-Link Gebäudereinigung GmbH',
        paymentInfoId: 'PMT-2026-01',
        executionDate: '2026-09-01',
        creditorName: 'W-Link Gebäudereinigung GmbH',
        creditorIban: 'DE89370400440532013000',
        creditorBic: 'COBADEFFXXX',
        creditorId: 'DE98ZZZ09999999999',
        sequenceType: 'FRST',
        localInstrument: 'CORE',
        transactions: [
            {
                endToEndId: 'E2E-INV-2026-101',
                amount: 1250.50,
                mandateId: 'MND-2026-001',
                mandateDateOfSignature: '2026-01-15',
                debtorName: 'Alpha Facility GmbH',
                debtorIban: 'DE44500105175407324931',
                debtorBic: 'COBADEFFXXX',
                remittanceInfo: 'Rechnung INV-2026-101 Unterhaltsreinigung'
            },
            {
                endToEndId: 'E2E-INV-2026-102',
                amount: 750.00,
                mandateId: 'MND-2026-002',
                mandateDateOfSignature: '2026-02-20',
                debtorName: 'Beta Immobilien AG',
                debtorIban: 'DE27300606010123456789',
                debtorBic: 'GENODED1STG',
                remittanceInfo: 'Rechnung INV-2026-102 Glasreinigung'
            }
        ]
    });

    assert.ok(xml.includes('urn:iso:std:iso:20022:tech:xsd:pain.008.001.08'));
    assert.ok(xml.includes('<MsgId>MSG-2026-TEST-01</MsgId>'));
    assert.ok(xml.includes('<NbOfTxs>2</NbOfTxs>'));
    assert.ok(xml.includes('<CtrlSum>2000.50</CtrlSum>'));
    assert.ok(xml.includes('<SeqTp>FRST</SeqTp>'));
    assert.ok(xml.includes('<ReqdColltnDt>2026-09-01</ReqdColltnDt>'));
    assert.ok(xml.includes('<IBAN>DE89370400440532013000</IBAN>'));
    assert.ok(xml.includes('<Id>DE98ZZZ09999999999</Id>'));
    assert.ok(xml.includes('<InstdAmt Ccy="EUR">1250.50</InstdAmt>'));
    assert.ok(xml.includes('<MndtId>MND-2026-001</MndtId>'));
    assert.ok(xml.includes('<IBAN>DE44500105175407324931</IBAN>'));
    assert.ok(xml.includes('<Ustrd>Rechnung INV-2026-101 Unterhaltsreinigung</Ustrd>'));
});

test('S6: pain.008.001.02 XML Kompatibilitätsmodus erzeugt valides Altschema', () => {
    const xml = SepaController.generatePain00800102({
        messageId: 'MSG-2026-LEGACY-01',
        initiatingPartyName: 'W-Link Gebäudereinigung GmbH',
        paymentInfoId: 'PMT-2026-02',
        executionDate: '2026-09-01',
        creditorName: 'W-Link Gebäudereinigung GmbH',
        creditorIban: 'DE89370400440532013000',
        creditorBic: 'COBADEFFXXX',
        creditorId: 'DE98ZZZ09999999999',
        sequenceType: 'RCUR',
        localInstrument: 'CORE',
        transactions: [
            {
                endToEndId: 'E2E-INV-2026-103',
                amount: 500.00,
                mandateId: 'MND-2026-003',
                mandateDateOfSignature: '2026-03-01',
                debtorName: 'Gamma Bau',
                debtorIban: 'DE55500105179999999999',
                remittanceInfo: 'Rechnung INV-2026-103'
            }
        ]
    });

    assert.ok(xml.includes('urn:iso:std:iso:20022:tech:xsd:pain.008.001.02'));
    assert.ok(xml.includes('<SeqTp>RCUR</SeqTp>'));
    assert.ok(xml.includes('<InstdAmt Ccy="EUR">500.00</InstdAmt>'));
});

if (!IS_ELECTRON_AS_NODE && !canLoadBetterSqlite()) {
    test('SEPA-Lastschriftlauf DB-Integration (via Electron-as-Node Runtime)', () => {
        const electronBin = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
        assert.ok(fs.existsSync(electronBin), 'Electron-Binary muss vorhanden sein');

        const stdout = execFileSync(
            electronBin,
            [path.join(__filename), `--${RUN_INNER_MARKER}`],
            {
                env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '' },
                encoding: 'utf-8',
                maxBuffer: 64 * 1024 * 1024,
                timeout: 180000
            }
        );

        assert.match(stdout, /SEPA_PAIN008_DB_TESTS_PASSED/, 'Alle SEPA-DB-Tests müssen bestehen');
    });
} else {
    process.env.RECHNUNGSPROGRAMM_DB_PATH = path.join(os.tmpdir(), `sepa-pain008-test-${Date.now()}-${process.pid}.sqlite`);
    const { db, dbAPI } = require('../db.js');

    (async () => {
        try {
            const konto = await dbAPI.saveBankKonto({
                kontoname: 'Geschäftskonto SEPA',
                bankname: 'Commerzbank',
                iban: 'DE89370400440532013000',
                bic: 'COBADEFFXXX',
                kontoinhaber: 'W-Link Gebäudereinigung GmbH',
                glaeubiger_id: 'DE98ZZZ09999999999',
                ist_standard: 1
            });
            const kontoId = konto.id;

            const kundeId = Number(db.prepare(`
                INSERT INTO kunden (name, iban, bic, bank_name, kontoinhaber, sepa_mandat_aktiv)
                VALUES ('Beta Immobilien AG', 'DE44500105175407324931', 'GENODED1STG', 'Volksbank', 'Beta Immobilien AG', 1)
            `).run().lastInsertRowid);

            const mandat = await dbAPI.saveSepaMandat({
                kunde_id: kundeId,
                mandatsreferenz: 'MND-KUNDE-' + kundeId,
                mandats_typ: 'CORE',
                sequenz_typ: 'FRST',
                iban: 'DE44500105175407324931',
                bic: 'GENODED1STG',
                kontoinhaber: 'Beta Immobilien AG',
                unterschrifts_datum: '2026-01-01',
                status: 'AKTIV'
            });
            const mandatId = mandat.id;

            const docId = Number(db.prepare(`
                INSERT INTO dokumente (nr, type, datum, faellig, kundeId, brutto, netto, steuer, status, offener_betrag, bezahlt_betrag, isLocked, sepa_mandat_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run('INV-2026-SEPA-01', 'rechnung', '2026-08-01', '2026-08-15', kundeId, 1500.00, 1260.50, 239.50, 'Ausstehend', 1500.00, 0, 0, mandatId).lastInsertRowid);

            const openSepaDocs = await dbAPI.getOffeneRechnungenFuerSepa();
            assert.ok(openSepaDocs.length >= 1);
            const targetDoc = openSepaDocs.find(d => d.id === docId);
            assert.ok(targetDoc, 'Rechnung mit Mandat muss in SEPA-Vorschlagsliste sein');
            assert.equal(targetDoc.mandatsreferenz, 'MND-KUNDE-' + kundeId);

            const runRes = await dbAPI.createSepaRun({
                bankKontoId: kontoId,
                invoiceIds: [docId],
                ausfuehrungsDatum: '2026-09-01',
                xmlFormat: 'pain.008.001.08',
                sammelTyp: 'CORE'
            });

            assert.ok(runRes.laufId, 'Lauf-ID muss vorhanden sein');
            assert.equal(runRes.anzahlTransaktionen, 1);
            assert.equal(runRes.summeGesamt, 1500.00);
            assert.ok(runRes.xmlContent.includes('pain.008.001.08'));
            assert.ok(runRes.xmlContent.includes('MND-KUNDE-' + kundeId));

            const updatedMandat = db.prepare('SELECT * FROM kunden_sepa_mandate WHERE id = ?').get(mandatId);
            assert.equal(updatedMandat.sequenz_typ, 'RCUR', 'Sequenztyp muss nach erstem Lastschrifteinzug von FRST auf RCUR übergehen');

            const exportRes = await dbAPI.exportSepaRunXml(runRes.laufId);
            assert.equal(exportRes.laufId, runRes.laufId);
            assert.ok(exportRes.xmlContent.includes('pain.008.001.08'));

            const lauf = db.prepare('SELECT * FROM sepa_lastschrift_laeufe WHERE id = ?').get(runRes.laufId);
            assert.equal(lauf.status, 'EXPORTIERT');

            try { db.close(); } catch (_e) { /* ignore */ }
            for (const suffix of ['', '-wal', '-shm']) {
                try { fs.rmSync(process.env.RECHNUNGSPROGRAMM_DB_PATH + suffix, { force: true }); } catch (_e) { /* ignore */ }
            }

            console.log('SEPA_PAIN008_DB_TESTS_PASSED');
            if (IS_ELECTRON_AS_NODE) {
                process.exit(0);
            }
        } catch (err) {
            console.error('SEPA DB Test Error:', err);
            if (IS_ELECTRON_AS_NODE) {
                process.exit(1);
            }
        }
    })();
}
