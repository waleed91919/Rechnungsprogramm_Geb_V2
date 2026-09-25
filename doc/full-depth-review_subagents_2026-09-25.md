# Full Depth-Review mit Subagents — W-Link ERP (Rechnungsprogramm_Geb_V2)

**Datum:** 25.09.2026
**Umfang:** `main.js`, `preload.js`, `db.js` (5228 Zeilen), `schema.js` (2466), `js/` (22 Dateien), `controllers/` (22), `views/` (10), `models/` (2), `main/` (11), `pwa/` (3), `tests/` (59)
**Methode:** 5 parallele Subagents (Architektur, Qualität/UX/Performance, Compliance/E-Rechnung/GoBD/Banking, Gebäude-Module, Security/Regression). Nur gelesen, nichts geändert.

---

## 1. Architektur – Top Risiken

* `db.js:39-56,489ff`: God-Monolith + 2. IPC-Schicht. `getFullState():496-550` lädt alles und filtert in JS -> OOM bei 10k Belegen.
* `schema.js:1235`: keine `user_version`, nur `try/ALTER catch duplicate column`. `sync_conflicts:1791` nur in Migration, nicht in `createSchema` -> Fresh-DB crasht bei `db.js:4614`.
* IPC-Bruch: `views/GrosshandelView.js:393` ruft `window.api.getDokumente()` – existiert in `preload.js:1-227` nicht -> TypeError.
* Schicht-Sprünge: `db.js:45` braucht `js/gaeb-x31`, `main.js:351,1095` braucht `js/da11,einvoice`, `js/gobd.js:10` braucht `main/audit.js`. Renderer-Code läuft im Main.
* `package.json:30-51`: `database.sqlite*`, `uploads/`, `backups/` werden mit in `asar` gepackt.
* `main.js:182-1714` `setupIpc()`-Monolith, `focusWin:883` mitten in Handler-Registrierung, zwei Fehler-Konventionen (`throw` vs `{success:false}`).
* `main/sync-server.js:1304` zweiter Monolith, Raw-`prepare` statt Controller, Full-Table-Reads ohne Limit.
* `models/AufmassModel.js:90`, `models/InvoiceModel.js:70` werden nirgends required – tot.
* `db.js:24` `verbose:console.log` loggt jedes SQL inkl. Kundendaten.

## 2. Qualität / UX / Performance

P0 (kritisch):
* `js/dashboard.js:357`: `rech.nr.startsWith` ohne Null-Guard -> Crash ganze Tabelle. Fix: `!rech.nr || !rech.nr.startsWith(...)`.
* `js/dashboard.js:665-733`: bulk pdf/dunning nur `setTimeout`+Toast, kein echter Export.
* KPI-Drift: `dashboard.js:49` brutto vs `projekte.js:342` netto vs `berichte.js:143` beides -> 3 verschiedene Umsätze.
* XSS: `views/EFBView.js:58`, `KalkulationView.js:55`, `MaengelView.js:48` via `${err.message}` ohne sanitize.
* `js/editor.js:1718`, `init.js:6` `getFullState()` nach jedem Save -> Multi-MB IPC.

P1:
* God-Files Renderer: `js/projekte.js:2499`, `js/editor.js:2197`, `js/einstellungen.js:1934` (~45% von `js/`).
* Überlange Funktionen: `einstellungen.js:460` ~803 Zeilen, `dashboard.js:213` 263 Zeilen, `editor.js:1582` 185 Zeilen.
* Pagination nur bei Rechnungen (`dashboard.js:191`), Rest rendert alles. Paginierung ohne Ellipse (`dashboard.js:567`).
* Sequentielle `await` in Schleifen: `utils.js:348`, `dashboard.js:692`, `einstellungen.js:144` -> Batch-IPC nötig.
* Navigation inkonsistent: `navigation.js:147` vs `viewConfig:3`, Suche nur 6 Views, ESC kennt 3 Modals nicht.
* Kein Undo, hartes Löschen ohne Soft-Delete. Validierung nur am Submit.

Testlücken UI: Rechnung anlegen, Objekt anlegen, Dauer-Generierung, Dashboard-Filter/Pagination haben Backend-Tests, aber 0 jsdom-Tests.

## 3. Compliance / E-Rechnung / GoBD / Banking

* `js/einvoice.js:326`: nur Eigen-Validator, kein KoSIT-Schematron -> B2G-Reject. Norm: E-RechG, EN16931, XRechnung 3.0.2.
* `main/zugferd-builder.js:88`: PDF/A-3 nur via String-Marker getestet, kein VeraPDF. ISO 19005-3 Fail-Risiko.
* `js/einvoice.js:577`: Dummy `+49 000 / rechnung@example.com` wird echt exportiert -> Falschangabe §14 UStG.
* `js/einvoice.js:446`: `allowDraft:true` umgeht Belegfixierung.
* `main/audit.js:38-88` + `js/gobd.js:26-83`: Hash ohne `13b`, ohne `brutto`-Verrechnung, ohne Skonto/SEPA/Mandat -> Manipulation unerkannt. HOCH.
* Keine Verfahrensdoku, kein Z3-IdeA-Export (GoBD Rz 10-12, 135-178) -> Audit-Fail.
* `controllers/BankingController.js:133`: IBAN nur Regex, kein MOD-97 (vs `SepaController.js:20` korrekt).
* `BankingController.js:156`: CAMT nur Regex, kein XSD, PDNG/RVSL still verworfen.
* `BankingController.js:915`: OPOS-Auto-Match via `includes` Score 75 -> Fehlzuordnung.
* `SepaController.js:183`: `pain.008.001.02` noch angeboten, `001.09` fehlt.
* `BankingController.js:972`: Basiszins 1.52 hartkodiert -> veraltet ohne Pflege.
* `js/datev.js:101,159,182,263`: Festschreibung immer 0, Debitor-Kollision ab 8999, Encoding-Label falsch.
* `SokaBauController.js:47`: SOKA-Sätze/Mindestlöhne hartkodiert -> Zoll-Bußgeld bei Veraltung.
* `IDSConnectController.js:55`: Token in URL, SSRF-offen.

Fix-Reihenfolge: 1) Hash vervollständigen 2) KoSIT+VeraPDF 3) Dummy-Kontakt weg 4) IBAN-MOD97 5) Verfahrensdoku+Z3 6) SOKA-Pflege.

## 4. Gebäude-Module – Bugs / Validierung / Datenverlust

P0:
* `main/sync-server.js:832-864` `INSERT bautagebuch(uuid...)` – `schema.js:229-247` hat kein `uuid` -> jeder Push failt, endlos Retry.
* `sync-server.js:899-926` `INSERT aufmass_zeilen(uuid,formel_code...)` – `schema.js:182-194` kennt das nicht -> gleicher Effekt.
* `schema.js:906` `zeiterfassung` ohne `etage_id` – Etagenbezug geht still verloren (`ZeiterfassungController.js:441`).
* `db.js:2388`: Sammel `als_entwurf` invertiert -> unerwartet festgeschrieben (GoBD).
* `db.js:2636`: Storno zweiphasig, nicht atomar -> Crash = Storno da, Lauf bleibt ERSTELLT.

P1 Preis/VOB/Zeit:
* `DauerrechnungController.js:145`: Quartal/Jahr ignoriert Plan-Anker (15.02. quartalsweise falsch, JAHR nur bis 31.12.).
* `db.js:2132`: LV-Live-Preis übernimmt `mwst` falsch.
* `db.js:2391`: Sammel ein `leistungszeitraum`, Brutto pro-rata falsch (`brutto/len`).
* `ReinigungController.js:193`: `nettoJahr` vs `nettoMonat` inkonsistent.
* `VobCorrespondenceController.js:58`: Feiertage unvollständig -> 12-Tage-Frist falsch. B2C-Default (`schema.js:1356`) -> Belehrung feuert fast immer.
* `ZeiterfassungController.js:295`: ArbZG über Mitarbeitergrenzen, Geofence `valid:true` trotz `false`, Pause auto-abgezogen.
* `AufmassController.js:23`: `%`/`**` erlaubt, Infinity->0, m²+m³ addiert. `NachtragController.js:58`: keine negativen Mengen.
* Keine echten FKs (polymorph nur App-Guards `db.js:331`), `nrVal` bei Gebäude/Etage verworfen (`objekte.js:423`), Zuschläge summierbar >100% (`db.js:389`), inaktive Räume werden abgerechnet.

Sync-Rest: Pull nur projekte/liegenschaften/mitarbeiter/lv (`sync-server.js:1026`), kein Objektbaum, keine Retention `sync_processed_mutations`, HEIC -> 415.

## 5. Security / Regression

* `main.js:461`: EFB-PDF-Fenster ohne `sandbox:true` (Haupt `:29` ok).
* `main/email.js:168`: `klartext_erlaubt=true` speichert SMTP `PLAINTEXT::`.
* `main/backup.js:398`: Restore akzeptiert beliebigen Pfad -> File-Read.
* SQL: fast alles `?`-parametrisiert, 4 fragile Concat-Stellen (`db.js:453,908,2020`, `ZeiterfassungController.js:598`).
* `preload.js:1-228` sauber, 170 vs 171 Kanäle (nur `db:unlockDocument` absichtlich nicht exposed).
* `qr:generate:973` ohne Längenlimit, `email.js:91` ohne `%PDF`-Check.
* WAL: `mmap 30GB`, `NORMAL`, kein Checkpoint-Timer, DB im Repo-Root.
* `npm test` rot: 341 pass / 22 fail `ERR_DLOPEN_FAILED` – `better-sqlite3` für NODE 128, System-Node 25 braucht 141. Fix: `npm rebuild better-sqlite3`.

---

## 6. Workflow: entwickeln ohne andere Funktionen zu deaktivieren

0. Branch: nie auf `main`. `fix/<thema>` / `feat/<thema>`. Vor Start `git status` sauber.
1. Pre-Check 5 Min: `node scripts/audit_ipc_check.js` -> 0 Drift. Kanäle `preload <-> main <-> dbAPI` notieren. Schema nur via `runMigrations`, `backup:create PRE_MIGRATION` einplanen. GoBD-Touch? Storno statt Update.
2. Leitplanken: SQL nur `?`, neue `handle` + preload-expose + Validierung, DB+Audit in `db.transaction`, kein `fs.write` außer Dialog/`backupDir`, `shell.openExternal` nur via `buildLaunchUrl`-Muster, Fehler einheitlich (werfen ODER `{success}`).
3. Tests: Unit (pure Controller) + Integration (`:memory:`+`createSchema`, Muster `smtp_email.test.js`) + IPC-Vertrag (neue Channels). Erst betroffene Datei, dann voll `npm test` via Electron-Runtime. Timing/Port/OpenSSL 3x bei flaky.
4. Migrationen: additiv only, nie DROP/RENAME ohne PRE_MIGRATION+verify, danach `integrity_check + foreign_key_check + audit:verify`.
5. Smoke 10 Min vor Merge: Rechnung Entwurf->fest->Edit blockiert->Storno->ZUGFeRD+verify; Objekt Baum+Löschblock; Dauer Plan+Sammel+Doppel ablehnen; Banking Import-Dedup+Matching+SEPA+Lauf-Storno; Backup create->verify->Restore in Temp-DB.

Nächste sinnvolle Fixes: `dashboard.js:357` + `GrosshandelView.js:393` + `audit.js:73` Hash + Sync-`uuid` Mismatch.
