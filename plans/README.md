# W-Link ERP — Architektur- und Sanierungspläne (11.09.2026)

Dieses Verzeichnis enthält die vollständigen Prüfberichte, Sanierungspläne und Review-Ergebnisse des Gesamtsystem-Audits vom 11. September 2026.

---

## 📑 Inhaltsübersicht

### 1. Prüf- und Review-Berichte (Master-Dokumente)
* [`audit_gesamtbericht_2026-09-11.md`](file:///F:/server/Rechnungsprogramm_Geb_V2/plans/audit_gesamtbericht_2026-09-11.md)
  * **Umfang:** 6 Fach-Audits (Rechnungskern, Electron/GoBD/SQLite, Aufmaß/Nachtrag, Banking/DATEV/SEPA, Sync/PWA, Frontend/Navigation).
  * **Befund:** 16 P0 (Kritisch/Rechtlich/Sicherheit), 19 P1 (Schwerwiegend/Architektur), 12 P2 (Verbesserungen/Tech-Debt).
  * **Rechts- & Normenbasis:** XRechnung 3.0.x (CIUS xeinkauf.de, Schematron BR-DE-21), ZUGFeRD 2.3 / Factur-X, VOB/B § 17 & VOB/A § 9c, REB 23.003 (Satzarten 00/11/99), DATEV EXTF 700, SEPA pain.008.001.08, Electron Security Guidelines.

* [`audit_review_master_report_2026-09-11.md`](file:///F:/server/Rechnungsprogramm_Geb_V2/plans/audit_review_master_report_2026-09-11.md)
  * **Umfang:** Konsolidierte Ergebnisse der 5 unabhängigen Reviewer-Subagents, die jeden Sanierungsplan gegen die reale Codebasis und die Normen gegengeprüft haben.
  * **Status:** Alle 5 Pläne mit Nachbesserungs-Bedingungen freigegeben (Kritische Kantenfälle aufgedeckt und dokumentiert).

---

### 2. Die 5 Modularen Sanierungspläne

| Plan | Titel & Fachgebiet | Primär betroffene Dateien | Relevante Findings | Reviewer-Status |
|---|---|---|---|---|
| [`plan-01-erechnung-vobb-kern.md`](file:///F:/server/Rechnungsprogramm_Geb_V2/plans/plan-01-erechnung-vobb-kern.md) | **E-Rechnung (XRechnung/ZUGFeRD) & VOB/B Kern** | `js/einvoice.js`, `js/editor.js`, `views/InvoiceView.js`, `controllers/InvoiceController.js`, `main.js` | B-1, B-3, B-14, B-4, B-5, B-9, H-1, H-2 | ✅ Freigabe m. Auflagen (Steuerbasis/BT-113, DB-Schema-Checks) |
| [`plan-02-electron-gobd-sqlite.md`](file:///F:/server/Rechnungsprogramm_Geb_V2/plans/plan-02-electron-gobd-sqlite.md) | **Electron-Security, GoBD-Unveränderbarkeit & SQLite** | `main.js`, `preload.js`, `db.js`, `schema.js`, `main/audit.js`, `main/backup.js` | SEC-1 bis SEC-4, GOBD-1 bis GOBD-4, DB-1 bis DB-4 | ✅ Freigabe m. Auflagen (Trigger-Reihenfolge bei Belegspeicherung) |
| [`plan-03-aufmass-nachtrag.md`](file:///F:/server/Rechnungsprogramm_Geb_V2/plans/plan-03-aufmass-nachtrag.md) | **Aufmaßwesen (REB 23.003, DA11, GAEB X31) & Nachträge** | `js/da11.js`, `js/gaeb-x31.js`, `js/projekte.js`, `controllers/AufmassController.js`, `db.js` | BUG-01 bis BUG-09, B-7, B-10, B-11 | ✅ Freigabe m. Auflagen (Spaltenname `rechnungsart` vs. `typ`) |
| [`plan-04-banking-datev-sepa.md`](file:///F:/server/Rechnungsprogramm_Geb_V2/plans/plan-04-banking-datev-sepa.md) | **Banking, OPOS, SEPA (pain.008) & DATEV EXTF 700** | `js/datev.js`, `controllers/BankingController.js`, `controllers/SepaController.js`, `InvoiceController.js` | DAT-1 bis DAT-3, OPOS-1, SAL-1 (B-8), SEP-1, SEP-2, BNK-1, MAIL-1 | ✅ Freigabe m. Auflagen (SEPA `<PstlAdr>` Tag-Reihenfolge) |
| [`plan-05-sync-pwa-frontend.md`](file:///F:/server/Rechnungsprogramm_Geb_V2/plans/plan-05-sync-pwa-frontend.md) | **Local-First Sync, PWA Offline-Architektur & Frontend** | `main/sync-server.js`, `pwa/**`, `js/navigation.js`, `controllers/ZeiterfassungController.js` | SYNC-1 bis SYNC-5, NAV-1, NAV-2, MOCK-1, COMP-1, COMP-2, SEC-5 | ✅ Freigabe m. Auflagen (Magic-Bytes VP8-Chunks, HLC Clock-Drift) |

---

## 🛠️ Implementierungs-Fahrplan

Die Umsetzung erfolgt strikt in 5 Schritten gemäß den Reviewer-Auflagen:
1. **Schritt 1:** Datenbank- und Security-Fundament ([`plan-02`](file:///F:/server/Rechnungsprogramm_Geb_V2/plans/plan-02-electron-gobd-sqlite.md)) — `busy_timeout`, GoBD-Hardening, Indizes.
2. **Schritt 2:** E-Rechnungs- und Rechenwahrheit ([`plan-01`](file:///F:/server/Rechnungsprogramm_Geb_V2/plans/plan-01-erechnung-vobb-kern.md)) — CIUS URN, Netto-/Brutto-Steuerbasis, Single-Source-of-Truth Export.
3. **Schritt 3:** REB 23.003 DA11 & Nachtrags-Persistenz ([`plan-03`](file:///F:/server/Rechnungsprogramm_Geb_V2/plans/plan-03-aufmass-nachtrag.md)) — Satzart 11/00/99, echte Transaktionen.
4. **Schritt 4:** DATEV EXTF 700 & Zahlungsverkehr ([`plan-04`](file:///F:/server/Rechnungsprogramm_Geb_V2/plans/plan-04-banking-datev-sepa.md)) — Brutto-Erlöskonten, OPOS-Regex, ISO 20022 `<PstlAdr>`.
5. **Schritt 5:** Sync-Sicherheit & Frontend-Fokus ([`plan-05`](file:///F:/server/Rechnungsprogramm_Geb_V2/plans/plan-05-sync-pwa-frontend.md)) — Foto-Magic-Bytes, Fokusmodus-UI, Zeiterfassungs-Soft-Delete.
