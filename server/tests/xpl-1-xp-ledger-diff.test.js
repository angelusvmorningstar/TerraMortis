/**
 * xpl.1 — pure unit tests for diffXpLedgerRows, no DB required.
 * Covers: single deltas per category, zero-delta no-op, a brand-new merit,
 * and multiple simultaneous deltas in one save.
 */

import { describe, it, expect } from 'vitest';
import { diffXpLedgerRows } from '../lib/xp-ledger-diff.js';

describe('diffXpLedgerRows', () => {
  it('detects a single attribute delta', () => {
    const before = { attributes: { Strength: { dots: 2, xp: 0 } } };
    const after = { attributes: { Strength: { dots: 3, xp: 4 } } };
    const rows = diffXpLedgerRows(before, after);
    expect(rows).toEqual([{ category: 'attribute', trait_name: 'Strength', delta: 4, new_total: 4 }]);
  });

  it('detects a single skill delta', () => {
    const before = { skills: { Larceny: { dots: 0, xp: 0 } } };
    const after = { skills: { Larceny: { dots: 1, xp: 2 } } };
    const rows = diffXpLedgerRows(before, after);
    expect(rows).toEqual([{ category: 'skill', trait_name: 'Larceny', delta: 2, new_total: 2 }]);
  });

  it('detects a single discipline delta', () => {
    const before = { disciplines: { Auspex: { dots: 1, xp: 0 } } };
    const after = { disciplines: { Auspex: { dots: 2, xp: 3 } } };
    const rows = diffXpLedgerRows(before, after);
    expect(rows).toEqual([{ category: 'discipline', trait_name: 'Auspex', delta: 3, new_total: 3 }]);
  });

  it('detects a single merit delta matched by name', () => {
    const before = { merits: [{ name: 'Majesty', xp: 0 }] };
    const after = { merits: [{ name: 'Majesty', xp: 3 }] };
    const rows = diffXpLedgerRows(before, after);
    expect(rows).toEqual([{ category: 'merit', trait_name: 'Majesty', delta: 3, new_total: 3 }]);
  });

  it('treats a brand-new merit as a delta from zero', () => {
    const before = { merits: [] };
    const after = { merits: [{ name: 'Majesty', xp: 3 }] };
    const rows = diffXpLedgerRows(before, after);
    expect(rows).toEqual([{ category: 'merit', trait_name: 'Majesty', delta: 3, new_total: 3 }]);
  });

  it('produces no row for a zero delta', () => {
    const before = { attributes: { Strength: { dots: 3, xp: 4 } } };
    const after = { attributes: { Strength: { dots: 3, xp: 4 } } };
    expect(diffXpLedgerRows(before, after)).toEqual([]);
  });

  it('produces no row for an untouched trait with no prior xp', () => {
    const before = {};
    const after = { attributes: { Strength: { dots: 1, xp: 0 } } };
    expect(diffXpLedgerRows(before, after)).toEqual([]);
  });

  it('handles multiple simultaneous deltas across categories in one save', () => {
    const before = {
      attributes: { Strength: { dots: 2, xp: 0 } },
      skills: { Larceny: { dots: 0, xp: 0 } },
      merits: [{ name: 'Majesty', xp: 0 }],
    };
    const after = {
      attributes: { Strength: { dots: 3, xp: 4 } },
      skills: { Larceny: { dots: 1, xp: 2 } },
      merits: [{ name: 'Majesty', xp: 3 }],
    };
    const rows = diffXpLedgerRows(before, after);
    expect(rows).toHaveLength(3);
    expect(rows).toEqual(expect.arrayContaining([
      { category: 'attribute', trait_name: 'Strength', delta: 4, new_total: 4 },
      { category: 'skill', trait_name: 'Larceny', delta: 2, new_total: 2 },
      { category: 'merit', trait_name: 'Majesty', delta: 3, new_total: 3 },
    ]));
  });

  it('handles a missing "before" document gracefully (treats every value as a delta from zero)', () => {
    const after = { attributes: { Strength: { dots: 1, xp: 4 } } };
    expect(diffXpLedgerRows(null, after)).toEqual([
      { category: 'attribute', trait_name: 'Strength', delta: 4, new_total: 4 },
    ]);
  });

  it('ignores categories absent from the incoming body', () => {
    const before = { attributes: { Strength: { dots: 3, xp: 4 } } };
    const after = { name: 'Renamed Character' };
    expect(diffXpLedgerRows(before, after)).toEqual([]);
  });
});
