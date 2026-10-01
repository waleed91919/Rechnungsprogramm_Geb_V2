/**
 * tests/verify_real_package_compliance.js
 *
 * Verifiziert die GAEB-X84-Exportfunktionalität im tatsächlich gebauten
 * Electron-Paket (dist/win-unpacked/W-Link ERP.exe) gemäß liesen.txt.
 *
 * Trennt die Nachweise strikt in:
 * 1. Echte Paketlaufzeit und Ressourcen (app.isPackaged, resourcesPath, native libxmljs2)
 * 2. XSD-Service-Validierung im Paket (GAEB 3.2/3.3 gültig, ungültig, Namespaces, Versionen,
 *    sowie isolierte Kopie mit fehlendem Hauptschema und fehlendem Include)
 * 3. Handler-Integrationstest des tatsächlich registrierten gaeb:export-x84-Handlers
 *    (Ablehnung ungültigen XMLs, Entscheidung gegen Dateischreiben, valid: false mit leerer Fehlerliste,
 *    simulierter Dialog-Abbruch mit Unveränderlichkeit)
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const EXE_PATH = path.resolve(ROOT_DIR, 'dist', 'win-unpacked', 'W-Link ERP.exe');
const RESOURCES_DIR = path.resolve(ROOT_DIR, 'dist', 'win-unpacked', 'resources');
const ASAR_PATH = path.resolve(RESOURCES_DIR, 'app.asar');
const FIXTURES_DIR = path.resolve(ROOT_DIR, 'tests', 'fixtures', 'gaeb_x83');
const GAEBEngine = require('../js/gaeb');

async function runRealPackageVerification() {
    console.log('================================================================');
    console.log('STARTE REALE PAKET-VERIFIKATION (liesen.txt - 4-Ebenen-Prüfung)');
    console.log('================================================================');
    console.log(`Executable:     ${EXE_PATH}`);
    console.log(`Resources:      ${RESOURCES_DIR}`);
    console.log(`App Asar:       ${ASAR_PATH}`);
    console.log(`OS:             ${process.platform} (${process.arch})`);

    if (!fs.existsSync(EXE_PATH)) {
        throw new Error(`Executable nicht gefunden: ${EXE_PATH}. Bitte zuerst das Paket bauen.`);
    }

    const testRunId = `run_${Date.now()}`;
    const tempOutputDir = path.resolve(ROOT_DIR, 'dist', 'win-unpacked', `test_out_${testRunId}`);
    fs.mkdirSync(tempOutputDir, { recursive: true });

    const tempProfile = path.resolve(process.env.TEMP || 'C:\\temp', `wlink-profile-${testRunId}`);
    fs.mkdirSync(tempProfile, { recursive: true });

    // Fixtures einlesen und vorbereiten (Node-Ebene)
    const fixture32Path = path.resolve(FIXTURES_DIR, 'independent_pygaeb_da32.x83');
    const fixture33Path = path.resolve(FIXTURES_DIR, 'valid_schema_reference.x83');
    const xmlFixture32 = fs.readFileSync(fixture32Path, 'utf-8');
    const xmlFixture33 = fs.readFileSync(fixture33Path, 'utf-8');
    const parsedFixture32 = GAEBEngine.parseGAEBXML(xmlFixture32);
    const parsedFixture33 = GAEBEngine.parseGAEBXML(xmlFixture33);

    console.log('\n[1/4] Starte W-Link ERP.exe im echten Paketmodus mit V8-Inspector...');
    const child = spawn(EXE_PATH, ['--inspect=9229', `--user-data-dir=${tempProfile}`], {
        stdio: 'ignore'
    });

    const report = {
        meta: {
            timestamp: new Date().toISOString(),
            testRunId,
            os: `${process.platform} (${process.arch})`,
            nodeVersion: process.version,
            exePath: EXE_PATH,
            resourcesPath: RESOURCES_DIR,
            asarPath: ASAR_PATH
        },
        level1_runtime: {},
        level2_xsd_service: {},
        level3_handler_integration: {}
    };

    let ws = null;

    try {
        // Verbinde mit dem V8-Inspector des Hauptprozesses
        let wsUrl = null;
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 500));
            try {
                const res = await fetch('http://127.0.0.1:9229/json');
                const list = await res.json();
                if (list && list.length > 0 && list[0].webSocketDebuggerUrl) {
                    wsUrl = list[0].webSocketDebuggerUrl;
                    break;
                }
            } catch (_) {}
        }

        if (!wsUrl) {
            throw new Error('Verbindung zum V8-Inspector von W-Link ERP.exe fehlgeschlagen.');
        }

        ws = new WebSocket(wsUrl);
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('WebSocket-Verbindungstimeout')), 10000);
            ws.onopen = () => { clearTimeout(timeout); resolve(); };
            ws.onerror = (e) => { clearTimeout(timeout); reject(e); };
        });

        // Warte kurz bis Electron das Hauptfenster geladen hat und der Ausführungskontext stabil ist
        await new Promise(r => setTimeout(r, 2500));

        function evaluateInMain(expression) {
            return new Promise((resolve, reject) => {
                const id = Math.floor(Math.random() * 1000000);
                const timeout = setTimeout(() => {
                    reject(new Error('Timeout bei evaluateInMain (10s überschritten)'));
                }, 10000);

                const handler = (event) => {
                    const data = JSON.parse(event.data);
                    if (data.id === id) {
                        clearTimeout(timeout);
                        ws.removeEventListener('message', handler);
                        if (data.error) {
                            reject(new Error(JSON.stringify(data.error)));
                        } else if (data.result && data.result.result) {
                            if (data.result.result.subtype === 'error') {
                                reject(new Error(data.result.result.description || 'Evaluation error'));
                            } else {
                                resolve(data.result.result.value !== undefined ? data.result.result.value : data.result.result);
                            }
                        } else {
                            resolve(data);
                        }
                    }
                };
                ws.addEventListener('message', handler);
                ws.send(JSON.stringify({
                    id,
                    method: 'Runtime.evaluate',
                    params: {
                        expression,
                        returnByValue: true,
                        awaitPromise: true
                    }
                }));
            });
        }

        // =============================================================
        // EBENE 1: Echte Paketlaufzeit und Ressourcen
        // =============================================================
        console.log('\n--- EBENE 1: ECHTE PAKETLAUFZEIT UND RESSOURCEN ---');
        const runtimeInfo = await evaluateInMain(`(async () => {
            const req = process.mainModule.require;
            const { app } = req('electron');
            const path = req('path');
            const fs = req('fs');

            let libxmlPath = null;
            try {
                const { createRequire } = req('module');
                const valPath = path.join(process.resourcesPath, 'app.asar', 'main', 'services', 'gaeb-x84-schema-validator.js');
                libxmlPath = createRequire(valPath).resolve('libxmljs2');
            } catch (e) {
                libxmlPath = 'error: ' + e.message;
            }

            const schema32Dir = path.join(process.resourcesPath, 'schemas', 'gaeb_da_xml_3.2');
            const schema33Dir = path.join(process.resourcesPath, 'schemas', 'gaeb_da_xml_3.3');

            return {
                isPackaged: app.isPackaged,
                resourcesPath: process.resourcesPath,
                appPath: app.getAppPath(),
                execPath: process.execPath,
                electronVersion: process.versions.electron,
                nodeVersion: process.versions.node,
                libxmlModulePath: libxmlPath,
                schema32Exists: fs.existsSync(schema32Dir),
                schema33Exists: fs.existsSync(schema33Dir),
                schema32MainExists: fs.existsSync(path.join(schema32Dir, 'GAEB_DA_XML_84_3.2_2013-10.xsd')),
                schema32LibExists: fs.existsSync(path.join(schema32Dir, 'GAEB_DA_XML_Lib_3.2_2013-10.xsd')),
                schema33MainExists: fs.existsSync(path.join(schema33Dir, 'GAEB_DA_XML_84_3.3_2021-05.xsd')),
                schema33LibExists: fs.existsSync(path.join(schema33Dir, 'GAEB_DA_XML_Lib_3.3_2021-05.xsd'))
            };
        })()`);

        report.level1_runtime = runtimeInfo;
        console.log('  app.isPackaged:       ', runtimeInfo.isPackaged);
        console.log('  resourcesPath:        ', runtimeInfo.resourcesPath);
        console.log('  appPath:              ', runtimeInfo.appPath);
        console.log('  Electron-Version:     ', runtimeInfo.electronVersion);
        console.log('  libxmljs2-Herkunft:   ', runtimeInfo.libxmlModulePath);
        console.log('  Schemas vorhanden:    ', runtimeInfo.schema32MainExists && runtimeInfo.schema33MainExists);

        if (!runtimeInfo.isPackaged) {
            throw new Error('FEHLER: app.isPackaged ist false! Es muss das echte Paket getestet werden.');
        }
        if (!runtimeInfo.libxmlModulePath.includes('app.asar')) {
            throw new Error(`FEHLER: libxmljs2 wurde nicht aus dem ASAR geladen: ${runtimeInfo.libxmlModulePath}`);
        }

        // =============================================================
        // EBENE 2: XSD-Service-Validierung im Paket
        // =============================================================
        console.log('\n--- EBENE 2: XSD-SERVICE-VALIDIERUNG IM PAKET ---');

        // 2.1: GAEB 3.2 gültig
        console.log('  [2.1] GAEB 3.2 gültiger Entwurf -> XML erzeugen und XSD prüfen...');
        const targetFile32 = path.resolve(tempOutputDir, 'gaeb_32_valid.x84');
        const res32Valid = await evaluateInMain(`(async () => {
            const req = process.mainModule.require;
            const Database = req('./db').db.constructor;
            const { createSchema } = req('./schema');
            const { initGaebSchema } = req('./db/schema/gaeb_schema');
            const { saveX83Import } = req('./db/repositories/gaeb_repository');
            const { createTenderDraft, saveTenderDraft, loadTenderDraft } = req('./db/repositories/gaeb_tender_repo');
            const { exportTenderDraftToX84 } = req('./js/gaeb_x84');
            const GAEBEngine = req('./js/gaeb');
            const { validateXML } = req('./main/services/gaeb-x84-schema-validator');

            const db = new Database(':memory:');
            createSchema(db);
            initGaebSchema(db);

            const rawXml = ${JSON.stringify(xmlFixture32)};
            const parsed = GAEBEngine.parseGAEBXML(rawXml);
            const saveRes = saveX83Import(db, parsed, {
                fileName: 'independent_pygaeb_da32.x83',
                rawBytes: Buffer.from(rawXml, 'utf-8'),
                rawXml
            });

            const draft = createTenderDraft(db, saveRes.importId, { name: 'Ebene2 Test 3.2' });
            const loadedDraft = loadTenderDraft(db, draft.id);
            const prices = loadedDraft.items.map(it => {
                if (it.isHinweistext) return null;
                const isTbd = Boolean(it.isQtyTBD || it.menge === null);
                return {
                    gaeb_item_id: it._dbId,
                    unit_price: 35.00,
                    in_total: isTbd ? 0 : 1
                };
            }).filter(Boolean);

            saveTenderDraft(db, draft.id, { name: 'Ebene2 Test 3.2 Bepreist', prices });
            const exportRes = exportTenderDraftToX84(db, draft.id, {
                bidder: { name1: 'Musterfirma 3.2 GmbH', city: 'Berlin' }
            });

            const valRes = validateXML(exportRes.xml, '3.2');
            db.close();

            return {
                valid: valRes.valid,
                errors: valRes.errors,
                xmlLength: exportRes.xml ? exportRes.xml.length : 0,
                hasCorrectNamespace: exportRes.xml ? exportRes.xml.includes('http://www.gaeb.de/GAEB_DA_XML/DA84/3.2') : false
            };
        })()`);
        report.level2_xsd_service.case_32_valid = res32Valid;
        console.log(`    Validierung: ${res32Valid.valid ? 'BESTANDEN (0 Fehler)' : 'FEHLGESCHLAGEN: ' + res32Valid.errors.join(', ')}`);
        if (!res32Valid.valid || !res32Valid.hasCorrectNamespace) {
            throw new Error(`Ebene 2.1 fehlgeschlagen: ${JSON.stringify(res32Valid)}`);
        }

        // 2.2: GAEB 3.3 gültig
        console.log('  [2.2] GAEB 3.3 gültiger Entwurf -> XML erzeugen und XSD prüfen...');
        const res33Valid = await evaluateInMain(`(async () => {
            const req = process.mainModule.require;
            const Database = req('./db').db.constructor;
            const { createSchema } = req('./schema');
            const { initGaebSchema } = req('./db/schema/gaeb_schema');
            const { saveX83Import } = req('./db/repositories/gaeb_repository');
            const { createTenderDraft, saveTenderDraft, loadTenderDraft } = req('./db/repositories/gaeb_tender_repo');
            const { exportTenderDraftToX84 } = req('./js/gaeb_x84');
            const GAEBEngine = req('./js/gaeb');
            const { validateXML } = req('./main/services/gaeb-x84-schema-validator');

            const db = new Database(':memory:');
            createSchema(db);
            initGaebSchema(db);

            const rawXml = ${JSON.stringify(xmlFixture33)};
            const parsed = GAEBEngine.parseGAEBXML(rawXml);
            const saveRes = saveX83Import(db, parsed, {
                fileName: 'valid_schema_reference.x83',
                rawBytes: Buffer.from(rawXml, 'utf-8'),
                rawXml
            });

            const draft = createTenderDraft(db, saveRes.importId, { name: 'Ebene2 Test 3.3' });
            const loadedDraft = loadTenderDraft(db, draft.id);
            const prices = loadedDraft.items.map(it => ({
                gaeb_item_id: it._dbId,
                unit_price: 25.00,
                in_total: 1
            }));

            saveTenderDraft(db, draft.id, { name: 'Ebene2 Test 3.3 Bepreist', prices });
            const exportRes = exportTenderDraftToX84(db, draft.id, {
                bidder: { name1: 'Musterfirma 3.3 GmbH', city: 'Hamburg' }
            });

            const valRes = validateXML(exportRes.xml, '3.3');
            db.close();

            return {
                valid: valRes.valid,
                errors: valRes.errors,
                xmlLength: exportRes.xml ? exportRes.xml.length : 0,
                hasCorrectNamespace: exportRes.xml ? exportRes.xml.includes('http://www.gaeb.de/GAEB_DA_XML/DA84/3.3') : false
            };
        })()`);
        report.level2_xsd_service.case_33_valid = res33Valid;
        console.log(`    Validierung: ${res33Valid.valid ? 'BESTANDEN (0 Fehler)' : 'FEHLGESCHLAGEN: ' + res33Valid.errors.join(', ')}`);
        if (!res33Valid.valid || !res33Valid.hasCorrectNamespace) {
            throw new Error(`Ebene 2.2 fehlgeschlagen: ${JSON.stringify(res33Valid)}`);
        }

        // 2.3: Wohlgeformtes, aber XSD-ungültiges XML (3.2 & 3.3)
        console.log('  [2.3] Wohlgeformtes XML mit unzulässiger Struktur (3.2 & 3.3)...');
        const resInvalidStructure = await evaluateInMain(`(async () => {
            const req = process.mainModule.require;
            const { validateXML } = req('./main/services/gaeb-x84-schema-validator');

            // XML ist syntaktisch wohlgeformt, verletzt aber XSD-Strukturregeln
            const wellFormedInvalidXml32 = '<?xml version="1.0" encoding="utf-8"?>' +
                '<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA84/3.2">' +
                '<GAEBInfo><Version>3.2</Version><Date>2026-10-01</Date></GAEBInfo>' +
                '</GAEB>';

            const wellFormedInvalidXml33 = '<?xml version="1.0" encoding="utf-8"?>' +
                '<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA84/3.3">' +
                '<GAEBInfo><Version>3.3</Version><Date>2026-10-01</Date></GAEBInfo>' +
                '</GAEB>';

            return {
                res32: validateXML(wellFormedInvalidXml32, '3.2'),
                res33: validateXML(wellFormedInvalidXml33, '3.3')
            };
        })()`);
        report.level2_xsd_service.case_invalid_structure = resInvalidStructure;
        console.log(`    3.2 Ungültig abgewiesen: ${!resInvalidStructure.res32.valid} (${resInvalidStructure.res32.errors[0]})`);
        console.log(`    3.3 Ungültig abgewiesen: ${!resInvalidStructure.res33.valid} (${resInvalidStructure.res33.errors[0]})`);
        if (resInvalidStructure.res32.valid || resInvalidStructure.res33.valid) {
            throw new Error('Ebene 2.3 fehlgeschlagen: Ungültige Struktur wurde fälschlicherweise akzeptiert.');
        }

        // 2.4: Versionen und Namespaces
        console.log('  [2.4] Ungültige Versionen & falscher Namespace...');
        const resVersionsNs = await evaluateInMain(`(async () => {
            const req = process.mainModule.require;
            const { validateXML } = req('./main/services/gaeb-x84-schema-validator');

            const validSample33 = '<?xml version="1.0" encoding="utf-8"?>' +
                '<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA84/3.3">' +
                '<GAEBInfo><Version>3.3</Version><VersDate>2021-05</VersDate></GAEBInfo>' +
                '<Award><BoQ><BoQBody/></BoQ></Award>' +
                '</GAEB>';

            const validSample32 = '<?xml version="1.0" encoding="utf-8"?>' +
                '<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA84/3.2">' +
                '<GAEBInfo><Version>3.2</Version><VersDate>2013-10</VersDate></GAEBInfo>' +
                '<Award><BoQ><BoQBody/></BoQ></Award>' +
                '</GAEB>';

            return {
                unsupported31: validateXML(validSample33, '3.1'),
                unsupported99: validateXML(validSample33, '9.9'),
                unsupportedNull: validateXML(validSample33, null),
                mismatch32as33: validateXML(validSample32, '3.3'),
                mismatch33as32: validateXML(validSample33, '3.2'),
                foreignNs: validateXML(validSample33.replace('DA84/3.3', 'DA84/Foreign'), '3.3')
            };
        })()`);
        report.level2_xsd_service.case_versions_ns = resVersionsNs;
        console.log(`    Version '3.1' abgewiesen: ${!resVersionsNs.unsupported31.valid}`);
        console.log(`    Version '9.9' abgewiesen: ${!resVersionsNs.unsupported99.valid}`);
        console.log(`    Namespace Mismatch 3.2->3.3: ${!resVersionsNs.mismatch32as33.valid}`);
        console.log(`    Fremder Namespace: ${!resVersionsNs.foreignNs.valid}`);
        if (resVersionsNs.unsupported31.valid || resVersionsNs.unsupported99.valid ||
            resVersionsNs.mismatch32as33.valid || resVersionsNs.foreignNs.valid) {
            throw new Error('Ebene 2.4 fehlgeschlagen: Ungültige Versionen/Namespaces wurden akzeptiert.');
        }

        // =============================================================
        // EBENE 3: Handler-Integrationstest des tatsächlichen IPC-Handlers
        // =============================================================
        console.log('\n--- EBENE 3: HANDLER-INTEGRATIONSTEST (gaeb:export-x84) ---');

        // 3.1: Ungültiges XML durch den tatsächlich registrierten Handler
        console.log('  [3.1] Ungültiges XML durch den tatsächlich registrierten gaeb:export-x84-Handler...');
        const targetHandlerInvalidFile = path.resolve(tempOutputDir, 'handler_invalid_export.x84');
        const resHandlerInvalid = await evaluateInMain(`(async () => {
            const req = process.mainModule.require;
            const { ipcMain, dialog } = req('electron');
            const path = req('path');
            const asarPath = path.join(process.resourcesPath, 'app.asar');
            const gaebX84 = req(path.join(asarPath, 'js', 'gaeb_x84'));
            const { saveX83Import } = req(path.join(asarPath, 'db', 'repositories', 'gaeb_repository'));
            const { createTenderDraft, saveTenderDraft, loadTenderDraft } = req(path.join(asarPath, 'db', 'repositories', 'gaeb_tender_repo'));
            const fs = req('fs');

            const db = req(path.join(asarPath, 'db')).db;

            const parsed = ${JSON.stringify(parsedFixture33)};
            const saveRes = saveX83Import(db, parsed, {
                fileName: 'handler_test_33.x83',
                rawBytes: Buffer.from("fixture33"),
                rawXml: "fixture33"
            });

            const draft = createTenderDraft(db, saveRes.importId, { name: 'Handler Test Draft' });
            const loadedDraft = loadTenderDraft(db, draft.id);
            const prices = loadedDraft.items.map(it => ({
                gaeb_item_id: it._dbId,
                unit_price: 50.00,
                in_total: 1
            }));
            saveTenderDraft(db, draft.id, { name: 'Handler Test Draft Bepreist', prices });

            // Greife auf den echten, produktiv registrierten Handler zu
            const handler = ipcMain._invokeHandlers.get('gaeb:export-x84');
            if (typeof handler !== 'function') {
                return { error: 'gaeb:export-x84 ist nicht auf ipcMain registriert!' };
            }

            // Test-Zieldatei
            const targetPath = ${JSON.stringify(targetHandlerInvalidFile)};
            if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);

            // Speichere Originale für sauberes Restore in finally
            const origShowSaveDialog = dialog.showSaveDialog;
            const origExportMethod = gaebX84.exportTenderDraftToX84;

            try {
                // Simulierter Dialog-Handler im Testprozess: gibt den Pfad frei
                dialog.showSaveDialog = async () => ({ canceled: false, filePath: targetPath });

                // Manipuliere die XML-Erzeugung zu wohlgeformtem, aber XSD-ungültigem XML
                gaebX84.exportTenderDraftToX84 = (...args) => {
                    const realResult = origExportMethod(...args);
                    // Füge ein unzulässiges Kind-Element in GAEBInfo ein:
                    const invalidXml = realResult.xml.replace(
                        '</GAEBInfo>',
                        '<UnzulaessigesElement>Ungueltig</UnzulaessigesElement></GAEBInfo>'
                    );
                    return {
                        ...realResult,
                        xml: invalidXml
                    };
                };

                // Rufe den echten produktiven Handler auf
                let handlerResult = null;
                let handlerError = null;
                try {
                    handlerResult = await handler({}, { draftId: draft.id });
                } catch (err) {
                    handlerError = { message: err.message, stack: err.stack };
                }

                return {
                    handlerResult,
                    handlerError,
                    targetFileExists: fs.existsSync(targetPath)
                };
            } finally {
                // RESTORE in finally
                dialog.showSaveDialog = origShowSaveDialog;
                gaebX84.exportTenderDraftToX84 = origExportMethod;
            }
        })()`);

        report.level3_handler_integration.case_invalid_xml = resHandlerInvalid;
        console.log('    Handler Result:', resHandlerInvalid.handlerResult);
        if (resHandlerInvalid.handlerError) console.log('    Handler Error:', resHandlerInvalid.handlerError);
        console.log(`    Erfolg abgelehnt:     ${resHandlerInvalid.handlerResult?.success === false}`);
        console.log(`    Fehlermeldung XSD:    ${resHandlerInvalid.handlerResult?.error?.includes('XSD-Validierung')}`);
        console.log(`    Datei NICHT erzeugt:  ${!resHandlerInvalid.targetFileExists}`);

        if (resHandlerInvalid.handlerResult?.success !== false || resHandlerInvalid.targetFileExists) {
            throw new Error(`Ebene 3.1 fehlgeschlagen: Der produktive Handler hat ungültiges XML nicht abgelehnt oder eine Datei geschrieben.`);
        }

        // 3.2: Fall valid: false mit leerer Fehlerliste
        console.log('  [3.2] Fall valid: false mit leerer Fehlerliste im produktiven Handler...');
        const targetEmptyErrorsFile = path.resolve(tempOutputDir, 'handler_empty_errors.x84');
        const resEmptyErrors = await evaluateInMain(`(async () => {
            const req = process.mainModule.require;
            const { ipcMain, dialog } = req('electron');
            const path = req('path');
            const asarPath = path.join(process.resourcesPath, 'app.asar');
            const { saveX83Import } = req(path.join(asarPath, 'db', 'repositories', 'gaeb_repository'));
            const { createTenderDraft, saveTenderDraft, loadTenderDraft } = req(path.join(asarPath, 'db', 'repositories', 'gaeb_tender_repo'));
            const validatorService = req(path.join(asarPath, 'main', 'services', 'gaeb-x84-schema-validator'));
            const fs = req('fs');

            const db = req(path.join(asarPath, 'db')).db;

            const parsed = ${JSON.stringify(parsedFixture33)};
            const saveRes = saveX83Import(db, parsed, {
                fileName: 'handler_test_empty_err.x83',
                rawBytes: Buffer.from("fixture33"),
                rawXml: "fixture33"
            });

            const draft = createTenderDraft(db, saveRes.importId, { name: 'Empty Errors Draft' });
            const loadedDraft = loadTenderDraft(db, draft.id);
            const prices = loadedDraft.items.map(it => ({
                gaeb_item_id: it._dbId,
                unit_price: 15.00,
                in_total: 1
            }));
            saveTenderDraft(db, draft.id, { name: 'Empty Errors Draft Bepreist', prices });

            const handler = ipcMain._invokeHandlers.get('gaeb:export-x84');
            const targetPath = ${JSON.stringify(targetEmptyErrorsFile)};
            if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);

            const origShowSaveDialog = dialog.showSaveDialog;
            const origValidateXML = validatorService.validateXML;

            try {
                dialog.showSaveDialog = async () => ({ canceled: false, filePath: targetPath });
                // Simuliere valid: false mit leerer Fehlerliste
                validatorService.validateXML = () => ({ valid: false, errors: [] });

                const handlerResult = await handler({}, { draftId: draft.id });
                return {
                    handlerResult,
                    targetFileExists: fs.existsSync(targetPath)
                };
            } finally {
                dialog.showSaveDialog = origShowSaveDialog;
                validatorService.validateXML = origValidateXML;
            }
        })()`);

        report.level3_handler_integration.case_empty_errors = resEmptyErrors;
        console.log(`    Erfolg abgelehnt bei leeren Fehlern: ${resEmptyErrors.handlerResult?.success === false}`);
        console.log(`    Datei NICHT erzeugt:                 ${!resEmptyErrors.targetFileExists}`);
        if (resEmptyErrors.handlerResult?.success !== false || resEmptyErrors.targetFileExists) {
            throw new Error(`Ebene 3.2 fehlgeschlagen: Handler schrieb Datei bei valid: false.`);
        }

        // 3.3: Simulierter Dialog-Abbruch im produktiven Handler (mit Integritätscheck)
        console.log('  [3.3] Simulierter Dialog-Abbruch im produktiven Handler (Integritätsprüfung)...');
        const preExistingFile = path.resolve(tempOutputDir, 'pre_existing_handler_file.txt');
        const preExistingContent = 'ORIGINAL_UNVERAENDERT_' + Date.now();
        fs.writeFileSync(preExistingFile, preExistingContent, 'utf-8');
        const preStatBefore = fs.statSync(preExistingFile);

        const resHandlerCancel = await evaluateInMain(`(async () => {
            const req = process.mainModule.require;
            const { ipcMain, dialog } = req('electron');
            const path = req('path');
            const asarPath = path.join(process.resourcesPath, 'app.asar');
            const { saveX83Import } = req(path.join(asarPath, 'db', 'repositories', 'gaeb_repository'));
            const { createTenderDraft, saveTenderDraft, loadTenderDraft } = req(path.join(asarPath, 'db', 'repositories', 'gaeb_tender_repo'));
            const db = req(path.join(asarPath, 'db')).db;

            const parsed = ${JSON.stringify(parsedFixture33)};
            const saveRes = saveX83Import(db, parsed, {
                fileName: 'handler_test_cancel.x83',
                rawBytes: Buffer.from("fixture33"),
                rawXml: "fixture33"
            });

            const draft = createTenderDraft(db, saveRes.importId, { name: 'Cancel Draft' });
            const loadedDraft = loadTenderDraft(db, draft.id);
            const prices = loadedDraft.items.map(it => ({
                gaeb_item_id: it._dbId,
                unit_price: 20.00,
                in_total: 1
            }));
            saveTenderDraft(db, draft.id, { name: 'Cancel Draft Bepreist', prices });

            const handler = ipcMain._invokeHandlers.get('gaeb:export-x84');
            const origShowSaveDialog = dialog.showSaveDialog;

            try {
                // Dialog liefert Abbruch
                dialog.showSaveDialog = async () => ({ canceled: true, filePath: undefined });
                const handlerResult = await handler({}, { draftId: draft.id });
                return { handlerResult };
            } finally {
                dialog.showSaveDialog = origShowSaveDialog;
            }
        })()`);

        const preContentAfter = fs.readFileSync(preExistingFile, 'utf-8');
        const preStatAfter = fs.statSync(preExistingFile);
        const cancelSuccess = resHandlerCancel.handlerResult?.canceled === true &&
                              preContentAfter === preExistingContent &&
                              preStatBefore.mtimeMs === preStatAfter.mtimeMs;

        report.level3_handler_integration.case_dialog_cancel = {
            result: resHandlerCancel.handlerResult,
            fileUntouched: preContentAfter === preExistingContent
        };
        console.log(`    Handler liefert canceled: true:       ${resHandlerCancel.handlerResult?.canceled === true}`);
        console.log(`    Bestehende Datei byte-identisch:      ${preContentAfter === preExistingContent}`);
        if (!cancelSuccess) {
            throw new Error(`Ebene 3.3 fehlgeschlagen: Dialog-Abbruch im Handler fehlerhaft.`);
        }

        // 3.4: Erfolgreicher Export durch den produktiven Handler
        console.log('  [3.4] Vollständiger erfolgreicher Export durch den produktiven Handler...');
        const targetHandlerSuccessFile = path.resolve(tempOutputDir, 'handler_success_export.x84');
        const resHandlerSuccess = await evaluateInMain(`(async () => {
            const req = process.mainModule.require;
            const { ipcMain, dialog } = req('electron');
            const path = req('path');
            const asarPath = path.join(process.resourcesPath, 'app.asar');
            const { saveX83Import } = req(path.join(asarPath, 'db', 'repositories', 'gaeb_repository'));
            const { createTenderDraft, saveTenderDraft, loadTenderDraft } = req(path.join(asarPath, 'db', 'repositories', 'gaeb_tender_repo'));
            const { validateXML } = req(path.join(asarPath, 'main', 'services', 'gaeb-x84-schema-validator'));
            const fs = req('fs');

            const db = req(path.join(asarPath, 'db')).db;

            const parsed = ${JSON.stringify(parsedFixture33)};
            const saveRes = saveX83Import(db, parsed, {
                fileName: 'handler_test_success.x83',
                rawBytes: Buffer.from("fixture33"),
                rawXml: "fixture33"
            });

            const draft = createTenderDraft(db, saveRes.importId, { name: 'Success Draft' });
            const loadedDraft = loadTenderDraft(db, draft.id);
            const prices = loadedDraft.items.map(it => ({
                gaeb_item_id: it._dbId,
                unit_price: 25.00,
                in_total: 1
            }));
            saveTenderDraft(db, draft.id, { name: 'Success Draft Bepreist', prices });

            const handler = ipcMain._invokeHandlers.get('gaeb:export-x84');
            const targetPath = ${JSON.stringify(targetHandlerSuccessFile)};
            if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);

            const origShowSaveDialog = dialog.showSaveDialog;

            try {
                dialog.showSaveDialog = async () => ({ canceled: false, filePath: targetPath });
                const handlerResult = await handler({}, { draftId: draft.id });

                let fileReValidation = null;
                if (fs.existsSync(targetPath)) {
                    const writtenXml = fs.readFileSync(targetPath, 'utf-8');
                    fileReValidation = validateXML(writtenXml, handlerResult.gaebVersion || '3.3');
                }

                return {
                    handlerResult,
                    targetFileExists: fs.existsSync(targetPath),
                    fileSize: fs.existsSync(targetPath) ? fs.statSync(targetPath).size : 0,
                    fileReValidation
                };
            } finally {
                dialog.showSaveDialog = origShowSaveDialog;
            }
        })()`);

        report.level3_handler_integration.case_success_export = resHandlerSuccess;
        console.log(`    Handler Erfolg:              ${resHandlerSuccess.handlerResult?.success === true}`);
        console.log(`    Datei geschrieben:           ${resHandlerSuccess.targetFileExists} (${resHandlerSuccess.fileSize} Bytes)`);
        console.log(`    Re-Validierung der Datei:    ${resHandlerSuccess.fileReValidation?.valid ? '0 Fehler' : 'Fehler'}`);

        if (!resHandlerSuccess.handlerResult?.success || !resHandlerSuccess.targetFileExists || !resHandlerSuccess.fileReValidation?.valid) {
            throw new Error(`Ebene 3.4 fehlgeschlagen: Erfolgreicher Handler-Export fehlerhaft.`);
        }

        ws.close();
    } finally {
        child.kill();
        await new Promise(r => setTimeout(r, 1000));
        try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (_) {}
    }

    // =============================================================
    // EBENE 2 ZUSATZ: Fehlendes Schema und Include in isolierter Kopie
    // =============================================================
    console.log('\n--- EBENE 2 ZUSATZ: ISOLIERTE KOPIE (FEHLENDES SCHEMA & INCLUDE) ---');
    const isolatedPackageDir = path.resolve(ROOT_DIR, 'dist', `win-unpacked-iso-${Date.now()}`);
    console.log(`  Erstelle isolierte Kopie des Pakets nach: ${isolatedPackageDir}`);
    fs.cpSync(path.resolve(ROOT_DIR, 'dist', 'win-unpacked'), isolatedPackageDir, { recursive: true });

    try {
        // Manipuliere 3.2: Hauptschema löschen
        const iso32MainXsd = path.join(isolatedPackageDir, 'resources', 'schemas', 'gaeb_da_xml_3.2', 'GAEB_DA_XML_84_3.2_2013-10.xsd');
        fs.unlinkSync(iso32MainXsd);

        // Manipuliere 3.3: Inkludiertes Schema löschen
        const iso33LibXsd = path.join(isolatedPackageDir, 'resources', 'schemas', 'gaeb_da_xml_3.3', 'GAEB_DA_XML_Lib_3.3_2021-05.xsd');
        fs.unlinkSync(iso33LibXsd);

        const isoExe = path.join(isolatedPackageDir, 'W-Link ERP.exe');
        const isoProfile = path.resolve(process.env.TEMP || 'C:\\temp', `wlink-iso-profile-${Date.now()}`);
        fs.mkdirSync(isoProfile, { recursive: true });

        console.log('  Starte W-Link ERP.exe aus isolierter Kopie mit manipulierten Schemas...');
        const isoChild = spawn(isoExe, ['--inspect=9230', `--user-data-dir=${isoProfile}`], { stdio: 'ignore' });

        try {
            let isoWsUrl = null;
            for (let i = 0; i < 30; i++) {
                await new Promise(r => setTimeout(r, 500));
                try {
                    const res = await fetch('http://127.0.0.1:9230/json');
                    const list = await res.json();
                    if (list && list.length > 0 && list[0].webSocketDebuggerUrl) {
                        isoWsUrl = list[0].webSocketDebuggerUrl;
                        break;
                    }
                } catch (_) {}
            }

            if (!isoWsUrl) throw new Error('Verbindung zum isolierten Testpaket fehlgeschlagen.');

            const isoWs = new WebSocket(isoWsUrl);
            await new Promise((resolve, reject) => {
                isoWs.onopen = resolve;
                isoWs.onerror = reject;
            });

            // Warte kurz bis Electron das Hauptfenster geladen hat
            await new Promise(r => setTimeout(r, 2500));

            function evaluateIso(expression) {
                return new Promise((resolve, reject) => {
                    const id = Math.floor(Math.random() * 1000000);
                    const handler = (event) => {
                        const data = JSON.parse(event.data);
                        if (data.id === id) {
                            isoWs.removeEventListener('message', handler);
                            if (data.error) reject(new Error(JSON.stringify(data.error)));
                            else if (data.result && data.result.result) {
                                if (data.result.result.subtype === 'error') {
                                    reject(new Error(data.result.result.description));
                                } else {
                                    resolve(data.result.result.value !== undefined ? data.result.result.value : data.result.result);
                                }
                            } else {
                                resolve(data);
                            }
                        }
                    };
                    isoWs.addEventListener('message', handler);
                    isoWs.send(JSON.stringify({
                        id,
                        method: 'Runtime.evaluate',
                        params: { expression, returnByValue: true, awaitPromise: true }
                    }));
                });
            }

            // Teste Aufruf der produktiven Service-Funktion bei fehlendem Hauptschema
            const isoServiceTest = await evaluateIso(`(async () => {
                const req = process.mainModule.require;
                const path = req('path');
                const asarPath = path.join(process.resourcesPath, 'app.asar');
                const { validateXML } = req(path.join(asarPath, 'main', 'services', 'gaeb-x84-schema-validator'));

                const sampleXml32 = '<?xml version="1.0" encoding="utf-8"?>' +
                    '<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA84/3.2">' +
                    '<GAEBInfo><Version>3.2</Version><VersDate>2013-10</VersDate></GAEBInfo>' +
                    '<Award><BoQ><BoQBody/></BoQ></Award>' +
                    '</GAEB>';

                const sampleXml33 = '<?xml version="1.0" encoding="utf-8"?>' +
                    '<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA84/3.3">' +
                    '<GAEBInfo><Version>3.3</Version><VersDate>2021-05</VersDate></GAEBInfo>' +
                    '<Award><BoQ><BoQBody/></BoQ></Award>' +
                    '</GAEB>';

                // 1. Fehlendes Hauptschema 3.2
                const resMissingMain32 = validateXML(sampleXml32, '3.2');

                // 2. Fehlender Include 3.3 (Hauptschema existiert, aber Lib-Include fehlt)
                const resMissingInclude33 = validateXML(sampleXml33, '3.3');

                return {
                    resMissingMain32,
                    resMissingInclude33
                };
            })()`);

            report.level2_xsd_service.isolated_missing_schemas = isoServiceTest;
            console.log(`    Fehlendes Hauptschema 3.2 abgewiesen: ${!isoServiceTest.resMissingMain32.valid}`);
            console.log(`    Fehlermeldung Hauptschema:            ${isoServiceTest.resMissingMain32.errors[0]}`);
            console.log(`    Fehlender Include 3.3 abgewiesen:     ${!isoServiceTest.resMissingInclude33.valid}`);
            console.log(`    Fehlermeldung Include:                ${isoServiceTest.resMissingInclude33.errors[0]}`);

            if (isoServiceTest.resMissingMain32.valid || !isoServiceTest.resMissingMain32.errors[0].includes('nicht gefunden')) {
                throw new Error('Ebene 2 Zusatz fehlgeschlagen: Fehlendes Hauptschema wurde nicht gemeldet.');
            }
            if (isoServiceTest.resMissingInclude33.valid || !isoServiceTest.resMissingInclude33.errors[0].includes('Fehler bei der XSD-Prüfung')) {
                throw new Error('Ebene 2 Zusatz fehlgeschlagen: Fehlender Include wurde nicht gemeldet.');
            }

            isoWs.close();
            isoChild.kill();
            await new Promise(r => setTimeout(r, 1000));
            try { fs.rmSync(isoProfile, { recursive: true, force: true }); } catch (_) {}
        } catch (e) {
            isoChild.kill();
            throw e;
        }
    } finally {
        console.log(`  Bereinige isolierte Testkopie: ${isolatedPackageDir}`);
        try { fs.rmSync(isolatedPackageDir, { recursive: true, force: true }); } catch (_) {}
        try { fs.rmSync(tempOutputDir, { recursive: true, force: true }); } catch (_) {}
    }

    const reportFile = path.resolve(ROOT_DIR, 'dist', 'win-unpacked', 'package_verification_report.json');
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf-8');
    console.log('\n================================================================');
    console.log('ALLE PRÜFUNGEN ERFOLGREICH BESTANDEN!');
    console.log(`Bericht geschrieben nach: ${reportFile}`);
    console.log('================================================================\n');
}

runRealPackageVerification().catch(err => {
    console.error('\nFATALER TESTFEHLER in runRealPackageVerification:', err);
    process.exit(1);
});
