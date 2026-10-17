# Welle 3 — Merge-Reihenfolge + lokale Anleitung (J7 → J8 → J13, dann J6)

Gilt für Snapshot: Repo `C:\Users\walee\Desktop\server\Rechnungsprogramm_Geb_V2`, Base `bau-p0p1-base@194cd83` + Welle 1 + Welle 2 (J1+J2) gemergt + rebased, Datum 2026-10-08. Read-only im Produktcode für diesen Prompt-Autor; Jules-Branches s. Tickets.

## Reihenfolge (verbindlich)
1. **J7** (`jules/j7-ab-auftragsbestaetigung`) zuerst mergen — führt AB-Typ + Nummernkreis-Anteil ein.
2. Rebase, dann **J8** (`jules/j8-kunden-lieferschein`) mergen — teilt sich Nummernkreis/`dokumente` mit J7.
3. Rebase, dann **J13** (`jules/j13-gutschrift-nachtrag-lv`) mergen — teilt sich Nummernkreis/`dokumente` + `projekt_positionen` mit J7/J8.
4. Rebase, dann **J6** (`jules/j6-demo-proof-test-bau-01`) zuletzt — braucht alle (Demo-Proof, kein Feature).
- **NICHT gleichzeitig mergen** (gleicher Nummernkreis `idx_dokumente_type_nr ON dokumente(type,nr)` + `document_repo.js`-Vergabe). Regel aus `analyse_2026-10-08_bau/JULES_TICKETS.md:24`.

## Lokale Merge-Anleitung (pro Ticket, nacheinander)
```
git fetch origin
git checkout bau-p0p1-base
git pull --rebase
git checkout -b tmp-merge-check
git merge --no-ff jules/j7-ab-auftragsbestaetigung -m "Merge J7 AB"
npm test
node --test tests/data_integrity.test.js
git checkout bau-p0p1-base
git merge --no-ff jules/j7-ab-auftragsbestaetigung -m "Merge J7 AB"
git push origin bau-p0p1-base
```
Danach für J8/J13/J6 wiederholen: erst `git checkout <jules-branch> && git rebase bau-p0p1-base` (Konflikte in `documents_schema.js`/`document_repo.js` manuell, Typ-Uniqueness erhalten), Tests, dann `--no-ff`-Merge + Push. Bei Rot: Merge stoppen, Ticket-Branch fixen lassen, kein Force-Push auf Base.

## Konflikt-Hinweise
- Gleiche Dateien (J7/J8/J13): `documents_schema.js`, `document_repo.js`, `project-document-flow.js`, Nummernkreis-Tests. Immer älteren Merge gewinnen lassen (J7→J8→J13), neuere rebasen.
- J6 hat keinen Produktcode-Diff (nur `scripts/demo-proof-*` + Test/Protokoll) — bei Konflikten Skript-Pfade prüfen, nie Produktcode „mitfixen“.
- Nie `database.sqlite`, `output/`, `tmp_test_uploads/` committen; `git status` vor jedem Merge/Push prüfen.

## Summary
- W3 = J7 AB + J8 LS + J13 Gutschrift/LV + J6 Proof; Base bau-p0p1-base@194cd83+W1+W2.
- TEST-BAU-01 fix: 2500/475/2975, N1 300/57/357, L1/F1 1300/247/1547, L2 2800/532/3332, F2 1500/285/1785, Rest 47, Schluss 0.
- Reihenfolge J7→J8→J13 (Nummernkreis!), dann J6; nie gleichzeitig mergen.
- Pro Merge: fetch, checkout base, merge --no-ff, tests, push; J6 zuletzt.
- Quellen (URL+2026-10-08) in jedem Ticket: bauprofessor, smarthandwerk/baufaktura, Norm (VOB/BGB/UStG/GoBD).
