const test = require('node:test');
const assert = require('node:assert');

// Mock global window to load the model properly in Node.js
global.window = {};
require('../models/InvoiceModel.js');

test('InvoiceModel Test Suite', async (t) => {
    // 1. Test Fallback/Null Handling (No DB provided)
    await t.test('Should handle missing db gracefully (return null)', async () => {
        const model = new window.InvoiceModel();
        
        assert.strictEqual(model.db, null, 'db should be null if not provided and window.api is undefined');
        
        const saveRes = await model.saveDocument({ id: 1 });
        assert.strictEqual(saveRes, null);
        
        const deleteRes = await model.deleteDocument(1);
        assert.strictEqual(deleteRes, null);
        
        const stornoRes = await model.storniereRechnung({}, {});
        assert.strictEqual(stornoRes, null);
        
        const markRes = await model.markAsPaid({});
        assert.strictEqual(markRes, null);
        
        const stateRes = await model.getFullState();
        assert.strictEqual(stateRes, null);
    });

    // 2. Test Window.api Fallback
    await t.test('Should fallback to window.api if dbInterface is not provided', async () => {
        // Setup window.api temporarily
        global.window.api = { mock: true };
        const model = new window.InvoiceModel();
        assert.deepStrictEqual(model.db, { mock: true }, 'Should use window.api as fallback');
        
        // Clean up
        global.window.api = undefined;
    });

    // 3. Test Functionality with Mocked DB
    await t.test('Should interact correctly with provided dbInterface', async (t) => {
        // Create a mock DB that keeps track of calls and returns predictable values
        const mockDb = {
            documents: {},
            saveDocument: async function(doc) {
                this.documents[doc.id] = doc;
                return { success: true, id: doc.id };
            },
            deleteDocument: async function(id) {
                if (this.documents[id]) {
                    delete this.documents[id];
                    return { success: true };
                }
                return { success: false };
            },
            getFullState: async function() {
                return { state: 'Mocked Full State' };
            }
        };

        const model = new window.InvoiceModel(mockDb);

        await t.test('saveDocument should pass data to db.saveDocument', async () => {
            const doc = { id: 'doc1', value: 100 };
            const result = await model.saveDocument(doc);
            assert.deepStrictEqual(result, { success: true, id: 'doc1' });
            assert.deepStrictEqual(mockDb.documents['doc1'], doc);
        });

        await t.test('deleteDocument should pass ID to db.deleteDocument', async () => {
            const result = await model.deleteDocument('doc1');
            assert.deepStrictEqual(result, { success: true });
            assert.strictEqual(mockDb.documents['doc1'], undefined);
        });

        await t.test('storniereRechnung should save both original and storno docs, then get full state', async () => {
            const original = { id: 'orig', status: 'Storniert' };
            const storno = { id: 'storno', type: 'Gutschrift' };
            const result = await model.storniereRechnung(original, storno);
            
            assert.deepStrictEqual(mockDb.documents['orig'], original);
            assert.deepStrictEqual(mockDb.documents['storno'], storno);
            assert.deepStrictEqual(result, { state: 'Mocked Full State' });
        });

        await t.test('markAsPaid should update status and save doc, then get full state', async () => {
            const doc = { id: 'unpaid_doc', status: 'Offen' };
            const result = await model.markAsPaid(doc);
            
            assert.strictEqual(doc.status, 'Bezahlt', 'Status should be mutated to Bezahlt');
            assert.deepStrictEqual(mockDb.documents['unpaid_doc'], { id: 'unpaid_doc', status: 'Bezahlt' });
            assert.deepStrictEqual(result, { state: 'Mocked Full State' });
        });

        await t.test('getFullState should call db.getFullState', async () => {
            const result = await model.getFullState();
            assert.deepStrictEqual(result, { state: 'Mocked Full State' });
        });
    });
});
