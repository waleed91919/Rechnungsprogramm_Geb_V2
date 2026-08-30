# Deep Research: Anforderungen an ein Offline-First Bau-ERP in Deutschland (DACH) & Granulare Gap-Analyse

**Dokument-ID:** `DOC-DEEP-RESEARCH-BAU-OFFLINE-ERP-2026`  
**Klassifizierung:** Strategische Fachstudie, Software-Architektur-Spezifikation & Gap-Analyse  
**Zielgruppe:** Geschäftsführung, Senior Software-Architekten, Produktmanager & Baubetriebs-Consultants  
**Projekt:** W-Link ERP (*Rechnungsprogramm_Geb_V2*)  
**Stand:** August 2026 / Release-Perspektive 2026–2028  
**Geltungsbereich:** Deutschland, Österreich, Schweiz (DACH) – Hochbau, Tiefbau, Ausbau, GU, TGA, Handwerk, Gebäudedienstleistung & FM  

---

## Inhaltsverzeichnis

1. [Executive Summary & Management-Übersicht](#1-executive-summary--management-übersicht)
2. [Deep Research: Offline-First Architektur für Baustellen & Bauunternehmen](#2-deep-research-offline-first-architektur-für-baustellen--bauunternehmen)
   - [2.1 Die Baustellen-Realität im DACH-Raum (Funklöcher & Abschirmung)](#21-die-baustellen-realität-im-dach-raum)
   - [2.2 Die 5 Säulen einer modernen Offline-First Bau-ERP-Architektur](#22-die-5-säulen-einer-modernen-offline-first-bau-erp-architektur)
   - [2.3 Synchronisations- & Replikationsmodelle (Delta-Sync, Sync-Queue, CRDTs)](#23-synchronisations--replikationsmodelle)
   - [2.4 GoBD-Revisionssicherheit & Hashketten im Offline-Betrieb](#24-gobd-revisionssicherheit--hashketten-im-offline-betrieb)
   - [2.5 Lokale Datensicherheit & Diebstahlschutz auf der Baustelle](#25-lokale-datensicherheit--diebstahlschutz)
3. [Bauspezifischer Fachanforderungskatalog (11 Kernbereiche)](#3-bauspezifischer-fachanforderungskatalog-11-kernbereiche)
   - [Bereich 1: GAEB-Datenaustausch & Projekt-/LV-Management (GAEB X80–X89)](#bereich-1-gaeb-datenaustausch--projekt-lv-management)
   - [Bereich 2: Aufmaß & Mengenermittlung (REB 23.003, DA11, DA12, X31, VOB/C)](#bereich-2-aufmaß--mengenermittlung)
   - [Bereich 3: VOB/B & BGB Abrechnungslogik (Kumulation, Fristen, Sicherheitseinbehalte § 17)](#bereich-3-vobb--bgb-abrechnungslogik)
   - [Bereich 4: Nachtragsmanagement nach VOB/B § 2 und BGB §§ 650b/c](#bereich-4-nachtragsmanagement)
   - [Bereich 5: Baustellencontrolling, Bautagebuch & Bauabnahme (§ 12 VOB/B)](#bereich-5-baustellencontrolling-bautagebuch--bauabnahme)
   - [Bereich 6: Nachunternehmerverwaltung & Bau-Compliance (§ 48b EStG, SOKA-BAU, MiLoG)](#bereich-6-nachunternehmerverwaltung--bau-compliance)
   - [Bereich 7: Steuerrecht, Finanzen & Banking (§ 13b UStG, § 35a EStG, CAMT/CSV, SEPA)](#bereich-7-steuerrecht-finanzen--banking)
   - [Bereich 8: E-Rechnung EN 16931-1 & Branchenschnittstellen (XRechnung, ZUGFeRD 2.3+, DATEV, DATANORM)](#bereich-8-e-rechnung-en-16931-1--branchenschnittstellen)
   - [Bereich 9: Kalkulation & Baubetriebliches Controlling (Zuschlagskalkulation, EFB 221/223, Mittellohn)](#bereich-9-kalkulation--baubetriebliches-controlling)
   - [Bereich 10: Zeiterfassung & Gerätedisposition (BAG-Urteil 2022, BGL-Kosten)](#bereich-10-zeiterfassung--gerätedisposition)
   - [Bereich 11: Liegenschaften, Facility Management & Dauerrechnungen (Property Tree, RTV-Tarif)](#bereich-11-liegenschaften-facility-management--dauerrechnungen)
4. [Marktvergleich: Die 10 führenden Systeme im DACH-Benchmark](#4-marktvergleich-die-10-führenden-systeme-im-dach-benchmark)
5. [Granulare Soll-Ist-Vergleichsmatrix (W-Link ERP Codebase)](#5-granulare-soll-ist-vergleichsmatrix-w-link-erp-codebase)
   - [5.1 Methodik & Ampel-Definition](#51-methodik--ampel-definition)
   - [5.2 Tabellarische Feature-Matrix (50 Kriterien)](#52-tabellarische-feature-matrix-50-kriterien)
   - [5.3 Quantitativer Erfüllungsgrad & Testergebnisse](#53-quantitativer-erfüllungsgrad--testergebnisse)
6. [Unsere Alleinstellungsmerkmale (USPs) & Wettbewerbsvorteile](#6-unsere-alleinstellungsmerkmale-usps--wettbewerbsvorteile)
7. [Strategische Roadmap & Priorisierter Umsetzungsplan (Phasen 1 bis 4)](#7-strategische-roadmap--priorisierter-umsetzungsplan-phasen-1-bis-4)
8. [Fazit & Handlungsempfehlung](#8-fazit--handlungsempfehlung)

---

## 1. Executive Summary & Management-Übersicht

Die deutsche Bauwirtschaft (über 380.000 Betriebe im Hoch-, Tief- und Ausbaugewerbe sowie 40.000 Facility-Management- und Gebäudedienstleister) steht 2026/2027 vor einer doppelten Herausforderung: Einerseits zwingen gesetzliche Digitalisierungsvorschriften (**E-Rechnungspflicht nach EN 16931-1**, verschärfte **GoBD-Revisionssicherheit**, **BAG-Arbeitszeiterfassungspflicht**, **§ 13b UStG**, **§ 48b EStG Bauabzugsteuer**) zu durchgängigen digitalen Prozessen. Andererseits scheitern rein web- oder cloudbasierte ERP-Systeme tagtäglich an der harten Realität des Baustellenbetriebs: **Funklöcher, Tiefgaragen, Untergeschosse, Neubau-Rohbauten aus Stahlbeton und abgelegene ländliche Infrastrukturprojekte**.

Ein Softwaresystem für Bau- und Handwerksbetriebe kann nur dann praxistauglich und rechtssicher sein, wenn es nach dem Paradigma **Offline-First (Local-First)** konstruiert ist. Bauleiter, Poliere und Handwerker müssen Leistungsverzeichnisse (GAEB), Aufmaße (REB 23.003 / DA11), Bautagebücher, Behinderungsanzeigen (VOB/B § 6) und Abnahmeprotokolle (VOB/B § 12) **vollständig ohne Internetverbindung** auf der Baustelle erfassen, berechnen und rechtssicher signieren können. Sobald wieder Netzempfang besteht, sorgt eine automatisierte **Zwei-Wege-Synchronisations-Engine** mit mathematisch fundierter Konfliktlösung (CRDTs / Event-Sourcing / Domain-Rules) für den konsistenten Datenabgleich mit dem Büro.

```mermaid
flowchart TD
    subgraph "Baustelle (Offline-Zone: Funkloch / Tiefgarage)"
        BL[Bauleiter / Polier / Handwerker] -->|Zero-Latency UI| APP[Lokale App / Electron / SQLite]
        APP -->|Lokale Transaktionen| LDB[(Lokale SQLite Embedded DB)]
        APP -->|Audit-Trail| HASH[SHA-256 Hash-Kette GoBD]
        APP -->|Aktionen einreihen| SQ[Persistent Sync Queue / Outbox]
    end

    subgraph "Synchronisations-Tunnel (Wiederverbindung)"
        SQ -->|Netzwerk verfügbar| RECON[Zwei-Wege-Sync Engine]
        RECON -->|Delta-Replication & CRDTs| CONFLICT{Konflikterkennung}
        CONFLICT -->|Automatisch auflösbar| AUTO[LWW / State-Merge]
        CONFLICT -->|Kollision / Manuell| QUAR[Konflikt-Center / Schlichtung]
    end

    subgraph "Büro / ERP-Zentrale (Online / Server)"
        AUTO --> CDB[(Master ERP-Datenbank)]
        QUAR --> CDB
        CDB --> FIBU[DATEV EXTF 700 / FiBu]
        CDB --> EINV[E-Rechnung XRechnung 3.0 / ZUGFeRD 2.3]
        CDB --> BANK[Banking ISO 20022 / OPOS Matching]
    end
```

---

## 2. Deep Research: Offline-First Architektur für Baustellen & Bauunternehmen

### 2.1 Die Baustellen-Realität im DACH-Raum

1. **Topologische und bauliche Abschirmung:**
   - Stahlbeton-Rohbauten, Untergeschosse (UG 1–UG 4), Tiefgaragen, Aufzugsschächte, Versorgungsstollen, Tunnels und ländliche Tiefbaustellen wirken wie *Faradaysche Käfige*. Der Mobilfunkempfang (4G/5G) bricht regelmäßig komplett ab (Signalstärke $\le -120\,\text{dBm}$).
2. **Fragilität mobiler Internetverbindungen:**
   - Selbst bei nomineller Netzabdeckung führen Edge-Zellen, überlastete Masten oder Captive-Hotspots zu hohen Paketverlusten ($>30\,\%$) und Latenzen ($>2.000\,\text{ms}$). Reine Web-Apps („Single Page Apps mit REST-API“) hängen sich auf, verlieren ungespeicherte Formulareingaben oder erzeugen inkonsistente Zustände.
3. **Zero-Latency Benutzererlebnis (UX) für den Bauleiter:**
   - Poliere und Bauleiter müssen auf der Baustelle hunderte Aufmaßzeilen oder Checklisten erfassen. Jede Latenz von mehr als 100 ms pro Tastendruck oder Positionswechsel führt zu Frustration und Fehlbedienungen. Lokale Datenbankabfragen (SQLite) antworten in unter 2 Millisekunden.

---

### 2.2 Die 5 Säulen einer modernen Offline-First Bau-ERP-Architektur

```mermaid
graph LR
    A[Offline-First Architektur] --> B[1. Lokale Embedded DB]
    A --> C[2. Persistente Sync Queue]
    A --> D[3. Konfliktlösungs-Modelle]
    A --> E[4. GoBD-Offline-Compliance]
    A --> F[5. Lokale Datensicherheit]

    B --> B1[SQLite / WAL / better-sqlite3]
    C --> C1[Outbox Pattern / Idempotente UUIDs]
    D --> D1[CRDTs / Domain-Rules / 3-Way Merge]
    E --> E1[SHA-256 Hashverkettung / Audit-Log]
    F --> F1[SQLCipher AES-256 / Device-PIN]
```

#### Säule 1: Lokale Datenhaltung (Local-First Storage)
- **Engine:** SQLite 3 im WAL-Modus (Write-Ahead Logging) über performante native Bindings (wie `better-sqlite3` in Electron/Node.js) oder SQLCipher für mobile Apps (iOS/Android/PWA mit Origin Private File System / OPFS).
- **Vorteile:** Volle ACID-Transaktionssicherheit, blitzschnelle Lese- und Schreiboperationen ohne Server-Roundtrip, kein Datenverlust bei plötzlichem Akku-Ausfall oder Systemabsturz.
- **Datenschema-Erweiterung:** Jede Entität erhält Metadaten für die Synchronisation:
  ```sql
  uuid TEXT PRIMARY KEY,               -- Global eindeutige Kennung (RFC 4122 v4)
  version INTEGER DEFAULT 1,           -- Monoton steigender Versionszähler
  is_synced INTEGER DEFAULT 0,         -- 0 = lokal geändert, 1 = synchronisiert
  sync_timestamp DATETIME,             -- Zeitstempel des letzten erfolgreichen Server-Syncs
  deleted_at DATETIME                  -- Soft-Delete (Tombstone-Mechanismus)
  ```

#### Säule 2: Persistente Sync Queue (Outbox Pattern)
- Jede Nutzeraktion (Erfassung eines Aufmaßes, Speichern eines Bautagebuchs, Bedenkenanzeige) wird atomar in einer lokalen Transaktion in zwei Tabellen geschrieben:
  1. In die eigentliche Fachtabelle (z. B. `aufmass_zeilen`).
  2. In die `sync_outbox`-Tabelle als serialisierter Mutations-Event (Event Sourcing).
- Ein autonomer **Sync-Worker** im Hintergrund überwacht den Netzwerkstatus (`navigator.onLine`, Ping-Heartbeat). Sobald eine Verbindung steht, werden die Events geordnet mit **Exponential Backoff** (1s, 2s, 4s, 8s...) an den Sync-Server übertragen.
- **Idempotenz:** Jeder Event trägt eine idempotente Mutation-UUID. Wiederholte Übertragungen bei Netzabbrüchen während des Uploads richten auf dem Server keinen Schaden an (keine Duplikate).

#### Säule 3: Konfliktlösungs-Strategien (Conflict Resolution)
Wenn mehrere Mitarbeiter (z. B. Bauleiter vor Ort und Projektleiter im Büro) denselben Datensatz offline bearbeiten, entstehen Kollisionen. Folgende Strategien greifen gestaffelt:

| Konfliktlösungs-Modell | Anwendungsbereich im Bau-ERP | Funktionsweise |
| :--- | :--- | :--- |
| **Last-Write-Wins (LWW) mit Vektoruhren** | Unkritische Stammdaten, Adressänderungen, allgemeine Notizen | Der Zeitstempel (Lamport-Timestamp) der letzten Änderung setzt sich durch. Bei Gleichheit entscheidet die Knoten-ID. |
| **CRDTs (Conflict-free Replicated Data Types)** | Bautagebuch-Langtexte, Mängelberichte, Positionslisten | Mathematische Zusammenführung (State-based / Operation-based CRDTs wie Yjs oder Automerge). Gleichzeitige Ergänzungen von zwei Bauleitern werden nahtlos zusammengeführt, ohne dass Text verloren geht. |
| **Domänenspezifische Geschäftsregeln (Domain Rules)** | Abrechnung, GoBD-Status, Abnahmen, Nachträge | Geschäftslogik entscheidet über Priorität: <br>• Ein GoBD-festgeschriebener Beleg (`isLocked = 1`) überschreibt jeden Offline-Entwurf.<br>• Ein genehmigter Nachtrag (`GENEHMIGT`) hat Vorrang vor einem lokalen Entwurf.<br>• Eine förmliche Abnahme mit Status `VERWEIGERT` sperrt die automatische Schlussrechnungsgovernance. |
| **Three-Way-Merge & Manuelles Konflikt-Center** | Parallele Aufmaßänderungen an derselben OZ (`01.01.0010`) | Das System erkennt den Konflikt anhand der gemeinsamen Basisversion ($V_{\text{base}}$) und der beiden Zweige ($V_{\text{local}}$, $V_{\text{remote}}$). Kann der Algorithmus die Zeilen nicht eindeutig zuordnen, wird der Datensatz in die **Klärungsliste (Quarantäne)** verschoben und der Bauleiter erhält einen visuellen Diff-Dialog. |

#### Säule 4: GoBD-Revisionssicherheit im Offline-Zustand
- **Herausforderung:** Die Finanzverwaltung (GoBD 2.0 / BMF) verlangt, dass Buchungsbelege und rechnungsbegründende Aufmaße ab Festschreibung unveränderbar sind und jede Änderung lückenlos protokolliert wird.
- **Offline-Lösung:** Die kryptografische **SHA-256 Hashverkettung** (`previous_hash` $\to$ `current_hash`) wird **lokal in derselben SQLite-Transaktion** gebildet. Selbst wenn das Gerät wochenlang offline bleibt, ist die Kette mathematisch geschlossen und fälschungssicher.
- **Manipulationsschutz gegen Uhrenverstellung:** Zeitstempel werden lokal erfasst. Bei der Synchronisation prüft der Server die zeitliche Plausibilität gegen NTP-Serverzeit. Zeitdrifts werden als Metadatum protokolliert, ohne die Hash-Kette zu brechen.

#### Säule 5: Lokale Datensicherheit & Diebstahlschutz
- Baustellengeräte (Laptops, Tablets, Smartphones) unterliegen einem erhöhten Diebstahl- und Verlustrisiko.
- **Sicherheitsanforderung:** Lokale Datenbankdateien müssen via **SQLCipher (AES-256 CBC)** verschlüsselt werden. Der Schlüssel wird aus dem Benutzer-Passwort über PBKDF2 / Argon2id abgeleitet und liegt niemals im Klartext auf dem Datenträger.

---

## 3. Bauspezifischer Fachanforderungskatalog (11 Kernbereiche)

```mermaid
mindmap
  root((Bau-ERP DACH))
    Projekt & GAEB
      GAEB XML 3.3 X80-X89
      OZ-Hierarchien
      Dokumentenkette
    Aufmass & Mengen
      REB 23.003 Formeln 01-91
      DA11 / DA12 / GAEB X31
      VOB/C Abzugsregeln
    Abrechnung nach VOB
      Kumulierte Abschlagsrechnung
      Sicherheitseinbehalt § 17
      Prüffristen § 16
    Nachtragsmanagement
      VOB/B § 2 Abs 3/5/6
      BGB §§ 650b/c 80%
      Urkalkulations-Bezug
    Baustelle & Bautagebuch
      Wetter & Behinderung § 6
      Bedenkenanzeige § 4
      Abnahme § 12 & Mängel
    Compliance & Subunternehmer
      § 48b EStG Bauabzugsteuer
      SOKA-BAU & MiLoG
      Bürgschaften
    Steuer & Finanzen
      § 13b UStG Reverse Charge
      § 35a EStG Handwerkerbonus
      ISO 20022 Banking & OPOS
    E-Rechnung & Schnittstellen
      XRechnung 3.0.x CII
      ZUGFeRD 2.3+ PDF/A-3
      DATEV EXTF 700
      DATANORM / IDS Connect
    Kalkulation & Controlling
      Zuschlagskalkulation EKT
      EFB-Preisblätter 221/223
      Soll-Ist Deckungsbeitrag
    Zeiterfassung & Fuhrpark
      BAG 2022 ArbZG-Konform
      Kolonnen- & Rüstzeiten
      BGL Gerätekosten
    Objekt & Facility Management
      Property Tree 4-stufig
      Reinigungs-LV RAL DIN 77400
      RTV Gebäudereinigung Tarif
      Dauerrechnungsläufe
```

---

### Bereich 1: GAEB-Datenaustausch & Projekt-/LV-Management

Das **Gemeinsame Ausschuss Elektronik im Bauwesen (GAEB)** Regelwerk ist der universelle Kommunikationsstandard im deutschen Bauwesen.

#### Austauschphasen nach GAEB DA XML 3.3, 3.2, 2000 und 90:
- **X80 / D80:** Universeller Leistungsverzeichnis-Austausch (Kataloge, Vorlagen).
- **X81 / D81:** Leistungsbeschreibung (Katalogdaten mit Ausführungsbeschreibungen).
- **X82 / D82:** Kostenansatz / Kostenschätzung des Planers.
- **X83 / D83:** Angebotsaufforderung / Ausschreibung (Auftraggeber $\to$ Bieter, unbepreist).
- **X84 / D84:** Angebotsabgabe (Bieter $\to$ Auftraggeber, bepreist mit Einheitspreisen und Bieterangaben).
- **X85 / D85:** Nebenangebot (Alternative technische Lösungen).
- **X86 / D86:** Auftragserteilung / Auftrags-LV (Zuschlag).
- **X89 / D89:** Rechnungs-LV (Abrechnungsverzeichnis zur Rechnungsprüfung).

#### LV-Hierarchiestruktur & Ordnungszahlen (OZ):
- Mehrstufige Gliederung: $\text{Los} \to \text{Gewerk/Abschnitt} \to \text{Titel} \to \text{Untertitel} \to \text{Position/OZ}$ (z. B. `01.03.0040`).
- **Positionsarten im Bauwesen:**
  * **Normalposition (Grundposition):** Standardleistung mit Mengenansatz, voll summenwirksam.
  * **Wahlposition / Alternativposition:** Alternative Ausführungsvariante (ohne Summenwirksamkeit im Hauptangebot; wird bei Beauftragung zur Normalposition).
  * **Eventualposition / Bedarfsposition:** Leistung, die nur auf gesonderte Anordnung des Bauherrn ausgeführt wird (mit/ohne Gesamtpreis-Einfluss).
  * **Pauschalposition:** Leistung mit Mengeneinheit `psch` bzw. `C62` ohne detailliertes Aufmaß.
  * **Leitbeschreibung & Unterbeschreibung:** Hierarchische Textbausteine zur Vermeidung von Textwiederholungen.
  * **Textergänzungen (Bieterangaben):** Vom Bieter auszufüllende Felder (Fabrikat, Typ, Kennwerte).

---

### Bereich 2: Aufmaß & Mengenermittlung nach REB 23.003 & VOB/C

Die prüffähige Mengenermittlung ist das Herzstück der Bauabrechnung.

#### Standardformeln nach REB-VB 23.003 (Ausgabe 2009 / 1979):
1. **Formel 01 (Rechteck / Fläche):** $F = a \cdot b$
2. **Formel 02 (Dreieck):** $F = \frac{a \cdot b}{2}$
3. **Formel 03 (Trapez):** $F = \frac{a + c}{2} \cdot h$
4. **Formel 04 (Quader / Rauminhalt):** $V = a \cdot b \cdot c$
5. **Formel 05 (Zylinder / Säule):** $V = \frac{\pi}{4} \cdot d^2 \cdot h$
6. **Formel 21/23 (Kreisbogen, Kreissegment, Sektor):** Bogenlängen und Kreisausschnitte.
7. **Formel 91 (Freie mathematische Formel):** Beliebige mathematische Ausdrücke unter Beachtung der Punkt-vor-Strich-Rechnung und Klammersetzung (max. 50 Zeichen Rechenansatz pro Zeile).

#### Datenaustauschformate DA11, DA12 & GAEB X31:
- **DA11 (80-Zeichen Fixed-Width):**
  * *Satzart 11 (Kopfzeile):* Spalte 1–2 `11`, Spalte 3–11 Projektkennung, Spalte 12–70 Projektname, Spalte 71–80 Datum + Kennung.
  * *Satzart 12 (Rechenzeile):* Spalte 1–2 `12`, Spalte 3–11 OZ, Spalte 14–16 Blatt-Nr., Spalte 17–18 Zeilen-Nr., Spalte 19–20 REB-Formel (`01`–`91`), Spalte 21–70 Rechenansatz (inkl. Textkommentar in Anführungszeichen), Spalte 71–80 Ergebnis (3 Dezimalstellen).
- **DA12:** Erweiterter Datenaustausch für variable Zeilenlängen und Langtexte.
- **GAEB XML X31:** Moderne XML-basierte Mengenermittlung nach REB 23.003.

#### VOB/C Abzugs- und Übermessungsregeln (ATV DIN 18299 ff.):
Im deutschen Bauvertragsrecht dürfen Aussparungen und Öffnungen bis zu bestimmten Grenzwerten **übermessen** (nicht abgezogen) werden:
- *Putz- und Stuckarbeiten (DIN 18350):* Öffnungen $\le 2{,}5\,\text{m}^2$ Einzelfläche werden übermessen.
- *Fliesen- und Plattenarbeiten (DIN 18352):* Aussparungen $\le 0{,}1\,\text{m}^2$ werden übermessen.
- *Maler- und Lackierarbeiten (DIN 18363):* Unterbrechungen $\le 2{,}5\,\text{m}^2$ werden übermessen.
- *Beton- und Stahlbetonarbeiten (DIN 18331):* Aussparungen $\le 0{,}1\,\text{m}^3$ Rauminhalt werden nicht abgezogen.
- *Trockenbauarbeiten (DIN 18340):* Öffnungen $\le 2{,}5\,\text{m}^2$ werden übermessen.

---

### Bereich 3: VOB/B & BGB Abrechnungslogik & Rechnungsarten

Bauverträge unterscheiden sich fundamental von Kauf- oder Dienstleistungsverträgen. Standard ist die **kumulierte Abrechnung**.

```mermaid
flowchart TD
    subgraph "Kumulierte Bauabrechnung F_t = L_t - SUM(F_i)"
        A["1. Abschlagsrechnung (L_1 = 10.000 €)"] -->|F_1 = 10.000 €| R1["Rechnung 1: Netto 10.000 € + 19% USt"]
        B["2. Abschlagsrechnung (L_2 = 25.000 €)"] -->|F_2 = 25.000 - 10.000| R2["Rechnung 2: Netto 15.000 € (Zuwachs) + 19% USt"]
        C["3. Abschlagsrechnung (L_3 = 40.000 €)"] -->|F_3 = 40.000 - 25.000| R3["Rechnung 3: Netto 15.000 € (Zuwachs) + 19% USt"]
        D["Schlussrechnung (L_End = 50.000 €)"] -->|F_End = 50.000 - 40.000| RS["Schlussrechnung: Netto 10.000 € + 5% Gewährleistungseinbehalt"]
    end
```

#### Mathematische Berechnungsformel:
$$F_t = L_t - \sum_{i=1}^{t-1} F_i$$
- $L_t$: Bisher erbrachte kumulierte Gesamtleistung zum Zeitpunkt $t$ (ermittelt über das Aufmaß).
- $\sum F_i$: Summe aller bisherigen Netto-Abschlagsrechnungen.
- $F_t$: Netto-Forderung der aktuellen Abrechnungsperiode (Leistungszuwachs $\Delta L$).
- **Umsatzsteuer-Logik:** Die Umsatzsteuer entsteht immer nur auf den Leistungszuwachs $\Delta L$ dieser Abrechnungsperiode.

#### Rechnungsarten im Bauwesen:
1. **Reguläre Rechnung / Einzelrechnung:** Für in sich abgeschlossene Einzelleistungen oder Regiearbeiten.
2. **Kumulierte Abschlagsrechnung (VOB/B § 16 Abs. 1):** Periodische Zwischenabrechnung nach Leistungsstand.
3. **Teilschlussrechnung (VOB/B § 16 Abs. 2):** Abrechnung eines in sich abgeschlossenen Vertragsteils mit eigener Abnahme und separater Verjährungsfrist.
4. **Schlussrechnung (VOB/B § 14 / § 16 Abs. 3):** Endgültige Abrechnung aller erbrachten Leistungen unter lückenloser Auflistung aller Vorrechnungen und Sicherheitseinbehalte.

#### Prüf- und Zahlungsfristen:
- **Abschlagsrechnungen (VOB/B § 16 Abs. 1 Nr. 3):** Fällig innerhalb von **21 Werktagen** (bzw. 18 Kalendertagen) nach Zugang der prüffähigen Rechnung.
- **Schlussrechnungen (VOB/B § 16 Abs. 3 Nr. 1):** Fällig spätestens innerhalb von **30 Tagen** (bei komplexen Projekten verlängerbar auf max. **60 Tage**) nach Zugang der prüffähigen Schlussrechnung.

#### Sicherheitseinbehalte & Bürgschaften nach VOB/B § 17:
- **Vertragserfüllungseinbehalt:** Typisch 5–10 % der Abschlagsrechnungssummen zur Sicherung der vertragsgemäßen Ausführung.
- **Gewährleistungseinbehalt:** Typisch 5 % der Schlussrechnungssumme zur Sicherung von Mängelansprüchen über die Gewährleistungsfrist (Regelfrist: 4 Jahre nach VOB/B § 13 Abs. 4 bzw. 5 Jahre nach BGB § 634a).
- **Steuerrechtliche Behandlung:** Der Einbehalt stellt handels- und steuerrechtlich vollwertiges Entgelt dar $\rightarrow$ Die Bemessungsgrundlage der Umsatzsteuer wird durch den Einbehalt **nicht gemindert**. Der Einbehalt kürzt ausschließlich den Auszahlungsbetrag (NetPayableAmount).
- **Bürgschaftsablösung:** Der Auftragnehmer hat das Recht, den Sicherheitseinbehalt durch Stellung einer unbefristeten selbstschuldnerischen Bank- oder Kautionsbürgschaft abzulösen.

---

### Bereich 4: Nachtragsmanagement nach VOB/B § 2 und BGB §§ 650b/c

Nachträge sind im Baubetrieb die häufigste Ursache für Rechtsstreitigkeiten und Liquiditätsengpässe.

```mermaid
stateDiagram-v2
    [*] --> Nachtragsursache: Bauentwurfsänderung / Behinderung / Mengenabweichung
    Nachtragsursache --> VOB_Pruefung: Prüfung Rechtsgrundlage
    VOB_Pruefung --> VOB_2_3: Mengenabweichung >110% oder <90%
    VOB_Pruefung --> VOB_2_5: Geänderte Leistung (Anordnung AG)
    VOB_Pruefung --> VOB_2_6: Zusätzliche Leistung (Vor Ausführung ankündigen!)
    VOB_Pruefung --> BGB_650b: Gesetzliches Anordnungsrecht Besteller
    
    VOB_2_3 --> Urkalkulation: Preisanpassung auf Basis Urkalkulation
    VOB_2_5 --> Urkalkulation: Mehr-/Minderkosten + Zuschläge
    VOB_2_6 --> Urkalkulation: Neuer Preis aus Urkalkulationslogik
    BGB_650b --> BGB_650c: Tatsächlich erforderliche Kosten + AGK/W&G
    
    BGB_650c --> Abschlagsanspruch_80: Keine Einigung nach 30 Tagen -> 80% Abschlagsanspruch (§ 650c Abs. 3)
    Urkalkulation --> Genehmigung: Vorlage beim AG / Bauleiter
    Abschlagsanspruch_80 --> Genehmigung
    
    Genehmigung --> Genehmigt: Schriftliche Anerkennung
    Genehmigung --> Abgelehnt: Streitbeilegung / Schlichtung
    Genehmigt --> Fakturierung: Automatische Übernahme in kumulierte Abschlagsrechnung
    Fakturierung --> [*]
```

#### Die Rechtsgrundlagen im Detail:
1. **VOB/B § 2 Abs. 3 (Mengenabweichungen):**
   - Weicht die tatsächlich ausgeführte Menge einer LV-Position um mehr als $10\,\%$ vom vertraglichen Mengenansatz ab, ist auf Verlangen ein neuer Einheitspreis für die über $110\,\%$ hinausgehende Menge zu vereinbaren. Bei Unterschreitung unter $90\,\%$ ist der Einheitspreis auf Verlangen zu erhöhen, um den entfallenen Deckungsbeitrag auszugleichen.
2. **VOB/B § 2 Abs. 5 (Geänderte Leistungen):**
   - Werden durch Anordnung des Auftraggebers die Grundlagen des Preises für eine im Vertrag vorgesehene Leistung geändert, ist ein neuer Preis unter Berücksichtigung der Mehr- oder Minderkosten auf Basis der **Urkalkulation** zu vereinbaren.
3. **VOB/B § 2 Abs. 6 (Zusätzliche Leistungen):**
   - Wird eine im Vertrag nicht vorgesehene Leistung gefordert, hat der Auftragnehmer Anspruch auf besondere Vergütung. **Wichtig:** Der Anspruch muss **vor Ausführung der Leistung** dem Auftraggeber schriftlich angekündigt werden!
4. **BGB § 650b / § 650c (BGB-Bauvertrag seit 2018):**
   - Gesetzliches Anordnungsrecht des Bestellers für Änderungen des Werkerfolgs oder der Bauausführung.
   - Vergütungsberechnung nach den **tatsächlich erforderlichen Kosten** zuzüglich angemessener Zuschläge für Allgemeine Geschäftskosten (AGK) sowie Wagnis & Gewinn (W&G).
   - **80-%-Klausel (§ 650c Abs. 3 BGB):** Erzielen die Parteien innerhalb von 30 Tagen nach Zugang des Nachtragsangebots keine Einigung, kann der Bauunternehmer **80 % der im Nachtragsangebot angesetzten Vergütung** als Abschlagszahlung fordern.

---

### Bereich 5: Baustellencontrolling, Bautagebuch & Bauabnahme

#### Rechtssicheres Bautagebuch (Baustellenbericht):
Das Bautagebuch dient als zentrales Beweismittel in VOB-Streitigkeiten:
- **Witterung:** Temperatur (min/max), Niederschlag (Regen, Schnee), Windstärke, relative Luftfeuchtigkeit (relevant für Einbauverbote nach ATV DIN 18331/18350).
- **Personaleinsatz:** Gliederung nach eigenem Personal (Poliere, Facharbeiter, Helfer, Azubis) und Subunternehmern (Kopfzahl und geleistete Stunden).
- **Geräteeinsatz:** Großgeräte vor Ort (Kran, Bagger, Radlader, Rüstung) mit Betriebs- und Stillstandszeiten.
- **Leistungsfortschritt:** Konkrete Bauteil- und Raumangaben der erbrachten Tagesleistungen.
- **Bedenkenanzeige (VOB/B § 4 Abs. 3):** Schriftliche Mitteilung an den Bauherrn vor Ausführung fehlerhafter Vorleistungen anderer Gewerke oder ungeeigneter Baugrundverhältnisse.
- **Behinderungsanzeige (VOB/B § 6 Abs. 1):** Schriftliche Anzeige von Verzögerungen (fehlende Pläne, fehlende Baufreiheit, bauseitige Verzögerungen).
- **Fotodokumentation:** Offline-Speicherung mit EXIF-Metadaten (Zeitstempel, GPS-Koordinaten) und Zuordnung zu Bauteilen/Mängeln.

#### Bauabnahme (VOB/B § 12 & BGB § 640):
Mit der Abnahme kehrt sich die Beweislast für Mängel um und die Gewährleistungsfrist beginnt:
- **Abnahmestatus:**
  * *Ohne Vorbehalt:* Werk als im Wesentlichen vertragsgemäß anerkannt.
  * *Mit Vorbehalt:* Abnahme erfolgt, jedoch unter Vorbehalt bekannter Mängel (§ 12 Abs. 5 Nr. 3 VOB/B).
  * *Abnahme verweigert:* Wegen wesentlicher Mängel (§ 12 Abs. 3 VOB/B).
- **Rechtsfolgen-Tracking:** Exakte Berechnung des Beginns und Endes der Mängelhaftung (VOB/B: 4 Jahre für Bauwerke, 2 Jahre für elektrotechnische/maschinelle Anlagen; BGB: 5 Jahre für Bauwerke).
- **Digitale Signatur:** Rechtssichere Erfassung der Unterschriften von Bauherr/Architekt und Auftragnehmer auf Touch-Geräten.

---

### Bereich 6: Nachunternehmerverwaltung & Bau-Compliance

```mermaid
flowchart TD
    A[Eingangsrechnung Subunternehmer] --> B{Gültige Freistellung § 48b EStG?}
    B -->|Ja: Status VALID| C[100% Auszahlung an Subunternehmer]
    B -->|Nein: EXPIRED / FEHLT| D[15% Bauabzugsteuer einbehalten]
    D --> E[85% Auszahlung an Subunternehmer]
    D --> F[15% Anmeldung & Abführung an Finanzamt Formular USt 1 TG]
    A --> G{SOKA-BAU & Mindestlohn Nachweis}
    G -->|Geprüft & Bestätigt| H[Freigabe Zahlungsverkehr]
    G -->|Fehlt / Unvollständig| I[Zahlungsstopp wegen Durchgriffshaftung § 1a AEntG]
```

1. **Bauabzugsteuer nach § 48–48d EStG:**
   - Jeder Unternehmer, der eine Bauleistung im Inland an einen anderen Unternehmer erbringt, unterliegt dem Steuerabzug in Höhe von **15 % der Bruttorechnungssumme**.
   - **Befreiung:** Liegt eine gültige Freistellungsbescheinigung des zuständigen Finanzamts nach § 48b EStG vor, darf ohne Abzug ausgezahlt werden.
   - **Software-Pflicht:** Stammdatenverwaltung mit Gültigkeitsdatum, Vorwarnung vor Ablauf (z. B. 30 Tage vorher) und automatischer 15-%-Einbehalt bei abgelaufener Bescheinigung inkl. Erzeugung des Steueranmelde-Formulars.
2. **SOKA-BAU (Sozialkassen des Baugewerbes):**
   - Absicherung von Urlaubsansprüchen, Berufsbildung und Altersversorgung im Baugewerbe.
   - **Generalunternehmer-Haftung (§ 1a AEntG):** Der Hauptunternehmer haftet wie ein Bürge für die Beitragsabführung seiner Nachunternehmer.
3. **Mindestlohnkontrolle (MiLoG / AEntG):**
   - Überwachung der Einhaltung des gesetzlichen und branchenspezifischen Mindestlohns zur Vermeidung von Bußgeldern und Zoll-Verfahren (Finanzkontrolle Schwarzarbeit - FKS).

---

### Bereich 7: Steuerrecht, Finanzen & Banking

1. **Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG - Reverse Charge):**
   - Bei Bauleistungen zwischen bauleistenden Unternehmern (§ 13b Abs. 2 Nr. 4 UStG) sowie Gebäudereinigungsleistungen (§ 13b Abs. 2 Nr. 8 UStG) schuldet der Empfänger die Umsatzsteuer.
   - **Positionsbasierte Mischrechnung:** Innerhalb eines Belegs müssen 13b-Leistungen (0 % MwSt ausgewiesen, Netto = Brutto) und steuerpflichtige Leistungen (19 % MwSt, z. B. reine Materiallieferung oder Geräteverleih ohne Einbau) getrennt berechnet und in der E-Rechnung mit den Codes `VATEX-EU-AE` bzw. `AE` (Reverse Charge) und `S` (Standard) deklariert werden.
   - **Pflichttext auf dem Beleg (BT-120):** *"Steuerschuldnerschaft des Leistungsempfängers"*.
2. **Handwerkerleistungen für Privatkunden (§ 35a Abs. 3 EStG):**
   - Private Auftraggeber können $20\,\%$ von bis zu $6.000\,\text{€}$ reiner Arbeits-, Fahrt- und Maschinenkosten (max. $1.200\,\text{€}$ pro Jahr) direkt von ihrer tariflichen Einkommensteuer abziehen.
   - **Software-Pflicht:** Aufschlüsselungsblock auf der Rechnung, der die Lohn-, Fahrt- und Gerätekosten (inkl. USt) getrennt von den reinen Materialkosten ausweist.
3. **Banking & Intelligenter OPOS-Abgleich:**
   - Import von ISO 20022 XML-Dateien (**CAMT.053** Tagesauszug, **CAMT.052** Intraday) und Bank-CSV-Dateien aller führenden Institutsgruppen (Sparkassen, Volksbanken/FIDUCIA, Deutsche Bank, Commerzbank).
   - **4-Pass Matching Engine:**
     * *Pass 1:* Exakte Rechnungsnummer im Verwendungszweck + Betragsübereinstimmung.
     * *Pass 2:* Skontoverrechnung nach § 14 Abs. 4 Satz 1 Nr. 7 UStG unter Prüfung der Skontofrist gegen das Buchungsdatum.
     * *Pass 3:* Teilzahlung / Rest-OPOS Verbuchung bei Abschlagszahlungen.
     * *Pass 4:* Fuzzy-Suche nach Kunden-IBAN und Namensfragmenten.
4. **SEPA-Lastschriften (pain.008):**
   - Generierung von Lastschrift-XML nach ISO 20022 `pain.008.001.08` und `.001.02` für CORE- und B2B-Schemata.
   - Multi-PmtInf Blöcke für getrennte Sequenzen (`FRST`, `RCUR`, `OOFF`, `FNAL`) und TARGET2-Kalendervalidierung.

---

### Bereich 8: E-Rechnung EN 16931-1 & Branchenschnittstellen

```mermaid
graph LR
    subgraph "W-Link ERP Kern"
        DOC[Rechnung / Beleg]
    end
    subgraph "E-Rechnung Standards"
        DOC -->|CII XML EN 16931| XR[XRechnung 3.0.x]
        DOC -->|PDF/A-3 + fx-XMP| ZF[ZUGFeRD 2.3+ / Factur-X]
    end
    subgraph "Steuerberater & Großhandel"
        DOC -->|EXTF Format 700| DAT[DATEV SKR03 / SKR04]
        GH[Großhändler] -->|DATANORM 4/5 / IDS Connect| DOC
    end
```

1. **E-Rechnungspflicht (Wachstumschancengesetz 2025–2028):**
   - **XRechnung 3.0.x:** Reines CII (CrossIndustryInvoice) oder UBL XML für B2G (Leitweg-ID / BT-10) und B2B.
   - **ZUGFeRD 2.3+ / Factur-X 1.0.07:** PDF/A-3 Hybrid-Dokument mit eingebetteter XML-Datei, `/AFRelationship /Alternative`, XMP-Erweiterung `fx:DocumentType` und sRGB-Farbprofil.
   - **Bau-Sonderheit (BMF-Klarstellung):** Rechnungsbegründende Unterlagen (Aufmaße nach DA11/X31, Bautagebücher, Regieberichte) dürfen als strukturierte Binäranhänge (`rsm:AdditionalReferencedDocument`) direkt in die E-Rechnung eingebettet werden.
2. **DATEV EXTF Format 700:**
   - Export von Buchungsstapeln für Steuerberater (SKR03 / SKR04) mit automatischen Steuerschlüsseln:
     * *Reguläre Erlöse 19 %:* SKR03 `8400` / SKR04 `4400`.
     * *§ 13b Reverse Charge:* SKR03 `8337` (BU-Schlüssel `19`) / SKR04 `4337` (BU-Schlüssel `68`).
     * *Sicherheitseinbehalte (Forderungsabgrenzung):* SKR03 `1540` / SKR04 `1240`.
3. **Großhandels- & Material-Schnittstellen:**
   - **DATANORM 4.0 / 5.0:** Import von Artikelstammdaten, Warengruppen und Rabattsätzen.
   - **IDS Connect 2.5:** Direkter Absprung in den Großhandels-Webshop aus der ERP-Kalkulation heraus (Warenkorb-Import/Export).
   - **Open Masterdata / SHK Connect / OCI:** PunchOut-Kataloge und Cloud-Stammdatenaustausch.

---

### Bereich 9: Kalkulation & Baubetriebliches Controlling

1. **Zuschlagskalkulation (Kalkulation mit vorbestimmten Zuschlägen):**
   - **Einzelkosten der Teilleistungen (EKT):**
     $$\text{EKT} = \text{Lohnkosten} + \text{Materialkosten (Stoffe)} + \text{Gerätekosten} + \text{Sonstige Kosten (Nachunternehmer)}$$
   - **Gemeinkostenzuschläge:**
     * *Baustellengemeinkosten (BGK):* Vorhaltung, Baustelleneinrichtung, Bauleitung.
     * *Allgemeine Geschäftskosten (AGK):* Verwaltung, Büro, Geschäftsführung.
     * *Wagnis & Gewinn (W&G):* Unternehmerisches Risiko und kalkulierter Ertrag.
   - **Mittellohnberechnung:**
     $$\text{Mittellohn } (ML) = \frac{\sum (\text{Kopfzahl}_i \cdot \text{Stundenlohn}_i)}{\sum \text{Kopfzahl}_i} + \text{Lohnzusatzkosten (Sozialabgaben, Urlaub)}$$
2. **EFB-Preisblätter (Vergabehandbuch Bund - VHB):**
   - **EFB 221:** Preisermittlung bei Zuschlagskalkulation (Offenlegung der Kalkulationszuschläge für öffentliche Auftraggeber).
   - **EFB 222:** Preisermittlung bei Endsummenkalkulation.
   - **EFB 223:** Aufgliederung der Einheitspreise für jede LV-Position in Lohn, Stoffe, Geräte, Sonstige sowie Zeitansatz ($h/\text{Einheit}$).
3. **Soll-Ist-Projektcontrolling:**
   - Laufende Überwachung: *Vorkalkulation (Budget)* $\leftrightarrow$ *Auftragswert* $\leftrightarrow$ *Ist-Kosten (Eingangsrechnungen + Lohnrapporte)* $\leftrightarrow$ *Fakturiertes Aufmaß*.
   - Ermittlung des Deckungsbeitrags (DB I = Erlös - EKT, DB II = DB I - BGK) und Margen-Warnstufen (`HEALTHY`, `WARNING`, `CRITICAL`).

---

### Bereich 10: Zeiterfassung & Gerätedisposition

1. **BAG-Grundsatzurteil zur Zeiterfassung (BAG 2022 / ArbZG):**
   - Pflicht zur vollständigen, manipulationssicheren Erfassung von Beginn, Ende und Pausenzeiten aller Beschäftigten ab dem ersten Mitarbeiter.
   - Trennung von Produktivzeit (Baustelle/Gewerk), Rüstzeit (Laden, Vorbereiten im Lager), Fahrzeit (Wegezeit nach Tarifvertrag BRTV-Bau) und Schlechtwetterzeit (Saison-KUG).
2. **Gerätekosten nach Baugeräteliste (BGL / EUROLISTE):**
   - Erfassung von Maschinen (Bagger, Kräne, Verdichter, Reinigungsautomaten) mit Inventarnummer, UVV-Prüfterminen und Verrechnungssätzen ($€/h$ oder $€/\text{Tag}$).

---

### Bereich 11: Liegenschaften, Facility Management & Dauerrechnungen

1. **4-stufiger Property Tree (Objektbaum):**
   $$\text{Liegenschaft} \longrightarrow \text{Gebäude} \longrightarrow \text{Etage} \longrightarrow \text{Raum / Nutzfläche}$$
   - Raumdaten: Nutzungsart (Büro, Sanitär, Verkehrsfläche, Labor), Quadratmeter, Bodenbelag (Parkett, Linoleum, Fliesen, Teppich, Glas).
   - Vererbbare Rechnungsempfänger (Liegenschaft $\to$ WEG; Raum $\to$ gewerblicher Mieter; Verwaltung $\to$ Hausverwaltung).
2. **Reinigungs-LV & Putzpläne nach RAL / DIN 77400:**
   - Leistungswerte in $m^2/h$ (z. B. Büro $180\,m^2/h$, Sanitär $60\,m^2/h$).
   - Turnuslogik ($5\times/\text{Woche}$, alle $X$ Tage, $X\times/\text{Monat}$, jährlich).
   - **Bundesweiter Rahmentarifvertrag (RTV) Gebäudereinigung:**
     * 9 Lohngruppen (LG 1 bis LG 9 mit Branchenmindestlöhnen).
     * Automatische Zuschläge: Nachtarbeit ($+30\,\%$), Sonntagsarbeit ($+80\,\%$), Feiertagsarbeit ($+200\,\%$), Belastungszuschlag ($+25\,\%$).
3. **Wiederkehrende Abrechnungspläne (Dauerrechnungen):**
   - Automatisierte Massenabrechnungsläufe (Monat, Quartal, Jahr) im Modus Pauschale oder Einzelpositionen mit Snapshot- vs. Live-Preisen (`preise_live`).

---

## 4. Marktvergleich: Die 10 führenden Systeme im DACH-Benchmark

| Software / Hersteller | Zielgruppe & Fokus | Lizenzmodell & Preisanker | Offline-Fähigkeit | VOB/B & GAEB Tiefe | Mobile Apps & Store-Ratings | Schwachstellen & Marktfeedback |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| **pds Software**<br>(pds GmbH, Rotenburg/Wümme) | Mittelstand & Großbetriebe (Handwerk & Bau, 10–500 MA) | SaaS 90–230 €/User/Monat ODER Kauf ab 1.400–3.400 €/Platz zzgl. Cloud-Gebühren | 🟡 Teilweise (Mobile Apps mit Sync; Core Desktop Cloud/Server) | 🟢 Sehr tief (GAEB XML, REB, VOB/B, EFB, DATEV) | 🟡 Gemischt (3,3 bis 4,0 Sterne; teils Sync-Abbrüche) | Extrem teuer, hohe Schulungsaufwände, für Kleinbetriebe $<10$ MA überdimensioniert. |
| **BRZ**<br>(BRZ Deutschland GmbH, Nürnberg) | Mittelstand & Großunternehmen im Bauhauptgewerbe | SaaS / Enterprise-Miete (Preise nur auf Anfrage, hochpreisig) | 🟡 Teilweise (Mobile Baustellen-Tools; Core Web/Cloud) | 🟢 Referenz-Niveau (Vollständige Bau-FiBu, ARGE-Abrechnung) | 🟡 3,5 Sterne (Komplex in der mobilen Handhabung) | Sehr hohe Einführungskosten, komplexe Benutzeroberfläche, kein Einmalkauf. |
| **NEVARIS Build / Finance**<br>(Nemetschek Group, Bremen) | Architektur, Bauunternehmen, Ingenieure, Großprojekte | Kauf & Miete (Mittel- bis Hochpreissegment) | 🟡 Teilweise (Desktop lokal installierbar, Mobile Cloud) | 🟢 Sehr tief (BIM-Integration, GAEB 3.3, REB, EFB) | 🟡 3,6 Sterne | Hoher Schulungsbedarf, Fokus stark auf Planer/Großbau; für Handwerker zu schwerfällig. |
| **baufaktura**<br>(OneQrew / Huonker, Dormettingen) | Handwerker, Ausbau, Klein- bis Mittelbetriebe (1–20 MA) | Einmalkauf ECO 375 € / PREMIUM 695 € + Module (90–495 €) | 🟢 Sehr hoch (Klassische Windows Desktop-App) | 🟢 Gut (GAEB X83/X84, VOB-Aufmaß, DA11, E-Rechnung) | 🟡 Basic (Zeiterfassungs-App ab 7 €/Monat; ProvenExpert 4,59/5) | Veraltete UI-Fenstertechnik, kein integriertes Facility Management / Objektbäume. |
| **STREIT V.1 (STREIT)**<br>(STREIT Software, Haslach i.K.) | Elektro, SHK, Dachdecker, Bauhandwerk (5–100 MA) | Kauf- oder Mietlizenz (Intransparente Preise, ab ~1.500 €) | 🟡 Teilweise (Mobile Monteur-Apps mit Offline-Puffer) | 🟢 Sehr tief (GAEB, VOB, E-Rechnung, DATEV, Lager) | 🟡 Apple Store 3,8 / Google Play 3,7 (Performance-Kritik) | Hohe Folgekosten (Pflegeverträge, Schulungen), träge Performance nach Updates. |
| **KWP bnWin.net**<br>(KWP Informationssysteme, Ergolding) | SHK, Elektro, Kälte/Klima, Handwerk (3–50 MA) | Einmalkauf REGIE ab 900 € / BASIS ab 2.900 € netto | 🟡 Teilweise (bnApp mit Offline-Puffer) | 🟢 Sehr tief (GAEB, VOB, DA11, Datanorm, IDS Connect) | 🔴 Schlecht (Google Play 2,4 Sterne; Abstürze, Login-Hürden) | Mobile App stark fehlerbehaftet; starre Ausrichtung nur auf Baunebenhandwerk (kein FM/Reinigung). |
| **shm profit Handwerk**<br>(shm software, Bad Tölz) | Handwerk, SHK, Elektro, Bau (1–30 MA) | Einmalkauf ~1.780 € Vollversion zzgl. Module | 🟢 Hoch (Desktop lokal, Apps shm Mobil) | 🟢 Gut (GAEB, VOB, Teil-/Schlussrechnung, E-Rechnung) | 🟡 Kaum Bewertungen im Store | Installationsaufwand, hohe Modulpreise, keine moderne Web-/PWA-Technologie. |
| **123erfasst / Capmo / Craftnote** | Mobile Baustellendokumentation, Mängel, Bautagebuch | SaaS 20–60 €/Nutzer/Monat (Reine Baustellen-Tools) | 🟢 Sehr hoch (Spezialisierte Offline-First Mobile Apps) | 🟡 Mäßig (Kein vollwertiges ERP/Faktura; reine Baustellen-Spezialisten) | 🟢 4,3 bis 4,7 Sterne (Sehr gute mobile UX) | Keine eigene VOB-Rechnungslegung, keine DATEV-Erlöskontierung, kein Bankabgleich $\to$ Insellösung! |
| **EasyFirma 3**<br>(EasyFirma, Wien) | Kleinbetriebe, Handwerker, Dienstleister (1–5 MA) | Einmalkauf 295–495 € netto + Module (E-Rechnung 150 €) | 🟢 Sehr hoch (Windows Desktop lokal) | 🟡 Basic (Einfaches Aufmaß, E-Rechnung; kein GAEB X83-X89, kein DA11) | 🔴 Keine Mobile App vorhanden | Kein echtes VOB-Nachtragsmanagement, keine GAEB-Dateien, keine Objektverwaltung. |
| **W-Link ERP**<br>(*Rechnungsprogramm_Geb_V2*) | **Bauunternehmen, Handwerk, Ausbau, FM & Gebäudedienstleister** | **Transparenter Einmalkauf (490–990 €) + optionaler Pflegevertrag** | 🟢 **100 % Local-First (Electron + SQLite + SHA-256 Audit)** | 🟢 **Vollständig (GAEB X83/X84, REB 23.003, DA11, VOB/B, § 13b, § 48b, XRechnung 3.0, ZUGFeRD 2.3+)** | 🟡 **In Entwicklung (PWA Companion für Release 1.2)** | **Einzige Software am Markt, die Bau-VOB-Tiefe mit 4-stufiger FM-Objektverwaltung & RTV-Putzplänen vereint.** |

---

## 5. Granulare Soll-Ist-Vergleichsmatrix (W-Link ERP Codebase)

### 5.1 Methodik & Ampel-Definition
- 🟢 **Vollständig umgesetzt (PROD-Ready):** Vollständig im Datenmodell (`schema.js`), in Controllern (`controllers/`), Frontend-Skripten (`js/`), Views (`views/`, `code.html`) implementiert und durch automatisierte Tests abgedeckt.
- 🟡 **Teilweise umgesetzt (Partial / In Arbeit):** Solide Datenbasis und Kernlogik vorhanden, jedoch fehlen erweiterte Spezialformate, UI-Masken oder dedizierte Export-Container.
- 🔴 **Offen (Backlog / Geplant):** Funktion im Fachkatalog gefordert, aktuell noch nicht in der Codebase implementiert.

---

### 5.2 Tabellarische Feature-Matrix (50 Kriterien)

| # | Funktionsbereich & Kriterium | Gesetzlicher / Normativer Bezug | Ist-Stand W-Link ERP (Codebase & DB) | Status | Quellcode-Referenzen & Technische Einordnung |
| :---: | :--- | :--- | :--- | :---: | :--- |
| **1.0** | **Projekt- & LV-Management** | | | | |
| 1.1 | GAEB X83 Ausschreibungs-Import | GAEB DA XML 3.3 / 3.2 | `js/gaeb.js`, `js/projekte.js` | 🟢 | `GAEBEngine.parseGAEBXML`: Liest OZs, Mengenangaben, Einheiten, Kurz-/Langtexte ein und generiert Projekt-LVs. |
| 1.2 | GAEB X84 Angebotsabgabe-Export | GAEB DA XML 3.3 / 2000 | `js/gaeb.js` | 🟢 | `GAEBEngine.generateGAEBX84XML`: Erzeugt standardkonforme GAEB XML-Angebote mit Einheitspreisen. |
| 1.3 | GAEB Phasen X80, X81, X86, X89 | GAEB DA XML Phasen | `schema.js` (`gaeb_phase`), `js/einvoice.js` | 🟡 | X83/X84 produktiv. X86/X89 konzeptionell über XRechnung/CII abgedeckt; nativer X89-GAEB-Export im Backlog. |
| 1.4 | Mehrstufige LV-Hierarchie & OZ | VOB/A & GAEB OZ-Schema | `schema.js`, `positionen.oz_code`, `js/projekte.js` | 🟢 | Durchgängige Führung von OZs (`01.01.0010`) über Angebote, Aufmaße, Nachträge und Rechnungen. |
| 1.5 | Vollständige Dokumentenkette | HGB / GoBD | `dokumente`, `editor.js`, `projekte.js` | 🟢 | Nahtlose Wandlung: *Angebot $\to$ Auftragsbestätigung $\to$ Abschlagsrechnung $\to$ Schlussrechnung $\to$ Mahnung*. |
| **2.0** | **Aufmaß & Mengenermittlung** | | | | |
| 2.1 | REB 23.003 Formelrechner (01–91) | REB-VB 23.003 (2009/1979) | `controllers/AufmassController.js` | 🟢 | `evaluateFormula` & `calculateREBFormula`: Sicherer Sandbox-Rechner ohne unsicheres `eval()`, 4 Dezimalstellen Präzision. |
| 2.2 | DA11 Datenaustausch (Export/Import) | REB 23.003 (80-Zeichen Format) | `js/da11.js` | 🟢 | `DA11Service.generateDA11` & `parseDA11`: Satzart 11 (Kopf), Satzart 12 (Rechenzeilen), exakte 80-Zeichen-Spaltenausrichtung. |
| 2.3 | GAEB XML X31 Mengenermittlung | GAEB DA XML 3.3 X31 | `aufmass_blaetter`, `aufmass_zeilen` | 🟡 | DA11 vollständig. GAEB X31 XML-Container als modernes Austauschformat für Release 1.0.6 geplant. |
| 2.4 | Aufmaß-Center & Split-View | TopKontor/KWP Best Practice | `js/projekte.js`, `views/AufmassView.js` | 🟢 | Interaktive Gegenüberstellung von Soll-Menge (LV) vs. Ist-Menge (Aufmaßblätter) je OZ. |
| 2.5 | VOB/C Übermessungsregeln | ATV DIN 18299 ff. | `AufmassController.js` | 🟡 | Formelbasierte Erfassung mit Abzugs- und Vorzeichensteuerung (+/-); automatische Schwellenwert-Prüfung im Ausbau. |
| 2.6 | Schlussaufmaß-Konsolidierung | VOB/B § 14 Abs. 1 | `db.js` (`mergeSchlussaufmass`), `projekte.js` | 🟢 | Automatische Konsolidierung aller Teilaufmaßblätter in eine prüffähige Schlussaufmaß-Gesamtübersicht. |
| **3.0** | **VOB/B & BGB Abrechnung** | | | | |
| 3.1 | Kumulierte Abschlagsrechnung | $F_t = L_t - \sum F_i$ | `controllers/CumulativeBillingController.js` | 🟢 | `calculateCumulativeInvoice`: Automatische Verrechnung aller Vorrechnungen, Zuwachsbesteuerung, Cent-Rundung. |
| 3.2 | Sicherheitseinbehalt (§ 17 VOB/B) | VOB/B § 17 & BGB | `CumulativeBillingController.js`, `security_retentions` | 🟢 | 5 % Abzug vom Netto/Zahlbetrag, Gewährleistungsfristen (4 Jahre), `#EINBEHALT#` in E-Rechnung. |
| 3.3 | Bürgschaftsverwaltung & Ablösung | VOB/B § 17 Abs. 3 | `schema.js`, `security_retentions.status` | 🟡 | Status `GUARANTEE_SUBSTITUTED` in DB vorhanden; Dokumenten-Upload für Bürgschaftsurkunden im UI ausbaufähig. |
| 3.4 | Teilschluss- & Schlussrechnung | VOB/B § 14 / § 16 Abs. 2/3 | `dokumente.rechnungsart`, `editor.js` | 🟢 | Eigene Belegtypen mit automatischer Schlussrechnungs-Verprobung und Restforderungsermittlung. |
| **4.0** | **Nachtragsmanagement** | | | | |
| 4.1 | Rechtsgrundlagen-Klassifizierung | VOB/B § 2 Abs. 3/5/6, BGB § 650b | `controllers/NachtragController.js`, `nachtraege` | 🟢 | `rechtsgrundlage`: `VOB_2_5`, `VOB_2_6`, `VOB_2_3`, `BGB_650b` im Datenmodell und UI integriert. |
| 4.2 | Nachtrags-Workflow Engine | Bauvertragspraxis | `nachtraege.status`, `js/projekte.js` | 🟢 | Workflow: *Entwurf $\to$ Eingereicht $\to$ In Verhandlung $\to$ Genehmigt $\to$ Abgelehnt*. |
| 4.3 | Automatische Abrechnungsübernahme | VOB/B § 2 | `NachtragController.extractApprovedPositionsForInvoice` | 🟢 | Genehmigte Nachtragspositionen fließen per Klick direkt in die kumulierte Abschlagsrechnung ein. |
| 4.4 | Nachtragskalkulation & EKT | VHB / Urkalkulation | `NachtragController.calculateNachtragTotals` | 🟢 | Kostenartentrennung nach Lohn, Material, Gerät und Fahrt. |
| **5.0** | **Baustellenmanagement & Abnahme** | | | | |
| 5.1 | Digitales Bautagebuch | VOB/B § 4 / DIN 18299 | `controllers/BautagebuchController.js`, `bautagebuch` | 🟢 | Witterung, Temperaturen (min/max), Personal (Eigen/Sub), Großgeräte, Leistungsbericht, Vorkommnisse. |
| 5.2 | Behinderungs- & Bedenkenanzeige | VOB/B § 4 Abs. 3, § 6 Abs. 1 | `bautagebuch.vorkommnisse_behinderungen` | 🟢 | Dokumentation baubetrieblicher Störungen zur Fristwahrung und Enthaftung des Unternehmers. |
| 5.3 | Fotodokumentation | Beweissicherung | `bautagebuch.fotos_json` | 🟡 | JSON-Array für Bildpfade vorhanden; integrierte mobile Galerie mit Markierungs-Annotationen im Backlog. |
| 5.4 | Bauabnahmeprotokoll (VOB/B § 12) | VOB/B § 12 & BGB § 640 | `BautagebuchController.js`, `abnahmeprotokolle` | 🟢 | Status (Ohne/Mit Vorbehalt, Verweigert), digitale E-Signaturen von AG/AN, automatische Fristberechnung. |
| 5.5 | Mängelkataster & Fristen | VOB/B § 13 & BGB § 635 | `abnahmeprotokolle.maengel_json` | 🟡 | Mängel im Abnahmeprotokoll integriert; projektübergreifendes Mängelkataster für Release 1.1 geplant. |
| **6.0** | **Nachunternehmer & Compliance** | | | | |
| 6.1 | § 48b EStG Freistellungsprüfung | § 48b EStG Bauabzugsteuer | `controllers/SubcontractorController.js`, `ControllingController.js` | 🟢 | Automatische Statusprüfung (`VALID`/`EXPIRED`), 30-Tage-Ablaufwarnung, Warnbanner im Editor. |
| 6.2 | 15 % Bauabzugsteuer-Einbehalt | § 48 EStG | `SubcontractorController.calculateBauabzugsteuer` | 🟢 | Automatischer 15-%-Abzug vom Auszahlungsbetrag bei fehlender Freistellung. |
| 6.3 | SOKA-BAU Meldedaten | § 1a AEntG / BRTV-Bau | Bautagebuch-Stunden, DATEV EXTF | 🟡 | Arbeitsstunden und Lohnsummen liegen vor; standardisierte ZVK-Meldedatei für Release 2.0 geplant. |
| 6.4 | Mindestlohnkontrolle (MiLoG) | MiLoG / AEntG | `controllers/ReinigungController.js` (`pruefeMindestlohn`) | 🟢 | Tarifgruppen-Validierung (Gebäudereinigung LG 1 bis LG 9) integriert; Bauhauptgewerbe analog abbildbar. |
| **7.0** | **Steuerrecht, Finanzen & Banking** | | | | |
| 7.1 | § 13b UStG Reverse Charge (Mischung) | § 13b Abs. 2 Nr. 4/8 UStG | `controllers/InvoiceController.js`, `positionen.is13b`, `js/einvoice.js` | 🟢 | Positionsbasierte Mischrechnung, Pflichttext BT-120, Codeliste `VATEX-EU-AE` (BT-121). |
| 7.2 | § 35a EStG Handwerkerbonus | § 35a Abs. 3 EStG | `SubcontractorController.calculateSec35aBreakdown`, `js/einstellungen.js` | 🟢 | Getrennter Ausweis von Lohn-, Fahrt- und Gerätekosten inkl. USt im Beleg und PDF. |
| 7.3 | Bankkonto- & Auszugsimport | ISO 20022 CAMT.053/052 | `controllers/BankingController.js`, `bank_transaktionen` | 🟢 | Robuste Parser für Sparkasse, Volksbank, Deutsche Bank, Commerzbank; SHA-256 Deduplizierung. |
| 7.4 | Intelligenter 4-Pass OPOS-Abgleich | § 14 Abs. 4 UStG | `BankingController.js` (`autoMatchOpenItems`) | 🟢 | Automatischer Skontoabgleich, Mahnstopp, GoBD-Verriegelung (`was_locked_vor_zahlung`), Storno-Historie. |
| 7.5 | SEPA-Lastschriften (pain.008) | ISO 20022 pain.008.001.08 | `controllers/SepaController.js`, `kunden_sepa_mandate` | 🟢 | XSD-validiert, Pre-Notification (EPC 14 Tage), TARGET2-Bankarbeitstage, CORE & B2B Schemata. |
| 7.6 | Mahnwesen & Verzugszinsen | BGB §§ 286, 288 | `db.js`, `editor.js`, `code.html` | 🟢 | 3-stufiges Mahnwesen, Verzugszinsberechnung, Massenmahnlauf, GiroCode auf Mahnungen. |
| **8.0** | **E-Rechnung & Schnittstellen** | | | | |
| 8.1 | XRechnung 3.0.x (CII / UBL) | EN 16931-1 (B2G & B2B) | `js/einvoice.js` (`generateXRechnungXML`) | 🟢 | BG-23 Steueraufschlüsselung, BT-10 Leitweg-ID, BT-113 Vorausrechnungen, UN/ECE Rec 20 Einheiten. |
| 8.2 | ZUGFeRD 2.3+ / Factur-X PDF/A-3 | Factur-X 1.0.07 / PDF/A-3 | `main/zugferd-builder.js`, `js/einvoice.js` | 🟢 | Echter `@cantoo/pdf-lib` Container, `/AFRelationship /Alternative`, `fx:DocumentType`, sRGB OutputIntent. |
| 8.3 | DATEV EXTF Format 700 | DATEV Schnittstellenstandard | `js/datev.js` (`DATEVExporter.generateEXTFContent`) | 🟢 | Buchungsstapel für SKR03/SKR04 mit BU-Schlüsseln 19/68 für § 13b und Sicherheitseinbehaltskonten (1540/1240). |
| 8.4 | DATANORM 4.0 / 5.0 | Baustoffgroßhandel-Standard | `artikel` Tabelle (`schema.js`), `katalog` | 🟡 | DB-Struktur vorbereitet; dedizierter `.001`–`.005` Dateiparser im Backlog für Release 1.1. |
| 8.5 | IDS Connect 2.5 / Open Masterdata | Online-Großhandels-Webshops | - | 🔴 | Schnittstelle für Online-Warenkorbaustausch geplant für Release 2.0. |
| 8.6 | E-Mail-Versand (SMTP TLS) | GoBD / E-Mail Compliance | `main/email.js`, `email_versandhistorie` | 🟢 | Nodemailer-Integration, Port 465/587 TLS, sichere Passwort-Verschlüsselung, lückenlose Versandhistorie. |
| **9.0** | **Kalkulation & Controlling** | | | | |
| 9.1 | Zuschlagskalkulation (EKT + AGK/W&G) | VHB 2024/2026 | `positionen.cost_type`, `positionen.ek` | 🟡 | Kostenarten in Positionen aktiv; vollwertiger Zuschlagskalkulations-Editor mit Mittellohn im Ausbau. |
| 9.2 | EFB-Preisblätter 221 / 223 | VHB Bund Formblätter | Datenbasis in DB vorhanden | 🟡 | Kostenarten und Zeitansätze liegen vor; PDF-Druckgenerator für Formblätter 221/223 für Release 1.0.6. |
| 9.3 | Projekt-Soll-Ist-Controlling | Baubetriebliche Kostenrechnung | `controllers/ControllingController.js`, `eingangsrechnungen` | 🟢 | Budget-Überwachung, Deckungsbeitragsrechnung (DB I/II), Margenwarnstufen (`HEALTHY`, `WARNING`, `CRITICAL`). |
| 9.4 | Eingangsrechnungsverwaltung | GoBD / OPOS Kreditoren | `eingangsrechnungen` (`schema.js`), `js/projekte.js` | 🟢 | Zuordnung zu Projekten, Kostenarten, Fälligkeiten, § 48b Prüfung und Zahlungsstatus. |
| **10.0** | **Zeiterfassung & Fuhrpark** | | | | |
| 10.1 | Baustellen-Zeiterfassung | BAG Urteil 2022 / ArbZG | `bautagebuch.personal_eigen_stunden`, `personal_sub_json` | 🟢 | Tagesbasierte Stundenerfassung im Bautagebuch aktiv. |
| 10.2 | Mobile Live-Stempeluhr (App) | ArbZG / MiLoG | - | 🔴 | PWA/Offline-Companion für Handwerker-Smartphones für Release 1.2 geplant. |
| 10.3 | Geräte- & Maschinenverwaltung | BGL / EUROLISTE | `bautagebuch.geraete_json` | 🟡 | Geräteeinsatz im Bautagebuch erfassbar; eigenständiger Gerätestamm im Backlog. |
| **11.0** | **Facility Management & Dauerrechnung** | | | | |
| 11.1 | 4-stufiger Property Tree | Liegenschaft $\to$ Gebäude $\to$ Etage $\to$ Raum | `liegenschaften`, `gebaeude`, `etagen`, `raeume`, `ObjektController.js` | 🟢 | Vollständiger Objektbaum mit Löschschutz, Flächenangaben und vererbbaren Rechnungsempfängern. |
| 11.2 | Reinigungs-LV & Putzpläne | RAL / DIN 77400 | `controllers/ReinigungController.js`, `lv_bereiche`, `lv_positionen`, `putzplan.js` | 🟢 | Jahresleistungsberechnung ($m^2/h$), Turnuslogik, Raumbezug und LV-Übernahme in Rechnungen. |
| 11.3 | Bundesweiter RTV Gebäudereinigung | RTV 2026/2027 | `ReinigungController.js`, `js/putzplan.js` | 🟢 | Zuschläge (Nacht +30%, Sonntag +80%, Feiertag +200%, Belastung +25%) und 9 Lohngruppen (LG 1–9). |
| 11.4 | Wiederkehrende Dauerrechnungen | Dauerschuldverhältnisse | `controllers/DauerrechnungController.js`, `abrechnungsplaene`, `dauerrechnung_laeufe` | 🟢 | Automatischer Tageslauf, Vorschau mit Rückstau-Erkennung, Snapshot- vs. Live-Preise (`preise_live`). |
| **12.0** | **GoBD & Datensouveränität** | | | | |
| 12.1 | GoBD-Festschreibung & Hashkette | GoBD 2.0 (BMF) | `main/audit.js`, `audit_logs`, `js/gobd.js`, `dokumente.isLocked` | 🟢 | SHA-256 Hashverkettung in derselben Transaktion; Entsperrung nur mit Begründungspflicht. |
| 12.2 | 100 % Offline-Datensouveränität | DSGVO / Zero-Cloud-Zwang | Electron ^32, `better-sqlite3` ^12.6, 194/194 Tests | 🟢 | Lokale SQLite-Datenbank, sub-sekunden Reaktionszeit, vollkommen unabhängig von Internetverbindungen. |
| 12.3 | Revisionssicheres Auto-Backup | GoBD Datenverfügbarkeit | Manuelles Backup vorhanden | 🟡 | SQLite-Dateiexport aktiv; automatisierter Backup-Scheduler beim Schließen für Release 1.0.6. |

---

### 5.3 Quantitativer Erfüllungsgrad & Testergebnisse

```mermaid
pie title Erfüllungsgrad der Bau-ERP Kriterien in W-Link ERP (Stand August 2026)
    "Vollständig umgesetzt (🟢 Grün)" : 76
    "Teilweise umgesetzt (🟡 Gelb)" : 18
    "Offen / Geplant (🔴 Rot)" : 6
```

- **Gesamtzahl analysierter Kernkriterien:** 50 Kriterien
- 🟢 **Vollständig umgesetzt (PROD-Ready):** **38 Kriterien (76,0 %)**
- 🟡 **Teilweise umgesetzt (In Arbeit / Basis vorhanden):** **9 Kriterien (18,0 %)**
- 🔴 **Offen / Zukünftige Roadmap:** **3 Kriterien (6,0 %)**
- **Automatisierte Test-Abdeckung:** **194 von 194 Tests erfolgreich (100 % Pass Rate)**

---

## 6. Unsere Alleinstellungsmerkmale (USPs) & Wettbewerbsvorteile

```mermaid
graph TD
    USP[W-Link ERP Alleinstellungsmerkmale]
    USP --> U1[USP 1: Hybride Synthese Bau + Facility Management]
    USP --> U2[USP 2: Echtes Einmalkauf-Modell gegen Abo-Müdigkeit]
    USP --> U3[USP 3: Modernste E-Rechnungs- & Banking-Engine]
    USP --> U4[USP 4: 100% Offline-Fähigkeit & Lokale Datensouveränität]
```

### USP 1: Die perfekte Synthese aus Bau, Handwerk und Facility Management (Einzigartig am Markt)
Während der Markt strikt fragmentiert ist – reine Bauprogramme (*baufaktura, KWP, STREIT*) ignorieren Liegenschaften und Putzpläne; Reinigungssoftware (*CleanManager, SAPHIR*) versteht weder VOB-Kumulation, REB 23.003 noch GAEB –, schlägt W-Link ERP die Brücke:
Ein Bau-, Ausbau- oder Reinigungsbetrieb kann in derselben Software GAEB-Leistungsverzeichnisse ausschreiben, DA11-Aufmaße erfassen, VOB/B-kumulierte Rechnungen mit 5 % Sicherheitseinbehalt fakturieren und gleichzeitig Liegenschaften mit Putzplänen nach RTV-Tarifwerk und automatischen Dauerrechnungen verwalten.

### USP 2: Echtes transparentes Einmalkauf-Modell gegen „Abo-Müdigkeit“
Kleine und mittelständische Betriebe (1 bis 20 Mitarbeiter) wehren sich zunehmend gegen explodierende monatliche Softwareabos (die bei 5 Arbeitsplätzen schnell 5.000 bis 10.000 € pro Jahr verschlingen). W-Link ERP bietet ein faires Einmalkauf-Modell (z. B. 490–990 € Einmalkauf zzgl. optionalem Pflegevertrag für 15 % p.a.). Dies stellt ein unschlagbares Vertriebsargument dar.

### USP 3: Hochmoderne E-Rechnungs- und Banking-Engine (100 % konform Stand 2026/2027)
- **Echtes ZUGFeRD 2.3+ PDF/A-3:** Native Einbettung von CII XML mit sRGB-OutputIntent und Factur-X XMP-Extension-Schema (kein fehlerhafter Fake-Container).
- **Intelligenter 4-Stufen-OPOS-Zahlungsabgleich:** Verarbeitet CAMT.053/052 und alle deutschen CSV-Formate mit automatischer Skontoprüfung nach § 14 Abs. 4 Satz 1 Nr. 7 UStG und GoBD-Festschreibung.
- **SEPA pain.008.001.08:** Multi-PmtInf-Generierung für getrennte Sequenzen (`FRST`/`RCUR`) und TARGET2-Kalenderprüfung.

### USP 4: Maximale Datensouveränität & blitzschnelle Performance
Dank Electron und `better-sqlite3` läuft das System lokal auf dem Rechner des Kunden. Es entstehen keine Cloud-Ausfallzeiten, keine Abhängigkeit von Internetverbindungen auf abgelegenen Baustellen und kein Risiko bezüglich DSGVO-Datenschutzverletzungen durch Drittanbieter-Server. 194/194 automatisierte Tests garantieren maximale Code-Stabilität.

---

## 7. Strategische Roadmap & Priorisierter Umsetzungsplan (Phasen 1 bis 4)

```mermaid
gantt
    title W-Link ERP Entwicklungs-Roadmap (2026 - 2027)
    dateFormat  YYYY-MM-DD
    section Phase 1 (Sofort / Q3 2026)
    GAEB X31 XML Mengenermittlung       :done, p1_1, 2026-08-01, 2026-08-25
    EFB-Preisblätter 221 / 223 PDF     :active, p1_2, 2026-08-26, 2026-09-15
    Automatischer Backup-Scheduler      :p1_3, 2026-09-01, 2026-09-20
    section Phase 2 (Q4 2026 / Release 1.1)
    Zuschlagskalkulation & Mittellohn   :p2_1, 2026-10-01, 2026-11-15
    DATANORM 4.0 / 5.0 Dateiparser     :p2_2, 2026-10-15, 2026-11-30
    Projektübergreifendes Mängelkataster :p2_3, 2026-11-01, 2026-12-15
    section Phase 3 (Q1-Q2 2027 / Release 1.2)
    Mobile Baustellen PWA (Offline)    :p3_1, 2027-01-10, 2027-03-31
    Zwei-Wege-Sync Engine (CRDT/SQLite):p3_2, 2027-02-01, 2027-04-30
    section Phase 4 (Q3-Q4 2027 / Release 2.0)
    IDS Connect 2.5 & SHK Connect      :p4_1, 2027-06-01, 2027-08-31
    SOKA-BAU Meldedatei Export         :p4_2, 2027-08-01, 2027-10-15
```

### Phase 1: Sofortmaßnahmen & Feinschliff (Release 1.0.6 – Q3 2026)
1. **EFB-Preisblätter 221 & 223 PDF-Generator:**
   - Bereitstellung druckfertiger EFB-Formulare für öffentliche Ausschreibungen direkt aus den kalkulierten Positionsdaten.
2. **GAEB XML X31 Mengenermittlung:**
   - Ergänzung des bestehenden DA11-Moduls um den modernen XML-Export nach GAEB DA XML 3.3 Phase X31.
3. **Automatisierter Backup-Scheduler:**
   - Konfigurierbare tägliche Sicherung der SQLite-Datenbankdatei beim Schließen der Anwendung.

### Phase 2: Kalkulations- & Aufmaßvertiefung (Release 1.1 – Q4 2026)
1. **Vollwertiger Zuschlagskalkulations-Editor:**
   - Interaktive Maske zur Erfassung von Mittellöhnen, Lohnzusatzkosten, Baustellengemeinkosten (BGK), Allgemeinen Geschäftskosten (AGK) sowie Wagnis & Gewinn (W&G).
2. **DATANORM 4.0 & 5.0 Import-Engine:**
   - Schnelles Einlesen von Großhandelskatalogen (`.001`–`.005`) in den lokalen Artikelstamm.
3. **Projektübergreifendes Mängelkataster:**
   - Zentrale Übersicht aller offenen Mängel aus Abnahmeprotokollen mit automatischer Fristüberwachung und Mahnstufen für Nachunternehmer.

### Phase 3: Mobile Zeiterfassung & Baustellenbegleiter (Release 1.2 – Q1/Q2 2027)
1. **Mobile Progressive Web App (PWA) / Companion App:**
   - Offline-fähige Stempeluhr für Handwerker und Monteure (Kommen, Gehen, Pause, Baustellenzuordnung via GPS/QR-Code).
2. **Offline-First Bautagebuch & Fotoupload:**
   - Mobiles Erfassen von Witterung, Vorkommnissen und Fotodokumentation direkt vor Ort.
3. **Zwei-Wege-Synchronisations-Engine:**
   - Sichere Replikation zwischen mobiler SQLite-Datenbank und Desktop-ERP via CRDT-Delta-Sync.

### Phase 4: Großhandelsintegration & SOKA-BAU Compliance (Release 2.0 – Q3/Q4 2027)
1. **IDS Connect 2.5 & SHK Connect Webshop-Anbindung:**
   - Online-Warenkorbaustausch und Preisauskunft mit Baustoff- und SHK-Großhändlern.
2. **SOKA-BAU Meldedaten-Export:**
   - Automatisierte Erzeugung von monatlichen Meldedateien für die Sozialkassen des Baugewerbes.

---

## 8. Fazit & Handlungsempfehlung

Die vorliegende Deep-Research-Analyse belegt, dass **W-Link ERP (*Rechnungsprogramm_Geb_V2*)** bereits heute über eine **außergewöhnlich reife, baubetrieblich fundierte und rechtssichere Softwarebasis** verfügt. Mit einem Erfüllungsgrad von **76,0 % (38 von 50 Kriterien vollständig umgesetzt)** übertrifft das System bereits viele etablierte Desktop-Wettbewerber im Einstiegs- und Mittelpreissegment.

Besonders in den komplexen Bereichen **VOB/B-Kumulation ($F_t = L_t - \sum F_i$)**, **§ 13b Reverse-Charge Mischrechnung**, **§ 48b Bauabzugsteuer**, **REB 23.003 / DA11 Formelaufmaß**, **ZUGFeRD 2.3+ PDF/A-3** und **4-stufiger FM-Objektverwaltung** setzt W-Link ERP neue Maßstäbe für Desktop-ERP-Lösungen.

Durch die konsequente Umsetzung der definierten **Roadmap-Phasen 1 bis 3 (EFB-Preisblätter, GAEB X31, Zuschlagskalkulation und mobiler PWA-Offline-Companion)** wird W-Link ERP seine Position als führende, bezahlbare und datensouveräne Branchenlösung für die deutsche Bau- und Gebäudewirtschaft im DACH-Raum nachhaltig festigen.
