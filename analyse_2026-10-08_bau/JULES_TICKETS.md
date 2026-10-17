# Jules-Tickets — P0 + P1 (Bau-Verkauf, `main@194cd83`)

> Regel: 1 Ticket = 1 Branch/PR, klein, mit Akzeptanz. Basis erst einfrieren (dirty worktree sichern/cleanen), dann J0. Danach P0-Gruppe parallel, P1-Gruppe parallel. Nie prod-`database.sqlite`, nur `:memory:`/`mkdtemp` + TEST-BAU-01 (2.500/N1 300/L1 1.300/L2 2.800/Rest 47/Schluss 0). Details: `S2_MODULGAP.md`, `S3_ROADMAP.md`.

## P0 — Blocker (kein Verkauf davor)
- **J0 Basis + data_integrity-Fix:** `sec48b_geprueft`-Crash (`data_integrity.test.js:441-454`) + Soft-Delete-Filter (`:576-591`) fixen. Akzeptanz: `data_integrity` 38/38 grün via Electron-Run. Danach erst Rest. (Blockt alles.)
- **J1 Doppel-Schluss-Sperre:** UNIQUE pro Projekt + „Schluss verrechnet alle Abschläge“-Check. Akzeptanz: 2. Schluss auf gleichen Vorgänger scheitert; TEST-BAU-01 Schluss = 0.
- **J2 Bezahlt-Link:** `markAsPaid` (Status) ↔ `applyPaymentMatching` (Buchung) verlinken + Restprüfung statt €0,00-Label. Akzeptanz: Teilzahlung 1.500 auf F1 → Rest 47, nicht „bezahlt“.
- **J3 Tote UI ehrlich:** `main.js:68` (Neue Rechnung), `preload.js:18` (Entsperren), Bulk-Mahn-Toast (`dashboard-actions.js`), Artikel aus `EXPERIMENTAL_VIEWS` in Kern (`navigation.js:177-180`). Akzeptanz: kein toter Klick, kein falscher „versendet“-Toast.
- **J4 Leitweg-Frühcheck:** B2G-Leitweg/BT-10-Prüfung in Kunde/Beleg statt `throw` beim Export. Akzeptanz: Fehler erscheint im Formular, Export mit/ohne Leitweg korrekt.
- **J5 E-Nachweis:** 1 dokumentierter KoSIT-Schematron- + VeraPDF/Mustang-Lauf für Demo-Rechnung (Sicht=XML). Akzeptanz: Protokoll liegt bei, keine „rechtssicher“-Sprache.
- J1–J4 parallel nach J0; J5 parallel möglich; **J6 Demo-Proof** zuletzt: TEST-BAU-01 L1→L2→Schluss skriptbasiert durchspielbar.

## P1 — verkaufsentscheidend (danach bepreisen)
- **J7 AB-Dokument** (Nr/PDF/Speicherung; heute `project-document-flow.js:131-134` Etikett). **J8 Kunden-Lieferschein** (heute nur Lieferanten-Fotos). **J9 GAEB-Generator** Entwurf→Positionen (heute nur `gaeb_linking.js`-Link). **J10 1-Welt-Aufmaß** (OZ-FK/Warnung statt stiller 0, `aufmass_repo.js:167-232`) + kumulative Sicht (Vorrechnungen/Zahlungen/Rest). **J11 Mahn-Nachweis + Fristenautomatik** (SMTP-Protokoll, 21-Tage/12-Werktage). **J12 Musterbrief-Verlinkung** (18 Briefe aus S1, nur Verlinkung). **J13 Gutschrift + Nachtrag→LV** (Minderung ohne Voll-Storno; `N:id:POS:id` → `projekt_positionen`).
- J7/J8/J13 (neue Dok-Typen) parallel; J9/J10/J11/J12 parallel; alle erst nach P0.

## Wellenplan für 15 Slots (nicht alle 14 auf einmal)

> Base zuerst einfrieren: dirty Worktree sichern, cleanen Branch `bau-p0p1-base@194cd83`. 1 Slot immer frei lassen für Rebase/Fixes. Regel: Welle 2 erst nach J0-Merge (rebasen), Welle 3 erst nach J1+J2-Merge.

- **Welle 1 (5 Slots, datei-disjunkt, sofort):** J0 (data_integrity) + J3 (tote UI: `main.js`, `preload.js`, `navigation.js`) + J4 (Leitweg-Check: einvoice/kunden) + J5 (nur Doku/Nachweis, kein Code) + J12 (Briefe-Verlinkung, additiv). Keine Schema-Konflikte untereinander.
- **Welle 2 (5 Slots, nach J0-Merge + Rebase):** J1 (Schluss-Sperre/Schema) + J2 (Bezahlt-Link) + J9 (GAEB-Generator) + J10 (Aufmaß) + J11 (Mahnung/Fristen). J1 vs J2 vs J9 berühren verschiedene Repos — täglich rebasen, `rechnung_verrechnungen` nur J1 anfasst.
- **Welle 3 (4 Slots, nach J1+J2-Merge + Rebase):** J7 (AB) + J8 (LS) + J13 (Gutschrift+Nachtrag→LV) + J6 (Demo-Proof zuletzt, braucht alle). Neue Dok-Typen teilen sich Nummernkreis — nacheinander mergen (J7→J8→J13), nicht gleichzeitig mergen.
- **Konflikt-Regel:** gleiche Datei = nie gleichzeitig mergen (J1/J7/J8/J13: Nummern/`dokumente`; J2/J11: `dashboard-actions`/Banking). Jules-Prompt pro Ticket: Scope-Dateien + „keine anderen Dateien anfassen“ + Testbefehl + TEST-BAU-01-Akzeptanz.
