/**
 * tests/angebot_lifecycle.test.js - Vollständiger Lebenszyklus-Test für den neuen Angebots-Kern
 *
 * Tests:
 * 1. Summenberechnung mit Normal-, Alternativ- und Bedarfspositionen
 * 2. Freeze-Mechanismus (Snapshot unveränderlich bei Versand)
 * 3. Versionierung (v2 erzeugen aus gefrorenem v1, v1 bleibt intakt)
 * 4. Annahme von v1 und Projektanlage mit sourceOfferPositionId
 * 5. Risikoprüfung (Fehlender Preis vs. 0,00 € Bestätigung vs. § 650m BGB Hinweis)
 * 6. DB-Persistenz im SQLite Test-DB über document_repo
 * 7. String "0" vs "1" Test & einheitliche Normalisierung von in_endsumme_enthalten
 * 8. Stabile Identität bei Projekt-Updates (Kein ID-Wechsel)
 * 9. Verhindern von Doppel-Projektanlagen (Idempotenz / Double-Click Guard & NULL-Version Unique-Check)
 * 10. Legacy-DB Migrationstest & Altdaten-Duplikatbereinigung vor Index-Erstellung
 * 11. Stabile Aufmaß-Referenz & Löschschutz für verknüpfte Aufmaße (Aufmaß-Integritätsschutz)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('child_process');

const AngebotController = require('../controllers/AngebotController');

const IS_ELECTRON_AS_NODE = !!process.versions.electron;
const RUN_INNER_MARKER = 'ANGEBOT_LIFECYCLE_INNER_RUN';

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
    test('Angebots-Lebenszyklus: Alle Tests (inkl. SQLite DB-Ebene via Electron-as-Node)', () => {
        const electronBin = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
        assert.ok(fs.existsSync(electronBin), 'Electron-Binary muss als Node-Runtime verfügbar sein');

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

        assert.ok(stdout.includes('ANGEBOT_LIFECYCLE_TESTS_PASSED'), 'Innerer Testlauf muss erfolgreich abschließen');
    });
    return;
}

// ---------------------------------------------------------------------------
// Eigentliche Testsuite (läuft entweder direkt oder im Electron-as-Node-Modus)
// ---------------------------------------------------------------------------

test('Test 1: Summenberechnung mit Normal-, Alternativ- und Bedarfspositionen', () => {
    const positionen = [
        {
            titel: 'Rohbauarbeiten',
            name: 'Mauerwerk d=24cm',
            menge: 10,
            preis: 50.00,
            mwst: 19,
            positionstyp: 'NORMAL',
            in_endsumme_enthalten: 1
        },
        {
            titel: 'Baustelleneinrichtung',
            name: 'Container Pauschale',
            menge: 1,
            preis: 200.00,
            mwst: 19,
            positionstyp: 'PAUSCHALE',
            in_endsumme_enthalten: 1
        },
        {
            titel: 'Optionale Fassadendämmung',
            name: 'WDVS 160mm WLG 032 (Alternativangebot)',
            menge: 5,
            preis: 80.00,
            mwst: 19,
            positionstyp: 'ALTERNATIV',
            in_endsumme_enthalten: 0
        },
        {
            titel: 'Zusatzleistungen',
            name: 'Stemmarbeiten nach Aufwand (Bedarfsposition)',
            menge: 2,
            preis: 60.00,
            mwst: 19,
            positionstyp: 'BEDARF',
            in_endsumme_enthalten: 0
        },
        {
            titel: 'Garten / Außenanlagen',
            name: 'Pflanzenlieferung (7% MwSt)',
            menge: 2,
            preis: 100.00,
            mwst: 7,
            positionstyp: 'NORMAL',
            in_endsumme_enthalten: 1
        }
    ];

    const totals = AngebotController.calculateTotals(positionen);

    // Endsumme darf NUR Normal und Pauschale enthalten:
    // Pos 1 (Normal 19%): 10 * 50 = 500 €
    // Pos 2 (Pauschale 19%): 1 * 200 = 200 €
    // Pos 5 (Normal 7%): 2 * 100 = 200 €
    // Summe Netto in Endsumme = 500 + 200 + 200 = 900.00 €
    assert.equal(totals.netto, 900.00, 'Endsumme Netto muss exakt 900.00 € betragen');

    // Steuern: 19% auf 700 € = 133.00 €, 7% auf 200 € = 14.00 € -> 147.00 €
    assert.equal(totals.steuer, 147.00, 'Endsumme Steuer muss 147.00 € betragen');
    assert.equal(totals.brutto, 1047.00, 'Endsumme Brutto muss 1047.00 € betragen');

    // Getrennte Summen nach Positionstyp:
    assert.equal(totals.totalsByType.NORMAL.netto, 700.00, 'NORMAL Netto muss 700.00 € sein');
    assert.equal(totals.totalsByType.PAUSCHALE.netto, 200.00, 'PAUSCHALE Netto muss 200.00 € sein');
    assert.equal(totals.totalsByType.ALTERNATIV.netto, 400.00, 'ALTERNATIV Netto (5 * 80) muss 400.00 € sein');
    assert.equal(totals.totalsByType.BEDARF.netto, 120.00, 'BEDARF Netto (2 * 60) muss 120.00 € sein');

    // MwSt-Aufschlüsselung:
    assert.equal(totals.taxBreakdown['19'].base, 700.00);
    assert.equal(totals.taxBreakdown['19'].tax, 133.00);
    assert.equal(totals.taxBreakdown['7'].base, 200.00);
    assert.equal(totals.taxBreakdown['7'].tax, 14.00);

    // Wenn eine ALTERNATIV-Position explizit in die Endsumme gewählt wird:
    const posWithChosenAlt = [
        ...positionen.slice(0, 2),
        { ...positionen[2], in_endsumme_enthalten: 1 } // Alternativ gewählt!
    ];
    const totalsWithAlt = AngebotController.calculateTotals(posWithChosenAlt);
    assert.equal(totalsWithAlt.netto, 1100.00, 'Gewählte Alternativposition muss in Netto enthalten sein (500 + 200 + 400 = 1100)');
});

test('Test 2: Freeze-Mechanismus (Snapshot unveränderlich bei Versand)', () => {
    const angebot = {
        id: 42,
        nr: 'ANG-2026-0042',
        version: 1,
        auftraggeber_typ: 'GEWERBLICH',
        vergabe_verfahren: 'DIREKT',
        vertragsgrundlage: 'VOB_B',
        datum: '2026-09-27',
        faellig: '2026-10-31',
        vortext: 'Sehr geehrte Damen und Herren...',
        skonto_tage: 14,
        skonto_prozent: 2.0
    };

    const positionen = [
        { id: 101, titel: 'Titel 1', name: 'Beton C25/30', menge: 20, preis: 120.00, mwst: 19, positionstyp: 'NORMAL' },
        { id: 102, titel: 'Titel 1', name: 'Bewehrungsstahl', menge: 1500, preis: 1.50, mwst: 19, positionstyp: 'NORMAL' }
    ];

    const frozen = AngebotController.freezeAngebot(angebot, positionen);

    assert.equal(frozen.angebot_status, 'VERSENDET', 'Status muss VERSENDET sein');
    assert.ok(frozen.freeze_snapshot_json, 'freeze_snapshot_json muss befüllt sein');

    const snapshot = JSON.parse(frozen.freeze_snapshot_json);
    assert.equal(snapshot.version, 1);
    assert.equal(snapshot.angebot_nr, 'ANG-2026-0042');
    assert.equal(snapshot.vertragsgrundlage, 'VOB_B');
    assert.equal(snapshot.auftraggeber_typ, 'GEWERBLICH');
    assert.equal(snapshot.positionen.length, 2);
    assert.equal(snapshot.totals.netto, 20 * 120 + 1500 * 1.50); // 2400 + 2250 = 4650
    assert.equal(snapshot.konditionen.skonto_prozent, 2.0);
    assert.ok(snapshot.frozen_at, 'frozen_at Zeitstempel muss gesetzt sein');

    // Mutation der übergebenen Positionen darf den bereits serialisierten Snapshot nicht verändern
    positionen[0].preis = 99999;
    const reParsed = JSON.parse(frozen.freeze_snapshot_json);
    assert.equal(reParsed.positionen[0].preis, 120.00, 'Snapshot muss unveränderlich 120.00 € behalten');
});

test('Test 3: Versionierung (v2 erzeugen aus gefrorenem v1, v1 bleibt intakt)', () => {
    const originalV1 = {
        id: 10,
        nr: 'ANG-2026-001',
        version: 1,
        angebot_status: 'VERSENDET',
        status: 'VERSENDET',
        auftraggeber_typ: 'PRIVAT',
        vertragsgrundlage: 'BGB_WERKVERTRAG',
        freeze_snapshot_json: JSON.stringify({
            version: 1,
            positionen: [
                { id: 501, name: 'Dachstuhl errichten', menge: 1, preis: 8000.00, mwst: 19, positionstyp: 'NORMAL', in_endsumme_enthalten: 1 }
            ]
        })
    };

    const v2 = AngebotController.createVersion(originalV1);

    // Prüfe neue Version v2
    assert.equal(v2.version, 2, 'Version muss inkrementiert sein (v2)');
    assert.equal(v2.parent_angebot_id, 10, 'parent_angebot_id muss auf v1.id zeigen');
    assert.equal(v2.angebot_status, 'ENTWURF', 'Neue Version muss im Status ENTWURF starten');
    assert.equal(v2.freeze_snapshot_json, null, 'Neuer Entwurf darf noch keinen Freeze-Snapshot haben');
    assert.equal(v2.id, undefined, 'Neue Version muss eine neue ID in der DB bekommen');
    assert.equal(v2.nr, 'ANG-2026-001-V2', 'Belegnummer muss Versionssuffix tragen');
    assert.equal(v2.positionen.length, 1);
    assert.equal(v2.positionen[0].preis, 8000.00);

    // Prüfe, dass v1 unverändert geblieben ist
    assert.equal(originalV1.version, 1);
    assert.equal(originalV1.angebot_status, 'VERSENDET');
    assert.ok(originalV1.freeze_snapshot_json);

    // Mutation in v2 verändert v1 nicht
    v2.positionen[0].preis = 9500.00;
    const v1Parsed = JSON.parse(originalV1.freeze_snapshot_json);
    assert.equal(v1Parsed.positionen[0].preis, 8000.00);
});

test('Test 4: Annahme von v1 und Projektanlage mit sourceOfferPositionId', () => {
    const v1Angebot = {
        id: 77,
        nr: 'ANG-2026-077',
        version: 1,
        angebot_status: 'VERSENDET',
        auftraggeber_typ: 'GEWERBLICH',
        vertragsgrundlage: 'VOB_B',
        kundeId: 5
    };

    const offerPositions = [
        { id: 1001, titel: 'Erdarbeiten', name: 'Baugrube ausheben', menge: 250, einheit: 'm³', preis: 28.00, mwst: 19, positionstyp: 'NORMAL', in_endsumme_enthalten: 1 },
        { id: 1002, titel: 'Erdarbeiten', name: 'Boden abfahren', menge: 250, einheit: 'm³', preis: 18.00, mwst: 19, positionstyp: 'NORMAL', in_endsumme_enthalten: 1 }
    ];

    AngebotController.freezeAngebot(v1Angebot, offerPositions);

    // Annahme
    AngebotController.acceptAngebot(v1Angebot, 1);
    assert.equal(v1Angebot.angebot_status, 'ANGENOMMEN');
    assert.equal(v1Angebot.angenommene_version, 1);
    assert.ok(v1Angebot.angenommen_am, 'angenommen_am muss befüllt sein');

    // Projektanlage aus angenommenem Angebot
    const projekt = AngebotController.createProjektFromAngebot(v1Angebot, offerPositions, {
        name: 'Neubau Gewerbehalle Nord'
    });

    assert.equal(projekt.source_angebot_id, 77, 'source_angebot_id muss 77 sein');
    assert.equal(projekt.source_angebot_version, 1, 'source_angebot_version muss 1 sein');
    assert.equal(projekt.kundeId, 5);
    assert.equal(projekt.name, 'Neubau Gewerbehalle Nord');
    assert.equal(projekt.status, 'BEAUFTRAGT');
    assert.equal(projekt.budget, 250 * 28 + 250 * 18); // 7000 + 4500 = 11500

    assert.equal(projekt.positionen.length, 2);

    // Stabile Positionsreferenz: EIGENE IDs für Projektpositionen, Original-ID als sourceOfferPositionId
    const pos1 = projekt.positionen[0];
    const pos2 = projekt.positionen[1];

    assert.notEqual(pos1.id, 1001, 'Projektposition darf NICHT die gleiche ID wie die Angebotsposition haben');
    assert.equal(pos1.sourceOfferPositionId, 1001, 'sourceOfferPositionId muss exakt auf die Angebotspositions-ID verweisen');
    assert.equal(pos2.sourceOfferPositionId, 1002, 'sourceOfferPositionId muss exakt auf die Angebotspositions-ID verweisen');
    assert.notEqual(pos1.id, pos2.id, 'Jede Projektposition muss eine eindeutige eigene ID besitzen');
});

test('Test 5: Risikoprüfung (Fehlender Preis vs. 0,00 € Bestätigung vs. § 650m BGB Hinweis)', () => {
    // 5.1: Fehlender Preis
    const resFehlend = AngebotController.validateAngebot(
        { datum: '2026-09-27', faellig: '2026-10-31' },
        [
            { name: 'Gültige Position', preis: 45.00, menge: 2 },
            { name: 'Unvollständige Position', preis: null, menge: 1 },
            { name: 'Leere Preis-Position', preis: '', menge: 1 }
        ]
    );
    assert.equal(resFehlend.valid, false, 'Angebot mit fehlendem Preis darf nicht valide sein');
    const missingPriceErrors = resFehlend.errors.filter(e => e.code === 'FEHLENDER_PREIS');
    assert.equal(missingPriceErrors.length, 2, 'Es müssen 2 FEHLENDER_PREIS Fehler gemeldet werden');

    // 5.2: 0,00 € Preis ohne Bestätigung (Warnung, kein generelles Verbot!)
    const resNullUnbestaetigt = AngebotController.validateAngebot(
        { datum: '2026-09-27', faellig: '2026-10-31' },
        [
            { name: 'Kostenlose Beratung', preis: 0.00, menge: 1, preis_null_bestaetigt: false }
        ]
    );
    assert.equal(resNullUnbestaetigt.valid, true, '0,00 € ist kein Blocker/Verbot');
    assert.equal(resNullUnbestaetigt.requiresZeroPriceConfirmation, true);
    assert.ok(resNullUnbestaetigt.warnings.some(w => w.code === 'PREIS_NULL_BESTAETIGUNG'));

    // 5.3: 0,00 € Preis MIT Bestätigung
    const resNullBestaetigt = AngebotController.validateAngebot(
        { datum: '2026-09-27', faellig: '2026-10-31' },
        [
            { name: 'Kostenlose Beratung', preis: 0.00, menge: 1, preis_null_bestaetigt: true }
        ]
    );
    assert.equal(resNullBestaetigt.valid, true);
    assert.equal(resNullBestaetigt.requiresZeroPriceConfirmation, false);
    assert.equal(resNullBestaetigt.warnings.filter(w => w.code === 'PREIS_NULL_BESTAETIGUNG').length, 0);

    // 5.4: BGB § 650m Hinweis bei Verbraucherbauvertrag (BGH VII ZR 94/22 beachtend)
    const resVerbraucherbau = AngebotController.validateAngebot(
        { datum: '2026-09-27', faellig: '2026-10-31', vertragsgrundlage: 'BGB_VERBRAUCHERBAU' },
        [{ name: 'Schlüsselfertiges Haus', preis: 350000.00, menge: 1 }]
    );
    const hinweis650m = resVerbraucherbau.hinweise.find(h => h.code === 'BGB_650M_HINWEIS');
    assert.ok(hinweis650m, 'BGB § 650m Hinweis muss vorhanden sein');
    assert.ok(hinweis650m.message.includes('90 %'), 'Muss 90% Obergrenze Abschlagszahlung erwähnen');
    assert.ok(hinweis650m.message.includes('5 %'), 'Muss 5% Sicherheitsleistung erwähnen');

    // Bei Standard BGB_WERKVERTRAG darf der Hinweis nicht erscheinen
    const resWerkvertrag = AngebotController.validateAngebot(
        { datum: '2026-09-27', faellig: '2026-10-31', vertragsgrundlage: 'BGB_WERKVERTRAG' },
        [{ name: 'Malerarbeiten', preis: 2500.00, menge: 1 }]
    );
    assert.equal(resWerkvertrag.hinweise.filter(h => h.code === 'BGB_650M_HINWEIS').length, 0);

    // 5.5: Bindefrist-Prüfung
    const resOhneFrist = AngebotController.validateAngebot(
        { datum: '2026-09-27' },
        [{ name: 'Leistung', preis: 100.00, menge: 1 }]
    );
    assert.ok(resOhneFrist.warnings.some(w => w.code === 'BINDEFRIST_FEHLT'));

    const resUnplausibel = AngebotController.validateAngebot(
        { datum: '2026-09-27', faellig: '2026-09-01' },
        [{ name: 'Leistung', preis: 100.00, menge: 1 }]
    );
    assert.ok(resUnplausibel.warnings.some(w => w.code === 'BINDEFRIST_UNPLAUSIBEL'));
});

test('Test 6: DB-Persistenz im SQLite Test-DB über document_repo', async () => {
    // Isolierte Testdatenbank anlegen
    const tmpDbPath = path.join(os.tmpdir(), `angebot-lifecycle-test-${Date.now()}-${process.pid}.sqlite`);
    process.env.RECHNUNGSPROGRAMM_DB_PATH = tmpDbPath;

    const { db, repositories, dbAPI } = require('../db.js');
    const docRepo = repositories.documentRepo || dbAPI;

    try {
        // 6.1: Angebot im Entwurf anlegen
        const angebotsDaten = {
            type: 'angebot',
            nr: 'ANG-DB-2026-001',
            version: 1,
            angebot_status: 'ENTWURF',
            status: 'Entwurf',
            auftraggeber_typ: 'PRIVAT',
            vergabe_verfahren: 'DIREKT',
            vertragsgrundlage: 'BGB_WERKVERTRAG',
            datum: '2026-09-27',
            faellig: '2026-10-31',
            netto: 1500.00,
            steuer: 285.00,
            brutto: 1785.00,
            positionen: [
                {
                    titel: 'Fliesenlegerarbeiten',
                    name: 'Bodenfliesen Feinsteinzeug',
                    menge: 30,
                    einheit: 'm²',
                    preis: 50.00,
                    mwst: 19,
                    positionstyp: 'NORMAL',
                    in_endsumme_enthalten: 1,
                    bieterangabe_wert: 'Villeroy & Boch 60x60'
                },
                {
                    titel: 'Fliesenlegerarbeiten',
                    name: 'Marmor-Bordüre (Alternativ)',
                    menge: 15,
                    einheit: 'm',
                    preis: 40.00,
                    mwst: 19,
                    positionstyp: 'ALTERNATIV',
                    in_endsumme_enthalten: 0,
                    bieterangabe_wert: null
                }
            ]
        };

        const docId = await docRepo.saveDocument(angebotsDaten);
        assert.ok(docId > 0, 'Dokument muss erfolgreich gespeichert worden sein');

        const savedDoc = docRepo.getDocumentById(docId);
        assert.equal(savedDoc.nr, 'ANG-DB-2026-001');
        assert.equal(savedDoc.version, 1);
        assert.equal(savedDoc.angebot_status, 'ENTWURF');
        assert.equal(savedDoc.vertragsgrundlage, 'BGB_WERKVERTRAG');
        assert.equal(savedDoc.positionen.length, 2);

        // Überprüfe neue Positionen-Felder
        const pos1 = savedDoc.positionen.find(p => p.positionstyp === 'NORMAL');
        const pos2 = savedDoc.positionen.find(p => p.positionstyp === 'ALTERNATIV');
        assert.ok(pos1, 'NORMAL Position muss existieren');
        assert.equal(pos1.titel, 'Fliesenlegerarbeiten');
        assert.equal(pos1.in_endsumme_enthalten, 1);
        assert.equal(pos1.bieterangabe_wert, 'Villeroy & Boch 60x60');

        assert.ok(pos2, 'ALTERNATIV Position muss existieren');
        assert.equal(pos2.in_endsumme_enthalten, 0);

        // 6.2: Angebot einfrieren und versenden
        savedDoc.positionen = savedDoc.positionen || [];
        AngebotController.freezeAngebot(savedDoc, savedDoc.positionen);
        await docRepo.saveDocument(savedDoc);

        const frozenDoc = docRepo.getDocumentById(docId);
        assert.equal(frozenDoc.angebot_status, 'VERSENDET');
        assert.ok(frozenDoc.freeze_snapshot_json, 'Freeze-Snapshot muss in DB gespeichert sein');

        const parsedSnapshot = JSON.parse(frozenDoc.freeze_snapshot_json);
        assert.equal(parsedSnapshot.positionen.length, 2);

        // 6.3: Änderungssperre & Offensive State-Transition-Attacken
        // 6.3.1: Direkter Mutationsversuch: Versuch, gefrorene Positionen zu mutieren, MUSS scheitern!
        const mutierterDoc = {
            ...frozenDoc,
            positionen: [
                { ...frozenDoc.positionen[0], preis: 999.00 } // Preis geändert!
            ]
        };

        await assert.rejects(
            async () => {
                await docRepo.saveDocument(mutierterDoc);
            },
            (err) => {
                assert.ok(err.message.includes('Änderungssperre'), `Fehlermeldung muss Änderungssperre enthalten, war: ${err.message}`);
                return true;
            },
            'Mutation eines gefrorenen Angebots muss blockiert werden'
        );

        // 6.3.2: Offensive Attacke A: Versuch, gefrorenes Angebot per Statuswechsel auf ENTWURF zurückzusetzen
        await assert.rejects(
            async () => {
                await docRepo.saveDocument({
                    ...frozenDoc,
                    angebot_status: 'ENTWURF'
                });
            },
            (err) => {
                assert.ok(err.message.includes('Unzulässiger Statusübergang'), `Fehlermeldung muss Unzulässiger Statusübergang enthalten, war: ${err.message}`);
                return true;
            },
            'Statuswechsel von VERSENDET auf ENTWURF muss abgewiesen werden'
        );

        // 6.3.3: Offensive Attacke B: Versuch, gefrorenes Angebot per status='Entwurf' oder 'DRAFT' zurückzusetzen
        await assert.rejects(
            async () => {
                await docRepo.saveDocument({
                    ...frozenDoc,
                    status: 'Entwurf'
                });
            },
            (err) => {
                assert.ok(err.message.includes('Unzulässiger Statusübergang'), `Fehlermeldung muss Unzulässiger Statusübergang enthalten, war: ${err.message}`);
                return true;
            },
            'Statuswechsel per status=Entwurf muss abgewiesen werden'
        );

        // 6.3.4: Offensive Attacke C: Versuch, freeze_snapshot_json zu leeren/löschen
        await assert.rejects(
            async () => {
                await docRepo.saveDocument({
                    ...frozenDoc,
                    freeze_snapshot_json: null
                });
            },
            (err) => {
                assert.ok(err.message.includes('Freeze-Snapshot') || err.message.includes('Unzulässige Operation'), `Fehlermeldung muss Freeze-Snapshot-Verbot enthalten, war: ${err.message}`);
                return true;
            },
            'Löschen des Freeze-Snapshots muss abgewiesen werden'
        );

        // 6.3.5: Offensive Attacke D: Unzulässiger Vorwärtsübergang (z.B. nach UNGUELTIG)
        await assert.rejects(
            async () => {
                await docRepo.saveDocument({
                    ...frozenDoc,
                    angebot_status: 'UNGUELTIG'
                });
            },
            (err) => {
                assert.ok(err.message.includes('Unzulässiger Statusübergang'), `Fehlermeldung muss Unzulässiger Statusübergang enthalten, war: ${err.message}`);
                return true;
            },
            'Unzulässiger Vorwärtsübergang muss abgewiesen werden'
        );

        // DB-Inhalt muss unverändert geblieben sein
        const nachVerbot = docRepo.getDocumentById(docId);
        assert.equal(nachVerbot.angebot_status, 'VERSENDET', 'Status muss unverändert VERSENDET sein');
        assert.equal(nachVerbot.positionen[0].preis, 50.00, 'Originalpreis 50.00 muss intakt sein');

        // 6.4: Neue Version v2 erzeugen und persistieren
        const v2Obj = AngebotController.createVersion(frozenDoc, frozenDoc.positionen);
        assert.equal(v2Obj.version, 2);
        assert.equal(v2Obj.parent_angebot_id, docId);
        assert.equal(v2Obj.angebot_status, 'ENTWURF');

        // Preis in v2 anpassen (v2 ist Entwurf und daher veränderbar!)
        v2Obj.positionen[0].preis = 55.00;
        const v2Totals = AngebotController.calculateTotals(v2Obj.positionen);
        v2Obj.netto = v2Totals.netto;
        v2Obj.steuer = v2Totals.steuer;
        v2Obj.brutto = v2Totals.brutto;

        const v2Id = await docRepo.saveDocument(v2Obj);
        assert.ok(v2Id > 0 && v2Id !== docId, 'v2 muss als eigenständiger Datensatz gespeichert werden');

        const savedV2 = docRepo.getDocumentById(v2Id);
        assert.equal(savedV2.version, 2);
        assert.equal(savedV2.parent_angebot_id, docId);
        assert.equal(savedV2.positionen[0].preis, 55.00);

        // v1 bleibt unverändert
        const checkV1 = docRepo.getDocumentById(docId);
        assert.equal(checkV1.version, 1);
        assert.equal(checkV1.angebot_status, 'VERSENDET');
        assert.equal(checkV1.positionen[0].preis, 50.00);

        // 6.5: Annahme von v1 persistieren (Status-Update an gefrorenem Angebot erlaubt)
        AngebotController.acceptAngebot(checkV1, 1);
        await docRepo.saveDocument(checkV1);

        const acceptedV1 = docRepo.getDocumentById(docId);
        assert.equal(acceptedV1.angebot_status, 'ANGENOMMEN');
        assert.equal(acceptedV1.angenommene_version, 1);
        assert.ok(acceptedV1.angenommen_am);

        // 6.5.1: Versuch, ein bereits angenommenes Angebot wieder auf VERSENDET oder ENTWURF zurückzusetzen
        await assert.rejects(
            async () => {
                await docRepo.saveDocument({
                    ...acceptedV1,
                    angebot_status: 'VERSENDET'
                });
            },
            (err) => {
                assert.ok(err.message.includes('Unzulässiger Statusübergang'), `Fehlermeldung muss Unzulässiger Statusübergang enthalten, war: ${err.message}`);
                return true;
            },
            'Statuswechsel von ANGENOMMEN nach VERSENDET muss abgewiesen werden'
        );

        // Löschsperre prüfen: Angenommenes Angebot darf nicht gelöscht werden
        await assert.rejects(
            async () => {
                await docRepo.deleteDocument(docId);
            },
            (err) => {
                assert.ok(err.message.includes('Löschsperre') || err.message.includes('gesperrt'));
                return true;
            },
            'Angenommenes Angebot darf nicht physisch gelöscht werden'
        );

        // 6.6: Projekt-Generierung mit Positionsreferenz
        const projekt = AngebotController.createProjektFromAngebot(acceptedV1, acceptedV1.positionen, {
            name: 'Projekt Fliesen Bad & Flur'
        });
        assert.equal(projekt.source_angebot_id, docId);
        assert.equal(projekt.source_angebot_version, 1);
        const acceptedPos1 = acceptedV1.positionen.find(p => p.positionstyp === 'NORMAL');
        assert.ok(acceptedPos1, 'acceptedPos1 muss existieren');
        assert.equal(projekt.positionen[0].sourceOfferPositionId, acceptedPos1.id);
        assert.notEqual(projekt.positionen[0].id, acceptedPos1.id);

        // 6.7: SQLite DB-Persistenz & Reload-Test für Projekt und projekt_positionen
        const controllingRepo = repositories.controllingBautagebuchRepo || dbAPI;
        const projId = await controllingRepo.saveProjekt(projekt);
        assert.ok(projId > 0, 'Projekt muss erfolgreich mit ID in SQLite gespeichert worden sein');

        // Reload per direktem DB-SELECT
        const dbProjekt = db.prepare('SELECT * FROM projekte WHERE id = ?').get(projId);
        assert.equal(dbProjekt.id, projId);
        assert.equal(dbProjekt.name, 'Projekt Fliesen Bad & Flur');
        assert.equal(dbProjekt.source_angebot_id, docId, 'source_angebot_id muss in projekte Tabelle gespeichert sein');
        assert.equal(dbProjekt.source_angebot_version, 1, 'source_angebot_version muss in projekte Tabelle gespeichert sein');

        const dbPositions = db.prepare('SELECT * FROM projekt_positionen WHERE projekt_id = ? ORDER BY id ASC').all(projId);
        assert.equal(dbPositions.length, projekt.positionen.length, 'Alle Projektpositionen müssen in projekt_positionen gespeichert sein');
        assert.equal(dbPositions[0].projekt_id, projId);
        assert.equal(dbPositions[0].source_angebot_id, docId);
        assert.equal(dbPositions[0].source_angebot_version, 1);
        assert.equal(dbPositions[0].source_angebot_pos_id, acceptedPos1.id, 'source_angebot_pos_id muss identisch zur Ursprungsangebotsposition sein');
        assert.equal(dbPositions[0].in_endsumme_enthalten, 1);
        assert.equal(dbPositions[0].preis, 50.00);

        // Reload per getProjektMitPositionen
        const reloadedProj = controllingRepo.getProjektMitPositionen(projId);
        assert.ok(reloadedProj, 'Projekt muss über getProjektMitPositionen geladen werden können');
        assert.equal(reloadedProj.positionen.length, dbPositions.length);
        assert.equal(reloadedProj.positionen[0].source_angebot_pos_id, acceptedPos1.id);
        assert.equal(reloadedProj.positionen[0].sourceOfferPositionId, acceptedPos1.id);

        // 6.8: Foreign Key & Cascade Test mit PRAGMA foreign_keys = ON
        const fkPragma = db.pragma('foreign_keys', { simple: true });
        assert.equal(fkPragma, 1, 'PRAGMA foreign_keys muss aktiviert sein (1)');

        // Cascade-Delete Test: Löschen des Projekts muss automatisch alle projekt_positionen kaskadierend löschen
        db.prepare('DELETE FROM projekte WHERE id = ?').run(projId);
        const orphanedPositions = db.prepare('SELECT COUNT(*) as cnt FROM projekt_positionen WHERE projekt_id = ?').get(projId);
        assert.equal(orphanedPositions.cnt, 0, 'projekt_positionen müssen durch ON DELETE CASCADE gelöscht worden sein');

        // FK-Constraint Test: Einfügen einer projekt_position mit ungültiger projekt_id muss scheitern
        assert.throws(
            () => {
                db.prepare(`
                    INSERT INTO projekt_positionen (projekt_id, name, preis)
                    VALUES (999999, 'Ungültige FK-Position', 10.0)
                `).run();
            },
            (err) => {
                assert.ok(err.message.includes('FOREIGN KEY') || err.message.includes('constraint failed'));
                return true;
            },
            'Einfügen mit ungültigem Foreign Key muss von SQLite abgewiesen werden'
        );

    } finally {
        try {
            db.close();
            if (fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath);
        } catch (_cleanupErr) {}
    }
});

test('Test 7: String "0" vs "1" Test & einheitliche Normalisierung von in_endsumme_enthalten', () => {
    // 7.1: Direkte Normalisierungsprüfungen (AngebotController.normalizeInEndsumme)
    assert.equal(AngebotController.normalizeInEndsumme(1), 1);
    assert.equal(AngebotController.normalizeInEndsumme('1'), 1);
    assert.equal(AngebotController.normalizeInEndsumme(true), 1);

    assert.equal(AngebotController.normalizeInEndsumme(0), 0);
    assert.equal(AngebotController.normalizeInEndsumme('0'), 0, "'0' als String muss strikt als 0 normalisiert werden");
    assert.equal(AngebotController.normalizeInEndsumme(false), 0);

    // Standardwerte je nach Positionstyp bei undefined / null
    assert.equal(AngebotController.normalizeInEndsumme(undefined, 'NORMAL'), 1);
    assert.equal(AngebotController.normalizeInEndsumme(null, 'PAUSCHALE'), 1);
    assert.equal(AngebotController.normalizeInEndsumme(undefined, 'ALTERNATIV'), 0);
    assert.equal(AngebotController.normalizeInEndsumme(null, 'BEDARF'), 0);

    // 7.2: calculateTotals mit String '0' vs '1'
    const testPositions = [
        { name: 'Pos A', menge: 1, preis: 100.00, mwst: 19, positionstyp: 'NORMAL', in_endsumme_enthalten: '0' },
        { name: 'Pos B', menge: 1, preis: 200.00, mwst: 19, positionstyp: 'NORMAL', in_endsumme_enthalten: '1' }
    ];
    const totals = AngebotController.calculateTotals(testPositions);
    assert.equal(totals.netto, 200.00, "Pos A mit in_endsumme_enthalten='0' darf nicht in die Endsumme einfließen");
    assert.equal(totals.inEndsummeCount, 1);

    // 7.3: freezeAngebot mit String '0' vs '1'
    const angebot = { id: 88, nr: 'ANG-STR-0' };
    const frozen = AngebotController.freezeAngebot(angebot, testPositions);
    const snap = JSON.parse(frozen.freeze_snapshot_json);
    assert.equal(snap.positionen[0].in_endsumme_enthalten, 0, "Snapshot für Pos A mit '0' muss 0 sein");
    assert.equal(snap.positionen[1].in_endsumme_enthalten, 1, "Snapshot für Pos B mit '1' muss 1 sein");
    assert.equal(snap.totals.netto, 200.00);

    // 7.4: createProjektFromAngebot mit String '0' vs '1'
    const projDefault = AngebotController.createProjektFromAngebot(frozen, testPositions);
    assert.equal(projDefault.positionen.length, 1, "Standardmäßig nur in_endsumme_enthalten=1 im Projekt");
    assert.equal(projDefault.positionen[0].name, 'Pos B');

    const projAll = AngebotController.createProjektFromAngebot(frozen, testPositions, { includeAll: true });
    assert.equal(projAll.positionen.length, 2);
    assert.equal(projAll.positionen[0].in_endsumme_enthalten, 0, "Projektposition A muss in_endsumme_enthalten=0 haben");
    assert.equal(projAll.positionen[1].in_endsumme_enthalten, 1, "Projektposition B muss in_endsumme_enthalten=1 haben");
});

test('Test 8: Stabile Identität bei Projekt-Updates (Kein ID-Wechsel)', async () => {
    const tmpDbPath = path.join(os.tmpdir(), `angebot-lifecycle-test8-${Date.now()}-${process.pid}.sqlite`);
    const Database = require('better-sqlite3');
    const { createSchema, runMigrations } = require('../schema.js');
    const createControllingBautagebuchRepo = require('../db/repositories/controlling_bautagebuch_repo');

    const db = new Database(tmpDbPath);
    db.pragma('foreign_keys = ON');
    createSchema(db);
    runMigrations(db);

    const repo = createControllingBautagebuchRepo({
        db,
        dbQuery: async (s, p) => db.prepare(s).all(p),
        dbRun: async (s, p) => db.prepare(s).run(p),
        appendAuditLog: () => {},
        auditLogger: null,
        getEinstellung: () => null
    });

    try {
        // 8.1: Projekt mit 3 Positionen anlegen
        const initialProject = {
            name: 'Projekt Rohbau Gewerbe',
            budget: 25000.0,
            status: 'BEAUFTRAGT',
            positionen: [
                { name: 'Erdaushub', menge: 100, einheit: 'm³', preis: 35.0, positionstyp: 'NORMAL', in_endsumme_enthalten: 1 },
                { name: 'Bewehrung B500B', menge: 5000, einheit: 'kg', preis: 1.45, positionstyp: 'NORMAL', in_endsumme_enthalten: 1 },
                { name: 'Beton C25/30', menge: 80, einheit: 'm³', preis: 125.0, positionstyp: 'NORMAL', in_endsumme_enthalten: 1 }
            ]
        };

        const projId = await repo.saveProjekt(initialProject);
        assert.ok(projId > 0, 'Projekt muss erfolgreich mit ID angelegt worden sein');

        // 8.2: Neu laden und generierte Primärschlüssel-IDs der Positionen merken
        const loadedV1 = repo.getProjektMitPositionen(projId);
        assert.equal(loadedV1.name, 'Projekt Rohbau Gewerbe');
        assert.equal(loadedV1.positionen.length, 3);

        const pos1Id = loadedV1.positionen[0].id;
        const pos2Id = loadedV1.positionen[1].id;
        const pos3Id = loadedV1.positionen[2].id;

        assert.ok(Number.isInteger(pos1Id) && pos1Id > 0, 'Position 1 muss numerische Primärschlüssel-ID besitzen');
        assert.ok(Number.isInteger(pos2Id) && pos2Id > 0, 'Position 2 muss numerische Primärschlüssel-ID besitzen');
        assert.ok(Number.isInteger(pos3Id) && pos3Id > 0, 'Position 3 muss numerische Primärschlüssel-ID besitzen');
        assert.notEqual(pos1Id, pos2Id);
        assert.notEqual(pos2Id, pos3Id);

        // 8.3: Projekt aktualisieren:
        // - Projektnamen ändern
        // - Preis von Position 2 ändern
        // - Position 4 hinzufügen
        loadedV1.name = 'Projekt Rohbau Gewerbe Phase 1';
        loadedV1.positionen[1].preis = 1.60;
        loadedV1.positionen.push({
            name: 'Sauberkeitsschicht',
            menge: 60,
            einheit: 'm²',
            preis: 22.0,
            positionstyp: 'NORMAL',
            in_endsumme_enthalten: 1
        });

        const updatedProjId = await repo.saveProjekt(loadedV1);
        assert.equal(updatedProjId, projId, 'Projekt-ID darf sich bei Update nicht ändern');

        // 8.4: Projekt neu laden und Stabilität der Primärschlüssel-IDs validieren
        const loadedV2 = repo.getProjektMitPositionen(projId);
        assert.equal(loadedV2.name, 'Projekt Rohbau Gewerbe Phase 1');
        assert.equal(loadedV2.positionen.length, 4, 'Projekt muss nun 4 Positionen haben');

        const reloadedPos1 = loadedV2.positionen.find(p => p.name === 'Erdaushub');
        const reloadedPos2 = loadedV2.positionen.find(p => p.name === 'Bewehrung B500B');
        const reloadedPos3 = loadedV2.positionen.find(p => p.name === 'Beton C25/30');
        const reloadedPos4 = loadedV2.positionen.find(p => p.name === 'Sauberkeitsschicht');

        assert.ok(reloadedPos1, 'Erdaushub muss existieren');
        assert.ok(reloadedPos2, 'Bewehrung B500B muss existieren');
        assert.ok(reloadedPos3, 'Beton C25/30 muss existieren');
        assert.ok(reloadedPos4, 'Sauberkeitsschicht muss existieren');

        // STABILE IDENTITÄT: Bestehende Positionen behalten EXAKT ihre vorherige Primärschlüssel-ID!
        assert.equal(reloadedPos1.id, pos1Id, 'Erdaushub muss exakt dieselbe Primärschlüssel-ID behalten!');
        assert.equal(reloadedPos2.id, pos2Id, 'Bewehrung B500B muss exakt dieselbe Primärschlüssel-ID behalten!');
        assert.equal(reloadedPos2.preis, 1.60, 'Preis von Position 2 muss aktualisiert worden sein');
        assert.equal(reloadedPos3.id, pos3Id, 'Beton C25/30 muss exakt dieselbe Primärschlüssel-ID behalten!');

        // Neue Position hat eine neue ID erhalten
        assert.ok(reloadedPos4.id > 0, 'Neue Position muss eine gültige ID erhalten');
        assert.ok(reloadedPos4.id !== pos1Id && reloadedPos4.id !== pos2Id && reloadedPos4.id !== pos3Id);

        // 8.5: Gezieltes Löschen einer Position (Diff & Sync):
        // Entferne Position 3 (Beton C25/30) aus dem Array
        loadedV2.positionen = loadedV2.positionen.filter(p => p.id !== pos3Id);
        await repo.saveProjekt(loadedV2);

        const loadedV3 = repo.getProjektMitPositionen(projId);
        assert.equal(loadedV3.positionen.length, 3, 'Nach Löschen einer Position müssen 3 Positionen verbleiben');
        assert.ok(!loadedV3.positionen.some(p => p.id === pos3Id), 'Position 3 darf nicht mehr existieren');
        assert.equal(loadedV3.positionen.find(p => p.name === 'Erdaushub').id, pos1Id, 'Position 1 behält stabil pos1Id');
        assert.equal(loadedV3.positionen.find(p => p.name === 'Bewehrung B500B').id, pos2Id, 'Position 2 behält stabil pos2Id');
    } finally {
        try {
            db.close();
            if (fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath);
        } catch (_err) {}
    }
});

test('Test 9: Verhindern von Doppel-Projektanlagen (Idempotenz / Double-Click Guard)', async () => {
    const tmpDbPath = path.join(os.tmpdir(), `angebot-lifecycle-test9-${Date.now()}-${process.pid}.sqlite`);
    const Database = require('better-sqlite3');
    const { createSchema, runMigrations } = require('../schema.js');
    const createControllingBautagebuchRepo = require('../db/repositories/controlling_bautagebuch_repo');

    const db = new Database(tmpDbPath);
    db.pragma('foreign_keys = ON');
    createSchema(db);
    runMigrations(db);

    const repo = createControllingBautagebuchRepo({
        db,
        dbQuery: async (s, p) => db.prepare(s).all(p),
        dbRun: async (s, p) => db.prepare(s).run(p),
        appendAuditLog: () => {},
        auditLogger: null,
        getEinstellung: () => null
    });

    try {
        // Angenommenes Angebot anlegen
        const res = db.prepare(`
            INSERT INTO dokumente (type, nr, status, angebot_status, version)
            VALUES ('angebot', 'ANG-2026-GUARD-01', 'ANGENOMMEN', 'ANGENOMMEN', 1)
        `).run();
        const angebotId = Number(res.lastInsertRowid);

        // 9.1: Erste Projektanlage aus dem Angebot (Erfolgreich)
        const proj1Data = {
            name: 'Projekt Erstaufruf',
            source_angebot_id: angebotId,
            source_angebot_version: 1,
            positionen: [
                { name: 'Grundleistung', menge: 1, preis: 1000.0 }
            ]
        };

        const proj1Id = await repo.saveProjekt(proj1Data);
        assert.ok(proj1Id > 0, 'Erste Projektanlage muss erfolgreich sein');

        // 9.2: Zweite Projektanlage für dasselbe Angebot & Version (Simulierter Doppel-Klick / Doppel-Anlage)
        const proj2Data = {
            name: 'Projekt Zweitaufruf Doppel-Klick',
            source_angebot_id: angebotId,
            source_angebot_version: 1,
            positionen: [
                { name: 'Grundleistung', menge: 1, preis: 1000.0 }
            ]
        };

        await assert.rejects(
            async () => {
                await repo.saveProjekt(proj2Data);
            },
            (err) => {
                assert.ok(
                    err.message.includes('Doppel-Projektanlage verhindert'),
                    `Fehlermeldung muss "Doppel-Projektanlage verhindert" enthalten, war: ${err.message}`
                );
                assert.ok(
                    err.message.includes(`Angebot #${angebotId}`),
                    `Fehlermeldung muss Angebots-ID #${angebotId} nennen, war: ${err.message}`
                );
                assert.ok(
                    err.message.includes(`Projekt #${proj1Id}`),
                    `Fehlermeldung muss die bestehende Projekt-ID #${proj1Id} nennen, war: ${err.message}`
                );
                return true;
            },
            'Zweiter Versuch der Projektanlage für dasselbe angenommene Angebot muss abgewiesen werden'
        );

        // Sicherstellen, dass nur 1 Projekt in der DB existiert
        const count = db.prepare('SELECT COUNT(*) as cnt FROM projekte WHERE source_angebot_id = ?').get(angebotId);
        assert.equal(count.cnt, 1, 'Es darf in der Datenbank exakt nur 1 Projekt für dieses Angebot geben');

        // 9.3: Reguläres Update des bestehenden Projekts (mit id) darf NICHT blockiert werden
        proj1Data.id = proj1Id;
        proj1Data.name = 'Projekt Erstaufruf (Update)';
        const updatedId = await repo.saveProjekt(proj1Data);
        assert.equal(updatedId, proj1Id, 'Update des bestehenden Projekts mit gesetzter id muss erlaubt sein');

        // 9.4: Versuch, zweites Projekt mit source_angebot_version: null anzulegen (wird auf 1 normalisiert und geblockt)
        const projNullVerData = {
            name: 'Projekt mit NULL Version',
            source_angebot_id: angebotId,
            source_angebot_version: null,
            positionen: [{ name: 'Leistung', menge: 1, preis: 500.0 }]
        };
        await assert.rejects(
            async () => {
                await repo.saveProjekt(projNullVerData);
            },
            (err) => {
                assert.ok(
                    err.message.includes('Doppel-Projektanlage verhindert'),
                    `Fehler muss Doppel-Projektanlage verhindern, war: ${err.message}`
                );
                return true;
            },
            'saveProjekt mit source_angebot_version=null muss als Duplikat erkannt und blockiert werden'
        );

        // 9.5: Manueller SQL-Insert mit source_angebot_version = NULL muss durch UNIQUE-Index abgewiesen werden
        assert.throws(
            () => {
                db.prepare(`
                    INSERT INTO projekte (name, source_angebot_id, source_angebot_version)
                    VALUES ('Manueller Insert NULL', ?, NULL)
                `).run(angebotId);
            },
            (err) => {
                assert.ok(
                    err.message.includes('UNIQUE constraint failed') || err.code === 'SQLITE_CONSTRAINT_UNIQUE',
                    `Manueller SQL-Insert mit NULL muss UNIQUE constraint verletzen, war: ${err.message}`
                );
                return true;
            },
            'Manueller SQL-Insert mit NULL-Version muss durch COALESCE Unique-Index blockiert werden'
        );
    } finally {
        try {
            db.close();
            if (fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath);
        } catch (_err) {}
    }
});

test('Test 10: Legacy-DB Migrationstest', async () => {
    const tmpDbPath = path.join(os.tmpdir(), `angebot-lifecycle-test10-${Date.now()}-${process.pid}.sqlite`);
    const Database = require('better-sqlite3');
    const { runMigrations } = require('../schema.js');
    const createControllingBautagebuchRepo = require('../db/repositories/controlling_bautagebuch_repo');

    const db = new Database(tmpDbPath);
    db.pragma('foreign_keys = ON');

    try {
        // 10.1: Altzustand der DB herstellen (OHNE die neuen Angebotsspalten und OHNE projekt_positionen)
        db.exec(`
            CREATE TABLE einstellungen (
                key TEXT PRIMARY KEY,
                value TEXT
            );

            CREATE TABLE kunden (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kundennummer TEXT,
                name TEXT NOT NULL,
                adresse TEXT,
                plz TEXT,
                ort TEXT,
                telefon TEXT,
                email TEXT,
                ustId TEXT,
                createdAt TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE artikel (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                ean TEXT,
                beschreibung TEXT,
                ek REAL DEFAULT 0,
                vk REAL DEFAULT 0,
                mwst INTEGER DEFAULT 19,
                bestand INTEGER DEFAULT 0,
                lieferant TEXT,
                katalog TEXT,
                einheit TEXT DEFAULT 'Stk.'
            );

            -- Legacy dokumente-Tabelle OHNE neue Angebots-Spalten:
            CREATE TABLE dokumente (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                nr TEXT NOT NULL,
                datum TEXT,
                faellig TEXT,
                kundeId INTEGER,
                projektId INTEGER,
                status TEXT,
                isLocked INTEGER DEFAULT 0,
                netto REAL DEFAULT 0,
                steuer REAL DEFAULT 0,
                brutto REAL DEFAULT 0,
                globalRabattAbzug REAL DEFAULT 0,
                globalRabattType TEXT DEFAULT '%',
                globalRabattValue REAL DEFAULT 0,
                anzahlung REAL DEFAULT 0,
                eingabemodus TEXT DEFAULT 'netto',
                zahlbetrag REAL DEFAULT 0
            );

            -- Legacy positionen-Tabelle OHNE neue Spalten (titel, positionstyp, in_endsumme_enthalten, bieterangabe_wert):
            CREATE TABLE positionen (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dokumentId INTEGER,
                artikelId INTEGER,
                name TEXT,
                menge REAL DEFAULT 1,
                einheit TEXT DEFAULT 'Stk.',
                preis REAL DEFAULT 0,
                ek REAL DEFAULT 0,
                mwst INTEGER DEFAULT 19,
                rabatt REAL DEFAULT 0
            );

            -- Legacy projekte-Tabelle OHNE source_angebot_id und source_angebot_version:
            CREATE TABLE projekte (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                kundeId INTEGER,
                start TEXT,
                ende TEXT,
                budget REAL DEFAULT 0,
                status TEXT
            );

            CREATE TABLE aufmass (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                titel TEXT NOT NULL,
                datum TEXT DEFAULT CURRENT_TIMESTAMP,
                rechnung_id INTEGER,
                projekt_id INTEGER,
                bemerkung TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE rechnung_verrechnungen (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                aktuelle_rechnung_id INTEGER,
                vorherige_rechnung_id INTEGER,
                abzugsbetrag_netto REAL DEFAULT 0,
                abzugsbetrag_brutto REAL DEFAULT 0
            );
        `);

        // 10.2: Alt-Datensätze einfügen
        // Alt-Kunde:
        db.prepare(`INSERT INTO kunden (id, name, ort) VALUES (1, 'Bauherrschaft Schmidt', 'Köln')`).run();

        // Alt-Rechnung:
        db.prepare(`
            INSERT INTO dokumente (id, type, nr, datum, faellig, kundeId, status, netto, steuer, brutto)
            VALUES (1, 'rechnung', 'RE-2024-0099', '2024-10-01', '2024-10-31', 1, 'Bezahlt', 3000.0, 570.0, 3570.0)
        `).run();
        db.prepare(`
            INSERT INTO positionen (id, dokumentId, name, menge, einheit, preis, mwst)
            VALUES (1, 1, 'Abbruch Estrich Altbau', 60, 'm²', 50.0, 19)
        `).run();

        // Altes Angebot 2 (vor V2, Status: Versendet):
        db.prepare(`
            INSERT INTO dokumente (id, type, nr, datum, faellig, kundeId, status, netto, steuer, brutto)
            VALUES (2, 'angebot', 'ANG-2024-0012', '2024-10-05', '2024-11-05', 1, 'Versendet', 4500.0, 855.0, 5355.0)
        `).run();
        db.prepare(`
            INSERT INTO positionen (id, dokumentId, name, menge, einheit, preis, mwst)
            VALUES (2, 2, 'Neuer Estrich Einbau', 60, 'm²', 75.0, 19)
        `).run();

        // Altes Angebot 3 (Status: Angenommen):
        db.prepare(`
            INSERT INTO dokumente (id, type, nr, datum, faellig, kundeId, status, netto, steuer, brutto)
            VALUES (3, 'angebot', 'ANG-2024-0013', '2024-10-06', '2024-11-06', 1, 'Angenommen', 6200.0, 1178.0, 7378.0)
        `).run();
        db.prepare(`
            INSERT INTO positionen (id, dokumentId, name, menge, einheit, preis, mwst)
            VALUES (3, 3, 'Fliesenarbeiten', 40, 'm²', 80.0, 19)
        `).run();

        // Altes Angebot 4 (Status: Abgelehnt):
        db.prepare(`
            INSERT INTO dokumente (id, type, nr, datum, faellig, kundeId, status, netto, steuer, brutto)
            VALUES (4, 'angebot', 'ANG-2024-0014', '2024-10-07', '2024-11-07', 1, 'Abgelehnt', 1200.0, 228.0, 1428.0)
        `).run();

        // Altes Angebot 5 (Status: Entwurf):
        db.prepare(`
            INSERT INTO dokumente (id, type, nr, datum, faellig, kundeId, status, netto, steuer, brutto)
            VALUES (5, 'angebot', 'ANG-2024-0015', '2024-10-08', '2024-11-08', 1, 'Entwurf', 800.0, 152.0, 952.0)
        `).run();

        // Altes Angebot 6 (Status: ACCEPTED - englisch):
        db.prepare(`
            INSERT INTO dokumente (id, type, nr, datum, faellig, kundeId, status, netto, steuer, brutto)
            VALUES (6, 'angebot', 'ANG-2024-0016', '2024-10-09', '2024-11-09', 1, 'ACCEPTED', 900.0, 171.0, 1071.0)
        `).run();

        // Altes Projekt:
        db.prepare(`
            INSERT INTO projekte (id, name, kundeId, budget, status)
            VALUES (1, 'Altprojekt Sanierung Köln', 1, 60000.0, 'In Ausführung')
        `).run();

        // Prüfen, dass neue Spalten und projekt_positionen vor der Migration definitiv NICHT existieren
        const dokColsPre = db.prepare("PRAGMA table_info(dokumente)").all().map(c => c.name);
        assert.ok(!dokColsPre.includes('version'), 'version darf vor Migration nicht existieren');
        assert.ok(!dokColsPre.includes('angebot_status'), 'angebot_status darf vor Migration nicht existieren');
        assert.ok(!dokColsPre.includes('auftraggeber_typ'), 'auftraggeber_typ darf vor Migration nicht existieren');

        const posColsPre = db.prepare("PRAGMA table_info(positionen)").all().map(c => c.name);
        assert.ok(!posColsPre.includes('positionstyp'), 'positionstyp darf vor Migration nicht existieren');
        assert.ok(!posColsPre.includes('in_endsumme_enthalten'), 'in_endsumme_enthalten darf vor Migration nicht existieren');

        const projColsPre = db.prepare("PRAGMA table_info(projekte)").all().map(c => c.name);
        assert.ok(!projColsPre.includes('source_angebot_id'), 'source_angebot_id darf vor Migration nicht existieren');

        const ppTablePre = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projekt_positionen'").get();
        assert.equal(ppTablePre, undefined, 'projekt_positionen darf vor Migration nicht existieren');

        // 10.3: Migration ausführen
        runMigrations(db);

        // 10.4: Validierung 1: Alle Altdaten unverändert und lesbar
        const rechnungPost = db.prepare('SELECT * FROM dokumente WHERE id = 1').get();
        assert.equal(rechnungPost.type, 'rechnung');
        assert.equal(rechnungPost.nr, 'RE-2024-0099');
        assert.equal(rechnungPost.netto, 3000.0);
        assert.equal(rechnungPost.steuer, 570.0);
        assert.equal(rechnungPost.brutto, 3570.0);
        assert.equal(rechnungPost.status, 'Bezahlt');

        const rPosPost = db.prepare('SELECT * FROM positionen WHERE id = 1').get();
        assert.equal(rPosPost.name, 'Abbruch Estrich Altbau');
        assert.equal(rPosPost.menge, 60);
        assert.equal(rPosPost.preis, 50.0);

        const angebotPost = db.prepare('SELECT * FROM dokumente WHERE id = 2').get();
        assert.equal(angebotPost.type, 'angebot');
        assert.equal(angebotPost.nr, 'ANG-2024-0012');
        assert.equal(angebotPost.netto, 4500.0);
        assert.equal(angebotPost.brutto, 5355.0);

        const aPosPost = db.prepare('SELECT * FROM positionen WHERE id = 2').get();
        assert.equal(aPosPost.name, 'Neuer Estrich Einbau');
        assert.equal(aPosPost.menge, 60);
        assert.equal(aPosPost.preis, 75.0);

        const projPost = db.prepare('SELECT * FROM projekte WHERE id = 1').get();
        assert.equal(projPost.name, 'Altprojekt Sanierung Köln');
        assert.equal(projPost.budget, 60000.0);
        assert.equal(projPost.status, 'In Ausführung');

        // 10.5: Validierung 2: Altdaten-Migration für historischen Status verifizieren
        assert.equal(angebotPost.version, 1, 'Default version muss 1 sein');
        // Altdaten-Migration: 'Versendet' muss sauber nach 'VERSENDET' migriert sein!
        assert.equal(angebotPost.angebot_status, 'VERSENDET', 'Altdaten-Migration: Historischer Status "Versendet" muss in angebot_status="VERSENDET" überführt werden');
        
        const ang3Post = db.prepare('SELECT * FROM dokumente WHERE id = 3').get();
        assert.equal(ang3Post.angebot_status, 'ANGENOMMEN', 'Altdaten-Migration: Historischer Status "Angenommen" muss in angebot_status="ANGENOMMEN" überführt werden');

        const ang4Post = db.prepare('SELECT * FROM dokumente WHERE id = 4').get();
        assert.equal(ang4Post.angebot_status, 'ABGELEHNT', 'Altdaten-Migration: Historischer Status "Abgelehnt" muss in angebot_status="ABGELEHNT" überführt werden');

        const ang5Post = db.prepare('SELECT * FROM dokumente WHERE id = 5').get();
        assert.equal(ang5Post.angebot_status, 'ENTWURF', 'Altdaten-Migration: Status "Entwurf" bleibt angebot_status="ENTWURF"');

        const ang6Post = db.prepare('SELECT * FROM dokumente WHERE id = 6').get();
        assert.equal(ang6Post.angebot_status, 'ANGENOMMEN', 'Altdaten-Migration: Historischer Status "ACCEPTED" muss in angebot_status="ANGENOMMEN" überführt werden');

        assert.equal(angebotPost.auftraggeber_typ, 'PRIVAT', 'Default auftraggeber_typ muss PRIVAT sein');
        assert.equal(angebotPost.vergabe_verfahren, 'DIREKT', 'Default vergabe_verfahren muss DIREKT sein');
        assert.equal(angebotPost.vertragsgrundlage, 'BGB_WERKVERTRAG', 'Default vertragsgrundlage muss BGB_WERKVERTRAG sein');
        assert.equal(angebotPost.freeze_snapshot_json, null);
        assert.equal(angebotPost.parent_angebot_id, null);
        assert.equal(angebotPost.angenommen_am, null);
        assert.equal(angebotPost.angenommene_version, null);

        assert.equal(aPosPost.positionstyp, 'NORMAL', 'Default positionstyp muss NORMAL sein');
        assert.equal(aPosPost.in_endsumme_enthalten, 1, 'Default in_endsumme_enthalten muss 1 sein');
        assert.equal(aPosPost.titel, null);
        assert.equal(aPosPost.bieterangabe_wert, null);

        assert.equal(projPost.source_angebot_id, null);
        assert.equal(projPost.source_angebot_version, null);

        // 10.6: Validierung 3: Echter partieller UNIQUE INDEX auf SQLite-Ebene existiert
        const idxPost = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_projekte_unique_source_angebot'").get();
        assert.ok(idxPost, 'idx_projekte_unique_source_angebot muss in migrierter DB existieren');

        // 10.7: Validierung 4: Neue Tabelle projekt_positionen existiert und ist sofort für neue Projekte nutzbar
        const ppTablePost = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projekt_positionen'").get();
        assert.ok(ppTablePost, 'Tabelle projekt_positionen muss nach Migration existieren');

        const repo = createControllingBautagebuchRepo({
            db,
            dbQuery: async (s, p) => db.prepare(s).all(p),
            dbRun: async (s, p) => db.prepare(s).run(p),
            appendAuditLog: () => {},
            auditLogger: null,
            getEinstellung: () => null
        });

        const newProjId = await repo.saveProjekt({
            name: 'Modernisierung nach Migration 2026',
            source_angebot_id: 2,
            source_angebot_version: 1,
            budget: 15000.0,
            status: 'BEAUFTRAGT',
            positionen: [
                {
                    name: 'Estrich Zusatzversiegelung',
                    menge: 60,
                    einheit: 'm²',
                    preis: 25.0,
                    cost_type: 'MATERIAL',
                    positionstyp: 'NORMAL',
                    in_endsumme_enthalten: 1
                }
            ]
        });

        assert.ok(newProjId > 0, 'Neues Projekt muss in migrierter DB angelegt werden können');

        const reloadedNewProj = repo.getProjektMitPositionen(newProjId);
        assert.ok(reloadedNewProj, 'Neues Projekt muss geladen werden können');
        assert.equal(reloadedNewProj.name, 'Modernisierung nach Migration 2026');
        assert.equal(reloadedNewProj.source_angebot_id, 2);
        assert.equal(reloadedNewProj.source_angebot_version, 1);
        assert.equal(reloadedNewProj.positionen.length, 1);
        assert.equal(reloadedNewProj.positionen[0].name, 'Estrich Zusatzversiegelung');
        assert.equal(reloadedNewProj.positionen[0].preis, 25.0);
        assert.ok(reloadedNewProj.positionen[0].id > 0, 'projekt_positionen Primärschlüssel muss erzeugt worden sein');

        // Validierung 5: Unique-Constraint auf SQLite-Ebene blockiert Duplikat
        assert.throws(
            () => {
                db.prepare(`
                    INSERT INTO projekte (name, source_angebot_id, source_angebot_version)
                    VALUES ('Duplikat-Projekt', 2, 1)
                `).run();
            },
            (err) => {
                assert.ok(
                    err.message.includes('UNIQUE constraint failed') || err.code === 'SQLITE_CONSTRAINT_UNIQUE',
                    `Fehler muss UNIQUE-Constraint-Verletzung sein, war: ${err.message}`
                );
                return true;
            },
            'SQLite Engine muss Duplikat für selbe source_angebot_id und version hart abweisen'
        );
    } finally {
        try {
            db.close();
            if (fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath);
        } catch (_err) {}
    }
});

test('Test 10 (Erweiterung): Migration einer Altdatenbank mit Duplikaten bei source_angebot_id (Bereinigung vor Unique-Index)', () => {
    const tmpDbPath = path.join(os.tmpdir(), `angebot-lifecycle-dup-mig-${Date.now()}-${process.pid}.sqlite`);
    const Database = require('better-sqlite3');
    const { runMigrations } = require('../schema.js');

    const db = new Database(tmpDbPath);
    try {
        // Altdatenbank-Zustand: Tabelle projekte enthält BEREITS ZWEI PROJEKTE mit demselben source_angebot_id
        // (Projekt 1 mit Version 1, Projekt 2 mit NULL, Projekt 3 mit Version 1 als weiteres Duplikat)
        db.exec(`
            CREATE TABLE IF NOT EXISTS einstellungen (
                key TEXT PRIMARY KEY,
                value TEXT
            );

            CREATE TABLE projekte (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                kundeId INTEGER,
                budget REAL DEFAULT 0,
                status TEXT,
                source_angebot_id INTEGER,
                source_angebot_version INTEGER
            );

            INSERT INTO projekte (id, name, source_angebot_id, source_angebot_version)
            VALUES (10, 'Projekt Alt 10 (Version 1)', 55, 1);

            INSERT INTO projekte (id, name, source_angebot_id, source_angebot_version)
            VALUES (11, 'Projekt Alt 11 (Version NULL Duplikat)', 55, NULL);

            INSERT INTO projekte (id, name, source_angebot_id, source_angebot_version)
            VALUES (12, 'Projekt Alt 12 (Version 1 Duplikat)', 55, 1);

            INSERT INTO projekte (id, name, source_angebot_id, source_angebot_version)
            VALUES (20, 'Projekt Normal ohne Angebot', NULL, NULL);
        `);

        // Migration ausführen: Muss fehlerfrei durchlaufen (Duplikate werden auf -id gesetzt)
        runMigrations(db);

        // 1. Prüfen, dass der Unique-Index tatsächlich in sqlite_master existiert
        const idxCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_projekte_unique_source_angebot'").get();
        assert.ok(idxCheck, 'idx_projekte_unique_source_angebot muss nach Migration in sqlite_master existieren');

        // 2. Erstes Projekt hat Version 1 behalten
        const p10 = db.prepare('SELECT * FROM projekte WHERE id = 10').get();
        assert.equal(p10.source_angebot_version, 1, 'Erst-Projekt muss Version 1 behalten');

        // 3. Duplikate wurden auf negative Version (-id) gesetzt, sodass historische Daten erhalten bleiben
        const p11 = db.prepare('SELECT * FROM projekte WHERE id = 11').get();
        assert.equal(p11.source_angebot_version, -11, 'Duplikat 11 muss auf -11 umgesetzt worden sein');

        const p12 = db.prepare('SELECT * FROM projekte WHERE id = 12').get();
        assert.equal(p12.source_angebot_version, -12, 'Duplikat 12 muss auf -12 umgesetzt worden sein');

        // 4. Normales Projekt ohne source_angebot_id bleibt unverändert
        const p20 = db.prepare('SELECT * FROM projekte WHERE id = 20').get();
        assert.equal(p20.source_angebot_id, null);
        assert.equal(p20.source_angebot_version, null);

        // 5. Index ist aktiv: Neues Duplikat für Angebot 55 (Version 1 oder NULL) wird blockiert
        assert.throws(
            () => {
                db.prepare("INSERT INTO projekte (name, source_angebot_id, source_angebot_version) VALUES ('Neues Duplikat v1', 55, 1)").run();
            },
            /UNIQUE constraint failed/
        );

        assert.throws(
            () => {
                db.prepare("INSERT INTO projekte (name, source_angebot_id, source_angebot_version) VALUES ('Neues Duplikat vNull', 55, NULL)").run();
            },
            /UNIQUE constraint failed/
        );
    } finally {
        try {
            db.close();
            if (fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath);
        } catch (_err) {}
    }
});

test('Test 11: Aufmaß-Referenz bleibt über Projekt-Updates hinweg stabil und intakt', async () => {
    const tmpDbPath = path.join(os.tmpdir(), `angebot-lifecycle-test11-${Date.now()}-${process.pid}.sqlite`);
    const Database = require('better-sqlite3');
    const { createSchema, runMigrations } = require('../schema.js');
    const createControllingBautagebuchRepo = require('../db/repositories/controlling_bautagebuch_repo');
    const createAufmassRepo = require('../db/repositories/aufmass_repo');

    const db = new Database(tmpDbPath);
    db.pragma('foreign_keys = ON');
    createSchema(db);
    runMigrations(db);

    const controllingRepo = createControllingBautagebuchRepo({
        db,
        dbQuery: async (s, p) => db.prepare(s).all(p),
        dbRun: async (s, p) => db.prepare(s).run(p),
        appendAuditLog: () => {},
        auditLogger: null,
        getEinstellung: () => null
    });

    const aufmassRepo = createAufmassRepo({
        db,
        dbQuery: async (s, p) => db.prepare(s).all(p),
        dbRun: async (s, p) => db.prepare(s).run(p),
        appendAuditLog: () => {}
    });

    try {
        // 11.1: Erstelle Angebot, friere es ein, nehme es an
        const offer = {
            type: 'angebot',
            nr: 'ANG-2026-AUFMASS-01',
            datum: '2026-03-01',
            faellig: '2026-03-31',
            status: 'Entwurf',
            version: 1,
            angebot_status: 'ENTWURF'
        };
        const resOffer = db.prepare(`
            INSERT INTO dokumente (type, nr, datum, faellig, status, version, angebot_status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(offer.type, offer.nr, offer.datum, offer.faellig, offer.status, offer.version, offer.angebot_status);
        const offerId = Number(resOffer.lastInsertRowid);
        offer.id = offerId;

        const offerPositions = [
            { name: 'Erdaushub Baugrube', menge: 150, einheit: 'm³', preis: 45.0, positionstyp: 'NORMAL', in_endsumme_enthalten: 1 },
            { name: 'Bewehrungsstahl B500B', menge: 8, einheit: 't', preis: 1250.0, positionstyp: 'NORMAL', in_endsumme_enthalten: 1 },
            { name: 'Ortbeton C25/30', menge: 60, einheit: 'm³', preis: 140.0, positionstyp: 'NORMAL', in_endsumme_enthalten: 1 }
        ];

        for (const p of offerPositions) {
            const insRes = db.prepare(`
                INSERT INTO positionen (dokumentId, name, menge, einheit, preis, positionstyp, in_endsumme_enthalten)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(offerId, p.name, p.menge, p.einheit, p.preis, p.positionstyp, p.in_endsumme_enthalten);
            p.id = Number(insRes.lastInsertRowid);
        }

        // Einfrieren
        AngebotController.freezeAngebot(offer, offerPositions);
        assert.ok(offer.freeze_snapshot_json, 'Freeze Snapshot muss erzeugt worden sein');

        // Annehmen
        AngebotController.acceptAngebot(offer, 1);
        assert.equal(offer.angebot_status, 'ANGENOMMEN');
        assert.equal(offer.angenommene_version, 1);

        db.prepare(`
            UPDATE dokumente
            SET freeze_snapshot_json = ?, angebot_status = ?, angenommene_version = ?, angenommen_am = ?, status = ?
            WHERE id = ?
        `).run(offer.freeze_snapshot_json, offer.angebot_status, offer.angenommene_version, offer.angenommen_am, 'ANGENOMMEN', offerId);

        // 11.2: Erstelle Projekt mit projekt_positionen via saveProjekt
        const projData = AngebotController.createProjektFromAngebot(offer, offerPositions, {
            name: 'Bauvorhaben Wohnpark Rheinblick'
        });

        const projId = await controllingRepo.saveProjekt(projData);
        assert.ok(projId > 0, 'Projekt muss erfolgreich angelegt werden');

        // Positionen laden und posId merken
        const loadedProj = controllingRepo.getProjektMitPositionen(projId);
        assert.equal(loadedProj.positionen.length, 3, 'Projekt muss 3 Positionen aus dem Angebot besitzen');

        const pos1 = loadedProj.positionen[0];
        const posId = pos1.id;
        assert.ok(Number.isInteger(posId) && posId > 0, 'Projektposition 1 muss eine gültige numerische ID besitzen');
        assert.equal(pos1.name, 'Erdaushub Baugrube');

        // 11.3: Erstelle ein Aufmaß, das explizit auf posId referenziert
        const aufmassId = await aufmassRepo.saveAufmassForPosition(posId, {
            titel: 'Aufmaß Erdaushub Baugrube Achse 1-4',
            projekt_id: projId,
            bemerkung: 'Aufmaß vor Ort mit Bauleitung abgestimmt',
            einheit: 'm³',
            positionen: [
                { raum: 'Baugrube Nord', formel: '20*5*2', ergebnis: 200, einheit: 'm³' },
                { raum: 'Baugrube Süd', formel: '15*4*1.5', ergebnis: 90, einheit: 'm³' }
            ]
        });
        assert.ok(aufmassId > 0, 'Aufmaß muss erfolgreich angelegt werden');

        // 11.4: Führe ein Projekt-Update durch (Projektname ändern, Position 2 Preis ändern, neue Position 4 hinzufügen)
        loadedProj.name = 'Bauvorhaben Wohnpark Rheinblick - Bauabschnitt 1';
        loadedProj.positionen[1].preis = 1320.0;
        loadedProj.positionen.push({
            name: 'Sauberkeitsschicht C12/15',
            menge: 80,
            einheit: 'm²',
            preis: 26.50,
            positionstyp: 'NORMAL',
            in_endsumme_enthalten: 1
        });

        const updatedProjId = await controllingRepo.saveProjekt(loadedProj);
        assert.equal(updatedProjId, projId, 'Projekt-ID muss unverändert bleiben');

        // 11.5: Lade das Aufmaß und die Projektposition neu aus SQLite
        const reloadedProj = controllingRepo.getProjektMitPositionen(projId);
        assert.equal(reloadedProj.name, 'Bauvorhaben Wohnpark Rheinblick - Bauabschnitt 1');
        assert.equal(reloadedProj.positionen.length, 4, 'Projekt muss nach Update 4 Positionen besitzen');

        // Assert 1: posId der Projektposition ist exakt unverändert geblieben
        const reloadedPos1 = reloadedProj.positionen.find(p => p.name === 'Erdaushub Baugrube');
        assert.ok(reloadedPos1, 'Erdaushub-Position muss vorhanden sein');
        assert.equal(reloadedPos1.id, posId, 'posId der Projektposition muss exakt unverändert geblieben sein!');

        // Assert 2: Das Aufmaß verweist weiterhin fehlerfrei auf die exakt selbe Position und alle Werte sind konsistent
        const reloadedAufmass = await aufmassRepo.getAufmassById(aufmassId);
        assert.ok(reloadedAufmass, 'Aufmaß muss weiterhin existieren');
        assert.equal(reloadedAufmass.position_id, String(posId), 'Aufmaß position_id muss exakt posId bleiben');
        assert.equal(reloadedAufmass.projekt_id, projId, 'Aufmaß projekt_id muss exakt projId bleiben');
        assert.equal(reloadedAufmass.titel, 'Aufmaß Erdaushub Baugrube Achse 1-4');
        assert.equal(reloadedAufmass.bemerkung, 'Aufmaß vor Ort mit Bauleitung abgestimmt');
        assert.equal(reloadedAufmass.positionen.length, 2, 'Aufmaß muss beide Teilpositionen behalten haben');
        assert.equal(reloadedAufmass.positionen[0].raum, 'Baugrube Nord');
        assert.equal(reloadedAufmass.positionen[0].ergebnis, 200);
        assert.equal(reloadedAufmass.positionen[1].raum, 'Baugrube Süd');
        assert.equal(reloadedAufmass.positionen[1].ergebnis, 90);

        // Aufmaß lässt sich weiterhin direkt über posId auflösen
        const aufmassByPos = await aufmassRepo.getAufmassByPositionId(posId);
        assert.ok(aufmassByPos, 'Aufmaß muss über die Projektpositions-ID auffindbar sein');
        assert.equal(aufmassByPos.id, aufmassId);

        // Relationaler SQL-Join zwischen aufmass und projekt_positionen ist konsistent
        const joinCheck = db.prepare(`
            SELECT a.id AS aufmass_id, a.titel AS aufmass_titel, p.id AS pos_id, p.name AS pos_name, p.menge AS pos_menge
            FROM aufmass a
            JOIN projekt_positionen p ON CAST(a.position_id AS INTEGER) = p.id
            WHERE a.id = ?
        `).get(aufmassId);
        assert.ok(joinCheck, 'SQL-Join zwischen Aufmaß und projekt_positionen muss matchen');
        assert.equal(joinCheck.pos_id, posId);
        assert.equal(joinCheck.pos_name, 'Erdaushub Baugrube');
        assert.equal(joinCheck.pos_menge, 150);

        // Weitere Validierungen der Projektpositionen
        const reloadedPos2 = reloadedProj.positionen.find(p => p.name === 'Bewehrungsstahl B500B');
        assert.equal(reloadedPos2.preis, 1320.0, 'Preisänderung an Position 2 muss gespeichert worden sein');
        const reloadedPos4 = reloadedProj.positionen.find(p => p.name === 'Sauberkeitsschicht C12/15');
        assert.ok(reloadedPos4 && reloadedPos4.id > 0, 'Neue Position 4 muss persistiert worden sein');
        assert.notEqual(reloadedPos4.id, posId);

        // 11.6: Negativ-Szenario: Löschschutz für Projektposition mit verknüpftem Aufmaß (Aufmaß-Integritätsschutz)
        // Versuche, das Projekt mit einem Positionen-Array zu speichern, aus dem die Position mit verknüpftem Aufmaß entfernt wurde
        const positionsWithoutPos1 = reloadedProj.positionen.filter(p => p.id !== posId);
        assert.equal(positionsWithoutPos1.length, 3, 'Array enthält alle Positionen außer der verknüpften Aufmaß-Position pos1');

        await assert.rejects(
            async () => {
                await controllingRepo.saveProjekt({
                    ...reloadedProj,
                    positionen: positionsWithoutPos1
                });
            },
            (err) => {
                // 1. Der Fehler wird mit aussagekräftigem Text geworfen
                assert.ok(
                    err.message.includes('Löschen der Projektposition verhindert'),
                    `Fehler muss Löschschutz signalisieren, war: ${err.message}`
                );
                assert.ok(
                    err.message.includes(String(posId)),
                    `Fehler muss die betroffene Positions-ID #${posId} enthalten, war: ${err.message}`
                );
                assert.ok(
                    err.message.includes('Erdaushub Baugrube'),
                    `Fehler muss den Positionsnamen ("Erdaushub Baugrube") enthalten, war: ${err.message}`
                );
                return true;
            },
            'Löschen einer Position mit verknüpftem Aufmaß muss durch saveProjekt strikt verhindert werden'
        );

        // 2. Die Position in der SQLite-Datenbank wurde NICHT gelöscht (Rollback)
        const pos1StillInDb = db.prepare('SELECT * FROM projekt_positionen WHERE id = ?').get(posId);
        assert.ok(pos1StillInDb, 'Projektposition mit verknüpftem Aufmaß darf nach abgelehntem Löschen NICHT gelöscht worden sein');
        assert.equal(pos1StillInDb.id, posId);
        assert.equal(pos1StillInDb.name, 'Erdaushub Baugrube');

        // 3. Das Aufmaß ist weiterhin intakt verknüpft
        const aufmassStillIntact = await aufmassRepo.getAufmassById(aufmassId);
        assert.ok(aufmassStillIntact, 'Aufmaß muss weiterhin existieren');
        assert.equal(aufmassStillIntact.position_id, String(posId), 'Aufmaß position_id muss weiterhin unverändert auf posId verweisen');
        assert.equal(aufmassStillIntact.projekt_id, projId, 'Aufmaß projekt_id muss intakt bleiben');
        assert.equal(aufmassStillIntact.positionen.length, 2, 'Aufmaß-Unterpositionen müssen intakt bleiben');
    } finally {
        try {
            db.close();
            if (fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath);
        } catch (_err) {}
    }
});

if (IS_ELECTRON_AS_NODE) {
    console.log('ANGEBOT_LIFECYCLE_TESTS_PASSED');
}

