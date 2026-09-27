const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const codeHtml = fs.readFileSync(path.join(__dirname, '../code.html'), 'utf8');
const dom = new JSDOM(codeHtml);
const document = dom.window.document;

const modalIds = [
    'artikel-modal', 'bank-konto-modal', 'sepa-prenot-modal', 'mandat-modal', 'sepa-lauf-detail-modal',
    'aufmassblatt-modal', 'nachtrag-modal', 'abnahme-modal', 'eingangsrechnung-modal',
    'aufmass-wizard-modal', 'formelassistent-modal', 'aufmass-uebergabe-modal', 'kunde-modal',
    'objekt-modal', 'lv-bereich-modal', 'lv-position-modal', 'lv-eintrag-modal', 'zuschlagsprofil-modal',
    'smtp-konto-modal', 'email-modal', 'plan-modal', 'generierung-modal', 'sammel-modal',
    'storno-lauf-modal', 'rechnung-modal', 'projekt-modal', 'pdf-preview-modal', 'steuerbericht-modal',
    'restore-modal', 'extend-deadline-modal', 'mahnung-modal', 'help-modal', 'custom-confirm-modal', 'aufmass-modal'
];

// Map of modalId -> Set of inner IDs
const modalInnerIds = {};
modalIds.forEach(mId => {
    const el = document.getElementById(mId);
    if (el) {
        const innerEls = el.querySelectorAll('[id]');
        const ids = new Set([mId]);
        innerEls.forEach(inner => ids.add(inner.id));
        modalInnerIds[mId] = ids;
    }
});

console.log('Total inner IDs per modal:');
Object.entries(modalInnerIds).forEach(([mId, ids]) => {
    console.log(`- ${mId}: ${ids.size} IDs`);
});

// Check if any js file registers top-level event listeners on these IDs
const jsFiles = fs.readdirSync(path.join(__dirname, '../js')).filter(f => f.endsWith('.js'));
jsFiles.forEach(f => {
    const content = fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
    // Look for addEventListener or onclick outside functions or in init
    // Just find any getElementById followed by addEventListener
    const regex = /document\.getElementById\(['"]([^'"]+)['"]\)\.addEventListener/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        const id = match[1];
        for (const [mId, ids] of Object.entries(modalInnerIds)) {
            if (ids.has(id)) {
                console.log(`Found direct addEventListener on modal element '${id}' (in ${mId}) inside js/${f}`);
            }
        }
    }
});
