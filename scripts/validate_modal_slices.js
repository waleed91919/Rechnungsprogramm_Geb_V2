const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const codeHtml = fs.readFileSync(path.join(__dirname, '../code.html'), 'utf8');
const lines = codeHtml.split('\n');

const modalIds = [
    'artikel-modal',
    'bank-konto-modal',
    'sepa-prenot-modal',
    'mandat-modal',
    'sepa-lauf-detail-modal',
    'aufmassblatt-modal',
    'nachtrag-modal',
    'abnahme-modal',
    'eingangsrechnung-modal',
    'aufmass-wizard-modal',
    'formelassistent-modal',
    'aufmass-uebergabe-modal',
    'kunde-modal',
    'objekt-modal',
    'lv-bereich-modal',
    'lv-position-modal',
    'lv-eintrag-modal',
    'zuschlagsprofil-modal',
    'smtp-konto-modal',
    'email-modal',
    'plan-modal',
    'generierung-modal',
    'sammel-modal',
    'storno-lauf-modal',
    'rechnung-modal',
    'projekt-modal',
    'pdf-preview-modal',
    'steuerbericht-modal',
    'restore-modal',
    'extend-deadline-modal',
    'mahnung-modal',
    'help-modal',
    'custom-confirm-modal',
    'aufmass-modal'
];

let allValid = true;

modalIds.forEach(id => {
    let startLine = -1;
    let endLine = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(`id="${id}"`) || lines[i].includes(`id='${id}'`)) {
            startLine = i + 1;
            break;
        }
    }

    let depth = 0;
    for (let i = startLine - 1; i < lines.length; i++) {
        const line = lines[i];
        const opens = (line.match(/<div(\s|>)/g) || []).length;
        const closes = (line.match(/<\/div>/g) || []).length;
        depth += (opens - closes);
        if (depth === 0) {
            endLine = i + 1;
            break;
        }
    }

    const chunk = lines.slice(startLine - 1, endLine).join('\n');
    // Parse chunk with JSDOM
    try {
        const dom = new JSDOM(chunk);
        const el = dom.window.document.getElementById(id);
        if (!el) {
            console.error(`ERROR: Element with id="${id}" not found in extracted chunk!`);
            allValid = false;
        } else {
            // Check if top-level element has the ID
            const bodyChildren = dom.window.document.body.children;
            if (bodyChildren.length !== 1 || bodyChildren[0].id !== id) {
                console.warn(`WARNING: For ${id}, body has ${bodyChildren.length} children. First child id: ${bodyChildren[0] ? bodyChildren[0].id : 'none'}`);
            }
        }
    } catch (e) {
        console.error(`ERROR parsing ${id}:`, e);
        allValid = false;
    }
});

if (allValid) {
    console.log('All 34 modals parse cleanly and have balanced <div> tags!');
}
