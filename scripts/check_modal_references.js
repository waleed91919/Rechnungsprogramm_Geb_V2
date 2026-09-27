const fs = require('fs');
const path = require('path');

const dirs = ['js', 'views', 'controllers'];
const modalIds = [
    'artikel-modal', 'bank-konto-modal', 'sepa-prenot-modal', 'mandat-modal', 'sepa-lauf-detail-modal',
    'aufmassblatt-modal', 'nachtrag-modal', 'abnahme-modal', 'eingangsrechnung-modal',
    'aufmass-wizard-modal', 'formelassistent-modal', 'aufmass-uebergabe-modal', 'kunde-modal',
    'objekt-modal', 'lv-bereich-modal', 'lv-position-modal', 'lv-eintrag-modal', 'zuschlagsprofil-modal',
    'smtp-konto-modal', 'email-modal', 'plan-modal', 'generierung-modal', 'sammel-modal',
    'storno-lauf-modal', 'rechnung-modal', 'projekt-modal', 'pdf-preview-modal', 'steuerbericht-modal',
    'restore-modal', 'extend-deadline-modal', 'mahnung-modal', 'help-modal', 'custom-confirm-modal', 'aufmass-modal'
];

modalIds.forEach(id => {
    dirs.forEach(d => {
        const fullDir = path.join(__dirname, '..', d);
        if (!fs.existsSync(fullDir)) return;
        fs.readdirSync(fullDir).forEach(f => {
            if (!f.endsWith('.js')) return;
            const content = fs.readFileSync(path.join(fullDir, f), 'utf8');
            if (content.includes(`'${id}'`) || content.includes(`"${id}"`)) {
                console.log(`Modal ID [${id}] referenced in ${d}/${f}`);
            }
        });
    });
});
