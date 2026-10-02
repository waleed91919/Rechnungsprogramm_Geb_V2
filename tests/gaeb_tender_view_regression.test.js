/**
 * tests/gaeb_tender_view_regression.test.js
 * 
 * Gezielte Regressionstests für die GAEB-Entwurfsübersicht (tender_view.js)
 * und den vollständigen UI-Navigationsweg gemäß liesen.txt.
 * 
 * Verifiziert:
 * 1. Zwei vorhandene Entwürfe mit unterschiedlichen updated_at-Werten:
 *    Beide Zeilen erscheinen und zeigen jeweils ihr eigenes Datum.
 * 2. Fehlendes oder leeres updated_at:
 *    created_at wird verwendet (auch bei Leerstrings oder Whitespace).
 * 3. Beide Datumswerte fehlen:
 *    Platzhalter '—' erscheint, keine Exception.
 * 4. Import ohne Entwürfe:
 *    Empty State erscheint korrekt, Tabelle ist ausgeblendet.
 * 5. Import mit Entwürfen (Leseoperation):
 *    Reines Öffnen der Übersicht ist strikte Leseoperation (ruft keine Schreib-APIs auf,
 *    verändert weder Anzahl noch Inhalt der Entwürfe).
 * 6. Vollständiger UI-Navigationsweg:
 *    GAEB-Menü öffnen -> Importliste anzeigen -> "Auswählen" anklicken
 *    -> Entwurfszeilen prüfen -> "Öffnen" beim gewählten Entwurf anklicken
 *    -> richtige Entwurfs-ID im Editor prüfen -> zurück zur Entwurfsübersicht.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const MODAL_HTML_PATH = path.join(__dirname, '..', 'views', 'modals', 'gaeb-tender-modal.html');
const TENDER_VIEW_PATH = path.join(__dirname, '..', 'js', 'gaeb_tender', 'tender_view.js');
const TENDER_STATE_PATH = path.join(__dirname, '..', 'js', 'gaeb_tender', 'tender_state.js');
const TENDER_CONTROLLER_PATH = path.join(__dirname, '..', 'js', 'gaeb_tender', 'tender_controller.js');

function setupJsdomEnv(initialImports = [], initialDrafts = {}) {
    const modalHtml = fs.readFileSync(MODAL_HTML_PATH, 'utf8');
    const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body>
            <button id="nav-gaeb-tender" onclick="openGaebTenderModal()">Ausschreibungen</button>
            ${modalHtml}
        </body>
        </html>
    `, {
        runScripts: 'dangerously',
        url: 'http://localhost/'
    });

    const window = dom.window;
    const document = window.document;

    const alerts = [];
    const confirms = [];
    const toasts = [];
    const invokedChannels = [];

    window.alert = (msg) => alerts.push(msg);
    window.confirm = (msg) => { confirms.push(msg); return true; };
    window.showToast = (msg, type) => toasts.push({ msg, type });

    // Mock-Datenhaltung
    const importsStore = [...initialImports];
    const draftsStore = { ...initialDrafts };

    window.api = {
        invoke: async (channel, payload) => {
            invokedChannels.push({ channel, payload });

            if (channel === 'gaeb:list-imports') {
                return importsStore;
            }
            if (channel === 'gaeb:list-tender-drafts') {
                const importId = typeof payload === 'object' && payload !== null ? payload.importId : payload;
                return draftsStore[Number(importId)] || [];
            }
            if (channel === 'gaeb:load-tender-draft') {
                const draftId = typeof payload === 'object' && payload !== null ? payload.draftId : payload;
                let foundDraft = null;
                for (const list of Object.values(draftsStore)) {
                    const match = list.find(d => d.id === Number(draftId));
                    if (match) { foundDraft = match; break; }
                }
                if (!foundDraft) throw new Error(`Draft #${draftId} nicht gefunden`);
                return {
                    draft: foundDraft,
                    items: [
                        { _dbId: 1, path_oz: '01.01.0010', short_text: 'Position 1', isHinweistext: false, draft_price: 50.0 }
                    ],
                    tree: [],
                    projectInfo: { name: 'Projekt Test', gaebVersion: '3.3' },
                    stats: { status: foundDraft.status, version: foundDraft.version, total_netto: foundDraft.total_netto || 0 }
                };
            }
            if (channel === 'gaeb:create-tender-draft') {
                throw new Error('Unerwarteter Aufruf von create-tender-draft beim reinen Lesen!');
            }
            throw new Error(`Unerwarteter IPC-Kanal im Test: ${channel}`);
        }
    };

    // Lade Scripts in den Window-Context
    const stateScript = document.createElement('script');
    stateScript.textContent = fs.readFileSync(TENDER_STATE_PATH, 'utf8');
    document.body.appendChild(stateScript);

    const viewScript = document.createElement('script');
    viewScript.textContent = fs.readFileSync(TENDER_VIEW_PATH, 'utf8');
    document.body.appendChild(viewScript);

    const controllerScript = document.createElement('script');
    controllerScript.textContent = fs.readFileSync(TENDER_CONTROLLER_PATH, 'utf8');
    document.body.appendChild(controllerScript);

    return {
        dom,
        window,
        document,
        alerts,
        confirms,
        toasts,
        invokedChannels,
        importsStore,
        draftsStore
    };
}

describe('GAEB Tender Draft View Regression & Navigation (liesen.txt)', () => {

    test('1. Zwei vorhandene Entwürfe mit unterschiedlichen updated_at-Werten zeigen jeweils ihr eigenes Datum', () => {
        const { window, document, alerts } = setupJsdomEnv();

        const importInfo = { id: 1, project_name: 'Testprojekt', file_name: 'test.x83' };
        const drafts = [
            {
                id: 101,
                version: 1,
                name: 'Entwurf Alpha',
                status: 'IN_BEARBEITUNG',
                total_netto: 1500.00,
                total_brutto: 1785.00,
                unpriced_count: 2,
                missing_bireq_count: 0,
                created_at: '2026-10-01T08:00:00',
                updated_at: '2026-10-01T09:30:00'
            },
            {
                id: 102,
                version: 2,
                name: 'Entwurf Beta',
                status: 'VOLLSTAENDIG_BEPREIST',
                total_netto: 2500.00,
                total_brutto: 2975.00,
                unpriced_count: 0,
                missing_bireq_count: 0,
                created_at: '2026-10-01T08:00:00',
                updated_at: '2026-10-02T14:45:00'
            }
        ];

        window.GaebTenderView.renderDraftList(importInfo, drafts);

        assert.strictEqual(alerts.length, 0, 'Es dürfen keine Fehler/Alerts geworfen werden');

        const tbody = document.getElementById('gt-draft-list-tbody');
        const rows = tbody.querySelectorAll('tr');
        assert.strictEqual(rows.length, 2, 'Es müssen genau 2 Entwurfszeilen gerendert werden');

        // Prüfe Zeile 1
        const dateCell1 = rows[0].querySelectorAll('td')[6];
        const dateText1 = dateCell1.textContent.trim();
        assert.strictEqual(dateText1, '2026-10-01 09:30', 'Zeile 1 muss das eigene updated_at formatiert zeigen');

        // Prüfe Zeile 2
        const dateCell2 = rows[1].querySelectorAll('td')[6];
        const dateText2 = dateCell2.textContent.trim();
        assert.strictEqual(dateText2, '2026-10-02 14:45', 'Zeile 2 muss das eigene updated_at formatiert zeigen');

        assert.notStrictEqual(dateText1, dateText2, 'Die beiden Datumsangaben müssen unterschiedlich sein');
    });

    test('2. Fehlendes oder leeres updated_at verwendet created_at (null, empty, whitespace)', () => {
        const { window, document, alerts } = setupJsdomEnv();

        const importInfo = { id: 1, project_name: 'Testprojekt', file_name: 'test.x83' };
        const drafts = [
            {
                id: 201,
                version: 1,
                name: 'Draft mit updated_at = null',
                status: 'IN_BEARBEITUNG',
                total_netto: 100,
                total_brutto: 119,
                updated_at: null,
                created_at: '2026-09-10T10:15:00'
            },
            {
                id: 202,
                version: 2,
                name: 'Draft mit updated_at = leer',
                status: 'IN_BEARBEITUNG',
                total_netto: 200,
                total_brutto: 238,
                updated_at: '',
                created_at: '2026-09-11T11:25:00'
            },
            {
                id: 203,
                version: 3,
                name: 'Draft mit updated_at = whitespace',
                status: 'IN_BEARBEITUNG',
                total_netto: 300,
                total_brutto: 357,
                updated_at: '   ',
                created_at: '2026-09-12T12:35:00'
            },
            {
                id: 204,
                version: 4,
                name: 'Draft ohne updated_at Feld',
                status: 'IN_BEARBEITUNG',
                total_netto: 400,
                total_brutto: 476,
                created_at: '2026-09-13T13:45:00'
            }
        ];

        window.GaebTenderView.renderDraftList(importInfo, drafts);

        assert.strictEqual(alerts.length, 0, 'Es dürfen keine Fehler/Alerts geworfen werden');

        const tbody = document.getElementById('gt-draft-list-tbody');
        const rows = tbody.querySelectorAll('tr');
        assert.strictEqual(rows.length, 4, 'Alle 4 Entwürfe müssen gerendert werden');

        assert.strictEqual(rows[0].querySelectorAll('td')[6].textContent.trim(), '2026-09-10 10:15');
        assert.strictEqual(rows[1].querySelectorAll('td')[6].textContent.trim(), '2026-09-11 11:25');
        assert.strictEqual(rows[2].querySelectorAll('td')[6].textContent.trim(), '2026-09-12 12:35');
        assert.strictEqual(rows[3].querySelectorAll('td')[6].textContent.trim(), '2026-09-13 13:45');
    });

    test('3. Beide Datumswerte fehlen: Platzhalter — erscheint, keine Exception', () => {
        const { window, document, alerts } = setupJsdomEnv();

        const importInfo = { id: 1, project_name: 'Testprojekt', file_name: 'test.x83' };
        const drafts = [
            {
                id: 301,
                version: 1,
                name: 'Beide null',
                status: 'IN_BEARBEITUNG',
                total_netto: 0,
                total_brutto: 0,
                updated_at: null,
                created_at: null
            },
            {
                id: 302,
                version: 2,
                name: 'Beide Leerstring',
                status: 'IN_BEARBEITUNG',
                total_netto: 0,
                total_brutto: 0,
                updated_at: '',
                created_at: ''
            },
            {
                id: 303,
                version: 3,
                name: 'Beide Whitespace',
                status: 'IN_BEARBEITUNG',
                total_netto: 0,
                total_brutto: 0,
                updated_at: '   ',
                created_at: ' '
            },
            {
                id: 304,
                version: 4,
                name: 'Beide undefined',
                status: 'IN_BEARBEITUNG',
                total_netto: 0,
                total_brutto: 0
            }
        ];

        // Muss ohne Exception durchlaufen
        assert.doesNotThrow(() => {
            window.GaebTenderView.renderDraftList(importInfo, drafts);
        });

        assert.strictEqual(alerts.length, 0, 'Keine Fehlermeldung darf getriggert werden');

        const tbody = document.getElementById('gt-draft-list-tbody');
        const rows = tbody.querySelectorAll('tr');
        assert.strictEqual(rows.length, 4);

        for (let i = 0; i < 4; i++) {
            const dateText = rows[i].querySelectorAll('td')[6].textContent.trim();
            assert.strictEqual(dateText, '—', `Zeile ${i + 1} muss den Platzhalter '—' zeigen`);
        }
    });

    test('4. Import ohne Entwürfe: Der vorhandene Empty State erscheint korrekt', () => {
        const { window, document, alerts } = setupJsdomEnv();

        const importInfo = { id: 1, project_name: 'Leeres Projekt', file_name: 'empty.x83' };

        // Test mit leerem Array
        window.GaebTenderView.renderDraftList(importInfo, []);

        const tableContainer = document.getElementById('gt-draft-table-container');
        const emptyEl = document.getElementById('gt-empty-drafts');
        const tbody = document.getElementById('gt-draft-list-tbody');

        assert.ok(tableContainer.classList.contains('hidden'), 'Tabelle muss bei 0 Entwürfen versteckt sein');
        assert.ok(!emptyEl.classList.contains('hidden'), 'Empty State muss sichtbar sein');
        assert.strictEqual(tbody.children.length, 0, 'Tbody muss leer sein');

        // Test mit null
        window.GaebTenderView.renderDraftList(importInfo, null);
        assert.ok(tableContainer.classList.contains('hidden'));
        assert.ok(!emptyEl.classList.contains('hidden'));
        assert.strictEqual(tbody.children.length, 0);

        assert.strictEqual(alerts.length, 0);
    });

    test('5. Import mit Entwürfen: Reines Öffnen der Übersicht ist eine reine Leseoperation und verändert weder Anzahl noch Inhalt der Entwürfe', async () => {
        const initialImport = { id: 10, project_name: 'Projekt 10', file_name: 'p10.x83' };
        const initialDraftsList = [
            { id: 501, version: 1, name: 'Entwurf A', status: 'IN_BEARBEITUNG', created_at: '2026-10-01 10:00', updated_at: '2026-10-01 11:00' },
            { id: 502, version: 2, name: 'Entwurf B', status: 'VOLLSTAENDIG_BEPREIST', created_at: '2026-10-01 10:00', updated_at: '2026-10-02 12:00' }
        ];

        const { window, alerts, invokedChannels, draftsStore } = setupJsdomEnv([initialImport], { 10: initialDraftsList });

        // Schnappschuss vor Öffnen
        const countBefore = draftsStore[10].length;
        const serializedBefore = JSON.stringify(draftsStore[10]);

        // Übersicht öffnen via Controller
        await window.GaebTenderController.showDraftList(10);

        assert.strictEqual(alerts.length, 0, 'showDraftList darf keinen Fehler werfen');

        // Prüfe aufgerufene Kanäle: Nur Lesekanäle (list-imports, list-tender-drafts), keine Schreiboperationen!
        const writeChannels = invokedChannels.filter(c => 
            c.channel.includes('create') || c.channel.includes('save') || c.channel.includes('delete') || c.channel.includes('clone')
        );
        assert.strictEqual(writeChannels.length, 0, 'Es dürfen keinerlei Schreib- oder Erzeugungs-APIs aufgerufen werden');

        // Schnappschuss nach Öffnen
        const countAfter = draftsStore[10].length;
        const serializedAfter = JSON.stringify(draftsStore[10]);

        assert.strictEqual(countAfter, countBefore, 'Anzahl der Entwürfe muss unverändert sein');
        assert.strictEqual(serializedAfter, serializedBefore, 'Inhalt der Entwürfe muss identisch geblieben sein');
    });

    test('6. Vollständiger UI-Navigationsweg: GAEB-Menü -> Importliste -> Auswählen -> Entwurfszeilen -> Öffnen -> Editor -> Zurück', async () => {
        const testImport = { id: 42, project_name: 'Neubau Hauptbahnhof', file_name: 'hbf.x83', gaeb_version: '3.3' };
        const testDrafts = [
            {
                id: 101,
                import_id: 42,
                version: 1,
                name: 'Planungsphase v1',
                status: 'IN_BEARBEITUNG',
                total_netto: 12500.0,
                total_brutto: 14875.0,
                unpriced_count: 5,
                missing_bireq_count: 1,
                created_at: '2026-10-01 08:30:00',
                updated_at: '2026-10-01 10:15:00'
            },
            {
                id: 102,
                import_id: 42,
                version: 2,
                name: 'Verhandlungsstand v2',
                status: 'VOLLSTAENDIG_BEPREIST',
                total_netto: 24500.0,
                total_brutto: 29155.0,
                unpriced_count: 0,
                missing_bireq_count: 0,
                created_at: '2026-10-01 08:30:00',
                updated_at: '2026-10-02 16:30:00'
            }
        ];

        const { window, document, alerts } = setupJsdomEnv([testImport], { 42: testDrafts });

        // SCHRITT 1: GAEB-Menü öffnen (entspricht Klick auf #nav-gaeb-tender)
        await window.openGaebTenderModal();

        const modal = document.getElementById('gaeb-tender-modal');
        assert.ok(!modal.classList.contains('hidden'), 'GAEB-Modal muss sichtbar sein');

        const importListView = document.getElementById('gt-view-import-list');
        assert.ok(!importListView.classList.contains('hidden'), 'Importliste muss sichtbar sein');

        const importTbody = document.getElementById('gt-import-list-tbody');
        assert.strictEqual(importTbody.querySelectorAll('tr').length, 1, 'Der importierte X83-Datensatz muss in der Liste stehen');

        // SCHRITT 2: "Auswählen" beim vorbereiteten Import anklicken
        // (Dies löst window.GaebTenderController.selectImport(importId) aus)
        await window.GaebTenderController.selectImport(42);

        // HIER trat der gemeldete Fehler auf (updatedAt is not defined)!
        assert.strictEqual(alerts.length, 0, `Es darf KEIN Fehler-Dialog erscheinen (gemeldet war: updatedAt is not defined). Erhalten: ${alerts.join('; ')}`);

        const draftListView = document.getElementById('gt-view-draft-list');
        assert.ok(!draftListView.classList.contains('hidden'), 'Entwurfsübersicht (#gt-view-draft-list) muss nach Auswahl sichtbar sein');
        assert.ok(importListView.classList.contains('hidden'), 'Importliste muss jetzt ausgeblendet sein');

        // SCHRITT 3: Vorhandene Entwurfszeilen prüfen
        const draftTbody = document.getElementById('gt-draft-list-tbody');
        const draftRows = draftTbody.querySelectorAll('tr');
        assert.strictEqual(draftRows.length, 2, 'Es müssen genau 2 Entwurfszeilen gerendert worden sein');

        // Versions- und Namensprüfung
        const row1Text = draftRows[0].textContent;
        const row2Text = draftRows[1].textContent;
        assert.ok(row1Text.includes('v1'), 'Zeile 1 muss Version v1 zeigen');
        assert.ok(row1Text.includes('Planungsphase v1'), 'Zeile 1 muss Entwurfsnamen zeigen');
        assert.ok(row2Text.includes('v2'), 'Zeile 2 muss Version v2 zeigen');
        assert.ok(row2Text.includes('Verhandlungsstand v2'), 'Zeile 2 muss Entwurfsnamen zeigen');

        // Datumszellen prüfen (müssen befüllt sein, kein "undefined" oder Exception)
        const dateCell1 = draftRows[0].querySelectorAll('td')[6].textContent.trim();
        const dateCell2 = draftRows[1].querySelectorAll('td')[6].textContent.trim();
        assert.strictEqual(dateCell1, '2026-10-01 10:15', 'Zeile 1 muss eigenes Datum zeigen');
        assert.strictEqual(dateCell2, '2026-10-02 16:30', 'Zeile 2 muss eigenes Datum zeigen');

        // SCHRITT 4: „Öffnen“ bei einem bestimmten Entwurf anklicken (hier gezielt draft 102, Version 2)
        // (Entspricht Klick auf den Öffnen-Button von Zeile 2)
        await window.GaebTenderController.openDraft(102, 42);

        const editorView = document.getElementById('gt-view-editor');
        assert.ok(!editorView.classList.contains('hidden'), 'Editor-Ansicht (#gt-view-editor) muss nach Öffnen aktiv sein');
        assert.ok(draftListView.classList.contains('hidden'), 'Entwurfsübersicht muss ausgeblendet sein');

        // Richtige Entwurfs-ID im Editor prüfen (MUSS exakt 102 sein, NICHT automatisch 101!)
        assert.strictEqual(window.GaebTenderState.currentDraftId, 102, 'TenderState muss Entwurf #102 geladen haben');
        assert.strictEqual(window.GaebTenderState.draft.name, 'Verhandlungsstand v2', 'Geladener Entwurf muss exakt draft 102 entsprechen');

        // SCHRITT 5: Zurück zur Entwurfsübersicht
        // (Entspricht Klick auf #gt-nav-to-drafts)
        await window.GaebTenderController.backToDraftList();

        assert.ok(!draftListView.classList.contains('hidden'), 'Nach Zurückkehren muss Entwurfsübersicht wieder sichtbar sein');
        assert.ok(editorView.classList.contains('hidden'), 'Editor muss wieder verborgen sein');

        // Entwurfszeilen müssen weiterhin unverändert verfügbar sein
        const draftRowsAfterBack = document.getElementById('gt-draft-list-tbody').querySelectorAll('tr');
        assert.strictEqual(draftRowsAfterBack.length, 2, 'Nach Rücknavigation müssen weiterhin 2 Zeilen vorhanden sein');

        // Abschließende Bestätigung: Kein Fehler während des gesamten Navigationswegs
        assert.strictEqual(alerts.length, 0, 'Während der gesamten Navigation darf kein Fehlerdialog aufgetreten sein');
    });
});
