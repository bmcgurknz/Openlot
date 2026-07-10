# Security

## Trust model

- **Procore** is the identity provider for the integration (OAuth 2.0
  authorization code) and the source of truth for quality records.
- **OpenLot** is deployed inside the contractor's perimeter. v1 has **no
  built-in end-user authentication**; access control is delegated to the
  network layer. This is a deliberate v1 scope decision (roadmap 1.3 adds
  OIDC RBAC) — do not expose the UI/API publicly.

## Required deployment posture

1. TLS everywhere (reverse proxy terminates; `APP_BASE_URL` is https).
2. UI and `/api/*` behind an identity-aware proxy (Cloudflare Access,
   Tailscale, VPN, ALB+OIDC) restricted to project staff.
3. Only `POST /webhooks/procore` reachable from the internet (Procore
   egress). It authenticates deliveries with the `X-OpenLot-Webhook-Secret`
   header; unauthenticated or wrong-secret requests get 401 and are not
   processed.
4. Database not exposed beyond the app network.

## Secrets

| Secret | Handling |
|---|---|
| `TOKEN_ENCRYPTION_KEY` | 32-byte AES-256-GCM key; secret store only; rotation invalidates stored tokens (reconnect afterwards) |
| Procore client secret | Secret store; rotate via Developer Portal, update env, restart |
| `WEBHOOK_SHARED_SECRET` | Rotate by updating env, re-running `/api/webhooks/register`, and deleting the old hook in Procore |
| OAuth tokens | Encrypted at rest; decrypted only in memory per request; never logged |

## Application controls

- OAuth `state` parameter with an HttpOnly, SameSite=Lax cookie —
  CSRF protection on the callback.
- All input validated with zod schemas before touching services.
- SQL exclusively via parameterised queries (`pg`).
- Webhook ingestion is idempotent; replays cannot duplicate evidence.
- The claim gate and status graph make the dangerous states
  (claim-before-conform, double claim, conform-with-open-NCR)
  unrepresentable rather than merely discouraged.
- Error responses never include stack traces or upstream tokens.

## Data classification

Lot descriptions, quantities and claim data are commercially sensitive.
Backups inherit that classification — encrypt them (see
backup-and-disaster-recovery.md). Webhook audit rows may embed record
titles; apply your retention policy.

## Reporting

See [SECURITY.md](../SECURITY.md) at the repository root.
