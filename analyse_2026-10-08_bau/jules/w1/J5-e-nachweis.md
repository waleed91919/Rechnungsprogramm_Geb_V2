# J5 — E-Nachweis-Doku-Lauf (KEIN Code): KoSIT + VeraPDF/Mustang für 1 Demo-Rechnung

> Copy-Paste-Prompt für Jules. Snapshot: Repo `C:\Users\walee\Desktop\server\Rechnungsprogramm_Geb_V2`, Base-Branch `bau-p0p1-base@194cd83` (lokal aus `main@194cd83`, 2026-10-08). Reine Doku-Arbeit, parallel zu J0/J3/J4 möglich.

**Titel:** J5 E-Nachweis: 1 dokumentierter KoSIT-Schematron- + VeraPDF/Mustang-Lauf (Sicht=XML)
**Branch-Name:** `jules/j5-e-nachweis`
**Base:** `bau-p0p1-base@194cd83`
**Ziel:** Für 1 Demo-Rechnung (TEST-BAU-01 L1) liegt ein nachvollziehbares Prüfprotokoll bei — keine „rechtssicher"-Sprache.

## Scope-Dateien (darf anfassen — NUR Doku/Artefakte, KEIN Produktcode)
- `doc/e-nachweis/TEST-BAU-01-L1-validierung.md` (NEU, Protokoll: Datum, Versionen, Befehle, Ergebnisse, Screenshots-Pfade)
- `output/e-nachweis/TEST-BAU-01-L1.*` (NEU: Demo-XML aus App-Export + KoSIT-Report + Mustang/VeraPDF-Report; synthetische Daten, keine Echtdaten)
- Darf lesen (read-only): `js/einvoice/einvoice-viewer.js:216-242`, `controllers/*`, `tests/zugferd.test.js`, `tests/erechnung_belegfixierung.test.js`

## Out-of-scope (verboten)
- KEIN Produktcode (`js/*`, `controllers/*`, `db/*`, `main.js`, `preload.js`, `schema.js`), KEINE Teständerung, KEINE `database.sqlite`, KEINE Dependency-Änderung, KEINE „rechtssicher/GoBD-konform"-Aussage, KEINE Echtdaten hochladen.

## Schritte (nummeriert)
1. `git checkout bau-p0p1-base && git checkout -b jules/j5-e-nachweis`.
2. Demo-Rechnung erzeugen: TEST-BAU-01 L1 (1300/247/1547, 1 Position, 19 %) als XRechnung-XML (CII) + ZUGFeRD-PDF (Sicht=XML: PDF-Sicht entspricht XML-Beträgen) aus der App exportieren, unter `output/e-nachweis/TEST-BAU-01-L1.xml` (+ `.pdf`) ablegen. Nur synthetischer Demo-Kunde.
3. KoSIT-Lauf: offiziellen KoSIT-Validator + `validator-configuration-xrechnung` (Version notieren) per CLI/GUI auf die XML-Datei laufen lassen: `java -jar validator*.jar -s scenarios.xml -o report.html TEST-BAU-01-L1.xml` (exakten Befehl + Version in Doku). Report als `output/e-nachweis/kosit-report.{xml,html}` ablegen.
4. Mustang/VeraPDF-Lauf: Mustang-Validator (Version notieren, z. B. 2.26.0 / Schematron EN16931 v1.3.16) auf PDF (Container: VeraPDF PDF/A-3) + eingebettetes XML (Schema + Schematron) laufen lassen (`mustangserver.com/validate` oder CLI). Report als `output/e-nachweis/mustang-report.xml` ablegen.
5. `doc/e-nachweis/TEST-BAU-01-L1-validierung.md` schreiben: Datum 2026-10-08, Tool-Versionen (KoSIT-Validator, XRechnung-Konfig, Mustang, VeraPDF), Eingabedatei-Hashes (SHA256), exakte Befehle, Ergebnis (pass/fail je Schicht: Container/Schema/Geschäftsregeln inkl. BR-DE-15/BT-10), bekannte Abweichungen, Hinweis „technisch valide ≠ rechtlich/fachlich angenommen, kein Rechtsversprechen".
6. Negativprobe dokumentieren: gleiche Datei ohne BT-10 → KoSIT-Fehler BR-DE-15 screenshot-/log-belegt (erwarteter Fail, kein Fix).
7. Verifiziere: `git status --short` zeigt NUR `doc/e-nachweis/*` + `output/e-nachweis/*`; `git diff --stat main` enthält keine `js|controllers|db|tests`-Datei.

## Exakte Testbefehle (Doku-Nachweis, kein Unit-Test)
```
node --test tests/zugferd.test.js tests/erechnung_belegfixierung.test.js
dir output\e-nachweis
```

## TEST-BAU-01-Akzeptanz
- Angebot 2500/475/2975, N1 300/57/357, L1/F1 1300/247/1547, L2 2800/532/3332, F2 1500/285/1785, Teilzahlung 1500 → Rest 47, Schluss 0 — für J5 genügt L1 1300/247/1547 als Demo-Beleg; Protokolldatei liegt bei (`doc/e-nachweis/*.md` + Reports), Sicht=XML belegt.

## Quellen (alle Zugriff 2026-10-08)
| # | URL | Aussage |
|---|---|---|
| 1 | https://github.com/itplr-kosit/validator | KoSIT-Engine: Schema+Schematron, Report-XML |
| 2 | https://github.com/itplr-kosit/validator-configuration-xrechnung | XRechnung-Regeln (EN16931 + CIUS, BR-DE) |
| 3 | https://zugferd.randomstar.org/de/docs/mustang/ | 3 Schichten: VeraPDF + XSD + Schematron; Versionen 2.26.0/2.5.2 |
| 4 | https://mustangserver.com/validate/ | Online-Validierung PDF/A-3 + XML (XRechnung/ZUGFeRD) |
| 5 | https://www.bauprofessor.de/schlussrechnung/ | Schluss kumulativ-Abzug, USt-Beispiele — Demo-Betragsmaßstab |
| 6 | https://xeinkauf.de/xrechnung/versionen-und-bundles/ | XRechnung 3.0 gültig bis mind. 31.07.2027 (S3-Q9) |

## PR-Anforderung
- Nur Doku-Diff, Reports als Artefakte, Tool-Versionen + Hashes in PR-Beschreibung, offene Punkte (PDF/A-3-Lücken, Regelstands-Datum) nennen, keine Codeänderung behaupten.

## Summary (max. 15 Zeilen)
- 1 Demo-L1 exportiert (Sicht=XML).
- KoSIT-Report liegt bei.
- Mustang/VeraPDF-Report liegt bei.
- Negativprobe BT-10 belegt.
- Kein Code geändert.
- Keine Rechtsaussage.
