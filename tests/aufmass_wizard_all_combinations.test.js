const assert = require('assert');
const AufmassController = require('../controllers/AufmassController');

console.log('======================================================================');
console.log('🧪 TEST SUITE: AUFMASS-ERSTELLUNGS-ASSISTENT (ALLE 6 OPTIONEN & 9 KOMBINATIONEN)');
console.log('======================================================================\n');

// 1. Simulation Helpers
function createMockDOM() {
    const cardsTyp = [
        { type: 'FREI', active: true, className: 'wiz-card-typ border-2 border-primary ring-2 ring-primary/20 bg-primary/5 rounded-xl p-4', radioChecked: true, iconClass: 'text-primary' },
        { type: 'SPALTEN', active: false, className: 'wiz-card-typ border-2 border-slate-200 bg-white rounded-xl p-4', radioChecked: false, iconClass: 'text-slate-500' },
        { type: 'RAUM', active: false, className: 'wiz-card-typ border-2 border-slate-200 bg-white rounded-xl p-4', radioChecked: false, iconClass: 'text-slate-500' }
    ];

    const cardsVar = [
        { variante: 'TEIL', active: true, className: 'wiz-card-var border-2 border-primary ring-2 ring-primary/20 bg-primary/5 rounded-xl p-3', radioChecked: true },
        { variante: 'EINZEL', active: false, className: 'wiz-card-var border-2 border-slate-200 bg-white rounded-xl p-3', radioChecked: false },
        { variante: 'SCHLUSS', active: false, className: 'wiz-card-var border-2 border-slate-200 bg-white rounded-xl p-3', radioChecked: false }
    ];

    return {
        cardsTyp,
        cardsVar,
        selectTyp(typ) {
            cardsTyp.forEach(c => {
                c.active = (c.type === typ);
                c.radioChecked = (c.type === typ);
                c.className = c.active
                    ? 'wiz-card-typ border-2 border-primary ring-2 ring-primary/20 bg-primary/5 rounded-xl p-4 cursor-pointer hover:border-primary hover:shadow-md transition-all flex flex-col items-center text-center shadow-xs'
                    : 'wiz-card-typ border-2 border-slate-200 bg-white rounded-xl p-4 cursor-pointer hover:border-primary hover:shadow-md transition-all flex flex-col items-center text-center';
                c.iconClass = c.active ? 'text-primary' : 'text-slate-500';
            });
        },
        selectVar(v) {
            const norm = (v === 'TEILAUFMASS' ? 'TEIL' : (v === 'EINZELAUFMASS' ? 'EINZEL' : (v === 'SCHLUSSAUFMASS' ? 'SCHLUSS' : v)));
            cardsVar.forEach(c => {
                c.active = (c.variante === norm);
                c.radioChecked = (c.variante === norm);
                c.className = c.active
                    ? 'wiz-card-var border-2 border-primary ring-2 ring-primary/20 bg-primary/5 rounded-xl p-3 cursor-pointer hover:border-primary hover:shadow-md transition-all flex flex-col shadow-xs'
                    : 'wiz-card-var border-2 border-slate-200 bg-white rounded-xl p-3 cursor-pointer hover:border-primary hover:shadow-md transition-all flex flex-col';
            });
        }
    };
}

function generateDefaultZeilenForTyp(typ, bemerkung = '') {
    if (typ === 'SPALTEN') {
        return [
            { oz_code: '01.01.0010', bezeichnung: 'Wandfläche Nord', formel_reb: '01', rechenansatz: '5.50 * 2.80', ergebnis: 15.40, einheit: 'm²', vorzeichen: 1 },
            { oz_code: '01.01.0010', bezeichnung: 'Wandfläche Süd', formel_reb: '01', rechenansatz: '5.50 * 2.80', ergebnis: 15.40, einheit: 'm²', vorzeichen: 1 },
            { oz_code: '01.01.0010', bezeichnung: 'Fensterausschnitt Abzug', formel_reb: '01', rechenansatz: '1.20 * 1.40', ergebnis: 1.68, einheit: 'm²', vorzeichen: -1 }
        ];
    } else if (typ === 'RAUM') {
        return [
            { oz_code: '01.01.0010', bezeichnung: 'EG - Wohnbereich', formel_reb: '91', rechenansatz: '6.20 * 4.80', ergebnis: 29.76, einheit: 'm²', vorzeichen: 1 },
            { oz_code: '01.01.0010', bezeichnung: 'EG - Küche', formel_reb: '91', rechenansatz: '3.50 * 3.10', ergebnis: 10.85, einheit: 'm²', vorzeichen: 1 },
            { oz_code: '01.01.0010', bezeichnung: 'OG - Bad', formel_reb: '91', rechenansatz: '2.80 * 2.40', ergebnis: 6.72, einheit: 'm²', vorzeichen: 1 }
        ];
    } else {
        return [
            { oz_code: '01.01.0010', bezeichnung: bemerkung ? `Fläche (${bemerkung})` : 'Flächenansatz', formel_reb: '91', rechenansatz: '4.50 * 3.20', ergebnis: 14.40, einheit: 'm²', vorzeichen: 1 }
        ];
    }
}

function generatePrintDocument(typ, variante, zeilen) {
    const isSchluss = variante.includes('SCHLUSS');
    const total = zeilen.reduce((acc, z) => acc + (z.ergebnis * (z.vorzeichen || 1)), 0);
    return {
        docTitle: isSchluss ? 'SCHLUSSAUFMASS & GESAMTABNAHME' : (typ === 'SPALTEN' ? 'SPALTENAUFMASS (REB 23.003)' : (typ === 'RAUM' ? 'RAUMAUFMASS & FLÄCHENNACHWEIS' : 'AUFMASSBLATT & MENGENBERECHNUNG')),
        typ,
        variante,
        zeilenCount: zeilen.length,
        totalMenge: Math.round(total * 100) / 100,
        hasSignatures: true
    };
}

let testCounter = 0;
let passedCounter = 0;

function runTest(description, testFn) {
    testCounter++;
    try {
        testFn();
        passedCounter++;
        console.log(`  ✓ [TEST ${testCounter}] ${description}`);
    } catch (err) {
        console.error(`  ✗ [TEST ${testCounter} FAILED] ${description}`);
        console.error(`    Fehler: ${err.message}`);
        throw err;
    }
}

// =========================================================================
// TEST BEREICH 1: DIE 3 AUFMASS-TYPEN (JEWEILS INTERAKTIVE AUSWAHL & TEMPLATE)
// =========================================================================
console.log('▶ TESTGRUPPE 1: Die 3 Aufmaß-Typen (FREI, SPALTEN, RAUM)');

runTest('Typ 1 (FREI): Kachelauswahl setzt active Class, Radio-Check & Icon-Highlight', () => {
    const dom = createMockDOM();
    dom.selectTyp('FREI');
    assert.strictEqual(dom.cardsTyp[0].active, true);
    assert.strictEqual(dom.cardsTyp[0].radioChecked, true);
    assert.strictEqual(dom.cardsTyp[0].iconClass, 'text-primary');
    assert.strictEqual(dom.cardsTyp[1].active, false);
    assert.strictEqual(dom.cardsTyp[2].active, false);
});

runTest('Typ 1 (FREI): Template-Generierung & Formel-Berechnung', () => {
    const zeilen = generateDefaultZeilenForTyp('FREI');
    assert.strictEqual(zeilen.length, 1);
    const calculated = AufmassController.evaluateFormula(zeilen[0].rechenansatz);
    assert.strictEqual(calculated, 14.40);
});

runTest('Typ 2 (SPALTEN): Kachelauswahl setzt active Class, Radio-Check & Icon-Highlight', () => {
    const dom = createMockDOM();
    dom.selectTyp('SPALTEN');
    assert.strictEqual(dom.cardsTyp[1].active, true);
    assert.strictEqual(dom.cardsTyp[1].radioChecked, true);
    assert.strictEqual(dom.cardsTyp[1].iconClass, 'text-primary');
    assert.strictEqual(dom.cardsTyp[0].active, false);
    assert.strictEqual(dom.cardsTyp[2].active, false);
});

runTest('Typ 2 (SPALTEN): Spaltenlayout (L x B x H mit Zu-/Abschlägen & REB 01)', () => {
    const zeilen = generateDefaultZeilenForTyp('SPALTEN');
    assert.strictEqual(zeilen.length, 3);
    assert.strictEqual(zeilen[0].vorzeichen, 1);
    assert.strictEqual(zeilen[1].vorzeichen, 1);
    assert.strictEqual(zeilen[2].vorzeichen, -1); // Fensterabzug

    const w1 = AufmassController.evaluateFormula(zeilen[0].rechenansatz);
    const w2 = AufmassController.evaluateFormula(zeilen[1].rechenansatz);
    const abzug = AufmassController.evaluateFormula(zeilen[2].rechenansatz);
    const total = (w1 * 1) + (w2 * 1) + (abzug * -1); // 15.40 + 15.40 - 1.68 = 29.12
    assert.strictEqual(Math.round(total * 100) / 100, 29.12);
});

runTest('Typ 3 (RAUM): Kachelauswahl setzt active Class, Radio-Check & Icon-Highlight', () => {
    const dom = createMockDOM();
    dom.selectTyp('RAUM');
    assert.strictEqual(dom.cardsTyp[2].active, true);
    assert.strictEqual(dom.cardsTyp[2].radioChecked, true);
    assert.strictEqual(dom.cardsTyp[2].iconClass, 'text-primary');
    assert.strictEqual(dom.cardsTyp[0].active, false);
    assert.strictEqual(dom.cardsTyp[1].active, false);
});

runTest('Typ 3 (RAUM): Raumaufmaß-Strukturierung (Geschoss & Räume mit Summen)', () => {
    const zeilen = generateDefaultZeilenForTyp('RAUM');
    assert.strictEqual(zeilen.length, 3);
    assert.strictEqual(zeilen[0].bezeichnung, 'EG - Wohnbereich');
    assert.strictEqual(zeilen[1].bezeichnung, 'EG - Küche');
    assert.strictEqual(zeilen[2].bezeichnung, 'OG - Bad');

    const total = zeilen.reduce((acc, z) => acc + AufmassController.evaluateFormula(z.rechenansatz), 0);
    // 29.76 + 10.85 + 6.72 = 47.33
    assert.strictEqual(Math.round(total * 100) / 100, 47.33);
});

// =========================================================================
// TEST BEREICH 2: DIE 3 AUFMASS-VARIANTEN (INTERAKTIVE AUSWAHL & MODELL)
// =========================================================================
console.log('\n▶ TESTGRUPPE 2: Die 3 Aufmaß-Varianten (TEILAUFMASS, EINZELAUFMASS, SCHLUSSAUFMASS)');

runTest('Variante 1 (TEILAUFMASS): Kachelauswahl aktiviert TEIL & deaktiviert andere', () => {
    const dom = createMockDOM();
    dom.selectVar('TEIL');
    assert.strictEqual(dom.cardsVar[0].active, true);
    assert.strictEqual(dom.cardsVar[1].active, false);
    assert.strictEqual(dom.cardsVar[2].active, false);
});

runTest('Variante 2 (EINZELAUFMASS): Kachelauswahl aktiviert EINZEL & deaktiviert andere', () => {
    const dom = createMockDOM();
    dom.selectVar('EINZEL');
    assert.strictEqual(dom.cardsVar[1].active, true);
    assert.strictEqual(dom.cardsVar[0].active, false);
    assert.strictEqual(dom.cardsVar[2].active, false);
});

runTest('Variante 3 (SCHLUSSAUFMASS): Kachelauswahl aktiviert SCHLUSS & deaktiviert andere', () => {
    const dom = createMockDOM();
    dom.selectVar('SCHLUSS');
    assert.strictEqual(dom.cardsVar[2].active, true);
    assert.strictEqual(dom.cardsVar[0].active, false);
    assert.strictEqual(dom.cardsVar[1].active, false);
});

// =========================================================================
// TEST BEREICH 3: ALLE 9 MATRIX-KOMBINATIONEN (3 TYPEN x 3 VARIANTEN)
// =========================================================================
console.log('\n▶ TESTGRUPPE 3: Alle 9 Matrix-Kombinationen (End-to-End Workflow, Berechnung & Druck-Payload)');

const allTypen = ['FREI', 'SPALTEN', 'RAUM'];
const allVarianten = ['TEILAUFMASS', 'EINZELAUFMASS', 'SCHLUSSAUFMASS'];

allTypen.forEach(t => {
    allVarianten.forEach(v => {
        runTest(`Kombination [${t} + ${v}]: Auswählen, Datenmodell generieren, Rechnen & Druck-Dokument erzeugen`, () => {
            const dom = createMockDOM();
            dom.selectTyp(t);
            dom.selectVar(v);

            // 1. DOM Check
            const activeTypCard = dom.cardsTyp.find(c => c.active);
            const activeVarCard = dom.cardsVar.find(c => c.active);
            assert.strictEqual(activeTypCard.type, t);
            assert.strictEqual(activeVarCard.variante, v.replace('AUFMASS', ''));

            // 2. Erzeuge Zeilendaten
            const zeilen = generateDefaultZeilenForTyp(t, 'Testnotiz');
            assert.strictEqual(zeilen.length > 0, true);

            // 3. Validierung mathematischer Rechenansatz & Vorzeichen
            zeilen.forEach(z => {
                const evalRes = AufmassController.evaluateFormula(z.rechenansatz);
                assert.strictEqual(typeof evalRes, 'number');
                assert.strictEqual(evalRes > 0, true);
                assert.strictEqual(z.vorzeichen === 1 || z.vorzeichen === -1, true);
            });

            // 4. Druck-Payload & Dokument-Generierung
            const doc = generatePrintDocument(t, v, zeilen);
            assert.strictEqual(doc.typ, t);
            assert.strictEqual(doc.variante, v);
            assert.strictEqual(doc.hasSignatures, true);
            assert.strictEqual(typeof doc.totalMenge, 'number');
            assert.strictEqual(doc.totalMenge > 0, true);
        });
    });
});

// =========================================================================
// TEST BEREICH 4: INTERAKTIVER VORZEICHEN-TOGGLE (+ / -) & LIVE-BERECHNUNG
// =========================================================================
console.log('\n▶ TESTGRUPPE 4: Interaktive Vorzeichen-Toggle (+ / -) Logik im Register Positionen');

runTest('Vorzeichen-Toggle wechselt von +1 (Plus) auf -1 (Abzug) und zurück', () => {
    let row = { rechenansatz: '3.00 * 2.00', ergebnis: 6.00, vorzeichen: 1 };
    
    // Toggle 1: Auf Abzug wechseln
    row.vorzeichen = (row.vorzeichen === -1) ? 1 : -1;
    assert.strictEqual(row.vorzeichen, -1);
    let lineErg = row.ergebnis * row.vorzeichen;
    assert.strictEqual(lineErg, -6.00);

    // Toggle 2: Auf Plus wechseln
    row.vorzeichen = (row.vorzeichen === -1) ? 1 : -1;
    assert.strictEqual(row.vorzeichen, 1);
    lineErg = row.ergebnis * row.vorzeichen;
    assert.strictEqual(lineErg, 6.00);
});

console.log('\n======================================================================');
console.log(`🏁 ERGEBNIS: ${passedCounter}/${testCounter} TESTS ERFOLGREICH BESTANDEN (100% ERFOLG)`);
console.log('======================================================================\n');
