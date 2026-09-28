# GAEB X83 Import & Unabhängige Validierung: Prüf- und Fortschrittsbericht

**Datum:** 28. September 2026  
**Branch:** `fix/gaeb-x83-schema-and-parser-hardening` (Arbeits- und Review-Branch)  
**Bezugsdokument:** `liesen.txt`  
**Status:** Versionierte XSD-Prüfung abgeschlossen, unabhängige Open-Source-Datei (pyGAEB) 100% schemakonform validiert, modularer Parser gehärtet  
**Testsuites:**
- `python tests/validate_xsd.py` & `python tests/validate_xsd.py --self-test`
- `node --test tests/gaeb_x83_import_audit.test.js` (19 Tests)
- `node --test tests/gaeb_validation.test.js` (6 Tests)
- `node --test tests/angebot_lifecycle.test.js` (1 Test)
- `node --test tests/angebot_ui_workflow.test.js` (1 Test)
- `node --test tests/angebot_true_ui_and_pdf.test.js` (1 Test)  
**Referenzschemata:**
- GAEB DA XML 3.3 Ausgabe 2021-05 (`tests/schemas/gaeb_da_xml_3.3/`)
- GAEB DA XML 3.2 Ausgabe 2013-10 (`tests/schemas/gaeb_da_xml_3.2/` via offizielle GAEB-Quelle `https://www.gaeb.de/wp-content/uploads/2019/04/Leistungsverzeichnis.zip`)  
**Testfixtures:** `tests/fixtures/gaeb_x83/` (`valid_schema_reference.x83`, `independent_pygaeb_da32.x83` + 5 interne Modelle)

---

## 1. Executive Summary & Begriffspräzisierung

Auf Basis der Vorgaben aus `liesen.txt` wurde die GAEB X83-Verifikation auf ein versioniertes XSD-Prüfmodell umgestellt, die Herkunft der Testdaten lückenlos nachgewiesen und der modulare DOM-Parser (`js/gaeb/`) hinsichtlich XML-Reihenfolge, Mengendifferenzierung, Preisen und Typen gehärtet.

### Präzisierung der Konformitäts- und Zertifizierungsaussagen:
- Es werden **keine** pauschalen Werbeaussagen wie «100% GAEB-Unterstützung» oder «offiziell BVBS-zertifiziert» getroffen. Stattdessen wird sachlich dokumentiert, welche Versionen, Schemadateien, Hierarchien und Datentypen automatisiert verifiziert sind.
- **Projektinterne Schema-Referenzdatei (`valid_schema_reference.x83`):**  
  Diese Datei ist eine **projektintern erstellte Minimal-Referenzdatei**, konstruiert exakt nach den formalen Regeln der `GAEB_DA_XML_83_3.3_2021-05.xsd`. Sie dient als technischer Schematestfall und ist **kein** offizielles BVBS-Muster.
- **Offizielle BVBS-Zertifizierungsdateien:**  
  > **Ein Konformitätsnachweis mit einer offiziellen BVBS-Zertifizierungsdatei wurde noch nicht erbracht, da offizielle BVBS-Prüfdateien urheberrechtlich geschützt sind und dem BVBS-Mitgliederkreis/Zertifizierungsverfahren vorbehalten sind.**
- **Unabhängige externe Testdatei (`independent_pygaeb_da32.x83`):**  
  Stammt aus dem Open-Source-Projekt `pyGAEB` (MIT-Lizenz). Sie ist 100% byte-identisch zum Original, wurde im unveränderten Originalzustand geprüft und besteht die strikte XSD-Validierung gegen das offizielle GAEB DA XML 3.2 Schema fehlerfrei.

---

## 2. Unabhängige externe Testdatei (pyGAEB)

### 2.1 Herkunft und Provenienz
- **Download-URL:** `https://github.com/frameIQ/pygaeb/blob/main/tests/fixtures/gaebxml.x83`
- **Raw-URL:** `https://raw.githubusercontent.com/frameIQ/pygaeb/main/tests/fixtures/gaebxml.x83`
- **Commit-Stand:** pyGAEB main branch (Commit SHA `51262eb3a21433b4060f72858d1826d54057d3c3` bzw. `61ec16cb935fec56b8cd622409223d6a684c76f9`, Erstellungscommit `9c341b7a54c412c4e6a89efe5b343cf175822381`).
- **Lizenz:** MIT License (Copyright 2024 frameIQ).
- **Byte-for-Byte Identität:** **100% identisch zur Originaldatei**.
  - Dateigröße: 9.767 Bytes
  - SHA-256 Prüfsumme: `F2ECB8C303D1B03F03F13CE254CB556049D45D31C7B9CF2EADEE5FC05013B74D`
- **Format:** GAEB DA XML 3.2, Phase 83 (`xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.2"`, `Version 3.2`, `VersDate 2013-10`, `DP 83`).
- **Inhalt:** Synthetisches Bauprojekt («Neubau Lagerhalle») mit 1 Hauptgewerk, 2 Abschnitten (davon Abschnitt 01 mit leerem `<LblTx></LblTx>`), 6 Positionen (inkl. Pauschale `psch` und Mengenangabe via `<QtyTBD>`), mehrzeiligen Langtexten und unbepreistem Ausschreibungszustand. Keine Kundendaten.

### 2.2 Versionierte Schemaprüfung (`tests/validate_xsd.py`)
- **Prüfschema:** Offizielles GAEB DA XML 3.2 Schema (`tests/schemas/gaeb_da_xml_3.2/GAEB_DA_XML_83_3.2_2013-10.xsd`).
- **Ergebnis:** **BESTANDEN (0 Fehler)**.
- **Erkenntnis:** Die Datei scheiterte zuvor nur, weil sie fälschlich gegen das 3.3-Schema geprüft wurde. Unter dem für ihre Version 3.2 (2013-10) maßgeblichen offiziellen Schema ist sie zu 100% valide.

### 2.3 Parser-Ergebnis (`GAEBEngine.parseGAEBXML`)
Der funktionale DOM-Parser von W-Link liest die Datei vollständig und verlustfrei ein:
- **Kopfdaten:** Projektname «Neubau Lagerhalle», Währung «€», Phase «X83».
- **Hierarchiestruktur:**
  - Ebene 1: Hauptgewerk `01` «Lagerhalle».
  - Ebene 2a: Abschnitt `01.01` (leeres `LblTx`) erhält deterministischen Fallback-Namen «Kategorie 01» (keine Kontamination durch nachfolgende Item-Texte).
  - Ebene 2b: Abschnitt `01.02` «Rohbau».
- **Positionen (6 Stück in exakter Reihenfolge):**
  1. `01.01.001`: Pauschalposition (`psch`), Menge 1, Langtext «Einrichten der Baustelle vor Beginn der Bauarbeiten.».
  2. `01.02.001`: Normalposition, Menge `null`, Kennzeichen `isQtyTBD: true`, Einheit `m³`, Langtext «Bodenaushub für die Baugrube herstellen.».
  3. `01.02.002`: Normalposition, Menge 600, Einheit `m³`, Kurztext «Verfüllung».
  4. `01.02.003`: Normalposition, Menge `null`, Kennzeichen `isQtyTBD: true`, Einheit `m³`, Kurztext «Bodenabfuhr».
  5. `01.02.004`: Normalposition, Menge 800, Einheit `m²`, Kurztext «Betonsohle».
  6. `01.02.005`: Normalposition, Menge 240, Einheit `m²`, Kurztext «Betonwände».
- **Null-Sicherheit:** Alle 6 Positionen bleiben strikt unbepreist (`preis: null`, `gesamtpreis: null`, `isPriceMissing: true`). Es wird kein Scheinwert `0.00` erfunden.

---

## 3. Versionierte Schemaprüfung & Validierungs-Engine

### 3.1 Schemadateien
1. **GAEB DA XML 3.3 (2021-05):** In `tests/schemas/gaeb_da_xml_3.3/` hinterlegt.
2. **GAEB DA XML 3.2 (2013-10):** Vollständig aus der offiziellen GAEB-Quelle `https://www.gaeb.de/wp-content/uploads/2019/04/Leistungsverzeichnis.zip` nach `tests/schemas/gaeb_da_xml_3.2/` extrahiert und in `tests/schemas/gaeb_da_xml_3.2/README.md` dokumentiert.

### 3.2 Strikte Klassifikation in `tests/validate_xsd.py`
- **`EXPECTED_VALID`:**
  - `valid_schema_reference.x83` -> geprüft gegen `GAEB_DA_XML_83_3.3_2021-05.xsd` -> **BESTANDEN (0 Fehler)**
  - `independent_pygaeb_da32.x83` -> geprüft gegen `GAEB_DA_XML_83_3.2_2013-10.xsd` -> **BESTANDEN (0 Fehler)**
  *Erfüllungskriterium:* Beide Dateien müssen zu 100% bestehen, andernfalls bricht das Skript mit Exit-Code != 0 ab.
- **`PROJECT_INTERNAL_MODELS`:**
  - Modelle `01` bis `05`: Dienen der Absicherung der Parser-Resilienz gegen nicht-ideale Exporte (z. B. Namespace `DA_XML_3.3` statt `DA83/3.3`). Sie sind wohlgeformtes XML, die Abweichungen sind transparent dokumentiert.

### 3.3 Selbsttest der Validierungs-Engine (`--self-test`)
Um zu garantieren, dass die Engine echte Validierungsfehler meldet und nicht stillschweigend grünes Licht gibt, führt `validate_xsd.py` einen automatisierten Selbsttest durch:
- Entfernen des Pflichtfelds `<DP>` aus der 3.3-Referenzdatei führt zu sofortigem Validierungsabbruch (`Expected is ( {http://www.gaeb.de/GAEB_DA_XML/DA83/3.3}DP )`).
- Entfernen des Pflichtfelds `<DP>` aus der 3.2-pyGAEB-Datei führt ebenfalls zu sofortigem Validierungsabbruch (`Expected is ( {http://www.gaeb.de/GAEB_DA_XML/DA83/3.2}DP )`).

---

## 4. Modulare Parser-Härtung (`js/gaeb/`)

Die Weiterentwicklung erfolgte streng modular und ohne Code-Verschiebung in `main.js`:
- `js/gaeb/hierarchy_builder.js`:
  - **Reihenfolgenerhalt:** Kindelemente in `BoQBody` werden in exakter Dokumenten-Reihenfolge durchlaufen (`Remark`, `BoQCtgy`, `Itemlist`, `Item`).
  - **Kategorie-Scoping:** Bezeichnungen und Vorbemerkungen werden strikt aus der jeweiligen Kategorie bezogen und nicht mit Texten von Kind-Positionen überschrieben.
  - **OZ- & RNoPart-Erhalt:** Zusammengesetzte Pfad-OZ und originale `rno_part` bleiben unverfälscht erhalten.
- `js/gaeb/item_reader.js`:
  - **Differenzierung von Mengen:**
    - Reguläre Menge (`<Qty>`): Numerischer Wert.
    - Mengenvorbehalt (`<QtyTBD>Yes</QtyTBD>`): `menge: null`, `isQtyTBD: true`.
    - Hinweistexte: `menge: null`, `isHinweistext: true`.
    - Niemals wird 1 Stk. als Platzhalter erfunden!
  - **Preise:**
    - Wenn `<UP>` fehlt, bleibt `preis: null`, `gesamtpreis: null` (sofern kein `<IT>` vorhanden ist) und `isPriceMissing: true`.
    - Niemals wird `0.00 €` erfunden!
- `js/gaeb/item_types.js`:
  - **Attribute nach Vorgabe:**
    - `aln_group_no` und `aln_ser_no` für Grund- und Wahlpositionen.
    - `is_wahl` und `is_bedarf`.
    - `provis` und `withTotal` für Eventualpositionen.
    - `in_endsumme_enthalten` als Ausschreibungs-Voreinstellung gespeichert, ohne rechtliche Vorwegnahme.
    - `biReq` / `bieterangaben` und `upComponents` (EP-Aufgliederung).
- `js/gaeb.js`:
  - Schlanke Fassade für öffentliche Methoden.
  - Klare Warnung, wenn GAEB-Austauschphase im Dokument fehlt oder von X83 abweicht.
  - Klare Fehlermeldung bei unvollständigem oder ungültigem XML.
  - Vollständige Abwärtskompatibilität für `GAEBEngine.parseGAEBXML()` und `GAEBEngine.generateGAEBX84XML()`.

---

## 5. Vollständige Prüfergebnisse

| Prüfschritt / Testsuite | Befehl | Ergebnis | Dauer |
| :--- | :--- | :---: | :---: |
| Versionierte XSD-Prüfung | `python tests/validate_xsd.py` | 100% OK (Exit 0) | ~0.5s |
| Validierungs-Selbsttest | `python tests/validate_xsd.py --self-test` | 100% OK (Exit 0) | ~0.3s |
| X83 Import Audit (19 Tests) | `node --test tests/gaeb_x83_import_audit.test.js` | 19/19 Pass (Exit 0) | ~2.5s |
| GAEB DA XML 3.3 Export/Validierung | `node --test tests/gaeb_validation.test.js` | 6/6 Pass (Exit 0) | ~1.9s |
| Angebots-Lebenszyklus | `node --test tests/angebot_lifecycle.test.js` | 1/1 Pass (Exit 0) | ~6.8s |
| Angebots-UI-Workflow | `node --test tests/angebot_ui_workflow.test.js` | 1/1 Pass (Exit 0) | ~0.5s |
| Electron DOM & PDF-Workflow | `node --test tests/angebot_true_ui_and_pdf.test.js` | 1/1 Pass (Exit 0) | ~3.4s |

---

## 6. Beantwortung der Leitfragen aus `liesen.txt`

1. **Hat die unabhängige Testdatei XSD 3.2 bestanden?**  
   **Ja, zu 100% mit 0 Fehlern.** Unter dem offiziellen GAEB DA XML 3.2 Schema (Stand 2013-10) ist `independent_pygaeb_da32.x83` formal und strukturell absolut valide.
2. **Was hat W-Link ERP nachweislich korrekt importiert?**  
   - Vollständige Hierarchien (Hauptkategorien und Unterabschnitte).
   - Reale Behandlung von leeren Kategorietexten ohne Scoping-Fehler.
   - Exakte Reihenfolge aller 6 Positionen.
   - Korrekte Differenzierung von Menge 1 (Pauschale), regulärer Menge (600, 800, 240) und Mengenvorbehalten (`QtyTBD` -> `menge: null`, `isQtyTBD: true`).
   - Mehrzeilige Langtexte vollständig erhalten.
   - Vergaberechtliche Null-Sicherheit: Alle unbepreisten Positionen bleiben `preis: null`, `isPriceMissing: true`.
3. **Was bleibt aktuell noch unberücksichtigt (Folgeaufgaben)?**  
   - Keine Speicherung in neuen relationalen Tabellen in `schema.js`.
   - Keine Benutzeroberfläche zur Bearbeitung von Bieterangaben oder Langtexten.
   - Kein hierarchischer X84-Generator (der bestehende X84-Generator exportiert flache Positionen).
4. **Funktionieren die Schnittstellen in Node.js, Electron (ohne require) und der bestehende X84-Generator weiterhin?**  
   **Ja.** Alle Regressionstests, einschließlich Electron-DOM-Simulation ohne `require()` und Roundtrip-Export über `generateGAEBX84XML()`, laufen zu 100% fehlerfrei.
