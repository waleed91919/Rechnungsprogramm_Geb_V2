# GAEB DA XML 3.2 Schemadokumentation

## Herkunft und Urheber
Die in diesem Verzeichnis hinterlegten XSD-Schemadateien stammen offiziell von der offiziellen GAEB-Quelle:
- **Download-Quelle:** `https://www.gaeb.de/wp-content/uploads/2019/04/Leistungsverzeichnis.zip`
- **Herausgeber:** Gemeinsamer Ausschuss Elektronik im Bauwesen (GAEB) im Hauptausschuss des Deutschen Vergabe- und Vertragsausschusses für Bauleistungen (DVA) / DIN Deutsches Institut für Normung e. V.
- **Bearbeiter (laut XSD-Header):** Bernhard Rath (Ing.-Büro B. Rath), Ladislav Ostry, Martin Hubert, Andreas Schmidt.
- **Version:** GAEB DA XML 3.2 Ausgabe `2013-10` (Stand: 2013-10).
- **Ziel-Namespace Phase 83:** `http://www.gaeb.de/GAEB_DA_XML/DA83/3.2`
- **Ziel-Namespace Typbibliothek:** `http://www.gaeb.de/GAEB_DA_XML/DA83/3.2` via `<xs:redefine schemaLocation="GAEB_DA_XML_Lib_3.2_2013-10.xsd">`

## Enthaltene Schemadateien
1. `GAEB_DA_XML_Lib_3.2_2013-10.xsd`: Zentrale Typ- und Elementbibliothek für alle Datenaustauschphasen 80–87 der Ausgabe 2013-10.
2. `GAEB_DA_XML_80_3.2_2013-10.xsd`: Phase 80 (Universelle Schnittstelle)
3. `GAEB_DA_XML_81_3.2_2013-10.xsd`: Phase 81 (Leistungsbeschreibung)
4. `GAEB_DA_XML_82_3.2_2013-10.xsd`: Phase 82 (Kostenansatz)
5. `GAEB_DA_XML_83_3.2_2013-10.xsd`: Phase 83 (Angebotsaufforderung / Ausschreibung)
6. `GAEB_DA_XML_84_3.2_2013-10.xsd`: Phase 84 (Angebotsabgabe)
7. `GAEB_DA_XML_85_3.2_2013-10.xsd`: Phase 85 (Nebenangebot)
8. `GAEB_DA_XML_86_3.2_2013-10.xsd`: Phase 86 (Auftragserteilung)
9. `GAEB_DA_XML_87_3.2_2013-10.xsd`: Phase 87 (Vertragsänderung)

## Einsatzzweck im Projekt W-Link ERP
1. **Automatisierte Schemaprüfung von GAEB 3.2 Dateien:**
   Nutzung durch `tests/validate_xsd.py` via `lxml.etree.XMLSchema`, um eingehende GAEB DA XML 3.2 Dateien (wie die unabhängige Testfixture `independent_pygaeb_da32.x83`) versionsgerecht und strikt gegen das offizielle 3.2-Schema zu validieren.
2. **Referenz für Datentypen und Beschränkungen:**
   Nachschlagen von XML-Typen und Elementdefinitionen für GAEB 3.2 im Vergleich zu GAEB 3.3.

## Unveränderlichkeits-Garantie
Die offiziellen XSD-Dateien in diesem Verzeichnis sind reine Referenzschemata im Originalzustand von gaeb.de. Sie dürfen **niemals** manuell modifiziert, gekürzt oder manipuliert werden.
