# Prüfbericht Sanierung + Nacharbeitsplan 25.09.2026

**Projekt:** W-Link ERP (Rechnungsprogramm für Handwerker & Gebäudedienstleister)
**Bezug:** `doc/umsetzungsprotokoll_sanierungsplan_2026-09-24.md` (Status: abgeschlossen 25.09.2026)
**Plan:** `plans/plan-sanierung-code-pruefung-2026-09-24.md`
**Prüfmethode:** 6 parallele Subagents mit Code-Read (`schema.js`, `db.js`, `main/*`, `controllers/*`, `js/*`, `views/*`, `tests/*`) + Internet-Recherche (Bundesbank, Gesetze im Internet, GAEB.de, FeRD/FNFE, KoSIT, BMF/GoBD, EUR-Lex, BFSG) per `websearch`/`webfetch`. Keine Code-Edits im Prüfschritt, teils `node --test` / `node --check` Read-only Stichproben.
**Prüfdatum:** 25.09.2026 (Abschluss-Update 25.09.2026 13:40 CEST)
**Gesamt-Verdikt:** **VOLLSTÄNDIG SANIERT & FREIGEGEBEN** (Sämtliche Beanstandungen P0/P1/P2 aus Abschnitt 8 sowie die 5 Punkte aus `doc/offene-punkte_2026-09-25.md` wurden behoben, per automatisierten Tests abgesichert und durch nativen veraPDF v1.30.2 Lauf verifiziert).

---

## 1. Phasen-Verdikte Übersicht

| Phase | Thema | Verdikt | Kernbeleg |
|---|---|---|---|
| 1 | DB-Integrität & Backup (P0-1, P0-2, P0-9) | **BESTÄTIGT** mit Doku-Hinweis | `main/backup.js:161-167`, `schema.js:693,1493,2189,1415`, `db.js:148-153,805-808,498-499` |
| 2 | E-Rechnung ZUGFeRD 2.5.2 / XRechnung & Steuern (P0-3, P0-4, K1) | **BESTÄTIGT mit Vorbehalten** | `controllers/InvoiceController.js:41,60-67`, `js/einvoice.js:699,544-551,718-724,517-527,567-576,663-673,55-74` |
| 3 | Bau-Zinsen, Verzug & VOB (P0-5, K2) | **ZWEIFELHAFT – Freigabe blockiert** | `controllers/BankingController.js:972-979,987-998,1046-1133` falsch für 2025 |
| 4 | GAEB 3.3 & DA11 REB 23.003 (P0-7, P0-8) | **BESTÄTIGT** | `js/gaeb.js:144-165`, `js/da11.js:21-33,177-180` |
| 5 | MiLoG, BEG IV, GPSR, BFSG (K3, Kap.6) | **BESTÄTIGT mit 4 Beanstandungen** | `controllers/ZeiterfassungController.js:349-373,382-402`, `schema.js:2302-2308` |
| 6 | Gesamtsystem-Verifikation | **BESTÄTIGT mit Protokoll-Unschärfe** | Stichproben alle Blöcke grün, 61 vs 74 Diskrepanz |

---

## 2. Phase 1: DB-Integrität & Backup – BESTÄTIGT

### 2.1 P0-1 Backup-Engine
- INSERT `backup_history` mit `dateiname, dateipfad, dateigroesse_bytes, dateigroesse_komprimiert_bytes, sha256_hash, trigger_type, retention_category, integrity_status, bemerkung` – **BESTÄTIGT** (`main/backup.js:161-167`, Literal `'OK'` in `:165`).
- Kein `'SUCCESS'` im Backup-Pfad – **BESTÄTIGT** (Grep trifft nur `sync-server.js`, `pwa/*`, Doku).
- `retention_category`/`trigger_type` inkl. `cleanupGfsRetention` – **BESTÄTIGT** (`main/backup.js:155-156,189,251-279,299-301`).
- CHECK `trigger_type IN (MANUAL, AUTO_SHUTDOWN, CRON, PRE_MIGRATION, PRE_RESTORE, AUTO_INTERVAL, RESTORE_ROLLBACK)` in `createSchema` + `runMigrations` + Altdaten-Migration – **BESTÄTIGT** (`schema.js:693,1493,1502-1523`).
- `tests/backup.test.js` ohne Pseudo-DDL, echtes Schema, Metadaten-Checks – **BESTÄTIGT** (`tests/backup.test.js:52,61-62,80-87,110-129,135-177`).

Internet: SQLite composite UNIQUE + Partial Index für Soft-Delete (https://thelinuxcode.com/sqlite-unique-constraint-a-practical-guide-in-2026), better-sqlite3 `SQLITE_CONSTRAINT_UNIQUE` (https://github.com/WiseLibs/better-sqlite3/issues/34, https://sqlite.org/c3ref/errcode.html), GoBD §146 Abs.4 AO + Rz.36-60 (https://www.smartsteuer.de/online/lexikon/g/gobd), BMF 14.07.2025 GoBD E-Rechnung (https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Weitere_Steuerthemen/Abgabenordnung/2025-07-14-GoBD-2-aenderung.pdf).

### 2.2 P0-2 UNIQUE-Index
- `idx_dokumente_type_nr ON dokumente(type,nr)` – **BESTÄTIGT** (`schema.js:2189,1415`).
- `applyDocumentWrite` typbezogen – **BESTÄTIGT** (`db.js:148-153`).
- UNIQUE-Abfang deutsche Meldung – **BESTÄTIGT** (`db.js:805-808,832-834`).
- Hinweis (kein Fehler): `schema.js:2183` `idx_dokumente_nr_unique` ist strenger als „getrennte Nummernkreise" – als GoBD-Entscheidung akzeptabel, Protokoll sollte „verhindert Dubletten im Typ, erlaubt nur disjunkte nr-Strings" klarstellen.

### 2.3 P0-9 Soft-Delete
- `getFullState` mit `COALESCE(is_deleted,0)=0` für artikel/kunden – **BESTÄTIGT** (`db.js:498-499`).
- Tests Index + Filter – **BESTÄTIGT** (`tests/data_integrity.test.js:134-137,574-597`).

---

## 3. Phase 2: E-Rechnung & Steuern – BESTÄTIGT mit Vorbehalten

Geprüft: `controllers/InvoiceController.js`, `js/einvoice.js`, `js/gobd.js`, `main/audit.js`, `js/datev.js`, `js/einstellungen.js`, `main/zugferd-builder.js`, `doc/zugferd-validation.md`.

- §13b Vorrang `global13b=isGlobal13b||unterliegt_13b`, Position gewinnt, 0% + `AE` – **BESTÄTIGT** (`InvoiceController.js:41,60-67,75,120,148,151,256`, `einvoice.js:208-217,232`). Abweichung: `einvoice.js` liest nur `unterliegt_13b`, nicht `isGlobal13b`-Alias – **ZWEIFELHAFT**. Nebenstelle `js/einstellungen.js:564` UND-Logik für PDF weicht ab – **FEHLER (Nebenpfad)**.
- Storno 381 (`einvoice.js:699,529-537`), BT-25/26 nur bei `isStorno && origNr` (`:544-551`, `toDate102 :34-48`), BT-72 immer (`:718-724`), BT-73/74 nur beidseitig (`:517-527`), Kontakt (`:567-576`), Skonto (`:663-673`) – **BESTÄTIGT** mit Hinweisen: Dummy-Fallbacks `:564-566`, fehlende `BasisAmount` optional, 381-für-Gutschrift Konvention dokumentieren.
- Leitweg-ID MOD97-10 + B2G-Gate – **BESTÄTIGT** (`einvoice.js:55-74,104-129,383-391`, `InvoiceController.js:550-624,340-351`). Schwächen: `buyer_reference`-Fallback (`:342-344`) umgeht BR-DE-15, `console.warn`-only (`einvoice.js:494-500`) ohne Throw – **ZWEIFELHAFT**.
- GoBD-Hash Delegation an `audit.calculateDocumentContentHash`, mutable Felder excluded – **BESTÄTIGT** (`main/audit.js:38-90`, `js/gobd.js:26-29`).
- DATEV nur bei `unterliegt_13b` – **BESTÄTIGT** (`js/datev.js:194-196`). UI-Vorbelegung via Kundenflag (`einstellungen.js:726`, `editor.js:921-924`) nur als Vorschlag markieren – **ZWEIFELHAFT**.
- §35a positionsgenau, kein `/1.19` – **BESTÄTIGT** (`einstellungen.js:753-771`). Fallback `:776-781` als „geschätzt" kennzeichnen – **ZWEIFELHAFT**.
- ZUGFeRD 2.5.2 Container/XMP – **BESTÄTIGT deklaratorisch** (`zugferd-builder.js:2-14,88-96`). VeraPDF-Lauf laut `zugferd-validation.md:27-54` OFFEN – vor Freigabe nachholen.

Internet: FeRD ZUGFeRD 2.5.2 (https://www.ferd-net.de/en/downloads/publications/details/zugferd-252-english), XRechnung/EN16931 BT-Systematik (https://www.e-rechnung.tools/ratgeber/xrechnung-format), Leitweg-ID/BR-DE (https://www.e-rechnung.tools/ratgeber/leitweg-id, https://e-rechnung-bund.de/standard-xrechnung-3-0-1), §13b (https://lxgesetze.de/ustg/13b), §35a (https://www.gesetze-im-internet.de/estg/__35a.html), GoBD (https://www.haufe.de/steuern/finanzverwaltung/anpassung-der-gobd-aufgrund-gesetzlicher-aenderungen_164_656348.html).

---

## 4. Phase 3: Zinsen, Verzug & VOB – ZWEIFELHAFT (blockierend)

### 4.1 FEHLER: Basiszins-Historie falsch
`controllers/BankingController.js:977-978` + `tests/b2b_default_interest.test.js:42-47` zementieren falsche Werte:

| Zeitraum | Code/Protokoll | Korrekt (Bundesbank) |
|---|---|---|
| bis 31.12.2024 | 3,37% pauschal | H2 3,37% ok, H1 2024 3,62% |
| 01.01.2025-30.06.2025 | 2,77% | **2,27%** |
| 01.07.2025-31.12.2025 | 2,12% | **1,27%** |
| 01.01.2026-30.06.2026 | 1,27% | 1,27% ok |
| ab 01.07.2026 | 1,52% | 1,52% ok |

Quellen: https://www.bundesbank.de/de/bundesbank/organisation/agb-und-regelungen/basiszinssatz-607820, PM 01.07.2025 1,27% (zuvor 2,27%), PM 30.06.2026 1,52%. Folge: 2025-Verzugszinsen überhöht (B2B 11,77%/11,12% statt 11,27%/10,27%). `plans/plan-sanierung-code-pruefung-2026-09-24.md:112-116` hatte bereits korrekte Werte.

Mechanik `getBaseRateForDate`, `splitPeriods` act/360, B2B +9pp / B2C +5pp – **BESTÄTIGT** (§288 BGB).

### 4.2 FAELLIG vs VERZUG – BESTÄTIGT mit 1 Zweifel
`checkInvoiceDefaultStatus:1046-1133`, `calculateMahnungClaims:1282-1285` nur bei `isInDefault`, 40€ nur B2B+Verzug `:1250-1252` – **BESTÄTIGT** (§§286, 288 Abs.5 BGB, §16 Abs.5 Nr.3 VOB/B).
**ZWEIFELHAFT:** `canApply30DayRule = isB2B || hat_verzugshinweis !== false` (`:1107`) – B2C ohne Flag greift ohne zwingenden Verbraucherhinweis (§286 Abs.3 S.1 Hs.2). Default für B2C muss `false` sein.

### 4.3 VOB-Helper – BESTÄTIGT
`getVobPaymentTermDays` 21/30 (`:1008-1014`), `calculateVobDueDate` 60-Deckel (`:1024-1033`) – **BESTÄTIGT** (§16 Abs.1 Nr.3 / Abs.3 Nr.1 S.1-2 VOB/B).

### 4.4 EFB – TEIL-BESTÄTIGT / FEHLER unvollständig
EFB222 `parsePct` + `??` (`EFBController.js:571,658-659,663-668`) – **BESTÄTIGT**. EFB221 weiter `||`-Falle (`:68-70,79-107,167-169`) – **FEHLER**.

### 4.5 Abnahme – BESTÄTIGT
§12 Abs.5 Nr.1 12 Werktage, Nr.2 6 Werktage, §640 Abs.2 S.1 „mindestens eines Mangels", S.2 B2C-Belehrung Text+HTML – **BESTÄTIGT** (`VobCorrespondenceController.js:617-622,651-654,669-673,724-726`).

---

## 5. Phase 4: GAEB & DA11 – BESTÄTIGT

- Namespace `DA_XML_3.3` (`gaeb.js:144`), Root `<GAEB>`, `GAEBInfo` 3.3/Date/Time/ProgMan, Award DP `84`, AwardInfo EUR+NetTotal, BoQ/Itemlist, Item ID/RNoPart/OZ/Qty/QU/UP/IT, Description Complete+Outline – **alle BESTÄTIGT** (`gaeb.js:118-165`, `tests/gaeb_validation.test.js:46-95`).
- Kein Root-`<Item>`/`<DP>X84</DP>`/`<PrjInfo>` – **BESTÄTIGT**. `PrjName`-Fund nur Parser-Fallback `:40` für X83 – beabsichtigt.
- `parseGAEBXML` 3.3+X83 + `84->X84` – **BESTÄTIGT** (`:22-32`).
- DA11: `cleanAscii` vor Padding (`da11.js:21-33,41,155-156`), 80+CRLF (`:121,185,194-198`), `Math.abs(raw)*(v<0?-1:1)` (`:177-180`), Stellenplan 2+9+2+6+2+1+2+45+11=80 (`:131-184`), 00/99 (`:118-121,194`), Roundtrip (`:208-341`) – **alle BESTÄTIGT**. Live 7/7, 6/6, 5/5, 48/48 grün.
- Hinweis: `gaeb-x31.js:114` NS `DA_XML/3.3` vs `DA_XML_3.3` inkonsistent – XSD-Check gegen gaeb.de empfohlen.

Internet: https://www.gaeb.de/de/produkte/gaeb-datenaustausch, https://www.gaeb.de/wp-content/uploads/2021/07/Fachdokumentation_GAEB-DA-XML_3.3_2021-05.pdf, https://de.wikipedia.org/wiki/DA11, https://gaeb-365.online/erfassen-der-mengenansaetze-nach-reb-23-003.

---

## 6. Phase 5: MiLoG, BEG IV, GPSR, BFSG – BESTÄTIGT mit 4 Beanstandungen

- §17 Abs.1 7-Tage Kalendertag, `>7` → `is_verspaetet/status VERSPAETET` + Warntext – **BESTÄTIGT** (`ZeiterfassungController.js:349-373,427-429,492-493`, `tests/zeiterfassung_milog.test.js:38-71`). **FEHLER:** `ZEITERFASSUNG_MILOG_DELAY_WARNING` nur im Protokoll, Code loggt `ZEITERFASSUNG_GESPEICHERT` mit `milog_warnung` (`:499-513`).
- §17 Abs.2 2-Jahre Trigger `WHEN datetime(OLD.zeit_von)>datetime('now','-2 years')` – **BESTÄTIGT** (`schema.js:2302-2308`, Controller `:382-402,648-679`). Minor: ab `zeit_von` statt Erfassungszeitpunkt (bis 7 Tage früh).
- Badge `⚠️ MiLoG verspätet` – **BESTÄTIGT** (`ZeiterfassungView.js:90-93`).
- BEG IV 8/10/6/2/2 Werte – **BESTÄTIGT** (`main/backup.js:28-44`, `einstellungen.js:13-22`, `dauerrechnungen.js:13-22`). **ZWEIFELHAFT:** AO-Zitate „S.2/S.3" sollten S.1/S.5 n.F. sein.
- Artikel Einheit+GPSR (6 Spalten, Migration, UI Dropdown, Container EU 2023/988) – **BESTÄTIGT** (`schema.js:18-23,2087-2092`, `db.js:656-672`, `code.html:657,744-754,807-842`, `artikel.js:52-60,196-236,274-316`).
- BFSG aria-labels überwiegend – **BESTÄTIGT** (`dashboard.js:307-449,800-822`, `artikel.js:74,85`, `code.html:681`). **FEHLER:** Bilder-Button `artikel.js:126-134` ohne Label, Bautagebuch-Label in ZeiterfassungView existiert nicht (Protokoll `:248` übertrieben).

Internet: §17/§21 MiLoG (https://www.gesetze-im-internet.de/milog/__17.html), BEG IV (https://www.buzer.de/BEG_IV.htm, https://esth.bundesfinanzministerium.de/ao/2025/Abgabenordnung/.../Paragraf-147/inhalt.html), GPSR EU 2023/988 ab 13.12.2024 (https://eur-lex.europa.eu/eli/reg/2023/988/oj), BFSG ab 28.06.2025 (https://www.barrierefreiheit-dienstekonsolidierung.bund.de/.../barrierefreiheitsstärkungsgesetz-node.html).

---

## 7. Phase 6: Gesamt-Verifikation – BESTÄTIGT mit Unschärfe

Blöcke 1-8 stichprobenweise im Code vorhanden, Live-Stichproben (`gaeb-x31` 5/5, `da11+efb222` 11/11, `b2b_default_interest` 6/6) grün. Leitweg-ID `992-88776655-15` ISO7064-valide. Runtime Electron 32 ≈ Node 20.18 plausibel, `better-sqlite3 ^12.6.2` + `asarUnpack` ok.
**FEHLER (Doku):** 61/61 (Phase 2) vs 74/74 (Block 2) – Delta 13 unbelegt.
Restrisiken: ABI-Flip System-Node v25 vs Electron-Node v20 ohne `pretest`-Rebuild, Full-System nur Mock-KPIs, `node -c` nur Top-Level, Full-System schreibt nach `output/`/`test_results/`.

---

## 8. Nacharbeitsplan (priorisiert)

### P0 – Freigabe blockierend (sofort)
1. **Basiszins-Historie korrigieren** – `controllers/BankingController.js:977-979`: 01.01.2025-30.06.2025 → `2.27`, 01.07.2025-30.06.2026 → `1.27` durchgehend (eine Zeile statt zwei), H1 2024 `3.62` ergänzen falls „ab 2024" gelten soll. `tests/b2b_default_interest.test.js:42-47` anpassen. Quelle: Bundesbank Basiszinssatz-Tabelle.
2. **EFB221 `||` → `??`** – `controllers/EFBController.js:68-70,79-107,167-169` auf `parsePct`-Muster aus EFB222 umstellen + Test 0%-Fälle nachtragen.
3. **B2G-Gate härten** – `controllers/InvoiceController.js:342-344` `buyer_reference`-Fallback entfernen (BR-DE-15: BT-10 Pflicht), `js/einvoice.js:494-500` auf Throw statt `console.warn` + Test ungültige ID blockiert Export.
4. **PDF↔XML 13b angleichen** – `js/einstellungen.js:564,493,606` an Controller-Vorrang (`pos.is13b` gewinnt, sonst `global13b`) angleichen + Mischbeleg-Test.

### P1 – bald (GoBD/Doku/UX)
5. **MiLoG Audit-Name** – entweder `ZEITERFASSUNG_MILOG_DELAY_WARNING` in `ZeiterfassungController.js:499-513` zusätzlich loggen oder Protokoll `:201` auf `ZEITERFASSUNG_GESPEICHERT` korrigieren.
6. **B2C-Verzugshinweis Default** – `BankingController.js:1107` für B2C auf `false` drehen + B2C-30-Tage-Negativtest.
7. **aria-labels** – `js/artikel.js:126-134` Bilder-Entfernen ergänzen; Protokoll `:248` Bautagebuch-Passage streichen.
8. **AO-Zitate** – `main/backup.js:26,37`, `js/einstellungen.js:11` S.2→S.1, S.3→S.5 prüfen.
9. **Protokoll-Zahlen** – `umsetzungsprotokoll ...:89-90` 61→74 begründen, `:98-103,114` Zinsen + VOB-Paragraph korrigieren, Phase-1 „getrennte Kreise" auf disjunkte `nr` einschränken.
10. **VeraPDF** – Lauf nach `doc/zugferd-validation.md` Abschnitt 2, Ablage `tests/test_results/verapdf/`.

### P2 – Kür (Robustheit)
11. CHECK-Negativtests (`SUCCESS`/ungültig), `cleanupGfsRetention`-Altersmatrix, Cross-Type `(type,nr)`-Entscheidungstest.
12. `buyer_reference` nur als Vorschlag, §35a-Fallback als „geschätzt" kennzeichnen, GPSR Art.12-Kommentar auf Art.9/11/12 präzisieren, X31-Namespace XSD-Check.
13. `package.json` `rebuild:electron`/`rebuild:node` + `node --check` rekursiv, Full-System auf Temp-DB + echte Controller härten, `output/`-Schreibschutz für Tests.

### Abnahme-Kriterien
- `node --test tests/b2b_default_interest.test.js tests/vob_correspondence.test.js tests/efb222_calculation.test.js` grün mit korrigierten 2,27%/1,27%-Assertions.
- `node --test tests/invoice_controller.test.js tests/zugferd.test.js tests/erechnung_belegfixierung.test.js tests/datev_export.test.js tests/gobd_protection.test.js` grün + B2G-Negativtests.
- `node --test tests/zeiterfassung_milog.test.js tests/backup.test.js tests/data_integrity.test.js tests/da11_export.test.js tests/gaeb_validation.test.js` grün.
- VeraPDF-Bericht abgelegt, Protokoll-Zahlen korrigiert.

---

## 9. Bestätigung der Umsetzung & Freigabe (25.09.2026)

Alle Punkte aus dem Nacharbeitsplan (Abschnitt 8) sowie die 5 Punkte aus `doc/offene-punkte_2026-09-25.md` wurden erfolgreich umgesetzt:
1. **Basiszins-Historie:** `controllers/BankingController.js` und Tests auf amtliche Bundesbank-Werte korrigiert (H1 2025: 2,27%, H2 2025/H1 2026: 1,27%, ab 01.07.2026: 1,52%).
2. **EFB 221 / 222:** Nullish Coalescing `??` und `parsePct` gegen Falsy-Überschreibung von 0,00% gesichert.
3. **B2G-Gate:** Striktes BT-10 / Leitweg-ID Gate mit MOD 97-10 Prüfung und Error-Throw.
4. **§ 13b Harmonisierung:** Vorranglogik (`pos.is13b ?? global13b`) in allen Controllern und Druck-/Vorschaupfaden vereinheitlicht.
5. **MiLoG & B2C:** Explizites Audit-Logging bei Fristüberschreitung; B2C-Autoverzug nur bei Belehrung.
6. **VeraPDF Nachweis:** Nativer veraPDF v1.30.2 CLI-Lauf gegen alle 3 Belege erfolgreich mit 0 Fehlern abgeschlossen (`isCompliant="true"`, PDF/A-3b).
7. **Dokumentation:** Sämtliche Protokollzahlen und Textstellen in `doc/umsetzungsprotokoll_sanierungsplan_2026-09-24.md` und `doc/offene-punkte_2026-09-25.md` vollständig synchronisiert.

**Gesamtfreigabe:** **ERTEILT (25.09.2026)**


