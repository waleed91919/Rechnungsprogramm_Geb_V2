# Zusammenfassung der Entwicklungssitzung – Gebäude-Kernmodule F1 Objektverwaltung & F2 Dauerrechnungen
**Datum:** 24.08.2026
**Projekt:** W-Link Rechnungsprogramm / Bau-ERP V2
**Ziel:** Umsetzung der Priorität-1-Marktlücke aus `Features/8_feature-roadmap.txt` – Planungs-Subagent erstellt Detailpläne, Code-Subagent setzt beide Pläne vollständig um (2-Phasen-Ansatz: Planung -> Implementierung).

---

## 0. Neue Subagent-Definitionen (`.opencode/agent/`)
- **`gebaeude-planung.md`** – reiner Planungs-Agent (kein Produktionscode): recherchiert IST-Code und schreibt Detailpläne nach `plans/` (DB-Schema, IPC-API, UI-Flow, Geschäftslogik, Testplan, nummerierte Umsetzungsschritte mit Akzeptanzkriterien).
- **`gebaeude-code.md`** – Implementierungs-Agent: arbeitet die Pläne Schritt für Schritt ab (schema.js -> db.js -> main.js/preload.js -> views/js -> tests), `npm test` nach jeder Änderung.
- Hinweis: In dieser Sitzung liefen beide als general-Agents mit identischen Rollenanweisungen; ab Neustart sind sie direkt per `@gebaeude-planung` / `@gebaeude-code` ansprechbar.

## 1. Planungsergebnis (Pläne in `plans/`)
- [`plans/objektverwaltung-plan.md`](../plans/objektverwaltung-plan.md) – F1 Objektverwaltung
- [`plans/daurerchnungen-plan.md`](../plans/daurerchnungen-plan.md) – F2 Wiederkehrende/Dauerrechnungen

**Kernentscheidungen:**
| Bereich | Entscheidung |
|---|---|
| Objekthierarchie | Tabellen `liegenschaften` -> `gebaeude` -> `etagen` -> `raeume`, CASCADE abwärts |
| Rechnungsempfänger | Je Knoten `empfaenger_kunde_id` + `empfaenger_art` (EIGENTUEMER/MIETER/HAUSVERWALTUNG), Vererbung nach oben |
| Beleg-Verknüpfung | `dokumente.objekt_typ`/`objekt_id` (+ Index), Aufnahme in den GoBD-Inhalts-Hash; Löschschutz statt FK wenn Belege referenzieren (nur Deaktivieren) |
| Dauerrechnung | `abrechnungsplaene`, `abrechnungsplan_positionen`, `dauerrechnung_laeufe`; partielles UNIQUE `(plan_id, periode_von, periode_bis) WHERE status='ERSTELLT'` verhindert Doppelläufe |
| Sammelrechnung | 1 Beleg `rechnungsart='SAMMELRECHNUNG'`, n Läufe -> 1 Dokument |
| Generierung | Atomar über bestehendes `applyDocumentWrite` -> Hash/Audit/GoBD ohne Zusatzcode |
| Views | `switchView('objekte')`, `switchView('objekt-details')` (Tabs Stammdaten/Struktur/Historie/Abrechnungspläne), `switchView('dauerrechnungen')` |

## 2. Umsetzung (Code-Subagent, alle 36 Schritte beider Pläne)

### F1 Objektverwaltung (Schritte 1–16)
- 4 neue Tabellen + idempotente Migration (`schema.js`, `db.js`), Audit-Hash-Erweiterung (`main/audit.js`)
- CRUD mit Löschschutz, 11 neue IPC-Handler (`main.js` + Exposes in `preload.js`)
- `controllers/ObjektController.js`, Listen-View + Modal, Detail-View mit 4 Tabs
- Historie-Rollup (alle Belege je Objekt), Editor-Anbindung `rechnung-objekt` (Objektwahl im Rechnungseditor)

### F2 Dauerrechnungen (Schritte 1–20)
- Rhythmus-Kern (monatlich/quartalsweise/jährlich/Wochenintervall), Tabellen + Partial-Unique
- Plan-CRUD, eigener Nummernkreis, Generierungskern atomar via `applyDocumentWrite`
- Vorschau/Rückstau (verpasste Perioden werden nachgeholt), Sammelrechnung je Eigentümer
- Storno von Läufen mit GoBD-Pflichtbegründung, Auto-Lauf max. 1×/Tag beim App-Start
- View + Modals (`js/dauerrechnungen.js`), Objektdetail-Tab „Abrechnungspläne" befüllt, Editor-Badge

### Neue Dateien
- `controllers/ObjektController.js`, `controllers/DauerrechnungController.js`
- `js/objekte.js`, `js/dauerrechnungen.js`
- `tests/objekt_stamm.test.js`, `tests/objekt_logik.test.js`, `tests/objekt_historie.test.js`
- `tests/dauerrechnung_rhythmus.test.js`, `tests/dauerrechnung_crud.test.js`, `tests/dauerrechnung_generation.test.js`

### Geänderte Dateien
`schema.js`, `db.js`, `main/audit.js`, `main.js`, `preload.js`, `js/navigation.js`, `js/state.js`, `js/init.js`, `js/editor.js`, `code.html`

## 3. Abweichungen vom Plan (IST-Code hat gewonnen)
1. Unbekanntes Elternteil -> nativer SQLite-FK-Fehler statt eigener Meldung (Muster wie `dokumente.kundeId`)
2. `applyDocumentWrite`/`bulkSaveDocuments` mussten zusätzlich um Persistenz von `objekt_typ`/`objekt_id` erweitert werden
3. Historie-SQL: ORDER BY im Compound-SELECT mit JOIN scheiterte -> Subselect-Variante
4. Sammelrechnung unterstützt auch noch nie generierte Perioden (Lauf wird atomar mitangelegt); FK-Schutz beim Entwurf-Storno bei mehreren Läufen je Beleg
5. Auto-Run-Info via `showToast` (keine addNotification-API vorhanden)

## 4. Testergebnis
- `npm test` -> **129 pass / 0 fail** (Baseline vor Umsetzung: 105 pass)
- Syntax aller geänderten Dateien geprüft

## 5. Nachträglich entschiedene Punkte (24.08.2026, 2. Runde)
Beide verbliebenen PO-Fragen aus [`plans/daurerchnungen-plan.md`](../plans/daurerchnungen-plan.md) §8 wurden per Nutzerentscheid geschlossen und implementiert.

### 5.1 Preisquelle Hybrid: Snapshot vs. Live-Artikelpreis (§8.3)
**Entscheidung:** Pro Abrechnungsplan wählbar (Standard = Snapshot).
- **DB:** Neues Feld `abrechnungsplaene.preise_live INTEGER DEFAULT 0` – in `schema.js` als CHECK-Constraint im CREATE TABLE angelegt + ALTER-TABLE-Migration für Bestandsdatenbanken (`runMigrations`).
- **Logik (`db.js`):** Neuer Helfer `_ladePlanPositionenFuerGenerierung(plan)` – bei `preise_live=1` wird je Position mit `artikelId` der aktuelle `artikel.vk` geladen und anstelle des gespeicherten Snapshots verwendet; Positionen ohne Artikellink bleiben unverändert. Der Helfer greift an **allen drei** Preis-Stellen: Einzelgenerierung (`_erzeugeRechnungAusLaufTx`), Sammelrechnung (`_erzeugeSammelrechnungTx`, Positionen behalten das `[Objektpfad]`-Label) und Vorschau (`dauerrechnungenVorschau` → `nettoErwartet`). Bei `preise_live=0` (Standard): Preis bleibt beim Speichern eingefroren; Preisänderung = Plan bearbeiten.
- **GoBD/Audit:** Die Flag-Änderung wird als auditierbarer Akt im Audit-Log der Plan-Mutation erfasst (`details.preiseLive`).
- **UI (`code.html` + `js/dauerrechnungen.js`):** Checkbox „Preise live vom Artikelkatalog übernehmen" im Plan-Modal (nur sichtbar bei Positions-Modus, inkl. Erklärtext); Wert wird beim Bearbeiten geladen und beim Speichern übermittelt; „Live"-Badge an Plannamen in der Planliste.
- **Tests:** Neue Datei [`tests/dauerrechnung_preise_live.test.js`](../tests/dauerrechnung_preise_live.test.js), 6 Fälle: Snapshot-Freeze trotz vk-Änderung, Live-Generierung mit neuem vk, Live-/Snapshot-Vorschau (`nettoErwartet`), gemischte Sammelrechnung (Live-Position 30 € + Snapshot 20 € in einem Beleg), PAUSCHALE mit Flag.

### 5.2 Sammelrechnung Objektdarstellung (§8.5)
**Entscheidung:** Das Label-Präfix `[Objektpfad]` vor jedem Positionsnamen bleibt Release-Stand (db.js: `[${pfad}] ${pos.name}`). Echte Gruppierung/Zwischenüberschriften im PDF-Layout verworfen (Aufwand ×3 PDF-Templates ohne Kundennutzen für v1).

### 5.3 Testergebnis nach Runde 2
- `npm test` -> **130 pass / 0 fail** (vorher 129)
- Geänderte Dateien: `schema.js`, `db.js`, `code.html`, `js/dauerrechnungen.js`; neu: `tests/dauerrechnung_preise_live.test.js`

## 6. Weiterhin offene Punkte
1. Automatische Objektnummern-Vergabe?
2. Zeitlich begrenzte Mietverhältnisse (Mieter wechselt) – v2?
3. Bestandsabbuchung bei Lagerartikeln in Dauerrechnungen?
4. Keine Commits durchgeführt – Änderungen liegen unversioniert im Arbeitsverzeichnis.
