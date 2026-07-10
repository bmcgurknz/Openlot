# Deployment checklist

## Before go-live

- [ ] `APP_BASE_URL` is the final HTTPS URL; TLS certificate valid
- [ ] `TOKEN_ENCRYPTION_KEY` and `WEBHOOK_SHARED_SECRET` generated with
      `openssl rand` and stored in the secret manager
- [ ] Postgres provisioned, `DATABASE_URL` correct, app starts and logs
      "migrations applied"
- [ ] UI and `/api/*` unreachable without the identity-aware proxy;
      `/webhooks/procore` reachable from the internet
- [ ] Procore app created; redirect URI matches exactly; company admin
      approved the app (if App Management is enforced)
- [ ] Service user added to all in-scope projects with the read-only
      permission set (docs/procore-setup.md §2)
- [ ] OAuth connected (`GET /api/connection` shows the company)
- [ ] Webhooks registered; test delivery shows `linked` in
      `/api/webhooks/events`
- [ ] Initial full sync run per project; register spot-checked against
      known Procore records
- [ ] Nightly sync cron installed
- [ ] Backups scheduled and **restore rehearsed** (see backup doc)
- [ ] Log shipping configured; alert on repeated webhook `error` outcomes
- [ ] Existing spreadsheet register reconciled or imported (roadmap 1.1 —
      until then, create open lots manually)

## Go-live day

- [ ] Toolbox talk delivered: title convention `LOT-XX-NNNN - <description>`
- [ ] PE and CA walked through the register and claim gate on live data
- [ ] First live inspection titled with a lot ID confirmed auto-linking

## First month

- [ ] Weekly review of `ignored_no_lot_id` events (convention compliance)
- [ ] First progress claim assembled through the gate in parallel with the
      old process, results compared, then old process retired
