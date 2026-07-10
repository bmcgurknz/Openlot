# Data dictionary

Schema source of truth: `migrations/001_init.sql`. Times are UTC
timestamptz unless noted; dates (`date`) are project-local calendar dates.

## lots (PK: project_id, id)

| Column | Type | Meaning |
|---|---|---|
| project_id | bigint | Procore project ID |
| id | text | Canonical lot ID `LOT-[WT]-[NNNN]` |
| description | text | Extent — include chainage/side/layer |
| work_type | text | 2-letter code (EW, SW, SE, WA, PV, CO, KF, LS, RA, MA, TM) |
| spec_reference | text? | ITP / spec clause (e.g. `ITP-EW-01 / MRTS04 cl 9.2`) |
| cost_code | text? | Cost code the quantity claims against |
| quantity / uom | numeric? / text? | Claimable quantity and unit (m3, m2, lm, ea, t) |
| status | text | open · work_complete · conformed · closed · superseded |
| opened_at / work_complete_at / conformed_at / closed_at | date | Lifecycle stamps; conformed_at feeds the claim |
| superseded_by | text? | Replacement lot ID (required when superseded) |
| hold_point_released | boolean | Superintendent release recorded |
| hold_point_released_by | text? | The Principal's authorised person who released (ATS 1120 cl 11.6) |
| hold_point_released_at | date? | Date of release (cl 11.1) |
| payment_item_number | text? | Payment schedule item applicable to the lot (cl 10.1(e)) |
| geo_start / geo_end | text? | Start/end latitude,longitude in decimal degrees — required for PV lots (cl 10.4) |
| geo_datum | text? | Datum, e.g. GDA2020 (cl 10.4) |
| notes | text? | Free text; audit notes appended here |
| builder | text? | Builder/purchaser assigned to the lot (subdivision context) |
| stage | text? | Delivery stage, e.g. "Stage 2" |
| owner | text? | Lot owner |
| created_by | text | Creator label |
| created_at | timestamptz | When the lot record was created (v1.3; defaults to `now()`, backfilled to `now()` for pre-existing rows by migration `003`) |
| updated_at | timestamptz | Last write |

## linked_inspections (PK: procore_id)

Projection of a Procore Checklist List. Columns: procore_id, lot_id,
project_id, title, template_name, status (open · in_progress · passed ·
failed · not_applicable — mapped from Procore statuses + item counts),
inspection_date, items_total/items_passed/items_failed, updated_at.

## linked_ncrs (PK: procore_id)

Projection of a Procore Observation of type Non-Conformance. Columns:
procore_id, lot_id, project_id, title, status (open · ready_for_review ·
closed · void — mapped from initiated/ready_for_review/closed/not_accepted),
created_at, closed_at, updated_at.

## test_records (PK: id uuid)

OpenLot-native lab/test tracking. Columns: id, lot_id, project_id,
test_type, lab_reference, status (requested · sampled · results_received ·
passed · failed), requested_at, result_at, document_url (link to the NATA
certificate in Procore Documents), notes, updated_at.

## quantity_entries (PK: id uuid)

Source `daily_log` (synced, procore_id kept for idempotency) or `manual`.
Columns: id, lot_id, project_id, source, procore_id?, date, quantity, uom,
notes, updated_at.

## claim_periods (PK: id uuid)

label (unique per project), period_start, period_end, status (open · issued
· certified), created_at, created_by? (v1.3 — who created the claim period;
flows through to the substantiation CSV/HTML extracts), issued_at.

## claim_lines (PK: id uuid; UNIQUE claim_period_id+lot_id)

Snapshot at claim time: lot_id, project_id, quantity, uom, cost_code,
conformed_at, created_at (when the lot was added to the claim). Cross-period
single-claim is enforced in ClaimService (a lot appears in at most one
period, ever).

## lot_history (PK: id uuid) — v1.3

Read-only, append-only audit trail per lot, newest-first. Columns:
project_id, lot_id, at (timestamptz), user (free-text actor label — the
app has no login system, so this is whatever name/role was supplied at
the time), field (e.g. "Status", "Builder", "Hold point", "Progress
claim"), previous_value?, new_value?. Indexed on
`(project_id, lot_id, at desc)`. Never updated or deleted; see
[v1.3-enhancements.md](v1.3-enhancements.md) for what writes to it and why
`notes`-string audit trails from earlier versions were kept rather than
migrated.

## procore_connections (PK: company_id)

company_name, access_token_enc / refresh_token_enc (AES-256-GCM,
`iv:tag:ciphertext` base64), expires_at, created_at, updated_at. One row.

## webhook_events (PK: id bigserial)

received_at, resource_name, event_type, procore_resource_id, project_id,
outcome (linked · ignored_no_lot_id · ignored_resource · error), lot_id?,
detail (message / payload snippet). Append-only audit.

## schema_migrations

filename + applied_at; forward-only runner.
