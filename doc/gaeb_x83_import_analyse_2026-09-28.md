# GAEB X83 Import & Unabhängige Validierung: Prüf- und Fortschrittsbericht

**Datum:** 29. September 2026  
**Branch:** `review/gaeb-tender-pricing-hardening` (abgezweigt von `review/gaeb-tender-pricing-ui` auf Commit `7c829d9`)  
**Bezugsdokument:** `liesen.txt`  
**Status:** Gehärtete Bepreisungsphase, revisionssicheres Entwurfsdatenmodell und modulares Tender-UI implementiert und durch automatisierte Regressionstests verifiziert  
**Testsuites:**
- `python tests/validate_xsd.py` & `python tests/validate_xsd.py --self-test`
- `node --test tests/gaeb_tender_pricing.test.js` (16 Tests in 7 Suites)
- `node --test tests/gaeb_x83_persistence.test.js` (23 Tests in 9 Suites)
- `node --test tests/gaeb_x83_import_audit.test.js` (19 Tests)
- `node --test tests/gaeb_validation.test.js` (6 Tests)
- `node --test tests/angebot_lifecycle.test.js` (1 Test)
- `node --test tests/angebot_ui_workflow.test.js` (1 Test)
- `node --test tests/angebot_true_ui_and_pdf.test.js` (1 Test)
- `node ./node_modules/electron/cli.js tests/test_electron_runner.js` (E2E Chromium DOM Testfall 4c)  
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
  - Dies garantiert Bit-Identität bei Roundtrips auch bei Dateien mit UTF-8 BOM (`\uFEFF`) oder Windows-spezifischen Zeilenumbrüchen (`\r\n`).
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

---

## 8. GAEB Ausschreibungs- und Bepreisungsphase (Tender Pricing UI & Drafts Architecture)

Gemäß der Anforderungen aus `liesen.txt` (Phase «Ausschreibungs- und Bepreisungsphase» und Härtung) wurde die Anwendung um ein vollständiges, modulares Bepreisungs- und Bieterangaben-Subsystem erweitert. Es ermöglicht das verlustfreie Betrachten, Bepreisen, Beantworten von Bietertextergänzungen und versionierte Speichern von Ausschreibungsentwürfen, ohne die ursprünglichen X83-Daten jemals zu verändern.

### 8.1 Datenmodell & Revisionssichere Entwurfsverwaltung (`db/schema/gaeb_schema.js`)

Zur sauberen Entkopplung von Ausschreibungsdaten (Leistungsverzeichnis des Auftraggebers), internen Kalkulationsentwürfen des Bieters und rechtsverbindlichen Geschäftsbelegen in `dokumente` wurden drei Tabellen und native SQLite-Trigger implementiert:

1. **`gaeb_tender_drafts` (Kopfdaten des Bepreisungs-Entwurfs):**
   - `id`: Eindeutiger Primärschlüssel.
   - `import_id`: Fremdschlüssel auf `gaeb_imports.id` (`ON DELETE RESTRICT`). Schützt den Ausschreibungskatalog vor versehentlichem Löschen, solange Entwürfe existieren.
   - `angebot_id`: Optionaler Fremdschlüssel auf `dokumente.id` (`ON DELETE SET NULL`) zur Verknüpfung mit einem bestehenden Angebot.
   - `version`: Versionszähler (z. B. 1 für «Hauptangebot v1», 2 für «v2» etc.). Wird serverseitig deterministisch via `SELECT COALESCE(MAX(version), 0) + 1` ermittelt.
   - `name`: Frei wählbarer Entwurfsname.
   - `status`: Statusfeld (`IN_BEARBEITUNG`, `VOLLSTAENDIG_BEPREIST`, `VERWORFEN`).
     - **Strikte Vollständigkeitsregel:** Der Status wechselt ausschließlich dann auf `VOLLSTAENDIG_BEPREIST`, wenn:
       - `unpriced_count === 0` (alle bepreisbaren Positionen besitzen einen Einheitspreis),
       - `missing_bireq_count === 0` (alle Bieterangaben sind ausgefüllt),
       - `unresolved_qty_tbd_count === 0` (keine Position mit `in_total = 1` hat noch unbestimmte Mengen).
     - Andernfalls verbleibt der Status strikt auf `IN_BEARBEITUNG`.
   - `total_netto`, `total_tax`, `total_brutto`: Berechnete Summen der Bepreisung (fließen nur bei `in_total = 1` und bestimmter Menge ein).
   - `unpriced_count`: Anzahl verbleibender unbepreister Normalpositionen.
   - `missing_bireq_count`: Anzahl verbleibender unbeantworteter Bietertextergänzungen.
   - `unresolved_qty_tbd_count`: Anzahl verbleibender Positionen mit `in_total = 1`, bei denen die Menge unbestimmt ist (`is_qty_tbd = 1` oder `menge IS NULL`).
   - `created_at`, `updated_at`: Revisionszeitstempel.
   - `UNIQUE(import_id, version)`: Datenbankseitiger Unique-Constraint und Index `idx_gaeb_tender_drafts_import_version`, verhindert Versionskollisionen je Import.

2. **Strikte Abgrenzung zwischen Tender-Entwürfen (`gaeb_tender_drafts`) und formalen Angeboten (`dokumente`):**
   - Tender-Entwürfe sind reine interne Arbeitsstände, Kalkulationsvarianten und Verhandlungsblätter für eine importierte Ausschreibung.
   - Das Anlegen, Bearbeiten oder Klonen eines Tender-Entwurfs legt **kein** juristisches Dokument in `dokumente` an und erzeugt **keinen** Datensatz in `gaeb_import_angebote`.
   - Erst wenn ein Angebot formal im ERP existiert, kann ein Entwurf über `angebot_id` mit diesem Beleg verknüpft werden.
   - **Klon-Isolierung:** Beim Klonen eines Entwurfs von Version 1 auf Version 2 (`cloneTenderDraft`) wird `angebot_id` in der neuen Version zwingend auf `NULL` gesetzt. Eine neue Arbeitsversion erbt niemals stillschweigend die Verknüpfung zum offiziellen Angebot.

3. **`gaeb_tender_item_prices` (Positionsbezogene Bepreisung):**
   - `draft_id`: Fremdschlüssel auf `gaeb_tender_drafts.id` (`ON DELETE CASCADE`).
   - `gaeb_item_id`: Fremdschlüssel auf `gaeb_items.id` (`ON DELETE RESTRICT`).
   - `unit_price` (REAL): Der eingegebene Einheitspreis.
     - **Strikte Differenzierung dreier Zustände:**
       - `NULL`: Unbepreist (Warnung «Preis fehlt», fließt nicht in Gesamtsumme ein).
       - `0.00` mit `is_zero_confirmed = 1`: Bewusst kostenlos / im Einheitspreis anderer Positionen enthalten (Null-Bestätigung).
       - `> 0.00`: Regulär bepreiste Position.
   - `is_zero_confirmed` (INTEGER): Kennzeichen, dass 0,00 € bewusst gewählt wurde.
   - `total_price` (REAL): Berechneter Gesamtpreis (`menge * unit_price`). Bleibt strikt `NULL`, wenn `unit_price` `NULL` ist oder wenn Mengenvorbehalt vorliegt (`is_qty_tbd = 1` oder `menge IS NULL`).
   - `tax_rate` (REAL DEFAULT 19.0): Steuersatz.
   - `in_total` (INTEGER DEFAULT 1): Steuerung, ob Position in die Angebotssumme einfließt (Wahl- und Bedarfspositionen standardmäßig `0`).
   - `notes` (TEXT): Bieternotizen.
   - `UNIQUE(draft_id, gaeb_item_id)`.

4. **`gaeb_tender_bireq_answers` (Bietertextergänzungen):**
   - `draft_id`: Fremdschlüssel auf `gaeb_tender_drafts.id` (`ON DELETE CASCADE`).
   - `gaeb_bireq_id`: Fremdschlüssel auf `gaeb_item_bireq.id` (`ON DELETE RESTRICT`).
   - `answer_value` (TEXT): Vom Bieter eingegebener Text (z. B. Fabrikat, Typ, Kennwerte).
   - `UNIQUE(draft_id, gaeb_bireq_id)`.
   - **Revisionssicherheit:** Änderungen an Bieterangaben in Version 2 verändern weder die Antworten in Version 1 noch die Vorgaben der Original-X83.

5. **Datenbank-Trigger zur Belegtyp-Sicherheit (SQLite-Ebene):**
   - `trg_validate_gaeb_import_angebot_type` & `trg_validate_gaeb_import_angebot_type_update`:
     Erzwingen auf `gaeb_import_angebote`, dass nur Dokumente vom Typ `angebot` verknüpft werden können.
   - `trg_validate_gaeb_tender_draft_angebot_type` & `trg_validate_gaeb_tender_draft_angebot_type_update`:
     Erzwingen auf `gaeb_tender_drafts`, dass `angebot_id` ausschließlich auf ein Dokument vom Typ `angebot` verweisen darf.
   - `trg_prevent_type_change_linked_gaeb_angebot`:
     Wird auf der Belegtabelle `dokumente` vor `UPDATE OF type` ausgeführt: Verhindert per `RAISE(ABORT)`, dass ein mit einer GAEB-Ausschreibung oder einem Tender-Draft verknüpftes Angebot nachträglich zu einer Rechnung oder einem anderen Belegtyp umgewandelt wird. Nicht verknüpfte Angebote können weiterhin regulär modifiziert werden.

### 8.2 Repository-Architektur (`db/repositories/gaeb_tender_repo.js` & `gaeb_repository.js`)

Das Tender-Repository kapselt die gesamte Geschäftslogik für Bepreisungen:
- **`createTenderDraft(db, importId, options)`:**
  - Berechnet die nächste Version atomar über `SELECT COALESCE(MAX(version), 0) + 1 FROM gaeb_tender_drafts WHERE import_id = ?`.
  - Berechnet initiale Zähler für unbepreiste Positionen, offene BiReqs und offene QtyTBD-Positionen.
- **`saveTenderDraft(db, draftId, draftData)`:**
  - Wird als **vollständig atomare SQLite-Transaktion** ausgeführt.
  - Prüft Positions- und BiReq-IDs auf Zugehörigkeit zum referenzierten Import.
  - Verhindert das Bepreisen von Hinweistexten (`is_hinweistext = 1`).
  - Hält `total_price = NULL` bei Mengenvorbehalten (`is_qty_tbd = 1` oder `menge IS NULL`).
  - Schließt Positionen mit `in_total = 0` (z. B. Wahlpositionen) aus der Gesamtsumme aus.
  - Ermittelt `unresolved_qty_tbd_count` und setzt `status = 'VOLLSTAENDIG_BEPREIST'` nur, wenn alle Einheitspreise vergeben, alle BiReqs beantwortet und 0 unbestimmte Mengen in_total verbleiben.
  - Führt bei Fehlern ein vollständiges Rollback aus.
- **`loadTenderDraft(db, draftId)`:**
  - Lädt den unberührten X83-Katalog (`gaeb_imports`, `gaeb_categories`, `gaeb_items`, `gaeb_item_bireq`, `gaeb_item_up_components`).
  - Überlagert (Overlay) die Bepreisungs- und BiReq-Daten des gewählten Entwurfs.
  - Gewährleistet, dass die Original-Tabelle `gaeb_items` (Felder `preis`, `gesamtpreis`) zu 100% unverändert bleibt.
- **`cloneTenderDraft(db, sourceDraftId, options)`:**
  - Dupliziert eine Bepreisung inklusive aller Preise, Bestätigungen und BiReq-Antworten in eine neue Revisionsversion.
  - Setzt `angebot_id` zwingend auf `NULL`, um eine unbeabsichtigte Kopplung an offizielle Belege zu unterbinden.
  - Weist die nächste freie Versionsnummer über die Datenbank zu.
- **`saveX83Import(db, parsedData, options)` (in `gaeb_repository.js`):**
  - **BOM-sichere Konsistenzprüfung:** Bei Übergabe von `rawBytes` und `rawXml` werden beide als UTF-8 ohne BOM (`replace(/^\uFEFF/, '').trim()`) verglichen. Dies verhindert Fehlalarme bei korrekten UTF-8-Dateien mit BOM, schützt jedoch bit-genau vor inhaltlichen Abweichungen. Die Original-Bytes im BLOB-Feld `raw_bytes` bleiben unberührt.
- **`listTenderDrafts(db, importId)` & `deleteTenderDraft(db, draftId)`:**
  - Auflistung aller Entwürfe mit Fortschritts- und Summenstatistiken sowie kaskadierendes Löschen ohne Beeinträchtigung des Basiskatalogs.

### 8.3 IPC- und Renderer-Schnittstelle (`main/ipc/ipc-gaeb.js`, `preload.js`)

- Alle IPC-Aufrufe sind standardisiert registriert:
  - `gaeb:create-tender-draft`, `gaeb:save-tender-draft`, `gaeb:load-tender-draft`, `gaeb:list-tender-drafts`, `gaeb:clone-tender-draft`, `gaeb:delete-tender-draft`.
- In `preload.js` über `window.api.gaeb` bzw. `window.api.invoke` verfügbar gemacht.
- **Renderer-Compliance:** Im gesamten Frontend-Code wird strikt **kein Node.js `require()`** verwendet. Die Kommunikation erfolgt ausschließlich asynchron über Context-Bridge-IPC.
- `main.js` blieb zu 100% unberührt.

### 8.4 Modulare Benutzeroberfläche (`views/modals/gaeb-tender-modal.html`, `js/gaeb_tender/`)

Die Benutzeroberfläche wurde nach dem MVC-Muster modular strukturiert und um eine dreistufige Ansicht erweitert:
- **`views/modals/gaeb-tender-modal.html`:**
  - **Ansicht 1: Import-Auswahlliste (`gt-view-import-list`):**
    - Wird angezeigt, wenn das Modal ohne explizite `importId` geöffnet wird (z. B. aus der Hauptnavigation).
    - Tabelle aller importierten Ausschreibungen mit Projektname, Dateiname, Importdatum, Entwurfsanzahl und Aktionen.
    - Klare Fehlermeldungen bei leeren Beständen oder Ladefehlern; **kein stilles Auswählen des ersten Eintrags**.
  - **Ansicht 2: Entwurfs-Übersicht (`gt-view-draft-list`):**
    - Übersicht aller Bepreisungsstände für die ausgewählte Ausschreibung.
    - Zeigt Versionsnummer, Entwurfsname, Status, Netto-/Bruttosumme und Fertigstellungsgrad.
    - Primäre Aktion: «+ Neuen Bepreisungsentwurf anlegen».
    - Zurück-Navigation zur Importliste mit Prüfung ungespeicherter Änderungen.
  - **Ansicht 3: Bepreisungs-Editor (`gt-view-editor`):**
    - Split-Screen-Layout mit responsiver Aufteilung:
      - **Links (BoQCtgy-Baum):** Hierarchische Baumdarstellung aller Gewerke, Abschnitte und Positionen mit OZs, Statussymbolen (grün = bepreist, gelb = unbepreist, blau = Hinweistext/Wahlposition, orange = BiReq ausstehend).
      - **Rechts (Positionsdetail & Bepreisung):**
        - Vollständige Anzeige von OZ, Ordnungsbegriff, Mengeneinheit, Menge (oder deutlichem «QtyTBD Mengenvorbehalt»-Badge).
        - Vollständiger Kurz- und mehrzeiliger Langtext sowie Titel-Vorbemerkungen.
        - Bepreisungsmaske mit Live-Validierung, Berechnung von Gesamtpreisen und bewusster Bestätigungs-Checkbox für `0,00 €`-Eingaben.
        - Eingabefelder für Bieterangaben (`BiReq`) mit Kennzeichnung von Pflichtangaben.
      - **Oben (Header-Status):**
        - Zeigt bei bepreisten Positionen mit offener Menge eine Warnung: «Preise erfasst, aber Mengen noch unbestimmt (QtyTBD) - Nicht bereit zur Abgabe».
      - **Unten (Footer & Statusleiste):**
        - Live-Anzeige von Netto-, MwSt- und Bruttobetrag des Entwurfs.
        - Zähler für unbepreiste Positionen, offene BiReqs und offene QtyTBD-Positionen (`gt-stat-unresolved-qty-tbd`).
        - Aktionen: Speichern, Version klonen, Zurück zur Entwurfsliste.
- **`js/gaeb_tender/tender_state.js`:** Zustandsverwaltung im Renderer mit Nachverfolgung von `unresolved_qty_tbd_count` und Dirty-Tracking.
- **`js/gaeb_tender/tender_view.js`:** DOM-Rendering für die drei Ansichtsmodi (Importliste, Entwurfsliste, Editor).
- **`js/gaeb_tender/tender_controller.js`:** Event-Handling, Navigation, Validierung von `importId` und `draftId`, Warnung bei ungespeicherten Daten.
- **Kompilierung:** Das Modal wurde über `scripts/sync_modals.js` in `js/modal-loader.js` kompiliert.

### 8.5 Testverifikation der Bepreisungsphase

Alle Funktionen werden durch automatisierte Testsuites auf Datenbank-, Repository- und Chromium-DOM-Ebene abgesichert:

1. **Repository- & SQLite-Testsuite (`tests/gaeb_tender_pricing.test.js` - 16 Tests in 7 Suites):**
   - `1.1 SHA-256 Konsistenzprüfung:` Verifiziert, dass inhaltliche Diskrepanzen zwischen `rawBytes` und `rawXml` hart abgelehnt werden.
   - `1.2 Identischer Inhalt:` Verifiziert, dass übereinstimmende Daten anstandslos akzeptiert werden.
   - `1.3 Native Trigger-Typsicherheit:` Verifiziert, dass `gaeb_import_angebote` Rechnungs-IDs auf DB-Ebene abweist.
   - `2.1 Roundtrip & Persistenz:` Erstellen eines Entwurfs, Eingabe von Einheitspreisen und BiReq-Antworten, `db.close()`, Wiedereröffnen und verlustfreie Wiederherstellung. Snapshot-Vergleich bestätigt, dass `gaeb_items` 100% unberührt bleibt.
   - `3.1 Bepreisungsdifferenzierung:` Exakte Trennung von `NULL` (unbepreist) vs. `0.00` (bewusst bestätigt) vs. `> 0.00`.
   - `3.2 QtyTBD Mengenvorbehalt:` Bepreisung einer QtyTBD-Position führt zu gültigem Einheitspreis, aber Gesamtpreis bleibt strikt `NULL` und bläht die Endsumme nicht auf.
   - `3.3 Mengenneutrale Hinweistexte & Wahlpositionen:` Verhindert Bepreisung von Hinweistexten; Wahlpositionen mit `in_total = 0` fließen nicht in die Hauptsumme ein.
   - `4.1 Revisionsunabhängigkeit (v1 vs v2):` Modifikation von Preisen in Version 2 hat keinerlei Auswirkung auf Version 1 oder das X83-Original.
   - `5.1 Atomare Transaktionen & Rollback:` Provozierter Fehler während `saveTenderDraft` rollt alle Änderungen vollständig zurück.
   - `6.1 Kaskadierende Löschung:` Löschen eines Entwurfs entfernt dessen Preise und Antworten rückstandslos, während X83-Katalog und andere Entwürfe intakt bleiben.
   - `7.1 Explizite Importauswahl:` Nachweis, dass bei zwei Imports kein Entwurf still angelegt wird, die Entwurfszähler isoliert bleiben und die Auswahl deterministisch erfolgt.
   - `7.2 QtyTBD & Vollständigkeitsstatus:` Nachweis, dass bei vollständiger Bepreisung mit offener QtyTBD in Endsumme der Status auf `IN_BEARBEITUNG` bleibt und erst nach Mengenlösung auf `VOLLSTAENDIG_BEPREIST` wechselt.
   - `7.3 Klon-Entkopplung v1 -> v2:` Nachweis, dass `cloneTenderDraft` `angebot_id = null` setzt und Preisänderungen in v2 weder v1 noch das Original berühren.
   - `7.4 Versionierungs-Integrität & Unique Constraint:` Nachweis der automatischen `MAX(version) + 1`-Vergabe und des Scheiterns doppelter Versionsinserts am UNIQUE-Constraint.
   - `7.5 Datenbank-Trigger Typ-Schutz:` Nachweis, dass `trg_prevent_type_change_linked_gaeb_angebot` das Ändern des Dokumenttyps verknüpfter Angebote auf `rechnung` blockiert, während unverknüpfte Angebote und Inhaltsupdates erlaubt bleiben.
   - `7.6 BOM-Konsistenzprüfung:` Nachweis, dass UTF-8-Dateien mit BOM (`\uFEFF`) korrekt erkannt und gespeichert werden, während echte inhaltliche Abweichungen zuverlässig abgelehnt werden.

2. **Electron Chromium E2E-DOM-Testsuite (`tests/test_electron_runner.js` / Testfall 4c):**
   - Öffnen des `gaeb-tender-modal` in echter Electron-Laufzeit.
   - Verifikation der Navigation über die Entwurfsliste und Neuanlage eines Entwurfs.
   - Rendern des BoQCtgy-Baums und Überprüfung der Baumknoten.
   - Interaktive Auswahl einer Position, DOM-Eingabe eines Preises (`64,50 €`).
   - Verifikation der dynamischen Neuberechnung im DOM.
   - Ausfüllen einer Bietertextergänzung (`BiReq`).
   - Klick auf «Entwurf speichern», atomares Speichern via IPC in SQLite.
   - Schließen und Wiederöffnen des Modals, Verifikation der Wiederherstellung aller Werte.

---

## 9. Ausdrücklich vertagte Folgeaufgaben (Roadmap nach `liesen.txt`)

In Übereinstimmung mit den klaren Vorgaben aus `liesen.txt` wurden folgende Komponenten bewusst **nicht** in diesem Branch umgesetzt, sondern als eigenständige, nachgelagerte Arbeitspakete definiert:

1. **Hierarchischer GAEB DA XML X84 Export (Phase 84):**
   - Erzeugung einer standardkonformen X84-Angebotsdatei aus einem bepreisten Entwurf (`gaeb_tender_drafts`).
   - Rekonstruktion der vollständigen BoQCtgy-Hierarchie mit ausgefüllten `<UP>`-, `<IT>`- und `<BiReq>`-Knoten.
2. **Kalkulationsblätter nach EFB-Preis (VHB 221 / VHB 223):**
   - Aufschlüsselung der Einheitspreise nach Lohn-, Stoff-, Geräte- und Sonstigen Anteilen.
   - Generierung formaler EFB-Formulare für öffentliche Vergaben.
3. **Formale Angebotsübernahme & Dokumentenversand:**
   - Verbindliche Übernahme eines fertigen GAEB-Entwurfs in ein juristisches Belegdokument (`type = 'angebot'` in Tabelle `dokumente`).
   - PDF-Generierung des bepreisten Leistungsverzeichnisses und digitaler Versand.

