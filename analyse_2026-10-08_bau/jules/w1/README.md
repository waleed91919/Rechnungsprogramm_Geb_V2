# Welle 1 — Basis, Reihenfolge, Parallel-Regel (J0/J3/J4/J5 + J12)

> Überblick für den Nutzer (lokal auszuführen). Jules-Prompts: `J0-data-integrity.md`, `J3-tote-ui.md`, `J4-leitweg-frühcheck.md`, `J5-e-nachweis.md` (+ J12 aus Welle-1-Plan in `JULES_TICKETS.md`). Snapshot: `C:\Users\walee\Desktop\server\Rechnungsprogramm_Geb_V2`, `main@194cd83`, Datum 2026-10-08.

## 1. Base erstellen (einmalig, lokal, VOR allen Jules-Slots)
```
git fetch origin
git rev-parse HEAD  # muss 194cd83102100353b12d2aa743954356c591db41 sein
git status --short  # dirty Worktree sichern: doc/changelog.md, preload.js, package.json, output/invoices/*, tests/test_results/* + 4 untracked
git stash push -u -m "dirty-vor-bau-base-2026-10-08"
git checkout -b bau-p0p1-base 194cd83
git push -u origin bau-p0p1-base
```
Danach ist `bau-p0p1-base@194cd83` die einzige Basis aller Welle-1-Branches. Nie direkt auf `main` arbeiten.

## 2. Reihenfolge (J0 zuerst mergen)
1. **J0** (`jules/j0-data-integrity`) zuerst starten UND zuerst mergen — blockt alles (38/38-Akzeptanz).
2. Nach J0-Merge: `bau-p0p1-base` aktualisieren, dann J3/J4 rebasen (`git rebase bau-p0p1-base`), dann mergen.
3. **J5** (nur Doku) jederzeit parallel, zuletzt mergen (keine Konflikte).
4. **J12** (Briefe-Verlinkung, additiv aus `JULES_TICKETS.md` Welle 1) parallel möglich, nach J0 mergen.
5. Erst danach Welle 2 (J1/J2/J9/J10/J11) nach Rebase — siehe `JULES_TICKETS.md` Wellenplan.

## 3. Parallel-Regel (datei-disjunkt)
- Welle 1 ist datei-disjunkt: J0 (`db.js`/`schema.js`), J3 (`main.js`/`preload.js`/`navigation.js`/`dashboard-actions.js`), J4 (`einvoice/*`/`kunden.js`/`editor/*`), J5 (nur `doc/e-nachweis/*` + `output/e-nachweis/*`), J12 (nur Brief-Verlinkung) — 5 Slots gleichzeitig erlaubt.
- Konflikt-Regel: gleiche Datei = nie gleichzeitig mergen. Immer 1 Slot für Rebase/Fixes freihalten. Täglich rebasen.
- Pro Ticket: 1 Branch = 1 PR, kleiner Diff, Test-Output + offene Punkte in PR-Beschreibung.

## 4. TEST-BAU-01-Anker (alle Wellen)
Angebot 2500/475/2975, N1 300/57/357, L1/F1 1300/247/1547, L2 2800/532/3332, F2 1500/285/1785, Teilzahlung 1500 → Rest 47, Schluss 0. Welle-1-Akzeptanz: J0 38/38, J3 kein toter Klick/falscher Toast, J4 Fehler im Formular, J5 Protokoll liegt bei.

## 5. Quellen (Zugriff 2026-10-08)
Siehe Einzel-Tickets; Fachmaßstab `S1_BAUFACH.md`, Lücken `S2_MODULGAP.md`, Roadmap `S3_ROADMAP.md`.

## Summary (max. 15 Zeilen)
- Base `bau-p0p1-base@194cd83` aus cleanem main.
- J0 zuerst mergen, Rest danach rebasen.
- Welle 1: 5 disjunkte Slots parallel.
- Gleiche Datei nie gleichzeitig mergen.
- 1 Slot für Rebase frei halten.
- TEST-BAU-01-Anker gilt für alle.
- Welle 2 erst nach J0-Merge.
