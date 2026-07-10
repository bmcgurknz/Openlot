# Roadmap

Direction, not commitment. Items move based on operator feedback.

## 1.1 — Register depth
- Photo linking (Procore photo captions carrying lot IDs)
- Documents-tool linking for NATA certificates (`Quality/Lots/[LOT-ID]/`)
- Lot register CSV import (migrate an existing "lot lite" spreadsheet in one step)
- Bulk lot creation from a chainage schedule

## 1.2 — Claim workflow
- Push claim lines to Procore budget/change-event line items via API
- Superintendent read-only substantiation portal link
- Daily-log quantity vs lot quantity variance report (reconciliation R4)

## 1.3 — Scale & governance
- Role-based access (PE edit / CA claim / viewer) behind OIDC
- Multi-project dashboards and >150-live-lot performance work
- Scheduled nightly pull-sync worker with drift report

## Explicit non-goals
- Electronic NATA test-request workflow with laboratories (graduate to a
  dedicated lot-QA platform when an authority requires it)
- Replacing Procore inspections/observations — OpenLot links, never forks,
  the source of truth
