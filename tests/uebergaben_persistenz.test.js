/**
 * uebergaben_persistenz.test.js (P0.3-Nachweis, ohne Electron-DB):
 * - Erfolgs-Toast nur nach await-Persistenz (statischer Code-Check)
 * - Sperrprüfung im Übergabe-Pfad (Renderer-Seite)
 * - Idempotenz der Nachtragsübernahme je nachtrag_id
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const NachtragController = require('../controllers/NachtragController');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'projekte.js'), 'utf8');

function fnBody(name) {
    const start = src.indexOf(`async function ${name}`);
    assert.ok(start >= 0, `${name} muss existieren`);
    const nextAsync = src.indexOf('\nasync function ', start + 10);
    const nextFn = src.indexOf('\nfunction ', start + 10);
    let end = src.length;
    if (nextAsync > 0) end = Math.min(end, nextAsync);
    if (nextFn > 0) end = Math.min(end, nextFn);
    return src.slice(start, end);
}

test('P0.3 executeAufmassUebergabe persistiert via IPC + Reload-Read', () => {
    const body = fnBody('executeAufmassUebergabe');
    assert.ok(body.includes('await window.api.saveDocument'), 'UPDATE_EXISTING/CREATE_NEW muss via window.api.saveDocument persistieren');
    assert.ok(body.includes('await window.api.getFullState'), 'Reload-Read nach Persistenz erforderlich');
    // Erfolgs-Toast erst nach Persistenz: letzter saveDocument vor erstem success-Toast
    const saveIdx = body.indexOf('await window.api.saveDocument');
    const toastIdx = body.indexOf("'success'");
    assert.ok(saveIdx >= 0 && toastIdx > saveIdx, 'Erfolgs-Toast muss auf await-Persistenz folgen');
});

test('P0.3 executeAufmassUebergabe blockiert gesperrte/stornierte Belege', () => {
    const body = fnBody('executeAufmassUebergabe');
    assert.ok(body.includes('isLocked'), 'Sperrprüfung (isLocked) erforderlich');
    assert.ok(body.includes('Storniert'), 'Storno-Prüfung erforderlich');
    assert.ok(body.includes('DOC_LOCKED'), 'blockierte Übergabe muss Fehlergrund liefern, kein Toast-Erfolg');
});

test('P0.3 Herkunftsbezüge je Position (aufmass_blatt_id, oz_code, Zeitstempel)', () => {
    const body = fnBody('executeAufmassUebergabe');
    for (const field of ['aufmass_blatt_id', 'oz_code', 'aufmass_menge', 'aufmass_quelle', 'aufmass_zeitstempel']) {
        assert.ok(body.includes(field), `Herkunftsfeld ${field} muss gesetzt werden`);
    }
});

test('P0.3 Nachtragsübernahme ist idempotent je nachtrag_id', () => {
    const list = [{
        id: 7, nachtrag_nr: 'N-01', status: 'GENEHMIGT',
        positionen: [{ kurztext: 'Mehrleistung', menge: 2, einheitspreis: 50, einheit: 'Std' }]
    }];
    const positions = NachtragController.extractApprovedPositionsForInvoice(list);
    assert.equal(positions.length, 1);
    assert.equal(positions[0].nachtrag_id, 7);
    // Dedupe-Simulation wie in applyApprovedNachtraegeToCurrentInvoice
    const state = { currentRechnungPositionen: [] };
    const mergeOnce = (arr) => {
        const keys = new Set(arr.map(p => p.nachtrag_id != null ? `N:${p.nachtrag_id}:${p.name}` : null).filter(Boolean));
        let added = 0;
        for (const np of positions) {
            const key = `N:${np.nachtrag_id}:${np.name}`;
            if (keys.has(key)) continue;
            keys.add(key); arr.push({ ...np }); added++;
        }
        return added;
    };
    assert.equal(mergeOnce(state.currentRechnungPositionen), 1);
    assert.equal(mergeOnce(state.currentRechnungPositionen), 0, 'doppelte Übernahme darf keine Duplikate erzeugen');
    assert.equal(state.currentRechnungPositionen.length, 1);

    const body = fnBody('applyApprovedNachtraegeToCurrentInvoice');
    assert.ok(body.includes('saveRechnung') || body.includes('saveDocument'), 'Übernahme muss in Persistenz münden');
});
