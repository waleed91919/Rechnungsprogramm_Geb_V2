const fs = require('fs');
const path = require('path');

const preloadContent = fs.readFileSync(path.join(__dirname, '../preload.js'), 'utf8');
const mainContent = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');

// Finde ipcRenderer.invoke(...) in preload.js
const invokeRegex = /ipcRenderer\.invoke\(\s*['"`]([^'"`]+)['"`]/g;
const preloadInvokes = new Set();
let m;
while ((m = invokeRegex.exec(preloadContent)) !== null) {
    preloadInvokes.add(m[1]);
}

// Finde ipcMain.handle(...) in main.js
const handleRegex = /ipcMain\.handle\(\s*['"`]([^'"`]+)['"`]/g;
const mainHandles = new Set();
while ((m = handleRegex.exec(mainContent)) !== null) {
    mainHandles.add(m[1]);
}

// Auch main/*.js durchsuchen, falls dort ipcMain registriert wird
const mainDir = path.join(__dirname, '../main');
if (fs.existsSync(mainDir)) {
    fs.readdirSync(mainDir).forEach(f => {
        if (f.endsWith('.js')) {
            const c = fs.readFileSync(path.join(mainDir, f), 'utf8');
            while ((m = handleRegex.exec(c)) !== null) {
                mainHandles.add(m[1]);
            }
        }
    });
}

console.log(`Preload invoke channels: ${preloadInvokes.size}`);
console.log(`Main handle channels: ${mainHandles.size}`);

const missingInMain = [];
for (const ch of preloadInvokes) {
    if (!mainHandles.has(ch)) {
        missingInMain.push(ch);
    }
}

const missingInPreload = [];
for (const ch of mainHandles) {
    if (!preloadInvokes.has(ch)) {
        missingInPreload.push(ch);
    }
}

console.log('\n--- In preload.js aufgerufen, aber in main.js NICHT gehandhabt ---');
if (missingInMain.length === 0) {
    console.log('Keine! Alle preload-Kanäle sind im Backend registriert.');
} else {
    missingInMain.forEach(c => console.log('  - ' + c));
}

console.log('\n--- In main.js gehandhabt, aber in preload.js NICHT exponiert ---');
if (missingInPreload.length === 0) {
    console.log('Keine!');
} else {
    missingInPreload.forEach(c => console.log('  - ' + c));
}
