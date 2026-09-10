# Implementierungsplan: Bauprofessor & VOB Kernbausteine für W-Link ERP

**Projekt:** W-Link ERP (`Rechnungsprogramm_Geb_V2`)  
**Datum:** 09.09.2026  
**Status:** In Umsetzung (Phase 1)  
**Referenzen:** `doc/bauprofessor_deep_research_report.md`, VOB/A (2019/2023), VOB/B (2016/2023), VOB/C DIN 18299 ff., VHB-Bund (2024/2026), BGB §§ 631–650v, KLR Bau.

---

## 1. Übersicht & Zielsetzung

Ziel ist die Integration der zentralen baubetrieblichen und baurechtlichen Kernbausteine aus **bauprofessor.de** in das Produktivsystem W-Link ERP:
1. **EFB 222 (Endsummenkalkulation nach VHB-Bund):** Vollständige auftragsbezogene Gliederung der Baustellengemeinkosten (BGK 3.1.1 bis 3.1.5), Sachkostenumlagen und Restgemeinkostenumlage auf den Lohn zur Bildung des Verrechnungslohns (VL), Wagnisdifferenzierung und HTML/Druck-Renderer.
2. **Differenzierte Sicherheitseinbehalte & Deckelung nach VOB/B § 17 & VOB/A § 9c:** Strikte Trennung von Erfüllungssicherheit (lfd. max. 10% mit Obergrenze max. 5% Netto-Auftragssumme) und Gewährleistungssicherheit (5% Schlussrechnung), 18-Werktage-Sperrkonto-Fristenradar und Schwellenwert-Prüfung (< 250.000 €).
3. **VOB/C Übermessungs- und Abzugsregeln (ATV DIN 18299 ff.):** Automatische Bewertung von Öffnungen und Aussparungen (Grenzwerte 2,50 m² bei Mauerwerk/Putz/Trockenbau/WDVS/Maler, 0,10 m² bei Fliesen/Estrich/Böden, 1,00 m bei Längenmaßen).
4. **B2B-Verzugszinsen & 40-€-Verzugspauschale (§ 288 BGB & § 16 VOB/B):** Kaufmännische Verzugszinsberechnung (Basiszinssatz + 9 Prozentpunkte B2B) und 40-€-Verzugspauschale je überfälliger Rechnung im Mahnwesen.
5. **VOB-Schriftverkehr-Generator (`VobCorrespondenceController.js`):** Rechtssichere Anschreiben für Behinderungsanzeige (§ 6 VOB/B), Bedenkenanmeldung (§ 4 Abs. 3 VOB/B), Bauhandwerkersicherung (§ 650f BGB) mit Bürgschaftsrechner und förmliche Abnahmeaufforderung (§ 12 VOB/B).

---

## 2. Modul-Architektur & Dateipfade

```
Rechnungsprogramm_Geb_V2/
├── controllers/
│   ├── EFBController.js                 [Erweitern: calculateEFB222, generateEFB222Html, Rest-Gemeinkostenumlage]
│   ├── CumulativeBillingController.js  [Erweitern: retentionMode, Cap 5% Auftragssumme, Sperrkonto-Frist, VOB/A 9c]
│   ├── InvoiceController.js            [Erweitern: retentionMode, Deckelungslogik, VOB/A 9c Hinweis]
│   ├── AufmassController.js            [Erweitern: applyUebermessungRule, calculateNettoAufmass nach ATV DIN 18299]
│   ├── BankingController.js            [Erweitern: calculateDefaultInterest, calculateLatePaymentFee, Mahnwesen]
│   └── VobCorrespondenceController.js  [NEU: Behinderungsanzeige, Bedenken, Bauhandwerkersicherung, Abnahme]
├── views/
│   └── EFBView.js                      [Erweitern: Sub-Tab EFB 222, PDF-Export EFB 222, BGK-Erfassungsmaske]
├── tests/
│   ├── efb222_calculation.test.js      [NEU: Unittests für EFB 222 und Endsummenumlage]
│   ├── retention_vob_rules.test.js     [NEU: Unittests für Erfüllungssicherheit, Cap, Sperrkonto, VOB/A 9c]
│   ├── uebermessung_vob_c.test.js      [NEU: Unittests für VOB/C Grenzwerte]
│   ├── b2b_default_interest.test.js    [NEU: Unittests für Verzugszinsen und 40-€-Pauschale]
│   └── vob_correspondence.test.js      [NEU: Unittests für VOB-Schriftverkehr und Bürgschaftsrechner]
└── plans/
    └── bauprofessor_vob_implementation_plan.md [Dieser Plan]
```

---

## 3. Detaillierte Spezifikation der Module & Formeln

### 3.1 EFB 222 (Endsummenkalkulation) in `EFBController.js` & `views/EFBView.js`

#### A. Struktur der Baustellengemeinkosten (Abschnitt 3):
- **3.1.1 Lohnkosten der Baustelleneinrichtung:** Hilfslöhne für Auf-, Um- und Abbau, Bewachung, Winterbau.
- **3.1.2 Gehaltskosten der Baustelle:** Bauleitung, Oberbauleiter, Vermessung, Poliere, Abrechnungstechniker.
- **3.1.3 Geräte und Ausrüstungen der Baustelleneinrichtung:** Krane, Container, Bauzäune, Hebezeuge, Energie-/Wasseranschlüsse.
- **3.1.4 Transport- und Anfahrtskosten:** An-/Abtransport von Geräten, Sondernutzung, Pachten.
- **3.1.5 Sonderkosten der Baustelle:** Bauwesen-/Haftpflichtversicherung, behördliche Gebühren, statische Prüfungen.
- $\text{BGK}_{gesamt} = 3.1.1 + 3.1.2 + 3.1.3 + 3.1.4 + 3.1.5$

#### B. Umlagerechnung nach bauprofessor.de:
1. Ermittlung der Einzelkosten (EKT) aus den LV-Positionen:
   - $\text{EKT}_{Lohn} = \text{Gesamtstunden} \times \text{Kalkulationslohn}$
   - $\text{EKT}_{Stoffe}, \text{EKT}_{Geraete}, \text{EKT}_{Sonstige}, \text{EKT}_{NU}$
2. Feste Umlagen auf Sachkosten (Orientierungswerte aus bauprofessor.de):
   - Stoffe: $u_{stoff} \approx 20\,\%$ (Bereich 15–30 %)
   - Geräte: $u_{geraet} \approx 10\,\%$ (Bereich 7–15 %)
   - Sonstige: $u_{sonst} \approx 5\,\%$ (Bereich 3–8 %)
   - Nachunternehmer: $u_{nu} \approx 10\,\%$ (Bereich 8–13 %)
   - Gedeckte Gemeinkosten durch Sachkostenumlagen:
     $$G_{sach} = \sum (\text{EKT}_k \times u_k)$$
3. Gesamtbedarf an Gemeinkosten & W&G:
   - Allgemeine Geschäftskosten (AGK): $AGK = (\text{EKT}_{gesamt} + \text{BGK}_{gesamt}) \times \frac{AGK\%}{100}$ (oder auf Herstellkosten)
   - Wagnis & Gewinn: Aufteilung in:
     - Betriebsbezogenes Wagnis (fix)
     - Leistungsbezogenes Wagnis (bei Nachträgen anpassbar)
     - Kalkulatorischer Gewinn
     $$WuG = (\text{EKT}_{gesamt} + \text{BGK}_{gesamt} + AGK) \times \frac{WuG\%}{100}$$
   - Gesamt-Gemeinkostenbedarf $G_{bedarf} = \text{BGK}_{gesamt} + AGK + WuG$
4. Rest-Gemeinkostenumlage auf den Lohn:
   $$G_{rest} = G_{bedarf} - G_{sach}$$
   $$Zuschlag_{Lohn}\% = \frac{G_{rest}}{\text{EKT}_{Lohn}} \times 100$$
   $$\text{Verrechnungslohn (VL)} = \text{Kalkulationslohn (KL)} \times \left(1 + \frac{Zuschlag_{Lohn}\%}{100}\right)$$
5. Netto-Angebotssumme:
   $$\text{Angebotssumme} = (\text{Gesamtstunden} \times VL) + \sum (\text{EKT}_k \times (1 + u_k))$$

---

### 3.2 Differenzierte Sicherheitseinbehalte & Deckelung nach VOB/B § 17

#### A. Erfüllungssicherheit (`retentionMode: 'EXECUTION'`):
- Laufender Abschlagsabzug: z.B. 10 % von der Abschlagsforderung ($F_t$).
- Obergrenze (Cap): Maximal 5 % der ursprünglichen Netto-Auftragssumme ($A_0$).
  $$S_{max} = A_0 \times 0{,}05$$
  $$S_{soll, t} = \min(S_{max}, L_t \times \text{Laufend}\%)$$
  $$S_t = \max(0, S_{soll, t} - \sum_{i=1}^{t-1} S_i)$$
- Fälligkeit der Rückgabe: Unverzüglich mit der Abnahme der Leistung.

#### B. Mängelansprüchesicherheit (`retentionMode: 'WARRANTY'`):
- Typisch 5 % von der Schlussrechnungssumme.
- Fälligkeit der Rückgabe: Nach Ablauf der 4-jährigen Verjährungsfrist (§ 13 Abs. 4 VOB/B).

#### C. Sperrkontopflicht (VOB/B § 17 Abs. 5):
- Frist: 18 Werktage ab Einbehalt durch den AG.
- Methode `getEscrowDeadline(invoiceDate, workingDays = 18)`: Werktage ohne Sonn- und gesetzliche Feiertage (Samstag gilt als Werktag).

#### D. VOB/A § 9c Schwellenwert-Check:
- Bei öffentlichen Aufträgen mit $A_0 < 250.000\,\text{€}$ netto: Hinweismeldung, dass auf Vertragserfüllungssicherheit verzichtet werden soll.

---

### 3.3 VOB/C Übermessungs- & Abzugsregeln (ATV DIN 18299 ff.)

In `AufmassController.js`:
- Methode `applyUebermessungRule(einzelmass, gewerkNorm, massType)`:
  - Wandflächen, Mauerwerk, Beton, Putz, Trockenbau, WDVS, Maler (DIN 18330, 18331, 18340, 18345, 18350, 18363):
    - Einzelgröße $\le 2{,}50\,\text{m}^2 \implies$ Übermessen (kein Abzug).
    - Einzelgröße $> 2{,}50\,\text{m}^2 \implies$ Voller Abzug.
  - Fliesen, Estrich, Bodenbeläge (DIN 18352, 18353, 18356):
    - Einzelgröße $\le 0{,}10\,\text{m}^2 \implies$ Übermessen.
    - Einzelgröße $> 0{,}10\,\text{m}^2 \implies$ Voller Abzug.
  - Bodenflächen Rohbau/Trockenbau:
    - Einzelgröße $\le 0{,}50\,\text{m}^2 \implies$ Übermessen.
    - Einzelgröße $> 0{,}50\,\text{m}^2 \implies$ Voller Abzug.
  - Längenmaße (DIN 18299):
    - Unterbrechungen $\le 1{,}00\,\text{m} \implies$ Übermessen.
    - Unterbrechungen $> 1{,}00\,\text{m} \implies$ Abzug.
- Methode `calculateNettoAufmass(bruttoFlaeche, aussparungen, gewerkNorm)`:
  - Automatische Saldierung mit Nachweis aller übermessenen und abgezogenen Öffnungen.

---

### 3.4 B2B-Verzugszinsen & 40-€-Verzugspauschale (§ 288 BGB & § 16 VOB/B)

In `BankingController.js`:
- Verzugszinsformel (kaufmännische 360-Tage-Methode):
  $$Z = \text{Forderungsbetrag} \times \frac{\text{Basiszinssatz} + 9{,}00}{100} \times \frac{\text{Verzugstage}}{360}$$
  (B2C: Basiszinssatz + 5,00 Prozentpunkte).
- Gesetzliche 40-€-Verzugsschadenspauschale (§ 288 Abs. 5 BGB):
  - Fällt kraft Gesetzes bei Verzug gegenüber Geschäftskunden / öffentlichen Auftraggebern (B2B) ohne Mahnung an.
  - Fällt je überfälliger Rechnung an.
- Mahnungsberechnungs-Engine:
  - Generierung von Mahnstufen (Mahnung 1, 2, letzte Mahnung vor Baustopp/Klage) mit Zinsen und Pauschale.

---

### 3.5 VOB-Schriftverkehr-Generator `controllers/VobCorrespondenceController.js`

1. **Behinderungsanzeige (§ 6 Abs. 1 VOB/B):**
   - Unverzügliche schriftliche Anzeige mit Behinderungsgrund (Vorleistung, Wetter, Baufreiheit).
   - Ausweisung von Ausfalltagen und Baubereichen.
   - Vorbehalt von Mehrkosten (§ 6 Abs. 6 VOB/B) und Entschädigung (§ 642 BGB).
2. **Bedenkenanmeldung (§ 4 Abs. 3 VOB/B):**
   - Enthaftungsanzeige vor Ausführung.
   - Risikobeschreibung, DIN-Normenverweis, Frist zur Entscheidung.
3. **Bauhandwerkersicherung (§ 650f BGB):**
   - Bürgschaftsrechner: $(\text{Vertragssumme} + \text{beauftragte Nachträge} - \text{bereits geleistete Zahlungen}) \times 1{,}10$.
   - 7-Werktage- bzw. 10-Kalendertage-Frist.
   - Androhung von Leistungsverweigerung (Baustopp) und Kündigung nach § 648 BGB.
4. **Förmliche Abnahmeaufforderung (§ 12 VOB/B):**
   - Fertigstellungsmeldung mit Frist von 12 Werktagen (§ 12 Abs. 1 VOB/B).
   - Hinweis auf Abnahmefiktion bei Inbenutzungnahme (6 Werktage, § 12 Abs. 5 Nr. 1) und BGB § 640 Abs. 2.

---

## 4. Test- & Qualitätssicherungs-Strategie

1. **Unittests in `tests/`:**
   - Jedes Modul erhält eine dedizierte Node.js-Testdatei (`node --test tests/...`).
   - Verifikation aller mathematischen Formeln (Cent-Genauigkeit, Rundung, Übermessungsgrenzen).
2. **Regressionstest:**
   - Vollständiger Lauf aller Tests via `cmd.exe /c npm test`.
   - Das bestehende Testpaket von 233 Tests muss weiterhin zu 100% grün bleiben.
3. **Isomorphie-Garantie:**
   - Alle Module prüfen auf `typeof module !== 'undefined' && module.exports` sowie `typeof window !== 'undefined'`.
