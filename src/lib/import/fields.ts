import { IMPORT_FIELDS, type FieldMapping, type ImportField } from './types.js';

/** Header aliases seen in Procore lot-register exports and common spreadsheets. */
const ALIASES: Record<ImportField, string[]> = {
  lotId: ['lot id', 'lotid', 'lot', 'id', 'lot number', 'lot no', 'lot no.'],
  description: ['description', 'desc', 'extent', 'chainage', 'lot description'],
  workType: ['work type', 'worktype', 'type', 'discipline', 'work-type'],
  specReference: ['spec', 'spec reference', 'spec/itp ref', 'itp ref', 'itp', 'specification'],
  costCode: ['cost code', 'costcode', 'cost centre', 'cost center', 'cost code / centre'],
  paymentItemNumber: ['pay item', 'payment item', 'payment item number', 'schedule item', 'payment schedule item'],
  quantity: ['qty', 'quantity'],
  uom: ['uom', 'unit', 'unit of measure', 'units'],
  status: ['status', 'lot status'],
  builder: ['builder', 'purchaser', 'contractor', 'builder / purchaser'],
  stage: ['stage', 'delivery stage', 'release stage'],
  owner: ['owner', 'lot owner'],
  notes: ['notes', 'comments', 'remarks']
};

function normalize(h: string): string {
  return h.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

/**
 * Best-effort automatic column → field mapping from header text. Each
 * canonical field is matched to at most one column; unmatched columns map
 * to '' (ignored) until the user assigns them manually in the wizard.
 */
export function autoMapColumns(headers: string[]): FieldMapping {
  const mapping: FieldMapping = {};
  const used = new Set<ImportField>();
  headers.forEach((raw, i) => {
    const h = normalize(raw);
    let match: ImportField | '' = '';
    for (const { field } of IMPORT_FIELDS) {
      if (used.has(field)) continue;
      if (h === normalize(field) || ALIASES[field].some((a) => h === a)) {
        match = field;
        break;
      }
    }
    mapping[i] = match;
    if (match) used.add(match);
  });
  return mapping;
}
