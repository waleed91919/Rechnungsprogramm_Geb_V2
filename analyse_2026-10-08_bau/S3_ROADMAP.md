# S3 — Verkaufs-Roadmap Bauunternehmen (read-only)

> Snapshot-Kopf: Repo `C:\Users\walee\Desktop\server\Rechnungsprogramm_Geb_V2`, Branch `main @ 194cd83102100353b12d2aa743954356c591db41` (Arbeitsbaum dirty — u. a. `doc/changelog.md`, `preload.js`, `tender_controller.js`, `output/…`, `tests/test_results/…`; keine Änderung durch S3, kein Commit, keine prod-DB `database.sqlite` berührt). OS win32, Datum `2026-10-08`. Vormaterial: `analyse_2026-10-04_run2/ENTSCHEIDUNGSBERICHT.md` (3 Einsatzurteile, Top-10 Fixes, Erwartungsrechnung TEST-BAU-01) + `C_WETTBEWERB.md`; S1/S2-Outputs am 2026-10-08 nicht vorhanden → eigenständig aus Vorgänger + eigenem Grep (`markAsPaid` vs `applyPaymentMatching`, `createStornoData`, `linkImportToAngebot`, `unlockDocument`-Stub). Alle URLs Zugriff `2026-10-08`. Marketing vs. Hilfe getrennt (s. Quellen-Tabelle).

## 1. Verkaufs-MVP — was VOR erstem Verkauf funktionieren muss

Zielkunde: deutsches Bau-KMU, 1 Büroplatz, Angebot→Aufmaß→Abschlag(kumulativ)→Schluss→Zahlung/Mahnung. Demo-Anker TEST-BAU-01 (netto 2.500 / N1 300 / L1 1.300 / L2 2.800 / Rest-47-Fall).

1. `data_integrity`-Fails schließen: Subunternehmer-Einbehalt-Crash (`sec48b_geprueft`) + Soft-Delete-Filter — sonst kein Bauabzugsteuer-Szenario verkaufbar (Vorgänger D:A, 34/38).
2. Auftragsbestätigung als echtes Dokument (Nummer/PDF/Speicherung): heute fällt AUFTRAG-Option auf `type='angebot'` zurück (`project-document-flow.js:131-144`) — beide Wettbewerber haben AB als eigenes Dokument (Q3, Q4).
3. Gutschrift = Minderung ohne Voll-Storno: heute nur `createStornoData` Voll-Storno (`InvoiceController.js:627-669`) — Basis-System beider Wettbewerber enthält Gutschrift (Q3).
4. Doppel-Schluss-Sperre + „Schluss verrechnet alle“-Pflichtcheck: heute möglich, zweite Schluss muss scheitern (Vorgänger-Erwartungsrechnung); Fachmaßstab: Schluss = Gesamtleistung minus Vorgänger, USt auf Gesamtleistung (Q6).
5. Bezahlt-Link ehrlich: `markAsPaid` (Status only, `editor-save-status.js:34`) vs. `applyPaymentMatching` (echte Buchung, `reconciliation_repo.js:51`) verlinken oder UI trennen — sonst falsche „bezahlt“-Reports (Rest-47-Fall).
6. Externe E-Validierung dokumentiert: KoSIT-Schematron + VeraPDF/Mustang-Lauf für jede Demo-Rechnung (PDF-Sicht = XML, BT-10-Leitweg-Disziplin), statt „rechtssicher“-Sprache (Q9, Q11).
7. Tote/irreführende UI ehrlich: `Neue Rechnung click:()=>{}` tot (`main.js:68`), `unlockDocument`-Stub lehnt ab (`preload.js:18`), Bulk-Mahn-Toast ohne Versandnachweis, Artikel aus `EXPERIMENTAL_VIEWS` in Kern.

## 2. Phasenplan

### P0 — Blocker (~2 Wochen, kein Verkauf davor)
- data_integrity-2-Fixes + Re-Run; Doppel-Schluss-Constraint + Vollständigkeits-Check; bezahlt↔Zuordnung-Link; tote Buttons/Toasts ehrlich; B2G-Leitweg-Frühcheck; externe E-Validierung (1 Musterlauf dokumentiert). Aufwand klein, Nutzen: Demo nicht mehr widerlegbar. Akzeptanz: TEST-BAU-01 durchspielbar (L1→L2→Schluss 0, Rest 47 nicht „bezahlt“, 2. Schluss scheitert, KoSIT/VeraPDF-Protokoll liegt bei).

### P1 — verkaufsentscheidend (danach erst bepreisen)
| Item | Aufwand / Nutzen |
|---|---|
| AB als Dokument (Nummer/PDF) | mittel / größter Ablauf-1-Gap zu beiden |
| Lieferschein (Kunde) | klein-mittel / heute nur Lieferanten-Fotos |
| GAEB-Generator Entwurf→Positionen (statt nur `linkImportToAngebot`) | mittel / macht X83/X84-Vorsprung verkaufbar (Q10) |
| Aufmaß-Vereinheitlichung (1 Welt, OZ-FK statt Textmatch) + kumulative Sicht (Vorrechnungen/Zahlungen/Rest) | mittel-groß / Prüfbarkeit nach §14 VOB/B (Q7) |
| Mahn-Versandnachweis (SMTP-Protokoll statt Toast) + VOB-Fristenautomatik (21-Tage Abschlag Q7, 12-Werktage Abnahme/Schluss-Fristen Q1/Q6, Mahn-/Nachfrist-Texte) | mittel / „vollautomatisches Mahnwesen mit Stufen-Zwang“ ist baufaktura-Maßstab |
| VOB-Musterbriefe (Abnahmeverlangen, Mängelanzeige §13, Behinderung §6, Schlussvorbehalt — nur Verlinkung auf Q2-Texte, kein Rechtsversprechen) | klein / Fach-Erwartung, 326 Briefe als Referenz (Q2) |
Akzeptanz P1: Lovable-Demo TEST-BAU-01: Angebot V2→AB→Aufmaß→kumulativ L1/L2→Schluss→Teilzahlung→Mahnung mit Nachweis→DATEV-Datei; Fristen-Hinweise sichtbar.

### P2 — Wachstum (nach ersten zahlenden Piloten)
- EFB/Kalkulation sichtbar (Vor-/Nachkalkulation wie baufaktura-Module); Bautagebuch/Abnahme/Mängel mobil (schmaler Capture, Opt-in, kein Feld-Merge-Versprechen); DATEV-StB-Runde (Kanzlei-Import, Festschreibung, Steuer 7/19); X31/DA11-Runde (REB 23.003/DA11-Export mit StB-/AG-Gegenprobe). Aufwand je mittel-groß. Akzeptanz: Pilot-StB importiert EXTF fehlerfrei; X31-Roundtrip + DA11-Probe beim AG akzeptiert.

## 3. Nicht bauen (mit Begründung)
- Reinigung/FM (Tagesberichte-Fremdgewerke), IDS/SOKA-Ausbau, Konzern/Mehrbenutzer (keine users/roles, kein Actor-Audit — Redesign nötig), AVA-Schwerpunkt (Nevaris/NextBau-Territorium), Baustellen-Zeit-App (123erfasst-Territorium). Begründung: verzettelt Einzelplatz-Büro-Kern, schwächt Verkaufs-MVP, Wettbewerber dort stärker belegt.

## 4. Preis-/Paket-Hinweis (aus C-Vergleich, keine Festlegung)
- Einmalkauf baufaktura: Basis 695 € einmalig (Angebot…Schluss, Storno, Gutschrift, Mahnwesen, XRechnung/ZUGFeRD inkl.), Module 120–495 € (Aufmaß 235, GAEB je 235, DATEV 195, DA11 195), alle zzgl. MwSt. (Q3). Miete smarthandwerk pro: lokal 49/79/129 €, Cloud 89/119/169 € /Monat/Platz, +40 € Cloud-Aufpreis, OP/Mahn/DATEV ab M (Q4). Hinweis nur: W-Link erst nach P0+P1-Kern (AB, Gutschrift, Mahn-Nachweis, Doppel-Schluss-Sperre) bepreisen; keine Empfehlung Einmal vs. Miete hier.

## 5. Risiken + Akzeptanzkriterien pro Phase
- Risiken: „rechtssicher/GoBD“-Sprache ohne Extern-Nachweis; B2G ohne Leitweg-Disziplin (BR-DE-15 fatal); USt-Durchrechnung nicht gegen Fachbeispiel verprobt; Dual-Aufmaß stille 0; Netz-/Mehrbenutzer-Versprechen. Gegenmittel: Extern-Läufe + StB-/Rechts-Rat, ehrliche Labels.
- Akzeptanz P0/P1/P2 s. oben; überall: „Demo mit TEST-BAU-01 durchspielbar“, keine erfundenen Klicks/Zeiten, Mocks (fakeTransport, Platzhalter) zählen nicht als Nachweis.

## Quellen (alle Zugriff 2026-10-08; Hilfe/Fach/Norm vs. Marketing getrennt)

| Nr | URL | Typ | Aussage |
|---|---|---|---|
| 1 | https://www.bauprofessor.de/abnahmefristen | Fach/Hilfe | VOB: Abnahme binnen 12 Werktagen §12(1) VOB/B; BGB §640 + fiktive Abnahme; Verbraucher 15 / sonst 30 Tage |
| 2 | https://www.bauprofessor.de/musterbriefe/uebersicht | Fach/Hilfe | 326 Musterbriefe (Abnahmeverlangen, Bedenken-, Behinderungsanzeige, Schlusszahlungserklärung, Sicherheitseinbehalt) auf VOB/B+BGB+VHB+UStG/EStG-Basis |
| 3 | https://bau-faktura.de/preise | Preis/Hersteller-Vertrieb | Basis 695 € einmalig (inkl. AB, Lieferschein, Gutschrift, Mahnwesen, XRechnung, ZUGFeRD); Module/Schnittstellen 120–495 €; zzgl. MwSt. |
| 4 | https://smarthandwerk.de/preise | Preis/Hersteller | pro S/M/L lokal 49/79/129, Cloud 89/119/169 €/Monat/Platz; OP-Center+Mahnwesen+DATEV ab M; GAEB D81/D83/D86+D84; Aufmaß-Center Zusatz |
| 5 | https://www.bauprofessor.de/abnahme-vob-vertraege | Fach | §12 VOB/B, förmlich ab 10.000 € öffentlich, Verweigerung nur wesentliche Mängel, VHB-Formblätter 442/443, HVA 3101/3102 |
| 6 | https://www.bauprofessor.de/schlussrechnung | Fach | prüfbare Schlussrechnung §14/§16 VOB/B, §650g BGB; Fristen 12 Werktage +6/3 Monate; kumulativ-Abzug, USt-Beispiele, 10 Jahre Aufbewahrung |
| 7 | https://www.bauprofessor.de/abschlagszahlung-vob | Fach | §16 VOB/B: prüfbare Aufstellung, 21-Tage-Fälligkeit, 30-Tage-Verzug, Einbehalt max. 5 % öffentlich / 10 % Sitte, Druckzuschlag 2× |
| 8 | https://www.bauprofessor.de/maengelanzeige-zum-vob-vertrag | Fach | §13 VOB/B: schriftlich, Art+Ort, angemessene Frist (oft ~2 Wochen), Ersatzvornahme-Androhung |
| 9 | https://xeinkauf.de/xrechnung/versionen-und-bundles/ | Norm (KoSIT) | XRechnung 3.0 gilt bis mind. 31.07.2027; Vorversion 4.0 (15.09.2026), final Frühjahr 2027 |
| 10 | https://www.gaeb.de/de/produkte/gaeb-datenaustausch/ | Norm (GAEB) | DA XML 3.3 (2021-05/2023-01) aktuell, Beta 3.4 (2026-03); X83→X84→X86, X31, X89B-Rechnung; keine Kompatibilität 3.2 |
| 11 | https://bau-faktura.de/funktionen/abschlagsrechnungen | Hilfe/Funktion | kumulativ vs. pauschal als offizielle Unterscheidung im Basis-System |
| — | (Marketing, nicht als Beleg) | Marketing | „rechtssicher/GoBD-konform“, „kinderleicht“, Testimonials, „Top Preis-Leistung“, E-Rechnung-„rechtssicher“-Banner (bau-faktura/smarthandwerk-Seiten) |

## Summary (max. 25 Zeilen)
- MVP vor Verkauf: data_integrity-2-Fixes, echte AB, Minderungs-Gutschrift, Doppel-Schluss-Sperre, bezahlt↔Buchung-Link, externe E-Validierung, tote UI ehrlich.
- P0 (~2 Wo): Blocker schließen; Akzeptanz TEST-BAU-01 + 2.-Schluss-scheitert + KoSIT/VeraPDF-Protokoll.
- P1: AB, Kunden-Lieferschein, GAEB-Generator, 1-Welt-Aufmaß + kumulative Sicht, Mahn-Nachweis, VOB-Fristenautomatik, Musterbrief-Verlinkung.
- P2: EFB/Kalkulation, mobiles Bautagebuch/Abnahme/Mängel (Opt-in), DATEV-StB-Runde, X31/DA11-Runde.
- Nicht bauen: FM/Reinigung, IDS/SOKA-Ausbau, Mehrbenutzer/Konzern, AVA, Zeit-App — Kern verwässert, Gegner stärker.
- Preise nur Hinweis: 695 € einmalig vs. 49–169 €/Monat; erst nach P1 bepreisen.
- Risiko: Rechts-/GoBD-Sprache, B2G-Leitweg, USt-Probe, Dual-Aufmaß; Maßstab bauprofessor-Fristen + KoSIT/GAEB-Norm.
