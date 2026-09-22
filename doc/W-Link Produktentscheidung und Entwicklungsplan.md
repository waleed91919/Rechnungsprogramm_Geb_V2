# W-Link: Produktentscheidung und Entwicklungsplan

Stand: 10. September 2026. Grundlage ist der Branch `main` des Repositorys `waleed91919/Rechnungsprogramm_Geb_V2`, lokal geprüft am Commit `3522eccee4bcef342473f77bf7a4793f15a6ac3d` ([GitHub](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2)). Diese Bewertung verbindet eine gezielte Codeprüfung, einen eigenen Testlauf und einen fachlichen Abgleich; sie ist keine vollständige Sicherheitsprüfung, Rechtsberatung oder Konformitätszertifizierung.

## Entscheidung in Kürze

**Meine Empfehlung: W-Link zunächst als spezialisierte Bau-Rechnungssoftware mit Projektverwaltung positionieren und später gezielt zum Bau-ERP ausbauen.** Weder ein allgemeines Rechnungsprogramm für jede Branche noch ein umfassendes ERP für alle Bauunternehmen sollte das nächste Produktversprechen sein.

Eine mögliche Bezeichnung wäre: **„W-Link Bau: Angebote, Aufmaß und Bauabrechnung in einer Anwendung.“** Als zunächst zu prüfende Zielgruppe schlage ich kleine Ausbau- und Sanierungsbetriebe mit ungefähr 2 bis 20 Beschäftigten vor. Das ist eine Arbeitshypothese, keine festgestellte Kundennachfrage; ein einzelnes Gewerk und dessen konkrete Abläufe sollten den ersten Pilot bestimmen.

Der entscheidende Perspektivwechsel: Nicht möglichst viele weitere Module ergänzen, sondern einen vollständigen, zuverlässigen Arbeitsablauf liefern:

> Kunde → Angebot/LV → Auftrag/Projekt → Aufmaß und Nachträge → Abschlagsrechnung → Zahlung → Schlussrechnung → Steuerberaterexport

Vorhandene weiterführende Module müssen dafür nicht gelöscht werden. Ich würde sie zunächst als optionale oder experimentelle Bereiche behandeln und die Hauptoberfläche auf den freigegebenen Kern beschränken.

## Was tatsächlich vorhanden ist

W-Link ist bereits eine Electron-Desktopanwendung mit JavaScript und SQLite; das Paket nennt Version 1.0.5 und enthält Windows-Paketierungsziele ([Paketkonfiguration](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2/blob/main/package.json)). Die folgende Übersicht beschreibt vorhandenen Code, nicht automatisch vollständig geprüfte oder produktionsreife Funktionen.

| Bereich | Befund aus dem Repository | Konsequenz für die Planung |
|---|---|---|
| Rechnungswesen | Rechnungsmodell, Berechnungscontroller, Editor, Storno-/Sperrlogik, E-Rechnung, DATEV und Banking sind implementiert ([GitHub](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2)). | Diesen Kern konsolidieren, nicht neu bauen. |
| Bauabrechnung | Aufmaß, Nachträge, Kalkulation, EFB und kumulative Abrechnung haben eigene Controller und Tests ([GitHub](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2)). | Durchgängige Integration und fachliche Randfälle prüfen. |
| Operative Bauverwaltung | Code für Bautagebuch, Mängel, Zeiterfassung, Nachunternehmer und Controlling ist vorhanden ([GitHub](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2)). | Nur nach tatsächlichem Pilotbedarf freigeben und erweitern. |
| Mobile Nutzung | Eine PWA und ein lokaler Sync-Server sind vorhanden ([Repository](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2), [Sync-Server](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2/blob/main/main/sync-server.js)). | Vor Nutzung mit echten Betriebsdaten Sicherheitslücken schließen. |
| Bestehende Prüfungen | Mein Lauf von `npm test` meldete 375 bestandene Tests, 13 Suites, 0 Fehler und 0 übersprungene Tests; die TAP-Ausgabe zählt daneben 223 Einträge auf oberster Ebene ([geprüfte Testsuite im Repository](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2)). | Gute Grundlage, aber kein Ersatz für echte Desktop-Abläufe und externe Formatprüfungen. |

### Umfang und Grenzen meiner Prüfung

Die Tests liefen lokal unter Linux mit Node.js 20.20.1 nach `npm ci --ignore-scripts` und einem separaten Rebuild von `better-sqlite3`; die Laufzeit des Testbefehls lag bei rund neun Sekunden. Es wurden keine Windows-Installation, keine reale Electron-Bedienung, keine produktive Bankanbindung und kein unabhängiger KoSIT-/PDF/A-Validatorlauf durchgeführt.

Die Prüfung hat keine GitHub-Dateien geändert und keine Commits, Pull Requests oder Issues erstellt. Die Tests erzeugten ausschließlich in der lokalen Prüfkopie neue Beispielausgaben und Testberichte.

## Die wichtigsten Freigaberisiken

### Mobiler Sync: Zugriffsschutz vor Funktionsausbau

Im HTTP-Router werden Push, Pull und Foto-Upload ohne vorgeschaltete Authentifizierungsprüfung aufgerufen; eine Prüfung des Pairing-Tokens existiert separat beim Pairing ([Sync-Server, insbesondere Zeilen 338–438](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2/blob/main/main/sync-server.js)). Die Pull-Funktion fragt unter anderem Mitarbeiterfelder einschließlich Tarifstundensatz ab, und der Server bindet sich an alle Netzwerkschnittstellen ([Sync-Server, insbesondere Zeilen 126 und 693–711](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2/blob/main/main/sync-server.js)).

Ich habe den Router mit ausschließlich synthetischen Daten direkt aufgerufen: Ein Pull-Aufruf ohne Zugangsdaten erhielt Status 200 mit Daten. Dies bestätigt die fehlende Prüfung im Anwendungscode; die Erreichbarkeit einer konkreten Installation hängt zusätzlich von Betriebssystem, Firewall und Netzwerk ab ([geprüfter Router](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2/blob/main/main/sync-server.js)).

Zusätzlich startet `main.js` den Sync-Server, wenn die Autostart-Einstellung fehlt, und übergibt dabei keine TLS-Konfiguration ([Startlogik, Zeilen 1494–1500](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2/blob/main/main.js)). **Bis zur Absicherung empfehle ich, den Sync-Autostart ausdrücklich zu deaktivieren und keine echten Betriebsdaten über diesen Dienst bereitzustellen.**

Vorgeschlagene Abnahmekriterien:

- **Sicherer Standard:** Sync ist ohne bewusste Aktivierung ausgeschaltet.
- **Geräteanmeldung:** Pairing erzeugt einen widerrufbaren, begrenzten Zugang; ein Pairing-Code allein ist kein dauerhafter Zugriffsschutz.
- **Berechtigungen:** Jeder Datenabruf, jede Mutation, jeder Upload und jeder Ereigniskanal prüft Identität und Rechte.
- **Datensparsamkeit:** Ein Baustellengerät erhält nur freigegebene Projekte und die dafür notwendigen Mitarbeiterdaten.
- **Transport und Eingaben:** Sichere Transportkonfiguration, eingeschränkte Origins, Upload-Grenzen und sichere Dateinamen.
- **Negativtests:** Nicht angemeldete und gesperrte Geräte erhalten 401/403; unzulässige Schreibversuche verändern keine Daten.

Zusätzlich wird synchronisierter Tagesberichtstext in der Projektansicht direkt in `innerHTML` eingesetzt; das ist ein statisch festgestelltes HTML-Injektionsrisiko, kein von mir durchgeführter Angriff auf eine Installation ([Projektansicht, Zeilen 2181–2191](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2/blob/main/js/projekte.js), [Speicherung der Texte](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2/blob/main/main/sync-server.js)). Als Abnahmekriterium ergänzen: Fremdtexte werden als Text dargestellt, nicht als aktives HTML interpretiert.

### Projektübergaben: Erfolgsmeldung ohne vollständige Ausführung

`executeAufmassUebergabe()` verändert im bestehenden Dokument lediglich ein Speicherobjekt, ohne es über eine Speicherfunktion zu persistieren; im Zweig für ein neues Dokument wird nur eine Erfolgsmeldung angezeigt ([Projektübergaben, Zeilen 1261–1292](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2/blob/main/js/projekte.js)). `applyApprovedNachtraegeToCurrentInvoice()` berechnet Positionen und zeigt deren Anzahl an, übernimmt diese aber nicht in eine Rechnung ([Nachtragsübergabe, Zeilen 1304–1318](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2/blob/main/js/projekte.js)).

Das bedeutet nicht, dass sämtliche Aufmaßfunktionen fehlen. Es betrifft diese konkreten Projektübergaben und ist ein Beispiel dafür, weshalb vorhandene Module noch keinen fertigen Gesamtprozess ergeben.

Vorgeschlagene Abnahme: Aufmaß und genehmigten Nachtrag übernehmen, Rechnung speichern, Anwendung schließen und erneut öffnen. Mengen, Preise, Herkunftsbezug und Nachtragspositionen müssen unverändert vorliegen; gesperrte Rechnungen dürfen nicht nachträglich verändert werden.

### Sicherheitseinbehalt: Reproduzierbare Mehrfachberücksichtigung

Die aktive Rechnungsansicht ruft `InvoiceController.calculateTotals()` auf; der Editor übergibt bei der Verrechnung den vorherigen Nettobetrag, jedoch keinen vorherigen Sicherheitseinbehalt ([InvoiceView, Zeilen 258–265](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2/blob/main/views/InvoiceView.js), [Editor, Zeilen 1796–1806](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2/blob/main/js/editor.js)). Dieser Rechner zieht die vorherigen Nettowerte ab, berechnet den Einbehalt aber erneut auf den gesamten kumulierten Leistungsstand ([InvoiceController, insbesondere Zeilen 91–159 und 205–206](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2/blob/main/controllers/InvoiceController.js)).

Ich habe die Berechnungsfunktion mit zwei Abschlägen direkt ausgeführt: Nettomodus, 19 % Steuer, vereinbarter Einbehalt von 5 %, Modus `EXECUTION`, Auftragssumme 1.000 Euro und Leistungsstände 100 beziehungsweise 200 Euro netto ([getesteter Rechner](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2/blob/main/controllers/InvoiceController.js)).

| Testschritt | Ergebnis der ausgeführten Funktion |
|---|---|
| Erster Abschlag: 100 Euro Leistung | 5 Euro Einbehalt; 114 Euro Zahlbetrag |
| Zweiter Abschlag: 200 Euro kumulierte Leistung, 100 Euro netto verrechnet | Weitere 10 Euro Einbehalt; 109 Euro Zahlbetrag |
| Summe beider Zahlbeträge | 223 Euro statt 228 Euro bei insgesamt 10 Euro Einbehalt |

Die Tabelle dokumentiert meinen isolierten Funktionsaufruf, keinen vollständigen Desktop-Test. Unter diesen Testannahmen werden 15 statt 10 Euro einbehalten; der separate `CumulativeBillingController` berücksichtigt vorherige Einbehalte, ist jedoch nicht der in diesem Rechnungsformular verwendete Rechner ([aktiver Rechner](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2/blob/main/controllers/InvoiceController.js), [separater kumulativer Rechner](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2/blob/main/controllers/CumulativeBillingController.js)).

Vorgeschlagene Abnahme: Eine einzige fachliche Berechnungskette für Formular, Speicherung, PDF und XML verwenden. Die Summe der Periodeneinbehalte muss dem vereinbarten kumulativen Zieleinbehalt entsprechen; Deckelung und spätere Freigabe separat testen.

### E-Rechnung: Erzeugung ist nicht gleich nachgewiesene Konformität

`js/einvoice.js` verwendet `GUIDELINE_XRECHNUNG_23` mit der Kennung `xrechnung_2.3` sowohl für das XRechnung-Profil als auch für den direkten XML-Generator ([E-Rechnungscode, Zeilen 5, 317 und 336](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2/blob/main/js/einvoice.js)). KoSIT führt aktuell die Standardlinie XRechnung 3.0 und das Bundle 3.0.2 Summer 2026 Bugfix mit Fassung vom 31. August 2026 ([KoSIT: Versionen und Bundles](https://xeinkauf.de/xrechnung/versionen-und-bundles/)).

Die eigene ZUGFeRD-Dokumentation unterscheidet ausdrücklich zwischen internen Strukturprüfungen und vollständiger PDF/A-Konformität und führt den veraPDF-Lauf noch als offen ([Validierungsdokumentation](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2/blob/main/doc/zugferd-validation.md)). Daraus folgt nicht, dass jede erzeugte Rechnung falsch ist; eine belastbare Freigabe ist damit aber nicht nachgewiesen.

Vorgeschlagene Abnahmekriterien:

- **Aktuelles Profil:** XRechnung vollständig auf die aktuellen Regeln abgleichen, nicht nur die Versionszeichenfolge austauschen.
- **Unabhängige Prüfungen:** Repräsentative XML-Dateien gegen das festgelegte KoSIT-Bundle prüfen; ZUGFeRD zusätzlich mit geeignetem XML-/Hybridvalidator und PDF/A-Prüfung.
- **Reproduzierbarkeit:** Validatorversionen, Fixtures und vollständige Prüfberichte pro Release archivieren.
- **Abgleich:** Sichtbares PDF, strukturierte XML, gespeicherte Rechnung und Zahlbetrag müssen übereinstimmen.
- **Fehlerfälle:** Ungültige Exporte werden mit konkreten, verständlichen Hinweisen blockiert.

Ein weiterer Befund betrifft den Belegabschluss: `collectERechnungExportData()` baut den Export aus Formularfeldern ohne Beleg-ID auf, und der XRechnung-Handler exportiert diesen Payload und kann den Vorgang mit `entityId: 0` protokollieren ([Exportdaten im Editor](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2/blob/main/js/editor.js), [Export im Hauptprozess](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2/blob/main/main.js)). Ich empfehle daher, produktive Exporte ausschließlich aus einer gespeicherten und festgeschriebenen Belegversion zu erzeugen und davon klar getrennte Entwurfsvorschauen anzubieten.

### Bauabrechnung: Rechnungsbeträge und Zahlungseingänge sauber trennen

Der kumulative Controller berechnet die neue Periodenleistung aus dem bisherigen Leistungsstand abzüglich vorheriger Rechnungsbeträge ([CumulativeBillingController, Zeilen 33–39](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2/blob/main/controllers/CumulativeBillingController.js)). Das kann für die Periodenabgrenzung sinnvoll sein, belegt aber für sich noch keine korrekte Abwicklung offener, teilweise bezahlter oder gekürzter Forderungen bis zur Schlussrechnung.

Bauprofessor beschreibt bei kumulativer Abrechnung den Nachweis des Leistungsstands durch ein fortgeführtes Aufmaß und die Berücksichtigung tatsächlich vereinnahmter Abschlagszahlungen; unbezahlte Forderungen und Einbehalte dürfen in der Schlussbetrachtung nicht verschwinden ([Bauprofessor: kumulative Abschlagsrechnungen](https://www.bauprofessor.de/kumulative-abschlagsrechnungen/)). Deshalb würde ich die gesamte Kette fachlich testen, statt allein aus der Controllerformel einen Fehler oder vollständige Korrektheit abzuleiten.

Vorgeschlagene Abnahmekriterien:

- **Getrennte Werte:** Leistungsstand, bereits fakturierter Betrag, tatsächliche Zahlungen, Einbehalte und verbleibende Forderung sind separat nachvollziehbar.
- **Durchgängiger Test:** Zwei Abschlagsrechnungen, Teilzahlung, genehmigter Nachtrag, Schlussrechnung und spätere Einbehaltsfreigabe vollständig durchspielen.
- **Keine Doppelzählung:** Der Projekt-OPOS stimmt nach Schlussrechnung mit den verbleibenden Forderungen überein.
- **Fachliche Regeln:** Vertragsabhängige Sätze, Fristen und Normregeln explizit konfigurieren und prüfen lassen, statt allgemeine Rechtssicherheit zu versprechen.

### Testabdeckung und Wartbarkeit: Qualität sichtbar machen

Die Datei `frontend_ui_integration.test.js` verwendet beim Aufmaß-Rechnungsübergang beispielsweise `mockAggregatedAufmass` und `mockInvoicePositions` und simuliert deren Übertragung; dieser Test bedient nicht die reale Electron-Oberfläche ([Frontend-Test](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2/blob/main/tests/frontend_ui_integration.test.js)). Außerdem umfasst `db.js` 4.937 Zeilen und `main.js` 1.543 Zeilen ([Datenzugriff](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2/blob/main/db.js), [Hauptprozess](https://github.com/waleed91919/Rechnungsprogramm_Geb_V2/blob/main/main.js)).

Ich empfehle echte Desktop-End-to-End-Tests, automatisierte Releaseprüfungen und schrittweise kleinere Verantwortungsbereiche. Ein vollständiger Frameworkwechsel würde ich dagegen nicht zum nächsten Meilenstein machen.

## Warum nicht sofort ein großes ERP?

Die folgende Gegenüberstellung ist meine produktstrategische Bewertung, keine erhobene Marktstudie. Sie berücksichtigt insbesondere den vorhandenen Code und die noch fehlenden Freigabenachweise.

| Option | Vorteil | Nachteil | Empfehlung |
|---|---|---|---|
| Allgemeines Rechnungsprogramm | Leicht verständlicher Nutzen, engerer Funktionsumfang möglich | Die bereits gebaute Bau-Spezialisierung würde im Produktversprechen untergehen | Nicht mein bevorzugter Weg |
| Bau-Rechnungssoftware mit Projektverwaltung | Klare Verbindung zwischen Aufmaß, Leistung, Rechnung und Zahlung; modular erweiterbar | Erfordert tiefe fachliche Qualität in genau diesem Kern | **Als nächstes Ziel wählen** |
| Vollständiges Bau-ERP | Langfristig umfassender betrieblicher Nutzen möglich | Sehr breite Verantwortung für Abläufe, Rollen, Daten, Einführung, Support und Schnittstellen | Als spätere, nachfragegesteuerte Entwicklung |

Ich würde vorerst keine vollständige Finanzbuchhaltung, Lohnabrechnung, umfassende Lagerwirtschaft oder KI-Automatisierung zum Kernversprechen machen. Bereits vorhandene Ansätze können erhalten bleiben; neue Entwicklungskapazität sollte zuerst in einen zuverlässig freigegebenen Abrechnungsprozess fließen.

## Fachliche Leitplanken für den ersten Produktumfang

Bauprofessor stellt bei der Bauabrechnung die übersichtliche, nachvollziehbare Darstellung erbrachter Leistungen sowie Aufmaß und erforderliche Nachweise heraus ([Bauprofessor: Abrechnung von Bauleistungen](https://www.bauprofessor.de/abrechnung-von-bauleistungen/)). Daraus leite ich ab, dass W-Link nicht nur Rechnungsvorlagen anbieten sollte, sondern die Herleitung jeder abgerechneten Menge nachvollziehbar machen muss.

Eine einfache PDF-Datei ist nach der seit 2025 geltenden Definition keine strukturierte E-Rechnung; für inländische B2B-Umsätze bestehen Ausnahmen und Übergangsregeln, insbesondere allgemein bis Ende 2026 und bei einem Vorjahresumsatz bis 800.000 Euro bis Ende 2027 ([BMF: E-Rechnung-FAQ](https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html)). Die Fähigkeit zum Empfang besteht grundsätzlich bereits seit 2025; dafür genügt ein E-Mail-Postfach, eine vollständige ERP-Eingangsrechnungsverarbeitung ist nicht allein deswegen gesetzlich vorgeschrieben ([BMF: E-Rechnung-FAQ](https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html)).

Für Bauleistungen nennt das BMF auch eine praktikable Darstellung: Gewerke mit Summen im strukturierten Teil und eine eindeutig referenzierte menschenlesbare LV-Anlage; für vereinnahmte Teilentgelte in der Endrechnung wird ebenfalls eine ergänzende Anhanglösung beschrieben ([BMF: E-Rechnung-FAQ](https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html)). Ich würde diese Möglichkeiten fachlich prüfen, statt unnötig früh jede bauspezifische Detailinformation in ein selbst erfundenes XML-Modell zu pressen.

## Entwicklungsplan: Jetzt, danach, später

Zeitangaben wären ohne Kenntnis deiner verfügbaren Entwicklungszeit, deines Teams und der Pilotbetriebe spekulativ. Deshalb enthält dieser Plan klare Ergebnisse und Freigaben statt scheinbar verbindlicher Kalendertermine.

### Jetzt: Ein sicherer, prüfbarer Rechnungskern

- **Sicherheitsfreigabe:** Sync standardmäßig deaktivieren und die beschriebenen Zugriffsschutzlücken schließen.
- **Funktionskorrekturen:** Projektaufmaß-/Nachtragsübergaben tatsächlich speichern und Mehrfachabzüge beim Sicherheitseinbehalt beheben.
- **E-Rechnungsfreigabe:** Aktuelle XRechnung-Regeln und externe XML-/PDF-Prüfungen etablieren.
- **Fachliche Freigabe:** Angebote, Aufmaß, Nachträge, Abschläge, Zahlungen, Einbehalte und Schlussrechnung an realistischen Fällen abgleichen.
- **Datensicherheit:** Backup-Wiederherstellung, fehlgeschlagene Updates und Datenmigrationen mit Testdaten durchspielen.
- **Releaseprozess:** Dokumentierte unterstützte Laufzeiten, automatisierte Tests und ein Windows-Installations-/Update-Test pro Release.
- **Einfachere Oberfläche:** Der ausgewählte Kernprozess ist ohne Wechsel durch zahlreiche Spezialmodule nutzbar.

### Danach: Mit einem Gewerk im Alltag lernen

- **Pilotgruppe:** Drei Betriebe aus möglichst demselben Gewerk gewinnen und zunächst mit anonymisierten Fällen arbeiten.
- **Beobachtung:** Je Betrieb einen echten Arbeitsablauf gemeinsam durchgehen: vom Angebot bis zum Zahlungseingang.
- **Erfolgskriterien:** Kein Datenverlust, keine ungeklärten Cent-Differenzen, akzeptierte Exportdateien und eine Schlussrechnung ohne manuelle Korrektur in einem zweiten Programm.
- **Bedienbarkeit:** Messen, an welchen Stellen Hilfe benötigt wird, wie lange ein Angebot dauert und wo Daten doppelt erfasst werden.
- **Fokus:** Nur die aus diesen Beobachtungen entstehenden wichtigsten Hindernisse bearbeiten.

### Später: Bedarfsgesteuert zum schlanken ERP

- **Projektcontrolling:** Erlöse, tatsächliche Kosten und offene Forderungen pro Baustelle zusammenführen.
- **Mobile Abläufe:** Freigegebene Zeiterfassung, Fotos und Bautagebuch nach bestandener Sicherheitsprüfung ausbauen.
- **Teamarbeit:** Rollen, Verantwortlichkeiten, Freigaben und Konfliktbehandlung für den tatsächlichen Mehrbenutzerbedarf gestalten.
- **Einkauf und Nachunternehmer:** Erst vertiefen, wenn Pilotbetriebe konkrete, wiederkehrende Anforderungen bestätigen.
- **Schnittstellen:** GAEB, DATEV und andere vorhandene Export-/Importwege mit realen Gegenstellen testen; zusätzliche Integrationen nur bei belegtem Nutzen.

## Technische Richtung und nächster Auftrag

Ich würde Electron und SQLite für den ersten lokalen Desktop-Produktumfang zunächst beibehalten und die Anwendung schrittweise in klar getrennte Module gliedern. Für späteren gleichzeitigen Mehrbenutzerzugriff sollte eine eigene Architekturentscheidung folgen, statt einfach eine lokale Datenbankdatei zwischen Arbeitsplätzen zu teilen.

Ein sinnvoller nächster Entwicklungsauftrag wäre: **„W-Link Bau: Sicherheit und durchgängigen Rechnungskern stabilisieren.“** Der erste Teil sollte Sync-Standard, Zugriffsschutz und Regressionstests umfassen; danach folgen die fehlerhaften Projektübergaben, die Einbehaltsberechnung sowie eine aktuelle XRechnung-Ausgabe aus festgeschriebenen Belegen mit unabhängigem Validator.

Vor einer tatsächlichen Umsetzung sollten wir noch Zielgewerk, vorhandene Testkunden und die Priorität zwischen Einzelplatz und Teamnutzung festlegen. Meine Empfehlung bleibt: **Bauabrechnung zuverlässig machen, die Bedienung vereinfachen und erst anschließend das ERP-Versprechen erweitern.**
