/**
 * Drives the static edition's browser data source end to end under a
 * localStorage stub: init → import a lot-lite register CSV → record
 * evidence → release the hold point → conform → claim → extract →
 * backup/restore round trip. This is the same code path the hosted
 * static app runs, minus the DOM.
 */
import { beforeAll, describe, expect, it } from 'vitest';

const store = new Map<string, string>();
beforeAll(() => {
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k)
  };
});

const P = 316;

describe('static edition data source', () => {
  it('runs the full register-to-claim lifecycle in the browser engine', async () => {
    const { initLocalStore, localApi, localData } = await import('../../web/src/local.js');
    await initLocalStore();
    await localData.wipe();

    // Migrate a lot-lite spreadsheet
    const csv = [
      'Lot ID,Description,Work Type,Spec/ITP Ref,Cost Code,Pay Item,Qty,UoM,Status,Notes',
      'LOT-EW-0012,"Ch 0950-1200 RHS select fill",EW,ITP-EW-01,02-230,2.3,1140,m3,Work complete,',
      'LOT-PV-0003,"Road 1 Ch 0000-0250 subbase",PV,ITP-PV-01,05-120,5.2,410,m3,Open,',
      'BAD-ID,"not a lot",EW,,,,,,,'
    ].join('\n');
    const result = await localData.importRegisterCsv(csv, P);
    expect(result.imported).toBe(2);
    expect(result.skipped[0]).toMatch(/BAD-ID/);

    // Imported status restored to work_complete but never conformed
    const lots = await localApi.lots(P);
    expect(lots.find((l: { id: string }) => l.id === 'LOT-EW-0012')?.status).toBe('work_complete');

    // Evidence recorded directly (no Procore in this edition)
    await localData.recordInspection(P, 'LOT-EW-0012', {
      title: 'Subgrade proof roll',
      status: 'passed',
      itemsTotal: 8,
      itemsPassed: 8
    });
    const ncr = await localData.recordNcr(P, 'LOT-EW-0012', { title: 'Soft spot at Ch 1050', status: 'open' });

    // Gate holds: open NCR + unreleased hold point
    let evaln = await localApi.evaluation(P, 'LOT-EW-0012');
    expect(evaln.blockers.map((b: { code: string }) => b.code)).toEqual(
      expect.arrayContaining(['OPEN_NCR', 'HOLD_POINT_NOT_RELEASED'])
    );

    // Resolve, with the ATS 1120 authoriser requirement enforced
    await expect(localApi.holdPoint(P, 'LOT-EW-0012', true)).rejects.toThrow(/authorised person/);
    await localData.setNcrStatus(ncr.procoreId, 'closed');
    await localApi.holdPoint(P, 'LOT-EW-0012', true, 'A. Rossi (Superintendent Rep)');
    evaln = await localApi.evaluation(P, 'LOT-EW-0012');
    expect(evaln.eligible).toBe(true);

    // Conform → claim → extract, with the pay item flowing through
    await localApi.transition(P, 'LOT-EW-0012', 'conformed');
    const period = await localApi.createClaim(P, {
      label: 'PC-01',
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31'
    });
    await localApi.addLotToClaim(P, period.id, 'LOT-EW-0012');
    const extract = await localApi.extractCsv(period.id);
    expect(extract).toContain('LOT-EW-0012');
    expect(extract).toContain('2.3'); // payment item
    expect(extract).toContain('A. Rossi'); // hold point release recorded

    // Pavement lot still shows the ATS geo blocker
    const pv = await localApi.evaluation(P, 'LOT-PV-0003');
    expect(pv.blockers.map((b: { code: string }) => b.code)).toContain('PAVEMENT_GEO_MISSING');

    // Backup / restore round trip through localStorage-persisted snapshots
    const backup = localData.exportJson();
    await localData.wipe();
    expect(await localApi.lots(P)).toHaveLength(0);
    await localData.importJson(backup);
    const restored = await localApi.lots(P);
    expect(restored.map((l: { id: string }) => l.id).sort()).toEqual(['LOT-EW-0012', 'LOT-PV-0003']);
    expect((await localApi.lot(P, 'LOT-EW-0012')).claimedIn.map((c: { label: string }) => c.label)).toEqual(['PC-01']);
  });
});
