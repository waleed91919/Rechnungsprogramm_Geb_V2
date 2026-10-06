# C — Wettbewerber und öffentliche Dokumentation (Subagent C, read-only)

> **Snapshot-Kopf (fix, nicht gewechselt):**
> - Repo: `C:\Users\walee\Desktop\server\Rechnungsprogramm_Geb_V2`, Branch `main`, SHA `791fb77f6e2fc50c355569b15cde8493bb6da0de`
> - `git status`: clean, zzgl. untracked `analyse_2026-10-04/` + `plans/testen_das_app.txt`
> - OS: Windows (win32, PowerShell 5.1), `node --version` = `v25.1.0`
> - Zielgruppe: deutsche Bau-KMU, Büromitarbeiter Angebot/Bauabrechnung
> - Hypothesenbasis: `analyse_2026-10-04/ABSCHLUSSBERICHT_AR.md` Kap. C (+B/D), `plans/testen_das_app.txt` Kap. 6
> - **Snapshot-Drift (transparent):** Abschlussbericht nennt `main @ d940bd6c` — zum Arbeitszeitpunkt lag `main` auf `791fb77f`. Alle W-Link-Fakten unten wurden per Grep auf diesem Stand gegengeprüft.
> - Methode: KEIN Produktcode geändert, KEINE Commits, KEINE prod-DB (`database.sqlite` nicht angefasst). Wettbewerber-UI wurde **nicht bedient** (keine Klicks/Screens/Zeiten — Spalte entfällt daher begründet). Alle Internet-Aussagen mit URL + Zugriffsdatum **2026-10-04**.
> - Testdaten-Bezug (Kap. 8): TEST-KUNDE-01 / TEST-BAU-01 (P1 10×100, P2 5×200, P3 1×500 → netto 2.500 / brutto 2.975; N1 2×150 = 300 netto; L1 = 1.300, L2 = 2.800; AR1 1.547 brutto, AR2 1.785 brutto; Teilzahlung 1.500; Schluss 0,00) — dient nur als Rechenanker für die Ablaufvergleiche.

## 1. Kandidaten-Begründung (Kandidat 2: 1 Satz + Verwürfe)

- **Kandidat 1 (fix): baufaktura** (Huonker / Vertrieb MAIER SOFTWARE) — deutsche Bau-Abrechnungssoftware für KMU, Kern Angebot/Aufmaß/Abschlag/Schluss.
- **Kandidat 2 (eigene Wahl): TopKontor Handwerk / Nachfolger smarthandwerk pro (blue:solution, heute OneQrew)** — weil Einzelplatz-/Desktop-Herkunft, Angebot/Auftrag/Rechnung, Abschlags-/Teil-/Schlussrechnung (VOB), OP-Center+Mahnwesen, DATEV-Schnittstelle, GAEB-Bezug und Zielgruppe Handwerk/Bau-KMU exakt dem W-Link-Kern entsprechen; **verworfen:** AVA-Tools (Nevaris/NextBau — Ausschreibungs-/AVA-Schwerpunkt, kein Büro-Faktura-Kern) und Baustellen-Apps (123erfasst — Zeit/Bautagebuch mobil, keine Bauabrechnung mit Abschlag/Schluss).
- **Wichtig:** TopKontor Handwerk wurde zum 01.10.2024 abgekündigt, Support nur bis mind. 31.12.2026 bei Pflegevertrag; Nachfolger **smarthandwerk pro** (Mietmodell) — Beleg: `handwerk-systemhaus.de` + `bluesolution.de/handwerkersoftware` (s. Quellentabelle Nr. 9/10). Preis-/Hilfe-Aussagen zu Kandidat 2 beziehen sich daher auf smarthandwerk pro als offiziellen Nachfolger; alte TopKontor-Hilfe nur via Knowledge-Base-Archiv (`service.bluesolution.software/help/de-de`, Rubrik „alte Versionen“).

## 2. Ablauf 1 — Angebot → Projekt (Version / Annahme / Auftragsbestätigung?)

| Anbieter | Vorgesehener Weg (Hilfe-URL) | Unterschied zu W-Link | Beleg |
|---|---|---|---|
| baufaktura | LV-System: Angebot anlegen → per Kopier-/Druckfunktion in Rechnung/Auftragsbestätigung überführen; Auftragsverwaltung als kundenbezogener Ordner, der Angebote/Rechnungen/Gutschriften chronologisch bündelt | W-Link: Entwurf→Freeze→Version V1→V2→Annahme→Projekt (`createProjektFromAngebot` mit Dedup) ist **stärker versioniert**, hat aber **kein echtes AB-Dokument**; baufaktura kennt AB + Lieferschein + Gutschrift als eigene LV-Arten im Basis-System, dafür keine belegte Angebots-Versionskette | Hilfe: `https://bau-faktura.de/funktionen/angebote-rechnungen`, `https://bau-faktura.de/funktionen/auftragsverwaltung` (2026-10-04); W-Link: `controllers/AngebotController.js:199-459`, `js/modal-loader.js:20` (AUFTRAG-Option im Übergabe-Modal) |
| smarthandwerk pro (TopKontor-Nachf.) | Angebot → Auftrag (Annahme) → Auftragsbestätigung drucken/senden; FAQ „Wie erstelle ich mit smarthandwerk eine Auftragsbestätigung?“; Grundmodul: „Angebote, Aufträge, Rechnungen – Kalkulation“, „Aufmaßkette im Dokument“ | W-Link bildet „Auftrag“ nur als `projekte`-Datensatz ab (kein Dok mit Nummer/PDF); Kandidat 2 trennt **Auftrag/AB als eigenes Dokument** mit eigenem Druck — größter struktureller Unterschied in Ablauf 1 | Hilfe: `https://smarthandwerk.de/service/faq` (2026-10-04), `https://smarthandwerk.de/preise` (Grundmodul-Zeile); W-Link: `controllers/AngebotController.js:380-459` |
| W-Link (Referenz) | Angebot Entwurf→VERSENDET (Freeze+Snapshot) → Version → ANGENOMMEN → Projekt; GAEB-Weg nur `linkImportToAngebot` (Referenz, kein Positions-Generator) | Hypothese Kap. C bestätigt: Angebots-Lifecycle „sogar stärker“, AB nur Etikett, GAEB→Angebot = Lücke (Status D) | `controllers/AngebotController.js:199-368`, `db/repositories/gaeb_repository.js:628-662` (Link statt Generator, per Grep verifiziert) |

Direkt- vs. GAEB-Angebot (getrennt): baufaktura GAEB-Import DA81–86 (90/2000/XML) → Angebot „mit wenigen Mausklicks“ (`…/schnittstellen/gaeb-import`); W-Link X83-Import + Tender-Draft-Versionierung + X84-Export stark, aber Entwurf→Angebotspositionen fehlt. Kandidat 2: GAEB D81/D83/D86 Import + D84 Export als Teil der „Digitalen Ausschreibung“ (`smarthandwerk.de/preise`).

## 3. Ablauf 2 — Aufmaß → Abschlag (Nachtrag, kumulativ, Doppel-Schutz?)

| Anbieter | Vorgesehener Weg (Hilfe-URL) | Unterschied zu W-Link | Beleg |
|---|---|---|---|
| baufaktura | Aufmaß (Basis-Modul chronologisch/positionsweise; Erweiterung z. B. Gauss-Elling) → Mengen-Rückübertragung ins LV → **kumulative oder pauschale** Abschlagsrechnung; Bauabschnitte je Abschlag | W-Link: `F_t = L_t − ΣF_i` + `rechnung_verrechnungen`-Guard + Retention/Escrow rechnerisch ebenbürtig, aber **zwei parallele Aufmaß-Welten** (alt `position_id TEXT` ohne FK vs. neu `aufmass_blaetter/zeilen` mit OZ-Textmatch) und **kein Pflicht-Check „Schluss verrechnet alle Abschläge“**; baufaktura unterscheidet kumulativ/pauschal offiziell, Aufmaß ist Zusatzmodul (Aufpreis) | Hilfe: `https://bau-faktura.de/funktionen/abschlagsrechnungen`, `https://bau-faktura.de/schnittstellen/gaeb-da11-export` (2026-10-04); W-Link: `controllers/CumulativeBillingController.js:19-106`, `controllers/InvoiceController.js:135-176`, `js/projects/project-document-flow.js:28-160` |
| smarthandwerk pro | „Aufmaßkette im Dokument“ (Grundmodul) + Aufmaß-Center (freies/Raum-/Spaltenaufmaß) → erweiterte Rechnungsfunktion „Abschlagsrechnung, Teil-/Schlussrechnung (VOB)“ | W-Link löst Kumulativ-Logik im Code, Kandidat 2 löst sie **im Dokument** (Aufmaßkette) + VOB-Schluss-Typ als Produktfeature; Nachtrags-Handling bei beiden nur als Rechnungsübernahme, LV-Stamm-Update bei W-Link explizit fehlend | Hilfe: `https://smarthandwerk.de/preise` (Zeilen Grundmodul/erweiterte Rechnungsfunktion/Aufmaß-Center, 2026-10-04); W-Link: `controllers/NachtragController.js:100-126` (idempotent `extractApprovedPositionsForInvoice`), kein `Nachtrag→projekt_positionen` (Schema-Grep: keine FK) |
| Fachmaßstab | Aufmaß = Grundlage der Abrechnung, prüfbar nach OZ/LV-Positionen; kontinuierlich + möglichst mit Abschlagsrechnung vorlegen; Abschlagszahlung = vorläufig, verliert mit Schlussrechnung selbständigen Charakter; kumulative Fortschreibung bis Schluss | Beide Kandidaten + W-Link erfüllen den **Rechenweg**; Prüfbarkeit (gemeinsames Aufmaß, OZ-Bindung) ist bei W-Link durch Textmatch statt FK schwächer abgebildet | `https://www.bauprofessor.de/aufmass` (2026-10-04), `https://www.bauprofessor.de/abschlagszahlung-vob` (2026-10-04), `https://www.bauprofessor.de/schlussrechnung` (2026-10-04) |

Nachtrag-Einordnung: VOB/B § 2 Abs. 5/6-Leistungsänderungen + Abschlagsfähigkeit auch ohne Einigung über Vergütung (BGH VII ZR 34/11) — Beleg `bauleiter-plattform.de/nachtraege…` + bauprofessor (s. o.). W-Link: Nachtrag→Rechnung idempotent (B), Nachtrag→LV-Stamm fehlt (D). Doppel-Berechnungs-Schutz: W-Link Guard nur für Verrechnungen, **kein Doppel-Schluss-Constraint**; bwork (Schwesterprodukt des Kandidat-2-Herstellers) wirbt mit „revisionssicherer Stornierung der Abrechnungskette“ (`bwork-software.de/funktionen/abschlag-schlussrechnung`).

## 4. Ablauf 3 — Zahlung → Schluss (Teilzahlung/OPOS/Mahnung, Schluss mit Vorgänger, PDF/XML, Backup?)

| Anbieter | Vorgesehener Weg (Hilfe-URL) | Unterschied zu W-Link | Beleg |
|---|---|---|---|
| baufaktura | Zahlungsüberwachung + **vollautomatisches Mahnwesen** (Mahnstufen, Texte, Mahndruck per Klick; Sperre: keine Stufe überspringbar); Ausgangsbuch/Minibuchhaltung; XRechnung + ZUGFeRD im Basis-System; Datensicherung im Basis-System | W-Link: OPOS-Matching (`zahlung_zuordnungen` + `applyPaymentMatching`) vorhanden, aber **`markAsPaid` = reiner Statuswechsel ohne Buchung** (Bruch); Mahnung mit Level/Datum/Gebühr + Vorschau, aber Bulk-Versand ohne SMTP-Nachweis; E-Formate technisch vorhanden (XRechnung 3.0, ZUGFeRD-Container), aber Sichtseiten-Abgleich + externe Validierung offen; Backup atomar+verify (stark) | Hilfe: `https://bau-faktura.de/funktionen/mahnwesen`, `https://bau-faktura.de/funktionen/xrechnung`, `https://bau-faktura.de/schnittstellen/datev-csv-schnittstelle` (2026-10-04); W-Link: `js/editor/editor-save.js:380-400`, `js/dashboard.js:665-725`, `js/banking.js:220-422`, `main/backup.js:46-406` |
| smarthandwerk pro | OP-Center (offene Posten verwalten) + Mahnwesen + DATEV Buchungsdatenservice (ab Paket M); ZUGFeRD/X-Rechnung Export (S) bzw. Im-/Export (M); GoBD/DSGVO-konform, §13b/§35a | W-Link trennt Status vs. Zuordnung nicht sauber (s. o.); Kandidat 2 bündelt OPOS+Mahnwesen+DATEV als **Paket-logik** (M-Paket ≈ 79 € lokal / 119 € Cloud); DATEV bei baufaktura optionale Schnittstelle (195 €), bei W-Link EXTF-700-Datei ohne Versand | Hilfe: `https://smarthandwerk.de/preise` (OP-Center/Mahnwesen/DATEV-Zeilen), `https://smarthandwerk.de/service/faq` (Leistungserbringungsdatum/DATEV, 2026-10-04); W-Link: `js/datev.js:10-274` |
| Schluss-Regel | Schlussrechnung = prüfbare Gesamtleistungs-Aufstellung, Vorgänger-Zahlungen abziehen (kumulativ fortschreiben), USt auf Gesamtleistung, bereits vereinnahmte USt abziehen; Aufbewahrung 10 Jahre (§ 257 HGB) | W-Link-Typ `SCHLUSSRECHNUNG` + Verrechnung vorhanden, aber Doppel-Schluss möglich und USt-Durchrechnung nicht gegen Fachbeispiel verprobt | `https://www.bauprofessor.de/schlussrechnung` (2026-10-04, inkl. Brutto-/Netto-Beispiele + VHB-Formblatt-214-Verweis) |

PDF vs. XML: ZUGFeRD = hybrid (menschliche PDF/A-3-Sicht + maschinelle XML), XRechnung = rein strukturiert mit Pflicht-BT-10 (Leitweg-ID) — W-Link generiert beide **als Datei** (technisch B), ohne KoSIT-Schematron-/VeraPDF-Nachweis. Backup: baufaktura „Datensicherung und Übertragung auf andere Geräte“ (Basis, ohne öffentliche Detail-Doku → Hilfe-Tiefe schwächer); W-Link `BackupService` (SHA-256+verify+PRE_RESTORE, isoliert 3/3) hier **stärker belegt**.

## 5. Preis-/Quellentabelle (nur mit URL + Datum 2026-10-04, keine erfundenen Preise)

| Nr | Quelle (URL) | Typ | Aussage (Stand 2026-10-04) |
|---|---|---|---|
| 1 | `https://bau-faktura.de/preise` | Preis (Hersteller-Vertrieb) | Basis-System **695 € einmalig** (Angebot…Schluss, Storno, Gutschrift, Mahnwesen, XRechnung, ZUGFeRD inkl.); Module z. B. Basis-Aufmaß 235, Aufmaß-Erweiterung 495, DATEV 195, GAEB Import/Export je 235, DA11-Export 195; alle Preise zzgl. MwSt. |
| 2 | `https://baufaktura.de/preisliste` | Preis (Hersteller) | PREMIUM **695 €**, ECO **375 €** (max. 100 Pos./LV, max. 1 Zusatzlizenz); fast gleiche Modulpreise (Basis-Aufmaß ECO 135 / Premium 235 etc.); Servicevereinbarung 210–354 €/Jahr |
| 3 | `https://bau-faktura.de/funktionen/angebote-rechnungen` | Hilfe/Funktion | LV-System mit Titel/Gewerken/Positionen; „Angebot mit wenigen Klicks in Rechnung überführen“ |
| 4 | `https://bau-faktura.de/funktionen/abschlagsrechnungen` | Hilfe/Funktion | **Kumulativ vs. pauschal** als offizielle Unterscheidung |
| 5 | `https://bau-faktura.de/funktionen/auftragsverwaltung` | Hilfe/Funktion | Kundenbezogene Ordner-Chronologie (Angebote/Rechnungen/Gutschriften), Kopieren/Sichern extern |
| 6 | `https://bau-faktura.de/funktionen/mahnwesen` | Hilfe/Funktion | Vollautomatisches Mahnwesen, Mahnstufen-Zwang (kein Überspringen am selben Tag) |
| 7 | `https://bau-faktura.de/funktionen/xrechnung` | Hilfe/Funktion | XRechnung im Basis-System (E-Rechnungspflicht- narrative seit 01.01.2025) |
| 8 | `https://bau-faktura.de/schnittstellen/gaeb-import` + `…/datev-csv-schnittstelle` + `…/gaeb-da11-export` | Hilfe/Schnittstelle | GAEB DA81–86 Import (90/2000/XML); DATEV-Export Debitoren/Stammdaten (DATEV-Server-Zugang via StB nötig); DA11-Export |
| 9 | `https://smarthandwerk.de/preise` | Preis (Hersteller) | **Miete/Monat/Arbeitsplatz**: lokal S 49 / M 79 / L 129 €; Cloud S 89 / M 119 / L 169 €; +40 € Cloud-Aufpreis; OP-Center/Mahnwesen/DATEV ab M; GAEB/ÖNORM „Digitale Ausschreibung“; Aufmaß-Center als Zusatz |
| 10 | `https://bluesolution.de/handwerkersoftware` + `https://www.handwerk-systemhaus.de/TopKontor-Handwerk` | Hersteller + Händler | TopKontor→smarthandwerk pro; Abkündigung 01.10.2024, Support bis mind. 31.12.2026 mit Pflegevertrag; 30 % Bestandsrabatt (Händleraussage, schwächer) |
| 11 | `https://smarthandwerk.de/service/faq` | Hilfe/FAQ | „Wie erstelle ich eine Auftragsbestätigung?“; DATEV-Leistungserbringungsdatum-Pflichtfeld-Hinweis |
| 12 | `https://service.bluesolution.software/help/de-de` | Hilfe/Knowledge-Base | Rubriken Handwerk/Zeiterfassung/ecoDMS/smarthandwerk PRO/alte Versionen (Tiefenartikel Login-pflichtig → „nicht einsehbar“, Alternative Nr. 11/13) |
| 13 | `https://bwork-software.de/funktionen/abschlag-schlussrechnung` | Hilfe/Funktion (Schwesterprodukt, © blue:solution 2026) | Abschläge aus Auftrag, Schluss mit Verrechnung, OPOS-Überblick, revisionssichere Storno-Kette |
| 14 | `https://www.bauprofessor.de/aufmass` | Fachquelle | Aufmaß-Grundsätze (OZ/LV-Nachweis, kontinuierlich, gemeinsam nach § 14 Abs. 2 VOB/B) |
| 15 | `https://www.bauprofessor.de/abschlagszahlung-vob` | Fachquelle | § 16 Abs. 1 VOB/B (Antrag, prüfbare Aufstellung, 21-Tage-Fälligkeit, 30-Tage-Verzug, Einbehalte max. 5 % öffentlich / 10 % Sitte) |
| 16 | `https://www.bauprofessor.de/abschlagszahlung-bgb` | Fachquelle | § 632a/§ 650m BGB (vertragsgemäße Leistung × EP bzw. Pauschal-Teilleistung; Stoffe/Bauteile nur mit Eigentum/Sicherheit) |
| 17 | `https://www.bauprofessor.de/schlussrechnung` | Fachquelle | § 14/§ 16 VOB/B + § 650g BGB; Brutto-/Netto-Beispiele (USt auf Gesamtleistung, vereinnahmte USt abziehen); 10-Jahre-Aufbewahrung |
| 18 | `https://www.ferd-net.de/standards/zugferd` + `…/publikationen…/zugferd-252-deutsch` | Normquelle | ZUGFeRD 2.5.2 (04.08.2026, gültig ab 01.09.2026) = hybrid PDF/A-3 + XML, EN-16931-basiert, 5 Profile mit XSD/Schematron; technisch identisch Factur-X 1.09.2 |
| 19 | `https://e-rechnung-bund.de/faq/was-regelt-der-standard-xrechnung` + `https://e-rechnung-bund.de/faq_category/buyer-reference` | Normquelle | XRechnung = nationale EN-16931-Implementierung (+21 nationale Regeln); BT-10 Leitweg-ID Pflicht (EU optional → DE verpflichtend); Version 3.0.1 aktuell für Bund |
| 20 | `https://developer.datev.de/de/file-format/details/datev-format/getting-started` | Normquelle | DATEV-Format = EXTF_*.csv, Semikolon, Header+Spalten+Buchungsstapel; Version 700/Formatversion 13-Beispiel |
| 21 | `https://www.gaeb.de/de/produkte/gaeb-datenaustausch/versionen/gaeb-da-xml-version-3-3-stand-2021-05` + `…/3-2…` | Normquelle | GAEB DA XML 3.3 (2021-05, aktuell) / 3.2 (2013-10); Phasen X80–X86 (X83 Anforderung → X84 Angebot → X86 Auftrag), X31 Aufmaß, DA11/REB 23.003 |
| 22 | `https://www.bauleiter-plattform.de/nachtraege-und-nachtragspruefung-28032025` | Fachquelle (schwächer) | § 2 Abs. 3 VOB/B ±10-%-Preisanpassung; Nachtrags-Checkliste |
| 23 | `https://winrechnung.com/282007/BauFaktura_Prospekt.pdf` | Hersteller-Prospekt (schwächer als Hilfe) | LV-Begriff, Direkt-Mengenermittlung im LV, Aufmaß-Bauabschnitte je Abschlag, Gauss-Elling |

Paywall/blockiert: blue:solution-Helpcenter-Tiefenartikel (Login) → „nicht einsehbar“, Alternative FAQ/sm arthandwerk-Preisseite; baufaktura-PDF-Handbuch (nur im Kaufumfang) → „nicht einsehbar“, Alternative Funktionsseiten + Prospekt (als schwächer gekennzeichnet). Genaue Klickzahlen/Screens: nicht bedient → nicht erfunden.

## 6. Marketing-vs-Hilfe-Trennung

- **Marketing (nicht als Verfahrensnachweis übernommen):** „ABRECHNUNG GEHT AUCH EINFACH“, „rechtssicher/GoBD-konform“ (bau-faktura.de), „kinderleicht… für Betriebsprüfungen bestens gerüstet“ (TopKontor-Händler), Kundenstimmen/Testimonials, „Top Preis-Leistungsverhältnis“, „100 % Zufrieden“, E-Rechnung-„rechtssicher erstellen“-Banner. Ebenfalls Marketing: digitale-vereinfacht-Baufaktura-Seite („mit wenigen Klicks Auftragsbestätigung“) — Partnercontent, kein Hersteller-Handbuch.
- **Hilfe-nah (als Weg-Beleg verwendet):** alle `/funktionen/*`- und `/schnittstellen/*`-Seiten (Nr. 3–8), smarthandwerk-FAQ + Preismatrix-Zeilen (Nr. 9/11), bwork-Funktionsseite (Nr. 13, als Hersteller-Doku des gleichen Hauses, aber Schwesterprodukt → gekennzeichnet), bauprofessor-Lexikon (Fach-, keine Hersteller-Doku), Normquellen (Nr. 18–21).
- **W-Link-Seite:** keine Marketing-Aussage übernommen; „GoBD-/rechtssicher“-Anmutungen im Repo (`doc/zugferd-validation.md` u. ä.) gelten bis VeraPDF-/KoSIT-Lauf als **technisch, nicht rechtlich** (s. Kap. 7).

## 7. Fach-Backup: was W-Link technisch vs. rechtlich abdeckt

| Bereich | Fach-/Norm-Anker (2026-10-04) | W-Link technisch | Rechtlich abgedeckt? |
|---|---|---|---|
| Aufmaß | bauprofessor Aufmaß (OZ/LV-Nachweis, gemeinsam § 14 Abs. 2 VOB/B); REB 23.003/DA11 | Blätter/Zeilen + DA11-80-Zeichen + X31-Roundtrip vorhanden | Nein — OZ-Textmatch statt FK; gemeinsames Aufmaß kein Prozess-Steps; DA11 ohne offizielles XSD |
| Abschlag/Schluss | § 16 VOB/B, §§ 632a/650m/650g BGB; Schluss-Beispiele (USt auf Gesamtleistung) | Kumulativ-Formel + Verrechnungs-Guard + Retention vorhanden; USt-Durchrechnung nicht gegen Fachbeispiel verprobt | Nein — kein Doppel-Schluss-Constraint; keine Vorbehalts-/Skonto-Logik wie im Fachbeispiel |
| E-Rechnung | ZUGFeRD 2.5.2 (FeRD), XRechnung 3.0.1/BT-10-Pflicht (Bund/KoSIT) | XRechnung 3.0-XML + ZUGFeRD-Container werden erzeugt | Nein — kein KoSIT-Schematron-/VeraPDF-/Mustang-Lauf belegt; B2G nur mit Leitweg-Disziplin |
| DATEV | EXTF_*.csv, Header+Stapel, Version 700/v13 | EXTF-700-Datei (31-Felder-Header, Blob-Download) | Nein — Datei ja, Kanzlei-Import/Festschreibung/Steuer-7/19-Klärung nein |
| GAEB | DA XML 3.3 (X83→X84→X86), X31, DA11 | X83-Import + Draft-Versionen + X84-Export + DA11/X31 | Teilweise — P94/X89 fehlen; X31 ohne XSD/NS-Abweichung; Entwurf→Angebot fehlt |

## 8. Implikationen für W-Link (keine Umsetzung, nur Entscheidungshilfe)

1. **Auftragsbestätigung als echtes Dokument** (Nummer/Speicherung/PDF) schließen — größter Ablauf-1-Gap zu beiden Kandidaten (W-Link-Etikett `AUFTRAG→rechnung/angebot`, `js/modal-loader.js:20`).
2. **Bezahl-Status ↔ Zahlungszuordnung verlinken** (oder UI ehrlich trennen) — beide Kandidaten bündeln OPOS+Mahnwesen; W-Link-Bruch `editor-save.js:380` vs. `banking.js`.
3. **Doppel-Schluss-Sperre + „alle Abschläge verrechnet“-Pflichtcheck** — Fachbeispiel + bwork-Kette als Maßstab.
4. **Aufmaß vereinheitlichen** (eine Welt, OZ-FK statt Textmatch) + **GAEB-Entwurf→Angebotspositionen-Generator** — sonst bleibt der GAEB-Vorsprung ungenutzt.
5. **Gutschrift (Minderung ohne Voll-Storno)** — in beiden Basis-Systemen enthalten, bei W-Link nur Voll-Storno.
6. **Externe E-Validierung dokumentieren** (KoSIT-Schematron, VeraPDF/Mustang) statt „rechtssicher“-Sprache; DATEV-Festschreibung/Steuersatz-Mix mit StB klären.
7. **Preis-Modell-Hinweis:** Einmalkauf (baufaktura 695 € + Module) vs. Miete (smarthandwerk 49–169 €/Monat) — keine W-Link-Preisempfehlung hier, nur: Funktionslücken (AB, Gutschrift, Mahn-Versandnachweis) vor jeder Bepreisung schließen.

---

## Summary (max. 30 Zeilen)

- Kandidat2-Wahl: TopKontor Handwerk / Nachfolger smarthandwerk pro (blue:solution) — einziger mit gleichem Einzelplatz-/Büro-Kern (Angebot/Auftrag/Rechnung, Abschlag/Teil/Schluss VOB, OPOS+Mahnwesen, DATEV, GAEB, Bau-KMU); AVA (Nevaris/NextBau) und 123erfasst als weniger ähnlich verworfen (Ausschreibung bzw. Baustelle statt Faktura).
- Größte Workflow-Unterschiede: (1) echte Auftragsbestätigung als Dokument bei beiden (W-Link nur Etikett); (2) baufaktura kumulativ/pauschal + Auto-Mahnwesen mit Stufen-Zwang vs. W-Link Status-ohne-Buchung; (3) Aufmaßkette-im-Dokument + VOB-Schluss-Typ bei Kandidat 2 vs. W-Link Dual-Aufmaß mit Textmatch; (4) Doppel-Schluss bei W-Link möglich, bwork-Kette revisionssicher stornierbar; (5) W-Link-Angebotsversionierung/Freeze/Dedup dafür stärker; Backup (SHA+verify) stärker belegt als baufaktura-Doku.
- Preise nur mit Quelle+Datum: baufaktura Basis 695 € einmalig (ECO 375 €), Module 120–495 €, DATEV 195 € (bau-faktura.de/preise + baufaktura.de/preisliste); smarthandwerk pro 49/79/129 € lokal bzw. 89/119/169 € Cloud pro Monat/Platz (smarthandwerk.de/preise); alle zzgl. MwSt., Stand 2026-10-04.
- Quellen-Count: 23 nummerierte Quellen (8 baufaktura-Hilfe/Preis, 5 Kandidat-2-Hilfe/Preis, 4 bauprofessor-Fach, 4 Norm DATEV/GAEB/ZUGFeRD/XRechnung, 2 schwächere Fach/Händler/Prospekt); Mindestvorgabe (12, davon ≥4 Hilfe/Kandidat+Preis+1 Fach) erfüllt; blockiert: blue:solution-Tiefenartikel + baufaktura-PDF-Handbuch → „nicht einsehbar“ + Alternativen genannt.
- W-Link-Urteil aus C-Sicht: Einzelplatz-Bauabrechnung rechnerisch konkurrenzfähig, dokumentenseitig (AB, Gutschrift, Mahn-Versand, Doppel-Schluss-Sperre) und normseitig (externe E-Validierung, DATEV-Import beim StB) hinter beiden — erst schließen, dann bepreisen/positionieren.
