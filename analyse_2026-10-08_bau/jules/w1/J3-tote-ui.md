# J3 — Tote UI ehrlich machen (kein toter Klick, kein falscher Toast)

> Copy-Paste-Prompt für Jules. Snapshot: Repo `C:\Users\walee\Desktop\server\Rechnungsprogramm_Geb_V2`, Base-Branch `bau-p0p1-base@194cd83` (lokal aus `main@194cd83`, 2026-10-08). Nach J0-Merge rebasen. Keine prod-DB.

**Titel:** J3 Tote UI ehrlich: Neue-Rechnung, Entsperren, Bulk-Mahn-Toast, Artikel-Kern
**Branch-Name:** `jules/j3-tote-ui`
**Base:** `bau-p0p1-base@194cd83` (nach J0-Merge: rebasen)
**Ziel:** Kein toter Klick, kein falscher „versendet"-Toast, Artikel im Kern auffindbar.

## Scope-Dateien (darf anfassen)
- `main.js:68` — `{ label: 'Neue Rechnung', click: () => {} }` tot → verdrahten (Rechnung-Modal öffnen via IPC/focus) ODER Menüpunkt entfernen + Shortcut `CmdOrCtrl+N` auf echte Funktion legen
- `preload.js:18` — `unlockDocument: () => Promise.reject(...)` Stub → ehrlich labeln („GoBD-gesperrt — Storno nutzen", Button deaktivieren mit Tooltip) ODER echten schmalen Status-Pfad nur falls GoBD-konform; kein Entsperren von Festgeschriebenem
- `js/dashboard/dashboard-actions.js:103-105` — Bulk-Mahnung `setTimeout`-Fake-Toast („erfolgreich versendet") → ehrlich: „generiert, Versandnachweis fehlt (J11)" + nur Status `Gemahnt` setzen, kein SMTP-Versprechen; Überfällig-Filter behalten
- `js/navigation.js:177-180` — `artikel` aus `EXPERIMENTAL_VIEWS` in Kern (`CORE_VIEWS`) holen + `js/artikel.js:112-468` unverändert lassen (nur Sichtbarkeit, kein CRUD-Umbau)
- `js/modal-loader.js:33`, `js/view-loader.js` — nur Labels/Tooltips anfassen falls nötig

Belege S2_MODULGAP §2-Zeilen 56, §3-Punkte 1,2,4,6; S3_ROADMAP §1.7.

## Out-of-scope (verboten)
- Keine E-Rechnung/Leitweg (J4), keine Bezahlt-Logik (J2), keine Schluss-Sperre (J1), kein `db.js`/`schema.js`, keine Mahn-SMTP-Implementierung (nur Ehrlich-Label, J11 folgt), keine `database.sqlite`, keine Dependencies.

## Schritte (nummeriert)
1. `git checkout bau-p0p1-base && git checkout -b jules/j3-tote-ui` (nach J0-Merge: `git rebase bau-p0p1-base`).
2. `main.js:68` fixen: Menü „Neue Rechnung" ruft denselben Pfad wie UI-Button „Neue Rechnung" (Rechnung-Modal) — oder Eintrag entfernen. Manuell: `CmdOrCtrl+N` öffnet Modal, kein No-Op.
3. `preload.js:18` fixen: UI-Button „Entsperren" deaktiviert + Tooltip „GoBD: gesperrt — bitte Storno (InvoiceController 627-669) nutzen". Kein stilles Reject ohne Erklärung.
4. `dashboard-actions.js:95-112` fixen: Bulk-`dunning` nur für `status==='Überfällig'` (bestehender Filter bleibt), Toast 1 „… wird generiert (kein Versandnachweis — folgt J11)" statt „erfolgreich versendet"; kein `setTimeout`-Erfolg ohne Beleg.
5. `navigation.js:177-180` fixen: `'artikel'` aus `EXPERIMENTAL_VIEWS` entfernen und in `CORE_VIEWS` aufnehmen; `getVisibleViews()`/`applyFocusMode()` unverändert — Artikel ohne Opt-in sichtbar.
6. Tests: `node --test tests/ui_fokusmodus.test.js tests/artikel_ui.test.js tests/frontend_ui_integration.test.js`; zusätzlich `grep -rn "click: () => {}" main.js` muss leer sein, `grep -rn "erfolgreich versendet" js/dashboard/` muss weg sein.
7. TEST-BAU-01-Smoke: Dashboard → Artikel geöffnet, Angebot 2500-Rechnungsklick öffnet Modal, Bulk-Mahnung auf F1-Rest-47 zeigt ehrlichen Toast.

## Exakte Testbefehle
```
node --test tests/ui_fokusmodus.test.js tests/artikel_ui.test.js tests/frontend_ui_integration.test.js
```

## TEST-BAU-01-Akzeptanz
- Angebot 2500/475/2975, N1 300/57/357, L1/F1 1300/247/1547, L2 2800/532/3332, F2 1500/285/1785, Teilzahlung 1500 → Rest 47, Schluss 0 — kein Betrag geändert; nur Klicks/Labels: kein toter Klick, kein falscher Versand-Toast bei F1-Mahnung.

## Quellen (alle Zugriff 2026-10-08)
| # | URL | Aussage |
|---|---|---|
| 1 | https://www.bauprofessor.de/mahnung/ | Mahnung + Nachfrist, Zugangsnachweis erforderlich — kein Toast als Nachweis |
| 2 | https://www.bauprofessor.de/abschlagszahlung-vob | prüfbare Aufstellung, Fälligkeit erst ab Prüfbarkeit |
| 3 | https://www.bauprofessor.de/abrechnung-von-bauleistungen/ | prüfbare Abrechnung §14 VOB/B / §650g BGB — Ehrlich-Label-Maßstab |
| 4 | https://baufaktura.de/anleitungen/baufaktura-e-rechnungen-erstellen | B2G-Flow-Vergleich (S2 §4.5) — kein falsches Versprechen |
| 5 | https://smarthandwerk.de/leistungsbeschreibungen | Dok-Arten-Maßstab AB/LS/Gutschrift (S2 §4.9) |

## PR-Anforderung
- Kleiner Diff (4 Dateien + Labels), Test-Output in PR, Screenshots/GIF der 3 Klicks erwünscht, offene Punkte (echter SMTP-Versand → J11) nennen.

## Summary (max. 15 Zeilen)
- Neue-Rechnung verdrahtet/entfernt, kein No-Op.
- Entsperren ehrlich gelabelt/deaktiviert (GoBD).
- Bulk-Mahn-Toast ohne Versandlüge.
- Artikel im Kern, kein Opt-in nötig.
- Tests ui_fokusmodus/artikel/frontend grün.
- Keine Logik-/Schemaänderung.
