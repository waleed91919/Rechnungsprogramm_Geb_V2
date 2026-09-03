const fs = require('fs');
const path = require('path');

const codeHtml = fs.readFileSync(path.join(__dirname, '../code.html'), 'utf8');

// Sammle alle IDs aus code.html
const idRegex = /id=["']([^"']+)["']/g;
const htmlIds = new Set();
let m;
while ((m = idRegex.exec(codeHtml)) !== null) {
    htmlIds.add(m[1]);
}

console.log(`Gefundene IDs in code.html: ${htmlIds.size}`);

// Durchsuche alle js-Dateien und views-Dateien nach getElementById
const dirs = [
    path.join(__dirname, '../js'),
    path.join(__dirname, '../views'),
    path.join(__dirname, '../controllers'),
    path.join(__dirname, '../models')
];
const missingPerFile = {};

function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const f of files) {
        const full = path.join(dir, f);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
            scanDir(full);
        } else if (f.endsWith('.js')) {
            const content = fs.readFileSync(full, 'utf8');
            const getByIdRegex = /getElementById\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
            let match;
            while ((match = getByIdRegex.exec(content)) !== null) {
                const id = match[1];
                // Ignoriere dynamische IDs wie modal-*, pos-*, row-*
                if (id.includes('${') || id.includes('+')) continue;
                if (!htmlIds.has(id)) {
                    if (!missingPerFile[f]) missingPerFile[f] = new Set();
                    missingPerFile[f].add(id);
                }
            }
        }
    }
}

dirs.forEach(scanDir);

console.log('\n--- FEHLENDE IDs IM DOM (getElementById-Aufrufe ohne statische Entsprechung in code.html) ---');
for (const [file, ids] of Object.entries(missingPerFile)) {
    console.log(`\nDatei: ${file} (${ids.size} IDs)`);
    for (const id of ids) {
        console.log(`  - ${id}`);
    }
}
