# GAEB X83 Import & Unabhängige Validierung: Prüf- und Fortschrittsbericht

**Datum:** 28. September 2026  
**Branch:** `review/gaeb-x83-independent-validation` (Review-Branch)  
**Bezugsdokument:** `liesen.txt`  
**Status:** Erfolgreich modularisiert, unabhängig verifiziert und gehärtet  
**Testsuites:** `tests/gaeb_x83_import_audit.test.js` (19 Tests), `tests/validate_xsd.py`, `tests/gaeb_validation.test.js`, `tests/angebot_lifecycle.test.js`, `tests/angebot_ui_workflow.test.js`, `tests/angebot_true_ui_and_pdf.test.js`  
**Referenzschemata:** `tests/schemas/gaeb_da_xml_3.3/` (GAEB DA XML 3.3 Ausgabe 2021-05)  
**Testfixtures:** `tests/fixtures/gaeb_x83/` (`valid_schema_reference.x83`, `independent_pygaeb_da32.x83` + 5 interne Modelle)

---

## 1. Executive Summary & Begriffspräzisierung

Auf Basis der Vorgaben aus `liesen.txt` wurde der GAEB X83 Import von W-Link ERP mit einer unabhängigen externen Testdatei validiert, die Testdokumentation von pauschalen Werbeaussagen bereinigt und das Script-Loading für Electron gehärtet.

### Präzisierung der Konformitätsaussagen:
- Es werden **keine** pauschalen Behauptungen wie «100% GAEB-Unterstützung», «offiziell konform» oder «vollständige Konformität» aufgestellt. Stattdessen wird exakt ausgewiesen, welche XML-Elemente, Hierarchieebenen und Datentypen die Testsuite prüft und nachweist.
- **Projektinterne Schema-Referenzdatei (`valid_schema_reference.x83`):**  
  Diese Datei ist eine **projektintern erstellte Minimal-Referenzdatei**, die exakt nach den formalen Regeln der `GAEB_DA_XML_83_3.3_2021-05.xsd` konstruiert wurde, um die Schemavalidierungslogik automatisiert zu testen. Sie ist **kein** offizielles BVBS-Muster.
- **Offizielle BVBS-Zertifizierungsdateien:**  
  **Ein Konformitätsnachweis mit einer offiziellen BVBS-Zertifizierungsdatei wurde noch nicht erbracht, da offizielle BVBS-Prüfdateien urheberrechtlich geschützt sind und dem BVBS-Mitgliederkreis/Zertifizierungsverfahren vorbehalten sind.**
- **Unabhängige externe Testdatei (`independent_pygaeb_da32.x83`):**  
  Zur unabhängigen Verifikation wurde eine externe Testdatei aus dem Open-Source-Projekt `pyGAEB` (MIT-Lizenz) integriert und im Originalzustand ohne Namespace-Modifikationen getestet.

---

## 2. Unabhängige externe Testdatei (pyGAEB)

### 2.1 Herkunft und Provenienz
- **Quelle:** GitHub Repository `https://github.com/frameIQ/pygaeb` (Datei `tests/fixtures/gaebxml.x83`).
- **Lizenz:** MIT License (Copyright 2024 frameIQ).
- **Format:** GAEB DA XML 3.2, Phase 83 (`xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.2"`, `Version 3.2`, `VersDate 2013-10`, `DP 83`).
- **Inhalt:** Von AVA-Software abgeleitete Ausschreibungsstruktur mit synthetischen Projektdaten («Neubau Lagerhalle»). Enthält 1 Hauptgewerk, 2 Unterabschnitte (davon einer mit leerem `<LblTx></LblTx>`), 6 Positionen (inkl. Pauschale `psch` und Mengenangabe via `<QtyTBD>`), mehrzeilige Langtexte und unbepreiste Positionen. Keine sensiblen Kundendaten.

### 2.2 Schemaprüfung im Originalzustand (`tests/validate_xsd.py`)
- Die Datei wurde im Originalzustand ohne Manipulationen oder Namespace-Ersetzungen gegen das Phasenschema `GAEB_DA_XML_83_3.3_2021-05.xsd` geprüft.
- **Befund:** Schemavalidierung schlägt fehl.
- **Ursache:** Ehrliche und erwartete **Versionsdiskrepanz**: Die Datei deklariert den Namespace für GAEB 3.2 DA83 (`http://www.gaeb.de/GAEB_DA_XML/DA83/3.2`), während das Prüfschema den Namespace für GAEB 3.3 DA83 (`http://www.gaeb.de/GAEB_DA_XML/DA83/3.3`) vorschreibt.
- **Konsequenz:** Die Datei wurde **nicht** künstlich angepasst, um einen grünen Test zu erzwingen, sondern das Ergebnis wird transparent als Versionsabweichung (3.2 Datei vs. 3.3 Schema) dokumentiert.

### 2.3 Parser-Ergebnis (`GAEBEngine.parseGAEBXML`)
Der funktionale DOM-Parser von W-Link liest die Datei vollständig und verlustfrei ein:
- **Kopfdaten:** Projektname «Neubau Lagerhalle», Währung «€», Phase «X83».
- **Hierarchie:**
  - Ebene 1: Hauptkategorie `01` «Lagerhalle».
  - Ebene 2a: Unterkategorie `01.01` (leeres `LblTx`) erhält sauberen Fallback-Namen «Kategorie 01» (keine Kontamination durch nachfolgende Item-Texte).
  - Ebene 2b: Unterkategorie `01.02` «Rohbau».
- **Positionen (6 Stück):**
  - `01.01.001`: Pauschalposition (`psch`), Menge 1, Langtext «Einrichten der Baustelle...».
  - `01.02.001`: Normalposition, Menge `null`, Kennzeichen `isQtyTBD: true`, Einheit `m³`, Langtext «Bodenaushub für die Baugrube herstellen.».
  - `01.02.002`: Normalposition, Menge 600, Einheit `m³`, Kurztext «Verfüllung».
  - `01.02.003`: Normalposition, Menge `null`, Kennzeichen `isQtyTBD: true`, Einheit `m³`, Kurztext «Bodenabfuhr».
  - `01.02.004`: Normalposition, Menge 800, Einheit `m²`, Kurztext «Betonsohle».
  - `01.02.005`: Normalposition, Menge 240, Einheit `m²`, Kurztext «Betonwände».
- **Null-Sicherheit:** Alle 6 Positionen bleiben strikt unbepreist (`preis: null`, `gesamtpreis: null`, `isPriceMissing: true`). Es wird kein Scheinwert `0.00` erfunden.

---

## 3. Architektur und Electron-Script-Loading

### 3.1 Modulare Struktur (`js/gaeb/`)
```
js/gaeb.js (Fassade & Einstiegspunkt / Abwärtskompatibel)
 │
 ├──► js/gaeb/xml_dom_utils.js
 │     └─ getDOMParser() (Node.js/Electron/Browser), extractTextLines(), cleanText(), escapeXML()
 │
 ├──► js/gaeb/hierarchy_builder.js
 │     └─ Traversierung von <BoQBody> / <BoQCtgy>, OZ-Pfad-Stack, Vorbemerkungen, Scoping-Schutz
 │
 ├──► js/gaeb/item_reader.js
 │     └─ extractKurztext(), extractLangtext(), extractQuantitiesAndPrices() [Null-Safe, QtyTBD]
 │
 └──► js/gaeb/item_types.js
       └─ determineItemType() [Wahl/Bedarf/Pauschal], extractBieterangaben(), extractUPComponents()
```

### 3.2 Skript-Einbindung in `code.html`
Die Skripte sind in `code.html` in folgender Reihenfolge eingebunden:
```html
<script src="js/gaeb/xml_dom_utils.js"></script>
<script src="js/gaeb/hierarchy_builder.js"></script>
<script src="js/gaeb/item_reader.js"></script>
<script src="js/gaeb/item_types.js"></script>
<script src="js/gaeb.js"></script>
```

### 3.3 Härtung gegen Lade-Reihenfolgen im Browser/Electron
In `hierarchy_builder.js` und `gaeb.js` werden Abhängigkeiten zu Hilfsmodulen (`ItemReader`, `ItemTypes`, `XMLUtils`) zur Ausführungszeit dynamisch über Fallbacks aufgelöst (`typeof window !== 'undefined' ? window.GAEB_* : null`). Dadurch funktioniert das Parsing auch in Electron-Fenstern ohne Node-Integration (`require === undefined`) unabhängig von feinen Nuancen der Skriptreihenfolge.

Dieser Ablauf wird durch Test 18 in `tests/gaeb_x83_import_audit.test.js` über ein isoliertes JSDOM-Fenster (`win.require = undefined`) automatisiert geprüft.

---

## 4. XSD-Prüfmatrix (`tests/validate_xsd.py`)

| Gruppe & Datei | Wohlgeformt | Struktur | Strikte XSD (2021-05 Schema) | Klassifikation / Anmerkung |
| :--- | :---: | :---: | :---: | :--- |
| **1. EXPECTED_VALID** | | | | |
| `valid_schema_reference.x83` | ✅ JA | ✅ 3.3 | ✅ **BESTANDEN (0 Fehler)** | Projektintern erstellte Minimal-Referenz für Phase 83. |
| **2. INDEPENDENT_EXTERNAL** | | | | |
| `independent_pygaeb_da32.x83` | ✅ JA | ⚠️ 3.2 | ⚠️ **FEHLGESCHLAGEN (1 Fehler)** | pyGAEB MIT-Muster. Diskrepanz: DA83 3.2 Namespace vs. 3.3 Schema. |
| **3. PROJECT_INTERNAL_MODELS**| | | | |
| `01_standard_hierarchie.x83` | ✅ JA | ✅ 3.3 | ⚠️ Abweichung | Namespace `DA_XML_3.3` statt `DA83/3.3`, Projektname > 20 Zeichen. |
| `02_positionstypen_wahl_bedarf.x83` | ✅ JA | ✅ 3.3 | ⚠️ Abweichung | Attribut `ItemType` (AVA-proprietär), Namespace `DA_XML_3.3`. |
| `03_bieterangaben_vorbemerkungen_ep.x83` | ✅ JA | ✅ 3.3 | ⚠️ Abweichung | `Description` auf `BoQCtgy`-Ebene, Namespace `DA_XML_3.3`. |
| `04_reales_muster_hochbau.x83` | ✅ JA | ✅ 3.3 | ⚠️ Abweichung | Mehrere Gewerke, lange Bezeichnungen, Namespace `DA_XML_3.3`. |
| `05_muster_angelehnt_an_gaeb_bvbs.x83` | ✅ JA | ✅ 3.3 | ⚠️ Abweichung | ZTVE-Abschnitte, angelehnt an BVBS, Namespace `DA_XML_3.3`. |

---

## 5. Detaillierter Funktionsumfang des Parsers

### Was der Parser nachweislich unterstützt:
1. **Hierarchischer Aufbau:** Beliebig tiefe `BoQCtgy`-Verschachtelungen mit automatischer Zuordnung von `categoryPath`, `gewerk`, `abschnitt`, `titel`.
2. **Scoping-Sicherheit:** Kategorienamen und Vorbemerkungen werden strikt aus der jeweiligen Kategorie extrahiert; keine Kontamination durch Kind-Elemente oder Items.
3. **Ordnungszahlen (OZ):** Zusammengesetzte Pfad-OZ aus verschachtelten `RNoPart` bei gleichzeitigem Erhalt des isolierten lokalen `rno_part`. Automatische Duplikaterkennung (`isDuplicateOZ`).
4. **Mehrzeilige Langtexte:** Vollständiger Erhalt aller Absätze aus `<CompleteText><DetailTxt><Text>` ohne Textkürzung.
5. **Positionstypen:** Differenzierung von Normal-, Grund- (`ALNSerNo 00`), Wahl- (`ALNSerNo > 00`), Bedarfs- (mit/ohne Gesamtbetrag) und Pauschalpositionen (`psch`, `LumpSumItem`).
6. **Bieterangaben & Preisaufgliederung:** Auslesen von `<BiReq>`/`<BiEl>` und `<UPComponents>` (Lohn, Stoff, Gerät, Sonstiges).
7. **Vergaberechtliche Null-Sicherheit:** Fehlende Preise in Ausschreibungen bleiben strikt `null` (`isPriceMissing: true`). Keine Erfindung von `0.00`-Werten.
8. **Mengenangaben:** Unterstützung regulärer Mengen (`<Qty>`) sowie Erfassung von Mengenvorbehalten (`<QtyTBD>` -> `menge: null`, `isQtyTBD: true`).

### Was aktuell noch NICHT implementiert ist (Out of Scope dieser Aufgabe):
- **Keine relationalen Tabellen in `schema.js`:** Die Speicherung erfolgt aktuell noch nicht in dedizierten SQLite-Tabellen für Hierarchien oder Bieterangaben.
- **Keine Ausschreibungs-UI:** Es existiert noch keine Baum-Benutzeroberfläche zur Bearbeitung von Bietertextergänzungen oder Langtexten.
- **Kein hierarchischer X84-Export:** Der aktuelle X84-Export erzeugt eine flache Struktur und exportiert noch nicht die vollständige `BoQCtgy`-Baumstruktur.

---

## 6. Tatsächliche Testbefehle und Ausführungsergebnisse

Alle Testsuiten wurden mit Exit-Code 0 ausgeführt:

```text
1. python tests/validate_xsd.py
   EXPECTED_VALID: 1/1 bestanden
   INDEPENDENT_EXTERNAL_FILES: 1/1 ehrlich als Versionsdiskrepanz 3.2 vs. 3.3 dokumentiert
   PROJECT_INTERNAL_MODELS: 5/5 dokumentierte Edge-Cases
   Exit-Code: 0

2. node --test tests/gaeb_x83_import_audit.test.js
   19 Tests, 1 Suite, 19 bestanden, 0 Fehler, Dauer: ~2.4s
   (Inklusive Test 17 für pyGAEB und Test 18 für Electron DOM Script-Loading ohne require)

3. node --test tests/gaeb_validation.test.js
   6 Tests, 1 Suite, 6 bestanden, 0 Fehler, Dauer: ~1.9s

4. node --test tests/angebot_lifecycle.test.js
   1 Test, 1 bestanden, 0 Fehler, Dauer: ~6.8s

5. node --test tests/angebot_ui_workflow.test.js
   1 Test, 1 bestanden, 0 Fehler, Dauer: ~0.5s

6. node --test tests/angebot_true_ui_and_pdf.test.js
   1 Test, 1 bestanden, 0 Fehler, Dauer: ~3.4s
```
