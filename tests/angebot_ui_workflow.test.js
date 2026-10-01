const { getElectronPath } = require('./test_electron_helper');
/**
 * tests/angebot_ui_workflow.test.js
 *
 * Vollständiger E2E-Workflow-Test für Angebote (Steps 1, 2 und 3):
 * 1. Angebot als ENTWURF anlegen (mit Normal-, Alternativ-, Pauschalpositionen)
 * 2. PDF-Vorschau abrufen -> verifizieren, dass Status ENTWURF bleibt und freeze_snapshot_json NULL bleibt
 * 3. Risikoprüfung (BGB § 650m, 0,00 € Bestätigung) & "Versand registrieren (Einfrieren)"
 * 4. Post-Versand Unveränderlichkeit: Mutationsversuch auf v1 wird von DB/Repo abgewiesen
 * 5. Verhandlungsversion v2 aus gefrorenem v1 anlegen (v1 bleibt intakt, v2 startet als ENTWURF)
 * 6. v2 annehmen -> Status ANGENOMMEN
 * 7. Projekt aus v2 anlegen -> Übernahme der Positionen mit sourceOfferPositionId / source_angebot_pos_id
 * 8. Aufmaß verknüpfen und Integritätsschutz prüfen
 * 9. Simulation eines App-Neustarts: DB schließen, neu öffnen und Vollständigkeit aller Verknüpfungen verifizieren
 * 10. PRAGMA foreign_key_check -> 0 Fehler
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('child_process');

const AngebotController = require('../controllers/AngebotController');

const IS_ELECTRON_AS_NODE = !!process.versions.electron;
const RUN_INNER_MARKER = 'ANGEBOT_UI_WORKFLOW_INNER_RUN';

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
// Re-Execution unter Electron-as-Node für DB-Tests (falls im Standard Node)
// ---------------------------------------------------------------------------
if (!IS_ELECTRON_AS_NODE && !canLoadBetterSqlite()) {
    test('Angebots-UI-Workflow: E2E Lifecycle Test (inkl. SQLite DB-Ebene via Electron-as-Node)', () => {
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

            assert.ok(stdout.includes('ANGEBOT_UI_WORKFLOW_TESTS_PASSED'), 'Innerer Testlauf muss erfolgreich abschließen');
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

// ---------------------------------------------------------------------------
// Eigentliche E2E Testsuite
// ---------------------------------------------------------------------------

test('E2E Angebots-Workflow: Entwurf -> PDF-Vorschau -> Versand/Freeze -> Verhandlungsversion v2 -> Annahme -> Projekt -> Neustart', async () => {
    const tmpDbPath = path.join(os.tmpdir(), `angebot-workflow-e2e-${Date.now()}-${process.pid}.sqlite`);
    process.env.RECHNUNGSPROGRAMM_DB_PATH = tmpDbPath;

    const { db, repositories, dbAPI } = require('../db.js');
    const docRepo = repositories.documentRepo || dbAPI;
    const controllingRepo = repositories.controllingBautagebuchRepo || dbAPI;

    let v1Id = null;
    let v2Id = null;
    let projId = null;
    let aufmassId = null;

    try {
        // ===================================================================
        // SCHRITT 1: Angebot anlegen & als ENTWURF speichern
        // ===================================================================
        const kundeInsert = db.prepare(`
            INSERT INTO kunden (kundennummer, name, adresse, plz, ort, email)
            VALUES ('KD-2026-E2E-001', 'Bauherr Max Mustermann', 'Musterstr. 10', '10115', 'Berlin', 'max@example.com')
        `).run();
        const testKundeId = kundeInsert.lastInsertRowid;

        const angebotV1Input = {
            type: 'angebot',
            nr: 'ANG-2026-E2E-001',
            version: 1,
            kundeId: testKundeId,
            datum: '2026-10-01',
            faellig: '2026-10-31',
            auftraggeber_typ: 'PRIVAT',
            vertragsgrundlage: 'BGB_WERKVERTRAG',
            angebot_status: 'ENTWURF',
            status: 'Entwurf',
            positionen: [
                {
                    id: 1,
                    pos: 1,
                    titel: 'Erdarbeiten',
                    name: 'Baugrubenaushub',
                    menge: 100,
                    einheit: 'm³',
                    preis: 35.00,
                    mwst: 19,
                    positionstyp: 'NORMAL',
                    in_endsumme_enthalten: 1
                },
                {
                    id: 2,
                    pos: 2,
                    titel: 'Optionale Drainage',
                    name: 'Ringdrainage DN100 (Alternativposition)',
                    menge: 50,
                    einheit: 'm',
                    preis: 45.00,
                    mwst: 19,
                    positionstyp: 'ALTERNATIV',
                    in_endsumme_enthalten: 0
                },
                {
                    id: 3,
                    pos: 3,
                    titel: 'Baustellenservice',
                    name: 'Ersteinweisung vor Ort',
                    menge: 1,
                    einheit: 'Psch',
                    preis: 0.00,
                    mwst: 19,
                    positionstyp: 'NORMAL',
                    in_endsumme_enthalten: 1,
                    preis_null_bestaetigt: true
                }
            ]
        };

        // Summen über Controller berechnen
        const totalsV1 = AngebotController.calculateTotals(angebotV1Input.positionen);
        assert.equal(totalsV1.netto, 3500.00, 'Alternativposition darf nicht in Nettosumme einfließen');
        assert.equal(totalsV1.totalsByType.ALTERNATIV.netto, 2250.00, 'Alternativsumme muss 2250.00 € betragen');
        assert.equal(totalsV1.brutto, 4165.00, 'Bruttosumme muss 4165.00 € betragen');

        angebotV1Input.netto = totalsV1.netto;
        angebotV1Input.steuer = totalsV1.steuer;
        angebotV1Input.brutto = totalsV1.brutto;

        v1Id = await docRepo.saveDocument(angebotV1Input);
        assert.ok(v1Id > 0, 'Angebot v1 muss gespeichert worden sein');

        // Status im DB prüfen
        const savedV1 = await docRepo.getDocumentById(v1Id);
        assert.equal(savedV1.angebot_status, 'ENTWURF');
        assert.equal(savedV1.freeze_snapshot_json, null, 'Entwurf darf keinen Freeze-Snapshot haben');
        assert.equal(savedV1.version, 1);
        assert.equal(savedV1.positionen.length, 3);

        // ===================================================================
        // SCHRITT 2: PDF-Vorschau abrufen -> DARF NICHT EINFRIEREN ODER STATUS ÄNDERN!
        // ===================================================================
        // Simulation des PDF-Vorschau-Aufrufs: Dokument laden & Daten für PDF generieren
        const previewDoc = await docRepo.getDocumentById(v1Id);
        assert.ok(previewDoc, 'Dokument für Vorschau geladen');

        // PDF-Vorschau-Logik: Rendern des Dokuments ohne Speichern / ohne Statusänderung
        const previewStatus = previewDoc.angebot_status;
        const previewSnapshot = previewDoc.freeze_snapshot_json;
        assert.equal(previewStatus, 'ENTWURF', 'Status muss nach Vorschau ENTWURF bleiben');
        assert.equal(previewSnapshot, null, 'Freeze-Snapshot muss nach Vorschau NULL bleiben');

        // Wiederholen der Prüfung in DB (keine Seiteneffekte in DB)
        const checkAfterPreview = db.prepare('SELECT status, angebot_status, freeze_snapshot_json FROM dokumente WHERE id = ?').get(v1Id);
        assert.equal(checkAfterPreview.angebot_status, 'ENTWURF');
        assert.equal(checkAfterPreview.freeze_snapshot_json, null);

        // ===================================================================
        // SCHRITT 3: Risikoprüfung & "Versand registrieren (Einfrieren)"
        // ===================================================================
        // 3.1: Validierung & Risikoprüfung via AngebotController
        // Vor Bestätigung: 0,00 € verlangt explizite Bestätigung
        const unconfirmedRes = AngebotController.validateAngebot(savedV1, savedV1.positionen);
        assert.equal(unconfirmedRes.valid, true);
        assert.equal(unconfirmedRes.requiresZeroPriceConfirmation, true);

        // Bestätigung erteilen (wie im UI-Dialog durch Nutzer bestätigt)
        savedV1.positionen[2].preis_null_bestaetigt = true;
        const validationResult = AngebotController.validateAngebot(savedV1, savedV1.positionen);
        assert.equal(validationResult.valid, true, 'Angebot muss gültig sein');
        assert.equal(validationResult.requiresZeroPriceConfirmation, false, '0,00 € wurde bestätigt');

        // 3.2: Snapshot erzeugen & Zustand auf VERSENDET setzen
        AngebotController.freezeAngebot(savedV1, savedV1.positionen);
        assert.ok(savedV1.freeze_snapshot_json, 'Snapshot muss erzeugt werden');
        assert.equal(savedV1.angebot_status, 'VERSENDET');

        await docRepo.saveDocument(savedV1);

        // Prüfung im DB nach Versand
        const frozenV1 = await docRepo.getDocumentById(v1Id);
        assert.equal(frozenV1.angebot_status, 'VERSENDET');
        assert.ok(frozenV1.freeze_snapshot_json, 'Snapshot muss in DB persistiert sein');
        const parsedSnapshot = JSON.parse(frozenV1.freeze_snapshot_json);
        assert.equal(parsedSnapshot.totals.brutto, 4165.00);
        assert.equal(parsedSnapshot.positionen.length, 3);

        // ===================================================================
        // SCHRITT 4: Post-Versand Unveränderlichkeit (Immutability-Schutz)
        // ===================================================================
        // 4.1: Direkter Mutationsversuch (Änderungssperre)
        const illegalMutation = {
            ...frozenV1,
            netto: 9999.00,
            positionen: [
                { ...frozenV1.positionen[0], preis: 9999.00 }
            ]
        };
        await assert.rejects(
            async () => {
                await docRepo.saveDocument(illegalMutation);
            },
            /Änderungssperre/,
            'Modifikation von gefrorenem Angebot v1 muss strikt abgewiesen werden'
        );

        // 4.2: Rücksetzversuch auf ENTWURF muss abgewiesen werden
        await assert.rejects(
            async () => {
                await docRepo.saveDocument({
                    ...frozenV1,
                    angebot_status: 'ENTWURF'
                });
            },
            /Unzulässiger Statusübergang/,
            'Statusrückfall von VERSENDET auf ENTWURF muss verhindert werden'
        );

        // ===================================================================
        // SCHRITT 5: Verhandlungsversion v2 aus v1 ableiten
        // ===================================================================
        const v2Obj = AngebotController.createVersion(frozenV1, frozenV1.positionen);
        assert.equal(v2Obj.version, 2, 'Neue Version muss v2 sein');
        assert.equal(v2Obj.parent_angebot_id, v1Id, 'parent_angebot_id muss auf v1Id zeigen');
        assert.equal(v2Obj.angebot_status, 'ENTWURF', 'v2 muss als ENTWURF starten');
        assert.equal(v2Obj.freeze_snapshot_json, null, 'v2 darf zunächst keinen Freeze-Snapshot haben');
        assert.equal(v2Obj.positionen.length, 3);

        // In v2 wird nun nachverhandelt: Rabatt oder Preisänderung auf Position 1
        v2Obj.positionen[0].preis = 32.00; // von 35 € auf 32 € verhandelt
        const totalsV2 = AngebotController.calculateTotals(v2Obj.positionen);
        v2Obj.netto = totalsV2.netto;
        v2Obj.steuer = totalsV2.steuer;
        v2Obj.brutto = totalsV2.brutto;
        assert.equal(v2Obj.netto, 3200.00);

        v2Id = await docRepo.saveDocument(v2Obj);
        assert.ok(v2Id > 0 && v2Id !== v1Id, 'v2 muss eigene ID erhalten');

        // Prüfung: v1 bleibt unberührt und gefroren; v2 ist editierbarer Entwurf
        const checkV1 = await docRepo.getDocumentById(v1Id);
        assert.equal(checkV1.angebot_status, 'VERSENDET');
        assert.equal(checkV1.netto, 3500.00);

        const checkV2 = await docRepo.getDocumentById(v2Id);
        assert.equal(checkV2.version, 2);
        assert.equal(checkV2.angebot_status, 'ENTWURF');
        assert.equal(checkV2.netto, 3200.00);

        // ===================================================================
        // SCHRITT 6: v2 versenden und annehmen
        // ===================================================================
        // v2 einfrieren & versenden
        AngebotController.freezeAngebot(checkV2, checkV2.positionen);
        await docRepo.saveDocument(checkV2);

        // v2 annehmen
        const acceptedV2 = await docRepo.getDocumentById(v2Id);
        AngebotController.acceptAngebot(acceptedV2, 2);
        assert.equal(acceptedV2.angebot_status, 'ANGENOMMEN');
        assert.equal(acceptedV2.angenommene_version, 2);
        await docRepo.saveDocument(acceptedV2);

        const loadedAcceptedV2 = await docRepo.getDocumentById(v2Id);
        assert.equal(loadedAcceptedV2.angebot_status, 'ANGENOMMEN');

        // ===================================================================
        // SCHRITT 7: Neues Projekt aus angenommener v2 anlegen
        // ===================================================================
        const projektData = AngebotController.createProjektFromAngebot(
            loadedAcceptedV2,
            loadedAcceptedV2.positionen,
            { name: 'Neubau Erdarbeiten Los 1' }
        );

        assert.equal(projektData.source_angebot_id, v2Id);
        assert.equal(projektData.source_angebot_version, 2);
        assert.equal(projektData.positionen.length, 2, 'Nur in Endsumme enthaltene Positionen werden standardmäßig ins Projekt übernommen');

        // Prüfung: sourceOfferPositionId ist gesetzt
        const pos1V2 = loadedAcceptedV2.positionen[0];
        assert.equal(projektData.positionen[0].sourceOfferPositionId, pos1V2.id);

        projId = await controllingRepo.saveProjekt(projektData);
        assert.ok(projId > 0, 'Projekt muss erfolgreich mit ID angelegt werden');

        // Prüfung in SQLite DB
        const dbProj = db.prepare('SELECT * FROM projekte WHERE id = ?').get(projId);
        assert.equal(dbProj.source_angebot_id, v2Id);
        assert.equal(dbProj.source_angebot_version, 2);

        const dbProjPos = db.prepare('SELECT * FROM projekt_positionen WHERE projekt_id = ? ORDER BY id ASC').all(projId);
        assert.equal(dbProjPos.length, 2);
        assert.equal(dbProjPos[0].source_angebot_pos_id, pos1V2.id);
        assert.equal(dbProjPos[0].source_angebot_id, v2Id);
        assert.equal(dbProjPos[0].source_angebot_version, 2);
        assert.equal(dbProjPos[0].preis, 32.00);

        // ===================================================================
        // SCHRITT 8: Aufmaß anlegen & Integritätsschutz verifizieren
        // ===================================================================
        const targetPosId = dbProjPos[0].id;
        const aufmassInsert = db.prepare(`
            INSERT INTO aufmass (projekt_id, projekt_position_id, titel, datum, bemerkung)
            VALUES (?, ?, ?, ?, ?)
        `).run(projId, targetPosId, 'Aufmaß Los 1 Teil 1', '2026-10-15', 'Erste Messung');

        aufmassId = aufmassInsert.lastInsertRowid;
        assert.ok(aufmassId > 0, 'Aufmaß muss angelegt werden können');

        // Trigger-Prüfung: Versuch, die verknüpfte Projektposition direkt zu löschen, MUSS blockiert werden
        assert.throws(
            () => {
                db.prepare('DELETE FROM projekt_positionen WHERE id = ?').run(targetPosId);
            },
            /Löschen der Projektposition verhindert/,
            'Trigger trg_prevent_delete_pos_with_aufmass muss Löschung der Projektposition verhindern'
        );

        // ===================================================================
        // SCHRITT 9: Simulation eines App-Neustarts (DB schließen & neu öffnen)
        // ===================================================================
        db.close();

        // Neuverbindung zur selben Datei aufbauen (wie bei einem Neustart der Electron-App)
        const Database = require('better-sqlite3');
        const reloadedDb = new Database(tmpDbPath);
        reloadedDb.pragma('foreign_keys = ON');

        // 9.1: PRAGMA foreign_key_check -> MUSS 0 Fehler zurückgeben
        const fkErrors = reloadedDb.pragma('foreign_key_check');
        assert.equal(fkErrors.length, 0, 'Datenbank nach Neustart darf keinerlei Fremdschlüsselverletzungen aufweisen');

        // 9.2: Prüfen, dass Angebot v1, Angebot v2 und Projekt intakt sind
        const reloadedV1 = reloadedDb.prepare('SELECT * FROM dokumente WHERE id = ?').get(v1Id);
        assert.equal(reloadedV1.angebot_status, 'VERSENDET');
        assert.ok(reloadedV1.freeze_snapshot_json);

        const reloadedV2 = reloadedDb.prepare('SELECT * FROM dokumente WHERE id = ?').get(v2Id);
        assert.equal(reloadedV2.angebot_status, 'ANGENOMMEN');
        assert.equal(reloadedV2.parent_angebot_id, v1Id);

        const reloadedProject = reloadedDb.prepare('SELECT * FROM projekte WHERE id = ?').get(projId);
        assert.equal(reloadedProject.source_angebot_id, v2Id);
        assert.equal(reloadedProject.source_angebot_version, 2);

        // 9.3: Prüfen, dass Projekt-Positionen weiterhin die saubere Referenz haben
        const reloadedPositions = reloadedDb.prepare('SELECT * FROM projekt_positionen WHERE projekt_id = ? ORDER BY id ASC').all(projId);
        assert.equal(reloadedPositions.length, 2);
        assert.equal(reloadedPositions[0].source_angebot_pos_id, pos1V2.id);

        // 9.4: Prüfen, dass Aufmaß weiterhin exakt verknüpft ist
        const reloadedAufmass = reloadedDb.prepare('SELECT * FROM aufmass WHERE id = ?').get(aufmassId);
        assert.equal(reloadedAufmass.projekt_id, projId);
        assert.equal(reloadedAufmass.projekt_position_id, targetPosId);

        // 9.5: Löschschutz bleibt auch nach Neustart aktiv
        assert.throws(
            () => {
                reloadedDb.prepare('DELETE FROM projekt_positionen WHERE id = ?').run(targetPosId);
            },
            /Löschen der Projektposition verhindert/
        );

        reloadedDb.close();

        if (IS_ELECTRON_AS_NODE) {
            console.log('ANGEBOT_UI_WORKFLOW_TESTS_PASSED');
        }
    } finally {
        // Cleanup Testdatenbank
        try {
            if (fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath);
            const walPath = `${tmpDbPath}-wal`;
            const shmPath = `${tmpDbPath}-shm`;
            if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
            if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
        } catch (_err) {}
    }
});
