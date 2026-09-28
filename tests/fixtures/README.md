# Test-Fixtures für GAEB X83 (W-Link ERP)

In diesem Verzeichnis befinden sich Testdaten zur Verifikation des GAEB DA XML 3.3 Parsers (`js/gaeb/`) und zur Schemavalidierung (`tests/validate_xsd.py`).

## Klassifikation der Testdateien

### 1. Streng valide XSD-Referenz (`EXPECTED_VALID`)
- **`gaeb_x83/valid_schema_reference.x83`**:
  - Unabhängig und synthetisch erstellte X83-Referenzdatei, die streng alle Vorgaben von `GAEB_DA_XML_83_3.3_2021-05.xsd` erfüllt (korrekter Phasen-Namespace `http://www.gaeb.de/GAEB_DA_XML/DA83/3.3`, `VersDate 2021-05`, gültige Feldlängen, korrekte Sequenzierung von `BoQInfo`, `BoQCtgy` und `Item`).
  - Dient in `tests/validate_xsd.py` als Kriterium für den erfolgreichen XSD-Durchlauf (Exit-Code 0).

### 2. Projektinterne Edge-Case-Testmodelle (`PROJECT_INTERNAL_MODELS`)
Die folgenden 5 Modelle wurden gezielt konstruiert, um das funktionale Verhalten und die Robustheit des Parsers gegen reale Praxisfälle und Randbedingungen abzusichern:
- **`01_standard_hierarchie.x83`**: 3 verschachtelte `BoQCtgy`-Ebenen (Gewerk, Abschnitt, Unterabschnitt), mehrzeilige Langtexte, Pfad-OZ.
- **`02_positionstypen_wahl_bedarf.x83`**: Erkennung von Grundpositionen (`ALNSerNo 00`), Wahlpositionen (`ALNSerNo 01`), Bedarfspositionen mit/ohne Gesamtbetrag (`Provis`) und Pauschalpositionen (`LumpSumItem`).
- **`03_bieterangaben_vorbemerkungen_ep.x83`**: Bietertextergänzungen (`BiReq`), Vorbemerkungen auf Titelebene, Hinweistexte und EP-Aufgliederung (`UPComponents`).
- **`04_reales_muster_hochbau.x83`**: Umfangreicheres Hochbaumuster mit mehreren Gewerken und realistischen Bauleistungen.
- **`05_muster_angelehnt_an_gaeb_bvbs.x83`**: Projektinternes Modell mit ZTVE-Spezifikationen und Erdarbeiten, strukturell angelehnt an gängige Ausschreibungsbeispiele.

> **Wichtiger Hinweis zu Schemadiskrepanzen der internen Testmodelle:**
> Diese 5 Modelle verwenden u. a. den allgemeinen Namespace `http://www.gaeb.de/GAEB_DA_XML/DA_XML_3.3`, überschreiten Feldlängenbeschränkungen (z. B. Projektnamen > 20 Zeichen) oder nutzen legacy Tag-Anordnungen. Sie sind wohlgeformtes XML, fallen jedoch bei strikter XSD-Prüfung gegen das 2021-05 DA83-Schema durch. Dies ist gewollt, um die Toleranz des Parsers gegenüber Nicht-Standard-Formatierungen aus Fremd-AVA-Programmen zu testen.

---

## Status: Offizielle BVBS-Zertifizierungsdateien

> **Deklaration des Akzeptanzpunkts:**
> **«aktuell noch nicht mit externer BVBS-Datei belegt»**

**Begründung:**
Offizielle Zertifizierungs- und Prüfdateien des Bundesverbands Bausoftware e.V. (BVBS e.V.) unterliegen dem Urheberrecht des BVBS und seiner Mitglieder. Sie dürfen ohne entsprechende Verbandsmitgliedschaft und Lizenzvereinbarung nicht öffentlich in einem Code-Repository verbreitet oder mitgeliefert werden.

Um Transparenz und Lizenzintegrität zu wahren:
- Es wird **keine** Datei als «offizielle BVBS-Datei» bezeichnet, die nicht direkt und autorisiert vom Verband lizenziert wurde.
- Die Testdatei `05_muster_angelehnt_an_gaeb_bvbs.x83` ist ausdrücklich ein **projektinternes Modell** und keine Originaldatei des BVBS.
- Sobald eine autorisierte BVBS-Zertifizierungsdatei vorliegt, kann diese in `EXPECTED_VALID` aufgenommen werden.
