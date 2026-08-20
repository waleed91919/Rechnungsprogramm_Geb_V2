const { test, describe } = require('node:test');
const assert = require('node:assert');
const BautagebuchController = require('../controllers/BautagebuchController');

describe('BautagebuchController', () => {
    describe('calculateTotalHours', () => {
        test('should default subList to empty array when personal_sub_json is invalid JSON string', () => {
            const data = {
                personal_eigen_stunden: 5,
                personal_sub_json: '{invalid: json}'
            };

            const result = BautagebuchController.calculateTotalHours(data);

            assert.strictEqual(result.eigenStunden, 5);
            assert.strictEqual(result.subStunden, 0);
            assert.strictEqual(result.gesamtStunden, 5);
        });

        test('should correctly parse valid personal_sub_json string and calculate hours', () => {
            const data = {
                personal_eigen_stunden: 4,
                personal_sub_json: '[{"anzahl": 2, "stunden": 8}, {"anzahl": 1, "stunden": 4}]'
            };

            const result = BautagebuchController.calculateTotalHours(data);

            assert.strictEqual(result.eigenStunden, 4);
            // 2*8 + 1*4 = 16 + 4 = 20
            assert.strictEqual(result.subStunden, 20);
            assert.strictEqual(result.gesamtStunden, 24);
        });

        test('should handle personal_sub_json already being an array', () => {
            const data = {
                personal_eigen_stunden: 2,
                personal_sub_json: [
                    { anzahl: 1, stunden: 5 }
                ]
            };

            const result = BautagebuchController.calculateTotalHours(data);

            assert.strictEqual(result.eigenStunden, 2);
            assert.strictEqual(result.subStunden, 5);
            assert.strictEqual(result.gesamtStunden, 7);
        });
    });
});
