import type { Repository } from '../db/repository.js';
import { extractLotId } from '../lib/lot-id.js';
import type {
  ProcoreClient,
  ProcoreInspection,
  ProcoreObservation,
  ProcoreQuantityLog
} from '../procore/client.js';
import type { InspectionStatus, NcrStatus, WebhookEventLog } from '../types.js';

/**
 * Sync service: turns Procore records into lot-linked evidence.
 *
 * Linking rule (the whole trick): any Procore inspection, observation or
 * daily-log quantity whose title/notes begin with (or contain) a lot ID
 * in the LOT-XX-NNNN convention is automatically attached to that lot.
 * Field teams keep working in Procore exactly as they do under "lot
 * lite"; OpenLot supplies the register, status engine and claim gate on
 * top — no new data entry.
 */

export function mapInspectionStatus(i: ProcoreInspection): InspectionStatus {
  if ((i.deficient_item_count ?? 0) > 0) return 'failed';
  switch (i.status) {
    case 'closed':
    case 'complete':
      return 'passed';
    case 'in_progress':
      return 'in_progress';
    case 'not_applicable':
      return 'not_applicable';
    default:
      return 'open';
  }
}

export function mapObservationStatus(o: ProcoreObservation): NcrStatus {
  switch (o.status) {
    case 'closed':
      return 'closed';
    case 'ready_for_review':
      return 'ready_for_review';
    case 'not_accepted':
    case 'void':
      return 'void';
    default:
      return 'open';
  }
}

/** True when an observation should be treated as an NCR. */
export function isNcr(o: ProcoreObservation): boolean {
  const type = o.type?.name?.toLowerCase() ?? '';
  return type.includes('non-conformance') || type.includes('non conformance') || type.includes('ncr');
}

export interface ProcoreWebhookPayload {
  id?: number;
  timestamp?: string;
  resource_name: string; // e.g. "Checklist Lists", "Observations"
  event_type: string; // "create" | "update" | "delete"
  resource_id: number;
  project_id: number | null;
  company_id?: number;
}

export class SyncService {
  constructor(
    private repo: Repository,
    private procore: ProcoreClient
  ) {}

  /** Handle one webhook delivery. Always resolves; outcome is logged for audit. */
  async handleWebhook(payload: ProcoreWebhookPayload): Promise<WebhookEventLog['outcome']> {
    const base = {
      receivedAt: new Date().toISOString(),
      resourceName: payload.resource_name,
      eventType: payload.event_type,
      resourceId: payload.resource_id,
      projectId: payload.project_id
    };
    try {
      let outcome: WebhookEventLog['outcome'];
      const resource = payload.resource_name.toLowerCase();
      if (!payload.project_id) {
        outcome = 'ignored_resource';
      } else if (resource.includes('checklist')) {
        outcome = await this.syncInspection(payload.project_id, payload.resource_id);
      } else if (resource.includes('observation')) {
        outcome = await this.syncObservation(payload.project_id, payload.resource_id);
      } else {
        outcome = 'ignored_resource';
      }
      await this.repo.logWebhookEvent({ ...base, outcome, detail: null });
      return outcome;
    } catch (err) {
      await this.repo.logWebhookEvent({ ...base, outcome: 'error', detail: (err as Error).message });
      return 'error';
    }
  }

  async syncInspection(projectId: number, listId: number): Promise<'linked' | 'ignored_no_lot_id'> {
    const insp = await this.procore.getInspection(projectId, listId);
    return this.ingestInspection(projectId, insp);
  }

  async ingestInspection(projectId: number, insp: ProcoreInspection): Promise<'linked' | 'ignored_no_lot_id'> {
    const parsed = extractLotId(insp.name);
    if (!parsed) return 'ignored_no_lot_id';
    await this.repo.upsertInspection({
      procoreId: insp.id,
      lotId: parsed.lotId,
      projectId,
      title: insp.name,
      templateName: insp.list_template_name ?? null,
      status: mapInspectionStatus(insp),
      inspectionDate: insp.inspection_date,
      itemsTotal: insp.item_count ?? 0,
      itemsPassed: insp.conforming_item_count ?? 0,
      itemsFailed: insp.deficient_item_count ?? 0,
      updatedAt: new Date().toISOString()
    });
    return 'linked';
  }

  async syncObservation(projectId: number, observationId: number): Promise<'linked' | 'ignored_no_lot_id' | 'ignored_resource'> {
    const obs = await this.procore.getObservation(observationId, projectId);
    return this.ingestObservation(projectId, obs);
  }

  async ingestObservation(
    projectId: number,
    obs: ProcoreObservation
  ): Promise<'linked' | 'ignored_no_lot_id' | 'ignored_resource'> {
    if (!isNcr(obs)) return 'ignored_resource';
    const parsed = extractLotId(obs.name);
    if (!parsed) return 'ignored_no_lot_id';
    const status = mapObservationStatus(obs);
    await this.repo.upsertNcr({
      procoreId: obs.id,
      lotId: parsed.lotId,
      projectId,
      title: obs.name,
      status,
      createdAt: obs.created_at,
      closedAt: status === 'closed' ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString()
    });
    return 'linked';
  }

  async ingestQuantityLog(projectId: number, log: ProcoreQuantityLog): Promise<'linked' | 'ignored_no_lot_id'> {
    // Fixed 2026-07-10: the field holding the lot ID text is `description`,
    // not `notes` — `notes` doesn't exist on this Procore resource at all,
    // so this lookup was previously always empty and no quantity log could
    // ever auto-link to a lot. Confirmed against the Procore OAS.
    const parsed = extractLotId(log.description ?? '');
    if (!parsed) return 'ignored_no_lot_id';
    await this.repo.createQuantity({
      id: crypto.randomUUID(),
      lotId: parsed.lotId,
      projectId,
      source: 'daily_log',
      procoreId: log.id,
      date: log.date,
      quantity: log.quantity,
      uom: log.unit,
      costCode: log.cost_code?.name ?? null,
      notes: log.description
    });
    return 'linked';
  }

  /**
   * Full pull sync for a project — used at first connection and as a
   * nightly reconciliation net under webhooks (webhooks are at-least-once
   * but not guaranteed; a scheduled pull keeps the register honest).
   */
  async fullSync(projectId: number): Promise<{ inspections: number; ncrs: number; quantities: number }> {
    let inspections = 0;
    let ncrs = 0;
    let quantities = 0;

    for (let page = 1; ; page++) {
      const batch = await this.procore.listInspections(projectId, page);
      if (batch.length === 0) break;
      for (const insp of batch) {
        if ((await this.ingestInspection(projectId, insp)) === 'linked') inspections++;
      }
      if (batch.length < 100) break;
    }

    for (let page = 1; ; page++) {
      const batch = await this.procore.listObservations(projectId, page);
      if (batch.length === 0) break;
      for (const obs of batch) {
        if ((await this.ingestObservation(projectId, obs)) === 'linked') ncrs++;
      }
      if (batch.length < 100) break;
    }

    const logs = await this.procore.listQuantityLogs(projectId);
    for (const log of logs) {
      if ((await this.ingestQuantityLog(projectId, log)) === 'linked') quantities++;
    }

    return { inspections, ncrs, quantities };
  }

  /** Register the OpenLot webhook hook + triggers against the connected company. */
  async registerWebhooks(companyId: number): Promise<{ hookId: number; triggers: number }> {
    const destination = `${process.env.APP_BASE_URL ?? ''}/webhooks/procore`;
    const hook = await this.procore.createWebhookHook(companyId, destination);
    const wanted: Array<[string, 'create' | 'update' | 'delete']> = [
      ['Checklist Lists', 'create'],
      ['Checklist Lists', 'update'],
      ['Observations', 'create'],
      ['Observations', 'update']
    ];
    let triggers = 0;
    for (const [resource, event] of wanted) {
      await this.procore.createWebhookTrigger(companyId, hook.id, resource, event);
      triggers++;
    }
    return { hookId: hook.id, triggers };
  }
}
