// Fassade für Dauerrechnungen
// Lädt die neuen Module, um Kompatibilität für evtl. require() in Node-Tests zu bewahren.

if (typeof window !== 'undefined') {
    // Im Browser werden die Module über code.html geladen.
} else {
    // Für Node.js / Tests:
    // Hier würden die Module per require() eingebunden, falls Node-Tests diese direkt benötigen.
    // Da sie IIFEs sind, die window nutzen, müssten wir ein globales window-Objekt bereitstellen,
    // was in Tests (JSDOM) typischerweise ohnehin der Fall ist.
}
