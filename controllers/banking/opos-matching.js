const oposMatching = {
    /**
 * Prüft, ob ein Verwendungszweck eine gegebene Rechnungsnummer referenziert.
 * Härtung gegen OPOS-1: Schließt isolierte Jahreszahlen (2000..2099) strikt aus.
 */
_matchesNumberVariant(text, docNr) {
  if (!text || !docNr) return false;
  const upperText = String(text).toUpperCase();
  const upperDoc = String(docNr).toUpperCase().trim();

  // 1. Exakter Match
  if (upperText.includes(upperDoc)) return true;

  // 2. Delimiter-bereinigter Match (z.B. "RE20260042")
  const strippedDoc = upperDoc.replace(/[^A-Z0-9]/g, '');
  const strippedText = upperText.replace(/[^A-Z0-9]/g, '');
  if (strippedDoc && strippedDoc.length >= 4 && strippedText.includes(strippedDoc)) {
    return true;
  }

  // 3. Strukturierter Match mit Präfix und Trennzeichen
  const escapeRegex = s => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const docWordRegex = new RegExp(`\\b${escapeRegex(upperDoc)}\\b`, 'i');
  if (docWordRegex.test(upperText)) return true;

  // 4. Strukturierte Zerlegung in Jahreszahl und laufende Nummer (z.B. RE-2026-0042)
  const partsMatch = upperDoc.match(/^(?:([A-Z]+)[-_/\s]*)?(\d{4})[-_/\s]+(\d{1,8})$/i);
  if (partsMatch) {
    const prefix = partsMatch[1] || 'RE';
    const year = partsMatch[2];
    const seq = partsMatch[3];
    const seqInt = parseInt(seq, 10);

    // Match mit optionalen Trennzeichen: "RE 2026/42" oder "2026-0042"
    const structuredRegex = new RegExp(`(?:${prefix}[-_\\s/]*)?${year}[-_\\s/]+0*${seqInt}\\b`, 'i');
    if (structuredRegex.test(upperText)) return true;

    // Match: Präfix direkt vor der Sequenznummer (z.B. "RE-42" oder "RN 0042")
    if (seq.length >= 2) {
      const prefixSeqRegex = new RegExp(`\\b(?:RE|RN|RG|RECHNUNG|RE-NR|R-NR)[-_\\s]*0*${seqInt}\\b`, 'i');
      if (prefixSeqRegex.test(upperText)) return true;
    }
  }

  // 5. Ziffernblock-Prüfung MIT JAHRESZAHLEN-SCHUTZ (OPOS-1)
  const allDigits = upperDoc.match(/\d+/g);
  if (allDigits) {
    for (const d of allDigits) {
      const val = parseInt(d, 10);
      // Strikte Blacklist für Jahreszahlen: 2000 bis 2099 dürfen NIEMALS als isolierte Rechnungsnummer matchen!
      if (val >= 2000 && val <= 2099) {
        continue;
      }
      if (d.length >= 4) {
        const cleanBlockRegex = new RegExp(`\\b(?:RE|RN|RG|RECHNUNG|NR|NUMMER)[-_\\s]*0*${val}\\b`, 'i');
        if (cleanBlockRegex.test(upperText)) return true;
      }
    }
  }
  return false;
},

    _isDateWithinDays(startDateStr, checkDateStr, maxDays) {
  if (!startDateStr || !checkDateStr) return false;
  try {
    const d1 = new Date(startDateStr.substring(0, 10) + 'T00:00:00Z');
    const d2 = new Date(checkDateStr.substring(0, 10) + 'T00:00:00Z');
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return false;
    const diffDays = Math.floor((d2.getTime() - d1.getTime()) / 86400000);
    return diffDays >= -1 && diffDays <= maxDays;
  } catch (e) {
    return false;
  }
},

    matchTransaction(tx, openInvoices = [], openExpenses = [], skontoToleranzTage = 2) {
  const res = this.matchTransactionsAgainstOpos({
    transaktionen: [tx],
    offeneRechnungen: openInvoices,
    eingangsrechnungen: openExpenses,
    skontoToleranzTage
  });
  return res && res.length > 0 ? res[0] : null;
},

    matchTransactionsAgainstOpos({
  transaktionen = [],
  offeneRechnungen = [],
  eingangsrechnungen = [],
  skontoToleranzTage = 2
}) {
  const matches = [];
  for (const tx of transaktionen) {
    if (tx.status === 'ZUGEORDNET' || tx.status === 'IGNORIERT') continue;
    const txBetrag = Math.round((parseFloat(tx.betrag) || 0) * 100) / 100;
    const vzText = String(tx.verwendungszweck || '').toUpperCase();
    const partnerIban = this._cleanIban(tx.partnerIban || tx.partner_iban);
    const partnerName = String(tx.partnerName || tx.partner_name || '').toUpperCase().trim();
    if (txBetrag > 0) {
      let bestMatch = null;
      for (const doc of offeneRechnungen) {
        const docNr = String(doc.nr || '').toUpperCase().trim();
        const docBrutto = Math.round((parseFloat(doc.brutto) || 0) * 100) / 100;
        const docBezahlt = Math.round((parseFloat(doc.bezahlt_betrag) || 0) * 100) / 100;
        const docOffen = Math.round((docBrutto - docBezahlt) * 100) / 100;
        if (docOffen <= 0) continue;
        const hasNrMatch = docNr && this._matchesNumberVariant(vzText, docNr);
        if (hasNrMatch) {
          if (Math.abs(txBetrag - docOffen) < 0.009) {
            bestMatch = {
              score: 100,
              matchType: 'EXACT_INVOICE_AND_AMOUNT',
              dokumentId: doc.id,
              belegNr: doc.nr,
              betrag: txBetrag,
              skontoAbzug: 0.0,
              differenzGrund: null,
              restOffen: 0.0
            };
            break;
          }
          const skontoPz = parseFloat(doc.skonto_prozent) || 0;
          const skontoTage = parseInt(doc.skonto_tage, 10) || 0;
          if (skontoPz > 0 && skontoTage > 0) {
            const sollSkontoBetrag = Math.round(docOffen * (1 - skontoPz / 100) * 100) / 100;
            const skontoDifferenz = Math.round((docOffen - sollSkontoBetrag) * 100) / 100;
            const fristGueltig = this._isDateWithinDays(doc.datum, tx.buchungstag, skontoTage + skontoToleranzTage);
            if (fristGueltig && Math.abs(txBetrag - sollSkontoBetrag) < 0.02) {
              bestMatch = {
                score: 95,
                matchType: 'SKONTO_DISCOUNT_MATCH',
                dokumentId: doc.id,
                belegNr: doc.nr,
                betrag: txBetrag,
                skontoAbzug: skontoDifferenz,
                differenzGrund: 'SKONTO',
                restOffen: 0.0
              };
              break;
            }
          }
          if (txBetrag < docOffen) {
            bestMatch = {
              score: 80,
              matchType: 'PARTIAL_PAYMENT_MATCH',
              dokumentId: doc.id,
              belegNr: doc.nr,
              betrag: txBetrag,
              skontoAbzug: 0.0,
              differenzGrund: 'TEILZAHLUNG',
              restOffen: Math.round((docOffen - txBetrag) * 100) / 100
            };
            break;
          }
        }
      }
      if (!bestMatch) {
        for (const doc of offeneRechnungen) {
          const docBrutto = Math.round((parseFloat(doc.brutto) || 0) * 100) / 100;
          const docBezahlt = Math.round((parseFloat(doc.bezahlt_betrag) || 0) * 100) / 100;
          const docOffen = Math.round((docBrutto - docBezahlt) * 100) / 100;
          if (docOffen <= 0) continue;
          const kundenIban = this._cleanIban(doc.kunden_iban || doc.kunde_iban || doc.iban);
          const kundenName = String(doc.kunden_name || doc.kunde_name || doc.name || '').toUpperCase().trim();
          const ibanMatch = partnerIban && kundenIban && partnerIban === kundenIban;
          const nameMatch = partnerName && kundenName && (partnerName.includes(kundenName) || kundenName.includes(partnerName));
          if ((ibanMatch || nameMatch) && Math.abs(txBetrag - docOffen) < 0.009) {
            bestMatch = {
              score: ibanMatch ? 85 : 75,
              matchType: ibanMatch ? 'IBAN_AND_AMOUNT_MATCH' : 'NAME_AND_AMOUNT_MATCH',
              dokumentId: doc.id,
              belegNr: doc.nr,
              betrag: txBetrag,
              skontoAbzug: 0.0,
              differenzGrund: null,
              restOffen: 0.0
            };
            break;
          }
        }
      }
      if (bestMatch) {
        matches.push({
          transaktionId: tx.id,
          ...bestMatch
        });
      }
    } else if (txBetrag < 0) {
      const absTxBetrag = Math.abs(txBetrag);
      for (const er of eingangsrechnungen) {
        if (er.zahlungs_status === 'BEZAHLT') continue;
        const erNr = String(er.rechnungs_nr || '').toUpperCase().trim();
        const erBrutto = Math.round((parseFloat(er.betrag_brutto) || 0) * 100) / 100;
        if (erNr && this._matchesNumberVariant(vzText, erNr) && Math.abs(absTxBetrag - erBrutto) < 0.009) {
          matches.push({
            transaktionId: tx.id,
            score: 100,
            matchType: 'EXPENSE_EXACT_MATCH',
            eingangsrechnungId: er.id,
            belegNr: er.rechnungs_nr,
            betrag: absTxBetrag,
            differenzGrund: null
          });
          break;
        }
      }
    }
  }
  return matches;
},

};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = oposMatching;
}
if (typeof window !== 'undefined') {
    window.oposMatching = oposMatching;
}

if (typeof window !== 'undefined') {
    window.OposMatching = oposMatching;
}
