# 00 — Gesamtübersicht W-Link ERP

**Version:** 1.0.5 (`package.json:2-5`) · **App-ID:** `com.wlink.erp` · **Start:** `electron .` (`package.json:7`), Fenster 1400×900 lädt `code.html` (`main.js:21-35,94`) · **Build:** `electron-builder`, NSIS oneClick perMachine (`package.json:13-29`) · **DB:** `better-sqlite3`, WAL + FK (`db.js:23-34`), Pfad `userData/database.sqlite` bzw. Repo-`database.sqlite` als Fallback (`db.js:5-21`).

## Architektur-Graph

```mermaid
graph TD
    subgraph DESKTOP["Electron Desktop (Main)"]
        MW["main.js<br/>createWindow, Menü DE,<br/>1556+ Zeilen"]
        IPC["setupIpc() main.js:150<br/>171x ipcMain.handle"]
        MAIL["main/email.js<br/>SMTP-Versand F10"]
        ZUG["main/zugferd-builder.js<br/>PDF/A-3 + XML"]
        AUD["main/audit.js<br/>GoBD-Hashkette"]
        BAK["main/backup.js<br/>Auto-Backup"]
        SYNC["main/sync-server.js<br/>Local-First Hub :38400"]
        SYNCFG["main/sync-config.js<br/>127.0.0.1 / TLS-Opt-in"]
    end
    subgraph RENDERER["Renderer (code.html + js/ + views/)"]
        NAV["js/navigation.js<br/>19 Views, Fokusmodus"]
        ED["js/editor.js<br/>Rechnungsformular,<br/>Totals, Export-Data"]
        PROJ["js/projekte.js<br/>Projekt-Center,<br/>Aufmaß/Nachtrag-Übergaben"]
        BANK["js/banking.js<br/>OPOS/SEPA-UI F11"]
        EINV["js/einvoice.js<br/>XRechnung/ZUGFeRD"]
        DATEV["js/datev.js<br/>StB-Export EXTF"]
        VIEWS["views/*.js (10)<br/>Invoice/Aufmass/EFB/..."]
    end
    subgraph DATA["SQLite (schema.js, 65 Tabellen)"]
        KERN[("dokumente<br/>positionen<br/>rechnung_verrechnungen")]
        BAU[("projekte, aufmass_blaetter/_zeilen<br/>nachtraege, bautagebuch<br/>invoice_cumulative_states<br/>security_retentions")]
        GELD[("bank_konten/_transaktionen<br/>zahlung_zuordnungen<br/>sepa_* , kunden")]
        GOBD[("audit_logs<br/>backup_history")]
        REST[("Objekte F1, Dauer-RG F2,<br/>Putzplan F3, Phase2-4 ...")]
    end
    subgraph MOBIL["PWA (pwa/)"]
        SHELL["index.html + sw.js<br/>App-Shell offline"]
        PDB["pwa-db.js (Dexie)<br/>lokale Offline-DB"]
        SW["sync-worker.js<br/>Push/Pull"]
        REB["reb-aufmass.js<br/>REB-Aufmaß mobil"]
        CAM["camera-engine.js<br/>Foto-Beweise"]
    end

    MW --> IPC
    IPC <-->|contextBridge window.api<br/>preload.js| NAV
    NAV --> ED & PROJ & BANK & VIEWS
    ED --> EINV
    ED & PROJ -->|db:saveDocument etc.| IPC
    EINV -->|invoice:export*| ZUG
    IPC --> AUD & BAK & MAIL & SYNC
    IPC <--> KERN & BAU & GELD & GOBD & REST
    SYNC <-->|HTTP 127.0.0.1:38400<br/>Pairing→Push/Pull/Foto/SSE| SW
    SW <--> PDB
    REB & CAM --> SW
```

## Kern-Flow (Zielbild Plan: Kunde → … → StB-Export)

```mermaid
flowchart LR
    K["Kunde<br/>js/kunden.js"] --> A["Angebot / LV<br/>editor.js, GAEB"]
    A --> P["Auftrag / Projekt<br/>js/projekte.js"]
    P --> M["Aufmaß + Nachtrag<br/>aufmass_blaetter,<br/>nachtraege"]
    M --> AR["Abschlags-RG<br/>kumulativ + Einbehalt"]
    AR --> Z["Zahlung / OPOS<br/>banking.js F11"]
    Z --> S["Schluss-RG<br/>Verrechnungen"]
    S --> X["Export: XRechnung/<br/>ZUGFeRD + DATEV/StB"]
```

Datei:Zeile-Anker pro Schritt stehen in [02-rechnungskern-flow.md](02-rechnungskern-flow.md).

## Modulstatus (freigegeben / experimentell / geparkt)

Quelle Fokusmodus: `js/navigation.js:168-180` (`CORE_VIEWS` / `EXPERIMENTAL_VIEWS`, Flag `experimental_module`, Standard **aus**).

| Status | Module (Views) | Bemerkung |
|---|---|---|
| **CORE = Pilot-Kern** | dashboard, kunden, angebote, projekte (+projekt-details), rechnungen, banking (OPOS-Anteil), berichte (StB-Export), einstellungen | Kern-Flow; aber: Prüfbericht-Urteil **FREIGABE NEIN** (7 P0-Lücken, s. 05) |
| **EXPERIMENTAL (Opt-in, Standard aus)** | objekte (F1), dauerrechnungen (F2), putzplan (F3), artikel, maengel, zeiterfassung, sync, grosshandel (IDS), sokabau | Produktiv vorhanden, aber „nicht pilotiert" (Plan P0.6) |
| **Geparkt (Pläne, nicht eingebaut)** | `plans/objektverwaltung-plan.md`, `daurerchnungen-plan.md`, `bankimport-opos-sepa-plan.md`, Phasen 1–5 u. a. | Dürfen nicht als Scope in P0/P1 einfließen (Plan, Anhang B) |
| **Explizit Nicht-Ziele** | FiBu/Lohn/Lager-Neubau, Frameworkwechsel, Multi-User/File-Share, E-Rechnungs-Empfang | Plan Stop-Regeln P0 |

**UNKLAR:** Ob `banking`-View intern zwischen freigegebenem OPOS-Kern und experimentellen SEPA/Banking-Erweiterungen trennt — `navigation.js` kennt nur View-Ebene, keine Teil-Flags.

## Datei-Verantwortung (Top-Level)

| Datei / Ordner | Verantwortung | Status | Prüfhinweis |
|---|---|---|---|
| `main.js` | Fenster, Menü, alle IPC-Handler, ZUGFeRD/XRechnung-Export, Sync-Autostart, Quit-Backup | Kern, aktiv | Export-Gates `main.js:1058-1066,1160-1166` prüfen (B-3) |
| `preload.js` | `window.api`-Brücke (contextIsolation an) | Kern, aktiv | Kongruenz zu `main.js`-Handles (Modulaudit: 0 fehlend) |
| `db.js` (~4900 Zeilen) | DB-Pfad, `dbAPI`, GoBD-Schreibschutz `applyDocumentWrite`, Transaktionen | Kern, aktiv | Guard nur bei `isLocked` (`db.js:106-118`) — B-6 |
| `schema.js` | 65 Tabellen + Migrationen + Seeds | Kern, aktiv | Sync-Migration setzt `auto_start=false` (Plan 0.2) |
| `controllers/` (22) | Fachlogik: Totals, Einbehalt, Banking, SEPA, EFB, GAEB, Mängel … | Gemischt | Doppelpfad Einbehalt (B-4): `InvoiceController` vs `CumulativeBillingController` |
| `views/` (10) + `js/` (22) | Rendering + Formularlogik | Gemischt | `InvoiceView.getFormData` kennt keinen `retentionMode` (B-4) |
| `main/` (10) | Sync-Server, Audit, Backup, Mail, ZUGFeRD-Builder, IDS, Mängel-PDF | Kern + experimental | Sync-Auth-Matrix OK (Prüfbericht O-2) |
| `pwa/` (11 js + Root-Shell + CSS) | Offline-Shell, Dexie-DB, Sync-Worker, REB-Aufmaß, Kamera | Experimental | SW-Cache-Risiko n. Update (Plan P0.1) |
| `tests/` (52 Suites) | Unit/Integration/Negativmatrix | Teilweise Mock-basiert | Übergabe-Tests nur String-Checks (B-7) |
