# A — W-Link-Implementierung und Datenfluss (Read-only-Analyse)

## 0. Snapshot-Kopf (fix, nicht gewechselt)

- Repo: `C:\Users\walee\Desktop\server\Rechnungsprogramm_Geb_V2`, Branch: `main`, SHA: `791fb77f6e2fc50c355569b15cde8493bb6da0de` (2026-10-04, `git log -1 --format="%H %ad"` bestaetigt, `git rev-parse HEAD` identisch).
- `git status --short`: in Sitzung nur lesend geprueft (pre-existing uncommitted: `analyse_2026-10-04/`, `plans/testen_das_app.txt` — nicht angefasst).
- OS: Windows (win32, PowerShell 5.1), Node: `v25.1.0` (`node --version`), Electron `^32.3.3` / better-sqlite3 `^12.6.2` (package.json-Angabe aus Hypothesenbericht, C/D-Niveau — nicht erneut verifiziert).
- App-Form: Source + `dist/win-unpacked` (Hypothese aus Aufgabenstellung; kein Start erfolgt).
- Methode: NUR Read-only (Glob/Grep/Read, Websearch/Webfetch). KEINE Code-/Schema-/Dependency-Aenderung, KEINE Commits/Pushes/PRs, produktive `database.sqlite` NICHT angefasst/migriert, KEINE eigenen Testlaeufe mit Datenbank (daher **kein Status-A** in diesem Bericht vergeben).
- Ausgangshypothesen: `analyse_2026-10-04/ABSCHLUSSBERICHT_AR.md` + `plans/testen_das_app.txt` (Kap. 3, 4, 8) — als Hypothesen geprueft, nicht uebernommen. Verweise darauf sind als `Hypothese:` gekennzeichnet.

### Status-Legende (strikt)

- **A** = eigener isolierter Lauf mit Befehl+Ergebnis (in diesem Bericht NICHT vergeben — keine Laeufe durchgefuehrt).
- **B** = Code selbst gelesen (`Pfad:Zeilen`), aber kein Lauf.
- **C** = Code gelesen, aber mit Einschraenkung (z. B. nur Teilpfad, UI-Kette unvollstaendig, Fremdbeleg aus Repo-Doku).
- **D** = Negativ-/Fremdbeleg (Fehlen per Grep ueber Schema/Code, oder nur Sekundaerquelle).
- **E** = fehlt nachweislich (Grep-negativ + bestaetigender Positiv-Kontext, z. B. nur Lieferanten-Tabelle vorhanden).
- Jede Internet-Aussage ist mit URL + Zugriffsdatum `2026-10-04` belegt. Nichts erfunden. Widersprueche bleiben offen.

---

## 1. Ablauf 1 — Angebot / GAEB / Projekt / Folgedokumente

Getrennt bewertet: **1a Direktangebot** vs. **1b GAEB-Weg**.

### 1a. Direktangebot: Entwurf -> Freeze -> Version -> Annahme -> Projekt

| Schritt | Status | Code-Beleg (Datei:Symbol:Zeilen) | Luecke / Bewertung |
|---|---|---|---|
| Entwurf speichern (`ENTWURF`, kein Freeze) | B | `js/editor/editor-save.js:saveAngebotEntwurf:188-223` (setzt `angebot_status='ENTWURF'`, `freeze_snapshot_json=null`, dann `model.saveDocument`); `js/editor/editor-save.js:collectAngebotFormData:442-569` | Entwurf-Pfad vorhanden; Vorab-Validierung nur auf Nr+Kunde, keine Preispruefung vor Freeze. |
| Freeze bei Versand (`VERSENDET` + Snapshot) | B | `controllers/AngebotController.js:freezeAngebot:199-263` (Totals via `calculateTotals`, Snapshot mit Positionen/Konditionen, Status `VERSENDET`); `js/editor/editor-save.js:registerAngebotVersand:225-297` (validate -> confirm -> erst Entwurf sichern -> freeze -> `saveDocument`) | Snapshot-Struktur solide (frozen_at, version, totals, Positionen mit oz_code/cost_type). |
| Freeze-Schutz / State-Guard in DB-Schicht | B | `db/repositories/document_repo.js:applyDocumentWrite:89-204` (FROZEN-Stati VERSENDET/ANGENOMMEN/ABGELEHNT; Rueckfall auf ENTWURF/DRAFT verboten 98-108; Snapshot-Leeren verboten 111-113; Snapshot-Manipulation verboten 116-122; nur Vorwaertsuebergaenge 128-141; Betrags-/Positions-Mutation verboten 143-173; Status-only-Update 176-203 + Audit) | Starke Implementierung; Guards greifen auf `dokumente`-Ebene. Einzige nicht gepruefte Kante: Direkt-Aufruf `updateDocumentStatus` (nur status/faellig) umgeht Angebots-Guard — siehe `document_repo.js:524-559`. |
| Versionierung (v1->v2, Original unveraendert) | B | `controllers/AngebotController.js:createVersion:274-345` (Klon aus Positionen oder Freeze-Snapshot 277-286, Nr-Suffix `-V{n}` 293-300, neuer Entwurf `isLocked:0`, `freeze_snapshot_json:null`); `js/editor/editor-save.js:createNextAngebotVersion:573-606` | Sauber; Parent-Referenz `parent_angebot_id` + `version`-Spalte in `dokumente` (`db/schema/documents_schema.js:28-30`). |
| Annahme (`ANGENOMMEN` + Version protokolliert) | B | `controllers/AngebotController.js:acceptAngebot:355-368`; `js/editor/editor-save.js:acceptAngebotFromModal:608-642`; Ablehnung `rejectAngebotFromModal:644-675` (`ABGELEHNT`) | Annahme setzt nur Status-Felder; Guard erlaubt VERSENDET->ANGENOMMEN/ABGELEHNT (`document_repo.js:128-141`). |
| Projekt aus Angebot (stabile Positionsreferenz) | B | `controllers/AngebotController.js:createProjektFromAngebot:380-459` (Quelle Positionen oder Freeze-Snapshot 383-392, Default nur `in_endsumme_enthalten=1` 396-398, eigene IDs via `idGenerator` 402 + `sourceOfferPositionId`/`source_angebot_pos_id` 406-410, Projekt `status:'BEAUFTRAGT'`, `budget=totals.netto`); `js/editor/editor-save.js:createProjektFromAngebotModal:677-723` (Doppel-Anlage-Guard pro Version 688-692, `saveProjekt`) | Kernbeleg B. Doppel-Schutz nur UI-seitig (`existingProjekt`-Check); kein DB-UNIQUE auf `(source_angebot_id, source_angebot_version)` in `db/schema/projects_schema.js:6-21` — parallele Doppelklicks/2 Clients koennten doppelt anlegen (C). |
| `convertToRechnung` (Angebot->Rechnung) | C | `js/editor/editor-save.js:convertToRechnung:404-430` (Deep-Copy Positionen, füllt Modal, kein direkter DB-Schreibpfad) | Nur UI-Vorbelegung, keine Idempotenz/Verknuepfungstabelle. |
| Risikopruefung (0-EUR, Bindefrist, BGB 650m) | B | `controllers/AngebotController.js:validateAngebot:476-562` (FEHLENDER_PREIS=Error, PREIS_NULL_BESTAETIGUNG=Warning, BGB_650M_HINWEIS nur Info, BINDEFRIST-Fehlt/Unplausibel=Warning) | Hinweis-Charakter korrekt; kein harter B2G/Bindefrist-Block. |

### 1b. GAEB-Weg: X83-Import -> Bepreisungsentwurf -> X84-Export -> Link -> Angebot -> Projekt

| Schritt | Status | Code-Beleg | Luecke / Bewertung |
|---|---|---|---|
| X83-Import (Tabellen, Original-Blob) | B | `db/schema/gaeb_schema.js:initGaebSchema:9-77` (`gaeb_imports` mit `raw_bytes/raw_xml/file_hash` 11-25, `gaeb_categories` 32-45, `gaeb_items` mit `is_qty_tbd/is_price_missing/linked_position_id` 53-77); `db/repositories/gaeb_repository.js:saveX83Import/loadX83Import` (gelesen, Signaturen) | Datenmodell sauber getrennt von `dokumente/positionen`. |
| Bepreisungsentwurf (Tender-Draft) | B | `db/schema/gaeb_schema.js:134-199` (`gaeb_tender_drafts` mit `UNIQUE(import_id, version)`, Status, Zaehler `unpriced/missing_bireq/unresolved_qty_tbd`; `gaeb_tender_item_prices` mit `UNIQUE(draft_id, gaeb_item_id)` 163-176; `gaeb_tender_bireq_answers` 184-193); `preload.js:createTenderDraft/saveTenderDraft/loadTenderDraft/listTenderDrafts/cloneTenderDraft/deleteTenderDraft:235-240` | Entwurfs-Versionierung + Dedup (`deduplicateDraftVersions:233-269`) vorhanden. |
| X84-Export (Angebotsabgabe) | B | `js/gaeb_x84/gaeb_x84_serializer.js:1-50` (XSD-Namensreferenz 3.2/3.3, `<Item>`-Serialisierung); `js/gaeb_x84/gaeb_x84_validator.js`, `gaeb_x84_mapper.js` (Existenz via Glob, Inhalte nicht voll geprueft — C); `preload.js:validateX84Export/exportX84:241-242` | Serialisierung gegen XSD-Dateien unter `tests/schemas/` referenziert (B fuer Serializer-Kopf; Validator-Tiefe C). |
| `linkImportToAngebot` (Import->Angebot) | B | `db/repositories/gaeb_repository.js:linkImportToAngebot:628-662` (prueft Import-Existenz 634-637, `dokumente.type==='angebot'`-Zwang 640-646, INSERT in `gaeb_import_angebote` 649-653); Trigger-Schutz `db/schema/gaeb_schema.js:275-335` (5 Trigger: Typzwang + Typaenderungs-Schutz) + `verifyGaebTriggersAndIndices:341-361` | Hypothese `ABSCHLUSSBERICHT: nur Link ohne Generator` bleibt bestehen: Funktion legt NUR eine Referenzzeile an, erzeugt KEINE Positionen aus `gaeb_items`/`tender_item_prices` in `dokumente/positionen`. Kein `createAngebotFromDraft`-Generator per Grep gefunden (D/E). `linked_position_id` (`gaeb_schema.js:75`) + Loeschschutz `deleteX83Import:746-775` runden das Bild ab, ersetzen aber keinen Generator. |
| GAEB-Angebot -> Projekt | C | Kette nur indirekt: `gaeb_tender_drafts.angebot_id` (`gaeb_schema.js:139`) + `createProjektFromAngebot` (s. 1a) | Kein GAEB-spezifischer Projekt-Generator; Standardpfad nach manueller Angebotsanlage. |
| Auftragsbestätigung (AUFTRAG-Bug) | B | `js/modal-loader.js:20` (`aufmass-uebergabe-modal`: `<option value="AUFTRAG">Auftragsbestätigung</option>` neben ABSCHLAG/SCHLUSSRECHNUNG/ANGEBOT); `js/projects/project-document-flow.js:131-144` (`type: zielTyp==='RECHNUNG' ? 'rechnung' : 'angebot'` — jeder Nicht-RECHNUNG-Wert inkl. `AUFTRAG`/`ABSCHLAG`/`SCHLUSSRECHNUNG` faellt in `'angebot'`, `typ: zielTyp` bleibt Etikett) | Hypothese BESTAETIGT (B): Auswahl `AUFTRAG` erzeugt `type='angebot'` (falscher Typ), ebenso `ABSCHLAG`/`SCHLUSSRECHNUNG` aus diesem Modal (kein `rechnungsart`-Mapping, `nr:null`). Entweder Option entfernen oder echten AB-Typ + eigene Nummer/PDF einfuehren. Widerspruch offen: Modal-Option vs. fehlendem AB-Dokumenttyp in `documents_schema.js:8` (`type` nur `'rechnung'/'angebot'` kommentiert). |
| Kunden-Lieferschein | E | `db/schema/construction_schema.js:lieferscheine_digital:207-220` (NUR Lieferanten-Fotoerfassung: `lieferant_name/foto_pfad/sha256_hash`, FK Projekt) | KEIN Kunden-Lieferschein mit Nummer/PDF gefunden (Grep-negativ `kunden.*lieferschein`, `lieferschein.*kunde` ohne Treffer ausser Hypothesenbericht). Hypothese BESTAETIGT (E). |
| Gutschrift (kaufm. Minderung) vs. Storno (Voll-Storno) | B | Storno-Pfad: `controllers/InvoiceController.js:createStornoData:627-669` (`STORNO - {nr}`, negative Positionen/Betraege, Original `Storniert/locked`, Storno `rechnungsart:'STORNO'`, `status:'Bezahlt'`, `isLocked:true`); atomar `db/repositories/document_repo.js:storniereRechnung:569-602` (Status + Gutschrift in EINER Transaktion); Typ-Code `js/einvoice.js:556-570` (`381` bei Storno sonst `380`), DATEV-Flag `js/datev.js:187-192` | NUR Voll-Storno mit Negativbeleg implementiert. KEIN Generator fuer Minderungs-Gutschrift ohne Voll-Storno gefunden (Grep `GUTSCHRIFT` nur Filter-/Typzweig `einvoice.js:562-563`, `datev.js:192`, kein `createGutschrift`). Hypothese BESTAETIGT (B/D): `Gutschrift ohne Storno` fehlt. |
---

## 2. Ablauf 2 — Aufmass / Nachtrag / kumulative Abrechnung

| Schritt | Status | Code-Beleg | Luecke / Bewertung |
|---|---|---|---|
| Aufmass-Dualitaet ALT (`aufmass`, `position_id TEXT` ohne FK) | B | `db/schema/measurement_schema.js:6-30` (`aufmass.position_id TEXT` 9, kein FK; `projekt_position_id INTEGER REFERENCES projekt_positionen(id)` 8 als neuere Spalte daneben); `db/repositories/aufmass_repo.js:getAufmassByPositionId/saveAufmassForPosition:20-61` (String-Match `WHERE position_id=?`); `models/AufmassModel.js:19-32` (Lookup `String(a.position_id)===String(positionId)`); Migration `db/schema/index.js:589-616` (fuellt `projekt_position_id` aus `position_id`-CAST, nur wenn sicher) + Trigger `index.js:215-216,636-637` (Legacy-Fallback `CAST(position_id AS INTEGER)=OLD.id OR position_id=CAST(OLD.id AS TEXT)`) | Zwei Welten bestaetigt (B): alt TEXT-Key + neu INTEGER-FK koexistieren; Trigger/Migration federn ab, heilen die Dualitaet aber nicht. |
| Aufmass NEU (`aufmass_blaetter/zeilen`, OZ-Match) | B | `db/schema/measurement_schema.js:32-57` (`blaetter`: `project_id` NOT NULL, `status CHECK(DRAFT/SUBMITTED/VERIFIED/FINALIZED)` 38, FK `invoice_id->dokumente`; `zeilen`: `oz_code NOT NULL`, `formel_reb DEFAULT '91'`, `ergebnis`, `vorzeichen`, FK `blatt_id CASCADE`); `db/repositories/aufmass_repo.js:saveAufmassBlatt:122-157`, `mergeSchlussaufmass:167-233` | NEU sauber modelliert, aber Verknuepfung zum LV nur ueber Text. |
| OZ-Match (keine Positions-FK) | B | `db/repositories/aufmass_repo.js:mergeSchlussaufmass:176-232` (Aggregation `GROUP BY TRIM(z.oz_code)` 188, Preis-Lookup aus `positionen JOIN dokumente WHERE d.projektId=? AND type IN ('angebot','rechnung')` 194-206, First-Win-Map `if (!priceMap.has)` 212-214, `position_id: matchedPos ? matchedPos.position_id : null` 230 — faktisch Positionsname/NULL); Uebergabe-Match `js/projects/project-document-flow.js:80-95,99-102` (`a.oz_code===pos.oz \|\| pos.oz_code`, Mengenvergleich `<0.0005`) | Hypothese BESTAETIGT (B): kein FK `aufmass_zeilen->positionen/projekt_positionen`; OZ-Tippfehler/14- vs. 9-Stellen fuehren zu `einheitspreis:0` (stille Null). |
| DA11 (REB 23.003, 80-Zeichen/CRLF) | B | `js/da11.js:DA11Service:1-80` (cleanAscii-Transliteration VOR Padding 21-33, `formatOZ` 9-stellig 54-58, `formatAddress` BBBBZI 66-78; Gesamtdatei 349 Zeilen, Satzarten 00/11/99 im Kopfkommentar 7-11); `preload.js:exportDA11:35` | Implementierungstiefe B (Kopf + Formater gelesen; Rest C — nicht Zeile-fuer-Zeile verifiziert). Normbezug s. Quellentabelle. |
| X31 (GAEB-Mengenermittlung) | B | `db/repositories/aufmass_repo.js:exportGAEBX31:236-257` (Blaetter+Positionen -> `GaebX31Service.generateX31Xml` + Audit `GAEB_X31_EXPORT`), `importGAEBX31:259-349` (SheetNo-Gruppierung, je Blatt ein `aufmass_blaetter` Status DRAFT, Audit `GAEB_X31_IMPORTED`); `js/gaeb-x31.js` (Existenz B/C); `preload.js:exportGAEBX31/importGAEBX31:36-37` | Roundtrip vorhanden; Import landet immer als DRAFT (korrekt), `mergeSchlussaufmass` schliesst DRAFTs default AUS (167-173) — frisch importierte X31-Blaetter wirken erst nach Statuswechsel. |
| Nachtrag GENEHMIGT -> Rechnung (idempotent) | B | `controllers/NachtragController.js:extractApprovedPositionsForInvoice:100-126` (nur `status==='GENEHMIGT`, Key-Bausteine `nachtrag_id/nachtrag_pos_id` 118-119, Prefix `[nr]` im Namen, `is_supplement:true`); `js/projects/project-document-flow.js:applyApprovedNachtraegeToCurrentInvoice:162-290` (GENEHMIGT-Filter 167, GoBD-Lock-Check 193-197, Idempotenz-Key `N:{id}:POS:{pos}` 209-224, Persistenz via `saveRechnung`/Neu-Entwurf 238-267, Reload-Verify 270-280) | Idempotenz (B) sauber; aber: Positionen landen in `positionen` des ZIELBELEGS, NICHT in `projekt_positionen` (kein INSERT in `projekt_positionen` in dieser Funktion; Tabelle s. `projects_schema.js:32-57`). Hypothese `GENEHMIGT->projekt_positionen fehlend` BESTAETIGT (B/D). Folge: Nachtrags-LV steht nicht im Projekt-LV (Controlling/Preisfindung via `mergeSchlussaufmass`-priceMap greift Nachtraege nur, wenn sie zufaellig in einem Beleg stehen). |
| Kumulativ-Formel F_t = L_t - Sum(F_i) | B | `controllers/CumulativeBillingController.js:calculateCumulativeInvoice:19-106` (Summe Vorrechnungen 31-33, `currentPeriodNet=max(0,L_t-Sum)` 36, Retention-Ziel minus Vor-Einbehalte 76, `netPayable=gross-Einbehalt` 84, EXECUTION-Cap 51-64, VOB/A-9c-Hinweis <250k 67-69, Escrow-Frist `getEscrowDeadline(invoiceDate,18)` 115-176: Mo-Sa ohne So/Feiertage); gespiegelt `controllers/InvoiceController.js:calculateTotals:24-271` (eine Einbehalt-Quelle P0.2 42-47, `calcRetention` 135-176, `zahlbetrag=brutto-Anzahlung-Einbehalt-Verrechnungen(brutto)` 242-243, Steuerbasis NICHT durch Einbehalt/Verrechnung gemindert 182-184) | Formel + Steuerlogik (§14 Abs.5 UStG, EN 16931) stark (B). Zwei Rechner (Cumulative + Invoice) sind bewusst gespiegelt, aber Duplikationsrisiko bleibt (Kommentar 136-138). |
| Verrechnungs-Guard (Doppel-Abzug blockiert) | B | `db/repositories/document_repo.js:insertVerrechnungenGuarded:381-411` (Selbstverrechnung verboten 388-390, Paar-Dedup im Beleg 392-395, globaler Schutz `WHERE vorherige_rechnung_id=? AND aktuelle_rechnung_id!=?` 384/397-400, Brutto-Fallback `netto*1.19` 406-408) + atomares Schreiben `applyDocumentWrite`/`saveDocument`/`bulkSaveDocuments` (Transaktionen) | Guard (B) vorhanden. KEIN Pflicht-Check `Schlussrechnung muss ALLE Abschlaege verrechnen` gefunden (D) — Guard verhindert Doppeltes, aber nicht Fehlendes. |
| Retention / Escrow (VOB/B §17) | B | `CumulativeBillingController.js` s. o. + `createSecurityRetentionEntry:181-216` (EXECUTION +1J / WARRANTY +4J, `escrowDueDate`, Status HELD); Tabellen `db/schema/documents_schema.js:invoice_cumulative_states:71-89` (`billing_type ADVANCE/PARTIAL_FINAL/FINAL`, `invoice_id UNIQUE`), `security_retentions:91-102` (EXECUTION/WARRANTY, HELD/RELEASED/GUARANTEE_SUBSTITUTED); Salden `InvoiceController.js:computeProjectBalance:288-315` (SAL-1: `offenerSaldo=(fakturiert+freigegeben)-gezahlt` 300-304) | Persistenz + Saldenlogik vorhanden (B). Ob `security_retentions`-Zeilen beim Rechnungsspeichern AUTOMATISCH geschrieben werden, ist aus gelesenem Code NICHT belegt (D/offen) — `createSecurityRetentionEntry` ist reine Objektfabrik ohne DB-INSERT im gelesenen Ausschnitt. |
| Doppel-Schlussrechnung moeglich? | C | `js/projects/project-calculations.js:calculateProjektUmsatz:29-37` (`.find(SCHLUSSRECHNUNG)` nimmt die ERSTE, `MAX(kumulierte_leistung_netto)` bei mehreren Abschlaegen); `controlling_bautagebuch_repo.js:344-353` (Filter SCHLUSS/TEILSCHLUSS/ABSCHLAG_KUMULIERT); KEIN `UNIQUE(projektId, rechnungsart=SCHLUSS)` in `documents_schema.js`/`index.js` per Grep (D) | Hypothese `Doppel-Schluss moeglich` NICHT WIDERLEGT (C/D): kein DB-Constraint gefunden; Umsatz nimmt nur erste Schlussrechnung. Ob UI/Validierung anderweitig blockt, offen. |
---

## 3. Ablauf 3 — Zahlung / Mahnung / E-Rechnung / Export / Backup

| Schritt | Status | Code-Beleg | Luecke / Bewertung |
|---|---|---|---|
| `bezahlt`-Markierung (Status only) | B | `js/editor/editor-save.js:markAsPaid:380-402` (Confirm -> `model.markAsPaid(rech)` -> Toast, kein Betrag/Transaktion); schmaler Pfad `db/repositories/document_repo.js:updateDocumentStatus:524-559` (nur `status,faellig`, Audit `STATUS_GEAENDERT`) | Bestaetigt (B): Statuswechsel ohne Bankbuchung/Betrag. Bruch zu OPOS s. naechste Zeile. |
| OPOS-Matching / `applyPaymentMatching` / `unmatch` | B | `db/repositories/banking_repo.js:applyPaymentMatching:287-400` (INSERT `zahlung_zuordnungen` 303-316, Transaktions-Status ZUGEORDNET/TEILWEISE 318-326, `bezahlt_betrag/offener_betrag`-Fortschreibung 331-335, Vollzahlung -> `status='Bezahlt'`, `isLocked=1`, `mahnungLevel=0` 337-347 + Hash-Neuberechnung, Audit `ZAHLUNGSEINGANG` 357-368; Eingangsrechnungen -> BEZAHLT 372-391); `unmatchTransaction:402-...` (Storno-Flag, Rueckrechnung `bezahlt/offen`, Status `Ausstehend/Teilweise`, Lock-Restore via `was_locked_vor_zahlung` 416-418, Audit `ZAHLUNG_ENTKOPPELT`); Schema `db/schema/banking_schema.js:zahlung_zuordnungen:46-59` (+ `storno_flag/storniert_am/storno_grund` per Migration `index.js:710-712`); UI `js/banking.js:runOposMatching/applyPaymentMatching/unmatchTransaction:295-422` | Matching ist die EIGENTLICHE Zahlungsbuchung (B). `markAsPaid` (Status) und Matching (Buchung) sind nicht verknuepft — Hypothese `markAsPaid<->zahlung_zuordnungen fehlt` BESTAETIGT (B). Positiv: Mahnstopp bei Vollzahlung + Lock-Herkunftssicherung (`was_locked_vor_zahlung`, Migration `index.js:708`). |
| Mahnung (Level/Datum/Gebuehr, isLocked-Pflicht?) | B | Felder `db/schema/documents_schema.js:mahnungLevel/mahnungDatum/mahnungGebuehr:23-25` (+ Migrationen `index.js:300-316`); Pflicht-Logik `js/settings/settings-mahnung.js:generateMahnungPdf:2-40` (`status==='Überfällig'` 13-17 UND `isLocked` 20-23 sonst Abbruch); Stufen 1-3 + Gebuehren `confirmMahnungLevel:50-80` (`mahngebuehr1/2/3`, Default 0/5/10); Historie `db/schema/core_schema.js:email_versandhistorie:22-43` (`beleg_typ MAHNUNG`, `mahnstufe 1..3`, Versandstatus); GoBD-Statuspfad `document_repo.js:64-73` (Mahnfelder auch an gesperrten Belegen erlaubt + Audit) | isLocked-Pflicht ist REAL (B), aber nur als Toast-Fehlermeldung (`muss zuerst gedruckt werden (GoBD-Sperre)`) — in UI nicht vorab erklaert (UX-Luecke, an B weitergeben). Bulk-Versandnachweis (`smtp:sendBeleg`) im gelesenen Ausschnitt NICHT belegt (D/offen); Einzelversand via `main/email.js:282` (Beleg-Select inkl. Mahnfeldern) existiert. |
| Schlussrechnung (Typ + Bezug) | C | Typ `rechnungsart='SCHLUSSRECHNUNG'` gesetzt/ausgelesen in `js/editor/editor-events.js:1357`, `js/editor/editor-calculation.js:133-140`, Badge `js/dashboard.js:254-261`, Controlling-Filter `controlling_bautagebuch_repo.js:344-353`; VOB-Fristen `controllers/BankingController.js:getVobPaymentTermDays/calculateVobDueDate:1005-1118` (ABSCHLAG 21 Tage / SCHLUSS 30 Tage) | Typ + Fristen vorhanden (C); Eindeutigkeit/Pflicht-Verrechnung s. Ablauf-2-Luecken. |
| PDF (Druck) vs. XML (E-Rechnung) | B | Kanaele `preload.js:savePdf/printDocument/exportZugferdPdf/exportXRechnungXml:162-165`; Editor-Export `js/editor/editor-export.js:exportZugferdPdfFromModal/exportXRechnungXml:1-98` (mit IPC-Fallback); Engine `js/einvoice.js:EInvoiceEngine` (XRechnung-3.0-URN `GUIDELINE_XRECHNUNG_30` 6, Factur-X-URN 9, `round2` bitidentisch zu InvoiceController 27-29, `toDate102` 34-48, Storno-TypeCode `381/380` 556-570/726); B2G-Guards `controllers/InvoiceController.js:validateSaveDocument:336-349` (B2C+13b verboten, B2G+brutto verboten, B2G Leitweg-ID Pflicht + `validateLeitwegId` MOD97-10 574-622); Repo-Doku warnt: Export aus DOM statt DB + URN-/KoSIT-Vorbehalt (`doc/app-map/02-rechnungskern-flow.md:35`, C-Fremdbeleg) | Trennung PDF/XML korrekt verdrahtet (B). Offen (C/D): KoSIT-/Schematron-Nachweis und PDF/A-3-Container (`main/zugferd-builder.js` nicht gelesen — bewusst NICHT als verifiziert behauptet). |
| Backup / Restore | C | Tabelle `db/schema/core_schema.js:backup_history:45-57` (Trigger-Typen inkl. `PRE_RESTORE/RESTORE_ROLLBACK`, `integrity_status OK/CORRUPT/UNKNOWN`); Kanaele `preload.js:createBackup/getBackupHistory/verifyBackup/restoreBackup/backupDatabase/restoreDatabase:154-160`; `doc/app-map/03-daten-ipc-schema.md:113` listet Handler in `main.js:882-1216` (C-Fremdbeleg); Hypothesenbericht nennt `main/backup.js:46-406` + `tests/backup.test.js 3/3` (D — NICHT selbst gelesen, kein Lauf) | Existenz B/C; atomar/SHA-verify-Behauptung bleibt D (nicht verifiziert, kein A-Lauf). `backups/`-Ordner im Snapshot vorhanden (Read: `backups/`-Eintrag), Inhalt nicht geprueft. |
| DATEV EXTF 700 | B | `js/datev.js:DATEVExporter:1-80` (EXTF-700-Kopf 31 Felder 65-80, `sanitizeCsvField` mit CSV-Injection-Schutz 11-19, `formatDatevTimestamp` 17-stellig 27-36, SKR03/04 66-77); Storno-/Gutschrift-Logik `datev.js:187-192` (Negativbetrag/Typ -> `S/H`-Seite), Einbehalt-Konto 1540/1240 im Kopfkommentar 5-8 | B fuer Kopf+Sanitizing; Buchungszeilen-Detail (Konten 8400/4400, 8337/4337-13b) nur per Kopfkommentar angedeutet — C. Normbezug s. Quellentabelle. |
| XRechnung 3.0 | B | `js/einvoice.js:GUIDELINE_XRECHNUNG_30:6` (`urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0`), Leitweg-Validierung s. o. | URN entspricht Doku-Stand 2024-06 (`xeinkauf.de...xrechnung_3.0`); KoSIT-Schematron-Gegenpruefung offen (C). Normbezug s. Quellentabelle. |
| ZUGFeRD-Container (PDF/A-3 + XML) | C | Indirekt: `exportZugferdPdf`-Kanal + `main/zugferd-builder.js` (nur per Repo-Doku `app-map/02` referenziert, NICHT gelesen); Engine-Anteil CII/D16B in `einvoice.js` (gelesen: Datums-/Steuer-/TypeCode-Logik) | Container-Behauptung (PDF/A-3-Einbettung) NICHT verifiziert (C/D) — bewusst als Luecke ausgewiesen. Normbezug (ZUGFeRD 2.5.2/Factur-X, EN 16931) s. Quellentabelle. |

---

## 4. Datenmodell — zentrale Tabellen/FKs der drei Ablaeufe + Mehrbenutzer-Luecken

### 4.1 Zentrale Tabellen (gelesen)

- **Ablauf 1:** `dokumente` (Angebot+Rechnung gemeinsam, `type`, `nr`, `version`, `parent_angebot_id`, `angebot_status`, `freeze_snapshot_json`, `angenommen_am/_version`, `auftraggeber_typ/vergabe_verfahren/vertragsgrundlage`) + `positionen` (`dokumentId`, `positionstyp`, `in_endsumme_enthalten`, `oz_code`, `bieterangabe_wert`, `cost_type`) + `rechnung_verrechnungen` + GAEB: `gaeb_imports/categories/items(+linked_position_id)/item_bireq/up_components/import_angebote/unique(import,angebot)/tender_drafts(+UNIQUE(import,version))/tender_item_prices(+UNIQUE(draft,item))/tender_bireq_answers` — Belege: `documents_schema.js:6-102`, `gaeb_schema.js:9-199`, Guards `gaeb_schema.js:275-361`, `document_repo.js:89-204,381-411`.
- **Ablauf 2:** `projekte` (`source_angebot_id/_version`, kein Doppel-Schutz-UNIQUE) + `projekt_positionen` (`projekt_id CASCADE`, `source_angebot_pos_id->positionen`, `oz_code`, EKT/Kalkulationsfelder) + `aufmass`/`aufmass_positionen` (alt) + `aufmass_blaetter`/`aufmass_zeilen` (neu) + `nachtraege`/`nachtrag_positionen` (Status-CHECK inkl. GENEHMIGT) + `invoice_cumulative_states` (`invoice_id UNIQUE`, `billing_type ADVANCE/PARTIAL_FINAL/FINAL`) + `security_retentions` — Belege: `projects_schema.js:6-57`, `measurement_schema.js:6-57`, `construction_schema.js:6-35`, `documents_schema.js:61-102`.
- **Ablauf 3:** `dokumente` (Status/Mahnfelder `mahnungLevel/Datum/Gebuehr`, `bezahlt_betrag/offener_betrag/was_locked_vor_zahlung` per Migration `index.js:698-712`, `isLocked`, `sha256_hash`) + `bank_konten/bank_transaktionen(dedup_hash UNIQUE)/zahlung_zuordnungen(+storno-Spalten)/kunden_sepa_mandate/sepa_lastschrift_laeufe/-positionen` + `email_versandhistorie` + `backup_history` + `audit_logs` — Belege: `banking_schema.js:6-114`, `core_schema.js:6-57`, `document_repo.js`, `banking_repo.js:287-440`.
- **FK-Staerken:** `positionen.dokumentId`, `aufmass_zeilen.blatt_id CASCADE`, `gaeb_*` Kaskaden/RESTRICTs, `projekt_positionen.projekt_id CASCADE`, `zahlung_zuordnungen` FKs — Belege s. o.
- **FK-Schwaechen (B):** `aufmass.position_id TEXT` ohne FK; `aufmass_zeilen` ohne Positions-FK (nur `oz_code`-Text); `mergeSchlussaufmass`-Preisquelle ohne Garantie; Nachtrag->Projekt-LV ohne Schreibpfad; kein UNIQUE gegen Doppel-Projekt-pro-Angebotsversion und gegen Doppel-Schlussrechnung (jeweils D/Grep-negativ + Positiv-Kontext).

### 4.2 Was fuer Mehrbenutzer fehlt (D/E, Grep-negativ + Positiv-Kontext)

| Aspekt | Status | Beleg |
|---|---|---|
| Kein `users/benutzer/roles/login`-Tabelle | E | Grep `CREATE TABLE IF NOT EXISTS (users\|benutzer\|roles\|rollen\|user)` — **kein Treffer** in `db/schema/` (D-negativ); Positiv-Kontext: Kern-Tabellen vorhanden (s. 4.1). Hypothese aus ABSCHLUSSBERICHT (kein Login/Rollen) damit bestaetigt auf Schema-Ebene. |
| `audit_logs` ohne Actor (user/device) | B | `db/schema/core_schema.js:audit_logs:6-15` (`entity_type/entity_id/action/previous_hash/current_hash/timestamp/details` — KEIN `user_id/device/actor`). Audit-Aufrufe (`appendAuditLog` in `document_repo.js`, `banking_repo.js`, `aufmass_repo.js`) uebergeben keinen Actor. |
| `preload.invoke(channel,...)` generisch | B | `preload.js:invoke:234` (`invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)`) — umgeht die explizite API-Whitelist (alle anderen Zeilen 3-242 sind explizit). |
| `wrapHandler` ohne Rollenpruefung | C | `main/ipc/ipc-util.js:3` (Handler-Huelse, gelesen nur via Grep-Kontext + `main.js:7,144`, `ipc-core.js:1-95` Registrierungen ohne Auth-Parameter). Keine Rollen-/Session-Logik in Signaturen sichtbar (C — Datei nicht voll gelesen). |
| SQLite-Einzelplatz (WAL, FK) | C | Hypothese (WAL/`foreign_keys=ON` in `db.js:31-34`) als C uebernommen (Datei nicht gelesen). Architektur-Doku soll SQLite als nicht-buero-tauglich einschaetzen (`Architektur/architektur_analyse.md:32` — D-Fremdbeleg, nicht gelesen). |
---

## 5. Datenfluss-Skizze (Text, Ablauf 1-3)

```
[1a DIREKT]  Editor-Formular --collectAngebotFormData--> dokumente(type=angebot, ENTWURF)
                  --registerAngebotVersand: validate -> freezeAngebot--> dokumente(VERSENDET + freeze_snapshot_json)
                  --createVersion--> dokumente(ENTWURF, version+1, parent_angebot_id)
                  --acceptAngebot--> dokumente(ANGENOMMEN, angenommene_version/am)
                  --createProjektFromAngebot--> projekte(BEAUFTRAGT, source_angebot_id/version)
                                               + (IDs NUR in createProjektFromAngebot-Objekt, KEIN INSERT in projekt_positionen
                                                  durch diese Funktion belegt — D/offen, ob saveProjekt sie persistiert)
                  --convertToRechnung (nur UI-Vorbelegung)--> dokumente(type=rechnung)

[1b GAEB]    X83-Datei --saveX83Import--> gaeb_imports/categories/items (+raw_bytes/file_hash)
                  --createTenderDraft/saveTenderDraft--> gaeb_tender_drafts (+UNIQUE(import,version))
                                                         + tender_item_prices (+UNIQUE(draft,item))
                                                         + bireq_answers
                  --exportX84--> X84-XML (Serializer gegen XSD 3.2/3.3)
                  --linkImportToAngebot--> gaeb_import_angebote(import_id, angebot_id) [NUR Referenzzeile]
                  --[MANUELL: Angebot anlegen]--> dokumente(type=angebot) --> weiter wie [1a]
             LUECKEN: kein createAngebotFromDraft-Generator (D); AUFTRAG-Auswahl faellt auf type=angebot (B);
                      kein Kunden-Lieferschein; keine Minderungs-Gutschrift.

[2 AUFMAß]   ALT: position_id TEXT-Key (aufmass/aufmass_positionen, String-Match)
             NEU: aufmass_blaetter --1:n--> aufmass_zeilen (oz_code TEXT, ergebnis*vorzeichen, formel_reb)
                  --mergeSchlussaufmass (ohne DRAFTs; GROUP BY TRIM(oz_code);
                     Preis via positionen JOIN dokumente, First-Win)--> aggRows{oz_code,summe_menge,einheitspreis|0}
                  --executeAufmassUebergabe[UPDATE_EXISTING: Mengen in dokument.positionen + Reload-Verify |
                                            CREATE_NEW: type=rechnung|angebot Entwurf (nr:null)]
             DA11-Export (REB 23.003, 80-Zeichen) / X31-Export/Import (DRAFT-Status, wirkt erst nach Freigabe)
             NACHTRAG: nachtraege(GENEHMIGT)+nachtrag_positionen --extractApprovedPositionsForInvoice-->
                       dokument.positionen (Key N:id:POS:id, idempotent) — NICHT projekt_positionen (B/D)
             KUMULATIV: L_t --calculateCumulativeInvoice/calculateTotals--> F_t=L_t-Sum(F_i);
                        Vor-Einbehalte abziehen; zahlbetrag=brutto-Anzahlung-Einbehalt-Verrechnungen;
                        rechnung_verrechnungen mit Guard (kein Doppel-, aber kein Vollstaendigkeits-Zwang);
                        invoice_cumulative_states/security_retentions als Ablage (Auto-Write D/offen);
                        Umsatz: erste SCHLUSSRECHNUNG bzw. MAX(L_t) — Doppel-Schluss per DB nicht ausgeschlossen (C/D).

[3 ZAHLUNG]  Pfad A (Status): markAsPaid / updateDocumentStatus --> dokumente.status='Bezahlt' (KEINE Buchung, B)
             Pfad B (Buchung): Bankimport (CAMT/CSV, dedup_hash) --> bank_transaktionen
                               --runOposMatching--> Vorschlaege --applyPaymentMatching-->
                               zahlung_zuordnungen + bezahlt_betrag/offener_betrag + ggf. isLocked=1/mahnungLevel=0
                               + Audit ZAHLUNGSEINGANG; unmatch mit Storno-Flag + Lock-Restore (was_locked_vor_zahlung)
             Pfad A x Pfad B NICHT verknuepft (B). Mahnung: Ueberfaellig+isLocked--> Level/Datum/Gebuehr (1-3)
             + email_versandhistorie; Bulk-SMTP-Nachweis offen (D).
             EXPORT: dokumente --collectERechnungExportData (per Doku aus DOM, C-Fremdbeleg)-->
                     XRechnung-XML (URN 3.0, Leitweg-MOD97) | ZUGFeRD-PDF (Container C/D) | DATEV EXTF 700 (31-Felder-Kopf, B)
                     Druck-PDF via save:pdf/printDocument.
             SICHERUNG: backup:create/verify/restore + backup_history (Existenz B/C, Atomaritaet/SHA-Verify D, kein A-Lauf).
             REVISION: dokumente(isLocked/sha256_hash) + audit_logs-Hashkette + Trigger (GoBD-Sperre B; Entsperren verweigert:
                       preload.unlockDocument rejected B `preload.js:18`, Handler `ipc-core.js:74` existiert).
```

---

## 6. Normen-/Doku-Quellentabelle (Internet; Zugriffsdatum 2026-10-04)

| # | Aussage (nur was die Quelle hergibt) | URL (Zugriff 2026-10-04) | Bezug im Code |
|---|---|---|---|
| N1 | GAEB DA XML: aktuelle Version 3.3 (2023-01; Pakete inkl. Mengenermittlung/X31; aeltere Pakete 2021-05) + Beta 3.4 (2026-03); Vorversion 3.2 (2013-10); Regelungsumfang = Fachdoku + XSD je Austauschphase | https://www.gaeb.de/de/service/downloads/gaeb-datenaustausch (Webfetch 2026-10-04) | `gaeb_x84_serializer.js:1-7` (XSD 3.2/3.3), `tests/schemas/gaeb_da_xml_3.*/ ` |
| N2 | GAEB DA XML 3.2 (2013-10): neue Phasen X31/X52/X89; Pakete LV (X80-X87: X83 Angebotsaufforderung, X84 Angebotsabgabe, X86 Auftragserteilung, X87 Auftragsbestätigung) | https://www.gaeb.de/de/produkte/gaeb-datenaustausch/versionen/gaeb-da-xml-version-3-2-stand-2013-10 (Websearch 2026-10-04) | Tender-Draft/X84-Pfad; Luecke X86/X87 nicht implementiert (D) |
| N3 | Phasen-Bedeutung: X83 = Angebotsaufforderung (Mengen ohne Preise, AG->Bieter), X84 = Angebotsabgabe (OZ+Preise, Bieter->AG), X31 = Mengenermittlung/Aufmass (nur GAEB-XML, Pendant zu D11) | https://blog.gaeb-online.de/was-ist-eine-gaeb-datei (Websearch 2026-10-04) | `saveX83Import`/`exportX84`/`exportGAEBX31`-Benennung konsistent |
| N4 | REB-VB 23.003: DA11 = Datenaustausch Aufmass (1979/2009, Dateiendung d11); X31 seit GAEB DA XML 3.2 (10/2013) erlaubt OZ bis 14 Stellen (DA11 max. 9); Adress-Schema Blatt+Zeile; ~25-26 Formeln; REB = Verfahren des BMVI/BMVBS | https://gaeb-365.online/erfassen-der-mensaetze-nach-reb-23-003 + https://de.zxc.wiki/wiki/DA11 (Websearch 2026-10-04) | `da11.js:formatOZ/formatAddress`, `aufmass_zeilen.formel_reb DEFAULT '91'` |
| N5 | ZUGFeRD 2.5.2 (04.08.2026, gueltig ab 01.09.2026) / Factur-X 1.09.2: technisch identisch, hybrid PDF+XML, Basis EN 16931, CII D22B (rueckwaertskompatibel D16B), 5 Profile mit XSD/Schematron, EXTENDED-Erweiterungen (u. a. frz. B2B-Reform) | https://www.ferd-net.de/publikationen-produkte/publikationen/detailseite/zugferd-252-deutsch (Websearch 2026-10-04) | `exportZugferdPdf`-Kanal; Code nennt ZUGFeRD 2.0.1+ (`einvoice.js:2`) — Versionsdifferenz 2.0.1 vs. 2.5.2 als OFFENER Punkt |
| N6 | XRechnung = nationale CIUS zu EN 16931 (KoSIT, IT-Planungsrat); Kennung 3.0 `urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0`; Leitweg-ID = BT-10 Buyer-Reference, Pflicht B2G, Vergabe dezentral Bund/Laender (keine Bundes-DB); B2B braucht KEINE Leitweg-ID | https://xeinkauf.de/app/uploads/2024/07/302-XRechnung-2024-06-20.pdf + https://xeinkauf.de/xrechnung/faq + https://e-rechnung-bund.de/en/faq_category/buyer-reference (Websearch 2026-10-04) | `einvoice.js:6` URN identisch; `validateLeitwegId` MOD97-10; B2G-Pflichtpruefung `InvoiceController.js:340-349` |
| N7 | DATEV EXTF: Kopfzeile 31 Felder, Format EXTF/700/Kategorie 21/Buchungsstapel/Version 13, Semikolon-getrennt, Texte in Anfuehrungszeichen, Zahlen mit Komma, Beispiel-Header dokumentiert; Developer-Portal mit Musterdatei + Import-API | https://developer.datev.de/de/file-format/details/datev-format + https://buchungsstapel.de/tools/extf-kopfzeile (Websearch 2026-10-04) | `datev.js:buildExtf700Header` (31 Felder), `sanitizeCsvField`, SKR03/04 |
| N8 | VOB/B §16: Abschlag 21 Tage nach Zugang prüfbarer Aufstellung; Schlussrechnung 30 Tage (Ausnahme 60 mit Einvernehmen); Abschlag bis Schlussrechnung, danach unselbstaendig; BGB §632a (Abschlag Hoehe erbrachter vertragsgemaesser Leistung, Aufmass-Nachweis); Verbraucherbau §650m: max. 90 % Abschlaege (Einbehalt 10 %) | https://bau-master.com/baublog/zahlungsziel-vob + https://www.bauprofessor.de/abschlagszahlung-bgb + https://www.bauprofessor.de/abschlagszahlung-vob (Websearch 2026-10-04) | `BankingController.js:getVobPaymentTermDays/calculateVobDueDate` (21/30), `AngebotController.js:validateAngebot` BGB-650m-Hinweis, `CumulativeBilling` Fristen |
| N9 | Aufmass (VOB/B §14 Basis Schlussrechnung; nur tatsaechlich erbrachte, pruefbare, gemeinsam festgestellte Mengen; Abrechnung nach Einheitspreis x Menge) | https://www.hoai.de/glossar/aufmass (Websearch 2026-10-04) | `mergeSchlussaufmass` + Aufmass-Uebergabe als Mengenquelle |

---

## 7. Offene Punkte (bewusst unentschieden — an Hauptagent)

1. **Projekt-Positionen-Persistenz:** `createProjektFromAngebot` baut `projectPositions` im Rueckgabe-Objekt (`AngebotController.js:404-435`), aber KEIN gelesener Code zeigt `INSERT INTO projekt_positionen` (weder dort noch in `saveProjekt`-Kette — nicht gelesen). Ob `saveProjekt` Positionen persistiert, ist OFFEN (D). Falls nein, haengen `projekt_position_id`-FK (`measurement_schema.js:8`) und EKT-Auswertungen in der Luft.
2. **`security_retentions`-Auto-Write:** `createSecurityRetentionEntry` ist reine Fabrik (`CumulativeBillingController.js:181-216`); ein DB-INSERT beim Rechnungsspeichern ist NICHT belegt (D). Falls nur manuell/Controlling-seitig geschrieben, sind Retention-Betraege in `calculateTotals` Rechen- aber keine Bestandsdaten.
3. **Doppel-Schluss / Schluss-Vollstaendigkeit:** kein UNIQUE-Constraint (D), `.find()`-Erste-t Olympic (`project-calculations.js:30`) — Bestaetigung braucht echten Negativ-Test in Temp-DB (an Subagent D).
4. **ZUGFeRD-Container:** PDF/A-3-Einbettung (`main/zugferd-builder.js`) und KoSIT-/Schematron-Validierung NICHT gelesen (C/D). Versions-Seed `2.0.1+` vs. aktuell `2.5.2` (N5) klafft.
5. **Backup-Atomaritaet:** `main/backup.js` + `tests/backup.test.js` NICHT gelesen/ausgefuehrt (D). Aussage `3/3 pass` aus Hypothesenbericht bleibt Fremdbeleg.
6. **Schlusszahlungseinrede (§16 Abs.3 Nr.2/5 VOB/B, 28+28-Tage-Vorbehalt):** im Code NICHT gefunden (D) — kein Vorbehalts-Workflow trotz `abnahmeprotokolle`/`bedenken_behinderungen`-Tabellen.
7. **AUFTRAG-Semantik:** Modal bietet 4 Zieltypen, Code kennt 2 (`project-document-flow.js:131-144`). Ob auch `ABSCHLAG`/`SCHLUSSRECHNUNG`-Wahl denselben Bug trifft (ja, per Code-Lesart `type='angebot'`), sollte Subagent D per Temp-DB-Lauf bestaetigen — hier nur B-Lesart, kein Lauf.
8. **Hypothesen-Uebernahmen (C/D):** Electron/better-sqlite3-Versionen, WAL/FK-Flags (`db.js:31-34`), `ipc-core.js:74`-Handler, `main.js:15-61`-Sandbox, SMTP-Bulk, `Architektur/*`-Zitate — NICHT selbst verifiziert, als Hypothese markiert wo verwendet.
9. **Kein Widerspruch per Mehrheit entschieden:** Wo Hypothesenbericht (AR) und Code-Lesart divergieren konnten (z. B. Umfang X84-Validator, `was_locked_vor_zahlung`-Abdeckung), ist jeweils die schwaechere Stufe (C/D) vergeben und die Luecke benannt.

---

## 8. Datei-Nachweis (dieser Bericht)

- Einzige veraenderte/angelegte Datei: `analyse_2026-10-04_run2/A_IMPLEMENTIERUNG.md` (dieser Text). Keine anderen Dateien geaendert, keine Commits, keine DB angefasst.
- Belegregeln eingehalten: kein A vergeben (keine Laeufe); B nur bei selbst gelesenen `Pfad:Zeilen`; C/D/E wie definiert; Internet-Aussagen nur mit URL + `2026-10-04`.

*Ende Subagent A.*