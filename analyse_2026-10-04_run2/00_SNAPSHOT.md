# 00 — Snapshot (fix, isoliert, 2026-10-04)

- Repo: `C:\Users\walee\Desktop\server\Rechnungsprogramm_Geb_V2`
- Branch: `main` (`git branch --show-current` = `main`)
- SHA: `791fb77f6e2fc50c355569b15cde8493bb6da0de` (`git rev-parse HEAD`, `git log --oneline -3`: `791fb77 fix(banking)`, `3a86ed9 Merge PR #28`, `f03df8d Merge PR #27`)
- Hinweis Drift: `analyse_2026-10-04/ABSCHLUSSBERICHT_AR.md` bezog sich auf `d940bd6c` — dieser Run liegt auf `791fb77f`. Alle Befunde unten wurden auf `791fb77f` gegengeprüft (Grep/Read/Läufe). Abweichungen sind als solche markiert, nicht still übernommen.
- Git-Status bei Start: nur untracked `analyse_2026-10-04/`, `plans/testen_das_app.txt`; danach zusätzlich `analyse_2026-10-04_run2/` (dieser Bericht). Keine modifizierten Produktdateien, keine Commits/Pushes/PRs/Merges.
- OS: `Microsoft Windows NT 10.0.19045.0` (`[Environment]::OSVersion`), win32, PowerShell 5.1
- Laufzeit: `node --version` = `v25.1.0` (System-Node, MODULE_VERSION 141); Electron `^32.3.3` (interne Node-Runtime `v20.18.1` laut Subagent D); `better-sqlite3 ^12.6.2` (gebaut gegen MODULE_VERSION 128 = Electron-ABI). ABI-Differenz 128≠141 ist Umgebungs-, kein Produktfehler — DB-Tests liefen via `ELECTRON_RUN_AS_NODE=1 electron.exe`.
- App-Verfügbarkeit: Quellcode + `dist/win-unpacked` vorhanden (`dist/win-unpacked/W-Link ERP.exe`, 186.328.576 Bytes, 02.10.2026). Kein Nachweis einer installierten `W-Link-Setup.exe`-Instanz in diesem Run.
- UI-Bedienung: Electron-UI wurde in diesem Run **nicht** live bedient (Subagent-E: `test_electron_runner.js` 965 Zeilen braucht sichtbare UI + Aufsicht). Deshalb: Code-Walkthrough + isolierte Läufe, keine erfundenen Klicks/Zeiten/Screenshots. Screenshots-Ordner bleibt bewusst leer (statt Fake-Screenshots).
- Regeln eingehalten: kein Produktcode-/Schema-/Dependency-Change, keine prod-`database.sqlite`-Berührung (0/72 Testdateien referenzieren sie), nur `:memory:`/`mkdtemp`, nur fiktive Daten (TEST-KUNDE-01 etc.), keine echten Mails/Bankdaten/Zahlungen, keine Secrets/PII in Berichten.
- Plan: `plans/testen_das_app.txt` wurde in Kap. 6–10 + Anhänge erweitert (Wettbewerb, Internet-Pflicht, Erwartungsbeträge, Output-Struktur, Entscheidung). Produktcode unberührt.
- Subagents (4 echt, parallel, gleiche Snapshot-Vorgabe): A Implementierung (explore), B Bedienbarkeit (app-qualitaet-ux), C Wettbewerb (general, Internet-Hauptaufgabe), D Tests/Belege (general). Alle mit Websearch/Webfetch-Pflicht. Outputs: `A_IMPLEMENTIERUNG.md` (38 KB), `B_BEDIENBARKEIT.md` (27 KB), `C_WETTBEWERB.md` (22 KB), `D_TESTS_BELEGE.md` (16 KB).
- Zugriffsdatum aller URLs: `2026-10-04`.
