# International service IDs — which ones serve which lane

Measured 2026-09-17 against `/ship/v1/shipment` in Certification staging by
`tooling/probe_intl_matrix.py`. 16 International service IDs × 4 destinations,
run as real shipments because `/rate` has no `crossBorderInformation` and
cannot express an international shipment at all (see
`REST-crossborder-contract.md`).

Destinations are the team's own SOAP `GetFullEstimate` samples, converted:

| Lane | From | To | Sample |
|---|---|---|---|
| US | Edmonton AB | Compton CA 90220 | `International Full Estimate.txt`, `Us internationational - Importing included.txt` |
| IL | Abbotsford BC | Beit Shemesh 9954224 | `Israel International Estimate.txt` |
| ES | Abbotsford BC | Barcelona 08008 | `Spain Estimate.txt` |
| DE | Abbotsford BC | Ottobrunn 85501 | `To Germany.txt` |

## Results

| Service ID | US | IL | ES | DE |
|---|---|---|---|---|
| `PurolatorExpressInternational` | ✗ | **✓** | **✓** | **✓** |
| `PurolatorExpressInternational9AM` | ✗ | ✗ | ✗ | ✗ |
| `PurolatorExpressInternational10:30AM` | ✗ | ✗ | ✗ | ✗ |
| `PurolatorExpressInternational12PM` | ✗ | ✗ | ✗ | **✓** |
| `PurolatorExpressEnvelopeInternational` | ✗ | **✓** | **✓** | **✓** |
| `PurolatorExpressEnvelopeInternational9AM` | ✗ | ✗ | ✗ | ✗ |
| `PurolatorExpressEnvelopeInternational10:30AM` | ✗ | ✗ | ✗ | ✗ |
| `PurolatorExpressEnvelopeInternational12PM` | ✗ | ✗ | ✗ | **✓** |
| `PurolatorExpressPackInternational` | ✗ | **✓** | **✓** | **✓** |
| `PurolatorExpressPackInternational9AM` | ✗ | ✗ | ✗ | ✗ |
| `PurolatorExpressPackInternational10:30AM` | ✗ | ✗ | ✗ | ✗ |
| `PurolatorExpressPackInternational12PM` | ✗ | ✗ | ✗ | **✓** |
| `PurolatorExpressBoxInternational` | ✗ | **✓** | **✓** | **✓** |
| `PurolatorExpressBoxInternational9AM` | ✗ | ✗ | ✗ | ✗ |
| `PurolatorExpressBoxInternational10:30AM` | ✗ | ✗ | ✗ | ✗ |
| `PurolatorExpressBoxInternational12PM` | ✗ | ✗ | ✗ | **✓** |

Per-lane: US 0 of 16, IL 4 of 16, ES 4 of 16, DE 8 of 16.

Full rows with PINs and error codes: `build/intl-service-matrix.csv`.

## What the failures mean

**US, all 16 — `9001-99` "Outbound: '<serviceId>' is invalid."**
Correct behaviour, not a defect. International services do not serve a US
consignee; southbound uses the `PurolatorExpressU.S.` family, which is what the
team's own US sample uses. Do not raise a ticket for this row.

**`9AM` and `10:30AM` everywhere — `9001-99`.**
The early time-definite International services are not offered to any of these
four destinations. Consistent across all four lanes, so this reads as service
availability rather than a bug — but it is worth confirming with Purolator that
no destination in the test set is expected to support them, because as it
stands `9AM` and `10:30AM` cannot be certified at all.

**`12PM` on DE only.**
Germany accepts the noon commitment; Israel and Spain do not. Geography-
dependent availability, as expected.

**The error text invents a service id.** Submitting the real
`PurolatorExpressEnvelopeInternational9AM` comes back as
`Outbound: 'PurolatorExpressInternationalEnvelope9AM' is invalid.` The echoed
spelling is neither what was submitted nor a valid id — tried on its own it
returns `9001-51` (not recognised). So the message names a service that does
not exist.

This matters beyond tidiness. An earlier revision of this file read the echo as
the gateway "correcting" the submitted id, and that was backwards. Anyone
matching error text against a submitted service id will not get a match, and
anyone trusting the echoed name will send an id the API does not know.

**Two rejection codes, two different meanings.** `9001-99` means the id is real
but is not offered on this lane — a business answer. `9001-51` ("Invalid
service id") means the id is not recognised at all — the request is wrong.
The distinction is what makes a catalogue sweep worth running, and it is the
only way to tell an availability gap from a spelling mistake. See
`REST-service-catalogue.md` for the full corrected id list.

## The piece-count trap

Envelope, Pack and Box are **single-piece** services. Sending the team's
2-piece 20 lb sample body returns `9001-64` "Outbound: The total number of
packages may not exceed 1" — and that fires on the packaging rule **before**
the service is ever checked against the destination. The first pass of this
sweep did exactly that and produced 36 rows of `9001-64` that said nothing
about service availability. A service-availability matrix has to send a body
each service can legally accept, or it measures its own fixture instead of the
API. `pieces_for()` in the probe now sends one piece for those twelve.
