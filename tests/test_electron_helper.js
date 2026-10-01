const fs = require('fs');
const path = require('path');

function getElectronPath() {
    let electronBin = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
    if (!fs.existsSync(electronBin)) {
        electronBin = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron');
    }
    if (!fs.existsSync(electronBin)) {
        throw new Error('Electron executable not found at expected paths.');
    }
    return electronBin;
}

module.exports = {
    getElectronPath
};
