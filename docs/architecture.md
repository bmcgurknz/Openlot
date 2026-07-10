# Architecture

## System overview

```
                        ┌────────────────────────────┐
                        │         Procore            │
                        │  Inspections · Observations │
                        │  Daily Log · OAuth · Hooks  │
                        └───────┬───────────▲────────┘
             webhooks (HTTPS)   │           │  REST (Bearer + Procore-Company-Id)
                                ▼           │
   ┌─────────────────────────────────────────────────────────┐
   │                    OpenLot container                     │
   │  Fastify API ── services ── repository ── PostgreSQL     │
   │   /webhooks/procore   LotService        PgRepository     │
   │   /auth/procore       ClaimService      (or Memory in    │
   │   /api/*              SyncService        demo/test)      │
   │   static web UI       ConformanceEngine (pure)           │
   └───────────────▲─────────────────────────────────────────┘
                   │ HTTPS via reverse proxy / IAP
            PE · CA · QM browsers
```

Design decisions worth knowing:

- **Repository pattern.** Services depend on the `Repository` interface;
  `PgRepository` is production, `MemoryRepository` powers tests and demo
  mode. Business rules never touch SQL.
- **Pure conformance engine.** `evaluateConformance()` takes data in,
  returns an evaluation — no I/O, trivially testable, auditable.
- **Procore stays the source of truth for evidence.** OpenLot stores a
  linked *projection* (title, status, counts) sufficient for the rules, and
  keeps the Procore IDs to deep-link back. It never writes quality records
  into Procore.

## Authentication flow (OAuth 2.0 authorization code)

```
Admin ──► GET /auth/procore ──► 302 login.procore.com/oauth/authorize
                                       │ (admin approves the app)
   ◄── 302 /auth/procore/callback?code&state ──┘
   state cookie verified ──► POST /oauth/token (code)
   tokens AES-256-GCM encrypted ──► procore_connections
   company resolved (PROCORE_COMPANY_ID or sole company)
```

Refresh happens lazily: any API call finding an expired access token
exchanges the refresh token, re-encrypts, and persists before proceeding.

## Webhook flow

```
Procore ──POST /webhooks/procore──► shared-secret header check (401 on miss)
   payload {resource_name, event_type, resource_id, project_id}
      ├─ Checklist Lists ─► GET checklist list ─► extractLotId(title)
      │        └─ hit: upsert linked_inspection ─► outcome "linked"
      ├─ Observations ─► GET observation ─► type NCR? ─► extractLotId(title)
      └─ anything else ─► outcome "ignored_resource"
   every delivery appended to webhook_events (audit)
   200 returned; Procore retries on non-2xx (ingestion is idempotent)
```

Webhooks are at-least-once and unordered, so ingestion is upsert-only and a
scheduled **full pull sync** (`POST /api/projects/:id/sync`, cron it nightly)
reconciles anything missed and picks up daily-log quantities.

## Event flow for the money path

1. Foreman closes `LOT-EW-0014 - Subgrade proof roll` in Procore.
2. Webhook → inspection linked, status `passed`.
3. Lab results arrive; PE marks the compaction test `passed`; superintendent
   releases the hold point (recorded with actor + date in lot notes).
4. PE conforms the lot — engine passes, conformed date stamped.
5. CA opens PC-14, sees the lot in the claimable list, adds it (quantity,
   UoM, cost code, conformed date snapshotted), issues the period.
6. CSV goes into the claim workbook; the HTML substantiation report is
   printed to PDF and attached to the claim.

## Deployment architecture

Single container (API + prebuilt web UI) + PostgreSQL, composed in
`docker-compose.yml`. TLS terminates at your reverse proxy; only
`/webhooks/procore` needs public reachability (Procore egress), everything
else should sit behind your identity-aware proxy. Horizontal scaling is
unnecessary at civil-project registers' size (thousands of lots); vertical
headroom on the reference 2 vCPU box is large.

## Database schema

`migrations/001_init.sql` — nine tables, documented column-by-column in
[data-dictionary.md](data-dictionary.md). All foreign links to Procore use
Procore's numeric IDs; lot linkage uses the canonical lot ID string.
