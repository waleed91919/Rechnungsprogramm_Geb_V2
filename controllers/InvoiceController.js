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
        retentionMode = 'WARRANTY',
        contractTotalNet = 0,
        maxRetentionRate = 5.0,
        retentionBase = 'netto',
        verrechnungen = [],
        anzahlung = 0,
        previousRetentionTotal = 0,
        previousInvoices = [],
        totalPerformanceNet = null
    }) {
        // EINE Einbehalt-Quelle (P0.2): Vorgänger-Einbehalte aus gespeicherten
        // Belegen ableiten, nie aus Formular-State raten. previousInvoices hat
        // Vorrang, previousRetentionTotal ist der explizite Fallback.
        const prevRetention = (Array.isArray(previousInvoices) && previousInvoices.length > 0)
            ? this.sumPreviousRetention(previousInvoices)
            : (parseFloat(previousRetentionTotal) || 0);
        let positionenNetto = 0;
        let positionenBrutto = 0;
        let totals13bNetto = 0;
        let totalsNormalNetto = 0;
        const taxBases = {};

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
                taxBases[mwstRate] = this.round2((taxBases[mwstRate] || 0) + rowNetto);
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

        // 3. Verrechnungen / Abschlagszahlungen Summe Netto & Brutto
        const verrechnungenSummeNetto = this.round2(verrechnungen.reduce(
            (sum, v) => sum + (parseFloat(v && v.abzugsbetrag_netto) || (v && parseFloat(v.betrag)) || 0),
            0
        ));
        const verrechnungenSummeBrutto = this.round2(verrechnungen.reduce((sum, v) => {
            if (v && v.abzugsbetrag_brutto !== undefined && v.abzugsbetrag_brutto !== null && Number.isFinite(parseFloat(v.abzugsbetrag_brutto))) {
                return sum + parseFloat(v.abzugsbetrag_brutto);
            }
            const net = parseFloat(v && v.abzugsbetrag_netto) || (v && parseFloat(v.betrag)) || 0;
            const rate = isGlobal13b ? 0 : (parseFloat(v && v.mwst) || 19.0);
            return sum + this.round2(net * (1 + rate / 100));
        }, 0));

        // 4. Netto / Brutto nach Rabatt & Steuern
        let nettoNachRabatt = 0;
        let bruttoNachRabatt = 0;
        let sicherheitseinbehaltNetto = 0;
        const taxBreakdown = [];
        let totalTax = 0;

        let isCapped = false;
        let maxRetentionCap = null;
        let vobAHint = null;

        const calcRetention = (baseNet) => {
            // Kumulative Einbehalt-Logik (einzige Stelle, P0.2 — gespiegelt zu
            // CumulativeBillingController.calculateCumulativeInvoice):
            // Ziel-Einbehalt auf kumulierter Leistung minus bereits einbehalten.
            if (sicherheitseinbehaltProzent <= 0) return 0;
            const rate = parseFloat(sicherheitseinbehaltProzent) || 0;
            const cumulativeBaseNet = (totalPerformanceNet !== null && totalPerformanceNet !== undefined)
                ? (parseFloat(totalPerformanceNet) || 0)
                : (parseFloat(baseNet) || 0) + (Array.isArray(previousInvoices) && previousInvoices.length > 0
                    ? previousInvoices.reduce((s, inv) => s + (parseFloat(inv.netto) || parseFloat(inv.currentPeriodNet) || parseFloat(inv.kumulierte_leistung_netto) || 0), 0)
                    : 0);

            // H-1 & VOB/B § 17 Abs. 6 S. 2: Bei 13b zwingend Netto, sonst vertraglich Netto oder Brutto
            const effectiveBaseMode = isGlobal13b ? 'netto' : String(retentionBase || 'netto').toLowerCase();
            let effectiveBase = cumulativeBaseNet;
            if (effectiveBaseMode === 'brutto') {
                const avgTaxRate = (nettoNachRabatt > 0 && totalTax > 0) ? (totalTax / nettoNachRabatt) : (isGlobal13b ? 0 : 0.19);
                effectiveBase = this.round2(cumulativeBaseNet * (1 + avgTaxRate));
            }

            const uncappedTarget = this.round2(effectiveBase * (rate / 100));
            let target = uncappedTarget;
            if (retentionMode === 'EXECUTION') {
                const cNet = parseFloat(contractTotalNet) || 0;
                if (cNet > 0 && cNet < 250000) {
                    vobAHint = 'Gemäß VOB/A § 9c Abs. 2 soll bei einem Netto-Auftragswert unter 250.000 € auf die Vereinbarung einer Vertragserfüllungssicherheit verzichtet werden.';
                }
                if (cNet > 0) {
                    const mRate = parseFloat(maxRetentionRate) || 5.0;
                    const effectiveCapBase = effectiveBaseMode === 'brutto'
                        ? this.round2(cNet * (1 + ((nettoNachRabatt > 0 && totalTax > 0) ? (totalTax / nettoNachRabatt) : 0.19)))
                        : cNet;
                    maxRetentionCap = this.round2(effectiveCapBase * (mRate / 100));
                    if (target >= maxRetentionCap) {
                        isCapped = true;
                        target = maxRetentionCap;
                    }
                }
            }
            // Perioden-Einbehalt = kumulatives Ziel minus Vorgänger-Einbehalte.
            return this.round2(Math.max(0, target - prevRetention));
        };

        if (mode === 'netto') {
            nettoNachRabatt = this.round2(Math.max(0, positionenNetto - abzug));
            const rabattFaktor = positionenNetto > 0 ? (nettoNachRabatt / positionenNetto) : 1;

            // § 14 Abs. 5 UStG & EN 16931: Weder Einbehalte noch Abschlagsverrechnungen
            // mindern die Steuerbemessungsgrundlage der Gesamtleistung!
            // Die Steuer bemisst sich ausnahmslos auf das volle Netto nach Rabatt.
            const taxRates = Object.keys(taxBases)
                .filter(rate => taxBases[rate] > 0)
                .sort((a, b) => parseFloat(b) - parseFloat(a));

            taxRates.forEach(rate => {
                const rateValue = parseFloat(rate);
                const basisAdj = this.round2(taxBases[rate] * rabattFaktor);
                const adjustedTax = rateValue > 0 ? this.round2(basisAdj * rateValue / 100) : 0;
                totalTax = this.round2(totalTax + adjustedTax);
                taxBreakdown.push({
                    rate: rateValue,
                    amount: adjustedTax,
                    label: `zzgl. ${rate}% MwSt.`
                });
            });

            bruttoNachRabatt = this.round2(nettoNachRabatt + totalTax);

            // B-4 & H-1: Sicherheitseinbehalt erst NACH der Steuerermittlung berechnen
            sicherheitseinbehaltNetto = calcRetention(nettoNachRabatt);
        } else {
            // Mode Brutto
            bruttoNachRabatt = this.round2(Math.max(0, positionenBrutto - abzug));
            const rabattFaktor = positionenBrutto > 0 ? (bruttoNachRabatt / positionenBrutto) : 1;

            const taxRates = Object.keys(taxBases)
                .filter(rate => taxBases[rate] > 0)
                .sort((a, b) => parseFloat(b) - parseFloat(a));

            // Steuer je Gruppe auf rabattierter Basis, je Gruppe centgenau gerundet
            const reducedTaxes = {};
            let totalTaxBase = 0;
            taxRates.forEach(rate => {
                const rateValue = parseFloat(rate);
                const basisAdj = this.round2(taxBases[rate] * rabattFaktor);
                const taxOnReduced = rateValue > 0 ? this.round2(basisAdj * rateValue / 100) : 0;
                reducedTaxes[rate] = taxOnReduced;
                totalTaxBase = this.round2(totalTaxBase + taxOnReduced);
            });
            nettoNachRabatt = this.round2(bruttoNachRabatt - totalTaxBase);

            taxRates.forEach(rate => {
                const rateValue = parseFloat(rate);
                const taxOnReduced = reducedTaxes[rate] || 0;
                totalTax = this.round2(totalTax + taxOnReduced);
                taxBreakdown.push({
                    rate: rateValue,
                    amount: taxOnReduced,
                    label: `darin enthaltene ${rate}% MwSt.`
                });
            });

            // B-4 & H-1: Sicherheitseinbehalt erst NACH der Steuerermittlung berechnen
            sicherheitseinbehaltNetto = calcRetention(nettoNachRabatt);
        }

        const anzahlungCent = this.round2(anzahlung);
        // Zahlbetrag = Brutto abzüglich Anzahlung, Sicherheitseinbehalt und Abschlagsverrechnungen (brutto)
        const zahlbetrag = this.round2(Math.max(0, bruttoNachRabatt - anzahlungCent - sicherheitseinbehaltNetto - verrechnungenSummeBrutto));

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
            retentionMode,
            retentionBase: isGlobal13b ? 'netto' : String(retentionBase || 'netto').toLowerCase(),
            isCapped,
            maxRetentionCap,
            contractTotalNet: parseFloat(contractTotalNet) || 0,
            previousRetentionTotal: this.round2(prevRetention),
            vobAHint,
            verrechnungenSummeNetto,
            verrechnungenSummeBrutto,
            taxBreakdown,
            totalTax,
            anzahlung: anzahlungCent,
            abzug,
            zahlbetrag,
            processedPositions
        };
    }

    /**
     * Summiert bereits einbehaltene Beträge aller Vorgänger-Abschläge
     * (einzige Summierungsstelle neben CumulativeBillingController).
     */
    static sumPreviousRetention(previousInvoices = []) {
        return this.round2((previousInvoices || []).reduce((sum, inv) => {
            return sum + (parseFloat(inv.sicherheitseinbehalt) || parseFloat(inv.sicherheitseinbehaltNetto) || parseFloat(inv.securityRetentionAmount) || 0);
        }, 0));
    }

    /**
     * OPOS-Abgleich (P0.2 / SAL-1): trennt Leistung / Faktura / Zahlung / Einbehalt.
     * Kaufmännisch korrigierte Saldenformel gem. VOB/B § 17.
     * Offener Saldo = (fakturiert + freigegebeneEinbehalte) − gezahlt.
     */
    static computeProjectBalance({ invoices = [], paymentsTotal = 0, releasedRetentionTotal = 0 } = {}) {
        const r2 = (v) => this.round2(v);
        const fakturiert = r2(invoices.reduce((s, i) => s + (parseFloat(i.zahlbetrag) || 0), 0));
        const gezahlt = r2(paymentsTotal);
        const freigegeben = r2(releasedRetentionTotal);

        const einbehaltenGesamt = r2(invoices.reduce((s, i) => {
            return s + (parseFloat(i.sicherheitseinbehalt) || parseFloat(i.sicherheitseinbehaltNetto) || parseFloat(i.securityRetentionAmount) || 0);
        }, 0));

        const einbehaltenOffen = r2(Math.max(0, einbehaltenGesamt - freigegeben));

        // SAL-1 (B-8) FIX:
        // Freigegebene Einbehalte begründen eine fällige Werklohnforderung!
        // Offener Saldo = (Fakturiert + Freigegeben) - Gezahlt
        const faelligeForderung = r2(fakturiert + freigegeben);
        const offenerSaldo = r2(Math.max(0, faelligeForderung - gezahlt));

        return {
            fakturiert,
            gezahlt,
            freigegebeneEinbehalte: freigegeben,
            einbehaltenGesamt,
            einbehaltenOffen,
            faelligeForderung,
            offenerSaldo
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
        // Compliance-Check 3: B2G erfordert Leitweg-ID gem. XRechnung / ZUGFeRD
        if (doc.customer_type === 'B2G' && !doc.leitweg_id && !doc.buyer_reference) {
            return { valid: false, message: 'Rechnungen an öffentliche Auftraggeber (B2G) erfordern zwingend eine Leitweg-ID oder Buyer-Reference.' };
        }

        // Datum-Normalisierung auf ISO YYYY-MM-DD
        if (doc.datum) {
            doc.datum = this.normalizeDateISO(doc.datum);
        }
        if (doc.faellig) {
            doc.faellig = this.normalizeDateISO(doc.faellig);
        }

        return { valid: true };
    }

    /**
     * Normalisiert ein beliebiges Datum (Date-Objekt, DD.MM.YYYY, YYYY-MM-DD) in ein sauberes ISO-Format YYYY-MM-DD.
     */
    static normalizeDateISO(d) {
        if (!d) return '';
        if (typeof d === 'string') {
            const s = d.trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
            const deMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
            if (deMatch) {
                const day = deMatch[1].padStart(2, '0');
                const month = deMatch[2].padStart(2, '0');
                const year = deMatch[3];
                return `${year}-${month}-${day}`;
            }
            const parsed = new Date(s);
            if (!isNaN(parsed.getTime())) {
                const y = parsed.getFullYear();
                const m = String(parsed.getMonth() + 1).padStart(2, '0');
                const day = String(parsed.getDate()).padStart(2, '0');
                return `${y}-${m}-${day}`;
            }
        }
        if (d instanceof Date && !isNaN(d.getTime())) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }
        return '';
    }

    /**
     * Formatiert ein ISO-Datum oder Date-Objekt in das deutsche Standardformat DD.MM.YYYY.
     */
    static formatDateDE(d) {
        const iso = this.normalizeDateISO(d);
        if (!iso) return '';
        const parts = iso.split('-');
        return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }

    /**
     * Formatiert ein Datum inklusive ausgeschriebenem deutschem Wochentag.
     * Beispiel: "05.09.2026 (Samstag)"
     */
    static formatDateDEWithWeekday(d) {
        const iso = this.normalizeDateISO(d);
        if (!iso) return '';
        const parts = iso.split('-');
        const dateObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
        const wochentage = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
        const weekday = wochentage[dateObj.getDay()];
        return `${parts[2]}.${parts[1]}.${parts[0]} (${weekday})`;
    }

    /**
     * Berechnet den Ostersonntag für ein beliebiges Kalenderjahr (Gaußsche Osterformel / Computus).
     */
    static getEasterSunday(year) {
        const y = parseInt(year, 10);
        const a = y % 19;
        const b = Math.floor(y / 100);
        const c = y % 100;
        const d = Math.floor(b / 4);
        const e = b % 4;
        const f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4);
        const k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31);
        const day = ((h + l - 7 * m + 114) % 31) + 1;
        return new Date(y, month - 1, day, 12, 0, 0);
    }

    /**
     * Ermittelt die 9 bundeseinheitlichen gesetzlichen Feiertage in Deutschland für ein Jahr.
     * Rückgabe: Map von YYYY-MM-DD -> Feiertagsname
     */
    static getGermanHolidaysMap(year) {
        const y = parseInt(year, 10);
        const map = new Map();
        map.set(`${y}-01-01`, 'Neujahr');
        map.set(`${y}-05-01`, 'Tag der Arbeit');
        map.set(`${y}-10-03`, 'Tag der Deutschen Einheit');
        map.set(`${y}-12-25`, '1. Weihnachtsfeiertag');
        map.set(`${y}-12-26`, '2. Weihnachtsfeiertag');

        const easter = this.getEasterSunday(y);
        const addDaysToEaster = (offsetDays) => {
            const dt = new Date(easter);
            dt.setDate(dt.getDate() + offsetDays);
            const m = String(dt.getMonth() + 1).padStart(2, '0');
            const d = String(dt.getDate()).padStart(2, '0');
            return `${dt.getFullYear()}-${m}-${d}`;
        };

        map.set(addDaysToEaster(-2), 'Karfreitag');
        map.set(addDaysToEaster(1), 'Ostermontag');
        map.set(addDaysToEaster(39), 'Christi Himmelfahrt');
        map.set(addDaysToEaster(50), 'Pfingstmontag');

        return map;
    }

    /**
     * Prüft, ob ein Datum ein bundesweiter gesetzlicher Feiertag ist.
     */
    static isGermanPublicHoliday(d) {
        const iso = this.normalizeDateISO(d);
        if (!iso) return { isHoliday: false, name: null };
        const y = parseInt(iso.substring(0, 4), 10);
        const holidays = this.getGermanHolidaysMap(y);
        if (holidays.has(iso)) {
            return { isHoliday: true, name: holidays.get(iso) };
        }
        return { isHoliday: false, name: null };
    }

    /**
     * Prüft, ob ein Tag ein echter deutscher Arbeitstag (Werktag Mo–Fr ohne Feiertage) ist.
     */
    static isArbeitstag(d) {
        const iso = this.normalizeDateISO(d);
        if (!iso) return false;
        const parts = iso.split('-');
        const dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
        const dayOfWeek = dt.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) return false; // Sa / So
        return !this.isGermanPublicHoliday(iso).isHoliday;
    }

    /**
     * Berechnet das Fälligkeitsdatum durch Addition von Netto-Arbeitstagen (ohne Sa/So und gesetzl. Feiertage).
     */
    static calculateDueDateWorkingDays(startDate, workingDays = 14) {
        const startIso = this.normalizeDateISO(startDate) || this.normalizeDateISO(new Date());
        const parts = startIso.split('-');
        let current = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
        let needed = Math.max(0, parseInt(workingDays, 10) || 0);
        let added = 0;

        while (added < needed) {
            current.setDate(current.getDate() + 1);
            const dayOfWeek = current.getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) continue;
            const iso = this.normalizeDateISO(current);
            if (this.isGermanPublicHoliday(iso).isHoliday) continue;
            added++;
        }
        return this.normalizeDateISO(current);
    }

    /**
     * Zählt die Anzahl der Arbeitstage zwischen Startdatum und Fälligkeitsdatum.
     */
    static countWorkingDaysBetween(startDate, endDate) {
        const startIso = this.normalizeDateISO(startDate);
        const endIso = this.normalizeDateISO(endDate);
        if (!startIso || !endIso || startIso >= endIso) return 0;

        const startParts = startIso.split('-');
        const endParts = endIso.split('-');
        let current = new Date(parseInt(startParts[0], 10), parseInt(startParts[1], 10) - 1, parseInt(startParts[2], 10), 12, 0, 0);
        const target = new Date(parseInt(endParts[0], 10), parseInt(endParts[1], 10) - 1, parseInt(endParts[2], 10), 12, 0, 0);

        let workingDays = 0;
        while (current < target) {
            current.setDate(current.getDate() + 1);
            const dayOfWeek = current.getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) continue;
            const iso = this.normalizeDateISO(current);
            if (this.isGermanPublicHoliday(iso).isHoliday) continue;
            workingDays++;
        }
        return workingDays;
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
