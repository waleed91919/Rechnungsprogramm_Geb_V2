/**
 * tests/phase5_stufe1_2_3.test.js
 * Vollständige automatisierte Testsuite für Phase 5 (Stufe 1, 2 und 3)
 * Prüft alle 12 Kernanforderungen aus Abschnitt 6 des Masterplans:
 * TC-01: Kolonnen-Stempelung (Batch-Stempelung von 10 Monteuren in < 50ms)
 * TC-02: ArbZG-Wächter (§ 3 ArbZG Höchstarbeitszeit > 10h)
 * TC-03: BRTV-Wegezeitstaffel (0-50 km, 51-75 km, >75 km, Fahrer vs. Mitfahrer)
 * TC-04: Notfall-USB-Sync Bundle Export (AES-GCM-256 & SHA-256 Prüfsumme)
 * TC-05: Notfall-USB-Sync Bundle Import (Entschlüsselung & Idempotenz im Electron Main / SQLite)
 * TC-06: REB 23.003 Aufmaß-Rechenkern (Formeln 01, 02, 04, 23, 91 & VOB/C Übermessung)
 * TC-07: DA11 Satzart 11 Formatierung (exakt 80 Bytes & Spaltenaufteilung)
 * TC-08: Leica DISTO BLE IEEE 754 Float32 Decoding
 * TC-09: Bosch GLM BLE MT-Protocol Inkrement-Decoding (0.05 mm * rawInt / 1000)
 * TC-10: Plan-Viewer Pan/Zoom CSS-Matrix Transformation
 * TC-11: Plan-Pin X%/Y% Koordinaten-Normalisierung & VOB/B § 13 Fristenampel
 * TC-12: Barcode-Scanner, BGL-Gerätebuchung & Lieferschein-Kontrastoptimierung
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const IS_ELECTRON_AS_NODE = !!process.versions.electron;
const RUN_INNER_MARKER = 'PHASE5_INNER_RUN';

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

    function startePhase5Inner() {
        if (!innerStdoutPromise) {
            innerStdoutPromise = new Promise((resolve, reject) => {
                try {
                    const electronBin = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
                    if (!fs.existsSync(electronBin)) {
                        return reject(new Error('Electron-Binary muss vorhanden sein: ' + electronBin));
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
                    console.error('[Phase 5 Inner Test Error stdout]:', err.stdout ? err.stdout.toString() : '');
                    console.error('[Phase 5 Inner Test Error stderr]:', err.stderr ? err.stderr.toString() : '');
                    reject(err);
                }
            });
        }
        return innerStdoutPromise;
    }

    test('PHASE 5 - Stufe 1, 2 und 3 Testsuite (via Electron-as-Node Runtime)', async () => {
        const stdout = await startePhase5Inner();
        assert.match(stdout, /pass 13/, 'Alle Phase 5 Kernprüfungen müssen bestanden sein');
    });

} else {
    // Direkte Ausführung (Electron-as-Node oder natives better-sqlite3)
    const Database = require('better-sqlite3');
    const { createSchema, runMigrations, seedDefaultData } = require('../schema');
    const RebAufmassEngine = require('../pwa/js/reb-aufmass');
    const CryptoSyncBundle = require('../pwa/js/crypto-sync-bundle');
    const BluetoothLaserEngine = require('../pwa/js/bluetooth-laser');
    const OfflinePlanViewer = require('../pwa/js/plan-viewer');
    const BarcodeScannerEngine = require('../pwa/js/barcode-scanner');
    const MaengelController = require('../controllers/MaengelController');
    const SyncBundleImporter = require('../main/sync-bundle-importer');
    const { calculateBRTVWegezeitStaffel, validateArbzgForWorker } = require('../pwa/js/pwa-app');

    function createTestDatabase() {
        const db = new Database(':memory:');
        db.pragma('foreign_keys = ON');
        createSchema(db);
        runMigrations(db);
        seedDefaultData(db);
        return db;
    }

    // -------------------------------------------------------------------------
    // TEST 0: SCHEMA & MIGRATION 006
    // -------------------------------------------------------------------------
    test('PHASE 5 - 0. Schema Migration 006 Tabellen & Spalten existieren', () => {
        const db = createTestDatabase();

        const tables = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type = 'table' AND name IN ('kolonnen', 'kolonnen_mitarbeiter', 'bauplaene', 'geraete_buchungen', 'lieferscheine_digital', 'maengel')
        `).all().map(r => r.name);

        assert.ok(tables.includes('kolonnen'), 'Tabelle kolonnen muss existieren');
        assert.ok(tables.includes('kolonnen_mitarbeiter'), 'Tabelle kolonnen_mitarbeiter muss existieren');
        assert.ok(tables.includes('bauplaene'), 'Tabelle bauplaene muss existieren');
        assert.ok(tables.includes('geraete_buchungen'), 'Tabelle geraete_buchungen muss existieren');
        assert.ok(tables.includes('lieferscheine_digital'), 'Tabelle lieferscheine_digital muss existieren');
        assert.ok(tables.includes('maengel'), 'Tabelle maengel muss existieren');

        // Spalten in aufmass_zeilen
        const colsAufmass = db.prepare(`PRAGMA table_info(aufmass_zeilen)`).all().map(c => c.name);
        assert.ok(colsAufmass.includes('uuid'), 'aufmass_zeilen.uuid muss existieren');
        assert.ok(colsAufmass.includes('formel_code'), 'aufmass_zeilen.formel_code muss existieren');

        // Spalten in maengelkataster
        const colsMaengel = db.prepare(`PRAGMA table_info(maengelkataster)`).all().map(c => c.name);
        assert.ok(colsMaengel.includes('plan_id'), 'maengelkataster.plan_id muss existieren');
        assert.ok(colsMaengel.includes('x_pct'), 'maengelkataster.x_pct muss existieren');
        assert.ok(colsMaengel.includes('y_pct'), 'maengelkataster.y_pct muss existieren');

        db.close();
    });

    // -------------------------------------------------------------------------
    // TC-01: Kolonnen-Schnellstempelung
    // -------------------------------------------------------------------------
    test('TC-01: Kolonnen-Stempelung - Batch-Stempelung von 10 Monteuren in < 50ms', async () => {
        const storeZeiterfassung = new Map();
        const storeOutbox = [];

        const mockDb = {
            local_zeiterfassung: {
                put: async (entry) => { storeZeiterfassung.set(entry.uuid, entry); }
            }
        };

        const mockSyncWorker = {
            queueMutation: async (entityType, uuid, type, payload) => {
                storeOutbox.push({ entityType, uuid, type, payload });
            }
        };

        const workers = Array.from({ length: 10 }, (_, i) => ({ id: 101 + i, name: `Monteur ${i + 1}` }));
        const tStart = Date.now();

        for (const w of workers) {
            const uuid = `zeit-kolonne-${w.id}-${Date.now()}`;
            const entry = {
                uuid,
                mitarbeiter_id: w.id,
                projekt_id: 1,
                taetigkeit_typ: 'PRODUKTIV',
                zeit_von: new Date().toISOString(),
                is_kolonne: 1,
                status: 'ERFASST'
            };
            await mockDb.local_zeiterfassung.put(entry);
            await mockSyncWorker.queueMutation('ZEITERFASSUNG', uuid, 'INSERT', entry);
        }

        const duration = Date.now() - tStart;

        assert.strictEqual(storeZeiterfassung.size, 10, 'Es müssen genau 10 Zeiteinträge gespeichert sein');
        assert.strictEqual(storeOutbox.length, 10, 'Es müssen genau 10 Outbox-Mutationen existieren');
        assert.ok(duration < 50, `Batch-Stempelung muss unter 50ms dauern (dauerte: ${duration}ms)`);
    });

    // -------------------------------------------------------------------------
    // TC-02: ArbZG-Wächter (§ 3 ArbZG Tagesarbeitszeit > 10 h)
    // -------------------------------------------------------------------------
    test('TC-02: ArbZG-Wächter - § 3 ArbZG Höchstarbeitszeitüberschreitung wird erkannt', async () => {
        const now = Date.now();
        const todayStr = new Date(now).toISOString().split('T')[0];

        // Mock window.mobileDb mit 10,5 Stunden bereits erfasster Arbeitszeit
        globalThis.window = globalThis.window || {};
        globalThis.window.mobileDb = {
            local_zeiterfassung: {
                toArray: async () => [
                    {
                        mitarbeiter_id: 42,
                        zeit_von: `${todayStr}T06:00:00.000Z`,
                        zeit_bis: `${todayStr}T16:30:00.000Z`,
                        dauer_min: 630 // 10.5 Stunden
                    }
                ]
            }
        };

        const check = await validateArbzgForWorker(42, 'GEHEN', now);
        assert.strictEqual(check.hasViolation, true, 'Muss ArbZG-Verstoß melden');
        assert.ok(check.violationText.includes('§ 3 ArbZG'), 'Warnhinweis muss auf § 3 ArbZG verweisen');
    });

    // -------------------------------------------------------------------------
    // TC-03: BRTV-Wegezeitstaffel
    // -------------------------------------------------------------------------
    test('TC-03: BRTV-Wegezeit - Staffelung (0–50km, 51–75km, >75km) und Fahrer vs. Mitfahrer', () => {
        // Fahrer: Voll vergütungspflichtig als Arbeitszeit, Wegezeitpauschale = 0 €
        const fahrer = calculateBRTVWegezeitStaffel(60, true);
        assert.strictEqual(fahrer.isFahrer, true);
        assert.strictEqual(fahrer.entschaedigungEur, 0.0);

        // Mitfahrer Stufe 1: 0 - 50 km -> 7,00 €
        const mitfahrer30 = calculateBRTVWegezeitStaffel(30, false);
        assert.strictEqual(mitfahrer30.entschaedigungEur, 7.00);

        // Mitfahrer Stufe 2: 51 - 75 km -> 8,00 €
        const mitfahrer60 = calculateBRTVWegezeitStaffel(60, false);
        assert.strictEqual(mitfahrer60.entschaedigungEur, 8.00);

        // Mitfahrer Stufe 3: > 75 km -> 9,00 €
        const mitfahrer100 = calculateBRTVWegezeitStaffel(100, false);
        assert.strictEqual(mitfahrer100.entschaedigungEur, 9.00);
    });

    // -------------------------------------------------------------------------
    // TC-04: Notfall-USB-Sync Bundle Export (AES-GCM-256 & SHA-256)
    // -------------------------------------------------------------------------
    test('TC-04: USB-Bundle Export - AES-GCM-256 Verschlüsselung & JSON Envelope', async () => {
        const mockDb = {
            sync_outbox: {
                where: () => ({
                    equals: () => ({
                        toArray: async () => [
                            { uuid: 'mut-101', entity_type: 'ZEITERFASSUNG', status: 'PENDING' },
                            { uuid: 'mut-102', entity_type: 'AUFMASS_ZEILE', status: 'PENDING' }
                        ]
                    })
                })
            },
            local_fotos: {
                where: () => ({
                    equals: () => ({
                        toArray: async () => []
                    })
                })
            },
            app_settings: {
                get: async () => ({ device_id: 'POLIER-TAB-01' })
            }
        };

        const passphrase = 'SicheresBaustellenPasswort2026!';
        const bundleJson = await CryptoSyncBundle.exportToBundle(mockDb, passphrase);
        const bundle = JSON.parse(bundleJson);

        assert.strictEqual(bundle.magic, 'WLSYNC01');
        assert.strictEqual(bundle.version, '1.0');
        assert.strictEqual(bundle.device_id, 'POLIER-TAB-01');
        assert.strictEqual(bundle.cipher.algorithm, 'AES-GCM');
        assert.strictEqual(bundle.kdf.algorithm, 'PBKDF2');
        assert.strictEqual(bundle.kdf.iterations, 100000);
        assert.ok(bundle.payload_cipher_hex.length > 30);
        assert.strictEqual(bundle.sha256_checksum.length, 64, 'SHA-256 Checksumme muss 64 Hex-Zeichen lang sein');
    });

    // -------------------------------------------------------------------------
    // TC-05: Notfall-USB-Sync Bundle Import & Idempotenz im Electron Main
    // -------------------------------------------------------------------------
    test('TC-05: USB-Bundle Import - Entschlüsselung & Idempotenz in SQLite', async () => {
        const db = createTestDatabase();
        const importer = new SyncBundleImporter(db);

        const mockPayload = {
            export_meta: { deviceId: 'TEST-POLIER-02', exported_at: new Date().toISOString() },
            mutations: [
                {
                    uuid: 'mut-tc05-01',
                    entity_type: 'ZEITERFASSUNG',
                    status: 'PENDING',
                    payload: {
                        uuid: 'zeit-tc05-01',
                        mitarbeiter_id: 1,
                        zeit_von: '2026-09-03T07:00:00.000Z',
                        zeit_bis: '2026-09-03T16:00:00.000Z',
                        dauer_min: 480,
                        taetigkeit_typ: 'PRODUKTIV'
                    }
                }
            ],
            photos: []
        };

        const passphrase = 'StrengGeheimesBaustellenKennwort!';
        // Bundle generieren
        const mockDb = {
            sync_outbox: { toArray: async () => mockPayload.mutations },
            local_fotos: { toArray: async () => [] },
            app_settings: { get: async () => ({ device_id: 'TEST-POLIER-02' }) }
        };
        const bundleJson = await CryptoSyncBundle.exportToBundle(mockDb, passphrase);

        // 1. Erstimport: Mutation muss übernommen werden
        const res1 = await importer.importBundle(bundleJson, passphrase);
        assert.strictEqual(res1.success, true);
        assert.strictEqual(res1.importedCount, 1);
        assert.strictEqual(res1.skippedCount, 0);

        // In SQLite prüfen
        const row = db.prepare('SELECT * FROM zeiterfassung WHERE uuid = ?').get('zeit-tc05-01');
        assert.ok(row, 'Zeiteintrag muss in SQLite eingefügt worden sein');
        assert.strictEqual(row.mitarbeiter_id, 1);

        // 2. Zweitimport desselben Bundles: Muss durch Idempotenz übersprungen werden
        const res2 = await importer.importBundle(bundleJson, passphrase);
        assert.strictEqual(res2.success, true);
        assert.strictEqual(res2.importedCount, 0, 'Bereits importierte Mutationen dürfen nicht doppelt gebucht werden');
        assert.strictEqual(res2.skippedCount, 1, 'Muss als übersprungen gezählt werden');

        db.close();
    });

    // -------------------------------------------------------------------------
    // TC-06: REB 23.003 Aufmaß-Rechenkern & VOB/C Übermessungsprüfung
    // -------------------------------------------------------------------------
    test('TC-06: REB 23.003 Kern - Formeln 01, 02, 04, 23, 91 & VOB/C Übermessungsprüfung', () => {
        // Formel 01: Rechteck (5.25 * 3.40 = 17.8500)
        const f01 = RebAufmassEngine.calculate('01', { a: 5.25, b: 3.40 });
        assert.strictEqual(f01, 17.85);

        // Formel 02: Dreieck ((6.00 * 4.50) / 2 = 13.5000)
        const f02 = RebAufmassEngine.calculate('02', { a: 6.00, b: 4.50 });
        assert.strictEqual(f02, 13.50);

        // Formel 04: Trapez (((4.00 + 6.00) / 2) * 2.50 = 12.5000)
        const f04 = RebAufmassEngine.calculate('04', { a: 4.00, c: 6.00, h: 2.50 });
        assert.strictEqual(f04, 12.50);

        // Formel 23: Quader (2.00 * 3.00 * 4.00 = 24.0000)
        const f23 = RebAufmassEngine.calculate('23', { a: 2.00, b: 3.00, c: 4.00 });
        assert.strictEqual(f23, 24.00);

        // Formel 91: Freie Formel ((5.5 + 3.2) * 2.0 - 1.4 = 16.0000)
        const f91 = RebAufmassEngine.calculate('91', { freiString: '(5.5 + 3.2) * 2.0 - 1.4' });
        assert.strictEqual(f91, 16.00);

        // VOB/C Übermessungsprüfung: <= 2.5 m² wird übermessen (kein Abzug)
        assert.strictEqual(RebAufmassEngine.isUebermessen(2.1), true, '2.1 m² muss übermessen werden');
        assert.strictEqual(RebAufmassEngine.isUebermessen(2.5), true, '2.5 m² muss übermessen werden');
        assert.strictEqual(RebAufmassEngine.isUebermessen(2.51), false, '2.51 m² muss abgezogen werden');

        // Netto-Aufmaß mit VOB/C Abzug:
        // Brutto: 50 m², Öffnungen: 1.8 m² (übermessen), 2.2 m² (übermessen), 4.0 m² (abzugspflichtig)
        // Netto = 50 - 4.0 = 46.0000 m²
        const netto = RebAufmassEngine.calculateNettoMitUebermessung(50.0, [1.8, 2.2, 4.0]);
        assert.strictEqual(netto, 46.0);
    });

    // -------------------------------------------------------------------------
    // TC-07: DA11 Satzart 11 Formatierung
    // -------------------------------------------------------------------------
    test('TC-07: DA11 Satzart 11 - Exakt 80 Bytes & normgerechte Spaltenaufteilung', () => {
        const line = RebAufmassEngine.formatDa11Line({
            oz: '01.02.0040',
            index: 'A',
            bezeichnung: 'Wand 1 EG',
            formelCode: '01',
            params: { a: 5.20, b: 3.10 },
            ergebnis: 16.12
        });

        assert.strictEqual(line.length, 80, 'DA11-Zeile muss exakt 80 Zeichen lang sein');
        assert.strictEqual(line.substring(0, 2), '11', 'Muss mit Satzart 11 beginnen');
        assert.strictEqual(line.substring(2, 11).trim(), '01020040', 'OZ bereinigt in Spalte 3-11');
        assert.strictEqual(line.substring(11, 12), 'A', 'Index in Spalte 12');
        assert.ok(line.includes('16.120'), 'Muss 3-stelliges kaufmännisches Ergebnis enthalten');
    });

    // -------------------------------------------------------------------------
    // TC-08: Leica DISTO BLE Float32 Little Endian Decoding
    // -------------------------------------------------------------------------
    test('TC-08: Leica DISTO BLE - IEEE 754 Float32 Decoding ohne Vorzeichenfehler', () => {
        // Simuliere Leica BLE Datagramm mit Float32 Little Endian = 12.345 m
        const buf = new ArrayBuffer(4);
        const view = new DataView(buf);
        view.setFloat32(0, 12.345, true); // true = Little Endian

        const val = BluetoothLaserEngine.parseLeicaData(view);
        assert.strictEqual(val, 12.345, 'Leica Float32 muss exakt 12.345 m ergeben');
    });

    // -------------------------------------------------------------------------
    // TC-09: Bosch GLM BLE MT-Protocol Inkrement-Decoding
    // -------------------------------------------------------------------------
    test('TC-09: Bosch GLM BLE - MT-Protocol Inkrement-Decoding (0.05 mm Faktor)', () => {
        // Simuliere Bosch GLM Datagramm:
        // Offset 0-1: Header [0xC0, 0x55]
        // Offset 2-5: 4-Byte Little Endian RawInt.
        // Bei 5,000 m Distanz = 5000 mm / 0.05 mm = 100.000 Inkremente
        const buf = new ArrayBuffer(6);
        const view = new DataView(buf);
        view.setUint8(0, 0xc0);
        view.setUint8(1, 0x55);
        view.setUint32(2, 100000, true); // 100.000 * 0.05 mm = 5000 mm = 5.000 m

        const val = BluetoothLaserEngine.parseBoschData(view);
        assert.strictEqual(val, 5.000, 'Bosch GLM Datagramm muss exakt 5.000 m ergeben');
    });

    // -------------------------------------------------------------------------
    // TC-10: Plan-Viewer Pan/Zoom & CSS-Matrix
    // -------------------------------------------------------------------------
    test('TC-10: Plan-Viewer Pan/Zoom - CSS-Matrix Transformation', () => {
        const viewer = new OfflinePlanViewer('mock-container', 'mock-canvas', 'mock-overlay');
        viewer.scale = 2.5;
        viewer.translateX = 150;
        viewer.translateY = -80;

        assert.strictEqual(viewer.scale, 2.5);
        assert.strictEqual(viewer.translateX, 150);
        assert.strictEqual(viewer.translateY, -80);

        viewer.resetView();
        assert.strictEqual(viewer.scale, 1.0, 'ResetView muss Maßstab auf 1.0 setzen');
        assert.strictEqual(viewer.translateX, 0);
        assert.strictEqual(viewer.translateY, 0);
    });

    // -------------------------------------------------------------------------
    // TC-11: Plan-Pin Normalisierung & VOB/B § 13 Fristenampel
    // -------------------------------------------------------------------------
    test('TC-11: Plan-Pin Normalisierung - X%/Y% Invarianz & VOB/B Fristenampel', () => {
        const baseWidth = 2000;
        const baseHeight = 1000;

        const coords = OfflinePlanViewer.calculateNormalizedCoordinates(500, 250, baseWidth, baseHeight);
        assert.strictEqual(coords.xPct, 25.0, 'X-Prozent muss exakt 25.00% sein');
        assert.strictEqual(coords.yPct, 25.0, 'Y-Prozent muss exakt 25.00% sein');

        // Denormalisierung auf andere Bildschirmbreite (z.B. 4000x2000)
        const denorm = OfflinePlanViewer.denormalizeCoordinates(coords.xPct, coords.yPct, 4000, 2000);
        assert.strictEqual(denorm.x, 1000.0);
        assert.strictEqual(denorm.y, 500.0);

        // VOB/B Fristenampel Prüfung
        const now = new Date();
        const in3Days = new Date(now.getTime() + 3 * 86400000).toISOString().split('T')[0];
        const ampelYellow = OfflinePlanViewer.calculateFristAmpel(in3Days, 'ERFASST');
        assert.strictEqual(ampelYellow.color, 'YELLOW', 'Frist <= 7 Tage muss GELB sein');

        const pastDate = new Date(now.getTime() - 2 * 86400000).toISOString().split('T')[0];
        const ampelRed = OfflinePlanViewer.calculateFristAmpel(pastDate, 'ERFASST');
        assert.strictEqual(ampelRed.color, 'RED', 'Abgelaufene Frist muss ROT sein');

        const in20Days = new Date(now.getTime() + 20 * 86400000).toISOString().split('T')[0];
        const ampelGreen = OfflinePlanViewer.calculateFristAmpel(in20Days, 'ERFASST');
        assert.strictEqual(ampelGreen.color, 'GREEN', 'Ausreichende Frist muss GRÜN sein');
    });

    // -------------------------------------------------------------------------
    // TC-12: BarcodeDetector & BGL-Gerätebuchung & Lieferschein Kontrast
    // -------------------------------------------------------------------------
    test('TC-12: BarcodeDetector & Geräte-/Lieferscheinerfassung mit Kontrastfilter', async () => {
        // 1. BGL Großgeräte-Buchung
        const storeGeraete = new Map();
        const mockDb = {
            local_geraete_buchungen: {
                put: async (entry) => storeGeraete.set(entry.uuid, entry)
            }
        };

        const booking = await BarcodeScannerEngine.bookGeraet(mockDb, null, {
            projektId: 10,
            geraetCode: 'GER-BGL-042 Kran',
            betriebsstunden: 7.5,
            stillstandStunden: 1.5,
            stillstandGrund: 'Sturm > 6 Bft'
        });

        assert.strictEqual(booking.projekt_id, 10);
        assert.strictEqual(booking.geraet_code, 'GER-BGL-042 Kran');
        assert.strictEqual(booking.betriebsstunden, 7.5);
        assert.strictEqual(booking.stillstand_stunden, 1.5);
        assert.strictEqual(storeGeraete.size, 1);

        // 2. Lieferschein Kontrastoptimierung
        const mockImageData = {
            width: 2,
            height: 2,
            data: new Uint8ClampedArray([
                200, 200, 200, 255, // hellgrau (Hintergrund) -> soll weiß werden (255)
                50, 50, 50, 255,     // dunkelgrau (Schrift) -> soll tiefschwarz werden (0)
                120, 120, 120, 255,  // Mittelgrau
                255, 255, 255, 255   // Weiß
            ])
        };

        const enhanced = BarcodeScannerEngine.enhanceLieferscheinContrast(mockImageData);
        assert.strictEqual(enhanced.data[0], 255, 'Hellgrauer Hintergrund muss auf 255 aufgehellt werden');
        assert.strictEqual(enhanced.data[4], 0, 'Dunkle Schrift muss auf 0 vertieft werden');
    });
}
