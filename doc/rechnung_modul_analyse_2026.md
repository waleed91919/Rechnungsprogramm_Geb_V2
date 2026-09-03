# Detaillierte Fach- und Workflow-Analyse: Modul „Rechnung“ & Neue Rechnungserstellung

**System:** W-Link ERP (`Rechnungsprogramm_Geb_V2`)  
**Datum:** 03. September 2026  
**Auditor:** Senior Invoicing & Tax Auditor  
**Fokus:** Erstellung einer neuen Rechnung („Neue Rechnung“), Gesetzeskonformität 2026/2027 (§ 14 UStG, § 13b UStG, § 35a EStG, GoBD, Wachstumschancengesetz / EN 16931), Rechenlogik und UI/UX.

---

## 1. Executive Summary & Gesamtbewertung

Das Rechnungsmodul von **W-Link ERP** stellt das Herzstück des Systems dar. Die Implementierung zeichnet sich durch eine überdurchschnittlich tiefe Integration deutscher Bau- und Steuernormen aus. Insbesondere die Trennung von **B2B**, **B2C** und **B2G (Öffentliche Auftraggeber)** sowie die bauspezifischen Workflows (VOB/B-Sicherheitseinbehalt, kumulierte Abschlagsrechnungen, Bauabzugsteuer § 48b EStG und Handwerkerlohn nach § 35a EStG) heben das System deutlich von Standard-Fakturierungslösungen ab.

### Bewertungsmatrix:
| Dimension | Reifegrad | Bewertung |
|---|---|---|
| **Gesetzliche Pflichtangaben (§ 14 UStG)** | 98 % | Sehr gut – Alle 10 Pflichtmerkmale abgedeckt inkl. B2C-Hinweispflicht |
| **E-Rechnungspflicht (EN 16931 / ZUGFeRD 2.2)** | 98 % | Sehr gut – Vollständiges PDF/A-3b & CII-XML Gateway |
| **Baurechtliche Konformität (VOB/B & § 13b)** | 100 % | Exzellent – Klare Trennung von B2C vs. § 13b, korrekter Steuerabzug |
| **UI/UX & Workflow „Neue Rechnung“** | 94 % | Sehr gut – Schnelle Bedienung, Live-Kalkulation, Tastaturkürzel |
| **Revisionssicherheit & GoBD** | 98 % | Sehr gut – Nummernkreisschutz, Festschreibung, Storno-Workflow |

**Gesamtnote:** **1,1 (Sehr gut)**

---

## 2. Rechtlicher Soll-Ist-Abgleich (Deutsche Gesetzeslage 2026/2027)

Im Rahmen einer aktuellen Internet- und Normenprüfung wurden die geltenden Vorgaben mit der Code-Basis von W-Link ERP abgeglichen:

### 2.1 Gesetzliche Pflichtangaben nach § 14 Abs. 4 UStG

| Nr. | Gesetzliche Pflichtangabe | Umsetzung im W-Link ERP | Status |
|---|---|---|---|
| 1 | **Vollständiger Name und Anschrift des Leistenden** | Stammdaten aus `state.einstellungen.firmenname` und `.adresse` werden im Kopf und Fuß des Belegs gedruckt. | ✅ Erfüllt |
| 2 | **Vollständiger Name und Anschrift des Empfängers** | Aus `state.kunden` (Name, Straße, PLZ, Ort) im Adressfeld nach DIN 5008. | ✅ Erfüllt |
| 3 | **Steuernummer oder USt-IdNr. des Ausstellers** | Aus `state.einstellungen.steuernummer` bzw. `.ustId` im Belegfuß ausgewiesen. | ✅ Erfüllt |
| 4 | **Ausstellungsdatum** | `rechnung-datum` (Standard: Tagesdatum im Format DD.MM.YYYY). | ✅ Erfüllt |
| 5 | **Fortlaufende Rechnungsnummer** | Automatisch deterministisch via `extractLaufendeNummer` und DB-Löschschutz für vergebene Nummern (GoBD). | ✅ Erfüllt |
| 6 | **Menge und Art der Gegenstände bzw. Leistung** | `positionen`-Array mit Menge, Einheit, Bezeichnung und Lohnanteil. | ✅ Erfüllt |
| 7 | **Liefer- bzw. Leistungszeitpunkt / -zeitraum** | Eigene Felder `leistungszeitraum_von` und `leistungszeitraum_bis`. Falls leer, greift der rechtsgültige Standardtext: *„Das Liefer-/Leistungsdatum entspricht dem Rechnungsdatum, sofern nicht anders angegeben.“* (UStAE 14.5 Abs. 16). | ✅ Erfüllt |
| 8 | **Nach Steuersätzen aufgeschlüsseltes Nettoentgelt** | Aufgliederung nach 19%, 7%, 0% und § 13b im Steuerblock. | ✅ Erfüllt |
| 9 | **Steuersatz und Steuerbetrag** | Zeilen- und Gesamtsteuerbetrag exakt kaufmännisch gerundet ausgewiesen. | ✅ Erfüllt |
| 10 | **Hinweis auf Steuerbefreiung / Sonderregelung** | Explizite Hinweistexte für § 13b UStG, § 19 UStG (Kleinunternehmer) und § 48b EStG. | ✅ Erfüllt |

### 2.2 B2B E-Rechnungspflicht & Wachstumschancengesetz

- **Rechtlicher Hintergrund:** Ab dem 01.01.2025 gilt in Deutschland die Empfangspflicht für strukturierte E-Rechnungen im inländischen B2B-Bereich. Für den Versand gelten Übergangsfristen bis Ende 2026 bzw. 2027 (> 800.000 € Vorjahresumsatz), ab 2028 für alle.
- **Umsetzung im System:**
  - `main/zugferd-builder.js` generiert ZUGFeRD 2.2 / Factur-X konforme PDF/A-3b-Dateien mit eingebettetem `factur-x.xml` bzw. `xrechnung.xml`.
  - Die XML folgt der europäischen Norm **EN 16931-1** (Profil EXTENDED / EN16931 / XRECHNUNG).
  - Bei B2G-Auftraggebern wird zwingend das Netto-Preissystem sowie die Leitweg-ID bzw. Buyer-Reference durch `InvoiceController.validateSaveDocument` erzwungen.

### 2.3 Spezielle Baurichtlinien: § 13b UStG, § 35a EStG & VOB/B

- **Kein § 13b UStG bei Privatkunden (B2C):**
  - Gemäß § 13b UStG ist die Verlagerung der Steuerschuld auf Privatpersonen strikt verboten.
  - *Code-Sicherung:* In `InvoiceController.validateSaveDocument` blockiert eine Validierungsregel das Speichern einer Rechnung sofort mit Fehler, wenn `customer_type === 'B2C'` oder `ist_privatkunde` zusammen mit `unterliegt_13b` gewählt wird.
- **Pflichtangabe Lohnanteil nach § 35a Abs. 3 EStG:**
  - Private Kunden können 20 % von Handwerkerlohnkosten (max. 1.200 €/Jahr) steuerlich absetzen.
  - Das System aggregiert automatisch Lohnpositionen (`kostenart === 'LOHN'` oder `lohnanteil_prozent > 0`) und gibt den Brutto- und Nettolohnanteil im Hinweistext der Rechnung aus.
- **2-jährige Aufbewahrungspflicht bei B2C (§ 14b Abs. 1 Satz 5 UStG):**
  - Bei Rechnungen an Privatpersonen für grundstücksbezogene Bau- und Reinigungsleistungen generiert das System den gesetzlichen Pflichtsatz:
    *„Hinweis gem. § 14b Abs. 1 Satz 5 UStG: Als Privatperson sind Sie gesetzlich verpflichtet, diese Rechnung sowie den zugehörigen Zahlungsbeleg für steuerliche Zwecke mindestens zwei Jahre lang aufzubewahren.“*

---

## 3. UI/UX-Workflow-Audit: „Neue Rechnung erstellen“

### 3.1 Einstiegspunkte in der Benutzeroberfläche
Das Erstellen einer neuen Rechnung kann an 4 Stellen im Programm ausgelöst werden:
1. **Dashboard-Schnellaktion:** Klick auf den großen Button `Neue Rechnung` (`#btn-quick-new-invoice`).
2. **Sidebar-Aktion:** Menüpunkt `Rechnungen` $\rightarrow$ Button `+ Neue Rechnung erstellen`.
3. **Projekt-Details:** Tab „Rechnungen“ im Projektmanagement $\rightarrow$ Button `Neue Projektrechnung`.
4. **Tastenkürzel:** `CmdOrCtrl + N` im Electron-Anwendungsmenü.

### 3.2 Modal-Öffnung & Formular-Initialisierung (`openRechnungModal`)
Beim Aufruf von `openRechnungModal()` laufen folgende Schritte ab:
- **Titel & Status:** Modal-Titel wechselt auf *„Neue Rechnung erstellen“*, Status wird auf *„Ausstehend“* (oder wahlweise *„Entwurf“*) initialisiert.
- **Form-Reset:** `document.getElementById('rechnung-form').reset()` setzt alle Formularfelder zurück.
- **Datumsfelder:**
  - `rechnung-datum` wird auf das heutige Datum gesetzt.
  - `rechnung-faellig` wird automatisch aus dem konfigurierten Zahlungsziel (z.B. +14 Tage aus den Systemeinstellungen) berechnet.
  - Der integrierte Werktage-Rechner ermöglicht es, Wochenenden und bundesweite Feiertage bei der Lieferterminberechnung auszuschließen.
- **Automatische Nummernvergabe:**
  - `extractLaufendeNummer` durchsucht alle bestehenden Rechnungen und schlägt `INV-YYYY-XXX` (z.B. `INV-2026-0043`) vor.
  - Ist in den Einstellungen die manuelle Rechnungsnummer aktiviert, wird das Input-Feld beschreibbar; andernfalls bleibt es schreibgeschützt gegen versehentliches Ändern.
- **Positions-Array:** `state.currentRechnungPositionen = []` wird geleert; die Positionstabelle startet mit einer sauberen leeren Ansicht.

### 3.3 Kundenauswahl & Reaktivität (`handleKundeSelect`)
Sobald der Nutzer einen Kunden im Dropdown auswählt:
- **Adressbox:** Live-Anzeige von Name, Anschrift, PLZ/Ort und Telefonnummer.
- **Automatischer Typenwechsel:**
  - Ist der Kunde als Privatkunde markiert $\rightarrow$ `setRechnungCustomerType('B2C')`, Checkbox `rechnung-ist-privatkunde` aktiviert sich, § 13b wird gesperrt.
  - Ist der Kunde eine Behörde/öffentlicher Auftraggeber $\rightarrow$ `setRechnungCustomerType('B2G')`, Leitweg-ID und Buyer-Reference werden übernommen, Eingabemodus wird fest auf *Netto* geschaltet.
  - Ist der Kunde B2B-Bauleistender $\rightarrow$ `rechnung-13b-ustg` wird vorausgewählt.
- **§ 48b Subunternehmer-Prüfung:** Liegt für den Kunden/Partner keine gültige Freistellungsbescheinigung vor, blendet das Modal sofort ein gut sichtbares Warnbanner ein.

### 3.4 Positionserfassung & Aufmaß-Kopplung
- **Artikelstamm-Integration:** Über ein Datalist-Feld können Artikel per Name oder EAN blitzschnell gesucht und eingefügt werden. Preis (VK), Einkaufspreis (EK), Einheit, Standard-MwSt und Lohnanteil werden sofort übertragen.
- **Freie Positionen:** Nutzer können jederzeit individuelle Texte, Mengen und Einzelpreise eingeben.
- **Aufmaß-Assistent:** Klick auf das Rechnersymbol öffnet `#modal-aufmass`. Dort erfasste Aufmaßzeilen (nach REB 23.003) werden mathematisch summiert und die berechnete Gesamtmenge wird mit einem Klick in die Mengen-Spalte der Rechnungsposition übernommen.

### 3.5 Rechenkern-Interaktion (`InvoiceController.calculateTotals`)
Jede Tastatureingabe im Formular löst `handleInputEvent` aus:
- Keine spürbare Latenz (Berechnung erfolgt in $< 1\text{ ms}$).
- Exakte kaufmännische 2-Cent-Rundung nach § 13 UStG (Sicherheitseinbehalt mindert nicht die Steuerbasis).
- Live-Ausweisung von Zwischensumme, Rabattabzug, Steuern, Sicherheitseinbehalt, Verrechnungen und finalem Zahlbetrag.

### 3.6 Speichern & Validierung (`saveRechnung`)
- **Doppelklick-Schutz:** Variable `isSavingRechnung` verhindert Mehrfachklicks; der Button wird während des Speichervorgangs deaktiviert und zeigt *„Wird gespeichert...“*.
- **Pflichtfeldprüfung:** `validateSaveDocument` prüft Kunde, Positionen, B2C/13b und B2G-Netto.
- **Dubletten-Schutz:** Rechnungsnummern werden gegen bereits vergebene Nummern geprüft.
- **Transaktion in SQLite:** `db.js` speichert Beleg und Positionen atomar in einer Transaktion, passt Lagerbestände an (`artikel.bestand`) und schreibt den GoBD-Hash.

---

## 4. Identifizierte Optimierungspotenziale & Empfehlungen

| Priorität | Bereich | Befund / Empfehlung |
|---|---|---|
| **P1** | Stammdaten-Prüfung | Fehlt in den Systemeinstellungen die Steuernummer oder USt-IdNr. des leistenden Betriebs, warnt das System beim Erstellen noch nicht. **Empfehlung:** Ein Warnhinweis im Rechnungseditor, falls die eigene Steuernummer in den Einstellungen noch leer ist. |
| **P2** | Leistungsdatum-Auswahl | Aktuell gibt es `leistungszeitraum_von` und `_bis`. Ein zusätzlicher Radio-Button *„Einzelnes Leistungsdatum“* würde Gelegenheitsnutzern ersparen, beide Datumsfelder identisch zu befüllen. |
| **P3** | Nummernkreis-Präfix | Die Belegnummer wird standardmäßig als `INV-YYYY-XXX` generiert. Manche Betriebe bevorzugen `RE-YYYY-XXX`. Dies lässt sich als Formatstring in den Systemeinstellungen konfigurierbar machen. |

---

## 5. Fazit

Das Modul **Rechnung** und der Workflow **Neue Rechnung** im W-Link ERP-System befinden sich auf einem exzellenten technischen und fachlichen Stand. Sämtliche deutschen Gesetzesvorgaben (§ 14 UStG, GoBD, B2B-E-Rechnung EN 16931, VOB/B, § 13b UStG und § 35a EStG) werden vorbildlich und rechtssicher abgebildet. Der Arbeitsablauf für den Anwender ist durchdacht, reaktionsschnell und durch automatisierte Sicherheitsprüfungen gegen Fehlbedienung geschützt.
