import type { LinkedInspection, LinkedNcr, Lot, TestRecord } from '../src/types.js';

const NOW = '2026-07-01T00:00:00.000Z';

export function makeLot(overrides: Partial<Lot> = {}): Lot {
  return {
    id: 'LOT-EW-0014',
    projectId: 316,
    description: 'Ch 1200–1350 LHS, select fill layer 2',
    workType: 'EW',
    specReference: 'ITP-EW-01 / MRTS04 cl 9.2',
    costCode: '02-230',
    quantity: 620,
    uom: 'm3',
    status: 'work_complete',
    openedAt: '2026-06-10',
    workCompleteAt: '2026-06-28',
    conformedAt: null,
    closedAt: null,
    supersededBy: null,
    holdPointReleased: true,
    holdPointReleasedBy: 'B. McGurk (Superintendent Rep)',
    holdPointReleasedAt: '2026-06-29',
    paymentItemNumber: '2.3',
    geoStart: null,
    geoEnd: null,
    geoDatum: null,
    builder: 'Hallmark Homes',
    stage: 'Stage 2',
    owner: null,
    notes: null,
    createdBy: 'test',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  };
}

export function makeInspection(overrides: Partial<LinkedInspection> = {}): LinkedInspection {
  return {
    procoreId: 900114,
    lotId: 'LOT-EW-0014',
    projectId: 316,
    title: 'LOT-EW-0014 - Subgrade proof roll',
    templateName: 'ITP - Earthworks - MRTS04',
    status: 'passed',
    inspectionDate: '2026-06-28',
    itemsTotal: 8,
    itemsPassed: 8,
    itemsFailed: 0,
    updatedAt: NOW,
    ...overrides
  };
}

export function makeNcr(overrides: Partial<LinkedNcr> = {}): LinkedNcr {
  return {
    procoreId: 770031,
    lotId: 'LOT-EW-0014',
    projectId: 316,
    title: 'LOT-EW-0014 - Soft spot at Ch 1310',
    status: 'closed',
    createdAt: '2026-06-25T04:10:00.000Z',
    closedAt: '2026-06-27T04:10:00.000Z',
    updatedAt: NOW,
    ...overrides
  };
}

export function makeTest(overrides: Partial<TestRecord> = {}): TestRecord {
  return {
    id: '2b6f3a1e-8f5f-4f7f-9a8e-2f1c3d4e5f60',
    lotId: 'LOT-EW-0014',
    projectId: 316,
    testType: 'Compaction (AS 1289.5.4.1)',
    labReference: 'NATA-88412',
    status: 'passed',
    requestedAt: '2026-06-26',
    resultAt: '2026-06-29',
    documentUrl: null,
    notes: null,
    updatedAt: NOW,
    ...overrides
  };
}
