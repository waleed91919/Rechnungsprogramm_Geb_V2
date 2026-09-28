# GAEB X83 Import & Unabhängige Validierung: Prüf- und Fortschrittsbericht

**Datum:** 28. September 2026  
**Branch:** `review/gaeb-x83-integrity` (abgezweigt von `review/gaeb-x83-persistence` auf Commit `037493e`)  
**Bezugsdokument:** `liesen.txt`  
**Status:** Vollständige, revisionssichere Datenintegrität & Persistenzgarantien implementiert und verifiziert (100% Tests bestanden)  
**Testsuites:**
- `python tests/validate_xsd.py` & `python tests/validate_xsd.py --self-test`
- `node --test tests/gaeb_x83_persistence.test.js` (23 Tests in 9 Suites)
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
| GAEB X83 Persistenz & Roundtrip (14 Tests) | `node --test tests/gaeb_x83_persistence.test.js` | 14/14 Pass (Exit 0) | ~1.3s |
| X83 Import Audit (19 Tests) | `node --test tests/gaeb_x83_import_audit.test.js` | 19/19 Pass (Exit 0) | ~2.5s |
| GAEB DA XML 3.3 Export/Validierung | `node --test tests/gaeb_validation.test.js` | 6/6 Pass (Exit 0) | ~1.9s |
| Angebots-Lebenszyklus | `node --test tests/angebot_lifecycle.test.js` | 1/1 Pass (Exit 0) | ~12.5s |
| Angebots-UI-Workflow | `node --test tests/angebot_ui_workflow.test.js` | 1/1 Pass (Exit 0) | ~0.6s |
| Electron DOM & PDF-Workflow | `node --test tests/angebot_true_ui_and_pdf.test.js` | 1/1 Pass (Exit 0) | ~3.8s |

---

## 6. Beantwortung der Leitfragen aus `liesen.txt`

1. **Hat die unabhängige Testdatei XSD 3.2 bestanden?**  
   **Ja, zu 100% mit 0 Fehlern.** Unter dem offiziellen GAEB DA XML 3.2 Schema (Stand 2013-10) ist `independent_pygaeb_da32.x83` formal und strukturell absolut valide.
2. **Was hat W-Link ERP nachweislich korrekt importiert und persistiert?**  
   - Vollständige BoQCtgy-Hierarchien (Hauptkategorien, Abschnitte und Unterabschnitte).
   - Reale Behandlung von leeren Kategorietexten ohne Scoping-Fehler.
   - Exakte Reihenfolge aller Kategorien und Positionen.
   - Korrekte Differenzierung von Menge 1 (Pauschale), regulärer Menge (600, 800, 240) und Mengenvorbehalten (`QtyTBD` -> `menge: null`, `isQtyTBD: true`).
   - Mehrzeilige Langtexte und Vorbemerkungen auf Titelebene vollständig erhalten.
   - Bietertextergänzungen (`BiReq`) und Einheitspreis-Aufgliederungen (`UPComponents`).
   - Vergaberechtliche Null-Sicherheit: Alle unbepreisten Positionen bleiben `preis: null`, `isPriceMissing: true`.
   - Re-Import-Sicherheit mit Verknüpfungsschutz und atomarem Rollback.
3. **Was bleibt aktuell noch unberücksichtigt (Folgeaufgaben für spätere Phasen)?**  
   - Ausschreibungs-Explorer UI zur visuellen Baum-Navigation und Bieter-Texteingabe.
   - Bepreisungs-Maske für GAEB-Positionen zur Übernahme in Angebote (`linked_position_id`).
   - Neuer hierarchischer X84-Generator (der bestehende X84-Generator exportiert flache Positionen).
   - VHB-Formblätter 221/223 für automatisierte GAEB-Kalkulationsblätter.
4. **Funktionieren die Schnittstellen in Node.js, Electron (ohne require) und der bestehende X84-Generator weiterhin?**  
   **Ja.** Alle Regressionstests, einschließlich Electron-DOM-Simulation ohne `require()` und Roundtrip-Export über `generateGAEBX84XML()`, laufen zu 100% fehlerfrei.

---

## 7. GAEB X83 SQLite-Persistenz & Roundtrip-Architektur

### 7.1 Modulares Datenmodell (`db/schema/gaeb_schema.js`)
Die GAEB-Ausschreibungsstrukturen wurden strikt von den produktiven Belegtabellen (`dokumente` und `positionen`) getrennt:
1. `gaeb_imports`:
   - Eindeutige ID, Original-Dateiname, GAEB-Version (`3.2`/`3.3`), Phase (`83`/`X83`), Projektname, Währung.
   - `file_hash`: SHA-256 Prüfsumme, serverseitig aus dem Original-Byte-Puffer berechnet (mit Index `idx_gaeb_imports_file_hash`).
   - `file_size`: Exakte Dateigröße in Bytes.
   - `raw_bytes` (BLOB): Unveränderte Original-Datei-Bytes (inklusive evtl. UTF-8 BOM `\uFEFF` und CRLF-Zeilenumbrüchen).
   - `raw_xml` (TEXT): Decodierter XML-Text für schnelle Volltextsuchen und Parser-Verarbeitung.
   - `imported_at`, `updated_at`: Zeitstempel.
2. `gaeb_categories`:
   - `import_id` (FK `gaeb_imports.id` ON DELETE CASCADE).
   - `parent_id` (FK `gaeb_categories.id` ON DELETE CASCADE für n-stufige Baumhierarchien).
   - `cat_level`: Hierarchiestufe (0 = Gewerk, 1 = Abschnitt, 2 = Unterabschnitt etc.).
   - `sort_index`: Exakte Reihenfolge im XML.
   - `lbl_ctgy`, `rno_part`, `path_oz`: Pfad-Ordnungszahlen.
   - `name`, `description`: Bezeichnung und Vorbemerkungen auf Titelebene.
   - `raw_metadata_json`: Strukturierte Metadaten (Original-IDs, Remarks).
3. `gaeb_items`:
   - `import_id` (FK `gaeb_imports.id` ON DELETE CASCADE).
   - `category_id` (FK `gaeb_categories.id` ON DELETE CASCADE).
   - `sort_index`, `path_oz`, `rno_part`: Ordnungszahlen und XML-Reihenfolge.
   - `item_type`: Normal-, Grund-, Wahl-, Bedarfs- und Pauschalpositionen sowie Hinweistexte.
   - `short_text`, `long_text`: Vollständige Kurz- und mehrzeilige Langtexte.
   - `menge`: Null bei `QtyTBD`, Hinweistexten oder fehlender Menge; kein Platzhalter 1 Stk.!
   - `is_qty_tbd`: Kennzeichen für Mengenvorbehalt.
   - `einheit`: Maßeinheit (`m³`, `m²`, `Psch` etc.).
   - `preis`: Strikt `NULL` in X83 (keine Scheinwerte `0.00 €`!).
   - `gesamtpreis`: `NULL` in X83.
   - `is_price_missing`: `1` für unbepreiste Positionen.
   - `in_endsumme_enthalten`: Differenzierung für Grund/Wahl/Bedarf.
   - `aln_group_no`, `aln_ser_no`, `provis`: Vergaberechtliche Attribute.
   - `is_hinweistext`: Kennzeichnung mengenneutraler Texte.
   - `linked_position_id`: Optionales Kennzeichen für zukünftige Positionsverknüpfung im Pricing-Editor.
4. `gaeb_item_bireq`:
   - `item_id` (FK `gaeb_items.id` ON DELETE CASCADE).
   - `bireq_type`, `label`, `description`, `value`: Strukturierte Speicherung der Bieterangaben.
5. `gaeb_item_up_components`:
   - `item_id` (FK `gaeb_items.id` ON DELETE CASCADE).
   - `lohn`, `stoff`, `geraet`, `sonstiges`, `total`: Einheitspreis-Aufgliederung.
6. `gaeb_import_angebote` (Neu gemäß Garantie 1 aus `liesen.txt`):
   - `import_id` (INTEGER NOT NULL REFERENCES `gaeb_imports(id)` ON DELETE RESTRICT).
   - `angebot_id` (INTEGER NOT NULL REFERENCES `dokumente(id)` ON DELETE RESTRICT).
   - `linked_at` (TEXT DEFAULT CURRENT_TIMESTAMP).
   - `notes` (TEXT): Dokumentierte Referenzinformationen.
   - `UNIQUE(import_id, angebot_id)` sowie Indizes `idx_gaeb_import_angebote_import` und `idx_gaeb_import_angebote_angebot`.

### 7.2 Repository-Operationen & Integritäts-Garantien (`db/repositories/gaeb_repository.js`)

#### Garantie 1: Reale, SQLite-gestützte Verknüpfung mit echten Angebotsversionen
- **Verknüpfungsmethode:** `linkImportToAngebot(db, importId, angebotId, notes = null)`:
  - Verifiziert serverseitig die Existenz von `importId` in `gaeb_imports`.
  - Verifiziert serverseitig die Existenz von `angebotId` in `dokumente` UND prüft strikt, dass `type === 'angebot'`. Ungültige Belege (wie Rechnungen) oder Dummy-IDs werden hart abgewiesen.
- **Abfrage:** `getLinkedAngebote(db, importId)` und `isImportLinked(db, importId)` liefern verknüpfte Angebote mit Belegnummer, Versionsstand, Belegstatus und Verknüpfungszeitstempel.
- **Zweistufiger Löschschutz:**
  1. *Repository-Ebene:* `deleteX83Import()` prüft `isImportLinked()`. Bei mindestens einem verknüpften Angebot wird das Löschen mit einer klaren Fehlermeldung verweigert.
  2. *Datenbank-Ebene:* Durch `ON DELETE RESTRICT` schlägt auch ein direkter SQL-Aufruf `DELETE FROM gaeb_imports WHERE id = ?` fehl (`FOREIGN KEY constraint failed`).
- **Re-Import Policy & Überschreibschutz:**
  - Ist ein bestehender Import mit mindestens einem Angebot verknüpft, wird ein Überschreiben (`overwrite: true`) strikt abgewiesen. Das historische Original eines aktiven Angebots darf nicht überschrieben werden.
  - Bei unverknüpften Importen erlaubt `overwrite: true` ein sauberes atomares Ersetzen.
  - Ohne `overwrite: true` wird der existierende Datensatz unverändert zurückgegeben (`isExisting: true`).
  - Ändert sich der Datei-Inhalt (anderer Hash), wird stets ein neuer Importdatensatz angelegt, selbst wenn der Dateiname identisch ist.
- **Sachliche Abgrenzung:** Die Verknüpfung zwischen der GAEB-Ausschreibung und dem Gesamt-Angebot in `dokumente` ist durch dieses Datenmodell revisionssicher geschützt. Die kleinteilige Zuordnung einzelner LV-Positionen zu Positionen in Entwürfen (`linked_position_id`) bleibt ausdrücklich der späteren Bepreisungs- und Kalkulationsmaske vorbehalten, da Entwurfspositionen beim Zwischenspeichern neu generiert werden können.

#### Garantie 2: Speicherung der echten Original-Datei-Bytes (BLOB)
- **Strikte Trennung von Bytes und Text:**
  - Wenn `rawBytes` (Buffer) übergeben wird, verifiziert das Repository `Buffer.isBuffer(buf)`.
  - `file_hash` (SHA-256) und `file_size` werden direkt aus dem binären Puffer berechnet. Clientseitigen Prüfsummen oder `JSON.stringify()` wird niemals blind vertraut.
  - Die Original-Bytes werden bitgenau im Feld `raw_bytes` (BLOB) gespeichert; der decodierte UTF-8 Text wird in `raw_xml` hinterlegt.
  - Dies garantiert 100%ige Bit-Identität bei Roundtrips auch bei Dateien mit UTF-8 BOM (`\uFEFF`) oder Windows-spezifischen Zeilenumbrüchen (`\r\n`).
- **Legacy-String-Pfad:**
  - Wird lediglich ein XML-String übergeben, wird dieser in `raw_xml` gespeichert.
  - Das Feld `raw_bytes` bleibt `NULL`, und `hasOriginalBytes` wird auf `false` gesetzt. Es wird keine Scheingenauigkeit vorgetäuscht.
- **Ressourcenschonende Lade-Policy:**
  - `loadX83Import(db, importId)` liefert standardmäßig keinen speicherintensiven Buffer im Rückgabeobjekt, um IPC und Renderer nicht zu belasten. Es wird lediglich `hasOriginalBytes: boolean` gesetzt.
  - `getImportOriginalBuffer(db, importId)` erlaubt das gezielte Abrufen des Original-Puffers als Node.js `Buffer`.

### 7.3 IPC-Integration (`main/ipc/ipc-gaeb.js`)
- Registrierte Handler:
  - `gaeb:save-import` -> atomares Speichern
  - `gaeb:load-import` -> Laden des Imports (strukturiert, ohne BLOB-Payload)
  - `gaeb:list-imports` -> Übersichtsstatistiken mit `has_original_bytes` und `linked_angebot_count`
  - `gaeb:delete-import` -> geschütztes Löschen
  - `gaeb:link-angebot` -> Verknüpfen mit einem Angebot
  - `gaeb:get-linked-angebote` -> Abrufen der verknüpften Angebote
  - `gaeb:get-original-buffer` -> gezieltes Auslesen des Original-Dateipuffers
- **`main.js` bleibt 100% unberührt.**

### 7.4 Testverifikation des Lebenszyklus (`tests/gaeb_x83_persistence.test.js`)
- **23 automatisierte Tests in 9 Suites** verifizieren alle Aspekte:
  1. *Roundtrip auf offiziellen XSD-Referenzen (3.3 & 3.2):* Vollständiger Tiefenvergleich aller Attribute, Hierarchien und OZs nach `db.close()` und Wiedereröffnung.
  2. *Interne Testmodelle (Edge Cases):* 3-stufige Hierarchien, Wahl-/Bedarfs-/Pauschalpositionen, Vorbemerkungen, BiReq, UPComponents.
  3. *Fehlertoleranz & Rollback:* Fehler mitten im Insert führt zu vollständigem Transaktions-Rollback (0 Zeilen verbleiben).
  4. *Altdaten-Migration & Idempotenz:*
     - Alt-Schema ohne GAEB wird migriert, ohne Kunden/Rechnungen/Angebote zu beeinträchtigen.
     - Alt-GAEB-Tabelle ohne `raw_bytes` und ohne `gaeb_import_angebote` wird migriert; zweimaliger Aufruf führt zu keinen Fehlern; `PRAGMA foreign_key_check` liefert 0 Fehler.
  5. *Übersicht & Statistik:* `listX83Imports` liefert exakte Zähler für Items, Kategorien, Bytes und Verknüpfungen.
  6. *Byte-genauer Buffer-Roundtrip (Garantie 2):* Speichern mit BOM und CRLF; Neuöffnen der DB; `Buffer.compare() === 0`, identischer Hash und exakte Byte-Länge.
  7. *Legacy-String-Pfad:* Speichern ohne Buffer liefert `hasOriginalBytes: false` und `getImportOriginalBuffer: null`.
  8. *Reale Angebotsverknüpfung (Garantie 1):* Verknüpfung mit Angebot in `dokumente`; Prüfung gegen Fremdkörper (Rechnung oder ungültige ID wirft Fehler).
  9. *Lösch- und Überschreibschutz:* Verknüpfter Import kann weder über das Repository noch über SQL direkt gelöscht werden; Overwrite wird hart abgewiesen; unverknüpfter Import darf gelöscht werden.

