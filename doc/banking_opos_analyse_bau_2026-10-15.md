# Banking & OPOS Analyse — Bau-Tauglichkeit (W-Link ERP)

**Datum:** 2026-10-15
**Methode:** 3 parallele Subagents (Banking-Code, OPOS-Code, Bau-Anforderungen) + manuelle Verifikation via Grep
**Zielgruppe:** Bauunternehmen (Bau / Handwerk / Gebäudereinigung)
**Quelle Bau-Fachlogik:** https://www.bauprofessor.de/ (abschlagsrechnung, kumulative-abschlagsrechnungen, schlussrechnung, teilschlussrechnung, sicherheitsleistung, skonto-bauleistungen, nachtrag-zum-bauvertrag) + VOB/B §§2,14,16,17, BGB §§288,632a,650b/f/g

---

## 1. Executive Summary

Banking & OPOS funktionieren technisch (Import, 4-Pass-Matching, Buchung, SEPA, Mahnung 1-3), sind aber **nicht bau-tauglich**:

- Keine Projekt-/Bauvorhaben-Sicht, keine kumulative Abschlagsketten-Sicht im OPOS
- Einbehalt (5-10% §17 VOB/B) wird gerechnet, aber nicht als Bestand/Forderung verfolgt
- Bürgschaften (Voraus/Erfüllung/Gewähr) nur TEXT-Feld, kein Register
- Manuelle Zuordnung tot, MT940-Import verletzt CHECK, KPIs falsch bei Teilzahlung
- VOB-Frist-/Zins-Rechner existiert, ist aber im UI nicht verdrahtet

Fazit der Subagents: Rechenkerne geplant/teilweise implementiert, für „bau-tauglich“ fehlen durchgängige Einbehalt/Bürgschafts-Verfolgung im OPOS, Projekt-Banking-Trennung und Schluss-Sperre.

---

## 2. Banking — Befund (Subagent 1, verifiziert)

### 2.1 Kern-Dateien

```
controllers/BankingController.js:1-126 — Fassade
controllers/banking/statement-parser.js:2-159 — parseCamt053 (Stmt|Rpt, PDNG/INFO-Skip, RvslInd-Skip)
controllers/banking/statement-parser.js:223-390 — parseCsvStatement (SPARKASSE:270, VOLKSBANK:281, DEUTSCHE_BANK:291, COMMERZBANK:312, GENERIC:322)
controllers/banking/statement-parser.js:395-530 — parseMt940 (:61:+:86:, ZKA ?00-?38, importFormat MT940:517)
controllers/banking/opos-matching.js:6-61 — _matchesNumberVariant (Jahreszahl-Blacklist 2000-2099:51)
controllers/banking/opos-matching.js:86-210 — matchTransactionsAgainstOpos (EXACT:109-120, SKONTO:122-141, PARTIAL:142-154, IBAN/NAME:157-181, EXPENSE_EXACT:188-206)
controllers/banking/banking-utils.js:134-155 — calculateTransactionHash (SHA256 iban|tag|betrag|text|partner|nota|occ)
controllers/banking/interest-calculator.js:56-78 — getVobPaymentTermDays (ABSCHLAG 21 / SCHLUSS 30, Cap 60)
controllers/SepaController.js:20-48,258-348 — validateIban Mod97, pain.008 PmtInf-Split, TARGET2
db/schema/banking_schema.js:6-59 — bank_konten, bank_transaktionen (dedup_hash UNIQUE, CHECK status:38, CHECK import_format:41 ohne MT940), zahlung_zuordnungen (ohne storno_*)
db/schema/index.js:702-719 — Migrationen skonto_*, bezahlt_betrag/offener_betrag, iban/bic, storno_flag
db/repositories/banking/transactions_repo.js:8-104 — importBankTransactions (Primanota-Precheck:33-40, UNIQUE-Catch:71-77)
db/repositories/banking/reconciliation_repo.js:8-49,51-198,200-279 — runOposMatching, applyPaymentMatching, unmatchTransaction (storno_flag=1:273)
main/ipc/ipc-banking.js:113-196, preload.js:111-129 — IPC-Brücke
js/banking/banking-ui.js:10-56, banking-import.js:3-102, banking-transactions.js:3-83, banking-opos-ui.js:3-139, banking-sepa-ui.js:3-316
views/partials/view-banking.html:1-278, views/modals/banking-modals.html:4-208
```

### 2.2 Was geht heute

- Import CAMT.053/052, MT940, CSV-Auto-Profil mit deutschem Zahlenformat + Encoding-Fallback windows-1252
- Dedup + Saldo-Fortschreibung
- Matching Scores 100/95/80/85/75, Jahreszahl-Fehlmatch gehärtet (OPOS-1)
- Transaktionale Buchung + Audit ZAHLUNGSEINGANG/BEZAHLT/MANUELL_BEZAHLT, reversibel mit Lock-Restore
- SEPA Mandat CRUD, PreNot-Frist, TARGET2, pain.008.001.08/02, FRST→RCUR, Storno/Rücklastschrift

### 2.3 Top 5 Schwächen Banking (verifiziert)

1. **Manuelle Zuordnung tot — P0.** `js/banking/banking-transactions.js:74` rendert Button `oeffneManuelleZuordnung(tx.id)`, Grep findet 0 Definitionen. Sammelzahlung/Einbehalt/Überzahlung ohne Auto-Treffer nicht zuordenbar.
2. **MT940 verletzt CHECK — P0.** `banking_schema.js:41` erlaubt nur CAMT/CSV_*, Parser + Import liefern `MT940` (`statement-parser.js:517`, `banking-import.js:62`). Echter .sta-Import → CHECK-Fehler. Gleiches Risiko `meta.format='CSV'`.
3. **Kein IGNORIERT/MANUELL_GEBUCHT-Pfad — P0/P1.** Schema kennt Status + `differenz_grund KULANZ/GEBUEHR/UEBERZAHLUNG/SONSTIGES`, Matching erzeugt nur SKONTO/TEILZAHLUNG/null, Ausgaben nur exakt, 1 Tx → max 1 Beleg (Sammelzahlung aus Plan nicht implementiert).
4. **Skonto-Frist falsch — P1.** `opos-matching.js:127` ab `doc.datum` statt Zugang/Fälligkeit, nur bei Nr-Treffer, Toleranz-Einstellung im UI nicht editierbar, kein Einbehalt-Bezug.
5. **Dedup-Collision + Schema-Drift — P1.** Occurrence-Counter pro parse-Aufruf, nicht global → gleiche Buchungen in 2 Dateien → falscher Hash. `storno_*` nur per Migration, nicht im CREATE (`banking_schema.js:46-59` vs `index.js:717-719`).

---

## 3. OPOS — Befund (Subagent 2, verifiziert)

### 3.1 Architektur: kein eigenes OPOS-Modul

Verteilt auf Banking-Matching + Dokumenten-Status + Mahn-PDF + Dashboard/Banking-UI.

```
controllers/banking/opos-matching.js:86-210 — 4-Pass Engine
controllers/banking/interest-calculator.js:91-357 — Verzug/Zins/40€, nirgends in js/ oder db/ aufgerufen (nur Tests)
db/repositories/banking/reconciliation_repo.js:8-49 — OPOS nur als Matching-Input (dokumente type=rechnung NOT Bezahlt/Storniert + eingangsrechnungen !=BEZAHLT)
db/repositories/banking/reconciliation_repo.js:51-198 — Fortschreibung bezahlt_betrag/offener_betrag, isLocked/mahnungLevel=0 bei Vollzahlung
db/schema/documents_schema.js:62-103 — rechnung_verrechnungen (kumulativ, nicht Zahlung!), invoice_cumulative_states + security_retentions (HELD/RELEASED/GUARANTEE_SUBSTITUTED)
models/InvoiceModel.js:80-103 — markAsPaid mit Restprüfung offen>0.009 → throw
js/dashboard/dashboard-table.js:43-71,160-194 — nur Status-Filter + Textsuche, Rest-Spalte, VOB-Badges ab datum (nicht faellig!), Anzeige-Überfällig ≠ DB-Status
js/dashboard/dashboard-kpi.js:40-52 — summiert brutto, ignoriert Teilweise bezahlt und offener_betrag
js/utils.js:331-363 — checkOverdueInvoices (faellig<heute → Überfällig, echter DB-Übergang)
js/settings/settings-mahnung.js:2-195,268-467 — Guards Überfällig+isLocked, Stufen 1-3, QR, Historie nur email_versandhistorie
```

### 3.2 Was geht heute

Teilzahlungen/Rest, Skonto-Felder + Pass-2, Mahnstufen PDF+Mail Einzel/Bulk, Fälligkeit/Verzug-Job, Kreditoren-Seite, Bau-Abrechnung kumulativ + Guards + Einbehalt-Rechenlogik.

### 3.3 Top 5 Schwächen OPOS (verifiziert)

1. **Keine echte OPOS-Liste.** Kein Kunde/Projekt/Fälligkeits-Filter, kein Aging, keine Σoffener_betrag.
2. **Überzahlung/Gutschrift nicht abbildbar.** `tx>offen` fällt durch, GUT-Belege isoliert.
3. **Toter Button + Default-Checked-Risiko.** Alle Matches default checked (`banking-opos-ui.js:64,115`), inkl. Score-75 NAME-Match (reines includes).
4. **Mahnwesen ohne Sperre/Historie, Zins ungenutzt.** Kein mahnsperre-Feld, Sprung 1→3 möglich, interest-calculator UI-los.
5. **Anzeige vs. DB inkonsistent, KPIs falsch.** `Ausstehend+30T → Anzeige Überfällig` (nur Anzeige), KPIs unsichtbar bei Teilzahlung, J2-Fehlermeldung verschluckt (`editor-save-status.js:110-111`).

---

## 4. Bau-Anforderungen (Subagent 3, Bauprofessor.de 15.10.2026)

### 4.1 Abrechnungsarten und OPOS-Wirkung

**a) Abschlagsrechnung — vorläufig, kumulativ (VOB/B §16 Abs.1, BGB §632a):**
Keine Abnahme, nur Liquidität. Fällig 21 Tage nach Zugang, Verzug spätestens 30 Tage. Formen: Intervall (nur Zuwachs) vs. Kumulativ `F_t = L_t - Σ gezahlte Abschläge` (Standard). Beispiel Bauprofessor: Auftrag 100k, AR1 kum. 30k Zahlung 27k (10% Einbehalt), AR2 kum. 50k ./.27k = 23k, etc. Schluss ./. alle Zahlungen = Rest. Nicht gezahlte AR + Einbehalte in Schluss vorbehalten, sonst Verlust (§16 Abs.3 Nr.2). Nach Schluss keine neue AR (BGH VII ZR 205/07).

**b) Teilschlussrechnung — endgültig für Teil (VOB/B §16 Abs.4, §12 Abs.2):**
Nur in sich abgeschlossene Teilleistung + Teilabnahme + gesondertes Entgelt. Strenge wie Schluss (§14 Abs.1, LV-Reihenfolge, Aufmaß). Braucht Teilabnahme-Datum + Protokoll-Link.

**c) Schlussrechnung — einzige Wahrheit (VOB/B §§14,16 Abs.3, BGB §650g Abs.4):**
Frist §14 Abs.3: 12 Werktage nach Fertigstellung (≤3 Monate), +6 Tage je 3 Monate. Fällig 30 Tage nach Zugang (max 60 nur vereinbart + sachlicher Grund). Vorbehalt 28 Tage + 28 Tage Begründung. Pflicht: Gesamt netto/brutto+USt, alle Nachträge (unbestätigte als Vorbehalt), alle Abschläge brutto absetzen (§14 Abs.5 UStG), Skonti brutto ausweisen, Aufmaße beilegen. Haufe-Muster: Verrechnung gilt 53.550€, nicht Überweisung 52.479€ nach 2% Skonto. Steuerbasis nie mindern (sonst §14c-Falle).

### 4.2 Einbehalte, Bürgschaften, Skonto, Fristen, Nachträge

- **Sicherheit nur wenn vereinbart (§17 regelt nur Wie):** Ausführung lfd. max 10% bis Cap (ÖAG max 5% Auftrag, max 3% Mängel), üblich 10%/5% Gewährleistung. <250k netto Verzicht. 18 Werktage Sperrkonto, sonst nach Nachfrist auszahlen. Rückgabe bei Abnahme (+ Mängelsicherheit), Gewährleistung nach 2 Jahren (§17 Abs.8 Nr.2).
- **3 Bürgschaften trennen:** Voraus (Höhe Anzahlung, abschmelzend, 3%+Basis), Erfüllung (10% bis Abnahme), Gewähr (max 5% danach). Vermischung macht Klausel unwirksam (BGH). Gegenrichtung Bauhandwerkersicherung §650f BGB.
- **Skonto:** Nicht vereinbart = unzulässig. Üblich 2-3% bei 10-14 Tagen. Frist ab Eingang prüfbare Rechnung (nicht Freigabe), jede AR einzeln (OLG Hamm).
- **Verzug:** 30 Tage auto, 9pp+ Basis + 40€ je RG B2B (§288), Mahnung+Nachfrist erlaubt früher + Arbeitseinstellung §16 Abs.5 Nr.4.
- **Nachträge/Aufmaß:** §2 Abs.3 ±10% Toleranz, darüber neuer Preis (BGH 08.08.2019 tatsächliche Kosten). §2 Abs.5/6 nur nach Anordnung, Ankündigung vorher. BGB §650b 30 Tage Einigung, 80% Abschlag. Aufmaß §14 prüffähig, gemeinsam, REB 23.003/DA11/X31. Unbestätigte Nachträge abschlägig abrechenbar (BGH VII ZR 34/11) als Vorbehalt.

### 4.3 Zwingende OPOS-Felder / Buchungen

Kopf: projekt_id, vertragstyp VOB/BGB/Verbraucher, rechnungsart AR_KUMULATIV/TEIL/SCHLUSS, L_t netto/brutto/steuer, verrechnungen_brutto[], retention_mode/t bases/%/cap, escrow_deadline_18T, skonto_%/tage/fristanfang, abnahme_datum, vorbehalt_28+28, status, bezahlt/offen, freigegeben_einbehalt.
Position: oz_code, nachtrag_id, aufmass_blatt_id/menge, EP, §2-Grund, 13b-Kennz.
Buchung: zahlbetrag = brutto - anzahlung - einbehalt - verrechnungen_brutto. Saldo offen = (fakturiert+freigegeben)-gezahlt. Hauptbuchung immer volles Brutto (DATEV 8400/8300/8337, Einbehalt S1540 an H Debitor).

### 4.4 Banking-Anforderungen Bau

Getrennte Konten je Bauvorhaben/Arge + Sperrkonto (18-Tage-Radar), CAMT/MT940/CSV mit SHA-Dedup, Matching kumulativ (Zahlbetrag≠Brutto, Skonto-Variante, Split, Jahreszahl-Blacklist, Projekt vor Beleg), SEPA pain.008.001.08 PstlAdr-Pflicht ab 22.11.2026 + TARGET2, DATEV EXTF 700.

### 4.5 Checkliste 10 Muss-Kriterien

1. Kumulativkern L_t-ΣZahlungen + Doppel-Schluss-Sperre
2. Einbehalt-Töpfe EXECUTION/WARRANTY + netto/brutto-Umschalter §13b
3. Sperrkonto-Fristautomat 18 Werktage + Rückgabe-Ampel
4. Bürgschaftsregister + Austausch Zug-um-Zug
5. Skonto-Engine + Auto-Erkennung im Matching
6. Fristen-Cockpit 12T/21T/30-60T/28+28/30T + Zins 9pp+40€
7. Nachtrag→Aufmaß→RG-Kette mit Vorbehalt
8. Projekt-scharfes OPOS mit Split + GoBD-Audit
9. Fehlertolerantes Matching + manuelles Entkoppeln mit Grund
10. DATEV/XRechnung-Wahrheit PDF==XML==DB, 10 Jahre Archiv

---

## 5. Gap: Was im Repo schon liegt vs. fehlt

**Liegt schon (plans/, controllers/, views/):** bauprofessor_vob_implementation_plan (EFB222, §17-Cap, §288-Zinsen), plan-01/03/04 + bankimport-opos-sepa-plan, 27 Controller (CumulativeBilling, Banking, Sepa, Nachtrag, Aufmass, SokaBau...), kumulativ-Formel + Guards + J1-Sperre, Einbehalt-Rechenlogik, MT940/4-Pass/SEPA-Grundlagen.

**Fehlt für bau-tauglich:** Einbehalt/Bürgschaft als OPOS-Bestand (kein INSERT, kein Freigabe-Beleg, kein Cockpit), Projekt-Banking-Trennung (kein projekt_id, kein Baukonto-Typ), Sammel-/Überzahlung, IGNORIERT-Flow, Zins-Anbindung, Aging/Cockpit, Aufmaß/Nachtrag/Bautagebuch-Links im OPOS.

---

## 6. Verbesserungsvorschläge priorisiert

### P0 (Forderungs-/GoBD-Risiko)
1. Echte OPOS-Abfrage `getOffenePosten({kundeId,projektId,faelligBis,rechnungsart})` + Filter-UI + KPIs auf Σoffener_betrag. Ref: reconciliation_repo.js:18-24, dashboard-kpi.js:40-52.
2. `oeffneManuelleZuordnung` implementieren (Split-UI + differenz_grund + Notiz) + Default-checked nur ≥90. Ref: banking-transactions.js:74, banking-opos-ui.js:64,115.
3. Überzahlung + Gutschrift schließen (`tx>offen`-Zweig, Guthaben-Verrechnung, GUT-Verknüpfung). Ref: opos-matching.js:142-154, banking_schema.js:53.
4. CHECK(import_format) um MT940 erweitern + Migration. Ref: banking_schema.js:41, statement-parser.js:517.
5. Mahn-Guard ehrlich (e.message durchreichen, Stufenfolge-Sperre, Hinweis im Row). Ref: editor-save-status.js:110-111, settings-mahnung.js:13-23.

### P1 (Bau-Parität)
6. Aging + Fälligkeits-Cockpit (fällig/nicht fällig/1-30/31-60/61-90/>90, Kunde/Projekt/Art, CSV/DATEV-Export, VOB-21 ab faellig).
7. Einbehalt als OP-Bestand (saveDocument-Hook → security_retentions HELD + 18T-Escrow via getEscrowDeadline, Freigabe → fälliger OP, Sperrkonto-Tab).
8. Zins-/Mahn-Rechner ans PDF (act/360, Basis+9/5pp, 40€ B2B nur Verzug, B2C-Check, Ausweis im Template).
9. Sammelzahlung 1→N, EingangsRG Teil+Skonto, Skonto-Frist faellig||zugang||datum + Toleranz-UI + IBAN-Treffer.
10. Bau-Brücke (projektId/rechnungsart/offen-nach-Verrechnungen-View, differenz_grund EINBEHALT, VOB-Fristbadge).
11. Mahnsperre + mahnung_history-Tabelle statt Überschreiben.

### P2 (VOB-Profi)
12. Projekt-OPOS „Bauakte Zahlung“ (L_t, ΣF_i, Zahlungen, Rest, Einbehalt, Nachträge, Schluss-Status + Aufmaß-Ref, SEPA-PreNot/TARGET2 je OP).
13. Bürgschafts-/Bautagebuch-Brücke (Stammdaten + Upload + Aval, HELD→GUARANTEE_SUBSTITUTED als Buchung, BEHINDERUNG/BEDENKEN → streitig/pausiert mit Mahnstopp).
14. Robustheit: prompt/confirm → Modale mit Grund, Suche Betrag/Datum + Paginierung, validateIban Mod97, E2E global eindeutig, pain.001 für NU prüfen.

---

## 7. Akzeptanzkriterien (Beispiele)

- TEST-BAU Rest-47 erscheint in KPI + Projekt-OPOS (P0-1)
- Überzahlung ohne Nr manuell zuordenbar, kein Bulk-Fehlklick Score 75 (P0-2/3)
- Echte .sta-Datei importiert ohne CHECK-Fehler (P0-4)
- 5%-Einbehalt als eigener OP mit Fälligkeit + 18T-Alarm (P1-7)
- Mahnbetrag = offen + Zins + Fee + Gebühr mit Ausweis (P1-8)

*Erstellt via Subagents, verifiziert via Grep am 2026-10-15. Detailbefunde siehe Task-Protokolle.*
