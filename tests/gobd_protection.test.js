/**
 * gobd_protection.test.js - GoBD Lösch-/Änderungsschutz & Audit-Hashkette
 *
 * Läuft gegen eine isolierte SQLite-Test-DB (RECHNUNGSPROGRAMM_DB_PATH),
 * damit die echte Anwendungsdatenbank nie berührt wird.
 *
 * Das native better-sqlite3 ist für die in Electron eingebettete Node-Runtime
 * gebaut (postinstall: electron-builder install-app-deps). Läuft der Test im
 * System-Node, führt er sich daher selbst einmalig unter
 * ELECTRON_RUN_AS_NODE=1 über die Electron-Binary erneut aus und wertet das
 * Ergebnis aus - die Assertions laufen also real gegen die echte DB-Schicht.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const IS_ELECTRON_AS_NODE = !!process.versions.electron;
const RUN_INNER_MARKER = 'GOBD_PROTECTION_INNER_RUN';

function canLoadBetterSqlite() {
    try {
        // Das Native-Addon lädt teils erst bei der Instanziierung - daher echte DB öffnen
        const DbCtor = require('better-sqlite3');
        const probe = new DbCtor(':memory:');
        probe.close();
        return true;
    } catch (_e) {
        return false;
    }
}

function getDbModule() {
    // Muss gesetzt sein, BEVOR db.js geladen wird
    const tmpDb = path.join(os.tmpdir(), `gobd-protection-test-${Date.now()}-${process.pid}.sqlite`);
    process.env.RECHNUNGSPROGRAMM_DB_PATH = tmpDb;
    const { db, dbAPI } = require('../db.js');
    const { calculateDocumentContentHash } = require('../main/audit.js');
    return { db, dbAPI, calculateDocumentContentHash, tmpDb };
}

// ---------------------------------------------------------------------------
// Einstiegspunkt im System-Node: Re-Execution unter Electron-as-Node
// ---------------------------------------------------------------------------
if (!IS_ELECTRON_AS_NODE && !canLoadBetterSqlite()) {
    test('GoBD Schutz & Audit-Kette (DB-Ebene, via Electron-as-Node Runtime)', () => {
        const electronBin = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
        assert.ok(fs.existsSync(electronBin), 'Electron-Binary muss als Node-Runtime verfügbar sein');

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

        assert.match(stdout, /GOBD_DB_TESTS_PASSED/, 'Alle DB-Ebenen-Assertions müssen unter der App-Runtime bestehen');
    });
} else {
    // -------------------------------------------------------------------------
    // Eigentliche DB-Ebenen-Tests (laufen unter Electron-as-Node)
    // -------------------------------------------------------------------------
    const { db, dbAPI, calculateDocumentContentHash, tmpDb } = getDbModule();

    // FK-Fixture: Frische Schemata erzwingen dokumente.kundeId -> kunden(id)
    db.prepare("INSERT OR IGNORE INTO kunden (id, name, createdAt) VALUES (1, 'Testkunde', CURRENT_TIMESTAMP)").run();

    function baseDoc(overrides = {}) {
        return {
            type: 'rechnung',
            nr: 'RE-GOBD-001',
            datum: '2026-08-01',
            faellig: '2026-08-31',
            kundeId: 1,
            status: 'Ausstehend',
            netto: 100,
            steuer: 19,
            brutto: 119,
            positionen: [
                { name: 'Testleistung', menge: 1, einheit: 'Stk.', preis: 100, mwst: 19 }
            ],
            isLocked: false,
            ...overrides
        };
    }

    function getRow(id) {
        return db.prepare('SELECT * FROM dokumente WHERE id=?').get(id);
    }

    test.after(() => {
        try { db.close(); } catch (_e) { /* ignore */ }
        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.rmSync(tmpDb + suffix, { force: true }); } catch (_e) { /* ignore */ }
        }
    });

    test('GoBD Lösch-/Änderungsschutz & Audit-Hashkette', async (t) => {
        let docId;

        await t.test('(f) saveDocument legt Beleg an und befüllt sha256_hash konsistent', async () => {
            docId = await dbAPI.saveDocument(baseDoc());
            const row = getRow(docId);
            assert.ok(row, 'Beleg muss existieren');
            assert.ok(row.sha256_hash && /^[0-9a-f]{64}$/.test(row.sha256_hash), 'sha256_hash muss gesetzt sein');

            // EIN konsistenter Algorithmus: gespeicherter Hash muss mit dem
            // zentralen Inhalts-Hash des DB-Standes übereinstimmen.
            const stored = { ...row, positionen: db.prepare('SELECT * FROM positionen WHERE dokumentId=?').all(docId) };
            assert.equal(stored.sha256_hash, calculateDocumentContentHash(stored));
        });

        await t.test('Beleg sperren (Inhalte unverändert, isLocked false->true) ist erlaubt', async () => {
            await dbAPI.saveDocument(baseDoc({ id: docId, isLocked: true }));
            assert.equal(getRow(docId).isLocked, 1);
        });

        await t.test('(a) Inhaltsänderung an gesperrtem Beleg wirft', async () => {
            await assert.rejects(
                () => dbAPI.saveDocument(baseDoc({ id: docId, isLocked: true, brutto: 999 })),
                /gesperrt/i
            );
            await assert.rejects(
                () => dbAPI.saveDocument(baseDoc({ id: docId, isLocked: true, nr: 'RE-GEAENDERT' })),
                /gesperrt/i
            );
            await assert.rejects(
                () => dbAPI.saveDocument(baseDoc({ id: docId, isLocked: true, positionen: [{ name: 'Neu', menge: 2, einheit: 'Stk.', preis: 50, mwst: 19 }] })),
                /gesperrt/i
            );
            // Nichts durfte geschrieben werden
            assert.equal(getRow(docId).brutto, 119);
        });

        await t.test('Entsperren via saveDocument (isLocked:true->false) wird abgelehnt', async () => {
            await assert.rejects(
                () => dbAPI.saveDocument(baseDoc({ id: docId, isLocked: false })),
                /entsperren|Freigabe/i
            );
            assert.equal(getRow(docId).isLocked, 1);
        });

        await t.test('(b) Status-/Zahlungszieländerung an gesperrtem Beleg klappt (schmaler Pfad)', async () => {
            const res = await dbAPI.updateDocumentStatus(docId, { status: 'Überfällig', faellig: '2026-09-30' });
            assert.ok(res.success);
            let row = getRow(docId);
            assert.equal(row.status, 'Überfällig');
            assert.equal(row.faellig, '2026-09-30');
            assert.equal(row.isLocked, 1);

            // Auch komplettes saveDocument mit unverändertem Inhalt bleibt erlaubt
            // (Storno-Muster: nur status/isLocked ändern sich).
            const full = { ...getRow(docId) };
            full.positionen = db.prepare('SELECT * FROM positionen WHERE dokumentId=?').all(docId);
            full.verrechnungen = [];
            full.isLocked = true;
            full.status = 'Storniert';
            await dbAPI.saveDocument(full);
            row = getRow(docId);
            assert.equal(row.status, 'Storniert');
            assert.equal(row.isLocked, 1);
        });

        await t.test('(c) deleteDocument auf gesperrtem Beleg wirft', async () => {
            await assert.rejects(() => dbAPI.deleteDocument(docId), /Löschsperre|gesperrt/i);
            assert.ok(getRow(docId), 'Gesperrter Beleg darf nicht gelöscht werden');
        });

        await t.test('(d) entsperreBeleg: ohne Begründung wirft, mit Begründung frei + Audit', async () => {
            await assert.rejects(() => dbAPI.entsperreBeleg(docId), /Begründung/i);
            await assert.rejects(() => dbAPI.entsperreBeleg(docId, '   '), /Begründung/i);

            const res = await dbAPI.entsperreBeleg(docId, 'Test-Freigabe nach Klärung');
            assert.ok(res.success);
            assert.equal(res.alreadyUnlocked, false);
            assert.equal(getRow(docId).isLocked, 0);

            const auditEntry = db.prepare("SELECT * FROM audit_logs WHERE action='ENTSPERRT' ORDER BY id DESC LIMIT 1").get();
            assert.ok(auditEntry, 'ENTSPERRT muss audit-protokolliert sein');
            const details = JSON.parse(auditEntry.details);
            assert.equal(details.grund, 'Test-Freigabe nach Klärung');
            assert.equal(details.nr, 'RE-GOBD-001');
        });

        await t.test('Nach Entsperrung sind Inhaltsänderungen wieder möglich', async () => {
            await dbAPI.saveDocument(baseDoc({
                id: docId,
                isLocked: false,
                netto: 200,
                steuer: 38,
                brutto: 238,
                positionen: [{ name: 'Testleistung', menge: 2, einheit: 'Stk.', preis: 100, mwst: 19 }]
            }));
            assert.equal(getRow(docId).brutto, 238);
        });

        await t.test('deleteDocument: Ungesperrter Entwurf bleibt löschbar + Audit GELÖSCHT', async () => {
            const draftId = await dbAPI.saveDocument(baseDoc({ nr: 'ENTWURF-001', status: 'Entwurf' }));
            await dbAPI.deleteDocument(draftId);
            assert.equal(db.prepare('SELECT COUNT(*) AS c FROM dokumente WHERE id=?').get(draftId).c, 0);

            const delAudit = db.prepare("SELECT * FROM audit_logs WHERE action='GELÖSCHT' AND entity_id=?").get(draftId);
            assert.ok(delAudit, 'Löschung muss audit-protokolliert sein');
        });

        await t.test('bulkSaveDocuments: gesperrter Beleg blockt ganze Transaktion (Rollback)', async () => {
            const lockedId = await dbAPI.saveDocument(baseDoc({ nr: 'RE-BULK-LOCKED', status: 'Ausstehend' }));
            await dbAPI.saveDocument(baseDoc({ id: lockedId, nr: 'RE-BULK-LOCKED', isLocked: true }));

            await assert.rejects(
                () => dbAPI.bulkSaveDocuments([
                    baseDoc({ id: lockedId, isLocked: true, brutto: 555 }),
                    baseDoc({ nr: 'RE-BULK-NEW' })
                ]),
                /gesperrt/i
            );
            // Transaktion muss vollständig zurückgerollt sein
            assert.equal(db.prepare('SELECT COUNT(*) AS c FROM dokumente WHERE nr=?').get('RE-BULK-NEW').c, 0, 'Neuer Beleg darf bei Rollback nicht existieren');
            assert.equal(getRow(lockedId).brutto, 119, 'Gesperrter Beleg darf nicht geändert sein');

            // Status-only Bulk an gesperrtem Beleg ist erlaubt (checkOverdueInvoices-Muster)
            await dbAPI.bulkSaveDocuments([baseDoc({ id: lockedId, nr: 'RE-BULK-LOCKED', isLocked: true, status: 'Überfällig' })]);
            assert.equal(getRow(lockedId).status, 'Überfällig');
            assert.equal(getRow(lockedId).isLocked, 1);
        });

        await t.test('GoBD: Schlägt das Audit fehl, MUSS die Mutation fehlschlagen (Rollback)', async () => {
            db.exec('ALTER TABLE audit_logs RENAME TO audit_logs_off');
            let mutationThrew = false;
            try {
                await dbAPI.saveDocument(baseDoc({ nr: 'RE-OHNE-AUDIT' }));
            } catch (_e) {
                mutationThrew = true;
            }
            assert.ok(mutationThrew, 'Mutation ohne schreibbares Audit muss fehlschlagen');
            assert.equal(db.prepare('SELECT COUNT(*) AS c FROM dokumente WHERE nr=?').get('RE-OHNE-AUDIT').c, 0, 'Beleg darf nicht unprotokolliert persistiert werden');
            db.exec('ALTER TABLE audit_logs_off RENAME TO audit_logs');
        });

        await t.test('(e) verifiziereAuditKette: true nach Mutationen, false nach Manipulation', async () => {
            const result = dbAPI.verifiziereAuditKette();
            assert.equal(result.valid, true, 'Kette nach mehreren Mutationen muss gültig sein: ' + JSON.stringify(result.errors));
            assert.ok(result.checked >= 8, `Es müssen mehrere Einträge geprüft werden (war: ${result.checked})`);

            // Manipulation eines Eintrags -> Kette ungültig
            const victim = db.prepare('SELECT id FROM audit_logs ORDER BY id ASC LIMIT 1').get();
            db.prepare("UPDATE audit_logs SET details='{\"nr\":\"MANIPULIERT\"}' WHERE id=?").run(victim.id);
            const tampered = dbAPI.verifiziereAuditKette();
            assert.equal(tampered.valid, false);
            assert.ok(tampered.errors.length > 0);

            // Verkettungs-Manipulation ebenfalls erkennen (zweiten Eintrag kappen)
            const second = db.prepare('SELECT id, current_hash FROM audit_logs ORDER BY id ASC LIMIT 1 OFFSET 1').get();
            db.prepare('UPDATE audit_logs SET current_hash=? WHERE id=?').run('0'.repeat(64), second.id);
            const brokenChain = dbAPI.verifiziereAuditKette();
            assert.equal(brokenChain.valid, false);
            assert.ok(brokenChain.errors.length >= 2);
        });

        // Abschlussmarker für den Wrapper-Lauf im System-Node
        console.log('GOBD_DB_TESTS_PASSED');
    });
}
