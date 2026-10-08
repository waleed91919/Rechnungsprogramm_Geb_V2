const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

test('J11 Mahnung Fristen', async (t) => {
    const tableScript = fs.readFileSync(path.join(__dirname, '../js/dashboard/dashboard-table.js'), 'utf-8');
    const actionsScript = fs.readFileSync(path.join(__dirname, '../js/dashboard/dashboard-actions.js'), 'utf-8');
    
    const dom = new JSDOM(`<!DOCTYPE html><html><body><input id="selectAll" type="checkbox"/></body></html>`, { runScripts: "dangerously" });
    const window = dom.window;
    const document = window.document;
    
    window.sanitize = (s) => s;
    window.formatCurrency = (c) => c;
    window.showToast = (msg) => { window.lastToast = msg; };
    window.toggleAllSelections = () => {};
    
    // Execute scripts
    window.eval(tableScript);
    window.eval(actionsScript);
    
    let calledApi = false;
    window.api = {
        sendBelegEmail: async (payload) => {
            calledApi = true;
            assert.strictEqual(payload.beleg_typ, 'MAHNUNG');
            assert.strictEqual(payload.mahnstufe, 1);
            return { success: true, historieId: 1 };
        }
    };
    window.safeConfirm = async () => true;

    const datumObj = new Date();
    datumObj.setDate(datumObj.getDate() - 40);

    window.state = {
        kunden: [{ id: 1, email: 'test@example.com' }],
        rechnungen: [{
            id: 1,
            nr: 'RE-01',
            kundeId: 1,
            status: 'Überfällig',
            datum: datumObj.toISOString(),
            rechnungsart: 'ABSCHLAG_KUMULIERT',
            brutto: 100,
            mahnungLevel: 1
        }]
    };

    // --- 1. Test: Fristenautomatik in createRechnungRow ---
    const row = window.createRechnungRow(window.state.rechnungen[0]);
    // tdStatus is usually around index 7, but let's just search the HTML
    const rowHtml = row.innerHTML;
    
    // Test VOB-21 Tage
    // Because diffDays is exactly 40 (based on JS date diffing without hours), 21-40 = -19 (so 19 is used, or maybe 18 depending on timezone/ms).
    // So we just check if "Abschlag überfällig seit" is present
    assert.ok(rowHtml.includes('Abschlag überfällig seit'), 'Missing VOB 21 over due text');
    
    // Test 30-Tage Auto-Verzug
    window.state.rechnungen[0].status = 'Ausstehend'; // set to Ausstehend but 40 days old
    const row2 = window.createRechnungRow(window.state.rechnungen[0]);
    assert.ok(row2.innerHTML.includes('30-Tage-Verzug (Auto)'), 'Missing 30 days Auto-Verzug');
    assert.ok(row2.innerHTML.includes('Überfällig'), 'Should be rendered as Überfällig');

    // Test VOB 30-Tage Schluss
    window.state.rechnungen[0].rechnungsart = 'SCHLUSSRECHNUNG';
    window.state.rechnungen[0].datum = new Date().toISOString(); // not overdue
    const row3 = window.createRechnungRow(window.state.rechnungen[0]);
    assert.ok(row3.innerHTML.includes('VOB 30-Tage Schluss'), 'Missing VOB 30-Tage Schluss badge');

    // --- 2. Test: Dunning Bulk Action calls sendBelegEmail ---
    // Need to reset to 'Überfällig' for dunning to work
    window.state.rechnungen[0].status = 'Überfällig';
    
    // Checkboxes
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'rechnung-checkbox';
    cb.value = 1;
    cb.checked = true;
    document.body.appendChild(cb);

    await window.bulkAction('dunning');
    
    assert.strictEqual(calledApi, true, 'sendBelegEmail API was not called');
    assert.ok(window.lastToast && window.lastToast.includes('erfolgreich versendet'), 'Success toast missing');
});
