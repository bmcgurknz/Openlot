# Administrator guide

## Day-to-day

- **Connection status**: `GET /api/connection` (also shown in the UI header).
- **Webhook audit**: `GET /api/webhooks/events?limit=100` — every delivery
  with outcome `linked`, `ignored_no_lot_id`, `ignored_resource`, or `error`.
  A run of `ignored_no_lot_id` means the field convention is slipping; the
  payload snippet shows which records.
- **Full sync**: `POST /api/projects/:procoreProjectId/sync` backfills and
  reconciles inspections, NCRs and daily-log quantities. Schedule nightly:

```cron
15 2 * * * curl -s -X POST https://openlot.internal/api/projects/316/sync
```

## Managing the connection

One Procore company per deployment. Re-running `/auth/procore` replaces the
stored tokens (e.g. after rotating the service account). Rotating
`TOKEN_ENCRYPTION_KEY` invalidates stored tokens by design — reconnect after.

## Webhooks

`POST /api/webhooks/register` is idempotent per destination URL. If you
change `APP_BASE_URL`, register again and delete the stale hook in Procore
(Company Admin → Webhooks). Deliveries failing repeatedly? Check the shared
secret matches and that your proxy passes `/webhooks/procore` through
without auth.

## Data hygiene

- Superseded lots are kept forever (audit trail).
- The claim gate's snapshot columns mean deleting a lot after claiming is
  refused; close it instead.
- `webhook_events` grows unbounded by design; archive rows older than your
  retention policy with a scheduled `DELETE ... WHERE received_at < now() -
  interval '18 months'` if desired.

## Monitoring

- Liveness: `GET /api/health` (used by the Docker healthcheck).
- Logs are JSON on stdout (Fastify/pino) — ship them to your aggregator.
  Webhook errors log at `error` with the Procore resource ID; OAuth refresh
  failures log at `error` and will surface as 502s on sync endpoints.
