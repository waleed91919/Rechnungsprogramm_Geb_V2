# J8 — Kunden-Lieferschein (LS mit Nr / PDF, Weg Angebot→LS→Rechnung)

> Copy-Paste-Prompt für Jules. Nie prod-`database.sqlite` (nur `:memory:`/`mkdtemp` + TEST-BAU-01).

## Titel
J8: Kunden-Lieferschein als eigenes Dokument (Nr + PDF, camino Angebot→LS→Rechnung)

## Branch
`jules/j8-kunden-lieferschein`

## Base / Ziel
- Base: `bau-p0p1-base@194cd83` + Welle 1 + Welle 2 (J1+J2) gemergt + rebased, Stand 2026-10-08. **Nach J7-Merge erst rebasen, dann starten** (gleicher Nummernkreis!).
- Ziel: PR auf `bau-p0p1-base`. Kein Direkt-Commit auf `main`.
- Vor Start: `git fetch origin && git checkout bau-p0p1-base && git pull --rebase && git checkout -b jules/j8-kunden-lieferschein`.

## Kontext / Problem (Ist-Stand)
- Heute nur Lieferanten-Fotos: `db/schema/construction_schema.js:207-220` (`lieferscheine_digital`: `lieferant_name`, `foto_pfad`, `sha256`, kein Kundenbeleg, keine Nr/PDF-Kette).
- `dokumente.type` kennt nur `rechnung`/`angebot` (`documents_schema.js:8`); LS fehlt als `dokumente`-Typ; `project-document-flow.js` kennt keinen LS-Weg.
- Wettbewerber-Standard: Lieferschein im Grundmodul neben Angebot/AB/Rechnung/Gutschrift (s. Quellen).

## Ziel
Kunden-Lieferschein (Ausgangs-LS an Kunden/Projekt) mit eigener Nr + PDF + Speicherung; Weg (camino) Angebot→LS→Rechnung: LS aus Angebot/AB-Positionen erzeugen, LS-Positionen in Rechnung übernehmen (idempotent, Herkunftsvermerk), ohne Lieferanten-Tabelle zu beschädigen.

## Scope (darf angefasst werden)
- Neuer LS-Dok-Typ in `dokumente` (Nr-Kreis `LS-…`, `UNIQUE(type,nr)`, `document_repo.js`-Vergabe analog J7-Muster, Rebase-Konflikte mit J7 manuell auflösen).
- Erzeugung aus Angebot/AB + Übernahme LS→Rechnung (Menge/oz_code-Herkunft, kein stilles 0).
- LS-PDF (bestehendes Layout wiederverwenden).
- Tests: `tests/` LS-Test auf Temp-DB.

## Out-of-scope (NICHT anfassen)
- `lieferscheine_digital` (Lieferanten-Fotos) NICHT umbauen/umbiegen — nur lesen/vergleichen.
- Keine AB-Logik umbauen (J7), keine Gutschrift/Nachtrag→LV (J13), kein Aufmaß-/GAEB-/Mahn-Umbau, keine prod-DB, keine Commits auf `main`.

## Schritte
1. Auf J7-gemergte Base rebasen; LS-Typ + `LS-2026-0001`-Kreis einführen (Typ-Uniqueness-Test).
2. LS aus Angebot/AB erzeugen (Kunde/Projekt/Positionen, Datum, Status `Offen`/`Geliefert`); PDF ablegen.
3. LS→Rechnung-Übernahme (idempotent per `LS:{id}:POS:{pos}`, Herkunftsfelder wie Aufmaß-`aufmass_quelle`-Muster); Mehrfach-Übernahme erzeugt keine Duplikate.
4. Lieferanten-Tabelle unangetastet lassen (Grep-Nachweis: keine Migration an `lieferscheine_digital`).
5. TEST-BAU-01-Mini: Angebot 2500/475/2975 → LS (Teillieferung) → Rechnung mit LS-Herkunft.

## Testbefehle
```
npm test
node --test tests/data_integrity.test.js
node --test tests/lieferschein.test.js
```

## Akzeptanz (messbar)
- LS mit eigener Nr + PDF gespeichert, Reload-Read-nachweisbar.
- Camino nachweisbar: Angebot→LS→Rechnung mit Herkunftsvermerk; Doppel-Übernahme idempotent.
- `lieferscheine_digital`-Schema unverändert; `npm test` grün.
- NICHT gleichzeitig mit J7/J13 gemergt (Reihenfolge J7→J8→J13).

## Quellen (alle Zugriff 2026-10-08)
- smarthandwerk Grundmodul (u. a. Lieferschein): https://smarthandwerk.de/leistungsbeschreibungen
- smarthandwerk Übersicht: https://smarthandwerk.de/
- baufaktura (Lieferschein/Abrechnungspraxis): https://baufaktura.de/
- Rechnungsarten (Abschlag/Teilschluss/Schluss, Abgrenzung Lieferbeleg): https://heitker.de/glossar/rechnungsarten
- bauprofessor Musterbriefe-Übersicht: https://www.bauprofessor.de/musterbriefe/uebersicht
- bauprofessor Zustandsfeststellung/Abnahme (Abgrenzung technische Feststellung vs. Abnahme): https://www.bauprofessor.de/zustandsfeststellung-bauleistung
- Norm VOB/B § 12 (Abnahme) / § 13 (Mängel): https://dejure.org/gesetze/VOB-B/12.html ; https://dejure.org/gesetze/VOB-B/13.html
- Norm UStG § 14 (fortlaufende Nummer): https://www.gesetze-im-internet.de/ustg_1980/__14.html

## PR-Anforderung
- 1 PR `jules/j8-kunden-lieferschein` → `bau-p0p1-base`; kleine Diff; `git status`/`git diff` ohne `database.sqlite`/`output/`.
- PR-Beschreibung: Base-SHA (+ J7-SHA nach Rebase), TEST-BAU-01-Camino (Angebot→LS-Nr→Rechnung), Test-Log, Nachweis `lieferscheine_digital` unberührt.
- Erst nach J7-Merge mergen (s. `w3/README.md`).
