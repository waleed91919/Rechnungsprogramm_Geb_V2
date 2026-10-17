# J6 — Demo-Proof-Skript TEST-BAU-01 (KEIN Feature)

> Copy-Paste-Prompt für Jules. Reines Nachweis-Skript auf Temp-DB; KEINE Produktlogik ändern.

## Titel
J6: Demo-Proof TEST-BAU-01 als Skript (V2→AB→Aufmaß→L1/L2→Schluss→Teilzahlung→Mahnung→DATEV) + Negativ-Proben

## Branch
`jules/j6-demo-proof-test-bau-01`

## Base / Ziel
- Base: `bau-p0p1-base@194cd83` + Welle 1 + Welle 2 (J1+J2) + J7 + J8 + J13 gemergt + rebased, Stand 2026-10-08. **Zuletzt starten (braucht alle).**
- Ziel: PR auf `bau-p0p1-base` (nur Skript + Protokoll-Vorlage, kein Produktcode). Kein Direkt-Commit auf `main`.

## Kontext / Erwartungsrechnung TEST-BAU-01 (fix)
Angebot 2500/475/357? — fix: Angebot netto 2500 / USt 475 / brutto 2975; N1 300/57/357; L1/F1 1300/247/1547; L2 2800/532/3332; F2 1500/285/1785; Teilzahlung 1500 auf F1 → Rest 47; Schluss 0. (Basis: `analyse_2026-10-04_run2/ENTSCHEIDUNGSBERICHT.md`, `analyse_2026-10-08_bau/JULES_TICKETS.md:3`.)
- Kette: Angebot V2 → AB (J7) → Aufmaß → L1/L2 (VOB Abschlag/Teilung) → Schluss (J1: verrechnet alle, 2. Schluss scheitert) → Teilzahlung/Bezahlt-Link (J2: Rest 47 statt €0,00) → Mahnung (Protokoll, keine falschen „versendet“-Toasts) → DATEV-Export.

## Ziel
Ein Skript, das die Kette auf Temp-DB (`:memory:`/`mkdtemp`, z. B. `scripts/demo-proof-test-bau-01.js` + Protokoll `output/demo-proof-TEST-BAU-01.md` nur als Lauf-Artefakt, nicht committen falls `output/` ignoriert — dann unter `tests/test_results/`) deterministisch durchspielt und grün bricht, sobald eine Erwartung verletzt ist. Inkl. Negativ-Proben.

## Scope (darf angefasst werden)
- NUR neues Skript + ggf. `tests/demo-proof.test.js`-Hülle, die dasselbe asserts.
- Lesen der bestehenden Controller/Repos (AB-, LS-, Gutschrift-, Nachtrag-, Mahn-, DATEV-Pfade) zur Verkettung.

## Out-of-scope (NICHT anfassen — KEIN Feature)
- KEINE Änderung an Produktcode (`controllers/`, `db/`, `js/`, `main.js`, `preload.js`), keine Schema-Migration, keine UI-, Nummernkreis-, Storno-, Mahn-Logikänderung. Nur Skript.
- Keine prod-`database.sqlite` (Skript bricht ab, wenn Pfad auf prod-DB zeigt), keine Commits auf `main`.

## Schritte
1. Auf voll gemergte Base rebasen; Skript anlegen (Temp-DB, Seed Kunde/Projekt).
2. Kette assertscharf fahren: Angebot anlegen→V2→ANNEHMEN/AB (Summen 2500/475/2975, AB-Nr vorhanden) → Aufmaß-Merge → L1 (1300/247/1547) → N1 GENEHMIGT (300/57/357, LV-Stamm-Check) → L2 (2800/532/3332, kumulativ) → Schluss (0, verrechnet alle) → Teilzahlung 1500 auf F1 (Rest 47, Status NICHT „bezahlt“) → Mahnung-Stufe (Protokoll-Eintrag, kein Fake-Toast) → DATEV-Export läuft.
3. Negativ-Proben (müssen SCHEITERN im Positiv-Sinn): 2. Schluss auf gleichen Vorgänger wird abgewiesen (J1-UNIQUE); Überzahlung/Rest-47-Fall zeigt Rest statt €0,00; Storno-/Gutschrift-Trennung (Minderung ≠ Storno).
4. Protokoll schreiben (Erwartung vs. Ist je Schritt, PASS/FAIL, SHAs, Dauer); Exit-Code ≠ 0 bei Abweichung.
5. `npm test` + Skript 2× hintereinander (Idempotenz: 2. Lauf auf frischer Temp-DB ebenfalls grün).

## Testbefehle
```
npm test
node scripts/demo-proof-test-bau-01.js
node --test tests/demo-proof.test.js
```

## Akzeptanz (messbar)
- Skript grün + Protokoll liegt bei (Erwartungswerte oben exakt: 2500/475/2975, 300/57/357, 1300/247/1547, 2800/532/3332, 1500/285/1785, Rest 47, Schluss 0).
- Negativ-Proben nachgewiesen: 2. Schluss scheitert; Rest 47 (nicht „bezahlt“/€0,00).
- Kein Produktcode-Diff (nur Skript/Test/Protokoll); `npm test` grün; keine prod-DB berührt.

## Quellen (alle Zugriff 2026-10-08)
- bauprofessor Abnahme (§ 12-Fristen 12 Werktage/6 Werktage, förmliche Abnahme): https://www.bauprofessor.de/abnahme-vob-vertraege ; https://www.bauprofessor.de/abnahme
- bauprofessor Mängel (Verweigerung wesentlicher Mängel; Zustandsfeststellung § 4 Abs. 10 ≠ Abnahme): https://www.bauprofessor.de/musterbrief/verweigerung-abnahme-wg-wesentlicher-maengel ; https://www.bauprofessor.de/zustandsfeststellung-bauleistung
- smarthandwerk (Auftragskette Angebot→Auftrag→Rechnung, Abschlag/Teil/Schluss VOB): https://smarthandwerk.de/leistungsbeschreibungen ; https://smarthandwerk.de/
- baufaktura (Aufmaß/Abrechnung): https://baufaktura.de/
- Norm VOB/B §§ 12/13/14/16 (Abnahme/Mängel/Abrechnung/Zahlung 21 Tage): https://dejure.org/gesetze/VOB-B/12.html ; https://dejure.org/gesetze/VOB-B/13.html ; VOB/B-PDF (BMWSB).
- Norm UStG §§ 14/14b (Pflichtangaben, Aufbewahrung), GoBD + E-Rechnung (EN 16931): https://www.gesetze-im-internet.de/ustg_1980/__14.html ; BMF 15.10.2024.

## PR-Anforderung
- 1 PR `jules/j6-demo-proof-test-bau-01` → `bau-p0p1-base`; Diff nur Skript/Test/Protokoll; `git status`/`git diff` ohne `database.sqlite`.
- PR-Beschreibung: Base-SHA (+ J7/J8/J13-SHAs), Skript-Log + Protokoll, TEST-BAU-01-Tabelle Erwartung vs. Ist, Negativ-Proben-Nachweis.
- Nach J7→J8→J13 mergen (s. `w3/README.md`).
