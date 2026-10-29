# How to load these collections into Postman

Four files in this folder, Postman collection format v2.1.0, exported from the YAML collections in this repository. No environment files are included on purpose — credentials are issued per customer and must never travel with a collection.

| File | Requests | Host |
|---|---|---|
| `Purolator_REST_Development.postman_collection.json` | 420 | `https://shipapi-sandbox.purolator.com` |
| `Purolator_REST_Production.postman_collection.json` | 420 | `https://shipapi.purolator.com` |
| `Purolator_SOAP_EWS_Development.postman_collection.json` | 428 | `https://devwebservices.purolator.com` |
| `Purolator_SOAP_EWS_Production.postman_collection.json` | 428 | `https://webservices.purolator.com` |

Every request was sent live and succeeded: REST on 2026-10-06, SOAP on 2026-10-29. Start with the **Development** files; Production calls create real, billable shipments.

---

## 1. Import the collections

Postman desktop (Windows) or the web app — same steps. Import the `.json` files one at a time or together; do not import a zip.

1. Download the four `.postman_collection.json` files from this folder (or clone the repository). Put them somewhere you can find them, for example `C:\Users\<you>\Documents\Purolator Postman\`.
2. Open Postman and pick the workspace you want them in (top-left workspace switcher).
3. Click **Import** (top-left, next to **New**), or press `Ctrl+O`.
4. Drag the `.json` files into the import window, or click **files** and select them. Each is 4–6 MB; Postman takes a few seconds per file.
5. Postman lists each one as a **Collection**. Click **Import**.

The collections appear in the left sidebar under **Collections**. The files carry a fixed collection id, so importing a newer copy later asks **Replace** or **Import as copy** — choose Replace to take the new version.

## 2. Create one environment per tier

The collections read everything that is yours — hosts, keys, account numbers — from an environment. Create one for Development and one for Production.

1. Left sidebar → **Environments** → **+** (or **Create Environment**).
2. Name it, e.g. `Purolator — Development`.
3. Add the variables below. Put secrets in the **Current value** column only and set their **Type** to `secret`; leave **Initial value** blank so they never sync to the Postman cloud or get shared with the environment.
4. **Save** (`Ctrl+S`), then repeat for Production with the production hosts, scope and keys.

| Variable | Used by | Development value | Production value |
|---|---|---|---|
| `baseUrl` | REST | `https://shipapi-sandbox.purolator.com` | `https://shipapi.purolator.com` |
| `rateBaseUrl` | REST | same as `baseUrl` | same as `baseUrl` |
| `authScope` | REST | `portal_api_sandbox` | `portal_api` |
| `REST_ClientId` | REST | your Okta client id | your Okta client id |
| `REST_Secret` | REST | your Okta client secret (type: secret) | your Okta client secret (type: secret) |
| `REST_XApiKey` | REST | your x-api-key (type: secret) | your x-api-key (type: secret) |
| `REST_Token` | REST | leave blank — the token request fills it | leave blank |
| `soapBase` | SOAP | `https://devwebservices.purolator.com` | `https://webservices.purolator.com` |
| `SOAP_Key` | SOAP | your EWS key | your EWS key |
| `SOAP_Password` | SOAP | your EWS password (type: secret) | your EWS password (type: secret) |
| `AccountNumber` | both | your billing account | your billing account |
| `Different_AccountNumber` | both | a second account, for third-party billing tests | same |
| `Freight_account` | SOAP freight | your freight account, if any | same |
| `RequestReference` | both | any text, e.g. `Postman` | same |
| `locatorXApiKey`, `xOriginVerify` | REST locator | only if Purolator issued separate locator keys | same |

Everything else the requests use — `Current_Date` and the other date variables, `PIN`, `PIN2`, `trackingId`, the `PIN_*` values — is written by the collections' own scripts while you run them. You do not create those.

## 3. Select the environment

Top-right of the Postman window, the environment dropdown says **No Environment**. Choose `Purolator — Development`. The eye icon beside it shows the current values, which is the quickest way to confirm a variable is set.

A request whose URL shows `{{baseUrl}}` in **red** means the environment is not selected or the variable is missing.

## 4. First run

**REST**

1. Open `00 · Auth` → `AUTH · OKTA Token` and click **Send**. A `200` with an `access_token` means your client id, secret and scope are right; the request's test script stores the token in `REST_Token`.
2. Every other REST request sends that bearer token automatically. The token expires after about an hour — if you start getting `401`, send the token request again.
3. Try `01 · Estimate` → `ESTIMATE · Domestic · Basic`, then `02 · Shipping` → `SHIP · Domestic · Basic`.

**SOAP**

1. There is no token step. Each request carries Basic auth built from `SOAP_Key` / `SOAP_Password`.
2. Try `02 · Estimating` → `ESTIMATE · Domestic · Basic`, then `01 · Shipping` → `SHIP · Domestic · Basic`.

**Both**

- Run a folder **top to bottom** the first time. Tracking, document, void and manifest requests read a PIN that a shipping request earlier in the same folder created and stored.
- Shipment dates are set by a pre-request script to today + 5 days in the carrier's time zone, so you never need to edit a date.
- Labels come back base64-encoded. Open the **Visualize** tab on the response to see them rendered.

## 5. Running a whole folder

Right-click a folder → **Run folder**. In the Collection Runner keep the request order, set a delay of about `250 ms` between requests, and make sure the Development environment is selected. In Production, run only what you intend to ship.

## Updating later

Re-import the newer file and choose **Replace**. Your environments are separate objects and are untouched by a collection import.

## Troubleshooting

| You see | Cause | Fix |
|---|---|---|
| Import fails with "format not supported" | A zip or folder was dropped, or a file was renamed to `.txt` | Import the `.postman_collection.json` files themselves |
| Import spins for a long time | The web app on a large file | Use the Postman desktop app, or import one file at a time |
| `{{baseUrl}}` in red in the URL bar | No environment selected, or the variable name differs | Select the environment; check the eye icon |
| `401` on the Okta token request | Wrong client id / secret / scope for that tier | Sandbox keys only work with `portal_api_sandbox`, production keys with `portal_api` |
| `401` on every REST request but the token was fine | `REST_Token` empty or expired | Send `AUTH · OKTA Token` again |
| `403` on REST | `REST_XApiKey` missing or for the other tier | Check the key and the tier |
| SOAP `401` / HTML login page in the body | `SOAP_Key` / `SOAP_Password` wrong for that host | Development and Production keys are different |
| A document or tracking request fails with "no PIN" | The shipping request before it was not run in this session | Run the folder from the top |
