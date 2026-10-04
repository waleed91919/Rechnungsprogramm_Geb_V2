const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

test('=== Modal Modularization & Components Architecture Suite ===', async (t) => {

    await t.test('1. Modals Directory Structure & Manifest Integrity', () => {
        const modalsDir = path.join(__dirname, '../views/modals');
        assert.ok(fs.existsSync(modalsDir), 'views/modals/ directory must exist');

        const manifestPath = path.join(modalsDir, 'manifest.json');
        assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist');

        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        assert.ok(Array.isArray(manifest), 'manifest must be an array');
        assert.strictEqual(manifest.length, 34, 'Must register 34 core modals extracted from code.html');

        manifest.forEach(item => {
            const filePath = path.join(modalsDir, item.file);
            assert.ok(fs.existsSync(filePath), `Partial file ${item.file} must exist on disk`);
            const content = fs.readFileSync(filePath, 'utf8');
            assert.ok(content.includes(`id="${item.id}"`) || content.includes(`id='${item.id}'`), `File ${item.file} must declare ID ${item.id}`);
        });

        // Additional partials
        assert.ok(fs.existsSync(path.join(modalsDir, 'maengel-modal.html')), 'maengel-modal.html must exist');
        assert.ok(fs.existsSync(path.join(modalsDir, 'soka-nachweis-modal.html')), 'soka-nachweis-modal.html must exist');
        assert.ok(fs.existsSync(path.join(modalsDir, 'ids-connect-modals.html')), 'ids-connect-modals.html must exist');
        assert.ok(fs.existsSync(path.join(modalsDir, 'efb-modal.html')), 'efb-modal.html must exist');

        // Domain bundles
        const bundles = [
            'banking-modals.html',
            'aufmass-modals.html',
            'stammdaten-modals.html',
            'lv-modals.html',
            'email-modals.html',
            'dauerrechnung-modals.html',
            'system-modals.html'
        ];
        bundles.forEach(b => {
            assert.ok(fs.existsSync(path.join(modalsDir, b)), `Bundle ${b} must exist in views/modals/`);
        });
    });

    await t.test('2. code.html Line Reduction & Shell Integrity', () => {
        const codeHtmlPath = path.join(__dirname, '../code.html');
        const codeHtml = fs.readFileSync(codeHtmlPath, 'utf8');
        const lineCount = codeHtml.split('\n').length;

        console.log(`Current code.html line count: ${lineCount}`);
        assert.ok(lineCount <= 3150, `code.html line count (${lineCount}) should be <= 3150 lines (originally 6170 lines)`);
        assert.ok(codeHtml.includes('id="modals-container"'), 'code.html must contain #modals-container');
        assert.ok(codeHtml.includes('src="js/modal-loader.js"'), 'code.html must load js/modal-loader.js');
        assert.ok(codeHtml.includes('id="print-template"'), 'code.html must preserve #print-template for printing');
    });

    await t.test('3. ModalLoader API & DOM Injection', () => {
        const codeHtmlPath = path.join(__dirname, '../code.html');
        const codeHtml = fs.readFileSync(codeHtmlPath, 'utf8');

        const dom = new JSDOM(codeHtml, {
            beforeParse(window) {
                window.tailwind = { config: {} };
            },
            runScripts: "dangerously"
        });
        const win = dom.window;
        const doc = win.document;

        // Load and execute modal-loader.js
        const loaderScript = fs.readFileSync(path.join(__dirname, '../js/modal-loader.js'), 'utf8');
        win.eval(loaderScript);

        assert.ok(win.ModalLoader, 'window.ModalLoader must be defined');
        assert.strictEqual(typeof win.ModalLoader.mountAll, 'function');
        assert.strictEqual(typeof win.ModalLoader.isMounted, 'function');
        assert.strictEqual(typeof win.ModalLoader.getHtml, 'function');

        // Check key core modals
        const requiredModals = [
            'rechnung-modal',
            'artikel-modal',
            'kunde-modal',
            'objekt-modal',
            'aufmass-modal',
            'aufmassblatt-modal',
            'nachtrag-modal',
            'abnahme-modal',
            'eingangsrechnung-modal',
            'bank-konto-modal',
            'sepa-prenot-modal',
            'mandat-modal',
            'plan-modal',
            'email-modal',
            'pdf-preview-modal'
        ];

        requiredModals.forEach(mId => {
            const el = doc.getElementById(mId);
            assert.ok(el, `Modal #${mId} must be mounted and queryable in the DOM`);
        });

        // Check critical child elements inside rechnung-modal
        assert.ok(doc.getElementById('rechnung-form'), '#rechnung-form must exist');
        assert.ok(doc.getElementById('rechnung-art'), '#rechnung-art select must exist');
        assert.ok(doc.getElementById('rechnung-kunde'), '#rechnung-kunde select must exist');
        assert.ok(doc.getElementById('rechnung-projekt'), '#rechnung-projekt select must exist');
        assert.ok(doc.getElementById('rechnung-positionen'), '#rechnung-positionen must exist');

        // Check critical child elements inside aufmass-modal
        assert.ok(doc.getElementById('aufmass-rows-body'), '#aufmass-rows-body must exist');
        assert.ok(doc.getElementById('btn-apply-aufmass'), '#btn-apply-aufmass must exist');
    });

    await t.test('4. Complete DOM ID Preservation vs Baseline', () => {
        const backupPath = path.join(__dirname, '../code.html.bak');
        if (!fs.existsSync(backupPath)) return;

        const origHtml = fs.readFileSync(backupPath, 'utf8');
        const origDom = new JSDOM(origHtml);
        const origIds = Array.from(origDom.window.document.querySelectorAll('[id]')).map(e => e.id);

        const currentHtml = fs.readFileSync(path.join(__dirname, '../code.html'), 'utf8');
        const curDom = new JSDOM(currentHtml, {
            beforeParse(window) {
                window.tailwind = { config: {} };
            },
            runScripts: "dangerously"
        });
        const curWin = curDom.window;
        const curDoc = curWin.document;

        const loaderScript = fs.readFileSync(path.join(__dirname, '../js/modal-loader.js'), 'utf8');
        curWin.eval(loaderScript);

        const missing = [];
        origIds.forEach(id => {
            if (!curDoc.getElementById(id)) {
                missing.push(id);
            }
        });

        assert.strictEqual(missing.length, 0, `All original IDs must exist in modularized DOM. Missing: ${missing.join(', ')}`);
    });
});
