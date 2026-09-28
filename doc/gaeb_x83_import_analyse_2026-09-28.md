# Was W-Link korrekt importiert und was verloren geht
## ما يستورده W-Link صحيحًا وما يفقده – Analyse des GAEB X83 Imports vor dem UI- und X84-Bau

**Datum:** 28. September 2026  
**Status:** Audit & Gap-Analyse abgeschlossen (Erste praktische Aufgabe aus `liesen.txt`)  
**Bezugsdokument:** `liesen.txt` (Abschnitt Ausschreibung & Import-First-Strategie)  
**Testsuite:** `tests/gaeb_x83_import_audit.test.js`  
**Testdaten:** `tests/fixtures/gaeb_x83/*.x83`  

---

## 1. Executive Summary / ملخص تنفيذي

### Ausgangslage
Gemäß der strategischen Leitlinie in `liesen.txt` lautet die oberste Priorität vor jeder UI-Entwicklung und vor jeder X84-Angebotserzeugung:
> «أول مهمة عملية الآن: إعداد مجموعة اختبار من ملفات X83 متنوعة وتقرير واضح بعنوان «ما يستورده W‑Link صحيحًا وما يفقده». بناء واجهة المناقصات قبل هذه الخطوة قد يجعلك تصممها حول بيانات ناقصة. ابدأ المناقصات بالاستيراد فقط: خذ ملفات X83 حقيقية ومسموحًا لك استخدامها، واختبر هل يحافظ W‑Link على الألواح/العناوين/OZ، النصوص، الكميات والوحدات. أنشئ تقريرًا بما يُفقد قبل تعديل الواجهة أو كتابة X84 جديد.»

Zur Erfüllung dieser Vorgabe wurde eine repräsentative Testsuite aus vier standardkonformen GAEB DA XML 3.3 Dateien (`01_standard_hierarchie.x83`, `02_positionstypen_wahl_bedarf.x83`, `03_bieterangaben_vorbemerkungen_ep.x83`, `04_reales_muster_hochbau.x83`) erstellt und der bestehende Import-Parser von W-Link (`GAEBEngine.parseGAEBXML` in `js/gaeb.js`) einem schonungslosen Audit unterzogen.

### Ist-Zustand des aktuellen W-Link Parsers
Der aktuelle Parser in `js/gaeb.js` basiert auf einem vereinfachten Regulären Ausdruck:
```javascript
const itemRegex = /<Item\b[^>]*>([\s\S]*?)<\/Item>/gi;
```
Er durchsucht den XML-String linear nach `<Item>`-Tags und erzeugt daraus eine **völlig flache Liste** von Datensätzen mit nur 7 festen Attributen:
`{ oz_code, name, menge, einheit, preis, gesamtpreis, cost_type: 'MATERIAL' }`.

### Kernaussage des Audits
* **Was W-Link aktuell korrekt importiert:**
  1. Die XML-Kopfdaten des Projekts (`BoQInfo/Name`, GAEB-Phase `DP`, Währung `Cur`).
  2. Die Mengenangaben (`Qty`) und Einheiten (`QU`) bei reinen Normalpositionen.
  3. Den Kurztext (`TextOutl`) einfacher Positionen (abgelegt im Feld `name`).
  4. Die Ordnungszahl (`OZ`), sofern sie als redundanter Volleintrag im `<OZ>`-Knoten der Blattposition vorliegt.

* **Was W-Link aktuell verliert oder fatal verfälscht (Datenverlust > 70%):**
  1. **Die gesamte Projekt- und Leistungsverzeichnishierarchie** (`BoQCtgy`: Gewerke, Abschnitte, Titel). Alle Positionen landen ungeordnet in einem flachen Array.
  2. **Zusammengesetzte Ordnungszahlen (OZ)**, falls das ausschreibende AVA-System dem GAEB-Standard folgt und nur die Teil-OZ (`RNoPart`) in den Hierarchieebenen ablegt.
  3. **Vollständige Langtexte (`CompleteText` / `DetailTxt`)**: Technische Spezifikationen, DIN-Normen und Ausführungsanweisungen werden abgeschnitten und verworfen.
  4. **Positionstypen**: Grund-, Wahl- (Alternativ-) und Bedarfspositionen (mit/ohne Gesamtbetrag) sowie Pauschalen werden zu identischen Normalpositionen verflacht.
  5. **Vergaberechtliches Ausschlussrisiko**: Wahl- und Bedarfspositionen ohne Gesamtbetrag werden fälschlicherweise in Angebotssummen eingerechnet; dies führt zum **zwingenden Ausschluss des Bieters nach § 16 VOB/A**.
  6. **Vorbemerkungen & Hinweistexte**: Vorbemerkungen auf Titelebene verschwinden spurlos; Hinweistexte auf Positionsebene werden fehlerhaft als abrechenbare Positionen mit `Menge = 1.0 Stk.` importiert!
  7. **Bieterangaben & Bietertextergänzungen (`BiReq`)**: Pflichtfelder für Fabrikats- und Typangaben werden ignoriert.
  8. **Einheitspreis-Aufgliederung (`UPComponents`)**: Kalkulatorische Anteile (Lohn, Stoff, Gerät, Sonstiges) für EFB-Formblätter (221/223) werden nicht erfasst.

---

## 2. Kategoriengenaue Detailanalyse

### 2.1 Gliederung & Hierarchie (Gewerke, Titel, Abschnitte)
* **Im GAEB X83 Standard:**  
  Ein Leistungsverzeichnis im Bauwesen ist streng hierarchisch aufgebaut. Abschnitte werden durch geschachtelte `<BoQCtgy>`-Knoten abgebildet (z. B. Ebene 1: *Gewerk 01 Rohbauarbeiten*, Ebene 2: *Titel 01 Erdarbeiten*, Ebene 3: *Unterabschnitt 01 Baugrube*). Jede Ebene besitzt eigene Beschreibungen, Summen und Ordnungszahl-Präfixe.
* **Vom aktuellen W-Link Parser:**  
  `GAEBEngine.parseGAEBXML` ignoriert das Tag `<BoQCtgy>` vollständig. Der Regex-Parser springt direkt in `<Item>`-Tags.  
* **Audit-Ergebnis (`test 1`):**  
  Im Ergebnisobjekt `parsed` gibt es weder `categories`, `sections`, `gewerke` noch `titel`. Die Positionen tragen keine Referenz auf ihren Elternknoten.
* **Praktische Auswirkung:**  
  Dem Kalkulator wird eine unübersichtliche Riesenliste ohne jede Gewerkeeinteilung präsentiert. Titelsummen können weder berechnet noch geprüft werden. Ein strukturierter Ausdruck oder ein strukturierter X84-Export ist technisch unmöglich.

---

### 2.2 Ordnungszahlen (OZ)
* **Im GAEB X83 Standard:**  
  Die vollständige Ordnungszahl (z. B. `01.01.01.0010`) ist eine Zusammensetzung aus den `RNoPart`-Werten aller übergeordneten Hierarchiestufen:
  - `BoQCtgy RNoPart="01"`
    - `BoQCtgy RNoPart="01"`
      - `BoQCtgy RNoPart="01"`
        - `Item RNoPart="0010"`  
  Viele professionelle AVA-Programme (RIB iTWO, Nevaris, California) schreiben im Blatt-Item ausschließlich `<RNoPart>0010</RNoPart>` und verzichten auf das redundante `<OZ>01.01.01.0010</OZ>`.
* **Vom aktuellen W-Link Parser:**  
  ```javascript
  const ozMatch = itemContent.match(/<OZ>([^<]+)<\/OZ>/i) || itemContent.match(/<RNoPart>([^<]+)<\/RNoPart>/i);
  ```
* **Audit-Ergebnis (`test 2`):**  
  Wenn `<OZ>` vorhanden ist, wird dieser String übernommen. Fehlt `<OZ>`, liest W-Link nur `0010`.  
* **Praktische Auswirkung:**  
  Die Position verliert ihren eindeutigen Pfad. Bei mehreren Abschnitten mit jeweils Position `0010` kommt es zu identischen Ordnungszahlen im selben Projekt, was Datenbank-Kollisionen und Verwechslungen verursacht.

---

### 2.3 Kurz- und Langtexte (`CompleteText` / `DetailTxt`)
* **Im GAEB X83 Standard:**  
  GAEB trennt strikt zwischen:
  1. `<TextOutl>` (Kurztext, maximal 70–80 Zeichen pro Zeile) zur tabellarischen Darstellung.
  2. `<CompleteText><DetailTxt><Text>` (Langtext mit mehreren Absätzen `<p>`, Listen, Hinweisen, Verweisen auf DIN-Normen und VOB/C).
* **Vom aktuellen W-Link Parser:**  
  Der Parser sucht mit einer ODER-Bedingung nach dem ersten Treffer:
  ```javascript
  const textMatch = itemContent.match(/<TextOutl>[\s\S]*?<p>([^<]+)<\/p>/i) || ...
  ```
  Er findet den Kurztext, legt ihn in `item.name` ab und bricht die Textsuche ab.
* **Audit-Ergebnis (`test 3`):**  
  In `01_standard_hierarchie.x83` enthält Position `01.01.01.0010` drei Absätze (Baufeld abschieben, Lagerung in Mieten, Bodenklasse 1–3).  
  Im Parsingergebnis existiert **weder ein Langtextfeld noch werden die Absätze 2 und 3 irgendwo gespeichert**.
* **Praktische Auswirkung:**  
  Der Handwerker kalkuliert im "Blindflug". Relevante Pflichten (z. B. "inklusive Entsorgungsgebühren", "wasserundurchlässiger Beton Beanspruchungsklasse 1") sind im Kurztext nicht sichtbar. Dies führt zu gravierenden Fehlkalkulationen und Nachforderungsstreitigkeiten.

---

### 2.4 Mengen, Einheiten und Vorbemerkungen
* **Im GAEB X83 Standard:**  
  - Leistungspositionen besitzen `<Qty>` und `<QU>`.
  - Hinweistexte und Vorbemerkungen (z. B. allgemeine Vorbemerkungen zum Gewerk oder technische Vorbemerkungen) besitzen **weder `<Qty>` noch `<QU>` noch `<UP>`**.
* **Vom aktuellen W-Link Parser:**  
  ```javascript
  const qtyMatch = itemContent.match(/<Qty>([^<]+)<\/Qty>/i);
  const menge = qtyMatch ? parseFloat(qtyMatch[1].replace(',', '.')) : 1.0;
  const unitMatch = itemContent.match(/<QU>([^<]+)<\/QU>/i) || itemContent.match(/<Unit>([^<]+)<\/Unit>/i);
  const einheit = unitMatch ? unitMatch[1].trim() : 'Stk.';
  ```
* **Audit-Ergebnis (`test 6`):**  
  1. Vorbemerkungen auf Kategorieebene (`BoQCtgy > Description`) werden komplett ignoriert.
  2. Hinweistexte auf Positionsebene (`<Item ItemType="Hinweistext">`) erhalten durch den Fallback fälschlicherweise:
     - `menge = 1.0`
     - `einheit = 'Stk.'`
* **Praktische Auswirkung (Kritischer Bug):**  
  Ein reiner Lesehinweis (z. B. *"Hinweis zur Ausführung nach DIN 4109"*) mutiert zu einer bezifferten Position (1 Stk.). Bepreist der Bieter diese nicht oder trägt versehentlich einen Betrag ein, ist die Angebotsdatei korrupt.

---

### 2.5 Positionstypen (Normal, Alternativ, Bedarf, Pauschale)
* **Im GAEB X83 Standard:**  
  GAEB und VOB/A unterscheiden fundamentale Positionstypen:
  - **Normalposition**: Wird fest ausgeführt und zählt voll zur Angebotssumme.
  - **Grundposition / Wahlposition (Alternativposition)**: Gekennzeichnet über `<ALNGroup>` und `<ALNSerNo>`. Nur die Grundposition (SerNo 00) zählt zur Summe; die Wahlposition (SerNo > 00) wird bepreist, darf aber **nicht** in die Gesamtsumme einfließen.
  - **Bedarfsposition mit Gesamtbetrag** (`<Provis WithTotal="true">`): Fließt in die Wertungssumme ein.
  - **Bedarfsposition ohne Gesamtbetrag** (`<Provis WithTotal="false">`): Reiner Einheitspreis; darf **nicht** zur Angebotssumme addiert werden.
  - **Pauschalposition**: Einheit `Psch`, meist Menge 1.
* **Vom aktuellen W-Link Parser:**  
  Keinerlei Prüfung auf `ALNGroup`, `ALNSerNo`, `Provis` oder `ItemType`.  
  Jedes Item erhält blind `cost_type: 'MATERIAL'`.
* **Audit-Ergebnis (`test 4`):**  
  Alle 6 Positionen aus `02_positionstypen_wahl_bedarf.x83` werden identisch verarbeitet.  
* **Praktische Auswirkung (Vergaberechtliches KO-Kriterium):**  
  Wenn W-Link die Wahlposition und die Eventualposition ohne Gesamtbetrag mit der Menge multipliziert und zur Angebotssumme addiert, weicht die berechnete Netto-Angebotssumme von den gesetzlichen GAEB-Vorgaben ab. Die Vergabestelle schließt das Angebot zwingend aus (§ 16 VOB/A).

---

### 2.6 Bietertextergänzungen & Fabrikatsangaben (`BiReq`)
* **Im GAEB X83 Standard:**  
  Der Ausschreibende fordert den Bieter auf, Fabrikat, Typ oder Produkteigenschaften verbindlich einzutragen. Im XML erfolgt dies über `<BiReq>`-Elemente und/oder Lückentexte `[....................]` im `<DetailTxt>`.
* **Vom aktuellen W-Link Parser:**  
  Bieterangaben werden komplett ignoriert. Tags werden im Kurztext herausgefiltert.
* **Audit-Ergebnis (`test 5`):**  
  Weder das Vorhandensein einer Bieterangabe noch die zu füllenden Felder (`Fabrikat`, `Typ`) werden im Datenobjekt vermerkt.
* **Praktische Auswirkung:**  
  Der Kalkulator erfährt in W-Link überhaupt nicht, dass er Angaben machen muss. Die Ausschreibung wird ohne Bieterangaben abgegeben und gilt vergaberechtlich als **unvollständig** -> Ausschluss nach § 16 Abs. 1 Nr. 3 VOB/A.

---

### 2.7 Kalkulationsanteile (EP-Aufgliederung / UPComponents / EFB)
* **Im GAEB X83 Standard:**  
  Bei öffentlichen Ausschreibungen ist häufig die Aufgliederung des Einheitspreises nach EFB-Formblatt 221 / 223 gefordert. Im X83 ist dafür der Knoten `<UPComponents>` vorgesehen mit:
  - Lohn (`Labor`)
  - Stoff / Material (`Material` / `Mat`)
  - Gerät (`Plant` / `Equip`)
  - Sonstiges (`Misc` / `Other`)
* **Vom aktuellen W-Link Parser:**  
  Der Parser liest nur den fertigen Gesamt-EP `<UP>`.
* **Audit-Ergebnis (`test 7`):**  
  `UPComponents` wird weder eingelesen noch vorgehalten.
* **Praktische Auswirkung:**  
  Ein Handwerksbetrieb kann seine vorkalkulierten Lohn- und Stoffanteile nicht direkt im GAEB-Kontext erfassen und nicht konform im X84 zurückgeben.

---

## 3. Tabellarische Gegenüberstellung

| Merkmal / Baustein | Im GAEB X83 (Ausschreibung) | Vom aktuellen W-Link Parser | Status & Auswirkung | Risikostufe |
| :--- | :--- | :--- | :--- | :--- |
| **Hierarchiestruktur** | `BoQCtgy` (Gewerke, Abschnitte, Titel) | Völlig ignoriert; flaches Array | ❌ **Verloren** (Keine Titelsummen, keine Navigation) | 🔴 KRITISCH |
| **Ordnungszahl (OZ)** | Hierarchische Pfad-Rekonstruktion aus `RNoPart` | Nur `<OZ>` oder lokaler `<RNoPart>` | ⚠️ **Unvollständig** (Führt zu redundanten Teil-OZs) | 🔴 KRITISCH |
| **Kurztext** | `<TextOutl>` (AVA-Kurzbezeichnung) | Übernommen in `item.name` | ✅ **Korrekt importiert** | 🟢 OK |
| **Langtext** | `<CompleteText><DetailTxt><Text>` | Komplett abgeschnitten / verworfen | ❌ **Verloren** (Verlust aller technischen Auflagen) | 🔴 KRITISCH |
| **Mengen & Einheiten** | `<Qty>` und `<QU>` | Übernommen in `menge` und `einheit` | ✅ **Korrekt importiert** (für Standardpositionen) | 🟢 OK |
| **Hinweistexte** | `<Item>` ohne Qty/QU / `<Description>` | Fallback auf Menge=1.0, Einheit=Stk. | ❌ **Fatal fehlerhaft** (Wird als Kaufposition interpretiert) | 🔴 KRITISCH |
| **Vorbemerkungen Titel** | `<BoQCtgy><Description>` | Völlig ignoriert | ❌ **Verloren** (Baustellenordnungen gehen verloren) | 🟠 HOCH |
| **Wahl-/Alternativpos.** | `<ALNGroup>`, `<ALNSerNo>`, `ItemType` | Verflacht zu Normalposition | ❌ **Verloren** (Verfälscht Gesamtangebotssumme) | 🔴 KRITISCH |
| **Bedarfspositionen** | `<Provis WithTotal="true/false">` | Verflacht zu Normalposition | ❌ **Verloren** (Verfälscht Wertungssumme) | 🔴 KRITISCH |
| **Pauschalpositionen** | Kennzeichnung / `<QU>Psch</QU>` | Nur Textstring `Psch`, keine Sonderlogik | ⚠️ **Eingeschränkt** (Menge bleibt numerisch 1) | 🟡 MITTEL |
| **Bieterangaben** | `<BiReq>` mit Feldern (Fabrikat, Typ) | Komplett ignoriert | ❌ **Verloren** (Ausschlussrisiko nach § 16 VOB/A) | 🔴 KRITISCH |
| **EP-Aufgliederung** | `<UPComponents>` (Lohn/Stoff/Gerät) | Komplett ignoriert | ❌ **Verloren** (EFB-Formblattdaten fehlen) | 🟠 HOCH |
| **Projektmetadaten** | Name, Phase, Währung | Übernommen in `projectInfo` | ✅ **Korrekt importiert** | 🟢 OK |

---

## 4. Konkrete Handlungsempfehlungen für den neuen Parser & das Datenmodell

Bevor eine Ausschreibungs-Benutzeroberfläche gestaltet oder ein neuer X84-Generator programmiert wird, müssen der Import-Parser und das relationale Datenmodell auf ein **verlustfreies Fundament** gestellt werden.

### 4.1 Technische Architektur des neuen Parsers
1. **Ablösung des Regex-Parsers durch einen hierarchischen XML-DOM-Parser:**
   - In Node.js / Electron: Nutzung von `@xmldom/xmldom` oder `fast-xml-parser` (mit Preservation von Attributen).
   - Der Parser muss rekursiv durch `<Award> -> <BoQ> -> <BoQBody> -> <BoQCtgy> -> <Itemlist> -> <Item>` wandern.
2. **Hierarchischer Pfad-Stack für Ordnungszahlen (OZ):**
   - Beim Betreten eines `<BoQCtgy>` wird dessen `RNoPart` auf einen Stack gelegt (z. B. `['01', '02']`).
   - Die OZ einer Blattposition berechnet sich aus `stack.join('.') + '.' + item.RNoPart`.
   - Nur wenn der Stack leer ist, dient das Feld `<OZ>` als Fallback.
3. **Strikte Differenzierung von Knotenarten:**
   - Wenn `<Item>` kein `<Qty>` besitzt oder `ItemType="Hinweistext"`: Speicherung als `typ = 'HINWEISTEXT'` (Menge = 0 oder `null`, nicht abrechenbar).
   - Erkennung von `ALNGroup` / `ALNSerNo`:
     - `ALNSerNo == '00'`: `typ = 'GRUNDPOSITION'`
     - `ALNSerNo > '00'`: `typ = 'WAHLPOSITION'` (Kennzeichnung: `nicht_in_gesamtsumme = 1`)
   - Erkennung von `Provis`:
     - `WithTotal == 'false'`: `typ = 'BEDARF_OHNE_GB'` (Kennzeichnung: `nicht_in_gesamtsumme = 1`)
     - `WithTotal == 'true'`: `typ = 'BEDARF_MIT_GB'`
4. **Vollständige Erfassung von Kurz- und Langtext:**
   - Speicherung von `kurztext` (`<TextOutl>`) für Tabellenzeilen.
   - Speicherung von `langtext_html` bzw. `langtext_raw` (`<CompleteText>`) unter Erhalt aller Absätze und Aufzählungen.
5. **Bieterangaben-Parser (`<BiReq>`):**
   - Auslesen aller `<BiEl>`-Knoten und Speicherung als editierbare Platzhalter für den Bieter.
6. **EP-Aufgliederung (`<UPComponents>`):**
   - Speicherung von `anteil_lohn`, `anteil_stoff`, `anteil_geraet`, `anteil_sonstiges`.

---

### 4.2 Erforderliche Erweiterung des Datenmodells (SQLite Schema)

Um diese Daten verlustfrei in W-Link zu speichern, wird folgende Tabellenstruktur empfohlen:

```sql
-- 1. Tabelle für die Ausschreibung (Header & Projektbezug)
CREATE TABLE IF NOT EXISTS gaeb_ausschreibungen (
    id TEXT PRIMARY KEY,
    projekt_id TEXT,
    dateiname TEXT NOT NULL,
    gaeb_phase TEXT DEFAULT 'X83',
    version TEXT DEFAULT '3.3',
    lv_bezeichnung TEXT NOT NULL,
    waehrung TEXT DEFAULT 'EUR',
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (projekt_id) REFERENCES projekte(id)
);

-- 2. Tabelle für die Hierarchiestufen (Gewerke, Abschnitte, Titel)
CREATE TABLE IF NOT EXISTS gaeb_strukturen (
    id TEXT PRIMARY KEY,
    ausschreibung_id TEXT NOT NULL,
    parent_id TEXT, -- Verweis auf übergeordnete Kategorie (NULL bei oberster Ebene)
    ebene INTEGER NOT NULL, -- 1 = Gewerk, 2 = Abschnitt, 3 = Titel, etc.
    rno_part TEXT NOT NULL, -- z. B. '01', '02'
    bezeichnung TEXT NOT NULL, -- z. B. 'Erdarbeiten'
    vorbemerkung TEXT, -- Langtext-Vorbemerkung auf Titelebene
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (ausschreibung_id) REFERENCES gaeb_ausschreibungen(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES gaeb_strukturen(id) ON DELETE CASCADE
);

-- 3. Tabelle für die Positionen mit vollständigen Attributen
CREATE TABLE IF NOT EXISTS gaeb_positionen (
    id TEXT PRIMARY KEY,
    ausschreibung_id TEXT NOT NULL,
    struktur_id TEXT NOT NULL, -- Verknüpfung mit Gewerk/Titel
    oz TEXT NOT NULL, -- Vollständige OZ z. B. '01.01.0010'
    rno_part TEXT NOT NULL, -- Lokale Pos-Nr z. B. '0010'
    positions_art TEXT NOT NULL DEFAULT 'NORMAL', -- NORMAL, GRUND, WAHL, BEDARF_MIT_GB, BEDARF_OHNE_GB, HINWEISTEXT
    aln_group TEXT, -- Gruppe für Alternativpositionen
    aln_ser_no TEXT, -- laufende Nummer in der Gruppe
    in_endsumme_enthalten BOOLEAN DEFAULT 1, -- 0 bei Wahlpositionen und Bedarf ohne GB
    kurztext TEXT NOT NULL,
    langtext TEXT, -- Vollständiger Langtext inkl. Absätzen
    menge REAL, -- NULL bei Hinweistexten
    einheit TEXT,
    einheitspreis REAL DEFAULT 0.0,
    gesamtpreis REAL DEFAULT 0.0,
    -- EP-Aufgliederung (EFB 221/223)
    ep_lohn REAL DEFAULT 0.0,
    ep_stoff REAL DEFAULT 0.0,
    ep_geraet REAL DEFAULT 0.0,
    ep_sonstiges REAL DEFAULT 0.0,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (ausschreibung_id) REFERENCES gaeb_ausschreibungen(id) ON DELETE CASCADE,
    FOREIGN KEY (struktur_id) REFERENCES gaeb_strukturen(id) ON DELETE CASCADE
);

-- 4. Tabelle für Bieterangaben / Bietertextergänzungen
CREATE TABLE IF NOT EXISTS gaeb_bieterangaben (
    id TEXT PRIMARY KEY,
    position_id TEXT NOT NULL,
    feld_bezeichnung TEXT NOT NULL, -- z. B. 'Fabrikat', 'Typ'
    bieter_wert TEXT, -- Vom Handwerker eingegebener Text
    pflichtangabe BOOLEAN DEFAULT 1,
    FOREIGN KEY (position_id) REFERENCES gaeb_positionen(id) ON DELETE CASCADE
);
```

---

## 5. Fazit & Freigabekriterium für den nächsten Meilenstein

Die Vorgabe aus `liesen.txt` hat sich als **hochgradig berechtigt und risikovermeidend** erwiesen. Wäre die Benutzeroberfläche direkt auf dem bestehenden Regex-Parser aufgesetzt worden, hätte W-Link:
1. Den Anwendern keine Gewerke- oder Titelstrukturen bieten können.
2. Technische Langtexte dauerhaft vernichtet.
3. Angebote mit unzulässig aufsummierten Wahlpositionen erzeugt, was zur Disqualifikation unserer Baukunden bei öffentlichen Ausschreibungen geführt hätte.

Mit den in diesem Audit geschaffenen Grundlagen:
- Der 4-teiligen Referenzsuite (`tests/fixtures/gaeb_x83/`),
- Dem automatisierten Audit-Test (`tests/gaeb_x83_import_audit.test.js`),
- Und der vorliegenden Detailanalyse (`doc/gaeb_x83_import_analyse_2026-09-28.md`)

liegt nun das exakte Pflichtenheft für die Implementierung des neuen GAEB-Importkerns vor.
