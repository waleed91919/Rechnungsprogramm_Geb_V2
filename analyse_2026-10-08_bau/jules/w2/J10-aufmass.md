# J10 — 1-Welt-Aufmaß: OZ-FK oder harte Warnung + kumulative Sicht

> Copy-Paste-Prompt für Jules. Read-only-Regel: KEINE Produktänderung außerhalb dieses Tickets, KEINE Commits ohne Aufforderung, KEINE prod-DB. Nur Branch unten verwenden.

## Titel
J10 1-Welt-Aufmaß: OZ-Fremdschlüssel oder harte Warnung statt stiller 0 + kumulative Rechnungssicht

## Branch
`jules/j10-aufmass`

## Base
- Repo: `C:\Users\walee\Desktop\server\Rechnungsprogramm_Geb_V2`
- Base: `bau-p0p1-base@194cd83` + J0 gemergt + rebased
- Datum: 2026-10-08
- Snapshot-Kontext TEST-BAU-01: L1/F1 1300/247/1547, L2 2800/532/3332, F2 1500/285/1785 — kumulativ F1+F2=L2 muss sichtbar werden.

## Ziel
`mergeSchlussaufmass` gibt heute bei Tippfehler-OZ still `einheitspreis: 0` zurück (`aufmass_repo.js:218-232`) — stille Null statt Warnung. Und es fehlt die kumulative Bau-Sicht (Vorrechnungen/Zahlungen/Rest). J10 macht daraus 1-Welt-Aufmaß: OZ validiert (FK oder harte Warnung) + Kumulations-Panel (F1+F2=L2 sichtbar).

## Scope (darfst du anfassen)
- `db/repositories/aufmass_repo.js:167-232` — `mergeSchlussaufmass(projectId, options)` (Aggregation 176-191, Vertragspositionen 194-206, PriceMap 209-215, Anreicherung 218-232 mit `einheitspreis: 0`-Fallback = Fehlerquelle)
- `db/repositories/aufmass_repo.js:122-157` — `saveAufmassBlatt` (OZ-Validierungs-Hook hier oder in Merge; Default `oz_code='01.01.0010'` Z.143 hinterfragen)
- `db/schema/measurement_schema.js` — `aufmass_blaetter/zeilen` (Status-CHECK, `oz_code NOT NULL`; ggf. FK/INDEX ergänzen)
- Aufmaß-UI (Blatt-Editor + Schlussaufmaß-View: Warnbanner + Kumulations-Panel) + Tests `tests/j10-aufmass.test.js`

## Out-of-scope (VERBOTEN)
- `rechnung_verrechnungen`/Schluss-UNIQUE (J1), Zahlungs-Matching (J2), GAEB-Generator (J9), Mahnung/SMTP (J11)
- Preislogik in `js/projects/project-calculations.js` ändern — nur lesen.
- Keine prod-DB, keine echten Projektdaten.

## Schritte
1. Rebase: `git fetch origin; git rebase origin/bau-p0p1-base`.
2. Fehler reproduzieren: Lege Aufmaßzeile mit Tippfehler-OZ (z. B. `01.01.001` statt `01.01.0010`) an → `mergeSchlussaufmass` liefert `einheitspreis: 0`, `position_id: null` OHNE Warnung. Log in PR-Body.
3. OZ-Guard implementieren (eine Variante + Begründung):
   - (a) Validierung in `saveAufmassBlatt`: OZ muss in `positionen.oz_code` des Projekts (oder LV-Stamm) existieren, sonst harter Fehler mit „Meintest du …?"-Vorschlag (Levenshtein/Präfix), ODER
   - (b) `mergeSchlussaufmass` gibt `warnings: [{oz_code, grund:'UNBEKANNT', vorschlag}]` zurück + UI-Banner (rot, nicht dismissbar ohne Bestätigung).
   - Mindestens (b) ist Pflicht; (a) empfohlen. Stille 0 ist danach verboten (wenn EP=0, dann nur mit expliziter Warnung).
4. Kumulatives Panel bauen (Lesesicht, keine neue Buchungslogik):
   - Pro Projekt: Vorrechnungen (N1, L1/F1, L2, F2 mit netto/Steuer/brutto), Zahlungen (`bezahlt_betrag` aus Matching), Rest (`brutto − bezahlt`), Kumulativ-Check F1+F2=L2 (netto 1300+1500=2800 sichtbar machen).
   - Datenquellen: `dokumente` + `rechnung_verrechnungen` (read-only join) + `zahlung_zuordnungen`. Keine neuen Tabellen ohne Not (wenn nötig, nur View/Query-Funktion).
5. VOB-Konformität im UI-Text: Aufmaß nach §14 VOB/B (prüfbar, OZ-Reihenfolge aus LV, Mengenberechnung beifügen). Warnungstext soll „Prüfbarkeit (§14 VOB/B)" nennen.
6. TEST-BAU-01-Test: F1 (1300 netto) + F2 (1500 netto) = L2 (2800 netto) wird im Panel als kumulativ KORREKT angezeigt; Tippfehler-OZ löst Warnung aus.

## Testbefehle
```powershell
npm test -- tests/j10-aufmass.test.js
# Erwartung: Tippfehler-OZ -> warnings.length>0 (kein stiller EP=0); F1+F2=L2 kumulativ sichtbar
```

## Akzeptanz (muss erfüllt sein)
- [ ] Tippfehler-OZ warnt hart (Banner + `warnings[]`), kein stiller `einheitspreis: 0` mehr.
- [ ] Kumulative Sicht zeigt Vorrechnungen/Zahlungen/Rest; F1+F2=L2 (1300+1500=2800 netto) sichtbar verifiziert.
- [ ] §14-VOB/B-Hinweis (Prüfbarkeit, OZ-Reihenfolge) im UI vorhanden.
- [ ] `npm test` grün, Scope eingehalten.

## Quellen (alle abgerufen 2026-10-08)
- Bauprofessor Aufmaß (§14 VOB/B: prüfbar, OZ-Reihenfolge aus LV, gemeinsames Aufmaß §14 Abs.2, kumulative Abrechnung): https://www.bauprofessor.de/aufmass
- Bauprofessor Abrechnung von Bauleistungen (Kumulation von Abschlagszahlungen): https://www.bauprofessor.de/abrechnung-von-bauleistungen
- Bauprofessor Schlussrechnung (Abschläge abziehen, kumulative Fortschreibung): https://www.bauprofessor.de/schlussrechnung
- baufaktura Aufmaß-Module (Basisaufmaß/Aufmaß-Erweiterung als Referenz): https://baufaktura.de/module/basisaufmass/ + https://baufaktura.de/module/aufmass-erweiterung/
- Normquelle VOB/B §14 Abrechnung (prüfbar, Reihenfolge einhalten, Belege beifügen, gemeinsam feststellen): https://dejure.org/gesetze/VOB-B/14.html

## PR-Anforderung
- PR von `jules/j10-aufmass`, Titel `[J10] 1-Welt-Aufmaß: OZ-Warnung + Kumulationssicht`.
- Body: Tippfehler-Repro-Log (vorher still 0 / nachher Warnung), F1+F2=L2-Screenshot/Log, Base-SHA.
- Keine Commits auf `main`, kein Push ohne Freigabe.
