import { randomUUID } from '../lib/uuid.js';
import type {
  LotHistoryEntry,
  ClaimLine,
  ClaimPeriod,
  LinkedInspection,
  LinkedNcr,
  Lot,
  ProcoreConnection,
  QuantityEntry,
  TestRecord,
  WebhookEventLog
} from '../types.js';

/**
 * Persistence boundary. Two implementations ship with OpenLot:
 *  - PgRepository (src/db/pg-repository.ts) — production, PostgreSQL
 *  - MemoryRepository (below) — tests, local demo mode (DEMO_MODE=true)
 *
 * Services depend only on this interface, which keeps business rules
 * database-agnostic and unit-testable without a running Postgres.
 */
export interface Repository {
  // Lots
  createLot(lot: Lot): Promise<Lot>;
  getLot(projectId: number, lotId: string): Promise<Lot | null>;
  listLots(projectId: number, filter?: { status?: Lot['status']; workType?: string }): Promise<Lot[]>;
  updateLot(lot: Lot): Promise<Lot>;
  nextSequence(projectId: number, workType: string): Promise<number>;

  // Linked Procore records
  upsertInspection(i: LinkedInspection): Promise<void>;
  listInspections(projectId: number, lotId: string): Promise<LinkedInspection[]>;
  upsertNcr(n: LinkedNcr): Promise<void>;
  listNcrs(projectId: number, lotId: string): Promise<LinkedNcr[]>;

  // Tests
  createTest(t: TestRecord): Promise<TestRecord>;
  updateTest(t: TestRecord): Promise<TestRecord>;
  getTest(id: string): Promise<TestRecord | null>;
  listTests(projectId: number, lotId: string): Promise<TestRecord[]>;

  // Quantities
  createQuantity(q: QuantityEntry): Promise<QuantityEntry>;
  listQuantities(projectId: number, lotId: string): Promise<QuantityEntry[]>;

  // Claims
  createClaimPeriod(p: ClaimPeriod): Promise<ClaimPeriod>;
  getClaimPeriod(id: string): Promise<ClaimPeriod | null>;
  listClaimPeriods(projectId: number): Promise<ClaimPeriod[]>;
  appendHistory(entry: LotHistoryEntry): Promise<void>;
  listHistory(projectId: number, lotId: string): Promise<LotHistoryEntry[]>;
  updateClaimPeriod(p: ClaimPeriod): Promise<ClaimPeriod>;
  addClaimLine(l: ClaimLine): Promise<ClaimLine>;
  listClaimLines(claimPeriodId: string): Promise<ClaimLine[]>;
  lotClaimedIn(lotId: string): Promise<ClaimPeriod[]>;

  // Procore connection + webhook audit
  saveConnection(c: Omit<ProcoreConnection, 'id'>): Promise<ProcoreConnection>;
  getConnection(): Promise<ProcoreConnection | null>;
  updateConnection(c: ProcoreConnection): Promise<ProcoreConnection>;
  logWebhookEvent(e: Omit<WebhookEventLog, 'id'>): Promise<void>;
  listWebhookEvents(limit: number): Promise<WebhookEventLog[]>;
}

/** In-memory implementation. Not for production use. */
export class MemoryRepository implements Repository {
  private lots = new Map<string, Lot>(); // key: projectId:lotId
  private inspections = new Map<number, LinkedInspection>();
  private ncrs = new Map<number, LinkedNcr>();
  private tests = new Map<string, TestRecord>();
  private quantities = new Map<string, QuantityEntry>();
  private claimPeriods = new Map<string, ClaimPeriod>();
  private claimLines = new Map<string, ClaimLine>();
  private connection: ProcoreConnection | null = null;
  private webhookEvents: WebhookEventLog[] = [];
  private history: LotHistoryEntry[] = [];

  async appendHistory(entry: LotHistoryEntry): Promise<void> {
    this.history.push({ ...entry });
  }

  async listHistory(projectId: number, lotId: string): Promise<LotHistoryEntry[]> {
    return this.history
      .filter((h) => h.projectId === projectId && h.lotId === lotId)
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  /** Direct evidence getters — used by the static (browser) edition. */
  async getInspection(procoreId: number): Promise<LinkedInspection | null> {
    return this.inspections.get(procoreId) ?? null;
  }

  async getNcr(procoreId: number): Promise<LinkedNcr | null> {
    return this.ncrs.get(procoreId) ?? null;
  }

  /** Serialise the full state — the static (browser) edition persists this. */
  snapshot(): string {
    return JSON.stringify({
      v: 1,
      lots: [...this.lots.values()],
      inspections: [...this.inspections.values()],
      ncrs: [...this.ncrs.values()],
      tests: [...this.tests.values()],
      quantities: [...this.quantities.values()],
      claimPeriods: [...this.claimPeriods.values()],
      claimLines: [...this.claimLines.values()],
      webhookEvents: this.webhookEvents,
      history: this.history
    });
  }

  /** Restore a snapshot produced by snapshot(). Replaces all state. */
  load(json: string): void {
    const d = JSON.parse(json) as {
      lots?: Lot[]; inspections?: LinkedInspection[]; ncrs?: LinkedNcr[];
      tests?: TestRecord[]; quantities?: QuantityEntry[];
      claimPeriods?: ClaimPeriod[]; claimLines?: ClaimLine[];
      webhookEvents?: WebhookEventLog[];
      history?: LotHistoryEntry[];
    };
    this.lots = new Map((d.lots ?? []).map((l) => [this.key(l.projectId, l.id), l]));
    this.inspections = new Map((d.inspections ?? []).map((i) => [i.procoreId, i]));
    this.ncrs = new Map((d.ncrs ?? []).map((n) => [n.procoreId, n]));
    this.tests = new Map((d.tests ?? []).map((t) => [t.id, t]));
    this.quantities = new Map((d.quantities ?? []).map((q) => [q.id, q]));
    this.claimPeriods = new Map((d.claimPeriods ?? []).map((c) => [c.id, c]));
    this.claimLines = new Map((d.claimLines ?? []).map((c) => [c.id, c]));
    this.webhookEvents = d.webhookEvents ?? [];
    this.history = d.history ?? [];
  }

  private key(projectId: number, lotId: string): string {
    return `${projectId}:${lotId}`;
  }

  async createLot(lot: Lot): Promise<Lot> {
    const k = this.key(lot.projectId, lot.id);
    if (this.lots.has(k)) throw new Error(`Lot ${lot.id} already exists in project ${lot.projectId}`);
    this.lots.set(k, { ...lot });
    return lot;
  }

  async getLot(projectId: number, lotId: string): Promise<Lot | null> {
    return this.lots.get(this.key(projectId, lotId)) ?? null;
  }

  async listLots(projectId: number, filter?: { status?: Lot['status']; workType?: string }): Promise<Lot[]> {
    return [...this.lots.values()]
      .filter((l) => l.projectId === projectId)
      .filter((l) => !filter?.status || l.status === filter.status)
      .filter((l) => !filter?.workType || l.workType === filter.workType)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async updateLot(lot: Lot): Promise<Lot> {
    const k = this.key(lot.projectId, lot.id);
    if (!this.lots.has(k)) throw new Error(`Lot ${lot.id} not found`);
    this.lots.set(k, { ...lot });
    return lot;
  }

  async nextSequence(projectId: number, workType: string): Promise<number> {
    const prefix = `LOT-${workType.toUpperCase()}-`;
    let max = 0;
    for (const lot of this.lots.values()) {
      if (lot.projectId === projectId && lot.id.startsWith(prefix)) {
        max = Math.max(max, Number.parseInt(lot.id.slice(prefix.length), 10));
      }
    }
    return max + 1;
  }

  async upsertInspection(i: LinkedInspection): Promise<void> {
    this.inspections.set(i.procoreId, { ...i });
  }
  async listInspections(projectId: number, lotId: string): Promise<LinkedInspection[]> {
    return [...this.inspections.values()].filter((i) => i.projectId === projectId && i.lotId === lotId);
  }
  async upsertNcr(n: LinkedNcr): Promise<void> {
    this.ncrs.set(n.procoreId, { ...n });
  }
  async listNcrs(projectId: number, lotId: string): Promise<LinkedNcr[]> {
    return [...this.ncrs.values()].filter((n) => n.projectId === projectId && n.lotId === lotId);
  }

  async createTest(t: TestRecord): Promise<TestRecord> {
    this.tests.set(t.id, { ...t });
    return t;
  }
  async updateTest(t: TestRecord): Promise<TestRecord> {
    if (!this.tests.has(t.id)) throw new Error(`Test ${t.id} not found`);
    this.tests.set(t.id, { ...t });
    return t;
  }
  async getTest(id: string): Promise<TestRecord | null> {
    return this.tests.get(id) ?? null;
  }
  async listTests(projectId: number, lotId: string): Promise<TestRecord[]> {
    return [...this.tests.values()].filter((t) => t.projectId === projectId && t.lotId === lotId);
  }

  async createQuantity(q: QuantityEntry): Promise<QuantityEntry> {
    this.quantities.set(q.id, { ...q });
    return q;
  }
  async listQuantities(projectId: number, lotId: string): Promise<QuantityEntry[]> {
    return [...this.quantities.values()].filter((q) => q.projectId === projectId && q.lotId === lotId);
  }

  async createClaimPeriod(p: ClaimPeriod): Promise<ClaimPeriod> {
    this.claimPeriods.set(p.id, { ...p });
    return p;
  }
  async getClaimPeriod(id: string): Promise<ClaimPeriod | null> {
    return this.claimPeriods.get(id) ?? null;
  }
  async listClaimPeriods(projectId: number): Promise<ClaimPeriod[]> {
    return [...this.claimPeriods.values()]
      .filter((p) => p.projectId === projectId)
      .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  }
  async updateClaimPeriod(p: ClaimPeriod): Promise<ClaimPeriod> {
    this.claimPeriods.set(p.id, { ...p });
    return p;
  }
  async addClaimLine(l: ClaimLine): Promise<ClaimLine> {
    this.claimLines.set(l.id, { ...l });
    return l;
  }
  async listClaimLines(claimPeriodId: string): Promise<ClaimLine[]> {
    return [...this.claimLines.values()].filter((l) => l.claimPeriodId === claimPeriodId);
  }
  async lotClaimedIn(lotId: string): Promise<ClaimPeriod[]> {
    const periodIds = new Set(
      [...this.claimLines.values()].filter((l) => l.lotId === lotId).map((l) => l.claimPeriodId)
    );
    return [...periodIds].map((id) => this.claimPeriods.get(id)!).filter(Boolean);
  }

  async saveConnection(c: Omit<ProcoreConnection, 'id'>): Promise<ProcoreConnection> {
    this.connection = { ...c, id: 1 };
    return this.connection;
  }
  async getConnection(): Promise<ProcoreConnection | null> {
    return this.connection;
  }
  async updateConnection(c: ProcoreConnection): Promise<ProcoreConnection> {
    this.connection = { ...c };
    return this.connection;
  }
  async logWebhookEvent(e: Omit<WebhookEventLog, 'id'>): Promise<void> {
    this.webhookEvents.unshift({ ...e, id: randomUUID() });
    this.webhookEvents = this.webhookEvents.slice(0, 500);
  }
  async listWebhookEvents(limit: number): Promise<WebhookEventLog[]> {
    return this.webhookEvents.slice(0, limit);
  }
}
