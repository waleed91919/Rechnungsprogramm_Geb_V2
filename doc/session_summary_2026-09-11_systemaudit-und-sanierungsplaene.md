# Session Summary: Gesamtsystem-Audit & Architektur-Sanierungspläne (11.09.2026)

**Projekt:** W-Link ERP (`Rechnungsprogramm_Geb_V2`)  
**Datum:** 11. September 2026  
**Fokus:** Tiefenprüfung der gesamten Codebasis anhand von `doc/app-map/`, webgestützte Recherche aktueller Normen & Rechtsstandards, Konzeption von 5 modularen Sanierungsplänen sowie unabhängiges Stress-Testing der Pläne durch Reviewer-Subagents.  
**Ergebnis:** 
- 1 Gesamtauditbericht (`doc/` & `plans/`)
- 5 vollständige Implementierungspläne (`plans/plan-01` bis `plan-05`)
- 1 Master-Review-Bericht (`doc/` & `plans/`)
- 1 Master-Index (`plans/README.md`)

---

## 1. Ausgangslage & Zielsetzung

Auf Basis der Architektur-Dokumentation in [`doc/app-map/`](file:///F:/server/Rechnungsprogramm_Geb_V2/doc/app-map/) sollte die gesamte Codebasis des ERP-Systems auf strukturelle Risiken, Rechtskonformität, Sicherheitslücken und Inkonsistenzen geprüft werden.

Besonderer Wert wurde darauf gelegt:
1. **Spezialisierte Subagents** für jeden Fachbereich einzusetzen.
2. Mittels **Web-Recherche** den aktuellen Stand der Technik und gesetzliche Vorgaben (Stichtag 2026) zu verifizieren.
3. Für alle identifizierten Probleme **robuste, produktionsreife Sanierungspläne** zu erarbeiten.
4. Diese Pläne durch **unabhängige Reviewer-Subagents** einem gnadenlosen Stress-Test zu unterziehen, um Planungsfehler vorab zu eliminieren.

---

## 2. Phase 1: Fach-Audits (6 spezialisierte Subagents)

Sechs autonome Research-Agents wurden parallel gestartet, um die Codebasis zu analysieren:

| Subagent / Domäne | Untersuchte Kernmodule | Wichtigste Erkenntnisse |
|---|---|---|
| **1. Rechnungskern, VOB/B & E-Rechnung** | `controllers/InvoiceController.js`, `CumulativeBillingController.js`, `views/InvoiceView.js`, `js/editor.js`, `js/einvoice.js`, `main/zugferd-builder.js` | **B-1:** Veraltete URN `xoev-de` in XRechnung 3.0 führt zur 100%-Abweisung an Bundesportalen (BR-DE-21).<br>**B-3:** Belegfixierung verletzt — Export liest aus ungesichertem DOM/State.<br>**B-14:** Steuerdiskrepanz zwischen Controller und E-Rechnungs-Generator riskiert Steuerschuld nach § 14c UStG.<br>**B-4 / B-5:** 5%-Deckel nach VOB/B § 17 geht im Formular verloren; Vorgängerfilter bezieht Angebote und Stornos ein. |
| **2. Electron, IPC, GoBD & SQLite** | `main.js`, `preload.js`, `db.js`, `schema.js`, `main/audit.js`, `main/backup.js` | **SEC-1:** RCE-Gefahr durch ungeprüftes `shell.openExternal`.<br>**GOBD-1 / GOBD-2:** Festgeschriebene Belege können überschrieben werden; rechtswidriges `entsperreBeleg` vorhanden.<br>**DB-1:** Fehlendes `PRAGMA busy_timeout = 5000;` führt zu SQLite-Crashes bei nebenläufigem Zugriff.<br>**DB-4:** Fehlende Fremdschlüssel-Indizes auf `positionen(dokumentId)`. |
| **3. Projekt, Aufmaß & Nachträge** | `js/projekte.js`, `views/AufmassView.js`, `controllers/AufmassController.js`, `NachtragController.js`, `js/da11.js`, `js/gaeb-x31.js` | **BUG-01:** DA11 verwendet fälschlicherweise Satzart 12 statt 11 (REB 23.003), wodurch Importe alle Zeilen ignorieren.<br>**BUG-03:** Nachtragsübernahme speichert ohne vorhandene Beleg-ID nicht in der DB (Schein-Persistenz).<br>**BUG-04:** Tests in `uebergaben_persistenz.test.js` prüften nur Source-Code-Strings statt echter DB-Operationen.<br>**BUG-05:** Idempotenz-Key kollidiert bei gleichnamigen Nachtragspositionen. |
| **4. Banking, OPOS, SEPA & DATEV** | `controllers/BankingController.js`, `SepaController.js`, `js/banking.js`, `js/datev.js`, `InvoiceController.js` | **DAT-1:** DATEV exportiert Zahlbeträge auf Automatikkonto 8400 (führt zu massiver Steuerverkürzung).<br>**DAT-2:** 7% USt wird ignoriert und als 19% verbucht.<br>**OPOS-1:** Regex-Fehlalarm matcht die Jahreszahl `2026` im Verwendungszweck und ordnet Zahlungen falsch zu.<br>**SAL-1:** Saldenformel subtrahiert freigegebene Sicherheitseinbehalte statt sie als Forderung auszuweisen. |
| **5. Sync-Server & PWA-Sicherheit** | `main/sync-server.js`, `main/sync-config.js`, `pwa/**`, `tests/sync_*.test.js` | **SYNC-1:** Foto-Upload prüft weder MIME-Typ noch Magic Bytes (Remote-Upload beliebiger Payloads möglich).<br>**SYNC-2:** Blindes Last-Write-Wins führt zu Datenverlust bei parallelen Offline-Aufmaßen.<br>**SYNC-4:** PWA Service Worker aktualisiert gecachte Assets bei Desktop-Updates nicht zuverlässig. |
| **6. Frontend & Experimentelle Module** | `js/navigation.js`, `GrosshandelView.js`, `controllers/IDSConnectController.js`, `ZeiterfassungController.js`, `SokaBauController.js` | **NAV-1:** Fokusmodus (`applyFocusMode`) wird im App-Lifecycle nie aufgerufen.<br>**MOCK-1:** IDS Connect 2.5 enthält hartcodierte 45€/75€ Mock-Preise.<br>**COMP-1:** Zeiterfassung führt unzulässiges Hard-Delete ohne Revisionsprotokoll aus. |

Der vollständige Prüfbericht mit allen 47 Findings wurde gespeichert unter:
- [`plans/audit_gesamtbericht_2026-09-11.md`](file:///F:/server/Rechnungsprogramm_Geb_V2/plans/audit_gesamtbericht_2026-09-11.md)
- [`doc/audit_gesamtbericht_2026-09-11.md`](file:///F:/server/Rechnungsprogramm_Geb_V2/doc/audit_gesamtbericht_2026-09-11.md)

---

## 3. Phase 2: Sanierungsplanung (5 Planungs-Architekten)

Fünf Planungs-Architekten konzipierten auf Basis fundierter Web-Recherche detaillierte Sanierungspläne:

1. [`plans/plan-01-erechnung-vobb-kern.md`](file:///F:/server/Rechnungsprogramm_Geb_V2/plans/plan-01-erechnung-vobb-kern.md)
   - Umstellung der CIUS URN auf `urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0` (BR-DE-21 konform).
   - Single-Source-of-Truth Belegexport (`PDF == XML == DB`) direkt via `db:getDocument` aus SQLite.
   - Harmonisierung der Steuerberechnung (§ 13 vs. § 14c UStG) bei Abschlagsverrechnungen (BT-113 Prepaid Amount).
   - Dynamischer 5%-Deckel nach VOB/B § 17 Abs. 6 & VOB/A § 9c im Formular und Controller.
2. [`plans/plan-02-electron-gobd-sqlite.md`](file:///F:/server/Rechnungsprogramm_Geb_V2/plans/plan-02-electron-gobd-sqlite.md)
   - Härtung von `shell.openExternal` mit Protokoll-Whitelist (`http:`, `https:`, `mailto:`).
   - GoBD-konforme Unveränderbarkeit: Sperre greift bei `Festgeschrieben`, `Bezahlt` und `Storniert`. Vollständige Entfernung von `entsperreBeleg`.
   - SQLite-Härtung: `PRAGMA busy_timeout = 5000;` und Performance-Indizes auf Fremdschlüsseln.
   - Sicherer Backup-Restore mit Prozess-Isolation und automatischem Neustart.
3. [`plans/plan-03-aufmass-nachtrag.md`](file:///F:/server/Rechnungsprogramm_Geb_V2/plans/plan-03-aufmass-nachtrag.md)
   - Normgerechter DA11-Parser & Generator nach REB-VB 23.003 (Satzart 00, 11, 99; exakte 80-Zeichen CRLF Spaltenbreiten).
   - Vollständige Persistenz bei Nachtrags- und Aufmaßübergaben in atomaren SQLite-Transaktionen.
   - GAEB X31 XML-SAX/DOM-Parser mit Erhalt des Adressbezugs `A0`.
   - Kumulative Projekt-Rentabilitätsformel ($Umsatz = L_t$).
4. [`plans/plan-04-banking-datev-sepa.md`](file:///F:/server/Rechnungsprogramm_Geb_V2/plans/plan-04-banking-datev-sepa.md)
   - DATEV EXTF 700 Generator: Bruttobuchung auf Erlöskonten 8400 (19%), 8300 (7%), 8337 (§ 13b) zur Beseitigung von Steuerunterdeckungen.
   - OPOS-Matcher mit Token-Grenzen (`\b`) zur Verhinderung von Fehlzuordnungen auf die Jahreszahl `2026`.
   - SEPA XML `pain.008.001.08` mit strukturierter Adresse (`<PstlAdr>`) gemäß EPC-Pflicht ab November 2026.
   - Kaufmännische Saldenberechnung: `offenerSaldo = (fakturiert + freigegeben) - gezahlt`.
5. [`plans/plan-05-sync-pwa-frontend.md`](file:///F:/server/Rechnungsprogramm_Geb_V2/plans/plan-05-sync-pwa-frontend.md)
   - Magic-Bytes-Prüfung für WebP (`RIFF....WEBP`), JPEG und PNG im Foto-Upload.
   - Hybrid Logical Clocks (HLC) mit 60-Sekunden-Drift-Guard für verzweigte Offline-Erfassungen.
   - Service Worker Cache-Busting via Schema-Handshake.
   - Sichtbare UI-Checkbox für den Fokusmodus in den Einstellungen und harte Router-Guards.
   - Revisionssicheres Soft-Delete für die Zeiterfassung nach BAG/EuGH.

---

## 4. Phase 3: Stress-Testing & Review (5 unabhängige Reviewer)

Fünf unabhängige Reviewer prüften die 5 Sanierungspläne auf Plausibilität, Normtreue und Kompatibilität mit dem bestehenden Code.

**Reviewer-Urteil:** Alle 5 Pläne wurden mit **Freigabe unter Auflagen** bewertet. Die Reviewer deckten dabei 5 kritische Planungsfehler auf, die bei einer unbedarften Umsetzung zu Laufzeitfehlern oder Normverletzungen geführt hätten:

1. **Plan 01:** `calcRetention` darf in `InvoiceController.js` erst *nach* der Ermittlung von `totalTax` ausgeführt werden, da sonst 7%-Positionen mit 19% versteuert werden. Zudem fehlten die Spalten `zahlbetrag` in `dokumente` und `abzugsbetrag_brutto` in `rechnung_verrechnungen`.
2. **Plan 02:** Der geplante SQLite-Trigger `trg_prevent_locked_positionen_delete` hätte das Speichern blockiert! Grund: `applyDocumentWrite` setzt den Dokumentstatus auf `Festgeschrieben`, *bevor* die Positionen neu geschrieben werden. Die Transaktionsreihenfolge muss zwingend erst alte Positionen löschen und erst danach den Beleg sperren.
3. **Plan 03:** In SQLite lautet der Spaltenname `rechnungsart`, NICHT `typ`! Eine Abfrage nach `r.typ === 'SCHLUSSRECHNUNG'` hätte immer `undefined` geliefert und die Kumulierung ausgehebelt.
4. **Plan 04:** In SEPA `pain.008.001.08` verlangt ISO 20022 eine strikte XML-Reihenfolge (`xs:sequence`: `StrtNm`, `BldgNb`, `PstCd`, `TwnNm`, `Ctry`). Der Plan platzierte `<Ctry>` an erster Stelle, was zur sofortigen Abweisung durch die Bundesbank geführt hätte.
5. **Plan 05:** Die Magic-Bytes-Validierung für WebP vergaß die Chunks `VP8 `, `VP8L`, `VP8X` ab Byte 12. Die SQLite-Einstellung für experimentelle Module liefert den String `'true'`, was gegen ein striktes Boolean-Prädikat evaluiert hätte.

Der Master-Review-Bericht mit allen Detailkorrekturen wurde gespeichert unter:
- [`plans/audit_review_master_report_2026-09-11.md`](file:///F:/server/Rechnungsprogramm_Geb_V2/plans/audit_review_master_report_2026-09-11.md)
- [`doc/audit_review_master_report_2026-09-11.md`](file:///F:/server/Rechnungsprogramm_Geb_V2/doc/audit_review_master_report_2026-09-11.md)

---

## 5. Dateistruktur & Persistenz

Alle erzeugten Pläne und Berichte sind dauerhaft in der Projektstruktur hinterlegt:

```text
Rechnungsprogramm_Geb_V2/
├── plans/
│   ├── README.md                            <-- Master-Inhaltsverzeichnis
│   ├── audit_gesamtbericht_2026-09-11.md    <-- Vollständiger Auditbericht (47 Befunde)
│   ├── audit_review_master_report_2026-09-11.md <-- Konsolidiertes Reviewer-Gutachten
│   ├── plan-01-erechnung-vobb-kern.md       <-- Sanierungsplan E-Rechnung & VOB/B
│   ├── plan-02-electron-gobd-sqlite.md      <-- Sanierungsplan Security, GoBD & SQLite
│   ├── plan-03-aufmass-nachtrag.md          <-- Sanierungsplan REB 23.003 & Nachtrag
│   ├── plan-04-banking-datev-sepa.md        <-- Sanierungsplan DATEV, SEPA & OPOS
│   └── plan-05-sync-pwa-frontend.md         <-- Sanierungsplan Sync, PWA & Frontend
└── doc/
    ├── audit_gesamtbericht_2026-09-11.md
    ├── audit_review_master_report_2026-09-11.md
    ├── session_summary_2026-09-11_systemaudit-und-sanierungsplaene.md
    └── changelog.md
```

---

## 6. Fazit & Nächste Implementierungsphase

Durch das mehrstufige Agenten-Audit und die Review-Schleife liegt nun eine lückenlose, normgeprüfte und praxistaugliche Architektur-Roadmap vor.

Die Implementierung kann nun schrittweise erfolgen:
- **Phase 1:** Security- & SQLite-Fundament ([`plan-02`](file:///F:/server/Rechnungsprogramm_Geb_V2/plans/plan-02-electron-gobd-sqlite.md))
- **Phase 2:** Rechnungskern & E-Rechnung ([`plan-01`](file:///F:/server/Rechnungsprogramm_Geb_V2/plans/plan-01-erechnung-vobb-kern.md))
- **Phase 3:** Aufmaß & Nachträge ([`plan-03`](file:///F:/server/Rechnungsprogramm_Geb_V2/plans/plan-03-aufmass-nachtrag.md))
- **Phase 4:** DATEV & Banking ([`plan-04`](file:///F:/server/Rechnungsprogramm_Geb_V2/plans/plan-04-banking-datev-sepa.md))
- **Phase 5:** Sync & Frontend ([`plan-05`](file:///F:/server/Rechnungsprogramm_Geb_V2/plans/plan-05-sync-pwa-frontend.md))
