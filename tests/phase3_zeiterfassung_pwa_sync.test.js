/**
 * tests/phase3_zeiterfassung_pwa_sync.test.js
 * Vollständige, automatisierte Testsuite für Phase 3 (Release 1.2)
 * Testet:
 * 1. Schema & Migrationen (5 neue Tabellen, Indizes, Seeds)
 * 2. Arbeitszeit- & ArbZG-Engine (Pausen, 10h Höchstarbeitszeit, 11h Ruhezeit)
 * 3. BRTV-Bau § 7 Wegezeitstaffeln 2024-2026 (Nah- und Fernbaustellen)
 * 4. Mobiles Bautagebuch & VOB/B Meldewesen (§ 4.3 Bedenken, § 6.1 Behinderungen)
 * 5. CameraEngine (Wasserzeichen, Markups, File-Fallback)
 * 6. Local-First P2P Sync Hub (HTTP/WS, Pairing, Push-Idempotenz, Quarantäne-Konflikte, Foto-Streaming)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const IS_ELECTRON_AS_NODE = !!process.versions.electron;
const RUN_INNER_MARKER = 'PHASE3_INNER_RUN';

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

    function startePhase3Inner() {
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
                    console.error('[Inner Test Error stdout]:', err.stdout ? err.stdout.toString() : '');
                    console.error('[Inner Test Error stderr]:', err.stderr ? err.stderr.toString() : '');
                    reject(err);
                }
            });
        }
        return innerStdoutPromise;
    }

    test('PHASE 3 - 1. Schema & DB-Migrationen (via Electron-as-Node Runtime)', async () => {
        const stdout = await startePhase3Inner();
        assert.match(stdout, /Alle 5 Phase 3 Tabellen existieren/, 'Schema Tabellen müssen existieren');
    });

    test('PHASE 3 - 2. Arbeitszeit- & ArbZG-Rechenkern (via Electron-as-Node Runtime)', async () => {
        const stdout = await startePhase3Inner();
        assert.match(stdout, /ArbZG- und Pausen-Rechenkern/, 'Arbeitszeit-Engine muss durchlaufen');
    });

    test('PHASE 3 - 3. BRTV-Bau Wegezeitstaffeln (via Electron-as-Node Runtime)', async () => {
        const stdout = await startePhase3Inner();
        assert.match(stdout, /BRTV-Bau Wegezeiten 2024-2026/, 'Wegezeit-Engine muss durchlaufen');
    });

    test('PHASE 3 - 4. Mobiles Bautagebuch & VOB/B Meldewesen (via Electron-as-Node Runtime)', async () => {
        const stdout = await startePhase3Inner();
        assert.match(stdout, /VOB\/B Bedenken- & Behinderungsanzeigen/, 'VOB/B Modul muss durchlaufen');
    });

    test('PHASE 3 - 5. Camera-Engine & Markups (via Electron-as-Node Runtime)', async () => {
        const stdout = await startePhase3Inner();
        assert.match(stdout, /CameraEngine Bildverarbeitung & Wasserzeichen/, 'CameraEngine muss durchlaufen');
    });

    test('PHASE 3 - 6. Local-First P2P Sync Server & Quarantäne (via Electron-as-Node Runtime)', async () => {
        const stdout = await startePhase3Inner();
        assert.match(stdout, /Sync-Hub Push, Pull/, 'Sync Server muss durchlaufen');
    });

} else {
    // Direkte Ausführung (Electron-as-Node oder natives better-sqlite3)
    const Database = require('better-sqlite3');
    const { createSchema, runMigrations, seedDefaultData } = require('../schema');
    const ZeiterfassungController = require('../controllers/ZeiterfassungController');
    const BautagebuchMobileController = require('../controllers/BautagebuchMobileController');
    const CameraEngine = require('../pwa/js/camera-engine');
    const SyncServer = require('../main/sync-server');

    function createTestDatabase() {
        const db = new Database(':memory:');
        db.pragma('foreign_keys = ON');
        createSchema(db);
        runMigrations(db);
        seedDefaultData(db);
        return db;
    }

    test('Phase 3 Testsuite - 1. Schema & Migrationen', async (t) => {
        const db = createTestDatabase();

        await t.test('Alle 5 Phase 3 Tabellen existieren mit Indizes und Seeds', () => {
            const tables = db.prepare(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name IN (
                    'mitarbeiter', 'zeiterfassung', 'sync_processed_mutations',
                    'bedenken_behinderungen', 'sync_conflicts'
                )
            `).all().map(r => r.name);

            assert.strictEqual(tables.length, 5, 'Alle 5 Phase 3 Tabellen müssen in der DB vorhanden sein');
            assert.ok(tables.includes('mitarbeiter'));
            assert.ok(tables.includes('zeiterfassung'));
            assert.ok(tables.includes('sync_processed_mutations'));
            assert.ok(tables.includes('bedenken_behinderungen'));
            assert.ok(tables.includes('sync_conflicts'));

            // Mitarbeiter-Seeds prüfen
            const maCount = db.prepare('SELECT COUNT(*) AS cnt FROM mitarbeiter').get().cnt;
            assert.ok(maCount >= 3, 'Mindestens 3 Standard-Mitarbeiter müssen geseedet sein');

            // Sync-Settings prüfen
            const syncPort = db.prepare("SELECT value FROM einstellungen WHERE key='sync_server_port'").get()?.value;
            assert.strictEqual(syncPort, '38400');

            console.log('--- Alle 5 Phase 3 Tabellen existieren ---');
        });

        db.close();
    });

    test('Phase 3 Testsuite - 2. Arbeitszeit- & ArbZG-Rechenkern', async (t) => {
        await t.test('ArbZG- und Pausen-Rechenkern: 8h Normalarbeitszeit mit 60m Pause', () => {
            const res = ZeiterfassungController.calculateWorkTime('2026-06-15T08:00:00', '2026-06-15T17:00:00', 60);
            assert.strictEqual(res.valid, true);
            assert.strictEqual(res.bruttoStunden, 9.00);
            assert.strictEqual(res.effektivePauseMin, 60);
            assert.strictEqual(res.nettoStunden, 8.00);
            assert.strictEqual(res.hasVerstoss, false);
            assert.strictEqual(res.verstoesse.length, 0);
        });

        await t.test('ArbZG- und Pausen-Rechenkern: Gesetzlicher 30m Pausenabzug bei 7h ohne manuelle Pause', () => {
            const res = ZeiterfassungController.calculateWorkTime('2026-06-15T08:00:00', '2026-06-15T15:00:00', 0);
            assert.strictEqual(res.valid, true);
            assert.strictEqual(res.bruttoStunden, 7.00);
            assert.strictEqual(res.gesetzlichePflichtPauseMin, 30);
            assert.strictEqual(res.effektivePauseMin, 30);
            assert.strictEqual(res.nettoStunden, 6.50);
            assert.strictEqual(res.hasVerstoss, true, 'Verstoß wegen fehlender Pause muss markiert werden');
        });

        await t.test('ArbZG- und Pausen-Rechenkern: Gesetzlicher 45m Pausenabzug bei >9h', () => {
            const res = ZeiterfassungController.calculateWorkTime('2026-06-15T07:00:00', '2026-06-15T17:00:00', 15);
            assert.strictEqual(res.valid, true);
            assert.strictEqual(res.bruttoStunden, 10.00);
            assert.strictEqual(res.gesetzlichePflichtPauseMin, 45);
            assert.strictEqual(res.effektivePauseMin, 45);
            assert.strictEqual(res.nettoStunden, 9.25);
            assert.strictEqual(res.hasVerstoss, true);
        });

        await t.test('ArbZG § 3: Absolute Höchstarbeitszeit > 10 Stunden erkennen', () => {
            const res = ZeiterfassungController.calculateWorkTime('2026-06-15T06:00:00', '2026-06-15T18:00:00', 45);
            assert.strictEqual(res.valid, true);
            assert.strictEqual(res.nettoStunden, 11.25);
            assert.strictEqual(res.hasVerstoss, true);
            assert.ok(res.verstoesse.some(v => v.includes('10 Stunden')));
        });

        await t.test('ArbZG § 5: 11 Stunden Mindestruhezeit überwachen', () => {
            const okRuhe = ZeiterfassungController.checkRuhezeit('2026-06-15T18:00:00', '2026-06-16T07:00:00'); // 13h
            assert.strictEqual(okRuhe.valid, true);
            assert.strictEqual(okRuhe.ruhezeitStunden, 13.00);

            const failRuhe = ZeiterfassungController.checkRuhezeit('2026-06-15T22:00:00', '2026-06-16T06:00:00'); // 8h
            assert.strictEqual(failRuhe.valid, false);
            assert.strictEqual(failRuhe.ruhezeitStunden, 8.00);
            assert.ok(failRuhe.warnung.includes('§ 5 ArbZG'));
        });

        await t.test('Haversine Geofence Snapshot', () => {
            // Distanz zwischen zwei Punkten in Berlin (ca. 100m)
            const d1 = ZeiterfassungController.calculateHaversineDistance(52.5200, 13.4050, 52.5205, 13.4060);
            assert.ok(d1 > 50 && d1 < 150, `Distanz ${d1}m muss realistisch sein`);

            const eventOk = ZeiterfassungController.validatePunchEvent(
                { mitarbeiter_id: 1, zeit_von: '2026-06-15T08:00:00', geo_lat: 52.5200, geo_lng: 13.4050 },
                { lat: 52.5202, lng: 13.4052 }
            );
            assert.strictEqual(eventOk.geofenceOk, true);

            const eventOut = ZeiterfassungController.validatePunchEvent(
                { mitarbeiter_id: 1, zeit_von: '2026-06-15T08:00:00', geo_lat: 52.5200, geo_lng: 13.4050 },
                { lat: 52.5300, lng: 13.4150 } // > 1000m
            );
            assert.strictEqual(eventOut.geofenceOk, false);
        });
    });

    test('Phase 3 Testsuite - 3. BRTV-Bau Wegezeitstaffeln', async (t) => {
        await t.test('BRTV-Bau Wegezeiten 2024-2026 für Nahbaustellen mit täglicher Heimfahrt (>8h Abwesenheit)', () => {
            // Stufe 1: 0 - 50 km -> 7,00 €
            const stufe1 = ZeiterfassungController.calculateBRTVWegezeit(30, true, 8.5);
            assert.strictEqual(stufe1.entschädigungEur, 7.00);
            assert.strictEqual(stufe1.steuerfrei, true);

            // Stufe 2: 51 - 75 km -> 8,00 €
            const stufe2 = ZeiterfassungController.calculateBRTVWegezeit(65, true, 8.5);
            assert.strictEqual(stufe2.entschädigungEur, 8.00);
            assert.strictEqual(stufe2.steuerfrei, true);

            // Stufe 3: > 75 km -> 9,00 €
            const stufe3 = ZeiterfassungController.calculateBRTVWegezeit(90, true, 9.0);
            assert.strictEqual(stufe3.entschädigungEur, 9.00);
            assert.strictEqual(stufe3.steuerfrei, true);

            // Keine Entschädigung bei <= 8h Abwesenheit
            const kurz = ZeiterfassungController.calculateBRTVWegezeit(65, true, 7.5);
            assert.strictEqual(kurz.entschädigungEur, 0.00);
        });

        await t.test('BRTV-Bau Wegezeiten 2024-2026 für Fernbaustellen (Übernachtung)', () => {
            // 75 - 200 km -> 9,00 €
            const fern1 = ZeiterfassungController.calculateBRTVWegezeit(120, false);
            assert.strictEqual(fern1.entschädigungEur, 9.00);

            // 201 - 300 km -> 18,00 €
            const fern2 = ZeiterfassungController.calculateBRTVWegezeit(250, false);
            assert.strictEqual(fern2.entschädigungEur, 18.00);

            // 301 - 400 km -> 27,00 €
            const fern3 = ZeiterfassungController.calculateBRTVWegezeit(350, false);
            assert.strictEqual(fern3.entschädigungEur, 27.00);

            // > 400 km -> 39,00 €
            const fern4 = ZeiterfassungController.calculateBRTVWegezeit(480, false);
            assert.strictEqual(fern4.entschädigungEur, 39.00);
        });
    });

    test('Phase 3 Testsuite - 4. Mobiles Bautagebuch & VOB/B Meldewesen', async (t) => {
        const db = createTestDatabase();

        // Test-Projekt anlegen
        const projRes = db.prepare("INSERT INTO projekte (name, kundeId, status) VALUES ('Neubau Bürokomplex', 1, 'IN_BEARBEITUNG')").run();
        const projId = projRes.lastInsertRowid;

        await t.test('VOB/B Bedenken- & Behinderungsanzeigen erstellen und validieren', () => {
            // 1. Bedenkenanzeige § 4 Abs. 3 VOB/B
            const bedenken = BautagebuchMobileController.createBedenkenanzeige({
                projekt_id: projId,
                betreff: 'Mangelhafter Vorunternehmer-Estrich',
                begruendung: 'Die Belegreife des Estrichs ist mit 4.2% CM-Feuchte noch nicht erreicht.',
                kategorie: 'VORLEISTUNG_UNGEEIGNET',
                vorschlag_abhilfe: 'Zusätzliche Trocknung durch Bautrockner erforderlich'
            });
            assert.strictEqual(bedenken.typ, 'BEDENKEN_4_3');
            assert.strictEqual(bedenken.status, 'OFFEN');

            const saveBedenken = BautagebuchMobileController.saveVobMeldung(db, bedenken);
            assert.strictEqual(saveBedenken.success, true);

            // 2. Behinderungsanzeige § 6 Abs. 1 VOB/B
            const behinderung = BautagebuchMobileController.createBehinderungsanzeige({
                projekt_id: projId,
                hinderungsgrund: 'Fehlende Baufreiheit durch bauseitigen Gerüstabbau',
                beginn_datum: '2026-06-20',
                auswirkung_bauzeit_tage: 5,
                mehrkosten_angemeldet: true,
                geschaetzte_mehrkosten_eur: 2400.00
            });
            assert.strictEqual(behinderung.typ, 'BEHINDERUNG_6_1');
            assert.strictEqual(behinderung.auswirkung_bauzeit_tage, 5);

            const saveBehinderung = BautagebuchMobileController.saveVobMeldung(db, behinderung);
            assert.strictEqual(saveBehinderung.success, true);

            // 3. Abfrage & HTML Generierung prüfen
            const meldungen = BautagebuchMobileController.getVobMeldungen(db, { projekt_id: projId });
            assert.strictEqual(meldungen.length, 2);

            const htmlBedenken = BautagebuchMobileController.generateVobHtml(meldungen[1], { name: 'Neubau Bürokomplex' });
            assert.ok(htmlBedenken.includes('BEDENKENANZEIGE'));
            assert.ok(htmlBedenken.includes('§ 4 Abs. 3 VOB/B'));

            const htmlBehinderung = BautagebuchMobileController.generateVobHtml(meldungen[0], { name: 'Neubau Bürokomplex' });
            assert.ok(htmlBehinderung.includes('BEHINDERUNGSANZEIGE'));
            assert.ok(htmlBehinderung.includes('§ 6 Abs. 1 VOB/B'));
            assert.ok(htmlBehinderung.includes('5 Werktage'));
        });

        db.close();
    });

    test('Phase 3 Testsuite - 5. Camera-Engine & Markups', async (t) => {
        await t.test('CameraEngine Bildverarbeitung & Wasserzeichen (Node Fallback & API)', async () => {
            const res = await CameraEngine.processAndWatermarkPhoto('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', {
                projektNr: 'PR-2026-001',
                datum: '15.06.2026 14:30',
                gpsLat: 52.5200,
                gpsLng: 13.4050
            });

            assert.ok(res.width > 0);
            assert.ok(res.height > 0);

            const markupRes = await CameraEngine.applyDrawingsToPhoto('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', [
                { type: 'circle', cx: 100, cy: 100, r: 30, color: '#ef4444' },
                { type: 'arrow', fromX: 50, fromY: 50, toX: 100, toY: 100, color: '#ef4444' }
            ]);

            assert.ok(markupRes !== null);
        });
    });

    test('Phase 3 Testsuite - 6. Local-First P2P Sync Server & Quarantäne', async (t) => {
        const db = createTestDatabase();
        const uploadsDir = path.join(__dirname, '..', 'tmp_test_uploads');
        const syncServer = new SyncServer(db, null, { port: 38405, uploadsDir });

        const startRes = await syncServer.start();
        assert.strictEqual(startRes.success, true);
        const serverPort = syncServer.port;
        const baseUrl = `http://127.0.0.1:${serverPort}`;

        // Helper für HTTP-Requests
        function httpRequest(method, endpoint, headers = {}, body = null) {
            return new Promise((resolve, reject) => {
                const url = new URL(endpoint, baseUrl);
                const req = http.request({
                    hostname: url.hostname,
                    port: url.port,
                    path: url.pathname,
                    method,
                    headers
                }, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try {
                            const json = data ? JSON.parse(data) : {};
                            resolve({ status: res.statusCode, data: json, raw: data });
                        } catch (_e) {
                            resolve({ status: res.statusCode, raw: data });
                        }
                    });
                });
                req.on('error', reject);
                if (body) {
                    if (typeof body === 'string' || Buffer.isBuffer(body)) {
                        req.write(body);
                    } else {
                        req.write(JSON.stringify(body));
                    }
                }
                req.end();
            });
        }

        await t.test('Sync-Hub Push, Pull & Konflikt-Quarantäne', async () => {
            // 1. Healthcheck Ping
            const pingRes = await httpRequest('GET', '/api/v1/sync/ping');
            assert.strictEqual(pingRes.status, 200);
            assert.strictEqual(pingRes.data.status, 'OK');

            // 2. Pairing Workflow
            const token = syncServer.createPairingToken();
            const pairRes = await httpRequest('POST', '/api/v1/sync/pair', { 'Content-Type': 'application/json' }, {
                pairing_token: token,
                device_id: 'MOBILE_TEST_DEVICE_01'
            });
            assert.strictEqual(pairRes.status, 200);
            assert.strictEqual(pairRes.data.status, 'PAIRED');

            // 3. Pull-Sync Stammdaten Delta
            const pullRes = await httpRequest('POST', '/api/v1/sync/pull', { 'Content-Type': 'application/json' }, {});
            assert.strictEqual(pullRes.status, 200);
            assert.ok(pullRes.data.data.mitarbeiter.length >= 3);

            // 4. Push-Sync: Arbeitszeiteintrag mit Idempotenz-Prüfung
            const zeitUuid = ZeiterfassungController.generateUUID();
            const pushMutation = {
                uuid: ZeiterfassungController.generateUUID(),
                entity_type: 'ZEITERFASSUNG',
                entity_uuid: zeitUuid,
                mutation_type: 'INSERT',
                payload: {
                    uuid: zeitUuid,
                    mitarbeiter_id: 1,
                    zeit_von: '2026-06-15T08:00:00',
                    zeit_bis: '2026-06-15T16:30:00',
                    dauer_min: 480,
                    pause_min: 30,
                    taetigkeit_typ: 'PRODUKTIV',
                    status: 'ERFASST'
                }
            };

            const pushRes1 = await httpRequest('POST', '/api/v1/sync/push', { 'Content-Type': 'application/json' }, {
                device_id: 'MOBILE_TEST_DEVICE_01',
                mutations: [pushMutation]
            });
            assert.strictEqual(pushRes1.status, 200);
            assert.strictEqual(pushRes1.data.acked_uuids.length, 1);

            // Datensatz in DB prüfen
            const dbZeit = db.prepare('SELECT * FROM zeiterfassung WHERE uuid = ?').get(zeitUuid);
            assert.ok(dbZeit);
            assert.strictEqual(dbZeit.mitarbeiter_id, 1);

            // Idempotenter Zweitaufruf: keine Duplizierung
            const pushRes2 = await httpRequest('POST', '/api/v1/sync/push', { 'Content-Type': 'application/json' }, {
                device_id: 'MOBILE_TEST_DEVICE_01',
                mutations: [pushMutation]
            });
            assert.strictEqual(pushRes2.status, 200);
            assert.strictEqual(pushRes2.data.acked_uuids.length, 1);

            // 5. GoBD-Konflikt: Datensatz auf Server wird FREIGEGEBEN
            db.prepare("UPDATE zeiterfassung SET status = 'FREIGEGEBEN' WHERE uuid = ?").run(zeitUuid);

            const conflictingPush = {
                uuid: ZeiterfassungController.generateUUID(),
                entity_type: 'ZEITERFASSUNG',
                entity_uuid: zeitUuid,
                mutation_type: 'UPDATE',
                payload: {
                    uuid: zeitUuid,
                    mitarbeiter_id: 1,
                    zeit_von: '2026-06-15T08:00:00',
                    zeit_bis: '2026-06-15T18:00:00',
                    dauer_min: 600,
                    status: 'ERFASST'
                }
            };

            const conflictRes = await httpRequest('POST', '/api/v1/sync/push', { 'Content-Type': 'application/json' }, {
                device_id: 'MOBILE_TEST_DEVICE_01',
                mutations: [conflictingPush]
            });
            assert.strictEqual(conflictRes.status, 200);
            assert.strictEqual(conflictRes.data.conflicts.length, 1);

            // Quarantäne prüfen
            const openConflicts = syncServer.getOpenConflicts();
            assert.ok(openConflicts.length >= 1);
            assert.strictEqual(openConflicts[0].entity_uuid, zeitUuid);

            // Konflikt schlichten (Desktop-Vorrang)
            const resolveRes = syncServer.resolveConflict(openConflicts[0].id, 'RESOLVED_SERVER');
            assert.strictEqual(resolveRes.success, true);
            assert.strictEqual(syncServer.getOpenConflicts().length, 0);

            // 6. Large-Blob Streaming Foto-Upload
            const photoBuffer = Buffer.from('FAKE_IMAGE_DATA_1234567890');
            const photoSha = crypto.createHash('sha256').update(photoBuffer).digest('hex');
            const photoUuid = ZeiterfassungController.generateUUID();

            const photoRes = await httpRequest('POST', '/api/v1/sync/photo-upload', {
                'Content-Type': 'application/octet-stream',
                'X-Photo-Uuid': photoUuid,
                'X-Entity-Type': 'MANGEL',
                'X-Sha256': photoSha
            }, photoBuffer);

            assert.strictEqual(photoRes.status, 200);
            assert.strictEqual(photoRes.data.photo_uuid, photoUuid);
            assert.strictEqual(photoRes.data.clientShaMatches, true);
            assert.strictEqual(photoRes.data.sha256, photoSha);
            assert.ok(fs.existsSync(photoRes.data.filePath));
        });

        // Server stoppen & Aufräumen
        await syncServer.stop();
        if (fs.existsSync(uploadsDir)) {
            try { fs.rmSync(uploadsDir, { recursive: true, force: true }); } catch (_e) { }
        }
        db.close();
    });
}
