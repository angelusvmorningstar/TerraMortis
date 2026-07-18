/**
 * Issue #1013 — resolveBlock() prefers the VtR 2e Rulebook copy of
 * Indomitable over the Chronicles of Darkness Rulebook copy, and the
 * composed rules_text names the Kindred-specific phrasing that
 * distinguishes the two books.
 *
 * This is a pure unit test on the resolver — no DB, no filesystem stubbing.
 * It uses the real markdown corpus via loadAllBlocks() so a future markdown
 * re-parse regression that shifts Indomitable to a different book (or
 * removes it from VtR 2e) is caught here rather than at prod-write time.
 */

import { describe, it, expect } from 'vitest';
import { loadAllBlocks } from '../scripts/uplift-power-rules-text.js';
import { resolveBlock } from '../scripts/fix-1013-indomitable-rules-text.js';

describe('fix-1013 — indomitable resolver', () => {
  const { allBlocks } = loadAllBlocks();

  it('finds Indomitable in both VtR 2e Rulebook and CofD Rulebook', () => {
    const cands = allBlocks.filter(b => b.normName === 'indomitable' && !b.isErrata);
    const books = cands.map(b => b.book).sort();
    expect(books).toEqual(['CofD Rulebook', 'VtR 2e Rulebook']);
  });

  it('resolveBlock picks the VtR 2e Rulebook copy', () => {
    const b = resolveBlock(allBlocks, 'Indomitable', 'VtR 2e Rulebook');
    expect(b).toBeTruthy();
    expect(b.book).toBe('VtR 2e Rulebook');
    expect(b.name).toBe('Indomitable');
  });

  it('resolved rules_text is non-empty and mentions "Kindred Dominate" (VtR-specific phrasing)', () => {
    const b = resolveBlock(allBlocks, 'Indomitable', 'VtR 2e Rulebook');
    expect(b.rulesText).toBeTruthy();
    expect(b.rulesText.length).toBeGreaterThan(200);
    expect(b.rulesText).toMatch(/Kindred Dominate/);
    expect(b.rulesText).not.toMatch(/a vampire['’]s mind control/i);
  });

  it('returns null when the preferred book has no matching block', () => {
    expect(resolveBlock(allBlocks, 'Indomitable', 'Nonexistent Book')).toBeNull();
    expect(resolveBlock(allBlocks, 'NotAPower', 'VtR 2e Rulebook')).toBeNull();
  });
});
