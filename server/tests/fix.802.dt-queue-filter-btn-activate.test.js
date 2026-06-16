/**
 * fix.802 — DT queue filters: clicking a character pill activates unrelated filters.
 *
 * Root cause: every CHARACTER pill had data-strip-char, which triggered a
 * "solo this character" branch that cleared all other filter groups and
 * pre-activated the character's first pending phase. This made clicking a
 * CHARACTER pill (even to deselect it) silently activate a PHASE filter.
 *
 * Fix: remove the strip-char branch. All proc-filter-pill clicks use the
 * same uniform toggle logic — consistent with STATUS, PHASE, SOURCE, TERRITORY.
 *
 * AC1 — strip-char branch is gone from the pill click handler
 * AC2 — uniform toggle logic is present for all pills
 * AC3 — proc-filter-clear handler is intact
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(import.meta.dirname, '../..');
const src  = readFileSync(resolve(root, 'public/js/admin/downtime-views.js'), 'utf8');

// Find the filter-pill handler block
const pillHandlerStart = src.indexOf("querySelectorAll('.proc-filter-pill')");

// ── AC1: strip-char branch is gone ───────────────────────────────────────────

describe('AC1 — strip-char branch removed from pill click handler', () => {
  it('handler does not contain if (btn.dataset.stripChar)', () => {
    // Find the next occurrence of stripChar after the pill handler start
    const stripCharIdx = src.indexOf('btn.dataset.stripChar', pillHandlerStart);
    // Should not exist inside the handler (or at all after the handler start)
    // The attribute may still appear in the rendering code before pillHandlerStart,
    // so we specifically check the handler region (next 300 chars)
    const handlerRegion = src.slice(pillHandlerStart, pillHandlerStart + 300);
    expect(handlerRegion).not.toContain('btn.dataset.stripChar');
  });

  it('_procFilters.statuses = new Set() does not appear in pill handler', () => {
    const handlerRegion = src.slice(pillHandlerStart, pillHandlerStart + 300);
    expect(handlerRegion).not.toContain('_procFilters.statuses    = new Set()');
  });
});

// ── AC2: uniform toggle logic present ────────────────────────────────────────

describe('AC2 — uniform toggle logic used for all pills', () => {
  it('handler reads filterDim and filterVal', () => {
    const handlerRegion = src.slice(pillHandlerStart, pillHandlerStart + 300);
    expect(handlerRegion).toContain('btn.dataset.filterDim');
    expect(handlerRegion).toContain('btn.dataset.filterVal');
  });

  it('handler toggles via _procFilters[dim].has(val)', () => {
    const handlerRegion = src.slice(pillHandlerStart, pillHandlerStart + 450);
    expect(handlerRegion).toContain('_procFilters[dim].has(val)');
  });

  it('handler deletes val when already present', () => {
    const handlerRegion = src.slice(pillHandlerStart, pillHandlerStart + 450);
    expect(handlerRegion).toContain('_procFilters[dim].delete(val)');
  });

  it('handler adds val when not present', () => {
    const handlerRegion = src.slice(pillHandlerStart, pillHandlerStart + 450);
    expect(handlerRegion).toContain('_procFilters[dim].add(val)');
  });
});

// ── AC3: filter-clear handler intact ─────────────────────────────────────────

describe('AC3 — proc-filter-clear handler is intact', () => {
  it('clear handler resets all five filter sets', () => {
    const clearIdx = src.indexOf("querySelector('.proc-filter-clear')");
    expect(clearIdx).toBeGreaterThan(0);
    const clearRegion = src.slice(clearIdx, clearIdx + 300);
    expect(clearRegion).toContain('_procFilters.statuses');
    expect(clearRegion).toContain('_procFilters.chars');
    expect(clearRegion).toContain('_procFilters.phases');
    expect(clearRegion).toContain('_procFilters.territories');
    expect(clearRegion).toContain('_procFilters.sources');
  });
});
