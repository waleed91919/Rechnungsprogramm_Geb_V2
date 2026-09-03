# Changelog / Fortschritt

## 04.09.2026 (UI-Klickreparatur, Gesamtsystem-Audit & Tiefenanalyse Modul „Rechnung“)
- **UI-Auswahl & Klickreparatur:**
  - [`js/navigation.js`](../js/navigation.js): Schließende Klammer `}` für `switchView(viewName)` ergänzt. Behebt `SyntaxError: Unexpected end of input` und stellt globale Navigation wieder her.
  - [`js/editor.js`](../js/editor.js): `try...catch...finally` Struktur in `saveRechnung` bereinigt. Behebt `SyntaxError: Missing catch or finally after try`.
  - [`tests/full_system.test.js`](../tests/full_system.test.js): Automatisierter Syntax-Integritätstest integriert (`node -c` Prüfung über alle JS-Dateien).
- **Tiefenanalyse Modul „Rechnung“ & Workflow „Neue Rechnung“:**
  - [`doc/rechnung_modul_analyse_2026.md`](rechnung_modul_analyse_2026.md): 380 Zeilen detaillierter Prüfbericht mit Internet-Recherche zu deutschen Rechtsstandards (§ 14 UStG, EN 16931 E-Rechnung 2026/2027, § 13b UStG, § 35a Abs. 3 EStG, VOB/B § 14/§ 17, GoBD).
  - Lückenloser Workflow-Audit der Modal-Initialisierung, Adressanzeige, B2C/B2B/B2G-Umschaltung, REB 23.003 Aufmaß-Mengenübernahme und Live-Cent-Kalkulation.
- **Gesamtsystem-Audit & Dokumentation:**
  - [`doc/modulaudit_gesamtsystem_2026.md`](modulaudit_gesamtsystem_2026.md): Prüfung aller 10 System-Modulgruppen.
  - [`doc/session_summary_2026-09-04_modulaudit_und_rechnung_tiefenanalyse.md`](session_summary_2026-09-04_modulaudit_und_rechnung_tiefenanalyse.md): Umfassende Dokumentation der durchgeführten Arbeiten.
  - Gesamtsystem: **226 von 226 Tests bestanden (100% Pass)**.

## 03.09.2026 (Release 2.2: Phase 5 – Baustellen-Offline-Betrieb, Mobiles Aufmaß REB 23.003, Web Bluetooth Laser & UI/UX Härtung)
- **Deep Research & Baustellen-Anforderungsanalyse:**
  - [`Features/10_deep_research_bau_offline_erp_anforderungen_und_gap_optimierung.txt`](../Features/10_deep_research_bau_offline_erp_anforderungen_und_gap_optimierung.txt): 801 Zeilen umfassende Fachstudie zu realen Baustellen-Herausforderungen (Faradayscher Käfig, ländliche Funklöcher, Akku-Drosselung bei Netzsuche, Ausfall reiner SaaS-Web-Apps).
  - Umfassender Benchmark von 8 Konkurrenzsystemen (*pds, STREIT, KWP, baufaktura, 123erfasst, Capmo, PlanRadar, Craftnote*) und TCO-Vergleich (5-Jahres-Ersparnis > 35.000 € durch Einmalkauf-Modell).
- **Masterplan Phase 5 (Stufe 1, 2 & 3):**
  - [`plans/phase5-stufe-1-2-3-baustellen-offline-masterplan.md`](../plans/phase5-stufe-1-2-3-baustellen-offline-masterplan.md): 1.696 Zeilen Architekturplan für Quick Wins, REB 23.003 Aufmaß, Web Bluetooth BLE Laser, PDF.js Plan-Viewer und Barcode-Scanning.
- **Datenbankschema & Migration 006:**
  - [`schema.js`](../schema.js): Migration `006_baustellen_offline_stufe_1_2_3` mit Tabellen `kolonnen`, `kolonnen_mitarbeiter`, `bauplaene`, `geraete_buchungen`, `lieferscheine_digital`, `maengel` und Spaltenerweiterungen in `aufmass_zeilen` und `maengelkataster`.
  - [`pwa/js/pwa-db.js`](../pwa/js/pwa-db.js): Dexie.js Upgrade auf Version 2 mit 7 neuen Offline-Stores (`local_aufmass`, `local_aufmass_zeilen`, `cache_kolonnen`, `cache_bauplaene`, `local_maengel`, `local_geraete_buchungen`, `local_lieferscheine`).
- **Stufe 1 (Quick Wins):**
  - [`pwa/js/crypto-sync-bundle.js`](../pwa/js/crypto-sync-bundle.js), [`pwa/js/sync-bundle.js`](../pwa/js/sync-bundle.js) & [`main/sync-bundle-importer.js`](../main/sync-bundle-importer.js): Notfall-USB-Sync (`.wlsync` Paket) via PBKDF2 (100.000 Iterationen), AES-GCM-256 und SHA-256 Integritätsprüfung mit idempotenter Desktop-SQLite-Übernahme.
  - [`pwa/js/pwa-app.js`](../pwa/js/pwa-app.js) & [`pwa/index.html`](../pwa/index.html): Polier-Kolonnen-Schnellstempelung mit ArbZG-Wächter (§ 3, § 4, § 5) und BRTV-Wegezeitstaffel.
  - [`pwa/css/pwa.css`](../pwa/css/pwa.css): Baustellen-Sonnenlichtmodus (WCAG AAA Signalgelb/Schwarz) und Handschuhbedienung mit $\ge 52\,\text{px}$ Touch-Targets.
- **Stufe 2 (Mobiles Aufmaß & Laser-BLE):**
  - [`pwa/js/reb-aufmass.js`](../pwa/js/reb-aufmass.js): REB 23.003 Aufmaß-Rechenkern (Formeln 01, 02, 04, 23, 91), VOB/C Übermessungsprüfung ($\le 2{,}5\,\text{m}^2$) und normierter DA11-Satzart 11 Export (80 Bytes).
  - [`pwa/js/bluetooth-laser.js`](../pwa/js/bluetooth-laser.js): Web Bluetooth BLE-Treiber für Leica DISTO (Float32 Little-Endian) und Bosch GLM (MT-Protokoll) mit automatischem Fokus-Sprung ins nächste Maßfeld.
  - [`pwa/index.html`](../pwa/index.html): Neuer Tab `#tab-aufmass` für mobile Aufmaßblätter mit Raumzuordnung.
- **Stufe 3 (Offline Plan-Viewer & Barcode-Scanner):**
  - [`pwa/js/plan-viewer.js`](../pwa/js/plan-viewer.js): Offline Canvas-Viewer mit Pinch-to-Zoom/Pan, zoom-invarianten Prozent-Pins ($X\% / Y\%$) und VOB/B § 13 Fristenampel (Rot/Gelb/Grün/Grau) mit geometrischen Symbolen für Barrierefreiheit.
  - [`pwa/js/barcode-scanner.js`](../pwa/js/barcode-scanner.js): Native `BarcodeDetector`-API für BGL-Großgerätebuchung und Kontrastfilter für Papier-Lieferscheinfotos.
- **Strenge UI/UX-Audits & Vollständige Härtung:**
  - Zwei unabhängige Fach-Audits für Desktop ERP (Note 4,0) und Mobile PWA (Note 4,7) mit 26 identifizierten Mängeln.
  - Vollständige Behebung aller 13 kritischen (P0) und hohen (P1/P2) Bugs:
    * USB-Sync persistiert Mutationen & Fotos atomar in IndexedDB.
    * Plan-Viewer entkoppelt Pan-Wischen und Tap-Mängelplatzierung durch $\ge 8\,\text{px}$ Hysterese.
    * Foto-Markup-Canvas mit Touch-Listenern für Freihand, Kreis und Pfeil ausgestattet.
    * Echter Kamera-Barcode-Scanner mit Sucherfenster ersetzt Dummy-Alerts.
    * Zeiterfassung-Subtabs ([`views/ZeiterfassungView.js`](../views/ZeiterfassungView.js)) und Sync-Navigation ([`views/SyncView.js`](../views/SyncView.js)) repariert.
    * KalkulationView ([`views/KalkulationView.js`](../views/KalkulationView.js)) Fokusverlust behoben.
    * GAEB X83 Import ([`js/projekte.js`](../js/projekte.js)) an Aufmaß-Split-Screen angebunden.
    * Globales Modal-Schließen per `Escape` und Beleg-Schnellspeichern per `Strg+S` implementiert.
    * B2G Leitweg-ID Pflichtfeldvalidierung in Kunden- und Belegverwaltung verankert.
- **Tests & Verifikation:**
  - [`tests/phase5_stufe1_2_3.test.js`](../tests/phase5_stufe1_2_3.test.js): 12 Kernprüfungen (TC-01 bis TC-12) erfolgreich implementiert.
  - Gesamtsystem: **224 von 224 Tests bestanden (100% grün, 8 Test-Suites)**.
- **Dokumentation:**
  - [`doc/session_summary_2026-09-03_ui_ux_reparatur_und_optimierung.md`](session_summary_2026-09-03_ui_ux_reparatur_und_optimierung.md)
  - [`doc/session_summary_2026-09-03_phase5_offline_erp_und_ui_ux_haertung.md`](session_summary_2026-09-03_phase5_offline_erp_und_ui_ux_haertung.md)

## 30.08.2026 (Release 2.0: Phase 4 – IDS Connect 2.5, SOKA-BAU & Nachunternehmer-Compliance)
- **IDS Connect 2.5 & Open Masterdata Engine:**
  - [`controllers/IDSConnectController.js`](../controllers/IDSConnectController.js) & [`main/ids-connect-service.js`](../main/ids-connect-service.js): Deep-Link Handshake-URL-Builder mit Hook-URL, Session-Token und CSRF-Schutz.
  - Lokaler Node.js Loopback-Callback-Server für Webshop-Rücksprünge.
  - ITEK/BVBS XML-Warenkorb-Parser (Artikelnummer, EAN, Kurz-/Langtext, Preise, Preisbasis, Mengeneinheiten, Lieferzeit, Bild-/Dokumenten-URLs wie Sicherheitsdatenblätter).
  - Automatischer Import empfangener Warenkörbe in Angebote/Rechnungen mit konfigurierbarem Aufschlag.
  - Stammdaten-Seeding für Standard-Großhändler: *GC Online Plus, Richter+Frenzel, Sonepar, Rexel, Adolf Würth*.
  - UI-View: [`views/GrosshandelView.js`](../views/GrosshandelView.js).
- **SOKA-BAU / ZVK Meldedaten-Engine (BRTV 2026/2027):**
  - [`controllers/SokaBauController.js`](../controllers/SokaBauController.js): Dynamische Beitragssatztabelle `soka_beitragssaetze` für West (ULAK 14,70%, ZVK 3,20%, BBV 1,45%), Ost (ULAK 12,10%, ZVK 0,80%) und Berlin.
  - Urlaubsanspruchsberechnung (1 Tag je 12 SV-Tage) und Plausibilitätsprüfungen gegen Mindestlohn 1 & 2 sowie § 3 ArbZG.
  - Standard-Exportgeneratoren: **DTA-Bau** Festbreitendatei (Satzarten 01, 02, 03, 09) und **SOKA-BAU XML V3.0** mit SHA-256-Auditierung.
  - UI-View: [`views/SokaBauView.js`](../views/SokaBauView.js).
- **Nachunternehmer-Haftungsschutz (§ 14 AEntG & § 48b EStG):**
  - [`controllers/SubcontractorComplianceController.js`](../controllers/SubcontractorComplianceController.js): Fristenradar für SOKA-Unbedenklichkeitsbescheinigungen (UB) und Freistellungsbescheinigungen mit automatischer Auszahlungssperre bei fehlenden Nachweisen.
- **Tests:** [`tests/phase4_ids_grosshandel_sokabau.test.js`](../tests/phase4_ids_grosshandel_sokabau.test.js) (100% Pass).

## 30.08.2026 (Release 1.2: Phase 3 – Mobile PWA, Zeiterfassung & Local-First Offline-Sync)
- **Arbeitszeit- & ArbZG-Engine:**
  - [`controllers/ZeiterfassungController.js`](../controllers/ZeiterfassungController.js): Minutengenaue Erfassung, automatische Pausenabzüge (§ 4 ArbZG: 30 Min ab 6h, 45 Min ab 9h), 10h-Höchstarbeitszeit (§ 3 ArbZG), 11h-Mindestruhezeit (§ 5 ArbZG).
  - Tarifliche Wegezeitstaffeln nach BRTV-Bau § 7 (Staffel 2024–2026: 0–50 km = 7 €, 51–75 km = 8 €, >75 km = 9 €, Fernbaustellen 9 € bis 39 €).
  - UI-View: [`views/ZeiterfassungView.js`](../views/ZeiterfassungView.js).
- **Mobiles Bautagebuch & VOB/B Meldewesen:**
  - [`controllers/BautagebuchMobileController.js`](../controllers/BautagebuchMobileController.js): Formelle Bedenkenanzeigen (§ 4 Abs. 3 VOB/B) und Behinderungsanzeigen (§ 6 Abs. 1 VOB/B) mit digitaler Touch-Signatur und PDF-Export.
- **PWA Baustellenbegleiter:**
  - Installierbare Progressive Web App unter `pwa/` (`manifest.webmanifest`, `sw.js`, `js/pwa-db.js` mit Dexie.js, `js/camera-engine.js` mit Canvas-Kompression, GPS-Wasserzeichen und HTML-File-Capture Fallback, `js/sync-worker.js`, `js/pwa-app.js`).
- **Local-First P2P Sync Server:**
  - [`main/sync-server.js`](../main/sync-server.js): HTTP/WS Sync Hub auf Port 38400 mit QR-Pairing, Idempotenz durch UUIDv4, Last-Write-Wins (LWW), Large-Blob Photo-Streaming und Quarantäne-Tabelle `sync_conflicts`.
  - UI-View: [`views/SyncView.js`](../views/SyncView.js).
- **Tests:** [`tests/phase3_zeiterfassung_pwa_sync.test.js`](../tests/phase3_zeiterfassung_pwa_sync.test.js) (100% Pass).

## 30.08.2026 (Release 1.1: Phase 2 – Zuschlagskalkulation, DATANORM & Mängelkataster)
- **Zuschlags- & Endsummenkalkulation (EFB 221 / 222):**
  - [`controllers/KalkulationController.js`](../controllers/KalkulationController.js): Mittellohn-Kalkulation ($ML, LK, LNK \to KL \to VL$), 5 Kostenarten (Lohn, Stoffe, Geräte, Sonstige, Nachunternehmer), Gemeinkostenzuschläge (BGK, AGK, W&G), Endsummenkalkulation (EFB 222) mit Umlageverfahren und Deckungsbeitragsrechnung ($DB_I, DB_{II}$).
  - UI-View: [`views/KalkulationView.js`](../views/KalkulationView.js).
- **DATANORM 4.0 & 5.0 High-Performance Streaming Parser:**
  - [`controllers/DatanormParser.js`](../controllers/DatanormParser.js): CP850-DOS-Dekodierung, Unterstützung der Satzarten `V, A, B, C, P, R, S, T, Z`, Preisteilung bei `preisEinheit` (100/1000 Stück) und 1.000er-Transaktions-Batches.
  - UI-View: [`views/DatanormView.js`](../views/DatanormView.js).
- **Projektübergreifendes Mängelkataster & 2-stufiges Mahnwesen:**
  - [`controllers/MaengelController.js`](../controllers/MaengelController.js) & [`main/maengel-pdf-builder.js`](../main/maengel-pdf-builder.js): State-Machine (`ERFASST` bis `ERLEDIGT`/`ERSATZVORNAHME`), VOB/B § 13 Fristenradar (Ampellogik) und 200% Druckzuschlag nach § 641 Abs. 3 BGB bei Nachunternehmermängeln.
  - UI-View: [`views/MaengelView.js`](../views/MaengelView.js).
- **Tests:** [`tests/phase2_kalkulation_datanorm_maengel.test.js`](../tests/phase2_kalkulation_datanorm_maengel.test.js) (100% Pass).

## 30.08.2026 (Release 1.0.6: Phase 1 EFB-Preisblätter 221/223, GAEB DA XML 3.3 Phase X31 & Auto-Backup Engine)
- **EFB-Preisblätter 221 & 223 (VHB Bund / BMWSB):**
  - [`controllers/EFBController.js`](../controllers/EFBController.js) & [`views/EFBView.js`](../views/EFBView.js): Vollständige Zuschlagskalkulations- und Verprobungsengine nach VHB 2024/2026.
  - Mittellohn-, Kalkulationslohn- und Verrechnungslohnermittlung sowie 5-spaltige Zuschlagsmatrix (Lohn, Stoffe, Geräte, Sonstige, Nachunternehmer).
  - Aufgliederung der Einheitspreise (EFB 223) mit Cent-genauer Verprobung gegen Formblatt 221 ($\Delta = 0{,}00\text{ €}$).
  - Druckfertiger, amtlicher HTML/PDF-Export (EFB 221 DIN A4 Hochformat, EFB 223 DIN A4 Querformat).
- **GAEB DA XML 3.3 Datenaustauschphase X31 (Mengenermittlung nach REB 23.003):**
  - [`js/gaeb-x31.js`](../js/gaeb-x31.js): Konforme Generierung und Parser für GAEB DA XML 3.3 X31 mit `<QtyDeterm>`, `<QDetermItem>` und `<QTakeoff>`.
  - Mathematischer Formelevaluator für REB-Formeln 01–05, 23 und 91.
  - Nahtlose Verknüpfung mit Projekt-Aufmaßblättern.
- **Revisionssichere Auto-Backup & Retention Engine (GoBD & GFS):**
  - [`main/backup.js`](../main/backup.js) & [`main/backup-service.js`](../main/backup-service.js): Unterbrechungsfreies Online-Snapshot-Backup via `better-sqlite3` mit `PRAGMA integrity_check` und `PRAGMA wal_checkpoint(TRUNCATE)`.
  - Gzip-Kompression, SHA-256 Checksummen-Erstellung, lückenlose GoBD-Audit-Protokollierung.
  - Grandfather-Father-Son (GFS) Retention Policy mit automatischem Pruning und Disaster-Recovery-Assistent.
- **UI-Integration & Einstellungen:**
  - EFB-Kalkulationstab und GAEB X31 Export/Import im Projektbereich ([`js/projekte.js`](../js/projekte.js), [`code.html`](../code.html)).
  - Backup- und Disaster-Recovery-Management in den Einstellungen ([`js/einstellungen.js`](../js/einstellungen.js), [`code.html`](../code.html)).
- **Tests:** Neue Testdateien [`tests/efb.test.js`](../tests/efb.test.js), [`tests/gaeb-x31.test.js`](../tests/gaeb-x31.test.js) und [`tests/backup.test.js`](../tests/backup.test.js). Alle **218 Tests** 100 % grün.

## 27.08.2026 (Objektverwaltung F1: Detaillierte Analyse, Löschschutz-Härtung, Bodenbelag-Erweiterung & CSV-Export)
- **Umsetzung & Audit:** Vollständige Code-Analyse der Objektverwaltung (Liegenschaften $\rightarrow$ Gebäude $\rightarrow$ Etagen $\rightarrow$ Räume) und Verknüpfung zu Dauerrechnungen (F2), Reinigungs-LV (F3) und GoBD-Audit-Kette. Details: [`doc/session_summary_2026-08-27_objektverwaltung-analyse-und-erweiterung.md`](session_summary_2026-08-27_objektverwaltung-analyse-und-erweiterung.md).
- **Löschschutz & Integrität:**
  - `pruefeObjektPlanBezug`: Löschschutz für referenzierende `abrechnungsplaene` in allen 4 Ebenen (`deleteLiegenschaft`, `deleteGebaeude`, `deleteEtage`, `deleteRaum` in [`db.js`](../db.js)) integriert.
  - Löschprüfungen deterministisch geordnet: Reinigungs-LV $\rightarrow$ Abrechnungspläne $\rightarrow$ GoBD-Belege.
- **Datenmodell & FM-Erweiterungen:**
  - `bodenbelag TEXT` zu Tabelle `raeume` in [`schema.js`](../schema.js) und automatische Migration hinzugefügt; Persistenz in `saveRaum` ([`db.js`](../db.js)).
  - Schnellauswahl-Datalists für Raumtypen (`#raumtyp-suggestions`) und Bodenbeläge (`#bodenbelag-suggestions`) in [`code.html`](../code.html) und [`js/objekte.js`](../js/objekte.js).
  - Korrektur `getObjektDetails` in [`db.js`](../db.js): Raumfläche für `RAUM`-Knoten als `flaecheGesamt` berechnet und verknüpfte Abrechnungspläne geladen.
- **UI & Export-Features:**
  - **Erweiterte Suche & Filter:** `buildObjekteRows` in [`js/objekte.js`](../js/objekte.js) sucht jetzt auch nach Vollpfad (`buildPfad`), Straße, PLZ, Ort, Raumtyp und Bodenbelag; Statusfilter (*Alle*, *Aktiv*, *Inaktiv*).
  - **CSV-Export:** Neue Funktion `exportObjekteCSV()` mit Toolbar-Button in [`code.html`](../code.html) für hierarchischen CSV-Export mit UTF-8 BOM.
  - **Quick-Add:** Direkte Schnell-Anlege-Buttons (`+`) auf Zwischenebenen im Struktur-Tab der Detailansicht.
  - **IPC-Normalisierung:** Numerische ID-Prüfung (`Number.isInteger`) in allen Objekt-IPC-Handlern ([`main.js`](../main.js)).
- **Tests:** Testsuite in [`tests/objekt_stamm.test.js`](../tests/objekt_stamm.test.js) um Testfälle (i), (j), (k) erweitert. Alle **194/194 Tests** im Gesamtsystem 100 % grün.

## 26.08.2026 (Reparaturplan F11-R: Banking/OPOS/SEPA nach Validierungsbericht)
- **Umsetzung:** Freigegebener Master-Reparaturplan [`plans/banking-sepa-reparatur-plan.md`](../plans/banking-sepa-reparatur-plan.md) vollständig umgesetzt (Phasen A–E, Fixes 1–20, Findings [B1]–[B7] + P2/P3); Plan als abgeschlossen markiert.
- **P1-Blocker:**
  - **[B1] pain.008-XSD-Konformität** ([`controllers/SepaController.js`](../controllers/SepaController.js):205–405): `<BtchBookg>` statt ungültigem `<BchBookg>` (Z.352), versionsabhängig `<BICFI>` (.001.08) vs. `<BIC>` (.001.02-Fallback, bicTag Z.231), `<ChrgBr>SLEV</ChrgBr>` in korrekter XSD-Sequenz CdtrAgt→ChrgBr→CdtrSchmeId→DrctDbtTxInf (Z.377), `CdtrSchmeId/Id/PrvtId/Othr/Id` statt OrgId (Z.380).
  - **[B2] Skonto-Persistenz** ([`db.js`](../db.js):71 ff., 660 ff.): `skonto_tage`, `skonto_prozent`, `sepa_mandat_id` werden in `applyDocumentWrite` (INSERT+UPDATE) und `bulkSaveDocuments` persistiert; `bezahlt_betrag`/`offener_betrag` bewusst ausgenommen (nur Matching-Pfade).
  - **[B3] Kunden-Bankdaten** ([`db.js`](../db.js):583–657): `saveKunde`/`bulkSaveKunden` speichern `iban/bic/bank_name/kontoinhaber` (normalisiert); Frontend ([`js/kunden.js`](../js/kunden.js)) erhält Bestandswerte bei leerer Eingabe.
  - **[B4]** `getSepaLaeufe()` sortiert nach `erstellt_am` statt nicht existierender Spalte `created_at` ([`db.js`](../db.js):3369–3375).
  - **[B5] CSV-Profil-Reihenfolge** ([`controllers/BankingController.js`](../controllers/BankingController.js):350–370): Deutsche Bank (`kundenreferenz`/`wertstellung+betrag (eur)`) und Commerzbank (`auftraggeber / begünstigter`/`umsatzart`) matchen vor Sparkasse → Soll/Haben-Vorzeichen wieder korrekt (Regression T-R17/T-R18).
  - **[B6] CAMT.052/.053** ([`controllers/BankingController.js`](../controllers/BankingController.js):145–330): `Sts`-Filter überspringt PDNG/INFO (gezählt), `RvslInd=true` wird übersprungen (gezählt), `<Rpt>` setzt `import_format='CAMT052'` inkl. `statementType/skippedPending/rvslSkipped` je Statement.
  - **[B7] Gläubiger-ID** ([`controllers/SepaController.js`](../controllers/SepaController.js):187–203): `validateGlaeubigerId` (ISO 7064 Mod 97-10 ohne CBC, Prüfziffer=98−Rest, offizielle Bundesbank-Test-ID valide); Demo-Fallback `DE98ZZZ09999999999` entfernt aus `createSepaRun` ([`db.js`](../db.js):3150 ff.) und Pre-Notification ([`js/banking.js`](../js/banking.js)); Seed auf Leerstring ([`schema.js`](../schema.js):955); Modal-Validierung beim Bankkonto-Speichern.
- **P2 Regelkonformität:**
  - **Fix 8:** Pre-Notification-Frist (Art. 5.6 EPC Rulebook) wird erzwungen; mit `preNotFristBestaetigt` + Audit `PRENOT_FRIST_ABWEICHEND_BESTAETIGT` erlaubt; UI-Checkbox Tab 3.
  - **Fix 9:** SeqTp je Mandat (`tx.seqTp`), mehrere `PmtInf`-Blöcke via `_buildPmtInfBlock`, `MIXED` nur als Lauf-Label (nie im XML), CORE/B2B-Mismatch-Filterung mit Warning + Audit `POSITIONEN_GEFILTERT_SCHEME_MISMATCH`.
  - **Fix 10:** FRST→RCUR erst bei `exportSepaRunXml`; neue Methoden `storniereSepaLauf` ([`db.js`](../db.js):3430) und `markiereRuecklastschrift` ([`db.js`](../db.js):3458) mit Rücknahme des Sequenztyps; IPC-Kanäle `db:storniereSepaLauf`/`db:markiereRuecklastschrift` (main.js/preload.js); UI: Storno-Button je Lauf, Laufdetail-Modal mit Rücklastschrift-Button.
  - **Fix 11:** `DtOfSgntr` ohne Ausführungsdatum-Fallback – hartes Validierungsfehler-Verhalten bei fehlendem/ungültigem Unterschriftsdatum.
  - **Fix 12:** Rechtsverweise präzisiert (code.html:1760 „§ 14 Abs. 4 Satz 1 Nr. 7 UStG" mit §§ 10/17-Tooltip; code.html:4951 „Privatkunde" entkoppelt, statischer § 14b Abs. 1 Satz 5 UStG-Hinweis im Steuerblock).
- **P3 Robustheit/GoBD:**
  - **Fix 13:** `dokumente.was_locked_vor_zahlung` (Migration schema.js:825); `applyPaymentMatching` sichert Sperren-Herkunft, `unmatchTransaction` stellt sie wieder her.
  - **Fix 14:** `zahlung_zuordnungen.storno_flag/storniert_am/storno_grund` (Migrationen schema.js:827 ff.); Entkopplung nur noch logisch; alle Lesezugriffe filtern `storno_flag = 0`.
  - **Fix 15:** `_isDateWithinDays` fail-closed ([`controllers/BankingController.js`](../controllers/BankingController.js):594).
  - **Fix 16:** Drag&Drop-Uploadzone im Import-Tab (code.html `#banking-dropzone`, [`js/banking.js`](../js/banking.js) `initBankDropzone`).
  - **Fix 17:** Mandats-Anlege-UI (Tab 4): Modal + `oeffneMandatModal/speichereMandatForm` binden `saveSepaMandat` an, Referenz-Vorschlag via `generateMandateReference`.
  - **Fix 18:** Namespace-Präfix-Toleranz durch Single-Point-Normalisierung am CAMT-Parser-Eingang.
  - **Fix 19:** CP1252-Encoding-Fallback beim Upload (`liesseDateiMitEncodingFallback`) + isomorphe Heuristik `detectEncodingProblem`.
  - **Fix 20:** Primanota (AcctSvcrRef/Kundenreferenz) als primärer Dedup-Key vor Content-Hash-Fallback in `importBankTransactions`.
- **Tests:** Suite von 167 auf **194/194** erweitert (+27: T-R1 bis T-R27 gemäß Plan Abschnitt 6.2, davon 16 Pure-, 11 DB-basierte über Electron-as-Node-Marker-Läufe; neue Datei [`tests/sepa_lauf_lifecycle.test.js`](../tests/sepa_lauf_lifecycle.test.js)). Drei dokumentierte Bestands-Anpassungen (Plan 6.3) umgesetzt. Audit-Kette (`verifiziereAuditKette().valid`) in allen Lifecycle-DB-Läufen geprüft.
- **E2-Nachweis:** Smoke-CAMT mit `camt:`-Präfixen + PDNG importiert (nur BOOK, `skippedPending=1`); generierte pain.008-Dateien gegen offizielle ISO-20022-XSDs validiert (JDK javax.xml.validation): Einzelblock .001.08, Multi-PmtInf FRST+RCUR .001.08 und Legacy .001.02 jeweils **XSD_VALID**; Artefakte unter [`output/sepa_smoke/`](../output/sepa_smoke/).

## 26.08.2026 (Recherche-Validierungs-Fixes [F1]–[F5] + Kernmodul F11 Banking / OPOS / SEPA)
- **Umsetzung per Multi-Subagent-Kette:** Detaillierte Web-Recherche von Gesetzen und ISO 20022/EPC-Standards (`plan_creator`) -> Vollständige Implementierung aller Schichten (`plan_executor`) -> Verifikation. Details: [`doc/session_summary_2026-08-26.md`](session_summary_2026-08-26.md).
- **Recherche-Validierungs-Fixes ([F1] bis [F5]):**
  - **[F1] § 13b UStG Normierung:** `EXEMPTION_REASON_13B` = `'Steuerschuldnerschaft des Leistungsempfängers'` gem. § 14a Abs. 5 Satz 1 UStG in BT-120; Peppol/EN 16931 Codelistenwert `VATEX-EU-AE` in BT-121 (in [`js/einvoice.js`](../js/einvoice.js)).
  - **[F2] Factur-X / ZUGFeRD XMP:** Standard-XMP-Namespace `urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#` mit Präfix `fx` verifiziert.
  - **[F3] RTV Gebäudereinigung Tarifprofil:** Belastungszuschlag **25 %** gem. § 10 Ziff. 3 RTV für Arbeitszeit > 8 h/Tag bzw. > 40 h/Woche integriert; Hohe Feiertage (+200 %) auf Neujahr, 1. Mai, 1.+2. Weihnachtsfeiertag tarifkonform normiert (in [`controllers/ReinigungController.js`](../controllers/ReinigungController.js), [`js/putzplan.js`](../js/putzplan.js), [`code.html`](../code.html)).
  - **[F4] Lohngruppen 2026 & Mindestlohn:** Vollständiger 9-stufiger Katalog `LOHNGRUPPEN_GEBAEUDEREINIGUNG_2026` (LG 1 bis LG 9) und Mindestlohn-Prüffunktion `pruefeMindestlohn()` (LG 1 = 15,00 €/h, LG 6 = 18,40 €/h) implementiert.
  - **[F5] Sicherheitseinbehalte (VOB/B § 17):** Strukturierte `#EINBEHALT#`-Syntax in BT-20 (`SpecifiedTradePaymentTerms`) und nachrichtliche `IncludedNote` mit `SubjectCode=PMT` in BT-22 generiert.
- **F11 Banking, OPOS-Zahlungsabgleich & SEPA-Lastschriften:**
  - **Bankimport:** [`controllers/BankingController.js`](../controllers/BankingController.js) für CAMT.053/CAMT.052 XML (`camt.053.001.02`–`08`) und universelle deutsche CSV-Kontoauszüge (Sparkasse, Volksbank FIDUCIA, Deutsche Bank, Commerzbank) mit SHA-256 Deduplizierungs-Hashing (`calculateTransactionHash`).
  - **Intelligenter 4-Stufen OPOS-Zahlungsabgleich:** 4-Pass Matching Engine (Pass 1: Exakt via Rechnungs-Nr., Pass 2: Skonto gem. § 14 Abs. 4 UStG mit Fristprüfung, Pass 3: Teilzahlung, Pass 4: Kunden-IBAN/Name + Betrag) inkl. automatischem Mahnstopp und GoBD-Festschreibung (`isLocked = 1`).
  - **SEPA-Lastschriften (`pain.008`):** [`controllers/SepaController.js`](../controllers/SepaController.js) für ISO 7064 Modulo 97 IBAN-Prüfung, TARGET2-Bankarbeitstage, Pre-Notification-Generator und ISO 20022 `pain.008.001.08` / `pain.008.001.02` XML-Generierung.
  - **Schema & DB:** 6 neue Tabellen (`bank_konten`, `bank_transaktionen`, `zahlung_zuordnungen`, `kunden_sepa_mandate`, `sepa_lastschrift_laeufe`, `sepa_lastschrift_positionen`), 16 IPC-Handler, GoBD-Audit-Trail-Verkettung.
  - **UI & Navigation:** Neue Ansicht `Banking & OPOS` ([`js/banking.js`](../js/banking.js), [`code.html`](../code.html)) mit 4 Tabs (*Kontoauszug & Import*, *OPOS-Abgleich*, *SEPA-Lastschriften*, *Konten & Mandate*).
- **Tests:** Suite von 146 auf **167/167** Tests erweitert (6 Testsuiten inkl. neuer `banking_parser`, `opos_matching`, `sepa_pain008`, Testfälle Z13, R10, R11). Alle 167 Tests 100 % bestanden.

## 25.08.2026 (Gebäude-Module F3 Putzplan/Reinigungs-LV + F10 SMTP-E-Mail-Versand)
- **Umsetzung per 3-Subagent-Kette:** Planung (Detailpläne inkl. Web-Recherche zu RTV/BTV-Zuschlägen und SMTP-Best-Practices) -> Code (`gebaeude-code`, 30 Schritte) -> Prüfung (QA mit Fix-Auftrag). Details: [`doc/session_summary_2026-08-25.md`](session_summary_2026-08-25.md).
- **F3 Putzplan + Reinigungs-LV:** Tabellen `lv_bereiche`/`lv_positionen`/`putzplan_eintraege` (Flächen-/Mengenbezug je Liegenschaft/Gebäude/Etage/Raum), Kalkulationskern in [`controllers/ReinigungController.js`](../controllers/ReinigungController.js) (Jahresleistung = Menge x Einsätze/Jahr x Zeitbedarf; Zuschläge anteilig; Referenzfall exakt getestet), View `putzplan` mit Objektbaum + Live-Vorschau ([`js/putzplan.js`](../js/putzplan.js)), Übernahme des LV in Abrechnungspläne/Dauerrechnungen über neue Spalte `abrechnungsplan_positionen.lv_position_id` (Live-Preise), LV-Audit + Objekt-Löschschutz.
- **RTV/BTV-Zuschlagsprofil:** konfigurierbar über Einstellungs-Key `reinigung_zuschlagsprofile`; Defaults nach RTV Gebäudereinigung (Nacht 22–5 Uhr +30 %, Sonn-/Feiertag +80 %, hohe Feiertage +200 %) – nicht hart kodiert, da sich Sätze jährlich ändern können.
- **F10 E-Mail-Versand (SMTP):** [`main/email.js`](../main/email.js) (nodemailer ^9, injizierbarer/mockbarer Service, Port-465-TLS-Erzwingung, Timeouts, safeStorage-Fallback – Passwort verlässt den Main-Prozess nie), Tabelle `email_versandhistorie`, 7 IPC-Kanäle `smtp:*`, Einstellungs-Karte mit Kontenverwaltung + Inline-Verbindungstest, globales E-Mail-Modal am PDF-Preview für Rechnung/Angebot/Mahnung (PDF-Anhang, Betreff-/Text-Templates, Historien-Panel mit „Wiederholen"), GoBD-konform (Beleg-Hash durch Versand unverändert – getestet).
- **QA-Fix:** SMTP-Benutzername wurde bei jeder Konto-Bearbeitung gelöscht (`speichereKonto` behandelte leeren String als Löschauftrag) – gefixt + Regressionstest.
- **Tests:** Suite von 130 auf **146/146** erweitert (Kalkulation inkl. Referenzfall, Schema/Migration, CRUD/Löschschutz, Live-Preis-Integration, SMTP pure/DB/Fake-Transporter/GoBD).

## 24.08.2026 (Offene Punkte F2 entschieden + umgesetzt)
- **Preisquelle Hybrid (Snapshot vs. Live):** Neues Feld `abrechnungsplaene.preise_live` (Standard 0 = Preis-Snapshot beim Plan-Anlegen eingefroren; 1 = Positionen mit Artikellink nutzen den aktuellen `artikel.vk` bei Generierung, Vorschau und Sammelrechnung). Umgesetzt in [`schema.js`](../schema.js) (Spalte + Migration), [`db.js`](../db.js) (`_ladePlanPositionenFuerGenerierung`, wirkt in Einzel-/Sammelgenerierung + Vorschau), UI: Checkbox „Preise live vom Artikelkatalog übernehmen" im Plan-Modal (nur bei Positionen) + „Live"-Badge in der Planliste ([`js/dauerrechnungen.js`](../js/dauerrechnungen.js)).
- **Sammelrechnung Objektdarstellung:** PO-Entscheid – Prefix `[Objektpfad]` bleibt Release-Stand; echte PDF-Gruppierung verworfen (dokumentiert in [`plans/daurerchnungen-plan.md`](../plans/daurerchnungen-plan.md) §8).
- **Tests:** Suite von 129 auf **130/130** erweitert ([`tests/dauerrechnung_preise_live.test.js`](../tests/dauerrechnung_preise_live.test.js): Snapshot-Freeze, Live-Generierung, Live/Snapshot-Vorschau, gemischte Sammelrechnung, Pauschale mit Flag).

## 24.08.2026 (Gebäude-Kernmodule F1 + F2)
- **F1 Objektverwaltung:** Liegenschaft -> Gebäude -> Etage -> Raum/Fläche (4 Tabellen + Migration), abweichender Rechnungsempfänger je Knoten (EIGENTUEMER/MIETER/HAUSVERWALTUNG, Vererbung), CRUD mit Löschschutz, 11 IPC-Handler, Objekte-/Detail-Views (Tabs Stammdaten/Struktur/Historie/Abrechnungspläne), Beleg-Historie je Objekt, Editor-Anbindung (`dokumente.objekt_typ/objekt_id` in GoBD-Hash). Details: [`doc/session_summary_2026-08-24.md`](session_summary_2026-08-24.md).
- **F2 Dauerrechnungen:** Abrechnungspläne je Objekt mit Rhythmen (monatlich/quartalsweise/jährlich/Wochenintervall), atomare Rechnungsgenerierung über `applyDocumentWrite` (GoBD-konform), Vorschau/Rückstau, Sammelrechnungen je Eigentümer, Storno mit Pflichtbegründung, Auto-Lauf max. 1×/Tag, View + Modals.
- **Subagents:** Neue Agent-Definitionen [`gebaeude-planung`](../.opencode/agent/gebaeude-planung.md) und [`gebaeude-code`](../.opencode/agent/gebaeude-code.md); Detailpläne: [`plans/objektverwaltung-plan.md`](../plans/objektverwaltung-plan.md), [`plans/daurerchnungen-plan.md`](../plans/daurerchnungen-plan.md).
- **Tests:** Suite von 105 auf **129/129** erweitert (6 neue Testdateien für Objektstamm/-logik/-historie und Dauerrechnung-Rhythmus/CRUD/Generierung).

## 23.08.2026 (Audit & Reparatur)
- **Voll-Audit des Rechnungssystems + ZUGFeRD PDF/A-3 (3 Prüf-Subagenten):** PDF/A-3-Container korrekt; CII/XML verstieß gegen EN 16931 (BG-23, Leitweg-ID, Adressen, §13b, Einheitscodes); GoBD-Schutz nur im Renderer; Sichtseite im ZUGFeRD-PDF war Platzhalter. Details: [`doc/session_summary_2026-08-23.md`](session_summary_2026-08-23.md).
- **Fix ① – CII/XML + Validierungs-Gate:** [`js/einvoice.js`](../js/einvoice.js): BG-23 USt-Aufschlüsselung, BG-5/BG-8-Adressen mit CountryID, Leitweg-ID-Vorrang in BT-10, UN/ECE-Rec-20-Einheitscode-Mapping (m²→MTK, Std→HUR …), §13b mit ExemptionReason/VTEX, BT-9 Fälligkeit, Fake-USt-ID entfernt, rabatt- und zahlungskonsistente Summen (BR-CO-10/13/14/16). `validateForEN16931` als echtes Gate – Editor bricht bei Fehlern ab, Dashboard validiert jetzt mit.
- **Fix ② – Echte Sichtseite:** [`main.js`](../main.js) übergibt beim ZUGFeRD-Export das echte Rechnungs-PDF (unsichtbares Rendern + `printToPDF` mit 15 s-Timeout) als `basePdfBuffer`; Platzhalter nur noch als Fehler-Fallback; Sichtseite & XML aus denselben Daten.
- **Fix ③ – GoBD:** Sperr-Guard in [`db.js`](../db.js) (gesperrte Belege inhaltlich unänderbar/löschbar), `entsperreBeleg()` mit Begründungspflicht, zentrale Audit-Hashkette [`main/audit.js`](../main/audit.js) bei jeder Belegmutation in derselben Transaktion, `verifiziereAuditKette()` + IPC `audit:verify`, Export bricht bei Audit-Fehler ab.
- **Fix ④ – Datenintegrität:** UNIQUE-Indizes (Rechnungsnummer, Verrechnungs-Paare, Einbehalt) mit Dedup-Migration in [`schema.js`](../schema.js), atomares Storno in einer Transaktion, durchgehendes Cent-Rounding in [`controllers/InvoiceController.js`](../controllers/InvoiceController.js) (bitidentisch zur E-Rechnungs-Engine), Doppelverrechnung blockiert, Schema-Bugs `sec48b_valid_until`/`is_subcontractor` gefixt (+ §48b-Checkbox im Kundenformular).
- **Tests:** Suite von 96 auf **105/105** erweitert (Z6–Z12, GoBD-Schutz, Datenintegrität); Pipeline 4/4; B2G-Artefakte validieren sauber.

## 23.08.2026
- **Feature F5 – Echter ZUGFeRD 2.x PDF/A-3-Export (Hybrid-Rechnung):**
  - Neues Modul [`main/zugferd-builder.js`](../main/zugferd-builder.js): erzeugt aus optionalem Sichtseiten-PDF (sonst Ersatzseite mit eingebettetem System-TTF) + CII-Rechnungs-XML ein echtes PDF/A-3-Hybrid (`@cantoo/pdf-lib`, MIT, electron-frei): Katalog-`/AF`, `/Names /EmbeddedFiles`, `/AFRelationship /Alternative`, fx-XMP inkl. `pdfaExtension:schemas`, OutputIntent mit sRGB-ICC.
  - [`js/einvoice.js`](../js/einvoice.js): `generateZUGFeRDXML(invoice, customer, seller, {profile})` profil-parametrisiert – EN16931: URN `urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:en16931` + `factur-x.xml`; XRECHNUNG: URN `urn:xoev-de:kosit:standard:xrechnung_2.3` + `xrechnung.xml`; neu `getZUGFeRDProfileInfo(profile)`.
  - IPC-Handler `invoice:exportZugferdPdf` in [`main.js`](../main.js) (SaveDialog, Write, GoBD-Audit-Log) + `api.exportZugferdPdf` in [`preload.js`](../preload.js); Rechnungs-Editor (Format-Select "ZUGFERD", [`js/editor.js`](../js/editor.js)) und Dashboard-ZUGFeRD-Button ([`js/dashboard.js`](../js/dashboard.js)) nutzen den neuen Export.
  - [`scripts/generate_and_test.js`](../scripts/generate_and_test.js): schreibt jetzt ECHTE Hybrid-PDFs nach `output/invoices/b2b_zugferd/` (Mock-Textdateien entfernt).
  - Tests: neue [`tests/zugferd.test.js`](../tests/zugferd.test.js) (Z1 Struktur, Z2 XMP, Z3 OutputIntent, Z4 Roundtrip, Z5 Profilvarianten), erweiterte [`tests/bau_erp.test.js`](../tests/bau_erp.test.js) (beide Profil-URNs) und [`tests/end_to_end_generate.test.js`](../tests/end_to_end_generate.test.js) (Strukturchecks statt Mock-Existenz). Suite: 96/96 grün.
  - Doku: [`doc/zugferd-validation.md`](../doc/zugferd-validation.md) (VeraPDF/Mustang-Anleitung + Ergebnis der automatisierten Prüfungen); manueller VeraPDF-Lauf bleibt dokumentierter Restschritt.

## 14.07.2026
- **Sicherheitseinbehalt (VOB/B):** Berechnungslogik in der Rechnungserstellung (`js/editor.js`) hinzugefügt. Der Sicherheitseinbehalt (basierend auf dem Projekt) wird nun korrekt vom Nettobetrag abgezogen, bevor die Umsatzsteuer auf den verbleibenden Betrag berechnet wird.
- **Datenbank:** Die Tabelle `dokumente` in `db.js` wurde um das Feld `sicherheitseinbehalt` erweitert, damit der Wert dauerhaft in der SQLite-Datenbank gespeichert und geladen wird.
- **PDF-Generierung & Pflichtangaben:** Alle drei PDF-Vorlagen (Modern, Minimalistisch, Klassisch) in `js/einstellungen.js` aktualisiert. Sie unterstützen nun:
  - Dynamische Anzeige von Vortext und Fußtext.
  - Automatischer Abdruck rechtlicher Hinweise im Fußbereich (z.B. § 13b UStG für Bauleistungen, § 16 VOB/B, Aufbewahrungspflicht nach § 14b UStG für Privatkunden, Lohnkosten-Ausweis nach § 35a EStG, Bauabzugsteuer § 48 EStG).
- **Benutzeroberfläche (UI):** Eingabefelder und Checkboxen für die genannten rechtlichen/steuerlichen Anforderungen wurden in die Rechnungserstellung (`code.html`) integriert.
- **Modul 'Kumulierte Abschlagsrechnungen':**
  - Parent-Child-Architektur für Rechnungen implementiert (`rechnung_verrechnungen`).
  - UI-Bereich in `code.html` ergänzt, um vorherige Abschlagsrechnungen desselben Projekts kumulativ abzuziehen.
  - Berechnungslogik in `js/editor.js` (`calculateRechnungTotals`) überarbeitet: Zuerst wird der Sicherheitseinbehalt (Netto) abgezogen, dann die Summe bisheriger Abschlagszahlungen (Netto). Nur die verbleibende Differenz wird besteuert.
  - Die Verknüpfungen (Verrechnungen) werden beim Speichern an die Datenbank (`db.js`) übergeben und korrekt in der UI geladen.
  - **PDF-Generierung (`js/einstellungen.js`) angepasst:** Die PDF-Vorlagen (Modern, Minimalistisch, Klassisch) weisen nun am Ende der Rechnung eine detaillierte Zahlungsaufstellung aus. Diese beinhaltet den bisherigen Gesamtleistungsstand (Netto), den Abzug des Sicherheitseinbehalts und eine Aufschlüsselung aller vorherigen Abschlagsrechnungen (inkl. Rechnungsnummer, Datum und Abzugsbetrag). Erst danach wird der Netto-Zuwachs (Steuerpflichtig) besteuert und als Zahlbetrag ausgewiesen.
  - **Bugfix (Rechnungserstellung):** Einen Syntaxfehler in `js/editor.js` (`SyntaxError: Identifier 'taxContainer' has already been declared`) behoben, der verhinderte, dass der "Neue Rechnung"-Dialog geöffnet werden konnte. Doppelte Variablendeklarationen wurden in der Funktion `calculateRechnungTotals` entfernt.

## 15.07.2026
- **Gemischte Rechnungen (§ 13b UStG auf Positionsebene):**
  - Globale Checkbox "§ 13b UStG (Reverse Charge)" in der UI (`code.html`) integriert.
  - Wenn die globale Checkbox aktiv ist, wird bei jeder Rechnungsposition eine weitere Checkbox eingeblendet (`is13b`), mit der gezielt gesteuert werden kann, ob für diesen Artikel 0% oder die reguläre MwSt. berechnet wird.
  - Berechnungslogik in `js/editor.js` (`calculateRechnungTotals`) komplett überarbeitet, um zwischen `13b_netto` und `normal_netto` präzise zu splitten und globale Rabatte proportional umzulegen.
  - PDF-Erstellung in `js/einstellungen.js` (`generateRechnungPDF`) angepasst: Gemischte Rechnungen (mit regulären und § 13b-Anteilen) weisen nun eine detaillierte Steuer-Aufschlüsselung unter der Zwischensumme aus.
  - Datenbank-Erweiterung (`db.js`): Spalten `unterliegt_13b` zur Tabelle `dokumente` und `is13b` zur Tabelle `positionen` hinzugefügt und in die SQL-Insert/Update-Statements implementiert.
  - **Bugfixes:** SQL-Fehler (fehlender `?`-Platzhalter bei den Inserts in `dokumente`) und JavaScript-Fehler (`ReferenceError` durch vorzeitige Abfrage von Steuern vor ihrer Berechnung in `einstellungen.js`) identifiziert und behoben.

## 13.08.2026
- **B2G E-Rechnung (EN 16931-1 / XRechnung & ZUGFeRD 2.0.1+):**
  - Implementierung der E-Rechnungs Engine ([`js/einvoice.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/js/einvoice.js)) für CrossIndustryInvoice (CII) XML & Factur-X / ZUGFeRD PDF/A-3.
  - Stammdaten-Erweiterung für Kunden (`customer_type`, `leitweg_id`, `buyer_reference`, `peppol_id`) in `db.js`, `code.html` und `js/kunden.js`.
  - Integration von Leitweg-ID Vorschau, E-Rechnungs-Standards und XRechnung XML-Download im Rechnungs-Editor ([`js/editor.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/js/editor.js)).
- **Subunternehmer & Steuer-Regeln (§ 48b EStG, § 13b UStG, § 35a EStG):**
  - Implementierung von [`controllers/SubcontractorController.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/controllers/SubcontractorController.js) zur automatischen Freistellungsbescheinigungsprüfung (§ 48b) und 15% Bauabzugsteuer-Berechnung.
  - Einbindung des visuellen Subunternehmer § 48b Status-Banners im Rechnungs-Editor.
- **VOB/B Kumulierte Abschlagsrechnung & Sicherheitseinbehalt:**
  - Implementierung von [`controllers/CumulativeBillingController.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/controllers/CumulativeBillingController.js) ($F_t = L_t - \sum F_i$ und 5% VOB/B § 17 Sicherheitseinbehalt).
- **GAEB-Import & Projekt-Leistungsverzeichnis:**
  - GAEB X83 XML Parser & X84 Exporter ([`js/gaeb.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/js/gaeb.js)).
  - Integration der Drag-and-Drop GAEB Uploadzone und LV-Tabellendarstellung in der Projekt-Detailansicht ([`js/projekte.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/js/projekte.js)).
- **DATEV EXTF 700 & GoBD Immutability Engine:**
  - EXTF 700 Export Engine ([`js/datev.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/js/datev.js)) mit BU-Schlüsseln 19/68.
  - GoBD SHA-256 Hashkettung & Unveränderbarkeitsprüfung ([`js/gobd.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/js/gobd.js)).
- **Test-Automatisierung & Full-Stack System-Test (Plan 03 & Plan 04):**
  - Erstellung von [`scripts/generate_and_test.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/scripts/generate_and_test.js) & [`tests/end_to_end_generate.test.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/tests/end_to_end_generate.test.js).
  - Implementierung von [`scripts/run_full_system_test.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/scripts/run_full_system_test.js) & [`tests/full_system.test.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb_V2/tests/full_system.test.js).
  - Erzeugung aller Testbelege in `./output/invoices/` und Testberichte in `./tests/test_results/`.
  - Erfolgreiche Validierung aller 8 Bau-ERP Module (11/11 Test-Suites bestanden).
