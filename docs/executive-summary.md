# Executive summary

## The problem

Civil construction runs on **lots** — discrete, conformable extents of work
(one work type, one layer/element, one continuous extent, one conformance
decision). Authority specifications (TMR MRTS50, TfNSW Q6 and equivalents)
require lot-based quality records, and measure-and-value contracts pay
against **conformed** lots. Procore captures every underlying record —
ITP inspections, NCRs, tests filed in Documents, daily-log quantities — but
has **no lot object**: no register, no lot status, no evidence linking, and
no relationship between conformance and the progress claim.

## Why it exists

Procore's location and quality models grew out of vertical construction
(levels, rooms, trade packages). Civil's organising primitive is linear and
lot-based; no configuration of the existing tools produces a lot register.

## Current workaround

The industry-standard bridge is "lot lite": prefix every Procore record's
title with a lot ID (`LOT-EW-0014 - Subgrade proof roll`) and maintain an
Excel lot register by hand. It works until it doesn't: the register drifts
from Procore truth, conformance is a human judgement made under month-end
pressure, nothing stops a lot with an open NCR being claimed, and nothing
stops a lot being claimed twice.

## Proposed solution

**OpenLot** — a self-hosted open-source application on Procore's public REST
API and webhooks that supplies the missing layer:

1. A database-backed lot register using the exact ID convention teams
   already use (zero new field behaviour).
2. Automatic evidence linking: webhooks parse lot IDs out of inspection and
   observation titles and daily-log quantity notes.
3. A conformance engine — Conformed requires all linked inspections passed,
   zero open NCRs, all tests passed, hold points released.
4. A conformance-to-claim gate — only conformed lots enter a claim period,
   only once, with a generated CSV extract and printable substantiation
   report.

## Expected benefits

- Eliminate the manual register (typically 0.25–0.5 FTE of project-engineer
  time per project) and the pre-claim reconciliation ritual.
- Make invalid states unrepresentable: conformed-with-open-NCR, claimed-
  before-conformed, claimed-twice.
- Faster certification: substantiation attached to the claim, not chased
  after it. On a $30M/yr project claiming ~$2.5M/month, pulling certification
  forward even a few days is a material working-capital gain.
- Handover-ready conformance records per lot.

## Target users

Project engineers (register + evidence), contract administrators (claim
gate + extracts), quality managers (rules + audit trail), superintendents /
principals' representatives (substantiation reports).

## Expected ROI (worked example, stated assumptions)

Assume a mid-tier civil contractor, 6 concurrent projects:

| Item | Assumption | Annual value |
|---|---|---|
| PE register time saved | 0.3 FTE × 6 projects × $140k loaded | ~$250k |
| Claim-dispute avoidance | 1 avoided dispute cycle/yr (legal + delayed cert) | $50–150k |
| Working capital | 3 days' earlier certification on $15M/yr claimed at 8% cost of capital | ~$10k/project |
| Running cost | 1 small VM + Postgres + occasional maintenance | −$5–10k |

Payback is measured in weeks. Every figure above is an assumption to be
replaced with the deployer's own numbers; the mechanism (time, disputes,
working capital) is what generalises.
