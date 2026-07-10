/* Mirrors src/types.ts on the server — kept small and hand-synced. */

export type LotStatus = 'open' | 'work_complete' | 'conformed' | 'closed' | 'superseded';

export interface Lot {
  id: string;
  projectId: number;
  description: string;
  workType: string;
  specReference: string | null;
  costCode: string | null;
  quantity: number | null;
  uom: string | null;
  status: LotStatus;
  openedAt: string;
  workCompleteAt: string | null;
  conformedAt: string | null;
  closedAt: string | null;
  supersededBy: string | null;
  holdPointReleased: boolean;
  holdPointReleasedBy: string | null;
  holdPointReleasedAt: string | null;
  paymentItemNumber: string | null;
  geoStart: string | null;
  geoEnd: string | null;
  geoDatum: string | null;
  builder: string | null;
  stage: string | null;
  owner: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One read-only audit-trail entry against a lot (newest first). */
export interface LotHistoryEntry {
  id: string;
  projectId: number;
  lotId: string;
  at: string;
  user: string;
  field: string;
  previousValue: string | null;
  newValue: string | null;
}

export interface LinkedInspection {
  procoreId: number;
  title: string;
  templateName: string | null;
  status: 'open' | 'in_progress' | 'passed' | 'failed' | 'not_applicable';
  inspectionDate: string | null;
  itemsTotal: number;
  itemsPassed: number;
  itemsFailed: number;
}

export interface LinkedNcr {
  procoreId: number;
  title: string;
  status: 'open' | 'ready_for_review' | 'closed' | 'void';
  createdAt: string;
}

export interface TestRecord {
  id: string;
  testType: string;
  labReference: string | null;
  status: 'requested' | 'sampled' | 'results_received' | 'passed' | 'failed';
  requestedAt: string;
  resultAt: string | null;
}

export interface QuantityEntry {
  id: string;
  source: 'daily_log' | 'manual';
  date: string;
  quantity: number;
  uom: string;
  notes: string | null;
}

export interface ConformanceBlocker {
  code: string;
  message: string;
  reference?: string;
}

export interface ConformanceEvaluation {
  lotId: string;
  eligible: boolean;
  blockers: ConformanceBlocker[];
}

export interface ClaimPeriod {
  id: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  status: 'open' | 'issued' | 'certified';
  createdAt: string;
  createdBy: string | null;
}

export interface ClaimableLot {
  lot: Lot;
  claimable: boolean;
  reason: string | null;
  alreadyClaimedIn: string[];
}

export interface ClaimLine {
  id: string;
  lotId: string;
  quantity: number;
  uom: string;
  costCode: string | null;
  conformedAt: string;
  createdAt: string;
  lot: Lot | null;
}

export interface LotDossier {
  lot: Lot;
  inspections: LinkedInspection[];
  ncrs: LinkedNcr[];
  tests: TestRecord[];
  quantities: QuantityEntry[];
  claimedIn: ClaimPeriod[];
  history: LotHistoryEntry[];
}

/** Reporting dashboard (server edition + live Procore connection only). */
export interface ReportItem {
  id: string;
  tool: string;
  title: string;
  status: string | null;
  date: string | null;
  procoreUrl: string;
  detail: string | null;
}

export interface ReportToolResult {
  tool: string;
  ok: boolean;
  error: string | null;
  items: ReportItem[];
}

export interface ReportSummary {
  category: 'quality_safety' | 'field_productivity' | 'project_controls';
  projectId: number;
  generatedAt: string;
  tools: ReportToolResult[];
}

export const WORK_TYPE_NAMES: Record<string, string> = {
  EW: 'Earthworks', SW: 'Stormwater', SE: 'Sewer', WA: 'Water', PV: 'Pavements',
  CO: 'Concrete / Structures', KF: 'Kerb & Footpath', LS: 'Landscaping',
  RA: 'Rail', MA: 'Marine', TM: 'Traffic / Misc'
};

export const STATUS_LABELS: Record<LotStatus, string> = {
  open: 'Open',
  work_complete: 'Work complete',
  conformed: 'Conformed',
  closed: 'Closed',
  superseded: 'Superseded'
};

/* ---- API client ------------------------------------------------------ */

import { ApiError } from './errors';
export { ApiError };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch {
      /* keep default */
    }
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}

/** True when built as the static (browser-only) edition. */
export const STATIC_EDITION = import.meta.env.VITE_STATIC === 'true';

const remoteApi = {
  lots: (projectId: number) => request<Lot[]>(`/api/projects/${projectId}/lots`),
  lot: (projectId: number, lotId: string) => request<LotDossier>(`/api/projects/${projectId}/lots/${lotId}`),
  history: (projectId: number, lotId: string) =>
    request<LotHistoryEntry[]>(`/api/projects/${projectId}/lots/${lotId}/history`),
  evaluation: (projectId: number, lotId: string) =>
    request<ConformanceEvaluation>(`/api/projects/${projectId}/lots/${lotId}/evaluation`),
  createLot: (projectId: number, body: object) =>
    request<Lot>(`/api/projects/${projectId}/lots`, { method: 'POST', body: JSON.stringify(body) }),
  transition: (projectId: number, lotId: string, to: LotStatus, supersededBy?: string, actor?: string) =>
    request<{ lot: Lot }>(`/api/projects/${projectId}/lots/${lotId}/transition`, {
      method: 'POST',
      body: JSON.stringify({ to, supersededBy, actor })
    }),
  holdPoint: (projectId: number, lotId: string, released: boolean, actor?: string) =>
    request<Lot>(`/api/projects/${projectId}/lots/${lotId}/hold-point`, {
      method: 'POST',
      body: JSON.stringify({ released, actor })
    }),
  updateLot: (projectId: number, lotId: string, fields: object, actor?: string) =>
    request<Lot>(`/api/projects/${projectId}/lots/${lotId}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...fields, actor })
    }),
  addTest: (projectId: number, lotId: string, testType: string) =>
    request<TestRecord>(`/api/projects/${projectId}/lots/${lotId}/tests`, {
      method: 'POST',
      body: JSON.stringify({ testType })
    }),
  setTestStatus: (testId: string, status: TestRecord['status']) =>
    request<TestRecord>(`/api/tests/${testId}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  claims: (projectId: number) => request<ClaimPeriod[]>(`/api/projects/${projectId}/claims`),
  createClaim: (projectId: number, body: object) =>
    request<ClaimPeriod>(`/api/projects/${projectId}/claims`, { method: 'POST', body: JSON.stringify(body) }),
  claimable: (projectId: number, claimId: string) =>
    request<ClaimableLot[]>(`/api/projects/${projectId}/claims/${claimId}/claimable`),
  claimLines: (projectId: number, claimId: string) =>
    request<ClaimLine[]>(`/api/projects/${projectId}/claims/${claimId}/lines`),
  addLotToClaim: (projectId: number, claimId: string, lotId: string, actor?: string) =>
    request<ClaimLine>(`/api/projects/${projectId}/claims/${claimId}/lots`, {
      method: 'POST',
      body: JSON.stringify({ lotId, actor })
    }),
  issueClaim: (projectId: number, claimId: string, actor?: string) =>
    request<ClaimPeriod>(`/api/projects/${projectId}/claims/${claimId}/issue`, {
      method: 'POST',
      body: JSON.stringify({ actor })
    }),
  connection: () =>
    request<{ connected: boolean; companyName?: string }>(`/api/connection`),
  health: () => request<{ status: string; demoMode: boolean; staticEdition?: boolean }>(`/api/health`),
  extractCsv: (claimId: string) => request<never>(`/unused/${claimId}`), // server edition downloads via href
  extractHtml: (claimId: string) => request<never>(`/unused/${claimId}`),
  reportsQualitySafety: (projectId: number) =>
    request<ReportSummary>(`/api/projects/${projectId}/reports/quality-safety`),
  reportsFieldProductivity: (projectId: number) =>
    request<ReportSummary>(`/api/projects/${projectId}/reports/field-productivity`),
  reportsProjectControls: (projectId: number) =>
    request<ReportSummary>(`/api/projects/${projectId}/reports/project-controls`)
};

// The static edition swaps in the browser-local implementation with the
// same surface; pages are edition-agnostic.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export let api: typeof remoteApi = remoteApi;

export async function initApi(): Promise<void> {
  if (STATIC_EDITION) {
    const { initLocalStore, localApi } = await import('./local');
    await initLocalStore();
    api = localApi as unknown as typeof remoteApi;
  }
}
