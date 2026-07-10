import type { ParsedTable } from './types.js';

/**
 * Small RFC4180-ish CSV parser: handles quoted fields, embedded commas and
 * newlines, and "" escaped quotes. Shared by the register CSV importer
 * (web/src/local.ts) and the bulk import wizard.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

/** Split parsed CSV rows into a header row + data rows table. */
export function toTable(rows: string[][]): ParsedTable {
  const [header, ...rest] = rows;
  return { headers: (header ?? []).map((h) => h.trim()), rows: rest };
}

export function parseCsvTable(text: string): ParsedTable {
  return toTable(parseCsv(text));
}
