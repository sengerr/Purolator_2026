# Purolator 2026: EWS SOAP and REST Postman collections

These are Postman collections for the Purolator **REST** API and the Purolator **EWS SOAP** API. There is one set for **Development** and one for **Production**. They are stored in Postman's on-disk YAML format, so the Postman Git integration can open them directly.

**Just want to import them?** `postman/` holds the same four collections as ready-to-import Postman v2.1 JSON files, with a step-by-step guide: [`postman/HOW-TO-LOAD.md`](postman/HOW-TO-LOAD.md).

**Every request in this repository has been sent live and succeeded.** Requests that failed, or that were never sent, are left out.

| Collection | Requests | Verified in |
|---|---|---|
| Purolator REST — Development | 430 | Certification, full REST run on 2026-10-06 |
| Purolator REST — Production | 430 | Same requests as Development; only the host differs |
| Purolator SOAP (EWS) — Development | 406 | Development, full SOAP run on 2026-10-06 |
| Purolator SOAP (EWS) — Production | 406 | Same requests as Development; only the host differs |

In each protocol, the request content is identical between Development and Production.

---

## Endpoints

| Tier | SOAP (`soapBase`) | REST (`baseUrl`) | OAuth scope (`authScope`) |
|---|---|---|---|
| Development | `https://devwebservices.purolator.com` | `https://shipapi-sandbox.purolator.com` | `portal_api_sandbox` |
| Production | `https://webservices.purolator.com` | `https://shipapi.purolator.com` | `portal_api` |

---

## Set up your environment

**No environment files are included.** Create one Postman environment per tier and fill it with your own credentials. Purolator issues these per customer. Never commit a filled-in environment.

| Variable | Used by | Value |
|---|---|---|
| `soapBase` | SOAP | the SOAP host above |
| `SOAP_Key`, `SOAP_Password` | SOAP | your EWS key and password (Basic auth) |
| `baseUrl`, `rateBaseUrl` | REST | the REST host above |
| `authScope` | REST | the scope above |
| `REST_ClientId`, `REST_Secret` | REST | your Okta client id and secret |
| `REST_XApiKey` | REST | your x-api-key |
| `REST_Token` | REST | leave blank. *00 · Auth → AUTH · OKTA Token* fills it |
| `AccountNumber` | both | your billing account |
| `Different_AccountNumber` | both | a second account, for third-party billing |
| `Freight_account` | SOAP freight | your freight account |
| `RequestReference` | both | any text you like |
| `locatorXApiKey`, `xOriginVerify` | REST locator | only if Purolator issued separate locator keys to you |

The following variables are filled by the collections' own scripts: `Current_Date`, the other date variables, `PIN`, `PIN2`, `trackingId` and the other `PIN_*` values. A request that needs a PIN reads it from the shipment created earlier in the same folder. Run a folder top to bottom the first time.

**REST:** run *00 · Auth → AUTH · OKTA Token* first. Every other REST request uses the bearer token it stores.

---

## Successful calls

The `successful-calls/` folder holds one CSV per protocol. Each collection folder also has its own copy, `successful-calls.csv`. The Development and Production copies list the same calls, because hosts are shown as variables. Each row is one request exactly as it was sent and answered, with these columns:

- `Folder`
- `Endpoint`
- `Name`
- `Request`
- `Response`
- `Headers`

In the CSVs:

- **Hosts** appear as `{{baseUrl}}` or `{{soapBase}}`.
- **Account numbers** appear as `{{AccountNumber}}`, `{{Different_AccountNumber}}` or `{{Freight_account}}`.
- **Credentials** in the headers (Authorization, keys, tokens) are shown as `<masked>`.

Bodies longer than Excel's cell limit are cut and marked `[truncated: N characters]`.

---

## Live-run results

The `results/` folder holds the full verification runs of 2026-10-06, including the calls that failed:

| File | What |
|---|---|
| `certification-rest-20261006-093933.csv` | Every REST call: request, HTTP status, pass or fail, error |
| `development-soap-20261006-094704.csv` | Every SOAP call, same columns |
| `Certification-REST-results-2026-10-06.xlsx` | REST workbook with four sheets: Summary, Results, Samples, and Issues grouped by cause |
| `Development-SOAP-results-2026-10-06.xlsx` | SOAP workbook, same sheets |

Account numbers in these files are shown as variables. No keys or tokens are logged.

These files list every call, including the ones left out of the collections. They also include some internal checks that are not in the collections:

- REST Certification support cases (folder 15)
- Product, document and payment matrix calls

The Issues sheet explains why each failed call failed. The causes include services not offered on the test lane, features switched off in the test environment, and REST limitations.

---

## Naming

```
<CALL> · <Domestic | US | International> · <Focus>
SAMPLE · <Domestic | US | International> · <Focus>
```

`SAMPLE ·` requests are complete worked examples. `· FR` at the end of a name means the French-language version of the request.

Standard test addresses:

- **Sender:** Purolator / Tech A, 17718 114 Ave, Edmonton AB T5S 2N4.
- **Canadian receivers:**
  - Calgary for Ground and timed services.
  - Richmond for Express.
  - Etobicoke for returns.
- **US receiver:** Compton CA.
- **International receivers:** the country's sample address.
- **Residential receiver:** Home Receiver, 24 Sussex Drive, Ottawa ON K1M 1P5.

---

## What is not included

- **Certification collections.**
- **Pickup requests.** None were sent during verification, so none are included.
- **Requests that failed live verification.** This covers services not offered on the test lane, and features that the test environment has switched off.
- **Internal support and negative test cases.**

---

## Importable JSON

`postman/` — the four collections exported as Postman v2.1 `.postman_collection.json` files (File → Import in Postman), plus `HOW-TO-LOAD.md` covering import, environment setup and the first run. Same content as the YAML trees; regenerated whenever the collections change.

## Reference

- `docs/REST-*.md`: the REST contract rules learned during verification. These cover address fields, documents, cross-border, manifests, services and error codes.
- `docs/dangerous-goods-contract.md`: dangerous goods on both protocols. The three options, class and mode values, which combinations shipped, the declaration document, and the SOAP one-value-per-option rule.
- `docs/SOAP-v2-tracking.md`: SOAP tracking v2 notes.

## Code samples

`samples/` holds runnable Node.js 18+ scripts with no npm packages. Each reads its credentials from environment variables and switches between Development and Production with `PUROLATOR_ENV=dev|prod`.

| File | What it does |
|---|---|
| `rest-ship-with-return.js` | REST: outbound shipment, return shipment and label in one call |
| `rest-ship-dangerous-goods.js` | REST: dangerous-goods shipment (pick a verified class/mode scenario), label, then the Dangerous Goods Declaration from `/ship/v1/documents` |
| `soap-ship-dangerous-goods.js` | SOAP: the same flow with Shipping v2 `CreateShipment` / `ValidateShipment` and Shipping Documents v1 `GetDocuments` |

Production calls create real shipments. Use Development until your integration is certified.
