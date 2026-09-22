# Prüfung der Visual Map `doc/app-map/` — Audit 10.09.2026

**Auftrag:** Strenge Prüfung, ob die Map GENUG und KORREKT ist. Kein Produktcode geändert, kein Commit/Push.
**Geprüft:** Alle 8 Dateien (README.md, 00–05, app-map.html), stichprobenartig gegen Code verifiziert.
**Repo-Stand:** HEAD `31136c2` + uncommittete P0-Änderungen (u. a. `main.js`, `js/editor.js`, `js/einvoice.js`, `controllers/InvoiceController.js` — Zählungen trotzdem stabil, s. unten).

## 1. Zähl-Abgleich (behauptet → gemessen)

| Objekt | Map-Behauptung | Gemessen (10.09.2026) | Urteil |
|---|---|---|---|
| Views (`views`-Array `js/navigation.js:147-150`) | 19 | 19 | OK |
| `viewConfig`-Einträge (`js/navigation.js:3-145`) | 18 (`projekt-details` ohne) | 18 (inkl. `'objekt-details'` `:130`, ohne `projekt-details`) | OK |
| Dateien `views/*.js` | 10 | 10 | OK |
| Dateien `controllers/*.js` | 22 | 22 | OK |
| Eindeutige Tabellen `schema.js` | **64 (falsch)** | **65** (`CREATE TABLE IF NOT EXISTS (\w+)`, case-insensitiv, eindeutig) | **Abweichung −1 → in Map auf 65 korrigiert** |
| `ipcMain.handle` in `main.js` | 171 (`:181-1508`) | 171 (erstes `:181`, letztes `:1506`) | OK |
| Sync-HTTP-Routen `main/sync-server.js:574-630` | 8 (+ Aliase) | 8 (ping, info, pair, push, pull, unpair, photo-upload, events) + Alias `upload-photo` + Legacy-Rewrite `/api/sync/→/api/v1/sync/` (`:572`) | OK |
| Test-Suites `tests/*.test.js` | 52 | 52 (Namen sortiert verifiziert) | OK |
| P0-Befunde | 7 (+6 P1, 3 Hinweise, 4 OK) | Prüfbericht § 2: 7 P0 (B-1–B-7), 6 P1 (B-8–B-13), 3 H, 4 O | OK |

Details zur Tabellen-Abweichung: Die 03-Tabelle enthielt de facto bereits alle 65 Namen (Zeile 5 = `aufmass` + `aufmass_positionen`, Zeile 64 = `lieferscheine_digital` + `maengel`, #32 Platzhalter `—`), war aber als „64" überschrieben. Überschriften in `03`, `README`, `00` (2×), `app-map.html` (2×) auf **65** korrigiert.

## 2. Kriterien-Tabelle

| Kriterium | Urteil | Beweis | Fehlendes / Anmerkung |
|---|---|---|---|
| Vollständigkeit (Views/Controller/Tabellen/IPC/Sync-Routen) | **BESTANDEN** | 19/19 Routen in 01-Tabelle; 22/22 Controller in 03 §3.3 namentlich; 65/65 Tabellen in 03-Tabelle (nach Fix); IPC-Gruppen 03 listen alle 171 Kanäle namentlich mit Zeilenbereichen (Stichprobe: State/Stamm, Dokumente, Banking/SEPA gegen `main.js` plausibel); 8 Sync-Routen + Alias in 04-Tabelle | — |
| Korrektheit (Datei:Zeile belegbar, keine erfundenen Pfade) | **TEILWEISE → BESTANDEN nach Fix** | Verifiziert: `navigation.js:217` switchView, `:172-180` CORE/EXP, `:147-150` views; `editor.js:951/1497-1543` (`collectERechnungExportData`, `calculateRechnungTotals`, Filter `:1527-1530`, `{previousInvoices}` `:1542`); `einvoice.js:6` URN; `projekte.js:1261/1373`; `db.js:106-118/215-242`; `main.js:1050/1152/1252/1413`; `sync-server.js:574-630`; `sync-config.js` Host/TLS-Regeln. **3 Fehler gefunden und behoben** (s. § 3) | Nach Fix kein offener Korrektheitsfehler |
| Verständlichkeit (Mermaid valide, README-Anleitung nutzbar, HTML offline/klickbar) | **TEILWEISE** | Mermaid-Syntax in 00/01/02/03/04/05 manuell geprüft: `graph TD`, `flowchart LR/TD`, `sequenceDiagram`, `erDiagram` mit simplen Bezeichnern — valide, keine Sonderzeichen-Risiken; kein Renderer im Audit-Env, daher nicht gerendert. README-Schritte 1–6 alle mit korrekten Datei:Zeile-Ankern. HTML: **keine externen Refs** (nur 2× Treffer auf „http" als reiner SVG-Text `TLS`, kein CDN/`script src`/Stylesheet) → offline OK | (a) HTML-`.md`-Links öffnen per file:// nur Rohtext — Warnhinweis in HTML ergänzt, Rest: MD-Vorschau dokumentieren (Top-5/4). (b) Mermaid nie maschinell gerendert — Einmal-Render fehlt (Top-5/5) |
| P0-Abdeckung (alle 7 P0-Lücken verortet) | **BESTANDEN** | 05-Tabelle B-1–B-7 je mit Datei:Zeile + Map-Verweis + Plan-Verstoß, abgeglichen mit Prüfbericht § 2.1 (B-1 URN, B-2 KoSIT, B-3 DOM-statt-DB, B-4 Totals, B-5 Filter, B-6 Sperre, B-7 Persistenz); P1 B-8–B-13 + H-1–H-3 + O-1–O-4 vorhanden; B-2-Belegdateien (`doc/session_summary_…`, `doc/release/checklist.md`) existieren | — |
| UNKLAR-Markierungen berechtigt und aufgelistet | **TEILWEISE → BESTANDEN nach Fix** | Berechtigt verbleibend: 00 banking-OPOS/SEPA-Trennung (View-Ebene kennt keine Teil-Flags — zutreffend); 03 Phase-5-Tabellen ohne Controller/IPC (zutreffend, kein Treffer in `main.js`); 04 WS-Route vs. SSE (`:407-413` nur Auth-Fundstelle — zutreffend). **2 UNKLARs waren auflösbar und wurden behoben:** 01 `renderAngebote/renderRechnungen` → `js/dashboard.js:725/:129`; 04 ping/info-Auth → verifiziert offen (`:574-583` vor `:593`) | Kein unberechtigtes UNKLAR mehr offen |
| Wartbarkeit (bei Code-Änderung auffindbar) | **TEILWEISE** | Jede Map-Aussage trägt Datei:Zeile-Anker; Modulstatus-Quelle (`navigation.js:168-180`) und Migrations-Hinweis (03) vorhanden | Keine Re-Zähl-Anleitung (exakte `rg`-/PS-Befehle für 65/171/52) in README (Top-5/1); Tabellen-Nummerierung 03 bleibt krumm (Doppelnamen Zeile 5/64, Platzhalter #32) (Top-5/2); 02 Schritt 4a trennt legacy-`aufmass` nicht vom `blaetter`-System (Top-5/3) |

## 3. Direkt behobene Map-Fehler (nur `doc/app-map/`, kein Produktcode)

1. `01-navigation-views.md` — `renderAngebote`/`renderRechnungen` lagen nicht in `js/editor.js`, sondern in `js/dashboard.js:725` / `:129`. Mermaid-Knoten, Volltabelle (#2, #5) und Fußnote korrigiert; UNKLAR aufgelöst.
2. `03-daten-ipc-schema.md` + `README.md` + `00-uebersicht.md` (2×) + `app-map.html` (2×) — Tabellenzahl 64 → **65**, mit Herleitungs-Fußnote in 03.
3. `04-sync-pwa-map.md` — §4.1-Einleitung „außer `/pair`" → „außer `/ping`, `/info` und `/pair`"; ping/info-Zeile UNKLAR → „kein Auth (…, `:574-583`; offener Healthcheck)"; SSE-Limit „> 8" → „≥ 8 offene Kanäle → 429 beim 9. Stream (`:623`)"; B-12-Zeile analog.
4. `00-uebersicht.md` — `pwa/ (12+3)` → `(11 js + Root-Shell + CSS)` (gemessen: 11× `pwa/js`, 3× Root, 1× CSS).
5. `app-map.html` — Hinweis ergänzt, dass `.md`-Links per file:// Rohtext zeigen (VS-Code-Vorschau empfohlen).

## 4. Gesamt-Urteil

**GENUGEND: JA** — nach den 5 Fixes in § 3 ist die Map vollständig (alle Views/Controller/Tabellen/IPC/Sync-Routen namentlich), korrekt (alle Stichproben Datei:Zeile-belegbar, 3 Fehler behoben), P0-vollständig (B-1–B-7 + P1/H/OK verortet) und offline nutzbar (HTML ohne CDN). Verbleibende Punkte sind P1-artig (Top-5 unten) und blockieren den Map-Gebrauch nicht.

## 5. Top-5 Nachbesserungen (offen, mit konkreter Datei)

1. **Re-Zähl-Anleitung fehlt** — `doc/app-map/README.md`: reproduzierbare Befehle ergänzen (Bsp. `Select-String schema.js 'CREATE TABLE IF NOT EXISTS (\w+)' → unique-lower = 65`; `ipcMain.handle` = 171; `tests/*.test.js` = 52), damit bei Code-Änderung jede Zahl in < 5 Min nachzählbar ist.
2. **03-Tabellen-Nummerierung begradigen** — `doc/app-map/03-daten-ipc-schema.md`: Doppelnamen-Zeilen (5, 64) auftrennen und Platzhalter #32 entfernen, sodass die laufende Nummer bei 65 endet.
3. **Legacy- vs. Blaetter-Aufmaß trennen** — `doc/app-map/02-rechnungskern-flow.md` Schritt 4a: `aufmass`/`aufmass_positionen` (legacy, IPC `db:saveAufmass…`) von `aufmass_blaetter/_zeilen` (neu, IPC `…Blatt…`) in zwei Unterzeilen mit je eigenem IPC-Verweis trennen.
4. **HTML-Nutzbarkeit fertigstellen** — `doc/app-map/app-map.html`: P0-Tabelle um OK-Vermerke (4 OK aus Prüfbericht) ergänzen; Lesereihenfolge-Link auf README beibehalten (erledigter Rohtext-Hinweis reicht als Minimum).
5. **Mermaid einmal maschinell rendern** — alle 6 Graphen (`00` ×2, `01`, `02`, `03` ×2, `04`, `05`) in VS-Code/mermaid.live rendern und Render-Datum in `doc/app-map/README.md` vermerken (Audit konnte nur Syntax prüfen, kein Renderer verfügbar).
