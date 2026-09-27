const fs = require('fs');

const files = [
    'views/EFBView.js',
    'views/MaengelView.js',
    'views/SokaBauView.js',
    'views/GrosshandelView.js',
    'views/KalkulationView.js',
    'views/DatanormView.js'
];

files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const matches = content.match(/id=["']([^"']*modal[^"']*)["']/gi) || [];
    console.log(file, '->', matches);
});
