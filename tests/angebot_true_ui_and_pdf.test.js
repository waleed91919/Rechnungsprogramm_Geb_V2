const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const electronBinary = require('electron');

test('Echter Electron UI- und PDF-Workflow-Test (Chromium DOM, Button-Clicks, echte PDF-Bytes)', (t) => {
    const runnerPath = path.join(__dirname, 'test_electron_runner.js');
    const result = spawnSync(electronBinary, [runnerPath], {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 45000
    });

    if (result.status !== 0) {
        console.error('Electron test runner failed:');
        console.error('STDOUT:', result.stdout);
        console.error('STDERR:', result.stderr);
    }

    assert.strictEqual(result.status, 0, `Electron runner exited with code ${result.status}`);
    assert.ok(
        result.stdout.includes('ANGEBOT_TRUE_UI_AND_PDF_TESTS_PASSED'),
        'Test output must contain confirmation token ANGEBOT_TRUE_UI_AND_PDF_TESTS_PASSED'
    );
    assert.ok(
        result.stdout.includes('Testfall 1 erfolgreich bestanden'),
        'Testfall 1 (Leerpreis vs 0,00 €) must pass'
    );
    assert.ok(
        result.stdout.includes('Testfall 2 erfolgreich bestanden'),
        'Testfall 2 (PDF Vorschau & Bytes) must pass'
    );
    assert.ok(
        result.stdout.includes('Testfall 3 erfolgreich bestanden'),
        'Testfall 3 (Versand registrieren & UI-Feedback) must pass'
    );
    assert.ok(
        result.stdout.includes('Testfall 4 erfolgreich bestanden'),
        'Testfall 4 (Post-Versand UI-Aktionen) must pass'
    );
    assert.ok(
        result.stdout.includes('Testfall 4b (§ 13b Abwahl & Feldleerung) erfolgreich bestanden'),
        'Testfall 4b (§ 13b Abwahl & Feldleerung) must pass'
    );
    assert.ok(
        result.stdout.includes('Testfall 4c (GAEB Ausschreibung & Bepreisung UI) erfolgreich bestanden'),
        'Testfall 4c (GAEB Ausschreibung & Bepreisung UI) must pass'
    );
    assert.ok(
        result.stdout.includes('Testfall 5 erfolgreich bestanden'),
        'Testfall 5 (DB-Reload & Integrität) must pass'
    );
});
