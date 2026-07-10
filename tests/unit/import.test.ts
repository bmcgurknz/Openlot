import { describe, expect, it } from 'vitest';
import { MemoryRepository } from '../../src/db/repository.js';
import { autoMapColumns } from '../../src/lib/import/fields.js';
import { detectFormat } from '../../src/lib/import/detect.js';
import { parseCsvTable } from '../../src/lib/import/csv.js';
import { existingLotIdSet, planImport } from '../../src/lib/import/plan.js';
import { runImportPlan } from '../../src/lib/import/run.js';
import { LotService } from '../../src/services/lots.js';

const PROJECT = 316;

describe('import: format detection', () => {
  it('detects by extension first', () => {
    expect(detectFormat('register.csv')).toBe('csv');
    expect(detectFormat('register.xlsx')).toBe('xlsx');
    expect(detectFormat('register.XLS')).toBe('xlsx');
  });

  it('falls back to zip magic bytes for unlabelled xlsx uploads', () => {
    const zipHead = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]);
    expect(detectFormat('upload', zipHead)).toBe('xlsx');
    expect(detectFormat('upload', new Uint8Array([0x4c, 0x4f, 0x54]))).toBe('csv');
  });
});

describe('import: automatic field mapping', () => {
  it('maps common Procore-export header spellings to canonical fields', () => {
    const mapping = autoMapColumns([
      'Lot ID', 'Description', 'Work Type', 'Spec/ITP Ref', 'Cost Code', 'Pay Item', 'Qty', 'UoM', 'Status', 'Builder', 'Stage', 'Owner', 'Notes'
    ]);
    expect(mapping[0]).toBe('lotId');
    expect(mapping[1]).toBe('description');
    expect(mapping[2]).toBe('workType');
    expect(mapping[5]).toBe('paymentItemNumber');
    expect(mapping[9]).toBe('builder');
    expect(mapping[10]).toBe('stage');
    expect(mapping[11]).toBe('owner');
  });

  it('leaves unrecognised columns unmapped', () => {
    const mapping = autoMapColumns(['Lot ID', 'Some custom Procore column']);
    expect(mapping[0]).toBe('lotId');
    expect(mapping[1]).toBe('');
  });
});

describe('import: row planning (validation + duplicate/create-or-update detection)', () => {
  const csv = [
    'Lot ID,Description,Work Type,Qty,UoM,Builder',
    'LOT-EW-0001,Ch 0-100 fill,EW,500,m3,Hallmark Homes',
    'LOT-EW-0002,Ch 100-200 fill,EW,abc,m3,',
    'NOT-A-LOT,bad id,EW,10,m3,',
    'LOT-EW-0001,duplicate of row 1,EW,10,m3,'
  ].join('\n');

  it('classifies rows as create/update/skip and flags issues', () => {
    const { headers, rows } = parseCsvTable(csv);
    const mapping = autoMapColumns(headers);
    const existing = existingLotIdSet([{ id: 'LOT-EW-0002' }]); // already in the register → update
    const plans = planImport(rows, mapping, existing);

    expect(plans).toHaveLength(4);
    expect(plans[0]!.action).toBe('create');
    expect(plans[0]!.lotId).toBe('LOT-EW-0001');

    expect(plans[1]!.action).toBe('update'); // exists, despite the bad qty warning
    expect(plans[1]!.issues.some((i) => i.level === 'warning' && /not a number/.test(i.message))).toBe(true);
    expect(plans[1]!.included).toBe(true); // warnings don't block

    expect(plans[2]!.action).toBe('skip');
    expect(plans[2]!.included).toBe(false); // bad Lot ID format is a blocking error

    expect(plans[3]!.action).toBe('skip');
    expect(plans[3]!.issues.some((i) => /Duplicate/.test(i.message))).toBe(true);
  });
});

describe('import: executing the plan (create-or-update)', () => {
  it('creates new lots and updates existing ones without clobbering blank fields', async () => {
    const repo = new MemoryRepository();
    const lots = new LotService(repo);

    // Pre-existing lot with a cost code the import file doesn't mention.
    await lots.create({
      projectId: PROJECT,
      workType: 'EW',
      sequence: 2,
      description: 'Original description',
      costCode: '02-999'
    });

    const csv = [
      'Lot ID,Description,Work Type,Qty,UoM,Builder',
      'LOT-EW-0001,Ch 0-100 fill,EW,500,m3,Hallmark Homes',
      'LOT-EW-0002,Updated description,EW,750,m3,'
    ].join('\n');
    const { headers, rows } = parseCsvTable(csv);
    const mapping = autoMapColumns(headers);
    const existing = existingLotIdSet(await lots.list(PROJECT));
    const plans = planImport(rows, mapping, existing);

    const result = await runImportPlan(lots, PROJECT, plans, { createdBy: 'importer' });
    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.failed).toHaveLength(0);

    const created = await lots.get(PROJECT, 'LOT-EW-0001');
    expect(created.builder).toBe('Hallmark Homes');
    expect(created.quantity).toBe(500);
    expect(created.createdBy).toBe('importer');

    const updated = await lots.get(PROJECT, 'LOT-EW-0002');
    expect(updated.description).toBe('Updated description');
    expect(updated.quantity).toBe(750);
    expect(updated.costCode).toBe('02-999'); // blank import cell did not clobber it

    // Every create/update is captured in the lot history trail.
    const history = await repo.listHistory(PROJECT, 'LOT-EW-0002');
    expect(history.some((h) => h.field === 'Description')).toBe(true);
  });

  it('skips excluded rows and rows without updateExisting permission', async () => {
    const repo = new MemoryRepository();
    const lots = new LotService(repo);
    await lots.create({ projectId: PROJECT, workType: 'EW', sequence: 5, description: 'x' });

    const csv = ['Lot ID,Description,Work Type', 'LOT-EW-0005,y,EW', 'LOT-EW-0006,z,EW'].join('\n');
    const { headers, rows } = parseCsvTable(csv);
    const mapping = autoMapColumns(headers);
    const existing = existingLotIdSet(await lots.list(PROJECT));
    const plans = planImport(rows, mapping, existing);
    plans[1]!.included = false; // user excludes the second row in "resolve issues"

    const result = await runImportPlan(lots, PROJECT, plans, { updateExisting: false });
    expect(result.updated).toBe(0); // update permission withheld
    expect(result.created).toBe(0); // excluded row not created
    expect(result.skipped).toBe(2);
  });
});
