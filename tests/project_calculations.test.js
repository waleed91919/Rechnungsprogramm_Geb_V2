const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const { calculateProjektUmsatz } = require('../js/projects/project-calculations.js');

test('calculateProjektUmsatz - basic period invoices', () => {
    const invoices = [
        { status: 'Offen', netto: 100 },
        { status: 'Bezahlt', gesamtNetto: 200 }
    ];
    const result = calculateProjektUmsatz(invoices);
    assert.strictEqual(result, 300);
});

test('calculateProjektUmsatz - drafts are excluded', () => {
    const invoices = [
        { status: 'Entwurf', netto: 100 },
        { status: 'Bezahlt', netto: 200 }
    ];
    const result = calculateProjektUmsatz(invoices);
    assert.strictEqual(result, 200);
});

test('calculateProjektUmsatz - stornos are excluded unless paidStornoOriginalNrs matches', () => {
    const invoices = [
        { status: 'Storniert', netto: 100, nr: 'R-1' },
        { status: 'Storniert', netto: 50, nr: 'R-2' },
        { status: 'Bezahlt', netto: 200, nr: 'R-3' }
    ];
    const paidStornos = new Set(['R-1']);

    const result = calculateProjektUmsatz(invoices, paidStornos);
    // R-1 is included (100), R-3 is included (200), R-2 is excluded
    assert.strictEqual(result, 300);
});

test('calculateProjektUmsatz - cumulative logic with final invoice', () => {
    const invoices = [
        { status: 'Bezahlt', rechnungsart: 'ABSCHLAG_KUMULIERT', netto: 100, kumulierte_leistung_netto: 100 },
        { status: 'Bezahlt', rechnungsart: 'ABSCHLAG_KUMULIERT', netto: 50, kumulierte_leistung_netto: 150 },
        { status: 'Offen', typ: 'SCHLUSSRECHNUNG', netto: 250 }
    ];
    const result = calculateProjektUmsatz(invoices);
    // Should take the Schlussrechnung's netto
    assert.strictEqual(result, 250);
});

test('calculateProjektUmsatz - cumulative logic with highest kumulierte_leistung_netto (no final invoice)', () => {
    const invoices = [
        { status: 'Bezahlt', rechnungsart: 'ABSCHLAG_KUMULIERT', netto: 100, kumulierte_leistung_netto: 100 },
        { status: 'Offen', rechnungsart: 'ABSCHLAG_KUMULIERT', netto: 50, kumulierte_leistung_netto: 150 },
        { status: 'Bezahlt', rechnungsart: 'ABSCHLAG_KUMULIERT', netto: 20, kumulierte_leistung_netto: 170 } // highest
    ];
    const result = calculateProjektUmsatz(invoices);
    // Should take the highest kumulierte_leistung_netto
    assert.strictEqual(result, 170);
});

test('Browser environment simulation (vm) - sequential loading does not throw SyntaxError', () => {
    const calcCode = fs.readFileSync(path.join(__dirname, '../js/projects/project-calculations.js'), 'utf8');
    const projektCode = fs.readFileSync(path.join(__dirname, '../js/projekte.js'), 'utf8');

    // Create a mock window object
    const sandbox = {
        window: {},
        document: {
            getElementById: () => ({ classList: { remove: () => {} } })
        },
        console: console,
        require: (mod) => {
            if (mod.includes('project-calculations')) {
                return require('../js/projects/project-calculations.js');
            }
            return {};
        },
        module: { exports: {} }
    };
    sandbox.window.api = {}; // mock some api

    // Add missing mock functions that might be at the top level
    sandbox.populateSelects = () => {};

    vm.createContext(sandbox);

    // Load first script
    assert.doesNotThrow(() => {
        vm.runInContext(calcCode, sandbox);
    });

    // Check if it's attached to window
    assert.strictEqual(typeof sandbox.window.calculateProjektUmsatz, 'function');

    // Load second script (js/projekte.js)
    assert.doesNotThrow(() => {
        vm.runInContext(projektCode, sandbox);
    });

    // Verify calculateProjektUmsatz is exported
    assert.strictEqual(typeof sandbox.module.exports.calculateProjektUmsatz, 'function');

    // Test that the exported function works
    const result = sandbox.module.exports.calculateProjektUmsatz([{ status: 'Bezahlt', netto: 10 }]);
    assert.strictEqual(result, 10);
});
