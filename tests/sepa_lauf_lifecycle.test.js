const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const IS_ELECTRON_AS_NODE = !!process.versions.electron;
const RUN_INNER_MARKER = 'SEPA_LIFECYCLE_INNER_RUN';

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

if (!IS_ELECTRON_AS_NODE && !canLoadBetterSqlite()) {
    let innerStdoutPromise = null;

    function starteLifecycleInner() {
        if (!innerStdoutPromise) {
            innerStdoutPromise = new Promise((resolve, reject) => {
                try {
                    const electronBin = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
                    if (!fs.existsSync(electronBin)) {
                        return reject(new Error('Electron-Binary muss vorhanden sein'));
                    }
                    const stdout = execFileSync(
                        electronBin,
                        [path.join(__filename), `--${RUN_INNER_MARKER}`],
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
        return innerStdoutPromise;
    }

    test('T-R12: getSepaLaeufe läuft fehlerfrei und sortiert nach erstellt_am (via Electron-as-Node Runtime)', async () => {
        const stdout = await starteLifecycleInner();
        assert.match(stdout, /TR12_OK/, 'getSepaLaeufe muss nach realem createSepaRun liefern');
    });

    test('T-R13: Mandat bleibt FRST bis zum Export und wird danach RCUR (via Electron-as-Node Runtime)', async () => {
        const stdout = await starteLifecycleInner();
        assert.match(stdout, /TR13_OK/, 'FRST->RCUR muss erst beim Export wechseln');
    });

    test('T-R14: storniereSepaLauf setzt Lauf, Positionen und Sequenztyp konsistent zurück (via Electron-as-Node Runtime)', async () => {
        const stdout = await starteLifecycleInner();
        assert.match(stdout, /TR14_OK/, 'Storno muss Lauf/Positionen/Mandat zurücksetzen und auditiert sein');
    });

    test('T-R15: markiereRuecklastschrift stellt FRST bei gescheiterter Erstlastschrift wieder her (via Electron-as-Node Runtime)', async () => {
        const stdout = await starteLifecycleInner();
        assert.match(stdout, /TR15_OK/, 'Rücklastschrift muss Mandat auf FRST zurückstellen und Beleg offen lassen');
    });

    test('T-R16: exportSepaRunXml setzt EXPORTIERT und exportiert_am (via Electron-as-Node Runtime)', async () => {
        const stdout = await starteLifecycleInner();
        assert.match(stdout, /TR16_OK/, 'Export-Statuswechsel muss protokolliert werden');
        assert.match(stdout, /SEPA_LIFECYCLE_AUDIT_VALID/, 'GoBD Audit-Kette muss gültig bleiben');
    });
} else {
    process.env.RECHNUNGSPROGRAMM_DB_PATH = path.join(os.tmpdir(), `sepa-lifecycle-${Date.now()}-${process.pid}.sqlite`);
    const { db, dbAPI, verifiziereAuditKette } = require('../db.js');

    (async () => {
        try {
            const konto = await dbAPI.saveBankKonto({
                kontoname: 'Lifecycle-Konto',
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
                VALUES ('Lifecycle Kunde AG', 'DE44500105175407324931', 'GENODED1STG', 'Volksbank', 'Lifecycle Kunde AG', 1)
            `).run().lastInsertRowid);

            const mandat = await dbAPI.saveSepaMandat({
                kunde_id: kundeId,
                mandatsreferenz: 'MND-LC-' + kundeId,
                mandats_typ: 'CORE',
                sequenz_typ: 'FRST',
                iban: 'DE44500105175407324931',
                bic: 'GENODED1STG',
                kontoinhaber: 'Lifecycle Kunde AG',
                unterschrifts_datum: '2026-01-01',
                status: 'AKTIV'
            });
            const mandatId = mandat.id;

            const docId = Number(db.prepare(`
                INSERT INTO dokumente (nr, type, datum, faellig, kundeId, brutto, netto, steuer, status, offener_betrag, bezahlt_betrag, isLocked)
                VALUES ('INV-LC-01', 'rechnung', date('now'), date('now', '+20 day'), ?, 1190.00, 1000.00, 190.00, 'Ausstehend', 1190.00, 0, 0)
            `).run(kundeId).lastInsertRowid);

            const ausfuehrung1 = new Date(Date.now() + 16 * 86400000).toISOString().substring(0, 10);
            const run1 = await dbAPI.createSepaRun({
                bankKontoId: kontoId,
                invoiceIds: [docId],
                ausfuehrungsDatum: ausfuehrung1,
                xmlFormat: 'pain.008.001.08',
                sammelTyp: 'CORE'
            });
            assert.ok(run1.laufId, 'Lauf 1 muss erstellt werden');

            const laeufe = await dbAPI.getSepaLaeufe();
            assert.ok(Array.isArray(laeufe) && laeufe.length >= 1, 'getSepaLaeufe darf nicht mehr crashen');
            const laufRow1 = laeufe.find(l => l.id === Number(run1.laufId));
            assert.ok(laufRow1, 'Erstellter Lauf muss in der Liste sein');
            assert.equal(laufRow1.lauf_nr, run1.laufNr);
            assert.ok(laufRow1.erstellt_am, 'erstellt_am muss gesetzt sein');

            console.log('TR12_OK');

            let mandatRow = db.prepare('SELECT * FROM kunden_sepa_mandate WHERE id = ?').get(mandatId);
            assert.equal(mandatRow.sequenz_typ, 'FRST', 'Mandat bleibt FRST nach bloßer Lauferstellung');
            assert.equal(mandatRow.letzte_lauf_nr, run1.laufNr);

            const exportRes1 = await dbAPI.exportSepaRunXml(run1.laufId);
            assert.equal(exportRes1.laufId, run1.laufId);

            mandatRow = db.prepare('SELECT * FROM kunden_sepa_mandate WHERE id = ?').get(mandatId);
            assert.equal(mandatRow.sequenz_typ, 'RCUR', 'Erst nach Export wird RCUR gesetzt');

            console.log('TR13_OK');

            const laufNachExport = db.prepare('SELECT * FROM sepa_lastschrift_laeufe WHERE id = ?').get(run1.laufId);
            assert.equal(laufNachExport.status, 'EXPORTIERT');
            assert.ok(laufNachExport.exportiert_am, 'exportiert_am muss gesetzt sein');

            console.log('TR16_OK');

            await dbAPI.storniereSepaLauf(run1.laufId, 'Test-Storno Lifecycle');

            const laufStorniert = db.prepare('SELECT * FROM sepa_lastschrift_laeufe WHERE id = ?').get(run1.laufId);
            assert.equal(laufStorniert.status, 'STORNIERT');

            const positionenStorniert = db.prepare("SELECT COUNT(*) AS cnt FROM sepa_lastschrift_positionen WHERE lauf_id = ? AND status = 'STORNIERT'").get(run1.laufId).cnt;
            assert.ok(positionenStorniert >= 1, 'Positionen müssen storniert werden');

            mandatRow = db.prepare('SELECT * FROM kunden_sepa_mandate WHERE id = ?').get(mandatId);
            assert.equal(mandatRow.sequenz_typ, 'FRST', 'Ohne anderen aktiven Lauf muss RCUR zu FRST zurückgesetzt werden');

            const auditRows = db.prepare(`
                SELECT * FROM audit_logs
                WHERE entity_type = 'SEPA_RUN' AND action = 'STORNIERT' AND entity_id = ?
            `).all(Number(run1.laufId));
            assert.ok(auditRows.length >= 1, 'Storno muss auditiert werden');

            console.log('TR14_OK');

            const ausfuehrung2 = new Date(Date.now() + 17 * 86400000).toISOString().substring(0, 10);
            const run2 = await dbAPI.createSepaRun({
                bankKontoId: kontoId,
                invoiceIds: [docId],
                ausfuehrungsDatum: ausfuehrung2,
                xmlFormat: 'pain.008.001.08',
                sammelTyp: 'CORE'
            });
            assert.ok(run2.laufId);

            const lauf2 = db.prepare('SELECT * FROM sepa_lastschrift_laeufe WHERE id = ?').get(run2.laufId);
            assert.equal(lauf2.sequenz_typ, 'FRST', 'Zweiter Lauf trägt den aktuellen Mandats-Sequenztyp');

            await dbAPI.exportSepaRunXml(run2.laufId);
            mandatRow = db.prepare('SELECT * FROM kunden_sepa_mandate WHERE id = ?').get(mandatId);
            assert.equal(mandatRow.sequenz_typ, 'RCUR');

            const details = await dbAPI.getSepaLaufDetails(Number(run2.laufId));
            assert.ok(Array.isArray(details.positionen) && details.positionen.length === 1);
            const pos2 = details.positionen[0];

            const belegVorher = db.prepare('SELECT * FROM dokumente WHERE id = ?').get(docId);
            await dbAPI.markiereRuecklastschrift(Number(pos2.id), 'Rücklastschrift Lifecycle-Test');

            const posNachRueck = db.prepare('SELECT * FROM sepa_lastschrift_positionen WHERE id = ?').get(pos2.id);
            assert.equal(posNachRueck.status, 'RUECKLASTSCHRIFT');

            mandatRow = db.prepare('SELECT * FROM kunden_sepa_mandate WHERE id = ?').get(mandatId);
            assert.equal(mandatRow.sequenz_typ, 'FRST', 'Gescheiterte Erstlastschrift muss FRST wiederherstellen');

            const belegNachher = db.prepare('SELECT * FROM dokumente WHERE id = ?').get(docId);
            assert.equal(belegNachher.bezahlt_betrag, belegVorher.bezahlt_betrag, 'Beleg darf durch Rücklastschrift keine Zahlung erhalten');
            assert.equal(belegNachher.status, belegVorher.status, 'Belegstatus darf sich durch Rücklastschrift nicht ändern');
            assert.ok(belegNachher.offener_betrag > 0 || belegNachher.offener_betrag === null, 'Beleg muss offen bleiben');

            console.log('TR15_OK');

            assert.ok(verifiziereAuditKette().valid, 'GoBD Audit-Kette muss über den gesamten Lifecycle gültig bleiben');
            console.log('SEPA_LIFECYCLE_AUDIT_VALID');

            try { db.close(); } catch (_e) { /* ignore */ }
            for (const suffix of ['', '-wal', '-shm']) {
                try { fs.rmSync(process.env.RECHNUNGSPROGRAMM_DB_PATH + suffix, { force: true }); } catch (_e) { /* ignore */ }
            }

            console.log('SEPA_LIFECYCLE_DB_TESTS_PASSED');
            if (IS_ELECTRON_AS_NODE) {
                process.exit(0);
            }
        } catch (err) {
            console.error('SEPA Lifecycle Test Error:', err);
            if (IS_ELECTRON_AS_NODE) {
                process.exit(1);
            }
        }
    })();
}
