# v2 ShipmentTracking — what the WSDL says

Added to all three SOAP collections from `ShipmentTrackingService.wsdl`.

| | |
|---|---|
| Endpoint | `{{soapBase}}/EWS/v2/ShipmentTracking/ShipmentTrackingService.asmx` |
| SOAPAction | `http://purolator.com/pws/service/v2/TrackingByPinsOrReferences` |
| Namespace | `http://purolator.com/pws/datatypes/v2` |
| Service / binding / port | `ShipmentTrackingService` / `ShipmentTrackingServiceEndpoint` |

`{{soapBase}}` already resolves per collection — `certwebservices`,
`devwebservices`, `webservices` — so one URL serves all three tiers and there is
no per-tier editing.

## The service has exactly one operation

`TrackingByPinsOrReferences` is the whole of v2 ShipmentTracking: one
`wsdl:operation`, one binding, one port. So "all endpoints" is one endpoint.

v1 split the same job three ways, and all three fold into this one call:

| v1 | v2 |
|---|---|
| `TrackPackagesByPin` | `TrackingByPinsOrReferences` with a PIN in `trackingId` |
| `TrackPackagesByReference` | the same call with a reference in `trackingId` |
| `GetDeliveryDetails` | the same call with `pod` set true |

That is what the name is telling you: there is no typed `PIN` element any more,
just a generic `trackingId`, and the caller decides what goes in it.

## Request shape

```
TrackingByPinsOrReferencesRequest
  TrackingSearchCriteria            TrackingDetailCriterion
    searches                        ArrayOfsearch
      search                        1..n
        trackingId                  required
        shipmentDateFrom            optional
        shipmentDateTo              optional
        pod                         optional, boolean
        shipmentView                optional, boolean
        account                     optional
        destinationPostalZipCode    optional
        eventSortOrder              optional
```

`searches` is unbounded, so one call can carry several `trackingId` values —
where v1 needed an array of typed `PIN` elements.

## The eight requests

One per meaningful search shape, so every optional field is exercised by at
least one request:

| Request | Exercises |
|---|---|
| `Single PIN` | the minimum call — `trackingId` alone |
| `Multiple PINs` | `searches` as an unbounded array |
| `Reference` | a reference rather than a PIN in the same element |
| `Proof of delivery` | `pod` |
| `Shipment view` | `shipmentView` |
| `Date range` | `shipmentDateFrom` / `shipmentDateTo` |
| `Account and destination` | `account`, `destinationPostalZipCode` |
| `Event sort order` | `eventSortOrder` |

### They resolve a real trackingId

The v1 tracking requests carry `?` placeholders and cannot run at all. These
have a pre-request script that resolves `trackingId` from, in order: an explicit
environment value, then `PIN`, then `PIN_DomesticBillOfLading`, then
`PIN_DomesticBillOfLadingThermal`. So they work straight after any shipping run
instead of needing a PIN pasted in. `trackingId2` / `trackingId3` feed the
multi-search case and have no fallback, so that one request needs them set to
exercise all three searches.

### Version is a guess, and so is eventSortOrder

Two things the WSDL does not settle:

- **`RequestContext/Version`** — the WSDL does not state what value v2 wants.
  These send `2.0`. If the service rejects it, the error will name the expected
  version and it is a one-line fix.
- **`eventSortOrder`** — a free `xs:string` with no enumeration, so the accepted
  values are unpublished. The request sends `Descending` as the plausible
  reading. The only enumerated type in the whole schema is `Language`
  (`en` / `fr`).

## What has and has not been verified

**Verified offline.** Every one of the 24 generated requests (8 × 3 tiers) was
validated against the v2 schema extracted from the WSDL itself — both the
`RequestContext` header and the request body, with the Postman variables
substituted for concrete values. All 24 are schema-valid and well-formed, the
endpoint and SOAPAction match the WSDL, and `cert-soap` picks up the 8 new
requests (99 → 107).

**Not verified live.** `.env` carries no SOAP credentials — only
`PURO_CERT_REST_XAPIKEY` — so no authenticated v2 call has been made. The SOAP
key and password are supplied per team member, and the SOAP run specs report
`missing secrets` without them.

Probing the route unauthenticated does not help either: `certwebservices`
returns `401` for the v2 path, the v1 path, **and** a deliberately nonsense
path, so it authenticates before routing and a 401 says nothing about whether
the v2 route is deployed in Certification.

So the open question is not the envelope — that is schema-checked — it is
whether Certification serves this route at all, and what `Version` and
`eventSortOrder` it accepts. `tooling/probe_v2_tracking.py` answers all three in
one run as soon as SOAP credentials are available: it sends the minimum call at
Version 2.0 and 2.2, then `pod`, `shipmentView`, and `eventSortOrder` both
ascending and descending, and prints what comes back.
