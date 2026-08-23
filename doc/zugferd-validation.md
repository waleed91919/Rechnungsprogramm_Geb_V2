# ZUGFeRD 2.x / PDF/A-3 – Validierungsverfahren

Feature F5 (Plan 13), Stand: 23.08.2026

## 1. Automatisierte Strukturprüfungen (`npm test`)

`tests/zugferd.test.js` prüft am echten Binär-PDF (electron-frei, erzeugt via
`ZugferdBuilder.build()` aus `main/zugferd-builder.js`, `@cantoo/pdf-lib`):

| Check | Gegenstand | Ergebnis 23.08.2026 |
|-------|------------|---------------------|
| Z1 | `%PDF-`-Header, Katalog-`/AF` (Associated Files, Regex ohne `/AFRelationship`-False-Positive), `/EmbeddedFiles`, `/AFRelationship /Alternative`, `factur-x.xml` >= 2 Treffer (FileSpec + Names-Baum), `%%EOF` am Ende | GRÜN |
| Z2 | XMP (latin1-Suche mit zlib-Inflate-Fallback über Stream-Segmente): `pdfaid:part=3`, `pdfaid:conformance=B`, `fx:DocumentType=INVOICE`, `fx:DocumentFileName=factur-x.xml`, `fx:Version=1.0`, `fx:ConformanceLevel=EN 16931`, `pdfaExtension:schemas`, fx-Namespace `urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#` | GRÜN |
| Z3 | OutputIntent: `/OutputIntents`, `/GTS_PDFA1`, `/DestOutputProfile` (eingebettetes sRGB-ICC-Profil) | GRÜN |
| Z4 | Roundtrip: `PDFDocument.load(buf).getAttachments()` -> Attachment `factur-x.xml`, mimeType `text/xml`, afRelationship `Alternative`, Bytes byte-identisch zur generierten CII-XML | GRÜN |
| Z5 | Profile: XRECHNUNG -> URN `urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.3` in XML + `fx:DocumentFileName>xrechnung.xml<` im XMP; EN16931 -> URN `#conformant#urn:factur-x.eu:1p0:en16931` + `factur-x.xml` | GRÜN |

Beispiel-PDFs der Pipeline (`node scripts/generate_and_test.js`):
`output/invoices/b2b_zugferd/RE-2026-B2B-AB1.pdf` und `RE-2026-B2B-AB2.pdf`
(EN16931-Profil). Dieselben Kern-Checks (Z1/Z2) laufen zusätzlich in
`tests/end_to_end_generate.test.js` gegen beide Dateien.

**Bewusste Grenze** (Plan 13, Kap. 7.3): Diese Checks beweisen Container-
Korrektheit (Attachment-, XMP-, OutputIntent-Struktur), keine garantierte
ISO-19005-3-Konformität. Deshalb Abschnitt 2.

## 2. Manueller VeraPDF-Lauf (PDF/A-3b) – verpflichtender Freigabeschritt

1. veraPDF herunterladen (Open Source, GPL – **nur Entwicklungswerkzeug**, wird
   NICHT mit dem Produkt ausgeliefert): https://verapdf.org
   (Windows-Installer oder portable CLI).
2. CLI-Aufruf je Beispiel-PDF:

   ```
   verapdf --flavour 3b --format text output\invoices\b2b_zugferd\RE-2026-B2B-AB1.pdf
   verapdf --flavour 3b --format text output\invoices\b2b_zugferd\RE-2026-B2B-AB2.pdf
   ```

   Ziel: `PASS` bzw. `0 FAILURES`.
3. XRECHNUNG-Profilvariante einmalig erzeugen und ebenfalls prüfen (der
   Pipeline-Skript baut aktuell nur EN16931):

   ```
   node -e "const E=require('./js/einvoice');const {ZugferdBuilder}=require('./main/zugferd-builder');const fs=require('fs');const inv={nr:'RE-XRECHNUNG-PROBE',datum:'2026-08-23',netto:1000,steuer:190,brutto:1190,positionen:[{name:'Pos',menge:1,preis:1000,mwst:19}]};const k={name:'Kunde AG',customer_type:'B2B'};const s={firmenname:'Muster Bau GmbH',iban:'DE89370400440532013000',ustId:'DE999999999'};const i=E.getZUGFeRDProfileInfo('XRECHNUNG');ZugferdBuilder.build({xmlString:E.generateZUGFeRDXML(inv,k,s,{profile:'XRECHNUNG'}),meta:{nr:inv.nr,conformanceLevel:i.conformanceLevel,fileName:i.fileName}}).then(b=>fs.writeFileSync('output/invoices/b2b_zugferd/RE-XRECHNUNG-PROBE.pdf',b))"
   verapdf --flavour 3b --format text output\invoices\b2b_zugferd\RE-XRECHNUNG-PROBE.pdf
   ```
4. Mehrseitige Rechnung als drittes Beispiel: über den Rechnungs-Editor
   (Format "ZUGFERD") eine mehrseitige Rechnung exportieren und gleich prüfen.
5. **Reports ablegen unter `tests/test_results/verapdf/`**
   (Konvention: `<Dateiname>.verapdf.txt`; alternativ `--format xml` als
   `<Dateiname>.verapdf.xml`). Der Ordner ist bereits angelegt.
6. Abweichungen bewerten nach Plan 13, Kap. 8 (R1-Fallbacks:
   convertToPDFA-Normalisierung, Sichtseite vollständig via @cantoo/pdf-lib
   zeichnen, printToPDF-Optionen einschränken).

## 3. Mustang-Validator / KoSIT (ZUGFeRD-"Above"-Schicht)

- Mustangproject-Validator (Java, OSS, https://mustangproject.org) gegen die
  Hybrid-PDFs: prüft die Konsistenz fx:XMP <-> Embedded File sowie Schematron
  der eingebetteten XML.
- Für die XRECHNUNG-Variante zusätzlich den KoSIT-/XRechnung-Schematron-Tester
  gegen die extrahierte `xrechnung.xml` fahren.
- Semantische Grenze (Plan 13, R5): F5 liefert den konformen Container; die
  Feldtiefe der CII (Adressen, Kontakte, Steueraufschlüsselung je Satz) sind
  Teil von F6/Validierung.

## 4. Status

- Automatisierte Strukturprüfungen (Abschnitt 1): **vollständig grün**
  (96/96 Tests, 23.08.2026).
- VeraPDF-Lauf (Abschnitt 2): **OFFEN** – manuell durchzuführen; dokumentiertes
  Restrisiko bis dahin (siehe Features/7_w-link-erp_ist-stand.txt).
