/**
 * Issue #811 — root-cause fix + cleanup script tests.
 *
 * Phase 1: server `sumChannels` in `server/lib/normalize-character.js` must
 * sum `m.free_grants` map values. Pre-fix it iterated only the 14 legacy
 * flat channels, so map-only merits returned sum=0 → triggered the
 * `if (sum === 0 && rating > 0)` backfill branch on every save → wrote
 * `m.free = rating` while leaving the map populated. Client union-read then
 * doubled the displayed dot count.
 *
 * Phase 2: `server/scripts/cleanup-free-channel-contamination.js` exposes a
 * pure `cleanupMerit(merit)` helper. Patterns:
 *   - A: m.free > 0 AND map populated → zero m.free
 *   - B: m.free_<slug> > 0 AND m.free_grants.<slug> > 0 → zero legacy flat
 *   - C: m.free > 0 alone (no map) → ambiguous, NOT cleaned
 *
 * Both phases ship together — fix-without-cleanup leaves stale data,
 * cleanup-without-fix gets re-polluted on next save.
 */

import { describe, it, expect } from 'vitest';
import { normalizeMerit } from '../lib/normalize-character.js';
import { cleanupMerit } from '../scripts/cleanup-free-channel-contamination.js';

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — sumChannels via normalizeMerit (sumChannels is private; assert
// via the public normalizer's observable behaviour)
// ─────────────────────────────────────────────────────────────────────────────

describe('#811 Phase 1 — normalizeMerit no longer backfills m.free when map is populated', () => {
  it('Yusuf-shape reproducer: map-only merit at rating > 0 → m.free stays 0', () => {
    // Pre-#811: sumChannels returned 0 (ignored map), branch fired, m.free=1.
    // Post-#811: sumChannels returns 1 (map summed), sum===rating, no backfill.
    const m = { name: 'Catacombs', category: 'domain', cp: 0, xp: 0, free: 0, free_grants: { necro: 1 }, rating: 1 };
    const r = normalizeMerit(m);
    expect(m.free).toBe(0);
    expect(m.free_grants.necro).toBe(1);
    // No backfill — either no change (sum === rating) or just a rating sync.
    expect(r.changed === false || r.reason === 'synced').toBe(true);
  });

  it('map-only Allies with free_grants.mci=3 at rating=3 → no m.free backfill', () => {
    const m = { name: 'Allies', category: 'influence', cp: 0, xp: 0, free_grants: { mci: 3 }, rating: 3 };
    normalizeMerit(m);
    expect(m.free || 0).toBe(0);
    expect(m.free_mci || 0).toBe(0); // backfill via granted_by would have written here
    expect(m.free_grants.mci).toBe(3);
  });

  it('legacy + map both populated: sumChannels returns total, no spurious backfill', () => {
    // Pattern B contaminated input arriving at the normalizer. The fix
    // means rating gets synced to the actual sum (4+3 = 7), but m.free
    // stays 0 — no backfill into legacy fields. Cleanup script handles
    // the pre-existing contamination separately.
    const m = { name: 'Mentor', category: 'general', cp: 0, xp: 0, free: 0, free_mci: 4, free_grants: { mci: 3 }, rating: 7 };
    const r = normalizeMerit(m);
    expect(m.free || 0).toBe(0);
    expect(r.changed === false || r.reason !== 'backfilled').toBe(true);
  });

  it('truly empty merit at rating > 0 + no granted_by → refuses to backfill (post-#834)', () => {
    // Pre-#834: would have backfilled m.free = rating via the 'free' fallback.
    // Post-#834 (m.free deprecated): returns 'no-channel' + warns; m.free stays 0.
    // See server/tests/issue-834-m-free-deprecation.test.js for the full
    // behavioural assertion; this is the contract change documented at the
    // older-test surface.
    const warnSpy = (() => {
      const calls = []; const orig = console.warn;
      console.warn = (...args) => calls.push(args);
      return { calls, restore: () => { console.warn = orig; } };
    })();
    try {
      const m = { name: 'Resources', category: 'influence', cp: 0, xp: 0, free: 0, rating: 2 };
      const r = normalizeMerit(m);
      expect(r.reason).toBe('no-channel');
      expect(m.free || 0).toBe(0);
      expect(warnSpy.calls.length).toBeGreaterThan(0);
    } finally {
      warnSpy.restore();
    }
  });

  it('granted_by Mentor with map-only data → no spurious free_mci backfill', () => {
    // Pre-#811: backfillChannel resolved 'Mentor' → 'free_mci' and wrote
    // m.free_mci = rating on top of the map. The fix prevents this.
    const m = { name: 'Allies', category: 'influence', granted_by: 'Mentor', cp: 0, xp: 0, free_grants: { mci: 2 }, rating: 2 };
    normalizeMerit(m);
    expect(m.free_mci || 0).toBe(0);
    expect(m.free_grants.mci).toBe(2);
  });

  it('rating gets synced when channels sum to a different total (regression — sync path still works)', () => {
    // Sanity: the rating-sync branch (sum !== rating) must still fire so
    // mis-rated merits get corrected. Pre and post-#811 behaviour the same.
    const m = { name: 'Library', category: 'domain', cp: 2, xp: 1, free_grants: { lk: 1 }, rating: 99 };
    const r = normalizeMerit(m);
    expect(m.rating).toBe(4); // 2 + 1 + 1
    expect(r.reason).toBe('synced');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — cleanupMerit helper
// ─────────────────────────────────────────────────────────────────────────────

describe('#811 Phase 2 — cleanupMerit removes Pattern A + Pattern B contamination', () => {
  it('Pattern A: m.free > 0 AND map populated → zeroes m.free, preserves map', () => {
    const m = { name: 'Catacombs', category: 'domain', free: 1, free_grants: { necro: 1 } };
    const r = cleanupMerit(m);
    expect(r).not.toBeNull();
    expect(m.free).toBe(0);
    expect(m.free_grants.necro).toBe(1);
    expect(r.changes[0].pattern).toBe('A');
    expect(r.changes[0].before).toBe(1);
  });

  it('Pattern B: m.free_<slug> > 0 AND m.free_grants.<slug> > 0 → zeroes legacy flat', () => {
    const m = { name: 'Allies', category: 'influence', free_mci: 3, free_grants: { mci: 3 } };
    const r = cleanupMerit(m);
    expect(r).not.toBeNull();
    expect(m.free_mci).toBe(0);
    expect(m.free_grants.mci).toBe(3);
    expect(r.changes[0].pattern).toBe('B');
    expect(r.changes[0].slug).toBe('mci');
  });

  it('Pattern A + B together: both legacy fields zeroed in one pass', () => {
    const m = { name: 'Mentor', category: 'general', free: 2, free_lk: 1, free_grants: { lk: 1, mci: 1 } };
    cleanupMerit(m);
    expect(m.free).toBe(0);
    expect(m.free_lk).toBe(0);
    expect(m.free_grants.lk).toBe(1);
    expect(m.free_grants.mci).toBe(1);
  });

  it('Pattern C (m.free alone, no map): NOT cleaned (ambiguous — possibly legitimate ST grant)', () => {
    const m = { name: 'Resources', category: 'influence', free: 2 };
    const r = cleanupMerit(m);
    expect(r).toBeNull();
    expect(m.free).toBe(2);
  });

  it('Pattern C variant: free_mci alone with no map → NOT cleaned (legitimate pre-N-1 data)', () => {
    const m = { name: 'Allies', category: 'influence', free_mci: 1 };
    const r = cleanupMerit(m);
    expect(r).toBeNull();
    expect(m.free_mci).toBe(1);
  });

  it('all zeros: NOT cleaned (no-op)', () => {
    const m = { name: 'Allies', category: 'influence', cp: 0, xp: 0, free: 0, free_grants: {} };
    const r = cleanupMerit(m);
    expect(r).toBeNull();
  });

  it('idempotent: re-cleaning a cleaned merit yields no further changes', () => {
    const m = { name: 'Catacombs', category: 'domain', free: 1, free_grants: { necro: 1 } };
    const r1 = cleanupMerit(m);
    expect(r1).not.toBeNull();
    const r2 = cleanupMerit(m);
    expect(r2).toBeNull();
  });

  it('bridges with normalizeMerit: cleanup then normalize leaves merit clean', () => {
    // End-to-end: contaminated merit → cleanup zeroes contamination →
    // normalize syncs rating against the now-clean map. No re-pollution.
    const m = { name: 'Allies', category: 'influence', cp: 0, xp: 0, free: 0, free_mci: 3, free_grants: { mci: 3 }, rating: 3 };
    cleanupMerit(m);
    expect(m.free_mci).toBe(0);
    expect(m.free_grants.mci).toBe(3);
    const r = normalizeMerit(m);
    expect(m.free || 0).toBe(0);
    expect(m.free_mci || 0).toBe(0);
    expect(m.free_grants.mci).toBe(3);
    expect(r.changed === false || r.reason === 'synced').toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Static-analysis sanity guards
// ─────────────────────────────────────────────────────────────────────────────

describe('#811 — placement sanity guards', () => {
  it('sumChannels source includes the free_grants map iteration', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const REPO_ROOT = path.resolve(__dirname, '..', '..');
    const src = fs.readFileSync(path.join(REPO_ROOT, 'server/lib/normalize-character.js'), 'utf8');
    // Anchor the assertion inside the sumChannels function body.
    const fnStart = src.indexOf('function sumChannels');
    const fnEnd = src.indexOf('}', src.indexOf('return s', fnStart));
    const body = src.slice(fnStart, fnEnd);
    expect(body).toMatch(/merit\.free_grants\s*&&\s*typeof merit\.free_grants\s*===\s*'object'/);
    expect(body).toMatch(/Object\.values\(merit\.free_grants\)/);
  });

  it('cleanup script exports cleanupMerit and main() is not auto-invoked on import', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const REPO_ROOT = path.resolve(__dirname, '..', '..');
    const src = fs.readFileSync(path.join(REPO_ROOT, 'server/scripts/cleanup-free-channel-contamination.js'), 'utf8');
    expect(src).toMatch(/export function cleanupMerit/);
    // Auto-invoke must be guarded by a direct-invocation check so vitest
    // import doesn't connect to Mongo.
    expect(src).toMatch(/import\.meta\.url\s*===\s*`file:\/\/\$\{process\.argv\[1\]\}`/);
  });
});
