/**
 * InvoiceController.js - Geschäftsschicht & Berechnungslogik für Rechnungen
 * Steuert Berechnungen von § 13b UStG, Rabatten, Sicherheitseinbehalt, Verrechnungen, Anzahlungen, Stornierung & Speichervalidierung.
 */
window.InvoiceController = class InvoiceController {
    /**
     * Berechnet alle Netto-, Brutto-, Steuersummen und Zahlbeträge einer Rechnung.
     */
    static calculateTotals({
        positionen = [],
        mode = 'netto',
        isGlobal13b = false,
        globalRabatt = { value: 0, type: '%' },
        sicherheitseinbehaltProzent = 0,
        verrechnungen = [],
        anzahlung = 0
    }) {
        let positionenNetto = 0;
        let positionenBrutto = 0;
        let totals13bNetto = 0;
        let totalsNormalNetto = 0;
        const taxes = { 19: 0, 7: 0 };

        // 1. Einzelpositionen durchlaufen
        const processedPositions = positionen.map(pos => {
            const menge = parseFloat(pos.menge) || 0;
            const preis = parseFloat(pos.preis) || 0;
            const rabatt = parseFloat(pos.rabatt) || 0;
            const mwstRate = parseFloat(pos.mwst) || 0;
            const pos13b = isGlobal13b && Boolean(pos.is13b);

            let rowNetto = 0;
            let rowBrutto = 0;
            let tax = 0;

            if (mode === 'netto') {
                rowNetto = (menge * preis) * (1 - rabatt / 100);
                tax = pos13b ? 0 : (rowNetto * (mwstRate / 100));
                rowBrutto = rowNetto + tax;
            } else {
                rowBrutto = (menge * preis) * (1 - rabatt / 100);
                if (pos13b) {
                    rowNetto = rowBrutto;
                    tax = 0;
                } else {
                    rowNetto = rowBrutto / (1 + mwstRate / 100);
                    tax = rowBrutto - rowNetto;
                }
            }

            positionenNetto += rowNetto;
            positionenBrutto += rowBrutto;

            if (pos13b) {
                totals13bNetto += rowNetto;
            } else {
                totalsNormalNetto += rowNetto;
                if (mwstRate > 0) {
                    taxes[mwstRate] = (taxes[mwstRate] || 0) + tax;
                }
            }

            return { ...pos, rowNetto, rowBrutto, tax, pos13b };
        });

        // 2. Globalen Rabatt berechnen
        const baseForGlobalRabatt = mode === 'netto' ? positionenNetto : positionenBrutto;
        let abzug = 0;
        if (globalRabatt.value > 0) {
            abzug = globalRabatt.type === '%' 
                ? baseForGlobalRabatt * (globalRabatt.value / 100) 
                : globalRabatt.value;
        }

        // 3. Verrechnungen / Abschlagszahlungen Summe Netto
        const verrechnungenSummeNetto = verrechnungen.reduce(
            (sum, v) => sum + (parseFloat(v.abzugsbetrag_netto) || 0), 
            0
        );

        // 4. Netto / Brutto nach Rabatt & Steuern
        let nettoNachRabatt = 0;
        let bruttoNachRabatt = 0;
        let sicherheitseinbehaltNetto = 0;
        const taxBreakdown = [];
        let totalTax = 0;

        if (mode === 'netto') {
            nettoNachRabatt = Math.max(0, positionenNetto - abzug);
            const rabattFaktor = positionenNetto > 0 ? (nettoNachRabatt / positionenNetto) : 1;

            if (sicherheitseinbehaltProzent > 0) {
                sicherheitseinbehaltNetto = nettoNachRabatt * (sicherheitseinbehaltProzent / 100);
            }

            const steuerpflichtigesNetto = Math.max(0, nettoNachRabatt - sicherheitseinbehaltNetto - verrechnungenSummeNetto);
            const taxableRatio = nettoNachRabatt > 0 ? (steuerpflichtigesNetto / nettoNachRabatt) : 0;

            Object.keys(taxes).forEach(rate => {
                const baseTax = taxes[rate] * rabattFaktor;
                const adjustedTax = baseTax * taxableRatio;
                totalTax += adjustedTax;
                taxBreakdown.push({
                    rate: parseFloat(rate),
                    amount: adjustedTax,
                    label: `zzgl. ${rate}% MwSt.` + (taxableRatio < 1 ? ` (auf gemindertes Netto)` : ''),
                    isReduced: taxableRatio < 1
                });
            });

            bruttoNachRabatt = steuerpflichtigesNetto + totalTax;
        } else {
            // Mode Brutto
            bruttoNachRabatt = Math.max(0, positionenBrutto - abzug);
            const rabattFaktor = positionenBrutto > 0 ? (bruttoNachRabatt / positionenBrutto) : 1;

            let totalTaxBase = 0;
            Object.keys(taxes).forEach(rate => {
                totalTaxBase += (taxes[rate] * rabattFaktor);
            });
            nettoNachRabatt = bruttoNachRabatt - totalTaxBase;

            if (sicherheitseinbehaltProzent > 0) {
                sicherheitseinbehaltNetto = nettoNachRabatt * (sicherheitseinbehaltProzent / 100);
            }

            const steuerpflichtigesNetto = Math.max(0, nettoNachRabatt - sicherheitseinbehaltNetto - verrechnungenSummeNetto);
            const taxableRatio = nettoNachRabatt > 0 ? (steuerpflichtigesNetto / nettoNachRabatt) : 0;

            Object.keys(taxes).forEach(rate => {
                const baseTax = taxes[rate] * rabattFaktor;
                const adjustedTax = baseTax * taxableRatio;
                totalTax += adjustedTax;
                taxBreakdown.push({
                    rate: parseFloat(rate),
                    amount: adjustedTax,
                    label: `darin enthaltene ${rate}% MwSt.` + (taxableRatio < 1 ? ` (angepasst)` : ''),
                    isReduced: taxableRatio < 1
                });
            });

            bruttoNachRabatt = steuerpflichtigesNetto + totalTax;
        }

        const zahlbetrag = Math.max(0, bruttoNachRabatt - anzahlung);

        return {
            zwischensumme: mode === 'netto' ? positionenNetto : positionenBrutto,
            positionenNetto,
            positionenBrutto,
            nettoNachRabatt,
            bruttoNachRabatt,
            totals13bNetto,
            totalsNormalNetto,
            sicherheitseinbehaltNetto,
            sicherheitseinbehaltProzent,
            verrechnungenSummeNetto,
            taxBreakdown,
            totalTax,
            anzahlung,
            abzug,
            zahlbetrag,
            processedPositions
        };
    }

    /**
     * Validiert ein Rechnungsdokument vor dem Speichern.
     */
    static validateSaveDocument(doc) {
        if (!doc.kundeId) {
            return { valid: false, message: 'Bitte wählen Sie einen Kunden aus.' };
        }
        if (!doc.positionen || doc.positionen.length === 0) {
            return { valid: false, message: 'Bitte fügen Sie mindestens eine Position hinzu.' };
        }
        if (doc.positionen.some(p => !p.artikelId && !p.name)) {
            return { valid: false, message: 'Bitte wählen Sie für alle Positionen einen Artikel aus oder geben Sie eine Beschreibung ein.' };
        }
        return { valid: true };
    }

    /**
     * Erzeugt die Datenobjekte für eine Stornorechnung (Gutschrift).
     */
    static createStornoData(originalInvoice) {
        if (!originalInvoice) return null;

        const stornoPositionen = JSON.parse(JSON.stringify(originalInvoice.positionen || [])).map(p => {
            p.menge = (parseFloat(p.menge) || 0) * -1;
            return p;
        });

        const stornoNr = "STORNO - " + originalInvoice.nr;
        const today = new Date().toISOString().split('T')[0];

        const updatedOriginal = {
            ...originalInvoice,
            status: 'Storniert',
            isLocked: true
        };

        const stornoDoc = {
            id: null,
            type: 'rechnung',
            nr: stornoNr,
            datum: today,
            faellig: today,
            kundeId: originalInvoice.kundeId,
            projektId: originalInvoice.projektId,
            positionen: stornoPositionen,
            netto: (originalInvoice.netto || 0) * -1,
            steuer: (originalInvoice.steuer || 0) * -1,
            brutto: (originalInvoice.brutto || 0) * -1,
            globalRabattAbzug: ((originalInvoice.globalRabattAbzug || 0) * -1),
            anzahlung: 0,
            zahlbetrag: ((originalInvoice.zahlbetrag || originalInvoice.brutto) || 0) * -1,
            status: 'Bezahlt',
            isLocked: true
        };

        return { updatedOriginal, stornoDoc, stornoNr };
    }
};
