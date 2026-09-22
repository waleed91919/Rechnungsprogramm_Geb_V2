/**
 * ui_fokusmodus.test.js (P0.6): Kern-Flow ohne Modul-Hopping, Rest hinter Flag.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const nav = require('../js/navigation');

test('P0.6 Standard: nur Kern-Views sichtbar, nichts gelöscht', () => {
    global.state = { einstellungen: {} };
    const visible = nav.getVisibleViews();
    for (const v of ['dashboard', 'kunden', 'angebote', 'projekte', 'rechnungen', 'banking', 'berichte', 'einstellungen']) {
        assert.ok(visible.includes(v), `Kern-View ${v} muss sichtbar sein`);
    }
    for (const v of ['objekte', 'dauerrechnungen', 'putzplan', 'grosshandel', 'sokabau']) {
        assert.ok(!visible.includes(v), `Experimentell ${v} muss Standard-aus sein`);
    }
    // viewConfig unversehrt (nichts gelöscht)
    for (const v of ['objekte', 'dauerrechnungen', 'putzplan', 'grosshandel', 'sokabau', 'maengel']) {
        assert.ok(nav.viewConfig[v], `${v} darf nicht gelöscht sein`);
    }
    delete global.state;
});

test('P0.6 Opt-in: alle Views sichtbar', () => {
    global.state = { einstellungen: { experimental_module: true } };
    const visible = nav.getVisibleViews();
    for (const v of ['objekte', 'dauerrechnungen', 'putzplan', 'grosshandel', 'sokabau']) {
        assert.ok(visible.includes(v), `${v} muss mit Flag sichtbar sein`);
    }
    delete global.state;
});

test('P0.6 Kern-Flow in einem Navigationskontext (kein Modul-Hopping)', () => {
    const kernFlow = ['kunden', 'angebote', 'projekte', 'rechnungen', 'banking', 'berichte'];
    global.state = { einstellungen: {} };
    const visible = new Set(nav.getVisibleViews());
    for (const v of kernFlow) assert.ok(visible.has(v), `${v} im Kern-Flow`);
    delete global.state;
});
