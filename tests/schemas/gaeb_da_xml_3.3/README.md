# GAEB DA XML 3.3 Schemadokumentation

## Herkunft und Urheber
Die in diesem Verzeichnis hinterlegten XSD-Schemadateien stammen offiziell vom:
- **Herausgeber:** Gemeinsamer Ausschuss Elektronik im Bauwesen (GAEB) im Hauptausschuss des Deutschen Vergabe- und Vertragsausschusses für Bauleistungen (DVA) / DIN Deutsches Institut für Normung e. V.
- **Bearbeiter (laut XSD-Header):** Bernhard Rath (Ing.-Büro B. Rath), Ladislav Ostry, Martin Hubert, Andreas Schmidt.
- **Version:** GAEB DA XML 3.3 Ausgabe `2021-05` (Stand: 14.06.2021 / Redefine-Datum 2021-06-14).
- **Ziel-Namespace Phase 83:** `http://www.gaeb.de/GAEB_DA_XML/DA83/3.3`
- **Ziel-Namespace Typbibliothek:** `http://www.gaeb.de/GAEB_DA_XML/DA83/3.3` via `<xs:redefine schemaLocation="GAEB_DA_XML_Lib_3.3_2021-05.xsd">`

## Enthaltene Schemadateien
1. `GAEB_DA_XML_Lib_3.3_2021-05.xsd`: Zentrale Typ- und Elementbibliothek für alle Datenaustauschphasen 80–87.
2. `GAEB_DA_XML_80_3.3_2021-05.xsd`: Phase 80 (Universelle Schnittstelle)
3. `GAEB_DA_XML_81_3.3_2021-05.xsd`: Phase 81 (Leistungsbeschreibung)
4. `GAEB_DA_XML_82_3.3_2021-05.xsd`: Phase 82 (Kostenansatz)
5. `GAEB_DA_XML_83_3.3_2021-05.xsd`: Phase 83 (Angebotsaufforderung / Ausschreibung)
6. `GAEB_DA_XML_84_3.3_2021-05.xsd`: Phase 84 (Angebotsabgabe)
7. `GAEB_DA_XML_85_3.3_2021-05.xsd`: Phase 85 (Nebenangebot)
8. `GAEB_DA_XML_86_3.3_2021-05.xsd`: Phase 86 (Auftragserteilung)
9. `GAEB_DA_XML_87_3.3_2021-05.xsd`: Phase 87 (Vertragsänderung)

## Einsatzzweck im Projekt W-Link ERP
1. **Automatisierte Schemaprüfung:**
   Nutzung durch `tests/validate_xsd.py` via `lxml.etree.XMLSchema`, um zu verifizieren, ob eingehende oder erzeugte XML-Dateien die strikte Struktur des Standards einhalten.
2. **Referenz für Datentypen und Beschränkungen (Facets):**
   Nachschlagen von Feldlängen (z. B. `tgNormalizedString20` für `BoQInfo.Name`, `tgNormalizedString4` für Mengeneinheiten), Elementfolgen und Pflichtknoten (`OutlCompl`, `BoQBkdn`, etc.).

## Unveränderlichkeits-Garantie
Die offiziellen XSD-Dateien in diesem Verzeichnis sind reine Referenzschemata. Sie dürfen **niemals** manuell modifiziert, gekürzt oder an unvollständige Parser angepasst werden. Abweichungen von Dokumenten gegen das Schema müssen transparent im Validierungsbericht ausgewiesen werden.
