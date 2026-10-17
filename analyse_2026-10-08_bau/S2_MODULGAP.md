# S2 MODULGAP — W-Link vs. Bauunternehmen-Bedarf (Bau-Verkauf)

## 0. Snapshot-Kopf
- Pfad: `C:\Users\walee\Desktop\server\Rechnungsprogramm_Geb_V2`
- HEAD verifiziert: `main @ 194cd83102100353b12d2aa743954356c591db41` (08.10.2026, per `git rev-parse HEAD`)
- Worktree: `main`, **dirty** (u.a. `doc/changelog.md`, `preload.js`, `package.json`, `output/invoices/*`, `tests/test_results/*` modifiziert + 4 untracked) — alle Code-Belege unten gegen **HEAD-Dateien** per Grep/Read geprüft
- Methode: read-only Grep/Read, keine Code-/Schema-/Dependency-Änderung, keine Commits, keine `database.sqlite` berührt
- Vormaterial als Hypothesen: `analyse_2026-10-04/ABSCHLUSSBERICHT_AR.md` + `analyse_2026-10-04_run2/` — jede Lücken-Behauptung am neuen HEAD nachgelesen
- Status: B=vorhanden aber unvollständig, C=teilweise/irreführend, D=Platzhalter/nur Referenz, E=fehlt — **kein A** (nur eigener isolierter Lauf)
- Fokus-Flow: Angebot→Auftrag/AB→Aufmaß→Nachtrag→Abschlag→Schluss→Zahlung/Mahnung→Mängel/Abnahme→Bautagebuch→DATEV/E-Rechnung/GAEB

## 1. Summary
1. Rechenkern Angebot→Projekt→kumulativ→Storno→DATEV/E-Rechnung/GAEB-Datei bleibt **behalten**.
2. Größte Bau-Gaps: **keine echte AB** (Etikett), **kein Kunden-Lieferschein**, **keine Minderungs-Gutschrift**, **GAEB→Positionen fehlt**, **Nachtrag→LV fehlt**, **Doppel-Schluss möglich**.
3. Zahlungs-Bruch: `markAsPaid`=Status vs. `applyPaymentMatching`=Buchung, nicht verlinkt.
4. `Artikel` weiter in `EXPERIMENTAL_VIEWS` = Einstiegshürde; tote Buttons weiter tot (`main.js:68`, `preload.js:18`).
5. Aufmaß-Dualität: `mergeSchlussaufmass GROUP BY TRIM(oz_code)` ohne Positions-FK.
6. Neu gefordert: AB-Dok, Kunden-LS, Gutschrift-Generator, GAEB-Generator, Schluss-Sperre+Check, Paid-Link.
7. Ausblenden (nicht Bau-Kern): Objekte, Putzplan, Großhandel/IDS, SOKA — Code behalten, Nav ausblenden.
8. Opt-in: DauerRG, Zeiterfassung, Mängel, EFB/Kalkulation, Bautagebuch-Tabs, Sync/PWA, GAEB-Tender.
9. Wettbewerber (baufaktura/smarthandwerk) lösen AB+LS+Gutschrift als eigene LV-Arten, kumulativ/pauschal getrennt und Mahn-Versandnachweis besser.
10. Top-15 unten sind alle klein, kein Neubaumodul nötig außer 3 Generatoren (AB, LS, Gutschrift) + 1 Sperre.

## 2. Modul-Tabelle (Urteil | Modul | Befund | Beleg | Status)

| Urteil | Modul | Befund am HEAD 194cd83 | Beleg | Status |
|---|---|---|---|---|
| behalten | Kunden CRUD+CSV | Stammdaten vollständig | `js/kunden.js:216`, `js/modal-loader.js:33` | B |
| verbessern | Artikel/Stamm+DATANORM | CRUD+DATANORM da, aber Nav-versteckt | `js/navigation.js:177-180`, `js/artikel.js:112-468` | C |
| behalten | Angebot Freeze/Version/Annahme | Freeze+Snapshot+V1→V2→Projekt+Dedup stark | `controllers/AngebotController.js:199-459` | B |
| fehlt neu | Auftragsbestätigung (AB) | `AUFTRAG`-Option fällt auf `type='angebot'` — kein Nr/PDF | `js/projects/project-document-flow.js:131-134`, `js/modal-loader.js:20` | E |
| behalten | Projekte (=Auftragsordner) | Projekt als Auftrag-Ersatz mit Quelle+Dedup | `controllers/AngebotController.js:380-459` | B |
| fehlt neu | Kunden-Lieferschein | Nur `lieferscheine_digital` (Lieferanten-Foto/Hash), kein Kunden-LS | `db/schema/construction_schema.js:207-220` | E |
| verbessern | Aufmaß Blätter/Zeilen+DA11/X31 | Zwei Welten: alt `position_id TEXT` vs. neu Blätter mit OZ-Textmatch | `db/repositories/aufmass_repo.js:167-188`, `js/da11.js:92-180`, `js/gaeb-x31.js:16-212` | C |
| verbessern | Aufmaß→Rechnung Übergabe | UPDATE/CREATE+Reload-Check gut, aber AUFTRAG/ABSCHLAG/SCHLUSS landen in falschem `type` | `js/projects/project-document-flow.js:28-160` insb. `:133-134` | C |
| verbessern | Nachtrag VOB | CRUD+GENEHMIGT-Filter+Idempotenz `N:id:POS:id` gut, landet nur in Zielbeleg-`positionen` | `controllers/NachtragController.js:100-126`, `js/projects/project-document-flow.js:162-290` | B |
| fehlt neu | Nachtrag→projekt_positionen | Kein INSERT aus Nachtrags-Übernahme in LV-Stamm | `controllers/NachtragController.js:100-126` | D |
| behalten | Kumulierte Abschlags-RG | `F_t=L_t−ΣF_i`+Guard+Retention/Escrow stark | `controllers/CumulativeBillingController.js:19-176` | B |
| verbessern | SchlussRG | Typ+Fristen da, aber `.find(SCHLUSSRECHNUNG)` nimmt erste, kein UNIQUE, kein „verrechnet alle“-Zwang | `js/projects/project-calculations.js:29-37` | C |
| fehlt neu | Minderungs-Gutschrift | Nur Voll-Storno `STORNO-nr`; kein `createGutschrift` (Grep-negativ) | `controllers/InvoiceController.js:627-669`, `db/repositories/document_repo.js:569-602` | D |
| behalten | Storno GoBD atomar | Status+Gutschrift eine Transaktion | `db/repositories/document_repo.js:569-602` | B |
| verbessern | bezahlt vs. Zuordnung | `markAsPaid` nur Status vs. echte Buchung, unverlinkt | `models/InvoiceModel.js:56-66`, `db/repositories/banking/reconciliation_repo.js:51` | C |
| behalten | Banking OPOS/SEPA/Import | Matching+Unmatch mit Grund, Mandate+SEPA-Export | `js/banking/banking-opos-ui.js:115-117`, `preload.js:116` | B |
| verbessern | Mahnung einzeln/bulk | Level/Datum/Gebühr+Vorschau ja, Bulk-Toast ohne SMTP-Nachweis | `js/dashboard/dashboard-actions.js:103-105` | C |
| verbessern | E-Rechnung XRechnung/ZUGFeRD | Datei da, aber `throw` erst beim Export statt Frühcheck | `js/einvoice/einvoice-viewer.js:226-241` | B |
| behalten | DATEV EXTF700/Steuerbericht | Header+Filter+Download, kein Versand | `js/datev.js:10-274` | B |
| verbessern | GAEB X83→Tender→X84 | Import(Hash)+Draft-UNIQUE+X84 stark, aber Übergang nur Referenz-Link | `db/repositories/gaeb/gaeb_linking.js:10-43` | B |
| fehlt neu | GAEB→Positionen-Generator | Kein `createAngebotFromDraft` (Grep-negativ) | `db/repositories/gaeb/gaeb_linking.js:30-35` | D |
| behalten | EFB221/223+Kalkulation | Profile+PDF da, aber kein Kern-Nav | `views/EFBView.js:32-620`, `views/KalkulationView.js:340-347` | C |
| behalten (opt-in) | Bautagebuch/Abnahme/VOB | CRUD+Signatur+Generatoren, ohne Versand | `controllers/vob/VobCorrespondenceController.js:12-588` | B |
| behalten (opt-in) | Mängel/Abnahme | CRUD+PDF+Fristen, Nav experimentell | `views/MaengelView.js:374-400` | B |
| behalten (opt-in) | Zeiterfassung/MiLoG | MA/Zeit/VOB+Trigger, Desktop-Erfassung schwach | `views/ZeiterfassungView.js:283-323` | C |
| behalten | Controlling Soll/Ist/OPOS | Abfrage stark, `cost_type`-Split/Prognose schwach | `db/repositories/controlling_bautagebuch_repo.js:278-363` | C |
| behalten (opt-in) | Dauerrechnung | Plan/Lauf/Storno echt, versteckt trotz Kern-Nähe | `js/dauerrechnungen.js:181-778` | B |
| behalten (opt-in) | Sync/PWA | Nur Baustellen-Entitäten, keine `dokumente/kunden`-Sync | `views/SyncView.js:40-222` | C |
| verbessern | Tote Buttons | `Neue Rechnung click:()=>{}` tot; `unlockDocument` Preload-Reject | `main.js:68`, `preload.js:18` | C |
| ausblenden | Objekte/Liegenschaften | Baum-CRUD ok, kein Bau-Kern | `js/objekte.js:32-608` | B |
| ausblenden | Putzplan/Reinigungs-LV | LV-CRUD ok, kein Bau-Kern | `js/putzplan.js:100+` | B |
| ausblenden | Großhandel/IDS | Extern-Shop, Konzern-Überfracht | `views/GrosshandelView.js:262-573` | B |
| ausblenden | SOKA-Bau/Compliance | Beitrag+Meldung, kein Einstiegs-Kern | `views/SokaBauView.js:39-544` | B |
| fehlt neu (nachrangig) | Brieftexte/Rundschreiben | Kein Zentrum/Serienversand — nur bei Bedarf | — | E |

## 3. Top-15 Verbesserungen existierender Module
1. `main.js:68` — totes „Neue Rechnung“ entfernen/verdrahten.
2. `js/navigation.js:177-180` — `artikel` in Kern holen.
3. `js/projects/project-document-flow.js:131-134` — AUFTRAG/ABSCHLAG/SCHLUSS-Mapping fixen oder verstecken.
4. `preload.js:18` — Entsperren ehrlich labeln/entfernen.
5. `models/InvoiceModel.js:56-66` ↔ Banking-OPOS — bezahlt-Button mit Zuordnungs-Link + Restprüfung.
6. `js/dashboard/dashboard-actions.js:103-105` — Bulk-Mahnung-Toast ehrlich + SMTP-Nachweis.
7. Mahn-Regel (Überfällig+gedruckt) vorab in UI zeigen.
8. B2G-Leitweg-Frühcheck in Kunde/Beleg statt `throw` beim Export.
9. Doppel-Schluss-Sperre + „Schluss verrechnet alle“-Check + kumulative Sicht.
10. `db/repositories/gaeb/gaeb_linking.js:10-43` — Entwurf→Positionen-Button statt nur Link.
11. `db/repositories/aufmass_repo.js:167-232` — OZ-FK oder Warnung statt stiller `preis:0`.
12. Nachtrag→`projekt_positionen`-Write ergänzen.
13. Minderungs-Gutschrift-Generator ohne Voll-Storno.
14. EFB/Kalkulation in Projekt-Tab verlinken.
15. ZUGFeRD-Platzhalter + DATEV-Hinweise in UI erklären + externe Läufe dokumentieren.

## 4. Internet-Quellen (Zugriff 2026-10-08)
1. bauprofessor Aufmaß: `https://www.bauprofessor.de/aufmass` — Gegenzeichnung/Prüfbarkeit fehlt.
2. bauprofessor kumulativ: `https://www.bauprofessor.de/kumulative-abschlagsrechnungen` — Maßstab Sperre+Check.
3. bauprofessor Schluss: `https://www.bauprofessor.de/schlussrechnung` — Prozess nicht geprüft.
4. bauprofessor Abschlag VOB: `https://www.bauprofessor.de/abschlagszahlung-vob` — Fristen-Hinweise.
5. baufaktura E-Rechnung: `https://baufaktura.de/anleitungen/baufaktura-e-rechnungen-erstellen` — B2G-Flow besser.
6. baufaktura FAQ: `https://baufaktura.de/faq/anleitung` — kumulativ/pauschal-Trennung.
7. GAEB-Norm: `https://www.gaeb.de/de/produkte/gaeb-datenaustausch` — Generator-Forderung.
8. XRechnung BT-10: `https://www.e-rechnung.tools/ratgeber/leitweg-id` — Frühcheck-Maßstab.
9. smarthandwerk Pakete: `https://smarthandwerk.de/leistungsbeschreibungen` — Dok-Arten-Maßstab.
