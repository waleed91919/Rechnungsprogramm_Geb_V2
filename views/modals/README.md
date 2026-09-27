# Modulares Komponentenkonzept: views/modals/

Dieses Verzeichnis enthält sämtliche ausgelagerten Modal-Dialoge, Assistenten und Formular-Overlays des W-Link ERP-Systems als eigenständige HTML-Partials.

## Zielsetzung & Architektur
Ursprünglich enthielt die zentrale Datei `code.html` über 6.170 Zeilen, wovon ca. 3.042 Zeilen (~50%) ausschließlich auf 34 statisch inline definierte Modale entfielen.
Durch die Modularisierung wurden:
1. **Wartbarkeit**: Alle Dialoge sind in thematisch isolierte, eigenständige HTML-Dateien unter `views/modals/` gegliedert.
2. **Entwickler-Ergonomie**: Änderungen an Formularen, Validierungsfeldern oder Tailwind-Designs können zielgerichtet vorgenommen werden.
3. **100% Abwärtskompatibilität**: Alle 698+ DOM-IDs, Klassen und Event-Handler bleiben unverändert erhalten.
4. **Schlanker Lader-Mechanismus**: Über `js/modal-loader.js` werden die Modale beim Start synchron in den DOM (`#modals-container`) eingehängt, sodass nachfolgende Controller und Event-Listener (`editor.js`, `kunden.js`, `banking.js` etc.) unterbrechungsfrei funktionieren.

---

## Verzeichnisstruktur

### 1. Einzelne Modal-Partials (38 Dateien)

| Partial-Datei | Modal-ID | Modul / Bereich | Beschreibung |
|---|---|---|---|
| `artikel-modal.html` | `artikel-modal` | Stammdaten | Artikel anlegen/bearbeiten inkl. GPSR & 4-Bilder-Upload |
| `kunde-modal.html` | `kunde-modal` | Stammdaten | Kunde anlegen/bearbeiten inkl. Quick-Paste Adressparser |
| `objekt-modal.html` | `objekt-modal` | Stammdaten (F1) | Liegenschaft, Gebäude, Etage, Raum hierarchisch |
| `bank-konto-modal.html` | `bank-konto-modal` | Banking & OPOS | Bankkonten & IBAN/BIC-Verwaltung |
| `sepa-prenot-modal.html` | `sepa-prenot-modal` | Banking & SEPA | SEPA Pre-Notification Vorabinformation Text |
| `mandat-modal.html` | `mandat-modal` | Banking & SEPA | SEPA-Lastschriftmandat (CORE / B2B) |
| `sepa-lauf-detail-modal.html` | `sepa-lauf-detail-modal` | Banking & SEPA | Postenanzeige für generierte Lastschriftläufe |
| `aufmassblatt-modal.html` | `aufmassblatt-modal` | Bau & Aufmaß | Aufmaßblatt-Editor nach REB 23.003 / GAEB |
| `nachtrag-modal.html` | `nachtrag-modal` | Bau & VOB | VOB/B Nachtragsprüfung und Freigabe |
| `abnahme-modal.html` | `abnahme-modal` | Bau & VOB | Digitales Abnahmeprotokoll mit Canvas-Signatur |
| `eingangsrechnung-modal.html` | `eingangsrechnung-modal` | Bau & Controlling | Eingangsrechnung mit § 48b Bauabzugsteuer-Split |
| `aufmass-wizard-modal.html` | `aufmass-wizard-modal` | Bau & Aufmaß | 2-Schritt-Assistent (Frei, Spalten, Raum) |
| `formelassistent-modal.html` | `formelassistent-modal` | Bau & Aufmaß | Formelauswahl- & Werteingabe-Assistent |
| `aufmass-uebergabe-modal.html` | `aufmass-uebergabe-modal` | Dokumentenfluss | Übergabe Aufmaß -> Abschlags-/Schlussrechnung |
| `aufmass-modal.html` | `aufmass-modal` | Phase 2 Aufmaß | Live-Mengenberechnung im Rechnungseditor |
| `lv-bereich-modal.html` | `lv-bereich-modal` | Reinigungs-LV (F3) | Bereich/Raumgruppe für Leistungsverzeichnis |
| `lv-position-modal.html` | `lv-position-modal` | Reinigungs-LV (F3) | Leistungsposition & Turnuskalkulation |
| `lv-eintrag-modal.html` | `lv-eintrag-modal` | Reinigungs-LV (F3) | Zuordnung Position <-> Raum/Objekt |
| `zuschlagsprofil-modal.html` | `zuschlagsprofil-modal` | Reinigungs-LV (F3) | Erschwernis-, Nacht-, Sonntagszuschläge |
| `smtp-konto-modal.html` | `smtp-konto-modal` | E-Mail (F10) | SMTP-Server & Authentifizierungskonfiguration |
| `email-modal.html` | `email-modal` | E-Mail (F10) | Belegversand-Dialog mit Vorschau & Anhang |
| `plan-modal.html` | `plan-modal` | Dauerrechnungen (F2) | Abrechnungsplan mit Intervall & Pauschalen |
| `generierung-modal.html` | `generierung-modal` | Dauerrechnungen (F2) | Vorschau fälliger Dauerrechnungsläufe |
| `sammel-modal.html` | `sammel-modal` | Dauerrechnungen (F2) | Erzeugung aggregierter Sammelrechnungen |
| `storno-lauf-modal.html` | `storno-lauf-modal` | Dauerrechnungen (F2) | GoBD-konformer Stornodialog für Dauerrechnungsläufe |
| `rechnung-modal.html` | `rechnung-modal` | Rechnungseditor | Zentraler Hauptbeleg-Editor (Rechnung, Angebot, etc.) |
| `projekt-modal.html` | `projekt-modal` | Projekte | Projekt-Neuanlage mit Sicherheitseinbehalt |
| `pdf-preview-modal.html` | `pdf-preview-modal` | Dokumente | Druck- und PDF-Seitenvorschau |
| `steuerbericht-modal.html` | `steuerbericht-modal` | Berichte & DATEV | USt-Voranmeldung & Steuerjournal |
| `restore-modal.html` | `restore-modal` | System & Backup | Sicherheitsdialog für Datenbankwiederherstellung |
| `extend-deadline-modal.html` | `extend-deadline-modal` | Mahnwesen | Zahlungszielanpassung |
| `mahnung-modal.html` | `mahnung-modal` | Mahnwesen | Erstellung Mahnung Stufe 1-3 |
| `help-modal.html` | `help-modal` | System & Hilfe | Tastatur-Shortcuts und Dokumentation |
| `custom-confirm-modal.html` | `custom-confirm-modal` | UI Utilities | Generischer, asynchroner Bestätigungsdialog |
| `maengel-modal.html` | `mangel-create-modal` | Mängelkataster | Erfassung von Gewährleistungsmängeln |
| `soka-nachweis-modal.html` | `nachweis-modal` | SOKA-BAU & Lohn | Nachweishinterlegung (Freistellung, Unbedenklichkeit) |
| `ids-connect-modals.html` | `quick-launch-modal`, `konto-modal` | Großhandel & IDS | IDS Connect 2.5 Shop-Sprung & Lieferantenkonten |
| `efb-modal.html` | `efb-export-modal` | EFB VHB Bund | Export Formblatt 221 / 223 |

### 2. Domain-Bundles (7 Verbund-Partials)
Für vereinfachte Einbindung nach Fachbereichen stehen folgende Bundles bereit:
- `banking-modals.html`: Bankkonten, SEPA Pre-Not, Mandate, Lastschriftlauf
- `aufmass-modals.html`: Aufmaßblatt, Nachtrag, Abnahme, Eingangsrechnung, Assistenten
- `stammdaten-modals.html`: Artikel, Kunden, Objekte
- `lv-modals.html`: Bereiche, Positionen, Einträge, Zuschlagsprofile
- `email-modals.html`: SMTP-Konten, E-Mail-Belegdialog
- `dauerrechnung-modals.html`: Abrechnungsplan, Vorschau, Sammelrechnung, Storno
- `system-modals.html`: Projekt, PDF-Preview, Steuerbericht, Backup-Restore, Mahnung, Shortcuts

---

## JavaScript Loader (`js/modal-loader.js`)

Der Loader stellt das globale Objekt `window.ModalLoader` bereit:

```javascript
// Prüfen, ob ein Modal eingehängt ist
ModalLoader.isMounted('rechnung-modal');

// Markup eines Modals abrufen
const html = ModalLoader.getHtml('aufmass-modal');

// Einzelnes Modal manuell in einen Zielcontainer mounten
ModalLoader.mountModal('kunde-modal', document.getElementById('my-container'));

// Alle Modale synchron in #modals-container einhängen
ModalLoader.mountAll();

// Asynchrones Neuladen während der Entwicklung (Hot-Reload)
await ModalLoader.reloadModal('artikel-modal');
```

### Automatische Synchronisation
Wenn Partials in `views/modals/*.html` angepasst werden, kann der Cache in `js/modal-loader.js` mit folgendem Skript aktualisiert werden:
```bash
node scripts/sync_modals.js
```
