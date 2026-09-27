const fs = require('fs');
const path = require('path');

const modalsDir = path.join(__dirname, '../views/modals');

const bundles = {
    'banking-modals.html': [
        'bank-konto-modal.html',
        'sepa-prenot-modal.html',
        'mandat-modal.html',
        'sepa-lauf-detail-modal.html'
    ],
    'aufmass-modals.html': [
        'aufmassblatt-modal.html',
        'nachtrag-modal.html',
        'abnahme-modal.html',
        'eingangsrechnung-modal.html',
        'aufmass-wizard-modal.html',
        'formelassistent-modal.html',
        'aufmass-uebergabe-modal.html',
        'aufmass-modal.html'
    ],
    'stammdaten-modals.html': [
        'artikel-modal.html',
        'kunde-modal.html',
        'objekt-modal.html'
    ],
    'lv-modals.html': [
        'lv-bereich-modal.html',
        'lv-position-modal.html',
        'lv-eintrag-modal.html',
        'zuschlagsprofil-modal.html'
    ],
    'email-modals.html': [
        'smtp-konto-modal.html',
        'email-modal.html'
    ],
    'dauerrechnung-modals.html': [
        'plan-modal.html',
        'generierung-modal.html',
        'sammel-modal.html',
        'storno-lauf-modal.html'
    ],
    'system-modals.html': [
        'rechnung-modal.html',
        'projekt-modal.html',
        'pdf-preview-modal.html',
        'steuerbericht-modal.html',
        'restore-modal.html',
        'extend-deadline-modal.html',
        'mahnung-modal.html',
        'help-modal.html',
        'custom-confirm-modal.html'
    ]
};

for (const [bundleFile, files] of Object.entries(bundles)) {
    const combined = files.map(f => {
        const p = path.join(modalsDir, f);
        return `<!-- ========================================= -->\n<!-- PARTIAL: ${f} -->\n<!-- ========================================= -->\n` + fs.readFileSync(p, 'utf8');
    }).join('\n\n');

    fs.writeFileSync(path.join(modalsDir, bundleFile), combined, 'utf8');
    console.log(`Created domain bundle: ${bundleFile} (${files.length} modals, ${(combined.length / 1024).toFixed(1)} KB)`);
}
