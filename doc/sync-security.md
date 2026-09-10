# Sicherer lokaler Sync: Einrichtung und Migration

Dieses Arbeitspaket sichert den vorhandenen mobilen Sync ab. Es ist keine
vollständige ERP-Neuentwicklung, kein externer Penetrationstest und keine
Freigabe für einen öffentlich erreichbaren Internetdienst.

## Verhalten nach dem Update

- Der Sync Hub ist standardmäßig gestoppt und an `127.0.0.1` gebunden.
- Beim ersten Start dieser Version setzt eine einmalige Datenbankmigration
  den bisherigen Autostart zurück. Das frühere `true` war auch ein automatisch
  gesetzter Standard. Ein danach bewusst gesetzter Opt-in bleibt erhalten.
- Das Öffnen der Desktop-Sync-Ansicht liest nur den Status. Weder ein Listener
  noch ein Pairing-Token wird dadurch erzeugt.
- Alte mobile Konfigurationen ohne Zugriffstoken müssen erneut gekoppelt
  werden. Ausstehende Buchungen und lokale Fotos bleiben erhalten.
- Die PWA-App-Shell erhält eine neue Service-Worker-Cacheversion. Nach dem
  Desktop-Update die PWA online öffnen, das Update abwarten und neu laden.
  Nicht vorschnell Browserdaten löschen: Sie können noch ungesendete Arbeit enthalten.

## Einrichtung auf dem Desktop

1. Im Bereich „PWA & Sync Hub“ zunächst die Erreichbarkeit wählen.
   „Nur dieser Computer“ erlaubt einen lokalen Test ohne Zertifikat. Diese
   Adresse ist ausdrücklich nicht vom Smartphone erreichbar.
2. Für Smartphones „LAN / Smartphones“ auswählen und HTTPS aktivieren.
   Absolute Dateipfade zu einem PEM-Zertifikat und dem zugehörigen privaten
   PEM-Schlüssel eintragen. Der Schlüssel bleibt auf dem Desktop und gehört
   weder ins Repository noch in einen Chat oder auf ein Mobilgerät.
3. Das Zertifikat muss zur angezeigten LAN-IP passen (IP-SAN) und auf jedem
   verwendeten Gerät vertrauenswürdig sein. Bei interner CA nur deren öffentliches
   Stammzertifikat auf Geräten installieren, niemals den privaten CA-Schlüssel.
   Diese Version enthält keinen automatischen Zertifikatsassistenten.
4. Einstellungen speichern. Das stoppt einen eventuell laufenden Hub und
   widerruft dessen Sitzungen. Danach ausdrücklich „Sync Hub starten“ wählen.
5. Bei ungültigen oder fehlenden TLS-Dateien wird nicht auf unverschlüsseltes
   HTTP zurückgefallen. Den Fehler beheben, nicht den Schutz umgehen.
6. Die tatsächlich angezeigte Adresse verwenden. Bei belegtem Port wird
   innerhalb der nächsten zehn Ports gesucht. Die Firewall nur im gewünschten
   privaten Netzwerk passend freigeben; keine Router-Portweiterleitung einrichten.

Ein an `0.0.0.0` gebundener Listener erreicht alle IPv4-Schnittstellen des
Computers, nicht automatisch nur „vertrauenswürdige“ Netze. Firewall und
Netzwerksegmentierung bleiben notwendig. Bei mehreren Netzwerkadaptern wird
die erste nicht-interne IPv4-Adresse angezeigt; die passende Adresse und die
Zertifikats-SANs müssen vor dem Pilotbetrieb geprüft werden.

## Mobilgerät koppeln und entkoppeln

1. Die angezeigte HTTPS-Adresse im Browser des Mobilgeräts öffnen.
2. Am Desktop „Neuen Pairing-Token erzeugen“ wählen.
3. Adresse und Token im PWA-Sync-Tab eintragen und „Koppeln & Speichern“ wählen.
4. Der Einmal-Token gilt fünf Minuten und wird bei erfolgreicher Kopplung
   verbraucht. Der Hub gibt einen separaten Zugriffstoken zurück.
5. Die Gerätesitzung gilt höchstens acht Stunden und nur für den aktuellen
   Hub-Prozess. Ein Hub-Stopp oder Neustart widerruft alle Sitzungen.

„Dieses Gerät entkoppeln“ widerruft die aktuelle Sitzung und entfernt den
lokalen Zugriffstoken. Ist der Hub nicht erreichbar, wird nur lokal
entkoppelt; für sofortigen serverseitigen Widerruf den Desktop-Hub stoppen.
Offline-Daten bleiben auch nach dem Entkoppeln auf dem Gerät.

Der Wechsel von HTTP zu HTTPS ist **kein automatischer Datenumzug**.
IndexedDB gehört zur jeweiligen Browser-Origin, einschließlich Protokoll,
Host und Port. Die neu geöffnete HTTPS-PWA sieht die alte HTTP-Datenbank nicht.
Das Eintragen einer anderen Origin in der alten PWA wird daher bereits im
Client blockiert. Der Server erlaubt die alte unverschlüsselte HTTP-Origin
auch nicht per CORS; dies wäre keine sichere Migration.

Vor der Umstellung prüfen, ob auf einem Mobilgerät noch ungesendete Arbeit
liegt. Diese gezielt sichern und ihre erfolgreiche Übernahme am Desktop
prüfen, erst danach die neue HTTPS-PWA verwenden. Wenn der vorhandene
verschlüsselte USB-Export funktioniert, kann er als Übertragungsweg dienen.
In alten unverschlüsselten LAN-Browserkontexten kann WebCrypto fehlen;
für solche Bestände ist eine gesonderte betreute Datenrettung nötig.
Die alte Browserdatenbank nicht löschen und nicht auf eine neue leere
HTTPS-Datenbank als Beweis für erfolgreiche Migration vertrauen.

Auch IP- oder Portwechsel benötigen eine bewusste Datenübernahme; dafür
enthält dieses Arbeitspaket noch keinen automatischen Assistenten.
Für andere Firmen getrennte Browserprofile verwenden, damit Datenbestände
nicht vermischt werden.

## Technische Sicherheitsgrenzen

- REST-Push, Pull, Fotos, SSE und WebSocket-Upgrades verlangen
  `Authorization: Bearer <access_token>` und die gekoppelte `X-Device-Id`.
  Beide REST-Präfixe `/api/v1/sync/` und `/api/sync/` werden geschützt.
- Tokens in URLs werden nicht akzeptiert. Die native Browser-WebSocket-API
  und `EventSource` können keine solchen Auth-Header setzen. Die aktuelle
  PWA verwendet authentifizierte Fetch-Push/Pull-Anfragen, nicht diese Streams.
  Künftige Browser-Streaming-Clients brauchen ein eigenes sicheres Protokoll.
- Der Server hält nur Token-Hashes und kurzlebige Sitzungen im Speicher.
  Widerruf und Ablauf schließen auch bestehende Streams.
- Fremde Origins und unerwartete Host-Header werden abgewiesen. Öffentliche
  App-Shell und Healthcheck bleiben erreichbar, nicht die Fachdaten.
- JSON ist auf 1 MiB und Push-Batches auf 50 Mutationen begrenzt.
  Fotos sind auf 10 MiB begrenzt. Dateinamen, Pfade, symbolische Links,
  abgebrochene Uploads und gegebenenfalls mitgesendete SHA-256-Hashes werden geprüft.
- Ein Foto wird erst nach abgeschlossener Speicherung bestätigt.
  Derselbe Foto-Inhalt mit derselben UUID kann nach verlorenem ACK erneut
  bestätigt werden; abweichender Inhalt überschreibt keine bestehende Datei.
  Dafür muss das lokale Upload-Dateisystem Hardlinks unterstützen.
  Bei regulärem Abbruch und Hub-Stopp werden temporäre Dateien entfernt;
  ein harter Prozessabbruch oder Stromausfall kann private Staging-Ordner hinterlassen.
- Lohngruppe und Tarifstundensatz werden nicht mehr an die PWA übertragen.
  Beim erfolgreichen Mitarbeiter-Pull wird der alte Mitarbeitercache ersetzt.
- Synchronisierte Konflikttexte und die hier geprüften Bautagebuch-Textfelder
  werden bei der Desktop-Anzeige HTML-escaped.
- Pairing-Token und Zugriffstoken unterscheiden sich. Einmalige Kopplung ist
  kein dauerhaftes Gerätepasswort; Offline-Dateiexporte enthalten diese
  Zugangsdaten nicht.

## Noch nicht abgedeckt

Gekoppelte Geräte sind weiterhin vertrauenswürdige betriebliche Endgeräte:
Es gibt in diesem Arbeitspaket keine Benutzerrollen, Projektberechtigungen
oder Mandantentrennung. Die freigegebenen Projekt-, LV- und Mitarbeiterdaten
bleiben für jedes gültig gekoppelte Gerät erreichbar.

Die lokale PWA-Datenbank einschließlich Zugriffstoken wird in IndexedDB
gespeichert. Gerätesperre, Browserprofilschutz und weitere XSS-Prüfungen
bleiben erforderlich. Das Entkoppeln ist kein Fernlöschen des Geräts.
Einzelgeräteverwaltung am Desktop, persistente Geräteidentitäten,
Zertifikatsverteilung und eine vollständige Rechtearchitektur sind Folgearbeiten.

## Tests und Freigabe

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm rebuild better-sqlite3
npm test
```

Die Befehle bauen `better-sqlite3` für den Node-Testprozess, nicht für
Electron. Vor einem echten Electron-Start gegebenenfalls erneut
`npx electron-builder install-app-deps` ausführen.

Neue Tests befinden sich in `tests/sync_server_security.test.js` und
`tests/sync_client_security.test.js`. Sie prüfen echte lokale HTTP-/HTTPS-
Anfragen mit synthetischen Daten sowie die Client- und Migrationslogik.
Die HTTPS-Fixture benötigt das `openssl`-Kommando. Die CI führt die
vollständige Node-Testsuite unter Linux aus.

Browser-QA umfasst erfolgreiche Kopplung und Pull, abgewiesenes LAN-HTTP,
erneute Kopplung nach Widerruf, Entkoppeln sowie die Sync-Ansicht in
Desktop- und Mobilbreite. Der Desktop-Renderer wird dabei mit einer
simulierten IPC-Schnittstelle geprüft, nicht als installierte Windows-App.

Vor dem Merge bzw. spätestens vor einem Kundenpilot sind zusätzlich ein
echter Windows-/Electron-Smoke-Test, Zertifikatsvertrauen auf Android/iOS
und ein LAN-Test mit zwei physischen Geräten erforderlich. Ein grüner
Node-Testlauf ersetzt diese Prüfungen nicht.
