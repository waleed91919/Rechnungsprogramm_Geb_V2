const test = require('node:test');
const assert = require('node:assert');
const { execSync } = require('node:child_process');
const path = require('path');

function runDemoProof(scriptPath) {
    try {
        return execSync(`node "${scriptPath}"`, { encoding: 'utf-8' });
    } catch (e) {
        const out = String(e.stdout || '') + String(e.stderr || '') + String(e.message || '');
        if (out.includes('ERR_DLOPEN_FAILED')) {
            // System-Node kann better-sqlite3 (Electron-ABI) nicht laden -> Electron-Runtime
            const electron = require('electron');
            return execSync(`"${electron}" "${scriptPath}"`, {
                encoding: 'utf-8',
                env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
            });
        }
        throw e;
    }
}

test('J6: Demo-Proof TEST-BAU-01 Execution', async (t) => {
    try {
        const scriptPath = path.join(__dirname, '../scripts/demo-proof-test-bau-01.js');
        const output = runDemoProof(scriptPath);

        // Assert output contains expected pass messages
        assert.ok(output.includes('[PASS] L1 (Abschlag 1) erstellt'), 'Output should contain L1 creation');
        assert.ok(output.includes('[PASS] L2 (Abschlag 2) erstellt'), 'Output should contain L2 creation');
        assert.ok(output.includes('[PASS] Schlussrechnung erstellt (ID: 6, Netto 0)'), 'Output should contain Schlussrechnung Netto 0');
        assert.ok(output.includes('[PASS] Negativ-Probe (2. Schlussrechnung) erfolgreich abgewiesen'), 'Output should contain Negative-Proof success');
        assert.ok(output.includes('Offen: 47, Status: Teilweise bezahlt'), 'Output should contain correct open amount of 47');
        assert.ok(output.includes('[PASS] DATEV Export erfolgreich'), 'Output should contain DATEV Export success');

    } catch (e) {
        assert.fail(`Test script failed with exit code ${e.status}. Output: ${e.stdout}\nError: ${e.stderr}`);
    }
});
