# Examples

- `sample-lot-register.csv` — a "lot lite" spreadsheet register in the shape
  most civil teams keep today; the columns map 1:1 to OpenLot lots (and to
  the planned 1.1 register import).
- `webhooks/` — real-shaped Procore webhook delivery payloads for local
  testing against `POST /webhooks/procore`.
- `curl-walkthrough.sh` (bash) and `curl-walkthrough.ps1` (Windows
  PowerShell) — scripted end-to-end lifecycle against a demo-mode instance:
  create a lot → see blockers → resolve them → conform → claim → extract.
  Start the server with `npm run dev:demo` first.
