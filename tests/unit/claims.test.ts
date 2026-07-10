import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository } from '../../src/db/repository.js';
import { ClaimService } from '../../src/services/claims.js';
import { LotService } from '../../src/services/lots.js';
import { makeInspection } from '../fixtures.js';

const PROJECT = 316;

describe('LotService', () => {
  let repo: MemoryRepository;
  let lots: LotService;

  beforeEach(() => {
    repo = new MemoryRepository();
    lots = new LotService(repo);
  });

  it('creates lots with auto-incrementing sequences per work type', async () => {
    const a = await lots.create({ projectId: PROJECT, workType: 'EW', description: 'Ch 0–100 fill' });
    const b = await lots.create({ projectId: PROJECT, workType: 'EW', description: 'Ch 100–200 fill' });
    const c = await lots.create({ projectId: PROJECT, workType: 'SW', description: 'Line 1 pipes' });
    expect(a.id).toBe('LOT-EW-0001');
    expect(b.id).toBe('LOT-EW-0002');
    expect(c.id).toBe('LOT-SW-0001'); // sequences are per work type
  });

  it('never reuses an explicit sequence', async () => {
    await lots.create({ projectId: PROJECT, workType: 'EW', description: 'x', sequence: 14 });
    await expect(
      lots.create({ projectId: PROJECT, workType: 'EW', description: 'y', sequence: 14 })
    ).rejects.toThrow(/never reused/);
    const next = await lots.create({ projectId: PROJECT, workType: 'EW', description: 'z' });
    expect(next.id).toBe('LOT-EW-0015'); // continues after the gap
  });

  it('refuses to conform a lot with blockers and reports them', async () => {
    const lot = await lots.create({ projectId: PROJECT, workType: 'EW', description: 'Ch 0–100' });
    await lots.transition(PROJECT, lot.id, 'work_complete');
    await expect(lots.transition(PROJECT, lot.id, 'conformed')).rejects.toThrow(/cannot be conformed/);
  });

  it('conforms a lot once evidence is complete, stamping the date', async () => {
    const lot = await lots.create({ projectId: PROJECT, workType: 'EW', description: 'Ch 0–100' });
    await repo.upsertInspection(makeInspection({ lotId: lot.id }));
    await lots.releaseHoldPoint(PROJECT, lot.id, true, 'A. Rossi (Superintendent Rep)');
    await lots.transition(PROJECT, lot.id, 'work_complete');
    const { lot: conformed, evaluation } = await lots.transition(PROJECT, lot.id, 'conformed');
    expect(conformed.status).toBe('conformed');
    expect(conformed.conformedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(evaluation?.eligible).toBe(true);
  });

  it('enforces the transition graph', async () => {
    const lot = await lots.create({ projectId: PROJECT, workType: 'EW', description: 'Ch 0–100' });
    await expect(lots.transition(PROJECT, lot.id, 'closed')).rejects.toThrow(/Allowed next statuses/);
  });

  it('requires a replacement ID when superseding', async () => {
    const lot = await lots.create({ projectId: PROJECT, workType: 'EW', description: 'Ch 0–100' });
    await expect(lots.transition(PROJECT, lot.id, 'superseded')).rejects.toThrow(/supersededBy/);
    const { lot: superseded } = await lots.transition(PROJECT, lot.id, 'superseded', {
      supersededBy: 'LOT-EW-0002'
    });
    expect(superseded.supersededBy).toBe('LOT-EW-0002');
  });
});

describe('ClaimService — the conformance-to-claim gate', () => {
  let repo: MemoryRepository;
  let lots: LotService;
  let claims: ClaimService;

  beforeEach(() => {
    repo = new MemoryRepository();
    lots = new LotService(repo);
    claims = new ClaimService(repo);
  });

  async function conformedLot(): Promise<string> {
    const lot = await lots.create({
      projectId: PROJECT,
      workType: 'EW',
      description: 'Ch 0–100 fill',
      quantity: 500,
      uom: 'm3',
      costCode: '02-220'
    });
    await repo.upsertInspection(makeInspection({ lotId: lot.id, procoreId: Math.floor(Math.random() * 1e6) }));
    await lots.releaseHoldPoint(PROJECT, lot.id, true, 'A. Rossi (Superintendent Rep)');
    await lots.transition(PROJECT, lot.id, 'work_complete');
    await lots.transition(PROJECT, lot.id, 'conformed');
    return lot.id;
  }

  it('rejects non-conformed lots from a claim', async () => {
    const lot = await lots.create({
      projectId: PROJECT,
      workType: 'EW',
      description: 'x',
      quantity: 10,
      uom: 'm3'
    });
    const period = await claims.createPeriod({
      projectId: PROJECT,
      label: 'PC-14',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30'
    });
    await expect(claims.addLot(PROJECT, period.id, lot.id)).rejects.toThrow(/Only conformed lots/);
  });

  it('accepts conformed lots and snapshots quantity and conformed date', async () => {
    const lotId = await conformedLot();
    const period = await claims.createPeriod({
      projectId: PROJECT,
      label: 'PC-14',
      periodStart: '2026-06-01',
      periodEnd: '2026-12-31'
    });
    const line = await claims.addLot(PROJECT, period.id, lotId);
    expect(line.quantity).toBe(500);
    expect(line.uom).toBe('m3');
    expect(line.conformedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('prevents double claiming across periods', async () => {
    const lotId = await conformedLot();
    const p1 = await claims.createPeriod({
      projectId: PROJECT,
      label: 'PC-14',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30'
    });
    const p2 = await claims.createPeriod({
      projectId: PROJECT,
      label: 'PC-15',
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31'
    });
    await claims.addLot(PROJECT, p1.id, lotId);
    await expect(claims.addLot(PROJECT, p2.id, lotId)).rejects.toThrow(/already claimed in PC-14/);
  });

  it('rejects lots without quantity/UoM', async () => {
    const lot = await lots.create({ projectId: PROJECT, workType: 'EW', description: 'no qty' });
    await repo.upsertInspection(makeInspection({ lotId: lot.id, procoreId: 1 }));
    await lots.releaseHoldPoint(PROJECT, lot.id, true, 'A. Rossi (Superintendent Rep)');
    await lots.transition(PROJECT, lot.id, 'work_complete');
    await lots.transition(PROJECT, lot.id, 'conformed');
    const period = await claims.createPeriod({
      projectId: PROJECT,
      label: 'PC-14',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30'
    });
    await expect(claims.addLot(PROJECT, period.id, lot.id)).rejects.toThrow(/no quantity\/UoM/);
  });

  it('freezes issued periods', async () => {
    const lotId = await conformedLot();
    const period = await claims.createPeriod({
      projectId: PROJECT,
      label: 'PC-14',
      periodStart: '2026-06-01',
      periodEnd: '2026-12-31'
    });
    await claims.issuePeriod(period.id);
    await expect(claims.addLot(PROJECT, period.id, lotId)).rejects.toThrow(/issued and cannot be modified/);
  });

  it('generates a CSV extract with escaped fields', async () => {
    const lotId = await conformedLot();
    const lot = await repo.getLot(PROJECT, lotId);
    await repo.updateLot({ ...lot!, description: 'Ch 0–100, "select" fill' });
    const period = await claims.createPeriod({
      projectId: PROJECT,
      label: 'PC-14',
      periodStart: '2026-06-01',
      periodEnd: '2026-12-31'
    });
    await claims.addLot(PROJECT, period.id, lotId);
    const csv = await claims.extractCsv(period.id);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toContain('Lot ID');
    expect(lines[1]).toContain('"Ch 0–100, ""select"" fill"');
    expect(lines[1]).toContain('500');
  });

  it('generates an HTML substantiation report', async () => {
    const lotId = await conformedLot();
    const period = await claims.createPeriod({
      projectId: PROJECT,
      label: 'PC-14',
      periodStart: '2026-06-01',
      periodEnd: '2026-12-31'
    });
    await claims.addLot(PROJECT, period.id, lotId);
    const html = await claims.extractHtml(period.id);
    expect(html).toContain('Conformance substantiation — PC-14');
    expect(html).toContain(lotId);
  });
});
