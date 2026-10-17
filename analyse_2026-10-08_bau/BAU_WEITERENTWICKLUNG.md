# Bau-Weiterentwicklung — W-Link für Bauunternehmen verkaufen (2026-10-08, `main@194cd83`)

> Snapshot: `main@194cd83102100353b12d2aa743954356c591db41` (dirty worktree — Produktdateien NICHT angefasst, keine Commits, keine prod-DB). Vormaterial: `analyse_2026-10-04_run2/` + S1/S2/S3 in `analyse_2026-10-08_bau/`. Alle URLs Zugriff `2026-10-08`. 3 echte Subagenten parallel, alle mit Websearch/Webfetch (S1: 24 bauprofessor- + 7 Normseiten; S2/S3: baufaktura/smarthandwerk-Hilfe + Norm). Beleg schlägt Mehrheit.

## 1. Verkaufs-Satz (worum geht es)
Bau-KMU kauft kein „ERP“, sondern: prüfbare Abrechnung, Fristen im Griff, Nachtrag bezahlt, Streit gewonnen. Maßstab bauprofessor.de: VOB/B §§2/5/6/8/12/13/14/16 + BGB §§632a/650b-c/650g/650m + REB 23.003/DA11/X31 + GAEB X83–X86 + EFB/Urkalkulation + Bautagebuch + 18 Pflicht-Musterbriefe + Fristen (21/30/60 Tage, 12 Werktage, 28+28 Vorbehalt, 4/2 Jahre Verjährung). Details: `S1_BAUFACH.md`.

## 2. Existierende Module — behalten / verbessern / ausblenden
**Behalten (Rechenkern, nicht anfassen außer Fixes):** Kunden, Angebot Freeze/Version/Annahme/Projekt, Projekte als Auftragsordner, kumulativ `F_t=L_t−ΣF_i`+Guard, Storno-atomar, Banking OPOS/SEPA, DATEV-Datei, XRechnung/ZUGFeRD-Datei, GAEB-Import/Draft/X84.
**Verbessern (Top-15, alle klein — Details `S2_MODULGAP.md`):**
1. Totes „Neue Rechnung“ (`main.js:68`) entfernen/verdrahten. 2. Artikel in Kern (`navigation.js:177-180`). 3. AUFTRAG-Mapping fixen (`project-document-flow.js:131-134`). 4. Entsperren ehrlich (`preload.js:18`). 5. Bezahlt↔Zuordnung verlinken + Restprüfung (Rest-47-Fall). 6. Bulk-Mahnung ehrlich + SMTP-Nachweis. 7. Mahn-Regel vorab zeigen. 8. Leitweg-Frühcheck statt Export-`throw`. 9. Doppel-Schluss-Sperre + Vollständigkeits-Check + kumulative Sicht. 10. GAEB-Generator statt nur Link (`gaeb_linking.js`). 11. OZ-FK/Warnung statt stiller 0 (`aufmass_repo.js:167-232`). 12. Nachtrag→`projekt_positionen`-Write. 13. Minderungs-Gutschrift-Generator. 14. EFB/Kalkulation verlinken. 15. ZUGFeRD/DATEV-Hinweise + externe Läufe (VeraPDF/Mustang/KoSIT) dokumentieren.
**Neu (nur 3 Generatoren + 1 Sperre, Rest ist Verlinkung):** echte AB (Nr/PDF), Kunden-Lieferschein, Minderungs-Gutschrift, Schluss-Sperre.
**Ausblenden (Code behalten, Nav aus):** Objekte, Putzplan, Großhandel/IDS, SOKA. **Opt-in:** DauerRG, Zeiterfassung, Mängel, EFB/Kalkulation, Bautagebuch-Tabs, Sync/PWA, GAEB-Tender.

## 3. Phasenplan (verkaufsfertig)
**P0 Blocker (~2 Wochen, kein Verkauf davor):** data_integrity-2-Fixes (Sub-Einbehalt, Soft-Delete), Doppel-Schluss-Constraint+Check, Bezahlt-Link, tote Buttons/Toasts ehrlich, Leitweg-Frühcheck, 1 dokumentierter KoSIT/VeraPDF-Lauf. Akzeptanz: TEST-BAU-01 (2.500/N1 300/L1 1.300/L2 2.800/Rest 47/Schluss 0) durchspielbar, 2. Schluss scheitert, Rest 47 nicht „bezahlt“.
**P1 Verkaufsentscheidend (danach bepreisen):** AB-Dokument, Kunden-LS, GAEB-Generator, 1-Welt-Aufmaß + kumulative Sicht (§14-Prüfbarkeit), Mahn-Nachweis + VOB-Fristenautomatik (21-Tage-Abschlag, 12-Werktage-Abnahme), Musterbrief-Verlinkung (18 Briefe: Behinderung §6, Bedenken §4.3, Nachtrag §2, Anordnung §650b, Abnahme §12, Mängel §13, Aufmaß §14, Mahnung/Vorbehalt §16 — Referenz `bauprofessor.de/musterbriefe/uebersicht`, 326 Briefe). Akzeptanz: Angebot V2→AB→Aufmaß→L1/L2→Schluss→Teilzahlung→Mahnung mit Nachweis→DATEV.
**P2 Wachstum (nach Piloten):** EFB/Kalkulation sichtbar, mobiles Bautagebuch/Abnahme/Mängel (Opt-in, offline), DATEV-StB-Runde (Import, Festschreibung, 7/19 %), X31/DA11-Runde mit AG-Gegenprobe.
**Nicht bauen:** FM/Reinigung, IDS/SOKA-Ausbau, Mehrbenutzer/Konzern (Redesign nötig), AVA-Schwerpunkt, Zeit-App — Gegner dort stärker.

## 4. Top-10 Pflichtfunktionen (S1, Bausicht — alles in P0/P1 abgedeckt)
Fristen-Cockpit (VOB/BGB-Logik) · Nachtragsmanager (§2/§650b-c, Urkalkulation versiegelt, 90 %-Deckel) · Behinderung+Tagebuch offline (Foto/Wetter/Personal/Gerät) · Aufmaß→prüfbare Rechnung (REB/DA11) · Zahlungs-Automatik (Fälligkeit/Verzug/Zins/Mahnung/Einstellung) · Protokoll-Check (VHB 442/443, Vorbehalte, 2 Ausfertigungen) · Brief-Engine (Paragraph+Frist+Zugangsnachweis) · GAEB/REB-Austausch (X31/X83–X86/X89, zertifiziert) · Verbraucher-Wächter (§650m/§650g) · Kündigungs-Abwicklung (§8 + Aufmaß/Abnahme sofort).

## 5. Preis-Hinweis (keine Festlegung)
baufaktura 695 € einmalig / ECO 375 € + Module (Aufmaß 235, GAEB je 235, DATEV 195, DA11 195); smarthandwerk 49/79/129 € lokal bzw. 89/119/169 € Cloud/Monat/Platz. Erst nach P0+P1 (AB, Gutschrift, Mahn-Nachweis, Sperre) bepreisen. Keine „rechtssicher/GoBD“-Sprache ohne Extern-Nachweis + StB-/Anwalts-Rat.

*Dateien: `S1_BAUFACH.md` (22+7 Quellen), `S2_MODULGAP.md`, `S3_ROADMAP.md`. Screenshots: keine (read-only). Nächster Schritt bei Go: P0-Tickets aus Kap. 3 anlegen — keine Umsetzung in dieser Runde.*
