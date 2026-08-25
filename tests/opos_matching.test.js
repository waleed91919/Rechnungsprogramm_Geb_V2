const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const BankingController = require('../controllers/BankingController');

const IS_ELECTRON_AS_NODE = !!process.versions.electron;
const RUN_INNER_MARKER = 'OPOS_MATCHING_INNER_RUN';

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

test('O1: Pure Matching Engine - Pass 1: Exakter Rechnungsnummer- & Betragstreffer (Score 100)', () => {
    const tx = {
        id: 1,
        buchungstag: '2026-08-10',
        betrag: 1190.00,
        partner_name: 'Alpha Facility GmbH',
        partner_iban: 'DE44500105175407324931',
        verwendungszweck: 'Rechnung INV-2026-001 vom 01.08.2026'
    };

    const openInvoices = [
        {
            id: 101,
            nr: 'INV-2026-001',
            datum: '2026-08-01',
            faellig: '2026-08-15',
            brutto: 1190.00,
            bezahlt_betrag: 0,
            offener_betrag: 1190.00,
            kunde_name: 'Alpha Facility GmbH',
            kunde_iban: 'DE44500105175407324931'
        }
    ];

    const match = BankingController.matchTransaction(tx, openInvoices, []);
    assert.ok(match, 'Match sollte gefunden werden');
    assert.equal(match.dokumentId, 101);
    assert.equal(match.matchType, 'EXACT_INVOICE_AND_AMOUNT');
    assert.equal(match.score, 100);
    assert.equal(match.betrag, 1190.00);
    assert.equal(match.skontoAbzug, 0);
});

test('O2: Pure Matching Engine - Pass 2: Skonto-Abzug gem. § 14 Abs. 4 UStG innerhalb Frist (Score 95)', () => {
    const tx = {
        id: 2,
        buchungstag: '2026-08-08',
        betrag: 1166.20,
        partner_name: 'Beta Immobilien AG',
        partner_iban: 'DE27300606010123456789',
        verwendungszweck: 'Zahlung INV-2026-002 abzg. 2% Skonto'
    };

    const openInvoices = [
        {
            id: 102,
            nr: 'INV-2026-002',
            datum: '2026-08-01',
            faellig: '2026-08-30',
            brutto: 1190.00,
            bezahlt_betrag: 0,
            offener_betrag: 1190.00,
            skonto_tage: 10,
            skonto_prozent: 2.0,
            kunde_name: 'Beta Immobilien AG'
        }
    ];

    const match = BankingController.matchTransaction(tx, openInvoices, []);
    assert.ok(match, 'Skonto-Match sollte gefunden werden');
    assert.equal(match.dokumentId, 102);
    assert.equal(match.matchType, 'SKONTO_DISCOUNT_MATCH');
    assert.equal(match.score, 95);
    assert.equal(match.betrag, 1166.20);
    assert.equal(match.skontoAbzug, 23.80);
});

test('O3: Pure Matching Engine - Pass 3: Teilzahlung mit Rechnungsnummer (Score 80)', () => {
    const tx = {
        id: 3,
        buchungstag: '2026-08-10',
        betrag: 500.00,
        partner_name: 'Gamma Bau',
        verwendungszweck: 'Teilzahlung zu INV-2026-003'
    };

    const openInvoices = [
        {
            id: 103,
            nr: 'INV-2026-003',
            brutto: 2000.00,
            bezahlt_betrag: 0,
            offener_betrag: 2000.00,
            kunde_name: 'Gamma Bau'
        }
    ];

    const match = BankingController.matchTransaction(tx, openInvoices, []);
    assert.ok(match, 'Teilzahlungs-Match sollte gefunden werden');
    assert.equal(match.dokumentId, 103);
    assert.equal(match.matchType, 'PARTIAL_PAYMENT_MATCH');
    assert.equal(match.score, 80);
    assert.equal(match.restOffen, 1500.00);
});

test('O4: Pure Matching Engine - Pass 4: Kunden-IBAN + exakter Betrag ohne Rechnungsnummer (Score 85)', () => {
    const tx = {
        id: 4,
        buchungstag: '2026-08-12',
        betrag: 750.00,
        partner_name: 'Delta Reinigung',
        partner_iban: 'DE55500105179999999999',
        verwendungszweck: 'Monatliche Gebaeudereinigung'
    };

    const openInvoices = [
        {
            id: 104,
            nr: 'INV-2026-004',
            brutto: 750.00,
            bezahlt_betrag: 0,
            offener_betrag: 750.00,
            kunde_name: 'Delta Reinigung',
            kunde_iban: 'DE55500105179999999999'
        }
    ];

    const match = BankingController.matchTransaction(tx, openInvoices, []);
    assert.ok(match, 'IBAN-Match sollte gefunden werden');
    assert.equal(match.dokumentId, 104);
    assert.equal(match.matchType, 'IBAN_AND_AMOUNT_MATCH');
    assert.equal(match.score, 85);
});

if (!IS_ELECTRON_AS_NODE && !canLoadBetterSqlite()) {
    test('OPOS-Matching & Reconciliation DB-Integration (via Electron-as-Node Runtime)', () => {
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

        assert.match(stdout, /OPOS_MATCHING_DB_TESTS_PASSED/, 'Alle OPOS-DB-Tests müssen bestehen');
    });
} else {
    process.env.RECHNUNGSPROGRAMM_DB_PATH = path.join(os.tmpdir(), `opos-matching-test-${Date.now()}-${process.pid}.sqlite`);
    const { db, dbAPI, verifiziereAuditKette } = require('../db.js');

    (async () => {
        try {
            const konto = await dbAPI.saveBankKonto({
                kontoname: 'Geschäftskonto Haupt',
                bankname: 'Sparkasse Test',
                iban: 'DE89370400440532013000',
                bic: 'COBADEFFXXX',
                kontoinhaber: 'Test Gebäudereinigung GmbH',
                ist_standard: 1
            });
            const kontoId = konto.id;

            const kundeId = Number(db.prepare("INSERT INTO kunden (name, iban) VALUES ('Testkunde Alpha', 'DE44500105175407324931')").run().lastInsertRowid);

            const docId = Number(db.prepare(`
                INSERT INTO dokumente (nr, type, datum, faellig, kundeId, brutto, netto, steuer, status, offener_betrag, bezahlt_betrag, isLocked)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run('INV-2026-999', 'rechnung', '2026-08-01', '2026-08-15', kundeId, 1000.00, 840.34, 159.66, 'Ausstehend', 1000.00, 0, 0).lastInsertRowid);

            const importRes = await dbAPI.importBankTransactions(kontoId, [
                {
                    buchungstag: '2026-08-10',
                    valutadatum: '2026-08-10',
                    betrag: 1000.00,
                    partner_name: 'Testkunde Alpha',
                    partner_iban: 'DE44500105175407324931',
                    verwendungszweck: 'Ausgleich Rechnung INV-2026-999'
                }
            ]);
            assert.equal(importRes.inserted, 1);

            const matchRes = await dbAPI.runOposMatching(kontoId);
            assert.equal(matchRes.matches.length, 1);
            const match = matchRes.matches[0];
            assert.equal(match.dokumentId, docId);
            assert.equal(match.score, 100);

            const applyRes = await dbAPI.applyPaymentMatching([match]);
            assert.equal(applyRes.count, 1);

            const updatedDoc = db.prepare('SELECT * FROM dokumente WHERE id = ?').get(docId);
            assert.equal(updatedDoc.status, 'Bezahlt');
            assert.equal(updatedDoc.bezahlt_betrag, 1000.00);
            assert.equal(updatedDoc.offener_betrag, 0.00);
            assert.equal(updatedDoc.isLocked, 1);
            assert.equal(updatedDoc.mahnungLevel, 0);
            assert.ok(updatedDoc.sha256_hash, 'Hash muss gesetzt sein');

            const tx = db.prepare('SELECT * FROM bank_transaktionen WHERE id = ?').get(match.transaktionId);
            assert.equal(tx.status, 'ZUGEORDNET');

            const zuordnung = db.prepare('SELECT * FROM zahlung_zuordnungen WHERE transaktion_id = ?').get(match.transaktionId);
            assert.ok(zuordnung, 'Zuordnungseintrag vorhanden');

            const unmatchRes = await dbAPI.unmatchTransaction(zuordnung.id, 'Fehlbuchungstest');
            assert.ok(unmatchRes.success);

            const revertedDoc = db.prepare('SELECT * FROM dokumente WHERE id = ?').get(docId);
            assert.equal(revertedDoc.status, 'Ausstehend');
            assert.equal(revertedDoc.bezahlt_betrag, 0.00);
            assert.equal(revertedDoc.offener_betrag, 1000.00);

            const revertedTx = db.prepare('SELECT * FROM bank_transaktionen WHERE id = ?').get(match.transaktionId);
            assert.equal(revertedTx.status, 'OFFEN');

            if (typeof verifiziereAuditKette === 'function') {
                assert.ok(verifiziereAuditKette().valid, 'GoBD Audit-Kette muss nach Match und Unmatch gültig sein');
            }

            try { db.close(); } catch (_e) { /* ignore */ }
            for (const suffix of ['', '-wal', '-shm']) {
                try { fs.rmSync(process.env.RECHNUNGSPROGRAMM_DB_PATH + suffix, { force: true }); } catch (_e) { /* ignore */ }
            }

            console.log('OPOS_MATCHING_DB_TESTS_PASSED');
            if (IS_ELECTRON_AS_NODE) {
                process.exit(0);
            }
        } catch (err) {
            console.error('OPOS DB Test Error:', err);
            if (IS_ELECTRON_AS_NODE) {
                process.exit(1);
            }
        }
    })();
}
