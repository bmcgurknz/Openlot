import { WORK_TYPES } from '../../types.js';
import type { FieldMapping, ImportAction, ImportField, ImportIssue, ImportRowPlan } from './types.js';

const LOT_ID_RE = /^LOT-([A-Z]{2})-(\d{1,5})$/i;

function get(row: string[], mapping: FieldMapping, field: ImportField): string | undefined {
  for (const key of Object.keys(mapping)) {
    if (mapping[Number(key)] === field) {
      const v = row[Number(key)];
      const trimmed = v?.trim();
      return trimmed ? trimmed : undefined;
    }
  }
  return undefined;
}

/**
 * Build one plan per source row: parsed target fields, the create/update
 * action (create-or-update semantics — an existing Lot ID updates that
 * lot, a new one creates it), and any validation issues. Nothing is
 * written to the repository here (see run.ts) so this is safe to re-run
 * as the user adjusts the field mapping or excludes rows.
 */
export function planImport(
  rows: string[][],
  mapping: FieldMapping,
  existingLotIds: ReadonlySet<string>
): ImportRowPlan[] {
  const seenInFile = new Set<string>();

  return rows.map((row, i) => {
    const rowNum = i + 2; // header is row 1
    const issues: ImportIssue[] = [];
    const lotIdRaw = get(row, mapping, 'lotId');
    let lotId: string | null = null;

    if (!lotIdRaw) {
      issues.push({ row: rowNum, level: 'error', message: 'Missing Lot ID.' });
    } else {
      const m = LOT_ID_RE.exec(lotIdRaw);
      if (!m) {
        issues.push({ row: rowNum, level: 'error', message: `"${lotIdRaw}" is not a LOT-XX-NNNN identifier.` });
      } else {
        // Normalise to the canonical 4-digit-padded form so imports with
        // unpadded sequences (e.g. "LOT-EW-2") still match an existing
        // "LOT-EW-0002" for update detection.
        lotId = `LOT-${m[1]!.toUpperCase()}-${m[2]!.padStart(4, '0')}`;
        if (!(m[1]!.toUpperCase() in WORK_TYPES)) {
          issues.push({ row: rowNum, level: 'error', message: `Unknown work type "${m[1]}" in "${lotIdRaw}".` });
        }
        if (seenInFile.has(lotId)) {
          issues.push({ row: rowNum, level: 'error', message: `Duplicate ${lotId} appears more than once in this file.` });
        }
        seenInFile.add(lotId);
      }
    }

    const description = get(row, mapping, 'description') ?? null;
    if (!description) {
      issues.push({ row: rowNum, level: 'warning', message: 'No description — the Lot ID will be used instead.' });
    }

    const workTypeFromCol = get(row, mapping, 'workType')?.toUpperCase();
    const workTypeFromId = lotId ? LOT_ID_RE.exec(lotId)?.[1]?.toUpperCase() : undefined;
    if (workTypeFromCol && workTypeFromId && workTypeFromCol !== workTypeFromId) {
      issues.push({
        row: rowNum,
        level: 'warning',
        message: `Work type column ("${workTypeFromCol}") disagrees with the Lot ID prefix ("${workTypeFromId}"); the ID prefix wins.`
      });
    }

    const quantityRaw = get(row, mapping, 'quantity');
    let quantity: number | null = null;
    if (quantityRaw) {
      const n = Number(quantityRaw.replace(/,/g, ''));
      if (Number.isNaN(n)) {
        issues.push({ row: rowNum, level: 'warning', message: `Quantity "${quantityRaw}" is not a number — left blank.` });
      } else {
        quantity = n;
      }
    }

    const hasBlockingError = issues.some((iss) => iss.level === 'error');
    const action: ImportAction = hasBlockingError || !lotId ? 'skip' : existingLotIds.has(lotId) ? 'update' : 'create';

    const plan: ImportRowPlan = {
      row: rowNum,
      lotId,
      action,
      fields: {
        lotId,
        description,
        workType: workTypeFromId ?? workTypeFromCol ?? null,
        specReference: get(row, mapping, 'specReference') ?? null,
        costCode: get(row, mapping, 'costCode') ?? null,
        paymentItemNumber: get(row, mapping, 'paymentItemNumber') ?? null,
        quantity,
        uom: get(row, mapping, 'uom') ?? null,
        status: get(row, mapping, 'status') ?? null,
        builder: get(row, mapping, 'builder') ?? null,
        stage: get(row, mapping, 'stage') ?? null,
        owner: get(row, mapping, 'owner') ?? null,
        notes: get(row, mapping, 'notes') ?? null
      },
      issues,
      included: !hasBlockingError
    };
    return plan;
  });
}

export function existingLotIdSet(lots: Array<{ id: string }>): Set<string> {
  return new Set(lots.map((l) => l.id.toUpperCase()));
}
