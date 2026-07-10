# Installation

## Prerequisites

- Docker + Docker Compose (recommended), or Node.js ≥ 20 and PostgreSQL ≥ 14
- A Procore Developer Portal account and permission to create a company-level
  app (see [procore-setup.md](procore-setup.md))
- A public HTTPS URL for the instance (Procore webhooks and OAuth require it)

## Option A — Docker Compose (recommended)

```bash
git clone https://github.com/your-org/openlot.git
cd openlot
cp .env.example .env
openssl rand -hex 32   # → TOKEN_ENCRYPTION_KEY
openssl rand -hex 24   # → WEBHOOK_SHARED_SECRET
# edit .env: APP_BASE_URL, POSTGRES_PASSWORD, PROCORE_CLIENT_ID/SECRET
docker compose up -d --build
docker compose logs -f app   # wait for "OpenLot listening"
```

Migrations run automatically at startup. Put your TLS proxy in front of
port 4400 and set `APP_BASE_URL` to the public URL **before** creating the
Procore app (the OAuth redirect URI must match exactly).

## Option B — Bare Node

```bash
npm install
cd web && npm install && npm run build && cd ..
cp .env.example .env && $EDITOR .env
npm run migrate
npm run build
node dist/src/index.js
```

## Option C — Demo mode (no Procore, no database)

```bash
npm install
npm run dev:demo
```

`dev:demo` uses cross-env, so the same command works in Windows Command
Prompt, PowerShell, macOS and Linux. (The long form `DEMO_MODE=true npm run
dev` is POSIX-only; on Windows use `set DEMO_MODE=true` then `npm run dev`,
or just use `dev:demo`.)

Optional sample data into a real database instead: `npm run seed`.

## Post-install

1. Browse to `APP_BASE_URL` — the register loads (empty outside demo mode).
2. Connect Procore: visit `APP_BASE_URL/auth/procore`, approve the app.
3. Register webhooks: `curl -X POST $APP_BASE_URL/api/webhooks/register`.
4. Backfill a project: `curl -X POST $APP_BASE_URL/api/projects/<procore-project-id>/sync`.
5. Schedule the nightly sync (cron/systemd timer) per project.
6. Work through [deployment-checklist.md](deployment-checklist.md).
