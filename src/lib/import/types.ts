/**
 * Bulk import — shared types for the guided Procore-export import wizard
 * (upload → detect format → validate → preview → resolve issues → confirm
 * → summary). Pure data structures only; file reading lives in csv.ts /
 * xlsx.ts and is driven by the web UI (ImportWizardPage.tsx).
 */

/** Canonical lot fields the wizard can populate. */
export type ImportField =
  | 'lotId'
  | 'description'
  | 'workType'
  | 'specReference'
  | 'costCode'
  | 'paymentItemNumber'
  | 'quantity'
  | 'uom'
  | 'status'
  | 'builder'
  | 'stage'
  | 'owner'
  | 'notes';

export interface ImportFieldDef {
  field: ImportField;
  label: string;
  required: boolean;
}

export const IMPORT_FIELDS: ImportFieldDef[] = [
  { field: 'lotId', label: 'Lot ID', required: true },
  { field: 'description', label: 'Description', required: true },
  { field: 'workType', label: 'Work type', required: false },
  { field: 'specReference', label: 'Spec / ITP ref', required: false },
  { field: 'costCode', label: 'Cost code', required: false },
  { field: 'paymentItemNumber', label: 'Payment item', required: false },
  { field: 'quantity', label: 'Quantity', required: false },
  { field: 'uom', label: 'UoM', required: false },
  { field: 'status', label: 'Status', required: false },
  { field: 'builder', label: 'Builder', required: false },
  { field: 'stage', label: 'Stage', required: false },
  { field: 'owner', label: 'Owner', required: false },
  { field: 'notes', label: 'Notes', required: false }
];

/** Maps a source column index to a canonical field ('' = column ignored). */
export type FieldMapping = Record<number, ImportField | ''>;

export type ImportAction = 'create' | 'update' | 'skip';

export interface ImportIssue {
  row: number; // 1-based source row, header counted as row 1
  level: 'error' | 'warning';
  message: string;
}

export interface ImportRowPlan {
  row: number;
  lotId: string | null;
  action: ImportAction;
  /** Parsed field values, `null` meaning "not present in the source row". */
  fields: Partial<Record<ImportField, string | number | null>>;
  issues: ImportIssue[];
  /** Whether this row is currently slated to run (user-togglable). */
  included: boolean;
}

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

export type DetectedFormat = 'csv' | 'xlsx' | 'unknown';
