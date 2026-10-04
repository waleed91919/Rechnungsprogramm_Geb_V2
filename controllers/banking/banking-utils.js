const bankingUtils = {
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
    return value >>> amount | value << 32 - amount;
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
        hash[primeCounter] = mathPow(candidate, 0.5) * maxWord | 0;
      }
      k[primeCounter] = mathPow(candidate, 1 / 3) * maxWord | 0;
      primeCounter++;
    }
  }
  ascii += '\x80';
  while (ascii.length % 64 - 56) ascii += '\x00';
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    words[i >> 2] |= j << (3 - i % 4) * 8;
  }
  words[words.length] = asciiBitLength / maxWord | 0;
  words[words.length] = asciiBitLength | 0;
  for (let j = 0; j < words.length;) {
    const w = words.slice(j, j += 16);
    const oldHash = hash.slice(0);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15],
        w2 = w[i - 2];
      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ w15 >>> 3;
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ w2 >>> 10;
      const temp2 = i >= 16 ? w[i - 16] + s0 + w[i - 7] + s1 | 0 : w[i];
      w[i] = temp2;
      const ch = hash[4] & hash[5] ^ ~hash[4] & hash[6];
      const maj = hash[0] & hash[1] ^ hash[0] & hash[2] ^ hash[1] & hash[2];
      const sigma0 = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
      const sigma1 = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
      const temp1 = hash[7] + sigma1 + ch + k[i] + temp2 | 0;
      hash = [temp1 + (sigma0 + maj | 0) | 0, hash[0], hash[1], hash[2], hash[3] + temp1 | 0, hash[4], hash[5], hash[6]];
    }
    for (let i = 0; i < 8; i++) {
      hash[i] = hash[i] + oldHash[i] | 0;
    }
  }
  for (let i = 0; i < 8; i++) {
    for (let j = 3; j >= 0; j--) {
      const b = hash[i] >> j * 8 & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
},

    _cleanText(text) {
  if (!text) return '';
  return String(text).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/\s+/g, ' ').trim();
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

    calculateTransactionHash({
  iban,
  konto_iban,
  accountIban,
  buchungstag,
  betrag,
  verwendungszweck,
  partnerIban,
  partner_iban,
  primanota,
  occurrenceIndex = 0
}) {
  const normIban = this._cleanIban(iban || konto_iban || accountIban);
  const normTag = String(buchungstag || '').trim();
  const normBetrag = (Math.round((parseFloat(betrag) || 0) * 100) / 100).toFixed(2);
  const normText = String(verwendungszweck || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const normPartner = this._cleanIban(partnerIban || partner_iban);
  const normNota = String(primanota || '').trim();
  const occ = parseInt(occurrenceIndex, 10) || 0;
  const raw = occ > 0 ? `${normIban}|${normTag}|${normBetrag}|${normText}|${normPartner}|${normNota}|${occ}` : `${normIban}|${normTag}|${normBetrag}|${normText}|${normPartner}|${normNota}`;
  return this._sha256(raw);
},

};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = bankingUtils;
}
if (typeof window !== 'undefined') {
    window.bankingUtils = bankingUtils;
}

if (typeof window !== 'undefined') {
    window.BankingUtils = bankingUtils;
}
