const assert = require('assert');
const test = require('node:test');

// A simple mock of what happens when we include the file in the browser
const mockWindow = {};
global.window = mockWindow;

require('../js/editor/editor-calculation.js');

test('extractLaufendeNummer', (t) => {
    assert.strictEqual(window.extractLaufendeNummer('STORNO - INV-2026-001'), 1);
    assert.strictEqual(window.extractLaufendeNummer('RE-2024-042'), 42);
    assert.strictEqual(window.extractLaufendeNummer('RE-99'), 99);
    assert.strictEqual(window.extractLaufendeNummer('12345'), 12345);

    // edge cases
    assert.strictEqual(window.extractLaufendeNummer('NO-NUMBER'), 0);
    assert.strictEqual(window.extractLaufendeNummer(null), 0);
    assert.strictEqual(window.extractLaufendeNummer(undefined), 0);
    assert.strictEqual(window.extractLaufendeNummer(''), 0);
});
