/**
 * zugferd-builder.js - PDF/A-3-Hybrid-Builder für ZUGFeRD 2.x / Factur-X.
 * Electron-frei: nur @cantoo/pdf-lib, fontkit und Node-Buffer -> via node --test lauffähig.
 */
const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, embedFacturX } = require('@cantoo/pdf-lib');
const fontkit = require('fontkit');

// /Alternative ist der von ZUGFeRD/Factur-X (Profil EN 16931, Deutschland) geforderte
// AFRelationship-Wert: XML und PDF sind zwei gleichwertige Darstellungen desselben Inhalts.
// Quelle: ZUGFeRD 2.x Spezialfall RE / Factur-X 1.0.07 Spezifikation, Abschnitt 6.4.
const AF_RELATIONSHIP_ALTERNATIVE = 'Alternative';

const FONT_CANDIDATES_WIN = ['segoeui.ttf', 'arial.ttf', 'calibri.ttf'];

function loadEmbeddedFontCandidates() {
    if (process.platform !== 'win32') return [];
    const windir = process.env.WINDIR || 'C:\\Windows';
    const fontDir = path.join(windir, 'Fonts');
    const found = [];
    for (const name of FONT_CANDIDATES_WIN) {
        const full = path.join(fontDir, name);
        try {
            if (fs.existsSync(full)) found.push(fs.readFileSync(full));
        } catch (_e) {
            continue;
        }
    }
    return found;
}

class ZugferdBuilder {
    /**
     * Baut ein PDF/A-3b-Hybrid-Dokument (ZUGFeRD 2.x) aus einem optionalen Basis-PDF
     * und der CII-Rechnungs-XML.
     *
     * @param {object} params
     * @param {Buffer|null} [params.basePdfBuffer=null] Vorhandenes Sichtseiten-PDF;
     *        null -> es wird eine minimale Ersatzseite erzeugt.
     * @param {string} params.xmlString Vollständige CII-Rechnungs-XML (factur-x.xml-Inhalt).
     * @param {object} [params.meta={}]
     * @param {string} [params.meta.nr] Rechnungsnummer (für Titel/Ersatzseite).
     * @param {string} [params.meta.datum] Rechnungsdatum.
     * @param {string} [params.meta.sellerName] Verkäufername (Ersatzseite).
     * @param {string} [params.meta.conformanceLevel='EN 16931'] fx:ConformanceLevel ('EN 16931' | 'XRECHNUNG').
     * @param {string} [params.meta.fileName='factur-x.xml'] Attachment-Dateiname ('xrechnung.xml' beim XRECHNUNG-Profil).
     * @param {string} [params.meta.title] PDF-Dokumenttitel.
     * @param {string} [params.meta.producer='W-Link ERP'] PDF-Producer-Metadatum.
     * @returns {Promise<Buffer>} Der fertige PDF/A-3-Puffer.
     */
    static async build({ basePdfBuffer = null, xmlString, meta = {} } = {}) {
        if (typeof xmlString !== 'string' || xmlString.length === 0) {
            throw new Error('ZUGFeRD-Export fehlgeschlagen: Keine Rechnungs-XML übergeben.');
        }
        if (!xmlString.includes('<rsm:CrossIndustryInvoice')) {
            throw new Error('ZUGFeRD-Export fehlgeschlagen: Die übergebene XML ist keine CII-Rechnungs-XML (rsm:CrossIndustryInvoice fehlt).');
        }

        const conformanceLevel = meta.conformanceLevel || 'EN 16931';
        const fileName = meta.fileName || 'factur-x.xml';
        const producer = meta.producer || 'W-Link ERP';
        const title = meta.title || `Rechnung ${meta.nr || ''}`.trim() || 'Rechnung';

        let pdfDoc;
        try {
            if (basePdfBuffer && Buffer.isBuffer(basePdfBuffer) && basePdfBuffer.length > 0) {
                pdfDoc = await PDFDocument.load(basePdfBuffer, {
                    ignoreEncryption: true,
                    updateMetadata: false
                });
            } else {
                pdfDoc = await this._createFallbackDocument(meta);
            }
        } catch (err) {
            throw new Error(`ZUGFeRD-Export fehlgeschlagen: Das Sichtseiten-PDF konnte nicht geladen werden (${err.message}).`);
        }

        pdfDoc.setTitle(title);
        pdfDoc.setProducer(producer);
        pdfDoc.setCreator(producer);

        try {
            await embedFacturX(pdfDoc, Buffer.from(xmlString, 'utf8'), {
                fileName,
                conformanceLevel,
                documentType: 'INVOICE',
                version: '1.0',
                description: 'ZUGFeRD-Rechnungsdaten (maschinenlesbare E-Rechnung)',
                afRelationship: AF_RELATIONSHIP_ALTERNATIVE,
                modificationDate: new Date()
            });
        } catch (err) {
            throw new Error(`ZUGFeRD-Export fehlgeschlagen: Die Rechnungs-XML konnte nicht ins PDF eingebettet werden (${err.message}).`);
        }

        let bytes;
        try {
            bytes = await pdfDoc.save({ useObjectStreams: false });
        } catch (err) {
            throw new Error(`ZUGFeRD-Export fehlgeschlagen: Das PDF konnte nicht serialisiert werden (${err.message}).`);
        }
        return Buffer.from(bytes);
    }

    /**
     * Minimale menschenlesbare Ersatzseite mit eingebettetem TTF
     * (PDF/A verlangt eingebettete Fonts; die Standard-14-PDF-Fonts sind nicht zulässig).
     * Ist auf dem System kein nutzbarer Font vorhanden, bleibt die Seite leer -
     * das Hybrid-PDF bleibt trotzdem gültig, nur ohne Text auf der Sichtseite.
     */
    static async _createFallbackDocument(meta) {
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([595.28, 841.89]);
        const nr = String(meta.nr || '').replace(/[^\x20-\x7EÄÖÜäöüß]/g, '');
        const datum = String(meta.datum || '');
        const sellerName = String(meta.sellerName || '').replace(/[^\x20-\x7EÄÖÜäöüß]/g, '');

        for (const fontBytes of loadEmbeddedFontCandidates()) {
            try {
                pdfDoc.registerFontkit(fontkit);
                const font = await pdfDoc.embedFont(fontBytes, { subset: true });
                page.drawText(sellerName ? sellerName : 'W-Link ERP', { x: 50, y: 780, size: 12, font, color: rgb(0.1, 0.1, 0.1) });
                page.drawText(`Rechnung ${nr}${datum ? ' vom ' + datum : ''}`, { x: 50, y: 760, size: 11, font, color: rgb(0.1, 0.1, 0.1) });
                page.drawText('Elektronische Rechnung (ZUGFeRD 2.x): Die maschinenlesbaren Rechnungsdaten sind als Dateianhang eingebettet.', {
                    x: 50, y: 740, size: 9, font, color: rgb(0.25, 0.25, 0.25)
                });
                break;
            } catch (_e) {
                continue;
            }
        }
        return pdfDoc;
    }
}

module.exports = { ZugferdBuilder, AF_RELATIONSHIP_ALTERNATIVE };
