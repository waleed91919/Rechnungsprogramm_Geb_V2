# Changelog / Fortschritt

## 27.09.2026 (liesen.txt: Saubere Trennung und Neugestaltung des Handwerks- und Baubereichs für Angebote)
- **Dedizierte Sektion "Bauvorhaben & Vertragsbedingungen" für Angebote (`views/modals/rechnung-modal.html` & `js/modal-loader.js`):**
  - **Beseitigung von `Handwerk & Erweiterte Angaben (VOB/GoBD)` im Angebot:** Der für Rechnungen gedachte Abschnitt mit Rechnungsart, Bauabzugsteuer (§ 48 EStG) und GoBD-Hinweisen wurde für Angebote vollständig eliminiert.
  - **Neue Kernsektion `#angebot-bauvorhaben-section`:**
    * **Titel:** `Bauvorhaben & Vertragsbedingungen`
    * **Baustellen-Adresse (`angebot-baustellen-adresse`):** Beibehalten zur Erfassung des Bauorts.
    * **Voraussichtlicher Ausführungszeitraum (`angebot-ausfuehrung-von`, `angebot-ausfuehrung-bis`):** Umbenannt von "Leistungszeitraum" in "Voraussichtlicher Ausführungszeitraum", da die Bauausführung erst künftig stattfindet.
    * **Auftraggeber-Typ (`angebot-auftraggeber-typ`) & Vertragsgrundlage (`angebot-vertragsgrundlage`):** Integriert mit dynamischem Warnhinweis zu § 650m BGB (Verbraucherbauvertrag).
    * **Einklappbare Erweiterte Vertragsbedingungen (`<details>`):**
      - **Sicherheitseinbehalt (%) (`angebot-sicherheitseinbehalt`):** Als optionale Bedingung ausgelagert, synchronisiert mit den internen Kalkulationsfeldern.
      - **§ 13b UStG Reverse Charge (`angebot-13b-ustg`):** Als erweiterte Option für B2B-Bauleistungen verfügbar, steuert die Steuerausweisung und ist für Privatkunden (B2C) automatisch gesperrt.
- **Zustands- & Sichtbarkeitssteuerung (`js/editor.js`):**
  - `setupRechnungModalUI()`: Zeigt `#rechnung-handwerk-section` an und blendet `#angebot-bauvorhaben-section` aus.
  - `setupAngebotModalUI()` & `applyAngebotEditMode()`: Blenden `#rechnung-handwerk-section` strikt aus und zeigen `#angebot-bauvorhaben-section` an. Rechnungsart ist im Angebot nicht mehr sichtbar.
  - `applyUnternehmensartVisibility()`: Beachtet `state.isAngebotMode` und verhindert, dass das Handwerksmodul im Angebotsmodus wieder eingeblendet wird.
  - **Automatische Synchronisation:**
    * Änderung an `angebot-auftraggeber-typ`: `PRIVAT` setzt `ist_privatkunde = 1` und aktiviert B2C (inkl. Brutto-Zwang nach PAngV); `GEWERBLICH` setzt `ist_privatkunde = 0` und aktiviert B2B; `OEFFENTLICH` aktiviert B2G.
    * Änderung an `angebot-vertragsgrundlage`: `VOB_B` setzt automatisch `vob_vereinbart = 1`; andere Grundlagen setzen `vob_vereinbart = 0`.
  - `collectAngebotFormData()`: Liest alle Felder aus `#angebot-bauvorhaben-section` sauber aus und persistiert sie im Belegobjekt.
- **Automatisierte Electron UI-Tests (`tests/test_electron_runner.js`):**
  - Testfall 1 & 2 verifizieren im echten Chromium-DOM:
    * Im Angebotsmodus ist `#rechnung-handwerk-section` ausgeblendet.
    * `#angebot-bauvorhaben-section` ist sichtbar mit Überschrift `Bauvorhaben & Vertragsbedingungen`.
    * Kein `rechnung-art` im Angebotsmodus sichtbar.
    * Beschriftung `Voraussichtlicher Ausführungszeitraum` vorhanden.
    * `auftraggeber_typ` steuert `ist_privatkunde` automatisch.
    * `vertragsgrundlage` steuert `vob_vereinbart` automatisch.
    * Modus-Trennung: Wechsel zwischen Angebots- und Rechnungsmodus blendet die jeweils richtige Sektion ein/aus.
- **Verifikation:**
  - `node --test tests/angebot_true_ui_and_pdf.test.js`
  - `node --test tests/angebot_ui_workflow.test.js`
  - `node --test tests/angebot_lifecycle.test.js`
  Alle Tests zu 100% grün.

## 27.09.2026 (liesen.txt: Baurechtliche und vertragliche Präzisierung von Annahmefrist & Vertragsgrundlage)
- **Rechtssichere Annahmefrist gem. § 148 BGB (`js/einstellungen.js`):**
  - **Beseitigung des Widerspruchs "freibleibend" vs. Frist:** Die juristisch widersprüchliche Formulierung *"Dieses Angebot ist freibleibend gültig bis zum [Datum]"* wurde eliminiert (§§ 145, 148 BGB). Ein mit Annahmefrist versehenes Angebot bindet den Anbieter nach deutschem Recht bis zum Ablauf der Frist; die gleichzeitige Verwendung von "freibleibend" erzeugt unzulässige Rechtsunsicherheit.
  - **Präzise Formulierung:** In allen drei Druckvorlagen (*modern*, *klassisch*, *minimalistisch*) lautet der Text nun: `"Dieses Angebot kann bis zum [faelligStr] angenommen werden."`.
- **Konkrete Ausweisung der Vertragsgrundlage (`js/einstellungen.js`):**
  - **Beseitigung der pauschalen Alternativklausel:** Die pauschale Entweder-Oder-Klausel *"gemäß VOB/B bzw. BGB-Werkvertrag"* wurde entfernt, da die VOB/B im BGB-Recht nicht automatisch Vertragsbestandteil wird.
  - **Zentrale Hilfsfunktion `getAngebotKonditionenText(rech, faelligStr, customKonditionen)`:**
    * Ermittelt die im Angebot tatsächlich gewählte Vertragsgrundlage (`rech.vertragsgrundlage` bzw. `rech.vob_vereinbart`):
      - `VOB_B`: `"Vertragsgrundlage: VOB/B (Vergabe- und Vertragsordnung für Bauleistungen, Teil B). Zahlungsbedingungen: Abschlagszahlungen nach Leistungsfortschritt gemäß § 16 VOB/B."`
      - `BGB_VERBRAUCHERBAU`: `"Vertragsgrundlage: Verbraucherbauvertrag (§ 650i BGB). Zahlungsbedingungen: Abschlagszahlungen nach Baufortschritt gemäß § 650m BGB."`
      - `BGB_WERKVERTRAG` (Standard): `"Vertragsgrundlage: BGB-Werkvertrag (§§ 631 ff. BGB). Zahlungsbedingungen: Abschlagszahlungen nach Leistungsstand gemäß § 632a BGB."`
    * Sofern individuelle `customKonditionen` bzw. `rech.zahlungsbedingungen` erfasst wurden, werden diese als individuelle Vereinbarung herangezogen.
- **Erweiterung der automatisierten Electron DOM- und PDF-Tests (`tests/test_electron_runner.js`):**
  - Testfall 2 prüft die PDF-Vorschau im echten Chromium DOM nun strikt auf:
    * Ausweisung der verbindlichen Annahmefrist (`Dieses Angebot kann bis zum`).
    * Vollständige Abwesenheit von `freibleibend`.
    * Vollständige Abwesenheit von `bzw. BGB-Werkvertrag`.
    * Konkrete Ausweisung der gewählten Vertragsgrundlage (`Vertragsgrundlage: BGB-Werkvertrag`).
- **Testverifikation:**
  - `node --test tests/angebot_true_ui_and_pdf.test.js`
  - `node --test tests/angebot_ui_workflow.test.js`
  - `node --test tests/angebot_lifecycle.test.js`
  Alle Tests erfolgreich bestanden (3/3 grün).

## 27.09.2026 (liesen.txt: Vollständige Trennung des Angebots-PDF-Templates vom Rechnungs-Template)
- **Vollständige Trennung Angebot vs. Rechnung in den PDF-Vorlagen (`js/einstellungen.js`):**
  - **Erkennung `isAngebot`:** `buildInvoiceDocumentHtml(rech, kunde, isAngebot = false)` erkennt Angebote nun auch automatisch anhand von Dokumenteigenschaften (`rech.type === 'angebot' || rech.doc_type === 'angebot'`), selbst wenn das Flag nicht explizit übergeben wird.
  - **Datumsbezeichnung DIN 5008:** In allen drei Vorlagen (*modern*, *klassisch*, *minimalistisch*) wird für Angebote statt `Rechnungsdatum:` das korrekte Label `Angebotsdatum:` gerendert.
  - **Kein falsches Leistungsdatum auf Tagesdatum:** Ein Angebot hat zum Erstellungszeitpunkt kein fälliges Leistungsdatum. Das automatische Setzen des Angebotsdatums als Leistungsdatum wurde für Angebote vollständig eliminiert.
  - **Voraussichtlicher Ausführungszeitraum:** Liegt ein vereinbarter oder geplanter Zeitraum vor (`rech.leistungszeitraum_von` und `rech.leistungszeitraum_bis` oder `rech.ausfuehrungszeitraum`), wird dieser im Infoblock als `Voraussichtl. Ausführung:` und in den Textabsätzen als `Voraussichtlicher Ausführungszeitraum:` ausgewiesen. Ohne hinterlegten Zeitraum wird die Zeile im Angebots-Infoblock sauber ausgeblendet.
  - **Bereinigung von `legalTextsHtml`:** Der rechnungsspezifische Steuerhinweis *"Das Liefer- und Leistungsdatum entspricht, sofern nicht anders angegeben, dem Rechnungsdatum."* sowie die 21-tägige VOB/B-Zahlungsfrist und der § 14b Abs. 1 UStG Aufbewahrungshinweis für Privatkunden werden für Angebote nicht mehr ausgegeben.
  - **Löschung der Zahlungsaufforderung im Abschlussbereich:** Die Aufforderung *"Bitte überweisen Sie den Betrag bis zum ... unter Angabe der Rechnungsnummer"* wurde für Angebote in allen drei Templates entfernt. Das Gültigkeitsdatum (`faelligStr`) kennzeichnet das Ende der Bindefrist, kein Zahlungsziel.
  - **Neuer sachlicher Konditionenblock:** Für Angebote wird der Block *"Konditionen & Gültigkeit:"* mit dem sachlichen Hinweis *"Dieses Angebot ist freibleibend gültig bis zum [faelligStr]. Zahlungsbedingungen: [individuell oder: Nach Vereinbarung und Leistungsfortschritt (gemäß VOB/B bzw. BGB-Werkvertrag)]."* formuliert.
  - **Summenblock:** Die Hervorhebung im Summenblock lautet für Angebote nun zutreffend `Angebotssumme (Brutto)` statt `Zahlbetrag`.
  - **GiroCode / EPC-QR:** Geprüft und sichergestellt, dass kein EPC-QR-Code auf Angeboten generiert wird (`!isAngebot`).
- **Formulardaten-Erfassung (`js/editor.js`):**
  - `collectAngebotFormData` erfasst nun auch `leistungszeitraum_von`, `leistungszeitraum_bis`, `ausfuehrungszeitraum`, `zahlungsbedingungen` und `konditionen`.
- **Echte Electron- und DOM-Tests (`tests/test_electron_runner.js`):**
  - Testfall 2 prüft jetzt strikt im echten DOM:
    * `hasAngebotsdatum` ist wahr.
    * `hasRechnungsdatum` ist falsch.
    * `hasLeistungsdatum` ist falsch (kein Tagesdatums-Fallback).
    * `hasZahlungsaufforderung` ist falsch (kein "Bitte überweisen Sie den Betrag").
    * `hasAngebotssumme` ist wahr.
    * `hasZahlbetrag` ist falsch.
    * Angebot mit Ausführungszeitraum rendert `Voraussichtl. Ausführung:`.
- **Regressionstests:** Alle automatisierten Node- und Electron-Tests sind grün.

## 27.09.2026 (liesen.txt: Leerpreis vs. 0,00 € Trennung, präzise Versandregistrierung & echter Electron UI- + PDF-Test)
- **Korrektur der Leerpreis-Behandlung & saubere Risiko-Validierung (`js/editor.js`):**
  - **Erhaltung von Leerpreisen als `null`:** In `collectAngebotFormData()` wird ein leerer String oder ungültiger Wert nicht mehr fälschlich zu `0.00` gewandelt, sondern sauber als `null` übergeben (`(rawPreis === '' || isNaN(parseFloat(p.preis))) ? null : parseFloat(p.preis)`).
  - **Positionserstellung & Change-Handler:** In `handlePositionChange()` und `addRechnungPosition()` bleibt `pos.preis = null` bei leerer Eingabe bzw. im Angebotsmodus erhalten. Im DOM (`createRechnungPositionRow`) bleibt das Eingabefeld leer.
  - **Saubere Unterscheidung in `validateAngebot`:** Ein leeres Preisfeld triggert verlässlich den harten Blocker `FEHLENDER_PREIS` und verhindert das Einfrieren/Versenden. Ein explizit eingetragener Preis von `0,00 €` löst hingegen den Bestätigungsdialog `PREIS_NULL_BESTAETIGUNG` aus.
- **Präzise Erfolgsformulierung beim Versand (`js/editor.js`):**
  - Toast-Meldung in `registerAngebotVersand()` präzisiert zu: `"Angebot [Nr] (v[Version]) wurde erfolgreich eingefroren und der Versand registriert."` (da das System den internen Zustand fixiert und den Versandvorgang protokolliert, jedoch keine externe Empfangsbestätigung des Empfängers fingiert).
- **Echter Electron UI- und PDF-Workflow-Test (`tests/angebot_true_ui_and_pdf.test.js` & `tests/test_electron_runner.js`):**
  - **Test in echter Electron Chromium-Laufzeit:** Vollständige Automatisierung im tatsächlichen Electron `BrowserWindow` mit echtem DOM und IPC-Brücke.
  - **Interaktion über echte DOM-Elemente & Buttons:**
    * Klick auf `#btn-freeze-angebot` mit leerem Preisfeld -> Prüfung schlägt mit `FEHLENDER_PREIS` fehl, Angebot bleibt im Entwurf.
    * Klick auf `#btn-freeze-angebot` mit `0.00` -> Bestätigungsdialog `PREIS_NULL_BESTAETIGUNG` wird geöffnet und bestätigt.
    * Klick auf `#btn-preview-angebot-pdf` -> Öffnet `#pdf-preview-modal`, rendert Angebot in `#pdf-preview-container`, Status bleibt `ENTWURF` und `freeze_snapshot_json` bleibt `null`.
    * Generierung von 1.150 echten PDF-Bytes mit `@cantoo/pdf-lib` und Verifikation des magischen Headers `%PDF-`.
    * Klick auf `#btn-freeze-angebot` -> Einfrieren, Erfolgs-Toast `"wurde erfolgreich eingefroren und der Versand registriert"`, Deaktivierung aller 38 Formular-Inputs, Status-Badges im Header und Dashboard auf `v1` / `Versendet`.
    * Klick auf `#btn-neue-version-angebot` -> Erzeugung von `v2` als editierbarer `ENTWURF`.
    * Klick auf `#btn-accept-angebot` -> Statuswechsel auf `ANGENOMMEN`.
    * Klick auf `#btn-create-project-angebot` -> Projektanlage in SQLite mit `source_angebot_id`, `source_angebot_version = 2` und `projekt_positionen` mit `source_angebot_pos_id`.
    * Dashboard-Tabelle verlinkt über Button `"Zum verknüpften Projekt"`.
    * SQLite DB-Reload & `PRAGMA foreign_key_check` liefert 0 Fehler.
  - **Integrierter Node-Testrunner:** Über `node --test tests/angebot_true_ui_and_pdf.test.js` nahtlos in die Testpipeline eingebunden.

## 27.09.2026 (liesen.txt: Steps 1, 2 & 3 – Vollständiger Angebots-Workflow, Post-Versand & E2E-Restart-Verifikation)
- **Schritt 1: Vollständiger Angebots-Workflow im UI (`js/editor.js`, `views/modals/rechnung-modal.html`, `controllers/AngebotController.js`, `models/AngebotModel.js`):**
  - **Angebotserstellung & Entwurfsmodus:** Angebote können im UI angelegt und revisionssicher als `ENTWURF` gespeichert werden, inklusive Metadaten für Auftraggeber-Typ (`PRIVAT`, `GEWERBLICH`, `OEFFENTLICH`) und Vertragsgrundlage (`BGB_WERKVERTRAG`, `BGB_VERBRAUCHERBAU`, `VOB_B`) mit kontextsensitivem BGB § 650m Hinweisfeld.
  - **Positionstypen & Endsummensteuerung:** Normal-, Alternativ-, Bedarfs- und Pauschalpositionen werden im Editor mit Auszeichnung und Checkbox `in Endsumme` unterstützt.
  - **PDF-Vorschau ohne Statuswechsel:** Aufruf der PDF-Vorschau rendert das Dokument, belässt den Status garantiert auf `ENTWURF` und erzeugt keinen verfrühten Freeze-Snapshot (`freeze_snapshot_json` bleibt `NULL`).
  - **Explizite Aktion "Versand registrieren (Einfrieren)":**
    * Führt vor dem Versand die baurechtliche Risikoprüfung via `AngebotController.validateAngebot` aus.
    * Prüft Bestätigung für 0,00 € Positionen und weist auf BGB § 650m Grenzen hin (90% Abschlagsdeckel, 5% Sicherheitsleistung).
    * Friert bei Bestätigung das Angebot mit einem unveränderlichen JSON-Snapshot (`freeze_snapshot_json`) ein und setzt den Status auf `VERSENDET`.
- **Schritt 2: Post-Versand Workflow & Nachverhandlung (`js/dashboard.js`, `js/editor.js`, `code.html`):**
  - **Versions- und Status-Badges:**
    * In der Angebotsliste (`#view-angebote`) wird eine dedizierte Version-Spalte mit Badges (`v1`, `v2`, `v3` etc.) angezeigt.
    * Status-Badges unterscheiden farblich zwischen `ENTWURF` (Bernstein), `VERSENDET` (Blau), `ANGENOMMEN` (Smaragdgrün) und `ABGELEHNT` (Rot).
  - **Read-Only Sperre für gefrorene Angebote:**
    * Nach dem Versand werden alle Eingabefelder im Editor gesperrt (read-only / disabled).
    * Bearbeiten- und Lösch-Buttons für Positionen werden ausgeblendet.
    * Das Modal zeigt den Status und die Versionsnummer im Header an.
  - **Verhandlungsversionen ableiten:**
    * Aus einem versendeten, gefrorenen Angebot kann per Knopfdruck ("Neue Version verhandeln") eine Folgeberechtigung (`v2`, `v3`) erzeugt werden.
    * Die bisherige Version bleibt unverändert und gesperrt; die neue Version startet als editierbarer `ENTWURF` mit Verweis `parent_angebot_id`.
  - **Annahme & Projektanlage mit Positions-Verknüpfung:**
    * Spezifische Version kann als `ANGENOMMEN` markiert werden.
    * Aus dem angenommenen Angebot kann direkt ein neues Projekt angelegt werden.
    * Die Angebotspositionen werden in `projekt_positionen` übernommen, wobei `sourceOfferPositionId` und `source_angebot_pos_id` dauerhaft und sauber auf die ID der ursprünglichen Angebotsposition zeigen.
    * Bereits angelegte Projekte werden erkannt und über Schnellzugriffs-Icon ("Zum verknüpften Projekt") direkt verlinkt.
- **Schritt 3: Testing & Verifikation (`tests/angebot_ui_workflow.test.js`):**
  - Neuer E2E-Lifecycle-Testlauf implementiert, der die gesamte Prozesskette durchläuft:
    1. Angebot anlegen als `ENTWURF` mit Normal-, Alternativ- und 0,00 € Positionen.
    2. PDF-Vorschau abrufen -> Prüfung, dass Status `ENTWURF` und `freeze_snapshot_json` `NULL` bleiben.
    3. Risikoprüfung & 0,00 € Bestätigung -> Versand registrieren und Snapshot einfrieren (`VERSENDET`).
    4. Mutationsangriff auf gefrorenes `v1` abwehren (Änderungssperre).
    5. Verhandlungsversion `v2` ableiten -> `v1` bleibt gefroren, `v2` startet als `ENTWURF`.
    6. `v2` nachverhandeln, versenden und als `ANGENOMMEN` markieren.
    7. Projekt aus `v2` erstellen und saubere `source_angebot_pos_id`-Zuordnung in `projekt_positionen` verifizieren.
    8. Verknüpftes Aufmaß anlegen und Trigger-Löschschutz verifizieren.
    9. Simulation eines App-Neustarts: Schließen der SQLite-Datenbankverbindung und Neuverbindung zur selben Datei.
    10. Datenbankintegrität nach Neustart prüfen: `PRAGMA foreign_key_check` liefert 0 Fehler; alle Angebote, Versionen, Projekte, Positionen und Aufmaße bleiben vollständig verknüpft persistiert.
  - 100% Erfolgsquote bei `tests/angebot_ui_workflow.test.js` und `tests/angebot_lifecycle.test.js`.

## 27.09.2026 (liesen.txt: Duplikat-Quellenprotokollierung, explizite Aufmaß-Verknüpfung & Trigger-Schutz)
- **Hinterlegung der Quelle duplizierter Projekte vor Entkopplung (`schema.js` & `tests/angebot_lifecycle.test.js`):**
  - Quelle duplizierter Projekte wurde vor der Entkopplung in projektbezogenen Feldern (`archived_source_angebot_id`, `archived_source_angebot_version`, `archived_source_note`, `archived_source_at`) und einer Migrationstabelle (`projekt_source_migrations` mit `projekt_id`, `original_angebot_id`, `original_angebot_version`, `reason`, `migrated_at`) hinterlegt.
  - In `runMigrations()` werden Duplikate vor dem Entkoppeln in `projekt_source_migrations` protokolliert und ihre historischen Angebotsdaten in den Archivfeldern auf `projekte` hinterlegt, bevor `source_angebot_id = NULL, source_angebot_version = NULL` gesetzt wird.
  - Das Projekt, seine Positionen und Rechnungen bleiben erhalten.
  - Bei bereits historisch ungebundenen Projekten (`source_angebot_id IS NULL`) wird keine Quelle geraten.
  - Idempotenz: Zweiter Migrationslauf ist idempotent – keine weiteren Trennungen und keine doppelten Protokolleinträge.
- **Explizite Aufmaß-Verknüpfung, Datenmigration & Schutz-Trigger (`schema.js`, `controlling_bautagebuch_repo.js`, `tests/angebot_lifecycle.test.js`):**
  - Explizite Verknüpfung für Aufmaße (`aufmass.projekt_position_id`) mit einer Datenmigration, die auf der Übereinstimmung von Projekt-ID und Positionsnummer beruht (`projekt_position_id INTEGER REFERENCES projekt_positionen(id) ON DELETE RESTRICT` inklusive Index `idx_aufmass_projekt_position_id`).
  - Aufmaße ohne passende Position im selben Projekt bleiben unberührt (`projekt_position_id IS NULL`), es wird keine unsichere Zuordnung geraten.
  - Datenbank-Integritätsprüfung nach Migration via `PRAGMA foreign_key_check` sichergestellt (0 Fremdschlüsselfehler).
  - **Disambiguierung gegen Fehlblockaden:**
    * Disambiguierung verhindert Fehlblockaden unbeteiligter Positionen mit gleicher Nummer in fremden Projekten.
    * Trigger `trg_prevent_delete_pos_with_aufmass` prüft `(projekt_position_id = OLD.id) OR (projekt_position_id IS NULL AND projekt_id = OLD.projekt_id AND (position_id = OLD.id OR position_id = CAST(OLD.id AS TEXT)))`.
    * In `controlling_bautagebuch_repo.js` (`saveProjekt`) filtert `toDelete` analog im Projektkontext (`WHERE (projekt_position_id IS NOT NULL AND projekt_position_id = ?) OR (projekt_position_id IS NULL AND projekt_id = ? AND (CAST(position_id AS INTEGER) = ? OR position_id = ?))`). Ein Aufmaß in Projekt A blockiert somit keine Position in Projekt B.
  - **Harte Voraussetzung für Schutz-Trigger:**
    * Harte Voraussetzung für die Schutz-Trigger `trg_prevent_delete_pos_with_aufmass` und `trg_prevent_delete_projekt_with_aufmass`: Scheitert das Anlegen oder fehlen die Trigger in `sqlite_master`, bricht `runMigrations()` mit einem harten Fehler ab.
- **Verifikation durch 16/16 bestandene Tests auf frischer und migrierter Datenbank (`tests/angebot_lifecycle.test.js`):**
  - Test 10 (Erweiterung): Migration von Duplikaten, Erhaltung aller Positionen, Protokollierung in `projekt_source_migrations`, Archivspalten und Idempotenz.
  - Test 12: Trigger-Fehler führt zum harten Migrationsabbruch.
  - Test 13: Disambiguierung – Position in Projekt B wird nicht durch Aufmaß in Projekt A blockiert.
  - Test 14: Löschtests über alle 3 Pfade (SQL DELETE Position, saveProjekt(), SQL DELETE Projekt).
  - Test 15: Frische Datenbank & migrierte Altdatenbank – Integrität, Datenmigration und `PRAGMA foreign_key_check` (0 Fehler).

- **NULL-Version im Unique-Index und beim Speichern abgesichert (`schema.js` & `controlling_bautagebuch_repo.js`):**
  - Partieller UNIQUE INDEX `idx_projekte_unique_source_angebot` auf `projekte(source_angebot_id, COALESCE(source_angebot_version, 1)) WHERE source_angebot_id IS NOT NULL` definiert (sowohl in `createSchema` als auch in `runMigrations`). Verhindert zuverlässig Duplikate selbst bei manuellen SQL-Inserts mit `source_angebot_version = NULL`.
  - In `saveProjekt()` wird die Angebotsversion bei vorhandener `source_angebot_id` stets auf mindestens Version 1 normalisiert (`const sVer = p.source_angebot_id ? (parseInt(p.source_angebot_version, 10) || 1) : null;`) und konsistent für `INSERT`, `UPDATE` und die Idempotenz-Vorprüfung verwendet.
- **Bereinigung von Altdaten-Duplikaten OHNE Verfälschung von Versionsnummern (`schema.js` & `tests/angebot_lifecycle.test.js`):**
  - In `runMigrations()` wurde der provisorische Hack `SET source_angebot_version = -id` vollständig entfernt, da negative Versionsnummern Geschäftsdaten verfälschen würden.
  - Stattdessen werden überzählige historische Projekt-Duplikate sauber vom Angebot entkoppelt (`SET source_angebot_id = NULL, source_angebot_version = NULL`), falls vor dieser Migration Duplikate in einer Altdatenbank existierten (`WHERE id IN (SELECT p2.id FROM projekte p1 JOIN projekte p2 ON p1.source_angebot_id = p2.source_angebot_id AND COALESCE(p1.source_angebot_version, 1) = COALESCE(p2.source_angebot_version, 1) AND p1.id < p2.id WHERE p1.source_angebot_id IS NOT NULL)`).
  - Dadurch bleibt das Projekt als eigenständiges Projekt mit allen Positionen, Budget und Rechnungen 100% erhalten, während die Versionsnummern unverfälscht bleiben und der partielle UNIQUE-Index `idx_projekte_unique_source_angebot` fehlerfrei angelegt werden kann.
  - Test 10 (Erweiterung) angepasst: Prüft explizit, dass Duplikate nach der Migration `source_angebot_id IS NULL` und `source_angebot_version IS NULL` tragen und alle Projektdaten erhalten bleiben.
- **Umfassender Engine-Level Löschschutz für verknüpfte Aufmaße via SQLite-Trigger (`schema.js` & `tests/angebot_lifecycle.test.js`):**
  - Ergänzend zum anwendungsinternen Schutz in `saveProjekt()` wurden native SQLite-Engine-Trigger implementiert (sowohl in `createSchema` als auch in `runMigrations` und `ensureGoBDSchemaAndTriggers`):
    * `trg_prevent_delete_pos_with_aufmass`: Verhindert das Löschen einer `projekt_positionen`, wenn in `aufmass` Einträge auf diese Position verweisen (`WHEN EXISTS (SELECT 1 FROM aufmass WHERE CAST(position_id AS INTEGER) = OLD.id OR position_id = OLD.id)`).
    * `trg_prevent_delete_projekt_with_aufmass`: Verhindert das Löschen eines Datensatzes in `projekte`, wenn verknüpfte Aufmaße für das Projekt existieren (`WHEN EXISTS (SELECT 1 FROM aufmass WHERE projekt_id = OLD.id)`).
  - Damit ist der Aufmaß-Schutz über ausnahmslos JEDEN Löschpfad (direkte SQL-Deletes, Foreign-Key-CASCADE-Deletes, IPC-Handler) auf Datenbank-Engine-Ebene manipulationssicher garantiert.
  - Test 11 erweitert: Führt direkte SQL-Deletes auf Projektposition und Projekt aus und verifiziert, dass die Trigger den Delete hart abbrechen, die Fehlermeldungen exakt anschlagen und sämtliche Daten unversehrt bleiben.

## 27.09.2026 (Neuer Angebots-Kern: Direktangebot, Versionierung, Freeze-Snapshot, Risiko-Check & Projektübergabe)
- **Implementierung des neuen modularen Angebots-Kerns (gemäß `doc/angebot_checkliste_bau_2026-09-27.md` & `liesen.txt`):**
  - **Rechtliche & architektonische Differenzierung:**
    * Saubere Entkopplung der Dimensionen: Auftraggeber-Typ (`PRIVAT`, `GEWERBLICH`, `OEFFENTLICH`), Vergabeverfahren (`DIREKT`, `FORMELLE_AUSSCHREIBUNG`) und Vertragsgrundlage (`BGB_WERKVERTRAG`, `BGB_VERBRAUCHERBAU`, `VOB_B`).
    * Berücksichtigung BGH VII ZR 94/22: Einzelgewerke begründen keinen Verbraucherbauvertrag nach § 650i BGB; bei echtem Verbraucherbauvertrag Prüfung nach § 650m BGB (90% Abschlagsdeckel, 5% Sicherheitsleistung).
    * Kontextsensitive Risikoprüfung: Präzise Unterscheidung zwischen fehlenden Preisen (Ausschlussgefahr nach VOB/A) und 0,00 € Preisen (Bestätigungspflicht).
  - **Datenbank & Schema (`schema.js` & `db/repositories/document_repo.js`):**
    * Erweiterung Tabelle `dokumente`: `version`, `parent_angebot_id`, `angebot_status` (`ENTWURF`, `VERSENDET`, `ANGENOMMEN`, `ABGELEHNT`), `freeze_snapshot_json`, `auftraggeber_typ`, `vergabe_verfahren`, `vertragsgrundlage`, `angenommen_am`, `angenommene_version`.
    * Erweiterung Tabelle `positionen`: `titel`, `positionstyp` (`NORMAL`, `ALTERNATIV`, `BEDARF`, `PAUSCHALE`), `in_endsumme_enthalten`, `bieterangabe_wert`.
    * Erweiterung Tabelle `projekte`: `source_angebot_id`, `source_angebot_version`.
    * **Partieller UNIQUE INDEX auf Datenbankebene:** `idx_projekte_unique_source_angebot` auf `projekte(source_angebot_id, source_angebot_version) WHERE source_angebot_id IS NOT NULL AND source_angebot_version IS NOT NULL` sowohl in `createSchema` als auch in `runMigrations`. Dies garantiert die Eindeutigkeit auf SQLite-Engine-Ebene bei unbeschränkter Anzahl normaler Nicht-Angebots-Projekte.
    * **Altdaten-Migration für bestehende Angebote:** In `runMigrations` werden Altdatenbanken mit historischem Text-Status (`'Angenommen'`, `'Versendet'`, `'Abgelehnt'`, `'ACCEPTED'`, `'SENT'`, etc.) automatisch und idempotent in die neue Spalte `angebot_status` migriert (`'ANGENOMMEN'`, `'VERSENDET'`, `'ABGELEHNT'`), anstatt sie blind auf `'ENTWURF'` zu setzen.
    * Neue Tabelle `projekt_positionen`: Zur dauerhaften Persistenz der aus Angeboten abgeleiteten Projektpositionen mit `source_angebot_pos_id`, OZ, Kostenarten, Einheitspreisen und EKT-Feldern (`ON DELETE CASCADE`).
    * State-Transition-Guard in `document_repo.js`: Fixierte Angebote mit Freeze-Snapshot können unter keinen Umständen auf `ENTWURF` zurückgesetzt werden; `freeze_snapshot_json` kann nicht geleert werden. Nur gültige Vorwärtsübergänge (`VERSENDET` -> `ANGENOMMEN` / `ABGELEHNT`) sind erlaubt.
    * Stabile Identität in `controlling_bautagebuch_repo.js`: In `saveProjekt()` wurde das destruktive `DELETE + INSERT` auf `projekt_positionen` durch ein idempotentes Differenz-Upsert (Diff & Sync) ersetzt. Bestehende Positionen behalten ihre Primärschlüssel-ID dauerhaft bei, was für spätere Aufmaße und Abrechnungen essenziell ist.
    * Doppel-Projektanlagen-Schutz & Constraint-Handling: In `saveProjekt()` fängt der Try-Catch-Block `SQLITE_CONSTRAINT_UNIQUE` für `idx_projekte_unique_source_angebot` sauber ab und liefert eine verständliche Fehlermeldung (`Doppel-Projektanlage verhindert...`), zusätzlich zur bestehenden Vorprüfung.
  - **Neuer Controller (`controllers/AngebotController.js`):**
    * `normalizeInEndsumme`: Einheitliche Normalisierung von `in_endsumme_enthalten` (String `'0'` und `0` werden verlässlich als `0` gewertet, `'1'` und `1` als `1`).
    * `calculateTotals`: Getrennte Summenberechnung für Normal-, Alternativ- und Bedarfspositionen sowie MwSt-Aufschlüsselung (19%, 7%).
    * `freezeAngebot`: Erstellung des unveränderlichen Snapshots bei Status `VERSENDET`.
    * `createVersion`: Nachverhandlungen erzeugen `v2` (mit Belegnummern-Suffix wie `-V2`), während `v1` im Snapshot intakt bleibt.
    * `acceptAngebot`: Protokollierung von Annahmezeitpunkt und angenommener Version.
    * `createProjektFromAngebot`: 1-Klick-Projektanlage mit eigenständigen Projektpositions-IDs und stabiler `sourceOfferPositionId`- / `source_angebot_pos_id`-Referenz.
    * `validateAngebot`: Kontextbezogene Vollständigkeits- und Risikoprüfung.
  - **Automatisierte Testsuite (`tests/angebot_lifecycle.test.js`):**
    * 11 umfassende Tests (Summenberechnung, Freeze-Snapshot, Versionierung, Projektübernahme, Risikoprüfung, SQLite-Persistenz & Reload von `projekt_positionen`, Foreign Key & Cascade, Offensive Attacken-Tests gegen den Freeze-Lock, String-`'0'`-Normalisierung, ID-Erhaltung bei Projekt-Updates, Blockade von Doppel-Projektanlagen, erweiterter Legacy-DB-Migrationstest mit Status-Übernahme und SQLite-Unique-Index, sowie Test 11 zur Aufmaß-Referenzstabilität über Projekt-Updates hinweg). 100% Tests bestanden.

## 27.09.2026 (Bugfix PDF-Druck & ZUGFeRD-Sichtseite sowie DOM-Print-Reparatur)
- **Behebung PDF-Druck blockiert (Klick auf PDF-Symbol im Dashboard ohne Reaktion):**
  - **Ursache:** In [`js/dauerrechnungen.js`](../js/dauerrechnungen.js) und [`js/einstellungen.js`](../js/einstellungen.js) wurde die Konstante `const AUFBEWAHRUNGSFRISTEN_BEG_IV` jeweils im globalen Browser-Scope deklariert. Dies führte zu einem unhandled `SyntaxError: Identifier 'AUFBEWAHRUNGSFRISTEN_BEG_IV' has already been declared`, der die Ausführung des gesamten Skripts `js/einstellungen.js` abbrach. Infolgedessen wurden globale Handler wie `window.generatePdf`, `openPdfPreview` und `executePrint` nicht registriert.
  - **Lösung:** Beide Deklarationen auf kollisionssicheres `var AUFBEWAHRUNGSFRISTEN_BEG_IV = (typeof window !== 'undefined' && window.AUFBEWAHRUNGSFRISTEN_BEG_IV) || { ... }` umgestellt.
  - **Ergänzung:** In [`views/InvoiceView.js`](../views/InvoiceView.js) wird `window.invoiceView` nun direkt bei Skriptausführung instanziiert (`window.invoiceView = new window.InvoiceView(...)`), sodass Modal-Events (`pdf-preview-print-btn`, `pdf-preview-save-btn`, Tastenkürzel) auch vor dem ersten Öffnen des Rechnungseditors registriert sind.
- **Behebung ZUGFeRD-Export erzeugte leere/weiße PDFs:**
  - **Ursache:** In [`code.html`](../code.html) fehlte nach der Modal-Modularisierung der schließende `</main>`-Tag nach `#view-sokabau`. Dadurch umschloss `<main class="... print:hidden">` versehentlich auch `#print-template` und `#modals-container`. Im `@media print`-Modus wurde `<main>` und somit das gesamte `#print-template` durch Tailwind `.print:hidden` und `body > *:not(#print-template) { display: none !important; }` ausgeblendet. Chromiums `printToPDF` lieferte eine leere 1-KB-Seite als Basis für das ZUGFeRD-Dokument.
  - **Lösung:** Der schließende `</main>`-Tag wurde unmittelbar vor `#print-template` eingefügt. `#print-template` ist nun wieder ein direktes Kindelement von `<body>` und wird beim Electron-Druck vollständig gerendert (108–120 KB Sichtseite).
- **Stammdaten-Repository Bereinigung:**
  - In [`db/repositories/kunden_artikel_repo.js`](../db/repositories/kunden_artikel_repo.js) wurde `dbQuery` in den Parametern von `createKundenArtikelRepo` ergänzt, um einen `ReferenceError` bei der automatischen Kundennummern-Generierung (`SELECT MAX(id)`) zu verhindern.
- **Verifikation & Testabdeckung:**
  - E2E-Electron-Test verifiziert: ZUGFeRD-Export erzeugt ein valides PDF/A-3b Dokument mit echter Sichtseite (`sichtseiteQuelle: 'echt'`, ~120 KB) und eingebetteter `factur-x.xml`.
  - Alle 25 E-Rechnungs- und ZUGFeRD-Tests (`tests/zugferd.test.js` & `tests/erechnung_belegfixierung.test.js`) erfolgreich bestanden.

## 11.09.2026 (Vollständige Implementierung & Verifikation aller 5 Architektur-Sanierungspläne)
- **100% Implementierung & Verifikation abgeschlossen:** Sämtliche im Gesamtsystem-Audit identifizierten P0-, P1- und P2-Schwachstellen wurden über 5 disziplinierte Sanierungspläne modular behoben und durch 140+ automatisierte Tests verifiziert:
  - **Plan 01: E-Rechnung (XRechnung 3.0 / ZUGFeRD 2.3) & VOB/B Kern:**
    * Standardkonforme CIUS-Kennung `urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0` in [`js/einvoice.js`](../js/einvoice.js) (Behebung BR-DE-21 Abweisung).
    * Lückenlose Belegfixierung (`PDF == XML == DB`): IPC lädt Belege per SQL-SELECT aus SQLite; Entwürfe werden durch `assertExportfaehigerBeleg` vor E-Rechnungsexport geblockt.
    * Beseitigung der § 14c UStG Steuerdiskrepanz: Abschlagsverrechnungen mindern nicht die Steuerbasis, sondern werden als BT-113 Prepaid Amount ausgewiesen.
    * VOB/B § 17 & VOB/A § 9c: 5%-Deckelung für Vertragserfüllungssicherheit (EXECUTION) und Schwellenwert-Radar (< 250.000 €).
    * Bereinigter Vorgänger-Filter in [`js/editor.js`](../js/editor.js) schließt Angebote, Stornos und Schlussrechnungen zuverlässig aus.
  - **Plan 02: Electron Security, GoBD & SQLite:**
    * Electron RCE-Schutz für `shell.openExternal` mit strikter Protokoll-Whitelisting (`http:`, `https:`, `mailto:`) in [`main/ids-connect-service.js`](../main/ids-connect-service.js) und [`controllers/IDSConnectController.js`](../controllers/IDSConnectController.js).
    * Browser-Fenster gehärtet (`setWindowOpenHandler`, `will-navigate` Guards, Context Isolation, Sandbox).
    * GoBD-Änderungssperre in [`db.js`](../db.js): Belege mit Status `Festgeschrieben`, `Bezahlt`, `Storniert` unumstößlich geschützt; Wegfall der GoBD-widrigen Entsperrung `entsperreBeleg`.
    * SQLite DDL-Trigger `trg_prevent_audit_logs_delete` und `trg_prevent_audit_logs_update` sichern den Audit-Trail gegen Manipulation.
    * WAL-Concurrency mit `PRAGMA busy_timeout = 5000;`, Schließen offener Handles vor Restore in [`main/backup.js`](../main/backup.js) und Indizes auf `positionen` und `dokumente`.
  - **Plan 03: Aufmaßwesen (REB 23.003, DA11, GAEB X31) & Nachträge:**
    * REB 23.003 DA11-Export & Import in [`js/da11.js`](../js/da11.js) mit korrekten Satzarten 00 (Vorlaufsatz mit OZ-Maske), 11 (Rechenzeilen), 99 (Endesatz) auf exakt 80 Bytes CRLF.
    * Revisionssichere atomare Nachtragsübernahme mit SQLite-Persistenz in [`js/projekte.js`](../js/projekte.js) und positionsgenauem Idempotenz-Key.
    * Bereinigung von `mergeSchlussaufmass`: Ausschluss unfertiger Drafts, Erhalt kalkulierter LV-Einheitspreise.
    * GAEB X31 Multi-Sheet Support und strukturtreue Auswertung von Zwischensummenreferenzen `A0`.
    * VOB/B § 16 kumulatives Controlling ($Umsatz = L_t$) verhindert Doppelzählung historischer Abschläge.
  - **Plan 04: Banking, OPOS, SEPA (pain.008.001.08) & DATEV EXTF 700:**
    * DATEV EXTF 700 Vollkonformität in [`js/datev.js`](../js/datev.js): Bruttobuchung auf Erlöskonten (8400, 8300, 8337) mit separater Einbehaltsabgrenzung (Konto 1540/1240) und 31-spaltigem Header.
    * OPOS-Matching in [`controllers/BankingController.js`](../controllers/BankingController.js) entschärft (kein Fehlalarm bei Jahreszahl `2026`).
    * Kaufmännisch korrekte Saldenformel `(fakturiert + freigegeben) - gezahlt` in [`controllers/InvoiceController.js`](../controllers/InvoiceController.js).
    * SEPA Lastschriften im ISO 20022 `pain.008.001.08` Format mit strukturierter Adresse `<PstlAdr>` und TARGET2-Bankarbeitstage-Validierung in [`controllers/SepaController.js`](../controllers/SepaController.js).
    * SWIFT MT940 Parser, Same-Day-Deduplizierung und SMTP STARTTLS-Härtung (`requireTLS: true`).
  - **Plan 05: Sync Server, PWA Offline & Frontend Fokusmodus:**
    * Foto-Upload in [`main/sync-server.js`](../main/sync-server.js) durch Streaming Magic-Bytes Inspektion (WebP, JPEG, PNG) gehärtet (415 bei manipulierten Dateien).
    * Beseitigung stillen Datenverlusts bei Offline-Aufmaßen durch Optimistic Concurrency Control und Quarantäne-Ausbau; Schlichtungslogik für Bautagebuch-Konflikte.
    * PWA Service Worker Cache-Busting mit Schema-Handshake (`pwa/sw.js`).
    * UI-Fokusmodus: Toggle-Switch in den Einstellungen (`code.html` / `js/einstellungen.js`) und Router-Guards in [`js/navigation.js`](../js/navigation.js) gegen unautorisierte Zugriffe auf experimentelle Views.
    * Fake-Preise in IDS Connect entfernt; GoBD/MiLoG-konforme Löschgrund-Pflicht (min. 5 Zeichen) für Zeiteinträge in [`views/ZeiterfassungView.js`](../views/ZeiterfassungView.js).
    * XSS-Sanitization (`escapeHtml`) für MaengelView, ZeiterfassungView, SokaBauView und Objekte.
- **Abschlussbericht:** Vollständige Dokumentation in [`doc/abschlussbericht_sanierung_2026-09-11.md`](abschlussbericht_sanierung_2026-09-11.md).

## 11.09.2026 (Gesamtsystem-Audit, E-Rechnungs-/VOB-Härtung & 5 Architektur-Sanierungspläne)
- **Multi-Agenten-Audit (6 Fachexperten):** Gesamtsystem-Audit aller Kern- und Experimentalmodule auf Basis von [`doc/app-map/`](app-map/) mit Web-Recherche zu Rechts- & Technologiestandards (Stichtag 2026). Identifikation von 16 P0-, 19 P1- und 12 P2-Befunden in [`plans/audit_gesamtbericht_2026-09-11.md`](../plans/audit_gesamtbericht_2026-09-11.md).
- **5 Modulare Sanierungspläne erstellt:**
  - [`plans/plan-01-erechnung-vobb-kern.md`](../plans/plan-01-erechnung-vobb-kern.md): CIUS-Kennung XRechnung 3.0 (BR-DE-21), Belegfixierung (`PDF == XML == DB`), Beseitigung der § 14c UStG Steuerdiskrepanz bei Abschlagsverrechnungen, VOB/B § 17 5%-Deckel.
  - [`plans/plan-02-electron-gobd-sqlite.md`](../plans/plan-02-electron-gobd-sqlite.md): Electron RCE-Schutz für `shell.openExternal`, GoBD-Unveränderbarkeit (`Festgeschrieben`/`Bezahlt`/`Storniert`, Wegfall `entsperreBeleg`), SQLite `busy_timeout` & Fremdschlüssel-Indizes.
  - [`plans/plan-03-aufmass-nachtrag.md`](../plans/plan-03-aufmass-nachtrag.md): REB 23.003 DA11-Parser (Satzart 11 statt 12, Vorlaufsatz 00 mit OZ-Maske), atomare Nachtragsübernahme mit DB-Persistenz, GAEB X31 Erhalt des Adressbezugs `A0`, kumulative Projektrentabilität ($Umsatz = L_t$).
  - [`plans/plan-04-banking-datev-sepa.md`](../plans/plan-04-banking-datev-sepa.md): DATEV EXTF 700 Bruttobuchung auf Erlöskonten 8400/8300/8337, Entschärfung des OPOS-Jahreszahl-Regex (`2026`), SEPA ISO 20022 `pain.008.001.08` Adressstruktur (`<PstlAdr>`), korrigierte Saldenformel für Einbehalt-Freigaben.
  - [`plans/plan-05-sync-pwa-frontend.md`](../plans/plan-05-sync-pwa-frontend.md): Foto-Upload mit nativer Magic-Bytes-Prüfung (WebP RIFF/VP8, JPEG, PNG), Hybrid Logical Clocks (HLC) mit 60s Drift-Guard, PWA Service Worker Cache-Busting, UI-Checkbox für Fokusmodus, BAG/EuGH-konformes Zeiterfassungs-Soft-Delete.
- **Unabhängiges Review & Stress-Testing (5 Reviewer):** Alle 5 Pläne wurden unabhängig auf Herz und Nieren geprüft; 5 kritische Planungsfehler (Aufrufreihenfolge `calcRetention`, SQLite-Trigger-Deadlock bei Belegspeicherung, Spaltenname `rechnungsart` vs `typ`, SEPA XML-Tag-Reihenfolge, WebP VP8-Header) aufgedeckt und als harte Auflagen formuliert ([`plans/audit_review_master_report_2026-09-11.md`](../plans/audit_review_master_report_2026-09-11.md)).
- **Master-Dokumentation & Index:** Alle Pläne und Master-Reports synchron in [`plans/`](../plans/) und [`doc/`](.) abgelegt, Master-Index [`plans/README.md`](../plans/README.md) und Sitzungsbericht [`doc/session_summary_2026-09-11_systemaudit-und-sanierungsplaene.md`](session_summary_2026-09-11_systemaudit-und-sanierungsplaene.md) erstellt.

## 10.09.2026 (W-Link Bau Rechnungskern-Stabilisierung — Phase P0)
- **P0.2 Einbehalt-Rechenwahrheit:** [`controllers/InvoiceController.js`](../controllers/InvoiceController.js) rechnet kumulativ (`Ziel-Einbehalt − bereits einbehalten`, eine Quelle mit `CumulativeBillingController`), inkl. OPOS-Trennung (`computeProjectBalance`); [`views/InvoiceView.js`](../views/InvoiceView.js) + [`js/editor.js`](../js/editor.js) übergeben Vorgänger-Einbehalte aus gespeicherten Belegen. Neu [`tests/cumulative_retention_chain.test.js`](../tests/cumulative_retention_chain.test.js) (Abnahmetabelle, Bug-Wert 15 assertet abwesend).
- **P0.3 Übergaben repariert:** [`js/projekte.js`](../js/projekte.js) — `executeAufmassUebergabe` persistiert via `db:saveDocument` mit Herkunftsbezügen (`aufmass_blatt_id`, `oz_code`, Zeitstempel) + Reload-Read + Sperrblockade; `applyApprovedNachtraegeToCurrentInvoice` übernimmt idempotent je `nachtrag_id`. Neu [`tests/uebergaben_persistenz.test.js`](../tests/uebergaben_persistenz.test.js).
- **P0.4 Belegfixierter Export + XRechnung 3.0:** [`js/einvoice.js`](../js/einvoice.js) (`GUIDELINE_XRECHNUNG_30`, `assertExportfaehigerBeleg`), [`js/editor.js`](../js/editor.js) (Pflicht-`belegId`), [`main.js`](../main.js) (IPC verweigert `entityId: 0`/Entwürfe); Tests auf 3.0 gehoben + [`tests/erechnung_belegfixierung.test.js`](../tests/erechnung_belegfixierung.test.js).
- **P0.5 Release:** Neu [`doc/release/checklist.md`](release/checklist.md) (Test-Gate, Windows-, Backup-, Validator-, E2E-, Sync-Smoke-Punkte).
- **P0.6 UI-Fokusmodus:** [`js/navigation.js`](../js/navigation.js) — Kern-Views Standard, Rest hinter `experimental_module`-Flag (nichts gelöscht) + [`tests/ui_fokusmodus.test.js`](../tests/ui_fokusmodus.test.js).
- **P0.1 Sync-Verifikation:** Neu [`tests/sync_p0_negativmatrix.test.js`](../tests/sync_p0_negativmatrix.test.js) (6 Negativtests, grün unter Electron-Runtime); kein Funktionsausbau.
- **Verifikation:** Neue Suites 19/19 grün; `npm test`: 284/304 (20 vorbestehende Env-Fehler: better-sqlite3-Electron-ABI + fehlendes openssl — auf HEAD gegengeprüft, keine Regression).
- **Dokumentation:** [`doc/session_summary_2026-09-10_rechnungskern-stabilisierung-p0.md`](session_summary_2026-09-10_rechnungskern-stabilisierung-p0.md) (inkl. Restrisiken/Next Steps P1).

## 08.09.2026 (Rechnungsmodal-Bereinigung & Integration von „Sicherheitseinbehalt in %“)
- **Bereinigung des Rechnungsmodals (Download-Optionen):**
  - [`code.html`](../code.html): Die vorzeitigen Export-Schaltflächen („XRechnung XML herunterladen“ und „ZUGFeRD-PDF herunterladen“) im B2G-Bereich des Erstellungsdialogs (`#rechnung-b2g-section`) entfernt. Der strukturierte Export erfolgt GoBD-konform nach der Belegspeicherung aus der Rechnungsliste bzw. Detailansicht.
- **Integration von „Sicherheitseinbehalt in %“:**
  - [`schema.js`](../schema.js): Migration hinzugefügt (`ALTER TABLE dokumente ADD COLUMN sicherheitseinbehalt_prozent REAL DEFAULT 0`).
  - [`db.js`](../db.js): `saveDocument` und `bulkSaveDocuments` um die Persistenz von `sicherheitseinbehalt_prozent` erweitert.
  - [`code.html`](../code.html): Zwei synchronisierte Eingabefelder mit `%`-Symbol integriert (Handwerks-/Baustellenbereich `#rechnung-handwerk-sicherheitseinbehalt` und Modifiers-Bereich der Summenbox `#rechnung-sicherheitseinbehalt-prozent`).
  - [`views/InvoiceView.js`](../views/InvoiceView.js): `getFormData()` liest vorrangig die Modal-Eingaben aus (mit Fallback auf das ausgewählte Projekt). Dynamische Einbehalt-Zeile (`Sicherheitseinbehalt Netto (X%)`) in `updateTotalsUI()` integriert.
  - [`controllers/InvoiceController.js`](../controllers/InvoiceController.js): Cent-genaue Berechnung des Sicherheitseinbehalts auf Netto-Ebene nach VOB/B § 17. Die Umsatzsteuer nach § 13 UStG bleibt unberührt; der Zahlbetrag wird gemindert.
  - [`js/editor.js`](../js/editor.js):
    * `syncSicherheitseinbehalt(sourceId)` für bidirektionale UI-Synchronisation bereitgestellt.
    * `calculateRechnungTotals()` und `saveRechnung()` auf `sicherheitseinbehalt_prozent` synchronisiert.
    * Wiederherstellung in `applyRechnungReadOnlyMode()` und `applyRechnungEditMode()` sichergestellt.
    * Auto-Vorschlag (5,0 %) bei VOB/B-Checkbox-Aktivierung oder Projekt-Standardwerten angebunden.
  - [`js/einstellungen.js`](../js/einstellungen.js): Ausweisung des Einbehalts mit Prozentangabe im PDF-Druck (`Abzug Sicherheitseinbehalt (X%): -Y,YY €`).
  - [`tests/invoice_controller.test.js`](../tests/invoice_controller.test.js): Neuer automatisierter Testfall für prozentuale Einbehalte hinzugefügt.
- **Dokumentation:**
  - [`doc/session_summary_2026-09-08_sicherheitseinbehalt_und_rechnungsmodal_anpassungen.md`](session_summary_2026-09-08_sicherheitseinbehalt_und_rechnungsmodal_anpassungen.md): Ausführliches Protokoll der Implementierung, Rechtsgrundlagen und Testergebnisse.
- **Verifikation:**
  - 233 von 233 automatisierten Tests bestanden (`node --test tests/*.test.js`, 100% Pass).

## 07.09.2026 (Rechnungs-Layoutoptimierung: Behebung von Leerraum & Formular-Verankerung nach DIN 5008)
- **Problembehebung Leerraum auf Rechnungen (Formular-Layout):**
  - [`code.html`](../code.html): Druck-CSS (`@media print`) überarbeitet. Entfernung von `min-height: 0; display: block;` zugunsten von `min-height: calc(297mm - 24mm); display: flex; flex-direction: column; justify-content: space-between;`. Paginierung und Ränder auf normierte A4-Druckmaße (`12mm 15mm`) angepasst.
  - [`code.html`](../code.html): Vorschau-Container `#pdf-preview-container` auf `flex flex-col` synchronisiert, um 100% WYSIWYG-Deckungsgleichheit mit dem Druckausdruck zu gewährleisten.
  - [`js/einstellungen.js`](../js/einstellungen.js): Dokumentvorlagen (`modern`, `minimalistisch`, `klassisch`) und Mahnwesen (`generateMahnungHtml`) strukturiert:
    * Kopf- und Tabellenbereich in flexiblen Inhaltsblock gekapselt.
    * Flex-Spacer (`flex-1 min-h-[16px]`) eingefügt, der Freiraum natürlich unter der Tabelle belässt.
    * Abschlussblock (Zahlungsbedingungen, Skonto, GiroCode, Summenblock) per `mt-auto` nach unten über die Fußzeile gedockt.
    * Dreispaltige DIN 5008 Fußzeile (`.pdf-footer`) fest an den unteren Seitenrand verankert (`margin-top: auto`).
  - [`js/einstellungen.js`](../js/einstellungen.js): Drucksynchronisation in `executePrint` für nativen Electron-PDF-Export (`window.api.savePdf` / `printToPDF`) und Browserdruck vereinheitlicht.
- **Dokumentation:**
  - [`doc/session_summary_2026-09-07_rechnung_layout_optimierung_leerraum.md`](session_summary_2026-09-07_rechnung_layout_optimierung_leerraum.md): Vollständiges Sitzungsprotokoll mit Ursachenanalyse, DIN 5008 Branchenstandards und Verifikationsergebnissen.
- **Verifikation:**
  - 226 von 226 automatisierten Tests bestanden (`cmd /c npm test`). Echte PDF-Generierung über Chromium Electron Engine verifiziert.

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

## 08.09.2026
- **Rechnungsmodal-Bereinigung & Sicherheitseinbehalt in %:**
  - Entfernung vorzeitiger Download-Schaltflächen im B2G-Bereich des Erstellungsdialogs.
  - Vollständige Integration von "Sicherheitseinbehalt in %" in `code.html`, `js/editor.js`, `schema.js`, `db.js` und `controllers/InvoiceController.js`.
  - E-Rechnungsausweis (BT-20 / BT-22 / BT-113) und PDF-Abzugsausweis.

## 09.09.2026 / 10.09.2026
- **Bauprofessor.de Deep-Research & VOB/VHB-Kernbaustein-Integration (Phase 1):**
  - **EFB 222 (Endsummenkalkulation nach VHB-Bund):** Vollständige auftragsbezogene Gliederung der Baustellengemeinkosten (BGK 3.1.1–3.1.5), Sachkostenumlagen und Restgemeinkostenumlage auf den Lohn zur Verrechnungslohnbildung ($VL$), Wagnisdifferenzierung und DIN A4-Druck-Renderer in [`controllers/EFBController.js`](../controllers/EFBController.js) und [`views/EFBView.js`](../views/EFBView.js).
  - **Differenzierte Sicherheitseinbehalte & 5 %-Cap (VOB/B § 17 & VOB/A § 9c):** Erfüllungssicherheit mit harter 5 %-Deckelung auf die Netto-Auftragssumme, Gewährleistungssicherheit, 18-Werktage Sperrkonto-Fristenradar und VOB/A § 9c Schwellenwertprüfung in [`controllers/CumulativeBillingController.js`](../controllers/CumulativeBillingController.js) und [`controllers/InvoiceController.js`](../controllers/InvoiceController.js).
  - **VOB/C Übermessungs- & Abzugsregeln (DIN 18299 ff.):** Automatische Bewertung von Öffnungen (2,50 m² Rohbau/Putz/Maler/Trockenbau, 0,10 m² Fliesen/Estrich, 1,00 m Längenmaße) und Nettoaufmaß-Berechnung in [`controllers/AufmassController.js`](../controllers/AufmassController.js).
  - **B2B-Verzugszinsen & 40-€-Pauschale (§ 288 BGB & § 16 VOB/B):** Taggenaue Zinsberechnung (Basiszinssatz + 9 %) und automatische 40,00 € Verzugspauschale für Geschäftskunden in [`controllers/BankingController.js`](../controllers/BankingController.js).
  - **VOB-Schriftverkehr-Generator:** Neues Modul [`controllers/VobCorrespondenceController.js`](../controllers/VobCorrespondenceController.js) zur Generierung von Behinderungsanzeigen (§ 6 VOB/B), Bedenkenanmeldungen (§ 4 Abs. 3 VOB/B), Bauhandwerkersicherungen (§ 650f BGB, 110 % Bürgschaftsrechner) und Abnahmeaufforderungen (§ 12 VOB/B).
  - **Testsuite & Qualitätssicherung:** 19 neue Unittests implementiert; 252 von 252 Tests erfolgreich bestanden (100% grün).

