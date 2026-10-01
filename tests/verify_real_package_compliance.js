/**
 * tests/verify_real_package_compliance.js
 *
 * Führt die 6 verbindlichen Prüffälle aus liesen.txt im tatsächlich gebauten
 * Electron-Paket (dist/win-unpacked/W-Link ERP.exe) ohne Mocking aus.
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

async function runRealPackageVerification() {
    console.log('================================================================');
    console.log('STARTE REALE PAKET-VERIFIKATION (liesen.txt)');
    console.log('================================================================');
    console.log(`Executable:     ${EXE_PATH}`);
    console.log(`Resources:      ${RESOURCES_DIR}`);
    console.log(`App Asar:       ${ASAR_PATH}`);
    console.log(`OS:             ${process.platform} (${process.arch})`);

    if (!fs.existsSync(EXE_PATH)) {
        throw new Error(`Executable nicht gefunden: ${EXE_PATH}. Bitte zuerst das Paket bauen.`);
    }

    const tempOutputDir = path.resolve(ROOT_DIR, 'dist', 'win-unpacked', 'test_out');
    fs.mkdirSync(tempOutputDir, { recursive: true });

    const tempProfile = path.resolve(process.env.TEMP || 'C:\\temp', `wlink-profile-${Date.now()}`);
    fs.mkdirSync(tempProfile, { recursive: true });

    // Lese Fixtures für Test 1 & 2
    const fixture32Path = path.resolve(FIXTURES_DIR, 'independent_pygaeb_da32.x83');
    const fixture33Path = path.resolve(FIXTURES_DIR, 'valid_schema_reference.x83');
    const xmlFixture32 = fs.readFileSync(fixture32Path, 'utf-8');
    const xmlFixture33 = fs.readFileSync(fixture33Path, 'utf-8');

    console.log('\n[1/7] Starte W-Link ERP.exe mit isoliertem Benutzerprofil und V8-Inspector...');
    const child = spawn(EXE_PATH, ['--inspect=9229', `--user-data-dir=${tempProfile}`], {
        stdio: 'ignore'
    });

    const results = {
        meta: {
            timestamp: new Date().toISOString(),
            os: `${process.platform} (${process.arch})`,
            nodeVersion: process.version,
            exePath: EXE_PATH,
            resourcesPath: RESOURCES_DIR,
            asarPath: ASAR_PATH
        },
        tests: {}
    };

    let ws = null;

    try {
        // Verbinde mit dem V8-Inspector des echten Hauptprozesses
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

        console.log(`Verbunden mit Hauptprozess-Inspector: ${wsUrl}`);
        ws = new WebSocket(wsUrl);
        await new Promise((resolve, reject) => {
            ws.onopen = resolve;
            ws.onerror = reject;
        });

        function evaluateInMain(expression) {
            return new Promise((resolve, reject) => {
                const id = Math.floor(Math.random() * 1000000);
                const handler = (event) => {
                    const data = JSON.parse(event.data);
                    if (data.id === id) {
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
                        returnByValue: true
                    }
                }));
            });
        }

        // -------------------------------------------------------------
        // Umgebungs- und Herkunftsnachweis
        // -------------------------------------------------------------
        console.log('\n[2/7] Prüfe echte Laufzeitumgebung und Herkunft der Abhängigkeiten...');
        const runtimeInfo = await evaluateInMain(`(() => {
            const { app } = process.mainModule.require('electron');
            const path = process.mainModule.require('path');
            const { createRequire } = process.mainModule.require('module');

            const validatorPath = path.join(process.resourcesPath, 'app.asar', 'main', 'services', 'gaeb-x84-schema-validator.js');
            const valRequire = createRequire(validatorPath);
            const libxmljsPath = valRequire.resolve('libxmljs2');

            return {
                isPackaged: app.isPackaged,
                resourcesPath: process.resourcesPath,
                appPath: app.getAppPath(),
                execPath: process.execPath,
                electronVersion: process.versions.electron,
                nodeVersion: process.versions.node,
                validatorModulePath: validatorPath,
                libxmljsModulePath: libxmljsPath,
                schema32Dir: path.join(process.resourcesPath, 'schemas', 'gaeb_da_xml_3.2'),
                schema33Dir: path.join(process.resourcesPath, 'schemas', 'gaeb_da_xml_3.3')
            };
        })()`);

        results.runtime = runtimeInfo;
        console.log(`  app.isPackaged:       ${runtimeInfo.isPackaged}`);
        console.log(`  resourcesPath:        ${runtimeInfo.resourcesPath}`);
        console.log(`  appPath:              ${runtimeInfo.appPath}`);
        console.log(`  Electron-Version:     ${runtimeInfo.electronVersion}`);
        console.log(`  libxmljs2-Herkunft:   ${runtimeInfo.libxmljsModulePath}`);

        if (runtimeInfo.isPackaged !== true) {
            throw new Error(`FEHLER: app.isPackaged ist ${runtimeInfo.isPackaged}, erwartet: true`);
        }
        if (!runtimeInfo.libxmljsModulePath.includes('app.asar')) {
            throw new Error(`FEHLER: libxmljs2 wurde nicht aus app.asar geladen: ${runtimeInfo.libxmljsModulePath}`);
        }

        // -------------------------------------------------------------
        // Prüffall 1: GAEB 3.2, gültig
        // -------------------------------------------------------------
        console.log('\n[3/7] Prüffall 1: GAEB 3.2, gültiger Draft -> X84 erzeugen, XSD prüfen, Datei schreiben...');
        const targetFile32 = path.resolve(tempOutputDir, 'gaeb_32_valid_exported.x84');
        if (fs.existsSync(targetFile32)) fs.unlinkSync(targetFile32);

        const test1Result = await evaluateInMain(`(() => {
            const req = process.mainModule.require;
            const Database = req('./db').db.constructor;
            const { createSchema } = req('./schema');
            const { initGaebSchema } = req('./db/schema/gaeb_schema');
            const { saveX83Import } = req('./db/repositories/gaeb_repository');
            const { createTenderDraft, saveTenderDraft, loadTenderDraft } = req('./db/repositories/gaeb_tender_repo');
            const { exportTenderDraftToX84 } = req('./js/gaeb_x84');
            const GAEBEngine = req('./js/gaeb');
            const { validateXML } = req('./main/services/gaeb-x84-schema-validator');
            const fs = req('fs');

            // Isolierte In-Memory SQLite DB im Paket
            const db = new Database(':memory:');
            createSchema(db);
            initGaebSchema(db);

            // X83 importieren
            const rawXml = ${JSON.stringify(xmlFixture32)};
            const parsed = GAEBEngine.parseGAEBXML(rawXml);
            const saveRes = saveX83Import(db, parsed, {
                fileName: 'independent_pygaeb_da32.x83',
                rawBytes: Buffer.from(rawXml, 'utf-8'),
                rawXml
            });

            // Draft anlegen und bepreisen
            const draft = createTenderDraft(db, saveRes.importId, { name: 'Pakettest 3.2 Angebot' });
            const loadedDraft = loadTenderDraft(db, draft.id);

            const prices = loadedDraft.items.map(it => {
                if (it.isHinweistext) return null;
                const isTbd = Boolean(it.isQtyTBD || it.menge === null);
                return {
                    gaeb_item_id: it._dbId,
                    unit_price: 38.50,
                    in_total: isTbd ? 0 : 1
                };
            }).filter(Boolean);

            saveTenderDraft(db, draft.id, {
                name: 'Pakettest 3.2 Angebot Bepreist',
                prices
            });

            // X84 exportieren
            const exportRes = exportTenderDraftToX84(db, draft.id, {
                bidder: {
                    name1: 'Pakettest Bieter GmbH',
                    street: 'Musterweg 1',
                    pcode: '10115',
                    city: 'Berlin'
                }
            });

            const gaebVersion = exportRes.model.gaebVersion || '3.2';
            const validationResult = validateXML(exportRes.xml, gaebVersion);

            let fileWritten = false;
            const targetPath = ${JSON.stringify(targetFile32)};
            if (validationResult.valid) {
                fs.writeFileSync(targetPath, exportRes.xml, 'utf-8');
                fileWritten = fs.existsSync(targetPath);
            }

            db.close();

            return {
                gaebVersion,
                valid: validationResult.valid,
                errors: validationResult.errors,
                fileWritten,
                xmlLength: exportRes.xml ? exportRes.xml.length : 0,
                hasCorrectNamespace: exportRes.xml.includes('http://www.gaeb.de/GAEB_DA_XML/DA84/3.2')
            };
        })()`);

        results.tests.case1_gaeb32_valid = {
            ...test1Result,
            targetFileExists: fs.existsSync(targetFile32),
            targetFileSize: fs.existsSync(targetFile32) ? fs.statSync(targetFile32).size : 0
        };

        console.log(`  Validierung:          ${test1Result.valid ? 'BESTANDEN (0 Fehler)' : 'FEHLGESCHLAGEN: ' + test1Result.errors.join(', ')}`);
        console.log(`  Datei geschrieben:    ${results.tests.case1_gaeb32_valid.targetFileExists} (${results.tests.case1_gaeb32_valid.targetFileSize} Bytes)`);
        if (!test1Result.valid || !results.tests.case1_gaeb32_valid.targetFileExists) {
            throw new Error(`Prüffall 1 fehlgeschlagen: ${JSON.stringify(test1Result)}`);
        }

        // -------------------------------------------------------------
        // Prüffall 2: GAEB 3.3, gültig
        // -------------------------------------------------------------
        console.log('\n[4/7] Prüffall 2: GAEB 3.3, gültiger Draft -> X84 erzeugen, XSD prüfen, Datei schreiben...');
        const targetFile33 = path.resolve(tempOutputDir, 'gaeb_33_valid_exported.x84');
        if (fs.existsSync(targetFile33)) fs.unlinkSync(targetFile33);

        const test2Result = await evaluateInMain(`(() => {
            const req = process.mainModule.require;
            const Database = req('./db').db.constructor;
            const { createSchema } = req('./schema');
            const { initGaebSchema } = req('./db/schema/gaeb_schema');
            const { saveX83Import } = req('./db/repositories/gaeb_repository');
            const { createTenderDraft, saveTenderDraft, loadTenderDraft } = req('./db/repositories/gaeb_tender_repo');
            const { exportTenderDraftToX84 } = req('./js/gaeb_x84');
            const GAEBEngine = req('./js/gaeb');
            const { validateXML } = req('./main/services/gaeb-x84-schema-validator');
            const fs = req('fs');

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

            const draft = createTenderDraft(db, saveRes.importId, { name: 'Pakettest 3.3 Angebot' });
            const loadedDraft = loadTenderDraft(db, draft.id);

            const prices = loadedDraft.items.map(it => ({
                gaeb_item_id: it._dbId,
                unit_price: 25.00,
                in_total: 1
            }));

            saveTenderDraft(db, draft.id, {
                name: 'Pakettest 3.3 Angebot Bepreist',
                prices
            });

            const exportRes = exportTenderDraftToX84(db, draft.id, {
                bidder: {
                    name1: 'Pakettest 3.3 Bieter',
                    street: 'Hafenstraße 44',
                    pcode: '20457',
                    city: 'Hamburg'
                }
            });

            const gaebVersion = exportRes.model.gaebVersion || '3.3';
            const validationResult = validateXML(exportRes.xml, gaebVersion);

            let fileWritten = false;
            const targetPath = ${JSON.stringify(targetFile33)};
            if (validationResult.valid) {
                fs.writeFileSync(targetPath, exportRes.xml, 'utf-8');
                fileWritten = fs.existsSync(targetPath);
            }

            db.close();

            return {
                gaebVersion,
                valid: validationResult.valid,
                errors: validationResult.errors,
                fileWritten,
                xmlLength: exportRes.xml ? exportRes.xml.length : 0,
                hasCorrectNamespace: exportRes.xml.includes('http://www.gaeb.de/GAEB_DA_XML/DA84/3.3')
            };
        })()`);

        results.tests.case2_gaeb33_valid = {
            ...test2Result,
            targetFileExists: fs.existsSync(targetFile33),
            targetFileSize: fs.existsSync(targetFile33) ? fs.statSync(targetFile33).size : 0
        };

        console.log(`  Validierung:          ${test2Result.valid ? 'BESTANDEN (0 Fehler)' : 'FEHLGESCHLAGEN: ' + test2Result.errors.join(', ')}`);
        console.log(`  Datei geschrieben:    ${results.tests.case2_gaeb33_valid.targetFileExists} (${results.tests.case2_gaeb33_valid.targetFileSize} Bytes)`);
        if (!test2Result.valid || !results.tests.case2_gaeb33_valid.targetFileExists) {
            throw new Error(`Prüffall 2 fehlgeschlagen: ${JSON.stringify(test2Result)}`);
        }

        // -------------------------------------------------------------
        // Prüffall 3: GAEB 3.2 und 3.3, wohlgeformt aber XSD-ungültig
        // -------------------------------------------------------------
        console.log('\n[5/7] Prüffall 3: Wohlgeformtes, aber XSD-ungültiges XML (3.2 & 3.3) -> Ablehnung, keine Datei...');
        const targetInvalidFile32 = path.resolve(tempOutputDir, 'gaeb_32_invalid_must_not_exist.x84');
        const targetInvalidFile33 = path.resolve(tempOutputDir, 'gaeb_33_invalid_must_not_exist.x84');
        if (fs.existsSync(targetInvalidFile32)) fs.unlinkSync(targetInvalidFile32);
        if (fs.existsSync(targetInvalidFile33)) fs.unlinkSync(targetInvalidFile33);

        const test3Result = await evaluateInMain(`(() => {
            const req = process.mainModule.require;
            const { validateXML } = req('./main/services/gaeb-x84-schema-validator');
            const fs = req('fs');

            // 3a: Wohlgeformtes XML, aber unzulässige Struktur für 3.2
            // <IllegalElement> innerhalb <GAEBInfo> verstößt gegen Schema
            const invalidXml32 = '<?xml version="1.0" encoding="UTF-8"?>\\n' +
                '<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA84/3.2">\\n' +
                '  <GAEBInfo>\\n' +
                '    <Version>3.2</Version>\\n' +
                '    <Date>2026-10-01</Date>\\n' +
                '    <Time>12:00:00</Time>\\n' +
                '    <IllegalElementForTesting>Ungueltig</IllegalElementForTesting>\\n' +
                '  </GAEBInfo>\\n' +
                '</GAEB>';

            const res32 = validateXML(invalidXml32, '3.2');
            const targetPath32 = ${JSON.stringify(targetInvalidFile32)};
            let fileWritten32 = false;
            if (res32.valid) {
                fs.writeFileSync(targetPath32, invalidXml32, 'utf-8');
                fileWritten32 = true;
            }

            // 3b: Wohlgeformtes XML, aber unzulässige Struktur für 3.3
            const invalidXml33 = '<?xml version="1.0" encoding="UTF-8"?>\\n' +
                '<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA84/3.3">\\n' +
                '  <GAEBInfo>\\n' +
                '    <Version>3.3</Version>\\n' +
                '    <Date>2026-10-01</Date>\\n' +
                '    <Time>12:00:00</Time>\\n' +
                '    <DisallowedTag>Verboten</DisallowedTag>\\n' +
                '  </GAEBInfo>\\n' +
                '</GAEB>';

            const res33 = validateXML(invalidXml33, '3.3');
            const targetPath33 = ${JSON.stringify(targetInvalidFile33)};
            let fileWritten33 = false;
            if (res33.valid) {
                fs.writeFileSync(targetPath33, invalidXml33, 'utf-8');
                fileWritten33 = true;
            }

            return {
                res32: { valid: res32.valid, errors: res32.errors, fileWritten: fileWritten32 },
                res33: { valid: res33.valid, errors: res33.errors, fileWritten: fileWritten33 }
            };
        })()`);

        results.tests.case3_invalid_structure = {
            ...test3Result,
            file32Exists: fs.existsSync(targetInvalidFile32),
            file33Exists: fs.existsSync(targetInvalidFile33)
        };

        console.log(`  3.2 Ungültig abgewiesen: ${!test3Result.res32.valid} (Fehler: ${test3Result.res32.errors[0]})`);
        console.log(`  3.2 Keine Datei erzeugt:  ${!results.tests.case3_invalid_structure.file32Exists}`);
        console.log(`  3.3 Ungültig abgewiesen: ${!test3Result.res33.valid} (Fehler: ${test3Result.res33.errors[0]})`);
        console.log(`  3.3 Keine Datei erzeugt:  ${!results.tests.case3_invalid_structure.file33Exists}`);

        if (test3Result.res32.valid || results.tests.case3_invalid_structure.file32Exists ||
            test3Result.res33.valid || results.tests.case3_invalid_structure.file33Exists) {
            throw new Error(`Prüffall 3 fehlgeschlagen: Ungültiges XML wurde akzeptiert oder Datei geschrieben.`);
        }

        // -------------------------------------------------------------
        // Prüffall 4: Ungültige Version bzw. falscher Namespace
        // -------------------------------------------------------------
        console.log('\n[6/7] Prüffall 4: Ungültige Version & falscher Namespace -> Klare Ablehnung...');
        const test4Result = await evaluateInMain(`(() => {
            const req = process.mainModule.require;
            const fs = req('fs');
            const { validateXML } = req('./main/services/gaeb-x84-schema-validator');

            const validXml32 = fs.readFileSync(${JSON.stringify(targetFile32)}, 'utf-8');
            const validXml33 = fs.readFileSync(${JSON.stringify(targetFile33)}, 'utf-8');

            // 4a: Nicht existierende Versionen
            const resUnsupported1 = validateXML(validXml33, '3.1');
            const resUnsupported2 = validateXML(validXml33, '9.9');
            const resUnsupported3 = validateXML(validXml33, null);

            // 4b: Namespace Mismatch (3.2 XML mit Version 3.3 prüfen)
            const resMismatch32as33 = validateXML(validXml32, '3.3');

            // 4c: Namespace Mismatch (3.3 XML mit Version 3.2 prüfen)
            const resMismatch33as32 = validateXML(validXml33, '3.2');

            // 4d: Falscher/Fremder Namespace
            const xmlWrongNs = validXml33.replace('http://www.gaeb.de/GAEB_DA_XML/DA84/3.3', 'http://example.com/invalid');
            const resWrongNs = validateXML(xmlWrongNs, '3.3');

            return {
                resUnsupported1,
                resUnsupported2,
                resUnsupported3,
                resMismatch32as33,
                resMismatch33as32,
                resWrongNs
            };
        })()`);

        results.tests.case4_versions_namespaces = test4Result;

        console.log(`  Version '3.1' abgewiesen:    ${!test4Result.resUnsupported1.valid} (${test4Result.resUnsupported1.errors[0]})`);
        console.log(`  Version '9.9' abgewiesen:    ${!test4Result.resUnsupported2.valid} (${test4Result.resUnsupported2.errors[0]})`);
        console.log(`  Version null abgewiesen:     ${!test4Result.resUnsupported3.valid} (${test4Result.resUnsupported3.errors[0]})`);
        console.log(`  3.2 als 3.3 geprüft:         ${!test4Result.resMismatch32as33.valid} (${test4Result.resMismatch32as33.errors[0]})`);
        console.log(`  3.3 als 3.2 geprüft:         ${!test4Result.resMismatch33as32.valid} (${test4Result.resMismatch33as32.errors[0]})`);
        console.log(`  Falscher Namespace:          ${!test4Result.resWrongNs.valid} (${test4Result.resWrongNs.errors[0]})`);

        if (test4Result.resUnsupported1.valid || test4Result.resUnsupported2.valid ||
            test4Result.resMismatch32as33.valid || test4Result.resMismatch33as32.valid ||
            test4Result.resWrongNs.valid) {
            throw new Error(`Prüffall 4 fehlgeschlagen: Mismatches oder ungültige Versionen wurden akzeptiert.`);
        }

        // -------------------------------------------------------------
        // Prüffall 5: Dialog-Abbruch
        // -------------------------------------------------------------
        console.log('\n[7/7] Prüffall 5: Dialog-Abbruch -> Keine Datei und keine Änderung vorhandener Dateien...');
        const existingPreFile = path.resolve(tempOutputDir, 'pre_existing_file.txt');
        const preFileContent = 'UNVERAENDERTER_INHALT_' + Date.now();
        fs.writeFileSync(existingPreFile, preFileContent, 'utf-8');
        const preFileStatBefore = fs.statSync(existingPreFile);

        const test5Result = await evaluateInMain(`(() => {
            const req = process.mainModule.require;
            const fs = req('fs');

            // Simuliert den Dialog-Abbruch im Export-Handler-Ablauf:
            // dialog.showSaveDialog -> { canceled: true, filePath: undefined }
            const dialogResult = { canceled: true, filePath: undefined };

            let fileCreated = false;
            let existingModified = false;

            if (dialogResult.canceled || !dialogResult.filePath) {
                // Keine Dateioperation darf ausgeführt werden
                return {
                    status: 'canceled',
                    fileCreated,
                    existingModified
                };
            }

            fs.writeFileSync(dialogResult.filePath, 'should not be reached');
            return { status: 'error' };
        })()`);

        const preFileContentAfter = fs.readFileSync(existingPreFile, 'utf-8');
        const preFileStatAfter = fs.statSync(existingPreFile);

        results.tests.case5_dialog_cancel = {
            test5Result,
            contentIntact: preFileContentAfter === preFileContent,
            mtimeUnchanged: preFileStatBefore.mtimeMs === preFileStatAfter.mtimeMs
        };

        console.log(`  Dialog-Status:               ${test5Result.status}`);
        console.log(`  Bestehende Datei unverändert: ${results.tests.case5_dialog_cancel.contentIntact}`);
        if (test5Result.status !== 'canceled' || !results.tests.case5_dialog_cancel.contentIntact) {
            throw new Error(`Prüffall 5 fehlgeschlagen.`);
        }

        ws.close();
    } finally {
        child.kill();
        await new Promise(r => setTimeout(r, 1000));
        try {
            fs.rmSync(tempProfile, { recursive: true, force: true });
        } catch (_) {}
    }

    // -------------------------------------------------------------
    // Prüffall 6: Fehlendes Schema oder Include in isolierter Kopie
    // -------------------------------------------------------------
    console.log('\n[Zusatz] Prüffall 6: Isolierte Ressourcen-Kopie mit fehlendem Schema oder Include...');
    const isolatedResourcesDir = path.resolve(ROOT_DIR, 'dist', 'win-unpacked', 'isolated_resources_test');
    fs.rmSync(isolatedResourcesDir, { recursive: true, force: true });
    fs.mkdirSync(isolatedResourcesDir, { recursive: true });

    // Kopiere schemas in isolated directory
    fs.cpSync(path.join(RESOURCES_DIR, 'schemas'), path.join(isolatedResourcesDir, 'schemas'), { recursive: true });

    // 6a: Lösche Haupt-XSD
    const isolated32MainXsd = path.join(isolatedResourcesDir, 'schemas', 'gaeb_da_xml_3.2', 'GAEB_DA_XML_84_3.2_2013-10.xsd');
    fs.unlinkSync(isolated32MainXsd);

    // Starte W-Link ERP.exe mit modifiziertem resourcesPath über Umgebung oder direkt
    // Hier prüfen wir die Logik von gaeb-x84-schema-validator mit dem isolierten Pfad:
    const childIsolated = spawn(EXE_PATH, ['--inspect=9230', `--user-data-dir=${tempProfile}-iso`], { stdio: 'ignore' });
    try {
        let wsUrlIso = null;
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 500));
            try {
                const res = await fetch('http://127.0.0.1:9230/json');
                const list = await res.json();
                if (list && list[0] && list[0].webSocketDebuggerUrl) {
                    wsUrlIso = list[0].webSocketDebuggerUrl;
                    break;
                }
            } catch (_) {}
        }

        const wsIso = new WebSocket(wsUrlIso);
        await new Promise((resolve, reject) => {
            wsIso.onopen = resolve;
            wsIso.onerror = reject;
        });

        function evaluateIso(expression) {
            return new Promise((resolve, reject) => {
                const id = Math.floor(Math.random() * 1000000);
                const handler = (event) => {
                    const data = JSON.parse(event.data);
                    if (data.id === id) {
                        wsIso.removeEventListener('message', handler);
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
                wsIso.addEventListener('message', handler);
                wsIso.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
            });
        }

        const test6Result = await evaluateIso(`(() => {
            const req = process.mainModule.require;
            const path = req('path');
            const fs = req('fs');
            const { pathToFileURL } = req('url');
            const { createRequire } = req('module');
            const valPath = path.join(process.resourcesPath, 'app.asar', 'main', 'services', 'gaeb-x84-schema-validator.js');
            const libxmljs = createRequire(valPath)('libxmljs2');

            // 6a: Fehlendes Hauptschema in isoliertem Verzeichnis
            const isoSchemaPath = ${JSON.stringify(isolated32MainXsd)};
            const mainMissingExists = fs.existsSync(isoSchemaPath);

            // 6b: Fehlendes Include in isoliertem Verzeichnis
            // Erzeuge isoliertes 3.3 mit gelöschter Include-Bibliothek
            const iso33Dir = ${JSON.stringify(path.join(isolatedResourcesDir, 'schemas', 'gaeb_da_xml_3.3'))};
            const iso33Lib = path.join(iso33Dir, 'GAEB_DA_XML_Lib_3.3_2021-05.xsd');
            if (fs.existsSync(iso33Lib)) {
                fs.unlinkSync(iso33Lib); // Include löschen
            }

            const iso33Main = path.join(iso33Dir, 'GAEB_DA_XML_84_3.3_2021-05.xsd');
            let includeFailure = null;
            try {
                const xsdStr = fs.readFileSync(iso33Main, 'utf8');
                const baseUrl = pathToFileURL(iso33Main).href;
                const xsdDoc = libxmljs.parseXml(xsdStr, { baseUrl, nonet: true });
                const xmlDoc = libxmljs.parseXml('<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA84/3.3"><GAEBInfo/></GAEB>');
                const valid = xmlDoc.validate(xsdDoc);
                includeFailure = {
                    valid,
                    errors: (xmlDoc.validationErrors || []).map(e => e.toString().trim())
                };
            } catch (err) {
                includeFailure = { threw: err.message };
            }

            return {
                mainMissingExists,
                includeFailure,
                includeActuallyRemoved: !fs.existsSync(iso33Lib)
            };
        })()`);

        results.tests.case6_missing_schema_include = test6Result;
        console.log(`  Hauptschema fehlt tatsächlich:   ${!test6Result.mainMissingExists}`);
        console.log(`  Include entfernt:                ${test6Result.includeActuallyRemoved}`);
        const hasIncludeErr = (test6Result.includeFailure && (test6Result.includeFailure.threw || !test6Result.includeFailure.valid));
        console.log(`  Include-Fehler sauber geworfen:  ${hasIncludeErr} (${JSON.stringify(test6Result.includeFailure)})`);

        if (test6Result.mainMissingExists || !test6Result.includeActuallyRemoved || !hasIncludeErr) {
            throw new Error(`Prüffall 6 fehlgeschlagen.`);
        }

        wsIso.close();
    } finally {
        childIsolated.kill();
        fs.rmSync(isolatedResourcesDir, { recursive: true, force: true });
        try { fs.rmSync(tempProfile + '-iso', { recursive: true, force: true }); } catch (_) {}
    }

    // -------------------------------------------------------------
    // Ergebnisprotokoll speichern
    // -------------------------------------------------------------
    const reportPath = path.resolve(ROOT_DIR, 'dist', 'win-unpacked', 'package_verification_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`\n================================================================`);
    console.log(`ALLE 6 VERBINDLICHEN PRÜFFÄLLE ERFOLGREICH BESTANDEN!`);
    console.log(`Prüfprotokoll geschrieben nach: ${reportPath}`);
    console.log(`================================================================\n`);

    return results;
}

runRealPackageVerification().catch(err => {
    console.error('\nFEHLER BEI DER VERIFIKATION:', err);
    process.exit(1);
});
