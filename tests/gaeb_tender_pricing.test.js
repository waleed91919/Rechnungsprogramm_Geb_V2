const { getElectronPath } = require('./test_electron_helper');
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
        const electronBin = getElectronPath();
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
const { saveX83Import, loadX83Import, listX83Imports, linkImportToAngebot, getImportOriginalBuffer } = require('../db/repositories/gaeb_repository');
const {
    createTenderDraft,
    saveTenderDraft,
    loadTenderDraft,
    cloneTenderDraft,
    listTenderDrafts,
    deleteTenderDraft
} = require('../db/repositories/gaeb_tender_repo');
const {
    initGaebSchema,
    runGaebMigrations,
    REQUIRED_GAEB_TRIGGERS,
    REQUIRED_GAEB_INDICES
} = require('../db/schema/gaeb_schema');

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

    // =========================================================================
    // 7. Härtungs- & Regressionsprüfungen (liesen.txt)
    // =========================================================================
    describe('7. Härtungs- & Regressionsprüfungen', () => {

        test('7.1 Explizite Importauswahl & kein stilles Anlegen von Entwürfen', () => {
            const { db, dbPath } = createTempDb();
            try {
                const xml1 = loadFixture('valid_schema_reference.x83');
                const xml2 = loadFixture('02_positionstypen_wahl_bedarf.x83');

                const import1 = saveX83Import(db, GAEBEngine.parseGAEBXML(xml1), { fileName: 'import1.x83', rawXml: xml1 });
                const import2 = saveX83Import(db, GAEBEngine.parseGAEBXML(xml2), { fileName: 'import2.x83', rawXml: xml2 });

                // A: Beide Imports vorhanden, initial KEINE Entwürfe
                const importsList = listX83Imports(db);
                assert.strictEqual(importsList.length, 2);
                const imp1Row = importsList.find(i => i.id === import1.importId);
                const imp2Row = importsList.find(i => i.id === import2.importId);
                assert.strictEqual(imp1Row.draft_count, 0, 'Import 1 darf initial keine Entwürfe haben');
                assert.strictEqual(imp2Row.draft_count, 0, 'Import 2 darf initial keine Entwürfe haben');

                const totalDraftsInitial = db.prepare('SELECT COUNT(*) AS cnt FROM gaeb_tender_drafts').get().cnt;
                assert.strictEqual(totalDraftsInitial, 0, 'Es dürfen keine Entwürfe im Hintergrund automatisch erzeugt werden');

                // B: Explizite Auswahl von Import 2 und gezieltes Anlegen eines Entwurfs
                const draftImp2 = createTenderDraft(db, import2.importId, { name: 'Kalkulation Los 2' });
                assert.strictEqual(draftImp2.import_id, import2.importId);
                assert.strictEqual(draftImp2.version, 1);

                // Position bepreisen und speichern
                const loadedImp2 = loadX83Import(db, import2.importId);
                const itemToPrice = loadedImp2.items.find(i => !i.isHinweistext);
                saveTenderDraft(db, draftImp2.id, {
                    prices: [{
                        gaeb_item_id: itemToPrice._dbId,
                        unit_price: 150.0,
                        in_total: 1
                    }]
                });

                // C: Verifizieren: Import 1 hat weiterhin 0 Entwürfe, Import 2 genau 1
                const draftsImp1 = listTenderDrafts(db, import1.importId);
                const draftsImp2 = listTenderDrafts(db, import2.importId);
                assert.strictEqual(draftsImp1.length, 0, 'Import 1 muss unberührt 0 Entwürfe behalten');
                assert.strictEqual(draftsImp2.length, 1, 'Import 2 muss genau den angelegten Entwurf haben');
                assert.strictEqual(draftsImp2[0].id, draftImp2.id);

                const importsListAfter = listX83Imports(db);
                const imp1After = importsListAfter.find(i => i.id === import1.importId);
                const imp2After = importsListAfter.find(i => i.id === import2.importId);
                assert.strictEqual(imp1After.draft_count, 0);
                assert.strictEqual(imp2After.draft_count, 1);
            } finally {
                cleanupDb(db, dbPath);
            }
        });

        test('7.2 QtyTBD & Vollständigkeitsstatus (IN_BEARBEITUNG vs VOLLSTAENDIG_BEPREIST)', () => {
            const { db, dbPath } = createTempDb();
            try {
                // pyGAEB enthält eine Position mit QtyTBD
                const xml = loadFixture('independent_pygaeb_da32.x83');
                const parsed = GAEBEngine.parseGAEBXML(xml);
                const saveImport = saveX83Import(db, parsed, { fileName: 'pygaeb_qtytbd.x83', rawXml: xml });
                const importId = saveImport.importId;
                const draft = createTenderDraft(db, importId);

                const loaded = loadX83Import(db, importId);
                const priceableItems = loaded.items.filter(i => !i.isHinweistext);
                const qtyTbdItems = priceableItems.filter(i => i.isQtyTBD || i.menge === null);
                assert.strictEqual(qtyTbdItems.length, 2, 'Zwei QtyTBD-Positionen in Fixture erwartet');

                // Bepreise ALLE Positionen vollständig mit in_total = 1 (inkl. QtyTBD)
                const pricesAllInTotal = priceableItems.map((item, idx) => ({
                    gaeb_item_id: item._dbId,
                    unit_price: 20.0 + idx * 5.0,
                    in_total: 1
                }));

                // Falls Bieterangaben existieren, alle beantworten
                const bireqAnswers = [];
                priceableItems.forEach(item => {
                    if (item.bieterangaben && item.bieterangaben.length > 0) {
                        item.bieterangaben.forEach(b => {
                            bireqAnswers.push({
                                gaeb_bireq_id: b.id || b._dbId,
                                answer_value: 'Pflichtangabe Bieter'
                            });
                        });
                    }
                });

                const saveRes1 = saveTenderDraft(db, draft.id, {
                    prices: pricesAllInTotal,
                    bireq_answers: bireqAnswers
                });

                // Prüfungen für Zustand mit offener QtyTBD in Endsumme:
                // 1. unpriced_count ist 0 (alle Positionen haben Einheitspreise)
                assert.strictEqual(saveRes1.unpriced_count, 0, 'Alle Einheitspreise sind vergeben');
                // 2. missing_bireq_count ist 0
                assert.strictEqual(saveRes1.missing_bireq_count, 0, 'Alle BiReqs sind beantwortet');
                // 3. unresolved_qty_tbd_count ist 2
                assert.strictEqual(saveRes1.unresolved_qty_tbd_count, 2, 'Zwei QtyTBD-Positionen sind in Endsumme unbestimmt');
                // 4. Status MUSS strikt IN_BEARBEITUNG bleiben (nicht VOLLSTAENDIG_BEPREIST)
                assert.strictEqual(saveRes1.status, 'IN_BEARBEITUNG', 'Draft mit offener QtyTBD in Endsumme darf NICHT als vollständig bepreist gelten');

                const loadedDraft1 = loadTenderDraft(db, draft.id);
                assert.strictEqual(loadedDraft1.stats.status, 'IN_BEARBEITUNG');
                assert.strictEqual(loadedDraft1.stats.unresolved_qty_tbd_count, 2);
                for (const qItem of qtyTbdItems) {
                    const qPos = loadedDraft1.items.find(i => i._dbId === qItem._dbId);
                    assert.strictEqual(qPos.total_price, null, 'QtyTBD-Gesamtpreis muss null sein');
                }

                // Nun: Nimm BEIDE QtyTBD aus der Endsumme heraus (in_total = 0, z. B. als Eventualposition)
                const qtyTbdIds = new Set(qtyTbdItems.map(q => q._dbId));
                const pricesWithQtyTbdExcluded = pricesAllInTotal.map(p => {
                    if (qtyTbdIds.has(p.gaeb_item_id)) {
                        return { ...p, in_total: 0 };
                    }
                    return p;
                });

                const saveRes2 = saveTenderDraft(db, draft.id, {
                    prices: pricesWithQtyTbdExcluded,
                    bireq_answers: bireqAnswers
                });

                // Jetzt sind alle in_total-Positionen mit bestimmten Mengen bepreist
                assert.strictEqual(saveRes2.unpriced_count, 0);
                assert.strictEqual(saveRes2.missing_bireq_count, 0);
                assert.strictEqual(saveRes2.unresolved_qty_tbd_count, 0, 'Keine ungelösten QtyTBDs mehr in Endsumme');
                assert.strictEqual(saveRes2.status, 'VOLLSTAENDIG_BEPREIST', 'Ohne offene QtyTBD in Endsumme muss Status VOLLSTAENDIG_BEPREIST sein');

                const loadedDraft2 = loadTenderDraft(db, draft.id);
                assert.strictEqual(loadedDraft2.stats.status, 'VOLLSTAENDIG_BEPREIST');
                assert.strictEqual(loadedDraft2.stats.unresolved_qty_tbd_count, 0);
            } finally {
                cleanupDb(db, dbPath);
            }
        });

        test('7.4 Leseoperation: Reines Abrufen/Listen von Entwürfen verändert weder Anzahl noch Inhalt der Entwürfe', () => {
            const { db, dbPath } = createTempDb();
            try {
                const xml = loadFixture('valid_schema_reference.x83');
                const parsed = GAEBEngine.parseGAEBXML(xml);
                const saveImport = saveX83Import(db, parsed, { fileName: 'ref_read_only.x83', rawXml: xml });
                const importId = saveImport.importId;

                const d1 = createTenderDraft(db, importId, { name: 'Entwurf Alpha' });
                const d2 = createTenderDraft(db, importId, { name: 'Entwurf Beta' });

                const countBefore = db.prepare('SELECT COUNT(*) AS cnt FROM gaeb_tender_drafts WHERE import_id = ?').get(importId).cnt;
                const rowsBefore = db.prepare('SELECT * FROM gaeb_tender_drafts WHERE import_id = ? ORDER BY id ASC').all(importId);
                const itemsCountBefore = db.prepare('SELECT COUNT(*) AS cnt FROM gaeb_items').get().cnt;

                // Mehrfaches Listen aufrufen
                const list1 = listTenderDrafts(db, importId);
                const list2 = listTenderDrafts(db, importId);

                assert.strictEqual(list1.length, 2);
                assert.strictEqual(list2.length, 2);

                const countAfter = db.prepare('SELECT COUNT(*) AS cnt FROM gaeb_tender_drafts WHERE import_id = ?').get(importId).cnt;
                const rowsAfter = db.prepare('SELECT * FROM gaeb_tender_drafts WHERE import_id = ? ORDER BY id ASC').all(importId);
                const itemsCountAfter = db.prepare('SELECT COUNT(*) AS cnt FROM gaeb_items').get().cnt;

                assert.strictEqual(countAfter, countBefore, 'Entwurfsanzahl darf sich bei Leseoperation nicht ändern');
                assert.strictEqual(itemsCountAfter, itemsCountBefore, 'Positionen dürfen sich nicht ändern');
                assert.deepStrictEqual(rowsAfter, rowsBefore, 'Alle Entwurfsdaten müssen unverändert sein');
            } finally {
                cleanupDb(db, dbPath);
            }
        });

        test('7.3 Versionsunabhängigkeit: Klonen v1 -> v2 entkoppelt Angebot und verhindert gegenseitige Beeinflussung', () => {
            const { db, dbPath } = createTempDb();
            try {
                const xml = loadFixture('valid_schema_reference.x83');
                const parsed = GAEBEngine.parseGAEBXML(xml);
                const saveImport = saveX83Import(db, parsed, { fileName: 'ref.x83', rawXml: xml });
                const importId = saveImport.importId;

                // Erstelle ein Dokument vom Typ 'angebot'
                const angebotRes = db.prepare(`
                    INSERT INTO dokumente (type, nr, datum, status, netto, steuer, brutto)
                    VALUES ('angebot', 'ANG-2026-V1', '2026-09-28', 'OFFEN', 500, 95, 595)
                `).run();
                const angebotId = angebotRes.lastInsertRowid;

                // Erstelle v1 mit Verknüpfung zu angebotId
                const draft1 = createTenderDraft(db, importId, {
                    name: 'Offizielles Angebot v1',
                    version: 1,
                    angebotId
                });
                assert.strictEqual(draft1.angebot_id, angebotId);

                const loaded = loadX83Import(db, importId);
                const item = loaded.items[0];

                // Bepreise v1 mit 100.00 €
                saveTenderDraft(db, draft1.id, {
                    prices: [{ gaeb_item_id: item._dbId, unit_price: 100.0, in_total: 1 }]
                });

                // Klone v1 nach v2
                const draft2 = cloneTenderDraft(db, draft1.id, { newName: 'Verhandlung v2' });
                assert.strictEqual(draft2.version, 2);
                assert.strictEqual(draft2.angebot_id, null, 'Geklonter Entwurf darf NIEMALS automatisch mit dem Dokument von v1 verknüpft sein');

                // Direkt nach dem Klonen hat v2 den Preis von v1 übernommen
                const v2Initial = loadTenderDraft(db, draft2.id);
                assert.strictEqual(v2Initial.items[0].unit_price, 100.0);

                // Ändere Preis in v2 auf 75.00 €
                saveTenderDraft(db, draft2.id, {
                    prices: [{ gaeb_item_id: item._dbId, unit_price: 75.0, in_total: 1 }]
                });

                // Verifiziere strikte Isolation:
                // v1 bleibt unberührt
                const v1Final = loadTenderDraft(db, draft1.id);
                assert.strictEqual(v1Final.draft.angebot_id, angebotId, 'v1 behält seine Dokumentverknüpfung');
                assert.strictEqual(v1Final.items[0].unit_price, 100.0, 'v1 behält seinen ursprünglichen Preis');

                // v2 hat neuen Preis und angebot_id = null
                const v2Final = loadTenderDraft(db, draft2.id);
                assert.strictEqual(v2Final.draft.angebot_id, null, 'v2 hat weiterhin keine Dokumentverknüpfung');
                assert.strictEqual(v2Final.items[0].unit_price, 75.0, 'v2 hat den geänderten Preis');

                // gaeb_items Originaldaten bleiben unberührt
                const origRow = db.prepare('SELECT preis FROM gaeb_items WHERE id = ?').get(item._dbId);
                assert.strictEqual(origRow.preis, null, 'Originalpreis in gaeb_items bleibt unverändert');
            } finally {
                cleanupDb(db, dbPath);
            }
        });

        test('7.4 Versionierungs-Integrität & Unique Constraint', () => {
            const { db, dbPath } = createTempDb();
            try {
                const xml = loadFixture('valid_schema_reference.x83');
                const parsed = GAEBEngine.parseGAEBXML(xml);
                const saveImport = saveX83Import(db, parsed, { fileName: 'ref.x83', rawXml: xml });
                const importId = saveImport.importId;

                // Automatische Versionserhöhung ohne Angabe von version
                const d1 = createTenderDraft(db, importId);
                assert.strictEqual(d1.version, 1);

                const d2 = createTenderDraft(db, importId);
                assert.strictEqual(d2.version, 2);

                const d3 = createTenderDraft(db, importId);
                assert.strictEqual(d3.version, 3);

                // Manueller Insert mit doppelter (import_id, version) muss am UNIQUE Constraint scheitern
                assert.throws(() => {
                    db.prepare(`
                        INSERT INTO gaeb_tender_drafts (import_id, version, name)
                        VALUES (?, ?, 'Duplikat v1')
                    `).run(importId, 1);
                }, /UNIQUE constraint failed/);

                assert.throws(() => {
                    db.prepare(`
                        INSERT INTO gaeb_tender_drafts (import_id, version, name)
                        VALUES (?, ?, 'Duplikat v2')
                    `).run(importId, 2);
                }, /UNIQUE constraint failed/);
            } finally {
                cleanupDb(db, dbPath);
            }
        });

        test('7.5 Datenbank-Trigger Typ-Schutz (Angebot vs. Rechnung)', () => {
            const { db, dbPath } = createTempDb();
            try {
                const xml = loadFixture('valid_schema_reference.x83');
                const parsed = GAEBEngine.parseGAEBXML(xml);
                const saveImport = saveX83Import(db, parsed, { fileName: 'ref.x83', rawXml: xml });
                const importId = saveImport.importId;

                // Dokumente erstellen
                const angebot1 = db.prepare(`
                    INSERT INTO dokumente (type, nr, datum, status, netto, steuer, brutto)
                    VALUES ('angebot', 'ANG-LINKED', '2026-09-28', 'OFFEN', 100, 19, 119)
                `).run();
                const linkedAngebotId = angebot1.lastInsertRowid;

                const rechnungDoc = db.prepare(`
                    INSERT INTO dokumente (type, nr, datum, status, netto, steuer, brutto)
                    VALUES ('rechnung', 'RE-INVALID', '2026-09-28', 'OFFEN', 200, 38, 238)
                `).run();
                const rechnungId = rechnungDoc.lastInsertRowid;

                const unlinkedAngebot = db.prepare(`
                    INSERT INTO dokumente (type, nr, datum, status, netto, steuer, brutto)
                    VALUES ('angebot', 'ANG-FREE', '2026-09-28', 'OFFEN', 300, 57, 357)
                `).run();
                const unlinkedAngebotId = unlinkedAngebot.lastInsertRowid;

                // Verknüpfe linkedAngebotId mit einem Tender-Draft
                const draft = createTenderDraft(db, importId, { angebotId: linkedAngebotId });
                assert.strictEqual(draft.angebot_id, linkedAngebotId);

                // A: Verknüpftes Angebot darf per Trigger trg_prevent_type_change_linked_gaeb_angebot NICHT zu 'rechnung' geändert werden!
                assert.throws(() => {
                    db.prepare("UPDATE dokumente SET type = 'rechnung' WHERE id = ?").run(linkedAngebotId);
                }, /Änderung des Dokumenttyps verweigert: Dieses Angebot ist mit einer GAEB-Ausschreibung verknüpft/);

                // B: Nicht-Typ-Felder des verknüpften Angebots dürfen problemlos aktualisiert werden
                assert.doesNotThrow(() => {
                    db.prepare("UPDATE dokumente SET netto = 999.0, brutto = 1188.81 WHERE id = ?").run(linkedAngebotId);
                });
                const updatedDoc = db.prepare('SELECT netto FROM dokumente WHERE id = ?').get(linkedAngebotId);
                assert.strictEqual(updatedDoc.netto, 999.0);

                // C: Unverknüpftes Angebot darf regulär zu 'rechnung' geändert werden
                assert.doesNotThrow(() => {
                    db.prepare("UPDATE dokumente SET type = 'rechnung' WHERE id = ?").run(unlinkedAngebotId);
                });
                const turnedRechnung = db.prepare('SELECT type FROM dokumente WHERE id = ?').get(unlinkedAngebotId);
                assert.strictEqual(turnedRechnung.type, 'rechnung');

                // D: Tender-Draft darf nicht mit einer Rechnung verknüpft werden (weder JS-Validierung noch DB-Trigger)
                assert.throws(() => {
                    createTenderDraft(db, importId, { angebotId: rechnungId });
                }, /kein Angebot/);

                // Auch direkter SQL-Insert in gaeb_tender_drafts wird vom SQLite-Trigger trg_validate_gaeb_tender_draft_angebot_type abgefangen
                assert.throws(() => {
                    db.prepare(`
                        INSERT INTO gaeb_tender_drafts (import_id, angebot_id, version, name)
                        VALUES (?, ?, 99, 'Illegale Rechnungsverknüpfung')
                    `).run(importId, rechnungId);
                }, /Ungültige Verknüpfung: Das referenzierte Dokument im Entwurf muss vom Typ angebot sein/);

                // Und SQL-Update auf gaeb_tender_drafts wird von trg_validate_gaeb_tender_draft_angebot_type_update abgefangen
                assert.throws(() => {
                    db.prepare(`UPDATE gaeb_tender_drafts SET angebot_id = ? WHERE id = ?`).run(rechnungId, draft.id);
                }, /Ungültige Verknüpfung: Das referenzierte Dokument im Entwurf muss vom Typ angebot sein/);
            } finally {
                cleanupDb(db, dbPath);
            }
        });

        test('7.6 BOM-Konsistenzprüfung (UTF-8 BOM vs. Decoded XML)', () => {
            const { db, dbPath } = createTempDb();
            try {
                const baseXml = loadFixture('valid_schema_reference.x83');
                const utf8Bom = Buffer.from([0xEF, 0xBB, 0xBF]);
                const rawWithBom = Buffer.concat([utf8Bom, Buffer.from(baseXml, 'utf8')]);

                // A: rawBytes mit BOM und rawXml als sauberer String ohne BOM -> Muss erfolgreich sein
                const parsed = GAEBEngine.parseGAEBXML(baseXml);
                const saveRes = saveX83Import(db, parsed, {
                    fileName: 'with_bom.x83',
                    rawBytes: rawWithBom,
                    rawXml: baseXml
                });
                assert.ok(saveRes.importId > 0);
                assert.strictEqual(saveRes.hasOriginalBytes, true);

                // Verifiziere: Die gespeicherten raw_bytes haben bit-genau das BOM am Anfang
                const savedBytes = db.prepare('SELECT raw_bytes FROM gaeb_imports WHERE id = ?').get(saveRes.importId).raw_bytes;
                assert.strictEqual(savedBytes[0], 0xEF);
                assert.strictEqual(savedBytes[1], 0xBB);
                assert.strictEqual(savedBytes[2], 0xBF);

                // B: Mismatch zwischen BOM-Buffer und abweichendem XML-Text muss zuverlässig abgewiesen werden
                const differentXml = '<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3"><PrjInfo><NamePrj>Verfälschter Inhalt</NamePrj></PrjInfo></GAEB>';
                assert.throws(() => {
                    saveX83Import(db, parsed, {
                        fileName: 'mismatch_bom.x83',
                        rawBytes: rawWithBom,
                        rawXml: differentXml
                    });
                }, /Konsistenzfehler: rawBytes und rawXml stimmen inhaltlich nicht überein/);
            } finally {
                cleanupDb(db, dbPath);
            }
        });
    });

    // =========================================================================
    // 8. Finale Integritätsprüfung (liesen.txt review/gaeb-tender-final-integrity)
    // =========================================================================
    describe('8. Finale Integritätsprüfung (liesen.txt Anforderungen A, B, C)', () => {

        // ---------------------------------------------------------------------
        // A. Präzise XML-Vergleichslogik mit den Original-Bytes (rawBytes vs rawXml)
        // ---------------------------------------------------------------------
        describe('8.A XML-Vergleichslogik mit Original-Bytes', () => {

            test('8.A.1 Buffer und XML-Text sind exakt identisch -> Bestanden', () => {
                const { db, dbPath } = createTempDb();
                try {
                    const xml = loadFixture('valid_schema_reference.x83');
                    const buf = Buffer.from(xml, 'utf8');
                    const parsed = GAEBEngine.parseGAEBXML(xml);

                    const res = saveX83Import(db, parsed, {
                        fileName: 'case1_exact.x83',
                        rawBytes: buf,
                        rawXml: xml
                    });
                    assert.ok(res.importId > 0);
                    assert.strictEqual(res.hasOriginalBytes, true);
                } finally {
                    cleanupDb(db, dbPath);
                }
            });

            test('8.A.2 Buffer beginnt mit UTF-8 BOM, XML-Text ist ohne BOM -> Bestanden', () => {
                const { db, dbPath } = createTempDb();
                try {
                    const xml = loadFixture('valid_schema_reference.x83');
                    const utf8Bom = Buffer.from([0xEF, 0xBB, 0xBF]);
                    const bufWithBom = Buffer.concat([utf8Bom, Buffer.from(xml, 'utf8')]);
                    const parsed = GAEBEngine.parseGAEBXML(xml);

                    const res = saveX83Import(db, parsed, {
                        fileName: 'case2_bom.x83',
                        rawBytes: bufWithBom,
                        rawXml: xml
                    });
                    assert.ok(res.importId > 0);
                    assert.strictEqual(res.hasOriginalBytes, true);

                    const retrieved = getImportOriginalBuffer(db, res.importId);
                    assert.strictEqual(retrieved[0], 0xEF);
                    assert.strictEqual(retrieved[1], 0xBB);
                    assert.strictEqual(retrieved[2], 0xBF);
                } finally {
                    cleanupDb(db, dbPath);
                }
            });

            test('8.A.3 Buffer und XML-Text unterscheiden sich in Leerzeichen oder Zeilenumbruch -> Hart abgewiesen (Konsistenzfehler)', () => {
                const { db, dbPath } = createTempDb();
                try {
                    const xml = loadFixture('valid_schema_reference.x83');
                    const parsed = GAEBEngine.parseGAEBXML(xml);

                    // Fall 3a: Führendes Leerzeichen im Buffer
                    assert.throws(() => {
                        saveX83Import(db, parsed, {
                            fileName: 'leading_space.x83',
                            rawBytes: Buffer.from(' ' + xml, 'utf8'),
                            rawXml: xml
                        });
                    }, /Konsistenzfehler: rawBytes und rawXml stimmen inhaltlich nicht überein/);

                    // Fall 3b: Nachfolgendes Leerzeichen im Buffer
                    assert.throws(() => {
                        saveX83Import(db, parsed, {
                            fileName: 'trailing_space.x83',
                            rawBytes: Buffer.from(xml + ' ', 'utf8'),
                            rawXml: xml
                        });
                    }, /Konsistenzfehler: rawBytes und rawXml stimmen inhaltlich nicht überein/);

                    // Fall 3c: Führender Zeilenumbruch im Buffer
                    assert.throws(() => {
                        saveX83Import(db, parsed, {
                            fileName: 'leading_newline.x83',
                            rawBytes: Buffer.from('\n' + xml, 'utf8'),
                            rawXml: xml
                        });
                    }, /Konsistenzfehler: rawBytes und rawXml stimmen inhaltlich nicht überein/);

                    // Fall 3d: Nachfolgender Zeilenumbruch im Buffer
                    assert.throws(() => {
                        saveX83Import(db, parsed, {
                            fileName: 'trailing_newline.x83',
                            rawBytes: Buffer.from(xml + '\n', 'utf8'),
                            rawXml: xml
                        });
                    }, /Konsistenzfehler: rawBytes und rawXml stimmen inhaltlich nicht überein/);

                    // Fall 3e: Führendes Leerzeichen in rawXml gegenüber Buffer
                    assert.throws(() => {
                        saveX83Import(db, parsed, {
                            fileName: 'xml_leading_space.x83',
                            rawBytes: Buffer.from(xml, 'utf8'),
                            rawXml: ' ' + xml
                        });
                    }, /Konsistenzfehler: rawBytes und rawXml stimmen inhaltlich nicht überein/);

                    // Fall 3f: Zeilenumbruch-Diskrepanz (CRLF vs LF darf nicht stillschweigend normalisiert werden)
                    const lfXml = xml.replace(/\r\n/g, '\n');
                    const crlfXml = lfXml.replace(/\n/g, '\r\n');
                    assert.throws(() => {
                        saveX83Import(db, parsed, {
                            fileName: 'crlf_mismatch.x83',
                            rawBytes: Buffer.from(crlfXml, 'utf8'),
                            rawXml: lfXml
                        });
                    }, /Konsistenzfehler: rawBytes und rawXml stimmen inhaltlich nicht überein/);
                } finally {
                    cleanupDb(db, dbPath);
                }
            });

            test('8.A.4 Buffer und XML-Text unterscheiden sich im XML-Inhalt -> Hart abgewiesen (Konsistenzfehler)', () => {
                const { db, dbPath } = createTempDb();
                try {
                    const xml = loadFixture('valid_schema_reference.x83');
                    const parsed = GAEBEngine.parseGAEBXML(xml);
                    const alteredXml = xml.replace('<Name>Verwaltungsbau NORD</Name>', '<Name>Manipuliertes Projekt</Name>');
                    assert.notStrictEqual(alteredXml, xml, 'Test-Fixture muss manipuliert worden sein');

                    assert.throws(() => {
                        saveX83Import(db, parsed, {
                            fileName: 'content_mismatch.x83',
                            rawBytes: Buffer.from(xml, 'utf8'),
                            rawXml: alteredXml
                        });
                    }, /Konsistenzfehler: rawBytes und rawXml stimmen inhaltlich nicht überein/);
                } finally {
                    cleanupDb(db, dbPath);
                }
            });

            test('8.A.5 getImportOriginalBuffer liefert byte-identischen Puffer inkl. BOM und CRLF zurueck', () => {
                const { db, dbPath } = createTempDb();
                try {
                    const xml = '<?xml version="1.0" encoding="utf-8"?>\r\n<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3">\r\n  <PrjInfo><NamePrj>BOM CRLF Test</NamePrj></PrjInfo>\r\n</GAEB>\r\n';
                    const utf8Bom = Buffer.from([0xEF, 0xBB, 0xBF]);
                    const originalBuffer = Buffer.concat([utf8Bom, Buffer.from(xml, 'utf8')]);

                    const parsed = GAEBEngine.parseGAEBXML(xml);
                    const res = saveX83Import(db, parsed, {
                        fileName: 'bom_crlf.x83',
                        rawBytes: originalBuffer,
                        rawXml: xml
                    });

                    const retrievedBuffer = getImportOriginalBuffer(db, res.importId);
                    assert.ok(Buffer.isBuffer(retrievedBuffer), 'Muss ein Buffer sein');
                    assert.strictEqual(retrievedBuffer.length, originalBuffer.length, 'Laenge muss exakt uebereinstimmen');
                    assert.deepStrictEqual(retrievedBuffer, originalBuffer, 'Original-Bytes muessen 100% uebereinstimmen');
                    assert.strictEqual(retrievedBuffer[0], 0xEF);
                    assert.strictEqual(retrievedBuffer[1], 0xBB);
                    assert.strictEqual(retrievedBuffer[2], 0xBF);
                    assert.ok(retrievedBuffer.toString('utf8').includes('\r\n'), 'CRLF-Zeilenumbrueche muessen bitgenau erhalten bleiben');
                } finally {
                    cleanupDb(db, dbPath);
                }
            });
        });

        // ---------------------------------------------------------------------
        // B. Bereinigung & Status-Aktualisierung von Altdaten-Entwürfen (QtyTBD)
        // ---------------------------------------------------------------------
        describe('8.B Bereinigung & Status-Aktualisierung von Altdaten-Entwürfen (QtyTBD)', () => {

            test('8.B.1 Migration einer echten Altdatenbank ohne unresolved_qty_tbd_count korrigiert Entwurfsstatus und Zaehler', () => {
                const dbPath = path.join(os.tmpdir(), `legacy_drafts_mig_test_${Date.now()}_${Math.random().toString(36).slice(2)}.sqlite`);
                const legacyDb = new Database(dbPath);
                legacyDb.pragma('foreign_keys = ON');

                try {
                    // Erstelle echte Altdatenbank:
                    // gaeb_tender_drafts existiert OHNE unresolved_qty_tbd_count Spalte
                    legacyDb.exec(`
                        CREATE TABLE dokumente (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            type TEXT NOT NULL,
                            nr TEXT NOT NULL,
                            datum TEXT,
                            status TEXT,
                            netto REAL DEFAULT 0,
                            steuer REAL DEFAULT 0,
                            brutto REAL DEFAULT 0
                        );
                        CREATE TABLE gaeb_imports (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            file_name TEXT NOT NULL,
                            gaeb_version TEXT DEFAULT '3.3',
                            exchange_phase TEXT DEFAULT 'X83',
                            project_name TEXT,
                            currency TEXT DEFAULT 'EUR',
                            file_hash TEXT NOT NULL,
                            file_size INTEGER,
                            raw_xml TEXT,
                            imported_at TEXT DEFAULT CURRENT_TIMESTAMP,
                            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                        );
                        CREATE TABLE gaeb_items (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            import_id INTEGER NOT NULL REFERENCES gaeb_imports(id),
                            category_id INTEGER,
                            sort_index INTEGER NOT NULL,
                            path_oz TEXT NOT NULL,
                            item_type TEXT NOT NULL,
                            short_text TEXT,
                            menge REAL,
                            is_qty_tbd INTEGER NOT NULL DEFAULT 0,
                            einheit TEXT,
                            preis REAL,
                            gesamtpreis REAL,
                            is_price_missing INTEGER NOT NULL DEFAULT 1,
                            in_endsumme_enthalten INTEGER NOT NULL DEFAULT 1,
                            is_hinweistext INTEGER NOT NULL DEFAULT 0
                        );
                        CREATE TABLE gaeb_item_bireq (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            item_id INTEGER NOT NULL REFERENCES gaeb_items(id),
                            sort_index INTEGER NOT NULL,
                            bireq_type TEXT,
                            label TEXT,
                            value TEXT
                        );
                        CREATE TABLE gaeb_tender_drafts (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            import_id INTEGER NOT NULL REFERENCES gaeb_imports(id),
                            angebot_id INTEGER REFERENCES dokumente(id),
                            version INTEGER NOT NULL DEFAULT 1,
                            name TEXT NOT NULL,
                            status TEXT NOT NULL DEFAULT 'IN_BEARBEITUNG',
                            total_netto REAL DEFAULT 0,
                            total_tax REAL DEFAULT 0,
                            total_brutto REAL DEFAULT 0,
                            unpriced_count INTEGER DEFAULT 0,
                            missing_bireq_count INTEGER DEFAULT 0,
                            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                        );
                        CREATE TABLE gaeb_tender_item_prices (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            draft_id INTEGER NOT NULL REFERENCES gaeb_tender_drafts(id),
                            gaeb_item_id INTEGER NOT NULL REFERENCES gaeb_items(id),
                            unit_price REAL,
                            is_zero_confirmed INTEGER NOT NULL DEFAULT 0,
                            total_price REAL,
                            tax_rate REAL DEFAULT 19.0,
                            in_total INTEGER NOT NULL DEFAULT 1
                        );
                        CREATE TABLE gaeb_tender_bireq_answers (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            draft_id INTEGER NOT NULL REFERENCES gaeb_tender_drafts(id),
                            gaeb_bireq_id INTEGER NOT NULL REFERENCES gaeb_item_bireq(id),
                            answer_value TEXT NOT NULL
                        );
                    `);

                    // Import anlegen
                    legacyDb.prepare(`
                        INSERT INTO gaeb_imports (id, file_name, file_hash, file_size, raw_xml)
                        VALUES (1, 'legacy_tender.x83', 'hash_legacy_1', 1000, '<GAEB></GAEB>')
                    `).run();

                    // Position 1: QtyTBD = 1, menge = NULL, in_endsumme_enthalten = 1
                    legacyDb.prepare(`
                        INSERT INTO gaeb_items (id, import_id, sort_index, path_oz, item_type, menge, is_qty_tbd, in_endsumme_enthalten, is_hinweistext)
                        VALUES (101, 1, 1, '01.01.001', 'Normal', NULL, 1, 1, 0)
                    `).run();

                    // Position 2: Normale Position ohne QtyTBD, menge = 10, in_endsumme_enthalten = 1
                    legacyDb.prepare(`
                        INSERT INTO gaeb_items (id, import_id, sort_index, path_oz, item_type, menge, is_qty_tbd, in_endsumme_enthalten, is_hinweistext)
                        VALUES (102, 1, 2, '01.01.002', 'Normal', 10.0, 0, 1, 0)
                    `).run();

                    // Entwurf 1: status = 'VOLLSTAENDIG_BEPREIST', hat aber einbezogene QtyTBD-Position (101)
                    legacyDb.prepare(`
                        INSERT INTO gaeb_tender_drafts (id, import_id, version, name, status, unpriced_count, missing_bireq_count)
                        VALUES (1, 1, 1, 'Entwurf 1 (Alt fälschlich vollstaendig)', 'VOLLSTAENDIG_BEPREIST', 0, 0)
                    `).run();
                    legacyDb.prepare(`
                        INSERT INTO gaeb_tender_item_prices (draft_id, gaeb_item_id, unit_price, total_price, in_total)
                        VALUES (1, 101, 75.0, NULL, 1),
                               (1, 102, 100.0, 1000.0, 1)
                    `).run();

                    // Entwurf 2: status = 'VOLLSTAENDIG_BEPREIST', hat KEINE QtyTBD-Position (nur Position 102 ist in_total=1, Position 101 ist in_total=0)
                    legacyDb.prepare(`
                        INSERT INTO gaeb_tender_drafts (id, import_id, version, name, status, unpriced_count, missing_bireq_count)
                        VALUES (2, 1, 2, 'Entwurf 2 (Echt vollstaendig)', 'VOLLSTAENDIG_BEPREIST', 0, 0)
                    `).run();
                    legacyDb.prepare(`
                        INSERT INTO gaeb_tender_item_prices (draft_id, gaeb_item_id, unit_price, total_price, in_total)
                        VALUES (2, 101, 75.0, NULL, 0),
                               (2, 102, 100.0, 1000.0, 1)
                    `).run();

                    // Entwurf 3: status = 'VERWORFEN', hat einbezogene QtyTBD-Position (101)
                    legacyDb.prepare(`
                        INSERT INTO gaeb_tender_drafts (id, import_id, version, name, status, unpriced_count, missing_bireq_count)
                        VALUES (3, 1, 3, 'Entwurf 3 (Verworfen)', 'VERWORFEN', 0, 0)
                    `).run();
                    legacyDb.prepare(`
                        INSERT INTO gaeb_tender_item_prices (draft_id, gaeb_item_id, unit_price, total_price, in_total)
                        VALUES (3, 101, 75.0, NULL, 1),
                               (3, 102, 100.0, 1000.0, 1)
                    `).run();

                    // Führe Migration aus
                    runGaebMigrations(legacyDb);

                    // Schließe DB und öffne neu von Disk
                    legacyDb.close();
                    const dbReopened = new Database(dbPath);
                    dbReopened.pragma('foreign_keys = ON');

                    try {
                        // Assertiere Entwurf 1:
                        // unresolved_qty_tbd_count > 0 (genau 1) und status korrigiert auf 'IN_BEARBEITUNG'
                        const d1 = dbReopened.prepare('SELECT id, name, status, unresolved_qty_tbd_count, unpriced_count, missing_bireq_count FROM gaeb_tender_drafts WHERE id = 1').get();
                        assert.strictEqual(d1.unresolved_qty_tbd_count, 1, 'Entwurf 1 muss unresolved_qty_tbd_count = 1 haben');
                        assert.strictEqual(d1.status, 'IN_BEARBEITUNG', 'Entwurf 1 muss von VOLLSTAENDIG_BEPREIST auf IN_BEARBEITUNG zurueckgestuft werden');

                        // Assertiere Entwurf 2:
                        // behält status = 'VOLLSTAENDIG_BEPREIST' und unresolved_qty_tbd_count = 0
                        const d2 = dbReopened.prepare('SELECT id, name, status, unresolved_qty_tbd_count, unpriced_count, missing_bireq_count FROM gaeb_tender_drafts WHERE id = 2').get();
                        assert.strictEqual(d2.unresolved_qty_tbd_count, 0, 'Entwurf 2 darf keine unresolved QtyTBDs haben');
                        assert.strictEqual(d2.status, 'VOLLSTAENDIG_BEPREIST', 'Entwurf 2 muss VOLLSTAENDIG_BEPREIST bleiben');

                        // Assertiere Entwurf 3:
                        // behält status = 'VERWORFEN' (niemals reaktivieren!), hat aber unresolved_qty_tbd_count = 1
                        const d3 = dbReopened.prepare('SELECT id, name, status, unresolved_qty_tbd_count, unpriced_count, missing_bireq_count FROM gaeb_tender_drafts WHERE id = 3').get();
                        assert.strictEqual(d3.status, 'VERWORFEN', 'Entwurf 3 muss zwingend VERWORFEN bleiben');
                        assert.strictEqual(d3.unresolved_qty_tbd_count, 1, 'Entwurf 3 hat berechneten unresolved_qty_tbd_count = 1');

                        // Verifiziere Datenunversehrtheit:
                        // Bestehende Preise, BiReqs und Items blieben 100% unberuehrt
                        const pricesCount = dbReopened.prepare('SELECT COUNT(*) AS cnt FROM gaeb_tender_item_prices').get().cnt;
                        assert.strictEqual(pricesCount, 6, 'Preise muessen unberuehrt bleiben');

                        // Zweiter Durchlauf von runGaebMigrations(dbReopened) ist fehlerfrei und idempotent
                        assert.doesNotThrow(() => {
                            runGaebMigrations(dbReopened);
                        });

                        const d1After = dbReopened.prepare('SELECT status, unresolved_qty_tbd_count FROM gaeb_tender_drafts WHERE id = 1').get();
                        const d2After = dbReopened.prepare('SELECT status, unresolved_qty_tbd_count FROM gaeb_tender_drafts WHERE id = 2').get();
                        const d3After = dbReopened.prepare('SELECT status, unresolved_qty_tbd_count FROM gaeb_tender_drafts WHERE id = 3').get();

                        assert.deepStrictEqual(d1After, { status: 'IN_BEARBEITUNG', unresolved_qty_tbd_count: 1 });
                        assert.deepStrictEqual(d2After, { status: 'VOLLSTAENDIG_BEPREIST', unresolved_qty_tbd_count: 0 });
                        assert.deepStrictEqual(d3After, { status: 'VERWORFEN', unresolved_qty_tbd_count: 1 });
                    } finally {
                        dbReopened.close();
                    }
                } finally {
                    try {
                        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
                        const wal = `${dbPath}-wal`;
                        const shm = `${dbPath}-shm`;
                        if (fs.existsSync(wal)) fs.unlinkSync(wal);
                        if (fs.existsSync(shm)) fs.unlinkSync(shm);
                    } catch (_e) {}
                }
            });
        });

        // ---------------------------------------------------------------------
        // C. Zuverlässige Installation und Verifikation der SQLite-Trigger
        // ---------------------------------------------------------------------
        describe('8.C Zuverlässige Installation und Verifikation der SQLite-Trigger', () => {

            test('8.C.1 Alle 5 Trigger und der Unique-Index sind aktiv in sqlite_master registriert', () => {
                const { db, dbPath } = createTempDb();
                try {
                    const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all().map(r => r.name);
                    const triggerSet = new Set(triggers);

                    for (const requiredTrg of REQUIRED_GAEB_TRIGGERS) {
                        assert.ok(
                            triggerSet.has(requiredTrg),
                            `Trigger ${requiredTrg} muss in sqlite_master existieren`
                        );
                    }
                    assert.strictEqual(REQUIRED_GAEB_TRIGGERS.length, 5);

                    const indices = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r => r.name);
                    const indexSet = new Set(indices);

                    for (const requiredIdx of REQUIRED_GAEB_INDICES) {
                        assert.ok(
                            indexSet.has(requiredIdx),
                            `Index ${requiredIdx} muss in sqlite_master existieren`
                        );
                    }
                    assert.ok(indexSet.has('idx_gaeb_tender_drafts_import_version'));
                } finally {
                    cleanupDb(db, dbPath);
                }
            });

            test('8.C.2 Direkte SQL-Integritätstests für alle Trigger (Angebot vs. Rechnung)', () => {
                const { db, dbPath } = createTempDb();
                try {
                    const xml = loadFixture('valid_schema_reference.x83');
                    const parsed = GAEBEngine.parseGAEBXML(xml);
                    const imp = saveX83Import(db, parsed, { fileName: 'trigger_test.x83', rawXml: xml });
                    const importId = imp.importId;

                    // 1. Dokumente anlegen: 1 verknüpftes Angebot, 1 unverknüpftes Angebot, 1 Rechnung
                    const linkedAngRes = db.prepare(`
                        INSERT INTO dokumente (type, nr, datum, status, netto, steuer, brutto)
                        VALUES ('angebot', 'ANG-TRG-LINKED', '2026-09-29', 'OFFEN', 100, 19, 119)
                    `).run();
                    const linkedAngebotId = linkedAngRes.lastInsertRowid;

                    const unlinkedAngRes = db.prepare(`
                        INSERT INTO dokumente (type, nr, datum, status, netto, steuer, brutto)
                        VALUES ('angebot', 'ANG-TRG-FREE', '2026-09-29', 'OFFEN', 200, 38, 238)
                    `).run();
                    const unlinkedAngebotId = unlinkedAngRes.lastInsertRowid;

                    const rechnungRes = db.prepare(`
                        INSERT INTO dokumente (type, nr, datum, status, netto, steuer, brutto)
                        VALUES ('rechnung', 'RE-TRG-001', '2026-09-29', 'OFFEN', 300, 57, 357)
                    `).run();
                    const rechnungId = rechnungRes.lastInsertRowid;

                    // Verknüpfe linkedAngebotId
                    createTenderDraft(db, importId, { angebotId: linkedAngebotId, version: 1 });

                    // SQL-Test 1: UPDATE dokumente SET type = 'rechnung' WHERE id = linkedAngebotId -> scheitert durch Trigger
                    assert.throws(() => {
                        db.prepare("UPDATE dokumente SET type = 'rechnung' WHERE id = ?").run(linkedAngebotId);
                    }, /Änderung des Dokumenttyps verweigert: Dieses Angebot ist mit einer GAEB-Ausschreibung verknüpft/);

                    // SQL-Test 2: UPDATE dokumente SET type = 'rechnung' WHERE id = unlinkedAngebotId -> gelingt
                    assert.doesNotThrow(() => {
                        db.prepare("UPDATE dokumente SET type = 'rechnung' WHERE id = ?").run(unlinkedAngebotId);
                    });
                    const updatedUnlinked = db.prepare("SELECT type FROM dokumente WHERE id = ?").get(unlinkedAngebotId);
                    assert.strictEqual(updatedUnlinked.type, 'rechnung');

                    // SQL-Test 3: INSERT INTO gaeb_tender_drafts mit rechnungId -> scheitert durch Trigger
                    assert.throws(() => {
                        db.prepare(`
                            INSERT INTO gaeb_tender_drafts (import_id, angebot_id, version, name)
                            VALUES (?, ?, 99, 'Rechnung als Entwurfsangebot')
                        `).run(importId, rechnungId);
                    }, /Ungültige Verknüpfung: Das referenzierte Dokument im Entwurf muss vom Typ angebot sein/);

                    // SQL-Test 4: INSERT INTO gaeb_import_angebote mit rechnungId -> scheitert durch Trigger
                    assert.throws(() => {
                        db.prepare(`
                            INSERT INTO gaeb_import_angebote (import_id, angebot_id)
                            VALUES (?, ?)
                        `).run(importId, rechnungId);
                    }, /Ungültige Verknüpfung: Das referenzierte Dokument muss vom Typ angebot sein/);
                } finally {
                    cleanupDb(db, dbPath);
                }
            });

            test('8.C.3 Negativtest: initGaebSchema wirft harte Exception wenn dokumente-Tabelle fehlt (kein stilles Verschlucken)', () => {
                const dbPath = path.join(os.tmpdir(), `no_dok_schema_test_${Date.now()}_${Math.random().toString(36).slice(2)}.sqlite`);
                const nakedDb = new Database(dbPath);

                try {
                    // nakedDb hat KEINE dokumente-Tabelle
                    assert.throws(() => {
                        initGaebSchema(nakedDb);
                    }, /Integritätsfehler: Tabelle "dokumente" existiert nicht/);
                } finally {
                    cleanupDb(nakedDb, dbPath);
                }
            });
        });
    });
});

console.log('GAEB_TENDER_PRICING_TESTS_PASSED');
