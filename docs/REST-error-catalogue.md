# REST error catalogue

Every error code the EWS REST gateway has actually returned to us, with what
provokes it and whose side it sits on.

Two tiers, because they have different evidence behind them:

- **Tier 1 — captured runs.** Extracted mechanically from the saved
  request/response pairs under `build/<run>/capture/` by
  `tooling/error_catalogue.py`. 33 distinct codes across 371 error occurrences
  in 659 captured responses. Regenerate with:
  `python tooling\error_catalogue.py`
- **Tier 2 — probe-discovered.** Observed while probing contracts directly
  (the `tooling/probe_*.py` scripts). Their raw responses were not written into
  a capture directory, so they are recorded here from the contract docs they
  produced.

Capture runs scanned: `cert-rest`, `cert-products`, `cert-documents`,
`cert-payment`, `cert-consolidation` (both accounts).

> Caveat on counts: `cert-rest`, `cert-documents`, `cert-products` and
> `cert-payment` all ran before commit `38594c4` restored the `pad()` helper, so
> every pre-request script in those runs threw and `RequestReference` was stale.
> The error codes below are genuine gateway responses, but the occurrence counts
> are from those runs and will move when the four suites are re-run.

## Tier 1 — codes seen in captured traffic

| Code | Hits | Endpoint(s) | What it says | Whose side |
|---|---|---|---|---|
| 9001-275 | 79 | `/rate/v1/shipment` | `'<field>' is an unknown field` — `phoneNumber`, `descriptionOfGoods`, `pickupType`, `dangerousGoodsDeclarationDocumentIndicator` | Ours — the 26 Estimate requests post a `/ship` body at `/rate` (PRB-02) |
| 9001-99 | 68 | `/ship/v1/shipment` | `'<serviceId>' is invalid` — id is real but not offered on that lane | Carrier's answer, not a defect |
| 9001-323 | 32 | `/ship/v1/shipment` | `Subscriptions name is a mandatory field` | Ours — notification block sent without a subscription name |
| 9001-312 | 25 | `/ship/v1/documents` | `Unsupport Document Type` | API — includes `CustomsInvoiceThermal`, which never produces |
| 9001-48 | 20 | `/ship/v1/shipment` | Return leg needs a `*Return` service id | Ours — fixture used the outbound id on the return |
| 9001-133 | 16 | `/ship/v1/shipment` | `Invalid characters found in ... shipmentReference1-4` | API — allow-list accepts `ä`/`ü`, rejects `ö` |
| 9001-310 | 15 | `/ship/v1/documents` | `No documents found` | Mixed — real for docs the shipment never produced |
| 9001-321 | 14 | `/ship/v1/shipment` | `Express Cheque Shipments/Functionality NOT available currently` | Carrier — feature switched off in Certification |
| 9001-306 | 10 | `/ship/v1/documents` | `PIN <n> is invalid` | Ours — hard-coded/stale PINs in document fixtures |
| 9001-50 | 10 | `/rate/v1/shipment`, `/pickup/v1/modify` | `Service id is a mandatory field`; on pickup, `Until time must be greater than HH:mm` | Ours |
| 9001-86 | 9 | `/pickup/v1/schedule` | `Mode of transport for shipment summary is required` (`Air`, `Ground`, `Air/Ground`) | Ours |
| 9001-51 | 8 | `/ship/v1/shipment` | `Invalid service id: '<id>'` — id not recognised at all | Split — 20 published catalogue spellings the gateway rejects (PRB-03) |
| 9001-305 | 6 | `/ship/v1/documents` | `PIN number is required` | Ours — negative case |
| 9001-311 | 6 | `/ship/v1/documents` | `Invalid DocumentType Code: FCC740` | Expected — FCC740 is decommissioned |
| 9001-55 | 6 | `/pickup/v1/*` | `Invalid pickup location` (enum in the message) | Ours |
| 9001-65 | 6 | `/pickup/v1/modify`, `/pickup/v1/void` | `Invalid pickup confirmation number` | Ours — negative case |
| 9001-05 | 4 | `/ship/v1/shipment` | `'Package information' is required for outbound shipment` | Ours — negative case |
| 9001-104 | 4 | `/ship/v1/shipment` | Saturday Delivery must be Purolator Express **and** created on a Friday | API rule — test is day-of-week dependent |
| 9001-153 | 4 | `/ship/v1/shipment` | `ChainOfSignature is not valid for this shipment` | Open — re-check now the account fan-out tests two accounts |
| 9001-171 | 4 | `/ship/v1/shipment` | `Dangerous Goods Mode must be Air for this shipment` | Ours |
| 9001-20 | 4 | `/track/v1/shipment`, `/pickup/v1/schedule` | `Tracking ID is mandatory in Tracking Request` | Ours — negative case |
| 9001-22 | 4 | `/pickup/v1/*` | `Invalid destination code` (`DOM`, `INTL`, `USA`) | Ours |
| 9001-19 | 3 | `/track/v1/shipment` | `Error occurred during processing. Please refer to the logs` | **API — opaque 400, no cause given** |
| HTTP 403 | 3 | `/locator/v1/address` | `Invalid key=value pair (missing equal-sign) in Authorization header` | **Gateway — rejects our bearer header on this route only** |
| 9001-58 | 2 | `/pickup/v1/schedule` | `Invalid supply request codes` (enum in the message) | Ours |
| 9001-68 | 2 | `/rate/v1/shipment` | `Invalid shipment option code: 'ExpressChequeAmount' / 'ExpressChequeMethodOfPayment'` | API — the Express Cheque sub-options are not in the `/rate` option enum |
| 9001-08 | 1 | `/ship/v1/manifest` | `Manifest item has already been closed or is in the manifesting phase` | API — stateful; fires on repeated same-hour consolidation runs |
| 9001-11 | 1 | `/pickup/v1/schedule` | `Contact name is a mandatory field` | Ours — negative case |
| 9001-16 | 1 | `/pickup/v1/schedule` | Phone number required, format `14031234567` | Ours — negative case |
| 9001-28 | 1 | `/pickup/v1/schedule` | `Address for Pickup is required` | Ours — negative case |
| 9001-319 | 1 | `/ship/v1/artifacts` | `Invalid Manifest Date. Date must be between <d> and <d>` | API — rolling 10-day window (PRB-04) |
| 9001-63 | 1 | `/pickup/v1/void` | Confirmation number must be 8-9 characters | Ours — negative case |
| 9001-64 | 1 | `/pickup/v1/void` | `Pickup not found` | Ours — negative case |

Both official languages are returned for most codes; the French text is the same
error, so `Sortant:` / `Retour:` rows are not counted separately above.

## Tier 2 — codes found while probing contracts

| Code | Endpoint | What provokes it |
|---|---|---|
| 9001-201 | `/ship/v1/shipment` | `textileIndicator: true` on a non-US lane — it is a lane property, not a goods property |
| 9001-202 | `/ship/v1/shipment` | `textileIndicator: true` without `textileManufacturer` on the content line |
| 9001-196 | `/ship/v1/shipment` | `usmcaDocumentIndicator: true` outside CA/MX/US |
| 9001-194 | `/ship/v1/shipment` | `contentDetails[].unitOfMeasure` outside the **packaging-unit** enum (not Imperial/Metric) |
| 9001-246 | `/ship/v1/shipment` | Mandatory content field missing — wording blames the wrong level |
| 9001-279 | `/ship/v1/shipment` | `nonDocumentsInformation.taxesPaid` missing (`DDU` / `DDP`) |
| 9001-288 | `/ship/v1/shipment` | `contentDetails[].productCode` missing |
| 9001-290 | `/ship/v1/shipment` | U.S.-bound service paused by Purolator since Sept 25 2025 |
| 9001-64 | `/ship/v1/shipment` | Piece count wrong for the packaging — fires **before** service validity is judged |
| 9001-276 | `/ship/v1/shipment` | `'<field>' is an unknown field` (the `/ship` twin of 9001-275) |
| 9001-219 | `/ship/v1/documents` | `outputType` outside `PDF`, `ZPL`, `DPL`, `PNG`, `CODE128` |
| 9001-220 | `/ship/v1/documents` | `printerFormat` outside `Thermal` / `Laser` |
| 9001-248 | `/ship/v1/documents` | `documentType` sent as a string instead of an array |
| 9001-301 | `/ship/v1/documents` | `lineOfBusiness` / `requestReference` missing |
| 9001-316 | `/ship/v1/manifest` | No summary manifest for the requested date — including same-day |
| 9001-24 | `/ship/v1/shipment` | Receiver `city` over 40 characters |
| 9001-47 | `/ship/v1/shipment` | Receiver `attentionTo` over 40 characters |

## SOAP

No SOAP errors are catalogued because **no SOAP run has ever been captured**.
`runs/cert-soap.yaml` has `capture.enabled: true`, but `build/cert-soap`,
`build/dev-soap`, `build/prod-soap` and `build/soap-domestic-smoke` contain only
a compiled `collection.json` and `environment.json` — no `capture/` directory, no
`report.json`, no response bodies. The certification RTM confirms it: all 888
rows are REST endpoints, none are `.asmx`.

Run a SOAP suite with credentials and this catalogue's SOAP half fills itself —
`tooling/error_catalogue.py` already parses `<Error><Code>/<Description>` and
`<faultcode>/<faultstring>`.
