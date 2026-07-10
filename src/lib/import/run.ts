import type { LotService } from '../../services/lots.js';
import type { ImportRowPlan } from './types.js';

export interface ImportRunResult {
  created: number;
  updated: number;
  skipped: number;
  failed: Array<{ row: number; lotId: string | null; message: string }>;
}

const LOT_ID_RE = /^LOT-([A-Z]{2})-(\d{1,5})$/i;

/** Only forward a value into an update payload when the source actually had one. */
function orUndef<T>(v: T | null | undefined): T | undefined {
  return v == null ? undefined : v;
}

/**
 * Executes an already-validated import plan against the domain services —
 * create-or-update semantics: a Lot ID not yet in the register is created,
 * one that already exists is updated in place (blank source cells never
 * clobber existing data; only columns with a value for that row are
 * written). Rows the user excluded, or that plan.ts marked 'skip', are
 * counted but not touched. Every write goes through LotService/ClaimService
 * so the usual audit history and validation rules apply.
 */
export async function runImportPlan(
  lots: LotService,
  projectId: number,
  plans: ImportRowPlan[],
  opts: { createdBy?: string; updateExisting?: boolean } = {}
): Promise<ImportRunResult> {
  const updateExisting = opts.updateExisting ?? true;
  const result: ImportRunResult = { created: 0, updated: 0, skipped: 0, failed: [] };

  for (const plan of plans) {
    if (!plan.included || plan.action === 'skip') {
      result.skipped++;
      continue;
    }
    try {
      if (plan.action === 'create') {
        const m = LOT_ID_RE.exec(plan.lotId!);
        if (!m) throw new Error(`"${plan.lotId}" is not a valid Lot ID.`);
        await lots.create({
          projectId,
          workType: m[1]!.toUpperCase(),
          sequence: Number(m[2]),
          description: String(plan.fields.description ?? plan.lotId),
          specReference: plan.fields.specReference as string | null,
          costCode: plan.fields.costCode as string | null,
          paymentItemNumber: plan.fields.paymentItemNumber as string | null,
          quantity: plan.fields.quantity as number | null,
          uom: plan.fields.uom as string | null,
          builder: plan.fields.builder as string | null,
          stage: plan.fields.stage as string | null,
          owner: plan.fields.owner as string | null,
          notes: plan.fields.notes as string | null,
          createdBy: opts.createdBy ?? 'bulk import'
        });
        const status = String(plan.fields.status ?? '').toLowerCase().trim();
        if (status === 'work complete' || status === 'work_complete') {
          // Best effort: evidence isn't available from a register export, so
          // conformed/closed states are never recreated — the gate stays honest.
          await lots.transition(projectId, plan.lotId!, 'work_complete', { actor: opts.createdBy });
        }
        result.created++;
      } else {
        if (!updateExisting) {
          result.skipped++;
          continue;
        }
        await lots.update(
          projectId,
          plan.lotId!,
          {
            description: orUndef(plan.fields.description as string | null),
            specReference: orUndef(plan.fields.specReference as string | null),
            costCode: orUndef(plan.fields.costCode as string | null),
            paymentItemNumber: orUndef(plan.fields.paymentItemNumber as string | null),
            quantity: orUndef(plan.fields.quantity as number | null),
            uom: orUndef(plan.fields.uom as string | null),
            builder: orUndef(plan.fields.builder as string | null),
            stage: orUndef(plan.fields.stage as string | null),
            owner: orUndef(plan.fields.owner as string | null),
            notes: orUndef(plan.fields.notes as string | null)
          },
          opts.createdBy
        );
        result.updated++;
      }
    } catch (err) {
      result.failed.push({
        row: plan.row,
        lotId: plan.lotId,
        message: err instanceof Error ? err.message : 'Import failed'
      });
    }
  }

  return result;
}
