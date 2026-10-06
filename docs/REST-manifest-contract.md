# Manifest and summary manifest — the measured contract

Closes certification plan item CN-05 (Test Manifest Report). Measured
2026-09-17 in Certification staging. Probe: `tooling/probe_manifest.py`.

> **Update 2026-10-06.** The Purolator REST STG collection and the Ship OAS give the
> summary manifest as `POST /ship/v1/documents/summary-manifest`
> `{lineOfBusiness, manifestDate: [date], requestReference}`, and `/ship/v1/artifacts`
> answered 403 in the 2026-09-28 sample run. The MANIFEST requests now use the
> summary-manifest route. The 2026-09-17 measurement below is kept as history; re-measure
> both routes before relying on either.

## There is no `/ship/v1/documents/summary-manifest` route

It returns `403`. So does `/ship/v1/documents/this-route-does-not-exist`, and
so do `/ship/v1/void`, `/ship/v1/tracking`, `/ship/v1/pickup` and
`/ship/v1/consolidation`.

**On this gateway a 403 means "no such route", not "not authorised".** The
body is an AWS `Invalid key=value pair (missing equal-sign) in Authorization
header` message, which looks like an auth failure and is not one — the same
token returns `200` on the real routes in the same minute. Probing a route by
its status code alone will read every wrong path as a permissions problem.

A bogus sibling path is the control worth sending before concluding anything
about a 403 here.

## The two routes that exist

| Route | Purpose | Body |
|---|---|---|
| `/ship/v1/manifest` | close the manifest (consolidate) | `{language, requestReference, lineOfBusiness, accountNumber}` |
| `/ship/v1/artifacts` | retrieve the summary manifest document | `{lineOfBusiness, manifestDate: [date]}` |

`manifestDate` is an **array**. The close returns no document:

```json
{"language": "en", "requestReference": "MANIFEST", "shipmentsConsolidated": "true"}
```

## The manifest date window is a rolling 10 days

An out-of-range date returns `9001-319` and the message states the window
explicitly:

```
Invalid Manifest Date. Date must be between Monday, September 07, 2026
and Thursday, September 17, 2026.
```

This is why the converted test aid never worked: it carries `2010-04-10` from
the SOAP sample, which can never be in range. **The manifest requests need a
computed date, not a literal.** That is a suite fix, not an API defect.

## Today's manifest is not available today

For 2026-09-17, immediately after a successful close, the document call
returns:

```
9001-316  No summary manifest found for the requested date(s).
```

For 2026-09-16 it returns 33 manifest batches. The `manifestCloseDateTime`
values show why: batches close through the day and the day's summary is
produced by an overnight run (`2026-09-17 12:01:24 AM` for the 16th).

**So a same-day manifest test will always look broken.** Test CN-05 against the
previous business day, or it reports a defect that is not there.

## The document arrives as a URL, not as base64

`manifestBatchDetail[].url` is a signed CloudFront URL, not a base64 payload:

```
https://shipdocs-stg02.purolator.com/files/<uuid>.pdf?response-content-disposition=inline…&Key-Pair-Id=…
```

563 characters. Base64-decoding it yields 113 bytes of noise — which is what a
generic "find the long string and decode it" reader does with it, and it looks
exactly like a corrupt document. The field name is the tell: `url`, not `data`.
Elsewhere in the API (`/ship/v1/documents`) the same concept arrives as `data`
and IS base64. Both shapes exist; read the key.

Each batch carries two entries, both `documentType: "SummaryManifest"`:

| description | format |
|---|---|
| `Summary Manifest` | PDF |
| `Summary Manifest - Thermal` | also a `.pdf` URL |

The Thermal variant being served as a PDF is worth a question to Purolator —
everywhere else in this API, Thermal means ZPL or DPL.

## PDF generation works in Certification

Fetching the URL returns `200`, `application/pdf`, 2960 bytes, magic bytes
`%PDF-1.4`, and it renders as a correct one-page summary manifest: Purolator
header, shipper block, a Code 128 barcode, manifest number
`B9999000000000092870`, manifest date `09/16/2026`, 9 shipments, 9 pieces.

Three PDF types were generated and opened on 2026-09-17 in Certification:

| Document | Route | Bytes | Verified |
|---|---|---|---|
| SummaryManifest | `/ship/v1/artifacts` → URL | 2,960 | rendered, correct |
| CustomsInvoice | `/ship/v1/documents` | 9,107 | rendered, all 20 HS lines |
| InternationalBillOfLading | `/ship/v1/documents` | 15,476 | rendered |

If a PDF appears not to generate, the two measured causes above are the first
things to rule out: a same-day manifest date (`9001-316`), and treating the
`url` field as base64.

## Suite changes this implies

1. The three `/ship/v1/artifacts` requests need a computed `manifestDate`
   inside the rolling 10-day window, defaulting to the previous business day.
2. The runner's document capture must branch on `url` vs `data` — a `url`
   needs a second fetch, and the fetch is what proves the document exists.
3. CN-05 can be marked covered once those two are in.
