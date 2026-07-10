# User guide

Two people use OpenLot daily: the project engineer (register + conformance)
and the contract administrator (claims). Everyone else reads.

## The register (project engineer)

**Open a lot** when you're about to start a conformable extent of work: pick
the work type, describe the extent with chainage (`Ch 1200–1350 LHS, select
fill layer 2`), add the ITP/spec reference, cost code, and the quantity you
expect to claim. The ID is issued automatically (`LOT-EW-0015`) and is never
reused, even if the lot is later superseded.

**Tell the crew the lot ID.** Everything in Procore titled with it links
itself: inspections, NCRs, daily-log quantity notes. If a record doesn't
appear on the lot, check its title — the webhook audit log (admin guide)
shows records that arrived without a recognisable ID.

**Track tests.** Add each spec-required test (e.g. `Compaction
(AS 1289.5.4.1)`) when you order it, then walk it through sampled → results
received → passed/failed as the lab reports. A test in any state except
`passed` blocks conformance.

**Hold / witness points.** Record the release after the superintendent's
inspection. The button toggles; the audit note records who and when.

**Conform the lot.** The conformance panel shows either "all rules
satisfied" or the exact blockers (failed inspection, open NCR, outstanding
test, unreleased hold point). The Conform button stays disabled until the
list is empty — resolving the list *is* the job. Conforming stamps the date
used on the claim.

**When things go wrong.** An NCR raised after conformance? Revert the lot to
Work complete (allowed, audited), fix, re-conform. Design change killed the
lot? Supersede it, naming the replacement lot; the old ID stays in the
register struck through.

## Claims (contract administrator)

**Create the period** (`PC-14 2026-07`, dates). **The gate view** lists
every lot with a plain-English verdict: ready, not conformed yet, already
claimed in PC-12, or missing quantity/UoM. Add the ready ones — quantity,
UoM, cost code and conformed date are snapshotted so later edits to the lot
can't silently change an issued claim.

**Extracts.** *CSV extract* drops into your claim workbook. *Substantiation
report* is a printable page (print to PDF) listing each lot with its
conformance date and evidence counts — attach it to the claim so the
superintendent's questions are answered before they're asked.

**Issue the claim** when it goes out the door. Issued periods are frozen;
corrections go on the next claim, matching how certified claims work in
practice.

## Reading the register

The five-notch bar on every row is the lot's life: notches fill left to
right through Open → Work complete → Conformed → Closed; green means
conformed or better; a hatched bar is a superseded lot.
