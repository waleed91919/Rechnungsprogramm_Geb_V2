# Zusammenfassung der Entwicklungssitzung – Recherche-Fixes & Kernmodul F11 Banking / OPOS / SEPA
**Datum:** 26.08.2026  
**Projekt:** W-Link Rechnungsprogramm / Bau-ERP V2  
**Ziel:** 
1. Behebung der Fach- und Gesetzesfehler [F1] bis [F5] aus dem Recherche- und Validierungsbericht `Features/9_recherche_validierung_2026-08-25.txt`.
2. Vollständige Konzeption und Implementierung von Modul F11: Bankimport (CAMT.053 XML / CSV), Intelligenter OPOS-Zahlungsabgleich & SEPA-Lastschriften (`pain.008`).

**Methodik:** Subagent-Kette: **Web-Recherche & Planung** (`plan_creator`, Prüfung von Rechtsnormen, ISO 20022 & EPC-Standards) -> **Code-Implementierung** (`plan_executor`, schrittweiser Umbau aller Schichten) -> **Verifikation** (Testsuite mit 167 Tests).

---

## 1. Teil A: Behebung der Recherche-Validierungs-Fixes ([F1] bis [F5])

Basierend auf Plan [`plans/recherche-validierung-fixes-plan.md`](../plans/recherche-validierung-fixes-plan.md):

| Nr. | Bereich | Problem / Befund | Durchgeführte Behebung |
|---|---|---|---|
| **[F1]** | E-Rechnung (§ 13b UStG) | Ungültiger Codelistenwert `VTEX` und unzureichender Hinweis. | • BT-120 (`ExemptionReason`) auf den zwingenden gesetzlichen Pflichtwortlaut gem. **§ 14a Abs. 5 Satz 1 UStG** umgestellt: `Steuerschuldnerschaft des Leistungsempfängers`.<br>• BT-121 (`ExemptionReasonCode`) auf den offiziellen Peppol/EN 16931-Code **`VATEX-EU-AE`** korrigiert. |
| **[F2]** | Factur-X / ZUGFeRD XMP | Namespace- & Conformance-Konsistenz. | Verifikation des standardisierten XMP-Namespace `urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#` mit Präfix `fx`, `DocumentFileName=factur-x.xml` und `DocumentType=INVOICE`. |
| **[F3]** | Reinigungs-LV Zuschläge | Veraltete Begriffe im Tarifprofil. | • Begriff „Mehrarbeit +25 %“ durch den **Belastungszuschlag (+25 %)** gem. **§ 10 Ziff. 3 RTV Gebäudereinigung** (> 8 h/Tag bzw. > 40 h/Woche) ersetzt.<br>• Hohe Feiertage (+200 %) auf die tariflich gültigen Tage normiert (*Neujahr, 1. Mai, 1. und 2. Weihnachtsfeiertag*). |
| **[F4]** | Lohngruppen 2026 | Fehlende Tarifgruppen. | • Vollständiger 9-stufiger Katalog `LOHNGRUPPEN_GEBAEUDEREINIGUNG_2026` (LG 1 bis LG 9) hinterlegt.<br>• Allgemeinverbindliche Mindestlöhne 2026: **LG 1 = 15,00 €/h**, **LG 6 = 18,40 €/h** mit automatischer Unterschreitungsprüfung `pruefeMindestlohn()`. |
| **[F5]** | Sicherheitseinbehalte | Falschbuchungsrisiko in BT-113. | Strukturierte Notiz `#EINBEHALT#PROZENT=5.00#BETRAG=...#GRUND=VOB/B § 17#ABLOESBAR=Buergschaft#` in BT-20 (`SpecifiedTradePaymentTerms`) und nachrichtliche `IncludedNote` mit `SubjectCode=PMT` in BT-22 generiert. |

---

## 2. Teil B: Neues Kernmodul F11 (Banking, OPOS-Matching & SEPA-Lastschriften)

Basierend auf Plan [`plans/bankimport-opos-sepa-plan.md`](../plans/bankimport-opos-sepa-plan.md):

### 1. Bankimport (CAMT.053 XML & CSV)
- **CAMT.053 / CAMT.052 Parser ([`controllers/BankingController.js`](../controllers/BankingController.js)):**
  - Parst ISO 20022 XML-Kontoauszüge (`camt.053.001.02` bis `camt.053.001.08`) und untertägige Kontoberichte (`camt.052`).
  - Extrahiert Kontosalden (`OPBD`, `CLBD`), Buchungsbeträge (`<Amt>`, `<CdtDbtInd>`), Partnerdaten (`<Dbtr>`, `<Cdtr>`) und Verwendungszwecke (`<RmtInf><Ustrd>`).
- **Deutscher CSV-Universal-Parser:**
  - Vorkonfigurierte Importprofile für **Sparkasse**, **Volksbanken (FIDUCIA)**, **Deutsche Bank** (Soll/Haben-Spalten), **Commerzbank** und generische Bankauszüge.
- **Transaktions-Deduplizierung:**
  - Deterministischer SHA-256-Fingerprint je Buchung (`calculateTransactionHash`) verhindert Doppelimporte überlappender Zeiträume.

### 2. Intelligenter 4-Stufen OPOS-Zahlungsabgleich
- **Automatisierte Matching-Engine:**
  - **Pass 1 (Exakt):** 100 % Treffer über Rechnungsnummer im Verwendungszweck (Regex) + Betrag.
  - **Pass 2 (Skonto nach § 14 Abs. 4 UStG):** Automatische Erkennung gezogener Skontoabzüge (z. B. 2 % oder 3 %) bei fristgerechter Zahlung $\rightarrow$ Vollständiger Rechnungsabgleich mit Skontobuchung.
  - **Pass 3 (Teilzahlung):** Verbuchung von Teil- und Abschlagszahlungen mit automatischer Restforderungsberechnung.
  - **Pass 4 (Stammdaten):** Abgleich über hinterlegte Kunden-IBAN und Betrag.
- **Mahnwesen-Entlastung & GoBD:**
  - Vollständig ausgeglichene Rechnungen verlassen sofort den Mahnlauf (automatischer Mahnstopp).
  - GoBD-konforme Belegsperre (`isLocked = 1`) und lückenlose Audit-Kette (`zahlung_zuordnungen`).

### 3. SEPA-Lastschriften (`pain.008`) & Mandatsverwaltung
- **Mandats-Engine ([`controllers/SepaController.js`](../controllers/SepaController.js)):**
  - Kundenstamm-Erweiterung für SEPA-Mandate (**CORE** Basislastschrift vs. **B2B** Firmenlastschrift, Sequenzen `FRST` $\rightarrow$ `RCUR`, IBAN-Prüfziffer Modulo 97).
- **ISO 20022 XML-Generator:**
  - Erzeugung von Lastschrift-Sammeldateien im Standard **`pain.008.001.08`** (inkl. Fallback auf `pain.008.001.02`) zur Einreichung bei der Bank.
- **Pre-Notification & Dauerrechnungen:**
  - Gesetzliche Vorabinformation nach Art. 5.6 EPC Rulebook mit TARGET2-Bankarbeitstageberechnung.
  - 1-Klick-Übernahme fälliger Dauerrechnungsläufe in SEPA-Lastschriftläufe.

### 4. Benutzeroberfläche & Navigation ([`code.html`](../code.html), [`js/banking.js`](../js/banking.js))
- Neuer Menüpunkt **„Banking & OPOS“** mit 4 Reitern:
  1. *Kontoauszug & Import:* Drag & Drop Upload für CAMT.053 XML und CSV.
  2. *OPOS-Abgleich:* Zuordnungs-Cockpit mit automatischer Vorschlagsliste und 1-Klick-Buchung.
  3. *SEPA-Lastschriften:* Erstellung und XML-Download von Lastschriftläufen.
  4. *Konten & Mandate:* Verwaltung eigener Bankkonten und Kundenmandate.

---

## 3. Datenbank-Schema-Erweiterungen (`schema.js` & `db.js`)

- **Neue Tabellen:**
  - `bank_konten`: Eigene Geschäftskonten mit Gläubiger-ID, IBAN, BIC und Salden.
  - `bank_transaktionen`: Kontoauszugspositionen mit Status und Deduplizierungs-Hash.
  - `zahlung_zuordnungen`: GoBD-Audit-Verknüpfung zwischen Bankbuchungen und Rechnungsbelegen.
  - `kunden_sepa_mandate`: SEPA-Mandate je Kunde.
  - `sepa_lastschrift_laeufe` & `sepa_lastschrift_positionen`: Erfassung und XML-Archivierung von Lastschriftläufen.
- **Migrationsspalten:**
  - `dokumente`: `skonto_tage`, `skonto_prozent`, `bezahlt_betrag`, `offener_betrag`, `sepa_mandat_id`.
  - `kunden`: `iban`, `bic`, `bank_name`, `kontoinhaber`, `sepa_mandat_aktiv`.

---

## 4. Dateistruktur-Übersicht

### Neu erstellte Dateien:
- [`controllers/BankingController.js`](../controllers/BankingController.js) (CAMT-/CSV-Parser & 4-Pass Matching Engine)
- [`controllers/SepaController.js`](../controllers/SepaController.js) (IBAN Modulo 97, TARGET2, Pre-Notification, pain.008 XML)
- [`js/banking.js`](../js/banking.js) (Frontend-Logik für Banking & OPOS)
- [`plans/recherche-validierung-fixes-plan.md`](../plans/recherche-validierung-fixes-plan.md) (Plan zu [F1]–[F5])
- [`plans/bankimport-opos-sepa-plan.md`](../plans/bankimport-opos-sepa-plan.md) (Master-Plan zu F11)
- [`tests/banking_parser.test.js`](../tests/banking_parser.test.js) (CAMT.053/052 & CSV Tests)
- [`tests/opos_matching.test.js`](../tests/opos_matching.test.js) (Matching-, Skonto- & Mahnstopp-Tests)
- [`tests/sepa_pain008.test.js`](../tests/sepa_pain008.test.js) (SEPA XML & TARGET2 Tests)
- [`doc/session_summary_2026-08-26.md`](session_summary_2026-08-26.md) (Diese Zusammenfassung)

### Modifizierte Dateien:
- [`js/einvoice.js`](../js/einvoice.js) (F1 & F5 E-Rechnung Fixes)
- [`controllers/ReinigungController.js`](../controllers/ReinigungController.js) (F3 & F4 Belastungszuschlag, Lohngruppen)
- [`js/putzplan.js`](../js/putzplan.js) (UI-Sync für Belastungszuschlag)
- [`js/kunden.js`](../js/kunden.js) (IBAN/BIC & Mandats-Anbindung)
- [`js/editor.js`](../js/editor.js) (Skonto-Felder & Zahlungsziel)
- [`js/navigation.js`](../js/navigation.js) (Banking-Menü-Routing)
- [`schema.js`](../schema.js) & [`db.js`](../db.js) (Tabellen, Migrationen, IPC & DB-Methoden)
- [`main.js`](../main.js) & [`preload.js`](../preload.js) (16 neue Banking/SEPA IPC-Kanäle)
- [`code.html`](../code.html) (Banking-View mit 4 Tabs, Skonto- & Mandats-Modals)
- [`tests/zugferd.test.js`](../tests/zugferd.test.js) (Z8 & Z13 Tests)
- [`tests/reinigungslv_kalkulation.test.js`](../tests/reinigungslv_kalkulation.test.js) (R10 & R11 Tests)
- [`tests/end_to_end_generate.test.js`](../tests/end_to_end_generate.test.js) (E2E Synchronisation)
- [`doc/changelog.md`](changelog.md) (Changelog-Update)

---

## 5. Testergebnisse

Gesamttestlauf via `npm test` (`node --test tests/*.test.js`):
- **167 von 167 Tests bestanden (0 Fehler, 0 Warnungen)**
- Testzuwachs in dieser Sitzung: **+21 neue Tests** (von 146 auf 167 Tests)
- E2E Document Pipeline: **4/4 Test-Cases PASS**
- Projektkonventionen eingehalten (Produktionscode ohne unnötige Kommentare, deutsche Benutzeroberfläche).
