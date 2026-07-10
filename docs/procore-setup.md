# Procore setup

## 1. Create the OAuth app

1. Sign in at https://developers.procore.com → **Create App**.
2. App type: choose the standard OAuth 2.0 **Authorization Code** grant
   (user-level). OpenLot authenticates as a nominated service user.
3. Redirect URI: `https://<your-host>/auth/procore/callback` — exact match,
   including scheme and path.
4. Copy the Client ID and Client Secret into `.env`.
5. If your company requires App approval (App Management), have the Procore
   company admin install/approve the app for the company.

**Sandbox first:** every Developer Portal app gets a development sandbox.
Point `PROCORE_BASE_URL`/`PROCORE_LOGIN_URL` at the sandbox equivalents and
rehearse the whole flow before touching production.

## 2. Service account & permissions

Create (or nominate) a Procore user for OpenLot, added to each in-scope
project, with permission templates granting at minimum:

| Tool | Level | Why |
|---|---|---|
| Inspections | Read-only | Pull checklist lists + item counts |
| Observations | Read-only | Pull NCRs |
| Daily Log | Read-only | Pull quantity entries |
| Directory (company) | Read-only | Resolve company/projects |
| Webhooks (company admin) | Admin | Register the hook + triggers (one-off) |

Least privilege applies: OpenLot never writes quality records to Procore.

## 3. Connect

Visit `https://<your-host>/auth/procore` **as the service user**, approve.
`GET /api/connection` should now show the company name.

## 4. Register webhooks

```bash
curl -X POST https://<your-host>/api/webhooks/register
```

This creates one hook (destination `https://<your-host>/webhooks/procore`,
carrying your `X-OpenLot-Webhook-Secret` header) and four triggers:
Checklist Lists create/update, Observations create/update. Confirm delivery
in `GET /api/webhooks/events` after touching a titled inspection in Procore.

## 5. Enterprise configuration imports (optional but recommended)

The `/imports` folder ships Procore-ready configuration to standardise the
field convention:

- `imports/inspection-templates/*.csv` — civil ITP inspection templates
  (earthworks MRTS04-style, stormwater, concrete structures). Import via
  Company Admin → Inspections → Templates (or supply to your Procore
  implementation contact for bulk import).
- `imports/custom-fields/observations-custom-fields.csv` — a "Lot ID" custom
  field + fieldset for Observations, so the lot ID is structured data as
  well as a title prefix.
- `imports/cost-codes/civil-cost-codes-sample.csv` — quantity-bearing civil
  cost-code excerpt (Code, Description, UoM) matching the demo data.

Column layouts follow Procore's import conventions but **verify against the
current import templates in the Procore support portal before submitting** —
import formats are updated periodically.

## 6. Field convention (the part that involves people)

One toolbox talk: *"Every inspection, NCR and daily-log quantity note starts
with the lot ID — `LOT-EW-0014 - Subgrade proof roll`."* OpenLot tolerates
case, dashes and missing zero-padding, and its webhook audit log
(`ignored_no_lot_id`) tells you exactly which records missed the convention.
