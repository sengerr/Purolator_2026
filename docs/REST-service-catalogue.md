# Service IDs — the catalogue vs what the API accepts

Measured 2026-09-17 in Certification staging against `/ship/v1/shipment`, as
real shipments. Probes: `tooling/probe_service_catalogue.py` (64 ids routed by
family, 96 calls) and `tooling/probe_service_spellings.py` (alternative
spellings of the questionable ones).

## The naming rule

The API names every service by one uniform rule:

```
PurolatorExpress + [packaging] + [lane] + [time]
```

Packaging (`Envelope`, `Pack`, `Box`) comes directly after `PurolatorExpress`.
The lane (`U.S.`, `International`, or nothing for domestic) comes next. The
time commitment comes last, as `9AM`, `10:30AM`, `12PM` or `Evening`.

Noon is **`12PM`** everywhere. It is never `12:00`.

## Two rejection codes that do not mean the same thing

| Code | Text | Meaning |
|---|---|---|
| `9001-51` | `Outbound: Invalid service id: 'X'` | the id is **not recognised** — the request is wrong |
| `9001-99` | `Outbound: 'X' is invalid.` | the id is **real**, but is not offered on this lane |
| `9001-48` | `Return: Invalid service id: 'X'` | rejected as a *return* id — needs the returns body |

Only `9001-99` is a business answer about service availability. Treating
`9001-51` as one records a spelling mistake as a product gap.

**The `9001-99` text invents a name.** Submitting the real
`PurolatorExpressEnvelopeInternational9AM` returns
`Outbound: 'PurolatorExpressInternationalEnvelope9AM' is invalid.` — and that
echoed spelling, sent on its own, returns `9001-51`. The message names a
service that does not exist. Do not match on it, and do not trust it as a
correction.

## Corrections to the catalogue

Twenty entries in the team's catalogue are not recognised by the API. All
twenty are the time-definite US and international variants, and all twenty
fail the same two ways: packaging and lane are transposed, and noon is written
`12:00`.

| Catalogue says | API accepts |
|---|---|
| `PurolatorExpressU.S.12:00` | `PurolatorExpressU.S.12PM` |
| `PurolatorExpressU.S.Envelope9AM` | `PurolatorExpressEnvelopeU.S.9AM` |
| `PurolatorExpressU.S.Envelope10:30AM` | `PurolatorExpressEnvelopeU.S.10:30AM` |
| `PurolatorExpressU.S.Envelope12:00` | `PurolatorExpressEnvelopeU.S.12PM` |
| `PurolatorExpressU.S.Pack9AM` | `PurolatorExpressPackU.S.9AM` |
| `PurolatorExpressU.S.Pack10:30AM` | `PurolatorExpressPackU.S.10:30AM` |
| `PurolatorExpressU.S.Pack12:00` | `PurolatorExpressPackU.S.12PM` |
| `PurolatorExpressU.S.Box9AM` | `PurolatorExpressBoxU.S.9AM` |
| `PurolatorExpressU.S.Box10:30AM` | `PurolatorExpressBoxU.S.10:30AM` |
| `PurolatorExpressU.S.Box12:00` | `PurolatorExpressBoxU.S.12PM` |
| `PurolatorExpressInternational12:00` | `PurolatorExpressInternational12PM` |
| `PurolatorExpressInternationalEnvelope9AM` | `PurolatorExpressEnvelopeInternational9AM` |
| `PurolatorExpressInternationalEnvelope10:30AM` | `PurolatorExpressEnvelopeInternational10:30AM` |
| `PurolatorExpressInternationalEnvelope12:00` | `PurolatorExpressEnvelopeInternational12PM` |
| `PurolatorExpressInternationalPack9AM` | `PurolatorExpressPackInternational9AM` |
| `PurolatorExpressInternationalPack10:30AM` | `PurolatorExpressPackInternational10:30AM` |
| `PurolatorExpressInternationalPack12:00` | `PurolatorExpressPackInternational12PM` |
| `PurolatorExpressInternationalBox9AM` | `PurolatorExpressBoxInternational9AM` |
| `PurolatorExpressInternationalBox10:30AM` | `PurolatorExpressBoxInternational10:30AM` |
| `PurolatorExpressInternationalBox12:00` | `PurolatorExpressBoxInternational12PM` |

Confirmed by creating shipments on the corrected spelling while the catalogue
spelling returned `9001-51` on the same lane in the same minute:

```
PurolatorExpressEnvelopeU.S.9AM            200  PIN 760000011162
PurolatorExpressU.S.Envelope9AM            400  9001-51
PurolatorExpressEnvelopeU.S.10:30AM        200  PIN 760000011170
PurolatorExpressU.S.Envelope10:30AM        400  9001-51
PurolatorExpressPackU.S.9AM                200  PIN 760000012277
PurolatorExpressBoxU.S.9AM                 200  PIN 760000012285
PurolatorExpressInternational12PM          200  PIN 760000012194
PurolatorExpressInternational12:00         400  9001-51
PurolatorExpressPackInternational12PM      200  PIN 760000012293
PurolatorExpressBoxInternational12PM       200  PIN 760000012301
PurolatorExpressEnvelopeInternational12PM  200  PIN 760000012210
PurolatorExpressInternationalEnvelope12:00 400  9001-51
```

## Not recognised under any spelling tried

- **`PurolatorDeffered`** — also tried `PurolatorDeferred` (one f) and
  `PurolatorGroundDeferred`. All three `9001-51`. The Deferred service does not
  exist in REST Certification under any of those names. The catalogue's
  double-f spelling is not the problem.
- **`PurolatorQuickShipEnvelope`, `PurolatorQuickShipPack`,
  `PurolatorQuickShipBox`** — `9001-51`. Also tried `PurolatorQuickShipPak`;
  also `9001-51`. Bare **`PurolatorQuickShip` IS recognised** (`9001-99`) but
  is not offered on the Edmonton→Mississauga lane tested.

## Results by lane

| Lane | Creates | Of | Notes |
|---|---|---|---|
| Domestic, Edmonton → Mississauga | 24 | 31 | all 24 Express/Ground variants create; the 7 failures are QuickShip (4), Returns (2), Deferred (1) |
| US, Edmonton → Compton | 7 | 17 | the 10 failures are all catalogue-spelling errors; on corrected spellings, 9AM and 10:30AM create and 12PM returns `9001-99` |
| IL, Abbotsford → Beit Shemesh | 4 | 16 | the four base services only |
| ES, Abbotsford → Barcelona | 4 | 16 | the four base services only |
| DE, Abbotsford → Ottobrunn | 4 | 16 | plus all four `12PM` variants on corrected spellings |

Rows: `build/service-catalogue-matrix.csv`, `build/service-catalogue-intl.csv`.

## Two fixture traps this sweep fell into first

Both produced a full grid of confident, meaningless results before being
caught. Recording them because the failure mode is the same each time: a
validation that fires *before* the thing under test.

1. **Piece count.** Envelope, Pack and Box are single-piece services. A
   multi-piece body returns `9001-64` on the packaging rule before the service
   is checked against the lane — 36 rows that said nothing about availability.

2. **The textile flag.** `textileIndicator: true` is refused outside the US
   (`9001-201`, "Textile can only be selected when shipping to the US"). It
   had been set for the HS-code work on the southbound lane, and left on, so
   all 48 international rows failed on the customs block before the service id
   was judged. `textileIndicator` and `usmcaDocumentIndicator` are both
   **lane**-scoped, not goods-scoped: the same shirt needs them on for the US
   and off for IL/ES/DE.

The lesson for the RTM: a service-availability grid is only an answer if every
row's body is one that service could legally accept. Otherwise it measures the
fixture.
