# Code-Prüfung mit Subagents — W-Link ERP (Rechnungsprogramm_Geb_V2)

**Datum:** 24.09.2026
**Umfang:** 22 Controller (`controllers/`), 23 Frontend-Module (`js/`), 11 Main-Module (`main/`), 50+ Tests (`tests/`), `schema.js`, `db.js`
**Methode:** 4 parallele Subagents, nur gelesen, nichts geändert. Gesetze/Quellen Stand 2025/2026 per WebSearch verifiziert. Startquelle `bauprofessor.de` zuerst, dann `gesetze-im-internet.de`, BMF, KoSIT, FeRD, Bundesbank, BZSt, BSI, SOKA-Bau.
**Hinweis:** Keine Rechtsberatung. Vor Release Steuerberater + Bauanwalt gegenprüfen lassen.

---

## Kurzfazit

- **Code existiert in allen Modulen wirklich** — nicht nur Pläne. Objekt, Dauer, Putz, Zeit, SOKA sind implementiert (`ObjektController`, `DauerrechnungController`, `ReinigungController`, `ZeiterfassungController`, `SokaBauController`), dazu Pläne in `plans/`.
- **Rechnungskern im Prinzip gut:** XRechnung-3.0-URN, ZUGFeRD-Container mit XMP/OutputIntent, GoBD-Sperre + Hashkette, §13b-AE, DATEV, Bankimport CAMT/MT940 + OPOS, SEPA pain.008, SMTP mit safeStorage.
- **Aber 9x P0-FEHLER (prod-kritisch):** Backup-Crash, Nummernkreis ohne UNIQUE, §13b-Positionslogik tot, Storno 380 statt 381, Leistungsdatum fehlt in CII, Basiszins 3,37% veraltet, Druckzuschlag <2.0 möglich, GAEB-Namespace 200407 veraltet, DA11-80-Zeichen/Umlaut-Bug.
- **Größte Lücken:** KoSIT-Schematron + VeraPDF-Nachweis fehlen, Peppol nur Textfeld, USt-1-TG + §48-Abzug + §35a-Ausweis nur Flags ohne Logik, VOB-Feinschliff (3%-Cap öffentlich, Verbraucher-Belehrung, 90/110%, Fälligkeits-Helper), Objekt→WEG/BetrKV/HeizkostenV, Zeit→MiLoG-Fristen, SOKA→Abgrenzung Bau/Reinigung, Kunde→Sperren-statt-Löschen, Backup→AES + 3-2-1.

---

## P0 — sofort fixen (Reihenfolge)

| # | Datei:Zeile | Befund | Norm | Fix |
|---|---|---|---|---|
| P0-1 | `main/backup.js:128-134` vs `schema.js:680-692,1473-1489` | INSERT-Spalten existieren nicht (`file_size_bytes` vs `dateigroesse_bytes` …). Auf echter DB schlägt jedes Backup fehl. Tests nutzen eigenes DDL und merken es nicht. | §147 AO, §257 HGB, GoBD | Spaltennamen + CHECK-Werte an Schema angleichen, Integrationstest gegen echtes `createSchema` |
| P0-2 | `schema.js:33-57` + `db.js:149` | `dokumente.nr` ohne UNIQUE, nur App-Check. Dubletten bei Race/Restore/Import möglich. | §14 Abs.4 Nr.4 UStG, GoBD | UNIQUE-Index je Kreis + Vergabe-Transaktion, Doppel-Nr-Test |
| P0-3 | `controllers/InvoiceController.js:58` | `pos13b = isGlobal13b && pos.is13b` — Einzel-13b ohne Global-Flag wird als `S` versteuert, XML (`einvoice.js:108-117`) macht es richtig → Divergenz, §14c-Risiko | §13b Abs.2 Nr.4/5 UStG | ODER-Logik (Position gewinnt, sonst global), Misch-Test |
| P0-4 | `js/einvoice.js:520-522,386-554` | Storno als `TypeCode 380` ohne Vorgangsbezug, kein BT-25/26, kein Leistungsdatum BT-72/73 | EN16931, §14 Abs.4 Nr.6 UStG | Storno `381` + Grund + Ursprungs-Nr. + `ActualDeliverySupplyChainEvent` aus `leistungszeitraum_von/bis` |
| P0-5 | `controllers/BankingController.js:980,1041` + `b2b_default_interest.test.js:7` | `baseRate=3.37` veraltet. Aktuell **1,52% seit 01.07.2026** (davor 1,27%), d.h. B2B 10,52% statt 12,37%, B2C 6,52% statt 8,37%. | §288 Abs.1/2, §247 BGB | Stichtags-Tabelle 2024–2026, Default 1,52, Staffel bei Zinswechsel |
| P0-6 | `controllers/MaengelController.js:61-64` | `calculateDruckzuschlag` erlaubt Faktor 1.0–1.99 unter gesetzlichem Minimum | §641 Abs.3 BGB (mind. doppelt) | Untergrenze 2.0 erzwingen |
| P0-7 | `js/gaeb.js:96-111` | X84 mit Namespace `200407` statt GAEB DA XML 3.3, Eigen-Schema → AVA-Ablehnung | GAEB 3.3 (2021-05) | Namespace + Pflichtknoten auf 3.3, XSD-Validierung |
| P0-8 | `js/da11.js:20-26` + `:142-144` | Umlaut-Transliteration sprengt 80-Zeichen-Festbreite; Vorzeichen-Dopplung kippt bei negativem Ergebnis | REB-VB 23.003 DA11 | Erst transliterieren dann bytegenau schneiden/padden; genau eine Vorzeichen-Quelle |
| P0-9 | `js/kunden.js:247-261` + `js/artikel.js:281-296` | Hartes Löschen ohne Beleg-Prüfung | DSGVO Art.17 vs §147 AO/GoBD | Sperren-statt-Löschen + Anonymisieren + Block bei Belegreferenz |

---

## 1. Compliance-Code (E-Rechnung / GoBD / Steuern)

Subagent `compliance-e-rechnung`. Geprüft: `InvoiceController`, `einvoice`, `datev`, `gobd`, `zugferd-builder`, `audit`, `backup`, `email`, `schema`, `db`, Tests ZUGFeRD/Belegfixierung/GoBD/DATEV/Backup.

| Datei:Zeile | Befund | Status |
|---|---|---|
| `main/backup.js:237,242` + `schema:687,1480` | `trigger_typ` `RESTORE_ROLLBACK`/`AUTO_INTERVAL` nicht im CHECK (`MANUAL,AUTO_SHUTDOWN,CRON,PRE_MIGRATION,PRE_RESTORE`) | FEHLER |
| `js/einvoice.js:223-314` | Nur Hausregeln, kein KoSIT-Schematron (BR-DE-15/21, BT-34, BT-27/44) | LÜCKE |
| `main/zugferd-builder.js:86-95` + `doc/zugferd-validation.md` | VeraPDF-Lauf offen, keine Reports `tests/test_results/verapdf/` | LÜCKE |
| `js/einvoice.js:391-396,283-288` | Leitweg-ID nur Regex, keine Prüfziffer; B2G-Fallback mit Bestellnummer riskant | LÜCKE |
| `db.js:697-724` + `einvoice:100-117` | `ust_1_tg_gueltig_bis` nie am Leistungsdatum geprüft | LÜCKE |
| `schema:1364,1367` | §48-Bauabzug nur Flag, keine 15%-Berechnung, keine 5.000/15.000-Freigrenze, keine BZSt-eibe | LÜCKE |
| `schema:1368-1369,1382` | §35a nur gespeichert, kein Rechnungsausweis, kein XML/DATEV-Mapping | LÜCKE |
| `js/gobd.js:10-33` vs `main/audit.js:38-90` | Zwei Hash-Varianten parallel (mit/ohne Status) | FEHLER |
| `main/email.js:441-453,570-581` | Mail nur Sicht-PDF, kein XML-Anhang, kein Consent §14 Abs.1 S.7 | LÜCKE |
| `schema:1350` `peppol_id` | Nur Textfeld, kein SMP/BIS-3.0/0204-Mapping, kein Access-Point | LÜCKE |
| `js/datev.js:99-101,196,211` | Festschreibung=0, 13b-Heuristik fängt Rundungs-0-Steuer als 13b | LÜCKE |
| `db.js:1411-1415` + `einvoice:485-497` | Skonto in DB, aber nicht in CII BT-20/BG-20 | LÜCKE |
| `main/backup.js:218-244` | S-/F-Backups nach 14/56 Tagen weg, keine Verfahrensdoku | LÜCKE |
| `doc/zugferd-validation.md:16` | Doku nennt URN 2.3, Code nutzt korrekt 3.0 | DOKU-LÜCKE |
| `InvoiceController:322-333` | B2G-Gate gut, aber BT-34 Verkäufer-Kontakt fehlt | OK mit Lücke |

**OK-Befunde:** 3.0-URN, AF/XMP/OutputIntent/Roundtrip, Belegfixierungs-Gate, GoBD-Sperre/Löschsperre/Hashkette, Netto+Steuer=Brutto, 13b-AE `VATEX-EU-AE`, DATEV-Tests, B2C-13b-Block.

---

## 2. Bau-Abrechnungscode (VOB / BGB / Aufmaß / Nachtrag)

Subagent `gebaeude-code`. Geprüft: `CumulativeBilling`, `Aufmass`, `Nachtrag`, `EFB`, `Kalkulation`, `VobCorrespondence`, `Maengel`, `Banking`, `da11`, `gaeb`, `gaeb-x31`, Tests Retention/Nachtrag/Übermessung/EFB/Correspondence/Kette.

| Datei:Zeile | Befund | Status |
|---|---|---|
| `Banking:1047-1061` | Verzug ab Folgetag ohne Mahnung/Nachfrist/30-Tage-Prüfung | FEHLER |
| `Cumulative:13,22,70-73` | WARRANTY 5% ohne Cap, keine 3%-Variante öffentlich (§9c Abs.2) | FEHLER |
| `VobCorr:634-635,698` | Abnahmefiktion Nr.1/Nr.2 vertauscht (12-Tage vs 6-Tage-Benutzung) | FEHLER |
| `VobCorr:607-719` | Keine Verbraucher-Belehrung §640 Abs.2 S.2, kein §650g-Angebot | LÜCKE kritisch |
| `VobCorr:399-424` | §650f-Ausnahme nur „Einfamilienhaus“ statt Verbraucherbauvertrag/Bauträger/ö.R. | FEHLER |
| `Nachtrag:88-89` | Label nur >110%, <90%-Mindermenge unterschlagen | FEHLER |
| `Nachtrag:82-95` | Nur 2_3/2_5/2_6/650b; fehlen §2 Abs.4/7-9, §650c-Kosten+Zuschläge, Urkalkulations-Bezug | LÜCKE |
| `Cumulative:66-69` | 250k-Hinweis nur EXECUTION, nicht WARRANTY, Basis „ohne USt“ unklar | LÜCKE |
| `Banking:980-1099` | Kein Fälligkeits-Helper 21/30/60 Tage | LÜCKE |
| `Aufmass:151-162` | Keine Prüfbarkeits-Checkliste §14 Abs.1, kein gemeinsam/einseitig §14 Abs.2 | LÜCKE |
| `Aufmass:58-78` | Nur REB 01/02/03/04/05/91, 91 als a*b*c statt Adress-Formel | LÜCKE |
| `Aufmass:199-214` | Abzug ohne Zulage-Hinweis Leibung/Öffnung, Mapping zu eng | LÜCKE |
| `Cumulative:193-195` | EXECUTION-Rückgabe pauschal +1 Jahr statt Abnahme + Mängelsicherheit | LÜCKE |
| `EFB:2,657` | „VHB 2024/2026“ falsch (maßgeblich 2017/2019), AGK-Fallback `||` frisst 0% | FEHLER |
| `EFB:301` + `Kalkulation:11-40` | Verprobung 5 Cent statt 0,00, Defaults 24,50 vs 26,00 inkonsistent | LÜCKE |
| `gaeb-x31:76-87,178-180` + `gaeb:10-69` | Doppel-Sign, RowNo-Padding, unaufgelöst→0, Regex statt DOM/XSD | LÜCKE |
| `VobCorr:401` | §650f 10 Kalendertage fix statt „angemessen“ + Zugang | LÜCKE |
| `Maengel:412-460` | Keine 4/2/1-vs-5-Jahre-Differenzierung, kein Rüge-Neulauf-Rechner | LÜCKE |

**OK:** `F_t=L_t-SUM`, Steuer trotz Einbehalt voll, 18 Werktage Mo–Sa, 10%-Kürzung, Übermessung 2,50/0,10/1,00/0,50, EFB-BGK 3.1.1–3.1.5 + VL>KL, Behinderung §6 + Bedenken §4 Abs.3, 110%-§650f-Formel.

---

## 3. Gebäude-Module (Objekt / Dauer / Putz / Zeit / SOKA)

Subagent `gebaeude-planung`. Alle 5 Module existieren als Code + Tests + Pläne.

| Modul | Datei | Stand | Lücke / Fix |
|---|---|---|---|
| Objekt | `ObjektController:1-136`, `objekte.js:1-866`, Tests Stamm/Logik/Historie | JA | WEG §§18/28, BetrKV-Katalog, HeizkostenV 50-70% + §12-Kürzung, §556-Abrechnung, CO₂KostAufG, Umlageschlüssel als Pflichtfelder ergänzen |
| Dauer | `DauerrechnungController:2-267`, `dauerrechnungen.js:1-833`, 4 Testdateien | JA | Leistungszeitraum auf Rechnung drucken (§14 Abs.4 Nr.5), §14b-Hinweis, GoBD-XML-Archiv; 8→10-Jahre-Text |
| Putz | `ReinigungController:1-322`, `putzplan.js:1-736` | JA, normfest | Zuschläge 30/80/200 + LG1 15,00/LG6 18,40 OK; ergänzen: DGUV-101-605-Checkliste, 10.-ArbbV-Verweis, LG5-Klärung |
| Zeit | `ZeiterfassungController:1-556`, Phase3-Test 509 Z. | JA, ArbZG-Kern OK | §17-MiLoG 7-Tage/2-Jahre-Validierung, NachweisG-Export, Branchenkennzeichen Bau/Reinigung |
| SOKA/Sub | `SokaBau:1-487`, `SubcontractorCompliance:2-104`, Phase4-Test | JA | Sätze per Stichtag versionieren, UB-Ampel + Online-Abfrage, **Abgrenzungs-Assistent >50% Bau fehlt** (kein Auto-Urteil), SchwarzArbMoDiG vormerken |
| IDS | `IDSConnect:1-311` | JA | Branchenstandard OK, nur DATANORM/DATEV-Doku + GoBD-Link ergänzen |

---

## 4. Verkauf / UX-Code (Angebot / Kunde / Bank / Backup / A11y)

Subagent `app-qualitaet-ux`. Geprüft: `editor`, `kunden`, `artikel`, `banking`, `berichte`, `dashboard`, `einstellungen`, `Banking`, `Sepa`, `Controlling`, `Bautagebuch`, `email`, `backup-service`, Tests SMTP/OPOS/SEPA/Artikel.

| Datei:Zeile | Befund | Status |
|---|---|---|
| `kunden:194,222` | USt-IdNr nur Text, keine BZSt-REST-Prüfung (Pflicht seit 01.07.2025, XML-RPC Ende 30.11.2025) | LÜCKE |
| `Sepa:152-177,258-299` | pain.008 OK, aber keine 36-Monate-Verfallsprüfung | LÜCKE |
| `banking:158` + `Banking:158,600` | Nur Datei-Upload, kein EBICS 3.0, kein Import-Hash-Protokoll | LÜCKE |
| `dashboard:50-57` | Kein 30-Tage-Auto-Verzug, keine 21/30-Tage-VOB-Automatik | LÜCKE |
| `artikel:54,189,202` | Einheit hart „Stk.“, kein Stamm-`einheit` | LÜCKE |
| `backup:22,91-95` | Nur lokal, kein 3-2-1/Offsite/Restore-Log | LÜCKE |
| Buttons/`code.html` | Nur `title`, kein `aria-label`/Fokus/Kontrast | LÜCKE (BFSG für reine Desktop-App meist ausgenommen, aber Vergabe-Risiko) |
| `editor:736` | „30 Arbeitstage Bindefrist“ — VOB kennt Kalendertage (30 national / 60 EU), kein `gueltig_bis` | FEHLER |
| `artikel:167-259` | Keine GPSR-Felder (Hersteller/Charge/Warnung) seit 13.12.2024 | FEHLER |
| `backup:94-119` | Keine AES-Verschlüsselung | FEHLER |

**OK:** 40€ nur B2B, Kunden-Pflicht + B2G-Leitweg-Zwang, pain.008 + TARGET2 + CI-Check, Pre-Notification, GAEB-Import/Export vorhanden, SMTP-safeStorage, OPOS/SEPA-Tests.

---

## Quellen (Stand 09/2026, Auswahl — volle URLs in Subagent-Berichten)

**bauprofessor.de (Startquelle):**
- https://www.bauprofessor.de/rechnungsangaben-bauleistungen
- https://www.bauprofessor.de/elektronische-rechnung/
- https://www.bauprofessor.de/steuerschuldnerschaft-bauleistungen/
- https://www.bauprofessor.de/freistellungsbescheinigung/
- https://www.bauprofessor.de/bauabzugsteuer/
- https://www.bauprofessor.de/stornorechnung-bauleistungen/
- https://www.bauprofessor.de/sicherheitseinbehalt-vob
- https://www.bauprofessor.de/sicherheitsleistung-vob
- https://www.bauprofessor.de/abschlagszahlung-vob/
- https://www.bauprofessor.de/schlusszahlung
- https://www.bauprofessor.de/aufmassregeln/
- https://www.bauprofessor.de/nachtragsarten-nach-vob
- https://www.bauprofessor.de/efb-preis/
- https://www.bauprofessor.de/behinderungsanzeige
- https://www.bauprofessor.de/rechtsfolgen-abnahme
- https://www.bauprofessor.de/maengelansprueche
- https://www.bauprofessor.de/bindefrist/ + /zuschlag-zum-angebot/ + /zahlungsverzug/ + /mahnung/
- https://www.bauprofessor.de/facility-management + /arbeitszeit-im-baugewerbe/ + /soka-bau

**Gesetze:**
- https://www.gesetze-im-internet.de/ustg_1980/__14.html + __13b + __14b
- https://www.gesetze-im-internet.de/estg/__48.html + __48b + __35a
- https://www.gesetze-im-internet.de/ao_1977/__146.html + __147.html
- https://www.gesetze-im-internet.de/hgb/__257.html
- https://www.gesetze-im-internet.de/bgb/__145.html + __286 + __288 + __247 + __640 + __641 + __650b + __650c + __650f + __650g
- https://www.gesetze-im-internet.de/milog/__17.html + /arbzg/ + /nachwg/__2.html
- https://www.gesetze-im-internet.de/betrkv/BJNR234700003.html + /heizkostenv/ + /bgb/__556.html
- https://dejure.org/gesetze/VOB-B/12.html + /16.html + /17.html + /14.html, https://dejure.org/gesetze/VOB-A/9c_EU.html + /10.html

**Behörden/Standards 2025/2026:**
- BMF E-Rechnung FAQ + 15.10.2024: https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html
- GoBD 14.07.2025: https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Weitere_Steuerthemen/Abgabenordnung/2025-07-14-GoBD-2-aenderung.html
- XRechnung/KoSIT: https://xeinkauf.de + https://github.com/itplr-kosit/validator-configuration-xrechnung
- ZUGFeRD 2.3: https://www.ferd-net.de/standards/zugferd
- Basiszins 1,52% 01.07.2026: https://www.bundesbank.de/de/presse/pressemitteilungen/bekanntgabe-des-basiszinssatzes-zum-1-juli-2026-anpassung-auf-1-52--941386
- BZSt REST-API: https://www.bzst.de/SharedDocs/Newsletter/UStKV/20250701_newsletter_01_2025.html
- GAEB 3.3: https://www.gaeb.de/wp-content/uploads/2021/07/Fachdokumentation_GAEB-DA-XML_3.3_2021-05.pdf
- SOKA: https://www.soka-bau.de/soka-bau-a-z/arbeitszeiterfassung
- BIV/RTV 2026: https://www.die-gebaeudedienstleister.de/gebaeudedienstleister/tarifinformationen
- BFSG: https://www.bundesfachstelle-barrierefreiheit.de/DE/Barrierefreiheitsstaerkungsgesetz/FAQ/faq
- BSI CON.3: https://www.bsi.bund.de/SharedDocs/Downloads/DE/BSI/Grundschutz/IT-GS-Kompendium_Einzel_PDFs_2023/03_CON_Konzepte_und_Vorgehensweisen/CON_3_Datensicherungskonzept_Edition_2023.pdf

---

## Vorschlag für Plan-Gespräch

1. P0-Bugs (Backup, Nr.-Kreis, §13b, Storno, Basiszins) — kleinster Aufwand, größtes Risiko
2. Compliance-Plan (KoSIT, VeraPDF, Peppol, Verfahrensdoku, USt-1-TG/§48/§35a)
3. Bau-Plan (3%-Cap, Verbraucher, 90/110%, Fälligkeit, GAEB 3.3, DA11)
4. Gebäude-Plan (WEG/BetrKV/Heizkosten, MiLoG-Export, SOKA-Abgrenzung)

Offen für deine Prüfung — danach sprechen wir über die `plans/`-Reihenfolge.
