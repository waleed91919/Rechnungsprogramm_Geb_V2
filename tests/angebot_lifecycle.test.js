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

if (IS_ELECTRON_AS_NODE) {
    console.log('ANGEBOT_LIFECYCLE_TESTS_PASSED');
}
