# J11 — Mahnung mit Fristenautomatik: Versandnachweis + VOB-Fristen

> Copy-Paste-Prompt für Jules. Read-only-Regel: KEINE Produktänderung außerhalb dieses Tickets, KEINE Commits ohne Aufforderung, KEINE prod-DB. Nur Branch unten verwenden.

## Titel
J11 Mahnwesen: echter Versandnachweis (SMTP-Protokoll statt Toast) + VOB-Fristenautomatik

## Branch
`jules/j11-mahnung-fristen`

## Base
- Repo: `C:\Users\walee\Desktop\server\Rechnungsprogramm_Geb_V2`
- Base: `bau-p0p1-base@194cd83` + J0 gemergt + rebased
- Datum: 2026-10-08
- Snapshot-Kontext TEST-BAU-01: F2 1500/285/1785 mit Teilzahlung 1500 → Rest 47 als Mahn-Kandidat (Überfällig-Simulation).

## Ziel
Heute ist Mahn-Versand nur ein Toast (`dashboard-actions.js:95-112`: „… werden generiert und versendet…" per `setTimeout`, KEIN SMTP-Aufruf, KEIN Historieneintrag). Und VOB-Fristen (21-Tage Abschlag, 30/60-Tage Schluss, 12-Werktage-Einreichung) sind nirgends sichtbar. J11 macht Mahnungen belegbar (SMTP-Protokoll in Historie) + Fristen automatisch sichtbar.

## Scope (darfst du anfassen)
- `js/dashboard/dashboard-actions.js:95-112` — Bulk `action==='dunning'` (Toast-Simulation → ersetzen durch echten Versandpfad; J2-Block Z.66-94 NICHT anfassen)
- `js/settings/settings-mahnung.js:2-40` — `generateMahnungPdf` (Überfällig- + isLocked-Guard), `:50-80` `confirmMahnungLevel` (Stufen/Gebühren), `:150-193` Speichern
- `db/schema/core_schema.js` — `email_versandhistorie` (`beleg_typ MAHNUNG`, `mahnstufe`, Versandstatus) — Versandnachweis-Tabelle
- `main/email.js` (Beleg-Versand, `sendBeleg`) + SMTP-Settings `js/settings/settings-smtp.js` — Anbindung Mahnversand
- Mahn-UI (Fristenbadges: „fällig seit X Tagen", „VOB 21-Tage / 30-Tage", Stufe 1-3) + Tests `tests/j11-mahnung-fristen.test.js`

## Out-of-scope (VERBOTEN)
- `rechnung_verrechnungen`/Schluss-UNIQUE (J1), `applyPaymentMatching`/Bezahlt-Logik (J2 — nur lesen), GAEB (J9), Aufmaß-Merge (J10)
- Gebühren-/Steuerlogik ändern (nur anzeigen); keine prod-DB, keine echten E-Mails (Test-SMTP/Mock).

## Schritte
1. Rebase: `git fetch origin; git rebase origin/bau-p0p1-base`. Konflikt-Regel: `dashboard-actions.js` nur Z.95-112 (dunning) anfassen; paid-Block Z.66-94 gehört J2 (siehe `w2/README.md`).
2. Nachweis: Zitiere Toast-Simulation Z.102-110 (kein `api.sendMail`/`sendBeleg`-Call). In PR-Body aufnehmen.
3. Versandnachweis implementieren:
   - Bulk- und Einzel-Mahnung rufen echten Pfad (`window.api.sendBeleg` o. ä. via `main/email.js`) mit Mahn-PDF + `email_text_mahnung`-Template.
   - Jeder Versuch schreibt `email_versandhistorie` (Empfänger, `beleg_typ='MAHNUNG'`, `mahnstufe`, Timestamp, SMTP-Status/Fehler). Erfolg NUR bei SMTP-OK als „versendet" melden; Fehler → Error-Toast + Historie `FEHLER`.
   - `mahnungLevel/mahnungDatum/mahnungGebuehr` (`documents_schema.js:23-25`) + GoBD-Statuspfad (`document_repo.js` schmaler Pfad) weiter nutzen.
4. VOB-Fristenautomatik (Anzeige + Berechnung, keine Rechtsberatung):
   - Abschlag: fällig 21 Kalendertage nach Zugang (§16 Abs.1 Nr.3) → Badge „Abschlag fällig in X Tagen / überfällig seit X".
   - Schluss: fällig spätestens 30 Tage (max. 60 bei Vereinbarung) nach Zugang (§16 Abs.3 Nr.1) → Badge + „unbestrittenes Guthaben sofort als Abschlag zahlen"-Hinweis.
   - Einreichung: 12 Werktage nach Fertigstellung (≤3 Monate Bauzeit, +6 Werktage je weitere 3 Monate, §14 Abs.3) → Hinweis in Schluss-View.
   - Verzug: automatisch 30 Tage nach Zugang ohne Mahnung (§16 Abs.5 Nr.3 / §286 Abs.3 BGB) → Status „Überfällig" daraus ableiten, Mahnstufe vorschlagen.
5. TEST-BAU-01-Demo: F2-Rest 47 als überfällig simulieren (faellig-Datum zurücksetzen) → Mahnstufe 1 → Versand(Mock-SMTP) → Historieneintrag prüfen.
6. Kein Spam: Bulk nur für `status='Überfällig'`, Doppelversand-Schutz (gleiche Stufe + gleicher Tag → Confirm).

## Testbefehle
```powershell
npm test -- tests/j11-mahnung-fristen.test.js
# Erwartung: Mahnversuch schreibt email_versandhistorie (MAHNUNG + Stufe); Fristenbadges 21-Tage/30-Tage berechnet; Toast-Simulation entfernt
```

## Akzeptanz (muss erfüllt sein)
- [ ] Jeder Mahn-Versand ist in der Historie belegt (Empfänger, Stufe, SMTP-Status) — kein reiner Toast mehr.
- [ ] VOB-Fristen sichtbar: 21-Tage Abschlag, 30(-60)-Tage Schluss, 12-Werktage-Einreichung, 30-Tage-Autoverzug.
- [ ] Fehlversand (SMTP-Fehler) wird als Fehler protokolliert + angezeigt (kein Fake-„erfolgreich versendet").
- [ ] J2-Block (`dashboard-actions.js:66-94`) unverändert; `npm test` grün.

## Quellen (alle abgerufen 2026-10-08)
- Bauprofessor Abschlagszahlung nach VOB (21 Tage §16 Abs.1 Nr.3, Verzug, Nachfrist): https://www.bauprofessor.de/abschlagszahlung-vob
- Bauprofessor Mahnung zur Zahlung (Frist setzen, Zugang nachweisen, VOB §16 / BGB §286): https://www.bauprofessor.de/mahnung
- Bauprofessor Zahlungsverzug beim VOB-Vertrag (30 Kalendertage Auto-Verzug, 60-Tage-Ausnahme): https://www.bauprofessor.de/zahlungsverzug-vob-vertrag
- Bauprofessor Schlussrechnung (Fristen §14 Abs.3: 12 Werktage +6 je 3 Monate): https://www.bauprofessor.de/schlussrechnung
- baufaktura E-Mail-Modul (Referenz: E-Mail-Versand aus Abrechnung): https://baufaktura.de/module/e-mail/
- Normquelle VOB/B §16 Zahlung + §14 Abrechnung (Fristen, Prüfbarkeit): https://dejure.org/gesetze/VOB-B/16.html , https://dejure.org/gesetze/VOB-B/14.html

## PR-Anforderung
- PR von `jules/j11-mahnung-fristen`, Titel `[J11] Mahnung: Versandnachweis + VOB-Fristen`.
- Body: Vorher-Toast-Zitat vs. Nachher-Historien-Eintrag (Screenshot/Log), Fristenbadge-Screenshot, Base-SHA, J2-Entkopplungsnachweis (paid-Block unberührt).
- Keine Commits auf `main`, kein Push ohne Freigabe.
