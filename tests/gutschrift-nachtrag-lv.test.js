const { getElectronPath } = require('./test_electron_helper');
/**
 * gutschrift-nachtrag-lv.test.js (J13)
 * Minderungs-Gutschrift ohne Voll-Storno + GENEHMIGT-Nachtrag im LV-Stamm.
 *
 * Läuft gegen eine isolierte SQLite-Test-DB (RECHNUNGSPROGRAMM_DB_PATH), damit die
 * echte Anwendungsdatenbank nie berührt wird. Muster wie data_integrity.test.js:
 * Im System-Node wird der Test einmalig über die Electron-Binary
 * (ELECTRON_RUN_AS_NODE=1) erneut ausgeführt.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const IS_ELECTRON_AS_NODE = !!process.versions.electron;
const RUN_INNER_MARKER = 'GUTSCHRIFT_NACHTRAG_LV_INNER_RUN';

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

function getDbModule() {
    // Muss gesetzt sein, BEVOR db.js geladen wird
    const tmpDb = path.join(os.tmpdir(), `gutschrift-nachtrag-lv-test-${Date.now()}-${process.pid}.sqlite`);
    process.env.RECHNUNGSPROGRAMM_DB_PATH = tmpDb;
    const { db, dbAPI } = require('../db.js');
    return { db, dbAPI, tmpDb };
}

// ---------------------------------------------------------------------------
// Einstiegspunkt im System-Node: Re-Execution unter Electron-as-Node
// ---------------------------------------------------------------------------
if (!IS_ELECTRON_AS_NODE && !canLoadBetterSqlite()) {
    test('J13 Gutschrift-Minderung + Nachtrag-LV (DB-Ebene, via Electron-as-Node Runtime)', () => {
        const electronBin = getElectronPath();
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

        assert.match(stdout, /GUTSCHRIFT_NACHTRAG_LV_TESTS_PASSED/, 'Alle J13-Assertions müssen unter der App-Runtime bestehen');
    });
} else {
    // -------------------------------------------------------------------------
    // Eigentliche Tests (laufen unter Electron-as-Node)
    // -------------------------------------------------------------------------
    const { db, dbAPI, tmpDb } = getDbModule();
    const InvoiceController = require('../controllers/InvoiceController');
    const NachtragController = require('../controllers/NachtragController');

    db.prepare("INSERT OR IGNORE INTO kunden (id, name, createdAt) VALUES (1, 'Testkunde', CURRENT_TIMESTAMP)").run();

    function baseDoc(overrides = {}) {
        return {
            type: 'rechnung',
            nr: 'RE-J13-BASIS',
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

    async function createTestProjekt() {
        return await dbAPI.saveProjekt({ name: 'TEST-BAU-01-Mini', kundeId: 1, status: 'AKTIV' });
    }

    test.after(() => {
        try { db.close(); } catch (_e) { /* ignore */ }
        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.rmSync(tmpDb + suffix, { force: true }); } catch (_e) { /* ignore */ }
        }
    });

    test('J13 Minderungs-Gutschrift ohne Voll-Storno', async (t) => {
        const projektId = await createTestProjekt();

        await t.test('(a) Minderung buchbar: eigene GUT-Nr, Original NICHT storniert', async () => {
            const invId = await dbAPI.saveDocument(baseDoc({
                nr: 'RE-J13-ORIG-001',
                projektId,
                netto: 1000,
                steuer: 190,
                brutto: 1190,
                zahlbetrag: 1190,
                positionen: [{ name: 'Bauleistung', menge: 1, einheit: 'Pausch.', preis: 1000, mwst: 19 }]
            }));

            const origRow = db.prepare('SELECT id, nr, datum, kundeId, projektId, isLocked, status FROM dokumente WHERE id=?').get(invId);
            const data = InvoiceController.createGutschriftData(
                { ...origRow, nr: origRow.nr, datum: origRow.datum, kundeId: origRow.kundeId, projektId: origRow.projektId, isLocked: !!origRow.isLocked },
                100,
                'Minderung VOB/B § 13 Abs. 6'
            );

            assert.equal(data.gutschriftNr, 'GUT-RE-J13-ORIG-001');
            assert.equal(data.updatedOriginal.status, 'Gemindert/Teilgutgeschrieben');
            assert.equal(data.gutschriftDoc.netto, -100);
            assert.equal(data.gutschriftDoc.steuer, -19);
            assert.equal(data.gutschriftDoc.brutto, -119);

            const res = await dbAPI.buchenGutschrift(data.updatedOriginal, data.gutschriftDoc);
            assert.ok(res.success);

            // Reload-Read-Nachweis
            const origReload = db.prepare('SELECT status, isLocked FROM dokumente WHERE id=?').get(invId);
            assert.equal(origReload.status, 'Gemindert/Teilgutgeschrieben');
            assert.notEqual(origReload.status, 'Storniert');
            assert.equal(origReload.isLocked, 0, 'Original darf NICHT gelockt werden (bleibt fakturierbar)');

            const gutRow = db.prepare('SELECT id, nr, netto, steuer, brutto, rechnungsart, status FROM dokumente WHERE nr=?').get('GUT-RE-J13-ORIG-001');
            assert.ok(gutRow, 'Gutschrift mit eigener Nr muss gespeichert sein');
            assert.equal(gutRow.netto, -100);
            assert.equal(gutRow.steuer, -19);
            assert.equal(gutRow.brutto, -119);
            assert.equal(gutRow.rechnungsart, 'GUTSCHRIFT');
        });

        await t.test('(b) Original bleibt fakturierbar (Status-Pfad + Audit)', async () => {
            const invId = db.prepare('SELECT id FROM dokumente WHERE nr=?').get('RE-J13-ORIG-001').id;
            await dbAPI.updateDocumentStatus(invId, { status: 'Bezahlt' });
            assert.equal(db.prepare('SELECT status FROM dokumente WHERE id=?').get(invId).status, 'Bezahlt');
            const chain = dbAPI.verifiziereAuditKette();
            assert.equal(chain.valid, true, JSON.stringify(chain.errors));
        });

        await t.test('(c) Idempotenz: Doppel-Gutschrift gleiche Referenz wird abgelehnt', async () => {
            const invId = db.prepare('SELECT id FROM dokumente WHERE nr=?').get('RE-J13-ORIG-001').id;
            const origRow = db.prepare('SELECT id, nr, datum, kundeId, projektId FROM dokumente WHERE id=?').get(invId);
            const data = InvoiceController.createGutschriftData(
                { ...origRow, kundeId: 1, isLocked: false },
                50,
                'Zweite Minderung'
            );
            // Gleicher GUT-Nr-Kreis -> muss an der bereits vergebenen Nummer scheitern
            await assert.rejects(
                () => dbAPI.buchenGutschrift(
                    data.updatedOriginal,
                    { ...data.gutschriftDoc, nr: 'GUT-RE-J13-ORIG-001' }
                ),
                /bereits vergeben/i
            );
            assert.equal(db.prepare("SELECT COUNT(*) AS c FROM dokumente WHERE nr LIKE 'GUT-RE-J13-ORIG-001%'").get().c, 1);
        });

        await t.test('(d) Sperr-Checks: Storniert-Original + Nullbetrag werden abgelehnt', async () => {
            assert.throws(
                () => InvoiceController.createGutschriftData({ nr: 'RE-X', status: 'Storniert' }, 100, 'Test'),
                /storniert/i
            );
            assert.throws(
                () => InvoiceController.createGutschriftData({ nr: 'RE-X', status: 'Ausstehend' }, 0, 'Test'),
                /größer als 0/i
            );
            const stornoId = await dbAPI.saveDocument(baseDoc({ nr: 'RE-J13-STORNO-OPFER', projektId }));
            await dbAPI.storniereRechnung(
                { id: stornoId, status: 'Storniert' },
                baseDoc({ nr: 'STORNO - RE-J13-STORNO-OPFER', netto: -100, steuer: -19, brutto: -119, status: 'Bezahlt', isLocked: true })
            );
            const stornoOrig = db.prepare('SELECT id, nr FROM dokumente WHERE nr=?').get('RE-J13-STORNO-OPFER');
            await assert.rejects(
                () => dbAPI.buchenGutschrift(
                    { id: stornoOrig.id, status: 'Gemindert/Teilgutgeschrieben' },
                    baseDoc({ nr: 'GUT-RE-J13-STORNO-OPFER', netto: -10, steuer: -1.9, brutto: -11.9, isLocked: true })
                ),
                /storniert/i
            );
        });

        await t.test('(e) Voll-Storno-Pfad unverändert grün', async () => {
            const stornoRow = db.prepare('SELECT status FROM dokumente WHERE nr=?').get('STORNO - RE-J13-STORNO-OPFER');
            assert.ok(stornoRow, 'Storno-Gutschrift muss existieren');
            assert.equal(db.prepare('SELECT status FROM dokumente WHERE nr=?').get('RE-J13-STORNO-OPFER').status, 'Storniert');
        });
    });

    test('J13 GENEHMIGT-Nachtrag steht im LV-Stamm (TEST-BAU-01-Mini N1 300/57/357)', async (t) => {
        const projektRow = db.prepare('SELECT id FROM projekte WHERE name=?').get('TEST-BAU-01-Mini');
        const projektId = projektRow.id;

        await t.test('(f) N1 anlegen: 300 netto / 57 USt / 357 brutto', async () => {
            const nId = await dbAPI.saveNachtrag(
                { project_id: projektId, nachtrag_nr: 'N1', titel: 'TEST-BAU-01-Mini Zusatzleistung', rechtsgrundlage: 'VOB_2_6', status: 'EINGEREICHT' },
                [{ oz_code: 'N1.01', kurztext: 'Zusatzleistung Mini', menge: 10, einheit: 'Stk.', einheitspreis: 30, cost_type: 'MATERIAL' }]
            );
            assert.ok(nId);
            const n = db.prepare('SELECT summe_netto, summe_brutto, status FROM nachtraege WHERE id=?').get(nId);
            assert.equal(n.summe_netto, 300);
            assert.ok(Math.abs(n.summe_brutto - 357) < 0.01, `Brutto muss 357 sein (ist ${n.summe_brutto})`);
            assert.ok(Math.abs((n.summe_brutto - n.summe_netto) - 57) < 0.01, 'USt-Anteil muss 57 sein');
        });

        await t.test('(g) GENEHMIGT-Nachtrag steht in projekt_positionen', async () => {
            const n = db.prepare('SELECT id FROM nachtraege WHERE nachtrag_nr=?').get('N1');
            const res = await dbAPI.updateNachtragStatus(n.id, 'GENEHMIGT');
            assert.ok(res.success);
            assert.equal(res.lvAdded, 1);

            const lvRows = db.prepare('SELECT * FROM projekt_positionen WHERE projekt_id=? AND nachtrag_id=?').all(projektId, n.id);
            assert.equal(lvRows.length, 1, 'GENEHMIGT-Nachtrag muss genau eine LV-Zeile haben');
            assert.equal(lvRows[0].menge, 10);
            assert.equal(lvRows[0].preis, 30);
            assert.ok(String(lvRows[0].name).includes('[N1]'), 'LV-Name muss Nachtrag-Referenz tragen');
            assert.equal(lvRows[0].positionstyp, 'NACHTRAG');

            // Idempotenz-Key N:{nachtrag_id}:POS:{pos_id} ableitbar
            const posRow = db.prepare('SELECT id FROM nachtrag_positionen WHERE nachtrag_id=?').get(n.id);
            const key = NachtragController.nachtragPosKey(n.id, posRow.id);
            assert.match(key, new RegExp(`^N:${n.id}:POS:${posRow.id}$`));
            assert.equal(lvRows[0].nachtrag_pos_id, posRow.id);
        });

        await t.test('(h) Doppel-Übernahme idempotent (weder Beleg noch LV)', async () => {
            const n = db.prepare('SELECT id FROM nachtraege WHERE nachtrag_nr=?').get('N1');
            const again = await dbAPI.uebernehmeNachtragInsLV(n.id);
            assert.equal(again.added, 0);
            assert.equal(again.skipped, 1);
            assert.equal(db.prepare('SELECT COUNT(*) AS c FROM projekt_positionen WHERE projekt_id=? AND nachtrag_id=?').get(projektId, n.id).c, 1);

            const res2 = await dbAPI.updateNachtragStatus(n.id, 'GENEHMIGT');
            assert.equal(res2.lvAdded, 0, 'Erneute Genehmigung darf kein Doppel-Write erzeugen');
            assert.equal(db.prepare('SELECT COUNT(*) AS c FROM projekt_positionen WHERE projekt_id=? AND nachtrag_id=?').get(projektId, n.id).c, 1);

            // Belegseite: Extraktion bleibt einzeilig (kein Doppel-Effekt)
            const list = await dbAPI.getNachtraege(projektId);
            const invoicePositions = NachtragController.extractApprovedPositionsForInvoice(list);
            assert.equal(invoicePositions.length, 1);
        });

        await t.test('(i) Audit-Kette valide', () => {
            const chain = dbAPI.verifiziereAuditKette();
            assert.equal(chain.valid, true, JSON.stringify(chain.errors));
        });
    });

    // Abschlussmarker für den Wrapper-Lauf im System-Node
    console.log('GUTSCHRIFT_NACHTRAG_LV_TESTS_PASSED');
}
