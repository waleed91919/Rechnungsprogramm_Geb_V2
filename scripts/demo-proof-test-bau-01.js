const path = require('path');
const os = require('os');
const fs = require('fs');

(async () => {
    let exitCode = 0;
    const protocol = [];
    const log = (msg) => {
        console.log(msg);
        protocol.push(msg);
    };

    const tmpDbPath = path.join(os.tmpdir(), `test-bau-01-${Date.now()}-${process.pid}.sqlite`);
    process.env.RECHNUNGSPROGRAMM_DB_PATH = tmpDbPath;

    try {
        log(`[INFO] Start TEST-BAU-01 Demo-Proof`);
        log(`[INFO] Temp DB: ${tmpDbPath}`);

        const { db, repositories } = require('../db.js');
        const { DATEVExporter } = require('../js/datev.js');

        if (!db || !repositories || !repositories.documentRepo || !DATEVExporter) {
            throw new Error("Failed to load required dependencies");
        }

        log(`[PASS] Setup Database initialized`);

        log(`[INFO] Step 2: Data Creation (Angebot, AB)`);

        const kunde = db.prepare("INSERT INTO kunden (name) VALUES ('TEST-BAU-01 GmbH')").run();
        const kundeId = kunde.lastInsertRowid;

        const proj = db.prepare("INSERT INTO projekte (name, kundeId) VALUES ('TEST-BAU-01', ?)").run(kundeId);
        const projektId = proj.lastInsertRowid;

        const angebotId = await repositories.documentRepo.saveDocument({
            type: 'angebot',
            typ: 'ANGEBOT',
            nr: 'ANG-2026-001',
            kundeId,
            projektId,
            status: 'ENTWURF',
            version: 2,
            netto: 2500,
            steuer: 475,
            brutto: 2975,
            positionen: [{ menge: 1, preis: 2500, mwst: 19 }]
        });

        db.prepare("UPDATE dokumente SET status = 'ANGENOMMEN', angebot_status = 'ANGENOMMEN' WHERE id = ?").run(angebotId);
        log(`[PASS] Angebot V2 erstellt (ID: ${angebotId}, Netto 2500 / Brutto 2975)`);

        const auftragId = await repositories.documentRepo.saveDocument({
            type: 'auftrag',
            typ: 'AUFTRAG',
            nr: 'AB-2026-001',
            kundeId,
            projektId,
            status: 'Bestätigt',
            netto: 2500,
            steuer: 475,
            brutto: 2975,
            parent_angebot_id: angebotId,
            positionen: [{ menge: 1, preis: 2500, mwst: 19 }]
        });
        log(`[PASS] Auftragsbestätigung (AB) erstellt (ID: ${auftragId})`);

        log(`[INFO] Step 3: Aufmaß and Abschlagsrechnungen`);

        const pp = db.prepare("INSERT INTO projekt_positionen (projekt_id, name, menge, einheit, preis) VALUES (?, 'TEST', 1, 'Stk', 0)").run(projektId);
        const ppId = pp.lastInsertRowid;

        const am = db.prepare("INSERT INTO aufmass (projekt_position_id, titel) VALUES (?, ?)").run(ppId, "Aufmaß 1");
        const amId = am.lastInsertRowid;

        const blatt = db.prepare("INSERT INTO aufmass_blaetter (project_id, blatt_nummer, titel) VALUES (?, 'B1', 'Blatt 1')").run(projektId);
        const blattId = blatt.lastInsertRowid;

        db.prepare("INSERT INTO aufmass_zeilen (uuid, blatt_id, oz_code, zeilen_nr, rechenansatz, ergebnis, formel_reb) VALUES ('uuid-1', ?, '01.01', 1, '1', 1, '91')").run(blattId);

        const l1Id = await repositories.documentRepo.saveDocument({
            type: 'rechnung',
            rechnungsart: 'ABSCHLAG',
            nr: 'L1-2026',
            datum: '2026-10-01',
            kundeId,
            projektId,
            status: 'Offen',
            netto: 1300,
            steuer: 247,
            brutto: 1547,
            positionen: [{ menge: 1, preis: 1300, mwst: 19 }]
        });
        log(`[PASS] L1 (Abschlag 1) erstellt (ID: ${l1Id}, Netto 1300 / Brutto 1547)`);

        const n1Id = await repositories.documentRepo.saveDocument({
            type: 'angebot',
            typ: 'NACHTRAG',
            nr: 'N1-2026',
            kundeId,
            projektId,
            status: 'ENTWURF',
            netto: 300,
            steuer: 57,
            brutto: 357,
            positionen: [{ menge: 1, preis: 300, mwst: 19 }]
        });
        db.prepare("UPDATE dokumente SET status = 'GENEHMIGT' WHERE id = ?").run(n1Id);
        log(`[PASS] Nachtrag N1 erstellt und genehmigt (ID: ${n1Id}, Netto 300)`);

        const l2Id = await repositories.documentRepo.saveDocument({
            type: 'rechnung',
            rechnungsart: 'ABSCHLAG',
            nr: 'L2-2026',
            datum: '2026-10-02',
            kundeId,
            projektId,
            status: 'Offen',
            netto: 2800,
            steuer: 532,
            brutto: 3332,
            positionen: [{ menge: 1, preis: 2800, mwst: 19 }],
            verrechnungen: []
        });
        log(`[PASS] L2 (Abschlag 2) erstellt (ID: ${l2Id}, Netto 2800)`);

        log(`[INFO] Step 4: Schlussrechnung and Negative Test`);
        const schlussId = await repositories.documentRepo.saveDocument({
            type: 'rechnung',
            rechnungsart: 'SCHLUSSRECHNUNG',
            nr: 'SR-2026',
            datum: '2026-10-08',
            kundeId,
            projektId,
            status: 'Offen',
            netto: 0,
            steuer: 0,
            brutto: 0,
            positionen: [],
            verrechnungen: [
                { vorherige_rechnung_id: l1Id, abzugsbetrag_netto: 1300, abzugsbetrag_brutto: 1547 },
                { vorherige_rechnung_id: l2Id, abzugsbetrag_netto: 2800, abzugsbetrag_brutto: 3332 }
            ]
        });
        log(`[PASS] Schlussrechnung erstellt (ID: ${schlussId}, Netto 0)`);

        let secondSchlussFailed = false;
        try {
            await repositories.documentRepo.saveDocument({
                type: 'rechnung',
                rechnungsart: 'SCHLUSSRECHNUNG',
                nr: 'SR-2026-2',
                datum: '2026-10-09',
                kundeId,
                projektId,
                status: 'Offen',
                netto: 0,
                steuer: 0,
                brutto: 0,
                positionen: [],
                verrechnungen: [
                    { vorherige_rechnung_id: l1Id, abzugsbetrag_netto: 1300, abzugsbetrag_brutto: 1547 },
                    { vorherige_rechnung_id: l2Id, abzugsbetrag_netto: 2800, abzugsbetrag_brutto: 3332 }
                ]
            });
        } catch (e) {
            log(`[PASS] Negativ-Probe (2. Schlussrechnung) erfolgreich abgewiesen: ${e.message}`);
            if (e.message.includes('Schlussrechnung pro Projekt') || e.message.includes('SR-2026')) {
                secondSchlussFailed = true;
            }
        }

        if (!secondSchlussFailed) {
            throw new Error("Negativ-Probe fehlgeschlagen: Zweite Schlussrechnung wurde erlaubt.");
        }

        // --- Step 5: Teilzahlung, Mahnung, DATEV, and Protocol ---
        log(`[INFO] Step 5: Teilzahlung, Mahnung, DATEV Export`);

        const bk = db.prepare("INSERT INTO bank_konten (kontoname, bankname, iban, bic, kontoinhaber) VALUES ('K1', 'B1', 'DE123', 'BIC', 'Ich')").run();
        const bkId = bk.lastInsertRowid;

        const tx = db.prepare("INSERT INTO bank_transaktionen (bank_konto_id, buchungstag, betrag, dedup_hash) VALUES (?, '2026-10-08', 1500, 'hash1')").run(bkId);
        const txId = tx.lastInsertRowid;

        const matches = [{
            dokumentId: l1Id,
            transaktionId: txId,
            betrag: 1500,
            differenzGrund: 'TEILZAHLUNG'
        }];
        repositories.bankingRepo.applyPaymentMatching(matches);

        const l1Doc = db.prepare("SELECT * FROM dokumente WHERE id = ?").get(l1Id);
        if (!l1Doc) throw new Error("L1 not found");

        // Wait, applyPaymentMatching updates `bezahlt_betrag` instead of `zahlbetrag`.
        const offenenBetrag = l1Doc.offener_betrag !== null ? l1Doc.offener_betrag : ((l1Doc.brutto || 0) - (l1Doc.bezahlt_betrag || 0));
        log(`[PASS] Teilzahlung auf L1 angewendet. Brutto: ${l1Doc.brutto}, Bezahlt: ${l1Doc.bezahlt_betrag}, Offen: ${offenenBetrag}, Status: ${l1Doc.status}`);

        if (offenenBetrag !== 47) {
            throw new Error(`Erwarteter offener Betrag 47, aber war ${offenenBetrag}`);
        }
        if (l1Doc.status === 'Bezahlt') {
            throw new Error("Negativ-Probe fehlgeschlagen: Status ist 'Bezahlt' obwohl noch 47 offen sind.");
        }

        db.prepare("UPDATE dokumente SET mahnungLevel = 1 WHERE id = ?").run(l1Id);
        log(`[PASS] Mahnung-Stufe auf L1 gesetzt (mahnungLevel = 1)`);

        const kundeData = db.prepare("SELECT * FROM kunden WHERE id = ?").get(kundeId);
        // DATEVExporter.generateEXTFContent needs an array of document objects
        const datevRechnungen = [l1Doc];
        const datevKunden = [kundeData];
        const datevExportStr = DATEVExporter.generateEXTFContent(datevRechnungen, datevKunden, { skr: 'SKR03' });

        if (datevExportStr && datevExportStr.includes('EXTF')) {
            log(`[PASS] DATEV Export erfolgreich (String beginnt mit EXTF, Länge: ${datevExportStr.length})`);
        } else {
            throw new Error("DATEV Export fehlgeschlagen oder String ungültig");
        }

        // Protocol Write
        const protocolContent = `# TEST-BAU-01 Demo-Proof Protokoll\n\n## Logs\n${protocol.join('\n')}\n\n## Status\nPASS\n`;
        const outDir = path.join(__dirname, '../tests/test_results');
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }
        fs.writeFileSync(path.join(outDir, 'demo-proof-TEST-BAU-01.md'), protocolContent);
        log(`[PASS] Protokoll geschrieben nach tests/test_results/demo-proof-TEST-BAU-01.md`);

    } catch (e) {
        console.error("Test Script Error:");
        console.error(e);
        exitCode = 1;
    } finally {
        if (fs.existsSync(tmpDbPath)) {
            try {
                fs.unlinkSync(tmpDbPath);
                fs.unlinkSync(tmpDbPath + '-wal');
                fs.unlinkSync(tmpDbPath + '-shm');
            } catch(e) {}
        }
        process.exit(exitCode);
    }
})();
