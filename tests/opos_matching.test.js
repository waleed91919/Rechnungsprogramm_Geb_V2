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

test('O2: Pure Matching Engine - Pass 2: Skonto-Abzug gem. § 14 Abs. 4 Satz 1 Nr. 7 UStG innerhalb Frist (Score 95)', () => {
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

test('T-R26: _isDateWithinDays ist fail-closed - kein Skonto-Match ohne belastbare Frist', () => {
    assert.equal(BankingController._isDateWithinDays('', '2026-08-10', 5), false);
    assert.equal(BankingController._isDateWithinDays('2026-08-01', '', 5), false);
    assert.equal(BankingController._isDateWithinDays(null, '2026-08-10', 5), false);
    assert.equal(BankingController._isDateWithinDays('kein-datum', '2026-08-10', 5), false);

    assert.equal(BankingController._isDateWithinDays('2026-08-01', '2026-08-05', 5), true);
    assert.equal(BankingController._isDateWithinDays('2026-07-01', '2026-08-05', 5), false);

    const tx = {
        id: 9,
        buchungstag: '2026-08-08',
        betrag: 1166.20,
        verwendungszweck: 'Zahlung INV-X abzg. Skonto'
    };
    const invoiceOhneDatum = {
        id: 90,
        nr: 'INV-X',
        datum: '',
        brutto: 1190.00,
        bezahlt_betrag: 0,
        offener_betrag: 1190.00,
        skonto_tage: 10,
        skonto_prozent: 2.0
    };
    const res = BankingController.matchTransaction(tx, [invoiceOhneDatum], []);
    assert.ok(!res || res.matchType !== 'SKONTO_DISCOUNT_MATCH', 'Ohne Belegdatum darf kein SKONTO_DISCOUNT_MATCH entstehen');
});

if (!IS_ELECTRON_AS_NODE && !canLoadBetterSqlite()) {
    let extraStdoutPromise = null;

    function starteElectronInner(markerArg) {
        if (String(markerArg).includes('OPOS_EXTRA_RUN')) {
            if (!extraStdoutPromise) {
                extraStdoutPromise = new Promise((resolve, reject) => {
                    try {
                        const electronBin = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
                        if (!fs.existsSync(electronBin)) {
                            return reject(new Error('Electron-Binary muss vorhanden sein'));
                        }
                        const stdout = execFileSync(
                            electronBin,
                            [path.join(__filename), markerArg],
                            {
                                env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '' },
                                encoding: 'utf-8',
                                maxBuffer: 64 * 1024 * 1024,
                                timeout: 240000
                            }
                        );
                        resolve(stdout);
                    } catch (err) {
                        reject(err);
                    }
                });
            }
            return extraStdoutPromise;
        }

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

    test('OPOS-Matching & Reconciliation DB-Integration (via Electron-as-Node Runtime)', () => {
        const stdout = starteElectronInner(`--${RUN_INNER_MARKER}`);
        assert.match(stdout, /OPOS_MATCHING_DB_TESTS_PASSED/, 'Alle OPOS-DB-Tests müssen bestehen');
    });

    test('T-R6: createSepaRun ohne gültige Gläubiger-ID wird abgelehnt, Demo-Fallback erscheint nie (via Electron-as-Node Runtime)', async () => {
        const stdout = await starteElectronInner('--OPOS_EXTRA_RUN');
        assert.match(stdout, /TR6_OK/, 'Gläubiger-ID-Ablehnung muss gelten');
    });

    test('T-R23: Skonto-Felder persistieren und Pass-2 greift gegen gespeicherten Beleg (via Electron-as-Node Runtime)', async () => {
        const stdout = await starteElectronInner('--OPOS_EXTRA_RUN');
        assert.match(stdout, /TR23_OK/, 'Skonto-Persistenz-Roundtrip muss gelten');
    });

    test('T-R24: Kunden-Bankdaten persistieren und Pass-4 greift ohne Mandat-Umweg (via Electron-as-Node Runtime)', async () => {
        const stdout = await starteElectronInner('--OPOS_EXTRA_RUN');
        assert.match(stdout, /TR24_OK/, 'IBAN-Persistenz-Roundtrip muss gelten');
    });

    test('T-R25: Dedup via Primanota/Hash + Zuordnungen werden nur logisch storniert (via Electron-as-Node Runtime)', async () => {
        const stdout = await starteElectronInner('--OPOS_EXTRA_RUN');
        assert.match(stdout, /TR25_OK/, 'Dedup- und Storno-Flag-Verhalten muss gelten');
    });

    test('T-R27: Unmatch stellt vorherige GoBD-Sperre wieder her (via Electron-as-Node Runtime)', async () => {
        const stdout = await starteElectronInner('--OPOS_EXTRA_RUN');
        assert.match(stdout, /TR27_OK/, 'Lock-Wiederherstellung muss gelten');
    });
} else {
    const isExtraRun = process.argv.some(a => String(a).includes('OPOS_EXTRA_RUN'));
    process.env.RECHNUNGSPROGRAMM_DB_PATH = path.join(os.tmpdir(), `opos-matching-${isExtraRun ? 'extra' : 'main'}-${Date.now()}-${process.pid}.sqlite`);
    const { db, dbAPI, verifiziereAuditKette } = require('../db.js');

    if (isExtraRun) {
        (async () => {
            try {
                const heute = new Date().toISOString().substring(0, 10);
                const vor3Tagen = new Date(Date.now() - 3 * 86400000).toISOString().substring(0, 10);
                const in20Tagen = new Date(Date.now() + 20 * 86400000).toISOString().substring(0, 10);

                const konto = await dbAPI.saveBankKonto({
                    kontoname: 'Extra-Konto',
                    bankname: 'Sparkasse Test',
                    iban: 'DE89370400440532013000',
                    bic: 'COBADEFFXXX',
                    kontoinhaber: 'Test Gebäudereinigung GmbH',
                    ist_standard: 1
                });
                const kontoId = konto.id;

                let errOhne = null;
                try {
                    await dbAPI.createSepaRun({ bankKontoId: kontoId, invoiceIds: [999999], sammelTyp: 'CORE' });
                } catch (e) { errOhne = e; }
                assert.ok(errOhne, 'Ohne Gläubiger-ID muss createSepaRun werfen');
                assert.match(errOhne.message, /Gläubiger-Identifikationsnummer/);

                await dbAPI.saveBankKonto({
                    id: kontoId,
                    kontoname: 'Extra-Konto',
                    bankname: 'Sparkasse Test',
                    iban: 'DE89370400440532013000',
                    bic: 'COBADEFFXXX',
                    kontoinhaber: 'Test Gebäudereinigung GmbH',
                    glaeubiger_id: 'DE75ZZZ09999999999',
                    ist_standard: 1
                });
                let errUngueltig = null;
                try {
                    await dbAPI.createSepaRun({ bankKontoId: kontoId, invoiceIds: [999999], sammelTyp: 'CORE' });
                } catch (e) { errUngueltig = e; }
                assert.ok(errUngueltig && /Gläubiger-Identifikationsnummer/.test(errUngueltig.message), 'Ungültige Prüfziffer muss abgelehnt werden');

                assert.equal(db.prepare('SELECT COUNT(*) AS cnt FROM sepa_lastschrift_laeufe').get().cnt, 0, 'Es darf kein Lauf entstanden sein');

                await dbAPI.saveBankKonto({
                    id: kontoId,
                    kontoname: 'Extra-Konto',
                    bankname: 'Sparkasse Test',
                    iban: 'DE89370400440532013000',
                    bic: 'COBADEFFXXX',
                    kontoinhaber: 'Test Gebäudereinigung GmbH',
                    glaeubiger_id: 'DE98ZZZ09999999999',
                    ist_standard: 1
                });
                console.log('TR6_OK');

                const kundeSkontoId = Number(db.prepare("INSERT INTO kunden (name, iban) VALUES ('Skontokunde T23', 'DE27300606010123456789')").run().lastInsertRowid);
                const docSkontoId = Number(await dbAPI.saveDocument({
                    type: 'rechnung',
                    nr: 'INV-T23-SKONTO',
                    datum: vor3Tagen,
                    faellig: in20Tagen,
                    kundeId: kundeSkontoId,
                    netto: 1000.00,
                    steuer: 190.00,
                    brutto: 1190.00,
                    status: 'Ausstehend',
                    skonto_tage: 10,
                    skonto_prozent: 2.0,
                    positionen: [{ name: 'Unterhaltsreinigung', menge: 1, preis: 1000, ek: 0, mwst: 19 }]
                }));

                const storedDoc = db.prepare('SELECT * FROM dokumente WHERE id = ?').get(docSkontoId);
                assert.equal(storedDoc.skonto_tage, 10);
                assert.equal(storedDoc.skonto_prozent, 2.0);

                await dbAPI.importBankTransactions(kontoId, [{
                    buchungstag: heute,
                    valutadatum: heute,
                    betrag: 1166.20,
                    partner_name: 'Skontokunde T23',
                    partner_iban: 'DE27300606010123456789',
                    verwendungszweck: 'Zahlung INV-T23-SKONTO abzgl. Skonto'
                }]);
                const matchResT23 = await dbAPI.runOposMatching(kontoId);
                const mSkonto = matchResT23.matches.find(m => m.matchType === 'SKONTO_DISCOUNT_MATCH' && m.dokumentId === docSkontoId);
                assert.ok(mSkonto, 'Pass-2 Skonto-Match muss gegen den gespeicherten Beleg greifen');
                assert.equal(mSkonto.skontoAbzug, 23.80);
                console.log('TR23_OK');

                await dbAPI.saveKunde({
                    name: 'IBAN-Kunde T24',
                    adresse: 'Weg 1',
                    plz: '50667',
                    ort: 'Köln',
                    iban: ' de55 5001 0517 9999 9999 99 ',
                    bic: 'cobadeffxxx',
                    bank_name: 'Testbank T24',
                    kontoinhaber: 'IBAN-Kunde T24'
                });
                const kundeIban = db.prepare("SELECT * FROM kunden WHERE name = 'IBAN-Kunde T24'").get();
                assert.equal(kundeIban.iban, 'DE55500105179999999999');
                assert.equal(kundeIban.bic, 'COBADEFFXXX');
                assert.equal(kundeIban.bank_name, 'Testbank T24');
                assert.equal(kundeIban.kontoinhaber, 'IBAN-Kunde T24');

                const docIbanId = Number(await dbAPI.saveDocument({
                    type: 'rechnung',
                    nr: 'INV-T24-IBAN',
                    datum: vor3Tagen,
                    faellig: in20Tagen,
                    kundeId: kundeIban.id,
                    netto: 630.25,
                    steuer: 119.75,
                    brutto: 750.00,
                    status: 'Ausstehend',
                    positionen: [{ name: 'Glasreinigung', menge: 1, preis: 630.25, ek: 0, mwst: 19 }]
                }));

                await dbAPI.importBankTransactions(kontoId, [{
                    buchungstag: heute,
                    valutadatum: heute,
                    betrag: 750.00,
                    partnerName: 'IBAN-Kunde T24',
                    partnerIban: 'DE55500105179999999999',
                    verwendungszweck: 'Überweisung laufende Gebäudepflege'
                }]);
                const matchResT24 = await dbAPI.runOposMatching(kontoId);
                const mIban = matchResT24.matches.find(m => m.matchType === 'IBAN_AND_AMOUNT_MATCH' && m.dokumentId === docIbanId);
                assert.ok(mIban, 'Pass-4 IBAN-Match muss ohne Mandat-Umweg greifen');
                assert.equal(mIban.score, 85);
                console.log('TR24_OK');

                const dupTx = {
                    buchungstag: heute,
                    valutadatum: heute,
                    betrag: 42.50,
                    partner_name: 'Kartenzahlung Terminal',
                    verwendungszweck: 'Kartenumsatz Filiale',
                    primanota: 'ACCTSRVREF-T25-001'
                };
                const import1 = await dbAPI.importBankTransactions(kontoId, [dupTx]);
                assert.equal(import1.inserted, 1);
                const import2 = await dbAPI.importBankTransactions(kontoId, [dupTx]);
                assert.equal(import2.inserted, 0);
                assert.equal(import2.duplicates, 1);

                const applyRes = await dbAPI.applyPaymentMatching([mSkonto]);
                assert.equal(applyRes.count, 1);
                const bezahltDoc = db.prepare('SELECT * FROM dokumente WHERE id = ?').get(docSkontoId);
                assert.equal(bezahltDoc.status, 'Bezahlt');

                const zuordnung = db.prepare('SELECT * FROM zahlung_zuordnungen WHERE dokument_id = ? AND storno_flag = 0').get(docSkontoId);
                assert.ok(zuordnung, 'Aktive Zuordnung muss vorhanden sein');

                await dbAPI.unmatchTransaction(zuordnung.id, 'T-R25 Stornotest');
                const storniert = db.prepare('SELECT * FROM zahlung_zuordnungen WHERE id = ?').get(zuordnung.id);
                assert.ok(storniert, 'Zuordnungszeile muss erhalten bleiben (GoBD-Historie)');
                assert.equal(storniert.storno_flag, 1);
                assert.ok(storniert.storniert_am, 'storniert_am muss gesetzt sein');
                assert.equal(storniert.storno_grund, 'T-R25 Stornotest');

                const txNachStorno = await dbAPI.getBankTransaktionen({ bank_konto_id: kontoId });
                const txRowT25 = txNachStorno.find(t => t.id === zuordnung.transaktion_id);
                assert.ok(txRowT25.zuordnungen.length === 0, 'Stornierte Zuordnung darf nicht mehr angezeigt werden');

                const matchResNeu = await dbAPI.runOposMatching(kontoId);
                const mNeu = matchResNeu.matches.find(m => m.dokumentId === docSkontoId);
                assert.ok(mNeu, 'Erneutes Matching muss den wieder offenen Beleg sehen');
                console.log('TR25_OK');

                const kundeSperrId = Number(db.prepare("INSERT INTO kunden (name) VALUES ('Sperrkunde T27')").run().lastInsertRowid);
                const docLockId = Number(await dbAPI.saveDocument({
                    type: 'rechnung',
                    nr: 'INV-T27-LOCK',
                    datum: vor3Tagen,
                    faellig: in20Tagen,
                    kundeId: kundeSperrId,
                    netto: 100.00,
                    steuer: 19.00,
                    brutto: 119.00,
                    status: 'Ausstehend',
                    isLocked: true,
                    positionen: [{ name: 'Festschreibung', menge: 1, preis: 100, ek: 0, mwst: 19 }]
                }));
                assert.equal(db.prepare('SELECT isLocked FROM dokumente WHERE id = ?').get(docLockId).isLocked, 1);

                await dbAPI.importBankTransactions(kontoId, [{
                    buchungstag: heute,
                    valutadatum: heute,
                    betrag: 50.00,
                    partner_name: 'Sperrkunde T27',
                    verwendungszweck: 'Teilzahlung INV-T27-LOCK'
                }]);
                const matchResT27a = await dbAPI.runOposMatching(kontoId);
                const mTeilLock = matchResT27a.matches.find(m => m.matchType === 'PARTIAL_PAYMENT_MATCH' && m.dokumentId === docLockId);
                assert.ok(mTeilLock, 'Teilzahlung auf gesperrten Beleg muss gematcht werden');
                await dbAPI.applyPaymentMatching([mTeilLock]);

                const nachZahlung = db.prepare('SELECT * FROM dokumente WHERE id = ?').get(docLockId);
                assert.equal(nachZahlung.isLocked, 1, 'Sperre bleibt bei Teilzahlung erhalten');
                assert.equal(nachZahlung.was_locked_vor_zahlung, 1, 'Herkunft der Sperre muss gesichert werden');

                const zuordLock = db.prepare('SELECT * FROM zahlung_zuordnungen WHERE dokument_id = ? AND storno_flag = 0').get(docLockId);
                await dbAPI.unmatchTransaction(zuordLock.id, 'T-R27 Entkopplung gesperrt');
                const nachUnmatchLock = db.prepare('SELECT * FROM dokumente WHERE id = ?').get(docLockId);
                assert.equal(nachUnmatchLock.isLocked, 1, 'Vorher gesperrter Beleg muss nach Unmatch gesperrt bleiben');

                const docUnlockId = Number(await dbAPI.saveDocument({
                    type: 'rechnung',
                    nr: 'INV-T27-FREI',
                    datum: vor3Tagen,
                    faellig: in20Tagen,
                    kundeId: kundeSperrId,
                    netto: 200.00,
                    steuer: 38.00,
                    brutto: 238.00,
                    status: 'Ausstehend',
                    positionen: [{ name: 'Frei', menge: 1, preis: 200, ek: 0, mwst: 19 }]
                }));
                await dbAPI.importBankTransactions(kontoId, [{
                    buchungstag: heute,
                    valutadatum: heute,
                    betrag: 100.00,
                    partner_name: 'Sperrkunde T27',
                    verwendungszweck: 'Teilzahlung INV-T27-FREI'
                }]);
                const matchResT27b = await dbAPI.runOposMatching(kontoId);
                const mTeilFrei = matchResT27b.matches.find(m => m.matchType === 'PARTIAL_PAYMENT_MATCH' && m.dokumentId === docUnlockId);
                assert.ok(mTeilFrei);
                await dbAPI.applyPaymentMatching([mTeilFrei]);
                const zuordFrei = db.prepare('SELECT * FROM zahlung_zuordnungen WHERE dokument_id = ? AND storno_flag = 0').get(docUnlockId);
                await dbAPI.unmatchTransaction(zuordFrei.id, 'T-R27 Entkopplung ungesperrt');
                const nachUnmatchFrei = db.prepare('SELECT * FROM dokumente WHERE id = ?').get(docUnlockId);
                assert.equal(nachUnmatchFrei.isLocked, 0, 'Ungesperrter Beleg bleibt nach Unmatch ungesperrt');

                assert.ok(verifiziereAuditKette().valid, 'GoBD Audit-Kette muss gültig bleiben');
                console.log('TR27_OK');

                try { db.close(); } catch (_e) {}
                for (const suffix of ['', '-wal', '-shm']) {
                    try { fs.rmSync(process.env.RECHNUNGSPROGRAMM_DB_PATH + suffix, { force: true }); } catch (_e) {}
                }
                process.exit(0);
            } catch (err) {
                console.error('OPOS Extra Test Error:', err);
                process.exit(1);
            }
        })();
    } else {

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
}
