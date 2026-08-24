# PLAN F3 – PUTZPLAN + REINIGUNGS-LEISTUNGSVERZEICHNIS (FLÄCHENBEZUG, RTV/BTV-ZUSCHLÄGE)

**Version:** 1.0 (Erstplan, 24.08.2026)
**Autor:** Planungs-Subagent gemäß Aufgabenstellung
**Umsetzer:** Code-Subagent
**Voraussetzung:** F1 (Objektstamm: `liegenschaften/gebaeude/etagen/raeume`, polymorphe `dokumente.objekt_*`, `ObjektController`) und F2 (`abrechnungsplaene/abrechnungsplan_positionen/dauerrechnung_laeufe`, `preise_live`-Mechanismus) sind implementiert (schema.js:291–430, db.js:1482–1884 – Stand geprüft).
**Projektkonvention:** Produktionscode OHNE Kommentare. UI-Texte deutschsprachig. Nur diese Plan-Datei neu, keine anderen Dateien in diesem Schritt anfassen außer den im Umsetzungsteil genannten.

---

## 0. Ziel & Scope

- **Reinigungs-LV je Objekt:** Leistungsbereiche → Positionen (mit Menge/Fläche, Zeitbedarf, Turnus, Kalkulationssatz) → Putzplan-Einträge (Zuordnung Position ↔ Liegenschaft/Gebäude/Etage/Raum mit individueller Häufigkeit).
- **Kalkulation:** Jahresleistung = Menge × Einsätze/Jahr × Zeitbedarf; Preis = Stundenverrechnungssatz (+ anteilige Zeitfenster-Zuschläge nach RTV/BTV). Summen je Position/Bereich/Objekt.
- **Zuschlagsprofile:** RTV-Gebäudereinigung-Zeitfensterzuschläge als KONFIGURIERBARE Einstellung (nicht hart kodiert – Sätze ändern sich durch Tarifrunden).
- **Anbindung Dauerrechnungen (F2):** LV-Positionen als Preisquelle für Abrechnungspläne – Übernahme erzeugt einen `POSITIONEN`-Plan; Live-Nachführung über den BESTEHENDEN `preise_live`-Mechanismus (db.js `_ladePlanPositionenFuerGenerierung`, db.js:1655) erweitert um LV-Rückrechnung.
- **NICHT im Scope:** Zeiterfassung (F4), Soll-Ist-Vergleich LV↔Ist-Stunden, GAEB-Import von Reinigungs-LVs, LV-PDF-Layout (optionaler Schritt 18), Mitarbeiter-/Dienstplanlogik.

**Wiederverwendung statt Neubau:** Objektbaum/Auswahl aus `state.objekte` + `getObjektBaum` (db.js:1367), Empfängerauflösung `ObjektController.resolveEmpfaenger`, Plan-Generierung komplett aus F2 (`saveAbrechnungsplan`, `applyDocumentWrite`), Einstellungs-Mechanik `db:saveEinstellung`, Modal-/Toast-Muster aus js/objekte.js.

---

## 1. RECHERCHESTAND: RTV/BTV-ZUSCHLÄGE (QUELLEN, STAND 24.08.2026)

### 1.1 Recherchierte Sätze (gewerbliche Beschäftigte, RTV Gebäudereinigung vom 31.10.2019, § 3 Ziff. 4.7)

| Zuschlagsart | Zeitfenster-Definition | Satz (Default) |
|---|---|---|
| Nachtarbeit | 22:00 – 05:00 Uhr | **+30 %** |
| Sonn- und Feiertagsarbeit | 00:00 – 24:00 Uhr an Sonn-/gesetzl. Feiertagen | **+80 %** |
| „Hohe“ Feiertage (Neujahr, 1. Mai, 1. + 2. Weihnachtsfeiertag), auch wenn auf Sonntag fallend | 00:00 – 24:00 Uhr | **+200 %** |
| Mehrarbeit/Überstunden (> 39 h/Woche) | – | +25 % (Referenz, im Kalkulations-LV i. d. R. nicht angeboten) |

Regeln: Beim Zusammentreffen mehrerer Zuschläge gilt bei gewerblichen Beschäftigten NUR der jeweils HÖCHSTE (keine Kumulation). Für Angestellte gelten abweichende Sätze (Nacht 50/100 %, Sonntag 100 %, Feiertag 150/200 %) – deshalb Profile austauschbar konfigurierbar.

**Quellen (im Plan zitiert, im Code NICHT kommentiert):**
1. Senatsverwaltung Berlin, Tarifbroschüre „Gebäudereinigung“ gültig ab 01.01.2025 (Stand 25.03.2025), S. 16 f.: Nacht 30 %, Sonn-/Feiertag 80 %, hohe Feiertage 200 %. URL: berlin.de/sen/arbeit/arbeits-und-tarifrecht/...gebaeudereinigung_01_broschuere_ab_01-2025_stand_03-2025.pdf (abgerufen 24.08.2026).
2. BIV (Bundesinnungsverband Gebäudereiniger-Handwerk), „Vergabe-Empfehlungen“ Jan. 2026, Kap. 3.2: Zeitzuschläge § 3 Ziff. 4.7 RTV – identische Sätze; zusätzlich Branchenmindestlöhne ab 01.01.2026: LG1 (Unterhaltsreinigung) **15,00 €/h**, LG6 (Glas-/Fassadenreinigung) **18,40 €/h** (TV Mindestlohn v. 15.11.2024, allgemeinverbindlich, Laufzeit bis 31.12.2026). URL: die-gebaeudedienstleister.de/wp-content/uploads/2026/02/BIV_Vergabe-Empfehlungen_priv-Auftraggeber_Jan26_Screen_ES.pdf (abgerufen 24.08.2026).
3. gesetze-im-internet.de/tvmindestlohngeb_ude_2024/anhang.html (RTV-Auszug, Fassung 01.02.2025).
4. pland.app Arbeitslexikon „Rahmentarifvertrag Gebäudereinigung“ (§ 4.7-Zitat: 30/80/200 v.H.) (abgerufen 24.08.2026).

⚠️ Ältere Quellen nennen Nacht 25 % / Sonntag 100 % / übrige Feiertage 150 % / auftragsbedingte Sonntagsarbeit 75 % – das ist die VORHERIGE RTV-Fassung (vom 28.06.2011, § 3 Ziff. 3.7/3.8) bzw. Angestellten-Regelungen; für Defaults werden die aktuellen 30/80/200 verwendet, alles andere bleibt als Profilwert editierbar.

### 1.2 Begriff „BTV“

Für die Gebäudereinigung existiert neben RTV + Lohn-TV + TV Mindestlohn KEIN separater „Branchentarifvertrag“ mit eigenen Zeitzuschlägen. „BTV“ wird marktseitig (Roadmap F3, Wettbewerbssoftware) unscharf als Sammelbegriff für Branchentarifwerk genutzt. **Entscheidung:** Wir modellieren ein generisches „Zuschlagsprofil“ (Name frei wählbar, z. B. „RTV gewerblich“, „BTV Hausmeister“, „Eigenkonditionen“) mit denselben Slot-Typen – deckt beide Lesarten ab. Siehe Offene Fragen Nr. 1.

### 1.3 Domänenmodell Reinigungs-LV (recherchierte Praxis)

- LV = hierarchisch: **Leistungsbereiche** (Unterhaltsreinigung, Glasreinigung, Sanitär, Grundreinigung, Sonderleistungen …) → **Positionen** (Ordnungsnummer, Kurztext, Menge/Mengeneinheit, Intervall/Turnus, Qualitätsstandard, Einheitspreis). Quelle: Crewly-Glossar, CleanCalc-Leitfaden, FM-Connect-LV-Struktur (alle abgerufen 24.08.2026).
- Reinigungsspezifisch: Raumliste mit Flächen, Bodenbelag/Nutzung (bei uns: `raeume.raumtyp/flaeche` aus F1 vorhanden), **Turnus/Frequenz** (täglich, x× wöchentlich, 14-tägig, 1×/Monat, jährlich), **Zeitbedarf** über Leistungszahl (m²/h) bzw. Minuten je Einheit.
- **Kalkulationsformel (Branchenstandard):** `Jahresstunden = Menge × Einsätze/Jahr × Zeitbedarf(min)/60`; `Preis = Jahresstunden × Stundensatz`; Zuschläge anteilig: `Anteil × Zuschlagssatz × Stundensatz × Jahresstunden`.
- Turnus→Einsätze/Jahr (kanonisiert): `X_PRO_WOCHE: round(wert × 52)` · `ALLE_X_TAGE: floor(365 / wert)` (14-tägig → 26) · `X_PRO_MONAT: wert × 12` · `JAEHRLICH: wert`. „Täglich (werktäglich)“ wird als `X_PRO_WOCHE = 5` modelliert (keine versteckten Konstanten; 7 = kalendertäglich möglich).

---

## 2. DB-SCHEMA

Alle Tabellen in `schema.js::createSchema()` (Abschnittskommentar-Marker wie F1/F2: `// --- Putzplan/Reinigungs-LV (F3) ---`), Indizes im bewährten `try { CREATE INDEX IF NOT EXISTS } catch`-Stil (schema.js:355–361). Kein Eingriff in `seedDefaultData` (Zuschlagsprofil wird lazy gelesen, Muster `dauerrechnungen_auto_erstellen`).

### 2.1 Tabelle `lv_bereiche` (Leistungsbereich je Objektknoten)

| Spalte | Typ | NULL | Default | Anmerkung |
|---|---|---|---|---|
| id | INTEGER PK AUTOINCREMENT | NO | – | |
| objekt_typ | TEXT NOT NULL CHECK(objekt_typ IN ('LIEGENSCHAFT','GEBAEUDE','ETAGE','RAUM')) | NO | – | LV hängt an JEDEM Knoten (UI primär Liegenschaft/Gebäude); polymorph ohne FK wie F2 |
| objekt_id | INTEGER NOT NULL | NO | – | Löschschutz über neuen Objekt-LV-Check (§4.6) |
| name | TEXT NOT NULL | NO | – | z. B. „Unterhaltsreinigung“ |
| positionsnr_prefix | TEXT | YES | NULL | z. B. `'01.'` – Positionsnummern-Präfix des Bereichs |
| sortier_index | INTEGER DEFAULT 0 | NO | 0 | |
| notizen | TEXT | YES | NULL | Qualitätsstandards/Vorbemerkungen |
| aktiv | INTEGER DEFAULT 1 CHECK(aktiv IN (0,1)) | NO | 1 | |
| created_at | DATETIME DEFAULT CURRENT_TIMESTAMP | NO | – | |

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_lv_bereiche_objekt_name ON lv_bereiche(objekt_typ, objekt_id, name);
CREATE INDEX IF NOT EXISTS idx_lv_bereiche_objekt ON lv_bereiche(objekt_typ, objekt_id);
```

### 2.2 Tabelle `lv_positionen` (LV-Position mit Kalkulation)

| Spalte | Typ | NULL | Default | Anmerkung |
|---|---|---|---|---|
| id | INTEGER PK AUTOINCREMENT | NO | – | |
| bereich_id | INTEGER NOT NULL, FK → lv_bereiche(id) **ON DELETE CASCADE** | NO | – | |
| positionsnr | TEXT | YES | NULL | z. B. `'01.03'`; UI auto-vorschlagen, manuell überschreibbar |
| bezeichnung | TEXT NOT NULL | NO | – | Kurztext („Boden feucht wischen“) |
| beschreibung | TEXT | YES | NULL | Langtext/Tätigkeitsdetail |
| menge | REAL DEFAULT 0 | NO | 0 | Direktmenge der Position (Fläche/Stück), wenn OHNE Raumeinträge kalkuliert |
| menge_einheit | TEXT DEFAULT 'm²' | NO | 'm²' | 'm²','Stk.','Raum','m','pauschal' |
| turnus_typ | TEXT NOT NULL DEFAULT 'X_PRO_WOCHE' CHECK(turnus_typ IN ('X_PRO_WOCHE','ALLE_X_TAGE','X_PRO_MONAT','JAEHRLICH')) | NO | 'X_PRO_WOCHE' | Default-Turnus für Position ohne eigene Einträge |
| turnus_wert | REAL NOT NULL DEFAULT 1 CHECK(turnus_wert > 0) | NO | 1 | Bedeutung je Typ (§1.3) |
| zeitbedarf_min_je_einheit | REAL DEFAULT 0 CHECK(zeitbedarf_min_je_einheit >= 0) | NO | 0 | Minuten je Mengeneinheit je Einsatz (= 60/Leistungszahl m²/h) |
| kalk_stundensatz | REAL DEFAULT 0 CHECK(kalk_stundensatz >= 0) | NO | 0 | Verrechnungssatz €/h NETTO; UI-Default aus Profil `standard_stundensatz` |
| zuschlaege_json | TEXT | YES | NULL | `{"nacht":10,"sonntag_feiertag":0,"hoher_feiertag":0}` = ANTEILIGE Prozent der Jahreszeit je Fenster; Validierung im Controller |
| mwst | INTEGER DEFAULT 19 CHECK(mwst IN (0,7,19)) | NO | 19 | |
| notizen | TEXT | YES | NULL | |
| created_at | DATETIME DEFAULT CURRENT_TIMESTAMP | NO | – | |

```sql
CREATE INDEX IF NOT EXISTS idx_lv_positionen_bereich ON lv_positionen(bereich_id);
```

### 2.3 Tabelle `putzplan_eintraege` (Zuordnung Position ↔ Objekt mit eigener Häufigkeit)

| Spalte | Typ | NULL | Default | Anmerkung |
|---|---|---|---|---|
| id | INTEGER PK AUTOINCREMENT | NO | – | |
| position_id | INTEGER NOT NULL, FK → lv_positionen(id) **ON DELETE CASCADE** | NO | – | |
| objekt_typ | TEXT NOT NULL CHECK(objekt_typ IN ('LIEGENSCHAFT','GEBAEUDE','ETAGE','RAUM')) | NO | – | üblich RAUM/ETAGE; LIEGENSCHAFT für Außen-/Fassadenleistungen |
| objekt_id | INTEGER NOT NULL | NO | – | |
| menge_override | REAL CHECK(menge_override IS NULL OR menge_override >= 0) | YES | NULL | NULL = Fläche/Menge AUTOMATISCH aus Objektstamm (RAUM: `raeume.flaeche`; ETAGE/GEBAEUDE/LIEGENSCHAFT: Summe der untergeordneten Räume wie `getObjektBaum`, db.js:1373–1401) |
| turnus_typ | TEXT NOT NULL DEFAULT 'X_PRO_WOCHE' CHECK(turnus_typ IN ('X_PRO_WOCHE','ALLE_X_TAGE','X_PRO_MONAT','JAEHRLICH')) | NO | 'X_PRO_WOCHE' | Überschreibt Positions-Default |
| turnus_wert | REAL NOT NULL DEFAULT 1 CHECK(turnus_wert > 0) | NO | 1 | |
| notizen | TEXT | YES | NULL | |
| created_at | DATETIME DEFAULT CURRENT_TIMESTAMP | NO | – | |

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_putzplan_eintraege_unique ON putzplan_eintraege(position_id, objekt_typ, objekt_id);
CREATE INDEX IF NOT EXISTS idx_putzplan_eintraege_objekt ON putzplan_eintraege(objekt_typ, objekt_id);
CREATE INDEX IF NOT EXISTS idx_putzplan_eintraege_pos ON putzplan_eintraege(position_id);
```

### 2.4 Erweiterung Bestandstabelle (Migration in `runMigrations` bzw. `ensureUniqueConstraints`-Stil)

```sql
ALTER TABLE abrechnungsplan_positionen ADD COLUMN lv_position_id INTEGER
```
try/catch 'duplicate column'-Muster (schema.js:435 ff.). Kein FK-Enforcement (ALTER-Limitierung, konsistent zum polymorphen Stil des Projekts); Referenz-Integrität beim Löschen einer LV-Position prüfen (§4.5): Ist sie in einem Plan verlinkt → Blockieren mit deutscher Meldung (oder Link lösen, Entscheidung §4.5).

### 2.5 Zuschlagsprofil als Einstellungen-Key (KEINE eigene Tabelle)

Key `reinigung_zuschlagsprofil` (einzelner JSON-String, atomar lad-/speicherbar via bestehendem `db:saveEinstellung`):

```json
{
  "profil_name": "RTV Gebäudereinigung (gewerblich)",
  "gueltig_ab": "2026-01-01",
  "standard_stundensatz": 15.00,
  "standard_stundensatz_glas": 18.40,
  "zuschlaege": {
    "nacht":              { "prozent": 30 },
    "sonntag_feiertag":   { "prozent": 80 },
    "hoher_feiertag":     { "prozent": 200 }
  },
  "kalender": { "wochen_pro_jahr": 52, "tage_pro_jahr": 365 },
  "quellen": ["BIV Vergabe-Empfehlungen 01/2026", "Tarifbroschüre Berlin 01/2025"]
}
```

- Lesen: fehlt der Key → Controller liefert `DEFAULT_ZUSCHLAGSPROFIL` (Konstante in ReinigungController, Werte = §1.1). Kein Seed nötig.
- `kalender`-Werte fließen in `einsaetzeProJahr` ein (statt fixer 52/365) – Sätze/Kalender damit vollständig konfigurierbar.
- Speichern nur über dedizierten Handler `db:saveZuschlagsProfil` (Validierung: Prozent 0–400, Stundensätze >= 0, Struktur).

---

## 3. IPC-API

Registrierung in `main.js::setupIpc()` unter Marker `// --- Putzplan/Reinigungs-LV (F3) ---`, alle mit `wrapHandler` + deutscher Validierung; Spiegel in `preload.js` (Namenskonvention camelCase wie bestehend).

| Kanal | preload | Request | Response | Fehlerfälle |
|---|---|---|---|---|
| `db:getPutzplan` | `getPutzplan(objektTyp, objektId)` | `objektTyp ∈ 4 Typen`, `objektId:number` | `{ objektPfad, empfaenger, bereiche: [{…bereich, positionen: [{…pos, eintraege: [{…eintrag, objektPfad}], kalkulation }] }], summen }` (kalkulation/summen Shape §4.2) | „Ungültiger Objekttyp“ / „Ungültige Objekt-ID“ |
| `db:saveLvBereich` | `saveLvBereich(data)` | `{id?, objekt_typ!, objekt_id!, name!, positionsnr_prefix?, sortier_index?, notizen?, aktiv?}` | `id:number` | Name/Objekt fehlt; UNIQUE → „Leistungsbereich mit diesem Namen existiert an diesem Objekt bereits.“ |
| `db:deleteLvBereich` | `deleteLvBereich(id)` | `id:number` | `{changes}` | CASCADE löscht Positionen+Einträge; vorher Warnung im UI; Block wenn Position in Abrechnungsplan verlinkt (Meldung §4.5) |
| `db:saveLvPosition` | `saveLvPosition(data, eintraege = [])` | `data` = §2.2 (ohne created_at), `eintraege: [{id?, objekt_typ!, objekt_id!, menge_override?, turnus_typ!, turnus_wert!, notizen?}]` | `{id, kalkulation}` | Bezeichnung fehlt; CHECK turnus_wert<=0 → „Turnus-Wert muss größer 0 sein.“; unbekannter zuschlaege_json-Key → „Unbekannter Zuschlagstyp“; Duplikat-Eintrag (UNIQUE) → „Position ist diesem Objekt bereits zugeordnet.“ |
| `db:deleteLvPosition` | `deleteLvPosition(id)` | `id:number` | `{changes}` | Block falls `abrechnungsplan_positionen.lv_position_id` referenziert: „Position ist in Abrechnungsplan ‚<name>‘ verlinkt – bitte zuerst dort entfernen.“ |
| `db:getZuschlagsProfil` | `getZuschlagsProfil()` | – | `profil` (Default falls Key fehlt) | – |
| `db:saveZuschlagsProfil` | `saveZuschlagsProfil(profil)` | JSON §2.5 | `{success:true}` | Struktur/Range-Fehler mit Feldnamen |
| `db:uebernehmeLvInAbrechnungsplan` | `uebernehmeLvInAbrechnungsplan(payload)` | `{objekt_typ!, objekt_id!, plan_id?:number (bestehenden Plan aktualisieren), rhythmus?:'MONATLICH' (Default), abrechnungstag?:1, start_datum?:heute, mwst?:19, zahlungsziel_tage?, nur_position_ids?:number[]}` | `{planId, anzahlPositionen, monatsNetto, naechste_lauf_am}` | Kein Empfänger am Objekt auflösbar → F2-Meldung „Kein Rechnungsempfänger ermittelbar…“; keine kalkulierbaren Positionen → „Kein LV-Inhalt zum Übernehmen vorhanden.“ |

**Bewusste Abweichung:** Putzplan-Daten werden NICHT in `getFullState()` geladen (Performance, Roadmap F14) – Lazy-Load beim View-Aufruf über `db:getPutzplan`.

---

## 4. GESCHÄFTSLOGIK

### 4.1 Neuer Controller `controllers/ReinigungController.js` (pure, Node+Browser-Dual-Export wie DauerrechnungController.js:262–267)

```text
TURNUS_LABEL / TURNUS_TYPEN
DEFAULT_ZUSCHLAGSPROFIL            // Werte laut §1.1 inkl. quellen-Feld (DATEN, kein Kommentar)
validateProfil(profil)             // Struktur/Ranges
einsaetzeProJahr(turnus_typ, turnus_wert, kalender={52,365})
minutenJeEinsatz(menge, zeitbedarfMinJeEinheit)
jahresMinuten(menge, zeitbedarf, typ, wert, kalender)   = minutenJeEinsatz × einsaetzeProJahr
jahresStunden(...)                 = jahresMinuten / 60
berechneZuschlaege(jahresStunden, stundensatz, zuschlaegeJson, profil)
   → [{key, label, anteilProzent, satzProzent, betrag}]   // Betrag = stunden×anteil%×satz%×stundensatz, centgenau gerundet (Math.round(x*100)/100 je Posten)
positionsKalkulation(pos, eintraege, objektMengeResolver, profil)
   → je Position: entweder Direktmenge ODER Σ je Eintrag {objektLabel, menge, einsaetzeProJahr, jahresStunden, netto, zuschlaegsBetrag, nettoGesamt}
   → monatsNetto = nettoJahr / 12 (auf Cent gerundet)
summiere(bereicheMitKalkulation)   → {jahresStunden, nettoJahr, nettoMonat, zuschlaegeGesamt}
autoMengeFuerObjekt(typ,id,objekteState)  // RAUM→flaeche; sonst Σ Kinderräume (Spiegel getObjektBaum-Logik, db.js:1373)
buildTurnusLabel(typ,wert)         // '5× wöchentlich', 'alle 14 Tage', '2× monatlich', 'jährlich'
```

Alle Geldbeträge centgenau (Math.round ×100)/100, Datums-/Zahlenlogik ohne Seiteneffekte → direkt testbar.

### 4.2 Kalkulations-Shapes (Response von `db:getPutzplan`)

```js
kalkulation = {
  direkteMenge: number|null,
  einsaetzeProJahr: number,
  jahresMinuten: number, jahresStunden: number,
  stundensatz: number,
  nettoJahr: number, nettoMonat: number,
  zuschlaege: [{key, label, anteilProzent, satzProzent, betrag}],
  nettoJahrInklZuschlaege: number,
  quelle: 'POSITION' | 'EINTRAG'   // zeigt ob Direktmenge oder Raumeinträge
}
summen = { jahresStunden, nettoJahr, nettoMonat, zuschlaegeGesamt, positionenAnzahl, eintraegeAnzahl }
```

### 4.3 Beispielrechnung (Referenzfall für Tests, Sätze §1.1)

Position „Unterhaltsreinigung Großraumfläche“: 500 m², 5×/Woche (=round(5×52)=260/Jahr), 1,0 min/m² → 500 min/Einsatz → 130.000 min/Jahr = **2.166,67 h**. Stundensatz 15,00 € (LG1 ab 01.01.2026) → **32.500,00 € netto/Jahr** (= 2.708,33 €/Monat).
Zuschlag bei 10 % Nacht-Anteil: `jahresStunden × anteil × satz × stundensatz = 2.166,67 × 0,10 × 0,30 × 15,00 € = 975,00 €/Jahr`.
Gesamt: **33.475,00 € netto/Jahr** (= 2.789,58 €/Monat). (Test erwartet exakt diese Werte.)

### 4.4 Übernahme in Abrechnungsplan (WIEDERVERWENDUNG F2)

`uebernehmeLvInAbrechnungsplan` (dbAPI, Transaktion):
1. `db:getPutzplan`-Kalkulation laden; jede Position → `abrechnungsplan_positionen`-Zeile: `{artikelId:null, name:"[<Bereich>] <Bezeichnung>", menge:1, einheit:'Monat', preis:<nettoMonat inkl. Zuschläge>, mwst:<pos.mwst>, lv_position_id:<id>}`.
2. Empfänger via `loeseObjektEmpfaengerAuf` (db.js:286) auftauen; Plan über BESTEHENDES `dbAPI.saveAbrechnungsplan(plan, positionen)` schreiben (db.js:1483) → Audit `ABRECHNUNGSPLAN/ERSTELLT|GEÄNDERT` automatisch; `preis_modus:'POSITIONEN'`, `rhythmus:'MONATLICH'`, `start_datum` = heute oder Payload.
3. **Live-Preise:** Plan wird mit `preise_live:1` gespeichert; Erweiterung in `_ladePlanPositionenFuerGenerierung` (db.js:1655): wenn `p.lv_position_id != null` → frische `positionsKalkulation(...)` (aktuelle Sätze/Turni!) und `preis = nettoMonat` überschreiben. Damit nutzt die Generierung den F2-Pfad UNVERÄNDERT fort.
4. Rückgabe für UI-Bestätigung (Planname, Monatsbetrag, nächster Lauf).

### 4.5 Lösch-/Änderungsschutz

- `deleteLvPosition`/`deleteLvBereich`: Block, wenn `abrechnungsplan_positionen.lv_position_id` noch verlinkt (deutsche Meldung, GoBD-freundlich: Pläne nie still umbiegen).
- Objektstamm-Löschschutz: neuer Helper `pruefeObjektLvBezug(typ, id, label)` in db.js (nutzt `sammleObjektNachkommen`, db.js:237): Existiert `lv_bereiche`-Knoten oder `putzplan_eintraege`-Eintrag im Teilbaum → Fehler „<label> enthält Putzplan-/LV-Daten und kann nicht gelöscht werden – bitte stattdessen deaktivieren.“ Aufruf in `deleteLiegenschaft/deleteGebaeude/deleteEtage/deleteRaum` (db.js:1277–1365) VOR dem bestehenden Beleg-Check.

### 4.6 GoBD

LV/Putzplan sind KALKULATIONSdaten (keine Belege) – keine Hashpflicht. Alle daraus erzeugten BELEGE laufen ausschließlich über F2-Generierung → `applyDocumentWrite` (Hash+Audit unverändert). Änderungen an Bereichen/Positionen werden als `entityType:'LV_BEREICH'|'LV_POSITION'` mit `action ERSTELLT|GEÄNDERT|GELÖSCHT` ins audit_logs geschrieben (Details: name, objektPfad, nettoMonat) – günstige Nachvollziehbarkeit ohne Hashketten-Berührung.

---

## 5. UI-FLOW

### 5.1 Neue Top-Level-View `view-putzplan` (switchView-Name `'putzplan'`)

1. **Sidebar** (code.html, nach nav-dauerrechnungen, Icon `cleaning_services`, Label „Putzplan & LV“):
   `<a id="nav-putzplan" onclick="switchView('putzplan')" class="…bestehendes Muster…">…`
2. **js/navigation.js:** `viewConfig.putzplan = { title:'Putzplan & Leistungsverzeichnis', subtitle:'Flächen, Turni, Zuschläge', action: () => { if (typeof renderPutzplan === 'function') renderPutzplan(); } }`; `views`-Array += `'putzplan'`.
3. **Container:** `<div id="view-putzplan" class="hidden flex-1 overflow-y-auto bg-slate-50/50 p-6">` mit `max-w-[1600px] mx-auto flex flex-col gap-6` (Muster code.html:1127).

### 5.2 Layout (2 Spalten, deutschsprachig)

- **Toolbar oben:** Objekt-Select `putzplan-objekt-select` (alle Knoten, Label = Pfad via `ObjektController.buildPfad`, Wert `${typ}:${id}`, vorbelegt letzter Auswahl in `state.putzplanAuswahl`) + Buttons: `+ Bereich` (secondary), `Zuschlagsprofil` (opens Profil-Modal), `➜ Abrechnungsplan erstellen/aktualisieren` (primary, disabled wenn kein Inhalt), Suche `search-lv`.
- **Links: Objektbaum** (`putzplan-baum`): verschachtelte UL aus `state.objekte` (Liegenschaft▸Gebäude▸Etage▸Raum, Badges wie objektBadge js/objekte.js:32, Klick wählt Objekt + lädt `getPutzplan`). Baum-Rendering wiederverwendet `buildObjekteRows`-Logik als Baumvariante (neue Funktion `renderPutzplanBaum` in js/putzplan.js, KEINE Kopie der Tabellen-Logik).
- **KPI-Zeile:** `kpi-lv-stunden` (Jahresstunden), `kpi-lv-netto-jahr`, `kpi-lv-netto-monat`, `kpi-lv-zuschlaege` (Σ Zuschlagsanteil €/Jahr).
- **Rechts: LV-Tabelle je Bereich** (Card mit Bereichstitel, Badge Positionsanzahl, Aktionen Bearbeiten/Löschen/+ Position): Spalten
  `Pos.Nr | Bezeichnung | Menge/Einheit (inkl. Auto-Herkunft „aus Raumfläche“) | Turnus (buildTurnusLabel) | Zeitbedarf (min/Einheit) | Std./Jahr | Netto/Jahr (inkl. Zuschläge, Tooltip-Breakdown) | Netto/Monat | Aktionen (Bearbeiten, Einträge, Löschen)`.
  - **Aufklappbare Eintragszeile** je Position: zugewiesene Räume/Etagen mit eigener Häufigkeit, Menge, Einzelbeitrag; Buttons `+ Raum/Etage zuweisen` (Modal mit Objekt-Select + Turnus-Felder + Checkbox „Fläche automatisch“ vs. Override).
  - **Zuschlags-Breakdown** als Popover/Tooltip: pro Fenster Anteil × Satz × € (lesbar: „Nacht 10 % × 30 % = 97,50 €/Jahr“).
- **Modals** (IDs `lv-bereich-modal`, `lv-position-modal`, `lv-eintrag-modal`, `zuschlagsprofil-modal`) im Stil des objekt-modal (code.html/js/objekte.js:235):
  - Position: Bezeichnung*, Beschreibung, Pos.-Nr, Menge + Einheit-Select, Turnus-Select + Wert-Feld (kontextsensitiv: „× pro Woche / alle … Tage / × pro Monat / × pro Jahr“), Zeitbedarf min/Einheit (Hilfetext „1,0 min/m² entspricht 60 m²/h“), Stundensatz (vorbefüllt Profil.standard_stundensatz), Zuschlags-Anteile (3 Number-Felder 0–100 % mit Live-Preview-Betrag), MwSt-Select, Live-Vorschaukarte „Jahr: X h / Y € · Monat: Z €“.
  - Profil-Modal: Profilname, gültig ab, Standard-Stundensätze (LG1/LG6 vorbefüllt 15,00/18,40), 3 Zuschlagssätze, Kalenderfelder, Hinweisbox „Quellen: BIV 01/2026, Tarifbroschüre Berlin 01/2025 – Sätze bei Tarifrunde anpassen.“
- **Übernehmen-Dialog:** Zusammenfassung (n Positionen, Monatsnetto), Wahl „Neuen Plan erstellen“ vs. bestehenden Plan wählen (Select aus `state.abrechnungsplaene` gefiltert auf dasselbe Objekt), Hinweis „Plan läuft mit Live-Preisen aus dem LV (preise_live).“

### 5.3 Renderer `js/putzplan.js`

Funktionen: `renderPutzplan()`, `renderPutzplanBaum()`, `selectPutzplanObjekt(typ,id)`, `renderLvBereiche(daten)`, `openLvBereichModal/saveLvBereichFromModal`, `openLvPositionModal/saveLvPositionFromModal`, `openLvEintragModal/…`, `openZuschlagsprofilModal/saveZuschlagsprofilFromModal`, `uebernehmeLvInPlan()`. Registrierung `<script src="controllers/ReinigungController.js"></script>` VOR `<script src="js/putzplan.js"></script>` am Ende von code.html (Reihenfolge wie js/dauerrechnungen.js, code.html:4513).

---

## 6. ABHÄNGIGKEITEN & REIHENFOLGE

1. Reihenfolge: Controller (pure) → Tests pure → Schema/Migration → dbAPI → IPC/preload → View/Renderer → Integration (Plan-Übernahme) → DB-Tests.
2. **Berührungspunkte Bestand:** schema.js (Tabellen+Indizes+ALTER), db.js (dbAPI + `_ladePlanPositionenFuerGenerierung` + 4 delete*-Handler + audit), main.js (Handler-Block), preload.js, code.html (Sidebar+View+4 Modals+2 script-Tags), js/navigation.js, js/objekte.js NICHT ändern (Baum neu gebaut, keine Modifikation).
3. **Wiederverwendung:** `getObjektBaum`, `ObjektController.buildPfad/resolveEmpfaenger`, `loeseObjektEmpfaengerAuf`, `saveAbrechnungsplan`, `preise_live`-Pfad, `appendAuditLog`, `db:saveEinstellung`, Toast/Confirm-Muster.

---

## 7. TESTPLAN

Neue Dateien im `node --test`-Stil; DB-Suite mit Electron-as-Node-Wrapper-Muster (Vorbild tests/dauerrechnung_crud.test.js:12–46, `RECHNUNGSPROGRAMM_DB_PATH` isoliert, Cleanup wal/shm).

### tests/reinigungslv_kalkulation.test.js (pure, kein DB)
- `einsaetzeProJahr`: X_PRO_WOCHE 5→260, 1→52, 7→364; ALLE_X_TAGE 14→26, 7→52, 30→12; X_PRO_MONAT 1→12, 2→24; JAEHRLICH 1→1, 2→2; Kalender-Override (53 Wochen).
- Referenzfall §4.3 exakt: 2.166,67 h / 32.500,00 € / 975,00 € Zuschlag / 33.475,00 € / 2.789,58 €/Monat (centgenau).
- Zuschlags-Breakdown: mehrere Fenster gleichzeitig, Anteil 0 → kein Posten-Betrag; Höchstprinzip NICHT automatisiert (Anteile sind Nutzerinput – Dokutest).
- `positionsKalkulation` mit 2 Raumeinträgen (Override-Menge vs. Auto-Fläche) vs. Direktmenge; `summiere` über 2 Bereiche.
- `buildTurnusLabel` deutsche Texte; `validateProfil` Fehlerfälle.

### tests/reinigungslv_crud.test.js (DB, Wrapper-Muster)
- Schema: 3 Tabellen + 6 Indizes existieren (sqlite_master); `abrechnungsplan_positionen.lv_position_id` vorhanden.
- CRUD Bereich (UNIQUE objekt+name deutsche Meldung), Position (CHECK turnus_wert, zuschlaege_json-Validierung), Einträge (UNIQUE position+objekt, menge_override NULL vs Wert).
- CASCADE: Bereich-Löschung entfernt Positionen+Einträge; `deleteLvPosition` mit Plan-Verlinkung blockiert (deutsche Meldung), danach freigeben.
- FK: unbekannte bereich_id → FOREIGN KEY.
- Objekt-Löschschutz: Liegenschaft mit LV-Daten → „enthält Putzplan-/LV-Daten…“; ohne Daten löschbar.
- **Integration:** Fixtures Kunde+Liegenschaft+Gebäude+Etage+2 Räume; LV mit 2 Positionen (§4.3-Werte); `uebernehmeLvInAbrechnungsplan` → Plan existiert (POSITIONEN, preise_live=1, 2 Positionen mit lv_position_id, Monatspreise korrekt); F2-`generiereFaelligeRechnungen` erzeugt Beleg mit LV-preis; danach Profil-Satz ändern (15,00→16,00) + erneut generieren → Belegpreis folgt NEUEM Satz (Live-Nachweis); Audit-Kette `verifiziereAuditKette().valid===true` nach jeder Mutation.

Akzeptanz: `npm test` gesamt grün inkl. Alt-Suites.

---

## 8. SCHRITT-FÜR-SCHRITT-UMSETZUNG

Checkpoints: nach jedem Schritt `node --test tests/<datei>` bzw. `npm test`; UI-Schritte zusätzlich App-Smoke (`npm start`).

1. **Controller pure:** controllers/ReinigungController.js (§4.1, Dual-Export, KEINE Kommentare).
   ✅ `node -e "require('./controllers/ReinigungController')"` lädt; npm test grün.
2. **Testdatei reinigungslv_kalkulation.test.js** schreiben & grün (inkl. §4.3-Referenzfall).
   ✅ Checkpoint.
3. **Schema:** lv_bereiche/lv_positionen/putzplan_eintraege + 6 Indizes in createSchema (Marker-Kommentar erlaubt wie F1/F2-Stil).
   ✅ Neue Test-DB enthält Tabellen+Indizes; npm test grün.
4. **Migration:** ALTER abrechnungsplan_positionen.lv_position_id (duplicate-column-safe).
   ✅ Alte DB-Kopie migriert ohne Fehler (manuell oder Test-Assert).
5. **dbAPI CRUD:** saveLvBereich/getPutzplan(Kalkulation via Controller)/saveLvPosition(+Einträge tx)/deleteLvPosition/deleteLvBereich/getZuschlagsProfil/saveZuschlagsProfil (§3 Shapes, Transaktionsmuster db.js:1510).
   ✅ Node-Smoke: Bereich+Position+Eintrag anlegen → getPutzplan liefert Kalkulation §4.3.
6. **Schutz + Audit:** pruefeObjektLvBezug in 4 Delete-Handler; LV-Audit-Entries; Plan-Link-Blockierung.
7. **Testdatei reinigungslv_crud.test.js Teil 1** (Schema/CRUD/Schutz) grün. ✅ Checkpoint.
8. **Übernahme:** uebernehmeLvInAbrechnungsplan (§4.4) + `_ladePlanPositionenFuerGenerierung`-Erweiterung (lv_position_id-Branch, db.js:1655).
9. **Testdatei Teil 2** (Integration + Live-Preis + Auditkette) grün. ✅ `npm test` GESAMT.
10. **IPC + preload:** 8 Handler (wrapHandler, deutsche Validierungen) + preload-Exposure.
11. **View-Gerüst:** Sidebar nav-putzplan, navigation.js-Eintrag, view-putzplan Container + Toolbar + KPI-IDs (§5.1/5.2).
    ✅ switchView('putzplan') rendert leer fehlerfrei.
12. **Renderer Teil 1:** js/putzplan.js – Objektbaum + Bereichs-/Positionslisten (read-only) + KPIs.
13. **Modals:** lv-bereich-modal + lv-position-modal inkl. Live-Vorschau; Speichern→Refresh.
14. **Renderer Teil 2:** Eintragszuweisung (lv-eintrag-modal, Auto-Fläche/Override, Turnus je Raum), Zuschlags-Breakdown-Popover.
15. **Profil-Modal + Übernehmen-Dialog** (§5.2/5.3).
    ✅ Manueller Smoke: Objekt wählen → Bereich/Position/Einträge → Summen plausibel → Profil ändern → Summen ändern.
16. **Script-Tags registrieren** (ReinigungController VOR putzplan.js) + Suchfilter search-lv.
17. **Gesamtabnahme:** npm test grün; Smoke: kompletter Flow bis generierter Dauerrechnungs-Beleg mit LV-Preis; Objekt-Löschversuch blockiert.

*(Optional, nach Freigabe)* 18. LV-Druckexport: Renderer füllt `#print-template` mit LV-Tabelle (Muster ZUGFeRD-Sichtseite js/editor.js:749) + Button „LV drucken/PDF“.

---

## 9. OFFENE FRAGEN / RISIKEN

1. **BTV-Begriff** (§1.2): Als konfigurierbares Profil gelöst; falls Kunde konkrete „BTV“-Satzwerke (z. B. andere Branche/Region) meint → Profil importierbar machen (später).
2. **„Täglich“-Semantik:** Werktäglich (5×/Wo) als Default gewählt – kalendertäglich = 7×/Wo explizit wählbar. Rückmeldung aus Vertrieb einholen.
3. **Auftragsbedingte Sonn-/Feiertagsarbeit (75 %-Regel, BAG):** Nicht als eigener Slot aufgenommen – über Profil „sonntag_feiertag.prozent=75“ abbildbar. Reicht das fachlich (Anteil statt Pauschalregel)? 
4. **Auto-Mengen bei Raumänderungen:** `menge_override=NULL` folgt live der Raumfläche – gewollt (Doku) oder Snapshot erwünscht?
5. **Zuschläge als Nutzeranteile:** Kalkulatorische Verteilung („10 % der Stunden nachts“) ist Angebotsnäherung; echte Lohnabrechnung out of scope (F4 Zeiterfassung anschlussfähig halten: `lv_positionen.id` später als Leistungsreferenz nutzbar).
6. **MWSt 19 %** Default – Reinigung regelmäßig 19 %; 0/7 bleiben wählbar (Umsatzsteuer-Freibeträge wie F2 offen).
7. **Risiko Preismodell-Verwirrung:** Plan mit `preise_live=1` + lv_position_id ändert Preise bei jeder Generierung – UI muss das deutlich kennzeichnen (Badge „Live aus LV“ in Dauerrechnungen-Liste, kleiner Zusatzschritt 15).
8. **Mehrere LVs pro Objekt** nicht vorgesehen (1 Bereichssatz je Objekt) – Bedarf für „Angebotsvarianten“ klären.
