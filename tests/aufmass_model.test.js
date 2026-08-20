const test = require('node:test');
const assert = require('node:assert');

// Setup global.window environment for the model
global.window = global.window || {};

// Load the model
require('../models/AufmassModel.js');

test('AufmassModel Initialization', async (t) => {
    await t.test('uses provided dbInterface', () => {
        const mockDb = { name: 'mockDb' };
        const model = new window.AufmassModel(mockDb);
        assert.strictEqual(model.db, mockDb);
    });

    await t.test('falls back to window.api if no dbInterface is provided', () => {
        global.window.api = { name: 'windowApi' };
        const model = new window.AufmassModel();
        assert.strictEqual(model.db, global.window.api);
        // Clean up
        global.window.api = undefined;
    });

    await t.test('db is null if neither dbInterface nor window.api are available', () => {
        global.window.api = undefined;
        const model = new window.AufmassModel();
        assert.strictEqual(model.db, null);
    });
});

test('AufmassModel - saveAufmass & deleteAufmass', async (t) => {
    await t.test('saveAufmass uses direct db method if available', async () => {
        const mockDb = {
            saveAufmass: async (data) => ({ success: true, savedData: data })
        };
        const model = new window.AufmassModel(mockDb);
        const result = await model.saveAufmass({ field: 'value' });
        assert.deepStrictEqual(result, { success: true, savedData: { field: 'value' } });
    });

    await t.test('saveAufmass returns null if direct method is missing', async () => {
        const mockDb = {}; // No saveAufmass method
        const model = new window.AufmassModel(mockDb);
        const result = await model.saveAufmass({ field: 'value' });
        assert.strictEqual(result, null);
    });

    await t.test('saveAufmass returns null if db is null', async () => {
        const model = new window.AufmassModel();
        model.db = null;
        const result = await model.saveAufmass({ field: 'value' });
        assert.strictEqual(result, null);
    });

    await t.test('deleteAufmass uses direct db method if available', async () => {
        const mockDb = {
            deleteAufmass: async (id) => ({ success: true, id })
        };
        const model = new window.AufmassModel(mockDb);
        const result = await model.deleteAufmass(123);
        assert.deepStrictEqual(result, { success: true, id: 123 });
    });

    await t.test('deleteAufmass returns null if direct method is missing', async () => {
        const mockDb = {}; // No deleteAufmass method
        const model = new window.AufmassModel(mockDb);
        const result = await model.deleteAufmass(123);
        assert.strictEqual(result, null);
    });

    await t.test('deleteAufmass returns null if db is null', async () => {
        const model = new window.AufmassModel();
        model.db = null;
        const result = await model.deleteAufmass(123);
        assert.strictEqual(result, null);
    });
});

test('AufmassModel - getAufmasseByProjektId', async (t) => {
    await t.test('uses direct db method if available', async () => {
        const mockDb = {
            getAufmasseByProjektId: async (id) => [{ id: 1, projekt_id: id }, { id: 2, projekt_id: id }]
        };
        const model = new window.AufmassModel(mockDb);
        const result = await model.getAufmasseByProjektId(101);
        assert.deepStrictEqual(result, [{ id: 1, projekt_id: 101 }, { id: 2, projekt_id: 101 }]);
    });

    await t.test('falls back to getFullState if direct method is missing', async () => {
        const mockDb = {
            getFullState: async () => ({
                aufmasse: [
                    { id: 1, projekt_id: 101 },
                    { id: 2, projekt_id: 202 },
                    { id: 3, projekt_id: 101 }
                ]
            })
        };
        const model = new window.AufmassModel(mockDb);
        const result = await model.getAufmasseByProjektId(101);
        assert.deepStrictEqual(result, [
            { id: 1, projekt_id: 101 },
            { id: 3, projekt_id: 101 }
        ]);
    });

    await t.test('returns empty array if state or aufmasse is missing in getFullState', async () => {
        const mockDb1 = { getFullState: async () => null };
        const model1 = new window.AufmassModel(mockDb1);
        assert.deepStrictEqual(await model1.getAufmasseByProjektId(101), []);

        const mockDb2 = { getFullState: async () => ({}) };
        const model2 = new window.AufmassModel(mockDb2);
        assert.deepStrictEqual(await model2.getAufmasseByProjektId(101), []);
    });

    await t.test('returns empty array if db is null', async () => {
        const model = new window.AufmassModel();
        model.db = null;
        const result = await model.getAufmasseByProjektId(101);
        assert.deepStrictEqual(result, []);
    });
});

test('AufmassModel - getAufmasseByRechnungId', async (t) => {
    await t.test('uses direct db method if available', async () => {
        const mockDb = {
            getAufmasseByRechnungId: async (id) => [{ id: 1, rechnung_id: id }, { id: 2, rechnung_id: id }]
        };
        const model = new window.AufmassModel(mockDb);
        const result = await model.getAufmasseByRechnungId(456);
        assert.deepStrictEqual(result, [{ id: 1, rechnung_id: 456 }, { id: 2, rechnung_id: 456 }]);
    });

    await t.test('falls back to getFullState if direct method is missing', async () => {
        const mockDb = {
            getFullState: async () => ({
                aufmasse: [
                    { id: 1, rechnung_id: 456 },
                    { id: 2, rechnung_id: 789 },
                    { id: 3, rechnung_id: 456 }
                ]
            })
        };
        const model = new window.AufmassModel(mockDb);
        const result = await model.getAufmasseByRechnungId(456);
        assert.deepStrictEqual(result, [
            { id: 1, rechnung_id: 456 },
            { id: 3, rechnung_id: 456 }
        ]);
    });

    await t.test('returns empty array if state or aufmasse is missing in getFullState', async () => {
        const mockDb1 = { getFullState: async () => null };
        const model1 = new window.AufmassModel(mockDb1);
        assert.deepStrictEqual(await model1.getAufmasseByRechnungId(456), []);

        const mockDb2 = { getFullState: async () => ({}) };
        const model2 = new window.AufmassModel(mockDb2);
        assert.deepStrictEqual(await model2.getAufmasseByRechnungId(456), []);
    });

    await t.test('returns empty array if db is null', async () => {
        const model = new window.AufmassModel();
        model.db = null;
        const result = await model.getAufmasseByRechnungId(456);
        assert.deepStrictEqual(result, []);
    });
});

test('AufmassModel - getAufmassById', async (t) => {
    await t.test('uses direct db method if available', async () => {
        const mockDb = {
            getAufmassById: async (id) => ({ id, name: 'Direct' })
        };
        const model = new window.AufmassModel(mockDb);
        const result = await model.getAufmassById(1);
        assert.deepStrictEqual(result, { id: 1, name: 'Direct' });
    });

    await t.test('falls back to getFullState if direct method is missing', async () => {
        const mockDb = {
            getFullState: async () => ({
                aufmasse: [
                    { id: 1, name: 'Item 1' },
                    { id: 2, name: 'Item 2' }
                ]
            })
        };
        const model = new window.AufmassModel(mockDb);
        const result = await model.getAufmassById(2);
        assert.deepStrictEqual(result, { id: 2, name: 'Item 2' });
    });
    
    await t.test('returns undefined if item not found via getFullState', async () => {
        const mockDb = {
            getFullState: async () => ({
                aufmasse: [{ id: 1 }]
            })
        };
        const model = new window.AufmassModel(mockDb);
        const result = await model.getAufmassById(999);
        assert.strictEqual(result, undefined);
    });

    await t.test('returns null if state or aufmasse is missing in getFullState', async () => {
        const mockDb = { getFullState: async () => ({}) };
        const model = new window.AufmassModel(mockDb);
        const result = await model.getAufmassById(1);
        assert.strictEqual(result, null);
    });

    await t.test('returns null if db is null', async () => {
        const model = new window.AufmassModel();
        model.db = null;
        const result = await model.getAufmassById(1);
        assert.strictEqual(result, null);
    });
});

test('AufmassModel - saveAufmassForPosition', async (t) => {
    await t.test('uses direct db method if available', async () => {
        const mockDb = {
            saveAufmassForPosition: async (posId, data) => ({ success: true, posId, data })
        };
        const model = new window.AufmassModel(mockDb);
        const result = await model.saveAufmassForPosition(123, { field: 'value' });
        assert.deepStrictEqual(result, { success: true, posId: 123, data: { field: 'value' } });
    });

    await t.test('falls back to saveAufmass if direct method is missing', async () => {
        const mockDb = {
            saveAufmass: async (data) => ({ success: true, savedData: data })
        };
        const model = new window.AufmassModel(mockDb);
        const result = await model.saveAufmassForPosition(123, { field: 'value' });
        assert.deepStrictEqual(result, { success: true, savedData: { field: 'value', position_id: 123 } });
    });

    await t.test('returns null if db is null', async () => {
        const model = new window.AufmassModel();
        model.db = null;
        const result = await model.saveAufmassForPosition(123, { field: 'value' });
        assert.strictEqual(result, null);
    });
});

test('AufmassModel - getAufmassByPositionId', async (t) => {
    await t.test('uses direct db method if available', async () => {
        const mockDb = {
            getAufmassByPositionId: async (id) => ({ id: 1, position_id: id, name: 'Direct' })
        };
        const model = new window.AufmassModel(mockDb);
        const result = await model.getAufmassByPositionId(123);
        assert.deepStrictEqual(result, { id: 1, position_id: 123, name: 'Direct' });
    });

    await t.test('falls back to getFullState if direct method is missing', async () => {
        const mockDb = {
            getFullState: async () => ({
                aufmasse: [
                    { id: 1, position_id: 100 },
                    { id: 2, position_id: 123, name: 'Fallback' }
                ]
            })
        };
        const model = new window.AufmassModel(mockDb);
        const result = await model.getAufmassByPositionId(123);
        assert.deepStrictEqual(result, { id: 2, position_id: 123, name: 'Fallback' });
    });

    await t.test('returns undefined if item not found via getFullState', async () => {
        const mockDb = {
            getFullState: async () => ({
                aufmasse: [
                    { id: 1, position_id: 100 }
                ]
            })
        };
        const model = new window.AufmassModel(mockDb);
        const result = await model.getAufmassByPositionId(999);
        // Array.prototype.find returns undefined if not found
        assert.strictEqual(result, undefined);
    });

    await t.test('returns null if state or aufmasse is missing in getFullState', async () => {
        const mockDb1 = { getFullState: async () => null };
        const model1 = new window.AufmassModel(mockDb1);
        assert.strictEqual(await model1.getAufmassByPositionId(123), null);

        const mockDb2 = { getFullState: async () => ({}) };
        const model2 = new window.AufmassModel(mockDb2);
        assert.strictEqual(await model2.getAufmassByPositionId(123), null);
    });

    await t.test('returns null if db is null', async () => {
        const model = new window.AufmassModel();
        model.db = null; // explicit
        const result = await model.getAufmassByPositionId(123);
        assert.strictEqual(result, null);
    });
});
