# API reference

Base URL: your deployment. All bodies JSON. Errors return
`{ "error": "message", "blockers?": [...] }` with 400 (validation),
404 (not found), 409 (conflict, e.g. double claim), 422 (conformance
refusal), or 502 (Procore upstream).

## Health & meta

| Method & path | Description |
|---|---|
| `GET /api/health` | `{status, version, demoMode}` |
| `GET /api/work-types` | Work-type code → name map |
| `GET /api/connection` | Procore connection status |
| `GET /api/projects` | Procore projects for the connected company |

## Lots

| Method & path | Description |
|---|---|
| `GET /api/projects/:projectId/lots?status=&workType=` | Register, filterable |
| `POST /api/projects/:projectId/lots` | Create. Body: `{workType, description, specReference?, costCode?, paymentItemNumber?, quantity?, uom?, geoStart?, geoEnd?, geoDatum?, builder?, stage?, owner?, sequence?, notes?, createdBy?}` |
| `GET /api/projects/:projectId/lots/:lotId` | Dossier: `{lot, inspections, ncrs, tests, quantities, claimedIn, history}` (v1.3 adds `history`) |
| `PATCH /api/projects/:projectId/lots/:lotId` | Update editable fields, now including `builder?, stage?, owner?` (v1.3) and an optional `actor?` recorded against each changed field in `lot_history`. Description changes still also append the legacy ATS 1120 cl 10.3 bounds audit note to `notes` |
| `GET /api/projects/:projectId/lots/:lotId/history` | v1.3 — the lot's change-history entries, newest first: `{id, at, user, field, previousValue, newValue}[]` |
| `GET /api/projects/:projectId/lots/:lotId/evaluation` | Conformance evaluation `{eligible, blockers[]}` |
| `POST /api/projects/:projectId/lots/:lotId/transition` | Body `{to, supersededBy?, actor?}`. 422 with blockers when `to=conformed` fails the rules. Status changes are recorded to `lot_history` (v1.3) |
| `POST /api/projects/:projectId/lots/:lotId/hold-point` | Body `{released: boolean, actor?}`. `actor` (the Principal's authorised person) is **required** when releasing — ATS 1120 cl 11.6. Recorded to `lot_history` (v1.3) |
| `POST /api/projects/:projectId/lots/:lotId/tests` | Body `{testType, labReference?, documentUrl?, notes?}` |
| `PATCH /api/tests/:testId` | Body `{status?, labReference?, resultAt?, documentUrl?, notes?}` |

Blocker codes: `NO_INSPECTIONS_LINKED`, `INSPECTION_NOT_PASSED`, `OPEN_NCR`,
`TEST_OUTSTANDING`, `TEST_FAILED`, `HOLD_POINT_NOT_RELEASED`,
`PAVEMENT_GEO_MISSING` (ATS 1120 cl 10.4), `LOT_SUPERSEDED`, `LOT_CLOSED`.

## Claims

| Method & path | Description |
|---|---|
| `GET /api/projects/:projectId/claims` | Periods |
| `POST /api/projects/:projectId/claims` | Body `{label, periodStart, periodEnd, createdBy?}` (v1.3 adds `createdBy`, surfaced on the claim and in the substantiation extracts) |
| `GET /api/projects/:projectId/claims/:claimId/claimable` | Every lot with `{claimable, reason, alreadyClaimedIn}` |
| `GET /api/projects/:projectId/claims/:claimId/lines` | Lines on the claim (each now includes `createdAt`, v1.3) |
| `POST /api/projects/:projectId/claims/:claimId/lots` | Body `{lotId, actor?}`. 409/422 with the gate's reason on refusal. Recorded to the lot's `lot_history` as a "Progress claim" entry (v1.3) |
| `POST /api/projects/:projectId/claims/:claimId/add-all-conformed` | Body `{actor?}`. Bulk add every claimable lot |
| `POST /api/projects/:projectId/claims/:claimId/issue` | Body `{actor?}`. Freeze the period; records a "Progress claim" issued entry per claimed lot (v1.3) |
| `GET /api/projects/:projectId/claims/:claimId/extract.csv` | CSV download |
| `GET /api/projects/:projectId/claims/:claimId/extract.html` | Printable substantiation report |

## Reports (cross-tool reporting dashboard — see docs/reporting-app.md)

Read-only, live from Procore on every call (nothing persisted). Requires
an active Procore connection — 409 otherwise, same as `/api/projects`.

| Method & path | Description |
|---|---|
| `GET /api/projects/:projectId/reports/quality-safety` | Inspections, Observations, Incidents |
| `GET /api/projects/:projectId/reports/field-productivity` | Punch List, Daily Log quantities |
| `GET /api/projects/:projectId/reports/project-controls` | RFIs, Submittals, Budget |
| `GET /api/projects/:projectId/reports/summary` | All three combined, in parallel |

Each returns `{category, projectId, generatedAt, tools: [{tool, ok, error, items: [{id, tool, title, status, date, procoreUrl, detail}]}]}`.
A tool with `ok: false` failed independently of the others — see
`error` for the underlying Procore API error, and
[docs/reporting-app.md](reporting-app.md) §1 before trusting any of these
paths in production.

## Procore integration

| Method & path | Description |
|---|---|
| `GET /auth/procore` | Begin OAuth (browser) |
| `GET /auth/procore/callback` | OAuth redirect target |
| `POST /api/projects/:projectId/sync` | Full pull sync; returns counts |
| `POST /api/webhooks/register` | Create hook + triggers in Procore |
| `GET /api/webhooks/events?limit=` | Ingestion audit log |
| `POST /webhooks/procore` | Procore delivery target (shared-secret header) |

## Worked example

```bash
# open a lot, walk it to a claim
curl -sX POST localhost:4400/api/projects/316/lots \
  -H 'content-type: application/json' \
  -d '{"workType":"EW","description":"Ch 0–100 fill","quantity":500,"uom":"m3","costCode":"02-220"}'
curl -sX POST localhost:4400/api/projects/316/lots/LOT-EW-0015/transition \
  -H 'content-type: application/json' -d '{"to":"work_complete"}'
curl -s localhost:4400/api/projects/316/lots/LOT-EW-0015/evaluation   # see blockers
```

See `examples/curl-walkthrough.sh` for the full scripted lifecycle.
