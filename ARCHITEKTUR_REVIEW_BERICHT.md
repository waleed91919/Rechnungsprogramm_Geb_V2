# W-Link: Umfassender Architektur- und Code-Review-Bericht

**Untersuchtes System:** W-Link (Rechnungsprogramm mit Handwerker-/ERP-Erweiterungen)  
**Repository:** `waleed91919/Rechnungsprogramm_Geb_V2`  
**Prüfbasis:** Lokaler Stand in `c:\Users\walee\Desktop\server\Rechnungsprogramm_Geb_V2`  
**Datum der Untersuchung:** 6. Oktober 2026  

---

## 1. Arbeitsgrundlage und Nachweise

### 1.1 Repository-Stand und Git-Metadaten
- **Aktueller Branch:** `main`
- **Vollständige Commit-SHA:** `c46f21236989d8c311cdae5261c2ef304007c4f4`
- **Commit-Nachricht:** `fix: enforce project code uniqueness and normalize display`
- **Git-Status:** Arbeitsverzeichnis sauber (`working tree clean`, HEAD synchron mit `origin/main`).

### 1.2 Untersuchungsmethode und Testausführung
- **Vollständige statische Code-Analyse:** Alle Kernbereiche (`main.js`, `preload.js`, `main/ipc/`, `db/`, `controllers/`, `js/editor/`, `views/`, `scripts/`) wurden zeilenweise inspiziert.
- **Isolierte Testausführung:** Die Test-Suite wurde über den projekteigenen Runner ausgeführt:
  ```bash
  node tests/run-all-tests.js
  ```
  **Ergebnis:** `TOTAL: 72 | PASSED: 72 | FAILED: 0 | SKIPPED: 0` (Dauer: ~11,8s).  
  Alle Tests liefen in einer isolierten In-Memory- bzw. Temp-SQLite-Umgebung, ohne persistente Produktionsdaten zu modifizieren oder externe Netzwerkdienste zu kontaktieren.

---

## 2. Projektstruktur und Dateigrößen

### 2.1 Übersicht der Schichten und Modulorganisation

Das Projekt gliedert sich in folgende Hauptbereiche:

```
Rechnungsprogramm_Geb_V2/
├── main.js                     # Electron Main Process Lifecycle & Fenstersteuerung (338 Z.)
├── preload.js                  # contextBridge API Definition & Exposition (241 Z.)
├── main/
│   ├── ipc/                    # Modulare IPC-Handler (13 Dateien, z. B. ipc-core.js, ipc-system.js)
│   ├── services/               # Hintergrunddienste (ZUGFeRD, PDF-Generator, Backup, E-Mail)
│   └── sync/                   # Peer-to-Peer & HTTP Sync Engine
├── db/
│   ├── schema/                 # 14 Schema-Dateien + index.js (1.749 Z.)
│   └── repositories/           # Datenzugriffsschicht (document_repo, finance_repo, sync_repo, etc.)
├── controllers/                # Fachlogik & Validierungsmodule (40 Dateien inkl. banking/, efb/, vob/)
├── js/
│   ├── editor/                 # Modulare Editor-Subsysteme (events/, save/, render, calc)
│   ├── view-loader.js          # In-Memory Template-Store für Views (2.680 Z.)
│   ├── modal-loader.js         # Generierter Bundle-Loader für Modals (204 Z., 323 KB)
│   └── navigation.js, etc.     # Routing und UI-Controller
├── views/
│   ├── partials/               # 19 View-HTML-Fragmente
│   └── modals/                 # 45 Modal-HTML-Fragmente + Domain-Bundles
├── scripts/                    # Wartungs- & Sync-Skripte (z. B. sync_modals.js)
└── tests/                      # 72 Test-Suites
```

### 2.2 Die größten selbst gepflegten Quellcodedateien

Zur sachlichen Beurteilung wurden die Quellcodedateien nach Zeilenzahl (LOC) und Byte-Größe analysiert und kategorisiert:

| Dateipfad | Zeilen | Größe | Kategorie | Primäre Verantwortung |
| :--- | :--- | :--- | :--- | :--- |
| `js/view-loader.js` | **2.680** | 165 KB | **HTML/Templates (JS-Bundle)** | Hält das globale `VIEW_TEMPLATES`-Objekt mit 19 Views im Renderer |
| `db/schema/index.js` | **1.749** | 68 KB | **Migrationsskript / DB** | Initialisierung & 1.150 Zeilen historischer Migrationscode |
| `js/kunden.js` | **815** | 35 KB | **Anwendungslogik (Renderer)** | Kundenverwaltung, DSGVO-Anonymisierung, UI-Rendering |
| `controllers/InvoiceController.js` | **678** | 27 KB | **Anwendungslogik (Fachlogik)** | Summenkalkulation, deutscher Feiertagskalender, Leitweg-ID |
| `db/repositories/document_repo.js` | **685** | 25 KB | **Datenzugriff** | Transaktionale CRUD-Operationen, GoBD-Audit-Log, Hash-Kette |
| `js/artikel.js` | **626** | 27 KB | **Anwendungslogik (Renderer)** | Artikelstamm-Verwaltung, UI-Rendering, Preisberechnung |
| `db/repositories/finance_repo.js` | **573** | 22 KB | **Datenzugriff** | Zahlungsströme, Kassenbuch, Mahnwesen, GuV/EÜR |
| `code.html` | **521** | 26 KB | **HTML (Hauptframe)** | Shell-Struktur, Script-Imports, Navigation, Modal-Container |
| `js/editor/editor-export.js` | **479** | 18 KB | **Anwendungslogik (Renderer)** | Druckvorbereitung, PDF-Export-Aufbereitung |
| `controllers/DatanormParser.js` | **452** | 19 KB | **Anwendungslogik (Fachlogik)** | Datanorm 4/5 Parser & Satzarten-Verarbeitung |
| `js/modal-loader.js` | 204 | **323 KB** | **Generierte Datei (Bundle)** | Automatisch erzeugter In-Memory-String für 45 Modals |

---

## 3. Architektur und tatsächliche Abhängigkeiten

### 3.1 Das Schichtenmodell in der Praxis

Das System implementiert im Kern einen sauberen Fluss über die Electron-Prozessgrenzen hinweg:

$$\text{Renderer (UI)} \xrightarrow{\text{window.api}} \text{Preload (contextBridge)} \xrightarrow{\text{ipcRenderer.invoke}} \text{Main Process (IPC-Handler)} \xrightarrow{\text{Module}} \text{Repositories} \xrightarrow{\text{better-sqlite3}} \text{SQLite DB}$$

**Befunde zu den Schichtverantwortungen:**
1. **`main.js` ist sauber und schlank (338 Zeilen):**  
   Enthält ausschließlich Lifecycle-Management, Fenster-Erstellung, Menü-Registrierung und das Einhängen der modularen IPC-Module aus `main/ipc/`. Keine Geschäftslogik in `main.js`.
2. **IPC-Handler sind überwiegend schlanke Adapter:**  
   Module wie `main/ipc/ipc-core.js` oder `main/ipc/ipc-projects.js` nehmen Argumente entgegen, validieren grundlegende Typen und delegieren sofort an Repositories (`document_repo`, `finance_repo`) oder Controller.
3. **Trennung Fachlogik vs. Datenzugriff:**  
   Die Datenhaltung ist strikt in `db/repositories/` gekapselt. Es existieren **keine unkontrollierten SQL-Queries im Renderer**. Sämtliche SQL-Statements werden über parametrisierte `better-sqlite3`-Statements in den Repositories ausgeführt.

---

### 3.2 Detail-Tracing der 5 Kern-Geschäftsprozesse

#### 1. Rechnung speichern
- **Aufrufer:** UI-Klick auf „Speichern“ im Dokumenten-Editor.
- **Renderer-Ablauf:**  
  `saveRechnung()` in [`js/editor/save/editor-save-rechnung.js`](file:///c:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/js/editor/save/editor-save-rechnung.js#L18-L95) sammelt Metadaten, Positionen und Zahlungsbedingungen.  
  Prüfung via `InvoiceController.validateSaveDocument()` (Zeile 31).  
  Aufruf von `window.api.saveDocument(docData)` (Zeile 42).
- **Preload & IPC:**  
  `preload.js` leitet an Kanal `save-document` weiter.  
  `ipc-core.js` nimmt den Aufruf entgegen und delegiert an `documentRepo.saveDocument()`.
- **Datenzugriff & Transaktion:**  
  [`db/repositories/document_repo.js`](file:///c:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/db/repositories/document_repo.js#L140-L245) führt den Schreibvorgang in einer **atomaren SQLite-Transaktion** (`db.transaction(...)`) aus:
  1. Insert/Update der Kopfdaten in Tabelle `documents`.
  2. Löschen alter Positionen und Neu-Insert in `document_items`.
  3. Automatische Fortschreibung des Audit-Logs mit SHA-256-Hash-Kette (`audit_logs`, `previous_hash` $\to$ `hash`).

#### 2. Rechnung abschließen / Stornieren & GoBD-Festschreibung
- **Funktion:** `storniereRechnung()` in [`db/repositories/document_repo.js`](file:///c:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/db/repositories/document_repo.js#L569-L602).
- **Ablauf:**  
  - Läuft in einer atomaren Transaktion:
    ```javascript
    const cancelTx = db.transaction((id, grund) => {
      // 1. Originalrechnung auf Status 'Storniert' setzen
      // 2. Gegen-Gutschrift atomar einbuchen
      // 3. GoBD-Audit-Log Eintrag mit Unveränderbarkeitsvermerk schreiben
    });
    ```
  - **Löschschutz:** Zeilen 430–435 in `document_repo.js` verhindern das Löschen festgeschriebener Rechnungen explizit:
    ```javascript
    if (doc.status === 'Festgeschrieben' || doc.status === 'Storniert') {
      throw new Error('Festgeschriebene oder stornierte Dokumente dürfen nicht gelöscht werden (GoBD).');
    }
    ```

#### 3. Angebot speichern und in Rechnung überführen
- **Angebot speichern:**  
  `saveAngebot()` in [`js/editor/save/editor-save-angebot.js`](file:///c:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/js/editor/save/editor-save-angebot.js#L1-L80) nutzt denselben Dokumentenfluss mit Typ `Angebot`.
- **Rechtliche Überführung (Workflow-Ebene):**  
  [`controllers/AngebotController.js`](file:///c:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/controllers/AngebotController.js#L75-L160):
  1. `registerAngebotVersand()`: Erstellt unveränderlichen Snapshot bei Angebotsversand.
  2. `acceptAngebot()`: Prüft Bindefrist; setzt Status auf `Angenommen`.
  3. `createProjektFromAngebot()`: Wandelt Positionen in Leistungsverzeichnis für die Baustelle/Projekt um.
- **Direkte UI-Konvertierung:**  
  Im Editor existiert `convertToRechnung()`, das das Angebot lädt, den Dokumententyp auf `Rechnung` ändert und eine neue Rechnungsnummer aus dem Nummernkreis zuweist.

#### 4. Dokument exportieren (ZUGFeRD / Factur-X PDF)
- **Funktion:** `exportZugferdPdf()` in [`main/ipc/ipc-system.js`](file:///c:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/main/ipc/ipc-system.js#L267-L395).
- **Integritätsprüfung (Zeilen 295–315):**  
  Das System verlässt sich **nicht** auf vom Renderer übermittelte Summen! Es lädt die Originaldaten via `documentRepo.getDocumentById(docId)` direkt aus der SQLite-Datenbank.  
  Stellt es eine Rundungsabweichung $> 0{,}02\,€$ zwischen DB-Berechnung und UI-Vorschau fest, bricht der Export mit einem Fehler ab.
- **Erzeugung:**  
  Generiert EN 16931-konformes XML (`zugferd.js`) und bettet dieses als PDF/A-3-Anhang in die Ausgabedatei ein.

#### 5. Sync-Vorgang (Peer-to-Peer & HTTP Push/Pull)
- **Engine:** [`main/sync/sync-engine.js`](file:///c:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/main/sync/sync-engine.js#L140-L245) (`handlePushSync()`).
- **Ablauf:**  
  1. HTTP POST an `/sync/push` mit JWT-Bearer-Token.
  2. Prüft Mutation gegen Idempotenz-Tabelle `sync_processed_mutations`.
  3. Führt Mutations-Schreibvorgang in lokaler SQLite-Transaktion aus.
  4. Bei Konflikten: Automatisches Quarantäne-Routing in `sync_conflicts` ohne Datenverlust.

---

## 4. HTML-Templates und Loader (Höchste Prüfpriorität)

### 4.1 Die Kernbefunde

Die Untersuchung von `code.html`, `js/view-loader.js`, `js/modal-loader.js` und `views/` deckt eine der kritischsten Schwachstellen der aktuellen Codebasis auf:

```
[views/partials/*.html]  -- (Kein Build-Skript!) -X->  [js/view-loader.js (VIEW_TEMPLATES)]
[views/modals/*.html]    -- (scripts/sync_modals.js) -> [js/modal-loader.js (MODAL_BUNDLE)]
```

#### Befund 1: Kritischer Template-Drift bei Views (`js/view-loader.js`)
- **Ursache:**  
  `code.html` wurde vor kurzem von einer monolithischen Datei auf 521 Zeilen verkleinert, indem 19 View-Bereiche nach `views/partials/view-*.html` ausgelagert wurden.
- **Tatsächliche Laufzeit:**  
  Zur Laufzeit lädt `js/view-loader.js` (2.680 Zeilen) die HTML-Fragmente **nicht** aus `views/partials/`, sondern greift auf ein fest im Code definiertes, riesiges JavaScript-Objekt `const VIEW_TEMPLATES = { ... }` zu!
- **Das Fehlen des Generators:**  
  Während für Modals das Skript `scripts/sync_modals.js` existiert (`npm run sync-modals`), gibt es **kein** `scripts/sync_views.js`!
- **Auswirkung:**  
  Wenn ein Entwickler Änderungen an den Quell-HTML-Dateien in `views/partials/` vornimmt, haben diese **keinerlei Auswirkung auf die laufende Anwendung oder Tests**, weil `js/view-loader.js` veraltet bleibt. Die Dateien sind bereits jetzt gefährlich asynchron!

#### Befund 2: Dreifache HTML-Redundanz bei Modals
- In `views/modals/` existieren 45 einzelne Modal-HTML-Dateien.
- Daneben existieren aggregierte Dateien: `views/modals/system-modals.html` (75 KB) und `views/modals/stammdaten-modals.html` (43 KB).
- Zur Laufzeit wird die automatisch generierte Datei `js/modal-loader.js` (323 KB) geladen.
- **Gefahr:** Bearbeitet ein Entwickler `system-modals.html` anstatt der Einzel-Modals, überschreibt `sync_modals.js` die Änderungen beim nächsten Build.

#### Befund 3: Event-Listener und Re-Initialisierung
- [`js/view-loader.js`](file:///c:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/js/view-loader.js#L2610-L2660):  
  Die View-Initialisierung puffert geladene Views in `loadedViews = new Set()`. Ein erneuter Aufruf von `loadView()` rendert den View nicht doppelt, verhindert aber auch das saubere dynamische Nachladen bei internen State-Resets.
- Maskierung: Dynamische Werte werden über `escapeHtml()` abgesichert; die DOM-Injection erfolgt über `innerHTML` in feste Container-IDs (`#app-content`, `#modal-container`).

---

## 5. Konkrete Kandidaten für weitere Modularisierung

Jeder in der Aufgabenstellung genannte Prüfkandidat wurde detailliert analysiert und nach folgendem Bewertungsschema eingestuft:

- **A:** So belassen (hohe Kohäsion, geringe Kopplung, angemessene Größe).
- **B:** Kleine interne Bereinigung reicht (z. B. Hilfsfunktionen aufräumen, keine Modulteilung nötig).
- **C:** In klar benannte Module aufteilen (zu viele unzusammenhängende Verantwortlichkeiten).
- **D:** Zuerst Zustand oder Schnittstellen entkoppeln, danach aufteilen.
- **E:** Generierte Datei / Bundle: Nicht manuell aufteilen, sondern Quellen oder Build prüfen.

### 5.1 Systematische Dateibewertung

| Datei | Zeilen | Aktuelle Verantwortung | Kohäsion / Kopplung | Empfehlung | Begründung & empfohlene Grenzen |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `controllers/InvoiceController.js` | 678 | Rechnungsberechnung, deutsches Feiertagsrecht, B2G Leitweg-ID Prüfziffer | **Niedrige Kohäsion** (3 völlig fremde Domänen) | **C** | **Dringend aufteilen:**<br>1. `InvoiceCalculator.js` (Zeilen 24–275)<br>2. `GermanCalendarService.js` (Zeilen 421–540: Osterformel, Feiertagsberechnung, Arbeitstage)<br>3. `LeitwegIdValidator.js` (Zeilen 548–620: ISO 7064 Mod 97-10) |
| `controllers/AngebotController.js` | 392 | Angebots-Workflow, Bindefristen, VOB-Überführung | Gute Kohäsion, fachlich fokussiert | **B** | **So belassen:** Fachlich klar umgrenzt; interne Hilfsfunktionen für Datumsberechnungen können künftig den neuen CalendarService nutzen. |
| `js/editor.js` | 194 | Fassade / Einstiegspunkt des Rechnungs-Editors | Hohe Kohäsion | **A** | **Optimal:** Dient als schlanke Fassade, die auf Subsysteme delegiert. Nicht weiter zerschlagen. |
| `js/editor/editor-events.js` | 72 | Event-Delegation an 8 Submodule | Hohe Kohäsion | **A** | **Optimal:** Delegiert sauber an `js/editor/events/*`. |
| `js/editor/editor-save.js` | 91 | Save-Routing an 5 Submodule | Hohe Kohäsion | **A** | **Optimal:** Delegiert sauber an `js/editor/save/*`. |
| `js/editor/editor-render.js` | 401 | Rendern von Positionszeilen, Tabellen, Drag&Drop-DOM | Gute Kohäsion | **B** | **Belassen:** Rein renderer-fokussiert; Aufteilung brächte DOM-Fragmentierung. |
| `js/editor/editor-export.js` | 479 | Vorbereitung Druckvorschau, ZUGFeRD-UI-Trigger | Gute Kohäsion | **B** | **Belassen:** Zusammengehörige Druck- & Exportlogik. |
| `js/editor/editor-calculation.js` | 232 | Renderer-Vorschau-Berechnungen (Live-Summen) | Gute Kohäsion | **B** | **Belassen:** Spiegelt Berechnungen für Sofort-Feedback im UI; nutzt gleiche Rundung wie Backend. |
| `js/editor/editor-state.js` | **0** | *Leere Datei (0 Bytes)* | Keine | **B** | **Bereinigen:** Datei ist eine Geisterdatei (0 Bytes). Löschen oder echten Editor-Zustand darin kapseln. |
| `main/email.js` | 143 | SMTP-Versand & Nodemailer-Anbindung | Hohe Kohäsion | **A** | **Belassen:** Sehr schlanker, klarer Infrastruktur-Service. |
| `main/backup.js` | 152 | SQLite-Backup via Vacuum & Zip | Hohe Kohäsion | **A** | **Belassen:** Schlank, robust, klar umgrenzt. |
| `main/ipc/ipc-system.js` | 404 | ZUGFeRD-Export, Auto-Update, Backup-IPC | Mittlere Kohäsion | **B** | **Belassen:** Bündelt System-IPC-Operationen; IPC-Aufteilung ist mit 13 Modulen bereits gut vorangeschritten. |
| `main/sync-server.js` | 141 | Lokaler HTTP-Express-Server für Sync | Hohe Kohäsion | **A** | **Belassen:** Schlanke Server-Initialisierung. |
| `main/sync/` | ~900 | Sync-Engine, P2P-Discovery, Mutationen | Hohe Kohäsion | **A** | **Vorbildlich:** Subsystem ist bereits sauber in Engine, Repo und Resolver getrennt. |
| `controllers/MaengelController.js` | 366 | Baustellen-Mängelmanagement, Fristen, Begehung | Gute Kohäsion | **A** | **Belassen:** Fachlich abgeschlossene Bautagebuch-/VOB-Domäne. |
| `controllers/DatanormParser.js` | 452 | Parsing von Datanorm-Satzarten | Hohe Kohäsion | **A** | **Belassen:** Typischer Parser-Zuschnitt; Aufteilung würde Parsing-Zustand zerreißen. |
| `controllers/SokaBauController.js` | 310 | SOKA-BAU Meldedateien & Arbeitsstunden | Hohe Kohäsion | **A** | **Belassen:** In sich geschlossener Fachstandard. |
| `js/kunden.js` | 815 | CRUD, DSGVO-Anonymisierung, Adress-Parsing, DOM | Gemischte Kohäsion | **C** | **Mittelfristig aufteilen:** DOM-Rendering (Tabelle/Modal) von DSGVO- und Validierungslogik trennen. |
| `js/artikel.js` | 626 | CRUD, Kalkulation, UI-Rendering | Mittlere Kohäsion | **B** | **Interne Bereinigung reicht:** Vorhandene Struktur ist stabil. |
| `js/navigation.js` | 338 | Client-Routing & View-Umschaltung | Hohe Kohäsion | **A** | **Belassen:** Schlankes Routing. |
| `js/utils.js` | 477 | Währungsformatierung, DOM-Hilfen, Datum | Gemischt | **B** | **Bereinigen:** Formatierer und DOM-Helpers intern sortieren. |
| `db/schema/index.js` | **1.749** | Schema-Bootstrapping & 1.150 Zeilen Migrationen | Hohe Kopplung | **D** | **Migrations-Pipeline entkoppeln:** Schemas sind modular (`db/schema/*`), aber `runMigrations()` ist ein riesiger monolithischer Block. Migrationen in nummerierte SQL/JS-Dateien (`migrations/001_...`) auslagern. |
| `js/view-loader.js` | **2.680** | In-Memory Template-Store für Views | Bundled Code | **E** | **Nicht manuell anfassen:** Skript `scripts/sync_views.js` erstellen, das `views/partials/*.html` liest und `view-loader.js` baut. |

---

## 6. Fachlogik und Datenintegrität

### 6.1 Berechnungen und Rundungsregeln
- **Verbindliche Single Source of Truth:**  
  Liegt serverseitig in [`controllers/InvoiceController.js`](file:///c:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/controllers/InvoiceController.js#L24-L275) (`calculateTotals()`).  
- **Rundungsdisziplin:**  
  Konsequente kaufmännische 2-Dezimalstellen-Rundung nach DIN EN 16931:
  $$\text{Rundung}(x) = \frac{\operatorname{round}(x \cdot 100)}{100}$$
- **Vorschau vs. Persistenz:**  
  `js/editor/editor-calculation.js` rechnet im Browser zeilengenau nach derselben Formel mit. Vor jedem Speichern und vor jedem ZUGFeRD-Export werden die Werte im Main-Process bzw. DB-Repository neu durchgerechnet.

### 6.2 GoBD-Konformität und Transaktionsgrenzen
- **Transaktionssicherheit:**  
  Alle schreibenden Kern-Operationen in `document_repo.js` laufen über synchrone Transaktionen von `better-sqlite3`. Ein Abbruch führt zum vollständigen Rollback; verwaiste Positionen oder unvollständige Belege sind ausgeschlossen.
- **Unveränderbarkeit & Audit-Trail:**  
  - Jede Dokumentenänderung generiert einen Eintrag in `audit_logs`.
  - Jeder Eintrag verlinkt kryptografisch via SHA-256 auf den Hash des Vorgängereintrags (`previous_hash` $\to$ `hash`), wodurch nachträgliche Manipulationen an der Datenbankhistorie sofort auffallen.
  - Das physische Löschen festgeschriebener oder stornierter Dokumente ist auf Datenbank-Ebene durch Programmlogik gesperrt.

---

## 7. Preload, IPC und Sicherheitsgrenzen

### 7.1 Electron-Sicherheitsarchitektur
In [`main.js`](file:///c:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/main.js#L78-L86) ist die `webPreferences`-Konfiguration vorbildlich gehärtet:
```javascript
webPreferences: {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: false // Sandbox aus wegen nativem better-sqlite3 Zugriff im Main
}
```

### 7.2 Befund: Preload-Wildcard `api.invoke`
- **Fundstelle:** [`preload.js`](file:///c:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/preload.js#L234):
  ```javascript
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)
  ```
- **Sicherheitsrisiko (Begründetes Risiko):**  
  Während 95 % aller IPC-Aufrufe über explizite, streng typisierte Methoden (`api.saveDocument`, `api.getCustomer`) definiert sind, öffnet Zeile 234 ein **generisches Wildcard-Tor**. Ein bösartiges oder kompromittiertes Renderer-Skript (z. B. durch XSS) könnte beliebige registrierte IPC-Kanäle des Main-Prozesses aufrufen, ohne dass der Preload-Filter greift.
- **Empfehlung:** `api.invoke` aus `preload.js` entfernen und die wenigen Stellen im Renderer, die es nutzen, auf benannte Preload-Methoden umstellen.

---

## 8. Tests und Build-Pipeline

### 8.1 Status quo der Tests
- **72 Test-Suites:**  
  Das Projekt verfügt über eine sehr solide Testabdeckung der Fachlogik:
  - Vollständige Integrationstests für Repositories (`document_repo`, `finance_repo`, `banking_repo`).
  - Unit-Tests für Berechnungen (`InvoiceController`, `AngebotController`).
  - Standardprüfungen für ZUGFeRD-XML-Generierung, EFB-Preise und VOB-Fristen.
- **Test-Charakter:**  
  Es handelt sich um **echte Ergebnisprüfungen** gegen SQLite-In-Memory-Datenbanken und Schema-Definitionen, nicht um reine Mock- oder Dateipräsenz-Tests.

### 8.2 Erkannte Test-Lücken
1. **Kein Test für Template-Integrität:** Es existiert kein Test, der prüft, ob `js/view-loader.js` identisch mit den HTML-Dateien in `views/partials/` ist.
2. **Fehlende CI-Pipeline:** Im Repository existiert kein `.github/workflows/`-Verzeichnis. Tests werden derzeit ausschließlich manuell lokal ausgeführt.

---

## 9. Direktes Gesamturteil

> **Zusammenfassendes Fazit:**  
> Die Architektur von W-Link ist **wesentlich reifer und stabiler** als typische Electron-Anwendungen dieser Größe.  
> Die früheren Refactorings (Aufteilung von `main/ipc/`, Zerlegung von `code.html`, Modularisierung der DB-Schemas und der Editor-Save/Event-Routinen) waren **keine kosmetische Code-Verschiebung**, sondern haben **echte architektonische Verantwortungsgrenzen** geschaffen.  
> 
> Das System ist **nicht von Spaghetticode durchzogen**, sondern folgt einem nachvollziehbaren Schichtenmodell mit robuster Transaktionsdisziplin und vorbildlicher GoBD-Hash-Kette.  
> 
> **Die akute Schwachstelle ist der Template-Build-Prozess:**  
> Während Modals automatisiert gebündelt werden, ist `js/view-loader.js` ein handgepflegter 2.680-Zeilen-Monolith, der von den eigentlichen Quell-Dateien in `views/partials/` entkoppelt ist.

---

## 10. Die 3 wichtigsten nächsten Maßnahmen

```mermaid
flowchart LR
    A["1. scripts/sync_views.js einführen (P0)"] --> B["2. InvoiceController entflechten (P1)"]
    B --> C["3. Preload api.invoke härten (P2)"]
```

### 1. Höchste Priorität (P0): Template-Drift beseitigen & `scripts/sync_views.js` erstellen
- **Problem:** `js/view-loader.js` (2.680 Zeilen) enthält veraltete In-Memory-Templates, während Entwickler in `views/partials/*.html` arbeiten.
- **Maßnahme:** Ein Skript `scripts/sync_views.js` erstellen (analog zu `scripts/sync_modals.js`), das `views/partials/*.html` einliest und `js/view-loader.js` automatisiert generiert.
- **Integration:** Einbinden als `npm run sync-views` und vor jeden Build/Start schalten.

### 2. Hohe Priorität (P1): `controllers/InvoiceController.js` modularisieren
- **Problem:** Feiertags-Kalenderrechnung (Osterformel) und B2G Leitweg-ID Checksummen blähen die Rechnungsberechnung auf 678 Zeilen auf.
- **Maßnahme:** Auslagerung in zwei unabhängige Module:
  - `controllers/GermanCalendarService.js` (Feiertage, Arbeitstage)
  - `controllers/LeitwegIdValidator.js` (ISO 7064 Prüfziffer)
- **Nutzen:** `InvoiceController.js` schrumpft auf < 300 Zeilen reine Rechnungsmathematik; Kalender und Validator werden isoliert testbar.

### 3. Mittlere Priorität (P2): Preload-Sicherheitslücke schließen
- **Problem:** Die Wildcard-Methode `invoke: (channel, ...args)` in `preload.js` Zeile 234 hebelt die Kapselung aus.
- **Maßnahme:** Entfernen von `api.invoke` in `preload.js`; Sicherstellen, dass alle Renderer-Aufrufe über benannte API-Methoden laufen.
