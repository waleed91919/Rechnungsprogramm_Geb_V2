const test = require('node:test');
const assert = require('node:assert');

// Load Data
const { MUSTERBRIEFE_DATA } = require('../js/musterbriefe/musterbriefe-data.js');
const { fillPlaceholders } = require('../js/musterbriefe/musterbriefe-ui.js');

test('J12 - Musterbriefe Data Integrity', async (t) => {
    await t.test('Should have exactly 18 template entries', () => {
        assert.strictEqual(MUSTERBRIEFE_DATA.length, 18, 'There must be exactly 18 Musterbriefe');
    });

    await t.test('Each template should have required properties', () => {
        MUSTERBRIEFE_DATA.forEach(mb => {
            assert.ok(mb.id, `Template missing id: ${JSON.stringify(mb)}`);
            assert.ok(mb.titel, `Template ${mb.id} missing titel`);
            assert.ok(mb.paragraph, `Template ${mb.id} missing paragraph`);
            assert.ok(mb.fristhinweis, `Template ${mb.id} missing fristhinweis`);
            assert.ok(mb.url, `Template ${mb.id} missing url`);
            assert.ok(mb.vorlage_text, `Template ${mb.id} missing vorlage_text`);

            // Validate URL format
            assert.ok(mb.url.startsWith('http://') || mb.url.startsWith('https://'), `URL for template ${mb.id} is invalid: ${mb.url}`);

            // Validate that URLs either point to specific brief or overview
            assert.ok(mb.url.includes('bauprofessor.de'), `URL for template ${mb.id} does not point to bauprofessor.de`);
        });
    });

    await t.test('Templates should contain required placeholders', () => {
        // At least one template should contain these placeholders
        const allText = MUSTERBRIEFE_DATA.map(mb => mb.vorlage_text).join(' ');
        assert.ok(allText.includes('{kunde}'), 'Missing {kunde} placeholder in texts');
        assert.ok(allText.includes('{projekt}'), 'Missing {projekt} placeholder in texts');
        assert.ok(allText.includes('{datum}'), 'Missing {datum} placeholder in texts');
        assert.ok(allText.includes('{frist}'), 'Missing {frist} placeholder in texts');
        assert.ok(allText.includes('{betrag}'), 'Missing {betrag} placeholder in texts');
    });
});

test('J12 - Musterbriefe UI Logic (fillPlaceholders)', async (t) => {
    await t.test('Should replace {datum} with current date', () => {
        const text = 'Heute ist {datum}.';
        const result = fillPlaceholders(text);
        const heute = new Date().toLocaleDateString('de-DE');
        assert.ok(result.includes(heute), 'Datum was not replaced correctly');
        assert.ok(!result.includes('{datum}'), 'Placeholder {datum} remained in text');
    });

    await t.test('Should fallback to defaults if state is missing', () => {
        // Backup state if exists
        const oldWindow = global.window;
        global.window = undefined;

        const text = 'An {kunde} für {projekt} bis {frist} Betrag: {betrag}.';
        const result = fillPlaceholders(text);

        assert.ok(result.includes('[Kundenname einfügen]'), 'Kunde fallback failed');
        assert.ok(result.includes('[Projektname einfügen]'), 'Projekt fallback failed');
        assert.ok(result.includes('[Frist einfügen]'), 'Frist fallback failed');
        assert.ok(result.includes('[Betrag einfügen]'), 'Betrag fallback failed');

        // Restore state
        global.window = oldWindow;
    });

    await t.test('Should use TEST-BAU-01 customer data if present in state', () => {
        // Mock state
        global.window = {
            state: {
                kunden: [
                    { id: 1, firma: 'TEST-BAU-01 GmbH', vorname: 'Max', nachname: 'Mustermann' },
                    { id: 2, vorname: 'Anna', nachname: 'Müller' }
                ],
                projekte: [
                    { id: 10, titel: 'Neubau Bürogebäude' },
                    { id: 20, name: 'Sanierung Altbau' }
                ]
            }
        };

        const text = 'An {kunde} für {projekt}.';

        // Test with TEST-BAU-01
        let result = fillPlaceholders(text, 1, 10);
        assert.ok(result.includes('TEST-BAU-01 GmbH'), 'Failed to insert TEST-BAU-01 firma');
        assert.ok(result.includes('Neubau Bürogebäude'), 'Failed to insert projekt titel');

        // Test with individual
        result = fillPlaceholders(text, 2, 20);
        assert.ok(result.includes('Anna Müller'), 'Failed to insert vorname nachname');
        assert.ok(result.includes('Sanierung Altbau'), 'Failed to insert projekt name');
    });
});