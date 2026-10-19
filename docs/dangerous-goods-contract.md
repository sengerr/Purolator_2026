# Dangerous goods — the measured contract (REST and SOAP)

Established from the live runs of 2026-10-06 (Certification REST, 647 calls;
Development SOAP, 561 calls) and the request bodies that produced them. Every
statement below is something the API returned, not something read from the
published specification. Where the two disagree it is noted.

Related: `REST-documents-contract.md` (declaration retrieval), `REST-error-catalogue.md`.
The source repository carries additional, not-yet-verified DG variants; they are left out here.
Runnable examples: `samples/rest-ship-dangerous-goods.js`, `samples/soap-ship-dangerous-goods.js`.

## The short version

Dangerous goods are **three shipment options that travel together**, plus one
indicator that asks for the declaration document. Same model on both protocols:

| | REST `/rate/v1/shipment`, `/ship/v1/shipment` | SOAP Estimating v2, Shipping v2 |
|---|---|---|
| Switch | `{ "optionId": "DangerousGoods", "optionIdValue": "true" }` | `<OptionIDValuePair><ID>DangerousGoods</ID><Value>true</Value>` |
| Class | `DangerousGoodsClass` | `DangerousGoodsClass` |
| Mode | `DangerousGoodsMode` | `DangerousGoodsMode` |
| Declaration | `shipmentInformation.dangerousGoodsDeclarationDocumentIndicator: true` | `PackageInformation/DangerousGoodsDeclarationDocumentIndicator` `true` |
| Where | `shipmentInformation.shipmentOptionsInformation[]` | `PackageInformation/OptionsInformation/Options` |

Values seen passing (class × mode × service, either protocol; E = `/rate` /
Estimating only, S = shipped):

| `DangerousGoodsClass` | Meaning | Express + `Air` | Ground + `Ground` |
|---|---|---|---|
| `FullyRegulated` | Fully regulated goods (shipper-declared) | S | S |
| `LimitedQuantities` | Limited quantity exemption | — | S |
| `LessThan500kgExempt` | 500 kg gross-mass exemption | — | E |
| `UN3373` | Biological substance, Category B | S (also CA→US on SOAP) | E |
| `UN1845` | Carbon dioxide, solid (dry ice) | — | E |

## Mode follows the service

`PurolatorExpress*` is an **air** service and `PurolatorGround` is ground. The
mode has to match or the shipment is refused — on both protocols, with the same
sentence:

| protocol | code | message |
|---|---|---|
| REST `/ship` | `9001-171` | `Outbound: Dangerous Goods Mode must be Air for this shipment.` |
| SOAP Shipping v2 | `1100521` | `Dangerous Goods Mode must be Air for this shipment.` |

This is the opposite of what the older note in `REST-documents-contract.md`
said; that note is corrected. `/rate/v1/shipment` is more forgiving: Express +
FullyRegulated + Ground rated successfully, so a passing estimate does not prove
the ship body will pass.

## What passed on 2026-10-06

### REST (Certification, `/ship/v1/shipment` unless noted)

| request | service | class | mode | decl. | lane |
|---|---|---|---|---|---|
| SHIP · Domestic · Dangerous Goods (+ FR) | PurolatorExpress | FullyRegulated | Air | yes | CA→CA |
| SHIP · Domestic · Dangerous Goods Declaration (+ FR) | PurolatorExpress | UN3373 | Air | yes | CA→CA |
| SHIP · Domestic · Dangerous Goods Limited Quantity (+ FR) | PurolatorGround | LimitedQuantities | Ground | yes | CA→CA |
| SAMPLE · Domestic · Ship / Validate Dangerous Good (and "2") | PurolatorGround | FullyRegulated | Ground | yes | CA→CA |
| `/rate` ESTIMATE · Domestic · Dangerous Goods | PurolatorExpress | FullyRegulated | Ground | — | CA→CA |
| `/rate` SAMPLE · Domestic · Estimate Dangerous Good FullyRegulated / UN1845 / UN3373 / LessThan500kgExempt | PurolatorGround | as named | Ground | — | CA→CA |
| `/rate` SAMPLE · Domestic · Estimate Express Cheque Dangerous Good | PurolatorExpress | LimitedQuantities | Ground | — | CA→CA |
| `/documents` DOCUMENTS · Domestic · Dangerous Goods Declaration | — | — | — | PDF returned | — |

The REST team sample `SAMPLE · US · Ship Dangerous Goods` passed but **carries no
DG options at all** (and `SAMPLE · US · Estimate Dangerous Good` sends
`DangerousGoods=false`), so REST cross-border DG was not actually exercised.

### SOAP (Development)

| request | service | class | mode | decl. | lane |
|---|---|---|---|---|---|
| SHIP · Domestic · Dangerous Goods (+ FR) | PurolatorExpress | FullyRegulated | Air | yes | CA→CA |
| SHIP · Domestic · Dangerous Goods Declaration (+ FR) | PurolatorExpress | UN3373 | Air | yes | CA→CA |
| SHIP · Domestic · Dangerous Goods Limited Quantity (+ FR) | PurolatorGround | LimitedQuantities | Ground | yes | CA→CA |
| SAMPLE · US · Ship / Validate Dangerous Goods | PurolatorExpressU.S. | UN3373 | Air | no | CA→US |
| ESTIMATE · Domestic · Dangerous Goods (sample) | PurolatorExpress | UN3373 | Air | — | CA→CA |
| ESTIMATE · Domestic · Dangerous Goods | PurolatorExpress | FullyRegulated | Ground | — | CA→CA |
| SAMPLE · Domestic · Estimate Dangerous Good FullyRegulated / UN1845 / UN3373 / LessThan500kgExempt | PurolatorGround | as named | Ground | — | CA→CA |
| GetDocuments DOCUMENTS · Domestic · Dangerous Goods Declaration | — | — | — | returned | — |

## One value per option (SOAP)

The schema allows one `<Value>` per `OptionIDValuePair`. The team samples were
exported with every class listed under one ID:

```xml
<OptionIDValuePair>
    <ID>DangerousGoodsClass</ID>
    <Value>FullyRegulated</Value>
    <Value>UN3373</Value>
    <Value>UN1845</Value>
    <Value>LessThan500kgExempt</Value>
    <Value>LimitedQuantities</Value>
</OptionIDValuePair>
```

The service does not reject the extra elements — it evaluates each one, so a
Ground shipment is also checked as `LimitedQuantities` and `LessThan500kgExempt`
against the air rules and fails:

```
1100508 Dangerous Goods Mode Air is not valid with Dangerous Goods Class Limited Quantities.
1100508 Dangerous Goods Mode Air is not valid with Dangerous Goods Class LessThan 500KG Exempt.
1100517 At least one of the following options must be specified when Dangerous Goods Indicator is selected: Dangerous Goods Mode or DangerousGoodsClass.
```

`1100517` appears in the same response because, once a value is invalid, the
class is treated as unset. When `DangerousGoods` is `false` the list is ignored
and the request passes, which is why `Ship Basic`, `Validate Basic` and
`2-Piece Multi-Option` were unaffected. The collections now send one class per request
(`tooling/fix_soap_dg.py`, 2026-10-19); the eight affected team samples are not
in the client repository until a run confirms them.

REST has no equivalent failure mode: `optionIdValue` is a single string.

## The declaration document

- Set the indicator at create time; the declaration is **not** returned with
  the shipment. Fetch it afterwards: REST `/ship/v1/documents` with
  `documentType: ["DangerousGoodsDeclaration"]`; SOAP ShippingDocuments v1
  `GetDocuments` with `DocumentType` `DangerousGoodsDeclaration`.
- REST: the document comes back in the format fixed when the shipment was
  created and the declaration is **Laser/PDF only** — a ZPL/DPL (thermal)
  shipment returns `9001-312` for it (`REST-documents-contract.md`).
- SOAP: `1001181 Unsupport Document Type` was returned in Development for a
  freshly created UN3373 Express shipment (`DOC · OPTION · DangerousGoodsDeclaration`),
  while the same request against an older PIN returned the document. Whether
  this is an environment limit or a timing one is not settled; treat `1001181`
  on the declaration as "not available for this PIN", not as a malformed request.

## Other rules seen in the runs

- A return leg cannot carry `DangerousGoods=true` (REST error catalogue,
  `9001-140`–`9001-144` block). Ship DG outbound only.
- `/rate/v1/shipment` rejects `dangerousGoodsDeclarationDocumentIndicator`
  (`9001-275 unknown field`) — it is a `/ship` field.
- Express Cheque + dangerous goods rated on REST; on SOAP the same body
  returned `1100570 ExpressCheque option is only available for Canadian
  shipments.` on a CA→CA lane — an Express Cheque entitlement message, not a
  DG rule (Express Cheque is off in the test accounts).
- Blind shipping + DG: the SOAP samples failed only on the class list
  (unverified since the fix); REST has no `formOnLabelInformation` field at all
  (`9001-276`), so there is no REST blind DG case.
