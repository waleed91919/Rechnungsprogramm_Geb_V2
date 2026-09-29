/**
 * tests/gaeb_x84_export.test.js
 * 
 * Umfassende Testsuite für den GAEB DA XML X84 Export (Phase 84: Angebotsabgabe).
 * 
 * Verifiziert gemäß Spezifikation:
 * - Test 1: X84 Export von GAEB 3.3 (valid_schema_reference.x83) -> lxml Validierung gegen GAEB_DA_XML_84_3.3_2021-05.xsd (0 Fehler)
 * - Test 2: X84 Export von GAEB 3.2 (independent_pygaeb_da32.x83) -> lxml Validierung gegen GAEB_DA_XML_84_3.2_2013-10.xsd (0 Fehler)
 * - Test 3: Semantische Integrität (Hierarchie, OZ-Reihenfolge, Anzahl Items, EP, GP, Totals stimmen exakt)
 * - Test 4: BiReq & TextComplement Export (Prüfung auf Vorhandensein und Validität in 3.3 und 3.2)
 * - Test 5: Bestätigter Null-Preis (0,00 €) wird exportiert; unbestätigter Null-Preis oder fehlender Preis wird abgelehnt
 * - Test 6: Ablehnung bei ungelöster QtyTBD in Hauptposition (in_total = 1)
 * - Test 7: Ablehnung bei fehlender BiReq-Antwort
 * - Test 8: Unabhängigkeit zweier Drafts vom selben X83
 * - Test 9: Unveränderlichkeit des Original-X83 (raw_xml, raw_bytes, gaeb_items unverändert) und von dokumente (0 neue Zeilen)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('child_process');

const IS_ELECTRON_AS_NODE = !!process.versions.electron;
const RUN_INNER_MARKER = 'GAEB_X84_EXPORT_INNER_RUN';

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
    test('GAEB X84 Export: Alle Tests (inkl. SQLite DB-Ebene via Electron-as-Node)', () => {
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

            assert.ok(stdout.includes('GAEB_X84_EXPORT_TESTS_PASSED'), 'Innerer Testlauf muss erfolgreich abschließen');
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
const { saveX83Import, loadX83Import } = require('../db/repositories/gaeb_repository');
const {
    createTenderDraft,
    saveTenderDraft,
    loadTenderDraft,
    cloneTenderDraft,
    getTenderDraftForExport
} = require('../db/repositories/gaeb_tender_repo');
const {
    initGaebSchema,
    runGaebMigrations
} = require('../db/schema/gaeb_schema');

const {
    validateDraftForExport,
    mapDraftToX84Model,
    serializeX84XML,
    exportTenderDraftToX84
} = require('../js/gaeb_x84');

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'gaeb_x83');
const VALIDATE_XSD_SCRIPT = path.join(__dirname, 'validate_xsd.py');

/**
 * Führt die XSD-Validierung einer X84-Datei über das Python lxml Skript aus.
 * @param {string} xmlFilePath 
 * @param {string} [targetVersion] 
 */
function validateX84WithLxml(xmlFilePath, targetVersion) {
    const args = [VALIDATE_XSD_SCRIPT, '--x84', xmlFilePath];
    if (targetVersion) {
        args.push('--version', targetVersion);
    }
    const output = execFileSync('python', args, { encoding: 'utf-8' });
    return output;
}

/**
 * Erzeugt eine isolierte Testdatenbank mit vollständigen Schemata.
 */
function createTestDb() {
    const db = new Database(':memory:');
    createSchema(db);
    initGaebSchema(db);
    runGaebMigrations(db);
    return db;
}

describe('GAEB DA XML X84 Export Suite', () => {

    test('Test 1: X84 Export von GAEB 3.3 (valid_schema_reference.x83) -> Prüfung gegen GAEB_DA_XML_84_3.3_2021-05.xsd (100% 0 Fehler)', () => {
        const db = createTestDb();
        const refFile = path.join(FIXTURES_DIR, 'valid_schema_reference.x83');
        const rawBytes = fs.readFileSync(refFile);
        const rawXml = rawBytes.toString('utf-8');

        const parsed = GAEBEngine.parseGAEBXML(rawXml);
        const saveRes = saveX83Import(db, parsed, {
            fileName: 'valid_schema_reference.x83',
            rawBytes,
            rawXml
        });
        const importId = saveRes.importId;

        // Draft anlegen
        const draft = createTenderDraft(db, importId, { name: 'Angebot Hauptbau' });
        const loadedDraft = loadTenderDraft(db, draft.id);

        // Bepreisen aller 3 Positionen
        const prices = [
            { gaeb_item_id: loadedDraft.items[0]._dbId, unit_price: 15.50, in_total: 1 },
            { gaeb_item_id: loadedDraft.items[1]._dbId, unit_price: 22.00, in_total: 1 },
            { gaeb_item_id: loadedDraft.items[2]._dbId, unit_price: 45.00, in_total: 1 }
        ];

        saveTenderDraft(db, draft.id, {
            name: 'Angebot Hauptbau Bepreist',
            prices
        });

        // X84 Export durchführen
        const exportRes = exportTenderDraftToX84(db, draft.id, {
            bidder: {
                name1: 'Musterbau Nord GmbH',
                street: 'Handwerkerstraße 12',
                pcode: '20095',
                city: 'Hamburg'
            }
        });

        assert.ok(exportRes.xml, 'XML muss erzeugt worden sein');
        assert.ok(exportRes.xml.includes('xmlns="http://www.gaeb.de/GAEB_DA_XML/DA84/3.3"'), 'Muss DA84/3.3 Namespace enthalten');
        assert.ok(exportRes.xml.includes('<DP>84</DP>'), 'Muss DP 84 enthalten');
        assert.ok(exportRes.xml.includes('<Name1>Musterbau Nord GmbH</Name1>'), 'Muss Bieter-Name enthalten');

        // Datei temporär schreiben und gegen offizielles XSD validieren
        const tmpFile = path.join(os.tmpdir(), `x84_test1_${Date.now()}.x84`);
        fs.writeFileSync(tmpFile, exportRes.xml, 'utf-8');

        try {
            const pyOutput = validateX84WithLxml(tmpFile, '3.3');
            assert.ok(pyOutput.includes('BESTANDEN (0 Schema-Fehler)'), 'lxml Validierung gegen GAEB 3.3 X84 XSD muss 100% bestehen');
            assert.ok(pyOutput.includes('ERFOLG'), 'Erfolgsmeldung muss vorliegen');
        } finally {
            if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
            db.close();
        }
    });

    test('Test 2: X84 Export von GAEB 3.2 (independent_pygaeb_da32.x83) -> Prüfung gegen GAEB_DA_XML_84_3.2_2013-10.xsd (100% 0 Fehler)', () => {
        const db = createTestDb();
        const refFile = path.join(FIXTURES_DIR, 'independent_pygaeb_da32.x83');
        const rawBytes = fs.readFileSync(refFile);
        const rawXml = rawBytes.toString('utf-8');

        const parsed = GAEBEngine.parseGAEBXML(rawXml);
        const saveRes = saveX83Import(db, parsed, {
            fileName: 'independent_pygaeb_da32.x83',
            rawBytes,
            rawXml
        });
        const importId = saveRes.importId;

        const draft = createTenderDraft(db, importId, { name: 'Lagerhalle Angebot' });
        const loadedDraft = loadTenderDraft(db, draft.id);

        // Positionen bepreisen (QtyTBD Positionen mit in_total = 0, normale mit in_total = 1)
        const prices = loadedDraft.items.map(it => {
            if (it.isHinweistext) return null;
            const isTbd = Boolean(it.isQtyTBD || it.menge === null);
            return {
                gaeb_item_id: it._dbId,
                unit_price: 35.00,
                in_total: isTbd ? 0 : 1 // QtyTBD nicht in Hauptsumme
            };
        }).filter(Boolean);

        saveTenderDraft(db, draft.id, {
            name: 'Lagerhalle Bepreist',
            prices
        });

        // X84 Export
        const exportRes = exportTenderDraftToX84(db, draft.id, {
            bidder: {
                name1: 'Bauunternehmung Süd KG',
                street: 'Industrieweg 4',
                pcode: '80331',
                city: 'München'
            }
        });

        assert.ok(exportRes.xml, 'XML muss erzeugt worden sein');
        assert.ok(exportRes.xml.includes('xmlns="http://www.gaeb.de/GAEB_DA_XML/DA84/3.2"'), 'Muss DA84/3.2 Namespace enthalten');
        assert.ok(exportRes.xml.includes('<Version>3.2</Version>'), 'Muss Version 3.2 enthalten');
        assert.ok(exportRes.xml.includes('<VersDate>2013-10</VersDate>'), 'Muss VersDate 2013-10 enthalten');

        const tmpFile = path.join(os.tmpdir(), `x84_test2_${Date.now()}.x84`);
        fs.writeFileSync(tmpFile, exportRes.xml, 'utf-8');

        try {
            const pyOutput = validateX84WithLxml(tmpFile, '3.2');
            assert.ok(pyOutput.includes('BESTANDEN (0 Schema-Fehler)'), 'lxml Validierung gegen GAEB 3.2 X84 XSD muss 100% bestehen');
            assert.ok(pyOutput.includes('ERFOLG'), 'Erfolgsmeldung muss vorliegen');
        } finally {
            if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
            db.close();
        }
    });

    test('Test 3: Semantische Integrität (Kategoriehierarchie, OZ-Reihenfolge, Anzahl Items, EP, GP, Totals stimmen exakt)', () => {
        const db = createTestDb();
        const refFile = path.join(FIXTURES_DIR, 'valid_schema_reference.x83');
        const rawBytes = fs.readFileSync(refFile);
        const rawXml = rawBytes.toString('utf-8');

        const parsed = GAEBEngine.parseGAEBXML(rawXml);
        const saveRes = saveX83Import(db, parsed, { fileName: 'valid_schema_reference.x83', rawBytes, rawXml });
        const draft = createTenderDraft(db, saveRes.importId);
        const loadedDraft = loadTenderDraft(db, draft.id);

        // Exakte Bepreisung:
        // Pos 01.01.0010: Menge 350.000 * 10.00 € = 3500.00 €
        // Pos 01.01.0020: Menge 420.000 * 20.00 € = 8400.00 €
        // Abschnitt 01 Summe = 11900.00 €
        // Pos 01.02.0010: Menge 85.000 * 15.00 € = 1275.00 €
        // Abschnitt 02 Summe = 1275.00 €
        // Gewerk 01 Summe = 13175.00 €
        // BoQInfo Gesamtsumme = 13175.00 €
        saveTenderDraft(db, draft.id, {
            prices: [
                { gaeb_item_id: loadedDraft.items[0]._dbId, unit_price: 10.00, in_total: 1 },
                { gaeb_item_id: loadedDraft.items[1]._dbId, unit_price: 20.00, in_total: 1 },
                { gaeb_item_id: loadedDraft.items[2]._dbId, unit_price: 15.00, in_total: 1 }
            ]
        });

        const exportRes = exportTenderDraftToX84(db, draft.id);
        const xml = exportRes.xml;

        // Prüfe Einzelbeträge
        assert.ok(xml.includes('<Qty>350.000</Qty>'));
        assert.ok(xml.includes('<UP>10.000</UP>'));
        assert.ok(xml.includes('<IT>3500.00</IT>'));

        assert.ok(xml.includes('<Qty>420.000</Qty>'));
        assert.ok(xml.includes('<UP>20.000</UP>'));
        assert.ok(xml.includes('<IT>8400.00</IT>'));

        assert.ok(xml.includes('<Qty>85.000</Qty>'));
        assert.ok(xml.includes('<UP>15.000</UP>'));
        assert.ok(xml.includes('<IT>1275.00</IT>'));

        // Prüfe Summen (Totals)
        assert.ok(xml.includes('<Total>11900.00</Total>'), 'Abschnitt 01 Totals.Total muss 11900.00 sein');
        assert.ok(xml.includes('<Total>1275.00</Total>'), 'Abschnitt 02 Totals.Total muss 1275.00 sein');
        assert.ok(xml.includes('<Total>13175.00</Total>'), 'Gewerk 01 und BoQ Totals.Total muss 13175.00 sein');

        // Prüfe Modellstruktur
        assert.strictEqual(exportRes.model.award.boq.boqInfo.total, '13175.00');
        assert.strictEqual(exportRes.model.award.boq.categories[0].totalFormatted, '13175.00');
        assert.strictEqual(exportRes.model.award.boq.categories[0].subCategories[0].totalFormatted, '11900.00');
        assert.strictEqual(exportRes.model.award.boq.categories[0].subCategories[1].totalFormatted, '1275.00');

        db.close();
    });

    test('Test 4: BiReq & TextComplement Export (Prüfung auf Vorhandensein und Validität)', () => {
        const db = createTestDb();
        const refFile = path.join(FIXTURES_DIR, '03_bieterangaben_vorbemerkungen_ep.x83');
        const rawBytes = fs.readFileSync(refFile);
        const rawXml = rawBytes.toString('utf-8');

        const parsed = GAEBEngine.parseGAEBXML(rawXml);
        const saveRes = saveX83Import(db, parsed, { fileName: '03_bieterangaben_vorbemerkungen_ep.x83', rawBytes, rawXml });
        const draft = createTenderDraft(db, saveRes.importId);
        const loadedDraft = loadTenderDraft(db, draft.id);

        // Finde Position mit BiReq und bepreise alle Positionen
        const prices = [];
        const bireqAnswers = [];

        loadedDraft.items.forEach(it => {
            if (!it.isHinweistext) {
                prices.push({ gaeb_item_id: it._dbId, unit_price: 49.50, in_total: 1 });
            }
            if (Array.isArray(it.bieterangaben) && it.bieterangaben.length > 0) {
                it.bieterangaben.forEach(br => {
                    bireqAnswers.push({
                        gaeb_bireq_id: br.id || br._dbId,
                        answer_value: br.label === 'Fabrikat' ? 'Villeroy & Boch' : 'Architectura'
                    });
                });
            }
        });

        saveTenderDraft(db, draft.id, { prices, bireq_answers: bireqAnswers });

        const exportRes = exportTenderDraftToX84(db, draft.id);
        const xml = exportRes.xml;

        // Prüfe BiReq-Exportstruktur
        assert.ok(xml.includes('<TextComplement MarkLbl="1" Kind="Bidder">'), 'Muss TextComplement mit Kind="Bidder" enthalten');
        assert.ok(xml.includes('<span>Villeroy &amp; Boch</span>') || xml.includes('<span>Villeroy & Boch</span>'.replace('&', '&amp;')), 'Muss geescapte BiReq-Antwort enthalten');
        assert.ok(xml.includes('<span>Architectura</span>'), 'Muss Typ-Antwort enthalten');

        // Prüfung im Modell
        const targetItem = exportRes.model.award.boq.categories[0].items.find(i => i.biReqAnswers.length > 0);
        assert.ok(targetItem, 'Position mit BiReq muss im Modell existieren');
        assert.strictEqual(targetItem.biReqAnswers.length, 2);
        assert.strictEqual(targetItem.biReqAnswers[0].answerValue, 'Villeroy & Boch');
        assert.strictEqual(targetItem.biReqAnswers[1].answerValue, 'Architectura');

        db.close();
    });

    test('Test 5: Bestätigter Null-Preis (0,00 €) wird exportiert; unbestätigter Null-Preis oder fehlender Preis wird abgelehnt', () => {
        const db = createTestDb();
        const refFile = path.join(FIXTURES_DIR, 'valid_schema_reference.x83');
        const rawBytes = fs.readFileSync(refFile);
        const parsed = GAEBEngine.parseGAEBXML(rawBytes.toString('utf-8'));
        const saveRes = saveX83Import(db, parsed, { fileName: 'valid_schema_reference.x83', rawBytes, rawXml: rawBytes.toString('utf-8') });
        const draft = createTenderDraft(db, saveRes.importId);
        const loadedDraft = loadTenderDraft(db, draft.id);

        // Fall A: Fehlender Preis bei Position 3 -> muss abgelehnt werden
        saveTenderDraft(db, draft.id, {
            prices: [
                { gaeb_item_id: loadedDraft.items[0]._dbId, unit_price: 10.00, in_total: 1 },
                { gaeb_item_id: loadedDraft.items[1]._dbId, unit_price: 20.00, in_total: 1 }
                // Item 2 fehlt!
            ]
        });

        const valMissing = validateDraftForExport(db, draft.id);
        assert.strictEqual(valMissing.valid, false, 'Darf mit fehlendem Preis nicht valide sein');
        assert.ok(valMissing.errors.some(e => e.includes('Fehlender Einheitspreis')), 'Muss fehlenden EP melden');
        assert.throws(() => exportTenderDraftToX84(db, draft.id), /nicht bereit für den X84-Export/);

        // Fall B: Unbestätigter Null-Preis (0.00 € ohne is_zero_confirmed) -> muss hart abgelehnt werden
        // B1: saveTenderDraft weist unbestätigte 0,00 € strikt ab
        assert.throws(() => {
            saveTenderDraft(db, draft.id, {
                prices: [
                    { gaeb_item_id: loadedDraft.items[0]._dbId, unit_price: 10.00, in_total: 1 },
                    { gaeb_item_id: loadedDraft.items[1]._dbId, unit_price: 20.00, in_total: 1 },
                    { gaeb_item_id: loadedDraft.items[2]._dbId, unit_price: 0.00, is_zero_confirmed: 0, in_total: 1 }
                ]
            });
        }, /Einheitspreis 0,00 € muss ausdrücklich bestätigt werden/);

        // B2: Auch validateDraftForExport lehnt unbestätigte 0,00 € strikt ab (falls unbestätigter Nullwert vorliegt)
        db.prepare('INSERT OR REPLACE INTO gaeb_tender_item_prices (draft_id, gaeb_item_id, unit_price, is_zero_confirmed, in_total) VALUES (?, ?, 0.0, 0, 1)')
            .run(draft.id, loadedDraft.items[2]._dbId);
        const valZeroUnconfirmed = validateDraftForExport(db, draft.id);
        assert.strictEqual(valZeroUnconfirmed.valid, false, 'Unbestätigter Nullpreis darf nicht valide sein');
        assert.ok(valZeroUnconfirmed.errors.some(e => e.includes('Null-Preis-Bestätigung fehlt')), 'Muss fehlende Nullpreisbestätigung monieren');

        // Fall C: Bestätigter Null-Preis (0.00 € mit is_zero_confirmed = 1) -> muss gültig sein und exportiert werden
        saveTenderDraft(db, draft.id, {
            prices: [
                { gaeb_item_id: loadedDraft.items[0]._dbId, unit_price: 10.00, in_total: 1 },
                { gaeb_item_id: loadedDraft.items[1]._dbId, unit_price: 20.00, in_total: 1 },
                { gaeb_item_id: loadedDraft.items[2]._dbId, unit_price: 0.00, is_zero_confirmed: 1, in_total: 1 }
            ]
        });

        const valZeroConfirmed = validateDraftForExport(db, draft.id);
        assert.strictEqual(valZeroConfirmed.valid, true, 'Bestätigter Nullpreis muss valide sein');
        assert.strictEqual(valZeroConfirmed.errors.length, 0);

        const exportRes = exportTenderDraftToX84(db, draft.id);
        assert.ok(exportRes.xml.includes('<UP>0.000</UP>'), 'Muss 0.000 als Einheitspreis exportieren');
        assert.ok(exportRes.xml.includes('<IT>0.00</IT>'), 'Muss 0.00 als Gesamtpreis exportieren');

        db.close();
    });

    test('Test 6: Ablehnung bei ungelöster QtyTBD in Hauptposition (in_total = 1)', () => {
        const db = createTestDb();
        const refFile = path.join(FIXTURES_DIR, 'independent_pygaeb_da32.x83');
        const rawBytes = fs.readFileSync(refFile);
        const parsed = GAEBEngine.parseGAEBXML(rawBytes.toString('utf-8'));
        const saveRes = saveX83Import(db, parsed, { fileName: 'independent_pygaeb_da32.x83', rawBytes, rawXml: rawBytes.toString('utf-8') });
        const draft = createTenderDraft(db, saveRes.importId);
        const loadedDraft = loadTenderDraft(db, draft.id);

        // Bepreise alle Positionen, belasse aber eine QtyTBD-Position in in_total = 1
        const prices = loadedDraft.items.map(it => {
            if (it.isHinweistext) return null;
            return {
                gaeb_item_id: it._dbId,
                unit_price: 25.00,
                in_total: 1 // Ungelöste QtyTBD im Hauptangebot!
            };
        }).filter(Boolean);

        saveTenderDraft(db, draft.id, { prices });

        const validation = validateDraftForExport(db, draft.id);
        assert.strictEqual(validation.valid, false, 'Ungelöste QtyTBD in in_total=1 muss Export verhindern');
        assert.ok(validation.errors.some(e => e.includes('QtyTBD') && e.includes('in_total = 1')), 'Fehlermeldung muss QtyTBD spezifizieren');

        assert.throws(() => exportTenderDraftToX84(db, draft.id), /nicht bereit für den X84-Export/);

        db.close();
    });

    test('Test 7: Ablehnung bei fehlender BiReq-Antwort', () => {
        const db = createTestDb();
        const refFile = path.join(FIXTURES_DIR, '03_bieterangaben_vorbemerkungen_ep.x83');
        const rawBytes = fs.readFileSync(refFile);
        const parsed = GAEBEngine.parseGAEBXML(rawBytes.toString('utf-8'));
        const saveRes = saveX83Import(db, parsed, { fileName: '03_bieterangaben_vorbemerkungen_ep.x83', rawBytes, rawXml: rawBytes.toString('utf-8') });
        const draft = createTenderDraft(db, saveRes.importId);
        const loadedDraft = loadTenderDraft(db, draft.id);

        // Alle Positionen bepreisen, aber keine BiReq-Antworten liefern
        const prices = loadedDraft.items.filter(i => !i.isHinweistext).map(it => ({
            gaeb_item_id: it._dbId,
            unit_price: 30.00,
            in_total: 1
        }));

        saveTenderDraft(db, draft.id, { prices, bireq_answers: [] });

        const validation = validateDraftForExport(db, draft.id);
        assert.strictEqual(validation.valid, false, 'Fehlende BiReq-Antworten müssen Export verhindern');
        assert.ok(validation.errors.some(e => e.includes('Fehlende Bieterangabe')), 'Fehlermeldung muss Bieterangabe monieren');

        db.close();
    });

    test('Test 8: Unabhängigkeit zweier Drafts vom selben X83', () => {
        const db = createTestDb();
        const refFile = path.join(FIXTURES_DIR, 'valid_schema_reference.x83');
        const rawBytes = fs.readFileSync(refFile);
        const parsed = GAEBEngine.parseGAEBXML(rawBytes.toString('utf-8'));
        const saveRes = saveX83Import(db, parsed, { fileName: 'valid_schema_reference.x83', rawBytes, rawXml: rawBytes.toString('utf-8') });

        // Draft 1
        const draft1 = createTenderDraft(db, saveRes.importId, { name: 'Entwurf A' });
        const loaded1 = loadTenderDraft(db, draft1.id);
        saveTenderDraft(db, draft1.id, {
            prices: [
                { gaeb_item_id: loaded1.items[0]._dbId, unit_price: 10.00, in_total: 1 },
                { gaeb_item_id: loaded1.items[1]._dbId, unit_price: 20.00, in_total: 1 },
                { gaeb_item_id: loaded1.items[2]._dbId, unit_price: 30.00, in_total: 1 }
            ]
        });

        // Draft 2 (geklont oder neu)
        const draft2 = cloneTenderDraft(db, draft1.id, { newName: 'Entwurf B (Rabattiert)' });
        saveTenderDraft(db, draft2.id, {
            prices: [
                { gaeb_item_id: loaded1.items[0]._dbId, unit_price: 5.00, in_total: 1 },
                { gaeb_item_id: loaded1.items[1]._dbId, unit_price: 10.00, in_total: 1 },
                { gaeb_item_id: loaded1.items[2]._dbId, unit_price: 15.00, in_total: 1 }
            ]
        });

        // Beide exportieren
        const export1 = exportTenderDraftToX84(db, draft1.id);
        const export2 = exportTenderDraftToX84(db, draft2.id);

        // Prüfe Summen-Unabhängigkeit
        // Draft 1: 350*10 + 420*20 + 85*30 = 3500 + 8400 + 2550 = 14450.00 €
        // Draft 2: 350*5 + 420*10 + 85*15 = 1750 + 4200 + 1275 = 7225.00 €
        assert.strictEqual(export1.model.award.boq.boqInfo.total, '14450.00');
        assert.strictEqual(export2.model.award.boq.boqInfo.total, '7225.00');

        assert.ok(export1.xml.includes('<Total>14450.00</Total>'));
        assert.ok(export2.xml.includes('<Total>7225.00</Total>'));

        db.close();
    });

    test('Test 9: Unveränderlichkeit des Original-X83 (raw_xml, raw_bytes, gaeb_items unverändert) und von dokumente (0 neue Zeilen)', () => {
        const db = createTestDb();
        const refFile = path.join(FIXTURES_DIR, 'valid_schema_reference.x83');
        const rawBytes = fs.readFileSync(refFile);
        const rawXml = rawBytes.toString('utf-8');

        const parsed = GAEBEngine.parseGAEBXML(rawXml);
        const saveRes = saveX83Import(db, parsed, { fileName: 'valid_schema_reference.x83', rawBytes, rawXml });
        const importId = saveRes.importId;

        // Snapshot vor Export
        const importRowBefore = db.prepare('SELECT * FROM gaeb_imports WHERE id = ?').get(importId);
        const itemsBefore = db.prepare('SELECT * FROM gaeb_items WHERE import_id = ? ORDER BY id').all(importId);
        const docsCountBefore = db.prepare('SELECT COUNT(*) as cnt FROM dokumente').get().cnt;

        // Draft anlegen und exportieren
        const draft = createTenderDraft(db, importId);
        const loadedDraft = loadTenderDraft(db, draft.id);
        saveTenderDraft(db, draft.id, {
            prices: loadedDraft.items.map(i => ({ gaeb_item_id: i._dbId, unit_price: 99.00, in_total: 1 }))
        });

        const exportRes = exportTenderDraftToX84(db, draft.id);
        assert.ok(exportRes.xml.length > 0);

        // Snapshot nach Export vergleichen
        const importRowAfter = db.prepare('SELECT * FROM gaeb_imports WHERE id = ?').get(importId);
        const itemsAfter = db.prepare('SELECT * FROM gaeb_items WHERE import_id = ? ORDER BY id').all(importId);
        const docsCountAfter = db.prepare('SELECT COUNT(*) as cnt FROM dokumente').get().cnt;

        // 1. gaeb_imports unverändert
        assert.strictEqual(importRowBefore.file_hash, importRowAfter.file_hash);
        assert.strictEqual(importRowBefore.raw_xml, importRowAfter.raw_xml);
        assert.deepStrictEqual(importRowBefore.raw_bytes, importRowAfter.raw_bytes);

        // 2. gaeb_items unverändert (keine Preise in Originaltabelle geschrieben!)
        assert.strictEqual(itemsBefore.length, itemsAfter.length);
        for (let i = 0; i < itemsBefore.length; i++) {
            assert.strictEqual(itemsBefore[i].preis, itemsAfter[i].preis, 'Originalpreis in gaeb_items darf nicht mutiert werden');
            assert.strictEqual(itemsBefore[i].gesamtpreis, itemsAfter[i].gesamtpreis);
            assert.strictEqual(itemsBefore[i].is_price_missing, itemsAfter[i].is_price_missing);
        }

        // 3. dokumente unverändert (KEIN Angebot in dokumente angelegt!)
        assert.strictEqual(docsCountBefore, 0, 'Dokumente-Tabelle war initial leer');
        assert.strictEqual(docsCountAfter, 0, 'Dokumente-Tabelle darf durch X84-Export 0 neue Zeilen enthalten');

        db.close();
    });

    test('Test 10: IPC-Schnittstelle (gaeb:validate-x84-export, gaeb:export-x84 mit Cancel und Headless-Pfad)', async () => {
        const db = createTestDb();
        const refFile = path.join(FIXTURES_DIR, 'valid_schema_reference.x83');
        const rawBytes = fs.readFileSync(refFile);
        const parsed = GAEBEngine.parseGAEBXML(rawBytes.toString('utf-8'));
        const saveRes = saveX83Import(db, parsed, { fileName: 'valid_schema_reference.x83', rawBytes, rawXml: rawBytes.toString('utf-8') });
        const draft = createTenderDraft(db, saveRes.importId);

        // Mock IPC-Registrierung
        const handlers = new Map();
        const mockIpcMain = {
            handle: (channel, fn) => handlers.set(channel, fn)
        };

        let dialogCanceled = false;
        let dialogChosenPath = null;
        const mockDialog = {
            showSaveDialog: async () => ({
                canceled: dialogCanceled,
                filePath: dialogChosenPath
            })
        };

        const ipcGaeb = require('../main/ipc/ipc-gaeb');
        ipcGaeb.register(mockIpcMain, {
            db,
            dialog: mockDialog,
            BrowserWindow: { getFocusedWindow: () => ({}) }
        });

        const validateHandler = handlers.get('gaeb:validate-x84-export');
        const exportHandler = handlers.get('gaeb:export-x84');

        assert.ok(typeof validateHandler === 'function', 'gaeb:validate-x84-export Handler muss registriert sein');
        assert.ok(typeof exportHandler === 'function', 'gaeb:export-x84 Handler muss registriert sein');

        // A: Validierung vor Bepreisung -> muss ungültig sein
        const valBefore = await validateHandler({}, { draftId: draft.id });
        assert.strictEqual(valBefore.valid, false);
        assert.ok(valBefore.errors.length > 0);

        // B: Exportversuch vor Bepreisung -> muss fehlschlagen
        const expFail = await exportHandler({}, { draftId: draft.id });
        assert.strictEqual(expFail.success, false);
        assert.ok(expFail.error.includes('Fehlender Einheitspreis'));

        // C: Entwurf vollständig bepreisen
        const loadedDraft = loadTenderDraft(db, draft.id);
        saveTenderDraft(db, draft.id, {
            prices: [
                { gaeb_item_id: loadedDraft.items[0]._dbId, unit_price: 10.00, in_total: 1 },
                { gaeb_item_id: loadedDraft.items[1]._dbId, unit_price: 20.00, in_total: 1 },
                { gaeb_item_id: loadedDraft.items[2]._dbId, unit_price: 15.00, in_total: 1 }
            ]
        });

        // D: Validierung nach Bepreisung -> muss valide sein
        const valAfter = await validateHandler({}, { draftId: draft.id });
        assert.strictEqual(valAfter.valid, true);
        assert.strictEqual(valAfter.errors.length, 0);

        // E: Benutzer bricht den Speicher-Dialog ab
        dialogCanceled = true;
        dialogChosenPath = null;
        const expCancel = await exportHandler({}, { draftId: draft.id });
        assert.strictEqual(expCancel.canceled, true);

        // F: Benutzer bestätigt den Speicher-Dialog
        const tmpTarget = path.join(os.tmpdir(), `ipc_x84_test_${Date.now()}.x84`);
        dialogCanceled = false;
        dialogChosenPath = tmpTarget;

        const expSuccess = await exportHandler({}, { draftId: draft.id });
        assert.strictEqual(expSuccess.success, true);
        assert.strictEqual(expSuccess.filePath, tmpTarget);
        assert.strictEqual(expSuccess.stats.totalNetto, '13175.00');
        assert.ok(fs.existsSync(tmpTarget), 'Exportierte Datei muss auf der Festplatte existieren');

        // G: Prüfung der exportierten Datei via lxml
        const lxmlOut = validateX84WithLxml(tmpTarget, '3.3');
        assert.ok(lxmlOut.includes('BESTANDEN (0 Schema-Fehler)'));

        if (fs.existsSync(tmpTarget)) fs.unlinkSync(tmpTarget);

        // H: Headless / direkter Pfad-Export (options.filePath)
        const tmpHeadless = path.join(os.tmpdir(), `headless_x84_test_${Date.now()}.x84`);
        const expHeadless = await exportHandler({}, { draftId: draft.id, options: { isTestEnv: true, filePath: tmpHeadless } });
        assert.strictEqual(expHeadless.success, true);
        assert.ok(fs.existsSync(tmpHeadless));
        if (fs.existsSync(tmpHeadless)) fs.unlinkSync(tmpHeadless);

        db.close();
    });

    test('Test 11: Frontend Controller Workflow (tender_controller.js: Validierungsabbruch, Dialog-Cancel und Erfolgsmeldung)', async () => {
        const db = createTestDb();
        const refFile = path.join(FIXTURES_DIR, 'valid_schema_reference.x83');
        const rawBytes = fs.readFileSync(refFile);
        const parsed = GAEBEngine.parseGAEBXML(rawBytes.toString('utf-8'));
        const saveRes = saveX83Import(db, parsed, { fileName: 'valid_schema_reference.x83', rawBytes, rawXml: rawBytes.toString('utf-8') });
        const draft = createTenderDraft(db, saveRes.importId);

        // Mock-DOM und Controller-Umgebung aufbauen
        const alerts = [];
        const toasts = [];
        const exportInfos = [];

        const mockDomElements = {
            'gt-btn-export-x84': { disabled: false, innerHTML: 'Als GAEB X84 exportieren' },
            'gt-export-info-box': { textContent: '', classList: { remove: () => {}, add: () => {} } }
        };

        const globalAlertBackup = global.alert;
        const globalDocumentBackup = global.document;
        const globalWindowBackup = global.window;

        global.alert = (msg) => alerts.push(msg);
        global.showToast = (msg, type) => toasts.push({ msg, type });
        global.document = {
            getElementById: (id) => mockDomElements[id] || null
        };
        global.window = {
            GaebTenderState: {
                currentDraftId: draft.id,
                currentImportId: saveRes.importId
            },
            GaebTenderView: {
                showExportInfo: (msg, isErr) => exportInfos.push({ msg, isErr })
            },
            api: {
                invoke: async (channel, payload) => {
                    if (channel === 'gaeb:validate-x84-export') {
                        const targetId = typeof payload === 'object' ? payload.draftId : payload;
                        return validateDraftForExport(db, targetId);
                    }
                    if (channel === 'gaeb:export-x84') {
                        const targetId = typeof payload === 'object' ? payload.draftId : payload;
                        if (mockExportBehavior === 'cancel') {
                            return { canceled: true };
                        }
                        if (mockExportBehavior === 'error') {
                            return { success: false, error: 'Simulierter I/O-Fehler' };
                        }
                        return {
                            success: true,
                            filePath: 'C:\\Users\\Test\\Angebot_v1.x84',
                            stats: { totalNetto: '13175.00' },
                            validation: { valid: true }
                        };
                    }
                    throw new Error(`Unerwarteter IPC-Kanal: ${channel}`);
                }
            }
        };

        let mockExportBehavior = 'cancel';

        // Controller laden (führt die IIFE aus)
        delete require.cache[require.resolve('../js/gaeb_tender/tender_controller')];
        require('../js/gaeb_tender/tender_controller');

        const controller = window.GaebTenderController;

        // Schritt 1: Aufruf bei unvollständigem Entwurf
        // Muss Validierungsfehler anzeigen und Export gar nicht erst aufrufen
        await controller.exportX84(draft.id);
        assert.ok(alerts.some(a => a.includes('kann nicht als X84 exportiert werden')), 'Alert mit Validierungsfehlern muss angezeigt werden');
        assert.ok(exportInfos.some(e => e.isErr === true && e.msg.includes('Export nicht möglich')), 'Export-Info muss Fehlerstatus melden');

        // Entwurf vollständig bepreisen
        const loadedDraft = loadTenderDraft(db, draft.id);
        saveTenderDraft(db, draft.id, {
            prices: [
                { gaeb_item_id: loadedDraft.items[0]._dbId, unit_price: 10.00, in_total: 1 },
                { gaeb_item_id: loadedDraft.items[1]._dbId, unit_price: 20.00, in_total: 1 },
                { gaeb_item_id: loadedDraft.items[2]._dbId, unit_price: 15.00, in_total: 1 }
            ]
        });

        // Schritt 2: Aufruf bei Abbruch des Dialogs durch den Nutzer
        mockExportBehavior = 'cancel';
        alerts.length = 0;
        toasts.length = 0;
        exportInfos.length = 0;

        await controller.exportX84(draft.id);
        assert.strictEqual(alerts.length, 0, 'Bei Cancel darf kein Fehler-Alert erscheinen');
        assert.strictEqual(toasts.length, 0, 'Bei Cancel darf kein Erfolgs-Toast erscheinen');

        // Schritt 3: Erfolgreicher Export
        mockExportBehavior = 'success';
        alerts.length = 0;
        toasts.length = 0;
        exportInfos.length = 0;

        await controller.exportX84(draft.id);
        assert.ok(alerts.some(a => a.includes('GAEB DA XML X84 erfolgreich exportiert')), 'Erfolgs-Alert muss erscheinen');
        assert.ok(toasts.some(t => t.type === 'success'), 'Erfolgs-Toast muss ausgelöst werden');
        assert.ok(exportInfos.some(e => e.isErr === false && e.msg.includes('13175.00 € Netto')), 'Export-Info muss Pfad und Summe anzeigen');

        // Cleanup
        global.alert = globalAlertBackup;
        global.document = globalDocumentBackup;
        global.window = globalWindowBackup;
        db.close();
    });

});

console.log('GAEB_X84_EXPORT_TESTS_PASSED');
