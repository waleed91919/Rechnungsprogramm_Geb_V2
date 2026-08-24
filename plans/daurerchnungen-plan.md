# PLAN F2 – WIEDERKEHRENDE/DAUERRECHNUNGEN & SAMMELRECHNUNGEN

**Version:** 1.0 (Erstplan, 24.08.2026)
**Autor:** Subagent „Gebäude-Planung" gemäß `.opencode/agent/gebaeude-planung.md`
**Umsetzer:** Code-Subagent „gebaeude-code"
**Voraussetzung:** Plan F1 (`plans/objektverwaltung-plan.md`) ist umgesetzt – insbesondere Tabellen `liegenschaften/gebaeude/etagen/raeume`, `dokumente.objekt_typ/objekt_id`, `ObjektController.resolveEmpfaenger`, View-Tab „Abrechnungspläne" im Objektdetail.

---

## 0. Ziel & Scope

- **Abrechnungspläne je Objekt:** monatlich/quartalsweise/jährlich/Wochenintervall, mit Start-/Enddatum und Leistungszeitraum-Logik.
- **Automatische Rechnungsgenerierung:** fällige Pläne erzeugen Belege vom Typ `type='rechnung'`, `rechnungsart='REGULAER'` über den BESTEHenden Schreibpfad (`applyDocumentWrite` → SHA-256-Hash + audit_logs-Kette). Auto-Trigger beim App-Start (Desktop-App ohne Hintergrunddienst).
- **Sammelrechnung je Eigentümer:** mehrere fällige Läufe unterschiedlicher Objekte desselben Empfängers → EINE Rechnung.
- **Storno/Löschen geplanter Läufe** mit GoBD-konformer Protokollierung.
- **NICHT im Scope:** Putzplan/LV (F3), Zeiterfassung (F4), E-Mail-Versand (F10), SEPA (F8).

**Wiederverwendung statt Neubau:** Summen via `InvoiceController.calculateTotals` (controllers/InvoiceController.js:24), Speichern via `dbAPI.saveDocument` (db.js:462, inkl. GoBD-Sperre/Hash/Audit), Storno via bestehendem Storno-Pfad (`storniereRechnung`, db.js:699), Nummernkreis wie Rechnungseditor (`INV-<Jahr>-<NNN>`, js/editor.js:141–143).

---

## 1. DB-SCHEMA

### 1.1 Konventionen

Identisch zu F1: neue Tabellen in `schema.js::createSchema` als `CREATE TABLE IF NOT EXISTS`; KEINE Bestands-ALTERs nötig außer dokumente.rechnungsart-Wert (Spalte existiert bereits als freies TEXT DEFAULT 'REGULAER', schema.js:421 → neuer Wert `'SAMMELRECHNUNG'` braucht KEINE Migration, nur Doku + UI-Badge). Migrations-Marker-Kommentar: **„Migration Dauerrechnungen F2: Tabellen abrechnungsplaene / abrechnungsplan_positionen / dauerrechnung_laeufe"**.

### 1.2 Tabelle `abrechnungsplaene`

| Spalte | Typ | NULL | Default | Anmerkung |
|---|---|---|---|---|
| id | INTEGER PK AUTOINCREMENT | NO | – | |
| name | TEXT NOT NULL | NO | – | z. B. „Unterhaltsreinigung Bürohaus" |
| objekt_typ | TEXT NOT NULL CHECK(objekt_typ IN ('LIEGENSCHAFT','GEBAEUDE','ETAGE','RAUM')) | NO | – | Plan hängt an JEDEM Knotentyp möglich (Liegenschaftspauschale bis Einzelraum Glasreinigung) |
| objekt_id | INTEGER NOT NULL | NO | – | polymorph, kein FK möglich; Löschschutz in delete*-Handlern (F1 §2.1 Muster) |
| empfaenger_kunde_id | INTEGER NOT NULL, FK → kunden(id) (NO ACTION) | NO | – | beim Speichern des Plans AUFGETAUT aus `resolveEmpfaenger` (F1); UI zeigt Herkunft; ändert sich der Objektstamm, muss der Plan neu gespeichert werden (bewusst eingefroren = GoBD-nachvollziehbar) |
| rhythmus | TEXT NOT NULL CHECK(rhythmus IN ('MONATLICH','QUARTALSWEISE','JAEHRLICH','WOCHEN_INTERVALL')) | NO | – | „Glasreinigung alle 3 Monate" = QUARTALSWEISE |
| intervall_wochen | INTEGER CHECK(intervall_wochen IS NULL OR intervall_wochen >= 1) | YES | NULL | nur WOCHEN_INTERVALL |
| abrechnungstag | INTEGER CHECK(abrechnungstag BETWEEN 1 AND 31) | NO | 1 | Tag des Monats; Monatsende-Clamp (31.→28./29./30.) |
| abrechnungsmonat | INTEGER CHECK(abrechnungsmonat IS NULL OR abrechnungsmonat BETWEEN 1 AND 12) | YES | NULL | nur JAEHRLICH |
| abrechnungs_modus | TEXT NOT NULL DEFAULT 'NACHTRAEGLICH' CHECK(abrechnungs_modus IN ('NACHTRAEGLICH','VORAUS')) | NO | 'NACHTRAEGLICH' | Leistungszeitraum rückwirkend (Reinigung) oder voraus (Miete/Wartung) |
| start_datum | TEXT NOT NULL (ISO-Datum) | NO | – | Anker + frühester Termin |
| ende_datum | TEXT (ISO-Datum oder NULL = unbefristet) | YES | NULL | letzter möglicher Rechnungstermin |
| preis_modus | TEXT NOT NULL DEFAULT 'PAUSCHALE' CHECK(preis_modus IN ('PAUSCHALE','POSITIONEN')) | NO | 'PAUSCHALE' | PAUSCHALE = ein Betrag; POSITIONEN = Zeilen aus 1.3 |
| pauschale_netto | REAL DEFAULT 0 | NO | 0 | nur PAUSCHALE |
| mwst_satz | INTEGER DEFAULT 19 CHECK(mwst_satz IN (0,7,19)) | NO | 19 | |
| zahlungsziel_tage | INTEGER DEFAULT 14 | NO | 14 | Default aus Einstellung zahlungsziel (js/editor.js:136) vorbelegt |
| als_entwurf | INTEGER DEFAULT 1 CHECK(als_entwurf IN (0,1)) | NO | 1 | 1 = generierte Belege status 'Entwurf' (isLocked=0) zur Prüfung; 0 = sofort fertiggestellt (isLocked=1) |
| naechste_lauf_am | TEXT | YES | NULL | gecachter nächster Termin (Neuberechnung bei jedem save/generate) |
| letzte_lauf_am | TEXT | YES | NULL | |
| aktiv | INTEGER DEFAULT 1 CHECK(aktiv IN (0,1)) | NO | 1 | Deaktivieren statt Löschen |
| bemerkung | TEXT | YES | NULL | |
| created_at | DATETIME DEFAULT CURRENT_TIMESTAMP | NO | – | |

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_abrechnungsplaene_objekt_name
    ON abrechnungsplaene(objekt_typ, objekt_id, name);
CREATE INDEX IF NOT EXISTS idx_abrechnungsplaene_empfaenger ON abrechnungsplaene(empfaenger_kunde_id);
CREATE INDEX IF NOT EXISTS idx_abrechnungsplaene_faellig ON abrechnungsplaene(aktiv, naechste_lauf_am);
```

### 1.3 Tabelle `abrechnungsplan_positionen`

| Spalte | Typ | NULL | Default |
|---|---|---|---|
| id | INTEGER PK AUTOINCREMENT | NO | – |
| plan_id | INTEGER NOT NULL, FK → abrechnungsplaene(id) **ON DELETE CASCADE** | NO | – |
| artikelId | INTEGER, FK → artikel(id); NULL wenn Freitextposition | YES | NULL |
| name | TEXT (Pflicht wenn artikelId NULL) – CHECK(artikelId IS NOT NULL OR (name IS NOT NULL AND TRIM(name) <> '')) | YES | NULL |
| menge | REAL DEFAULT 1 | NO | 1 |
| einheit | TEXT DEFAULT 'Stk.' | NO | 'Stk.' (Monat/m²/Stk.) |
| preis | REAL DEFAULT 0 | NO | 0 |
| mwst | INTEGER DEFAULT 19 | NO | 19 |
| sortier_index | INTEGER DEFAULT 0 | NO | 0 |

```sql
CREATE INDEX IF NOT EXISTS idx_plan_positionen_plan ON abrechnungsplan_positionen(plan_id);
```

**Preisquelle-Entscheidung:** `preis` wird beim Anlegen der Position als Snapshot aus `artikel.vk` vorbefüllt und DANACH eingefroren (kein Live-Zugriff auf artikel.vk bei Generierung). Begründung: planbare, gleichbleibende Dauerrechnungen; Preisänderung = Plan bearbeiten (auditierbarer Akt). Alternativ-Live-Modus bewusst verworfen (siehe Offene Fragen #3).

### 1.4 Tabelle `dauerrechnung_laeufe` (Lauf-/Generierungshistorie)

| Spalte | Typ | NULL | Default | Anmerkung |
|---|---|---|---|---|
| id | INTEGER PK AUTOINCREMENT | NO | – | |
| plan_id | INTEGER NOT NULL, FK → abrechnungsplaene(id) (**NO ACTION** – Lauf-Historie überlebt; Löschen eines Plans mit Läufen wird blockiert) | NO | – | |
| periode_von | TEXT NOT NULL (ISO) | NO | – | Leistungszeitraum von |
| periode_bis | TEXT NOT NULL (ISO) | NO | – | Leistungszeitraum bis |
| rechnungs_datum | TEXT NOT NULL (ISO) | NO | – | Stichtag/Belegdatum |
| faellig_am | TEXT | YES | NULL | rechnungs_datum + zahlungsziel_tage |
| status | TEXT NOT NULL DEFAULT 'ERSTELLT' CHECK(status IN ('ERSTELLT','STORNIERT')) | NO | 'ERSTELLT' | |
| dokument_id | INTEGER, FK → dokumente(id) (NO ACTION); bei Sammelrechnung zeigen MEHRERE Läufe auf dasselbe dokument (n:1) | YES | NULL | NULL nur theoretisch – Generierung legt Beleg+Lauf atomar an |
| erstellt_am | DATETIME DEFAULT CURRENT_TIMESTAMP | NO | – | |
| storno_grund | TEXT | YES | NULL | Pflicht bei STORNIERT (GoBD-Muster wie entsperreBeleg, db.js:670) |

```sql
-- Doppelgenerierung desselben Zeitraums verhindern; nach Storno darf der Zeitraum NEU generiert werden:
CREATE UNIQUE INDEX IF NOT EXISTS idx_laeufe_plan_periode_unique
    ON dauerrechnung_laeufe(plan_id, periode_von, periode_bis)
    WHERE status = 'ERSTELLT';
CREATE INDEX IF NOT EXISTS idx_laeufe_dokument ON dauerrechnung_laeufe(dokument_id);
CREATE INDEX IF NOT EXISTS idx_laeufe_plan ON dauerrechnung_laeufe(plan_id);
```

(Partial Index ist in SQLite/better-sqlite3 voll unterstützt.)

### 1.5 Erweiterungen Bestandstabellen

- `dokumente.rechnungsart`: neuer Wert **`SAMMELRECHNUNG`** neben REGULAER/TEILRECHNUNG/… (freies TEXT-Feld, keine Migration nötig). Sammelrechnung bekommt `objekt_typ=NULL, objekt_id=NULL` (spannt mehrere Objekte) – Zuordnung läuft über `dauerrechnung_laeufe.dokument_id`.
- `getFullState()` (db.js): ergänzt
  ```js
  state.abrechnungsplaene = await dbQuery('SELECT * FROM abrechnungsplaene ORDER BY name ASC');
  state.dauerrechnungLaeufe = await dbQuery('SELECT * FROM dauerrechnung_laeufe ORDER BY rechnungs_datum DESC');
  // positionen je Plan nested (Muster aufmasse/aufmass_positionen, db.js:266–272)
  ```
- `einstellungen`-Keys (seedDefaultData NICHT antasten – Keys werden lazy gelesen): `dauerrechnungen_auto_erstellen` ('true'/'false', Default 'true'), `dauerrechnungen_last_auto_run` (ISO-Datum des letzten Auto-Laufs).

---

## 2. IPC-API

Registrierung in `main.js::setupIpc()`, Abschnitt `// --- Dauerrechnungen (F2) ---`, mit `wrapHandler`; Spiegel in `preload.js`.

| Kanal | preload | Request-Payload | Response-Payload | Fehlerfälle |
|---|---|---|---|---|
| `db:getAbrechnungsplaene` | `getAbrechnungsplaene(filter?)` | `{objektTyp?, objektId?, aktiv?, nurFaellige?}` alle optional | `[{…plan, positionen:[…], objektPfad, empfaengerName}]` | – |
| `db:saveAbrechnungsplan` | `saveAbrechnungsplan(plan, positionen)` | `plan:{id?, name!, objekt_typ!, objekt_id!, rhythmus!, intervall_wochen?, abrechnungstag!, abrechnungsmonat?, abrechnungs_modus!, start_datum!, ende_datum?, preis_modus!, pauschale_netto?, mwst_satz!, zahlungsziel_tage!, als_entwurf!, aktiv?, bemerkung?}`, `positionen:[{id?, artikelId?, name?, menge!, einheit?, preis!, mwst!}]` | `{id, naechste_lauf_am}` | „Ungültige Plan-Daten" (Name/Objekt/Rhythmus/Start fehlt); „Wochenintervall benötigt Intervall >= 1"; „Jährlicher Rhythmus benötigt Abrechnungsmonat"; „POSITIONEN ohne Positionen"; „PAUSCHALE ohne Betrag > 0"; UNIQUE-Verstoß Objekt+Name → „Plan mit diesem Namen existiert für dieses Objekt bereits"; Empfänger nicht auflösbar → „Kein Rechnungsempfänger ermittelbar…" |
| `db:deleteAbrechnungsplan` | `deleteAbrechnungsplan(id)` | `id:number` | `{changes}` | „Plan hat Läufe und kann nicht gelöscht werden – bitte deaktivieren." |
| `db:updateAbrechnungsplanStatus` | `updateAbrechnungsplanStatus(id, aktiv)` | `id:number, aktiv:boolean` | `{success,id}` | „Ungültige Plan-ID" |
| `db:getPlanLaeufe` | `getPlanLaeufe(planId)` | `planId:number` | `[{…lauf, dokumentNr, dokumentBrutto, dokumentStatus}]` | „Ungültige Plan-ID" |
| `db:dauerrechnungenVorschau` | `dauerrechnungenVorschau(stichdatum?)` | optional ISO-Datum (Default heute) | `{ faellig:[{planId, planName, objektPfad, empfaengerKundeId, empfaengerName, rechnungsDatum, periodeVon, periodeBis, nettoErwartet, gruppeKundeId}], gesamtNetto }` gruppiert vorbereitet für Sammelrechnung-Auswahl | – |
| `db:generiereFaelligeRechnungen` | `generiereFaelligeRechnungen(optionen)` | `{planIds:number[] (optional, sonst alle fälligen), stichdatum?, sammelProKunde:boolean}` | `{ erstellt:[{planId, laufId, dokumentId, nr, brutto}], sammelrechnungen:[{dokumentId, nr, kundeId, anzahlLaeufe, brutto}], uebersprungen:[{planId, grund}] }` | pro Plan isoliert try/catch (ein Fehler stoppt nicht den Lauf): Grund z. B. „Kein Rechnungsempfänger", „Belegnummer bereits vergeben" |
| `db:generiereSammelrechnung` | `generiereSammelrechnung(payload)` | `{kundeId:number!, laufIds:number[]! (alle müssen ERSTELLT und unbelegt sein), rechnungsDatum?}` | `{dokumentId, nr, brutto}` | „Sammelrechnung benötigt mindestens 2 Läufe" (sonst normale Generierung erzwingen); Läufe unterschiedlicher `empfaenger_kunde_id` → „Alle Läufe müssen denselben Rechnungsempfänger haben."; Lauf bereits einem Beleg zugeordnet → „Lauf #x wurde bereits abgerechnet." |
| `db:storniereLauf` | `storniereLauf(laufId, grund)` | `laufId:number, grund:string!` | `{success, laufId, dokumentStorniert:boolean, stornoDokumentId?:number}` | „Storno ohne Begründung nicht erlaubt (GoBD)" (Muster db.js:673); siehe Logik §4.4 |
| `db:autoRunDauerrechnungen` | `dauerrechnungenAutoRun()` | – (Main prüft selbst `dauerrechnungen_last_auto_run`) | `{ausgefuehrt:boolean, erstellteAnzahl:number, grund?:string}` | nie werfen (Startup-Robustheit): Fehler → log + `{ausgefuehrt:false, grund:message}` |

Nummernvergabe (Hauptprozess, da Auto-Lauf ohne Renderer läuft): neue dbAPI-Hilfsfunktion `generateNaechsteRechnungsNr(db)` – spiegelt js/editor.js:140–144 exakt: Maxima der Zahl am Ende aller `dokumente.nr` mit `type='rechnung'` (Regex `/(\d+)\s*$/`) + 1 → `` `INV-${new Date().getFullYear()}-${String(n).padStart(3,'0')}` ``. Kollisionsschutz bleibt der UNIQUE-Index `idx_dokumente_nr_unique` + deutsche Fehlermeldung aus applyDocumentWrite (db.js:100).

---

## 3. UI-FLOW

### 3.1 Neue Top-Level-View `view-dauerrechnungen`

1. **Sidebar** unter „Objekte" (nach F1-Eintrag):
   ```html
   <a id="nav-dauerrechnungen" onclick="switchView('dauerrechnungen')" class="…bestehendes Muster…">
       <span class="material-symbols-outlined text-[20px] text-slate-400 group-hover:text-white">event_repeat</span>
       <span class="text-sm font-medium">Dauerrechnungen</span>
   </a>
   ```
2. **js/navigation.js:** `viewConfig.dauerrechnungen = { title:'Dauerrechnungen', subtitle:'Abrechnungspläne & Läufe', action: () => { if (typeof renderDauerrechnungen === 'function') renderDauerrechnungen(); } }`; `views`-Array += `'dauerrechnungen'`.
3. **Layout** (`<div id="view-dauerrechnungen" class="hidden flex-1 overflow-y-auto bg-slate-50/50 p-6">`):
   - **KPI-Zeile** (3 Karten): `kpi-plaene-aktiv` (aktive Pläne), `kpi-faellig-monat` (fällige Läufe diesen Monat), `kpi-umsatz-dauerrechnungen` (Σ Netto der Dauerrechnungs-Belege aktuellen Monat).
   - **Toolbar:** Suchfeld `search-plaene`, Filter-Select `filter-plaene-status` (Alle/Aktiv/Inaktiv/Fällig), Buttons: `+ Neuer Plan` (primary), `▶ Fällige generieren` (öffnet Vorschau-Modal), `🧾 Sammelrechnung erstellen` (öffnet Sammel-Modal), Checkbox/Umschalter `Auto-Erstellung beim Start` (persistiert `dauerrechnungen_auto_erstellen` via `saveEinstellung`).
   - **Pläne-Tabelle** `plaene-table-body`: `Name | Objekt (Pfad, Badge Typ) | Empfänger | Rhythmus (leserlich: „monatlich zum 01.", „alle 3 Monate", …) | Zeitraum (start–ende) | Betrag netto | Nächster Lauf | Status (Aktiv/Pausiert-Badge) | Aktionen (Bearbeiten, Läufe 📜, Jetzt generieren ▶, Pausieren/Fortsetzen ⏸, Löschen 🗑)`.
   - **Läufe-Panel** `laeufe-panel` (unter Tabelle, einblendbar): Historie des gewählten Plans: `Periode | Rechnungs-Nr (Link) | Datum | Fällig | Brutto | Status (ERSTELLT/STORNIERT-Badge) | Aktion (Storno nur wenn ERSTELLT)`.

### 3.2 Modal `plan-modal` (Formularfelder, IDs `plan-modal-*`)

- `plan-modal-name` (Text, Pflicht) · `plan-modal-objekt` (Select über Objektbaum mit Pfad-Label, Wert `${objektTyp}:${objektId}`) – Empfänger-Vorschauzeile `plan-modal-empfaenger-preview` (live via `ObjektController.resolveEmpfaenger`, zeigt „Eigentümer: Müller GmbH (direkt)" bzw. „geerbt von Liegenschaft X" oder roten Warnhinweis).
- Rhythmus-Fieldset: `plan-modal-rhythmus` (Select MONATLICH/QUARTALSWEISE/JAEHRLICH/WOCHEN_INTERVALL), bedingt: `plan-modal-abrechnungstag` (Number 1–31, Hinweis „31. wird auf Monatsende gekürzt"), `plan-modal-abrechnungsmonat` (Select 1–12, nur JAEHRLICH), `plan-modal-intervall-wochen` (Number ≥ 1, nur WOCHEN_INTERVALL); `plan-modal-modus` (Radio „nachträglich"/„im Voraus").
- Zeitraum: `plan-modal-start` (date, Pflicht), `plan-modal-ende` (date, leer=unbefristet).
- Preis-Fieldset: Radio `plan-modal-preis-modus` („Pauschale"/„Positionen"); Pauschale: `plan-modal-pauschale-netto` + `plan-modal-mwst` (Select 0/7/19); Positionen: Mini-Positioneditor `plan-modal-positionen-body` (Zeile: Artikel-Select (prefill vk/einheit/mwst) ODER Freitextname, Menge, Einheit, Preis, MwSt, Löschen; Button `+ Position`).
- Sonstiges: `plan-modal-zahlungsziel` (Number, Default aus Einstellung), `plan-modal-als-entwurf` (Checkbox „Als Entwurf erstellen (vor Buchung prüfen)", default an), `plan-modal-bemerkung` (Textarea).
- Speichern → `window.api.saveAbrechnungsplan(...)` → Antwort-`naechste_lauf_am` anzeigen → Liste neu.

### 3.3 Modals Generierung & Sammelrechnung

- **Vorschau-Modal `generierung-modal`:** Tabelle aller fälligen Läufe (aus `db:dauerrechnungenVorschau`) mit Checkboxen (vorselektiert), Spalten inkl. Empfänger + Periode + erwartetes Netto; Gruppenwechsel optisch je Empfänger; Footer Σ; Radio „Einzeln je Objekt" vs. „Sammelrechnung je Eigentümer (nur Gruppen mit ≥ 2 Läufen)"; Button „X Rechnungen jetzt erstellen". Ergebnisliste nach Ausführung (Nr, Brutto, Link öffnet Beleg).
- **Sammel-Modal `sammel-modal`:** Empfänger-Select (nur Kunden mit ≥ 2 offenen Läufen), Periodenanzeige der betroffenen Läufe (Checkboxen), Button „Sammelrechnung erstellen".
- **Storno-Dialog:** `dialog:confirm` mit Pflicht-Textfeld Begründung (Grund geht an `storniereLauf`).

### 3.4 Integration Objektdetail (F1-Vorbereitung füllen)

Tab `od-panel-abrechnungsplaene` (aus F1 Schritt 16): Liste der Pläne dieses Objekts (`db:getAbrechnungsplaene({objektTyp,objektId})`), kompakte Tabelle wie §3.1, Button `+ Plan anlegen` öffnet `plan-modal` mit vorbelegtem Objekt-Select (gesperrt). Läufe-Link springt zu `switchView('dauerrechnungen')` mit gefiltertem Panel.

Tailwind/Material-Stil durchgehend identisch zu bestehenden Views (Cards `bg-white border border-slate-200 rounded-md shadow-sm p-4`, Badges wie pd-status, dense-table).

---

## 4. GESCHÄFTSLOGIK DAURERCHNUNGEN

### 4.1 Rhythmus-Rechenkern (pure, testbar)

Neuer Controller `controllers/DauerrechnungController.js` (Node+Browser-Exports wie InvoiceController):

- `clampTag(jahr, monatIndex, tag)` → Date (tag 31 → Monatsende).
- `berechneNaechstenTermin(plan, abIsoDate)` → ISO|null: nächster Termintag STRICTLY AFTER `max(abIso, letzte_lauf_am)` gemäß Rhythmus (MONATLICH: clampTag(+1 Monat je Schritt ab start-Anker-Tag `abrechnungstag`; QUARTALSWEISE: +3 Monate; JAEHRLICH: `abrechnungsmonat`+`abrechnungstag`; WOCHEN_INTERVALL: start_datum + k·(7·intervall_wochen) Tage). Berücksichtigt `ende_datum` (Termin > Ende → null).
- `berechneLaufTermine(plan, vonIso, bisIso)` → `[{rechnungsDatum, periodeVon, periodeBis}]` für Vorschau/Test: alle Termine im Fenster.
- `berechneLeistungszeitraum(plan, rechnungsDatumIso)` → `{periodeVon, periodeBis}`:
  - NACHTRAEGLICH: das VORHERIGE Intervallfenster (MONATLICH: Kalendermonat vor dem Termin [1., Letzter]; QUARTALSWEISE/JAEHRLICH analog zurück; WOCHEN_INTERVALL: [termin − w Tage, termin − 1 Tag]).
  - VORAUS: das AB dem Termin laufende Fenster ([termin, termin + Fenster − 1]).
  - Fenster-Grenzen gegen `start_datum`/`ende_datum` clamppen.
- `berechnePositionsListe(plan, positionen)` → normalisierte Positionsarray (bei PAUSCHALE: `[{name: plan.name, menge:1, einheit:'pauschal', preis:pauschale_netto, mwst:plan.mwst_satz}]`; bei POSITIONEN: Kopien mit Sortierung).
- `gruppiereFuerSammelrechnung(faelligListe)` → Map kundeId → Läufe (≥2 relevant).

### 4.2 Generierungslogik (Hauptprozess, atomar)

In `db.js::dbAPI` neue Funktion `erzeugeRechnungAusLauf(plan, lauf)` – alles innerhalb `db.transaction`:

1. Positionsliste aus 4.1; Summen via `InvoiceController.calculateTotals({positionen, mode:'netto', globalRabatt:{value:0,type:'%'}, anzahlung:0})` → `nettoNachRabatt/totalTax/bruttoNachRabatt/zahlbetrag`.
2. Dokument-Objekt bauen: `{ type:'rechnung', nr: generateNaechsteRechnungsNr(), datum: rechnungs_datum, faellig: faellig_am, kundeId: plan.empfaenger_kunde_id, projektId: null, objekt_typ/objekt_id: aus Plan, rechnungsart:'REGULAER', leistungszeitraum_von: periode_von, leistungszeitraum_bis: periode_bis, vortext: optional 'Dauerrechnung laut Abrechnungsplan "<name>"', status: als_entwurf ? 'Entwurf' : 'Ausstehend', isLocked: !als_entwurf, positionen, netto/steuer/brutto/zahlbetrag }`.
3. `applyDocumentWrite(doc, isLockedInt)` aufrufen (KEIN verschachteltes db.transaction – Funktionsmuster wie storniereRechnung db.js:707!) → GoBD-Hash + Audit `DOCUMENT/ERSTELLT` automatisch.
4. Lauf-INSERT in `dauerrechnung_laeufe` (dokument_id gesetzt). Partial-Unique-Index blockt Doppelgenerierung → Fehler „Zeitraum bereits abgerechnet".
5. Plan-Update: `letzte_lauf_am = rechnungs_datum`, `naechste_lauf_am = berechneNaechstenTermin(plan, heute)`.
6. Zusätzlicher Audit-Eintrag `entityType:'ABRECHNUNGSPLAN', entityId:plan.id, action:'LAUF_ERSTELLT', details:{laufId, dokumentId, nr, periodeVon, periodeBis, brutto}` (gleiche Transaktion).

**Sammelrechnung** `erzeugeSammelrechnung(kundeId, laeufe)` – eine Transaktion:
1. Validierung (§2 Kanaltabelle): alle Läufe ERSTELLT, dokument_id NULL, gleicher Empfänger, ≥ 2 Läufe.
2. Positionslisten ALLER Läufe konkatenieren, Positionsname prefix `[${ObjektController.buildPfad(...) }] ${originalname}` (Objektzuordnung sichtbar auf dem PDF – Hausverwaltungs-Anforderung).
3. EIN Dokument: `rechnungsart:'SAMMELRECHNUNG'`, `kundeId:kundeId`, `objekt_typ/objekt_id:NULL`, `leistungszeitraum_von/bis = min/max aller Perioden`, Nr via generateNaechsteRechnungsNr, Summen via calculateTotals.
4. ALLE beteiligten Läufe updaten (`dokument_id=SammelId`); je Lauf Audit `LAUF_IN_SAMMELRECHNUNG:{sammelDokumentId,nr}`; Dokument-Audit entsteht automatisch.
5. Pläne der Läufe aktualisieren (letzte/naechste_lauf_am).

### 4.3 Auto-Trigger (App-Start)

`js/init.js::init()` nach `checkOverdueInvoices()` (init.js:22):
```js
try { if (window.api.dauerrechnungenAutoRun && state.einstellungen.dauerrechnungen_auto_erstellen !== 'false') { await window.api.dauerrechnungenAutoRun(); } } catch (e) { console.warn('Dauerrechnungen Auto-Run:', e); }
```
Main-Seite: liest/schreibt `dauerrechnungen_last_auto_run` (heutiges Datum) – läuft max. 1×/Tag; generiert ausschließlich `als_entwurf=1`-Pläne als ENTWURF (Benutzer prüft & bucht → GoBD-sicher, nichts Unbeabsichtigt Gesperrtes); `als_entwurf=0`-Pläne nur über manuellen Button. Ergebnis als Notification (bestehender notifications-Mechanismus) „3 Dauerrechnungs-Entwürfe erstellt".

### 4.4 Storno / Löschen von Läufen

- Lauf STORNIEREN (mit Pflichtbegründung): Wenn zugeordneter Beleg noch Entwurf (isLocked=0, status 'Entwurf'): Beleg via `deleteDocument` entfernen (kein Storno-Beleg nötig – nie ausgegangen) ODER optional behalten; Lauf-Status → STORNIERT (+grund), Partial-Index gibt Periodenraum wieder frei (Neugenerierung möglich).
- Beleg bereits fertig/gesperrt: bestehender Storno-Pfad (`window.api.storniereRechnung` mit InvoiceController.createStornoData) + anschließend Lauf → STORNIERT; Audit `LAUF_STORNIERT:{grund,stornoDokumentId}`.
- `naechste_lauf_am` des Plans neu berechnen (Periodenraum wieder offen).
- Plan löschen mit Läufen: blockiert (§1.4 FK NO ACTION + deutsche Meldung) → nur deaktivieren.

### 4.5 GoBD-Zusammenfassung

Alle erzeugten/geänderten BELEGE laufen ausschließlich über `applyDocumentWrite` → SHA-256-Inhalts-Hash + lückenlose audit_logs-Kette (main/audit.js:113–135); Plan-/Lauf-Mutationen protokolliert als `ABRECHNUNGSPLAN/ERSTELLT|GEÄNDERT|DEAKTIVIERT|LAUF_ERSTELLT|LAUF_IN_SAMMELRECHNUNG|LAUF_STORNIERT`. Kein Pfad schreibt dokumente direkt.

---

## 5. ABHÄNGIGKEITEN & REIHENFOLGE

1. **F1 zuerst** (Objektstamm, dokumente.objekt_*, resolveEmpfaenger, od-Abrechnungspläne-Tab).
2. F2-Reihenfolge intern: Rhythmus-Controller (pure) → Tabellen/Migration → dbAPI (save/get/delete Plan) → Generierungslogik → IPC/preload → Views → Auto-Trigger → Tests kontinuierlich.
3. **Wiederverwendung (NICHT neu bauen):** Kundenauswahl (state.kunden), `InvoiceController.calculateTotals`, `applyDocumentWrite/saveDocument`, Storno-Pfad, Belegöffnung im Editor, Nummernlogik (spiegeln, da Main-Prozess), Einstellungen-Speicher, dialog:confirm/alert.
4. Berührungspunkte Bestand: schema.js, db.js, main.js, preload.js, js/navigation.js, code.html (View + 3 Modals), js/init.js, js/editor.js (NUR Lesemodus-Erweiterung: Badge „Dauerrechnung" + Plan-Referenz im Editor falls doc aus Lauf stammt – optional, klein halten).

---

## 6. TESTPLAN

Neue Dateien (node --test; DB-Tests mit dem ELECTRON_RUN_AS_NODE-Wrapper-Muster aus data_integrity.test.js:18–65):

### tests/dauerrechnung_rhythmus.test.js (pure, kein DB)
- MONATLICH: 31. → Clamp Feb (28./29. Schaltjahr 2028), 30.; Terminfolge 01.01–01.06 exakt.
- QUARTALSWEISE: „Glasreinigung alle 3 Monate" ab 15.01. → 15.01/15.04/15.07/15.10.
- JAEHRLICH: abrechnungsmonat=3, tag=31 → 31.03. je Jahr (Clamp irrelevant), plus Schaltfall 29.02.
- WOCHEN_INTERVALL: alle 2 Wochen ab Do-Anker; Intervall 1/6; Verschiebung über Monats-/Jahresgrenze.
- berechneLeistungszeitraum: NACHTRAEGLICH Januar-Lauf → [01.12.–31.12.] (inkl. 31.!), VORAUS → [01.01.–31.01.]; Wochenfenster-Grenzen; Clamping an start/ende.
- ende_datum: Termine nach Ende → null; unbefristet → immer weiter.
- gruppiereFuerSammelrechnung: 5 Läufe/2 Empfänger → Gruppen 3+2; Gruppe <2 markiert.

### tests/dauerrechnung_crud.test.js (DB, Wrapper-Muster)
- Schema-Existenz aller 3 Tabellen + Indizes (inkl. partial unique per sqlite_master/sql).
- CRUD Plan mit Positionen (nested save/load), UNIQUE(objekt,name) wirft deutsche Meldung.
- CHECK-Fehler: falscher rhythmus, tag=32, POSITIONEN leer, PAUSCHALE 0.
- deleteAbrechnungsplan mit Lauf → blockiert; ohne Läufe → ok; CASCADE positionen.
- updateAbrechnungsplanStatus pausiert/reaktiviert; getFullState liefert plaene+laeufe.
- FK: unbekannter empfaenger_kunde_id → FOREIGN KEY.

### tests/dauerrechnung_generation.test.js (DB, Kernsuite)
- Fixtures: kunden (Eigentümer A + Mieter B), Liegenschaft→Gebäude→Etage→Raum, Plan MONATLICH PAUSCHALE 100/19% NACHTRAEGLICH ab 01.11.2025.
- Generierung: Beleg existiert, type=rechnung, rechnungsart=REGULAER, nr Format INV-YYYY-NNN eindeutig, netto=100/steuer=19/brutto=119 centgenau, kundeId=Empfänger, objekt_link gesetzt, leistungszeitraum=[Dez], status Entwurf & isLocked=0 (als_entwurf=1); Lauf-Zeile verknüpft; Plan-Caches aktualisiert.
- Doppelgenerierung desselben Fensters → UNIQUE-Fehler mit Meldung; nach Storno des Laufs erneut OK (partial index).
- als_entwurf=0 → isLocked=1; gesperrter Beleg: Inhaltsänderung blockiert (GoBD-Muster), Statuspfad erlaubt.
- Storno geschlossener Beleg via storniereRechnung + storniereLauf → Lauf STORNIERT, Grund pflichtig, Kette valid.
- POSITIONEN-Plan: 2 Positionen (Artikel-Snapshot + Freitext), Summen via calculateTotals konsistent; Artikel-BESTAND wird bei type=rechnung regulär abgebucht (bestehendes Verhalten – bewusst dokumentiert!).
- Sammelrechnung: 3 Läufe/2 Objekte/Eigentümer A → EIN Beleg rechnungsarts=SAMMELRECHNUNG, Positionsnamen mit `[Pfad]-Prefix`, Σ brutto = Summe Einzelläufe, beide Läufe zeigen aufs selbe dokument, Historie beider Objekte enthält Beleg (Historie-SQL aus F1 §2.2!), Audit-Kette valid; Fehlerfälle: <2 Läufe, gemischte Empfänger, bereits abgerechneter Lauf.
- autoRun: setzt last_auto_run, zweiter Aufruf same day no-op, Entwurfsanzahl korrekt, Fehlerfall wirft nicht.
- Nach jeder Mutation: `verifiziereAuditKette().valid===true`.

Akzeptanz: `npm test` grün inkl. aller Alt-Tests.

---

## 7. SCHRITT-FÜR-SCHRITT-UMSETZUNG

Checkpoints: nach jedem Schritt `npm test` (bereichsbezogen `node --test tests/<datei>` erlaubt), App-Start rauchtest bei UI-Schritten.

1. **Controller pure:** `controllers/DauerrechnungController.js` mit allen Funktionen aus §4.1 (doppelte Exports wie InvoiceController:255).
   ✅ Akzeptanz: Funktionen importierbar; `npm test` grün (noch keine neuen Tests nötig).
2. **Testdatei dauerrechnung_rhythmus.test.js schreiben & grün machen** (alle Fälle §6.1).
   ✅ `node --test tests/dauerrechnung_rhythmus.test.js` grün; `npm test` grün.
3. **Tabellen:** createSchema um §1.2–1.4 (3 Tabellen, 5 Indizes) erweitern.
   ✅ Frische Test-DB enthält Tabellen+Indizes (sqlite_master); npm test grün.
4. **dbAPI Plan-CRUD:** `saveAbrechnungsplan` (Validierungen §2, Transaktionsmuster db.js:748, naechste_lauf_am-Berechnung via Step-1-Controller), `getAbrechnungsplaene`, `deleteAbrechnungsplan` (Lauf-Schutz), `updateAbrechnungsplanStatus`, `getPlanLaeufe`; getFullState-Erweiterung §1.5.
   ✅ Node-Smoke: Plan anlegen/laden/pausieren; npm test grün.
5. **Testdatei dauerrechnung_crud.test.js schreiben & grün machen.** ✅ Checkpoint.
6. **Nummern-Generator:** dbAPI-intern `generateNaechsteRechnungsNr()` (Spiegel editor.js:141) + Unit-Testfall in generation-suite vorbereitet.
   ✅ Fortlaufende Nrn über mehrere Inserts, keine Kollision mit UNIQUE-Index.
7. **Generierungskern:** `erzeugeRechnungAusLauf(plan, lauf)` + `erzeugeSammelrechnung(kundeId, laeufe)` gemäß §4.2 (applyDocumentWrite OHNE eigenen transaction-Wrapper – Muster storniereRechnung db.js:699–732), plus `dauerrechnungenVorschau`-Logik.
   ✅ Node-Script erzeugt 3 Belege aus Testplänen; Audit-Kette valid.
8. **Testdatei dauerrechnung_generation.test.js Teil 1** (Einzelgenerierung, Doppel-, Entwurfs-/Lock-Fälle) schreiben & grün. ✅ Checkpoint.
9. **IPC + preload:** Handler §2 registrieren (wrapHandler, deutsche Validierung); `autoRunDauerrechnungen` mit last_auto_run-Logik.
10. **Testdatei dauerrechnung_generation.test.js Teil 2** (Sammelrechnung, Storno, autoRun) schreiben & grün. ✅ `npm test` GESAMT grün.
11. **Navigation + View-Gerüst:** Sidebar nav-dauerrechnungen, viewConfig, views-Array, `view-dauerrechnungen` Container mit KPI/Toolbar/Table-Gerüst (IDs §3.1).
    ✅ switchView('dauerrechnungen') rendert leere Liste fehlerfrei.
12. **Renderer `js/dauerrechnungen.js` Teil 1:** renderDauerrechnungen (Pläne-Tabelle, lesbare Rhythmus-Texte via Controller-Helper `rhythmusLabel(plan)`), Suche/Filter, `<script>`-Einbindung in code.html.
13. **Plan-Modal:** HTML (§3.2) + openPlanModal/savePlanFromModal inkl. Empfänger-Preview (nutzt window.ObjektController.resolveEmpfaenger über state.objekte) + Positionen-Mini-Editor.
14. **Renderer Teil 2:** Läufe-Panel (getPlanLaeufe), Pausieren/Löschen-Aktionen, „Jetzt generieren" je Plan.
15. **Vorschau-/Sammel-Modals** (§3.3) inkl. Gruppierung und Ergebnisliste.
16. **Storno-Flow UI:** Begründungsdialog → storniereLauf → Listen refresh.
17. **Auto-Trigger:** init.js-Hook (§4.3) + Notification-Integration.
18. **Objektdetail-Tab befüllen:** renderObjektPlaene (F1-Hook) real implementieren (§3.4).
19. **Editor-Badge (optional, klein):** Bei Belegen mit Lauf-Herkunft Hinweis-Chip „Aus Abrechnungsplan ‚<Name>'" (read-only Info, kein Verhalten).
20. **Gesamtabnahme:** `npm test` grün; manueller Smoke: Plan anlegen → Vorschau → generieren → Beleg öffnen/stornieren → Sammelrechnung → Objekt-Historie prüfen.

---

## 8. OFFENE FRAGEN / RISIKEN

1. **Bestandsabbuchung bei Artikeln:** `applyDocumentWrite` bucht bei `type='rechnung'` Artikelbestände ab (db.js:139–159). Für Dienstleistungs-Dauerrechnungen meist irrelevant (kein bestandsgeführter Artikel), aber dokumentieren: Falls Lager-Artikel in Plänen genutzt werden, sinkt der Bestand automatisch. Gewollt?
2. **Umsatzsteuer-Freibeträge/Kleinunternehmer:** mwst_satz=0 erlaubt – reicht das für §19 UStG-Kleinunternehmer (kein Hinweistext-Handling)? Aktuell ja (Freitext vortext).
3. **Live-Artikelpreise statt Snapshot** (§1.3) – ENTSCHIEDEN (24.08.2026): Hybrid. Neues Feld `abrechnungsplaene.preise_live` (0=Standard/Snapshot, 1=Positionen mit Artikellink nutzen aktuellen `artikel.vk` bei Generierung/Vorschau/Sammelrechnung). Umgesetzt in schema.js (Spalte+Migration), db.js (`_ladePlanPositionenFuerGenerierung`, 3 Aufrufstellen), UI (Checkbox nur bei POSITIONEN, Live-Badge in Planliste). Tests: tests/dauerrechnung_preise_live.test.js.
4. **Preisänderung mid-year / Preisanpassung (Indexierung):** v1 = Plan bearbeiten wirkt ab nächstem Lauf. Automatische Preisstaffeln (z. B. +2% jährlich) OUT OF SCOPE – Bedarf klären.
5. **Sammelrechnung Positionsprefix `[Pfad]`** – ENTSCHIEDEN (24.08.2026): Prefix bleibt Release-Stand. Echte Unterpositionen-Gruppierung im PDF-Layout verworfen (Aufwand 3 PDF-Templates, kein Kundennutzen für v1).
6. **Auto-Run nur bei App-Start:** Desktop-Single-User-App hat keinen Scheduler. Risiko: Nutzer startet App selten → Läufe stauen sich (werden beim nächsten Start alle nachgeholt – gewollt?). Windows-Taskplaner/Autostart außerhalb Scope.
7. **Zahlungsziel-Settings-Key `zahlungsziel`** existiert implizit (editor.js:136) – bei fehlendem Key Default 14 Tage; Einstellungs-UI erweitern?
8. **Risiko partial unique index:** SQLite-Version in better-sqlite3 ^12 unterstützt dies sicher; Tests decken Verhalten ab (Schritt 8/10).
9. **Risiko Main-Process-Require von controllers/:** DauerrechnungController muss Electron-frei bleiben (kein window-Zugriff im Node-Zweig) – Muster InvoiceController beachten.
10. **Mahnwesen-Interaktion:** Dauerrechnungs-Belege fließen automatisch ins bestehende Mahnwesen ein (status-basiert) – gewollt, keine Sonderbehandlung geplant.
