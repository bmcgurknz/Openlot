import { WORK_TYPES, type WorkTypeCode } from '../types.js';

/**
 * Lot ID convention: LOT-[WT]-[NNNN]
 *  - WT: two-letter work type (see WORK_TYPES)
 *  - NNNN: four-digit sequential within work type; never reused, gaps allowed
 *
 * Chainage and location belong in the lot description, never in the ID:
 * IDs must stay short, sortable and typo-resistant on mobile.
 */

const CANONICAL = /^LOT-([A-Z]{2})-(\d{4})$/;

/**
 * Loose pattern used to *find* a lot ID inside free text (inspection titles,
 * observation titles, photo captions, daily-log comments). Tolerates lower
 * case, en-dashes typed on mobile keyboards, and missing zero padding.
 */
const IN_TEXT = /\bLOT[\s\-–—_]*([A-Za-z]{2})[\s\-–—_]*(\d{1,4})\b/i;

export function isValidLotId(id: string): boolean {
  const m = CANONICAL.exec(id);
  if (!m) return false;
  return m[1]! in WORK_TYPES;
}

export function isKnownWorkType(code: string): code is WorkTypeCode {
  return code in WORK_TYPES;
}

/** Build a canonical lot ID from parts. Throws on unknown work type. */
export function buildLotId(workType: string, sequence: number): string {
  const wt = workType.toUpperCase();
  if (!isKnownWorkType(wt)) {
    throw new Error(`Unknown work type "${workType}". Expected one of: ${Object.keys(WORK_TYPES).join(', ')}`);
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 9999) {
    throw new Error(`Lot sequence must be an integer between 1 and 9999, got ${sequence}`);
  }
  return `LOT-${wt}-${String(sequence).padStart(4, '0')}`;
}

export interface ParsedLotId {
  lotId: string;
  workType: WorkTypeCode;
  sequence: number;
}

/**
 * Extract the first lot ID found in a block of free text and normalise it
 * to canonical form. Returns null when no recognisable lot ID is present
 * or the work type is not in the standard list (deliberately strict: an
 * unknown work type is more likely a typo than a new convention).
 */
export function extractLotId(text: string): ParsedLotId | null {
  const m = IN_TEXT.exec(text);
  if (!m) return null;
  const wt = m[1]!.toUpperCase();
  if (!isKnownWorkType(wt)) return null;
  const sequence = Number.parseInt(m[2]!, 10);
  if (sequence < 1) return null;
  return { lotId: buildLotId(wt, sequence), workType: wt, sequence };
}

/** Split a canonical lot ID into parts. Throws on invalid input. */
export function parseLotId(id: string): ParsedLotId {
  const m = CANONICAL.exec(id);
  if (!m || !isKnownWorkType(m[1]!)) {
    throw new Error(`"${id}" is not a valid lot ID (expected LOT-XX-NNNN with a known work type)`);
  }
  return { lotId: id, workType: m[1] as WorkTypeCode, sequence: Number.parseInt(m[2]!, 10) };
}
