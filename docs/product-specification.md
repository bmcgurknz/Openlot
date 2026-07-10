# Product specification

## 1. Functional requirements

| ID | Requirement |
|---|---|
| FR-1 | Users can create lots with work type, description (chainage/extent), spec/ITP reference, cost code, quantity and UoM. Lot IDs follow `LOT-[WT]-[NNNN]`, sequences auto-increment per work type per project and are never reused. |
| FR-2 | Lots move through Open → Work complete → Conformed → Closed; Superseded is terminal and requires the replacement lot ID. Illegal transitions are refused with the allowed next states. |
| FR-3 | The transition to Conformed is refused while any conformance rule fails; refusals enumerate every blocker (rule, message, record reference). |
| FR-4 | Conformance rules: (R1) ≥1 linked ITP inspection and all linked inspections passed or N/A; (R2) zero NCRs in open/ready-for-review; (R3) every test record passed; (R4) hold/witness point released; (R5) lot not superseded/closed. |
| FR-5 | Procore inspections (Checklist Lists) and observations of type Non-Conformance are linked automatically to lots when their titles contain a lot ID, via webhooks (create/update) and on-demand full sync. |
| FR-6 | Daily-log quantity entries whose notes contain a lot ID are linked as lot quantities during full sync. |
| FR-7 | Users can record test requests per lot and progress them (requested → sampled → results received → passed/failed). |
| FR-8 | Users can create claim periods; only conformed (or closed) lots with quantity+UoM that have never been claimed can be added; issued periods are frozen. |
| FR-9 | Claim extracts are generated as CSV and printable HTML substantiation reports. |
| FR-10 | Every webhook delivery is logged with its outcome (linked / ignored-no-lot-id / ignored-resource / error) for audit. |
| FR-11 | Administrators can connect one Procore company via OAuth 2.0 and register the required webhook hook + triggers from within the app. |
| FR-12 | Demo mode runs the entire application against in-memory sample data with no external dependencies. |

## 2. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 | Only documented Procore public REST endpoints; versions recorded in `src/procore/client.ts`. |
| NFR-2 | Webhook ingestion is idempotent (at-least-once delivery safe). |
| NFR-3 | OAuth tokens encrypted at rest (AES-256-GCM); no tokens or secrets in logs. |
| NFR-4 | Webhook endpoint acknowledges within Procore's delivery timeout under normal load; single-record ingestion ≤ 2 API round-trips. |
| NFR-5 | Register operations respond < 300 ms at 5,000 lots/project on the reference deployment (2 vCPU / 4 GB / local Postgres). |
| NFR-6 | Forward-only SQL migrations; upgrades never require manual schema surgery. |
| NFR-7 | All business rules covered by automated tests runnable without network or database. |

## 3. User stories & acceptance criteria

**US-1 — Project engineer opens a lot.**
*As a PE I open `LOT-EW-0015` for Ch 1350–1500 select fill so quality records accumulate against it.*
AC: given work type EW with existing lots to 0014, when I create a lot, then its ID is LOT-EW-0015, status Open, and it appears in the register. Creating with an explicit, already-used sequence is refused with "never reused".

**US-2 — Field records link themselves.**
*As a PE, when the foreman's inspection "LOT-EW-0015 - Subgrade proof roll" is closed in Procore, I see it on the lot without touching OpenLot.*
AC: given a registered webhook, when the inspection updates, then within one delivery the lot dossier shows the inspection with pass/fail counts, and the webhook audit log records outcome `linked`. Titles without a recognisable lot ID log `ignored_no_lot_id` and change nothing.

**US-3 — Conformance is earned, not asserted.**
*As a QM I need "Conformed" to be impossible while evidence is incomplete.*
AC: with a failed inspection and an open NCR, the conform action returns 422 listing both blockers; after the inspection passes, the NCR closes, tests pass and the hold point is released, the same action succeeds and stamps the conformed date.

**US-4 — CA builds the claim from the gate.**
*As a CA I add lots to PC-14 knowing each is conformed and unclaimed.*
AC: a work-complete lot is refused ("Only conformed lots…"); a lot claimed in PC-13 is refused naming PC-13; a conformed unclaimed lot is added with quantity/UoM/conformed-date snapshotted; issuing PC-14 freezes it; the CSV and HTML extracts list exactly the claim's lots.

**US-5 — Superseding after a design change.**
AC: superseding without a replacement ID is refused; a superseded lot is excluded from claimable lists and cannot be conformed.

## 4. Workflow

```
                    Procore (source of truth)
   Inspections   Observations(NCR)   Daily Log Qty    Documents(tests)
        │                │                 │               (manual link)
        └── webhook ─────┴── webhook ──────┴── pull sync ──────┐
                              ▼                                │
                    ┌──────────────────┐                       │
                    │  Lot ID parser    │  "LOT-EW-0014 ..."   │
                    └────────┬─────────┘                       │
                             ▼                                 ▼
   Open ──► Work complete ──►(conformance engine R1–R5)──► Conformed ──► Closed
                     ▲                │ blockers listed        │
                     └── revert (NCR raised post-conformance)  ▼
                                              Claim period (gate: conformed,
                                              once only) ──► CSV + HTML extract
```

## 5. Data model

See `migrations/001_init.sql` and [data-dictionary.md](data-dictionary.md).
Entities: lots, linked_inspections, linked_ncrs, test_records,
quantity_entries, claim_periods, claim_lines, procore_connections,
webhook_events. Lots are keyed (project_id, id); claim_lines are unique per
(claim_period_id, lot_id) with the cross-period single-claim rule enforced in
the service layer.

## 6. Permissions

v1 model: OpenLot runs behind the deployer's network-level identity layer
(see security.md); all authenticated users have PE/CA capability. The
Procore service account used for OAuth needs read access to Inspections,
Observations, Daily Log and Directory on in-scope projects, plus company
Webhooks administration to register hooks. Role separation inside OpenLot is
on the roadmap (1.3).

## 7. API interactions (Procore)

| Purpose | Endpoint | Notes |
|---|---|---|
| OAuth | `login.procore.com/oauth/authorize`, `/oauth/token` | Authorization code + refresh |
| Companies/projects | `GET /rest/v1.0/companies`, `GET /rest/v1.0/projects` | company header on MPZ |
| Inspections | `GET /rest/v1.1/projects/{id}/checklist/lists[/{listId}]` | title, status, item counts |
| Observations | `GET /rest/v1.0/observations/items[/{id}]` | filtered to type Non-Conformance |
| Daily log qty | `GET /rest/v1.0/projects/{id}/daily_logs/quantity_logs` | notes carry lot IDs |
| Webhooks | `POST /rest/v1.0/webhooks/hooks`, `.../triggers` | Checklist Lists + Observations, create/update |

## 8. Security, performance, limitations

Security: [security.md](security.md). Performance: NFR-4/5 plus 429
Retry-After back-off in the client. Limitations, stated plainly:

- One Procore company per deployment (multi-company = multiple deployments).
- Photos and Documents linking is roadmap (1.1); tests are tracked in
  OpenLot with an optional URL to the Procore document.
- Quantity webhooks are not registered by default (daily-log webhook volume
  is high); quantities arrive via full sync — run it nightly.
- Procore endpoint versions drift; the client centralises them and the
  upgrade guide covers re-verification.
- No built-in user auth in v1 — deploy behind an identity-aware proxy.
