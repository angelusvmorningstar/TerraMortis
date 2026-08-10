/**
 * BL-2 (issue #1008) — the bloodlines cache module.
 *
 * AC 1, 2, 9. Structurally this follows `data/equipment-catalogue-cache.js`,
 * but its failure semantics deliberately differ: ECM degrades to an empty
 * dropdown, which is visible. This degrades to a wrong XP cost, which is not.
 * So the cache carries a miss registry the banner and the editor lock read.
 *
 * Every test re-imports the module through `vi.resetModules()` rather than
 * calling a test-only reset export. Module-level caches are the thing under
 * test; giving them a public reset just to test them would be a worse module.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: null, calls: 0 }));
vi.mock('../../public/js/data/api.js', () => ({
  apiGet: async (...args) => { api.calls += 1; return api.get(...args); },
}));

const DOCS = [
  { _id: '1', name: 'Khaibit', slug: 'khaibit', clan: 'Mekhet', disciplines: ['Auspex', 'Celerity', 'Obfuscate', 'Vigour'] },
  { _id: '2', name: 'Malkovians', slug: 'malkovians', clan: 'Ventrue', disciplines: ['Auspex', 'Dominate', 'Obfuscate', 'Resilience'] },
  { _id: '3', name: 'Zelani', slug: 'zelani', clan: 'Daeva', disciplines: ['Celerity', 'Majesty', 'Auspex', 'Vigour'] },
  { _id: '4', name: 'Ankou', slug: 'ankou', clan: 'Mekhet', disciplines: ['Auspex', 'Celerity', 'Obfuscate', 'Vigour'] },
];

async function freshCache(impl = async () => DOCS) {
  vi.resetModules();
  api.get = impl;
  api.calls = 0;
  return import('../../public/js/data/bloodlines-cache.js');
}

beforeEach(() => { api.calls = 0; });

// ─────────────────────────────────────────────────────────────────────────────
// Loading
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-2 — loadBloodlines', () => {
  it('is not loaded before the first call', async () => {
    const m = await freshCache();
    expect(m.isLoaded()).toBe(false);
    expect(m.loadFailed()).toBe(false);
  });

  it('fetches /api/bloodlines and marks the cache loaded', async () => {
    const m = await freshCache();
    const seen = [];
    api.get = async (path) => { seen.push(path); return DOCS; };
    await m.loadBloodlines();
    expect(seen).toEqual(['/api/bloodlines']);
    expect(m.isLoaded()).toBe(true);
    expect(m.loadFailed()).toBe(false);
  });

  it('is idempotent — concurrent callers share one in-flight fetch', async () => {
    const m = await freshCache();
    await Promise.all([m.loadBloodlines(), m.loadBloodlines(), m.loadBloodlines()]);
    expect(api.calls).toBe(1);
    expect(m.isLoaded()).toBe(true);
  });

  it('a failed load does not throw, does not mark loaded, and records the failure', async () => {
    // The caller is a boot sequence. Throwing here would take the whole app
    // down over a reference-data fetch; silently succeeding would be worse.
    const m = await freshCache(async () => { throw new Error('network down'); });
    await expect(m.loadBloodlines()).resolves.toBeUndefined();
    expect(m.isLoaded()).toBe(false);
    expect(m.loadFailed()).toBe(true);
    expect(m.bloodlineDiscs('Khaibit')).toBeNull();
  });

  it('a non-array payload is treated as a failed load, not an empty catalogue', async () => {
    // An empty array is a legitimate (if alarming) answer; `null` or an error
    // object is not, and must not read as "there are no bloodlines".
    const m = await freshCache(async () => null);
    await m.loadBloodlines();
    expect(m.isLoaded()).toBe(false);
    expect(m.loadFailed()).toBe(true);
  });

  it('an empty array loads successfully but resolves nothing', async () => {
    const m = await freshCache(async () => []);
    await m.loadBloodlines();
    expect(m.isLoaded()).toBe(true);
    expect(m.loadFailed()).toBe(false);
    expect(m.bloodlineDiscs('Khaibit')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Derived reads (AC 2)
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-2 — the three reads are derived from the one collection', () => {
  it('bloodlineDiscs returns the list by name, null when unknown', async () => {
    const m = await freshCache();
    await m.loadBloodlines();
    expect(m.bloodlineDiscs('Khaibit')).toEqual(['Auspex', 'Celerity', 'Obfuscate', 'Vigour']);
    expect(m.bloodlineDiscs('Nope')).toBeNull();
    expect(m.bloodlineDiscs(null)).toBeNull();
    expect(m.bloodlineDiscs('')).toBeNull();
  });

  it('bloodlineDiscs hands back a copy — a caller cannot mutate the cache', async () => {
    const m = await freshCache();
    await m.loadBloodlines();
    const first = m.bloodlineDiscs('Khaibit');
    first.push('Dominate');
    expect(m.bloodlineDiscs('Khaibit')).toHaveLength(4);
  });

  it('bloodlinesByClan derives the BLOODLINE_CLANS shape, sorted', async () => {
    const m = await freshCache();
    await m.loadBloodlines();
    expect(m.bloodlinesByClan()).toEqual({
      Daeva: ['Zelani'],
      Mekhet: ['Ankou', 'Khaibit'],
      Ventrue: ['Malkovians'],
    });
  });

  it('approvedBloodlines derives the sorted name list', async () => {
    const m = await freshCache();
    await m.loadBloodlines();
    expect(m.approvedBloodlines()).toEqual(['Ankou', 'Khaibit', 'Malkovians', 'Zelani']);
  });

  it('the derived reads are empty, not stale, before load', async () => {
    const m = await freshCache();
    expect(m.bloodlinesByClan()).toEqual({});
    expect(m.approvedBloodlines()).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The miss registry (AC 3, 4)
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-2 — the miss registry', () => {
  it('records an unknown-bloodline miss with the character and the value', async () => {
    const m = await freshCache();
    await m.loadBloodlines();
    m.recordBloodlineMiss(m.MISS_UNKNOWN, 'Hounds of Actaeon', 'Ocka Keats');
    expect(m.getBloodlineMisses()).toEqual([
      { reason: m.MISS_UNKNOWN, bloodline: 'Hounds of Actaeon', characters: ['Ocka Keats'] },
    ]);
  });

  it('groups multiple characters under one unresolved bloodline, without duplicates', async () => {
    const m = await freshCache();
    await m.loadBloodlines();
    m.recordBloodlineMiss(m.MISS_UNKNOWN, 'Nope', 'Cazz');
    m.recordBloodlineMiss(m.MISS_UNKNOWN, 'Nope', 'Ivana Horvat');
    m.recordBloodlineMiss(m.MISS_UNKNOWN, 'Nope', 'Cazz');
    const [miss] = m.getBloodlineMisses();
    expect(miss.characters).toEqual(['Cazz', 'Ivana Horvat']);
  });

  it('keeps the two miss causes separate — a system state is not a data state', async () => {
    const m = await freshCache();
    m.recordBloodlineMiss(m.MISS_NOT_LOADED, 'Khaibit', 'Doc');
    m.recordBloodlineMiss(m.MISS_UNKNOWN, 'Nope', 'Cazz');
    const reasons = m.getBloodlineMisses().map(x => x.reason).sort();
    expect(reasons).toEqual([m.MISS_NOT_LOADED, m.MISS_UNKNOWN].sort());
  });

  it('notifies listeners only when the registry actually changes', async () => {
    const m = await freshCache();
    await m.loadBloodlines();
    let fired = 0;
    const off = m.onBloodlineMiss(() => { fired += 1; });
    m.recordBloodlineMiss(m.MISS_UNKNOWN, 'Nope', 'Cazz');
    expect(fired).toBe(1);
    m.recordBloodlineMiss(m.MISS_UNKNOWN, 'Nope', 'Cazz');   // duplicate, no change
    expect(fired).toBe(1);
    m.recordBloodlineMiss(m.MISS_UNKNOWN, 'Nope', 'Ivana Horvat');
    expect(fired).toBe(2);
    off();
    m.recordBloodlineMiss(m.MISS_UNKNOWN, 'Other', 'Doc');
    expect(fired).toBe(2);
  });

  it('a successful load clears not-loaded misses but keeps unknown-bloodline ones', async () => {
    // The transient cause resolves itself; the data cause does not, and must
    // survive the load that proved it real.
    const m = await freshCache();
    m.recordBloodlineMiss(m.MISS_NOT_LOADED, 'Khaibit', 'Doc');
    m.recordBloodlineMiss(m.MISS_UNKNOWN, 'Nope', 'Cazz');
    await m.loadBloodlines();
    const reasons = m.getBloodlineMisses().map(x => x.reason);
    expect(reasons).toEqual([m.MISS_UNKNOWN]);
  });

  it('a listener that throws does not stop the others', async () => {
    const m = await freshCache();
    await m.loadBloodlines();
    let second = 0;
    m.onBloodlineMiss(() => { throw new Error('bad listener'); });
    m.onBloodlineMiss(() => { second += 1; });
    expect(() => m.recordBloodlineMiss(m.MISS_UNKNOWN, 'Nope', 'Cazz')).not.toThrow();
    expect(second).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WS refetch (BL-2 AC 1, converted by BL-4)
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-2 scope guard, converted by BL-4', () => {
  it('now exposes refetchBloodlines — BL-4 is the write path it was deferred to', async () => {
    // BL-2 asserted this was undefined, on the principle that an unused
    // listener is a claim the code makes and cannot keep. BL-4 made the claim
    // good. Its semantics (last-good-index preservation on failure, resolved
    // misses cleared on success) are covered in bl4-bloodlines-refetch.test.js.
    const m = await freshCache();
    expect(typeof m.refetchBloodlines).toBe('function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Review follow-ups (internal 3-layer review, 2026-08-10)
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-2 review — an empty collection is its own state, not 23 unknown bloodlines', () => {
  it('isEmpty is true after a successful load of zero documents', async () => {
    const m = await freshCache(async () => []);
    await m.loadBloodlines();
    expect(m.isLoaded()).toBe(true);
    expect(m.loadFailed()).toBe(false);
    expect(m.isEmpty()).toBe(true);
  });

  it('isEmpty is false before load and after a real load', async () => {
    const m = await freshCache();
    expect(m.isEmpty()).toBe(false);   // not loaded is not the same as empty
    await m.loadBloodlines();
    expect(m.isEmpty()).toBe(false);
  });
});

describe('BL-2 review — name matching tolerates case and whitespace', () => {
  it('resolves a differently-cased or padded name', async () => {
    const m = await freshCache();
    await m.loadBloodlines();
    for (const variant of ['Khaibit', 'khaibit', 'KHAIBIT', '  Khaibit  ']) {
      expect(m.bloodlineDiscs(variant), `"${variant}" should resolve`).toHaveLength(4);
    }
  });
});

describe('BL-2 review — a resolved-but-unusable document is a miss, not an empty grant', () => {
  it('treats an empty disciplines array as unresolved', async () => {
    const m = await freshCache(async () => [
      { _id: '9', name: 'Hollow', slug: 'hollow', clan: 'Mekhet', disciplines: [] },
    ]);
    await m.loadBloodlines();
    // Returning [] here would sail past the caller's null-check and lock the
    // character with no banner and no stated reason.
    expect(m.bloodlineDiscs('Hollow')).toBeNull();
  });

  it('treats a missing or non-array disciplines field as unresolved', async () => {
    const m = await freshCache(async () => [
      { _id: '9', name: 'Broken', slug: 'broken', clan: 'Mekhet' },
      { _id: '8', name: 'Worse', slug: 'worse', clan: 'Mekhet', disciplines: 'Auspex' },
    ]);
    await m.loadBloodlines();
    expect(m.bloodlineDiscs('Broken')).toBeNull();
    expect(m.bloodlineDiscs('Worse')).toBeNull();
  });
});

describe('BL-2 review — the registry self-corrects', () => {
  it('clearBloodlineMissesFor drops that character and removes the row when it empties', async () => {
    const m = await freshCache();
    await m.loadBloodlines();
    m.recordBloodlineMiss(m.MISS_UNKNOWN, 'Typo', 'Cazz');
    m.recordBloodlineMiss(m.MISS_UNKNOWN, 'Typo', 'Ivana Horvat');
    expect(m.getBloodlineMisses()[0].characters).toEqual(['Cazz', 'Ivana Horvat']);

    m.clearBloodlineMissesFor('Cazz');
    expect(m.getBloodlineMisses()[0].characters).toEqual(['Ivana Horvat']);

    m.clearBloodlineMissesFor('Ivana Horvat');
    expect(m.getBloodlineMisses()).toEqual([]);
  });

  it('notifies listeners when a clear changes the registry, and not when it does not', async () => {
    const m = await freshCache();
    await m.loadBloodlines();
    m.recordBloodlineMiss(m.MISS_UNKNOWN, 'Typo', 'Cazz');
    let fired = 0;
    m.onBloodlineMiss(() => { fired += 1; });
    m.clearBloodlineMissesFor('Nobody');
    expect(fired).toBe(0);
    m.clearBloodlineMissesFor('Cazz');
    expect(fired).toBe(1);
  });

  it('exposes no dead API — getBloodlines and hasBloodlineMiss were unused and are gone', async () => {
    // AC 1's own principle: an unused export is a claim the code cannot keep.
    const m = await freshCache();
    expect(m.getBloodlines).toBeUndefined();
    expect(m.hasBloodlineMiss).toBeUndefined();
  });
});

describe('BL-2 review — a global cause is ONE row, not one per bloodline', () => {
  it('collapses not-loaded and empty-collection misses across every bloodline', async () => {
    // Found by running against the real roster: keying these on the bloodline
    // value produced 13 rows repeating the same sentence, one per distinct
    // bloodline. The cause is one fact about the system.
    const m = await freshCache();
    m.recordBloodlineMiss(m.MISS_NOT_LOADED, 'Khaibit', 'Doc');
    m.recordBloodlineMiss(m.MISS_NOT_LOADED, 'Zelani', 'Cazz');
    m.recordBloodlineMiss(m.MISS_NOT_LOADED, 'Ankou', 'Mac');
    const rows = m.getBloodlineMisses();
    expect(rows).toHaveLength(1);
    expect(rows[0].characters).toEqual(['Cazz', 'Doc', 'Mac']);
    expect(rows[0].bloodline).toBeNull();
  });

  it('still keeps one row per unknown bloodline — there the value IS the problem', async () => {
    const m = await freshCache();
    await m.loadBloodlines();
    m.recordBloodlineMiss(m.MISS_UNKNOWN, 'Typo One', 'Cazz');
    m.recordBloodlineMiss(m.MISS_UNKNOWN, 'Typo Two', 'Mac');
    expect(m.getBloodlineMisses()).toHaveLength(2);
  });
});
