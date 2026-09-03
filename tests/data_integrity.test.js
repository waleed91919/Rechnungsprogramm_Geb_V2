/**
 * data_integrity.test.js - Datenintegrität: UNIQUE-Constraints, atomares Storno,
 * Cent-Rounding, Doppelverrechnungs-Schutz, §48b-Felder (Bug A/B), FK-Erzwingung
 *
 * Läuft gegen eine isolierte SQLite-Test-DB (RECHNUNGSPROGRAMM_DB_PATH), damit die
 * echte Anwendungsdatenbank nie berührt wird. Das native better-sqlite3 ist für die
 * Electron-Runtime gebaut - im System-Node wird der Test daher einmalig über die
 * Electron-Binary (ELECTRON_RUN_AS_NODE=1) erneut ausgeführt (Muster wie
 * gobd_protection.test.js).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const IS_ELECTRON_AS_NODE = !!process.versions.electron;
const RUN_INNER_MARKER = 'DATA_INTEGRITY_INNER_RUN';

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

function getDbModule() {
    // Muss gesetzt sein, BEVOR db.js geladen wird
    const tmpDb = path.join(os.tmpdir(), `data-integrity-test-${Date.now()}-${process.pid}.sqlite`);
    process.env.RECHNUNGSPROGRAMM_DB_PATH = tmpDb;
    const { db, dbAPI } = require('../db.js');
    return { db, dbAPI, tmpDb };
}

// ---------------------------------------------------------------------------
// Einstiegspunkt im System-Node: Re-Execution unter Electron-as-Node
// ---------------------------------------------------------------------------
if (!IS_ELECTRON_AS_NODE && !canLoadBetterSqlite()) {
    test('Datenintegrität (DB-Ebene, via Electron-as-Node Runtime)', () => {
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

        assert.match(stdout, /DATA_INTEGRITY_DB_TESTS_PASSED/, 'Alle Integritäts-Assertions müssen unter der App-Runtime bestehen');
    });
} else {
    // -------------------------------------------------------------------------
    // Eigentliche Tests (laufen unter Electron-as-Node)
    // -------------------------------------------------------------------------
    const { db, dbAPI, tmpDb } = getDbModule();
    const InvoiceController = require('../controllers/InvoiceController');
    const EInvoiceEngine = require('../js/einvoice');
    const { createSchema, ensureUniqueConstraints, dedupeDuplicateDocumentNumbers, dedupeDuplicateVerrechnungen, dedupeDuplicateRetentions } = require('../schema.js');

    // FK-Fixtures: Frische Schemata erzwingen dokumente.kundeId -> kunden(id)
    db.prepare("INSERT OR IGNORE INTO kunden (id, name, createdAt) VALUES (1, 'Testkunde', CURRENT_TIMESTAMP)").run();
    db.prepare("INSERT OR IGNORE INTO kunden (id, name, createdAt, is_subcontractor, sec48b_status, sec48b_valid_until) VALUES (2, 'Sub GmbH', CURRENT_TIMESTAMP, 1, 'NONE', NULL)").run();
    db.prepare("INSERT OR IGNORE INTO kunden (id, name, createdAt, is_subcontractor, sec48b_status) VALUES (3, 'NormalLieferant KG', CURRENT_TIMESTAMP, 0, 'NONE')").run();
    db.prepare("INSERT OR IGNORE INTO kunden (id, name, createdAt, is_subcontractor, sec48b_status, sec48b_valid_until) VALUES (4, 'SubMitFreistellung GmbH', CURRENT_TIMESTAMP, 1, 'VALID', '2099-12-31')").run();

    function baseDoc(overrides = {}) {
        return {
            type: 'rechnung',
            nr: 'RE-INT-BASIS',
            datum: '2026-08-01',
            faellig: '2026-08-31',
            kundeId: 1,
            status: 'Ausstehend',
            netto: 100,
            steuer: 19,
            brutto: 119,
            positionen: [
                { name: 'Testleistung', menge: 1, einheit: 'Stk.', preis: 100, mwst: 19 }
            ],
            isLocked: false,
            ...overrides
        };
    }

    // Sperrt einen Beleg ohne Inhaltsänderung (GoBD erlaubt das nur mit IDENTISCHEM Inhalt inkl. nr)
    async function lockDoc(id, nr) {
        return await dbAPI.saveDocument(baseDoc({ id, nr, isLocked: true }));
    }

    test.after(() => {
        try { db.close(); } catch (_e) { /* ignore */ }
        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.rmSync(tmpDb + suffix, { force: true }); } catch (_e) { /* ignore */ }
        }
    });

    test('UNIQUE-Constraint auf dokumente.nr', async (t) => {
        await t.test('(a) zweiter Insert mit gleicher Nummer wirft mit deutscher Meldung', async () => {
            const nr = 'RE-INT-DUP-001';
            const id1 = await dbAPI.saveDocument(baseDoc({ nr }));
            assert.ok(id1, 'Erster Beleg muss angelegt werden');

            await assert.rejects(
                () => dbAPI.saveDocument(baseDoc({ nr })),
                /bereits vergeben/i
            );
            assert.equal(db.prepare('SELECT COUNT(*) AS c FROM dokumente WHERE nr=?').get(nr).c, 1);
        });

        await t.test('(a2) UNIQUE-Index existiert physisch in der DB', () => {
            const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_dokumente_nr_unique'").get();
            assert.ok(idx, 'Index idx_dokumente_nr_unique muss existieren');

            let threw = false;
            try {
                db.prepare("INSERT INTO dokumente (type, nr, status) VALUES ('rechnung', 'RAW-DUP-CHECK', 'Entwurf')").run();
                db.prepare("INSERT INTO dokumente (type, nr, status) VALUES ('rechnung', 'RAW-DUP-CHECK', 'Entwurf')").run();
            } catch (_e) {
                threw = true;
            }
            assert.ok(threw, 'Roher SQL-Insert mit Duplikatnummer muss am UNIQUE-Index scheitern');
        });
    });

    test('Doppelverrechnungs-Schutz', async (t) => {
        await t.test('(b) bereits anderweitig verrechnete Vorrechnung wirft klarer Fehler', async () => {
            const r1Id = await dbAPI.saveDocument(baseDoc({ nr: 'RE-INT-VOR-001', status: 'Bezahlt' }));
            await lockDoc(r1Id, 'RE-INT-VOR-001');

            const r2Id = await dbAPI.saveDocument(baseDoc({
                nr: 'RE-INT-SCHLUSS-002',
                verrechnungen: [{ vorherige_rechnung_id: r1Id, abzugsbetrag_netto: 50 }]
            }));
            assert.equal(db.prepare('SELECT COUNT(*) AS c FROM rechnung_verrechnungen WHERE aktuelle_rechnung_id=?').get(r2Id).c, 1);

            // Zweite Rechnung versucht dieselbe Vorrechnung abzuziehen -> Fehler
            await assert.rejects(
                () => dbAPI.saveDocument(baseDoc({
                    nr: 'RE-INT-SCHLUSS-003',
                    verrechnungen: [{ vorherige_rechnung_id: r1Id, abzugsbetrag_netto: 50 }]
                })),
                /Doppelverrechnung blockiert|bereits .* verrechnet/i
            );
            assert.equal(db.prepare('SELECT COUNT(*) AS c FROM dokumente WHERE nr=?').get('RE-INT-SCHLUSS-003').c, 0, 'Fehlerhafter Beleg darf nicht existieren');

            // Doppeltes Paar innerhalb desselben Belegs -> Fehler (Vorabprüfung;
            // nutzt eine noch nicht global verwendete Vorrechnung)
            const r1bId = await dbAPI.saveDocument(baseDoc({ nr: 'RE-INT-VOR-001B', status: 'Bezahlt' }));
            await lockDoc(r1bId, 'RE-INT-VOR-001B');
            await assert.rejects(
                () => dbAPI.saveDocument(baseDoc({
                    nr: 'RE-INT-SCHLUSS-004',
                    verrechnungen: [
                        { vorherige_rechnung_id: r1bId, abzugsbetrag_netto: 25 },
                        { vorherige_rechnung_id: r1bId, abzugsbetrag_netto: 25 }
                    ]
                })),
                /nur einmal/i
            );

            // Selbstverweis -> Fehler
            await assert.rejects(
                () => dbAPI.saveDocument(baseDoc({
                    id: r2Id,
                    nr: 'RE-INT-SCHLUSS-002',
                    verrechnungen: [{ vorherige_rechnung_id: r2Id, abzugsbetrag_netto: 1 }]
                })),
                /mit sich selbst/i
            );

            // Eigene Verrechnung darf bei erneutem Speichern unverändert bleiben (Delete+Insert)
            await dbAPI.saveDocument(baseDoc({ id: r2Id, nr: 'RE-INT-SCHLUSS-002', verrechnungen: [{ vorherige_rechnung_id: r1Id, abzugsbetrag_netto: 50 }] }));
            assert.equal(db.prepare('SELECT COUNT(*) AS c FROM rechnung_verrechnungen WHERE aktuelle_rechnung_id=?').get(r2Id).c, 1);
        });

        await t.test('(b2) UNIQUE-Index auf Verrechnungspaaren existiert', () => {
            const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_verrechnungen_paar_unique'").get();
            assert.ok(idx, 'Index idx_verrechnungen_paar_unique muss existieren');
        });
    });

    test('Atomares Storno', async (t) => {
        await t.test('(c1) Happy Path: Original storniert + Gutschrift vorhanden + Audit-Kette valide', async () => {
            const invId = await dbAPI.saveDocument(baseDoc({ nr: 'INV-ATOM-001', status: 'Ausstehend' }));

            const res = await dbAPI.storniereRechnung(
                { id: invId, status: 'Storniert' },
                baseDoc({
                    nr: 'STORNO - INV-ATOM-001',
                    datum: '2026-08-02',
                    faellig: '2026-08-02',
                    netto: -100,
                    steuer: -19,
                    brutto: -119,
                    status: 'Bezahlt',
                    isLocked: true
                })
            );

            assert.ok(res.success);
            assert.equal(db.prepare('SELECT status FROM dokumente WHERE id=?').get(invId).status, 'Storniert');

            const stornoRow = db.prepare('SELECT id, status FROM dokumente WHERE nr=?').get('STORNO - INV-ATOM-001');
            assert.ok(stornoRow, 'Gutschrift muss existieren');
            assert.equal(stornoRow.status, 'Bezahlt');

            const chain = dbAPI.verifiziereAuditKette();
            assert.equal(chain.valid, true, JSON.stringify(chain.errors));
        });

        await t.test('(c2) Fehler im zweiten Schritt rollt ALLES zurück (kein halber Zustand)', async () => {
            const invId = await dbAPI.saveDocument(baseDoc({ nr: 'INV-ATOM-002', status: 'Ausstehend' }));

            // Gutschrift verletzt den FK auf kunden (kundeId 987654 existiert nicht)
            // -> der INSERT schlägt NACH der Statusänderung fehl; alles muss zurückgerollt sein.
            await assert.rejects(
                () => dbAPI.storniereRechnung(
                    { id: invId, status: 'Storniert' },
                    baseDoc({
                        nr: 'STORNO - INV-ATOM-002',
                        kundeId: 987654,
                        netto: -100,
                        steuer: -19,
                        brutto: -119,
                        status: 'Bezahlt',
                        isLocked: true
                    })
                )
            );

            assert.equal(db.prepare('SELECT status FROM dokumente WHERE id=?').get(invId).status, 'Ausstehend', 'Original darf NICHT als Storniert hängen bleiben');
            assert.equal(db.prepare('SELECT COUNT(*) AS c FROM dokumente WHERE nr=?').get('STORNO - INV-ATOM-002').c, 0, 'Keine halbe Gutschrift erlaubt');

            // Auch kein STATUS_GEÄNDERT-Audit für das fehlgeschlagene Storno
            const leakedAudit = db.prepare("SELECT COUNT(*) AS c FROM audit_logs WHERE entity_id=? AND action='STATUS_GEÄNDERT'").get(invId).c;
            assert.equal(leakedAudit, 0, 'Rollback muss auch den Audit-Eintrag entfernen');

            const chain = dbAPI.verifiziereAuditKette();
            assert.equal(chain.valid, true, JSON.stringify(chain.errors));
        });

        await t.test('(c3) Erneutes Storno derselben Rechnung scheitert an doppelter Gutschriftnummer', async () => {
            const invId = db.prepare('SELECT id FROM dokumente WHERE nr=?').get('INV-ATOM-001').id;
            await assert.rejects(
                () => dbAPI.storniereRechnung(
                    { id: invId, status: 'Storniert' },
                    baseDoc({ nr: 'STORNO - INV-ATOM-001', netto: -100, steuer: -19, brutto: -119, isLocked: true })
                ),
                /bereits vergeben/i
            );
        });
    });

    test('Cent-Rounding im Rechenkern', async (t) => {
        await t.test("(d1) Float-Falle 19.99 € x 19 % = 3.80 € Steuer", () => {
            const res = InvoiceController.calculateTotals({
                mode: 'netto',
                positionen: [{ menge: 1, preis: 19.99, rabatt: 0, mwst: 19 }]
            });
            assert.equal(res.positionenNetto, 19.99);
            assert.equal(res.totalTax, 3.80, '19.99*0.19=3.7981 muss zu 3.80 gerundet werden');
            assert.equal(res.bruttoNachRabatt, 23.79);
            assert.equal(res.zahlbetrag, 23.79);
        });

        await t.test('(d2) Mehrere Positionen: Summen bleiben centgenau', () => {
            const res = InvoiceController.calculateTotals({
                mode: 'netto',
                positionen: [
                    { menge: 3, preis: 33.33, rabatt: 0, mwst: 7 },
                    { menge: 1, preis: 0.03, rabatt: 0, mwst: 19 }
                ]
            });
            assert.equal(res.positionenNetto, 100.02);
            assert.equal(res.taxBreakdown.reduce((s, x) => s + x.amount, 0), res.totalTax, 'Steuer-Aufschlüsselung muss exakt auf die Gesamtsteuer gehen');
            assert.equal(Math.round((res.nettoNachRabatt + res.totalTax) * 100) / 100, res.bruttoNachRabatt, 'Netto + Steuer muss exakt Brutto ergeben');
        });

        await t.test('(d3) Globalrabatt-Verteilung über zwei Steuergruppen geht exakt auf', () => {
            const res = InvoiceController.calculateTotals({
                mode: 'netto',
                globalRabatt: { value: 7.77, type: '€' },
                positionen: [
                    { menge: 1, preis: 123.45, rabatt: 0, mwst: 19 },
                    { menge: 1, preis: 67.89, rabatt: 0, mwst: 7 }
                ]
            });
            const sumBreakdown = res.taxBreakdown.reduce((s, x) => s + x.amount, 0);
            assert.equal(Math.round(sumBreakdown * 100) / 100, res.totalTax, 'Steuer-Aufschlüsselung muss exakt der Gesamtsteuer entsprechen');
            assert.equal(res.bruttoNachRabatt, InvoiceController.round2(res.nettoNachRabatt + res.totalTax), 'Brutto muss exakt Netto + Steuer sein');
            assert.equal(InvoiceController.round2(res.bruttoNachRabatt), res.bruttoNachRabatt, 'Ergebnis muss bereits centgerundet sein');
        });

        await t.test('(d4) Einbehalt + Verrechnung + Anzahlung: Zahlbetrag centgenau', () => {
            const res = InvoiceController.calculateTotals({
                mode: 'netto',
                sicherheitseinbehaltProzent: 5,
                verrechnungen: [{ abzugsbetrag_netto: 100.555 }],
                anzahlung: 12.345,
                positionen: [{ menge: 1, preis: 999.99, rabatt: 0, mwst: 19 }]
            });
            assert.equal(res.verrechnungenSummeNetto, 100.56, 'Verrechnungssumme muss auf Cent gerundet werden');
            assert.equal(res.anzahlung, 12.35, 'Anzahlung muss auf Cent gerundet werden');
            assert.equal(res.sicherheitseinbehaltNetto, 50.00, 'Einbehalt 5% von 999.99 -> 50.00');
            assert.equal(res.totalTax, 170.89);
            assert.equal(res.bruttoNachRabatt, 1070.32);
            assert.equal(res.zahlbetrag, 1007.97);
        });

        await t.test('(d5) §13b-Kombination bleibt korrekt gerundet', () => {
            const res = InvoiceController.calculateTotals({
                mode: 'netto',
                isGlobal13b: true,
                positionen: [
                    { menge: 1, preis: 1000, rabatt: 0, mwst: 19, is13b: true },
                    { menge: 2, preis: 500, rabatt: 0, mwst: 19, is13b: false }
                ]
            });
            // Ohne Einbehalt/Verrechnung ist die Bemessungsgrundlage voll:
            // 19% auf die Normalposition (1000 netto) -> exakt 190.00
            assert.equal(Math.round(res.totalTax * 100) / 100, 190);
        });
    });

    test('Konsistenz Rechenkern <-> E-Rechnung (einvoice.computeTotals)', async (t) => {
        const cases = [
            {
                name: 'gemischte Steuersätze',
                positionen: [
                    { menge: 2, preis: 50, rabatt: 0, mwst: 19 },
                    { menge: 1, preis: 100, rabatt: 0, mwst: 7 }
                ]
            },
            {
                name: 'Float-Falle 19.99',
                positionen: [{ menge: 1, preis: 19.99, rabatt: 0, mwst: 19 }]
            },
            {
                name: 'Positions-Rabatt mit Bruchcent',
                positionen: [{ menge: 3, preis: 9.57, rabatt: 7.5, mwst: 19 }]
            },
            {
                name: 'Globalrabatt absolut',
                globalRabatt: { value: 11.11, type: '€' },
                positionen: [
                    { menge: 1, preis: 123.45, rabatt: 0, mwst: 19 },
                    { menge: 2, preis: 17.17, rabatt: 0, mwst: 7 }
                ]
            },
            {
                name: 'Globalrabatt Prozent',
                globalRabatt: { value: 12.5, type: '%' },
                positionen: [{ menge: 4, preis: 44.44, rabatt: 0, mwst: 19 }]
            }
        ];

        for (const c of cases) {
            await t.test(`Fall "${c.name}" liefert identische Summen`, () => {
                const totals = InvoiceController.calculateTotals({
                    mode: 'netto',
                    globalRabatt: c.globalRabatt || { value: 0, type: '%' },
                    positionen: c.positionen
                });

                const doc = {
                    nr: 'CONSISTENCY-001',
                    datum: '2026-08-01',
                    netto: totals.nettoNachRabatt,
                    steuer: totals.totalTax,
                    brutto: totals.bruttoNachRabatt,
                    globalRabattAbzug: totals.abzug,
                    anzahlung: totals.anzahlung,
                    zahlbetrag: totals.zahlbetrag,
                    positionen: c.positionen
                };
                const eInv = EInvoiceEngine.computeTotals(doc);

                assert.equal(eInv.lineNettoSum, totals.positionenNetto, 'Positionssumme muss identisch sein');
                assert.equal(eInv.taxBasis, totals.nettoNachRabatt, 'Netto nach Rabatt muss identisch sein');
                assert.equal(eInv.taxTotal, totals.totalTax, 'Gesamtsteuer muss identisch sein');
                assert.equal(eInv.grandTotal, totals.bruttoNachRabatt, 'Brutto muss identisch sein');
                assert.equal(eInv.duePayable, totals.zahlbetrag, 'Zahlbetrag muss identisch sein');
            });
        }

        await t.test('§13b (explizit je Position markiert) ebenfalls identisch', () => {
            const positionen = [
                { menge: 1, preis: 500, rabatt: 0, mwst: 19, is13b: true },
                { menge: 1, preis: 333.33, rabatt: 0, mwst: 7, is13b: false }
            ];
            const totals = InvoiceController.calculateTotals({
                mode: 'netto', isGlobal13b: true, positionen
            });
            const eInv = EInvoiceEngine.computeTotals({
                nr: 'CONSISTENCY-13B', datum: '2026-08-01',
                netto: totals.nettoNachRabatt, steuer: totals.totalTax, brutto: totals.bruttoNachRabatt,
                globalRabattAbzug: totals.abzug, anzahlung: totals.anzahlung, zahlbetrag: totals.zahlbetrag,
                unterliegt_13b: 1, positionen
            });
            assert.equal(eInv.lineNettoSum, totals.positionenNetto);
            assert.equal(eInv.taxBasis, totals.nettoNachRabatt);
            assert.equal(eInv.taxTotal, totals.totalTax);
            assert.equal(eInv.grandTotal, totals.bruttoNachRabatt);
        });
    });

    test('Bug A: getEingangsrechnungen läuft auf frischer DB ohne Fehler', async (t) => {
        await t.test('(e) Abfrage (mit und ohne Projektfilter) inkl. sec48b-Felder', async () => {
            db.prepare(`
                INSERT INTO eingangsrechnungen (project_id, lieferant_id, rechnungs_nr, rechnungs_datum, faelligkeits_datum, betrag_netto, betrag_ust, betrag_brutto, kostenart)
                VALUES (NULL, 1, 'ER-BUGA-001', '2026-08-01', '2026-08-31', 100, 19, 119, 'MATERIAL')
            `).run();

            const all = await dbAPI.getEingangsrechnungen();
            assert.ok(Array.isArray(all));
            assert.ok(all.length >= 1);
            assert.ok('sec48b_valid_until' in all[0], 'sec48b_valid_until muss aus dem Join kommen');

            const filtered = await dbAPI.getEingangsrechnungen(1);
            assert.ok(Array.isArray(filtered), 'Projektgefilterte Abfrage darf nicht werfen');
        });
    });

    test('Bug B: is_subcontractor steuert 15%-Bauabzugseinbehalt', async (t) => {
        await t.test('(f1) Subunternehmer ohne Freistellung -> 15% Einbehalt', async () => {
            const res = await dbAPI.saveEingangsrechnung({
                lieferant_id: 2,
                rechnungs_nr: 'ER-BUGB-001',
                rechnungs_datum: '2026-08-01',
                faelligkeits_datum: '2026-08-31',
                betrag_netto: 10000,
                steuersatz: 19,
                kostenart: 'SUBCONTRACTOR'
            });
            // Basis ist der Bruttobetrag (10000 * 1.19 = 11900), 15% davon = 1785.00
            assert.equal(res.bauabzugsteuer, 1785, '15% Bauabzugsteuer auf Bruttobasis müssen einbehalten werden');
            const row = db.prepare('SELECT sec48b_geprueft, bauabzugsteuer_einbehalten FROM eingangsrechnungen WHERE id=?').get(res.id);
            assert.equal(row.sec48b_geprueft, 1);
            assert.equal(row.bauabzugsteuer_einbehalten, 1785);
        });

        await t.test('(f2) Kein Subunternehmer -> kein Einbehalt trotz kostenart SUBCONTRACTOR', async () => {
            const res = await dbAPI.saveEingangsrechnung({
                lieferant_id: 3,
                rechnungs_nr: 'ER-BUGB-002',
                rechnungs_datum: '2026-08-01',
                faelligkeits_datum: '2026-08-31',
                betrag_netto: 10000,
                steuersatz: 19,
                kostenart: 'SUBCONTRACTOR'
            });
            assert.equal(res.bauabzugsteuer, 0);
        });

        await t.test('(f3) Subunternehmer mit gültiger Freistellung -> kein Einbehalt', async () => {
            const res = await dbAPI.saveEingangsrechnung({
                lieferant_id: 4,
                rechnungs_nr: 'ER-BUGB-003',
                rechnungs_datum: '2026-08-01',
                faelligkeits_datum: '2026-08-31',
                betrag_netto: 10000,
                steuersatz: 19,
                kostenart: 'SUBCONTRACTOR'
            });
            assert.equal(res.bauabzugsteuer, 0, 'Gültige §48b-Freistellung muss den Einbehalt verhindern');
        });
    });

    test('FK-Klauseln für frische Datenbanken', async (t) => {
        await t.test('(i) dokumente mit unbekanntem Kunden wirft FOREIGN KEY Fehler', async () => {
            await assert.rejects(
                () => dbAPI.saveDocument(baseDoc({ nr: 'RE-INT-FK-001', kundeId: 424242 })),
                /FOREIGN KEY/i
            );
            assert.equal(db.prepare('SELECT COUNT(*) AS c FROM dokumente WHERE nr=?').get('RE-INT-FK-001').c, 0);
        });
    });

    test('Migrationen: deterministische Deduplizierung vor UNIQUE-Indizes', async (t) => {
        await t.test('(h1) doppelte Belegnummern erhalten Suffixe (-2, -3)', () => {
            const mem = new (require('better-sqlite3'))(':memory:');
            try {
                createSchema(mem);
                mem.prepare("INSERT INTO dokumente (type, nr, status) VALUES ('rechnung', 'DUP-KEY', 'Entwurf')").run();
                mem.prepare("INSERT INTO dokumente (type, nr, status) VALUES ('rechnung', 'DUP-KEY', 'Entwurf')").run();
                mem.prepare("INSERT INTO dokumente (type, nr, status) VALUES ('rechnung', 'DUP-KEY', 'Entwurf')").run();
                mem.prepare("INSERT INTO dokumente (type, nr, status) VALUES ('rechnung', 'DUP-KEY-2', 'Entwurf')").run(); // Kollision mit Suffix vorsehen

                const renamed = dedupeDuplicateDocumentNumbers(mem);
                assert.equal(renamed.length, 2);

                const nrs = mem.prepare('SELECT nr FROM dokumente ORDER BY id ASC').all().map(r => r.nr);
                // Ältester behält Original; die Suffixe umgehen deterministisch die belegte '-2'
                assert.equal(nrs[0], 'DUP-KEY');
                assert.deepEqual([...nrs].sort(), ['DUP-KEY', 'DUP-KEY-2', 'DUP-KEY-3', 'DUP-KEY-4']);
                assert.ok(renamed.every(r => r.neu !== r.alt));

                // Danach darf der UNIQUE-Index fehlerfrei entstehen
                ensureUniqueConstraints(mem);
                assert.throws(() => mem.prepare("INSERT INTO dokumente (type, nr, status) VALUES ('rechnung', 'DUP-KEY', 'x')").run());
            } finally {
                mem.close();
            }
        });

        await t.test('(h2) doppelte Verrechnungspaare: neuester Eintrag bleibt', () => {
            const mem = new (require('better-sqlite3'))(':memory:');
            try {
                createSchema(mem);
                // FK-Fixtures: verrechnungen referenzieren dokumente
                const insDoc = mem.prepare("INSERT INTO dokumente (type, nr, kundeId, status) VALUES ('rechnung', ?, NULL, 'Entwurf')");
                insDoc.run('MEM-D-VOR');
                insDoc.run('MEM-D-AKT-10');
                insDoc.run('MEM-D-AKT-11');
                const ids = mem.prepare('SELECT id FROM dokumente ORDER BY id ASC').all().map(r => r.id);
                const vorId = ids[0], akt10 = ids[1], akt11 = ids[2];

                const ins = mem.prepare('INSERT INTO rechnung_verrechnungen (aktuelle_rechnung_id, vorherige_rechnung_id, abzugsbetrag_netto) VALUES (?, ?, ?)');
                ins.run(akt10, vorId, 100);
                ins.run(akt10, vorId, 200); // Duplikat (neuer)
                ins.run(akt10, vorId, 300); // Duplikat (neuester - bleibt)
                ins.run(akt11, vorId, 400); // anderes aktuelles Dokument - bleibt

                const removed = dedupeDuplicateVerrechnungen(mem);
                assert.equal(removed, 2);

                const rest = mem.prepare('SELECT * FROM rechnung_verrechnungen ORDER BY id ASC').all();
                assert.equal(rest.length, 2);
                assert.equal(rest.find(r => r.aktuelle_rechnung_id === akt10).abzugsbetrag_netto, 300, 'Neuester Eintrag muss behalten werden');
                assert.equal(rest.find(r => r.aktuelle_rechnung_id === akt11).abzugsbetrag_netto, 400);
            } finally {
                mem.close();
            }
        });

        await t.test('(h3) doppelte Sicherheitseinbehalte: neuester je Rechnung bleibt', () => {
            const mem = new (require('better-sqlite3'))(':memory:');
            try {
                createSchema(mem);
                mem.prepare("INSERT INTO projekte (id, name) VALUES (1, 'P')").run();
                mem.prepare("INSERT INTO dokumente (id, type, nr, kundeId, status) VALUES (100, 'rechnung', 'MEM-R-100', NULL, 'Entwurf')").run();
                mem.prepare("INSERT INTO dokumente (id, type, nr, kundeId, status) VALUES (101, 'rechnung', 'MEM-R-101', NULL, 'Entwurf')").run();
                const ins = mem.prepare('INSERT INTO security_retentions (project_id, invoice_id, amount, due_date) VALUES (?, ?, ?, ?)');
                ins.run(1, 100, 50, '2030-01-01');
                ins.run(1, 100, 75, '2030-01-01');
                ins.run(1, 101, 20, '2030-01-01');

                const removed = dedupeDuplicateRetentions(mem);
                assert.equal(removed, 1);

                const amounts = mem.prepare('SELECT amount FROM security_retentions ORDER BY id ASC').all().map(r => r.amount);
                assert.deepEqual(amounts, [75, 20]);
            } finally {
                mem.close();
            }
        });
    });

    // Abschlussmarker für den Wrapper-Lauf im System-Node
    console.log('DATA_INTEGRITY_DB_TESTS_PASSED');
}
