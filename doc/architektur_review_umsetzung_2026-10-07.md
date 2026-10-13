# Architektur-Review Umsetzung 2026-10-07

Basis: `ARCHITEKTUR_REVIEW_BERICHT.md` vom 06.10.2026. Vor Umsetzung per Subagenten verifiziert.

## 1. Verifikation des Berichts (Kurzfassung)

Zutreffend:
- `js/view-loader.js` ist In-Memory `VIEW_TEMPLATES`, `views/partials/` wird zur Laufzeit nicht geladen. `scripts/sync_views.js` fehlte, `scripts/sync_modals.js` + `npm run sync-modals` existierten.
- `preload.js:234` Wildcard `invoke` existierte und wurde in `js/gaeb_tender/tender_controller.js` 16x genutzt.
- Transaktionen in `db/repositories/document_repo.js`, `storniereRechnung`, GoBD-Grundidee.

Falsch/übertrieben (nicht umgesetzt, nur dokumentiert):
- Größen/Zeilen teils veraltet: `main.js` 219 statt 338, `js/kunden.js` 451 statt 815, `js/artikel.js` 474 statt 626, `controllers/DatanormParser.js` 556 statt 452, `main/ipc/ipc-system.js` 507 statt 404, `db/repositories/finance_repo.js` existiert nicht.
- Kein akuter View-Drift: alle 19 Views byte-identisch. Modals: 38 Einzel + 8 `*-modals.html` Bundles statt 45+2; `sync_modals.js:7` filtert Aggregate aus, überschreibt sie nicht.
- `main.js:23-30` hat `sandbox: true` (nicht `false`), `.github/workflows/tests.yml` existiert (CI vorhanden), `tests/run-all-tests.js` existiert nicht (Runner ist `npm test` = `node --test tests/*.test.js`).
- `InvoiceController.js` nicht in 3 fremde Domänen zerlegen: Steuer/Fälligkeit/B2G gehört zum Rechnungskern. Nicht umgesetzt.

## 2. Plan und Umsetzung (2 Subagenten + Hauptagent)

### A – Template-Drift verhindern (Subagent A)
- Neu: `scripts/sync_views.js` (analog `scripts/sync_modals.js`): liest `views/partials/view-*.html`, Key = Dateiname ohne `.html`, escapt `\`, Backtick, `${`, normalisiert CRLF, behält Loader-Logik `initViews/replaceWith` aus `js/view-loader.js:2649-2679`.
- `package.json`: nur +1 Zeile `"sync-views": "node scripts/sync_views.js"` neben `sync-modals`. Kein pre-Hook.
- Neu: `tests/view_templates_integrity.test.js` (node:test, nur fs/path): prüft pro Partial Key + normalisierten Inhalt in `js/view-loader.js`.
- Ergebnis: `node scripts/sync_views.js` regeneriert `js/view-loader.js` byte-identisch (204956 Bytes, sha256 `d5513fc7…`), 19 Templates, Test 3/3 grün.

### B – Preload härten (Subagent B + Fix Hauptagent)
- `preload.js`: Zeile 234 `invoke` entfernt, Kommentar angepasst, neu `listGaebImports: () => ipcRenderer.invoke('gaeb:list-imports')`. Rest (Zeilen 235-242) wiederverwendet, kein Duplikat zu `listTenderDrafts`.
- `js/gaeb_tender/tender_controller.js`: `getIpc()` prüft jetzt 8 benannte Methoden statt `window.api.invoke`; alle 16 Call-Sites ersetzt (Mapping siehe Changelog). `main/ipc/ipc-gaeb.js` Signaturen gegengeprüft.
- `scripts/test_renderer_ui.js:215,391` bewusst gelassen: Test-Helper mit anderem Kanal `gaeb:save-import`.
- Nacharbeit Hauptagent: Mocks in `tests/gaeb_x84_export.test.js:899-950` und `tests/gaeb_tender_view_regression.test.js:68-116` um benannte Methoden ergänzt (`listGaebImports`, `listTenderDrafts`, `loadTenderDraft`, `createTenderDraft`, `saveTenderDraft`, `cloneTenderDraft`, `validateX84Export`, `exportX84`), `invoke` als Fallback behalten.

## 3. Verifikation 07.10.2026

- `node scripts/sync_views.js` → `Found 19 view partials`, `Generated js/view-loader.js with 19 templates (199.9 KB)`.
- `node --test tests/view_templates_integrity.test.js tests/gaeb_x84_export.test.js tests/gaeb_tender_view_regression.test.js tests/gaeb_tender_pricing.test.js` → `tests 11 / pass 11 / fail 0`.
- `node --check preload.js` + `node --check js/gaeb_tender/tender_controller.js` → OK.
- Grep `api.invoke` in `js/` → 0 Treffer; `^\s*invoke\s*:` in `preload.js` → 0 Treffer.
- Full `node --test tests/*.test.js`: schlägt in dieser Maschine mit `ERR_DLOPEN_FAILED better_sqlite3.node (NODE_MODULE_VERSION 128 vs 141)` fehl – vorbestehendes Env-Problem (Electron-Build vs. System-Node), nicht durch diese Änderung verursacht. Gezielte Tests oben sind grün.

## 4. Benutzung

```bash
node scripts/sync_views.js
node scripts/sync_modals.js
node --test tests/view_templates_integrity.test.js
```

Bei jeder Änderung in `views/partials/*.html` erst syncen, dann testen. Modals: nur Einzeldateien editieren, keine `*-modals.html` (werden aus `scripts/create_domain_bundles.js` generiert).

## 5. Offen / bewusst nicht gemacht

- `InvoiceController.js`, `js/kunden.js`, `db/schema/index.js` nicht aufgespalten.
- `js/editor/editor-state.js` (0 Bytes) noch vorhanden.
- `ARCHITEKTUR_REVIEW_BERICHT.md` nicht korrigiert – Korrekturen stehen hier in Kapitel 1.
