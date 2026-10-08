const test = require('node:test');
const assert = require('node:assert');

// Test requirement: J2-Bezahlt-Link Restprüfung.
global.window = {};
require('../models/InvoiceModel.js');

test('J2-Bezahlt-Link Restprüfung', async (t) => {
    const mockDb = {
        saveDocument: async () => ({ success: true }),
        getFullState: async () => ({ mockState: true })
    };
    const model = new window.InvoiceModel(mockDb);
    
    await t.test('markAsPaid blocks invoice with open amount (Rest-47-Fall)', async () => {
        const doc = {
            id: 1,
            nr: 'RE-2026-001',
            brutto: 1785.00,
            bezahlt_betrag: 1500.00,
            offener_betrag: 47.00,
            status: 'Teilweise bezahlt'
        };

        try {
            await model.markAsPaid(doc);
            assert.fail('Should have thrown an error for open amount > 0');
        } catch (error) {
            assert.strictEqual(error.message.includes('Restbetrag-Prüfung fehlgeschlagen'), true, 'Error message should indicate rest amount check failure');
        }

        // Status und offener Betrag sollen unverändert bleiben
        assert.strictEqual(doc.status, 'Teilweise bezahlt');
        assert.strictEqual(doc.offener_betrag, 47.00);
    });

    await t.test('markAsPaid allows invoice with fully paid amount', async () => {
        // Mock DB um saveDocument abzufangen
        const mockDb = {
            saveDocument: async () => ({ success: true }),
            getFullState: async () => ({ mockState: true })
        };
        const modelWithDb = new window.InvoiceModel(mockDb);

        const doc = {
            id: 2,
            nr: 'RE-2026-002',
            brutto: 1785.00,
            bezahlt_betrag: 1785.00,
            offener_betrag: 0.00,
            status: 'Offen'
        };

        const result = await modelWithDb.markAsPaid(doc);
        
        // Sollte durchgehen und status auf Bezahlt setzen
        assert.strictEqual(doc.status, 'Bezahlt');
        assert.deepStrictEqual(result, { mockState: true });
    });
});
