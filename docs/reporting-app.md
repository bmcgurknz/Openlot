# Reporting dashboard & Marketplace embedding

A cross-tool "reporting mechanism" layer added on top of OpenLot: it reads
live from several Procore tools (Quality & Safety, Field Productivity,
Project Controls) and renders one dashboard per category, with every row
linking back to the actual record in Procore. It does **not** duplicate
or own any of that data — no new database tables, no sync job, no
staleness — the point is to reflect exactly what's already in Procore's
tools. This doc also covers what's needed to run it as an **embedded app**
inside Procore's UI and list it on the Procore App Marketplace, since
that's the intended distribution path.

## Why live pull-through, not another sync layer

OpenLot's existing lot-linked evidence (Inspections, Observations, Daily
Log quantities) is stored as a projection in Postgres, kept current by
webhooks + a nightly full-pull reconciliation (`SyncService`) — that
model exists because the *lot register* and the *conformance engine* need
to reason over that data (evaluate blockers, gate claims) even when
Procore is briefly unreachable, and because it's keyed to a specific
lot, which requires the lot-ID-extraction step to happen somewhere.

The reporting dashboard has neither requirement: nothing downstream
depends on the data being present when Procore isn't, and nothing needs
to be linked to a lot. So `ReportingService`
(`src/services/reporting.ts`) just calls `ProcoreClient` on each request
and reshapes the response — simpler, always accurate, and it adds zero
new schema. The trade-off (§7) is one Procore API round trip per tool per
dashboard load; that's fine at today's usage and becomes the first thing
to reconsider if this dashboard gets busy (see Scalability).

## What's implemented

| Category (as scoped in this session) | Tool | Status |
|---|---|---|
| Quality & Safety | Inspections (Checklists) | Reused — already integrated |
| | Observations | Reused — already integrated |
| | Incidents | New |
| Field Productivity | Punch List | New |
| | Daily Log (Quantities) | Reused — already integrated |
| | Photos | **Not built** — see §6 |
| Project Controls | RFIs | New |
| | Submittals | New |
| | Budget (first budget view's detail rows) | New |
| | Change Orders | **Not built** — see §6 |

Code map:

```
src/procore/client.ts     — listIncidents / listPunchItems / listRfis /
                             listSubmittals / listBudgetViews /
                             listBudgetDetailRows, + webUrl() deep-link helper
src/services/reporting.ts — ReportingService: reshapes each tool's records
                             into a common ReportItem, isolates failures
                             per-tool
src/server.ts              — GET /api/projects/:id/reports/{quality-safety,
                              field-productivity,project-controls,summary}
web/src/pages/ReportsPage.tsx — the dashboard UI (server edition only —
                                 see §5)
```

## 1. Endpoint verification — status

**Update, 2026-07-10:** the endpoint paths, query-param conventions, and
response field names below were verified against a real source of truth —
the user supplied the combined public+private Procore OpenAPI spec
(`developers.procore.com`'s own export, OpenAPI 3.0, 6157 paths) as a
120 MB JSON file. Every path and field name used by `ProcoreClient` and
`ReportingService` was checked against it with `jq`, and every mismatch
found was fixed. This section now records what was actually wrong in the
first draft, for anyone auditing the change.

**Path fixes:**
- **Incidents**: was `GET /rest/v1.0/incidents?project_id=` (flat, query
  param) — actually `GET /rest/v1.0/projects/{project_id}/incidents`
  (`project_id` is a **path** segment, not a query param). The original
  path would have 404'd on every call.
- **Daily Log quantities**: was
  `/rest/v1.0/projects/{id}/daily_logs/quantity_logs` — actually
  `/rest/v1.0/projects/{id}/quantity_logs` (no `daily_logs/` segment).
  This one predates the reporting feature (it's used by `SyncService` for
  the core lot-linked evidence sync, not just the dashboard) — see the
  note on `sync.ts` below.
- Punch Items, RFIs, Submittals, Budget Views, and Budget Detail Rows
  paths were all already correct.

**Field-name fixes** (paths were right, response shape assumptions
weren't):
- **Inspections** (`ProcoreInspection`): the real response has **flat**
  `item_count` / `conforming_item_count` / `deficient_item_count` /
  `list_template_name` fields — there is no nested `item_counts` or
  `list_template` object. This wasn't just a reporting-dashboard bug: 
  `SyncService.mapInspectionStatus()` read `i.item_counts.deficient`,
  which was always `undefined`, so **an inspection with deficient items
  never got mapped to `'failed'`**, and `itemsTotal`/`itemsPassed`/
  `itemsFailed` were always stored as `0`. Fixed in both
  `src/procore/client.ts` and `src/services/sync.ts`.
- **Daily Log quantities** (`ProcoreQuantityLog`): real fields are `unit`
  (not `unit_of_measure`) and `description` (not `notes`) — and `notes`
  doesn't exist on this resource at all.
  `SyncService.ingestQuantityLog()` extracted the lot ID from `log.notes`,
  which was always empty, so **quantity-to-lot auto-linking never worked**
  for any daily-log quantity, ever. Fixed to read `log.description`.
- **Incidents** (`ProcoreIncident`): `number` (integer) is the real field
  — `incident_number` doesn't exist. `event_date` is the real field —
  `incident_date` doesn't exist.
- **Punch Items** (`ProcorePunchItem`): the title field is `name` — there
  is no `title` or `number` field on this resource at all. Assignees are
  a plural array `assignees: [{id, name, login}]` — there is no singular
  `assignee`.
- **RFIs** (`ProcoreRfi`): both `ball_in_court` (singular object) and
  `ball_in_courts` (plural array) exist — the mapper was treating the
  singular one as an array. Fixed to use the plural.
- **Submittals** (`ProcoreSubmittal`): `status` is an object
  `{id, name, status}`, not a plain string — `name` is the workflow step
  (e.g. "In Review", "Approved"), which is what Procore's own Submittal
  Log shows as the status column.
- **Budget** (`ProcoreBudgetDetailRow`): `cost_code` on a detail row is a
  plain string (the cost code's display name), not an object with
  `full_code`/`name`. There is **no** `projected_over_under`,
  `approved_cos`, `revised_budget`, or similar computed column on a
  detail row at all — those were fabricated field names. The real,
  usable fields are `cost_code` (string), `original_budget_amount`
  (string-formatted decimal), and `budget_forecast.amount`
  (string-formatted decimal). The dashboard now shows only those.

**Still not verifiable from the OAS — needs a live click-through:**
The `webUrl()` deep links (`WEB_ITEM_PATHS` in `client.ts`) guess at
Procore's **web app** URL structure
(`{PROCORE_WEB_URL}/{project_id}/project/{tool}/...`). An OpenAPI spec
documents the REST API, not the web app's routes, so this is the one
piece that genuinely still needs a human: click through one real record
per tool in your own Procore instance, compare the URL in your browser's
address bar to the guess in `WEB_ITEM_PATHS`, and fix any entry that
doesn't match. One line per tool.

`ReportingService` fetches each tool independently and catches errors
per-tool (`pull()` / `budgetTool()` in `reporting.ts`), so if your Procore
instance's API version differs from what's documented here (Procore does
version resources independently, and this was checked against one spec
snapshot dated 2026-07-03), a wrong path or field still degrades to one
red "Couldn't load this tool: …" card with the real HTTP error, not a
broken page.

## 2. Required OAuth scopes / app permissions

Your existing Procore app (already registered per the earlier
conversation) was presumably scoped to whatever Inspections/Observations/
Daily Log needed. **Incidents, Punch Items, RFIs, Submittals, and Budget
are almost certainly separate permission grants** in the Developer
Portal's app configuration — check the Permissions/Scopes section of your
app and add these resources if they're not already enabled, then
reauthorize (re-run the OAuth flow) for any company that connected before
the change, since Procore scopes are granted at connection time.

## 3. Embedded app support (iframe launch)

You chose "Embedded dashboard inside Procore" as the target experience.
Procore's login page refuses to render inside an iframe (confirmed via
Procore's own `procore-iframe-helpers` documentation), so a plain
full-page OAuth redirect doesn't work once this app is loaded in
Procore's iframe. What was built instead — deliberately hand-rolled
rather than depending on the `procore-iframe-helpers` npm package, since
this session had no way to install it and inspect its actual current API
surface (see the honesty note at the end of this section):

- `web/src/App.tsx` exports `EMBEDDED = window.self !== window.top` and
  hides the OpenLot brand/logo block when true (Procore's own chrome
  already frames the app — no need to double up on navigation chrome).
- A "Connect to Procore" button appears in the header whenever the app
  isn't connected. Outside an iframe it's a normal top-level redirect to
  `/auth/procore`. Inside an iframe it opens `/auth/procore?popup=1` in a
  popup window instead.
- `src/server.ts`'s `/auth/procore` route sets a short-lived
  `openlot_oauth_popup` cookie when `?popup=1` is present. `/auth/procore/
  callback` checks that cookie after completing the token exchange: if
  set, it responds with a tiny self-closing HTML page
  (`popupCloseHtml()`) that does `window.opener.postMessage({source:
  'openlot-oauth', ok, message}, origin)` and closes itself, instead of
  the normal `redirect('/?connected=1')`.
- `App.tsx` listens for that `message` event (checking `e.origin` matches
  its own origin first) and re-checks `/api/connection` to update the
  header — no page reload, the iframe never navigates away from the
  dashboard.
- `src/server.ts` explicitly does **not** register `@fastify/helmet` or
  set any `X-Frame-Options`/CSP `frame-ancestors` header, which is what
  allows Procore to embed the app at all. If helmet or similar is added
  later for other reasons, scope `frame-ancestors` to Procore's domains
  rather than leaving the default (which blocks framing entirely).
- Project context: the embedded launch is expected to pass the current
  project via a `?project_id=` query parameter on the launch URL —
  `web/src/App.tsx`'s `resolveProjectId()` reads that first, falling back
  to the `VITE_PROJECT_ID` build-time default. **Confirm the actual query
  parameter name Procore's Configuration Builder produces for your launch
  URL** and adjust `resolveProjectId()` if it differs — this determines
  whether the embedded app can serve more than one project without a
  separate deployment per project.

**Honesty note:** Procore publishes and recommends `procore-iframe-helpers`
(https://github.com/procore/procore-iframe-helpers) for exactly this
popup-based auth handshake, and it likely also handles iframe resize
signaling and reading launch context that the hand-rolled version above
doesn't. This session could not run `npm install` to inspect its actual
current exported API (no Node.js available in the sandboxed/local
environment used), so rather than write plausible-but-unverified glue
code against a library whose exports I couldn't confirm, the auth
handshake above was implemented directly against documented, stable web
platform APIs (`window.open`, `postMessage`, cookies) — it should work as
written, but is a reasonable candidate to swap for the official library
once you can `npm install procore-iframe-helpers` and read its README/
types yourself, particularly for iframe resize handling if the
full-screen embedded app type needs it (side-panel apps are usually
fixed-width and don't).

### Developer Portal setup checklist

1. In your app's configuration, use the **Configuration Builder** to add
   an embedded app component — "Full Screen" for the main Reports/Lots
   experience, or "Side Panel" if you want a narrower always-visible
   panel instead. You can combine both in one manifest.
2. Set the **Launch URL** to your deployed OpenLot origin (e.g.
   `https://openlot.example.com/`). If you want the dashboard to open
   directly rather than the lot register, point it at
   `https://openlot.example.com/#/reports` — hash routing means the path
   after `#` doesn't need server-side routing support.
3. Save a version, get the **Sandbox App Version Key**, and install it in
   your Developer Sandbox company/project to test end-to-end before
   promoting it.
4. Confirm the exact query parameters Procore appends to your Launch URL
   (project/company context) match what `resolveProjectId()` expects
   (§3 above).

## 4. Marketplace readiness

Per developers.procore.com's Marketplace requirements: apps must be
**production-ready** (no demo/trial-only apps) and need **at least one
beta customer** before submission, pass functional testing with no major
blockers, and stay compliant on an ongoing basis after listing (Procore
can unlist apps that regress). Where this reporting feature stands
against that:

- **Closer to production-ready**: the endpoint-path and field-name
  uncertainties in §1 were resolved against the real Procore OpenAPI spec
  (2026-07-10). What's left before this is genuinely production-ready:
  the `webUrl()` deep-link paths still need a live click-through (§1's
  last item — an OAS documents the REST API, not web app routes, so this
  can't be verified from the spec alone), and none of this has been
  exercised against a live Procore company/OAuth connection yet.
- **Functional testing**: the existing test suite (`npm test`) covers the
  lot register/conformance/claims domain thoroughly; it does not yet
  cover `ReportingService` (there was no live API to test against safely
  in this session — see §7 for a note on testing strategy once you can
  verify endpoints).
- **Beta customer**: needs a real Procore company to connect and use the
  Reports tab before Marketplace submission — a natural next step once
  §1's paths are confirmed.
- **Ongoing compliance**: the per-tool error isolation (§1, point 3) is
  specifically there to degrade gracefully rather than break the whole
  app if Procore changes an endpoint later — that's the pattern to keep
  extending as more tools are added.

## 5. Static edition has nothing to pull from

The Reports nav item is only shown when `!STATIC_EDITION`
(`web/src/App.tsx`) and the dashboard requires a live Procore connection
(`requireProcoreConnection()` in `src/server.ts` returns 409 otherwise) —
unlike the Import Wizard, there is no in-browser equivalent, because the
whole feature is "read what's already in Procore," which the static,
no-backend edition has no connection to.

## 6. Not yet built (follow-ups)

- **Photos**: Procore's Photos API is keyed off individual daily logs/
  albums rather than one project-level list call — it needs its own
  iteration strategy (loop daily logs, then list each day's photos) rather
  than fitting `ReportingService.pull()`'s single-call shape. Natural next
  addition to Field Productivity once §1 is resolved for the tools
  already here.
- **Change Orders**: Commitment Change Order Line Items are nested under
  individual Commitments (list commitments for the project, then list
  change order line items per commitment) — a third fetch level beyond
  what Budget already needed. Scoped out of v1 to keep this session's
  surface achievable and correct; the pattern to extend is
  `ReportingService.budgetTool()`, which already shows how to handle a
  multi-step fetch.
- **Multiple budget views**: `budgetTool()` uses whichever budget view
  Procore returns first. If a project has more than one (e.g. an owner
  budget and a contractor budget), add a view selector rather than
  guessing.
- **Caching / rate limits**: see Scalability below.

## 7. Scalability notes

- **API call volume**: loading the dashboard fires up to 8 Procore API
  calls (3 quality/safety + 2 field productivity + 3 project controls,
  where budget is itself 2 calls) per page load, per project. Fine for a
  single user checking in occasionally; if this becomes a
  frequently-refreshed or multi-user-simultaneous dashboard, add a short
  TTL cache (even 60 seconds, keyed on `projectId + tool`) in front of
  `ReportingService`'s calls before Procore's rate limits (see the 429
  handling already in `ProcoreClient.get()`) become a practical concern.
- **Pagination**: each `list*` call in `ProcoreClient` fetches one page
  (`per_page: 100`) rather than looping to completion the way
  `SyncService.fullSync()` does for inspections/observations. That's a
  deliberate scope decision for a dashboard (show the most recent/first
  100 of each) — extend to full pagination if a project realistically has
  more than 100 open RFIs, punch items, etc., which would be unusual but
  not impossible on a large program.
- **Testing against the real API**: field names are now verified against
  the OpenAPI spec (§1), but that's a schema check, not a runtime one —
  the safest path once you have sandbox access is to add integration
  tests in `tests/` that stub `fetch` with real captured response shapes
  (mirroring the pattern already in `tests/integration/api.test.ts`'s
  `stubFetch()` for the webhook tests), confirming `ReportingService`'s
  mappers against real field names before
  the first customer sees this in production.
