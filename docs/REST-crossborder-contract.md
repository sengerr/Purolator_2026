# Cross-border `/ship` — the measured contract

Everything here came back from the gateway in Certification staging on
2026-09-17. Where a rule is stated, an error code is given, because the error
code is the evidence. Nothing in this file is inferred from the WSDL or from
the REST documentation.

Probes: `tooling/probe_us_hs.py`, `tooling/probe_textile_mfr.py`,
`tooling/probe_invoice_totals.py`, `tooling/probe_intl_matrix.py`,
`tooling/probe_crossborder.py`, `tooling/probe_customs.py`.

## The dependency chain on a goods shipment

`crossBorderInformation.documentsOnlyIndicator: false` is the branch that turns
a shipment into a commercial one, and it pulls in four mandatory things that
are not mandatory anywhere else. Each was found by being rejected for it:

| Required | Where | Error when missing |
|---|---|---|
| `nonDocumentsInformation.taxesPaid` — `DDU` or `DDP` | cross-border block | `9001-279` |
| `contentDetails[].unitOfMeasure` | each content line | `9001-194` |
| `contentDetails[].productCode` | each content line | `9001-288` |
| `contentDetails[].textileManufacturer` — only when `textileIndicator: true` | each content line | `9001-202` |

Two of those errors point somewhere other than the problem:

- `9001-194` rejects `unitOfMeasure` against the **packaging-unit enum** (34
  values — `Each`, `Box`, `Case`, …). It is not `Imperial`/`Metric`, which is
  `shipmentInformation.unitOfMeasurement`, a different field with a similar
  name. `Each` is the safe value for piece goods.
- `9001-246` ("mandatory field") fires at the wrong level entirely — it blames
  the cross-border block when the missing field is on a content line.

## `textileManufacturer` — and why a typo looks like a missing value

`textileIndicator: true` makes `textileManufacturer` mandatory (`9001-202`,
which names the field in prose and not by path). The accepted spelling was
established by trying six candidates against the same shipment:

| Field tried | Result |
|---|---|
| `textileManufacturer` | **accepted** — PIN returned |
| `textileManufacturerName` | `9001-202` still fires |
| `manufacturerName` | `9001-202` still fires |
| `manufacturer` | `9001-202` still fires |
| `textileManufacturerInformation` | `9001-202` still fires |
| `producerName` | `9001-202` still fires |

The five wrong names were **silently ignored**. No `9001-276` unknown-property
error came back, unlike at the shipment level where an unknown property is
rejected outright. So inside `contentDetails`, a misspelled field name is
indistinguishable from a missing value: you get `9001-202` either way. Check
spelling before assuming the value is at fault.

Setting `textileIndicator: false` on the same knitted-apparel HS code creates
the shipment with no manufacturer at all — which is what the team's
`Us internationational - Importing included.txt` sample does, by omitting the
flag. That is why the sample never hit `9001-202`.

## USMCA is bloc-scoped

`usmcaDocumentIndicator: true` outside CA/MX/US is `9001-196`. It has to be
`false` on the IL/ES/DE lanes and can be `true` southbound. This is per content
line, not per shipment.

## `/rate` cannot express a cross-border shipment at all

`tooling/probe_rate_schema.py` built a `/rate/v1/shipment` body up from minimal
rather than peeling fields off a `/ship` body, and the result is that the two
endpoints diverge in **both** directions:

| Field | `/rate` | `/ship` |
|---|---|---|
| `billingInformation` | yes | no |
| `showAlternativeServicesIndicator` | yes | no |
| `paymentInformation` | no | yes |
| `pickupType` | no | yes |
| `attentionTo`, `phoneNumber` | no | yes |
| `descriptionOfGoods` | no | yes |
| **`crossBorderInformation`** | **no** | yes |
| `customerReferenceInformation` | no | yes |
| `shipmentDocuments`, `validateOnly` | no | yes |

`/rate` has nowhere to put customs data. An international rate cannot be
requested through it, and the 26 requests in the Estimate folder are built on
the `/ship` schema, which is why every one of them fails. They need rewriting
against the `/rate` shape, not patching.

## The document call needs more than `documentCriteria`

`POST /ship/v1/documents` rejects a body of `documentCriteria` alone with
`9001-301` "Line of business is mandatory field." The working shape is:

```json
{
  "lineOfBusiness": "COURIER",
  "requestReference": "…",
  "documentCriteria": [
    { "shipmentPIN": "760000009729", "documentType": ["CustomsInvoice"] }
  ]
}
```

A `RequestReference` HTTP header takes precedence over the body's
`requestReference` in the echoed response, so the two disagreeing is not a
defect — the header wins.

### The response returns documents you did not ask for

Asking for `CustomsInvoice` alone returns **two** documents:

```
shipmentDocuments[0].documents[0].documentType = "InternationalBillOfLading"
shipmentDocuments[0].documents[1].documentType = "CustomsInvoice"
```

Any consumer that takes "the first document" or "the first long base64 string"
gets the bill of lading while believing it has the invoice. Select on
`documentType`. This was a real bug in `probe_us_hs.py` before it was caught:
a bill of lading was saved under the invoice's filename, and the only reason it
surfaced is that the saved file was opened and read rather than trusted.

## DEFECT — the customs invoice never computes a total

Reproduced on every shape tried (`tooling/probe_invoice_totals.py`):

| Case | Lines | Expected line total | Expected invoice total | Printed |
|---|---|---|---|---|
| A | 1 × qty 1 @ 100.00 | 100.00 | 100.00 | line blank, **invoice 0.00** |
| B | 1 × qty 3 @ 10.00 | 30.00 | 30.00 | line blank, **invoice 0.00** |
| C | qty 3 @ 10.00 + qty 1 @ 50.00 | 30.00 / 50.00 | 80.00 | lines blank, **invoice 0.00** |
| 20 HS codes | 20 × qty 1 | per line | 680.63 | lines blank, **invoice 0.00** |

`QTY` and `Unit Value` both print correctly. Three columns do not:

1. **`Total Value`** (per line) is blank in every case.
2. **`Total Invoice`** prints `0.00` with currency `CAD` in every case.
3. **`U of M`** is blank, although `unitOfMeasure` is mandatory on input
   (`9001-194`) — required to be supplied, then not rendered.

This is a customs-facing document declaring a 0.00 value for goods it itemises
at up to 680.63 CAD. Raise against Purolator EWS. Evidence PINs:
`760000009737` (A), `760000009745` (B), `760000009752` (C), `760000009729`
(20-line).

The 20 HS lines themselves are fine: all 20 codes, descriptions, quantities,
unit values, USMCA/FDA/Textile flags, country of manufacture and the textile
manufacturer render correctly across a 2-page invoice. The defect is confined
to the computed columns.
