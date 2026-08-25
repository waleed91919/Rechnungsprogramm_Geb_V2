const SepaController = {
    _escapeXml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    },

    _cleanIban(iban) {
        return String(iban || '').replace(/[\s-]+/g, '').toUpperCase();
    },

    _cleanBic(bic) {
        return String(bic || '').replace(/[\s-]+/g, '').toUpperCase();
    },

    validateIban(iban) {
        if (!iban || typeof iban !== 'string') return false;
        const clean = this._cleanIban(iban);
        if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(clean)) return false;

        const countryLengths = {
            DE: 22, AT: 20, CH: 21, FR: 27, IT: 27, ES: 24, NL: 18,
            BE: 16, LU: 20, PL: 28, CZ: 24, SK: 24, HU: 28, GB: 22
        };
        const country = clean.substring(0, 2);
        if (countryLengths[country] && clean.length !== countryLengths[country]) {
            return false;
        }

        const rearranged = clean.substring(4) + clean.substring(0, 4);
        let numeric = '';
        for (let i = 0; i < rearranged.length; i++) {
            const code = rearranged.charCodeAt(i);
            numeric += (code >= 65 && code <= 90) ? (code - 55).toString() : rearranged[i];
        }

        let remainder = 0;
        for (let i = 0; i < numeric.length; i += 7) {
            const part = remainder.toString() + numeric.substring(i, i + 7);
            remainder = parseInt(part, 10) % 97;
        }

        return remainder === 1;
    },

    validateBic(bic) {
        if (!bic || typeof bic !== 'string') return false;
        const clean = this._cleanBic(bic);
        return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(clean);
    },

    maskIban(iban) {
        const clean = this._cleanIban(iban);
        if (clean.length < 8) return clean;
        const country = clean.substring(0, 2);
        const last4 = clean.substring(clean.length - 4);
        return `${country}** **** **** **** ${last4}`;
    },

    calculateEasterSunday(year) {
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
        return new Date(Date.UTC(y, month - 1, day));
    },

    getTarget2Holidays(year) {
        const y = parseInt(year, 10);
        const holidays = new Set();
        holidays.add(`${y}-01-01`);
        holidays.add(`${y}-05-01`);
        holidays.add(`${y}-12-25`);
        holidays.add(`${y}-12-26`);

        const easter = this.calculateEasterSunday(y);
        const goodFriday = new Date(easter.getTime() - 2 * 24 * 60 * 60 * 1000);
        const easterMonday = new Date(easter.getTime() + 1 * 24 * 60 * 60 * 1000);

        const toIso = d => d.toISOString().split('T')[0];
        holidays.add(toIso(goodFriday));
        holidays.add(toIso(easterMonday));

        return holidays;
    },

    _isTarget2Holiday(isoStr) {
        if (!isoStr || typeof isoStr !== 'string') return false;
        const year = parseInt(isoStr.substring(0, 4), 10);
        const holidays = this.getTarget2Holidays(year);
        return holidays.has(isoStr.substring(0, 10));
    },

    isTarget2BankingDay(isoStr) {
        if (!isoStr || typeof isoStr !== 'string') return false;
        const clean = isoStr.substring(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return false;
        const date = new Date(clean + 'T00:00:00Z');
        const dayOfWeek = date.getUTCDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) return false;
        return !this._isTarget2Holiday(clean);
    },

    getNextTarget2BankingDay(startDateIso, leadDays = 1) {
        let cleanStart = String(startDateIso || '').substring(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanStart)) {
            cleanStart = new Date().toISOString().substring(0, 10);
        }
        let date = new Date(cleanStart + 'T00:00:00Z');
        let needed = Math.max(1, parseInt(leadDays, 10) || 1);
        let added = 0;

        while (added < needed) {
            date.setUTCDate(date.getUTCDate() + 1);
            const dayOfWeek = date.getUTCDay();
            const isoStr = date.toISOString().split('T')[0];

            if (dayOfWeek !== 0 && dayOfWeek !== 6 && !this._isTarget2Holiday(isoStr)) {
                added++;
            }
        }

        return date.toISOString().split('T')[0];
    },

    calculateTarget2DueDate(startDateIso, leadDays = 1) {
        return this.getNextTarget2BankingDay(startDateIso, leadDays);
    },

    generateMandateReference(kundennummer, suffix = '') {
        const cleanKn = String(kundennummer || 'KND').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        const cleanSuf = suffix ? '-' + String(suffix).replace(/[^A-Za-z0-9]/g, '').toUpperCase() : '';
        const raw = `MNDT-${cleanKn}${cleanSuf}`;
        return raw.substring(0, 35);
    },

    buildPreNotification({
        glaeubigerId,
        firmenname,
        mandatsreferenz,
        faelligkeitsdatum,
        betrag,
        iban,
        belegNr,
        kundenName
    }) {
        const num = Math.round((parseFloat(betrag) || 0) * 100) / 100;
        const betragStr = num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const masked = this.maskIban(iban);
        return `Vorabinformation über SEPA-Lastschrifteinzug (Pre-Notification)\n\n` +
            `Sehr geehrte(r) ${kundenName || 'Kunde'},\n\n` +
            `wir werden den fälligen Betrag für Beleg ${belegNr || ''} per SEPA-Lastschrift von Ihrem Konto einziehen.\n\n` +
            `Details zum Einzug:\n` +
            `• Gläubiger-Identifikationsnummer: ${glaeubigerId || ''}\n` +
            `• Mandatsreferenz: ${mandatsreferenz || ''}\n` +
            `• Fälligkeitsdatum / Einzugstermin: ${faelligkeitsdatum || ''}\n` +
            `• Einzugsbetrag: ${betragStr} €\n` +
            `• Belastungskonto: ${masked}\n` +
            `• Gläubiger: ${firmenname || ''}\n\n` +
            `Bitte sorgen Sie für ausreichende Deckung auf Ihrem Konto.\n\n` +
            `Mit freundlichen Grüßen,\n${firmenname || ''}`;
    },

    generatePain00800108(opts = {}) {
        return this.generatePain008Xml({ ...opts, schemaVersion: 'pain.008.001.08' });
    },

    generatePain00800102(opts = {}) {
        return this.generatePain008Xml({ ...opts, schemaVersion: 'pain.008.001.02' });
    },

    generatePain008Xml({
        msgId,
        messageId,
        initiatorName,
        initiatingPartyName,
        creditorName,
        creditorIban,
        creditorBic,
        creditorId,
        executionDate,
        schemeType = 'CORE',
        localInstrument,
        sequenceType = 'RCUR',
        schemaVersion = 'pain.008.001.08',
        transactions = []
    }) {
        const finalMsgId = msgId || messageId;
        const finalInitName = initiatorName || initiatingPartyName;
        const finalScheme = localInstrument || schemeType || 'CORE';
        const cleanCredIban = this._cleanIban(creditorIban);
        const cleanCredBic = this._cleanBic(creditorBic);
        const totalSum = Math.round(transactions.reduce((sum, tx) => sum + (parseFloat(tx.betrag !== undefined ? tx.betrag : tx.amount) || 0), 0) * 100) / 100;
        const totalCount = transactions.length;
        const creDtTm = new Date().toISOString().replace(/\.\d{3}Z$/, '');

        const xmlNamespace = schemaVersion === 'pain.008.001.02'
            ? 'urn:iso:std:iso:20022:tech:xsd:pain.008.001.02'
            : 'urn:iso:std:iso:20022:tech:xsd:pain.008.001.08';

        let txXml = '';
        for (const tx of transactions) {
            const txAmt = tx.betrag !== undefined ? tx.betrag : tx.amount;
            const txMandat = tx.mandatsreferenz !== undefined ? tx.mandatsreferenz : tx.mandateId;
            const txDateSig = tx.unterschriftsDatum !== undefined ? tx.unterschriftsDatum : tx.mandateDateOfSignature;
            const txDebtorNm = tx.kontoinhaber || tx.debtorName || tx.kundenName || 'Kunde';
            const txDebtorIban = tx.iban || tx.debtorIban;
            const txDebtorBic = tx.bic || tx.debtorBic;
            const txRmt = tx.verwendungszweck || tx.remittanceInfo || (tx.belegNr ? `Rechnung ${tx.belegNr}` : 'Rechnung');

            const endToEndId = this._escapeXml(tx.endToEndId || `E2E-${tx.dokumentId || Date.now()}`);
            const amountStr = (Math.round((parseFloat(txAmt) || 0) * 100) / 100).toFixed(2);
            const mandateId = this._escapeXml(txMandat);
            const dtOfSgntr = txDateSig || executionDate;
            const debtorName = this._escapeXml(txDebtorNm);
            const debtorIban = this._cleanIban(txDebtorIban);
            const debtorBic = this._cleanBic(txDebtorBic);
            const rmtInf = this._escapeXml(txRmt);

            txXml += `
      <DrctDbtTxInf>
        <PmtId>
          <EndToEndId>${endToEndId}</EndToEndId>
        </PmtId>
        <InstdAmt Ccy="EUR">${amountStr}</InstdAmt>
        <DrctDbtTx>
          <MndtRltdInf>
            <MndtId>${mandateId}</MndtId>
            <DtOfSgntr>${dtOfSgntr}</DtOfSgntr>
          </MndtRltdInf>
        </DrctDbtTx>
        ${debtorBic ? `<DbtrAgt><FinInstnId><BIC>${debtorBic}</BIC></FinInstnId></DbtrAgt>` : '<DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>'}
        <Dbtr>
          <Nm>${debtorName}</Nm>
        </Dbtr>
        <DbtrAcct>
          <Id>
            <IBAN>${debtorIban}</IBAN>
          </Id>
        </DbtrAcct>
        <RmtInf>
          <Ustrd>${rmtInf}</Ustrd>
        </RmtInf>
      </DrctDbtTxInf>`;
        }

        return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="${xmlNamespace}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${this._escapeXml(finalMsgId || `MSG-${Date.now()}`)}</MsgId>
      <CreDtTm>${creDtTm}</CreDtTm>
      <NbOfTxs>${totalCount}</NbOfTxs>
      <CtrlSum>${totalSum.toFixed(2)}</CtrlSum>
      <InitgPty>
        <Nm>${this._escapeXml(finalInitName || creditorName)}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>PMT-${this._escapeXml(finalMsgId || Date.now())}</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <BchBookg>true</BchBookg>
      <NbOfTxs>${totalCount}</NbOfTxs>
      <CtrlSum>${totalSum.toFixed(2)}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
        <LclInstrm>
          <Cd>${finalScheme}</Cd>
        </LclInstrm>
        <SeqTp>${sequenceType}</SeqTp>
      </PmtTpInf>
      <ReqdColltnDt>${executionDate}</ReqdColltnDt>
      <Cdtr>
        <Nm>${this._escapeXml(creditorName)}</Nm>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <IBAN>${cleanCredIban}</IBAN>
        </Id>
      </CdtrAcct>
      <CdtrAgt>
        <FinInstnId>
          ${cleanCredBic ? `<BIC>${cleanCredBic}</BIC>` : '<Othr><Id>NOTPROVIDED</Id></Othr>'}
        </FinInstnId>
      </CdtrAgt>
      <CdtrSchmeId>
        <Id>
          <OrgId>
            <Othr>
              <Id>${this._escapeXml(creditorId)}</Id>
              <SchmeNm>
                <Prtry>SEPA</Prtry>
              </SchmeNm>
            </Othr>
          </OrgId>
        </Id>
      </CdtrSchmeId>
      ${txXml}
    </PmtInf>
  </CstmrDrctDbtInitn>
</Document>`;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SepaController;
}
if (typeof window !== 'undefined') {
    window.SepaController = SepaController;
}
