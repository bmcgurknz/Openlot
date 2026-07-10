# Troubleshooting

## Windows

**`DATABASE_URL is required unless DEMO_MODE=true` when you asked for demo
mode** — the `VAR=value command` prefix is POSIX shell syntax; Windows
ignores it. Use `npm run dev:demo` (cross-platform), or set the variable
first in the same window: `set DEMO_MODE=true` (cmd) /
`$env:DEMO_MODE="true"` (PowerShell), then `npm run dev`.

**`examples/curl-walkthrough.sh` won't run** — it's a bash script. Use
`examples/curl-walkthrough.ps1` in PowerShell, or run the .sh under Git
Bash / WSL.

Everything else — paths, migrations, tsx, vitest, the web build — uses
Node's cross-platform APIs and runs identically on Windows (Node ≥ 20).
Docker Desktop on Windows runs the compose stack unchanged.

## Startup

**"Invalid configuration: TOKEN_ENCRYPTION_KEY"** — must be exactly 64 hex
characters; generate with `openssl rand -hex 32`.

**"Could not locate the migrations directory"** — running a hand-rolled
build layout; keep `migrations/` next to `package.json` (the Docker image
does this for you).

**App exits with a Postgres connection error** — check `DATABASE_URL`, that
the db container is healthy (`docker compose ps`), and network names match.

## OAuth

**Procore shows a redirect_uri mismatch** — the Developer Portal app's
redirect URI must equal `${APP_BASE_URL}/auth/procore/callback` character
for character (scheme, host, path, no trailing slash).

**"State mismatch" on callback** — the browser lost the state cookie:
mixed http/https, or a proxy stripping cookies. Fix `APP_BASE_URL` scheme.

**"Multiple companies — set PROCORE_COMPANY_ID"** — the service user
belongs to several companies; pin the right one in `.env`.

## Webhooks

**Deliveries 401** — `WEBHOOK_SHARED_SECRET` differs between `.env` and the
registered hook. Re-run `POST /api/webhooks/register` after changing it and
remove the stale hook in Procore.

**Records not linking** — check `GET /api/webhooks/events`:
- `ignored_no_lot_id` → the title lacks a recognisable `LOT-XX-NNNN`
  (the parser tolerates case/dashes/padding, not missing IDs).
- `ignored_resource` → a resource OpenLot doesn't consume; harmless.
- `error` → the detail column carries the message; commonly the service
  user lacks read permission on that project's tool.
- Nothing at all → the hook destination is unreachable from Procore; check
  DNS/TLS/proxy on `/webhooks/procore`.

**Linked but wrong lot** — two IDs in one title; the first match wins.
Retitle the record and it relinks on the update webhook.

## Sync

**`POST /api/projects/:id/sync` returns 502** — token refresh failed
(service user password/App approval revoked?) or Procore permission missing.
The log line names the endpoint that failed.

**Sync is slow** — expected on big projects: pagination + 429 back-off.
Run it nightly, not interactively.

## Claims

**"Lot ... already claimed in PC-12"** — by design (single-claim rule). If
PC-12 was a mistake and not yet issued, remove the line there first.

**Conform button disabled with no blockers shown** — refresh the dossier;
if it persists the lot is `open` (must pass through Work complete first).

## Demo mode

Data resets on every restart by design; `DEMO_MODE=true` ignores
`DATABASE_URL` and Procore settings entirely.
