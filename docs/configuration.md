# Configuration

All configuration is environment variables, validated at startup with zod —
misconfiguration fails fast with the exact variable named.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | no | development | Standard Node environment |
| `PORT` / `HOST` | no | 4400 / 0.0.0.0 | Listen address |
| `APP_BASE_URL` | yes (prod) | http://localhost:4400 | Public URL; OAuth redirect (`/auth/procore/callback`) and webhook destination (`/webhooks/procore`) are derived from it. Must match the Procore app's redirect URI exactly. |
| `DATABASE_URL` | yes unless demo | — | PostgreSQL connection string |
| `DEMO_MODE` | no | false | In-memory repository + Kestrel Ridge sample data; no Procore, nothing persists |
| `PROCORE_CLIENT_ID` / `PROCORE_CLIENT_SECRET` | yes for Procore | — | From your Developer Portal app |
| `PROCORE_BASE_URL` | no | https://api.procore.com | Use the sandbox URL against a sandbox company |
| `PROCORE_LOGIN_URL` | no | https://login.procore.com | Sandbox login URL when testing |
| `PROCORE_COMPANY_ID` | no | — | Pin the company when the OAuth user can access several |
| `WEBHOOK_SHARED_SECRET` | strongly recommended | — | Value OpenLot demands in the `X-OpenLot-Webhook-Secret` header of webhook deliveries; configured onto the hook at registration |
| `TOKEN_ENCRYPTION_KEY` | yes unless demo | — | 64 hex chars; AES-256-GCM key for OAuth tokens at rest. Rotating it invalidates the stored connection — reconnect afterwards. |

Frontend build-time variable: `VITE_PROJECT_ID` (default 316) selects the
Procore project the UI operates on; multi-project switching is on the
roadmap. Rebuild `web/` after changing it.

Secrets belong in your secret manager (Docker/K8s secrets, SSM, Vault) —
never in the image or the repository.
