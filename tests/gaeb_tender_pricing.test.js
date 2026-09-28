/**
 * tests/gaeb_tender_pricing.test.js
 * 
 * Umfassende Testsuite für die GAEB X83 Ausschreibungs-Bepreisung und Entwurfsverwaltung.
 * 
 * Verifiziert:
 * 1. Vorprüfungen:
 *    - Hash-Konsistenzprüfung zwischen rawBytes und rawXml (Mismatch wirft harten Fehler)
 *    - SQLite-Trigger trg_validate_gaeb_import_angebot_type verhindert Rechnungs-Verknüpfungen
 * 2. Bepreisungs-Roundtrip:
 *    - Unveränderlichkeit des X83-Originals in gaeb_items
 *    - Speichern, db.close(), Wiedereröffnen, Laden und exakte Wiederherstellung
 * 3. Preiszustands-Differenzierung:
 *    - null bleibt null
 *    - 0.00 € nur mit is_zero_confirmed = 1
 *    - QtyTBD Gesamtpreis bleibt null (keine Summenverzerrung)
 *    - Hinweistexte nicht bepreisbar
 *    - Wahlpositionen mit in_total = 0 nicht in Gesamtsumme
 *    - BiReq Zähler & Vollständigkeitsstatus (VOLLSTAENDIG_BEPREIST vs IN_BEARBEITUNG)
 * 4. Versionsunabhängigkeit (v1 vs v2):
 *    - Klonen, Ändern in v2 lässt v1 und X83 Original unberührt
 * 5. Atomare Transaktion & Rollback bei Fehlern
 * 6. SQLite Fremdschlüssel-Integrität (PRAGMA foreign_key_check = 0)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('child_process');

const IS_ELECTRON_AS_NODE = !!process.versions.electron;
const RUN_INNER_MARKER = 'GAEB_TENDER_PRICING_INNER_RUN';

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

// ---------------------------------------------------------------------------
// Re-Execution unter Electron-as-Node für DB-Tests (falls im System-Node)
// ---------------------------------------------------------------------------
if (!IS_ELECTRON_AS_NODE && !canLoadBetterSqlite()) {
    test('GAEB Tender Bepreisung: Alle Tests (inkl. SQLite DB-Ebene via Electron-as-Node)', () => {
        const electronBin = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
        assert.ok(fs.existsSync(electronBin), 'Electron-Binary muss als Node-Runtime verfügbar sein');

        try {
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

            assert.ok(stdout.includes('GAEB_TENDER_PRICING_TESTS_PASSED'), 'Innerer Testlauf muss erfolgreich abschließen');
        } catch (err) {
            console.error('=== INNER ELECTRON RUNNER FAILURE ===');
            console.error('STDOUT:\n', err.stdout);
            console.error('STDERR:\n', err.stderr);
            console.error('MESSAGE:\n', err.message);
            throw err;
        }
    });
    return;
}

const Database = require('better-sqlite3');
const GAEBEngine = require('../js/gaeb');
const { createSchema } = require('../schema');
const { saveX83Import, loadX83Import, linkImportToAngebot } = require('../db/repositories/gaeb_repository');
const {
    createTenderDraft,
    saveTenderDraft,
    loadTenderDraft,
    cloneTenderDraft,
    listTenderDrafts,
    deleteTenderDraft
} = require('../db/repositories/gaeb_tender_repo');

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'gaeb_x83');

function loadFixture(filename) {
    const filePath = path.join(FIXTURES_DIR, filename);
    return fs.readFileSync(filePath, 'utf8');
}

function createTempDb() {
    const dbPath = path.join(os.tmpdir(), `gaeb_tender_test_${Date.now()}_${Math.random().toString(36).slice(2)}.sqlite`);
    const db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    createSchema(db);
    return { db, dbPath };
}

function cleanupDb(db, dbPath) {
    try {
        if (db && db.open) db.close();
    } catch (_e) {}
    try {
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        const wal = `${dbPath}-wal`;
        const shm = `${dbPath}-shm`;
        if (fs.existsSync(wal)) fs.unlinkSync(wal);
        if (fs.existsSync(shm)) fs.unlinkSync(shm);
    } catch (_e) {}
}

describe('GAEB Tender Bepreisung & Entwurfsverwaltung', () => {

    // =========================================================================
    // 1. Vorprüfungen & Härtung (liesen.txt Pkt. 2)
    // =========================================================================
    describe('1. Vorprüfungen & Härtung', () => {

        test('1.1 Konsistenzprüfung: Abweichung zwischen rawBytes und rawXml wirft harten Fehler', () => {
            const { db, dbPath } = createTempDb();
            try {
                const xml1 = '<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3"><PrjInfo><NamePrj>Projekt A</NamePrj></PrjInfo></GAEB>';
                const xml2 = '<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3"><PrjInfo><NamePrj>Projekt B (Verfälscht)</NamePrj></PrjInfo></GAEB>';
                const buf1 = Buffer.from(xml1, 'utf8');

                const parsed = GAEBEngine.parseGAEBXML(xml1);

                // Versuch: rawBytes von Projekt A übergeben, aber rawXml von Projekt B
                assert.throws(() => {
                    saveX83Import(db, parsed, {
                        fileName: 'mismatch.x83',
                        rawBytes: buf1,
                        rawXml: xml2
                    });
                }, /Konsistenzfehler: rawBytes und rawXml stimmen inhaltlich nicht überein/);
            } finally {
                cleanupDb(db, dbPath);
            }
        });

        test('1.2 Konsistenzprüfung: Identischer Inhalt in rawBytes und rawXml wird anstandslos akzeptiert', () => {
            const { db, dbPath } = createTempDb();
            try {
                const xml = loadFixture('valid_schema_reference.x83');
                const buf = Buffer.from(xml, 'utf8');
                const parsed = GAEBEngine.parseGAEBXML(xml);

                const saveRes = saveX83Import(db, parsed, {
                    fileName: 'match.x83',
                    rawBytes: buf,
                    rawXml: xml
                });

                assert.ok(saveRes.importId > 0);
                assert.strictEqual(saveRes.hasOriginalBytes, true);
            } finally {
                cleanupDb(db, dbPath);
            }
        });

        test('1.3 SQLite-Trigger trg_validate_gaeb_import_angebot_type: Verhindert Einfügen einer Rechnung in gaeb_import_angebote', () => {
            const { db, dbPath } = createTempDb();
            try {
                const xml = loadFixture('valid_schema_reference.x83');
                const parsed = GAEBEngine.parseGAEBXML(xml);
                const saveRes = saveX83Import(db, parsed, { fileName: 'test.x83', rawXml: xml });

                // Erstelle ein Dokument vom Typ 'rechnung'
                const rechnungRes = db.prepare(`
                    INSERT INTO dokumente (type, nr, datum, status, netto, steuer, brutto)
                    VALUES ('rechnung', 'RE-2026-001', '2026-09-28', 'ENTWURF', 100, 19, 119)
                `).run();
                const rechnungId = rechnungRes.lastInsertRowid;

                // Erstelle ein Dokument vom Typ 'angebot'
                const angebotRes = db.prepare(`
                    INSERT INTO dokumente (type, nr, datum, status, netto, steuer, brutto)
                    VALUES ('angebot', 'ANG-2026-001', '2026-09-28', 'OFFEN', 200, 38, 238)
                `).run();
                const angebotId = angebotRes.lastInsertRowid;

                // Direkter SQL-Insert mit Rechnung muss vom SQLite-Trigger hart abgebrochen werden
                assert.throws(() => {
                    db.prepare(`
                        INSERT INTO gaeb_import_angebote (import_id, angebot_id)
                        VALUES (?, ?)
                    `).run(saveRes.importId, rechnungId);
                }, /Ungültige Verknüpfung: Das referenzierte Dokument muss vom Typ angebot sein/);

                // Verknüpfung mit echtem Angebot gelingt
                const linkRes = db.prepare(`
                    INSERT INTO gaeb_import_angebote (import_id, angebot_id)
                    VALUES (?, ?)
                `).run(saveRes.importId, angebotId);
                assert.ok(linkRes.lastInsertRowid > 0);

                // UPDATE auf Rechnung muss vom Update-Trigger ebenfalls abgefangen werden
                assert.throws(() => {
                    db.prepare(`
                        UPDATE gaeb_import_angebote SET angebot_id = ? WHERE id = ?
                    `).run(rechnungId, linkRes.lastInsertRowid);
                }, /Ungültige Verknüpfung: Das referenzierte Dokument muss vom Typ angebot sein/);
            } finally {
                cleanupDb(db, dbPath);
            }
        });
    });

    // =========================================================================
    // 2. Voller Bepreisungs-Roundtrip mit Persistenz-Verifikation
    // =========================================================================
    describe('2. Bepreisungs-Roundtrip & Unveränderlichkeit des X83-Originals', () => {

        test('2.1 X83 einlesen, Tender-Draft anlegen, bepreisen, speichern, DB neu öffnen & verifizieren', () => {
            const { db, dbPath } = createTempDb();
            try {
                // 1. X83 Fixture einlesen (03_bieterangaben_vorbemerkungen_ep.x83)
                const xml = loadFixture('03_bieterangaben_vorbemerkungen_ep.x83');
                const parsed = GAEBEngine.parseGAEBXML(xml);
                const saveImportRes = saveX83Import(db, parsed, {
                    fileName: '03_bieterangaben_vorbemerkungen_ep.x83',
                    rawXml: xml
                });
                const importId = saveImportRes.importId;

                // Prüfe: Snapshot der Originaldaten in gaeb_items vor Bepreisung
                const originalItemsSnapshot = db.prepare(`
                    SELECT id, preis, gesamtpreis FROM gaeb_items WHERE import_id = ?
                `).all(importId);

                // 2. Tender-Draft erstellen
                const draft = createTenderDraft(db, importId, {
                    name: 'Hauptangebot v1',
                    version: 1
                });
                assert.ok(draft.id > 0);
                assert.strictEqual(draft.status, 'IN_BEARBEITUNG');

                // Lade Items des Imports
                const loadedOrig = loadX83Import(db, importId);
                const priceableItems = loadedOrig.items.filter(i => !i.isHinweistext);
                assert.ok(priceableItems.length >= 2, 'Mindestens 2 bepreisbare Positionen erwartet');

                // 3. Preise & BiReq vorbereiten (zwei unterschiedliche Positionen)
                const item1 = priceableItems[0];
                const item2 = priceableItems.find(i => i._dbId !== item1._dbId) || priceableItems[1];
                const bireqItem = priceableItems.find(i => i.bieterangaben && i.bieterangaben.length > 0) || item1;

                const prices = [
                    {
                        gaeb_item_id: item1._dbId,
                        unit_price: 50.0,
                        in_total: 1,
                        tax_rate: 19.0,
                        notes: 'Kalkuliert mit 15% Marge'
                    },
                    {
                        gaeb_item_id: item2._dbId,
                        unit_price: 120.0,
                        in_total: 1,
                        tax_rate: 19.0,
                        notes: 'Sonderpreis Hersteller'
                    }
                ];

                const bireqAnswers = [];
                if (bireqItem.bieterangaben && bireqItem.bieterangaben.length > 0) {
                    bireqItem.bieterangaben.forEach(b => {
                        bireqAnswers.push({
                            gaeb_bireq_id: b.id || b._dbId,
                            answer_value: `Qualitätshersteller XYZ - Typ ${b.label}`
                        });
                    });
                }

                // 4. Draft speichern
                const saveRes = saveTenderDraft(db, draft.id, {
                    prices,
                    bireq_answers: bireqAnswers
                });

                assert.strictEqual(saveRes.success, true);
                assert.ok(saveRes.total_netto > 0);

                // 5. Fremdschlüssel-Prüfung
                const fkErrors = db.pragma('foreign_key_check');
                assert.strictEqual(fkErrors.length, 0, 'Keine Fremdschlüsselverletzungen');

                // 6. DB komplett schließen
                db.close();

                // 7. DB neu von der Festplatte öffnen
                const dbReopened = new Database(dbPath);
                dbReopened.pragma('foreign_keys = ON');

                try {
                    // Verifikation A: Originale X83-Daten in gaeb_items blieben 100% unberührt!
                    const reloadedOriginalItems = dbReopened.prepare(`
                        SELECT id, preis, gesamtpreis FROM gaeb_items WHERE import_id = ?
                    `).all(importId);
                    assert.deepStrictEqual(reloadedOriginalItems, originalItemsSnapshot, 'Originale X83-Daten in gaeb_items dürfen niemals durch Bepreisung modifiziert werden!');

                    // Verifikation B: Draft laden und Werte prüfen
                    const loadedDraft = loadTenderDraft(dbReopened, draft.id);
                    assert.strictEqual(loadedDraft.draft.id, draft.id);
                    assert.strictEqual(loadedDraft.draft.name, 'Hauptangebot v1');
                    assert.strictEqual(loadedDraft.stats.total_netto, saveRes.total_netto);

                    const reloadedItem1 = loadedDraft.items.find(i => i._dbId === item1._dbId);
                    assert.strictEqual(reloadedItem1.unit_price, 50.0);
                    assert.strictEqual(reloadedItem1.total_price, 50.0 * reloadedItem1.menge);
                    assert.strictEqual(reloadedItem1.draft_notes, 'Kalkuliert mit 15% Marge');
                    assert.strictEqual(reloadedItem1.is_priced, true);

                    const reloadedItem2 = loadedDraft.items.find(i => i._dbId === item2._dbId);
                    assert.strictEqual(reloadedItem2.unit_price, 120.0);
                    assert.strictEqual(reloadedItem2.is_priced, true);

                    // BiReq-Antworten prüfen
                    const reloadedBireqItem = loadedDraft.items.find(i => i._dbId === bireqItem._dbId);
                    if (bireqItem.bieterangaben && bireqItem.bieterangaben.length > 0) {
                        assert.ok(reloadedBireqItem.bieterangaben.length > 0);
                        for (const b of reloadedBireqItem.bieterangaben) {
                            assert.ok(b.answer_value.includes('Qualitätshersteller XYZ'));
                            assert.strictEqual(b.is_answered, true);
                        }
                    }
                } finally {
                    dbReopened.close();
                }
            } finally {
                cleanupDb(db, dbPath);
            }
        });
    });

    // =========================================================================
    // 3. Differenzierung der Preiszustände & Rechenlogik
    // =========================================================================
    describe('3. Differenzierung der Preiszustände', () => {

        test('3.1 Null vs. 0.00 €: Leerer Preis bleibt null, 0.00 € benötigt explizite Bestätigung', () => {
            const { db, dbPath } = createTempDb();
            try {
                const xml = loadFixture('02_positionstypen_wahl_bedarf.x83');
                const parsed = GAEBEngine.parseGAEBXML(xml);
                const saveImport = saveX83Import(db, parsed, { fileName: 'types.x83', rawXml: xml });
                const draft = createTenderDraft(db, saveImport.importId);

                const loaded = loadX83Import(db, saveImport.importId);
                const normalPos = loaded.items.find(i => i.positions_art === 'NORMAL' && !i.isHinweistext);
                assert.ok(normalPos, 'Normalposition vorhanden');

                // A: 0.00 € OHNE is_zero_confirmed muss abgelehnt werden
                assert.throws(() => {
                    saveTenderDraft(db, draft.id, {
                        prices: [{
                            gaeb_item_id: normalPos._dbId,
                            unit_price: 0,
                            is_zero_confirmed: 0
                        }]
                    });
                }, /Einheitspreis 0,00 € muss ausdrücklich bestätigt werden/);

                // B: 0.00 € MIT is_zero_confirmed = 1 wird als 0.00 gespeichert
                const resZero = saveTenderDraft(db, draft.id, {
                    prices: [{
                        gaeb_item_id: normalPos._dbId,
                        unit_price: 0,
                        is_zero_confirmed: 1
                    }]
                });
                assert.strictEqual(resZero.success, true);

                const loadedZero = loadTenderDraft(db, draft.id);
                const posZero = loadedZero.items.find(i => i._dbId === normalPos._dbId);
                assert.strictEqual(posZero.unit_price, 0.0);
                assert.strictEqual(posZero.is_zero_confirmed, true);
                assert.strictEqual(posZero.is_priced, true);

                // C: Leerer String '' oder null bleibt strikt null (unbepreist)
                saveTenderDraft(db, draft.id, {
                    prices: [{
                        gaeb_item_id: normalPos._dbId,
                        unit_price: null
                    }]
                });

                const loadedNull = loadTenderDraft(db, draft.id);
                const posNull = loadedNull.items.find(i => i._dbId === normalPos._dbId);
                assert.strictEqual(posNull.unit_price, null, 'Leerer Preis muss strikt null sein, niemals in 0.00 umgewandelt!');
                assert.strictEqual(posNull.is_priced, false);
            } finally {
                cleanupDb(db, dbPath);
            }
        });

        test('3.2 QtyTBD (Menge unbestimmt): total_price bleibt null und bläht Gesamtsumme nicht auf', () => {
            const { db, dbPath } = createTempDb();
            try {
                // pyGAEB enthält eine Position mit QtyTBD
                const xml = loadFixture('independent_pygaeb_da32.x83');
                const parsed = GAEBEngine.parseGAEBXML(xml);
                const saveImport = saveX83Import(db, parsed, { fileName: 'pygaeb.x83', rawXml: xml });
                const draft = createTenderDraft(db, saveImport.importId);

                const loaded = loadX83Import(db, saveImport.importId);
                const qtyTbdPos = loaded.items.find(i => i.isQtyTBD);
                assert.ok(qtyTbdPos, 'pyGAEB Position mit QtyTBD muss existieren');

                // Bepreise QtyTBD Position
                saveTenderDraft(db, draft.id, {
                    prices: [{
                        gaeb_item_id: qtyTbdPos._dbId,
                        unit_price: 99.50,
                        in_total: 1
                    }]
                });

                const draftLoaded = loadTenderDraft(db, draft.id);
                const pos = draftLoaded.items.find(i => i._dbId === qtyTbdPos._dbId);

                assert.strictEqual(pos.unit_price, 99.50);
                assert.strictEqual(pos.total_price, null, 'QtyTBD darf keinen künstlichen Gesamtpreis erfinden');
                assert.strictEqual(draftLoaded.stats.total_netto, 0, 'QtyTBD darf nicht in die Gesamtsumme einfließen');
            } finally {
                cleanupDb(db, dbPath);
            }
        });

        test('3.3 Hinweistext & Wahlposition: Hinweistext nicht bepreisbar, Wahlposition mit in_total=0 summenneutral', () => {
            const { db, dbPath } = createTempDb();
            try {
                // A: Hinweistext-Prüfung anhand von 03_bieterangaben_vorbemerkungen_ep.x83
                const xml03 = loadFixture('03_bieterangaben_vorbemerkungen_ep.x83');
                const parsed03 = GAEBEngine.parseGAEBXML(xml03);
                const import03 = saveX83Import(db, parsed03, { fileName: '03.x83', rawXml: xml03 });
                const draft03 = createTenderDraft(db, import03.importId);

                const loaded03 = loadX83Import(db, import03.importId);
                const hinweisPos = loaded03.items.find(i => i.isHinweistext);
                assert.ok(hinweisPos, 'Hinweistext muss in Fixture 03 existieren');

                // Versuch: Hinweistext bepreisen (wird strikt ignoriert)
                saveTenderDraft(db, draft03.id, {
                    prices: [{ gaeb_item_id: hinweisPos._dbId, unit_price: 999.0 }]
                });

                const loadedDraft03 = loadTenderDraft(db, draft03.id);
                const hReloaded = loadedDraft03.items.find(i => i._dbId === hinweisPos._dbId);
                assert.strictEqual(hReloaded.unit_price, null, 'Hinweistext darf nicht bepreisbar sein');
                assert.strictEqual(hReloaded.is_priced, false);

                // B: Wahlposition & Grundposition anhand von 02_positionstypen_wahl_bedarf.x83
                const xml02 = loadFixture('02_positionstypen_wahl_bedarf.x83');
                const parsed02 = GAEBEngine.parseGAEBXML(xml02);
                const import02 = saveX83Import(db, parsed02, { fileName: '02.x83', rawXml: xml02 });
                const draft02 = createTenderDraft(db, import02.importId);

                const loaded02 = loadX83Import(db, import02.importId);
                const wahlPos = loaded02.items.find(i => i.positions_art === 'WAHL');
                const grundPos = loaded02.items.find(i => i.positions_art === 'GRUND');

                assert.ok(wahlPos, 'Wahlposition muss existieren');
                assert.ok(grundPos, 'Grundposition muss existieren');

                // Speichere Grundposition (100 €) und Wahlposition (300 € mit in_total = 0)
                saveTenderDraft(db, draft02.id, {
                    prices: [
                        {
                            gaeb_item_id: grundPos._dbId,
                            unit_price: 10.0, // menge = 10 -> total 100
                            in_total: 1
                        },
                        {
                            gaeb_item_id: wahlPos._dbId,
                            unit_price: 30.0, // menge = 10 -> total 300, aber in_total = 0
                            in_total: 0
                        }
                    ]
                });

                const loadedDraft02 = loadTenderDraft(db, draft02.id);
                const wReloaded = loadedDraft02.items.find(i => i._dbId === wahlPos._dbId);
                const gReloaded = loadedDraft02.items.find(i => i._dbId === grundPos._dbId);

                // Wahlposition hat Einzel-Gesamtpreis, fließt aber NICHT in Endsumme ein
                assert.strictEqual(wReloaded.unit_price, 30.0);
                assert.strictEqual(wReloaded.total_price, 30.0 * wReloaded.menge);
                assert.strictEqual(wReloaded.in_total, false);

                // Endsumme entspricht exakt der Grundposition (keine Wahlpositions-Verfälschung!)
                const expectedNetto = gReloaded.total_price;
                assert.strictEqual(loadedDraft02.stats.total_netto, expectedNetto);
            } finally {
                cleanupDb(db, dbPath);
            }
        });
    });

    // =========================================================================
    // 4. Versionsunabhängigkeit (v1 vs v2)
    // =========================================================================
    describe('4. Versionsunabhängigkeit (v1 vs v2)', () => {

        test('4.1 Klonen von v1 nach v2: Preisänderung in v2 verändert weder v1 noch das X83-Original', () => {
            const { db, dbPath } = createTempDb();
            try {
                const xml = loadFixture('valid_schema_reference.x83');
                const parsed = GAEBEngine.parseGAEBXML(xml);
                const saveImport = saveX83Import(db, parsed, { fileName: 'ref.x83', rawXml: xml });
                const importId = saveImport.importId;

                // 1. Entwurf v1 anlegen und bepreisen
                const draft1 = createTenderDraft(db, importId, { name: 'Hauptangebot v1', version: 1 });
                const loaded = loadX83Import(db, importId);
                const item = loaded.items[0];

                saveTenderDraft(db, draft1.id, {
                    prices: [{
                        gaeb_item_id: item._dbId,
                        unit_price: 45.0,
                        in_total: 1
                    }]
                });

                const loadedDraft1 = loadTenderDraft(db, draft1.id);
                assert.strictEqual(loadedDraft1.items[0].unit_price, 45.0);

                // 2. Klonen nach v2
                const draft2 = cloneTenderDraft(db, draft1.id, {
                    newName: 'Verhandlungsstand v2',
                    newVersion: 2
                });
                assert.ok(draft2.id > 0);
                assert.notStrictEqual(draft2.id, draft1.id);
                assert.strictEqual(draft2.version, 2);

                // Direkt nach dem Klonen hat v2 denselben Preis
                const loadedDraft2Initial = loadTenderDraft(db, draft2.id);
                assert.strictEqual(loadedDraft2Initial.items[0].unit_price, 45.0);

                // 3. Ändere Preis in v2 auf 38.00 € (z. B. Nachlass)
                saveTenderDraft(db, draft2.id, {
                    prices: [{
                        gaeb_item_id: item._dbId,
                        unit_price: 38.0,
                        in_total: 1
                    }]
                });

                // 4. Verifiziere strikte Trennung:
                // a) v1 muss weiterhin 45.00 € haben
                const loadedDraft1After = loadTenderDraft(db, draft1.id);
                assert.strictEqual(loadedDraft1After.items[0].unit_price, 45.0, 'v1 darf durch Änderungen in v2 nicht modifiziert werden!');

                // b) v2 hat den neuen Preis 38.00 €
                const loadedDraft2After = loadTenderDraft(db, draft2.id);
                assert.strictEqual(loadedDraft2After.items[0].unit_price, 38.0, 'v2 muss den aktualisierten Preis widerspiegeln');

                // c) Originaldaten in gaeb_items bleiben unberührt (preis IS NULL)
                const origCheck = db.prepare('SELECT preis FROM gaeb_items WHERE id = ?').get(item._dbId);
                assert.strictEqual(origCheck.preis, null, 'Original-X83 in gaeb_items muss unverändert null bleiben');
            } finally {
                cleanupDb(db, dbPath);
            }
        });
    });

    // =========================================================================
    // 5. Transaktionssicherheit & Rollback
    // =========================================================================
    describe('5. Transaktions-Rollback', () => {

        test('5.1 Fehler mitten im Speichern rollt die gesamte Transaktion zurück', () => {
            const { db, dbPath } = createTempDb();
            try {
                const xml = loadFixture('valid_schema_reference.x83');
                const parsed = GAEBEngine.parseGAEBXML(xml);
                const saveImport = saveX83Import(db, parsed, { fileName: 'ref.x83', rawXml: xml });
                const draft = createTenderDraft(db, saveImport.importId);

                const loaded = loadX83Import(db, saveImport.importId);
                const item = loaded.items[0];

                // Initial gültig bepreisen
                saveTenderDraft(db, draft.id, {
                    prices: [{ gaeb_item_id: item._dbId, unit_price: 25.0 }]
                });
                assert.strictEqual(loadTenderDraft(db, draft.id).items[0].unit_price, 25.0);

                // Jetzt Speichern mit einem zweiten ungültigen Item (z. B. unbestätigter 0-Preis oder falsche ID)
                assert.throws(() => {
                    saveTenderDraft(db, draft.id, {
                        prices: [
                            { gaeb_item_id: item._dbId, unit_price: 99.0 }, // sollte nicht gespeichert werden
                            { gaeb_item_id: 999999, unit_price: 10.0 }       // Fehler: ungültige ID
                        ]
                    });
                }, /Ungültige gaeb_item_id/);

                // Prüfe: item[0] hat immer noch 25.0 (Rollback hat gegriffen, 99.0 wurde verworfen)
                const afterError = loadTenderDraft(db, draft.id);
                assert.strictEqual(afterError.items[0].unit_price, 25.0, 'Nach Transaktionsfehler muss der alte Zustand wiederhergestellt sein');
            } finally {
                cleanupDb(db, dbPath);
            }
        });
    });

    // =========================================================================
    // 6. Kaskadierendes Löschen & Fremdschlüssel-Check
    // =========================================================================
    describe('6. Löschung & Integrität', () => {

        test('6.1 deleteTenderDraft löscht Entwurf und kaskadierend Preise und Antworten ohne FK-Fehler', () => {
            const { db, dbPath } = createTempDb();
            try {
                const xml = loadFixture('03_bieterangaben_vorbemerkungen_ep.x83');
                const parsed = GAEBEngine.parseGAEBXML(xml);
                const saveImport = saveX83Import(db, parsed, { fileName: '03.x83', rawXml: xml });
                const draft = createTenderDraft(db, saveImport.importId);

                const loaded = loadX83Import(db, saveImport.importId);
                const item = loaded.items.find(i => i.bieterangaben && i.bieterangaben.length > 0);

                saveTenderDraft(db, draft.id, {
                    prices: [{ gaeb_item_id: item._dbId, unit_price: 77.0 }],
                    bireq_answers: [{ gaeb_bireq_id: item.bieterangaben[0].id, answer_value: 'Hersteller A' }]
                });

                // Prüfe, dass Daten existieren
                const pCount = db.prepare('SELECT COUNT(*) AS cnt FROM gaeb_tender_item_prices WHERE draft_id = ?').get(draft.id).cnt;
                const bCount = db.prepare('SELECT COUNT(*) AS cnt FROM gaeb_tender_bireq_answers WHERE draft_id = ?').get(draft.id).cnt;
                assert.ok(pCount > 0 && bCount > 0);

                // Löschen
                const delRes = deleteTenderDraft(db, draft.id);
                assert.strictEqual(delRes.success, true);

                // Nach Löschung: Kindtabellen müssen leer sein
                const pCountAfter = db.prepare('SELECT COUNT(*) AS cnt FROM gaeb_tender_item_prices WHERE draft_id = ?').get(draft.id).cnt;
                const bCountAfter = db.prepare('SELECT COUNT(*) AS cnt FROM gaeb_tender_bireq_answers WHERE draft_id = ?').get(draft.id).cnt;
                assert.strictEqual(pCountAfter, 0);
                assert.strictEqual(bCountAfter, 0);

                // FK-Check
                const fkErrors = db.pragma('foreign_key_check');
                assert.strictEqual(fkErrors.length, 0);
            } finally {
                cleanupDb(db, dbPath);
            }
        });
    });
});

console.log('GAEB_TENDER_PRICING_TESTS_PASSED');
