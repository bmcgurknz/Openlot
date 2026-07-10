## STATUS UPDATE (2026-07-10): all 7 items below are now implemented

Picked back up in a later session and completed the full v1.3 scope: the
6 typecheck errors, history wiring into LotService/ClaimService, the
History/Activity tab, register column sorting, claim creator/timestamp
surfacing, the full import wizard (`src/lib/import/` + `#/import`), and
`docs/v1.3-enhancements.md`. See the CHANGELOG's `[1.3.0]` entry and that
doc for the details. `npm install && npm run typecheck && npm test` could
not be executed in that session (sandboxed shell had no virtualization
available) — reviewed by hand instead; **run those commands before
release** to confirm. The original handoff notes are kept below for
history.

# HANDOFF NOTES — read this first

This project was mid-enhancement when it was packaged for transfer to
another Claude account/device. **The code does not currently typecheck.**
Give this file to the new Claude session first — paste its contents or
just say "read HANDOFF.md and continue" — so it has full context instead
of guessing from the code alone.

## What was being built (v1.3, not yet released)

The user asked for five enhancements on top of the shipped v1.2
(Procore OpenLot, dual server/static edition, ATS 1120 aligned):

1. **Lot Register**: add `Date Created` (auto-populated, shown in table,
   in exports); make every column sortable (asc/desc/default toggle),
   including custom fields.
2. **Progress Claims**: add `Date Created` + creator user + timestamp;
   flow through to substantiation reports, PDF/Excel exports, all
   reporting views.
3. **Lot Change History**: a read-only, newest-first audit trail per lot
   (History/Activity tab) recording who changed what field, from what
   value, to what value, and when — for status changes, builder/owner
   updates, claim creation/approval, attachment uploads, notes.
4. **Bulk import from Procore exports**: a guided wizard (upload → detect
   format → validate → preview → resolve issues → confirm → summary)
   supporting CSV and XLSX, with automatic + manual field mapping,
   duplicate detection, and create-or-update semantics.
5. **Documentation**: schema changes, audit implementation, sorting
   implementation, import architecture, field mapping spec, future
   Procore API integration path, scalability notes.

Also: the register/claim requirements imply lot fields that didn't exist
yet — `builder`, `stage`, `owner` — added as first-class optional lot
fields (fits the subdivision/civil context of the existing data model).

## What's actually done vs stubbed right now

**Done and consistent:**
- `src/types.ts` — `Lot` gained `builder`, `stage`, `owner`, `createdAt`;
  `ClaimPeriod` gained `createdBy`; new `LotHistoryEntry` interface added.
- `migrations/003_history_and_provenance.sql` — new columns + a
  `lot_history` table. Not yet run against any real database (dev only
  used MemoryRepository/demo mode so far).
- `src/db/repository.ts` — `Repository` interface extended with
  `appendHistory` / `listHistory`; `MemoryRepository` fully implements
  both, plus `snapshot()`/`load()` updated to carry history.
- `src/services/lots.ts`, `src/services/claims.ts`, `src/services/demo.ts`,
  `tests/fixtures.ts` — constructors updated for the new fields.

**Broken / not started (the 6 typecheck errors below):**
- `src/db/pg-repository.ts` (the production Postgres repo) does **not**
  yet implement `appendHistory`/`listHistory` — I added the SQL methods in
  one edit but they may not have landed inside the class body correctly
  (there was a duplicate-property slip I just fixed in an unrelated spot —
  re-check this file carefully before trusting it).
- `LotHistoryEntry` needs to be **exported** from `src/db/repository.ts`
  (or imported directly from `types.ts` instead) — `lots.ts` currently
  imports it from the wrong module.
- No service method yet actually **writes** a history entry anywhere
  (e.g. `LotService.transition()` should call `repo.appendHistory(...)`
  whenever status/builder/owner/notes change — this is the core of
  requirement #3 and hasn't been wired in yet).
- `scripts/seed.ts` fails because `PgRepository` doesn't satisfy the
  updated `Repository` interface (same root cause as above).
- `src/services/demo.ts` line ~241: a `ClaimPeriod` literal is missing
  `createdBy`.
- Nothing yet built for: sortable register columns (frontend), claim
  creator/timestamp display in the UI, the History/Activity tab UI, the
  entire import wizard (CSV/XLSX parsing, format detection, field mapping,
  preview, validation, duplicate detection), or the new documentation
  files requested in point 5.

## Suggested order to resume

1. Fix the 6 typecheck errors above first (`npm run typecheck` from repo
   root) — get back to a green baseline before adding anything new.
2. Wire history-writing into `LotService` (status transitions, hold point
   release/reinstate, bounds redefinition already appends a notes-string —
   convert that pattern to real history entries) and `ClaimService`
   (period created/lot added/issued).
3. Add the History/Activity tab to `web/src/pages/LotDetailPage.tsx`.
4. Add column sorting to `web/src/pages/RegisterPage.tsx` (client-side
   `Array.prototype.sort` over the existing `lots` array — no backend
   change needed since the full list is already fetched).
5. Surface claim creator/timestamp in `web/src/pages/ClaimsPage.tsx` and
   in `src/services/claims.ts` extractCsv/extractHtml.
6. Build the import wizard last — it's the largest single piece. Suggest
   a new `web/src/pages/ImportWizardPage.tsx` plus a `src/lib/import/`
   module (CSV parsing already exists in `web/src/local.ts`
   `importRegisterCsv` / `parseCsv` — generalise that rather than
   rewriting it; add an `xlsx` parser using SheetJS, already an approved
   library in this environment for artifacts, but need to add it as a
   real npm dependency here since this is a Node/Vite project, not an
   artifact).
7. Write the five documentation files last, once the implementation is
   real — don't document vapourware.

## Where everything lives

Full repo structure, architecture, ATS 1120 compliance matrix, and prior
release history are all in this same zip under `docs/` and
`CHANGELOG.md` — that's a better source of truth for "what already
exists" than re-deriving it. In particular read, in this order:
`README.md` → `docs/architecture.md` → `docs/ats-1120-compliance.md` →
`CHANGELOG.md` (bottom to top for chronological history) → this file.

## Verifying you're back on solid ground

```bash
npm install
npm run typecheck   # must be clean before adding new features
npm test            # 50 tests should pass (as of v1.2.0)
cd web && npm install && npm run build && npm run build:static
```
