/**
 * Executes an already-validated bulk-import plan through the same `api`
 * client every other page uses (web/src/api.ts). That client already
 * abstracts the two editions — HTTP calls against the server edition,
 * direct in-browser LotService calls against the static edition — so this
 * file contains no edition-specific branching and no duplicated domain
 * logic; it only sequences the same create/update/transition calls a user
 * clicking through the UI one lot at a time would make.
 */
import { api, ApiError } from './api';
import { parseLotId } from '../../src/lib/lot-id.js';
import type { ImportRowPlan } from '../../src/lib/import/types.js';

export interface ImportRunResult {
  created: number;
  updated: number;
  skipped: number;
  failed: Array<{ row: number; lotId: string | null; message: string }>;
}

/** Only forward a value into an update payload when the source row actually had one. */
function maybe(target: Record<string, unknown>, key: string, v: unknown): void {
  if (v !== null && v !== undefined && v !== '') target[key] = v;
}

export async function runImportPlan(
  projectId: number,
  plans: ImportRowPlan[],
  opts: { createdBy?: string; updateExisting?: boolean } = {}
): Promise<ImportRunResult> {
  const updateExisting = opts.updateExisting ?? true;
  const result: ImportRunResult = { created: 0, updated: 0, skipped: 0, failed: [] };

  for (const plan of plans) {
    if (!plan.included || plan.action === 'skip' || !plan.lotId) {
      result.skipped++;
      continue;
    }
    try {
      if (plan.action === 'create') {
        const { workType, sequence } = parseLotId(plan.lotId);
        await api.createLot(projectId, {
          workType,
          sequence,
          description: String(plan.fields.description ?? plan.lotId),
          specReference: plan.fields.specReference ?? null,
          costCode: plan.fields.costCode ?? null,
          paymentItemNumber: plan.fields.paymentItemNumber ?? null,
          quantity: plan.fields.quantity ?? null,
          uom: plan.fields.uom ?? null,
          builder: plan.fields.builder ?? null,
          stage: plan.fields.stage ?? null,
          owner: plan.fields.owner ?? null,
          notes: plan.fields.notes ?? null,
          createdBy: opts.createdBy || 'bulk import'
        });
        const status = String(plan.fields.status ?? '').toLowerCase().trim();
        if (status === 'work complete' || status === 'work_complete') {
          // Evidence isn't available from a register export, so conformed/
          // closed states are never recreated — the gate stays honest.
          await api.transition(projectId, plan.lotId, 'work_complete', undefined, opts.createdBy);
        }
        result.created++;
      } else {
        if (!updateExisting) {
          result.skipped++;
          continue;
        }
        const fields: Record<string, unknown> = {};
        maybe(fields, 'description', plan.fields.description);
        maybe(fields, 'specReference', plan.fields.specReference);
        maybe(fields, 'costCode', plan.fields.costCode);
        maybe(fields, 'paymentItemNumber', plan.fields.paymentItemNumber);
        maybe(fields, 'quantity', plan.fields.quantity);
        maybe(fields, 'uom', plan.fields.uom);
        maybe(fields, 'builder', plan.fields.builder);
        maybe(fields, 'stage', plan.fields.stage);
        maybe(fields, 'owner', plan.fields.owner);
        maybe(fields, 'notes', plan.fields.notes);
        await api.updateLot(projectId, plan.lotId, fields, opts.createdBy);
        result.updated++;
      }
    } catch (err) {
      result.failed.push({
        row: plan.row,
        lotId: plan.lotId,
        message: err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Import failed'
      });
    }
  }

  return result;
}
