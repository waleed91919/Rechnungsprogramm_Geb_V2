# Test-Fixtures für GAEB X83 (W-Link ERP)

In diesem Verzeichnis befinden sich Testdaten zur Verifikation des GAEB XML Parsers (`js/gaeb/`) und zur Schemavalidierung (`tests/validate_xsd.py`).

---

## Klassifikation der Testdateien

### 1. Projektinterne XSD-Minimalreferenz (`EXPECTED_VALID`)
- **`gaeb_x83/valid_schema_reference.x83`**:
  - **Status:** **Projektintern erstellte Minimal-Referenzdatei**, konstruiert exakt nach den Vorgaben der `GAEB_DA_XML_83_3.3_2021-05.xsd`.
  - **Wichtiger Klarstellung:** Diese Datei ist **kein** offizielles BVBS-Muster, sondern ein intern generierter Schematestfall zur Überprüfung der XSD-Validierungslogik.
  - **Eigenschaften:** Korrekter Phasen-Namespace `http://www.gaeb.de/GAEB_DA_XML/DA83/3.3`, `VersDate 2021-05`, strikt konforme Feldlängen und Sequenzierung (`BoQInfo`, `BoQCtgy`, `Item`).
  - Dient in `tests/validate_xsd.py` als technisches Kriterium für die Schemaüberprüfung gegen die offizielle XSD-Datei.

### 2. Unabhängige externe Testdatei aus Open-Source-Projekt (`INDEPENDENT_EXTERNAL_FILES`)
- **`gaeb_x83/independent_pygaeb_da32.x83`**:
  - **Herkunft / Provenienz:** Aus dem Open-Source-Projekt `pyGAEB` (`https://github.com/frameIQ/pygaeb`, Pfad: `tests/fixtures/gaebxml.x83`).
  - **Lizenz:** MIT-Lizenz (Copyright 2024 frameIQ). Freie Verwendung zu Test- und Entwicklungszwecken.
  - **Format:** GAEB DA XML 3.2, Phase 83 (Namespace `http://www.gaeb.de/GAEB_DA_XML/DA83/3.2`, Version `3.2`, VersDate `2013-10`, DP `83`).
  - **Inhalt:** Vollständige, von realer AVA-Software abgeleitete Datenstruktur mit synthetischen Projektdaten («Neubau Lagerhalle»). Enthält verschachtelte Kategorien mit leerem `LblTx`, Mengenangaben über `<QtyTBD>`, mehrzeilige Langtexte, Pauschalpositionen und keine Einheitspreise (Ausschreibungszustand). Keine Kundendaten, rein synthetisches Testmaterial.
  - **Ergebnis der XSD-Prüfung (`tests/validate_xsd.py`):**
    - Schlägt bei Prüfung gegen das GAEB DA XML 3.3 (2021-05) Schema fehl.
    - **Ursache:** Ehrliche und unmanipulierte Versionsdiskrepanz (Datei folgt dem Schema 3.2, das Prüfschema verlangt Version 3.3). Die Datei wird bewusst im Originalzustand ohne Namespace-Hacks belassen.
  - **Ergebnis der Parser-Prüfung (`GAEBEngine.parseGAEBXML`):**
    - Wird fehlerfrei eingelesen: 1 Hauptgewerk, 2 Unterabschnitte, 6 Positionen, Langtexte, Pauschalen und Kennzeichnung von `QtyTBD`.
    - Alle Positionen bleiben strikt unbepreist (`preis: null`, `gesamtpreis: null`, `isPriceMissing: true`).

### 3. Projektinterne Edge-Case-Testmodelle (`PROJECT_INTERNAL_MODELS`)
Die folgenden 5 Modelle wurden intern konstruiert, um die funktionale Robustheit und Fehlertoleranz des Parsers gegenüber nicht-idealen AVA-Exporten abzusichern:
- **`01_standard_hierarchie.x83`**: 3 verschachtelte `BoQCtgy`-Ebenen (Gewerk, Abschnitt, Unterabschnitt), mehrzeilige Langtexte, Pfad-OZ.
- **`02_positionstypen_wahl_bedarf.x83`**: Erkennung von Grundpositionen (`ALNSerNo 00`), Wahlpositionen (`ALNSerNo 01`), Bedarfspositionen mit/ohne Gesamtbetrag (`Provis`) und Pauschalpositionen (`LumpSumItem`).
- **`03_bieterangaben_vorbemerkungen_ep.x83`**: Bietertextergänzungen (`BiReq`), Vorbemerkungen auf Titelebene, Hinweistexte und EP-Aufgliederung (`UPComponents`).
- **`04_reales_muster_hochbau.x83`**: Umfangreicheres Hochbaumuster mit mehreren Gewerken und realistischen Bauleistungen.
- **`05_muster_angelehnt_an_gaeb_bvbs.x83`**: Projektinternes Modell mit ZTVE-Spezifikationen und Erdarbeiten, strukturell angelehnt an gängige Ausschreibungsbeispiele.

> **Dokumentierte Schemadiskrepanzen der internen Testmodelle:**
> Diese 5 Modelle verwenden u. a. den allgemeinen Namespace `http://www.gaeb.de/GAEB_DA_XML/DA_XML_3.3` statt des Phasennamespace `DA83/3.3` oder überschreiten Feldlängenbeschränkungen. Sie sind wohlgeformtes XML, weichen jedoch vom strikten DA83-Schema ab. Dies dient der Absicherung der Parser-Toleranz gegenüber abweichenden Fremdsystemen.

---

## Status: Offizielle BVBS-Zertifizierungsdateien

> **Transparente Deklaration zum Konformitätsstatus:**
> **Ein Konformitätsnachweis mit einer offiziellen BVBS-Zertifizierungsdatei wurde noch nicht erbracht, da offizielle BVBS-Prüfdateien urheberrechtlich geschützt sind und dem BVBS-Mitgliederkreis/Zertifizierungsverfahren vorbehalten sind.**

**Hintergrund und Leitlinien:**
1. Offizielle Zertifizierungs- und Prüfdateien des Bundesverbands Bausoftware e.V. (BVBS e.V.) dürfen ohne Verbandsmitgliedschaft und Zertifizierungsvereinbarung nicht öffentlich in einem Code-Repository verbreitet oder weitergegeben werden.
2. Im W-Link-Repository wird **keine** Datei als «offizielle BVBS-Datei» bezeichnet. Die Datei `05_muster_angelehnt_an_gaeb_bvbs.x83` ist ausdrücklich ein **projektinternes Modell** und keine Verbandsdatei.
3. Formulierungen wie «100% GAEB-Unterstützung» oder «offiziell konform» werden nicht verwendet. Die Testberichte beschreiben nüchtern und sachlich, welche Strukturen durch die aktuellen automatisierten Tests nachweislich abgedeckt und verifiziert sind.
