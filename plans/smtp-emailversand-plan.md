# PLAN F10 – E-MAIL-VERSAND (SMTP) FÜR RECHNUNGEN / MAHNUNGEN / ANGEBOTE

**Version:** 1.0 (Erstplan, 24.08.2026)
**Autor:** Planungs-Subagent gemäß Aufgabenstellung
**Umsetzer:** Code-Subagent
**Voraussetzung:** Keine harten Vorbedingungen aus F3 – unabhängig umsetzbar; empfohlen NACH Putzplan/LV (Reihenfolge laut Auftrag).
**Projektkonvention:** Produktionscode OHNE Kommentare. UI-Texte deutschsprachig. Nur diese Plan-Datei + die in §7 genannten Dateien anfassen.

---

## 0. Ziel & Scope

- **Beleg-Versand per SMTP** direkt aus der App: Rechnungen, Mahnungen (je Stufe), Angebote – PDF wird automatisch als Anhang erzeugt (bestehender Renderer-PDF-Pfad, kein zweiter Rendering-Weg).
- **SMTP-Kontenverwaltung** in Einstellungen (mehrere Konten, Testverbindung-Button), Credentials verschlüsselt (Electron `safeStorage`/DPAPI auf Windows), NIEMALS Klartext zurück an den Renderer.
- **Versandhistorie** je Beleg (erfolgreich UND fehlgeschlagen, mit Fehlermeldung/Message-ID), manueller Wiederholen-Button.
- **GoBD:** Versand ist METADATEN – Beleginhalt/-hash bleibt unberührt; Historie+Audit ergänzen die Kette, brechen sie nie (explizit §5.5).
- **NICHT im Scope:** OAuth2/XOAUTH2 (M365-Basic-Abschaltung → Offene Frage Nr. 2), Massen-/Gruppenversand, Peppol/Empfang, EML-Ablagearchiv, HTML-Mail-Designer (nur Textkörper mit Signatur).

**Wiederverwendung statt Neubau:** PDF-Erfassung exakt nach ZUGFeRD-Muster (`toPdfBuffer` main.js:99–112, `printToPdfWithTimeout` main.js:114–130, Sichtseiten-Render über `#print-template` js/editor.js:749–790); Belegdaten aus bestehendem State; Einstellungs-Key-Mechanik (`db:saveEinstellung`); Modal-/Toast-/Buttonmuster der pdf-preview-modal (views/InvoiceView.js:28–118).

---

## 1. RECHERCHESTAND SMTP/NODEMAILER (QUELLEN, STAND 24.08.2026)

| Thema | Befund (umgesetzt in §4) |
|---|---|
| Bibliothek | `nodemailer` ist NICHT installiert (package.json dependencies: @cantoo/pdf-lib, better-sqlite3, fontkit, qrcode) → Schritt 1: `npm install nodemailer` (reines JS, kein native rebuild, landet automatisch im electron-builder-Paket `files:"**/*"`). |
| Port/TLS | Port **465** = implizites TLS → `secure:true`; Port **587** = STARTTLS → `secure:false` (nodemailer upgraded automatisch, solange nicht `ignoreTLS`); RFC 8314 hält beide für aktuell. UI-Select setzt `secure` passend zum Port vor. |
| verify() | `transporter.verify()` prüft DNS, TCP, TLS-Upgrade und Auth OHNE Mailversand → Testverbindung-Button + vor jedem Senden. |
| Timeouts | Explizit setzen für Desktop-UX: `connectionTimeout:15000`, `greetingTimeout:15000`, `socketTimeout:30000` (Defaults 120000/30000/600000 sind zu träge für Dialoge). |
| TLS-Härtung | `tls:{ minVersion:'TLSv1.2', rejectUnauthorized:true }`; bei Host=IP zwingend `tls.servername`. |
| Gmail | Nur mit **App-Passwort** (2FA aktiviert), `smtp.gmail.com` 465/587 – Hinweistext im Einstellungs-Dialog. |
| Fehlerbilder | ETIMEDOUT/ECONNREFUSED (Firewall/ISP blockt Port 25/465/587), 535 Auth-Fehler, TLS-Mismatch (secure falsch zum Port) → deutsche Meldungsübersetzung in `uebersetzeSmtpFehler(err)` (§4.4). |
| Credentials | Nie im Renderer halten; Transporter nur im Main-Prozess (App nutzt `contextIsolation:true`, `nodeIntegration:false`, main.js:12–16). |

Quellen: nodemailer.com/smtp (Transport-Optionen/verify/Timeouts, abgerufen 24.08.2026); nodemailer/nodemailer GitHub README (TLS-Fehlersuche, secure-Regel); courier.com SMTP-Fehlerguide (RFC 8314, Port-Blocking, 24.08.2026); mailslurp SMTP-Guide (verify vor Produktivverkehr, Timeouts); Electron-Dokumentation safeStorage (electronjs.org/docs/latest/api/safe-storage): Windows = DPAPI-Schutz, `isEncryptionAvailable()` erst nach app-ready, Linux-Rückfall „basic_text“ = ungeschützt → Fallback-Verhalten §3.3.

---

## 2. DB-SCHEMA

### 2.1 Tabelle `email_versandhistorie`

In `schema.js::createSchema()` neuer Block (Marker wie F1–F3: `// --- E-Mail-Versand (F10) ---`):

| Spalte | Typ | NULL | Default | Anmerkung |
|---|---|---|---|---|
| id | INTEGER PK AUTOINCREMENT | NO | – | |
| beleg_typ | TEXT NOT NULL CHECK(beleg_typ IN ('RECHNUNG','ANGEBOT','MAHNUNG')) | NO | – | |
| beleg_id | INTEGER NOT NULL, FK → dokumente(id) (**NO ACTION**) | NO | – | Bei MAHNUNG: id der RECHNUNG (Mahnung hat keinen eigenen Belegdatensatz, Felder mahnungLevel/Datum/Gebuehr liegen auf dokumente) |
| mahnstufe | INTEGER CHECK(mahnstufe IS NULL OR mahnstufe BETWEEN 1 AND 3) | YES | NULL | nur beleg_typ='MAHNUNG' |
| empfaenger | TEXT NOT NULL | NO | – | Hauptempfänger (E-Mail-Adresse) |
| cc | TEXT | YES | NULL | Komma-separiert |
| bcc | TEXT | YES | NULL | Komma-separiert |
| betreff | TEXT NOT NULL | NO | – | |
| nachricht_text | TEXT | YES | NULL | Gesendeter Textkörper (Basis für Wiederholen) |
| status | TEXT NOT NULL DEFAULT 'VERSANDT' CHECK(status IN ('VERSANDT','FEHLGESCHLAGEN')) | NO | 'VERSANDT' | Zeile wird IMMER geschrieben – auch bei Fehler (§5.3) |
| versuche | INTEGER DEFAULT 1 CHECK(versuche >= 1) | NO | 1 | Wiederholen erhöht |
| fehlermeldung | TEXT | YES | NULL | Pflicht-artig bei FEHLGESCHLAGEN |
| message_id | TEXT | YES | NULL | nodemailer `info.messageId` |
| smtp_response | TEXT | YES | NULL | nodemailer `info.response` (Serverzeile) |
| smtp_konto_name | TEXT | YES | NULL | Anzeige ohne Konto-ID-Abhängigkeit |
| pdf_dateiname | TEXT | YES | NULL | Anhangname, z. B. `Rechnung_INV-2026-042.pdf` |
| pdf_sha256 | TEXT | YES | NULL | Integritätsnachweis des gesendeten Anhangs (GoBD-freundlich, ohne Blob) |
| pdf_pfad | TEXT | YES | NULL | Nur wenn Einstellung `email_pdf_kopie_speichern`='true': Kopie unter `<userData>/email-outbox/<id>_<dateiname>` |
| gesendet_am | DATETIME | YES | NULL | Zeitpunkt des Versuchs (erfolgreich oder fehlgeschlagen) |
| erstellt_am | DATETIME DEFAULT CURRENT_TIMESTAMP | NO | – | |

```sql
CREATE INDEX IF NOT EXISTS idx_email_historie_beleg ON email_versandhistorie(beleg_typ, beleg_id);
CREATE INDEX IF NOT EXISTS idx_email_historie_status ON email_versandhistorie(status, gesendet_am);
```

### 2.2 SMTP-Konten + Mailtexte als Einstellungen-Keys (KEINE Kontentabelle)

| Key | Inhalt |
|---|---|
| `smtp_konten` | JSON-Array: `[{id:string(uuid), name, host, port:number, secure:bool, user, passwort_enc:text(base64-Cipher ODER 'PLAINTEXT::…'), absender_name, absender_email, ist_standard:bool}]` – Passwort NUR verschlüsselt (§3.3); Keys `user/passwort_enc` werden beim Auslesen an den Renderer ENTFERNT bzw. zu `hat_passwort:bool` reduziert. |
| `email_signatur` | Textsignatur (Default: firmenname + bankname/iban aus Bestandseinstellungen). |
| `email_text_rechnung` / `email_text_mahnung` / `email_text_angebot` | Templates mit Platzhaltern `{{kunde_name}}`, `{{nummer}}`, `{{datum}}`, `{{faelligkeit}}`, `{{betrag_brutto}}`, `{{firmenname}}` (Deutsche Defaults, §4.5). |
| `email_pdf_kopie_speichern` | 'true'/'false' (Default 'false'). |

Lazy-Lesemuster wie `dauerrechnungen_auto_erstellen` (init.js:29) – `seedDefaultData` bleibt unangetastet.

---

## 3. ARCHITEKTUR & SICHERHEIT

### 3.1 Neues Main-Modul `main/email.js` (Muster: main/zugferd-builder.js)

Fabrik-Funktion mit INJIZIERBAREN Abhängigkeiten (Testbarkeit!):

```js
function createEmailService(deps, overrides = {}) {
    // deps: { db, appendAuditLog, getEinstellung(key)->string|null, saveEinstellung(key,value) }
    // overrides (für Tests): {
    //   transportFactory: (smtpOptions) => { verify():Promise, sendMail(mailOptions):Promise<{messageId,response}> },
    //   cryptoAdapter: { isAvailable():bool, encrypt(plain)->base64, decrypt(b64)->plain }
    // }
    return {
        ladeKonten(), speichereKonto(konto), loescheKonto(id),
        testeVerbindung(kontoPayload),
        sendeBeleg(payload, pdfBuffer),          // wirft NICHT – schreibt Historie (§5.3)
        wiederhole(historieId, pdfBuffer),
        getVersandhistorie(filter),
        baueStandardText(typ, kontext),          // pure
        uebersetzeSmtpFehler(err)                // pure
    };
}
module.exports = { createEmailService, DEFAULT_TRANSPORT_FACTORY, DEFAULT_CRYPTO_ADAPTER, baueTransportOptionen };
```

- `DEFAULT_TRANSPORT_FACTORY`: lazy `require('nodemailer')`, `nodemailer.createTransport(baueTransportOptionen(konto))`.
- `DEFAULT_CRYPTO_ADAPTER`: lazy `require('electron').safeStorage` (erst im Aufruf requiren, damit Plain-Node-Tests ohne Electron laden); `encryptString`→base64 / `decryptString(Buffer.from(b64,'base64'))`; `isAvailable()` = `app.isReady() && safeStorage.isEncryptionAvailable()`.
- `baueTransportOptionen(konto)` (exportiert, pure): `{host, port, secure:(port===465 ? true : !!konto.secure), auth:{user,pass}, connectionTimeout:15000, greetingTimeout:15000, socketTimeout:30000, tls:{minVersion:'TLSv1.2', rejectUnauthorized:true}}` – Port 465 erzwingt secure:true (Korrektur fehlkonfigurierter Konten, Quelle §1).

### 3.2 Verdrahtung in main.js

In `setupIpc()` (nach db-Require): `const emailService = createEmailService({ db, appendAuditLog, getEinstellung, saveEinstellung })`; Handler-Block `// --- E-Mail-Versand (F10) ---` (§4.1). Instanziierung NACH app-ready ist gegeben (setupIpc läuft in whenReady, main.js:789).

### 3.3 Credential-Sicherheit & safeStorage-Fallback

1. Passwort gelangt EINMALig vom Formular über IPC `smtp:saveKonto` in den Main-Prozess (kanal-seitig sicher: contextIsolation aktiv, kein Fremdzugriff auf ipcMain).
2. `cryptoAdapter.isAvailable()` (Windows/DPAPI: true sobald ready) → verschlüsseln, als base64 in `passwort_enc` ablegen. Klartext wird NIE persistiert, NIE geloggt, NIE zurückgegeben.
3. **Fallback nicht verfügbar** (Linux basic_text/Headless – für Windows-Zielplattform selten): `speichereKonto` wirft „Sichere Speicherung (Betriebssystem-Schlüsselspeicher) nicht verfügbar.“ AUSSER Payload enthält `klartext_erlaubt=true` → Ablage als `'PLAINTEXT::' + pwd` mit sichtbarer Warnung im UI-Dialog (Checkbox „Unverschlüsselt speichern – NICHT empfohlen“). Zustand wird im Konten-Listeneintrag als rotes Badge „unsicher gespeichert“ angezeigt.
4. `ladeKonten()` liefert Renderer: alle Felder OHNE `user`/`passwort_enc`, dafür `hat_passwort:bool` + `gespeichert_sicher:bool`. Entschlüsselt wird ausschließlich intern für Transporter-Bau.

---

## 4. IPC-API

Alle Handler in `main.js::setupIpc()` mit `wrapHandler` + deutscher Validierung; Spiegel in `preload.js`.

| Kanal | preload | Request | Response | Fehlerfälle |
|---|---|---|---|---|
| `smtp:getKonten` | `getSmtpKonten()` | – | `[konto ohne Secrets + hat_passwort, gespeichert_sicher]` | – |
| `smtp:saveKonto` | `saveSmtpKonto(konto)` | `{id?, name!, host!, port!:number(1–65535), secure!:bool, user!, passwort?:string (leer = unverändert lassen), absender_name!, absender_email!, ist_standard?:bool, klartext_erlaubt?:bool}` | `{success:true, id}` | Name/Host/Absender fehlt oder ungültige E-Mail → „Ungültige Konto-Daten“; Crypto nicht verfügbar ohne Flag → §3.3-Meldung; `ist_standard` setzt anderen Standard ab. |
| `smtp:deleteKonto` | `deleteSmtpKonto(id)` | `id:string` | `{success:true}` | Unbekannte id → „SMTP-Konto nicht gefunden.“ |
| `smtp:testConnection` | `testSmtpConnection(konto)` | gleich `saveKonto` (+ optional `id` zum Laden gespeicherten Passworts, wenn passwort leer) | `{success:true, details}` bzw. `{success:false, fehlermeldung}` (KEIN Throw – UI zeigt inline) | Timeout/Fehler übersetzt via `uebersetzeSmtpFehler` |
| `smtp:sendBeleg` | `sendBelegEmail(payload)` | `{beleg_typ!:'RECHNUNG'|'ANGEBOT'|'MAHNUNG', beleg_id!:number, mahnstufe?:number, empfaenger!:string(E-Mail), cc?, bcc?, betreff!:string, text?:string (leer → Template), konto_id?:string (sonst Standard), basePdfBuffer?:ArrayBuffer, pdf_dateiname?:string (sonst abgeleitet `<Typ>_<nr>.pdf`)}` | Erfolg: `{success:true, historieId, messageId}` · Fehler: `{success:false, fehlermeldung, historieId}` (Historie-Zeile existiert in BEIDEN Fällen) | Beleg nicht gefunden / Empfänger ungültig / kein SMTP-Konto konfiguriert → Throw (vor Versand, KEINE Historie) ; PDF-Erfassung fehlgeschlagen → FEHLGESCHLAGEN-Historie „Kein PDF erzeugbar“. |
| `smtp:wiederholeVersand` | `wiederholeEmailVersand(historieId, basePdfBuffer?)` | `historieId:number`, optional frischer PDF-Buffer (aus Beleg-Kontext); ohne Buffer + vorhandener `pdf_pfad` → Datei vom Datenträger | wie `smtp:sendBeleg`; `versuche` += 1, Status/Fehlermeldung/message_id werden AKTUALISIERT (neue Zeile? NEIN – Update derselben Zeile, letzte Aktion maßgeblich) | Historie nicht gefunden |
| `smtp:getVersandhistorie` | `getVersandhistorie(belegTyp?, belegId?)` | Filter optional | `[{…row}] ORDER BY gesendet_am DESC LIMIT 200` | – |

**Namensschema geprüft:** bestehende Kanäle nutzen `domaene:aktion` (audit:, qr:, invoice:, save:) bzw. `db:*` – `smtp:*` fügt sich ein; preload-Namen folgen camelCase-Exposure wie `verifyAuditChain` (preload.js:19).

---

## 5. GESCHÄFTSLOGIK

### 5.1 PDF-Anhang aus BESTEHENDEM Export (Pfad/Buffer-Übergabe GEKLÄRT)

Es gibt bereits zwei funktionierende Erfassungswege – beide wiederverwendet, nichts Neues gebaut:

1. **Bevorzugt:** Renderer rendert die Sichtseite unsichtbar in `#print-template` (Muster `renderInvoiceForZugferdExport` js/editor.js:760–767 bzw. Mahnungs-Template js/einstellungen.js:1104) und ÜBERGIBT KEINEN Buffer – stattdessen erfasst der MAIN-Prozess den Zustand des sendenden Fensters: `toPdfBuffer(payload.basePdfBuffer) || await printToPdfWithTimeout(event.sender)` (identisch zu invoice:exportZugferdPdf, main.js:715–725). Damit bleibt die HTML-Erzeugung komplett im Renderer (bewusste Architektur-Entscheidung von F5, Kommentar main.js:92–96).
2. Der resultierende **Buffer** geht direkt als `attachments:[{filename, content: <Buffer>, contentType:'application/pdf'}]` an nodemailer – KEINE Zwischendatei nötig. Optional-Kopie nur bei `email_pdf_kopie_speichern` (fs.writeFileSync in `<userData>/email-outbox/`, Pfad in Historie).
3. `pdf_sha256 = crypto.createHash('sha256').update(buffer).digest('hex')` (Hash-Muster wie ZUGFeRD-Export main.js:773).

### 5.2 Empfänger-/Textvorbelegung (Renderer)

- Empfänger: `kunde.email` des Belegs (`state.kunden.find(k=>k.id===doc.kundeId)`); leer → Warnchip „Kunde hat keine E-Mail-Adresse“ aber editierbar.
- Betreff-Templates: RECHNUNG `Rechnung {{nummer}} – {{firmenname}}` · MAHNUNG `{{n}}. Mahnung zu Rechnung {{nummer}}` · ANGEBOT `Angebot {{nummer}} – {{firmenname}}`.
- Text: Template aus Einstellungen (§2.2), Platzhalter ersetzt via `baueStandardText` (pure, String-replace, unbekannte Platzhalter → leer); Signatur anhängen.

### 5.3 Versandablauf & Fehlerbehandlung (service.sendeBeleg)

1. Validierung (Tabelle §4); Konto auflösen (payload.konto_id sonst `ist_standard`, sonst einzigen Eintrag, sonst Throw „Bitte zuerst ein SMTP-Konto in den Einstellungen anlegen.“).
2. PDF-Buffer beschaffen (§5.1); fehlgeschlagen → FEHLGESCHLAGEN-Historie + Return.
3. `transporter.verify()` vor sendMail (schnelles, klares Scheitern).
4. `sendMail({from:'"'+absender_name+'" <'+absender_email+'>', to, cc, bcc, subject:betreff, text:nachricht_text, attachments})`.
5. **Immer** Historie schreiben: Erfolg `status='VERSANDT'`, `message_id`, `smtp_response`, `gesendet_am=now`; Misserfolg `status='FEHLGESCHLAGEN'`, `fehlermeldung=uebersetzeSmtpFehler(err)` (deutsche Übersetzung für ETIMEDOUT→„Zeitüberschreitung beim Verbindungsaufbau – Firewall/Port blockiert?“, EAUTH/535→„Anmeldung fehlgeschlagen – Benutzer/App-Passwort prüfen“, ECONNREFUSED→„Verbindung abgelehnt – Host/Port prüfen“, ELSE err.message).
6. Audit-Eintrag je Versuch (§5.5). Return an UI; Toast entsprechend; Button-Busy-State (Muster setButtonsState js/einstellungen.js:1400).

### 5.4 Wiederholen

Aus dem Beleg-Kontext (Historien-Panel): ruft `smtp:wiederholeVersand` mit frischem Buffer (gleiche Erfassung wie 5.1); `versuche+=1`; Status/fehlermeldung/message_id aktualisiert. Historieneintrag bleibt EIN Datensatz je Versandvorgang-Kette (letzte Aktion sichtbar, Versuchszähler transparent).

### 5.5 GoBD-Explizitfestlegung

- Der Versand ändert KEIN Belegfeld → `dokumente.sha256_hash` unberührt, Inhalts-Hash-Vergleiche (db.js:89–94) greifen unverändert; Versand darf daher auch an GESPERRTEN Belegen erfolgen.
- Protokollierung: `appendAuditLog({entityType:'DOCUMENT', entityId:beleg_id, action:'EMAIL_VERSENDET'|'EMAIL_FEHLGESCHLAGEN', details:{beleg_typ, nr, empfaenger, konto:name, messageId, pdfSha256, mahnstufe?}})` – reiner ANHANG an die Hashkette (wie ZUGFERD_EXPORT main.js:764), bricht sie nie.
- Gesperrte Belege: kein Schreibpfad auf dokumente wird berührt (kein updateDocumentStatus nötig).

---

## 6. UI-FLOW

### 6.1 Kein neuer Top-Level-View – drei Integrationpunkte

**(a) E-Mail-Dialog am Beleg** – globaler Modal `email-modal` in code.html (Stil objekt-modal):
- Header: Typ-Chip (RECHNUNG/MAHNUNG/ANGEBOT) + Belegnummer.
- Felder: `email-modal-empfaenger` (vorbefüllt kunde.email), `email-modal-cc`, `email-modal-bcc`, `email-modal-konto` (Select aus `getSmtpKonten`, Standard vorselektiert; leer → Hinweisbutton „SMTP-Konto einrichten“ springt zu Einstellungen), `email-modal-betreff`, `email-modal-text` (Textarea, Template-vorbefüllt, editierbar), Anhang-Chip 📄 `Rechnung_INV-2026-042.pdf` (nicht entfernbar – PDF gehört zum Beleg), Checkbox „PDF-Kopie lokal speichern“ (spiegelt Einstellung).
- Footer: `Abbrechen` / `Senden` (primary, Busy-State). Nach Versand: Toast + Historien-Refresh; bei Fehler bleibt Dialog offen, rote Inline-Meldung (fehlermeldung aus Response).
- Öffnen über neuen Button **📧 „Per E-Mail senden“** in der Fußleiste des `pdf-preview-modal` neben Drucken/Speichern (`pdf-preview-email-btn`, Bindung analog InvoiceView.js:54) → deckt Rechnungs- UND Angebots-Vorschau ab; zusätzlich Direktbuttons in Belegliste (dashboard.js-Muster der Mahn-Buttons, dashboard.js:435–457) OPTIONAL Schritt 10.

**(b) Mahnung:** Nach `confirmMahnungLevel` (js/einstellungen.js:996) wird die Mahnung ohnehin in `#print-template` gerendert – dort zusätzlichen Button „Per E-Mail senden" einblenden (ruft denselben Flow, `beleg_typ:'MAHNUNG'`, `mahnstufe`). GoBD-Hinweis „Rechnung muss zuerst gedruckt/gesperrt sein“ bleibt bestehen (Bestandsregel js/einstellungen.js:967).

**(c) Versandhistorie am Beleg:** Aufklapppanel im Rechnungs-/Angebots-Editor (unter Belegkopf, ID `email-historie-panel`) + im Mahnungsdialog: Tabelle `Datum | Status-Badge (VERSANDT grün / FEHLGESCHLAGEN rot) | Empfänger | Konto | Versuche | Message-ID (gekürzt, Tooltip voll) | Aktion (🔁 Wiederholen nur im Kontext)`. Laden via `getVersandhistorie(belegTyp, belegId)` beim Öffnen des Editors.

### 6.2 Einstellungen: Karte „E-Mail-Versand (SMTP)" in `view-einstellungen` (code.html:2708-Umfeld)

- **Kontenliste:** Name | Server:Port | Secure-Badge (SSL/TLS/STARTTLS) | Absender | Standard-Badge | `hat_passwort` ✓ | Sicherheit-Badge (grün „verschlüsselt“ / rot „unsicher“) | Aktionen Bearbeiten/Löschen/Set-as-standard.
- **Konto-Formular (Modal `smtp-konto-modal`):** Name*, Host*, Port (Select 587/465 + Freitext-Feld), Radio Verbindungssicherheit (auto nach Port, manuell überschreibbar), Benutzername*, Passwort (Placeholder „(unverändert – gespeichert)“ im Edit-Fall), Absender-Name*, Absender-E-Mail*, Checkbox Standardkonto. Buttons: **🔌 Verbindung testen** (ruft `smtp:testConnection`, Ergebnis inline: grün „Verbindung erfolgreich – Server meldet: …“ / rot übersetzte Fehlermeldung) + Speichern.
- **Hilfetext-Box:** „Gmail/Google Workspace: App-Passwort erforderlich (Konto mit 2-Faktor). Port 465 = SSL (implizit), 587 = STARTTLS.“
- **Mailtexte-Reiter/Abschnitt:** 3 Template-Textareas (Rechnung/Mahnung/Angebot) + Signatur + Platzhalter-Hinweiszeile; Speichern über bestehendes `saveEinstellungen`-Muster (js/einstellungen.js:41–107) erweitern.

---

## 7. ABHÄNGIGKEITEN & BERÜHRUNGSPUNKTE

1. **Neu:** `main/email.js`, `tests/smtp_email.test.js`.
2. **Geändert:** package.json (+nodemailer dependency), main.js (Service-Instanz + 7 Handler), preload.js (7 Exposures), schema.js (Tabelle+2 Indizes), code.html (email-modal, smtp-konto-modal, Einstellungs-Karte, pdf-preview-email-btn, Historien-Panel, keine neuen script-Tags nötig – Logik lebt in js/einstellungen.js + js/editor.js), js/editor.js (Email-Dialog-Öffnung aus Vorschau, collectBelegEmailContext), views/InvoiceView.js (Button-Bindung), js/einstellungen.js (Kontenverwaltung + Mahnungs-Mailbutton + executePrint-Erweiterung um Kontextübergabe).
3. **Reihenfolge:** npm-install → Schema/Migration → Service (injectierbar) → Tests pure/DB → IPC/preload → Einstellungs-UI (Konten+Test) → Beleg-Dialog → Historien-Panel → Mahnungs-Anbindung.

---

## 8. TESTPLAN

Neue Datei `tests/smtp_email.test.js` (node --test; DB-Teile im Electron-as-Node-Wrapper-Muster tests/dauerrechnung_crud.test.js:26–46; Nodemailer NIE echt kontaktieren – Transporter immer injiziert!).

**Pure (Plain Node):**
- `baueTransportOptionen`: Port 465 → secure:true erzwungen; 587+secure:false bleibt STARTTLS; Timeouts 15000/15000/30000 gesetzt; tls.minVersion TLSv1.2.
- `baueStandardText`: alle Platzhalter ersetzt ({{nummer}}, {{betrag_brutto}} deutsches Format „1.234,56 €“), unbekannter Platzhalter → leer, Mehrfachvorkommen.
- `uebersetzeSmtpFehler`: ETIMEDOUT/ECONNREFUSED/EAUTH/535/generic → deutsche Meldungen.
- Fake-cryptoAdapter Roundtrip; `PLAINTEXT::`-Markierung nur mit Flag.

**DB/Service (Wrapper, isolierte Temp-DB):**
- Schema: Tabelle + Indizes existieren; CHECK beleg_typ/status.
- `speichereKonto/ladeKonten`: Passwort niemals im Response (Assert: kein Feld enthält Klartext), `hat_passwort=true`, Standardwechsel exklusiv, Löschen unbekannt → deutsche Meldung.
- `testeVerbindung` mit Fake-Transport: success-Shape; verify()-Reject → `{success:false, fehlermeldung}` übersetzt, KEINE Historie-Zeile.
- `sendeBeleg` Erfolg: Fake-Transport erhält `attachments[0]` = {filename:`Rechnung_INV-X.pdf`, content:Buffer %PDF-Signatur, contentType:'application/pdf'}; from-Format `"Name" <mail>`; Historie VERSANDT mit message_id/pdf_sha256; Audit `EMAIL_VERSENDET` vorhanden.
- `sendeBeleg` Fehler (sendMail-Reject): Historie FEHLGESCHLAGEN mit deutscher Meldung + versuche=1; Audit `EMAIL_FEHLGESCHLAGEN`; Funktion wirft NICHT.
- `wiederhole`: versuche=2, Statuswechsel FEHLGESCHLAGEN→VERSANDT in derselben Zeile.
- **GoBD:** Rechnung anlegen (applyDocumentWrite) → sha256_hash merken → 2 Versandversuche (ok+fail) → hash UNVERÄNDERT, `verifiziereAuditKette().valid===true`, Kette enthält EMAIL-Actions.
- pdf_pfad-Zweig: Einstellung true → Datei existiert im Outbox-Verzeichnis, Pfad in Historie (Temp-dir injiziert).

Akzeptanz: `npm test` gesamt grün inkl. Alt-Suites.

---

## 9. SCHRITT-FÜR-SCHRITT-UMSETZUNG

Checkpoints: je Schritt `node --test tests/smtp_email.test.js` bzw. `npm test`; UI-Schritte App-Smoke.

1. **Abhängigkeit:** `npm install nodemailer` (package.json dependencies; Version ^7 gemäß aktuellem npm-Stand pin).
   ✅ `node -e "require('nodemailer')"` lädt; npm test grün (keine Regression).
2. **Schema:** Tabelle `email_versandhistorie` + 2 Indizes in createSchema.
   ✅ Frische Test-DB enthält Tabelle/Indizes.
3. **Service-Gerüst:** main/email.js mit createEmailService + baueTransportOptionen + DEFAULT_* (lazy requires!) + baueStandardText + uebersetzeSmtpFehler. KEINE Kommentare.
   ✅ Plain-Node-Require funktioniert (ohne Electron).
4. **Tests pure (Schritt-3-Umfang)** grün. ✅ Checkpoint.
5. **Konten-Verwaltung im Service:** ladeKonten (Secret-Stripping)/speichereKonto (Crypto+Fallback+exklusiver Standard)/loescheKonto/testeVerbindung.
6. **Versandkern:** sendeBeleg + wiederhole + getVersandhistorie + Historie-Schreiblogik (§5.3) + Audit-Entries.
7. **Tests DB/Service (Schritt 5–6)** grün inkl. GoBD-Assertions. ✅ `npm test` GESAMT grün.
8. **IPC + preload:** 7 Handler (§4) + Service-Verdrahtung in setupIpc.
9. **Einstellungs-UI:** Karte SMTP-Konten (Liste/Formular/Testverbindung) + Mailtexte-Abschnitt; saveEinstellungen-Erweiterung.
   ✅ Smoke: Konto anlegen → testen (gegen echten Provider ODER lokalen Debug-SMTP wie smtp4dev MANUELL, nicht im Test) → Standard setzen.
10. **email-modal + Vorschau-Button:** pdf-preview-email-btn (views/InvoiceView.js-Bindung), Dialog-Logik in js/editor.js (collectBelegEmailContext: kunde/betreff/template/PDF-Erfassungskontext), Versand + Toast + Historien-Refresh.
11. **Historien-Panel** am Rechnungs-/Angebots-Editor (§6.1c) + Wiederholen-Aktion.
12. **Mahnungs-Anbindung** (js/einstellungen.js: Mahnungs-Mail-Button, beleg_typ='MAHNUNG', mahnstufe) + optionale Listen-Buttons.
13. **Gesamtabnahme:** npm test grün; manueller End-to-End-Smoke gegen Test-SMTP: Rechnung → E-Mail → Empfang prüfen (Anhang öffnet, Betreff korrekt) → Mahnung → Angebot; Fehlerpfad (falsches Passwort) → Historie rot + Wiederholen erfolgreich.

---

## 10. OFFENE FRAGEN / RISIKEN

1. **OAuth2 (Microsoft 365):** Microsoft schaltet Basic-Auth/SMTP-AUTH für viele M365-Tenants ab – v1 unterstützt nur PASSPORT (LOGIN/PLAIN, App-Passwort). Bedarf für XOAUTH2-Flow (nodemailer supported) klären; Schnittstelle (transportFactory) ist darauf vorbereitet.
2. **PDF-Erfassung im Hintergrund:** printToPDF benötigt das Renderer-Fenster; Massen-/Automatikversand (z. B. Dauerrechnungs-Entwürfe auto-mailen) ist mit dieser Architektur NICHT möglich – bewusst out of scope; falls gewünscht später serverseitiger PDF-Build (@cantoo/pdf-lib) evaluieren.
3. **safeStorage-Fallback:** Windows-Ziel plattformbedingt unkritisch (DPAPI ab app-ready verfügbar); Linux-Verhalten §3.3 dokumentiert – akzeptiert?
4. **Anhänge zusätzlich zur PDF** (XRechnung-XML beilegen bei B2G): sinnvolles Follow-up, Kanal/Payload bereits erweiterbar (`attachments`-Array im Service) – v1 nein.
5. **EML-Journaling (GoBD-Vollständigkeit):** Wir speichern Hash+Metadaten, nicht die vollständige .eml; ob der Steuerberater eine Sent-Copy verlangt (Outbox-Ordner reicht dann nicht als Postausgangsjournal) – klären; `email_pdf_kopie_speichern` ist Vorstufe.
6. **Rate-Limits/Provider-Bounce-Handling:** kein Retry-Backoff automatisiert (Desktop-Kontext, manuelles Wiederholen genügt v1).
7. **Risiko doppelte Versandhistorie bei IPC-Retry durch UI:** Wiederholen aktualisiert dieselbe Zeile (versuche++), kein Duplikat – Tests decken ab.
8. **Risiko printToPDF-Timeout** (15 s wie ZUGFeRD): bei sehr großen Belegen → FEHLGESCHLAGEN-Historie mit klarer Meldung; Wert ggf. konfigurierbar halten (Konstante im Service).
