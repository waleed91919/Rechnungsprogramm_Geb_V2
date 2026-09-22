# Prüfbericht: W-Link Bau Rechnungskern-Stabilisierung — Phase P0

**Rolle:** Externer Code-Review- und Fach-Audit-Agent (streng, keine Schönrederei)
**Repo:** `F:\server\Rechnungsprogramm_Geb_V2`
**Prüfstand:** HEAD `31136c2` + uncommittete P0-Änderungen (git status, 10.09.2026)
**Geprüft gegen:** `plans/w-link-bau-rechnungskern-stabilisierung-plan.md`,
`doc/session_summary_2026-09-10_rechnungskern-stabilisierung-p0.md`
**Prüfdatum:** 10. September 2026
**Vorgehen:** Alle genannten Dateien zeilenweise gelesen, Rechenbeispiele selbst
nachgerechnet, relevante Suites selbst ausgeführt (`node --test`, `npm test`,
Electron-as-Node-Gegenlauf), Normquellen per Websuche verifiziert
(dejure.org VOB/B § 17, xeinkauf.de, Bauprofessor/BauGrid, Solytics/BR-DE-21).
**Vorgabe eingehalten:** Kein Produktcode geändert, kein Commit/Push — nur dieser Bericht.

---

## 0. Gesamt-Urteil

# FREIGABE: NEIN

**Begründung in einem Satz:** Die kumulative Einbehalt-Arithmetik im Controller ist
korrekt, aber der P0-Umsetzungsstand scheitert an sieben P0-blockierenden Befunden —
darunter eine normwidrige XRechnung-Kennung, die jede exportierte 3.0-Rechnung
ungültig macht, ein nicht aus der DB geladener „belegfixierter" Export und eine im
Formular wirkungslose EXECUTION-Deckelung.

**Zählung:** 7 × P0-blockierend / 6 × P1 / 3 × Hinweis (+ 4 × OK-Vermerke).
Details in § 2 (Tabelle). Top-5 Nachbesserungen in § 3.

**Was ausdrücklich gut ist (nicht kleingeredet):**
Steuer entsteht trotz Einbehalt auf vollem Netto (§ 13 UStG) — korrekt implementiert
und getestet. Sync-Auth-Matrix im Code ist solide (vor Body/DB/File authentifiziert,
Token-Reuse konsumiert, Fremd-Device-Write gebunden). DB-GoBD-Sperre
(`applyDocumentWrite`) existiert und greift bei `isLocked`. Die 20 `npm test`-Fehler
sind nachweislich vorbestehende Environment-Fehler (s. B-20), keine versteckte Regression.

---

## 1. Selbst nachgerechnete Abnahmekette (P0.2-Fixture)

Auftrag 1.000 € netto, 19 % USt, Einbehalt 5 %, Modus EXECUTION, kein § 13b.
Positionen = Periodenleistung.

| Schritt | L (kumuliert) | Ziel-Einbehalt (5 % × L) | Bereits einbeh. | Perioden-Einbehalt | Steuer (19 % auf volles Netto) | Zahlbetrag | Summe Einbehalt |
|---|---|---|---|---|---|---|---|
| AR1 (L=100) | 100 | 5,00 | 0 | 5,00 | 19,00 | 119 − 5 = **114** | 5 |
| Teilzahlung | — | — | — | — | — | −50 (Zahlung, keine Faktura) | 5 |
| AR2 (Periode 100, L=200) | 200 | 10,00 | 5 | **5,00** | 19,00 | 119 − 5 = **114** | 10 |
| Nachtrag +100 (Periode 100, L=300) | 300 | 15,00 | 10 | **5,00** | 19,00 | **114** | 15 |

Σ Zahlbeträge AR1+AR2 = 228 bei kumuliert 10 Einbehalt. Der alte Bug (15) ist damit
ausgeschlossen. **Der Planwert „AR2 = 109 €" ist falsch** (ergäbe sich nur durch Abzug
des kumulativen Ziels statt des Perioden-Einbehalts — also genau der alte
Doppelzählungs-Bug); die Implementierung mit 114 € ist korrekt. Beleg: BauGrid
„Abschlagsrechnung VOB/B: kumulativ" (Gesamtleistung ausweisen, bisherige Abschläge
abziehen, Einbehalt je Rechnung bis Sicherheitssumme) und VOB/B § 17 Abs. 6 Nr. 1
(max. 10 % Kürzung je Zahlung bis Sicherheitssumme). → Hinweis H-3, kein Code-Mangel.

Steuerprobe: `steuerpflichtigesNetto = nettoNachRabatt − Verrechnungen`
(`controllers/InvoiceController.js:156-159`), Einbehalt mindert die Steuer **nicht** —
konform zu § 13 UStG (Steuer auf vereinbartes Entgelt) und VOB/B § 17 Abs. 6 S. 2
(bei § 13b bleibt USt bei Einbehaltsberechnung unberücksichtigt). Test
`P0.2 Steuer trotz Einbehalt` grün. → OK.

---

## 2. Befundtabelle

Legende Entscheidung: **OK** = abgenommen. **NACHBESSERUNG NÖTIG** = vor Freigabe zu
beheben (Schwere P0-blockierend / P1 / Hinweis).

### 2.1 P0-blockierend (7)

| # | Befund | Schwere | Datei:Zeile | Beweis | Normquelle / Planstelle | Entscheidung |
|---|---|---|---|---|---|---|
| B-1 | XRechnung-3.0-URN nutzt den **2.x-Namensraum** (`…urn:xoev-de:kosit:standard:xrechnung_3.0`) — für 3.x **ungültig**, führt zur Abweisung (Regel BR-DE-21, zeichengenauer `CustomizationID`-/BT-24-Check). Richtig wäre `urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0`. Die Tests prüfen nur Substring `xrechnung_3.0` und fangen den falschen Namespace nicht. | P0-blockierend | `js/einvoice.js:6`, `:320`, `:339`; `tests/erechnung_belegfixierung.test.js:11-15,45-47` | `GUIDELINE_XRECHNUNG_30 = '…urn:xoev-de:kosit:standard:xrechnung_3.0'`; Solytics (2026-07-15): „Falsch: 2.x-Namensraum in einer 3.x-Rechnung"; invoicenavigator BR-DE-21: gültig nur `…urn:xeinkauf.de:kosit:xrechnung_3.0`; XRechnung-Spec 3.0.2 (xeinkauf.de): „Kennung CIUS XRechnung: urn:…:urn:xeinkauf.de:kosit:xrechnung_3.0". Eigene 2.3-Spec zum Vergleich: `…urn:xoev-de:kosit:standard:xrechnung_2.3` — der Code hat also nur das Suffix getauscht. | XRechnung-Spezifikation 3.0.2 (KoSIT, xeinkauf.de); BR-DE-21; Plan P0.4.2 („kein reiner String-Tausch") | **NACHBESSERUNG NÖTIG** |
| B-2 | **Kein externer KoSIT-/veraPDF-Nachweis.** Plan-Acceptance P0.4 verlangt Fixture-Matrix gegen KoSIT-Validator Bundle 3.0.2 + veraPDF mit archivierten Vollberichten. Zugegeben offen („hier nicht ausgeführt"), nur Checkliste. Zusammen mit B-1 ist „XRechnung 3.0" damit eine unbelegte Behauptung. | P0-blockierend | `doc/session_summary_…:46`; `doc/release/checklist.md:23-27` (ungeprüft) | Summary: „Offen: externer KoSIT-Validator (Bundle 3.0.2) + veraPDF-Lauf … nicht ausgeführt". | Plan P0.4 Acceptance („Alle Fixtures bestehen KoSIT-Bundle-3.0.2-Prüfung … Berichte im Release-Archiv") | **NACHBESSERUNG NÖTIG** |
| B-3 | `collectERechnungExportData()` ist **nicht belegfixiert**: belegId-Gate prüft nur Existenz/Status (`js/editor.js:954-965`), aber `currentDoc` (netto/steuer/brutto/positionen/verrechnungen) wird weiter aus **DOM + `state.currentRechnungTotals`** gebaut (`:966-1006`) — nicht aus dem gespeicherten DB-Beleg. Formular nach dem Speichern ändern → Export mit gespeicherter ID, aber ungespeicherten Zahlen. Main-IPC (`main.js:1050ff,1145ff`) empfängt dasselbe Formular-`doc`. Plan P0.4.1 („lädt den Beleg aus der DB statt aus DOM-Feldern") nicht umgesetzt; `PDF == XML == DB` unbewiesen. | P0-blockierend | `js/editor.js:951-1009`; `main.js:1055-1061,1160-1166` | Codezitat `:985-996`: `netto: state.currentRechnungTotals ? … : 0, … positionen: [...(state.currentRechnungPositionen \|\| [])]` — keine DB-Lesung von `savedDoc` (wird nur für Statusprüfung verwendet, `:962`). | Plan P0.4.1; Plan-Acceptance „Abgleich-Test: PDF == XML == DB" | **NACHBESSERUNG NÖTIG** |
| B-4 | **EXECUTION-Deckel im Formular wirkungslos.** `calculateRechnungTotals()` übergibt nur `{ previousInvoices }` (`js/editor.js:1542`); `getFormData()` (`views/InvoiceView.js:142-171`) kennt `retentionMode`/`contractTotalNet`/`totalPerformanceNet` gar nicht → Controller-Defaults `WARRANTY`/`0`/`null` (`controllers/InvoiceController.js:30-37`). Folge: `maxRetentionCap`-Pfad (`:135-143`) und VOB/A-§9c-Hinweis (`:133`) im Echt-Formular nie aktiv; kumulative Basis nur approximiert (`:123-127`: aktuelles Netto + Σ Vorgänger-`netto`). Unit-Tests übergeben die Opts explizit und sind grün — sie testen nicht den UI-Pfad. | P0-blockierend | `js/editor.js:1520-1543`; `views/InvoiceView.js:159-171`; `controllers/InvoiceController.js:117-146` | Diff belegt: `handleInputEvent(…, { previousInvoices })` — kein `retentionMode`, kein `contractTotalNet`, kein `totalPerformanceNet`. `getFormData`-Return enthält diese Felder nicht. | Plan P0.2.1/2.2 („Editor übergibt … zusätzlich previousRetentionTotal … aus gespeicherten Belegen"; „genau ein Einbehalt-Codepfad" inkl. Deckel) | **NACHBESSERUNG NÖTIG** |
| B-5 | **Vorgänger-Filter ohne Typ-/Status-Filter.** `previousInvoices = docs.filter(d => projektId-Match && id != curId)` (`js/editor.js:1527-1530`) zieht **alle** Projektdokumente heran: Angebote, Schlussrechnungen, Stornos/Gutschriften (negatives Netto!), Folge-Abschläge. Diese verfälschen kumulative Basis (`InvoiceController.js:125-127`) und `sumPreviousRetention()` (`:258-262`). Echte Kette nach Storno/Schlussrechnung rechnet falsch. | P0-blockierend | `js/editor.js:1525-1530`; `controllers/InvoiceController.js:42-44,125-127,258-262` | Filter prüft nur `projektId`/`id`; kein `type === 'rechnung'`, kein Status-Ausschluss (`Storniert`, `Entwurf`, Angebotstypen). | Plan P0.2.2 („Summe Einbehalte aller Vorgänger-Abschläge desselben Projekts"); Fachlogik kumulative AR (BauGrid: nur Abschlagszahlungen abziehen) | **NACHBESSERUNG NÖTIG** |
| B-6 | **Sperrlücke Aufmaß-Übergabe.** Renderer blockiert nur `isLocked/Storniert/Bezahlt` (`js/projekte.js: Sperrcheck nach loadDoc`) — **nicht** `Festgeschrieben` ohne Lock, nicht `Überfällig`/`Ausstehend`-misuse. DB-Guard (`db.js:applyDocumentWrite :106-118`) greift nur bei `existing.isLocked`. Ergebnis: festgeschriebener-aber-unlocked Beleg per Aufmaß überschreibbar — Verstoß gegen Plan P0.3.3 („gesperrte/festgeschriebene Belege lehnen jede Übergabe ab, Prüfung in Renderer **und** Main/IPC"). Main-/IPC-Guard für Übergabe fehlt (nur `saveDocument`-GoBD-Hash, statusblind). | P0-blockierend | `js/projekte.js` (`executeAufmassUebergabe`, Sperr-`if`); `db.js:106-118` | Renderer-Cond: `doc.isLocked \|\| status === 'Storniert' \|\| status === 'Bezahlt'` — `Festgeschrieben` fehlt. DB-Cond: `if (existingWasLocked)` — statusblind. | Plan P0.3.3; GoBD-Änderungssperre | **NACHBESSERUNG NÖTIG** |
| B-7 | **Kein echter Persistenz-/Reload-Nachweis für Übergaben.** `tests/uebergaben_persistenz.test.js` prüft nur **String-Vorkommen** (`saveDocument` vor `success`-Toast, Feldnamen) und eine Dedupe-**Simulation** — kein IPC-`save→get→reload`, kein `SELECT`-Nachweis, kein Sperr-Integrationstest. Kritisch: `applyApprovedNachtraegeToCurrentInvoice` ohne Rechnungs-ID persistiert **nichts** (nur `getFullState`-Read, Positionen bleiben Speicher-State → Reload-Verlust). Plan-Acceptance („gespeicherter Beleg per SELECT nachweisbar", „Reload-Test App-Neustart") damit nicht erfüllt. | P0-blockierend | `tests/uebergaben_persistenz.test.js:26-76`; `js/projekte.js` (`applyApproved…`: `if (curId …) await saveRechnung(); else … getFullState` + `added: 0, prepared`-Zweig) | Testmethode: `fnBody()` + `body.includes(...)` — kein DB-, kein IPC-, kein Reload-Test. Code: Ohne `curId` kein Schreibaufruf. | Plan P0.3 Acceptance; Plan-Tests („Integration IPC save→get→reload … E2E-Desktop") | **NACHBESSERUNG NÖTIG** |

### 2.2 P1 (6)

| # | Befund | Schwere | Datei:Zeile | Beweis | Normquelle / Planstelle | Entscheidung |
|---|---|---|---|---|---|---|
| B-8 | `computeProjectBalance`: `offenerSaldo = Σ Zahlbeträge − Σ Zahlungen − freigegebene Einbehalte` (`controllers/InvoiceController.js:274`). Betriebswirtschaftlich fragwürdig: freigegebener Einbehalt begründet (per Freigabe-Beleg) eine **neue** Forderung — Subtraktion tilgt scheinbar Saldo (Test: 228 − 218 − 10 = 0). Ohne Freigabe-Beleg in `invoices` ist die Formel falsch herum; mit Beleg wäre sie Doppelzählung. Plan-Formel wird zementiert statt geklärt. | P1 | `controllers/InvoiceController.js:268-276`; `tests/cumulative_retention_chain.test.js:61-70` | Test `nachFreigabe.offenerSaldo === 0` bei `paymentsTotal: 218, released: 10` ohne Freigabe-Beleg in der Liste. | Plan P0.2.3 („Zahlbetrag/Saldo berücksichtigt zusätzlich Zahlungen und Einbehalt-Freigaben"); OPOS-Definition | **NACHBESSERUNG NÖTIG** |
| B-9 | Belegfixierung ist **umgehbar**: `generateXRechnungXML`/`buildCII` rufen `assertExportfaehigerBeleg()` nie auf (`js/einvoice.js:338-361` — Gate steht isoliert daneben). Jeder Aufrufer kann versandfähiges XML aus Entwurfsdaten erzeugen. Defense in Depth fehlt. | P1 | `js/einvoice.js:338-340` vs `:347-361` | `generateXRechnungXML` → direkt `buildCII(…, GUIDELINE_…)` ohne Gate. | Plan P0.4.4 („ungültige Exporte werden blockiert") | **NACHBESSERUNG NÖTIG** |
| B-10 | Nachtrags-Idempotenz-Key `N:nachtrag_id:name` kollidiert bei zwei Positionen gleichen Namens aus demselben Nachtrag (zweite wird fälschlich übersprungen); kein `GENEHMIGT`-Re-Check zum Merge-Zeitpunkt; Mutierung von `state.currentRechnungPositionen` auch bei gesperrter aktueller Rechnung (Fehler erst beim späteren `saveRechnung`). | P1 | `js/projekte.js` (`applyApproved…`: `existingKeys`-Block) | Key: `` `N:${p.nachtrag_id}:${p.name}` `` — positionsindex-los. Kein Lock-Check vor Push. | Plan P0.3.2 (Idempotenz-Key `nachtrag_id` pro Rechnung — positionsgenau gefordert) | **NACHBESSERUNG NÖTIG** |
| B-11 | `CREATE_NEW`-Aufmaßentwurf mit `kundeId: null`, `preis: 0`-Fallback (`parseFloat(a.einheitspreis) \|\| 0`), `nr: null` — invalide Entwürfe werden **gespeichert** statt validiert/blockiert (`validateSaveDocument` verlangt kundeId + Positionen). | P1 | `js/projekte.js` (`CREATE_NEW`-Zweig, `entwurf`-Objekt) | `kundeId: null`, `preis: … \|\| 0`, danach `saveDocument(entwurf)` ohne Validierung. | `controllers/InvoiceController.js:281-313` (Save-Validierung) | **NACHBESSERUNG NÖTIG** |
| B-12 | Neue Negativmatrix erfüllt Plan-Buchstaben, nicht -Geist: P0.1/4 testet nur Traversal-**Header** (`X-Photo-Uuid: ../evil` → 400), **kein** Symlink-Upload-Root, kein Dotfile, keine Limits (Größe/Typ/Anzahl); kein `> 8 Streams → 429`-Test; kein WS-Handshake-Negativtest; kein TLS-Opt-in-Negativtest in der neuen Suite (Alt-Suites decken Host/Origin/Rate-Limits ab, sind aber unter System-Node ABI-rot). „Statischer Router-Check: jede neue Route fällt per Default durch Auth" (Plan-Acceptance) fehlt als Test. | P1 | `tests/sync_p0_negativmatrix.test.js:126-158`; `main/sync-server.js:623,413` | Test 4 assertet `[400,401,403].includes(status)` auf Header-Ebene; kein `lstat`-Symlink-, kein 429-, kein WS-Test in der Datei. | Plan P0.1.2/1.3 + Acceptance („mind. 6 neue Negativtests … Symlink-Upload, SSE-ohne-Auth, Stopp-Revoke"; „statischer Router-Check") | **NACHBESSERUNG NÖTIG** |
| B-13 | `experimental_module`-Flag ist **in keiner Einstellungs-UI auffindbar** (Repo-weite Suche: nur `js/navigation.js:185-187` liest es; kein Setter, kein Checkbox-/Settings-Eintrag, keine Doku). Opt-in „pro Arbeitsplatz" (Plan) de facto nicht erreichbar; `switchView()` erzwingt Fokusmodus nicht (Deep-Link auf versteckte Views weiter möglich — als Design-Entscheidung ok, aber undokumentiert). E2E-Klickpfad „ohne Rücksprung ins Hauptmenü" fehlt (Test assertet nur Sichtbarkeitsmengen). | P1 | `js/navigation.js:168-216`; `tests/ui_fokusmodus.test.js` | Grep `experimental` in `js/`: nur navigation.js-Treffer. Test 3 prüft `Set`-Enthaltensein, keinen Navigationspfad. | Plan P0.6 Acceptance | **NACHBESSERUNG NÖTIG** |

### 2.3 Hinweise (3)

| # | Befund | Schwere | Datei:Zeile | Beweis | Normquelle | Entscheidung |
|---|---|---|---|---|---|---|
| H-1 | Einbehalt-Basis **fix netto** (`cumulativeBase × rate`). Vertragsabhängig: Bauprofessor/VOB Praxis kennt netto- wie brutto-Basis; zwingend netto nur bei § 13b (VOB/B § 17 Abs. 6 S. 2: „bleibt die Umsatzsteuer … unberücksichtigt"). Keine Basis-Option im Vertrag/Formular. Solange Verträge Netto-Basis vorsehen, korrekt — sonst systematisch 19 % zu wenig Einbehalt. | Hinweis | `controllers/InvoiceController.js:122-128`; `CumulativeBillingController.js:57,72` | Keine `retentionBase`-Option; Tests erwarten 5,00 auf 100 netto. | VOB/B § 17 Abs. 6 (dejure.org); Bauprofessor „Sicherheitseinbehalt nach VOB"; BauGrid-Beispiel (brutto-Basis möglich) | **NACHBESSERUNG NÖTIG** (P1-Kandidat bei Pilot mit Brutto-Verträgen) |
| H-2 | Dead Code in `assertExportfaehigerBeleg`: `finalStatus`-Array wird berechnet, dann `void finalStatus` (`js/einvoice.js:355-359`). Inkonsistenz: locked+`Ausstehend` passiert, unlocked+`Bezahlt` wird blockiert. Regel klären (empfohlen: `locked \|\| status === 'Festgeschrieben'` explizit + Freigabe-Belege einschließen) und toten Code entfernen. | Hinweis | `js/einvoice.js:347-361`; `main.js:1058-1061,1162-1165` (gleiche Logik) | `void finalStatus;` im Code. | — (Codehygiene) | **NACHBESSERUNG NÖTIG** |
| H-3 | Planwert AR2-Zahlbetrag **109 € ist falsch**, Implementierung 114 € korrekt (s. § 1). Plan und Summary dokumentieren die Abweichung ehrlich — hiermit bestätigt: kein Code-Mangel, Planfehler. Release-Notes müssen den korrekten Wert 114 € tragen. | Hinweis | Plan P0.2 Zeile 79; Summary Zeile 20 | Nachrechnung § 1: Perioden-Brutto 119 − Perioden-Einbehalt 5 = 114. 109 ergäbe Doppelzählung des Vorgänger-Einbehalts. | BauGrid kumulative AR; VOB/B § 17 Abs. 6 | **OK** (Code), Planwert verwerfen |

### 2.4 OK-Vermerke (abgenommen, nicht angezählt)

| # | Befund | Datei:Zeile | Entscheidung |
|---|---|---|---|
| O-1 | Steuer trotz Einbehalt auf vollem Netto; `Netto + Steuer == Brutto` je Beleg; `Σ Periodeneinbehalte == kumulatives Ziel`; EXECUTION-Deckel + VOB/A-Hinweis im Controller (Unit-Ebene). 60/60 P0-relevante Tests grün (eigener Lauf: cumulative/uebergaben/erechnung/fokus/invoice/retention/bau_erp/zugferd). | `controllers/InvoiceController.js:148-226`; Tests s. § 4 | **OK** |
| O-2 | Sync-Auth-Matrix im Code: `authenticate()` vor Body/DB/File für alle `/api/v1/sync/*`-Routen (`sync-server.js:593`), 401/403-Trennung (`:303-314`), `bindBodyIdentity` inkl. Mutations-Identitätsbindung (`:377-402`), Token-Einmalverbrauch vor Session-Erstellung (`:678-679`), Foto-Härtung (Symlink/TOCTOU/No-Replace/Hash, `:981-1092`), WS-Auth (`:407-413`), TLS-Opt-in-Validierung (`sync-config.js:21-33`). Negativmatrix 6/6 grün unter Electron-Runtime (eigener Lauf). | `main/sync-server.js`, `main/sync-config.js` | **OK** (Code; Testhärtung s. B-12) |
| O-3 | DB-GoBD-Guard: gesperrte Belege nur Status-änderbar, Inhaltsänderung wirft; Entsperren nur via `entsperreBeleg()` mit Audit (`db.js:106-118, 895-906`). Renderer-Sperrprüfung als Zusatz korrekt bezeichnet. | `db.js:82-118` | **OK** (Lücke s. B-6 betrifft Status-ohne-Lock, nicht den Guard selbst) |
| O-4 | Fokusmodus löscht nichts (`viewConfig` unversehrt, reine `display`-Blendung, State bleibt) — Test grün. | `js/navigation.js:198-216` | **OK** (Erreichbarkeit/Doku s. B-13) |

---

## 3. Top-5 Nachbesserungen (Reihenfolge = Freigabepfad)

1. **XRechnung-Kennung korrigieren + extern validieren (B-1, B-2).**
   `GUIDELINE_XRECHNUNG_30` → `urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0`
   (Quelle: XRechnung-Spec 3.0.2, xeinkauf.de). Danach Fixture-Matrix
   (B2B / § 13b / B2G-Leitweg-ID / Schlussrechnung mit Einbehalt / Storno) gegen
   **KoSIT-Validator Bundle 3.0.2 (Fassung 31.01.2026)** + ZUGFeRD via veraPDF (PDF/A-3);
   Vollberichte unter `doc/release/` archivieren. Tests müssen die exakte URN
   assertieren (BR-DE-21), nicht nur einen Substring.
2. **Export aus der DB laden (B-3).** `collectERechnungExportData(belegId)` lädt den
   festgeschriebenen Beleg (Positionen, Summen, Steuer, Leitweg-ID, Daten) aus der DB;
   Formularwerte nur für die ENTWURF-Vorschau (Wasserzeichen, keine Datei). Neu:
   Abgleich-Test `PDF(Zahlbetrag, Nr., Datum, Leitweg-ID) == XML == DB` je Fixture.
3. **Kumulativ-Parameter im UI-Pfad vervollständigen (B-4, B-5).**
   `getFormData`/`calculateRechnungTotals` übergeben `retentionMode`,
   `contractTotalNet`, `totalPerformanceNet` aus Projekt-/Belegdaten; Vorgänger-Filter
   auf `type === 'rechnung'` + Status (kein Entwurf/Storno/Angebot). Regressionstest
   auf UI-Pfad-Ebene (nicht nur Controller-Unit).
4. **Sperrlogik schließen (B-6) + echte Persistenztests (B-7).**
   Übergabe lehnt `Festgeschrieben` (auch ohne Lock) ab — Renderer **und** Main/IPC;
   Nachtragsübernahme persistiert oder meldet explizit „nicht gespeichert";
   `uebergaben_persistenz.test.js` durch IPC-`save→get→reload`-Integration ersetzen
   (statt String-`includes`), inkl. Doppel-Übernahme- und Sperr-Negativtest gegen echte Test-DB.
5. **OPOS-Freigabe klären + Gates härten (B-8, B-9).**
   Freigabe-Modell festlegen (Freigabe-Beleg in `invoices` vs. Kennzahl) und
   `computeProjectBalance`-Formel + Test daran ausrichten; `assertExportfaehigerBeleg`
   in `buildCII`-Pfad (oder Main-Handler zentral) erzwingen; H-2-Totcode entfernen.

---

## 4. Testprotokoll (eigene Läufe, 10.09.2026)

- **P0-Suites (System-Node):**
  `cumulative_retention_chain` + `uebergaben_persistenz` + `erechnung_belegfixierung` +
  `ui_fokusmodus` + `invoice_controller` + `retention_vob_rules` + `bau_erp` +
  `zugferd` → **60/60 grün, 0 fail** (eigener `node --test`-Lauf).
- **`npm test` (System-Node, `cmd /c npm test`): 284 pass / 20 fail von 304** —
  deckt sich mit der Summary-Behauptung (284/304). Aufschlüsselung der 20 Fehler
  (alle Stacks beginnen beim `require('better-sqlite3')` bzw. `openssl`-Aufruf,
  also **vor** jeglichem P0-Code):
  19 × `ERR_DLOPEN_FAILED` (`better-sqlite3` kompiliert für Electron-Runtime
  `NODE_MODULE_VERSION 128`, System-Node verlangt 127): 12 ×
  `sync_server_security`, 6 × `sync_p0_negativmatrix`, 1 × `sync_client_security`;
  1 × fehlendes `openssl`-Binary (`sync_server_security` TLS-Listener-Test).
- **Gegenprobe „vorbestehend" ohne riskanten `git stash`:**
  `tests/sync_server_security.test.js` ist von den P0-Änderungen **unberührt**
  (`git diff --stat HEAD` listet die Datei nicht) und scheitert isoliert
  (`node --test tests/sync_server_security.test.js`: 13/14 fail, identische
  ABI-/openssl-Fehler). Der Fehler liegt in der Test-Runtime, nicht im P0-Code —
  eine Stash-Gegenprobe würde dasselbe zeigen und wurde daher nicht benötigt
  (kein uncommitteter Stand gefährdet).
- **Electron-as-Node (`ELECTRON_RUN_AS_NODE=1`, `electron.cmd --test`):**
  `tests/sync_p0_negativmatrix.test.js` → **6/6 grün**. Auth-Matrix-Code damit auch
  zur Laufzeit verifiziert.

---

## 5. Norm- und Fachquellen (für die rot markierten Abweichungen)

- **VOB/B § 17 Sicherheitsleistung** (dejure.org/gesetze/VOB-B/17.html):
  Abs. 6 Nr. 1 — Einbehalt in Teilbeträgen „jeweils … um höchstens 10 v. H.",
  „bis die vereinbarte Sicherheitssumme erreicht ist"; bei §-13b-Rechnungen
  „bleibt die Umsatzsteuer … unberücksichtigt"; Einzahlung binnen 18 Werktagen
  aufs Sperrkonto. Stützt kumulative Verrechnung + Steuer-vor-Einbehalt.
- **Bauprofessor** (bauprofessor.de/sicherheitseinbehalt-vob): 10-%-Rahmen je
  Abschlagszahlung bis Sicherheitssumme; VHB-Bund: 5 % Vertragserfüllung (ab
  250 T€ Auftragswert), 3 % Mängelansprüche.
- **BauGrid** (baugrid.de/blog/abschlagsrechnung-vob-b-kumulativ, 2026-04-19):
  kumulative AR = Gesamtleistung ausweisen, bisherige Abschlagszahlungen (brutto)
  abziehen; Einbehalt bis vereinbarte Höhe; Schlussrechnung gleiche Logik.
  Stützt 114-€-Korrektur (§ 1) und B-5 (nur Abschläge abziehen).
- **XRechnung 3.0 / KoSIT-Bundle 3.0.2** (xeinkauf.de/dokumente, /versionen-und-bundles,
  FAQ): 3.0 in Kraft seit 01.02.2024, 2.3 außer Kraft; Bundle 3.0.2 Winter-2025/26-Bugfix,
  Fassung 31.01.2026. CIUS-Kennung: `urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0`
  (Spec 3.0.2, S. 1). Stützt B-1/B-2.
- **BR-DE-21 / Namespace-Wechsel** (solytics.de/blog/xrechnung-implementieren,
  2026-07-15; invoicenavigator.eu/errors/br-de-21): „Seit XRechnung 3.0 lautet der
  Namensraum `xeinkauf.de:kosit:xrechnung_`. … `xoev-de:kosit:standard:xrechnung_` …
  ist für 3.x ungültig"; Regel BR-DE-21 prüft zeichengenau, Abweichung → Ablehnung.
  Direkter Beleg für B-1 (P0-blockierend).

---

## 6. Offene P0.5-/P1-Punkte (keine neuen Befunde, zur Vollständigkeit)

Windows-Frisch-/Update-Test, Backup-Restore-Satzvergleich, E2E-Happy-Path mit
Neustart, Sync-Smoke-Protokoll: als manuelle Checkliste vorhanden
(`doc/release/checklist.md`), aber unabgearbeitet — Freigabe erst nach Abarbeitung
**und** nach Behebung von B-1…B-7. Geparkte `plans/`-Module bleiben geparkt
(kein Verstoß festgestellt); kein Frameworkwechsel, kein File-Share-Multiuser.

---

*Ende des Prüfberichts. Urteil: FREIGABE NEIN — 7 P0-blockierend, 6 P1, 3 Hinweise.
Freigabepfad: § 3, Punkte 1–5, in dieser Reihenfolge.*
