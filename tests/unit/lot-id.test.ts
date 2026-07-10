import { describe, expect, it } from 'vitest';
import { buildLotId, extractLotId, isValidLotId, parseLotId } from '../../src/lib/lot-id.js';

describe('lot ID convention (LOT-[WT]-[NNNN])', () => {
  it('validates canonical IDs', () => {
    expect(isValidLotId('LOT-EW-0014')).toBe(true);
    expect(isValidLotId('LOT-SW-0001')).toBe(true);
    expect(isValidLotId('LOT-EW-14')).toBe(false); // must be zero padded
    expect(isValidLotId('lot-ew-0014')).toBe(false); // canonical is upper case
    expect(isValidLotId('LOT-ZZ-0014')).toBe(false); // unknown work type
    expect(isValidLotId('LOT-EW-00014')).toBe(false); // 4 digits exactly
  });

  it('builds canonical IDs with padding', () => {
    expect(buildLotId('ew', 14)).toBe('LOT-EW-0014');
    expect(buildLotId('PV', 3)).toBe('LOT-PV-0003');
    expect(() => buildLotId('XX', 1)).toThrow(/Unknown work type/);
    expect(() => buildLotId('EW', 0)).toThrow(/between 1 and 9999/);
    expect(() => buildLotId('EW', 10000)).toThrow(/between 1 and 9999/);
  });

  it('extracts IDs from inspection titles as typed in the field', () => {
    expect(extractLotId('LOT-EW-0014 - Subgrade proof roll')?.lotId).toBe('LOT-EW-0014');
    // Mobile keyboard realities: case, en-dash, missing padding
    expect(extractLotId('lot-ew-14 subgrade proof roll')?.lotId).toBe('LOT-EW-0014');
    expect(extractLotId('LOT–SW–0007 bedding inspection')?.lotId).toBe('LOT-SW-0007');
    expect(extractLotId('Placed 620m3 against LOT EW 0014 today')?.lotId).toBe('LOT-EW-0014');
    expect(extractLotId('lot_pv_3 subbase')?.lotId).toBe('LOT-PV-0003');
  });

  it('returns null rather than guessing', () => {
    expect(extractLotId('Subgrade proof roll Ch 1200-1350')).toBeNull();
    expect(extractLotId('LOT-ZZ-0014 unknown work type')).toBeNull();
    expect(extractLotId('parking lot 4 sealed')).toBeNull();
    expect(extractLotId('')).toBeNull();
  });

  it('parses canonical IDs into parts', () => {
    expect(parseLotId('LOT-EW-0014')).toEqual({ lotId: 'LOT-EW-0014', workType: 'EW', sequence: 14 });
    expect(() => parseLotId('LOT-EW-14')).toThrow(/not a valid lot ID/);
  });
});
