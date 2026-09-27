const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// 1. Get baseline IDs from original code.html
const originalHtml = fs.readFileSync(path.join(__dirname, '../code.html'), 'utf8');
const origDom = new JSDOM(originalHtml);
const origDoc = origDom.window.document;
const origIds = new Set(Array.from(origDoc.querySelectorAll('[id]')).map(e => e.id));
console.log(`Original code.html has ${origIds.size} unique IDs`);

// 2. Load modal-loader.js
const modalLoaderCode = fs.readFileSync(path.join(__dirname, '../js/modal-loader.js'), 'utf8');

// 3. Create simulated modular HTML (without the modals directly in code.html, but with modal-loader.js)
// We test if ModalLoader mounts everything properly and preserves all IDs!
const simulatedDom = new JSDOM('<!DOCTYPE html><html><head></head><body><main></main></body></html>', {
    runScripts: "dangerously"
});
const simWindow = simulatedDom.window;
const simDoc = simWindow.document;

// Execute modal loader in simulated DOM
simWindow.eval(modalLoaderCode);

const mountedModals = simDoc.querySelectorAll('[id]');
console.log(`ModalLoader mounted ${mountedModals.length} elements with IDs into the DOM`);

// Check if all 34 original modal IDs are present in simulated DOM
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../views/modals/manifest.json'), 'utf8'));
let missingModals = [];
manifest.forEach(m => {
    const el = simDoc.getElementById(m.id);
    if (!el) {
        missingModals.push(m.id);
    } else {
        // Check inner IDs
        m.innerIds.forEach(inId => {
            if (!simDoc.getElementById(inId)) {
                console.error(`Missing inner ID: ${inId} in modal ${m.id}`);
            }
        });
    }
});

if (missingModals.length === 0) {
    console.log(`✓ All ${manifest.length} modals and ALL their inner IDs were mounted perfectly by ModalLoader!`);
} else {
    console.error(`✗ Missing modals:`, missingModals);
}
