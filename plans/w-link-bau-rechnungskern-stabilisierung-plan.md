# W-Link Bau: Rechnungskern-Stabilisierung — Entwicklungsplan

**Stand:** 10. September 2026
**Basis-Commit des Grundlagendokuments:** `3522ecc` (feat(vob): Bauprofessor-Module)
**HEAD bei Planerstellung:** `31136c2` (Merge fix/sync-security-hardening — Sync-Auth + Bautagebuch-XSS bereits gefixt)
**Grundlagendokument:** `doc/W-Link Produktentscheidung und Entwicklungsplan.md`
**Zielbild:** **„W-Link Bau: Angebote, Aufmaß und Bauabrechnung“** — Kern-Flow:
> Kunde → Angebot/LV → Auftrag/Projekt → Aufmaß/Nachträge → Abschlagsrechnung → Zahlung → Schlussrechnung → StB-Export

**Leitprinzip:** Einen vollständigen, zuverlässigen Arbeitsablauf liefern statt weitere Module anzubauen. Existierende Pläne in `plans/` (u. a. `objektverwaltung-plan.md`, `daurerchnungen-plan.md`, `bankimport-opos-sepa-plan.md`, Phasen-Pläne 1–5) werden **geparkt, nicht eingebaut** — sie dürfen weder als Abhängigkeit noch als Scope-Erweiterung in P0/P1 einfließen.

**Verbindliche Reihenfolge (P0):**
1. Einbehalt + Übergaben (Rechenwahrheit + Persistenz)
2. Belegfixierter Export + XRechnung 3.0
3. Release / Backup / E2E-Desktop
4. Sync **nur verifizieren** (Fix in HEAD bereits vorhanden — kein Funktionsausbau)

---

## 0. Verifizierter Ausgangszustand (Code-Befunde, HEAD `31136c2`)

Diese Befunde wurden am 10.09.2026 direkt im Code geprüft, nicht aus dem Grundlagendokument übernommen:

| # | Befund | Verifiziert in |
|---|---|---|
| 0.1 | **Sync-Auth gefixt:** `main/sync-server.js:593` — `if (route.startsWith('/api/v1/sync/')) req.syncSession = this.authenticate(req);` vor Push (`:595`), Pull (`:601`), Unpair (`:606`), Foto-Upload (`:612`), SSE (`:622`). `authenticate()` (`:303–313`) wirft 401 ohne Token/Device-ID, 403 bei Geräte-Mismatch. Host-/Origin-/Pfad-Guards (`:346, :351, :368`). Rate-Limit Pairing, Einmal-Token mit TTL, 8h-Sessions, Revoke bei Stopp. | `main/sync-server.js` (1211 Zeilen), `main/sync-config.js` (nur `127.0.0.1`/`0.0.0.0`, LAN erzwingt TLS, kein HTTP-Fallback — Server wirft in `:121/:124` bei Verstoß) |
| 0.2 | **Sync-Opt-in gefixt:** `main.js:1508–1516` startet nur bei `loadSyncConfig(db).autoStart`; `schema.js:1220–1232` resettet per Einmal-Migration auf `auto_start=false`, Host `127.0.0.1`, TLS aus. Standard in `sync-config.js`: Host `127.0.0.1`, Port 38400. | `main.js` (1556 Zeilen), `schema.js:1220ff`, `doc/sync-security.md` (153 Zeilen Doku) |
| 0.3 | **Bautagebuch-XSS gefixt:** `js/projekte.js:2165ff` (`loadProjektBautagebuch`) — lokale `text()`-Escape-Funktion, angewendet auf `wetter`, `personal_eigen_anzahl/-stunden`, `tagesbericht`, `vorkommnisse_behinderungen` (`:2190–2193`). Diff `3522ecc..HEAD` bestätigt genau diese Änderung. | `js/projekte.js` (2608 Zeilen), git diff |
| 0.4 | **Übergaben defekt (OFFEN):** `executeAufmassUebergabe()` (`js/projekte.js:1261–1294`) mutiert nur `state.dokumente`-Objekt im `UPDATE_EXISTING`-Zweig (`:1274–1284`, kein `saveDocument`/IPC-Persistenz), `else`-Zweig zeigt nur Toast (`:1286`). `applyApprovedNachtraegeToCurrentInvoice()` (`:1305–1321`) berechnet `invoicePositions` via `NachtragController.extractApprovedPositionsForInvoice`, zeigt nur Toast (`:1317`), übernimmt nichts in eine Rechnung. | `js/projekte.js:1261–1321` |
| 0.5 | **Doppelte Einbehalt-Logik (OFFEN):** `controllers/InvoiceController.js` (499 Zeilen, `calculateTotals`, Einbehalt `:108–126`, Steuer `:128–203`, Zahlbetrag `:205–206`) kennt **keine** `previousRetention`-Verrechnung — Einbehalt wird auf das volle aktuelle Netto neu berechnet. `controllers/CumulativeBillingController.js` (223 Zeilen) rechnet kumulativ korrekt (`totalRetentionTarget − previousRetentionTotal`, `:46–76`), wird aber im Rechnungsformular **nicht** verwendet: `views/InvoiceView.js:258` (`handleInputEvent`) und `js/editor.js:1491–1513` (`recalculateRechnungTotals`) rufen ausschließlich `InvoiceController` auf. Beispiel aus dem Grundlagendokument (2 Abschläge à 100 €, 5 %): 15 € statt 10 € Einbehalt. Zusätzlich: Kumulativ-Controller zieht Periodenleistung als `L_t − Σ F_i` über **Rechnungsbeträge** (`:31–36`), nicht über Zahlungen — OPOS-Abgleich fehlt. | `controllers/InvoiceController.js`, `controllers/CumulativeBillingController.js`, `views/InvoiceView.js:142–260`, `js/editor.js:1491–1513` |
| 0.6 | **E-Rechnung veraltet + beleglos (OFFEN):** `js/einvoice.js:5` `GUIDELINE_XRECHNUNG_23 = '…xrechnung_2.3'`; verwendet in `:317` (Profilinfo) und `:336` (`generateXRechnungXML`). Tests zementieren 2.3 (`tests/bau_erp.test.js:141,150`, `tests/zugferd.test.js:170,174`). Aktuell ist **XRechnung 3.0 / KoSIT-Bundle 3.0.2 (Summer 2026, 31.08.2026)**. `collectERechnungExportData()` (`js/editor.js:951–994`) baut Export aus **Formularfeldern ohne Beleg-ID**; Main-Handler protokollieren mit `entityId: 0` (`main.js:1122,1184`). | `js/einvoice.js` (562 Zeilen), `js/editor.js:951–1090`, `main.js:1122,1184` |
| 0.7 | **Monolithen:** `db.js` 4937 Zeilen / ~251 kB, `main.js` 1556 Zeilen, `js/editor.js` 2405 Zeilen, `js/projekte.js` 2608 Zeilen. Kein Frameworkwechsel in diesem Plan (Nicht-Ziel). | Dateigrößenmessung 10.09.2026 |
| 0.8 | **Tests:** 47 `tests/*.test.js`-Dateien, `npm test` = `node --test tests/*.test.js`. Sync-Security-Suites neu in HEAD (`tests/sync_server_security.test.js` 595 Zeilen, `tests/sync_client_security.test.js` 246 Zeilen). `tests/frontend_ui_integration.test.js` nutzt Mocks (`mockAggregatedAufmass`, `mockInvoicePositions`) statt echter Electron-Oberfläche. Kein E2E-Desktop-Test, kein KoSIT-/veraPDF-Lauf im Repo. | `package.json:scripts`, `tests/` |

---

## Phase P0 — Jetzt: Sicherer, prüfbarer Rechnungskern

> Reihenfolge beachten: **P0.2 → P0.3 → P0.4 → P0.5 → P0.6**, P0.1 (Sync-Verifikation) parallel und zuerst abschließbar, da nur noch Nachweis fehlt.

### P0.1 Sync-Verifikation (nur Nachweis — kein Ausbau, kein Refactor)

Der Fix ist in HEAD (`31136c2`) enthalten. Diese Aufgabe **verifiziert** ihn und macht ihn releasefest. Jede Abweichung → Bugfix vor Release, aber kein neues Feature.

**Betroffene Dateien:** `main/sync-server.js`, `main/sync-config.js`, `main.js` (`:1349–1368`, `:1508–1516`), `schema.js` (`:1220–1232`), `views/SyncView.js`, `pwa/js/sync-worker.js`, `pwa/js/sync-bundle.js`, `tests/sync_server_security.test.js`, `tests/sync_client_security.test.js`, `doc/sync-security.md`.

**Aufgaben:**
1. **Negativtests erweitern/laufen lassen:** unauthentifizierter Push/Pull/Foto-Upload/SSE → 401; falsche Device-ID → 403; abgelaufener/wiederverwendeter Pairing-Token → 403 und kein zweites Pairing mit demselben Token; widerrufene Sitzung (Hub-Stopp) → 401; Schreibversuch auf fremdes `device_id` verändert keine DB-Zeilen (Vorher/Nachher-Hash der Tabellen).
2. **Foto-Pfad:** Upload-Limits (Größe, Typ, Anzahl), Symlink-/Traversal-Abwehr (`sync-server.js:984,1018,1111–1125`) per Negativtest (Symlink-Upload-Verzeichnis, `../`-Dateiname, Dotfile) → 403, keine Datei auf Platte.
3. **SSE/WS:** unauthentifizierter `GET /api/v1/sync/events` → 401; > 8 Streams pro Session → 429; nach `stop()` keine offenen Sockets (`pendingUploads`/Sockets-Leak-Check).
4. **TLS-Opt-in:** LAN (`0.0.0.0`) ohne TLS → Config-Validierung wirft, Server startet nicht, kein HTTP-Fallback; Loopback-HTTP nur an literaler `127.0.0.1`; Zertifikat abgelaufen/falscher Key → Startfehler mit verständlicher Meldung (kein stiller HTTP-Fallback).
5. **Windows-Smoke (Echtlauf, kein Mock):** frisches Profil → Sync aus/Loopback; Opt-in setzen → starten; PWA koppeln → Push/Pull einer Zeiterfassung + Foto; Hub stoppen → Sitzung tot; altes Profil (autoStart=true) → Migration setzt `false` + `127.0.0.1` (vgl. `schema.js:1224–1231`).

**Acceptance Criteria (messbar):**
- [ ] `node --test tests/sync_server_security.test.js tests/sync_client_security.test.js` grün + mindestens 6 neue Negativtests (401/403-Matrix, Token-Reuse, Fremd-Device-Write, Symlink-Upload, SSE-ohne-Auth, Stopp-Revoke) alle grün.
- [ ] Kein `/api/v1/sync/*`-Handler außer `/pair` ohne `authenticate()` erreichbar (statischer Router-Check im Test: jede neue Route fällt per Default durch Auth).
- [ ] Windows-Smoke-Protokoll (Build-Nummer, Profil-Pfad, Schritte, Screenshots/Logs) liegt unter `doc/release/` und ist wiederholbar.

**Tests:** Unit/Integration (Node `node:test`, supertest-ähnlich gegen echten `SyncServer` mit Test-DB) + manueller Windows-Smoke (Checkliste). Kein Playwright nötig für P0.1.
**Risiken:** PWA-Service-Worker-Cache nach Update (alte Shell mit altem Token-Flow) → Doku-Schritt „PWA online öffnen, Update abwarten“ aus `doc/sync-security.md` in Smoke-Checkliste übernehmen.
**Nicht-Ziele:** Rollen/Rechte-Modell, Multi-User-Konfliktlösung, Zertifikatsassistent, WAN/Internet-Freigabe, neue Sync-Entitäten.

---

### P0.2 Eine Rechenwahrheit: Einbehalt + kumulative Kette (ERSTE Baustelle)

**Problem (verifiziert):** Zwei Einbehalt-Implementierungen; das Formular nutzt die falsche (nicht-kumulative). Zusätzlich trennt niemand sauber Leistung / Faktura / Zahlung / Einbehalt.

**Betroffene Dateien:** `controllers/InvoiceController.js`, `controllers/CumulativeBillingController.js`, `views/InvoiceView.js` (`:142–260`), `js/editor.js` (`:125–420` Initialisierung, `:1491–1513` Totals, `:1519ff` Speichern/Sperrlogik), ggf. `db.js` (OPOS-/Zahlungs-Lesepfade), `tests/invoice_controller.test.js`, `tests/retention_vob_rules.test.js`.

**Aufgaben:**
1. **Eine Berechnungsquelle definieren:** `CumulativeBillingController.calculateCumulativeInvoice` wird die einzige Einbehalt-Logik für Bau-Abrechnungen (kumulativ: `Ziel-Einbehalt(L_t) − bereits einbehalten`), `InvoiceController.calculateTotals` delegiert den Einbehalt dorthin oder übernimmt `previousRetentionTotal` als Pflichtparameter. Doppelte `calcRetention`-Pfadlogik (`InvoiceController.js:108–126`) entfernen; VOB/A-§9c-Hinweis und `EXECUTION`-Deckel (`maxRetentionRate` auf `contractTotalNet`) genau einmal implementieren. `round2`-Rundung an einer Stelle (`InvoiceController.round2`).
2. **Verrechnungs-Input vervollständigen:** Der Editor übergibt heute nur `abzugsbetrag_netto`-Summen (`InvoiceController.js:92–95`). Zusätzlich `previousRetentionTotal` (Summe Einbehalte aller Vorgänger-Abschläge desselben Projekts) aus gespeicherten Belegen laden und übergeben — nie aus Formular-State raten.
3. **Zahlung vs. Faktura trennen (OPOS):** Schlussrechnung und OPOS lesen drei getrennte Summen: (a) kumulierte Leistung `L_t`, (b) bereits fakturiert `Σ F_i`, (c) tatsächlich gezahlt (Zahlungseingänge) + (d) einbehalten. Kumulativ-Formel bleibt `F_t = L_t − Σ F_i` für die Periodenleistung; der **Zahlbetrag/Saldo** berücksichtigt zusätzlich Zahlungen und Einbehalt-Freigaben. Keine Doppelzählung: Nach Schlussrechnung muss Projekt-OPOS = offene Forderungen sein.
4. **Abnahmetabelle als Regressionstest** (Pflicht-Fixture, exakt diese Werte):
   - Auftragssumme netto 1.000 €, 19 % USt, Einbehalt 5 %, Modus `EXECUTION`, kein §13b.
   - Abschlag 1: `L_1 = 100 €` → Einbehalt 5 €, Zahlbetrag 114 €.
   - Teilzahlung 50 € auf Abschlag 1.
   - Abschlag 2: `L_2 = 200 €` (kumuliert), Verrechnung 100 € netto → **Perioden-Einbehalt 5 €** (kumuliert 10 €), Zahlbetrag 109 €. Summe beider Zahlbeträge = 223 € bei kumuliert 10 € Einbehalt — der alte Bug (15 €) muss rot testen, der Fix grün.
   - Genehmigter Nachtrag +100 € → `L_3 = 300 €` → Einbehalt kumuliert 15 €, Perioden-Einbehalt 5 €.
   - Schlussrechnung über `L = 300 €`: Periodenleistung, Verrechnungen aller Abschläge, Teilzahlung angerechnet, Rest-Einbehalt ausgewiesen; OPOS danach = Schlusszahlbetrag − 0 (bzw. exakt offene Differenz).
   - Freigabe: Einbehalt wird per Storno-/Freigabe-Beleg (gesperrter Originalbeleg, neuer Beleg) aufgelöst, nicht per Edit.

**Acceptance Criteria (messbar):**
- [ ] Genau **ein** Einbehalt-Codepfad: statischer Check/Test, dass `InvoiceController` keinen eigenen `raw = baseNet * prozent`-Pfad mehr enthält bzw. zwingend `previousRetentionTotal` einbezieht.
- [ ] Abnahmetabelle (oben) als Test-Fixture grün bis auf den Cent: `Σ Periodeneinbehalte == kumulativer Zieleinbehalt` in jedem Schritt; `Netto + Steuer == Brutto` je Beleg; Formular-Anzeige == gespeicherter Beleg == PDF == XML-Zahlbetrag.
- [ ] OPOS-Test: nach Schlussrechnung `OPOS(Project) == Σ Zahlbeträge − Σ Zahlungen − freigegebene Einbehalte` (±0,00 €).
- [ ] `npm test` vollständig grün; alte 2.3-/Bug-erwartende Assertions angepasst, nicht gelöscht ohne Ersatz.

**Tests:** Unit (`invoice_controller`, `retention_vob_rules`, neu: `cumulative_retention_chain.test.js` mit Abnahmetabelle), Integration (Speichern→Reload→Weiterberechnen über echte DB), E2E-Desktop in P0.5 (Kette durchklicken).
**Risiken:** Bestandsbelege mit altem (falschem) Einbehalt → Migrations-/Korrekturregel nötig (Storno statt Edit; Hinweis im Release-Notes-Changelog). Steuer auf volles Netto trotz Einbehalt (§13 UStG, bereits in `:134–159` korrekt) darf beim Refactor nicht verloren gehen → eigener Steuertest mit Einbehalt ≠ 0.
**Nicht-Ziele:** Neue Steuersätze/Logik, §13b-Änderungen, Skonto/Mahnung, Teil-/Schlussrechnungs-Automatik über diese Kette hinaus.

---

### P0.3 Übergaben reparieren: Aufmaß + Nachtrag persistieren (ZWEITE Baustelle, mit P0.2 zusammen zuerst)

**Problem (verifiziert):** Erfolgs-Toast ohne Speichern; keine Reload-Festigkeit; keine Sperrprüfung.

**Betroffene Dateien:** `js/projekte.js` (`:1261–1321`, Modal `:1230–1260`), `js/editor.js` (Positions-/Verrechnungs-State, `saveRechnung`), `controllers/NachtragController.js` (`extractApprovedPositionsForInvoice`), `db.js`/`main.js` IPC (`db:saveDocument`, `db:updateDocumentStatus`, ggf. neuer `mergeAufmass`-Persistenzpfad), `views/*` (Übergabe-Modal), `tests/frontend_ui_integration.test.js` (Mock-basiert — ersetzen/ergänzen).

**Aufgaben:**
1. **`executeAufmassUebergabe` persistieren:** `UPDATE_EXISTING` lädt Beleg per IPC, setzt Mengen aus `mergeSchlussaufmass`, schreibt **Herkunftsbezug** je Position (`aufmass_blatt_id`, `oz_code`, übernommene Menge, Zeitstempel), speichert via `db:saveDocument`, lädt neu und zeigt Nachweis (Diff: Position, alt→neu, Quelle). `CREATE_NEW` erzeugt echten Beleg-Entwurf (Typ aus `zielTyp`) mit denselben Herkunftsbezügen statt nur Toast. Fehler (Beleg gesperrt/storniert, leeres Aufmaß) → blockierender Hinweis, kein Toast-Erfolg.
2. **`applyApprovedNachtraegeToCurrentInvoice` übernehmen:** genehmigte Nachträge (`status === 'GENEHMIGT'`) werden als Positionen in die **aktuelle Rechnung im Editor-State + Persistenz** übernommen (Positions-Text mit Nachtrags-Referenz `nachtrag_id`, Preis/Menge aus `extractApprovedPositionsForInvoice`), danach `recalculateRechnungTotals` + Speichern. Doppel-Übernahme verhindern (Idempotenz-Key `nachtrag_id` pro Rechnung).
3. **Sperrlogik:** gesperrte (`isLocked`) / stornierte / festgeschriebene Belege lehnen jede Übergabe ab (Prüfung in Renderer **und** Main/IPC — Renderer allein reicht nicht). Entsperren nur mit Grund + Audit-Eintrag (`appendAuditLog`), nie still.
4. **Reload-Test als Pflicht:** Aufmaß/Nachtrag übernehmen → speichern → App schließen → neu öffnen → Mengen, Preise, Herkunftsbezüge, Nachtragspositionen unverändert; gesperrte Rechnung nicht editierbar.

**Acceptance Criteria (messbar):**
- [ ] Nach Übergabe steht ein **gespeicherter** Beleg in der DB (per `SELECT` nachweisbar: Mengen = `mergeSchlussaufmass`, Herkunftsfelder gesetzt, Nachtragspositionen mit `nachtrag_id`).
- [ ] Reload-Test (App-Neustart mit frischem Profil + Seed-DB) grün: alle Werte ±0,00 € identisch; Herkunftsbezüge vorhanden.
- [ ] Negativtests: Übergabe auf gesperrten/stornierten Beleg → blockiert + Audit-Eintrag beim Entsperrversuch; doppelte Nachtragsübernahme → keine Duplikate.
- [ ] Kein „Erfolgs“-Toast ohne erfolgte Persistenz (Code-Review-Check: jeder Erfolgs-Toast im Übergabe-Pfad folgt auf await-Persistenz + Reload-Read).

**Tests:** Unit (Idempotenz, Sperrprüfung), Integration (IPC save→get→reload gegen Test-DB), E2E-Desktop (P0.5-Skript schließt echten Neustart ein). Bestehenden Mock-Test in `frontend_ui_integration.test.js` durch persistenzprüfenden Test ergänzen (Mock-Test darf bleiben, zählt aber nicht als Nachweis).
**Risiken:** `mergeSchlussaufmass`-Aggregation vs. Einzelblatt-Herkunft (Rundung pro Blatt vs. Summe) → Herkunft je **Blattzeile**, Rundung erst auf Positionsebene, Test mit krummen Mengen (z. B. 3 × 0,333).
**Nicht-Ziele:** Aufmaß-Neukonzeption, DA11/GAEB-Änderungen, mobile Aufmaß-Erfassung.

---

### P0.4 E-Rechnung: belegfixiert + XRechnung 3.0 (DRITTE Baustelle)

**Problem (verifiziert):** Export aus ungespeichertem Formular-State + veraltetes Profil 2.3 + kein externer Validator-Nachweis.

**Betroffene Dateien:** `js/einvoice.js` (`:5, :312–336, :359ff` `buildCII`), `js/editor.js` (`:951–1090` Export-Handler), `main.js` (`:1100–1200` Export-IPC), `views/InvoiceView.js`, `tests/bau_erp.test.js` (`:141,150`), `tests/zugferd.test.js` (`:170,174`), `doc/zugferd-validation.md`.

**Aufgaben:**
1. **Belegfixierung (zuerst):** Produktiver XML-/ZUGFeRD-Export nur aus **gespeichertem + festgeschriebenem** Beleg (`id != null`, `isLocked`/Status final). `collectERechnungExportData()` bekommt Pflicht-`belegId` und lädt den Beleg aus der DB statt aus DOM-Feldern; Export-IPC verweigert `entityId: 0`/ungespeicherte Docs mit Fehler. Entwurfsvorschau (ungespeicherte Ansicht, Wasserzeichen „ENTWURF — nicht versandfähig“) bleibt getrennt und erzeugt **keine** versandfähige Datei.
2. **XRechnung-3.0-Abgleich (kein reiner String-Tausch):** `GUIDELINE_XRECHNUNG_23` → 3.0-Leitweg (`urn:…:xrechnung_3.0`), aber zusätzlich: alle EN-16931-/Schematron-Regeldeltas aus KoSIT-Bundle **3.0.2** prüfen (Pflichtfelder, BT/BG-Kardinalitäten, Steuersatz-/Rundungsregeln, B2G-Leitweg-ID, §13b-Angaben, Anhang-Referenz für LV-Anlage nach BMF-Praxis: Gewerke-Summen im strukturierten Teil + referenzierte LV-Anlage). Unit-Code-Mapping (`mapUnitToUNECERec20`) gegen 3.0-Regeln revalidieren.
3. **Externe Validatoren pro Release archivieren:** repräsentative Fixtures (mind. Standard-B2B netto, §13b, B2G mit Leitweg-ID, Schlussrechnung mit Verrechnungen/Einbehalt, Gutschrift/Storno) gegen **KoSIT-Validator mit Bundle 3.0.2** prüfen; ZUGFeRD zusätzlich XML-/Hybridvalidator + **veraPDF** (PDF/A-3). Pro Release archivieren: Validator-Version, Bundle-Version, Fixture-XMLs, Vollberichte (kein „bestanden“-Screenshot).
4. **Sichtabgleich + Fehler-Blocker:** PDF-Sichtseite == XML == gespeicherter Beleg (Netto/Steuer/Brutto/Zahlbetrag, Leitweg-ID, Rechnungsnummer/Datum); ungültige Exporte werden mit **konkreter** Meldung blockiert (Feld + Regel-ID, z. B. „BT-31 fehlt (Schematron UBL-CR-…ets)“), kein stiller Export.
5. **Tests aktualisieren:** `bau_erp.test.js`/`zugferd.test.js`-Assertions auf 3.0 heben; neue Tests: Export ohne Beleg-ID → Fehler; Export aus Entwurf → blockiert; Fixture-Vergleich PDF↔XML↔DB.

**Acceptance Criteria (messbar):**
- [ ] Export aus ungespeichertem Formular technisch unmöglich (Test: `collectERechnungExportData` ohne `belegId` wirft; IPC mit `entityId: 0` → Fehler, kein File).
- [ ] Alle Fixtures bestehen KoSIT-Bundle-3.0.2-Prüfung (Berichte im Release-Archiv, Versionen dokumentiert); ZUGFeRD-Fixtures bestehen zusätzlich veraPDF-PDF/A-3-Prüfung.
- [ ] Abgleich-Test: `PDF(Zahlbetrag, Nr., Datum, Leitweg-ID) == XML == DB` für alle Fixtures.
- [ ] Jede Blockierung nennt Feld + verständlichen Grund (Test assertet Fehlermeldung enthält Belegfeld-Bezug, nicht nur „invalid“).

**Tests:** Unit (EInvoiceEngine-Regeln, B2G-Gates), Fixture/Validator (KoSIT + veraPDF, skriptgesteuert, Berichte versioniert), E2E-Desktop (Beleg festschreiben → exportieren → blockierten Entwurf versuchen).
**Risiken:** 3.0-Regeldeltas brechen Bestands-Fixtures → Fixture-Matrix früh aufstellen, Bulk-Export alter Belege nach 3.0 explizit **nicht** versprechen (nur neue/festgeschriebene Belege). Keine Rechtsberatung: BMF-Übergangsregeln (bis Ende 2026 allgemein, bis 800 T€ bis Ende 2027) als Doku-Hinweis, nicht als Compliance-Garantie.
**Nicht-Ziele:** E-Rechnungs-**Empfang**/Eingangsverarbeitung, neue ZUGFeRD-Profile jenseits EN16931+XRechnung, automatischer Versand.

---

### P0.5 Release / Backup / Migration / E2E-Desktop

**Betroffene Dateien:** `package.json` (scripts/build), `main/backup.js`, `db.js` (Backup-Service), `schema.js` (Migrationen), `main.js` (Autostart/Scheduler `:1500–1516`, Quit-Backup `:1528–1534`), `.github/workflows/tests.yml`, `tests/backup.test.js`, `tests/data_integrity.test.js`, `tests/gobd_protection.test.js`, neu: `tests/e2e_desktop/*` + `doc/release/*`.

**Aufgaben:**
1. **Releaseprozess:** unterstützte Laufzeiten dokumentieren (Windows 10/11, Electron-/Node-Versionen aus `package.json`); `npm test` als Pflicht-Gate (CI `.github/workflows/tests.yml` — in HEAD neu — aktiv verifizieren); **Windows-Installations-/Update-Test pro Release** (frisch + Update über Vorversion mit echter Alt-DB): Installer läuft, App startet, Migrationen grün, Sync bleibt Opt-in-aus, Alt-Belege lesbar.
2. **Backup/Restore-Nachweis:** Voll-Backup → Löschen/Verderben der DB → Restore → Hash-/Satzvergleich (Belege, Zahlungen, Aufmaß, Einstellungen inkl. Sync-Opt-in-Status); fehlgeschlagenes Update (abgebrochene Migration) → App startet im sicheren Zustand mit lesbarer Fehlermeldung, kein Datenverlust; Auto-Backup beim Beenden + Scheduler (`main.js:1501–1503,1531–1533`) per Test mit Test-Profil.
3. **Migrations-Disziplin:** jede Schema-Änderung (P0.2-Herkunftsfelder, P0.4-Belegfixierung) mit Vorwärts-Migration + Rollback-/Reparaturpfad + Alt-DB-Fixture (Vorversion-DB einchecken, Migration im Test drüberlaufen lassen).
4. **E2E-Desktop (echt, kein Mock):** Skript (Playwright-Electron oder Auto-Start + IPC-Driven gegen gebauter App auf Windows): Kunde anlegen → Angebot/LV → Auftrag/Projekt → Aufmaßblätter → Übergabe (P0.3) → Abschlag 1 → Teilzahlung → Abschlag 2 → Nachtrag → Schlussrechnung → Freigabe → XRechnung-Export (P0.4) → StB-Export (DATEV). Abbruch an jedem Schritt muss gespeicherten Zwischenstand hinterlassen (Reload-Test eingebaut). Zunächst **ein** Happy-Path + ein Sperr-/Storno-Pfad; keine Vollabdeckung aller Module.

**Acceptance Criteria (messbar):**
- [ ] Release-Checkliste `doc/release/checklist.md` abgearbeitet und unterschrieben (Version, Commit, Tester, Datum): `npm test` grün, Windows-Frisch- + Update-Test grün, Backup/Restore-Nachweis grün, KoSIT-/veraPDF-Berichte archiviert.
- [ ] E2E-Happy-Path auf Windows-Build grün inkl. App-Neustart in der Mitte (Reload-Nachweis), inkl. OPOS-Nullabgleich am Ende.
- [ ] Abgebrochene Migration → kein Datenverlust (Vorher/Nachher-Satzvergleich + App-Fehlerseite), Test grün.

**Tests:** Unit (Backup-Service, Migrationen), Integration (Restore-Vergleich), E2E-Desktop (Windows-Runner oder manuelle Checkliste bis Runner steht — explizit als manuell markieren, nicht als „automatisiert“ ausgeben).
**Risiken:** Windows-CI fehlt evtl. → bis dahin manuelle Checkliste mit Protokollpflicht; `better-sqlite3`-Rebuild auf Windows (`postinstall`) im Release-Test abdecken.
**Nicht-Ziele:** Auto-Update-Infrastruktur (außer Installer-Update-Test), Telemetrie, Signierung über Standard (nsis) hinaus.

---

### P0.6 UI-Fokusmodus: Kern ohne Modul-Hopping

**Betroffene Dateien:** `views/*`, Navigation/Router, `js/editor.js`, `js/projekte.js`, Einstellungen (Feature-Flags), E2E-Navigations-Test.

**Aufgaben:**
1. **Kern-Pfad ohne Modulwechsel:** Kunde → Angebot/LV → Projekt → Aufmaß/Nachtrag → Abschlag → Zahlung → Schlussrechnung → Export als lineare Führung (eine Navigationsschiene, Kontext bleibt am Projekt/Beleg, kein manuelles „Modul-Hopping“ mit Verlust des Arbeitsstands).
2. **Rest hinter Flag:** alle Nicht-Kern-Module (Objektverwaltung, Dauerrechnungen, Reinigungs-LV/Putzplan, Banking-Erweiterungen, IDS/SOKA, Kalkulation/Datanorm/Mängelkataster-Ausbau, Phase-4/5-Features) hinter `experimental`-Flag (Standard: aus). Nichts löschen, nichts migrieren — nur ausblenden + Kennzeichnung „experimentell, nicht pilotiert“.
3. **Bedienbarkeits-Messung vorbereiten:** Hilfe-Klicks, Zeit Angebot→Versand, Doppel-Erfassungen als P1-Messpunkte instrumentieren (minimale Event-Logs, kein Tracking-Overhead).

**Acceptance Criteria (messbar):**
- [ ] Kern-Flow in ≤ 1 Navigationskontext durchführbar (E2E-Test klickt den Pfad ohne Rücksprung ins Hauptmenü).
- [ ] Mit Standard-Flags sind nur Kern-Module sichtbar (Screenshot-Test/ DOM-Assertion der Navigation).
- [ ] Kein Datenverlust beim Wechsel Kern ↔ experimentelles Modul (State-Restore-Test).

**Tests:** Navigations-E2E (DOM), Flag-Matrix-Unit-Test.
**Risiken:** Power-User vermissen Module → Flag klar dokumentieren, Opt-in pro Arbeitsplatz.
**Nicht-Ziele:** Redesign, neues UI-Framework, Barrierefreiheits-Vollzertifizierung (nur keine Regressionen).

---

## Phase P0 — Definition of Done

- [ ] P0.2-Abnahmetabelle grün + OPOS-Nullabgleich; genau ein Einbehalt-Pfad.
- [ ] P0.3-Reload-Test grün (Neustart, Herkunftsbezüge, Sperrlogik, Idempotenz).
- [ ] P0.4: nur belegfixierte Exporte möglich; KoSIT-3.0.2- + veraPDF-Berichte pro Release archiviert; Fehler blockieren mit Feldbezug.
- [ ] P0.1-Negativmatrix grün + Windows-Smoke-Protokoll.
- [ ] P0.5-Release-Checkliste unterschrieben; E2E-Happy-Path auf Windows grün; Backup/Restore + Migrationsabbruch nachgewiesen.
- [ ] P0.6-Fokusmodus aktiv, Rest hinter Flag.
- [ ] `npm test` grün, keine `--skip`, keine auskommentierten Assertions für bekannte Bugs.

## Stop-Regeln P0 (wird explizit NICHT gemacht)

- Kein Voll-ERP-Ausbau (kein Controlling-, Einkaufs-, NU-, Lohn-, FiBu-, Lager-Neubau).
- Keine FiBu/Lohn/Lager/KI-Features.
- Kein Frameworkwechsel (Electron + SQLite bleiben; `db.js`/`main.js` werden nur entlastet, nicht neu geschrieben).
- Keine neuen Sync-Entitäten/Rechte-Modelle (nur Verifikation).
- Keine GAEB-/DATEV-Neuentwicklung (nur Real-Gegenstellen-Test in P2).
- Keine geparkten `plans/`-Module reaktivieren.

---

## Phase P1 — Danach: Pilot mit 1 Gewerk, 3 Betrieben

**Rahmen:** 1 Gewerk (vor Start festlegen, z. B. Ausbau/Sanierung), 3 Betriebe (2–20 MA), zunächst anonymisierte Fälle, dann je 1 echter Ablauf Kunde→Zahlung begleitet.

**Erfolgskriterien (alle 3 Betriebe, je mind. 1 vollständiger Ablauf):**
1. Kein Datenverlust (jedes Zwischenspeichern + App-Neustart übersteht den Ablauf).
2. Keine ungeklärte Cent-Differenz (Formular == Beleg == PDF == XML == OPOS, ±0,00 €).
3. Akzeptierte Exporte (XRechnung 3.0 vom Empfänger/Portal angenommen, StB-Export vom Steuerberater lesbar).
4. Schlussrechnung ohne manuelle Korrektur in einem Zweitprogramm.

**Messpunkte (pro Betrieb protokollieren):**
- Hilfe-Kontaktstellen (wo wurde gefragt/abgebrochen?).
- Zeit Angebotserstellung → Versand; Zeit Aufmaß → Abschlag.
- Doppel-Erfassungen (welche Daten werden zweimal getippt?).
- Support-Aufwand pro Ablauf (Minuten) + Fehlerquote Exporte.

**Arbeitspaket:** Nur die aus den Beobachtungen entstehenden **Top-Hindernisse** (max. 3) als P1-Fixes umsetzen; Rest → P2-Backlog. Pilot-Entscheid pro Betrieb: Go (produktiv) / No-Go mit Begründung.

**P1-DoD:** 3 Pilotberichte (Ablauf, Messpunkte, Kriterien-Check) + max. 3 Hindernis-Fixes mit Tests + Go/No-Go-Entscheidung dokumentiert.
**Stop-Regeln P1:** Kein zweites Gewerk, kein Feature-Wunsch-Katalog aus dem Pilot (nur Top-3), keine Preismodell-/Vertriebsarbeit in diesem Plan.

---

## Phase P2 — Später: Bedarfsgesteuert zum schlanken ERP

Erst nach P1-Go. Jedes Item braucht belegten Pilot-Nutzen (mind. 2 von 3 Betrieben fragen es wiederkehrend nach), sonst bleibt es geparkt.

- **Projektcontrolling:** Erlöse + tatsächliche Kosten + offene Forderungen pro Baustelle (setzt saubere P0.2-Trennung voraus).
- **Mobile Abläufe:** Zeiterfassung, Fotos, Bautagebuch **nach bestandener** P0.1-Verifikation ausbauen (keine neuen Sync-Entitäten ohne Sicherheits-Review + Negativtests).
- **Teamarbeit / Rollen:** Architekturentscheidung für echten Mehrbenutzerbetrieb (eigener Entscheidungs-ADR: SQLite-WAL vs. Server-DB vs. Sync-Primär) — **statt File-Share einer lokalen DB-Datei** (explizit verboten als „Lösung“).
- **Einkauf / Nachunternehmer:** erst bei wiederkehrender Pilot-Nachfrage vertiefen.
- **Schnittstellen:** GAEB, DATEV und vorhandene Export-/Importwege **gegen reale Gegenstellen** testen (Portal-Annahme, StB-Rückmeldung); zusätzliche Integrationen nur bei belegtem Nutzen.

**P2-DoD pro Item:** ADR (bei Architektur), Tests, Pilot-Rückmeldung, Release-Checkliste wie P0.5.
**Stop-Regeln P2:** Keine Voll-FiBu/Lohn/Lager, keine KI-Automatisierung als Kernversprechen, kein Big-Bang-Rewrite.

---

## Anhang A — Aufgaben-Index mit Dateien (Kurzreferenz)

| Aufgabe | Kern-Dateien | Tests |
|---|---|---|
| P0.1 Sync-Nachweis | `main/sync-server.js:303–313,593–638`, `main/sync-config.js`, `main.js:1349–1368,1508–1516`, `schema.js:1220–1232` | `tests/sync_server_security.test.js`, `tests/sync_client_security.test.js` + 6 neue Negativtests, Windows-Smoke |
| P0.2 Rechenwahrheit | `controllers/InvoiceController.js:91–206`, `controllers/CumulativeBillingController.js:19–106`, `views/InvoiceView.js:142–260`, `js/editor.js:1491–1513` | neu `tests/cumulative_retention_chain.test.js` (Abnahmetabelle), `tests/invoice_controller.test.js`, `tests/retention_vob_rules.test.js` |
| P0.3 Übergaben | `js/projekte.js:1261–1321`, `controllers/NachtragController.js`, IPC `db:saveDocument` (`main.js:217ff`) | Integration save→reload, Idempotenz-/Sperr-Tests, E2E |
| P0.4 E-Rechnung | `js/einvoice.js:5,312–336,359ff`, `js/editor.js:951–1090`, `main.js:1100–1200` | Fixture-Matrix + KoSIT-3.0.2 + veraPDF, Belegfixierungs-Tests |
| P0.5 Release/E2E | `package.json`, `main/backup.js`, `schema.js`, `.github/workflows/tests.yml` | `tests/backup.test.js`, `tests/data_integrity.test.js`, neu `tests/e2e_desktop/*`, `doc/release/checklist.md` |
| P0.6 Fokusmodus | `views/*`, Router, Feature-Flags | Navigations-E2E, Flag-Matrix |

## Anhang B — Geparkte Pläne (nicht in Scope)

`plans/objektverwaltung-plan.md`, `plans/daurerkrankungen-plan.md` (`daurerchnungen-plan.md`), `plans/bankimport-opos-sepa-plan.md`, `plans/banking-sepa-reparatur-plan.md`, `plans/phase1-efb-gaebx31-autobackup-plan.md`, `plans/phase2-zuschlagskalkulation-datanorm-maengelkataster-plan.md`, `plans/phase3-mobile-pwa-zeiterfassung-baustellenbegleiter-sync-plan.md`, `plans/phase4-ids-connect-grosshandel-sokabau-compliance-plan.md`, `plans/phase5-stufe-1-2-3-baustellen-offline-masterplan.md`, `plans/putzplan-reinigungslv-plan.md`, `plans/smtp-emailversand-plan.md`, `plans/recherche-validierung-fixes-plan.md`, `plans/bauprofessor_vob_implementation_plan.md`, `plans/deep_research_audit_phase2_3_4_plaene.md`, `plans/Ai/`, `plans/old/`, `plan01–14.txt`. Reaktivierung nur nach P1-Go per eigenem ADR.
