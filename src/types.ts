/**
 * OpenLot core domain types.
 *
 * A "lot" is the unit of quality conformance in civil construction:
 * one work type + one layer/element + one continuous extent + one
 * conformance decision. Every linked Procore record (inspection,
 * observation/NCR, quantity entry, test result) hangs off a lot.
 */

export type LotStatus =
  | 'open'
  | 'work_complete'
  | 'conformed'
  | 'closed'
  | 'superseded';

/** Work-type codes used in the LOT-[WT]-[NNNN] identifier. */
export const WORK_TYPES = {
  EW: 'Earthworks',
  SW: 'Stormwater',
  SE: 'Sewer',
  WA: 'Water',
  PV: 'Pavements',
  CO: 'Concrete / Structures',
  KF: 'Kerb & Footpath',
  LS: 'Landscaping',
  RA: 'Rail',
  MA: 'Marine',
  TM: 'Traffic / Miscellaneous'
} as const;

export type WorkTypeCode = keyof typeof WORK_TYPES;

export interface Lot {
  id: string; // canonical lot ID, e.g. LOT-EW-0014
  projectId: number; // Procore project id
  description: string; // includes chainage/extent, e.g. "Ch 1200–1350 LHS, select fill layer 2"
  workType: WorkTypeCode;
  specReference: string | null; // e.g. "MRTS04 cl 9.2" or "ITP-EW-01"
  costCode: string | null; // Procore cost code, e.g. "02-210"
  quantity: number | null;
  uom: string | null; // m, m2, m3, lm, t, ea, hr, day, LS
  status: LotStatus;
  openedAt: string; // ISO date
  workCompleteAt: string | null;
  conformedAt: string | null;
  closedAt: string | null;
  supersededBy: string | null; // lot id that replaces this one
  holdPointReleased: boolean; // manual flag for authority hold/witness points
  holdPointReleasedBy: string | null; // ATS 1120 cl 11.6: the Principal's authorised person
  holdPointReleasedAt: string | null; // ISO date of release (cl 11.1: release must be recorded)
  paymentItemNumber: string | null; // ATS 1120 cl 10.1(e): payment schedule item for this lot
  geoStart: string | null; // ATS 1120 cl 10.4: start lat,long in decimal degrees (pavement lots)
  geoEnd: string | null; // ATS 1120 cl 10.4: end lat,long in decimal degrees (pavement lots)
  geoDatum: string | null; // ATS 1120 cl 10.4: datum, e.g. GDA2020 (accuracy ±5 m)
  builder: string | null; // builder/purchaser assigned to the lot (subdivisions)
  stage: string | null; // delivery stage, e.g. "Stage 2"
  owner: string | null; // lot owner
  notes: string | null;
  createdBy: string | null;
  createdAt: string; // ISO datetime the record was created
  updatedAt: string;
}

export type InspectionStatus = 'open' | 'in_progress' | 'passed' | 'failed' | 'not_applicable';

export interface LinkedInspection {
  procoreId: number;
  lotId: string;
  projectId: number;
  title: string;
  templateName: string | null;
  status: InspectionStatus;
  inspectionDate: string | null;
  itemsTotal: number;
  itemsPassed: number;
  itemsFailed: number;
  updatedAt: string;
}

export type NcrStatus = 'open' | 'ready_for_review' | 'closed' | 'void';

export interface LinkedNcr {
  procoreId: number;
  lotId: string;
  projectId: number;
  title: string;
  status: NcrStatus;
  createdAt: string;
  closedAt: string | null;
  updatedAt: string;
}

export type TestStatus = 'requested' | 'sampled' | 'results_received' | 'passed' | 'failed';

export interface TestRecord {
  id: string; // uuid
  lotId: string;
  projectId: number;
  testType: string; // e.g. "Compaction (AS 1289.5.4.1)"
  labReference: string | null; // NATA report number
  status: TestStatus;
  requestedAt: string;
  resultAt: string | null;
  documentUrl: string | null; // link to Procore Documents
  notes: string | null;
  updatedAt: string;
}

export interface QuantityEntry {
  id: string;
  lotId: string;
  projectId: number;
  source: 'daily_log' | 'manual';
  procoreId: number | null; // daily log quantity entry id if synced
  date: string;
  quantity: number;
  uom: string;
  costCode: string | null;
  notes: string | null;
}

export type ClaimPeriodStatus = 'open' | 'issued' | 'certified';

export interface ClaimPeriod {
  id: string;
  projectId: number;
  label: string; // e.g. "2026-07 Progress Claim 14"
  periodStart: string;
  periodEnd: string;
  status: ClaimPeriodStatus;
  issuedAt: string | null;
  createdAt: string;
  createdBy: string | null; // who created the claim period
}

export interface ClaimLine {
  id: string;
  claimPeriodId: string;
  lotId: string;
  quantity: number;
  uom: string;
  costCode: string | null;
  conformedAt: string; // snapshot at time of claim
  createdAt: string;
}

/** Result of the conformance engine's evaluation of a single lot. */
export interface ConformanceEvaluation {
  lotId: string;
  eligible: boolean; // may the lot transition to `conformed`?
  blockers: ConformanceBlocker[];
  checkedAt: string;
}

export interface ConformanceBlocker {
  code:
    | 'NO_INSPECTIONS_LINKED'
    | 'INSPECTION_NOT_PASSED'
    | 'OPEN_NCR'
    | 'TEST_OUTSTANDING'
    | 'TEST_FAILED'
    | 'HOLD_POINT_NOT_RELEASED'
    | 'PAVEMENT_GEO_MISSING'
    | 'LOT_SUPERSEDED'
    | 'LOT_CLOSED';
  message: string;
  reference?: string; // e.g. inspection title or NCR id
}

export interface ProcoreConnection {
  id: number;
  companyId: number;
  companyName: string;
  accessTokenEnc: string;
  refreshTokenEnc: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookEventLog {
  id: string;
  receivedAt: string;
  resourceName: string;
  eventType: string;
  resourceId: number;
  projectId: number | null;
  outcome: 'linked' | 'ignored_no_lot_id' | 'ignored_resource' | 'error';
  detail: string | null;
}

/** One read-only audit-trail entry against a lot (newest first in lists). */
export interface LotHistoryEntry {
  id: string;
  projectId: number;
  lotId: string;
  at: string; // ISO datetime
  user: string;
  field: string; // e.g. "Status", "Builder", "Progress claim"
  previousValue: string | null;
  newValue: string | null;
}

/**
 * Reporting dashboard types — the cross-tool "reporting mechanism" layer.
 * Unlike lots/inspections/NCRs (which OpenLot links and stores its own
 * projection of), these are read live from Procore on each request and
 * never persisted: the whole point is to reflect exactly what's already
 * in Procore's tools, with a link back to the source record, not to own
 * a second copy of the data.
 */
export type ReportCategory = 'quality_safety' | 'field_productivity' | 'project_controls';

export interface ReportItem {
  /** Composite of tool + Procore record id; unique within a category. */
  id: string;
  tool: string; // e.g. "Inspections", "Incidents", "RFIs"
  title: string;
  status: string | null;
  date: string | null; // whichever date is most relevant for that tool
  procoreUrl: string; // "open in Procore" hyperlink
  detail: string | null; // short extra context (assignee, cost variance, etc.)
}

/** Result of pulling one Procore tool's data — isolated so one bad/renamed
 *  endpoint degrades gracefully instead of failing the whole dashboard. */
export interface ReportToolResult {
  tool: string;
  ok: boolean;
  error: string | null;
  items: ReportItem[];
}

export interface ReportSummary {
  category: ReportCategory;
  projectId: number;
  generatedAt: string;
  tools: ReportToolResult[];
}
