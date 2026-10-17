# J13 — Minderungs-Gutschrift ohne Voll-Storno + Nachtrag→LV-Stamm

> Copy-Paste-Prompt für Jules. Nie prod-`database.sqlite` (nur `:memory:`/`mkdtemp` + TEST-BAU-01).

## Titel
J13: Gutschrift als Minderung ohne Voll-Storno + GENEHMIGT-Nachtrag in `projekt_positionen`

## Branch
`jules/j13-gutschrift-nachtrag-lv`

## Base / Ziel
- Base: `bau-p0p1-base@194cd83` + Welle 1 + Welle 2 (J1+J2) + J7 + J8 gemergt + rebased, Stand 2026-10-08. **Nach J7→J8-Merge erst rebasen, dann starten** (gleicher Nummernkreis!).
- Ziel: PR auf `bau-p0p1-base`. Kein Direkt-Commit auf `main`.

## Kontext / Problem (Ist-Stand)
- Storno heute nur Voll-Storno: `controllers/InvoiceController.js:627-669` (`createStornoData`: Negativ-Positionen, `STORNO - {nr}`, Original `Storniert/locked`, Storno `rechnungsart:'STORNO'`, atomar via `db/repositories/document_repo.js:storniereRechnung:569-602`). Kein Minderungs-Beleg ohne Voll-Storno (Grep `GUTSCHRIFT` nur Filter-/Typzweig `js/einvoice.js:562-563`, `js/datev.js:192`, kein `createGutschrift`).
- Nachtrag heute nur in Zielbeleg-`positionen`: `controllers/NachtragController.js:100-126` (`extractApprovedPositionsForInvoice`, Key `N:{id}:POS:{pos}`, `is_supplement:true`) + `js/projects/project-document-flow.js:162-290` (`applyApprovedNachtraegeToCurrentInvoice`) — KEIN `INSERT INTO projekt_positionen` (`db/schema/projects_schema.js:32-57` LV-Stamm bleibt ohne Nachtrag).
- Rechtsrahmen: Minderung nach VOB/B § 13 Abs. 6 / BGB § 638 (s. Quellen); Gutschrift im Wettbewerber-Grundmodul (s. Quellen).

## Ziel
1. Minderungs-Gutschrift buchbar OHNE Voll-Storno (Teilbetrag, Original bleibt abrechenbar, GoBD-Lock beachtet).
2. GENEHMIGT-Nachtrag steht im LV-Stamm: bei Genehmigung/Übernahme zusätzlich `projekt_positionen`-Write (idempotent), nicht nur Zielbeleg-Positionen.

## Scope (darf angefasst werden)
- `createGutschriftData` (neu, analog `createStornoData` aber Teilbetrag, Referenz `gutschrift_zu_nr`, eigene `GUT-{nr}`, Original NICHT `Storniert`; GoBD-Sperrprüfung `Festgeschrieben/Bezahlt/Storniert` + Audit-Grund).
- `einvoice.js` (Typ-Code)/`datev.js` (Flag) nur minimal für Gutschrift-Kennzeichnung ergänzen.
- Nachtrag→LV: `NachtragController` + Übernahme um `projekt_positionen`-INSERT erweitern (Felder `projekt_id`, `source_angebot_pos_id`/`nachtrag_id`, `oz_code`, Menge/Einheit/EP), Idempotenz-Key `N:{nachtrag_id}:POS:{pos_id}` wiederverwenden, Doppel-Write verhindern.
- Tests: `tests/` Gutschrift- + Nachtrag-LV-Tests (Temp-DB).

## Out-of-scope (NICHT anfassen)
- `createStornoData`/`storniereRechnung`-Voll-Storno NICHT umbauen (nur wiederverwenden/ergänzen).
- Keine AB-/LS-Nummernkreis-Umwidmung (J7/J8), kein Aufmaß-/GAEB-/Mahn-Umbau, keine prod-DB, keine Commits auf `main`.

## Schritte
1. Rebasen; Gutschrift-Datenobjekt + Repo-Transaktion (Gutschrift speichern, Original-Status ` gemindert/teilgutgeschrieben`, NICHT `Storniert`; Beträge negativ nur in Gutschrift).
2. Sperr-/Idempotenz-Checks: gesperrte Belege ablehnen; Doppel-Gutschrift gleiche Referenz verhindern/verlinken.
3. Nachtrag→LV: bei `status='GENEHMIGT'` INSERT in `projekt_positionen` (Upsert per Idempotenz-Key); Übernahme in Rechnung bleibt wie bisher (kein Doppel-Effekt).
4. Kumulativ-Sicht prüfen (Controlling/`mergeSchlussaufmass`-Preisfindung sieht Nachtrag im LV).
5. TEST-BAU-01-Mini: N1 300/57/357 GENEHMIGT → steht in `projekt_positionen` UND in L1; Minderungs-Gutschrift (z. B. −100 netto) ohne Storno buchen, Original weiter fakturierbar.

## Testbefehle
```
npm test
node --test tests/data_integrity.test.js
node --test tests/gutschrift-nachtrag-lv.test.js
```

## Akzeptanz (messbar)
- Minderung ohne Storno buchbar: Gutschrift mit eigener Nr gespeichert, Original NICHT `Storniert`/locked-zerstört, Reload-Read-Nachweis.
- GENEHMIGT-Nachtrag steht im LV-Stamm (`projekt_positionen`-Zeilen mit Idempotenz-Key), Doppel-Übernahme erzeugt keine Duplikate (weder Beleg noch LV).
- Voll-Storno-Pfad unverändert grün; `npm test` grün.
- NICHT gleichzeitig mit J7/J8 gemergt (Reihenfolge J7→J8→J13).

## Quellen (alle Zugriff 2026-10-08)
- smarthandwerk Grundmodul (Gutschrift im Basispaket): https://smarthandwerk.de/leistungsbeschreibungen
- baufaktura (Abrechnung/Kalkulation): https://baufaktura.de/
- Rechnungsarten (Minderung vs. Storno-Kontext): https://heitker.de/glossar/rechnungsarten
- bauprofessor Abnahme/Mängel (Musterbriefe: Verweigerung wegen wesentlicher Mängel, Zustandsfeststellung): https://www.bauprofessor.de/abnahme-vob-vertraege ; https://www.bauprofessor.de/musterbrief/verweigerung-abnahme-wg-wesentlicher-maengel ; https://www.bauprofessor.de/zustandsfeststellung-bauleistung
- Norm VOB/B § 13 Abs. 6 Minderung: https://dejure.org/gesetze/VOB-B/13.html
- Norm BGB §§ 638/640 (Minderung/Abnahme): https://datenbank.nwb.de/Dokument/79084_640
- Norm UStG § 14 (Gutschrift als Rechnungsart/Pflichtangaben): https://www.gesetze-im-internet.de/ustg_1980/__14.html ; E-Rechnungspflicht Gutschriften: BMF 15.10.2024.

## PR-Anforderung
- 1 PR `jules/j13-gutschrift-nachtrag-lv` → `bau-p0p1-base`; kleine Diff; ohne `database.sqlite`/`output/`.
- PR-Beschreibung: Base-SHA (+ J7/J8-SHAs), Minderungs-Nachweis (Gutschrift-Nr, Betrag, Original-Status), LV-Nachweis (`projekt_positionen`-Zeilen N1), Idempotenz-Nachweis, Test-Log.
- Zuletzt in der Dok-Typen-Reihe mergen (s. `w3/README.md`), danach J6.
