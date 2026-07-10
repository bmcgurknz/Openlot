import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository } from '../../src/db/repository.js';
import { evaluateConformance } from '../../src/services/conformance.js';
import { LotService } from '../../src/services/lots.js';
import { makeInspection, makeLot } from '../fixtures.js';

const PROJECT = 316;

describe('ATS 1120 compliance behaviours', () => {
  let repo: MemoryRepository;
  let lots: LotService;

  beforeEach(() => {
    repo = new MemoryRepository();
    lots = new LotService(repo);
  });

  // cl 10.4 / 13.8(g) — pavement lots must be geo-referenced
  it('R6: blocks conforming a pavement lot without start/end geo-reference and datum', () => {
    const pv = makeLot({ id: 'LOT-PV-0003', workType: 'PV', geoStart: null, geoEnd: null, geoDatum: null });
    const evaln = evaluateConformance(pv, [makeInspection({ lotId: pv.id })], [], []);
    expect(evaln.eligible).toBe(false);
    expect(evaln.blockers.map((b) => b.code)).toContain('PAVEMENT_GEO_MISSING');
  });

  it('R6: passes a pavement lot once geo-references are recorded', () => {
    const pv = makeLot({
      id: 'LOT-PV-0003',
      workType: 'PV',
      geoStart: '-27.46980, 153.02510',
      geoEnd: '-27.47120, 153.02760',
      geoDatum: 'GDA2020'
    });
    const evaln = evaluateConformance(pv, [makeInspection({ lotId: pv.id })], [], []);
    expect(evaln.eligible).toBe(true);
  });

  it('R6: does not apply to non-pavement work types', () => {
    const ew = makeLot({ workType: 'EW', geoStart: null, geoEnd: null, geoDatum: null });
    const evaln = evaluateConformance(ew, [makeInspection()], [], []);
    expect(evaln.blockers.map((b) => b.code)).not.toContain('PAVEMENT_GEO_MISSING');
  });

  // cl 11.1 / 11.6 — release must be recorded, by the authorised person
  it("refuses a hold point release without the Principal's authorised person", async () => {
    const lot = await lots.create({ projectId: PROJECT, workType: 'EW', description: 'Ch 0–100' });
    await expect(lots.releaseHoldPoint(PROJECT, lot.id, true)).rejects.toThrow(/authorised person/);
    await expect(lots.releaseHoldPoint(PROJECT, lot.id, true, '  ')).rejects.toThrow(/authorised person/);
  });

  it('records who released the hold point and when, and clears it on reinstatement', async () => {
    const lot = await lots.create({ projectId: PROJECT, workType: 'EW', description: 'Ch 0–100' });
    const released = await lots.releaseHoldPoint(PROJECT, lot.id, true, 'A. Rossi (Superintendent Rep)');
    expect(released.holdPointReleased).toBe(true);
    expect(released.holdPointReleasedBy).toBe('A. Rossi (Superintendent Rep)');
    expect(released.holdPointReleasedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const reinstated = await lots.releaseHoldPoint(PROJECT, lot.id, false);
    expect(reinstated.holdPointReleased).toBe(false);
    expect(reinstated.holdPointReleasedBy).toBeNull();
    expect(reinstated.holdPointReleasedAt).toBeNull();
    expect(reinstated.notes).toMatch(/released .* by A\. Rossi/);
    expect(reinstated.notes).toMatch(/reinstated/);
  });

  // cl 10.3 — redefining lot bounds keeps the previous bounds on record
  it('appends a bounds-redefinition audit note when the description changes', async () => {
    const lot = await lots.create({ projectId: PROJECT, workType: 'EW', description: 'Ch 0–100 LHS fill' });
    const updated = await lots.update(PROJECT, lot.id, { description: 'Ch 0–150 LHS fill' });
    expect(updated.description).toBe('Ch 0–150 LHS fill');
    expect(updated.notes).toMatch(/Bounds redefined .* \(was: Ch 0–100 LHS fill\)/);
    // Unchanged description → no note spam
    const same = await lots.update(PROJECT, lot.id, { quantity: 500 });
    expect((same.notes?.match(/Bounds redefined/g) ?? []).length).toBe(1);
  });

  // cl 10.1(e) — payment schedule item per lot
  it('stores and updates the payment schedule item number', async () => {
    const lot = await lots.create({
      projectId: PROJECT,
      workType: 'EW',
      description: 'Ch 0–100',
      paymentItemNumber: '2.3'
    });
    expect(lot.paymentItemNumber).toBe('2.3');
    const updated = await lots.update(PROJECT, lot.id, { paymentItemNumber: '2.4' });
    expect(updated.paymentItemNumber).toBe('2.4');
  });
});
