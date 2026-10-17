# J4 — B2G/BT-10-Leitweg-Frühcheck in Kunde/Beleg (statt throw beim Export)

> Copy-Paste-Prompt für Jules. Snapshot: Repo `C:\Users\walee\Desktop\server\Rechnungsprogramm_Geb_V2`, Base-Branch `bau-p0p1-base@194cd83` (lokal aus `main@194cd83`, 2026-10-08). Nach J0-Merge rebasen. Keine prod-DB.

**Titel:** J4 Leitweg-Frühcheck: B2G/BT-10-Fehler im Formular, nicht erst beim Export
**Branch-Name:** `jules/j4-leitweg-fruehcheck`
**Base:** `bau-p0p1-base@194cd83` (nach J0-Merge: rebasen)
**Ziel:** B2G ohne/mit falscher Leitweg-ID scheitert sichtbar im Kunden- und Rechnungsformular; Export-`throw` bleibt nur letzte Sicherung.

## Scope-Dateien (darf anfassen)
- `js/einvoice/einvoice-validation.js:27-75` (`validateLeitwegId`), `:136-146` (`validateForEN16931` B2G-Block) — wiederverwenden, nicht neu erfinden; `computeLeitwegIdChecksum` unverändert
- `js/kunden.js:121,140,196,215-218` — Pflicht-Check verschärfen: bei `customer_type==='B2G'` zusätzlich Checksummen-Validierung + Inline-Fehler am Feld `kunde-leitweg-id` (rot + Text aus `validateLeitwegId().message`), Speichern blockieren
- `js/editor/events/field-listeners.js:68-91` + `js/editor/events/form-modes.js:268-360` — Leitweg-Feld bei B2G einblenden/pflichtmarkieren, Live-Validierung bei Eingabe/Kundenwechsel
- `js/editor/export/editor-export.js:196-206` + `js/editor/save/editor-save-rechnung.js:60` — vor Export/Speichern `validateForEN16931()` aufrufen und Fehlerliste im Formular rendern (kein nackter `throw` aus `js/einvoice/einvoice-viewer.js:226-241`)
- `js/einvoice/einvoice-viewer.js:226-241` — `throw` als letzte Sicherung behalten, Meldungstext um Feldhinweis ergänzen („im Belegformular unter Leitweg-ID korrigieren")

Belege S2 §2-Zeile 45, §3-Punkt 8; S3 §2-P0 „B2G-Leitweg-Frühcheck".

## Out-of-scope (verboten)
- Keine neue E-Rechnungs-Erzeugung, kein KoSIT-/Mustang-Lauf (J5), keine `db.js`/`schema.js`-Änderung, keine B2B-Pflichtverschärfung über Bestand hinaus, keine `database.sqlite`, keine Dependencies.

## Schritte (nummeriert)
1. `git checkout bau-p0p1-base && git checkout -b jules/j4-leitweg-fruehcheck` (nach J0: rebasen).
2. `js/kunden.js` — nach Zeile 215: bei B2G `EInvoiceValidation.validateLeitwegId(leitweg_id)` aufrufen; bei `!valid` Toast + Feld-Rahmen rot + Speichern `return`. Gültige ID (z. B. Test `04011-00000-30`-Muster, Prüfziffer via `computeLeitwegIdChecksum`) speichert normal.
3. Belegformular — `field-listeners.js`/`form-modes.js`: B2G-Kunde → `rechnung-leitweg-id` sichtbar + `required`-Stern (`rechnung-leitweg-required` einblenden); bei Änderung Live-Check mit gleicher Message.
4. `editor-export.js`/`editor-save-rechnung.js` — vor XML-Build `validateForEN16931(invoice, customer, seller)`; bei `errors.length>0` Fehlerbox im Modal (Liste, BT-10-Eintrag oben), kein Export-`throw` als Erstkontakt.
5. `einvoice-viewer.js:226-241` unangetastete Logik lassen, nur Fehlermeldung um „(im Formular Feld Leitweg-ID / BT-10 prüfen)" ergänzen.
6. Tests: `node --test tests/erechnung_belegfixierung.test.js tests/zugferd.test.js tests/invoice_controller.test.js` + manueller Matrix-Check: B2G ohne ID → Formularfehler; B2G falsche Prüfziffer → Formularfehler mit Erwartet-Hinweis; B2G gültig → Export ok; B2B ohne ID → kein Block.
7. TEST-BAU-01-Smoke: B2B-Kunde (Standard) L1 1300/247/1547 exportiert ohne Leitweg; auf B2G umgestellt → Formularfehler erscheint, Export blockiert im Formular.

## Exakte Testbefehle
```
node --test tests/erechnung_belegfixierung.test.js tests/zugferd.test.js tests/invoice_controller.test.js
```

## TEST-BAU-01-Akzeptanz
- Angebot 2500/475/2975, N1 300/57/357, L1/F1 1300/247/1547, L2 2800/532/3332, F2 1500/285/1785, Teilzahlung 1500 → Rest 47, Schluss 0 — Beträge unverändert; B2B-Export ohne Leitweg korrekt, B2G-Fehler im Formular sichtbar (kein Überraschungs-`throw`).

## Quellen (alle Zugriff 2026-10-08)
| # | URL | Aussage |
|---|---|---|
| 1 | https://www.e-rechnung.tools/ratgeber/leitweg-id | BT-10-Frühcheck-Maßstab (S2 §4.8) |
| 2 | https://de.wikipedia.org/wiki/Leitweg-ID | BT-10 = BuyerReference, KoSIT-Formatspezifikation, MOD 97-10 |
| 3 | https://www.bauprofessor.de/abrechnung-von-bauleistungen/ | Prüfbarkeit vor Fälligkeit — Fehler früh zeigen |
| 4 | https://github.com/itplr-kosit/validator-configuration-xrechnung | BR-DE-15: BT-10 muss übermittelt werden (Vorgängerbeleg) |
| 5 | https://baufaktura.de/anleitungen/baufaktura-e-rechnungen-erstellen | B2G-Flow besser — Formularführung als Maßstab |

## PR-Anforderung
- Kleiner Diff (Validation wiederverwendet, nur UI-Verdrahtung), Test-Output + 3 Screenshots (ohne/falsch/gültig) in PR, offene Punkte (Peppol-Transport, Landesportale) nennen.

## Summary (max. 15 Zeilen)
- B2G-Check aus Validation wiederverwendet.
- Fehler im Kunden- + Belegformular sichtbar.
- Export-throw nur letzte Sicherung.
- B2B unverändert ohne Block.
- Tests erechnung/zugferd/invoice grün.
- Keine Schema-/DB-Änderung.
