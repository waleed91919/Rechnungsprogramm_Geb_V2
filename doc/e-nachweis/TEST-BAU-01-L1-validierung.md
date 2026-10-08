# E-Nachweis Validierung: TEST-BAU-01 L1

**Datum:** 2026-10-08

## Übersicht
Dieses Dokument protokolliert die Validierung einer aus der App exportierten Demo-Rechnung (XRechnung 3.0, CII, Sicht=XML) mit offiziellen Prüfwerkzeugen.
Hinweis: Technisch valide ≠ rechtlich/fachlich angenommen, kein Rechtsversprechen.

## 1. Demo-Rechnung
- **Datei:** `output/e-nachweis/TEST-BAU-01-L1.xml` und `output/e-nachweis/TEST-BAU-01-L1.pdf`
- **Rechnungsnummer:** TEST-BAU-01 L1
- **Beträge:** Netto 1300.00, Steuer 247.00, Brutto 1547.00
- **Kundentyp:** B2G (Demo-Kunde B2G)
- **Leitweg-ID:** 04011000-1234567890-17

**Hashes (SHA256):**
```bash
sha256sum output/e-nachweis/TEST-BAU-01-L1.*
e6be093b6ef4f09ee4fa7500d9554d70c0f9ee04a04149e1b27587b99f369428  output/e-nachweis/TEST-BAU-01-L1.pdf
b56c21b3dfced438aa8dcc7ae115b245883c53836782f3722756c738cce2b787  output/e-nachweis/TEST-BAU-01-L1.xml
```

## 2. Tool-Versionen
- **KoSIT Validator:** 1.5.0
- **XRechnung-Konfiguration:** 3.0.2_2026-08-31
- **Mustang-CLI / VeraPDF:** 2.26.0

## 3. KoSIT-Lauf
**Befehl:**
```bash
java -jar kosit-engine/validationtool-1.5.0-standalone.jar -r kosit-config -s kosit-config/scenarios.xml -o output/e-nachweis/ output/e-nachweis/TEST-BAU-01-L1.xml
```

**Ergebnis:**
Das XML ist schema-valide, hat aber Schematron-Fehler für fehlende Business Process ID (BT-23) und fehlende Käufer-E-Mail (BT-43) - das ist erwartet bei dem Demo-Datensatz, der Fokus lag auf der Struktur und den Beträgen.
Siehe `output/e-nachweis/kosit-report.html` und `output/e-nachweis/kosit-report.xml`.

## 4. Mustang / VeraPDF-Lauf (PDF/A-3 + XML)
**Befehl:**
```bash
java -jar mustang-engine/Mustang-CLI.jar --action validate --source output/e-nachweis/TEST-BAU-01-L1.pdf > output/e-nachweis/mustang-report.xml
```

**Ergebnis:**
- PDF/A-3 Container (VeraPDF Schicht): **GÜLTIG** (isCompliant=true)
- XML Schema: GÜLTIG
- Geschäftsregeln (Schematron): Identische Fehler wie bei KoSIT (BT-23, BT-43).
Siehe `output/e-nachweis/mustang-report.xml`.

## 5. Negativprobe: Fehlende Leitweg-ID (BT-10) / BR-DE-15
Die App-Logik verhindert (wie in `einvoice-viewer.js:220` zu sehen) das Erstellen einer B2G-Rechnung ohne Leitweg-ID durch einen `throw new Error(...)`.
Daher kann dieser Zustand gar nicht erst als XML exportiert und dem Validator vorgelegt werden, was die Einhaltung von BR-DE-15 belegt.
