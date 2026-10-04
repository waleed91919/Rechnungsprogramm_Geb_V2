
const _getProfiles = () => typeof EInvoiceProfiles !== 'undefined' ? EInvoiceProfiles : require('./einvoice-profiles.js');
const _getValidation = () => typeof EInvoiceValidation !== 'undefined' ? EInvoiceValidation : require('./einvoice-validation.js');
const _getViewer = () => typeof EInvoiceViewer !== 'undefined' ? EInvoiceViewer : require('./einvoice-viewer.js');
class EInvoiceValidation {
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

    static validateForEN16931(invoice, customer, seller = {}) {
        const errors = [];

        if (!invoice) {
            errors.push('Rechnungsdaten fehlen.');
            return { isValid: false, errors };
        }
        if (!invoice.nr) errors.push('Rechnungsnummer fehlt.');
        if (!invoice.datum) errors.push('Rechnungsdatum fehlt.');

        const totals = _getViewer().computeTotals(invoice);

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
                const itemName = _getViewer().resolveItemName(pos, i + 1, seller && seller.artikel);
                if (!itemName) {
                    errors.push(`Position ${i + 1}: Bezeichnung (BT-153) fehlt.`);
                }
            });
            if (Number.isFinite(parseFloat(invoice.netto))) {
                const abzug = Math.max(0, parseFloat(invoice.globalRabattAbzug) || 0);
                const erwartet = _getViewer().round2(totals.lineNettoSum - abzug);
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
            const buyerAddr = _getViewer().resolveAddress(customer);
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
            if (customerType === 'B2B' && !_getViewer().getBuyerVatId(customer) &&
                !customer.tax_number && !customer.steuernummer) {
                errors.push('B2B-Pflichtfeld: USt-IdNr oder Steuernummer des Empfängers fehlt.');
            }
        }

        const sellerName = (seller && (seller.firmenname || seller.name)) || '';
        if (!sellerName) {
            errors.push('Verkäufer-Name (BT-27) fehlt.');
        } else {
            const sellerAddr = _getViewer().resolveAddress(seller || {});
            if (!sellerAddr.city) errors.push('Verkäufer-Ort (BT-37) fehlt - BG-5 PostalTradeAddress unvollständig.');
        }
        if (!seller || _getViewer().getSellerTaxRegistrations(seller).length === 0) {
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
}

if (typeof window !== 'undefined') window.EInvoiceValidation = EInvoiceValidation;
if (typeof module !== 'undefined' && module.exports) module.exports = EInvoiceValidation;
