# J12 — Musterbrief-Verlinkung (18 Pflichtbriefe, nur Verlinkung + Textvorlagen)

> Copy-Paste-Prompt für Jules. Nie prod-`database.sqlite` (nur `:memory:`/`mkdtemp` + TEST-BAU-01). Additiv: keine bestehenden Module umbauen.

## Titel
J12: 18 VOB/BGB-Musterbriefe als Textvorlagen mit Paragraph + Fristhinweis + Bauprofessor-Link

## Branch
`jules/j12-musterbriefe`

## Base / Ziel
- Base: Remote-`main` (enthält Welle 1 + Welle 2, Stand 2026-10-08). Ignoriere lokale `bau-p0p1-base`-Zeilen aus alten Prompts.
- Ziel: Auto-PR gegen `main`. Kein Direkt-Commit auf `main`.

## Kontext
Fachmaßstab `S1_BAUFACH.md` §2: 18 Pflicht-Musterbriefe für Büro + Baustelle (jeweils Textvorlage mit Platzhaltern + Paragraph + Fristhinweis). Gesamtverzeichnis: https://www.bauprofessor.de/musterbriefe/uebersicht/ (326 Briefe). KEIN Rechtsversprechen („keine Rechtsberatung", nur Verlinkung + Vorlage).

## Die 18 Vorlagen (alle mit Platzhaltern {kunde}, {projekt}, {datum}, {frist}, {betrag} wo passend + Paragraph + Fristhinweis + URL)
1. Behinderungsanzeige (VOB/B §6 Abs.1) — https://www.bauprofessor.de/musterbrief/behinderung-bauausfuehrung/
2. Fortsetzung nach Behinderung (§6 Abs.3) + Fristverlängerung (§6 Abs.4) / Schadenersatz (§6 Abs.6)
3. Behinderungsanzeige BGB (Witterung, ohne VOB-Automatik)
4. Bedenkenanzeige (§4 Abs.3) + Bedenken nach Prüfung Ausführungsunterlagen (§3 Abs.3) — https://www.bauprofessor.de/musterbrief/bedenkenanzeige/
5. Nachtragsankündigung + Nachtragsangebot (§2 Abs.5 / §2 Abs.6 / §2 Abs.3 Nr.2/3)
6. BGB-Änderungsbegehren/Anordnung (§650b Abs.1/2) + 80 %-Abschlagshinweis (§650c Abs.3)
7. Abhilfeaufforderung / Gefährdung termingerechte Ausführung (§5 Abs.3) — https://www.bauprofessor.de/musterbrief/gefaehrdung-termingemaesse-bauausfuehrung/
8. Abnahmeverlangen (§12 Abs.1) / Teilabnahme (§12 Abs.2) / Verweigerung wegen wesentlicher Mängel (§12 Abs.3)
9. Mängelanzeige Bauausführung (§4 Abs.7 + §8 Abs.3) — https://www.bauprofessor.de/musterbrief/maengelanzeige-waehrend-bauausfuehrung-mit-fristsetzung/ ; Mängelanzeige Gewährleistung (§13 Abs.5 Nr.1) + Nachfrist (§13 Abs.5 Nr.2)
10. Gemeinsames Aufmaß (§14 Abs.2) + Aufmaß/Abnahme nach Kündigung (§8 Abs.7)
11. Mahnung + Nachfrist Abschläge (§16 Abs.1/5) + Einstellung der Arbeiten (§16 Abs.5 Nr.4)
12. Abschlag auf Schlussrechnung bei verzögerter Prüfung (§16 Abs.3 Nr.1)
13. Schlusszahlungserklärung mit Ausschlusswirkung (§16 Abs.3 Nr.2/3) + Vorbehalt (§16 Abs.3 Nr.5, 28 Tage)
14. Abweisung Nachforderungen nach vorbehaltloser Annahme (§16 Abs.3 Nr.2/4)
15. Kündigungsschreiben: frei (§8 Abs.1) / nach Fristablauf (§8 Abs.3) + Schriftform-Nachweis
16. BGB-Zustandsfeststellung (§650g Abs.1/2) + Fälligkeits-Anschreiben (§650g Abs.4)
17. Verbraucherbau: 90 %-Deckelerklärung, 5 %-Sicherheitseinbehalt (§650m Abs.1/2)
18. EFB-Anlage: Anschreiben EFB 221/222/223 + Urkalkulations-Verweis

## Scope (darf angefasst werden)
- NEU: Vorlage-Daten (z. B. `js/musterbriefe/musterbriefe-data.js` o. ä.): 18 Einträge {id, titel, paragraph, fristhinweis, url, vorlage-text mit Platzhaltern}.
- NEU: UI (Browser/Auswahl + Platzhalter-Vorausfüllung aus Vorgang Kunde/Projekt/Datum + Kopieren/Drucken + Link-Öffnen).
- Minimal: Navigationseintrag (kein Umbau bestehender Views).
- Tests: `tests/j12-musterbriefe.test.js` (18 Einträge vorhanden, Platzhalter ersetzbar, URLs http(s)).

## Out-of-scope (NICHT anfassen)
- Keine bestehenden Module umbauen (kein Dashboard/Editor/Repo/Schema-Eingriff über Navigations-Eintrag hinaus).
- KEINE „rechtssicher/GoBD-konform"-Aussage, keine Rechtsberatungstexte — überall Disclaimer „Vorlage, keine Rechtsberatung".
- Keine prod-DB, keine Dependencies, keine Versionserhöhung.

## Schritte
1. Daten-Datei mit 18 Vorlagen anlegen (Texte knapp, fachlich korrekt, Platzhalter-System einheitlich).
2. UI: Liste (Suche nach Paragraph/Stichwort) + Detail (Vorlage + Vorausfüllung + Kopieren + Extern-Link).
3. Navigationseintrag (Kern oder Einstellungen — kleinste Variante).
4. Test schreiben + ausführen; `npm test` darf nicht rot werden.
5. TEST-BAU-01: keine Beträge betroffen (reine Doku-Funktion).

## Testbefehle
```
node --test tests/j12-musterbriefe.test.js
```

## Akzeptanz (messbar)
- 18 Vorlagen mit Paragraph + Fristhinweis + URL vorhanden und per Test nachweisbar.
- Platzhalter-Vorausfüllung funktioniert (Test mit TEST-BAU-01-Kundendaten).
- Keine Datei außerhalb Scope geändert; `npm test` grün.

## PR-Anforderung
- Kleine Diff (nur neue Dateien + 1 Navigations-Zeile), Test-Output in PR, offene Punkte (PDF-Export, E-Signatur) nennen.
