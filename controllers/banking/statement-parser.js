const statementParser = {
    parseCamt053(xmlString) {
  if (!xmlString || typeof xmlString !== 'string') {
    throw new Error('Ungültiger CAMT.053/052-XML-Inhalt.');
  }
  xmlString = String(xmlString).replace(/(<\/?)([A-Za-z0-9]+):/g, '$1');
  const statements = [];
  const stmtRegex = /<(?:Stmt|Rpt)\b[^>]*>([\s\S]*?)<\/(?:Stmt|Rpt)>/gi;
  let stmtMatch;
  while ((stmtMatch = stmtRegex.exec(xmlString)) !== null) {
    const stmtContent = stmtMatch[1];
    const stmtTag = (stmtMatch[0].match(/^<\s*(?:[A-Za-z0-9]+:)?(Stmt|Rpt)\b/i) || [])[1];
    const isReport = String(stmtTag).toUpperCase() === 'RPT';
    const importFormat = isReport ? 'CAMT052' : 'CAMT053';
    const ibanMatch = stmtContent.match(/<Acct>[\s\S]*?<Id>[\s\S]*?<IBAN>([A-Z0-9\s]+)<\/IBAN>/i) || stmtContent.match(/<Acct>[\s\S]*?<Id>[\s\S]*?<Othr>[\s\S]*?<Id>([^<]+)<\/Id>/i);
    const accountIban = ibanMatch ? this._cleanIban(ibanMatch[1]) : '';
    let openingBalance = null;
    let closingBalance = null;
    const balRegex = /<Bal\b[^>]*>([\s\S]*?)<\/Bal>/gi;
    let balMatch;
    while ((balMatch = balRegex.exec(stmtContent)) !== null) {
      const balContent = balMatch[1];
      const isOpening = /<Cd>(?:OPBD|PRCD)<\/Cd>/i.test(balContent);
      const isClosing = /<Cd>(?:CLBD|CLAV)<\/Cd>/i.test(balContent);
      const amtMatch = balContent.match(/<Amt\s+Ccy="([^"]+)">([\d.,]+)<\/Amt>/i);
      const cdtDbt = (balContent.match(/<CdtDbtInd>([A-Z]+)<\/CdtDbtInd>/i) || [])[1];
      if (amtMatch) {
        let val = parseFloat(amtMatch[2].replace(',', '.'));
        if (cdtDbt === 'DBIT') val = -Math.abs(val);
        if (isOpening) openingBalance = Math.round(val * 100) / 100;
        if (isClosing) closingBalance = Math.round(val * 100) / 100;
      }
    }
    const transactions = [];
    const ntryRegex = /<Ntry\b[^>]*>([\s\S]*?)<\/Ntry>/gi;
    let ntryMatch;
    let skippedPending = 0;
    let rvslSkipped = 0;
    const collisionMap = new Map();
    while ((ntryMatch = ntryRegex.exec(stmtContent)) !== null) {
      const ntry = ntryMatch[1];
      const sts = (ntry.match(/<Sts>([^<]+)<\/Sts>/i) || [])[1];
      if (sts && /^(PDNG|INFO)$/i.test(sts.trim())) {
        skippedPending++;
        continue;
      }
      const rvsl = (ntry.match(/<RvslInd>([^<]+)/i) || [])[1];
      if (rvsl && /^(true|1)$/i.test(rvsl.trim())) {
        rvslSkipped++;
        continue;
      }
      const amtMatch = ntry.match(/<Amt\s+Ccy="([^"]+)">([\d.,]+)<\/Amt>/i);
      const currency = amtMatch ? amtMatch[1] : 'EUR';
      let betrag = amtMatch ? parseFloat(amtMatch[2].replace(',', '.')) : 0.0;
      const cdtDbt = (ntry.match(/<CdtDbtInd>([A-Z]+)<\/CdtDbtInd>/i) || [])[1];
      if (cdtDbt === 'DBIT') {
        betrag = -Math.abs(betrag);
      } else {
        betrag = Math.abs(betrag);
      }
      const bookgDtMatch = ntry.match(/<BookgDt>[\s\S]*?<(?:Dt|DtTm)>([\d-]+)/i);
      const bookgDt = bookgDtMatch ? bookgDtMatch[1].substring(0, 10) : '';
      const valDtMatch = ntry.match(/<ValDt>[\s\S]*?<(?:Dt|DtTm)>([\d-]+)/i);
      const valDt = valDtMatch ? valDtMatch[1].substring(0, 10) : bookgDt;
      const dbtrNameMatch = ntry.match(/<Dbtr>[\s\S]*?<Nm>([^<]+)<\/Nm>/i);
      const cdtrNameMatch = ntry.match(/<Cdtr>[\s\S]*?<Nm>([^<]+)<\/Nm>/i);
      const dbtrName = dbtrNameMatch ? dbtrNameMatch[1] : '';
      const cdtrName = cdtrNameMatch ? cdtrNameMatch[1] : '';
      const partnerName = betrag > 0 ? dbtrName : cdtrName;
      const dbtrIbanMatch = ntry.match(/<DbtrAcct>[\s\S]*?<IBAN>([^<]+)<\/IBAN>/i) || ntry.match(/<DbtrAcct>[\s\S]*?<Othr>[\s\S]*?<Id>([^<]+)<\/Id>/i);
      const cdtrIbanMatch = ntry.match(/<CdtrAcct>[\s\S]*?<IBAN>([^<]+)<\/IBAN>/i) || ntry.match(/<CdtrAcct>[\s\S]*?<Othr>[\s\S]*?<Id>([^<]+)<\/Id>/i);
      const dbtrIban = dbtrIbanMatch ? this._cleanIban(dbtrIbanMatch[1]) : '';
      const cdtrIban = cdtrIbanMatch ? this._cleanIban(cdtrIbanMatch[1]) : '';
      const partnerIban = betrag > 0 ? dbtrIban : cdtrIban;
      const dbtrBicMatch = ntry.match(/<DbtrAgt>[\s\S]*?<BIC(?:FI)?>([^<]+)<\/BIC(?:FI)?>/i);
      const cdtrBicMatch = ntry.match(/<CdtrAgt>[\s\S]*?<BIC(?:FI)?>([^<]+)<\/BIC(?:FI)?>/i);
      const dbtrBic = dbtrBicMatch ? this._cleanBic(dbtrBicMatch[1]) : '';
      const cdtrBic = cdtrBicMatch ? this._cleanBic(cdtrBicMatch[1]) : '';
      const partnerBic = betrag > 0 ? dbtrBic : cdtrBic;
      const ustrdMatches = [];
      const ustrdRegex = /<Ustrd>([^<]+)<\/Ustrd>/gi;
      let uMatch;
      while ((uMatch = ustrdRegex.exec(ntry)) !== null) {
        ustrdMatches.push(uMatch[1].trim());
      }
      const strdRefMatches = [];
      const strdRefRegex = /<CdtrRefInf>[\s\S]*?<Ref>([^<]+)<\/Ref>/gi;
      let sMatch;
      while ((sMatch = strdRefRegex.exec(ntry)) !== null) {
        strdRefMatches.push(sMatch[1].trim());
      }
      let verwendungszweck = [...ustrdMatches, ...strdRefMatches].join(' ');
      if (!verwendungszweck) {
        const addtlNtry = (ntry.match(/<AddtlNtryInf>([^<]+)<\/AddtlNtryInf>/i) || [])[1];
        const addtlTx = (ntry.match(/<AddtlTxInf>([^<]+)<\/AddtlTxInf>/i) || [])[1];
        verwendungszweck = [addtlNtry, addtlTx].filter(Boolean).join(' ');
      }
      const gvCodeMatch = ntry.match(/<BkTxCd>[\s\S]*?<Cd>([^<]+)<\/Cd>/i) || ntry.match(/<Domn>[\s\S]*?<Cd>([^<]+)<\/Cd>/i);
      const gvCode = gvCodeMatch ? gvCodeMatch[1] : '';
      const endToEndIdMatch = ntry.match(/<EndToEndId>([^<]+)<\/EndToEndId>/i);
      const endToEndId = endToEndIdMatch ? endToEndIdMatch[1].trim() : '';
      const primanotaMatch = ntry.match(/<AcctSvcrRef>([^<]+)<\/AcctSvcrRef>/i) || ntry.match(/<NtryRef>([^<]+)<\/NtryRef>/i);
      const primanota = primanotaMatch ? primanotaMatch[1] : '';
      const buchungstextMatch = ntry.match(/<Prtry>[\s\S]*?<Cd>([^<]+)<\/Cd>/i) || ntry.match(/<SubFmlyCd>([^<]+)<\/SubFmlyCd>/i);
      const buchungstext = buchungstextMatch ? buchungstextMatch[1] : '';
      const tupleKey = `${accountIban}|${bookgDt}|${betrag.toFixed(2)}|${verwendungszweck}|${partnerIban}`;
      const occ = collisionMap.get(tupleKey) || 0;
      collisionMap.set(tupleKey, occ + 1);
      const dedupHash = this.calculateTransactionHash({
        iban: accountIban,
        buchungstag: bookgDt,
        betrag,
        verwendungszweck,
        partnerIban,
        primanota,
        occurrenceIndex: occ
      });
      const pName = this._cleanText(partnerName);
      const vZweck = this._cleanText(verwendungszweck);
      const bText = this._cleanText(buchungstext);
      transactions.push({
        accountIban,
        account_iban: accountIban,
        buchungstag: bookgDt,
        valuta: valDt,
        valutadatum: valDt,
        betrag: Math.round(betrag * 100) / 100,
        waehrung: currency,
        partnerName: pName,
        partner_name: pName,
        partnerIban,
        partner_iban: partnerIban,
        partnerBic,
        partner_bic: partnerBic,
        buchungstext: bText,
        verwendungszweck: vZweck,
        gvCode,
        gv_code: gvCode,
        primanota,
        dedupHash,
        dedup_hash: dedupHash,
        endToEndId,
        end_to_end_id: endToEndId,
        importFormat
      });
    }
    statements.push({
      accountIban,
      iban: accountIban,
      openingBalance,
      closingBalance,
      transactions,
      statementType: importFormat,
      skippedPending,
      rvslSkipped
    });
  }
  return statements;
},

    _splitCsvLine(line, delimiter) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map(s => s.trim());
},

    _detectDelimiter(headerLine) {
  const delimiters = [';', ',', '\t'];
  let maxCount = 0;
  let chosen = ';';
  for (const delim of delimiters) {
    const count = (headerLine.match(new RegExp(delim === '\t' ? '\t' : '\\' + delim, 'g')) || []).length;
    if (count > maxCount) {
      maxCount = count;
      chosen = delim;
    }
  }
  return chosen;
},

    _detectCsvProfile(headerLower) {
  if (headerLower.includes('zahlungsbeteiligter')) {
    return 'CSV_VOLKSBANK';
  }
  if (headerLower.includes('kundenreferenz') || headerLower.includes('wertstellung') && headerLower.includes('betrag (eur)')) {
    return 'CSV_DEUTSCHE_BANK';
  }
  if (headerLower.includes('auftraggeber / begünstigter') || headerLower.includes('umsatzart')) {
    return 'CSV_COMMERZBANK';
  }
  if (headerLower.includes('beguenstigter/zahlungspflichtiger') || headerLower.includes('begünstigter/zahlungspflichtiger') || headerLower.includes('kontonummer/iban')) {
    return 'CSV_SPARKASSE';
  }
  if (headerLower.includes('beguenstigter') || headerLower.includes('begünstigter')) {
    return 'CSV_SPARKASSE';
  }
  return 'CSV_GENERIC';
},

    detectEncodingProblem(text) {
  if (!text || typeof text !== 'string') return false;
  return /\uFFFD|(Ã¤|Ã¶|Ã¼|Ã„|Ã��|Ãœ|ÃŸ)/.test(text);
},

    parseCsvStatement(csvString, forcedFormat = 'AUTO', accountIbanFallback = '') {
  if (!csvString || typeof csvString !== 'string') return [];
  const rawLines = csvString.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (rawLines.length === 0) return [];
  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, rawLines.length); i++) {
    const lower = rawLines[i].toLowerCase();
    if (lower.includes('buchung') || lower.includes('datum') || lower.includes('betrag') || lower.includes('umsatz')) {
      headerIdx = i;
      break;
    }
  }
  const headerLine = rawLines[headerIdx];
  const delimiter = this._detectDelimiter(headerLine);
  const headerCols = this._splitCsvLine(headerLine, delimiter).map(c => c.toLowerCase());
  let normProfile = '';
  if (forcedFormat && forcedFormat !== 'AUTO') {
    normProfile = String(forcedFormat).toUpperCase().replace(/^CSV_/, '');
  } else {
    normProfile = this._detectCsvProfile(headerCols.join(' ')).replace(/^CSV_/, '');
  }
  const profile = `CSV_${normProfile}`;
  const getCol = (row, names) => {
    for (const name of names) {
      const idx = headerCols.findIndex(h => h.includes(name));
      if (idx !== -1 && row[idx] !== undefined) return row[idx];
    }
    return '';
  };
  const transactions = [];
  const collisionMap = new Map();
  for (let i = headerIdx + 1; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (!line) continue;
    const cols = this._splitCsvLine(line, delimiter);
    if (cols.length < 2) continue;
    let buchungstag = '';
    let valuta = '';
    let betrag = 0;
    let partnerName = '';
    let partnerIban = '';
    let partnerBic = '';
    let verwendungszweck = '';
    let buchungstext = '';
    let gvCode = '';
    let primanota = '';
    let currency = 'EUR';
    if (normProfile === 'SPARKASSE') {
      buchungstag = this._parseDate(getCol(cols, ['buchungstag', 'buchung']));
      valuta = this._parseDate(getCol(cols, ['valutadatum', 'valuta'])) || buchungstag;
      buchungstext = getCol(cols, ['buchungstext']);
      verwendungszweck = getCol(cols, ['verwendungszweck']);
      partnerName = getCol(cols, ['beguenstigter', 'begünstigter', 'zahlungspflichtiger']);
      partnerIban = this._cleanIban(getCol(cols, ['kontonummer/iban', 'iban', 'kontonummer']));
      partnerBic = this._cleanBic(getCol(cols, ['bic', 'swift']));
      betrag = this._parseGermanAmount(getCol(cols, ['betrag']));
      currency = getCol(cols, ['waehrung', 'währung']) || 'EUR';
      primanota = getCol(cols, ['primanota', 'info']);
    } else if (normProfile === 'VOLKSBANK') {
      buchungstag = this._parseDate(getCol(cols, ['buchungstag', 'buchung']));
      valuta = this._parseDate(getCol(cols, ['valuta', 'wertstellung'])) || buchungstag;
      partnerName = getCol(cols, ['name zahlungsbeteiligter', 'zahlungsbeteiligter']);
      partnerIban = this._cleanIban(getCol(cols, ['iban zahlungsbeteiligter', 'iban']));
      partnerBic = this._cleanBic(getCol(cols, ['bic zahlungsbeteiligter', 'bic']));
      buchungstext = getCol(cols, ['buchungstext']);
      verwendungszweck = getCol(cols, ['verwendungszweck']);
      betrag = this._parseGermanAmount(getCol(cols, ['betrag', 'umsatz']));
      currency = getCol(cols, ['waehrung', 'währung']) || 'EUR';
    } else if (normProfile === 'DEUTSCHE_BANK') {
      buchungstag = this._parseDate(getCol(cols, ['buchungstag', 'buchung']));
      valuta = this._parseDate(getCol(cols, ['wertstellung', 'valuta', 'wert'])) || buchungstag;
      buchungstext = getCol(cols, ['umsatzart', 'buchungstext']);
      partnerName = getCol(cols, ['begünstigter / auftraggeber', 'begünstigter', 'auftraggeber', 'beguenstigter']);
      verwendungszweck = getCol(cols, ['verwendungszweck']);
      partnerIban = this._cleanIban(getCol(cols, ['iban']));
      partnerBic = this._cleanBic(getCol(cols, ['bic']));
      primanota = getCol(cols, ['kundenreferenz']);
      const rawBetrag = this._parseGermanAmount(getCol(cols, ['betrag (eur)', 'betrag', 'umsatz']));
      const shInd = getCol(cols, ['soll/haben', 'soll / haben', 's/h', 'soll-haben']);
      if (shInd) {
        const sh = shInd.trim().toLowerCase();
        if (sh.startsWith('s') || sh === 'd' || sh === 'debit') {
          betrag = -Math.abs(rawBetrag);
        } else {
          betrag = Math.abs(rawBetrag);
        }
      } else {
        betrag = rawBetrag;
      }
    } else if (normProfile === 'COMMERZBANK') {
      buchungstag = this._parseDate(getCol(cols, ['buchungstag', 'buchung']));
      valuta = this._parseDate(getCol(cols, ['wertstellung', 'valuta'])) || buchungstag;
      buchungstext = getCol(cols, ['umsatzart', 'buchungstext']);
      betrag = this._parseGermanAmount(getCol(cols, ['betrag']));
      currency = getCol(cols, ['währung', 'waehrung']) || 'EUR';
      partnerName = getCol(cols, ['auftraggeber / begünstigter', 'auftraggeber', 'begünstigter']);
      partnerIban = this._cleanIban(getCol(cols, ['iban']));
      partnerBic = this._cleanBic(getCol(cols, ['bic']));
      verwendungszweck = getCol(cols, ['buchungstext', 'verwendungszweck']);
    } else {
      buchungstag = this._parseDate(getCol(cols, ['buchungstag', 'buchung', 'datum', 'tag']));
      valuta = this._parseDate(getCol(cols, ['valuta', 'wertstellung'])) || buchungstag;
      partnerName = getCol(cols, ['name zahlungsbeteiligter', 'begünstigter / auftraggeber', 'beguenstigter/zahlungspflichtiger', 'beguenstigter', 'begünstigter', 'auftraggeber', 'zahlungspflichtiger', 'partner', 'name']);
      partnerIban = this._cleanIban(getCol(cols, ['iban', 'kontonummer', 'konto']));
      partnerBic = this._cleanBic(getCol(cols, ['bic', 'swift']));
      buchungstext = getCol(cols, ['buchungstext', 'text', 'art']);
      verwendungszweck = getCol(cols, ['verwendungszweck', 'vwz', 'beschreibung', 'notiz']);
      const shInd = getCol(cols, ['soll/haben', 'soll / haben', 's/h', 'soll-haben']);
      const rawBetrag = this._parseGermanAmount(getCol(cols, ['betrag', 'umsatz', 'summe']));
      if (shInd) {
        const sh = shInd.trim().toLowerCase();
        if (sh.startsWith('s') || sh === 'd' || sh === 'debit') {
          betrag = -Math.abs(rawBetrag);
        } else {
          betrag = Math.abs(rawBetrag);
        }
      } else {
        const soll = getCol(cols, ['sollbetrag', 'belastung']);
        const haben = getCol(cols, ['habenbetrag', 'gutschrift']);
        if (soll || haben) {
          if (soll) betrag = -Math.abs(this._parseGermanAmount(soll));else if (haben) betrag = Math.abs(this._parseGermanAmount(haben));
        } else {
          betrag = rawBetrag;
        }
      }
    }
    if (!buchungstag && !betrag) continue;
    const tupleKey = `${accountIbanFallback}|${buchungstag}|${betrag.toFixed(2)}|${verwendungszweck}|${partnerIban}`;
    const occ = collisionMap.get(tupleKey) || 0;
    collisionMap.set(tupleKey, occ + 1);
    const dedupHash = this.calculateTransactionHash({
      iban: accountIbanFallback,
      buchungstag,
      betrag,
      verwendungszweck,
      partnerIban,
      primanota,
      occurrenceIndex: occ
    });
    const pName = this._cleanText(partnerName);
    const vZweck = this._cleanText(verwendungszweck);
    const bText = this._cleanText(buchungstext);
    transactions.push({
      accountIban: accountIbanFallback,
      account_iban: accountIbanFallback,
      buchungstag,
      valuta,
      valutadatum: valuta,
      betrag: Math.round(betrag * 100) / 100,
      waehrung: currency,
      partnerName: pName,
      partner_name: pName,
      partnerIban,
      partner_iban: partnerIban,
      partnerBic,
      partner_bic: partnerBic,
      buchungstext: bText,
      verwendungszweck: vZweck,
      gvCode,
      gv_code: gvCode,
      primanota,
      dedupHash,
      dedup_hash: dedupHash,
      importFormat: profile
    });
  }
  return transactions;
},

    /**
 * Parst SWIFT MT940 Kontoauszugsdateien (.sta / .swi / .txt) (BNK-1)
 */
parseMt940(mt940String, accountIbanFallback = '') {
  if (!mt940String || typeof mt940String !== 'string') return [];
  const content = mt940String.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawStatements = content.split(/(?=:20:)/g).filter(s => s.trim().length > 0);
  const statements = [];
  const collisionMap = new Map();
  for (const rawStmt of rawStatements) {
    let accountIban = accountIbanFallback;
    let openingBalance = 0;
    let closingBalance = 0;
    const transactions = [];

    // :25: Kontobezeichnung (IBAN oder BLZ/KTO)
    const tag25Match = rawStmt.match(/:25:([^\n]+)/);
    if (tag25Match) {
      const rawAcc = tag25Match[1].trim().replace(/\//g, '');
      if (this.validateIban(rawAcc)) {
        accountIban = this._cleanIban(rawAcc);
      } else if (!accountIban) {
        accountIban = rawAcc;
      }
    }

    // :60F: Anfangssaldo
    const tag60Match = rawStmt.match(/:60[FM]:([CD])(\d{6})([A-Z]{3})([0-9,]+)/);
    if (tag60Match) {
      let opAmt = parseFloat(tag60Match[4].replace(/\./g, '').replace(',', '.'));
      if (tag60Match[1] === 'D') opAmt = -Math.abs(opAmt);
      openingBalance = Math.round(opAmt * 100) / 100;
    }

    // :62F: Endsaldo
    const tag62Match = rawStmt.match(/:62[FM]:([CD])(\d{6})([A-Z]{3})([0-9,]+)/);
    if (tag62Match) {
      let clAmt = parseFloat(tag62Match[4].replace(/\./g, '').replace(',', '.'));
      if (tag62Match[1] === 'D') clAmt = -Math.abs(clAmt);
      closingBalance = Math.round(clAmt * 100) / 100;
    }

    // Transaktionen: :61: gefolgt von optionalem :86:
    const txRegex = /:61:(\d{6})(\d{4})?([CD]|RC|RD)([A-Z])?([0-9,]+)([A-Za-z0-9]{4})([^\n]*)\n(?::86:([\s\S]*?)(?=(?::61:|:62[FM]:|$)))?/g;
    let match;
    while ((match = txRegex.exec(rawStmt)) !== null) {
      const valutaRaw = match[1]; // YYMMDD
      const buchungsTagRaw = match[2] || valutaRaw.substring(2); // MMDD
      const dcMark = match[3]; // C = Haben (Eingang), D = Soll (Ausgang)
      const amountRaw = match[5]; // Betrag mit Komma
      const gvCode = match[6]; // z.B. NTRF, NCHK
      const primanota = (match[7] || '').trim();
      const tag86Content = (match[8] || '').trim();

      // Datumskonvertierung (YYMMDD -> YYYY-MM-DD)
      const yearPrefix = parseInt(valutaRaw.substring(0, 2), 10) >= 70 ? '19' : '20';
      const valuta = `${yearPrefix}${valutaRaw.substring(0, 2)}-${valutaRaw.substring(2, 4)}-${valutaRaw.substring(4, 6)}`;
      let buchungstag = valuta;
      if (buchungsTagRaw && buchungsTagRaw.length === 4) {
        buchungstag = `${yearPrefix}${valutaRaw.substring(0, 2)}-${buchungsTagRaw.substring(0, 2)}-${buchungsTagRaw.substring(2, 4)}`;
      }

      // Betrag berechnen
      let betrag = parseFloat(amountRaw.replace(/\./g, '').replace(',', '.'));
      if (dcMark.includes('D')) {
        betrag = -Math.abs(betrag);
      } else {
        betrag = Math.abs(betrag);
      }

      // :86: Verwendungszweck und Partner analysieren (ZKA-Struktur ?00 bis ?38)
      let partnerName = '';
      let partnerIban = '';
      let partnerBic = '';
      let verwendungszweck = '';
      let buchungstext = '';
      if (tag86Content.includes('?')) {
        const subFields = tag86Content.split(/\?(\d{2})/);
        for (let i = 1; i < subFields.length; i += 2) {
          const code = subFields[i];
          const val = (subFields[i + 1] || '').replace(/\n/g, ' ').trim();
          if (code === '00') buchungstext = val;else if (['20', '21', '22', '23', '24', '25', '26', '27', '28', '29'].includes(code)) {
            verwendungszweck += (verwendungszweck ? ' ' : '') + val;
          } else if (code === '30') partnerBic = val;else if (code === '31') partnerIban = val;else if (code === '32' || code === '33') {
            partnerName += (partnerName ? ' ' : '') + val;
          } else if (code === '38') partnerIban = val;
        }
      } else {
        verwendungszweck = tag86Content.replace(/\n/g, ' ').trim();
      }

      // BNK-3: Same-Day Occurrence Tracking
      const tupleKey = `${accountIban}|${buchungstag}|${betrag.toFixed(2)}|${verwendungszweck}|${partnerIban}`;
      const occ = collisionMap.get(tupleKey) || 0;
      collisionMap.set(tupleKey, occ + 1);
      const dedupHash = this.calculateTransactionHash({
        iban: accountIban,
        buchungstag,
        betrag,
        verwendungszweck,
        partnerIban,
        primanota,
        occurrenceIndex: occ
      });
      transactions.push({
        accountIban,
        account_iban: accountIban,
        buchungstag,
        valuta,
        valutadatum: valuta,
        betrag: Math.round(betrag * 100) / 100,
        waehrung: 'EUR',
        partnerName: this._cleanText(partnerName),
        partner_name: this._cleanText(partnerName),
        partnerIban: this._cleanIban(partnerIban),
        partner_iban: this._cleanIban(partnerIban),
        partnerBic: this._cleanBic(partnerBic),
        partner_bic: this._cleanBic(partnerBic),
        buchungstext: this._cleanText(buchungstext),
        verwendungszweck: this._cleanText(verwendungszweck),
        gvCode,
        gv_code: gvCode,
        primanota,
        dedupHash,
        dedup_hash: dedupHash,
        importFormat: 'MT940'
      });
    }
    statements.push({
      accountIban,
      iban: accountIban,
      openingBalance,
      closingBalance,
      transactions,
      statementType: 'MT940'
    });
  }
  return statements;
},

};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = statementParser;
}
if (typeof window !== 'undefined') {
    window.statementParser = statementParser;
}

if (typeof window !== 'undefined') {
    window.StatementParser = statementParser;
}
