const { getElectronPath } = require('./test_electron_helper');
/**
 * lieferschein.test.js (J8) - Kunden-Lieferschein: eigene Nr, Camino Angebot->LS->Rechnung,
 * Doppel-Uebernahme idempotent, TEST-BAU-01-Mini (2500/475/2975).
 *
 * Laeuft gegen eine isolierte SQLite-Test-DB (RECHNUNGSPROGRAMM_DB_PATH), damit die
 * echte Anwendungsdatenbank nie beruehrt wird. Das native better-sqlite3 ist fuer die
 * Electron-Runtime gebaut - im System-Node wird der Test daher einmalig ueber die
 * Electron-Binary (ELECTRON_RUN_AS_NODE=1) erneut ausgefuehrt (Muster wie
 * data_integrity.test.js).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const IS_ELECTRON_AS_NODE = !!process.versions.electron;
const RUN_INNER_MARKER = 'LIEFERSCHEIN_INNER_RUN';

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
    const tmpDb = path.join(os.tmpdir(), `lieferschein-test-${Date.now()}-${process.pid}.sqlite`);
    process.env.RECHNUNGSPROGRAMM_DB_PATH = tmpDb;
    const { db, dbAPI } = require('../db.js');
    return { db, dbAPI, tmpDb };
}

// ---------------------------------------------------------------------------
// Einstiegspunkt im System-Node: Re-Execution unter Electron-as-Node
// ---------------------------------------------------------------------------
if (!IS_ELECTRON_AS_NODE && !canLoadBetterSqlite()) {
    test('Kunden-Lieferschein J8 (DB-Ebene, via Electron-as-Node Runtime)', () => {
        const electronBin = getElectronPath();
        assert.ok(fs.existsSync(electronBin), 'Electron-Binary muss als Node-Runtime verfuegbar sein');

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

        assert.match(stdout, /LIEFERSCHEIN_DB_TESTS_PASSED/, 'Alle Lieferschein-Assertions muessen unter der App-Runtime bestehen');
    });
} else {
    // -------------------------------------------------------------------------
    // Eigentliche Tests (laufen unter Electron-as-Node)
    // -------------------------------------------------------------------------
    const { db, dbAPI, tmpDb } = getDbModule();

    db.prepare("INSERT OR IGNORE INTO kunden (id, name, createdAt) VALUES (1, 'TEST-BAU-01', CURRENT_TIMESTAMP)").run();

    function miniAngebot(nr) {
        return {
            type: 'angebot',
            nr,
            datum: '2026-10-08',
            faellig: '2026-11-07',
            kundeId: 1,
            status: 'Angenommen',
            angebot_status: 'ANGENOMMEN',
            netto: 2500,
            steuer: 475,
            brutto: 2975,
            eingabemodus: 'netto',
            positionen: [
                { name: 'TEST-BAU-01 Mini Leistung', menge: 1, einheit: 'Stk.', preis: 2500, mwst: 19 }
            ],
            isLocked: false
        };
    }

    // Frontend-Logik aus convertToRechnung (editor-save-angebot.js) als reine Funktion:
    // LS-Positionen tragen Herkunft `LS:{lsId}:POS:{pos}`; Zweituebernahme ist ein No-Op.
    function mergeLsIntoRechnung(currentPos, lsDoc) {
        const list = Array.isArray(currentPos) ? currentPos : [];
        for (const pos of (lsDoc.positionen || [])) {
            const key = `LS:${lsDoc.id}:POS:${pos.id || pos.oz || pos.oz_code || pos.name}`;
            if (!list.find((p) => p.lieferschein_quelle === key)) {
                list.push({ ...pos, lieferschein_quelle: key });
            }
        }
        return list;
    }

    test.after(() => {
        try { db.close(); } catch (_e) { /* ignore */ }
        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.rmSync(tmpDb + suffix, { force: true }); } catch (_e) { /* ignore */ }
        }
    });

    test('J8 Camino: Angebot -> Lieferschein -> Rechnung (TEST-BAU-01-Mini)', async (t) => {
        await t.test('Angebot 2500/475/2975 anlegen', async () => {
            const angId = await dbAPI.saveDocument(miniAngebot('ANG-2026-J8-001'));
            assert.ok(angId > 0, 'Angebot gespeichert');
            const ang = db.prepare('SELECT * FROM dokumente WHERE id=?').get(angId);
            assert.strictEqual(ang.netto, 2500);
            assert.strictEqual(ang.steuer, 475);
            assert.strictEqual(ang.brutto, 2975);
        });

        let lsId;
        await t.test('Lieferschein mit eigener Nr aus Angebot erzeugen', async () => {
            const ang = db.prepare("SELECT * FROM dokumente WHERE nr='ANG-2026-J8-001'").get();
            assert.ok(ang, 'Angebot geladen');
            const angPos = db.prepare('SELECT * FROM positionen WHERE dokumentId=?').all(ang.id);
            assert.strictEqual(angPos.length, 1);

            lsId = await dbAPI.saveDocument({
                type: 'lieferschein',
                nr: 'LS-2026-0001',
                datum: '2026-10-08',
                faellig: '2026-10-08',
                kundeId: ang.kundeId,
                projektId: ang.projektId || null,
                status: 'Offen',
                vortext: `Wir liefern Ihnen folgende Positionen gemaess ${ang.nr}.`,
                fusstext: 'Wir bitten um Pruefung und Bestaetigung des Erhalts.',
                netto: ang.netto,
                steuer: ang.steuer,
                brutto: ang.brutto,
                parent_angebot_id: ang.id,
                positionen: angPos.map((p) => ({
                    name: p.name, menge: p.menge, einheit: p.einheit,
                    preis: p.preis, mwst: p.mwst, oz_code: p.oz_code || null
                })),
                isLocked: false
            });
            assert.ok(lsId > 0, 'Lieferschein gespeichert');

            // Reload-Read-Nachweis
            const reloaded = await dbAPI.getDocumentById(lsId);
            assert.ok(reloaded, 'LS per Reload-Read ladbar');
            assert.strictEqual(reloaded.nr, 'LS-2026-0001');
            assert.strictEqual(reloaded.type, 'lieferschein');
            assert.strictEqual(reloaded.parent_angebot_id, ang.id);
            assert.strictEqual((reloaded.positionen || []).length, 1);

            const state = await dbAPI.getFullState();
            const inDokumente = (state.dokumente || []).find((d) => d.id === lsId);
            assert.ok(inDokumente, 'LS in getFullState().dokumente sichtbar');
        });

        await t.test('LS-Nummernkreis ist je Typ eindeutig', async () => {
            await assert.rejects(
                () => dbAPI.saveDocument({
                    type: 'lieferschein', nr: 'LS-2026-0001', datum: '2026-10-08',
                    kundeId: 1, status: 'Offen', positionen: [], isLocked: false
                }),
                /bereits vergeben/i
            );
        });

        await t.test('LS-Positionen in Rechnung uebernehmen (Herkunft + Idempotenz)', async () => {
            const ls = await dbAPI.getDocumentById(lsId);
            let rePos = mergeLsIntoRechnung([], ls);
            assert.strictEqual(rePos.length, 1);
            assert.match(rePos[0].lieferschein_quelle, new RegExp(`^LS:${lsId}:POS:`));

            // Doppel-Uebernahme: keine Duplikate
            rePos = mergeLsIntoRechnung(rePos, ls);
            assert.strictEqual(rePos.length, 1, 'Zweituebernahme erzeugt keine Duplikate');

            const reId = await dbAPI.saveDocument({
                type: 'rechnung',
                nr: 'RE-2026-J8-001',
                datum: '2026-10-09',
                faellig: '2026-11-08',
                kundeId: ls.kundeId,
                projektId: ls.projektId || null,
                status: 'Entwurf',
                netto: 2500,
                steuer: 475,
                brutto: 2975,
                positionen: rePos,
                isLocked: false
            });
            assert.ok(reId > 0, 'Rechnung gespeichert');

            // Persistenz-Nachweis: Herkunftsvermerk ueberlebt Reload
            const reloaded = await dbAPI.getDocumentById(reId);
            assert.strictEqual((reloaded.positionen || []).length, 1);
            assert.match(
                String(reloaded.positionen[0].lieferschein_quelle || ''),
                new RegExp(`^LS:${lsId}:POS:`),
                'Herkunftsvermerk persistiert'
            );
        });

        await t.test('lieferscheine_digital (Lieferanten-Fotos) unangetastet', () => {
            const tbl = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='lieferscheine_digital'").get();
            assert.ok(tbl, 'Tabelle lieferscheine_digital existiert');
            assert.match(tbl.sql, /lieferant_name/, 'Lieferanten-Spalte vorhanden');
            assert.match(tbl.sql, /foto_pfad/, 'Foto-Spalte vorhanden');
            assert.match(tbl.sql, /sha256/, 'Hash-Spalte vorhanden');
            assert.doesNotMatch(tbl.sql, /kundeId|kundenbeleg/i, 'Kein Kundenbeleg-Umbau');
        });
    });

    // Abschlussmarker fuer den Wrapper-Lauf im System-Node
    console.log('LIEFERSCHEIN_DB_TESTS_PASSED');
}
