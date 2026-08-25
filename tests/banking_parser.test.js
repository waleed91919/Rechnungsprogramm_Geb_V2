const test = require('node:test');
const assert = require('node:assert/strict');
const BankingController = require('../controllers/BankingController');

const SAMPLE_CAMT053 = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr>
      <MsgId>MSG-20260826-001</MsgId>
      <CreDtTm>2026-08-26T08:00:00Z</CreDtTm>
    </GrpHdr>
    <Stmt>
      <Id>STMT-2026-001</Id>
      <Acct>
        <Id>
          <IBAN>DE89370400440532013000</IBAN>
        </Id>
      </Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">10000.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-08-01</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">12500.50</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-08-25</Dt></Dt>
      </Bal>
      <Ntry>
        <Amt Ccy="EUR">1500.50</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-08-10</Dt></BookgDt>
        <ValDt><Dt>2026-08-10</Dt></ValDt>
        <NtryDtls>
          <TxDtls>
            <Refs>
              <EndToEndId>E2E-1001</EndToEndId>
              <TxId>TX-1001</TxId>
            </Refs>
            <RltdPties>
              <Dbtr>
                <Nm>Alpha Facility GmbH</Nm>
              </Dbtr>
              <DbtrAcct>
                <Id>
                  <IBAN>DE44500105175407324931</IBAN>
                </Id>
              </DbtrAcct>
            </RltdPties>
            <RmtInf>
              <Ustrd>Rechnung INV-2026-042 Unterhaltsreinigung August</Ustrd>
            </RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">1000.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-08-12</Dt></BookgDt>
        <ValDt><Dt>2026-08-12</Dt></ValDt>
        <NtryDtls>
          <TxDtls>
            <Refs>
              <EndToEndId>E2E-1002</EndToEndId>
            </Refs>
            <RltdPties>
              <Dbtr>
                <Nm>Beta Immobilien AG</Nm>
              </Dbtr>
              <DbtrAcct>
                <Id>
                  <IBAN>DE27300606010123456789</IBAN>
                </Id>
              </DbtrAcct>
            </RltdPties>
            <RmtInf>
              <Strd>
                <CdtrRefInf>
                  <Ref>INV-2026-043</Ref>
                </CdtrRefInf>
              </Strd>
            </RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">250.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-08-15</Dt></BookgDt>
        <ValDt><Dt>2026-08-15</Dt></ValDt>
        <NtryDtls>
          <TxDtls>
            <RltdPties>
              <Cdtr>
                <Nm>Reinigungsbedarf Grosshandel GmbH</Nm>
              </Cdtr>
              <CdtrAcct>
                <Id>
                  <IBAN>DE89370400440532013999</IBAN>
                </Id>
              </CdtrAcct>
            </RltdPties>
            <RmtInf>
              <Ustrd>Lieferschein 88472 Reinigungsmittel</Ustrd>
            </RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

const SAMPLE_SPARKASSE_CSV = `"Auftragskonto";"Buchungstag";"Valutadatum";"Buchungstext";"Verwendungszweck";"Beguenstigter/Zahlungspflichtiger";"Kontonummer/IBAN";"BLZ/BIC";"Betrag";"Waehrung";"Info"
"DE89370400440532013000";"10.08.2026";"10.08.2026";"GUTSCHRIFT";"RECHNUNG INV-2026-001 ZAHLUNG";"Alpha Facility GmbH";"DE44500105175407324931";"COBADEFFXXX";"1.250,50";"EUR";"Umsatz gebucht"
"DE89370400440532013000";"15.08.2026";"15.08.2026";"LASTSCHRIFT";"REINIGUNGSBEDARF LIEF-44";"Grosshandel Nord GmbH";"DE89370400440532013999";"GENODED1STG";"-350,00";"EUR";"Umsatz gebucht"`;

const SAMPLE_VOLKSBANK_CSV = `"Bezeichnung Auftragskonto";"IBAN Auftragskonto";"BIC Auftragskonto";"Bankname Auftragskonto";"Buchungstag";"Valutadatum";"Name Zahlungsbeteiligter";"IBAN Zahlungsbeteiligter";"BIC (SWIFT-Code) Zahlungsbeteiligter";"Buchungstext";"Verwendungszweck";"Betrag";"Waehrung";"Saldo nach Buchung";"Bemerkung"
"Geschäftskonto";"DE89370400440532013000";"GENODED1STG";"Volksbank";"11.08.2026";"11.08.2026";"Beta Immobilien AG";"DE27300606010123456789";"COBADEFFXXX";"Überweisung";"Ausgleich INV-2026-002";"2.400,00";"EUR";"15.000,00";""`;

const SAMPLE_DEUTSCHE_BANK_CSV = `Buchungstag;Wert;Umsatzart;Begünstigter / Auftraggeber;Verwendungszweck;IBAN;BIC;Kundenreferenz;Mandatsreferenz;Gläubiger ID;Fremde Gebühren;Betrag;Währung;Soll/Haben
12.08.2026;12.08.2026;Überweisungsgutschrift;Gamma Bau & Reinigung;Zahlung INV-2026-003;DE12500105170000000000;DEUTDEDDXXX;;;;;850,00;EUR;Haben
14.08.2026;14.08.2026;Lastschrift;Stadtwerke Strom;Stromabschlag August;DE99500105170000000000;DEUTDEDDXXX;;;;;120,50;EUR;Soll`;

test('B1: CAMT.053 XML Parser extrahiert Statements, Salden und Transaktionen korrekt', () => {
    const statements = BankingController.parseCamt053(SAMPLE_CAMT053);
    assert.equal(statements.length, 1);

    const stmt = statements[0];
    assert.equal(stmt.iban, 'DE89370400440532013000');
    assert.equal(stmt.openingBalance, 10000.00);
    assert.equal(stmt.closingBalance, 12500.50);
    assert.equal(stmt.transactions.length, 3);

    const tx1 = stmt.transactions[0];
    assert.equal(tx1.betrag, 1500.50);
    assert.equal(tx1.buchungstag, '2026-08-10');
    assert.equal(tx1.valutadatum, '2026-08-10');
    assert.equal(tx1.partner_name, 'Alpha Facility GmbH');
    assert.equal(tx1.partner_iban, 'DE44500105175407324931');
    assert.equal(tx1.verwendungszweck, 'Rechnung INV-2026-042 Unterhaltsreinigung August');
    assert.equal(tx1.end_to_end_id, 'E2E-1001');

    const tx2 = stmt.transactions[1];
    assert.equal(tx2.betrag, 1000.00);
    assert.equal(tx2.partner_name, 'Beta Immobilien AG');
    assert.equal(tx2.verwendungszweck, 'INV-2026-043');

    const tx3 = stmt.transactions[2];
    assert.equal(tx3.betrag, -250.00);
    assert.equal(tx3.partner_name, 'Reinigungsbedarf Grosshandel GmbH');
});

test('B2: Sparkasse CSV Parser liest Gutschriften und Lastschriften mit deutschen Zahlenformaten', () => {
    const txs = BankingController.parseCsvStatement(SAMPLE_SPARKASSE_CSV, 'SPARKASSE');
    assert.equal(txs.length, 2);

    assert.equal(txs[0].betrag, 1250.50);
    assert.equal(txs[0].buchungstag, '2026-08-10');
    assert.equal(txs[0].partner_name, 'Alpha Facility GmbH');
    assert.equal(txs[0].partner_iban, 'DE44500105175407324931');
    assert.equal(txs[0].verwendungszweck, 'RECHNUNG INV-2026-001 ZAHLUNG');

    assert.equal(txs[1].betrag, -350.00);
    assert.equal(txs[1].partner_name, 'Grosshandel Nord GmbH');
});

test('B3: Volksbank FIDUCIA CSV Parser erkennt Spalten und Beträge automatisch', () => {
    const txs = BankingController.parseCsvStatement(SAMPLE_VOLKSBANK_CSV, 'VOLKSBANK');
    assert.equal(txs.length, 1);

    assert.equal(txs[0].betrag, 2400.00);
    assert.equal(txs[0].buchungstag, '2026-08-11');
    assert.equal(txs[0].partner_name, 'Beta Immobilien AG');
    assert.equal(txs[0].verwendungszweck, 'Ausgleich INV-2026-002');
});

test('B4: Deutsche Bank CSV Parser verarbeitet Soll/Haben-Kennzeichnung', () => {
    const txs = BankingController.parseCsvStatement(SAMPLE_DEUTSCHE_BANK_CSV, 'DEUTSCHE_BANK');
    assert.equal(txs.length, 2);

    assert.equal(txs[0].betrag, 850.00);
    assert.equal(txs[0].partner_name, 'Gamma Bau & Reinigung');

    assert.equal(txs[1].betrag, -120.50);
    assert.equal(txs[1].partner_name, 'Stadtwerke Strom');
});

test('B5: Auto-Erkennung des CSV-Formats funktioniert über Header-Muster', () => {
    const txsSpk = BankingController.parseCsvStatement(SAMPLE_SPARKASSE_CSV, 'AUTO');
    assert.equal(txsSpk.length, 2);

    const txsVb = BankingController.parseCsvStatement(SAMPLE_VOLKSBANK_CSV, 'AUTO');
    assert.equal(txsVb.length, 1);

    const txsDb = BankingController.parseCsvStatement(SAMPLE_DEUTSCHE_BANK_CSV, 'AUTO');
    assert.equal(txsDb.length, 2);
});

test('B6: SHA-256 Transaktions-Hash ist deterministisch und verhindert Duplikate', () => {
    const txA1 = {
        konto_iban: 'DE89370400440532013000',
        buchungstag: '2026-08-10',
        betrag: 1250.50,
        partner_iban: 'DE44500105175407324931',
        verwendungszweck: 'RECHNUNG INV-2026-001'
    };
    const txA2 = { ...txA1 };
    const txB = { ...txA1, betrag: 1250.51 };

    const hash1 = BankingController.calculateTransactionHash(txA1);
    const hash2 = BankingController.calculateTransactionHash(txA2);
    const hash3 = BankingController.calculateTransactionHash(txB);

    assert.equal(typeof hash1, 'string');
    assert.equal(hash1.length, 64);
    assert.equal(hash1, hash2);
    assert.notEqual(hash1, hash3);
});
