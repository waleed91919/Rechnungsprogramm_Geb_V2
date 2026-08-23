# Zusammenfassung der Entwicklungssitzung – Audit & Reparatur ZUGFeRD/GoBD
**Datum:** 23.08.2026
**Projekt:** W-Link Rechnungsprogramm / Bau-ERP V2
**Ziel:** Vollständige Überprüfung des Rechnungssystems und des ZUGFeRD PDF/A-3-Exports (3 Prüf-Subagenten), anschließende Reparatur aller bestätigten Blocker (4 Fix-Subagenten).

---

## 1. Audit-Ergebnis (3 Subagenten, Quellcode + echte Artefakte + `npm test`)

| Bereich | Befund |
|---|---|
| PDF/A-3-Container | **RICHTIG** – binär verifiziert (`%PDF-1.7`, `pdfaid:part=3/B`, sRGB-OutputIntent, `/EmbeddedFile` text/xml, `/AFRelationship /Alternative`, `/AF` + `/Names/EmbeddedFiles`, Fonts eingebettet) |
| CII/XML-Inhalt (EN 16931) | **FALSCH** – alle 5 Beanstandungen bestätigt (BG-23 fehlt, Leitweg-ID überdeckt, keine Adressen/Ländercodes, §13b ohne ExemptionReason, Einheitscodes `m²`/`Std`) |
| Rechnungskern + GoBD | **MIT MÄNGELN** – kein Cent-Rounding, Sperren nur im Renderer, Audit-Kette nur beim Export, Doppelverrechnung möglich, Storno nicht atomar, kein UNIQUE auf Rechnungsnummer |
| End-to-End | **FALSCH** – `basePdfBuffer: null` (main.js), Sichtseite = 3-Zeilen-Platzhalter, B2G-Validierung gab immer `true` zurück, 96/96 Tests aber nur Selbstvergleiche |

**Urteil vor den Fixes:** FALSCH / nicht produktionsreif.

---

## 2. Umgesetzte Reparaturen (4 Subagenten)

### Fix ① – CII/XML-Inhalt + echtes Validierungs-Gate (`js/einvoice.js`, `js/editor.js`, `js/dashboard.js`)
- **BG-23 USt-Aufschlüsselung:** `computeTotals` (js/einvoice.js:120-183) bildet Steuergruppen je Kategorie/Satz aus den Positionen (Basis nach Rabatt, `tax = round2(basis*rate/100)`); XML unter `ApplicableTradeTax` mit `CalculatedAmount`/`BasisAmount`/`CategoryCode`/`RateApplicablePercent` (js/einvoice.js:390-402).
- **Leitweg-ID (BT-10):** `leitweg_id` hat jetzt **Vorrang** vor `buyer_reference` (js/einvoice.js:330-337) + Format-Warnung.
- **Adressen BG-5/BG-8:** `parseAddressString` (js/einvoice.js:47-58) zerlegt Adressen; `PostalTradeAddress` mit `PostcodeCode`/`LineOne`/`CityName`/`CountryID` (Default DE) für Seller und Buyer; elektronische Adressen (BT-34/BT-49) bei vorhandener E-Mail.
- **§13b (BR-AE-10):** Positionsbezogene Kategorie-Erkennung wie im Rechenkern (js/einvoice.js:105-118); bei `AE` werden `ExemptionReason` („Steuer nicht erhoben gemäß § 13b UStG") + `ExemptionReasonCode VTEX` gesetzt.
- **Einheitscodes (UN/ECE Rec 20):** Mapping-Tabelle (js/einvoice.js:10-29): `m²`→MTK, `m³`→MTQ, `Std`→HUR, `Tag`→DAY, `Stk`→H87, `Pausch`→C62 usw., Passthrough für gültige Codes, Warnung bei Unbekannten.
- **Fälligkeit (BT-9):** `SpecifiedTradePaymentTerms` mit Zahlungsziel-Text + `DueDateDateTime` (js/einvoice.js:427-434).
- **Keine Fake-USt-ID mehr:** `DE000000000` entfernt; `schemeID VA` nur bei echter USt-IdNr, `FC` für Steuernummer (js/einvoice.js:83-103).
- **Summen-Konsistenz:** Zeilensumme **mit** Positionsrabatt (konsistent zur Sichtseite, js/einstellungen.js), `DuePayableAmount = brutto − Anzahlung − Verrechnungen − Einbehalt`, `TotalPrepaidAmount` garantiert BR-CO-16.
- **Gate:** `validateForEN16931` (js/einvoice.js:186-275) prüft Pflichtfelder, Summen (BR-CO-10/13/14/16), BG-23-Konsistenz, Leitweg-Pflicht (nur echtes B2G), Bankverbindung. `js/editor.js` bricht bei Fehlern mit `return false` ab (vorher immer `true`), Dashboard-Export validiert jetzt ebenfalls.

### Fix ② – Echte Sichtseite im ZUGFeRD-PDF (`main.js`, `js/editor.js`, `js/dashboard.js`, `js/einstellungen.js`, `main/zugferd-builder.js`)
- Der Export rendert die **echte Rechnungsoptik** unsichtbar im Renderer (`#print-template`, gleiche Vorlagen wie der normale Druck inkl. GiroCode/§-Texte) und erfasst sie im Main-Prozess per `event.sender.printToPDF()` mit **15 s-Timeout** (main.js:530-621).
- `main.js:565` übergibt den echten `basePdfBuffer` an `ZugferdBuilder.build` – die 3-Zeilen-Platzhalterseite greift **nur noch bei Fehler** als Fallback (dann mit Empfängername + fälligem Gesamtbetrag).
- Sichtseite und XML entstehen aus **demselben `doc`-Objekt** → keine Dateninkonsistenz mehr (Rabatt-Bug behoben).
- Neue Tests Z11 (echtes Basis-PDF: XML byte-identisch, Seitenzahl = Basis-PDF) und Z12 (korrupter Buffer → sauberer Fallback).

### Fix ③ – GoBD-Schutz + Audit-Hashkette (`main/audit.js` neu, `db.js`, `main.js`, `preload.js`, `js/*`)
- **Sperr-Guard in der DB-Ebene:** `saveDocument`/`bulkSaveDocuments` (db.js:300-349, 425-456) vergleichen Inhalts-Hash – Inhaltsänderungen an gesperrten Belegen (nr, Beträge, Positionen, Texte …) werden abgelehnt; erlaubt bleiben nur Status-/Buchungsfelder.
- **Explizites Entsperren:** neue Funktion `entsperreBeleg(id, grund)` (db.js:627-657, Begründung Pflicht, Audit `ENTSPERRT`), IPC `db:unlockDocument`, Entsperren-Button im Read-only-Modal (editor.js) bzw. Dashboard.
- **Audit-Kette bei jeder Mutation:** zentraler `appendAuditLog` in `main/audit.js` (SHA-256-Verkettung mit `previous_hash`), geschrieben **innerhalb derselben Transaktion** wie die Mutation: ERSTELLT/GEÄNDERT/STATUS_GEÄNDERT/GELÖSCHT/ENTSPERRT/STORNIERT/ZUGFERD_EXPORT. `dokumente.sha256_hash` wird bei jedem Speichern befüllt.
- **Fehler-Handling:** Schlägt das Audit fehl, rollt die Mutation zurück bzw. der ZUGFeRD-Export bricht ab (kein stiller `console.error` mehr).
- **Verifikation:** `verifiziereAuditKette()` (main/audit.js:126-176) + IPC `audit:verify` + `api.verifyAuditChain`.
- UI-Pfade (Zahlungsziel verlängern, Bulk „bezahlt", Überfällig-Check, Storno/markAsPaid) nutzen jetzt den schmalen erlaubten Status-Pfad statt kompletter Beleg-Rewrites.

### Fix ④ – Datenintegrität + Rundung + Schema-Bugs (`schema.js`, `db.js`, `controllers/InvoiceController.js`, `models/InvoiceModel.js`, `js/editor.js`, `js/berichte.js`, `code.html`, `js/kunden.js`)
- **UNIQUE-Constraints** (idempotente Migration mit Vorab-Deduplizierung, schema.js:454-563): `idx_dokumente_nr_unique`, `idx_verrechnungen_paar_unique`, `security_retentions.invoice_id`; zusätzlicher Duplikats-Guard beim Speichern (db.js:117-121) + UI-Prüfung (editor.js:1237-1244).
- **Doppelverrechnung blockiert:** `insertVerrechnungenGuarded` (db.js:189-226) prüft, ob eine Vorrechnung bereits in einer anderen Rechnung verrechnet ist; Auswahl-UI filtert global verwendete Vorrechnungen (editor.js:1352-1374).
- **Atomares Storno:** `storniereRechnung()` (db.js:696-746) führt Original-Status + Gutschrift in **einer** Transaktion aus; Rollback inkl. Audit-Eintrag getestet. Erneutes Storno einer stornierten Rechnung → klarer Fehler.
- **Cent-Rounding:** `round2` in `controllers/InvoiceController.js` durchgehend in `calculateTotals` (inkl. Rabatt-Verteilung, Steuergruppen, Zahlbetrag) – **bitidentisch** zu `js/einvoice.js computeTotals` (Konsistenz-Tests); `js/berichte.js` (Steuerbericht) nutzt dieselben Rundungsregeln.
- **Schema-Bug A (Crash):** Spalte `kunden.sec48b_valid_until` wird migriert (schema.js:442) – `getEingangsrechnungen` läuft auf frischen DBs.
- **Schema-Bug B (§48b tot):** Spalte `lieferanten.is_subcontractor` (schema.js:444), Persistenz in `saveKunde`, Checkbox „Subunternehmer (§ 48b EStG)" im Formular (code.html:2694, js/kunden.js); 15 %-Bauabzug getestet (mit/ohne Freistellung).
- **Nummern-Robustheit:** `extractLaufendeNummer` (Regex, editor.js:8-19) statt blindem `parseInt` – funktioniert auch bei „STORNO - INV-2026-001".
- **FKs:** `dokumente.kundeId/projektId`, `positionen.artikelId` mit FOREIGN KEY in `CREATE TABLE` (wirkt auf frische DBs; Nachrüstung auf Bestands-DBs wäre Tabellenneubau = zu riskant).

---

## 3. Testergebnis (nach allen Fixes)
- `npm test` → **105/105 bestanden** (vorher 96/96; neu u. a. Z6–Z12, GoBD-Schutz, Datenintegrität)
- `node scripts/generate_and_test.js` → **PIPELINE COMPLETE 4/4**, B2G-Validierung `Valid=true, Errors=0`
- Artefakt-Checks: `RE-2026-B2G-001.xml` enthält `BuyerReference 991-12345678-12`, `CountryID DE` (Seller+Buyer), `CalculatedAmount`, `unitCode="MTK"`, `DueDateDateTime`; eingebettete `factur-x.xml` in den Hybrid-PDFs wohlgeformt und summenkonsistent.

---

## 4. Verbleibende Risiken / offene Punkte
1. **Externer Konformitätsnachweis:** VeraPDF (ISO 19005-3) und Mustang/KoSIT-Schematron-Lauf noch nicht automatisiert – Anleitung in `doc/zugferd-validation.md`.
2. **FKs nur auf neuen Datenbanken** wirksam (SQLite kann FKs nicht per ALTER nachrüsten).
3. **Einbehalt in der E-Rechnung** wird als `TotalPrepaidAmount` modelliert (numerisch BR-CO-16-konform; semantisch wäre ein BG-20-Allowance-Block sauberer).
4. **Kein Benutzer-/Rollenkonzept:** Das Entsperren ist audit-pflichtig (Begründung), aber ohne echte Benutzerzuordnung.
5. **Manueller Smoke-Test** im laufenden Electron empfohlen (Export-Button Editor + Dashboard, Sichtseiten-Parität beim Druck).
