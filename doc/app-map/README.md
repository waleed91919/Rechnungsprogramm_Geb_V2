# W-Link ERP — Visuelle App-Map (Index)

**Repo:** `F:\server\Rechnungsprogramm_Geb_V2` · **Stand:** 10.09.2026 (HEAD `31136c2` + P0-Änderungen, v1.0.5)
**Zweck:** Prüflandkarte des Gesamtsystems. Kein Code, nur Karten. Quelle ist ausschließlich im Code Gefundenes; Unsicheres ist als **UNKLAR** markiert.

## Dateien in `doc/app-map/`

| Datei | Frage, die sie beantwortet |
|---|---|
| [00-uebersicht.md](00-uebersicht.md) | Wie hängt alles zusammen? (Electron + SQLite + PWA/Sync, Kern-Flow, Modulstatus) |
| [01-navigation-views.md](01-navigation-views.md) | Welche Views/Routen gibt es, wo hängen sie im Menü, was ist CORE vs. EXPERIMENTAL? |
| [02-rechnungskern-flow.md](02-rechnungskern-flow.md) | Wie läuft Kunde → … → StB-Export? Welche Datei:Zeile rechnet/prüft pro Schritt? |
| [03-daten-ipc-schema.md](03-daten-ipc-schema.md) | Welche Tabellen, welche IPC-Kanäle, wie läuft Sync Push/Pull technisch? |
| [04-sync-pwa-map.md](04-sync-pwa-map.md) | Sync-Server-Routen + Auth, PWA-Module, TLS-Opt-in, Negativfälle? |
| [05-risiken-pruefpunkte.md](05-risiken-pruefpunkte.md) | Wo genau liegen die 7 P0-Lücken im Graph (Datei:Zeile)? |
| [app-map.html](app-map.html) | Klickbare Offline-Übersicht (reines HTML/SVG, keine CDN-Abhängigkeit) |

## Wie man die Map prüft (Empfohlene Reihenfolge)

1. **Gesamtbild:** `00-uebersicht.md` lesen, Mermaid-Graph rendern (z. B. VS-Code-Erweiterung oder mermaid.live).
2. **Navigation gegen UI halten:** `01-navigation-views.md` — jede `nav-<view>`-ID in `code.html` suchen, `switchView()` in `js/navigation.js:217` nachvollziehen.
3. **Kern-Flow Schritt für Schritt:** `02-rechnungskern-flow.md` — pro Schritt die angegebene Datei:Zeile öffnen und gegenrechnen (Abnahmetabelle aus Prüfbericht § 1).
4. **Daten & Kanäle:** `03-daten-ipc-schema.md` — Tabellen in `schema.js` suchen (`CREATE TABLE IF NOT EXISTS <name>`), IPC-Kanal in `preload.js` ↔ `main.js` gegenprüfen.
5. **Sync/PWA:** `04-sync-pwa-map.md` — Routen in `main/sync-server.js:574-630`, Config in `main/sync-config.js`.
6. **Befunde verorten:** `05-risiken-pruefpunkte.md` — jede P0-Lücke an der angegebenen Datei:Zeile öffnen und mit `doc/pruefbericht_2026-09-10_rechnungskern-p0.md` § 2 abgleichen.

## Kennzahlen (gezählt, nicht geschätzt)

| Objekt | Zahl | Quelle |
|---|---|---|
| Views (Routen in `js/navigation.js`) | **19** | `views`-Array `js/navigation.js:147-150` |
| `viewConfig`-Einträge | **18** (`projekt-details` ohne eigenen Eintrag — s. 01) | `js/navigation.js:3-145` |
| Dateien `views/*.js` | **10** | Verzeichnislisting |
| Dateien `controllers/*.js` | **22** | Verzeichnislisting |
| Eindeutige SQLite-Tabellen `schema.js` | **65** | `CREATE TABLE`-Namen, Duplikate aus Migrationsblock einmal gezählt (Zeilen 5+64 der 03-Tabelle je zwei Namen) |
| `ipcMain.handle` in `main.js` | **171** | Gezählt aus Code (`main.js:181-1508`); Modulaudit (03.09.) nannte 169 — Delta plausibel durch P0-Änderungen |
| Renderer→Main-Kanäle `preload.js` + 2 Push-Kanäle Main→Renderer (`datanorm:progress`, `ids:cartReceived`) | s. 03 | `preload.js`, `main.js:1250-1254,1413-1417` |
| Sync-HTTP-Routen | **8** (+ Aliase) | `main/sync-server.js:574-630` |
| Test-Suites `tests/*.test.js` | **52** (Plan nannte 47 — veraltet) | Verzeichnislisting |
| P0-blockierende Befunde | **7** (+ 6 P1, 3 Hinweise, 4 OK) | Prüfbericht § 2 |

## Gesamt-Urteil des Prüfberichts (Kontext, keine Map-Aussage)

`doc/pruefbericht_2026-09-10_rechnungskern-p0.md` § 0: **FREIGABE NEIN** — 7 × P0-blockierend. Lage jeder Lücke: [05-risiken-pruefpunkte.md](05-risiken-pruefpunkte.md).
