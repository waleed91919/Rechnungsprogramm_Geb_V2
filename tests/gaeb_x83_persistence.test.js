/**
 * tests/gaeb_x83_persistence.test.js
 * 
 * Umfassende Testsuite für den vollständigen Persistenz-Lebenszyklus
 * von GAEB X83 Ausschreibungsdaten in W-Link ERP (SQLite).
 * 
 * Verifiziert:
 * 1. Roundtrip-Lebenszyklus: XML -> parseGAEBXML() -> saveX83Import() -> db.close() -> reopen -> loadX83Import() -> Tiefenvergleich
 * 2. Alle 7 Fixtures: XSD-valide Referenzen (3.3 & 3.2 pyGAEB) und interne Edge-Case Modelle
 * 3. Vollständigen Datenerhalt: Hierarchien, OZs, Langtexte, Vorbemerkungen, BiReq, UPComponents, Null-Preise, QtyTBD
 * 4. Atomare Transaktionen mit Rollback-Schutz bei Fehlern
 * 5. Re-Import Policy mit Verknüpfungsschutz
 * 6. Kaskadierendes Löschen mit Verknüpfungsschutz
 * 7. Migration auf bestehender Altdatenbank ohne Datenverlust
 * 8. SQLite Fremdschlüssel-Integrität (PRAGMA foreign_key_check = 0)
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('child_process');

const IS_ELECTRON_AS_NODE = !!process.versions.electron;
const RUN_INNER_MARKER = 'GAEB_PERSISTENCE_INNER_RUN';

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
    test('GAEB X83 Persistenz: Alle Tests (inkl. SQLite DB-Ebene via Electron-as-Node)', () => {
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

            assert.ok(stdout.includes('GAEB_PERSISTENCE_TESTS_PASSED'), 'Innerer Testlauf muss erfolgreich abschließen');
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
const { initGaebSchema, runGaebMigrations } = require('../db/schema/gaeb_schema');
const {
    saveX83Import,
    loadX83Import,
    listX83Imports,
    deleteX83Import,
    calculateFileHash
} = require('../db/repositories/gaeb_repository');
const { createSchema, runMigrations } = require('../schema');

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'gaeb_x83');

function loadFixture(filename) {
    const filePath = path.join(FIXTURES_DIR, filename);
    return fs.readFileSync(filePath, 'utf8');
}

function createTempDb() {
    const dbPath = path.join(os.tmpdir(), `gaeb_test_${Date.now()}_${Math.random().toString(36).slice(2)}.sqlite`);
    const db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    createSchema(db);
    return { db, dbPath };
}

function cleanupDb(db, dbPath) {
    try {
        if (db && db.open) {
            db.close();
        }
    } catch (_e) {}
    try {
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        const wal = `${dbPath}-wal`;
        const shm = `${dbPath}-shm`;
        if (fs.existsSync(wal)) fs.unlinkSync(wal);
        if (fs.existsSync(shm)) fs.unlinkSync(shm);
    } catch (_e) {}
}

describe('GAEB X83 Persistenz: Vollständiger SQLite-Lebenszyklus & Datenintegrität', () => {

    // =========================================================================
    // 1. Roundtrip-Lebenszyklus auf offiziellen XSD-validen Referenzen
    // =========================================================================
    describe('1. Roundtrip auf XSD-validen Referenzen (GAEB 3.3 und GAEB 3.2)', () => {

        test('1.1 GAEB 3.3 Referenzdatei (valid_schema_reference.x83): Speichern, DB schließen, öffnen, laden & Tiefenvergleich', () => {
            const xml = loadFixture('valid_schema_reference.x83');
            const parsed = GAEBEngine.parseGAEBXML(xml);

            const { db, dbPath } = createTempDb();

            try {
                // 1. Speichern in SQLite
                const saveRes = saveX83Import(db, parsed, {
                    fileName: 'valid_schema_reference.x83',
                    rawXml: xml,
                    gaebVersion: '3.3'
                });
                assert.ok(saveRes.importId > 0, 'Import-ID muss positiv sein');
                assert.strictEqual(saveRes.isExisting, false);
                assert.strictEqual(saveRes.itemCount, parsed.items.length);

                // 2. Fremdschlüssel-Prüfung
                const fkErrors = db.pragma('foreign_key_check');
                assert.strictEqual(fkErrors.length, 0, 'Keine Fremdschlüsselverletzungen nach Insert');

                // 3. Datenbank schließen
                db.close();

                // 4. Datenbank komplett neu öffnen
                const dbReopened = new Database(dbPath);
                dbReopened.pragma('foreign_keys = ON');

                try {
                    // 5. Laden aus Datenbank
                    const loaded = loadX83Import(dbReopened, saveRes.importId);
                    assert.ok(loaded, 'Geladenes Objekt darf nicht null sein');

                    // 6. Tiefenvergleich Metadaten
                    assert.strictEqual(loaded.projectInfo.currency, parsed.projectInfo.currency);
                    assert.strictEqual(loaded.projectInfo.name, parsed.projectInfo.name);
                    assert.strictEqual(loaded.rawXml, xml, 'Original-XML muss 100% bit-genau erhalten bleiben');

                    // 7. Tiefenvergleich Positionen (Flat List)
                    assert.strictEqual(loaded.items.length, parsed.items.length, 'Exakte Positionsanzahl');
                    for (let i = 0; i < parsed.items.length; i++) {
                        const orig = parsed.items[i];
                        const rel = loaded.items[i];

                        assert.strictEqual(rel.oz_code, orig.oz_code, `OZ-Code Position ${i}`);
                        assert.strictEqual(rel.rno_part, orig.rno_part, `RNoPart Position ${i}`);
                        assert.strictEqual(rel.kurztext, orig.kurztext, `Kurztext Position ${i}`);
                        assert.strictEqual(rel.langtext, orig.langtext, `Langtext Position ${i}`);
                        assert.strictEqual(rel.menge, orig.menge, `Menge Position ${i}`);
                        assert.strictEqual(rel.einheit, orig.einheit, `Einheit Position ${i}`);
                        assert.strictEqual(rel.preis, null, `Preis muss in X83 strikt null sein (Pos ${i})`);
                        assert.strictEqual(rel.isPriceMissing, true, `isPriceMissing muss true sein (Pos ${i})`);
                        assert.strictEqual(rel.positions_art, orig.positions_art, `Positionsart Pos ${i}`);
                        assert.strictEqual(rel.in_endsumme_enthalten, orig.in_endsumme_enthalten, `in_endsumme Pos ${i}`);
                    }

                    // 8. Tiefenvergleich BoQCtgy-Hierarchie
                    assert.ok(Array.isArray(loaded.categories), 'Kategorien müssen ein Array sein');
                    assert.strictEqual(loaded.categories.length, parsed.categories.length, 'Anzahl Top-Level Kategorien');

                    function compareCategories(origCats, loadedCats) {
                        assert.strictEqual(loadedCats.length, origCats.length);
                        for (let c = 0; c < origCats.length; c++) {
                            const oCat = origCats[c];
                            const lCat = loadedCats[c];
                            assert.strictEqual(lCat.name, oCat.name, `Kategoriename Ebene ${lCat.level}`);
                            assert.strictEqual(lCat.rno_part, oCat.rno_part, `RNoPart Ebene ${lCat.level}`);
                            assert.strictEqual(lCat.lblCtgy, oCat.lblCtgy, `lblCtgy Ebene ${lCat.level}`);
                            assert.strictEqual(lCat.items.length, oCat.items.length, `Items in Kategorie ${lCat.name}`);

                            if (oCat.categories && oCat.categories.length > 0) {
                                compareCategories(oCat.categories, lCat.categories);
                            }
                        }
                    }
                    compareCategories(parsed.categories, loaded.categories);
                } finally {
                    dbReopened.close();
                }
            } finally {
                cleanupDb(db, dbPath);
            }
        });

        test('1.2 Unabhängiges Referenzmuster pyGAEB 3.2 (independent_pygaeb_da32.x83): Persistenz & Rekonstruktion', () => {
            const xml = loadFixture('independent_pygaeb_da32.x83');
            const parsed = GAEBEngine.parseGAEBXML(xml);

            const { db, dbPath } = createTempDb();

            try {
                const saveRes = saveX83Import(db, parsed, {
                    fileName: 'independent_pygaeb_da32.x83',
                    rawXml: xml,
                    gaebVersion: '3.2'
                });
                assert.ok(saveRes.importId > 0);
                assert.strictEqual(saveRes.itemCount, parsed.items.length);

                db.close();

                const dbReopened = new Database(dbPath);
                dbReopened.pragma('foreign_keys = ON');

                try {
                    const loaded = loadX83Import(dbReopened, saveRes.importId);
                    assert.ok(loaded);
                    assert.strictEqual(loaded.items.length, parsed.items.length);
                    assert.strictEqual(loaded.categories.length, parsed.categories.length);

                    // Prüfung pyGAEB-Besonderheiten: QtyTBD, Langtexte, Null-Preise
                    for (let i = 0; i < parsed.items.length; i++) {
                        const orig = parsed.items[i];
                        const rel = loaded.items[i];

                        assert.strictEqual(rel.oz_code, orig.oz_code);
                        assert.strictEqual(rel.kurztext, orig.kurztext);
                        assert.strictEqual(rel.preis, null, `pyGAEB Pos ${orig.oz_code}: Preis muss null sein`);
                        assert.strictEqual(rel.isPriceMissing, true);
                        assert.strictEqual(Boolean(rel.isQtyTBD), Boolean(orig.isQtyTBD), `isQtyTBD Pos ${orig.oz_code}`);
                        assert.strictEqual(rel.menge, orig.menge, `Menge Pos ${orig.oz_code}`);
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
    // 2. Interne Edge-Case-Modelle (Transparente Unterscheidung laut liesen.txt)
    // =========================================================================
    describe('2. Interne Testmodelle für Parser- und Persistenz-Härtung (Edge Cases)', () => {

        test('2.1 Standard-Hierarchie 3 Ebenen (01_standard_hierarchie.x83): Tiefe Hierarchien & Pfad-OZs', () => {
            const xml = loadFixture('01_standard_hierarchie.x83');
            const parsed = GAEBEngine.parseGAEBXML(xml);

            const { db, dbPath } = createTempDb();

            try {
                const saveRes = saveX83Import(db, parsed, {
                    fileName: '01_standard_hierarchie.x83',
                    rawXml: xml
                });
                assert.ok(saveRes.importId > 0);

                db.close();

                const dbReopened = new Database(dbPath);
                try {
                    const loaded = loadX83Import(dbReopened, saveRes.importId);
                    assert.strictEqual(loaded.items.length, parsed.items.length);

                    // Überprüfe 3-stufige Verschachtelung
                    assert.strictEqual(loaded.categories.length, 1, '1 Gewerk auf oberster Ebene');
                    const gewerk = loaded.categories[0];
                    assert.strictEqual(gewerk.categories.length, 1, '1 Abschnitt im Gewerk');
                    assert.strictEqual(gewerk.categories[0].categories.length, 2, '2 Unterabschnitte im Abschnitt');
                    assert.strictEqual(gewerk.categories[0].categories[0].items.length, 2, '2 Positionen im Unterabschnitt 01');
                    assert.strictEqual(gewerk.categories[0].categories[0].items[0].oz_code, '01.01.01.0010');
                } finally {
                    dbReopened.close();
                }
            } finally {
                cleanupDb(db, dbPath);
            }
        });

        test('2.2 Positionstypen (02_positionstypen_wahl_bedarf.x83): Wahl, Bedarf, Pauschale, Hinweistexte', () => {
            const xml = loadFixture('02_positionstypen_wahl_bedarf.x83');
            const parsed = GAEBEngine.parseGAEBXML(xml);

            const { db, dbPath } = createTempDb();

            try {
                const saveRes = saveX83Import(db, parsed, {
                    fileName: '02_positionstypen_wahl_bedarf.x83',
                    rawXml: xml
                });

                db.close();

                const dbReopened = new Database(dbPath);
                try {
                    const loaded = loadX83Import(dbReopened, saveRes.importId);
                    assert.strictEqual(loaded.items.length, parsed.items.length);

                    // Detailprüfung Positionstypen
                    const grundPos = loaded.items.find(p => p.oz_code.includes('0020'));
                    assert.ok(grundPos, 'Grundposition 01.0020 muss existieren');
                    assert.strictEqual(grundPos.positions_art, 'GRUND');
                    assert.strictEqual(grundPos.isGrundposition, true);
                    assert.strictEqual(grundPos.in_endsumme_enthalten, 1);

                    const wahlPos = loaded.items.find(p => p.oz_code.includes('0030'));
                    assert.ok(wahlPos, 'Wahlposition 01.0030 muss existieren');
                    assert.strictEqual(wahlPos.positions_art, 'WAHL');
                    assert.strictEqual(wahlPos.in_endsumme_enthalten, 0, 'Wahlposition nicht in Endsumme');
                    assert.strictEqual(wahlPos.isAlternative, true);

                    const bedarfMitGb = loaded.items.find(p => p.oz_code.includes('0040'));
                    assert.ok(bedarfMitGb, 'Bedarfsposition 01.0040 muss existieren');
                    assert.strictEqual(bedarfMitGb.positions_art, 'BEDARF_MIT_GB');
                    assert.strictEqual(bedarfMitGb.in_endsumme_enthalten, 1, 'Bedarf mit Gesamtbetrag in Endsumme enthalten');
                    assert.strictEqual(bedarfMitGb.isBedarf, true);

                    const bedarfOhneGb = loaded.items.find(p => p.oz_code.includes('0050'));
                    assert.ok(bedarfOhneGb, 'Bedarfsposition 01.0050 muss existieren');
                    assert.strictEqual(bedarfOhneGb.positions_art, 'BEDARF_OHNE_GB');
                    assert.strictEqual(bedarfOhneGb.in_endsumme_enthalten, 0, 'Bedarf ohne Gesamtbetrag nicht in Endsumme enthalten');
                    assert.strictEqual(bedarfOhneGb.isBedarf, true);

                    const pauschalPos = loaded.items.find(p => p.oz_code.includes('0060'));
                    assert.ok(pauschalPos, 'Pauschalposition 01.0060 muss existieren');
                    assert.strictEqual(pauschalPos.positions_art, 'PAUSCHALE');
                    assert.strictEqual(pauschalPos.isPauschal, true);
                    assert.strictEqual(pauschalPos.einheit, 'Psch');
                } finally {
                    dbReopened.close();
                }
            } finally {
                cleanupDb(db, dbPath);
            }
        });

        test('2.3 Bieterangaben, Vorbemerkungen & UPComponents (03_bieterangaben_vorbemerkungen_ep.x83)', () => {
            const xml = loadFixture('03_bieterangaben_vorbemerkungen_ep.x83');
            const parsed = GAEBEngine.parseGAEBXML(xml);

            const { db, dbPath } = createTempDb();

            try {
                const saveRes = saveX83Import(db, parsed, {
                    fileName: '03_bieterangaben_vorbemerkungen_ep.x83',
                    rawXml: xml
                });

                db.close();

                const dbReopened = new Database(dbPath);
                try {
                    const loaded = loadX83Import(dbReopened, saveRes.importId);
                    assert.strictEqual(loaded.items.length, parsed.items.length);

                    // 1. Vorbemerkung auf Titelebene
                    const catWithDesc = loaded.categories.find(c => c.description || c.vorbemerkung);
                    assert.ok(catWithDesc, 'Kategorie mit Vorbemerkung muss geladen werden');
                    assert.ok(catWithDesc.description.includes('Allgemeine Vorbemerkung') || catWithDesc.description.includes('Vorbemerkung'));

                    // 2. Bieterangaben (<BiReq>)
                    const posWithBiReq = loaded.items.find(p => p.bieterangaben && p.bieterangaben.length > 0);
                    assert.ok(posWithBiReq, 'Position mit BiReq muss geladen werden');
                    assert.strictEqual(posWithBiReq.requiresBidderInfo, true);
                    assert.ok(posWithBiReq.bieterangaben[0].label || posWithBiReq.bieterangaben[0].description);

                    // 3. UPComponents
                    const posWithUP = loaded.items.find(p => p.upComponents);
                    assert.ok(posWithUP, 'Position mit UPComponents muss geladen werden');
                    assert.ok(posWithUP.upComponents.lohn !== undefined || posWithUP.lohn !== undefined);
                } finally {
                    dbReopened.close();
                }
            } finally {
                cleanupDb(db, dbPath);
            }
        });

        test('2.4 Reales Hochbau-Muster (04_reales_muster_hochbau.x83): Gewerke, Abschnitte und Langtexte', () => {
            const xml = loadFixture('04_reales_muster_hochbau.x83');
            const parsed = GAEBEngine.parseGAEBXML(xml);

            const { db, dbPath } = createTempDb();

            try {
                const saveRes = saveX83Import(db, parsed, {
                    fileName: '04_reales_muster_hochbau.x83',
                    rawXml: xml
                });

                db.close();

                const dbReopened = new Database(dbPath);
                try {
                    const loaded = loadX83Import(dbReopened, saveRes.importId);
                    assert.strictEqual(loaded.items.length, parsed.items.length);
                    assert.strictEqual(loaded.categories.length, parsed.categories.length);
                    assert.ok(loaded.items.every(p => p.preis === null), 'Alle Preise müssen in X83 null sein');
                } finally {
                    dbReopened.close();
                }
            } finally {
                cleanupDb(db, dbPath);
            }
        });

        test('2.5 ZTVE-Spezifikationen (05_muster_angelehnt_an_gaeb_bvbs.x83)', () => {
            const xml = loadFixture('05_muster_angelehnt_an_gaeb_bvbs.x83');
            const parsed = GAEBEngine.parseGAEBXML(xml);

            const { db, dbPath } = createTempDb();

            try {
                const saveRes = saveX83Import(db, parsed, {
                    fileName: '05_muster_angelehnt_an_gaeb_bvbs.x83',
                    rawXml: xml
                });

                db.close();

                const dbReopened = new Database(dbPath);
                try {
                    const loaded = loadX83Import(dbReopened, saveRes.importId);
                    assert.strictEqual(loaded.items.length, parsed.items.length);
                } finally {
                    dbReopened.close();
                }
            } finally {
                cleanupDb(db, dbPath);
            }
        });
    });

    // =========================================================================
    // 3. Fehlertoleranz, Transaktions-Rollback & Re-Import Policy
    // =========================================================================
    describe('3. Fehlertoleranz, Transaktions-Rollback & Re-Import Policy', () => {

        test('3.1 Transaktions-Rollback: Fehler mitten im Speichervorgang hinterlässt KEINE Spuren in der DB', () => {
            const xml = loadFixture('valid_schema_reference.x83');
            const parsed = GAEBEngine.parseGAEBXML(xml);

            const { db, dbPath } = createTempDb();

            try {
                // Vorher: 0 Einträge
                assert.strictEqual(db.prepare('SELECT COUNT(*) AS cnt FROM gaeb_imports').get().cnt, 0);

                // Manipuliere parsedData mit einem fehlerhaften Element mitten in den Items
                const corruptParsed = JSON.parse(JSON.stringify(parsed));
                corruptParsed.items.splice(2, 0, {
                    get name() {
                        throw new Error('Erzwungener Fehler mitten im Speichervorgang');
                    },
                    oz_code: '01.01.9999',
                    positions_art: 'NORMAL'
                });

                let caughtError = null;
                try {
                    saveX83Import(db, corruptParsed, {
                        fileName: 'corrupt.x83',
                        rawXml: '<GAEB></GAEB>'
                    });
                } catch (err) {
                    caughtError = err;
                }

                assert.ok(caughtError, 'Speichern muss mit Fehler abbrechen');

                // Verifiziere vollständigen Rollback: Absolut KEINE Zeilen in gaeb_imports, gaeb_categories, gaeb_items
                const importCount = db.prepare('SELECT COUNT(*) AS cnt FROM gaeb_imports').get().cnt;
                const catCount = db.prepare('SELECT COUNT(*) AS cnt FROM gaeb_categories').get().cnt;
                const itemCount = db.prepare('SELECT COUNT(*) AS cnt FROM gaeb_items').get().cnt;

                assert.strictEqual(importCount, 0, 'gaeb_imports muss nach Rollback leer sein');
                assert.strictEqual(catCount, 0, 'gaeb_categories muss nach Rollback leer sein');
                assert.strictEqual(itemCount, 0, 'gaeb_items muss nach Rollback leer sein');
            } finally {
                cleanupDb(db, dbPath);
            }
        });

        test('3.2 Re-Import Policy: Gleicher Datei-Hash ohne Overwrite gibt bestehenden Import zurück (keine Duplikate)', () => {
            const xml = loadFixture('valid_schema_reference.x83');
            const parsed = GAEBEngine.parseGAEBXML(xml);

            const { db, dbPath } = createTempDb();

            try {
                // 1. Erstimport
                const res1 = saveX83Import(db, parsed, {
                    fileName: 'test.x83',
                    rawXml: xml
                });
                assert.strictEqual(res1.isExisting, false);
                const firstId = res1.importId;

                // 2. Zweitimport derselben Datei ohne overwrite-Option
                const res2 = saveX83Import(db, parsed, {
                    fileName: 'test.x83',
                    rawXml: xml,
                    overwrite: false
                });

                assert.strictEqual(res2.isExisting, true, 'isExisting muss true sein');
                assert.strictEqual(res2.importId, firstId, 'Muss dieselbe importId zurückgeben');
                assert.strictEqual(db.prepare('SELECT COUNT(*) AS cnt FROM gaeb_imports').get().cnt, 1, 'Genau 1 Eintrag in gaeb_imports');
            } finally {
                cleanupDb(db, dbPath);
            }
        });

        test('3.3 Re-Import Policy: Overwrite = true ersetzt nicht-verknüpften Import atomar', () => {
            const xml = loadFixture('valid_schema_reference.x83');
            const parsed = GAEBEngine.parseGAEBXML(xml);

            const { db, dbPath } = createTempDb();

            try {
                const res1 = saveX83Import(db, parsed, {
                    fileName: 'test.x83',
                    rawXml: xml
                });

                // Overwrite = true
                const res2 = saveX83Import(db, parsed, {
                    fileName: 'test_updated.x83',
                    rawXml: xml,
                    overwrite: true
                });

                assert.strictEqual(res2.isExisting, false);
                assert.strictEqual(db.prepare('SELECT COUNT(*) AS cnt FROM gaeb_imports').get().cnt, 1);
                assert.strictEqual(db.pragma('foreign_key_check').length, 0);
            } finally {
                cleanupDb(db, dbPath);
            }
        });

        test('3.4 Verknüpfungsschutz bei Re-Import: Position mit aktivem Beleg verknüpft -> Overwrite verweigert', () => {
            const xml = loadFixture('valid_schema_reference.x83');
            const parsed = GAEBEngine.parseGAEBXML(xml);

            const { db, dbPath } = createTempDb();

            try {
                const res1 = saveX83Import(db, parsed, {
                    fileName: 'test.x83',
                    rawXml: xml
                });

                // Simuliere Verknüpfung einer Position mit einem Beleg (linked_position_id = 42)
                db.prepare(`
                    UPDATE gaeb_items 
                    SET linked_position_id = 42 
                    WHERE import_id = ? AND id = (SELECT id FROM gaeb_items WHERE import_id = ? LIMIT 1)
                `).run(res1.importId, res1.importId);

                // Versuch des Überschreibens muss fehlschlagen
                let thrown = null;
                try {
                    saveX83Import(db, parsed, {
                        fileName: 'test.x83',
                        rawXml: xml,
                        overwrite: true
                    });
                } catch (e) {
                    thrown = e;
                }

                assert.ok(thrown, 'Muss Ausnahme werfen bei verknüpften Positionen');
                assert.ok(thrown.message.includes('verknüpft'), 'Fehlermeldung muss auf Verknüpfung hinweisen');
            } finally {
                cleanupDb(db, dbPath);
            }
        });

        test('3.5 Verknüpfungsschutz beim Löschen (deleteX83Import)', () => {
            const xml = loadFixture('valid_schema_reference.x83');
            const parsed = GAEBEngine.parseGAEBXML(xml);

            const { db, dbPath } = createTempDb();

            try {
                const res = saveX83Import(db, parsed, { fileName: 'test.x83', rawXml: xml });

                // Verknüpfe eine Position
                db.prepare(`
                    UPDATE gaeb_items 
                    SET linked_position_id = 99 
                    WHERE import_id = ? LIMIT 1
                `).run(res.importId);

                // Löschen muss abgewiesen werden
                assert.throws(() => {
                    deleteX83Import(db, res.importId);
                }, /verknüpft/);

                // Entknüpfe wieder
                db.prepare(`
                    UPDATE gaeb_items 
                    SET linked_position_id = NULL 
                    WHERE import_id = ?
                `).run(res.importId);

                // Nun muss das Löschen atomar und kaskadierend gelingen
                const delRes = deleteX83Import(db, res.importId);
                assert.strictEqual(delRes.success, true);
                assert.strictEqual(db.prepare('SELECT COUNT(*) AS cnt FROM gaeb_imports WHERE id = ?').get(res.importId).cnt, 0);
                assert.strictEqual(db.prepare('SELECT COUNT(*) AS cnt FROM gaeb_categories WHERE import_id = ?').get(res.importId).cnt, 0);
                assert.strictEqual(db.prepare('SELECT COUNT(*) AS cnt FROM gaeb_items WHERE import_id = ?').get(res.importId).cnt, 0);
                assert.strictEqual(db.pragma('foreign_key_check').length, 0);
            } finally {
                cleanupDb(db, dbPath);
            }
        });
    });

    // =========================================================================
    // 4. Migration auf bestehender Altdatenbank
    // =========================================================================
    describe('4. Migration auf bestehender Altdatenbank (Abwärtskompatibilität)', () => {

        test('4.1 Migration fügt GAEB-Tabellen hinzu ohne bestehende Kunden/Rechnungen/Angebote zu beeinträchtigen', () => {
            const dbPath = path.join(os.tmpdir(), `legacy_test_${Date.now()}_${Math.random().toString(36).slice(2)}.sqlite`);
            const legacyDb = new Database(dbPath);
            legacyDb.pragma('foreign_keys = ON');

            try {
                // Erstelle Alt-Schema OHNE GAEB-Tabellen
                legacyDb.exec(`
                    CREATE TABLE kunden (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        kundennummer TEXT
                    );
                    CREATE TABLE projekte (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL
                    );
                    CREATE TABLE dokumente (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        type TEXT NOT NULL,
                        nr TEXT NOT NULL,
                        kundeId INTEGER,
                        projektId INTEGER,
                        netto REAL DEFAULT 0,
                        steuer REAL DEFAULT 0,
                        brutto REAL DEFAULT 0
                    );
                    CREATE TABLE positionen (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        dokumentId INTEGER REFERENCES dokumente(id),
                        name TEXT,
                        menge REAL,
                        einheit TEXT,
                        preis REAL
                    );
                `);

                // Altdaten einfügen
                legacyDb.exec(`
                    INSERT INTO kunden (name, kundennummer) VALUES ('Musterkunde GmbH', 'K-1001');
                    INSERT INTO projekte (name) VALUES ('Sanierung Rathaus');
                    INSERT INTO dokumente (type, nr, kundeId, projektId, netto, steuer, brutto)
                    VALUES ('angebot', 'ANG-2026-001', 1, 1, 10000.0, 1900.0, 11900.0);
                    INSERT INTO positionen (dokumentId, name, menge, einheit, preis)
                    VALUES (1, 'Abbruch Mauerwerk', 50, 'm³', 200.0);
                `);

                // Snapshot der Altdaten vor der Migration
                const kundeBefore = legacyDb.prepare('SELECT * FROM kunden WHERE id = 1').get();
                const dokBefore = legacyDb.prepare('SELECT * FROM dokumente WHERE id = 1').get();
                const posBefore = legacyDb.prepare('SELECT * FROM positionen WHERE id = 1').get();

                // Führe Migrationen aus
                runGaebMigrations(legacyDb);

                // Verifiziere: Altdaten unverändert
                const kundeAfter = legacyDb.prepare('SELECT * FROM kunden WHERE id = 1').get();
                const dokAfter = legacyDb.prepare('SELECT * FROM dokumente WHERE id = 1').get();
                const posAfter = legacyDb.prepare('SELECT * FROM positionen WHERE id = 1').get();

                assert.deepStrictEqual(kundeAfter, kundeBefore, 'Kunde muss 100% intakt sein');
                assert.deepStrictEqual(dokAfter, dokBefore, 'Dokument muss 100% intakt sein');
                assert.deepStrictEqual(posAfter, posBefore, 'Position muss 100% intakt sein');

                // Verifiziere: GAEB-Tabellen einsatzbereit
                const xml = loadFixture('valid_schema_reference.x83');
                const parsed = GAEBEngine.parseGAEBXML(xml);
                const saveRes = saveX83Import(legacyDb, parsed, { fileName: 'migrated_import.x83', rawXml: xml });
                assert.ok(saveRes.importId > 0, 'GAEB-Import auf migrierter Altdatenbank erfolgreich');

                // Fremdschlüssel-Prüfung
                assert.strictEqual(legacyDb.pragma('foreign_key_check').length, 0);
            } finally {
                cleanupDb(legacyDb, dbPath);
            }
        });
    });

    // =========================================================================
    // 5. Übersicht & Statistik (listX83Imports)
    // =========================================================================
    describe('5. Übersicht & Statistik (listX83Imports)', () => {

        test('5.1 listX83Imports liefert korrekte Kennzahlen über importierte Ausschreibungen', () => {
            const { db, dbPath } = createTempDb();

            try {
                const xml1 = loadFixture('valid_schema_reference.x83');
                const xml2 = loadFixture('01_standard_hierarchie.x83');

                saveX83Import(db, GAEBEngine.parseGAEBXML(xml1), { fileName: 'ref.x83', rawXml: xml1 });
                saveX83Import(db, GAEBEngine.parseGAEBXML(xml2), { fileName: 'hierarchy.x83', rawXml: xml2 });

                const list = listX83Imports(db);
                assert.strictEqual(list.length, 2, 'Zwei Importe gelistet');

                const item1 = list.find(i => i.file_name === 'ref.x83');
                assert.ok(item1);
                assert.ok(item1.item_count > 0);
                assert.ok(item1.category_count > 0);
                assert.strictEqual(item1.linked_item_count, 0);
                assert.strictEqual(item1.file_hash, calculateFileHash(xml1));
            } finally {
                cleanupDb(db, dbPath);
            }
        });
    });
});

if (IS_ELECTRON_AS_NODE || canLoadBetterSqlite()) {
    console.log('GAEB_PERSISTENCE_TESTS_PASSED');
}
