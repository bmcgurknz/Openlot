# Backup & disaster recovery

## What to protect

1. **PostgreSQL** — the lot register, claim snapshots, audit trail, and the
   encrypted Procore tokens. This is the only stateful store.
2. **Secrets** — `TOKEN_ENCRYPTION_KEY` above all: backups of the database
   are useless for reconnecting to Procore without it (lots/claims survive
   regardless; only the stored tokens need it).
3. **Configuration** — the `.env` (in your secret manager, not in backups).

Evidence itself (inspections, NCRs, documents) lives in Procore and is
recoverable by full sync; OpenLot's linked projections are re-derivable.
The parts that are **not** re-derivable from Procore: lots themselves, test
records, hold-point releases, claim periods/lines. That is what backups are
really for.

## Backup procedure

```bash
# nightly, retained 35 days, encrypted at rest
docker compose exec -T db pg_dump -U openlot -Fc openlot \
  > backups/openlot-$(date +%F).dump
```

Ship dumps off-host (object storage with encryption + lifecycle rules).
Weekly, verify a dump restores into a scratch database.

## Restore procedure

```bash
docker compose up -d db
docker compose exec -T db pg_restore -U openlot -d openlot --clean --if-exists \
  < backups/openlot-2026-07-06.dump
docker compose up -d app
```

Then: `GET /api/health`, spot-check the register, run
`POST /api/projects/:id/sync` per project to reconcile anything Procore
received during the outage, and re-run `/auth/procore` if the encryption key
changed.

## Disaster scenarios

| Scenario | Recovery |
|---|---|
| App container lost | Stateless — redeploy image, same env |
| Database lost | Restore latest dump; full sync per project; RPO = backup interval (≤24 h), RDO ≈ 30 min |
| Encryption key lost | Data intact; reconnect OAuth (`/auth/procore`) with a fresh key |
| Webhook outage (host down) | Procore retries transiently; nightly full sync closes any remaining gap — no action beyond restoring service |
| Procore-side data change during outage | Full sync reconciles (upsert semantics) |

## RPO / RTO targets

Defaults: RPO 24 h (nightly dump), RTO 1 h. Tighten RPO with WAL archiving
(e.g. wal-g) if a day of register changes is unacceptable on your project.
