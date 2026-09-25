/**
 * tests/zeiterfassung_milog.test.js
 * Testsuite für Phase 5 (Masterplan 2026-09-24):
 * 1. MiLoG § 17 Abs. 1 7-Tage-Aufzeichnungsprüfung (Pünktlich vs. Verspätet, Warntext)
 * 2. MiLoG § 17 Abs. 2 2-jährige Mindestaufbewahrung & Löschsperre (Controller & SQLite Trigger)
 * 3. Artikelstamm: Einheit (Dropdown/Werte) und GPSR-Felder (EU 2023/988)
 * 4. BEG IV Aufbewahrungsfristen (Stand 2025/2026: 8 Jahre für Rechnungen gem. § 14b UStG / § 147 AO)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ZeiterfassungController = require('../controllers/ZeiterfassungController');
const { AUFBEWAHRUNGSFRISTEN_BEG_IV } = require('../main/backup');

const IS_ELECTRON_AS_NODE = !!process.versions.electron || process.argv.includes('--MILOG_INNER_RUN');
const RUN_INNER_MARKER = 'MILOG_INNER_RUN';

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

// ---------------------------------------------------------
// REIN LOGISCHE TESTS (Laufen in jedem Node.js-Prozess direkt)
// ---------------------------------------------------------

test('MiLoG § 17 Abs. 1 - 7-Tage Aufzeichnungsprüfung: Pünktliche Erfassung (gleicher Tag)', () => {
    const zeitVon = '2026-05-10T08:00:00';
    const createdAt = '2026-05-10T17:30:00';
    const res = ZeiterfassungController.checkMilogAufzeichnungsfrist(zeitVon, createdAt);

    assert.equal(res.isLate, false);
    assert.equal(res.statusMilog, 'PUENKTLICH');
    assert.equal(res.diffDays, 0);
    assert.equal(res.warnung, null);
});

test('MiLoG § 17 Abs. 1 - 7-Tage Aufzeichnungsprüfung: Exakt am 7. Kalendertag (Stichtag, pünktlich)', () => {
    // Montag 11. Mai 2026 bis Montag 18. Mai 2026 (exakt 7 Tage)
    const zeitVon = '2026-05-11T07:30:00';
    const createdAt = '2026-05-18T23:59:00';
    const res = ZeiterfassungController.checkMilogAufzeichnungsfrist(zeitVon, createdAt);

    assert.equal(res.isLate, false);
    assert.equal(res.statusMilog, 'PUENKTLICH');
    assert.equal(res.diffDays, 7);
    assert.equal(res.warnung, null);
});

test('MiLoG § 17 Abs. 1 - 7-Tage Aufzeichnungsprüfung: Am 8. Kalendertag (Frist überschritten -> verspätet)', () => {
    // Montag 11. Mai 2026 bis Dienstag 19. Mai 2026 (8 Kalendertage)
    const zeitVon = '2026-05-11T07:30:00';
    const createdAt = '2026-05-19T08:00:00';
    const res = ZeiterfassungController.checkMilogAufzeichnungsfrist(zeitVon, createdAt);

    assert.equal(res.isLate, true);
    assert.equal(res.statusMilog, 'VERSPAETET');
    assert.equal(res.diffDays, 8);
    assert.match(res.warnung, /Achtung: Erfassung erfolgt nach Ablauf der 7-Tage-Frist gem\. § 17 Abs\. 1 MiLoG \(Ordnungswidrigkeit nach § 21 MiLoG\)\./);
});

test('MiLoG § 17 Abs. 2 - 2-jährige Mindestaufbewahrungsfrist Prüfung', () => {
    const referenceDate = new Date('2026-06-01T12:00:00Z');

    // 1 Jahr her (< 24 Monate) -> Aufbewahrung aktiv
    const rec1YearAgo = ZeiterfassungController.checkMilogAufbewahrungsfrist('2025-06-01T08:00:00Z', referenceDate);
    assert.equal(rec1YearAgo.withinRetentionPeriod, true);
    assert.equal(rec1YearAgo.canHardDelete, false);

    // 23 Monate her (< 24 Monate) -> Aufbewahrung aktiv
    const rec23MonthsAgo = ZeiterfassungController.checkMilogAufbewahrungsfrist('2024-07-01T08:00:00Z', referenceDate);
    assert.equal(rec23MonthsAgo.withinRetentionPeriod, true);
    assert.equal(rec23MonthsAgo.canHardDelete, false);

    // 25 Monate her (> 24 Monate) -> Aufbewahrungsfrist abgelaufen
    const rec25MonthsAgo = ZeiterfassungController.checkMilogAufbewahrungsfrist('2024-04-01T08:00:00Z', referenceDate);
    assert.equal(rec25MonthsAgo.withinRetentionPeriod, false);
    assert.equal(rec25MonthsAgo.canHardDelete, true);
});

test('BEG IV Aufbewahrungsfristen (Stand 2025/2026) Konstanten-Validierung', () => {
    assert.ok(AUFBEWAHRUNGSFRISTEN_BEG_IV, 'AUFBEWAHRUNGSFRISTEN_BEG_IV existiert');
    assert.equal(AUFBEWAHRUNGSFRISTEN_BEG_IV.RECHNUNGEN_BUCHUNGSBELEGE.jahre, 8, 'Rechnungsaufbewahrung nach BEG IV verkürzt auf 8 Jahre');
    assert.match(AUFBEWAHRUNGSFRISTEN_BEG_IV.RECHNUNGEN_BUCHUNGSBELEGE.gesetz, /BEG IV/);
    assert.match(AUFBEWAHRUNGSFRISTEN_BEG_IV.RECHNUNGEN_BUCHUNGSBELEGE.gesetz, /§ 147 Abs\. 3 Satz 1 AO n\.F\./);
    assert.equal(AUFBEWAHRUNGSFRISTEN_BEG_IV.BUECHER_INVENTARE_JAHRESABSCHLUESSE.jahre, 10);
    assert.equal(AUFBEWAHRUNGSFRISTEN_BEG_IV.HANDELSBRIEFE_KORRESPONDENZ.jahre, 6);
    assert.equal(AUFBEWAHRUNGSFRISTEN_BEG_IV.B2C_GRUNDSTUECK_BAULEISTUNG.jahre, 2);
    assert.equal(AUFBEWAHRUNGSFRISTEN_BEG_IV.ZEITERFASSUNG_MILOG.jahre, 2);
});

// ---------------------------------------------------------
// DATENBANK- & TRIGGER-TESTS (Schema, SQLite & Electron-Fallback)
// ---------------------------------------------------------

if (!IS_ELECTRON_AS_NODE && !canLoadBetterSqlite()) {
    test('MiLoG DB & Trigger Tests (Delegation an Electron-as-Node Runtime)', async () => {
        const electronBin = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
        assert.ok(fs.existsSync(electronBin), 'Electron Binary muss vorhanden sein');

        const stdout = execFileSync(
            electronBin,
            [path.join(__filename), `--${RUN_INNER_MARKER}`],
            {
                env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '' },
                encoding: 'utf-8',
                maxBuffer: 32 * 1024 * 1024,
                timeout: 60000
            }
        );

        assert.match(stdout, /\[OK\] MiLoG Trigger Sperre erfolgreich getestet/);
        assert.match(stdout, /\[OK\] MiLoG Controller saveZeiteintrag verspaetet persistiert/);
        assert.match(stdout, /\[OK\] Artikel Einheit und GPSR Felder erfolgreich persistiert/);
    });
} else {
    // Läuft entweder direkt oder innerhalb des Electron-Prozesses
    test('MiLoG DB Trigger: trg_prevent_zeiterfassung_early_delete blockiert physisches Löschen innerhalb 2 Jahren', () => {
        const Database = require('better-sqlite3');
        const schema = require('../schema');
        const db = new Database(':memory:');

        schema.createSchema(db);
        schema.ensureGoBDSchemaAndTriggers(db);

        // Mitarbeiter anlegen
        const mRes = db.prepare(`
            INSERT INTO mitarbeiter (personalnummer, vorname, nachname, tarif_stundensatz)
            VALUES ('MA-001', 'Max', 'Mustermann', 25.0)
        `).run();
        const mitarbeiterId = mRes.lastInsertRowid;

        // 1. Eintrag von vor 6 Monaten erstellen
        const recentDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
        const insertStmt = db.prepare(`
            INSERT INTO zeiterfassung (uuid, mitarbeiter_id, zeit_von, zeit_bis, dauer_min, status_milog, is_verspaetet)
            VALUES (?, ?, ?, ?, 480, 'PUENKTLICH', 0)
        `);
        const info = insertStmt.run('uuid-recent-1', mitarbeiterId, recentDate, recentDate);
        const recordId = info.lastInsertRowid;

        // 2. Physisches Löschen per DELETE muss durch SQLite Trigger abgebrochen werden
        assert.throws(() => {
            db.prepare('DELETE FROM zeiterfassung WHERE id = ?').run(recordId);
        }, /§ 17 Abs\. 2 MiLoG/);

        // Datensatz existiert weiterhin
        const row = db.prepare('SELECT id FROM zeiterfassung WHERE id = ?').get(recordId);
        assert.ok(row, 'Datensatz darf nicht physisch gelöscht worden sein');

        // 3. Eintrag von vor 3 Jahren (36 Monate)
        const oldDate = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString();
        const oldInfo = insertStmt.run('uuid-old-1', mitarbeiterId, oldDate, oldDate);
        const oldId = oldInfo.lastInsertRowid;

        // Löschen nach 2 Jahren muss erlaubt sein
        assert.doesNotThrow(() => {
            db.prepare('DELETE FROM zeiterfassung WHERE id = ?').run(oldId);
        });
        const deletedRow = db.prepare('SELECT id FROM zeiterfassung WHERE id = ?').get(oldId);
        assert.equal(deletedRow, undefined, 'Datensatz nach Ablauf der 2 Jahre darf gelöscht werden');

        console.log('[OK] MiLoG Trigger Sperre erfolgreich getestet');
    });

    test('ZeiterfassungController.saveZeiteintrag: Markiert verspätete Einträge und gibt Warnung zurück', () => {
        const Database = require('better-sqlite3');
        const schema = require('../schema');
        const db = new Database(':memory:');

        schema.createSchema(db);
        schema.ensureGoBDSchemaAndTriggers(db);

        const mRes = db.prepare(`
            INSERT INTO mitarbeiter (personalnummer, vorname, nachname, tarif_stundensatz)
            VALUES ('MA-002', 'Anna', 'Schmidt', 28.0)
        `).run();
        const mitarbeiterId = mRes.lastInsertRowid;

        // Vor 10 Tagen gearbeitet -> Überschreitung 7-Tage Frist
        const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
        const entryData = {
            mitarbeiter_id: mitarbeiterId,
            zeit_von: tenDaysAgo,
            zeit_bis: tenDaysAgo,
            dauer_min: 450,
            bemerkung: 'Elektroinstallation Verteiler'
        };

        const loggedActions = [];
        const mockAuditLogger = {
            appendAuditLog: (entry) => {
                loggedActions.push(entry);
            }
        };

        const result = ZeiterfassungController.saveZeiteintrag(db, entryData, mockAuditLogger);

        assert.ok(result.id, 'Eintrag muss gespeichert worden sein');
        assert.equal(result.milog.isLate, true, 'isLate muss true sein');
        assert.equal(result.milog.statusMilog, 'VERSPAETET');
        assert.match(result.warnung, /Achtung: Erfassung erfolgt nach Ablauf der 7-Tage-Frist/);

        // In DB überprüfen
        const saved = db.prepare('SELECT is_verspaetet, status_milog FROM zeiterfassung WHERE id = ?').get(result.id);
        assert.equal(saved.is_verspaetet, 1);
        assert.equal(saved.status_milog, 'VERSPAETET');

        // Audit-Log überprüfen
        const delayWarnLog = loggedActions.find(l => l.action === 'ZEITERFASSUNG_MILOG_DELAY_WARNING');
        assert.ok(delayWarnLog, 'Audit-Log muss ZEITERFASSUNG_MILOG_DELAY_WARNING enthalten');
        assert.equal(delayWarnLog.entityType, 'ZEITERFASSUNG');
        assert.ok(delayWarnLog.details.tage_verspaetung >= 10, 'Tage der Verspätung müssen erfasst sein');
        assert.ok(delayWarnLog.details.zeit_von, 'zeit_von muss protokolliert sein');
        assert.ok(delayWarnLog.details.created_at, 'created_at muss protokolliert sein');

        console.log('[OK] MiLoG Controller saveZeiteintrag verspaetet persistiert');
    });

    test('Artikelstamm: Einheit & GPSR Produktsicherheits-Felder (EU 2023/988) in DB', () => {
        const Database = require('better-sqlite3');
        const schema = require('../schema');
        const db = new Database(':memory:');

        schema.createSchema(db);
        schema.ensureGoBDSchemaAndTriggers(db);

        // Artikel anlegen mit Einheit m² und GPSR-Attributen
        const insertStmt = db.prepare(`
            INSERT INTO artikel (
                name, ek, vk, mwst, bestand, einheit,
                hersteller_name, hersteller_kontakt, charge_seriennummer,
                eu_verantwortlicher, warnhinweis
            ) VALUES (
                'Parkett Eiche Landhausdiele', 45.0, 79.90, 19, 120, 'm²',
                'Bodenwerke GmbH', 'info@bodenwerke.example.com, Holzstr. 4', 'CH-2026-E42',
                'Bodenwerke EU Repräsentanz, Wien', 'Vor Feuchtigkeit schützen. Rutschhemmung R9.'
            )
        `);

        const res = insertStmt.run();
        assert.ok(res.lastInsertRowid);

        const artikel = db.prepare('SELECT * FROM artikel WHERE id = ?').get(res.lastInsertRowid);
        assert.equal(artikel.einheit, 'm²');
        assert.equal(artikel.hersteller_name, 'Bodenwerke GmbH');
        assert.equal(artikel.hersteller_kontakt, 'info@bodenwerke.example.com, Holzstr. 4');
        assert.equal(artikel.charge_seriennummer, 'CH-2026-E42');
        assert.equal(artikel.eu_verantwortlicher, 'Bodenwerke EU Repräsentanz, Wien');
        assert.equal(artikel.warnhinweis, 'Vor Feuchtigkeit schützen. Rutschhemmung R9.');

        console.log('[OK] Artikel Einheit und GPSR Felder erfolgreich persistiert');
    });
}
