# Upgrade guide

## Standard upgrade (patch/minor)

```bash
docker compose pull        # or: git pull && docker compose build
docker compose up -d       # migrations run automatically at startup
curl -s $APP_BASE_URL/api/health
```

Back up first (backup-and-disaster-recovery.md). Migrations are
forward-only and additive within a major version; downgrading the app
binary after a migration is not supported — restore the pre-upgrade dump
instead.

## Major versions

Read the CHANGELOG "Breaking" section. Known future breakers are tracked in
ROADMAP.md (e.g. 1.3's authentication layer will change deployment posture).

## Procore API drift

Procore evolves endpoint versions independently of OpenLot releases. All
versions are pinned in `src/procore/client.ts`. After any Procore
deprecation notice affecting Checklist Lists, Observations, Daily Log
quantity logs, OAuth, or Webhooks:

1. Check the release notes at developers.procore.com.
2. Run the manual webhook + sync scenarios from docs/testing.md against the
   sandbox.
3. If a bump is needed and no OpenLot release has it yet, the change is
   usually a one-line version constant — PRs welcome.

## After upgrading

- Re-run one full sync per project (cheap insurance).
- If the upgrade notes mention webhook trigger changes, re-run
  `POST /api/webhooks/register`.
