# B — Bedienbarkeit und sichtbare Benutzerführung (W-Link ERP)

> Read-only-Befund. Keine Produktcode-/Schema-/Dependency-Änderung, keine Commits, keine prod-DB (`database.sqlite` nicht geöffnet/geändert), nur fiktive Daten (Kap. 8 aus `plans/testen_das_app.txt`), keine echten Mails/Zahlungen. Uncommitted Changes nicht angefasst.

## 0. Snapshot-Kopf (fix, 2026-10-04)

| Feld | Wert / Nachweis |
|---|---|
| Pfad | `C:\Users\walee\Desktop\server\Rechnungsprogramm_Geb_V2` |
| Branch / SHA | `main` @ `791fb77f6e2fc50c355569b15cde8493bb6da0de` — Beleg: `git branch --show-current` → `main`, `git rev-parse HEAD` → `791fb77…` (eigener Lauf, diese Runde) |
| Git-Status | `?? analyse_2026-10-04/` + `?? plans/testen_das_app.txt`, sonst sauber — unberührt gelassen |
| OS / Node | Windows (win32) + `node --version` → `v25.1.0` (eigener Lauf) |
| Electron / better-sqlite3 | Vorgabe `Electron 32.3.3` + `better-sqlite3 12.6.2` (aus Aufgaben-Snapshot; in dieser Runde nicht per `npx` verifiziert — `npx` per ExecutionPolicy blockiert; kein Versions-Claim aus eigenem Lauf) |
| App-Verfügbarkeit | Source + `dist/win-unpacked` vorhanden (Verzeichnislisting); `code.html` (~3.490-Zeilen-SPA), `js/`, `views/`, `controllers/`, `main/ipc/` gelesen |
| UI-Bedienung / Screenshots | **Grenze: Electron-UI in dieser Runde nicht gestartet (reiner Code-Walkthrough). Keine Klicks/Zeiten/Screenshots erfunden. Alle Screenshots: „kein Screenshot — Grund: UI nicht gestartet, read-only“.** Gegenprobe statt Screenshot: jeweils DB-/Datei-Gegenprobe genannt (z. B. Reload-Read `getDocumentById`/`getFullState`, Datei-Exportpfad) |
| Hypothesenbasis | `analyse_2026-10-04/ABSCHLUSSBERICHT_AR.md` + `plans/testen_das_app.txt` Kap. 3+5+8; Zielgruppe: deutscher Bau-Mittelstand, Büromitarbeiter Angebot/Bauabrechnung |
| Status-Skala | A = isoliert ausgeführt+bestanden (nur dieser Lauf) · B = Code da, Lauf unvollständig · C = partiell/defekt · D = Platzhalter/Plan · E = fehlt/nicht nachweisbar. **Kein A für reine Code-Lektüre.** |
| Beobachtung vs. Hypothese | `Beobachtung` = im Code gelesen · `Hypothese` = vermutete Erstnutzer-Wirkung (Vorwissen ≠ Erstnutzer-Verständnis) |

Testdaten-Erwartung (unabhängig von W-Link, USt 19 %, aus Kap. 8): TEST-KUNDE-01; TEST-BAU-01 mit P1 10×100=1.000 + P2 5×200=1.000 + P3 1×500=500 → netto 2.500 / USt 475 / brutto 2.975. N1 2×150=300 netto (57/357). L1=1.300 netto (1.547 brutto); L2=2.800 netto (532/3.332 kumuliert); F2=L2−L1=1.500 netto (285/1.785). Teilzahlung 1.500 auf F1 → Rest F1=47. Schluss=L2−F1−F2=0 (Einbehalt 5 %=140 netto nur Zusatzszenario).

## 1. Navigations-/Erreichbarkeits-Audit (Hauptnav vs. EXPERIMENTAL_VIEWS)

Beobachtung: `code.html:159-262` rendert 15 `nav-*`-Links (`nav-dashboard/rechnungen/artikel/angebote/kunden/projekte/objekte/dauerrechnungen/putzplan/banking/maengel/zeiterfassung/sync/grosshandel/sokabau/berichte/einstellungen`). `js/navigation.js:147-180` definiert `views[]` (19 inkl. `projekt-details/objekt-details`), `CORE_VIEWS` (9: dashboard, kunden, angebote, projekte, projekt-details, rechnungen, banking, berichte, einstellungen) und `EXPERIMENTAL_VIEWS` (10: objekte, objekt-details, dauerrechnungen, putzplan, maengel, zeiterfassung, grosshandel, sokabau, sync, **artikel**). Standard (ohne Opt-in) blendet `applyFocusMode()` (`navigation.js:197-214`) experimentelle Navs per `display:none` aus + Tooltip „Experimentell — in Einstellungen aktivierbar“; `switchView()` (`:216-229`) blockt Direktaufruf mit Toast/Warnung → Dashboard. Opt-in: `code.html:2975` Checkbox `setting-experimental-module` → `toggleExperimentalModules()` (`js/settings/settings-form.js:206-228`), Label „Fokusmodus aktiv (Kern-Views)“ ↔ „Alle Module sichtbar (Experten-Modus)“. `views/` enthält real: `AufmassView, DatanormView, EFBView, GrosshandelView, InvoiceView, KalkulationView, MaengelView, SokaBauView, SyncView, ZeiterfassungView + modals/` — GAEB-Tender/EFB/Sync sind damit View-Klassen ohne Kern-Nav (nur Projekt-Kontext bzw. Opt-in). `SyncView.js:18-80` rendert „Local-First P2P Sync & Mobile PWA Hub … ohne Cloud-Zwang“ (rein lesende Navigation: kein Token). Globale Suche: `code.html:288` `#global-search oninput=handleGlobalSearch` — **Beobachtung:** `js/dashboard.js:609-623` filtert nur die *aktuelle* View (dashboard/rechnungen/artikel/kunden/angebote/projekte), **keine dokumentübergreifende Suche** (kein Ctrl+K, kein Treffer über Kunden+Angebote+Rechnungen+Projekte+Objekte) — Status E für „global“.

| Nav-Eintrag (`code.html`) | Kern / versteckt (Standard) | Beleg | UX-Wertung (Hypothese für Erstnutzer Büro) | Status |
|---|---|---|---|---|
| Dashboard | Kern | `navigation.js:172-175`, `dashboard.js:14` | Startpunkt ok; KPIs (Umsatz/OPOS/Überfällig) im Code vorhanden, aber „Rest €0,00 bei Bezahlt“ (`dashboard.js:281`) verschleiert Teilzahlung ohne Zuordnung | B |
| Rechnungen | Kern | `navigation.js:9-13` | Kern-Ablauf 2+3 hier; Bulk-Bar erst ab >1 Auswahl (`dashboard.js:638`) — Erstnutzer findet „als bezahlt/Mahnung“ evtl. spät | B |
| Angebote | Kern | `navigation.js:24-28` | Direktangebot ok; GAEB-Weg nicht von hier erreichbar (nur Projekt-Kontext/Link) | B |
| Kunden | Kern | `navigation.js:19-23`, `js/kunden.js:106` (`openKundeModal`) | „Kunde anlegen“ erwartet; B2G-Leitweg-Pflicht erst beim Export sichtbar → späte Überraschung | B |
| Projekte (+projekt-details) | Kern | `navigation.js:29-33` | Aufmaß/Nachtrag/Übergabe als Projekt-Tabs/Modals — Erstnutzer sucht „Abschlagsrechnung“ evtl. unter Rechnungen statt Projekt | B/C |
| Artikel & Bestand | **versteckt (experimentell!)** | `navigation.js:177-180` + `code.html:171` | **Kern-Stammdaten versteckt = Einstiegshürde**; Positionen ohne Stamm nur manuell (vgl. TopKontor-Leitfaden: Artikel→Übernehmen) | C |
| Banking & OPOS | Kern | `navigation.js:49-53`, `js/banking.js:55,400-418` | Zahlungszuordnung hier, „bezahlt“-Button aber in Rechnungen — zwei Orte, leicht zu verwechseln | B |
| Berichte (USt) | Kern | `navigation.js:135-139` | Steuerbericht ok; kein Mahn-/OPOS-Center als eigene Sicht | B |
| Einstellungen (+ experimental_module) | Kern | `navigation.js:140-144`, `settings-form.js:206` | Opt-in-Schalter vorhanden, aber Begriff „Fokusmodus/Experten-Modus“ erklärt nicht, *welche* Module erscheinen | C |
| Objekte/Putzplan | versteckt | `navigation.js:177-180` | Richtig versteckt (nicht Zielgruppe; vgl. Kap. 8: kein FM-Ausbau) | B (als Opt-in ok) |
| Dauerrechnungen | versteckt | dto. | Grenzwertig: Abo-Rechnung ist Kern-nah; als Opt-in vertretbar | C |
| Zeiterfassung/Mängel | versteckt | dto. + `views/ZeiterfassungView.js`, `views/MaengelView.js` | Richtig als Opt-in (Baustelle, nicht Büro-Ablauf 1-3) | B |
| GAEB-Tender / EFB / Kalkulation | **kein eigener Nav-Eintrag** (nur Projekt-Kontext) | `views/` (kein `GaebTenderView`-Nav; `EFBView.js`, `KalkulationView.js`), `gaeb_repository.js:628` (nur Link) | Direkt- vs. GAEB-Angebot nicht als zwei sichtbare Wege geführt — Erstnutzer findet X83→Angebot nicht | C |
| Sync/PWA-Hub | versteckt | `navigation.js:82-97`, `SyncView.js:18-80` | Richtig versteckt für Büro-Runde; QR/Pairing-Sprache („P2P“, „Quarantäne“) wäre für Büromitarbeiter Jargon | C (Jargon) |
| Großhandel/IDS, SOKA | versteckt | `navigation.js:98-129` | Richtig versteckt (Konzern-/Lohn-Features, Überfrachtung sonst) | B |

Kern-Fazit (Hypothese): Fokusmodus löst das richtige Problem (Überfrachtung), versteckt aber mit `artikel` ein Kern-Stück und erklärt sich selbst zu wenig.

## 2. Drei Abläufe als Code-Walkthrough (keine UI-Läufe)

### Ablauf 1 — Angebot bis Projekt (Direktangebot vs. GAEB-Angebot)

Beobachtung (Direkt): `openKundeModal` (`js/kunden.js:106`) → Angebot via `openRechnungModal`/`saveRechnung` (`js/editor/editor-events.js:234`, `editor-save.js:1-186`); `convertToRechnung()` (`editor-save.js:404-428`) kopiert Positionen in ein **ungespeichertes** Modal und klickt `nav-dashboard` (`:427`) — Speichern bleibt Handarbeit (Status B). Version/Annahme/Projekt via Angebots-Controller (Freeze/V1→V2/ANGENOMMEN→Projekt, vgl. Hypothesenbasis) — im Walkthrough nicht live verifiziert (B/C). **Auftragsbestätigung: E** — Auswahl `AUFTRAG` fällt in `project-document-flow.js:131-134` auf `type 'rechnung'/'angebot'` zurück (kein eigenes Dok mit Nummer/PDF); Gegenprobe: Reload-Read des gespeicherten `type`/`nr` + Dateiexport würde es zeigen.
Beobachtung (GAEB): X83-Import gespeichert (BLOB+Hash), Tender-Draft-Versionierung, X84-Export vorhanden; aber `linkImportToAngebot()` (`db/repositories/gaeb_repository.js:628-662`) schreibt **nur** `gaeb_import_angebote`-Link (prüft `type==='angebot'`, wirft sonst) — **kein `createAngebotFromDraft`** (E, Negativsuche). Positionspreise aus `gaeb_tender_item_prices` werden nicht in `positionen` generiert.
Unklare Begriffe/Fehler (Beobachtung): `isLocked`/„GoBD-Sperre“, „Entwurf/VERSENDET/Festgeschrieben/Überfällig“, „B2G“ (`code.html:2776` Profil-Label „Leitweg-ID Pflicht“), Leitweg-Fehlermeldungen erst beim Export (`js/einvoice.js:513-528`: `throw` ohne Leitweg/BT-10). Erfolgs-/Abbruch-Feedback: Toasts (`showToast`) + Modal-Schließen; Abbruch bei Sperre mit „Entsperren nur mit Grund + Audit“ (`project-document-flow.js:75`) — aber Entsperren-Button führt auf toten Preload-Stub (s. u.).
Tote/irreführende Elemente (Beobachtung): Menü `Datei → Neue Rechnung … click:()=>{}` (`main.js:68`) tut nichts (E/tot); `unlockDocument` im Preload lehnt **immer** ab (`preload.js:18` `Promise.reject('GoBD…Storno nutzen')`), obwohl IPC-Handler existiert und `dashboard.js:375-389` „Klicken zum Entsperren“ verspricht (C/irreführend); PDF-vs-XML: ZUGFeRD fällt ggf. auf **Platzhalter-Seite** zurück (`editor-export.js:24,34-38`, Toast „mit Platzhalter-Seite“) — Sichtseite ≠ Rechennachweis (C).
Direkt vs. GAEB (Urteil): Direktangebot B (nutzbar, mit manueller Convert-Lücke + toten Buttons); GAEB-Angebot C/D (Import/Bepreisung/Export stark, aber **Übergang in offizielles Angebot/Projekt nur Referenz-Link**).

### Ablauf 2 — Aufmaß bis Abschlagsrechnung

Beobachtung: Aufmaß-Blätter/Zeilen + `mergeSchlussaufmass` (ohne DRAFTs) → Übergabe-Modal (`project-document-flow.js:3-17`: listet nur Belege mit `projekt_id===currentViewProjektId`) → `UPDATE_EXISTING` (OZ-Match `oz_code`, Mengen-Rundung /1000, Herkunftsfelder `aufmass_blatt_id/quelle/zeitstempel`, `:80-114`, danach Reload-Read-Verifikation `:98-106`) oder `CREATE_NEW`-Entwurf (`:116-154`). Nachtrag: nur `GENEHMIGT` (`:167`), Idempotenz-Key `N:id:POS:id` (`:209-224`), Sperrprüfung (`:192-198`), Persistenz via `saveRechnung()`/Neu-Entwurf + Reload-Read (`:238-280`).
Erneute Eingaben (Hypothese): Kunde muss im Projekt hinterlegt sein sonst `MISSING_KUNDE`-Abbruch (`:44-48,244-247`) — Erstnutzer tippt Kunde evtl. doppelt (Projekt + Beleg). Unklare Begriffe: „OZ/oz_code“, „mergeSchlussaufmass“, „UPDATE_EXISTING vs. CREATE_NEW“, „DRAFT ausschließen“, „Idempotenz“. Fehler: `EMPTY_AUFMASS`, `DOC_LOCKED`, `RELOAD_MISMATCH`, `Persistenz-Verifikation fehlgeschlagen` — technisch korrekt, aber ohne Handlungsanleitung („was jetzt?“). Doppelberechnung (Beobachtung): Guard via Idempotenz-Key + Reload-Check vorhanden; kumulierte Kette (`F_t=L_t−ΣF_i`) laut Hypothesenbasis implementiert — **aber** kein Pflicht-Check „Schluss muss alle Abschläge verrechnen“ (C); Doppel-Schluss möglich (C). Kein Screenshot — Grund oben; Gegenprobe: `mergeSchlussaufmass`-Return + `getDocumentById`-Reload + `rechnung_verrechnungen`-Rows.
Erwartungsabgleich Kap. 8 (Hypothese, nicht live gerechnet): L1/F1/L2/F2/Summenprobe F1+F2=L2 wären die Prüfpunkte; Code stützt sie, Lauf fehlt (B).

### Ablauf 3 — Zahlung bis Schlussrechnung (bezahlt vs. Zuordnung; PDF vs. XML; Mahnung; Backup)

Beobachtung — bezahlt vs. Zuordnung (getrennt): `markAsPaid()` (`editor-save.js:380-400` → `InvoiceModel.markAsPaid`, `models/InvoiceModel.js:56-66`) setzt **nur** `status='Bezahlt'` via schmalem `updateDocumentStatus`-Pfad (GoBD-kompatibel, kein Betrag). Bulk-paid dto. (`dashboard.js:682-711`). Echte Zahlungsbuchung dagegen in Banking: `applyPaymentMatching` (`js/banking.js:400-409`), `unmatchTransaction` mit Grund (`:414-418` „Beleg wird wieder als offen geführt“), OPOS-Vorschläge/Entkoppeln (`:55,187,206,315`). **Bruch:** „Rest €0,00 bei Bezahlt“ (`dashboard.js:281`) ohne Betragsprüfung; Teilzahlung 1.500 auf F1 (Rest 47) ist per „bezahlt“-Button nicht abbildbar — nur via Banking-Zuordnung. Für Erstnutzer sehen beide Wege gleich aus („ist doch bezahlt“) — Hypothese: Fehlbuchungs-Risiko.
Beobachtung — Mahnung: Einzelpfad verlangt `status==='Überfällig'` **und** `isLocked` („muss zuerst gedruckt werden (GoBD-Sperre)“, `settings-mahnung.js:13-23`) — Regel steht nur im Fehler-Toast, nicht vorab in der UI (C). Level 1-3 + Gebühr + neues Ziel + PDF-Vorschau + Persistenz `mahnungLevel/Datum/Gebühr` (`:50-158`); E-Mail-Kontext wird gesetzt (`:180-189`), aber **Bulk-Mahnung ist Simulation**: `dashboard.js:720-731` zeigt nach `setTimeout(2000)` „erfolgreich versendet“, ohne `smtp:sendBeleg`-Aufruf (C/irreführend); Bulk-PDF dto. simuliert (`:671-677`). Gegenprobe: `email_versandhistorie`-Rows + SMTP-Log statt Toast.
Beobachtung — PDF vs. XML-Sichtseite (getrennt): XRechnung-XML mit striktem B2G-Gate (`einvoice.js:399-403,513-528`; BT-10 = Leitweg vor `buyer_reference`, `:525-528`); ZUGFeRD-PDF/A-3 mit Fallback-Seite (`editor-export.js:24-38`). **PDF beweist keine XML-Beträge** — Abgleich Sichtseite↔XML fehlt (C); Gegenprobe: exportierte `.pdf`+`.xml` + Betragsvergleich netto/USt/brutto + ggf. Validator-Lauf.
Backup: isolierter Restore-Nachweis laut Hypothesenbasis vorhanden (dort A für Temp-Lauf); in dieser Runde nicht erneut ausgeführt — kein A-Claim hier (B).
Unklare Begriffe/Fehler: „OPOS“, „Verrechnungen“, „Festgeschrieben vs. Versendet vs. Überfällig“, „isLocked“, „Leitweg-ID/BT-10/BR-DE-15“, „§13b“, „Mahnung verlangt isLocked“, „Rücklastschrift-Grund via `prompt()`“ (`banking.js:616` — Hypothese: `prompt` wirkt fremd im UI-Stil).

## 3. Begriffs-/Fehler-Glossar (Erstnutzer-Sicht; alles Hypothesen außer Code-Zitat)

| Begriff/Fehlertext (wo) | Was Erstnutzer versteht (Hypothese) | Was gemeint ist (Beobachtung) | Risiko |
|---|---|---|---|
| Fokusmodus / Experten-Modus (`settings-form.js:217-228`) | „Fehler?/Profi?“ | Kern-Views vs. alle Views (`navigation.js:172-180`) | Artikel wird nicht gefunden |
| `isLocked` / GoBD-Sperre (`settings-mahnung.js:21`; `document-flow.js:75`) | „kaputt/gesperrt“ | Nach Druck/Festschreibung nur Status-Pfad + Storno | Mahnung scheitert unverständlich |
| Entwurf/VERSENDET/Festgeschrieben/Überfällig/Bezahlt/Storniert | Status-Salat | Freigabe-, Sperr-, Zahl-, Verzugs-Stufen | Falscher nächster Schritt |
| OZ / oz_code (`document-flow.js:81`) | „Abkürzung?“ | Ordnungszahl der LV-Position (Aufmaß-Match) | Zuordnung scheitert still |
| UPDATE_EXISTING / CREATE_NEW (`:31,67,116`) | Englisch-Radio | Mengen in Zielbeleg schreiben vs. neuen Entwurf erzeugen | Überschreiben aus Versehen |
| `N:id:POS:id` Idempotenz (`:209`) | unsichtbar | Doppel-Übernahme-Schutz | kein Nutzer-Feedback dazu |
| Leitweg-ID / BT-10 / BR-DE-15 / B2G (`einvoice.js:513-528`; `code.html:2776`) | „Behördenkram“ | Pflicht-Referenz für E-Rechnung an öff. Auftraggeber | Export bricht spät |
| „Als bezahlt markieren“ vs. Zahlungszuordnung (`editor-save.js:380`; `banking.js:400`) | dasselbe | Status-Flag vs. echte Buchung | OPOS falsch/Rest falsch |
| „Mahnungen erfolgreich versendet“ (`dashboard.js:725`) | E-Mail ging raus | nur simulierter Toast nach Timeout | Rechts-/Prozess-Risiko |
| „Neue Rechnung“ (Menü, `main.js:68`) | legt Rechnung an | tut nichts | Vertrauen verloren |
| „Klicken zum Entsperren“ (`dashboard.js:375`) | wird entsperrt | Preload lehnt immer ab (`preload.js:18`) | Sackgasse |
| Platzhalter-Seite (`editor-export.js:38`) | „fertiges PDF“ | Ersatz-Sichtseite im ZUGFeRD-Container | Kunde bekommt Provisorium |
| Quarantäne / P2P / Pairing (`SyncView.js`) | IT-Jargon | Konfliktablage / Direkt-Sync / Kopplung | Fehlbedienung mobil |

## 4. UX-Quellentabelle (Internet-Pflicht; Zugriffsdatum 2026-10-04; Marketing vs. Hilfe getrennt)

| # | Quelle (Typ) | URL (Zugriff 2026-10-04) | Aussage für diese Abläufe | Unterschied zu W-Link |
|---|---|---|---|---|
| 1 | baufaktura **Hilfe/Anleitung** | https://bau-faktura.de/anleitungen/zahlungen-kumulierte-abschlagsrechnungen ( strengthening: Feld „Abzuziehende Abschlagsrechnungen“ auto-aufgelistet, „Eingegangene Zahlungen“ manuell oder via „AZ-Einträge holen“ aus „Zahlungen buchen“; Druckvorschau) | Kumulierte Folgerechnung zeigt Vor-AZ + Zahlungen automatisch; Zweig manuell vs. gebucht klar benannt | W-Link: Kumulierung rechnerisch da, aber **kein sichtbarer „Vorabschläge abziehen“-Block + kein „Einträge holen“-Button** im Beleg; bezahlt-Status ≠ Zahlung |
| 2 | baufaktura **Preis-/Leistung (Marketing)** | https://bau-faktura.de/preise (Basis €695 einmalig: Kunden/Auftrag, Artikel, Ausschreibung, Angebot, Lieferschein, Auftragsbestätigung, Rechnung, Abschlag, Schluss, Storno, Gutschrift, Zahlungsüberwachung+Mahnung, Brieftexte, Rundschreiben, …; Module: E-Mail-Versand, Basis-Aufmaß, GAEB Im/Export, DATANORM, DATEV…) | Vollständige Belegkette als **Kaufversprechen**; Aufmaß/GAEB/DATEV als Module | W-Link: AB/Lieferschein-Kunde/Gutschrift-ohne-Storno/Rundschreiben/Brieftexte-Zentrale fehlen oder nur Etikett (E/D) — nicht als „enthalten“ darstellen |
| 3 | TopKontor (2. Kandidat, **Hersteller-naher Fachblog**, Begründung: Desktop-Einzelplatz, Angebot/Auftrag/Rechnung, Teil-/Abschlag/Schluss, DATEV, GAEB, Handwerk-KMU — ähnlicher als AVA-Software Nevaris/NextBau oder Bautagebuch-App 123erfasst) | https://handwerkersoftware-tk.de/blog/teil-und-abschlagsrechnungen-in-der-praxis/ (Teilrechnung = verbaute Teile+Mengen+Aufmaß, Abschlag = %/pauschal; Erzeugung aus Basisdokument via „Teil-/Abschlagsrechnung“; kumulativ = Vorrechnungen bis Schluss aufgelistet + bezahlt/offen ausgewiesen) | **Begriffstrennung Teil vs. Abschlag + kumulative Sicht mit bezahlt/offen** als Erwartung | W-Link: vermischt beides unter „Abschlag/kumuliert“; keine kumulative Druck-Sicht mit Vorrechnungen+Zahlstatus im Beleg nachgewiesen |
| 4 | TopKontor **Hilfe-Leitfaden (PDF, Dritthoster)** | https://suwe.de/wp-content/uploads/2018/09/Angebot-erstellen.pdf („Dokumente → Neues Dokument → Angebot (Alt+F5)“, Adresse wählen/neu, Artikel→Menge/Preiskategorie→Übernehmen, manuelle Position per Rechtsklick, Abschluss/Schlusstext) | Geradliniger Angebotsweg mit **Tastenkürzel + Artikelstamm + Schlusstext** | W-Link: Artikel versteckt, kein sichtbarer Angebots-Shortcut, Schlusstext-/Brieftext-Zentrale fehlt |
| 5 | bauprofessor.de **Fachanleitung Aufmaß** | https://www.bauprofessor.de/aufmass/ (Aufmaß = Grundlage Abrechnung, Urkunden-Charakter bei Unterschrift; zeichnerisch vs. örtlich; OZ-Nachweis je Teilleistung; zeitnah + mit Abschlagsrechnung vorlegen; gemeinsam feststellen) | Aufmaß braucht **OZ-Bezug, Form/Rhythmus-Abstimmung, Gegenzeichnung** | W-Link: OZ-Match technisch da, aber kein „gemeinsam festgestellt/Gegenzeichnung“-Feld; DRAFT-Ausschluss still |
| 6 | bauprofessor.de **Fachanleitung Abschlagszahlung (VOB)** | https://www.bauprofessor.de/abschlagszahlung-vob/ (§16 VOB/B: prüfbare Aufstellung, 21-Tage-Fälligkeit, 30-Tage-Verzug automatisch; kumulativ empfohlen; Schluss zieht Vorzahlungen ab; Einbehalt max. ~5 % öff./10 % privat als Sitte) | **Prüfbarkeit + Fristen + Verrechnungs-Hinweis + Einbehalt-Regel** gehören in Beleg/Sicht | W-Link: kein Fristen-/Verrechnungs-Hinweis und keine Einbehalt-Erklärung in der Belegsicht nachgewiesen |
| — | vergeblich/blockiert | — | Keine; alle obigen Seiten waren einsehbar. Generell: Hersteller-Hilfe > Marketing > Fachblog; keine Preise/Klicks erfunden | — |

## 5. MANUELLES Testprotokoll-Gerüst (ausgefüllt soweit Code-Walkthrough trägt; Rest offen)

> Vorlage je Schritt: Startpunkt/Button · Erwartung (Kap. 8) · Ergebnis/DB-Datei · erneute Eingaben · unklare Begriffe/Fehler · Rückmeldung App · Screenshot · Zeit · Status · Beleg. **Nicht erfunden: Klicks/Zeiten/Screenshots.** Fiktive Daten unten; DB: isolierte Test-DB/Temp-Dirs, nie `database.sqlite`.

| # | Schritt (Startpunkt/Button) | Erwartung Kap. 8 | Ergebnis / DB-Datei (Gegenprobe) | Erneute Eingaben | Unklare Begriffe/Fehler | Rückmeldung App (Code) | Screenshot | Zeit | Status | Beleg |
|---|---|---|---|---|---|---|---|---|---|---|
| 1.1 | Kunden: `nav-kunden` → Neu (`openKundeModal`) | TEST-KUNDE-01 gespeichert | Offen — `kunden`-Row per Reload-Read prüfen | Adresse evtl. doppelt (Kunde+Projekt) | B2G/Leitweg erst beim Export | Toast + Liste | kein Screenshot — UI nicht gestartet | n/a | B | `js/kunden.js:106`; `code.html:188` |
| 1.2 | Direktangebot: `nav-angebote` → Neu, P1-P3 (2.500/475/2.975) | Positionen+Mengen+Preise editierbar; speichern/schließen/öffnen | Offen — `dokumente`+`positionen` Reload | Manuelle Positionen ohne Artikelstamm | ENTWURF/VERSENDET/isLocked | Toast; Freeze-Guard | kein Screenshot — s.o. | n/a | B | `editor-save.js:1-186`; `navigation.js:24-28` |
| 1.3 | PDF + Versand/Freigabe | PDF prüfbar; Versand nur soweit ohne Echtversand | Offen — Datei `.pdf` + `email_versandhistorie` prüfen (kein Echt-SMTP) | — | Sichtseite vs. XML; Platzhalter-Risiko | Toast inkl. Platzhalter-Hinweis | kein Screenshot | n/a | C | `editor-export.js:16-38` |
| 1.4 | Version V1→V2, eine als angenommen, Projekt daraus | Version+Annahme+Projekt mit übernommenen Daten | Offen — `parent_angebot_id`, `source_angebot_*`, Dedup prüfen | Projektkunde erneut? | „Projekt = Auftrag?“ | Toast/Throw bei Doppelanlage | kein Screenshot | n/a | B/C | Hypothesenbasis (Controller); Walkthrough-Grenze |
| 1.5 | Auftragsbestätigung | echtes AB-Dok (Nr/PDF) | **Negativ:** fällt auf rechnung/angebot zurück | — | AUFTRAG-Etikett | gespeichert, aber falscher Typ | kein Screenshot | n/a | E | `project-document-flow.js:131-134` |
| 1.6 | GAEB: X83→Bepreisung→Entwurf→X84→Angebot→Projekt | durchgehender GAEB-Weg | Teil: Import/Draft/X84 da; **Bruch:** nur Link, kein Positions-Generator | LV-Daten erneut tippen | Tender/Draft/Link | Link-Erfolg, aber kein Angebot | kein Screenshot | n/a | C/D | `gaeb_repository.js:628-662` |
| 2.1 | Aufmaß: Projekt-Tab → Blatt/Zeilen, OZ zu P1/P2+N1 | L1=1.300 netto (1.547 brutto) | Offen — `mergeSchlussaufmass`-Return + Blatt-Rows | Kunde im Projekt Pflicht | OZ/DRAFT/Modi | `EMPTY_AUFMASS`/`MISSING_KUNDE` | kein Screenshot | n/a | B/C | `project-document-flow.js:50-55` |
| 2.2 | Nachtrag N1 anlegen+genehmigen, in Abrechnung übernehmen | 300 netto, einmalig enthalten | Offen — Idempotenz-Key + Reload prüfen | — | GENEHMIGT-Zwang | `EMPTY`/`NO_POSITIONS`/`DOC_LOCKED` | kein Screenshot | n/a | B | `project-document-flow.js:162-290` |
| 2.3 | Abschlag 1 (F1=L1) | 1.300/247/1.547 | Offen — Datei+Rows | — | kumuliert vs. einzeln | Toast + Reload-Check | kein Screenshot | n/a | B | `project-document-flow.js:67-114` |
| 2.4 | Aufmaß 2 + Abschlag 2 (F2=1.500/285/1.785), Probe F1+F2=L2 | kein Doppelansatz | Offen — `rechnung_verrechnungen` prüfen | — | Verrechnungen | `RELOAD_MISMATCH` möglich | kein Screenshot | n/a | B/C | `:96-106`; Kap. 8-Probe |
| 3.1 | Teilzahlung 1.500 auf F1; offenen Betrag prüfen | Rest F1=47 (nicht „bezahlt“) | **Bruch nachweisbar im Code:** `markAsPaid` setzt nur Status; Rest-Label €0,00 | — | bezahlt vs. Zuordnung | „als bezahlt markiert“ (irreführend) | kein Screenshot | n/a | C | `InvoiceModel.js:56-66`; `dashboard.js:281,695` |
| 3.2 | Zuordnung + Rücknahme (`applyPaymentMatching`/`unmatch`) | Buchung + Storno mit Grund, Beleg wieder offen | Offen — `zahlung_zuordnungen`-Rows prüfen | Manuelle Auswahl | OPOS/Vorschlag | „erfolgreich verbucht“/„aufgehoben“ | kein Screenshot | n/a | B | `banking.js:400-418` |
| 3.3 | Mahnung Vorschau (ohne Versand) | Vorschau Stufe 1-3 + Gebühr | Offen — `mahnungLevel/Datum/Gebühr` + PDF-Datei; **Bulk ≠ Versand** | — | „muss gedruckt/isLocked“ | Fehler-Toast erst bei Verstoß; Bulk-Toast falsch | kein Screenshot | n/a | C | `settings-mahnung.js:13-23,50-158`; `dashboard.js:720-731` |
| 3.4 | Schluss (L2−F1−F2=0), Vorgänger/Zahlungen/Einbehalt prüfen | 0 ohne Einbehalt; 5 %-Szenario separat | Offen — Verrechnungs-Rows; Doppel-Schluss ungesperrt | — | Schluss vs. Abschlag | Toast | kein Screenshot | n/a | C | Kap. 8; fehlender Pflicht-Check |
| 3.5 | PDF vs. XML vergleichen | Beträge identisch; B2G-Leitweg ok | Offen — `.pdf`+`.xml` Betragsabgleich + Validator | Leitweg nachpflegen | BT-10/Sichtseite | `throw` bei B2G ohne Leitweg; Platzhalter-Toast | kein Screenshot | n/a | C | `einvoice.js:513-528`; `editor-export.js:34-38` |
| 3.6 | Test-Backup + isoliert restoren | wiederherstellbar in Temp-Dir | Nicht erneut gelaufen (Hypothesenbasis: dort A im Temp-Lauf) | — | — | — | kein Screenshot | n/a | B (hier) | Isoliert wiederholen vor Entscheidung |

## 6. 10 kleinste UX-Fixes als Hypothesen (ohne Umsetzung, ≤2 Sätze, Wirkung/Aufwand-sortiert)

1. Totes „Neue Rechnung“-Menü entfernen/verdrahten (`main.js:68`) → kein Vertrauensbruch beim allerersten Klick. (Beobachtung: `click:()=>{}`; Hypothese: hohe Wirkung/kleiner Aufwand)
2. Artikel aus `EXPERIMENTAL_VIEWS` in Kern holen (`navigation.js:177-180`) → Angebotserstellung ohne Sackgasse. (B→Nutzer findet Stamm)
3. AUFTRAG-Auswahl fixen oder verstecken (`project-document-flow.js:132-133`) → kein falscher Belegtyp unter richtigem Etikett.
4. Entsperren-Button entweder entfernen oder ehrlich labeln („Entsperren deaktiviert — Storno nutzen“, `preload.js:18` vs `dashboard.js:375-389`) → keine Sackgasse mit falschem Versprechen.
5. `bezahlt`-Button mit Banking verlinken (Hinweis „keine Buchung — jetzt zuordnen?“ + Deep-Link zu `banking.js:400`) → Teilzahlung Rest-47-Fall wird korrekt.
6. Bulk-Mahnung-Toast ehrlich machen („Vorschau erzeugt, Versand offen — Historie prüfen“, `dashboard.js:720-731`) → kein Rechts-/Prozess-Risiko durch „versendet“-Behauptung.
7. Mahn-Regel vorab zeigen („Nur Überfällig + gedruckt/gesperrt“, `settings-mahnung.js:13-23`) statt erst im Fehler-Toast → weniger Abbrüche.
8. B2G-Leitweg-Frühcheck im Kunden/Beleg (statt `throw` beim Export, `einvoice.js:513-528`) → Fehler wandert nach vorn, wo er behebbar ist.
9. Doppel-Schluss-Sperre + kumulative Sicht (Vorrechnungen/Zahlungen/Rest wie TopKontor/baufaktura-Hilfe) → Prüfbarkeit ohne Rechnen.
10. GAEB-„Entwurf→Positionen übernehmen“-Button statt nur Link (`gaeb_repository.js:628-662`) + Experimental-Begriff „Fokusmodus“ in Einstellungen erklären → GAEB-Weg auffindbar; Rest-Jargon (OZ, OPOS, P2P) per Tooltip glossieren.

*Kein Produktcode angefasst; `analyse_2026-10-04/` und `plans/testen_das_app.txt` unberührt; keine Secrets/PII; alle URLs mit Datum 2026-10-04; kein A ohne Lauf vergeben.*
