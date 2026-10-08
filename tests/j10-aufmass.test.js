const test = require('node:test');
const assert = require('node:assert');

const createAufmassRepo = require('../db/repositories/aufmass_repo');

test('J10: mergeSchlussaufmass blockt fehlende OZs, Kumulativ F1+F2=L2', async (t) => {
    // We mock the better-sqlite3 calls completely
    const mockDocs = [
        { id: 10, nummer: 'RE-1', status: 'Offen', datum: '2026-10-01', netto: 1300, brutto: 1547, bezahlt: 0 },
        { id: 11, nummer: 'RE-2', status: 'Offen', datum: '2026-10-02', netto: 1500, brutto: 1785, bezahlt: 0 }
    ];

    const mockAufmassRows = [
        { oz_code: '01.01.0010', summe_menge: 10, einheit: 'm2', bezeichnung: 'Wand', blaetter_nrs: 'B1', blaetter_ids: '1', primary_blatt_id: 1 },
        { oz_code: '01.01.001', summe_menge: 5, einheit: 'm2', bezeichnung: 'Wand 2', blaetter_nrs: 'B1', blaetter_ids: '1', primary_blatt_id: 1 } // typo
    ];

    const mockContractPositions = [
        { oz_code: '01.01.0010', name: 'Wand', einheitspreis: 1300, einheit: 'm2', mwst: 19, position_id: 100 }
    ];

    const deps = {
        db: {},
        dbQuery: async (query, params) => {
            if (query.includes('FROM dokumente d')) {
                return mockDocs;
            }
            if (query.includes('FROM aufmass_zeilen z')) {
                return mockAufmassRows;
            }
            if (query.includes('FROM positionen pos')) {
                return mockContractPositions;
            }
            return [];
        },
        dbRun: async (query, params) => {},
        appendAuditLog: () => {}
    };

    const repo = createAufmassRepo(deps);

    // Kumulativ Check (F1 + F2 = L2)
    const kumulativData = await repo.getKumulativeAbrechnung(1);

    assert.strictEqual(kumulativData.vorrechnungen.length, 2, '2 Vorrechnungen sollten gefunden werden');
    assert.strictEqual(kumulativData.totalNetto, 2800, 'Summe Netto (L2) sollte 2800 sein (1300 + 1500)');

    // Ausführung mergeSchlussaufmass
    const mergeResult = await repo.mergeSchlussaufmass(1);

    // Assert: Warnung zurückgegeben
    assert.ok(mergeResult.warnings, 'mergeResult sollte warnings Array enthalten');
    assert.strictEqual(mergeResult.warnings.length, 1, 'Sollte genau eine Warnung wegen Tippfehler enthalten');
    assert.strictEqual(mergeResult.warnings[0].oz_code, '01.01.001', 'Warnung sollte Tippfehler-OZ enthalten');
    assert.strictEqual(mergeResult.warnings[0].grund, 'UNBEKANNT', 'Warnungsgrund sollte UNBEKANNT sein');

    // Assert: Fehlerhafte Zeile hat Einheitspreis 0
    const errRow = mergeResult.rows.find(r => r.oz_code === '01.01.001');
    assert.strictEqual(errRow.einheitspreis, 0, 'Einheitspreis für Tippfehler-OZ sollte weiterhin 0 sein, dies ist dokumentiert.');
});
