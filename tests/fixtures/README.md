# Test-Fixtures für GAEB X83 (W-Link ERP)

In diesem Verzeichnis befinden sich Testdaten zur Verifikation des GAEB XML Parsers (`js/gaeb/`) und zur versionierten Schemavalidierung (`tests/validate_xsd.py`).

---

## Klassifikation und Provenienz der Testdateien

### 1. Schema-konforme Referenzdateien (`EXPECTED_VALID`)
Beide nachfolgenden Dateien müssen in `tests/validate_xsd.py` zwingend zu 100% gegen das jeweils passende offizielle GAEB-Schema validieren (0 Schemafehler), andernfalls bricht die Validierung mit Exit-Code != 0 ab.

- **`gaeb_x83/valid_schema_reference.x83`**:
  * **Status:** **Projektintern erstellte Minimal-Referenzdatei**, konstruiert exakt nach den formalen Vorgaben und Datentypen der offiziellen `GAEB_DA_XML_83_3.3_2021-05.xsd`.
  * **Wichtige Klarstellung:** Diese Datei ist **kein** offizielles BVBS-Muster, sondern ein intern konstruierter technischer Schematestfall.
  * **Eigenschaften:** Korrekter Phasennamespace `http://www.gaeb.de/GAEB_DA_XML/DA83/3.3`, `VersDate 2021-05`, strikt konforme Elementsequenz (`AwardInfo`, `BoQInfo`, `BoQCtgy`, `Itemlist`, `Item`).
  * **Prüfschema:** Offizielles GAEB DA XML 3.3 Schema (`tests/schemas/gaeb_da_xml_3.3/GAEB_DA_XML_83_3.3_2021-05.xsd`).
  * **Ergebnis:** 100% Schemakonform (0 Fehler).

- **`gaeb_x83/independent_pygaeb_da32.x83`**:
  * **Herkunft / Quelle:** Aus dem unabhängigen Open-Source-Projekt `pyGAEB`:
    `https://github.com/frameIQ/pygaeb/blob/main/tests/fixtures/gaebxml.x83`
  * **Commit / Stand:** pyGAEB main branch (Commit SHA `51262eb3a21433b4060f72858d1826d54057d3c3` bzw. `61ec16cb935fec56b8cd622409223d6a684c76f9`).
  * **Lizenz:** MIT License (Copyright 2024 frameIQ).
  * **Byte-for-Byte Identität:** **100% identisch zur Originaldatei**, keinerlei lokale Modifikationen oder Namespace-Hacks!
    - Dateigröße: 9.767 Bytes
    - SHA-256 Prüfsumme: `F2ECB8C303D1B03F03F13CE254CB556049D45D31C7B9CF2EADEE5FC05013B74D`
  * **Format:** GAEB DA XML 3.2, Phase 83 (Namespace `http://www.gaeb.de/GAEB_DA_XML/DA83/3.2`, Version `3.2`, VersDate `2013-10`, DP `83`).
  * **Inhalt:** Reale AVA-Struktur («Neubau Lagerhalle») mit 1 Hauptgewerk, 2 Abschnitten, 6 Positionen (inkl. QtyTBD-Mengenvorbehalten, mehrzeiligen Langtexten, Pauschalen und unbepreistem Status).
  * **Prüfschema:** Offizielles GAEB DA XML 3.2 Schema (`tests/schemas/gaeb_da_xml_3.2/GAEB_DA_XML_83_3.2_2013-10.xsd`).
  * **Ergebnis:** 100% Schemakonform (0 Fehler).

---

### 2. Projektinterne Edge-Case-Testmodelle (`PROJECT_INTERNAL_MODELS`)
Die folgenden 5 Modelle wurden projektintern konstruiert, um die funktionale Robustheit und Fehlertoleranz des Parsers gegenüber abweichenden oder unvollständigen AVA-Exporten abzusichern:
- **`01_standard_hierarchie.x83`**: 3 verschachtelte `BoQCtgy`-Ebenen (Gewerk, Abschnitt, Unterabschnitt), mehrzeilige Langtexte, Pfad-OZ.
- **`02_positionstypen_wahl_bedarf.x83`**: Erkennung von Grundpositionen (`ALNSerNo 00`), Wahlpositionen (`ALNSerNo 01`), Bedarfspositionen mit/ohne Gesamtbetrag (`Provis`) und Pauschalpositionen (`LumpSumItem`).
- **`03_bieterangaben_vorbemerkungen_ep.x83`**: Bietertextergänzungen (`BiReq`), Vorbemerkungen auf Titelebene, Hinweistexte und EP-Aufgliederung (`UPComponents`).
- **`04_reales_muster_hochbau.x83`**: Umfangreicheres Hochbaumuster mit mehreren Gewerken und realistischen Bauleistungen.
- **`05_muster_angelehnt_an_gaeb_bvbs.x83`**: Projektinternes Modell mit ZTVE-Spezifikationen und Erdarbeiten, strukturell angelehnt an gängige Ausschreibungsbeispiele.

> **Dokumentierte Schemadiskrepanzen der internen Testmodelle:**
> Diese 5 Modelle verwenden u. a. den allgemeinen Namespace `http://www.gaeb.de/GAEB_DA_XML/DA_XML_3.3` statt des Phasennamespace `DA83/3.3` oder überschreiten Feldlängenbeschränkungen. Sie sind wohlgeformtes XML, weichen jedoch vom strikten DA83-Phasenschema ab. Dies dient der Absicherung der Parser-Resilienz gegenüber abweichenden Fremdsystemen.

---

## Rechtlicher Status: Offizielle BVBS-Zertifizierungsdateien

> **Transparente Deklaration zum Konformitätsstatus:**
> **Ein Konformitätsnachweis mit einer offiziellen BVBS-Zertifizierungsdatei wurde noch nicht erbracht, da offizielle BVBS-Prüfdateien urheberrechtlich geschützt sind und dem BVBS-Mitgliederkreis/Zertifizierungsverfahren vorbehalten sind.**

**Hintergrund und Leitlinien:**
1. Offizielle Zertifizierungs- und Prüfdateien des Bundesverbands Bausoftware e.V. (BVBS e.V.) dürfen ohne Verbandsmitgliedschaft und Zertifizierungsvereinbarung nicht öffentlich in einem Code-Repository verbreitet oder weitergegeben werden.
2. Im W-Link-Repository wird **keine** Datei als «offizielle BVBS-Datei» bezeichnet. Die Datei `05_muster_angelehnt_an_gaeb_bvbs.x83` ist ausdrücklich ein **projektinternes Modell** und keine Verbandsdatei.
3. Formulierungen wie «100% GAEB-Unterstützung» oder «offiziell zertifiziert» werden nicht verwendet. Die Testberichte beschreiben nüchtern und sachlich, welche Strukturen durch die aktuellen automatisierten Tests nachweislich abgedeckt und verifiziert sind.
