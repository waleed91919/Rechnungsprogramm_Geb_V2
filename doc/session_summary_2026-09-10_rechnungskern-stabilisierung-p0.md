# Session Summary: W-Link Bau Rechnungskern-Stabilisierung — Phase P0

**Projekt:** W-Link ERP (`Rechnungsprogramm_Geb_V2`)
**Datum:** 10. September 2026
**HEAD:** `31136c2` (Merge fix/sync-security-hardening)
**Plan:** `plans/w-link-bau-rechnungskern-stabilisierung-plan.md` — nur Phase P0, Reihenfolge P0.2 → P0.3 → P0.4 → P0.5 → P0.6, P0.1 nur Verifikation
**Status:** P0-Code umgesetzt, 19 neue Tests grün; Gesamt-Suite: 284/304 grün unter System-Node, Rest + 4 Sync-Tests sind vorbestehende Env-Fehler (Nachweis unten). Kein Commit/Push (nur Arbeitsverzeichnis).

---

## 1. P0.2 Einbehalt-Rechenwahrheit (ERSTE Baustelle) — umgesetzt, grün

**Problem (Plan §0.5):** Zwei Einbehalt-Implementierungen; das Formular nutzte die falsche (nicht-kumulative). `InvoiceController.calculateTotals` rechnete den Einbehalt auf das volle aktuelle Netto neu, ohne `previousRetention`-Verrechnung.

**Geändert:**
- [`controllers/InvoiceController.js`](../controllers/InvoiceController.js): `calculateTotals()` akzeptiert neu `previousRetentionTotal`, `previousInvoices`, `totalPerformanceNet`. Die interne `calcRetention()` rechnet jetzt kumulativ — `Ziel-Einbehalt(kumulierte Leistung) − bereits einbehalten` (gleiche Formel wie `CumulativeBillingController`, inkl. `EXECUTION`-Deckel auf `contractTotalNet` und VOB/A-§9c-Hinweis, genau einmal). Neu: `sumPreviousRetention()` (einzige Summierungsstelle neben dem Kumulativ-Controller) und `computeProjectBalance()` (OPOS-Trennung Leistung/Faktura/Zahlung/Einbehalt; `offenerSaldo = Σ Zahlbeträge − Σ Zahlungen − freigegebene Einbehalte`). Ergebnis enthält `previousRetentionTotal`.
- [`views/InvoiceView.js`](../views/InvoiceView.js) (`handleInputEvent`, `:258`): reicht `cumulativeOpts` (`previousInvoices`, `previousRetentionTotal`, `totalPerformanceNet`, …) an den Controller durch.
- [`js/editor.js`](../js/editor.js) (`calculateRechnungTotals`, `:1491ff`): lädt Vorgänger-Einbehalte desselben Projekts aus **gespeicherten** Belegen (`state.rechnungen`/`state.dokumente`, ohne aktuellen Beleg) und übergibt sie — nie aus Formular-State geraten.
- Neu [`tests/cumulative_retention_chain.test.js`](../tests/cumulative_retention_chain.test.js): Abnahmetabelle (Auftrag 1.000 €, 19 %, 5 %, EXECUTION): AR1 Einbehalt 5/Zahlbetrag 114; AR2 Perioden-Einbehalt 5 (kumuliert 10, Bug-Wert 15 assertet abwesend); Nachtrag +100 → Periode 5/kumuliert 15; `CumulativeBillingController`-Parität; OPOS-Nullabgleich; §13-Steuer trotz Einbehalt; EXECUTION-Deckel.
- **Abweichung vom Plan dokumentiert:** Der Plan nennt für AR2 Zahlbetrag 109 €; korrekt gerechnet (Perioden-Brutto 119 − Perioden-Einbehalt 5) sind es 114 € (Summe 228 bei kumuliert 10 Einbehalt). 109 ergäbe sich nur durch Abzug des *kumulativen* Ziels (Doppelzählung des Vorgänger-Einbehalts — genau der alte Bug). Test assertet daher 114/114 + Σ Einbehalte == 10.

**Abnahme:** grün (4/4 neu + `invoice_controller` + `retention_vob_rules` bestehen).

## 2. P0.3 Übergaben reparieren (ZWEITE Baustelle) — umgesetzt, grün

**Problem (Plan §0.4):** Erfolgs-Toast ohne Speichern; keine Reload-Festigkeit; keine Sperrprüfung.

**Geändert:**
- [`js/projekte.js`](../js/projekte.js) (`executeAufmassUebergabe`, `:1261ff`): `UPDATE_EXISTING` lädt den Zielbeleg aus der DB, blockiert gesperrte/stornierte/festgeschriebene Belege (`DOC_LOCKED`, kein Toast-Erfolg), schreibt Herkunftsbezüge je Position (`aufmass_blatt_id`, `oz_code`, `aufmass_menge`, `aufmass_quelle`, `aufmass_zeitstempel`), persistiert via `window.api.saveDocument`, verifiziert per Reload-Read (`getFullState`) und meldet erst dann Erfolg inkl. Diff. `CREATE_NEW` erzeugt und speichert einen echten Beleg-Entwurf mit denselben Herkunftsbezügen statt nur Toast.
- [`js/projekte.js`](../js/projekte.js) (`applyApprovedNachtraegeToCurrentInvoice`, `:1305ff`): übernimmt genehmigte Nachträge in `state.currentRechnungPositionen` (mit `nachtrag_id`-Referenz), idempotent je `nachtrag_id` (keine Doppel-Übernahme), danach Totals-Neuberechnung + Speichern (`saveRechnung`, wenn ID vorhanden).
- Neu [`tests/uebergaben_persistenz.test.js`](../tests/uebergaben_persistenz.test.js): Toast-nur-nach-Persistenz-Check, Sperrprüfung, Herkunftsfelder, Idempotenz (4/4 grün).
- Main-/DB-Sperrguard bestand bereits (`db.js` `saveDocument` lehnt Inhaltsänderungen gesperrter Belege ab; Renderer-Prüfung ist Zusatz, kein Ersatz).

**Abnahme:** grün. Echter App-Neustart-Reload bleibt Teil des P0.5-E2E (manuell, siehe Checkliste).

## 3. P0.4 Belegfixierter Export + XRechnung 3.0 (DRITTE Baustelle) — umgesetzt, grün

**Problem (Plan §0.6):** Export aus ungespeichertem Formular-State + Profil 2.3 + `entityId: 0`-Protokollierung.

**Geändert:**
- [`js/einvoice.js`](../js/einvoice.js): neu `GUIDELINE_XRECHNUNG_30` (`…xrechnung_3.0`, KoSIT-Bundle 3.0.2); Profilinfo + `generateXRechnungXML` nutzen 3.0 (2.3-Konstante nur als Alias behalten). Neu `assertExportfaehigerBeleg()` — wirft mit Feldbezug (`Beleg-ID`, `Status`) bei Entwurf; nur gespeicherte + festgeschriebene Belege sind versandfähig.
- [`js/editor.js`](../js/editor.js) (`collectERechnungExportData`, `:951ff`): Pflicht-`belegId` (aus `#rechnung-id`), throw ohne ID; ungesperrte Entwürfe blockiert (außer `allowDraft`-Vorschau, die keine Datei erzeugt). Beide Export-Handler fangen das Gate ab und zeigen die Blockier-Meldung statt zu exportieren.
- [`main.js`](../main.js) (`invoice:exportZugferdPdf` `:1050ff`, `invoice:exportXRechnungXml` `:1145ff`): verweigern `entityId: 0`/fehlende ID und ungesperrte Entwürfe mit Feldbezug-Fehlermeldung — kein File, kein stiller Export.
- [`tests/bau_erp.test.js`](../tests/bau_erp.test.js) (`:141,150`), [`tests/zugferd.test.js`](../tests/zugferd.test.js) (`:170,174`): Assertions auf 3.0 gehoben. Neu [`tests/erechnung_belegfixierung.test.js`](../tests/erechnung_belegfixierung.test.js) (5/5 grün).

**Abnahme:** grün. **Offen:** externer KoSIT-Validator (Bundle 3.0.2) + veraPDF-Lauf mit Fixture-Archiv pro Release — in [`doc/release/checklist.md`](release/checklist.md) als Pflichtschritt verankert, aber hier nicht ausgeführt (kein Validator im Repo).

## 4. P0.5 Release / Backup / E2E-Desktop — Checkliste + Nachweis, teils offen

- Neu [`doc/release/checklist.md`](release/checklist.md): unterschreibbare Release-Checkliste (npm-test-Gate, Windows-Frisch-/Update-Test, Backup/Restore-Satzvergleich, Migrationsabbruch, KoSIT-/veraPDF-Archiv, E2E-Happy-Path mit Neustart + OPOS-Nullabgleich, Sync-Smoke).
- `tests/backup.test.js` grün (via Electron-Runtime im Gesamtsuite-Lauf enthalten).
- **Offen (manuell, Windows-Build erforderlich):** Frisch-/Update-Installationstest, Backup-Restore-Satzvergleich am Echtprofil, E2E-Happy-Path gegen gebaute App, Windows-Smoke-Protokoll. Kein E2E-Runner im Repo — bis dahin manuelle Checkliste mit Protokollpflicht (wie im Plan vorgesehen).

## 5. P0.6 UI-Fokusmodus — umgesetzt, grün

- [`js/navigation.js`](../js/navigation.js): `CORE_VIEWS` (Dashboard, Kunden, Angebote, Projekte, Rechnungen, Banking/OPOS, Berichte, Einstellungen) vs. `EXPERIMENTAL_VIEWS` (Objekte, Dauerrechnungen, Putzplan, Mängel, Zeiterfassung, Großhandel, SOKA, Sync, Artikel) hinter `experimental_module`-Flag (Standard: aus). `applyFocusMode()` blendet nur aus (kein Löschen, kein State-Verlust beim Wechsel). Kern-Flow ohne Modul-Hopping möglich.
- Neu [`tests/ui_fokusmodus.test.js`](../tests/ui_fokusmodus.test.js) (3/3 grün).

## 6. P0.1 Sync-Verifikation (nur Nachweis) — 6 neue Negativtests, grün

- Fix in `main/sync-server.js:593` war in HEAD (unverändert gelassen — kein Ausbau).
- Neu [`tests/sync_p0_negativmatrix.test.js`](../tests/sync_p0_negativmatrix.test.js): (1) 401/403-Matrix alle Handler + SSE, (2) Token-Reuse → 403, (3) Fremd-Device-Write → 403 + DB unverändert (Vorher/Nachher-`total_changes`), (4) Traversal-Upload → abgewiesen, kein File, Upload-Root leer, (5) SSE-ohne-Auth → 401, (6) Unpair/Stopp-Revoke → 401, `sessions` leer. **6/6 grün** (Electron-as-Node-Runtime).

---

## Testprotokoll

- Neue Suites (System-Node): `cumulative_retention_chain` 4/4, `uebergaben_persistenz` 4/4, `erechnung_belegfixierung` 5/5, `ui_fokusmodus` 3/3 — alle grün.
- `cmd /c npm test` (System-Node v22.14.0): **284 pass / 20 fail von 304**. Alle 20 Fehler sind **vorbestehende Environment-Fehler**, keine Regression:
  - 19× `ERR_DLOPEN_FAILED`: `better-sqlite3` ist für die Electron-Runtime kompiliert (`NODE_MODULE_VERSION 128`), System-Node braucht 127 — betrifft alle DB/Sync-Suites inkl. meiner neuen `sync_p0_negativmatrix` (6).
  - 1× fehlendes `openssl`-Binary (`sync_server_security` TLS-Test).
- Gegenprobe: auf sauberem HEAD (`git stash`) scheitern exakt dieselben 4 `sync_server_security`-Tests unter Electron-Runtime (Symlink-Rechte/openssl auf Windows) — vorbestehend.
- Unter Electron-as-Node (`ELECTRON_RUN_AS_NODE=1`): `sync_p0_negativmatrix` **6/6 grün**; `sync_server_security` + `sync_client_security` + Negativmatrix: 32/36 (4 vorbestehende Env-Fehler s. o.).
- Betroffene Nicht-DB-Suites (`invoice_controller`, `retention_vob_rules`, `bau_erp`, `zugferd`, `backup`) vollständig grün.

## Bekannte Restrisiken + Next Steps (P1)

1. **Externer E-Rechnungs-Nachweis fehlt:** KoSIT-Validator (Bundle 3.0.2) + veraPDF pro Release ausführen und Berichte unter `doc/release/` archivieren (Checkliste Pkt. 4). BMF-Übergangsregeln nur als Doku-Hinweis, keine Compliance-Garantie.
2. **Manuelle Windows-Nachweise offen:** Installations-/Update-Test, Backup-Restore-Satzvergleich, E2E-Happy-Path mit Neustart, Sync-Smoke — Checkliste abarbeiten und unterschreiben.
3. **Bestandsbelege mit altem Einbehalt:** Korrektur nur per Storno/Freigabe-Beleg, nie per Edit (Release-Notes-Hinweis nötig).
4. **Zahlbetrag-Abweichung Plan vs. Implementierung (AR2: 109 vs. 114)** — oben begründet; bei Review bestätigen.
5. **P1 erst nach P0-DoD:** Pilot (1 Gewerk, 3 Betriebe) + max. 3 Hindernis-Fixes; geparkte `plans/`-Module bleiben geparkt (Stop-Regeln eingehalten: kein Frameworkwechsel, kein File-Share-Multiuser, keine P1/P2-Features eingebaut).

## Geänderte Dateien

`controllers/InvoiceController.js`, `views/InvoiceView.js`, `js/editor.js`, `js/projekte.js`, `js/einvoice.js`, `main.js`, `js/navigation.js`, `tests/bau_erp.test.js`, `tests/zugferd.test.js`; neu: `tests/cumulative_retention_chain.test.js`, `tests/uebergaben_persistenz.test.js`, `tests/erechnung_belegfixierung.test.js`, `tests/ui_fokusmodus.test.js`, `tests/sync_p0_negativmatrix.test.js`, `doc/release/checklist.md`, diese Summary (+ `doc/changelog.md`-Eintrag). Vorbestehend/ungeändert: `package-lock.json` (war schon dirty), Plan- und Grundlagendokument (untracked).
