// =============================================================================
// rest-ship-dangerous-goods.js
//
// Purolator REST - create a DANGEROUS GOODS shipment, get its label and then
// fetch the Dangerous Goods Declaration document for the same PIN.
//
// Every class/mode/service combination below was sent live and returned
// HTTP 200 on 2026-10-06 (Certification REST run, Purolator_TC_EWS). The DG
// option values are copied from those requests. Nothing here is invented.
//
// How dangerous goods work on /ship/v1/shipment:
//   * Three shipment options travel together in shipmentOptionsInformation:
//         DangerousGoods       "true"
//         DangerousGoodsClass  FullyRegulated | LimitedQuantities | LessThan500kgExempt | UN3373 | UN1845
//         DangerousGoodsMode   Air | Ground
//   * The mode must match the service: PurolatorExpress* is an AIR service and
//     is rejected with Ground (9001-171 "mode named in the message"); Ground
//     services take Ground.
//   * dangerousGoodsDeclarationDocumentIndicator: true asks the carrier to
//     prepare the declaration. It can then be fetched from /ship/v1/documents
//     with documentType "DangerousGoodsDeclaration" (Laser/PDF output only).
//   * A return leg cannot carry DangerousGoods=true (REST error catalogue,
//     9001-140 to 9001-144 block), so this sample ships outbound only. The
//     shipper remains responsible for the regulatory paperwork and packaging.
//
// Scenarios (pick one on the command line):
//   fully-regulated-air     PurolatorExpress  FullyRegulated     Air     (SHIP · Domestic · Dangerous Goods)
//   un3373-air              PurolatorExpress  UN3373             Air     (SHIP · Domestic · Dangerous Goods Declaration)
//   limited-quantity-ground PurolatorGround   LimitedQuantities  Ground  (SHIP · Domestic · Dangerous Goods Limited Quantity)
//   fully-regulated-ground  PurolatorGround   FullyRegulated     Ground  (SAMPLE · Domestic · Ship Dangerous Good)
//
// Every name, address and phone below is sample data and is safe to share.
// Replace it with your own before going live.
//
// Requires Node.js 18+ (built-in fetch). No npm packages needed.
//
// Windows (PowerShell) usage:
//   $env:PUROLATOR_ENV       = "dev"              # dev = shipapi-sandbox, prod = shipapi
//   $env:PUROLATOR_X_API_KEY = "<your x-api-key>"
//   $env:PUROLATOR_TOKEN     = "<your bearer token>"
//   $env:PUROLATOR_ACCOUNT   = "<your billing account number>"
//   node rest-ship-dangerous-goods.js un3373-air
//   node rest-ship-dangerous-goods.js un3373-air --validate    # validateOnly, creates nothing
//
// PUROLATOR_BASE_URL, when set, overrides the PUROLATOR_ENV host (for example
// for a certification host). Credentials come from environment variables so
// they never sit in the code.
// =============================================================================

const fs = require('fs');
const crypto = require('crypto');

// ---- Hosts per tier (see README · Endpoints) ---------------------------------
const HOSTS = {
  dev:  'https://shipapi-sandbox.purolator.com',
  prod: 'https://shipapi.purolator.com',
};

// ---- Settings read from the environment -------------------------------------
const ENV      = (process.env.PUROLATOR_ENV || 'dev').toLowerCase();
const BASE_URL = process.env.PUROLATOR_BASE_URL || HOSTS[ENV];
const API_KEY  = process.env.PUROLATOR_X_API_KEY;
const TOKEN    = process.env.PUROLATOR_TOKEN;
const ACCOUNT  = process.env.PUROLATOR_ACCOUNT;

// Fail early with a clear message instead of a vague 401/403 from the gateway.
if (!BASE_URL) { console.error(`PUROLATOR_ENV must be dev or prod (got "${ENV}")`); process.exit(1); }
for (const [name, value] of Object.entries({
  PUROLATOR_X_API_KEY: API_KEY, PUROLATOR_TOKEN: TOKEN, PUROLATOR_ACCOUNT: ACCOUNT,
})) {
  if (!value) { console.error(`Missing environment variable: ${name}`); process.exit(1); }
}

const CREATE_SHIPMENT_PATH = '/ship/v1/shipment';
const DOCUMENTS_PATH       = '/ship/v1/documents';

// ---- Verified scenarios -------------------------------------------------------
// serviceId + class + mode exactly as they passed. Weights/dimensions are the
// ones from the same requests (metric for the air cases, imperial for ground).
const SCENARIOS = {
  'fully-regulated-air': {
    serviceId: 'PurolatorExpress', dgClass: 'FullyRegulated', dgMode: 'Air',
    unitOfMeasurement: 'METRIC', weight: 5.44, dims: { packageLength: 25.4, packageWidth: 63.5, packageHeight: 12.7 },
    description: 'Test Pkg Desc',
  },
  'un3373-air': {
    serviceId: 'PurolatorExpress', dgClass: 'UN3373', dgMode: 'Air',          // UN3373 = Biological substance, Category B
    unitOfMeasurement: 'METRIC', weight: 5.44, dims: { packageLength: 25.4, packageWidth: 63.5, packageHeight: 12.7 },
    description: 'Test Pkg Desc',
  },
  'limited-quantity-ground': {
    serviceId: 'PurolatorGround', dgClass: 'LimitedQuantities', dgMode: 'Ground',
    unitOfMeasurement: 'IMPERIAL', weight: 10, dims: { packageLength: 12, packageWidth: 12, packageHeight: 1 },
    description: 'Limited quantity goods',
  },
  'fully-regulated-ground': {
    serviceId: 'PurolatorGround', dgClass: 'FullyRegulated', dgMode: 'Ground',
    unitOfMeasurement: 'IMPERIAL', weight: 10, dims: { packageLength: 12, packageWidth: 12, packageHeight: 1 },
    description: 'Fully regulated goods',
  },
};

// ---- Sample parties (fictional, shareable) ----------------------------------
const SENDER = {
  attentionTo: 'Sample Shipper',
  companyName: 'Sample Shipper Inc.',
  streetAddress: ['100 Sample Street'],
  city: 'Mississauga', provinceStateCode: 'ON', country: 'CA',
  postalZipCode: 'L5N5N1', phoneNumber: '5555550100',
};
const RECEIVER = {
  attentionTo: 'Sample Client',
  companyName: 'Sample Client Ltd.',
  streetAddress: ['200 Sample Avenue'],
  city: 'North York', provinceStateCode: 'ON', country: 'CA',
  postalZipCode: 'M2R3G7', phoneNumber: '5555550101',
};

// ---- Shipment date -----------------------------------------------------------
// Validated in the carrier's timezone (Toronto), not the machine's. Today
// through +10 days is accepted; five days ahead stays safely inside that window.
function shipDate(daysAhead = 5) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
}

// ---- Request body ------------------------------------------------------------
function buildBody(scenario, reference, validateOnly) {
  const s = SCENARIOS[scenario];
  // "_" is rejected in references, so normalise it.
  const ref = String(reference).replace(/_/g, '-');

  return {
    lineOfBusiness: 'COURIER',
    shipmentDate: shipDate(),
    validateOnly,             // true = check the body, create nothing, no PIN back
    returnsManagement: false,
    returnRates: false,       // no return leg: a return cannot carry dangerous goods

    // Label requested in the same call. The DG declaration is a separate
    // document fetched afterwards (see fetchDeclaration).
    shipmentDocuments: {
      label: { outputType: 'PDF', printerFormat: 'Laser', responseType: 'BASE64' },
    },

    outboundShipment: {
      pickupType: 'DROPOFF',
      paymentInformation: {
        paymentType: 'Sender',
        registeredAccountNumber: ACCOUNT,
        billingAccountNumber: ACCOUNT,
      },
      senderInformation: SENDER,
      receiverInformation: RECEIVER,
      shipmentInformation: {
        serviceId: s.serviceId,
        unitOfMeasurement: s.unitOfMeasurement,
        descriptionOfGoods: s.description,
        totalWeight: s.weight,
        totalPackages: 1,
        // Ask the carrier to prepare the Dangerous Goods Declaration for this PIN.
        dangerousGoodsDeclarationDocumentIndicator: true,
        // The three DG options always travel together.
        shipmentOptionsInformation: [
          { optionId: 'DangerousGoods',      optionIdValue: 'true' },
          { optionId: 'DangerousGoodsClass', optionIdValue: s.dgClass },
          { optionId: 'DangerousGoodsMode',  optionIdValue: s.dgMode },
        ],
        packageInformation: [{ packageWeight: s.weight, ...s.dims }],
      },
      customerReferenceInformation: { shipmentReference1: ref, notes: `DG ${s.dgClass}` },
    },
  };
}

// ---- Shared request helper ---------------------------------------------------
async function post(path, body) {
  const res = await fetch(BASE_URL + path, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'Authorization': `Bearer ${TOKEN}`,
      'RequestReference': crypto.randomUUID(), // 36 characters, the maximum
      'Language': 'en',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { res, text: await res.text() };
}

// ---- PIN + document extraction -----------------------------------------------
// The PIN's field path differs between responses, so search for it. Most
// specific key first so a piece PIN can never win over the shipment PIN.
function findPin(obj) {
  const want = ['shipmentpin', 'pin'];
  for (const key of want) {
    const hit = (function walk(node) {
      if (node === null || typeof node !== 'object') return '';
      for (const [k, v] of Object.entries(node)) {
        if (k.toLowerCase() === key) {
          if (typeof v === 'string' || typeof v === 'number') return String(v);
          if (v && typeof v === 'object' && v.value) return String(v.value);
        }
        const deeper = walk(v);
        if (deeper) return deeper;
      }
      return '';
    })(obj);
    if (hit) return hit;
  }
  return '';
}

// Save every base64 PDF found in a response (labels, declaration).
function savePdfs(responseText, prefix) {
  const saved = [];
  const runs = [...new Set(responseText.match(/[A-Za-z0-9+/]{200,}={0,2}/g) || [])];
  runs.forEach((b64, i) => {
    const bytes = Buffer.from(b64, 'base64');
    if (bytes.slice(0, 4).toString() !== '%PDF') return;      // PDF magic bytes
    const file = `${prefix}-${i + 1}.pdf`;
    fs.writeFileSync(file, bytes);
    saved.push(file);
  });
  return saved;
}

// ---- Dangerous Goods Declaration ---------------------------------------------
// documentCriteria takes ONLY shipmentPIN + documentType[]; any other field is
// rejected with 9001-276. The document comes back in the format fixed when the
// shipment was created, so a ZPL shipment cannot return a PDF declaration.
async function fetchDeclaration(pin) {
  return post(DOCUMENTS_PATH, {
    lineOfBusiness: 'COURIER',
    requestReference: crypto.randomUUID(),
    documentCriteria: [{ shipmentPIN: pin, documentType: ['DangerousGoodsDeclaration'] }],
  });
}

// ---- Main --------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const validateOnly = args.includes('--validate');
  const scenario = args.find(a => !a.startsWith('--')) || 'un3373-air';
  if (!SCENARIOS[scenario]) {
    console.error(`Unknown scenario "${scenario}". Choose one of: ${Object.keys(SCENARIOS).join(', ')}`);
    process.exit(1);
  }
  const reference = `DG-${Date.now()}`;

  // 1. Create (or validate) the shipment.
  const { res, text } = await post(CREATE_SHIPMENT_PATH, buildBody(scenario, reference, validateOnly));
  fs.writeFileSync(`response-${reference}.json`, text); // keep the raw response for support
  if (!res.ok) {
    // 9001-xxx codes are endpoint-scoped: read these as /ship errors.
    console.error(`HTTP ${res.status}\n${text}`);
    process.exit(1);
  }
  if (validateOnly) {
    console.log(`Validated ${scenario} (${BASE_URL}). HTTP ${res.status}. Nothing was created.`);
    return;
  }

  const pin = findPin(JSON.parse(text));
  const labels = savePdfs(text, `${reference}-label`);
  console.log(`Shipment created: ${scenario} on ${ENV}. PIN ${pin || '(not found - see response file)'}`);
  console.log(`Labels saved: ${labels.length ? labels.join(', ') : 'none found'}`);

  // 2. Fetch the Dangerous Goods Declaration for the new PIN.
  if (pin) {
    const doc = await fetchDeclaration(pin);
    fs.writeFileSync(`response-${reference}-declaration.json`, doc.text);
    if (doc.res.ok) {
      const docs = savePdfs(doc.text, `${reference}-dg-declaration`);
      console.log(`Declaration saved: ${docs.length ? docs.join(', ') : 'response had no PDF - see response file'}`);
    } else {
      console.error(`Declaration request failed: HTTP ${doc.res.status}\n${doc.text}`);
    }
  }
  console.log(`Full responses: response-${reference}*.json`);
}

main().catch(err => { console.error(err); process.exit(1); });
