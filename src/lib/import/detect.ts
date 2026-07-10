import type { DetectedFormat } from './types.js';

/**
 * Detect the import file format from its name and, for ambiguous cases,
 * the leading bytes. XLSX/XLSM files are zip archives (magic bytes
 * `PK\x03\x04`); everything else is treated as delimited text.
 */
export function detectFormat(filename: string, head?: Uint8Array): DetectedFormat {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (ext === 'xlsx' || ext === 'xlsm' || ext === 'xls') return 'xlsx';
  if (ext === 'csv' || ext === 'txt' || ext === 'tsv') return 'csv';
  if (head && head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
    return 'xlsx';
  }
  if (head && head.length > 0) return 'csv'; // unknown extension but readable bytes: assume delimited text
  return 'unknown';
}
