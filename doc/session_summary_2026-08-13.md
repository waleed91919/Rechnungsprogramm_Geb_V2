# Zusammenfassung der Entwicklungssitzung - Bau-ERP Erweiterungen
**Datum:** 13.08.2026  
**Projekt:** W-Link Rechnungsprogramm / Bau-ERP V2  
**Ziel:** Vollständige Erweiterung für B2G (Öffentliche Auftraggeber), B2B (§ 13b UStG, § 48b EStG, VOB/B) und B2C (§ 35a EStG) sowie GAEB-Import, DATEV EXTF 700 & GoBD-Compliance.

---

## 1. Übersicht der umgesetzten Architektur & Module

### A. Datenbank & Datenmodell (`db.js`)
- **Erweiterung `kunden`**: `customer_type` ('B2C', 'B2B', 'B2G'), `leitweg_id`, `peppol_id`, `buyer_reference`, `sec48b_status`, `sec48b_certificate_path`.
- **Erweiterung `dokumente`**: `leitweg_id`, `buyer_reference`, `sha256_hash`.
- **Erweiterung `positionen`**: `cost_type` ('LOHN', 'FAHRT', 'GERÄT', 'MATERIAL'), `oz_code` (GAEB OZ), `is_tax_deductible_35a`.
- **Neue Tabellen**: `invoice_cumulative_states`, `security_retentions`, `audit_logs`.

### B. Business Logic Controllers & Compliance Engines
1. **Subunternehmer & Steuer Controller ([`controllers/SubcontractorController.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/controllers/SubcontractorController.js))**:
   - **§ 48b EStG**: Prüfung der Freistellungsbescheinigung & Berechnung der 15% Bauabzugsteuer bei Ablauf/Fehlen.
   - **§ 13b UStG**: Validierung der Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge) für B2B-Bauleistungen.
   - **§ 35a EStG**: Automatische Aufschlüsselung der Lohn- und Fahrtkosten für Privatkunden.

2. **VOB/B Kumulierte Abrechnung ([`controllers/CumulativeBillingController.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/controllers/CumulativeBillingController.js))**:
   - Berechnung kumulierter Abschlagsrechnungen nach der Formel $F_t = L_t - \sum F_i$.
   - Automatische Verwaltung des 5% Sicherheitseinbehalts nach VOB/B § 17.

3. **E-Rechnungs Engine ([`js/einvoice.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/js/einvoice.js))**:
   - EN 16931-1 Validierung und Generierung von XRechnung (CII XML) und ZUGFeRD 2.0.1+ (PDF/A-3).

4. **GAEB Engine ([`js/gaeb.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/js/gaeb.js))**:
   - XML-Parser für GAEB X83 Ausschreibungsdateien und Export für GAEB X84 Angebote.

5. **DATEV EXTF 700 Export ([`js/datev.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/js/datev.js))**:
   - Erzeugung von DATEV Buchungsstapeln im Format 700 mit BU-Schlüsseln 19/68 für § 13b UStG.

6. **GoBD Immutability Engine ([`js/gobd.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/js/gobd.js))**:
   - SHA-256 Hash-Kettung und Prüfungen auf Unveränderbarkeit festgeschriebener Belege.

---

## 2. Benutzeroberfläche & Frontend Refactoring (`code.html`, `js/editor.js`, `js/projekte.js`, `js/dashboard.js`, `js/kunden.js`, `js/einstellungen.js`)

- **Rechnungsübersicht (Tabelle)**:
  - Spalte `Rechnungsart` mit farblichen Badges für *Einzelrechnung*, *Abschlagsrechnung*, *Schlussrechnung* und *Storno*.
  - Direkt-Aktionen für *PDF / ZUGFeRD (PDF/A-3)* und *XRechnung XML (EN 16931)* Downloads pro Zeile.
- **Rechnungs-Editor & Kundenstamm**:
  - Kundentyp-Umschalter (`B2C`, `B2B`, `B2G`) mit Feldern für *Leitweg-ID*, *Buyer Reference* und *PEPPOL-ID*.
  - Automatisches **§ 48b Status-Banner** im Editor, falls Freistellungsbescheinigung eines Subunternehmers fehlt/abgelaufen ist.
  - Dedizierte **B2G E-Rechnungs Sektion** im Editor mit Vorschau & XRechnung-Download.
- **Projekt-Detailansicht**:
  - Drag-and-Drop Uploadzone für **GAEB X83 Dateien** mit automatischer Tabellendarstellung aller Ordnungszahlen (OZ), Kurztitel und Preise.

---

## 3. Automatisiertes Testen & Dokumenten-Generierung (`scripts/generate_and_test.js`)

Es wurde ein automatisierter End-to-End Test- & Beleg-Generator implementiert.  
Testergebnisse & Belege werden strukturiert abgelegt:

- `output/invoices/b2g_xrechnung/RE-2026-B2G-001.xml`
- `output/invoices/b2b_zugferd/RE-2026-B2B-AB1.pdf` & `RE-2026-B2B-AB2.pdf`
- `output/invoices/b2c_privat/RE-2026-B2C-001.pdf`
- `output/invoices/datev_exports/EXTF_2026_JULI.csv`
- `tests/test_results/gobd_audit_hashes.json`
- `tests/test_results/e2e_test_report.json`

---

## 4. Vollständige Implementierung aller 8 ERP-Module & System-Test (Plan 04)

- **Modul 1 (Dashboard)**: Dynamische KPI-Berechnung für OPOS, Monatsumsatz, Gewährleistungseinbehalte und ablaufende § 48b Fristen.
- **Modul 2 (Rechnungen)**: VOB/B Abschlagsaufstellung & GoBD Festschreibung (`POSTED` & SHA-256 Hashing).
- **Modul 3 (Angebote & GAEB)**: GAEB X83 Import & X84 Export Generator (`generateGAEBX84XML`).
- **Modul 4 (Artikel)**: Kategorisierung (`LOHN`, `MATERIAL`, `FAHRT`, `GERÄT`) & § 35a Relevanz.
- **Modul 5 (Kunden & Subunternehmer)**: § 48b Freistellungsbescheinigungsprüfung & 15% Bauabzugsteuer-Berechnung.
- **Modul 6 (Projekte & Bautagebuch)**: REB 23.003-konformes Aufmaßcenter & Bautagebuch-Modul (Witterung, Geräte, Personal, Mängel).
- **Modul 7 (Berichte & DATEV)**: USt-Auswertungen & DATEV EXTF 700 Exporter.
- **Modul 8 (Einstellungen & Backup)**: System-Backup & Logo/Briefpapier-Verwaltung.

**System-Testrunner (`scripts/run_full_system_test.js`)**:  
Ausführung von 14 Modul-Prüfungen über alle 8 Module – **14/14 Bestanden** (0 Fehler, 11/11 Test-Suites in `npm test` grün).
