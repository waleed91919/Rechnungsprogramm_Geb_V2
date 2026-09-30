/**
 * main/services/gaeb-x84-schema-validator.js
 *
 * Extracts XSD validation logic to ensure proper handling in packaged Electron builds.
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

function validateXML(xml, gaebVersion) {
    if (!['3.2', '3.3'].includes(gaebVersion)) {
        gaebVersion = '3.3'; // Default fallback if missing
    }

    const { app } = require('electron');
    let schemaDir;

    // In packaged app, use resourcesPath. Otherwise, use project root / tests / schemas.
    if (app && app.isPackaged) {
        schemaDir = path.join(process.resourcesPath, 'schemas', `gaeb_da_xml_${gaebVersion}`);
    } else {
        // Fallback for tests or direct node usage when `app` might be undefined
        const basePath = (app && typeof app.getAppPath === 'function')
            ? app.getAppPath()
            : path.join(__dirname, '..', '..');

        // When running via `electron .` or tests, app.isPackaged is false
        // But if process.resourcesPath is somehow set in tests, we rely on our default logic
        schemaDir = path.join(basePath, 'tests', 'schemas', `gaeb_da_xml_${gaebVersion}`);
    }

    const schemaFile = gaebVersion === '3.2' ? 'GAEB_DA_XML_84_3.2_2013-10.xsd' : 'GAEB_DA_XML_84_3.3_2021-05.xsd';
    const schemaPath = path.join(schemaDir, schemaFile);

    if (!fs.existsSync(schemaPath)) {
        return {
            valid: false,
            errors: [`XSD-Schema nicht gefunden: ${schemaPath}`]
        };
    }

    try {
        const libxmljs = require('libxmljs2');
        const xsdStr = fs.readFileSync(schemaPath, 'utf8');

        // Use pathToFileURL for correct URI representation (fixes spaces and special characters in paths)
        const baseUrl = pathToFileURL(schemaPath).href;

        const xsdDoc = libxmljs.parseXml(xsdStr, { baseUrl, nonet: true });
        const xmlDoc = libxmljs.parseXml(xml);

        const isValid = xmlDoc.validate(xsdDoc);

        if (!isValid) {
            return {
                valid: false,
                errors: xmlDoc.validationErrors.map(e => e.toString().trim())
            };
        }

        return {
            valid: true,
            errors: []
        };
    } catch (e) {
        return {
            valid: false,
            errors: [`Fehler bei der XSD-Prüfung: ${e.message}`]
        };
    }
}

module.exports = {
    validateXML
};
