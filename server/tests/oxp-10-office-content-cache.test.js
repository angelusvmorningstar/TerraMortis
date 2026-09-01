/**
 * oxp.10 — the office-content client cache module
 * (`public/js/data/office-content-cache.js`).
 *
 * Added after external Codex review (2026-08-27) found this coverage did not
 * exist ("Task 7/AC10 claims direct seed, schema, and cache tests that do not
 * exist" — Medium) — the only existing exercise of this module was incidental,
 * priming it as setup for unrelated `office-tab.js`/`editor/sheet.js` render
 * assertions, never testing its own generation-counter, failure-state or
 * copy-not-reference contracts directly.
 *
 * Modelled directly on `bl2-bloodlines-cache.test.js` — same `vi.mock` on
 * `api.js`'s `apiGet` (no `location`/`localStorage` stub needed, since this
 * bypasses `api.js`'s own `request()` entirely), same `vi.resetModules()`
 * per test so the module-level cache under test starts fresh each time.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: null, calls: 0 }));
vi.mock('../../public/js/data/api.js', () => ({
  apiGet: async (...args) => { api.calls += 1; return api.get(...args); },
  apiBase: () => '',
  headers: () => ({}),
}));

const DOCS = [
  {
    kind: 'office', category: 'Primogen', asset: 'Chains of Office', style: 'Balance of Power',
    merits: ['Contacts', 'Resources'],
    manoeuvres: [{ name: 'People Talk', effect: 'x' }, { name: 'Veto', effect: 'y' }],
    statusPower: ['You can raise or lower Status.'],
  },
  {
    kind: 'office', category: 'Enforcer', asset: 'Goon Squad', style: 'Goon Squad',
    merits: ['Safe Place'],
    manoeuvres: [{ name: 'Perimeter', effect: 'x' }],
    statusPower: ['You can lower Status.'],
  },
  { kind: 'merit_caps', caps: { 'Trained Observer': 3, 'Cacophony Savvy': 3, 'Safe Place': 5 } },
];

async function freshCache(impl = async () => DOCS) {
  vi.resetModules();
  api.get = impl;
  api.calls = 0;
  return import('../../public/js/data/office-content-cache.js');
}

beforeEach(() => { api.calls = 0; });

// ─────────────────────────────────────────────────────────────────────────────
// Loading
// ─────────────────────────────────────────────────────────────────────────────

describe('oxp-10 — loadOfficeContent', () => {
  it('is not loaded before the first call', async () => {
    const m = await freshCache();
    expect(m.isLoaded()).toBe(false);
    expect(m.loadFailed()).toBe(false);
  });

  it('fetches /api/office_content and marks the cache loaded', async () => {
    const m = await freshCache();
    const seen = [];
    api.get = async (path) => { seen.push(path); return DOCS; };
    await m.loadOfficeContent();
    expect(seen).toEqual(['/api/office_content']);
    expect(m.isLoaded()).toBe(true);
    expect(m.loadFailed()).toBe(false);
  });

  it('is idempotent — concurrent callers share one in-flight fetch', async () => {
    const m = await freshCache();
    await Promise.all([m.loadOfficeContent(), m.loadOfficeContent(), m.loadOfficeContent()]);
    expect(api.calls).toBe(1);
    expect(m.isLoaded()).toBe(true);
  });

  it('a failed load does not throw, does not mark loaded, and every accessor degrades to the "no entry" state', async () => {
    const m = await freshCache(async () => { throw new Error('network down'); });
    await expect(m.loadOfficeContent()).resolves.toBeUndefined();
    expect(m.isLoaded()).toBe(false);
    expect(m.loadFailed()).toBe(true);
    expect(m.officeEntry('Primogen')).toBeUndefined();
    expect(m.meritCap('Contacts')).toBe(5); // still the documented default, not a crash
  });

  it('a non-array payload is treated as a failed load, not an empty collection', async () => {
    const m = await freshCache(async () => ({ error: 'wat' }));
    await m.loadOfficeContent();
    expect(m.isLoaded()).toBe(false);
    expect(m.loadFailed()).toBe(true);
  });

  it('an empty array loads successfully but resolves no office entries and no merit caps', async () => {
    const m = await freshCache(async () => []);
    await m.loadOfficeContent();
    expect(m.isLoaded()).toBe(true);
    expect(m.loadFailed()).toBe(false);
    expect(m.officeEntry('Primogen')).toBeUndefined();
    expect(m.meritCap('Contacts')).toBe(5);
  });

  it('a genuinely SEQUENTIAL re-load (the first has fully resolved) replaces the cache with fresh data', async () => {
    // Unlike bloodlines-cache.js, this module exposes only ONE load
    // function, and it deliberately shares `_inFlight` across every caller
    // (no separate `refetch...()` — see AC7's own dev-story amendment: this
    // collection is read-only in this repo, so there is nothing to refetch
    // against mid-session). Two calls "overlapping" is therefore not a
    // reachable state here the way it is for bloodlines' load+refetch pair;
    // what IS real and worth proving is that calling loadOfficeContent()
    // again, after the first genuinely finished, produces a fresh index
    // rather than silently no-op'ing.
    const m = await freshCache(async () => [
      { kind: 'office', category: 'Primogen', asset: 'FIRST LOAD', style: 'x', merits: ['x'], manoeuvres: [{ name: 'x', effect: 'x' }], statusPower: ['x'] },
    ]);
    await m.loadOfficeContent();
    expect(m.officeEntry('Primogen').asset).toBe('FIRST LOAD');

    api.get = async () => DOCS;
    await m.loadOfficeContent();
    expect(m.officeEntry('Primogen').asset).toBe('Chains of Office');
    expect(api.calls).toBe(2); // one fetch per load call, not silently reused/skipped
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// officeEntry — copies, never live references
// ─────────────────────────────────────────────────────────────────────────────

describe('oxp-10 — officeEntry', () => {
  it('returns undefined for an unknown or unloaded category', async () => {
    const m = await freshCache();
    expect(m.officeEntry('Not A Real Office')).toBeUndefined();
  });

  it('returns undefined for Administrator (no office_content document until oxp-8)', async () => {
    const m = await freshCache();
    await m.loadOfficeContent();
    expect(m.officeEntry('Administrator')).toBeUndefined();
  });

  it('returns the real document for a known category', async () => {
    const m = await freshCache();
    await m.loadOfficeContent();
    const entry = m.officeEntry('Primogen');
    expect(entry.asset).toBe('Chains of Office');
    expect(entry.merits).toEqual(['Contacts', 'Resources']);
    expect(entry.manoeuvres.map(x => x.name)).toEqual(['People Talk', 'Veto']);
  });

  it('mutating a returned entry does NOT corrupt the cache for a later read (copy, not reference)', async () => {
    const m = await freshCache();
    await m.loadOfficeContent();
    const first = m.officeEntry('Primogen');
    first.asset = 'MUTATED';
    first.merits.push('Injected Merit');
    first.manoeuvres.push({ name: 'Injected', effect: 'x' });
    first.statusPower.push('Injected line');

    const second = m.officeEntry('Primogen');
    expect(second.asset).toBe('Chains of Office');
    expect(second.merits).toEqual(['Contacts', 'Resources']);
    expect(second.manoeuvres.map(x => x.name)).toEqual(['People Talk', 'Veto']);
    expect(second.statusPower).toEqual(['You can raise or lower Status.']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// meritCap — the MERIT_DOT_CAPS[merit] || 5 equivalent
// ─────────────────────────────────────────────────────────────────────────────

describe('oxp-10 — meritCap', () => {
  it('returns the real cap for a merit present in the singleton document', async () => {
    const m = await freshCache();
    await m.loadOfficeContent();
    expect(m.meritCap('Trained Observer')).toBe(3);
    expect(m.meritCap('Cacophony Savvy')).toBe(3);
    expect(m.meritCap('Safe Place')).toBe(5);
  });

  it('defaults to 5 for a merit absent from the caps map', async () => {
    const m = await freshCache();
    await m.loadOfficeContent();
    expect(m.meritCap('Some Unlisted Merit')).toBe(5);
  });
});
