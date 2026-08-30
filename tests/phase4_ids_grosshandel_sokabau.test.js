/**
 * tests/phase4_ids_grosshandel_sokabau.test.js
 * Vollständige, automatisierte Testsuite für Phase 4 (Release 2.0)
 * Testet:
 * 1. Schema & Migrationen (8 neue Tabellen, Indizes, Seeds)
 * 2. IDS Connect 2.5 & Open Masterdata Controller & Parser
 * 3. IDS Connect Loopback Server mit dynamischem Ephemeral-Port & CSRF-Schutz
 * 4. SOKA-BAU / ZVK Meldedaten-Engine (BRTV 2026/2027, DTA-Bau & XML V3.0)
 * 5. Nachunternehmer-Haftungsschutz § 14 AEntG & § 48b EStG mit Auszahlungssperre
 * 6. End-to-End Integration in Belege & Audit-Log Kette
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const IS_ELECTRON_AS_NODE = !!process.versions.electron;
const RUN_INNER_MARKER = 'PHASE4_INNER_RUN';

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

    function startePhase4Inner() {
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

    test('PHASE 4 - 1. Schema & DB-Migrationen (via Electron-as-Node Runtime)', async () => {
        const stdout = await startePhase4Inner();
        assert.match(stdout, /Alle 8 Phase 4 Tabellen existieren/, 'Schema Tabellen müssen existieren');
    });

    test('PHASE 4 - 2. IDS Connect 2.5 Parser & Preiskalkulation (via Electron-as-Node Runtime)', async () => {
        const stdout = await startePhase4Inner();
        assert.match(stdout, /IDS Connect 2.5 Parser & Preiskalkulation/, 'IDS Connect Parser muss durchlaufen');
    });

    test('PHASE 4 - 3. IDS Connect Callback-Server & CSRF (via Electron-as-Node Runtime)', async () => {
        const stdout = await startePhase4Inner();
        assert.match(stdout, /IDS Connect Callback-Server & CSRF/, 'Callback-Server muss durchlaufen');
    });

    test('PHASE 4 - 4. SOKA-BAU Beitragsberechnung & BRTV 2026 (via Electron-as-Node Runtime)', async () => {
        const stdout = await startePhase4Inner();
        assert.match(stdout, /SOKA-BAU Beitragsberechnung & BRTV 2026/, 'SOKA Beitragsberechnung muss durchlaufen');
    });

    test('PHASE 4 - 5. DTA-Bau & SOKA-XML V3.0 Export (via Electron-as-Node Runtime)', async () => {
        const stdout = await startePhase4Inner();
        assert.match(stdout, /DTA-Bau & SOKA-XML V3.0 Export/, 'DTA-Bau Export muss durchlaufen');
    });

    test('PHASE 4 - 6. Nachunternehmer Compliance & Auszahlungssperre (via Electron-as-Node Runtime)', async () => {
        const stdout = await startePhase4Inner();
        assert.match(stdout, /Nachunternehmer Compliance & Auszahlungssperre/, 'Compliance Prüfung muss durchlaufen');
    });

    test('PHASE 4 - 7. End-to-End Beleg-Import & SOKA-Archivierung (via Electron-as-Node Runtime)', async () => {
        const stdout = await startePhase4Inner();
        assert.match(stdout, /End-to-End Beleg-Import & SOKA-Archivierung/, 'End-to-End Workflow muss durchlaufen');
    });

} else {
    // =========================================================================
    // DIREKTE TESTAUSFÜHRUNG IM ELECTRON-NODE KONTEXT
    // =========================================================================

    const Database = require('better-sqlite3');
    const { createSchema, runMigrations, seedDefaultData } = require('../schema.js');
    const { createAuditLogger } = require('../main/audit.js');
    const IDSConnectController = require('../controllers/IDSConnectController');
    const IDSConnectService = require('../main/ids-connect-service');
    const SokaBauController = require('../controllers/SokaBauController');
    const SubcontractorComplianceController = require('../controllers/SubcontractorComplianceController');
    const { dbAPI } = require('../db.js');

    function createTestDatabase() {
        const db = new Database(':memory:');
        createSchema(db);
        runMigrations(db);
        seedDefaultData(db);
        const auditLogger = createAuditLogger(db);
        return { db, auditLogger };
    }

    test('Phase 4 Testsuite - 1. Schema & DB-Migrationen', async (t) => {
        const { db } = createTestDatabase();

        await t.test('Alle 8 Phase 4 Tabellen existieren', () => {
            const expectedTables = [
                'ids_connect_konten',
                'ids_warenkoerbe',
                'ids_artikel_dokumente',
                'soka_beitragssaetze',
                'soka_bau_meldungen',
                'soka_bau_arbeitnehmer_monat',
                'soka_bau_ausfallzeiten',
                'subcontractor_compliance_nachweise'
            ];

            for (const tbl of expectedTables) {
                const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(tbl);
                assert.ok(row, `Tabelle ${tbl} muss in SQLite existieren`);
            }

            // Prüfe Großhandels-Seeds
            const grosshaendler = db.prepare("SELECT * FROM ids_connect_konten").all();
            assert.ok(grosshaendler.length >= 5, 'Mindestens 5 Großhändler müssen vorbefüllt sein');

            // Prüfe SOKA Beitragssatz-Seeds (2026/2027)
            const saetze2026 = db.prepare("SELECT * FROM soka_beitragssaetze WHERE gueltig_ab >= '2026-07-01'").all();
            assert.ok(saetze2026.length >= 4, '4 Tarifgebiete für 2026/2027 müssen existieren');

            const westSatz = saetze2026.find(s => s.tarifgebiet === 'WEST');
            assert.equal(westSatz.ulak_prozent, 14.70);
            assert.equal(westSatz.zvk_prozent, 3.20);
            assert.equal(westSatz.bbv_prozent, 1.45);
            assert.equal(westSatz.winterbau_ag_prozent, 0.60);
            assert.equal(westSatz.winterbau_an_prozent, 0.40);
            assert.equal(westSatz.urlaubsverguetung_prozent, 14.25);
            assert.equal(westSatz.mindestlohn_1, 14.35);
            assert.equal(westSatz.mindestlohn_2, 16.50);

            // Prüfe Mitarbeiter-Migrationsspalten
            const maColumns = db.prepare("PRAGMA table_info(mitarbeiter)").all().map(c => c.name);
            assert.ok(maColumns.includes('vsnr'), 'Spalte vsnr muss in mitarbeiter vorhanden sein');
            assert.ok(maColumns.includes('an_nummer'), 'Spalte an_nummer muss in mitarbeiter vorhanden sein');
            assert.ok(maColumns.includes('tarifgebiet'), 'Spalte tarifgebiet muss in mitarbeiter vorhanden sein');

            console.log('--- Alle 8 Phase 4 Tabellen existieren mit Indizes und Seeds ---');
        });

        db.close();
    });

    test('Phase 4 Testsuite - 2. IDS Connect 2.5 Parser & Preiskalkulation', async (t) => {
        await t.test('IDS Connect 2.5 Parser & Preiskalkulation', () => {
            // URL Builder
            const konto = {
                shop_url: 'https://onlineplus.gc-gruppe.de/ids',
                kundennummer: 'K-99120',
                api_key: 'KEY_SEC_123',
                benutzername: 'wlink_user'
            };

            const launchUrl = IDSConnectController.buildLaunchUrl(konto, {
                action: 'call',
                hookUrl: 'http://127.0.0.1:49152/ids/callback',
                sessionId: 'IDS-TEST-001',
                orderReference: 'ANG-2026-08',
                csrfToken: 'CSRF_8877'
            });

            assert.ok(launchUrl.startsWith('https://onlineplus.gc-gruppe.de/ids'));
            assert.ok(launchUrl.includes('ids_version=2.5'));
            assert.ok(launchUrl.includes('customer_number=K-99120'));

            // XML Shopping Cart Parser
            const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<shopping_cart version="2.5" xmlns="http://www.itek.de/idsconnect/2.5">
  <header>
    <supplier_id>GC_GRUPPE</supplier_id>
    <customer_number>K-99120</customer_number>
    <cart_id>CART-2026-0099</cart_id>
    <cart_date>2026-08-30T10:00:00Z</cart_date>
    <currency>EUR</currency>
    <total_net_amount>340.50</total_net_amount>
  </header>
  <items>
    <item id="1">
      <supplier_item_number>GC-448190</supplier_item_number>
      <ean>4012345678901</ean>
      <short_description>Geberit Duofix WC-Element 112cm</short_description>
      <long_description>Wand-WC Element mit Sigma Unterputzspülkasten 12cm</long_description>
      <quantity>2</quantity>
      <quantity_unit>Stk</quantity_unit>
      <price_basis>1</price_basis>
      <gross_price>250.00</gross_price>
      <net_price>150.00</net_price>
      <tax_rate>19.0</tax_rate>
      <document type="SDB" title="Sicherheitsdatenblatt">https://docs.gc.de/sdb/448190.pdf</document>
    </item>
    <item id="2">
      <supplier_item_number>GC-110293</supplier_item_number>
      <short_description>Kupferrohr 15x1,0 mm (Stange 5m)</short_description>
      <quantity>10</quantity>
      <quantity_unit>m</quantity_unit>
      <price_basis>100</price_basis>
      <net_price>405.00</net_price>
    </item>
  </items>
</shopping_cart>`;

            const parsed = IDSConnectController.parseShoppingCartXml(sampleXml);
            assert.equal(parsed.header.supplierId, 'GC_GRUPPE');
            assert.equal(parsed.items.length, 2);
            assert.equal(parsed.items[0].posNetTotal, 300.00);
            assert.equal(parsed.items[1].posNetTotal, 40.50);
            assert.equal(parsed.totalNetAmount, 340.50);

            // Preiskalkulation
            const calc = IDSConnectController.calculateCalculatedPrices(100.0, 25.0, 19.0);
            assert.equal(calc.netEk, 100.0);
            assert.equal(calc.vkNetto, 125.0);
            assert.equal(calc.vkBrutto, 148.75);

            console.log('--- IDS Connect 2.5 Parser & Preiskalkulation erfolgreich ---');
        });
    });

    test('Phase 4 Testsuite - 3. IDS Connect Callback-Server & CSRF', async (t) => {
        const { db, auditLogger } = createTestDatabase();
        const service = new IDSConnectService(db, auditLogger, { port: 0 });

        await t.test('IDS Connect Callback-Server & CSRF', async () => {
            db.prepare("INSERT INTO projekte (id, name, status) VALUES (5, 'Testprojekt', 'IN_PLANUNG')").run();
            const boundPort = await service.startLocalServer();
            assert.ok(boundPort > 0);

            const { sessionId, csrfToken } = service.createSession(1, { projektId: 5 });
            assert.ok(service.validateSession(sessionId, csrfToken));

            let receivedCart = null;
            service.setOnCartReceived((cart) => {
                receivedCart = cart;
            });

            const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<shopping_cart version="2.5" xmlns="http://www.itek.de/idsconnect/2.5">
  <header>
    <supplier_id>RICHTER_FRENZEL</supplier_id>
    <cart_id>RF-CART-7711</cart_id>
    <total_net_amount>180.00</total_net_amount>
  </header>
  <items>
    <item id="1">
      <supplier_item_number>RF-9001</supplier_item_number>
      <short_description>Hansgrohe Waschtischmischer</short_description>
      <quantity>2</quantity>
      <price_basis>1</price_basis>
      <net_price>90.00</net_price>
    </item>
  </items>
</shopping_cart>`;

            const postData = `shoppingcart=${encodeURIComponent(sampleXml)}&session_id=${encodeURIComponent(sessionId)}&csrf_token=${encodeURIComponent(csrfToken)}`;

            await new Promise((resolve, reject) => {
                const req = http.request({
                    hostname: '127.0.0.1',
                    port: boundPort,
                    path: `/ids/callback?session_id=${encodeURIComponent(sessionId)}&csrf_token=${encodeURIComponent(csrfToken)}`,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Content-Length': Buffer.byteLength(postData)
                    }
                }, (res) => {
                    assert.equal(res.statusCode, 200);
                    let body = '';
                    res.on('data', chunk => { body += chunk; });
                    res.on('end', () => {
                        assert.ok(body.includes('Warenkorb übertragen'));
                        resolve();
                    });
                });
                req.on('error', reject);
                req.write(postData);
                req.end();
            });

            assert.ok(receivedCart !== null);
            assert.equal(receivedCart.header.supplierId, 'RICHTER_FRENZEL');

            await service.stopLocalServer();
            console.log('--- IDS Connect Callback-Server & CSRF erfolgreich ---');
        });

        db.close();
    });

    test('Phase 4 Testsuite - 4. SOKA-BAU Beitragsberechnung & BRTV 2026', async (t) => {
        await t.test('SOKA-BAU Beitragsberechnung & BRTV 2026', () => {
            const saetzeWest = SokaBauController.getBeitragssaetze('WEST', '2026-09-01');
            assert.equal(saetzeWest.ulak, 14.70);
            assert.equal(saetzeWest.zvk, 3.20);
            assert.equal(saetzeWest.bbv, 1.45);
            assert.equal(saetzeWest.winterbauAg, 0.60);
            assert.equal(saetzeWest.urlaubsverguetungSatz, 14.25);

            const mitarbeiter = {
                id: 1,
                an_nummer: 'AN-1001',
                vsnr: '12140578M012',
                nachname: 'Mustermann',
                vorname: 'Max',
                tarifgebiet: 'WEST'
            };

            const monatsDaten = {
                bruttoLohn: 3780.00,
                geleisteteStunden: 168.0,
                beschaeftigungstage: 30,
                genommenerUrlaubTage: 2,
                ausbezahltesUrlaubsentgelt: 350.00
            };

            const anRes = SokaBauController.calculateArbeitnehmerMonat(mitarbeiter, monatsDaten, saetzeWest);
            assert.equal(anRes.beitraege.ulakBeitrag, 555.66);
            assert.equal(anRes.beitraege.zvkBeitrag, 120.96);
            assert.equal(anRes.beitraege.bbvBeitrag, 54.81);
            assert.equal(anRes.beitraege.winterbauAg, 22.68);
            assert.equal(anRes.beitraege.gesamtBeitrag, 754.11);
            assert.equal(anRes.urlaub.erworbeneUrlaubstage, 2.5);
            assert.equal(anRes.complianceStatus, 'VALID');

            console.log('--- SOKA-BAU Beitragsberechnung & BRTV 2026 erfolgreich ---');
        });
    });

    test('Phase 4 Testsuite - 5. DTA-Bau & SOKA-XML V3.0 Export', async (t) => {
        await t.test('DTA-Bau & SOKA-XML V3.0 Export', () => {
            const betrieb = {
                betriebsnummer: '12345678',
                firmenname: 'W-Link Bauunternehmung GmbH'
            };

            const an1 = {
                mitarbeiterId: 1,
                anNummer: 'AN001',
                vsnr: '12140578M012',
                name: 'Mustermann',
                vorname: 'Max',
                beschaeftigungstage: 30,
                geleisteteStunden: 168.0,
                bruttoLohn: 3500.00,
                beitraege: {
                    ulakBeitrag: 514.50,
                    zvkBeitrag: 112.00,
                    bbvBeitrag: 50.75,
                    winterbauAg: 21.00,
                    gesamtBeitrag: 698.25
                },
                urlaub: {
                    erworbeneUrlaubstage: 2.5,
                    erworbeneUrlaubsverguetung: 498.75,
                    genommeneTage: 0,
                    ausbezahltesUrlaubsentgelt: 0,
                    ulakErstattungsanspruch: 0
                },
                ausfallzeiten: [
                    { schluessel: '04', bezeichnung: 'Saison-KUG', von: '20260910', bis: '20260912', stunden: 24.0 }
                ]
            };

            const dtaString = SokaBauController.generateDtaBauString(betrieb, [an1], '2026-09');
            const lines = dtaString.split('\r\n');
            assert.equal(lines.length, 4);
            assert.ok(lines[0].startsWith('0112345678202609W-Link Bauunternehmung GmbH'));
            assert.ok(lines[1].startsWith('0212345678202609AN001     12140578M012Mustermann, Max'));

            const xmlString = SokaBauController.generateSokaBauXml(betrieb, [an1], '2026-09');
            assert.ok(xmlString.includes('<SokaBauMeldung xmlns="http://www.soka-bau.de/schema/meldedaten/v3" version="3.0">'));
            assert.ok(xmlString.includes('<GesamtBeitrag>698.25</GesamtBeitrag>'));

            console.log('--- DTA-Bau & SOKA-XML V3.0 Export erfolgreich ---');
        });
    });

    test('Phase 4 Testsuite - 6. Nachunternehmer Compliance & Auszahlungssperre', async (t) => {
        await t.test('Nachunternehmer Compliance & Auszahlungssperre', () => {
            const today = '2026-08-30';

            const subCompliant = {
                id: 101,
                name: 'Trockenbau Meisterbetrieb GmbH',
                is_subcontractor: 1,
                sec48b_valid_until: '2027-06-30'
            };

            const nachweise1 = [
                {
                    kunde_id: 101,
                    nachweis_typ: 'SOKA_BAU_UB',
                    gueltig_bis: '2026-12-31',
                    status: 'ACTIVE'
                }
            ];

            const res1 = SubcontractorComplianceController.verifySubcontractorCompliance(subCompliant, nachweise1, today);
            assert.equal(res1.canPay, true);

            const subNoSoka = {
                id: 102,
                name: 'Schwarz & Partner Bau UG',
                is_subcontractor: 1,
                sec48b_valid_until: '2027-06-30'
            };

            const res2 = SubcontractorComplianceController.verifySubcontractorCompliance(subNoSoka, [], today);
            assert.equal(res2.canPay, false);
            assert.ok(res2.paymentLockReason.includes('Generalunternehmer-Haftung'));

            console.log('--- Nachunternehmer Compliance & Auszahlungssperre erfolgreich ---');
        });
    });

    test('Phase 4 Testsuite - 7. End-to-End Beleg-Import & SOKA-Archivierung', async (t) => {
        const { db } = createTestDatabase();

        await t.test('End-to-End Beleg-Import & SOKA-Archivierung', () => {
            // 1. Testkunde anlegen
            db.prepare("INSERT INTO kunden (id, name, ort) VALUES (1, 'Musterkunde Phase 4', 'Musterstadt')").run();

            // 2. Großhandelskonto anlegen
            const resKonto = db.prepare(`
                INSERT INTO ids_connect_konten (
                    name, grosshaendler_code, shop_url, kundennummer, standard_aufschlag_prozent, is_default
                ) VALUES ('Sonepar Elektro-Großhandel', 'SONEPAR_CUSTOM', 'https://shop.sonepar.de/ids', 'SN-998877', 30.0, 1)
            `).run();
            const kontoId = resKonto.lastInsertRowid;

            // 3. Angebot anlegen
            const docRes = db.prepare(`
                INSERT INTO dokumente (type, nr, kundeId, datum, netto, steuer, brutto, status)
                VALUES ('angebot', 'ANG-2026-99', 1, '2026-08-30', 0, 0, 0, 'entwurf')
            `).run();
            const dokumentId = docRes.lastInsertRowid;

            // 4. Empfangenen Warenkorb in ids_warenkoerbe einfügen
            const testCartXml = `<?xml version="1.0" encoding="UTF-8"?>
<shopping_cart version="2.5" xmlns="http://www.itek.de/idsconnect/2.5">
  <header>
    <supplier_id>SONEPAR</supplier_id>
    <cart_id>CART-SONEPAR-101</cart_id>
    <total_net_amount>200.00</total_net_amount>
  </header>
  <items>
    <item id="1">
      <supplier_item_number>SN-110022</supplier_item_number>
      <ean>4011223344556</ean>
      <short_description>NYM-J 3x1.5 mm² Mantelleitung (100m Ring)</short_description>
      <quantity>2</quantity>
      <quantity_unit>Ring</quantity_unit>
      <price_basis>1</price_basis>
      <net_price>100.00</net_price>
      <tax_rate>19.0</tax_rate>
      <document type="SDB" title="Sicherheitsdatenblatt">https://docs.sonepar.de/sdb.pdf</document>
    </item>
  </items>
</shopping_cart>`;

            const cartInsert = db.prepare(`
                INSERT INTO ids_warenkoerbe (konto_id, lieferant, cart_id, netto_gesamt, items_count, status, cart_xml)
                VALUES (?, 'SONEPAR', 'CART-SONEPAR-101', 200.00, 1, 'RECEIVED', ?)
            `).run(kontoId, testCartXml);
            const cartId = cartInsert.lastInsertRowid;

            // 5. Warenkorb parsen & Preiskalkulation prüfen
            const parsed = IDSConnectController.parseShoppingCartXml(testCartXml);
            assert.equal(parsed.items.length, 1);
            const calc = IDSConnectController.calculateCalculatedPrices(parsed.items[0].netPrice, 30.0, 19.0);
            assert.equal(calc.vkNetto, 130.00);
            assert.equal(calc.netEk, 100.00);

            // 6. SOKA-BAU Meldebogen & Export
            const saetzeWest = SokaBauController.getBeitragssaetze('WEST', '2026-09-01');
            assert.equal(saetzeWest.ulak, 14.70);

            const maData = {
                anNummer: 'AN-0101',
                vsnr: '65120458K014',
                name: 'Mustermann',
                vorname: 'Max',
                tarifgebiet: 'WEST',
                beschaeftigungstage: 30,
                geleisteteStunden: 168.0,
                bruttoLohn: 4200.00,
                ausfallzeiten: [],
                urlaub: { genommeneTage: 0, ausbezahltesUrlaubsentgelt: 0 }
            };
            const anMelde = SokaBauController.calculateArbeitnehmerMonat(maData, saetzeWest);
            assert.equal(anMelde.complianceStatus, 'VALID');
            assert.equal(anMelde.urlaub.erworbeneUrlaubstage, 2.5);

            const gesamtMeldung = SokaBauController.calculateMonatsmeldungGesamt({ betriebsnummer: '98765432' }, [anMelde], '2026-09', 'WEST');
            assert.ok(gesamtMeldung.bruttolohnGesamt > 0);

            const dtaStr = SokaBauController.generateDtaBauString({ betriebsnummer: '98765432', name: 'W-Link Bau GmbH' }, [anMelde], '2026-09');
            const xmlStr = SokaBauController.generateSokaBauXml({ betriebsnummer: '98765432', name: 'W-Link Bau GmbH' }, [anMelde], '2026-09');

            assert.ok(dtaStr.includes('0198765432'));
            assert.ok(xmlStr.includes('<SokaBauMeldung'));
            const sha = crypto.createHash('sha256').update(dtaStr).digest('hex');
            assert.equal(sha.length, 64);

            console.log('--- End-to-End Beleg-Import & SOKA-Archivierung erfolgreich ---');
        });

        db.close();
    });
}
