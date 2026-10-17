# J9 — GAEB-Generator: Entwurf→Positionen-Button statt nur Link

> Copy-Paste-Prompt für Jules. Read-only-Regel: KEINE Produktänderung außerhalb dieses Tickets, KEINE Commits ohne Aufforderung, KEINE prod-DB. Nur Branch unten verwenden.

## Titel
J9 GAEB X83→Angebot-Generator: Positionen aus Draft übernehmen (Button), Link erhalten

## Branch
`jules/j9-gaeb-generator`

## Base
- Repo: `C:\Users\walee\Desktop\server\Rechnungsprogramm_Geb_V2`
- Base: `bau-p0p1-base@194cd83` + J0 gemergt + rebased
- Datum: 2026-10-08
- Snapshot-Kontext TEST-BAU-01: Angebot 2500/475/2975 (Referenz-LV für Generator-Test).

## Ziel
Heute legt `linkImportToAngebot` NUR eine Referenzzeile an (`gaeb_import_angebote`), erzeugt aber KEINE Positionen aus `gaeb_items`/`tender_drafts` in `dokumente/positionen`. Es existiert KEIN `createAngebotFromDraft`. J9 baut den fehlenden Generator: X83→Draft→„Positionen ins Angebot übernehmen"-Button, Link bleibt erhalten (Löschschutz intakt).

## Scope (darfst du anfassen)
- `db/repositories/gaeb/gaeb_linking.js:10-43` — `linkImportToAngebot` (nur Link, kein Positions-Copy — erweitern, nicht brechen)
- `db/repositories/gaeb/gaeb_linking.js:58-95` — `getLinkedAngebote`/`isImportLinked` (Lesepfad, erhalten)
- `db/repositories/gaeb/gaeb_linking.js:109-136` — `deleteX83Import` (Verknüpfungs-/Löschschutz, muss grün bleiben)
- GAEB-Schema (`db/schema/gaeb_schema.js`: `gaeb_imports/categories/items` mit `linked_position_id`, `tender_drafts` + UNIQUE(import,version), `tender_item_prices` + UNIQUE(draft,item), Trigger Typzwang) — nur lesen + ggf. neue Generator-Funktion im selben Repository-Stil
- UI: GAEB-Import-View (Button „Positionen ins Angebot übernehmen") + Angebot-Editor (Mengen/Preise sichtbar)
- Neue Funktion `createAngebotFromDraft(db, importId, angebotId|neu)` + Tests `tests/j9-gaeb-generator.test.js`

## Out-of-scope (VERBOTEN)
- `rechnung_verrechnungen`/Schluss-UNIQUE (J1), Zahlungs-/Matching-Logik (J2), `aufmass_repo.js` (J10), Mahnung/SMTP (J11)
- Bestehenden Link-Mechanismus entfernen oder `deleteX83Import`-Schutz aufweichen — VERBOTEN.
- Keine prod-DB, keine X83-Fixture mit Echtdaten (synthetisches Minimal-X83 verwenden).

## Schritte
1. Rebase: `git fetch origin; git rebase origin/bau-p0p1-base`. Bei GAEB-Schema-Konflikten: nur additiv erweitern (keine Spalten umbenennen).
2. Nachweis: Grep, dass kein `createAngebotFromDraft` existiert; zitiere `gaeb_linking.js:30-35` (nur INSERT in `gaeb_import_angebote`). In PR-Body aufnehmen.
3. Generator implementieren `createAngebotFromDraft(db, {importId, draftVersion?, angebotId?})`:
   - Liest `gaeb_items` (+ `tender_item_prices` falls Draft-Version gewählt) für `importId`.
   - Erzeugt/aktualisiert `dokumente(type='angebot')` + `positionen`-Zeilen (OZ-Code, Menge, Einheit, EP aus Bieterangabe; `is_qty_tbd`/`is_price_missing` → 0 mit Flag, nicht still unterschlagen).
   - Ruft danach `linkImportToAngebot(db, importId, angebotId, 'generator:v1')` — Link bleibt Pflicht.
   - Idempotenz: Zweitlauf mit gleicher Draft-Version erzeugt KEINE Duplikate (Grep UNIQUE(import,version) beachten; ggf. `linked_position_id` setzen).
4. UI-Button im GAEB-Import-Detail: „Positionen ins Angebot übernehmen (Draft vX)" → Erfolgsmeldung mit Positionszähler + Link zum Angebot. Reiner Link-Button bleibt als Sekundäraktion.
5. Löschschutz-Regression: `deleteX83Import` muss nach Generator-Lauf weiterhin blocken (verknüpft + `linked_position_id` gesetzt).
6. TEST-BAU-01-Plausibilität: Generator-Lauf mit synthetischem X83 (Summe netto 2500 als Smoke-Test ok, keine Pflicht auf Cent).

## Testbefehle
```powershell
npm test -- tests/j9-gaeb-generator.test.js
# Erwartung: X83->Draft->Positionen im Angebot vorhanden; Link in gaeb_import_angebote vorhanden; deleteX83Import blockt; Zweitlauf ohne Duplikate
```

## Akzeptanz (muss erfüllt sein)
- [ ] X83→Draft→„Positionen übernehmen" legt `positionen`-Zeilen im Angebot an (OZ/Menge/EP sichtbar).
- [ ] Link in `gaeb_import_angebote` bleibt erhalten (Generator ruft `linkImportToAngebot`).
- [ ] `deleteX83Import` blockt nach Generator-Lauf (Verknüpfungsschutz intakt).
- [ ] Zweitlauf idempotent (keine Positions-Duplikate).
- [ ] `npm test` grün, Scope eingehalten.

## Quellen (alle abgerufen 2026-10-08)
- baufaktura GAEB-Import (Referenz: Ausschreibung „sofort gebrauchsfertig übertragen", Formate DA81-86/90/2000/XML): https://baufaktura.de/schnittstellen/gaeb-import/
- baufaktura Startseite (Abrechnung/Kalkulation als Kernstück): https://baufaktura.de/
- Bauprofessor Aufmaß (OZ-Bezug, LV-Ordnungszahlen §14): https://www.bauprofessor.de/aufmass
- Bauprofessor Schlussrechnung (§14 Abs.1: Reihenfolge/Bezeichnungen aus LV einhalten): https://www.bauprofessor.de/schlussrechnung
- Normquelle VOB/B §14 Abrechnung (prüfbar, Mengenberechnungen/Zeichnungen beifügen): https://dejure.org/gesetze/VOB-B/14.html

## PR-Anforderung
- PR von `jules/j9-gaeb-generator`, Titel `[J9] GAEB-Generator: Draft→Positionen + Link-Erhalt`.
- Body: „Kein Generator"-Grep-Nachweis, Generator-Signatur, Positionszähler-Screenshot/Log, Löschschutz-Testlog, Base-SHA.
- Keine Commits auf `main`, kein Push ohne Freigabe.
