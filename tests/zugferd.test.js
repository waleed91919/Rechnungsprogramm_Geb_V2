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

test('Z6: CII enthält BG-23-Steueraufschlüsselung, BG-5/BG-8-Adressen, Einheitscodes und BT-9-Fälligkeit', () => {
    // 125 m² x 40 EUR = 5000.00 netto, 19% => 950.00 Steuer
    assert.ok(xmlString.includes('<ram:CalculatedAmount>950.00</ram:CalculatedAmount>'), 'BG-23 CalculatedAmount 950.00 fehlt');
    assert.ok(xmlString.includes('<ram:BasisAmount>5000.00</ram:BasisAmount>'), 'BG-23 BasisAmount 5000.00 fehlt');
    assert.ok(xmlString.includes('<ram:CategoryCode>S</ram:CategoryCode>'), 'BG-23 CategoryCode S fehlt');
    assert.ok(xmlString.includes('<ram:TypeCode>VAT</ram:TypeCode>'), 'BG-23 TypeCode VAT fehlt');

    const countryCount = countOccurrences(xmlString, '<ram:CountryID>DE</ram:CountryID>');
    assert.ok(countryCount >= 2, `Seller- und Buyer-CountryID DE erwartet, gefunden: ${countryCount}`);
    assert.ok(xmlString.includes('<ram:CityName>Berlin</ram:CityName>'), 'CityName fehlt');
    assert.ok(!xmlString.includes('DE000000000'), 'Fake-USt-IdNr DE000000000 darf nicht mehr vorkommen');

    assert.ok(xmlString.includes('unitCode="MTK"'), 'Einheit m² muss auf UN/ECE Rec 20 MTK gemappt werden');
    assert.ok(!xmlString.includes('unitCode="m²"'), 'Ungemappte Einheit im unitCode-Attribut');

    assert.ok(
        /<ram:DueDateDateTime>\s*<udt:DateTimeString format="102">20260831<\/udt:DateTimeString>/s.test(xmlString),
        'BT-9 DueDateDateTime mit faellig=2026-08-31 fehlt'
    );
    assert.ok(
        /<ram:SpecifiedTradePaymentTerms>[\s\S]*<ram:DueDateDateTime>/s.test(xmlString),
        'SpecifiedTradePaymentTerms mit DueDate fehlt'
    );
    assert.ok(xmlString.includes('<ram:DuePayableAmount>5950.00</ram:DuePayableAmount>'), 'DuePayableAmount != Brutto');
    assert.ok(xmlString.includes('<ram:LineTotalAmount>5000.00</ram:LineTotalAmount>'), 'Header LineTotalAmount falsch');
    assert.ok(xmlString.includes('<ram:IBANID>DE89370400440532013000</ram:IBANID>'), 'PaymentMeans IBANID fehlt');
    assert.ok(!xmlString.includes('<ram:BICID></ram:BICID>'), 'Leeres BICID-Element darf nicht ausgegeben werden');
});

test('Z7: BT-10 BuyerReference - Leitweg-ID hat Vorrang vor buyer_reference', () => {
    const inv = { ...invoice, leitweg_id: '991-12345678-12', buyer_reference: 'AB-45001' };
    const cust = { ...customer, leitweg_id: '991-12345678-12', buyer_reference: 'AB-45001' };
    const xmlLeitweg = EInvoiceEngine.generateXRechnungXML(inv, cust, seller);
    const match = xmlLeitweg.match(/<ram:BuyerReference>([^<]*)<\/ram:BuyerReference>/);
    assert.ok(match, 'BuyerReference fehlt');
    assert.equal(match[1], '991-12345678-12', 'Leitweg-ID muss in BT-10 Vorrang haben');

    // Ohne Leitweg-ID greift buyer_reference als Fallback
    const invOhne = { ...invoice, buyer_reference: 'AB-45002' };
    delete invOhne.leitweg_id;
    const custOhne = { ...customer };
    delete custOhne.leitweg_id;
    const xmlFallback = EInvoiceEngine.generateXRechnungXML(invOhne, custOhne, seller);
    assert.ok(xmlFallback.includes('<ram:BuyerReference>AB-45002</ram:BuyerReference>'));
});

test('Z8: § 13b (AE) erzeugt ExemptionReason/VTEX und DuePayableAmount zieht Anzahlungen ab', () => {
    const inv13b = {
        nr: 'RE-13B-TEST',
        datum: '2026-08-01',
        faellig: '2026-08-20',
        netto: 4000,
        steuer: 0,
        brutto: 4000,
        unterliegt_13b: 1,
        anzahlung: 1500,
        positionen: [
            { name: 'Bauleistung an Bauunternehmer', menge: 2, einheit: 'Std', preis: 2000, mwst: 19 }
        ]
    };
    const xml13b = EInvoiceEngine.generateZUGFeRDXML(inv13b, customer, seller);

    assert.ok(xml13b.includes('<ram:CategoryCode>AE</ram:CategoryCode>'), 'CategoryCode AE für § 13b fehlt');
    assert.ok(
        xml13b.includes(`<ram:ExemptionReason>${EInvoiceEngine.EXEMPTION_REASON_13B}</ram:ExemptionReason>`),
        'ExemptionReason (BT-120) für § 13b fehlt'
    );
    assert.ok(xml13b.includes('<ram:ExemptionReasonCode>VTEX</ram:ExemptionReasonCode>'), 'VTEX-Code fehlt');
    assert.ok(xml13b.includes('<ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>'), 'AE muss 0.00 % ausweisen');
    assert.ok(xml13b.includes('unitCode="HUR"'), 'Std muss auf HUR gemappt werden');
    assert.ok(xml13b.includes('<ram:CalculatedAmount>0.00</ram:CalculatedAmount>'), 'Bei AE keine berechnete Steuer');

    assert.ok(xml13b.includes('<ram:GrandTotalAmount>4000.00</ram:GrandTotalAmount>'), 'GrandTotalAmount falsch');
    assert.ok(xml13b.includes('<ram:TotalPrepaidAmount>1500.00</ram:TotalPrepaidAmount>'), 'TotalPrepaidAmount (Anzahlung) fehlt');
    assert.ok(xml13b.includes('<ram:DuePayableAmount>2500.00</ram:DuePayableAmount>'), 'DuePayableAmount muss brutto - Anzahlung sein');
});

test('Z9: UN/ECE Rec 20 Einheits-Mapping inkl. Fallbacks', () => {
    assert.equal(EInvoiceEngine.mapUnitToUNECERec20('m²'), 'MTK');
    assert.equal(EInvoiceEngine.mapUnitToUNECERec20('m2'), 'MTK');
    assert.equal(EInvoiceEngine.mapUnitToUNECERec20('m³'), 'MTQ');
    assert.equal(EInvoiceEngine.mapUnitToUNECERec20('m'), 'MTR');
    assert.equal(EInvoiceEngine.mapUnitToUNECERec20('Std'), 'HUR');
    assert.equal(EInvoiceEngine.mapUnitToUNECERec20('h'), 'HUR');
    assert.equal(EInvoiceEngine.mapUnitToUNECERec20('Tag'), 'DAY');
    assert.equal(EInvoiceEngine.mapUnitToUNECERec20('Stk.'), 'H87');
    assert.equal(EInvoiceEngine.mapUnitToUNECERec20('Pausch'), 'C62');
    assert.equal(EInvoiceEngine.mapUnitToUNECERec20('Eimer'), 'H87');
    assert.equal(EInvoiceEngine.mapUnitToUNECERec20('kg'), 'KGM');
    assert.equal(EInvoiceEngine.mapUnitToUNECERec20('C62'), 'C62');
    assert.equal(EInvoiceEngine.mapUnitToUNECERec20('H87'), 'H87');
    assert.equal(EInvoiceEngine.mapUnitToUNECERec20(undefined), 'C62');
    assert.equal(EInvoiceEngine.mapUnitToUNECERec20('Krügel'), 'C62');
});

test('Z10: Validierungs-Gate blockt fehlerhafte Exporte mit strukturierter Fehlerliste', () => {
    // B2G ohne Leitweg-ID
    const b2gOhneLeitweg = EInvoiceEngine.validateForEN16931(
        invoice,
        { ...customer, customer_type: 'B2G' },
        seller
    );
    assert.equal(b2gOhneLeitweg.isValid, false);
    assert.ok(b2gOhneLeitweg.errors.some(e => e.includes('Leitweg-ID')), 'Leitweg-Fehler erwartet');

    // Keine Bankverbindung
    const keinKonto = EInvoiceEngine.validateForEN16931(
        invoice,
        customer,
        { ...seller, iban: '', bankname: '' }
    );
    assert.equal(keinKonto.isValid, false);
    assert.ok(keinKonto.errors.some(e => e.includes('Bankverbindung')), 'Bankverbindungs-Fehler erwartet');

    // Weder USt-IdNr noch Steuernummer
    const keineSteuerId = EInvoiceEngine.validateForEN16931(
        invoice,
        customer,
        { ...seller, ustId: '' }
    );
    assert.equal(keineSteuerId.isValid, false);
    assert.ok(keineSteuerId.errors.some(e => e.includes('Steuernummer')), 'Steuernummern-Fehler erwartet');

    // Summenbruch Netto + Steuer != Brutto
    const summenBruch = EInvoiceEngine.validateForEN16931(
        { ...invoice, brutto: 6000 },
        customer,
        seller
    );
    assert.equal(summenBruch.isValid, false);
    assert.ok(summenBruch.errors.some(e => e.includes('Brutto')), 'Brutto-Summenfehler erwartet');

    // Positionssumme stimmt nicht mit Netto überein (BR-CO-10)
    const zeilenBruch = EInvoiceEngine.validateForEN16931(
        { ...invoice, netto: 4000 },
        customer,
        seller
    );
    assert.equal(zeilenBruch.isValid, false);
    assert.ok(zeilenBruch.errors.some(e => e.includes('BR-CO-10')), 'BR-CO-10-Summenfehler erwartet');

    // Kunde ohne Ort blockiert
    const ohneOrt = EInvoiceEngine.validateForEN16931(
        invoice,
        { ...customer, ort: '', adresse: '' },
        seller
    );
    assert.equal(ohneOrt.isValid, false);
    assert.ok(ohneOrt.errors.some(e => e.includes('Kunden-Ort')), 'Ort-Fehler erwartet');

    // Referenzfall bleibt gültig
    const ok = EInvoiceEngine.validateForEN16931(invoice, customer, seller);
    assert.equal(ok.isValid, true, `Referenzdaten müssen validieren, Fehler: ${ok.errors.join('; ')}`);
});

test('Z11: Mit echtem Sichtseiten-PDF bleibt die XML byte-identisch und die Seitenzahl folgt dem Basis-PDF', async () => {
    const baseDoc = await PDFDocument.create();
    baseDoc.addPage([595.28, 841.89]);
    baseDoc.addPage([595.28, 841.89]);
    const basePdfBuffer = Buffer.from(await baseDoc.save());

    const buf = await ZugferdBuilder.build({
        basePdfBuffer,
        xmlString,
        meta: {
            nr: invoice.nr,
            datum: invoice.datum,
            sellerName: seller.firmenname,
            empfaengerName: customer.name,
            duePayableAmount: '5950.00',
            conformanceLevel: enProfileInfo.conformanceLevel,
            fileName: enProfileInfo.fileName,
            title: `Rechnung ${invoice.nr}`
        }
    });

    assert.match(buf.slice(0, 8).toString('latin1'), /^%PDF-\d\.\d$/, 'Kein gültiger PDF-Header');

    const reloaded = await PDFDocument.load(buf, { ignoreEncryption: true });
    assert.equal(
        reloaded.getPageCount(),
        2,
        'Seitenzahl muss dem Basis-PDF entsprechen - nicht der 1-seitigen Fallback-Ersatzseite'
    );

    const attachment = reloaded.getAttachments().find((a) => a.name === 'factur-x.xml');
    assert.ok(attachment, 'Attachment "factur-x.xml" fehlt im Hybrid-PDF mit Basis-PDF');
    assert.equal(String(attachment.afRelationship), 'Alternative');
    assert.equal(
        Buffer.compare(Buffer.from(attachment.data), Buffer.from(xmlString, 'utf8')),
        0,
        'Eingebettete XML muss trotz Basis-PDF byte-identisch zur Quell-XML sein'
    );

    assert.equal(reloaded.getTitle(), `Rechnung ${invoice.nr}`);
});

test('Z12: Ungültiger basePdfBuffer wirft nicht, sondern fällt auf die Platzhalter-Seite zurück', async () => {
    const unbrauchbar = Buffer.from('das ist garantiert kein pdf');

    const buf = await ZugferdBuilder.build({
        basePdfBuffer: unbrauchbar,
        xmlString,
        meta: {
            nr: invoice.nr,
            datum: invoice.datum,
            sellerName: seller.firmenname,
            empfaengerName: customer.name,
            duePayableAmount: '5950.00',
            conformanceLevel: enProfileInfo.conformanceLevel,
            fileName: enProfileInfo.fileName
        }
    });

    const reloaded = await PDFDocument.load(buf, { ignoreEncryption: true });
    assert.equal(reloaded.getPageCount(), 1, 'Fallback darf genau eine Ersatzseite erzeugen');

    const attachment = reloaded.getAttachments().find((a) => a.name === 'factur-x.xml');
    assert.ok(attachment, 'Attachment fehlt im Fallback-Fall');
    assert.equal(
        Buffer.compare(Buffer.from(attachment.data), Buffer.from(xmlString, 'utf8')),
        0,
        'Auch im Fallback-Fall muss die eingebettete XML byte-identisch sein'
    );
});
