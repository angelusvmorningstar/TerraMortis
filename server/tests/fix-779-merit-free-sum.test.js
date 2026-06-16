/**
 * fix #779 — meritFreeSum: per-slug map-wins stops PT double-count.
 *
 * ACs from story fix.779.contacts-pt-merit-free-sum.story.md:
 *   AC-2: both channels set for the same slug → map wins, no summing
 *   AC-3: legacy-only (pre-N-2) → correct, no regression
 *   AC-4: map-only (clean post-N-2) → correct, no regression
 *   AC-1: Keeper's exact DB state → 5 (was 7 before fix)
 *
 * Root cause: meritFreeSum previously summed Object.values(free_grants) AND
 * all free_<slug> legacy fields independently. The N-2 backfill wrote
 * free_pt → free_grants.pt; the PT evaluator's clear-and-rewrite pattern
 * then repopulated free_pt at next render, leaving both channels set → 2+2=4
 * PT dots instead of 2.
 */

import { describe, it, expect } from 'vitest';
import { meritFreeSum, freeOf } from '../../public/js/data/rules-helpers.js';

describe('fix-779 — meritFreeSum map-wins semantics', () => {

  // ── AC-2: same slug in both channels — map wins ───────────────────────────

  describe('AC-2: double-channel guard (the bug fix)', () => {
    it('returns map value when free_grants[slug] and free_<slug> both set (pt)', () => {
      // N-2 backfill wrote free_pt → free_grants.pt; PT evaluator re-set free_pt
      const m = { free_grants: { pt: 2 }, free_pt: 2 };
      expect(meritFreeSum(m)).toBe(2); // was 4 before fix
    });

    it('returns map value when free_grants[slug] and free_<slug> both set (mci)', () => {
      const m = { free_grants: { mci: 3 }, free_mci: 3 };
      expect(meritFreeSum(m)).toBe(3); // was 6 before fix
    });

    it('handles mixed: one slug in both channels, another only in map', () => {
      // pt: in both (map=2, legacy=2); mci: map only (=3)
      const m = { free_grants: { pt: 2, mci: 3 }, free_pt: 2 };
      expect(meritFreeSum(m)).toBe(5); // was 7 before fix
    });

    it('handles mixed: one slug in both channels, another only in legacy', () => {
      // pt: in both (map=2, legacy=2); ohm: legacy only (=1)
      const m = { free_grants: { pt: 2 }, free_pt: 2, free_ohm: 1 };
      expect(meritFreeSum(m)).toBe(3); // was 5 before fix
    });

    it('map value = 0 wins over legacy value (freeOf 0 != null → returns 0)', () => {
      // If map explicitly has 0, that is the correct engine-granted amount
      const m = { free_grants: { pt: 0 }, free_pt: 2 };
      expect(meritFreeSum(m)).toBe(0);
    });
  });

  // ── AC-3: legacy-only (pre-N-2, no map) — no regression ──────────────────

  describe('AC-3: legacy-only channel (pre-N-2 characters)', () => {
    it('sums legacy flat fields when free_grants is absent', () => {
      const m = { free_pt: 2, free_mci: 3 };
      expect(meritFreeSum(m)).toBe(5);
    });

    it('single legacy slug', () => {
      expect(meritFreeSum({ free_pt: 2 })).toBe(2);
    });

    it('all-zero legacy fields → 0', () => {
      const m = { free_pt: 0, free_mci: 0, free_ohm: 0 };
      expect(meritFreeSum(m)).toBe(0);
    });
  });

  // ── AC-4: map-only (post-N-2, clean) — no regression ─────────────────────

  describe('AC-4: map-only channel (clean post-N-2 characters)', () => {
    it('sums free_grants values when legacy fields are absent', () => {
      const m = { free_grants: { pt: 2, mci: 3 } };
      expect(meritFreeSum(m)).toBe(5);
    });

    it('single map slug', () => {
      expect(meritFreeSum({ free_grants: { pt: 2 } })).toBe(2);
    });

    it('legacy fields explicitly zeroed (post-clear) do not contribute', () => {
      const m = { free_grants: { pt: 2 }, free_pt: 0 };
      expect(meritFreeSum(m)).toBe(2);
    });
  });

  // ── AC-1: Keeper's exact DB state ─────────────────────────────────────────

  describe('AC-1: Keeper (Henry St. John) Contacts exact DB state', () => {
    it('returns 5 for Keeper Contacts (was 7 before fix)', () => {
      // Live DB state as of 2026-06-16:
      //   free_grants: { mci: 3, pt: 2 }  ← persisted by N-2 backfill
      //   free_pt: 2                        ← re-set by PT evaluator at render
      //   free_mci: 0                       ← no MCI issue
      const keeperContacts = {
        name: 'Contacts',
        category: 'influence',
        rating: 2,
        granted_by: 'PT',
        free_grants: { mci: 3, pt: 2 },
        free_pt: 2,
        free_mci: 0,
        free_ohm: 0,
        free_sw: 0,
        free_attache: 0,
        cp: 0,
        xp: 0,
        free: 0,
        free_vm: 0,
        free_lk: 0,
        free_inv: 0,
        free_mdb: 0,
        bonus: 0,
      };
      expect(meritFreeSum(keeperContacts)).toBe(5);
    });
  });

  // ── Guard: free (player-allocated) intentionally excluded ─────────────────

  describe('guard: m.free (player-allocated) is never included', () => {
    it('does not count m.free — player-allocated channel, excluded by design', () => {
      const m = { free: 3, free_grants: { pt: 2 } };
      expect(meritFreeSum(m)).toBe(2); // free excluded; only free_grants.pt counts
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('empty merit → 0', () => expect(meritFreeSum({})).toBe(0));
    it('null → 0', () => expect(meritFreeSum(null)).toBe(0));
    it('undefined → 0', () => expect(meritFreeSum(undefined)).toBe(0));
    it('empty free_grants map → 0', () => expect(meritFreeSum({ free_grants: {} })).toBe(0));
  });

  // ── Consistency with freeOf (reference impl) ──────────────────────────────

  describe('consistency with freeOf per-slug reads', () => {
    it('meritFreeSum total equals sum of freeOf for each slug present', () => {
      const m = { free_grants: { mci: 3, pt: 2 }, free_pt: 2, free_ohm: 1 };
      const manualSum = freeOf(m, 'mci') + freeOf(m, 'pt') + freeOf(m, 'ohm');
      expect(meritFreeSum(m)).toBe(manualSum);
    });
  });
});
