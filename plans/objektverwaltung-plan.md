# PLAN F1 – OBJEKtVERWALTUNG (Liegenschaft → Gebäude → Etage → Raum/Fläche)

**Version:** 1.0 (Erstplan, 24.08.2026)
**Autor:** Subagent „Gebäude-Planung" gemäß `.opencode/agent/gebaeude-planung.md`
**Umsetzer:** Code-Subagent „gebaeude-code"
**Roadmap-Referenz:** `Features/8_feature-roadmap.txt` F1 | Ist-Stand: `Features/7_w-link-erp_ist-stand.txt` („Objektverwaltung fehlt komplett")

---

## 0. Ziel & Scope

Neues Modul **Objektverwaltung** als hierarchischer Objektstamm für die Zielgruppe Gebäude (Gebäudereinigung, Hausverwaltung, FM):

- **Hierarchie:** Liegenschaft → Gebäude → Etage → Raum/Fläche (4 fixe Ebenen).
- **Abweichender Rechnungsempfänger:** je Knoten optional Mieter/Eigentümer/Hausverwaltung aus bestehender Kundentabelle (`kunden`); Vererbung nach oben, wenn nichts gesetzt.
- **Objekt-Historie:** alle Belege (`dokumente`) je Objektknoten inkl. Roll-up über Kindknoten.
- **NICHT im Scope dieses Plans:** Abrechnungspläne-Inhalt (F2, eigener Plan `plans/daurerchnungen-plan.md`) – aber der Tab „Abrechnungspläne" im Objektdetail wird hier bereits als Container angelegt, den F2 befüllt.

**Wiederverwendung statt Neubau:** Kunden bleiben ausschließlich in der bestehenden Tabelle `kunden` (kein Duplikatstamm!). Belege werden weiterhin über `db:saveDocument` erzeugt; das Modul fügt Belegen nur die Verknüpfungsfelder `objekt_typ`/`objekt_id` hinzu.

---

## 1. DB-SCHEMA

### 1.1 Konventionen (aus schema.js abgeschaut)

- Neue Tabellen werden in `schema.js` → `createSchema(db)` als `CREATE TABLE IF NOT EXISTS …` ergänzt (Muster wie `aufmass_blaetter`/`nachtraege`, schema.js:162–218).
- Spaltenstil der neueren Tabellen: snake_case, `INTEGER PRIMARY KEY AUTOINCREMENT`, ENUMs als `TEXT … CHECK(x IN (...))`, `created_at DATETIME DEFAULT CURRENT_TIMESTAMP`, explizite `FOREIGN KEY (...) REFERENCES ...`-Klauseln.
- Neue Spalten auf Bestandstabellen (hier: `dokumente`) werden in `runMigrations(db)` als try/catch-`ALTER TABLE … ADD COLUMN`-Block mit dem Standard-Guard ergänzt (Muster schema.js:293–298, Kommentar-Marker `// --- Objektverwaltung F1 ---`). Das Projekt hat KEINE nummerierten Migrationen – die Blöcke sind rein sequenziell; wir benennen die Migrationsblöcke im Quelltext-Kommentar: **„Migration Objektverwaltung F1: dokumente.objekt_typ / objekt_id"** und **„Migration Objektverwaltung F1: Index idx_dokumente_objekt"**.
- `PRAGMA foreign_keys = ON` ist aktiv (db.js:28) → FKs werden real erzwungen.

### 1.2 Tabelle `liegenschaften`

| Spalte | Typ | NULL | Default | Anmerkung |
|---|---|---|---|---|
| id | INTEGER PK | NO | AUTOINCREMENT | |
| objekt_nr | TEXT | YES | NULL | freie Liegenschafts-Nr., z. B. „L-001" |
| name | TEXT | NO | – | Pflichtfeld, UI-Validierung wie `db:saveKunde` (main.js:162) |
| strasse | TEXT | YES | NULL | |
| plz | TEXT | YES | NULL | |
| ort | TEXT | YES | NULL | |
| empfaenger_kunde_id | INTEGER | YES | NULL | FK → kunden(id), **ohne ON DELETE** (= NO ACTION/RESTRICT: Kunde mit Objektbezug ist nicht löschbar – konsistent zu dokumente.kundeId) |
| empfaenger_art | TEXT | YES | NULL | `CHECK(empfaenger_art IN ('EIGENTUEMER','MIETER','HAUSVERWALTUNG'))`; NULL = vererbt/nicht spezifiziert |
| notizen | TEXT | YES | NULL | |
| aktiv | INTEGER | NO | 1 | `CHECK(aktiv IN (0,1))`; Soft-Deaktivierung statt Löschen |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | |

```sql
CREATE TABLE IF NOT EXISTS liegenschaften (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    objekt_nr TEXT,
    name TEXT NOT NULL,
    strasse TEXT,
    plz TEXT,
    ort TEXT,
    empfaenger_kunde_id INTEGER,
    empfaenger_art TEXT CHECK(empfaenger_art IN ('EIGENTUEMER','MIETER','HAUSVERWALTUNG')),
    notizen TEXT,
    aktiv INTEGER DEFAULT 1 CHECK(aktiv IN (0,1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (empfaenger_kunde_id) REFERENCES kunden(id)
);
CREATE INDEX IF NOT EXISTS idx_liegenschaften_kunde ON liegenschaften(empfaenger_kunde_id);
```

### 1.3 Tabelle `gebaeude`

| Spalte | Typ | NULL | Default | Anmerkung |
|---|---|---|---|---|
| id | INTEGER PK | NO | AUTOINCREMENT | |
| liegenschaft_id | INTEGER | NO | – | FK → liegenschaften(id) **ON DELETE CASCADE** |
| name | TEXT | NO | – | z. B. „Haus A" |
| strasse / plz / ort | TEXT | YES | NULL | nur wenn abweichend von Liegenschaft |
| baujahr | INTEGER | YES | NULL | |
| geschosse | INTEGER | YES | NULL | informativ |
| empfaenger_kunde_id | INTEGER | YES | NULL | FK → kunden(id), NO ACTION |
| empfaenger_art | TEXT | YES | NULL | CHECK wie Liegenschaft |
| notizen | TEXT | YES | NULL | |
| aktiv | INTEGER | NO | 1 | CHECK wie Liegenschaft |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | |

```sql
CREATE TABLE IF NOT EXISTS gebaeude (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    liegenschaft_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    strasse TEXT,
    plz TEXT,
    ort TEXT,
    baujahr INTEGER,
    geschosse INTEGER,
    empfaenger_kunde_id INTEGER,
    empfaenger_art TEXT CHECK(empfaenger_art IN ('EIGENTUEMER','MIETER','HAUSVERWALTUNG')),
    notizen TEXT,
    aktiv INTEGER DEFAULT 1 CHECK(aktiv IN (0,1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (liegenschaft_id) REFERENCES liegenschaften(id) ON DELETE CASCADE,
    FOREIGN KEY (empfaenger_kunde_id) REFERENCES kunden(id)
);
CREATE INDEX IF NOT EXISTS idx_gebaeude_liegenschaft ON gebaeude(liegenschaft_id);
CREATE INDEX IF NOT EXISTS idx_gebaeude_kunde ON gebaeude(empfaenger_kunde_id);
```

### 1.4 Tabelle `etagen`

| Spalte | Typ | NULL | Default |
|---|---|---|---|
| id | INTEGER PK AUTOINCREMENT | NO | – |
| gebaeude_id | INTEGER NOT NULL, FK → gebaeude(id) **ON DELETE CASCADE** | NO | – |
| name | TEXT NOT NULL („EG", „1. OG", „Tiefgarage") | NO | – |
| ebene_nummer | INTEGER (Sortier-/Ebenenzahl, EG = 0) | YES | NULL |
| empfaenger_kunde_id | INTEGER, FK → kunden(id) | YES | NULL |
| empfaenger_art | TEXT CHECK (wie oben) | YES | NULL |
| notizen | TEXT | YES | NULL |
| aktiv | INTEGER DEFAULT 1 CHECK | NO | 1 |
| created_at | DATETIME DEFAULT CURRENT_TIMESTAMP | NO | – |

```sql
CREATE TABLE IF NOT EXISTS etagen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gebaeude_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    ebene_nummer INTEGER,
    empfaenger_kunde_id INTEGER,
    empfaenger_art TEXT CHECK(empfaenger_art IN ('EIGENTUEMER','MIETER','HAUSVERWALTUNG')),
    notizen TEXT,
    aktiv INTEGER DEFAULT 1 CHECK(aktiv IN (0,1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (gebaeude_id) REFERENCES gebaeude(id) ON DELETE CASCADE,
    FOREIGN KEY (empfaenger_kunde_id) REFERENCES kunden(id)
);
CREATE INDEX IF NOT EXISTS idx_etagen_gebaeude ON etagen(gebaeude_id);
CREATE INDEX IF NOT EXISTS idx_etagen_kunde ON etagen(empfaenger_kunde_id);
```

### 1.5 Tabelle `raeume` (Raum/Fläche)

| Spalte | Typ | NULL | Default |
|---|---|---|---|
| id | INTEGER PK AUTOINCREMENT | NO | – |
| etage_id | INTEGER NOT NULL, FK → etagen(id) **ON DELETE CASCADE** | NO | – |
| name | TEXT NOT NULL („Büro 101", „Treppenhaus") | NO | – |
| raum_nr | TEXT | YES | NULL |
| flaeche | REAL DEFAULT 0 | NO | 0 |
| einheit | TEXT DEFAULT 'm²' | NO | 'm²' (alternativ 'Stk.') |
| raumtyp | TEXT (frei: BUERO/TREPPE/AUSSENLAGER/…; bewusst ohne CHECK – Zukunft Putzplan F3) | YES | NULL |
| empfaenger_kunde_id | INTEGER, FK → kunden(id) | YES | NULL |
| empfaenger_art | TEXT CHECK (wie oben) | YES | NULL |
| notizen | TEXT | YES | NULL |
| aktiv | INTEGER DEFAULT 1 CHECK | NO | 1 |
| created_at | DATETIME DEFAULT CURRENT_TIMESTAMP | NO | – |

```sql
CREATE TABLE IF NOT EXISTS raeume (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    etage_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    raum_nr TEXT,
    flaeche REAL DEFAULT 0,
    einheit TEXT DEFAULT 'm²',
    raumtyp TEXT,
    empfaenger_kunde_id INTEGER,
    empfaenger_art TEXT CHECK(empfaenger_art IN ('EIGENTUEMER','MIETER','HAUSVERWALTUNG')),
    notizen TEXT,
    aktiv INTEGER DEFAULT 1 CHECK(aktiv IN (0,1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (etage_id) REFERENCES etagen(id) ON DELETE CASCADE,
    FOREIGN KEY (empfaenger_kunde_id) REFERENCES kunden(id)
);
CREATE INDEX IF NOT EXISTS idx_raeume_etage ON raeume(etage_id);
CREATE INDEX IF NOT EXISTS idx_raeume_kunde ON raeume(empfaenger_kunde_id);
```

### 1.6 Migration Bestandstabelle `dokumente` + Hash

In `runMigrations(db)` NEU am Ende (vor `ensureUniqueConstraints(db)`), Marker-Kommentar `// --- Migration Objektverwaltung F1: Beleg ↔ Objekt ---`:

```js
try { db.exec(`ALTER TABLE dokumente ADD COLUMN objekt_typ TEXT`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
// erlaubte Werte (Anwenderebene): 'LIEGENSCHAFT' | 'GEBAEUDE' | 'ETAGE' | 'RAUM'; NULL = kein Objektbezug (Altbestand!)
try { db.exec(`ALTER TABLE dokumente ADD COLUMN objekt_id INTEGER`); } catch (e) { if (!e.message.includes('duplicate column')) { console.warn('[DB Migration Warning]:', e.message); } }
```

Danach (in createSchema ODER direkt hinter den ALTERs – besser in createSchema-ähnlichem Kontext, da nicht-deduplizierungsbedürftig):

```sql
CREATE INDEX IF NOT EXISTS idx_dokumente_objekt ON dokumente(objekt_typ, objekt_id);
```

**Keine FK-Klausel** auf `(objekt_typ, objekt_id)` (polymorphe Referenz, in SQLite nicht ausdrückbar). Stattdessen **Anwendungs-Löschschutz**: `deleteLiegenschaft/Gebaeude/Etage/Raum` prüfen, ob `dokumente` (oder später `dauerrechnung_laeufe`) den Knoten referenzieren → deutsche Fehlermeldung, Deaktivieren (`aktiv=0`) empfehlen. Damit kann ein Beleg seinen Objektbezug nie verlieren (GoBD).

**GoBD-Inhalts-Hash (`main/audit.js` → `calculateDocumentContentHash`):** Die Felder `objekt_typ` und `objekt_id` werden **IN den Inhalts-Hash** aufgenommen (nach `buyer_reference`, vor `positionen`), analog `projektId`. Begründung: Die Zuordnung Beleg↔Objekt ist fachlicher Inhalt; konsistentes Verhalten mit kundeId/projektId. Da `calculateDocumentContentHash(existing)` bei jedem Vergleich NEU aus Rohtabellen berechnet (nicht die gespeicherte Spalte liest), bleiben Altbelege vergleichbar – keine Hash-Retro-Migration nötig. Retro-Verknüpfung eines gesperrten Belegs läuft über den bestehenden „Beleg entsperren"-Pfad (`db:unlockDocument`).
→ **Änderung in `main/audit.js` ist Teil dieser Migration** (ein Feld-Paar im content-Objekt ergänzen).

### 1.7 Erweiterung `getFullState()` (db.js)

Neuer Zweig in `dbAPI.getFullState()`:

```js
state.objekte = {
    liegenschaften: await dbQuery('SELECT * FROM liegenschaften ORDER BY name ASC'),
    gebaeude:       await dbQuery('SELECT * FROM gebaeude ORDER BY name ASC'),
    etagen:         await dbQuery('SELECT * FROM etagen ORDER BY COALESCE(ebene_nummer, 999), name ASC'),
    raeume:         await dbQuery('SELECT * FROM raeume ORDER BY name ASC')
};
```

(Flache Listen statt verschachtelter Baum – Zusammenbau im Renderer über die ID-Felder, wie bei `aufmasse`/`positionen` gehandhabt.)

### 1.8 Lösch-/Cascade-Übersicht

| Aktion | Verhalten |
|---|---|
| Liegenschaft löschen | Gebäude/Etagen/Räume sterben per CASCADE – VORHER Anwenderschutz: Blockiert, wenn Belege/Pläne referenzieren oder Kinder vorhanden sind (UI fragt „Alle Gebäude mitsamt Etagen/Räumen löschen?" via `dialog:confirm`); bei Belegbezug: harte Ablehnung mit Meldung „Objekt hat Belege – bitte stattdessen deaktivieren." |
| Kunde löschen | Blockiert durch FK (NO ACTION), sobald Empfänger irgendwo referenziert – Fehlermeldung der SQLite-Exception wird von `wrapHandler` durchgereicht (bestehendes Verhalten bei dokumente.kundeId identisch) |
| Beleg löschen | `objekt_typ/objekt_id` gehen mit dem Beleg verloren – ok (Beleg existiert dann nicht mehr; GoBD-Sperre greift unverändert) |

---

## 2. IPC-API

Namensschema wie bestehende Handler: `db:<verb><Entität>` in `main.js::setupIpc()` mit `wrapHandler` (main.js:137), Validierungsfehler deutsch, Registrierung im Abschnitt `// --- Objektverwaltung (F1) ---` nach den Projekt-Handlern (main.js:367–373). Alle Handler in `preload.js` unter Kommentar `// --- Objektverwaltung (F1) ---` spiegeln.

### 2.1 Handler-Liste

| Kanal | preload-Name | Request | Response | Fehlerfälle (deutsche Messages) |
|---|---|---|---|---|
| `db:getObjektBaum` | `getObjektBaum()` | – | `{ liegenschaften:[…], gebaeude:[…], etagen:[…], raeume:[…] }` (je Zeile zusätzlich `kindCount`/`flaeche_summe` für Liste) | – |
| `db:saveLiegenschaft` | `saveLiegenschaft(data)` | `{id?, objekt_nr?, name!, strasse?, plz?, ort?, empfaenger_kunde_id?, empfaenger_art?, notizen?, aktiv?}` | `id:number` | „Ungültige Liegenschafts-Daten" (fehlt/kein Objekt/name leer); FK-Fehler bei unbekanntem kundeId |
| `db:deleteLiegenschaft` | `deleteLiegenschaft(id)` | `id:number` | `{changes}` | „Ungültige Liegenschaft-ID"; „Liegenschaft hat Belege und kann nicht gelöscht werden…" (Referenzprüfung); CASCADE-Hinweis bei Kindern nur als confirm-Vorlage (UI-seitig) |
| `db:saveGebaeude` | `saveGebaeude(data)` | `{id?, liegenschaft_id!, name!, …wie oben}` | `id:number` | „Ungültige Gebäude-Daten"; „Liegenschaft nicht gefunden" |
| `db:deleteGebaeude` | `deleteGebaeude(id)` | `id:number` | `{changes}` | analog Liegenschaft |
| `db:saveEtage` | `saveEtage(data)` | `{id?, gebaeude_id!, name!, ebene_nummer?, …}` | `id:number` | analog |
| `db:deleteEtage` | `deleteEtage(id)` | `id:number` | `{changes}` | analog |
| `db:saveRaum` | `saveRaum(data)` | `{id?, etage_id!, name!, raum_nr?, flaeche?, einheit?, raumtyp?, …}` | `id:number` | analog; `flaeche < 0` → „Ungültige Fläche" |
| `db:deleteRaum` | `deleteRaum(id)` | `id:number` | `{changes}` | analog |
| `db:getObjektDetails` | `getObjektDetails(objektTyp, objektId)` | `objektTyp:string (enum), objektId:number` | `{ knoten, pfad:'L-001 › Haus A › 1. OG › Büro 101', empfaenger:{kundeId,name,art,quelle:'GEERBT_VON_LIEGENSCHAFT'|'DIREKT'}, kinder:{…}, kennzahlen:{flaecheGesamt, anzahlRaeume}, plaene:[…] (leer bis F2) }` | „Ungültiger Objekttyp", „Objekt nicht gefunden" |
| `db:getObjektHistorie` | `getObjektHistorie(objektTyp, objektId, {includeKinder=true})` | siehe 2.2 | `Array<dokumentZeile>` | „Ungültiger Objekttyp" |

Alle Save/Delete-Handler delegieren an neue Funktionen in `dbAPI` (db.js), die innerhalb `db.transaction((…) => { … })` arbeiten (Muster `saveAufmassBlatt`, db.js:748) und **keinen** Audit-Eintrag schreiben (Objektstamm ist kein GoBD-Beleg; Audit nur für Belege – Entscheidung siehe §4/Risiken).

### 2.2 Historie-Abfrage (SQL, exakt)

Direktlinks UND Dauerrechnungs-Läufe (F2-zukunftssicher, liefert heute einfach nur keine Lauf-Treffer):

```sql
SELECT d.id, d.type, d.nr, d.datum, d.faellig, d.status, d.netto, d.brutto,
       d.isLocked, d.kundeId, k.name AS kundeName,
       ? AS matchArt   /* 'DIREKT' */
FROM dokumente d LEFT JOIN kunden k ON k.id = d.kundeId
WHERE d.objekt_typ = ? AND d.objekt_id = ?
UNION ALL
SELECT d.id, d.type, d.nr, d.datum, d.faellig, d.status, d.netto, d.brutto,
       d.isLocked, d.kundeId, k.name,
       'DAUERRECHNUNG'
FROM dokumente d
JOIN dauerrechnung_laeufe l ON l.dokument_id = d.id      -- existiert erst nach F2; Guard: Tabelle prüfen, sonst Teil 2 überspringen
JOIN abrechnungsplaene p ON l.plan_id = p.id
LEFT JOIN kunden k ON k.id = d.kundeId
WHERE p.objekt_typ = ? AND p.objekt_id = ?
ORDER BY datum DESC, id DESC
```

Roll-up über Kinder: Der Controller (`ObjektController.getDescendantIds(objektTyp, objektId, state)`) expandiert die IDs im Renderer/Hauptprozess und ruft die Abfrage je Knoten auf (max. 4 Ebenen – kein rekursives CTE nötig), Ergebnisse merged + nach `datum` sortiert, Dubletten über `id` dedupliziert (Sammelrechnungen erscheinen so automatisch in der Historie JEDES beteiligten Objekts).

---

## 3. UI-FLOW

### 3.1 Navigation & Views registrieren

1. **code.html Sidebar** (nach „Projekte"-Eintrag, code.html:164–169, neuer Block):
   ```html
   <a class="flex items-center gap-3 px-3 py-2 rounded-md text-slate-300 hover:bg-sidebar-hover hover:text-white transition-colors group cursor-pointer"
      id="nav-objekte" onclick="switchView('objekte')">
       <span class="material-symbols-outlined text-[20px] text-slate-400 group-hover:text-white">apartment</span>
       <span class="text-sm font-medium">Objekte</span>
   </a>
   ```
2. **js/navigation.js:** `viewConfig` ergänzen um
   ```js
   objekte:        { title: 'Objektverwaltung', subtitle: 'Liegenschaften & Gebäude', action: () => { if (typeof renderObjekte === 'function') renderObjekte(); } },
   'objekt-details': { title: 'Objekt-Detail', subtitle: 'Struktur & Historie', action: () => { if (typeof refreshObjektDetails === 'function') refreshObjektDetails(); } },
   ```
   und das `views`-Array (navigation.js:46) um `'objekte', 'objekt-details'` erweitern.
3. View-Container analog bestehendem Stil: `<div id="view-objekte" class="hidden flex-1 overflow-y-auto bg-slate-50/50 p-6">` mit `<div class="max-w-[1600px] mx-auto flex flex-col gap-6">`.

### 3.2 Liste `view-objekte` (Listenlayout)

- **KPI-Cards-Zeile** (3 Karten, Stil wie view-kunden code.html:722): `kpi-anzahl-liegenschaften` (Icon `apartment`), `kpi-anzahl-gebaeude` (Icon `domain`), `kpi-flaeche-gesamt` (Icon `square_foot`, Summe aller `raeume.flaeche`).
- **Toolbar** (wie code.html:756): Suchfeld `search-objekte` (filtert clientseitig Name/Nr/Ort), Button `+ Neue Liegenschaft` (`onclick="openObjektModal('LIEGENSCHAFT')"`, primary-Stil).
- **Data Grid** `objekte-table-body` (dense-table, wie code.html:793): Spalten `Objekt-Nr | Name (mit Einrückung je Ebene: Liegenschaft fett, Gebäude eingerückt ▸, Etage ▸▸, Raum ▸▸▸) | Typ-Badge (LIEGENSCHAFT/GEBAEUDE/ETAGE/RAUM) | Ort | Rechnungsempfänger (Name + Art-Badge MIETER/EIGENTÜMER/HV, gelb wenn geerbt) | Fläche Σ | Status (Aktiv/Inaktiv) | Aktionen (Bearbeiten ✏️, Details ↗, Neu anlegen + je Ebene, Deaktivieren ⏸ / Aktivieren ▶, Löschen 🗑)`.
- Zeilenklick auf Name → `openObjektDetails(objektTyp, objektId)`.

### 3.3 Modal `objekt-modal` (Formularlayout, ein Modal für alle 4 Ebenen)

Felder (IDs `objekt-modal-*`), dynamisch eingeblendet je `data-ebene`:
- `objekt-modal-eltern` (Select: übergeordnete Liegenschaft/Gebäude/Etage – nur bei GEBAEUDE/ETAGE/RAUM sichtbar, Pflicht)
- `objekt-modal-nr` (Text; nur LIEGENSCHAFT/RAUM: Raum-Nr heißt `raum_nr`)
- `objekt-modal-name` (Text, Pflicht, Autofocus)
- Adresse: `objekt-modal-strasse`, `objekt-modal-plz`, `objekt-modal-ort` (nur LIEGENSCHAFT/GEBAEUDE)
- `objekt-modal-baujahr`, `objekt-modal-geschosse` (nur GEBAEUDE), `objekt-modal-ebene-nummer` (nur ETAGE)
- `objekt-modal-flaeche` + `objekt-modal-einheit` (select m²/Stk.) + `objekt-modal-raumtyp` (nur RAUM)
- **Abweichender Rechnungsempfänger** (Fieldset, alle Ebenen):
  - `objekt-modal-empfaenger-kunde` = Select über `state.kunden` (Option-Label `kundennummer – name`, Wert id, Leeroption „— wie übergeordnetes Objekt —")
  - `objekt-modal-empfaenger-art` = Select `EIGENTUEMER/MIETER/HAUSVERWALTUNG` (Label „Eigentümer/Mieter/Hausverwaltung"), nur enabled wenn Kunde gewählt
- `objekt-modal-notizen` (Textarea), `objekt-modal-aktiv` (Checkbox, nur Bearbeiten)
- Speichern → `window.api.saveLiegenschaft|saveGebaeude|saveEtage|saveRaum(payload)` → Modal schließen → Liste neu rendern. Validierung clientseitig (Name, Elternteil, Fläche ≥ 0), Servervalidierung wie §2.

### 3.4 Detail-View `view-objekt-details` (Tabs – Muster `view-projekt-details`, code.html:1115)

- **Header-Card:** Zurück-Button (`closeObjektDetails()` → `switchView('objekte')`), `od-name` (H2), Typ-Badge `od-typ`, Brotkrumen-Pfad `od-pfad`, Empfänger-Zeile `od-empfaenger` (Name + Art + Herkunft-Badge „direkt"/„geerbt von …"), Buttons „Bearbeiten" (`od-edit-btn`), „Neu anlegen" (Kindkontext).
- **Tab-Leiste** (Buttons `od-tab-btn-*`, Panels `od-panel-*`, Wechsel via `switchObjektTab(name)` – exakt das `switchProjektTab`-Muster aus js/projekte.js kopieren):
  1. **Stammdaten** (`od-tab-btn-stammdaten` / Icon `info`): Key-Value-Karte aller Stammdaten + Kennzahlen-Karten (Fläche gesamt, Anzahl Gebäude/Etagen/Räume darunter) + Notizen.
  2. **Struktur** (`od-tab-btn-struktur` / Icon `account_tree`): Baumansicht (verschachtelte `<ul>`) der Unterknoten mit Flächen, je Knoten Buttons Bearbeiten/Details/Löschen; Button „Ebene hinzufügen".
  3. **Historie** (`od-tab-btn-historie` / Icon `history`): Tabelle aller Belege (§2.2): `Nr | Typ (RE/AN-Badge) | Datum | Fällig | Status | Netto | Brutto | Kunde | Aktion (Öffnen → openRechnungModal(doc))`; Filter-Chips „Alle / Nur Rechnungen / Nur Angebote / Nur Dauerrechnungs-Läufe"; Summen-Footer (Σ netto offen/bezahlt via status).
  4. **Abrechnungspläne** (`od-tab-btn-abrechnungsplaene` / Icon `event_repeat`): Container mit Hinweis-Panel „Noch keine Abrechnungspläne" + Button `+ Plan anlegen` → **wird von F2 befüllt** (siehe plans/daurerchnungen-plan.md §3). In F1 nur statisches Gerüst + Aufruf-Hook `renderObjektPlaene(objektTyp, objektId)` (no-op-Fallback).

---

## 4. GESCHÄFTSLOGIK (Objektanteil)

Neuer Controller `controllers/ObjektController.js` (reine Logik, Node + Browser-fähig wie InvoiceController:255–259 – `module.exports` UND `window.ObjektController`):

- `validateKnoten(ebene, data)` → `{valid, message}` (Name Pflicht, Elternteil Pflicht außer LIEGENSCHAFT, Fläche ≥ 0, `empfaenger_art` nur MIT `empfaenger_kunde_id`).
- `resolveEmpfaenger(objektTyp, objektId, objekteState)` → `{kundeId, art, quelle}`: steigt vom Knoten nach oben (RAUM→ETAGE→GEBAEUDE→LIEGENSCHAFT) bis erster Treffer `empfaenger_kunde_id`; `quelle` = Ebene des Fundes; `null` wenn nirgends gesetzt (UI-Warnhinweis „Kein Rechnungsempfänger – Rechnungslauf nicht möglich").
- `buildPfad(objektTyp, objektId, objekteState)` → `'Liegenschaft › Gebäude › Etage › Raum'`.
- `getDescendantIds(objektTyp, objektId, objekteState)` → `[{objektTyp, objektId}…]` für Historie-Roll-up.
- `summiereFlaechen(objektTyp, objektId, objekteState)` → Number.

**Keine** Änderung an Rechnungserstellung/Kundenauswahl: Im Rechnungseditor (js/editor.js) wird NUR ein optionales Zusatzfeld „Objekt" (Select über Objektbaum, schreibt `doc.objekt_typ/objekt_id`) ergänzt; Empfänger-Auflösung passiert beim Speichern NICHT zwangsweise (der gewählte `kundeId` bleibt maßgeblich – Objekt ist Zusatzinfo/Historie-Anker). F2 nutzt `resolveEmpfaenger` für automatische Empfängerwahl.

---

## 5. ABHÄNGIGKEITEN & REIHENFOLGE

1. **Vorher:** nichts – F1 ist Basismodul. Keine Änderungen an bestehenden Tabellen außer den zwei dokumente-Spalten + Hash-Erweiterung.
2. **Berührungspunkte Bestandscode:** `schema.js` (createSchema/runMigrations), `db.js` (dbAPI + getFullState), `main/audit.js` (2 Hash-Felder), `main.js` (~11 Handler), `preload.js` (11 Methoden), `js/navigation.js` (config + array), `code.html` (Sidebar + 2 View-Container + 1 Modal), neu: `js/objekte.js`, `controllers/ObjektController.js`, optional `tests/*`.
3. **Nachher:** F2 (Dauerrechnungen) setzt `objekt_typ/objekt_id` + `resolveEmpfaenger` voraus → Reihenfolge strikt F1 → F2.
4. **Wiederverwendung:** Kundenauswahl (state.kunden), Belegerstellung (`db:saveDocument`), Storno (`db:storniereRechnung`), Belegöffnung im Editor – alles unverändert.

---

## 6. TESTPLAN

Vorbilder: `tests/data_integrity.test.js` (isolated-DB + ELECTRON_RUN_AS_NODE-Wrapper, RECHNUNGSPROGRAMM_DB_PATH), `tests/invoice_controller.test.js` (pure Logic). Neue Dateien:

### tests/objekt_stamm.test.js (DB-Tests, Wrapper-Muster aus data_integrity.test.js:18–65 kopieren)
- (a) Schema/Migration: Tabellen `liegenschaften/gebaeude/etagen/raeume` existieren; `PRAGMA table_info(dokumente)` enthält `objekt_typ`,`objekt_id`; Indizes `idx_dokumente_objekt`, `idx_gebaeude_liegenschaft` existieren (sqlite_master-Check wie Test (a2)).
- (b) CRUD happy path: Liegenschaft anlegen → Gebäude darunter → Etage → Raum; IDs korrekt verkettet.
- (c) FK: `saveGebaeude` mit unbekannter `liegenschaft_id=987654` → `/FOREIGN KEY/i`.
- (d) ON DELETE CASCADE: Liegenschaft (ohne Belege) löschen → Gebäude/Etagen/Räume weg (`COUNT`=0).
- (e) Löschschutz: Beleg mit `objekt_typ='RAUM', objekt_id=X` speichern (baseDoc-Muster) → `deleteRaum(X)` rejected `/Belege/`; danach Raum deaktivierbar (`aktiv=0`).
- (f) CHECK-Constraints: `empfaenger_art='FALSCH'` → SQLite-Fehler; `aktiv=5` → Fehler.
- (g) getFullState: `state.objekte` enthält alle 4 Listen.
- (h) GoBD-Hashkette nach Belegspeichern mit objekt-Link weiterhin `valid=true`.

### tests/objekt_logik.test.js (pure, system-node-fähig)
- resolveEmpfaenger: direkt am RAUM / geerbt von ETAGE / von GEBAEUDE / von LIEGENSCHAFT / gar nicht (null) + `quelle`-Angabe.
- buildPfad-String exakt; getDescendantIds eines Gebäudes = eigene Etagen+deren Räume; summiereFlaechen inkl. Einheiten-Filter (m² nur).

### tests/objekt_historie.test.js (DB)
- DIREKT-Treffer: Beleg mit Objekt-Link erscheint; ohne Link nicht.
- Roll-up: Beleg am RAUM erscheint in Historie von Raum, Etage, Gebäude, Liegenschaft.
- Sortierung datum DESC; Deduplikation bei mehrfacher Match-Art.
- Historie einer Liegenschaft ohne Belege = [].

Akzeptanz gesamt: `npm test` grün (alle neuen + 14 alten Dateien).

---

## 7. SCHRITT-FÜR-SCHRITT-UMSETZUNG

Jeder Schritt = eigener kleiner Commit-fähiger Zustand; Checkpoint IMMER: `npm test` (bzw. `node --test tests/objekt_stamm.test.js` während der Arbeit an einem Bereich).

1. **Tabellen anlegen:** In `schema.js::createSchema` die 4 CREATE-Statements + Indizes (§1.2–1.5) ergänzen.
   ✅ Frische Test-DB bootet; `SELECT name FROM sqlite_master WHERE type='table'` enthält alle 4. `npm test` grün.
2. **Migration dokumente-Spalten:** In `runMigrations` die beiden ALTER-Blöcke (§1.6) + Index anlegen; in `main/audit.js` `calculateDocumentContentHash` um `objekt_typ`/`objekt_id` erweitern.
   ✅ Alte DB startet ohne Warning doppelt (Guard greift); `npm test` grün (gobd_protection/data_integrity müssen unverändert passen).
3. **dbAPI CRUD:** In `db.js` `saveLiegenschaft/deleteLiegenschaft/saveGebaeude/deleteGebaeude/saveEtage/deleteEtage/saveRaum/deleteRaum` + Löschschutz-Prüfungen + `getObjektBaum` + `getFullState`-Erweiterung (§1.7) implementieren (Transaktionsmuster db.js:748).
   ✅ Manuell per Node-Skript CRUD; `npm test` grün.
4. **Testdatei objekt_stamm.test.js** (§6) erstellen und grün machen.
   ✅ `node --test tests/objekt_stamm.test.js` grün; `npm test` grün.
5. **IPC + Preload:** 11 Handler in `main.js` (wrapHandler, deutsche Validierung) + Spiegel in `preload.js`.
   ✅ App startet, DevTools `await window.api.getObjektBaum()` liefert Struktur. `npm test` grün.
6. **Controller:** `controllers/ObjektController.js` mit §4-Funktionen (exports doppelt wie InvoiceController).
7. **Testdatei objekt_logik.test.js** erstellen und grün machen. ✅ Checkpoint.
8. **Navigation:** Sidebar-Eintrag (§3.1.1) + `viewConfig` + `views`-Array (§3.1.2).
   ✅ Klick „Objekte" zeigt leeren View-Container ohne JS-Fehler.
9. **View `view-objekte`:** KPI-Zeile + Toolbar + Grid-Gerüst in code.html einfügen (IDs §3.2).
10. **Renderer `js/objekte.js` Teil 1:** `renderObjekte()` (Liste aus `state.objekte`, Einrückung/Badges/Suche), `openObjektModal`, `saveObjektFromModal`, `toggleObjektAktiv`, `deleteObjektMitConfirm` (nutzt `dialog:confirm`); `<script src="js/objekte.js">` in code.html registrieren (Reihenfolge wie andere js/-Skripte).
    ✅ Liegenschaft/Gebäude/Etage/Raum per UI anlegen/bearbeiten/deaktivieren.
11. **Detail-View Gerüst:** `view-objekt-details` Header + 4 Tab-Buttons + 4 leere Panels + `switchObjektTab` (kopiertes Projekt-Muster).
12. **Renderer Teil 2:** `openObjektDetails/refreshObjektDetails` (ruft `db:getObjektDetails`), Stammdaten-Tab + Struktur-Tab rendern.
13. **Renderer Teil 3 – Historie-Tab:** `renderObjektHistorie` (§2.2-Antwort, Filter-Chips, Summenzeile, Beleg-Öffnung via bestehendem Editor-Öffnungsweg `openRechnungModal`).
14. **Editor-Anbindung:** Im Rechnungsmodal (code.html rechnung-form) Select `rechnung-objekt` (Optionen aus Objektbaum, Label = Pfad); beim Speichern `doc.objekt_typ/objekt_id` setzen; beim Laden vorhandener Belege vorbelegen.
15. **Testdatei objekt_historie.test.js** erstellen und grün machen. ✅ `npm test` GESAMT grün.
16. **Abrechnungspläne-Tab-Container:** statisches Panel + No-op-Hook `renderObjektPlaene` (F2-Vorbereitung). ✅ Tab klickbar, leerer Zustand sauber gerendert.

---

## 8. OFFENE FRAGEN / RISIKEN

1. **Objekt-Nummernkreis:** Soll `objekt_nr` auto-generiert werden (Muster KD-1000)? Plan sieht freies Feld vor – Entscheidung des PO nötig.
2. **Mehrere Mieter pro Raum/Stockwerk** (Mietverhältnisse mit Zeitraum von/bis)? Aktuelles Modell: genau 1 Empfänger je Knoten. Falls zeitliche Mietverhältnisse gewünscht → zusätzliche Tabelle `objekt_mietverhaeltnisse` (v2, NICHT Teil dieses Plans).
3. **Flächensumme:** `etagen` hat bewusst KEINE `flaechen_gesamt`-Spalte (immer live aus Räumen summiert) – ok so?
4. **Audit für Objektstamm:** Bewusst KEIN audit_logs-Eintrag für CRUD am Objektbaum (nur Belege sind GoBD-relevant). Falls der PO Vollständigkeit will: Aufwand klein, `entityType:'OBJEKT'` möglich.
5. **Risiko Hash-Änderung (main/audit.js):** Zwei neue Felder im Inhalts-Hash ändern ALLE künftig berechneten Hashes; gespeicherte `sha256_hash`-Spaltenwerte alter Belege stimmen nicht mehr mit Neuberechnung überein. Prüfung im Schritt 2: sicherstellen, dass kein Test/Pfad die gespeicherte Spalte gegen Neuberechnung vergleicht (aktueller Stand: Vergleiche immer frisch auf beiden Seiten – verifizieren!).
6. **Risiko code.html-Wachstum:** View-HTML wächst um ~250 Zeilen; Renderer in js/objekte.js halten, kein weiterer Inline-Code.
7. **Global Search / Notifications** ignorieren Objekte zunächst (F11 separat) – akzeptiert?
