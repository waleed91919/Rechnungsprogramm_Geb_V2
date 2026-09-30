const fs = require('fs');
const path = require('path');

// Mock `app` environment to simulate packaged context
const electron = require('electron');
if (!electron.app) {
    electron.app = {
        isPackaged: true,
        getAppPath: () => __dirname
    };
}

// In our packaged structure, resources path should point to the correct folder
const rootDir = process.cwd(); // Assume it's run from dist/linux-unpacked or project root appropriately
process.resourcesPath = path.join(rootDir, 'resources');

const { validateXML } = require('./main/services/gaeb-x84-schema-validator');

// Basic minimal XML for GAEB
const validXml3_2 = `<?xml version="1.0" encoding="UTF-8"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA84/3.2">
  <GAEBInfo>
    <Version>3.2</Version>
    <VersDate>2013-10</VersDate>
    <Date>2023-10-27</Date>
    <Time>12:00:00</Time>
    <ProgSystem>W-Link ERP</ProgSystem>
  </GAEBInfo>
  <PrjInfo>
    <NamePrj>Projekt</NamePrj>
  </PrjInfo>
  <Award>
    <DP>84</DP>
    <AwardInfo>
      <Cur>EUR</Cur>
    </AwardInfo>
    <CTR>
      <Address>
        <Name1>Bieter</Name1>
        <Street>Str</Street>
        <PCode>12345</PCode>
        <City>City</City>
      </Address>
    </CTR>
    <BoQ ID="BOQ1">
      <BoQInfo>
        <Name>Test</Name>
        <BoQBkdn>
          <Type>Lot</Type>
          <Length>2</Length>
          <Num>Yes</Num>
        </BoQBkdn>
        <Totals>
          <Total>10.00</Total>
        </Totals>
      </BoQInfo>
      <BoQBody>
        <Itemlist>
          <Item ID="ITEM1" RNoPart="1">
            <Qty>1</Qty>
            <UP>10.00</UP>
          </Item>
        </Itemlist>
      </BoQBody>
    </BoQ>
  </Award>
</GAEB>`;

const validXml3_3 = validXml3_2.replace('http://www.gaeb.de/GAEB_DA_XML/DA84/3.2', 'http://www.gaeb.de/GAEB_DA_XML/DA84/3.3').replace(/3\.2/g, '3.3').replace(/2013-10/g, '2021-05');

const invalidXml = `<?xml version="1.0" encoding="UTF-8"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA84/3.2">
  <INVALID_ELEMENT>test</INVALID_ELEMENT>
</GAEB>`;

async function runTests() {
    console.log("Testing 3.2 valid...");
    let res = validateXML(validXml3_2, '3.2');
    if (!res.valid) {
        console.error("3.2 Valid failed:", res.errors);
        process.exit(1);
    }
    console.log("OK");

    console.log("Testing 3.2 invalid...");
    res = validateXML(invalidXml, '3.2');
    if (res.valid) {
        console.error("3.2 Invalid passed (should fail)");
        process.exit(1);
    }
    console.log("OK (Validation failed as expected)");

    console.log("Testing 3.3 valid...");
    res = validateXML(validXml3_3, '3.3');
    if (!res.valid) {
        console.error("3.3 Valid failed:", res.errors);
        process.exit(1);
    }
    console.log("OK");

    console.log("Testing 3.3 invalid...");
    res = validateXML(invalidXml.replace('3.2', '3.3'), '3.3');
    if (res.valid) {
        console.error("3.3 Invalid passed (should fail)");
        process.exit(1);
    }
    console.log("OK (Validation failed as expected)");

    console.log("ALL TESTS PASSED");
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});