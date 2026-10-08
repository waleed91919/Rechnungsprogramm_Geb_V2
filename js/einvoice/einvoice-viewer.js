
const _getProfiles = () => typeof EInvoiceProfiles !== 'undefined' ? EInvoiceProfiles : require('./einvoice-profiles.js');
const _getValidation = () => typeof EInvoiceValidation !== 'undefined' ? EInvoiceValidation : require('./einvoice-validation.js');
const _getViewer = () => typeof EInvoiceViewer !== 'undefined' ? EInvoiceViewer : require('./einvoice-viewer.js');
class EInvoiceViewer {
    static round2(value) {
        return Math.round((parseFloat(value) + Number.EPSILON) * 100) / 100;
    }

    static toDate102(dateStr) {
        if (!dateStr) return '';
        const str = String(dateStr).trim();
        if (/^\d{8}$/.test(str)) return str;
        if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10).replace(/-/g, '');
        if (/^\d{2}\.\d{2}\.\d{4}/.test(str)) {
            const parts = str.substring(0, 10).split('.');
            return `${parts[2]}${parts[1]}${parts[0]}`;
        }
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
            return d.toISOString().split('T')[0].replace(/-/g, '');
        }
        return '';
    }

    static parseAddressString(rawAdresse) {
        const raw = String(rawAdresse || '').trim();
        if (!raw) return { lineOne: '', plz: '', ort: '' };
        const m = raw.match(/^(.*?)[,\s]+(\d{4,6})\s+(.+)$/);
        if (m) {
            return { lineOne: m[1].replace(/[,\s]+$/, '').trim(), plz: m[2], ort: m[3].trim() };
        }
        return { lineOne: raw, plz: '', ort: '' };
    }

    static resolveAddress(source = {}) {
        const strasse = String(source.strasse || source.street || '').trim();
        const rawAdresse = String(source.adresse || source.address || '').trim();
        let lineOne = strasse;
        let plz = String(source.plz || source.postcode || '').trim();
        let ort = String(source.ort || source.city || '').trim();
        if ((!lineOne || !plz || !ort) && rawAdresse) {
            const parsed = this.parseAddressString(rawAdresse);
            if (!lineOne) lineOne = parsed.lineOne;
            if (!plz) plz = parsed.plz;
            if (!ort) ort = parsed.ort;
        }
        let country = String(source.land || source.country || source.laendercode || '').trim().toUpperCase() || 'DE';
        const landMap = { 'DEUTSCHLAND': 'DE', 'GERMANY': 'DE' };
        if (landMap[country]) country = landMap[country];
        if (!/^[A-Z]{2}$/.test(country)) country = country.substring(0, 2);
        return { lineOne: lineOne || '', plz: plz || '', city: ort || '', country };
    }

    static getSellerTaxRegistrations(seller = {}) {
        const vaValue = String(seller.ustId || seller.vat_id || seller.vatId || seller.ustid || '').trim();
        const fcValue = String(seller.steuernummer || seller.tax_number || '').trim();
        const regs = [];
        if (fcValue) regs.push({ schemeID: 'FC', id: fcValue });
        if (vaValue) regs.push({ schemeID: 'VA', id: vaValue });
        if (regs.length === 0 && seller.steuer && typeof seller.steuer === 'string') {
            const v = seller.steuer.trim();
            if (v && /^[A-Z]{2}\s?[0-9A-Z]{2,}$/i.test(v.replace(/\s/g, ''))) regs.push({ schemeID: 'VA', id: v });
            else if (v) regs.push({ schemeID: 'FC', id: v });
        }
        return regs;
    }

    static getBuyerVatId(customer = {}) {
        return String(customer.vat_id || customer.vatId || customer.ustId || customer.ustid || '').trim();
    }

    static resolvePositionCategory(invoice, pos) {
        const flags = ['unterliegt_13b', 'is13b', 'ist13b'];
        for (const flag of flags) {
            if (pos[flag] !== undefined && pos[flag] !== null && pos[flag] !== '') {
                const v = pos[flag];
                return (v === true || v === 1 || v === '1') ? 'AE' : 'S';
            }
        }
        const global13b = Boolean(invoice && (invoice.unterliegt_13b || invoice.isGlobal13b));
        return global13b ? 'AE' : 'S';
    }

    static computeTotals(invoice = {}) {
        const isBrutto = (invoice.eingabemodus === 'brutto');
        const positionen = Array.isArray(invoice.positionen) ? invoice.positionen : [];
        const lines = positionen.map((pos, idx) => {
            const menge = parseFloat(pos.menge) || 0;
            const rawPreis = parseFloat(pos.preis) || 0;
            const rabatt = Math.min(100, Math.max(0, parseFloat(pos.rabatt) || 0));
            const mwst = parseFloat(pos.mwst) || 0;
            const category = this.resolvePositionCategory(invoice, pos);
            const rate = category === 'AE' ? 0 : mwst;

            let netto = 0;
            let preis = rawPreis;
            if (isBrutto) {
                const rowBrutto = this.round2((menge * rawPreis) * (1 - rabatt / 100));
                netto = (category === 'AE' || rate <= 0) ? rowBrutto : this.round2(rowBrutto / (1 + rate / 100));
                preis = (category === 'AE' || rate <= 0) ? rawPreis : this.round2(rawPreis / (1 + rate / 100));
            } else {
                netto = this.round2(menge * rawPreis * (1 - rabatt / 100));
            }

            return { idx, menge, preis, rabatt, mwst, netto, category, rate };
        });

        const lineNettoSum = this.round2(lines.reduce((sum, l) => sum + l.netto, 0));
        let taxBasis; let groups; let taxTotal;

        if (positionen.length > 0) {
            const abzug = Math.max(0, parseFloat(invoice.globalRabattAbzug) || 0);
            taxBasis = this.round2(Math.max(0, lineNettoSum - abzug));
            const rabattFaktor = lineNettoSum > 0 ? taxBasis / lineNettoSum : 1;
            const groupMap = new Map();
            lines.forEach(l => {
                const key = l.category + '|' + l.rate.toFixed(2);
                if (!groupMap.has(key)) groupMap.set(key, { category: l.category, rate: l.rate, basis: 0 });
                groupMap.get(key).basis += l.netto;
            });
            groups = Array.from(groupMap.values()).map(g => {
                const basis = this.round2(g.basis * rabattFaktor);
                const tax = (g.category === 'AE' || g.rate <= 0) ? 0 : this.round2(basis * g.rate / 100);
                return { category: g.category, rate: g.rate, basis, tax };
            });
            taxTotal = this.round2(groups.reduce((sum, g) => sum + g.tax, 0));
        } else {
            taxBasis = this.round2(parseFloat(invoice.netto) || 0);
            const is13bInvoice = Boolean(invoice && (invoice.unterliegt_13b || invoice.isGlobal13b));
            taxTotal = is13bInvoice ? 0 : this.round2(parseFloat(invoice.steuer) || 0);
            const rate = (taxBasis > 0 && taxTotal > 0) ? this.round2((taxTotal / taxBasis) * 100) : 0;
            groups = [{ category: is13bInvoice ? 'AE' : 'S', rate, basis: taxBasis, tax: taxTotal }];
        }

        const grandTotal = this.round2(taxBasis + taxTotal);
        const anzahlung = Math.max(0, parseFloat(invoice.anzahlung) || 0);
        const einbehalt = Math.max(0, parseFloat(invoice.sicherheitseinbehalt) || 0);
        const verrechnungen = Array.isArray(invoice.verrechnungen) ? invoice.verrechnungen : [];
        // BT-113 Prepaid Amount: Beinhaltet Brutto-Verrechnungen vorangegangener Abschläge
        const verrechnungenSummeBrutto = this.round2(verrechnungen.reduce((sum, v) => {
            if (v && v.abzugsbetrag_brutto !== undefined && v.abzugsbetrag_brutto !== null && Number.isFinite(parseFloat(v.abzugsbetrag_brutto))) {
                return sum + parseFloat(v.abzugsbetrag_brutto);
            }
            const net = parseFloat(v && v.abzugsbetrag_netto) || (v && parseFloat(v.betrag)) || 0;
            const is13bInvoice = Boolean(invoice && (invoice.unterliegt_13b || invoice.isGlobal13b));
            const rate = is13bInvoice ? 0 : (parseFloat(v && v.mwst) || 19.0);
            return sum + this.round2(net * (1 + rate / 100));
        }, 0));

        const zahlbetrag = parseFloat(invoice.zahlbetrag);
        const duePayable = Number.isFinite(zahlbetrag)
            ? this.round2(Math.max(0, zahlbetrag))
            : this.round2(Math.max(0, grandTotal - anzahlung - einbehalt - verrechnungenSummeBrutto));
        const prepaid = this.round2(Math.max(0, grandTotal - duePayable));

        return {
            lines, lineNettoSum, taxBasis, groups, taxTotal, grandTotal,
            anzahlung, einbehalt, verrechnungenSumme: verrechnungenSummeBrutto, duePayable, prepaid
        };
    }

    static resolveItemName(pos, fallbackIdx = 1, extraArticles = null) {
        if (!pos) return `Position ${fallbackIdx}`;
        const direct = String(pos.name || pos.bezeichnung || pos.titel || pos.beschreibung || pos.text || '').trim();
        if (direct) return direct;

        const artId = pos.artikelId !== undefined && pos.artikelId !== null && pos.artikelId !== ''
            ? pos.artikelId
            : pos.artikel_id;
        if (artId !== undefined && artId !== null && artId !== '') {
            const numId = parseInt(artId, 10);
            if (Array.isArray(extraArticles)) {
                const found = extraArticles.find(a => parseInt(a.id, 10) === numId);
                if (found && (found.name || found.bezeichnung)) return String(found.name || found.bezeichnung).trim();
            }
            if (typeof state !== 'undefined' && Array.isArray(state.artikel)) {
                const found = state.artikel.find(a => parseInt(a.id, 10) === numId);
                if (found && (found.name || found.bezeichnung)) return String(found.name || found.bezeichnung).trim();
            }
            if (typeof window !== 'undefined' && window.state && Array.isArray(window.state.artikel)) {
                const found = window.state.artikel.find(a => parseInt(a.id, 10) === numId);
                if (found && (found.name || found.bezeichnung)) return String(found.name || found.bezeichnung).trim();
            }
        }
        return '';
    }

    static generateXRechnungXML(invoice, customer, seller = {}, options = {}) {
        if (!options.allowDraft) {
            _getValidation().assertExportfaehigerBeleg(invoice);
        }
        return this.buildCII(invoice, customer, seller, _getProfiles().GUIDELINE_XRECHNUNG_30);
    }

    static buildPostalAddressXML(addr) {
        return `
        <ram:PostalTradeAddress>` +
            (addr.plz ? `
          <ram:PostcodeCode>${this.escapeXML(addr.plz)}</ram:PostcodeCode>` : '') +
            (addr.lineOne ? `
          <ram:LineOne>${this.escapeXML(addr.lineOne)}</ram:LineOne>` : '') + `
          <ram:CityName>${this.escapeXML(addr.city)}</ram:CityName>
          <ram:CountryID>${this.escapeXML(addr.country)}</ram:CountryID>
        </ram:PostalTradeAddress>`;
    }

    static buildElectronicAddressXML(email) {
        if (!email) return '';
        return `
        <ram:URIUniversalCommunication>
          <ram:URIID schemeID="EM">${this.escapeXML(email)}</ram:URIID>
        </ram:URIUniversalCommunication>`;
    }

    static buildCII(invoice, customer, seller, guidelineId) {
        const c = customer || {};
        const s = seller || {};
        const t = this.computeTotals(invoice);

        const customerType = (invoice && invoice.customer_type) || c.customer_type || '';
        const leitwegId = (invoice.leitweg_id || c.leitweg_id || '').trim();

        if (customerType === 'B2G') {
            if (!leitwegId) {
                throw new Error('[E-Rechnung] Leitweg-ID fehlt: Rechnungen an öffentliche Auftraggeber (B2G) erfordern zwingend eine Leitweg-ID (BT-10 gemäß BR-DE-15) (im Formular Feld Leitweg-ID / BT-10 prüfen).');
            }
            const check = _getValidation().validateLeitwegId(leitwegId);
            if (!check.valid) {
                throw new Error(`[E-Rechnung] Leitweg-ID "${leitwegId}" ungültig (BT-10 gemäß BR-DE-15): ${check.message} (im Formular Feld Leitweg-ID / BT-10 prüfen).`);
            }
        } else if (leitwegId) {
            const check = _getValidation().validateLeitwegId(leitwegId);
            if (!check.valid) {
                console.warn(`[E-Rechnung] Leitweg-ID "${leitwegId}" ungültig (BT-10): ${check.message}`);
            }
        }
        // BT-10 BuyerReference: Leitweg-ID hat Vorrang vor buyer_reference
        const buyerRef = leitwegId || String(invoice.buyer_reference ?? c.buyer_reference ?? '').trim();
        if (!buyerRef && guidelineId === _getProfiles().GUIDELINE_XRECHNUNG_30) {
            throw new Error('[E-Rechnung] Käuferreferenz fehlt: Für das XRechnung-Profil ist BT-10 Pflicht (BR-DE-15). Bitte Leitweg-ID oder Käuferreferenz erfassen.');
        }

        const today = new Date().toISOString().split('T')[0];
        const issueDateIso = invoice.datum || today;
        const dueDateIso = invoice.faellig || invoice.datum || today;
        const issueDate = this.toDate102(issueDateIso);
        const dueDate = this.toDate102(dueDateIso);
        const currency = (invoice.waehrung || s.waehrung || 'EUR').toUpperCase();

        const deliveryDateStr = this.toDate102(invoice.leistungsdatum || invoice.leistungszeitraum_von || invoice.datum || today);
        const periodStartStr = this.toDate102(invoice.leistungszeitraum_von);
        const periodEndStr = this.toDate102(invoice.leistungszeitraum_bis);
        const hasBillingPeriod = Boolean(periodStartStr && periodEndStr);

        let billingPeriodXML = '';
        if (hasBillingPeriod) {
            billingPeriodXML = `
      <ram:BillingSpecifiedPeriod>
        <ram:StartDateTime>
          <udt:DateTimeString format="102">${periodStartStr}</udt:DateTimeString>
        </ram:StartDateTime>
        <ram:EndDateTime>
          <udt:DateTimeString format="102">${periodEndStr}</udt:DateTimeString>
        </ram:EndDateTime>
      </ram:BillingSpecifiedPeriod>`;
        }

        const isStorno = Boolean(
            invoice.typ === 'STORNO' ||
            invoice.typ === 'GUTSCHRIFT' ||
            invoice.isStorno ||
            invoice.storno_zu_nr ||
            (typeof invoice.nr === 'string' && invoice.nr.startsWith('STORNO')) ||
            invoice.rechnungsart === 'STORNO' ||
            invoice.rechnungsart === 'GUTSCHRIFT'
        );
        const origNr = (invoice.storno_zu_nr || invoice.storno_urspruengliche_nr ||
            (typeof invoice.nr === 'string' && invoice.nr.startsWith('STORNO - ') ? invoice.nr.replace('STORNO - ', '') : '') || '').trim();
        const origDateStr = this.toDate102(invoice.storno_zu_datum || invoice.urspruengliches_datum);

        let invoiceReferencedXML = '';
        if (isStorno && origNr) {
            invoiceReferencedXML = `
      <ram:InvoiceReferencedDocument>
        <ram:IssuerAssignedID>${this.escapeXML(origNr)}</ram:IssuerAssignedID>${origDateStr ? `
        <ram:FormattedIssueDateTime>
          <qdt:DateTimeString format="102">${origDateStr}</qdt:DateTimeString>
        </ram:FormattedIssueDateTime>` : ''}
      </ram:InvoiceReferencedDocument>`;
        }

        const sellerAddr = this.resolveAddress(s);
        const buyerAddr = this.resolveAddress(c);
        const sellerName = this.escapeXML(s.firmenname || s.name || '');
        const buyerName = this.escapeXML(c.name || c.firmenname || '');
        const sellerIban = (s.iban || '').replace(/\s+/g, '');
        const sellerBic = (s.bic || '').trim();
        const sellerBank = (s.bankname || '').trim();
        const sellerEmail = (s.email || '').trim();
        const buyerEmail = (c.email || '').trim();

        // B2G Verkäuferkontakt (KoSIT BR-DE-5/6/7, BT-34/BG-6)
        const contactPerson = (s.kontakt_name || s.kontaktperson || s.ansprechpartner || s.inhaber || s.firmenname || s.name || 'Buchhaltung').trim();
        const contactPhone = (s.telefon || s.tel || s.phone || '+49 000 000000').trim();
        const contactEmail = (s.kontakt_email || s.email || 'rechnung@example.com').trim();
        const definedContactXML = `
        <ram:DefinedTradeContact>
          <ram:PersonName>${this.escapeXML(contactPerson)}</ram:PersonName>
          <ram:TelephoneUniversalCommunication>
            <ram:CompleteNumber>${this.escapeXML(contactPhone)}</ram:CompleteNumber>
          </ram:TelephoneUniversalCommunication>
          <ram:EmailURIUniversalCommunication>
            <ram:URIID>${this.escapeXML(contactEmail)}</ram:URIID>
          </ram:EmailURIUniversalCommunication>
        </ram:DefinedTradeContact>`;

        let lineItemsXML = '';
        t.lines.forEach((line, idx) => {
            const pos = invoice.positionen[idx] || {};
            const name = this.escapeXML(this.resolveItemName(pos, idx + 1, s && s.artikel) || `Position ${idx + 1}`);
            const unitCode = _getProfiles().mapUnitToUNECERec20(pos.einheit);
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
          <ram:ChargeAmount>${line.preis.toFixed(2)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="${unitCode}">${line.menge.toFixed(2)}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>${line.category}</ram:CategoryCode>
          <ram:RateApplicablePercent>${line.rate.toFixed(2)}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${line.netto.toFixed(2)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`;
        });

        let tradeTaxXML = '';
        t.groups.forEach(g => {
            tradeTaxXML += `
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${g.tax.toFixed(2)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>` +
            (g.category === 'AE' ? `
        <ram:ExemptionReason>${_getProfiles().EXEMPTION_REASON_13B}</ram:ExemptionReason>
        <ram:ExemptionReasonCode>VATEX-EU-AE</ram:ExemptionReasonCode>` : '') + `
        <ram:BasisAmount>${g.basis.toFixed(2)}</ram:BasisAmount>
        <ram:CategoryCode>${g.category}</ram:CategoryCode>
        <ram:RateApplicablePercent>${g.rate.toFixed(2)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`;
        });

        let paymentMeansXML = '';
        if (sellerIban || sellerBank) {
            paymentMeansXML = `
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>${sellerIban ? '58' : '30'}</ram:TypeCode>` +
            (sellerBank ? `
        <ram:Information>${this.escapeXML(sellerBank)}</ram:Information>` : '') + `
        <ram:PayeePartyCreditorFinancialAccount>` +
            (sellerIban
                ? `
          <ram:IBANID>${this.escapeXML(sellerIban)}</ram:IBANID>`
                : `
          <ram:AccountName>${this.escapeXML(sellerBank)}</ram:AccountName>`) + `
        </ram:PayeePartyCreditorFinancialAccount>` +
            (sellerBic ? `
        <ram:PayeeSpecifiedFinancialInstitution>
          <ram:BICID>${this.escapeXML(sellerBic)}</ram:BICID>
        </ram:PayeeSpecifiedFinancialInstitution>` : '') + `
      </ram:SpecifiedTradeSettlementPaymentMeans>`;
        }

        const faelligTeile = dueDateIso.split('-');
        const skontoTage = parseInt(invoice.skonto_tage || invoice.skontoTage, 10) || 0;
        const skontoProzent = parseFloat(invoice.skonto_prozent || invoice.skontoProzent) || 0;
        const hasSkonto = skontoTage > 0 && skontoProzent > 0;

        let paymentTermsDescription = '';
        if (hasSkonto) {
            paymentTermsDescription = `${skontoProzent}% Skonto innerhalb von ${skontoTage} Tagen, rein netto zahlbar bis zum ${faelligTeile[2]}.${faelligTeile[1]}.${faelligTeile[0]}.`;
        } else {
            paymentTermsDescription = `Zahlbar ohne Abzug bis zum ${faelligTeile[2]}.${faelligTeile[1]}.${faelligTeile[0]}.`;
        }
        if (t.einbehalt > 0) {
            const prozentVal = invoice.sicherheitseinbehalt_prozent ? parseFloat(invoice.sicherheitseinbehalt_prozent).toFixed(2) : ((t.einbehalt / (t.grandTotal || 1)) * 100).toFixed(2);
            paymentTermsDescription += ` #EINBEHALT#PROZENT=${prozentVal}#BETRAG=${t.einbehalt.toFixed(2)}#GRUND=VOB/B § 17#ABLOESBAR=Buergschaft#`;
        }
        const paymentTermsXML = `
      <ram:SpecifiedTradePaymentTerms>
        <ram:Description>${this.escapeXML(paymentTermsDescription)}</ram:Description>
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">${dueDate}</udt:DateTimeString>
        </ram:DueDateDateTime>${hasSkonto ? `
        <ram:ApplicableTradePaymentDiscountTerms>
          <ram:BasisPeriodMeasure unitCode="DAY">${skontoTage}</ram:BasisPeriodMeasure>
          <ram:CalculationPercent>${Number(skontoProzent).toFixed(2)}</ram:CalculationPercent>
        </ram:ApplicableTradePaymentDiscountTerms>` : ''}
      </ram:SpecifiedTradePaymentTerms>`;

        const sellerRegsXML = this.getSellerTaxRegistrations(s).map(r =>
            `
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="${r.schemeID}">${this.escapeXML(r.id)}</ram:ID>
        </ram:SpecifiedTaxRegistration>`
        ).join('');
        const buyerVat = this.getBuyerVatId(c);
        const buyerRegXML = buyerVat ? `
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${this.escapeXML(buyerVat)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : '';

        return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
                          xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
                          xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100"
                          xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>${guidelineId}</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${this.escapeXML(invoice.nr)}</ram:ID>
    <ram:TypeCode>${isStorno ? '381' : '380'}</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${issueDate}</udt:DateTimeString>
    </ram:IssueDateTime>${t.einbehalt > 0 ? `
    <ram:IncludedNote>
      <ram:Content>Sicherheitseinbehalt ${invoice.sicherheitseinbehalt_prozent ? Number(invoice.sicherheitseinbehalt_prozent).toFixed(2) : ((t.einbehalt / (t.grandTotal || 1)) * 100).toFixed(2)} % (${t.einbehalt.toFixed(2)} EUR) gemäß § 17 VOB/B für Gewährleistung. Ablösbar durch Bankbürgschaft.</ram:Content>
      <ram:SubjectCode>PMT</ram:SubjectCode>
    </ram:IncludedNote>` : ''}
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${lineItemsXML}
    <ram:ApplicableHeaderTradeAgreement>${buyerRef ? `
      <ram:BuyerReference>${this.escapeXML(buyerRef)}</ram:BuyerReference>` : ''}
      <ram:SellerTradeParty>
        <ram:Name>${sellerName}</ram:Name>${definedContactXML}${this.buildPostalAddressXML(sellerAddr)}${this.buildElectronicAddressXML(sellerEmail)}${sellerRegsXML}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${buyerName}</ram:Name>${this.buildPostalAddressXML(buyerAddr)}${this.buildElectronicAddressXML(buyerEmail)}${buyerRegXML}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      <ram:ActualDeliverySupplyChainEvent>
        <ram:OccurrenceDateTime>
          <udt:DateTimeString format="102">${deliveryDateStr}</udt:DateTimeString>
        </ram:OccurrenceDateTime>
      </ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${currency}</ram:InvoiceCurrencyCode>${paymentMeansXML}${tradeTaxXML}${billingPeriodXML}${paymentTermsXML}${invoiceReferencedXML}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${t.lineNettoSum.toFixed(2)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${t.taxBasis.toFixed(2)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${currency}">${t.taxTotal.toFixed(2)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${t.grandTotal.toFixed(2)}</ram:GrandTotalAmount>
        <ram:TotalPrepaidAmount>${t.prepaid.toFixed(2)}</ram:TotalPrepaidAmount>
        <ram:DuePayableAmount>${t.duePayable.toFixed(2)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
    }

    static generateZUGFeRDXML(invoice, customer, seller = {}, options = {}) {
        if (!options.allowDraft) {
            _getValidation().assertExportfaehigerBeleg(invoice);
        }
        const info = _getProfiles().getZUGFeRDProfileInfo(options.profile);
        if (info.profile === 'XRECHNUNG') {
            return this.generateXRechnungXML(invoice, customer, seller, options);
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

if (typeof window !== 'undefined') window.EInvoiceViewer = EInvoiceViewer;
if (typeof module !== 'undefined' && module.exports) module.exports = EInvoiceViewer;
