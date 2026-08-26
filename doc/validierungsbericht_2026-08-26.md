# Validierungsbericht – Modul F11 Banking/OPOS/SEPA & Recherche-Fixes [F1]–[F5]

**Datum:** 26.08.2026  
**Projekt:** W-Link Rechnungsprogramm / Bau-ERP V2  
**Geprüfte Basis:** [`plans/bankimport-opos-sepa-plan.md`](../plans/bankimport-opos-sepa-plan.md), [`doc/session_summary_2026-08-26.md`](session_summary_2026-08-26.md)  
**Methodik:** 3 parallele Review-Subagents (ISO-20022-Parser-Review mit Web-Recherche, Compliance-/Rechtsrecherche EPC/UStG/GoBD, Struktur-/Integrations-Review Plan↔Code) + unabhängiger Testlauf. **Keine Codeänderungen** – reiner Prüfbericht.

---

## 1. Executive Summary

| Bereich | Ergebnis |
|---|---|
| Testlauf `npm test` | ✅ **167/167 bestanden** (Claim der Session-Summary bestätigt; 0 Fehler) |
| DB-Schema, Migrationen, Indizes | ✅ Vollständig plan-konform (alle 6 Tabellen, alle 15 Indizes, alle Seeds) |
| IPC-Verdrahtung | ✅ 16 Kanäle, main.js ↔ preload.js deckungsgleich |
| Audit-Kette / GoBD-Grundarchitektur | ✅ Sauber (SHA-256-Kette unberührt, Soft-Deletes bei Konten/Mandaten) |
| **pain.008 XML-Generator** | ❌ **3 harte XSD-/Standardverletzungen** → Banken würden Dateien ablehnen |
| **Persistenz Matching-Daten** | ❌ Skonto- und Kunden-Bankfelder werden **nie gespeichert** → Pass 2 + Pass 4 faktisch wirkungslos |
| **Laufzeitfehler** | ❌ `getSepaLaeufe()` wirft SQL-Fehler ("no such column") |
| **CSV-Auto-Erkennung** | ❌ Soll/Haben-Vorzeichen bei Deutscher Bank/Commerzbank falsch (+ statt −) |
| Gläubiger-ID | ⚠️ Keine Validierung; Demo-ID landet als stiller Fallback in echten Lastschriftdateien |

**Gesamturteil:** Architektur und Datenmodell sind solide und überwiegend plan-konform umgesetzt. Das Modul ist jedoch **nicht produktionsreif**: Die SEPA-Exporte wären bankseitig unbrauchbar, die beiden wertvollsten Matching-Pässe verlieren durch fehlende Persistenz ihre Wirkung im Echtbetrieb, und der CSV-Import verfälscht Soll-/Haben-Buchungen. Die Testsuite ist grün, misst aber an den falschen Stellen (In-Memory-Objekte statt DB-Roundtrips, String-Includes statt XSD-Validierung).

---

## 2. Kritische Fehler (Blocker vor Produktivgang)

### [B1] pain.008-XML verstößt gegen ISO-20022-Schema ❌
**Ort:** `controllers/SepaController.js:277`, `:247`, `:300`

1. `<BchBookg>` existiert nicht – das Element heißt **`<BtchBookg>`** (in pain.008.001.02 UND .001.08). Jede generierte Datei scheitert an der XSD.
2. Ab pain.008.001.08 (alle Schemata ab Message-Report 2019) heißt das Element unter `FinInstnId` **`<BICFI>`**, nicht `<BIC>`. Für den Fallback pain.008.001.02 ist `<BIC>` korrekt → Generator muss versionsabhängig ausgeben.
3. **`<ChrgBr>SLEV</ChrgBr>` fehlt vollständig.** EPC/bankenüblich als Pflichtangabe je Lastschriftdatei geführt („Always SLEV" für SEPA); gehört in `PmtInf` nach `CdtrSchmeId`. Ohne ChrgBr drohen Ablehnungen durch strenge Bankvalidatoren.

Zusätzlich riskant: `CdtrSchmeId` nutzt `Id/OrgId/Othr`; EPC-Beispiele und mehrere Bankenspezifikationen verwenden **`PrvtId`** (schema-seitig valide, aber Stolperstein bei strikten Bundesbank-/SDD-Prüfungen).

**Quellen:** GS pain.008.001.08 Elementliste (developer.gs.com, Tag `BtchBookg`/`BICFI`); Danske Bank „pain.008.001.08 Example File & Implementation Guidelines" S. 25–29 (Stand 01.10.2025); docs.findock.com/pain-008.

### [B2] Skonto-Felder werden nie persistiert ❌
**Ort:** `db.js:660 ff.` (`saveDocument` INSERT/UPDATE sowie `applyDocumentWrite`) vs. `js/editor.js:1259–1260`

Der Editor sendet `skonto_tage` und `skonto_prozent`, `saveDocument` schreibt die Spalten aber **nicht** (ebenso `sepa_mandat_id`). Folge: In der Datenbank sind die Felder immer NULL/0 → **Pass 2 (Skonto-Matching gem. Zahlungsbedingungen) kann gegen real gespeicherte Rechnungen niemals greifen.** Der Test O2 umgeht das Problem mit reinen In-Memory-Objekten – deshalb ist der Fehler grün getestet und trotzdem real.

### [B3] Kunden-Bankdaten werden nie persistiert ❌
**Ort:** `db.js:589/603` (`saveKunde`) vs. `js/kunden.js:215`

`saveKunde` speichert `iban`, `bic`, `bank_name`, `kontoinhaber` nicht, obwohl das Frontend sie übergibt. Folge: **Pass 4 (Kunden-IBAN-Match)** funktioniert nur für Kunden, deren Bankdaten zufällig als Seiteneffekt eines `saveSepaMandat` gesetzt wurden (`db.js:3059–3070`).

### [B4] `getSepaLaeufe()` wirft zur Laufzeit einen SQL-Fehler ❌
**Ort:** `db.js:3297` vs. `schema.js:617`

Sortierung nach `sl.created_at`, die Tabelle `sepa_lastschrift_laeufe` hat aber nur die Spalte **`erstellt_am`** → SQLite-Fehler *“no such column”*. Betrifft den SEPA-Reiter (`js/banking.js:386`) und IPC-Kanal 14; der catch-Block schluckt den Fehler, die Läufe-Liste bleibt leer. **Kein Test ruft `getSepaLaeufe` auf** – daher unentdeckt.

### [B5] CSV-Auto-Erkennung importiert Soll-Buchungen mit falschem Vorzeichen ❌
**Ort:** `controllers/BankingController.js:350–364, 427`

`_detectCsvProfile` prüft Sparkasse (`includes('begünstigter')`) **vor** Deutsche Bank/Commerzbank. Die Header „Begünstigter / Auftraggeber" (DB) und „Auftraggeber/Begünstigter" (CoBa) matchen ebenfalls → Profil `CSV_SPARKASSE`. Damit wird die Soll/Haben-Spaltenlogik umgangen: Eine Deutsche-Bank-Soll-Buchung „120,50" wird als **+120.50** importiert statt −120.50 (mit erzwungenem korrektem Profil: −120.50). Vom Review-Agent durch Ausführung nachgewiesen. GoBD-relevant, da Geldeingänge/Geldausgänge vertauscht gebucht werden.

### [B6] CAMT.052: vorgemerkte Buchungen werden importiert ❌
**Ort:** `controllers/BankingController.js:184–298`

Es gibt keinen Filter auf `<Sts>`: CAMT.052 enthält auch `PDNG`-Einträge (vorgemerkt). Diese werden wie gebuchte behandelt → wenn später die gebuchte Variante aus camt.053 kommt, unterscheidet sich der Dedup-Hash ⇒ **Doppelbuchungsrisiko**. Ebenfalls unbeachtet: `RvslInd` (Stornos landen als Normalbuchung).

### [B7] Gläubiger-ID ohne Validierung + Demo-Fallback in Produktionspfaden ❌
**Ort:** `db.js:3130`, `js/banking.js:580`, `schema.js:949`

Keine Prüffunktion für die Gläubiger-Identifikationsnummer (Format `DE[Prüfziffer][ZZZ][Bereichscode][nationale ID]`, Prüfziffer nach ISO 7064 Mod 97-10 auf `Landcode + '00' + nationaler Teil`, CBC fließt NICHT ein). Ohne Konfiguration wird stillschweigend die Beispiel-ID **`DE98ZZZ09999999999`** in echte Lastschriftdateien eingebaut. Quelle: EPC262-08 v12.0 „Creditor Identifier Overview" (europeanpaymentscouncil.eu).

---

## 3. SEPA-Mandatswesen & Pre-Notification (Warnungen)

| Status | Fund | Ort |
|---|---|---|
| ⚠️ | **Pre-Notification-Frist wird nicht durchgesetzt:** `pre_notification_tage` (DEFAULT 14) wird geladen, aber nie geprüft. Ein heute erstellter Lauf mit Fälligkeit morgen verstößt gegen Art. 5.6 EPC Rulebook (14 Kalendertage, außer verkürzt vereinbart). | schema.js:592, db.js:3155 |
| ⚠️ | **FRST→RCUR schon bei Lauf-Erstellung** (Status `ERSTELLT`), nicht erst nach Einreichung/Einlösung. Bei Storno/Rücklastschrift des Erstlaufs bleiben Folge-RCUR-Einzüge ohne wirksame Erstlastschrift. | db.js:3258–3263 |
| ⚠️ | **`SeqTp=MIXED` ist kein gültiger ISO-20022/EPC-Code** (nur FRST/RCUR/FNAL/OOFF). Schema/UI erlauben MIXED, XML würde es unverändert ausgeben → Rücklastschrift-Gefahr. Korrekt wären mehrere `PmtInf`-Blöcke je Sequenztyp; individuelle `mandat.sequenz_typ` wird derzeit ignoriert. Auch kein CORE/B2B-Abgleich gegen Mandatstyp (B2B: Vorbestätigungspflicht bei Zahlerbank). | schema.js:609, db.js:3153 |
| ⚠️ | **`DtOfSgntr`-Fallback:** fehlendes Unterschriftsdatum wird still durch das Ausführungsdatum ersetzt (Nachweis-/Abwehrproblem). Besser Validierungsfehler. | SepaController.js:229 |
| ⚠️ | **Rücklastschrift-Workflow fehlt:** Status `RUECKLASTSCHRIFT` ist schema-seitig vorgesehen, aber kein Verarbeitungsweg implementiert; `createSepaRun` ändert den Belegstatus nicht. | db.js:3119 ff. |
| ✅ | IBAN-Validierung korrekt nach ISO 7064 Mod 97 (Rest=1, blockweise, Länderlängen). Tests DE/AT/CH grün. | SepaController.js:20–48 |
| ✅ | TARGET2-Kalender exakt nach EZB-Closing-Days ({1.1., Karfreitag, Ostermontag, 1.5., 25./26.12.}), Gauss'sche Osterformel fehlerfrei; D-1-Vorlauf regelkonform (seit Nov 2016 für FRST+RCUR). Quellen: ecb.europa.eu; EPC016-06 Core Rulebook 2023 v1.1. | SepaController.js:64–139 |
| ✅ | Pre-Notification-Text enthält alle Pflichtinhalte (Gläubiger-ID, Mandatsreferenz, Termin, Betrag, maskierte IBAN). | SepaController.js:152–177 |

---

## 4. OPOS-Matching & GoBD

| Status | Fund | Ort |
|---|---|---|
| ⚠️ | **Unmatching entsperren bedingungslos:** `unmatchTransaction` setzt `isLocked=0` immer – auch bei Belegen, die bereits vorher festgeschrieben waren (GoBD-Sperre wird durch Korrekturfunktion ausgehebelt). | db.js:2913, 2918 |
| ⚠️ | **Physischer DELETE der Zuordnung** statt Storno-/Soft-Delete → Originalzuordnung nur noch indirekt über Audit-Text nachvollziehbar. | db.js:2970 |
| ⚠️ | **Skonto-Fristprüfung fail-open:** `_isDateWithinDays` liefert `true` bei fehlendem/ungültigem Datum → Auto-Skonto ohne Fristnachweis möglich. | BankingController.js:566–576 |
| ℹ️ | Skonto-Basis ist `docOffen` (brutto − Teilzahlungen), Plan sah `brutto` vor. Normalfall identisch, bei Vor-Teilzahlung abweichend vom vereinbarten Skonto (dokumentiert via `skonto_abzug`). | BankingController.js:630 |
| ℹ️ | Score-Konstanten weichen vom Plan ab (Teilzahlung 90→80, IBAN 88→85, Name 78→75). Funktional unkritisch, Dokumentation inkonsistent. | BankingController.js:651, 680 |
| ✅ | Mahnstopp bei Vollzahlung (`mahnungLevel=0`, Status `Bezahlt`, offener_betrag=0) inkl. Hash-Rückberechnung, Audit `ZAHLUNGSEINGANG`/`ZAHLUNG_ENTKOPPELT`. | db.js:2801–2865, 2899–2976 |

### Rechtslage Skonto – Web-Recherche-Ergebnis
Der Verweis **„§ 14 Abs. 4 UStG" ist zum Prüfstand 26.08.2026 wieder korrekt**:
- Bis 31.12.2020: Angabepflicht in § 14 Abs. 4 Satz 1 Nr. 7 UStG a.F.
- 01.01.2021–31.12.2024 (JStG 2020): Nr. 7 gestrichen, Skonto als Preisnachlass über § 27 Abs. 1 UStG – **in diesem Fenster wäre der Verweis falsch gewesen.**
- Seit 01.01.2025 (JStG 2024, BGBl. 2024 I Nr. 387): § 14 Abs. 4 Satz 1 **Nr. 7 UStG n.F.** wieder in Kraft („jede im Voraus vereinbarte Minderung des Entgelts"). Verifiziert über gesetze-im-internet.de/__14.html.
- **Empfehlung (Präzisierung, keine Korrektur):** UI-Text auf „§ 14 Abs. 4 Satz 1 Nr. 7 UStG" verschärfen und ergänzend §§ 10 Abs. 1, 17 Abs. 1 UStG nennen (Bemessungsgrundlage/Berichtigung). Betroffen: code.html:1760, tests/opos_matching.test.js:56, Plan Z.27/299, Session-Summary Z.42.
- Randfund: code.html:4951 koppelt „§ 14 Abs. 4 Nr. 9 UStG"-Hinweis an „Privatkunde" – die Norm betrifft Aufbewahrungspflicht beim **Bauleistungen**-Empfänger (§ 14b Abs. 1 Satz 5 UStG); semantisch schief gekoppelt.

---

## 5. Bankimport CAMT/CSV – weitere Befunde

| Status | Fund | Ort |
|---|---|---|
| ⚠️ | Namespace-Präfixe (`<camt:Stmt>`) schlagen fehl – nur Default-Namespace-XML funktioniert. | BankingController.js:151 ff. |
| ⚠️ | `importFormat` hartkodiert `'CAMT053'`, auch bei `<Rpt>`-Reports (CAMT052 wird nie gesetzt, obwohl CHECK es erlaubt) → falsche Herkunft im Audit-Feld. | BankingController.js:296 |
| ⚠️ | Mehrzeilige quoted CSV-Felder (VWZ mit Zeilenumbruch) werden nicht unterstützt (naiver Split auf `\r?\n`). | BankingController.js:368 |
| ⚠️ | Sparkasse exportiert in ISO-8859-15/CP1252 – Encoding-Behandlung muss beim Upload geprüft werden (außerhalb Controller ungetestet). | – |
| ⚠️ | Legitime Same-Day-Doppelbuchungen (Kartenumsätze ohne Partner-IBAN) kollidieren mit dem reinen Content-Hash und werden still verworfen. Branch-Best-Practice: bankseitige Referenz (`AcctSvcrRef`/FITID) als Primärkey, Hash nur als Fallback. | BankingController.js:133–143 |
| ✅ | CAMT-Kern standardkonform: `<Stmt>`+`<Rpt>`, `Amt` immer positiv + Vorzeichen nur via `CdtDbtInd`, Bal-Typen OPBD/PRCD/CLBD/CLAV, mehrfach-`Ustrd` konkateniert (deutsche Banken splitten in 35-Zeichen-Blöcke), `Dt`/`DtTm`-Choice, `AcctSvcrRef` als Primanota. Über Plan hinaus: Strd/CdtrRefInf, EndToEndId. | BankingController.js:145–310 |
| ✅ | CSV-Presets plausibel gegen Realheader von Sparkasse (17–18 Spalten, Semikolon, DD.MM.YY) und FIDUCIA/VR (18 Spalten inkl. „Saldo nach Buchung"); Delimiter-/Decimal-/Quote-Behandlung sauber. | BankingController.js:312–434 |

**Hinweis zur Standardversion:** ISO 20022 ist inzwischen bei camt.053.001.11 (2025); getestet ist .02/.08. Die namespace-agnostischen Regexes funktionieren für neuere Minor-Versionen additive weiter.

---

## 6. Struktur-Review (Plan ↔ Implementierung)

### 6.1 Vollständigkeits-Matrix (Auszug)

| Planpunkt | Status | Nachweis |
|---|---|---|
| 6 Tabellen + 15 Indizes + Migrationen + Seeds | ✅ | schema.js:512–641, 813–823, 949–952 |
| Alle 15 geplanten dbAPI-Methoden (+ `getSepaLaufDetails`) | ✅ | db.js:2520–3324 |
| Isomorphie beider Controller (module.exports + window.*) | ✅ | BankingController.js:726–729, SepaController.js:323–327 |
| 16 IPC-Kanäle main/preload deckungsgleich | ✅ | main.js:620–693, preload.js:101–117 |
| Navigation/View mit 4 Tabs, Modals | ✅ | code.html:189, 1658–2005; navigation.js:49–73 |
| Drag & Drop Upload (Plan Schritt 4.1) | ❌ FEHLT | Nur File-Input (code.html:1682). Summary Z.60 behauptet fälschlich Drag&Drop |
| Mandats-Anlege-UI (Plan Schritt 4.4) | ❌ FEHLT | `saveSepaMandat` wird von keinem Renderer-Modul aufgerufen; banking.js bietet nur Anzeigen/Widerrufen (js/banking.js:643–679, 760–769) |
| Pre-Notification Druck-/E-Mail-Button (Plan Tab 3) | ⚠️ TEILWEISE | Nur Clipboard-Kopieren (code.html:2001–2005) |

### 6.2 IPC-Kanalliste (16)
`db:getBankKonten`, `db:saveBankKonto`, `db:deleteBankKonto`, `db:importBankTransactions`, `db:getBankTransaktionen`, `db:runOposMatching`, `db:applyPaymentMatching`, `db:unmatchTransaction`, `db:getKundenMandate`, `db:saveSepaMandat`, `db:deleteSepaMandat`, `db:getOffeneRechnungenFuerSepa`, `db:createSepaRun`, `db:getSepaLaeufe`, `db:getSepaLaufDetails` (über Plan hinaus), `db:exportSepaRunXml`.

---

## 7. Testabdeckung – warum 167 grün trotzdem Lücken hat

| Geplanter Fall | Ist-Zustand | Lücke |
|---|---|---|
| CAMT.053.001.08-Sample (Plan 5.1 T1) | Test-Sample nutzt Namespace **001.02** | .08-Spezifika (DtTm, BICFI, Availability) nie getestet |
| Dedup-Zweitimport ignoriert (T5) | Nur Hash-Determinismus geprüft (tests/banking_parser.test.js:204) | Kein DB-Roundtrip: `importBankTransactions` mit Duplikat wird nie assertiert |
| CSV Auto-Erkennung (Bonus B5) | Assertiert nur Transaktionsanzahl | **Genau deshalb blieb Vorzeichen-Bug [B5] unentdeckt** |
| pain.008-Tests S5/S6 | Nur String-Includes | **Keine echte XSD-Validierung** → `BchBookg`/`BICFI`/`ChrgBr`-Defekte unsichtbar |
| Matching/Skonto O2 | In-Memory-Objekte statt `saveDocument` | **Persistenz-Bugs [B2]/[B3] unsichtbar** |
| SEPA-Läufe | DB-Block testet createSepaRun | `getSepaLaeufe` (Crashfall [B4]) wird nie gerufen |

Qualitativ positiv: Durchgehend konkrete Wert-Assertions (Beträge, Scores, XML-Inhalte, Audit-Kette `verifiziereAuditKette().valid`), keine reinen Smoke-Tests.

## 8. Stichprobe Recherche-Fixes [F1]–[F5]

| Fix | Ergebnis |
|---|---|
| [F1] BT-120/BT-121 | ✅ Wortlaut exakt gem. § 14a Abs. 5 Satz 1 UStG; `VATEX-EU-AE` korrekt für Kategorie AE/Reverse-Charge (EC Technical Guidance, Peppol-VATEX-Codeliste; BR-AE-10) |
| [F3] Belastungszuschlag | ✅ Begriff gem. § 10 Ziff. 3 RTV korrekt (>8h/Tag, >40h/Woche) |
| [F4] Lohngruppen LG1–LG9 | ✅ strukturell vollständig; ⚠️ Tarifsätze 15,00/18,40 € entsprechen Tarifrunde ab 01.01.2025 – **Folgetarifrunde 2026 vor Produktivgang amtlich gegenprüfen** (BRTV/Mindestlohnkommission) |
| [F5] Einbehalt BT-20/BT-22 | ✅ (aus Z13-Test sichtbar) |

---

## 9. Priorisierte Empfehlungen

**P1 – Blocker (vor SEPA-Produktivgang):**
1. pain.008-Generator: `BtchBookg`, versionsabhängig `BICFI` (.001.08) vs. `BIC` (.001.02), `ChrgBr=SLEV`, `CdtrSchmeId`→`PrvtId` [B1]
2. Persistenz: `skonto_tage`/`skonto_prozent`/`sepa_mandat_id` in `saveDocument`; Kunden-Bankdaten in `saveKunde` [B2][B3]
3. `getSepaLaeufe`: Sortierspalte auf `erstellt_am` fixen + ersten Test dafür [B4]
4. CSV-Profil-Reihenfolge: DB/CoBa vor Sparkasse matchen; B5-Test um Vorzeichen-Assertions erweitern [B5]
5. CAMT.052 `Sts`-Filter (PDNG ausschließen), `RvslInd` berücksichtigen [B6]
6. Gläubiger-ID-Validator einführen, Demo-Fallback entfernen [B7]
7. Echte XSD-Validierung der pain.008-Ausgabe in Tests aufnehmen (Schemas lokal hinterlegen)

**P2 – Regelkonformität:**
8. Pre-Notification-Frist erzwingen (`executionDate ≥ heute + pre_notification_tage`)
9. SeqTp je Mandat respektieren (mehrere PmtInf-Blöcke), MIXED entfernen, CORE/B2B-Prüfung
10. FRST→RCUR an Lauf-Status EXPORTIERT/EINGEREICHT binden; Rücklastschrift-Rücknahme
11. `DtOfSgntr`: Validierungsfehler statt Ausführungsdatum-Fallback
12. Rechtsverweise präzisieren (§ 14 Abs. 4 Satz 1 Nr. 7 UStG; § 14b-Kopplung code.html:4951)

**P3 – Robustheit/GoBD-Härtung:**
13. Unmatching respektiert bestehende `isLocked`-Sperre; Zuordnungen per Storno-Flag statt DELETE
14. `_isDateWithinDays` fail-closed (kein Auto-Skonto ohne Datum)
15. Drag&Drop-Upload und Mandats-Anlege-UI nachziehen (Plan-/Summary-Versprechen)
16. Namespace-Präfix-Toleranz (`camt:`), Encoding-Behandlung CP1252 beim Upload, AcctSvrRef als Primär-Dedup-Key
17. Tarifstände 2026 amtlich gegenprüfen

---

*Bericht erstellt durch Review-Subagents; alle Fundstellen wurden direkt im Code verifiziert (Datei:Zeile). Web-Quellen: gesetze-im-internet.de (§§ 14, 14a UStG), europeanpaymentscouncil.eu (EPC262-08 CI Overview, EPC016-06 Rulebook 2023 v1.1, EPC114-06 IGs), ecb.europa.eu (TARGET Closing Days), developer.gs.com / danskeci.com / docs.findock.com (pain.008.001.08-Spezifikation), ec.europa.eu / docs.peppol.eu (VATEX-Codes).*
