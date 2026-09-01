/**
 * BL-4 (issue #1008) — `refetchBloodlines()` in the bloodlines cache.
 *
 * AC 9, 10, 14. BL-2 left `bloodlines-cache.js:38-40` saying in terms "No WS
 * refetch: there is no write path until BL-4". This is BL-4.
 *
 * The whole reason this has its own suite is that the OBVIOUS implementation
 * is a live defect. `refetchCatalogue()` in `equipment-catalogue-cache.js` is
 * two lines (null the in-flight promise, call the loader again) and copying it
 * here would be wrong, because `loadBloodlines()`'s failure path wipes
 * `_items`, sets `_loaded = false` and `_loadFailed = true`. The equipment
 * catalogue can afford that: it degrades to an empty dropdown. This degrades
 * to every bloodline character hard-locked in the editor and costed at 4
 * XP/dot, from one transient network blip, with a banner blaming the system.
 *
 * Module-level state is the thing under test, so each case re-imports the
 * module through `vi.resetModules()` rather than calling a test-only reset.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: null, calls: 0 }));
vi.mock('../../public/js/data/api.js', () => ({
  apiGet: async (...args) => { api.calls += 1; return api.get(...args); },
  apiBase: () => '',
  headers: () => ({}),
}));

const DOCS = [
  { _id: '1', name: 'Khaibit', slug: 'khaibit', clan: 'Mekhet', disciplines: ['Auspex', 'Celerity', 'Obfuscate', 'Vigour'] },
  { _id: '2', name: 'Zelani', slug: 'zelani', clan: 'Daeva', disciplines: ['Celerity', 'Majesty', 'Auspex', 'Vigour'] },
];

const DOCS_PLUS = [
  ...DOCS,
  { _id: '3', name: 'Hounds of Actaeon', slug: 'hounds-of-actaeon', clan: 'Gangrel', disciplines: ['Animalism', 'Auspex', 'Protean', 'Resilience'] },
];

async function freshCache(impl = async () => DOCS) {
  vi.resetModules();
  api.get = impl;
  api.calls = 0;
  return import('../../public/js/data/bloodlines-cache.js');
}

beforeEach(() => { api.calls = 0; });

describe('BL-4 AC 9 — refetchBloodlines re-indexes on success', () => {
  it('exists, because BL-4 is the write path BL-2 deferred it to', async () => {
    const m = await freshCache();
    expect(typeof m.refetchBloodlines).toBe('function');
  });

  it('picks up a newly created bloodline without a reload', async () => {
    const m = await freshCache();
    await m.loadBloodlines();
    expect(m.bloodlineDiscs('Hounds of Actaeon')).toBeNull();

    api.get = async () => DOCS_PLUS;
    await m.refetchBloodlines();
    expect(m.bloodlineDiscs('Hounds of Actaeon')).toEqual(['Animalism', 'Auspex', 'Protean', 'Resilience']);
    expect(m.approvedBloodlines()).toContain('Hounds of Actaeon');
    expect(m.bloodlinesByClan().Gangrel).toEqual(['Hounds of Actaeon']);
  });

  it('drops a deleted bloodline from the index', async () => {
    const m = await freshCache(async () => DOCS_PLUS);
    await m.loadBloodlines();
    api.get = async () => DOCS;
    await m.refetchBloodlines();
    expect(m.bloodlineDiscs('Hounds of Actaeon')).toBeNull();
  });

  it('reports success and does not share the boot load in-flight promise', async () => {
    const m = await freshCache();
    await m.loadBloodlines();
    expect(api.calls).toBe(1);
    await expect(m.refetchBloodlines()).resolves.toBe(true);
    expect(api.calls).toBe(2);
  });

  it('repairs a cache whose boot load failed', async () => {
    const m = await freshCache(async () => { throw new Error('boot blip'); });
    await m.loadBloodlines();
    expect(m.loadFailed()).toBe(true);
    expect(m.bloodlinesResolvable()).toBe(false);

    api.get = async () => DOCS;
    await m.refetchBloodlines();
    expect(m.loadFailed()).toBe(false);
    expect(m.isLoaded()).toBe(true);
    expect(m.bloodlinesResolvable()).toBe(true);
  });
});

describe('BL-4 AC 9 — a failed refetch must NOT destroy a working cache', () => {
  it('keeps the last good index when the fetch throws', async () => {
    const m = await freshCache();
    await m.loadBloodlines();
    api.get = async () => { throw new Error('network blip'); };

    await expect(m.refetchBloodlines()).resolves.toBe(false);

    // The whole point: one transient blip must not hard-lock every bloodline
    // character at 4 XP/dot behind a banner blaming the system.
    expect(m.isLoaded()).toBe(true);
    expect(m.loadFailed()).toBe(false);
    expect(m.bloodlinesResolvable()).toBe(true);
    expect(m.bloodlineDiscs('Khaibit')).toEqual(['Auspex', 'Celerity', 'Obfuscate', 'Vigour']);
    expect(m.approvedBloodlines()).toEqual(['Khaibit', 'Zelani']);
  });

  it('keeps the last good index when the payload is malformed', async () => {
    const m = await freshCache();
    await m.loadBloodlines();
    for (const bad of [null, { error: 'boom' }, 'nope']) {
      api.get = async () => bad;
      await expect(m.refetchBloodlines()).resolves.toBe(false);
      expect(m.bloodlineDiscs('Khaibit')).toHaveLength(4);
      expect(m.loadFailed()).toBe(false);
    }
  });

  it('logs the failure rather than swallowing it', async () => {
    const m = await freshCache();
    await m.loadBloodlines();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.get = async () => { throw new Error('network blip'); };
    await m.refetchBloodlines();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('an empty collection IS a legitimate answer and does replace the index', async () => {
    // Distinct from a failure: the seed being un-run, or the last bloodline
    // being deleted, is a real answer the cache must reflect. Only a FAILED
    // fetch preserves the old index.
    const m = await freshCache();
    await m.loadBloodlines();
    api.get = async () => [];
    await expect(m.refetchBloodlines()).resolves.toBe(true);
    expect(m.isEmpty()).toBe(true);
    expect(m.bloodlineDiscs('Khaibit')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Response ordering — added by this story's review
//
//  BL-4 justified not sharing `_inFlight` by asserting that boot priming is
//  awaited before `initWS` in both apps, so a load and a refetch cannot
//  overlap. That is true of `app.js` and false of `admin.js`, which calls
//  `init()` without awaiting it and opens the socket immediately. And two
//  refetches overlap on every ST write anyway: the screen refetches directly
//  AND the WS echo refetches. The cache was last-RESPONSE-wins; it is now
//  newest-STARTED-wins.
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-4 review — an older fetch may never overwrite a newer one', () => {
  /** A promise plus its resolve/reject, so response order is the test's choice. */
  function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }

  it('a boot load that RESOLVES after a refetch does not roll the cache back', async () => {
    const boot = deferred();
    const m = await freshCache(() => boot.promise);
    const loading = m.loadBloodlines();          // gen 1, still in flight

    api.get = async () => DOCS_PLUS;
    await m.refetchBloodlines();                 // gen 2, applied
    expect(m.bloodlineDiscs('Hounds of Actaeon')).toHaveLength(4);

    boot.resolve(DOCS);                          // gen 1 answers last, with the older collection
    await loading;
    expect(m.bloodlineDiscs('Hounds of Actaeon'), 'the stale boot load overwrote a newer refetch').toHaveLength(4);
    expect(m.approvedBloodlines()).toHaveLength(3);
  });

  it('a boot load that FAILS after a successful refetch does not wipe the cache', async () => {
    // The live failure mode: admin boot opens the WS before priming, a frame
    // fires a refetch that succeeds, then the boot fetch fails and its failure
    // path empties `_items` — hard-locking every bloodline character at 4
    // XP/dot behind a banner blaming the system.
    const boot = deferred();
    const m = await freshCache(() => boot.promise);
    const loading = m.loadBloodlines();

    api.get = async () => DOCS_PLUS;
    await m.refetchBloodlines();
    expect(m.bloodlinesResolvable()).toBe(true);

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    boot.reject(new Error('boot blip'));
    await loading;
    spy.mockRestore();

    expect(m.bloodlinesResolvable(), 'a superseded boot failure wiped the cache').toBe(true);
    expect(m.loadFailed()).toBe(false);
    expect(m.isLoaded()).toBe(true);
    expect(m.approvedBloodlines()).toHaveLength(3);
  });

  it('of two overlapping refetches, the one that STARTED last wins', async () => {
    const slow = deferred();
    const m = await freshCache();
    await m.loadBloodlines();

    api.get = () => slow.promise;
    const first = m.refetchBloodlines();          // gen 2, reads the older collection
    api.get = async () => DOCS_PLUS;
    await expect(m.refetchBloodlines()).resolves.toBe(true);   // gen 3, newer, lands first

    slow.resolve(DOCS);
    await expect(first, 'the superseded refetch reported success').resolves.toBe(false);
    expect(m.bloodlineDiscs('Hounds of Actaeon'), 'the older refetch rolled the cache back').toHaveLength(4);
  });
});

describe('BL-4 AC 10 — a miss the refetch resolves stops being reported', () => {
  it('clears an unknown-bloodline miss once the bloodline exists', async () => {
    // MISS_UNKNOWN survives a load by design, and clearBloodlineMissesFor only
    // fires from clanDiscList's success path — so without this, the banner
    // keeps naming a bloodline the ST has just created until that character
    // happens to re-render. A banner that keeps asserting a fixed problem is
    // how a warning stops being read.
    const m = await freshCache();
    await m.loadBloodlines();
    m.recordBloodlineMiss(m.MISS_UNKNOWN, 'Hounds of Actaeon', 'Ocka Keats');
    expect(m.getBloodlineMisses()).toHaveLength(1);

    api.get = async () => DOCS_PLUS;
    await m.refetchBloodlines();
    expect(m.getBloodlineMisses()).toEqual([]);
  });

  it('keeps an unknown-bloodline miss the refetch did NOT resolve', async () => {
    const m = await freshCache();
    await m.loadBloodlines();
    m.recordBloodlineMiss(m.MISS_UNKNOWN, 'Hounds of Actaeon', 'Ocka Keats');
    m.recordBloodlineMiss(m.MISS_UNKNOWN, 'Still Wrong', 'Cazz');

    api.get = async () => DOCS_PLUS;
    await m.refetchBloodlines();
    const rows = m.getBloodlineMisses();
    expect(rows).toHaveLength(1);
    expect(rows[0].bloodline).toBe('Still Wrong');
  });

  it('resolves a miss recorded under a case- or whitespace-differing name', async () => {
    const m = await freshCache();
    await m.loadBloodlines();
    m.recordBloodlineMiss(m.MISS_UNKNOWN, '  hounds of actaeon ', 'Ocka Keats');
    api.get = async () => DOCS_PLUS;
    await m.refetchBloodlines();
    expect(m.getBloodlineMisses()).toEqual([]);
  });

  it('clears the not-loaded and empty-collection rows once the refetch succeeds', async () => {
    const m = await freshCache(async () => []);
    await m.loadBloodlines();
    m.recordBloodlineMiss(m.MISS_NOT_LOADED, 'Khaibit', 'Doc');
    m.recordBloodlineMiss(m.MISS_EMPTY_COLLECTION, 'Khaibit', 'Doc');
    expect(m.getBloodlineMisses()).toHaveLength(2);

    api.get = async () => DOCS;
    await m.refetchBloodlines();
    expect(m.getBloodlineMisses()).toEqual([]);
  });

  it('notifies banner listeners when the refetch changes the registry', async () => {
    const m = await freshCache();
    await m.loadBloodlines();
    m.recordBloodlineMiss(m.MISS_UNKNOWN, 'Hounds of Actaeon', 'Ocka Keats');
    let fired = 0;
    m.onBloodlineMiss(() => { fired += 1; });

    api.get = async () => DOCS_PLUS;
    await m.refetchBloodlines();
    expect(fired).toBe(1);

    // A refetch that resolves nothing new must not fire the listener again,
    // or a WS storm would re-render the banner on every frame.
    await m.refetchBloodlines();
    expect(fired).toBe(1);
  });

  it('a failed refetch leaves the miss registry alone', async () => {
    const m = await freshCache();
    await m.loadBloodlines();
    m.recordBloodlineMiss(m.MISS_UNKNOWN, 'Hounds of Actaeon', 'Ocka Keats');
    api.get = async () => { throw new Error('blip'); };
    await m.refetchBloodlines();
    expect(m.getBloodlineMisses()).toHaveLength(1);
  });
});
