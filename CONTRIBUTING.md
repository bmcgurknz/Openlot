# Contributing to OpenLot

Thanks for helping. OpenLot underpins progress-claim substantiation on real
contracts, so the bar for correctness is higher than for a typical web app.

## Ground rules

1. **Conformance rules are contractual, not stylistic.** Changes to
   `src/services/conformance.ts` or the claim gate in
   `src/services/claims.ts` must cite the spec/contract basis in the PR
   description and include tests for both the allowed and refused paths.
2. **The lot ID convention is frozen.** `LOT-[WT]-[NNNN]` is deliberately
   identical to the field convention many contractors already use in
   Procore. Additions to the work-type list are fine; format changes are a
   breaking change requiring a major version.
3. **Only documented Procore APIs.** No undocumented endpoints, no scraping.
   New endpoints go through `src/procore/client.ts` with the version noted.
4. **Every ingestion path must be idempotent.** Webhooks are at-least-once.

## Workflow

```bash
npm install
npm run typecheck && npm test      # must pass before you open a PR
cd web && npm install && npm run build
```

- Branch from `main`, one logical change per PR.
- New behaviour ships with tests (`tests/unit` for pure logic,
  `tests/integration` for HTTP surface — use `MemoryRepository`).
- Run the demo (`DEMO_MODE=true npm run dev`) and sanity-check the UI when
  your change is user-visible.
- Keep documentation in `/docs` in step with behaviour; a PR that changes
  configuration must update `docs/configuration.md` and `.env.example`.

## Reporting security issues

Do not open a public issue — see [SECURITY.md](SECURITY.md).

## Code style

TypeScript strict mode, ES modules, no default exports for services,
repository pattern for persistence. Prefer explicit, readable code over
cleverness; comments explain *why* (contract/spec context) rather than *what*.
