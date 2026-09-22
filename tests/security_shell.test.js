const test = require('node:test');
const assert = require('node:assert/strict');
const IDSConnectController = require('../controllers/IDSConnectController');
const IDSConnectService = require('../main/ids-connect-service');

test('SEC-1: buildLaunchUrl rejects non-HTTPS protocols', () => {
    const dangerousSchemes = [
        'http://shop.example.com/ids',
        'file:///C:/Windows/System32/calc.exe',
        'ms-msdt:-id IT_ReCommend',
        'cmd://test',
        'powershell://test',
        'javascript:alert(1)'
    ];

    for (const schemeUrl of dangerousSchemes) {
        assert.throws(
            () => {
                IDSConnectController.buildLaunchUrl({ shop_url: schemeUrl });
            },
            /Sicherheitsverstoß \(SEC-1\)|is not a valid URL|Ungültige Shop-URL/i,
            `Expected rejection for ${schemeUrl}`
        );
    }
});

test('SEC-1: buildLaunchUrl rejects localhost and loopback hostnames', () => {
    const loopbacks = [
        'https://localhost/ids',
        'https://127.0.0.1/ids',
        'https://[::1]/ids'
    ];

    for (const lb of loopbacks) {
        assert.throws(
            () => {
                IDSConnectController.buildLaunchUrl({ shop_url: lb });
            },
            /Sicherheitsverstoß: Lokale Adressen sind als Großhandels-Webshop unzulässig/i,
            `Expected rejection for loopback: ${lb}`
        );
    }
});

test('SEC-1: buildLaunchUrl generates valid HTTPS launch URL with standard parameters', () => {
    const konto = {
        name: 'GC Gruppe',
        shop_url: 'https://onlineplus.gc-gruppe.de/ids',
        kundennummer: 'KD-12345',
        api_key: 'SECRET-KEY',
        benutzername: 'max.muster'
    };

    const urlStr = IDSConnectController.buildLaunchUrl(konto, {
        action: 'call',
        sessionId: 'TEST-SESS-999',
        csrfToken: 'CSRF-TOKEN-ABC'
    });

    const parsed = new URL(urlStr);
    assert.equal(parsed.protocol, 'https:');
    assert.equal(parsed.hostname, 'onlineplus.gc-gruppe.de');
    assert.equal(parsed.searchParams.get('ids_version'), '2.5');
    assert.equal(parsed.searchParams.get('ids_action'), 'call');
    assert.equal(parsed.searchParams.get('customer_number'), 'KD-12345');
    assert.equal(parsed.searchParams.get('session_id'), 'TEST-SESS-999');
    assert.equal(parsed.searchParams.get('csrf_token'), 'CSRF-TOKEN-ABC');
});

test('SEC-2: validateSession enforces timing-safe CSRF token', () => {
    const service = new IDSConnectService(null, { port: 49152 });
    const { sessionId, csrfToken } = service.createSession(1, { projektId: 10 });

    // Valid session + matching CSRF
    assert.equal(service.validateSession(sessionId, csrfToken), true);

    // Missing CSRF token
    assert.equal(service.validateSession(sessionId, null), false);
    assert.equal(service.validateSession(sessionId, ''), false);

    // Mismatched CSRF token
    assert.equal(service.validateSession(sessionId, 'WRONG-TOKEN'), false);
    assert.equal(service.validateSession(sessionId, csrfToken + 'x'), false);

    // Invalid session ID
    assert.equal(service.validateSession('NON-EXISTENT', csrfToken), false);
    assert.equal(service.validateSession('', csrfToken), false);
});
