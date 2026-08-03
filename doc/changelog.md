# Changelog / Fortschritt

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
