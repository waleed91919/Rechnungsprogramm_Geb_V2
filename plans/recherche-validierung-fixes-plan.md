# RECHERCHE-VALIDIERUNGS-FIXES: UMSETZUNGSPLAN [F1] BIS [F5]

**Version:** 1.0 (Stand: 26.08.2026)  
**Status:** Genehmigungsreif / Umsetzungsbereit  
**Basis:** Analysebericht `Features/9_recherche_validierung_2026-08-25.txt`, bestehende Implementierungen in `js/einvoice.js`, `main/zugferd-builder.js`, `controllers/ReinigungController.js`, `js/putzplan.js`, `code.html` sowie Web-Recherche (Stand August 2026).  
**Projektkonvention:** Produktionscode OHNE Kommentare. UI-Texte und Hinweismeldungen durchgängig deutsch.

---

## 0. Ziel & Scope

Dieser Plan definiert die exakten, minimalinvasiven und rechtssicheren Code-Änderungen zur Behebung aller fünf in der Recherche vom 25.08.2026 aufgedeckten Fachfehler und Optimierungspotenziale:

1. **[F1] P0 § 13b UStG (E-Rechnung):**
   - Normierung von **BT-120** (ExemptionReason) auf den gesetzlich zwingenden Wortlaut *„Steuerschuldnerschaft des Leistungsempfängers“* (§ 14a Abs. 5 Satz 1 UStG).
   - Korrektur von **BT-121** (ExemptionReasonCode) von Falschwert `VTEX` auf den offiziellen Peppol/EN 16931-Standardcode **`VATEX-EU-AE`** (Reverse Charge).
2. **[F2] P0 Factur-X / ZUGFeRD XMP & Conformance:**
   - Sicherstellung der exakten XMP-Metadaten-Namespace-Deklaration `urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#` mit Präfix `fx`, `DocumentFileName=factur-x.xml` (bzw. `xrechnung.xml`), `DocumentType=INVOICE`, `Version=1.0` und konsistenter Conformance-Level-Zuweisung (`EN 16931` bzw. `XRECHNUNG`).
   - Bereitstellung und Dokumentation der automatisierten PDF/A-3- und Schematron-Validierung (VeraPDF / KoSIT).
3. **[F3] P1 RTV-Tarifprofil & Zuschläge (Gebäudereinigung):**
   - Ersetzung des veralteten Begriffs „Mehrarbeit +25 %“ durch den tariflich korrekten **Belastungszuschlag 25 %** (§ 10 Ziff. 3 RTV für Arbeitszeit > 8 h/Tag bzw. > 40 h/Woche).
   - Korrektur der **Hohen Feiertage (+200 %)** im Default-Profil und UI-Hilfetext: Gilt seit RTV 31.10.2019 ausschließlich für **Neujahr, 1. Mai, 1. und 2. Weihnachtsfeiertag** (Ostersonntag/Pfingstsonntag fallen unter Sonn-/Feiertag +80 %).
   - Neutralisierung von Profil-Bezeichnungen („Eigenes Zuschlagsprofil / RTV-Preset“ statt suggestivem „BTV-Satzwerk“).
4. **[F4] P1 Lohngruppen LG 1 bis LG 9 & Branchenmindestlohn 2026:**
   - Integration des vollständigen 9-stufigen Lohngruppenkatalogs (LG 1 bis LG 9) gemäß Tarifvertrag vom 15.11.2024 / 10. GebäudeArbbV (LG 1 = 15,00 €/h, LG 6 = 18,40 €/h ab 01.01.2026 als allgemeinverbindliche Mindestlöhne; LG 5 historisch entfallen).
   - Validierungs- und Warnlogik bei Unterschreitung der Branchenmindestlöhne in der Kalkulation.
5. **[F5] P1 Sicherheitseinbehalt (VOB/B § 17) in E-Rechnungen:**
   - Saubere Trennung zwischen **BT-113** (TotalPrepaidAmount) und strukturierter Erläuterung.
   - Ergänzung der maschinenlesbaren Notizkonvention in **BT-20** (Payment Terms: `#EINBEHALT#PROZENT=...#GRUND=VOB/B§17#`) und nachrichtlicher **BT-22** Invoice-Note (SubjectCode `PMT`), damit Einbehalte nicht fälschlich als bereits erfolgte Barzahlung verbucht werden.

**Nicht im Scope:**
- Umbau der Datenbank-Tabellen für Putzplan/LV (das bestehende Schema aus F3 bleibt 100 % intakt).
- Umbau des PDF/A-Rendering-Kerns `@cantoo/pdf-lib` (nur Konfigurationsparameter & XMP-Prüfungen).
- Zeiterfassung / Mobile App (gehört in Roadmap-Schritt N2).

---

## 1. Rechtlicher & fachlicher Hintergrund

### 1.1 [F1] § 13b UStG, § 14a Abs. 5 Satz 1 UStG & Peppol/CII Codeliste
- **Gesetzliche Pflicht:** Gemäß **§ 14a Abs. 5 Satz 1 UStG** ist der leistende Unternehmer bei Steuerschuldnerschaft des Leistungsempfängers nach § 13b UStG zwingend verpflichtet, in der Rechnung die Angabe **„Steuerschuldnerschaft des Leistungsempfängers“** aufzunehmen. Fehlt dieser exakte Wortlaut oder wird nur eine Paragraphenkette genannt, ist die Rechnung formell mangelhaft; beim Empfänger droht die Versagung des Vorsteuerabzugs.
- **EN 16931 / CII Mapping:**
  - **BT-120 (VAT exemption reason text):** Enthält den Pflichttext *„Steuerschuldnerschaft des Leistungsempfängers“* (bzw. ergänzt um *„gemäß § 13b UStG“*).
  - **BT-121 (VAT exemption reason code):** Muss der Peppol / CEF VATEX-Codeliste entsprechen. Für Kategorie `AE` (Reverse Charge) ist der international genormte Code **`VATEX-EU-AE`** vorgeschrieben. Der bisher im Code genutzte String `"VTEX"` ist ungültig und führt in strikten Schematron-Prüfern (KoSIT / Kaltblut / Mustang) zum Validierungsfehler `BR-AE-10`.
  - **BG-23 Vollständigkeit:** Kategorie `AE` verlangt `RateApplicablePercent = 0.00` (BT-119) und `CalculatedAmount = 0.00` (BT-117) auf Basis des ungeminderten Nettobetrags (BT-116).

*Quellen:*
- § 14a Abs. 5 UStG (gesetze-im-internet.de/ustg_1980/__14a.html)
- Peppol BIS Billing 3.0 VATEX Codeliste (docs.peppol.eu/poacc/billing/3.0/codelist/vatex/)
- KoSIT XRechnung Spezifikation 2.3 / 3.0 (xeinkauf.de/xrechnung/)

### 1.2 [F2] Factur-X / ZUGFeRD 2.x PDF/A-3 Metadaten & Conformance
- **XMP-Namespace:** Seit Factur-X 1.0 / ZUGFeRD 2.1 ist der standardisierte XMP-Namespace verbindlich:
  `urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#` mit Präfix `fx`.
- **Eigenschaften im XMP-Paket:**
  - `fx:DocumentType`: Muss `"INVOICE"` lauten.
  - `fx:DocumentFileName`: Standard `"factur-x.xml"` (beim XRechnung-Hybridprofil alternativ `"xrechnung.xml"`).
  - `fx:Version`: `"1.0"`.
  - `fx:ConformanceLevel`: Entspricht dem Profil im XML (`"EN 16931"`, `"XRECHNUNG"`, `"BASIC"`, `"EXTENDED"` etc.).
- **PDF/A-Extension-Schema:** Deklaration unter `pdfaExtension:schemas` nach ISO 19005-3 ist zwingend erforderlich (VeraPDF Rule 6.6.2.3.1).

*Quellen:*
- FNFE-MPE Factur-X Spezifikation 1.0.07 / FeRD ZUGFeRD 2.2 / 2.3 (fnfe-mpe.org, ferd-net.de)
- Mustangproject ZUGFeRD/Factur-X Validator (gpdf.com/blog/validating-zugferd-with-mustang)

### 1.3 [F3] RTV Gebäudereinigung – Zuschläge & Belastungszuschlag
- **Rechtsstand:** Rahmentarifvertrag für die gewerblichen Beschäftigten in der Gebäudereinigung vom 31.10.2019 (allgemeinverbindlich ab 01.01.2020, BMAS-Bekanntmachung vom 05.04.2020).
- **Zuschlagssätze (§ 3 Ziff. 4.7 & § 10 Ziff. 3 RTV):**
  1. **Nachtarbeit (22:00 – 05:00 Uhr):** **+30 %** (§ 3 Ziff. 4.7 lit. a).
  2. **Sonn- und Feiertagsarbeit (00:00 – 24:00 Uhr):** **+80 %** (§ 3 Ziff. 4.7 lit. b) – gilt für alle Sonntage sowie gesetzlichen Feiertage inklusive Ostersonntag und Pfingstsonntag!
  3. **Hohe Feiertage (00:00 – 24:00 Uhr):** **+200 %** (§ 3 Ziff. 4.7 lit. c) – gilt **ausschließlich** für Neujahr (01.01.), 1. Mai, 1. und 2. Weihnachtsfeiertag (25. und 26.12.), auch wenn diese auf einen Sonntag fallen.
  4. **Belastungszuschlag:** **+25 %** (§ 10 Ziff. 3 RTV) für Arbeitszeiten über **8 Stunden an einem Arbeitstag** ODER über **40 Stunden in einer Kalenderwoche**. Der veraltete Pauschalbegriff „Mehrarbeit +25 %“ existiert im RTV 2019 nicht mehr.
- **Begriff „BTV“:** Es existiert kein öffentlich-rechtliches „BTV-Satzwerk“. Die Software verwendet neutral den Begriff „Zuschlagsprofil (RTV / Eigenkonditionen)“.

*Quellen:*
- Offizieller AVE-Tarifvertragstext RTV Gebäudereinigung (zoll.de / die-gebaeudedienstleister.de)
- BIV Vergabe-Empfehlungen 2026 (die-gebaeudedienstleister.de)

### 1.4 [F4] Branchenmindestlöhne & Lohngruppen LG 1–LG 9 (Gebäudereinigung 2026)
- **Rechtsstand:** Zehnte Verordnung über zwingende Arbeitsbedingungen in der Gebäudereinigung (10. GebäudeArbbV vom 28.01.2025, in Kraft bis 31.12.2026) & Lohntarifvertrag vom 15.11.2024.
- **Branchenmindestlöhne ab 01.01.2026 (allgemeinverbindlich nach AEntG):**
  - **Lohngruppe 1 (Innen- und Unterhaltsreinigung):** **15,00 €/h** (Mindestlohn 1).
  - **Lohngruppe 6 (Glas- und Fassadenreinigung):** **18,40 €/h** (Mindestlohn 2).
- **Tarifliche Lohngruppen (LTV 2025/2026):**
  - **LG 1:** Innen- und Unterhaltsreinigung (15,00 € – Mindestlohn 1)
  - **LG 2:** Qualifizierte Innenreinigung (15,46 €)
  - **LG 3:** Innenreinigung mit anerkannter Zusatzqualifizierung (15,95 €)
  - **LG 4:** Bauschlussreinigung / Vorarbeitende Innenreinigung (16,66 €)
  - **LG 5:** *entfallen* (seit 2011 nicht mehr besetzt)
  - **LG 6:** Glas- und Fassadenreinigung (18,40 € – Mindestlohn 2)
  - **LG 7:** Gesellentätigkeit mit mindestens 3-jähriger Ausbildung (19,39 €)
  - **LG 8:** Gesellen mit Ausbildereignung (20,42 €)
  - **LG 9:** Fachvorarbeitende Außen / Bereichsleitung (21,64 €)
- **Kalkulationsschutz:** Bei Stundensätzen unter 15,00 € (LG 1) bzw. 18,40 € (LG 6) warnt das System vor Unterschreitung der allgemeinverbindlichen Mindestlöhne.

*Quellen:*
- 10. GebäudeArbbV (Bundesgesetzblatt 2025 I Nr. 20)
- BIV Tarifübersicht 2025/2026 (die-gebaeudedienstleister.de)

### 1.5 [F5] Sicherheitseinbehalt (VOB/B § 17) in E-Rechnungen
- **Steuerrechtliche Natur:** Ein Sicherheitseinbehalt nach VOB/B § 17 (z. B. 5 % Gewährleistungseinbehalt auf Sperrkonto oder durch Bürgschaft ablösbar) ist **kein Rabatt und kein Skonto**. Er mindert **nicht** die umsatzsteuerliche Bemessungsgrundlage (Entgelt) und darf **keinesfalls** als Positions-Allowance (BG-20) modelliert werden.
- **Abbildung in EN 16931:**
  - Der fällige Zahlbetrag **BT-115 (DuePayableAmount)** wird gemindert.
  - Die Gesamtsumme der Abzüge wird in **BT-113 (TotalPrepaidAmount)** geführt.
  - **Kritischer Punkt:** Damit der Rechnungsempfänger den Betrag in BT-113 nicht fälschlich als „bereits gezahlte Abschlagszahlung/Barzahlung“ bucht, muss die E-Rechnung strukturierte Angaben enthalten:
    1. **BT-20 (Payment Terms Description):** Strukturierte Notiz im KoSIT/FeRD-Format:
       `#EINBEHALT#PROZENT=5.00#BETRAG=...#GRUND=VOB/B § 17#ABLOESBAR=Buergschaft#`
    2. **BT-22 (Invoice Note):** Freitext-Notiz mit Betreffcode `PMT`:
       `5,00 % Sicherheitseinbehalt für Gewährleistung gemäß § 17 VOB/B (Betrag: ... EUR). Ablösbar durch Sicherheitsleistung/Bürgschaft.`

*Quellen:*
- BMF-Schreiben zur E-Rechnung (bundesfinanzministerium.de)
- KoSIT Leitfaden E-Rechnung im Bauwesen / FeRD Praxisempfehlungen (xeinkauf.de)
- Haufe Fachbeitrag „Sicherheiten am Bau nach VOB/B“ (haufe.de)

---

## 2. Betroffene Dateien & Komponenten

| Datei | Art der Änderung | Zweck |
|---|---|---|
| [`js/einvoice.js`](file:///F:/server/Rechnungsprogramm_Geb_V2/js/einvoice.js) | Code-Anpassung | [F1] BT-120 Pflichttext & BT-121 `VATEX-EU-AE`; [F5] BT-20 / BT-22 strukturierte Einbehalts-Notizen |
| [`main/zugferd-builder.js`](file:///F:/server/Rechnungsprogramm_Geb_V2/main/zugferd-builder.js) | Review & Code-Check | [F2] XMP-Metadaten Namespace & Conformance-Parameter verifizieren |
| [`doc/zugferd-validation.md`](file:///F:/server/Rechnungsprogramm_Geb_V2/doc/zugferd-validation.md) | Doku / Script | [F2] Validierungsanleitung für VeraPDF & KoSIT-Prüfung ergänzen |
| [`controllers/ReinigungController.js`](file:///F:/server/Rechnungsprogramm_Geb_V2/controllers/ReinigungController.js) | Code-Anpassung | [F3] Belastungszuschlag 25 %, Hohe Feiertage; [F4] LG 1–LG 9 Katalog & Mindestlohn-Warnlogik |
| [`js/putzplan.js`](file:///F:/server/Rechnungsprogramm_Geb_V2/js/putzplan.js) | Code-Anpassung | [F3] UI-Sync für Belastungszuschlag; [F4] Stundensatz-Mindestlohn-Warnanzeige im Modal |
| [`code.html`](file:///F:/server/Rechnungsprogramm_Geb_V2/code.html) | HTML/Form-Anpassung | [F3] Input-Feld `zp-zs-belastung`, korrigierte Labels; [F4] Lohngruppen-Referenz in der UI |
| [`tests/zugferd.test.js`](file:///F:/server/Rechnungsprogramm_Geb_V2/tests/zugferd.test.js) | Test-Anpassung & Neu | [F1] Test Z8 auf `VATEX-EU-AE` umstellen; [F5] Test Z13 für Sicherheitseinbehalt BT-20/BT-22 |
| [`tests/reinigungslv_kalkulation.test.js`](file:///F:/server/Rechnungsprogramm_Geb_V2/tests/reinigungslv_kalkulation.test.js) | Test-Anpassung & Neu | [F3] Belastungszuschlag Tests; [F4] Lohngruppen- & Mindestlohn-Tests |

---

## 3. Schritt-für-Schritt Umsetzungsanleitung für den Code-Agenten

### Schritt 1: [F1] § 13b UStG Normierung & Code-Korrektur in `js/einvoice.js`

#### 1.1 Konstante und XML-Generierung anpassen

In [`js/einvoice.js`](file:///F:/server/Rechnungsprogramm_Geb_V2/js/einvoice.js):
1. Zeile 8: `EXEMPTION_REASON_13B` von `'Steuer nicht erhoben gemäß § 13b UStG'` ändern auf:
   ```javascript
   static EXEMPTION_REASON_13B = 'Steuerschuldnerschaft des Leistungsempfängers';
   ```
2. Zeile 398: `VTEX` ändern auf `VATEX-EU-AE`:
   ```javascript
   (g.category === 'AE' ? `
           <ram:ExemptionReason>${this.EXEMPTION_REASON_13B}</ram:ExemptionReason>
           <ram:ExemptionReasonCode>VATEX-EU-AE</ram:ExemptionReasonCode>` : '') + `
   ```

#### 1.2 Exaktes Diff für `js/einvoice.js` (Sektion F1):

```diff
--- a/js/einvoice.js
+++ b/js/einvoice.js
@@ -5,3 +5,3 @@
     static GUIDELINE_XRECHNUNG_23 = 'urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.3';
     static GUIDELINE_FACTURX_EN16931 = 'urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:en16931';
 
-    static EXEMPTION_REASON_13B = 'Steuer nicht erhoben gemäß § 13b UStG';
+    static EXEMPTION_REASON_13B = 'Steuerschuldnerschaft des Leistungsempfängers';
 
@@ -395,4 +395,4 @@
         <ram:TypeCode>VAT</ram:TypeCode>` +
             (g.category === 'AE' ? `
         <ram:ExemptionReason>${this.EXEMPTION_REASON_13B}</ram:ExemptionReason>
-        <ram:ExemptionReasonCode>VTEX</ram:ExemptionReasonCode>` : '') + `
+        <ram:ExemptionReasonCode>VATEX-EU-AE</ram:ExemptionReasonCode>` : '') + `
```

---

### Schritt 2: [F5] Sicherheitseinbehalt (VOB/B § 17) in BT-20 / BT-22 in `js/einvoice.js`

#### 2.1 Notizen- und Zahlungsbedingungen-Erweiterung

In [`js/einvoice.js`](file:///F:/server/Rechnungsprogramm_Geb_V2/js/einvoice.js) wird die Methode `buildCII` um strukturierte Notizen erweitert:

1. **BT-22 (ram:IncludedNote unter ram:ExchangedDocument):**
   Wenn `invoice.sicherheitseinbehalt > 0` oder `invoice.sicherheitseinbehalt_prozent > 0`, wird ein `ram:IncludedNote` mit `ram:SubjectCode>PMT</ram:SubjectCode>` eingefügt:
   ```javascript
   let notesXML = '';
   if (t.einbehalt > 0) {
       const prozentStr = invoice.sicherheitseinbehalt_prozent ? Number(invoice.sicherheitseinbehalt_prozent).toFixed(2) : ((t.einbehalt / (t.grandTotal || 1)) * 100).toFixed(2);
       notesXML += `
       <ram:IncludedNote>
         <ram:Content>Sicherheitseinbehalt ${prozentStr} % (${t.einbehalt.toFixed(2)} EUR) gemäß § 17 VOB/B für Gewährleistung. Ablösbar durch Bankbürgschaft.</ram:Content>
         <ram:SubjectCode>PMT</ram:SubjectCode>
       </ram:IncludedNote>`;
   }
   ```
2. **BT-20 (ram:SpecifiedTradePaymentTerms):**
   Die Zahlungsbedingungsbeschreibung wird bei vorhandenem Einbehalt um die maschinenlesbare `#EINBEHALT#`-Konvention ergänzt:
   ```javascript
   let paymentTermsDescription = `Zahlbar ohne Abzug bis zum ${faelligTeile[2]}.${faelligTeile[1]}.${faelligTeile[0]}.`;
   if (t.einbehalt > 0) {
       const prozentVal = invoice.sicherheitseinbehalt_prozent ? parseFloat(invoice.sicherheitseinbehalt_prozent).toFixed(2) : ((t.einbehalt / (t.grandTotal || 1)) * 100).toFixed(2);
       paymentTermsDescription += ` #EINBEHALT#PROZENT=${prozentVal}#BETRAG=${t.einbehalt.toFixed(2)}#GRUND=VOB/B § 17#ABLOESBAR=Buergschaft#`;
   }
   ```

#### 2.2 Exaktes Diff für `js/einvoice.js` (Sektion F5):

```diff
--- a/js/einvoice.js
+++ b/js/einvoice.js
@@ -426,5 +426,10 @@
         const faelligTeile = dueDateIso.split('-');
+        let paymentTermsDescription = `Zahlbar ohne Abzug bis zum ${faelligTeile[2]}.${faelligTeile[1]}.${faelligTeile[0]}.`;
+        if (t.einbehalt > 0) {
+            const prozentVal = invoice.sicherheitseinbehalt_prozent ? parseFloat(invoice.sicherheitseinbehalt_prozent).toFixed(2) : ((t.einbehalt / (t.grandTotal || 1)) * 100).toFixed(2);
+            paymentTermsDescription += ` #EINBEHALT#PROZENT=${prozentVal}#BETRAG=${t.einbehalt.toFixed(2)}#GRUND=VOB/B § 17#ABLOESBAR=Buergschaft#`;
+        }
         const paymentTermsXML = `
       <ram:SpecifiedTradePaymentTerms>
-        <ram:Description>Zahlbar ohne Abzug bis zum ${faelligTeile[2]}.${faelligTeile[1]}.${faelligTeile[0]}.</ram:Description>
+        <ram:Description>${this.escapeXML(paymentTermsDescription)}</ram:Description>
         <ram:DueDateDateTime>
@@ -456,4 +461,12 @@
   <rsm:ExchangedDocument>
     <ram:ID>${this.escapeXML(invoice.nr)}</ram:ID>
     <ram:TypeCode>380</ram:TypeCode>
     <ram:IssueDateTime>
       <udt:DateTimeString format="102">${issueDate}</udt:DateTimeString>
-    </ram:IssueDateTime>
+    </ram:IssueDateTime>${t.einbehalt > 0 ? `
+    <ram:IncludedNote>
+      <ram:Content>Sicherheitseinbehalt ${invoice.sicherheitseinbehalt_prozent ? Number(invoice.sicherheitseinbehalt_prozent).toFixed(2) : ((t.einbehalt / (t.grandTotal || 1)) * 100).toFixed(2)} % (${t.einbehalt.toFixed(2)} EUR) gemäß § 17 VOB/B für Gewährleistung. Ablösbar durch Bankbürgschaft.</ram:Content>
+      <ram:SubjectCode>PMT</ram:SubjectCode>
+    </ram:IncludedNote>` : ''}
   </rsm:ExchangedDocument>
```

---

### Schritt 3: [F3] RTV-Zuschläge & Belastungszuschlag in `controllers/ReinigungController.js`

#### 3.1 Anpassungen der Konstanten und Rechenlogik

In [`controllers/ReinigungController.js`](file:///F:/server/Rechnungsprogramm_Geb_V2/controllers/ReinigungController.js):

1. **`ZUSCHLAG_LABELS` erweitern:**
   ```javascript
   const ZUSCHLAG_LABELS = {
       nacht: 'Nacht (22–05 Uhr)',
       sonntag_feiertag: 'Sonn-/Feiertag',
       hoher_feiertag: 'Hoher Feiertag (Neujahr, 1. Mai, 25./26. Dez)',
       belastung: 'Belastungszuschlag (>8h/Tag bzw. >40h/Woche)'
   };
   ```
2. **`DEFAULT_ZUSCHLAGSPROFIL` anpassen:**
   ```javascript
   const DEFAULT_ZUSCHLAGSPROFIL = {
       profil_name: 'RTV Gebäudereinigung (gewerblich)',
       gueltig_ab: '2026-01-01',
       standard_stundensatz: 15.0,
       standard_stundensatz_glas: 18.4,
       zuschlaege: {
           nacht: { prozent: 30 },
           sonntag_feiertag: { prozent: 80 },
           hoher_feiertag: { prozent: 200 },
           belastung: { prozent: 25 }
       },
       kalender: { wochen_pro_jahr: 52, tage_pro_jahr: 365 },
       quellen: ['RTV Gebäudereinigung v. 31.10.2019 (§ 3 Ziff. 4.7, § 10 Ziff. 3)', 'BIV Vergabe-Empfehlungen 01/2026', '10. GebäudeArbbV']
   };
   ```

---

### Schritt 4: [F4] Lohngruppen LG 1–LG 9 & Mindestlohn-Validierungslogik in `controllers/ReinigungController.js`

#### 4.1 Lohngruppen-Katalog und Prüffunktionen hinzufügen

In [`controllers/ReinigungController.js`](file:///F:/server/Rechnungsprogramm_Geb_V2/controllers/ReinigungController.js):

1. **Konstante `LOHNGRUPPEN_GEBAEUDEREINIGUNG_2026`:**
   ```javascript
   const LOHNGRUPPEN_GEBAEUDEREINIGUNG_2026 = [
       { id: 'LG1', bezeichnung: 'LG 1: Innen- und Unterhaltsreinigung', lohn: 15.00, mindestlohn: true },
       { id: 'LG2', bezeichnung: 'LG 2: Qualifizierte Innenreinigung', lohn: 15.46, mindestlohn: false },
       { id: 'LG3', bezeichnung: 'LG 3: Innenreinigung mit Zusatzqualifikation', lohn: 15.95, mindestlohn: false },
       { id: 'LG4', bezeichnung: 'LG 4: Bauschluss- / Vorarbeitende Innenreinigung', lohn: 16.66, mindestlohn: false },
       { id: 'LG5', bezeichnung: 'LG 5: (entfallen seit 2011)', lohn: null, mindestlohn: false, entfallen: true },
       { id: 'LG6', bezeichnung: 'LG 6: Glas- und Fassadenreinigung', lohn: 18.40, mindestlohn: true },
       { id: 'LG7', bezeichnung: 'LG 7: Gesellen (mind. 3-jährige Ausbildung)', lohn: 19.39, mindestlohn: false },
       { id: 'LG8', bezeichnung: 'LG 8: Gesellen mit Ausbildereignung', lohn: 20.42, mindestlohn: false },
       { id: 'LG9', bezeichnung: 'LG 9: Fachvorarbeitende Außen / Bereichsleitung', lohn: 21.64, mindestlohn: false }
   ];
   ```
2. **Funktion `pruefeMindestlohn(stundensatz, lohngruppeId)`:**
   ```javascript
   function pruefeMindestlohn(stundensatz, lohngruppeId = 'LG1') {
       const satz = zahl(stundensatz, 0);
       const lg = LOHNGRUPPEN_GEBAEUDEREINIGUNG_2026.find(g => g.id === lohngruppeId) || LOHNGRUPPEN_GEBAEUDEREINIGUNG_2026[0];
       const minSatz = lg.lohn || 15.00;
       if (satz < minSatz) {
           return {
               warnung: true,
               meldung: `Der Stundensatz von ${satz.toFixed(2)} €/h unterschreitet den tariflichen Satz für ${lg.bezeichnung} (${minSatz.toFixed(2)} €/h ab 01.01.2026).`
           };
       }
       return { warnung: false, meldung: '' };
   }
   ```
3. Controller-Export um `LOHNGRUPPEN_GEBAEUDEREINIGUNG_2026` und `pruefeMindestlohn` erweitern.

#### 4.2 Exaktes Diff für `controllers/ReinigungController.js`:

```diff
--- a/controllers/ReinigungController.js
+++ b/controllers/ReinigungController.js
@@ -7,5 +7,6 @@
 const ZUSCHLAG_LABELS = {
-    nacht: 'Nacht',
+    nacht: 'Nacht (22–05 Uhr)',
     sonntag_feiertag: 'Sonn-/Feiertag',
-    hoher_feiertag: 'Hoher Feiertag'
+    hoher_feiertag: 'Hoher Feiertag (Neujahr, 1. Mai, 25./26. Dez)',
+    belastung: 'Belastungszuschlag (>8h/Tag bzw. >40h/Woche)'
 };
@@ -17,7 +18,20 @@
     zuschlaege: {
         nacht: { prozent: 30 },
         sonntag_feiertag: { prozent: 80 },
-        hoher_feiertag: { prozent: 200 }
+        hoher_feiertag: { prozent: 200 },
+        belastung: { prozent: 25 }
     },
     kalender: { wochen_pro_jahr: 52, tage_pro_jahr: 365 },
-    quellen: ['BIV Vergabe-Empfehlungen 01/2026', 'Tarifbroschüre Berlin 01/2025']
+    quellen: ['RTV Gebäudereinigung v. 31.10.2019 (§ 3 Ziff. 4.7, § 10 Ziff. 3)', 'BIV Vergabe-Empfehlungen 01/2026', '10. GebäudeArbbV']
 };
+
+const LOHNGRUPPEN_GEBAEUDEREINIGUNG_2026 = [
+    { id: 'LG1', bezeichnung: 'LG 1: Innen- und Unterhaltsreinigung', lohn: 15.00, mindestlohn: true },
+    { id: 'LG2', bezeichnung: 'LG 2: Qualifizierte Innenreinigung', lohn: 15.46, mindestlohn: false },
+    { id: 'LG3', bezeichnung: 'LG 3: Innenreinigung mit Zusatzqualifikation', lohn: 15.95, mindestlohn: false },
+    { id: 'LG4', bezeichnung: 'LG 4: Bauschluss- / Vorarbeitende Innenreinigung', lohn: 16.66, mindestlohn: false },
+    { id: 'LG5', bezeichnung: 'LG 5: (entfallen seit 2011)', lohn: null, mindestlohn: false, entfallen: true },
+    { id: 'LG6', bezeichnung: 'LG 6: Glas- und Fassadenreinigung', lohn: 18.40, mindestlohn: true },
+    { id: 'LG7', bezeichnung: 'LG 7: Gesellen (mind. 3-jährige Ausbildung)', lohn: 19.39, mindestlohn: false },
+    { id: 'LG8', bezeichnung: 'LG 8: Gesellen mit Ausbildereignung', lohn: 20.42, mindestlohn: false },
+    { id: 'LG9', bezeichnung: 'LG 9: Fachvorarbeitende Außen / Bereichsleitung', lohn: 21.64, mindestlohn: false }
+];
+
+function pruefeMindestlohn(stundensatz, lohngruppeId = 'LG1') {
+    const satz = zahl(stundensatz, 0);
+    const lg = LOHNGRUPPEN_GEBAEUDEREINIGUNG_2026.find(g => g.id === lohngruppeId) || LOHNGRUPPEN_GEBAEUDEREINIGUNG_2026[0];
+    const minSatz = lg.lohn || 15.00;
+    if (satz < minSatz) {
+        return {
+            warnung: true,
+            meldung: `Der Stundensatz von ${satz.toFixed(2)} €/h unterschreitet den tariflichen Satz für ${lg.bezeichnung} (${minSatz.toFixed(2)} €/h ab 01.01.2026).`
+        };
+    }
+    return { warnung: false, meldung: '' };
+}
@@ -274,3 +288,5 @@
     TURNUS_TYPEN,
     ZUSCHLAG_LABELS,
     DEFAULT_ZUSCHLAGSPROFIL,
+    LOHNGRUPPEN_GEBAEUDEREINIGUNG_2026,
+    pruefeMindestlohn,
```

---

### Schritt 5: [F3 & F4] UI-Anpassungen in `code.html` und `js/putzplan.js`

#### 5.1 Modal in `code.html` anpassen

In [`code.html`](file:///F:/server/Rechnungsprogramm_Geb_V2/code.html) um Zeile 3768:
1. `legend` anpassen auf: `Zuschlagssätze (RTV Gebäudereinigung / Eigenprofil)`
2. Grid auf 4 Spalten erweitern (oder 2x2):
   - Nacht 22–5 Uhr (%) (`zp-zs-nacht`)
   - Sonn-/Feiertag (%) (`zp-zs-sofei`)
   - Hoher Feiertag (Neujahr, 1.5., 25./26.12.) (%) (`zp-zs-hoher`)
   - Belastungszuschlag (>8h/Tag bzw. >40h/Woche) (%) (`zp-zs-belastung`, Default 25)
3. Hinweisfeld mit Lohngruppen-Referenz (LG 1 = 15,00 €, LG 6 = 18,40 €).

#### 5.2 `js/putzplan.js` erweitern

In [`js/putzplan.js`](file:///F:/server/Rechnungsprogramm_Geb_V2/js/putzplan.js):
1. In `openZuschlagsprofilModal()`:
   ```javascript
   document.getElementById('zp-zs-belastung').value = (p.zuschlaege && p.zuschlaege.belastung && p.zuschlaege.belastung.prozent) || 25;
   ```
2. In `saveZuschlagsprofilFromModal()`:
   ```javascript
   zuschlaege: {
       nacht: { prozent: parseFloat(document.getElementById('zp-zs-nacht').value) || 0 },
       sonntag_feiertag: { prozent: parseFloat(document.getElementById('zp-zs-sofei').value) || 0 },
       hoher_feiertag: { prozent: parseFloat(document.getElementById('zp-zs-hoher').value) || 0 },
       belastung: { prozent: parseFloat(document.getElementById('zp-zs-belastung').value) || 0 }
   },
   ```

---

## 4. Test- und Validierungsstrategie

### 4.1 Anpassung bestehender Tests

1. **`tests/zugferd.test.js`:**
   - **Test Z8:** Anpassen auf `VATEX-EU-AE` und den neuen Pflichttext:
     ```javascript
     assert.ok(xml13b.includes('<ram:ExemptionReasonCode>VATEX-EU-AE</ram:ExemptionReasonCode>'));
     assert.ok(xml13b.includes('<ram:ExemptionReason>Steuerschuldnerschaft des Leistungsempfängers</ram:ExemptionReason>'));
     ```
2. **`tests/reinigungslv_kalkulation.test.js`:**
   - Update des Referenzfalls und Tests auf die 4 Zuschlagstypen (`nacht`, `sonntag_feiertag`, `hoher_feiertag`, `belastung`).

### 4.2 Neue automatisierte Testfälle

Folgende neue Testfälle werden in die jeweiligen Test-Suiten aufgenommen:

#### In `tests/zugferd.test.js`:
- **Test Z13 (Sicherheitseinbehalt mit BT-20 und BT-22):**
  - Erzeuge Rechnung mit `sicherheitseinbehalt: 500.00` und `sicherheitseinbehalt_prozent: 5.0`.
  - Prüfe, dass `xml` das Element `<ram:IncludedNote>` mit `<ram:SubjectCode>PMT</ram:SubjectCode>` enthält.
  - Prüfe, dass `<ram:SpecifiedTradePaymentTerms>` den Präfix `#EINBEHALT#PROZENT=5.00#BETRAG=500.00#GRUND=VOB/B § 17#` enthält.
  - Prüfe, dass `TotalPrepaidAmount` = 500.00 und `DuePayableAmount` = `GrandTotalAmount - 500.00` ist.

#### In `tests/reinigungslv_kalkulation.test.js`:
- **Test R10 (Belastungszuschlag 25 % Kalkulation):**
  - Berechne Zuschlag für 100 Jahresstunden mit 20 % Belastungsanteil und 25 % Satz bei 15,00 €/h => 100 * 0.20 * 0.25 * 15.00 = 75,00 €.
- **Test R11 (Lohngruppenkatalog LG 1–LG 9 & Mindestlohnprüfung):**
  - Prüfe, dass `LOHNGRUPPEN_GEBAEUDEREINIGUNG_2026` genau 9 Einträge hat und LG 1 = 15.00 €, LG 6 = 18.40 € aufweist.
  - Prüfe `pruefeMindestlohn(14.50, 'LG1')` => `warnung === true`.
  - Prüfe `pruefeMindestlohn(15.00, 'LG1')` => `warnung === false`.
  - Prüfe `pruefeMindestlohn(17.50, 'LG6')` => `warnung === true`.
  - Prüfe `pruefeMindestlohn(18.40, 'LG6')` => `warnung === false`.

---

## 5. Risiken, Seiteneffekte & Rollback

| Risiko | Wahrscheinlichkeit | Auswirkung | Gegenmaßnahme |
|---|---|---|---|
| Bestehende Rechnungen ohne BT-20/BT-22 Notiz brechen beim Validieren | Sehr gering | Keine | Notizen werden nur eingefügt, wenn tatsächlich ein Einbehalt > 0 vorliegt. |
| Alt-Profile ohne `belastung`-Key in der DB | Gering | Keine | Controller liest lazy mit Default-Fallback `25 %`, kein harter DB-Fehler. |
| Testsuite-Bruch durch String-Änderung von `VTEX` | Sicher (geplant) | Test-Fix | Test Z8 wird in derselben Transaktion auf `VATEX-EU-AE` synchronisiert. |

---

## 6. Abnahmekriterien

- [ ] `node --test tests/zugferd.test.js` läuft mit 0 Fehlern durch.
- [ ] `node --test tests/reinigungslv_kalkulation.test.js` läuft mit 0 Fehlern durch.
- [ ] `node --test tests/*.test.js` (alle 146+ Tests) ist vollständig grün.
- [ ] In generierten E-Rechnungen mit § 13b erscheint zwingend `VATEX-EU-AE` und `Steuerschuldnerschaft des Leistungsempfängers`.
- [ ] In Rechnungen mit Sicherheitseinbehalt erscheinen BT-20 `#EINBEHALT#` und BT-22 `PMT`.
- [ ] Im Putzplan-Zuschlagsprofil sind Belastungszuschlag 25 % und die 9 Lohngruppen abrufbar.
- [ ] Alle Quellcode-Dateien entsprechen der Projektkonvention (KEINE Kommentare im Produktionscode).
