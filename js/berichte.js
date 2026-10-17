/**
 * Fassade für das Berichte-Modul
 * Die eigentliche Logik wurde nach js/reports/ ausgelagert.
 * Diese Datei dient der Abwärtskompatibilität.
 */

if (typeof module !== 'undefined' && module.exports) {
    // MVC-Disziplin: Im Renderer (Electron, sandbox) läuft alles via views/* + view-loader.js
    // und window.api (IPC). Dieser Require-Block gilt NUR für Node/Tests — niemals DB direkt.
    const isRenderer = typeof process !== 'undefined' && process.type === 'renderer';
    const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';
    
    if (!isRenderer && !isBrowser) {
        try {
            Object.assign(module.exports, 
                require('./reports/report-filter.js'),
                require('./reports/report-calc.js'),
                require('./reports/report-ui.js'),
                require('./reports/report-export.js')
            );
        } catch(e) {}
    }
}
