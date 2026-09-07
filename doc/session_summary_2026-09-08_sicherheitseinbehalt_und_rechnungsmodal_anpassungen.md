# Session Summary: Rechnungsmodal-Bereinigung & Integration von „Sicherheitseinbehalt in %“

**Projekt:** W-Link ERP (`Rechnungsprogramm_Geb_V2`)  
**Datum:** 08. September 2026  
**Status:** Vollständig abgeschlossen & verifiziert (233 von 233 Tests grün, 100% Pass)

---

## 1. Ausgangssituation & Benutzeranforderungen

In dieser Sitzung wurden zwei zentrale Anforderungen an das Rechnungs-Erstellungsmodal (`#rechnung-modal`) umgesetzt:

1. **Entfernung vorzeitiger Download-Optionen im Rechnungs-Erstellungsdialog:**
   > *„bei rechnungserstellung es gibt das hier bitte lösche die bei herunterladen optionen“* (mit Screenshot des B2G-Bereichs)
   - **Problem:** Im Modal für das Erstellen neuer Rechnungen wurden im B2G-Abschnitt Download-Buttons für *XRechnung XML* und *ZUGFeRD-PDF* angeboten, noch bevor der Beleg in der Datenbank gespeichert war.
   - **Lösung:** Entfernung der beiden Download-Buttons aus dem Erstellungsdialog. Der strukturierte Export (PDF, XML, ZUGFeRD, DATEV) erfolgt GoBD-konform nach der Belegspeicherung aus der Rechnungsliste bzw. Detailansicht.

2. **Integration von „Sicherheitseinbehalt in %“ bei der Rechnungserstellung:**
   > *„ich wollte das du noch Sicherheitseinbehalt in % hinzufügt im Rechnungserstellung“*
   - **Problem:** Bei Bau- und Handwerkerrechnungen nach VOB/B § 17 wird vertraglich typischerweise ein prozentualer Sicherheitseinbehalt (üblich: 5,0 % oder projektspezifisch) vereinbart. Im Rechnungsmodal fehlte bisher ein direktes Prozent-Eingabefeld, das den Einbehalt dynamisch vom Netto berechnet und sauber auf Zahlbetrag und Druckausgabe anwendet.
   - **Lösung:** Vollständige End-to-End-Integration eines prozentualen Sicherheitseinbehalts inklusive DB-Migration, bidirektionaler UI-Feld-Synchronisation, Cent-genauer Live-Berechnung, Wiederherstellung in Edit-/Read-Only-Modi und Ausweisung im PDF-Dokument.

---

## 2. Rechtlicher & fachlicher Hintergrund (VOB/B & UStG)

- **VOB/B § 17 (Sicherheitsleistung):**
  - Bei Bauleistungen dient der Sicherheitseinbehalt (meist 5 % der Netto-Abrechnungssumme) der Absicherung von Gewährleistungsansprüchen.
  - Der Einbehalt kann bar einbehalten oder durch eine Bankbürgschaft (§ 17 Abs. 4 VOB/B) abgelöst werden.
- **Umsatzsteuerliche Behandlung (§ 13 UStG & BMF-Schreiben):**
  - **Grundsatz:** Ein Sicherheitseinbehalt mindert **nicht** die Bemessungsgrundlage der Umsatzsteuer. Die Steuer entsteht in voller Höhe auf die erbrachte Leistung (bzw. Teilleistung).
  - Der Sicherheitseinbehalt wird rein als Abzugsposten auf den Brutto-Auszahlungsbetrag (Zahlbetrag) verrechnet:
    $$\text{Sicherheitseinbehalt (Netto)} = \text{Netto nach Rabatt} \times \frac{\text{Prozentsatz}}{100}$$
    $$\text{Zahlbetrag} = \text{Brutto} - \text{Anzahlungen} - \text{Sicherheitseinbehalt (Netto)}$$
- **E-Rechnung (EN 16931 / ZUGFeRD 2.3 & XRechnung):**
  - Ausweisung in BT-20 / BT-22 (Rechnungsnotizen) sowie BT-113 (Abzüge/Einbehalte auf Belegebene).

---

## 3. Durchgeführte Implementierungen

### 3.1 Bereinigung des Rechnungsmodals ([`code.html`](../code.html))
- Im B2G-Bereich (`#rechnung-b2g-section`) wurden die vorzeitigen Download-Schaltflächen entfernt:
  - Button `exportXRechnungXMLFromModal()` entfernt.
  - Button `exportZugferdPdfFromModal()` entfernt.
- Der B2G-Bereich behält die Leitweg-ID- und Buyer-Reference-Pflichtfelder, dient im Modal jedoch rein der Datenerfassung.

### 3.2 UI-Eingabefelder für den Sicherheitseinbehalt ([`code.html`](../code.html))
- Es wurden zwei Eingabefelder mit Prozent-Symbol `%` integriert:
  1. `#rechnung-handwerk-sicherheitseinbehalt` im VOB-/Handwerksbereich direkt unter der Baustellen-Adresse.
  2. `#rechnung-sicherheitseinbehalt-prozent` in der Modifiers-Spalte der Summenbox (neben Gesamtrabatt und Anzahlung).
- Beide Felder rufen `oninput="syncSicherheitseinbehalt('...')"` auf und sind bidirektional synchronisiert.

### 3.3 Datenbankschema & Persistenz ([`schema.js`](../schema.js) & [`db.js`](../db.js))
- **Schema-Migration:**
  - `ALTER TABLE dokumente ADD COLUMN sicherheitseinbehalt_prozent REAL DEFAULT 0;`
- **DB-Funktionen:**
  - [`db.js`](../db.js): `saveDocument` und `bulkSaveDocuments` aktualisiert, um `sicherheitseinbehalt_prozent` zuverlässig zu schreiben und auszulesen.

### 3.4 MVC-Architektur: View & Controller
- **[`views/InvoiceView.js`](../views/InvoiceView.js):**
  - `getFormData()` liest vorrangig die Modal-Felder `#rechnung-sicherheitseinbehalt-prozent` und `#rechnung-handwerk-sicherheitseinbehalt` aus (mit Fallback auf das ausgewählte Projekt `currentProjekt.sicherheitseinbehalt_prozent`).
  - `updateTotalsUI()` zeigt bei `sicherheitseinbehaltNetto > 0` die Zeile `#rechnung-sicherheitseinbehalt-row` mit Label `Sicherheitseinbehalt Netto (X%)` und formatiertem Betrag `-${formatCurrency(sicherheitseinbehaltNetto)}`.
- **[`controllers/InvoiceController.js`](../controllers/InvoiceController.js):**
  - Rechnet in `calculateTotals()` den Einbehalt Netto-proportional aus, belässt die Umsatzsteuer ungemindert und reduziert den `zahlbetrag`.
  - Gibt `sicherheitseinbehaltProzent` und `sicherheitseinbehaltNetto` im Rückgabe-Objekt zurück.

### 3.5 Logik, Synchronisation & Event-Handling ([`js/editor.js`](../js/editor.js))
- **`syncSicherheitseinbehalt(sourceId)`:**
  - Synchronisiert Eingaben zwischen beiden Eingabefeldern und ruft `calculateRechnungTotals()` auf.
- **`calculateRechnungTotals()`:**
  - Speichert `sicherheitseinbehalt_prozent` in `state.currentRechnungTotals`.
- **`saveRechnung()` & `collectERechnungExportData()`:**
  - Sichert `sicherheitseinbehalt_prozent` im `newDoc`-Objekt für die Datenbank-Speicherung und E-Rechnung.
- **`applyRechnungReadOnlyMode()` & `applyRechnungEditMode()`:**
  - Liest beim Öffnen bestehender Rechnungen `existing.sicherheitseinbehalt_prozent` aus (mit Fallback-Rückrechnung aus `sicherheitseinbehalt / netto`) und befüllt beide Eingabefelder.
- **`applyRechnungNewMode()` & `setupAngebotModalUI()`:**
  - Setzt beide Eingabefelder auf `''` zurück.
- **Event-Listener:**
  - Beim Auswählen eines Projekts mit hinterlegtem Satz (`proj.sicherheitseinbehalt_prozent > 0`) wird der Satz automatisch in leere Felder eingetragen.
  - Beim manuellen Aktivieren der Checkbox `rechnung-vob-vereinbart` wird automatisch der VOB/B-Standardsatz `5.0 %` vorgeschlagen.

### 3.6 PDF- und Druckvorlagen ([`js/einstellungen.js`](../js/einstellungen.js))
- In `buildInvoiceDocumentHtml` wird die Abzugszeile im PDF mit Prozentangabe ausgegeben:
  `Abzug Sicherheitseinbehalt (5%): -X,XX €`

---

## 4. Verifikation & Testergebnisse

- **Neuer Unittest:**
  - [`tests/invoice_controller.test.js`](../tests/invoice_controller.test.js): Testet die exakte Berechnung von `sicherheitseinbehaltProzent`, Netto-Abzug, Steuerunberührtheit und End-Zahlbetrag.
- **Gesamtergebnis der Testsuite:**
  ```text
  # tests 233
  # suites 8
  # pass 233
  # fail 0
  # cancelled 0
  # skipped 0
  # duration_ms 7090.78
  ```
- **100% aller 233 automatisierten Tests bestanden.**
