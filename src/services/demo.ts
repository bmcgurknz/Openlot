import { randomUUID } from '../lib/uuid.js';
import type { Repository } from '../db/repository.js';
import type { Lot } from '../types.js';

/**
 * Seeds a realistic sample project — "Kestrel Ridge Stage 2", a 74-lot
 * residential subdivision (bulk earthworks, stormwater, sewer, pavements)
 * — so the register, conformance engine and claim gate can be explored
 * without a Procore connection. Used by DEMO_MODE and scripts/seed.ts.
 */
export const DEMO_PROJECT_ID = 316; // stands in for a Procore project id

export async function seedDemoData(repo: Repository): Promise<void> {
  const today = new Date();
  const day = (offset: number): string => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const now = new Date().toISOString();

  const lot = (partial: Partial<Lot> & Pick<Lot, 'id' | 'description' | 'workType'>): Lot => ({
    projectId: DEMO_PROJECT_ID,
    specReference: null,
    costCode: null,
    quantity: null,
    uom: null,
    status: 'open',
    openedAt: day(-30),
    builder: null,
    stage: 'Stage 2',
    owner: null,
    createdAt: now,
    holdPointReleasedBy: null,
    holdPointReleasedAt: null,
    paymentItemNumber: null,
    geoStart: null,
    geoEnd: null,
    geoDatum: null,
    workCompleteAt: null,
    conformedAt: null,
    closedAt: null,
    supersededBy: null,
    holdPointReleased: false,
    notes: null,
    createdBy: 'demo-seed',
    updatedAt: now,
    ...partial
  });

  // --- Conformed earthworks lot (claimed last month) -------------------
  await repo.createLot(
    lot({
      id: 'LOT-EW-0012',
      description: 'Ch 0980–1120 LHS, general fill layers 1–3',
      workType: 'EW',
      specReference: 'ITP-EW-01 / MRTS04',
      costCode: '02-220',
      quantity: 1840,
      uom: 'm3',
      status: 'conformed',
      openedAt: day(-58),
      workCompleteAt: day(-41),
      conformedAt: day(-35),
      holdPointReleased: true,
      holdPointReleasedBy: 'A. Rossi (Superintendent Rep)',
      holdPointReleasedAt: day(-36),
      paymentItemNumber: '2.2'
    })
  );

  // --- Earthworks lot: work complete, one test outstanding -------------
  await repo.createLot(
    lot({
      id: 'LOT-EW-0014',
      description: 'Ch 1200–1350 LHS, select fill layer 2',
      workType: 'EW',
      specReference: 'ITP-EW-01 / MRTS04 cl 9.2',
      costCode: '02-230',
      quantity: 620,
      uom: 'm3',
      status: 'work_complete',
      openedAt: day(-21),
      workCompleteAt: day(-3),
      holdPointReleased: true,
      holdPointReleasedBy: 'A. Rossi (Superintendent Rep)',
      holdPointReleasedAt: day(-3),
      paymentItemNumber: '2.3'
    })
  );

  // --- Stormwater lot with an open NCR ----------------------------------
  await repo.createLot(
    lot({
      id: 'LOT-SW-0007',
      description: 'Line 4, MH4.2–MH4.5, 375 RCP incl bedding',
      workType: 'SW',
      specReference: 'ITP-SW-02',
      costCode: '04-310',
      quantity: 96,
      uom: 'lm',
      status: 'work_complete',
      openedAt: day(-14),
      workCompleteAt: day(-2),
      holdPointReleased: true,
      holdPointReleasedBy: 'A. Rossi (Superintendent Rep)',
      holdPointReleasedAt: day(-2),
      paymentItemNumber: '4.1'
    })
  );

  // --- Fresh open pavement lot ------------------------------------------
  await repo.createLot(
    lot({
      id: 'LOT-PV-0003',
      description: 'Road 2 Ch 0000–0240, subbase CBR45 200 thk',
      workType: 'PV',
      specReference: 'ITP-PV-01 / MRTS05',
      costCode: '06-110',
      quantity: 1680,
      uom: 'm2',
      openedAt: day(-4)
    })
  );

  // --- Superseded lot (extent split after design change) ----------------
  await repo.createLot(
    lot({
      id: 'LOT-EW-0013',
      description: 'Ch 1120–1350 LHS, select fill (superseded — split at Ch 1200)',
      workType: 'EW',
      status: 'superseded',
      supersededBy: 'LOT-EW-0014',
      openedAt: day(-25)
    })
  );

  /* Linked Procore evidence -------------------------------------------- */

  await repo.upsertInspection({
    procoreId: 900101,
    lotId: 'LOT-EW-0012',
    projectId: DEMO_PROJECT_ID,
    title: 'LOT-EW-0012 - General fill compaction & level conformance',
    templateName: 'ITP - Earthworks - MRTS04',
    status: 'passed',
    inspectionDate: day(-36),
    itemsTotal: 12,
    itemsPassed: 12,
    itemsFailed: 0,
    updatedAt: now
  });

  await repo.upsertInspection({
    procoreId: 900114,
    lotId: 'LOT-EW-0014',
    projectId: DEMO_PROJECT_ID,
    title: 'LOT-EW-0014 - Subgrade proof roll',
    templateName: 'ITP - Earthworks - MRTS04',
    status: 'passed',
    inspectionDate: day(-3),
    itemsTotal: 8,
    itemsPassed: 8,
    itemsFailed: 0,
    updatedAt: now
  });

  await repo.upsertInspection({
    procoreId: 900120,
    lotId: 'LOT-SW-0007',
    projectId: DEMO_PROJECT_ID,
    title: 'LOT-SW-0007 - Pipe bedding & laying pre-backfill',
    templateName: 'ITP - Stormwater - IPWEA',
    status: 'failed',
    inspectionDate: day(-2),
    itemsTotal: 10,
    itemsPassed: 9,
    itemsFailed: 1,
    updatedAt: now
  });

  await repo.upsertNcr({
    procoreId: 770031,
    lotId: 'LOT-SW-0007',
    projectId: DEMO_PROJECT_ID,
    title: 'LOT-SW-0007 - Bedding material non-compliant between MH4.3 and MH4.4',
    status: 'open',
    createdAt: day(-2) + 'T04:10:00Z',
    closedAt: null,
    updatedAt: now
  });

  /* Tests ---------------------------------------------------------------- */

  const t1 = randomUUID();
  await repo.createTest({
    id: t1,
    lotId: 'LOT-EW-0012',
    projectId: DEMO_PROJECT_ID,
    testType: 'Compaction (AS 1289.5.4.1)',
    labReference: 'NATA-88412',
    status: 'passed',
    requestedAt: day(-40),
    resultAt: day(-36),
    documentUrl: null,
    notes: '6 tests, min 97.2% SMDD (spec 95%)',
    updatedAt: now
  });

  await repo.createTest({
    id: randomUUID(),
    lotId: 'LOT-EW-0014',
    projectId: DEMO_PROJECT_ID,
    testType: 'Compaction (AS 1289.5.4.1)',
    labReference: null,
    status: 'sampled',
    requestedAt: day(-3),
    resultAt: null,
    documentUrl: null,
    notes: 'Sampled by GeoLab, results due in 2 days',
    updatedAt: now
  });

  /* Quantities ------------------------------------------------------------ */

  await repo.createQuantity({
    id: randomUUID(),
    lotId: 'LOT-EW-0012',
    projectId: DEMO_PROJECT_ID,
    source: 'daily_log',
    procoreId: 550301,
    date: day(-42),
    quantity: 1840,
    uom: 'm3',
    costCode: '02-220',
    notes: 'LOT-EW-0012 general fill placed and compacted, layers 1-3'
  });

  /* Prior claim period ----------------------------------------------------- */

  const period = await repo.createClaimPeriod({
    id: randomUUID(),
    projectId: DEMO_PROJECT_ID,
    label: `PC-13 ${day(-35).slice(0, 7)}`,
    periodStart: day(-60),
    periodEnd: day(-31),
    status: 'issued',
    issuedAt: day(-30) + 'T00:00:00Z',
    createdAt: day(-32) + 'T00:00:00Z',
    createdBy: 'demo-seed'
  });
  await repo.addClaimLine({
    id: randomUUID(),
    claimPeriodId: period.id,
    lotId: 'LOT-EW-0012',
    quantity: 1840,
    uom: 'm3',
    costCode: '02-220',
    conformedAt: day(-35),
    createdAt: day(-32) + 'T00:00:00Z'
  });
}
