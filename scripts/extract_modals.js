const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const modalsDir = path.join(__dirname, '../views/modals');
if (!fs.existsSync(modalsDir)) {
    fs.mkdirSync(modalsDir, { recursive: true });
}

const codeHtml = fs.readFileSync(path.join(__dirname, '../code.html'), 'utf8');
const lines = codeHtml.split('\n');

const modalDefinitions = [
    { id: 'artikel-modal', file: 'artikel-modal.html', desc: 'Artikel Erstellen & Bearbeiten Modal' },
    { id: 'bank-konto-modal', file: 'bank-konto-modal.html', desc: 'Bankkonto Stammdaten Modal' },
    { id: 'sepa-prenot-modal', file: 'sepa-prenot-modal.html', desc: 'SEPA Pre-Notification Vorabinformation Modal' },
    { id: 'mandat-modal', file: 'mandat-modal.html', desc: 'SEPA Mandat Erstellen & Bearbeiten Modal' },
    { id: 'sepa-lauf-detail-modal', file: 'sepa-lauf-detail-modal.html', desc: 'SEPA Lastschriftlauf Detailansicht Modal' },
    { id: 'aufmassblatt-modal', file: 'aufmassblatt-modal.html', desc: 'Aufmaßblatt Bearbeiten Modal (TopKontor)' },
    { id: 'nachtrag-modal', file: 'nachtrag-modal.html', desc: 'VOB/B Nachtrag Erstellen & Bearbeiten Modal' },
    { id: 'abnahme-modal', file: 'abnahme-modal.html', desc: 'Digitales Bauabnahmeprotokoll Modal' },
    { id: 'eingangsrechnung-modal', file: 'eingangsrechnung-modal.html', desc: 'Eingangsrechnung & §48b Bauabzugsteuer Modal' },
    { id: 'aufmass-wizard-modal', file: 'aufmass-wizard-modal.html', desc: 'Aufmaß Erstellungs-Assistent (2-Step Wizard Modal)' },
    { id: 'formelassistent-modal', file: 'formelassistent-modal.html', desc: 'Formelauswahl- & Werteingabe-Assistent Modal' },
    { id: 'aufmass-uebergabe-modal', file: 'aufmass-uebergabe-modal.html', desc: 'Aufmaß-in-Dokument Übergabe Modal (Dokumentenfluss)' },
    { id: 'kunde-modal', file: 'kunde-modal.html', desc: 'Kunde Anlegen & Bearbeiten Modal (inkl. Quick-Paste)' },
    { id: 'objekt-modal', file: 'objekt-modal.html', desc: 'Objektverwaltung Modal (Liegenschaft, Gebäude, Etage, Raum)' },
    { id: 'lv-bereich-modal', file: 'lv-bereich-modal.html', desc: 'Reinigungs-LV Bereich Modal (F3)' },
    { id: 'lv-position-modal', file: 'lv-position-modal.html', desc: 'Reinigungs-LV Leistungsposition Modal (F3)' },
    { id: 'lv-eintrag-modal', file: 'lv-eintrag-modal.html', desc: 'Reinigungs-LV Zuordnung Position <-> Objekt Modal (F3)' },
    { id: 'zuschlagsprofil-modal', file: 'zuschlagsprofil-modal.html', desc: 'Zuschlagsprofil für Reinigung & Turnus Modal (F3)' },
    { id: 'smtp-konto-modal', file: 'smtp-konto-modal.html', desc: 'SMTP-E-Mail-Konto Konfiguration Modal (F10)' },
    { id: 'email-modal', file: 'email-modal.html', desc: 'E-Mail-Versand am Beleg Modal (F10)' },
    { id: 'plan-modal', file: 'plan-modal.html', desc: 'Abrechnungsplan für Dauerrechnungen Modal (F2)' },
    { id: 'generierung-modal', file: 'generierung-modal.html', desc: 'Dauerrechnungs-Generierung Vorschau Modal (F2)' },
    { id: 'sammel-modal', file: 'sammel-modal.html', desc: 'Sammelrechnung Erstellen Modal (F2)' },
    { id: 'storno-lauf-modal', file: 'storno-lauf-modal.html', desc: 'Dauerrechnungslauf Stornieren Modal (F2)' },
    { id: 'rechnung-modal', file: 'rechnung-modal.html', desc: 'Rechnungs- & Beleg-Editor Modal (Hauptbelegeditor)' },
    { id: 'projekt-modal', file: 'projekt-modal.html', desc: 'Projekt Anlegen & Bearbeiten Modal' },
    { id: 'pdf-preview-modal', file: 'pdf-preview-modal.html', desc: 'PDF Druckvorschau Modal' },
    { id: 'steuerbericht-modal', file: 'steuerbericht-modal.html', desc: 'Steuerbericht & USt-Voranmeldung Modal' },
    { id: 'restore-modal', file: 'restore-modal.html', desc: 'Backup Wiederherstellung Bestätigungs-Modal' },
    { id: 'extend-deadline-modal', file: 'extend-deadline-modal.html', desc: 'Zahlungsziel verlängern Modal' },
    { id: 'mahnung-modal', file: 'mahnung-modal.html', desc: 'Mahnung Erstellen Modal' },
    { id: 'help-modal', file: 'help-modal.html', desc: 'Tastatur-Shortcuts & Hilfe Modal' },
    { id: 'custom-confirm-modal', file: 'custom-confirm-modal.html', desc: 'Benutzerdefinierter Bestätigungsdialog Modal' },
    { id: 'aufmass-modal', file: 'aufmass-modal.html', desc: 'Aufmaß Modal (Phase 2 Live-Berechnung)' }
];

const extractedModals = [];

modalDefinitions.forEach(def => {
    let startLine = -1;
    let endLine = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(`id="${def.id}"`) || lines[i].includes(`id='${def.id}'`)) {
            startLine = i + 1;
            break;
        }
    }

    if (startLine === -1) {
        throw new Error(`Modal with id="${def.id}" not found in code.html!`);
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

    const modalLines = lines.slice(startLine - 1, endLine);
    const content = modalLines.join('\n');

    // Validate with JSDOM
    const dom = new JSDOM(content);
    const el = dom.window.document.getElementById(def.id);
    if (!el) {
        throw new Error(`Validation failed: ID ${def.id} not found in parsed chunk!`);
    }

    const filePath = path.join(modalsDir, def.file);
    fs.writeFileSync(filePath, content, 'utf8');

    extractedModals.push({
        id: def.id,
        file: def.file,
        desc: def.desc,
        startLine,
        endLine,
        lineCount: endLine - startLine + 1,
        charCount: content.length,
        innerIds: Array.from(el.querySelectorAll('[id]')).map(e => e.id)
    });
});

console.log(`Successfully extracted ${extractedModals.length} modals to views/modals/:`);
console.table(extractedModals.map(m => ({
    file: m.file,
    id: m.id,
    lines: m.lineCount,
    innerIds: m.innerIds.length,
    desc: m.desc
})));

// Save metadata manifest
fs.writeFileSync(
    path.join(modalsDir, 'manifest.json'),
    JSON.stringify(extractedModals, null, 2),
    'utf8'
);
console.log('Saved manifest.json');
