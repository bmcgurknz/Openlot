# Templates

- `claim-substantiation.html` — an annotated copy of the substantiation
  report layout the server generates (`src/services/claims.ts →
  extractHtml`). To rebrand: edit the header block (company name, logo,
  contract number) in that function; the report is deliberately
  dependency-free HTML+CSS so it prints identically everywhere.
- The lot register spreadsheet template is `examples/sample-lot-register.csv`
  with the data rows removed — the same columns OpenLot uses.
