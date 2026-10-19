// =============================================================================
// soap-ship-dangerous-goods.js
//
// Purolator EWS SOAP - create a DANGEROUS GOODS shipment (Shipping v2
// CreateShipment), then fetch the Dangerous Goods Declaration document
// (Shipping Documents v1 GetDocuments) for the same PIN.
//
// Every class/mode/service combination below was sent live and returned a
// clean response on 2026-10-06 (Development SOAP run, Purolator_TC_EWS). The
// DG option values are copied from those requests. Nothing here is invented.
//
// How dangerous goods work in CreateShipmentRequest:
//   * Three options travel together in PackageInformation/OptionsInformation:
//         <ID>DangerousGoods</ID>       <Value>true</Value>
//         <ID>DangerousGoodsClass</ID>  <Value>FullyRegulated | LimitedQuantities | LessThan500kgExempt | UN3373 | UN1845</Value>
//         <ID>DangerousGoodsMode</ID>   <Value>Air | Ground</Value>
//   * ONE <Value> per option. Listing several classes under one ID is what
//     produces 1100508 ("Mode Air is not valid with Class Limited Quantities"):
//     the service evaluates every value it is given.
//   * The mode must match the service: PurolatorExpress* is an AIR service
//     (1100521 with Ground); PurolatorGround takes Ground.
//   * DangerousGoodsDeclarationDocumentIndicator true asks the carrier to
//     prepare the declaration, fetched afterwards with GetDocuments and
//     DocumentType DangerousGoodsDeclaration (regular/laser printer only).
//
// Scenarios (pick one on the command line):
//   fully-regulated-air     PurolatorExpress     FullyRegulated     Air     (SHIP · Domestic · Dangerous Goods)
//   un3373-air              PurolatorExpress     UN3373             Air     (SHIP · Domestic · Dangerous Goods Declaration)
//   limited-quantity-ground PurolatorGround      LimitedQuantities  Ground  (SHIP · Domestic · Dangerous Goods Limited Quantity)
//   us-un3373-air           PurolatorExpressU.S. UN3373             Air     (SAMPLE · US · Ship Dangerous Goods) - needs customs data, see US_RECEIVER
//
// Every name, address and phone below is sample data and is safe to share.
// Replace it with your own before going live.
//
// Requires Node.js 18+ (built-in fetch). No npm packages needed.
//
// Windows (PowerShell) usage:
//   $env:PUROLATOR_ENV           = "dev"      # dev = devwebservices, prod = webservices
//   $env:PUROLATOR_SOAP_KEY      = "<your EWS key>"
//   $env:PUROLATOR_SOAP_PASSWORD = "<your EWS password>"
//   $env:PUROLATOR_ACCOUNT       = "<your billing account number>"
//   node soap-ship-dangerous-goods.js limited-quantity-ground
//   node soap-ship-dangerous-goods.js limited-quantity-ground --validate   # ValidateShipment, creates nothing
//
// PUROLATOR_SOAP_BASE, when set, overrides the PUROLATOR_ENV host. Credentials
// come from environment variables so they never sit in the code.
// =============================================================================

const fs = require('fs');
const crypto = require('crypto');

// ---- Hosts per tier (see README · Endpoints) ---------------------------------
const HOSTS = {
  dev:  'https://devwebservices.purolator.com',
  prod: 'https://webservices.purolator.com',
};

// ---- Settings read from the environment -------------------------------------
const ENV       = (process.env.PUROLATOR_ENV || 'dev').toLowerCase();
const SOAP_BASE = process.env.PUROLATOR_SOAP_BASE || HOSTS[ENV];
const KEY       = process.env.PUROLATOR_SOAP_KEY;
const PASSWORD  = process.env.PUROLATOR_SOAP_PASSWORD;
const ACCOUNT   = process.env.PUROLATOR_ACCOUNT;

if (!SOAP_BASE) { console.error(`PUROLATOR_ENV must be dev or prod (got "${ENV}")`); process.exit(1); }
for (const [name, value] of Object.entries({
  PUROLATOR_SOAP_KEY: KEY, PUROLATOR_SOAP_PASSWORD: PASSWORD, PUROLATOR_ACCOUNT: ACCOUNT,
})) {
  if (!value) { console.error(`Missing environment variable: ${name}`); process.exit(1); }
}

// EWS uses HTTP Basic auth with the key as user name and the password as password.
const BASIC = 'Basic ' + Buffer.from(`${KEY}:${PASSWORD}`).toString('base64');

const SHIPPING_URL  = SOAP_BASE + '/EWS/V2/Shipping/ShippingService.asmx';
const DOCUMENTS_URL = SOAP_BASE + '/EWS/V1/ShippingDocuments/ShippingDocumentsService.asmx';
const NS_V2 = 'http://purolator.com/pws/datatypes/v2';
const NS_V1 = 'http://purolator.com/pws/datatypes/v1';

// ---- Verified scenarios -------------------------------------------------------
const SCENARIOS = {
  'fully-regulated-air': {
    serviceId: 'PurolatorExpress', dgClass: 'FullyRegulated', dgMode: 'Air', lane: 'CA',
    weightUnit: 'kg', dimUnit: 'cm', weight: 5.44, length: 25.4, width: 63.5, height: 12.7,
  },
  'un3373-air': {                                   // UN3373 = Biological substance, Category B
    serviceId: 'PurolatorExpress', dgClass: 'UN3373', dgMode: 'Air', lane: 'CA',
    weightUnit: 'kg', dimUnit: 'cm', weight: 5.44, length: 25.4, width: 63.5, height: 12.7,
  },
  'limited-quantity-ground': {
    serviceId: 'PurolatorGround', dgClass: 'LimitedQuantities', dgMode: 'Ground', lane: 'CA',
    weightUnit: 'lb', dimUnit: 'in', weight: 10, length: 12, width: 12, height: 1,
  },
  'us-un3373-air': {
    serviceId: 'PurolatorExpressU.S.', dgClass: 'UN3373', dgMode: 'Air', lane: 'US',
    weightUnit: 'lb', dimUnit: 'in', weight: 2, length: 10, width: 10, height: 10,
  },
};

// ---- Sample parties (fictional, shareable) ----------------------------------
// SOAP takes the street broken into number / name / type, not one line.
const SENDER = {
  name: 'Sample Shipper', company: 'Sample Shipper Inc.',
  streetNumber: '100', streetName: 'Sample', streetType: 'Street',
  city: 'Mississauga', province: 'ON', country: 'CA', postalCode: 'L5N5N1',
  phone: { countryCode: '1', areaCode: '555', phone: '5550100' },
};
const RECEIVER = {
  name: 'Sample Client', company: 'Sample Client Ltd.',
  streetNumber: '200', streetName: 'Sample', streetType: 'Avenue',
  city: 'North York', province: 'ON', country: 'CA', postalCode: 'M2R3G7',
  phone: { countryCode: '1', areaCode: '555', phone: '5550101' },
};
const US_RECEIVER = {
  name: 'Sample US Client', company: 'Sample US Client LLC',
  streetNumber: '300', streetName: 'Sample', streetType: 'Road',
  city: 'Buffalo', province: 'NY', country: 'US', postalCode: '14201',
  phone: { countryCode: '1', areaCode: '555', phone: '5550102' },
};

// ---- Helpers -------------------------------------------------------------------
// Escape text going into XML. Addresses with "&" would otherwise break the envelope.
const x = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Ship date in the carrier's timezone (Toronto), five days ahead.
function shipDate(daysAhead = 5) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
}

function addressXml(p) {
  return `
            <Address>
              <Name>${x(p.name)}</Name>
              <Company>${x(p.company)}</Company>
              <StreetNumber>${x(p.streetNumber)}</StreetNumber>
              <StreetName>${x(p.streetName)}</StreetName>
              <StreetType>${x(p.streetType)}</StreetType>
              <City>${x(p.city)}</City>
              <Province>${x(p.province)}</Province>
              <Country>${x(p.country)}</Country>
              <PostalCode>${x(p.postalCode)}</PostalCode>
              <PhoneNumber>
                <CountryCode>${p.phone.countryCode}</CountryCode>
                <AreaCode>${p.phone.areaCode}</AreaCode>
                <Phone>${p.phone.phone}</Phone>
              </PhoneNumber>
            </Address>`;
}

// Cross-border shipments need customs content. Element names and the duty block
// are exactly those of the US sample that passed; replace the goods line with
// your own description, HS code, origin and value.
function internationalXml() {
  return `
          <InternationalInformation>
            <DocumentsOnlyIndicator>false</DocumentsOnlyIndicator>
            <ContentDetails>
              <ContentDetail>
                <Description>Sample goods</Description>
                <HarmonizedCode>3822000002</HarmonizedCode>
                <CountryOfManufacture>CA</CountryOfManufacture>
                <ProductCode>SAMPLE-1</ProductCode>
                <UnitValue>5.00</UnitValue>
                <Quantity>1</Quantity>
              </ContentDetail>
            </ContentDetails>
            <DutyInformation>
              <BillDutiesToParty>Sender</BillDutiesToParty>
              <BusinessRelationship>NotRelated</BusinessRelationship>
              <Currency>CAD</Currency>
            </DutyInformation>
            <ImportExportType>Permanent</ImportExportType>
            <CustomsInvoiceDocumentIndicator>true</CustomsInvoiceDocumentIndicator>
          </InternationalInformation>`;
}

// ---- Envelope: CreateShipment / ValidateShipment ------------------------------
// The two operations share one body; only the root element and SOAPAction differ.
function shipmentEnvelope(scenario, reference, validateOnly) {
  const s = SCENARIOS[scenario];
  const op = validateOnly ? 'ValidateShipmentRequest' : 'CreateShipmentRequest';
  const receiver = s.lane === 'US' ? US_RECEIVER : RECEIVER;
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns="${NS_V2}">
  <soapenv:Header>
    <RequestContext>
      <Version>2.2</Version>
      <Language>en</Language>
      <GroupID></GroupID>
      <RequestReference>${x(reference)}</RequestReference>
    </RequestContext>
  </soapenv:Header>
  <soapenv:Body>
    <${op}>
      <Shipment>
        <SenderInformation>${addressXml(SENDER)}
        </SenderInformation>
        <ReceiverInformation>${addressXml(receiver)}
        </ReceiverInformation>
        <ShipmentDate>${shipDate()}</ShipmentDate>
        <PackageInformation>
          <ServiceID>${s.serviceId}</ServiceID>
          <TotalWeight>
            <Value>${s.weight}</Value>
            <WeightUnit>${s.weightUnit}</WeightUnit>
          </TotalWeight>
          <TotalPieces>1</TotalPieces>
          <PiecesInformation>
            <Piece>
              <Weight><Value>${s.weight}</Value><WeightUnit>${s.weightUnit}</WeightUnit></Weight>
              <Length><Value>${s.length}</Value><DimensionUnit>${s.dimUnit}</DimensionUnit></Length>
              <Width><Value>${s.width}</Value><DimensionUnit>${s.dimUnit}</DimensionUnit></Width>
              <Height><Value>${s.height}</Value><DimensionUnit>${s.dimUnit}</DimensionUnit></Height>
            </Piece>
          </PiecesInformation>
          <!-- Ask the carrier to prepare the Dangerous Goods Declaration for this PIN. -->
          <DangerousGoodsDeclarationDocumentIndicator>true</DangerousGoodsDeclarationDocumentIndicator>
          <OptionsInformation>
            <Options>
              <!-- The three DG options always travel together, one Value each. -->
              <OptionIDValuePair><ID>DangerousGoods</ID><Value>true</Value></OptionIDValuePair>
              <OptionIDValuePair><ID>DangerousGoodsClass</ID><Value>${s.dgClass}</Value></OptionIDValuePair>
              <OptionIDValuePair><ID>DangerousGoodsMode</ID><Value>${s.dgMode}</Value></OptionIDValuePair>
            </Options>
          </OptionsInformation>
        </PackageInformation>${s.lane === 'US' ? internationalXml() : ''}
        <PaymentInformation>
          <PaymentType>Sender</PaymentType>
          <RegisteredAccountNumber>${x(ACCOUNT)}</RegisteredAccountNumber>
          <BillingAccountNumber>${x(ACCOUNT)}</BillingAccountNumber>
        </PaymentInformation>
        <PickupInformation>
          <PickupType>DropOff</PickupType>
        </PickupInformation>
        <TrackingReferenceInformation>
          <Reference1>${x(reference)}</Reference1>
        </TrackingReferenceInformation>
        <OtherInformation>
          <SpecialInstructions>DG ${s.dgClass}</SpecialInstructions>
        </OtherInformation>
      </Shipment>
      <PrinterType>Regular</PrinterType>
    </${op}>
  </soapenv:Body>
</soapenv:Envelope>`;
}

// ---- Envelope: GetDocuments (v1) ----------------------------------------------
function documentsEnvelope(pin, reference) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v1="${NS_V1}" xmlns:sys="http://schemas.datacontract.org/2004/07/System">
  <soapenv:Header>
    <v1:RequestContext>
      <v1:Version>1.0</v1:Version>
      <v1:Language>en</v1:Language>
      <v1:GroupID></v1:GroupID>
      <v1:RequestReference>${x(reference)}</v1:RequestReference>
    </v1:RequestContext>
  </soapenv:Header>
  <soapenv:Body>
    <v1:GetDocumentsRequest>
      <v1:DocumentCriterium>
        <v1:DocumentCriteria>
          <v1:PIN><v1:Value>${x(pin)}</v1:Value></v1:PIN>
          <v1:DocumentTypes>
            <sys:DocumentType>DangerousGoodsDeclaration</sys:DocumentType>
          </v1:DocumentTypes>
        </v1:DocumentCriteria>
      </v1:DocumentCriterium>
    </v1:GetDocumentsRequest>
  </soapenv:Body>
</soapenv:Envelope>`;
}

// ---- Transport -----------------------------------------------------------------
async function soapCall(url, action, xml) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': BASIC,
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': action,
    },
    body: xml,
  });
  return { res, text: await res.text() };
}

// EWS returns HTTP 200 with <ResponseInformation><Errors> on business errors,
// so a 200 is not enough: look for error codes in the body too.
function errorsIn(text) {
  const errs = [];
  const re = /<(?:\w+:)?Error>\s*<(?:\w+:)?Code>([^<]+)<\/(?:\w+:)?Code>\s*<(?:\w+:)?Description>([^<]*)<\/(?:\w+:)?Description>/g;
  let m;
  while ((m = re.exec(text))) errs.push(`${m[1]} ${m[2]}`);
  return errs;
}

// The shipment PIN sits in <ShipmentPIN><Value>...</Value></ShipmentPIN>.
function findPin(text) {
  const m = text.match(/<(?:\w+:)?ShipmentPIN>\s*<(?:\w+:)?Value>([^<]+)</);
  return m ? m[1] : '';
}

// Document links come back as URLs inside <URL>; download them as PDFs.
async function saveDocuments(text, prefix) {
  const saved = [];
  const urls = [...new Set((text.match(/<(?:\w+:)?URL>([^<]+)</g) || []).map(u => u.replace(/^<[^>]+>/, '').replace(/<$/, '')))];
  for (const [i, raw] of urls.entries()) {
    const url = raw.replace(/&amp;/g, '&');
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const bytes = Buffer.from(await r.arrayBuffer());
      if (bytes.slice(0, 4).toString() !== '%PDF') continue;
      const file = `${prefix}-${i + 1}.pdf`;
      fs.writeFileSync(file, bytes);
      saved.push(file);
    } catch (e) { /* not a document link - skip */ }
  }
  return saved;
}

// ---- Main ----------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const validateOnly = args.includes('--validate');
  const scenario = args.find(a => !a.startsWith('--')) || 'limited-quantity-ground';
  if (!SCENARIOS[scenario]) {
    console.error(`Unknown scenario "${scenario}". Choose one of: ${Object.keys(SCENARIOS).join(', ')}`);
    process.exit(1);
  }
  const reference = `DG-${Date.now()}`; // RequestReference: at most 36 characters

  // 1. Create (or validate) the shipment.
  const action = 'http://purolator.com/pws/service/v2/' + (validateOnly ? 'ValidateShipment' : 'CreateShipment');
  const { res, text } = await soapCall(SHIPPING_URL, action, shipmentEnvelope(scenario, reference, validateOnly));
  fs.writeFileSync(`response-${reference}.xml`, text); // keep the raw response for support
  const errs = errorsIn(text);
  if (!res.ok || errs.length) {
    console.error(`HTTP ${res.status}${errs.length ? '\n' + errs.join('\n') : '\n' + text}`);
    process.exit(1);
  }
  if (validateOnly) {
    console.log(`Validated ${scenario} on ${ENV}. Nothing was created.`);
    return;
  }

  const pin = findPin(text);
  console.log(`Shipment created: ${scenario} on ${ENV}. PIN ${pin || '(not found - see response file)'}`);
  // Labels are not returned by CreateShipment in SOAP; fetch them with
  // GetDocuments and DocumentType DomesticBillOfLading / InternationalBillOfLading.

  // 2. Fetch the Dangerous Goods Declaration for the new PIN.
  if (pin) {
    const doc = await soapCall(DOCUMENTS_URL, 'http://purolator.com/pws/service/v1/GetDocuments', documentsEnvelope(pin, reference));
    fs.writeFileSync(`response-${reference}-declaration.xml`, doc.text);
    const docErrs = errorsIn(doc.text);
    if (docErrs.length) {
      // 1001181 "Unsupport Document Type" means the declaration is not available
      // for this PIN / environment; the shipment itself is fine.
      console.error(`Declaration request returned: ${docErrs.join('; ')}`);
    } else {
      const files = await saveDocuments(doc.text, `${reference}-dg-declaration`);
      console.log(`Declaration saved: ${files.length ? files.join(', ') : 'no PDF link in response - see response file'}`);
    }
  }
  console.log(`Full responses: response-${reference}*.xml`);
}

main().catch(err => { console.error(err); process.exit(1); });
