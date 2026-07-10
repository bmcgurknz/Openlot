import { describe, expect, it } from 'vitest';
import { canTransition, evaluateConformance, transitionError } from '../../src/services/conformance.js';
import { makeInspection, makeLot, makeNcr, makeTest } from '../fixtures.js';

const codes = (evaln: ReturnType<typeof evaluateConformance>): string[] =>
  evaln.blockers.map((b) => b.code);

describe('conformance engine', () => {
  it('passes a lot with passed inspections, closed NCRs, passed tests and released hold point', () => {
    const evaln = evaluateConformance(
      makeLot(),
      [makeInspection()],
      [makeNcr({ status: 'closed' })],
      [makeTest({ status: 'passed' })]
    );
    expect(evaln.eligible).toBe(true);
    expect(evaln.blockers).toEqual([]);
  });

  it('R1: blocks with no inspection evidence at all', () => {
    const evaln = evaluateConformance(makeLot(), [], [], []);
    expect(evaln.eligible).toBe(false);
    expect(codes(evaln)).toContain('NO_INSPECTIONS_LINKED');
  });

  it('R1: not_applicable inspections do not count as evidence', () => {
    const evaln = evaluateConformance(makeLot(), [makeInspection({ status: 'not_applicable' })], [], []);
    expect(codes(evaln)).toContain('NO_INSPECTIONS_LINKED');
  });

  it('R1: blocks while any linked inspection is not passed', () => {
    const evaln = evaluateConformance(
      makeLot(),
      [makeInspection(), makeInspection({ procoreId: 900115, status: 'in_progress', itemsPassed: 5 })],
      [],
      []
    );
    expect(evaln.eligible).toBe(false);
    expect(codes(evaln)).toContain('INSPECTION_NOT_PASSED');
  });

  it('R2: blocks on open and ready_for_review NCRs, ignores closed and void', () => {
    const open = evaluateConformance(makeLot(), [makeInspection()], [makeNcr({ status: 'open' })], []);
    expect(codes(open)).toContain('OPEN_NCR');
    const review = evaluateConformance(makeLot(), [makeInspection()], [makeNcr({ status: 'ready_for_review' })], []);
    expect(codes(review)).toContain('OPEN_NCR');
    const voided = evaluateConformance(makeLot(), [makeInspection()], [makeNcr({ status: 'void' })], []);
    expect(voided.eligible).toBe(true);
  });

  it('R3: blocks on outstanding and failed tests', () => {
    const sampled = evaluateConformance(makeLot(), [makeInspection()], [], [makeTest({ status: 'sampled' })]);
    expect(codes(sampled)).toContain('TEST_OUTSTANDING');
    // results_received still needs the engineer's pass/fail call
    const received = evaluateConformance(makeLot(), [makeInspection()], [], [makeTest({ status: 'results_received' })]);
    expect(codes(received)).toContain('TEST_OUTSTANDING');
    const failed = evaluateConformance(makeLot(), [makeInspection()], [], [makeTest({ status: 'failed' })]);
    expect(codes(failed)).toContain('TEST_FAILED');
    expect(failed.eligible).toBe(false);
  });

  it('R4: blocks while the hold point is not released', () => {
    const evaln = evaluateConformance(makeLot({ holdPointReleased: false }), [makeInspection()], [], []);
    expect(codes(evaln)).toContain('HOLD_POINT_NOT_RELEASED');
  });

  it('R5: superseded and closed lots cannot be conformed', () => {
    expect(codes(evaluateConformance(makeLot({ status: 'superseded' }), [makeInspection()], [], []))).toContain(
      'LOT_SUPERSEDED'
    );
    expect(codes(evaluateConformance(makeLot({ status: 'closed' }), [makeInspection()], [], []))).toContain(
      'LOT_CLOSED'
    );
  });

  it('reports every blocker, not just the first', () => {
    const evaln = evaluateConformance(
      makeLot({ holdPointReleased: false }),
      [makeInspection({ status: 'failed', itemsPassed: 7, itemsFailed: 1 })],
      [makeNcr({ status: 'open' })],
      [makeTest({ status: 'requested' })]
    );
    expect(evaln.blockers.length).toBe(4);
  });
});

describe('status transitions', () => {
  it('allows the standard forward path', () => {
    expect(canTransition('open', 'work_complete')).toBe(true);
    expect(canTransition('work_complete', 'conformed')).toBe(true);
    expect(canTransition('conformed', 'closed')).toBe(true);
  });

  it('blocks skipping and terminal moves', () => {
    expect(canTransition('open', 'conformed')).toBe(false); // must pass through work_complete
    expect(canTransition('open', 'closed')).toBe(false);
    expect(canTransition('superseded', 'open')).toBe(false); // terminal
  });

  it('allows deliberate reversals with audit trail', () => {
    expect(canTransition('conformed', 'work_complete')).toBe(true); // post-conformance NCR
    expect(canTransition('closed', 'conformed')).toBe(true); // reopen
    expect(canTransition('work_complete', 'open')).toBe(true);
  });

  it('produces a human-readable error', () => {
    expect(transitionError('open', 'conformed')).toMatch(/Allowed next statuses: work_complete, superseded/);
    expect(transitionError('superseded', 'open')).toMatch(/terminal/);
  });
});
