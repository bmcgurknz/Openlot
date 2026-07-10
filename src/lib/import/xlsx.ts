import * as XLSX from 'xlsx';
import type { ParsedTable } from './types.js';

/**
 * Parse the first sheet of an XLSX/XLS workbook into a header + data-rows
 * table, mirroring csv.ts's shape so the rest of the import pipeline is
 * format-agnostic. Cell values are stringified (dates/numbers included) —
 * downstream validation (validate.ts / plan.ts) re-parses numbers as needed.
 */
export function parseXlsx(data: ArrayBuffer | Uint8Array): ParsedTable {
  const wb = XLSX.read(data, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return { headers: [], rows: [] };
  const grid = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    blankrows: false,
    raw: false,
    defval: ''
  });
  const [header, ...rest] = grid;
  return {
    headers: (header ?? []).map((h) => String(h ?? '').trim()),
    rows: rest.map((r) => r.map((c) => (c == null ? '' : String(c))))
  };
}
