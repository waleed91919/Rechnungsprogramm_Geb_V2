/**
 * einvoice.js - Generierung und Validierung von E-Rechnungen (EN 16931, XRechnung & ZUGFeRD 2.0.1+)
 */
class EInvoiceEngine {
    /**
     * Validiert ein Rechnungsdokument auf Vollständigkeit nach EN 16931 / B2G Vorgaben (z.B. Leitweg-ID).
     */
    static validateForEN16931(invoice, customer, seller = {}) {
        const errors = [];

        if (!invoice.nr) errors.push('Rechnungsnummer fehlt.');
        if (!invoice.datum) errors.push('Rechnungsdatum fehlt.');
        if (!customer) {
            errors.push('Empfänger-Kunde fehlt.');
        } else {
            if (customer.customer_type === 'B2G') {
                const leitwegId = invoice.leitweg_id || customer.leitweg_id;
                if (!leitwegId) {
                    errors.push('B2G-Pflichtfeld: Leitweg-ID fehlt für öffentlichen Auftraggeber.');
                } else if (!/^[0-9A-Za-z-]+$/.test(leitwegId.trim())) {
                    errors.push('Ungültiges Format der Leitweg-ID.');
                }
            }
            if (customer.customer_type === 'B2B' && !customer.vat_id && !customer.ustId && !customer.tax_number) {
                errors.push('B2B-Pflichtfeld: USt-IdNr oder Steuernummer des Empfängers fehlt.');
            }
        }

        if (!seller.iban && !seller.bankname) {
            errors.push('Verkäufer-Bankverbindung (IBAN) fehlt.');
        }

        if (!invoice.positionen || invoice.positionen.length === 0) {
            errors.push('Mindestens eine Rechnungsposition erforderlich.');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    static GUIDELINE_XRECHNUNG_23 = 'urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.3';
    static GUIDELINE_FACTURX_EN16931 = 'urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:en16931';

    /**
     * Liefert die Profil-Metadaten für den ZUGFeRD/Factur-X-Export:
     * Guideline-URN der CII-XML, Attachment-Dateiname und fx:ConformanceLevel.
     */
    static getZUGFeRDProfileInfo(profile) {
        switch (String(profile || 'EN16931').toUpperCase()) {
            case 'XRECHNUNG':
                return {
                    profile: 'XRECHNUNG',
                    guidelineId: this.GUIDELINE_XRECHNUNG_23,
                    fileName: 'xrechnung.xml',
                    conformanceLevel: 'XRECHNUNG'
                };
            case 'EN16931':
            default:
                return {
                    profile: 'EN16931',
                    guidelineId: this.GUIDELINE_FACTURX_EN16931,
                    fileName: 'factur-x.xml',
                    conformanceLevel: 'EN 16931'
                };
        }
    }

    /**
     * Generiert eine XRechnung im CII-Format (Cross Industry Invoice XML nach EN 16931-1).
     */
    static generateXRechnungXML(invoice, customer, seller = {}) {
        return this.buildCII(invoice, customer, seller, this.GUIDELINE_XRECHNUNG_23);
    }

    static buildCII(invoice, customer, seller, guidelineId) {
        const leitwegId = (invoice.leitweg_id || (customer && customer.leitweg_id) || '').trim();
        const buyerRef = (invoice.buyer_reference || (customer && customer.buyer_reference) || leitwegId).trim();
        const issueDate = (invoice.datum || new Date().toISOString().split('T')[0]).replace(/-/g, '');
        const dueDate = (invoice.faellig || invoice.datum || new Date().toISOString().split('T')[0]).replace(/-/g, '');

        const sellerName = this.escapeXML(seller.firmenname || seller.name || 'W-Link Bau ERP');
        const sellerIban = (seller.iban || '').replace(/\s+/g, '');
        const sellerBic = (seller.bic || '').trim();
        const buyerName = this.escapeXML((customer && customer.name) || 'Auftraggeber');

        let lineItemsXML = '';
        (invoice.positionen || []).forEach((pos, idx) => {
            const menge = parseFloat(pos.menge) || 1;
            const preis = parseFloat(pos.preis) || 0;
            const netto = menge * preis;
            const mwst = parseFloat(pos.mwst) || 19;
            const name = this.escapeXML(pos.name || pos.beschreibung || `Position ${idx + 1}`);
            const unit = this.escapeXML(pos.einheit || 'C62');

            lineItemsXML += `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${idx + 1}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${name}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>${preis.toFixed(2)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="${unit}">${menge.toFixed(2)}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>${invoice.unterliegt_13b ? 'AE' : 'S'}</ram:CategoryCode>
          <ram:RateApplicablePercent>${invoice.unterliegt_13b ? '0.00' : mwst.toFixed(2)}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${netto.toFixed(2)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`;
        });

        const nettoSum = parseFloat(invoice.netto) || 0;
        const steuerSum = invoice.unterliegt_13b ? 0 : (parseFloat(invoice.steuer) || 0);
        const bruttoSum = nettoSum + steuerSum;

        return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
                          xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
                          xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>${guidelineId}</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${this.escapeXML(invoice.nr)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${issueDate}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${lineItemsXML}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:BuyerReference>${this.escapeXML(buyerRef)}</ram:BuyerReference>
      <ram:SellerTradeParty>
        <ram:Name>${sellerName}</ram:Name>
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${this.escapeXML(seller.ustId || seller.steuer || 'DE000000000')}</ram:ID>
        </ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${buyerName}</ram:Name>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>58</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount>
          <ram:IBANID>${sellerIban}</ram:IBANID>
        </ram:PayeePartyCreditorFinancialAccount>
        <ram:PayeeSpecifiedFinancialInstitution>
          <ram:BICID>${sellerBic}</ram:BICID>
        </ram:PayeeSpecifiedFinancialInstitution>
      </ram:SpecifiedTradeSettlementPaymentMeans>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${nettoSum.toFixed(2)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${nettoSum.toFixed(2)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${steuerSum.toFixed(2)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${bruttoSum.toFixed(2)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${bruttoSum.toFixed(2)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
    }

    /**
     * Generiert eine Factur-X / ZUGFeRD 2.0.1+ XML Struktur (CII).
     * options.profile: 'EN16931' (default) | 'XRECHNUNG'
     */
    static generateZUGFeRDXML(invoice, customer, seller = {}, options = {}) {
        const info = this.getZUGFeRDProfileInfo(options.profile);
        if (info.profile === 'XRECHNUNG') {
            return this.generateXRechnungXML(invoice, customer, seller);
        }
        return this.buildCII(invoice, customer, seller, info.guidelineId);
    }

    static escapeXML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = EInvoiceEngine;
} else {
    window.EInvoiceEngine = EInvoiceEngine;
}
