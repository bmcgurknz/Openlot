# ATS 1120 compliance matrix

How Procore OpenLot supports a Contractor's compliance with **Austroads
Technical Specification ATS 1120 — Quality Management Requirements**
(May 2021 edition; superseded — check the current Austroads edition for
your contract and re-verify this matrix against it).

Two honest framings up front. First, ATS 1120 places obligations on the
*Contractor's Quality Management System as a whole* (AS/NZS ISO 9001 plus
the specification); software is one component of that system, not the
system. Second, the matrix below distinguishes what OpenLot **enforces in
code**, what it **records**, and what remains a **procedural obligation**
the Contractor's QMS must cover outside the tool.

## Clause 10 — Product Identification and Traceability (Lot Management)

| Clause | Requirement | OpenLot |
|---|---|---|
| 10.1(a) | Each Lot identified on Site, identification recorded | **Enforced.** Canonical `LOT-[WT]-[NNNN]` IDs, issued once, never reused; same convention used to title Procore records on site. |
| 10.1(b) | Measurements/quantities recorded per Lot | **Recorded.** Lot quantity + UoM, plus daily-log quantity entries linked by lot ID. |
| 10.1(c) | Part/serial numbers of manufactured items | **Procedural.** Record in the lot notes or the linked Procore inspection items; OpenLot does not model serialised items in v1. |
| 10.1(d) | Compatible with a WBS / Principal's asset system | **Recorded.** Cost code per lot; map cost codes to the Principal's WBS in the imports pack. |
| 10.1(e) | Identifies the payment schedule item applicable to the Lot | **Enforced field.** `paymentItemNumber` on every lot; carried onto claim lines and both extracts. |
| 10.1(f) | Identifies all Records associated with the Lot | **Recorded.** The lot dossier links inspections (Procore IDs), NCRs, test records (lab references, certificate URLs) and quantity entries. |
| 10.1(g) | Records Lot status including NCRs | **Enforced.** Five-state lifecycle plus live NCR linkage; open NCRs block conformance. |
| 10.1(h) | Notifies the Principal a Lot is ready to be closed | **Supported.** Conformed status + the substantiation report constitute the notification artifact; issuing/sending it is procedural. |
| 10.2 | Bounds predetermined before work starts; written advice if requested | **Supported.** Description (chainage/extent) is mandatory at lot creation; the register export is the written advice. |
| 10.3 | Bounds may be redefined; changes to previous bounds identified | **Enforced.** Editing a lot's description automatically appends an audit note preserving the previous bounds. |
| 10.4 | Pavement Lot identification includes start/end lat/long (decimal degrees) and datum, ±5 m | **Enforced.** `geoStart` / `geoEnd` / `geoDatum` fields; conformance rule R6 blocks conforming a PV lot until they are recorded. Accuracy (±5 m) is a survey obligation. |
| 10.5–10.7 | Traceability of manufactured/produced items to source | **Partially recorded.** Test records carry lab references and certificate links; full source-to-placement traceability (e.g. quarry bench face) is procedural — keep dockets in Procore Documents under the lot folder. |

## Clause 11 — Hold Points and Witness Points

| Clause | Requirement | OpenLot |
|---|---|---|
| 11.1 | Procedure for managing hold/witness points including **recording the release** | **Enforced.** Release is recorded with person, date, and an append-only audit note; reinstatement is likewise recorded. |
| 11.3–11.5 | Work verified conforming before seeking release; proceed only after release | **Enforced.** Unreleased hold point is a conformance blocker (rule R4); the lot cannot be conformed or claimed past it. |
| 11.6 | The Principal authorises a person to release a Hold Point | **Enforced.** A release without a named authorised person is refused by the API and the UI. |
| 11.7–11.10 | Notice to the Principal with Records; assessment timeframes | **Supported.** The lot dossier is the Records package; notification and timeframe tracking are procedural (roadmap: notice clock). |
| 11.11 | No waiver — work before release is at Contractor's risk | **Enforced in effect.** OpenLot will not conform or claim past an unreleased hold point regardless of physical progress. |
| 11.12–11.14 | Witness points — notice, then proceed | **Recorded.** Model witness points as hold points released on expiry of notice, noting "witness point — notice expired" as the release note; a distinct witness-point type is on the roadmap. |

## Clause 12 — Non-Conformance

| Clause | Requirement | OpenLot |
|---|---|---|
| 12.1–12.3 | NCR issued for non-complying work, with disposition and records | **Recorded.** Procore Observations of type Non-Conformance link automatically to their lot; raise and disposition them in Procore (source of truth). |
| 12.2(b) | Register identifying the status of all Nonconformities | **Enforced.** Every lot dossier and the webhook audit log constitute the live register; open/closed status synced from Procore. |
| 12.4 | An NCR must not relate to more than one Lot | **Enforced by convention.** One lot ID per NCR title; the parser links the first ID only, and the field convention (one lot per NCR) is in the toolbox talk. |
| 12.7–12.8 | A product NCR constitutes a Hold Point; release subject to accepted disposition | **Enforced in effect.** An open NCR blocks conformance exactly as an unreleased hold point does (rule R2); closing the NCR in Procore after the Principal accepts the disposition releases the block. |
| 12.9 | Cause analysis and corrective action | **Procedural** — Procore Observations workflow. |

## Clause 13 — Records

| Clause | Requirement | OpenLot |
|---|---|---|
| 13.1(b)–(d) | Records demonstrate compliance, are inspectable, correlate to payment claims | **Enforced.** Claim lines snapshot quantity, UoM, cost code, payment item and conformed date; the substantiation extract identifies the Records per claim (cl 13.11). |
| 13.3–13.4 | QMR certifies Records within 3 working days; forwarded within 1 | **Procedural.** OpenLot timestamps everything; certification is a QMR duty. |
| 13.6 | Measured quantities per conforming Lot accompany payment | **Enforced.** Only conformed lots with quantity + UoM can enter a claim. |
| 13.8(a)–(f) | Each Record identifies type, location, acceptance criteria, Lot number, date | **Recorded.** Lot ID on every linked record; dates throughout; acceptance criteria live in the ITP templates (imports pack). |
| 13.8(g) | Pavement Lot records include start/end lat/long + datum | **Enforced.** Same geo fields as cl 10.4; included in both claim extracts. |
| 13.9–13.10 | Sample register; control vs verification testing distinguished | **Partially.** Test records carry lab references; a dedicated sample register with control/verification flags is on the roadmap. |
| 13.11 | Payment claims identify the Records for the claimed work | **Enforced.** The substantiation report and CSV are generated per claim period and list each lot's evidence basis. |

## Clause 14 — Inspection and Testing

| Clause | Requirement | OpenLot |
|---|---|---|
| 14.2 | ITPs with cross-references, frequencies, hold/witness points | **Supported.** The imports pack ships civil ITP inspection templates (earthworks, stormwater, concrete) with checkpoint types marked (H)/(W)/(S); maintain the ITP register in the Quality Plan. |
| 14.6–14.8 | Testing by an AS ISO/IEC 17025-accredited (ILAC MRA, e.g. NATA) laboratory; endorsed test reports | **Recorded.** Test records carry the lab reference and a link to the endorsed certificate; verifying accreditation is procedural. |
| 14.12–14.14 | Test frequencies; reduced-frequency proposals | **Procedural** — frequencies belong in the ITPs. |

## Gaps stated plainly (roadmap)

- Distinct witness-point type with notice-period clock (cl 11.12–11.14).
- Sample register with control-vs-verification flags (cl 13.9–13.10).
- Serialised-item traceability (cl 10.1(c), 10.5–10.7).
- Hold point notification/assessment timeframe tracking (cl 11.8–11.10).

Nothing in this matrix relieves the Contractor of its obligations under
the Contract (cl 4.1) — OpenLot makes the record-keeping and gating
mechanical; the quality system remains the Contractor's.
