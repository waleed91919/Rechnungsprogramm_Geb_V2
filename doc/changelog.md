# Changelog / Fortschritt

## 25.08.2026 (Gebäude-Module F3 Putzplan/Reinigungs-LV + F10 SMTP-E-Mail-Versand)
- **Umsetzung per 3-Subagent-Kette:** Planung (Detailpläne inkl. Web-Recherche zu RTV/BTV-Zuschlägen und SMTP-Best-Practices) -> Code (`gebaeude-code`, 30 Schritte) -> Prüfung (QA mit Fix-Auftrag). Details: [`doc/session_summary_2026-08-25.md`](session_summary_2026-08-25.md).
- **F3 Putzplan + Reinigungs-LV:** Tabellen `lv_bereiche`/`lv_positionen`/`putzplan_eintraege` (Flächen-/Mengenbezug je Liegenschaft/Gebäude/Etage/Raum), Kalkulationskern in [`controllers/ReinigungController.js`](../controllers/ReinigungController.js) (Jahresleistung = Menge x Einsätze/Jahr x Zeitbedarf; Zuschläge anteilig; Referenzfall exakt getestet), View `putzplan` mit Objektbaum + Live-Vorschau ([`js/putzplan.js`](../js/putzplan.js)), Übernahme des LV in Abrechnungspläne/Dauerrechnungen über neue Spalte `abrechnungsplan_positionen.lv_position_id` (Live-Preise), LV-Audit + Objekt-Löschschutz.
- **RTV/BTV-Zuschlagsprofil:** konfigurierbar über Einstellungs-Key `reinigung_zuschlagsprofile`; Defaults nach RTV Gebäudereinigung (Nacht 22–5 Uhr +30 %, Sonn-/Feiertag +80 %, hohe Feiertage +200 %) – nicht hart kodiert, da sich Sätze jährlich ändern können.
- **F10 E-Mail-Versand (SMTP):** [`main/email.js`](../main/email.js) (nodemailer ^9, injizierbarer/mockbarer Service, Port-465-TLS-Erzwingung, Timeouts, safeStorage-Fallback – Passwort verlässt den Main-Prozess nie), Tabelle `email_versandhistorie`, 7 IPC-Kanäle `smtp:*`, Einstellungs-Karte mit Kontenverwaltung + Inline-Verbindungstest, globales E-Mail-Modal am PDF-Preview für Rechnung/Angebot/Mahnung (PDF-Anhang, Betreff-/Text-Templates, Historien-Panel mit „Wiederholen"), GoBD-konform (Beleg-Hash durch Versand unverändert – getestet).
- **QA-Fix:** SMTP-Benutzername wurde bei jeder Konto-Bearbeitung gelöscht (`speichereKonto` behandelte leeren String als Löschauftrag) – gefixt + Regressionstest.
- **Tests:** Suite von 130 auf **146/146** erweitert (Kalkulation inkl. Referenzfall, Schema/Migration, CRUD/Löschschutz, Live-Preis-Integration, SMTP pure/DB/Fake-Transporter/GoBD).

## 24.08.2026 (Offene Punkte F2 entschieden + umgesetzt)
- **Preisquelle Hybrid (Snapshot vs. Live):** Neues Feld `abrechnungsplaene.preise_live` (Standard 0 = Preis-Snapshot beim Plan-Anlegen eingefroren; 1 = Positionen mit Artikellink nutzen den aktuellen `artikel.vk` bei Generierung, Vorschau und Sammelrechnung). Umgesetzt in [`schema.js`](../schema.js) (Spalte + Migration), [`db.js`](../db.js) (`_ladePlanPositionenFuerGenerierung`, wirkt in Einzel-/Sammelgenerierung + Vorschau), UI: Checkbox „Preise live vom Artikelkatalog übernehmen" im Plan-Modal (nur bei Positionen) + „Live"-Badge in der Planliste ([`js/dauerrechnungen.js`](../js/dauerrechnungen.js)).
- **Sammelrechnung Objektdarstellung:** PO-Entscheid – Prefix `[Objektpfad]` bleibt Release-Stand; echte PDF-Gruppierung verworfen (dokumentiert in [`plans/daurerchnungen-plan.md`](../plans/daurerchnungen-plan.md) §8).
- **Tests:** Suite von 129 auf **130/130** erweitert ([`tests/dauerrechnung_preise_live.test.js`](../tests/dauerrechnung_preise_live.test.js): Snapshot-Freeze, Live-Generierung, Live/Snapshot-Vorschau, gemischte Sammelrechnung, Pauschale mit Flag).

## 24.08.2026 (Gebäude-Kernmodule F1 + F2)
- **F1 Objektverwaltung:** Liegenschaft -> Gebäude -> Etage -> Raum/Fläche (4 Tabellen + Migration), abweichender Rechnungsempfänger je Knoten (EIGENTUEMER/MIETER/HAUSVERWALTUNG, Vererbung), CRUD mit Löschschutz, 11 IPC-Handler, Objekte-/Detail-Views (Tabs Stammdaten/Struktur/Historie/Abrechnungspläne), Beleg-Historie je Objekt, Editor-Anbindung (`dokumente.objekt_typ/objekt_id` in GoBD-Hash). Details: [`doc/session_summary_2026-08-24.md`](session_summary_2026-08-24.md).
- **F2 Dauerrechnungen:** Abrechnungspläne je Objekt mit Rhythmen (monatlich/quartalsweise/jährlich/Wochenintervall), atomare Rechnungsgenerierung über `applyDocumentWrite` (GoBD-konform), Vorschau/Rückstau, Sammelrechnungen je Eigentümer, Storno mit Pflichtbegründung, Auto-Lauf max. 1×/Tag, View + Modals.
- **Subagents:** Neue Agent-Definitionen [`gebaeude-planung`](../.opencode/agent/gebaeude-planung.md) und [`gebaeude-code`](../.opencode/agent/gebaeude-code.md); Detailpläne: [`plans/objektverwaltung-plan.md`](../plans/objektverwaltung-plan.md), [`plans/daurerchnungen-plan.md`](../plans/daurerchnungen-plan.md).
- **Tests:** Suite von 105 auf **129/129** erweitert (6 neue Testdateien für Objektstamm/-logik/-historie und Dauerrechnung-Rhythmus/CRUD/Generierung).

## 23.08.2026 (Audit & Reparatur)
- **Voll-Audit des Rechnungssystems + ZUGFeRD PDF/A-3 (3 Prüf-Subagenten):** PDF/A-3-Container korrekt; CII/XML verstieß gegen EN 16931 (BG-23, Leitweg-ID, Adressen, §13b, Einheitscodes); GoBD-Schutz nur im Renderer; Sichtseite im ZUGFeRD-PDF war Platzhalter. Details: [`doc/session_summary_2026-08-23.md`](session_summary_2026-08-23.md).
- **Fix ① – CII/XML + Validierungs-Gate:** [`js/einvoice.js`](../js/einvoice.js): BG-23 USt-Aufschlüsselung, BG-5/BG-8-Adressen mit CountryID, Leitweg-ID-Vorrang in BT-10, UN/ECE-Rec-20-Einheitscode-Mapping (m²→MTK, Std→HUR …), §13b mit ExemptionReason/VTEX, BT-9 Fälligkeit, Fake-USt-ID entfernt, rabatt- und zahlungskonsistente Summen (BR-CO-10/13/14/16). `validateForEN16931` als echtes Gate – Editor bricht bei Fehlern ab, Dashboard validiert jetzt mit.
- **Fix ② – Echte Sichtseite:** [`main.js`](../main.js) übergibt beim ZUGFeRD-Export das echte Rechnungs-PDF (unsichtbares Rendern + `printToPDF` mit 15 s-Timeout) als `basePdfBuffer`; Platzhalter nur noch als Fehler-Fallback; Sichtseite & XML aus denselben Daten.
- **Fix ③ – GoBD:** Sperr-Guard in [`db.js`](../db.js) (gesperrte Belege inhaltlich unänderbar/löschbar), `entsperreBeleg()` mit Begründungspflicht, zentrale Audit-Hashkette [`main/audit.js`](../main/audit.js) bei jeder Belegmutation in derselben Transaktion, `verifiziereAuditKette()` + IPC `audit:verify`, Export bricht bei Audit-Fehler ab.
- **Fix ④ – Datenintegrität:** UNIQUE-Indizes (Rechnungsnummer, Verrechnungs-Paare, Einbehalt) mit Dedup-Migration in [`schema.js`](../schema.js), atomares Storno in einer Transaktion, durchgehendes Cent-Rounding in [`controllers/InvoiceController.js`](../controllers/InvoiceController.js) (bitidentisch zur E-Rechnungs-Engine), Doppelverrechnung blockiert, Schema-Bugs `sec48b_valid_until`/`is_subcontractor` gefixt (+ §48b-Checkbox im Kundenformular).
- **Tests:** Suite von 96 auf **105/105** erweitert (Z6–Z12, GoBD-Schutz, Datenintegrität); Pipeline 4/4; B2G-Artefakte validieren sauber.

## 23.08.2026
- **Feature F5 – Echter ZUGFeRD 2.x PDF/A-3-Export (Hybrid-Rechnung):**
  - Neues Modul [`main/zugferd-builder.js`](../main/zugferd-builder.js): erzeugt aus optionalem Sichtseiten-PDF (sonst Ersatzseite mit eingebettetem System-TTF) + CII-Rechnungs-XML ein echtes PDF/A-3-Hybrid (`@cantoo/pdf-lib`, MIT, electron-frei): Katalog-`/AF`, `/Names /EmbeddedFiles`, `/AFRelationship /Alternative`, fx-XMP inkl. `pdfaExtension:schemas`, OutputIntent mit sRGB-ICC.
  - [`js/einvoice.js`](../js/einvoice.js): `generateZUGFeRDXML(invoice, customer, seller, {profile})` profil-parametrisiert – EN16931: URN `urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:en16931` + `factur-x.xml`; XRECHNUNG: URN `urn:xoev-de:kosit:standard:xrechnung_2.3` + `xrechnung.xml`; neu `getZUGFeRDProfileInfo(profile)`.
  - IPC-Handler `invoice:exportZugferdPdf` in [`main.js`](../main.js) (SaveDialog, Write, GoBD-Audit-Log) + `api.exportZugferdPdf` in [`preload.js`](../preload.js); Rechnungs-Editor (Format-Select "ZUGFERD", [`js/editor.js`](../js/editor.js)) und Dashboard-ZUGFeRD-Button ([`js/dashboard.js`](../js/dashboard.js)) nutzen den neuen Export.
  - [`scripts/generate_and_test.js`](../scripts/generate_and_test.js): schreibt jetzt ECHTE Hybrid-PDFs nach `output/invoices/b2b_zugferd/` (Mock-Textdateien entfernt).
  - Tests: neue [`tests/zugferd.test.js`](../tests/zugferd.test.js) (Z1 Struktur, Z2 XMP, Z3 OutputIntent, Z4 Roundtrip, Z5 Profilvarianten), erweiterte [`tests/bau_erp.test.js`](../tests/bau_erp.test.js) (beide Profil-URNs) und [`tests/end_to_end_generate.test.js`](../tests/end_to_end_generate.test.js) (Strukturchecks statt Mock-Existenz). Suite: 96/96 grün.
  - Doku: [`doc/zugferd-validation.md`](../doc/zugferd-validation.md) (VeraPDF/Mustang-Anleitung + Ergebnis der automatisierten Prüfungen); manueller VeraPDF-Lauf bleibt dokumentierter Restschritt.

## 14.07.2026
- **Sicherheitseinbehalt (VOB/B):** Berechnungslogik in der Rechnungserstellung (`js/editor.js`) hinzugefügt. Der Sicherheitseinbehalt (basierend auf dem Projekt) wird nun korrekt vom Nettobetrag abgezogen, bevor die Umsatzsteuer auf den verbleibenden Betrag berechnet wird.
- **Datenbank:** Die Tabelle `dokumente` in `db.js` wurde um das Feld `sicherheitseinbehalt` erweitert, damit der Wert dauerhaft in der SQLite-Datenbank gespeichert und geladen wird.
- **PDF-Generierung & Pflichtangaben:** Alle drei PDF-Vorlagen (Modern, Minimalistisch, Klassisch) in `js/einstellungen.js` aktualisiert. Sie unterstützen nun:
  - Dynamische Anzeige von Vortext und Fußtext.
  - Automatischer Abdruck rechtlicher Hinweise im Fußbereich (z.B. § 13b UStG für Bauleistungen, § 16 VOB/B, Aufbewahrungspflicht nach § 14b UStG für Privatkunden, Lohnkosten-Ausweis nach § 35a EStG, Bauabzugsteuer § 48 EStG).
- **Benutzeroberfläche (UI):** Eingabefelder und Checkboxen für die genannten rechtlichen/steuerlichen Anforderungen wurden in die Rechnungserstellung (`code.html`) integriert.
- **Modul 'Kumulierte Abschlagsrechnungen':**
  - Parent-Child-Architektur für Rechnungen implementiert (`rechnung_verrechnungen`).
  - UI-Bereich in `code.html` ergänzt, um vorherige Abschlagsrechnungen desselben Projekts kumulativ abzuziehen.
  - Berechnungslogik in `js/editor.js` (`calculateRechnungTotals`) überarbeitet: Zuerst wird der Sicherheitseinbehalt (Netto) abgezogen, dann die Summe bisheriger Abschlagszahlungen (Netto). Nur die verbleibende Differenz wird besteuert.
  - Die Verknüpfungen (Verrechnungen) werden beim Speichern an die Datenbank (`db.js`) übergeben und korrekt in der UI geladen.
  - **PDF-Generierung (`js/einstellungen.js`) angepasst:** Die PDF-Vorlagen (Modern, Minimalistisch, Klassisch) weisen nun am Ende der Rechnung eine detaillierte Zahlungsaufstellung aus. Diese beinhaltet den bisherigen Gesamtleistungsstand (Netto), den Abzug des Sicherheitseinbehalts und eine Aufschlüsselung aller vorherigen Abschlagsrechnungen (inkl. Rechnungsnummer, Datum und Abzugsbetrag). Erst danach wird der Netto-Zuwachs (Steuerpflichtig) besteuert und als Zahlbetrag ausgewiesen.
  - **Bugfix (Rechnungserstellung):** Einen Syntaxfehler in `js/editor.js` (`SyntaxError: Identifier 'taxContainer' has already been declared`) behoben, der verhinderte, dass der "Neue Rechnung"-Dialog geöffnet werden konnte. Doppelte Variablendeklarationen wurden in der Funktion `calculateRechnungTotals` entfernt.

## 15.07.2026
- **Gemischte Rechnungen (§ 13b UStG auf Positionsebene):**
  - Globale Checkbox "§ 13b UStG (Reverse Charge)" in der UI (`code.html`) integriert.
  - Wenn die globale Checkbox aktiv ist, wird bei jeder Rechnungsposition eine weitere Checkbox eingeblendet (`is13b`), mit der gezielt gesteuert werden kann, ob für diesen Artikel 0% oder die reguläre MwSt. berechnet wird.
  - Berechnungslogik in `js/editor.js` (`calculateRechnungTotals`) komplett überarbeitet, um zwischen `13b_netto` und `normal_netto` präzise zu splitten und globale Rabatte proportional umzulegen.
  - PDF-Erstellung in `js/einstellungen.js` (`generateRechnungPDF`) angepasst: Gemischte Rechnungen (mit regulären und § 13b-Anteilen) weisen nun eine detaillierte Steuer-Aufschlüsselung unter der Zwischensumme aus.
  - Datenbank-Erweiterung (`db.js`): Spalten `unterliegt_13b` zur Tabelle `dokumente` und `is13b` zur Tabelle `positionen` hinzugefügt und in die SQL-Insert/Update-Statements implementiert.
  - **Bugfixes:** SQL-Fehler (fehlender `?`-Platzhalter bei den Inserts in `dokumente`) und JavaScript-Fehler (`ReferenceError` durch vorzeitige Abfrage von Steuern vor ihrer Berechnung in `einstellungen.js`) identifiziert und behoben.

## 13.08.2026
- **B2G E-Rechnung (EN 16931-1 / XRechnung & ZUGFeRD 2.0.1+):**
  - Implementierung der E-Rechnungs Engine ([`js/einvoice.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/js/einvoice.js)) für CrossIndustryInvoice (CII) XML & Factur-X / ZUGFeRD PDF/A-3.
  - Stammdaten-Erweiterung für Kunden (`customer_type`, `leitweg_id`, `buyer_reference`, `peppol_id`) in `db.js`, `code.html` und `js/kunden.js`.
  - Integration von Leitweg-ID Vorschau, E-Rechnungs-Standards und XRechnung XML-Download im Rechnungs-Editor ([`js/editor.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/js/editor.js)).
- **Subunternehmer & Steuer-Regeln (§ 48b EStG, § 13b UStG, § 35a EStG):**
  - Implementierung von [`controllers/SubcontractorController.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/controllers/SubcontractorController.js) zur automatischen Freistellungsbescheinigungsprüfung (§ 48b) und 15% Bauabzugsteuer-Berechnung.
  - Einbindung des visuellen Subunternehmer § 48b Status-Banners im Rechnungs-Editor.
- **VOB/B Kumulierte Abschlagsrechnung & Sicherheitseinbehalt:**
  - Implementierung von [`controllers/CumulativeBillingController.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/controllers/CumulativeBillingController.js) ($F_t = L_t - \sum F_i$ und 5% VOB/B § 17 Sicherheitseinbehalt).
- **GAEB-Import & Projekt-Leistungsverzeichnis:**
  - GAEB X83 XML Parser & X84 Exporter ([`js/gaeb.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/js/gaeb.js)).
  - Integration der Drag-and-Drop GAEB Uploadzone und LV-Tabellendarstellung in der Projekt-Detailansicht ([`js/projekte.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/js/projekte.js)).
- **DATEV EXTF 700 & GoBD Immutability Engine:**
  - EXTF 700 Export Engine ([`js/datev.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/js/datev.js)) mit BU-Schlüsseln 19/68.
  - GoBD SHA-256 Hashkettung & Unveränderbarkeitsprüfung ([`js/gobd.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/js/gobd.js)).
- **Test-Automatisierung & Full-Stack System-Test (Plan 03 & Plan 04):**
  - Erstellung von [`scripts/generate_and_test.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/scripts/generate_and_test.js) & [`tests/end_to_end_generate.test.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/tests/end_to_end_generate.test.js).
  - Implementierung von [`scripts/run_full_system_test.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/scripts/run_full_system_test.js) & [`tests/full_system.test.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/tests/full_system.test.js).
  - Erzeugung aller Testbelege in `./output/invoices/` und Testberichte in `./tests/test_results/`.
  - Erfolgreiche Validierung aller 8 Bau-ERP Module (11/11 Test-Suites bestanden).
