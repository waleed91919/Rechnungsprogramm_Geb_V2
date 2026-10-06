# MANUELLES TESTPROTOKOLL — W-Link (`main@791fb77f`, 2026-10-04)

> Grenze: Electron-UI in diesem Run nicht gestartet — unten Code-Walkthrough + Gegenproben, keine erfundenen Klicks/Zeiten/Screenshots. Fiktive Daten aus `plans/testen_das_app.txt` Kap. 8 (USt 19 %): TEST-KUNDE-01 / TEST-BAU-01 (P1 10×100, P2 5×200, P3 1×500 → 2.500/475/2.975); N1 2×150 (300/57/357); L1 1.300/1.547 (=F1); L2 2.800/3.332; F2 1.500/1.785; Teilzahlung 1.500 → Rest F1 47; Schluss 0; +5 %-Einbehalt (140 netto) nur Zusatzszenario. Isolierte Test-DB/`mkdtemp`, nie `database.sqlite`, kein Echt-Versand. Vorlage pro Schritt: Start/Button · Erwartung · Ergebnis/DB-Datei · Doppeleingaben · unklare Begriffe/Fehler · App-Feedback · Screenshot · Zeit · Status A–E · Beleg.

## Ablauf 1 — Angebot bis Projekt

| # | Schritt (Start/Button) | Erwartung | Ergebnis/Gegenprobe | Doppeleingaben | Begriffe/Fehler | Feedback | Screen | Zeit | St | Beleg |
|---|---|---|---|---|---|---|---|---|---|---|
| 1.1 | `nav-kunden` → Neu (`openKundeModal`) | TEST-KUNDE-01 gespeichert | offen — `kunden`-Row Reload | Adresse evtl. doppelt (Kunde+Projekt) | B2G/Leitweg erst Export | Toast+Liste | keiner (UI nicht gestartet) | n/a | B | `js/kunden.js:106` |
| 1.2 | `nav-angebote` → Neu, P1–P3 | editierbar, speichern/schließen/öffnen | offen — `dokumente`+`positionen` Reload | manuell ohne Artikelstamm | ENTWURF/VERSENDET/isLocked | Toast; Freeze-Guard | keiner | n/a | B | `editor-save.js:1-186` |
| 1.3 | PDF + Versand/Freigabe | PDF prüfbar, kein Echtversand | offen — `.pdf` + `email_versandhistorie` | — | Sichtseite≠XML; Platzhalter | Toast inkl. Platzhalter | keiner | n/a | C | `editor-export.js:16-38` |
| 1.4 | Version V1→V2, Annahme, Projekt | Version+Annahme+Projekt, Daten übernommen | offen — `parent_angebot_id`, `source_angebot_*`, Dedup | Projektkunde erneut? | „Projekt=Auftrag?“ | Toast/Throw Doppel | keiner | n/a | B/C | `AngebotController.js:274-459` |
| 1.5 | Auftragsbestätigung | echtes AB (Nr/PDF) | NEGATIV: fällt auf rechnung/angebot zurück | — | AUFTRAG-Etikett | gespeichert, falscher Typ | keiner | n/a | E | `project-document-flow.js:131-144` |
| 1.6 | GAEB X83→Draft→X84→Angebot→Projekt | durchgehend | Teil da; BRUCH: nur Link, kein Generator | LV erneut tippen | Tender/Draft/Link | Link ok, kein Angebot | keiner | n/a | C/D | `gaeb_repository.js:628-662` |

## Ablauf 2 — Aufmaß bis Abschlagsrechnung

| # | Schritt | Erwartung | Ergebnis/Gegenprobe | Doppeleingaben | Begriffe/Fehler | Feedback | Screen | Zeit | St | Beleg |
|---|---|---|---|---|---|---|---|---|---|---|
| 2.1 | Projekt-Tab → Blatt/Zeilen, OZ zu P1/P2+N1 | L1 1.300/1.547 | offen — `mergeSchlussaufmass`-Return + Rows | Kunde im Projekt Pflicht (`MISSING_KUNDE`) | OZ/DRAFT/UPDATE vs CREATE | `EMPTY_AUFMASS`/`DOC_LOCKED` | keiner | n/a | B/C | `project-document-flow.js:50-55` |
| 2.2 | Nachtrag N1 + GENEHMIGT + Übernahme | 300 netto, einmalig | offen — Key `N:id:POS:id` + Reload | — | GENEHMIGT-Zwang | `EMPTY`/`NO_POSITIONS` | keiner | n/a | B | `project-document-flow.js:162-290` |
| 2.3 | Abschlag 1 (F1=L1) | 1.300/247/1.547 | offen — Datei+Rows | — | kumuliert vs. einzeln | Toast+Reload-Check | keiner | n/a | B | `project-document-flow.js:67-114` |
| 2.4 | Aufmaß 2 + Abschlag 2, Probe F1+F2=L2 | kein Doppelansatz | offen — `rechnung_verrechnungen` | — | Verrechnungen | `RELOAD_MISMATCH` möglich | keiner | n/a | B/C | Kap. 8-Probe; `:96-106` |

## Ablauf 3 — Zahlung bis Schlussrechnung

| # | Schritt | Erwartung | Ergebnis/Gegenprobe | Doppeleingaben | Begriffe/Fehler | Feedback | Screen | Zeit | St | Beleg |
|---|---|---|---|---|---|---|---|---|---|---|
| 3.1 | Teilzahlung 1.500 auf F1, Rest prüfen | Rest 47 (nicht „bezahlt“) | BRUCH im Code: nur Status, Label €0,00 | — | bezahlt vs. Zuordnung | „als bezahlt markiert“ | keiner | n/a | C | `InvoiceModel.js:56-66`; `dashboard.js:281` |
| 3.2 | Zuordnung + Rücknahme | Buchung+Storno mit Grund | offen — `zahlung_zuordnungen`-Rows | manuelle Auswahl | OPOS/Vorschlag | „verbucht/aufgehoben“ | keiner | n/a | B | `banking.js:400-418` |
| 3.3 | Mahnung Vorschau (ohne Versand) | Stufe 1–3 + Gebühr | offen — Felder + PDF; Bulk≠Versand | — | „muss gedruckt/isLocked“ | Fehler-Toast erst bei Verstoß; Bulk-Toast falsch | keiner | n/a | C | `settings-mahnung.js:13-23`; `dashboard.js:720-731` |
| 3.4 | Schluss (L2−F1−F2=0) + Vorgänger/Einbehalt | 0; 5 % separat | offen — Verrechnungs-Rows; Doppel-Schluss ungesperrt | — | Schluss vs. Abschlag | Toast | keiner | n/a | C | Kap. 8; Check fehlt |
| 3.5 | PDF vs. XML | Beträge identisch; B2G ok | offen — `.pdf`+`.xml` + Validator | Leitweg nachpflegen | BT-10/Sichtseite | `throw` ohne Leitweg; Platzhalter-Toast | keiner | n/a | C | `einvoice.js:513-528` |
| 3.6 | Backup + isoliert Restore | `mkdtemp`-Restore ok | hier nicht erneut (D:A 3/3 isoliert belegt) | — | — | — | keiner | n/a | B(hier)/A(D) | `backup.test.js` |

Abnahme-Check: Snapshot identisch? Nur Test-DBs? Alle URLs+Datum? Kein A ohne Lauf? Direkt vs. GAEB getrennt? Bezahlt vs. Zuordnung getrennt? PDF vs. XML verglichen? Backup isoliert? Keine Secrets/PII? → Details in `ENTSCHEIDUNGSBERICHT.md` + A/B/C/D.
