# Changelog

All notable changes to OpenLot are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com) and the project adheres to
[Semantic Versioning](https://semver.org).

## [1.4.0] — 2026-07-10 (in progress — see docs/reporting-app.md before relying on this)

### Added — cross-tool reporting dashboard & Marketplace embedding
- New **Reports** dashboard (server edition + live Procore connection
  only): live, read-only summaries of Quality & Safety (Inspections,
  Observations, Incidents), Field Productivity (Punch List, Daily Log
  quantities) and Project Controls (RFIs, Submittals, Budget), every row
  linking back to the source record in Procore. Nothing is persisted —
  see `src/services/reporting.ts` for why.
- `ProcoreClient` extended with Incidents/Punch Items/RFIs/Submittals/
  Budget Views + Detail Rows, plus a best-effort `webUrl()` deep-link
  helper.
- Embedded-app support for launching OpenLot inside Procore's own UI
  (Configuration Builder full-screen/side-panel app): a popup-based
  "Connect to Procore" flow (Procore's login page can't render in an
  iframe), an `EMBEDDED` detection flag that adapts the header chrome,
  and `?project_id=` query-param context resolution.
- `PROCORE_WEB_URL` config for building "open in Procore" hyperlinks
  (distinct from `PROCORE_BASE_URL`, the API host).

### Fixed — endpoint paths and field names verified against the real Procore API
The reporting endpoints above were originally written without a live
Procore sandbox and had several bugs, since fixed after verifying against
the actual combined public+private Procore OpenAPI spec:
- Incidents were being requested from the wrong URL entirely
  (`/rest/v1.0/incidents?project_id=` instead of
  `/rest/v1.0/projects/{project_id}/incidents`) — would have 404'd.
- Punch Items, RFIs, Submittals, and Budget detail rows all had at least
  one wrong field name (e.g. a `title`/`number` field that doesn't exist
  on Punch Items — the real field is `name`; a `cost_code` object on
  Budget detail rows that's actually a plain string; a fabricated
  `projected_over_under` budget field that doesn't exist).
- **Two of these bugs predate this release and affect the core
  Procore-sync engine, not just the new dashboard**: `SyncService` was
  reading `item_counts`/`list_template` (nested objects that don't exist —
  the real fields are flat) for inspections, meaning deficient inspection
  items were never detected and item counts were always stored as zero;
  and it was reading `notes` (a field that doesn't exist) instead of
  `description` to find the lot ID on daily-log quantities, meaning
  **quantity-to-lot auto-linking never worked for any daily-log entry**.
  Both are fixed in `src/services/sync.ts`.
- The `webUrl()` deep-link URL patterns are the one thing an OpenAPI spec
  can't verify (it documents the REST API, not the web app's routes) —
  those still need a one-time click-through against a real Procore
  instance. See [docs/reporting-app.md](docs/reporting-app.md) §1 for the
  full list of what was wrong and what's still open.

## [1.3.0] — 2026-07-10

### Added — lot register & claim provenance, change history, bulk import
- **Lot register:** `Date Created` (auto-populated, shown in the register
  table and CSV/HTML exports); every column — including the new Builder,
  Stage, Owner and Date Created columns — is now sortable
  (default → ascending → descending toggle, client-side).
- **Progress claims:** claim periods record `createdBy` + `createdAt`;
  claim lines record `createdAt`; both flow through to the substantiation
  CSV and printable HTML report.
- **Lot Change History:** a new read-only, newest-first audit trail per
  lot (`lot_history` table; Overview/History tab on the lot detail page)
  recording who changed what field, from what value, to what value, and
  when — status transitions, hold/witness point release, builder/stage/
  owner updates, notes edits, description (bounds) redefinition, and
  progress-claim add/issue events.
- **Bulk import wizard** (`#/import`, both editions): upload → detect
  format (CSV or XLSX) → validate → preview → resolve issues → confirm →
  summary, with automatic + manual field mapping, duplicate detection, and
  create-or-update semantics (existing Lot IDs update in place; blank
  source cells never overwrite existing data).
- New first-class lot fields: `builder`, `stage`, `owner` (subdivision/
  civil delivery context), editable from the register's "Open new lot"
  form and the lot detail page's new "Subdivision details" card.
- `migrations/003_history_and_provenance.sql`; see
  [docs/v1.3-enhancements.md](docs/v1.3-enhancements.md) for the full
  implementation record (schema, audit design, sorting, import
  architecture, field-mapping spec, future Procore API integration path,
  scalability notes).

## [1.2.0] — 2026-07-08

### Added — static edition (host anywhere, scale to any number of customers)
- The full application — register, ATS 1120 conformance engine, claim gate,
  CSV + substantiation extracts — now also builds as a **static site**
  (`npm run build:static`) that runs entirely in the browser with relative
  paths, hostable on GitHub Pages, Netlify, S3, or inside a WordPress page.
  The static build is a **single self-contained index.html** (all code
  inlined), so it also runs offline from a plain double-click — browsers
  block multi-file module builds opened from a local folder.
- Per-customer data stays on the customer's device (browser storage), with
  a **Your data** panel: JSON backup/restore, lot-lite register CSV import
  (statuses above Work complete deliberately not importable — conformance
  must be earned), sample project, wipe.
- Direct evidence entry in the static edition: record ITP inspection
  results and NCRs per lot, with status editing feeding the same
  conformance rules.
- Client-side claim extracts (CSV download + printable substantiation
  report) in the static edition.
- GitHub Pages auto-deploy workflow (`.github/workflows/pages.yml`) and a
  hosting & distribution guide (`docs/hosting.md`) covering GitHub Pages,
  Netlify/Vercel, S3, WordPress embed/self-host, and the honest path to
  multi-tenant SaaS.
- Domain engine made isomorphic (browser + Node); repository snapshot/
  restore; end-to-end static-edition lifecycle test (50 tests total).

## [1.1.0] — 2026-07-08

### Added — ATS 1120 alignment & Procore rebrand
- Renamed to **Procore OpenLot**; web UI restyled to the Procore visual
  language (black top bar, orange primary actions, blue stage pills,
  rounded cards).
- Lot fields per ATS 1120: payment schedule item number (cl 10.1(e));
  pavement-lot start/end latitude/longitude and datum (cl 10.4 / 13.8(g)).
- Conformance rule **R6**: a pavement (PV) lot cannot be conformed without
  its geo-reference (`PAVEMENT_GEO_MISSING`).
- Hold point releases now require and record the Principal's authorised
  person and release date (cl 11.1 / 11.6); reinstatements audited.
- Bounds-redefinition audit: editing a lot's description appends a note
  preserving the previous bounds (cl 10.3). New `PATCH /lots/:lotId` route.
- Claim extracts (CSV + substantiation report) now carry payment item,
  hold-point release details and pavement geo-references (cl 13.6 / 13.8 /
  13.11).
- New document: docs/ats-1120-compliance.md — clause-by-clause matrix.
- Migration `002_ats1120.sql`; 7 new tests (49 total).

### Fixed
- Windows support: `npm run dev:demo` / `npm run start:demo` (cross-env)
  replace the POSIX-only `DEMO_MODE=true npm run dev` in the docs; added a
  PowerShell walkthrough (`examples/curl-walkthrough.ps1`) and a Windows
  troubleshooting section.

## [1.0.0] — 2026-07-07

### Added
- Lot register with the `LOT-[WT]-[NNNN]` identifier convention, per-work-type
  sequences, and the five-state lifecycle (Open → Work complete → Conformed →
  Closed, plus Superseded).
- Conformance engine (rules R1–R5): inspection evidence required and passed,
  zero open NCRs, all tests passed, hold/witness point released.
- Conformance-to-claim gate: claim periods, claimable-lot evaluation with
  human-readable refusal reasons, double-claim prevention, issued-period
  freeze.
- Claim substantiation extracts: CSV and printable HTML report.
- Procore integration: OAuth 2.0 authorization-code flow with encrypted token
  storage, REST client with automatic refresh and 429 back-off, webhook
  ingestion for Checklist Lists and Observations, full pull sync, daily-log
  quantity linking.
- Web UI: register, lot dossier with live blocker panel, claims workspace.
- PostgreSQL persistence with forward-only migrations; in-memory demo mode
  with the Kestrel Ridge Stage 2 sample project.
- Procore Enterprise import files: civil ITP inspection templates,
  observation custom fields, civil cost-code sample.
- Docker image + docker-compose deployment, GitHub Actions CI/CD.
- 42 automated tests (unit + integration).

### Release notes
First public release. Endpoint versions verified against the Procore API
reference as of July 2026 — re-verify on upgrade (see docs/upgrade-guide.md).

[1.2.0]: https://github.com/your-org/procore-openlot/releases/tag/v1.2.0
[1.1.0]: https://github.com/your-org/procore-openlot/releases/tag/v1.1.0
[1.0.0]: https://github.com/your-org/procore-openlot/releases/tag/v1.0.0
