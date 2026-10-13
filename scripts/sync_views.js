const fs = require('fs');
const path = require('path');

const viewsDir = path.join(__dirname, '../views/partials');
const outputFile = path.join(__dirname, '../js/view-loader.js');

const viewFiles = fs.readdirSync(viewsDir).filter(f => f.startsWith('view-') && f.endsWith('.html')).sort();

console.log(`Found ${viewFiles.length} view partials in views/partials/`);

function escapeForTemplate(html) {
    // CRLF/LF normalisieren: alles auf LF, dann einheitlich auf CRLF
    // (Quelldateien und view-loader.js nutzen CRLF - so bleibt die Ausgabe stabil)
    const normalized = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n');
    // Fuer Backtick-Template-Literal escapen: Backslash zuerst, dann Backticks und ${
    return normalized.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

const entries = viewFiles.map(file => {
    const key = file.replace(/\.html$/, '');
    const content = fs.readFileSync(path.join(viewsDir, file), 'utf8');
    return `    "${key}": \`${escapeForTemplate(content)}\`,`;
});

const templatesBlock = entries.join('\r\n');

// Loader-Logik am Dateiende - Vorlage aus js/view-loader.js Zeilen 2649-2679, nicht neu erfunden.
// (initViews/replaceWith: ersetzt Platzhalter-Container synchron beim Bootstrapping)
const loaderLogic = [
    '(function() {',
    "    const doc = typeof document !== 'undefined' ? document : null;",
    '    ',
    '    if (!doc) return;',
    '',
    '    let viewsInitialized = false;',
    '',
    '    function initViews() {',
    '        if (viewsInitialized) return;',
    '        viewsInitialized = true;',
    '        ',
    '        for (const [id, html] of Object.entries(VIEW_TEMPLATES)) {',
    "            let container = doc.getElementById(id);",
    '            if (container) {',
    "                const temp = doc.createElement('div');",
    '                temp.innerHTML = html.trim();',
    '                const viewEl = temp.firstElementChild;',
    '                if (viewEl) {',
    '                    container.replaceWith(viewEl);',
    '                }',
    '            }',
    '        }',
    '    }',
    '',
    '    // Auto-init synchronously for test environments and browser since script is at end of body',
    '    if (doc && doc.body) {',
    '        initViews();',
    '    } else {',
    "        doc.addEventListener('DOMContentLoaded', initViews);",
    '    }',
    '})();'
].join('\r\n');

const code = '\r\nconst VIEW_TEMPLATES = {\r\n' + templatesBlock + '\r\n};\r\n\r\n' + loaderLogic + '\r\n';

fs.writeFileSync(outputFile, code, 'utf8');
console.log(`Generated ${outputFile} with ${viewFiles.length} templates (${(code.length / 1024).toFixed(1)} KB)`);
