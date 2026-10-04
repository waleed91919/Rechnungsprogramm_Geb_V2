const interestCalculator = {
    CURRENT_BASE_RATE: 1.52,
    BASE_INTEREST_RATES: [{
  from: '2026-07-01',
  to: null,
  rate: 1.52,
  label: 'ab 01.07.2026'
}, {
  from: '2025-07-01',
  to: '2026-06-30',
  rate: 1.27,
  label: '01.07.2025 - 30.06.2026'
}, {
  from: '2025-01-01',
  to: '2025-06-30',
  rate: 2.27,
  label: '01.01.2025 - 30.06.2025'
}, {
  from: '2024-07-01',
  to: '2024-12-31',
  rate: 3.37,
  label: '01.07.2024 - 31.12.2024'
}, {
  from: null,
  to: '2024-06-30',
  rate: 3.62,
  label: 'bis 30.06.2024'
}],

    /**
 * Liefert den Bundesbank-Basiszinssatz für ein Stichtagsdatum.
 * @param {string|Date} [date] - Stichtagsdatum (Default: heute bzw. CURRENT_BASE_RATE)
 * @returns {number} Basiszinssatz in Prozent
 */
getBaseRateForDate(date) {
  if (!date) return this.CURRENT_BASE_RATE;
  const d = date instanceof Date ? date.toISOString().split('T')[0] : String(date).substring(0, 10);
  for (const entry of this.BASE_INTEREST_RATES) {
    const matchesFrom = !entry.from || d >= entry.from;
    const matchesTo = !entry.to || d <= entry.to;
    if (matchesFrom && matchesTo) {
      return entry.rate;
    }
  }
  return this.CURRENT_BASE_RATE;
},

    /**
 * Hilfsfunktion für VOB/B Zahlungsfristen:
 * - Abschlagsrechnung: 21 Kalendertage (§ 16 Abs. 1 Nr. 3 VOB/B)
 * - Schlussrechnung: 30 Kalendertage nach Prüffrist (§ 16 Abs. 3 Nr. 1 VOB/B)
 * - Maximal zulässig: 60 Kalendertage
 * @param {string} [invoiceType='ABSCHLAG'] - 'ABSCHLAG' | 'SCHLUSSRECHNUNG' | 'SCHLUSS'
 * @returns {number} Zahlungsfrist in Kalendertagen
 */
getVobPaymentTermDays(invoiceType = 'ABSCHLAG') {
  const type = String(invoiceType || '').toUpperCase();
  if (type.includes('SCHLUSS') || type.includes('FINAL')) {
    return 30;
  }
  return 21;
},

    /**
 * Berechnet das VOB/B-Fälligkeitsdatum.
 * Fristvereinbarungen über 60 Kalendertage hinaus sind gem. § 16 Abs. 1 Nr. 3 / Abs. 3 Nr. 1 Satz 2 VOB/B unwirksam und werden auf 60 gedeckelt.
 * @param {string|Date} invoiceDate - Rechnungs-/Zugangsdatum
 * @param {string} [invoiceType='ABSCHLAG'] - 'ABSCHLAG' oder 'SCHLUSSRECHNUNG'
 * @param {number} [agreedDays=null] - Vertraglich vereinbarte Zahlungsfrist (optional)
 * @returns {string} Fälligkeitsdatum als ISO-String (YYYY-MM-DD)
 */
calculateVobDueDate(invoiceDate, invoiceType = 'ABSCHLAG', agreedDays = null) {
  if (!invoiceDate) return '';
  const d = invoiceDate instanceof Date ? new Date(invoiceDate) : new Date(String(invoiceDate).substring(0, 10) + 'T00:00:00Z');
  let days = agreedDays !== null && agreedDays !== undefined && !isNaN(parseInt(agreedDays, 10)) ? Math.min(Math.max(1, parseInt(agreedDays, 10)), 60) : this.getVobPaymentTermDays(invoiceType);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
},

    /**
 * Prüft den Verzugsstatus einer Rechnung unter strikter Trennung von Fälligkeit vs. Verzug.
 * - Fälligkeit tritt ein mit Ablauf des Zahlungsziels (Zahlungserinnerung möglich).
 * - Verzug tritt ein gem. § 286 BGB / § 16 Abs. 5 Nr. 3 VOB/B durch:
 *   1. Explizite Mahnung nach Fälligkeit (§ 286 Abs. 1 BGB), ODER
 *   2. 30 Tage nach Fälligkeit und Rechnungszugang (§ 286 Abs. 3 BGB; bei B2C nur mit vorherigem Hinweis), ODER
 *   3. Bei VOB/B: Ablauf von 21 Kalendertagen (Abschlag) bzw. 30 Kalendertagen (Schlusszahlung gem. § 16 Abs. 5 Nr. 3 VOB/B) nach Fristablauf/Mahnung bzw. 30 Tage nach Fälligkeit.
 * @param {Object} invoice - Rechnungsdaten
 * @param {string|Date} [calculationDate=new Date()] - Berechnungsstichtag
 * @returns {Object} { isDue, isInDefault, daysOverdue, daysInDefault, status, reason }
 */
checkInvoiceDefaultStatus(invoice = {}, calculationDate = new Date()) {
  const dCalcIso = calculationDate instanceof Date ? calculationDate.toISOString().split('T')[0] : String(calculationDate).substring(0, 10);
  const dCalc = new Date(dCalcIso + 'T00:00:00Z');
  const dueIso = invoice.faellig || invoice.dueDate || invoice.datum || invoice.rechnungsdatum || dCalcIso;
  const dDue = new Date(String(dueIso).substring(0, 10) + 'T00:00:00Z');
  const invoiceDateIso = invoice.datum || invoice.rechnungsdatum || invoice.invoiceDate || dueIso;
  const dInvoice = new Date(String(invoiceDateIso).substring(0, 10) + 'T00:00:00Z');

  // Tage seit Fälligkeit
  const diffDueMs = dCalc.getTime() - dDue.getTime();
  const daysOverdue = Math.max(0, Math.floor(diffDueMs / 86400000));
  const isDue = daysOverdue > 0;
  if (!isDue) {
    return {
      isDue: false,
      isInDefault: false,
      daysOverdue: 0,
      daysInDefault: 0,
      status: 'OFFEN',
      reason: 'Forderung noch nicht fällig'
    };
  }
  const isB2B = invoice.customer_type ? invoice.customer_type === 'B2B' || invoice.customer_type === 'B2G' : !invoice.ist_privatkunde && !invoice.ist_verbraucher;
  const isVob = !!(invoice.is_vob || invoice.vob || invoice.vertragsart === 'VOB');

  // Prüfung auf Verzug
  let isInDefault = false;
  let defaultReason = '';
  let daysInDefault = 0;

  // 1. Explizite Mahnung nach Fälligkeit (§ 286 Abs. 1 BGB)
  const hasExplicitMahnung = Boolean(invoice.in_verzug || invoice.has_mahnung || invoice.has_reminder === false && invoice.mahnstufe > 0 || invoice.mahnstufe && invoice.mahnstufe > 0 || invoice.gemahnt_am);
  if (hasExplicitMahnung) {
    isInDefault = true;
    defaultReason = 'Mahnung nach Fälligkeit (§ 286 Abs. 1 BGB)';
    if (invoice.gemahnt_am) {
      const dMahn = new Date(String(invoice.gemahnt_am).substring(0, 10) + 'T00:00:00Z');
      const diffMahnMs = dCalc.getTime() - dMahn.getTime();
      daysInDefault = Math.max(1, Math.floor(diffMahnMs / 86400000));
    } else {
      daysInDefault = daysOverdue;
    }
  }

  // 2. 30-Tage-Regel (§ 286 Abs. 3 BGB): 30 Tage nach Fälligkeit und Rechnungszugang
  const diffAccessMs = dCalc.getTime() - Math.max(dDue.getTime(), dInvoice.getTime());
  const daysSinceDueAndAccess = Math.floor(diffAccessMs / 86400000);
  if (!isInDefault && daysSinceDueAndAccess >= 30) {
    // Bei Verbrauchern greift § 286 Abs. 3 nur bei entsprechendem Hinweis (§ 286 Abs. 3 Satz 1 Halbsatz 2 BGB)
    const inv = invoice;
    const canApply30DayRule = isB2B || Boolean(inv.hat_verzugshinweis);
    if (canApply30DayRule) {
      isInDefault = true;
      defaultReason = 'Ablauf von 30 Tagen nach Fälligkeit und Rechnungszugang (§ 286 Abs. 3 BGB)';
      daysInDefault = Math.max(1, daysSinceDueAndAccess - 30);
    }
  }

  // 3. VOB/B (§ 16 Abs. 5 Nr. 3 VOB/B)
  if (!isInDefault && isVob) {
    const vobTermDays = this.getVobPaymentTermDays(invoice.invoice_type || invoice.rechnungsart);
    if (invoice.vob_nachfrist_abgelaufen || daysSinceDueAndAccess >= 30) {
      isInDefault = true;
      defaultReason = `VOB/B § 16 Abs. 5 Nr. 3 (${vobTermDays} Kalendertage Frist abgelaufen)`;
      daysInDefault = Math.max(1, daysOverdue);
    }
  }
  return {
    isDue,
    isInDefault,
    daysOverdue,
    daysInDefault: isInDefault ? Math.max(1, daysInDefault) : 0,
    status: isInDefault ? 'VERZUG' : 'FAELLIG',
    reason: isInDefault ? defaultReason : 'Fällig, aber noch nicht im Verzug (Zahlungserinnerung)'
  };
},

    /**
 * Berechnet die gesetzlichen Verzugszinsen nach § 288 BGB und VOB/B § 16 Abs. 5.
 * Zinsmethode: Deutsche kaufmännische Zinsmethode (act/360).
 * B2B: Basiszinssatz + 9 Prozentpunkte (§ 288 Abs. 2 BGB, aktuell 10.52%)
 * B2C: Basiszinssatz + 5 Prozentpunkte (§ 288 Abs. 1 BGB, aktuell 6.52%)
 * @param {Object} params - { amount, dueDate, paymentDate, isB2B, baseRate, splitPeriods }
 * @returns {Object} Detailliertes Verzugszinsergebnis
 */
calculateDefaultInterest({
  amount = 0,
  dueDate,
  paymentDate = new Date(),
  isB2B = true,
  baseRate = null,
  splitPeriods = false
}) {
  const principal = Math.round((parseFloat(amount) || 0) * 100) / 100;
  const dueIso = dueDate ? dueDate instanceof Date ? dueDate.toISOString().split('T')[0] : String(dueDate).substring(0, 10) : '';
  const payIso = paymentDate instanceof Date ? paymentDate.toISOString().split('T')[0] : String(paymentDate).substring(0, 10);
  let resolvedBaseRate;
  if (baseRate !== null && baseRate !== undefined && !isNaN(parseFloat(baseRate))) {
    resolvedBaseRate = parseFloat(baseRate);
  } else {
    resolvedBaseRate = this.getBaseRateForDate(dueIso || payIso);
  }
  if (!dueDate || principal <= 0) {
    return {
      amount: principal,
      dueDate: dueIso,
      paymentDate: payIso,
      daysOverdue: 0,
      isB2B,
      baseRate: resolvedBaseRate,
      appliedInterestRate: 0,
      interestAmount: 0.00
    };
  }
  const dDue = new Date(dueIso + 'T00:00:00Z');
  const dPay = new Date(payIso + 'T00:00:00Z');
  const diffMs = dPay.getTime() - dDue.getTime();
  const daysOverdue = Math.max(0, Math.floor(diffMs / 86400000));
  const premium = isB2B ? 9.00 : 5.00;

  // Zeitabschnittsbasierte Berechnung über Stichtage hinweg
  if (splitPeriods && (baseRate === null || baseRate === undefined) && daysOverdue > 0) {
    let totalInterest = 0;
    const periods = [];
    let curStart = new Date(dDue.getTime());
    curStart.setUTCDate(curStart.getUTCDate() + 1);
    while (curStart <= dPay) {
      const curIso = curStart.toISOString().split('T')[0];
      const curRate = this.getBaseRateForDate(curIso);
      const curApplied = Math.round((curRate + premium) * 100) / 100;
      const matchingEntry = this.BASE_INTEREST_RATES.find(e => (!e.from || curIso >= e.from) && (!e.to || curIso <= e.to));
      let nextBoundary = dPay;
      if (matchingEntry && matchingEntry.to) {
        const toDate = new Date(matchingEntry.to + 'T00:00:00Z');
        if (toDate < dPay) nextBoundary = toDate;
      }
      const segDays = Math.floor((nextBoundary.getTime() - curStart.getTime()) / 86400000) + 1;
      const segInterest = Math.round(principal * (curApplied / 100) * (segDays / 360) * 100) / 100;
      totalInterest += segInterest;
      periods.push({
        from: curStart.toISOString().split('T')[0],
        to: nextBoundary.toISOString().split('T')[0],
        days: segDays,
        baseRate: curRate,
        appliedInterestRate: curApplied,
        interestAmount: segInterest
      });
      curStart = new Date(nextBoundary.getTime());
      curStart.setUTCDate(curStart.getUTCDate() + 1);
    }
    return {
      amount: principal,
      dueDate: dueIso,
      paymentDate: payIso,
      daysOverdue,
      isB2B,
      baseRate: resolvedBaseRate,
      appliedInterestRate: Math.round((resolvedBaseRate + premium) * 100) / 100,
      interestAmount: Math.round(totalInterest * 100) / 100,
      periods
    };
  }
  const appliedInterestRate = Math.round((resolvedBaseRate + premium) * 100) / 100;
  let interestAmount = 0.00;
  if (daysOverdue > 0) {
    // Z = K * (p / 100) * (t / 360) (Deutsche kaufmännische Zinsmethode act/360)
    interestAmount = Math.round(principal * (appliedInterestRate / 100) * (daysOverdue / 360) * 100) / 100;
  }
  return {
    amount: principal,
    dueDate: dueIso,
    paymentDate: payIso,
    daysOverdue,
    isB2B,
    baseRate: resolvedBaseRate,
    appliedInterestRate,
    interestAmount
  };
},

    /**
 * Ermittelt die gesetzliche Verzugsschadenspauschale nach § 288 Abs. 5 BGB.
 * Für Geschäftskunden (B2B) beträgt die Pauschale bei Verzug 40,00 Euro kraft Gesetzes.
 * @param {boolean} [isB2B=true] - Handelt es sich um ein B2B-Rechtsgeschäft?
 * @param {boolean} [isOverdue=true] - Befindet sich die Forderung im Verzug?
 * @returns {number} 40.00 oder 0.00
 */
calculateLatePaymentFee(isB2B = true, isOverdue = true) {
  return isB2B && isOverdue ? 40.00 : 0.00;
},

    /**
 * Erstellt eine Gesamtaufstellung aller offenen Posten mit Verzugszinsen und 40-€-Pauschale für das Mahnwesen.
 * Trennt strikt zwischen Fälligkeit (Zahlungserinnerung) und Verzug (§ 286 BGB / § 16 Abs. 5 Nr. 3 VOB/B).
 * @param {Object} params - { invoices, calculationDate, baseRate, mahngebuehrJeRechnung }
 * @returns {Object} Mahnberechnungs-Zusammenfassung
 */
calculateMahnungClaims({
  invoices = [],
  calculationDate = new Date(),
  baseRate = null,
  mahngebuehrJeRechnung = 0.00
}) {
  let totalPrincipal = 0;
  let totalInterest = 0;
  let totalLateFee = 0;
  let totalMahngebuehr = 0;
  const calculatedInvoices = invoices.map(inv => {
    const amount = parseFloat(inv.offen) || parseFloat(inv.brutto) - (parseFloat(inv.bezahlt_betrag) || 0) || 0;
    const isB2B = inv.customer_type ? inv.customer_type === 'B2B' || inv.customer_type === 'B2G' : !inv.ist_privatkunde && !inv.ist_verbraucher;

    // Fälligkeit vs. Verzug strikt prüfen
    const defaultCheck = this.checkInvoiceDefaultStatus(inv, calculationDate);
    const isInDefault = defaultCheck.isInDefault;
    const zinsInfo = this.calculateDefaultInterest({
      amount,
      dueDate: inv.faellig || inv.datum,
      paymentDate: calculationDate,
      isB2B,
      baseRate
    });

    // 40-€-Pauschale und Verzugszinsen dürfen erst berechnet werden, wenn tatsächlich Verzug vorliegt!
    const interestAmount = isInDefault ? zinsInfo.interestAmount : 0.00;
    const lateFee = this.calculateLatePaymentFee(isB2B, isInDefault);
    const gebuehr = isInDefault ? parseFloat(mahngebuehrJeRechnung) || 0 : 0;
    const gesamtRechnung = Math.round((amount + interestAmount + lateFee + gebuehr) * 100) / 100;
    totalPrincipal += amount;
    totalInterest += interestAmount;
    totalLateFee += lateFee;
    totalMahngebuehr += gebuehr;
    return {
      id: inv.id,
      nr: inv.nr || inv.rechnungs_nr,
      amount: Math.round(amount * 100) / 100,
      dueDate: zinsInfo.dueDate,
      daysOverdue: defaultCheck.daysOverdue,
      daysInDefault: defaultCheck.daysInDefault,
      isDue: defaultCheck.isDue,
      isInDefault,
      status: defaultCheck.status,
      statusReason: defaultCheck.reason,
      isB2B,
      interestRate: zinsInfo.appliedInterestRate,
      interestAmount,
      lateFee,
      mahngebuehr: gebuehr,
      totalDue: gesamtRechnung
    };
  });
  totalPrincipal = Math.round(totalPrincipal * 100) / 100;
  totalInterest = Math.round(totalInterest * 100) / 100;
  totalLateFee = Math.round(totalLateFee * 100) / 100;
  totalMahngebuehr = Math.round(totalMahngebuehr * 100) / 100;
  const totalClaim = Math.round((totalPrincipal + totalInterest + totalLateFee + totalMahngebuehr) * 100) / 100;
  const resolvedBase = baseRate !== null && baseRate !== undefined && !isNaN(parseFloat(baseRate)) ? parseFloat(baseRate) : this.getBaseRateForDate(calculationDate);
  return {
    calculationDate: calculationDate instanceof Date ? calculationDate.toISOString().split('T')[0] : String(calculationDate).substring(0, 10),
    baseRate: resolvedBase,
    invoices: calculatedInvoices,
    totalPrincipal,
    totalInterest,
    totalLateFee,
    totalMahngebuehr,
    totalClaim
  };
},

};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = interestCalculator;
}
if (typeof window !== 'undefined') {
    window.interestCalculator = interestCalculator;
}

if (typeof window !== 'undefined') {
    window.InterestCalculator = interestCalculator;
}
