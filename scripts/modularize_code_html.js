const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const codeHtmlPath = path.join(__dirname, '../code.html');
const backupPath = path.join(__dirname, '../code.html.bak');

const originalHtml = fs.readFileSync(backupPath, 'utf8');

// Collect original IDs for verification
const origDom = new JSDOM(originalHtml);
const origIds = new Set(Array.from(origDom.window.document.querySelectorAll('[id]')).map(e => e.id));
console.log(`Original code.html has ${origIds.size} unique IDs`);

const lines = originalHtml.split('\n');

// Block 1: artikel-modal
let artikelStart = -1;
for (let i = 670; i < 680; i++) {
    if (lines[i].includes('<!-- Modal Overlay -->') && lines[i+1].includes('id="artikel-modal"')) {
        artikelStart = i;
        break;
    }
}
let artikelEnd = -1;
let depth = 0;
for (let i = artikelStart + 1; i < lines.length; i++) {
    const l = lines[i];
    depth += (l.match(/<div(\s|>)/g) || []).length;
    depth -= (l.match(/<\/div>/g) || []).length;
    if (depth === 0) {
        artikelEnd = i;
        break;
    }
}
console.log(`Block 1 (artikel-modal): Lines ${artikelStart+1} to ${artikelEnd+1}`);

// Block 2: Banking modals
let bankingStart = -1;
for (let i = 2050; i < 2070; i++) {
    if (lines[i].includes('<!-- Bank Account Modal -->')) {
        bankingStart = i;
        break;
    }
}
let sepaDetailStart = -1;
for (let i = bankingStart; i < lines.length; i++) {
    if (lines[i].includes('id="sepa-lauf-detail-modal"')) {
        sepaDetailStart = i;
        break;
    }
}
let bankingEnd = -1;
depth = 0;
for (let i = sepaDetailStart; i < lines.length; i++) {
    const l = lines[i];
    depth += (l.match(/<div(\s|>)/g) || []).length;
    depth -= (l.match(/<\/div>/g) || []).length;
    if (depth === 0) {
        bankingEnd = i;
        break;
    }
}
console.log(`Block 2 (Banking modals): Lines ${bankingStart+1} to ${bankingEnd+1}`);

// Block 3: Kernfunktionen modals
let kernStart = -1;
for (let i = 2900; i < 2930; i++) {
    if (lines[i].includes('<!-- MODALS FÜR KERNFUNKTIONEN')) {
        if (lines[i-1].includes('<!-- ======')) kernStart = i - 1;
        else kernStart = i;
        break;
    }
}
let uebergabeStart = -1;
for (let i = kernStart; i < lines.length; i++) {
    if (lines[i].includes('id="aufmass-uebergabe-modal"')) {
        uebergabeStart = i;
        break;
    }
}
let kernEnd = -1;
depth = 0;
for (let i = uebergabeStart; i < lines.length; i++) {
    const l = lines[i];
    depth += (l.match(/<div(\s|>)/g) || []).length;
    depth -= (l.match(/<\/div>/g) || []).length;
    if (depth === 0) {
        kernEnd = i;
        break;
    }
}
console.log(`Block 3 (Kernfunktionen modals): Lines ${kernStart+1} to ${kernEnd+1}`);

// Block 4A: Kunde modal bis pdf-preview-modal
let kundeStart = -1;
for (let i = 3930; i < 3945; i++) {
    if (lines[i].includes('<!-- Kunde Modal Overlay -->')) {
        kundeStart = i;
        break;
    }
}
let pdfPreviewStart = -1;
for (let i = kundeStart; i < lines.length; i++) {
    if (lines[i].includes('id="pdf-preview-modal"')) {
        pdfPreviewStart = i;
        break;
    }
}
let block4AEnd = -1;
depth = 0;
for (let i = pdfPreviewStart; i < lines.length; i++) {
    const l = lines[i];
    depth += (l.match(/<div(\s|>)/g) || []).length;
    depth -= (l.match(/<\/div>/g) || []).length;
    if (depth === 0) {
        block4AEnd = i;
        break;
    }
}
console.log(`Block 4A (Kunde bis PDF-Preview): Lines ${kundeStart+1} to ${block4AEnd+1}`);

// Block 4B: Steuerbericht-modal bis Aufmaß-modal
let steuerStart = -1;
for (let i = block4AEnd; i < lines.length; i++) {
    if (lines[i].includes('<!-- Steuerbericht Modal -->')) {
        steuerStart = i;
        break;
    }
}
let aufmassPhase2Start = -1;
for (let i = steuerStart; i < lines.length; i++) {
    if (lines[i].includes('id="aufmass-modal"')) {
        aufmassPhase2Start = i;
        break;
    }
}
let block4BEnd = -1;
depth = 0;
for (let i = aufmassPhase2Start; i < lines.length; i++) {
    const l = lines[i];
    depth += (l.match(/<div(\s|>)/g) || []).length;
    depth -= (l.match(/<\/div>/g) || []).length;
    if (depth === 0) {
        block4BEnd = i;
        break;
    }
}
console.log(`Block 4B (Steuerbericht bis Aufmaß): Lines ${steuerStart+1} to ${block4BEnd+1}`);

const partA = lines.slice(0, artikelStart);
const repl1 = ['        <!-- Artikel-Modal ausgelagert nach views/modals/artikel-modal.html (geladen via js/modal-loader.js) -->'];
const partB = lines.slice(artikelEnd + 1, bankingStart);
const repl2 = ['        <!-- Banking & SEPA Modale ausgelagert nach views/modals/ (geladen via js/modal-loader.js) -->'];
const partC = lines.slice(bankingEnd + 1, kernStart);
const repl3 = ['        <!-- Modals für Kernfunktionen (Aufmaß, Nachtrag, Abnahme, Eingangsrechnung) ausgelagert nach views/modals/ (geladen via js/modal-loader.js) -->'];
const partD = lines.slice(kernEnd + 1, kundeStart);
const repl4A = ['        <!-- Modale (Kunden, Objekte, LV, E-Mail, Dauerrechnungen, Belegeditor) ausgelagert nach views/modals/ (geladen via js/modal-loader.js) -->'];
const partPrintTemplate = lines.slice(block4AEnd + 1, steuerStart);
const repl4B = [
    '    <!-- Modals Container: Zentraler Einhängepunkt für alle ausgelagerten Modale (views/modals/) -->',
    '    <div id="modals-container"></div>'
];
const partE = lines.slice(block4BEnd + 1);

// In partE, insert <script src="js/modal-loader.js"></script> right before <script src="js/state.js"></script>
const partEAdjusted = [];
for (let i = 0; i < partE.length; i++) {
    const line = partE[i];
    if (line.includes('<script src="js/state.js"></script>')) {
        partEAdjusted.push('    <script src="js/modal-loader.js"></script>');
    }
    partEAdjusted.push(line);
}

const newLines = [
    ...partA,
    ...repl1,
    ...partB,
    ...repl2,
    ...partC,
    ...repl3,
    ...partD,
    ...repl4A,
    ...partPrintTemplate,
    ...repl4B,
    ...partEAdjusted
];

const newHtml = newLines.join('\n');
console.log(`Original line count: ${lines.length}`);
console.log(`New line count: ${newLines.length}`);
console.log(`Reduction: ${lines.length - newLines.length} lines saved! (${((lines.length - newLines.length)/lines.length*100).toFixed(1)}%)`);

// VERIFICATION:
const newDom = new JSDOM(newHtml, {
    beforeParse(window) {
        window.tailwind = { config: {} };
    },
    runScripts: "dangerously"
});
const newWindow = newDom.window;
const newDoc = newWindow.document;

// Execute modal-loader.js in new DOM
const modalLoaderCode = fs.readFileSync(path.join(__dirname, '../js/modal-loader.js'), 'utf8');
newWindow.eval(modalLoaderCode);

const finalIds = new Set(Array.from(newDoc.querySelectorAll('[id]')).map(e => e.id));
console.log(`New DOM with ModalLoader has ${finalIds.size} unique IDs`);

// Check if any original ID is missing
const missing = [];
for (const id of origIds) {
    if (!finalIds.has(id)) {
        missing.push(id);
    }
}

if (missing.length > 0) {
    console.error(`FATAL: ${missing.length} IDs are missing from new DOM!`, missing);
    process.exit(1);
}

console.log('✓ VERIFICATION SUCCESSFUL: 100% of original IDs exist in new modular DOM!');

// Write modularized code.html
fs.writeFileSync(codeHtmlPath, newHtml, 'utf8');
console.log('Successfully written updated code.html!');
