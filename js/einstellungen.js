// js/einstellungen.js (Fassade)
// Dieses Modul dient der Abwärtskompatibilität.
// Die Implementierung befindet sich in js/settings/*.js

if (typeof module !== 'undefined' && module.exports) {
    const form = require('./settings/settings-form.js');
    const backup = require('./settings/settings-backup.js');
    const template = require('./settings/settings-template.js');
    const print = require('./settings/settings-print.js');
    const mahnung = require('./settings/settings-mahnung.js');
    const smtp = require('./settings/settings-smtp.js');
    
    module.exports = {
        ...form,
        ...backup,
        ...template,
        ...print,
        ...mahnung,
        ...smtp
    };
}
