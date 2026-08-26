# Zusammenfassung der Entwicklungssitzung – F11 Validierung & Reparatur (Banking / OPOS / SEPA)

**Datum:** 26.08.2026
**Projekt:** W-Link Rechnungsprogramm / Bau-ERP V2
**Ziel:**
1. Unabhängige Validierung der am selben Tag implementierten Kernmodule (Bankimport CAMT/CSV, OPOS-Matching, SEPA pain.008) gegen Plan, ISO-20022-/EPC-Standards und deutsche Rechtslage – inklusive Web-Recherche.
2. Behebung aller gefundenen Mängel über einen freigegebenen Master-Reparaturplan.

**Methodik:** 4-Subagent-Kette: **Prüfung** (3 parallele Review-Agents: ISO-20022-Parser-Review, Compliance-/Rechtsrecherche EPC/UStG/GoBD, Struktur-/Integrations-Review) -> **Plan** (`compliance-e-rechnung`, 675-Zeilen-Masterplan) -> **Umsetzung** (`compliance-e-rechnung`, Phasen A–E) -> **unabhängige Verifikation** (eigener Testlauf).

---

## 1. Teil A: Validierung (Vorher-Zustand)

Vollständiger Prüfbericht: [`doc/validierungsbericht_2026-08-26.md`](validierungsbericht_2026-08-26.md). Ergebnis: Architektur/DB-Schema/IPC solide und plan-konform, Testsuite grün (167/167), aber **7 Blocker** [B1]–[B7] sowie mehrere Regel- und GoBD-Schwächen – alle von den bestehenden Tests nicht abgedeckt:

| Nr. | Befund | Schwere |
|---|---|---|
| [B1] | pain.008-XML invalide: `<BchBookg>` statt `<BtchBookg>`, `<BIC>` statt `<BICFI>` (.001.08), `ChrgBr=SLEV` fehlte | Blocker (Bankablehnung) |
| [B2] | Skonto-Felder (`skonto_tage/skonto_prozent`) wurden in `saveDocument` nie persistiert → Matching Pass 2 wirkungslos | Blocker |
| [B3] | Kunden-Bankdaten wurden in `saveKunde` nie persistiert → Matching Pass 4 wirkungslos | Blocker |
| [B4] | `getSepaLaeufe()` SQL-Fehler (`created_at` vs. `erstellt_am`) → SEPA-Tab leer | Blocker |
| [B5] | CSV-Auto-Erkennung: Soll-Buchungen (DB/CoBa) mit falschem Vorzeichen importiert | Blocker (GoBD) |
| [B6] | CAMT.052 ohne Statusfilter → PDNG-Vormerkungen als Buchungen importiert | Blocker (Doppelbuchung) |
| [B7] | Gläubiger-ID ohne Validierung; Demo-ID `DE98ZZZ09999999999` als stiller Fallback | Blocker |

Wichtige Recherche-Ergebnisse (mit Primärquellen im Bericht):
- **§ 14 Abs. 4 UStG (Skonto):** seit 01.01.2025 durch JStG 2024 wieder korrekt (Nr. 7 n.F.) – nur Präzisierung auf „Satz 1 Nr. 7" nötig.
- TARGET2-Kalender und D-1-Vorlauf regelkonform; VATEX-EU-AE/BT-120-Wortlaut korrekt.
- Testlücke diagnostiziert: String-Includes statt XSD-Validierung, In-Memory-Objekte statt DB-Roundtrips.

---

## 2. Teil B: Reparaturplan

[`plans/banking-sepa-reparatur-plan.md`](../plans/banking-sepa-reparatur-plan.md): 20 Fixes ([B1]–[B7] P1, Fix 8–12 P2, Fix 13–20 P3), 27 Umsetzungsschritte in 5 Phasen (A Schema/Migrationen → B Controller → C db.js → D IPC/Frontend → E Tests), 27 neue Testfälle T-R1–T-R27, 21 Akzeptanzkriterien, Definition of Done. Alle Datei:Zeile-Anker vorab im Code verifiziert.

---

## 3. Teil C: Umsetzung (Nachher-Zustand)

### Phase A – Schema/Migrationen
- Neue additive Migrationen: `dokumente.was_locked_vor_zahlung`; `zahlung_zuordnungen.storno_flag/storniert_am/storno_grund`.
- Seed `glaeubiger_id` = Leerstring statt Demo-ID (Fix 7).

### Phase B – Controller
- **SepaController.js:** `<BtchBookg>` korrekt; versionsabhängig `<BICFI>` (.001.08) vs. `<BIC>` (.001.02-Fallback); `<ChrgBr>SLEV</ChrgBr>` in XSD-Sequenz CdtrAgt→ChrgBr→CdtrSchmeId→DrctDbtTxInf; `CdtrSchmeId` über `Id/PrvtId/Othr`; Multi-PmtInf je Sequenztyp (`_buildPmtInfBlock`), `MIXED` wird am Generator abgewiesen; `DtOfSgntr` ohne Ausführungsdatum-Fallback (Hardfail); neuer Validator `validateGlaeubigerId` (ISO 7064 Mod 97-10 ohne CBC).
- **BankingController.js:** CSV-Profil-Reihenfolge Deutsche Bank/Commerzbank vor Sparkasse (Vorzeichen-Fix); CAMT `Sts`-Filter (PDNG/INFO werden übersprungen und gezählt), `RvslInd=true` übersprungen, `<Rpt>` setzt `import_format='CAMT052'`; Namespace-Präfix-Toleranz durch Normalisierung am Parser-Eingang; `_isDateWithinDays` fail-closed; Encoding-Heuristik `detectEncodingProblem`.

### Phase C – db.js
- Persistenz: `skonto_tage/skonto_prozent/sepa_mandat_id` in `applyDocumentWrite` + `bulkSaveDocuments`; Kunden-Bankdaten in `saveKunde`/`bulkSaveKunden` (+ Bestandsschutz im Frontend bei leerer Eingabe).
- `getSepaLaeufe()` sortiert nach `erstellt_am`.
- `createSepaRun`: Gläubiger-ID-Hardfail, PreNot-Frist-Enforcement mit Bestätigungsoption (`preNotFristBestaetigt`) + Audit, SeqTp je Position, CORE/B2B-Mismatch-Filterung mit Warning + Audit.
- Lifecycle: FRST→RCUR erst bei `exportSepaRunXml`; neue Methoden `storniereSepaLauf` und `markiereRuecklastschrift` mit Rücknahme des Sequenztyps.
- GoBD: Lock-Herkunft gesichert/wiederhergestellt beim Unmatching; Zuordnungen nur noch logisch storniert (`storno_flag=0` in allen Lesefiltern); Primanota/AcctSvcrRef als primärer Dedup-Key vor Hash-Fallback.

### Phase D – IPC/Frontend
- Neue IPC-Kanäle `db:storniereSepaLauf`, `db:markiereRuecklastschrift` (main.js + preload.js; Gesamtbestand nun 18 Banking/SEPA-Kanäle).
- Drag&Drop-Dropzone im Import-Tab; Mandats-Anlege-Modal (Tab 4) mit Referenz-Vorschlag; Laufdetail-Modal mit Rücklastschrift-/Storno-Buttons; PreNot-Warnung ohne Demo-ID; Frist-Bestätigungscheckbox (Tab 3); Encoding-Fallback beim Upload.
- Rechtsverweise präzisiert: „§ 14 Abs. 4 Satz 1 Nr. 7 UStG" mit §§ 10/17-UStG-Tooltip; §14b-Hinweis von „Privatkunde" entkoppelt.

### Phase E – Tests & Nachweis
- **194/194 Tests bestanden** (+27 gegenüber Baseline 167; 0 Fehler) – unabhängig verifiziert per `npm test`.
- Neue Datei [`tests/sepa_lauf_lifecycle.test.js`](../tests/sepa_lauf_lifecycle.test.js); Erweiterungen an `banking_parser.test.js`, `opos_matching.test.js`, `sepa_pain008.test.js` (T-R1–T-R27 vollständig).
- **Echter XSD-Gegencheck:** drei generierte pain.008-Varianten (Einzelblock .001.08, Multi-PmtInf FRST+RCUR .001.08, Legacy .001.02) gegen offizielle ISO-20022-XSDs per JDK-Validator geprüft – jeweils **XSD_VALID**; Artefakte unter [`output/sepa_smoke/`](../output/sepa_smoke/).
- Smoke-CAMT mit `camt:`-Präfixen + PDNG: nur BOOK importiert, `skippedPending=1`.
- Audit-Kette (`verifiziereAuditKette().valid === true`) in allen DB-Lifecycle-Läufen geprüft.
- Akzeptanzkriterien: **21 von 21 erfüllt**.

---

## 4. Dateiübersicht

### Geändert:
- [`schema.js`](../schema.js), [`db.js`](../db.js) (Migrationen, Persistenz, SEPA-Lifecycle, Storno-Flag)
- [`controllers/SepaController.js`](../controllers/SepaController.js), [`controllers/BankingController.js`](../controllers/BankingController.js) (Generator-Neubau, Parser-Fixes, Validatoren)
- [`main.js`](../main.js) & [`preload.js`](../preload.js) (2 neue IPC-Kanäle)
- [`code.html`](../code.html), [`js/banking.js`](../js/banking.js), [`js/kunden.js`](../js/kunden.js) (UI-Fixes/-Erweiterungen)
- [`doc/changelog.md`](changelog.md) (Reparatur-Eintrag), [`plans/banking-sepa-reparatur-plan.md`](../plans/banking-sepa-reparatur-plan.md) (als abgeschlossen markiert)

### Neu erstellt:
- [`doc/validierungsbericht_2026-08-26.md`](validierungsbericht_2026-08-26.md) (Prüfbericht Teil A)
- [`plans/banking-sepa-reparatur-plan.md`](../plans/banking-sepa-reparatur-plan.md) (Masterplan Teil B)
- [`tests/sepa_lauf_lifecycle.test.js`](../tests/sepa_lauf_lifecycle.test.js)
- [`output/sepa_smoke/`](../output/sepa_smoke/) (XSD-Validierungsartefakte)

## 5. Testergebnisse
Gesamttestlauf `npm test`: **194 von 194 bestanden (0 Fehler)** – Zuwachs dieser Sitzung: +27 Tests. Kein Commit durchgeführt (offen für Freigabe).
