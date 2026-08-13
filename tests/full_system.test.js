const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

test('Full System Modules 1-8 Full-Stack Integration Test', () => {
    const scriptPath = path.join(__dirname, '../scripts/run_full_system_test.js');
    const output = execSync(`node "${scriptPath}"`, { encoding: 'utf-8' });

    assert.ok(output.includes('SYSTEM TEST COMPLETE'), 'Output should confirm SYSTEM TEST COMPLETE');
    assert.ok(!output.includes('Failed: 1') && !output.includes('Failed: 2'), 'No system test cases should fail');

    const reportPath = path.join(__dirname, '../tests/test_results/full_system_test_report.json');
    assert.ok(fs.existsSync(reportPath), 'Full system test report JSON must exist');

    const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    assert.ok(report.passCount >= 10, 'At least 10 module checks must pass');
    assert.strictEqual(report.failCount, 0, 'Fail count must be 0');
});
