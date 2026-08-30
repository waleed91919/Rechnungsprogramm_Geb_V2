/**
 * tests/phase2_kalkulation_datanorm_maengel.test.js
 * Vollständige, automatisierte Testsuite für Phase 2 (Release 1.1)
 * Testet:
 * 1. Schema & Migrationen (8 neue Tabellen, neue Spalten)
 * 2. Zuschlags- & Endsummenkalkulation (EFB 221/222, Mittellohn, DB I/II, Soll-Ist)
 * 3. DATANORM 4.0 & 5.0 Streaming Parser (CP850, PreisEinheit, Batching)
 * 4. Mängelkataster & Fristenradar (VOB/B § 13, § 641 (3) BGB, Mahnwesen, Ersatzvornahme)
 * 5. Revisionssichere Audit-Kette & SQLite WAL Transaktionen
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const IS_ELECTRON_AS_NODE = !!process.versions.electron;
const RUN_INNER_MARKER = 'PHASE2_INNER_RUN';

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

    function startePhase2Inner() {
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
                    reject(err);
                }
            });
        }
        return innerStdoutPromise;
    }

    test('PHASE 2 - 1. Schema & DB-Migrationen (via Electron-as-Node Runtime)', async () => {
        const stdout = await startePhase2Inner();
        assert.match(stdout, /Alle 8 Phase 2 Tabellen existieren/, 'Schema Tabellen müssen existieren');
    });

    test('PHASE 2 - 2. Kalkulations-Engine (via Electron-as-Node Runtime)', async () => {
        const stdout = await startePhase2Inner();
        assert.match(stdout, /Projekt-Gesamtkalkulation/, 'Kalkulation muss durchlaufen');
    });

    test('PHASE 2 - 3. DATANORM 4.0 & 5.0 Streaming Parser (via Electron-as-Node Runtime)', async () => {
        const stdout = await startePhase2Inner();
        assert.match(stdout, /Streaming Datei-Import in SQLite/, 'Datanorm Import muss durchlaufen');
    });

    test('PHASE 2 - 4. Mängelkataster & Fristenmanagement (via Electron-as-Node Runtime)', async () => {
        const stdout = await startePhase2Inner();
        assert.match(stdout, /Rechtssicheres Mahnschreiben Stufe 1 & Stufe 2 generieren/, 'Mängelkataster muss durchlaufen');
    });
} else {
const Database = require('better-sqlite3');

const { createSchema, runMigrations, seedDefaultData } = require('../schema.js');
const { createAuditLogger } = require('../main/audit.js');
const KalkulationController = require('../controllers/KalkulationController');
const DatanormParser = require('../controllers/DatanormParser');
const MaengelController = require('../controllers/MaengelController');
const MaengelPdfBuilder = require('../main/maengel-pdf-builder');

function setupTestDb() {
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    createSchema(db);
    runMigrations(db);
    seedDefaultData(db);
    const auditLogger = createAuditLogger(db);
    return { db, auditLogger };
}

test('PHASE 2 - 1. Schema & DB-Migrationen', async (t) => {
    const { db } = setupTestDb();

    await t.test('Alle 8 Phase 2 Tabellen existieren', () => {
        const requiredTables = [
            'zuschlagskalkulation_stamm',
            'zuschlagskalkulation_projekte',
            'datanorm_kataloge',
            'datanorm_warengruppen',
            'datanorm_rabattgruppen',
            'maengelkataster',
            'maengel_fotos',
            'maengel_historie'
        ];

        for (const table of requiredTables) {
            const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
            assert.ok(row, `Tabelle ${table} muss im Schema existieren.`);
        }
    });

    await t.test('Migrierte Spalten in bestehenden Tabellen existieren', () => {
        const posCols = db.prepare("PRAGMA table_info(positionen)").all().map(c => c.name);
        assert.ok(posCols.includes('ekt_stoff_je_me'), 'positionen.ekt_stoff_je_me fehlt');
        assert.ok(posCols.includes('ekt_geraet_je_me'), 'positionen.ekt_geraet_je_me fehlt');
        assert.ok(posCols.includes('ekt_sonst_je_me'), 'positionen.ekt_sonst_je_me fehlt');
        assert.ok(posCols.includes('ekt_nu_je_me'), 'positionen.ekt_nu_je_me fehlt');

        const artCols = db.prepare("PRAGMA table_info(artikel)").all().map(c => c.name);
        assert.ok(artCols.includes('datanorm_nr'), 'artikel.datanorm_nr fehlt');
        assert.ok(artCols.includes('warengruppe_id'), 'artikel.warengruppe_id fehlt');
        assert.ok(artCols.includes('rabattgruppe_id'), 'artikel.rabattgruppe_id fehlt');

        const secCols = db.prepare("PRAGMA table_info(security_retentions)").all().map(c => c.name);
        assert.ok(secCols.includes('mangel_id'), 'security_retentions.mangel_id fehlt');
    });

    await t.test('Standard-Kalkulationsprofil wurde gesplittet & initialisiert', () => {
        const profile = db.prepare('SELECT * FROM zuschlagskalkulation_stamm WHERE ist_standard = 1').get();
        assert.ok(profile, 'Standard-Kalkulationsprofil muss vorhanden sein');
        assert.equal(profile.mittellohn_eur, 26.00);
        assert.equal(profile.lohngebundene_kosten_prozent, 84.50);
        assert.equal(profile.lohnnebenkosten_prozent, 13.50);
    });

    db.close();
});

test('PHASE 2 - 2. Kalkulations-Engine (KalkulationController)', async (t) => {
    await t.test('Mittellohn-Struktur ($ML -> $LK -> $LNK -> $KL -> $VL)', () => {
        const profile = {
            mittellohn_eur: 26.00,
            lohngebundene_kosten_prozent: 84.50, // 21.97 €
            lohnnebenkosten_prozent: 13.50,      // 3.51 €
            zuschlag_lohn_bgk: 18.0,
            zuschlag_lohn_agk: 22.0,
            zuschlag_lohn_wug: 8.0              // Summe Lohnzuschlag: 48.0 %
        };

        const res = KalkulationController.calculateMittellohnStructure(profile);
        // KL = 26.00 + 21.97 + 3.51 = 51.48 €
        assert.equal(res.kalkulationslohn, 51.48);
        assert.equal(res.zuschlagLohn.prozent, 48.0);
        // VL = 51.48 * (1 + 0.48) = 76.19 €
        assert.equal(res.verrechnungslohn, 76.19);
    });

    await t.test('Einzelkosten & Gemeinkostenzuschläge einer Position', () => {
        const pos = {
            menge: 10,
            zeitansatz_stunden: 2.0, // 20 Gesamtstunden
            ekt_stoff_je_me: 15.0,   // 150 €
            ekt_geraet_je_me: 5.0,   // 50 €
            ekt_sonst_je_me: 2.0,    // 20 €
            ekt_nu_je_me: 0.0,
            preis: 250.0             // Angebotener EP: 250 € -> GP = 2500 €
        };

        const profile = KalkulationController.getDefaultProfile();
        const calc = KalkulationController.calculatePosition(pos, profile);

        // Lohn EKT = 20 Std * 51.48 € = 1029.60 €
        assert.equal(calc.ekt.lohn, 1029.60);
        assert.equal(calc.ekt.stoffe, 150.00);
        assert.equal(calc.ekt.geraete, 50.00);
        assert.equal(calc.ekt.sonstiges, 20.00);
        assert.equal(calc.ekt.gesamt, 1249.60);

        // Angebotene Gesamtleistung: 2500 €
        // DB I = 2500 - 1249.60 = 1250.40 € (50.02% Quote)
        assert.equal(calc.deckungsbeitrag1, 1250.40);
        assert.ok(calc.db1Quote > 50.0);
    });

    await t.test('Projekt-Gesamtkalkulation (EFB 221 vs EFB 222 Endsummenkalkulation)', () => {
        const positions = [
            { menge: 5, zeitansatz_stunden: 4.0, ekt_stoff_je_me: 50.0, ekt_geraet_je_me: 10.0, preis: 400.0 },
            { menge: 10, zeitansatz_stunden: 1.0, ekt_stoff_je_me: 20.0, ekt_geraet_je_me: 0.0, preis: 120.0 }
        ];

        // 1. EFB 221 Zuschlagskalkulation
        const prof221 = { ...KalkulationController.getDefaultProfile(), kalkulationsverfahren: 'ZUSCHLAGSKALKULATION' };
        const res221 = KalkulationController.calculateProjectKalkulation(positions, prof221);

        assert.equal(res221.totals.summeAngebotNetto, 3200.00);
        assert.ok(res221.totals.summeEktGesamt > 0);
        assert.ok(res221.totals.deckungsbeitrag1 > 0);

        // 2. EFB 222 Endsummenkalkulation (Umlage auf Herstellkosten)
        const prof222 = {
            ...KalkulationController.getDefaultProfile(),
            kalkulationsverfahren: 'ENDSUMMENKALKULATION',
            endsumme_umlage_basis: 'HERSTELLKOSTEN',
            zuschlag_lohn_agk: 20.0,
            zuschlag_lohn_wug: 10.0
        };
        const res222 = KalkulationController.calculateProjectKalkulation(positions, prof222);

        assert.ok(res222.totals.kalkulierterGewinn > 0);
        assert.ok(res222.totals.gewinnMargeProzent > 0);
    });

    await t.test('Soll-Ist-Nachkalkulation mit Abweichungsanalyse', () => {
        const positions = [
            { menge: 10, zeitansatz_stunden: 2.0, ekt_stoff_je_me: 30.0, preis: 200.0 }
        ];
        const profile = KalkulationController.getDefaultProfile();
        // Ist-Kosten: Material 400 €, Stunden 25 h (Mehrverbrauch)
        const actualCosts = { material: 400.0, sub: 0, hours: 25.0 };

        const res = KalkulationController.calculateProjectKalkulation(positions, profile, actualCosts);
        const nachkalk = res.nachkalkulation;

        assert.equal(nachkalk.sollStunden, 20.0);
        assert.equal(nachkalk.istStunden, 25.0);
        assert.equal(nachkalk.abweichungStunden, -5.0); // 5 Stunden Überhang
        assert.ok(nachkalk.istEkt > 0);
        assert.ok(nachkalk.istDeckungsbeitrag < res.totals.deckungsbeitrag1); // DB I ist geschrumpft
    });
});

test('PHASE 2 - 3. DATANORM 4.0 & 5.0 Streaming Parser', async (t) => {
    const { db } = setupTestDb();

    await t.test('CP850 Dekodierung von Umlauten & Sonderzeichen', () => {
        // CP850 Bytes: 'M', 0x84 ('ä'), 'n', 'g', 'e', 'l', ' ', 0x94 ('ö'), 0x81 ('ü'), 0xe1 ('ß')
        const buf = Buffer.from([0x4d, 0x84, 0x6e, 0x67, 0x65, 0x6c, 0x20, 0x94, 0x81, 0xe1]);
        const decoded = DatanormParser.decodeCp850(buf);
        assert.equal(decoded, 'Mängel öüß');
    });

    await t.test('In-Memory Satzart-Parsing (V, A, B, P, WRG, RAB) & PreisEinheit-Division', () => {
        const datanormText = [
            'V;12345;01;Großhandel Sanitär;EUR;01.01.2026',
            'A;N;1001;01;01;Kupferrohr 15x1mm;Stange 5m;0;m;1000;4500;10;1', // PreisEinheit = 1000, VK = 45.00 € / 1000 -> 0.045 €/m
            'B;N;1001;Sanitär-Installation;DVGW geprüft;;;;;;;;;;;;;;;;;;;;;;;;;',
            'P;1001;2;12000;200;10', // Preis-Änderung: 120.00 € / 200 = 0.60 €/m
            'R;01;Sanitär-Rohre;25.00',
            'G;01;Rohrleitungsmaterial'
        ].join('\r\n');

        const parsed = DatanormParser.parseDatanormText(datanormText);

        assert.equal(parsed.vorlauf.katalogName, 'Großhandel Sanitär');
        assert.equal(parsed.rabattgruppen.length, 1);
        assert.equal(parsed.rabattgruppen[0].rabatt_prozent, 25.00);
        assert.equal(parsed.warengruppen.length, 1);
        assert.equal(parsed.warengruppen[0].bezeichnung, 'Rohrleitungsmaterial');

        assert.equal(parsed.artikel.length, 1);
        const art = parsed.artikel[0];
        assert.equal(art.artikel_nr, '1001');
        assert.equal(art.langtext, 'Sanitär-Installation DVGW geprüft');
        assert.equal(art.mengeneinheit, 'm');
        // Nach P-Satz: 120.00 € / 200 = 0.60 € Basis-EK
        assert.equal(art.ek_preis, 0.60);
    });

    await t.test('Streaming Datei-Import in SQLite mit Batching (importDatanormFiles)', async () => {
        const tmpDir = path.join(__dirname, 'tmp_datanorm_test');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

        const testFile1 = path.join(tmpDir, 'DATANORM.001');
        const testContent = [
            'V;999;01;Test Großhandel;EUR;01.01.2026',
            'R;01;Standard Rabatt;30.00',
            'G;01;Sanitär Allgemein',
            'A;N;ART-001;01;01;Waschtischarmatur Chrom;Einhebelmischer;0;Stk;1;8500;19;1',
            'B;N;ART-001;Hochglanz verchromt;mit Ablaufgarnitur;;;;;;;;;;;;;;;;;;;;;;;;;',
            'A;N;ART-002;01;01;Dichtband 10m;Teflon;0;Rolle;100;5000;19;1' // 50.00 € / 100 = 0.50 €/Rolle
        ].join('\r\n');

        fs.writeFileSync(testFile1, testContent, 'latin1');

        const res = await DatanormParser.importDatanormFiles([testFile1], db, {
            lieferant: 'Test Großhandel',
            katalogName: 'Test Sanitär 2026',
            aufschlagProzent: 30.0
        });

        assert.equal(res.totalInserted, 2);

        // Prüfe importierte Artikel in SQLite
        const art1 = db.prepare("SELECT * FROM artikel WHERE datanorm_nr = 'ART-001'").get();
        assert.ok(art1, 'ART-001 muss in artikel existieren');
        assert.equal(art1.ek, 85.00);
        // VK = 85 * 1.30 = 110.50 €
        assert.equal(art1.vk, 110.50);

        const art2 = db.prepare("SELECT * FROM artikel WHERE datanorm_nr = 'ART-002'").get();
        assert.ok(art2, 'ART-002 muss existieren');
        assert.equal(art2.ek, 0.50);

        // Katalog-Header prüfen
        const kat = db.prepare("SELECT * FROM datanorm_kataloge WHERE lieferant_name = 'Test Großhandel'").get();
        assert.ok(kat, 'Katalog-Eintrag muss existieren');
        assert.equal(kat.anzahl_artikel, 2);

        // Cleanup
        fs.unlinkSync(testFile1);
        fs.rmdirSync(tmpDir);
    });

    db.close();
});

test('PHASE 2 - 4. Mängelkataster & Fristenmanagement (MaengelController)', async (t) => {
    const { db, auditLogger } = setupTestDb();

    // Projekt und Subunternehmer anlegen
    const projRes = db.prepare("INSERT INTO projekte (name, status) VALUES ('BV Neubau Stadthaus', 'IN_ARBEIT')").run();
    const projektId = projRes.lastInsertRowid;

    const subRes = db.prepare("INSERT INTO kunden (name, customer_type, is_subcontractor, adresse, plz, ort) VALUES ('Mustermann Sanitär GmbH', 'LIEFERANT', 1, 'Kanalstr. 10', '10115', 'Berlin')").run();
    const subId = subRes.lastInsertRowid;

    let createdMangelId = null;

    await t.test('Fristen-Ampel Berechnung (VOB/B § 13)', () => {
        const today = new Date();
        const past = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0];
        const soon = new Date(Date.now() + 4 * 86400000).toISOString().split('T')[0];
        const future = new Date(Date.now() + 20 * 86400000).toISOString().split('T')[0];

        const ampelRed = MaengelController.calculateFristAmpel(past, 'IN_NACHBESSERUNG');
        assert.equal(ampelRed.color, 'RED');
        assert.equal(ampelRed.isOverdue, true);

        const ampelYellow = MaengelController.calculateFristAmpel(soon, 'IN_NACHBESSERUNG');
        assert.equal(ampelYellow.color, 'YELLOW');
        assert.equal(ampelYellow.isOverdue, false);

        const ampelGreen = MaengelController.calculateFristAmpel(future, 'IN_NACHBESSERUNG');
        assert.equal(ampelGreen.color, 'GREEN');

        const ampelDone = MaengelController.calculateFristAmpel(past, 'ERLEDIGT');
        assert.equal(ampelDone.color, 'GRAY');
    });

    await t.test('Druckzuschlag-Berechnung nach § 641 Abs. 3 BGB (200% Mindesteinbehalt)', () => {
        const druck = MaengelController.calculateDruckzuschlag(1500.00, 2.0);
        assert.equal(druck.geschaetzteKosten, 1500.00);
        assert.equal(druck.faktor, 2.0);
        assert.equal(druck.einbehaltBetrag, 3000.00);
    });

    await t.test('Mangel anlegen mit Fotos & Historie-Auditierung', () => {
        const res = MaengelController.saveMangel(db, {
            projekt_id: projektId,
            subunternehmer_kunde_id: subId,
            titel: 'Undichte Pressverbindung Heizkreis Verteiler EG',
            gewerk: 'Heizung',
            bauteil: 'HKV-EG',
            ort_beschreibung: 'EG Flur Nische',
            schweregrad: 'SCHWER',
            status: 'ERFASST',
            nachbesserungsfrist: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0],
            geschaetzte_beseitigungskosten_eur: 800.00,
            erfasst_von: 'Bauleiter Meier'
        }, [
            { dateipfad: '/fotos/mangel_01.jpg', typ: 'VOR_NACHBESSERUNG', kommentar: 'Tropfstelle sichtbar' }
        ], auditLogger);

        assert.equal(res.success, true);
        createdMangelId = res.mangelId;

        const details = MaengelController.getMangelDetails(db, createdMangelId);
        assert.ok(details, 'Mangeldetails müssen geladen werden können');
        assert.equal(details.mangel_nr, 'M-001');
        assert.equal(details.einbehalt_betrag_eur, 1600.00); // 800 € * 2.0
        assert.equal(details.fotos.length, 1);
        assert.equal(details.historie.length, 1);
    });

    await t.test('Rechtssicheres Mahnschreiben Stufe 1 & Stufe 2 generieren', () => {
        const details = MaengelController.getMangelDetails(db, createdMangelId);
        const sub = db.prepare('SELECT * FROM kunden WHERE id = ?').get(subId);

        // Stufe 1: Mängelrüge § 13 (5) Nr. 1 VOB/B
        const stufe1 = MaengelController.generateMahnschreibenText(details, sub, 1);
        assert.ok(stufe1.betreff.includes('§ 13 Abs. 5 Nr. 1 VOB/B'));
        assert.ok(stufe1.text.includes('Undichte Pressverbindung'));

        // Stufe 2: Nachfrist mit Ersatzvornahmeandrohung & § 641 (3) BGB Einbehalt
        const stufe2 = MaengelController.generateMahnschreibenText(details, sub, 2);
        assert.ok(stufe2.betreff.includes('§ 13 Abs. 5 Nr. 2 VOB/B'));
        assert.ok(stufe2.text.includes('1.600,00 EUR'));
        assert.ok(stufe2.text.includes('Ersatzvornahme durch einen Drittbetrieb'));

        // HTML & PDF-Builder
        const html = MaengelPdfBuilder.buildMahnschreibenHtml(details, sub, 2, {}, { firmenname: 'W-Link ERP Bau GmbH' });
        assert.ok(html.includes('W-Link ERP Bau GmbH'));
        assert.ok(html.includes('Mustermann Sanitär GmbH'));

        const protokollHtml = MaengelPdfBuilder.buildMangelProtokollHtml(details, details.fotos, details.historie);
        assert.ok(protokollHtml.includes('Mängelprotokoll & Baustellenbefund'));
    });

    await t.test('Statuswechsel & Ersatzvornahme Ausführung', () => {
        // Statuswechsel auf MAENGELRUEGE_VERSCHICKT
        MaengelController.updateMangelStatus(db, createdMangelId, 'MAENGELRUEGE_VERSCHICKT', 'Mängelrüge per Einschreiben versandt', 'Bauleiter Meier', auditLogger);
        let m = MaengelController.getMangelDetails(db, createdMangelId);
        assert.equal(m.status, 'MAENGELRUEGE_VERSCHICKT');
        assert.ok(m.maengelruege_versandt_am);

        // Ersatzvornahme durchführen
        const ersatzRes = MaengelController.executeErsatzvornahme(db, {
            mangelId: createdMangelId,
            tatsaechlicheKosten: 950.00,
            kommentar: 'Mangel durch Fremdfirma Rohrblitz GmbH behoben.',
            geaendertVon: 'Projektleiter'
        }, auditLogger);

        assert.equal(ersatzRes.success, true);
        m = MaengelController.getMangelDetails(db, createdMangelId);
        assert.equal(m.status, 'ERSATZVORNAHME');
        assert.equal(m.tatsaechliche_ersatzvornahme_kosten_eur, 950.00);
        assert.equal(m.historie.length, 3);
    });

    db.close();
});
}
