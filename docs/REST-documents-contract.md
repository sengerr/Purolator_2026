# `/ship/v1/documents` — the real contract

Established against Certification by probe, September 2026. Every statement here
is something the API said, not something inferred from the published spec — the
two disagree in several places, noted below.

## The short version

**`/ship/v1/documents` has no format controls.** `documentCriteria` accepts
exactly two fields:

```json
{
    "lineOfBusiness": "COURIER",
    "requestReference": "…",
    "documentCriteria": [
        { "shipmentPIN": "720133742943", "documentType": ["CustomsInvoice"] }
    ]
}
```

Everything else is rejected with `9001-276 '<field>' is an unknown field` —
confirmed for `outputType`, `outputFormat`, `documentFormat`, `format`,
`printerType`, `printerFormat`, `responseType`, `responseFormat`, `returnType`,
`outputMedia`, `mediaType`, `documentOutputType`, `language`, `copies`.

`documentType` must be an **array** (`9001-248` otherwise), so must
`documentCriteria`, and `lineOfBusiness` is mandatory (`9001-301`).

## Format is chosen when the shipment is created

The format dimension lives on `/ship/v1/shipment`, under
`shipmentDocuments.label` — which is the only key `shipmentDocuments` accepts.
(`billOfLading`, `customsInvoice`, `document`, `documents`, `invoice`, `qrCode`
are all `9001-276`.) There is no per-document format override.

```json
"shipmentDocuments": { "label": {
    "outputType": "PDF", "printerFormat": "Laser", "responseType": "BASE64" } }
```

| field | valid values | source |
|---|---|---|
| `outputType` | `PDF`, `ZPL`, `DPL`, `PNG`, `CODE128` | `9001-219` |
| `printerFormat` | `Thermal`, `Laser` | `9001-220` |
| `responseType` | `BASE64`, `URL`, `STRING` | — |

### The format pairings

`outputType` and `printerFormat` are not independent in practice. ZPL and DPL
are Thermal; PDF is Laser. Which document type you can retrieve afterwards
follows from that, and the `…Thermal` suffix **is** the selector:

| created as | plain name | `…Thermal` name |
|---|---|---|
| ZPL or DPL / Thermal | `9001-312` | document returned |
| PDF / Laser | document returned | `9001-312` |

`validateOnly: true` accepts every pairing, so the constraint only shows up at
retrieval. That is by design, not a defect.

### `responseType` carries through to retrieval

| created with | `/ship/v1/documents` returns |
|---|---|
| `BASE64` | `data` — base64 of the document |
| `URL` | `url` — a link to `shipdocs-stg02.purolator.com/files/…` |
| `STRING` | `url` — **identical to URL** |

`STRING` silently behaving as `URL` is a defect candidate: either it is
unsupported and should be rejected at creation, or it should return the document
inline.

## Valid `documentType` values

Published by the API in `9001-311`:

```
CustomsInvoice, CustomsInvoiceThermal, DangerousGoodsDeclaration,
DomesticBillOfLading, DomesticBillOfLadingThermal, ExpressChequeReceipt,
ExpressChequeReceiptThermal, FDA2877, InternationalBillOfLading,
InternationalBillOfLadingThermal, QRCode, USMCA
```

Twelve values. Against the certification checklist:

- **`COSBillOfLading` is not valid** — `9001-311`. It is on the checklist.
- **`FCC740` has been REMOVED from the product.** It returns `9001-311`, and
  that rejection is correct — the certification checklist is the thing that is
  out of date. Its requests have been deleted from the matrix rather than kept
  as negative assertions, and it is not raised as a defect. (The SOAP contract
  still carries `FCCDocumentIndicator`; that is a checklist and documentation
  cleanup, not an API bug.)
- **`QRCode` is valid and is not on the checklist.** It is the Code 128 document,
  matching the `CODE128` outputType.

## What a document type actually needs

A document type is not produced just because it is valid. Three separate things
gate it, and they fail with three different codes:

| gate | symptom |
|---|---|
| wrong label format | `9001-312 Unsupport Document Type` |
| right format, nothing to describe | `9001-310 No documents found` |
| type not in the enum | `9001-311` |

### Cross-border documents need commercial goods

The cross-border seeds shipped `documentsOnlyIndicator: true`. A documents-only
shipment carries no goods, so customs paperwork has nothing to describe —
`CustomsInvoice` returned `9001-312` and `USMCA` `9001-310` even with every
document indicator already set to true. Turning the flag off makes two more
fields mandatory:

- `crossBorderInformation.nonDocumentsInformation.taxesPaid` — `DDU` or `DDP`
  (`9001-279`)
- `crossBorderInformation.contentDetails[].unitOfMeasure` — a **packaging**
  unit, not Imperial/Metric: `Bag, Barrel, Bolt, Box, Bunch, Bundle, Butt,
  Canister, Carton, Case, Centimetre, Container, Crate, Cylinder, Dozen, Each,
  Envelope, Feet, Kilograms, Litre, Metre, Package, Packet, Pairs, Pallet,
  Pieces, Pounds, Proof litres, Roll, Set, Square metres, Square yards, Tube,
  Yard` (`9001-194`). The mandatory-field error is `9001-246`, whose wording
  ("Cross border Unit of measure") points at the wrong level — the field is on
  each content detail, not on `crossBorderInformation`.

With those set, `CustomsInvoice`, `USMCA` and `InternationalBillOfLading` all
return documents.

`usmcaDocumentIndicator` must be **false** outside Canada/Mexico/USA — once the
shipment carries goods, a non-USMCA destination is refused with `9001-196`.

### DangerousGoodsDeclaration is Laser-only

The DG seed produced a Thermal label, so every request returned `9001-312`.
Recreated as PDF / Laser it returns an 18 KB PDF. `DangerousGoodsMode` must also
be `Ground`, not `Air`, on `PurolatorExpress` (`9001-171`).

### Chain of Signature is an account entitlement

`9001-153 "Outbound: ChainOfSignature is not valid for this shipment"` is
misleading — it is not about the shipment. Same body, same service, same lane:

| account | result |
|---|---|
| `AccountNumber` | `9001-153` |
| `Different_AccountNumber` ({{Freight_account}}) | 200, shipment created |

Confirmed service-independent across `PurolatorExpress`, `PurolatorExpress9AM`,
`PurolatorGround` and `PurolatorExpressPack`, and the same body without the
option succeeds on the unentitled account. The message should name the account.

## Environmental blocks in Certification

- **`9001-290`** — since Sept 25 2025 Purolator has paused U.S.-bound
  FDA-regulated shipments. A shipment with `fdaDocumentIndicator: true` cannot
  be created at all, so **FDA2877 is untestable** until that lifts. Not a defect.
- **`9001-321`** — Express Cheque is disabled across Certification, so
  `ExpressChequeReceipt` and its Thermal twin have no PIN to read.

## Open: CustomsInvoiceThermal

`CustomsInvoice` returns a document from a PDF / Laser shipment, but
`CustomsInvoiceThermal` returns `9001-312` from ZPL **and** DPL Thermal
shipments on both the U.S. and international lanes, with the same
`customsInvoiceDocumentIndicator: true` that makes the Laser one work. Every
other `…Thermal` type behaves correctly. This looks like a genuine gap rather
than a configuration mistake.

## The response returns documents you did not request

Asking for one `documentType` does not get you one document. A request for
`CustomsInvoice` alone on a southbound goods shipment returns two:

```
shipmentDocuments[0].documents[0].documentType = "InternationalBillOfLading"
shipmentDocuments[0].documents[1].documentType = "CustomsInvoice"
```

The requested type is **not** first. Any consumer that reads "the first
document", or scans the response for the first long base64 string, gets the
bill of lading while believing it holds the invoice — both are Laser PDFs, so
nothing about the bytes gives it away. Always select on `documentType`.

This bit a probe in this repo before it was caught: a bill of lading was
written to disk under the invoice's filename and reported as the invoice. It
surfaced only because the file was then opened and its content counted. Sniffing
the magic bytes would not have caught it either — the format was right and the
document was wrong.

## A trap worth knowing

A hand-built HTTP client gets a bare `500 {"message": null}` from the gateway on
`/ship/v1/documents`, while curl and Newman reach validation and get a real
error. Probe with curl, not with a minimal client, or you will chase a phantom.
