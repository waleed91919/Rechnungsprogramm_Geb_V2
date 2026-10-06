# D — Tests, Reproduktion und Belegqualität (W-Link)

## 0. Snapshot-Kopf (fix, nicht gewechselt)

- Pfad: `C:\Users\walee\Desktop\server\Rechnungsprogramm_Geb_V2`
- Branch: `main` | HEAD: `791fb77f6e2fc50c355569b15cde8493bb6da0de` (2026-10-04)
- `git status --short`: nur untracked `analyse_2026-10-04/`, `plans/testen_das_app.txt`
  (+ zur Laufzeit erschienener Ordner `analyse_2026-10-04_run2/`); keine modifizierten Produktdateien, keine Commits.
- OS: Windows (win32) | System-Node: `v25.1.0` (NODE_MODULE_VERSION 141, `process.versions.modules`)
- Electron: `32.3.3` (package.json), Binary meldet interne Node-Runtime `v20.18.1`
- `better-sqlite3`: `12.6.2`, gebaut gegen NODE_MODULE_VERSION **128** (= Electron-ABI, nicht System-Node-ABI).
- App-Verfügbarkeit: Source + `dist/win-unpacked/W-Link ERP.exe` (186.328.576 Bytes, 02.10.2026) vorhanden.
- Regeln eingehalten: Produktcode read-only, keine Schema-/Dependency-Änderung, keine Commits,
  keine `database.sqlite` angefasst (0 von 72 Testdateien referenzieren `database.sqlite` — per Scan belegt),
  nur `:memory:` / `mkdtemp`, nur fiktive Daten (TEST-KUNDE-01 etc.).
- ABI-Falle: `better-sqlite3` lädt unter System-Node NICHT (`ERR_DLOPEN_FAILED`, kompiliert für
  MODULE_VERSION 128, System-Node verlangt 141). Als **Umgebungs-, nicht Produktfehler** gekennzeichnet (Beleg: §2, Zeile ABI-FAIL-OK).

## 1. Inventur `tests/*.test.js`

- Count: **72 Dateien** (`Get-ChildItem tests/*.test.js`), Stand 2026-10-04.
- `describe(`: **40** (strikt + lose identisch). `it(`/`test(`: **742** lose Zählung
  (`/it\(|test\(/g` über alle Dateien) bzw. **542** strikt zeilenverankert (`/^\s*(?:it|test)\s*\(/`).
  Vorgängerbericht nannte 684 (andere Regex) — als Hypothese korrigiert, Methode offengelegt.
- Nicht-`.test.js`-Helfer (werden von `npm test` NICHT ausgeführt): `tests/test_electron_helper.js` (17 Zeilen),
  `tests/test_electron_runner.js` (**965 Zeilen**, eigene Zählung 2026-10-04 — Vorgängerbericht: 964),
  `tests/test_pdf_flow.js`, `tests/validate_xsd.py`, `tests/verify_packaged_draft_view.js`,
  `tests/verify_real_package_compliance.js`, Root-`verify_packaged.js`, `tests/fixtures/` (2 Einträge), `tests/schemas/` (2 Dateien).

| Kategorie | Count (/72) | Definition | Beispiele |
|---|---|---|---|
| pure-Unit (kein `better-sqlite3`) | 42 | läuft unter System-Node | `arbeitstage_datum`, `aufmass_calculation`, `b2b_default_interest`, `banking_parser`, `controlling_soll_ist`, `project_calculations`, `zugferd`, `efb222_calculation`, `editor-calculation`, `datev_export`, `da11_export`, `gaeb_validation`, `gaeb-x31` |
| DB-Integration (`better-sqlite3`/`Database(`) | 30 | braucht Electron-ABI | `data_integrity`, `backup`, `angebot_lifecycle`, `dauerrechnung_*` (3), `gaeb_x83_persistence`, `gaeb_x84_export`, `gaeb_tender_pricing`, `gobd_protection`, `opos_matching`, `sepa_*` (2), `phase2–5`, `sync_*` (4), `verify_schema_identity`, `legacy_migration_replay`, `objekt_*` (2), `reinigungslv_crud/schema`, `smtp_email`, `zeiterfassung_milog`, `angebot_ui_workflow` |
| ELECTRON_RUN_AS_NODE-Pattern in Datei | 25 | spawnt Electron-Binary selbst (`execFileSync` + `ELECTRON_RUN_AS_NODE=1`, Timeout 120s) | `backup.test.js:29-46`, `data_integrity.test.js:53`, `gobd_protection`, `opos_matching`, `sepa_pain008`, `smtp_email`, alle `phase*`/`dauerrechnung*` |
| jsdom (statt Chromium) | 6 | DOM-Simulation, kein echter Renderer | `artikel_ui.test.js:3`, `save_rechnung_flow.test.js:3`, `modal_modularization.test.js:5`, `end_to_end_generate.test.js:7`, `gaeb_x83_import_audit.test.js:14`, `gaeb_tender_view_regression.test.js:29` |
| Mock/Stub/Spy/Fake | 13 (per Regex-Treffer) | siehe Mock-Tabelle §3 | `smtp_email` (fakeTransport), `zugferd` (Platzhalter-Fallback Z12), `artikel_ui`/`save_rechnung_flow` (gemockte Controller) |

### Was NICHT läuft / nicht gelaufen ist (Status E)

| Artefakt | Umfang | Grund |
|---|---|---|
| `tests/test_electron_runner.js` | 965 Zeilen echte UI-E2E | braucht sichtbare UI + Aufsicht, in dieser Session nicht gestartet |
| `verify_packaged.js` (Root) | Paket-Compliance | kein Installations-/Paketlauf in dieser Session |
| `tests/verify_packaged_draft_view.js`, `tests/verify_real_package_compliance.js` | Paket-Draft/Compliance | keine `.test.js`-Registrierung, kein Lauf |
| Voll-`npm test` (alle 72) | `node --test tests/*.test.js` | scheitert unter System-Node an ABI für alle 30 DB-Dateien; kein Voll-Run erzwungen |
| `tests/test_pdf_flow.js`, `tests/validate_xsd.py` | manuelle Helfer | kein Runner-Anschluss |

## 2. Befehls-Protokoll (exakte Befehle, nur eigene Läufe dieser Session = Status A)

Arbeitsverzeichnis aller Befehle: `C:\Users\walee\Desktop\server\Rechnungsprogramm_Geb_V2`. Keine sichtbare UI erzwungen.

| # | Exakter Befehl | Umgebung | Ergebnis 2026-10-04 | Status |
|---|---|---|---|---|
| 1 | `node --test tests/arbeitstage_datum.test.js tests/aufmass_calculation.test.js tests/editor-calculation.test.js` | System-Node v25.1.0 | **8/8 pass** (Datum/Feiertag/Arbeitstag, Formel-AST, REB-23.003-Katalog, laufende Nummer) | A |
| 2 | `node --test tests/b2b_default_interest.test.js tests/efb222_calculation.test.js tests/controlling_soll_ist.test.js tests/project_calculations.test.js` | System-Node v25.1.0 | **19/19 pass** (B2B-Zins/40-€-Pauschale, EFB-222-Umlage, Controlling-KPIs, calculateProjektUmsatz inkl. kumulativ) | A |
| 3 | `node --test tests/zugferd.test.js` | System-Node v25.1.0 | **19/19 pass** (Z1–Z19: Builder, XMP, OutputIntent, Roundtrip, Profile, CII BG-23/BT-10/§13b, Mapping, Gate, Skonto, Leitweg, Brutto-Modus) | A |
| 4 | `node --test tests/smtp_email.test.js` | System-Node (+ spawnt inner Electron) | **5/5 pass**, aber mit `fakeTransportFactory` (Mock, siehe §3) | A mit Mock-Vorbehalt |
| 5 | `$env:ELECTRON_RUN_AS_NODE=1; & "...\node_modules\electron\dist\electron.exe" "...\tests\verify_schema_identity.test.js"` | Electron-as-Node, `:memory:` | **1/1 pass** — `Snapshot: 76 Tables, 115 Indexes, 12 Triggers` | A |
| 6 | `$env:ELECTRON_RUN_AS_NODE=1; & "...\electron.exe" "...\tests\backup.test.js"` | Electron, `mkdtemp` | **3/3 pass** (`BACKUP_TESTS_PASSED`: Snapshot+gzip+SHA-256, Verify, GFS+Restore) | A |
| 7 | `$env:ELECTRON_RUN_AS_NODE=1; & "...\electron.exe" "...\tests\data_integrity.test.js"` | Electron, Temp-DB (isoliert) | **34/38 pass, 4 fail** = 2 echte Defekte × (Parent+Subtest): (f1) Subunternehmer-15%-Einbehalt `TypeError: Cannot read properties of undefined (reading 'sec48b_geprueft')` (`data_integrity.test.js:441-454`); (j) Soft-Delete-Filter `Aktiver Artikel muss im State geladen werden` (`:576-591`) | A (negativ — echte Produktfehler, kein Flake) |
| 8 | `node -e "require('better-sqlite3')"` (Probe) | System-Node v25.1.0 | **erwarteter Fail**: kompiliert für NODE_MODULE_VERSION 128, System verlangt 141 → Umgebungsfehler, kein Produktfehler | B (Umgebungsbeleg) |
| 9 | FK-/Masterzählung via Electron (`fkcount_d.js` in eigenem Temp-Dir, `:memory:`) | Electron-as-Node | 76 Tabellen / 140 Indizes inkl. Autoindex / 12 Trigger / 104 `REFERENCES` | A (Hypothese geprüft, siehe §4) |

Nicht erneut gelaufen in dieser Session (kein A beansprucht): `legacy_migration_replay` (Alt-A: 1/1),
`sepa/gaeb/da11/datev`-Block (Alt-A: 58/58), EFB-Anteil der 32er-Gruppe, `test_electron_runner`, `verify_packaged*`, Voll-`npm test`.

## 3. Mock-Tabelle (was sie NICHT beweisen)

| Mock / Simulation | Fundstelle | Was sie ersetzt | Was sie NICHT beweist |
|---|---|---|---|
| `fakeTransportFactory` (250 OK) + `fakeCryptoAdapter` | `tests/smtp_email.test.js:130-163,453` | echter SMTP-Versand | Zustellung, Auth gegen Real-Server, TLS-Handshake, Bounce-Handling |
| ZUGFeRD-Fallback Platzhalter-Seite (Z12) | `tests/zugferd.test.js:413` (`Z12: Ungültiger basePdfBuffer … Platzhalter`) | echte Sichtseite | WYSIWYG-Betragsabgleich Sichtseite↔XML (bewusst nur Roundtrip Z4/Z11 geprüft) |
| `generateQrCode→mockQr`, `saveDocument→{success:true}`-Stubs | `save_rechnung_flow`, `artikel_ui` (jsdom-Kontext) | echte Persistenz/PDF | Speicherung, Validierung, PDF-Inhalt |
| jsdom statt Chromium/Electron-Renderer | 6 Dateien (s. §1) | echter Renderer/Druck | Layout, Paginierung, PDF-Rendering |
| Sync-Harness lokal / `safeAlert`-Spione | `phase3_*`, `sync_*` | Netz/TLS-Loopback, echte PWA | Mehrgeräte-Sync, Konfliktverhalten unter Last |
| `ELECTRON_RUN_AS_NODE`-Selbstspawn | 25 Dateien | installierte App / `userData`-Pfad | Installer-, Update-, Produktiv-Backup-Rotation |

## 4. Schema-Identität, data_integrity-Fails, Backup-Restore (isoliert)

- **Schema-Identität (§2 #5, #9):** `:memory:`-Init via `createSchema` + `ensureGoBDSchemaAndTriggers` +
  `runMigrations` + `seedDefaultData` ergibt **76 Tabellen / 115 Indizes / 12 Trigger** (Test-Log 2026-10-04).
  Eigene Direktzählung: 140 `type='index'`-Zeilen — Differenz = 25 `sqlite_autoindex_*` (vom Test per
  `name NOT LIKE 'sqlite_%'` ausgeschlossen). Hypothese „~76/115/12“ damit **bestätigt (mit Methodennuance)**.
  `REFERENCES`-Vorkommen: **104** (passt zu berichteten 104 FKs). Status A.
  Hinweis: `verify_schema_identity.test.js:8-9` vergleicht aktuell `../schema.js` mit sich selbst
  (OLD=NEW) — Identitätsaussage gilt daher nur für Determinismus, nicht für Migrationstreue; echte Alt-DB-Migration
  bleibt extern zu prüfen (`legacy_migration_replay` lief hier nicht erneut).
- **data_integrity-Fails (§2 #7):** 2 echte Defekte, kein Umgebungsartefakt:
  (a) Subunternehmer-Einbehalt (f1) — Lesezugriff auf undefinierte Abfragezeile, Einbehaltlogik für Sub ohne
  Freistellung nicht nachweisbar; (b) Soft-Delete-Filter (j) — `getFullState()` lädt aktiven Artikel nicht /
  Filter unvollständig. Einordnung: **lieferblockierend für Bauabzugsteuer-Szenarien**, Rest (UNIQUE, Doppelverrechnung,
  Storno-Atomarität, Cent-Rounding, FK, Migrations-Dedup) 34/38 grün.
- **Backup-Restore (§2 #6):** nur isoliert (`fs.mkdtempSync(os.tmpdir(), 'wlink-backup-test-…')`,
  `backup.test.js:56-57`, fiktive Kunden `Musterbau GmbH`/`Handwerk Partner AG`): Snapshot + gzip + SHA-256,
  Verify, GFS + Disaster-Recovery-Restore — 3/3. Beweist NICHT: Produktiv-Rotation, Offsite, `userData/backups`-Pfad,
  Installer-Kontext.

## 5. Erwartungsrechnung Kap. 8 (unabhängig nachgerechnet, USt 19 %, `Math.round(x*100)/100`)

Fiktiv: TEST-KUNDE-01, TEST-BAU-01, P1 10×100, P2 5×200, P3 1×500, N1 2×150, L1 = 50 % (P1+P2) + 100 % N1,
L2 kumuliert = A+N1, F2 = L2−L1, Teilzahlung 1500 auf F1.

| Größe | Netto | USt 19 % | Brutto | Kontrolle |
|---|---|---|---|---|
| Angebot A (P1+P2+P3) | 2500,00 | 475,00 | 2975,00 | ✅ Vorgabe |
| Nachtrag N1 | 300,00 | 57,00 | 357,00 | ✅ Vorgabe |
| Leistung L1 | 1300,00 | 247,00 | 1547,00 | ✅ F1 |
| Leistung kumuliert L2 | 2800,00 | 532,00 | 3332,00 | ✅ Vorgabe |
| Abschlag F1 (= L1) | 1300,00 | 247,00 | 1547,00 | Rest nach 1500 Zahlung: **47,00** ✅ |
| Abschlag F2 (= L2−L1) | 1500,00 | 285,00 | 1785,00 | ✅ Vorgabe |
| Doppelberechnung | F1+F2 = 2800,00 = L2 ✅ | — | F1+F2 = 3332,00 = L2 brutto ✅ | Probe bestanden |
| Schluss (= L2−F1−F2) | 0,00 | 0,00 | 0,00 ✅ | ohne Einbehalt |
| +5 %-Einbehalt-Szenario (separat) | 140,00 (5 % von L2 netto) | — | Restforderung +140 ggü. Standard | nur Zusatzszenario, kein Standard |

### Restprüfungen (Definitionen, nicht in dieser Session ausgeführt)

- **Doppelberechnungs-Probe:** `SUM(F1_netto + F2_netto) = L2_netto` UND `SUM(brutto) = L2_brutto`; zusätzlich
  positionsweise OZ-Summen gegen Aufmaß-Summe (`SUM(ergebnis×vorzeichen) GROUP BY oz_code`).
- **Doppel-Schluss-Probe:** zweite SCHLUSSRECHNUNG auf denselben Vorgänger anlegen → muss per
  `rechnung_verrechnungen`-Guard/UNIQUE scheitern (heute kein Pflicht-Check — offene Lücke, vgl. Bericht C).
- **PDF-vs-XML-Abgleich:** (1) XML-Byte-Roundtrip aus PDF extrahieren = generiertes XML (Z4-Muster);
  (2) jede Sichtseiten-Betragszeile (netto/USt/brutto, BT-131/134/112) = XML-BT-Werte;
  (3) `AFRelationship=Alternative`, XMP `pdfaid:part=3`, Dateiname `zugferd-invoice.xml`/`factur-x.xml`;
  (4) extern: VeraPDF (PDF/A-3) + Mustang (XML/Schematron) — W-Link-Tests decken nur (1)+(3) als Container ab.
- **Isoliertes Backup-Restore-Protokoll:** `mkdtemp` → Schema+Seed → Snapshot (gzip+SHA-256 notieren) →
  Dokument einfügen → Verify → Restore in leeres Dir → `SELECT`-Gegenprobe (Kunden-/Dokumenten-Count, Hash-Vergleich)
  → Temp-Dir verwerfen. Produktiv-`database.sqlite` nie berühren.

## 6. Internet-Pflicht: Norm-/Tool-Quellen (Zugriff 2026-10-04, nichts erfunden)

| # | Quelle | URL (Zugriff 2026-10-04) | Befund | W-Link-Abdeckung vs. extern |
|---|---|---|---|---|
| 1 | VeraPDF (PDF/A-Validator, PREFORMA/EU) | https://verapdf.org/home/ | validiert alle PDF/A-Teile/Level; ZUGFeRD-Thread bestätigt PDF/A-3-Checks + Plugin-Rahmen | W-Link: nur Container (`Alternative`, `pdfaid:part=3`, Z1–Z3) — **externer VeraPDF-Lauf fehlt** |
| 2 | Mustangproject (ZUGFeRD/Factur-X-Referenz, APL2) | https://www.mustangproject.org/ (Fetch 2026-10-04: v2.26.0 v. 25.08.2026, ZUGFeRD 2.5.2/Factur-X 1.09.2, XRechnung 3.0.2; Validator bettet VeraPDF + ph-Schematron ein) | CLI `validate` + XRechnung-Notices (BR-DE-15 u. a.) | W-Link: interne Struktur-Tests Z1–Z19 — **externer Mustang-Lauf fehlt** |
| 3 | KoSIT validator-configuration-xrechnung (Schematron/XSD-Bundle) | https://github.com/itplr-kosit/validator-configuration-xrechnung (Fetch 2026-10-04: EN16931-Schematron + CIUS-XRechnung-Schematron + UBL-2.1-/CII-16B-XSD; Release `v2026-01-31` für XRechnung 3.0.x) | verbindliches deutsches CIUS-Prüfregelwerk | W-Link generiert `XRechnung 3.0` (`js/einvoice.js:6`) — **KoSIT-Validator-Lauf fehlt** |
| 4a | GAEB DA XML 3.2 (2013-10) / 3.3 (2021-05 + 2023-01), Beta 3.4 (2026-03) | https://www.gaeb.de/de/service/downloads/gaeb-datenaustausch/ (Fetch 2026-10-04) | XSD-Pakete je Austauschphase; Checker prüft nur Schema, keine Fachregeln; X31-Base64 neu in 3.3/2023-01 | W-Link: lokale XSDs in `tests/schemas/`, X83/X84-Tests — **Abgleich gegen GAEB-XML-Checker + aktuelle 3.3-Pakete fehlt** |
| 4b | DATEV Developer Portal (DATEV-Format/EXTF, Buchungsstapel) | https://developer.datev.de/de/file-format/details/datev-format/ (Suche 2026-10-04: EXTF_…CSV, Header + Nutzdaten, Mindest-Hauptversion 700 / Buchungsstapel 12 / Debitor/Kreditor 5; Portal JS-lastig — Detailfelder nur via Doku/Validierungsprogramm) | Pflicht-Header, Trennzeichen, Validierung erst in DATEV-App vollständig | W-Link: `EXTF 700 v13` per `js/datev.js`, `datev_export`-Tests — **Import-Gegenprobe in DATEV + Steuerberater-Klärung (`steuer_7/19`, `Festschreibung=0`) fehlt** |

## 7. Summary (≤ 30 Zeilen)

- Eigene Läufe (A): pure-Unit 8/8 + 19/19; zugferd 19/19; smtp 5/5 (Mock); schema-Identität 1/1 (76/115/12);
  backup 3/3 (mkdtemp); data_integrity 34/38 mit 4 Fails = 2 echte Defekte (Sub-Einbehalt f1, Soft-Delete j).
- Erwartungsrechnung Kap. 8 maschinell bestätigt (A 2500/2975, L1 1300/1547, L2 2800/3332, F2 1500/1785,
  Rest F1 47, Schluss 0, +5 %-Szenario 140 netto separat); F1+F2=L2-Probe bestanden.
- Index-Nuance geklärt: 140 inkl. 25 sqlite_autoindex = 115 Nutzer-Indizes; 104 REFERENCES; 0 Testdateien
  referenzieren prod-`database.sqlite`.
- ABI-Falle belegt (128 vs. 141): Umgebung, nicht Produkt; alle DB-Läufe liefen via ELECTRON_RUN_AS_NODE.
- Mocks offengelegt: fakeTransport, Platzhalter-Seite Z12, jsdom, Stub-Controller — beweisen keinen
  Real-Versand, keinen Sichtseiten-Abgleich, kein Rendering, keinen Netz-Sync.
- Nicht gelaufen (E): test_electron_runner (965 Zeilen), verify_packaged*, Voll-npm-test, Real-PDF-Druck.
- Extern validiert (2026-10-04): VeraPDF, Mustang 2.26.0, KoSIT-XRechnung-Config (v2026-01-31),
  GAEB-XSDs 3.2/3.3 (+Beta 3.4), DATEV-EXTF-Doku — W-Link deckt nur Container/Struktur ab,
  externe VeraPDF-/Mustang-/KoSIT-/DATEV-/GAEB-Checker-Läufe bleiben offene Restprüfungen.
