// =============================================================================
// rest-ship-with-return.js
//
// Purolator REST - create an outbound shipment, its return shipment and the
// label, all in ONE call to the create-shipment endpoint.
//
// How the return works (from Purolator's official sample):
//   * returnShipment{}   is a second shipment block sent alongside outboundShipment
//   * serviceId          must be a *Return service (PurolatorExpressReturn).
//                        A normal service id here is rejected (9001-48).
//   * returnsManagement  stays false - that flag is a different feature
//                        (the Returns Management program with an RMA number).
//   * returnRates        true also returns the rates for the return leg.
//
// Return-leg rules (REST error catalogue):
//   * single piece only                                    (9001-137)
//   * sender AND receiver must both be in Canada           (9001-135 / 9001-136)
//   * no QuickShip service ids                             (9001-134)
//   * no SaturdayDelivery/Pickup, ChainOfSignature,
//     DangerousGoods or AdultSignatureRequired set to true (9001-140 to 9001-144)
//
// Every name, address and phone below is sample data and is safe to share.
// Replace it with your own before going live.
//
// Requires Node.js 18+ (built-in fetch). No npm packages needed.
//
// Windows (PowerShell) usage:
//   $env:PUROLATOR_BASE_URL  = "<base URL for your environment>"
//   $env:PUROLATOR_X_API_KEY = "<your x-api-key>"
//   $env:PUROLATOR_TOKEN     = "<your bearer token>"
//   $env:PUROLATOR_ACCOUNT   = "<your billing account number>"
//   node rest-ship-with-return.js
//
// Credentials come from environment variables so they never sit in the code.
// =============================================================================

const fs = require('fs');
const crypto = require('crypto');

// ---- Settings read from the environment -------------------------------------
const BASE_URL = process.env.PUROLATOR_BASE_URL;
const API_KEY  = process.env.PUROLATOR_X_API_KEY;
const TOKEN    = process.env.PUROLATOR_TOKEN;
const ACCOUNT  = process.env.PUROLATOR_ACCOUNT;

// Fail early with a clear message instead of a vague 401/403 from the gateway.
for (const [name, value] of Object.entries({
  PUROLATOR_BASE_URL: BASE_URL, PUROLATOR_X_API_KEY: API_KEY,
  PUROLATOR_TOKEN: TOKEN, PUROLATOR_ACCOUNT: ACCOUNT,
})) {
  if (!value) { console.error(`Missing environment variable: ${name}`); process.exit(1); }
}

const CREATE_SHIPMENT_PATH = '/ship/v1/shipment';

// ---- Sample parties (fictional, shareable) ----------------------------------
// The goods go from SENDER to the CLIENT. The return runs the other way:
// the client becomes the return sender and your warehouse the return receiver.
const SENDER = {
  attentionTo: 'Sample Shipper',
  companyName: 'Sample Shipper Inc.',
  streetAddress: ['100 Sample Street'],
  city: 'Mississauga', provinceStateCode: 'ON', country: 'CA',
  postalZipCode: 'L5N5N1', phoneNumber: '5555550100',
};
const CLIENT = {
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
// One body = outbound shipment + return shipment + label.
function buildBody(reference) {
  const payment = {
    paymentType: 'Sender',
    registeredAccountNumber: ACCOUNT,
    billingAccountNumber: ACCOUNT,
  };
  // "_" is rejected in references, so normalise it.
  const ref = String(reference).replace(/_/g, '-');

  return {
    lineOfBusiness: 'COURIER',
    shipmentDate: shipDate(),
    validateOnly: false,      // set true to validate without creating anything
    returnsManagement: false, // not the RMA program - the return is the block below
    returnRates: true,        // include the return-leg rates in the response

    // Label for the outbound shipment, requested in the same call.
    shipmentDocuments: {
      label: { outputType: 'PDF', printerFormat: 'Laser', responseType: 'URL' },
    },

    // ---- Outbound: sender -> client ----
    outboundShipment: {
      pickupType: 'DROPOFF',
      paymentInformation: payment,
      senderInformation: SENDER,
      receiverInformation: CLIENT,
      shipmentInformation: {
        serviceId: 'PurolatorExpress',
        unitOfMeasurement: 'IMPERIAL',
        descriptionOfGoods: 'Electronic Equipment',
        totalWeight: 12.21,
        totalPackages: 1,
        dangerousGoodsDeclarationDocumentIndicator: false,
        shipmentOptionsInformation: [],
        packageInformation: [
          { packageWeight: 12.21, packageLength: 12, packageWidth: 12, packageHeight: 12 },
        ],
      },
      customerReferenceInformation: { shipmentReference1: ref, notes: 'Outbound' },
    },

    // ---- Return: client -> sender (the flip of the outbound) ----
    returnShipment: {
      numberOfReturnShipments: 1,
      pickupType: 'DROPOFF',
      paymentInformation: payment,
      senderInformation: CLIENT,
      receiverInformation: SENDER,
      shipmentInformation: {
        serviceId: 'PurolatorExpressReturn', // must be a *Return service id
        unitOfMeasurement: 'IMPERIAL',
        descriptionOfGoods: 'Electronic Equipment',
        totalWeight: 12.21,
        totalPackages: 1,                    // returns are single piece only
        dangerousGoodsDeclarationDocumentIndicator: false,
        shipmentOptionsInformation: [],      // leave empty unless you need a permitted option
        packageInformation: [
          { packageWeight: 12.21, packageLength: 12, packageWidth: 12, packageHeight: 12 },
        ],
      },
      customerReferenceInformation: { shipmentReference1: `${ref}-RETURN`, notes: 'Return' },
    },
  };
}

// ---- Label extraction --------------------------------------------------------
// With responseType URL the label comes back as a link, with BASE64 as an
// encoded string. To avoid depending on one field path, scan the whole response
// for either, so the script survives a change in output type.
async function saveLabels(responseText, prefix) {
  const saved = [];

  // URLs (responseType: URL). Download each link that looks like a document.
  const urls = [...new Set(responseText.match(/https?:\/\/[^"\s\\]+/g) || [])];
  for (const [i, url] of urls.entries()) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const bytes = Buffer.from(await r.arrayBuffer());
      if (bytes.slice(0, 4).toString() !== '%PDF') continue; // keep PDFs only
      const file = `${prefix}-label-${i + 1}.pdf`;
      fs.writeFileSync(file, bytes);
      saved.push(file);
    } catch (e) { /* not a label link - skip */ }
  }

  // Base64 (responseType: BASE64). Sniff what each long run decodes to.
  const runs = [...new Set(responseText.match(/[A-Za-z0-9+/]{200,}={0,2}/g) || [])];
  runs.forEach((b64, i) => {
    const bytes = Buffer.from(b64, 'base64');
    let ext = null;
    if (bytes.slice(0, 4).toString() === '%PDF') ext = 'pdf';
    else if (bytes.slice(1, 4).toString() === 'PNG') ext = 'png';
    else if (bytes.toString('utf8').trim().startsWith('^XA')) ext = 'zpl';
    if (!ext) return;
    const file = `${prefix}-label-b64-${i + 1}.${ext}`;
    fs.writeFileSync(file, bytes);
    saved.push(file);
  });

  return saved;
}

// ---- Main --------------------------------------------------------------------
async function main() {
  const reference = process.argv[2] || `SHIP-${Date.now()}`; // optional: node rest-ship-with-return.js ORDER-1001

  const res = await fetch(BASE_URL + CREATE_SHIPMENT_PATH, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'Authorization': `Bearer ${TOKEN}`,
      'RequestReference': crypto.randomUUID(), // 36 characters
      'Language': 'en',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildBody(reference)),
  });

  const text = await res.text();
  fs.writeFileSync(`response-${reference}.json`, text); // keep the raw response for support

  if (!res.ok) {
    // 9001-xxx codes are endpoint-scoped: read them as /ship errors.
    console.error(`HTTP ${res.status}\n${text}`);
    process.exit(1);
  }

  const labels = await saveLabels(text, reference);
  console.log(`Shipment and return created for ${reference}. HTTP ${res.status}`);
  console.log(`Labels saved: ${labels.length ? labels.join(', ') : 'none found - check the response file'}`);
  console.log(`Full response: response-${reference}.json`);
}

main().catch(err => { console.error(err); process.exit(1); });
