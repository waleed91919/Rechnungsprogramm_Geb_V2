# J2 — Bezahlt-Link: markAsPaid ↔ applyPaymentMatching verlinken + Restprüfung

> Copy-Paste-Prompt für Jules. Read-only-Regel: KEINE Produktänderung außerhalb dieses Tickets, KEINE Commits ohne Aufforderung, KEINE prod-DB. Nur Branch unten verwenden.

## Titel
J2 Zahlungs-Link: markAsPaid (Status-only) mit applyPaymentMatching (echte Buchung) verlinken + Restbetragsprüfung

## Branch
`jules/j2-bezahlt-link`

## Base
- Repo: `C:\Users\walee\Desktop\server\Rechnungsprogramm_Geb_V2`
- Base: `bau-p0p1-base@194cd83` + J0 gemergt + rebased
- Datum: 2026-10-08
- Snapshot-Kontext TEST-BAU-01: Angebot 2500/475/2975, N1 300/57/357, L1/F1 1300/247/1547, L2 2800/532/3332, F2 1500/285/1785, Teilzahlung 1500 → Rest 47, Schluss 0.

## Ziel
Heute existieren ZWEI Wahrheiten: `InvoiceModel.markAsPaid` setzt nur `status='Bezahlt'` (kein Geld gebucht), `applyPaymentMatching` bucht echtes Geld (`zahlung_zuordnungen` + `bezahlt_betrag/offener_betrag`). Folge: €0,00-Fehllabel / „Bezahlt" ohne Zahlungseingang möglich. J2 verlinkt beide Pfade und erzwingt eine Restprüfung.

## Scope (darfst du anfassen)
- `models/InvoiceModel.js:56-66` — `markAsPaid(doc)` (Status-only, schmaler Status-Pfad)
- `db/repositories/banking/reconciliation_repo.js:51-164` — `applyPaymentMatching(matches, options)` (echte Buchung: `zahlung_zuordnungen` 67-80, `bezahlt_betrag/offener_betrag/status` 93-119, Audit `ZAHLUNGSEINGANG` 121-132)
- `db/repositories/banking/reconciliation_repo.js:166-245` — `unmatchTransaction` (Entkopplung, Status-Rollback — als Referenz)
- `js/dashboard/dashboard-actions.js:66-94` — Bulk `action==='paid'` (setzt heute nur Status via `updateDocumentStatus`, KEINE Buchung → HIER entkoppeln/fixieren)
- UI-Label für Restbetrag/Status (nur Anzeige-String, z. B. `dashboard-table.js` Badge) + Tests `tests/j2-bezahlt-link.test.js`

## Out-of-scope (VERBOTEN)
- `db/schema/documents_schema.js` + `rechnung_verrechnungen`-Migration/UNIQUE (gehört J1 — nur lesen)
- `db/repositories/gaeb/*`, `db/repositories/aufmass_repo.js` (J9/J10)
- Mahn-Logik `js/settings/settings-mahnung.js` + `dashboard-actions.js:95-112` Dunning-Toast (gehört J11 — in J2 NICHT anfassen, nur entkoppeln: kein gemeinsamer Codeblock)
- Keine Änderung an TEST-BAU-01-Beträgen, keine prod-DB.

## Schritte
1. Rebase: `git fetch origin; git rebase origin/bau-p0p1-base`. Konflikt-Regel: `dashboard-actions.js` gehört J2 (paid-Pfad Z.66-94) vs. J11 (dunning-Pfad Z.95-112) — nur eigenen Block anfassen, fremden Block unverändert lassen (siehe `w2/README.md`).
2. Analyse: Belege im PR-Body, dass `markAsPaid` KEIN `zahlung_zuordnungen`-INSERT und KEIN `bezahlt_betrag`-Update macht, während `applyPaymentMatching` beides tut (93-119). Screenshot/Codezitat.
3. Fix-Design (eine Variante wählen + begründen):
   - (a) `markAsPaid` wird „ehrlich": warnt/blockt, wenn `offener_betrag > 0.009` und keine Zuordnung existiert (Restprüfung), ODER
   - (b) Dashboard-Bulk-paid ruft künftig `applyPaymentMatching`-fähigen Pfad (manuelle Zahlung als Zuordnung mit `differenz_grund='MANUELL'`) statt bloßem Status-Update.
   - Verboten: stilles „Bezahlt" bei offenem Rest. Erlaubt: `Teilweise bezahlt` mit korrektem `offener_betrag`.
4. Restprüfung implementieren: Vor Status `Bezahlt` gilt `neuOffen <= 0.009` (Toleranz wie `reconciliation_repo.js:101`). Bei Rest 47 (TEST-BAU-01 nach 1500-Teilzahlung auf F2 1785) DARF Status NICHT `Bezahlt` werden → muss `Teilweise bezahlt` + `offener_betrag=47.00` bleiben. €0,00-Label nur wenn `neuOffen<=0.009`.
5. Audit: Jede manuelle Bezahlt-Markierung → `appendAuditLog` (`ZAHLUNGSEINGANG` oder `MANUELL_BEZAHLT` mit Betrag/Grund). Kein Audit = Fail.
6. TEST-BAU-01-Test: F2 (brutto 1785) − Teilzahlung 1500 → Rest 47 → kein „Bezahlt", kein €0,00-Fehllabel. Nach Restzahlung 47 → `Bezahlt`, `offener_betrag=0`.

## Testbefehle
```powershell
npm test -- tests/j2-bezahlt-link.test.js
# Erwartung: Rest-47-Fall bleibt 'Teilweise bezahlt' mit offener_betrag 47; Vollzahlung -> 'Bezahlt'
```

## Akzeptanz (muss erfüllt sein)
- [ ] Rest-47-Fall korrekt: `status='Teilweise bezahlt'`, `offener_betrag=47.00`, KEIN €0,00-Label, KEIN `Bezahlt`.
- [ ] `markAsPaid` ohne Buchung ist entweder blockiert oder audit-protokolliert mit Warnung (kein stiller Status-Fake mehr).
- [ ] Dashboard-Bulk-paid erzeugt echte Buchungsdaten ODER verweist explizit auf Matching-Pfad (kein Status-only mehr).
- [ ] `unmatchTransaction`-Rollback bleibt konsistent (kein negativer `bezahlt_betrag`).
- [ ] `npm test` grün, J11-Block (`dunning` Z.95-112) unverändert.

## Quellen (alle abgerufen 2026-10-08)
- Bauprofessor Abschlagszahlung nach VOB (§16 Abs.1/5, Fälligkeit, Verzug): https://www.bauprofessor.de/abschlagszahlung-vob
- Bauprofessor Schlussrechnung (Abschläge abziehen, Restforderung): https://www.bauprofessor.de/schlussrechnung
- Bauprofessor Mahnung/Zahlung (Fälligkeit, Verzug ohne Mahnung nach 30 Tagen): https://www.bauprofessor.de/mahnung
- baufaktura Abrechnung als Kernstück (Referenz Soll-Verhalten): https://baufaktura.de/
- Normquelle VOB/B §16 Zahlung (Abs.1 Nr.3: 21 Tage; Abs.3: 30/60 Tage; Abs.5 Nr.3: Verzug): https://dejure.org/gesetze/VOB-B/16.html

## PR-Anforderung
- PR von `jules/j2-bezahlt-link`, Titel `[J2] Bezahlt-Link: Restprüfung + Matching-Verlinkung`.
- Body: Vorher/Nachher für Rest-47-Fall, Audit-Log-Auszug, Diff-Ausschnitt `dashboard-actions.js:66-94` (J11-Block unberührt), Base-SHA.
- Keine Commits auf `main`, kein Push ohne Freigabe.
