import type {
  ConformanceBlocker,
  ConformanceEvaluation,
  LinkedInspection,
  LinkedNcr,
  Lot,
  TestRecord
} from '../types.js';

/**
 * The conformance engine.
 *
 * A lot may be marked `conformed` only when every rule below holds. These
 * rules encode the substantiation standard expected under ANZ authority
 * specifications (e.g. TMR MRTS50, TfNSW Q6) and standard-form contracts:
 *
 *  R1. At least one ITP inspection is linked, and every linked inspection
 *      is `passed` or `not_applicable`. A lot with no inspection evidence
 *      cannot be conformed — "no records, no conformance".
 *  R2. Zero open NCRs. An NCR in `open` or `ready_for_review` blocks
 *      conformance until closed or voided.
 *  R3. Every test record has reached `passed` (or `results_received` is
 *      treated as outstanding — the engineer must mark pass/fail).
 *  R4. Hold/witness points are released (manual flag set by the engineer
 *      once the superintendent/authority representative has released).
 *  R5. The lot is not superseded or already closed.
 *
 * The engine is pure: it takes data in and returns an evaluation. All
 * persistence and Procore I/O lives elsewhere, which keeps these rules
 * trivially testable and auditable.
 */
export function evaluateConformance(
  lot: Lot,
  inspections: LinkedInspection[],
  ncrs: LinkedNcr[],
  tests: TestRecord[],
  now: () => Date = () => new Date()
): ConformanceEvaluation {
  const blockers: ConformanceBlocker[] = [];

  if (lot.status === 'superseded') {
    blockers.push({
      code: 'LOT_SUPERSEDED',
      message: `Lot has been superseded${lot.supersededBy ? ` by ${lot.supersededBy}` : ''} and can no longer be conformed.`
    });
  }
  if (lot.status === 'closed') {
    blockers.push({
      code: 'LOT_CLOSED',
      message: 'Lot is closed. Reopen it before changing conformance.'
    });
  }

  // R1 — inspection evidence
  const active = inspections.filter((i) => i.status !== 'not_applicable');
  if (active.length === 0) {
    blockers.push({
      code: 'NO_INSPECTIONS_LINKED',
      message: 'No ITP inspections are linked to this lot. Conformance requires inspection evidence.'
    });
  }
  for (const insp of active) {
    if (insp.status !== 'passed') {
      blockers.push({
        code: 'INSPECTION_NOT_PASSED',
        message: `Inspection "${insp.title}" is ${insp.status.replace('_', ' ')} (${insp.itemsPassed}/${insp.itemsTotal} items passed).`,
        reference: String(insp.procoreId)
      });
    }
  }

  // R2 — NCRs
  for (const ncr of ncrs) {
    if (ncr.status === 'open' || ncr.status === 'ready_for_review') {
      blockers.push({
        code: 'OPEN_NCR',
        message: `NCR "${ncr.title}" is ${ncr.status.replace(/_/g, ' ')}. Close or void it before conforming the lot.`,
        reference: String(ncr.procoreId)
      });
    }
  }

  // R3 — tests
  for (const test of tests) {
    if (test.status === 'failed') {
      blockers.push({
        code: 'TEST_FAILED',
        message: `Test "${test.testType}" failed${test.labReference ? ` (report ${test.labReference})` : ''}. Raise an NCR or retest.`,
        reference: test.id
      });
    } else if (test.status !== 'passed') {
      blockers.push({
        code: 'TEST_OUTSTANDING',
        message: `Test "${test.testType}" is ${test.status.replace(/_/g, ' ')} — results must be received and marked passed.`,
        reference: test.id
      });
    }
  }

  // R4 — hold points (ATS 1120 cl 11: release by the Principal's authorised
  // person must be recorded before subsequent work proceeds)
  if (!lot.holdPointReleased) {
    blockers.push({
      code: 'HOLD_POINT_NOT_RELEASED',
      message: 'Hold/witness point has not been released. Record the release before conforming the lot.'
    });
  }

  // R6 — pavement lot geo-referencing (ATS 1120 cl 10.4 / cl 13.8(g)):
  // pavement construction lots must carry start and end latitude/longitude
  // in decimal degrees plus the datum, to ±5 m, before conformance records
  // are complete.
  if (lot.workType === 'PV' && (!lot.geoStart || !lot.geoEnd || !lot.geoDatum)) {
    blockers.push({
      code: 'PAVEMENT_GEO_MISSING',
      message:
        'Pavement lots require start/end latitude & longitude (decimal degrees) and datum per ATS 1120 cl 10.4. Record them on the lot before conforming.'
    });
  }

  return {
    lotId: lot.id,
    eligible: blockers.length === 0,
    blockers,
    checkedAt: now().toISOString()
  };
}

/**
 * Legal lot status transitions. `conformed` is reachable only through the
 * engine (see canTransition callers); everything else is engineer-driven.
 */
const TRANSITIONS: Record<Lot['status'], Lot['status'][]> = {
  open: ['work_complete', 'superseded'],
  work_complete: ['open', 'conformed', 'superseded'],
  conformed: ['closed', 'work_complete'], // revert allowed with audit trail (e.g. NCR raised post-conformance)
  closed: ['conformed'], // reopen requires deliberate action
  superseded: [] // terminal
};

export function canTransition(from: Lot['status'], to: Lot['status']): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transitionError(from: Lot['status'], to: Lot['status']): string {
  return `Cannot move a lot from "${from}" to "${to}". Allowed next statuses: ${
    TRANSITIONS[from].length ? TRANSITIONS[from].join(', ') : 'none (terminal status)'
  }.`;
}
