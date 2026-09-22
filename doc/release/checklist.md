# W-Link Bau P0.5 — Release-Checkliste (pro Release abzuarbeiten)

Version: ________  Commit: ________  Tester: ________  Datum: ________

## 1. Pflicht-Gate: automatisierte Tests
- [ ] `npm test` vollständig grün (keine `--skip`, keine auskommentierten Assertions)
- [ ] P0.2-Abnahmetabelle grün (`tests/cumulative_retention_chain.test.js`)
- [ ] P0.3-Übergabe-Nachweis grün (`tests/uebergaben_persistenz.test.js`)
- [ ] P0.4-Belegfixierung grün (`tests/erechnung_belegfixierung.test.js`)
- [ ] P0.1-Negativmatrix grün (`tests/sync_server_security.test.js`, `tests/sync_client_security.test.js`)

## 2. Windows-Installations-/Update-Test
- [ ] Frisch-Installation: Installer läuft, App startet, `better-sqlite3`-Rebuild OK
- [ ] Update über Vorversion mit echter Alt-DB: Migrationen grün, Alt-Belege lesbar
- [ ] Sync bleibt Opt-in-aus nach Update (`auto_start=false`, Host `127.0.0.1`)
- [ ] Laufzeiten: Windows 10/11, Electron-/Node-Versionen aus `package.json` dokumentiert

## 3. Backup / Restore / Migration
- [ ] Voll-Backup → DB löschen/verderben → Restore → Satzvergleich (Belege, Zahlungen, Aufmaß, Einstellungen inkl. Sync-Opt-in-Status) identisch
- [ ] Abgebrochene Migration → App startet im sicheren Zustand mit lesbarer Fehlermeldung, kein Datenverlust (Vorher/Nachher-Satzvergleich)
- [ ] Auto-Backup beim Beenden + Scheduler mit Test-Profil nachgewiesen

## 4. E-Rechnung (externer Validator, pro Release archivieren)
- [ ] Fixtures (Standard-B2B, §13b, B2G mit Leitweg-ID, Schlussrechnung mit Einbehalt, Gutschrift/Storno) gegen **KoSIT-Validator Bundle 3.0.2** geprüft
- [ ] ZUGFeRD-Fixtures zusätzlich **veraPDF** (PDF/A-3) geprüft
- [ ] Archiviert: Validator-Version, Bundle-Version, Fixture-XMLs, Vollberichte (unter `doc/release/`)
- [ ] Sichtabgleich PDF == XML == DB (Netto/Steuer/Brutto/Zahlbetrag, Leitweg-ID, Nr./Datum)

## 5. E2E-Desktop (echt, kein Mock — Windows-Build)
- [ ] Happy-Path: Kunde → Angebot/LV → Auftrag/Projekt → Aufmaß → Übergabe → Abschlag 1 → Teilzahlung → Abschlag 2 → Nachtrag → Schlussrechnung → Freigabe → XRechnung-Export → StB-Export
- [ ] App-Neustart in der Mitte: alle Zwischenstände Reload-fest
- [ ] OPOS-Nullabgleich am Ende (offener Saldo = 0 nach Vollzahlung + Freigabe)
- [ ] Sperr-/Storno-Pfad: gesperrte Rechnung nicht editierbar, Storno nur per neuem Beleg

## 6. Sync-Smoke (Windows-Echtlauf, kein Mock)
- [ ] Frisches Profil → Sync aus/Loopback
- [ ] Opt-in → starten; PWA koppeln → Push/Pull Zeiterfassung + Foto
- [ ] Hub stoppen → Sitzung tot (401)
- [ ] Alt-Profil (autoStart=true) → Migration setzt `false` + `127.0.0.1`

Unterschrift: ________________________
