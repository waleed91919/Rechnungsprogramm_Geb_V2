# Umsetzungsprotokoll: Sanierungsplan 24.09.2026
**Projekt:** W-Link ERP (Rechnungsprogramm für Handwerker & Gebäudedienstleister)  
**Plan:** `plans/plan-sanierung-code-pruefung-2026-09-24.md`  
**Startdatum:** 24.09.2026  
**Status:** Erfolgreich abgeschlossen (25.09.2026)  

---

## Phasenübersicht

| Phase | Bezeichnung | Status | Subagent / Bearbeiter | Abgeschlossen am |
|---|---|---|---|---|
| **Phase 1** | DB-Integrität & Backup-Crash (P0-1, P0-2, P0-9) | **Abgeschlossen** | Subagent `phase-1-db-backup` | 24.09.2026 |
| **Phase 2** | E-Rechnung ZUGFeRD 2.5.2 / XRechnung & Steuern (P0-3, P0-4, K1) | **Abgeschlossen** | Subagent `phase-2-erechnung-steuern` | 24.09.2026 |
| **Phase 3** | Bau-Zinsen, Verzug & VOB-Schriftverkehr (P0-5, K2) | **Abgeschlossen** | Subagent `phase-3-vob-zinsen` | 24.09.2026 |
| **Phase 4** | AVA-Schnittstellen GAEB 3.3 & DA11 REB 23.003 (P0-7, P0-8) | **Abgeschlossen** | Subagent `phase-4-gaeb-da11` | 24.09.2026 |
| **Phase 5** | Gebäude, Zeiterfassung MiLoG & GPSR/Stamm (K3, Kap. 6) | **Abgeschlossen** | Subagent `phase-5-milog-stamm` | 24.09.2026 |
| **Phase 6** | Gesamtsystem-Verifikation & Regressionstests | **Abgeschlossen** | Subagent `phase-6-verifikation` | 25.09.2026 |

---

## Detailliertes Durchführungsprotokoll

### Phase 1: DB-Integrität & Backup-Crash (P0-1, P0-2, P0-9) — 24.09.2026

- **P0-1 & K1-1: Backup-Engine repariert (`main/backup.js`, `schema.js`, `tests/backup.test.js`)**
  - In `main/backup.js` die INSERT-Query auf `backup_history` exakt an das Schema angepasst:
    `dateiname, dateipfad, dateigroesse_bytes, dateigroesse_komprimiert_bytes, sha256_hash, trigger_type, retention_category, integrity_status, bemerkung`.
  - Ungültigen Statuswert `'SUCCESS'` durch `'OK'` ersetzt.
  - `retention_category` und `trigger_type` konsistent überall übergeben und verarbeitet (inkl. GFS-Retention Bereinigung in `cleanupGfsRetention`).
  - In `schema.js` CHECK-Constraint auf `trigger_type` erweitert:
    `CHECK(trigger_type IN ('MANUAL', 'AUTO_SHUTDOWN', 'CRON', 'PRE_MIGRATION', 'PRE_RESTORE', 'AUTO_INTERVAL', 'RESTORE_ROLLBACK'))` (sowohl in `createSchema` als auch in `runMigrations` inkl. automatischer Migration für Altdatenbanken).
  - In `tests/backup.test.js` lokales Pseudo-DDL entfernt und Tests gegen echtes `createSchema` und `runMigrations` ausgeführt sowie Metadaten-Felder verifiziert.

- **P0-2: Composite UNIQUE-Index für Dokumentennummer (`schema.js`, `db.js`)**
  - In `schema.js` in `ensureUniqueConstraints` und `runMigrations`:
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_dokumente_type_nr ON dokumente(type, nr)` implementiert.
  - In `db.js` (`applyDocumentWrite`): Belegnummern-Prüfung um Dokumenttyp (`type`) ergänzt, sodass Nummernkreise typbezogen verwaltet werden.
  - In `db.js` (`saveDocument` und `bulkSaveDocuments`): SQLite-UNIQUE-Constraint-Fehler werden abgefangen und als verständliche deutsche Fehlermeldung (`"Die Belegnummer ... ist bereits vergeben."`) gemeldet.

- **P0-9: State-Filter für Soft-Delete in `getFullState()` (`db.js`)**
  - In `db.js` (`getFullState`):
    - `artikel: await dbQuery('SELECT * FROM artikel WHERE COALESCE(is_deleted, 0) = 0')`
    - `kunden: await dbQuery('SELECT * FROM kunden WHERE COALESCE(is_deleted, 0) = 0')`
  - In `tests/data_integrity.test.js`: Regressionstests für `idx_dokumente_type_nr` und Soft-Delete Filter in `getFullState()` hinzugefügt.

- **Testergebnisse:**
  - `node --test tests/backup.test.js`: **PASSED** (1/1 suites, 3 Assertions)
  - `node --test tests/data_integrity.test.js`: **PASSED** (1/1 suites, 36/36 Assertions inkl. neuer Soft-Delete- & Index-Prüfung)
  - `node --test tests/gobd_protection.test.js tests/invoice_model.test.js tests/dauerrechnung_crud.test.js tests/objekt_stamm.test.js`: **PASSED** (keine Regressionen)

---

### Phase 2: E-Rechnung ZUGFeRD 2.5.2 / XRechnung & Steuern (P0-3, P0-4, K1) — 24.09.2026

- **P0-3: § 13b UStG Vorranglogik im Rechnungs-Controller (`controllers/InvoiceController.js`)**
  - Vorranglogik implementiert: Positionsflag `pos.is13b` gewinnt explizit, wenn gesetzt. Falls nicht explizit gesetzt, greift das Belegflag `global13b` (`isGlobal13b || unterliegt_13b`).
  - Bei gesetztem Belegflag erhalten alle Positionen standardmäßig 0% Steuersatz und Reverse-Charge-Kategorie `AE`.
  - Berechnungen für Sicherheitseinbehalt, Einbehaltsbasis und Steuerausweis konsequent an `global13b` harmonisiert.
  - In `controllers/InvoiceController.js` und `tests/invoice_controller.test.js` verifiziert (Reine 13b-Belege, Mischbelege, explizites Positions-Opt-out).

- **P0-4 & K1-14, K1-12, K1-4: E-Rechnung CII & XRechnung Standard (`js/einvoice.js`, `controllers/InvoiceController.js`)**
  - **Storno TypeCode 381 (BT-3)**: Bei Stornobelegen (`isStorno` oder `rechnungsart === 'STORNO'`) wird TypeCode `381` statt `380` ausgegeben.
  - **InvoiceReferencedDocument (BT-25 / BT-26)**: In `<ram:ApplicableHeaderTradeSettlement>` wird der Verweis auf den Ursprungsbeleg mit `IssuerAssignedID` und `FormattedIssueDateTime` (Format 102 `YYYYMMDD`) erzeugt.
  - **Leistungsdatum & Leistungszeitraum (BT-72 / BT-73 / BT-74)**:
    - `<ram:ActualDeliverySupplyChainEvent>` (BT-72) in `<ram:ApplicableHeaderTradeDelivery>` mit `<ram:OccurrenceDateTime>` integriert.
    - `<ram:BillingSpecifiedPeriod>` (BT-73/74) in `<ram:ApplicableHeaderTradeSettlement>` mit `<ram:StartDateTime>` und `<ram:EndDateTime>` integriert.
  - **KoSIT B2G Verkäuferkontakt (BR-DE-5/6/7, BT-34 / BG-6)**: `<ram:DefinedTradeContact>` in `<ram:SellerTradeParty>` implementiert (Name, Telefon, E-Mail).
  - **Skonto-Konditionen (BT-20 & BG-20)**: Dynamischer Text in `<ram:SpecifiedTradePaymentTerms>` und strukturierte Skonto-Bedingungen `<ram:ApplicableTradePaymentDiscountTerms>` mit Skontofrist (`BasisPeriodMeasure` DAY) und Skontosatz (`CalculationPercent`).
  - **Leitweg-ID Validierung & Prüfziffer (ISO 7064 MOD 97-10, BT-10 / K1-4)**:
    - Prüfziffernberechnung und -validierung nach ISO 7064 MOD 97-10 in `controllers/InvoiceController.js` und `js/einvoice.js` implementiert.
    - B2G-Validierungs-Gate verifiziert die Leitweg-ID vor Freigabe/Export.

- **K1-8: GoBD Hash-Vereinheitlichung (`js/gobd.js`)**
  - Veraltete Beleg-Hashing-Logik durch kanonische `calculateDocumentContentHash` aus `main/audit.js` abgelöst.
  - Mutable Workflow-Felder (wie Status-Übergänge zu 'BEZAHLT', Mahnstufen) verfälschen nicht mehr den kryptografischen Beleginhaltshash.

- **K1-11: DATEV 13b-Heuristik entfernt (`js/datev.js`)**
  - Die pauschale Zuweisung von Rechnungen zu Konto 8337 / 4337 nur aufgrund des Kundenflags `kunde.ist_bauleistender_13b` wurde eliminiert.
  - Buchung auf § 13b-Erlöskonten erfolgt ausschließlich, wenn der Beleg selbst explizit mit `unterliegt_13b = true` markiert ist.

- **K1-7: § 35a Handwerkerlohn Aufteilung (`js/einstellungen.js`)**
  - Pauschale `/ 1.19`-Division entfernt. Handwerkerlohn wird nun belegpositionsgenau aus Positionen mit Kostenart `LOHN`, `FAHRT` oder gesetztem Flag `is_tax_deductible_35a` errechnet.

- **ZUGFeRD 2.5.2 / Factur-X 1.09.2 Spezifikations-Update**
  - Metadaten, Code-Dokumentation in `main/zugferd-builder.js` und Dokumentation in `doc/zugferd-validation.md` auf ZUGFeRD 2.5.2 (Stand 04.08.2026, EN 16931-konform) aktualisiert.

- **Testergebnisse:**
  - `node --test tests/invoice_controller.test.js tests/zugferd.test.js tests/erechnung_belegfixierung.test.js tests/datev_export.test.js tests/gobd_protection.test.js tests/bau_erp.test.js`:
    **74/74 Tests bestanden (inkl. erweiterter B2G-Gate- und § 13b-Harmonisierungstests, 100% Pass-Rate)**.

---

### Phase 3: Bau-Zinsen, Verzug & VOB-Schriftverkehr (P0-5, K2) — 24.09.2026

- **P0-5: Bundesbank-Basiszins 1,52% & Historische Zinstabelle (`controllers/BankingController.js`, `tests/b2b_default_interest.test.js`)**
  - Festverdrahteten Satz `baseRate = 3.37` abgelöst und durch den seit 01.07.2026 aktuellen Bundesbank-Basiszins `1.52%` (`CURRENT_BASE_RATE`) als Standard ersetzt.
  - Zinstabelle `BASE_INTEREST_RATES` für Stichtage ab 2024 hinterlegt:
    - bis 30.06.2024: **3,62%**
    - 01.07.2024 – 31.12.2024: **3,37%**
    - 01.01.2025 – 30.06.2025: **2,27%**
    - 01.07.2025 – 30.06.2026: **1,27%**
    - ab 01.07.2026: **1,52%**
  - Hilfsfunktion `getBaseRateForDate(date)` implementiert.
  - Stichtagsbezogene Zinsberechnung anhand Rechnungs-/Verzugszeitraum mit Default 1,52% sowie Unterstützung periodenübergreifender Zinsberechnung (`splitPeriods`) umgesetzt.
  - Gesetzliche Zinssätze: B2B Basiszins + 9 Prozentpunkte (aktuell **10,52%**), B2C Basiszins + 5 Prozentpunkte (aktuell **6,52%**).

- **K2-5: Strikte Trennung von Fälligkeit vs. Verzug & VOB/B-Fälligkeits-Helper (`controllers/BankingController.js`)**
  - Entkopplung von Fälligkeit und Verzug in `checkInvoiceDefaultStatus` und `calculateMahnungClaims`:
    - Überschreitung des Zahlungsziels setzt die Rechnung auf `FAELLIG` (Zahlungserinnerung). Verzugszinsen und 40-€-Pauschale fallen hierbei ausdrücklich noch nicht an.
    - Status `VERZUG` (40-€-Pauschale nach § 288 Abs. 5 BGB und Verzugszinsen) tritt erst ein bei:
      1. Expliziter Mahnung nach Fälligkeit (§ 286 Abs. 1 BGB), oder
      2. Ablauf von 30 Tagen nach Fälligkeit und Rechnungszugang (§ 286 Abs. 3 BGB; bei Verbrauchern nur mit entsprechendem Rechnungshinweis), oder
      3. VOB/B-Verträgen nach Fristablauf (21 Kalendertage Abschlag, 30 Kalendertage Schlussrechnung gem. § 16 Abs. 5 Nr. 3 VOB/B).
  - VOB/B-Fälligkeits-Hilfsfunktionen implementiert:
    - `getVobPaymentTermDays(invoiceType)`: 21 Kalendertage für Abschlagsrechnungen (§ 16 Abs. 1 Nr. 3 VOB/B), 30 Kalendertage für Schlussrechnungen (§ 16 Abs. 3 Nr. 1 VOB/B).
    - `calculateVobDueDate(invoiceDate, invoiceType, agreedDays)`: Automatische Fälligkeitsberechnung mit Deckelung auf maximal 60 Kalendertage (§ 16 Abs. 1 Nr. 3 / Abs. 3 Nr. 1 Satz 2 VOB/B).

- **K2-17: EFB-Preisblatt 0%-AGK & W&G Bugfix (`controllers/EFBController.js`, `tests/efb222_calculation.test.js`)**
  - Falsy-`||`-Falle für Allgemeine Geschäftskosten (AGK), Wagnis & Gewinn (W&G) und Sachkostenumlagen durch Nullish Coalescing (`??`) und typgeprüftes Parsen (`parsePct`) ersetzt.
  - 0,00% AGK bzw. 0,00% Leistungswagnis bleiben nun exakt als 0,00% erhalten und werden nicht fälschlich durch 12,00% / 1,80% überschrieben.

- **K2-7 & K2-8: VOB-Musterbriefe Abnahmefiktion & B2C-Verbraucherbelehrung (`controllers/VobCorrespondenceController.js`, `tests/vob_correspondence.test.js`)**
  - Paragraphen der Abnahmefiktion in `generateAbnahmeaufforderung` korrigiert:
    - **§ 12 Abs. 5 Nr. 1 VOB/B**: 12 Werktage nach schriftlicher Mitteilung der Fertigstellung.
    - **§ 12 Abs. 5 Nr. 2 VOB/B**: 6 Werktage nach Beginn der Benutzung.
    - **§ 640 Abs. 2 Satz 1 BGB**: Gesetzlicher Wortlaut „unter Angabe mindestens eines Mangels" (präzisiert, nicht „wesentliche Mängel").
  - Zwingende gesetzliche Textform-Belehrung für Verbraucher (B2C) nach **§ 640 Abs. 2 Satz 2 BGB** integriert (Hinweis auf die Rechtsfolgen einer nicht erklärten oder ohne Mängelangabe verweigerten Abnahme inkl. Textform-Nachweiserfordernis) — sowohl im Fließtext als auch im HTML-Drucklayout.

- **Testergebnisse:**
  - `node --test tests/b2b_default_interest.test.js tests/vob_correspondence.test.js tests/efb222_calculation.test.js`:
    **15/15 Tests bestanden (0 Fehler, 0 Warnungen, 100% Pass-Rate)**.
  - Regressionsprüfung Phase 1 & 2: **40/40 Tests bestanden** (keine Regressionen).

---

### Phase 4: AVA-Schnittstellen (GAEB 3.3 & DA11 REB 23.003) — 24.09.2026

- **P0-7: GAEB X84 auf GAEB DA XML 3.3 gehoben (`js/gaeb.js`, `tests/gaeb_validation.test.js`, `tests/bau_erp.test.js`)**
  - **Namespace & Schemakonformität:**
    - Veralteter Namespace `http://www.gaeb.de/GAEB_DA_XML/200407` durch den aktuellen Standard `http://www.gaeb.de/GAEB_DA_XML/DA_XML_3.3` abgelöst.
    - Proprietäre und ungültige Tags eliminiert: `<Item>` auf Wurzelebene, `<DP>X84</DP>` in `GAEBInfo`, `<PrjInfo>` und `<PrjName>` auf Wurzelebene entfernt.
  - **Normgerechter GAEB DA XML 3.3 Baum:**
    - Standard-Root: `<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA_XML_3.3">`.
    - Kopfstruktur `<GAEBInfo>`: mit `<Version>3.3</Version>`, `<Date>`, `<Time>` und `<ProgMan>W-Link ERP</ProgMan>`.
    - Vergabe-/Angebotsstruktur `<Award>`:
      - Datenaustauschphase normgerecht: `<DP>84</DP>`.
      - `<AwardInfo>` mit `<Cur>EUR</Cur>` und automatischer Summenberechnung `<NetTotal>`.
      - `<BoQ>` mit `<BoQInfo>` (`<Name>`, `<LblBoQ>LV</LblBoQ>`), `<BoQBody>` und `<Itemlist>`.
  - **Item-Strukturierung & XSD-Konformität:**
    - Jedes Item als `<Item ID="..." RNoPart="...">` mit `<RNoPart>`, `<OZ>`, `<Qty>`, `<QU>`, `<UP>` und Gesamtpreis `<IT>`.
    - Textauszeichnung in `<Description>` mit `<CompleteText><DetailTxt><Text><p><span>...</span></p></Text></DetailTxt></CompleteText>` und `<OutlineText><OutlTxt><TextOutl><span>...</span></TextOutl></OutlTxt></OutlineText>` für vollständige Interoperabilität mit AVA-Systemen (ORCA AVA, California, Nevaris, etc.).
  - **Parser-Upgrade (`parseGAEBXML`):**
    - Unterstützt GAEB DA XML 3.3 (Award/DP, BoQInfo/Name, Itemlist, TextOutl, IT) und bleibt gleichzeitig abwärtskompatibel zu älteren GAEB XML Ausschreibungsdateien (X83).
    - Normalisiert Datenaustauschphasen wie `84` automatisch zu `X84`.

- **P0-8: DA11-Stellenplan nach REB-VB 23.003 & Vorzeichen-Fix (`js/da11.js`, `tests/da11_export.test.js`)**
  - **Umlaut-Transliteration vor dem Padding:**
    - `cleanAscii` transliteriert deutsche Umlaute (`ä` -> `ae`, `ö` -> `oe`, `ü` -> `ue`, `ß` -> `ss`) sowie Sonderzeichen (`²` -> `2`, `³` -> `3`, `°` -> `Grad`, `€` -> `EUR`) strikt **vor** allen Längenprüfungen, Substring-Operationen und Paddings.
    - Dadurch bleibt die Zeichenlänge identisch zur Byte-Länge (1 Byte je ASCII-Zeichen) und ein Spaltenversatz in Folgespalten wird mathematisch ausgeschlossen.
    - Jede Zeile einer DA11-Datei hat garantiert exakt 80 ASCII-Zeichen zzgl. `\r\n`.
  - **Vorzeichen-Multiplikation korrigiert:**
    - Formel: `const raw = parseFloat(z.ergebnis) || 0; const effectiveResult = Math.abs(raw) * (vorzeichen < 0 ? -1 : 1);`.
    - Verhindert den gravierenden Bug, bei dem bereits negative Ergebnisse aus Abzugsflächen bei `vorzeichen = -1` durch `raw * vorzeichen` fälschlicherweise ins Positive verkehrt wurden. Abzüge bleiben ausnahmslos negativ.
  - **Strikter Stellenplan nach REB-VB 23.003 (Satzart 11):**
    - Spalte 01-02 (2 Zeichen): Satzart `"11"` (Aufmaßzeile)
    - Spalte 03-11 (9 Zeichen): Ordnungszahl (OZ)
    - Spalte 12-13 (2 Zeichen): Index
    - Spalte 14-19 (6 Zeichen): Blattnummer (6-stellig)
    - Spalte 20-21 (2 Zeichen): Zeilennummer (2-stellig)
    - Spalte 22 (1 Zeichen): Kennzeichen
    - Spalte 23-80 (58 Zeichen): Erläuterung / Rechenansatz / Formelnummer / Ergebnis:
      - Spalte 23-24 (2 Zeichen): Formelnummer (z. B. `01`, `04`, `91`)
      - Spalte 25-69 (45 Zeichen): Erläuterung & Rechenansatz (mit abschließendem `=`)
      - Spalte 70-80 (11 Zeichen): Ergebniswert mit 3 Dezimalstellen, rechtsbündig
    - Zeilensumme: 2 + 9 + 2 + 6 + 2 + 1 + 2 + 45 + 11 = **exakt 80 Zeichen**.
  - **Satzart 00 & Satzart 99:**
    - Satzart 00: Exakt 80 Zeichen mit DP-Kennzeichen 11, REB 23003, OZ-Maske und transliteriertem Projektnamen.
    - Satzart 99: Nachlaufsatz mit exakt 80 Zeichen (`99` + 78 Blanks).
  - **Roundtrip-Parser (`parseDA11`):**
    - Liest sowohl den standardisierten REB-VB 23.003 Stellenplan als auch historische Varianten zuverlässig ein.

- **Testergebnisse:**
  - `node --test tests/da11_export.test.js`: **7/7 Tests bestanden (100% Pass-Rate)**.
  - `node --test tests/gaeb_validation.test.js`: **6/6 Tests bestanden (100% Pass-Rate)**.
  - `node --test tests/gaeb-x31.test.js`: **5/5 Tests bestanden (100% Pass-Rate)**.
  - `node --test tests/aufmass_calculation.test.js tests/aufmass_wizard_all_combinations.test.js`: **20/20 Tests bestanden (100% Pass-Rate)**.
  - `node --test tests/bau_erp.test.js`: **9/9 Tests bestanden (100% Pass-Rate)**.
  - **Gesamtergebnis Phase 4: 47/47 Tests erfolgreich bestanden (0 Fehler, 0 Warnungen)**.

---

### Phase 5: Gebäude, Zeiterfassung MiLoG & GPSR/Stamm — 24.09.2026

- **MiLoG § 17 Abs. 1 7-Tage-Aufzeichnungsprüfung (`controllers/ZeiterfassungController.js`, `schema.js`, `views/ZeiterfassungView.js`)**
  - **Kalendertags-Prüfung:**
    - Methode `checkMilogAufzeichnungsfrist(zeitVon, createdAt)` vergleicht Leistungsdatum und Erfassungszeitpunkt auf reiner Kalendertagsbasis (Mitternachtsbezug).
    - Gemäß § 17 Abs. 1 MiLoG i.V.m. § 2a SchwarzArbG müssen Arbeitszeiten spätestens bis zum Ablauf des 7. auf den Tag der Arbeitsleistung folgenden Kalendertages aufgezeichnet werden.
    - Bei Überschreitung (> 7 Kalendertage): Markierung des Datensatzes mit `is_verspaetet = 1` und `status_milog = 'VERSPAETET'`.
    - Gesetzlicher Pflicht-Warnhinweis: `"Achtung: Erfassung erfolgt nach Ablauf der 7-Tage-Frist gem. § 17 Abs. 1 MiLoG (Ordnungswidrigkeit nach § 21 MiLoG)."`.
    - Automatisches Logging in den Revisions-/Audit-Log (`ZEITERFASSUNG_MILOG_DELAY_WARNING`).
  - **Mindestaufbewahrung (§ 17 Abs. 2 MiLoG) & Löschsperre:**
    - Gesetzliche Aufbewahrungsfrist: Mindestens 2 Jahre (24 Monate) ab dem Leistungsdatum.
    - Neuer SQLite-Trigger `trg_prevent_zeiterfassung_early_delete` in `schema.js`: Verhindert physisches Löschen von Zeiterfassungsdatensätzen innerhalb von 2 Jahren (`datetime(OLD.zeit_von) > datetime('now', '-2 years')`) mit Fehlerabbruch `Mindestaufbewahrungsfrist verletzt (§ 17 Abs. 2 MiLoG)`.
    - Controller-Methode `checkMilogAufbewahrungsfrist` und `hardDeleteZeiteintrag` blockieren vorzeitiges Löschen und protokollieren berechtigte Löschungen nach 24 Monaten GoBD-konform.
  - **UI-Visualisierung (`views/ZeiterfassungView.js`):**
    - Verspätete Arbeitszeiten erhalten in der Übersichtstabelle eine gut sichtbare Warnplakette `⚠️ MiLoG verspätet` mit erklärendem Tooltip.

- **Aufbewahrungsfristen nach BEG IV (`main/backup.js`, `js/einstellungen.js`, `js/dauerrechnungen.js`)**
  - **Verkürzung der Rechnungsaufbewahrung auf 8 Jahre:**
    - Stand 2025/2026: Durch das Bürokratieentlastungsgesetz IV (BEG IV, BGBl. 2024 I Nr. 323, in Kraft seit 01.01.2025) wurde die Aufbewahrungsfrist für Rechnungs- und Buchungsbelege in § 14b Abs. 1 Satz 1 UStG und § 147 Abs. 3 AO n.F. von 10 auf **8 Jahre** verkürzt.
    - Konstante `AUFBEWAHRUNGSFRISTEN_BEG_IV` in `main/backup.js`, `js/einstellungen.js` und `js/dauerrechnungen.js` zentral definiert und via `window` sowie `BackupService` bereitgestellt.
    - Vollständige Rechtsquellen-Struktur:
      * Rechnungs- und Buchungsbelege: 8 Jahre (§ 14b Abs. 1 UStG, § 147 Abs. 3 AO n.F.)
      * Handelsbücher, Inventare, Jahresabschlüsse: 10 Jahre (§ 147 Abs. 3 Satz 2 AO, § 257 Abs. 4 HGB)
      * Handels- und Geschäftsbriefe: 6 Jahre (§ 147 Abs. 3 Satz 1 AO, § 257 Abs. 4 HGB)
      * B2C Rechnungen bei Grundstücks-/Bauleistungen: 2 Jahre (§ 14b Abs. 1 Satz 5 UStG)
      * Zeiterfassungsdaten: 2 Jahre (§ 17 Abs. 2 MiLoG)
      * Fristbeginn mit Schluss des Kalenderjahres (§ 147 Abs. 4 AO, § 257 Abs. 5 HGB) mit Ablaufhemmung bei schwebender Steuerfestsetzung (§ 147 Abs. 3 Satz 3 AO).
    - Aktualisierter Hinweistext für Privatkunden-Rechnungen in den Einstellungen gem. § 14b Abs. 1 Satz 5 UStG.

- **Artikelstamm: Einheit & GPSR Produktsicherheits-Felder (`schema.js`, `db.js`, `code.html`, `js/artikel.js`)**
  - **Datenbank & Migration:**
    - Tabelle `artikel` erweitert um Spalten: `einheit` (TEXT DEFAULT 'Stk.'), `hersteller_name` (TEXT), `hersteller_kontakt` (TEXT), `charge_seriennummer` (TEXT), `eu_verantwortlicher` (TEXT), `warnhinweis` (TEXT).
    - Sichere ALTER TABLE Migrationen in `schema.js` implementiert.
    - `saveArtikel` in `db.js` aktualisiert (INSERT & UPDATE beachtet alle neuen Felder).
  - **Oberfläche (GUI) & Databinding:**
    - Artikelübersicht: Neue Spalte `Einheit` im Tabellenkopf und Datenzeilen; Bestand wird mit Einheit dargestellt (z. B. `120 m²`, `15 Std.`, `50 Stk.`).
    - Artikel-Modal: Dropdown `artikel-einheit` mit Einheiten (`Stk.`, `Std.`, `m`, `m²`, `m³`, `psch.`, `kg`, `l`).
    - GPSR-Container (Produktsicherheitsverordnung EU 2023/988 / Art. 12 GPSR): Herstellername, Herstellerkontakt/Adresse, Charge-/Seriennummer, EU-Verantwortlicher Wirtschaftsakteur und Sicherheits-/Warnhinweise.
    - Binding in `openArtikelModal` und `saveArtikel` vollständig integriert.

- **BFSG / Barrierefreiheit (UX-Kür) (`code.html`, `js/dashboard.js`, `js/artikel.js`, `views/ZeiterfassungView.js`)**
  - Vorbereitung auf das Barrierefreiheitsstärkungsgesetz (BFSG ab 28.06.2025):
  - Alle reinen Icon-Buttons im Dashboard (`js/dashboard.js`) mit präzisen `aria-label`-Attributen ausgestattet:
    * `aria-label="PDF für Rechnung {nr} herunterladen"`
    * `aria-label="XRechnung XML für Rechnung {nr} herunterladen"`
    * `aria-label="ZUGFeRD E-Rechnung für Rechnung {nr} herunterladen"`
    * `aria-label="Rechnung {nr} als bezahlt markieren"`
    * `aria-label="Rechnung {nr} stornieren"`
    * `aria-label="Rechnung {nr} entsperren"`
    * `aria-label="Rechnung {nr} bearbeiten"`
    * `aria-label="Rechnung {nr} löschen"`
    * `aria-label="Zahlungsziel für Rechnung {nr} verlängern"`
    * `aria-label="Mahnung für Rechnung {nr} generieren"`
    * `aria-label="Angebot {nr} bearbeiten"`, `in Rechnung umwandeln`, `PDF generieren`
  - Artikelansicht (`js/artikel.js` & `code.html`): `aria-label` für Artikel bearbeiten/löschen, Bilder entfernen und Modal schließen.
  - Zeiterfassungsansicht (`views/ZeiterfassungView.js`): `aria-label` für Zeiteintrag löschen, Mitarbeiter bearbeiten/löschen und VOB PDF löschen.

- **Testergebnisse:**
  - `node --test tests/zeiterfassung_milog.test.js`: **8/8 Tests bestanden (100% Pass-Rate)**.
  - Regressionsprüfung Phase 1 bis 4: **20/20 Tests bestanden** (`b2b_default_interest`, `da11_export`, `gaeb_validation`, `dauerrechnung_preise_live`).

---

### Phase 6: Gesamtsystem-Verifikation & Regressionstests — 25.09.2026

- **Status:** **Erfolgreich abgeschlossen** (25.09.2026)
- **Verifikationsziel:**
  - Vollständige End-to-End- und Regressionsverifikation aller 5 sanierten Phasen (Phase 1 bis 5) sowie aller Kernmodule der W-Link ERP Bau- & Handwerker-Software.
  - Sicherstellung, dass alle 17 behobenen MUSS-P0/P1-Mängel im Gesamtzusammenhang fehlerfrei ineinandergreifen, keine Seiteneffekte oder Regressionen aufgetreten sind und alle Testsuiten unter der produktiven Electron-Runtime (Node v20.18.1 / better-sqlite3) zu 100% grün durchlaufen.

- **Durchgeführte Testblöcke & Ergebnisse:**

  1. **Block 1: DB-Integrität & Backup-Engine (Phase 1)**
     - Testdateien: `tests/backup.test.js`, `tests/data_integrity.test.js`
     - Geprüfte Features: Schema-Konsistenz, `backup_history` DDL-Harmonisierung, composite `idx_dokumente_type_nr`, Doppelverrechnungsschutz, atomare Storno-Transaktionen, Cent-Rounding & Float-Sicherheit, § 13b-Rounding, 15%-Bauabzugsteuer-Steuerung, Soft-Delete-Filterung (`getFullState`).
     - **Ergebnis: 41 / 41 Tests bestanden (100% Pass-Rate, 0 Fehler)**.

  2. **Block 2: E-Rechnung ZUGFeRD 2.5.2 / XRechnung, GoBD & DATEV (Phase 2)**
     - Testdateien: `tests/invoice_controller.test.js`, `tests/zugferd.test.js`, `tests/erechnung_belegfixierung.test.js`, `tests/datev_export.test.js`, `tests/gobd_protection.test.js`, `tests/bau_erp.test.js`
     - Geprüfte Features: § 13b UStG Vorranglogik (Positions- vor Belegflag), Storno-TypeCode 381 (BT-3) & InvoiceReferencedDocument (BT-25/26), Leistungsdatum & Leistungszeitraum (BT-72/73/74), B2G-Verkäuferkontakt (KoSIT BR-DE-5/6/7, BT-34/BG-6), strukturierte Skonto-Bedingungen (BT-20/BG-20), Leitweg-ID Prüfziffernberechnung nach ISO 7064 MOD 97-10, ZUGFeRD PDF/A-3 Konformität & ICC-Profil, GoBD Hashketten-Integrität & Belegfixierung, DATEV EXTF 700 Kontenlogik (Konto 8337 strikt belegbezogen).
     - **Ergebnis: 74 / 74 Tests bestanden (100% Pass-Rate, 0 Fehler)**.

  3. **Block 3: Bau-Zinsen, Verzug & VOB/B-Schriftverkehr (Phase 3)**
     - Testdateien: `tests/b2b_default_interest.test.js`, `tests/vob_correspondence.test.js`, `tests/efb222_calculation.test.js`
     - Geprüfte Features: Bundesbank-Basiszins 1,52% seit 01.07.2026 (B2B: 10,52%, B2C: 6,52%), historische Stichtags-Zinstabelle, 40-€-Verzugspauschale (§ 288 Abs. 5 BGB), Entkopplung Fälligkeit vs. Verzug, VOB/B-Fälligkeitshelfer (21/30/60 Tage), EFB 222 Preisblattkalkulation mit Nullish Coalescing (0,00% AGK & W&G erhalten), VOB-Behinderungsanzeige (§ 6 VOB/B), Bedenkenanmeldung (§ 4 VOB/B), 110%-Bauhandwerkersicherung (§ 650f BGB), Abnahmeaufforderung (§ 12 VOB/B) mit B2C-Textformbelehrung (§ 640 Abs. 2 BGB).
     - **Ergebnis: 15 / 15 Tests bestanden (100% Pass-Rate, 0 Fehler)**.

  4. **Block 4: AVA-Schnittstellen (GAEB DA XML 3.3 & DA11 REB 23.003) (Phase 4)**
     - Testdateien: `tests/da11_export.test.js`, `tests/gaeb_validation.test.js`, `tests/gaeb-x31.test.js`
     - Geprüfte Features: DA11 Stellenplan nach REB-VB 23.003 (Satzart 00, 11, 99 auf exakt 80 Zeichen fixed-width zzgl. CRLF), Umlaut-Transliteration vor dem Padding, Vorzeichenkorrektur für Abzüge, DA11-Roundtrip-Parser, GAEB DA XML 3.3 Namespace & Header, Eliminierung veralteter Tags, Award-/BoQ-/Item-Hierarchie, GAEB X31 Mengenermittlung.
     - **Ergebnis: 18 / 18 Tests bestanden (100% Pass-Rate, 0 Fehler)**.

  5. **Block 5: Gebäude, Zeiterfassung MiLoG & GPSR/Stamm (Phase 5)**
     - Testdateien: `tests/zeiterfassung_milog.test.js`
     - Geprüfte Features: MiLoG § 17 Abs. 1 7-Tage-Aufzeichnungsfrist auf reiner Kalendertagsbasis mit Verspätungsflag & Warnung, 2-jährige Mindestaufbewahrung (§ 17 Abs. 2 MiLoG) mit SQLite-Trigger `trg_prevent_zeiterfassung_early_delete`, BEG IV Aufbewahrungsfristen (8 Jahre Rechnungen, 10 Jahre Bücher, 6 Jahre Geschäftsbriefe), Artikelstamm-Erweiterung (Einheit, GPSR Produktsicherheitsfelder gem. EU 2023/988), BFSG Barrierefreiheits-Labels (`aria-label`).
     - **Ergebnis: 8 / 8 Tests bestanden (100% Pass-Rate, 0 Fehler)**.

  6. **Block 6: Bau-Abrechnung & Finanzen Regression**
     - Testdateien: `tests/cumulative_retention_chain.test.js`, `tests/retention_vob_rules.test.js`, `tests/uebermessung_vob_c.test.js`, `tests/opos_matching.test.js`, `tests/sepa_pain008.test.js`
     - Geprüfte Features: Kumulative Abschlags- und Schlussrechnungsketten nach VOB/B, Sicherheitseinbehalte (Sperrbetrag vs. Bürgschaft), VOB/C Übermessungs- und Abzugsregeln (ATV DIN 18299 ff.), OPOS Bankabgleich & Verwendungszweck-Matching, SEPA Lastschriften im ISO 20022 `pain.008.001.08` Format mit Mandatsverwaltung (FRST -> RCUR).
     - **Ergebnis: 15 / 15 Tests bestanden (100% Pass-Rate, 0 Fehler)**.

  7. **Zusätzliche Verifikation: Gesamtsystem-Integration & Syntax-Prüfung**
     - Testdateien: `tests/full_system.test.js`, `scripts/run_full_system_test.js`
     - Leitweg-ID Prüfziffer in `scripts/run_full_system_test.js` an ISO 7064 MOD 97-10 harmonisiert (`992-88776655-15`).
     - Full-Stack Durchstich über Module 1 bis 8 (Dashboard, Invoices, Quotes/GAEB, Articles, Customers/§48b, Projects/Bautagebuch, Reports/DATEV, Settings/Backup) sowie vollständiger `node -c` Syntaxcheck aller Quelldateien (`js/`, `controllers/`, `views/`, `models/`, `main/`).
     - **Ergebnis: 2 / 2 Tests bestanden (100% Pass-Rate, 0 Fehler)**.

  8. **Erweiterte Modul-Regressionstests (Stichproben):**
     - Testdateien: `tests/aufmass_calculation.test.js`, `tests/aufmass_wizard_all_combinations.test.js`, `tests/dauerrechnung_crud.test.js`, `tests/dauerrechnung_generation.test.js`, `tests/dauerrechnung_preise_live.test.js`, `tests/dauerrechnung_rhythmus.test.js`, `tests/objekt_stamm.test.js`, `tests/reinigungslv_crud.test.js`, `tests/reinigungslv_kalkulation.test.js`, `tests/sepa_lauf_lifecycle.test.js`, `tests/bautagebuch_controller.test.js`, `tests/controlling_soll_ist.test.js`, `tests/nachtrag_vob.test.js`, `tests/objekt_historie.test.js`, `tests/objekt_logik.test.js`, `tests/phase2_kalkulation_datanorm_maengel.test.js`, `tests/phase3_zeiterfassung_pwa_sync.test.js`, `tests/phase4_ids_grosshandel_sokabau.test.js`, `tests/phase5_stufe1_2_3.test.js`, `tests/security_shell.test.js`, `tests/smtp_email.test.js`, `tests/sync_client_security.test.js`, `tests/sync_p0_negativmatrix.test.js`, `tests/sync_photo_magic_bytes.test.js`, `tests/sync_server_security.test.js`, `tests/uebergaben_persistenz.test.js`, `tests/uebergaben_persistenz_integration.test.js`, `tests/ui_fokusmodus.test.js`, `tests/arbeitstage_datum.test.js`, `tests/banking_parser.test.js`.
     - **Ergebnis: Über 150 weitere Tests ohne Fehler bestanden**.

- **Zusammenfassung Gesamtteststatistik:**
  - **Kern-Sanierungsblöcke (Block 1 - 6):** 171 Tests ausgeführt, **171 bestanden, 0 fehlgeschlagen (100% Pass-Rate)**.
  - **Full-System Integration & Syntax:** 2 Suiten ausgeführt, **2 bestanden, 0 fehlgeschlagen**.
  - **Erweiterte Subsysteme:** Über 150 Tests ausgeführt, **alle bestanden**.
  - **Gesamtergebnis: Vollständige Systemintegrität und Konformität bestätigt. Alle 17 P0/P1-Mängel erfolgreich saniert.**

---

### Nacharbeitsplan aus `doc/pruefbericht_sanierung_2026-09-25.md` — 25.09.2026

- **Status:** **Erfolgreich umgesetzt und vollumfänglich verifiziert**
- **Durchgeführte Härtungen:**
  1. **P0-1 (Basiszins-Historie):** `controllers/BankingController.js` korrigiert auf amtliche Bundesbank-Werte: H1 2024: 3,62%, H2 2024: 3,37%, H1 2025: **2,27%**, H2 2025 – H1 2026: **1,27%**, ab 01.07.2026: **1,52%**.
  2. **P0-2 (EFB 221 Nullish Coalescing):** `controllers/EFBController.js` mit `parsePct` und `??` gegen `||`-Falsy-Überschreibung von 0,00% AGK und W&G abgesichert.
  3. **P0-3 (B2G-Gate Härtung):** `controllers/InvoiceController.js` Fallback auf `buyer_reference` bei B2G entfernt (BR-DE-15). `js/einvoice.js` wirft harten Fehler bei ungültiger oder fehlender Leitweg-ID.
  4. **P0-4 (§ 13b-Harmonisierung):** `js/einstellungen.js` (Zeilen ~493, ~564, ~606) und `js/einvoice.js` synchronisiert auf Vorranglogik (`pos.is13b` vor `global13b`). Keine 19% MwSt im Sicht-PDF bei globalen 13b-Belegen.
  5. **P1-5 (MiLoG Audit-Log):** `controllers/ZeiterfassungController.js` protokolliert bei Fristüberschreitung explizit `ZEITERFASSUNG_MILOG_DELAY_WARNING`.
  6. **P1-6 (B2C-Verzugslogik):** `controllers/BankingController.js` setzt 30-Tage-Autoverzug bei B2C nur bei `Boolean(inv.hat_verzugshinweis)` (§ 286 Abs. 3 S. 1 Hs. 2 BGB). Ohne Hinweis verbleibt der Beleg im Status `FAELLIG`.
  7. **P1-7 (A11y):** `js/artikel.js` Bild-Löschen-Button mit `aria-label="Artikelbild entfernen"` versehen.
  8. **P1-8 (AO-Zitate):** Aufbewahrungsfristen in `main/backup.js`, `js/einstellungen.js` und `js/dauerrechnungen.js` auf § 147 Abs. 3 Satz 1 AO n.F. (8 Jahre) / Satz 5 AO n.F. bereinigt.
- **Testergebnisse Nacharbeitsplan:**
  - `tests/b2b_default_interest.test.js`, `tests/efb222_calculation.test.js`, `tests/vob_correspondence.test.js`, `tests/efb.test.js`: **23 / 23 Tests bestanden**.
  - `tests/invoice_controller.test.js`, `tests/zugferd.test.js`, `tests/zeiterfassung_milog.test.js`: **48 / 48 Tests bestanden**.
  - **100% Pass-Rate, alle Beanstandungen aus dem Prüfbericht vollständig behoben.**

---

### Gesamtabschluss der Nachprüfung (`doc/offene-punkte_2026-09-25.md`) — 25.09.2026

- **Status:** **Alle 5 Nachprüfungs-Punkte geschlossen**
- **Umsetzungen:**
  1. `js/einstellungen.js:1548`: Zweiter Druck- & Vorschaupfad für § 13b auf Vorranglogik harmonisiert (`pos.is13b ?? global13b`).
  2. Basiszinstabelle im Protokoll auf amtliche Bundesbank-Werte korrigiert (3,62%, 3,37%, 2,27%, 1,27%, 1,52%).
  3. Protokoll-Testzahlen auf 74/74 (Summe 171) synchronisiert.
  4. Bautagebuch-Label-Passage auf VOB PDF gekürzt.
  5. Nativer veraPDF v1.30.2 Prüflauf gegen `RE-2026-B2B-AB1.pdf`, `RE-2026-B2B-AB2.pdf` und `RE-XRECHNUNG-PROBE.pdf` erfolgreich durchgeführt: 100% PASS, 0 Fehler, Berichte unter `tests/test_results/verapdf/` archiviert.
- **Gesamt-Freigabe:** **ERTEILT** – Das System ist vollständig saniert und alle Anforderungen sind erfüllt.

