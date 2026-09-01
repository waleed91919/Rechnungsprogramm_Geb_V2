/**
 * InvoiceController.js - Geschäftsschicht & Berechnungslogik für Rechnungen
 * Steuert Berechnungen von § 13b UStG, Rabatten, Sicherheitseinbehalt, Verrechnungen, Anzahlungen, Stornierung & Speichervalidierung.
 */
class InvoiceController {
    /**
     * Rundet monetäre Werte konsistent auf 2 Dezimalstellen (Cent).
     * Identische Formel wie EInvoiceEngine.round2 (js/einvoice.js), damit
     * beide Rechner zu bitidentischen Summen kommen.
     */
    static round2(value) {
        return Math.round((parseFloat(value) + Number.EPSILON) * 100) / 100;
    }

    /**
     * Berechnet alle Netto-, Brutto-, Steuersummen und Zahlbeträge einer Rechnung.
     * Alle monetären Zwischen- und Endergebnisse werden auf Cent gerundet:
     * - Positionssummen je Zeile,
     * - Steuer je Steuersatzgruppe (Basis proportional gemindert, dann je Gruppe gerundet),
     * - Globalrabatt, Sicherheitseinbehalt, Verrechnungen, Brutto, Zahlbetrag.
     * Die Gesamtsteuersumme folgt den gerundeten Gruppenbeträgen, dadurch gehen
     * Netto + Steuer = Brutto und die Aufschlüsselung immer exakt auf.
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
        const taxBases = { 19: 0, 7: 0 };

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
                rowNetto = this.round2((menge * preis) * (1 - rabatt / 100));
                tax = pos13b ? 0 : this.round2(rowNetto * (mwstRate / 100));
                rowBrutto = this.round2(rowNetto + tax);
            } else {
                rowBrutto = this.round2((menge * preis) * (1 - rabatt / 100));
                if (pos13b) {
                    rowNetto = rowBrutto;
                    tax = 0;
                } else {
                    rowNetto = this.round2(rowBrutto / (1 + mwstRate / 100));
                    tax = this.round2(rowBrutto - rowNetto);
                }
            }

            positionenNetto = this.round2(positionenNetto + rowNetto);
            positionenBrutto = this.round2(positionenBrutto + rowBrutto);

            if (pos13b) {
                totals13bNetto = this.round2(totals13bNetto + rowNetto);
            } else {
                totalsNormalNetto = this.round2(totalsNormalNetto + rowNetto);
                if (mwstRate > 0) {
                    taxBases[mwstRate] = this.round2((taxBases[mwstRate] || 0) + rowNetto);
                }
            }

            return { ...pos, rowNetto, rowBrutto, tax, pos13b };
        });

        // 2. Globalen Rabatt berechnen
        const baseForGlobalRabatt = mode === 'netto' ? positionenNetto : positionenBrutto;
        let abzug = 0;
        if (globalRabatt.value > 0) {
            abzug = this.round2(globalRabatt.type === '%'
                ? baseForGlobalRabatt * (globalRabatt.value / 100)
                : globalRabatt.value);
        }

        // 3. Verrechnungen / Abschlagszahlungen Summe Netto
        const verrechnungenSummeNetto = this.round2(verrechnungen.reduce(
            (sum, v) => sum + (parseFloat(v.abzugsbetrag_netto) || 0),
            0
        ));

        // 4. Netto / Brutto nach Rabatt & Steuern
        let nettoNachRabatt = 0;
        let bruttoNachRabatt = 0;
        let sicherheitseinbehaltNetto = 0;
        const taxBreakdown = [];
        let totalTax = 0;

        if (mode === 'netto') {
            nettoNachRabatt = this.round2(Math.max(0, positionenNetto - abzug));
            const rabattFaktor = positionenNetto > 0 ? (nettoNachRabatt / positionenNetto) : 1;

            if (sicherheitseinbehaltProzent > 0) {
                sicherheitseinbehaltNetto = this.round2(nettoNachRabatt * (sicherheitseinbehaltProzent / 100));
            }

            const steuerpflichtigesNetto = this.round2(Math.max(
                0,
                this.round2(this.round2(nettoNachRabatt - sicherheitseinbehaltNetto) - verrechnungenSummeNetto)
            ));
            const taxableRatio = nettoNachRabatt > 0 ? (steuerpflichtigesNetto / nettoNachRabatt) : 0;

            Object.keys(taxBases).forEach(rate => {
                const rateValue = parseFloat(rate);
                const basisAdj = this.round2(taxBases[rate] * rabattFaktor * taxableRatio);
                const adjustedTax = rateValue > 0 ? this.round2(basisAdj * rateValue / 100) : 0;
                totalTax = this.round2(totalTax + adjustedTax);
                taxBreakdown.push({
                    rate: rateValue,
                    amount: adjustedTax,
                    label: `zzgl. ${rate}% MwSt.` + (taxableRatio < 1 ? ` (auf gemindertes Netto)` : ''),
                    isReduced: taxableRatio < 1
                });
            });

            bruttoNachRabatt = this.round2(steuerpflichtigesNetto + totalTax);
        } else {
            // Mode Brutto
            bruttoNachRabatt = this.round2(Math.max(0, positionenBrutto - abzug));
            const rabattFaktor = positionenBrutto > 0 ? (bruttoNachRabatt / positionenBrutto) : 1;

            // Steuer je Gruppe auf rabattierter Basis, je Gruppe centgenau gerundet
            const reducedTaxes = {};
            let totalTaxBase = 0;
            Object.keys(taxBases).forEach(rate => {
                const rateValue = parseFloat(rate);
                const basisAdj = this.round2(taxBases[rate] * rabattFaktor);
                const taxOnReduced = rateValue > 0 ? this.round2(basisAdj * rateValue / 100) : 0;
                reducedTaxes[rate] = taxOnReduced;
                totalTaxBase = this.round2(totalTaxBase + taxOnReduced);
            });
            nettoNachRabatt = this.round2(bruttoNachRabatt - totalTaxBase);

            if (sicherheitseinbehaltProzent > 0) {
                sicherheitseinbehaltNetto = this.round2(nettoNachRabatt * (sicherheitseinbehaltProzent / 100));
            }

            const steuerpflichtigesNetto = this.round2(Math.max(
                0,
                this.round2(this.round2(nettoNachRabatt - sicherheitseinbehaltNetto) - verrechnungenSummeNetto)
            ));
            const taxableRatio = nettoNachRabatt > 0 ? (steuerpflichtigesNetto / nettoNachRabatt) : 0;

            Object.keys(reducedTaxes).forEach(rate => {
                const rateValue = parseFloat(rate);
                const adjustedTax = this.round2(reducedTaxes[rate] * taxableRatio);
                totalTax = this.round2(totalTax + adjustedTax);
                taxBreakdown.push({
                    rate: rateValue,
                    amount: adjustedTax,
                    label: `darin enthaltene ${rate}% MwSt.` + (taxableRatio < 1 ? ` (angepasst)` : ''),
                    isReduced: taxableRatio < 1
                });
            });

            bruttoNachRabatt = this.round2(steuerpflichtigesNetto + totalTax);
        }

        const anzahlungCent = this.round2(anzahlung);
        const zahlbetrag = this.round2(Math.max(0, bruttoNachRabatt - anzahlungCent));

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
            anzahlung: anzahlungCent,
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
        // Compliance-Check 1: B2C darf niemals § 13b Reverse-Charge enthalten
        if ((doc.customer_type === 'B2C' || doc.ist_privatkunde) && doc.unterliegt_13b) {
            return { valid: false, message: 'Das Reverse-Charge-Verfahren nach § 13b UStG ist gegenüber Privatkunden (B2C) unzulässig.' };
        }
        // Compliance-Check 2: B2G erfordert Netto-Preise gem. EN 16931
        if (doc.customer_type === 'B2G' && doc.eingabemodus === 'brutto') {
            return { valid: false, message: 'Rechnungen an öffentliche Auftraggeber (B2G) erfordern zwingend Netto-Einzelpreise gemäß EU-Norm EN 16931.' };
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
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = InvoiceController;
}
if (typeof window !== 'undefined') {
    window.InvoiceController = InvoiceController;
}
