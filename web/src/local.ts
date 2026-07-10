/**
 * Static-edition data source.
 *
 * The full domain engine — lot register, ATS 1120 conformance rules, claim
 * gate, extracts — runs in the browser against an in-memory repository,
 * persisted to localStorage after every change. Nothing leaves the
 * customer's machine: their register is their data.
 *
 * Implements the same surface as the remote `api` client so the pages
 * don't know which edition they're running in.
 */
import { MemoryRepository } from '../../src/db/repository.js';
import { parseCsv } from '../../src/lib/import/csv.js';
import { ClaimService } from '../../src/services/claims.js';
import { evaluateConformance } from '../../src/services/conformance.js';
import { seedDemoData } from '../../src/services/demo.js';
import { LotService, LotServiceError } from '../../src/services/lots.js';
import type {
  LinkedInspection,
  LinkedNcr,
  Lot,
  LotStatus,
  TestRecord as DomainTest
} from '../../src/types.js';
import { ApiError } from './errors.js';

const STORAGE_KEY = 'procore-openlot:register:v1';

const repo = new MemoryRepository();
const lots = new LotService(repo);
const claims = new ClaimService(repo);

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, repo.snapshot());
  } catch (err) {
    console.error('Could not persist the register to localStorage', err);
  }
}

/** Wrap a mutation: run, persist, translate domain errors to ApiError. */
async function tx<T>(fn: () => Promise<T> | T): Promise<T> {
  try {
    const result = await fn();
    persist();
    return result;
  } catch (err) {
    if (err instanceof LotServiceError) throw new ApiError(err.message, 422);
    if (err instanceof Error) throw new ApiError(err.message, 422);
    throw err;
  }
}

async function ro<T>(fn: () => Promise<T> | T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Error) throw new ApiError(err.message, 404);
    throw err;
  }
}

export async function initLocalStore(): Promise<void> {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      repo.load(saved);
      return;
    } catch (err) {
      console.error('Saved register was unreadable; starting fresh', err);
    }
  }
  // First run: an empty register. Sample data is opt-in from the Data panel.
}

/* ---- Data management (static edition only) ---------------------------- */

export const localData = {
  exportJson(): string {
    return repo.snapshot();
  },
  async importJson(json: string): Promise<void> {
    repo.load(json); // throws on bad input before anything is replaced… load replaces; validate first
    persist();
  },
  async loadSample(): Promise<void> {
    repo.load('{"v":1}'); // wipe
    await seedDemoData(repo);
    persist();
  },
  async wipe(): Promise<void> {
    repo.load('{"v":1}');
    persist();
  },
  /**
   * Import an existing "lot lite" register CSV (the shape in
   * examples/sample-lot-register.csv). Only Lot ID, Description and Work
   * Type are required; unknown columns are ignored.
   */
  async importRegisterCsv(csv: string, projectId: number): Promise<{ imported: number; skipped: string[] }> {
    const rows = parseCsv(csv);
    if (rows.length < 2) throw new ApiError('CSV appears to be empty.', 400);
    const header = rows[0]!.map((h) => h.trim().toLowerCase());
    const col = (name: string): number => header.findIndex((h) => h.startsWith(name));
    const iId = col('lot id');
    const iDesc = col('description');
    const iWt = col('work type');
    if (iId < 0 || iDesc < 0 || iWt < 0) {
      throw new ApiError('CSV must have "Lot ID", "Description" and "Work Type" columns.', 400);
    }
    const iSpec = col('spec');
    const iCost = col('cost');
    const iQty = col('qty');
    const iUom = col('uom');
    const iStatus = col('status');
    const iNotes = col('notes');
    const iPay = col('pay');
    let imported = 0;
    const skipped: string[] = [];
    for (const row of rows.slice(1)) {
      const id = row[iId]?.trim();
      if (!id) continue;
      const m = /^LOT-([A-Z]{2})-(\d{1,5})$/i.exec(id);
      if (!m) {
        skipped.push(`${id}: not a LOT-XX-NNNN identifier`);
        continue;
      }
      try {
        const lot = await lots.create({
          projectId,
          workType: m[1]!.toUpperCase(),
          sequence: Number(m[2]),
          description: row[iDesc]?.trim() || id,
          specReference: (iSpec >= 0 && row[iSpec]?.trim()) || null,
          costCode: (iCost >= 0 && row[iCost]?.trim()) || null,
          paymentItemNumber: (iPay >= 0 && row[iPay]?.trim()) || null,
          quantity: iQty >= 0 && row[iQty]?.trim() ? Number(row[iQty]) : null,
          uom: (iUom >= 0 && row[iUom]?.trim()) || null,
          notes: (iNotes >= 0 && row[iNotes]?.trim()) || null,
          createdBy: 'register import'
        });
        // Best-effort status restore for completed work: imported evidence
        // is not available, so conformed/closed states are not recreated —
        // the gate must stay honest. Work-complete is safe to restore.
        const status = iStatus >= 0 ? row[iStatus]?.trim().toLowerCase() : '';
        if (status === 'work complete' || status === 'work_complete') {
          await lots.transition(projectId, lot.id, 'work_complete');
        }
        imported++;
      } catch (err) {
        skipped.push(`${id}: ${err instanceof Error ? err.message : 'error'}`);
      }
    }
    persist();
    return { imported, skipped };
  },
  /** Record an ITP inspection result directly (no Procore in this edition). */
  async recordInspection(
    projectId: number,
    lotId: string,
    input: { title: string; templateName?: string; status: LinkedInspection['status']; inspectionDate?: string; itemsTotal?: number; itemsPassed?: number; itemsFailed?: number }
  ): Promise<LinkedInspection> {
    return tx(async () => {
      const inspection: LinkedInspection = {
        procoreId: Date.now() * 10 + Math.floor(Math.random() * 10),
        lotId,
        projectId,
        title: input.title.startsWith(lotId) ? input.title : `${lotId} - ${input.title}`,
        templateName: input.templateName ?? null,
        status: input.status,
        inspectionDate: input.inspectionDate ?? new Date().toISOString().slice(0, 10),
        itemsTotal: input.itemsTotal ?? 0,
        itemsPassed: input.itemsPassed ?? 0,
        itemsFailed: input.itemsFailed ?? 0,
        updatedAt: new Date().toISOString()
      };
      await repo.upsertInspection(inspection);
      return inspection;
    });
  },
  async setInspectionStatus(procoreId: number, status: LinkedInspection['status']): Promise<void> {
    return tx(async () => {
      const found = await repo.getInspection(procoreId);
      if (!found) throw new ApiError('Inspection not found', 404);
      await repo.upsertInspection({ ...found, status, updatedAt: new Date().toISOString() });
    });
  },
  /** Record an NCR directly. */
  async recordNcr(
    projectId: number,
    lotId: string,
    input: { title: string; status: LinkedNcr['status'] }
  ): Promise<LinkedNcr> {
    return tx(async () => {
      const ncr: LinkedNcr = {
        procoreId: Date.now() * 10 + Math.floor(Math.random() * 10),
        lotId,
        projectId,
        title: input.title.startsWith(lotId) ? input.title : `${lotId} - ${input.title}`,
        status: input.status,
        createdAt: new Date().toISOString(),
        closedAt: input.status === 'closed' ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString()
      };
      await repo.upsertNcr(ncr);
      return ncr;
    });
  },
  async setNcrStatus(procoreId: number, status: LinkedNcr['status']): Promise<void> {
    return tx(async () => {
      const found = await repo.getNcr(procoreId);
      if (!found) throw new ApiError('NCR not found', 404);
      await repo.upsertNcr({
        ...found,
        status,
        closedAt: status === 'closed' || status === 'void' ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString()
      });
    });
  }
};

/* ---- The api-compatible surface ---------------------------------------- */

export const localApi = {
  lots: (projectId: number) => ro(() => repo.listLots(projectId)),
  lot: async (projectId: number, lotId: string) =>
    ro(async () => {
      const lot = await repo.getLot(projectId, lotId);
      if (!lot) throw new ApiError(`Lot ${lotId} not found`, 404);
      const [inspections, ncrs, tests, quantities, claimedIn, history] = await Promise.all([
        repo.listInspections(projectId, lotId),
        repo.listNcrs(projectId, lotId),
        repo.listTests(projectId, lotId),
        repo.listQuantities(projectId, lotId),
        repo.lotClaimedIn(lotId),
        repo.listHistory(projectId, lotId)
      ]);
      return { lot, inspections, ncrs, tests, quantities, claimedIn, history };
    }),
  history: (projectId: number, lotId: string) => ro(() => repo.listHistory(projectId, lotId)),
  evaluation: (projectId: number, lotId: string) =>
    ro(async () => {
      const lot = await repo.getLot(projectId, lotId);
      if (!lot) throw new ApiError(`Lot ${lotId} not found`, 404);
      const [inspections, ncrs, tests] = await Promise.all([
        repo.listInspections(projectId, lotId),
        repo.listNcrs(projectId, lotId),
        repo.listTests(projectId, lotId)
      ]);
      return evaluateConformance(lot, inspections, ncrs, tests);
    }),
  createLot: (projectId: number, body: object) =>
    tx(() => lots.create({ projectId, ...(body as Omit<Parameters<LotService['create']>[0], 'projectId'>) })),
  transition: (projectId: number, lotId: string, to: LotStatus, supersededBy?: string, actor?: string) =>
    tx(() => lots.transition(projectId, lotId, to, { supersededBy, actor })),
  holdPoint: (projectId: number, lotId: string, released: boolean, actor?: string) =>
    tx(() => lots.releaseHoldPoint(projectId, lotId, released, actor)),
  updateLot: (projectId: number, lotId: string, fields: object, actor?: string) =>
    tx(() => lots.update(projectId, lotId, fields as Parameters<LotService['update']>[2], actor)),
  addTest: (projectId: number, lotId: string, testType: string) =>
    tx(() => lots.addTest(projectId, lotId, { testType })),
  setTestStatus: (testId: string, status: DomainTest['status']) =>
    tx(() => lots.updateTestStatus(testId, status)),
  claims: (projectId: number) => ro(() => repo.listClaimPeriods(projectId)),
  createClaim: (projectId: number, body: object) =>
    tx(() =>
      claims.createPeriod({
        projectId,
        ...(body as { label: string; periodStart: string; periodEnd: string; createdBy?: string | null })
      })
    ),
  claimable: (projectId: number, claimId: string) => ro(() => claims.claimableLots(projectId, claimId)),
  claimLines: (projectId: number, claimId: string) => ro(() => claims.extractRows(claimId)),
  addLotToClaim: (projectId: number, claimId: string, lotId: string, actor?: string) =>
    tx(() => claims.addLot(projectId, claimId, lotId, actor)),
  issueClaim: (_projectId: number, claimId: string, actor?: string) => tx(() => claims.issuePeriod(claimId, actor)),
  extractCsv: (claimId: string) => ro(() => claims.extractCsv(claimId)),
  extractHtml: (claimId: string) => ro(() => claims.extractHtml(claimId)),
  connection: async () => ({ connected: false as const }),
  health: async () => ({ status: 'ok', demoMode: false, staticEdition: true })
};

export type Lot_ = Lot;
