/**
 * xpl.1 — pure unit tests for diffXpLedgerRows, no DB required.
 * Covers: single deltas per category, zero-delta no-op, a brand-new merit,
 * multiple simultaneous deltas in one save, duplicate-named merits
 * distinguished by qualifier/area (code-review 2026-08-15, High finding —
 * reproduced against real fixture data, name-only matching fabricated and
 * dropped rows on 5 of 31 live characters), and removed traits/merits
 * (code-review 2026-08-15, High finding — the original after-only iteration
 * made deletions invisible to the ledger).
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

  it('distinguishes two same-named merits by area (Allies-by-sphere) — buying one leaves the other alone', () => {
    // Reproduces the real fixture shape from code-review: two Allies entries,
    // only one purchased this save.
    const before = {
      merits: [
        { name: 'Allies', area: 'Police', xp: 2 },
        { name: 'Allies', area: 'Media', xp: 0 },
      ],
    };
    const after = {
      merits: [
        { name: 'Allies', area: 'Police', xp: 2 },
        { name: 'Allies', area: 'Media', xp: 1 },
      ],
    };
    const rows = diffXpLedgerRows(before, after);
    expect(rows).toEqual([{ category: 'merit', trait_name: 'Allies', delta: 1, new_total: 1 }]);
  });

  it('distinguishes two same-named merits by qualifier', () => {
    const before = {
      merits: [
        { name: 'Contacts', qualifier: 'Police', xp: 0 },
        { name: 'Contacts', qualifier: 'Underworld', xp: 2 },
      ],
    };
    const after = {
      merits: [
        { name: 'Contacts', qualifier: 'Police', xp: 3 },
        { name: 'Contacts', qualifier: 'Underworld', xp: 2 },
      ],
    };
    const rows = diffXpLedgerRows(before, after);
    expect(rows).toEqual([{ category: 'merit', trait_name: 'Contacts', delta: 3, new_total: 3 }]);
  });

  it('handles three merits sharing one name, distinguished by area, with only one changing', () => {
    const before = {
      merits: [
        { name: 'Status', area: 'finance', xp: 0 },
        { name: 'Status', area: 'high society', xp: 0 },
        { name: 'Status', area: 'underworld', xp: 1 },
      ],
    };
    const after = {
      merits: [
        { name: 'Status', area: 'finance', xp: 0 },
        { name: 'Status', area: 'high society', xp: 3 },
        { name: 'Status', area: 'underworld', xp: 1 },
      ],
    };
    const rows = diffXpLedgerRows(before, after);
    expect(rows).toEqual([{ category: 'merit', trait_name: 'Status', delta: 3, new_total: 3 }]);
  });

  it('produces a negative-delta row when an attribute is removed from an included category', () => {
    const before = { attributes: { Strength: { dots: 3, xp: 4 }, Dexterity: { dots: 1, xp: 0 } } };
    const after = { attributes: { Dexterity: { dots: 1, xp: 0 } } };
    const rows = diffXpLedgerRows(before, after);
    expect(rows).toEqual([{ category: 'attribute', trait_name: 'Strength', delta: -4, new_total: 0 }]);
  });

  it('produces a negative-delta row when a merit is deleted', () => {
    const before = { merits: [{ name: 'Majesty', xp: 3 }] };
    const after = { merits: [] };
    const rows = diffXpLedgerRows(before, after);
    expect(rows).toEqual([{ category: 'merit', trait_name: 'Majesty', delta: -3, new_total: 0 }]);
  });

  it('does NOT produce a row for a category entirely absent from the incoming body (not a deletion, just not part of this save)', () => {
    const before = { attributes: { Strength: { dots: 3, xp: 4 } } };
    const after = { merits: [{ name: 'Majesty', xp: 3 }] };
    // before.merits is empty/absent too, so Majesty is a brand-new merit (+3);
    // attributes is absent from `after` entirely, so Strength must NOT appear.
    const rows = diffXpLedgerRows(before, after);
    expect(rows).toEqual([{ category: 'merit', trait_name: 'Majesty', delta: 3, new_total: 3 }]);
  });
});
