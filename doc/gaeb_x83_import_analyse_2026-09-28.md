# GAEB X83 Import & Validierung: Prüf- und Fortschrittsbericht

**Datum:** 28. September 2026  
**Branch:** `fix/gaeb-x83-validation` (abgezweigt von `review/gaeb-x83-import`)  
**Bezugsdokument:** `liesen.txt`  
**Status:** Erfolgreich implementiert, modularisiert und verifiziert  
**Testsuites:** `tests/gaeb_x83_import_audit.test.js`, `tests/validate_xsd.py`, `tests/gaeb_validation.test.js`  
**Referenzschemata:** `tests/schemas/gaeb_da_xml_3.3/` (GAEB DA XML 3.3 Ausgabe 2021-05)  
**Testfixtures:** `tests/fixtures/gaeb_x83/` (`valid_schema_reference.x83` + 5 interne Testmodelle)

---

## 1. Executive Summary

Auf Basis der Anforderungen aus `liesen.txt` wurde der GAEB X83 Import-Kern von W-Link ERP architektonisch modularisiert, die Schemavalidierung auf ein striktes und transparentes Fundament gestellt und die Bepreisungslogik nach VOB/Ausschreibungsvorgaben gehärtet.

### Zentrale Resultate:
1. **Modulare Kern-Architektur (`js/gaeb/`):**
   Die vormalige Monolith-Datei `js/gaeb.js` wurde in 4 fokussierte, isomorphe Module aufgeteilt:
   - `js/gaeb/xml_dom_utils.js`: Sichere DOMParser-Bereitstellung für Node.js (`jsdom`), Browser und Electron; XML-Bereinigung und Maskierung.
   - `js/gaeb/hierarchy_builder.js`: Rekursives Durchlaufen von `BoQCtgy`-Knoten, Hierarchie-Aufbau (`categoryPath`, `gewerk`, `abschnitt`, `titel`), Speicherung von Vorbemerkungen und Rekonstruktion von Pfad-OZs unter Erhalt des lokalen `rno_part`.
   - `js/gaeb/item_reader.js`: Vollständige Extraktion von Kurz- und Langtexten, Mengen, Einheiten sowie null-sichere Preisbehandlung.
   - `js/gaeb/item_types.js`: Zuordnung von Positionstypen (`NORMAL`, `GRUND`, `WAHL`, `BEDARF`, `PAUSCHALE`, `HINWEISTEXT`), Bieterangaben (`<BiReq>`) und Preisaufgliederungen (`<UPComponents>`).
   - `js/gaeb.js`: Schlanker, rückwärtskompatibler Einstiegspunkt mit unveränderter Schnittstelle `GAEBEngine.parseGAEBXML(xmlString)`.
2. **Ehrliche & strikte XSD-Validierung (`tests/validate_xsd.py`):**
   - Entfernung jeglicher Namespace-Ersetzungshacks.
   - Explizite Trennung in `EXPECTED_VALID` (strikt schema-konforme Referenzen; bricht bei Fehlern mit Exit-Code != 0 ab) und `PROJECT_INTERNAL_MODELS` (interne Testmodelle für Parser-Grenzfälle mit dokumentierten Abweichungen).
   - Unmissverständliche Feststellung: Da offizielle BVBS-Zertifizierungsdateien dem Urheberrecht des BVBS e.V. unterliegen und ohne Lizenz nicht öffentlich im Repository verteilt werden dürfen, ist der Akzeptanzpunkt bezüglich einer originalen BVBS-Zertifizierungsdatei als **«aktuell noch nicht mit externer BVBS-Datei belegt»** deklariert. Als technische Schema-Referenz dient die unabhängig erstellte Datei `valid_schema_reference.x83`, welche die offizielle XSD zu 100% erfüllt.
3. **Strikte Bepreisungslogik (liesen.txt):**
   - In Ausschreibungen (X83) fehlende Einheitspreise (`<UP>`) werden **nicht** mehr zu `0.00` konvertiert. Stattdessen werden `preis: null`, `gesamtpreis: null` und `isPriceMissing: true` gesetzt. Keine erfundenen Scheinwerte mehr.
   - Hinweistexte erhalten weder Preise noch Pseudo-Mengen (`menge: null`, `einheit: ''`).

---

## 2. Architektur des modularen Parsers

```
js/gaeb.js (Schlanker Einstiegspunkt / Abwärtskompatible Fassade)
 │
 ├──► js/gaeb/xml_dom_utils.js
 │     └─ getDOMParser() (Node.js/Electron/Browser), extractTextLines(), cleanText(), escapeXML()
 │
 ├──► js/gaeb/hierarchy_builder.js
 │     └─ Rekursive Traversierung von <BoQBody> / <BoQCtgy>, OZ-Pfad-Stack, Vorbemerkungen
 │
 ├──► js/gaeb/item_reader.js
 │     └─ extractKurztext(), extractLangtext(), extractQuantitiesAndPrices() [Null-Safe]
 │
 └──► js/gaeb/item_types.js
       └─ determineItemType() [Wahl/Bedarf/Pauschal], extractBieterangaben(), extractUPComponents()
```

### Umgebungskompatibilität
Jedes Modul ist nach dem dualen Exportmuster strukturiert:
```javascript
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ModulKlasse;
}
if (typeof window !== 'undefined') {
    window.ModulKlasse = ModulKlasse;
}
```
Damit ist die Ausführung gleichermaßen garantiert unter:
- Node.js Test-Runner (`node --test`)
- Electron Main / Node-Integration
- Electron Renderer / Standard-Browser (via Script-Tags in `code.html`)

---

## 3. Validierungsbericht: XSD vs. Modell-Befunde

### 3.1 Schemadokumentation
- **Verzeichnis:** `tests/schemas/gaeb_da_xml_3.3/`
- **Quelle:** Gemeinsamer Ausschuss Elektronik im Bauwesen (GAEB) im Hauptausschuss des DVA / DIN e.V.
- **Bearbeiter:** Bernhard Rath (Ing.-Büro B. Rath), Ladislav Ostry, Martin Hubert, Andreas Schmidt.
- **Version:** GAEB DA XML 3.3 Ausgabe `2021-05` (Stand 14.06.2021).
- **Phasenschema X83:** `GAEB_DA_XML_83_3.3_2021-05.xsd` mit Typenbibliothek `GAEB_DA_XML_Lib_3.3_2021-05.xsd`.

### 3.2 Prüfmatrix (`tests/validate_xsd.py`)

| Gruppe & Datei | Wohlgeformt | Struktur 3.3 | Strikte XSD (2021-05) | Klassifikation / Anmerkung |
| :--- | :---: | :---: | :---: | :--- |
| **EXPECTED_VALID** | | | | |
| `valid_schema_reference.x83` | ✅ JA | ✅ JA | ✅ **BESTANDEN (0 Fehler)** | Unabhängig erstellte XSD-Referenzdatei für Phase 83. |
| **PROJECT_INTERNAL_MODELS** | | | | |
| `01_standard_hierarchie.x83` | ✅ JA | ✅ JA | ⚠️ Abweichung | Namespace `DA_XML_3.3` statt `DA83/3.3`, Projektname > 20 Zeichen. |
| `02_positionstypen_wahl_bedarf.x83` | ✅ JA | ✅ JA | ⚠️ Abweichung | Attribut `ItemType` (AVA-proprietär), Namespace `DA_XML_3.3`. |
| `03_bieterangaben_vorbemerkungen_ep.x83` | ✅ JA | ✅ JA | ⚠️ Abweichung | `Description` auf `BoQCtgy`-Ebene, Namespace `DA_XML_3.3`. |
| `04_reales_muster_hochbau.x83` | ✅ JA | ✅ JA | ⚠️ Abweichung | Mehrere Gewerke, lange Bezeichnungen, Namespace `DA_XML_3.3`. |
| `05_muster_angelehnt_an_gaeb_bvbs.x83` | ✅ JA | ✅ JA | ⚠️ Abweichung | ZTVE-Abschnitte, angelehnt an BVBS, Namespace `DA_XML_3.3`. |

> [!NOTE]
> **Status zu offiziellen BVBS-Zertifizierungsdateien:**
> Offizielle BVBS-Zertifizierungsdateien sind urheberrechtlich geschützt und dürfen ohne Verbandsmitgliedschaft und Lizenz nicht öffentlich im Repository verteilt werden. Dieser Akzeptanzpunkt ist daher ausdrücklich als **«aktuell noch nicht mit externer BVBS-Datei belegt»** deklariert. Es wird keine Pseudodatei als offizielle BVBS-Datei ausgegeben.

---

## 4. Datenerhalt: Was W-Link jetzt verlustfrei liest

1. **Vollständige Hierarchie:**
   - Erhalt beliebig verschachtelter `BoQCtgy`-Ebenen.
   - Zuordnung von `categoryPath`, `gewerk`, `abschnitt`, `titel`, `parentId`.
2. **Präzise Ordnungszahlen (OZ):**
   - Zusammengesetzte Pfad-OZ aus verschachtelten `RNoPart` (z. B. `01.02.0030`) bei gleichzeitigem Erhalt des isolierten `rno_part` (`0030`).
   - Automatische Erkennung und Warnmeldung bei doppelten Ordnungszahlen.
3. **Mehrzeilige Langtexte:**
   - Vollständige Extraktion aller Absätze aus `<CompleteText><DetailTxt><Text>` ohne Textkürzung.
4. **Titel-Vorbemerkungen & Hinweistexte:**
   - Vorbemerkungen auf Kategorie-Ebene werden als `vorbemerkung` gespeichert.
   - Hinweistexte bleiben mengenneutral (`menge: null`, `einheit: ''`, `in_endsumme_enthalten: 0`).
5. **Null-sichere Bepreisung (liesen.txt):**
   - Unbepreiste Ausschreibungspositionen erhalten `preis: null`, `gesamtpreis: null` und `isPriceMissing: true`. Keine Schein-Preise von `0.00`.
6. **Vergaberechtliche Positionstypen:**
   - Grund- (`GRUND`), Wahl- (`WAHL`, ausgeschlossen aus Endsumme), Bedarfs- (`BEDARF_MIT_GB` / `BEDARF_OHNE_GB`) und Pauschalpositionen (`PAUSCHALE`).
7. **Bieterangaben & Preisaufgliederung:**
   - Auslesen von `<BiReq>` in `pos.bieterangaben`.
   - Auslesen von `<UPComponents>` (Lohn, Stoff, Gerät, Sonstiges) in `pos.up_components`.

---

## 5. Nächste Schritte (Nicht Teil dieser Aufgabe)

Gemäß Vorgabe wurden in diesem Task keine neuen SQLite-Tabellen, keine Ausschreibungs-UI und kein neuer X84-Export gebaut. Folgende Arbeitspakete stehen für die nächsten Phasen an:
1. **Datenbank-Persistenz (`schema.js`):**
   - Erstellung relationaler Tabellen zur dauerhaften Speicherung importierter Hierarchien und Bieterangaben.
2. **Benutzeroberfläche (Ausschreibungs-UI):**
   - Baumdarstellung der Gewerke/Titel mit Detailansicht für Langtexte und Ausfüllmaske für Bietertextergänzungen.
3. **Hierarchischer X84-Export:**
   - Ausgabe der bepreisten Positionen innerhalb der hierarchischen `BoQCtgy`-Struktur für die Rückgabe an AVA-Systeme.

---

## 6. Testergebnisse

Alle Testsuiten wurden erfolgreich und vollständig grün ausgeführt:

```text
1. python tests/validate_xsd.py
   EXPECTED_VALID: 1/1 bestanden (100% schema-konform)
   PROJECT_INTERNAL_MODELS: 5/5 dokumentierte Edge-Cases
   Exit-Code: 0

2. node --test tests/gaeb_x83_import_audit.test.js
   17 Tests, 1 Suite, 17 bestanden, 0 Fehler, Dauer: ~2.3s

3. node --test tests/gaeb_validation.test.js
   6 Tests, 1 Suite, 6 bestanden, 0 Fehler, Dauer: ~1.9s

4. node --test tests/angebot_lifecycle.test.js
   1 Test, 1 bestanden, 0 Fehler, Dauer: ~6.8s

5. node --test tests/angebot_ui_workflow.test.js
   1 Test, 1 bestanden, 0 Fehler, Dauer: ~0.5s

6. node --test tests/angebot_true_ui_and_pdf.test.js
   1 Test, 1 bestanden, 0 Fehler, Dauer: ~3.4s
```
