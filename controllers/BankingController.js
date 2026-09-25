const BankingController = {
    _sha256(str) {
        if (typeof require !== 'undefined') {
            try {
                const crypto = require('crypto');
                return crypto.createHash('sha256').update(String(str), 'utf8').digest('hex');
            } catch (e) {}
        }
        return this._sha256Js(String(str));
    },

    _sha256Js(ascii) {
        function rightRotate(value, amount) {
            return (value >>> amount) | (value << (32 - amount));
        }
        const mathPow = Math.pow;
        const maxWord = mathPow(2, 32);
        let result = '';
        const words = [];
        const asciiBitLength = ascii.length * 8;
        let hash = [];
        let k = [];
        let primeCounter = 0;
        const isComposite = {};
        for (let candidate = 2; primeCounter < 64; candidate++) {
            if (!isComposite[candidate]) {
                for (let i = candidate * 2; i < 313; i += candidate) {
                    isComposite[i] = 1;
                }
                if (primeCounter < 8) {
                    hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
                }
                k[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
                primeCounter++;
            }
        }
        ascii += '\x80';
        while (ascii.length % 64 - 56) ascii += '\x00';
        for (let i = 0; i < ascii.length; i++) {
            const j = ascii.charCodeAt(i);
            words[i >> 2] |= j << ((3 - i % 4) * 8);
        }
        words[words.length] = ((asciiBitLength / maxWord) | 0);
        words[words.length] = (asciiBitLength | 0);
        for (let j = 0; j < words.length;) {
            const w = words.slice(j, j += 16);
            const oldHash = hash.slice(0);
            for (let i = 0; i < 64; i++) {
                const w15 = w[i - 15], w2 = w[i - 2];
                const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
                const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
                const temp2 = (i >= 16) ? (w[i - 16] + s0 + w[i - 7] + s1) | 0 : w[i];
                w[i] = temp2;
                const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
                const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
                const sigma0 = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
                const sigma1 = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
                const temp1 = (hash[7] + sigma1 + ch + k[i] + temp2) | 0;
                hash = [(temp1 + ((sigma0 + maj) | 0)) | 0, hash[0], hash[1], hash[2], (hash[3] + temp1) | 0, hash[4], hash[5], hash[6]];
            }
            for (let i = 0; i < 8; i++) {
                hash[i] = (hash[i] + oldHash[i]) | 0;
            }
        }
        for (let i = 0; i < 8; i++) {
            for (let j = 3; j >= 0; j--) {
                const b = (hash[i] >> (j * 8)) & 255;
                result += ((b < 16) ? '0' : '') + b.toString(16);
            }
        }
        return result;
    },

    _cleanText(text) {
        if (!text) return '';
        return String(text)
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
    },

    _cleanIban(iban) {
        return String(iban || '').replace(/[\s-]+/g, '').toUpperCase();
    },

    _cleanBic(bic) {
        return String(bic || '').replace(/[\s-]+/g, '').toUpperCase();
    },

    _parseGermanAmount(amountStr) {
        if (typeof amountStr === 'number') return amountStr;
        if (!amountStr || typeof amountStr !== 'string') return 0;
        let str = amountStr.trim();
        let isNegative = false;
        if (str.endsWith('-') || str.endsWith('S') || str.endsWith('s')) {
            isNegative = true;
            str = str.slice(0, -1).trim();
        } else if (str.startsWith('-')) {
            isNegative = true;
            str = str.slice(1).trim();
        } else if (str.endsWith('+') || str.endsWith('H') || str.endsWith('h')) {
            str = str.slice(0, -1).trim();
        }
        str = str.replace(/\s+/g, '').replace(/\./g, '').replace(',', '.');
        let val = parseFloat(str);
        if (isNaN(val)) return 0;
        return isNegative ? -Math.abs(val) : Math.abs(val);
    },

    _parseDate(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') return '';
        const trimmed = dateStr.trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
            return trimmed.substring(0, 10);
        }
        const deMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
        if (deMatch) {
            const day = deMatch[1].padStart(2, '0');
            const month = deMatch[2].padStart(2, '0');
            let year = deMatch[3];
            if (year.length === 2) {
                year = (parseInt(year, 10) >= 70 ? '19' : '20') + year;
            }
            return `${year}-${month}-${day}`;
        }
        return '';
    },

    validateIban(iban) {
        if (!iban || typeof iban !== 'string') return false;
        const clean = this._cleanIban(iban);
        if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(clean)) return false;
        return true;
    },

    calculateTransactionHash({ iban, konto_iban, accountIban, buchungstag, betrag, verwendungszweck, partnerIban, partner_iban, primanota, occurrenceIndex = 0 }) {
        const normIban = this._cleanIban(iban || konto_iban || accountIban);
        const normTag = String(buchungstag || '').trim();
        const normBetrag = (Math.round((parseFloat(betrag) || 0) * 100) / 100).toFixed(2);
        const normText = String(verwendungszweck || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const normPartner = this._cleanIban(partnerIban || partner_iban);
        const normNota = String(primanota || '').trim();
        const occ = parseInt(occurrenceIndex, 10) || 0;

        const raw = occ > 0
            ? `${normIban}|${normTag}|${normBetrag}|${normText}|${normPartner}|${normNota}|${occ}`
            : `${normIban}|${normTag}|${normBetrag}|${normText}|${normPartner}|${normNota}`;
        return this._sha256(raw);
    },


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

            const ibanMatch = stmtContent.match(/<Acct>[\s\S]*?<Id>[\s\S]*?<IBAN>([A-Z0-9\s]+)<\/IBAN>/i)
                || stmtContent.match(/<Acct>[\s\S]*?<Id>[\s\S]*?<Othr>[\s\S]*?<Id>([^<]+)<\/Id>/i);
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

                const dbtrIbanMatch = ntry.match(/<DbtrAcct>[\s\S]*?<IBAN>([^<]+)<\/IBAN>/i)
                    || ntry.match(/<DbtrAcct>[\s\S]*?<Othr>[\s\S]*?<Id>([^<]+)<\/Id>/i);
                const cdtrIbanMatch = ntry.match(/<CdtrAcct>[\s\S]*?<IBAN>([^<]+)<\/IBAN>/i)
                    || ntry.match(/<CdtrAcct>[\s\S]*?<Othr>[\s\S]*?<Id>([^<]+)<\/Id>/i);
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

                const gvCodeMatch = ntry.match(/<BkTxCd>[\s\S]*?<Cd>([^<]+)<\/Cd>/i)
                    || ntry.match(/<Domn>[\s\S]*?<Cd>([^<]+)<\/Cd>/i);
                const gvCode = gvCodeMatch ? gvCodeMatch[1] : '';

                const endToEndIdMatch = ntry.match(/<EndToEndId>([^<]+)<\/EndToEndId>/i);
                const endToEndId = endToEndIdMatch ? endToEndIdMatch[1].trim() : '';

                const primanotaMatch = ntry.match(/<AcctSvcrRef>([^<]+)<\/AcctSvcrRef>/i)
                    || ntry.match(/<NtryRef>([^<]+)<\/NtryRef>/i);
                const primanota = primanotaMatch ? primanotaMatch[1] : '';

                const buchungstextMatch = ntry.match(/<Prtry>[\s\S]*?<Cd>([^<]+)<\/Cd>/i)
                    || ntry.match(/<SubFmlyCd>([^<]+)<\/SubFmlyCd>/i);
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
        if (headerLower.includes('kundenreferenz') || (headerLower.includes('wertstellung') && headerLower.includes('betrag (eur)'))) {
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
        return /\uFFFD|(Ã¤|Ã¶|Ã¼|Ã„|Ã–|Ãœ|ÃŸ)/.test(text);
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
                        if (soll) betrag = -Math.abs(this._parseGermanAmount(soll));
                        else if (haben) betrag = Math.abs(this._parseGermanAmount(haben));
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
                        if (code === '00') buchungstext = val;
                        else if (['20', '21', '22', '23', '24', '25', '26', '27', '28', '29'].includes(code)) {
                            verwendungszweck += (verwendungszweck ? ' ' : '') + val;
                        } else if (code === '30') partnerBic = val;
                        else if (code === '31') partnerIban = val;
                        else if (code === '32' || code === '33') {
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
        const escapeRegex = (s) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
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
        return (res && res.length > 0) ? res[0] : null;
    },

    matchTransactionsAgainstOpos({ transaktionen = [], offeneRechnungen = [], eingangsrechnungen = [], skontoToleranzTage = 2 }) {
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
                            const sollSkontoBetrag = Math.round((docOffen * (1 - skontoPz / 100)) * 100) / 100;
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
                    matches.push({ transaktionId: tx.id, ...bestMatch });
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

    CURRENT_BASE_RATE: 1.52,

    BASE_INTEREST_RATES: [
        { from: '2026-07-01', to: null, rate: 1.52, label: 'ab 01.07.2026' },
        { from: '2025-07-01', to: '2026-06-30', rate: 1.27, label: '01.07.2025 - 30.06.2026' },
        { from: '2025-01-01', to: '2025-06-30', rate: 2.27, label: '01.01.2025 - 30.06.2025' },
        { from: '2024-07-01', to: '2024-12-31', rate: 3.37, label: '01.07.2024 - 31.12.2024' },
        { from: null, to: '2024-06-30', rate: 3.62, label: 'bis 30.06.2024' }
    ],

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
        let days = (agreedDays !== null && agreedDays !== undefined && !isNaN(parseInt(agreedDays, 10)))
            ? Math.min(Math.max(1, parseInt(agreedDays, 10)), 60)
            : this.getVobPaymentTermDays(invoiceType);
        
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

        const isB2B = invoice.customer_type ? (invoice.customer_type === 'B2B' || invoice.customer_type === 'B2G') : (!invoice.ist_privatkunde && !invoice.ist_verbraucher);
        const isVob = !!(invoice.is_vob || invoice.vob || invoice.vertragsart === 'VOB');

        // Prüfung auf Verzug
        let isInDefault = false;
        let defaultReason = '';
        let daysInDefault = 0;

        // 1. Explizite Mahnung nach Fälligkeit (§ 286 Abs. 1 BGB)
        const hasExplicitMahnung = Boolean(
            invoice.in_verzug ||
            invoice.has_mahnung ||
            (invoice.has_reminder === false && invoice.mahnstufe > 0) ||
            (invoice.mahnstufe && invoice.mahnstufe > 0) ||
            invoice.gemahnt_am
        );

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
    calculateDefaultInterest({ amount = 0, dueDate, paymentDate = new Date(), isB2B = true, baseRate = null, splitPeriods = false }) {
        const principal = Math.round((parseFloat(amount) || 0) * 100) / 100;
        const dueIso = dueDate ? (dueDate instanceof Date ? dueDate.toISOString().split('T')[0] : String(dueDate).substring(0, 10)) : '';
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
                const segInterest = Math.round((principal * (curApplied / 100) * (segDays / 360)) * 100) / 100;
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
            interestAmount = Math.round((principal * (appliedInterestRate / 100) * (daysOverdue / 360)) * 100) / 100;
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
        return (isB2B && isOverdue) ? 40.00 : 0.00;
    },

    /**
     * Erstellt eine Gesamtaufstellung aller offenen Posten mit Verzugszinsen und 40-€-Pauschale für das Mahnwesen.
     * Trennt strikt zwischen Fälligkeit (Zahlungserinnerung) und Verzug (§ 286 BGB / § 16 Abs. 5 Nr. 3 VOB/B).
     * @param {Object} params - { invoices, calculationDate, baseRate, mahngebuehrJeRechnung }
     * @returns {Object} Mahnberechnungs-Zusammenfassung
     */
    calculateMahnungClaims({ invoices = [], calculationDate = new Date(), baseRate = null, mahngebuehrJeRechnung = 0.00 }) {
        let totalPrincipal = 0;
        let totalInterest = 0;
        let totalLateFee = 0;
        let totalMahngebuehr = 0;

        const calculatedInvoices = invoices.map(inv => {
            const amount = parseFloat(inv.offen) || (parseFloat(inv.brutto) - (parseFloat(inv.bezahlt_betrag) || 0)) || 0;
            const isB2B = inv.customer_type ? (inv.customer_type === 'B2B' || inv.customer_type === 'B2G') : (!inv.ist_privatkunde && !inv.ist_verbraucher);
            
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
            const gebuehr = isInDefault ? (parseFloat(mahngebuehrJeRechnung) || 0) : 0;
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

        const resolvedBase = (baseRate !== null && baseRate !== undefined && !isNaN(parseFloat(baseRate)))
            ? parseFloat(baseRate)
            : this.getBaseRateForDate(calculationDate);

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
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BankingController;
}
if (typeof window !== 'undefined') {
    window.BankingController = BankingController;
}
