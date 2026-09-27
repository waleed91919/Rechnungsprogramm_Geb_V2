const fs = require('fs');

let content = fs.readFileSync('code.html', 'utf8');

// Find insertion point right after view-sokabau
const target = '<div id="view-sokabau" class="hidden flex-1 overflow-y-auto bg-slate-50/50 p-6"></div>';
if (!content.includes(target)) {
    console.error('Target not found in code.html!');
    process.exit(1);
}

if (content.includes('</main>')) {
    console.log('</main> already present in code.html');
} else {
    content = content.replace(target, target + '\r\n\r\n    </main>');
    fs.writeFileSync('code.html', content, 'utf8');
    console.log('Successfully inserted </main> into code.html!');
}
