# Procore Enterprise import files

Procore-ready configuration that standardises the lot field convention and
gives quality teams civil-appropriate templates on day one. Import formats
change periodically — **verify column layouts against the current templates
in the Procore support portal (or with your Procore implementation
contact) before submitting**.

| Folder | Contents | Where it goes in Procore |
|---|---|---|
| `inspection-templates/` | Three civil ITP inspection templates (earthworks, stormwater drainage, concrete structures) | Company Admin → Inspections → Templates (bulk import via your Procore contact) |
| `custom-fields/` | "Lot ID" custom field + fieldset for Observations | Company Admin → Custom Fields → Observations |
| `cost-codes/` | Quantity-bearing civil cost-code excerpt | Company Admin → Cost Codes import |

Conventions baked in:

- Every inspection template's first item reminds the inspector to title the
  inspection `LOT-XX-NNNN - <name>` — the link into OpenLot.
- Response types use Procore's standard set (Pass/Fail, Text, Number, Date).
- Hold/witness points appear as explicit checklist items so the release is
  evidenced inside Procore as well as recorded in OpenLot.
- Spec references are TMR MRTS-style examples; swap for your authority's
  clauses (TfNSW, DoT VIC, NZTA…) before rollout.
