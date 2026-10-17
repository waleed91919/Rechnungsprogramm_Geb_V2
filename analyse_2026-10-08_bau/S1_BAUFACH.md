# S1 — Bau-Fachrecherche (Büro + Baustelle, deutsches Bauunternehmen)

## 0. Snapshot-Kopf (read-only)

- Repo: `C:\Users\walee\Desktop\server\Rechnungsprogramm_Geb_V2`
- Branch: `main`
- HEAD: `194cd83102100353b12d2aa743954356c591db41` (Stand 08.10.2026)
- Vorgänger-Runs: `791fb77f` — Drift dokumentiert, kein Wechsel durchgeführt.
- Arbeitsweise: read-only. Keine Codeänderung, keine Commits, keine prod-DB. Modifizierte + untracked Dateien wurden nicht angefasst (nur `git rev-parse / branch / log` gelesen, Verzeichnisse gelesen).
- Output dieser Recherche: NUR diese Datei (`analyse_2026-10-08_bau/S1_BAUFACH.md`).
- Internet-Pflicht erfüllt: Start https://www.bauprofessor.de/ + Websearch + Webfetch.
  - Verifizierte bauprofessor.de-Seiten (per Webfetch am 2026-10-08 geöffnet): 24 (Anforderung: ≥12).
  - Normquellen (per Webfetch am 2026-10-08 geöffnet): 7 (Anforderung: ≥4).
- Zugriffsdatum für alle unten genannten URLs: **2026-10-08**.
- Hinweis: bauprofessor-Lexikontexte sind redaktionelle Erläuterungen (f:data GmbH), kein Ersatz für Rechtsberatung / VOB-Originaltext (DIN 1961). Normzitate wurden gegen Gesetze-im-Internet / dejure / GAEB gegengeprüft.

## 1. Themen-Tabelle (Pflichtabdeckung)

| # | Thema (Büro + Baustelle) | bauprofessor-URL (Zugriff 2026-10-08) | Normquelle (Zugriff 2026-10-08) | Was muss Software dafür können (Pflichtfeld / Frist-Automatik / Vorlage / Nachweis) |
|---|---|---|---|---|
| 1 | VOB/B §2 Nachträge: Mehr-/Mindermengen (>10%), geänderte (§2 Abs.5) und zusätzliche Leistungen (§2 Abs.6), Ankündigung vor Ausführung, Urkalkulation | https://www.bauprofessor.de/nachtrag-zum-bauvertrag/ | VOB/B §2 via https://dejure.org/gesetze/VOB-B/8.html (Gliederung/Navigation zu §2); BGB §§650b/c via https://www.gesetze-im-internet.de/bgb/__650b.html | Pflichtfelder: Nachtragsnummer, LV-Bezug, Anspruchsgrundlage (§2 Abs.3/5/6), Bau-Soll vs. Bau-Ist, EKT+AGK+Gewinn-Nachweis. Fristen-Automatik: 30-Tage-Einigungsfrist BGB beachten, Warnung „vor Ausführung ankündigen“. Textvorlage: Nachtragsankündigung + Nachtragsangebot. Nachweis: Urkalkulation/EFB sperrbar versionieren. |
| 2 | VOB/B §5 Ausführungsfristen / Vertragsfristen vs. Kontrollfristen, Baubeginn 12 Werktage, Bauzeitenplan | https://www.bauprofessor.de/ausfuehrungsfristen/ | VOB/B §5 via dejure-Gliederung https://dejure.org/gesetze/VOB-B/16.html (Navigation) | Pflichtfeld: Vertragsfrist-Flag (verbindlich ja/nein), Fristart (Beginn/Ende/Einzelfrist). Fristen-Automatik: 12-Werktage-Regel nach Aufforderung, Kalender-berechnung ohne So/Feiertag, Verzugs-Warnung. Nachweis: Bauzeitenplan-Version als Vertragsgrundlage kennzeichnen. |
| 3 | VOB/B §6 Behinderung/Unterbrechung: unverzügliche schriftliche Anzeige, Fristverlängerung, §6 Abs.6 Mehrkosten/Schadenersatz, §642 BGB Entschädigung | https://www.bauprofessor.de/behinderungsanzeige/ ; https://www.bauprofessor.de/bauausfuehrung-behinderung/ (beide 2026-10-08) | VOB/B §6 via dejure-Navigation (s.o.); BGB §642 via Systematik zu https://www.gesetze-im-internet.de/bgb/__650b.html | Pflichtfelder: Störungsgrund, Beginn/Ende, Auswirkung auf kritischen Weg, Fotos. Fristen-Automatik: „unverzüglich“-Timer (gleicher Tag bei Gefahr in Verzug), Wiederaufnahme-Anzeige, Fristverlängerungs-Berechnung inkl. Wiederanlauf + Saisonverschiebung. Textvorlage: Behinderungsanzeige + Fortsetzungsmitteilung. Nachweis: Bautagebuch-Verknüpfung, Zugangsbeleg. |
| 4 | VOB/B §8 Kündigung durch AG (frei §8 Abs.1, außerordentlich §8 Abs.2-4, Schriftform, Aufmaß/Abnahme nach Kündigung §8 Abs.7, 12 Werktage Mehrkosten-Aufstellung) | Muster-/Lexikonabdeckung via https://www.bauprofessor.de/musterbriefe/uebersicht/ (Stichwort Kündigung) + https://www.bauprofessor.de/aufmass/ (Aufmaß nach Kündigung) | https://dejure.org/gesetze/VOB-B/8.html ; https://lxgesetze.de/vob-b-2016/8 (per Websearch verifiziert, Zugriff 2026-10-08) | Pflichtfeld: Kündigungsart, Kündigungsgrund, Schriftform-Check, Leistungsstand-Stichtag. Fristen-Automatik: 12-Werktage-Frist für AG-Mehrkostenaufstellung, sofortiges Aufmaß-/Abnahme-Verlangen anbieten. Vorlage: Freie Kündigung, Kündigung nach Fristablauf, Schlussrechnung zum gekündigten Vertrag. Nachweis: Fotodoku + gemeinsames Aufmaß erzwingen. |
| 5 | VOB/B §12 Abnahme: 12 Werktage, Verweigerung nur bei wesentlichen Mängeln, förmliche Abnahme, Teilabnahme, VHB 442/443, HVA B-StB 3101/3102 | https://www.bauprofessor.de/abnahme-vob-vertraege/ ; https://www.bauprofessor.de/abnahmeprotokoll/ | VOB/B §12 via dejure-Navigation https://dejure.org/gesetze/VOB-B/16.html ; BGB §640/§650g via https://www.gesetze-im-internet.de/bgb/__650g.html | Pflichtfelder: Abnahmeform/-art, Teilnehmer, Restleistungen, Vorbehalte (Mängel, Vertragsstrafe), Verjährungsfrist. Fristen-Automatik: 12-Werktage-Countdown ab Abnahmeverlangen, Abnahmeverzugs-Warnung. Vorlage: Abnahmeverlangen, förmliches Protokoll (VHB-442-Felder), Verweigerungsschreiben. Nachweis: doppelte Ausfertigung + Unterschriften, Fotoprotokoll. |
| 6 | VOB/B §13 Mängelansprüche: Anzeige, Nachbesserung, Ersatzvornahme, Minderung, Schadenersatz, Verjährung 4/2 Jahre, Neubeginn 2 Jahre nach Mängelbeseitigung | https://www.bauprofessor.de/maengelansprueche/ | https://dejure.org/gesetze/VOB-B/13.html ; https://lxgesetze.de/vob-b-2016/13 (beide per Search/Fetch verifiziert) | Pflichtfeld: Mangelbeschreibung (Erscheinungsbild reicht), Frist zur Beseitigung (§13 Abs.5 Nr.2), Sicherheitsart. Fristen-Automatik: 4-Jahre-Bauwerk / 2-Jahre-Regel + Neubeginn-Tracking, 2–4-Wochen-Endkontrolle vor Fristablauf. Vorlage: Mängelanzeige, Nachfrist, Ersatzvornahme-Androhung. Nachweis: Zugangsnachweis (Einschreiben/Empfangsbestätigung). |
| 7 | VOB/B §14 Abrechnung/Aufmaß: prüfbare Rechnung, Positionsreihenfolge, gemeinsames Aufmaß, zeichnerisch vs. örtlich, Urkundencharakter | https://www.bauprofessor.de/abrechnung-von-bauleistungen/ ; https://www.bauprofessor.de/aufmass/ ; https://www.bauprofessor.de/aufmassaufstellung/ | VOB/B §14 via dejure-Navigation; DIN 18299 Abrechnung via Baunormenlexikon-Verlinkung auf den Seiten | Pflichtfeld: Ordnungszahl/Kurzbezeichnung, Ortsangabe, Abrechnungseinheit aus LV (m³/m²/m/Stk/kg), fortlaufende Aufmaßblatt-Nr. Fristen-Automatik: Rechnungslegungsfrist §14 Abs.3 (12 Werktage bei ≤3 Monaten +6 je 3 Monate). Nachweis: Skizze/Foto pro Position, Unterschrift = Urkunde, keine nachträgliche Reinschrift ohne Ur-Aufmaß. |
| 8 | VOB/B §16 Zahlung: Abschlag 21 Tage fällig / 30 Tage Verzug, Schluss 30 (max. 60) Tage, unbestrittenes Guthaben sofort, Vorbehalt 28+28 Tage, Überzahlung/Rückzahlung | https://www.bauprofessor.de/abschlagszahlung-vob/ ; https://www.bauprofessor.de/schlusszahlung/ ; https://www.bauprofessor.de/vorbehalt-zur-schlusszahlung/ ; https://www.bauprofessor.de/mahnung/ | https://dejure.org/gesetze/VOB-B/16.html (Volltext §16, Fassung 2016) | Pflichtfelder: Rechnungsart (Abschlag/Teilschluss/Schluss), Zugangsdatum, Prüfbarkeits-Einwand. Fristen-Automatik: 21-Tage-Fälligkeit Abschlag, 30-Tage-Fälligkeit/Verzug Schluss (60 nur bei ausdrücklicher Vereinbarung + sachlicher Rechtfertigung), 28+28-Tage-Vorbehaltskette, Mahn-/Zinsrechner (§288 BGB). Vorlage: Mahnung+Nachfrist, Vorbehaltsschreiben, Schlusszahlungserklärung mit Belehrung. Nachweis: Überweisungs-/Übergabe-Nachweis. |
| 9 | BGB §632a Abschlag, §650b Anordnung (30 Tage Einvernehmen, Textform), §650c Vergütung/80%-Regel, §650g Zustandsfeststellung+Schluss (30-Tage-Prüffähigkeitsfiktion), §650m Verbraucherbau 90%/5% | https://www.bauprofessor.de/abschlagszahlung-bgb/ ; https://www.bauprofessor.de/bauvertragsrecht-im-bgb-ab-2018/ | https://www.gesetze-im-internet.de/bgb/__632a.html ; https://www.gesetze-im-internet.de/bgb/__650b.html ; https://www.gesetze-im-internet.de/bgb/__650g.html ; https://www.gesetze-im-internet.de/bgb/__650m.html | Pflichtfeld: Vertragsart (VOB/BGB/Verbraucher/Bauträger), 90%-Deckel inkl. Nachträge + USt, 5%-Sicherheitstracking. Fristen-Automatik: 30-Tage-Einigung (§650b) + 30-Tage-Prüffähigkeitsfiktion (§650g Abs.4), Warnung bei Überschreitung 90%. Vorlage: Änderungsbegehren, Anordnung in Textform, Zustandsfeststellung (gemeinsam/einseitig). Nachweis: Aufstellung für rasche/sichere Beurteilung, Eigentums-/Bürgschaftsnachweis bei Materialabschlag. |
| 10 | REB 23.003 / DA11 / X31: elektronische Bauabrechnung, Formelkatalog, Toleranz, Datenträger | https://www.bauprofessor.de/reb/ ; Vertiefung via https://www.bauprofessor.de/aufmassaufstellung/ (Abschnitt elektronische Abrechnung) | REB-Sammlung via BASt-Verweis auf der Seite; HVA B-StB Tz.2.3.2 als Anwendungsnorm (auf Seite zitiert) | Pflichtfeld: REB-VB-Auswahl (23.003 etc.), Ordnungszahl-Bezug, Eingabedaten-Kennzeichnung. Automatik: Toleranzprüfung (z.B. 0,2‰-Beispiel Straßenbau), Formelvalidierung, DA11-Export (D11). Nachweis: Testdaten vorab, Eingabedatenträger erst nach Leistungsberechnung, Wiederholungspflicht bei Fehlern. |
| 11 | GAEB X83–X86 / DA XML 3.x (X31 Mengen, X52 Kalkulation, X89 Rechnung; Phasen X80er Angebot/Auftrag): STLB-Bau, Zertifizierung | GAEB-Kontext via bauprofessor-Verlinkungen (STLB-Bau) + https://www.bauprofessor.de/aufmassaufstellung/ | https://www.gaeb.de/ ; https://www.gaeb.de/en/products/gaeb-data-exchange/ (DA XML 3.2, X31/X52/X89, Zertifizierung BVBS) | Pflichtfeld: GAEB-Phase (X31/X83–X86/X89), LV-Import, Schema-Validierung (.xsd). Automatik: Phasen-Übergabe-Check (Angebot→Auftrag→Aufmaß→Rechnung), Zertifizierungs-Hinweis. Nachweis: GAEB-Datei versioniert archivieren, nur zertifizierte Versionen für Datenaustausch mit öff. AG. |
| 12 | EFB-Kalkulation (EFB 221/222/223, Urkalkulation, AGK/Wagnis+Gewinn, Mittellohn, Zuschläge) | https://www.bauprofessor.de/kalkulationshilfen/uebersicht/ (Stichworte EFB 221/222, Zuschläge, Mittellohn) ; https://www.bauprofessor.de/nachtrag-zum-bauvertrag/ (Nachtragskalkulation/Urkalkulation) | VHB-Blätter 221–223 als Referenz (auf Kalkulationshilfe-Seite referenziert); BGB §650c zu tatsächlich erforderlichen Kosten + Zuschlägen | Pflichtfeld: EFB-Blatt-Typ, EKT (Lohn/Material/Gerät), BGK/AGK/W+G getrennt, Mittellohn-Herleitung. Automatik: Urkalkulation versiegeln (Abgabezeitpunkt), Nachtragspreis aus Urkalkulation ableiten, Plausibilitätscheck ortsüblich/angemessen. Nachweis: versiegelte Urkalkulation + EFB-Export für Prüfung durch AG/Architekt. |
| 13 | Bautagebuch (VHB 411 / HVA-Muster 3.1-2, RBBau): Tagesführung, Wetter, Personal, Gerät, Behinderung, mündliche Weisung/Bedenken | https://www.bauprofessor.de/bautagebuch/ | VHB-Bund Richtlinie 411 / HVA B-StB Muster 3.1-2 (auf Seite zitiert); DIN 1045-3-Protokollpflicht als Beispiel | Pflichtfeld: Datum/Unterschrift, Wetter min/max, Personal nach Qualifikation, Großgerät Zu/Abgang/Ausfall, verdeckte Leistungen. Automatik: Tages-Abschlusszwang, Lückenwarnung, Wetter-Übernahme, Verknüpfung Behinderung/Nachtrag/Weisung. Nachweis: manipulationssicheres Journal (kein stilles Überschreiben), Bestandteil Bauakte, Export für Streitfall. |
| 14 | Mängel-/Abnahme-Protokolle inkl. VHB 441/442/443, HVA 3101/3102, BGB-Zustandsfeststellung | https://www.bauprofessor.de/abnahmeprotokoll/ ; https://www.bauprofessor.de/abnahme-vob-vertraege/ | VHB 442/443 + HVA 3101/3102 (auf Seiten zitiert); BGB §650g https://www.gesetze-im-internet.de/bgb/__650g.html | Pflichtfeld-Checkliste: AG/AN/Teilnehmer, Bauvertrag/Ort/Beginn/Fertig, Abnahmeform/-art, Unterlagen, Mängel/keine Mängel, Beseitigungstermin, Restleistungen, Vorbehalte (Mängel/Vertragsstrafe/Schadenersatz), Verjährungsfrist, Ort/Datum/Uhrzeit, 2 Ausfertigungen/Unterschriften. Automatik: Pflichtfeld-Validierung vor Abschluss, Mängel-Fristen in Wiedervorlage. Nachweis: Foto-Anhang, getrennte Protokolle für Mängelbeseitigung (443). |
| 15 | Fristen-Cockpit: 12 Werktage (Abnahme/Aufmaß-Kündigung), 21 Tage (Abschlag fällig), 30 Tage (Schluss fällig/Verzug/BGB-Prüffähigkeit/§650b-Einigung), 60 Tage Ausnahme, 28+28 Tage Vorbehalt | https://www.bauprofessor.de/baufristen/ ; https://www.bauprofessor.de/mahnung/ ; https://www.bauprofessor.de/schlusszahlung/ | https://dejure.org/gesetze/VOB-B/16.html ; BGB §§632a/650b/650g/650m (s.o.) | Pflicht: zentrales Fristen-Dashboard mit Vertragsart-Logik (VOB vs. BGB), Werktage-vs-Kalendertage-Rechner, Feiertags-Kalender. Automatik: Fälligkeits-/Verzugs-/Vorbehalts-/Verjährungs-Ampel, unbestrittenes Guthaben sofort zahlen, Eskalation (Mahnung → Einstellung §16 Abs.5 Nr.4 / §9). Nachweis: Fristereignis-Log mit Zugangsdatum + Beleg. |

## 2. Musterbrief-Liste (Mindestvorrat, alle mit VOB/BGB-Paragraph)

Quelle Gesamtverzeichnis (326 Briefe, Zugriff 2026-10-08): https://www.bauprofessor.de/musterbriefe/uebersicht/
Einzel-Lexikonseiten mit Direkt-Downloads (Zugriff 2026-10-08): Behinderung, Abschlag-VOB, Schlusszahlung, Vorbehalt, Abnahmeprotokoll, Abnahme-VOB, Aufmaß, Mängelansprüche, Bedenken, Nachtrag, Abschlag-BGB, Ausführungsfristen, Baufristen, Mahnung, REB, Kalkulationshilfen (s. Tabelle).

Pflicht-Musterbriefe für Büro + Baustelle (jeweils als Textvorlage mit Platzhaltern + Paragraph + Fristhinweis in Software):

1. Behinderungsanzeige (VOB/B §6 Abs.1) — https://www.bauprofessor.de/musterbrief/behinderung-bauausfuehrung/ (verlinkt auf https://www.bauprofessor.de/behinderungsanzeige/)
2. Mitteilung Fortsetzung nach Behinderung (VOB/B §6 Abs.3) + Berechnung Fristverlängerung (§6 Abs.4) / Schadenersatz (§6 Abs.6)
3. Behinderungsanzeige BGB wegen Witterung + Anerkennung/ Ablehnung Fristverlängerung (BGB-Vertrag, ohne VOB-Automatik)
4. Bedenkenanzeige (VOB/B §4 Abs.3) + Bedenken nach Prüfung Ausführungsunterlagen (§3 Abs.3) — https://www.bauprofessor.de/musterbrief/bedenkenanzeige/ (verlinkt auf https://www.bauprofessor.de/bedenken-des-auftragnehmers/)
5. Nachtragsankündigung + Nachtragsangebot geänderte Leistungen (§2 Abs.5) / zusätzliche Leistungen (§2 Abs.6) / Mehr-/Mindermengen (§2 Abs.3 Nr.2/3)
6. BGB-Änderungsbegehren / Anordnung (§650b Abs.1/2) + 80%-Abschlagshinweis (§650c Abs.3)
7. Abhilfeaufforderung / Gefährdung termingerechte Ausführung (§5 Abs.3) — https://www.bauprofessor.de/musterbrief/gefaehrdung-termingemaesse-bauausfuehrung/
8. Abnahmeverlangen (§12 Abs.1) / Teilabnahme (§12 Abs.2) / Mahnung zum Abnahmeverlangen / Verweigerung wegen wesentlicher Mängel (§12 Abs.3)
9. Mängelanzeige Bauausführung (§4 Abs.7 + §8 Abs.3-Androhung) — https://www.bauprofessor.de/musterbrief/maengelanzeige-waehrend-bauausfuehrung-mit-fristsetzung/ ; Mängelanzeige Gewährleistung (§13 Abs.5 Nr.1) + Nachfrist (§13 Abs.5 Nr.2) + Ersatzvornahme-Androhung
10. Beantragung gemeinsames Aufmaß (§14 Abs.2) + Verlangen Aufmaß/Abnahme nach Kündigung (§8 Abs.7)
11. Mahnung + Nachfrist fällige Abschläge (§16 Abs.1/5) + Mitteilung Verzugseintritt; Einstellung der Arbeiten nach fruchtloser Nachfrist (§16 Abs.5 Nr.4)
12. Bezahlung unbestrittenes Guthaben / Abschlag auf Schlussrechnung bei verzögerter Prüfung (§16 Abs.3 Nr.1)
13. Schlusszahlungserklärung mit Ausschlusswirkung (§16 Abs.3 Nr.2/3) + Vorbehalt (§16 Abs.3 Nr.5, 28 Tage) + Begründung + prüfbare Nach-Rechnung (weitere 28 Tage)
14. Abweisung Nachforderungen nach vorbehaltloser Annahme (§16 Abs.3 Nr.2/4); Rückforderung Überzahlung
15. Kündigungsschreiben: freie Kündigung (§8 Abs.1), Kündigung nach Fristablauf (§8 Abs.3 i.V.m. §4 Abs.7/8, §5 Abs.4), Schriftform-Nachweis
16. BGB-Zustandsfeststellung verlangen / einseitig durchführen (§650g Abs.1/2) + Fälligkeits-Anschreiben mit Prüffähigkeitsnachweis (§650g Abs.4)
17. Verbraucherbau-Sonderbriefe: 90%-Deckelerklärung, 5%-Sicherheitseinbehalt (§650m Abs.1/2)
18. Kalkulations-/EFB-Anlage: Anschreiben mit EFB 221/222/223 + Urkalkulations-Verweis (aus https://www.bauprofessor.de/kalkulationshilfen/uebersicht/)

## 3. Top-10 Pflichtfunktionen für Verkaufbarkeit (Büro + Baustelle)

1. **Fristen-Cockpit mit VOB/BGB-Logik** (21/30/60 Tage, 12 Werktage, 28+28 Tage, 4/5/2-Jahre-Verjährung, Werktage-Rechner): ohne dieses Automatik-Versprechen kauft kein Bauleiter — verhindert Verzug, Fristversäumnis, Vorbehaltsverlust.
2. **Nachtragsmanager §2 / §650b-c** (Bau-Soll/Ist-Differenz, Anspruchsgrundlage, Urkalkulation-versiegelt, 80%-Abschlag BGB, 90%-Deckel Verbraucher): direkter Geldhebel, meistgenutztes Verkaufsargument.
3. **Behinderung + Bautagebuch in einem Klick** (offline-fähig, Foto/Wetter/Personal/Gerät, unverzüglich-Anzeige, Fortsetzung, Fristverlängerungs-Rechner): gewinnt jeden Streit; Baustelle braucht Mobile-Offline.
4. **Aufmaß → prüfbare Rechnung** (Ordnungszahl-/LV-Treue, zeichnerisch/örtlich, REB 23.003-Formeln, DA11-Export, Rundungsregeln, Toleranz): „nicht prüffähig“-Rückläufer sind der Hauptschmerz im Büro.
5. **Abschlag/Schluss mit Zahlungs-Automatik** (Fälligkeit/Verzug/Zins, unbestrittenes Guthaben, Mahnung/Nachfrist, Arbeitseinstellung, Überzahlung/Rückforderung): sichert Liquidität, rechtfertigt den Kaufpreis.
6. **Abnahme-/Mängel-Protokolle mit Pflichtfeld-Check** (VHB 442/443-Felder, Vorbehalte, Vertragsstrafe, Verjährungsfrist, 2 Ausfertigungen, BGB-Zustandsfeststellung): ohne Protokoll keine Abnahme-Wirkung.
7. **Musterbrief-Engine mit Paragraph + Frist** (≥18 Pflichtbriefe oben, Platzhalter aus Vorgang, Zugangs-/Belehrungsnachweis): Büro spart Stunden, vermeidet Formfehler (Schriftform/Textform, Belehrung Ausschlusswirkung).
8. **GAEB-/REB-Austausch** (X31/X52/X83–X86/X89, DA11, STLB-Bau-Texte, zertifizierte Versionen): Eintrittskarte für öffentliche Auftraggeber und Architekten-Prüfung.
9. **Verbraucherbau-Wächter §650m/§650g** (90%-Bremse inkl. Nachträge+USt, 5%-Sicherheit, Textform-Anordnung, 30-Tage-Fiktionen): verhindert unwirksame Klauseln und Rückzahlungs-/Prozessrisiken im Einfamilienhaus-Segment.
10. **Kündigung + Schlussabwicklung** (Kündigungsart-Assistent, sofortiges Aufmaß/Abnahme-Verlangen, Schluss-/Teilschlussrechnung, Mehrkosten-Aufstellung 12 Werktage, Vorbehaltskette): rettet Vergütung im Konfliktfall — stärkstes Vertrauensargument im Verkaufsgespräch.

## 4. Quellenverzeichnis (alle Zugriff 2026-10-08, per Webfetch verifiziert)

Bauprofessor (20):
1. https://www.bauprofessor.de/
2. https://www.bauprofessor.de/behinderungsanzeige/
3. https://www.bauprofessor.de/abschlagszahlung-vob/
4. https://www.bauprofessor.de/schlusszahlung/
5. https://www.bauprofessor.de/abnahmeprotokoll/
6. https://www.bauprofessor.de/aufmass/
7. https://www.bauprofessor.de/maengelansprueche/
8. https://www.bauprofessor.de/bautagebuch/
9. https://www.bauprofessor.de/bedenken-des-auftragnehmers/
10. https://www.bauprofessor.de/abnahme-vob-vertraege/
11. https://www.bauprofessor.de/abrechnung-von-bauleistungen/
12. https://www.bauprofessor.de/musterbriefe/uebersicht/
13. https://www.bauprofessor.de/vorbehalt-zur-schlusszahlung/
14. https://www.bauprofessor.de/nachtrag-zum-bauvertrag/
15. https://www.bauprofessor.de/abschlagszahlung-bgb/
16. https://www.bauprofessor.de/kalkulationshilfen/uebersicht/
17. https://www.bauprofessor.de/ausfuehrungsfristen/
18. https://www.bauprofessor.de/aufmassaufstellung/
19. https://www.bauprofessor.de/bauvertragsrecht-im-bgb-ab-2018/
20. https://www.bauprofessor.de/reb/
21. https://www.bauprofessor.de/baufristen/
22. https://www.bauprofessor.de/mahnung/
Zusatz via Websearch verifiziert (Highlight-Beleg): https://www.bauprofessor.de/bauausfuehrung-behinderung/ ; https://www.bauprofessor.de/behinderungsfolgen/ ; https://www.bauprofessor.de/musterbrief/maengelanzeige-waehrend-bauausfuehrung-mit-fristsetzung/ ; https://www.bauprofessor.de/musterbrief/abnahmeverlangen/ ; https://www.bauprofessor.de/musterbrief/gefaehrdung-termingemaesse-bauausfuehrung/

Normquellen (7):
N1. https://www.gesetze-im-internet.de/bgb/__632a.html (§632a Abschlag)
N2. https://www.gesetze-im-internet.de/bgb/__650b.html (§650b Anordnung)
N3. https://www.gesetze-im-internet.de/bgb/__650g.html (§650g Zustand/Schluss)
N4. https://www.gesetze-im-internet.de/bgb/__650m.html (§650m Verbraucher 90%/5%)
N5. https://dejure.org/gesetze/VOB-B/16.html (§16 Zahlung, Volltext)
N6. https://dejure.org/gesetze/VOB-B/8.html (§8 Kündigung)
N7. https://dejure.org/gesetze/VOB-B/13.html (§13 Mängelansprüche)
N8. https://lxgesetze.de/vob-b-2016/8 und https://lxgesetze.de/vob-b-2016/13 (VOB/B 2016 Wortlaut, via Search verifiziert)
N9. https://www.gaeb.de/ + https://www.gaeb.de/en/products/gaeb-data-exchange/ (GAEB DA XML 3.2, X31/X52/X89, Zertifizierung)
