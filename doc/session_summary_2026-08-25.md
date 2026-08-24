# Zusammenfassung der Entwicklungssitzung – F3 Putzplan & Reinigungs-LV + F10 E-Mail-Versand (SMTP)
**Datum:** 25.08.2026
**Projekt:** W-Link Rechnungsprogramm / Bau-ERP V2
**Ziel:** Umsetzung von F3 „Putzplan + Reinigungs-Leistungsverzeichnis mit Flächenbezug und RTV/BTV-Zuschlägen" (Marktlücke – hat kein Wettbewerber) und F10 „E-Mail-Versand (SMTP)" aus `Features/8_feature-roadmap.txt`.
**Methodik:** 3-Subagent-Kette: **Planung** (Detailpläne inkl. Web-Recherche) -> **Code** (`gebaeude-code`, Schritt für Schritt) -> **Prüfung** (QA/Reviewer mit Fix-Auftrag).

---

## 1. Planungsergebnis (Pläne in `plans/`)
- [`plans/putzplan-reinigungslv-plan.md`](../plans/putzplan-reinigungslv-plan.md) – F3 Putzplan/Reinigungs-LV (17 Umsetzungsschritte)
- [`plans/smtp-emailversand-plan.md`](../plans/smtp-emailversand-plan.md) – F10 SMTP-E-Mail-Versand (13 Umsetzungsschritte)

**Kernentscheidungen (aus Web-Recherche + Code-Analyse):**

| Bereich | Entscheidung |
|---|---|
| Turnus-Modell | 4 kanonische Typen: `X_PRO_WOCHE` / `ALLE_X_TAGE` / `X_PRO_MONAT` / `JAEHRLICH` -> daraus Einsätze/Jahr |
| LV-Struktur | `lv_bereiche` (Leistungsbereiche je Objekt) -> `lv_positionen` (Menge/Einheit, Zeitbedarf min, Preisbasis, Zuschlags-Anteile als JSON) -> `putzplan_eintraege` (Verknüpfung zu Liegenschaft/Gebäude/Etage/Raum) |
| Dauerrechnungs-Anbindung | Neue Spalte `abrechnungsplan_positionen.lv_position_id`; Übernahme des Objekt-LV in Abrechnungspläne über bestehenden F2-Mechanismus (`preise_live`) |
| RTV/BTV-Zuschläge | Konfigurierbar über Einstellungs-Key `reinigung_zuschlagsprofil` (nicht hart kodiert); „BTV" ist für Gebäudereinigung kein eigenes Satzwerk -> als frei benennbares/editierbares Profil gelöst |
| SMTP-Bibliothek | nodemailer im Main-Prozess; Port 465 = implicit TLS erzwungen, 587 = STARTTLS; `verify()` beim Verbindungstest; Transporter injizierbar (mockbar) |
| Credential-Speicherung | Electron `safeStorage`; Fallback markiert (`PLAINTEXT::` + Flag); Passwort verlässt den Main-Prozess nie (nur `hat_passwort`/`gespeichert_sicher` Flags an den Renderer) |

**Recherchierte Tarifdaten (Quellen im Plan):**
- RTV Gebäudereinigung v. 31.10.2019, § 3 Ziff. 4.7: Nachtarbeit (22–5 Uhr) **+30 %**, Sonn-/Feiertagsarbeit **+80 %**, hohe Feiertage **+200 %**, Mehrarbeit **+25 %**
- Branchenmindestlohn ab 01.01.2026: LG1 15,00 €/h, LG6 18,40 €/h
- Quellen: BIV-Vergabe-Empfehlung 01/2026 (die-gebaeudedienstleister.de), Tarifbroschüre Berlin 01/2025 (berlin.de)

## 2. Umsetzung (Code-Subagent)

### F3 Putzplan + Reinigungs-LV
- `controllers/ReinigungController.js`: pure Kalkulationslogik (Dual-Export Node/Browser) – Jahresleistung = Menge x Einsätze/Jahr x Zeitbedarf; Preis aus Basis-Stundensatz/Minutensatz + Zuschläge anteilig nach Zeitfenster-Anteilen; Stundensatz `0` = Profil-Fallback.
- Referenzfall aus dem Plan exakt getestet: **2.166,67 h · 32.500,00 € netto · 975,00 € Zuschläge · 33.475,00 € · Monatsanteil 2.789,58 €**.
- Schema: 3 Tabellen + 6 Indizes (`schema.js`), idempotente Migration `lv_position_id` (`db.js`).
- CRUD über dbAPI (`getPutzplan`, `saveLvBereich`, `saveLvPosition` inkl. Einträge in einer Transaktion, `deleteLv*`); Objekt-Löschschutz `pruefeObjektLvBezug` in allen 4 Delete-Handlern; Audit-Einträge je LV-Mutation.
- `uebernehmeLvInAbrechnungsplan`: LV-Positionen werden zu Abrechnungsplan-Positionen mit `lv_position_id`; Generierung nutzt Live-Preise (Integrationstest: Profil 15 -> 16 EUR => generierter Beleg folgt neuem Satz); GoBD-Kettenvalidierung im Test.
- UI: Sidebar `nav-putzplan`, View `putzplan` mit KPIs, Toolbar, Objektbaum links (Liegenschaft -> Gebäude -> Etage -> Raum), LV-Tabelle rechts, aufklappbare Putzplan-Einträge, Zuschlags-Breakdown-Tooltips, 4 Modals mit Live-Vorschau, Suchfilter.
- LV-Druckexport laut Plan optional/nach Freigabe -> nicht umgesetzt (offener Punkt).

### F10 E-Mail-Versand (SMTP)
- `main/email.js`: injizierbarer Service (`transportFactory`/`cryptoAdapter`), lazy Requires, Port-465-Secure-Erzwingung, Timeouts 15 s connect / 15 s greeting / 30 s socket, TLS >= 1.2, Secret-Stripping, safeStorage-Fallback.
- Versandablauf: `verify()` -> `sendMail()`; Versandhistorie wird immer geschrieben (auch FEHLGESCHLAGEN); „Wiederholen" aktualisiert dieselbe Zeile (`versuche++`); Audit `EMAIL_VERSENDET` / `EMAIL_FEHLGESCHLAGEN`.
- Tabelle `email_versandhistorie` + 2 Indizes; 7 IPC-Handler (`smtp:*`) + preload-Exposures.
- UI: Einstellungs-Karte „E-Mail-Versand (SMTP)" (Kontenliste mit Badges, Konto-Modal mit Inline-Verbindungstest, Gmail-Hinweis), Mailtexte-/Signatur-Einstellungen.
- Beleg-Anbindung: globales E-Mail-Modal am PDF-Preview (Empfänger vorbefüllt aus `kunde.email` inkl. Warnchip bei leer, Konto-Wahl, Betreff-/Text-Templates, Anhang-Chip, PDF-Kopie-Checkbox), Historien-Panel mit Wiederholen; angebunden an Rechnung, Angebot und Mahnung (Mahnstufe als Kontext).
- OAuth2/XOAUTH2 für M365 bewusst out of scope (Schnittstelle vorbereitet).

### Neue Dateien
- `controllers/ReinigungController.js`, `js/putzplan.js`, `main/email.js`
- `tests/reinigungslv_kalkulation.test.js`, `tests/reinigungslv_schema.test.js`, `tests/reinigungslv_crud.test.js`, `tests/smtp_email.test.js`

### Geänderte Dateien
`schema.js`, `db.js`, `main.js`, `preload.js`, `code.html`, `js/navigation.js`, `js/editor.js`, `js/einstellungen.js`, `views/InvoiceView.js`, `package.json` (nodemailer ^9.0.5)

## 3. Abweichungen vom Plan & Entscheidungen bei offenen Fragen
1. nodemailer ^9.0.5 statt geplanter ^7 – aktuelle npm-Version (Plang-Fassung war älter).
2. `getPutzplan` lädt nur Bereiche des gewählten Baumknotens (nicht Teilbaum) – UI zeigt den Baum links.
3. `kalk_stundensatz = 0` bedeutet „Profil-Standard folgen".
4. Versandhistorien-Panel liegt im E-Mail-Dialog statt direkt unter dem Belegkopf (geringerer Eingriff in den Editor, funktional gleichwertig).
5. Mahnungs-Kontext über `state.belegEmailKontext` mit Guard statt Umbau des `executePrint`.
6. Klartext-Fallback-Checkbox erscheint erst nach Save-Fehler „Sichere Speicherung nicht verfügbar".
7. Offene Fragen pragmatisch entschieden: „täglich" = werktäglich 5x/Woche als Default (7x wählbar, konfigurierbar); Mengen werden live aus dem Objektstamm berechnet (`menge_override=NULL`); BTV als frei benennbares Profil; RTV-Höchstprinzip nicht automatisiert (Zeitfenster-Anteile sind Nutzerinput); MwSt-Default 19 %.

## 4. Prüfergebnis (QA-Subagent)
Alle Prüfpunkte OK nach Fixes:
- IPC-Vollständigkeit: alle 15 neuen Kanäle (8x F3, 7x F10) 1:1 in `preload.js` gespiegelt, alle 27 `window.api`-Aufrufe existieren.
- Schema/Migration: FKs mit ON DELETE CASCADE, Indizes, duplicate-column-sichere Migration, `PRAGMA foreign_keys=ON`, schema.js <-> db.js widerspruchsfrei.
- Kalkulation: Referenzfall exakt; Stundensatz-Fallback aufs Profil bei 0.
- RTV-Profil konfigurierbar, Defaults Nacht 30 / Sonn-/Feiertag 80 / hoher Feiertag 200 (%), nichts hart kodiert.
- SMTP-Sicherheit: Port 465 erzwingt secure, Timeouts gesetzt, Passwort nie im Klartext an den Renderer, PLAINTEXT-Fallback markiert, Historie auch bei Fehler, Wiederholen updated dieselbe Zeile.
- GoBD: Audit für LV-Mutationen + E-Mail-Versand/Fehler; Test bestätigt: Beleg-Hash durch Versand UNVERÄNDERT, Kettenvalidierung valid; Objekt-Löschschutz in allen 4 Delete-Handlern vor Beleg-Check.
- UI: alle 57 IDs aus `js/putzplan.js` in `code.html` vorhanden, Script-Reihenfolge korrekt, deutschsprachig, Stil wie Nachbar-Views; E-Mail an Rechnung/Angebot/Mahnung angebunden.
- Regression: nur additive, element-guarded Änderungen an Bestandsdateien; `executePrint` unverändert.

**Gefixte Defekte durch die Prüfung:**
1. Realer Bug (`main/email.js`): `speichereKonto` löschte den gespeicherten Benutzernamen, wenn der Renderer `user: ''` sandte – was die UI systematisch tut (Edit-Formular kann User nicht vorbefüllen). Jede Konto-Bearbeitung hätte SMTP-Auth zerstört. Fix: leerer String = bestehenden Benutzernamen behalten (wie beim Passwort) + Regression-Testfall.
2.–4. Code-Cleanups in `js/putzplan.js`: toter Ausdruck entfernt, redundanter Ternary vereinfacht, ungenutzte Parameter entfernt.

**Freigabe-Empfehlung des Prüfers: JA MIT AUFLAGEN** (siehe unten).

## 5. Testergebnis
- `npm test` -> **146 pass / 0 fail** (Baseline vor Umsetzung: 130 pass). Final von Orchestrator verifiziert.

## 6. Weiterhin offene Punkte
1. Manueller End-to-End-SMTP-Smoke gegen echten Provider (z. B. Gmail App-Passwort oder smtp4dev): Senden + Fehlerpfad + Wiederholen (Auflage aus der Prüfung).
2. OAuth2/XOAUTH2 für M365 nicht implementiert (Schnittstelle in `main/email.js` vorbereitet).
3. „Wiederholen" löst das Konto über `smtp_konto_name` auf; bei Konto-Umbenennung Fallback auf Standard/erstes Konto – ggf. später auf konto_id erweitern (P3).
4. Badge „Live aus LV" in der Dauerrechnungen-Liste (Detail aus Plan F3) noch offen.
5. LV-Druckexport (Plan-Schritt 18, optional) nicht umgesetzt.
6. Keine Commits durchgeführt – Änderungen liegen unversioniert im Arbeitsverzeichnis.
