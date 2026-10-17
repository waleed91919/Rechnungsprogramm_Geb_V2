// Fassade für Dauerrechnungen (MVC: views/* + js/recurring/*, Persistenz via window.api.dauerrechnungen* -> IPC 'db:...' -> Repository).
// Kompatibilitäts-Stub für evtl. require() in Node-Tests — kein DB-Direktzugriff.

if (typeof window !== 'undefined') {
    // Im Renderer werden die Module via views/* + view-loader.js geladen (Daten nur via window.api).
} else {
    // Für Node.js / Tests:
    // Hier würden die Module per require() eingebunden, falls Node-Tests diese direkt benötigen.
    // Da sie IIFEs sind, die window nutzen, müssten wir ein globales window-Objekt bereitstellen,
    // was in Tests (JSDOM) typischerweise ohnehin der Fall ist.
}
