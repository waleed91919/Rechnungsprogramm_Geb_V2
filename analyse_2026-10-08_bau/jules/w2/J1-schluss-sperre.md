# J1 — Doppel-Schluss-Sperre: UNIQUE pro Projekt + „Schluss verrechnet alle“-Check

> Copy-Paste-Prompt für Jules. Read-only-Regel: KEINE Produktänderung außerhalb dieses Tickets, KEINE Commits ohne Aufforderung, KEINE prod-DB. Nur Branch unten verwenden.

## Titel
J1 Schlussrechnungs-Sperre: genau 1 Schlussrechnung pro Projekt + Voll-Verrechnungs-Check

## Branch
`jules/j1-schluss-sperre`

## Base
- Repo: `C:\Users\walee\Desktop\server\Rechnungsprogramm_Geb_V2`
- Base: `bau-p0p1-base@194cd83` + J0 gemergt + rebased
- Datum: 2026-10-08
- Snapshot-Kontext TEST-BAU-01: Angebot 2500/475/2975, N1 300/57/357, L1/F1 1300/247/1547, L2 2800/532/3332, F2 1500/285/1785, Teilzahlung 1500 → Rest 47, Schluss 0.

## Ziel
Verhindere eine 2. Schlussrechnung pro Projekt (DB-Constraint + Validierung) und stelle sicher, dass eine Schlussrechnung ALLE Vorrechnungen verrechnet („Schluss verrechnet alle"). `calculateProjektUmsatz` nimmt heute nur die ERSTE Schlussrechnung (`project-calculations.js:29-37`) — eine zweite würde Umsatz/Rest korrumpieren.

## Scope (darfst du anfassen)
- `db/schema/documents_schema.js:61-69` — Tabelle `rechnung_verrechnungen` (aktuelle_rechnung_id, vorherige_rechnung_id, abzugsbeträge)
- `db/schema/documents_schema.js:71-89` — `invoice_cumulative_states` (billing_type FINAL, invoice_id UNIQUE)
- `db/schema/index.js:1474-1476` — existierender Paar-UNIQUE `idx_verrechnungen_paar_unique` (Vorbild für neuen Index)
- `db/repositories/document_repo.js:16,238,384,403,510` — Verrechnungs-Lesen/Löschen/Guard/Insert
- `js/projects/project-calculations.js:29-37` — `.find(SCHLUSSRECHNUNG)` + MAX-Fallback (nur lesen/verstehen, ggf. Warnkommentar)
- Validierungsstelle für Rechnungs-Erstellung (dort wo `rechnungsart`/`typ` = SCHLUSSRECHNUNG gesetzt wird, z. B. InvoiceController / CumulativeBillingController) + Migration für neuen UNIQUE-Index
- Tests: `tests/` (neue Datei `tests/j1-schluss-sperre.test.js` erlaubt)

## Out-of-scope (VERBOTEN)
- `db/repositories/banking/reconciliation_repo.js` (gehört J2)
- `js/dashboard/dashboard-actions.js` Mahn-/Bulk-Teil (gehört J2/J11 — nur lesen, nicht ändern)
- `db/repositories/gaeb/*`, `db/repositories/aufmass_repo.js` (J9/J10)
- `js/settings/settings-mahnung.js`, SMTP/`main/email.js` (J11)
- Keine Änderung an TEST-BAU-01-Fixture-Werten, keine prod-DB.

## Schritte
1. Rebase: `git fetch origin; git rebase origin/bau-p0p1-base` (bzw. angegebener J0-Stand). Bei Konflikt in `rechnung_verrechnungen`-Migration: J1 gewinnt (siehe `w2/README.md`).
2. Analyse: Zeige, dass heute kein `UNIQUE(projektId, SCHLUSSRECHNUNG)` existiert (Grep über `db/schema/documents_schema.js` + `db/schema/index.js`). Dokumentiere Fundstelle im PR-Body.
3. Migration (idempotent, try/catch-Muster wie `db/schema/index.js`):
   - Neuer UNIQUE-Index, z. B. `idx_dokumente_projekt_schluss_unique ON dokumente(projektId) WHERE rechnungsart='SCHLUSSRECHNUNG'` (SQLite: partieller Index; falls `typ`-Spalte relevant, beide Varianten abdecken) ODER funktionaler Guard über `invoice_cumulative_states(billing_type='FINAL', project_id UNIQUE)`. Wähle EINE Variante, begründe im Code-Kommentar.
   - Vorab-Deduplizierung: Migration muss bei existierenden Doppel-Schluss tolerant fehlschlagen mit klarer Fehlermeldung (kein stiller Datenverlust).
4. Validierung in der Erstellungs-Logik (vor INSERT): Wenn für `projektId` bereits eine nicht-stornierte SCHLUSSRECHNUNG existiert → `throw new Error('... genau eine Schlussrechnung pro Projekt ...')`. Stornierte (`status='Storniert'`) zählen NICHT.
5. „Schluss verrechnet alle“-Check: Beim Speichern einer SCHLUSSRECHNUNG prüfen, dass `rechnung_verrechnungen`-Zeilen ALLE nicht-stornierten Vorrechnungen (ABSCHLAG/TEILSCHLUSS) desselben Projekts abdecken. Falls nein → harter Fehler mit Liste fehlender `nr`s. Nutze `document_repo.js:384` (`checkUsedStmt`) als Vorbild.
6. GoBD/Audit: Fehlerpfad muss über bestehenden Audit-Pfad laufen, kein Direkt-UPDATE an `dokumente` ohne `appendAuditLog`.
7. TEST-BAU-01 nachstellen (Seed oder Test): L1/F1, L2, F2, Teilzahlung 1500 → Schlussbetrag muss 0 sein. 2. Schluss-Versuch muss scheitern (UNIQUE + Validierung).

## Testbefehle
```powershell
npm test -- tests/j1-schluss-sperre.test.js
# Erwartung: 2. SCHLUSSRECHNUNG wirft; Schluss TEST-BAU-01 = 0 (brutto Rest 0, netto Rest 0)
node scripts/verify-test-bau-01.js  # falls vorhanden, sonst npm test
```

## Akzeptanz (muss erfüllt sein)
- [ ] 2. Schlussrechnung für dasselbe Projekt scheitert (DB-UNIQUE + App-Validierung, Fehlermeldung nennt Projekt + existierende Schluss-Nr).
- [ ] Schluss TEST-BAU-01 = 0 (nach L1/F1 1300/247/1547, L2 2800/532/3332, F2 1500/285/1785, Teilzahlung 1500 → Rest 47 VOR Schluss, 0 NACH Schluss).
- [ ] Schluss ohne vollständige Verrechnung wird abgewiesen (fehlende Vorrechnungen werden aufgelistet).
- [ ] Stornierte Schlussrechnung blockiert KEINE neue Schlussrechnung.
- [ ] `npm test` grün, keine Änderung außerhalb Scope.

## Quellen (alle abgerufen 2026-10-08)
- Bauprofessor Schlussrechnung (kumulativ, Abschläge abziehen, Prüfbarkeit §14 Abs.1): https://www.bauprofessor.de/schlussrechnung
- Bauprofessor Abschlagszahlung nach VOB (§16 Abs.1, 21-Tage-Fälligkeit): https://www.bauprofessor.de/abschlagszahlung-vob
- Bauprofessor Aufmaß (Grundlage Abrechnung, §14 VOB/B): https://www.bauprofessor.de/aufmass
- baufaktura Abrechnung/Kalkulation Kern + GAEB-Import als Referenz (kein Doppel-Schluss): https://baufaktura.de/ + https://baufaktura.de/schnittstellen/gaeb-import/
- Normquelle VOB/B §14 Abrechnung (prüfbar, Reihenfolge, Belege) + §16 Zahlung: https://dejure.org/gesetze/VOB-B/14.html , https://dejure.org/gesetze/VOB-B/16.html

## PR-Anforderung
- PR von `jules/j1-schluss-sperre` gegen Rebase-Base, Titel `[J1] Schluss-Sperre: UNIQUE + Voll-Verrechnung`.
- Body: Base-SHA, TEST-BAU-01-Nachweis (Schluss=0), Doppel-Schluss-Fehlerlog, Migrations-SQL, Konfliktcheck gegen `w2/README.md` (rechnung_verrechnungen gehört J1).
- Keine Commits auf `main`, kein Push ohne Freigabe.
