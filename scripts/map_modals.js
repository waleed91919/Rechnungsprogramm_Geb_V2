const fs = require('fs');
const path = require('path');

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

const results = [];

modalIds.forEach(id => {
    // Find opening tag line
    let startLine = -1;
    let endLine = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(`id="${id}"`) || lines[i].includes(`id='${id}'`)) {
            startLine = i + 1;
            break;
        }
    }

    if (startLine !== -1) {
        // Find matching closing </div> by counting open/close div tags
        let depth = 0;
        let foundStart = false;
        for (let i = startLine - 1; i < lines.length; i++) {
            const line = lines[i];
            const opens = (line.match(/<div(\s|>)/g) || []).length;
            const closes = (line.match(/<\/div>/g) || []).length;
            depth += (opens - closes);
            if (depth <= 0) {
                endLine = i + 1;
                break;
            }
        }
    }

    const lineCount = (endLine > 0 && startLine > 0) ? (endLine - startLine + 1) : 0;
    results.push({ id, startLine, endLine, lineCount });
});

results.sort((a,b) => a.startLine - b.startLine);
console.log('Detected modals in code.html:');
console.table(results);
const totalLines = results.reduce((acc, r) => acc + r.lineCount, 0);
console.log(`Total lines occupied by these ${results.length} modals: ${totalLines} lines out of ${lines.length} (${(totalLines/lines.length*100).toFixed(1)}%)`);
