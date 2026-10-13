const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function normalize(content) {
    return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function unescapeTemplate(escaped) {
    return escaped.replace(/\\\$\{/g, '${').replace(/\\`/g, '`').replace(/\\\\/g, '\\');
}

test('=== View Templates Integrity (views/partials -> js/view-loader.js) ===', async (t) => {
    const partialsDir = path.join(__dirname, '../views/partials');
    const loaderPath = path.join(__dirname, '../js/view-loader.js');

    await t.test('1. view-loader.js existiert und enthaelt VIEW_TEMPLATES', () => {
        assert.ok(fs.existsSync(loaderPath), 'js/view-loader.js muss existieren');
        const loader = fs.readFileSync(loaderPath, 'utf8');
        assert.ok(loader.includes('const VIEW_TEMPLATES'), 'view-loader.js muss VIEW_TEMPLATES definieren');
        assert.ok(loader.includes('initViews'), 'view-loader.js muss initViews-Logik enthalten');
        assert.ok(loader.includes('replaceWith'), 'view-loader.js muss replaceWith-Logik enthalten');
    });

    await t.test('2. jede views/partials/view-*.html ist als Key mit normalisiertem Inhalt eingebettet', () => {
        assert.ok(fs.existsSync(partialsDir), 'views/partials/ muss existieren');
        const files = fs.readdirSync(partialsDir).filter(f => f.startsWith('view-') && f.endsWith('.html')).sort();
        assert.ok(files.length > 0, 'es muss mindestens eine view-*.html geben');
        console.log(`Found ${files.length} view partials in views/partials/`);

        const loaderRaw = fs.readFileSync(loaderPath, 'utf8');
        const loaderNorm = normalize(loaderRaw);
        const loaderUnescaped = unescapeTemplate(loaderNorm);

        for (const file of files) {
            const key = file.replace(/\.html$/, '');
            const fileContent = fs.readFileSync(path.join(partialsDir, file), 'utf8');
            const fileNorm = normalize(fileContent);

            assert.ok(
                loaderRaw.includes(`"${key}"`),
                `Key "${key}" aus ${file} muss in js/view-loader.js existieren`
            );
            assert.ok(
                loaderUnescaped.includes(fileNorm),
                `Inhalt von ${file} muss nach Normalisierung (CRLF->LF, trim) in js/view-loader.js enthalten sein`
            );
        }

        console.log(`Verified ${files.length} view templates in js/view-loader.js`);
    });
});
