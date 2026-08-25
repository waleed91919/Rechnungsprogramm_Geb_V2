# PLAN F11 – BANKIMPORT (CAMT.053 / CSV), INTELLIGENTER OPOS-ZAHLUNGSABGLEICH & SEPA-LASTSCHRIFTEN (PAIN.008)

**Version:** 1.0 (Freigegebener Master-Implementierungsplan, 26.08.2026)  
**Autor:** Architektur- und Planungs-Agent (W-Link ERP / Rechnungsprogramm_Geb_V2)  
**Ziel-Datei:** `F:\server\Rechnungsprogramm_Geb_V2\plans\bankimport-opos-sepa-plan.md`  
**Ziel-Zielgruppe:** Code-Subagent & Entwickler  
**Projektkonventionen:** 
- Produktionscode OHNE ausufernde unnötige Kommentare, dafür mit präziser Typprüfung und robuster Fehlerbehandlung.
- Isomorpher Modulaufbau für alle Rechenkerne (`controllers/BankingController.js`, `controllers/SepaController.js`) -> `module.exports` UND `window.*`.
- Vollständige Offline-Fähigkeit ohne native Binärabhängigkeiten (reines JavaScript auf Node.js 20+ / Electron 32+, `better-sqlite3`, `crypto`).
- 100% GoBD-Konformität (Transaktionshashes, lückenloses Audit-Logging aller Zuordnungen und Statuswechsel).
- Sämtliche Tests laufen über die native Node Test-Runner Engine (`node --test tests/*.test.js`).

---

## 0. Ziel & Scope

### 0.1 Ziele der Erweiterung
1. **Bankimport (CAMT.053, CAMT.052 & CSV-Kontoauszüge):**
   - Nahtloser Import von elektronischen Kontoauszügen im ISO 20022 XML-Format (`camt.053.001.02` bis `camt.053.001.08`) sowie untertägigen Umsatzberichten (`camt.052.001.02` bis `camt.052.001.08`).
   - Universeller CSV-Parser mit Auto-Erkennung und vorkonfigurierten Presets für die wichtigsten deutschen Bankinstitute (Sparkasse, Volksbanken/Raiffeisenbanken FIDUCIA, Deutsche Bank, Commerzbank, Postbank, Standard-MT940/CSV).
   - Deterministische Deduplizierung über einen SHA-256-Fingerprint der Buchungszeilen – verhindert zuverlässig Doppelimporte bei sich überlappenden Auszugszeiträumen.

2. **Intelligenter OPOS-Zahlungsabgleich (Auto-Matching Engine):**
   - Automatisierter 4-Stufen-Matching-Algorithmus mit Scoring-System (0–100%).
   - **Pass 1:** Exakter Belegnummern-Treffer im Verwendungszweck (`RE-\d+`, `\d{4}-\d+`, Nummernsuche) + Betragsprüfung (100% Match).
   - **Pass 2:** Skonto-Erkennung gem. § 14 Abs. 4 UStG: Rechnerischer Abgleich (z. B. 2% oder 3% Skonto) mit Prüfung der Skontofrist ab Belegdatum. Automatische Buchung von Zahlbetrag + Skontoerlös und Schließen der Rechnung.
   - **Pass 3:** Partner-IBAN / Debitoren-Name + Betragsübereinstimmung (ohne Belegnummer).
   - **Pass 4:** Teilzahlungs- und Sammelzahlungs-Erkennung (Split-Zuordnung auf mehrere Rechnungen).
   - **Ausgabenseite:** Zuordnung von Lieferantenzahlungen zu `eingangsrechnungen`.
   - **Mahnwesen-Entlastung:** Bei Vollzahlung automatische Entlastung offener Mahnungen (Mahnstopp / Statusbereinigung) und GoBD-konforme Belegsperre (`isLocked = 1`).
   - Reversible Zuordnung: Manuelles Entkoppeln mit GoBD-Audit-Protokollierung.

3. **SEPA-Lastschriften (pain.008 XML nach ISO 20022 / EPC Standard):**
   - Vollständige SEPA-Mandatsverwaltung je Kunde (CORE-Basislastschrift & B2B-Firmenlastschrift, Sequenztypen `FRST`, `RCUR`, `FNAL`, `OOFF`, IBAN-Prüfziffer-Validierung nach ISO 7064 Modulo 97).
   - Gesetzeskonforme Pre-Notification (Vorabinformation gem. Art. 5.6 SEPA Direct Debit Rulebook) mit Berechnung des Einzugstermins (unter Berücksichtigung von TARGET2-Bankarbeitstagen).
   - Generierung von EPC- und ISO 20022-konformen Lastschrift-Sammeldateien (`pain.008.001.08` als moderner Standard mit konfigurierbarem Fallback auf `pain.008.001.02`).
   - Direkte Übernahme fälliger Einzelrechnungen und Dauerrechnungs-Läufe in SEPA-Lastschriftläufe.

### 0.2 Was bleibt unberührt (Scope-Abgrenzung)
- **Keine FinTS/HBCI-Direktschnittstelle** mit PIN/TAN/PSD2-Server-Anbindung (Vermeidung von Drittanbieter-Cloud-Diensten, BaFin-Lizenzanforderungen und nativem C-Overhead). Der Import erfolgt wie in Desktop-ERP üblich per Datei-Upload (CAMT/CSV) und SEPA-Export (pain.008 XML zur Einreichung im Online-Banking).
- Bestehende ZUGFeRD-/XRechnung-Engines (`js/einvoice.js`, `main/zugferd-builder.js`) bleiben vollständig kompatibel; Zahlungsbedingungen und Skonto-Metadaten werden synchronisiert.
- Die GoBD-Audit-Hashkette (`audit_logs`) wird niemals gebrochen; alle neuen Banking- und SEPA-Aktionen werden als Entitäten `BANK_TRANSACTION`, `PAYMENT_MATCH` und `SEPA_RUN` protokolliert.

---

## 1. Fachlicher & rechtlicher Hintergrund

### 1.1 ISO 20022 Spezifikation für Lastschriften (`pain.008`)
- **Versionen:**
  - `pain.008.001.08`: Aktueller EPC SEPA Direct Debit Rulebook Standard (Version 2023/2025/2026). Verwendet strukturierte Adressen und modernisierte XML-Schemadefinitionen (`urn:iso:std:iso:20022:tech:xsd:pain.008.001.08`).
  - `pain.008.001.02`: Älterer, aber bei einigen deutschen Banken noch als Kompatibilitätsformat akzeptierter Standard (`urn:iso:std:iso:20022:tech:xsd:pain.008.001.02`).
- **Verfahren:**
  - **CORE (SEPA-Basislastschrift):** Für Verbraucher (B2C) und Geschäftskunden (B2B). 8 Wochen bedingungsloses Erstattungsrecht für den Zahler.
  - **B2B (SEPA-Firmenlastschrift):** Ausschliesslich für Nicht-Verbraucher. Kein Erstattungsrecht nach Belastung. Vorab-Bestätigung des Mandats bei der Zahlerbank zwingend erforderlich.
- **Sequenztypen (`SeqTp`):**
  - `FRST` (Erstlastschrift) / `RCUR` (Folgelastschrift) / `OOFF` (Einmallastschrift) / `FNAL` (Letztlastschrift).
  - Hinweis nach EPC Rulebook: Seit November 2016 gilt für CORE und B2B eine einheitliche Mindestvorlauffrist von **1 Bankarbeitstag (D-1)** für `FRST` und `RCUR`.
- **Pflichtangaben nach EPC Rulebook:**
  - Gläubiger-Identifikationsnummer (Creditor Identifier, CI): Format Deutschland `DE[Prüfziffer 2-stellig][ZZZ][Geschäftsbereichszähler 3-stellig][Nationale ID 10-stellig]`, z. B. `DE98ZZZ09999999999`.
  - Eindeutige Mandatsreferenz (`MndtId`): max. 35 alphanumerische Zeichen.
  - Datum der Mandatsunterschrift (`DtOfSgntr`): Format `YYYY-MM-DD`.
  - Fälligkeitsdatum (`ReqdColltnDt`): Muss ein gültiger Bankarbeitstag (TARGET2) sein.

### 1.2 CAMT.053 & CAMT.052 XML-Spezifikation (Bank-to-Customer Statement)
- **CAMT.053 (Kontoauszug):** Gesetzlicher/offizieller elektronischer Kontoauszug (`BankToCustomerStatement`).
- **CAMT.052 (Umsatzbericht):** Untertägiger oder vorläufiger Kontobericht (`BankToCustomerAccountReport`).
- **Wesentliche XML-Elemente:**
  - `<Stmt>` / `<Rpt>`: Enthält Kontoidentifikation `<Acct><Id><IBAN>` und Salden `<Bal>` (OPBD = Opening Balance, CLBD = Closing Balance).
  - `<Ntry>`: Einzelne Buchung.
    - `<Amt Ccy="EUR">`: Betrag.
    - `<CdtDbtInd>`: `CRDT` (Credit / Haben / Geldeingang -> Betrag positiv), `DBIT` (Debit / Soll / Geldausgang -> Betrag negativ).
    - `<BookgDt><Dt>` & `<ValDt><Dt>`: Buchungstag und Valuta.
    - `<NtryDtls><TxDtls>`: Details zur Transaktion.
    - `<RltdPties>`: `<Dbtr>` (Zahler) und `<Cdtr>` (Empfänger) mit Namen und IBAN.
    - `<RmtInf><Ustrd>`: Unstrukturierter Verwendungszweck (Zahlungsreferenzen, Rechnungsnummern, Skontovermerke).

### 1.3 Deutsche CSV-Kontoauszugsformate & Besonderheiten
- Es existiert kein einheitlicher CSV-Standard; deutsche Banken nutzen unterschiedliche Spalten und Konventionen:
  - **Sparkasse:** Semikolon-getrennt, `Buchungstag`, `Valutadatum`, `Buchungstext`, `Verwendungszweck`, `Beguenstigter/Zahlungspflichtiger`, `Kontonummer/IBAN`, `BIC`, `Betrag` (deutsches Komma), `Waehrung`.
  - **Volksbanken (FIDUCIA):** Semikolon-getrennt, `Buchungstag`, `Valutadatum`, `Name Zahlungsbeteiligter`, `IBAN Zahlungsbeteiligter`, `Buchungstext`, `Verwendungszweck`, `Betrag`, `Waehrung`, `Saldo nach Buchung`.
  - **Deutsche Bank:** Oft getrennte Spalten `Betrag Soll` und `Betrag Haben` oder Spalte `Umsatz` mit Vorzeichen.
  - **Commerzbank:** `Buchungstag`, `Wertstellung`, `Umsatzart`, `Buchungstext`, `Betrag`, `Auftraggeber / Begünstigter`, `IBAN`.
- Die Import-Engine muss sowohl Auto-Erkennung (Header-Analyse) als auch manuelle Profilwahl beherrschen.

### 1.4 Rechtliche Anforderungen an SEPA-Mandate & Pre-Notification
- **Art. 5.6 SEPA Rulebook / BGB § 675d:** Vorabinformation (Pre-Notification) muss dem Zahler rechtzeitig vor der Belastung zugehen.
- **Reguläre Frist:** Mindestens 14 Kalendertage vor Fälligkeit, es sei denn, in den AGB oder im Vertrag wurde eine verkürzte Frist (z. B. 2 bis 5 Tage) wirksam vereinbart.
- **Pflichtinhalte der Pre-Notification:**
  - Gläubiger-ID des Lastschrifteinreichers
  - Eindeutige Mandatsreferenz
  - Fälligkeitsdatum / Einzugsdatum (`ReqdColltnDt`)
  - Genaue Einzugssumme in EUR
  - IBAN des Zahlers (datenschutzkonform maskiert)

### 1.5 GoBD-Konformität bei Zahlungsabgleich & Skonto
- **Unveränderbarkeit & Nachvollziehbarkeit:** Jede Zuordnung einer Banktransaktion zu einem Beleg speichert Zeitstempel, Betrag, Skontoabzug und Differenzgrund.
- **Skonto-Berechnung:** Rechnungen weisen Skontofristen aus (z. B. „2 % Skonto bei Zahlung bis 10 Tage“). Bei fristgerechtem Eingang des reduzierten Betrags wird die Differenz als Skontoabzug verbucht.
- **GoBD-Sperre:** Nach vollständigem Zahlungsausgleich wird `dokumente.isLocked = 1` gesetzt.

---

## 2. DB-Schema & Datenmodell

### 2.1 Neue Tabellen in `schema.js`

```sql
-- 1. Eigene Bankkonten des Unternehmens
CREATE TABLE IF NOT EXISTS bank_konten (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kontoname TEXT NOT NULL,
    bankname TEXT NOT NULL,
    iban TEXT NOT NULL UNIQUE,
    bic TEXT NOT NULL,
    kontoinhaber TEXT NOT NULL,
    glaeubiger_id TEXT,
    waehrung TEXT DEFAULT 'EUR',
    aktueller_saldo REAL DEFAULT 0.0,
    saldo_datum DATE,
    ist_standard INTEGER DEFAULT 0 CHECK(ist_standard IN (0,1)),
    aktiv INTEGER DEFAULT 1 CHECK(aktiv IN (0,1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bank_konten_iban ON bank_konten(iban);
CREATE INDEX IF NOT EXISTS idx_bank_konten_aktiv ON bank_konten(aktiv);

-- 2. Banktransaktionen (Kontoauszugspositionen)
CREATE TABLE IF NOT EXISTS bank_transaktionen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_konto_id INTEGER NOT NULL,
    buchungstag DATE NOT NULL,
    valuta DATE,
    betrag REAL NOT NULL,
    waehrung TEXT DEFAULT 'EUR',
    partner_name TEXT,
    partner_iban TEXT,
    partner_bic TEXT,
    buchungstext TEXT,
    verwendungszweck TEXT,
    transaktions_code TEXT,
    gv_code TEXT,
    primanota TEXT,
    dedup_hash TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'OFFEN' CHECK(status IN ('OFFEN', 'ZUGEORDNET', 'TEILWEISE_ZUGEORDNET', 'IGNORIERT', 'MANUELL_GEBUCHT')),
    zugeordneter_betrag REAL DEFAULT 0.0,
    import_datei TEXT,
    import_format TEXT CHECK(import_format IN ('CAMT053', 'CAMT052', 'CSV_SPARKASSE', 'CSV_VOLKSBANK', 'CSV_DEUTSCHE_BANK', 'CSV_COMMERZBANK', 'CSV_GENERIC')),
    importiert_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bank_konto_id) REFERENCES bank_konten(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_transaktionen_konto_datum ON bank_transaktionen(bank_konto_id, buchungstag);
CREATE INDEX IF NOT EXISTS idx_transaktionen_status ON bank_transaktionen(status);
CREATE INDEX IF NOT EXISTS idx_transaktionen_hash ON bank_transaktionen(dedup_hash);
CREATE INDEX IF NOT EXISTS idx_transaktionen_partner_iban ON bank_transaktionen(partner_iban);

-- 3. Verknüpfungstabelle Zahlungszuordnungen (OPOS-Matching)
CREATE TABLE IF NOT EXISTS zahlung_zuordnungen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaktion_id INTEGER NOT NULL,
    dokument_id INTEGER,
    eingangsrechnung_id INTEGER,
    betrag REAL NOT NULL CHECK(betrag > 0),
    skonto_abzug REAL DEFAULT 0.0 CHECK(skonto_abzug >= 0),
    differenz_grund TEXT CHECK(differenz_grund IN ('SKONTO', 'TEILZAHLUNG', 'KULANZ', 'GEBUEHR', 'UEBERZAHLUNG', 'SONSTIGES')),
    zugeordnet_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    benutzer_notiz TEXT,
    FOREIGN KEY (transaktion_id) REFERENCES bank_transaktionen(id) ON DELETE CASCADE,
    FOREIGN KEY (dokument_id) REFERENCES dokumente(id) ON DELETE SET NULL,
    FOREIGN KEY (eingangsrechnung_id) REFERENCES eingangsrechnungen(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_zuordnungen_transaktion ON zahlung_zuordnungen(transaktion_id);
CREATE INDEX IF NOT EXISTS idx_zuordnungen_dokument ON zahlung_zuordnungen(dokument_id);
CREATE INDEX IF NOT EXISTS idx_zuordnungen_eingangsrechnung ON zahlung_zuordnungen(eingangsrechnung_id);

-- 4. SEPA-Mandate je Kunde
CREATE TABLE IF NOT EXISTS kunden_sepa_mandate (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kunde_id INTEGER NOT NULL,
    mandatsreferenz TEXT NOT NULL UNIQUE,
    mandats_typ TEXT NOT NULL DEFAULT 'CORE' CHECK(mandats_typ IN ('CORE', 'B2B')),
    sequenz_typ TEXT NOT NULL DEFAULT 'FRST' CHECK(sequenz_typ IN ('FRST', 'RCUR', 'FNAL', 'OOFF')),
    unterschrifts_datum DATE NOT NULL,
    iban TEXT NOT NULL,
    bic TEXT NOT NULL,
    kontoinhaber TEXT NOT NULL,
    bank_name TEXT,
    status TEXT NOT NULL DEFAULT 'AKTIV' CHECK(status IN ('AKTIV', 'WIDERRUFEN', 'ABGELAUFEN', 'PAUSIERT')),
    gueltig_bis DATE,
    pre_notification_tage INTEGER DEFAULT 14 CHECK(pre_notification_tage >= 1),
    letzter_einzug_am DATE,
    letzte_lauf_nr TEXT,
    bemerkung TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (kunde_id) REFERENCES kunden(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mandate_kunde ON kunden_sepa_mandate(kunde_id);
CREATE INDEX IF NOT EXISTS idx_mandate_status ON kunden_sepa_mandate(status);
CREATE INDEX IF NOT EXISTS idx_mandate_referenz ON kunden_sepa_mandate(mandatsreferenz);

-- 5. SEPA-Lastschriftläufe
CREATE TABLE IF NOT EXISTS sepa_lastschrift_laeufe (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lauf_nr TEXT NOT NULL UNIQUE,
    bank_konto_id INTEGER NOT NULL,
    sammel_typ TEXT NOT NULL DEFAULT 'CORE' CHECK(sammel_typ IN ('CORE', 'B2B')),
    sequenz_typ TEXT NOT NULL DEFAULT 'RCUR' CHECK(sequenz_typ IN ('FRST', 'RCUR', 'OOFF', 'FNAL', 'MIXED')),
    ausfuehrungs_datum DATE NOT NULL,
    anzahl_transaktionen INTEGER NOT NULL DEFAULT 0,
    summe_gesamt REAL NOT NULL DEFAULT 0.0,
    xml_format TEXT NOT NULL DEFAULT 'pain.008.001.08' CHECK(xml_format IN ('pain.008.001.08', 'pain.008.001.02')),
    xml_content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ERSTELLT' CHECK(status IN ('ERSTELLT', 'EXPORTIERT', 'EINGEREICHT', 'STORNIERT')),
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    exportiert_am DATETIME,
    FOREIGN KEY (bank_konto_id) REFERENCES bank_konten(id)
);

CREATE INDEX IF NOT EXISTS idx_sepa_laeufe_datum ON sepa_lastschrift_laeufe(ausfuehrungs_datum);
CREATE INDEX IF NOT EXISTS idx_sepa_laeufe_status ON sepa_lastschrift_laeufe(status);

-- 6. Positionen eines SEPA-Lastschriftlaufs
CREATE TABLE IF NOT EXISTS sepa_lastschrift_positionen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lauf_id INTEGER NOT NULL,
    dokument_id INTEGER,
    dauerrechnung_lauf_id INTEGER,
    mandat_id INTEGER NOT NULL,
    betrag REAL NOT NULL CHECK(betrag > 0),
    verwendungszweck TEXT NOT NULL,
    end_to_end_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'EINGEREICHT' CHECK(status IN ('EINGEREICHT', 'EINGELOEST', 'RUECKLASTSCHRIFT', 'STORNIERT')),
    FOREIGN KEY (lauf_id) REFERENCES sepa_lastschrift_laeufe(id) ON DELETE CASCADE,
    FOREIGN KEY (dokument_id) REFERENCES dokumente(id) ON DELETE SET NULL,
    FOREIGN KEY (dauerrechnung_lauf_id) REFERENCES dauerrechnung_laeufe(id) ON DELETE SET NULL,
    FOREIGN KEY (mandat_id) REFERENCES kunden_sepa_mandate(id)
);

CREATE INDEX IF NOT EXISTS idx_sepa_pos_lauf ON sepa_lastschrift_positionen(lauf_id);
CREATE INDEX IF NOT EXISTS idx_sepa_pos_dokument ON sepa_lastschrift_positionen(dokument_id);
```

### 2.2 Tabellenerweiterungen in `runMigrations(db)`
- **`dokumente`:**
  - `skonto_tage INTEGER DEFAULT 0` (Zahlungsziel für Skonto)
  - `skonto_prozent REAL DEFAULT 0.0` (Skontosatz in %, z. B. 2.0 oder 3.0)
  - `bezahlt_betrag REAL DEFAULT 0.0` (Kumulierter eingegangener Zahlbetrag)
  - `offener_betrag REAL` (Berechnete Restforderung)
  - `sepa_mandat_id INTEGER REFERENCES kunden_sepa_mandate(id)`
- **`kunden`:**
  - `iban TEXT`
  - `bic TEXT`
  - `bank_name TEXT`
  - `kontoinhaber TEXT`
  - `sepa_mandat_aktiv INTEGER DEFAULT 0`
- **`einstellungen` Default Seeds:**
  - `glaeubiger_id`: Standard-Gläubiger-ID des Handwerksbetriebs (z. B. aus Firmenstammdaten).
  - `sepa_xml_standard`: `'pain.008.001.08'` (mit Option auf `'pain.008.001.02'`).
  - `sepa_pre_notification_standard_tage`: `'14'`.
  - `matching_auto_skonto_toleranz_tage`: `'2'` (Kulanzüberhang in Tagen für Feiertagsverzögerungen bei Skontoüberweisungen).

---

## 3. Modul-Architektur & Rechenkerne

```
                     ┌────────────────────────────────────────────────────────┐
                     │                 code.html (Renderer UI)                │
                     │  - Tab 1: Kontoauszug & Bankimport                     │
                     │  - Tab 2: Intelligenter OPOS-Abgleich (Auto-Match)     │
                     │  - Tab 3: SEPA-Lastschriftläufe (pain.008 XML)         │
                     │  - Tab 4: Bankkonten & Mandatsverwaltung               │
                     └───────────────────────────┬────────────────────────────┘
                                                 │ IPC Invoke / ContextBridge
                     ┌───────────────────────────▼────────────────────────────┐
                     │                       preload.js                       │
                     └───────────────────────────┬────────────────────────────┘
                                                 │ IPC Main Channels
┌────────────────────────────────────────────────▼─────────────────────────────────────────────────┐
│                                   Electron Main / db.js                                          │
├────────────────────────────────────────────────┬─────────────────────────────────────────────────┤
│           BankingController.js                 │              SepaController.js                  │
│  - CAMT.053 / CAMT.052 Parser (ISO 20022 XML)  │  - IBAN/BIC Validator (Modulo 97 ISO 7064)      │
│  - CSV Parser (Sparkasse, VR, DB, CoBa, Gen)   │  - SEPA-Mandats-Engine (CORE / B2B)             │
│  - Dedup-Fingerprint (SHA-256)                 │  - Pre-Notification Builder (Fristenberechnung) │
│  - 4-Pass Matching Engine (100% / Skonto / TB) │  - XML Generator (pain.008.001.08 & 001.02)     │
│  - GoBD Zahlungsausgleich & Audit-Log          │  - TARGET2-Bankarbeitstage-Kalender             │
└────────────────────────────────────────────────┴─────────────────────────────────────────────────┘
```

### 3.1 `controllers/BankingController.js` (Isomorpher Banking- & Matching-Kern)

```js
/**
 * BankingController.js - CAMT.053/CAMT.052 & CSV-Parser, Deduplizierung,
 * 4-Pass OPOS-Matching mit Skonto-Erkennung gem. § 14 Abs. 4 UStG & GoBD.
 */
class BankingController {
    /**
     * Berechnet den deterministischen SHA-256-Fingerprint einer Buchung für Deduplizierung.
     */
    static calculateTransactionHash({ iban, buchungstag, betrag, verwendungszweck, partnerIban, primanota }) {
        const normIban = String(iban || '').replace(/\s+/g, '').toUpperCase();
        const normTag = String(buchungstag || '').trim();
        const normBetrag = (Math.round((parseFloat(betrag) || 0) * 100) / 100).toFixed(2);
        const normText = String(verwendungszweck || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const normPartner = String(partnerIban || '').replace(/\s+/g, '').toUpperCase();
        const normNota = String(primanota || '').trim();

        const raw = `${normIban}|${normTag}|${normBetrag}|${normText}|${normPartner}|${normNota}`;
        
        return this._sha256(raw);
    }

    /**
     * Parst CAMT.053.001.02 bis CAMT.053.001.08 XML-Strings.
     */
    static parseCamt053(xmlString) {
        if (!xmlString || typeof xmlString !== 'string') {
            throw new Error('Ungültiger CAMT.053-XML-Inhalt.');
        }

        const statements = [];
        const stmtRegex = /<(?:Stmt|Rpt)\b[^>]*>([\s\S]*?)<\/(?:Stmt|Rpt)>/gi;
        let stmtMatch;

        while ((stmtMatch = stmtRegex.exec(xmlString)) !== null) {
            const stmtContent = stmtMatch[1];
            
            // IBAN des Kontos
            const ibanMatch = stmtContent.match(/<Acct>[\s\S]*?<Id>[\s\S]*?<IBAN>([A-Z0-9\s]+)<\/IBAN>/i);
            const accountIban = ibanMatch ? ibanMatch[1].replace(/\s+/g, '').toUpperCase() : '';

            // Salden
            let openingBalance = null;
            let closingBalance = null;
            const balRegex = /<Bal\b[^>]*>([\s\S]*?)<\/Bal>/gi;
            let balMatch;
            while ((balMatch = balRegex.exec(stmtContent)) !== null) {
                const balContent = balMatch[1];
                const isOpening = /<Cd>(?:OPBD|PRCD)<\/Cd>/i.test(balContent);
                const isClosing = /<Cd>(?:CLBD|CLAV)<\/Cd>/i.test(balContent);
                const amtMatch = balContent.match(/<Amt\s+Ccy="([^"]+)">([\d.,]+)<\/Amt>/i);
                const cdtDbt = (balContent.match(/<CdtDbtInd>([A-Z]+)<\/CdtDbtInd>/i) || [])[1];
                
                if (amtMatch) {
                    let val = parseFloat(amtMatch[2].replace(',', '.'));
                    if (cdtDbt === 'DBIT') val = -val;
                    if (isOpening) openingBalance = val;
                    if (isClosing) closingBalance = val;
                }
            }

            // Einzeltransaktionen <Ntry>
            const transactions = [];
            const ntryRegex = /<Ntry\b[^>]*>([\s\S]*?)<\/Ntry>/gi;
            let ntryMatch;

            while ((ntryMatch = ntryRegex.exec(stmtContent)) !== null) {
                const ntry = ntryMatch[1];

                const amtMatch = ntry.match(/<Amt\s+Ccy="([^"]+)">([\d.,]+)<\/Amt>/i);
                const currency = amtMatch ? amtMatch[1] : 'EUR';
                let betrag = amtMatch ? parseFloat(amtMatch[2].replace(',', '.')) : 0.0;

                const cdtDbt = (ntry.match(/<CdtDbtInd>([A-Z]+)<\/CdtDbtInd>/i) || [])[1];
                if (cdtDbt === 'DBIT') {
                    betrag = -Math.abs(betrag);
                } else {
                    betrag = Math.abs(betrag);
                }

                const bookgDt = (ntry.match(/<BookgDt>[\s\S]*?<Dt>([\d-]+)<\/Dt>/i) || [])[1] || '';
                const valDt = (ntry.match(/<ValDt>[\s\S]*?<Dt>([\d-]+)<\/Dt>/i) || [])[1] || bookgDt;

                // Partner Information
                const dbtrName = (ntry.match(/<Dbtr>[\s\S]*?<Nm>([^<]+)<\/Nm>/i) || [])[1] || '';
                const cdtrName = (ntry.match(/<Cdtr>[\s\S]*?<Nm>([^<]+)<\/Nm>/i) || [])[1] || '';
                const partnerName = betrag > 0 ? dbtrName : cdtrName;

                const dbtrIban = (ntry.match(/<DbtrAcct>[\s\S]*?<IBAN>([^<]+)<\/IBAN>/i) || [])[1] || '';
                const cdtrIban = (ntry.match(/<CdtrAcct>[\s\S]*?<IBAN>([^<]+)<\/IBAN>/i) || [])[1] || '';
                const partnerIban = (betrag > 0 ? dbtrIban : cdtrIban).replace(/\s+/g, '').toUpperCase();

                const dbtrBic = (ntry.match(/<DbtrAgt>[\s\S]*?<BIC(?:FI)?>([^<]+)<\/BIC(?:FI)?>/i) || [])[1] || '';
                const cdtrBic = (ntry.match(/<CdtrAgt>[\s\S]*?<BIC(?:FI)?>([^<]+)<\/BIC(?:FI)?>/i) || [])[1] || '';
                const partnerBic = (betrag > 0 ? dbtrBic : cdtrBic).replace(/\s+/g, '').toUpperCase();

                // Verwendungszweck & Buchungstext
                const ustrdMatches = [];
                const ustrdRegex = /<Ustrd>([^<]+)<\/Ustrd>/gi;
                let uMatch;
                while ((uMatch = ustrdRegex.exec(ntry)) !== null) {
                    ustrdMatches.push(uMatch[1].trim());
                }
                const verwendungszweck = ustrdMatches.join(' ');

                const gvCode = (ntry.match(/<BkTxCd>[\s\S]*?<Cd>([^<]+)<\/Cd>/i) || [])[1] || '';
                const primanota = (ntry.match(/<AcctSvcrRef>([^<]+)<\/AcctSvcrRef>/i) || [])[1] || '';

                const dedupHash = this.calculateTransactionHash({
                    iban: accountIban,
                    buchungstag: bookgDt,
                    betrag,
                    verwendungszweck,
                    partnerIban,
                    primanota
                });

                transactions.push({
                    accountIban,
                    buchungstag: bookgDt,
                    valuta: valDt,
                    betrag: Math.round(betrag * 100) / 100,
                    waehrung: currency,
                    partnerName: this._cleanText(partnerName),
                    partnerIban,
                    partnerBic,
                    verwendungszweck: this._cleanText(verwendungszweck),
                    gvCode,
                    primanota,
                    dedupHash,
                    importFormat: 'CAMT053'
                });
            }

            statements.push({
                accountIban,
                openingBalance,
                closingBalance,
                transactions
            });
        }

        return statements;
    }

    /**
     * Parst deutsche Bank-CSV-Dateien (Sparkasse, VR, Deutsche Bank, Commerzbank, Generic).
     */
    static parseCsvStatement(csvString, forcedFormat = 'AUTO') {
        if (!csvString || typeof csvString !== 'string') return [];
        // Automatische Delimiter- & Header-Erkennung
        // Normalisiert alle Spalten auf einheitliche Struktur
    }

    /**
     * 4-Pass Multi-Score Matching Engine für OPOS-Abgleich
     */
    static matchTransactionsAgainstOpos({ transaktionen = [], offeneRechnungen = [], eingangsrechnungen = [], skontoToleranzTage = 2 }) {
        const matches = [];

        for (const tx of transaktionen) {
            if (tx.status === 'ZUGEORDNET' || tx.status === 'IGNORIERT') continue;

            const txBetrag = parseFloat(tx.betrag) || 0;
            const vzText = String(tx.verwendungszweck || '').toUpperCase();
            const partnerIban = String(tx.partnerIban || '').replace(/\s+/g, '').toUpperCase();
            const partnerName = String(tx.partnerName || '').toUpperCase();

            // 1. Ausgangsrechnungen (Geldeingang > 0)
            if (txBetrag > 0) {
                let bestMatch = null;

                // Pass 1: Exakter Belegnummern-Treffer im Verwendungszweck
                for (const doc of offeneRechnungen) {
                    const docNr = String(doc.nr || '').toUpperCase().trim();
                    const docOffen = Math.round(((doc.brutto || 0) - (doc.bezahlt_betrag || 0)) * 100) / 100;
                    
                    if (docNr && (vzText.includes(docNr) || this._matchesNumberVariant(vzText, docNr))) {
                        // 1a. Exakter Betragstreffer
                        if (Math.abs(txBetrag - docOffen) < 0.009) {
                            bestMatch = {
                                score: 100,
                                matchType: 'EXACT_INVOICE_AND_AMOUNT',
                                dokumentId: doc.id,
                                belegNr: doc.nr,
                                betrag: txBetrag,
                                skontoAbzug: 0.0,
                                differenzGrund: null,
                                restOffen: 0.0
                            };
                            break;
                        }

                        // 1b. Skonto-Erkennung gem. Zahlungsbedingungen
                        const skontoPz = parseFloat(doc.skonto_prozent) || 0;
                        const skontoTage = parseInt(doc.skonto_tage, 10) || 0;
                        if (skontoPz > 0 && skontoTage > 0) {
                            const sollSkontoBetrag = Math.round((doc.brutto * (1 - skontoPz / 100)) * 100) / 100;
                            const skontoDifferenz = Math.round((doc.brutto - sollSkontoBetrag) * 100) / 100;

                            const fristGueltig = this._isDateWithinDays(doc.datum, tx.buchungstag, skontoTage + skontoToleranzTage);

                            if (fristGueltig && Math.abs(txBetrag - sollSkontoBetrag) < 0.02) {
                                bestMatch = {
                                    score: 95,
                                    matchType: 'SKONTO_DISCOUNT_MATCH',
                                    dokumentId: doc.id,
                                    belegNr: doc.nr,
                                    betrag: txBetrag,
                                    skontoAbzug: skontoDifferenz,
                                    differenzGrund: 'SKONTO',
                                    restOffen: 0.0
                                };
                                break;
                            }
                        }

                        // 1c. Teilzahlung
                        if (txBetrag < docOffen) {
                            bestMatch = {
                                score: 90,
                                matchType: 'PARTIAL_PAYMENT_MATCH',
                                dokumentId: doc.id,
                                belegNr: doc.nr,
                                betrag: txBetrag,
                                skontoAbzug: 0.0,
                                differenzGrund: 'TEILZAHLUNG',
                                restOffen: Math.round((docOffen - txBetrag) * 100) / 100
                            };
                            break;
                        }
                    }
                }

                // Pass 2: Kunden-IBAN / Name + Betragstreffer (ohne Belegnummer)
                if (!bestMatch) {
                    for (const doc of offeneRechnungen) {
                        const docOffen = Math.round(((doc.brutto || 0) - (doc.bezahlt_betrag || 0)) * 100) / 100;
                        const kundenIban = String(doc.kunden_iban || '').replace(/\s+/g, '').toUpperCase();
                        const kundenName = String(doc.kunden_name || '').toUpperCase();

                        const ibanMatch = partnerIban && kundenIban && partnerIban === kundenIban;
                        const nameMatch = partnerName && kundenName && (partnerName.includes(kundenName) || kundenName.includes(partnerName));

                        if ((ibanMatch || nameMatch) && Math.abs(txBetrag - docOffen) < 0.009) {
                            bestMatch = {
                                score: ibanMatch ? 88 : 78,
                                matchType: ibanMatch ? 'IBAN_AND_AMOUNT_MATCH' : 'NAME_AND_AMOUNT_MATCH',
                                dokumentId: doc.id,
                                belegNr: doc.nr,
                                betrag: txBetrag,
                                skontoAbzug: 0.0,
                                differenzGrund: null,
                                restOffen: 0.0
                            };
                            break;
                        }
                    }
                }

                if (bestMatch) {
                    matches.push({ transaktionId: tx.id, ...bestMatch });
                }
            }

            // 2. Eingangsrechnungen / Verbindlichkeiten (Geldausgang < 0)
            if (txBetrag < 0) {
                const absTxBetrag = Math.abs(txBetrag);
                for (const er of eingangsrechnungen) {
                    if (er.zahlungs_status === 'BEZAHLT') continue;
                    const erNr = String(er.rechnungs_nr || '').toUpperCase();
                    const erBrutto = parseFloat(er.betrag_brutto) || 0;
                    
                    if (erNr && vzText.includes(erNr) && Math.abs(absTxBetrag - erBrutto) < 0.009) {
                        matches.push({
                            transaktionId: tx.id,
                            score: 100,
                            matchType: 'EXPENSE_EXACT_MATCH',
                            eingangsrechnungId: er.id,
                            belegNr: er.rechnungs_nr,
                            betrag: absTxBetrag,
                            differenzGrund: null
                        });
                        break;
                    }
                }
            }
        }

        return matches;
    }
}
```

### 3.2 `controllers/SepaController.js` (Isomorpher SEPA-Mandats- & XML-Generator)

```js
/**
 * SepaController.js - SEPA-Mandatsverwaltung, IBAN-Prüfung nach ISO 7064 Modulo 97,
 * TARGET2-Arbeitstageberechnung, Pre-Notification & pain.008 XML-Generator.
 */
class SepaController {
    /**
     * Validiert eine IBAN nach ISO 7064 Modulo 97.
     */
    static validateIban(iban) {
        if (!iban || typeof iban !== 'string') return false;
        const clean = iban.replace(/[\s-]+/g, '').toUpperCase();
        if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(clean)) return false;

        const rearranged = clean.substring(4) + clean.substring(0, 4);
        let numeric = '';
        for (let i = 0; i < rearranged.length; i++) {
            const code = rearranged.charCodeAt(i);
            numeric += (code >= 65 && code <= 90) ? (code - 55).toString() : rearranged[i];
        }

        let remainder = 0;
        for (let i = 0; i < numeric.length; i += 7) {
            const part = remainder.toString() + numeric.substring(i, i + 7);
            remainder = parseInt(part, 10) % 97;
        }

        return remainder === 1;
    }

    /**
     * Berechnet den nächsten gültigen TARGET2-Bankarbeitstag ab einem Mindestvorlauftag.
     */
    static getNextTarget2BankingDay(startDateIso, leadDays = 1) {
        let date = new Date(startDateIso + 'T00:00:00Z');
        let added = 0;

        while (added < leadDays) {
            date.setUTCDate(date.getUTCDate() + 1);
            const dayOfWeek = date.getUTCDay(); // 0 = So, 6 = Sa
            const isoStr = date.toISOString().split('T')[0];

            if (dayOfWeek !== 0 && dayOfWeek !== 6 && !this._isTarget2Holiday(isoStr)) {
                added++;
            }
        }

        return date.toISOString().split('T')[0];
    }

    /**
     * Generiert ISO 20022 `pain.008.001.08` XML (und Fallback `pain.008.001.02`).
     */
    static generatePain008Xml({
        msgId,
        initiatorName,
        creditorName,
        creditorIban,
        creditorBic,
        creditorId,
        executionDate,
        schemeType = 'CORE',
        sequenceType = 'RCUR',
        schemaVersion = 'pain.008.001.08',
        transactions = []
    }) {
        const totalSum = Math.round(transactions.reduce((sum, tx) => sum + (parseFloat(tx.betrag) || 0), 0) * 100) / 100;
        const totalCount = transactions.length;
        const creDtTm = new Date().toISOString().replace(/\.\d{3}Z$/, '');

        const xmlNamespace = schemaVersion === 'pain.008.001.08'
            ? 'urn:iso:std:iso:20022:tech:xsd:pain.008.001.08'
            : 'urn:iso:std:iso:20022:tech:xsd:pain.008.001.02';

        let txXml = '';
        for (const tx of transactions) {
            const endToEndId = this._escapeXml(tx.endToEndId || `E2E-${tx.dokumentId || Date.now()}`);
            const amountStr = (Math.round((parseFloat(tx.betrag) || 0) * 100) / 100).toFixed(2);
            const mandateId = this._escapeXml(tx.mandatsreferenz);
            const dtOfSgntr = tx.unterschriftsDatum;
            const debtorName = this._escapeXml(tx.kontoinhaber || tx.kundenName);
            const debtorIban = String(tx.iban).replace(/\s+/g, '').toUpperCase();
            const debtorBic = String(tx.bic || '').replace(/\s+/g, '').toUpperCase();
            const rmtInf = this._escapeXml(tx.verwendungszweck || `Rechnung ${tx.belegNr || ''}`);

            txXml += `
      <DrctDbtTxInf>
        <PmtId>
          <EndToEndId>${endToEndId}</EndToEndId>
        </PmtId>
        <InstdAmt Ccy="EUR">${amountStr}</InstdAmt>
        <DrctDbtTx>
          <MndtRltdInf>
            <MndtId>${mandateId}</MndtId>
            <DtOfSgntr>${dtOfSgntr}</DtOfSgntr>
          </MndtRltdInf>
        </DrctDbtTx>
        ${debtorBic ? `<DbtrAgt><FinInstnId><BIC>${debtorBic}</BIC></FinInstnId></DbtrAgt>` : '<DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>'}
        <Dbtr>
          <Nm>${debtorName}</Nm>
        </Dbtr>
        <DbtrAcct>
          <Id>
            <IBAN>${debtorIban}</IBAN>
          </Id>
        </DbtrAcct>
        <RmtInf>
          <Ustrd>${rmtInf}</Ustrd>
        </RmtInf>
      </DrctDbtTxInf>`;
        }

        return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="${xmlNamespace}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${this._escapeXml(msgId)}</MsgId>
      <CreDtTm>${creDtTm}</CreDtTm>
      <NbOfTxs>${totalCount}</NbOfTxs>
      <CtrlSum>${totalSum.toFixed(2)}</CtrlSum>
      <InitgPty>
        <Nm>${this._escapeXml(initiatorName || creditorName)}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>PMT-${this._escapeXml(msgId)}</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <BchBookg>true</BchBookg>
      <NbOfTxs>${totalCount}</NbOfTxs>
      <CtrlSum>${totalSum.toFixed(2)}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
        <LclInstrm>
          <Cd>${schemeType}</Cd>
        </LclInstrm>
        <SeqTp>${sequenceType}</SeqTp>
      </PmtTpInf>
      <ReqdColltnDt>${executionDate}</ReqdColltnDt>
      <Cdtr>
        <Nm>${this._escapeXml(creditorName)}</Nm>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <IBAN>${String(creditorIban).replace(/\s+/g, '').toUpperCase()}</IBAN>
        </Id>
      </CdtrAcct>
      <CdtrAgt>
        <FinInstnId>
          <BIC>${String(creditorBic).replace(/\s+/g, '').toUpperCase()}</BIC>
        </FinInstnId>
      </CdtrAgt>
      <CdtrSchmeId>
        <Id>
          <OrgId>
            <Othr>
              <Id>${this._escapeXml(creditorId)}</Id>
              <SchmeNm>
                <Prtry>SEPA</Prtry>
              </SchmeNm>
            </Othr>
          </OrgId>
        </Id>
      </CdtrSchmeId>
      ${txXml}
    </PmtInf>
  </CstmrDrctDbtInitn>
</Document>`;
    }
}
```

---

## 4. Schritt-für-Schritt Umsetzungsanleitung für den Code-Agenten

### Schritt 1: DB-Schema in `schema.js` & `db.js` erweitern
1. In `schema.js::createSchema(db)` die 6 neuen Tabellen anlegen: `bank_konten`, `bank_transaktionen`, `zahlung_zuordnungen`, `kunden_sepa_mandate`, `sepa_lastschrift_laeufe`, `sepa_lastschrift_positionen` sowie alle Indizes.
2. In `schema.js::runMigrations(db)` Spalten-Erweiterungen für `dokumente` (`skonto_tage`, `skonto_prozent`, `bezahlt_betrag`, `offener_betrag`, `sepa_mandat_id`) und `kunden` (`iban`, `bic`, `bank_name`, `kontoinhaber`, `sepa_mandat_aktiv`) einfügen.
3. In `schema.js::seedDefaultData(db)` Standardeinstellungen für Banking und SEPA eintragen.

### Schritt 2: Controller-Implementierung
1. Erstelle `controllers/BankingController.js`:
   - CAMT.053 / CAMT.052 XML-Parser
   - CSV-Parser mit Profil-Erkennung
   - SHA-256 Fingerprint-Deduplizierung
   - 4-Pass Matching-Engine mit Skonto- und Teilzahlungslogik
2. Erstelle `controllers/SepaController.js`:
   - ISO 7064 Modulo 97 IBAN-Prüfung
   - TARGET2-Bankarbeitstage-Berechnung
   - Pre-Notification Vorlagenerstellung
   - XML-Builder für `pain.008.001.08` und `pain.008.001.02`

### Schritt 3: API-Methoden in `db.js` & IPC in `main.js` und `preload.js`
In `db.js::dbAPI` folgende Methoden implementieren:
- **Bankkonten:** `getBankKonten()`, `saveBankKonto(konto)`, `deleteBankKonto(id)`.
- **Transaktionen & Import:** `importBankTransactions(kontoId, transactions, meta)`, `getBankTransaktionen(filter)`.
- **OPOS & Matching:** `runOposMatching(kontoId)`, `applyPaymentMatching(matches, options)`, `unmatchTransaction(zuordnungId, grund)`.
- **SEPA-Mandate:** `getKundenMandate(kundeId)`, `saveSepaMandat(mandat)`, `deleteSepaMandat(id)`.
- **SEPA-Läufe:** `getOffeneRechnungenFuerSepa()`, `createSepaRun(payload)`, `getSepaLaeufe()`, `exportSepaRunXml(laufId)`.

In `main.js` entsprechende `ipcMain.handle` Registrierungen durchführen und in `preload.js` an `window.api` exponieren.

### Schritt 4: UI & Frontend-Integration
1. **`code.html`:**
   - Neuen Sidebar-Navigationspunkt `Banking & OPOS` einfügen (`#nav-banking` mit Icon `account_balance`).
   - Neue Hauptansicht `<div id="view-banking">` mit 4 modernen Tailwind-Tabs erstellen:
     - **Tab 1: Kontoauszug & Import:** Datei-Upload (Drag & Drop für `.xml` / `.csv`), Kontowahl, Transaktionsliste mit Status-Badges, Filter nach Geldeingang/Geldausgang.
     - **Tab 2: OPOS-Zahlungsabgleich:** Matching-Center mit Score-Anzeige (Grün >=90%, Gelb 70-89%), 1-Klick-Auto-Abgleich, manuelle Zuweisung mit Skonto-Berechnung.
     - **Tab 3: SEPA-Lastschriften:** Auswahl offener Rechnungen mit Mandat, Vorschau der Lastschrift-Summe, XML-Download (`pain.008`), Pre-Notification Druck-/E-Mail-Button.
     - **Tab 4: Konten & Mandate:** Verwaltung der eigenen Bankverbindungen und Mandate aller Debitoren.
2. **`js/banking.js`:**
   - Frontend-Logik für Datei-Uploads, Tab-Wechsel, Rendering der Tabellen und Dialoge.
3. **`js/navigation.js`:**
   - Route `banking` in `viewConfig` und `views` Array registrieren.
4. **`js/kunden.js` & `js/editor.js`:**
   - SEPA-Mandat Bereich in der Kundenbearbeitung.
   - Skonto-Felder (Tage, Prozent) im Rechnungseditor einbinden.

---

## 5. Test- und Validierungsstrategie

Alle Tests werden als automatisierte Node.js-Testdateien in `tests/` bereitgestellt:

### 5.1 `tests/banking_parser.test.js`
- Test 1: Parser für `CAMT.053.001.08` XML mit mehreren `<Ntry>`, Salden und Ustrd.
- Test 2: Parser für `CAMT.053.001.02` (Legacy-Schema).
- Test 3: Parser für deutsches Sparkassen-CSV mit Umlauten und Semikolon.
- Test 4: Parser für Volksbanken-CSV mit Soll/Haben-Vorzeichen.
- Test 5: Deterministische Deduplizierung: Identische Transaktion erzeugt identischen SHA-256-Hash; Zweitimport wird ignoriert.

### 5.2 `tests/opos_matching.test.js`
- Test 1: Pass 1 100% Match (Belegnummer im Verwendungszweck + exakter Betrag).
- Test 2: Pass 2 Skonto-Match: Rechnung 1.000 € mit 2% Skonto (20 €) innerhalb 10 Tagen -> Zahlung von 980 € am Tag 5 wird mit Score 95% gematcht, Skontoabzug 20 € verbucht, Rechnung auf `Bezahlt` gesetzt.
- Test 3: Teilzahlung: Rechnung 500 €, Zahlung 200 € -> Rechnung auf `Teilweise bezahlt` gesetzt, Restforderung 300 €.
- Test 4: Mahnstufen-Entlastung: Bei Vollzahlung wird Rechnung aus Mahnvorschlägen entfernt.
- Test 5: Reversibles Unmatching: Aufhebung der Zuordnung stellt alten Rechnungsstatus wieder her und schreibt GoBD-Audit-Log.

### 5.3 `tests/sepa_pain008.test.js`
- Test 1: IBAN-Validierung (korrekte deutsche und europäische IBANs = true, fehlerhafte Prüfziffer = false).
- Test 2: TARGET2-Kalender: Berechnung des Ausführungstags unter Vermeidung von Wochenenden und Feiertagen.
- Test 3: XML-Generierung `pain.008.001.08`: Valides XML mit `GrpHdr`, `PmtInf`, `DrctDbtTxInf`, Gläubiger-ID und Mandatsreferenz.
- Test 4: XML-Generierung `pain.008.001.02` Fallback.
- Test 5: Mandats-Lifecycle: Erstlastschrift (`FRST`) wird nach erfolgreichem Lauf automatisch auf Folgelastschrift (`RCUR`) aktualisiert.

---

## 6. Zusammenfassung & Freigabe
Dieser Plan bietet eine lückenlose, sofort durchführbare Blaupause für die Implementierung der Bank-, OPOS- und SEPA-Kernfeatures. Durch die strikte Trennung von isomorphem Rechenkern, sauberer Datenbankschicht mit better-sqlite3 und reaktiver Desktop-UI erfüllt die Architektur höchste Ansprüche an Stabilität, Performance und GoBD-Konformität.
