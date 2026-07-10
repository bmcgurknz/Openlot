# Gap analysis — why lot management, and what else was considered

This document records the discovery work behind OpenLot: the Procore
capability review, the candidate gaps evaluated, the ranking, and the reason
lot management with conformance-to-claim gating was selected.

## 1. Discovery: Procore capability vs civil workflow

Procore's toolset (Financials, Project Management, Quality & Safety,
Documents, Daily Log, Inspections, Workflows, Reports, Analytics, public
REST API + webhooks) was built around vertical/building construction, where
the organising quality unit is a location (level/room) and the organising
commercial unit is a trade package. Heavy civil work — roads, rail, bridges,
bulk earthworks, utilities, pipelines, subdivisions — organises both quality
and payment around a different primitive:

> **The lot**: one work type + one layer/element + one continuous extent +
> one conformance decision.

Every ANZ authority specification (TMR MRTS50, TfNSW Q6, and their state
equivalents) and most bespoke principal specs require lot-based conformance:
ITP checkpoints per lot, tests per lot, NCRs tracked per lot, and — under
measure-and-value contracts — quantities claimed per conformed lot.

**Procore has no lot object.** There is no register, no lot status, no link
from an inspection or observation to a lot, and no relationship between
conformance and the progress claim. The standard field workaround ("lot
lite") is a naming convention — prefix every inspection, NCR, photo and
daily-log comment with `LOT-EW-0014` — plus a spreadsheet register maintained
by hand.

## 2. Candidate gaps evaluated

| # | Candidate | Existing workflow / pain | Feasible on public APIs? |
|---|---|---|---|
| A | **Lot management & conformance register** | Spreadsheet register; manual weekly reconciliation of inspections/NCRs/tests per lot; manual conformance-to-claim check before every claim | Yes — Inspections (Checklist) API, Observations API, Daily Log API, Webhooks |
| B | Quantity/production tracking against a unit-rate budget (earned m³/day vs budget) | Excel production sheets beside Procore budgets; budget views can expose unit rates but not daily earned quantity | Partially — daily-log quantities exist, but budget write-back is constrained; heavy Financials configuration dependency |
| C | Contractual notice register with response clocks (EOT/latent-condition time bars under AS 2124/AS 4000/GC21/NZS 3910) | Correspondence tool + manual clock tracking in Excel; missed time bars forfeit entitlements | Yes, but Correspondence API coverage is licence-dependent and clause mapping is per-contract |
| D | Chainage/linear location referencing (locations as Ch from–to rather than building levels) | Location tool misused or chainage embedded in free text | No clean path — location model is not extensible enough via public API; would fight the platform |
| E | Plant pre-start / SWMS compliance analytics | Handled acceptably today via Inspections templates + reports | Yes, but low incremental value — largely configuration, already served |

## 3. Ranking

Scored 1–5 (5 best) against the criteria in the brief:

| Criterion | A Lots | B Production | C Notices | D Chainage | E Plant |
|---|---|---|---|---|---|
| Customer demand | 5 | 4 | 4 | 3 | 2 |
| Ease of implementation | 4 | 2 | 3 | 1 | 5 |
| Commercial value | 5 | 4 | 4 | 2 | 2 |
| Engineering effort (inverse) | 4 | 2 | 3 | 1 | 5 |
| Market differentiation | 5 | 3 | 4 | 3 | 1 |
| Scalability across civil segments | 5 | 4 | 4 | 4 | 3 |
| **Total** | **28** | **19** | **22** | **14** | **18** |

## 4. Why A wins

**It sits on the money path.** Under measure-and-value civil contracts, the
monthly claim is substantiated by conformed lots. Every month, on every
project, a project engineer reconciles the spreadsheet register against
Procore records, and a contract administrator decides what is claimable. A
conformance error in either direction is expensive: claiming an unconformed
lot invites certification disputes and payment schedule reductions
(Security-of-Payment exposure); failing to claim a conformed lot is working
capital left on the table.

**The workaround proves the demand.** "Lot lite" — the ID-prefix convention —
is already deployed across civil Procore implementations precisely because
the gap is real. That convention is also the reason this solution needs *no
new field behaviour*: OpenLot parses the IDs teams already type. Adoption
cost on site is zero.

**Market validation.** Dedicated point solutions (CivilPro, CONQA) exist and
win deals against Procore in civil specifically because of this gap — strong
evidence it could become an official Procore feature.

**Technical feasibility is clean.** Inspections, Observations, Daily Logs
and Webhooks are stable, documented public APIs. No undocumented endpoints,
no imports abuse, no Financials write-back complexity (which is what sank B
to second-tier), no platform-fighting (D).

**Runner-up notes.** C (notice register) is a genuine gap and remains a good
future project; it lost on per-contract clause variability (every amended AS
contract shifts the clocks, so the "engine" is mostly configuration) and on
Correspondence licensing dependency. B is high value but couples deeply to
each client's Financials configuration, making a general open-source
deployment much harder to guarantee.

## 5. Impact framing

| Impact | Today (spreadsheet register) | With OpenLot |
|---|---|---|
| Financial | ~0.25–0.5 FTE PE time per project on register upkeep; claim disputes over substantiation; conservative under-claiming | Register maintained by webhooks; gate prevents both over- and under-claiming; substantiation auto-generated |
| Operational | Weekly reconciliation ritual; register drifts from Procore truth | Continuous sync; blockers visible per lot in real time |
| Risk | Conformed-with-open-NCR errors; double claims; lost test evidence at handover | Engine makes those states unrepresentable |
| Compliance | Authority audits require manual evidence assembly | Lot dossier = inspections + NCRs + tests + quantities, one screen / one report |

## 6. Graduation criteria (honest limits)

OpenLot deliberately stops short of a full laboratory-integration QA
platform. Recommend a dedicated tool when any of: >150 live lots
concurrently with heavy multi-user load; the authority mandates electronic
NATA test-request workflows; or conformance reporting still consumes >0.5
FTE. The ID convention transfers as-is — enforcing it from day one is the
migration insurance.
