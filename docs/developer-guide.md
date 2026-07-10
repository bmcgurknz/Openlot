# Developer guide

## Layout

```
src/
  config.ts            env → typed config (zod)
  types.ts             domain types (single source)
  lib/lot-id.ts        canonical ID + fuzzy in-text extraction
  lib/crypto.ts        AES-256-GCM token encryption
  db/repository.ts     Repository interface + MemoryRepository
  db/pg-repository.ts  PostgreSQL implementation
  db/migrate.ts        forward-only SQL runner (also a CLI)
  procore/client.ts    OAuth + REST client (versions live here)
  services/conformance.ts  pure rules engine + transition graph
  services/lots.ts     LotService (sequences, transitions, tests)
  services/claims.ts   ClaimService (the gate, extracts)
  services/sync.ts     webhooks + full pull sync
  services/demo.ts     Kestrel Ridge sample data
  server.ts            Fastify routes (buildApp — injectable for tests)
  index.ts             entrypoint (wires repo/migrations/demo)
web/                   React UI (dependency-free hash routing)
tests/                 vitest unit + integration
migrations/            numbered SQL, applied in order, never edited
```

## Local loop

```bash
npm install
DEMO_MODE=true npm run dev          # API on :4400 with sample data
cd web && npm install && npm run dev # UI on :5173, proxied to :4400
npm run typecheck && npm test
```

Against a real database: `docker run -e POSTGRES_PASSWORD=dev -p 5432:5432
postgres:16-alpine`, set `DATABASE_URL`, `npm run migrate`, `npm run seed`.

## Adding things

**A conformance rule**: implement in `evaluateConformance()` with a new
blocker code, add pass+fail unit tests, document the code in
api-reference.md, and state the contractual basis in the PR (see
CONTRIBUTING.md — rules are contractual).

**A Procore resource**: add the typed call to `procore/client.ts` (note the
endpoint version), handle it in `SyncService.handleWebhook`/`fullSync` with
an idempotent upsert, extend the webhook trigger registration, and add an
integration test with a stubbed fetch (see `stubFetch` in
`tests/integration/api.test.ts`).

**A migration**: next number (`002_*.sql`), forward-only, additive where
possible; update data-dictionary.md.

**UI work**: no new runtime dependencies without discussion — the register
must stay fast on site laptops over site internet. The visual language
(drawing-sheet palette, mono for data, the five-notch lot bar) is defined in
`web/src/styles.css`; extend it rather than importing a component library.

## Testing philosophy

Business rules live in pure functions and are unit-tested exhaustively;
HTTP behaviour is integration-tested via `app.inject` with
`MemoryRepository`; Procore is always stubbed (`stubFetch`). Nothing in
`npm test` touches the network or a database, so the suite runs anywhere in
seconds.
