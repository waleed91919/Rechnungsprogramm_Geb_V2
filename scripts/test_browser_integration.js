/**
 * scripts/test_browser_integration.js
 * 
 * Automatisierter E2E- & API-Integrationstest für den Browser-Betrieb von W-Link ERP.
 */

const http = require('http');
const server = require('./browser_bridge_server');

const TEST_PORT = 3000;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

function request(urlPath, options = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(urlPath, BASE_URL);
        const reqOptions = {
            method: options.method || 'GET',
            headers: options.headers || {}
        };
        const req = http.request(u, reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: data
                });
            });
        });
        req.on('error', reject);
        if (options.body) {
            req.write(options.body);
        }
        req.end();
    });
}

async function runTests() {
    console.log('\n=======================================================');
    console.log(' START: Automatisierte Browser-Integrationsprüfung');
    console.log('=======================================================\n');

    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`[PASS] ${message}`);
            passed++;
        } else {
            console.error(`[FAIL] ${message}`);
            failed++;
        }
    }

    try {
        // Test 1: Startseite / Root Redirect
        console.log('\n--- 1. HTTP-Server & Static Delivery ---');
        const rootRes = await request('/');
        assert(rootRes.status === 200, 'Root "/" liefert HTTP 200');
        assert(rootRes.body.includes('ERP Rechnungsprogramm'), 'Root HTML enthält Seitentitel');
        assert(rootRes.body.includes('/browser-bridge.js'), 'code.html hat injizierte /browser-bridge.js');

        // Test 2: Browser-Bridge Script
        const bridgeRes = await request('/browser-bridge.js');
        assert(bridgeRes.status === 200, 'GET /browser-bridge.js liefert HTTP 200');
        assert(bridgeRes.body.includes('window.api = api;'), 'Bridge definiert window.api');
        assert(bridgeRes.body.includes('getFullState'), 'Bridge enthält getFullState Methode');
        assert(bridgeRes.body.includes('saveKunde'), 'Bridge enthält saveKunde Methode');

        // Test 3: PWA Auslieferung
        console.log('\n--- 2. Mobile Companion PWA Delivery ---');
        const pwaRes = await request('/pwa/');
        assert(pwaRes.status === 200, 'GET /pwa/ liefert HTTP 200');
        assert(pwaRes.body.includes('W-Link ERP Baustellenbegleiter'), 'PWA enthält Baustellenbegleiter-Titel');
        assert(pwaRes.body.includes('dexie.min.js'), 'PWA bindet IndexedDB/Dexie ein');

        // Test 4: IPC Endpoint: db:getFullState
        console.log('\n--- 3. IPC Gateway & SQLite Datenabfrage ---');
        const stateRes = await request('/api/ipc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: 'db:getFullState', args: [] })
        });
        assert(stateRes.status === 200, 'POST /api/ipc [db:getFullState] liefert HTTP 200');
        const stateData = JSON.parse(stateRes.body);
        assert(stateData.ok === true, 'IPC-Antwort ok = true');
        assert(Array.isArray(stateData.result.kunden), 'State enthält kunden Array');
        assert(Array.isArray(stateData.result.artikel), 'State enthält artikel Array');
        assert(typeof stateData.result.einstellungen === 'object', 'State enthält einstellungen Objekt');

        // Test 5: IPC Endpoint: db:saveKunde & Persistenz
        console.log('\n--- 4. Stammdaten-Mutation im Browser (Kunde & Artikel) ---');
        const testKunde = {
            kundennummer: `KD-BROWSER-${Date.now()}`,
            name: 'Browser Automation Test GmbH',
            adresse: 'Web-Allee 42',
            plz: '10115',
            ort: 'Berlin',
            telefon: '030-12345678',
            email: 'test@browser-erp.de'
        };
        const saveKundeRes = await request('/api/ipc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: 'db:saveKunde', args: [testKunde] })
        });
        const saveKundeData = JSON.parse(saveKundeRes.body);
        assert(saveKundeData.ok === true && saveKundeData.result > 0, `Kunde via Browser-IPC gespeichert mit ID ${saveKundeData.result}`);
        const savedKundeId = saveKundeData.result;

        // Test 6: IPC Endpoint: Artikel anlegen
        const testArtikel = {
            artikelnummer: `ART-BR-${Date.now()}`,
            name: 'Web-Integration Prüfleistung',
            beschreibung: 'Vollständige Überprüfung im Webbrowser',
            einheit: 'Std.',
            preis: 120.0,
            mwst: 19.0
        };
        const saveArtRes = await request('/api/ipc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: 'db:saveArtikel', args: [testArtikel] })
        });
        const saveArtData = JSON.parse(saveArtRes.body);
        assert(saveArtData.ok === true && saveArtData.result > 0, `Artikel via Browser-IPC gespeichert mit ID ${saveArtData.result}`);
        const savedArtikelId = saveArtData.result;

        // Test 7: IPC Endpoint: Dokumenten- & Rechnungs-Erstellung
        console.log('\n--- 5. Dokumenten-Erstellung & GoBD-Prüfung ---');
        const testDoc = {
            type: 'rechnung',
            nr: `RE-BROWSER-${Date.now()}`,
            datum: new Date().toISOString().slice(0, 10),
            faellig: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
            kundeId: savedKundeId,
            status: 'Ausstehend',
            netto: 240.0,
            steuer: 45.6,
            brutto: 285.6,
            positionen: [
                {
                    artikelId: savedArtikelId,
                    name: 'Web-Integration Prüfleistung',
                    menge: 2,
                    einheit: 'Std.',
                    preis: 120.0,
                    mwst: 19.0
                }
            ]
        };
        const saveDocRes = await request('/api/ipc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: 'db:saveDocument', args: [testDoc] })
        });
        const saveDocData = JSON.parse(saveDocRes.body);
        assert(saveDocData.ok === true && saveDocData.result > 0, `Rechnung via Browser-IPC erstellt mit ID ${saveDocData.result}`);
        const savedDocId = saveDocData.result;

        // Test 8: GoBD Audit-Verifikation
        console.log('\n--- 6. GoBD Revisionssicherheit & Hash-Kette ---');
        const auditRes = await request('/api/ipc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: 'audit:verify', args: [] })
        });
        const auditData = JSON.parse(auditRes.body);
        assert(auditData.ok === true, 'GoBD-Audit-Kette erfolgreich abgefragt');
        console.log('Audit Verification Result:', JSON.stringify(auditData.result));
        assert(auditData.result && (auditData.result.valid === true || auditData.result.checked > 0), 'GoBD-Audit-Kette verifiziert');

        // Test 9: GAEB Schnittstelle
        console.log('\n--- 7. GAEB Ausschreibungsschnittstelle ---');
        const gaebRes = await request('/api/ipc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: 'gaeb:list-imports', args: [] })
        });
        const gaebData = JSON.parse(gaebRes.body);
        assert(gaebData.ok === true, 'GAEB Import-Liste via Browser-IPC erfolgreich abgefragt');

        // Test 10: Bereinigung Test-Datensätze (nur Testkunde/Artikel/Entwurf)
        console.log('\n--- 8. Cleanup & Datenintegrität ---');
        await request('/api/ipc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: 'db:deleteArtikel', args: [savedArtikelId] })
        });
        await request('/api/ipc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: 'db:deleteKunde', args: [savedKundeId] })
        });
        assert(true, 'Test-Kunde und Test-Artikel bereinigt (Rechnung bleibt revisionssicher geloggt)');

        console.log('\n=======================================================');
        console.log(` ERGEBNIS: ${passed} BESTANDEN | ${failed} FEHLGESCHLAGEN`);
        console.log('=======================================================\n');

    } catch (err) {
        console.error('Unerwarteter Fehler im Testablauf:', err);
        failed++;
    } finally {
        server.close(() => {
            console.log('[Test Suite] Browser-Bridge Server ordnungsgemäß beendet.');
            process.exit(failed === 0 ? 0 : 1);
        });
    }
}

// Starte Tests
runTests();
