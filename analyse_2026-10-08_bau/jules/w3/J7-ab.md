# J7 — Echte Auftragsbestätigung (AB mit eigener Nr / PDF / Speicherung)

> Copy-Paste-Prompt für Jules. Read-only-Regel gilt für diesen Prompt-Autor; Jules arbeitet auf Branch (s. u.), nie auf prod-`database.sqlite` (nur `:memory:`/`mkdtemp` + TEST-BAU-01).

## Titel
J7: Auftragsbestätigung als echtes Dokument (Nr + PDF + Speicherung)

## Branch
`jules/j7-ab-auftragsbestaetigung`

## Base / Ziel
- Base: `bau-p0p1-base@194cd83` + Welle 1 + Welle 2 (J1+J2) gemergt + rebased, Stand 2026-10-08.
- Ziel: PR auf `bau-p0p1-base` (Review, dann weiter nach `main`). Kein Direkt-Commit auf `main`.
- Vor Start: `git fetch origin && git checkout bau-p0p1-base && git pull --rebase && git checkout -b jules/j7-ab-auftragsbestaetigung`.

## Kontext / Problem (Ist-Stand)
- `js/projects/project-document-flow.js:131-134`: `CREATE_NEW`-Zweig mappt `type: zielTyp==='RECHNUNG' ? 'rechnung' : 'angebot'` — die Modal-Option `AUFTRAG` (`js/modal-loader.js:20`, Werte u. a. ABSCHLAG/SCHLUSSRECHNUNG/ANGEBOT/AUFTRAG) fällt auf `type='angebot'` zurück; `typ: zielTyp` ist nur Etikett, `nr: null`, kein eigenes AB-Dokument.
- `db/schema/documents_schema.js:8`: `dokumente.type` kennt nur `'rechnung'/'angebot'` (Kommentar); Nummernkreis-Uniqueness via `idx_dokumente_type_nr ON dokumente(type, nr)` (`db/schema/index.js:687,1467`; Konfliktbehandlung `db/repositories/document_repo.js:209,432,459`).
- Wettbewerber-Standard (Grundmodul): Angebot, Auftragsbestätigung, Rechnung, Gutschrift, Lieferschein (s. Quellen).

## Ziel
Echte Auftragsbestätigung: eigenes Dokument mit eigener Nummer aus Nummernkreis, Speicherung (`saveDocument`/`document_repo`), PDF-Ablage/Druck, Herkunft aus angenommenem Angebot (V2). Alt-Flow (Angebot→Rechnung, `convertToRechnung`, Aufmaß-Übergabe UPDATE_EXISTING/CREATE_NEW) bleibt ungebrochen.

## Scope (darf angefasst werden)
- `dokumente`-Typ-Erweiterung für AB (`type`/`typ`/`rechnungsart`, Nummernvergabe, Validierung, Trigger `gaeb_schema.js:275-335` beachten: nur `angebot` darf GAEB-Link tragen — AB darf diesen Guard nicht brechen).
- `document_repo.js` (Nr-Vergabe, `idx`-Konflikt-Pfad), `InvoiceController`/`AngebotController` nur soweit für AB-Erzeugung nötig.
- `project-document-flow.js` AUFTRAG-Mapping fixen (echter AB statt `angebot`-Fallback).
- UI-Option `AUFTRAG` + AB-PDF (bestehendes PDF-Layout wiederverwenden, kein neues Designsystem).
- Tests: `tests/` neuer/angepasster AB-Test (Temp-DB).

## Out-of-scope (NICHT anfassen)
- Kein Kunden-Lieferschein (J8), keine Gutschrift/Nachtrag→LV (J13), kein GAEB-Generator (J9), kein Aufmaß-Umbau (J10), kein Mahn-/Fristen-Umbau (J11), keine Brief-Verlinkung (J12).
- Keine Änderung an `lieferscheine_digital` (Lieferanten-Fotos), keine Storno-Logik (`createStornoData`), keine prod-`database.sqlite`, keine Commits auf `main`.

## Schritte
1. Rebase auf Base;/schema: AB-Typ einführen (`type`-Werte, `nr`-Pflicht, `UNIQUE(type,nr)`-Verhalten prüfen, Migration ohne Alt-Datenbruch).
2. Nummernkreis: AB-Nummer (z. B. `AB-2026-0001`) analog RE/Angebot, Einmaligkeit pro Typ, Konflikt-Fehlermeldung testen.
3. Erzeugung: aus ANGENOMMENEM Angebot V2 (Freeze/`angenommene_version`) AB erstellen (Kunde/Projekt/Positionen kopieren, `parent_angebot_id`, Status `Entwurf`→`Bestätigt`); Modal-Option AUFTRAG auf echten AB routen.
4. PDF: AB-PDF erzeugen/ablegen (bestehendes Layout), Pfad persistieren.
5. Alt-Flow-Regression: Angebot→Rechnung, Aufmaß-Übergabe (UPDATE_EXISTING + CREATE_NEW) unverändert grün.
6. TEST-BAU-01-Mini: Angebot 2500/475/2975 (V2) → AB (gleiche Summen, eigene AB-Nr).

## Testbefehle
```
npm test
node --test tests/data_integrity.test.js
node --test tests/ab-auftragsbestaetigung.test.js
```
Alle auf Temp-DB (`:memory:`/`mkdtemp`); kein `database.sqlite` im Repo-Diff.

## Akzeptanz (messbar)
- AB-Dokument mit eigener Nr + PDF ist gespeichert und per Reload-Read (`getDocumentById`/`getFullState`) nachweisbar.
- `AUFTRAG`-Auswahl erzeugt KEIN `type='angebot'` mehr.
- Alt-Flow ungebrochen: Angebot→Rechnung + Aufmaß-Übergabe-Tests grün; `npm test` grün.
- TEST-BAU-01: Angebot V2 2500/475/2975 → AB mit identischen Summen + eigener AB-Nr.

## Quellen (alle Zugriff 2026-10-08)
- smarthandwerk Grundmodul Dok-Arten (Angebot, Auftragsbestätigung, Rechnung, Gutschrift, Lieferschein): https://smarthandwerk.de/leistungsbeschreibungen
- smarthandwerk Übersicht (Angebot·Auftrag·Rechnung): https://smarthandwerk.de/
- baufaktura (Abrechnung/Kalkulation/Aufmaß): https://baufaktura.de/
- bauprofessor Musterbriefe-Übersicht (326 Briefe): https://www.bauprofessor.de/musterbriefe/uebersicht
- bauprofessor Abnahme VOB-Verträge (§ 12): https://www.bauprofessor.de/abnahme-vob-vertraege
- Norm VOB/B § 12 Abnahme: https://dejure.org/gesetze/VOB-B/12.html
- Norm UStG § 14 Pflichtangaben/fortlaufende Nummer: https://www.gesetze-im-internet.de/ustg_1980/__14.html ; Übersicht: https://www.lido.app/de/ustg-14
- Norm E-Rechnung/GoBD (EN 16931, ZUGFeRD/XRechnung): BMF 15.10.2024 / GoBD-Ergänzung 14.07.2025 (s. Haufe/Grant-Thornton-Übersichten).

## PR-Anforderung
- 1 PR von `jules/j7-ab-auftragsbestaetigung` → `bau-p0p1-base`; kleine Diff, Scope-Dateien oben; `git status`/`git diff` sauber, keine `database.sqlite`, kein `output/`/`tmp_test_uploads/`.
- PR-Beschreibung: Base-SHA, TEST-BAU-01-Nachweis (AB-Nr + Summen), Test-Log (`npm test` + AB-Test), Alt-Flow-Nachweis, Screenshots/PDF-Pfad nur aus Temp-DB.
- Merge-Reihenfolge beachten: J7 zuerst (Nummernkreis!), NICHT gleichzeitig mit J8/J13 mergen (s. `w3/README.md`).
