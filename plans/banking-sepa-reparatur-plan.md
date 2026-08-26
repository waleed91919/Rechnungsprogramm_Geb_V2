# PLAN F11-R – MASTER-REPARATURPLAN BANKING / OPOS / SEPA (Validierungsbericht 26.08.2026)

**Version:** 1.0 (Freigegebener Master-Reparaturplan, 26.08.2026) — **STATUS: ABGESCHLOSSEN (umgesetzt am 26.08.2026; 194/194 Tests grün; XSD-Gegencheck siehe doc/changelog.md)**  
**Autor:** Planungs-Agent (W-Link ERP / Rechnungsprogramm_Geb_V2)  
**Ziel-Datei:** `C:\Users\walee\Desktop\server\Rechnungsprogramm_Geb_V2\plans\banking-sepa-reparatur-plan.md`  
**Zielgruppe:** Code-Subagent & Entwickler  
**Quelle der Wahrheit:** [`doc/validierungsbericht_2026-08-26.md`](../doc/validierungsbericht_2026-08-26.md) – Findings [B1]–[B7], Warnungen (Abschnitt 3–5), Empfehlungen P1/P2/P3 (Abschnitt 9)  
**Basis:** [`plans/bankimport-opos-sepa-plan.md`](../bankimport-opos-sepa-plan.md) (Original F11), [`doc/session_summary_2026-08-26.md`](../doc/session_summary_2026-08-26.md)  
**Projektkonventionen:**
- Produktionscode OHNE unnötige Kommentare; präzise Validierung und robuste Fehlerbehandlung mit deutschen Fehlermeldungen.
- Isomorphe Controller (`controllers/BankingController.js`, `controllers/SepaController.js`): `module.exports` UND `window.*`.
- Plain JavaScript, kein Framework, kein Build-Step; better-sqlite3 synchron im Main-Prozess; keine neuen nativen Abhängigkeiten.
- GoBD: Audit-Hashkette (`audit_logs`, SHA-256) wird niemals gebrochen; jede neue statuswirksame Aktion wird auditiert.
- Tests über Node-Testrunner: `npm test` (`node --test tests/*.test.js`). Nach jedem Schritt grün halten; **bestehende 167 Tests bleiben grün**, nur 3 dokumentierte Stellen werden gezielt angepasst (siehe Abschnitt 6.3).

---

## 0. Ziel & Scope

### 0.1 Ziel
Das Modul F11 (Bankimport CAMT/CSV, OPOS-Matching, SEPA-Lastschriften) ist laut Validierungsbericht vom 26.08.2026 **nicht produktionsreif**: Die pain.008-Exporte verstoßen hart gegen ISO 20022 ([B1]), zwei Matching-Pässe verlieren durch fehlende Persistenz ihre Wirkung im Echtbetrieb ([B2]/[B3]), `getSepaLaeufe()` wirft zur Laufzeit einen SQL-Fehler ([B4]), der CSV-Import verfälscht Soll/Haben-Vorzeichen ([B5]), vorgemerkte CAMT-Buchungen erzeugen Doppelbuchungsrisiken ([B6]) und die Demo-Gläubiger-ID landet still in echten Lastschriftdateien ([B7]).

Dieser Plan behebt **alle Findings [B1]–[B7]** sowie die empfohlenen Punkte **P2 (Regelkonformität)** und **P3 (Robustheit/GoBD-Härtung)** aus dem Validierungsbericht, mit exakten Datei:Zeile-Ankern und direkt abarbeitbaren Lösungsansätzen.

### 0.2 Scope-Abgrenzung – Was NICHT gemacht wird
- **Keine FinTS/HBCI-Anbindung** – Import bleibt dateibasiert (CAMT/CSV), Export pain.008-Datei.
- **Kein Umbau der Matching-Score-Werte:** Die Konstanten (Teilzahlung 80, IBAN 85, Name 75; BankingController.js:651/680) weichen zwar vom Originalplan ab, sind funktional unkritisch und bleiben wie implementiert.
- **Keine Änderung von `calculateDocumentContentHash`** (main/audit.js:38 ff.) – Skonto-/Mandatsfelder werden bewusst NICHT in den Belegs-Inhalts-Hash aufgenommen (Begründung siehe Fix 2, Risikoabschnitt).
- **Keine Bestandsdaten-Korrektur vorhandener Gläubiger-IDs** in bestehenden Datenbanken (GoBD: keine stillschweigenden Stammdatenänderungen); stattdessen harte Validierung bei allen Produktionspfaden.
- **Keine echte XSD-Laufzeitvalidierung mit nativen/npm-Parsern in der App** (Java-/Native-Abhängigkeiten widersprechen der Elektron-Konvention); stattdessen strukturelle Assertions in Tests + dokumentierter manueller XSD-Gegencheck (Abschnitt 6.1).
- **Keine Erweiterung auf camt.053.001.09+ / neuere Minor-Versionen** über Namespace-Toleranz hinaus.
- **Keine Tarifstands-Prüfung 2026** (Bericht P3 Punkt 17 – separater Vorgang, gehört nicht zu F11).
- **ZUGFeRD/XRechnung-Module bleiben unberührt.**
- Die Audit-Kettenarchitektur (`appendAuditLog`, `verifiziereAuditKette`) wird nicht verändert, nur genutzt.

---

## 1. Befund- und Fix-Übersicht

| Fix | Finding | Priorität | Kurzbeschreibung | Hauptanker |
|---|---|---|---|---|
| Fix 1 | [B1] | P1 | pain.008: `BtchBookg`, versionsabhängig `BICFI`/`BIC`, `ChrgBr=SLEV`, `PrvtId` | SepaController.js:277, 247, 300, 303–314 |
| Fix 2 | [B2] | P1 | `skonto_tage`/`skonto_prozent`/`sepa_mandat_id` persistieren (INSERT+UPDATE) | db.js:111–112, 138–139 |
| Fix 3 | [B3] | P1 | Kunden-Bankdaten in `saveKunde` persistieren | db.js:589–591, 603–604 |
| Fix 4 | [B4] | P1 | `getSepaLaeufe`: Sortierspalte `erstellt_am` statt `created_at` | db.js:3297 |
| Fix 5 | [B5] | P1 | CSV-Profil-Reihenfolge Deutsche Bank/Commerzbank vor Sparkasse | BankingController.js:350–364 |
| Fix 6 | [B6] | P1 | CAMT: Sts-Filter (PDNG), RvslInd, `CAMT052` bei `<Rpt>` | BankingController.js:151, 184–298, 296 |
| Fix 7 | [B7] | P1 | Gläubiger-ID-Validator (ISO 7064 Mod 97-10 ohne CBC), Demo-Fallback entfernen | db.js:3130, js/banking.js:580, schema.js:949 |
| Fix 8 | Warnung | P2 | Pre-Notification-Frist erzwingen (Art. 5.6 EPC Rulebook) | db.js:3138, 3155 |
| Fix 9 | Warnung | P2 | SeqTp je Mandat, mehrere PmtInf-Blöcke, `MIXED` niemals ins XML | schema.js:609, db.js:3137, SepaController.js:287 |
| Fix 10 | Warnung | P2 | FRST→RCUR erst bei EXPORTIERT/EINGEREICHT; Rücknahme bei Storno/Rücklastschrift | db.js:3258–3263, 3324–3343 |
| Fix 11 | Warnung | P2 | `DtOfSgntr`: Validierungsfehler statt Ausführungsdatum-Fallback | SepaController.js:229 |
| Fix 12 | Randfund | P2 | Rechtsverweise „§ 14 Abs. 4 Satz 1 Nr. 7 UStG“; §14b-Kopplung korrigieren | code.html:1760, 4951 |
| Fix 13 | Warnung | P3 | `unmatchTransaction` respektiert bestehende GoBD-Sperre | db.js:2913, 2918 |
| Fix 14 | Warnung | P3 | `zahlung_zuordnungen`: Storno-Flag statt physischem DELETE (Migration) | db.js:2970 |
| Fix 15 | Warnung | P3 | `_isDateWithinDays` fail-closed | BankingController.js:565–576 |
| Fix 16 | Struktur | P3 | Drag&Drop-Upload (Import-Tab) | code.html:1682, 1697 |
| Fix 17 | Struktur | P3 | Mandats-Anlege-UI (Tab 4, `saveSepaMandat` anbinden) | js/banking.js:643–679 |
| Fix 18 | Warnung | P3 | Namespace-Präfix-Toleranz (`camt:Stmt`) | BankingController.js:151 ff. |
| Fix 19 | Warnung | P3 | CP1252-Encoding-Behandlung beim Upload | js/banking.js:241 |
| Fix 20 | Warnung | P3 | AcctSvrRef als primärer Dedup-Key, Hash als Fallback | BankingController.js:133–143, db.js:2628 ff. |

---

## 2. Priorität P1 – Blocker (vor SEPA-Produktivgang zu beheben)

### Fix 1 – [B1] pain.008-XML: `BtchBookg`, `BICFI`/`BIC`, `ChrgBr=SLEV`, `PrvtId`

**Befund und Anker:**

| Problem | Ist-Zustand | Anker |
|---|---|---|
| 1. Falsches Element | `<BchBookg>true</BchBookg>` existiert nicht; korrekt ist `<BtchBookg>` (pain.008.001.02 UND .001.08) → jede Datei scheitert an der XSD | SepaController.js:277 |
| 2. Versionsabhängiges BIC-Element | Stets `<BIC>…</BIC>`; ab pain.008.001.08 ist es unter `FinInstnId` zwingend `<BICFI>` | SepaController.js:247 (DbtrAgt), 300 (CdtrAgt) |
| 3. `ChrgBr` fehlt | `<ChrgBr>SLEV</ChrgBr>` fehlt vollständig; EPC/bankenüblich Pflichtangabe je Lastschriftdatei | SepaController.js:262–318 (Template) |
| 4. `CdtrSchmeId`-Variante | `Id/OrgId/Othr`; EPC-Beispiele und Bankspezifikationen verwenden `Id/PrvtId/Othr` | SepaController.js:303–314 |

**Lösungsansatz (SepaController.js, `generatePain008Xml`, Z.187–319):**

1. Versionsabhängiger Tag direkt nach der Namespace-Bestimmung (Z.212–214):

```js
const bicTag = schemaVersion === 'pain.008.001.02' ? 'BIC' : 'BICFI';
```

2. Z.277 ersetzen: `<BchBookg>true</BchBookg>` → `<BtchBookg>true</BtchBookg>`
3. Z.247 (Schuldnerseite) ersetzen:

```js
${debtorBic
    ? `<DbtrAgt><FinInstnId><${bicTag}>${debtorBic}</${bicTag}></FinInstnId></DbtrAgt>`
    : '<DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>'}
```

4. Z.298–302 (Gläubigeragent) analog mit `${bicTag}`.
5. Nach `CdtrAgt` und vor `CdtrSchmeId` einfügen: `<ChrgBr>SLEV</ChrgBr>`
6. Z.303–314 ersetzen (`OrgId` → `PrvtId`):

```xml
<CdtrSchmeId>
  <Id>
    <PrvtId>
      <Othr>
        <Id>${this._escapeXml(creditorId)}</Id>
        <SchmeNm>
          <Prtry>SEPA</Prtry>
        </SchmeNm>
      </Othr>
    </PrvtId>
  </Id>
</CdtrSchmeId>
```

**Maßgebliche Elementreihenfolge in `PmtInf`** (ISO-XSD-Sequenz PaymentInstruction30, konsistent mit dem Berichtspunkt und gängigen Bank-Samples, z. B. EPC/sepa.js-Referenzdateien):

```xml
<PmtInf>
  <PmtInfId>PMT-…</PmtInfId>
  <PmtMtd>DD</PmtMtd>
  <BtchBookg>true</BtchBookg>
  <NbOfTxs>…</NbOfTxs>
  <CtrlSum>…</CtrlSum>
  <PmtTpInf>…</PmtTpInf>
  <ReqdColltnDt>2026-09-01</ReqdColltnDt>
  <Cdtr><Nm>…</Nm></Cdtr>
  <CdtrAcct><Id><IBAN>…</IBAN></Id></CdtrAcct>
  <CdtrAgt><FinInstnId><BICFI>…</BICFI></FinInstnId></CdtrAgt>
  <ChrgBr>SLEV</ChrgBr>
  <CdtrSchmeId><Id><PrvtId><Othr><Id>DE98…</Id><SchmeNm><Prtry>SEPA</Prtry></SchmeNm></Othr></PrvtId></Id></CdtrSchmeId>
  <DrctDbtTxInf>…</DrctDbtTxInf>
</PmtInf>
```

Hinweis zur Berichtsformulierung („gehört in PmtInf nach CdtrSchmeId“): Maßgeblich ist allein die XSD-Sequenz; Referenzbeispiele zeigen `CdtrAgt → ChrgBr → CdtrSchmeId → DrctDbtTxInf`. Genau diese Reihenfolge wird implementiert; die Tests prüfen die Reihenfolge per Index-Assertion (Abschnitt 6, T-R3).

7. Zusätzlicher Guard im Generator (verteidigt Fix 9 vor, unabhängig von dessen Umfang): `sequenceType` gegen Whitelist prüfen:

```js
if (!['FRST', 'RCUR', 'FNAL', 'OOFF'].includes(sequenceType)) {
    throw new Error(`Ungültiger Sequenztyp "${sequenceType}" für SEPA-Lastschrift (zulässig: FRST, RCUR, FNAL, OOFF).`);
}
```

**Risiken / Rückwärtskompatibilität:**
- Der Fallback `pain.008.001.02` behält korrekt `<BIC>` (bicTag-Logik) – bestehende Banken am Legacy-Format funktionieren weiter.
- Bestehende Tests S5/S6 (tests/sepa_pain008.test.js) nutzen String-Includes auf `<BIC>`/Template-Teile und müssen gezielt aktualisiert werden (dokumentierte Testanpassung Nr. 1, Abschnitt 6.3).
- Bereits generierte/archivierte Läufe (`sepa_lastschrift_laeufe.xml_content`) werden NICHT nachträglich verändert (GoBD-Unveränderbarkeit archivierter Exporte); der Fix wirkt nur auf Neuerzeugung.

---

### Fix 2 – [B2] Skonto-/Mandatsfelder in `saveDocument` persistieren

**Befund und Anker:**

| Problem | Anker |
|---|---|
| UPDATE schreibt die Spalten nicht | db.js:111–112 (`applyDocumentWrite`, UPDATE-Statement + Parameterliste) |
| INSERT schreibt die Spalten nicht | db.js:138–139 (INSERT-Statement + Parameterliste) |
| Bulk-Pfad identisch defekt | db.js:660–661 (`bulkSaveDocuments`, UPDATE + INSERT) |
| Editor sendet die Felder bereits | js/editor.js:1259–1260 |

Die Migrationsspalten existieren bereits (schema.js:813–817: `skonto_tage`, `skonto_prozent`, `bezahlt_betrag`, `offener_betrag`, `sepa_mandat_id`) – es fehlt ausschließlich das Persistieren in den Write-Pfaden.

**Lösungsansatz (db.js):**

1. Z.111 UPDATE um `skonto_tage=?, skonto_prozent=?, sepa_mandat_id=?` vor `sha256_hash=?` erweitern; Parameterliste Z.112 ergänzen um `d.skonto_tage || 0, d.skonto_prozent || 0, d.sepa_mandat_id == null ? null : d.sepa_mandat_id`.
2. Z.138 INSERT um die drei Spalten/Platzhalter erweitern; Parameterliste Z.139 analog (Platzhalterzahl 36 → 39).
3. Z.660–661 (`bulkSaveDocuments`) identisch nachziehen.
4. `bezahlt_betrag`/`offener_betrag` sind bewusst AUSGENOMMEN: Diese werden ausschließlich durch `applyPaymentMatching`/`unmatchTransaction` geführt (db.js:2801 ff., 2905 ff.) und dürfen durch normale Belegspeicherungen nicht überschrieben werden.

**Risiken / Rückwärtskompatibilität:**
- `calculateDocumentContentHash` (main/audit.js:38 ff.) enthält die drei Felder NICHT → das Persistieren ändert weder gespeicherte noch geprüfte Hashes; gesperrte Belege sind nicht betroffen. Bewusste Entscheidung: Hash-Funktion bleibt unverändert (Scope-Abgrenzung 0.2).
- Bestehende Belege haben NULL in den Spalten → Pass 2 greift für Altdokumente erst nach erneutem Speichern mit gepflegten Werten; akzeptiert und im UI später sichtbar (leere Skontofelder).
- Test O2 (tests/opos_matching.test.js) arbeitet mit In-Memory-Objekten und bleibt grün; neuer DB-Roundtrip-Test T-R23 (Abschnitt 6) sichert den Fix ab.

---

### Fix 3 – [B3] Kunden-Bankdaten in `saveKunde` persistieren

**Befund und Anker:**

| Problem | Anker |
|---|---|
| UPDATE speichert `iban`, `bic`, `bank_name`, `kontoinhaber` nicht | db.js:589–591 |
| INSERT speichert die vier Spalten nicht | db.js:603–604 |
| Bulk-Pfad identisch defekt | db.js:618–634 (`bulkSaveKunden`) |
| Frontend übergibt die Felder bereits | js/kunden.js:215 |

Migrationsspalten existieren (schema.js:819–823). Pass 4 (Kunden-IBAN-Match, BankingController.js:672–676) funktioniert derzeit nur als Seiteneffekt von `saveSepaMandat` (db.js:3059–3070).

**Lösungsansatz (db.js):**

1. Z.589 UPDATE: Spalten `iban=?, bic=?, bank_name=?, kontoinhaber=?` aufnehmen; Parameter Z.590: normalisierte Werte

```js
String(kunde.iban || '').replace(/[\s-]+/g, '').toUpperCase() || null,
String(kunde.bic || '').replace(/[\s-]+/g, '').toUpperCase() || null,
kunde.bank_name || null,
kunde.kontoinhaber || null,
```

2. Z.603–604 INSERT analog (Spaltenliste + Platzhalter + Parameter).
3. Z.618–634 (`bulkSaveKunden`) beide Statements identisch nachziehen.
4. IBAN wird hier NICHT per Prüfziffer erzwungen (Freiwilligkeit im Kundenstamm); die Prüfung erfolgt beim Mandats-Anlegen (`saveSepaMandat`, db.js:3000) unverändert.

**Risiken / Rückwärtskompatibilität:**
- Kunden, deren Bankdaten bisher nur implizit via Mandat gesetzt wurden, behalten diese Werte; ein Speichern ohne IBAN im Formular setzt das Feld auf NULL. Um unbeabsichtigtes Leerräumen zu vermeiden, gilt im Frontend (js/kunden.js): leere Eingabe → Feld nicht mitsenden bzw. bestehenden Wert erhalten (kleiner Frontend-Diff, Phase D).

---

### Fix 4 – [B4] `getSepaLaeufe()` SQL-Fehler beheben

**Befund und Anker:**

| Problem | Anker |
|---|---|
| `ORDER BY sl.created_at DESC, sl.id DESC` – Spalte existiert nicht; Tabelle hat `erstellt_am` | db.js:3297 vs. schema.js:616 |
| Aufrufstelle (SEPA-Reiter) schluckt Fehler im catch → Läufe-Liste bleibt leer | js/banking.js:382–391 (ladeSepaBereich, Z.386) |
| Kein Test ruft `getSepaLaeufe` auf → Crashfall unentdeckt | tests/sepa_pain008.test.js |

**Lösungsansatz (db.js):**

```sql
ORDER BY sl.erstellt_am DESC, sl.id DESC
```

**Risiken / Rückwärtskompatibilität:** Keine – reine Korrektur einer nie funktionierenden Abfrage. Neuer Test T-R12 ruft `getSepaLaeufe()` erstmals nach einem realen `createSepaRun` auf (Abschnitt 6).

---

### Fix 5 – [B5] CSV-Auto-Erkennung: Profil-Reihenfolge + Vorzeichen

**Befund und Anker:**

| Problem | Anker |
|---|---|
| `_detectCsvProfile` matcht Sparkasse (`begünstigter`) VOR Deutsche Bank/Commerzbank; deren Header „Begünstigter / Auftraggeber“ (DB) und „Auftraggeber / Begünstigter“ (CoBa) enthalten denselben Begriff → falsches Profil `CSV_SPARKASSE` | BankingController.js:350–364 (insb. Z.354 vor Z.357/360) |
| Folge: Soll-Buchung „120,50“ wird als +120.50 statt −120.50 importiert (DB/CoBa-Spaltenlogik umgangen) | BankingController.js:440–460 (DEUTSCHE_BANK mit soll/haben), 461–470 (COMMERZBANK) |
| Vorher durch Review-Agent ausgeführt und nachgewiesen; GoBD-relevant (Geldeingang/Ausgang vertauscht) | validierungsbericht_2026-08-26.md Abschnitt 2 [B5] |

**Lösungsansatz (BankingController.js, `_detectCsvProfile`, Z.350–364):** Reihenfolge tauschen und Sparkasse spezifischer erkennen:

```js
_detectCsvProfile(headerLower) {
    if (headerLower.includes('zahlungsbeteiligter')) {
        return 'CSV_VOLKSBANK';
    }
    if (headerLower.includes('kundenreferenz') || (headerLower.includes('wertstellung') && headerLower.includes('betrag (eur)'))) {
        return 'CSV_DEUTSCHE_BANK';
    }
    if (headerLower.includes('auftraggeber / begünstigter') || headerLower.includes('umsatzart')) {
        return 'CSV_COMMERZBANK';
    }
    if (headerLower.includes('beguenstigter/zahlungspflichtiger') || headerLower.includes('begünstigter/zahlungspflichtiger') || headerLower.includes('kontonummer/iban')) {
        return 'CSV_SPARKASSE';
    }
    if (headerLower.includes('beguenstigter') || headerLower.includes('begünstigter')) {
        return 'CSV_SPARKASSE';
    }
    return 'CSV_GENERIC';
}
```

Wirkung: Deutsche-Bank-Header (`wertstellung` + `betrag (eur)` bzw. `kundenreferenz`) und CoBa-Header (`auftraggeber / begünstigter` bzw. `umsatzart`) matchen VOR dem unspezifischen Sparkasse-Fallback; damit läuft die Soll/Haben-Spaltenlogik der Profile (Z.450–460, Z.465) wieder an.

**Risiken / Rückwärtskompatibilität:**
- Manuelle Profilwahl (`forcedFormat`) ist von der Änderung nicht berührt.
- Exotische Header-Varianten, die ausschließlich „begünstigter“ ohne weitere Tokens enthalten, fallen weiterhin in `CSV_SPARKASSE` – gleiches Verhalten wie heute, kein Regressionspfad.
- Absicherung ausschließlich über NEUE Tests mit Realheader-Fixtures inkl. Vorzeichen-Assertions (T-R17/T-R18); die bestehenden CSV-Tests assertierten nur Transaktionszahlen – genau deshalb blieb [B5] unentdeckt (Bericht Abschnitt 7).

---

### Fix 6 – [B6] CAMT.052/.053: `Sts`-Filter, `RvslInd`, `CAMT052`-Format

**Befund und Anker:**

| Problem | Anker |
|---|---|
| Kein Filter auf `<Sts>`: `PDNG`-Einträge (vorgemerkt) werden wie gebucht importiert → Dedup-Hash weicht später von camt.053-Buchung ab → Doppelbuchungsrisiko | BankingController.js:184–298 (Ntry-Loop) |
| `RvslInd` (Storno/Rückbuchung) wird ignoriert → Stornos landen als Normalbuchung | BankingController.js:184–298 |
| `importFormat` hartkodiert `'CAMT053'`, auch bei `<Rpt>`-Reports; CHECK erlaubt `'CAMT052'` | BankingController.js:296; schema.js:550 |
| Statement-Regex erkennt `<Stmt>` und `<Rpt>`, verwirft aber die Information, welcher Tag gematcht hat | BankingController.js:151–154 |

**Lösungsansatz (BankingController.js, `parseCamt053`, Z.145–310):**

1. Pro Statement den gematchten Tag bestimmen (statt anonymem Regex-Inhalt, Z.154):

```js
const stmtTag = (stmtMatch[0].match(/^<\s*(?:[A-Za-z0-9]+:)?(Stmt|Rpt)\b/i) || [])[1];
const isReport = String(stmtTag).toUpperCase() === 'RPT';
const importFormat = isReport ? 'CAMT052' : 'CAMT053';
```

2. Im Ntry-Loop (nach Z.185) Status/Storno extrahieren und vorgemerkte/stornierte Einträge überspringen:

```js
let skippedPending = 0;
let rvslSkipped = 0;

while ((ntryMatch = ntryRegex.exec(stmtContent)) !== null) {
    const ntry = ntryMatch[1];

    const sts = (ntry.match(/<Sts>([^<]+)<\/Sts>/i) || [])[1];
    if (sts && /^(PDNG|INFO)$/i.test(sts.trim())) {
        skippedPending++;
        continue;
    }

    const rvsl = (ntry.match(/<RvslInd>([^<]+)</i) || [])[1];
    if (rvsl && /^(true|1)$/i.test(rvsl.trim())) {
        rvslSkipped++;
        continue;
    }
    ...
```

3. Z.296: `importFormat: 'CAMT053'` → `importFormat` (Variable aus Schritt 1).
4. Statement-Objekt (Z.300–306) um `statementType: importFormat, skippedPending, rvslSkipped` erweitern. Rückgabeform bleibt Array-of-Statements (kompatibel zu js/banking.js:205–209: `flatMap(s => s.transactions)`, `statements[0].closingBalance`).
5. UI-Nachricht (js/banking.js:228) optional erweitern um `… , X vorgemerkt übersprungen` (Summe über `skippedPending`), damit Anwender verstehen, warum Zeilen fehlen.

**Entscheidung RvslInd:** Stornierte Einträge werden **übersprungen und gezählt** (nicht mit invertiertem Vorzeichen importiert). Begründung: Ein Import als Gegenbuchung würde bei späterer Korrekturdatei derselben Bank erneut dedupliziert/kollidiert und erzeugt Buchungsverwirrung; Überspringen ist GoBD-sicher (keine stille Falschbuchung) und sichtbar protokolliert.

**Risiken / Rückwärtskompatibilität:**
- camt.053-Dateien ohne `Sts`-Element verhalten sich unverändert (implizit BOOK).
- Falls eine Bank dieselbe Buchung zuerst als PDNG und dann als BOOK in aufeinanderfolgenden Reports sendet, wird der Zweitimport korrekt dedupliziert (identischer Hash, da BOOK-Daten identisch) – genau der im Bericht genannte Fall ist damit abgedeckt.
- Neue Testfälle T-R19 bis T-R21 (Abschnitt 6).

---

### Fix 7 – [B7] Gläubiger-ID-Validator + Entfernung des Demo-Fallbacks

**Befund und Anker:**

| Problem | Anker |
|---|---|
| Keine Prüffunktion für die Gläubiger-Identifikationsnummer | controllers/SepaController.js (neue Funktion) |
| Stillersatz `|| 'DE98ZZZ09999999999'` in echtem Lastschriftlauf | db.js:3130 (`createSepaRun`) |
| Stillersatz in der Pre-Notification-UI | js/banking.js:580 (`zeigePreNotificationModal`) |
| Seed legt Demo-ID als Default ab | schema.js:949 |

**Normatives Format (Deutschland, 18 Zeichen):** `DE` + Prüfziffer (2) + Geschäftsbereichscode/CBC (3, üblich `ZZZ`) + nationale ID (11, achtes Zeichen beginnend mit `0`). **Prüfziffer:** ISO 7064 Mod 97-10 über `nationaler Teil + Ländercode + '00'`; der Geschäftsbereichscode fließt NICHT ein (Bundesbank/EPC262-08); `Prüfziffer = 98 − Rest`. Offiziell gültige Beispiel-ID zum Testen laut Bundesbank: **`DE98ZZZ09999999999`**.

Der Algorithmus wurde im Rahmen dieses Plans numerisch verifiziert: Basis `"09999999999"+"DE"+"00"` → Rest 0 → Prüfziffer 98 → `DE98ZZZ09999999999` ist valide.

**Lösungsansatz:**

1. Neue isomorphe Funktion in `controllers/SepaController.js` (vor `generatePain008Xml` einfügen):

```js
validateGlaeubigerId(ci) {
    const clean = String(ci || '').replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{3}[A-Z0-9]{1,28}$/.test(clean)) return false;
    const country = clean.substring(0, 2);
    const pruefziffer = clean.substring(2, 4);
    const national = clean.substring(7);
    let rest = 0;
    const basis = national + country + '00';
    for (const ch of basis) {
        const code = ch.charCodeAt(0);
        const wert = (code >= 65 && code <= 90) ? String(code - 55) : ch;
        for (const ziffer of wert) {
            rest = (rest * 10 + parseInt(ziffer, 10)) % 97;
        }
    }
    return String(98 - rest).padStart(2, '0') === pruefziffer;
}
```

2. **db.js:3130** ersetzen:

```js
const creditorIdRaw = bankKonto.glaeubiger_id || settings.glaeubiger_id || '';
if (!creditorIdRaw || !SepaController.validateGlaeubigerId(creditorIdRaw)) {
    throw new Error(`Keine gültige Gläubiger-Identifikationsnummer hinterlegt (Bankkonto "${bankKonto.kontoname}" bzw. Einstellungen). Bitte prüfen Sie die Konfiguration, bevor Sie einen SEPA-Lastschriftlauf erstellen.`);
}
const creditorId = creditorIdRaw;
```

3. **js/banking.js:580**: Fallback entfernen; ohne gültige ID wird die Pre-Notification mit Warnhinweis statt Demo-ID erzeugt:

```js
const glaeubigerIdRaw = konto.glaeubiger_id || '';
const glaeubigerOk = glaeubigerIdRaw && parser.validateGlaeubigerId(glaeubigerIdRaw);
if (!glaeubigerOk && typeof showToast === 'function') {
    showToast('Warnung: Keine gültige Gläubiger-ID am Bankkonto hinterlegt. Bitte unter Tab 4 konfigurieren.', 'warning');
}
// Übergabe: glaeubigerId: glaeubigerOk ? glaeubigerIdRaw : 'BITTE GLÄUBIGER-ID HINTERLEGEN'
```

4. **schema.js:949**: Seed-Wert auf Leerstring ändern (`glaeubiger_id: ''`), sodass Neuinstallationen explizit konfigurieren müssen. Bestehende Datenbanken werden NICHT migriert (INSERT OR IGNORE greift ohnehin nur einmal; Bestandswerte bleiben – GoBD). Die Validierung in Schritt 2 fängt ungültige Bestandswerte bei jedem Lauf hart ab.
5. **Bankkonto-Modal absichern** (js/banking.js `speichereBankKontoForm`, Z.715–747): vor `saveBankKonto` prüfen, wenn `glaeubiger_id` befüllt:

```js
if (glaeubiger_id && !(typeof SepaController !== 'undefined' ? SepaController : window.SepaController).validateGlaeubigerId(glaeubiger_id)) {
    if (typeof showToast === 'function') showToast('Ungültige Gläubiger-Identifikationsnummer (Format DE##ZZZ###########, Prüfziffer falsch).', 'error');
    return;
}
```

**Risiken / Rückwärtskompatibilität:**
- Bestehende Installationen mit der Demo-ID können keine Läufe mehr erstellen, bis eine echte ID hinterlegt wird – gewollt (Bericht: Demo-ID darf nie in echte Dateien gelangen). Fehlermeldung nennt Lösungsweg.
- Dauerrechnungs-/Automatisierungspfade, die `createSepaRun` aufrufen, erhalten jetzt eine klare Exception statt stiller Demo-IDs; Aufrufer geben die Meldung über IPC an das UI weiter (bestehendes wrapHandler-Muster).

---

## 3. Priorität P2 – Regelkonformität SEPA / Mandatswesen / Rechtsverweise

### Fix 8 – Pre-Notification-Frist erzwingen

**Anker:** db.js:3138 (`executionDate`), db.js:3149–3160 (`items` laden, inkl. `m.pre_notification_tage`, db.js:3155), schema.js:592 (DEFAULT 14), Bericht Abschnitt 3 Zeile 1.

**Lösungsansatz (db.js, `createSepaRun`, nach Laden von `items` ca. Z.3167):**

```js
const todayIso = new Date().toISOString().substring(0, 10);
const fristVerletzungen = [];
for (const item of items) {
    const tage = parseInt(item.pre_notification_tage, 10)
        || parseInt(settings.sepa_pre_notification_standard_tage, 10)
        || 14;
    const minDateIso = new Date(Date.parse(todayIso + 'T00:00:00Z') + tage * 86400000).toISOString().substring(0, 10);
    if (executionDate < minDateIso) {
        fristVerletzungen.push({ mandatsreferenz: item.mandatsreferenz, fristTage: tage, fruehesterTermin: minDateIso });
    }
}
if (fristVerletzungen.length > 0 && !payload.preNotFristBestaetigt) {
    throw new Error(`Pre-Notification-Frist (Art. 5.6 SEPA Rulebook) nicht eingehalten: ${fristVerletzungen.length} Mandat(e) benötigen frühestens ${Math.min(...fristVerletzungen.map(v => Number(v.fruehesterTermin.replace(/-/g, ''))))} … Bitte Ausführungsdatum anpassen oder verkürzte Frift vereinbaren und bestätigen.`);
}
```

(Die Fehlermeldung final sauber formulieren: Liste der Mandate mit jeweiligem frühestmöglichen Termin; keine Zeichenketten-Tricks.)
Bei `payload.preNotFristBestaetigt === true` und vorhandenen Verletzungen: `appendAuditLog({ entityType: 'SEPA_RUN', entityId: laufId, action: 'PRENOT_FRIST_ABWEICHEND_BESTAETIGT', details: fristVerletzungen })` (innerhalb der Transaktion nach Lauf-Insert).

**Risiken:** Bestehender Testlauf (tests/sepa_pain008.test.js) nutzt Ausführungsdatum nahe heute → dort `ausfuehrungsDatum` in Testdaten auf `+15 Tage` setzen bzw. Flag setzen (dokumentierte Testanpassung, falls betroffen). UI (js/banking.js Tab 3) erhält Checkbox „Verkürzte Pre-Notification-Frist vereinbart (bestätigt)“ und übergibt `preNotFristBestaetigt`.

### Fix 9 – SeqTp je Mandat, mehrere `PmtInf`-Blöcke, `MIXED` niemals ins XML

**Anker:** schema.js:609 (CHECK erlaubt `MIXED` auf Laufebene), db.js:3137 (`payload.sequenzTyp || 'RCUR'`), SepaController.js:287 (`<SeqTp>${sequenceType}</SeqTp>`), db.js:3153 (mandat.sequenz_typ wird geladen, aber ignoriert), Bericht Abschnitt 3 Zeile 3.

**Designentscheidung:** `MIXED` bleibt als **Label auf Laufebene** zulässig (CHECK unverändert – SQLite-CHECK-Migration wäre riskant), wird aber **nie in XML ausgegeben**. Wirksamer Sequenztyp je Position = `mandat.sequenz_typ`.

**Lösungsansatz:**
1. **SepaController.generatePain008Xml:** Transaktionen optional um Feld `seqTp` erweitern; Generator gruppiert intern:

```js
const gueltig = ['FRST', 'RCUR', 'FNAL', 'OOFF'];
const gruppen = new Map();
for (const tx of transactions) {
    const seq = tx.seqTp || sequenceType;
    if (!gueltig.includes(seq)) throw new Error(`Ungültiger Sequenztyp "${seq}".`);
    if (!gruppen.has(seq)) gruppen.set(seq, []);
    gruppen.get(seq).push(tx);
}
const pmtBlocks = ['FRST', 'RCUR', 'FNAL', 'OOFF']
    .filter(s => gruppen.has(s))
    .map((seq, idx) => this._buildPmtInfBlock({
        blockId: `${finalMsgId || Date.now()}-${idx + 1}`,
        sequenceType: seq,
        transactions: gruppen.get(seq),
        ...gemeinsameCreditorDaten
    }));
```

Der bestehende Template-Body (PmtInf, inkl. Fix 1) wird in `_buildPmtInfBlock(...)` ausgelagert; `GrpHdr.NbOfTxs/CtrlSum` summieren über ALLE Blöcke. Ohne `seqTp`-Felder entsteht exakt ein Block mit `sequenceType` – voll rückwärtskompatibel.
2. **db.js `createSepaRun`:** pro Position `seqTp: item.sequenz_typ` an die Transaktion (Z.3187–3201) anhängen; Lauf-Spalte: `const effektiveTypen = [...new Set(transactions.map(t => t.seqTp))]; const laufSeqTyp = effektiveTypen.length === 1 ? effektiveTypen[0] : 'MIXED';` (Z.3222–3236 Insert nutzt `laufSeqTyp`).
3. **CORE/B2B-Abgleich:** Positionen mit `item.mandats_typ !== schemeType` aussortieren; Ergebnisobjekt um `warnings: [...]` erweitern (UI-Toast); Audit `SEPA_RUN` detailiert `gefiltertePositionen`. Kein Lauf mehr mit B2B-Mandaten unter CORE-Scheme (Vorbestätigungspflicht Zahlerbank).
4. UI (Tab 3): Sequenzauswahl entfernen bzw. auf Hinweis reduzieren „Sequenztyp wird automatisch je Mandat bestimmt (FRST/RCUR/FNAL/OOFF)“.

**Risiken:** Bestehende Läufe in DB bleiben unverändert (archiviertes XML). Tests S3/S4 (einzelner Block) laufen unverändert weiter; neuer Test T-R9 sichert Mehrblock-Verhalten.

### Fix 10 – FRST→RCUR an Laufstatus binden; Storno-/Rücklastschrift-Rücknahme

**Anker:** db.js:3258–3263 (Update bereits in `createSepaRun`, Status `ERSTELLT`), db.js:3324–3343 (`exportSepaRunXml` setzt EXPORTIERT), schema.js:216 (Status-Enum), schema.js:633 (Positionsstatus inkl. `RUECKLASTSCHRIFT`), Bericht Abschnitt 3 Zeilen 2 und 5.

**Lösungsansatz:**
1. Update aus `createSepaRun` **entfernen** (db.js:3258–3263); nur `letzter_einzug_am`/`letzte_lauf_nr` bleiben dort (fachlich: geplanter Einzug).
   Stattdessen in `exportSepaRunXml` nach Z.3328:

```js
db.prepare(`
    UPDATE kunden_sepa_mandate SET sequenz_typ = 'RCUR'
    WHERE sequenz_typ = 'FRST'
      AND id IN (SELECT DISTINCT mandat_id FROM sepa_lastschrift_positionen WHERE lauf_id = ?)
`).run(laufId);
```

2. Neue Methode `storniereSepaLauf(laufId, grund)` in db.js:

```js
const tx = db.transaction(() => {
    const lauf = db.prepare('SELECT * FROM sepa_lastschrift_laeufe WHERE id = ?').get(laufId);
    if (!lauf) throw new Error(`SEPA-Lauf #${laufId} nicht gefunden.`);
    if (lauf.status === 'EINGEREICHT') throw new Error('Ein eingereichter Lauf kann nicht storniert werden.');
    db.prepare("UPDATE sepa_lastschrift_laeufe SET status = 'STORNIERT' WHERE id = ?").run(laufId);
    db.prepare("UPDATE sepa_lastschrift_positionen SET status = 'STORNIERT' WHERE lauf_id = ? AND status = 'EINGEREICHT'").run(laufId);
    db.prepare(`
        UPDATE kunden_sepa_mandate SET sequenz_typ = 'FRST'
        WHERE letzte_lauf_nr = ?
          AND sequenz_typ = 'RCUR'
          AND id IN (SELECT DISTINCT mandat_id FROM sepa_lastschrift_positionen WHERE lauf_id = ?)
          AND NOT EXISTS (
              SELECT 1 FROM sepa_lastschrift_positionen sp2
              JOIN sepa_lastschrift_laeufe l2 ON l2.id = sp2.lauf_id
              WHERE sp2.mandat_id = kunden_sepa_mandate.id
                AND l2.status IN ('EXPORTIERT', 'EINGEREICHT') AND l2.id != ?
          )
    `).run(lauf.lauf_nr, laufId, laufId);
    appendAuditLog({ entityType: 'SEPA_RUN', entityId: Number(laufId), action: 'STORNIERT', details: grund || 'Manuelle Stornierung' });
});
return tx();
```

3. Neue Methode `markiereRuecklastschrift(positionId, grund)`: Position → `RUECKLASTSCHRIFT`; gehört die Position zu einem Lauf mit `sequenz_typ = 'FRST'`, Mandat → `sequenz_typ = 'FRST'` zurück (gescheiterte Erstlastschrift ⇒ nächster Einzug wieder FRST); zugehöriger Beleg bleibt offen (keine Zahlungsbuchung); Audit `SEPA_POSITION_RUECKLASTSCHRIFT`. Vereinfachung dokumentiert: Die Feinunterscheidung „war dieser Einzug wirklich die Erstlastschrift“ läuft über die Laufebene (`xml_content`-agnostisch, Spalte `sequenz_typ`).
4. IPC: `db:storniereSepaLauf`, `db:markiereRuecklastschrift` in main.js (neben Z.690) und preload.js (neben Z.117) registrieren; UI-Buttons in js/banking.js (`renderSepaLaeufeTabelle`, Z.460 ff.: Storno für ERSTELLT/EXPORTIERT) und Laufdetail-Positionstabelle (`getSepaLaufDetails`, db.js:3301 ff.: Rücklastschrift-Button).

**Risiken:** Bestehender Test T5 („FRST wird nach erfolgreichem Lauf zu RCUR“, tests/sepa_pain008.test.js:251 ff.) ruft bereits `exportSepaRunXml` auf – Assertion bleibt bestehen, muss aber ggf. auf den neuen Zeitpunkt verschärft werden: **vor** Export noch `FRST`, danach `RCUR` (dokumentierte Testanpassung Nr. 2).

### Fix 11 – `DtOfSgntr`: Validierungsfehler statt Fallback

**Anker:** SepaController.js:229 (`const dtOfSgntr = txDateSig || executionDate;`).

**Lösungsansatz:**

```js
if (!txDateSig || !/^\d{4}-\d{2}-\d{2}$/.test(String(txDateSig)) || String(txDateSig) > executionDate === false && false) {
    // finale Logik:
}
```

Sauber final:

```js
const sigDatum = String(txDateSig || '').trim();
if (!/^\d{4}-\d{2}-\d{2}$/.test(sigDatum)) {
    throw new Error(`Unterschriftsdatum des SEPA-Mandats "${txMandat || 'unbekannt'}" fehlt oder hat ungültiges Format (erwartet JJJJ-MM-DD). Eine Ersetzung durch das Ausführungsdatum ist rechtlich unzulässig.`);
}
const dtOfSgntr = sigDatum;
```

**Risiken:** Alle Aufrufer (db.js `createSepaRun` via `item.unterschrifts_datum`, schema NOT NULL, db.js:3006 setzt Default bei Mandatsanlage) liefern i. d. R. valide Daten; fehlerhafte Mandate werden nun sichtbar abgewiesen statt still ersetzt (Abwehrrecht/Nachweisproblem gem. Bericht). Tests mit fehlendem Datum anpassen (falls vorhanden).

### Fix 12 – Rechtsverweise präzisieren

**Anker und Änderungen:**

| Ort | Ist | Neu |
|---|---|---|
| code.html:1760 | „Auto-Skonto nach § 14 Abs. 4 UStG aktiv (Toleranz: 2 Tage)“ | „Auto-Skonto nach § 14 Abs. 4 Satz 1 Nr. 7 UStG (Toleranz: 2 Tage)“; `title`-Attribut: „Bemessungsgrundlage: §§ 10 Abs. 1, 17 Abs. 1 UStG“ |
| tests/opos_matching.test.js:56 | String-Assertion auf alten Text | Auf neuen Text anpassen (dokumentierte Testanpassung Nr. 3) |
| code.html:4951 | „Privatkunde (Hinweispflicht nach §14 Abs. 4 Nr. 9 UStG)“ – Norm betrifft Aufbewahrungspflicht beim Empfänger von Bauleistungen, semantisch falsch gekoppelt | Label entkoppeln: „Privatkunde“; separater statischer Hinweis im Baustein-/Steuerblock: „Bei Bauleistungen trifft den Leistungsempfänger (Unternehmer/Juristische Person des öffentlichen Rechts) eine Aufbewahrungspflicht nach § 14b Abs. 1 Satz 5 UStG.“ |
| plans/bankimport-opos-sepa-plan.md Z.27/299, doc/session_summary_2026-08-26.md Z.42 | alte Formulierung | Optionaler Doku-Nachzug (kein Produktionscode) |

Rechtsstand geprüft im Validierungsbericht (Abschnitt 4, Web-Recherche): Seit 01.01.2025 wieder § 14 Abs. 4 Satz 1 Nr. 7 UStG n.F. (JStG 2024).

**Risiken:** Reiner Text/Tooltip; keine Logikänderung. Der eine Test mit String-Assertion wird mitgezogen.

---

## 4. Priorität P3 – Robustheit & GoBD-Härtung

### Fix 13 – `unmatchTransaction` respektiert bestehende GoBD-Sperre

**Anker:** db.js:2913 (`const newLocked = 0;`), 2918/2926 (immer entsperren), Bericht Abschnitt 4 Zeile 1.

**Lösungsansatz:**
1. Migration (schema.js `runMigrations`, Bereich F11 nach Z.823): `ALTER TABLE dokumente ADD COLUMN was_locked_vor_zahlung INTEGER DEFAULT 0` (try/catch-Muster wie Umgebung).
2. In `applyPaymentMatching` (Vollzweig, Bereich db.js:2801–2865): **vor** Setzen von `isLocked=1` den vorherigen Zustand sichern: `doc.was_locked_vor_zahlung = doc.isLocked ? 1 : 0;` und in das UPDATE aufnehmen.
3. `unmatchTransaction` Z.2913: `const newLocked = doc.was_locked_vor_zahlung ? 1 : 0;` (Spalte in UPDATE Z.2921–2926 aufnehmen).

**Risiken/Limitierung:** Altbestände (vor Migration gesperrte Belege) haben Default 0 und verhalten sich wie heute – bewusst dokumentiert; für Neuabläufe ist die Sperre korrekt.

### Fix 14 – `zahlung_zuordnungen`: Storno-Flag statt physischem DELETE

**Anker:** db.js:2970 (`DELETE FROM zahlung_zuordnungen WHERE id = ?`), schema.js:560–573.

**Lösungsansatz:**
1. Migration (schema.js, Bereich F11):

```sql
ALTER TABLE zahlung_zuordnungen ADD COLUMN storno_flag INTEGER DEFAULT 0;
ALTER TABLE zahlung_zuordnungen ADD COLUMN storniert_am DATETIME;
ALTER TABLE zahlung_zuordnungen ADD COLUMN storno_grund TEXT;
```

(je try/catch-Muster)
2. db.js:2970 ersetzen:

```js
db.prepare('UPDATE zahlung_zuordnungen SET storno_flag = 1, storniert_am = CURRENT_TIMESTAMP, storno_grund = ? WHERE id = ?').run(grund || 'Manuelle Entkopplung', zuordnungId);
```

3. Alle lesenden Zugriffe auf `zahlung_zuordnungen` prüfen (Code-Agent: `grep -n "zahlung_zuordnungen" db.js`) und um `WHERE storno_flag = 0` bzw. JOIN-Bedingung `AND z.storno_flag = 0` ergänzen – insbesondere Aggregationen für `zugeordneter_betrag`/Transaktionsstatus und OPOS-Sichten.
4. Audit bleibt unverändert (`ZAHLUNG_ENTKOPPELT` existiert bereits, db.js:2928/2948).

**Risiken:** Eindeutige „aktive“ Zuordnung pro Transaktion/Betrag muss über die Filter garantiert bleiben; Dedup-Tests (T-R25) decken den Roundtrip ab. Historische Zuordnungen bleiben GoBD-nachvollziehbar (Bericht-Forderung).

### Fix 15 – `_isDateWithinDays` fail-closed

**Anker:** BankingController.js:565–576 (early-return `true` Z.566, catch `true` Z.573–575).

**Lösungsansatz:**

```js
_isDateWithinDays(startDateStr, checkDateStr, maxDays) {
    if (!startDateStr || !checkDateStr) return false;
    try {
        const d1 = new Date(startDateStr.substring(0, 10) + 'T00:00:00Z');
        const d2 = new Date(checkDateStr.substring(0, 10) + 'T00:00:00Z');
        if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return false;
        const diffDays = Math.floor((d2.getTime() - d1.getTime()) / 86400000);
        return diffDays >= -1 && diffDays <= maxDays;
    } catch (e) {
        return false;
    }
}
```

**Risiken:** Auto-Skonto greift ohne belastbares Datum nicht mehr (gewollt: kein Skonto ohne Fristnachweis). Praxisimpact gering: CSV-Zeilen ohne Datum werden ohnehin übersprungen (BankingController.js:500), CAMT liefert `BookgDt`.

### Fix 16 – Drag&Drop-Upload (Import-Tab)

**Anker:** code.html:1682 (nur File-Input), code.html:1697–1699 (Tab-1-Panel); Drag&Drop fehlt komplett (grep-verified), entgegen Plan Schritt 4.1/Summary Z.60.

**Lösungsansatz:**
1. code.html Tab-1-Panel (Z.1697) erhält Dropzone-Attribute auf dem bestehenden Kopfpanel:

```html
<div id="banking-dropzone"
     class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 border-dashed">
```

plus dezenter Hinweistext „oder Datei hierher ziehen (.xml / .csv)“.
2. js/banking.js neue Init-Funktion (Aufruf beim Öffnen der Banking-View, neben bestehender Initialisierung):

```js
function initBankDropzone() {
    const dz = document.getElementById('banking-dropzone');
    if (!dz || dz.dataset.dropInit === '1') return;
    dz.dataset.dropInit = '1';
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('border-primary', 'bg-primary/5'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('border-primary', 'bg-primary/5'));
    dz.addEventListener('drop', e => {
        e.preventDefault();
        dz.classList.remove('border-primary', 'bg-primary/5');
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) handleBankFileUpload(file);
    });
}
```

**Risiken:** Keine; File-Input bleibt parallel nutzbar.

### Fix 17 – Mandats-Anlege-UI (Tab 4)

**Anker:** `saveSepaMandat` existiert serverseitig inkl. IBAN-Validierung (db.js:2994 ff., IPC `db:saveSepaMandat`, preload.js) wird aber von KEINEM Renderer-Modul aufgerufen; js/banking.js bietet nur Liste/Widerruf (Z.643–679, 760–779).

**Lösungsansatz:**
1. code.html: Modal `mandat-modal` (Felder: Kunde-Select, Mandatsreferenz, Typ CORE/B2B, Sequenztyp FRST/RCUR/FNAL/OOFF, Unterschriftsdatum, IBAN, BIC, Kontoinhaber, Bankname, Pre-Notification-Tage, Bemerkung) analog bestehendem `bank-konto-modal` (Z.1980-Umgebung).
2. js/banking.js: `oeffneMandatModal()` (Kundenliste via bestehender Kunden-API laden; Referenz-Vorschlag via `SepaController.generateMandateReference(kundennummer)`), `speichereMandatForm()` → `window.api.saveSepaMandat({...})` → Toast → `ladeKontenUndMandate()`; Button „Mandat anlegen“ in Tab-4-Kopfzeile neben Mandatstabelle (renderMandateListe, Z.643 ff.).

**Risiken:** Serverseitige Validierung (IBAN, Pflichtfelder) existiert bereits; Frontend dupliziert nur IBAN-Format-Hinweis.

### Fix 18 – Namespace-Präfix-Toleranz (CAMT)

**Anker:** BankingController.js:151 ff. – alle Regexes erwarten Default-Namespace; `<camt:Stmt>` schlägt fehl (Bericht Abschnitt 5).

**Lösungsansatz – Single-Point-Normalisierung am Parser-Eingang** (robuster als dutzende Regex-Änderungen), BankingController.js Z.146 ff.:

```js
parseCamt053(xmlString) {
    if (!xmlString || typeof xmlString !== 'string') {
        throw new Error('Ungültiger CAMT.053/052-XML-Inhalt.');
    }
    xmlString = String(xmlString).replace(/(<\/?)([A-Za-z0-9]+):/g, '$1');
    ...
```

Effekt: `<camt:Stmt>` → `<Stmt>`, `</camt:Stmt>` → `</Stmt>`; Attribut-Namespace (xsi:) unberührt; sämtliche nachgelagerten Regexes funktionieren unverändert. Der in Fix 6 beschriebene Tag-Erkennungsregex unterstützt Präfixe zusätzlich defensiv.

**Risiken:** Theoretischer Kollisionsfall „Attributwert enthält `<praefix:`“ ist in CAMT-Realdateien nicht anzutreffen; Normalisierung ist idempotent.

### Fix 19 – CP1252-Encoding-Behandlung beim Upload

**Anker:** js/banking.js:241 (`reader.readAsText(file)` – implizit UTF-8); Sparkasse exportiert ISO-8859-15/CP1252 (Bericht Abschnitt 5).

**Lösungsansatz (js/banking.js, `handleBankFileUpload`):** Heuristik + Zweitversuch mit expliziter Kodierung:

```js
function liesseDateiMitEncodingFallback(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            const text = String(e.target.result || '');
            const mojibake = /\uFFFD|(Ã¤|Ã¶|Ã¼|Ã„|Ã–|Ãœ|ÃŸ)/.test(text);
            if (!mojibake) return resolve(text);
            const reader2 = new FileReader();
            reader2.onload = ev => resolve(String(ev.target.result || ''));
            reader2.onerror = reject;
            reader2.readAsText(file, 'windows-1252');
        };
        reader.onerror = reject;
        reader.readAsText(file);
    });
}
```

In `handleBankFileUpload` Z.195 ff.: `const content = await liesseDateiMitEncodingFallback(file);` (Handler async machen).
Zusätzlich isomorph testbare Heuristik in BankingController: `static detectEncodingProblem(text)` → boolean (nutzt dieselbe Regex) – Unit-Test T-R22b möglich ohne FileReader.

**Risiken:** False Positive (UTF-8-Datei, die zufällig „Ã“-Sequenz enthält) führt nur zum Zweitversuch mit CP1252 – Ergebnis wäre sichtbar kaputte Umlaute; Wahrscheinlichkeit in Bank-CSV vernachlässigbar, Dedup/Hash arbeitet auf normalisiertem Inhalt.

### Fix 20 – AcctSvrRef/AcctSvcrRef als primärer Dedup-Key (Hash-Fallback)

**Anker:** BankingController.js:133–143 (`calculateTransactionHash` inkl. primanota), db.js:2628–2665 (`importBankTransactions` – nur UNIQUE auf `dedup_hash`), schema.js:546; Bericht: legitime Same-Day-Doppelbuchungen (ohne Partner-IBAN) kollidieren mit Content-Hash und werden still verworfen.

**Lösungsansatz (db.js `importBankTransactions`, Loop Z.2628):**

```js
for (const t of transactions) {
    const primanotaKey = String(t.primanota || '').trim();
    if (primanotaKey) {
        const exists = db.prepare('SELECT id FROM bank_transaktionen WHERE bank_konto_id = ? AND primanota = ?').get(kontoId, primanotaKey);
        if (exists) { duplicates++; continue; }
    }
    const hash = t.dedupHash || BankingController.calculateTransactionHash({ ... });
    try { insertStmt.run(...); inserted++; }
    catch (err) { if (err.message && err.message.includes('UNIQUE constraint failed')) duplicates++; else throw err; }
}
```

Ergebnisobjekt um `dedupMode`-Info erweitern (optional). Kein neuer UNIQUE-Index auf `(bank_konto_id, primanota)` – Bestandsduplikate würden den Index-Setup crashen; app-seitige Prüfung ist ausreichend und migrationsfrei.

**Risiken:** Bankenseitig sollte `AcctSvcrRef` je Konto eindeutig sein; falls eine Bank leere/wiederkehrende Werte sendet, greift der Hash-Fallback (leerer Key wird übersprungen). Verhalten nur für CAMT relevant (primanota aus `AcctSvcrRef`, BankingController.js:252–254); CSV unverändert.

---

## 5. Schritt-für-Schritt-Umsetzungsreihenfolge

Grundregel: erst Schema/Migrationen, dann Controller, dann db.js, dann IPC/Frontend, nach jeder Phase `npm test`.

### Phase A – Schema/Migrationen (schema.js)
1. **A1** Migration `dokumente.was_locked_vor_zahlung INTEGER DEFAULT 0` (Fix 13) – Bereich F11 nach Z.823, try/catch-Muster.
2. **A2** Migrationen `zahlung_zuordnungen.storno_flag/storniert_am/storno_grund` (Fix 14).
3. **A3** Seed `glaeubiger_id: ''` statt Demo-ID (schema.js:949, Fix 7).
4. **A4** Kontrolle ohne Codeänderung: `import_format`-CHECK erlaubt `CAMT052` bereits (schema.js:550); `sequenz_typ`-CHECK mit `MIXED` bleibt bewusst bestehen (Fix 9, Designentscheidung). `npm test` → grün.

### Phase B – Controller
5. **B1** SepaController.js: `BtchBookg`, `bicTag` (BICFI/BIC), `ChrgBr=SLEV`, `PrvtId`, SeqTp-Guard (Fix 1).
6. **B2** SepaController.js: `DtOfSgntr`-Validierung (Fix 11).
7. **B3** SepaController.js: `validateGlaeubigerId` (Fix 7).
8. **B4** SepaController.js: Multi-PmtInf-Gruppierung (`_buildPmtInfBlock`, `seqTp`-Feld) (Fix 9).
9. **B5** BankingController.js: `_detectCsvProfile`-Reihenfolge (Fix 5).
10. **B6** BankingController.js: CAMT `Sts`/`RvslInd`/`importFormat`/Statement-Type (Fix 6).
11. **B7** BankingController.js: Namespace-Normalisierung (Fix 18) und `detectEncodingProblem`-Heuristik (Fix 19).
12. **B8** BankingController.js: `_isDateWithinDays` fail-closed (Fix 15). `npm test` → bestehende Controller-Tests prüfen; S5/S6-Assertions hier bereits an neue Tags anpassen (Testanpassung Nr. 1).

### Phase C – db.js
13. **C1** `applyDocumentWrite` + `bulkSaveDocuments`: Skonto-/Mandatsfelder persistieren (Fix 2).
14. **C2** `saveKunde` + `bulkSaveKunden`: Bankdaten persistieren (Fix 3).
15. **C3** `getSepaLaeufe`: `erstellt_am` (Fix 4).
16. **C4** `createSepaRun`: Gläubiger-ID-Validierung (Fix 7), Pre-Notification-Frist (Fix 8), `seqTp` je Position + CORE/B2B-Filter + `laufSeqTyp` (Fix 9).
17. **C5** FRST→RCUR nach `exportSepaRunXml` verlagern; neue Methoden `storniereSepaLauf`, `markiereRuecklastschrift` (Fix 10).
18. **C6** `applyPaymentMatching` (Lock-Herkunft sichern) + `unmatchTransaction` (Sperre respektieren, Storno-Flag statt DELETE, Lesefilter `storno_flag=0` überall) (Fixe 13/14).
19. **C7** `importBankTransactions`: AcctSvcrRef-Primärkey (Fix 20). `npm test` → grün.

### Phase D – IPC & Frontend
20. **D1** main.js/preload.js: Kanäle `db:storniereSepaLauf`, `db:markiereRuecklastschrift` (Fix 10).
21. **D2** code.html/js: Rechtsverweise (Z.1760, Z.4951) (Fix 12); tests/opos_matching.test.js:56 mitziehen (Testanpassung Nr. 3).
22. **D3** code.html + js/banking.js: Drag&Drop (Fix 16).
23. **D4** code.html + js/banking.js: Mandats-Modal + Anbinden `saveSepaMandat` (Fix 17); Storno-/Rücklastschrift-Buttons (Fix 10 UI).
24. **D5** js/banking.js: PreNot-Fallback-Warnung (Fix 7), `preNotFristBestaetigt`-Checkbox Tab 3 (Fix 8), Encoding-Fallback beim Upload (Fix 19), Toast um übersprungene PDNG/Rvsl-Zeilen erweitern (Fix 6), Kundenformular: leere Bankfelder überschreiben nicht Bestand (Fix 3). `npm test` → grün.

### Phase E – Tests & Abschluss
25. **E1** Neue/erweiterte Tests gemäß Abschnitt 6 implementieren (T-R1 … T-R27).
26. **E2** Manueller Smoke-Check: Demo-CAMT mit `camt:`-Präfix + PDNG-Eintrag importieren; SEPA-Lauf erstellen → XML manuell gegen lokales pain.008.001.08-XSD (externes Tool, dokumentiert) prüfen; Storno → Mandat zurück auf FRST.
27. **E3** Gesamtlauf `npm test`; Changelog-Eintrag (doc/changelog.md).

---

## 6. Teststrategie

### 6.1 Grundsatz XSD-Validierung
Eine Laufzeit-XSD-Validierung in der App ist konventionswidrig (Java-/Native-Abhängigkeiten). Stattdessen:
- **Strukturelle Assertions** in Tests: Elementreihenfolge via `indexOf` (CdtrAgt < ChrgBr < CdtrSchmeId < DrctDbtTxInf; GrpHdr vor PmtInf), Whitelist-Checks (`<BtchBookg>` ja, `<BchBookg>` nein, `<BICFI>` bei .001.08, `<BIC>` bei .001.02, `<SeqTp>` ∈ {FRST,RCUR,FNAL,OOFF}), Zählsummen (Σ Block-NbOfTxs = GrpHdr.NbOfTxs; Σ CtrlSum = Summe der InstdAmt).
- **Manueller Gegencheck (E2):** generierte Beispieldatei gegen lokal hinterlegtes offizielles pain.008.001.08-XSD (z. B. via Online-/CI-Tool außerhalb der App); Ergebnis im Changelog dokumentieren.

### 6.2 Neue/erweiterte Testfälle (je Finding)

| ID | Finding | Datei | Testfall (Kernaussage) |
|---|---|---|---|
| T-R1 | B1 | tests/sepa_pain008.test.js | `.001.08` enthält `<BtchBookg>true</BtchBookg>`, enthält NIEMALS `<BchBookg>` |
| T-R2 | B1 | tests/sepa_pain008.test.js | `.001.08`: DbtrAgt+CdtrAgt mit `<BICFI>`; `.001.02`: mit `<BIC>` (Fallback behält BIC) |
| T-R3 | B1 | tests/sepa_pain008.test.js | `ChrgBr>SLEV</` vorhanden; Reihenfolge `indexOf`: CdtrAgt < ChrgBr < CdtrSchmeId < DrctDbtTxInf |
| T-R4 | B1 | tests/sepa_pain008.test.js | CdtrSchmeId-Pfad `Id/PrvtId/Othr/Id` + `SchmeNm/Prtry=SEPA` |
| T-R5 | B7 | tests/sepa_pain008.test.js | `validateGlaeubigerId`: `DE98ZZZ09999999999`=true (offizielle Bundesbank-Test-ID, Prüfziffer=98−Rest, Rest 0); `DE75ZZZ09999999999`=false; Kleinschreibung normalisiert=true; `''`/null=false; Formatverstoß=false; Ein-Digit-Mutation der Prüfziffer=false |
| T-R6 | B7 | tests/opos_matching.test.js | `createSepaRun` ohne/ungültiger Gläubiger-ID → throws mit deutscher Meldung; Demo-Fallback nie in `xml_content` |
| T-R7 | P2/F11 | tests/sepa_pain008.test.js | fehlendes/ungültiges Unterschriftsdatum → throws (kein Ausführungsdatum-Fallback) |
| T-R8 | P2/F9 | tests/sepa_pain008.test.js | `sequenceType:'MIXED'` am Generator → throws; `MIXED` erscheint nie im XML |
| T-R9 | P2/F9 | tests/sepa_pain008.test.js | Positionen FRST+RCUR → zwei PmtInf-Blöcke (`SeqTp` je korrekt), Block-NbOfTxs/CtrlSum korrekt, GrpHdr-Summen stimmen |
| T-R10 | P2/F8 | tests/sepa_pain008.test.js | Ausführung morgen + Default 14 Tage → throws; mit `preNotFristBestaetigt:true` → Lauf entsteht + Audit-Eintrag |
| T-R11 | P2/F9 | tests/opos_matching.test.js | B2B-Mandat im CORE-Lauf wird gefiltert (Warning + nicht in Positionen) |
| T-R12 | B4 | tests/sepa_lauf_lifecycle.test.js (NEU) | nach `createSepaRun`: `getSepaLaeufe()` liefert Array ≥1 mit `erstellt_am`/`lauf_nr` (ehemaliger Crashfall) |
| T-R13 | P2/F10 | tests/sepa_lauf_lifecycle.test.js | Mandat bleibt `FRST` nach Lauf-Erstellung; wird `RCUR` erst nach `exportSepaRunXml` (angepasster Alt-T5) |
| T-R14 | P2/F10 | tests/sepa_lauf_lifecycle.test.js | `storniereSepaLauf`: Lauf+Positionen STORNIERT, RCUR→FRST zurück (wenn kein anderer aktiver Lauf), `verifiziereAuditKette().valid===true` |
| T-R15 | P2/F10 | tests/sepa_lauf_lifecycle.test.js | `markiereRuecklastschrift`: Position RUECKLASTSCHRIFT, FRST-Lauf ⇒ Mandat zurück auf FRST, Beleg bleibt offen |
| T-R16 | P2/F10 | tests/sepa_lauf_lifecycle.test.js | `exportSepaRunXml` setzt `status=EXPORTIERT`, `exportiert_am` gesetzt |
| T-R17 | B5 | tests/banking_parser.test.js | 4 Realheader-Fixtures (Sparkasse/VR/DB/CoBa) → jeweils korrektes Profil erkannt |
| T-R18 | B5 | tests/banking_parser.test.js | Soll-Buchung „120,50“: DB-Header → **−120.50**, CoBa-Header → **−120.50** (Auto-Erkennung, Regression zum nachgewiesenen Bug) |
| T-R19 | B6 | tests/banking_parser.test.js | CAMT mit `PDNG`+`BOOK`-Ntry: nur BOOK importiert, `skippedPending=1` |
| T-R20 | B6 | tests/banking_parser.test.js | `RvslInd=true` übersprungen, `rvslSkipped=1` |
| T-R21 | B6 | tests/banking_parser.test.js | `<Rpt>`-Report → `importFormat:'CAMT052'` je Transaktion; `<Stmt>` → `'CAMT053'` |
| T-R22 | P3/F18 | tests/banking_parser.test.js | CAMT mit `camt:`-Präfixen vollständig geparst (Anzahl/Hashes identisch zu präfixfreier Variante) |
| T-R23 | B2 | tests/opos_matching.test.js | `saveDocument` mit skonto_tage/prozent/sepa_mandat_id → DB-Roundtrip persistent; Pass-2-Skonto-Match greift gegen **gespeicherten** Beleg (nicht In-Memory) |
| T-R24 | B3 | tests/opos_matching.test.js | `saveKunde` mit iban/bic/bank_name/kontoinhaber → Roundtrip; Pass-4-IBAN-Match ohne Mandat-Umweg |
| T-R25 | P3/F14+F20 | tests/opos_mapping.test.js (opos_matching) | Doppelimport gleicher Transaktion → `inserted=0, duplicates=n`; Zuordnung stornieren → `storno_flag=1`, Zeile vorhanden; erneutes Matching sieht sie nicht |
| T-R26 | P3/F15 | tests/opos_matching.test.js | `_isDateWithinDays('', …)`/ungültig → `false` ⇒ kein SKONTO_DISCOUNT_MATCH ohne Datum |
| T-R27 | P3/F13 | tests/opos_matching.test.js | vorher gesperrter Beleg (via entsperreBeleg-Workflow gesperrt, Zahlung, Unmatch) → `isLocked` bleibt/wird wieder 1; ungesperrter Beleg → 0 |

### 6.3 Gezielte Anpassungen BESTEHENDER Tests (dokumentiert, sonst alles bleibt grün)
1. tests/sepa_pain008.test.js S5/S6: String-Assertions auf `<BIC>`/Template → auf `<BICFI>` (bzw. versionsspezifisch) und neue Elemente anpassen.
2. tests/sepa_pain008.test.js T5 (Z.251 ff.): Assertion-Zeitpunkt FRST→RCUR auf „nach Export“ verschieben/verschärfen.
3. tests/opos_matching.test.js:56: Rechtsverweis-String auf „§ 14 Abs. 4 Satz 1 Nr. 7 UStG“.

### 6.4 Zielbild
- Bestehende **167 Tests bleiben grün** (inkl. der 3 dokumentierten Anpassungen).
- **+27 neue Testfälle** (T-R1 … T-R27) ⇒ Ziel **≥ 194 Tests**.
- Neue Testdatei: `tests/sepa_lauf_lifecycle.test.js` (DB-basiert, folgt dem Setup-Muster von tests/opos_matching.test.js mit In-Memory-/Temp-DB).
- Nach jeder Phase (A–E): `npm test` grün; abschließend Audit-Kettenprüfung (`verifiziereAuditKette().valid`) in Lifecycle-Tests integriert.

---

## 7. Akzeptanzkriterien-Checkliste

| ✔ | Kriterium |
|---|---|
| [ ] | **[B1]** Generiertes pain.008.001.08 enthält `<BtchBookg>` (niemals `<BchBookg>`), `<BICFI>`, `<ChrgBr>SLEV</ChrgBr>` in korrekter XSD-Reihenfolge und `CdtrSchmeId/Id/PrvtId/Othr/Id`; pain.008.001.02-Fallback nutzt weiterhin `<BIC>` (T-R1 bis T-R4 grün) |
| [ ] | **[B2]** `saveDocument` persistiert `skonto_tage`, `skonto_prozent`, `sepa_mandat_id` bei INSERT und UPDATE (auch Bulk-Pfad); DB-Roundtrip-Test mit anschließendem Skonto-Match grün (T-R23) |
| [ ] | **[B3]** `saveKunde` persistiert `iban`, `bic`, `bank_name`, `kontoinhaber` (auch Bulk-Pfad); Pass-4-IBAN-Match funktioniert ohne Mandat-Umweg (T-R24) |
| [ ] | **[B4]** `getSepaLaeufe()` läuft fehlerfrei und sortiert nach `erstellt_am`; erster Test dafür grün (T-R12); SEPA-Reiter zeigt Läufe |
| [ ] | **[B5]** Deutsche-Bank-/Commerzbank-Header werden vor Sparkasse erkannt; Soll-Buchung „120,50“ importiert als −120.50 (T-R17/T-R18) |
| [ ] | **[B6]** CAMT: `PDNG`/`INFO` werden übersprungen und gezählt; `RvslInd=true` wird übersprunken; `<Rpt>` setzt `import_format='CAMT052'` (T-R19 bis T-R21) |
| [ ] | **[B7]** `validateGlaeubigerId` implementiert (Mod 97-10 ohne CBC, `98−Rest`); `DE98ZZZ09999999999` validiert true; Demo-Fallback in `createSepaRun` und Pre-Notification entfernt; ohne gültige ID → harte deutsche Fehlermeldung (T-R5/T-R6) |
| [ ] | **P2-F8** Lauf mit Ausführungsdatum innerhalb der Pre-Notification-Frist wird abgelehnt; mit bestätigter Abweichung + Audit erlaubt (T-R10) |
| [ ] | **P2-F9** XML enthält ausschließlich FRST/RCUR/FNAL/OOFF; mehrere `PmtInf`-Blöcke je Sequenztyp; `MIXED` nur als Lauf-Label; CORE/B2B-Mismatch wird gefiltert (T-R8/T-R9/T-R11) |
| [ ] | **P2-F10** Mandat bleibt `FRST` bis `exportSepaRunXml`; Storno/Rücklastschrift stellt `FRST` wieder her; neue IPC-Kanäle verdrahtet (T-R13 bis T-R16) |
| [ ] | **P2-F11** Fehlendes/ungültiges `DtOfSgntr` → Validierungsfehler, kein Fallback aufs Ausführungsdatum (T-R7) |
| [ ] | **P2-F12** UI-Texte: „§ 14 Abs. 4 Satz 1 Nr. 7 UStG“ (code.html:1760) und entkoppelter §14b-Hinweis (code.html:4951) |
| [ ] | **P3-F13** Unmatching stellt vorherige GoBD-Sperre wieder her statt bedingungslose Freigabe (T-R27) |
| [ ] | **P3-F14** `zahlung_zuordnungen` wird nur noch logisch storniert (`storno_flag`); alle Abfragen filtern aktiv; Historie bleibt nachvollziehbar (T-R25) |
| [ ] | **P3-F15** `_isDateWithinDays` fail-closed; kein Auto-Skonto ohne belastbare Daten (T-R26) |
| [ ] | **P3-F16** Drag&Drop-Upload im Import-Tab funktionsfähig (parallel zum File-Input) |
| [ ] | **P3-F17** Mandate können vollständig über die UI (Tab 4) angelegt werden; `saveSepaMandat` angebunden |
| [ ] | **P3-F18** CAMT-Dateien mit Namespace-Präfixen werden importiert (T-R22) |
| [ ] | **P3-F19** CP1252-Uploads (Umlaute) werden korrekt eingelesen (Heuristik + windows-1252-Zweitversuch) |
| [ ] | **P3-F20** Identische `AcctSvrRef`-Buchungen werden als Duplikat erkannt (Primärkey), Hash nur als Fallback (T-R25) |
| [ ] | **Global** `npm test`: 167 bestehende (mit 3 dokumentierten Anpassungen) + 27 neue = ≥ 194 Tests grün; `verifiziereAuditKette().valid === true` in allen Lifecycle-Tests |

---

## 8. Definition of Done

1. Alle Findings **[B1]–[B7]** gemäß Akzeptanzkriterien (Abschnitt 7) implementiert und testabgedeckt.
2. Alle **P2**- und **P3**-Punkte dieses Plans umgesetzt bzw. explizit dokumentierte Designentscheidungen getroffen (MIXED als Label, Hash-Funktion unverändert, Altbestand `was_locked_vor_zahlung=0`, keine Bestandsmigration der Gläubiger-ID).
3. `npm test` vollständig grün: **≥ 194 Tests** (167 Bestand inkl. 3 dokumentierter Anpassungen + 27 neue).
4. Manueller E2E-Nachweis (Phase E2) dokumentiert: CAMT-Import inkl. Präfix/PDNG, pain.008-Export gegen XSD gegengeprüft, Storno-Rücknahme des Sequenztyps.
5. Projektkonventionen eingehalten: kein unnötiger Kommentar im Produktionscode, isomorphe Controller (`module.exports` + `window.*`), keine neuen nativen/npm-Laufzeitabhängigkeiten, deutschsprachige UI-Texte und Fehlermeldungen.
6. GoBD: Audit-Kette durchgehend valid; jede neue statuswirksame Aktion (Storno, Rücklastschrift, Fristabweichung, Export) auditiert; archivierte XML-Inhalte bestehender Läufe unverändert.
7. Changelog (doc/changelog.md) mit allen Änderungen inkl. Datei:Zeile-Referenzen aktualisiert; dieser Reparaturplan als erledigt markiert (Version 1.0 → abgeschlossen).

---

*Reparaturplan erstellt auf Basis von doc/validierungsbericht_2026-08-26.md; sämtliche Fundstellen wurden am 26.08.2026 direkt im Code verifiziert (Datei:Zeile). Gläubiger-ID-Algorithmus numerisch verifiziert (Basis = nationaler Teil + Ländercode + ‚00‘, Rest 0 ⇒ Prüfziffer 98) gemäß Bundesbank/EPC262-08.*
