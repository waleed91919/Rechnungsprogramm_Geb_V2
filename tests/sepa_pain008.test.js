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

    assert.ok(xml.includes('<BtchBookg>true</BtchBookg>'), 'BtchBookg muss korrekt geschrieben sein');
    assert.ok(!xml.includes('<BchBookg>'), 'Falsches Element BchBookg darf nicht vorkommen');
    assert.ok(xml.includes('<BICFI>COBADEFFXXX</BICFI>'), 'pain.008.001.08 verlangt BICFI');
    assert.ok(!xml.includes('<BIC>'), 'Im .001.08-Schema darf das Legacy-Element BIC nicht auftreten');
    assert.ok(xml.includes('<ChrgBr>SLEV</ChrgBr>'), 'ChrgBr=SLEV ist Pflichtangabe');
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
    assert.ok(xml.includes('<BIC>COBADEFFXXX</BIC>'), 'pain.008.001.02-Fallback behält das Legacy-Element BIC');
    assert.ok(!xml.includes('<BICFI>'), 'Im .001.02-Schema darf BICFI nicht auftreten');
    assert.ok(xml.includes('<BtchBookg>true</BtchBookg>'), 'BtchBookg muss korrekt geschrieben sein');
    assert.ok(xml.includes('<ChrgBr>SLEV</ChrgBr>'), 'ChrgBr=SLEV ist Pflichtangabe');
});

const BASIS_GENERATOR_OPTS = {
    messageId: 'MSG-T-R-BASIS',
    initiatingPartyName: 'W-Link Gebäudereinigung GmbH',
    executionDate: '2026-09-01',
    creditorName: 'W-Link Gebäudereinigung GmbH',
    creditorIban: 'DE89370400440532013000',
    creditorBic: 'COBADEFFXXX',
    creditorId: 'DE98ZZZ09999999999',
    localInstrument: 'CORE'
};

function basisTransaktion(overrides = {}) {
    return {
        endToEndId: 'E2E-TR-1',
        amount: 1000.00,
        mandateId: 'MND-TR-001',
        mandateDateOfSignature: '2026-01-15',
        debtorName: 'Alpha Facility GmbH',
        debtorIban: 'DE44500105175407324931',
        debtorBic: 'COBADEFFXXX',
        remittanceInfo: 'Rechnung TR-1',
        ...overrides
    };
}

test('T-R1: pain.008.001.08 enthält BtchBookg und niemals das ungültige Element BchBookg', () => {
    const xml = SepaController.generatePain00800108({ ...BASIS_GENERATOR_OPTS, sequenceType: 'RCUR', transactions: [basisTransaktion()] });
    assert.ok(xml.includes('<BtchBookg>true</BtchBookg>'));
    assert.equal(xml.includes('<BchBookg>'), false);
});

test('T-R2: BICFI in .001.08 (Debtor + Creditor), BIC im .001.02-Fallback', () => {
    const xml08 = SepaController.generatePain00800108({ ...BASIS_GENERATOR_OPTS, sequenceType: 'FRST', transactions: [basisTransaktion()] });
    assert.ok(xml08.includes('<DbtrAgt><FinInstnId><BICFI>COBADEFFXXX</BICFI></FinInstnId></DbtrAgt>'));
    assert.ok(/<CdtrAgt>\s*<FinInstnId>\s*<BICFI>COBADEFFXXX<\/BICFI>\s*<\/FinInstnId>\s*<\/CdtrAgt>/.test(xml08));
    assert.equal(xml08.includes('<BIC>'), false);

    const xml02 = SepaController.generatePain00800102({ ...BASIS_GENERATOR_OPTS, sequenceType: 'FRST', transactions: [basisTransaktion()] });
    assert.equal(xml02.includes('<BICFI>'), false);
    assert.ok(xml02.includes('<DbtrAgt><FinInstnId><BIC>COBADEFFXXX</BIC></FinInstnId></DbtrAgt>'));
    assert.ok(/<CdtrAgt>\s*<FinInstnId>\s*<BIC>COBADEFFXXX<\/BIC>\s*<\/FinInstnId>\s*<\/CdtrAgt>/.test(xml02));
});

test('T-R3: ChrgBr=SLEV vorhanden und XSD-Sequenz CdtrAgt < ChrgBr < CdtrSchmeId < DrctDbtTxInf', () => {
    const xml = SepaController.generatePain00800108({ ...BASIS_GENERATOR_OPTS, sequenceType: 'RCUR', transactions: [basisTransaktion()] });
    assert.ok(xml.includes('<ChrgBr>SLEV</ChrgBr>'));

    const idxCdtrAgt = xml.indexOf('<CdtrAgt>');
    const idxChrgBr = xml.indexOf('<ChrgBr>');
    const idxSchmeId = xml.indexOf('<CdtrSchmeId>');
    const idxDrctDbt = xml.indexOf('<DrctDbtTxInf>');
    const idxGrpHdr = xml.indexOf('<GrpHdr>');
    const idxPmtInf = xml.indexOf('<PmtInf>');

    assert.ok(idxCdtrAgt !== -1 && idxChrgBr > idxCdtrAgt, 'ChrgBr muss nach CdtrAgt folgen');
    assert.ok(idxSchmeId > idxChrgBr, 'CdtrSchmeId muss nach ChrgBr folgen');
    assert.ok(idxDrctDbt > idxSchmeId, 'DrctDbtTxInf muss nach CdtrSchmeId folgen');
    assert.ok(idxGrpHdr !== -1 && idxPmtInf > idxGrpHdr, 'GrpHdr muss vor PmtInf stehen');
});

test('T-R4: CdtrSchmeId nutzt den Pfad Id/PrvtId/Othr/Id mit SchmeNm/Prtry=SEPA', () => {
    const xml = SepaController.generatePain00800108({ ...BASIS_GENERATOR_OPTS, sequenceType: 'RCUR', transactions: [basisTransaktion()] });
    assert.match(xml, /<CdtrSchmeId>\s*<Id>\s*<PrvtId>\s*<Othr>\s*<Id>DE98ZZZ09999999999<\/Id>/);
    assert.match(xml, /<Othr>\s*<Id>DE98ZZZ09999999999<\/Id>\s*<SchmeNm>\s*<Prtry>SEPA<\/Prtry>/);
    assert.equal(xml.includes('OrgId'), false);
});

test('T-R5: Gläubiger-ID-Validator (ISO 7064 Mod 97-10 ohne CBC)', () => {
    assert.equal(SepaController.validateGlaeubigerId('DE98ZZZ09999999999'), true);
    assert.equal(SepaController.validateGlaeubigerId('DE75ZZZ09999999999'), false);
    assert.equal(SepaController.validateGlaeubigerId('de98 zzz09999999999'), true);
    assert.equal(SepaController.validateGlaeubigerId(''), false);
    assert.equal(SepaController.validateGlaeubigerId(null), false);
    assert.equal(SepaController.validateGlaeubigerId(undefined), false);
    assert.equal(SepaController.validateGlaeubigerId('DE98ZZZ'), false);
    assert.equal(SepaController.validateGlaeubigerId('98ZZZ09999999999'), false);
    assert.equal(SepaController.validateGlaeubigerId('DE98ZZZ09999999990'), false);
});

test('T-R7: Fehlendes oder ungültiges Unterschriftsdatum wirft Validierungsfehler statt Ausführungsdatum-Fallback', () => {
    assert.throws(
        () => SepaController.generatePain00800108({ ...BASIS_GENERATOR_OPTS, sequenceType: 'RCUR', transactions: [basisTransaktion({ mandateDateOfSignature: undefined })] }),
        /Unterschriftsdatum/
    );
    assert.throws(
        () => SepaController.generatePain00800108({ ...BASIS_GENERATOR_OPTS, sequenceType: 'RCUR', transactions: [basisTransaktion({ mandateDateOfSignature: '15.01.2026' })] }),
        /rechtlich unzulässig/
    );

    const xmlOk = SepaController.generatePain00800108({ ...BASIS_GENERATOR_OPTS, sequenceType: 'RCUR', transactions: [basisTransaktion({ mandateDateOfSignature: '2025-06-01' })] });
    assert.ok(xmlOk.includes('<DtOfSgntr>2025-06-01</DtOfSgntr>'));
    assert.ok(!xmlOk.includes(`<DtOfSgntr>${BASIS_GENERATOR_OPTS.executionDate}</DtOfSgntr>`));
});

test('T-R8: Sequenztyp MIXED wird am Generator abgewiesen und erscheint nie im XML', () => {
    assert.throws(
        () => SepaController.generatePain00800108({ ...BASIS_GENERATOR_OPTS, sequenceType: 'MIXED', transactions: [basisTransaktion()] }),
        /Sequenztyp/
    );
    assert.throws(
        () => SepaController.generatePain00800108({ ...BASIS_GENERATOR_OPTS, sequenceType: 'RCUR', transactions: [basisTransaktion({ seqTp: 'MIXED' })] }),
        /Sequenztyp/
    );
    const xml = SepaController.generatePain00800108({ ...BASIS_GENERATOR_OPTS, sequenceType: 'RCUR', transactions: [basisTransaktion()] });
    assert.equal(xml.includes('>MIXED<'), false);
});

test('T-R9: Gemischte FRST/RCUR-Positionen erzeugen zwei PmtInf-Blöcke mit korrekten Block- und GrpHdr-Summen', () => {
    const xml = SepaController.generatePain008Xml({
        ...BASIS_GENERATOR_OPTS,
        msgId: 'MSG-MULTI-TR9',
        sequenceType: 'RCUR',
        schemaVersion: 'pain.008.001.08',
        transactions: [
            basisTransaktion({ seqTp: 'FRST', amount: 100.00, mandateId: 'MND-FRST-1', endToEndId: 'E2E-FRST-1' }),
            basisTransaktion({ seqTp: 'RCUR', amount: 200.00, mandateId: 'MND-RCUR-1', endToEndId: 'E2E-RCUR-1' }),
            basisTransaktion({ seqTp: 'RCUR', amount: 300.00, mandateId: 'MND-RCUR-2', endToEndId: 'E2E-RCUR-2' })
        ]
    });

    const pmtBlocks = xml.match(/<PmtInf>[\s\S]*?<\/PmtInf>/g) || [];
    assert.equal(pmtBlocks.length, 2, 'Es müssen genau zwei PmtInf-Blöcke entstehen');

    const frstBlock = pmtBlocks.find(b => b.includes('<SeqTp>FRST</SeqTp>'));
    const rcurBlock = pmtBlocks.find(b => b.includes('<SeqTp>RCUR</SeqTp>'));
    assert.ok(frstBlock && rcurBlock, 'Je Sequenztyp muss ein Block existieren');

    assert.ok(frstBlock.includes('<NbOfTxs>1</NbOfTxs>'));
    assert.ok(frstBlock.includes('<CtrlSum>100.00</CtrlSum>'));

    assert.ok(rcurBlock.includes('<NbOfTxs>2</NbOfTxs>'));
    assert.ok(rcurBlock.includes('<CtrlSum>500.00</CtrlSum>'));
    assert.equal((rcurBlock.match(/<DrctDbtTxInf>/g) || []).length, 2);

    const grpHdr = (xml.match(/<GrpHdr>[\s\S]*?<\/GrpHdr>/g) || [])[0];
    assert.ok(grpHdr.includes('<NbOfTxs>3</NbOfTxs>'), 'GrpHdr-NbOfTxs muss Summe der Blöcke sein');
    assert.ok(grpHdr.includes('<CtrlSum>600.00</CtrlSum>'), 'GrpHdr-CtrlSum muss Summe aller InstdAmt sein');
});

if (!IS_ELECTRON_AS_NODE && !canLoadBetterSqlite()) {
    function starteElectronInner(markerArg) {
        const electronBin = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
        assert.ok(fs.existsSync(electronBin), 'Electron-Binary muss vorhanden sein');
        return execFileSync(
            electronBin,
            [path.join(__filename), markerArg],
            {
                env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '' },
                encoding: 'utf-8',
                maxBuffer: 64 * 1024 * 1024,
                timeout: 240000
            }
        );
    }

    test('SEPA-Lastschriftlauf DB-Integration (via Electron-as-Node Runtime)', () => {
        const stdout = starteElectronInner(`--${RUN_INNER_MARKER}`);
        assert.match(stdout, /SEPA_PAIN008_DB_TESTS_PASSED/, 'Alle SEPA-DB-Tests müssen bestehen');
    });

    test('T-R10: Pre-Notification-Frist wird erzwungen; bestätigte Abweichung erlaubt Lauf mit Audit (via Electron-as-Node Runtime)', () => {
        const stdout = starteElectronInner('--SEPA_T10_EXTRA_RUN');
        assert.match(stdout, /SEPA_T10_PASSED/, 'PreNot-Frist-Szenario muss bestehen');
    });
} else {
    const isT10Extra = process.argv.some(a => String(a).includes('SEPA_T10_EXTRA_RUN'));
    process.env.RECHNUNGSPROGRAMM_DB_PATH = path.join(os.tmpdir(), `sepa-pain008-${isT10Extra ? 't10' : 'main'}-${Date.now()}-${process.pid}.sqlite`);
    const { db, dbAPI, verifiziereAuditKette } = require('../db.js');

    if (isT10Extra) {
        (async () => {
            try {
                const konto = await dbAPI.saveBankKonto({
                    kontoname: 'T10-Konto',
                    bankname: 'Commerzbank',
                    iban: 'DE89370400440532013000',
                    bic: 'COBADEFFXXX',
                    kontoinhaber: 'W-Link Gebäudereinigung GmbH',
                    glaeubiger_id: 'DE98ZZZ09999999999',
                    ist_standard: 1
                });
                const kundeId = Number(db.prepare(`
                    INSERT INTO kunden (name, iban, bic, bank_name, kontoinhaber, sepa_mandat_aktiv)
                    VALUES ('T10 Kunde AG', 'DE44500105175407324931', 'GENODED1STG', 'Volksbank', 'T10 Kunde AG', 1)
                `).run().lastInsertRowid);

                await dbAPI.saveSepaMandat({
                    kunde_id: kundeId,
                    mandatsreferenz: 'MND-T10-' + kundeId,
                    mandats_typ: 'CORE',
                    sequenz_typ: 'FRST',
                    iban: 'DE44500105175407324931',
                    bic: 'GENODED1STG',
                    kontoinhaber: 'T10 Kunde AG',
                    unterschrifts_datum: '2026-01-01',
                    status: 'AKTIV'
                });

                const docId = Number(db.prepare(`
                    INSERT INTO dokumente (nr, type, datum, faellig, kundeId, brutto, netto, steuer, status, offener_betrag, bezahlt_betrag, isLocked)
                    VALUES ('INV-T10-01', 'rechnung', date('now'), date('now', '+20 day'), ?, 1190.00, 1000.00, 190.00, 'Ausstehend', 1190.00, 0, 0)
                `).run(kundeId).lastInsertRowid);

                const morgen = new Date(Date.now() + 1 * 86400000).toISOString().substring(0, 10);

                let fristError = null;
                try {
                    await dbAPI.createSepaRun({
                        bankKontoId: konto.id,
                        invoiceIds: [docId],
                        ausfuehrungsDatum: morgen,
                        sammelTyp: 'CORE'
                    });
                } catch (e) {
                    fristError = e;
                }
                assert.ok(fristError, 'Lauf innerhalb der PreNot-Frist muss abgelehnt werden');
                assert.match(fristError.message, /Pre-Notification-Frist/, 'Fehlermeldung muss die Frist benennen');

                const laeufeNachAblehnung = db.prepare('SELECT COUNT(*) AS cnt FROM sepa_lastschrift_laeufe').get().cnt;
                assert.equal(laeufeNachAblehnung, 0, 'Abgelehnter Lauf darf nicht persistiert werden');

                const okRun = await dbAPI.createSepaRun({
                    bankKontoId: konto.id,
                    invoiceIds: [docId],
                    ausfuehrungsDatum: morgen,
                    sammelTyp: 'CORE',
                    preNotFristBestaetigt: true
                });
                assert.ok(okRun.laufId, 'Mit Bestätigung muss der Lauf entstehen');
                assert.equal(okRun.prenotFristAbweichung, true);

                const auditRows = db.prepare(`
                    SELECT * FROM audit_logs
                    WHERE entity_type = 'SEPA_RUN' AND action = 'PRENOT_FRIST_ABWEICHEND_BESTAETIGT'
                      AND entity_id = ?
                `).all(Number(okRun.laufId));
                assert.ok(auditRows.length >= 1, 'Bestätigte Fristabweichung muss auditiert werden');

                assert.ok(verifiziereAuditKette().valid, 'GoBD Audit-Kette muss gültig bleiben');
                assert.ok(!okRun.xmlContent.includes('<BchBookg>'));

                try { db.close(); } catch (_e) {}
                for (const suffix of ['', '-wal', '-shm']) {
                    try { fs.rmSync(process.env.RECHNUNGSPROGRAMM_DB_PATH + suffix, { force: true }); } catch (_e) {}
                }

                console.log('SEPA_T10_PASSED');
                process.exit(0);
            } catch (err) {
                console.error('SEPA T10 Test Error:', err);
                process.exit(1);
            }
        })();
    } else {

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

            const ausfuehrungsDatum = new Date(Date.now() + 15 * 86400000).toISOString().substring(0, 10);

            const runRes = await dbAPI.createSepaRun({
                bankKontoId: kontoId,
                invoiceIds: [docId],
                ausfuehrungsDatum,
                xmlFormat: 'pain.008.001.08',
                sammelTyp: 'CORE'
            });

            assert.ok(runRes.laufId, 'Lauf-ID muss vorhanden sein');
            assert.equal(runRes.anzahlTransaktionen, 1);
            assert.equal(runRes.summeGesamt, 1500.00);
            assert.ok(runRes.xmlContent.includes('pain.008.001.08'));
            assert.ok(runRes.xmlContent.includes('MND-KUNDE-' + kundeId));

            const mandatNachErstellung = db.prepare('SELECT * FROM kunden_sepa_mandate WHERE id = ?').get(mandatId);
            assert.equal(mandatNachErstellung.sequenz_typ, 'FRST', 'Sequenztyp bleibt FRST bis zum Export (nur Lauf-Erstellung genügt nicht)');

            const exportRes = await dbAPI.exportSepaRunXml(runRes.laufId);
            assert.equal(exportRes.laufId, runRes.laufId);
            assert.ok(exportRes.xmlContent.includes('pain.008.001.08'));

            const updatedMandat = db.prepare('SELECT * FROM kunden_sepa_mandate WHERE id = ?').get(mandatId);
            assert.equal(updatedMandat.sequenz_typ, 'RCUR', 'Sequenztyp muss erst nach Export von FRST auf RCUR übergehen');

            const lauf = db.prepare('SELECT * FROM sepa_lastschrift_laeufe WHERE id = ?').get(runRes.laufId);
            assert.equal(lauf.status, 'EXPORTIERT');
            assert.ok(lauf.exportiert_am, 'exportiert_am muss beim Export gesetzt werden');

            const laeufeListe = await dbAPI.getSepaLaeufe();
            assert.ok(Array.isArray(laeufeListe) && laeufeListe.length >= 1, 'getSepaLaeufe muss Läufe liefern');

            assert.ok(verifiziereAuditKette().valid, 'GoBD Audit-Kette muss gültig bleiben');

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
}
