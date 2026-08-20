const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

describe('js/artikel.js UI and Helper Logic', () => {
    let dom;
    let window;
    let document;

    beforeEach(() => {
        // Setup JSDOM environment with runScripts: "dangerously" to execute the script in the context
        dom = new JSDOM(`
            <!DOCTYPE html>
            <html>
            <body>
                <table>
                    <tbody id="artikel-table-body"></tbody>
                </table>
                <div id="kpi-total-items"></div>
                <div id="kpi-total-value"></div>
                <div id="kpi-low-stock"></div>
                
                <input id="search-artikel" type="text" />
                
                <div id="artikel-modal" class="hidden"></div>
                <div id="modal-title"></div>
                <form id="artikel-form"></form>
                <input id="artikel-id" type="hidden" />
                <input id="artikel-name" type="text" />
                <input id="artikel-ean" type="text" />
                <input id="artikel-ek" type="number" />
                <input id="artikel-vk" type="number" />
                <input id="artikel-mwst" type="number" />
                <input id="artikel-katalog" type="text" />
                <input id="artikel-lieferant" type="text" />
                <input id="artikel-bestand" type="number" />
                <input id="artikel-beschreibung" type="text" />
                <input id="artikel-ist-bauleistung" type="checkbox" />
                <input id="artikel-kostenart" type="text" />
                <input id="artikel-lohnanteil" type="number" />
                
                <div id="artikel-bilder-container"></div>
                <button id="artikel-bilder-upload-btn"></button>
            </body>
            </html>
        `, { runScripts: "dangerously" });
        window = dom.window;
        document = window.document;

        // Mock globals needed by artikel.js
        window.state = {
            artikel: [],
            nextArtikelId: 1
        };
        
        window.formatCurrency = (val) => '€' + (val || 0).toFixed(2);
        
        window.showToast = () => {}; // mock
        window.safeConfirm = async () => true; // mock
        
        window.api = {
            saveArtikel: async () => {},
            deleteArtikel: async () => {},
            getFullState: async () => ({ artikel: window.state.artikel }),
            focusWindow: async () => {}
        };
        
        window.parseCsvLine = (text) => {
            // simple mock for parseCsvLine from utils.js
            let result = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < text.length; i++) {
                const c = text[i];
                if (c === '"') {
                    inQuotes = !inQuotes;
                } else if (c === ',' && !inQuotes) {
                    result.push(current);
                    current = '';
                } else {
                    current += c;
                }
            }
            result.push(current);
            return result;
        };

        // Load and evaluate artikel.js
        const artikelJsCode = fs.readFileSync(path.join(__dirname, '../js/artikel.js'), 'utf-8');
        
        // Execute the script within the JSDOM context
        const script = document.createElement('script');
        script.textContent = artikelJsCode;
        document.body.appendChild(script);
    });

    test('setup works', () => {
        assert.ok(window.renderArtikel);
    });

    describe('renderArtikel', () => {
        test('empty state renders empty table and zero KPIs', () => {
            window.state.artikel = [];
            window.renderArtikel();

            const tbody = window.document.getElementById('artikel-table-body');
            assert.strictEqual(tbody.children.length, 0);

            assert.strictEqual(window.document.getElementById('kpi-total-items').innerText, 0);
            assert.strictEqual(window.document.getElementById('kpi-total-value').innerText, '€0.00');
            assert.strictEqual(window.document.getElementById('kpi-low-stock').innerText, 0);
        });

        test('renders items correctly', () => {
            window.state.artikel = [
                {
                    id: 1,
                    name: 'Hammer',
                    ek: 10,
                    vk: 20,
                    bestand: 10,
                    katalog: 'Tools'
                },
                {
                    id: 2,
                    name: 'Nails',
                    ek: 2,
                    vk: 5,
                    bestand: 3, // Low stock (< 5)
                    bilder: ['img1.png']
                }
            ];
            window.renderArtikel();

            const tbody = window.document.getElementById('artikel-table-body');
            assert.strictEqual(tbody.children.length, 2);

            // KPIs
            assert.strictEqual(window.document.getElementById('kpi-total-items').innerText, 2);
            assert.strictEqual(window.document.getElementById('kpi-total-value').innerText, '€106.00'); // 10*10 + 2*3
            assert.strictEqual(window.document.getElementById('kpi-low-stock').innerText, 1);

            // Row 1 (Hammer)
            const row1 = tbody.children[0];
            assert.ok(row1.innerHTML.includes('Hammer'));
            assert.ok(row1.innerHTML.includes('Tools'));
            assert.ok(!row1.innerHTML.includes('text-amber-500')); // Not low stock

            // Row 2 (Nails)
            const row2 = tbody.children[1];
            assert.ok(row2.innerHTML.includes('Nails'));
            assert.ok(row2.innerHTML.includes('text-amber-500')); // Low stock highlight
            
            // Image check
            const imgEl = row2.querySelector('img');
            assert.ok(imgEl);
            assert.strictEqual(imgEl.src.replace('about:blank/', ''), 'img1.png');
        });

        test('search filtering works', () => {
            window.state.artikel = [
                { id: 1, name: 'Hammer', bestand: 10 },
                { id: 2, name: 'Screwdriver', bestand: 15 }
            ];
            window.renderArtikel('hammer');

            const tbody = window.document.getElementById('artikel-table-body');
            assert.strictEqual(tbody.children.length, 1);
            assert.ok(tbody.children[0].innerHTML.includes('Hammer'));

            // KPIs update accordingly
            assert.strictEqual(window.document.getElementById('kpi-total-items').innerText, 1);
        });
    });

    describe('CRUD Operations', () => {
        let toastArgs = null;
        let deleteId = null;
        let saveArgs = null;
        let renderCalled = false;

        beforeEach(() => {
            toastArgs = null;
            deleteId = null;
            saveArgs = null;
            renderCalled = false;

            window.showToast = (msg, type) => {
                toastArgs = { msg, type };
            };
            window.api.deleteArtikel = async (id) => {
                deleteId = id;
            };
            window.api.saveArtikel = async (data) => {
                saveArgs = data;
            };
            
            // spy on renderArtikel
            const originalRender = window.renderArtikel;
            window.renderArtikel = (...args) => {
                renderCalled = true;
                originalRender(...args);
            };
        });

        test('deleteArtikel asks for confirmation and deletes', async () => {
            window.state.artikel = [
                { id: 1, name: 'Item 1' },
                { id: 2, name: 'Item 2' }
            ];
            window.safeConfirm = async () => true;

            await window.deleteArtikel(1);

            assert.strictEqual(deleteId, 1);
            assert.strictEqual(window.state.artikel.length, 1);
            assert.strictEqual(window.state.artikel[0].id, 2);
            assert.ok(renderCalled);
            assert.deepStrictEqual(toastArgs, { msg: 'Artikel gelöscht.', type: 'success' });
        });

        test('deleteArtikel does nothing if not confirmed', async () => {
            window.state.artikel = [
                { id: 1, name: 'Item 1' }
            ];
            window.safeConfirm = async () => false;

            await window.deleteArtikel(1);

            assert.strictEqual(deleteId, null);
            assert.strictEqual(window.state.artikel.length, 1);
            assert.ok(!renderCalled);
        });

        test('saveArtikel shows error on missing name', async () => {
            window.document.getElementById('artikel-id').value = '';
            window.document.getElementById('artikel-name').value = ''; // missing name
            window.document.getElementById('artikel-ek').value = '10';
            window.document.getElementById('artikel-vk').value = '20';
            window.document.getElementById('artikel-bestand').value = '5';

            await window.saveArtikel();

            assert.strictEqual(saveArgs, null);
            assert.deepStrictEqual(toastArgs, { msg: 'Bitte füllen Sie alle erforderlichen Felder korrekt aus.', type: 'error' });
        });

        test('saveArtikel converts values and calls api', async () => {
            window.document.getElementById('artikel-id').value = ''; // new item
            window.document.getElementById('artikel-name').value = 'Test Item';
            window.document.getElementById('artikel-ean').value = '123456';
            window.document.getElementById('artikel-beschreibung').value = 'Desc';
            window.document.getElementById('artikel-ek').value = '10.5';
            window.document.getElementById('artikel-vk').value = '20.99';
            window.document.getElementById('artikel-mwst').value = '19';
            window.document.getElementById('artikel-katalog').value = 'Cat1';
            window.document.getElementById('artikel-lieferant').value = 'Sup1';
            window.document.getElementById('artikel-bestand').value = '100';
            window.document.getElementById('artikel-ist-bauleistung').checked = true;
            window.document.getElementById('artikel-kostenart').value = 'LOHN';
            window.document.getElementById('artikel-lohnanteil').value = '50';

            // We need to inject currentArtikelBilder because it is declared with 'let' in global scope of JSDOM 
            // and we cannot override it by setting window.currentArtikelBilder
            window.eval('currentArtikelBilder = ["img1.png"];');

            await window.saveArtikel();

            assert.ok(saveArgs);
            assert.strictEqual(saveArgs.name, 'Test Item');
            assert.strictEqual(saveArgs.ek, 10.5);
            assert.strictEqual(saveArgs.vk, 20.99);
            assert.strictEqual(saveArgs.mwst, 19);
            assert.strictEqual(saveArgs.bestand, 100);
            assert.strictEqual(saveArgs.ist_bauleistung, 1);
            assert.strictEqual(saveArgs.lohnanteil_prozent, 50);
            // Array from different JS context, deepEqual in Node might complain about reference for prototype
            assert.strictEqual(saveArgs.bilder.length, 1);
            assert.strictEqual(saveArgs.bilder[0], 'img1.png');
            
            assert.ok(renderCalled);
            assert.deepStrictEqual(toastArgs, { msg: 'Artikel erfolgreich gespeichert.', type: 'success' });
            assert.ok(window.document.getElementById('artikel-modal').classList.contains('hidden'));
        });
    });

    describe('CSV Import/Export', () => {
        let toastArgs = null;
        let createdLinks = [];
        let appendedChildren = [];

        beforeEach(() => {
            toastArgs = null;
            createdLinks = [];
            appendedChildren = [];

            window.showToast = (msg, type) => {
                toastArgs = { msg, type };
            };

            // Mock document methods for CSV Export testing
            const originalCreateElement = window.document.createElement;
            window.document.createElement = (tagName) => {
                if (tagName.toLowerCase() === 'a') {
                    const link = {
                        tagName: 'a',
                        attributes: {},
                        setAttribute(key, val) { this.attributes[key] = val; },
                        click: () => { link.clicked = true; }
                    };
                    createdLinks.push(link);
                    return link;
                }
                return originalCreateElement.call(window.document, tagName);
            };

            const originalAppendChild = window.document.body.appendChild;
            window.document.body.appendChild = (child) => {
                appendedChildren.push(child);
                if (child.tagName !== 'a') { // Allow other logic to work, mock a only
                   return originalAppendChild.call(window.document.body, child);
                }
            };
            
            const originalRemoveChild = window.document.body.removeChild;
            window.document.body.removeChild = (child) => {
                if (child.tagName !== 'a') { 
                   return originalRemoveChild.call(window.document.body, child);
                }
            };
        });

        test('exportArtikelCsv generates correct CSV', () => {
            window.state.artikel = [
                { id: 1, name: 'Test "Item"', ek: 10, vk: 20, mwst: 19 }
            ];

            window.exportArtikelCsv();

            assert.strictEqual(createdLinks.length, 1);
            const link = createdLinks[0];
            assert.strictEqual(link.attributes.download, 'artikel_export.csv');
            assert.ok(link.clicked);
            
            const expectedCsvContent = "data:text/csv;charset=utf-8,ID,Artikelname,EK-Preis,VK-Preis,MwSt\n1,\"Test \"\"Item\"\"\",10,20,19";
            assert.strictEqual(link.attributes.href, encodeURI(expectedCsvContent));
        });

        test('importArtikelCsv parses and updates/adds items', () => {
            window.state.artikel = [
                { id: 1, name: 'Existing Item', ek: 5, vk: 10, mwst: 19 }
            ];
            window.state.nextArtikelId = 2;

            const csvData = "ID,Artikelname,EK-Preis,VK-Preis,MwSt\n1,Existing Item,6,12,7\n,New Item,2.5,5.5,19\nInvalid Line";
            
            const mockEvent = {
                target: {
                    files: [{
                        // mock file object, we just need FileReader to process it
                    }],
                    value: 'mock_path'
                }
            };

            // Setup a mock FileReader for the test
            const originalFileReader = window.FileReader;
            window.FileReader = function() {
                this.readAsText = function(file) {
                    if (this.onload) {
                        this.onload({ target: { result: csvData } });
                    }
                };
            };

            window.importArtikelCsv(mockEvent);

            assert.strictEqual(window.state.artikel.length, 2);
            
            // Check updated item
            const existing = window.state.artikel[0];
            assert.strictEqual(existing.name, 'Existing Item');
            assert.strictEqual(existing.ek, 6);
            assert.strictEqual(existing.vk, 12);
            assert.strictEqual(existing.mwst, 7);

            // Check new item
            const newItem = window.state.artikel[1];
            assert.strictEqual(newItem.name, 'New Item');
            assert.strictEqual(newItem.ek, 2.5);
            assert.strictEqual(newItem.vk, 5.5);
            assert.strictEqual(newItem.mwst, 19);
            assert.strictEqual(newItem.id, 2);

            assert.strictEqual(mockEvent.target.value, ''); // input reset
            assert.strictEqual(toastArgs.type, 'error'); // error because of invalid line
            assert.ok(toastArgs.msg.includes('1 erfolgreich'));
            assert.ok(toastArgs.msg.includes('1 aktualisiert'));
            assert.ok(toastArgs.msg.includes('1 fehlgeschlagen'));

            // Restore FileReader
            window.FileReader = originalFileReader;
        });
    });
});
