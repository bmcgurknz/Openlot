import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type {
  ClaimLine,
  LotHistoryEntry,
  ClaimPeriod,
  LinkedInspection,
  LinkedNcr,
  Lot,
  ProcoreConnection,
  QuantityEntry,
  TestRecord,
  WebhookEventLog
} from '../types.js';
import type { Repository } from './repository.js';

/* Row mappers -------------------------------------------------------- */

const d = (v: unknown): string | null => (v == null ? null : new Date(v as string).toISOString().slice(0, 10));
const ts = (v: unknown): string => new Date(v as string).toISOString();
const num = (v: unknown): number | null => (v == null ? null : Number(v));

function rowToLot(r: Record<string, unknown>): Lot {
  return {
    id: r.id as string,
    projectId: Number(r.project_id),
    description: r.description as string,
    workType: r.work_type as Lot['workType'],
    specReference: (r.spec_reference as string) ?? null,
    costCode: (r.cost_code as string) ?? null,
    quantity: num(r.quantity),
    uom: (r.uom as string) ?? null,
    status: r.status as Lot['status'],
    openedAt: d(r.opened_at)!,
    workCompleteAt: d(r.work_complete_at),
    conformedAt: d(r.conformed_at),
    closedAt: d(r.closed_at),
    supersededBy: (r.superseded_by as string) ?? null,
    holdPointReleased: Boolean(r.hold_point_released),
    holdPointReleasedBy: (r.hold_point_released_by as string) ?? null,
    holdPointReleasedAt: d(r.hold_point_released_at),
    paymentItemNumber: (r.payment_item_number as string) ?? null,
    geoStart: (r.geo_start as string) ?? null,
    geoEnd: (r.geo_end as string) ?? null,
    geoDatum: (r.geo_datum as string) ?? null,
    builder: (r.builder as string) ?? null,
    stage: (r.stage as string) ?? null,
    owner: (r.owner as string) ?? null,
    notes: (r.notes as string) ?? null,
    createdBy: (r.created_by as string) ?? null,
    createdAt: ts(r.created_at),
    updatedAt: ts(r.updated_at)
  };
}

function rowToInspection(r: Record<string, unknown>): LinkedInspection {
  return {
    procoreId: Number(r.procore_id),
    lotId: r.lot_id as string,
    projectId: Number(r.project_id),
    title: r.title as string,
    templateName: (r.template_name as string) ?? null,
    status: r.status as LinkedInspection['status'],
    inspectionDate: d(r.inspection_date),
    itemsTotal: Number(r.items_total),
    itemsPassed: Number(r.items_passed),
    itemsFailed: Number(r.items_failed),
    updatedAt: ts(r.updated_at)
  };
}

function rowToNcr(r: Record<string, unknown>): LinkedNcr {
  return {
    procoreId: Number(r.procore_id),
    lotId: r.lot_id as string,
    projectId: Number(r.project_id),
    title: r.title as string,
    status: r.status as LinkedNcr['status'],
    createdAt: ts(r.created_at),
    closedAt: r.closed_at ? ts(r.closed_at) : null,
    updatedAt: ts(r.updated_at)
  };
}

function rowToTest(r: Record<string, unknown>): TestRecord {
  return {
    id: r.id as string,
    lotId: r.lot_id as string,
    projectId: Number(r.project_id),
    testType: r.test_type as string,
    labReference: (r.lab_reference as string) ?? null,
    status: r.status as TestRecord['status'],
    requestedAt: d(r.requested_at)!,
    resultAt: d(r.result_at),
    documentUrl: (r.document_url as string) ?? null,
    notes: (r.notes as string) ?? null,
    updatedAt: ts(r.updated_at)
  };
}

function rowToQuantity(r: Record<string, unknown>): QuantityEntry {
  return {
    id: r.id as string,
    lotId: r.lot_id as string,
    projectId: Number(r.project_id),
    source: r.source as QuantityEntry['source'],
    procoreId: r.procore_id == null ? null : Number(r.procore_id),
    date: d(r.date)!,
    quantity: Number(r.quantity),
    uom: r.uom as string,
    costCode: (r.cost_code as string) ?? null,
    notes: (r.notes as string) ?? null
  };
}

function rowToClaimPeriod(r: Record<string, unknown>): ClaimPeriod {
  return {
    id: r.id as string,
    projectId: Number(r.project_id),
    label: r.label as string,
    periodStart: d(r.period_start)!,
    periodEnd: d(r.period_end)!,
    status: r.status as ClaimPeriod['status'],
    issuedAt: r.issued_at ? ts(r.issued_at) : null,
    createdAt: ts(r.created_at),
    createdBy: (r.created_by as string) ?? null
  };
}

function rowToHistory(r: Record<string, unknown>): LotHistoryEntry {
  return {
    id: r.id as string,
    projectId: Number(r.project_id),
    lotId: r.lot_id as string,
    at: ts(r.at),
    user: r.user as string,
    field: r.field as string,
    previousValue: (r.previous_value as string) ?? null,
    newValue: (r.new_value as string) ?? null
  };
}

function rowToClaimLine(r: Record<string, unknown>): ClaimLine {
  return {
    id: r.id as string,
    claimPeriodId: r.claim_period_id as string,
    lotId: r.lot_id as string,
    quantity: Number(r.quantity),
    uom: r.uom as string,
    costCode: (r.cost_code as string) ?? null,
    conformedAt: d(r.conformed_at)!,
    createdAt: ts(r.created_at)
  };
}

/* Repository ---------------------------------------------------------- */

export class PgRepository implements Repository {
  constructor(private pool: Pool) {}

  async createLot(lot: Lot): Promise<Lot> {
    await this.pool.query(
      `INSERT INTO lots (id, project_id, description, work_type, spec_reference, cost_code,
         quantity, uom, status, opened_at, hold_point_released, notes, created_by,
         payment_item_number, geo_start, geo_end, geo_datum, created_at, builder, stage, owner)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [
        lot.id, lot.projectId, lot.description, lot.workType, lot.specReference, lot.costCode,
        lot.quantity, lot.uom, lot.status, lot.openedAt, lot.holdPointReleased, lot.notes, lot.createdBy,
        lot.paymentItemNumber, lot.geoStart, lot.geoEnd, lot.geoDatum,
        lot.createdAt, lot.builder, lot.stage, lot.owner
      ]
    );
    return (await this.getLot(lot.projectId, lot.id))!;
  }

  async getLot(projectId: number, lotId: string): Promise<Lot | null> {
    const { rows } = await this.pool.query('SELECT * FROM lots WHERE project_id = $1 AND id = $2', [projectId, lotId]);
    return rows[0] ? rowToLot(rows[0]) : null;
  }

  async listLots(projectId: number, filter?: { status?: Lot['status']; workType?: string }): Promise<Lot[]> {
    const conditions = ['project_id = $1'];
    const params: unknown[] = [projectId];
    if (filter?.status) {
      params.push(filter.status);
      conditions.push(`status = $${params.length}`);
    }
    if (filter?.workType) {
      params.push(filter.workType);
      conditions.push(`work_type = $${params.length}`);
    }
    const { rows } = await this.pool.query(
      `SELECT * FROM lots WHERE ${conditions.join(' AND ')} ORDER BY id`,
      params
    );
    return rows.map(rowToLot);
  }

  async updateLot(lot: Lot): Promise<Lot> {
    await this.pool.query(
      `UPDATE lots SET description=$3, work_type=$4, spec_reference=$5, cost_code=$6, quantity=$7,
         uom=$8, status=$9, opened_at=$10, work_complete_at=$11, conformed_at=$12, closed_at=$13,
         superseded_by=$14, hold_point_released=$15, notes=$16,
         payment_item_number=$17, geo_start=$18, geo_end=$19, geo_datum=$20,
         hold_point_released_by=$21, hold_point_released_at=$22,
         builder=$23, stage=$24, owner=$25, updated_at=now()
       WHERE project_id=$1 AND id=$2`,
      [
        lot.projectId, lot.id, lot.description, lot.workType, lot.specReference, lot.costCode,
        lot.quantity, lot.uom, lot.status, lot.openedAt, lot.workCompleteAt, lot.conformedAt,
        lot.closedAt, lot.supersededBy, lot.holdPointReleased, lot.notes,
        lot.paymentItemNumber, lot.geoStart, lot.geoEnd, lot.geoDatum,
        lot.holdPointReleasedBy, lot.holdPointReleasedAt,
        lot.builder, lot.stage, lot.owner
      ]
    );
    return (await this.getLot(lot.projectId, lot.id))!;
  }

  async nextSequence(projectId: number, workType: string): Promise<number> {
    const prefix = `LOT-${workType.toUpperCase()}-`;
    const { rows } = await this.pool.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(id FROM 8) AS INT)), 0) AS max_seq
       FROM lots WHERE project_id = $1 AND id LIKE $2`,
      [projectId, `${prefix}%`]
    );
    return Number(rows[0].max_seq) + 1;
  }

  async upsertInspection(i: LinkedInspection): Promise<void> {
    await this.pool.query(
      `INSERT INTO linked_inspections (procore_id, lot_id, project_id, title, template_name, status,
         inspection_date, items_total, items_passed, items_failed, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
       ON CONFLICT (procore_id) DO UPDATE SET
         lot_id=EXCLUDED.lot_id, title=EXCLUDED.title, template_name=EXCLUDED.template_name,
         status=EXCLUDED.status, inspection_date=EXCLUDED.inspection_date,
         items_total=EXCLUDED.items_total, items_passed=EXCLUDED.items_passed,
         items_failed=EXCLUDED.items_failed, updated_at=now()`,
      [i.procoreId, i.lotId, i.projectId, i.title, i.templateName, i.status, i.inspectionDate,
       i.itemsTotal, i.itemsPassed, i.itemsFailed]
    );
  }

  async listInspections(projectId: number, lotId: string): Promise<LinkedInspection[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM linked_inspections WHERE project_id=$1 AND lot_id=$2 ORDER BY title',
      [projectId, lotId]
    );
    return rows.map(rowToInspection);
  }

  async upsertNcr(n: LinkedNcr): Promise<void> {
    await this.pool.query(
      `INSERT INTO linked_ncrs (procore_id, lot_id, project_id, title, status, created_at, closed_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,now())
       ON CONFLICT (procore_id) DO UPDATE SET
         lot_id=EXCLUDED.lot_id, title=EXCLUDED.title, status=EXCLUDED.status,
         closed_at=EXCLUDED.closed_at, updated_at=now()`,
      [n.procoreId, n.lotId, n.projectId, n.title, n.status, n.createdAt, n.closedAt]
    );
  }

  async listNcrs(projectId: number, lotId: string): Promise<LinkedNcr[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM linked_ncrs WHERE project_id=$1 AND lot_id=$2 ORDER BY created_at',
      [projectId, lotId]
    );
    return rows.map(rowToNcr);
  }

  async createTest(t: TestRecord): Promise<TestRecord> {
    await this.pool.query(
      `INSERT INTO test_records (id, lot_id, project_id, test_type, lab_reference, status,
         requested_at, result_at, document_url, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [t.id, t.lotId, t.projectId, t.testType, t.labReference, t.status, t.requestedAt,
       t.resultAt, t.documentUrl, t.notes]
    );
    return t;
  }

  async updateTest(t: TestRecord): Promise<TestRecord> {
    await this.pool.query(
      `UPDATE test_records SET test_type=$2, lab_reference=$3, status=$4, result_at=$5,
         document_url=$6, notes=$7, updated_at=now() WHERE id=$1`,
      [t.id, t.testType, t.labReference, t.status, t.resultAt, t.documentUrl, t.notes]
    );
    return (await this.getTest(t.id))!;
  }

  async getTest(id: string): Promise<TestRecord | null> {
    const { rows } = await this.pool.query('SELECT * FROM test_records WHERE id=$1', [id]);
    return rows[0] ? rowToTest(rows[0]) : null;
  }

  async listTests(projectId: number, lotId: string): Promise<TestRecord[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM test_records WHERE project_id=$1 AND lot_id=$2 ORDER BY requested_at',
      [projectId, lotId]
    );
    return rows.map(rowToTest);
  }

  async createQuantity(q: QuantityEntry): Promise<QuantityEntry> {
    await this.pool.query(
      `INSERT INTO quantity_entries (id, lot_id, project_id, source, procore_id, date, quantity, uom, cost_code, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (procore_id) WHERE procore_id IS NOT NULL DO NOTHING`,
      [q.id, q.lotId, q.projectId, q.source, q.procoreId, q.date, q.quantity, q.uom, q.costCode, q.notes]
    );
    return q;
  }

  async listQuantities(projectId: number, lotId: string): Promise<QuantityEntry[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM quantity_entries WHERE project_id=$1 AND lot_id=$2 ORDER BY date',
      [projectId, lotId]
    );
    return rows.map(rowToQuantity);
  }

  async createClaimPeriod(p: ClaimPeriod): Promise<ClaimPeriod> {
    await this.pool.query(
      `INSERT INTO claim_periods (id, project_id, label, period_start, period_end, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [p.id, p.projectId, p.label, p.periodStart, p.periodEnd, p.status, p.createdBy]
    );
    return (await this.getClaimPeriod(p.id))!;
  }

  async getClaimPeriod(id: string): Promise<ClaimPeriod | null> {
    const { rows } = await this.pool.query('SELECT * FROM claim_periods WHERE id=$1', [id]);
    return rows[0] ? rowToClaimPeriod(rows[0]) : null;
  }

  async listClaimPeriods(projectId: number): Promise<ClaimPeriod[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM claim_periods WHERE project_id=$1 ORDER BY period_end DESC',
      [projectId]
    );
    return rows.map(rowToClaimPeriod);
  }

  async updateClaimPeriod(p: ClaimPeriod): Promise<ClaimPeriod> {
    await this.pool.query(
      'UPDATE claim_periods SET label=$2, period_start=$3, period_end=$4, status=$5, issued_at=$6 WHERE id=$1',
      [p.id, p.label, p.periodStart, p.periodEnd, p.status, p.issuedAt]
    );
    return (await this.getClaimPeriod(p.id))!;
  }

  async addClaimLine(l: ClaimLine): Promise<ClaimLine> {
    await this.pool.query(
      `INSERT INTO claim_lines (id, claim_period_id, lot_id, quantity, uom, cost_code, conformed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [l.id, l.claimPeriodId, l.lotId, l.quantity, l.uom, l.costCode, l.conformedAt]
    );
    return l;
  }

  async listClaimLines(claimPeriodId: string): Promise<ClaimLine[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM claim_lines WHERE claim_period_id=$1 ORDER BY lot_id',
      [claimPeriodId]
    );
    return rows.map(rowToClaimLine);
  }

  async appendHistory(entry: LotHistoryEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO lot_history (id, project_id, lot_id, at, "user", field, previous_value, new_value)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [entry.id, entry.projectId, entry.lotId, entry.at, entry.user, entry.field, entry.previousValue, entry.newValue]
    );
  }

  async listHistory(projectId: number, lotId: string): Promise<LotHistoryEntry[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM lot_history WHERE project_id=$1 AND lot_id=$2 ORDER BY at DESC',
      [projectId, lotId]
    );
    return rows.map(rowToHistory);
  }

  async lotClaimedIn(lotId: string): Promise<ClaimPeriod[]> {
    const { rows } = await this.pool.query(
      `SELECT cp.* FROM claim_periods cp
       JOIN claim_lines cl ON cl.claim_period_id = cp.id
       WHERE cl.lot_id = $1 ORDER BY cp.period_end`,
      [lotId]
    );
    return rows.map(rowToClaimPeriod);
  }

  async saveConnection(c: Omit<ProcoreConnection, 'id'>): Promise<ProcoreConnection> {
    // Single-company deployment: replace any existing connection.
    await this.pool.query('DELETE FROM procore_connections');
    const { rows } = await this.pool.query(
      `INSERT INTO procore_connections (company_id, company_name, access_token_enc, refresh_token_enc, expires_at)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [c.companyId, c.companyName, c.accessTokenEnc, c.refreshTokenEnc, c.expiresAt]
    );
    return this.mapConnection(rows[0]);
  }

  async getConnection(): Promise<ProcoreConnection | null> {
    const { rows } = await this.pool.query('SELECT * FROM procore_connections ORDER BY id DESC LIMIT 1');
    return rows[0] ? this.mapConnection(rows[0]) : null;
  }

  async updateConnection(c: ProcoreConnection): Promise<ProcoreConnection> {
    const { rows } = await this.pool.query(
      `UPDATE procore_connections SET access_token_enc=$2, refresh_token_enc=$3, expires_at=$4, updated_at=now()
       WHERE id=$1 RETURNING *`,
      [c.id, c.accessTokenEnc, c.refreshTokenEnc, c.expiresAt]
    );
    return this.mapConnection(rows[0]);
  }

  private mapConnection(r: Record<string, unknown>): ProcoreConnection {
    return {
      id: Number(r.id),
      companyId: Number(r.company_id),
      companyName: r.company_name as string,
      accessTokenEnc: r.access_token_enc as string,
      refreshTokenEnc: r.refresh_token_enc as string,
      expiresAt: ts(r.expires_at),
      createdAt: ts(r.created_at),
      updatedAt: ts(r.updated_at)
    };
  }

  async logWebhookEvent(e: Omit<WebhookEventLog, 'id'>): Promise<void> {
    await this.pool.query(
      `INSERT INTO webhook_events (id, received_at, resource_name, event_type, resource_id, project_id, outcome, detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [randomUUID(), e.receivedAt, e.resourceName, e.eventType, e.resourceId, e.projectId, e.outcome, e.detail]
    );
  }

  async listWebhookEvents(limit: number): Promise<WebhookEventLog[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM webhook_events ORDER BY received_at DESC LIMIT $1',
      [limit]
    );
    return rows.map((r) => ({
      id: r.id as string,
      receivedAt: ts(r.received_at),
      resourceName: r.resource_name as string,
      eventType: r.event_type as string,
      resourceId: Number(r.resource_id),
      projectId: r.project_id == null ? null : Number(r.project_id),
      outcome: r.outcome as WebhookEventLog['outcome'],
      detail: (r.detail as string) ?? null
    }));
  }
}
