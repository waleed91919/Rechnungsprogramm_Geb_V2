const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');

const EInvoiceEngine = require('../js/einvoice.js');
const { ZugferdBuilder } = require('../main/zugferd-builder.js');
const { PDFDocument } = require('@cantoo/pdf-lib');

const seller = {
    firmenname: 'Muster Bau GmbH',
    adresse: 'Bauweg 12, 10115 Berlin',
    bankname: 'Deutsche Bank Berlin',
    iban: 'DE89370400440532013000',
    bic: 'DEUTDEDDBER',
    ustId: 'DE999999999'
};

const customer = {
    id: 102,
    name: 'Muster Subunternehmer Rohbau GmbH',
    adresse: 'Industriestr. 4',
    plz: '12099',
    ort: 'Berlin',
    customer_type: 'B2B',
    vat_id: 'DE111222333'
};

const invoice = {
    id: 301,
    nr: 'RE-2026-ZUGFERD-TEST',
    datum: '2026-08-01',
    faellig: '2026-08-31',
    netto: 5000.00,
    steuer: 950.00,
    brutto: 5950.00,
    positionen: [
        { name: 'Rohbauarbeiten Abschnitt Nord (GAEB OZ 01.001)', menge: 125, einheit: 'm²', preis: 40.00, mwst: 19 }
    ]
};

const xmlString = EInvoiceEngine.generateZUGFeRDXML(invoice, customer, seller);
const enProfileInfo = EInvoiceEngine.getZUGFeRDProfileInfo('EN16931');

let cachedEnPdf = null;
async function buildEn16931Pdf() {
    if (!cachedEnPdf) {
        cachedEnPdf = await ZugferdBuilder.build({
            basePdfBuffer: null,
            xmlString,
            meta: {
                nr: invoice.nr,
                datum: invoice.datum,
                sellerName: seller.firmenname,
                conformanceLevel: enProfileInfo.conformanceLevel,
                fileName: enProfileInfo.fileName,
                title: `Rechnung ${invoice.nr}`
            }
        });
    }
    return cachedEnPdf;
}

function countOccurrences(haystack, needle) {
    let count = 0;
    let idx = haystack.indexOf(needle);
    while (idx !== -1) {
        count++;
        idx = haystack.indexOf(needle, idx + needle.length);
    }
    return count;
}

// XMP liegt normalerweise unkomprimiert im /Metadata-Stream; falls eine
// Bibliotheksversion ihn Flate-komprimiert ablegt, werden alle Stream-Segmente
// zusätzlich inflationiert und durchsucht (Fallback laut Plan 13, Kap. 7.1 Z2).
function extractSearchText(buf) {
    const raw = buf.toString('latin1');
    const parts = [raw];
    const streamRe = /stream\r?\n/g;
    let m;
    while ((m = streamRe.exec(raw)) !== null) {
        const start = m.index + m[0].length;
        const end = raw.indexOf('endstream', start);
        if (end === -1) continue;
        try {
            parts.push(zlib.inflateSync(buf.subarray(start, end)).toString('latin1'));
        } catch (_e) {
            continue;
        }
    }
    return parts.join('\n');
}

test('Z1: ZugferdBuilder erzeugt strukturell gültiges ZUGFeRD-PDF/A-3', async () => {
    const validation = EInvoiceEngine.validateForEN16931(invoice, customer, seller);
    assert.equal(validation.isValid, true);

    const buf = await buildEn16931Pdf();

    const head = buf.slice(0, 8).toString('latin1');
    assert.match(head, /^%PDF-\d\.\d$/, `Ungültiger PDF-Header: "${head}"`);

    const raw = buf.toString('latin1');

    // Negativ-Lookahead: /AF soll nicht auf /AFRelationship aufschlagen
    assert.ok(/\/AF(?![A-Za-z])/.test(raw), 'Katalog-Eintrag /AF (Associated Files) fehlt');
    assert.ok(countOccurrences(raw, '/EmbeddedFiles') >= 1, '/Names /EmbeddedFiles fehlt');
    assert.ok(countOccurrences(raw, '/AFRelationship /Alternative') >= 1, '/AFRelationship /Alternative fehlt');
    assert.ok(
        countOccurrences(raw, 'factur-x.xml') >= 2,
        'factur-x.xml muss mindestens in FileSpec UND Names-Baum erscheinen'
    );
    assert.ok(raw.trimEnd().endsWith('%%EOF'), 'EOF-Markierung %%EOF fehlt am Dateiende');
});

test('Z2: XMP-Metadaten enthalten PDF/A-Identifikation, fx:-Felder und Extension-Schema', async () => {
    const buf = await buildEn16931Pdf();
    const text = extractSearchText(buf);

    // Toleranz: Elementform (<pdfaid:part>3<) ODER Attributform (pdfaid:part="3")
    assert.ok(
        /pdfaid:part>3</.test(text) || /pdfaid:part\s*=\s*["']3["']/.test(text),
        'pdfaid:part = 3 fehlt im XMP'
    );
    assert.ok(
        /pdfaid:conformance>(?:B|U)</.test(text) || /pdfaid:conformance\s*=\s*["'](?:B|U)["']/.test(text),
        'pdfaid:conformance (B|U) fehlt im XMP'
    );
    assert.ok(text.includes('<fx:DocumentType>INVOICE</fx:DocumentType>'), 'fx:DocumentType != INVOICE');
    assert.ok(text.includes('<fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>'), 'fx:DocumentFileName passt nicht zum Attachment');
    assert.ok(text.includes('<fx:Version>1.0</fx:Version>'), 'fx:Version != 1.0');
    assert.ok(text.includes('<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>'), 'fx:ConformanceLevel != EN 16931');
    assert.ok(text.includes('pdfaExtension:schemas'), 'PDF/A Extension-Schema-Deklaration fehlt (VeraPDF 6.6.2.3.1)');
    assert.ok(
        text.includes('urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#'),
        'fx-Namespace-URN fehlt'
    );
});

test('Z3: OutputIntent mit eingebettetem sRGB-ICC-Profil vorhanden', async () => {
    const buf = await buildEn16931Pdf();
    const raw = buf.toString('latin1');

    assert.ok(countOccurrences(raw, '/OutputIntents') >= 1, '/OutputIntents fehlt im Katalog');
    assert.ok(countOccurrences(raw, '/GTS_PDFA1') >= 1, 'OutputIntent-Subtype /GTS_PDFA1 fehlt');
    assert.ok(countOccurrences(raw, '/DestOutputProfile') >= 1, '/DestOutputProfile (ICC-Stream) fehlt');
});

test('Z4: EmbeddedFile-Roundtrip liefert byte-identische Rechnungs-XML', async () => {
    const buf = await buildEn16931Pdf();

    const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
    const attachments = pdfDoc.getAttachments();
    const attachment = attachments.find((a) => a.name === 'factur-x.xml');
    assert.ok(attachment, 'Attachment "factur-x.xml" nicht im PDF gefunden');

    assert.equal(String(attachment.afRelationship), 'Alternative');
    assert.equal(attachment.mimeType, 'text/xml');
    assert.equal(
        Buffer.compare(Buffer.from(attachment.data), Buffer.from(xmlString, 'utf8')),
        0,
        'Eingebettete XML weicht byte-weise vom Original ab'
    );
});

test('Z5: Profilvarianten XRECHNUNG und EN16931 erzeugen korrekte URNs und Dateinamen', async () => {
    const xInfo = EInvoiceEngine.getZUGFeRDProfileInfo('XRECHNUNG');
    assert.equal(xInfo.profile, 'XRECHNUNG');
    assert.equal(xInfo.fileName, 'xrechnung.xml');
    assert.equal(xInfo.guidelineId, 'urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.3');

    const xmlX = EInvoiceEngine.generateZUGFeRDXML(invoice, customer, seller, { profile: 'XRECHNUNG' });
    assert.ok(
        xmlX.includes('urn:xoev-de:kosit:standard:xrechnung_2.3'),
        'XRECHNUNG-XML enthält nicht den XRechnung-2.3-Guideline-URN'
    );

    const bufX = await ZugferdBuilder.build({
        basePdfBuffer: null,
        xmlString: xmlX,
        meta: {
            nr: invoice.nr,
            datum: invoice.datum,
            sellerName: seller.firmenname,
            conformanceLevel: xInfo.conformanceLevel,
            fileName: xInfo.fileName,
            title: `Rechnung ${invoice.nr} (XRECHNUNG)`
        }
    });
    const textX = extractSearchText(bufX);
    assert.ok(
        textX.includes('<fx:DocumentFileName>xrechnung.xml</fx:DocumentFileName>'),
        'XMP fx:DocumentFileName muss beim XRECHNUNG-Profil "xrechnung.xml" lauten'
    );
    assert.ok(
        countOccurrences(bufX.toString('latin1'), 'xrechnung.xml') >= 2,
        'xrechnung.xml muss in FileSpec UND Names-Baum erscheinen'
    );

    const enInfo = EInvoiceEngine.getZUGFeRDProfileInfo('EN16931');
    assert.equal(enInfo.fileName, 'factur-x.xml');

    const xmlEN = EInvoiceEngine.generateZUGFeRDXML(invoice, customer, seller, { profile: 'EN16931' });
    assert.ok(
        xmlEN.includes('#conformant#urn:factur-x.eu:1p0:en16931'),
        'EN16931-XML enthält nicht den Factur-X-Conformant-URN'
    );
    assert.ok(!xmlEN.includes('xoev-de:kosit'), 'EN16931-XML darf keinen XRechnung-URN enthalten');
});
