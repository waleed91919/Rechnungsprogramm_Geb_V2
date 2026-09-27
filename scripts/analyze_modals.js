const fs = require('fs');
const path = require('path');

const codeHtml = fs.readFileSync(path.join(__dirname, '../code.html'), 'utf8');
const lines = codeHtml.split('\n');

// Find all elements that look like modals:
// Usually <div id="...modal..." or class="...fixed inset-0..."
// Let's parse line by line with tag depth tracking or regex.

const modalCandidates = [];
const linesCount = lines.length;

for (let i = 0; i < linesCount; i++) {
    const line = lines[i];
    // Check if line starts a modal container
    if (line.includes('<div') && (line.includes('fixed inset-0') || line.toLowerCase().includes('-modal') || line.toLowerCase().includes('modal-overlay'))) {
        // extract id
        const idMatch = line.match(/id=["']([^"']+)["']/);
        const classMatch = line.match(/class=["']([^"']+)["']/);
        modalCandidates.push({
            line: i + 1,
            id: idMatch ? idMatch[1] : null,
            classes: classMatch ? classMatch[1] : null,
            raw: line.trim()
        });
    }
}

console.log(`Found ${modalCandidates.length} candidate lines:`);
modalCandidates.forEach(m => console.log(`Line ${m.line}: id="${m.id}" | ${m.classes ? m.classes.substring(0, 40) : ''}`));
