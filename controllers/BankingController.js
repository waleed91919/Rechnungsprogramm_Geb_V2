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

    calculateTransactionHash({ iban, buchungstag, betrag, verwendungszweck, partnerIban, primanota }) {
        const normIban = this._cleanIban(iban);
        const normTag = String(buchungstag || '').trim();
        const normBetrag = (Math.round((parseFloat(betrag) || 0) * 100) / 100).toFixed(2);
        const normText = String(verwendungszweck || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const normPartner = this._cleanIban(partnerIban);
        const normNota = String(primanota || '').trim();

        const raw = `${normIban}|${normTag}|${normBetrag}|${normText}|${normPartner}|${normNota}`;
        return this._sha256(raw);
    },

    parseCamt053(xmlString) {
        if (!xmlString || typeof xmlString !== 'string') {
            throw new Error('Ungültiger CAMT.053/052-XML-Inhalt.');
        }

        const statements = [];
        const stmtRegex = /<(?:Stmt|Rpt)\b[^>]*>([\s\S]*?)<\/(?:Stmt|Rpt)>/gi;
        let stmtMatch;

        while ((stmtMatch = stmtRegex.exec(xmlString)) !== null) {
            const stmtContent = stmtMatch[1];

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

            while ((ntryMatch = ntryRegex.exec(stmtContent)) !== null) {
                const ntry = ntryMatch[1];

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

                const dedupHash = this.calculateTransactionHash({
                    iban: accountIban,
                    buchungstag: bookgDt,
                    betrag,
                    verwendungszweck,
                    partnerIban,
                    primanota
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
                    importFormat: 'CAMT053'
                });
            }

            statements.push({
                accountIban,
                iban: accountIban,
                openingBalance,
                closingBalance,
                transactions
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
        if (headerLower.includes('beguenstigter') || headerLower.includes('begünstigter') || headerLower.includes('kontonummer/iban')) {
            return 'CSV_SPARKASSE';
        }
        if (headerLower.includes('kundenreferenz') || (headerLower.includes('wertstellung') && headerLower.includes('betrag (eur)'))) {
            return 'CSV_DEUTSCHE_BANK';
        }
        if (headerLower.includes('auftraggeber / begünstigter') || headerLower.includes('umsatzart')) {
            return 'CSV_COMMERZBANK';
        }
        return 'CSV_GENERIC';
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

            const dedupHash = this.calculateTransactionHash({
                iban: accountIbanFallback,
                buchungstag,
                betrag,
                verwendungszweck,
                partnerIban,
                primanota
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

    _matchesNumberVariant(text, docNr) {
        if (!text || !docNr) return false;
        const upperText = String(text).toUpperCase();
        const upperDoc = String(docNr).toUpperCase().trim();
        if (upperText.includes(upperDoc)) return true;

        const strippedDoc = upperDoc.replace(/[^A-Z0-9]/g, '');
        const strippedText = upperText.replace(/[^A-Z0-9]/g, '');
        if (strippedDoc && strippedDoc.length >= 4 && strippedText.includes(strippedDoc)) {
            return true;
        }

        const numOnlyMatch = upperDoc.match(/\d{3,}/);
        if (numOnlyMatch && numOnlyMatch[0].length >= 4) {
            const numPart = numOnlyMatch[0];
            const regex = new RegExp(`(?:\\b|RE|RN|RG|RECHNUNG|NR|NUMMER)[-_\\s]*${numPart}(?:\\b|[^0-9])`, 'i');
            if (regex.test(upperText)) return true;
        }

        return false;
    },

    _isDateWithinDays(startDateStr, checkDateStr, maxDays) {
        if (!startDateStr || !checkDateStr) return true;
        try {
            const d1 = new Date(startDateStr.substring(0, 10) + 'T00:00:00Z');
            const d2 = new Date(checkDateStr.substring(0, 10) + 'T00:00:00Z');
            const diffMs = d2.getTime() - d1.getTime();
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            return diffDays >= -1 && diffDays <= maxDays;
        } catch (e) {
            return true;
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
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BankingController;
}
if (typeof window !== 'undefined') {
    window.BankingController = BankingController;
}
