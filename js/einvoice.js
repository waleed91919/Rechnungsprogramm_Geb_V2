/**
 * einvoice.js - Generierung und Validierung von E-Rechnungen (EN 16931, XRechnung & ZUGFeRD 2.0.1+)
 */
class EInvoiceEngine {
    // XRechnung 3.0 / KoSIT-Bundle 3.0.2 (Summer 2026, Stand 31.08.2026) — P0.4.
    static GUIDELINE_XRECHNUNG_30 = 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0';
    // Veraltet, nur für Alt-Beleg-Anzeige/Tests als Alias behalten:
    static GUIDELINE_XRECHNUNG_23 = 'urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.3';
    static GUIDELINE_FACTURX_EN16931 = 'urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:en16931';

    static EXEMPTION_REASON_13B = 'Steuerschuldnerschaft des Leistungsempfängers';

    static UNIT_CODES = {
        'm²': 'MTK', 'm2': 'MTK', 'qm': 'MTK', 'quadratmeter': 'MTK',
        'm³': 'MTQ', 'm3': 'MTQ', 'cbm': 'MTQ', 'kubikmeter': 'MTQ',
        'm': 'MTR', 'meter': 'MTR', 'lfm': 'MTR', 'laufende meter': 'MTR',
        'mm': 'MMT', 'cm': 'CMT', 'km': 'KMT',
        'std': 'HUR', 'std.': 'HUR', 'h': 'HUR', 'hr': 'HUR', 'stunde': 'HUR', 'stunden': 'HUR',
        'tag': 'DAY', 'tage': 'DAY', 'woche': 'WEE', 'wochen': 'WEE', 'monat': 'MON', 'monate': 'MON',
        'stk': 'H87', 'stk.': 'H87', 'stück': 'H87', 'stueck': 'H87', 'stücke': 'H87',
        'pausch': 'C62', 'pauschal': 'C62', 'pauschale': 'C62',
        'kg': 'KGM', 'kilogramm': 'KGM', 'g': 'GRM',
        't': 'TNE', 'to': 'TNE', 'tonne': 'TNE', 'tonnen': 'TNE',
        'l': 'LTR', 'liter': 'LTR', '%': 'P1', 'prozent': 'P1'
    };

    static round2(value) {
        return Math.round((parseFloat(value) + Number.EPSILON) * 100) / 100;
    }

    /**
     * Konvertiert Datumsangaben in das UN/ECE D16B Format 102 (CCYYMMDD).
     */
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

    /**
     * Berechnet die 2-stellige Prüfziffer für eine Basis-Leitweg-ID nach ISO 7064 MOD 97-10.
     * @param {string} base - Leitweg-ID ohne Prüfziffer (z.B. "04011000-1234567890" oder "991-12345678")
     * @returns {string} Zweistellige Prüfziffer (z.B. "17" bzw. "30")
     */
    static computeLeitwegIdChecksum(base) {
        if (!base) return '';
        const clean = String(base).replace(/[-\s]/g, '').toUpperCase();
        if (!/^[0-9A-Z]+$/.test(clean)) return '';
        let numericStr = '';
        for (let i = 0; i < clean.length; i++) {
            const code = clean.charCodeAt(i);
            if (code >= 48 && code <= 57) {
                numericStr += clean[i];
            } else if (code >= 65 && code <= 90) {
                numericStr += String(code - 55);
            } else {
                return '';
            }
        }
        numericStr += '00';
        const remainder = Number(BigInt(numericStr) % 97n);
        const checksum = 98 - remainder;
        return checksum < 10 ? `0${checksum}` : `${checksum}`;
    }

    /**
     * Prüft eine Leitweg-ID nach ISO 7064 MOD 97-10.
     * @param {string} leitwegId
     * @returns {{ valid: boolean, message?: string }}
     */
    static validateLeitwegId(leitwegId) {
        if (!leitwegId || typeof leitwegId !== 'string') {
            return { valid: false, message: 'Leitweg-ID fehlt oder ist kein gültiger Text.' };
        }
        const trimmed = leitwegId.trim();
        const parts = trimmed.split('-');
        if (parts.length < 2 || parts.length > 3) {
            return { valid: false, message: 'Format muss Grobadressierung[-Feinadressierung]-Prüfziffer entsprechen (z.B. 04011-00000-30).' };
        }
        const grob = parts[0];
        const pruef = parts[parts.length - 1];
        const fein = parts.length === 3 ? parts[1] : '';

        if (!/^[0-9A-Za-z]{2,12}$/.test(grob)) {
            return { valid: false, message: 'Grobadressierung muss 2 bis 12 alphanumerische Zeichen umfassen.' };
        }
        if (fein && !/^[0-9A-Za-z]{1,30}$/.test(fein)) {
            return { valid: false, message: 'Feinadressierung darf maximal 30 alphanumerische Zeichen umfassen.' };
        }
        if (!/^\d{2}$/.test(pruef)) {
            return { valid: false, message: 'Prüfziffer muss genau zwei Ziffern betragen.' };
        }

        const clean = trimmed.replace(/[-\s]/g, '').toUpperCase();
        if (!/^[0-9A-Z]+$/.test(clean)) {
            return { valid: false, message: 'Leitweg-ID enthält unzulässige Zeichen.' };
        }
        let numericStr = '';
        for (let i = 0; i < clean.length; i++) {
            const code = clean.charCodeAt(i);
            if (code >= 48 && code <= 57) {
                numericStr += clean[i];
            } else if (code >= 65 && code <= 90) {
                numericStr += String(code - 55);
            }
        }

        const modResult = Number(BigInt(numericStr) % 97n);
        if (modResult !== 1) {
            const base = parts.slice(0, parts.length - 1).join('-');
            const expectedPz = this.computeLeitwegIdChecksum(base);
            return {
                valid: false,
                message: `Ungültige Prüfziffer der Leitweg-ID (ISO 7064 MOD 97-10). Angegeben: ${pruef}, Erwartet: ${expectedPz}.`
            };
        }

        return { valid: true };
    }

    /**
     * Mappt freie Einheitsangaben auf UN/ECE Rec 20 Codes (BT-130 unitCode).
     */
    static mapUnitToUNECERec20(einheit) {
        const key = String(einheit || '').trim().toLowerCase();
        if (!key) return 'C62';
        if (this.UNIT_CODES[key]) return this.UNIT_CODES[key];
        if (/^[a-z][a-z0-9]{1,2}$/.test(key)) return key.toUpperCase();
        if (key === 'eimer' || key === 'eimer.') {
            console.warn(`[E-Rechnung] Einheit "${einheit}" hat keinen gültigen UN/ECE Rec 20 Code, Fallback "H87" (Stück).`);
            return 'H87';
        }
        console.warn(`[E-Rechnung] Unbekannte Einheit "${einheit}", Fallback UN/ECE Rec 20 Code "C62".`);
        return 'C62';
    }

    /**
     * Zerlegt eine einzeilige Adressangabe ("Bauweg 12, 10115 Berlin") in Straße/PLZ/Ort.
     */
    static parseAddressString(rawAdresse) {
        const raw = String(rawAdresse || '').trim();
        if (!raw) return { lineOne: '', plz: '', ort: '' };
        const m = raw.match(/^(.*?)[,\s]+(\d{4,6})\s+(.+)$/);
        if (m) {
            return { lineOne: m[1].replace(/[,\s]+$/, '').trim(), plz: m[2], ort: m[3].trim() };
        }
        return { lineOne: raw, plz: '', ort: '' };
    }

    /**
     * Löst BG-5/BG-8-Adressfelder aus strukturierten Feldern oder einzeiliger Adresse auf (CountryID Default DE).
     */
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

    /**
     * Liefert die Steuer-Registrierungen des Verkäufers: schemeID "VA" (USt-IdNr, BT-31)
     * und schemeID "FC" (Steuernummer, BT-32). Kein Fake-Wert mehr - fehlt beides, bleibt das Feld leer.
     */
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

    /**
     * § 13b-Erkennung je Position wie InvoiceController.calculateTotals:
     * Positionsflag gewinnt, sonst greift der globale Schalter (unterliegt_13b / isGlobal13b).
     */
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

    /**
     * Berechnet Zeilensummen (inkl. Positions­rabatt), BG-23-Steuercategorien,
     * Brutto und Zahlbetrag analog InvoiceController.calculateTotals (Modus netto).
     */
    static computeTotals(invoice = {}) {
        const positionen = Array.isArray(invoice.positionen) ? invoice.positionen : [];
        const lines = positionen.map((pos, idx) => {
            const menge = parseFloat(pos.menge) || 0;
            const preis = parseFloat(pos.preis) || 0;
            const rabatt = Math.min(100, Math.max(0, parseFloat(pos.rabatt) || 0));
            const mwst = parseFloat(pos.mwst) || 0;
            const netto = this.round2(menge * preis * (1 - rabatt / 100));
            const category = this.resolvePositionCategory(invoice, pos);
            const rate = category === 'AE' ? 0 : mwst;
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

    /**
     * Ermittelt den Artikel-/Positionsnamen (BT-153) für EN 16931.
     * Prüft direkte Felder (name, bezeichnung, titel, beschreibung, text)
     * sowie Artikel-Lookup über artikelId / artikel_id aus dem globalen State oder übergebenen Artikeln.
     */
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

    /**
     * Validiert ein Rechnungsdokument als Export-Gate nach EN 16931 / B2G Vorgaben (Leitweg-ID).
     * Gibt eine strukturierte Fehlerliste zurück; bei isValid=false darf kein Export erfolgen.
     */
    static validateForEN16931(invoice, customer, seller = {}) {
        const errors = [];

        if (!invoice) {
            errors.push('Rechnungsdaten fehlen.');
            return { isValid: false, errors };
        }
        if (!invoice.nr) errors.push('Rechnungsnummer fehlt.');
        if (!invoice.datum) errors.push('Rechnungsdatum fehlt.');

        const totals = this.computeTotals(invoice);

        if (!invoice.positionen || invoice.positionen.length === 0) {
            errors.push('Mindestens eine Rechnungsposition erforderlich.');
        } else {
            invoice.positionen.forEach((pos, i) => {
                const menge = parseFloat(pos.menge);
                const preis = parseFloat(pos.preis);
                if (!Number.isFinite(menge) || menge <= 0) {
                    errors.push(`Position ${i + 1}: Menge fehlt oder ist nicht größer 0.`);
                }
                if (!Number.isFinite(preis)) {
                    errors.push(`Position ${i + 1}: Einheitspreis fehlt oder ist ungültig.`);
                }
                const itemName = this.resolveItemName(pos, i + 1, seller && seller.artikel);
                if (!itemName) {
                    errors.push(`Position ${i + 1}: Bezeichnung (BT-153) fehlt.`);
                }
            });
            if (Number.isFinite(parseFloat(invoice.netto))) {
                const abzug = Math.max(0, parseFloat(invoice.globalRabattAbzug) || 0);
                const erwartet = this.round2(totals.lineNettoSum - abzug);
                if (Math.abs(erwartet - parseFloat(invoice.netto)) > 0.02) {
                    errors.push(`Summenfehler (BR-CO-10): Positionssumme (${erwartet.toFixed(2)} € nach Rabatt) stimmt nicht mit Rechnungs-Netto (${parseFloat(invoice.netto).toFixed(2)} €) überein.`);
                }
            }
        }

        const netto = parseFloat(invoice.netto);
        const steuer = parseFloat(invoice.steuer);
        const brutto = parseFloat(invoice.brutto);
        if ([netto, steuer, brutto].every(Number.isFinite) && Math.abs(netto + steuer - brutto) > 0.02) {
            errors.push(`Summenfehler (BR-CO-14/15): Netto (${netto.toFixed(2)} €) + Steuer (${steuer.toFixed(2)} €) ≠ Brutto (${brutto.toFixed(2)} €).`);
        }

        if (Number.isFinite(steuer) && Math.abs(totals.taxTotal - steuer) > 0.05) {
            errors.push(`Steuer-Konsistenzfehler (BG-23): berechnete Steuer (${totals.taxTotal.toFixed(2)} €) weicht von ausgewiesener Steuer (${steuer.toFixed(2)} €) ab.`);
        }

        if (!customer) {
            errors.push('Empfänger-Kunde fehlt.');
        } else {
            if (!customer.name && !customer.firmenname) {
                errors.push('Kundenname (BT-44) fehlt.');
            }
            const buyerAddr = this.resolveAddress(customer);
            if (!buyerAddr.city) errors.push('Kunden-Ort (BT-50) fehlt - BG-8 PostalTradeAddress unvollständig.');

            const customerType = customer.customer_type || '';
            if (customerType === 'B2G') {
                const leitwegId = (invoice.leitweg_id || customer.leitweg_id || '').trim();
                if (!leitwegId) {
                    errors.push('B2G-Pflichtfeld: Leitweg-ID fehlt für öffentlichen Auftraggeber.');
                } else {
                    const check = this.validateLeitwegId(leitwegId);
                    if (!check.valid) {
                        errors.push(`Ungültige Leitweg-ID: ${check.message}`);
                    }
                }
            }
            if (customerType === 'B2B' && !this.getBuyerVatId(customer) &&
                !customer.tax_number && !customer.steuernummer) {
                errors.push('B2B-Pflichtfeld: USt-IdNr oder Steuernummer des Empfängers fehlt.');
            }
        }

        const sellerName = (seller && (seller.firmenname || seller.name)) || '';
        if (!sellerName) {
            errors.push('Verkäufer-Name (BT-27) fehlt.');
        } else {
            const sellerAddr = this.resolveAddress(seller || {});
            if (!sellerAddr.city) errors.push('Verkäufer-Ort (BT-37) fehlt - BG-5 PostalTradeAddress unvollständig.');
        }
        if (!seller || this.getSellerTaxRegistrations(seller).length === 0) {
            errors.push('Weder USt-IdNr (BT-31) noch Steuernummer (BT-32) des Verkäufers vorhanden.');
        }
        if (!seller.iban && !seller.bankname) {
            errors.push('Verkäufer-Bankverbindung (IBAN oder Kreditinstitut, BG-16) fehlt.');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    static getZUGFeRDProfileInfo(profile) {
        switch (String(profile || 'EN16931').toUpperCase()) {
            case 'XRECHNUNG':
                return {
                    profile: 'XRECHNUNG',
                    guidelineId: this.GUIDELINE_XRECHNUNG_30,
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
    static generateXRechnungXML(invoice, customer, seller = {}, options = {}) {
        if (!options.allowDraft) {
            this.assertExportfaehigerBeleg(invoice);
        }
        return this.buildCII(invoice, customer, seller, this.GUIDELINE_XRECHNUNG_30);
    }

    /**
     * Belegfixierungs-Gate (P0.4): produktiver Export nur aus gespeichertem +
     * festgeschriebenem Beleg. Wirft mit Feldbezug bei Verstoß.
     * Entwurf → kein File, nur Vorschau (Aufrufer zeigt Wasserzeichen ENTWURF).
     */
    static assertExportfaehigerBeleg(invoice) {
        if (!invoice || typeof invoice !== 'object') {
            throw new Error('E-Rechnungs-Export blockiert: Feld „Beleg“ fehlt (kein Beleg geladen).');
        }
        if (invoice.id === null || invoice.id === undefined || (typeof invoice.id === 'number' && invoice.id <= 0)) {
            throw new Error('E-Rechnungs-Export blockiert: Feld „Beleg-ID“ fehlt — Beleg erst speichern und festschreiben.');
        }
        const locked = Boolean(invoice.isLocked);
        const isFinalStatus = ['Festgeschrieben', 'Bezahlt', 'Überfällig', 'Ausstehend'].includes(invoice.status);
        if (!locked && !isFinalStatus) {
            throw new Error(`E-Rechnungs-Export blockiert: Feld „Status“ ist „${invoice.status || 'Entwurf'}“ — nur festgeschriebene Belege sind versandfähig (Entwurf = Vorschau mit Wasserzeichen, keine Datei).`);
        }
        return true;
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
                throw new Error('[E-Rechnung] Leitweg-ID fehlt: Rechnungen an öffentliche Auftraggeber (B2G) erfordern zwingend eine Leitweg-ID (BT-10 gemäß BR-DE-15).');
            }
            const check = this.validateLeitwegId(leitwegId);
            if (!check.valid) {
                throw new Error(`[E-Rechnung] Leitweg-ID "${leitwegId}" ungültig (BT-10 gemäß BR-DE-15): ${check.message}`);
            }
        } else if (leitwegId) {
            const check = this.validateLeitwegId(leitwegId);
            if (!check.valid) {
                console.warn(`[E-Rechnung] Leitweg-ID "${leitwegId}" ungültig (BT-10): ${check.message}`);
            }
        }
        // BT-10 BuyerReference: Leitweg-ID hat Vorrang vor buyer_reference
        const buyerRef = leitwegId || (invoice.buyer_reference || c.buyer_reference || '').trim();

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
            const unitCode = this.mapUnitToUNECERec20(pos.einheit);
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
        <ram:ExemptionReason>${this.EXEMPTION_REASON_13B}</ram:ExemptionReason>
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
    <ram:ApplicableHeaderTradeAgreement>
      <ram:BuyerReference>${this.escapeXML(buyerRef)}</ram:BuyerReference>
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

    /**
     * Generiert eine Factur-X / ZUGFeRD 2.0.1+ XML Struktur (CII).
     * options.profile: 'EN16931' (default) | 'XRECHNUNG'
     */
    static generateZUGFeRDXML(invoice, customer, seller = {}, options = {}) {
        if (!options.allowDraft) {
            this.assertExportfaehigerBeleg(invoice);
        }
        const info = this.getZUGFeRDProfileInfo(options.profile);
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

// Isomorpher Export (Node.js & Browser/Renderer)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EInvoiceEngine;
}
if (typeof window !== 'undefined') {
    window.EInvoiceEngine = EInvoiceEngine;
}
if (typeof globalThis !== 'undefined' && !globalThis.EInvoiceEngine) {
    globalThis.EInvoiceEngine = EInvoiceEngine;
}
