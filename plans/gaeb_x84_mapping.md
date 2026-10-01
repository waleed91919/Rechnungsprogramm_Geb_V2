# GAEB DA XML X84 Spezifikation & Feld-Mapping (Phase 84: Angebotsabgabe)

Dieses Dokument spezifiziert die vollständige Datenabbildung und die semantischen Regeln für den Export von GAEB DA XML Phase X84 (Angebotsabgabe) im W-Link ERP System gemäß GAEB DA XML 3.2 (Ausgabe 2013-10) und GAEB DA XML 3.3 (Ausgabe 2021-05).

---

## 1. Übersicht & Architektur

Der GAEB X84 Export basiert auf einem gespeicherten Bepreisungsentwurf (`gaeb_tender_drafts`) und den ursprünglichen X83-Stammdaten (`gaeb_imports`, `gaeb_items`, `gaeb_categories`, `gaeb_bireq`).

- **Original-X83 Unveränderlichkeit:** Die Originaldaten (`raw_xml`, `raw_bytes`, `gaeb_items`) werden beim Export niemals mutiert.
- **Entwurfsunabhängigkeit:** Mehrere Entwürfe zum selben Import sind vollkommen isoliert und erzeugen eigenständige X84-Dateien mit ihren jeweiligen Preisen und Bieterangaben.
- **Keine stillen Annahmen:** Fehlende Pflichtfelder führen zum Abbruch mit klarer Fehlermeldung; es werden keine Dummy-Werte (z. B. Menge 1 oder Preis 0) erfunden.

---

## 2. Detaillierte Feld-Zuordnung (Mapping-Tabelle)

### 2.1 Kopfdaten (GAEBInfo & PrjInfo)

| GAEB X83 Original | Gespeichert in DB / Modell | GAEB X84 DA XML 3.3 | GAEB X84 DA XML 3.2 | Bemerkungen / Validierung |
|---|---|---|---|---|
| `<GAEBInfo>/<Version>` | `gaeb_imports.gaeb_version` | `<GAEBInfo>/<Version>3.3</Version>` | `<GAEBInfo>/<Version>3.2</Version>` | Strikter Versions-Check: Nur 3.2 oder 3.3 zulässig |
| `<GAEBInfo>/<VersDate>` | Aus Original-XML Metadaten | `<GAEBInfo>/<VersDate>2021-05</VersDate>` | `<GAEBInfo>/<VersDate>2013-10</VersDate>` | Passend zum offiziellen XSD-Schema |
| `<GAEBInfo>/<Date>` | Dynamisch beim Export | Aktuelles ISO-Datum (`YYYY-MM-DD`) | Aktuelles ISO-Datum (`YYYY-MM-DD`) | Datum der Angebotsabgabe |
| `<GAEBInfo>/<Time>` | Dynamisch beim Export | Aktuelle Zeit (`HH:MM:SS`) | Aktuelle Zeit (`HH:MM:SS`) | Uhrzeit der Angebotsabgabe |
| `<GAEBInfo>/<ProgSystem>` | Konstante im System | `<ProgSystem>W-Link ERP</ProgSystem>` | `<ProgSystem>W-Link ERP</ProgSystem>` | Maximal 60 Zeichen |
| `<PrjInfo>/<NamePrj>` | `gaeb_imports.project_name` | `<PrjInfo>/<NamePrj>` | `<PrjInfo>/<NamePrj>` | Maximal 60 Zeichen |
| `<PrjInfo>/<PrjID>` | `raw_xml` Metadaten | `<PrjInfo>/<PrjID>` | *(Nicht vorhanden)* | In GAEB 3.2 `tgPrjInfo` existiert `PrjID` nicht |
| `<PrjInfo>/<LblPrj>` | `raw_xml` Metadaten | `<PrjInfo>/<LblPrj>` | `<PrjInfo>/<LblPrj>` | Maximal 100 Zeichen |

### 2.2 Vergabedaten & Bieter (Award, AwardInfo, CTR)

| GAEB X83 Original | Gespeichert in DB / Modell | GAEB X84 DA XML 3.3 | GAEB X84 DA XML 3.2 | Bemerkungen / Validierung |
|---|---|---|---|---|
| `<Award>/<DP>83</DP>` | Im X83 `83` | `<Award>/<DP>84</DP>` | `<Award>/<DP>84</DP>` | Phase 84 (Angebotsabgabe) |
| `<AwardInfo>/<Cur>` | `gaeb_imports.currency` | `<AwardInfo>/<Cur>EUR</Cur>` | `<AwardInfo>/<Cur>EUR</Cur>` | ISO-Währungscode (3 Zeichen) |
| *(Keines im X83)* | `options.bidDate` oder Datum | `<AwardInfo>/<BidDate>` | `<AwardInfo>/<BidDate>` | Datum des Angebots |
| `<AwardInfo>/<BoQID>` | `raw_xml` Metadaten | `<AwardInfo>/<BoQID>` | `<AwardInfo>/<BoQID>` | In 3.2 nur wenn gültige UUID |
| *(Bieterdaten)* | `einstellungen` / `options.bidder` | `<CTR>/<Address>` | `<CTR>/<Address>` | Bieteradresse: `Name1`, `Street`, `PCode`, `City` |

### 2.3 Leistungsverzeichnis-Struktur (BoQ, BoQInfo, BoQBkdn)

| GAEB X83 Original | Gespeichert in DB / Modell | GAEB X84 DA XML 3.3 | GAEB X84 DA XML 3.2 | Bemerkungen / Validierung |
|---|---|---|---|---|
| `<BoQ ID="...">` | `raw_xml` oder generiert | `<BoQ ID="...">` | `<BoQ ID="...">` | Gültige XML-ID (NCName, darf nicht mit Ziffer beginnen) |
| `<BoQInfo>/<Name>` | `gaeb_imports.project_name` | `<BoQInfo>/<Name>` | `<BoQInfo>/<Name>` | Maximal 20 Zeichen |
| `<BoQInfo>/<BoQBkdn>` | `raw_xml` Metadaten oder Fallback | `<BoQBkdn>`-Blöcke | `<BoQBkdn>`-Blöcke | Gliederungsstruktur (`Type`, `Length`, `Num`) |
| *(Summe LV)* | Berechnet aus allen `in_total=1` Positionen | `<Totals>/<Total>` | `<Totals>/<Total>` | Gesamte Netto-Angebotssumme (2 Dezimalstellen) |

### 2.4 Gliederungsbereiche / Kategorien (BoQCtgy)

| GAEB X83 Original | Gespeichert in DB / Modell | GAEB X84 DA XML 3.3 | GAEB X84 DA XML 3.2 | Bemerkungen / Validierung |
|---|---|---|---|---|
| `<BoQCtgy ID="...">` | `gaeb_categories.original_id` | `<BoQCtgy ID="...">` | `<BoQCtgy ID="...">` | Validierte ID |
| `<BoQCtgy RNoPart="...">` | `gaeb_categories.rno_part` | `RNoPart` Attribut | `RNoPart` Attribut | Ordnungszahl-Teil des Abschnitts |
| `<BoQCtgy>/<BoQBody>` | Hierarchische Baumstruktur | Rekursiv `<BoQCtgy>` oder `<Itemlist>` | Rekursiv `<BoQCtgy>` oder `<Itemlist>` | **Keine Mischung:** Eine Kategorie darf nicht Unterkategorien UND Positionen enthalten |
| *(Bereichssumme)* | Berechnet aus Positionen | `<Totals>/<Total>` | `<Totals>/<Total>` | Summe aller `in_total=1` Positionen der Kategorie |

### 2.5 Positionen (Itemlist / Item)

| GAEB X83 Original | Gespeichert in DB / Modell | GAEB X84 DA XML 3.3 | GAEB X84 DA XML 3.2 | Bemerkungen / Validierung |
|---|---|---|---|---|
| `<Item ID="...">` | `gaeb_items.original_id` | `<Item ID="...">` | `<Item ID="...">` | Validierte ID |
| `<Item RNoPart="...">` | `gaeb_items.rno_part` | `RNoPart` Attribut | `RNoPart` Attribut | Ordnungszahl der Position (z. B. `0010`) |
| `<Qty>` | `gaeb_items.menge` | `<Qty>` | `<Qty>` | Format: 3 Nachkommastellen |
| `<QU>` | `gaeb_items.einheit` | `<QU>` | `<QU>` | Mengeneinheit (z. B. `m2`, `Stk`) |
| *(Einheitspreis)* | `gaeb_tender_draft_items.unit_price` | `<UP>` | `<UP>` | Format: 3 Nachkommastellen |
| *(Gesamtpreis)* | `unit_price * menge` | `<IT>` | `<IT>` | Format: 2 Nachkommastellen |
| `<Description>` (Kurztext) | `gaeb_items.kurztext` | *(Entfällt im X84)* | *(Entfällt im X84)* | X84 enthält nur bepreiste Daten & Bieterangaben |
| `<BiReq>` (Bieterangabe) | `gaeb_tender_bireq_answers.answer_value` | `<p><TextComplement Kind="Bidder">` | `<TextComplement Kind="Bidder">` | Beantwortete Bieterangabe mit `MarkLbl` |
| *(Bieterkommentar)* | `gaeb_tender_draft_items.notes` | `<BidComm>` | `<BidComm>` | Optionale Bieternotiz |

---

## 3. Semantische Regeln & Validierungs-Kriterien

1. **Einheitspreis (UP / EP):**
   - Jede kalkulierbare Position muss bepreist sein.
   - Ein Preis von `0,00 €` ist gültig, erfordert aber eine explizite Nullpreis-Bestätigung (`is_zero_confirmed = 1`).
   - Unbestätigte Nullpreise oder fehlende Preise führen zur Ablehnung des Exports.

2. **In-Total-Behandlung (`in_total = 0` vs `in_total = 1`):**
   - Positionen mit `in_total = 0` (Wahl- oder Bedarfspositionen) müssen ebenfalls bepreist werden, fließen aber **nicht** in `<Totals>/<Total>` ein.
   - Sie werden im XML regulär mit `<UP>` und `<IT>` ausgegeben und keinesfalls verworfen.

3. **Mengenunbestimmte Positionen (QtyTBD):**
   - Positionen mit offener, unbestimmter Menge (`isQtyTBD = 1` oder `menge = null`), die Teil des Hauptangebots sind (`in_total = 1`), verhindern den Export, solange die Menge nicht aufgelöst ist.

4. **Bieterangaben (`<BiReq>` / `<TextComplement>`):**
   - Alle im Leistungsverzeichnis geforderten Bieterangaben müssen mit einem nicht-leeren Wert beantwortet sein.
   - Format GAEB 3.3: `<DetailTxt><Text><p><TextComplement MarkLbl="..." Kind="Bidder"><ComplBody><p><span>Antwort</span></p></ComplBody></TextComplement></p></Text></DetailTxt>`
   - Format GAEB 3.2: `<DetailTxt><TextComplement MarkLbl="..." Kind="Bidder"><ComplBody><p><span>Antwort</span></p></ComplBody></TextComplement></DetailTxt>`

5. **Strikte Schema-Validierung:**
   - Jedes generierte X84-Dokument wird vor dem Speichern via `libxmljs2` gegen das offizielle XSD-Schema validiert.
   - Bei Validierungsfehlern wird die Datei nicht auf die Festplatte geschrieben und der Fehler wird im Detail gemeldet.
