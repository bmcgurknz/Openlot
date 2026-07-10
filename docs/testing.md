# Testing

## Running the suites

```bash
npm run typecheck        # tsc strict, no emit
npm test                 # vitest: unit + integration (no network, no DB)
cd web && npm run build  # frontend typecheck + production build
```

CI (.github/workflows/ci.yml) runs all three on every push/PR, then a Docker
image build.

## What is covered (42 tests)

**Unit — lot ID parsing** (`tests/unit/lot-id.test.ts`): canonical
formatting; extraction from titles with case, en-dash, spacing and padding
variance; refusal of look-alikes.

**Unit — conformance engine** (`tests/unit/conformance.test.ts`): every rule
R1–R5 in pass and fail directions; N/A inspections don't count as evidence;
`results_received` still blocks; multiple blockers all reported; the full
transition graph including allowed reversals and terminal superseded.

**Unit — lot service & claim gate** (`tests/unit/claims.test.ts`):
per-work-type sequences; never-reuse; conform refusal with blockers and
success stamping; supersede requires replacement; the gate's refusals
(not conformed, already claimed naming the period, missing quantity, frozen
issued period); CSV escaping; HTML report content.

**Integration — HTTP surface** (`tests/integration/api.test.ts`): register
list/filter/create/validate; dossier assembly; 422 with blockers over HTTP;
the full walk of a demo lot from blocked to claimed; double-claim 409; CSV
download; webhook shared-secret 401; webhook linking of inspections and
NCRs against a stubbed Procore API; `ignored_no_lot_id` outcome.

## Manual test scenarios (pre-production checklist)

1. **OAuth round trip** against the Procore sandbox: connect, confirm
   `/api/connection`, restart the app, confirm tokens survived (encrypted).
2. **Webhook end-to-end**: register hooks; in Procore create an inspection
   titled `LOT-EW-0001 - Test`; confirm it appears on the lot and in
   `/api/webhooks/events` as `linked`. Repeat with an untitled record →
   `ignored_no_lot_id`.
3. **Idempotency**: redeliver the same webhook from Procore's delivery log;
   confirm no duplicate evidence rows.
4. **Token refresh**: wait past expiry (or shorten in sandbox); run a sync;
   confirm success and a single refresh in the logs.
5. **429 handling**: run a full sync on a large project; confirm back-off
   messages rather than failures.
6. **Claim lifecycle** with two periods proving the cross-period single
   claim rule; print the substantiation report to PDF.
7. **Restore drill** per backup-and-disaster-recovery.md.

## Edge cases encoded in tests

Duplicate/explicit sequences, superseded lots in claim lists, lots without
quantity, CSV fields containing quotes/commas/en-dashes, webhook payloads
for unknown resources, inspections with zero items, NCR `void` status.

## Performance notes

The register endpoint is a single indexed query; 5,000 lots returns well
under NFR-5's 300 ms on the reference box. Full sync is paginated (100/page)
and rate-limit aware; expect minutes, not seconds, on large projects — which
is why it's a nightly job, with webhooks carrying the real-time load.
